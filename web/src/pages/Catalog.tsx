import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RiskBadge } from "../components/RiskBadge";
import type { Capability, CatalogResponse, Lane } from "../types";

export function Catalog({ catalog, onViewGreen }: { catalog: CatalogResponse | null; onViewGreen: () => void }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [lane, setLane] = useState<Lane | "all">((params.get("lane") as Lane) || "all");
  const [category, setCategory] = useState(params.get("category") ?? "all");
  const [selected, setSelected] = useState<Capability | null>(null);

  useEffect(() => { if (lane === "green") onViewGreen(); }, [lane, onViewGreen]);

  const items = catalog?.capabilities ?? [];
  const categories = useMemo(() => ["all", ...Array.from(new Set(items.map((item) => item.category))).sort()], [items]);
  const filtered = items.filter((item) => {
    const blob = `${item.id} ${item.summary} ${item.category}`.toLowerCase();
    if (query.trim() && !blob.includes(query.trim().toLowerCase())) return false;
    if (lane !== "all" && item.lane !== lane) return false;
    if (category !== "all" && item.category !== category) return false;
    return true;
  });

  function updateLane(next: Lane | "all") {
    setLane(next);
    const copy = new URLSearchParams(params);
    if (next === "all") copy.delete("lane"); else copy.set("lane", next);
    setParams(copy, { replace: true });
  }

  const canRun = selected?.runnable ?? (selected != null && selected.lane !== "red" && selected.risk === "observe");

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Advanced catalog</div>
        <h1>{catalog?.count ?? 0} capabilities from the pinned engine.</h1>
        <p className="lede">
          Source: {catalog?.source ?? "…"}. Observe capabilities can run from here. Red stays Phase 5.
        </p>
      </section>
      <div className="grid">
        <div className="panel span-8">
          <div className="filters">
            <input type="search" placeholder="Search id, summary, category" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={lane} onChange={(e) => updateLane(e.target.value as Lane | "all")}>
              <option value="all">All lanes</option><option value="green">Green</option><option value="yellow">Yellow</option><option value="red">Red</option>
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>ID</th><th>Lane</th><th>Category</th><th>Approval</th><th>Summary</th><th></th></tr></thead>
              <tbody>
                {filtered.map((item) => {
                  const runnable = item.runnable ?? (item.lane !== "red" && item.risk === "observe");
                  return (
                    <tr key={item.id} onClick={() => setSelected(item)} style={{ cursor: "pointer" }}>
                      <td className="mono">{item.id}</td>
                      <td><RiskBadge lane={item.lane} risk={item.risk} /></td>
                      <td>{item.category}</td>
                      <td className="mono">{item.approval}</td>
                      <td>{item.plain ?? item.summary}</td>
                      <td>
                        {runnable ? (
                          <Link className="btn ghost" to={`/run?capability=${encodeURIComponent(item.id)}`} onClick={(e) => e.stopPropagation()}>
                            Run
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel span-4">
          <h2>Inspector</h2>
          {selected ? (
            <>
              <div className="mono">{selected.id}</div>
              <p>{selected.summary}</p>
              <p className="muted">
                {selected.environment} · {selected.maturity}<br />
                approval {selected.approval} · rollback {selected.rollback}<br />
                tools {(selected.tools || []).join(", ") || "none"}
              </p>
              {(selected.required_prompts ?? []).length > 0 && (
                <>
                  <h2>Required prompts</h2>
                  {(selected.required_prompts ?? []).map((prompt) => (
                    <div className="finding" key={prompt.option}>
                      <div className="mono">{prompt.option}</div>
                      <div className="muted">{prompt.label} — {prompt.help}</div>
                    </div>
                  ))}
                </>
              )}
              {selected.lane === "red" && <p className="muted">RED. Typed confirmation is Phase 5.</p>}
              {canRun && (
                <div className="actions">
                  <Link className="btn primary" to={`/run?capability=${encodeURIComponent(selected.id)}`}>Run observe</Link>
                </div>
              )}
            </>
          ) : <p className="muted">Select a capability.</p>}
        </div>
      </div>
    </>
  );
}
