from __future__ import annotations

import json
import os
from pathlib import Path
from threading import Thread
from typing import Any
from unittest.mock import patch
from zipfile import ZipFile

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.cli import main
from adassassin.config import Settings
from adassassin.engagements import (
    create_engagement,
    get_engagement,
    set_engagement_archived,
    update_engagement,
    update_engagement_metadata,
)
from adassassin.guide import guide_payload
from adassassin.report import build_engagement_bundle
from adassassin.runner import RunRefused, _validate_and_coerce_options, execute_run
from adassassin.targets import TargetError, connect_engagement, has_successful_connect


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
    assert "fixture-only" not in raw


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


def test_preflight_uses_ready_and_restart_invalidates_target_state(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, run_synchronous=True)
    engagement = create_engagement(settings, name="target lab")
    not_ready = {
        "ok": True,
        "ready": False,
        "checks": [],
        "blocking_checks": ["dc-ldap"],
        "advisory_checks": [],
        "next_step": "repair connectivity",
    }
    with patch("adaf_attack.cli._doctor_payload", return_value=not_ready):
        result = connect_engagement(
            settings,
            engagement["id"],
            domain="corp.local",
            dc="dc01.corp.local",
            password="fixture secret",
        )
    assert result["preflight"]["ok"] is True
    assert result["preflight"]["ready"] is False
    assert result["engagement"]["connect"]["preflight_ok"] is False
    assert result["engagement"]["connect"]["has_secret"] is False
    assert has_successful_connect(result["engagement"]) is False

    ready = {**not_ready, "ready": True, "blocking_checks": [], "next_step": "ready"}
    with patch("adaf_attack.cli._doctor_payload", return_value=ready):
        connected = connect_engagement(
            settings,
            engagement["id"],
            domain="corp.local",
            dc="dc01.corp.local",
            password="fixture secret",
        )["engagement"]
    assert has_successful_connect(connected) is True
    create_app(settings)
    restarted = get_engagement(settings, engagement["id"])
    assert restarted is not None
    assert restarted["connect"]["status"] == "reconnect_required"
    assert restarted["connect"]["preflight_ok"] is False
    assert restarted["connect"]["secret_ref"] is None
    assert has_successful_connect(restarted) is False


def test_failed_reconnect_revokes_the_previous_target_assertion(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, run_synchronous=True)
    engagement = create_engagement(settings, name="reconnect failure lab")
    ready = {
        "ok": True,
        "ready": True,
        "checks": [],
        "blocking_checks": [],
        "advisory_checks": [],
        "next_step": "ready",
    }
    with patch("adaf_attack.cli._doctor_payload", return_value=ready):
        connected = connect_engagement(
            settings,
            engagement["id"],
            domain="corp.local",
            dc="dc01.corp.local",
            password="first fixture secret",
        )["engagement"]
    assert has_successful_connect(connected)

    with (
        patch("adassassin.targets.run_preflight", side_effect=RuntimeError("probe unavailable")),
        pytest.raises(TargetError, match="previous target approval was revoked"),
    ):
        connect_engagement(
            settings,
            engagement["id"],
            domain="other.local",
            dc="dc01.other.local",
            password="replacement fixture secret",
        )
    revoked = get_engagement(settings, engagement["id"])
    assert revoked is not None
    assert revoked["connect"]["status"] == "reconnect_required"
    assert revoked["connect"]["has_secret"] is False
    assert has_successful_connect(revoked) is False


def test_run_target_must_exactly_match_current_preflight(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, run_synchronous=True)
    engagement = create_engagement(settings, name="scope lab")
    ready = {
        "ok": True,
        "ready": True,
        "checks": [],
        "blocking_checks": [],
        "advisory_checks": [],
        "next_step": "ready",
    }
    with patch("adaf_attack.cli._doctor_payload", return_value=ready):
        connect_engagement(
            settings,
            engagement["id"],
            domain="corp.local",
            dc="dc01.corp.local",
        )
    with (
        patch("adaf_attack.core.runner.execute_capability") as engine_run,
        pytest.raises(RunRefused, match="does not match"),
    ):
        execute_run(
            settings,
            engagement["id"],
            capability_id="acl-enum",
            options={"domain": "other.local", "dc_ip": "other-dc.local"},
            background=False,
        )
    engine_run.assert_not_called()


def test_catalog_prompts_have_typed_validation_metadata() -> None:
    from adassassin.catalog import catalog_payload

    prompts = [
        prompt
        for capability in catalog_payload()["capabilities"]
        for prompt in capability.get("required_prompts") or []
    ]
    assert prompts
    assert all(prompt.get("key") and prompt.get("input_type") for prompt in prompts)
    assert all(prompt.get("required") is True for prompt in prompts)
    assert all(
        prompt.get("source") == "engagement_target"
        for prompt in prompts
        if prompt.get("key") in {"domain", "dc_ip"}
    )

    policy_probe = next(
        capability
        for capability in catalog_payload()["capabilities"]
        if capability["id"] == "adcs-policy-probe"
    )
    artifact = next(
        prompt
        for prompt in policy_probe["required_prompts"]
        if prompt.get("key") == "artifact"
    )
    assert artifact["input_type"] == "path"
    assert artifact["source"] == "operator"
    with pytest.raises(RunRefused, match="Authorized evidence file path"):
        _validate_and_coerce_options(policy_probe, {})
    assert all(
        prompt.get("source") == "safety_gate"
        for prompt in prompts
        if prompt.get("key") == "force"
    )


def test_required_operator_prompts_are_rejected_before_engine_start(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, run_synchronous=True)
    engagement = create_engagement(settings, name="prompt lab", demo=True)
    entry = {
        "id": "fixture-typed",
        "risk": "observe",
        "lane": "green",
        "runnable": True,
        "readiness": {"ready": True},
        "required_prompts": [
            {
                "key": "operation",
                "label": "Operation",
                "required": True,
                "input_type": "select",
                "choices": ["one", "two"],
                "source": "operator",
            }
        ],
    }
    with (
        patch("adassassin.runner._catalog_entry", return_value=entry),
        patch("adaf_attack.core.runner.execute_capability") as engine_run,
        pytest.raises(RunRefused, match="Required input missing"),
    ):
        execute_run(
            settings,
            engagement["id"],
            capability_id="fixture-typed",
            background=False,
        )
    engine_run.assert_not_called()


def test_typed_operator_prompts_are_coerced_and_validated(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, run_synchronous=True)
    engagement = create_engagement(settings, name="typed prompt lab", demo=True)
    entry = {
        "id": "fixture-typed",
        "risk": "observe",
        "lane": "green",
        "runnable": True,
        "readiness": {"ready": True},
        "required_prompts": [
            {
                "key": "count",
                "label": "Count",
                "required": True,
                "input_type": "integer",
                "source": "operator",
            },
            {
                "key": "enabled",
                "label": "Enabled",
                "required": True,
                "input_type": "boolean",
                "source": "operator",
            },
            {
                "key": "sid",
                "label": "SID",
                "required": True,
                "input_type": "text",
                "pattern": r"^S-\d(?:-\d+)+$",
                "pattern_help": "Use a valid SID.",
                "source": "operator",
            },
        ],
    }

    def fake_execute(_capability_id: str, _target: Any, **kwargs: Any) -> dict[str, Any]:
        assert kwargs["count"] == 7
        assert kwargs["enabled"] is False
        assert kwargs["sid"] == "S-1-5-21"
        return {"ok": True, "result": {}}

    with (
        patch("adassassin.runner._catalog_entry", return_value=entry),
        patch("adaf_attack.core.runner.execute_capability", side_effect=fake_execute),
    ):
        result = execute_run(
            settings,
            engagement["id"],
            capability_id="fixture-typed",
            options={"count": "7", "enabled": "false", "sid": "S-1-5-21"},
            background=False,
        )
    assert result["job"]["status"] == "completed"

    with (
        patch("adassassin.runner._catalog_entry", return_value=entry),
        patch("adaf_attack.core.runner.execute_capability") as engine_run,
        pytest.raises(RunRefused, match="Use a valid SID"),
    ):
        execute_run(
            settings,
            engagement["id"],
            capability_id="fixture-typed",
            options={"count": "7", "enabled": "false", "sid": "not-a-sid"},
            background=False,
        )
    engine_run.assert_not_called()


def test_target_edit_and_archive_revoke_live_connection(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, run_synchronous=True)
    engagement = create_engagement(settings, name="lifecycle lab")
    ready = {
        "ok": True,
        "ready": True,
        "checks": [],
        "blocking_checks": [],
        "advisory_checks": [],
        "next_step": "ready",
    }
    with patch("adaf_attack.cli._doctor_payload", return_value=ready):
        connected = connect_engagement(
            settings,
            engagement["id"],
            domain="corp.local",
            dc="dc01.corp.local",
            password="fixture secret",
        )["engagement"]
    assert has_successful_connect(connected)

    edited = update_engagement_metadata(
        settings,
        engagement["id"],
        name="Renamed lifecycle lab",
        domain="new.corp.local",
        dc="dc02.new.corp.local",
        notes="Scope updated by operator.",
    )
    assert edited["connect"]["status"] == "reconnect_required"
    assert edited["connect"]["has_secret"] is False
    assert edited["engagement_audit"][-1]["target_changed"] is True
    assert has_successful_connect(edited) is False

    archived = set_engagement_archived(settings, engagement["id"], archived=True)
    assert archived["archived"] is True
    assert archived["engagement_audit"][-1]["action"] == "archived"
    restored = set_engagement_archived(settings, engagement["id"], archived=False)
    assert restored["archived"] is False
    assert restored["engagement_audit"][-1]["action"] == "restored"

    update_engagement(
        settings,
        engagement["id"],
        lambda item: item.update(
            {
                "jobs": [
                    {
                        "id": "active-job",
                        "capability_id": "acl-enum",
                        "status": "running",
                    }
                ]
            }
        ),
    )
    with pytest.raises(ValueError, match="target cannot change"):
        update_engagement_metadata(
            settings,
            engagement["id"],
            name="Blocked retarget",
            domain="third.corp.local",
            dc="dc03.third.corp.local",
        )
    with pytest.raises(ValueError, match="before archiving"):
        set_engagement_archived(settings, engagement["id"], archived=True)
    with pytest.raises(TargetError, match="running capability"):
        connect_engagement(
            settings,
            engagement["id"],
            domain="new.corp.local",
            dc="dc02.new.corp.local",
        )


def test_guide_progress_is_scoped_and_red_is_optional(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    first = create_engagement(settings, name="first")
    second = create_engagement(settings, name="second")
    update_engagement(
        settings,
        first["id"],
        lambda item: item.update(
            {
                "jobs": [
                    {
                        "id": "job-observe",
                        "status": "completed",
                        "risk": "observe",
                        "lane": "green",
                    }
                ]
            }
        ),
    )
    assert "observe-run" in guide_payload(settings, engagement_id=first["id"])["completed"]
    second_guide = guide_payload(settings, engagement_id=second["id"])
    assert "observe-run" not in second_guide["completed"]
    red = next(step for step in second_guide["steps"] if step["id"] == "red-run")
    assert red["optional"] is True
    assert second_guide["next"]["id"] != "red-run"


def test_portable_bundle_has_manifest_and_no_reusable_connect_state(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    engagement = create_engagement(settings, name="bundle lab")
    update_engagement(
        settings,
        engagement["id"],
        lambda item: item.update(
            {
                "connect": {
                    "domain": "corp.local",
                    "dc": "dc01.corp.local",
                    "secret_ref": f"memory:{engagement['id']}:bind",
                    "has_secret": True,
                    "preflight_ok": True,
                },
                "red_ack_audit": [
                    {
                        "id": "legacy-event",
                        "options": {
                            "spray_password": "legacy-secret-value",
                            "method": "wmiexec",
                        },
                    }
                ],
            }
        ),
    )
    path = build_engagement_bundle(settings, engagement["id"])
    assert path.is_file()
    with ZipFile(path) as archive:
        names = set(archive.namelist())
        assert {"manifest.json", "README.txt", "engagement/engagement.json"} <= names
        manifest = json.loads(archive.read("manifest.json"))
        portable = json.loads(archive.read("engagement/engagement.json"))
    assert manifest["format"] == "adassassin-evidence-bundle-v1"
    assert manifest["entries"]
    assert portable["connect"]["secret_ref"] is None
    assert portable["connect"]["has_secret"] is False
    assert portable["connect"]["preflight_ok"] is False
    assert portable["red_ack_audit"][0]["options"]["spray_password"] == "***"
    assert portable["red_ack_audit"][0]["options"]["method"] == "wmiexec"
    assert b"legacy-secret-value" not in path.read_bytes()


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


def test_cli_honors_environment_port_and_browser_settings(tmp_path: Path) -> None:
    env = {
        "ADASSASSIN_DATA_DIR": str(tmp_path),
        "ADASSASSIN_PORT": "9123",
        "ADASSASSIN_OPEN_BROWSER": "false",
    }
    with (
        patch.dict(os.environ, env),
        patch("adassassin.cli.Timer") as timer,
        patch("adassassin.cli.uvicorn.run") as run,
    ):
        assert main([]) == 0
    timer.assert_not_called()
    assert run.call_args.kwargs["port"] == 9123


def test_cli_rejects_invalid_port() -> None:
    with pytest.raises(SystemExit):
        main(["--port", "70000", "--no-browser"])


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
