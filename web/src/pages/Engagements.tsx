import { FormEvent, useState } from "react";
import type { Engagement } from "../types";

export function Engagements({
  items,
  currentId,
  onCreate,
  onDemo,
  onSelect,
}: {
  items: Engagement[];
  currentId: string | null;
  onCreate: (body: { name: string; domain: string; dc: string; notes: string }) => Promise<void>;
  onDemo: () => void;
  onSelect: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [dc, setDc] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate({ name: name.trim(), domain, dc, notes });
      setName("");
      setDomain("");
      setDc("");
      setNotes("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Engagements</div>
        <h1>One workspace per authorized assessment.</h1>
        <p className="lede">
          Domain and DC are stored locally. Use Connect for preflight before
          yellow observe runs. Passwords never land in engagement JSON.
        </p>
      </section>
      <div className="grid">
        <div className="panel span-6">
          <h2>New engagement</h2>
          <form className="form" onSubmit={submit}>
            <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <input placeholder="Domain (optional)" value={domain} onChange={(e) => setDomain(e.target.value)} />
            <input placeholder="DC host or IP (optional)" value={dc} onChange={(e) => setDc(e.target.value)} />
            <textarea placeholder="Scope notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="actions">
              <button className="btn primary" type="submit" disabled={busy}>
                Create
              </button>
              <button className="btn ghost" type="button" onClick={onDemo}>
                Seed demo
              </button>
            </div>
          </form>
        </div>
        <div className="panel span-6">
          <h2>Saved</h2>
          {items.length === 0 ? (
            <div className="empty">None yet.</div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                className="finding"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  borderLeft: currentId === item.id ? "2px solid var(--gold)" : "2px solid transparent",
                  paddingLeft: 10,
                }}
                type="button"
                onClick={() => onSelect(item.id)}
              >
                <div>{item.name}</div>
                <div className="muted mono">
                  {item.id} · {item.mode}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}
