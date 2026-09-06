import type {
  CatalogResponse,
  Capability,
  ConnectResponse,
  DoctorResponse,
  Engagement,
  FindingDetailResponse,
  FindingExplainResponse,
  FindingStatus,
  CloseoutResponse,
  FindingStatusResponse,
  FindingsListResponse,
  GlossaryResponse,
  GuideResponse,
  HealthResponse,
  Job,
  ReportResponse,
  RollbackResponse,
  RunResponse,
  VaultResponse,
  VaultUnmaskResponse,
} from "./types";

const REQUEST_TIMEOUT_MS = 45_000;

type ValidationIssue = { loc?: unknown[]; msg?: unknown };

function humanizeErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (!Array.isArray(detail)) return null;
  const messages = detail.flatMap((issue: ValidationIssue) => {
    if (!issue || typeof issue.msg !== "string") return [];
    const parts = Array.isArray(issue.loc) ? issue.loc.slice(1).map(String) : [];
    const field = parts.join(" → ").replace(/_/g, " ");
    const message = issue.msg.replace(/^Value error,\s*/i, "");
    return [field ? `${field}: ${message}` : message];
  });
  return messages.length ? messages.slice(0, 3).join(" · ") : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The local console took too long to respond. Check the server terminal, then retry.");
    }
    if (error instanceof TypeError) {
      throw new Error("Cannot reach the local ADAssassin API. Confirm the server is still running, then retry.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      detail = humanizeErrorDetail(body.detail) ?? detail;
    } catch {
      /* keep status text */
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  doctor: () => request<DoctorResponse>("/api/doctor"),
  guide: () => request<GuideResponse>("/api/guide"),
  glossary: () => request<GlossaryResponse>("/api/glossary"),
  catalog: () => request<CatalogResponse>("/api/catalog"),
  capability: (id: string) =>
    request<{ ok: boolean; capability: Capability }>(`/api/catalog/${encodeURIComponent(id)}`),
  engagements: () => request<{ ok: boolean; engagements: Engagement[] }>("/api/engagements"),
  engagement: (id: string) =>
    request<{ ok: boolean; engagement: Engagement }>(`/api/engagements/${encodeURIComponent(id)}`),
  createEngagement: (body: { name: string; domain?: string; dc?: string; notes?: string }) =>
    request<{ ok: boolean; engagement: Engagement }>("/api/engagements", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  demoEngagement: () =>
    request<{ ok: boolean; engagement: Engagement }>("/api/engagements/demo", { method: "POST" }),
  markGuided: (engagementId: string, stepId: string) =>
    request<{ ok: boolean; engagement: Engagement }>(`/api/engagements/${engagementId}/guided`, {
      method: "POST",
      body: JSON.stringify({ step_id: stepId }),
    }),
  connect: (
    engagementId: string,
    body: { domain: string; dc: string; username?: string; password?: string; hashes?: string },
  ) =>
    request<ConnectResponse>(`/api/engagements/${engagementId}/connect`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  run: (
    engagementId: string,
    body: {
      capability_id: string;
      options?: Record<string, unknown>;
      ack?: boolean;
      force?: boolean;
      confirm?: string;
      actor?: string;
      approval_token?: string;
      approval_engagement_id?: string;
    },
  ) =>
    request<RunResponse>(`/api/engagements/${engagementId}/run`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  job: (engagementId: string, jobId: string) =>
    request<{ ok: boolean; job: Job }>(`/api/engagements/${engagementId}/jobs/${jobId}`),
  findings: (engagementId: string) =>
    request<FindingsListResponse>(`/api/engagements/${engagementId}/findings`),
  finding: (engagementId: string, findingId: string) =>
    request<FindingDetailResponse>(
      `/api/engagements/${engagementId}/findings/${encodeURIComponent(findingId)}`,
    ),
  explainFinding: (engagementId: string, findingId: string) =>
    request<FindingExplainResponse>(
      `/api/engagements/${engagementId}/findings/${encodeURIComponent(findingId)}/explain`,
      { method: "POST" },
    ),
  setFindingStatus: (engagementId: string, findingId: string, status: FindingStatus) =>
    request<FindingStatusResponse>(
      `/api/engagements/${engagementId}/findings/${encodeURIComponent(findingId)}/status`,
      { method: "POST", body: JSON.stringify({ status }) },
    ),
  vault: (engagementId: string) =>
    request<VaultResponse>(`/api/engagements/${engagementId}/vault`),
  unmaskVault: (engagementId: string, name: string, body?: { scope?: string; ttl_seconds?: number }) =>
    request<VaultUnmaskResponse>(
      `/api/engagements/${engagementId}/vault/${encodeURIComponent(name)}/unmask`,
      { method: "POST", body: JSON.stringify(body ?? { scope: "engagement", ttl_seconds: 30 }) },
    ),
  rollback: (engagementId: string) =>
    request<RollbackResponse>(`/api/engagements/${engagementId}/rollback`),
  previewRollback: (engagementId: string) =>
    request<RollbackResponse>(`/api/engagements/${engagementId}/rollback/preview`, { method: "POST" }),
  applyRollback: (
    engagementId: string,
    body: { force: boolean; ack: boolean; confirm: string; session_id?: string },
  ) =>
    request<RollbackResponse & { applied?: boolean; results?: unknown[] }>(
      `/api/engagements/${engagementId}/rollback/apply`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  closeout: (engagementId: string) =>
    request<CloseoutResponse>(`/api/engagements/${engagementId}/closeout`),
  report: (engagementId: string) =>
    request<ReportResponse>(`/api/engagements/${engagementId}/report`),
};
