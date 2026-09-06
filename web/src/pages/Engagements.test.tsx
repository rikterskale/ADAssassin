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

  it("keeps form values and shows an actionable create error", async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error("Storage is not writable"));
    const { user } = renderWithRouter(
      <Engagements items={[]} currentId={null} onCreate={onCreate} onDemo={vi.fn()} onSelect={vi.fn()} />,
    );
    const name = screen.getByPlaceholderText("Name");
    await user.type(name, "Acme");
    await user.click(screen.getByRole("button", { name: /^create$/i }));
    expect(await screen.findByText(/storage is not writable/i)).toBeInTheDocument();
    expect(name).toHaveValue("Acme");
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

  it("edits and archives the selected engagement without deleting evidence", async () => {
    const item = makeEngagement({ id: "eng-42", name: "Beacon lab" });
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const onArchive = vi.fn().mockResolvedValue(undefined);
    const { user } = renderWithRouter(
      <Engagements
        items={[item]}
        currentId="eng-42"
        onCreate={vi.fn()}
        onUpdate={onUpdate}
        onArchive={onArchive}
        onDemo={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const name = screen.getByLabelText(/^name$/i, { selector: "input:not([placeholder])" });
    await user.clear(name);
    await user.type(name, "  Beacon final  ");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(onUpdate).toHaveBeenCalledWith(
      "eng-42",
      expect.objectContaining({ name: "Beacon final" }),
    );

    await user.click(screen.getByRole("button", { name: /archive engagement/i }));
    expect(onArchive).toHaveBeenCalledWith("eng-42", true);
    expect(screen.getByText(/never deletes evidence/i)).toBeInTheDocument();
  });
});
