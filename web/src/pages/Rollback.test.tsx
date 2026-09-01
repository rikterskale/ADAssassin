import { screen } from "@testing-library/react";
import { Rollback } from "./Rollback";
import { api } from "../api";
import { makeEngagement, makeRollbackResponse, renderWithRouter } from "../test/utils";

vi.mock("../api", () => ({
  api: { rollback: vi.fn(), previewRollback: vi.fn(), applyRollback: vi.fn() },
}));

describe("Rollback", () => {
  it("prompts to seed a demo when there is no engagement", () => {
    vi.mocked(api.rollback).mockResolvedValue(makeRollbackResponse());
    renderWithRouter(<Rollback engagement={null} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />);
    expect(screen.getByRole("button", { name: /seed the offline demo/i })).toBeInTheDocument();
  });

  it("loads pending cleanup entries", async () => {
    vi.mocked(api.rollback).mockResolvedValue(makeRollbackResponse());
    renderWithRouter(<Rollback engagement={makeEngagement()} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />);
    expect(await screen.findByText("attribute-write")).toBeInTheDocument();
  });

  it("previews rollback without contacting a DC", async () => {
    vi.mocked(api.rollback).mockResolvedValue(makeRollbackResponse());
    vi.mocked(api.previewRollback).mockResolvedValue(
      makeRollbackResponse({ preview: true, message: "Preview ready — no directory contacted." }),
    );
    const { user } = renderWithRouter(
      <Rollback engagement={makeEngagement()} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /preview rollback/i }));
    expect(await screen.findByText(/preview ready — no directory contacted/i)).toBeInTheDocument();
    expect(vi.mocked(api.previewRollback)).toHaveBeenCalledWith("eng-001");
  });

  it("gates apply behind a typed YES confirmation", async () => {
    vi.mocked(api.rollback).mockResolvedValue(makeRollbackResponse());
    vi.mocked(api.applyRollback).mockResolvedValue(
      makeRollbackResponse({ mutation: true, message: "Rollback apply requested." }),
    );
    const { user } = renderWithRouter(
      <Rollback engagement={makeEngagement()} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />,
    );

    const applyButton = screen.getByRole("button", { name: /apply rollback/i });
    expect(applyButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText(/type yes/i), "YES");
    expect(applyButton).toBeEnabled();

    await user.click(applyButton);
    expect(vi.mocked(api.applyRollback)).toHaveBeenCalledWith("eng-001", {
      force: true,
      ack: true,
      confirm: "YES",
    });
  });
});
