import {
  CURRENT_ENGAGEMENT_KEY,
  ONBOARDING_SEEN_KEY,
  readCurrentEngagement,
  readOnboardingSeen,
  writeCurrentEngagement,
  writeOnboardingSeen,
} from "./storage";

describe("engagement storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips the current engagement id", () => {
    expect(readCurrentEngagement()).toBeNull();
    writeCurrentEngagement("eng-42");
    expect(readCurrentEngagement()).toBe("eng-42");
    expect(window.localStorage.getItem(CURRENT_ENGAGEMENT_KEY)).toBe("eng-42");
  });

  it("clears the stored id when written null", () => {
    writeCurrentEngagement("eng-42");
    writeCurrentEngagement(null);
    expect(readCurrentEngagement()).toBeNull();
  });

  it("records first-run onboarding after the operator reaches Start Here", () => {
    expect(readOnboardingSeen()).toBe(false);
    writeOnboardingSeen();
    expect(readOnboardingSeen()).toBe(true);
    expect(window.localStorage.getItem(ONBOARDING_SEEN_KEY)).toBe("1");
  });
});
