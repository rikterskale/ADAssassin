import { Link } from "react-router-dom";

export function NoEngagement({
  onSeedDemo,
  seeding = false,
}: {
  onSeedDemo: () => void;
  seeding?: boolean;
}) {
  return (
    <div className="empty">
      <p style={{ marginTop: 0 }}>
        No engagement yet. Start with the safe offline demo — it loads example findings, a vault, and a
        rollback entry, with <strong>no domain controller contacted</strong>.
      </p>
      <div className="actions">
        <button className="btn primary" type="button" onClick={onSeedDemo} disabled={seeding}>
          {seeding ? "Seeding…" : "Seed the offline demo"}
        </button>
        <Link className="btn ghost" to="/engagements">
          Create an engagement
        </Link>
      </div>
    </div>
  );
}
