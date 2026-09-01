"""Async run path: POST returns a running job, progress is pollable, result persists."""

import time
from pathlib import Path
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.config import Settings


def _client(tmp_path: Path) -> TestClient:
    # Default (background) run mode: capability runs execute on a worker thread.
    return TestClient(create_app(Settings(data_dir=tmp_path)))


def _wait_completed(
    client: TestClient, engagement_id: str, job_id: str, tries: int = 300
) -> dict[str, Any]:
    job: dict[str, Any] = {}
    for _ in range(tries):
        job = client.get(
            f"/api/engagements/{engagement_id}/jobs/{job_id}"
        ).json()["job"]
        if job.get("status") in {"completed", "failed"}:
            return job
        time.sleep(0.02)
    raise AssertionError(f"job did not finish: {job.get('status')}")


def test_background_run_reports_running_then_completes(tmp_path: Path) -> None:
    client = _client(tmp_path)
    engagement = client.post("/api/engagements", json={"name": "async lab"}).json()[
        "engagement"
    ]

    release = {"go": False}

    def fake_execute(capability_id: str, target: Any, **kwargs: Any) -> dict[str, Any]:
        log = kwargs.get("log")
        if callable(log):
            log("engine: starting")
        # Block until the test has observed the running state, then finish.
        for _ in range(500):
            if release["go"]:
                break
            time.sleep(0.01)
        if callable(log):
            log("engine: done")
        return {
            "ok": True,
            "capability": capability_id,
            "session_id": "sess-async",
            "session_path": str(tmp_path / "sess-async"),
            "result": {
                "ok": True,
                "findings": [
                    {
                        "id": "async-finding-1",
                        "title": "Async observe finding",
                        "severity": "medium",
                        "impact": "Fixture from a backgrounded run.",
                    }
                ],
            },
            "auth": "anonymous",
            "outcome": {"status": "success"},
        }

    with patch("adaf_attack.core.runner.execute_capability", side_effect=fake_execute):
        started = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={"capability_id": "attack-paths", "options": {}, "ack": False},
        )
        assert started.status_code == 200
        body = started.json()
        assert body["status"] == "running"
        job_id = body["job_id"]

        # While the engine is blocked, the job endpoint reports live status.
        live = client.get(
            f"/api/engagements/{engagement['id']}/jobs/{job_id}"
        ).json()["job"]
        assert live["status"] == "running"

        # Release the engine and poll to completion.
        release["go"] = True
        job = _wait_completed(client, engagement["id"], job_id)

    assert job["status"] == "completed"
    assert any(f["id"] == "async-finding-1" for f in job["findings"])

    detail = client.get(f"/api/engagements/{engagement['id']}").json()["engagement"]
    assert any(f["id"] == "async-finding-1" for f in detail["findings"])
    assert "observe-run" in detail["guided_marked"]
