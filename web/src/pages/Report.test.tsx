import { screen } from "@testing-library/react";
import { Report } from "./Report";
import { api } from "../api";
import { makeCloseout, makeEngagement, renderWithRouter } from "../test/utils";

vi.mock("../api", () => ({ api: { closeout: vi.fn(), report: vi.fn() } }));

describe("Report", () => {
  it("prompts to seed a demo when there is no engagement", () => {
    renderWithRouter(<Report engagement={null} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />);
    expect(screen.getByRole("button", { name: /seed the offline demo/i })).toBeInTheDocument();
  });

  it("loads the closeout checklist on mount", async () => {
    vi.mocked(api.closeout).mockResolvedValue(makeCloseout());
    renderWithRouter(<Report engagement={makeEngagement()} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />);
    expect(await screen.findByText(/open findings reviewed/i)).toBeInTheDocument();
    expect(screen.getByText(/items remain/i)).toBeInTheDocument();
  });

  it("generates a report and previews the markdown", async () => {
    vi.mocked(api.closeout).mockResolvedValue(makeCloseout());
    vi.mocked(api.report).mockResolvedValue({
      ok: true,
      engagement_id: "eng-001",
      generated_at: "2026-09-01T10:10:00Z",
      markdown: "# ADAssassin Engagement Report\n\nAuthorized internal red-team use only.",
      html: "<h1>ADAssassin Engagement Report</h1>",
      downloads: { markdown: "/api/engagements/eng-001/report.md", html: "/api/engagements/eng-001/report.html" },
      paths: { markdown: "report.md", html: "report.html" },
      closeout: makeCloseout(),
    });
    const { user } = renderWithRouter(
      <Report engagement={makeEngagement()} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /generate report/i }));
    expect(await screen.findByText(/adassassin engagement report/i)).toBeInTheDocument();
    expect(vi.mocked(api.report)).toHaveBeenCalledWith("eng-001");
  });

  it("exposes markdown and HTML download links", async () => {
    vi.mocked(api.closeout).mockResolvedValue(makeCloseout());
    renderWithRouter(<Report engagement={makeEngagement()} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />);
    // Let the on-mount closeout fetch settle before asserting.
    await screen.findByText(/items remain/i);
    expect(screen.getByRole("link", { name: /download markdown/i })).toHaveAttribute(
      "href",
      "/api/engagements/eng-001/report.md",
    );
    expect(screen.getByRole("link", { name: /download html/i })).toHaveAttribute(
      "href",
      "/api/engagements/eng-001/report.html",
    );
  });
});
