import { FormEvent, useEffect, useMemo, useState } from "react";
import { Field } from "../components/Field";
import { formatWhen } from "../format";
import type { Engagement } from "../types";

export function Engagements({
  items,
  currentId,
  onCreate,
  onUpdate,
  onArchive,
  onDemo,
  onSelect,
}: {
  items: Engagement[];
  currentId: string | null;
  onCreate: (body: { name: string; domain: string; dc: string; notes: string }) => Promise<void>;
  onUpdate?: (id: string, body: { name: string; domain: string; dc: string; notes: string }) => Promise<void>;
  onArchive?: (id: string, archived: boolean) => Promise<void>;
  onDemo: () => void;
  onSelect: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [dc, setDc] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useMemo(() => items.find((item) => item.id === currentId) ?? null, [items, currentId]);
  const [editName, setEditName] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editDc, setEditDc] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const activeJob = current?.jobs?.find((job) => job.status === "running");

  useEffect(() => {
    setEditName(current?.name ?? "");
    setEditDomain(current?.domain ?? "");
    setEditDc(current?.dc ?? "");
    setEditNotes(current?.notes ?? "");
    setError(null);
  }, [current?.id, current?.updated_at]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), domain, dc, notes });
      setName("");
      setDomain("");
      setDc("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!current || !onUpdate || !editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onUpdate(current.id, {
        name: editName.trim(),
        domain: editDomain,
        dc: editDc,
        notes: editNotes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!current || !onArchive) return;
    setBusy(true);
    setError(null);
    try {
      await onArchive(current.id, !current.archived);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
            <Field label="Name">
              <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </Field>
            <Field label="Domain" hint="Optional. You can fill this in later on Connect.">
              <input placeholder="Domain (optional)" value={domain} onChange={(e) => setDomain(e.target.value)} maxLength={255} spellCheck={false} />
            </Field>
            <Field label="Domain controller">
              <input placeholder="DC host or IP (optional)" value={dc} onChange={(e) => setDc(e.target.value)} maxLength={255} spellCheck={false} />
            </Field>
            <Field label="Scope notes" hint="Written authorization, in-scope OUs, and out-of-scope systems.">
              <textarea placeholder="Scope notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={10000} />
            </Field>
            {error && <div className="banner-error">{error}</div>}
            <div className="actions">
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create"}
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
                className={`finding${currentId === item.id ? " selected" : ""}`}
                type="button"
                onClick={() => onSelect(item.id)}
              >
                <div>{item.name}</div>
                <div className="muted mono">
                  {item.id} · {item.mode} {item.archived && <span className="badge">archived</span>}
                </div>
                <div className="muted">
                  {item.findings.length} findings
                  {" · "}
                  {item.domain || "no domain"}
                  {item.dc ? ` · ${item.dc}` : ""}
                  {" · "}
                  {formatWhen(item.updated_at)}
                </div>
              </button>
            ))
          )}
        </div>
        {current && (
          <div className="panel span-12">
            <h2>Edit selected engagement</h2>
            <p className="muted">
              Corrections are audited. Changing the domain or DC immediately revokes the current
              preflight and clears in-memory bind credentials. Archive is recoverable and never
              deletes evidence.
            </p>
            {activeJob && (
              <div className="banner-warning">
                {activeJob.capability_id} is running. Target edits and archive are locked until the
                job reaches a terminal state; its notes and name can still be corrected.
              </div>
            )}
            <form className="form" onSubmit={saveEdit}>
              <div className="form-grid">
                <Field label="Name">
                  <input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={120} required />
                </Field>
                <Field label="Domain" hint={current.mode === "demo" ? "Demo targets are permanently disabled." : activeJob ? "Locked while a capability is running." : "Changing this requires a new Connect preflight."}>
                  <input value={editDomain} onChange={(event) => setEditDomain(event.target.value)} maxLength={255} disabled={current.mode === "demo" || Boolean(activeJob)} spellCheck={false} />
                </Field>
                <Field label="Domain controller" hint={current.mode === "demo" ? "Demo targets are permanently disabled." : activeJob ? "Locked while a capability is running." : "Changing this requires a new Connect preflight."}>
                  <input value={editDc} onChange={(event) => setEditDc(event.target.value)} maxLength={255} disabled={current.mode === "demo" || Boolean(activeJob)} spellCheck={false} />
                </Field>
              </div>
              <Field label="Scope notes" hint="Keep authorization, exclusions, stop conditions, and rollback owner current.">
                <textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} rows={5} maxLength={10000} />
              </Field>
              {error && <div className="banner-error">{error}</div>}
              <div className="actions">
                <button className="btn primary" type="submit" disabled={busy || !onUpdate}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
                <button className="btn ghost" type="button" disabled={busy || !onArchive || Boolean(activeJob)} onClick={() => void toggleArchive()}>
                  {current.archived ? "Restore engagement" : "Archive engagement"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
