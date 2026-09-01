import { useEffect, useState } from "react";
import { api } from "../api";
import type { GlossaryResponse } from "../types";

export function Glossary({ onSeen }: { onSeen: () => void }) {
  const [data, setData] = useState<GlossaryResponse | null>(null);
  useEffect(() => {
    void api.glossary().then(setData);
    onSeen();
  }, [onSeen]);
  return (
    <>
      <section className="hero">
        <div className="brand-sub">Glossary</div>
        <h1>Terms the catalog expects you to already know.</h1>
        <p className="lede">Source: {data?.source ?? "…"}.</p>
      </section>
      <div className="panel">
        {(data?.items ?? []).map((item) => (
          <div className="finding" key={item.term}>
            <div className="mono">{item.term}</div>
            <div className="muted">{item.definition}</div>
          </div>
        ))}
      </div>
    </>
  );
}
