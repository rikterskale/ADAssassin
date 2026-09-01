# ADAssassin

**Authorized internal red-team use only. Proprietary.**

Vendor-grade web console for Active Directory assessments. ADAssassin wraps
pinned ADAF-ATTACK 0.10.1 and presents all 92 catalogued capabilities through
a guided GUI.

> Written authorization is required before any live target work.
> Availability of this repository is not authorization.

Current slice: **Phase 2** (live connect / preflight, green/yellow observe
runs, job log, findings attach). Red execution is Phase 5.

Build order and acceptance criteria: **[ROADMAP.md](ROADMAP.md)**. Next slice is Phase 3.

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

## Phase 2 console

- Overview doctor checks (Python, catalog, engine, bind)
- Guided checklist through connect + observe run
- Catalog lanes, inspector prompts, and **Run** for observe caps
- Connect preflight (engine live-ad doctor); passwords stay in memory
- Observe-only runs with job log and findings attach
- Glossary from the engine when present
- Offline demo findings

## Engine pin

`adaf-attack==0.10.1` @ `fdb60b90b910ba3dcbd582e2c72ce48189191214`

See [ROADMAP.md](ROADMAP.md), [AUTHORIZED_USE.md](AUTHORIZED_USE.md), and [SECURITY.md](SECURITY.md).

## License

Proprietary. See [LICENSE](LICENSE).
