from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from typing import Any

from adassassin.engine import live_catalog


@lru_cache(maxsize=1)
def bundled_catalog() -> dict[str, Any]:
    data = resources.files("adassassin").joinpath("data/catalog.json").read_text(encoding="utf-8")
    return json.loads(data)


def catalog_payload() -> dict[str, Any]:
    bundled = bundled_catalog()
    live = live_catalog()
    if live is None:
        return {
            "source": "bundled",
            "engine_version": bundled["engine_version"],
            "engine_commit": bundled["engine_commit"],
            "count": bundled["count"],
            "capabilities": bundled["capabilities"],
        }
    return {
        "source": "engine",
        "engine_version": bundled["engine_version"],
        "engine_commit": bundled["engine_commit"],
        "count": len(live),
        "capabilities": live,
    }
