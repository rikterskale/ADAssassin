from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from adassassin import ENGINE_COMMIT, ENGINE_PIN, __version__
from adassassin.catalog import catalog_payload, get_capability
from adassassin.config import Settings, get_settings
from adassassin.doctor import run_doctor
from adassassin.engagements import (
    create_engagement,
    ensure_demo,
    get_engagement,
    get_job,
    list_engagements,
    mark_guided,
)
from adassassin.engine import probe
from adassassin.findings import (
    FindingError,
    explain_finding,
    get_finding,
    list_findings,
    set_finding_status,
)
from adassassin.guide import glossary_payload, guide_payload
from adassassin.rollback import RollbackError, apply_rollback, list_rollback, preview_rollback
from adassassin.runner import RunRefused, execute_run
from adassassin.targets import TargetError, connect_engagement
from adassassin.vault import VaultServiceError, list_vault, unmask_vault_item

WEBAPP = Path(__file__).resolve().parent / "webapp"


class EngagementIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    domain: str = ""
    dc: str = ""
    notes: str = ""


class GuidedMarkIn(BaseModel):
    step_id: str = Field(min_length=1, max_length=40)


class ConnectIn(BaseModel):
    domain: str = Field(min_length=1, max_length=255)
    dc: str = Field(min_length=1, max_length=255)
    username: str = ""
    password: str | None = None
    hashes: str | None = None
    timeout: float = Field(default=3.0, ge=0.2, le=30.0)


class RunIn(BaseModel):
    capability_id: str = Field(min_length=1, max_length=120)
    options: dict[str, Any] = Field(default_factory=dict)
    ack: bool = False
    force: bool = False
    confirm: str = ""
    actor: str = "operator"


class FindingStatusIn(BaseModel):
    status: str = Field(min_length=1, max_length=20)


class VaultUnmaskIn(BaseModel):
    scope: str = "engagement"
    ttl_seconds: int = Field(default=30, ge=5, le=300)


class RollbackApplyIn(BaseModel):
    force: bool = False
    ack: bool = False
    confirm: str = ""
    session_id: str | None = None


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
            "phase": "5",
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

    @app.get("/api/catalog/{capability_id}")
    def catalog_item(capability_id: str) -> dict[str, Any]:
        item = get_capability(capability_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Capability not found")
        return {"ok": True, "capability": item}

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

    @app.post("/api/engagements/{engagement_id}/connect")
    def engagement_connect(engagement_id: str, body: ConnectIn) -> dict[str, Any]:
        try:
            result = connect_engagement(
                settings,
                engagement_id,
                domain=body.domain,
                dc=body.dc,
                username=body.username,
                password=body.password,
                hashes=body.hashes,
                timeout=body.timeout,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except TargetError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "ok": True,
            "engagement": result["engagement"],
            "preflight": result["preflight"],
        }

    @app.post("/api/engagements/{engagement_id}/run")
    def engagement_run(engagement_id: str, body: RunIn) -> dict[str, Any]:
        try:
            result = execute_run(
                settings,
                engagement_id,
                capability_id=body.capability_id,
                options=body.options,
                ack=body.ack,
                force=body.force,
                confirm=body.confirm,
                actor=body.actor or "operator",
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RunRefused as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        job = result["job"]
        return {
            "ok": job.get("status") == "completed",
            "job_id": job["id"],
            "status": job["status"],
            "findings": job.get("findings") or [],
            "job": job,
            "engagement": result["engagement"],
        }

    @app.get("/api/engagements/{engagement_id}/jobs/{job_id}")
    def engagement_job(engagement_id: str, job_id: str) -> dict[str, Any]:
        if get_engagement(settings, engagement_id) is None:
            raise HTTPException(status_code=404, detail="Engagement not found")
        job = get_job(settings, engagement_id, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"ok": True, "job": job}

    @app.get("/api/engagements/{engagement_id}/findings")
    def engagement_findings(engagement_id: str) -> dict[str, Any]:
        try:
            return list_findings(settings, engagement_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/engagements/{engagement_id}/findings/{finding_id}")
    def engagement_finding(engagement_id: str, finding_id: str) -> dict[str, Any]:
        try:
            return get_finding(settings, engagement_id, finding_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/engagements/{engagement_id}/findings/{finding_id}/explain")
    def engagement_finding_explain(engagement_id: str, finding_id: str) -> dict[str, Any]:
        try:
            return explain_finding(settings, engagement_id, finding_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/engagements/{engagement_id}/findings/{finding_id}/status")
    def engagement_finding_status(
        engagement_id: str, finding_id: str, body: FindingStatusIn
    ) -> dict[str, Any]:
        try:
            return set_finding_status(
                settings, engagement_id, finding_id, status=body.status
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except FindingError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/engagements/{engagement_id}/vault")
    def engagement_vault(engagement_id: str) -> dict[str, Any]:
        try:
            return list_vault(settings, engagement_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/engagements/{engagement_id}/vault/{name}/unmask")
    def engagement_vault_unmask(
        engagement_id: str, name: str, body: VaultUnmaskIn
    ) -> dict[str, Any]:
        try:
            return unmask_vault_item(
                settings,
                engagement_id,
                name,
                scope=body.scope,
                ttl_seconds=body.ttl_seconds,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except VaultServiceError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/engagements/{engagement_id}/rollback")
    def engagement_rollback(engagement_id: str) -> dict[str, Any]:
        try:
            return list_rollback(settings, engagement_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/engagements/{engagement_id}/rollback/preview")
    def engagement_rollback_preview(engagement_id: str) -> dict[str, Any]:
        try:
            return preview_rollback(settings, engagement_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/api/engagements/{engagement_id}/rollback/apply")
    def engagement_rollback_apply(
        engagement_id: str, body: RollbackApplyIn
    ) -> dict[str, Any]:
        try:
            return apply_rollback(
                settings,
                engagement_id,
                force=body.force,
                confirm=body.confirm,
                ack=body.ack,
                session_id=body.session_id,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RollbackError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

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
