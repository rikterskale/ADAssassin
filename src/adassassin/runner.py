"""Thin wrapper over ADAF-ATTACK execute_capability (observe + typed-confirm RED).

Runs execute on a background thread so the HTTP request returns immediately with
a "running" job. Live progress (status + streamed log) is held in an in-memory
registry and exposed through GET /jobs/{id}; the final job is also persisted
onto the engagement. Gating (ack/force/typed-confirm/connect) is enforced
synchronously before the thread starts, so refusals still map to 403/409.
"""

from __future__ import annotations

import re
from threading import Lock, Thread
from typing import Any
from uuid import uuid4

from adassassin.catalog import catalog_payload
from adassassin.config import Settings
from adassassin.engagements import _IO_LOCK, get_engagement, save_engagement
from adassassin.engine import capability_detail, lane_for
from adassassin.findings import normalize_finding
from adassassin.secrets import resolve_bind_secret
from adassassin.storage import ensure_private_dir
from adassassin.targets import (
    TargetError,
    directory_port,
    has_successful_connect,
    normalize_directory_transport,
    normalize_target,
)

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


def get_live_job(engagement_id: str, job_id: str) -> dict[str, Any] | None:
    """Return a serialization-safe snapshot of a live/terminal job, or None."""
    with _LIVE_LOCK:
        job = _LIVE_JOBS.get(job_id)
        if job is None or job.get("engagement_id") != engagement_id:
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


def _supports_anonymous(entry: dict[str, Any]) -> bool:
    return any(str(mode).strip().lower() == "anonymous" for mode in entry.get("auth_modes") or [])


def _has_target_credentials(options: dict[str, Any]) -> bool:
    for key in ("username", "password", "hashes", "ccache", "aes_key"):
        value = options.get(key)
        if value is not None and (not isinstance(value, str) or value != ""):
            return True
    return _as_bool(options.get("kerberos") or options.get("use_kerberos"))


def _assert_anonymous_run(entry: dict[str, Any], options: dict[str, Any]) -> None:
    if not _supports_anonymous(entry):
        raise RunRefused(
            f"Capability '{entry.get('id')}' is not declared anonymous by the pinned engine. "
            "Choose an anonymous capability, run a GREEN offline capability, or return to Connect "
            "and select authenticated mode.",
            status_code=403,
        )
    if _has_target_credentials(options):
        raise RunRefused(
            "Anonymous connection mode cannot accept username, password, hashes, Kerberos, "
            "ccache, or AES-key target credentials.",
            status_code=403,
        )


def _risk_label(risk: str) -> str:
    if risk == "side_effect":
        return "side effect"
    if risk == "destructive":
        return "destructive"
    return risk


def _transport_from_options(options: dict[str, Any], *, default: str = "ldap") -> str:
    """Resolve legacy transport flags without allowing contradictory values."""
    try:
        selected = normalize_directory_transport(str(options.get("transport") or default))
    except TargetError as exc:
        raise RunRefused(str(exc), status_code=422) from exc

    if "ldaps" in options or "starttls" in options:
        ldaps = _as_bool(options.get("ldaps"))
        starttls = _as_bool(options.get("starttls"))
        if ldaps and starttls:
            raise RunRefused("Choose LDAPS or StartTLS, not both.", status_code=422)
        flagged = "ldaps" if ldaps else "starttls" if starttls else "ldap"
        if "transport" in options and flagged != selected:
            raise RunRefused(
                "Directory transport conflicts with the LDAPS/StartTLS options.",
                status_code=422,
            )
        selected = flagged
    return selected


def _assert_transport_matches_preflight(
    connect: dict[str, Any], options: dict[str, Any]
) -> tuple[str, int]:
    try:
        approved_transport = normalize_directory_transport(
            str(connect.get("transport") or "ldap")
        )
    except TargetError as exc:
        raise RunRefused(
            "The saved directory transport is invalid. Return to Connect and run preflight again.",
            status_code=409,
        ) from exc
    approved_port = directory_port(approved_transport)
    try:
        stored_port = int(connect.get("ldap_port") or approved_port)
    except (TypeError, ValueError) as exc:
        raise RunRefused(
            "The saved LDAP port is invalid. Return to Connect and run preflight again.",
            status_code=409,
        ) from exc
    if stored_port != approved_port:
        raise RunRefused(
            "The saved directory transport and port do not match. Return to Connect and run preflight again.",
            status_code=409,
        )

    if "transport" in options or "ldaps" in options or "starttls" in options:
        requested_transport = _transport_from_options(options, default=approved_transport)
        if requested_transport != approved_transport:
            raise RunRefused(
                "The requested directory transport does not match this engagement's current preflight. "
                "Return to Connect and preflight the exact transport before running.",
                status_code=409,
            )
    if "ldap_port" in options:
        try:
            requested_port = int(options["ldap_port"])
        except (TypeError, ValueError) as exc:
            raise RunRefused("LDAP port must be an integer.", status_code=422) from exc
        if requested_port != approved_port:
            raise RunRefused(
                "The requested LDAP port does not match this engagement's current preflight. "
                "Return to Connect and preflight the exact transport before running.",
                status_code=409,
            )
    return approved_transport, approved_port


def assert_run_allowed(
    capability_id: str,
    engagement: dict[str, Any],
    *,
    ack: bool = False,
    force: bool = False,
    confirm: str = "",
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Gate observe and typed-confirm RED runs."""
    entry = _catalog_entry(capability_id)
    if entry is None:
        raise RunRefused(f"Unknown capability: {capability_id}", status_code=404)

    if engagement.get("archived"):
        raise RunRefused(
            "Archived engagements are execution-locked. Restore this engagement before running a capability.",
            status_code=409,
        )

    risk = str(entry.get("risk") or "observe")
    environment = str(entry.get("environment") or "unknown")
    lane = str(entry.get("lane") or lane_for(risk, environment))
    entry = {**entry, "lane": lane, "risk": risk}
    options = options or {}

    if engagement.get("mode") == "demo" and lane != "green":
        raise RunRefused(
            "Offline demo engagements may run GREEN capabilities only. "
            "Create a live-ready engagement for target-interacting work.",
            status_code=403,
        )

    if lane != "green":
        connect = engagement.get("connect") or {}
        if connect.get("auth_mode") == "anonymous":
            _assert_anonymous_run(entry, options)
        elif _has_target_credentials(options):
            raise RunRefused(
                "Live target credentials must be validated in Connect. Remove username, password, "
                "hashes, Kerberos, ccache, and AES-key overrides from the run options, then use the "
                "preflight-validated in-memory credential.",
                status_code=409,
            )
        _assert_transport_matches_preflight(connect, options)
        approved = normalize_target(
            str(connect.get("domain") or ""), str(connect.get("dc") or "")
        )
        requested = normalize_target(
            str(options.get("domain") or approved[0]),
            str(options.get("dc") or options.get("dc_ip") or approved[1]),
        )
        if requested != approved:
            raise RunRefused(
                "The requested domain/DC does not match this engagement's current preflight. "
                "Return to Connect and preflight the exact target before running.",
                status_code=409,
            )

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


def _redact_runtime_error(exc: Exception, target: Any) -> str:
    """Return a single-line engine error with runtime credentials removed."""
    message = str(exc).replace("\r", " ").replace("\n", " ").strip()
    secret_values: set[str] = set()
    for attribute in ("password", "hashes", "aes_key"):
        secret = getattr(target, attribute, None)
        if isinstance(secret, str) and secret:
            secret_values.add(secret)
            if attribute == "hashes":
                secret_values.update(part for part in secret.split(":") if len(part) >= 8)
    for secret in sorted(secret_values, key=len, reverse=True):
        message = message.replace(secret, "***")
    return message[:4000] or exc.__class__.__name__


def _is_credential_failure(message: str) -> bool:
    normalized = message.lower()
    return any(
        marker in normalized
        for marker in (
            "ldap bind failed",
            "all credentials failed ldap bind",
            "credential resolution failed",
        )
    )


def _credential_auth_label(target: Any) -> str:
    if getattr(target, "ccache", None):
        return "Kerberos credential cache"
    if getattr(target, "aes_key", None):
        return "Kerberos AES key"
    if getattr(target, "hashes", None):
        return "NTLM hash"
    if getattr(target, "password", None):
        return "password"
    if getattr(target, "username", None):
        return "username without a staged secret"
    return "no credential"


def _credential_failure_actions(auth_label: str) -> list[dict[str, str]]:
    return [
        {
            "id": "credential-stop-retries",
            "message": (
                "Stop repeated retries. Check the account lockout threshold and current bad-password "
                "count through the approved identity-administration channel before another attempt."
            ),
        },
        {
            "id": "credential-check-identity",
            "message": (
                "Confirm that the connected domain and domain controller are the authorized target, "
                "then enter the intended principal as DOMAIN\\user or user@domain."
            ),
        },
        {
            "id": "credential-check-account",
            "message": (
                "Verify through the approved credential or identity source that the account is enabled, "
                "unlocked, unexpired, and permitted to authenticate; confirm that the current secret or "
                "ticket belongs to that principal."
            ),
        },
        {
            "id": "credential-check-format",
            "message": (
                f"Validate the {auth_label} input: remove accidental password whitespace; use a bare NT "
                "hash or LM:NT pair for hash authentication; for Kerberos, confirm the cache or AES key "
                "matches the principal and realm and is not expired."
            ),
        },
        {
            "id": "credential-check-policy",
            "message": (
                "Confirm that the selected LDAP, StartTLS, or LDAPS transport and directory policy permit "
                "the chosen method. Check NTLM restrictions, LDAP signing/channel binding, TLS trust, and "
                "Kerberos DNS, time synchronization, SPN, and realm configuration as applicable."
            ),
        },
        {
            "id": "credential-retry-once",
            "message": (
                "Correct the credential in Connect, rerun the complete preflight, and "
                "retry once. If it fails again, stop and escalate to the engagement or identity owner to "
                "avoid an account lockout."
            ),
        },
    ]


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _prompt_key(prompt: dict[str, Any]) -> str:
    if prompt.get("key"):
        return str(prompt["key"])
    if prompt.get("is_param") and prompt.get("param_key"):
        return str(prompt["param_key"])
    return str(prompt.get("option") or "").removeprefix("--").replace("-", "_")


def _validate_and_coerce_options(
    entry: dict[str, Any], options: dict[str, Any]
) -> dict[str, Any]:
    cleaned = dict(options)
    for prompt in entry.get("required_prompts") or []:
        if not isinstance(prompt, dict) or prompt.get("source") in {
            "engagement_target",
            "safety_gate",
        }:
            continue
        key = _prompt_key(prompt)
        value = cleaned.get(key)
        missing_string = isinstance(value, str) and (
            value == "" if prompt.get("trim") is False else not value.strip()
        )
        if prompt.get("required", True) and (value is None or missing_string):
            raise RunRefused(
                f"Required input missing: {prompt.get('label') or key} ({key}).",
                status_code=422,
            )
        if value is None:
            continue
        if isinstance(value, str) and prompt.get("trim") is not False:
            cleaned[key] = value.strip()
        input_type = str(prompt.get("input_type") or "text")
        if input_type == "boolean":
            if isinstance(value, bool):
                cleaned[key] = value
            elif isinstance(value, str) and value.strip().lower() in {
                "1",
                "true",
                "yes",
                "on",
            }:
                cleaned[key] = True
            elif isinstance(value, str) and value.strip().lower() in {
                "0",
                "false",
                "no",
                "off",
            }:
                cleaned[key] = False
            else:
                raise RunRefused(
                    f"{prompt.get('label') or key} must be true or false.",
                    status_code=422,
                )
        elif input_type == "integer":
            try:
                cleaned[key] = int(value)
            except (TypeError, ValueError) as exc:
                raise RunRefused(f"{prompt.get('label') or key} must be an integer.", status_code=422) from exc
        choices = list(prompt.get("choices") or [])
        if choices and cleaned.get(key) not in choices:
            raise RunRefused(
                f"{prompt.get('label') or key} must be one of: {', '.join(map(str, choices))}.",
                status_code=422,
            )
        pattern = str(prompt.get("pattern") or "")
        if pattern and isinstance(cleaned.get(key), str):
            try:
                matches = re.fullmatch(pattern, str(cleaned[key])) is not None
            except re.error as exc:
                raise RunRefused(
                    f"The validation rule for {prompt.get('label') or key} is invalid.",
                    status_code=500,
                ) from exc
            if not matches:
                guidance = prompt.get("pattern_help") or "The value has an invalid format."
                raise RunRefused(
                    f"{prompt.get('label') or key}: {guidance}",
                    status_code=422,
                )
    return cleaned


def _target_for_run(engagement: dict[str, Any], options: dict[str, Any], entry: dict[str, Any]):
    from adaf_attack.core.target import Target

    connect = engagement.get("connect") or {}
    live_target = entry.get("lane") != "green"
    domain = str(
        (connect.get("domain") if live_target else options.get("domain"))
        or engagement.get("domain")
        or ""
    ).strip()
    dc = str(
        (connect.get("dc") if live_target else options.get("dc") or options.get("dc_ip"))
        or engagement.get("dc")
        or ""
    ).strip()
    username = str(
        options.get("username") or connect.get("username") or engagement.get("username") or ""
    ).strip() or None

    if live_target:
        transport, ldap_port = _assert_transport_matches_preflight(connect, options)
    else:
        transport = _transport_from_options(options)
        ldap_port = directory_port(transport)

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

    anonymous = live_target and connect.get("auth_mode") == "anonymous"
    if anonymous:
        username = None
        password = None
        hashes = None

    return Target(
        domain=domain,
        dc_ip=dc,
        username=username,
        password=password if password else None,
        hashes=hashes if hashes else None,
        use_kerberos=(
            False
            if anonymous
            else _as_bool(options.get("kerberos") or options.get("use_kerberos"))
        ),
        ldaps=transport == "ldaps",
        starttls=transport == "starttls",
        port=ldap_port,
        ccache=None if anonymous else options.get("ccache"),
        aes_key=None if anonymous else options.get("aes_key"),
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
        "transport",
        "ldap_port",
        "ccache",
        "aes_key",
        "ack",
        "force",
        "confirm",
        "approval_token",
        "approval_engagement_id",
    }
    kwargs: dict[str, Any] = {}
    for key, value in options.items():
        if key in reserved or value is None or value == "":
            continue
        kwargs[key] = value
    return kwargs


def _redact_options(options: dict[str, Any]) -> dict[str, Any]:
    redacted: dict[str, Any] = {}
    sensitive_names = {
        "password",
        "hash",
        "hashes",
        "nthash",
        "aes_key",
        "secret",
        "ticket",
        "token",
        "vault_key",
    }
    for key, value in options.items():
        normalized = key.lower()
        if normalized in sensitive_names or any(
            normalized.endswith(f"_{name}") for name in sensitive_names
        ):
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
    approval_token: str | None,
    approval_engagement_id: str | None,
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
    failure_category: str | None = None
    next_actions: list[dict[str, Any]] = []

    try:
        from adaf_attack.core.runner import execute_capability

        engine_result = execute_capability(
            capability_id,
            target,
            force=bool(red),
            acknowledged=bool(ack) if red else True,
            approval_token=approval_token,
            approval_engagement_id=approval_engagement_id,
            json_mode=True,
            include_secrets=False,
            workspace=workspace,
            log=_log,
            **runner_kwargs,
        )
        findings = _extract_findings(engine_result, capability_id=capability_id)
    except Exception as exc:
        # Preserve useful engine context while ensuring runtime credentials do
        # not enter the job log or persisted error field.
        status = "failed"
        error = _redact_runtime_error(exc, target)
        if _is_credential_failure(error):
            failure_category = "credential"
            auth_label = _credential_auth_label(target)
            _log("failure category: credential authentication")
            if auth_label == "no credential":
                _log(
                    "connect preflight: anonymous mode supplied no credential; the engine reported "
                    "an authentication failure at runtime"
                )
            else:
                _log(
                    "connect preflight: credential was accepted before queueing; runtime "
                    "authentication failed or the credential state changed"
                )
            _log(f"authentication method: {auth_label}")
            _log(f"engine detail: {error}")
            next_actions = _credential_failure_actions(auth_label)
            for index, action in enumerate(next_actions, start=1):
                _log(f"remediation {index}: {action['message']}")
        else:
            _log(f"run failed: {error}")

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
        job["failure_category"] = failure_category
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
    approval_token: str | None = None,
    approval_engagement_id: str | None = None,
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
        options=options,
    )
    red = _is_red(entry)
    readiness = entry.get("readiness") or {}
    if not bool(readiness.get("ready", entry.get("runnable", False))):
        raise RunRefused(
            f"Capability '{capability_id}' is not locally ready: "
            f"{readiness.get('reason') or 'engine runner or declared dependency unavailable'}.",
            status_code=409,
        )
    options = _validate_and_coerce_options(entry, options)
    scoped_approval = str(entry.get("approval") or "") == "scoped_token"
    if scoped_approval and (not approval_token or not approval_engagement_id):
        raise RunRefused(
            f"Capability '{capability_id}' requires a scoped approval token and approval engagement ID.",
            status_code=403,
        )
    target = _target_for_run(item, options, entry)
    runner_kwargs = _runner_kwargs(options)

    job_id = uuid4().hex[:12]
    job: dict[str, Any] = {
        "id": job_id,
        "engagement_id": engagement_id,
        "capability_id": capability_id,
        "lane": entry.get("lane"),
        "risk": entry.get("risk"),
        "status": "running",
        "created_at": _now(),
        "log": [f"queued {capability_id}"],
        "findings": [],
        "error": None,
        "failure_category": None,
        "session_id": None,
        "session_path": None,
        "result": None,
        "outcome": None,
        "next_actions": [],
        "red": red,
        "target": {
            "domain": target.domain,
            "dc": target.dc_ip,
            "transport": "ldaps" if target.ldaps else "starttls" if target.starttls else "ldap",
            "ldap_port": target.port,
        },
    }
    # Record the RED authorization and the queued job synchronously so the audit
    # trail and job list reflect the run even before the engine finishes.
    with _IO_LOCK:
        item = get_engagement(settings, engagement_id)
        if item is None:
            raise LookupError("Engagement not found")
        # Recheck mutable safety state under the same lock used to persist the
        # queued job. An archive, target edit, expiry, or reconnect between the
        # initial request check and this point must stop execution.
        assert_run_allowed(
            capability_id,
            item,
            ack=ack,
            force=force,
            confirm=confirm,
            options=options,
        )
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
                    "approval": entry.get("approval"),
                    "scoped_approval_submitted": scoped_approval,
                }
            )
            item["red_ack_audit"] = audit[-100:]
        jobs = list(item.get("jobs") or [])
        jobs.insert(0, _job_snapshot(job))
        item["jobs"] = jobs[:50]
        saved = save_engagement(settings, item)
    _publish_live(job)

    workspace = ensure_private_dir(settings.data_dir / "workspaces" / engagement_id)

    worker_kwargs = {
        "capability_id": capability_id,
        "target": target,
        "runner_kwargs": runner_kwargs,
        "red": red,
        "ack": ack,
        "approval_token": approval_token,
        "approval_engagement_id": approval_engagement_id,
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
    final = get_live_job(engagement_id, job_id) or _job_snapshot(job)
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
