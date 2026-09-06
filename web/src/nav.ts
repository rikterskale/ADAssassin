export type NavItem = { to: string; label: string; hint: string };
export type NavGroup = { heading: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: "Start",
    items: [
      { to: "/start", label: "Start Here", hint: "Complete guide" },
      { to: "/", label: "Overview", hint: "Home" },
      { to: "/guided", label: "Guided", hint: "Step by step" },
    ],
  },
  {
    heading: "Assess",
    items: [
      { to: "/engagements", label: "Engagements", hint: "Workspaces" },
      { to: "/connect", label: "Connect", hint: "Target preflight" },
      { to: "/run", label: "Run", hint: "Run a capability" },
      { to: "/findings", label: "Findings", hint: "Results" },
    ],
  },
  {
    heading: "Reference",
    items: [
      { to: "/catalog", label: "Catalog", hint: "All capabilities" },
      { to: "/glossary", label: "Glossary", hint: "Plain-English terms" },
    ],
  },
  {
    heading: "Advanced",
    items: [
      { to: "/vault", label: "Vault", hint: "Captured secrets" },
      { to: "/rollback", label: "Rollback", hint: "Undo changes" },
      { to: "/report", label: "Report", hint: "Export & closeout" },
    ],
  },
];
