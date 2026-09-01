from pathlib import Path

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
    guide = client.get("/api/guide").json()
    assert "demo" in guide["completed"]
    glossary = client.get("/api/glossary").json()
    assert glossary["items"]
    marked = client.post(
        f"/api/engagements/{demo['id']}/guided",
        json={"step_id": "glossary"},
    ).json()
    assert "glossary" in marked["engagement"]["guided_marked"]
