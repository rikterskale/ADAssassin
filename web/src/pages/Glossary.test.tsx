import { render, screen } from "@testing-library/react";
import { Glossary } from "./Glossary";
import { api } from "../api";

vi.mock("../api", () => ({ api: { glossary: vi.fn() } }));

describe("Glossary", () => {
  it("loads glossary items and marks the step as seen", async () => {
    const onSeen = vi.fn();
    vi.mocked(api.glossary).mockResolvedValue({
      ok: true,
      source: "engine",
      items: [
        { term: "kerberoast", definition: "Request service tickets to crack offline." },
        { term: "dcsync", definition: "Replicate password material." },
      ],
    });
    render(<Glossary onSeen={onSeen} />);
    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("kerberoast")).toBeInTheDocument();
    expect(screen.getByText(/replicate password material/i)).toBeInTheDocument();
  });

  it("shows the glossary source", async () => {
    vi.mocked(api.glossary).mockResolvedValue({ ok: true, source: "engine", items: [] });
    render(<Glossary onSeen={vi.fn()} />);
    expect(await screen.findByText(/source: engine/i)).toBeInTheDocument();
  });
});
