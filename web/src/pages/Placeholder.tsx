import type { Engagement } from "../types";

export function Placeholder({
  title,
  copy,
  engagement,
}: {
  title: string;
  copy: string;
  engagement: Engagement | null;
}) {
  return (
    <>
      <section className="hero">
        <div className="brand-sub">Later phase</div>
        <h1>{title}</h1>
        <p className="lede">{copy}</p>
      </section>
      <div className="panel">
        <h2>Workspace preview</h2>
        {engagement?.findings.length ? (
          engagement.findings.map((finding) => (
            <div className="finding" key={finding.id}>
              <div>{finding.title}</div>
              <div className="muted">
                {finding.severity} · {finding.summary}
              </div>
            </div>
          ))
        ) : (
          <div className="empty">Seed the offline demo to see fixture findings here.</div>
        )}
      </div>
    </>
  );
}
