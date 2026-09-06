import { screen } from "@testing-library/react";
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
    expect(screen.getByText(/all 27 operations/i)).toBeInTheDocument();
  });
});
