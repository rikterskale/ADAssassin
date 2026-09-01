import { screen } from "@testing-library/react";
import { Catalog } from "./Catalog";
import type { CatalogResponse } from "../types";
import { makeCapability, makeRedCapability, renderWithRouter } from "../test/utils";

function catalogOf(...capabilities: ReturnType<typeof makeCapability>[]): CatalogResponse {
  return {
    source: "engine",
    engine_version: "0.10.1",
    engine_commit: "fdb60b90",
    count: capabilities.length,
    capabilities,
  };
}

describe("Catalog", () => {
  it("headlines the capability count from the pinned engine", () => {
    renderWithRouter(<Catalog catalog={catalogOf(makeCapability())} onViewGreen={vi.fn()} />, {
      route: "/catalog",
    });
    expect(screen.getByRole("heading", { name: /1 capabilities from the pinned engine/i })).toBeInTheDocument();
  });

  it("prompts the operator to pick a capability before showing the inspector", () => {
    renderWithRouter(<Catalog catalog={catalogOf(makeCapability())} onViewGreen={vi.fn()} />, {
      route: "/catalog",
    });
    expect(screen.getByText(/select a capability to see details and a run link/i)).toBeInTheDocument();
  });

  it("shows inspector detail and a run link once a capability is selected", async () => {
    const cap = makeCapability({ id: "ldap-signing-check", plain: "Reads LDAP signing policy." });
    const { user } = renderWithRouter(<Catalog catalog={catalogOf(cap)} onViewGreen={vi.fn()} />, {
      route: "/catalog",
    });
    await user.click(screen.getByRole("button", { name: /ldap-signing-check/i }));
    const runLink = screen.getByRole("link", { name: /^run$/i });
    expect(runLink).toHaveAttribute("href", "/run?capability=ldap-signing-check");
  });

  it("flags RED capabilities and encodes the risk in the run label", async () => {
    const cap = makeRedCapability({ id: "dcsync", risk_label: "destructive" });
    const { user } = renderWithRouter(<Catalog catalog={catalogOf(cap)} onViewGreen={vi.fn()} />, {
      route: "/catalog",
    });
    await user.click(screen.getByRole("button", { name: /dcsync/i }));
    expect(screen.getByText(/the run page requires typing/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /run dcsync destructive/i })).toHaveAttribute(
      "href",
      "/run?capability=dcsync",
    );
  });

  it("notifies the guided tracker when the green lane is opened via the URL", () => {
    const onViewGreen = vi.fn();
    renderWithRouter(
      <Catalog catalog={catalogOf(makeCapability({ lane: "green" }))} onViewGreen={onViewGreen} />,
      { route: "/catalog?lane=green" },
    );
    expect(onViewGreen).toHaveBeenCalled();
  });
});
