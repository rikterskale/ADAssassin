"""Offline readiness checks. Never contacts a domain controller."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from adassassin import ENGINE_COMMIT, ENGINE_PIN, __version__
from adassassin.catalog import catalog_payload
from adassassin.config import Settings, is_loopback_host
from adassassin.engine import probe

WEBAPP = Path(__file__).resolve().parent / "webapp"


def _check(name: str, ok: bool, detail: str, *, level: str = "fail") -> dict[str, Any]:
    status = "pass" if ok else level
    return {"id": name, "ok": ok, "status": status, "detail": detail}


def run_doctor(settings: Settings) -> dict[str, Any]:
    engine = probe()
    catalog = catalog_payload()
    data_ok = False
    try:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        probe_file = settings.data_dir / ".write-probe"
        probe_file.write_text("ok", encoding="utf-8")
        probe_file.unlink(missing_ok=True)
        data_ok = True
    except OSError as exc:
        data_error = str(exc)
    else:
        data_error = ""

    py_ok = sys.version_info >= (3, 11)
    catalog_ok = catalog.get("count", 0) >= 90
    webapp_ok = (WEBAPP / "index.html").exists()
    localhost = is_loopback_host(settings.host)
    capabilities = list(catalog.get("capabilities") or [])
    ready_capabilities = sum(
        bool((item.get("readiness") or {}).get("ready")) for item in capabilities
    )
    blocked_capabilities = len(capabilities) - ready_capabilities

    checks = [
        _check("python", py_ok, f"Python {sys.version.split()[0]} (need 3.11+)"),
        _check("data-dir", data_ok, f"{settings.data_dir}" if data_ok else data_error),
        _check(
            "catalog",
            catalog_ok,
            f"{catalog.get('count', 0)} capabilities via {catalog.get('source')}",
        ),
        _check(
            "engine",
            engine["available"],
            (
                f"adaf-attack {engine.get('version') or ENGINE_PIN} imported"
                if engine["available"]
                else f"not imported ({engine.get('error') or 'unavailable'}); catalog fallback active"
            ),
            level="warn",
        ),
        _check(
            "capability-readiness",
            blocked_capabilities == 0,
            f"{ready_capabilities}/{len(capabilities)} capabilities locally ready; "
            f"{blocked_capabilities} blocked by engine or declared dependencies",
            level="warn",
        ),
        _check(
            "webapp",
            webapp_ok,
            str(WEBAPP / "index.html") if webapp_ok else "webapp/index.html missing",
        ),
        _check(
            "bind",
            localhost,
            f"{settings.host}:{settings.port}",
            level="warn",
        ),
    ]
    failed = [item for item in checks if item["status"] == "fail"]
    warned = [item for item in checks if item["status"] == "warn"]
    return {
        "ok": not failed,
        "product": "adassassin",
        "version": __version__,
        "engine_pin": ENGINE_PIN,
        "engine_commit": ENGINE_COMMIT,
        "contacts_directory": False,
        "summary": "ready" if not failed and not warned else ("ready-with-warnings" if not failed else "blocked"),
        "checks": checks,
        "capability_readiness": {
            "total": len(capabilities),
            "ready": ready_capabilities,
            "blocked": blocked_capabilities,
        },
    }
