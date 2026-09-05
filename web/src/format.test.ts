import { formatWhen, secondsLeft } from "./format";

describe("formatWhen", () => {
  it("returns an em dash for empty values", () => {
    expect(formatWhen(null)).toBe("—");
    expect(formatWhen(undefined)).toBe("—");
    expect(formatWhen("")).toBe("—");
  });

  it("passes through unparseable strings", () => {
    expect(formatWhen("not-a-date")).toBe("not-a-date");
  });

  it("formats a valid ISO timestamp", () => {
    const rendered = formatWhen("2026-09-01T10:05:00Z");
    expect(rendered).toMatch(/2026/);
    expect(rendered).not.toBe("2026-09-01T10:05:00Z");
  });
});

describe("secondsLeft", () => {
  it("returns remaining whole seconds and never goes negative", () => {
    const now = Date.parse("2026-09-01T10:00:00Z");
    expect(secondsLeft("2026-09-01T10:00:10Z", now)).toBe(10);
    expect(secondsLeft("2026-09-01T09:59:00Z", now)).toBe(0);
    expect(secondsLeft("nope", now)).toBe(0);
  });
});
