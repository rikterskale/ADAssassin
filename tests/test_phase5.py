from pathlib import Path
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.config import Settings


def _client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(Settings(data_dir=tmp_path)))


def _connected_engagement(client: TestClient) -> dict[str, Any]:
    engagement = client.post(
        "/api/engagements",
        json={"name": "red lab", "domain": "corp.local", "dc": "10.0.0.10"},
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
    return client.get(f"/api/engagements/{engagement['id']}").json()["engagement"]


def test_red_run_without_ack_is_403(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _connected_engagement(client)
    response = client.post(
        f"/api/engagements/{engagement['id']}/run",
        json={"capability_id": "dcsync", "options": {}, "ack": False, "force": False},
    )
    assert response.status_code == 403
    detail = response.json()["detail"].lower()
    assert "dcsync" in detail
    assert "ack" in detail or "force" in detail or "confirm" in detail


def test_red_run_without_connect_is_409(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = client.post(
        "/api/engagements",
        json={"name": "no connect red"},
    ).json()["engagement"]
    response = client.post(
        f"/api/engagements/{engagement['id']}/run",
        json={
            "capability_id": "dcsync",
            "options": {},
            "ack": True,
            "force": True,
            "confirm": "dcsync",
        },
    )
    assert response.status_code == 409
    assert "connect" in response.json()["detail"].lower() or "preflight" in response.json()["detail"].lower()


def test_red_run_wrong_confirm_is_403(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _connected_engagement(client)
    response = client.post(
        f"/api/engagements/{engagement['id']}/run",
        json={
            "capability_id": "dcsync",
            "options": {},
            "ack": True,
            "force": True,
            "confirm": "YES",
        },
    )
    assert response.status_code == 403
    assert "dcsync" in response.json()["detail"]


def test_red_run_with_ack_uses_mock_engine(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _connected_engagement(client)

    def fake_execute(capability_id: str, target: Any, **kwargs: Any) -> dict[str, Any]:
        assert capability_id == "dcsync"
        assert kwargs.get("force") is True
        assert kwargs.get("acknowledged") is True
        return {
            "ok": True,
            "capability": capability_id,
            "session_id": "sess-red",
            "session_path": str(tmp_path / "sess-red"),
            "result": {"ok": True, "findings": []},
            "auth": "password",
            "outcome": {"status": "success"},
        }

    with patch("adaf_attack.core.runner.execute_capability", side_effect=fake_execute):
        response = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={
                "capability_id": "dcsync",
                "options": {"username": "admin"},
                "ack": True,
                "force": True,
                "confirm": "dcsync",
                "actor": "tester",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    detail = client.get(f"/api/engagements/{engagement['id']}").json()["engagement"]
    assert detail["red_ack_audit"]
    last = detail["red_ack_audit"][-1]
    assert last["capability_id"] == "dcsync"
    assert last["actor"] == "tester"
    assert last["confirm"] == "dcsync"
    assert last["options"].get("username") == "admin"
    assert "password" not in last["options"] or last["options"]["password"] == "***"
    assert "red-run" in detail["guided_marked"]
    guide = client.get("/api/guide").json()
    assert "red-run" in guide["completed"]
    assert "red-run" in [step["id"] for step in guide["steps"]]


def test_health_phase_five(tmp_path: Path) -> None:
    client = _client(tmp_path)
    health = client.get("/api/health").json()
    assert int(health["phase"]) >= 5
    assert health["version"].startswith("0.")
