"""Regression tests for the SPA static-file catch-all (path traversal guard)."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from adassassin.app import WEBAPP, _webapp_file, create_app
from adassassin.config import Settings


def test_webapp_file_serves_bundled_index() -> None:
    # The built webapp ships index.html; it must resolve as a real file.
    if not (WEBAPP / "index.html").exists():
        return  # webapp not built in this environment; nothing to assert
    resolved = _webapp_file("index.html")
    assert resolved is not None
    assert resolved == (WEBAPP / "index.html").resolve()


def test_webapp_file_rejects_traversal() -> None:
    # None of these may resolve to anything outside the webapp directory,
    # even though the targets exist on disk.
    for attempt in [
        "../pyproject.toml",
        "../../pyproject.toml",
        "../../../../../../etc/passwd",
        "..%2f..%2fpyproject.toml",
        "assets/../../pyproject.toml",
    ]:
        assert _webapp_file(attempt) is None, attempt


def test_webapp_file_rejects_empty() -> None:
    assert _webapp_file("") is None


def test_api_sets_security_headers(tmp_path: Path) -> None:
    client = TestClient(create_app(Settings(data_dir=tmp_path, open_browser=False)))
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.headers.get("x-content-type-options") == "nosniff"
    assert response.headers.get("x-frame-options") == "DENY"
    assert response.headers.get("referrer-policy") == "no-referrer"
    assert response.headers.get("cache-control") == "no-store"
    csp = response.headers.get("content-security-policy") or ""
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
