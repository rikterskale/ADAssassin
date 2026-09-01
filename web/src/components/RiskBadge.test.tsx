import { render, screen } from "@testing-library/react";
import { RiskBadge } from "./RiskBadge";

describe("RiskBadge", () => {
  it("renders the risk label inside a lane-colored badge", () => {
    render(<RiskBadge lane="red" risk="destructive" />);
    const badge = screen.getByText("destructive");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("badge", "red");
    expect(badge.tagName).toBe("SPAN");
  });

  it("maps each lane to its class", () => {
    const { rerender } = render(<RiskBadge lane="green" risk="observe" />);
    expect(screen.getByText("observe")).toHaveClass("badge", "green");
    rerender(<RiskBadge lane="yellow" risk="observe" />);
    expect(screen.getByText("observe")).toHaveClass("badge", "yellow");
  });
});
