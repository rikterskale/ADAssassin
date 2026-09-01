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


def test_health_reports_current_version(tmp_path: Path) -> None:
    client = _client(tmp_path)
    health = client.get("/api/health").json()
    assert health["phase"] == "3"
    assert health["version"].startswith("0.4")


def test_yellow_observe_after_successful_connect(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _engagement(client)

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

    def fake_execute(capability_id: str, target: Any, **kwargs: Any) -> dict[str, Any]:
        assert capability_id == "ldap-enum"
        assert target.domain == "corp.local"
        assert target.dc_ip == "10.0.0.10"
        return {
            "ok": True,
            "capability": capability_id,
            "session_id": "sess-yellow",
            "session_path": str(tmp_path / "sess-yellow"),
            "result": {
                "ok": True,
                "findings": [
                    {
                        "id": "yellow-finding-1",
                        "title": "Yellow observe finding",
                        "severity": "low",
                        "impact": "Mocked ldap-enum evidence.",
                    }
                ],
            },
            "auth": "anonymous",
            "outcome": {"status": "success"},
        }

    with patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight):
        connect = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={"domain": "corp.local", "dc": "10.0.0.10"},
        )
    assert connect.status_code == 200
    assert connect.json()["engagement"]["connect"]["preflight_ok"] is True

    with patch("adaf_attack.core.runner.execute_capability", side_effect=fake_execute):
        response = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={"capability_id": "ldap-enum", "options": {}, "ack": False},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert any(item["id"] == "yellow-finding-1" for item in body["findings"])
    detail = client.get(f"/api/engagements/{engagement['id']}").json()["engagement"]
    assert detail["target_contacted"] is True
    assert "connect" in detail["guided_marked"]
    assert "observe-run" in detail["guided_marked"]


def test_failed_preflight_still_marks_contacted_when_probes_ran(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _engagement(client)
    fake_preflight = {
        "ok": False,
        "ready": False,
        "profile": "live-ad",
        "checks": [
            {"id": "domain-dns", "status": "error", "scope": "live-ad", "value": "nxdomain"},
            {"id": "dc-ldap", "status": "warning", "scope": "live-ad", "value": "timeout"},
        ],
        "blocking_checks": ["domain-dns"],
        "advisory_checks": ["dc-ldap"],
        "next_step": "fix DNS",
        "first_run": False,
    }
    with patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight):
        response = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={"domain": "bad.example", "dc": "10.0.0.99"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["preflight"]["ok"] is False
    assert body["preflight"]["target_contacted"] is True
    assert body["engagement"]["target_contacted"] is True
    assert body["engagement"]["connect"]["preflight_ok"] is False
    assert "connect" not in (body["engagement"].get("guided_marked") or [])


def test_green_observe_without_domain_or_dc(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = client.post(
        "/api/engagements",
        json={"name": "offline only"},
    ).json()["engagement"]
    assert engagement["domain"] == ""
    assert engagement["dc"] == ""

    def fake_execute(capability_id: str, target: Any, **kwargs: Any) -> dict[str, Any]:
        assert target.domain == "offline.local"
        assert target.dc_ip == "127.0.0.1"
        return {
            "ok": True,
            "capability": capability_id,
            "session_id": "sess-green",
            "session_path": str(tmp_path / "sess-green"),
            "result": {"ok": True, "findings": []},
            "auth": "anonymous",
            "outcome": {"status": "success"},
        }

    with patch("adaf_attack.core.runner.execute_capability", side_effect=fake_execute):
        response = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={"capability_id": "attack-paths", "options": {}, "ack": False},
        )
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
