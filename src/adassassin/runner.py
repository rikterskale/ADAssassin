"""Thin wrapper over ADAF-ATTACK execute_capability (observe + typed-confirm RED).

Runs execute on a background thread so the HTTP request returns immediately with
a "running" job. Live progress (status + streamed log) is held in an in-memory
registry and exposed through GET /jobs/{id}; the final job is also persisted
onto the engagement. Gating (ack/force/typed-confirm/connect) is enforced
synchronously before the thread starts, so refusals still map to 403/409.
"""

from __future__ import annotations

from threading import Lock, Thread
from typing import Any
from uuid import uuid4

from adassassin.catalog import catalog_payload
from adassassin.config import Settings
from adassassin.engagements import _IO_LOCK, get_engagement, save_engagement
from adassassin.engine import capability_detail, lane_for
from adassassin.findings import normalize_finding
from adassassin.secrets import resolve_bind_secret
from adassassin.targets import has_successful_connect

# In-memory live-job registry: job_id -> job dict (mutated by the worker thread).
_LIVE_LOCK = Lock()
_LIVE_JOBS: dict[str, dict[str, Any]] = {}
# Cap the registry so a long-lived process cannot grow it without bound.
_LIVE_MAX = 200


class RunRefused(Exception):
    """Operator-facing refusal (maps to HTTP 403 / 409)."""

    def __init__(self, message: str, *, status_code: int = 403) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _job_snapshot(job: dict[str, Any]) -> dict[str, Any]:
    """Return a copy safe to serialize while the worker mutates the original."""
    with _LIVE_LOCK:
        snap = dict(job)
        snap["log"] = list(job.get("log") or [])
        snap["findings"] = list(job.get("findings") or [])
        snap["next_actions"] = list(job.get("next_actions") or [])
        return snap


def _publish_live(job: dict[str, Any]) -> None:
    with _LIVE_LOCK:
        _LIVE_JOBS[job["id"]] = job
        if len(_LIVE_JOBS) > _LIVE_MAX:
            # Drop the oldest terminal jobs first; keep anything still running.
            for key in list(_LIVE_JOBS):
                if len(_LIVE_JOBS) <= _LIVE_MAX:
                    break
                if _LIVE_JOBS[key].get("status") != "running":
                    del _LIVE_JOBS[key]


def get_live_job(job_id: str) -> dict[str, Any] | None:
    """Return a serialization-safe snapshot of a live/terminal job, or None."""
    with _LIVE_LOCK:
        job = _LIVE_JOBS.get(job_id)
        if job is None:
            return None
        snap = dict(job)
        snap["log"] = list(job.get("log") or [])
        snap["findings"] = list(job.get("findings") or [])
        snap["next_actions"] = list(job.get("next_actions") or [])
        return snap


def _catalog_entry(capability_id: str) -> dict[str, Any] | None:
    detail = capability_detail(capability_id)
    if detail is not None:
        return detail
    for item in catalog_payload().get("capabilities", []):
        if item.get("id") == capability_id:
            return item
    return None


def _is_red(entry: dict[str, Any]) -> bool:
    risk = str(entry.get("risk") or "observe")
    lane = str(entry.get("lane") or "")
    return lane == "red" or risk in {"destructive", "side_effect"}


def _risk_label(risk: str) -> str:
    if risk == "side_effect":
        return "side effect"
    if risk == "destructive":
        return "destructive"
    return risk


def assert_run_allowed(
    capability_id: str,
    engagement: dict[str, Any],
    *,
    ack: bool = False,
    force: bool = False,
    confirm: str = "",
) -> dict[str, Any]:
    """Gate observe and typed-confirm RED runs."""
    entry = _catalog_entry(capability_id)
    if entry is None:
        raise RunRefused(f"Unknown capability: {capability_id}", status_code=404)

    risk = str(entry.get("risk") or "observe")
    environment = str(entry.get("environment") or "unknown")
    lane = str(entry.get("lane") or lane_for(risk, environment))
    entry = {**entry, "lane": lane, "risk": risk}

    if _is_red(entry):
        label = _risk_label(risk)
        if not ack or not force:
            raise RunRefused(
                f"Capability '{capability_id}' is {label} and requires explicit ack and force "
                f"plus typed confirmation of the capability id.",
                status_code=403,
            )
        if (confirm or "").strip() != capability_id:
            raise RunRefused(
                f"Type the capability id '{capability_id}' to confirm this {label} run.",
                status_code=403,
            )
        if not has_successful_connect(engagement):
            raise RunRefused(
                "RED runs require a successful connect/preflight on this engagement first.",
                status_code=409,
            )
        return entry

    if risk != "observe":
        raise RunRefused(
            f"Capability '{capability_id}' risk={risk} is not allowed without RED confirmation.",
            status_code=403,
        )

    if lane == "yellow" and not has_successful_connect(engagement):
        raise RunRefused(
            "Yellow observe runs require a successful connect/preflight on this engagement first.",
            status_code=409,
        )
    return entry


# Backward-compatible name used by older tests/imports.
def assert_observe_allowed(capability_id: str, engagement: dict[str, Any]) -> dict[str, Any]:
    return assert_run_allowed(capability_id, engagement, ack=False, force=False, confirm="")


def _extract_findings(engine_result: dict[str, Any], *, capability_id: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    nested = engine_result.get("result") if isinstance(engine_result, dict) else None
    candidates: list[Any] = []
    if isinstance(nested, dict):
        raw = nested.get("findings")
        if isinstance(raw, list):
            candidates.extend(raw)
    session_path = engine_result.get("session_path") if isinstance(engine_result, dict) else None
    if session_path:
        try:
            from pathlib import Path

            from adaf_attack.core.findings import findings_from_session

            for item in findings_from_session(Path(session_path)):
                candidates.append(item.document() if hasattr(item, "document") else item)
        except Exception:
            pass

    seen: set[str] = set()
    for raw in candidates:
        if not isinstance(raw, dict):
            continue
        finding_id = str(raw.get("id") or f"{capability_id}-{uuid4().hex[:8]}")
        if finding_id in seen:
            continue
        seen.add(finding_id)
        findings.append(
            normalize_finding(
                {
                    **raw,
                    "id": finding_id,
                    "title": str(raw.get("title") or capability_id),
                    "severity": str(raw.get("severity") or "info"),
                    "source": capability_id,
                    "source_capability": str(raw.get("source_capability") or capability_id),
                    "summary": str(
                        raw.get("impact")
                        or raw.get("summary")
                        or raw.get("remediation")
                        or f"Finding from {capability_id}"
                    ),
                    "status": raw.get("status") or "open",
                }
            )
        )
    return findings


def _build_log(messages: list[str], engine_result: dict[str, Any] | None, error: str | None) -> list[str]:
    lines = list(messages)
    if engine_result:
        lines.append(f"ok={engine_result.get('ok')}")
        if engine_result.get("session_id"):
            lines.append(f"session={engine_result['session_id']}")
        if engine_result.get("auth"):
            lines.append(f"auth={engine_result['auth']}")
        outcome = engine_result.get("outcome")
        if isinstance(outcome, dict):
            lines.append(f"outcome.status={outcome.get('status')}")
        nested = engine_result.get("result")
        if isinstance(nested, dict) and nested.get("error"):
            lines.append(f"result.error={nested['error']}")
    if error:
        lines.append(f"error={error}")
    return lines


def _target_for_run(engagement: dict[str, Any], options: dict[str, Any], entry: dict[str, Any]):
    from adaf_attack.core.target import Target

    connect = engagement.get("connect") or {}
    domain = str(options.get("domain") or connect.get("domain") or engagement.get("domain") or "").strip()
    dc = str(
        options.get("dc")
        or options.get("dc_ip")
        or connect.get("dc")
        or engagement.get("dc")
        or ""
    ).strip()
    username = str(
        options.get("username") or connect.get("username") or engagement.get("username") or ""
    ).strip() or None

    lane = entry.get("lane")
    if lane == "green" and (not domain or not dc):
        domain = domain or "offline.local"
        dc = dc or "127.0.0.1"

    if not domain or not dc:
        raise RunRefused(
            "Domain and DC are required for this capability. Connect a target or pass them in options.",
            status_code=409,
        )

    secret = resolve_bind_secret(engagement["id"], connect.get("secret_ref"))
    password = options.get("password") or secret.get("password")
    hashes = options.get("hashes") or secret.get("hashes")

    return Target(
        domain=domain,
        dc_ip=dc,
        username=username,
        password=password if password else None,
        hashes=hashes if hashes else None,
        use_kerberos=bool(options.get("kerberos") or options.get("use_kerberos")),
        ldaps=bool(options.get("ldaps")),
        starttls=bool(options.get("starttls")),
        ccache=options.get("ccache"),
        aes_key=options.get("aes_key"),
    )


def _runner_kwargs(options: dict[str, Any]) -> dict[str, Any]:
    reserved = {
        "domain",
        "dc",
        "dc_ip",
        "username",
        "password",
        "hashes",
        "kerberos",
        "use_kerberos",
        "ldaps",
        "starttls",
        "ccache",
        "aes_key",
        "ack",
        "force",
        "confirm",
    }
    kwargs: dict[str, Any] = {}
    for key, value in options.items():
        if key in reserved or value is None or value == "":
            continue
        kwargs[key] = value
    return kwargs


def _redact_options(options: dict[str, Any]) -> dict[str, Any]:
    redacted: dict[str, Any] = {}
    for key, value in options.items():
        if key.lower() in {"password", "hashes", "aes_key", "secret", "ticket"}:
            redacted[key] = "***"
        else:
            redacted[key] = value
    return redacted


def _run_worker(
    settings: Settings,
    engagement_id: str,
    *,
    capability_id: str,
    target: Any,
    runner_kwargs: dict[str, Any],
    red: bool,
    ack: bool,
    entry: dict[str, Any],
    job: dict[str, Any],
    workspace,
) -> None:
    """Execute the engine capability and fold the result back into the engagement."""

    def _log(message: str) -> None:
        with _LIVE_LOCK:
            job["log"].append(str(message))

    engine_result: dict[str, Any] | None = None
    error: str | None = None
    status = "completed"
    findings: list[dict[str, Any]] = []

    try:
        from adaf_attack.core.runner import execute_capability

        engine_result = execute_capability(
            capability_id,
            target,
            force=bool(red),
            acknowledged=bool(ack) if red else True,
            json_mode=True,
            include_secrets=False,
            workspace=workspace,
            log=_log,
            **runner_kwargs,
        )
        findings = _extract_findings(engine_result, capability_id=capability_id)
    except Exception as exc:
        # Surface engine PolicyError / RunError text verbatim.
        status = "failed"
        error = str(exc)
        _log(f"run failed: {exc}")

    next_actions: list[dict[str, Any]] = []
    if status == "completed":
        try:
            from adaf_attack.core.novice import beginner_next_actions
            from adaf_attack.core.registry import capability_registry, load_builtin_capabilities

            load_builtin_capabilities()
            cap = capability_registry.get(capability_id)
            if cap is not None:
                next_actions = beginner_next_actions(cap)
        except Exception:
            next_actions = []

    with _LIVE_LOCK:
        raw_log = list(job["log"])
    final_log = _build_log(raw_log, engine_result, error)

    with _LIVE_LOCK:
        job["status"] = status
        job["log"] = final_log
        job["findings"] = findings
        job["error"] = error
        job["session_id"] = (engine_result or {}).get("session_id")
        job["session_path"] = (engine_result or {}).get("session_path")
        job["result"] = (engine_result or {}).get("result")
        job["outcome"] = (engine_result or {}).get("outcome")
        job["next_actions"] = next_actions
        job["finished_at"] = _now()

    snapshot = _job_snapshot(job)

    with _IO_LOCK:
        item = get_engagement(settings, engagement_id)
        if item is None:
            return
        jobs = [j for j in (item.get("jobs") or []) if j.get("id") != job["id"]]
        jobs.insert(0, snapshot)
        item["jobs"] = jobs[:50]
        if status == "completed":
            if entry.get("lane") in {"yellow", "red"} or red:
                item["target_contacted"] = True
            existing_ids = {f.get("id") for f in item.get("findings") or []}
            merged = list(item.get("findings") or [])
            for finding in findings:
                if finding["id"] not in existing_ids:
                    merged.append(finding)
                    existing_ids.add(finding["id"])
            item["findings"] = merged
            marked = list(item.get("guided_marked") or [])
            step = "red-run" if red else "observe-run"
            if step not in marked:
                marked.append(step)
            item["guided_marked"] = marked
        save_engagement(settings, item)


def execute_run(
    settings: Settings,
    engagement_id: str,
    *,
    capability_id: str,
    options: dict[str, Any] | None = None,
    ack: bool = False,
    force: bool = False,
    confirm: str = "",
    actor: str = "operator",
    background: bool = True,
) -> dict[str, Any]:
    """Gate and start a capability run. RED requires ack + force + typed id.

    Returns immediately with a "running" job; progress is available from the
    live registry / GET /jobs/{id}. Pass background=False to run inline (used by
    the backward-compatible observe entrypoint and callers that want a completed
    job synchronously).
    """
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")

    options = dict(options or {})
    entry = assert_run_allowed(
        capability_id,
        item,
        ack=ack,
        force=force,
        confirm=confirm,
    )
    red = _is_red(entry)
    target = _target_for_run(item, options, entry)
    runner_kwargs = _runner_kwargs(options)

    job_id = uuid4().hex[:12]
    job: dict[str, Any] = {
        "id": job_id,
        "capability_id": capability_id,
        "lane": entry.get("lane"),
        "risk": entry.get("risk"),
        "status": "running",
        "created_at": _now(),
        "log": [f"queued {capability_id}"],
        "findings": [],
        "error": None,
        "session_id": None,
        "session_path": None,
        "result": None,
        "outcome": None,
        "next_actions": [],
        "red": red,
    }
    _publish_live(job)

    # Record the RED authorization and the queued job synchronously so the audit
    # trail and job list reflect the run even before the engine finishes.
    with _IO_LOCK:
        item = get_engagement(settings, engagement_id)
        if item is None:
            raise LookupError("Engagement not found")
        if red:
            audit = list(item.get("red_ack_audit") or [])
            audit.append(
                {
                    "id": uuid4().hex[:10],
                    "actor": actor,
                    "timestamp": _now(),
                    "capability_id": capability_id,
                    "risk": entry.get("risk"),
                    "lane": entry.get("lane"),
                    "force": True,
                    "ack": True,
                    "confirm": capability_id,
                    "options": _redact_options(options),
                    "rollback": entry.get("rollback"),
                }
            )
            item["red_ack_audit"] = audit[-100:]
        jobs = list(item.get("jobs") or [])
        jobs.insert(0, _job_snapshot(job))
        item["jobs"] = jobs[:50]
        saved = save_engagement(settings, item)

    workspace = settings.data_dir / "workspaces" / engagement_id
    workspace.mkdir(parents=True, exist_ok=True)

    worker_kwargs = {
        "capability_id": capability_id,
        "target": target,
        "runner_kwargs": runner_kwargs,
        "red": red,
        "ack": ack,
        "entry": entry,
        "job": job,
        "workspace": workspace,
    }

    if background:
        Thread(
            target=_run_worker,
            args=(settings, engagement_id),
            kwargs=worker_kwargs,
            name=f"run-{job_id}",
            daemon=True,
        ).start()
        return {"job": _job_snapshot(job), "engagement": saved}

    # Inline execution: run to completion, then return the persisted job.
    _run_worker(settings, engagement_id, **worker_kwargs)
    final = get_live_job(job_id) or _job_snapshot(job)
    return {"job": final, "engagement": get_engagement(settings, engagement_id) or saved}


def execute_observe(
    settings: Settings,
    engagement_id: str,
    *,
    capability_id: str,
    options: dict[str, Any] | None = None,
    ack: bool = False,
) -> dict[str, Any]:
    """Backward-compatible observe entrypoint (runs inline to completion)."""
    return execute_run(
        settings,
        engagement_id,
        capability_id=capability_id,
        options=options,
        ack=ack,
        force=False,
        confirm="",
        background=False,
    )
