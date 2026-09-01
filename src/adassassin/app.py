from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from adassassin import ENGINE_COMMIT, ENGINE_PIN, __version__
from adassassin.catalog import catalog_payload
from adassassin.config import Settings, get_settings
from adassassin.doctor import run_doctor
from adassassin.engagements import (
    create_engagement,
    ensure_demo,
    get_engagement,
    list_engagements,
    mark_guided,
)
from adassassin.engine import probe
from adassassin.guide import glossary_payload, guide_payload

WEBAPP = Path(__file__).resolve().parent / "webapp"


class EngagementIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    domain: str = ""
    dc: str = ""
    notes: str = ""


class GuidedMarkIn(BaseModel):
    step_id: str = Field(min_length=1, max_length=40)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.engagements_dir.mkdir(parents=True, exist_ok=True)
    app = FastAPI(title="ADAssassin", version=__version__, docs_url=None, redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict[str, Any]:
        engine = probe()
        catalog = catalog_payload()
        return {
            "ok": True,
            "product": "adassassin",
            "version": __version__,
            "phase": "1",
            "engine": engine,
            "engine_pin": ENGINE_PIN,
            "engine_commit": ENGINE_COMMIT,
            "catalog_count": catalog["count"],
            "catalog_source": catalog["source"],
            "bind": f"{settings.host}:{settings.port}",
        }

    @app.get("/api/doctor")
    def doctor() -> dict[str, Any]:
        return run_doctor(settings)

    @app.get("/api/guide")
    def guide() -> dict[str, Any]:
        marked: list[str] = []
        for item in list_engagements(settings):
            marked.extend(item.get("guided_marked") or [])
        return guide_payload(settings, marked)

    @app.get("/api/glossary")
    def glossary() -> dict[str, Any]:
        return glossary_payload()

    @app.get("/api/catalog")
    def catalog() -> dict[str, Any]:
        return catalog_payload()

    @app.get("/api/engagements")
    def engagements() -> dict[str, Any]:
        return {"ok": True, "engagements": list_engagements(settings)}

    @app.post("/api/engagements")
    def new_engagement(body: EngagementIn) -> dict[str, Any]:
        item = create_engagement(
            settings,
            name=body.name,
            domain=body.domain,
            dc=body.dc,
            notes=body.notes,
        )
        return {"ok": True, "engagement": item}

    @app.post("/api/engagements/demo")
    def demo_engagement() -> dict[str, Any]:
        return {"ok": True, "engagement": ensure_demo(settings)}

    @app.post("/api/engagements/{engagement_id}/guided")
    def guided_mark(engagement_id: str, body: GuidedMarkIn) -> dict[str, Any]:
        item = mark_guided(settings, engagement_id, body.step_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Engagement not found")
        return {"ok": True, "engagement": item}

    @app.get("/api/engagements/{engagement_id}")
    def engagement_detail(engagement_id: str) -> dict[str, Any]:
        item = get_engagement(settings, engagement_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Engagement not found")
        return {"ok": True, "engagement": item}

    if WEBAPP.joinpath("index.html").exists():
        assets = WEBAPP / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{full_path:path}")
        def spa(full_path: str) -> FileResponse:
            candidate = WEBAPP / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(WEBAPP / "index.html")

    return app
