import { Link, useNavigate } from "react-router-dom";
import { isConnectReady } from "../connection";
import { formatWhen } from "../format";
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
  const connected = isConnectReady(engagement);
  const recentJobs = (engagement?.jobs ?? []).slice(-3).reverse();

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
          <Link className="btn primary" to="/start">Start here</Link>
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
          {hasEngagement && (
            <>
              <h2>Current workspace</h2>
              <p>
                <strong>{engagement!.name}</strong>
                {" · "}
                <span className={`badge ${engagement!.mode === "demo" ? "yellow" : connected ? "green" : ""}`}>
                  {engagement!.mode}
                </span>
                {connected && <>{" "}<span className="badge green">connected</span></>}
              </p>
              <p className="muted">
                {engagement!.domain || "No domain yet"}
                {engagement!.dc ? ` · ${engagement!.dc}` : ""}
                {engagement!.notes ? ` · ${engagement!.notes}` : ""}
              </p>
              {recentJobs.length > 0 && (
                <>
                  <h2>Recent runs</h2>
                  {recentJobs.map((job) => (
                    <div className="finding" key={job.id}>
                      <div className="mono">{job.capability_id}</div>
                      <div className="muted">
                        <span className={`badge ${job.status === "completed" ? "green" : job.status === "running" ? "yellow" : "red"}`}>
                          {job.status}
                        </span>
                        {" · "}
                        {formatWhen(job.created_at)}
                      </div>
                    </div>
                  ))}
                  <div className="actions">
                    <Link className="btn ghost" to="/run">Open run</Link>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        <div className="panel span-4 sticky-side">
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
              <div className="health-row" key={check.id}>
                <span className={`badge ${check.status === "pass" ? "green" : check.status === "warn" ? "yellow" : "red"}`}>
                  {check.status}
                </span>
                <div>
                  <div className="mono">{check.id}</div>
                  <div className="muted">{check.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
