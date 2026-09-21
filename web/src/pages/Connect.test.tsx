import { screen, waitFor } from "@testing-library/react";
import { Connect } from "./Connect";
import { api } from "../api";
import { makeEngagement, renderWithRouter } from "../test/utils";

vi.mock("../api", () => ({ api: { connect: vi.fn() } }));

const preflight = {
  ok: true,
  ready: true,
  network_status: "reachable" as const,
  transport: "ldap" as const,
  ldap_port: 389,
  target_contacted: true,
  blocking_checks: [],
  advisory_checks: [],
  next_step: "Run an observe capability",
  credential_validation: {
    required: true,
    attempted: true,
    valid: true,
    method: "password" as const,
  },
  credential_log: ["Result: credential accepted; eligible for memory-only staging."],
  credential_remediation: [],
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
    await user.type(screen.getByPlaceholderText(/^password/i), "fixture-only-secret");
    await user.click(screen.getByRole("button", { name: /run preflight/i }));

    await waitFor(() =>
      expect(vi.mocked(api.connect)).toHaveBeenCalledWith(
        "eng-001",
        expect.objectContaining({
          domain: "corp.local",
          dc: "10.0.0.1",
          transport: "ldap",
          auth_mode: "authenticated",
          username: "operator",
          password: "fixture-only-secret",
        }),
      ),
    );
    expect(await screen.findByText("ready")).toBeInTheDocument();
    expect(screen.getByText("reachable")).toBeInTheDocument();
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
    await user.type(screen.getByPlaceholderText(/^password/i), "fixture-only-secret");
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
    await user.type(screen.getByPlaceholderText(/^password/i), "fixture-only-secret");
    await user.click(screen.getByRole("button", { name: /run preflight/i }));
    expect(await screen.findByText(/dns resolution failed/i)).toBeInTheDocument();
  });

  it("shows a redacted authentication log and ordered remediation after rejection", async () => {
    const engagement = makeEngagement();
    const failedPreflight = {
      ...preflight,
      ready: false,
      credential_validation: {
        required: true,
        attempted: true,
        valid: false,
        method: "password" as const,
      },
      credential_log: [
        "Attempt: one password LDAP bind through the pinned engine over LDAP:389.",
        "Secret handling: credential value redacted; automatic retries disabled.",
        "Result: the engine did not establish an authenticated bind.",
      ],
      credential_remediation: [
        "Stop repeated attempts and check the account lockout threshold.",
        "Correct the credential in Connect and retry once.",
      ],
    };
    vi.mocked(api.connect).mockResolvedValue({
      ok: true,
      engagement,
      preflight: failedPreflight,
    });
    const { user } = renderWithRouter(
      <Connect engagement={engagement} onConnected={vi.fn()} onSeedDemo={vi.fn()} />,
    );
    await user.type(screen.getByPlaceholderText(/^password/i), "fixture-only-secret");
    await user.click(screen.getByRole("button", { name: /run preflight/i }));

    expect(await screen.findByRole("heading", { name: /authentication log/i })).toBeInTheDocument();
    expect(screen.getByText(/credential value redacted/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /credential remediation/i })).toBeInTheDocument();
    expect(screen.getByText(/stop repeated attempts and check/i)).toBeInTheDocument();
    expect(screen.queryByText("fixture-only-secret")).not.toBeInTheDocument();
  });

  it("requires credential material before authenticated preflight", async () => {
    const engagement = makeEngagement();
    const { user } = renderWithRouter(
      <Connect engagement={engagement} onConnected={vi.fn()} onSeedDemo={vi.fn()} />,
    );
    await user.click(screen.getByRole("button", { name: /run preflight/i }));
    expect(await screen.findByText(/requires one bind credential/i)).toBeInTheDocument();
    expect(api.connect).not.toHaveBeenCalled();
  });

  it("makes no-credential anonymous connect explicit and omits credential fields", async () => {
    const engagement = makeEngagement({ username: "" });
    const anonymousPreflight = {
      ...preflight,
      credential_validation: {
        required: false,
        attempted: false,
        valid: null,
        method: "anonymous" as const,
      },
    };
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
        preflight: anonymousPreflight,
      },
    });
    vi.mocked(api.connect).mockResolvedValue({
      ok: true,
      engagement: anonymousEngagement,
      preflight: anonymousPreflight,
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
