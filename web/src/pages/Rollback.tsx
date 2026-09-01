import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Engagement, RollbackResponse } from "../types";

export function Rollback({
  engagement,
  onUpdated,
}: {
  engagement: Engagement | null;
  onUpdated: (engagement: Engagement) => void;
}) {
  const [rollback, setRollback] = useState<RollbackResponse | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    if (!engagement) return;
    const response = await api.rollback(engagement.id);
    setRollback(response);
    if (response.engagement) onUpdated(response.engagement);
  }

  useEffect(() => {
    if (!engagement) {
      setRollback(null);
      return;
    }
    let cancelled = false;
    void refresh().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagement?.id, engagement?.updated_at]);

  async function preview() {
    if (!engagement) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.previewRollback(engagement.id);
      setRollback(response);
      setMessage(response.message ?? "Preview ready.");
      if (response.engagement) onUpdated(response.engagement);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply(event: FormEvent) {
    event.preventDefault();
    if (!engagement) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.applyRollback(engagement.id, {
        force: true,
        ack: true,
        confirm: confirm.trim(),
      });
      setRollback(response);
      setMessage("Rollback apply requested.");
      setConfirm("");
      if (response.engagement) onUpdated(response.engagement);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Rollback</div>
        <h1>Preview cleanup. Apply only with typed confirmation.</h1>
        <p className="lede">
          Preview never contacts a domain controller. Apply wraps engine cleanup and requires
          force, ack, and typed <span className="mono">YES</span> (Phase 5-adjacent).
        </p>
      </section>
      <div className="grid">
        <div className="panel span-7">
          <h2>Pending entries</h2>
          {!engagement ? (
            <div className="empty">
              Select an engagement or <Link to="/guided">seed the demo</Link>.
            </div>
          ) : (rollback?.entries ?? []).length === 0 ? (
            <div className="empty">No cleanup entries. Demo seeds one pending fixture entry.</div>
          ) : (
            (rollback?.entries ?? []).map((entry, index) => (
              <div className="finding" key={`${entry.session_id}-${entry.kind}-${index}`}>
                <div>
                  <span className={`badge ${entry.status === "pending" ? "yellow" : entry.status === "failed" ? "red" : "green"}`}>
                    {entry.status}
                  </span>{" "}
                  <span className="mono">{entry.kind}</span>
                </div>
                <div className="muted mono">{entry.session_id}</div>
                <div className="muted">{entry.target}</div>
                <div className="muted">{entry.classification ?? "—"} · previous recorded {entry.has_previous ? "yes" : "no"}</div>
              </div>
            ))
          )}
        </div>
        <div className="panel span-5">
          <h2>Actions</h2>
          <p className="muted">
            Pending {rollback?.pending ?? engagement?.rollback.pending ?? 0}
            {" · "}failed {rollback?.failed ?? 0}
            {" · "}completed {rollback?.completed ?? 0}
          </p>
          {message && <p className="muted">{message}</p>}
          {error && <div className="banner-error">{error}</div>}
          <div className="actions">
            <button className="btn" type="button" disabled={busy || !engagement} onClick={() => void preview()}>
              Preview rollback
            </button>
          </div>
          <form className="form" onSubmit={apply} style={{ marginTop: 16 }}>
            <p className="muted">
              Apply contacts the authorized DC through the engine cleanup path. Type YES to confirm.
            </p>
            <input
              placeholder="Type YES"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
            />
            <button className="btn primary" type="submit" disabled={busy || !engagement || confirm.trim() !== "YES"}>
              {busy ? "Working…" : "Apply rollback"}
            </button>
          </form>
          {(rollback?.sessions ?? []).length > 0 && (
            <>
              <h2>Sessions</h2>
              {(rollback?.sessions ?? []).map((session) => (
                <div className="finding" key={session.session_id}>
                  <div className="mono">{session.session_id}</div>
                  <div className="muted">{session.status} · pending {session.pending ?? 0}</div>
                  <div className="muted">{session.next_action}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
