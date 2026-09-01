import { screen } from "@testing-library/react";
import { Engagements } from "./Engagements";
import { makeEngagement, renderWithRouter } from "../test/utils";

describe("Engagements", () => {
  it("creates an engagement from the form with trimmed values", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { user } = renderWithRouter(
      <Engagements items={[]} currentId={null} onCreate={onCreate} onDemo={vi.fn()} onSelect={vi.fn()} />,
    );
    await user.type(screen.getByPlaceholderText("Name"), "  Acme  ");
    await user.type(screen.getByPlaceholderText(/domain/i), "corp.local");
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    expect(onCreate).toHaveBeenCalledWith({ name: "Acme", domain: "corp.local", dc: "", notes: "" });
  });

  it("does not submit when the name is blank", async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const { user } = renderWithRouter(
      <Engagements items={[]} currentId={null} onCreate={onCreate} onDemo={vi.fn()} onSelect={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("seeds the demo", async () => {
    const onDemo = vi.fn();
    const { user } = renderWithRouter(
      <Engagements items={[]} currentId={null} onCreate={vi.fn()} onDemo={onDemo} onSelect={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /seed demo/i }));
    expect(onDemo).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when there are no saved engagements", () => {
    renderWithRouter(
      <Engagements items={[]} currentId={null} onCreate={vi.fn()} onDemo={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByText(/none yet/i)).toBeInTheDocument();
  });

  it("selects a saved engagement when clicked", async () => {
    const onSelect = vi.fn();
    const items = [makeEngagement({ id: "eng-42", name: "Beacon lab" })];
    const { user } = renderWithRouter(
      <Engagements items={items} currentId="eng-42" onCreate={vi.fn()} onDemo={vi.fn()} onSelect={onSelect} />,
    );
    await user.click(screen.getByRole("button", { name: /beacon lab/i }));
    expect(onSelect).toHaveBeenCalledWith("eng-42");
  });
});
