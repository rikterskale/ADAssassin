import type { Lane } from "../types";

export function RiskBadge({ lane, risk }: { lane: Lane; risk: string }) {
  return <span className={`badge ${lane}`}>{risk}</span>;
}
