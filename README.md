# ADAssassin

**Authorized internal red-team use only. Proprietary.**

Vendor-grade web console for Active Directory assessments. ADAssassin does not
reimplement attack capabilities. It wraps the pinned ADAF-ATTACK 0.10.1 engine
and presents all **92** catalogued capabilities through a guided GUI.

> Written authorization is required before any live target work.
> Availability of this repository is not authorization.

## What this is

| Layer | Role |
| --- | --- |
| ADAssassin | Local web console, engagements, demo workspace, catalog UX |
| ADAF-ATTACK 0.10.1 | Capability registry, runners, session, vault, rollback |

The default operator path is **Guided**, not a 92-button toolbox. Advanced mode
exposes the full catalog with risk, approval, and rollback metadata.

## Quick start

Python 3.11–3.14.

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
python -m pip install -e .
adassassin
```

The launcher binds `127.0.0.1:8745` and opens a browser.

```bash
adassassin --no-browser --port 8745
```

First-run still offers an offline demo engagement. Live connect is available
immediately; destructive actions remain gated by the engine.

## Engine pin

```
adaf-attack==0.10.1
commit fdb60b90b910ba3dcbd582e2c72ce48189191214
https://github.com/rikterskale/ADAF-ATTACK
```

If the engine cannot be imported, the console still serves the static catalog
and demo workspace. Capability execution requires the engine.

## Console map

- **Overview** — engine status, engagement pulse, recommended next step
- **Guided** — novice path: demo, connect later, observe, recommend
- **Catalog** — all 92 capabilities with lane, risk, approval
- **Engagements** — create, resume, demo seed
- Findings / Vault / Rollback / Report — Phase 1+ shells

## Safety

- Localhost bind by default
- Authorized-use banner in the chrome
- RED capabilities require typed confirmation once execution lands
- Rollback and vault stay visible even when empty
- No campaign auto-run

See [AUTHORIZED_USE.md](AUTHORIZED_USE.md) and [SECURITY.md](SECURITY.md).

## Layout

```
src/adassassin/     Python package and API
web/                React + Vite console source
src/adassassin/webapp/   Built static UI shipped with the package
```

Rebuild the UI after frontend changes:

```bash
cd web && npm install && npm run build
```

## License

Proprietary. See [LICENSE](LICENSE).
