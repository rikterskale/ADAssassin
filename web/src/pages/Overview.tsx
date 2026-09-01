import { Link } from "react-router-dom";
import type { DoctorResponse, Engagement, GuideResponse, HealthResponse } from "../types";

export function Overview({
  health, doctor, guide, engagement,
}: {
  health: HealthResponse | null;
  doctor: DoctorResponse | null;
  guide: GuideResponse | null;
  engagement: Engagement | null;
}) {
  return (
    <>
      <section className="hero">
        <div className="brand-sub">Phase 2 · live connect + observe</div>
        <h1>See the estate. Then take the next approved step.</h1>
        <p className="lede">Doctor never contacts a domain controller. Connect runs engine preflight; observe runs stay green/yellow only.</p>
        <div className="actions">
          {guide?.next ? <Link className="btn primary" to={guide.next.href}>Next: {guide.next.title}</Link> : <Link className="btn primary" to="/guided">Open guided path</Link>}
          <Link className="btn" to="/connect">Connect</Link>
          <Link className="btn" to="/catalog?lane=green">GREEN catalog</Link>
        </div>
      </section>
      <div className="grid">
        <div className="panel span-8">
          <h2>Doctor</h2>
          <p className="muted">{doctor?.summary ?? "…"} · directory contact {doctor?.contacts_directory ? "yes" : "no"}</p>
          {(doctor?.checks ?? []).map((check) => (
            <div className="finding" key={check.id}>
              <span className={`badge ${check.status === "pass" ? "green" : check.status === "warn" ? "yellow" : "red"}`}>{check.status}</span>
              {" "}{check.id}
              <div className="muted">{check.detail}</div>
            </div>
          ))}
        </div>
        <div className="panel span-4">
          <h2>Pulse</h2>
          <div className="metric"><b>{health?.catalog_count ?? "—"}</b><span>Capabilities</span></div>
          <div className="metric"><b>{guide?.lanes.green ?? 0} / {guide?.lanes.yellow ?? 0} / {guide?.lanes.red ?? 0}</b><span>Green / yellow / red</span></div>
          <div className="metric"><b>{engagement?.findings.length ?? 0}</b><span>{engagement?.name ?? "No engagement"}</span></div>
        </div>
      </div>
    </>
  );
}
