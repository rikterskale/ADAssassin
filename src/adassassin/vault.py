"""Engagement vault: metadata list + single-item unmask with short TTL."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from adassassin.config import Settings
from adassassin.engagements import get_engagement, save_engagement
from adassassin.workspace import engagement_workspace, session_dirs

_LOCK = Lock()
_VAULT_KEYS: dict[str, str] = {}
_UNMASKED: dict[str, dict[str, Any]] = {}  # key = engagement_id:name


class VaultServiceError(ValueError):
    """Operator-facing vault error."""


def _now() -> datetime:
    return datetime.now(UTC)


def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def vault_key_for(engagement_id: str) -> str:
    """Process-memory Fernet key for engagement vault secrets. Never written to disk JSON."""
    with _LOCK:
        existing = _VAULT_KEYS.get(engagement_id)
        if existing:
            return existing
        from cryptography.fernet import Fernet

        key = Fernet.generate_key().decode("ascii")
        _VAULT_KEYS[engagement_id] = key
        return key


def _session_vault(session_root: Path, *, engagement_id: str):
    from adaf_attack.core.vault import SessionVault

    return SessionVault(session_root, key=vault_key_for(engagement_id))


def ensure_demo_vault(settings: Settings, engagement_id: str) -> None:
    """Seed metadata-only / encrypted demo vault items for offline console demos."""
    workspace = engagement_workspace(settings, engagement_id)
    vault = _session_vault(workspace, engagement_id=engagement_id)
    if vault.list():
        return
    vault.put(
        "demo-cert-metadata",
        "certificate",
        {"subject": "CN=demo-user", "template": "User"},
        secret=False,
        metadata={"label": "Demo certificate metadata", "created": _iso(_now()), "last_used": None},
    )
    vault.put(
        "demo-ticket",
        "ticket",
        {"kind": "krb-ccache", "principal": "demo@CORP.LOCAL", "blob": "REDACTED-DEMO-TICKET"},
        secret=True,
        metadata={"label": "Demo Kerberos ticket", "created": _iso(_now()), "last_used": None},
    )
    vault.put(
        "demo-hash",
        "secret",
        {"nt": "aad3b435b51404eeaad3b435b51404ee:31d6cfe0d16ae931b73c59d7e0c089c0"},
        secret=True,
        metadata={"label": "Demo NT hash material", "created": _iso(_now()), "last_used": None},
    )


def _iter_vault_roots(settings: Settings, engagement_id: str) -> list[tuple[str, Any]]:
    roots: list[tuple[str, Any]] = []
    workspace = engagement_workspace(settings, engagement_id)
    roots.append(("engagement", _session_vault(workspace, engagement_id=engagement_id)))
    for session in session_dirs(settings, engagement_id):
        roots.append((session.name, _session_vault(session, engagement_id=engagement_id)))
    return roots


def _metadata_item(
    *,
    name: str,
    kind: str,
    secret: bool,
    metadata: dict[str, Any],
    scope: str,
) -> dict[str, Any]:
    return {
        "name": name,
        "kind": kind,
        "secret": secret,
        "label": str(metadata.get("label") or name),
        "created": metadata.get("created") or metadata.get("created_at"),
        "last_used": metadata.get("last_used"),
        "scope": scope,
        "metadata": {
            key: value
            for key, value in metadata.items()
            if key.lower() not in {"password", "hashes", "nt", "lm", "ticket", "blob", "secret", "value"}
        },
    }


def list_vault(settings: Settings, engagement_id: str) -> dict[str, Any]:
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")
    if item.get("mode") == "demo":
        ensure_demo_vault(settings, engagement_id)

    entries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for scope, vault in _iter_vault_roots(settings, engagement_id):
        try:
            for vault_item in vault.list():
                key = f"{scope}:{vault_item.name}"
                if key in seen:
                    continue
                seen.add(key)
                entries.append(
                    _metadata_item(
                        name=vault_item.name,
                        kind=vault_item.kind,
                        secret=vault_item.secret,
                        metadata=dict(vault_item.metadata or {}),
                        scope=scope,
                    )
                )
        except Exception:
            continue

    counters = {"secrets": 0, "tickets": 0, "certificates": 0}
    for entry in entries:
        kind = str(entry.get("kind") or "").lower()
        if kind in {"ticket", "tickets", "ccache", "kirbi"}:
            counters["tickets"] += 1
        elif kind in {"certificate", "cert", "certificates", "pfx"}:
            counters["certificates"] += 1
        elif entry.get("secret") or kind in {"secret", "hash", "password"}:
            counters["secrets"] += 1
        else:
            counters["secrets"] += 1

    previous = item.get("vault") or {}
    if previous != counters:
        item["vault"] = counters
        save_engagement(settings, item)

    active = []
    with _LOCK:
        for key, payload in list(_UNMASKED.items()):
            if not key.startswith(f"{engagement_id}:"):
                continue
            expires = datetime.fromisoformat(payload["expires_at"].replace("Z", "+00:00"))
            if expires <= _now():
                _UNMASKED.pop(key, None)
                continue
            active.append({"name": payload["name"], "expires_at": payload["expires_at"]})

    return {
        "ok": True,
        "engagement_id": engagement_id,
        "counters": counters,
        "items": entries,
        "unmasked_active": active,
    }


def unmask_vault_item(
    settings: Settings,
    engagement_id: str,
    name: str,
    *,
    scope: str = "engagement",
    ttl_seconds: int = 30,
) -> dict[str, Any]:
    """Reveal one vault item into process memory for a short TTL. Audited on engagement."""
    if ttl_seconds < 5 or ttl_seconds > 300:
        raise VaultServiceError("ttl_seconds must be between 5 and 300")
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")
    if item.get("mode") == "demo":
        ensure_demo_vault(settings, engagement_id)

    vault = None
    if scope == "engagement":
        vault = _session_vault(engagement_workspace(settings, engagement_id), engagement_id=engagement_id)
    else:
        for session in session_dirs(settings, engagement_id):
            if session.name == scope:
                vault = _session_vault(session, engagement_id=engagement_id)
                break
    if vault is None:
        raise LookupError("Vault scope not found")
    if not vault.exists(name):
        raise LookupError("Vault item not found")

    try:
        value = vault.get(name)
    except Exception as exc:
        raise VaultServiceError(str(exc)) from exc

    expires = _now() + timedelta(seconds=ttl_seconds)
    cache_key = f"{engagement_id}:{scope}:{name}"
    with _LOCK:
        _UNMASKED[cache_key] = {
            "name": name,
            "scope": scope,
            "value": value,
            "expires_at": _iso(expires),
        }

    audit = list(item.get("vault_audit") or [])
    audit.append(
        {
            "id": uuid4().hex[:10],
            "action": "unmask",
            "name": name,
            "scope": scope,
            "ttl_seconds": ttl_seconds,
            "at": _iso(_now()),
            "expires_at": _iso(expires),
        }
    )
    item["vault_audit"] = audit[-100:]
    saved = save_engagement(settings, item)
    # Refresh counters after audit save (may no-op if unchanged).
    listed = list_vault(settings, engagement_id)
    refreshed = get_engagement(settings, engagement_id) or saved
    refreshed["vault"] = listed["counters"]

    return {
        "ok": True,
        "item": {
            "name": name,
            "scope": scope,
            "value": value,
            "expires_at": _iso(expires),
            "ttl_seconds": ttl_seconds,
        },
        "engagement": refreshed,
    }


def get_unmasked(engagement_id: str, name: str, *, scope: str = "engagement") -> Any | None:
    cache_key = f"{engagement_id}:{scope}:{name}"
    with _LOCK:
        payload = _UNMASKED.get(cache_key)
        if not payload:
            return None
        expires = datetime.fromisoformat(payload["expires_at"].replace("Z", "+00:00"))
        if expires <= _now():
            _UNMASKED.pop(cache_key, None)
            return None
        return payload["value"]
