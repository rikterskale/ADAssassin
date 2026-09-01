"""In-memory bind secrets for live connect. Never written to engagement JSON."""

from __future__ import annotations

from threading import Lock

_LOCK = Lock()
_STORE: dict[str, dict[str, str]] = {}


def put_bind_secret(engagement_id: str, *, password: str | None = None, hashes: str | None = None) -> str | None:
    """Store a bind secret in process memory and return a secret_ref, or None if empty."""
    payload: dict[str, str] = {}
    if password:
        payload["password"] = password
    if hashes:
        payload["hashes"] = hashes
    if not payload:
        return None
    with _LOCK:
        _STORE.setdefault(engagement_id, {}).update(payload)
    return f"memory:{engagement_id}:bind"


def clear_bind_secret(engagement_id: str) -> None:
    with _LOCK:
        _STORE.pop(engagement_id, None)


def resolve_bind_secret(engagement_id: str, secret_ref: str | None = None) -> dict[str, str]:
    """Return {password?, hashes?} for an engagement. secret_ref must match when provided."""
    if secret_ref:
        parts = secret_ref.split(":")
        if len(parts) != 3 or parts[0] != "memory" or parts[1] != engagement_id or parts[2] != "bind":
            return {}
    with _LOCK:
        return dict(_STORE.get(engagement_id) or {})
