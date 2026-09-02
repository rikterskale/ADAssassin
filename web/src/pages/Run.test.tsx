import { screen, waitFor } from "@testing-library/react";
import { Run } from "./Run";
import { api } from "../api";
import { makeCapability, makeEngagement, makeRedCapability, renderWithRouter } from "../test/utils";

vi.mock("../api", () => ({
  api: { capability: vi.fn(), run: vi.fn(), job: vi.fn(), engagement: vi.fn() },
}));

const observeCap = makeCapability({ id: "ldap-signing-check", plain: "Reads LDAP signing policy.", required_prompts: [] });
const redCap = makeRedCapability({ id: "dcsync", plain: "Pulls password material.", risk_label: "destructive" });

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
      <Run engagement={makeEngagement()} catalog={[observeCap]} onRan={vi.fn()} onSeedDemo={vi.fn()} />,
      { route: "/run?capability=ldap-signing-check" },
    );
    expect(await screen.findByText(/reads ldap signing policy/i)).toBeInTheDocument();
    expect(vi.mocked(api.capability)).toHaveBeenCalledWith("ldap-signing-check");
  });

  it("submits an observe run without ack/force/confirm", async () => {
    vi.mocked(api.capability).mockResolvedValue({ ok: true, capability: observeCap });
    const onRan = vi.fn();
    const engagement = makeEngagement();
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
      engagement: makeEngagement(),
    });
    const { user } = renderWithRouter(
      <Run engagement={makeEngagement()} catalog={[redCap]} onRan={vi.fn()} onSeedDemo={vi.fn()} />,
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
      engagement: makeEngagement(),
    });
    const { user } = renderWithRouter(
      <Run engagement={makeEngagement()} catalog={[scoped]} onRan={vi.fn()} onSeedDemo={vi.fn()} />,
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
      <Run engagement={makeEngagement()} catalog={[observeCap]} onRan={onRan} onSeedDemo={vi.fn()} />,
      { route: "/run?capability=ldap-signing-check" },
    );
    await screen.findByText(/reads ldap signing policy/i);
    await user.click(screen.getByRole("button", { name: /run observe/i }));

    await waitFor(() => expect(vi.mocked(api.job)).toHaveBeenCalledWith("eng-001", "job1"));
    await waitFor(() => expect(onRan).toHaveBeenCalledWith(freshEngagement));
  });
});
