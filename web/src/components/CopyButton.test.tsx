import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyButton } from "./CopyButton";
import { copyText } from "../clipboard";

vi.mock("../clipboard", () => ({
  copyText: vi.fn(),
}));

describe("CopyButton", () => {
  it("copies the value and confirms", async () => {
    vi.mocked(copyText).mockResolvedValue(true);
    const user = userEvent.setup();
    render(<CopyButton value="ldap-signing-check" label="Copy id" />);
    await user.click(screen.getByRole("button", { name: /copy id/i }));
    expect(copyText).toHaveBeenCalledWith("ldap-signing-check");
    expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
  });

  it("is disabled when there is nothing to copy", () => {
    render(<CopyButton value="" />);
    expect(screen.getByRole("button", { name: /copy/i })).toBeDisabled();
  });
});
