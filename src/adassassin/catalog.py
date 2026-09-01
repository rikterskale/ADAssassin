from __future__ import annotations

import json
import urllib.error
import urllib.request
from functools import lru_cache
from importlib import resources
from typing import Any

from adassassin import ENGINE_COMMIT, ENGINE_PIN
from adassassin.engine import capability_detail, lane_for, live_catalog

CATALOG_URL = (
    "https://raw.githubusercontent.com/rikterskale/ADAF-ATTACK/"
    f"{ENGINE_COMMIT}/docs/CAPABILITY_CATALOG.md"
)


def _tools(raw: str) -> list[str]:
    if raw in {"-", "—", ""}:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def _dash(raw: str) -> str | None:
    return None if raw in {"-", "—", ""} else raw


def parse_catalog_markdown(text: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for line in text.splitlines():
        if not line.startswith("| `"):
            continue
        cols = [col.strip() for col in line.strip("|").split("|")]
        risk = cols[7]
        environment = cols[3]
        lane = lane_for(risk, environment)
        items.append(
            {
                "id": cols[0].strip("`"),
                "summary": cols[15],
                "category": cols[1],
                "maturity": cols[2],
                "environment": environment,
                "tools": _tools(cols[4]),
                "fixture": _dash(cols[5]),
                "risk": risk,
                "approval": cols[8],
                "rollback": cols[9],
                "auth_modes": _tools(cols[10]),
                "requires_username_list": cols[11].lower() == "yes",
                "active_authentication": cols[12].lower() == "yes",
                "noise": cols[13],
                "sensitivity": cols[14],
                "lane": lane,
                "required_prompts": [],
                "runnable": lane in {"green", "yellow"} and risk == "observe",
            }
        )
    return items


def _bundled_catalog() -> dict[str, Any] | None:
    try:
        data = resources.files("adassassin").joinpath("data/catalog.json").read_text(
            encoding="utf-8"
        )
    except (FileNotFoundError, ModuleNotFoundError, OSError):
        return None
    try:
        payload = json.loads(data)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict) or not payload.get("capabilities"):
        return None
    payload.setdefault("source", "bundled")
    payload.setdefault("engine_version", ENGINE_PIN)
    payload.setdefault("engine_commit", ENGINE_COMMIT)
    payload["count"] = len(payload["capabilities"])
    return payload


def _remote_catalog() -> dict[str, Any]:
    with urllib.request.urlopen(CATALOG_URL, timeout=20) as response:
        text = response.read().decode("utf-8")
    items = parse_catalog_markdown(text)
    return {
        "source": "pinned-markdown",
        "engine_version": ENGINE_PIN,
        "engine_commit": ENGINE_COMMIT,
        "count": len(items),
        "capabilities": items,
    }


@lru_cache(maxsize=1)
def static_catalog() -> dict[str, Any]:
    """Offline-first catalog: bundled pin snapshot, else remote markdown."""
    bundled = _bundled_catalog()
    if bundled is not None:
        return bundled
    try:
        return _remote_catalog()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {
            "source": "unavailable",
            "engine_version": ENGINE_PIN,
            "engine_commit": ENGINE_COMMIT,
            "count": 0,
            "capabilities": [],
            "error": str(exc),
        }


def bundled_catalog() -> dict[str, Any]:
    """Public alias used by tests and the API."""
    return static_catalog()


def catalog_payload() -> dict[str, Any]:
    """Prefer live engine registry. Never require network when the engine is live."""
    live = live_catalog()
    if live is not None:
        return {
            "source": "engine",
            "engine_version": ENGINE_PIN,
            "engine_commit": ENGINE_COMMIT,
            "count": len(live),
            "capabilities": live,
        }
    return static_catalog()


def get_capability(capability_id: str) -> dict[str, Any] | None:
    detail = capability_detail(capability_id)
    if detail is not None:
        return detail
    for item in catalog_payload().get("capabilities", []):
        if item.get("id") == capability_id:
            return item
    return None
