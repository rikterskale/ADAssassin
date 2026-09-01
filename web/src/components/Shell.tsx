import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { HealthResponse } from "../types";

type NavItem = { to: string; label: string; hint: string };
type NavGroup = { heading: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    heading: "Start",
    items: [
      { to: "/", label: "Overview", hint: "Home" },
      { to: "/guided", label: "Guided", hint: "Step by step" },
    ],
  },
  {
    heading: "Assess",
    items: [
      { to: "/engagements", label: "Engagements", hint: "Workspaces" },
      { to: "/connect", label: "Connect", hint: "Target preflight" },
      { to: "/run", label: "Run", hint: "Run a capability" },
      { to: "/findings", label: "Findings", hint: "Results" },
    ],
  },
  {
    heading: "Reference",
    items: [
      { to: "/catalog", label: "Catalog", hint: "All capabilities" },
      { to: "/glossary", label: "Glossary", hint: "Plain-English terms" },
    ],
  },
  {
    heading: "Advanced",
    items: [
      { to: "/vault", label: "Vault", hint: "Captured secrets" },
      { to: "/rollback", label: "Rollback", hint: "Undo changes" },
      { to: "/report", label: "Report", hint: "Export & closeout" },
    ],
  },
];

export function Shell({ health }: { health: HealthResponse | null }) {
  const location = useLocation();
  useEffect(() => {
    const active = groups.flatMap((group) => group.items).find((item) => item.to === location.pathname);
    document.title = active && active.to !== "/" ? `${active.label} · ADAssassin` : "ADAssassin";
  }, [location.pathname]);

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
          {groups.map((group) => (
            <div className="nav-group" key={group.heading}>
              <div className="nav-heading">{group.heading}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                  <span>{item.label}</span>
                  <span className="nav-hint">{item.hint}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="rail-foot">
          Local console. Authorized internal use only.
          <br />
          Phase {health?.phase ?? "6"} · engine pin {health?.engine_pin ?? "0.10.1"}
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
