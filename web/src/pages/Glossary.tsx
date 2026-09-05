import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { GlossaryResponse } from "../types";

export function Glossary({ onSeen }: { onSeen: () => void }) {
  const [data, setData] = useState<GlossaryResponse | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    void api.glossary().then(setData);
    onSeen();
  }, [onSeen]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data?.items ?? [];
    if (!q) return all;
    return all.filter((item) => `${item.term} ${item.definition}`.toLowerCase().includes(q));
  }, [data, query]);

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Glossary</div>
        <h1>Terms the catalog expects you to already know.</h1>
        <p className="lede">Source: {data?.source ?? "…"}.</p>
      </section>
      <div className="panel">
        <div className="filters">
          <input
            type="search"
            placeholder="Search terms"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search glossary"
          />
        </div>
        {!data ? (
          <div className="empty">Loading glossary…</div>
        ) : items.length === 0 ? (
          <div className="empty">No terms match that search.</div>
        ) : (
          items.map((item) => (
            <div className="finding" key={item.term}>
              <div className="mono">{item.term}</div>
              <div className="muted">{item.definition}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
