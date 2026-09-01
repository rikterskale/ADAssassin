import { Link } from "react-router-dom";
import type { Engagement } from "../types";

const steps = [
  ["01", "Workspace", "Use the offline demo or name a live-ready engagement."],
  ["02", "Discover", "Observe-only catalog items. No directory writes."],
  ["03", "Recommend", "Next actions come from evidence, not a toolbox."],
  ["04", "Approve", "RED work requires typed confirmation and scope."],
  ["05", "Close out", "Rollback queue, vault rotation marks, report."],
];

export function Guided({
  engagement,
  onDemo,
}: {
  engagement: Engagement | null;
  onDemo: () => void;
}) {
  return (
    <>
      <section className="hero">
        <div className="brand-sub">Guided</div>
        <h1>Do not start from a capability name.</h1>
        <p className="lede">
          The novice path is an engagement. Capabilities appear when evidence
          makes them the next step.
        </p>
        <div className="actions">
          <button className="btn primary" type="button" onClick={onDemo}>
            Seed offline demo
          </button>
          <Link className="btn" to="/engagements">
            Name an engagement
          </Link>
        </div>
      </section>
      <div className="grid">
        {steps.map(([n, title, copy]) => (
          <div className="panel span-4" key={n}>
            <h2>{n} {title}</h2>
            <p className="muted">{copy}</p>
          </div>
        ))}
        <div className="panel span-12">
          <h2>Current focus</h2>
          {engagement ? (
            <>
              <p>
                {engagement.name} · {engagement.mode} · {engagement.findings.length} demo
                findings
              </p>
              <p className="muted">
                Live connect and capability run land in Phase 2. This slice
                proves the console, catalog, and workspace.
              </p>
            </>
          ) : (
            <p className="muted">Seed the demo to populate findings without a DC.</p>
          )}
        </div>
      </div>
    </>
  );
}
