import { useState } from "react";
import { copyText } from "../clipboard";

export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    const ok = await copyText(value);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button className="btn ghost" type="button" onClick={() => void copy()} disabled={!value}>
      {copied ? "Copied" : label}
    </button>
  );
}
