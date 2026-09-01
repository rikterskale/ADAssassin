import type { Engagement } from "../types";

export function Findings({ engagement }: { engagement: Engagement | null }) {
  const findings = engagement?.findings ?? [];
  return (
    <>
      <section className="hero">
        <div className="brand-sub">Findings</div>
        <h1>Evidence for the current engagement.</h1>
        <p className="lede">
          Demo fixtures and live observe results share this pane. Explain and remediation land in Phase 3.
        </p>
      </section>
      <div className="grid">
        <div className="panel span-12">
          <h2>{engagement ? engagement.name : "No engagement"}</h2>
          {findings.length === 0 ? (
            <div className="empty">No findings yet. Seed the demo or run an observe capability.</div>
          ) : (
            findings.map((finding) => (
              <div className="finding" key={finding.id}>
                <div>
                  <span className={`badge ${finding.severity === "high" ? "red" : finding.severity === "medium" ? "yellow" : "green"}`}>
                    {finding.severity}
                  </span>{" "}
                  {finding.title}
                </div>
                <div className="muted mono">{finding.id} · {finding.source}</div>
                <div className="muted">{finding.summary}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
