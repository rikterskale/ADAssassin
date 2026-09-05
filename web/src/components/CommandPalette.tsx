import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { NAV_GROUPS } from "../nav";
import type { Capability, Engagement } from "../types";

type PaletteItem = {
  id: string;
  group: string;
  label: string;
  hint: string;
  run: () => void;
};

export function CommandPalette({
  open,
  onClose,
  catalog,
  engagements,
  onSelectEngagement,
}: {
  open: boolean;
  onClose: () => void;
  catalog: Capability[];
  engagements: Engagement[];
  onSelectEngagement: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => {
    const pages: PaletteItem[] = NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        id: `page:${item.to}`,
        group: group.heading,
        label: item.label,
        hint: item.hint,
        run: () => navigate(item.to),
      })),
    );
    const workspaces: PaletteItem[] = engagements.map((item) => ({
      id: `eng:${item.id}`,
      group: "Engagements",
      label: item.name,
      hint: `${item.mode} · ${item.findings.length} findings`,
      run: () => onSelectEngagement(item.id),
    }));
    const caps: PaletteItem[] = catalog.map((item) => ({
      id: `cap:${item.id}`,
      group: "Capabilities",
      label: item.id,
      hint: item.plain ?? item.summary,
      run: () => navigate(`/run?capability=${encodeURIComponent(item.id)}`),
    }));
    const q = query.trim().toLowerCase();
    const pool = [...pages, ...workspaces, ...caps];
    const filtered = q
      ? pool.filter((item) => `${item.group} ${item.label} ${item.hint}`.toLowerCase().includes(q))
      : pool;
    return filtered.slice(0, 40);
  }, [catalog, engagements, navigate, onSelectEngagement, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(handle);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function choose(item: PaletteItem) {
    item.run();
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(items.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) choose(item);
    }
  }

  let lastGroup = "";

  return (
    <div className="palette-backdrop" onClick={onClose} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-label="Jump to"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Jump to a page, engagement, or capability"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Jump to"
        />
        <div className="palette-list">
          {items.length === 0 ? (
            <div className="empty">Nothing matches.</div>
          ) : (
            items.map((item, index) => {
              const heading = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {heading && <div className="palette-kicker">{heading}</div>}
                  <button
                    type="button"
                    className={`palette-item${index === active ? " active" : ""}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(item)}
                  >
                    <span className="mono">{item.label}</span>
                    <span className="muted">{item.hint}</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="palette-foot">
          <span>↑↓ to move · Enter to open · Esc to close</span>
          <span>{items.length} matches</span>
        </div>
      </div>
    </div>
  );
}
