export const CURRENT_ENGAGEMENT_KEY = "adassassin.currentEngagement";

export function readCurrentEngagement(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_ENGAGEMENT_KEY);
  } catch {
    return null;
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
