export type Lane = "green" | "yellow" | "red";

export type RequiredPrompt = {
  option: string;
  label: string;
  help: string;
  is_param?: string;
  param_key?: string;
};

export type Capability = {
  id: string;
  summary: string;
  plain?: string;
  category: string;
  maturity: string;
  environment: string;
  tools: string[];
  fixture: string | null;
  risk: string;
  approval: string;
  rollback: string;
  auth_modes: string[];
  requires_username_list: boolean;
  active_authentication: boolean;
  noise: string;
  sensitivity: string;
  lane: Lane;
  required_prompts?: RequiredPrompt[];
  runnable?: boolean;
  requires_red_confirm?: boolean;
  risk_label?: string;
  rollback_expectation?: string;
  safety?: { level: string; network: boolean; plain: string };
};

export type CatalogResponse = {
  source: string;
  engine_version: string;
  engine_commit: string;
  count: number;
  capabilities: Capability[];
};

export type EngineStatus = {
  available: boolean;
  version: string | null;
  pin: string;
  commit: string;
  capability_count: number;
  error: string | null;
};

export type HealthResponse = {
  ok: boolean;
  product: string;
  version: string;
  phase?: string;
  engine: EngineStatus;
  engine_pin: string;
  engine_commit: string;
  catalog_count: number;
  catalog_source: string;
  bind: string;
};

export type DoctorCheck = { id: string; ok: boolean; status: "pass" | "warn" | "fail"; detail: string };
export type DoctorResponse = {
  ok: boolean;
  version: string;
  summary: string;
  contacts_directory: boolean;
  checks: DoctorCheck[];
};

export type GuideStep = {
  id: string;
  title: string;
  why: string;
  href: string;
  complete_when: string;
  done: boolean;
};

export type GuideResponse = {
  ok: boolean;
  completed: string[];
  next: GuideStep | null;
  steps: GuideStep[];
  lanes: { green: number; yellow: number; red: number };
  doctor_summary: string;
};

export type GlossaryResponse = { ok: boolean; source: string; items: { term: string; definition: string }[] };

export type FindingStatus = "open" | "accepted" | "fixed" | "retest";

export type FindingEvidence = { artifact: string; pointer?: string; sha256?: string };

export type FindingExplain = {
  id: string;
  title: string;
  severity: string;
  meaning: string;
  why_it_matters: string;
  evidence: unknown[];
  recommended_next_step: string;
  glossary?: Record<string, string>;
  source?: string;
};

export type RemediationChecklist = {
  finding?: FindingExplain;
  steps: { id: string; label: string }[];
  status: string;
  source?: string;
};

export type Finding = {
  id: string;
  title: string;
  severity: string;
  source: string;
  summary: string;
  status?: FindingStatus | string;
  confidence?: string;
  impact?: string;
  remediation?: string;
  evidence?: FindingEvidence[];
  attack_techniques?: string[];
  affected_assets?: string[];
  control_mappings?: string[];
  source_capability?: string;
  explained?: FindingExplain | null;
  remediation_checklist?: RemediationChecklist | null;
  next_actions?: { id: string; message: string }[];
  status_updated_at?: string | null;
};

export type FindingsListResponse = {
  ok: boolean;
  engagement_id: string;
  count: number;
  findings: Finding[];
  grouped: { severity: string; findings: Finding[] }[];
};

export type FindingDetailResponse = { ok: boolean; engagement_id: string; finding: Finding };

export type PreflightCheck = {
  id: string;
  status: string;
  value?: unknown;
  remediation?: string | null;
  scope?: string;
};

export type ConnectState = {
  domain: string;
  dc: string;
  username: string;
  secret_ref: string | null;
  has_secret: boolean;
  preflight_ok: boolean;
  preflight: {
    ok: boolean;
    ready?: boolean;
    blocking_checks: string[];
    advisory_checks: string[];
    next_step?: string;
    checks: PreflightCheck[];
    target_contacted: boolean;
  };
} | null;

export type Job = {
  id: string;
  capability_id: string;
  lane?: string;
  risk?: string;
  status: string;
  created_at: string;
  log: string[];
  findings: Finding[];
  error: string | null;
  next_actions?: { id: string; message: string }[];
  red?: boolean;
};

export type Engagement = {
  id: string;
  name: string;
  domain: string;
  dc: string;
  username?: string;
  notes: string;
  mode: string;
  created_at: string;
  updated_at: string;
  findings: Finding[];
  jobs?: Job[];
  connect?: ConnectState;
  vault: { secrets: number; tickets: number; certificates: number };
  vault_audit?: { id: string; action: string; name: string; scope?: string; ttl_seconds?: number; at: string; expires_at?: string }[];
  rollback: { pending: number };
  rollback_audit?: { id: string; action: string; at: string; sessions?: string[] }[];
  red_ack_audit?: {
    id: string;
    actor: string;
    timestamp: string;
    capability_id: string;
    risk?: string;
    lane?: string;
    force?: boolean;
    ack?: boolean;
    confirm?: string;
    options?: Record<string, unknown>;
    rollback?: string;
  }[];
  target_contacted: boolean;
  guided_marked?: string[];
};

export type ConnectResponse = {
  ok: boolean;
  engagement: Engagement;
  preflight: {
    ok: boolean;
    ready: boolean;
    target_contacted: boolean;
    blocking_checks: string[];
    advisory_checks: string[];
    next_step?: string;
    checks: PreflightCheck[];
  };
};

export type RunResponse = {
  ok: boolean;
  job_id: string;
  status: string;
  findings: Finding[];
  job: Job;
  engagement: Engagement;
};

export type FindingExplainResponse = {
  ok: boolean;
  finding: Finding;
  explain: FindingExplain;
  remediation: RemediationChecklist;
  next_actions: { id: string; message: string }[];
  engagement: Engagement;
};

export type FindingStatusResponse = {
  ok: boolean;
  finding: Finding;
  engagement: Engagement;
};

export type VaultItem = {
  name: string;
  kind: string;
  secret: boolean;
  label: string;
  created?: string | null;
  last_used?: string | null;
  scope: string;
  metadata?: Record<string, unknown>;
};

export type VaultResponse = {
  ok: boolean;
  engagement_id: string;
  counters: { secrets: number; tickets: number; certificates: number };
  items: VaultItem[];
  unmasked_active: { name: string; expires_at: string }[];
};

export type VaultUnmaskResponse = {
  ok: boolean;
  item: { name: string; scope: string; value: unknown; expires_at: string; ttl_seconds: number };
  engagement: Engagement;
};

export type RollbackEntry = {
  session_id: string;
  kind: string;
  target?: string;
  attribute?: string;
  status: string;
  classification?: string;
  registered_at?: string;
  host?: string;
  result?: string;
  has_previous?: boolean;
};

export type RollbackResponse = {
  ok: boolean;
  engagement_id: string;
  pending: number;
  failed: number;
  completed: number;
  entries: RollbackEntry[];
  sessions: {
    session_id: string;
    session_path: string;
    status?: string;
    pending?: number;
    failed?: number;
    next_action?: string;
  }[];
  engagement?: Engagement;
  contacts_directory?: boolean;
  preview?: boolean;
  mutation?: boolean;
  message?: string;
  requires_force?: boolean;
  confirm_token?: string;
};

export type CloseoutCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  informational?: boolean;
};

export type CloseoutResponse = {
  ok: boolean;
  engagement_id: string;
  ready: boolean;
  checks: CloseoutCheck[];
  summary: {
    pending_rollback: number;
    unmasked_vault: number;
    live_sessions: number;
    open_findings: number;
    capabilities_run: number;
  };
  contacts_directory?: boolean;
};

export type ReportResponse = {
  ok: boolean;
  engagement_id: string;
  generated_at: string;
  markdown: string;
  html: string;
  downloads: { markdown: string; html: string };
  paths: { markdown: string; html: string };
  closeout: CloseoutResponse;
  engine_artifacts?: { session_id: string; finding_count?: number; paths?: string[]; error?: string }[];
  engagement?: Engagement;
  contacts_directory?: boolean;
};
