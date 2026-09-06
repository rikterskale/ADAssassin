import { screen, waitFor } from "@testing-library/react";
import { Run } from "./Run";
import { api } from "../api";
import { makeCapability, makeEngagement, makeRedCapability, renderWithRouter } from "../test/utils";

vi.mock("../api", () => ({
  api: { capability: vi.fn(), run: vi.fn(), job: vi.fn(), engagement: vi.fn() },
}));

const observeCap = makeCapability({ id: "ldap-signing-check", plain: "Reads LDAP signing policy.", required_prompts: [] });
const redCap = makeRedCapability({ id: "dcsync", plain: "Pulls password material.", risk_label: "destructive" });

function connectedEngagement() {
  return makeEngagement({
    connect: {
      domain: "corp.local",
      dc: "10.0.0.1",
      username: "operator",
      secret_ref: null,
      has_secret: false,
      preflight_ok: true,
      status: "ready",
      checked_at: "2026-09-01T10:00:00Z",
      expires_at: "2099-09-01T10:15:00Z",
      invalidated_reason: null,
      target: { domain: "corp.local", dc: "10.0.0.1" },
      preflight: {
        ok: true,
        ready: true,
        blocking_checks: [],
        advisory_checks: [],
        checks: [],
        target_contacted: true,
      },
    },
  });
}

function completedJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job1",
    capability_id: "ldap-signing-check",
    status: "completed",
    created_at: "2026-09-01T10:00:00Z",
    log: ["done"],
    findings: [],
    error: null,
    ...overrides,
  };
}

describe("Run", () => {
  it("prompts to seed a demo when there is no engagement", () => {
    renderWithRouter(<Run engagement={null} catalog={[]} onRan={vi.fn()} onSeedDemo={vi.fn()} />);
    expect(screen.getByRole("button", { name: /seed the offline demo/i })).toBeInTheDocument();
  });

  it("loads the capability preselected via the URL", async () => {
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: observeCap });
    renderWithRouter(
      <Run engagement={connectedEngagement()} catalog={[observeCap]} onRan={vi.fn()} onSeedDemo={vi.fn()} />,
      { route: "/run?capability=ldap-signing-check" },
    );
    expect(await screen.findByText(/reads ldap signing policy/i)).toBeInTheDocument();
    expect(vi.mocked(api.capability)).toHaveBeenCalledWith("ldap-signing-check");
  });

  it("submits an observe run without ack/force/confirm", async () => {
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: observeCap });
    const onRan = vi.fn();
    const engagement = connectedEngagement();
    vi.mocked(api.run).mockResolvedValue({
      ok: true,
      job_id: "job1",
      status: "completed",
      findings: [],
      job: completedJob(),
      engagement,
    });
    const { user } = renderWithRouter(
      <Run engagement={engagement} catalog={[observeCap]} onRan={onRan} onSeedDemo={vi.fn()} />,
      { route: "/run?capability=ldap-signing-check" },
    );
    await screen.findByText(/reads ldap signing policy/i);
    await user.click(screen.getByRole("button", { name: /run observe/i }));

    await waitFor(() =>
      expect(vi.mocked(api.run)).toHaveBeenCalledWith(
        "eng-001",
        expect.objectContaining({ capability_id: "ldap-signing-check", ack: false, force: false, confirm: "" }),
      ),
    );
    expect(onRan).toHaveBeenCalledWith(engagement);
  });

  it("gates a RED run behind typing the capability id, then submits ack+force+confirm", async () => {
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: redCap });
    vi.mocked(api.run).mockResolvedValue({
      ok: true,
      job_id: "job9",
      status: "completed",
      findings: [],
      job: completedJob({ id: "job9", capability_id: "dcsync", red: true }),
      engagement: connectedEngagement(),
    });
    const { user } = renderWithRouter(
      <Run engagement={connectedEngagement()} catalog={[redCap]} onRan={vi.fn()} onSeedDemo={vi.fn()} />,
      { route: "/run?capability=dcsync" },
    );
    // RED warning appears once the capability loads.
    expect(await screen.findByText(/this run is/i)).toBeInTheDocument();

    const submit = screen.getByRole("button", { name: /run dcsync destructive/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Type dcsync"), "dcsync");
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() =>
      expect(vi.mocked(api.run)).toHaveBeenCalledWith(
        "eng-001",
        expect.objectContaining({ capability_id: "dcsync", ack: true, force: true, confirm: "dcsync" }),
      ),
    );
  });

  it("requires and forwards scoped approval without displaying it in the job", async () => {
    const scoped = makeRedCapability({ id: "password-spray", approval: "scoped_token" });
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: scoped });
    vi.mocked(api.run).mockResolvedValue({
      ok: true,
      job_id: "job-scoped",
      status: "completed",
      findings: [],
      job: completedJob({ id: "job-scoped", capability_id: "password-spray", red: true }),
      engagement: connectedEngagement(),
    });
    const { user } = renderWithRouter(
      <Run engagement={connectedEngagement()} catalog={[scoped]} onRan={vi.fn()} onSeedDemo={vi.fn()} />,
      { route: "/run?capability=password-spray" },
    );
    await screen.findByText(/requires a scoped approval token/i);
    const submit = screen.getByRole("button", { name: /run password-spray destructive/i });
    await user.type(screen.getByPlaceholderText("Type password-spray"), "password-spray");
    await user.type(screen.getByPlaceholderText(/scoped approval token/i), "token-fixture");
    await user.type(screen.getByPlaceholderText(/approval engagement id/i), "approval-123");
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(vi.mocked(api.run)).toHaveBeenCalledWith(
      "eng-001",
      expect.objectContaining({
        approval_token: "token-fixture",
        approval_engagement_id: "approval-123",
      }),
    ));
  });

  it("blocks target-interacting capabilities for demo engagements", async () => {
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: redCap });
    const { user } = renderWithRouter(
      <Run engagement={makeEngagement({ mode: "demo" })} catalog={[redCap]} onRan={vi.fn()} onSeedDemo={vi.fn()} />,
      { route: "/run?capability=dcsync" },
    );
    expect(await screen.findByText(/offline demo engagements can run green capabilities only/i)).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Type dcsync"), "dcsync");
    expect(screen.getByRole("button", { name: /run dcsync destructive/i })).toBeDisabled();
  });

  it("requires preflight before enabling a target-interacting run", async () => {
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: observeCap });
    renderWithRouter(
      <Run engagement={makeEngagement()} catalog={[observeCap]} onRan={vi.fn()} onSeedDemo={vi.fn()} />,
      { route: "/run?capability=ldap-signing-check" },
    );
    expect(await screen.findByText(/complete a successful target preflight/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run observe/i })).toBeDisabled();
    expect(screen.getByRole("link", { name: /open connect/i })).toHaveAttribute("href", "/connect");
  });

  it("masks sensitive prompts and clears their values when switching capabilities", async () => {
    const spray = makeRedCapability({
      id: "password-spray",
      approval: "explicit",
      required_prompts: [{
        option: "-P spray_password=<candidate>",
        label: "Candidate password",
        help: "Password to test.",
        is_param: "spray_password",
        param_key: "spray_password",
      }],
    });
    vi.mocked(api.capability).mockImplementation(async (id) => ({
      ok: true,
      capability: id === spray.id ? spray : observeCap,
    }));
    const { user } = renderWithRouter(
      <Run
        engagement={connectedEngagement()}
        catalog={[spray, observeCap]}
        onRan={vi.fn()}
        onSeedDemo={vi.fn()}
      />,
      { route: "/run?capability=password-spray" },
    );
    const secret = await screen.findByPlaceholderText(/password to test/i);
    expect(secret).toHaveAttribute("type", "password");
    await user.type(secret, "NeverCarryThisAcrossRuns");
    await user.click(screen.getByRole("button", { name: /ldap-signing-check/i }));
    await waitFor(() => expect(vi.mocked(api.capability)).toHaveBeenCalledWith("ldap-signing-check"));
    await waitFor(() => {
      expect(screen.queryByDisplayValue("NeverCarryThisAcrossRuns")).not.toBeInTheDocument();
    });
  });

  it("keeps blocked capabilities visible and disables execution with the reason", async () => {
    const blocked = makeCapability({
      id: "blocked-capability",
      runnable: false,
      readiness: {
        ready: false,
        runner_available: true,
        reason: "missing declared dependencies",
        dependencies: [{ id: "fixture-tool", available: false, detail: "Install fixture-tool" }],
      },
    });
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: blocked });
    renderWithRouter(
      <Run
        engagement={connectedEngagement()}
        catalog={[observeCap, blocked]}
        onRan={vi.fn()}
        onSeedDemo={vi.fn()}
      />,
      { route: "/run?capability=blocked-capability" },
    );
    expect(await screen.findByText(/install fixture-tool/i)).toBeInTheDocument();
    expect(screen.getByText(/blocked locally/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run observe/i })).toBeDisabled();
  });

  it("renders typed prompts and preserves secret whitespace exactly", async () => {
    const typed = makeCapability({
      id: "typed-capability",
      required_prompts: [
        {
          option: "--operation",
          key: "operation",
          label: "Operation",
          help: "Choose an operation.",
          input_type: "select",
          choices: ["one", "two"],
          required: true,
          source: "operator",
        },
        {
          option: "--enabled",
          key: "enabled",
          label: "Enabled",
          help: "Choose whether to enable it.",
          input_type: "boolean",
          required: true,
          source: "operator",
        },
        {
          option: "--secret",
          key: "secret",
          label: "Secret",
          help: "Enter the exact secret.",
          input_type: "secret",
          trim: false,
          required: true,
          source: "operator",
        },
      ],
    });
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: typed });
    vi.mocked(api.run).mockResolvedValue({
      ok: true,
      job_id: "typed-job",
      status: "completed",
      findings: [],
      job: completedJob({ id: "typed-job", capability_id: typed.id }),
      engagement: connectedEngagement(),
    });
    const { user } = renderWithRouter(
      <Run engagement={connectedEngagement()} catalog={[typed]} onRan={vi.fn()} onSeedDemo={vi.fn()} />,
      { route: "/run?capability=typed-capability" },
    );
    const submit = await screen.findByRole("button", { name: /run observe/i });
    expect(submit).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: /operation/i }), "two");
    await user.selectOptions(screen.getByRole("combobox", { name: /enabled/i }), "false");
    await user.type(screen.getByPlaceholderText("Enter the exact secret."), "  exact value  ");
    expect(submit).toBeEnabled();
    await user.click(submit);
    await waitFor(() => expect(vi.mocked(api.run)).toHaveBeenCalledWith(
      "eng-001",
      expect.objectContaining({
        options: { operation: "two", enabled: "false", secret: "  exact value  " },
      }),
    ));
  });

  it("reattaches to a running job from the URL and polls it", async () => {
    const running = completedJob({ id: "job-live", status: "running", log: ["still running"] });
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: observeCap });
    vi.mocked(api.job).mockResolvedValue({ ok: true, job: completedJob({ id: "job-live" }) });
    vi.mocked(api.engagement).mockResolvedValue({ ok: true, engagement: connectedEngagement() });
    renderWithRouter(
      <Run
        engagement={makeEngagement({ jobs: [running] })}
        catalog={[observeCap]}
        onRan={vi.fn()}
        onSeedDemo={vi.fn()}
      />,
      { route: "/run?job=job-live" },
    );
    expect(await screen.findByText("still running")).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(api.job)).toHaveBeenCalledWith("eng-001", "job-live"));
  });

  it("polls a backgrounded run until it reaches a terminal state", async () => {
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: observeCap });
    const onRan = vi.fn();
    const freshEngagement = makeEngagement({ updated_at: "2026-09-01T11:00:00Z" });
    vi.mocked(api.run).mockResolvedValue({
      ok: true,
      job_id: "job1",
      status: "running",
      findings: [],
      job: completedJob({ status: "running", log: ["queued ldap-signing-check"] }),
      engagement: makeEngagement(),
    });
    vi.mocked(api.job).mockResolvedValue({ ok: true, job: completedJob({ status: "completed" }) });
    vi.mocked(api.engagement).mockResolvedValue({ ok: true, engagement: freshEngagement });

    const { user } = renderWithRouter(
      <Run engagement={connectedEngagement()} catalog={[observeCap]} onRan={onRan} onSeedDemo={vi.fn()} />,
      { route: "/run?capability=ldap-signing-check" },
    );
    await screen.findByText(/reads ldap signing policy/i);
    await user.click(screen.getByRole("button", { name: /run observe/i }));

    await waitFor(() => expect(vi.mocked(api.job)).toHaveBeenCalledWith("eng-001", "job1"));
    await waitFor(() => expect(onRan).toHaveBeenCalledWith(freshEngagement));
  });
});
