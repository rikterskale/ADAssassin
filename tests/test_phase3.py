from pathlib import Path
from typing import Any
from unittest.mock import patch

from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.config import Settings


def _client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(Settings(data_dir=tmp_path, run_synchronous=True)))


def test_demo_and_live_findings_share_pane(tmp_path: Path) -> None:
    client = _client(tmp_path)
    demo = client.post("/api/engagements/demo").json()["engagement"]
    listed = client.get(f"/api/engagements/{demo['id']}/findings").json()
    assert listed["count"] == 3
    assert listed["grouped"]
    assert {g["severity"] for g in listed["grouped"]} >= {"high", "medium"}

    first = listed["findings"][0]
    detail = client.get(f"/api/engagements/{demo['id']}/findings/{first['id']}").json()
    assert detail["finding"]["id"] == first["id"]
    assert detail["finding"]["status"] == "open"
    assert detail["finding"]["evidence"]

    explained = client.post(
        f"/api/engagements/{demo['id']}/findings/{first['id']}/explain"
    ).json()
    assert explained["explain"]["title"]
    assert explained["remediation"]["steps"]
    assert explained["finding"]["explained"]["meaning"]

    statused = client.post(
        f"/api/engagements/{demo['id']}/findings/{first['id']}/status",
        json={"status": "accepted"},
    ).json()
    assert statused["finding"]["status"] == "accepted"
    reread = client.get(
        f"/api/engagements/{demo['id']}/findings/{first['id']}"
    ).json()["finding"]
    assert reread["status"] == "accepted"

    # Live observe finding uses the same endpoints.
    engagement = client.post(
        "/api/engagements",
        json={"name": "live findings"},
    ).json()["engagement"]

    def fake_execute(capability_id: str, target: Any, **kwargs: Any) -> dict[str, Any]:
        return {
            "ok": True,
            "capability": capability_id,
            "session_id": "sess-f3",
            "session_path": str(tmp_path / "sess-f3"),
            "result": {
                "ok": True,
                "findings": [
                    {
                        "id": "live-observe-1",
                        "title": "Live observe finding",
                        "severity": "medium",
                        "impact": "From mocked observe run.",
                        "evidence": [{"artifact": "outcome.json", "pointer": "/"}],
                        "source_capability": capability_id,
                    }
                ],
            },
            "auth": "anonymous",
            "outcome": {"status": "success"},
        }

    with patch("adaf_attack.core.runner.execute_capability", side_effect=fake_execute):
        run = client.post(
            f"/api/engagements/{engagement['id']}/run",
            json={"capability_id": "attack-paths", "options": {}, "ack": False},
        )
    assert run.status_code == 200
    live_list = client.get(f"/api/engagements/{engagement['id']}/findings").json()
    assert any(item["id"] == "live-observe-1" for item in live_list["findings"])
    live_detail = client.get(
        f"/api/engagements/{engagement['id']}/findings/live-observe-1"
    ).json()["finding"]
    assert live_detail["source"] == "attack-paths"
    assert live_detail["status"] == "open"
    live_explain = client.post(
        f"/api/engagements/{engagement['id']}/findings/live-observe-1/explain"
    ).json()
    assert live_explain["explain"]["id"] == "live-observe-1"
    assert live_explain["remediation"]["steps"]


def test_invalid_finding_status(tmp_path: Path) -> None:
    client = _client(tmp_path)
    demo = client.post("/api/engagements/demo").json()["engagement"]
    finding_id = demo["findings"][0]["id"]
    response = client.post(
        f"/api/engagements/{demo['id']}/findings/{finding_id}/status",
        json={"status": "deleted"},
    )
    assert response.status_code == 400


def test_health_phase_three(tmp_path: Path) -> None:
    client = _client(tmp_path)
    health = client.get("/api/health").json()
    assert int(health["phase"]) >= 3
    assert health["version"].startswith("0.")
