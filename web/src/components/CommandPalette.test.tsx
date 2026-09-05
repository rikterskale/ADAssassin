import { screen } from "@testing-library/react";
import { CommandPalette } from "./CommandPalette";
import { makeCapability, makeEngagement, renderWithRouter } from "../test/utils";

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    renderWithRouter(
      <CommandPalette
        open={false}
        onClose={vi.fn()}
        catalog={[]}
        engagements={[]}
        onSelectEngagement={vi.fn()}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists pages when open", () => {
    renderWithRouter(
      <CommandPalette
        open
        onClose={vi.fn()}
        catalog={[]}
        engagements={[]}
        onSelectEngagement={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog", { name: /jump to/i })).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Catalog")).toBeInTheDocument();
  });

  it("filters to matching capabilities", async () => {
    const { user } = renderWithRouter(
      <CommandPalette
        open
        onClose={vi.fn()}
        catalog={[makeCapability(), makeCapability({ id: "dcsync", summary: "Replicate secrets" })]}
        engagements={[]}
        onSelectEngagement={vi.fn()}
      />,
    );
    await user.type(screen.getByPlaceholderText(/jump to a page/i), "dcsync");
    expect(screen.getByText("dcsync")).toBeInTheDocument();
    expect(screen.queryByText("Overview")).not.toBeInTheDocument();
    expect(screen.queryByText("ldap-signing-check")).not.toBeInTheDocument();
  });

  it("selects an engagement from the palette", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const { user } = renderWithRouter(
      <CommandPalette
        open
        onClose={onClose}
        catalog={[]}
        engagements={[makeEngagement({ id: "eng-9", name: "Beacon lab" })]}
        onSelectEngagement={onSelect}
      />,
    );
    await user.type(screen.getByPlaceholderText(/jump to a page/i), "beacon");
    await user.click(screen.getByRole("button", { name: /beacon lab/i }));
    expect(onSelect).toHaveBeenCalledWith("eng-9");
    expect(onClose).toHaveBeenCalled();
  });
});
