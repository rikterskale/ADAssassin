"""Engagement target connect / preflight. Wraps engine live-ad doctor checks."""

from __future__ import annotations

from typing import Any

from adassassin.config import Settings
from adassassin.engagements import get_engagement, update_engagement
from adassassin.secrets import clear_bind_secret, put_bind_secret


class TargetError(ValueError):
    """Invalid or incomplete target fields."""


def validate_target_fields(*, domain: str, dc: str) -> tuple[str, str]:
    domain = (domain or "").strip()
    dc = (dc or "").strip()
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

    domain, dc = validate_target_fields(domain=domain, dc=dc)
    username = (username or "").strip()

    if password or hashes:
        secret_ref = put_bind_secret(engagement_id, password=password, hashes=hashes)
    else:
        # Clear stale memory secret when reconnecting without credentials.
        clear_bind_secret(engagement_id)
        secret_ref = None

    preflight = run_preflight(domain=domain, dc=dc, timeout=timeout)

    def _apply(current: dict[str, Any]) -> None:
        if current.get("mode") == "demo":
            raise TargetError(
                "Offline demo engagements cannot contact a directory. Create a live-ready engagement first."
            )
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
            "preflight_ok": bool(preflight["ok"]),
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
        if preflight["ok"]:
            marked = list(current.get("guided_marked") or [])
            if "connect" not in marked:
                marked.append("connect")
            current["guided_marked"] = marked

    saved = update_engagement(settings, engagement_id, _apply)
    return {"engagement": saved, "preflight": preflight}


def has_successful_connect(engagement: dict[str, Any]) -> bool:
    connect = engagement.get("connect") or {}
    return bool(connect.get("preflight_ok"))
