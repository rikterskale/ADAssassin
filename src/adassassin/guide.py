"""Guided path and glossary for the novice console."""

from __future__ import annotations

from typing import Any

from adassassin.catalog import catalog_payload
from adassassin.config import Settings
from adassassin.doctor import run_doctor
from adassassin.engagements import list_engagements

GLOSSARY = {
    "kerberoast": "A request for service-account tickets that can be checked offline for weak passwords.",
    "dcsync": "A replication request that can expose password material; use only with explicit approval.",
    "rbcd": "A delegation setting that can let one computer act on behalf of a user to another service.",
    "spn": "A service name in Active Directory that tells Kerberos where a service is running.",
    "tgt": "A Kerberos Ticket Granting Ticket, used to request service tickets.",
    "opsec": "Operational security: reducing unnecessary noise, exposure, and detectable activity.",
    "s4u": "A Kerberos protocol extension used to request a service ticket on behalf of another user.",
    "esc": "An AD CS escalation path caused by certificate-template or CA configuration weaknesses.",
    "pkinit": "Certificate-based Kerberos pre-authentication that yields a TGT from a client cert.",
    "unpac": "Recovering an NT hash from PAC_CREDENTIAL_INFO after a PKINIT TGT.",
    "dcshadow": "Registering a rogue DC object and pushing directory changes via replication APIs.",
    "golden cert": "A client certificate forged with a stolen CA key.",
    "lane": "Console risk band. Green is offline. Yellow reads a target. Red can change state.",
    "engagement": "One authorized assessment workspace: findings, vault, rollback, and notes.",
}

STEPS = [
    {"id": "doctor", "title": "Check the console", "why": "Confirms Python, catalog, and local storage without touching a domain controller.", "href": "/", "complete_when": "doctor_ok"},
    {"id": "demo", "title": "Seed the offline demo", "why": "Gives you findings to click without a live directory.", "href": "/guided", "complete_when": "has_demo"},
    {"id": "green-catalog", "title": "Browse GREEN capabilities", "why": "These work from saved evidence and do not contact a target.", "href": "/catalog?lane=green", "complete_when": "viewed_green"},
    {"id": "findings", "title": "Read demo findings", "why": "Learn the evidence pane before any live work.", "href": "/findings", "complete_when": "has_findings"},
    {"id": "glossary", "title": "Open the glossary", "why": "Plain language for Kerberos, AD CS, and replication terms.", "href": "/glossary", "complete_when": "viewed_glossary"},
    {"id": "engagement", "title": "Name a live-ready engagement", "why": "A workspace to hold scope notes. Still no directory contact.", "href": "/engagements", "complete_when": "has_live_ready"},
    {"id": "connect", "title": "Connect an authorized target", "why": "Run engine preflight for domain and DC before any yellow observe work.", "href": "/connect", "complete_when": "has_connect"},
    {"id": "observe-run", "title": "Run a GREEN or YELLOW observe capability", "why": "Execute an observe-only capability and attach findings to the engagement.", "href": "/run", "complete_when": "has_observe_run"},
    {"id": "red-run", "title": "Run a RED capability with typed confirm", "why": "Destructive and side-effect runs require ack, force, and typing the capability id.", "href": "/catalog?lane=red", "complete_when": "has_red_run"},
]


def _is_observe_job(job: dict[str, Any]) -> bool:
    if job.get("red"):
        return False
    risk = str(job.get("risk") or "observe")
    lane = str(job.get("lane") or "")
    return risk == "observe" and lane != "red"


def _progress_from_state(
    *,
    doctor_ok: bool,
    has_demo: bool,
    has_findings: bool,
    has_live_ready: bool,
    has_connect: bool,
    has_observe_run: bool,
    has_red_run: bool,
    marked: list[str],
) -> list[str]:
    done = set(marked)
    if doctor_ok:
        done.add("doctor")
    if has_demo:
        done.add("demo")
    if has_findings:
        done.add("findings")
    if has_live_ready:
        done.add("engagement")
    if has_connect:
        done.add("connect")
    if has_observe_run:
        done.add("observe-run")
    if has_red_run:
        done.add("red-run")
    return [step["id"] for step in STEPS if step["id"] in done]


def guide_payload(settings: Settings, marked: list[str] | None = None) -> dict[str, Any]:
    doctor = run_doctor(settings)
    engagements = list_engagements(settings)
    has_demo = any(item.get("mode") == "demo" for item in engagements)
    has_findings = any(item.get("findings") for item in engagements)
    has_live_ready = any(item.get("mode") == "live-ready" for item in engagements)
    has_connect = any((item.get("connect") or {}).get("preflight_ok") for item in engagements)
    has_observe_run = any(
        "observe-run" in (item.get("guided_marked") or [])
        or any(
            job.get("status") == "completed" and _is_observe_job(job)
            for job in (item.get("jobs") or [])
        )
        for item in engagements
    )
    has_red_run = any(
        "red-run" in (item.get("guided_marked") or [])
        or any(job.get("status") == "completed" and job.get("red") for job in (item.get("jobs") or []))
        for item in engagements
    )
    completed = _progress_from_state(
        doctor_ok=bool(doctor["ok"]),
        has_demo=has_demo,
        has_findings=has_findings,
        has_live_ready=has_live_ready,
        has_connect=has_connect,
        has_observe_run=has_observe_run,
        has_red_run=has_red_run,
        marked=marked or [],
    )
    catalog = catalog_payload()
    lanes = {"green": 0, "yellow": 0, "red": 0}
    for cap in catalog.get("capabilities", []):
        lane = cap.get("lane", "yellow")
        if lane in lanes:
            lanes[lane] += 1
    next_step = next((step for step in STEPS if step["id"] not in completed), None)
    return {
        "ok": True,
        "completed": completed,
        "next": next_step,
        "steps": [{**step, "done": step["id"] in completed} for step in STEPS],
        "lanes": lanes,
        "doctor_summary": doctor["summary"],
    }


def glossary_payload() -> dict[str, Any]:
    try:
        from adaf_attack.core.novice import glossary_items

        items = glossary_items()
        source = "engine"
    except Exception:
        items = dict(GLOSSARY)
        source = "bundled"
    merged = dict(GLOSSARY)
    merged.update(items)
    return {
        "ok": True,
        "source": source,
        "items": [{"term": term, "definition": definition} for term, definition in sorted(merged.items())],
    }
