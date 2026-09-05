import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Field, SecretField } from "./Field";

describe("Field", () => {
  it("renders a visible label around its control", () => {
    render(
      <Field label="Domain" hint="FQDN of the authorized forest.">
        <input placeholder="Domain (e.g. corp.local)" />
      </Field>,
    );
    expect(screen.getByText("Domain")).toBeInTheDocument();
    expect(screen.getByText(/fqdn of the authorized forest/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/domain \(e\.g\./i)).toBeInTheDocument();
  });
});

describe("SecretField", () => {
  it("starts hidden and can be revealed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SecretField
        label="Password"
        value="s3cret"
        onChange={onChange}
        placeholder="Password (optional, not saved to disk)"
      />,
    );
    const input = screen.getByPlaceholderText(/password \(optional/i);
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: /^show$/i }));
    expect(input).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: /^hide$/i }));
    expect(input).toHaveAttribute("type", "password");
  });
});
