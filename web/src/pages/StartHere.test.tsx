import { screen, within } from "@testing-library/react";
import { StartHere } from "./StartHere";
import { renderWithRouter } from "../test/utils";

describe("StartHere", () => {
  it("exposes the complete novice path and every console surface", () => {
    renderWithRouter(<StartHere />, { route: "/start" });
    expect(screen.getByRole("heading", { name: /first click to defensible closeout/i })).toBeInTheDocument();
    expect(screen.getByText(/nothing is removed in this view/i)).toBeInTheDocument();

    for (const label of [
      "Start Here", "Overview", "Guided", "Engagements", "Connect", "Run", "Findings",
      "Catalog", "Glossary", "Vault", "Rollback", "Report",
    ]) {
      expect(screen.getAllByRole("link", { name: `Open ${label}` }).length).toBeGreaterThan(0);
    }
  });

  it("keeps all launch flags, runtime settings, and API discovery visible", () => {
    renderWithRouter(<StartHere />, { route: "/start" });
    expect(screen.getByText(/adassassin --host localhost --port 8750 --no-browser/)).toBeInTheDocument();
    expect(screen.getByText(/ADASSASSIN_DATA_DIR/)).toBeInTheDocument();
    expect(screen.getByText(/ADAF_SESSION_VAULT_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/\/api\/catalog/)).toBeInTheDocument();
    expect(screen.getByText(/ADASSASSIN_RUN_SYNCHRONOUS/)).toBeInTheDocument();
    expect(screen.getByText(/all 30 local api operations/i)).toBeInTheDocument();
  });

  it("keeps one clear first action and links each first-session instruction to its destination", async () => {
    const { user } = renderWithRouter(<StartHere />, { route: "/start" });

    const hero = screen.getByRole("heading", { name: /first click to defensible closeout/i }).closest(".hero");
    expect(hero).not.toBeNull();
    const primaryAction = within(hero as HTMLElement).getByRole("link", { name: "Begin the zero-contact walkthrough" });
    expect(within(hero as HTMLElement).getAllByRole("link")).toHaveLength(1);
    expect(primaryAction).toHaveAttribute("href", "/guided");
    await user.tab();
    expect(primaryAction).toHaveFocus();

    for (const [label, href] of [
      ["Check console health", "/"],
      ["Open Guided walkthrough", "/guided"],
      ["Open demo findings", "/findings"],
      ["Browse GREEN capabilities", "/catalog?lane=green"],
      ["Review the demo vault", "/vault"],
      ["Preview rollback", "/rollback"],
      ["Review closeout", "/report"],
    ]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });
});
