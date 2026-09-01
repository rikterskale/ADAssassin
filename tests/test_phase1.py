from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.config import Settings


def test_doctor_and_guide(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    client = TestClient(create_app(settings))
    doctor = client.get("/api/doctor").json()
    assert doctor["contacts_directory"] is False
    assert {item["id"] for item in doctor["checks"]} >= {"python", "catalog", "engine"}
    demo = client.post("/api/engagements/demo").json()["engagement"]
    assert demo["mode"] == "demo"
    assert len(demo["findings"]) == 3
    guide = client.get("/api/guide").json()
    assert "demo" in guide["completed"]
    assert [step["id"] for step in guide["steps"][:6]] == [
        "doctor",
        "demo",
        "green-catalog",
        "findings",
        "glossary",
        "engagement",
    ]
    glossary = client.get("/api/glossary").json()
    assert glossary["items"]
    marked = client.post(
        f"/api/engagements/{demo['id']}/guided",
        json={"step_id": "glossary"},
    ).json()
    assert "glossary" in marked["engagement"]["guided_marked"]


def test_missing_engine_is_warn_not_fail(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    client = TestClient(create_app(settings))
    with patch(
        "adassassin.doctor.probe",
        return_value={
            "available": False,
            "version": None,
            "pin": "0.10.1",
            "commit": "fdb60b90b910ba3dcbd582e2c72ce48189191214",
            "capability_count": 0,
            "error": "simulated import failure",
        },
    ):
        doctor = client.get("/api/doctor").json()
    engine = next(item for item in doctor["checks"] if item["id"] == "engine")
    assert engine["status"] == "warn"
    assert doctor["ok"] is True
    assert doctor["contacts_directory"] is False
