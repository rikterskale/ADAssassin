# ADAssassin

**Authorized internal red-team use only. Proprietary.**

Vendor-grade web console for Active Directory assessments. ADAssassin wraps
pinned ADAF-ATTACK 0.10.1 and presents all 92 catalogued capabilities through
a guided GUI.

> **New operator? Start with the comprehensive
> [START HERE guide](docs/START_HERE.md).** It covers installation, the complete
> zero-contact demo, authorized live work, all console surfaces, every CLI and
> runtime setting, all 30 local API operations, rollback, reporting, and
> closeout without hiding any capability.

> Written authorization is required before any live target work.
> Availability of this repository is not authorization.

Current slice: **1.0.0** (production operator console). Roadmap phases 0–6 are
complete; the GUI is the vendor-grade operator chrome on top of that.

Build order and acceptance criteria: **[ROADMAP.md](ROADMAP.md)**.

Install on Windows, Kali, or macOS (full steps + troubleshooting):
**[docs/INSTALLATION.md](docs/INSTALLATION.md)**.

Complete operator path (install → demo → connect → observe → RED → closeout):
**[docs/START_HERE.md](docs/START_HERE.md)**. The compact field checklist is
**[docs/OPERATOR_RUNBOOK.md](docs/OPERATOR_RUNBOOK.md)**.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install .
adassassin
```

Binds `127.0.0.1:8745`. Doctor and demo never contact a domain controller.
If anything fails, use the platform sections and verbose fix actions in
[docs/INSTALLATION.md](docs/INSTALLATION.md).

```bash
npm --prefix web ci && npm --prefix web run build          # optional React rebuild
npm --prefix web test                                    # frontend suite (Vitest + RTL)
npm --prefix web exec -- playwright install chromium && npm --prefix web run e2e
python -m pytest                                         # backend suite
```

## Console

- Overview doctor checks (Python, catalog, engine, bind)
- Built-in Start Here guide with every console surface and launch/runtime command
- Guided checklist through connect, observe, and typed-confirm RED
- Catalog lane and authentication filters, including prominent Offline and Anonymous—no-credentials paths
- Connect preflight with an explicit anonymous/authenticated choice and a bound LDAP/StartTLS/LDAPS endpoint; passwords stay in memory
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
- Operator chrome: Ctrl+K command palette, sticky engagement switcher, labeled
  forms, toasts, copy controls, finding/glossary search, and mobile navigation
- Always-visible engagement/target context, explicit refresh and stale-data
  recovery, preflight-aware run controls, and a final execution review
- Owner-only POSIX permissions for app-owned engagement metadata, reports, and
  synthetic demo keys (`0700` directories / `0600` files)

## Production verification

From an activated development environment:

```bash
python -m pytest -q
python -m ruff check src tests
npm --prefix web test
npm --prefix web run typecheck:test
npm --prefix web run build
npm --prefix web run e2e
python -m pip wheel . --no-deps --wheel-dir /tmp/adassassin-wheel
```

The E2E configuration uses the repository `.venv` when present, falls back to
the platform Python command, and accepts `ADASSASSIN_E2E_PYTHON` for an explicit
interpreter path.

## Engine pin

`adaf-attack==0.10.1` @ `df92b617ad7d2ca3603408d59fcef50338e50bab`

See [docs/START_HERE.md](docs/START_HERE.md), [ROADMAP.md](ROADMAP.md), [docs/INSTALLATION.md](docs/INSTALLATION.md),
[docs/OPERATOR_RUNBOOK.md](docs/OPERATOR_RUNBOOK.md),
[AUTHORIZED_USE.md](AUTHORIZED_USE.md), and [SECURITY.md](SECURITY.md).

## License

Proprietary. See [LICENSE](LICENSE).
