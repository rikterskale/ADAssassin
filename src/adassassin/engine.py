"""Thin adapter over the pinned ADAF-ATTACK package."""

from __future__ import annotations

import shutil
import sys
from importlib import metadata, util
from pathlib import Path
from typing import Any

from adassassin import ENGINE_COMMIT, ENGINE_PIN

_SECRET_KEYS = {"password", "new_password", "spray_password", "hashes", "nthash", "aes_key"}
_PATH_KEYS = {"artifact", "ca_pfx", "pfx", "sysvol", "users"}
_CHOICES = {
    "operation": [
        "import-ccache",
        "export-ccache",
        "import-pfx",
        "export-pfx",
        "pem-to-pfx",
        "pfx-to-pem",
    ],
    "method": ["wmiexec", "smbexec", "dcomexec", "atexec"],
    "variant": ["golden", "silver", "sapphire"],
}


def _prompt_key(prompt: dict[str, Any]) -> str:
    if prompt.get("is_param") and prompt.get("param_key"):
        return str(prompt["param_key"])
    return str(prompt.get("option") or "").removeprefix("--").replace("-", "_")


def _typed_prompt(prompt: dict[str, Any]) -> dict[str, Any]:
    """Enrich the engine's prompt copy with UI and API validation metadata."""
    key = _prompt_key(prompt)
    result: dict[str, Any] = {
        **prompt,
        "key": key,
        "required": True,
        "input_type": "text",
        "trim": True,
        "source": "operator",
        "choices": [],
    }
    if key in {"domain", "dc", "dc_ip"}:
        result.update(
            {
                "source": "engagement_target",
                "read_only": True,
                "help": "Locked to the exact target approved by Connect preflight.",
            }
        )
    elif key == "force":
        result.update(
            {
                "source": "safety_gate",
                "read_only": True,
                "input_type": "confirmation",
                "help": "Supplied by the visible RED acknowledgement and typed-confirm gate.",
            }
        )
    elif key in _SECRET_KEYS or any(key.endswith(f"_{suffix}") for suffix in _SECRET_KEYS):
        result.update({"input_type": "secret", "trim": False})
    elif key in _PATH_KEYS:
        result.update({"input_type": "path", "spellcheck": False})
    elif key in _CHOICES:
        result.update({"input_type": "select", "choices": _CHOICES[key]})
    elif key in {"payload", "command", "descriptor_hex"}:
        result.update({"input_type": "textarea", "trim": key == "descriptor_hex"})
    elif key in {"sid", "domain_sid"}:
        result.update({"pattern": r"^S-\d(?:-\d+)+$", "pattern_help": "Use a SID such as S-1-5-21-…"})
    return result


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
        # ``adassassin`` is often launched via an absolute interpreter path
        # (for example ``.venv/bin/python -m adassassin``) without activating
        # that environment.  In that case the venv's bin directory is not on
        # PATH even though its console script is installed and runnable.
        certipy_cli = shutil.which("certipy")
        if certipy_cli is None:
            sibling = Path(sys.executable).resolve().parent / "certipy"
            if sibling.is_file() and sibling.stat().st_mode & 0o111:
                certipy_cli = str(sibling)
        available = installed and certipy_cli is not None
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
        "required_prompts": [_typed_prompt(prompt) for prompt in required_prompts(cap)],
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
