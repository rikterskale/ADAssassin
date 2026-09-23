import { screen } from "@testing-library/react";
import { Guided } from "./Guided";
import { makeEngagement, makeGuide, makeGuideStep, renderWithRouter } from "../test/utils";
import type { GuideResponse } from "../types";

const guide = makeGuide({
  steps: [
    makeGuideStep({ id: "doctor", title: "Check the console", href: "/", done: true }),
    makeGuideStep({ id: "demo", title: "Seed the offline demo", href: "/guided", done: false }),
  ],
});

describe("Guided", () => {
  it("hides previous progress and cards while loading", () => {
    renderWithRouter(<Guided guide={guide} loading engagement={null} onDemo={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading guided progress/i);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /continue:/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /01 check/i })).not.toBeInTheDocument();
  });

  it.each<{ label: string; value: GuideResponse | null }>([
    { label: "missing", value: null },
    { label: "empty", value: makeGuide({ steps: [], next: null, core_complete: true }) },
    { label: "unsuccessful", value: makeGuide({ ok: false }) },
    { label: "optional only", value: makeGuide({ steps: [makeGuideStep({ optional: true })], next: null }) },
    { label: "skipped only", value: makeGuide({ steps: [makeGuideStep({ applicable: false })], next: null }) },
  ])("does not claim completion or render a zero-range progressbar for $label data", ({ value }) => {
    renderWithRouter(<Guided guide={value} engagement={null} onDemo={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/guided progress is unavailable/i);
    expect(screen.queryByText(/core journey complete/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /continue:/i })).not.toBeInTheDocument();
  });

  it.each([
    { done: false, core_complete: undefined },
    { done: false, core_complete: true },
    { done: true, core_complete: false },
  ])("does not infer completion from a missing next step (%j)", (state) => {
    const incomplete = makeGuide({
      next: null, core_complete: state.core_complete,
      steps: [makeGuideStep({ done: state.done })],
    });
    renderWithRouter(<Guided guide={incomplete} engagement={null} onDemo={vi.fn()} />);
    expect(screen.queryByText(/core journey complete/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/progress needs a refresh/i);
  });

  it("derives completion for older responses while excluding skipped and optional work", () => {
    const complete = makeGuide({ next: null, steps: [
      makeGuideStep({ done: true }),
      makeGuideStep({ id: "connect", applicable: false, skipped_reason: "Offline workspace" }),
      makeGuideStep({ id: "red", optional: true }),
    ] });
    renderWithRouter(<Guided guide={complete} engagement={null} onDemo={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent(/1 of 1 core steps complete.*core journey complete/i);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "1");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText(/offline workspace/i)).toBeInTheDocument();
  });

  it("renders numbered steps", () => {
    renderWithRouter(
      <Guided guide={guide} engagement={null} onDemo={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: /01 check the console/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /02 seed the offline demo/i })).toBeInTheDocument();
  });

  it("distinguishes completed steps from real workflow outcomes", () => {
    renderWithRouter(
      <Guided guide={guide} engagement={null} onDemo={vi.fn()} />,
    );
    expect(screen.getByText("done")).toBeInTheDocument();
    expect(screen.getByText(/complete in workflow/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark seen/i })).not.toBeInTheDocument();
  });

  it("seeds the demo from the hero action", async () => {
    const onDemo = vi.fn();
    const { user } = renderWithRouter(
      <Guided guide={guide} engagement={null} onDemo={onDemo} />,
    );
    await user.click(screen.getByRole("button", { name: /seed offline demo/i }));
    expect(onDemo).toHaveBeenCalledTimes(1);
  });

  it("prompts to seed when there is no current engagement", () => {
    renderWithRouter(
      <Guided guide={guide} engagement={null} onDemo={vi.fn()} />,
    );
    expect(screen.getByText(/seed the demo to populate findings without a dc/i)).toBeInTheDocument();
  });

  it("summarizes the current engagement focus", () => {
    const engagement = makeEngagement({ name: "Acme internal", mode: "demo", findings: [] });
    renderWithRouter(
      <Guided guide={guide} engagement={engagement} onDemo={vi.fn()} />,
    );
    // The focus line reads "<name> · <mode> · <n> findings"; match on the parts
    // that do not depend on the middle-dot separator character.
    expect(screen.getByText(/acme internal.*0 findings/i)).toBeInTheDocument();
  });

  it("keeps optional RED work outside core progress", () => {
    const journey = makeGuide({
      next: null,
      core_complete: true,
      steps: [
        makeGuideStep({ id: "doctor", title: "Check the console", href: "/", done: true }),
        makeGuideStep({
          id: "red-run",
          title: "Run a RED capability with typed confirm",
          href: "/catalog?lane=red",
          done: false,
          optional: true,
        }),
      ],
    });
    renderWithRouter(
      <Guided guide={journey} engagement={makeEngagement()} onDemo={vi.fn()} />,
    );
    expect(screen.getByText(/1 of 1 core steps complete/i)).toBeInTheDocument();
    expect(screen.getByText(/core journey complete/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /optional advanced work/i })).toBeInTheDocument();
    expect(screen.getByText(/run a red capability with typed confirm/i)).toBeInTheDocument();
  });
});
