import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import type {
  Capability,
  CloseoutResponse,
  DoctorResponse,
  Engagement,
  Finding,
  GuideResponse,
  GuideStep,
  HealthResponse,
  RollbackResponse,
  VaultItem,
  VaultResponse,
} from "../types";

/** Render a component inside a MemoryRouter and return a userEvent instance. */
export function renderWithRouter(
  ui: ReactElement,
  { route = "/", ...options }: { route?: string } & RenderOptions = {},
) {
  const user = userEvent.setup();
  const result = render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>, options);
  return { user, ...result };
}

// ---------------------------------------------------------------------------
// Fixture factories. Each returns a minimal-but-valid object; pass overrides to
// tailor a case without restating every field.
// ---------------------------------------------------------------------------

export function makeCapability(overrides: Partial<Capability> = {}): Capability {
  return {
    id: "ldap-signing-check",
    summary: "Check LDAP signing policy",
    plain: "Reads whether the DC enforces LDAP signing.",
    category: "recon",
    maturity: "stable",
    environment: "live",
    tools: ["ldap3"],
    fixture: null,
    risk: "observe",
    approval: "none",
    rollback: "none",
    auth_modes: ["password"],
    requires_username_list: false,
    active_authentication: false,
    noise: "low",
    sensitivity: "low",
    lane: "yellow",
    required_prompts: [],
    runnable: true,
    requires_red_confirm: false,
    risk_label: "observe",
    rollback_expectation: "none",
    ...overrides,
  };
}

export function makeRedCapability(overrides: Partial<Capability> = {}): Capability {
  return makeCapability({
    id: "dcsync",
    summary: "Replicate secrets from the DC",
    plain: "Pulls password material via replication. Destructive-class, approval required.",
    category: "credential-access",
    environment: "live",
    risk: "destructive",
    lane: "red",
    approval: "explicit",
    rollback: "not-applicable",
    runnable: true,
    requires_red_confirm: true,
    risk_label: "destructive",
    rollback_expectation: "not-applicable",
    ...overrides,
  });
}

export function makeHealth(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    ok: true,
    product: "adassassin",
    version: "0.7.0",
    phase: "6",
    engine: {
      available: true,
      version: "0.10.1",
      pin: "0.10.1",
      commit: "fdb60b90",
      capability_count: 92,
      error: null,
    },
    engine_pin: "0.10.1",
    engine_commit: "fdb60b90",
    catalog_count: 92,
    catalog_source: "engine",
    bind: "127.0.0.1:8745",
    ...overrides,
  };
}

export function makeDoctor(overrides: Partial<DoctorResponse> = {}): DoctorResponse {
  return {
    ok: true,
    version: "0.7.0",
    summary: "ready",
    contacts_directory: false,
    checks: [
      { id: "python", ok: true, status: "pass", detail: "Python 3.12" },
      { id: "engine", ok: true, status: "pass", detail: "adaf-attack 0.10.1 imported" },
    ],
    ...overrides,
  };
}

export function makeGuideStep(overrides: Partial<GuideStep> = {}): GuideStep {
  return {
    id: "doctor",
    title: "Check the console",
    why: "Confirms Python, catalog, and local storage.",
    href: "/",
    complete_when: "doctor_ok",
    done: false,
    ...overrides,
  };
}

export function makeGuide(overrides: Partial<GuideResponse> = {}): GuideResponse {
  return {
    ok: true,
    completed: ["doctor"],
    next: makeGuideStep({ id: "demo", title: "Seed the offline demo", href: "/guided" }),
    steps: [
      makeGuideStep({ id: "doctor", done: true }),
      makeGuideStep({ id: "demo", title: "Seed the offline demo", href: "/guided", done: false }),
    ],
    lanes: { green: 9, yellow: 37, red: 46 },
    doctor_summary: "ready",
    ...overrides,
  };
}

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "demo-esc1",
    title: "Certificate template publishes an ESC1 signal",
    severity: "high",
    source: "demo",
    summary: "A misconfigured template can allow requester-specified SANs.",
    status: "open",
    impact: "Privilege escalation to any principal.",
    remediation: "Disable enrollee-supplied subject.",
    evidence: [{ artifact: "demo-esc1.json", pointer: "/templates/User", sha256: "abcdef1234567890" }],
    attack_techniques: ["ESC1"],
    affected_assets: ["CA01"],
    source_capability: "adcs-esc-scan",
    ...overrides,
  };
}

export function makeEngagement(overrides: Partial<Engagement> = {}): Engagement {
  return {
    id: "eng-001",
    name: "Acme internal",
    domain: "corp.local",
    dc: "10.0.0.1",
    username: "operator",
    notes: "Scope: DA path only.",
    mode: "demo",
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:05:00Z",
    findings: [makeFinding()],
    jobs: [],
    connect: null,
    vault: { secrets: 1, tickets: 0, certificates: 0 },
    rollback: { pending: 1 },
    target_contacted: false,
    guided_marked: [],
    ...overrides,
  };
}

export function makeVaultItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    name: "krbtgt-hash",
    kind: "secret",
    secret: true,
    label: "KRBTGT NT hash",
    created: "2026-09-01T10:00:00Z",
    last_used: null,
    scope: "engagement",
    metadata: {},
    ...overrides,
  };
}

export function makeVaultResponse(overrides: Partial<VaultResponse> = {}): VaultResponse {
  return {
    ok: true,
    engagement_id: "eng-001",
    counters: { secrets: 1, tickets: 0, certificates: 0 },
    items: [makeVaultItem()],
    unmasked_active: [],
    ...overrides,
  };
}

export function makeRollbackResponse(overrides: Partial<RollbackResponse> = {}): RollbackResponse {
  return {
    ok: true,
    engagement_id: "eng-001",
    pending: 1,
    failed: 0,
    completed: 0,
    entries: [
      {
        session_id: "sess-1",
        kind: "attribute-write",
        target: "CN=svc,DC=corp,DC=local",
        status: "pending",
        classification: "reversible",
        has_previous: true,
      },
    ],
    sessions: [],
    ...overrides,
  };
}

export function makeCloseout(overrides: Partial<CloseoutResponse> = {}): CloseoutResponse {
  return {
    ok: true,
    engagement_id: "eng-001",
    ready: false,
    checks: [
      { id: "authorization-banner", label: "Authorization banner included", ok: true, detail: "Embedded." },
      { id: "open-findings", label: "Open findings reviewed", ok: false, detail: "Open or retest findings: 1" },
    ],
    summary: {
      pending_rollback: 1,
      unmasked_vault: 0,
      live_sessions: 0,
      open_findings: 1,
      capabilities_run: 2,
    },
    contacts_directory: false,
    ...overrides,
  };
}
