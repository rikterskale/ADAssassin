"""Thin adapter over the pinned ADAF-ATTACK package."""

from __future__ import annotations

import shutil
from importlib import metadata, util
from typing import Any

from adassassin import ENGINE_COMMIT, ENGINE_PIN


def lane_for(risk: str, environment: str) -> str:
    if environment == "offline" and risk == "observe":
        return "green"
    if risk in {"destructive", "side_effect"}:
        return "red"
    return "yellow"


def _tool_readiness(tool: str) -> dict[str, Any]:
    normalized = tool.strip().lower()
    if normalized == "impacket":
        available = util.find_spec("impacket") is not None
        return {
            "id": tool,
            "available": available,
            "detail": "Python package installed" if available else "Install adaf-attack[kerberos]",
        }
    if normalized == "certipy":
        installed = False
        try:
            metadata.version("certipy-ad")
            installed = True
        except metadata.PackageNotFoundError:
            pass
        available = installed and shutil.which("certipy") is not None
        return {
            "id": tool,
            "available": available,
            "detail": "certipy-ad and CLI available" if available else "Install adaf-attack[certipy]",
        }
    available = shutil.which(tool) is not None
    return {
        "id": tool,
        "available": available,
        "detail": "CLI available" if available else f"'{tool}' is not on PATH",
    }


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
    dependencies = [_tool_readiness(tool) for tool in cap.tools]
    runner_available = cap.runner is not None
    ready = runner_available and all(item["available"] for item in dependencies)
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
        "runnable": ready,
        "readiness": {
            "ready": ready,
            "runner_available": runner_available,
            "verification": cap.maturity,
            "dependencies": dependencies,
            "reason": (
                "ready"
                if ready
                else (
                    "engine runner unavailable"
                    if not runner_available
                    else "missing declared dependencies"
                )
            ),
        },
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
