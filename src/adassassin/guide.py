"""Guided path and glossary for the novice console."""

from __future__ import annotations

from typing import Any

from adassassin.catalog import catalog_payload
from adassassin.config import Settings
from adassassin.doctor import run_doctor
from adassassin.engagements import get_engagement
from adassassin.targets import has_successful_connect

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

# These are the only steps that represent a page visit rather than a real
# outcome. Connect and run steps must always be derived from engagement state;
# letting a client mark them would make the safety-oriented progress tracker
# misleading.
VISIT_TRACKED_STEPS = frozenset({"green-catalog", "findings", "glossary", "vault-review"})

STEPS = [
    {
        "id": "doctor",
        "title": "Check the console",
        "why": "Confirms Python, catalog, and local storage without touching a domain controller.",
        "href": "/",
        "complete_when": "doctor_ok",
    },
    {
        "id": "workspace",
        "title": "Select an assessment workspace",
        "why": "Use the offline demo to learn safely, or create one workspace for the authorized assessment.",
        "href": "/engagements",
        "complete_when": "has_workspace",
    },
    {
        "id": "green-catalog",
        "title": "Browse GREEN capabilities",
        "why": "These work from saved evidence and do not contact a target.",
        "href": "/catalog?lane=green",
        "complete_when": "viewed_green",
    },
    {
        "id": "findings",
        "title": "Read demo findings",
        "why": "Learn the evidence pane before any live work.",
        "href": "/findings",
        "complete_when": "has_findings",
    },
    {
        "id": "glossary",
        "title": "Open the glossary",
        "why": "Plain language for Kerberos, AD CS, and replication terms.",
        "href": "/glossary",
        "complete_when": "viewed_glossary",
    },
    {
        "id": "connect",
        "title": "Connect an authorized target",
        "why": "Run engine preflight for domain and DC before any yellow observe work.",
        "href": "/connect",
        "complete_when": "has_connect",
    },
    {
        "id": "observe-run",
        "title": "Run a GREEN or YELLOW observe capability",
        "why": "Execute an observe-only capability and attach findings to the engagement.",
        "href": "/run",
        "complete_when": "has_observe_run",
    },
    {
        "id": "vault-review",
        "title": "Review the evidence vault",
        "why": "Confirm what sensitive material exists and that nothing is exposed longer than intended.",
        "href": "/vault",
        "complete_when": "viewed_vault",
    },
    {
        "id": "rollback-preview",
        "title": "Preview rollback",
        "why": "Review cleanup state offline before any approved apply action.",
        "href": "/rollback",
        "complete_when": "previewed_rollback",
    },
    {
        "id": "report",
        "title": "Generate the evidence report",
        "why": "Create the Markdown and HTML record before closeout.",
        "href": "/report",
        "complete_when": "has_report",
    },
    {
        "id": "closeout",
        "title": "Complete closeout",
        "why": "Resolve rollback, active unmasks, and finding dispositions, then export the evidence bundle.",
        "href": "/report",
        "complete_when": "closeout_ready",
    },
    {
        "id": "red-run",
        "title": "Run a RED capability with typed confirm",
        "why": "Optional advanced work. Only proceed when the specific action has written approval.",
        "href": "/catalog?lane=red",
        "complete_when": "has_red_run",
        "optional": True,
    },
]


def _is_observe_job(job: dict[str, Any]) -> bool:
    if job.get("red"):
        return False
    risk = str(job.get("risk") or "observe")
    lane = str(job.get("lane") or "")
    return risk == "observe" and lane != "red"


def _progress_from_state(*, state: dict[str, bool], marked: list[str]) -> list[str]:
    done = set(marked).intersection(VISIT_TRACKED_STEPS)
    for step in STEPS:
        if state.get(str(step["complete_when"])):
            done.add(str(step["id"]))
    return [step["id"] for step in STEPS if step["id"] in done]


def guide_payload(settings: Settings, engagement_id: str | None = None) -> dict[str, Any]:
    """Return progress for exactly one selected engagement.

    Product health is global; every operator action and outcome is scoped to
    the selected workspace so customer engagements can never inherit each
    other's progress.
    """
    doctor = run_doctor(settings)
    item = get_engagement(settings, engagement_id) if engagement_id else None
    jobs = list((item or {}).get("jobs") or [])
    rollback_audit = list((item or {}).get("rollback_audit") or [])
    closeout_ready = False
    if item and item.get("mode") != "demo" and item.get("report"):
        from adassassin.report import closeout_checklist

        closeout_ready = bool(closeout_checklist(settings, item["id"]).get("ready"))
    state = {
        "doctor_ok": bool(doctor["ok"]),
        "has_workspace": item is not None,
        "viewed_green": "green-catalog" in list((item or {}).get("guided_marked") or []),
        "has_findings": "findings" in list((item or {}).get("guided_marked") or []),
        "viewed_glossary": "glossary" in list((item or {}).get("guided_marked") or []),
        "has_connect": bool(item and has_successful_connect(item)),
        "has_observe_run": any(
            job.get("status") == "completed" and _is_observe_job(job) for job in jobs
        ),
        "viewed_vault": "vault-review" in list((item or {}).get("guided_marked") or []),
        "previewed_rollback": any(event.get("action") == "preview" for event in rollback_audit),
        "has_report": bool((item or {}).get("report")),
        "closeout_ready": closeout_ready,
        "has_red_run": any(job.get("status") == "completed" and job.get("red") for job in jobs),
    }
    completed = _progress_from_state(
        state=state, marked=list((item or {}).get("guided_marked") or [])
    )
    catalog = catalog_payload()
    lanes = {"green": 0, "yellow": 0, "red": 0}
    for cap in catalog.get("capabilities", []):
        lane = cap.get("lane", "yellow")
        if lane in lanes:
            lanes[lane] += 1
    demo = bool(item and item.get("mode") == "demo")
    rows: list[dict[str, Any]] = []
    for step in STEPS:
        step_id = str(step["id"])
        applicable = not (
            (step_id == "connect" and demo)
            or (step_id == "closeout" and demo)
            or (step_id == "red-run" and demo)
        )
        rows.append(
            {
                **step,
                "done": step_id in completed,
                "applicable": applicable,
                "completion_mode": (
                    "visit" if step_id in VISIT_TRACKED_STEPS else "automatic"
                ),
                "skipped_reason": (
                    "Not needed for the permanently offline demo." if not applicable else None
                ),
            }
        )
    next_step = next(
        (
            step
            for step in rows
            if step.get("applicable", True)
            and not step.get("optional")
            and not step.get("done")
        ),
        None,
    )
    core_steps = [
        step for step in rows if step.get("applicable", True) and not step.get("optional")
    ]
    return {
        "ok": True,
        "completed": completed,
        "next": next_step,
        "steps": rows,
        "core_complete": all(step.get("done") for step in core_steps),
        "engagement_id": item.get("id") if item else None,
        "engagement_name": item.get("name") if item else None,
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
        "items": [
            {"term": term, "definition": definition} for term, definition in sorted(merged.items())
        ],
    }
