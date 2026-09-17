import type { AuthenticationFilter, Capability } from "./types";

export function supportsAnonymous(capability: Capability): boolean {
  return capability.auth_modes.some((mode) => mode.trim().toLowerCase() === "anonymous");
}

export function authenticationClass(capability: Capability): Exclude<AuthenticationFilter, "all"> {
  if (capability.lane === "green" || capability.environment === "offline") return "offline";
  if (supportsAnonymous(capability)) return "anonymous";
  return "credentialed";
}

export function authenticationLabel(capability: Capability): string {
  const kind = authenticationClass(capability);
  if (kind === "offline") return "Offline — no credentials";
  if (kind === "anonymous") return "Anonymous — no domain credentials";
  return "Credentialed / other engine authentication";
}
