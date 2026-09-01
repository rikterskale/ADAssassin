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

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e .
adassassin
```

Binds `127.0.0.1:8745`. Doctor and demo never contact a domain controller.

```bash
cd web && npm install && npm run build   # optional React rebuild
```

## Phase 6 console

- Overview doctor checks (Python, catalog, engine, bind)
- Guided checklist through connect, observe, and typed-confirm RED
- Catalog lanes, inspector prompts, and Run for observe + RED
- Connect preflight (engine live-ad doctor); passwords stay in memory
- Observe runs plus typed-confirm RED (capability id + ack/force)
- Findings pane: severity groups, explain, remediation checklist, status
- Vault metadata inventory with single-item TTL unmask + audit
- Rollback preview (offline) and typed-YES apply
- Report Markdown/HTML export with closeout checklist
- Glossary from the engine when present
- Offline demo findings

## Engine pin

`adaf-attack==0.10.1` @ `fdb60b90b910ba3dcbd582e2c72ce48189191214`

See [ROADMAP.md](ROADMAP.md), [AUTHORIZED_USE.md](AUTHORIZED_USE.md), and [SECURITY.md](SECURITY.md).

## License

Proprietary. See [LICENSE](LICENSE).
