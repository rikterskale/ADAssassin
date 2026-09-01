import type {
  CatalogResponse,
  Capability,
  ConnectResponse,
  DoctorResponse,
  Engagement,
  FindingDetailResponse,
  FindingExplainResponse,
  FindingStatus,
  FindingStatusResponse,
  FindingsListResponse,
  GlossaryResponse,
  GuideResponse,
  HealthResponse,
  Job,
  RollbackResponse,
  RunResponse,
  VaultResponse,
  VaultUnmaskResponse,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
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
    body: { capability_id: string; options?: Record<string, unknown>; ack?: boolean },
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
};
