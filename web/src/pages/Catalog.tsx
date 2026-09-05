import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CapabilityPicker } from "../components/CapabilityPicker";
import { CopyButton } from "../components/CopyButton";
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
        <div className="panel span-4 sticky-side">
          <h2>Inspector</h2>
          {selected ? (
            <>
              <div className="id-row">
                <div className="mono">{selected.id}</div>
                <CopyButton value={selected.id} label="Copy id" />
              </div>
              <p>{selected.plain ?? selected.summary}</p>
              {canRun && (
                <div className="actions">
                  <Link className="btn primary" to={`/run?capability=${encodeURIComponent(selected.id)}`}>
                    {runLabel(selected)}
                  </Link>
                </div>
              )}
              {!canRun && (
                <p className="muted">Install the declared dependency or restore the pinned engine before running.</p>
              )}
              {selectedRed && (
                <p className="muted">
                  RED ({selected.risk_label || selected.risk}). The Run page requires typing{" "}
                  <span className="mono">{selected.id}</span> to confirm.
                </p>
              )}
              <dl className="meta-list">
                <div><dt>Environment</dt><dd>{selected.environment}</dd></div>
                <div><dt>Maturity</dt><dd>{selected.maturity}</dd></div>
                <div><dt>Approval</dt><dd>{selected.approval}</dd></div>
                <div><dt>Rollback</dt><dd>{selected.rollback_expectation || selected.rollback}</dd></div>
                <div><dt>Tools</dt><dd>{(selected.tools || []).join(", ") || "none"}</dd></div>
                <div><dt>Category</dt><dd>{selected.category}</dd></div>
              </dl>
              {selected.readiness && (
                <div className={selected.readiness.ready ? "banner-ok" : "banner-error"}>
                  Local readiness: {selected.readiness.ready ? "ready" : selected.readiness.reason}.
                  {selected.readiness.dependencies.map((dependency) => (
                    <div className="muted" key={dependency.id}>
                      {dependency.id}: {dependency.available ? "available" : dependency.detail}
                    </div>
                  ))}
                </div>
              )}
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
            </>
          ) : (
            <p className="muted">Select a capability to see details and a run link.</p>
          )}
        </div>
      </div>
    </>
  );
}
