"""Regression tests for the SPA static-file catch-all (path traversal guard)."""

from __future__ import annotations

from adassassin.app import WEBAPP, _webapp_file


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
