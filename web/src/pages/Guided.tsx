import { Link } from "react-router-dom";
import type { Engagement, GuideResponse } from "../types";

export function Guided({
  guide, engagement, onDemo, onMark,
}: {
  guide: GuideResponse | null;
  engagement: Engagement | null;
  onDemo: () => void;
  onMark: (stepId: string) => void;
}) {
  return (
    <>
      <section className="hero">
        <div className="brand-sub">Guided</div>
        <h1>Do not start from a capability name.</h1>
        <p className="lede">Complete these local steps first. Live connect is Phase 2.</p>
        <div className="actions">
          <button className="btn primary" type="button" onClick={onDemo}>Seed offline demo</button>
          <Link className="btn" to="/engagements">Name an engagement</Link>
        </div>
      </section>
      <div className="grid">
        {(guide?.steps ?? []).map((step, index) => (
          <div className="panel span-6" key={step.id}>
            <h2>{String(index + 1).padStart(2, "0")} {step.title}</h2>
            <p className="muted">{step.why}</p>
            <div className="actions">
              <Link className="btn ghost" to={step.href}>Open</Link>
              {step.done ? <span className="badge green">done</span> : <button className="btn" type="button" onClick={() => onMark(step.id)}>Mark seen</button>}
            </div>
          </div>
        ))}
        <div className="panel span-12">
          <h2>Current focus</h2>
          <p className="muted">{engagement ? `${engagement.name} · ${engagement.mode} · ${engagement.findings.length} findings` : "Seed the demo to populate findings without a DC."}</p>
        </div>
      </div>
    </>
  );
}
