import json
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.config import Settings


def _client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(Settings(data_dir=tmp_path)))


def test_vault_metadata_unmask_and_no_secret_on_disk(tmp_path: Path) -> None:
    client = _client(tmp_path)
    demo = client.post("/api/engagements/demo").json()["engagement"]
    vault = client.get(f"/api/engagements/{demo['id']}/vault").json()
    assert vault["counters"]["tickets"] >= 1
    assert vault["counters"]["certificates"] >= 1
    secret_item = next(item for item in vault["items"] if item["secret"])
    assert "value" not in secret_item
    listed_blob = json.dumps(secret_item)
    assert "31d6cfe0d16ae931b73c59d7e0c089c0" not in listed_blob
    assert "REDACTED-DEMO-TICKET" not in listed_blob

    unmasked = client.post(
        f"/api/engagements/{demo['id']}/vault/{secret_item['name']}/unmask",
        json={"scope": secret_item["scope"], "ttl_seconds": 30},
    ).json()
    assert unmasked["item"]["value"] is not None
    assert unmasked["item"]["expires_at"]
    engagement = unmasked["engagement"]
    assert engagement["vault_audit"]
    assert engagement["vault_audit"][-1]["action"] == "unmask"
    assert engagement["vault_audit"][-1]["name"] == secret_item["name"]

    raw = (tmp_path / "engagements" / f"{demo['id']}.json").read_text(encoding="utf-8")
    assert "REDACTED-DEMO-TICKET" not in raw
    assert "31d6cfe0d16ae931b73c59d7e0c089c0" not in raw
    assert "aad3b435b51404eeaad3b435b51404ee" not in raw


def test_rollback_preview_and_apply_gate(tmp_path: Path) -> None:
    client = _client(tmp_path)
    demo = client.post("/api/engagements/demo").json()["engagement"]
    listed = client.get(f"/api/engagements/{demo['id']}/rollback").json()
    assert listed["pending"] >= 1
    assert listed["contacts_directory"] is False

    preview = client.post(f"/api/engagements/{demo['id']}/rollback/preview").json()
    assert preview["preview"] is True
    assert preview["mutation"] is False
    assert preview["requires_force"] is True
    assert preview["confirm_token"] == "YES"

    refused = client.post(
        f"/api/engagements/{demo['id']}/rollback/apply",
        json={"force": False, "ack": False, "confirm": ""},
    )
    assert refused.status_code == 403

    refused_confirm = client.post(
        f"/api/engagements/{demo['id']}/rollback/apply",
        json={"force": True, "ack": True, "confirm": "nope"},
    )
    assert refused_confirm.status_code == 403

    # Demo has no successful connect; apply should still refuse before DC contact.
    no_connect = client.post(
        f"/api/engagements/{demo['id']}/rollback/apply",
        json={"force": True, "ack": True, "confirm": "YES"},
    )
    assert no_connect.status_code == 403


def test_rollback_apply_with_connect_and_mock_cleanup(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = client.post(
        "/api/engagements",
        json={"name": "rollback lab", "domain": "corp.local", "dc": "10.0.0.10"},
    ).json()["engagement"]

    fake_preflight = {
        "ok": True,
        "ready": True,
        "profile": "live-ad",
        "checks": [{"id": "dc-ldap", "status": "ok", "scope": "live-ad", "value": "ok"}],
        "blocking_checks": [],
        "advisory_checks": [],
        "next_step": "plan",
        "first_run": False,
    }
    with patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight):
        client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={"domain": "corp.local", "dc": "10.0.0.10"},
        )

    from adassassin.rollback import seed_demo_pending_cleanup

    seed_demo_pending_cleanup(Settings(data_dir=tmp_path), engagement["id"])

    with patch(
        "adaf_attack.core.cleanup.execute_cleanup",
        return_value={"entries": [], "completed": 1, "advisory": 0, "unsupported": 0},
    ) as mocked:
        response = client.post(
            f"/api/engagements/{engagement['id']}/rollback/apply",
            json={"force": True, "ack": True, "confirm": "YES"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["applied"] is True
    assert mocked.called
    detail = client.get(f"/api/engagements/{engagement['id']}").json()["engagement"]
    assert detail["rollback_audit"]
    assert detail["rollback_audit"][-1]["confirm"] == "YES"


def test_health_phase_four(tmp_path: Path) -> None:
    client = _client(tmp_path)
    health = client.get("/api/health").json()
    assert health["phase"] == "4"
    assert health["version"].startswith("0.5")
