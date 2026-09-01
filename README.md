# ADAssassin

**Authorized internal red-team use only. Proprietary.**

Vendor-grade web console for Active Directory assessments. ADAssassin wraps
pinned ADAF-ATTACK 0.10.1 and presents all 92 catalogued capabilities through
a guided GUI.

> Written authorization is required before any live target work.
> Availability of this repository is not authorization.

Current slice: **Phase 1** (doctor, guided checklist, catalog inspector,
glossary, demo workspace). Capability execution is not enabled yet.

Build order and acceptance criteria: **[ROADMAP.md](ROADMAP.md)**. Next slice is Phase 2.

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

## Phase 1 console

- Overview doctor checks (Python, catalog, engine, bind)
- Guided checklist with persisted marks
- Catalog lanes plus inspector (approval / rollback / tools)
- Glossary from the engine when present
- Offline demo findings

## Engine pin

`adaf-attack==0.10.1` @ `fdb60b90b910ba3dcbd582e2c72ce48189191214`

See [ROADMAP.md](ROADMAP.md), [AUTHORIZED_USE.md](AUTHORIZED_USE.md), and [SECURITY.md](SECURITY.md).

## License

Proprietary. See [LICENSE](LICENSE).
