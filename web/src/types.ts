export type Lane = "green" | "yellow" | "red";
export type Capability = {
  id: string; summary: string; plain?: string; category: string; maturity: string;
  environment: string; tools: string[]; fixture: string | null; risk: string;
  approval: string; rollback: string; auth_modes: string[];
  requires_username_list: boolean; active_authentication: boolean;
  noise: string; sensitivity: string; lane: Lane;
};
export type CatalogResponse = { source: string; engine_version: string; engine_commit: string; count: number; capabilities: Capability[] };
export type EngineStatus = { available: boolean; version: string | null; pin: string; commit: string; capability_count: number; error: string | null };
export type HealthResponse = { ok: boolean; product: string; version: string; phase?: string; engine: EngineStatus; engine_pin: string; engine_commit: string; catalog_count: number; catalog_source: string; bind: string };
export type DoctorCheck = { id: string; ok: boolean; status: "pass" | "warn" | "fail"; detail: string };
export type DoctorResponse = { ok: boolean; version: string; summary: string; contacts_directory: boolean; checks: DoctorCheck[] };
export type GuideStep = { id: string; title: string; why: string; href: string; complete_when: string; done: boolean };
export type GuideResponse = { ok: boolean; completed: string[]; next: GuideStep | null; steps: GuideStep[]; lanes: { green: number; yellow: number; red: number }; doctor_summary: string };
export type GlossaryResponse = { ok: boolean; source: string; items: { term: string; definition: string }[] };
export type Finding = { id: string; title: string; severity: string; source: string; summary: string };
export type Engagement = {
  id: string; name: string; domain: string; dc: string; notes: string; mode: string;
  created_at: string; updated_at: string; findings: Finding[];
  vault: { secrets: number; tickets: number; certificates: number };
  rollback: { pending: number }; target_contacted: boolean; guided_marked?: string[];
};
