"""Engagement workspace paths under the console data dir."""

from __future__ import annotations

from pathlib import Path

from adassassin.config import Settings


def engagement_workspace(settings: Settings, engagement_id: str) -> Path:
    path = settings.data_dir / "workspaces" / engagement_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def session_dirs(settings: Settings, engagement_id: str) -> list[Path]:
    """Return session directories that look like engine sessions under the workspace."""
    root = engagement_workspace(settings, engagement_id)
    found: list[Path] = []
    # Engine sessions are typically workspace/<session_id>/ with session.json
    for child in sorted(root.iterdir() if root.is_dir() else []):
        if child.is_dir() and (child / "session.json").is_file():
            found.append(child)
        # Also accept nested sessions.sqlite workspaces used by runner
        elif child.is_dir():
            for nested in sorted(child.iterdir()):
                if nested.is_dir() and (nested / "session.json").is_file():
                    found.append(nested)
    # Engagement-level vault root uses the workspace itself as SessionVault session_root
    return found
