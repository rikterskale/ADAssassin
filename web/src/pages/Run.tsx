import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CapabilityPicker } from "../components/CapabilityPicker";
import { NoEngagement } from "../components/NoEngagement";
import { RiskBadge } from "../components/RiskBadge";
import type { Capability, Engagement, Job, Lane } from "../types";

export function Run({
  engagement,
  catalog,
  onRan,
  onSeedDemo,
}: {
  engagement: Engagement | null;
  catalog: Capability[];
  onRan: (engagement: Engagement) => void;
  onSeedDemo: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const initialId = params.get("capability") ?? "";
  const [capabilityId, setCapabilityId] = useState(initialId);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [detail, setDetail] = useState<Capability | null>(null);
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<Lane | "all">("all");
  // Id of a run being polled for live progress, plus a running-elapsed counter.
  const [pollId, setPollId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const runnable = useMemo(
    () => catalog.filter((item) => item.runnable ?? true),
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
        setConfirm("");
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilityId, engagement?.domain, engagement?.dc]);

  // Poll a backgrounded run until it reaches a terminal state, streaming the
  // job log as it grows. On completion, refresh the engagement so findings and
  // counts update elsewhere in the console.
  useEffect(() => {
    if (!pollId || !engagement) return;
    let cancelled = false;
    const engagementId = engagement.id;
    async function tick() {
      try {
        const res = await api.job(engagementId, pollId!);
        if (cancelled) return;
        setJob(res.job);
        if (res.job.status !== "running") {
          setPollId(null);
          try {
            const fresh = await api.engagement(engagementId);
            onRan(fresh.engagement);
          } catch {
            /* engagement refresh is best-effort */
          }
        }
      } catch {
        /* transient error; keep polling */
      }
    }
    const handle = window.setInterval(() => void tick(), 900);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId, engagement?.id]);

  // Tick the elapsed-seconds readout while a run is in flight.
  useEffect(() => {
    if (!pollId || startedAt == null) return;
    const handle = window.setInterval(
      () => setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000))),
      500,
    );
    return () => window.clearInterval(handle);
  }, [pollId, startedAt]);

  function selectCapability(id: string) {
    setCapabilityId(id);
    setJob(null);
    setError(null);
    setConfirm("");
    setPollId(null);
    setStartedAt(null);
    const copy = new URLSearchParams(params);
    if (id) copy.set("capability", id); else copy.delete("capability");
    setParams(copy, { replace: true });
  }

  const isRed = Boolean(
    detail?.requires_red_confirm
    || detail?.lane === "red"
    || detail?.risk === "destructive"
    || detail?.risk === "side_effect",
  );
  const riskLabel = detail?.risk_label
    || (detail?.risk === "side_effect" ? "side effect" : detail?.risk === "destructive" ? "destructive" : "observe");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!engagement || !capabilityId) return;
    setBusy(true);
    setError(null);
    setJob(null);
    setPollId(null);
    try {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(options)) {
        if (value.trim()) cleaned[key] = value.trim();
      }
      const result = await api.run(engagement.id, {
        capability_id: capabilityId,
        options: cleaned,
        ack: isRed,
        force: isRed,
        confirm: isRed ? confirm.trim() : "",
        actor: "operator",
      });
      setJob(result.job);
      if (result.job.status === "running") {
        // Hand off to the polling effect; the run continues on the server.
        setStartedAt(Date.now());
        setElapsed(0);
        setPollId(result.job.id);
      } else {
        onRan(result.engagement);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const prompts = detail?.required_prompts ?? [];
  const connected = Boolean(engagement?.connect?.preflight_ok);
  const running = busy || Boolean(pollId);
  const submitLabel = isRed
    ? `Run ${capabilityId || "capability"} ${riskLabel}`
    : "Run observe";
  const buttonLabel = busy
    ? "Starting…"
    : pollId
      ? `Running… ${elapsed}s`
      : submitLabel;
  const canSubmit = Boolean(capabilityId) && (!isRed || confirm.trim() === capabilityId);

  return (
    <>
      <section className="hero">
        <div className="brand-sub">Run</div>
        <h1>Observe freely. RED only with typed confirmation.</h1>
        <p className="lede">
          Search for a capability below. Yellow observe needs connect. Destructive and side-effect
          capabilities require ack, force, and typing the capability id. No global red toggle.
        </p>
      </section>
      <div className="grid">
        <div className="panel span-6">
          <h2>Capability</h2>
          {!engagement ? (
            <NoEngagement onSeedDemo={onSeedDemo} />
          ) : (
            <form className="form" onSubmit={submit}>
              <div className="muted">
                {engagement.name}
                {" · "}
                {connected ? <span className="badge green">connected</span> : <span className="badge yellow">no connect</span>}
                {" · "}
                <Link to="/connect">Connect</Link>
              </div>
              <CapabilityPicker
                capabilities={runnable}
                selectedId={capabilityId}
                onSelect={selectCapability}
                query={query}
                onQueryChange={setQuery}
                lane={lane}
                onLaneChange={setLane}
              />
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
              {isRed && (
                <>
                  <div className="banner-error">
                    This run is <strong>{riskLabel}</strong>. Rollback expectation:{" "}
                    <span className="mono">{detail?.rollback_expectation || detail?.rollback || "none"}</span>.
                    Type the capability id to confirm.
                  </div>
                  <input
                    placeholder={`Type ${capabilityId}`}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </>
              )}
              {error && <div className="banner-error">{error}</div>}
              <div className="actions">
                <button className="btn primary" type="submit" disabled={running || !canSubmit}>
                  {buttonLabel}
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
                <span
                  className={`badge ${
                    job.status === "completed" ? "green" : job.status === "running" ? "yellow" : "red"
                  }`}
                >
                  {job.status}
                </span>
                {job.status === "running" && <> · <span className="live-dot" /> {elapsed}s elapsed</>}
              </p>
              {job.status === "running" && (
                <p className="muted">
                  The engine is working. This log updates live — you can leave this page and the run
                  keeps going.
                </p>
              )}
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
