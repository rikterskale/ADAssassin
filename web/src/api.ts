import type {
  CatalogResponse,
  DoctorResponse,
  Engagement,
  GlossaryResponse,
  GuideResponse,
  HealthResponse,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  doctor: () => request<DoctorResponse>("/api/doctor"),
  guide: () => request<GuideResponse>("/api/guide"),
  glossary: () => request<GlossaryResponse>("/api/glossary"),
  catalog: () => request<CatalogResponse>("/api/catalog"),
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
};
