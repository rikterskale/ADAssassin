export type Lane = "green" | "yellow" | "red";

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
};

export type CatalogResponse = {
  source: "engine" | "bundled";
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
  engine: EngineStatus;
  engine_pin: string;
  engine_commit: string;
  catalog_count: number;
  catalog_source: string;
  bind: string;
};

export type Finding = {
  id: string;
  title: string;
  severity: string;
  source: string;
  summary: string;
};

export type Engagement = {
  id: string;
  name: string;
  domain: string;
  dc: string;
  notes: string;
  mode: string;
  created_at: string;
  updated_at: string;
  findings: Finding[];
  vault: { secrets: number; tickets: number; certificates: number };
  rollback: { pending: number };
  target_contacted: boolean;
};
