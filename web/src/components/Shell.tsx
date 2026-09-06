import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { NAV_GROUPS } from "../nav";
import { connectStatusMessage, isConnectReady } from "../connection";
import type { Capability, Engagement, HealthResponse } from "../types";
import { CommandPalette } from "./CommandPalette";

export function Shell({
  health,
  engagements = [],
  current = null,
  onSelectEngagement = () => {},
  catalog = [],
  notice = null,
  refreshing = false,
  onRefresh = () => {},
}: {
  health: HealthResponse | null;
  engagements?: Engagement[];
  current?: Engagement | null;
  onSelectEngagement?: (id: string) => void;
  catalog?: Capability[];
  notice?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void;
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
  const connectionReady = isConnectReady(current);
  const activeJob = (current?.jobs ?? []).find((job) => job.status === "running");
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
            <button
              className="btn ghost refresh-trigger"
              type="button"
              aria-label="Refresh console data"
              disabled={refreshing}
              onClick={onRefresh}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <div className="status-pills">
              <span className="pill">ADAssassin {health?.version ?? "…"}</span>
              <span className={`pill ${engineOk ? "ok" : "warn"}`}>engine {engineOk ? "live" : "catalog fallback"}</span>
              <span className="pill">{health?.catalog_count ?? 0} capabilities</span>
              <span className="pill">{health?.bind ?? "127.0.0.1"}</span>
            </div>
          </div>
        </header>
        {notice && (
          <div className="system-notice" role="alert">
            <span><strong>Console data may be stale.</strong> {notice}</span>
            <button className="btn ghost" type="button" disabled={refreshing} onClick={onRefresh}>
              Retry
            </button>
          </div>
        )}
        <div className="scopebar" aria-label="Current engagement context">
          {current ? (
            <>
              <span className="scope-label">Current engagement</span>
              <strong>{current.name}</strong>
              <span className={`badge ${current.mode === "demo" ? "yellow" : ""}`}>{current.mode}</span>
              {connectionReady && <span className="badge green">preflight ready</span>}
              {current.mode !== "demo" && current.connect && !connectionReady && (
                <Link className="scope-detail warning" to="/connect">{connectStatusMessage(current)}</Link>
              )}
              {current.archived && <span className="badge">archived · execution locked</span>}
              {activeJob && (
                <Link className="scope-detail warning" to={`/run?job=${encodeURIComponent(activeJob.id)}`}>
                  {activeJob.capability_id} is running · open live status
                </Link>
              )}
              <span className="scope-detail">
                {current.mode === "demo"
                  ? "offline fixture · no target contact"
                  : `${current.domain || "domain unset"} · ${current.dc || "DC unset"}`}
              </span>
              <span className="scope-detail">{current.findings?.length ?? 0} findings</span>
              {(current.rollback?.pending ?? 0) > 0 && (
                <span className="scope-detail warning">{current.rollback.pending} rollback pending</span>
              )}
              <Link to="/engagements">Manage</Link>
            </>
          ) : (
            <>
              <span className="scope-label">Current engagement</span>
              <span className="scope-detail">Preparing the offline demo…</span>
            </>
          )}
        </div>
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
