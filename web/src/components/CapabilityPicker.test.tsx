import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CapabilityPicker } from "./CapabilityPicker";
import { makeCapability, makeRedCapability } from "../test/utils";

const caps = [
  makeCapability({ id: "ldap-signing-check", plain: "Reads LDAP signing policy.", lane: "yellow", category: "recon" }),
  makeCapability({ id: "smb-null-session", plain: "Checks anonymous SMB.", lane: "green", category: "recon" }),
  makeRedCapability({ id: "dcsync", plain: "Pulls password material.", category: "credential-access" }),
];

function noop() {}

describe("CapabilityPicker", () => {
  it("lists every capability and reports the count", () => {
    render(
      <CapabilityPicker
        capabilities={caps}
        selectedId=""
        onSelect={noop}
        query=""
        onQueryChange={noop}
        lane="all"
        onLaneChange={noop}
      />,
    );
    expect(screen.getByText("ldap-signing-check")).toBeInTheDocument();
    expect(screen.getByText("smb-null-session")).toBeInTheDocument();
    expect(screen.getByText("dcsync")).toBeInTheDocument();
    expect(screen.getByText(/showing 3 of 3 capabilities/i)).toBeInTheDocument();
  });

  it("filters by the query prop across id, summary, and plain text", () => {
    render(
      <CapabilityPicker
        capabilities={caps}
        selectedId=""
        onSelect={noop}
        query="dcsync"
        onQueryChange={noop}
        lane="all"
        onLaneChange={noop}
      />,
    );
    expect(screen.getByText("dcsync")).toBeInTheDocument();
    expect(screen.queryByText("ldap-signing-check")).not.toBeInTheDocument();
    expect(screen.getByText(/showing 1 of 3 capabilities/i)).toBeInTheDocument();
  });

  it("filters by lane", () => {
    render(
      <CapabilityPicker
        capabilities={caps}
        selectedId=""
        onSelect={noop}
        query=""
        onQueryChange={noop}
        lane="red"
        onLaneChange={noop}
      />,
    );
    expect(screen.getByText("dcsync")).toBeInTheDocument();
    expect(screen.queryByText("ldap-signing-check")).not.toBeInTheDocument();
    expect(screen.queryByText("smb-null-session")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", () => {
    render(
      <CapabilityPicker
        capabilities={caps}
        selectedId=""
        onSelect={noop}
        query="no-such-capability"
        onQueryChange={noop}
        lane="all"
        onLaneChange={noop}
      />,
    );
    expect(screen.getByText(/no capabilities match that search/i)).toBeInTheDocument();
  });

  it("calls onQueryChange as the operator types in the search box", async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CapabilityPicker
        capabilities={caps}
        selectedId=""
        onSelect={noop}
        query=""
        onQueryChange={onQueryChange}
        lane="all"
        onLaneChange={noop}
      />,
    );
    await user.type(screen.getByRole("searchbox"), "d");
    expect(onQueryChange).toHaveBeenCalledWith("d");
  });

  it("calls onSelect with the capability id when a row is clicked", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <CapabilityPicker
        capabilities={caps}
        selectedId=""
        onSelect={onSelect}
        query="dcsync"
        onQueryChange={noop}
        lane="all"
        onLaneChange={noop}
      />,
    );
    await user.click(screen.getByRole("button", { name: /dcsync/i }));
    expect(onSelect).toHaveBeenCalledWith("dcsync");
  });

  it("renders the category filter only when category props are supplied", () => {
    const { rerender } = render(
      <CapabilityPicker
        capabilities={caps}
        selectedId=""
        onSelect={noop}
        query=""
        onQueryChange={noop}
        lane="all"
        onLaneChange={noop}
      />,
    );
    // Only the lane <select> exists without category props.
    expect(screen.getAllByRole("combobox")).toHaveLength(1);

    rerender(
      <CapabilityPicker
        capabilities={caps}
        selectedId=""
        onSelect={noop}
        query=""
        onQueryChange={noop}
        lane="all"
        onLaneChange={noop}
        category="all"
        onCategoryChange={noop}
      />,
    );
    const combos = screen.getAllByRole("combobox");
    expect(combos).toHaveLength(2);
    // The category select derives its options from the capabilities.
    const categorySelect = combos[1];
    expect(within(categorySelect).getByRole("option", { name: "recon" })).toBeInTheDocument();
    expect(within(categorySelect).getByRole("option", { name: "credential-access" })).toBeInTheDocument();
  });

  it("marks the selected row", () => {
    render(
      <CapabilityPicker
        capabilities={caps}
        selectedId="dcsync"
        onSelect={noop}
        query="dcsync"
        onQueryChange={noop}
        lane="all"
        onLaneChange={noop}
      />,
    );
    const row = screen.getByRole("button", { name: /dcsync/i });
    expect(row).toHaveClass("selected");
  });
});
