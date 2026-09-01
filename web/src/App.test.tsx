import { screen, waitFor } from "@testing-library/react";
import App from "./App";
import { api } from "./api";
import {
  makeCapability,
  makeDoctor,
  makeEngagement,
  makeGuide,
  makeHealth,
  renderWithRouter,
} from "./test/utils";

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
    engine_commit: "fdb60b90",
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
  it("shows the splash first, then the console once data loads", async () => {
    primeRefresh();
    renderWithRouter(<App />);
    expect(screen.getByText(/starting console/i)).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /active directory assessments/i }),
    ).toBeInTheDocument();
  });

  it("shows a fatal screen when the backend is unreachable and recovers on retry", async () => {
    primeRefresh();
    vi.mocked(api.health).mockReset();
    vi.mocked(api.health).mockRejectedValueOnce(new Error("backend down")).mockResolvedValue(makeHealth());

    const { user } = renderWithRouter(<App />);
    expect(await screen.findByText(/cannot reach the console/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(
      await screen.findByRole("heading", { name: /active directory assessments/i }),
    ).toBeInTheDocument();
  });

  it("auto-seeds the offline demo exactly once when no engagement exists", async () => {
    primeRefresh([]);
    renderWithRouter(<App />);
    await waitFor(() => expect(vi.mocked(api.demoEngagement)).toHaveBeenCalledTimes(1));
  });
});
