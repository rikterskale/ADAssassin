import { screen } from "@testing-library/react";
import { Guided } from "./Guided";
import { makeEngagement, makeGuide, makeGuideStep, renderWithRouter } from "../test/utils";

const guide = makeGuide({
  steps: [
    makeGuideStep({ id: "doctor", title: "Check the console", href: "/", done: true }),
    makeGuideStep({ id: "demo", title: "Seed the offline demo", href: "/guided", done: false }),
  ],
});

describe("Guided", () => {
  it("renders numbered steps", () => {
    renderWithRouter(
      <Guided guide={guide} engagement={null} onDemo={vi.fn()} onMark={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: /01 check the console/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /02 seed the offline demo/i })).toBeInTheDocument();
  });

  it("marks an incomplete step as seen", async () => {
    const onMark = vi.fn();
    const { user } = renderWithRouter(
      <Guided guide={guide} engagement={null} onDemo={vi.fn()} onMark={onMark} />,
    );
    await user.click(screen.getByRole("button", { name: /mark seen/i }));
    expect(onMark).toHaveBeenCalledWith("demo");
  });

  it("shows a done badge for completed steps instead of a mark-seen button", () => {
    renderWithRouter(
      <Guided guide={guide} engagement={null} onDemo={vi.fn()} onMark={vi.fn()} />,
    );
    expect(screen.getByText("done")).toBeInTheDocument();
    // Only the single incomplete step exposes a mark-seen button.
    expect(screen.getAllByRole("button", { name: /mark seen/i })).toHaveLength(1);
  });

  it("seeds the demo from the hero action", async () => {
    const onDemo = vi.fn();
    const { user } = renderWithRouter(
      <Guided guide={guide} engagement={null} onDemo={onDemo} onMark={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /seed offline demo/i }));
    expect(onDemo).toHaveBeenCalledTimes(1);
  });

  it("prompts to seed when there is no current engagement", () => {
    renderWithRouter(
      <Guided guide={guide} engagement={null} onDemo={vi.fn()} onMark={vi.fn()} />,
    );
    expect(screen.getByText(/seed the demo to populate findings without a dc/i)).toBeInTheDocument();
  });

  it("summarizes the current engagement focus", () => {
    const engagement = makeEngagement({ name: "Acme internal", mode: "demo", findings: [] });
    renderWithRouter(
      <Guided guide={guide} engagement={engagement} onDemo={vi.fn()} onMark={vi.fn()} />,
    );
    // The focus line reads "<name> · <mode> · <n> findings"; match on the parts
    // that do not depend on the middle-dot separator character.
    expect(screen.getByText(/acme internal.*0 findings/i)).toBeInTheDocument();
  });
});
