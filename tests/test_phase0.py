from pathlib import Path

from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.config import Settings


def test_health_catalog_and_demo(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    client = TestClient(create_app(settings))

    health = client.get("/api/health").json()
    assert health["ok"] is True
    assert health["catalog_count"] == 92
    assert health["engine_pin"] == "0.10.1"
    assert health["engine_commit"] == "fdb60b90b910ba3dcbd582e2c72ce48189191214"
    assert "engine" in health
    assert health["bind"].startswith("127.0.0.1:")

    catalog = client.get("/api/catalog").json()
    assert catalog["count"] == 92
    assert catalog["source"] in {"engine", "bundled", "pinned-markdown"}

    demo = client.post("/api/engagements/demo").json()["engagement"]
    assert demo["mode"] == "demo"
    assert len(demo["findings"]) == 3
    assert (tmp_path / "engagements" / f"{demo['id']}.json").exists()

    listed = client.get("/api/engagements").json()["engagements"]
    assert any(item["id"] == demo["id"] for item in listed)

    detail = client.get(f"/api/engagements/{demo['id']}").json()["engagement"]
    assert detail["id"] == demo["id"]
