import { screen, waitFor } from "@testing-library/react";
import { Connect } from "./Connect";
import { api } from "../api";
import { makeEngagement, renderWithRouter } from "../test/utils";

vi.mock("../api", () => ({ api: { connect: vi.fn() } }));

const preflight = {
  ok: true,
  ready: true,
  target_contacted: true,
  blocking_checks: [],
  advisory_checks: [],
  next_step: "Run an observe capability",
  checks: [{ id: "dns", status: "ok", value: "resolved" }],
};

describe("Connect", () => {
  it("prompts to seed a demo when there is no engagement", async () => {
    const onSeedDemo = vi.fn();
    const { user } = renderWithRouter(
      <Connect engagement={null} onConnected={vi.fn()} onSeedDemo={onSeedDemo} />,
    );
    await user.click(screen.getByRole("button", { name: /seed the offline demo/i }));
    expect(onSeedDemo).toHaveBeenCalledTimes(1);
  });

  it("prefills the form from the current engagement", () => {
    const engagement = makeEngagement({ domain: "corp.local", dc: "10.0.0.1", username: "operator" });
    renderWithRouter(<Connect engagement={engagement} onConnected={vi.fn()} onSeedDemo={vi.fn()} />);
    expect(screen.getByPlaceholderText(/domain \(e\.g\./i)).toHaveValue("corp.local");
    expect(screen.getByPlaceholderText(/dc host or ip/i)).toHaveValue("10.0.0.1");
    expect(screen.getByPlaceholderText(/username/i)).toHaveValue("operator");
  });

  it("runs preflight and renders the result", async () => {
    const onConnected = vi.fn();
    const engagement = makeEngagement();
    vi.mocked(api.connect).mockResolvedValue({ ok: true, engagement, preflight });
    const { user } = renderWithRouter(
      <Connect engagement={engagement} onConnected={onConnected} onSeedDemo={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /run preflight/i }));

    await waitFor(() =>
      expect(vi.mocked(api.connect)).toHaveBeenCalledWith(
        "eng-001",
        expect.objectContaining({ domain: "corp.local", dc: "10.0.0.1" }),
      ),
    );
    expect(await screen.findByText("ready")).toBeInTheDocument();
    expect(screen.getByText("dns")).toBeInTheDocument();
    expect(onConnected).toHaveBeenCalledWith(engagement);
  });

  it("surfaces a preflight error", async () => {
    const engagement = makeEngagement();
    vi.mocked(api.connect).mockRejectedValue(new Error("DNS resolution failed"));
    const { user } = renderWithRouter(
      <Connect engagement={engagement} onConnected={vi.fn()} onSeedDemo={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /run preflight/i }));
    expect(await screen.findByText(/dns resolution failed/i)).toBeInTheDocument();
  });

  it("keeps demo engagements offline", () => {
    renderWithRouter(
      <Connect engagement={makeEngagement({ mode: "demo" })} onConnected={vi.fn()} onSeedDemo={vi.fn()} />,
    );
    expect(screen.getByText(/offline demo engagement/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run preflight/i })).toBeDisabled();
  });
});
