import { api } from "./api";

function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
): Response {
  const { ok = true, status = 200, statusText = "OK" } = init;
  return { ok, status, statusText, json: async () => body } as unknown as Response;
}

describe("api client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("issues a GET with a JSON content-type and returns the parsed body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, product: "adassassin" }));
    const result = await api.health();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/health");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(result).toEqual({ ok: true, product: "adassassin" });
  });

  it("POSTs a JSON body for createEngagement", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, engagement: { id: "e1" } }));
    await api.createEngagement({ name: "Acme", domain: "corp.local", dc: "10.0.0.1", notes: "n" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/engagements");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      name: "Acme",
      domain: "corp.local",
      dc: "10.0.0.1",
      notes: "n",
    });
  });

  it("throws the server-provided detail string on an error response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Engagement not found" }, { ok: false, status: 404, statusText: "Not Found" }),
    );
    await expect(api.engagement("missing")).rejects.toThrow("Engagement not found");
  });

  it("falls back to status text when the error body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    await expect(api.doctor()).rejects.toThrow("500 Internal Server Error");
  });

  it("URL-encodes path parameters", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, capability: {} }));
    await api.capability("weird id/with?chars");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/catalog/${encodeURIComponent("weird id/with?chars")}`);
  });

  it("sends the default scope and ttl for a vault unmask", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await api.unmaskVault("e1", "krbtgt");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/engagements/e1/vault/krbtgt/unmask");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ scope: "engagement", ttl_seconds: 30 });
  });

  it("posts a run with its capability id and gating flags", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, job: {} }));
    await api.run("e1", { capability_id: "dcsync", ack: true, force: true, confirm: "dcsync" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/engagements/e1/run");
    expect(JSON.parse(init.body)).toMatchObject({
      capability_id: "dcsync",
      ack: true,
      force: true,
      confirm: "dcsync",
    });
  });

  it("marks a guided step with a step_id body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, engagement: {} }));
    await api.markGuided("e1", "doctor");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/engagements/e1/guided");
    expect(JSON.parse(init.body)).toEqual({ step_id: "doctor" });
  });

  it("sets a finding status with a status body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await api.setFindingStatus("e1", "f1", "fixed");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/engagements/e1/findings/f1/status");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ status: "fixed" });
  });

  it("requests the demo engagement with a POST and no body", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, engagement: { id: "demo" } }));
    await api.demoEngagement();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/engagements/demo");
    expect(init.method).toBe("POST");
  });
});
