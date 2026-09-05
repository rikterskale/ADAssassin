import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { CapabilityPicker } from "../components/CapabilityPicker";
import { Field, SecretField } from "../components/Field";
import { NoEngagement } from "../components/NoEngagement";
import { RiskBadge } from "../components/RiskBadge";
import { useToast } from "../components/Toasts";
import { formatWhen } from "../format";
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
  const notify = useToast();
  const [params, setParams] = useSearchParams();
  const initialId = params.get("capability") ?? "";
  const [capabilityId, setCapabilityId] = useState(initialId);
  const [options, setOptions] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState("");
  const [approvalToken, setApprovalToken] = useState("");
  const [approvalEngagementId, setApprovalEngagementId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [detail, setDetail] = useState<Capability | null>(null);
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<Lane | "all">("all");
  const [pollId, setPollId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const runnable = useMemo(
    () => catalog.filter((item) => item.runnable ?? true),
    [catalog],
  );
  const recentJobs = useMemo(
    () => [...(engagement?.jobs ?? [])].reverse().slice(0, 8),
    [engagement?.jobs],
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
        setApprovalToken("");
        setApprovalEngagementId("");
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilityId, engagement?.domain, engagement?.dc]);

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
          if (res.job.status === "completed") notify(`Run complete: ${res.job.capability_id}`);
          if (res.job.status === "failed") notify(`Run failed: ${res.job.capability_id}`, "bad");
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
    setApprovalToken("");
    setApprovalEngagementId("");
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
  const requiresScopedApproval = detail?.approval === "scoped_token";
  const demoBlocked = engagement?.mode === "demo" && detail?.lane !== "green";

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
        approval_token: requiresScopedApproval ? approvalToken : undefined,
        approval_engagement_id: requiresScopedApproval ? approvalEngagementId.trim() : undefined,
      });
      setJob(result.job);
      if (result.job.status === "running") {
        setStartedAt(Date.now());
        setElapsed(0);
        setPollId(result.job.id);
      } else {
        onRan(result.engagement);
        if (result.job.status === "completed") notify(`Run complete: ${result.job.capability_id}`);
        if (result.job.status === "failed") notify(`Run failed: ${result.job.capability_id}`, "bad");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApprovalToken("");
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
  const canSubmit = Boolean(capabilityId)
    && !demoBlocked
    && Boolean(detail?.readiness?.ready ?? detail?.runnable ?? true)
    && (!isRed || confirm.trim() === capabilityId)
    && (!requiresScopedApproval || Boolean(approvalToken && approvalEngagementId.trim()));

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
              {detail?.readiness && !detail.readiness.ready && (
                <div className="banner-error">
                  Not locally ready: {detail.readiness.reason}. {detail.readiness.dependencies
                    .filter((dependency) => !dependency.available)
                    .map((dependency) => dependency.detail)
                    .join(" · ")}
                </div>
              )}
              {demoBlocked && (
                <div className="banner-error">
                  Offline demo engagements can run GREEN capabilities only. Create a live-ready engagement first.
                </div>
              )}
              {prompts.map((prompt) => {
                const key = prompt.is_param && prompt.param_key
                  ? prompt.param_key
                  : prompt.option.replace(/^--/, "").replace(/-/g, "_");
                return (
                  <Field key={prompt.option} label={prompt.label} hint={prompt.help}>
                    <input
                      value={options[key] ?? ""}
                      onChange={(e) => setOptions((current) => ({ ...current, [key]: e.target.value }))}
                      placeholder={prompt.help}
                    />
                  </Field>
                );
              })}
              {isRed && (
                <>
                  <div className="banner-error">
                    This run is <strong>{riskLabel}</strong>. Rollback expectation:{" "}
                    <span className="mono">{detail?.rollback_expectation || detail?.rollback || "none"}</span>.
                    Type the capability id to confirm.
                  </div>
                  <Field label="Typed confirmation">
                    <input
                      placeholder={`Type ${capabilityId}`}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="off"
                      required
                      spellCheck={false}
                    />
                  </Field>
                </>
              )}
              {requiresScopedApproval && (
                <div className="form">
                  <div className="banner-error">
                    This engine capability requires a scoped approval token bound to the approved engagement,
                    target, capability, and parameters. The token is sent to the engine and is never persisted.
                  </div>
                  <SecretField
                    label="Scoped approval token"
                    placeholder="Scoped approval token"
                    value={approvalToken}
                    onChange={setApprovalToken}
                    required
                  />
                  <Field label="Approval engagement ID">
                    <input
                      placeholder="Approval engagement ID"
                      value={approvalEngagementId}
                      onChange={(e) => setApprovalEngagementId(e.target.value)}
                      autoComplete="off"
                      required
                      spellCheck={false}
                    />
                  </Field>
                </div>
              )}
              {error && <div className="banner-error">{error}</div>}
              <div className="actions">
                <button
                  className={`btn primary${isRed ? " danger" : ""}`}
                  type="submit"
                  disabled={running || !canSubmit}
                >
                  {buttonLabel}
                </button>
              </div>
            </form>
          )}
        </div>
        <div className="panel span-6 sticky-side">
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
          {recentJobs.length > 0 && (
            <>
              <h2>Recent jobs</h2>
              {recentJobs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`finding${job?.id === item.id ? " selected" : ""}`}
                  onClick={() => setJob(item)}
                >
                  <div className="mono">{item.capability_id}</div>
                  <div className="muted">
                    <span className={`badge ${item.status === "completed" ? "green" : item.status === "running" ? "yellow" : "red"}`}>
                      {item.status}
                    </span>
                    {" · "}
                    {formatWhen(item.created_at)}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
