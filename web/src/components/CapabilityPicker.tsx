import { useMemo, useState } from "react";
import { RiskBadge } from "./RiskBadge";
import type { Capability, Lane } from "../types";

export function CapabilityPicker({
  capabilities,
  selectedId,
  onSelect,
}: {
  capabilities: Capability[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<Lane | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return capabilities.filter((item) => {
      if (lane !== "all" && item.lane !== lane) return false;
      if (!q) return true;
      return `${item.id} ${item.summary} ${item.plain ?? ""} ${item.category}`
        .toLowerCase()
        .includes(q);
    });
  }, [capabilities, query, lane]);

  return (
    <div className="picker">
      <div className="filters">
        <input
          type="search"
          placeholder="Search capabilities by name or keyword"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={lane} onChange={(e) => setLane(e.target.value as Lane | "all")}>
          <option value="all">All lanes</option>
          <option value="green">Green (offline)</option>
          <option value="yellow">Yellow (reads target)</option>
          <option value="red">Red (changes state)</option>
        </select>
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
              </div>
              <div className="muted">{item.plain ?? item.summary}</div>
            </button>
          ))
        )}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        Showing {filtered.length} of {capabilities.length} runnable capabilities.
      </div>
    </div>
  );
}
