from pathlib import Path
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.config import Settings


def _client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(Settings(data_dir=tmp_path)))


def _engagement(client: TestClient) -> dict[str, Any]:
    return client.post(
        "/api/engagements",
        json={"name": "Phase 2 lab", "domain": "corp.local", "dc": "10.0.0.10"},
    ).json()["engagement"]


def test_refuse_red_capability(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _engagement(client)
    response = client.post(
        f"/api/engagements/{engagement['id']}/run",
        json={"capability_id": "dcsync", "options": {}, "ack": False},
    )
    assert response.status_code == 403
    detail = response.json()["detail"]
    assert "Phase 5" in detail
    assert "dcsync" in detail


def test_refuse_yellow_without_connect(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _engagement(client)
    response = client.post(
        f"/api/engagements/{engagement['id']}/run",
        json={"capability_id": "ldap-enum", "options": {}, "ack": False},
    )
    assert response.status_code == 409
    assert "preflight" in response.json()["detail"].lower() or "connect" in response.json()["detail"].lower()


def test_accept_mocked_observe_run(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _engagement(client)

    def fake_execute(capability_id: str, target: Any, **kwargs: Any) -> dict[str, Any]:
        return {
            "ok": True,
            "capability": capability_id,
            "session_id": "sess-test",
            "session_path": str(tmp_path / "sess"),
            "result": {
                "ok": True,
                "findings": [
                    {
                        "id": "mock-finding-1",
                        "title": "Mock observe finding",
                        "severity": "medium",
                        "impact": "Fixture finding from mocked engine run.",
                    }
                ],
            },
            "auth": "anonymous",
            "outcome": {"status": "success"},
        }

    with patch("adaf_attack.core.runner.execute_capability", side_effect=fake_execute):
        response = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={"capability_id": "attack-paths", "options": {}, "ack": False},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["job_id"]
    assert any(item["id"] == "mock-finding-1" for item in body["findings"])

    job = client.get(f"/api/engagements/{engagement['id']}/jobs/{body['job_id']}").json()["job"]
    assert job["status"] == "completed"
    assert job["capability_id"] == "attack-paths"

    detail = client.get(f"/api/engagements/{engagement['id']}").json()["engagement"]
    assert any(item["id"] == "mock-finding-1" for item in detail["findings"])
    assert "observe-run" in detail["guided_marked"]


def test_connect_persists_without_password(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _engagement(client)

    fake_preflight = {
        "ok": True,
        "ready": True,
        "profile": "live-ad",
        "checks": [
            {"id": "domain-dns", "status": "ok", "scope": "live-ad", "value": "ok"},
            {"id": "dc-ldap", "status": "ok", "scope": "live-ad", "value": "10.0.0.10:389"},
        ],
        "blocking_checks": [],
        "advisory_checks": [],
        "next_step": "plan",
        "first_run": False,
    }

    with patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight):
        response = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={
                "domain": "corp.local",
                "dc": "10.0.0.10",
                "username": "operator",
                "password": "should-not-persist",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["preflight"]["ok"] is True
    assert body["preflight"]["target_contacted"] is True
    saved = body["engagement"]
    assert saved["domain"] == "corp.local"
    assert saved["dc"] == "10.0.0.10"
    assert saved["username"] == "operator"
    assert saved["connect"]["has_secret"] is True
    assert saved["connect"]["secret_ref"] == f"memory:{engagement['id']}:bind"
    assert saved["target_contacted"] is True
    raw = (tmp_path / "engagements" / f"{engagement['id']}.json").read_text(encoding="utf-8")
    assert "should-not-persist" not in raw
    assert "password" not in saved["connect"]


def test_failed_preflight_without_fields_does_not_mark_contacted(tmp_path: Path) -> None:
    """Missing fields never reach DC probes; target_contacted stays false."""
    from adassassin.targets import TargetError, validate_target_fields

    try:
        validate_target_fields(domain="", dc="")
        raised = False
    except TargetError:
        raised = True
    assert raised

    client = _client(tmp_path)
    engagement = _engagement(client)
    # API validates via pydantic min_length; empty domain is 422.
    response = client.post(
        f"/api/engagements/{engagement['id']}/connect",
        json={"domain": "", "dc": ""},
    )
    assert response.status_code == 422
    detail = client.get(f"/api/engagements/{engagement['id']}").json()["engagement"]
    assert detail["target_contacted"] is False


def test_health_phase_two(tmp_path: Path) -> None:
    client = _client(tmp_path)
    health = client.get("/api/health").json()
    assert health["phase"] == "2"
    assert health["version"].startswith("0.3")
