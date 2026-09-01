import { screen, waitFor } from "@testing-library/react";
import { Findings } from "./Findings";
import { api } from "../api";
import { makeEngagement, makeFinding, renderWithRouter } from "../test/utils";

vi.mock("../api", () => ({
  api: {
    findings: vi.fn(),
    finding: vi.fn(),
    explainFinding: vi.fn(),
    setFindingStatus: vi.fn(),
  },
}));

const finding = makeFinding({
  id: "demo-esc1",
  title: "Certificate template publishes an ESC1 signal",
  severity: "high",
  summary: "A misconfigured template can allow requester-specified SANs.",
});

function primeList() {
  vi.mocked(api.findings).mockResolvedValue({
    ok: true,
    engagement_id: "eng-001",
    count: 1,
    findings: [finding],
    grouped: [{ severity: "high", findings: [finding] }],
  });
  vi.mocked(api.finding).mockResolvedValue({ ok: true, engagement_id: "eng-001", finding });
}

describe("Findings", () => {
  it("prompts to seed a demo when there is no engagement", () => {
    renderWithRouter(<Findings engagement={null} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />);
    expect(screen.getByRole("button", { name: /seed the offline demo/i })).toBeInTheDocument();
  });

  it("lists grouped findings and shows the default-selected detail", async () => {
    primeList();
    renderWithRouter(<Findings engagement={makeEngagement()} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />);
    // Severity group heading.
    expect(await screen.findByRole("heading", { name: "high" })).toBeInTheDocument();
    // Detail pane content unique to the selected finding.
    expect(await screen.findByText(/misconfigured template can allow requester-specified sans/i)).toBeInTheDocument();
  });

  it("explains and remediates a finding", async () => {
    primeList();
    const engagement = makeEngagement();
    vi.mocked(api.explainFinding).mockResolvedValue({
      ok: true,
      finding: {
        ...finding,
        explained: {
          id: finding.id,
          title: finding.title,
          severity: "high",
          meaning: "The template lets a requester name any subject.",
          why_it_matters: "That enables impersonation of privileged accounts.",
          evidence: [],
          recommended_next_step: "Disable enrollee-supplied subject.",
        },
      },
      explain: {
        id: finding.id,
        title: finding.title,
        severity: "high",
        meaning: "The template lets a requester name any subject.",
        why_it_matters: "That enables impersonation of privileged accounts.",
        evidence: [],
        recommended_next_step: "Disable enrollee-supplied subject.",
      },
      remediation: { steps: [], status: "open" },
      next_actions: [],
      engagement,
    });

    const { user } = renderWithRouter(
      <Findings engagement={engagement} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />,
    );
    await user.click(await screen.findByRole("button", { name: /explain \+ remediate/i }));
    expect(await screen.findByText(/the template lets a requester name any subject/i)).toBeInTheDocument();
    expect(vi.mocked(api.explainFinding)).toHaveBeenCalledWith("eng-001", "demo-esc1");
  });

  it("updates a finding status", async () => {
    primeList();
    const engagement = makeEngagement();
    vi.mocked(api.setFindingStatus).mockResolvedValue({
      ok: true,
      finding: { ...finding, status: "fixed" },
      engagement,
    });
    const { user } = renderWithRouter(
      <Findings engagement={engagement} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />,
    );
    await user.click(await screen.findByRole("button", { name: /^fixed$/i }));
    await waitFor(() =>
      expect(vi.mocked(api.setFindingStatus)).toHaveBeenCalledWith("eng-001", "demo-esc1", "fixed"),
    );
  });
});
