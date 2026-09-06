import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { Shell } from "./Shell";
import { makeEngagement, makeHealth, renderWithRouter } from "../test/utils";

function renderShell(health = makeHealth(), route = "/") {
  return renderWithRouter(
    <Routes>
      <Route element={<Shell health={health} />}>
        <Route path="/" element={<div>home content</div>} />
        <Route path="/catalog" element={<div>catalog content</div>} />
      </Route>
    </Routes>,
    { route },
  );
}

describe("Shell", () => {
  it("renders the authorized-use banner and the outlet content", () => {
    renderShell();
    expect(screen.getByText(/authorized use only/i)).toBeInTheDocument();
    expect(screen.getByText("home content")).toBeInTheDocument();
  });

  it("renders grouped navigation with the expected sections and links", () => {
    renderShell();
    for (const heading of ["Start", "Assess", "Reference", "Advanced"]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: /overview/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /run/i })).toHaveAttribute("href", "/run");
    expect(screen.getByRole("link", { name: /report/i })).toHaveAttribute("href", "/report");
  });

  it("shows the engine as live when the engine is available", () => {
    renderShell(makeHealth({ engine: { ...makeHealth().engine, available: true } }));
    const pill = screen.getByText(/engine live/i);
    expect(pill).toHaveClass("pill", "ok");
  });

  it("shows a catalog-fallback pill when the engine is unavailable", () => {
    renderShell(
      makeHealth({
        engine: { available: false, version: null, pin: "0.10.1", commit: "abc", capability_count: 0, error: "no import" },
      }),
    );
    const pill = screen.getByText(/engine catalog fallback/i);
    expect(pill).toHaveClass("pill", "warn");
  });

  it("reports the product version, capability count, and bind address", () => {
    renderShell(makeHealth({ version: "0.8.0", catalog_count: 92, bind: "127.0.0.1:8745" }));
    expect(screen.getByText(/ADAssassin 0\.8\.0/)).toBeInTheDocument();
    expect(screen.getByText(/92 capabilities/)).toBeInTheDocument();
    expect(screen.getByText("127.0.0.1:8745")).toBeInTheDocument();
  });

  it("sets a plain document title on the home route", () => {
    renderShell(makeHealth(), "/");
    expect(document.title).toBe("ADAssassin");
  });

  it("sets a section-scoped document title on inner routes", () => {
    renderShell(makeHealth(), "/catalog");
    expect(document.title).toBe("Catalog · ADAssassin");
  });

  it("exposes a skip-to-content link", () => {
    renderShell();
    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute("href", "#main-content");
  });

  it("opens the command palette from the jump control", async () => {
    const { user } = renderShell();
    await user.click(screen.getByRole("button", { name: /open command palette/i }));
    expect(screen.getByRole("dialog", { name: /quick jump/i })).toBeInTheDocument();
  });

  it("lets the operator switch the current engagement from the topbar", async () => {
    const onSelect = vi.fn();
    const current = makeEngagement();
    const other = makeEngagement({ id: "eng-002", name: "Other lab" });
    const { user } = renderWithRouter(
      <Routes>
        <Route
          element={(
            <Shell
              health={makeHealth()}
              engagements={[current, other]}
              current={current}
              onSelectEngagement={onSelect}
            />
          )}
        >
          <Route path="/" element={<div>home content</div>} />
        </Route>
      </Routes>,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Current engagement" }),
      "eng-002",
    );
    expect(onSelect).toHaveBeenCalledWith("eng-002");
  });

  it("keeps the current target context visible", () => {
    const current = makeEngagement({
      name: "Production forest",
      domain: "prod.example",
      dc: "dc01.prod.example",
      rollback: { pending: 2 },
    });
    renderWithRouter(
      <Routes>
        <Route element={<Shell health={makeHealth()} engagements={[current]} current={current} />}>
          <Route path="/" element={<div>home content</div>} />
        </Route>
      </Routes>,
    );
    const context = screen.getByLabelText(/current engagement context/i);
    expect(context).toHaveTextContent("Production forest");
    expect(context).toHaveTextContent("prod.example · dc01.prod.example");
    expect(context).toHaveTextContent("2 rollback pending");
  });

  it("shows stale-data recovery and calls refresh", async () => {
    const onRefresh = vi.fn();
    const { user } = renderWithRouter(
      <Routes>
        <Route
          element={<Shell health={makeHealth()} notice="Backend stopped" onRefresh={onRefresh} />}
        >
          <Route path="/" element={<div>home content</div>} />
        </Route>
      </Routes>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/data may be stale.*backend stopped/i);
    await user.click(screen.getByRole("button", { name: /^retry$/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
