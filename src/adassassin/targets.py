"""Engagement target connect / preflight. Wraps engine live-ad checks."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from adassassin.config import Settings
from adassassin.engagements import get_engagement, update_engagement
from adassassin.secrets import clear_bind_secret, has_bind_secret, put_bind_secret


class TargetError(ValueError):
    """Invalid or incomplete target fields."""


DIRECTORY_TRANSPORT_PORTS = {
    "ldap": 389,
    "starttls": 389,
    "ldaps": 636,
}
AUTH_MODES = {"anonymous", "authenticated"}
CREDENTIAL_CHECK_ID = "credential-bind"


def _now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def _stamp(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def normalize_target(domain: str, dc: str) -> tuple[str, str]:
    """Normalize a target tuple for exact preflight/run comparisons."""
    return (domain or "").strip().rstrip(".").lower(), (dc or "").strip().rstrip(".").lower()


def normalize_directory_transport(transport: str) -> str:
    """Return one supported directory transport or reject the target configuration."""
    value = (transport or "ldap").strip().lower()
    if value not in DIRECTORY_TRANSPORT_PORTS:
        choices = ", ".join(DIRECTORY_TRANSPORT_PORTS)
        raise TargetError(f"Unsupported directory transport {transport!r}; choose from {choices}.")
    return value


def directory_port(transport: str) -> int:
    """Return the standard port honored by the pinned engine for a transport."""
    return DIRECTORY_TRANSPORT_PORTS[normalize_directory_transport(transport)]


def validate_bind_credential(
    *,
    domain: str,
    dc: str,
    transport: str,
    username: str,
    password: str | None = None,
    hashes: str | None = None,
) -> bool:
    """Ask the pinned engine to make exactly one LDAP bind probe."""
    from adaf_attack.core.runner import _probe_ldap
    from adaf_attack.core.target import Target

    normalized_transport = normalize_directory_transport(transport)
    target = Target(
        domain=domain,
        dc_ip=dc,
        username=username,
        password=password,
        hashes=hashes,
        ldaps=normalized_transport == "ldaps",
        starttls=normalized_transport == "starttls",
        port=directory_port(normalized_transport),
    )
    return bool(_probe_ldap(target))


def _credential_remediation(method: str) -> list[str]:
    method_instruction = (
        "For a password, re-enter it without accidental leading or trailing whitespace."
        if method == "password"
        else "For NTLM, use the approved bare NT hash or LM:NT pair for the intended account."
    )
    return [
        (
            "Stop repeated attempts. Before retrying, use the approved identity-administration "
            "channel to check the account lockout threshold and current bad-password count."
        ),
        (
            "Confirm that the Connect domain and domain controller are the authorized target, then "
            "confirm the principal is entered as DOMAIN\\user or user@domain for that environment."
        ),
        (
            "Verify through the approved identity or secret source that the account is enabled, "
            "unlocked, unexpired, and permitted to authenticate, and that the credential is current."
        ),
        method_instruction,
        (
            "Confirm that the selected LDAP, StartTLS, or LDAPS transport matches directory policy. "
            "Check NTLM restrictions, LDAP signing/channel binding, TLS trust, DNS, and time "
            "synchronization as applicable."
        ),
        (
            "Correct the credential in Connect, rerun preflight, retry once, and stop/escalate to the "
            "engagement or identity owner if it fails again to avoid an account lockout."
        ),
    ]


def normalize_connection_target(
    domain: str, dc: str, transport: str = "ldap"
) -> tuple[str, str, str, int]:
    """Normalize the complete preflight-bound directory endpoint."""
    normalized_domain, normalized_dc = normalize_target(domain, dc)
    normalized_transport = normalize_directory_transport(transport)
    return (
        normalized_domain,
        normalized_dc,
        normalized_transport,
        directory_port(normalized_transport),
    )


def _stored_port_matches(value: Any, expected: int) -> bool:
    if value in {None, ""}:
        return True
    try:
        return int(value) == expected
    except (TypeError, ValueError):
        return False


def validate_target_fields(*, domain: str, dc: str) -> tuple[str, str]:
    domain = (domain or "").strip().rstrip(".")
    dc = (dc or "").strip().rstrip(".")
    missing = [name for name, value in (("domain", domain), ("dc", dc)) if not value]
    if missing:
        raise TargetError("Target is missing: " + ", ".join(missing))
    return domain, dc


def normalize_auth_mode(
    auth_mode: str | None,
    *,
    username: str = "",
    password: str | None = None,
    hashes: str | None = None,
) -> str:
    """Resolve an explicit connection authentication mode and fail closed."""
    value = (auth_mode or "").strip().lower()
    if not value:
        value = "authenticated" if username or password or hashes else "anonymous"
    if value not in AUTH_MODES:
        raise TargetError("Authentication mode must be 'anonymous' or 'authenticated'.")
    if value == "anonymous" and (username or password or hashes):
        raise TargetError(
            "Anonymous mode cannot include a username, password, or NTLM hashes. "
            "Choose authenticated mode to supply domain credentials."
        )
    return value


def run_preflight(
    *, domain: str, dc: str, transport: str = "ldap", timeout: float = 3.0
) -> dict[str, Any]:
    """Wrap ADAF-ATTACK live-ad doctor. Contacts DNS and DC ports; does not run a capability.

    Behavior note for ``target_contacted``: when domain and dc are both supplied,
    the engine probes TCP ports on the DC (dns/kerberos/ldap/smb). Those probes
    count as speaking to the DC even when every probe fails. ADAssassin also
    makes the selected directory endpoint a blocking check because the pinned
    engine doctor always treats its fixed LDAP/389 probe as advisory. A
    preflight that never reaches that branch (missing fields) does not contact
    the DC.
    """
    from adaf_attack.cli import _doctor_payload, _socket_check

    transport = normalize_directory_transport(transport)
    ldap_port = directory_port(transport)
    payload = _doctor_payload("live-ad", domain=domain, dc_ip=dc, timeout=timeout)
    doctor_ldap = next(
        (check for check in payload.get("checks", []) if check.get("id") == "dc-ldap"),
        None,
    )
    live_checks = [
        check
        for check in payload.get("checks", [])
        if check.get("id") != "dc-ldap"
        and (
            check.get("scope") == "live-ad"
            or str(check.get("id", "")).startswith("dc-")
            or check.get("id") in {"target-arguments", "domain-dns"}
        )
    ]
    if transport == "ldaps":
        transport_status, transport_detail = _socket_check(dc, ldap_port, timeout)
    elif doctor_ldap is not None:
        transport_status = str(doctor_ldap.get("status") or "warning")
        transport_detail = doctor_ldap.get("value")
    else:
        # Test doubles and older compatible engine payloads may omit the
        # individual LDAP check. Their aggregate readiness remains authoritative.
        transport_status = "ok" if payload.get("ready") else "warning"
        transport_detail = None
    transport_check_id = {
        "ldap": "dc-ldap",
        "starttls": "dc-ldap-starttls",
        "ldaps": "dc-ldaps",
    }[transport]
    transport_ready = transport_status == "ok"
    transport_remediation = (
        None
        if transport_ready
        else (
            f"Verify the authorized DC address and firewall for {transport} "
            f"({dc}:{ldap_port}), then run Connect again."
        )
    )
    live_checks.append(
        {
            "id": transport_check_id,
            "status": "ok" if transport_ready else "error",
            "severity": "blocking",
            "scope": "live-ad",
            "value": f"{dc}:{ldap_port}" if transport_ready else transport_detail,
            "remediation": transport_remediation,
        }
    )

    blocking_checks = [
        check_id
        for check_id in list(payload.get("blocking_checks") or [])
        if check_id != "dc-ldap"
    ]
    advisory_checks = [
        check_id
        for check_id in list(payload.get("advisory_checks") or [])
        if check_id != "dc-ldap"
    ]
    if not transport_ready and transport_check_id not in blocking_checks:
        blocking_checks.append(transport_check_id)

    # Socket probes run only when both domain and dc were provided.
    contacted = bool(domain and dc)
    ready = bool(payload.get("ready")) and transport_ready
    return {
        # ``ok`` means the doctor completed; ``ready`` is the execution gate.
        "ok": bool(payload.get("ok")),
        "ready": ready,
        "network_status": "reachable" if ready else "blocked",
        "profile": payload.get("profile", "live-ad"),
        "domain": domain,
        "dc": dc,
        "transport": transport,
        "ldap_port": ldap_port,
        "blocking_checks": blocking_checks,
        "advisory_checks": advisory_checks,
        "next_step": transport_remediation or payload.get("next_step"),
        "checks": live_checks,
        "target_contacted": contacted,
        "contacts_directory": contacted,
    }


def connect_engagement(
    settings: Settings,
    engagement_id: str,
    *,
    domain: str,
    dc: str,
    transport: str = "ldap",
    auth_mode: str | None = None,
    username: str = "",
    password: str | None = None,
    hashes: str | None = None,
    timeout: float = 3.0,
) -> dict[str, Any]:
    """Validate reachability and one authenticated bind, then persist non-secret state."""
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")
    if item.get("mode") == "demo":
        raise TargetError(
            "Offline demo engagements cannot contact a directory. Create a live-ready engagement first."
        )
    if item.get("archived"):
        raise TargetError("Archived engagements are execution-locked. Restore this engagement first.")
    if any(job.get("status") == "running" for job in item.get("jobs") or []):
        raise TargetError(
            "This engagement has a running capability. Review it before starting a new preflight."
        )

    domain, dc = validate_target_fields(domain=domain, dc=dc)
    transport = normalize_directory_transport(transport)
    ldap_port = directory_port(transport)
    username = (username or "").strip()

    if password and hashes:
        raise TargetError("Choose one bind method: password or NTLM hashes, not both.")
    auth_mode = normalize_auth_mode(
        auth_mode,
        username=username,
        password=password,
        hashes=hashes,
    )
    if auth_mode == "authenticated" and not username:
        raise TargetError("Authenticated mode requires a bind username.")
    if auth_mode == "authenticated" and not (password or hashes):
        raise TargetError(
            "Authenticated mode requires one bind credential: password or NTLM hashes."
        )

    # Revoke the old assertion before starting a new check. If the preflight
    # process itself errors, a previous target approval must not remain usable.
    def _begin(current: dict[str, Any]) -> None:
        if current.get("mode") == "demo":
            raise TargetError(
                "Offline demo engagements cannot contact a directory. Create a live-ready engagement first."
            )
        if current.get("archived"):
            raise TargetError("Archived engagements are execution-locked. Restore this engagement first.")
        if any(job.get("status") == "running" for job in current.get("jobs") or []):
            raise TargetError(
                "This engagement has a running capability. Review it before starting a new preflight."
            )
        invalidate_connection(current, "A new Connect preflight started. Wait for its result.")

    update_engagement(settings, engagement_id, _begin)
    clear_bind_secret(engagement_id)

    try:
        preflight = run_preflight(
            domain=domain,
            dc=dc,
            transport=transport,
            timeout=timeout,
        )
    except Exception as exc:
        raise TargetError(
            f"Preflight could not complete: {exc}. Any previous target approval was revoked; "
            "correct the error and run Connect again."
        ) from exc
    method = "anonymous" if auth_mode == "anonymous" else "password" if password else "ntlm_hash"
    credential_validation: dict[str, Any] = {
        "required": auth_mode == "authenticated",
        "attempted": False,
        "valid": None,
        "method": method,
    }
    credential_log = [
        (
            "Credential gate: not applicable because anonymous mode was selected."
            if auth_mode == "anonymous"
            else "Credential gate: authenticated mode requires one successful LDAP bind."
        )
    ]
    credential_remediation: list[str] = []

    if auth_mode == "authenticated":
        if preflight["ready"]:
            credential_validation["attempted"] = True
            credential_log.extend(
                [
                    "Network gate: passed for the selected directory endpoint.",
                    (
                        f"Attempt: one {method.replace('_', ' ')} LDAP bind through the pinned "
                        f"engine over {transport.upper()}:{ldap_port}."
                    ),
                    "Principal: supplied bind username (value omitted from this log).",
                    "Secret handling: credential value redacted; automatic retries disabled.",
                ]
            )
            try:
                credential_valid = validate_bind_credential(
                    domain=domain,
                    dc=dc,
                    transport=transport,
                    username=username,
                    password=password,
                    hashes=hashes,
                )
                probe_error = False
            except Exception:
                # The pinned probe normally converts bind errors to False. Keep
                # unexpected implementation details out of persisted logs too.
                credential_valid = False
                probe_error = True
            credential_validation["valid"] = credential_valid
            credential_log.append(
                "Result: credential accepted; eligible for memory-only staging."
                if credential_valid
                else (
                    "Result: engine credential probe could not complete; internal detail suppressed."
                    if probe_error
                    else (
                        "Result: the engine did not establish an authenticated bind; the probe does "
                        "not distinguish secret rejection from account, transport, or directory-policy "
                        "failure."
                    )
                )
            )
        else:
            credential_valid = False
            credential_log.extend(
                [
                    "Network gate: blocked for the selected directory endpoint.",
                    "Attempt: skipped; no credential was sent because network preflight did not pass.",
                    "Secret handling: credential value redacted and not staged.",
                ]
            )

        if not credential_valid:
            credential_remediation = _credential_remediation(method)
            if CREDENTIAL_CHECK_ID not in preflight["blocking_checks"]:
                preflight["blocking_checks"].append(CREDENTIAL_CHECK_ID)
            preflight["next_step"] = (
                "Stop retries and complete the ordered credential remediation steps before "
                "running Connect again."
            )
        preflight["checks"].append(
            {
                "id": CREDENTIAL_CHECK_ID,
                "status": "ok" if credential_valid else "error",
                "severity": "blocking",
                "scope": "live-ad",
                "value": (
                    f"accepted ({method.replace('_', ' ')})"
                    if credential_valid
                    else (
                        "authenticated bind not established"
                        if credential_validation["attempted"]
                        else "not attempted because the network gate failed"
                    )
                ),
                "remediation": (
                    None
                    if credential_valid
                    else "Follow the ordered credential remediation steps and retry at most once."
                ),
            }
        )
        preflight["ready"] = bool(preflight["ready"] and credential_valid)

    preflight["credential_validation"] = credential_validation
    preflight["credential_log"] = credential_log
    preflight["credential_remediation"] = credential_remediation
    checked_at = _now()
    expires_at = checked_at + timedelta(seconds=max(30, settings.preflight_ttl_seconds))
    ready = bool(preflight["ready"])
    secret_ref = (
        put_bind_secret(engagement_id, password=password, hashes=hashes)
        if ready and (password or hashes)
        else None
    )

    def _apply(current: dict[str, Any]) -> None:
        if current.get("mode") == "demo":
            raise TargetError(
                "Offline demo engagements cannot contact a directory. Create a live-ready engagement first."
            )
        if current.get("archived"):
            raise TargetError("Archived engagements are execution-locked. Restore this engagement first.")
        current["domain"] = domain
        current["dc"] = dc
        current["username"] = username
        if preflight["target_contacted"]:
            current["target_contacted"] = True
        current["connect"] = {
            "domain": domain,
            "dc": dc,
            "transport": transport,
            "ldap_port": ldap_port,
            "auth_mode": auth_mode,
            "username": username,
            "credential_validation": credential_validation,
            "credential_log": credential_log,
            "credential_remediation": credential_remediation,
            "secret_ref": secret_ref,
            "has_secret": bool(secret_ref),
            "preflight_ok": ready,
            "status": "ready" if ready else "blocked",
            "checked_at": _stamp(checked_at),
            "expires_at": _stamp(expires_at),
            "invalidated_reason": None,
            "target": {
                "domain": domain,
                "dc": dc,
                "transport": transport,
                "ldap_port": ldap_port,
            },
            "preflight": {
                "ok": preflight["ok"],
                "ready": preflight["ready"],
                "network_status": preflight["network_status"],
                "transport": transport,
                "ldap_port": ldap_port,
                "blocking_checks": preflight["blocking_checks"],
                "advisory_checks": preflight["advisory_checks"],
                "next_step": preflight["next_step"],
                "checks": preflight["checks"],
                "target_contacted": preflight["target_contacted"],
                "credential_validation": credential_validation,
                "credential_log": credential_log,
                "credential_remediation": credential_remediation,
            },
        }
        if ready:
            marked = list(current.get("guided_marked") or [])
            if "connect" not in marked:
                marked.append("connect")
            current["guided_marked"] = marked

    try:
        saved = update_engagement(settings, engagement_id, _apply)
    except Exception:
        # An archive/metadata race must not leave staged credentials behind.
        clear_bind_secret(engagement_id)
        raise
    return {"engagement": saved, "preflight": preflight}


def has_successful_connect(engagement: dict[str, Any]) -> bool:
    connect = engagement.get("connect") or {}
    auth_mode = str(connect.get("auth_mode") or "authenticated")
    if auth_mode not in AUTH_MODES:
        return False
    if not connect.get("preflight_ok") or connect.get("status") not in {None, "ready"}:
        return False
    if not bool((connect.get("preflight") or {}).get("ready", connect.get("preflight_ok"))):
        return False
    try:
        expected = normalize_connection_target(
            str(connect.get("domain") or ""),
            str(connect.get("dc") or ""),
            str(connect.get("transport") or "ldap"),
        )
    except TargetError:
        return False
    if not _stored_port_matches(connect.get("ldap_port"), expected[3]):
        return False
    bound = connect.get("target") or {}
    try:
        approved = normalize_connection_target(
            str(bound.get("domain") or connect.get("domain") or ""),
            str(bound.get("dc") or connect.get("dc") or ""),
            str(bound.get("transport") or connect.get("transport") or "ldap"),
        )
    except TargetError:
        return False
    if not _stored_port_matches(bound.get("ldap_port"), approved[3]):
        return False
    if not all(expected) or expected != approved:
        return False
    expires_at = str(connect.get("expires_at") or "")
    if not expires_at:
        # Legacy connection state is deliberately not trusted indefinitely.
        return False
    try:
        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    if expiry <= _now():
        return False
    if auth_mode == "authenticated":
        validation = connect.get("credential_validation") or (connect.get("preflight") or {}).get(
            "credential_validation"
        )
        if not isinstance(validation, dict):
            return False
        if not validation.get("attempted") or validation.get("valid") is not True:
            return False
        if not connect.get("has_secret"):
            return False
    return not connect.get("has_secret") or has_bind_secret(
        str(engagement.get("id") or ""), connect.get("secret_ref")
    )


def invalidate_connections_on_startup(settings: Settings) -> int:
    """Make persisted live checks honest after process-memory state is lost."""
    from adassassin.engagements import list_engagements

    changed = 0
    for item in list_engagements(settings):
        if item.get("mode") == "demo" or not item.get("connect"):
            continue

        def _invalidate(current: dict[str, Any]) -> None:
            connect = dict(current.get("connect") or {})
            connect.update(
                {
                    "preflight_ok": False,
                    "status": "reconnect_required",
                    "secret_ref": None,
                    "has_secret": False,
                    "invalidated_reason": (
                        "The console restarted. Run Connect again to refresh target checks "
                        "and re-enter any in-memory credentials."
                    ),
                }
            )
            current["connect"] = connect

        update_engagement(settings, item["id"], _invalidate)
        clear_bind_secret(item["id"])
        changed += 1
    return changed


def invalidate_connection(
    current: dict[str, Any], reason: str = "Target details changed. Run Connect again."
) -> None:
    """Invalidate one engagement's preflight after its scope target changes."""
    connect = current.get("connect")
    if not isinstance(connect, dict):
        return
    connect.update(
        {
            "preflight_ok": False,
            "status": "reconnect_required",
            "secret_ref": None,
            "has_secret": False,
            "invalidated_reason": reason,
        }
    )
