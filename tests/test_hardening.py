from __future__ import annotations

import os
from pathlib import Path
from threading import Thread
from typing import Any
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.cli import main
from adassassin.config import Settings
from adassassin.engagements import create_engagement, get_engagement, update_engagement


def _client(tmp_path: Path, *, synchronous: bool = True) -> TestClient:
    return TestClient(
        create_app(
            Settings(
                data_dir=tmp_path,
                open_browser=False,
                run_synchronous=synchronous,
            )
        )
    )


def _connect(client: TestClient, engagement_id: str) -> None:
    preflight = {
        "ok": True,
        "ready": True,
        "profile": "live-ad",
        "checks": [],
        "blocking_checks": [],
        "advisory_checks": [],
        "next_step": "ready",
    }
    with patch("adaf_attack.cli._doctor_payload", return_value=preflight):
        response = client.post(
            f"/api/engagements/{engagement_id}/connect",
            json={"domain": "corp.local", "dc": "127.0.0.1"},
        )
    assert response.status_code == 200


def test_demo_is_permanently_offline(tmp_path: Path) -> None:
    client = _client(tmp_path)
    demo = client.post("/api/engagements/demo").json()["engagement"]

    with patch("adaf_attack.cli._doctor_payload") as doctor:
        connect = client.post(
            f"/api/engagements/{demo['id']}/connect",
            json={"domain": "corp.local", "dc": "127.0.0.1"},
        )
    assert connect.status_code == 400
    doctor.assert_not_called()

    without_connect = client.post(
        f"/api/engagements/{demo['id']}/run",
        json={"capability_id": "dcsync"},
    )
    assert without_connect.status_code == 403
    assert "offline demo" in without_connect.json()["detail"].lower()

    def _legacy_connect(item: dict[str, Any]) -> None:
        item["connect"] = {
            "domain": "corp.local",
            "dc": "127.0.0.1",
            "preflight_ok": True,
        }

    update_engagement(Settings(data_dir=tmp_path), demo["id"], _legacy_connect)
    with patch("adaf_attack.core.runner.execute_capability") as execute:
        run = client.post(
            f"/api/engagements/{demo['id']}/run",
            json={
                "capability_id": "dcsync",
                "ack": True,
                "force": True,
                "confirm": "dcsync",
            },
        )
    assert run.status_code == 403
    execute.assert_not_called()

    with patch("adaf_attack.core.cleanup.execute_cleanup") as cleanup:
        rollback = client.post(
            f"/api/engagements/{demo['id']}/rollback/apply",
            json={"ack": True, "force": True, "confirm": "YES"},
        )
    assert rollback.status_code == 403
    cleanup.assert_not_called()


def test_demo_vault_key_survives_restart(tmp_path: Path) -> None:
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("ADAF_SESSION_VAULT_KEY", None)
        first = _client(tmp_path)
        demo = first.post("/api/engagements/demo").json()["engagement"]
        before = first.post(
            f"/api/engagements/{demo['id']}/vault/demo-hash/unmask",
            json={"scope": "engagement", "ttl_seconds": 5},
        )
        assert before.status_code == 200

        restarted = _client(tmp_path)
        after = restarted.post(
            f"/api/engagements/{demo['id']}/vault/demo-hash/unmask",
            json={"scope": "engagement", "ttl_seconds": 5},
        )
    assert after.status_code == 200
    assert after.json()["item"]["value"] == before.json()["item"]["value"]


def test_live_vault_uses_engine_operator_key(tmp_path: Path) -> None:
    from adaf_attack.core.vault import SessionVault

    key = Fernet.generate_key().decode("ascii")
    settings = Settings(data_dir=tmp_path)
    engagement = create_engagement(settings, name="vault lab")
    workspace = tmp_path / "workspaces" / engagement["id"]
    with patch.dict(os.environ, {"ADAF_SESSION_VAULT_KEY": key}):
        SessionVault(workspace, key=key).put(
            "fixture-secret", "secret", {"value": "fixture"}, secret=True
        )
        client = _client(tmp_path)
        response = client.post(
            f"/api/engagements/{engagement['id']}/vault/fixture-secret/unmask",
            json={"scope": "engagement", "ttl_seconds": 5},
        )
    assert response.status_code == 200
    assert response.json()["item"]["value"] == {"value": "fixture"}


def test_scoped_approval_is_required_and_forwarded_without_persistence(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = client.post("/api/engagements", json={"name": "scoped lab"}).json()[
        "engagement"
    ]
    _connect(client, engagement["id"])
    body = {
        "capability_id": "password-spray",
        "options": {"spray_password": "fixture-only"},
        "ack": True,
        "force": True,
        "confirm": "password-spray",
    }
    refused = client.post(f"/api/engagements/{engagement['id']}/run", json=body)
    assert refused.status_code == 403
    assert "scoped approval" in refused.json()["detail"].lower()

    def fake_execute(_capability_id: str, _target: Any, **kwargs: Any) -> dict[str, Any]:
        assert kwargs["approval_token"] == "fixture-token"
        assert kwargs["approval_engagement_id"] == "approval-123"
        return {"ok": True, "result": {}}

    with patch("adaf_attack.core.runner.execute_capability", side_effect=fake_execute):
        accepted = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={
                **body,
                "approval_token": "fixture-token",
                "approval_engagement_id": "approval-123",
            },
        )
    assert accepted.status_code == 200
    raw = (tmp_path / "engagements" / f"{engagement['id']}.json").read_text()
    assert "fixture-token" not in raw
    assert "approval-123" not in raw


def test_live_jobs_are_scoped_to_engagement(tmp_path: Path) -> None:
    client = _client(tmp_path)
    first = client.post("/api/engagements", json={"name": "first"}).json()["engagement"]
    second = client.post("/api/engagements", json={"name": "second"}).json()["engagement"]
    with patch(
        "adaf_attack.core.runner.execute_capability", return_value={"ok": True, "result": {}}
    ):
        run = client.post(
            f"/api/engagements/{first['id']}/run",
            json={"capability_id": "attack-paths", "options": {}},
        ).json()
    wrong = client.get(f"/api/engagements/{second['id']}/jobs/{run['job_id']}")
    assert wrong.status_code == 404


def test_restart_reconciles_abandoned_running_jobs(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    engagement = create_engagement(settings, name="restart lab")

    def _queue(item: dict[str, Any]) -> None:
        item["jobs"] = [{"id": "job-1", "status": "running", "log": []}]

    update_engagement(settings, engagement["id"], _queue)
    create_app(settings)
    recovered = get_engagement(settings, engagement["id"])
    assert recovered is not None
    assert recovered["jobs"][0]["status"] == "interrupted"
    assert "restart" in recovered["jobs"][0]["error"].lower()


def test_catalog_reports_real_readiness_and_fallback_is_not_runnable() -> None:
    from adassassin.catalog import catalog_payload

    live = catalog_payload()
    assert live["count"] == 92
    assert all(capability.get("readiness") for capability in live["capabilities"])
    assert all(
        capability["runnable"] == capability["readiness"]["ready"]
        for capability in live["capabilities"]
    )
    assert {
        capability["id"]
        for capability in live["capabilities"]
        if capability.get("approval") == "scoped_token"
    } == {"coerce", "impacket-exec", "password-spray"}
    with patch("adassassin.catalog.live_catalog", return_value=None):
        fallback = catalog_payload()
    assert fallback["count"] == 92
    assert not any(capability["runnable"] for capability in fallback["capabilities"])


def test_api_refuses_a_capability_that_is_not_locally_ready(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = client.post("/api/engagements", json={"name": "readiness lab"}).json()[
        "engagement"
    ]
    blocked = {
        "id": "fixture-blocked",
        "risk": "observe",
        "lane": "green",
        "runnable": False,
        "readiness": {"ready": False, "reason": "missing declared dependencies"},
    }
    with (
        patch("adassassin.runner._catalog_entry", return_value=blocked),
        patch("adaf_attack.core.runner.execute_capability") as execute,
    ):
        response = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={"capability_id": "fixture-blocked"},
        )
    assert response.status_code == 409
    assert "not locally ready" in response.json()["detail"].lower()
    execute.assert_not_called()


def test_non_loopback_bind_is_refused(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="non-loopback"):
        create_app(Settings(data_dir=tmp_path, host="0.0.0.0"))
    with pytest.raises(SystemExit):
        main(["--host", "0.0.0.0", "--no-browser"])
    client = _client(tmp_path)
    assert client.get("/api/health", headers={"host": "attacker.example"}).status_code == 400


def test_transactional_updates_do_not_lose_concurrent_changes(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    engagement = create_engagement(settings, name="concurrency lab")

    def worker(index: int) -> None:
        def _append(item: dict[str, Any]) -> None:
            events = list(item.get("test_events") or [])
            events.append(index)
            item["test_events"] = events

        update_engagement(settings, engagement["id"], _append)

    threads = [Thread(target=worker, args=(index,)) for index in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    saved = get_engagement(settings, engagement["id"])
    assert saved is not None
    assert sorted(saved["test_events"]) == list(range(20))
