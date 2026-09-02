# ADAssassin

**Authorized internal red-team use only. Proprietary.**

Vendor-grade web console for Active Directory assessments. ADAssassin wraps
pinned ADAF-ATTACK 0.10.1 and presents all 92 catalogued capabilities through
a guided GUI.

> Written authorization is required before any live target work.
> Availability of this repository is not authorization.

Current slice: **Phase 6** (report export + closeout). Roadmap phases 0–6 are
complete for the initial console build.

Build order and acceptance criteria: **[ROADMAP.md](ROADMAP.md)**.

Install on Windows, Kali, or macOS (full steps + troubleshooting):
**[docs/INSTALLATION.md](docs/INSTALLATION.md)**.

Operator path (doctor → demo → connect → observe → RED → report):
**[docs/OPERATOR_RUNBOOK.md](docs/OPERATOR_RUNBOOK.md)**.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install -e .
adassassin
```

Binds `127.0.0.1:8745`. Doctor and demo never contact a domain controller.
If anything fails, use the platform sections and verbose fix actions in
[docs/INSTALLATION.md](docs/INSTALLATION.md).

```bash
cd web && npm install && npm run build   # optional React rebuild
cd web && npm test                       # frontend suite (Vitest + RTL)
cd web && npx playwright install chromium && npm run e2e   # user-journey E2E
python -m pytest                         # backend suite (or rely on CI)
```

## Phase 6 console

- Overview doctor checks (Python, catalog, engine, bind)
- Guided checklist through connect, observe, and typed-confirm RED
- Catalog lanes, inspector prompts, and Run for observe + RED
- Connect preflight (engine live-ad doctor); passwords stay in memory
- Observe runs plus typed-confirm RED (capability id + ack/force)
- Findings pane: severity groups, explain, remediation checklist, status
- Vault metadata inventory with single-item TTL unmask + audit
- Restart-safe vault interoperability through the engine's operator-supplied
  `ADAF_SESSION_VAULT_KEY`
- Rollback preview (offline) and typed-YES apply
- Report Markdown/HTML export with closeout checklist
- Glossary from the engine when present
- Offline demo findings
- Permanent server-side demo isolation, scoped approval-token support, local
  capability readiness, and interrupted-job recovery

## Engine pin

`adaf-attack==0.10.1` @ `fdb60b90b910ba3dcbd582e2c72ce48189191214`

See [ROADMAP.md](ROADMAP.md), [docs/INSTALLATION.md](docs/INSTALLATION.md),
[docs/OPERATOR_RUNBOOK.md](docs/OPERATOR_RUNBOOK.md),
[AUTHORIZED_USE.md](AUTHORIZED_USE.md), and [SECURITY.md](SECURITY.md).

## License

Proprietary. See [LICENSE](LICENSE).
