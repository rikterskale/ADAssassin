"""Engagement target connect / preflight. Wraps engine live-ad doctor checks."""

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
    return {
        # ``ok`` means the doctor completed; ``ready`` is the execution gate.
        "ok": bool(payload.get("ok")),
        "ready": bool(payload.get("ready")) and transport_ready,
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
    username: str = "",
    password: str | None = None,
    hashes: str | None = None,
    timeout: float = 3.0,
) -> dict[str, Any]:
    """Validate target fields, run preflight, persist non-secret connect state."""
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
            "username": username,
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
                "transport": transport,
                "ldap_port": ldap_port,
                "blocking_checks": preflight["blocking_checks"],
                "advisory_checks": preflight["advisory_checks"],
                "next_step": preflight["next_step"],
                "checks": preflight["checks"],
                "target_contacted": preflight["target_contacted"],
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
