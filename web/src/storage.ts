export const CURRENT_ENGAGEMENT_KEY = "adassassin.currentEngagement";
export const ONBOARDING_SEEN_KEY = "adassassin.onboardingSeen";

export function readCurrentEngagement(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_ENGAGEMENT_KEY);
  } catch {
    return null;
  }
}

export function readOnboardingSeen(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeOnboardingSeen(): void {
  try {
    window.localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
  } catch {
    /* private mode / quota — onboarding remains safely repeatable */
  }
}

export function writeCurrentEngagement(id: string | null): void {
  try {
    if (!id) window.localStorage.removeItem(CURRENT_ENGAGEMENT_KEY);
    else window.localStorage.setItem(CURRENT_ENGAGEMENT_KEY, id);
  } catch {
    /* private mode / quota — chrome still works without persistence */
  }
}
