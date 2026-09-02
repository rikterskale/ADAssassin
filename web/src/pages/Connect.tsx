import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { NoEngagement } from "../components/NoEngagement";
import type { Engagement } from "../types";

export function Connect({
  engagement,
  onConnected,
  onSeedDemo,
}: {
  engagement: Engagement | null;
  onConnected: (engagement: Engagement) => void;
  onSeedDemo: () => void;
}) {
  const [domain, setDomain] = useState("");
  const [dc, setDc] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hashes, setHashes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState(engagement?.connect?.preflight ?? null);

  useEffect(() => {
    setDomain(engagement?.domain ?? "");
    setDc(engagement?.dc ?? "");
    setUsername(engagement?.username ?? "");
    setPreflight(engagement?.connect?.preflight ?? null);
    setPassword("");
    setHashes("");
    setError(null);
  }, [engagement?.id, engagement?.domain, engagement?.dc, engagement?.username, engagement?.connect]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!engagement) {
      setError("Create or select an engagement first.");
      return;
    }
    if (engagement.mode === "demo") {
      setError("Offline demo engagements cannot contact a directory. Create a live-ready engagement first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.connect(engagement.id, {
        domain: domain.trim(),
        dc: dc.trim(),
        username: username.trim() || undefined,
        password: password || undefined,
        hashes: hashes.trim() || undefined,
      });
      setPassword("");
      setHashes("");
      setPreflight(result.preflight);
      onConnected(result.engagement);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Connect</div>
        <h1>Point this engagement at an authorized domain controller.</h1>
        <p className="lede">
          Preflight wraps the engine live-ad doctor (DNS + DC ports). It does not run a capability.
          Passwords and hashes stay in process memory and are never written to engagement JSON.
        </p>
      </section>
      <div className="grid">
        <div className="panel span-6">
          <h2>Target</h2>
          {!engagement ? (
            <NoEngagement onSeedDemo={onSeedDemo} />
          ) : (
            <form className="form" onSubmit={submit}>
              <div className="muted mono">{engagement.name} · {engagement.id}</div>
              {engagement.mode === "demo" && (
                <div className="banner-error">
                  This is an offline demo engagement. Create or select a live-ready engagement before connecting.
                </div>
              )}
              <input
                placeholder="Domain (e.g. corp.local)"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
              <input
                placeholder="DC host or IP"
                value={dc}
                onChange={(e) => setDc(e.target.value)}
                required
              />
              <input
                placeholder="Username (optional)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                type="password"
                placeholder="Password (optional, not saved to disk)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
              />
              <input
                placeholder="NTLM hashes LM:NT or NT (optional, not saved to disk)"
                value={hashes}
                onChange={(e) => setHashes(e.target.value)}
                autoComplete="off"
              />
              {error && <div className="banner-error">{error}</div>}
              <div className="actions">
                <button className="btn primary" type="submit" disabled={busy || engagement.mode === "demo"}>
                  {busy ? "Checking…" : "Run preflight"}
                </button>
                <Link className="btn ghost" to="/run">
                  Open run
                </Link>
              </div>
            </form>
          )}
        </div>
        <div className="panel span-6">
          <h2>Preflight result</h2>
          {!preflight ? (
            <div className="empty">No preflight yet.</div>
          ) : (
            <>
              <p className="muted">
                <span className={`badge ${preflight.ok ? "green" : "red"}`}>
                  {preflight.ok ? "ready" : "blocked"}
                </span>{" "}
                target contacted {preflight.target_contacted ? "yes" : "no"}
              </p>
              {(preflight.checks ?? []).map((check) => (
                <div className="finding" key={check.id}>
                  <span className={`badge ${check.status === "ok" ? "green" : check.status === "warning" ? "yellow" : "red"}`}>
                    {check.status}
                  </span>{" "}
                  <span className="mono">{check.id}</span>
                  <div className="muted">{typeof check.value === "string" ? check.value : JSON.stringify(check.value)}</div>
                </div>
              ))}
              {preflight.next_step && <p className="muted">Next: {preflight.next_step}</p>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
