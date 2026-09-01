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

export type Finding = { id: string; title: string; severity: string; source: string; summary: string };

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
  rollback: { pending: number };
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
