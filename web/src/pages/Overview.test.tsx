import { screen } from "@testing-library/react";
import { Overview } from "./Overview";
import { makeDoctor, makeEngagement, makeGuide, makeHealth, renderWithRouter } from "../test/utils";

describe("Overview", () => {
  it("renders the welcome hero", () => {
    renderWithRouter(
      <Overview
        health={makeHealth()}
        doctor={makeDoctor()}
        guide={makeGuide()}
        engagement={null}
        onSeedDemo={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: /active directory assessments, one guided step at a time/i }),
    ).toBeInTheDocument();
  });

  it("seeds the demo when 'Explore the offline demo' is clicked", async () => {
    const onSeedDemo = vi.fn().mockResolvedValue(undefined);
    const { user } = renderWithRouter(
      <Overview
        health={makeHealth()}
        doctor={makeDoctor()}
        guide={makeGuide()}
        engagement={null}
        onSeedDemo={onSeedDemo}
      />,
    );
    await user.click(screen.getByRole("button", { name: /explore the offline demo/i }));
    expect(onSeedDemo).toHaveBeenCalledTimes(1);
  });

  it("surfaces console health: capability count, lane split, and doctor summary", () => {
    renderWithRouter(
      <Overview
        health={makeHealth({ catalog_count: 92 })}
        doctor={makeDoctor({ summary: "ready" })}
        guide={makeGuide({ lanes: { green: 9, yellow: 37, red: 46 } })}
        engagement={null}
        onSeedDemo={vi.fn()}
      />,
    );
    expect(screen.getByText("92")).toBeInTheDocument();
    expect(screen.getByText("9 / 37 / 46")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
  });

  it("links to the next guided step when one is pending", () => {
    const guide = makeGuide({
      next: { id: "demo", title: "Seed the offline demo", why: "", href: "/guided", complete_when: "", done: false },
    });
    renderWithRouter(
      <Overview health={makeHealth()} doctor={makeDoctor()} guide={guide} engagement={null} onSeedDemo={vi.fn()} />,
    );
    const next = screen.getByRole("link", { name: /next: seed the offline demo/i });
    expect(next).toHaveAttribute("href", "/guided");
  });

  it("shows the finding count for the current engagement", () => {
    const engagement = makeEngagement({ name: "Acme internal", findings: [] });
    renderWithRouter(
      <Overview health={makeHealth()} doctor={makeDoctor()} guide={makeGuide()} engagement={engagement} onSeedDemo={vi.fn()} />,
    );
    expect(screen.getByText(/findings in acme internal/i)).toBeInTheDocument();
  });

  it("indicates when there is no engagement yet", () => {
    renderWithRouter(
      <Overview health={makeHealth()} doctor={makeDoctor()} guide={makeGuide()} engagement={null} onSeedDemo={vi.fn()} />,
    );
    expect(screen.getByText(/no engagement yet/i)).toBeInTheDocument();
  });
});
