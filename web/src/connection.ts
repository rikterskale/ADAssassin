import type { Engagement } from "./types";

export function isConnectReady(engagement: Engagement | null | undefined): boolean {
  const connect = engagement?.connect;
  if (!connect?.preflight_ok || connect.status && connect.status !== "ready") return false;
  if (!(connect.preflight.ready ?? connect.preflight_ok)) return false;
  if (!connect.expires_at) return false;
  const expires = Date.parse(connect.expires_at);
  return Number.isFinite(expires) && expires > Date.now();
}

export function connectStatusMessage(engagement: Engagement | null | undefined): string {
  const connect = engagement?.connect;
  if (!connect) return "No target preflight yet.";
  if (connect.invalidated_reason) return connect.invalidated_reason;
  if (connect.expires_at && Date.parse(connect.expires_at) <= Date.now()) {
    return "Preflight expired. Run Connect again before target-interacting work.";
  }
  if (!connect.preflight.ready) return "Preflight is blocked. Resolve its checks and run it again.";
  return isConnectReady(engagement) ? "Preflight ready." : "Reconnect required.";
}
