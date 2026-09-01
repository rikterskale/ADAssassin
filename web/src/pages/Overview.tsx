import { Link } from "react-router-dom";
import type { Engagement, HealthResponse } from "../types";

export function Overview({
  health,
  engagement,
}: {
  health: HealthResponse | null;
  engagement: Engagement | null;
}) {
  return (
    <>
      <section className="hero">
        <div className="brand-sub">Phase 0 console</div>
        <h1>See the estate. Then take the next approved step.</h1>
        <p className="lede">
          ADAssassin is the operator surface for the pinned ADAF-ATTACK engine.
          Guided mode hides the 92-tool wall. Destructive work stays behind
          engine approval gates.
        </p>
        <div className="actions">
          <Link className="btn primary" to="/guided">
            Open guided path
          </Link>
          <Link className="btn" to="/catalog">
            Browse catalog
          </Link>
        </div>
      </section>
      <div className="grid">
        <div className="panel span-8">
          <h2>Pulse</h2>
          <div className="metric-row">
            <div className="metric">
              <b>{health?.catalog_count ?? "—"}</b>
              <span>Capabilities</span>
            </div>
            <div className="metric">
              <b>{engagement?.findings.length ?? 0}</b>
              <span>Findings in focus</span>
            </div>
            <div className="metric">
              <b>{engagement?.rollback.pending ?? 0}</b>
              <span>Pending rollbacks</span>
            </div>
          </div>
        </div>
        <div className="panel span-4">
          <h2>Active engagement</h2>
          {engagement ? (
            <>
              <div>{engagement.name}</div>
              <div className="muted mono">{engagement.id}</div>
              <p className="muted">{engagement.mode === "demo" ? "Offline demo workspace." : "Live-ready workspace."}</p>
            </>
          ) : (
            <p className="muted">No engagement yet. Create one or seed the demo.</p>
          )}
        </div>
        <div className="panel span-12">
          <h2>Engine</h2>
          <p className="muted">
            Pin {health?.engine_pin} · {health?.engine_commit?.slice(0, 12)} · source{" "}
            {health?.catalog_source}
          </p>
          {health?.engine.error ? (
            <p className="muted">Engine import note: {health.engine.error}</p>
          ) : (
            <p className="muted">Registry reachable. Execution lands in a later phase.</p>
          )}
        </div>
      </div>
    </>
  );
}
