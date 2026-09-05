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
  const steps = guide?.steps ?? [];
  const doneCount = steps.filter((step) => step.done).length;
  const currentStep = steps.find((step) => !step.done) ?? null;
  const pct = steps.length === 0 ? 0 : Math.round((doneCount / steps.length) * 100);

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Guided</div>
        <h1>Do not start from a capability name.</h1>
        <p className="lede">
          Finish local steps, connect an authorized target, run observe work, then only use RED with typed confirm.
        </p>
        <div className="actions">
          <button className="btn primary" type="button" onClick={onDemo}>Seed offline demo</button>
          <Link className="btn" to="/engagements">Name an engagement</Link>
          <Link className="btn" to="/connect">Connect target</Link>
          <Link className="btn" to="/catalog?lane=red">RED catalog</Link>
        </div>
      </section>
      <div className="panel">
        <h2>Progress</h2>
        <p className="muted">
          {doneCount} of {steps.length} steps complete
          {currentStep ? ` · up next: ${currentStep.title}` : " · path complete"}
        </p>
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
          aria-label="Guided path progress"
        >
          <span className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        {currentStep && (
          <div className="actions" style={{ marginTop: 14 }}>
            <Link className="btn primary" to={currentStep.href}>Continue: {currentStep.title}</Link>
          </div>
        )}
      </div>
      <div className="grid">
        {steps.map((step, index) => (
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
