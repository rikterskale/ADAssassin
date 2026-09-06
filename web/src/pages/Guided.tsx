import { Link } from "react-router-dom";
import type { Engagement, GuideResponse } from "../types";

export function Guided({
  guide, engagement, onDemo,
}: {
  guide: GuideResponse | null;
  engagement: Engagement | null;
  onDemo: () => void;
}) {
  const steps = guide?.steps ?? [];
  const coreSteps = steps.filter((step) => step.applicable !== false && !step.optional);
  const optionalSteps = steps.filter((step) => step.optional);
  const doneCount = coreSteps.filter((step) => step.done).length;
  const currentStep = guide?.next ?? null;
  const pct = coreSteps.length === 0 ? 0 : Math.round((doneCount / coreSteps.length) * 100);

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Guided</div>
        <h1>Do not start from a capability name.</h1>
        <p className="lede">
          Follow the selected engagement from safe orientation through evidence export. RED work is
          always optional and never required to complete the core journey.
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
          {doneCount} of {coreSteps.length} core steps complete
          {currentStep ? ` · up next: ${currentStep.title}` : " · core journey complete"}
          {guide?.engagement_name ? ` · ${guide.engagement_name}` : ""}
        </p>
        <div
          className="progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={coreSteps.length}
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
        {coreSteps.map((step, index) => (
          <div className="panel span-6" key={step.id}>
            <h2>{String(index + 1).padStart(2, "0")} {step.title}</h2>
            <p className="muted">{step.why}</p>
            <div className="actions">
              <Link className="btn ghost" to={step.href}>Open</Link>
              {step.done ? (
                <span className="badge green">done</span>
              ) : (
                <span className="badge">
                  {step.completion_mode === "visit" ? "open to complete" : "complete in workflow"}
                </span>
              )}
            </div>
          </div>
        ))}
        {steps.some((step) => step.applicable === false && !step.optional) && (
          <div className="panel span-12">
            <h2>Not needed for this workspace</h2>
            {steps.filter((step) => step.applicable === false && !step.optional).map((step) => (
              <p className="muted" key={step.id}><span className="badge">skipped</span> {step.title} · {step.skipped_reason}</p>
            ))}
          </div>
        )}
        <div className="panel span-12">
          <h2>Optional advanced work</h2>
          <p className="muted">These actions never count against core completion. Use them only when explicitly authorized.</p>
          {optionalSteps.map((step) => (
            <div className="finding" key={step.id}>
              <div><strong>{step.title}</strong> {step.done && <span className="badge green">completed</span>}</div>
              <div className="muted">{step.applicable === false ? step.skipped_reason : step.why}</div>
              {step.applicable !== false && <Link to={step.href}>Open optional workflow</Link>}
            </div>
          ))}
        </div>
        <div className="panel span-12">
          <h2>Current focus</h2>
          <p className="muted">{engagement ? `${engagement.name} · ${engagement.mode} · ${engagement.findings.length} findings` : "Seed the demo to populate findings without a DC."}</p>
        </div>
      </div>
    </>
  );
}
