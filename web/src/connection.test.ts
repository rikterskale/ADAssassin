import { connectStatusMessage, isConnectReady } from "./connection";
import { makeEngagement } from "./test/utils";

function connection(expiresAt: string) {
  return makeEngagement({
    connect: {
      domain: "corp.local",
      dc: "dc01.corp.local",
      username: "operator",
      auth_mode: "authenticated",
      credential_validation: { required: true, attempted: true, valid: true, method: "password" },
      secret_ref: "memory:eng-001:bind",
      has_secret: true,
      preflight_ok: true,
      status: "ready",
      checked_at: "2026-09-05T12:00:00Z",
      expires_at: expiresAt,
      invalidated_reason: null,
      target: { domain: "corp.local", dc: "dc01.corp.local" },
      preflight: {
        ok: true,
        ready: true,
        checks: [],
        blocking_checks: [],
        advisory_checks: [],
        target_contacted: true,
        credential_validation: { required: true, attempted: true, valid: true, method: "password" },
      },
    },
  });
}

describe("connection status", () => {
  it("accepts only an unexpired ready preflight", () => {
    expect(isConnectReady(connection("2099-09-05T12:15:00Z"))).toBe(true);
    expect(isConnectReady(connection("2020-09-05T12:15:00Z"))).toBe(false);
  });

  it("fails closed when authenticated credentials were not validated", () => {
    const engagement = connection("2099-09-05T12:15:00Z");
    engagement.connect!.credential_validation = {
      required: true,
      attempted: true,
      valid: false,
      method: "password",
    };
    expect(isConnectReady(engagement)).toBe(false);
  });

  it("explains expiry and explicit invalidation", () => {
    expect(connectStatusMessage(connection("2020-09-05T12:15:00Z"))).toMatch(/expired/i);
    const invalidated = connection("2099-09-05T12:15:00Z");
    invalidated.connect!.invalidated_reason = "The console restarted. Run Connect again.";
    invalidated.connect!.preflight_ok = false;
    expect(connectStatusMessage(invalidated)).toMatch(/console restarted/i);
  });
});
