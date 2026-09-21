from pathlib import Path
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.config import Settings


def _client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(Settings(data_dir=tmp_path, run_synchronous=True)))


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
    assert "dcsync" in detail
    assert "ack" in detail.lower() or "force" in detail.lower() or "confirm" in detail.lower()


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


def test_connect_validates_credential_without_persisting_password(tmp_path: Path) -> None:
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

    with (
        patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight),
        patch("adaf_attack.cli._socket_check", return_value=("ok", None)) as socket_check,
        patch("adassassin.targets.validate_bind_credential", return_value=True) as credential_check,
    ):
        response = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={
                "domain": "corp.local",
                "dc": "10.0.0.10",
                "transport": "ldaps",
                "username": "operator",
                "password": "should-not-persist",
            },
        )
    socket_check.assert_called_once_with("10.0.0.10", 636, 3.0)
    credential_check.assert_called_once_with(
        domain="corp.local",
        dc="10.0.0.10",
        transport="ldaps",
        username="operator",
        password="should-not-persist",
        hashes=None,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["preflight"]["ok"] is True
    assert body["preflight"]["target_contacted"] is True
    saved = body["engagement"]
    assert saved["domain"] == "corp.local"
    assert saved["dc"] == "10.0.0.10"
    assert saved["username"] == "operator"
    assert saved["connect"]["transport"] == "ldaps"
    assert saved["connect"]["ldap_port"] == 636
    assert saved["connect"]["auth_mode"] == "authenticated"
    assert saved["connect"]["credential_validation"] == {
        "required": True,
        "attempted": True,
        "valid": True,
        "method": "password",
    }
    assert body["preflight"]["network_status"] == "reachable"
    assert any(
        "one password LDAP bind" in line for line in body["preflight"]["credential_log"]
    )
    assert any("credential accepted" in line for line in body["preflight"]["credential_log"])
    assert body["preflight"]["credential_remediation"] == []
    assert "should-not-persist" not in str(body["preflight"])
    assert saved["connect"]["target"] == {
        "domain": "corp.local",
        "dc": "10.0.0.10",
        "transport": "ldaps",
        "ldap_port": 636,
    }
    assert any(
        check["id"] == "dc-ldaps" and check["value"] == "10.0.0.10:636"
        for check in body["preflight"]["checks"]
    )
    assert any(
        check["id"] == "credential-bind" and check["status"] == "ok"
        for check in body["preflight"]["checks"]
    )
    assert saved["connect"]["has_secret"] is True
    assert saved["connect"]["secret_ref"] == f"memory:{engagement['id']}:bind"
    assert saved["target_contacted"] is True
    raw = (tmp_path / "engagements" / f"{engagement['id']}.json").read_text(encoding="utf-8")
    assert "should-not-persist" not in raw
    assert "password" not in saved["connect"]


def test_ldaps_endpoint_failure_blocks_preflight_and_secret_staging(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _engagement(client)
    fake_preflight = {
        "ok": True,
        "ready": True,
        "profile": "live-ad",
        "checks": [],
        "blocking_checks": [],
        "advisory_checks": [],
        "next_step": "plan",
        "first_run": False,
    }

    with (
        patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight),
        patch(
            "adaf_attack.cli._socket_check",
            return_value=("warning", "10.0.0.10:636 is not reachable"),
        ),
    ):
        response = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={
                "domain": "corp.local",
                "dc": "10.0.0.10",
                "transport": "ldaps",
                "username": "operator",
                "password": "must-not-be-staged",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["preflight"]["ready"] is False
    assert body["preflight"]["network_status"] == "blocked"
    assert body["preflight"]["credential_validation"]["attempted"] is False
    assert any("Attempt: skipped" in line for line in body["preflight"]["credential_log"])
    assert "dc-ldaps" in body["preflight"]["blocking_checks"]
    assert body["engagement"]["connect"]["has_secret"] is False
    assert body["engagement"]["connect"]["secret_ref"] is None


def test_rejected_credential_blocks_preflight_and_secret_staging(tmp_path: Path) -> None:
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
    }

    with (
        patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight),
        patch("adassassin.targets.validate_bind_credential", return_value=False),
    ):
        response = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={
                "domain": "corp.local",
                "dc": "10.0.0.10",
                "auth_mode": "authenticated",
                "username": "operator",
                "password": "rejected-fixture-secret",
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["preflight"]["ready"] is False
    assert body["preflight"]["credential_validation"] == {
        "required": True,
        "attempted": True,
        "valid": False,
        "method": "password",
    }
    assert "credential-bind" in body["preflight"]["blocking_checks"]
    assert any(
        "did not establish an authenticated bind"
        in line
        for line in body["preflight"]["credential_log"]
    )
    assert len(body["preflight"]["credential_remediation"]) == 6
    assert "Stop repeated attempts" in body["preflight"]["credential_remediation"][0]
    assert "retry once" in body["preflight"]["credential_remediation"][-1]
    assert "rejected-fixture-secret" not in str(body["preflight"])
    assert body["engagement"]["connect"]["has_secret"] is False
    assert body["engagement"]["connect"]["secret_ref"] is None
    raw = (tmp_path / "engagements" / f"{engagement['id']}.json").read_text(encoding="utf-8")
    assert "rejected-fixture-secret" not in raw

    run = client.post(
        f"/api/engagements/{engagement['id']}/run",
        json={"capability_id": "ldap-enum", "options": {}},
    )
    assert run.status_code == 409


def test_authenticated_connect_requires_username_and_credential(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _engagement(client)
    with patch("adaf_attack.cli._doctor_payload") as doctor:
        response = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={
                "domain": "corp.local",
                "dc": "10.0.0.10",
                "auth_mode": "authenticated",
                "username": "operator",
            },
        )
    assert response.status_code == 400
    assert "credential" in response.json()["detail"].lower()
    doctor.assert_not_called()


def test_credential_validation_wraps_engine_ldap_probe() -> None:
    from adassassin.targets import validate_bind_credential

    with patch("adaf_attack.core.runner._probe_ldap", return_value=True) as engine_probe:
        assert validate_bind_credential(
            domain="corp.local",
            dc="10.0.0.10",
            transport="starttls",
            username="operator",
            hashes="fixture-nt-hash",
        )

    target = engine_probe.call_args.args[0]
    assert target.domain == "corp.local"
    assert target.dc_ip == "10.0.0.10"
    assert target.username == "operator"
    assert target.password is None
    assert target.hashes == "fixture-nt-hash"
    assert target.starttls is True
    assert target.ldaps is False
    assert target.port == 389


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
    assert int(health["phase"]) >= 2
    assert health["version"]


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
        assert target.ldaps is True
        assert target.starttls is False
        assert target.port == 636
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

    with (
        patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight),
        patch("adaf_attack.cli._socket_check", return_value=("ok", None)),
        patch("adassassin.targets.validate_bind_credential", return_value=True),
    ):
        connect = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={
                "domain": "corp.local",
                "dc": "10.0.0.10",
                "transport": "ldaps",
                "auth_mode": "authenticated",
                "username": "operator",
                "password": "fixture-only-secret",
            },
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


def test_live_run_rejects_transport_override_after_preflight(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _engagement(client)
    fake_preflight = {
        "ok": True,
        "ready": True,
        "profile": "live-ad",
        "checks": [],
        "blocking_checks": [],
        "advisory_checks": [],
        "next_step": "plan",
        "first_run": False,
    }
    with (
        patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight),
        patch("adaf_attack.cli._socket_check", return_value=("ok", None)),
        patch("adassassin.targets.validate_bind_credential", return_value=True),
    ):
        connected = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={
                "domain": "corp.local",
                "dc": "10.0.0.10",
                "transport": "ldaps",
                "auth_mode": "authenticated",
                "username": "operator",
                "password": "fixture-only-secret",
            },
        )
    assert connected.status_code == 200

    with patch("adaf_attack.core.runner.execute_capability") as engine_run:
        response = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={"capability_id": "ldap-enum", "options": {"transport": "ldap"}},
        )
    assert response.status_code == 409
    assert "transport" in response.json()["detail"].lower()
    engine_run.assert_not_called()


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


def test_anonymous_connect_allows_only_engine_declared_anonymous_runs(tmp_path: Path) -> None:
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
    }
    with (
        patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight),
        patch("adassassin.targets.validate_bind_credential") as credential_check,
    ):
        connected = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={
                "domain": "corp.local",
                "dc": "10.0.0.10",
                "auth_mode": "anonymous",
            },
        )
    assert connected.status_code == 200
    credential_check.assert_not_called()
    assert connected.json()["engagement"]["connect"]["auth_mode"] == "anonymous"
    assert connected.json()["engagement"]["connect"]["has_secret"] is False

    def fake_execute(capability_id: str, target: Any, **kwargs: Any) -> dict[str, Any]:
        assert capability_id == "anonymous-ldap-probe"
        assert target.username is None
        assert target.password is None
        assert target.hashes is None
        assert target.ccache is None
        assert target.aes_key is None
        assert target.use_kerberos is False
        return {"ok": True, "result": {"ok": True, "findings": []}}

    with patch("adaf_attack.core.runner.execute_capability", side_effect=fake_execute):
        allowed = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={"capability_id": "anonymous-ldap-probe", "options": {}},
        )
    assert allowed.status_code == 200
    assert allowed.json()["status"] == "completed"

    with patch("adaf_attack.core.runner.execute_capability") as engine_run:
        blocked = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={"capability_id": "ldap-enum", "options": {}},
        )
    assert blocked.status_code == 403
    assert "not declared anonymous" in blocked.json()["detail"]
    engine_run.assert_not_called()


def test_anonymous_connect_and_run_reject_target_credentials(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = _engagement(client)
    with patch("adaf_attack.cli._doctor_payload") as doctor:
        refused = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={
                "domain": "corp.local",
                "dc": "10.0.0.10",
                "auth_mode": "anonymous",
                "username": "operator",
                "password": "fixture-only",
            },
        )
    assert refused.status_code == 400
    assert "anonymous mode cannot include" in refused.json()["detail"].lower()
    doctor.assert_not_called()

    fake_preflight = {
        "ok": True,
        "ready": True,
        "checks": [{"id": "dc-ldap", "status": "ok", "scope": "live-ad", "value": "ok"}],
        "blocking_checks": [],
        "advisory_checks": [],
        "next_step": "plan",
    }
    with patch("adaf_attack.cli._doctor_payload", return_value=fake_preflight):
        connected = client.post(
            f"/api/engagements/{engagement['id']}/connect",
            json={"domain": "corp.local", "dc": "10.0.0.10", "auth_mode": "anonymous"},
        )
    assert connected.status_code == 200
    with patch("adaf_attack.core.runner.execute_capability") as engine_run:
        run = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={
                "capability_id": "anonymous-ldap-probe",
                "options": {"password": "fixture-only"},
            },
        )
    assert run.status_code == 403
    assert "cannot accept" in run.json()["detail"].lower()
    engine_run.assert_not_called()
