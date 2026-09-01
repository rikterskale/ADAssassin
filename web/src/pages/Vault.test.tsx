import { screen } from "@testing-library/react";
import { Vault } from "./Vault";
import { api } from "../api";
import { makeEngagement, makeVaultItem, makeVaultResponse, renderWithRouter } from "../test/utils";

vi.mock("../api", () => ({ api: { vault: vi.fn(), unmaskVault: vi.fn() } }));

describe("Vault", () => {
  it("prompts to seed a demo when there is no engagement", () => {
    renderWithRouter(<Vault engagement={null} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />);
    expect(screen.getByRole("button", { name: /seed the offline demo/i })).toBeInTheDocument();
  });

  it("lists vault items and selects the first by default", async () => {
    vi.mocked(api.vault).mockResolvedValue(makeVaultResponse());
    renderWithRouter(<Vault engagement={makeEngagement()} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />);
    expect(await screen.findByText("KRBTGT NT hash")).toBeInTheDocument();
  });

  it("unmasks a secret item and reveals its value", async () => {
    vi.mocked(api.vault).mockResolvedValue(makeVaultResponse());
    vi.mocked(api.unmaskVault).mockResolvedValue({
      ok: true,
      item: {
        name: "krbtgt-hash",
        scope: "engagement",
        value: { nt: "aad3b435b51404ee" },
        expires_at: "2026-09-01T10:00:30Z",
        ttl_seconds: 30,
      },
      engagement: makeEngagement(),
    });
    const { user } = renderWithRouter(
      <Vault engagement={makeEngagement()} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />,
    );
    await user.click(await screen.findByRole("button", { name: /unmask for 30s/i }));
    expect(await screen.findByText(/unmasked value/i)).toBeInTheDocument();
    expect(screen.getByText(/aad3b435b51404ee/)).toBeInTheDocument();
    expect(vi.mocked(api.unmaskVault)).toHaveBeenCalledWith("eng-001", "krbtgt-hash", {
      scope: "engagement",
      ttl_seconds: 30,
    });
  });

  it("disables unmask for public (non-secret) metadata", async () => {
    const publicItem = makeVaultItem({ name: "ca-cert", kind: "certificate", secret: false, label: "Issuing CA cert" });
    vi.mocked(api.vault).mockResolvedValue(
      makeVaultResponse({ items: [publicItem], counters: { secrets: 0, tickets: 0, certificates: 1 } }),
    );
    renderWithRouter(<Vault engagement={makeEngagement()} onUpdated={vi.fn()} onSeedDemo={vi.fn()} />);
    expect(await screen.findByText(/public metadata items do not need unmask/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unmask for 30s/i })).toBeDisabled();
  });
});
