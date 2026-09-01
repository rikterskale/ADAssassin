"""Thin adapter over the pinned ADAF-ATTACK package."""

from __future__ import annotations

from typing import Any

from adassassin import ENGINE_COMMIT, ENGINE_PIN


def lane_for(risk: str, environment: str) -> str:
    if environment == "offline" and risk == "observe":
        return "green"
    if risk in {"destructive", "side_effect"}:
        return "red"
    return "yellow"


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


def _cap_payload(cap: Any) -> dict[str, Any]:
    from adaf_attack.core.novice import plain_description, required_prompts, safety_summary

    safety = cap.safety.as_dict() if cap.safety else {}
    risk = safety.get("risk", "observe")
    lane = lane_for(risk, cap.environment)
    return {
        "id": cap.id,
        "summary": cap.summary,
        "plain": plain_description(cap),
        "category": cap.category,
        "maturity": cap.maturity,
        "environment": cap.environment,
        "tools": list(cap.tools),
        "fixture": cap.fixture,
        "risk": risk,
        "approval": safety.get("approval", "none"),
        "rollback": safety.get("rollback", "none"),
        "auth_modes": list(cap.auth_modes),
        "requires_username_list": cap.requires_username_list,
        "active_authentication": cap.active_authentication,
        "noise": cap.noise_level,
        "sensitivity": cap.data_sensitivity,
        "lane": lane,
        "safety": safety_summary(cap),
        "required_prompts": required_prompts(cap),
        "runnable": (lane in {"green", "yellow"} and risk == "observe") or lane == "red",
        "requires_red_confirm": lane == "red" or risk in {"destructive", "side_effect"},
        "risk_label": (
            "side effect" if risk == "side_effect" else ("destructive" if risk == "destructive" else risk)
        ),
        "rollback_expectation": safety.get("rollback", "none"),
    }


def live_catalog() -> list[dict[str, Any]] | None:
    try:
        from adaf_attack.core.registry import capability_registry, load_builtin_capabilities
    except Exception:
        return None

    load_builtin_capabilities()
    return [_cap_payload(cap) for cap in capability_registry.list()]


def capability_detail(capability_id: str) -> dict[str, Any] | None:
    try:
        from adaf_attack.core.registry import capability_registry, load_builtin_capabilities
    except Exception:
        return None

    load_builtin_capabilities()
    cap = capability_registry.get(capability_id)
    if cap is None:
        return None
    return _cap_payload(cap)
