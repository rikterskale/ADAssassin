import { useEffect, useState } from "react";
import { api } from "../api";
import { NoEngagement } from "../components/NoEngagement";
import type { Engagement, VaultItem, VaultResponse } from "../types";

export function Vault({
  engagement,
  onUpdated,
  onSeedDemo,
}: {
  engagement: Engagement | null;
  onUpdated: (engagement: Engagement) => void;
  onSeedDemo: () => void;
}) {
  const [vault, setVault] = useState<VaultResponse | null>(null);
  const [selected, setSelected] = useState<VaultItem | null>(null);
  const [revealed, setRevealed] = useState<{ name: string; value: unknown; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!engagement) {
      setVault(null);
      setSelected(null);
      setRevealed(null);
      return;
    }
    let cancelled = false;
    void api.vault(engagement.id).then((response) => {
      if (!cancelled) {
        setVault(response);
        setSelected((current) => current ?? response.items[0] ?? null);
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
  }, [engagement?.id, engagement?.updated_at]);

  async function unmask() {
    if (!engagement || !selected) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.unmaskVault(engagement.id, selected.name, {
        scope: selected.scope,
        ttl_seconds: 30,
      });
      setRevealed({
        name: result.item.name,
        value: result.item.value,
        expires_at: result.item.expires_at,
      });
      onUpdated(result.engagement);
      setVault(await api.vault(engagement.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Vault</div>
        <h1>See that secrets exist. Unmask one at a time.</h1>
        <p className="lede">
          Metadata only by default. Unmask writes an audit event on the engagement and keeps the
          value in process memory for a short TTL. Engagement JSON never stores ticket bytes or NT hashes.
        </p>
      </section>
      <div className="grid">
        <div className="panel span-6">
          <h2>Inventory</h2>
          {!engagement ? (
            <NoEngagement onSeedDemo={onSeedDemo} />
          ) : (
            <>
              <div className="metric-row">
                <div className="metric"><b>{vault?.counters.secrets ?? engagement.vault.secrets}</b><span>Secrets</span></div>
                <div className="metric"><b>{vault?.counters.tickets ?? engagement.vault.tickets}</b><span>Tickets</span></div>
                <div className="metric"><b>{vault?.counters.certificates ?? engagement.vault.certificates}</b><span>Certificates</span></div>
              </div>
              {(vault?.items ?? []).length === 0 ? (
                <div className="empty">No vault items yet.</div>
              ) : (
                (vault?.items ?? []).map((item) => (
                  <button
                    key={`${item.scope}:${item.name}`}
                    type="button"
                    className="finding"
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      borderLeft: selected?.name === item.name && selected.scope === item.scope ? "2px solid var(--gold)" : "2px solid transparent",
                      paddingLeft: 10,
                      cursor: "pointer",
                    }}
                    onClick={() => { setSelected(item); setRevealed(null); }}
                  >
                    <div>
                      <span className={`badge ${item.secret ? "red" : "green"}`}>{item.kind}</span>{" "}
                      {item.label}
                    </div>
                    <div className="muted mono">{item.name} · {item.scope}</div>
                    <div className="muted">created {item.created ?? "—"} · last used {item.last_used ?? "—"}</div>
                  </button>
                ))
              )}
            </>
          )}
        </div>
        <div className="panel span-6">
          <h2>Item</h2>
          {!selected ? (
            <div className="empty">Select a vault item.</div>
          ) : (
            <>
              <div className="mono">{selected.name}</div>
              <p className="muted">{selected.label} · {selected.kind} · {selected.secret ? "secret" : "public"}</p>
              {error && <div className="banner-error">{error}</div>}
              <div className="actions">
                <button className="btn primary" type="button" disabled={busy || !selected.secret} onClick={() => void unmask()}>
                  {busy ? "Unmasking…" : "Unmask for 30s"}
                </button>
              </div>
              {!selected.secret && <p className="muted">Public metadata items do not need unmask.</p>}
              {revealed && revealed.name === selected.name && (
                <>
                  <h2>Unmasked value</h2>
                  <p className="muted">Expires {revealed.expires_at}</p>
                  <pre className="log">{JSON.stringify(revealed.value, null, 2)}</pre>
                </>
              )}
              {(engagement?.vault_audit?.length ?? 0) > 0 && (
                <>
                  <h2>Audit</h2>
                  {(engagement?.vault_audit ?? []).slice().reverse().slice(0, 8).map((row) => (
                    <div className="finding" key={row.id}>
                      <div className="mono">{row.action} · {row.name}</div>
                      <div className="muted">{row.at} · ttl {row.ttl_seconds}s</div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
