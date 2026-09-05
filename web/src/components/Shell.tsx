import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { NAV_GROUPS } from "../nav";
import type { Capability, Engagement, HealthResponse } from "../types";
import { CommandPalette } from "./CommandPalette";

export function Shell({
  health,
  engagements = [],
  current = null,
  onSelectEngagement = () => {},
  catalog = [],
}: {
  health: HealthResponse | null;
  engagements?: Engagement[];
  current?: Engagement | null;
  onSelectEngagement?: (id: string) => void;
  catalog?: Capability[];
}) {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const active = NAV_GROUPS.flatMap((group) => group.items).find((item) => item.to === location.pathname);
    document.title = active && active.to !== "/" ? `${active.label} · ADAssassin` : "ADAssassin";
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const engineOk = health?.engine.available;
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      {navOpen && (
        <button className="rail-overlay" type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
      )}
      <aside className={`rail${navOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="mark">AD</div>
          <div>
            <div className="brand-name">Assassin</div>
            <div className="brand-sub">Operator console</div>
          </div>
        </div>
        <nav aria-label="Console sections">
          {NAV_GROUPS.map((group) => (
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
          <br />
          Press Ctrl+K to jump anywhere.
        </div>
      </aside>
      <section className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="btn ghost menu-btn"
              type="button"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              onClick={() => setNavOpen((open) => !open)}
            >
              Menu
            </button>
            <div className="banner">Authorized use only · written scope required for live work</div>
          </div>
          <div className="topbar-right">
            {engagements.length > 0 && (
              <select
                className="engagement-select"
                aria-label="Current engagement"
                value={current?.id ?? ""}
                onChange={(event) => onSelectEngagement(event.target.value)}
              >
                {engagements.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.mode}
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn ghost palette-trigger"
              type="button"
              aria-label="Open command palette"
              onClick={() => setPaletteOpen(true)}
            >
              Jump <span className="kbd">Ctrl K</span>
            </button>
            <div className="status-pills">
              <span className="pill">ADAssassin {health?.version ?? "…"}</span>
              <span className={`pill ${engineOk ? "ok" : "warn"}`}>engine {engineOk ? "live" : "catalog fallback"}</span>
              <span className="pill">{health?.catalog_count ?? 0} capabilities</span>
              <span className="pill">{health?.bind ?? "127.0.0.1"}</span>
            </div>
          </div>
        </header>
        <div className="content" id="main-content" tabIndex={-1}><Outlet /></div>
      </section>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        catalog={catalog}
        engagements={engagements}
        onSelectEngagement={onSelectEngagement}
      />
    </div>
  );
}
