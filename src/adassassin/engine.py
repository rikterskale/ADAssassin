"""Thin adapter over the pinned ADAF-ATTACK package."""

from __future__ import annotations

from typing import Any

from adassassin import ENGINE_COMMIT, ENGINE_PIN


def probe() -> dict[str, Any]:
    try:
        import adaf_attack
        from adaf_attack.core.registry import capability_registry, load_builtin_capabilities
    except Exception as exc:  # import or optional extra failure
        return {
            "available": False,
            "version": None,
            "pin": ENGINE_PIN,
            "commit": ENGINE_COMMIT,
            "capability_count": 0,
            "error": str(exc),
        }

    load_builtin_capabilities()
    version = getattr(adaf_attack, "__version__", ENGINE_PIN)
    return {
        "available": True,
        "version": version,
        "pin": ENGINE_PIN,
        "commit": ENGINE_COMMIT,
        "capability_count": len(capability_registry.list()),
        "error": None,
    }


def live_catalog() -> list[dict[str, Any]] | None:
    try:
        from adaf_attack.core.novice import plain_description, safety_summary
        from adaf_attack.core.registry import capability_registry, load_builtin_capabilities
    except Exception:
        return None

    load_builtin_capabilities()
    items: list[dict[str, Any]] = []
    for cap in capability_registry.list():
        safety = cap.safety.as_dict() if cap.safety else {}
        items.append(
            {
                "id": cap.id,
                "summary": cap.summary,
                "plain": plain_description(cap),
                "category": cap.category,
                "maturity": cap.maturity,
                "environment": cap.environment,
                "tools": list(cap.tools),
                "fixture": cap.fixture,
                "risk": safety.get("risk", "observe"),
                "approval": safety.get("approval", "none"),
                "rollback": safety.get("rollback", "none"),
                "auth_modes": list(cap.auth_modes),
                "requires_username_list": cap.requires_username_list,
                "active_authentication": cap.active_authentication,
                "noise": cap.noise_level,
                "sensitivity": cap.data_sensitivity,
                "lane": _lane(safety.get("risk", "observe"), cap.environment),
                "safety": safety_summary(cap),
            }
        )
    return items


def _lane(risk: str, environment: str) -> str:
    if environment == "offline" and risk == "observe":
        return "green"
    if risk in {"destructive", "side_effect"}:
        return "red"
    return "yellow"
