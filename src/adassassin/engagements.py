from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from adassassin.config import Settings

DEMO_FINDINGS = [
    {
        "id": "demo-acl-edge",
        "title": "Delegated GenericAll on a tier-1 group",
        "severity": "high",
        "source": "demo",
        "summary": "Fixture evidence only. No directory was contacted.",
    },
    {
        "id": "demo-esc1",
        "title": "Certificate template publishes an ESC1 signal",
        "severity": "high",
        "source": "demo",
        "summary": "Offline demo finding for the guided catalog path.",
    },
    {
        "id": "demo-kerberoastable",
        "title": "Service account with an SPN and a weak-password hypothesis",
        "severity": "medium",
        "source": "demo",
        "summary": "Seeded so the findings pane is not empty on first launch.",
    },
]


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _path(settings: Settings, engagement_id: str):
    return settings.engagements_dir / f"{engagement_id}.json"


def list_engagements(settings: Settings) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(settings.engagements_dir.glob("*.json")):
        try:
            items.append(json.loads(path.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
    items.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return items


def get_engagement(settings: Settings, engagement_id: str) -> dict[str, Any] | None:
    path = _path(settings, engagement_id)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_engagement(settings: Settings, payload: dict[str, Any]) -> dict[str, Any]:
    payload["updated_at"] = _now()
    settings.engagements_dir.mkdir(parents=True, exist_ok=True)
    path = _path(settings, payload["id"])
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def create_engagement(
    settings: Settings,
    *,
    name: str,
    domain: str = "",
    dc: str = "",
    notes: str = "",
    demo: bool = False,
) -> dict[str, Any]:
    engagement_id = ("demo-" if demo else "") + uuid4().hex[:10]
    payload = {
        "id": engagement_id,
        "name": name,
        "domain": domain,
        "dc": dc,
        "notes": notes,
        "mode": "demo" if demo else "live-ready",
        "created_at": _now(),
        "updated_at": _now(),
        "findings": DEMO_FINDINGS if demo else [],
        "vault": {"secrets": 0, "tickets": 0, "certificates": 0},
        "rollback": {"pending": 0},
        "target_contacted": False,
    }
    return save_engagement(settings, payload)


def ensure_demo(settings: Settings) -> dict[str, Any]:
    for item in list_engagements(settings):
        if item.get("mode") == "demo":
            return item
    return create_engagement(
        settings,
        name="Offline demo",
        notes="Fixture workspace. No domain controller is contacted.",
        demo=True,
    )
