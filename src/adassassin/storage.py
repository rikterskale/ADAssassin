"""Private filesystem helpers for app-owned engagement data."""

from __future__ import annotations

import os
from pathlib import Path


def ensure_private_dir(path: Path) -> Path:
    """Create an app data directory and restrict it to the current user on POSIX."""
    path.mkdir(parents=True, exist_ok=True)
    if os.name != "nt":
        path.chmod(0o700)
    return path


def protect_private_file(path: Path) -> Path:
    """Restrict an existing app data file to the current user on POSIX."""
    if os.name != "nt":
        path.chmod(0o600)
    return path


def write_private_text(path: Path, value: str, *, encoding: str = "utf-8") -> Path:
    """Write text with owner-only permissions, without a world-readable creation window."""
    ensure_private_dir(path.parent)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(path, flags, 0o600)
    try:
        with os.fdopen(fd, "w", encoding=encoding) as handle:
            handle.write(value)
    except BaseException:
        # fdopen owns the descriptor after it succeeds. If it failed before
        # taking ownership, closing an already-closed descriptor is harmless.
        try:
            os.close(fd)
        except OSError:
            pass
        raise
    protect_private_file(path)
    return path
