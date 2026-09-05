import { copyText } from "./clipboard";

describe("copyText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes to the clipboard API when present", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("ldap-signing-check")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("ldap-signing-check");
  });

  it("returns false when the clipboard API is missing", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyText("x")).resolves.toBe(false);
  });
});
