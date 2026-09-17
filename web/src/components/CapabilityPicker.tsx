import { useMemo } from "react";
import { authenticationClass, authenticationLabel } from "../authentication";
import { RiskBadge } from "./RiskBadge";
import type { AuthenticationFilter, Capability, Lane } from "../types";

export function CapabilityPicker({
  capabilities,
  selectedId,
  onSelect,
  query,
  onQueryChange,
  lane,
  onLaneChange,
  category,
  onCategoryChange,
  authentication,
  onAuthenticationChange,
}: {
  capabilities: Capability[];
  selectedId: string;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  lane: Lane | "all";
  onLaneChange: (value: Lane | "all") => void;
  category?: string;
  onCategoryChange?: (value: string) => void;
  authentication?: AuthenticationFilter;
  onAuthenticationChange?: (value: AuthenticationFilter) => void;
}) {
  const showCategory = category !== undefined && onCategoryChange !== undefined;
  const showAuthentication = authentication !== undefined && onAuthenticationChange !== undefined;

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(capabilities.map((item) => item.category))).sort()],
    [capabilities],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return capabilities.filter((item) => {
      if (lane !== "all" && item.lane !== lane) return false;
      if (showCategory && category !== "all" && item.category !== category) return false;
      if (
        showAuthentication
        && authentication !== "all"
        && authenticationClass(item) !== authentication
      ) return false;
      if (!q) return true;
      return `${item.id} ${item.summary} ${item.plain ?? ""} ${item.category}`
        .toLowerCase()
        .includes(q);
    });
  }, [capabilities, query, lane, category, showCategory, authentication, showAuthentication]);

  return (
    <div className="picker">
      <div className="filters">
        <input
          type="search"
          placeholder="Search capabilities by name or keyword"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <select
          value={lane}
          aria-label="Lane filter"
          onChange={(e) => onLaneChange(e.target.value as Lane | "all")}
        >
          <option value="all">All lanes</option>
          <option value="green">Green (offline)</option>
          <option value="yellow">Yellow (reads target)</option>
          <option value="red">Red (changes state)</option>
        </select>
        {showCategory && (
          <select
            value={category}
            aria-label="Category filter"
            onChange={(e) => onCategoryChange!(e.target.value)}
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item === "all" ? "All categories" : item}
              </option>
            ))}
          </select>
        )}
        {showAuthentication && (
          <select
            value={authentication}
            aria-label="Authentication filter"
            onChange={(event) => onAuthenticationChange!(event.target.value as AuthenticationFilter)}
          >
            <option value="all">All authentication</option>
            <option value="offline">Offline — no DC or credentials</option>
            <option value="anonymous">Anonymous — no domain credentials</option>
            <option value="credentialed">Credentialed / other</option>
          </select>
        )}
      </div>
      <div className="picker-list">
        {filtered.length === 0 ? (
          <div className="empty">No capabilities match that search.</div>
        ) : (
          filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`picker-row${item.id === selectedId ? " selected" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <div className="picker-row-head">
                <RiskBadge lane={item.lane} risk={item.risk} />
                <span className="mono">{item.id}</span>
                {!(item.readiness?.ready ?? item.runnable ?? true) && (
                  <span className="badge">blocked locally</span>
                )}
                <span
                  className={`badge ${
                    authenticationClass(item) === "offline"
                      ? "green"
                      : authenticationClass(item) === "anonymous"
                        ? "yellow"
                        : ""
                  }`}
                >
                  {authenticationLabel(item)}
                </span>
              </div>
              <div className="muted">{item.plain ?? item.summary}</div>
            </button>
          ))
        )}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        Showing {filtered.length} of {capabilities.length} capabilities.
      </div>
    </div>
  );
}
