from pathlib import Path

from fastapi.testclient import TestClient

from adassassin.app import create_app
from adassassin.config import Settings


def _client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(Settings(data_dir=tmp_path)))


def test_demo_report_export_zero_network(tmp_path: Path) -> None:
    client = _client(tmp_path)
    demo = client.post("/api/engagements/demo").json()["engagement"]

    closeout = client.get(f"/api/engagements/{demo['id']}/closeout").json()
    assert closeout["contacts_directory"] is False
    assert closeout["checks"]
    assert {c["id"] for c in closeout["checks"]} >= {
        "authorization-banner",
        "pending-rollback",
        "unmasked-vault",
        "live-sessions",
        "open-findings",
    }

    report = client.get(f"/api/engagements/{demo['id']}/report").json()
    assert report["ok"] is True
    assert report["contacts_directory"] is False
    assert "Authorized internal red-team use only" in report["markdown"]
    assert demo["name"] in report["markdown"] or demo["id"] in report["markdown"]
    assert "Findings" in report["markdown"]
    assert "Closeout checklist" in report["markdown"]
    assert "Capabilities run" in report["markdown"]
    assert "<!doctype html>" in report["html"].lower()
    assert "Authorized internal red-team use only" in report["html"]
    assert report["downloads"]["markdown"].endswith("/report.md")
    assert report["downloads"]["html"].endswith("/report.html")

    md = client.get(f"/api/engagements/{demo['id']}/report.md")
    assert md.status_code == 200
    assert "text/markdown" in md.headers.get("content-type", "")
    assert b"ADAssassin Engagement Report" in md.content

    html = client.get(f"/api/engagements/{demo['id']}/report.html")
    assert html.status_code == 200
    assert "text/html" in html.headers.get("content-type", "")
    assert b"ADAssassin report" in html.content or b"Authorized" in html.content

    detail = client.get(f"/api/engagements/{demo['id']}").json()["engagement"]
    assert detail.get("report", {}).get("markdown_path")
    assert detail["report"]["finding_count"] >= 3


def test_health_phase_six(tmp_path: Path) -> None:
    client = _client(tmp_path)
    health = client.get("/api/health").json()
    assert health["phase"] == "6"
    assert health["version"].startswith("0.7")
