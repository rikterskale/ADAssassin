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
        "status": "open",
        "impact": "A principal with GenericAll can take over group membership and escalate.",
        "remediation": "Remove unintended GenericAll ACEs and review tier-1 group ownership.",
        "evidence": [{"artifact": "demo-acl-edge.json", "pointer": "/aces/0", "sha256": ""}],
        "attack_techniques": ["T1484.001"],
        "affected_assets": ["Tier-1-Operators"],
    },
    {
        "id": "demo-esc1",
        "title": "Certificate template publishes an ESC1 signal",
        "severity": "high",
        "source": "demo",
        "summary": "Offline demo finding for the guided catalog path.",
        "status": "open",
        "impact": "A misconfigured template can allow requester-specified SANs and privilege escalation.",
        "remediation": "Disable enrollee-supplied subject and tighten enrollment permissions.",
        "evidence": [{"artifact": "demo-esc1.json", "pointer": "/templates/User", "sha256": ""}],
        "attack_techniques": ["T1649"],
        "affected_assets": ["User"],
    },
    {
        "id": "demo-kerberoastable",
        "title": "Service account with an SPN and a weak-password hypothesis",
        "severity": "medium",
        "source": "demo",
        "summary": "Seeded so the findings pane is not empty on first launch.",
        "status": "open",
        "impact": "Offline cracking of a service ticket may expose the account password.",
        "remediation": "Use long random passwords or managed service accounts; remove unused SPNs.",
        "evidence": [{"artifact": "demo-kerberoast.json", "pointer": "/accounts/0", "sha256": ""}],
        "attack_techniques": ["T1558.003"],
        "affected_assets": ["svc-sql"],
    },
]


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _path(settings: Settings, engagement_id: str):
    return settings.engagements_dir / f"{engagement_id}.json"


def list_engagements(settings: Settings) -> list[dict[str, Any]]:
    settings.engagements_dir.mkdir(parents=True, exist_ok=True)
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


def create_engagement(settings: Settings, *, name: str, domain: str = "", dc: str = "", notes: str = "", demo: bool = False) -> dict[str, Any]:
    engagement_id = ("demo-" if demo else "") + uuid4().hex[:10]
    payload = {
        "id": engagement_id,
        "name": name,
        "domain": domain,
        "dc": dc,
        "username": "",
        "notes": notes,
        "mode": "demo" if demo else "live-ready",
        "created_at": _now(),
        "updated_at": _now(),
        "findings": DEMO_FINDINGS if demo else [],
        "jobs": [],
        "connect": None,
        "vault": {"secrets": 0, "tickets": 0, "certificates": 0},
        "rollback": {"pending": 0},
        "target_contacted": False,
        "guided_marked": ["demo", "findings"] if demo else [],
    }
    return save_engagement(settings, payload)


def get_job(settings: Settings, engagement_id: str, job_id: str) -> dict[str, Any] | None:
    item = get_engagement(settings, engagement_id)
    if item is None:
        return None
    for job in item.get("jobs") or []:
        if job.get("id") == job_id:
            return job
    return None


def ensure_demo(settings: Settings) -> dict[str, Any]:
    for item in list_engagements(settings):
        if item.get("mode") == "demo":
            return item
    return create_engagement(settings, name="Offline demo", notes="Fixture workspace. No domain controller is contacted.", demo=True)


def mark_guided(settings: Settings, engagement_id: str, step_id: str) -> dict[str, Any] | None:
    item = get_engagement(settings, engagement_id)
    if item is None:
        return None
    marked = list(item.get("guided_marked") or [])
    if step_id not in marked:
        marked.append(step_id)
    item["guided_marked"] = marked
    return save_engagement(settings, item)
