import { act, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { api } from "./api";
import {
  makeCapability,
  makeDoctor,
  makeEngagement,
  makeGuide,
  makeGuideStep,
  makeHealth,
  renderWithRouter,
} from "./test/utils";
import type { GuideResponse } from "./types";

vi.mock("./api", () => ({
  api: {
    health: vi.fn(),
    doctor: vi.fn(),
    guide: vi.fn(),
    glossary: vi.fn(),
    catalog: vi.fn(),
    capability: vi.fn(),
    engagements: vi.fn(),
    engagement: vi.fn(),
    createEngagement: vi.fn(),
    demoEngagement: vi.fn(),
    markGuided: vi.fn(),
    connect: vi.fn(),
    run: vi.fn(),
    job: vi.fn(),
    findings: vi.fn(),
    finding: vi.fn(),
    explainFinding: vi.fn(),
    setFindingStatus: vi.fn(),
    vault: vi.fn(),
    unmaskVault: vi.fn(),
    rollback: vi.fn(),
    previewRollback: vi.fn(),
    applyRollback: vi.fn(),
    closeout: vi.fn(),
    report: vi.fn(),
  },
}));

function catalogResponse() {
  return {
    source: "engine",
    engine_version: "0.10.1",
    engine_commit: "df92b617",
    count: 1,
    capabilities: [makeCapability()],
  };
}

function primeRefresh(engagements = [makeEngagement()]) {
  vi.mocked(api.health).mockResolvedValue(makeHealth());
  vi.mocked(api.doctor).mockResolvedValue(makeDoctor());
  vi.mocked(api.guide).mockResolvedValue(makeGuide());
  vi.mocked(api.catalog).mockResolvedValue(catalogResponse());
  vi.mocked(api.engagements).mockResolvedValue({ ok: true, engagements });
  vi.mocked(api.demoEngagement).mockResolvedValue({ ok: true, engagement: makeEngagement() });
}

describe("App bootstrap", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
  });

  it("shows the splash first, then redirects a first-time operator to Start Here", async () => {
    primeRefresh();
    renderWithRouter(<App />);
    expect(screen.getByText(/starting console/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /from first click to defensible closeout/i }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(window.localStorage.getItem("adassassin.onboardingSeen")).toBe("1"),
    );
  });

  it("shows a fatal screen when the backend is unreachable and recovers on retry", async () => {
    primeRefresh();
    vi.mocked(api.health).mockReset();
    vi.mocked(api.health).mockRejectedValueOnce(new Error("backend down")).mockResolvedValue(makeHealth());

    const { user } = renderWithRouter(<App />);
    expect(await screen.findByText(/cannot reach the console/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(
      await screen.findByRole("heading", { name: /from first click to defensible closeout/i }),
    ).toBeInTheDocument();
  });

  it("auto-seeds the offline demo exactly once when no engagement exists", async () => {
    primeRefresh([]);
    renderWithRouter(<App />);
    await waitFor(() => expect(vi.mocked(api.demoEngagement)).toHaveBeenCalledTimes(1));
  });

  it("restores the stored current engagement", async () => {
    window.localStorage.setItem("adassassin.currentEngagement", "eng-002");
    const first = makeEngagement({ id: "eng-001", name: "First" });
    const second = makeEngagement({ id: "eng-002", name: "Second" });
    primeRefresh([first, second]);
    renderWithRouter(<App />);
    expect(await screen.findByRole("combobox", { name: "Current engagement" })).toHaveValue("eng-002");
  });

  it("keeps the console visible and offers retry after a later refresh fails", async () => {
    window.localStorage.setItem("adassassin.onboardingSeen", "1");
    primeRefresh();
    vi.mocked(api.demoEngagement).mockResolvedValue({ ok: true, engagement: makeEngagement() });
    const { user } = renderWithRouter(<App />);
    expect(await screen.findByRole("heading", { name: /active directory assessments/i })).toBeInTheDocument();

    vi.mocked(api.health).mockRejectedValueOnce(new TypeError("Backend stopped"));
    await user.click(await screen.findByRole("button", { name: /refresh console data/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/data may be stale/i);
    expect(screen.getByRole("heading", { name: /active directory assessments/i })).toBeInTheDocument();
  });

  it("records a page-visit milestone once without entering a refresh loop", async () => {
    primeRefresh();
    vi.mocked(api.markGuided).mockResolvedValue({ ok: true, engagement: makeEngagement() });
    renderWithRouter(<App />, { route: "/catalog?lane=green" });
    await waitFor(() => expect(vi.mocked(api.markGuided)).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    expect(vi.mocked(api.markGuided)).toHaveBeenCalledTimes(1);
  });

  it("recovers from an initial guide failure through the fatal-screen retry", async () => {
    primeRefresh();
    vi.mocked(api.guide).mockRejectedValueOnce(new Error("Guide unavailable"));
    const { user } = renderWithRouter(<App />, { route: "/guided" });
    expect(await screen.findByText(/cannot reach the console/i)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuemax", "2");
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function engagementGuide(id: string, title: string) {
  const next = makeGuideStep({ id: "demo", title, href: "/guided" });
  return makeGuide({ engagement_id: id, next, steps: [next] });
}

describe("Guide selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem("adassassin.onboardingSeen", "1");
    primeRefresh([
      makeEngagement({ id: "a", name: "Workspace A" }),
      makeEngagement({ id: "b", name: "Workspace B" }),
    ]);
    vi.mocked(api.guide).mockImplementation(async (id) => engagementGuide(id!, `Review ${id}`));
  });

  it.each(["success", "failure"])("ignores a superseded selection %s, even after returning to the same engagement", async (outcome) => {
    const { user } = renderWithRouter(<App />, { route: "/guided" });
    await screen.findByRole("link", { name: "Continue: Review a" });
    const oldB = deferred<GuideResponse>();
    vi.mocked(api.guide).mockReturnValueOnce(oldB.promise);
    const selector = screen.getByRole("combobox", { name: "Current engagement" });
    await user.selectOptions(selector, "b");
    expect(screen.getByRole("status")).toHaveTextContent(/loading guided progress/i);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /continue:/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /01 review a/i })).not.toBeInTheDocument();

    await user.selectOptions(selector, "a");
    await screen.findByRole("link", { name: "Continue: Review a" });
    await user.selectOptions(selector, "b");
    await screen.findByRole("link", { name: "Continue: Review b" });
    await act(async () => {
      if (outcome === "success") oldB.resolve(engagementGuide("b", "Obsolete result"));
      else oldB.reject(new Error("Obsolete failure"));
    });
    expect(screen.getByRole("link", { name: "Continue: Review b" })).toBeInTheDocument();
    expect(screen.queryByText(/obsolete/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["success", "failure"])("ignores a refresh guide %s after the engagement changes", async (outcome) => {
    const { user } = renderWithRouter(<App />, { route: "/guided" });
    await screen.findByRole("link", { name: "Continue: Review a" });
    const oldRefresh = deferred<GuideResponse>();
    vi.mocked(api.guide).mockReturnValueOnce(oldRefresh.promise);
    const callsBefore = vi.mocked(api.guide).mock.calls.length;
    await user.click(screen.getByRole("button", { name: /refresh console data/i }));
    await waitFor(() => expect(api.guide).toHaveBeenCalledTimes(callsBefore + 1));
    await user.selectOptions(screen.getByRole("combobox", { name: "Current engagement" }), "b");
    await screen.findByRole("link", { name: "Continue: Review b" });
    await act(async () => {
      if (outcome === "success") oldRefresh.resolve(engagementGuide("a", "Obsolete refresh"));
      else oldRefresh.reject(new Error("Obsolete refresh failure"));
    });
    expect(screen.getByRole("combobox", { name: "Current engagement" })).toHaveValue("b");
    expect(screen.getByRole("link", { name: "Continue: Review b" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows unavailable progress after a selection fails and retries with the keyboard", async () => {
    const { user } = renderWithRouter(<App />, { route: "/guided" });
    await screen.findByRole("link", { name: "Continue: Review a" });
    vi.mocked(api.guide).mockRejectedValueOnce(new Error("Guide temporarily unavailable"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Current engagement" }), "b");
    expect(await screen.findByRole("alert")).toHaveTextContent("Guide temporarily unavailable");
    expect(screen.getByRole("status")).toHaveTextContent(/guided progress is unavailable/i);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /continue:/i })).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Retry guided progress" });
    retry.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("link", { name: "Continue: Review b" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hides the previous engagement's next step on Overview while loading", async () => {
    const { user } = renderWithRouter(<App />);
    await screen.findByRole("link", { name: /review a/i });
    const pending = deferred<GuideResponse>();
    vi.mocked(api.guide).mockReturnValueOnce(pending.promise);
    await user.selectOptions(screen.getByRole("combobox", { name: "Current engagement" }), "b");
    expect(screen.queryByRole("link", { name: /review a/i })).not.toBeInTheDocument();
    await act(async () => pending.resolve(engagementGuide("b", "Review b")));
    expect(screen.getByRole("link", { name: /review b/i })).toBeInTheDocument();
  });

  it("rejects a guide that explicitly names another engagement", async () => {
    const { user } = renderWithRouter(<App />, { route: "/guided" });
    await screen.findByRole("link", { name: "Continue: Review a" });
    vi.mocked(api.guide).mockResolvedValueOnce(engagementGuide("a", "Wrong workspace"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Current engagement" }), "b");
    expect(await screen.findByRole("alert")).toHaveTextContent(/does not match the selected workspace/i);
    expect(screen.queryByRole("link", { name: /continue:/i })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/unavailable/i);
  });
});
