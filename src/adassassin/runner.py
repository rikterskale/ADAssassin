"""Thin observe-only wrapper over ADAF-ATTACK execute_capability."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from adassassin.catalog import catalog_payload
from adassassin.config import Settings
from adassassin.engagements import get_engagement, save_engagement
from adassassin.engine import capability_detail, lane_for
from adassassin.findings import normalize_finding
from adassassin.secrets import resolve_bind_secret
from adassassin.targets import has_successful_connect


class RunRefused(Exception):
    """Operator-facing refusal (maps to HTTP 403 / 409)."""

    def __init__(self, message: str, *, status_code: int = 403) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


PHASE5_REFUSAL = (
    "Capability '{capability_id}' is lane={lane} risk={risk}. "
    "Destructive and side-effect runs are Phase 5 (typed confirm). "
    "Phase 2 only allows green/yellow observe capabilities."
)


def _now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _catalog_entry(capability_id: str) -> dict[str, Any] | None:
    detail = capability_detail(capability_id)
    if detail is not None:
        return detail
    for item in catalog_payload().get("capabilities", []):
        if item.get("id") == capability_id:
            return item
    return None


def assert_observe_allowed(capability_id: str, engagement: dict[str, Any]) -> dict[str, Any]:
    """Refuse red / non-observe; require successful connect for yellow."""
    entry = _catalog_entry(capability_id)
    if entry is None:
        raise RunRefused(f"Unknown capability: {capability_id}", status_code=404)

    risk = str(entry.get("risk") or "observe")
    environment = str(entry.get("environment") or "unknown")
    lane = str(entry.get("lane") or lane_for(risk, environment))

    if lane == "red" or risk != "observe":
        raise RunRefused(
            PHASE5_REFUSAL.format(capability_id=capability_id, lane=lane, risk=risk),
            status_code=403,
        )

    if lane == "yellow" and not has_successful_connect(engagement):
        raise RunRefused(
            "Yellow observe runs require a successful connect/preflight on this engagement first.",
            status_code=409,
        )

    return entry


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
    """Map console options onto execute_capability kwargs / -P style params."""
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
    }
    kwargs: dict[str, Any] = {}
    for key, value in options.items():
        if key in reserved or value is None or value == "":
            continue
        kwargs[key] = value
    return kwargs


def execute_observe(
    settings: Settings,
    engagement_id: str,
    *,
    capability_id: str,
    options: dict[str, Any] | None = None,
    ack: bool = False,
) -> dict[str, Any]:
    """Gate, run an observe capability, attach findings, return job payload."""
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")

    options = dict(options or {})
    entry = assert_observe_allowed(capability_id, item)
    target = _target_for_run(item, options, entry)
    runner_kwargs = _runner_kwargs(options)

    job_id = uuid4().hex[:12]
    log_messages: list[str] = []

    def _log(message: str) -> None:
        log_messages.append(message)

    workspace = settings.data_dir / "workspaces" / engagement_id
    workspace.mkdir(parents=True, exist_ok=True)

    engine_result: dict[str, Any] | None = None
    error: str | None = None
    status = "completed"
    findings: list[dict[str, Any]] = []

    try:
        from adaf_attack.core.runner import RunError, execute_capability

        engine_result = execute_capability(
            capability_id,
            target,
            force=False,
            acknowledged=bool(ack),
            json_mode=True,
            include_secrets=False,
            workspace=workspace,
            log=_log,
            **runner_kwargs,
        )
        findings = _extract_findings(engine_result, capability_id=capability_id)
        if entry.get("lane") == "yellow":
            item["target_contacted"] = True
    except RunRefused:
        raise
    except Exception as exc:  # RunError or engine failure
        status = "failed"
        error = str(exc)
        _log(f"run failed: {exc}")

    job = {
        "id": job_id,
        "capability_id": capability_id,
        "lane": entry.get("lane"),
        "risk": entry.get("risk"),
        "status": status,
        "created_at": _now(),
        "log": _build_log(log_messages, engine_result, error),
        "findings": findings,
        "error": error,
        "session_id": (engine_result or {}).get("session_id"),
        "session_path": (engine_result or {}).get("session_path"),
        "result": (engine_result or {}).get("result"),
        "outcome": (engine_result or {}).get("outcome"),
        "next_actions": [],
    }

    if status == "completed":
        try:
            from adaf_attack.core.novice import beginner_next_actions
            from adaf_attack.core.registry import capability_registry, load_builtin_capabilities

            load_builtin_capabilities()
            cap = capability_registry.get(capability_id)
            if cap is not None:
                job["next_actions"] = beginner_next_actions(cap)
        except Exception:
            job["next_actions"] = []

        existing_ids = {f.get("id") for f in item.get("findings") or []}
        merged = list(item.get("findings") or [])
        for finding in findings:
            if finding["id"] not in existing_ids:
                merged.append(finding)
                existing_ids.add(finding["id"])
        item["findings"] = merged
        marked = list(item.get("guided_marked") or [])
        if "observe-run" not in marked:
            marked.append("observe-run")
        item["guided_marked"] = marked

    jobs = list(item.get("jobs") or [])
    jobs.insert(0, job)
    item["jobs"] = jobs[:50]
    saved = save_engagement(settings, item)
    return {"job": job, "engagement": saved}
