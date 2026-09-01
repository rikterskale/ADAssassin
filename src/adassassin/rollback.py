"""Engagement rollback preview/apply. Preview never contacts a DC; apply is force-gated."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from adassassin.config import Settings
from adassassin.engagements import get_engagement, save_engagement
from adassassin.secrets import resolve_bind_secret
from adassassin.workspace import engagement_workspace, session_dirs

CONFIRM_TOKEN = "YES"


class RollbackError(ValueError):
    """Operator-facing rollback refusal."""


def _now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _public_entry(entry: dict[str, Any], *, session_id: str) -> dict[str, Any]:
    """Strip bulky/secret-ish previous values from operator listing."""
    kind = str(entry.get("kind") or "")
    return {
        "session_id": session_id,
        "kind": kind,
        "target": entry.get("target"),
        "attribute": entry.get("attribute"),
        "status": entry.get("status") or "pending",
        "classification": entry.get("classification"),
        "registered_at": entry.get("registered_at"),
        "host": entry.get("host"),
        "result": entry.get("result"),
        "has_previous": entry.get("previous") is not None or entry.get("previous_hex") is not None,
    }


def _sessions_for_engagement(settings: Settings, engagement: dict[str, Any]) -> list[Path]:
    sessions = session_dirs(settings, engagement["id"])
    # Include session_path values recorded on jobs.
    for job in engagement.get("jobs") or []:
        path_raw = job.get("session_path")
        if not path_raw:
            continue
        path = Path(str(path_raw))
        if path.is_dir() and path not in sessions:
            sessions.append(path)
    return sessions


def list_rollback(settings: Settings, engagement_id: str) -> dict[str, Any]:
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")

    from adaf_attack.core.rollback import cleanup_dashboard, summarize_rollbacks

    sessions = _sessions_for_engagement(settings, item)
    entries: list[dict[str, Any]] = []
    pending = 0
    failed = 0
    completed = 0
    dashboards: list[dict[str, Any]] = []

    for session in sessions:
        summary = summarize_rollbacks(session)
        dashboard = cleanup_dashboard(session)
        dashboards.append(
            {
                "session_id": session.name,
                "session_path": str(session),
                "status": dashboard.get("status"),
                "pending": dashboard.get("pending", 0),
                "failed": dashboard.get("failed", 0),
                "next_action": dashboard.get("next_action"),
            }
        )
        pending += int(summary.get("pending") or 0)
        failed += int(summary.get("failed") or 0)
        completed += int(summary.get("completed") or 0)
        for entry in summary.get("entries") or []:
            if isinstance(entry, dict):
                entries.append(_public_entry(entry, session_id=session.name))

    previous = (item.get("rollback") or {}).get("pending")
    if previous != pending:
        item["rollback"] = {"pending": pending}
        item = save_engagement(settings, item)
    return {
        "ok": True,
        "engagement_id": engagement_id,
        "pending": pending,
        "failed": failed,
        "completed": completed,
        "entries": entries,
        "sessions": dashboards,
        "engagement": item,
        "contacts_directory": False,
    }


def preview_rollback(settings: Settings, engagement_id: str) -> dict[str, Any]:
    """Preview pending cleanup without contacting a directory."""
    payload = list_rollback(settings, engagement_id)
    return {
        **payload,
        "preview": True,
        "mutation": False,
        "message": (
            "Preview only. No directory contact. Apply requires force + typed YES confirmation."
            if payload["pending"]
            else "No pending rollback entries."
        ),
        "requires_force": True,
        "confirm_token": CONFIRM_TOKEN,
    }


def apply_rollback(
    settings: Settings,
    engagement_id: str,
    *,
    force: bool = False,
    confirm: str = "",
    ack: bool = False,
    session_id: str | None = None,
) -> dict[str, Any]:
    """Apply engine cleanup. Mutation: requires force, ack, and typed YES."""
    if not force or not ack:
        raise RollbackError(
            "Rollback apply is a directory mutation. Provide force=true and ack=true "
            "(Phase 5-adjacent confirmation)."
        )
    if (confirm or "").strip() != CONFIRM_TOKEN:
        raise RollbackError(
            f"Typed confirmation required. Enter '{CONFIRM_TOKEN}' to apply rollback "
            "(matches the engine cleanup --force path)."
        )

    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")

    connect = item.get("connect") or {}
    domain = str(connect.get("domain") or item.get("domain") or "").strip()
    dc = str(connect.get("dc") or item.get("dc") or "").strip()
    if not domain or not dc:
        raise RollbackError(
            "Connect an authorized target before applying rollback (domain and DC required)."
        )
    if not connect.get("preflight_ok"):
        raise RollbackError("Successful connect/preflight is required before applying rollback.")

    sessions = _sessions_for_engagement(settings, item)
    if session_id:
        sessions = [path for path in sessions if path.name == session_id]
    if not sessions:
        raise RollbackError("No engine sessions with cleanup state were found for this engagement.")

    from adaf_attack.core.cleanup import execute_cleanup
    from adaf_attack.core.target import Target

    secret = resolve_bind_secret(engagement_id, connect.get("secret_ref"))
    target = Target(
        domain=domain,
        dc_ip=dc,
        username=(connect.get("username") or item.get("username") or None) or None,
        password=secret.get("password"),
        hashes=secret.get("hashes"),
    )

    results: list[dict[str, Any]] = []
    for session in sessions:
        result = execute_cleanup(session, target)
        results.append(
            {
                "session_id": session.name,
                "session_path": str(session),
                "completed": result.get("completed"),
                "advisory": result.get("advisory"),
                "unsupported": result.get("unsupported"),
            }
        )

    audit = list(item.get("rollback_audit") or [])
    audit.append(
        {
            "id": uuid4().hex[:10],
            "action": "apply",
            "at": _now(),
            "force": True,
            "ack": True,
            "confirm": CONFIRM_TOKEN,
            "sessions": [row["session_id"] for row in results],
        }
    )
    item["rollback_audit"] = audit[-100:]
    item["target_contacted"] = True
    save_engagement(settings, item)
    refreshed = list_rollback(settings, engagement_id)
    return {
        "ok": True,
        "applied": True,
        "results": results,
        "rollback": refreshed,
        "engagement": refreshed["engagement"],
    }


def seed_demo_pending_cleanup(settings: Settings, engagement_id: str) -> Path:
    """Create a fixture pending cleanup entry for offline rollback UI demos/tests."""
    workspace = engagement_workspace(settings, engagement_id)
    session = workspace / "demo-cleanup-session"
    session.mkdir(parents=True, exist_ok=True)
    (session / "session.json").write_text(
        '{"session_id":"demo-cleanup-session","tool":"adassassin-demo"}\n',
        encoding="utf-8",
    )
    import json

    cleanup = [
        {
            "kind": "ldap-attribute",
            "target": "CN=demo,OU=Users,DC=corp,DC=local",
            "attribute": "description",
            "previous": ["fixture"],
            "status": "pending",
            "classification": "revertable",
            "registered_at": _now(),
        }
    ]
    (session / "cleanup.json").write_text(json.dumps(cleanup, indent=2) + "\n", encoding="utf-8")
    return session
