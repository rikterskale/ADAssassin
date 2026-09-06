from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.requests import Request
from starlette.responses import Response

from adassassin import ENGINE_COMMIT, ENGINE_PIN, __version__
from adassassin.catalog import catalog_payload, get_capability
from adassassin.config import Settings, get_settings, is_loopback_host
from adassassin.doctor import run_doctor
from adassassin.engagements import (
    create_engagement,
    ensure_demo,
    get_engagement,
    get_job,
    list_engagements,
    mark_guided,
    reconcile_interrupted_jobs,
    set_engagement_archived,
    update_engagement_metadata,
)
from adassassin.engine import probe
from adassassin.findings import (
    FindingError,
    explain_finding,
    get_finding,
    list_findings,
    set_finding_status,
)
from adassassin.guide import VISIT_TRACKED_STEPS, glossary_payload, guide_payload
from adassassin.report import build_engagement_bundle, build_report, closeout_checklist, report_file
from adassassin.rollback import RollbackError, apply_rollback, list_rollback, preview_rollback
from adassassin.runner import RunRefused, execute_run, get_live_job
from adassassin.targets import TargetError, connect_engagement, invalidate_connections_on_startup
from adassassin.vault import VaultServiceError, list_vault, unmask_vault_item

WEBAPP = Path(__file__).resolve().parent / "webapp"

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)


def apply_security_headers(path: str, headers: MutableHeaders) -> None:
    """Browser-hardening headers for the local single-operator console."""
    headers.setdefault("X-Content-Type-Options", "nosniff")
    headers.setdefault("X-Frame-Options", "DENY")
    headers.setdefault("Referrer-Policy", "no-referrer")
    headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), usb=()",
    )
    headers.setdefault("X-DNS-Prefetch-Control", "off")
    headers.setdefault("Content-Security-Policy", CSP)
    if path.startswith("/api/"):
        headers.setdefault("Cache-Control", "no-store")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        apply_security_headers(request.url.path, response.headers)
        return response


def _webapp_file(full_path: str) -> Path | None:
    """Resolve a request path to a real file inside WEBAPP, or return None.

    Guards the SPA catch-all against path traversal: any resolved path that
    escapes the webapp directory (``../`` segments, absolute paths, symlinks)
    is rejected so only bundled assets can be served.
    """
    if not full_path:
        return None
    root = WEBAPP.resolve()
    candidate = (root / full_path).resolve()
    if not candidate.is_relative_to(root):
        return None
    return candidate if candidate.is_file() else None


class EngagementIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=120)
    domain: str = Field(default="", max_length=255)
    dc: str = Field(default="", max_length=255)
    notes: str = Field(default="", max_length=10_000)


class ArchiveIn(BaseModel):
    archived: bool = True


class GuidedMarkIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    step_id: str = Field(min_length=1, max_length=40)


class ConnectIn(BaseModel):
    domain: str = Field(min_length=1, max_length=255)
    dc: str = Field(min_length=1, max_length=255)
    username: str = Field(default="", max_length=320)
    password: str | None = Field(default=None, max_length=4096)
    hashes: str | None = Field(default=None, max_length=4096)
    timeout: float = Field(default=3.0, ge=0.2, le=30.0)

    @field_validator("domain", "dc")
    @classmethod
    def target_value_must_not_be_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @field_validator("username")
    @classmethod
    def trim_username(cls, value: str) -> str:
        return value.strip()


class RunIn(BaseModel):
    capability_id: str = Field(min_length=1, max_length=120)
    options: dict[str, Any] = Field(default_factory=dict)
    ack: bool = False
    force: bool = False
    confirm: str = Field(default="", max_length=120)
    actor: str = Field(default="operator", max_length=120)
    approval_token: SecretStr | None = None
    approval_engagement_id: str = Field(default="", max_length=120)

    @field_validator("capability_id", "confirm", "actor", "approval_engagement_id")
    @classmethod
    def trim_run_metadata(cls, value: str) -> str:
        return value.strip()


class FindingStatusIn(BaseModel):
    status: str = Field(min_length=1, max_length=20)


class VaultUnmaskIn(BaseModel):
    scope: str = "engagement"
    ttl_seconds: int = Field(default=30, ge=5, le=300)


class RollbackApplyIn(BaseModel):
    force: bool = False
    ack: bool = False
    confirm: str = Field(default="", max_length=10)
    session_id: str | None = Field(default=None, max_length=255)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    if not is_loopback_host(settings.host):
        raise ValueError("ADAssassin refuses non-loopback bind settings")
    settings.ensure_data_dirs()
    reconcile_interrupted_jobs(settings)
    invalidate_connections_on_startup(settings)
    app = FastAPI(title="ADAssassin", version=__version__, docs_url=None, redoc_url=None)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["127.0.0.1", "localhost", "testserver"],
    )
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
            "phase": "6",
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
    def guide(engagement_id: str | None = None) -> dict[str, Any]:
        return guide_payload(settings, engagement_id=engagement_id)

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

    @app.patch("/api/engagements/{engagement_id}")
    def edit_engagement(engagement_id: str, body: EngagementIn) -> dict[str, Any]:
        try:
            item = update_engagement_metadata(
                settings,
                engagement_id,
                name=body.name,
                domain=body.domain,
                dc=body.dc,
                notes=body.notes,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True, "engagement": item}

    @app.post("/api/engagements/{engagement_id}/archive")
    def archive_engagement(engagement_id: str, body: ArchiveIn) -> dict[str, Any]:
        try:
            item = set_engagement_archived(settings, engagement_id, archived=body.archived)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"ok": True, "engagement": item}

    @app.post("/api/engagements/demo")
    def demo_engagement() -> dict[str, Any]:
        return {"ok": True, "engagement": ensure_demo(settings)}

    @app.post("/api/engagements/{engagement_id}/guided")
    def guided_mark(engagement_id: str, body: GuidedMarkIn) -> dict[str, Any]:
        if body.step_id not in VISIT_TRACKED_STEPS:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This step completes automatically from real engagement activity; "
                    "it cannot be marked manually."
                ),
            )
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
                approval_token=(
                    body.approval_token.get_secret_value() if body.approval_token else None
                ),
                approval_engagement_id=body.approval_engagement_id or None,
                background=not settings.run_synchronous,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RunRefused as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
        job = result["job"]
        return {
            # A run now starts in the background; "running" is an accepted start.
            "ok": job.get("status") != "failed",
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
        # Prefer the live registry so an in-flight run reports fresh status/log.
        job = get_live_job(engagement_id, job_id) or get_job(settings, engagement_id, job_id)
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
            return set_finding_status(settings, engagement_id, finding_id, status=body.status)
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
    def engagement_rollback_apply(engagement_id: str, body: RollbackApplyIn) -> dict[str, Any]:
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

    @app.get("/api/engagements/{engagement_id}/closeout")
    def engagement_closeout(engagement_id: str) -> dict[str, Any]:
        try:
            return closeout_checklist(settings, engagement_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/engagements/{engagement_id}/report")
    def engagement_report(engagement_id: str) -> dict[str, Any]:
        try:
            return build_report(settings, engagement_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/engagements/{engagement_id}/report.md")
    def engagement_report_md(engagement_id: str) -> FileResponse:
        try:
            path = report_file(settings, engagement_id, fmt="md")
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return FileResponse(
            path,
            media_type="text/markdown; charset=utf-8",
            filename=f"{engagement_id}-report.md",
        )

    @app.get("/api/engagements/{engagement_id}/report.html")
    def engagement_report_html(engagement_id: str) -> FileResponse:
        try:
            path = report_file(settings, engagement_id, fmt="html")
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return FileResponse(
            path,
            media_type="text/html; charset=utf-8",
            filename=f"{engagement_id}-report.html",
        )

    @app.get("/api/engagements/{engagement_id}/bundle.zip")
    def engagement_bundle(engagement_id: str) -> FileResponse:
        try:
            path = build_engagement_bundle(settings, engagement_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return FileResponse(
            path,
            media_type="application/zip",
            filename=f"{engagement_id}-evidence-bundle.zip",
        )

    @app.get("/operator-guide.md")
    def operator_guide() -> FileResponse:
        candidates = [
            WEBAPP / "START_HERE.md",
            Path(__file__).resolve().parents[2] / "docs" / "START_HERE.md",
        ]
        for candidate in candidates:
            if candidate.is_file():
                return FileResponse(
                    candidate,
                    media_type="text/markdown; charset=utf-8",
                    filename="ADAssassin-START-HERE.md",
                )
        raise HTTPException(status_code=404, detail="Packaged operator guide not found")

    if WEBAPP.joinpath("index.html").exists():
        assets = WEBAPP / "assets"
        if assets.is_dir():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/{full_path:path}")
        def spa(full_path: str) -> FileResponse:
            candidate = _webapp_file(full_path)
            if candidate is not None:
                return FileResponse(candidate)
            return FileResponse(WEBAPP / "index.html")

    return app
