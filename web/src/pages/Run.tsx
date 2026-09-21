import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { authenticationLabel, supportsAnonymous } from "../authentication";
import { CapabilityPicker } from "../components/CapabilityPicker";
import { Field, SecretField } from "../components/Field";
import { NoEngagement } from "../components/NoEngagement";
import { RiskBadge } from "../components/RiskBadge";
import { useToast } from "../components/Toasts";
import { connectStatusMessage, isConnectReady } from "../connection";
import { formatWhen } from "../format";
import type { AuthenticationFilter, Capability, Engagement, Job, Lane } from "../types";

function connectionTransportLabel(engagement: Engagement): string {
  const connect = engagement.connect;
  const transport = connect?.target?.transport ?? connect?.transport ?? "ldap";
  const port = connect?.target?.ldap_port ?? connect?.ldap_port ?? (transport === "ldaps" ? 636 : 389);
  return `${transport.toUpperCase()}:${port}`;
}

function promptKey(prompt: NonNullable<Capability["required_prompts"]>[number]): string {
  return prompt.key ?? (prompt.is_param && prompt.param_key
    ? prompt.param_key
    : prompt.option.replace(/^--/, "").replace(/-/g, "_"));
}

function isSensitivePrompt(key: string): boolean {
  return ["password", "new_password", "spray_password", "hashes", "nthash", "secret", "token"]
    .some((term) => key.toLowerCase() === term || key.toLowerCase().endsWith(`_${term}`));
}

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
  const [authentication, setAuthentication] = useState<AuthenticationFilter>(
    engagement?.connect?.auth_mode === "anonymous" ? "anonymous" : "all",
  );
  const [pollId, setPollId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [jobStatusError, setJobStatusError] = useState<string | null>(null);
  const recentJobs = useMemo(
    () => [...(engagement?.jobs ?? [])].slice(0, 8),
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
          const key = promptKey(prompt);
          if (prompt.source === "engagement_target" || prompt.source === "safety_gate") continue;
          if (key === "domain" && engagement?.connect?.domain) next[key] = engagement.connect.domain;
          else if ((key === "dc" || key === "dc_ip") && engagement?.connect?.dc) next[key] = engagement.connect.dc;
          else next[key] = "";
        }
        setOptions(next);
        setConfirm("");
        setApprovalToken("");
        setApprovalEngagementId("");
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    });
    return () => { cancelled = true; };
  }, [capabilityId, engagement?.id, engagement?.domain, engagement?.dc]);

  useEffect(() => {
    setAuthentication(engagement?.connect?.auth_mode === "anonymous" ? "anonymous" : "all");
  }, [engagement?.id, engagement?.connect?.auth_mode]);

  useEffect(() => {
    if (!engagement) return;
    const requested = params.get("job");
    const recover = (engagement.jobs ?? []).find((item) => item.id === requested)
      ?? (engagement.jobs ?? []).find((item) => item.status === "running");
    if (!recover) return;
    setJob(recover);
    setCapabilityId(recover.capability_id);
    if (recover.status === "running") {
      setStartedAt(Date.parse(recover.created_at) || Date.now());
      setPollId(recover.id);
    }
    // Reattach whenever the selected engagement changes; do not disturb an
    // operator who is already inspecting a different terminal job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagement?.id]);

  useEffect(() => {
    if (!pollId || !engagement) return;
    let cancelled = false;
    const engagementId = engagement.id;
    async function tick() {
      try {
        const res = await api.job(engagementId, pollId!);
        if (cancelled) return;
        setJobStatusError(null);
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
      } catch (err) {
        if (!cancelled) {
          setJobStatusError(
            `Status unknown: ${err instanceof Error ? err.message : String(err)} The run may still be active; automatic status checks will continue.`,
          );
        }
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
    setDetail(null);
    setOptions({});
    setJob(null);
    setError(null);
    setConfirm("");
    setApprovalToken("");
    setApprovalEngagementId("");
    setPollId(null);
    setJobStatusError(null);
    setStartedAt(null);
    const copy = new URLSearchParams(params);
    copy.delete("job");
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
  const anonymousConnection = engagement?.connect?.auth_mode === "anonymous";
  const anonymousBlocked = Boolean(
    anonymousConnection
    && detail
    && detail.lane !== "green"
    && !supportsAnonymous(detail),
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!engagement || !capabilityId) return;
    setBusy(true);
    setError(null);
    setJob(null);
    setPollId(null);
    try {
      const cleaned: Record<string, unknown> = {};
      const promptByKey = new Map(prompts.map((prompt) => [promptKey(prompt), prompt]));
      for (const [key, value] of Object.entries(options)) {
        const prompt = promptByKey.get(key);
        const shouldTrim = prompt?.trim ?? !isSensitivePrompt(key);
        const normalized = shouldTrim ? value.trim() : value;
        if (normalized !== "") cleaned[key] = normalized;
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
        onRan(result.engagement);
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
  const connected = isConnectReady(engagement);
  const requiresConnection = Boolean(detail && detail.lane !== "green");
  const running = busy || Boolean(pollId);
  const operatorPrompts = prompts.filter(
    (prompt) => !prompt.source || prompt.source === "operator",
  );
  const missingPrompts = operatorPrompts.filter((prompt) => {
    if (prompt.required === false) return false;
    const value = options[promptKey(prompt)];
    return value == null || (prompt.trim === false ? value === "" : value.trim() === "");
  });
  const submitLabel = isRed
    ? `Run ${capabilityId || "capability"} ${riskLabel}`
    : "Run observe";
  const buttonLabel = busy
    ? "Starting…"
    : pollId
      ? `Running… ${elapsed}s`
      : capabilityId && !detail
        ? "Loading capability…"
        : submitLabel;
  const canSubmit = Boolean(capabilityId)
    && Boolean(detail)
    && !demoBlocked
    && !anonymousBlocked
    && (!requiresConnection || connected)
    && Boolean(detail?.readiness?.ready ?? detail?.runnable ?? true)
    && !engagement?.archived
    && missingPrompts.length === 0
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
        <div className="banner-ok">
          <strong>No domain credentials?</strong> Use the <strong>Anonymous — no domain credentials</strong>
          filter. GREEN checks run offline; anonymous target checks run only when the pinned engine
          explicitly advertises anonymous authentication.
          <div className="actions">
            <Link className="btn ghost" to="/catalog?auth=anonymous">Browse anonymous checks</Link>
            <Link className="btn ghost" to="/catalog?auth=offline">Browse offline checks</Link>
          </div>
        </div>
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
                {connected ? (
                  anonymousConnection
                    ? <span className="badge yellow">connected anonymously — no credentials</span>
                    : <span className="badge green">connected authenticated</span>
                ) : <span className="badge yellow">no connect</span>}
                {" · "}
                <Link to="/connect">Connect</Link>
              </div>
              <CapabilityPicker
                capabilities={catalog}
                selectedId={capabilityId}
                onSelect={selectCapability}
                query={query}
                onQueryChange={setQuery}
                lane={lane}
                onLaneChange={setLane}
                authentication={authentication}
                onAuthenticationChange={setAuthentication}
              />
              {detail && (
                <div className="muted">
                  <RiskBadge lane={detail.lane} risk={detail.risk} /> {detail.plain ?? detail.summary}
                </div>
              )}
              {detail?.readiness && !detail.readiness.ready && (
                <div className="banner-error">
                  Visible but not locally runnable: {detail.readiness.reason}. {detail.readiness.dependencies
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
              {detail && detail.lane === "green" && (
                <div className="banner-ok">
                  <strong>OFFLINE — NO DOMAIN CREDENTIALS.</strong> This GREEN capability uses local
                  evidence and does not require a target connection.
                </div>
              )}
              {detail && detail.lane !== "green" && supportsAnonymous(detail) && (
                <div className="banner-ok">
                  <strong>ANONYMOUS CHECK AVAILABLE — NO DOMAIN CREDENTIALS.</strong> The pinned engine
                  declares this capability anonymous. It still contacts the authorized target and
                  requires a successful anonymous preflight.
                </div>
              )}
              {anonymousBlocked && (
                <div className="banner-error" role="alert">
                  <strong>BLOCKED IN ANONYMOUS MODE.</strong> The pinned engine does not declare this
                  capability anonymous. Choose an Offline or Anonymous capability, or return to Connect
                  and explicitly establish an authenticated session.
                </div>
              )}
              {requiresConnection && !connected && engagement.mode !== "demo" && (
                <div className="banner-warning">
                  {connectStatusMessage(engagement)} Complete a successful target preflight for this exact
                  domain/DC before running a capability that can contact or change it.{' '}
                  <Link to="/connect">Open Connect</Link>.
                </div>
              )}
              {engagement.archived && (
                <div className="banner-warning">
                  This engagement is archived and execution-locked. Restore it from Engagements before running.
                </div>
              )}
              {detail && detail.lane !== "green" && (
                <div className="target-lock" role="status">
                  <strong>Preflight-bound target</strong>
                  <span className="mono">
                    {engagement.connect?.target?.domain ?? engagement.connect?.domain ?? "domain unset"}
                    {" · "}
                    {engagement.connect?.target?.dc ?? engagement.connect?.dc ?? "DC unset"}
                  </span>
                  <span className="muted mono">{connectionTransportLabel(engagement)}</span>
                  <span className="muted">
                    {anonymousConnection ? "Anonymous — no domain credentials" : "Authenticated connection"}
                  </span>
                  <span className="muted">Target fields are locked here. Change them in Connect, which runs a new preflight.</span>
                </div>
              )}
              {operatorPrompts.map((prompt) => {
                const key = promptKey(prompt);
                const inputType = prompt.input_type ?? (isSensitivePrompt(key) ? "secret" : "text");
                if (inputType === "secret") {
                  return (
                    <SecretField
                      key={prompt.option}
                      label={prompt.label}
                      hint={`${prompt.help} Held in browser memory for this run only.`}
                      value={options[key] ?? ""}
                      onChange={(value) => setOptions((current) => ({ ...current, [key]: value }))}
                      placeholder={prompt.help}
                      required={prompt.required !== false}
                      maxLength={4096}
                    />
                  );
                }
                if (inputType === "select") {
                  return (
                    <Field key={prompt.option} label={prompt.label} hint={prompt.help}>
                      <select
                        value={options[key] ?? ""}
                        onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.value }))}
                        required={prompt.required !== false}
                      >
                        <option value="">Select one…</option>
                        {(prompt.choices ?? []).map((choice) => (
                          <option key={choice} value={choice}>{choice}</option>
                        ))}
                      </select>
                    </Field>
                  );
                }
                if (inputType === "boolean") {
                  return (
                    <Field key={prompt.option} label={prompt.label} hint={prompt.help}>
                      <select
                        value={options[key] ?? ""}
                        onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.value }))}
                        required={prompt.required !== false}
                      >
                        <option value="">Select one…</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </Field>
                  );
                }
                if (inputType === "textarea") {
                  return (
                    <Field key={prompt.option} label={prompt.label} hint={prompt.help}>
                      <textarea
                        value={options[key] ?? ""}
                        onChange={(event) => setOptions((current) => ({ ...current, [key]: event.target.value }))}
                        placeholder={prompt.help}
                        rows={4}
                        required={prompt.required !== false}
                        spellCheck={prompt.spellcheck ?? false}
                      />
                    </Field>
                  );
                }
                return (
                  <Field key={prompt.option} label={prompt.label} hint={prompt.pattern_help ?? prompt.help}>
                    <input
                      type={inputType === "integer" ? "number" : "text"}
                      value={options[key] ?? ""}
                      onChange={(e) => setOptions((current) => ({ ...current, [key]: e.target.value }))}
                      placeholder={prompt.help}
                      required={prompt.required !== false}
                      pattern={prompt.pattern}
                      spellCheck={prompt.spellcheck ?? false}
                    />
                  </Field>
                );
              })}
              {detail && (
                <section className="review-card" aria-label="Execution review">
                  <h3>Execution review</h3>
                  <dl className="meta-list">
                    <div><dt>Capability</dt><dd className="mono">{detail.id}</dd></div>
                    <div><dt>Target</dt><dd>{detail.lane === "green" ? "Local evidence only" : `${engagement.connect?.target?.domain ?? engagement.connect?.domain ?? "domain unset"} · ${engagement.connect?.target?.dc ?? engagement.connect?.dc ?? "DC unset"}`}</dd></div>
                    <div><dt>Directory</dt><dd>{detail.lane === "green" ? "Not applicable" : connectionTransportLabel(engagement)}</dd></div>
                    <div><dt>Lane</dt><dd><RiskBadge lane={detail.lane} risk={detail.risk} /></dd></div>
                    <div><dt>Authentication</dt><dd>{authenticationLabel(detail)}</dd></div>
                    <div><dt>Connection mode</dt><dd>{detail.lane === "green" ? "Not applicable" : anonymousConnection ? "Anonymous — no domain credentials" : "Authenticated"}</dd></div>
                    <div><dt>Noise</dt><dd>{detail.noise || "not declared"}</dd></div>
                    <div><dt>Approval</dt><dd>{detail.approval || "none"}</dd></div>
                    <div><dt>Rollback</dt><dd>{detail.rollback_expectation || detail.rollback || "none"}</dd></div>
                  </dl>
                </section>
              )}
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
              {missingPrompts.length > 0 && detail?.readiness?.ready && (
                <div className="banner-warning">
                  Complete {missingPrompts.length} required input{missingPrompts.length === 1 ? "" : "s"}:{' '}
                  {missingPrompts.map((prompt) => prompt.label).join(", ")}.
                </div>
              )}
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
                {job.failure_category && (
                  <> · <span className="badge red">{job.failure_category} failure</span></>
                )}
                {job.status === "running" && <> · <span className="live-dot" /> {elapsed}s elapsed</>}
              </p>
              {job.status === "running" && (
                <p className="muted">
                  The engine is working. This log updates live — you can leave this page and the run
                  keeps going.
                </p>
              )}
              {jobStatusError && (
                <div className="banner-warning" role="alert">
                  {jobStatusError}
                  <div className="actions">
                    <button className="btn ghost" type="button" onClick={() => {
                      setJobStatusError(null);
                      setPollId(null);
                      window.setTimeout(() => setPollId(job.id), 0);
                    }}>
                      Retry status now
                    </button>
                  </div>
                </div>
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
                      {action.id.startsWith("credential-") ? (
                        <strong className="mono">{action.id}</strong>
                      ) : (
                        <Link to={`/run?capability=${encodeURIComponent(action.id)}`}>{action.id}</Link>
                      )}
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
                  onClick={() => {
                    setJob(item);
                    setJobStatusError(null);
                    if (item.status === "running") {
                      setStartedAt(Date.parse(item.created_at) || Date.now());
                      setPollId(item.id);
                    }
                    const copy = new URLSearchParams(params);
                    copy.set("job", item.id);
                    setParams(copy, { replace: true });
                  }}
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
              {job && ["failed", "interrupted"].includes(job.status) && (
                <div className="actions">
                  <button className="btn ghost" type="button" onClick={() => selectCapability(job.capability_id)}>
                    Prepare a reviewed retry
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
