import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Field, SecretField } from "../components/Field";
import { NoEngagement } from "../components/NoEngagement";
import { useToast } from "../components/Toasts";
import { connectStatusMessage } from "../connection";
import { formatWhen } from "../format";
import type { ConnectAuthMode, DirectoryTransport, Engagement } from "../types";

function initialAuthMode(engagement: Engagement | null): ConnectAuthMode {
  if (engagement?.connect) return engagement.connect.auth_mode ?? "authenticated";
  return engagement?.username ? "authenticated" : "anonymous";
}

export function Connect({
  engagement,
  onConnected,
  onSeedDemo,
}: {
  engagement: Engagement | null;
  onConnected: (engagement: Engagement) => void;
  onSeedDemo: () => void;
}) {
  const notify = useToast();
  const [domain, setDomain] = useState("");
  const [dc, setDc] = useState("");
  const [transport, setTransport] = useState<DirectoryTransport>(
    engagement?.connect?.transport ?? "ldap",
  );
  const [authMode, setAuthMode] = useState<ConnectAuthMode>(initialAuthMode(engagement));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hashes, setHashes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState(engagement?.connect?.preflight ?? null);
  const activeJob = engagement?.jobs?.find((job) => job.status === "running");
  const ldapPort = transport === "ldaps" ? 636 : 389;

  useEffect(() => {
    setDomain(engagement?.domain ?? "");
    setDc(engagement?.dc ?? "");
    setTransport(engagement?.connect?.transport ?? "ldap");
    setAuthMode(initialAuthMode(engagement));
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
    if (password && hashes) {
      setError("Choose one bind method: password or NTLM hashes, not both.");
      return;
    }
    if (authMode === "anonymous" && (username.trim() || password || hashes.trim())) {
      setError("Anonymous mode cannot include a username, password, or NTLM hashes.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.connect(engagement.id, {
        domain: domain.trim(),
        dc: dc.trim(),
        transport,
        auth_mode: authMode,
        username: authMode === "authenticated" ? username.trim() || undefined : undefined,
        password: authMode === "authenticated" ? password || undefined : undefined,
        hashes: authMode === "authenticated" ? hashes.trim() || undefined : undefined,
      });
      setPassword("");
      setHashes("");
      setPreflight(result.preflight);
      onConnected(result.engagement);
      notify(
        result.preflight.ready
          ? authMode === "anonymous"
            ? "Anonymous preflight ready. No domain credentials were supplied."
            : "Authenticated preflight ready. Target checks completed."
          : "Preflight blocked. Review the checks before running.",
        result.preflight.ready ? "ok" : "warn",
      );
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
          Preflight wraps the engine live-ad doctor and binds the selected directory transport and
          standard port to this target. It does not run a capability. Passwords and hashes stay in
          process memory and are never written to engagement JSON.
        </p>
        <div className="banner-ok">
          <strong>No domain credentials?</strong> Choose <strong>Anonymous — no domain credentials</strong> below.
          ADAssassin will then permit runs only for GREEN offline checks and capabilities the pinned engine
          explicitly declares anonymous.
          <div className="actions">
            <Link className="btn ghost" to="/catalog?auth=anonymous">Browse anonymous checks</Link>
            <Link className="btn ghost" to="/catalog?auth=offline">Browse offline checks</Link>
          </div>
        </div>
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
              {engagement.archived && (
                <div className="banner-warning">
                  This engagement is archived and execution-locked. Restore it from Engagements before connecting.
                </div>
              )}
              {activeJob && (
                <div className="banner-warning">
                  {activeJob.capability_id} is running. Review its live status before starting a new
                  target preflight.
                </div>
              )}
              {engagement.mode !== "demo" && engagement.connect && !engagement.connect.preflight_ok && (
                <div className="banner-warning">{connectStatusMessage(engagement)}</div>
              )}
              <Field label="Domain" hint="FQDN of the authorized forest or domain.">
                <input
                  placeholder="Domain (e.g. corp.local)"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  maxLength={255}
                  required
                  spellCheck={false}
                />
              </Field>
              <Field label="Domain controller" hint="Hostname or IP of the authorized DC.">
                <input
                  placeholder="DC host or IP"
                  value={dc}
                  onChange={(e) => setDc(e.target.value)}
                  maxLength={255}
                  required
                  spellCheck={false}
                />
              </Field>
              <Field
                label="Directory transport"
                hint="The selected transport and its standard port become part of the preflight-bound target."
              >
                <select
                  value={transport}
                  onChange={(event) => setTransport(event.target.value as DirectoryTransport)}
                >
                  <option value="ldap">LDAP (389)</option>
                  <option value="starttls">LDAP + StartTLS (389)</option>
                  <option value="ldaps">LDAPS (636)</option>
                </select>
              </Field>
              <Field
                label="LDAP port"
                hint="Derived from the selected transport because the pinned engine supports the standard LDAP ports."
              >
                <input type="number" value={ldapPort} readOnly />
              </Field>
              <Field
                label="Authentication mode"
                hint="Anonymous mode never sends a username, password, hashes, Kerberos cache, or AES key to the engine."
              >
                <select
                  value={authMode}
                  onChange={(event) => {
                    const next = event.target.value as ConnectAuthMode;
                    setAuthMode(next);
                    if (next === "anonymous") {
                      setUsername("");
                      setPassword("");
                      setHashes("");
                    }
                  }}
                >
                  <option value="anonymous">Anonymous — no domain credentials</option>
                  <option value="authenticated">Authenticated — supplied or engine credential</option>
                </select>
              </Field>
              {authMode === "anonymous" ? (
                <div className="banner-ok" role="status">
                  <strong>ANONYMOUS — NO DOMAIN CREDENTIALS.</strong> Preflight still contacts the
                  authorized target, but later runs are limited to GREEN or engine-declared anonymous
                  capabilities. Credential-dependent capabilities fail closed.
                </div>
              ) : (
                <>
                  <div className="banner-warning">
                    <strong>AUTHENTICATED MODE.</strong> Supply credentials here or use only credential
                    material explicitly supported by the pinned engine at run time.
                  </div>
                  <Field label="Username" hint="Optional bind account. Stored on the engagement; the password is not.">
                    <input
                      placeholder="Username (optional)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      maxLength={320}
                      spellCheck={false}
                    />
                  </Field>
                  <SecretField
                    label="Password"
                    hint="Use either a password or NTLM hashes. Held in process memory only."
                    placeholder="Password (optional, not saved to disk)"
                    value={password}
                    onChange={setPassword}
                    maxLength={4096}
                  />
                  <SecretField
                    label="NTLM hashes"
                    hint="Use either hashes or a password. LM:NT or NT; held in process memory only."
                    placeholder="NTLM hashes LM:NT or NT (optional, not saved to disk)"
                    value={hashes}
                    onChange={setHashes}
                    maxLength={4096}
                  />
                </>
              )}
              {error && <div className="banner-error">{error}</div>}
              <div className="actions">
                <button className="btn primary" type="submit" disabled={busy || engagement.mode === "demo" || engagement.archived || Boolean(activeJob)}>
                  {busy ? "Checking…" : "Run preflight"}
                </button>
                <Link className="btn ghost" to="/run">
                  Open run
                </Link>
              </div>
            </form>
          )}
        </div>
        <div className="panel span-6 sticky-side">
          <h2>Preflight result</h2>
          {!preflight ? (
            <div className="empty">No preflight yet.</div>
          ) : (
            <>
              <p className="muted">
                <span className={`badge ${preflight.ready ? "green" : "red"}`}>
                  {preflight.ready ? "ready" : "blocked"}
                </span>{" "}
                target probes attempted {preflight.target_contacted ? "yes" : "no"}
              </p>
              <p className="muted mono">
                {(preflight.transport ?? transport).toUpperCase()} · port {preflight.ldap_port ?? ldapPort}
              </p>
              <p className="muted">
                Authentication: <strong>{authMode === "anonymous" ? "Anonymous — no domain credentials" : "Authenticated"}</strong>
              </p>
              {engagement?.connect?.expires_at && preflight.ready && (
                <p className="muted">Valid until {formatWhen(engagement.connect.expires_at)}. Restarting the console requires a new preflight.</p>
              )}
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
