"""Engagement findings: list, explain, remediate, status. Wrap engine novice helpers."""

from __future__ import annotations

from typing import Any

from adassassin.config import Settings
from adassassin.engagements import get_engagement, update_engagement

FINDING_STATUSES = ("open", "accepted", "fixed", "retest")
SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4, "unknown": 5}


class FindingError(ValueError):
    """Operator-facing finding error."""


def normalize_finding(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize demo and live findings onto one shape."""
    finding_id = str(raw.get("id") or "")
    source = str(raw.get("source") or raw.get("source_capability") or "unknown")
    evidence = raw.get("evidence") or raw.get("evidence_refs") or []
    if isinstance(evidence, str):
        evidence = [{"artifact": evidence, "pointer": "/"}]
    elif isinstance(evidence, list):
        normalized_evidence: list[dict[str, Any]] = []
        for item in evidence:
            if isinstance(item, dict):
                normalized_evidence.append(
                    {
                        "artifact": str(item.get("artifact") or item.get("path") or item.get("name") or "evidence"),
                        "pointer": str(item.get("pointer") or "/"),
                        "sha256": str(item.get("sha256") or ""),
                    }
                )
            else:
                normalized_evidence.append({"artifact": str(item), "pointer": "/", "sha256": ""})
        evidence = normalized_evidence
    else:
        evidence = []

    status = str(raw.get("status") or "open").lower()
    if status not in FINDING_STATUSES:
        status = "open"

    severity = str(raw.get("severity") or "info").lower()
    summary = str(
        raw.get("summary")
        or raw.get("impact")
        or raw.get("remediation")
        or "No summary provided."
    )
    return {
        "id": finding_id,
        "title": str(raw.get("title") or finding_id or "Finding"),
        "severity": severity,
        "source": source,
        "summary": summary,
        "status": status,
        "confidence": str(raw.get("confidence") or ""),
        "impact": str(raw.get("impact") or summary),
        "remediation": str(raw.get("remediation") or ""),
        "evidence": evidence,
        "attack_techniques": list(raw.get("attack_techniques") or []),
        "affected_assets": list(raw.get("affected_assets") or []),
        "control_mappings": list(raw.get("control_mappings") or []),
        "source_capability": str(raw.get("source_capability") or (source if source != "demo" else "")),
        "explained": raw.get("explained"),
        "remediation_checklist": raw.get("remediation_checklist"),
        "next_actions": list(raw.get("next_actions") or []),
        "status_updated_at": raw.get("status_updated_at"),
    }


def _now() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def list_findings(settings: Settings, engagement_id: str) -> dict[str, Any]:
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")
    findings = [normalize_finding(f) for f in (item.get("findings") or []) if isinstance(f, dict)]
    findings.sort(
        key=lambda f: (
            SEVERITY_ORDER.get(str(f.get("severity", "")).lower(), 99),
            str(f.get("title") or ""),
        )
    )
    groups: dict[str, list[dict[str, Any]]] = {}
    for finding in findings:
        groups.setdefault(finding["severity"], []).append(finding)
    return {
        "ok": True,
        "engagement_id": engagement_id,
        "count": len(findings),
        "findings": findings,
        "grouped": [
            {"severity": severity, "findings": groups[severity]}
            for severity in sorted(groups.keys(), key=lambda s: SEVERITY_ORDER.get(s, 99))
        ],
    }


def get_finding(settings: Settings, engagement_id: str, finding_id: str) -> dict[str, Any]:
    item = get_engagement(settings, engagement_id)
    if item is None:
        raise LookupError("Engagement not found")
    for raw in item.get("findings") or []:
        if isinstance(raw, dict) and raw.get("id") == finding_id:
            return {"ok": True, "finding": normalize_finding(raw), "engagement_id": engagement_id}
    raise LookupError("Finding not found")


def _engine_explain(finding: dict[str, Any]) -> dict[str, Any]:
    try:
        from adaf_attack.core.novice import explain_finding_payload, remediation_checklist
    except Exception:
        title = finding.get("title") or finding.get("id") or "Finding"
        severity = str(finding.get("severity") or "unknown")
        explained = {
            "id": finding.get("id"),
            "title": title,
            "severity": severity,
            "meaning": f"{title} is rated {severity}.",
            "why_it_matters": "Review evidence and remediation before any change.",
            "evidence": finding.get("evidence") or [],
            "recommended_next_step": "Validate the evidence, assign an owner, document the fix, then re-test.",
            "glossary": {},
            "source": "bundled",
        }
        checklist = {
            "finding": explained,
            "steps": [
                {"id": "validate", "label": "Confirm the evidence is from the authorized scope."},
                {"id": "assign", "label": "Assign an owner who can change the affected control."},
                {"id": "fix", "label": "Apply the remediation or compensating control."},
                {"id": "document", "label": "Record the change, exception, or accepted risk."},
                {"id": "retest", "label": "Re-run the relevant validation and attach evidence."},
            ],
            "status": "not-started",
            "source": "bundled",
        }
        return {"explain": explained, "remediation": checklist, "next_actions": []}

    explained = explain_finding_payload(finding)
    checklist = remediation_checklist(finding)
    next_actions: list[dict[str, str]] = []
    capability_id = str(finding.get("source_capability") or finding.get("source") or "")
    if capability_id and capability_id != "demo":
        try:
            from adaf_attack.core.novice import beginner_next_actions
            from adaf_attack.core.registry import capability_registry, load_builtin_capabilities

            load_builtin_capabilities()
            cap = capability_registry.get(capability_id)
            if cap is not None:
                next_actions = beginner_next_actions(cap)
        except Exception:
            next_actions = []
    explained["source"] = "engine"
    checklist["source"] = "engine"
    return {"explain": explained, "remediation": checklist, "next_actions": next_actions}


def explain_finding(settings: Settings, engagement_id: str, finding_id: str) -> dict[str, Any]:
    """Wrap engine explain + remediation. Read-only; no directory writes."""
    result: dict[str, Any] = {}

    def _apply(item: dict[str, Any]) -> None:
        findings = list(item.get("findings") or [])
        index = next(
            (
                i
                for i, raw in enumerate(findings)
                if isinstance(raw, dict) and raw.get("id") == finding_id
            ),
            None,
        )
        if index is None:
            raise LookupError("Finding not found")
        normalized = normalize_finding(findings[index])
        payload = _engine_explain(normalized)
        findings[index] = {
            **findings[index],
            **{
                k: v
                for k, v in normalized.items()
                if k not in {"explained", "remediation_checklist", "next_actions"}
            },
            "explained": payload["explain"],
            "remediation_checklist": payload["remediation"],
            "next_actions": payload["next_actions"],
        }
        item["findings"] = findings
        result.update({"finding": findings[index], "payload": payload})

    saved = update_engagement(settings, engagement_id, _apply)
    payload = result["payload"]
    return {
        "ok": True,
        "finding": normalize_finding(result["finding"]),
        "explain": payload["explain"],
        "remediation": payload["remediation"],
        "next_actions": payload["next_actions"],
        "engagement": saved,
    }


def set_finding_status(
    settings: Settings,
    engagement_id: str,
    finding_id: str,
    *,
    status: str,
) -> dict[str, Any]:
    status = (status or "").strip().lower()
    if status not in FINDING_STATUSES:
        raise FindingError(
            f"Invalid status '{status}'. Allowed: {', '.join(FINDING_STATUSES)}"
        )
    result: dict[str, Any] = {}

    def _apply(item: dict[str, Any]) -> None:
        findings = list(item.get("findings") or [])
        index = next(
            (
                i
                for i, raw in enumerate(findings)
                if isinstance(raw, dict) and raw.get("id") == finding_id
            ),
            None,
        )
        if index is None:
            raise LookupError("Finding not found")
        findings[index] = {
            **findings[index],
            "status": status,
            "status_updated_at": _now(),
        }
        item["findings"] = findings
        result["finding"] = findings[index]

    saved = update_engagement(settings, engagement_id, _apply)
    return {
        "ok": True,
        "finding": normalize_finding(result["finding"]),
        "engagement": saved,
    }
