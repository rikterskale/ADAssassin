import { CURRENT_ENGAGEMENT_KEY, readCurrentEngagement, writeCurrentEngagement } from "./storage";

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
});
