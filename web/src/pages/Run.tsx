import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { RiskBadge } from "../components/RiskBadge";
import type { Capability, Engagement, Job } from "../types";

export function Run({
  engagement,
  catalog,
  onRan,
}: {
  engagement: Engagement | null;
  catalog: Capability[];
  onRan: (engagement: Engagement) => void;
}) {
  const [params, setParams] = useSearchParams();
  const initialId = params.get("capability") ?? "";
  const [capabilityId, setCapabilityId] = useState(initialId);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [detail, setDetail] = useState<Capability | null>(null);

  const runnable = useMemo(
    () => catalog.filter((item) => item.runnable ?? (item.lane !== "red" && item.risk === "observe")),
    [catalog],
  );

  useEffect(() => {
    if (!capabilityId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void api.capability(capabilityId).then((response) => {
      if (!cancelled) {
        setDetail(response.capability);
        const next: Record<string, string> = {};
        for (const prompt of response.capability.required_prompts ?? []) {
          const key = prompt.is_param && prompt.param_key
            ? prompt.param_key
            : prompt.option.replace(/^--/, "").replace(/-/g, "_");
          if (key === "domain" && engagement?.domain) next[key] = engagement.domain;
          else if ((key === "dc" || key === "dc_ip") && engagement?.dc) next[key] = engagement.dc;
          else next[key] = options[key] ?? "";
        }
        setOptions((current) => ({ ...next, ...current }));
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilityId, engagement?.domain, engagement?.dc]);

  function selectCapability(id: string) {
    setCapabilityId(id);
    setJob(null);
    setError(null);
    const copy = new URLSearchParams(params);
    if (id) copy.set("capability", id); else copy.delete("capability");
    setParams(copy, { replace: true });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!engagement || !capabilityId) return;
    setBusy(true);
    setError(null);
    try {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(options)) {
        if (value.trim()) cleaned[key] = value.trim();
      }
      const result = await api.run(engagement.id, {
        capability_id: capabilityId,
        options: cleaned,
        ack: false,
      });
      setJob(result.job);
      onRan(result.engagement);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const prompts = detail?.required_prompts ?? [];
  const connected = Boolean(engagement?.connect?.preflight_ok);

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Run</div>
        <h1>GREEN and YELLOW observe only.</h1>
        <p className="lede">
          Red / destructive / side_effect capabilities are refused until Phase 5.
          Yellow runs need a successful connect on this engagement first.
        </p>
      </section>
      <div className="grid">
        <div className="panel span-6">
          <h2>Capability</h2>
          {!engagement ? (
            <div className="empty">Select an engagement first.</div>
          ) : (
            <form className="form" onSubmit={submit}>
              <div className="muted">
                {engagement.name}
                {" · "}
                {connected ? <span className="badge green">connected</span> : <span className="badge yellow">no connect</span>}
                {" · "}
                <Link to="/connect">Connect</Link>
              </div>
              <select value={capabilityId} onChange={(e) => selectCapability(e.target.value)} required>
                <option value="">Select observe capability…</option>
                {runnable.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{item.lane}] {item.id}
                  </option>
                ))}
              </select>
              {detail && (
                <div className="muted">
                  <RiskBadge lane={detail.lane} risk={detail.risk} /> {detail.plain ?? detail.summary}
                </div>
              )}
              {prompts.map((prompt) => {
                const key = prompt.is_param && prompt.param_key
                  ? prompt.param_key
                  : prompt.option.replace(/^--/, "").replace(/-/g, "_");
                return (
                  <label key={prompt.option} className="form">
                    <span className="muted">{prompt.label}</span>
                    <input
                      value={options[key] ?? ""}
                      onChange={(e) => setOptions((current) => ({ ...current, [key]: e.target.value }))}
                      placeholder={prompt.help}
                    />
                  </label>
                );
              })}
              {error && <div className="banner-error">{error}</div>}
              <div className="actions">
                <button className="btn primary" type="submit" disabled={busy || !capabilityId}>
                  {busy ? "Running…" : "Run observe"}
                </button>
              </div>
            </form>
          )}
        </div>
        <div className="panel span-6">
          <h2>Job log</h2>
          {!job ? (
            <div className="empty">No job yet. Recent jobs also appear on the engagement.</div>
          ) : (
            <>
              <p className="muted mono">
                {job.id} · {job.capability_id} ·{" "}
                <span className={`badge ${job.status === "completed" ? "green" : "red"}`}>{job.status}</span>
              </p>
              <pre className="log">{(job.log || []).join("\n") || "(empty)"}</pre>
              {job.error && <div className="banner-error">{job.error}</div>}
              {(job.findings || []).length > 0 && (
                <>
                  <h2>Attached findings</h2>
                  {job.findings.map((finding) => (
                    <div className="finding" key={finding.id}>
                      <div>{finding.title}</div>
                      <div className="muted">{finding.severity} · {finding.summary}</div>
                    </div>
                  ))}
                </>
              )}
              {(job.next_actions || []).length > 0 && (
                <>
                  <h2>What next</h2>
                  {job.next_actions!.map((action) => (
                    <div className="finding" key={action.id}>
                      <Link to={`/run?capability=${encodeURIComponent(action.id)}`}>{action.id}</Link>
                      <div className="muted">{action.message}</div>
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
