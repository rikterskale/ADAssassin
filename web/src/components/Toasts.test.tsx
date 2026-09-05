import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toasts";

function Probe() {
  const notify = useToast();
  return (
    <button type="button" onClick={() => notify("Offline demo ready")}>
      go
    </button>
  );
}

describe("Toasts", () => {
  it("announces a notification in a live region", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(screen.getByRole("status")).toHaveTextContent("Offline demo ready");
  });
});
