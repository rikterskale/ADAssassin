import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { CopyButton } from "../components/CopyButton";
import { NoEngagement } from "../components/NoEngagement";
import { useToast } from "../components/Toasts";
import type { Engagement, Finding, FindingStatus } from "../types";

const STATUSES: FindingStatus[] = ["open", "accepted", "fixed", "retest"];

function severityClass(severity: string): string {
  if (severity === "critical" || severity === "high") return "red";
  if (severity === "medium") return "yellow";
  return "green";
}

export function Findings({
  engagement,
  onUpdated,
  onSeedDemo,
  onSeen = () => {},
}: {
  engagement: Engagement | null;
  onUpdated: (engagement: Engagement) => void;
  onSeedDemo: () => void;
  onSeen?: () => void;
}) {
  const notify = useToast();
  const [grouped, setGrouped] = useState<{ severity: string; findings: Finding[] }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Finding | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(() => Boolean(engagement));
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FindingStatus>("all");

  useEffect(() => {
    if (engagement && !engagement.guided_marked?.includes("findings")) onSeen();
    // A page visit is recorded once for each selected engagement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagement?.id]);

  const findings = useMemo(
    () => grouped.flatMap((group) => group.findings),
    [grouped],
  );

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return grouped
      .map((group) => ({
        ...group,
        findings: group.findings.filter((finding) => {
          if (statusFilter !== "all" && (finding.status ?? "open") !== statusFilter) return false;
          if (!q) return true;
          return `${finding.id} ${finding.title} ${finding.summary} ${finding.source}`.toLowerCase().includes(q);
        }),
      }))
      .filter((group) => group.findings.length > 0);
  }, [grouped, query, statusFilter]);

  useEffect(() => {
    if (!engagement) {
      setGrouped([]);
      setSelectedId(null);
      setDetail(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api.findings(engagement.id).then((response) => {
      if (cancelled) return;
      setGrouped(response.grouped);
      setSelectedId((current) => current ?? response.findings[0]?.id ?? null);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [engagement?.id, engagement?.updated_at, engagement?.findings?.length]);

  useEffect(() => {
    if (!engagement || !selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void api.finding(engagement.id, selectedId).then((response) => {
      if (!cancelled) setDetail(response.finding);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
  }, [engagement?.id, selectedId]);

  async function explain() {
    if (!engagement || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.explainFinding(engagement.id, selectedId);
      setDetail(result.finding);
      onUpdated(result.engagement);
      const listed = await api.findings(engagement.id);
      setGrouped(listed.grouped);
      notify("Explanation and remediation loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: FindingStatus) {
    if (!engagement || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.setFindingStatus(engagement.id, selectedId, status);
      setDetail(result.finding);
      onUpdated(result.engagement);
      const listed = await api.findings(engagement.id);
      setGrouped(listed.grouped);
      notify(`Finding marked ${status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Findings</div>
        <h1>Evidence, explain, and remediate in one pane.</h1>
        <p className="lede">
          Demo fixtures and live observe results share this view. Explain and remediation wrap the
          engine novice helpers. Status is engagement-local; no directory writes happen here.
        </p>
      </section>
      <div className="grid">
        <div className="panel span-6">
          <h2>{engagement ? engagement.name : "No engagement"}</h2>
          {!engagement ? (
            <NoEngagement onSeedDemo={onSeedDemo} />
          ) : (
            <>
              <div className="filters">
                <input
                  type="search"
                  placeholder="Search findings"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search findings"
                />
                {(["all", ...STATUSES] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`filter-chip${statusFilter === status ? " active" : ""}`}
                    aria-label={`Filter ${status}`}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
              {loading ? (
                <div className="empty">Loading findings…</div>
              ) : findings.length === 0 ? (
                <div className="empty">No findings yet. Seed the demo or run an observe capability.</div>
              ) : visibleGroups.length === 0 ? (
                <div className="empty">No findings match that search.</div>
              ) : (
                visibleGroups.map((group) => (
                  <div key={group.severity}>
                    <h2>{group.severity}</h2>
                    {group.findings.map((finding) => (
                      <button
                        key={finding.id}
                        type="button"
                        className={`finding${selectedId === finding.id ? " selected" : ""}`}
                        onClick={() => setSelectedId(finding.id)}
                      >
                        <div>
                          <span className={`badge ${severityClass(finding.severity)}`}>{finding.severity}</span>{" "}
                          <span className={`badge ${finding.status === "fixed" ? "green" : finding.status === "accepted" ? "yellow" : ""}`}>
                            {finding.status ?? "open"}
                          </span>{" "}
                          {finding.title}
                        </div>
                        <div className="muted mono">{finding.id} · {finding.source}</div>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </>
          )}
        </div>
        <div className="panel span-6 sticky-side">
          <h2>Detail</h2>
          {!detail ? (
            <div className="empty">Select a finding.</div>
          ) : (
            <>
              <div className="id-row">
                <div className="mono">{detail.id}</div>
                <CopyButton value={detail.id} label="Copy id" />
              </div>
              <p>{detail.title}</p>
              <p className="muted">
                {detail.severity} · {detail.source}
                {detail.source_capability ? ` · ${detail.source_capability}` : ""}
                {" · "}
                status {detail.status ?? "open"}
              </p>
              <p className="muted">{detail.summary}</p>
              {detail.impact && <p className="muted">Impact: {detail.impact}</p>}
              {detail.remediation && <p className="muted">Remediation: {detail.remediation}</p>}

              <h2>Evidence</h2>
              {(detail.evidence ?? []).length === 0 ? (
                <p className="muted">No evidence refs attached.</p>
              ) : (
                (detail.evidence ?? []).map((item) => (
                  <div className="finding" key={`${item.artifact}-${item.pointer}`}>
                    <div className="mono">{item.artifact}</div>
                    <div className="muted">{item.pointer || "/"}{item.sha256 ? ` · ${item.sha256.slice(0, 12)}…` : ""}</div>
                  </div>
                ))
              )}

              {(detail.attack_techniques ?? []).length > 0 && (
                <p className="muted mono">Techniques: {(detail.attack_techniques ?? []).join(", ")}</p>
              )}
              {(detail.affected_assets ?? []).length > 0 && (
                <p className="muted">Assets: {(detail.affected_assets ?? []).join(", ")}</p>
              )}

              {error && <div className="banner-error">{error}</div>}

              <div className="actions">
                <button className="btn primary" type="button" disabled={busy} onClick={() => void explain()}>
                  {busy ? "Working…" : "Explain + remediate"}
                </button>
              </div>
              <div className="actions" style={{ marginTop: 10 }}>
                {STATUSES.map((status) => (
                  <button
                    key={status}
                    className={`btn ${detail.status === status ? "primary" : "ghost"}`}
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus(status)}
                  >
                    {status}
                  </button>
                ))}
              </div>

              {detail.explained && (
                <>
                  <h2>Explain</h2>
                  <p>{detail.explained.meaning}</p>
                  <p className="muted">{detail.explained.why_it_matters}</p>
                  <p className="muted">Next: {detail.explained.recommended_next_step}</p>
                </>
              )}

              {detail.remediation_checklist && (
                <>
                  <h2>Remediation checklist</h2>
                  {(detail.remediation_checklist.steps ?? []).map((step) => (
                    <div className="finding" key={step.id}>
                      <div className="mono">{step.id}</div>
                      <div className="muted">{step.label}</div>
                    </div>
                  ))}
                </>
              )}

              {(detail.next_actions ?? []).length > 0 && (
                <>
                  <h2>What next</h2>
                  {(detail.next_actions ?? []).map((action) => (
                    <div className="finding" key={action.id}>
                      <Link to={`/run?capability=${encodeURIComponent(action.id)}`}>{action.id}</Link>
                      <div className="muted">{action.message}</div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
