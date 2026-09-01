import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { CloseoutResponse, Engagement, ReportResponse } from "../types";

export function Report({
  engagement,
  onUpdated,
}: {
  engagement: Engagement | null;
  onUpdated: (engagement: Engagement) => void;
}) {
  const [closeout, setCloseout] = useState<CloseoutResponse | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engagement) {
      setCloseout(null);
      setReport(null);
      return;
    }
    let cancelled = false;
    void api.closeout(engagement.id).then((response) => {
      if (!cancelled) setCloseout(response);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
  }, [engagement?.id, engagement?.updated_at]);

  async function generate() {
    if (!engagement) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.report(engagement.id);
      setReport(response);
      setCloseout(response.closeout);
      if (response.engagement) onUpdated(response.engagement);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Report</div>
        <h1>Export evidence and close the engagement.</h1>
        <p className="lede">
          Markdown and HTML downloads include the authorization banner, scope notes, capabilities run,
          findings, remediation status, and rollback leftovers. Demo export never contacts a DC.
        </p>
      </section>
      <div className="grid">
        <div className="panel span-6">
          <h2>Closeout checklist</h2>
          {!engagement ? (
            <div className="empty">
              Select an engagement or <Link to="/guided">seed the demo</Link>.
            </div>
          ) : !closeout ? (
            <div className="empty">Loading closeout…</div>
          ) : (
            <>
              <p className="muted">
                {closeout.ready ? (
                  <span className="badge green">ready</span>
                ) : (
                  <span className="badge yellow">items remain</span>
                )}{" "}
                · capabilities {closeout.summary.capabilities_run}
                {" · "}open findings {closeout.summary.open_findings}
                {" · "}pending rollback {closeout.summary.pending_rollback}
              </p>
              {closeout.checks.map((check) => (
                <div className="finding" key={check.id}>
                  <span className={`badge ${check.ok ? "green" : "red"}`}>
                    {check.ok ? "pass" : "open"}
                  </span>{" "}
                  {check.label}
                  <div className="muted">{check.detail}</div>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="panel span-6">
          <h2>Export</h2>
          {error && <div className="banner-error">{error}</div>}
          <div className="actions">
            <button className="btn primary" type="button" disabled={busy || !engagement} onClick={() => void generate()}>
              {busy ? "Generating…" : "Generate report"}
            </button>
            {engagement && (
              <>
                <a className="btn ghost" href={`/api/engagements/${engagement.id}/report.md`}>
                  Download Markdown
                </a>
                <a className="btn ghost" href={`/api/engagements/${engagement.id}/report.html`}>
                  Download HTML
                </a>
              </>
            )}
          </div>
          {report && (
            <>
              <p className="muted mono">Generated {report.generated_at}</p>
              <h2>Markdown preview</h2>
              <pre className="log">{report.markdown.slice(0, 4000)}{report.markdown.length > 4000 ? "\n…" : ""}</pre>
            </>
          )}
        </div>
      </div>
    </>
  );
}
