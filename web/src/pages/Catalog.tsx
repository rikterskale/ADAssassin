import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CapabilityPicker } from "../components/CapabilityPicker";
import type { Capability, CatalogResponse, Lane } from "../types";

function runLabel(item: Capability): string {
  const red = item.requires_red_confirm || item.lane === "red" || item.risk === "destructive" || item.risk === "side_effect";
  if (!red) return "Run";
  const label = item.risk_label || (item.risk === "side_effect" ? "side effect" : "destructive");
  return `Run ${item.id} ${label}`;
}

export function Catalog({ catalog, onViewGreen }: { catalog: CatalogResponse | null; onViewGreen: () => void }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [lane, setLane] = useState<Lane | "all">((params.get("lane") as Lane) || "all");
  const [category, setCategory] = useState(params.get("category") ?? "all");
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => { if (lane === "green") onViewGreen(); }, [lane, onViewGreen]);

  const items = useMemo(() => catalog?.capabilities ?? [], [catalog]);
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  function syncParam(key: string, value: string, clearWhen: string) {
    const copy = new URLSearchParams(params);
    if (!value || value === clearWhen) copy.delete(key);
    else copy.set(key, value);
    setParams(copy, { replace: true });
  }

  function updateQuery(next: string) {
    setQuery(next);
    syncParam("q", next, "");
  }
  function updateLane(next: Lane | "all") {
    setLane(next);
    syncParam("lane", next, "all");
  }
  function updateCategory(next: string) {
    setCategory(next);
    syncParam("category", next, "all");
  }

  const canRun = Boolean(selected?.runnable ?? selected);
  const selectedRed = Boolean(
    selected
    && (selected.requires_red_confirm || selected.lane === "red" || selected.risk === "destructive" || selected.risk === "side_effect"),
  );

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Advanced catalog</div>
        <h1>{catalog?.count ?? 0} capabilities from the pinned engine.</h1>
        <p className="lede">
          Source: {catalog?.source ?? "…"}. Search or filter by lane and category, then open a
          capability to inspect it. Observe runs freely; RED capabilities require a typed confirm on
          the Run page.
        </p>
      </section>
      <div className="grid">
        <div className="panel span-8">
          <CapabilityPicker
            capabilities={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            query={query}
            onQueryChange={updateQuery}
            lane={lane}
            onLaneChange={updateLane}
            category={category}
            onCategoryChange={updateCategory}
          />
        </div>
        <div className="panel span-4">
          <h2>Inspector</h2>
          {selected ? (
            <>
              <div className="mono">{selected.id}</div>
              <p>{selected.plain ?? selected.summary}</p>
              <p className="muted">
                {selected.environment} · {selected.maturity}<br />
                approval {selected.approval} · rollback {selected.rollback_expectation || selected.rollback}<br />
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
              {selectedRed && (
                <p className="muted">
                  RED ({selected.risk_label || selected.risk}). The Run page requires typing{" "}
                  <span className="mono">{selected.id}</span> to confirm.
                </p>
              )}
              {canRun && (
                <div className="actions">
                  <Link className="btn primary" to={`/run?capability=${encodeURIComponent(selected.id)}`}>
                    {runLabel(selected)}
                  </Link>
                </div>
              )}
            </>
          ) : (
            <p className="muted">Select a capability to see details and a run link.</p>
          )}
        </div>
      </div>
    </>
  );
}
