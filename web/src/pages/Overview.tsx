import { Link, useNavigate } from "react-router-dom";
import type { DoctorResponse, Engagement, GuideResponse, HealthResponse } from "../types";

export function Overview({
  health,
  doctor,
  guide,
  engagement,
  onSeedDemo,
}: {
  health: HealthResponse | null;
  doctor: DoctorResponse | null;
  guide: GuideResponse | null;
  engagement: Engagement | null;
  onSeedDemo: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const hasEngagement = Boolean(engagement);

  async function exploreDemo() {
    await onSeedDemo();
    navigate("/findings");
  }

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Welcome</div>
        <h1>Active Directory assessments, one guided step at a time.</h1>
        <p className="lede">
          New here? Start with the offline demo — real-looking findings, a vault, and a rollback entry,
          with <strong>no domain controller contacted</strong>. Everything runs locally on{" "}
          {health?.bind ?? "127.0.0.1"}. Live work always needs written authorization.
        </p>
        <div className="actions">
          <button className="btn primary" type="button" onClick={() => void exploreDemo()}>
            Explore the offline demo
          </button>
          <Link className="btn" to="/guided">Open the guided path</Link>
          {guide?.next && (
            <Link className="btn ghost" to={guide.next.href}>Next: {guide.next.title}</Link>
          )}
        </div>
      </section>
      <div className="grid">
        <div className="panel span-8">
          <h2>Your first three steps</h2>
          <ol className="steps">
            <li>
              <strong>Explore the demo.</strong> Click a finding to see what it means and how to fix it —
              no setup, no target.{" "}
              <button className="linklike" type="button" onClick={() => void exploreDemo()}>
                Seed it now
              </button>
              .
            </li>
            <li>
              <strong>Learn the lanes.</strong> <span className="badge green">green</span> is offline,{" "}
              <span className="badge yellow">yellow</span> reads a target, and{" "}
              <span className="badge red">red</span> can change state.{" "}
              <Link to="/catalog?lane=green">Browse green capabilities</Link>.
            </li>
            <li>
              <strong>Go live only when authorized.</strong> Name an{" "}
              <Link to="/engagements">engagement</Link>, <Link to="/connect">connect a target</Link>, then
              run observe work. Destructive steps require a typed confirmation.
            </li>
          </ol>
        </div>
        <div className="panel span-4">
          <h2>Console health</h2>
          <p className="muted">
            <span className={`badge ${doctor?.ok ? "green" : "yellow"}`}>{doctor?.summary ?? "…"}</span>{" "}
            · no directory contact
          </p>
          <div className="metric"><b>{health?.catalog_count ?? "—"}</b><span>Capabilities available</span></div>
          <div className="metric">
            <b>{guide?.lanes.green ?? 0} / {guide?.lanes.yellow ?? 0} / {guide?.lanes.red ?? 0}</b>
            <span>Green / yellow / red</span>
          </div>
          <div className="metric">
            <b>{hasEngagement ? engagement!.findings.length : 0}</b>
            <span>{hasEngagement ? `Findings in ${engagement!.name}` : "No engagement yet"}</span>
          </div>
          <div style={{ marginTop: 14 }}>
            {(doctor?.checks ?? []).map((check) => (
              <div className="finding" key={check.id}>
                <span className={`badge ${check.status === "pass" ? "green" : check.status === "warn" ? "yellow" : "red"}`}>
                  {check.status}
                </span>{" "}
                {check.id}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
