import { screen, waitFor } from "@testing-library/react";
import { Connect } from "./Connect";
import { api } from "../api";
import { makeEngagement, renderWithRouter } from "../test/utils";

vi.mock("../api", () => ({ api: { connect: vi.fn() } }));

const preflight = {
  ok: true,
  ready: true,
  transport: "ldap" as const,
  ldap_port: 389,
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
        expect.objectContaining({
          domain: "corp.local",
          dc: "10.0.0.1",
          transport: "ldap",
          auth_mode: "authenticated",
        }),
      ),
    );
    expect(await screen.findByText("ready")).toBeInTheDocument();
    expect(screen.getByText("dns")).toBeInTheDocument();
    expect(onConnected).toHaveBeenCalledWith(engagement);
  });

  it("binds LDAPS to the standard port in the connect request", async () => {
    const engagement = makeEngagement();
    const ldapsPreflight = { ...preflight, transport: "ldaps" as const, ldap_port: 636 };
    vi.mocked(api.connect).mockResolvedValue({
      ok: true,
      engagement,
      preflight: ldapsPreflight,
    });
    const { user } = renderWithRouter(
      <Connect engagement={engagement} onConnected={vi.fn()} onSeedDemo={vi.fn()} />,
    );

    await user.selectOptions(screen.getByLabelText(/directory transport/i), "ldaps");
    expect(screen.getByLabelText(/ldap port/i)).toHaveValue(636);
    await user.click(screen.getByRole("button", { name: /run preflight/i }));

    await waitFor(() =>
      expect(vi.mocked(api.connect)).toHaveBeenCalledWith(
        "eng-001",
        expect.objectContaining({ transport: "ldaps" }),
      ),
    );
    expect(await screen.findByText(/port 636/i)).toBeInTheDocument();
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

  it("makes no-credential anonymous connect explicit and omits credential fields", async () => {
    const engagement = makeEngagement({ username: "" });
    const anonymousEngagement = makeEngagement({
      username: "",
      connect: {
        domain: "corp.local",
        dc: "10.0.0.1",
        auth_mode: "anonymous",
        username: "",
        secret_ref: null,
        has_secret: false,
        preflight_ok: true,
        status: "ready",
        checked_at: "2026-09-01T10:00:00Z",
        expires_at: "2099-09-01T10:15:00Z",
        invalidated_reason: null,
        target: { domain: "corp.local", dc: "10.0.0.1" },
        preflight,
      },
    });
    vi.mocked(api.connect).mockResolvedValue({
      ok: true,
      engagement: anonymousEngagement,
      preflight,
    });
    const { user } = renderWithRouter(
      <Connect engagement={engagement} onConnected={vi.fn()} onSeedDemo={vi.fn()} />,
    );

    expect(screen.getByLabelText(/authentication mode/i)).toHaveValue("anonymous");
    expect(screen.getByText(/anonymous — no domain credentials\./i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/username/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /run preflight/i }));

    await waitFor(() => expect(vi.mocked(api.connect)).toHaveBeenCalledWith(
      "eng-001",
      expect.objectContaining({
        auth_mode: "anonymous",
        username: undefined,
        password: undefined,
        hashes: undefined,
      }),
    ));
  });

  it("keeps demo engagements offline", () => {
    renderWithRouter(
      <Connect engagement={makeEngagement({ mode: "demo" })} onConnected={vi.fn()} onSeedDemo={vi.fn()} />,
    );
    expect(screen.getByText(/offline demo engagement/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run preflight/i })).toBeDisabled();
  });
});
