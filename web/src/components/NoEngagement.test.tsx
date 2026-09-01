import { screen } from "@testing-library/react";
import { NoEngagement } from "./NoEngagement";
import { renderWithRouter } from "../test/utils";

describe("NoEngagement", () => {
  it("invokes onSeedDemo when the seed button is clicked", async () => {
    const onSeedDemo = vi.fn();
    const { user } = renderWithRouter(<NoEngagement onSeedDemo={onSeedDemo} />);
    await user.click(screen.getByRole("button", { name: /seed the offline demo/i }));
    expect(onSeedDemo).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows a seeding label while seeding", () => {
    renderWithRouter(<NoEngagement onSeedDemo={vi.fn()} seeding />);
    const button = screen.getByRole("button", { name: /seeding/i });
    expect(button).toBeDisabled();
  });

  it("offers a link to create an engagement", () => {
    renderWithRouter(<NoEngagement onSeedDemo={vi.fn()} />);
    expect(screen.getByRole("link", { name: /create an engagement/i })).toHaveAttribute(
      "href",
      "/engagements",
    );
  });

  it("states that no domain controller is contacted", () => {
    renderWithRouter(<NoEngagement onSeedDemo={vi.fn()} />);
    expect(screen.getByText(/no domain controller contacted/i)).toBeInTheDocument();
  });
});
