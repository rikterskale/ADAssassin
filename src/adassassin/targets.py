"""Engagement target connect / preflight. Wraps engine live-ad doctor checks."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from adassassin.config import Settings
from adassassin.engagements import get_engagement, update_engagement
from adassassin.secrets import clear_bind_secret, has_bind_secret, put_bind_secret


class TargetError(ValueError):
    """Invalid or incomplete target fields."""


def _now() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def _stamp(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def normalize_target(domain: str, dc: str) -> tuple[str, str]:
    """Normalize a target tuple for exact preflight/run comparisons."""
    return (domain or "").strip().rstrip(".").lower(), (dc or "").strip().rstrip(".").lower()


def validate_target_fields(*, domain: str, dc: str) -> tuple[str, str]:
    domain = (domain or "").strip().rstrip(".")
    dc = (dc or "").strip().rstrip(".")
    missing = [name for name, value in (("domain", domain), ("dc", dc)) if not value]
    if missing:
        raise TargetError("Target is missing: " + ", ".join(missing))
    return domain, dc


def run_preflight(*, domain: str, dc: str, timeout: float = 3.0) -> dict[str, Any]:
    """Wrap ADAF-ATTACK live-ad doctor. Contacts DNS and DC ports; does not run a capability.

    Behavior note for ``target_contacted``: when domain and dc are both supplied,
    the engine probes TCP ports on the DC (dns/kerberos/ldap/smb). Those probes
    count as speaking to the DC even when every probe fails. A preflight that
    never reaches that branch (missing fields) does not contact the DC.
    """
    from adaf_attack.cli import _doctor_payload

    payload = _doctor_payload("live-ad", domain=domain, dc_ip=dc, timeout=timeout)
    live_checks = [
        check
        for check in payload.get("checks", [])
        if check.get("scope") == "live-ad"
        or str(check.get("id", "")).startswith("dc-")
        or check.get("id") in {"target-arguments", "domain-dns"}
    ]
    # Socket probes run only when both domain and dc were provided.
    contacted = bool(domain and dc)
    return {
        "ok": bool(payload.get("ok")),
        "ready": bool(payload.get("ready")),
        "profile": payload.get("profile", "live-ad"),
        "domain": domain,
        "dc": dc,
        "blocking_checks": list(payload.get("blocking_checks") or []),
        "advisory_checks": list(payload.get("advisory_checks") or []),
        "next_step": payload.get("next_step"),
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
        preflight = run_preflight(domain=domain, dc=dc, timeout=timeout)
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
            "username": username,
            "secret_ref": secret_ref,
            "has_secret": bool(secret_ref),
            "preflight_ok": ready,
            "status": "ready" if ready else "blocked",
            "checked_at": _stamp(checked_at),
            "expires_at": _stamp(expires_at),
            "invalidated_reason": None,
            "target": {"domain": domain, "dc": dc},
            "preflight": {
                "ok": preflight["ok"],
                "ready": preflight["ready"],
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
    expected = normalize_target(str(connect.get("domain") or ""), str(connect.get("dc") or ""))
    bound = connect.get("target") or {}
    approved = normalize_target(
        str(bound.get("domain") or connect.get("domain") or ""),
        str(bound.get("dc") or connect.get("dc") or ""),
    )
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
