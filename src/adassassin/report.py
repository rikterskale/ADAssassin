"""Engagement report export + closeout checklist. Offline-capable; wraps engine report bundle when sessions exist."""

from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path
from typing import Any
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from adassassin import ENGINE_COMMIT, ENGINE_PIN, __version__
from adassassin.config import Settings
from adassassin.engagements import get_engagement, update_engagement
from adassassin.findings import normalize_finding
from adassassin.rollback import list_rollback
from adassassin.storage import ensure_private_dir, protect_private_file, write_private_text
from adassassin.vault import list_vault
from adassassin.workspace import engagement_workspace, session_dirs

AUTHORIZED_BANNER = (
    "Authorized internal red-team use only. Written authorization is required "
    "before any live target work. Availability of this console is not authorization."
)


def _now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def closeout_checklist(settings: Settings, engagement_id: str) -> dict[str, Any]:
    """Operator closeout checklist. Never contacts a directory."""
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")

    rollback = list_rollback(settings, engagement_id)
    vault = list_vault(settings, engagement_id)
    sessions = session_dirs(settings, engagement_id)
    findings = [normalize_finding(f) for f in (item.get("findings") or []) if isinstance(f, dict)]
    open_findings = [f for f in findings if f.get("status") in {"open", "retest"}]
    unmasked = vault.get("unmasked_active") or []

    checks = [
        {
            "id": "authorization-banner",
            "label": "Authorization banner included in export",
            "ok": True,
            "detail": "Report always embeds the authorized-use banner.",
        },
        {
            "id": "pending-rollback",
            "label": "No pending rollback leftovers",
            "ok": int(rollback.get("pending") or 0) == 0,
            "detail": f"Pending cleanup entries: {rollback.get('pending', 0)}",
        },
        {
            "id": "unmasked-vault",
            "label": "No active unmasked vault items",
            "ok": len(unmasked) == 0,
            "detail": (
                "No active unmasks."
                if not unmasked
                else "Active unmasks: " + ", ".join(str(u.get("name")) for u in unmasked)
            ),
        },
        {
            "id": "live-sessions",
            "label": "Review live engine sessions",
            "ok": True,
            "detail": f"Engine sessions under workspace: {len(sessions)}",
            "informational": True,
        },
        {
            "id": "open-findings",
            "label": "Open/retest findings reviewed",
            "ok": len(open_findings) == 0,
            "detail": f"Open or retest findings: {len(open_findings)}",
        },
    ]
    blocking = [c for c in checks if not c["ok"] and not c.get("informational")]
    return {
        "ok": True,
        "engagement_id": engagement_id,
        "ready": len(blocking) == 0,
        "checks": checks,
        "summary": {
            "pending_rollback": rollback.get("pending", 0),
            "unmasked_vault": len(unmasked),
            "live_sessions": len(sessions),
            "open_findings": len(open_findings),
            "capabilities_run": len(item.get("jobs") or []),
        },
        "contacts_directory": False,
    }


def _capabilities_run(item: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for job in item.get("jobs") or []:
        if not isinstance(job, dict):
            continue
        rows.append(
            {
                "job_id": job.get("id"),
                "capability_id": job.get("capability_id"),
                "lane": job.get("lane"),
                "risk": job.get("risk"),
                "status": job.get("status"),
                "created_at": job.get("created_at"),
                "red": bool(job.get("red")),
            }
        )
    return rows


def _markdown_report(
    item: dict[str, Any],
    *,
    findings: list[dict[str, Any]],
    capabilities: list[dict[str, Any]],
    rollback: dict[str, Any],
    closeout: dict[str, Any],
    engine_artifacts: list[dict[str, Any]],
) -> str:
    lines: list[str] = []
    lines.append("# ADAssassin Engagement Report")
    lines.append("")
    lines.append(f"> {AUTHORIZED_BANNER}")
    lines.append("")
    lines.append(f"- **Generated:** {_now()}")
    lines.append(f"- **Product:** adassassin {__version__}")
    lines.append(f"- **Engine pin:** adaf-attack {ENGINE_PIN} @ `{ENGINE_COMMIT}`")
    lines.append(f"- **Engagement:** `{item.get('id')}` — {item.get('name')}")
    lines.append(f"- **Mode:** {item.get('mode')}")
    lines.append("")
    lines.append("## Scope notes")
    lines.append("")
    lines.append(f"- **Domain:** `{item.get('domain') or '—'}`")
    lines.append(f"- **DC:** `{item.get('dc') or '—'}`")
    lines.append(f"- **Username:** `{item.get('username') or '—'}`")
    lines.append(f"- **Target contacted:** {'yes' if item.get('target_contacted') else 'no'}")
    notes = str(item.get("notes") or "").strip() or "_No scope notes recorded._"
    lines.append("")
    lines.append(notes)
    lines.append("")
    lines.append("## Capabilities run")
    lines.append("")
    if not capabilities:
        lines.append("_No capabilities have been run in this engagement._")
    else:
        lines.append("| When | Capability | Lane | Risk | Status |")
        lines.append("| --- | --- | --- | --- | --- |")
        for row in capabilities:
            lines.append(
                f"| {row.get('created_at') or '—'} | `{row.get('capability_id')}` | "
                f"{row.get('lane') or '—'} | {row.get('risk') or '—'} | {row.get('status') or '—'} |"
            )
    lines.append("")
    lines.append("## Findings")
    lines.append("")
    if not findings:
        lines.append("_No findings attached._")
    else:
        for finding in findings:
            lines.append(
                f"### [{str(finding.get('severity') or 'info').upper()}] {finding.get('title')}"
            )
            lines.append("")
            lines.append(f"- **ID:** `{finding.get('id')}`")
            lines.append(f"- **Status:** {finding.get('status')}")
            lines.append(f"- **Source:** {finding.get('source')}")
            lines.append(f"- **Summary:** {finding.get('summary')}")
            if finding.get("remediation"):
                lines.append(f"- **Remediation:** {finding.get('remediation')}")
            evidence = finding.get("evidence") or []
            if evidence:
                refs = ", ".join(
                    f"`{e.get('artifact')}` {e.get('pointer') or '/'}" for e in evidence if isinstance(e, dict)
                )
                lines.append(f"- **Evidence:** {refs}")
            lines.append("")
    lines.append("## Rollback leftovers")
    lines.append("")
    lines.append(
        f"- Pending: **{rollback.get('pending', 0)}** · Failed: **{rollback.get('failed', 0)}** · "
        f"Completed: **{rollback.get('completed', 0)}**"
    )
    for entry in rollback.get("entries") or []:
        if entry.get("status") != "pending":
            continue
        lines.append(
            f"- pending `{entry.get('kind')}` on `{entry.get('target')}` "
            f"(session `{entry.get('session_id')}`)"
        )
    lines.append("")
    lines.append("## Closeout checklist")
    lines.append("")
    for check in closeout.get("checks") or []:
        mark = "PASS" if check.get("ok") else "OPEN"
        lines.append(f"- **{mark}** {check.get('label')} — {check.get('detail')}")
    lines.append("")
    if engine_artifacts:
        lines.append("## Engine report artifacts")
        lines.append("")
        for art in engine_artifacts:
            lines.append(
                f"- session `{art.get('session_id')}`: findings={art.get('finding_count', 0)} "
                f"paths={', '.join(art.get('paths') or []) or 'none'}"
            )
        lines.append("")
    lines.append("---")
    lines.append("")
    lines.append(AUTHORIZED_BANNER)
    lines.append("")
    return "\n".join(lines)


def _html_report(markdown_like_title: str, item: dict[str, Any], body_sections: str) -> str:
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        f"<title>{_esc(markdown_like_title)}</title>"
        "<style>"
        "body{font-family:'IBM Plex Sans',Segoe UI,sans-serif;background:#090b0e;color:#efe6d2;"
        "margin:0;line-height:1.5;-webkit-font-smoothing:antialiased}"
        "main{max-width:960px;margin:auto;padding:40px 28px 64px}"
        ".banner{border:1px solid rgba(224,178,90,.45);color:#e0b25a;padding:12px 14px;margin-bottom:24px;"
        "letter-spacing:.06em;text-transform:uppercase;font-size:12px}"
        "h1,h2,h3{font-weight:500;letter-spacing:-.02em} h1{font-size:28px;margin:0 0 8px}"
        "h2{color:#e0b25a;border-bottom:1px solid rgba(232,214,176,.12);padding-bottom:8px;margin:28px 0 12px;"
        "font-size:13px;letter-spacing:.16em;text-transform:uppercase}"
        ".meta{color:#8d8674} .card{border:1px solid rgba(232,214,176,.12);padding:14px 16px;margin:10px 0;"
        "background:#10141a}"
        "table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid rgba(232,214,176,.12);"
        "padding:8px;text-align:left;vertical-align:top} th{color:#8d8674;font-size:11px;letter-spacing:.08em;"
        "text-transform:uppercase;font-weight:500}"
        "code{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:12px}"
        ".ok{color:#7ea36b} .open{color:#d45a32}"
        ".sev-high{color:#d45a32} .sev-med{color:#d2a54a} .sev-low{color:#7ea36b}"
        "@media print{body{background:#fff;color:#111} .banner{color:#111;border-color:#111}"
        "h2{color:#111} .card{background:#fff} .ok{color:#0a6} .open,.sev-high{color:#a30}"
        ".meta{color:#444}}"
        "</style></head><body><main>"
        f"<div class='banner'>{_esc(AUTHORIZED_BANNER)}</div>"
        f"<h1>{_esc(markdown_like_title)}</h1>"
        f"<p class='meta'>adassassin {_esc(__version__)} · engine {_esc(ENGINE_PIN)} @ {_esc(ENGINE_COMMIT)} · "
        f"generated {_esc(_now())}</p>"
        f"{body_sections}"
        f"<p class='meta' style='margin-top:36px'>{_esc(AUTHORIZED_BANNER)}</p>"
        "</main></body></html>"
    )


def _html_body(
    item: dict[str, Any],
    *,
    findings: list[dict[str, Any]],
    capabilities: list[dict[str, Any]],
    rollback: dict[str, Any],
    closeout: dict[str, Any],
) -> str:
    parts: list[str] = []
    parts.append("<h2>Scope notes</h2>")
    parts.append(
        "<div class='card'>"
        f"<div>Domain: <code>{_esc(item.get('domain') or '—')}</code></div>"
        f"<div>DC: <code>{_esc(item.get('dc') or '—')}</code></div>"
        f"<div>Username: <code>{_esc(item.get('username') or '—')}</code></div>"
        f"<div>Target contacted: {_esc('yes' if item.get('target_contacted') else 'no')}</div>"
        f"<p>{_esc(item.get('notes') or 'No scope notes recorded.')}</p>"
        "</div>"
    )
    parts.append("<h2>Capabilities run</h2>")
    if not capabilities:
        parts.append("<p class='meta'>No capabilities have been run.</p>")
    else:
        rows = "".join(
            "<tr>"
            f"<td>{_esc(row.get('created_at'))}</td>"
            f"<td><code>{_esc(row.get('capability_id'))}</code></td>"
            f"<td>{_esc(row.get('lane'))}</td>"
            f"<td>{_esc(row.get('risk'))}</td>"
            f"<td>{_esc(row.get('status'))}</td>"
            "</tr>"
            for row in capabilities
        )
        parts.append(
            "<table><tr><th>When</th><th>Capability</th><th>Lane</th><th>Risk</th><th>Status</th></tr>"
            f"{rows}</table>"
        )
    parts.append("<h2>Findings</h2>")
    if not findings:
        parts.append("<p class='meta'>No findings attached.</p>")
    else:
        for finding in findings:
            sev = str(finding.get("severity") or "info").lower()
            sev_cls = (
                "sev-high"
                if sev in {"critical", "high"}
                else "sev-med" if sev == "medium" else "sev-low"
            )
            parts.append(
                "<div class='card'>"
                f"<h3><span class='{sev_cls}'>[{_esc(str(finding.get('severity') or 'info').upper())}]</span> "
                f"{_esc(finding.get('title'))}</h3>"
                f"<div class='meta'>{_esc(finding.get('id'))} · status {_esc(finding.get('status'))} · "
                f"source {_esc(finding.get('source'))}</div>"
                f"<p>{_esc(finding.get('summary'))}</p>"
                f"<p><b>Remediation:</b> {_esc(finding.get('remediation') or '—')}</p>"
                "</div>"
            )
    parts.append("<h2>Rollback leftovers</h2>")
    parts.append(
        "<p>"
        f"Pending: <b>{_esc(rollback.get('pending', 0))}</b> · "
        f"Failed: <b>{_esc(rollback.get('failed', 0))}</b> · "
        f"Completed: <b>{_esc(rollback.get('completed', 0))}</b>"
        "</p>"
    )
    parts.append("<h2>Closeout checklist</h2>")
    for check in closeout.get("checks") or []:
        cls = "ok" if check.get("ok") else "open"
        mark = "PASS" if check.get("ok") else "OPEN"
        parts.append(
            f"<div class='card'><span class='{cls}'>{mark}</span> {_esc(check.get('label'))}"
            f"<div class='meta'>{_esc(check.get('detail'))}</div></div>"
        )
    return "".join(parts)


def _engine_session_reports(
    settings: Settings, engagement_id: str
) -> list[dict[str, Any]]:
    """Wrap engine generate_report_bundle for each session when available."""
    artifacts: list[dict[str, Any]] = []
    try:
        from adaf_attack.core.reporting import generate_report_bundle
    except Exception:
        return artifacts

    for session in session_dirs(settings, engagement_id):
        try:
            paths = generate_report_bundle(session, engagement_id=engagement_id)
            path_names = [
                key for key, value in paths.items() if key != "finding_count" and isinstance(value, str)
            ]
            artifacts.append(
                {
                    "session_id": session.name,
                    "session_path": str(session),
                    "finding_count": paths.get("finding_count", 0),
                    "paths": path_names,
                    "manifest": {k: v for k, v in paths.items() if k != "finding_count"},
                }
            )
        except Exception as exc:
            artifacts.append(
                {
                    "session_id": session.name,
                    "session_path": str(session),
                    "error": str(exc),
                    "finding_count": 0,
                    "paths": [],
                }
            )
    return artifacts


def build_report(settings: Settings, engagement_id: str) -> dict[str, Any]:
    """Build markdown + HTML report for an engagement with zero network required."""
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")

    findings = [normalize_finding(f) for f in (item.get("findings") or []) if isinstance(f, dict)]
    capabilities = _capabilities_run(item)
    rollback = list_rollback(settings, engagement_id)
    closeout = closeout_checklist(settings, engagement_id)
    engine_artifacts = _engine_session_reports(settings, engagement_id)

    markdown = _markdown_report(
        item,
        findings=findings,
        capabilities=capabilities,
        rollback=rollback,
        closeout=closeout,
        engine_artifacts=engine_artifacts,
    )
    html_doc = _html_report(
        f"ADAssassin report — {item.get('name')}",
        item,
        _html_body(
            item,
            findings=findings,
            capabilities=capabilities,
            rollback=rollback,
            closeout=closeout,
        ),
    )

    out_dir = engagement_workspace(settings, engagement_id) / "reports"
    ensure_private_dir(out_dir)
    stamp = uuid4().hex[:8]
    md_path = out_dir / f"engagement-report-{stamp}.md"
    html_path = out_dir / f"engagement-report-{stamp}.html"
    write_private_text(md_path, markdown)
    write_private_text(html_path, html_doc)

    # Stable latest aliases for UI download links.
    latest_md = out_dir / "engagement-report.md"
    latest_html = out_dir / "engagement-report.html"
    write_private_text(latest_md, markdown)
    write_private_text(latest_html, html_doc)

    report_meta = {
        "generated_at": _now(),
        "markdown_path": str(latest_md),
        "html_path": str(latest_html),
        "closeout_ready": bool(closeout.get("ready")),
        "finding_count": len(findings),
        "capabilities_run": len(capabilities),
    }
    saved = update_engagement(
        settings,
        engagement_id,
        lambda current: current.update({"report": report_meta}),
    )

    return {
        "ok": True,
        "engagement_id": engagement_id,
        "generated_at": report_meta["generated_at"],
        "markdown": markdown,
        "html": html_doc,
        "downloads": {
            "markdown": f"/api/engagements/{engagement_id}/report.md",
            "html": f"/api/engagements/{engagement_id}/report.html",
        },
        "paths": {
            "markdown": str(latest_md),
            "html": str(latest_html),
        },
        "closeout": closeout,
        "engine_artifacts": engine_artifacts,
        "engagement": saved,
        "contacts_directory": False,
    }


def report_file(settings: Settings, engagement_id: str, *, fmt: str) -> Path:
    """Return the latest report file path, generating if missing."""
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")
    out_dir = engagement_workspace(settings, engagement_id) / "reports"
    target = out_dir / ("engagement-report.md" if fmt == "md" else "engagement-report.html")
    if not target.is_file():
        build_report(settings, engagement_id)
    if not target.is_file():
        raise LookupError("Report file not found")
    return target


def _portable_engagement(item: dict[str, Any]) -> dict[str, Any]:
    """Remove process-local references while retaining the evidence/audit record."""
    payload = json.loads(json.dumps(item))
    connect = payload.get("connect")
    if isinstance(connect, dict):
        connect["secret_ref"] = None
        connect["has_secret"] = False
        connect["preflight_ok"] = False
        connect["status"] = "reconnect_required"
        connect["invalidated_reason"] = (
            "Imported bundles never carry credentials or reusable preflight state."
        )
    sensitive_names = {
        "password",
        "hash",
        "hashes",
        "nthash",
        "aes_key",
        "secret",
        "ticket",
        "token",
        "vault_key",
    }
    for event in payload.get("red_ack_audit") or []:
        options = event.get("options") if isinstance(event, dict) else None
        if not isinstance(options, dict):
            continue
        event["options"] = {
            key: (
                "***"
                if key.lower() in sensitive_names
                or any(key.lower().endswith(f"_{name}") for name in sensitive_names)
                else value
            )
            for key, value in options.items()
        }
    return payload


def build_engagement_bundle(settings: Settings, engagement_id: str) -> Path:
    """Create a portable, checksummed evidence ZIP without plaintext bind secrets."""
    build_report(settings, engagement_id)
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")

    workspace = engagement_workspace(settings, engagement_id)
    reports = ensure_private_dir(workspace / "reports")
    target = reports / "engagement-evidence-bundle.zip"
    temporary = reports / "engagement-evidence-bundle.zip.tmp"
    files: list[tuple[str, bytes]] = []
    portable = json.dumps(_portable_engagement(item), indent=2, sort_keys=True).encode("utf-8") + b"\n"
    files.append(("engagement/engagement.json", portable))

    for path in sorted(workspace.rglob("*")):
        if not path.is_file() or path in {target, temporary}:
            continue
        if path.is_symlink() or not path.resolve().is_relative_to(workspace.resolve()):
            continue
        relative = path.relative_to(workspace)
        # Stable report aliases are sufficient; timestamped report copies add
        # bulk without adding evidence.
        if (
            relative.parts
            and relative.parts[0] == "reports"
            and relative.name not in {"engagement-report.md", "engagement-report.html"}
        ):
            continue
        files.append((f"workspace/{relative.as_posix()}", path.read_bytes()))

    manifest_entries = [
        {
            "path": name,
            "bytes": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
        }
        for name, content in files
    ]
    readme = (
        b"ADAssassin portable evidence bundle\n"
        b"\n"
        b"This archive contains engagement metadata, reports, and workspace evidence.\n"
        b"Bind passwords, hashes, in-memory references, and reusable preflight approval are excluded.\n"
        b"Verify each entry against manifest.json before relying on transferred evidence.\n"
    )
    files.append(("README.txt", readme))
    manifest_entries.append(
        {
            "path": "README.txt",
            "bytes": len(readme),
            "sha256": hashlib.sha256(readme).hexdigest(),
        }
    )
    manifest = json.dumps(
        {
            "format": "adassassin-evidence-bundle-v1",
            "engagement_id": engagement_id,
            "created_at": _now(),
            "secret_policy": "No plaintext bind credentials or reusable preflight state.",
            "entries": manifest_entries,
        },
        indent=2,
        sort_keys=True,
    ).encode("utf-8") + b"\n"

    with ZipFile(temporary, "w", compression=ZIP_DEFLATED) as archive:
        for name, content in files:
            archive.writestr(name, content)
        archive.writestr("manifest.json", manifest)
    temporary.replace(target)
    protect_private_file(target)
    return target
