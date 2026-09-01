import { NavLink, Outlet } from "react-router-dom";
import type { HealthResponse } from "../types";

const links = [
  ["/", "Overview"], ["/guided", "Guided"], ["/catalog", "Catalog"], ["/glossary", "Glossary"],
  ["/engagements", "Engagements"], ["/connect", "Connect"], ["/run", "Run"],
  ["/findings", "Findings"], ["/vault", "Vault"], ["/rollback", "Rollback"], ["/report", "Report"],
] as const;

export function Shell({ health }: { health: HealthResponse | null }) {
  const engineOk = health?.engine.available;
  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <div className="mark">AD</div>
          <div>
            <div className="brand-name">Assassin</div>
            <div className="brand-sub">Operator console</div>
          </div>
        </div>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>
          ))}
        </nav>
        <div className="rail-foot">
          Local console. Authorized internal use only.
          <br />
          Phase {health?.phase ?? "3"} · engine pin {health?.engine_pin ?? "0.10.1"}
        </div>
      </aside>
      <section className="main">
        <header className="topbar">
          <div className="banner">Authorized use only · written scope required for live work</div>
          <div className="status-pills">
            <span className="pill">ADAssassin {health?.version ?? "…"}</span>
            <span className={`pill ${engineOk ? "ok" : "warn"}`}>engine {engineOk ? "live" : "catalog fallback"}</span>
            <span className="pill">{health?.catalog_count ?? 0} capabilities</span>
            <span className="pill">{health?.bind ?? "127.0.0.1"}</span>
          </div>
        </header>
        <div className="content"><Outlet /></div>
      </section>
    </div>
  );
}
