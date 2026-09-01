# ADAssassin roadmap

**Authorized internal red-team use only.** This file is the source of truth
for build order. Update it when a phase lands or a decision changes.

Product: a 100% GUI web console for novice authorized operators. It wraps
every capability in `docs/CAPABILITY_CATALOG.md` from
[rikterskale/ADAF-ATTACK](https://github.com/rikterskale/ADAF-ATTACK)
(92 at pin 0.10.1). It does not reimplement those capabilities.

Repo: https://github.com/rikterskale/ADAssassin
Current slice: **Phase 2 complete. Next work is Phase 3.**
Package version at this writing: `0.3.0`.

---

## Locked decisions

Do not reopen these unless the owner changes them in this file.

| Decision | Choice |
| --- | --- |
| Engine coupling | Dependency + pinned version. Do **not** vendor a snapshot of ADAF-ATTACK. |
| Engine pin | `adaf-attack==0.10.1` at commit `fdb60b90b910ba3dcbd582e2c72ce48189191214` |
| Frontend | React + Vite. Vendor-grade console, not HTMX-in-Python. |
| First-run lock | **No** authorization checkbox gate. Banner only. |
| Repo posture | Public, with a strong authorized-use banner. |
| Bind | Localhost only by default (`127.0.0.1:8745`). |
| Capability implementation | Wrap the engine registry. Do not rewrite 92 tools. |
| Safety | Preserve engine `SafetyProfile`, force/ack, scoped tokens, rollback. |
| UX | Engagement-first and Guided mode. Do not greet the user with a raw 92-row tool list. |
| Demo | Offline fixtures. Doctor and demo must never contact a DC. |

---

## Architecture

```
browser  →  FastAPI (adassassin)  →  adaf-attack (pinned)
                │
                ├─ catalog.py     live registry, else pinned markdown
                ├─ doctor.py      offline readiness
                ├─ guide.py       next-step checklist + glossary
                ├─ targets.py     connect / live-ad preflight
                ├─ runner.py      observe-only capability runs
                ├─ secrets.py     in-memory bind secrets
                ├─ engagements.py disk sessions under ~/.adassassin
                └─ web/           React source
                   webapp/        shipped static fallback (pip install)
```

Engine already has what we wrap: capability registry, SafetyProfile,
approval/rollback, session/vault, `next-actions`, `novice.py` plain language,
and a large Textual TUI. Approach is wrap-not-rewrite.

Catalog source order:

1. Live `adaf_attack.core.registry` if the package imported.
2. Bundled `src/adassassin/data/catalog.json` if present.
3. Pinned markdown:
   `https://raw.githubusercontent.com/rikterskale/ADAF-ATTACK/<ENGINE_COMMIT>/docs/CAPABILITY_CATALOG.md`

Lanes (console risk bands):

- **green** — `environment == offline` and `risk == observe`
- **red** — `risk` in `{destructive, side_effect}`
- **yellow** — everything else (live read / network observe)

---

## Phase status

| Phase | Name | Status |
| --- | --- | --- |
| 0 | Launcher + catalog + demo + React shell | **done** on `main` |
| 1 | Doctor, guided checklist, glossary, inspector | **done** on `main` |
| 2 | Live connect + observe-only runs | **done** on `main` (2026-09-01) |
| 3 | Findings, explain, remediate | **next** |
| 4 | Vault, tickets, rollback UI | not started |
| 5 | Typed-confirm RED execution | not started |
| 6 | Report export + closeout | not started |

---

## Phase 0 — Launcher (done)

Intent: a pip-installable console that boots locally and shows the catalog.

Shipped:

- FastAPI app + `adassassin` CLI
- React source under `web/`
- Fallback console `src/adassassin/webapp/index.html` so `pip install` works without npm
- Catalog API with engine / markdown fallback
- Demo engagement with fixture findings
- `AUTHORIZED_USE.md`, `SECURITY.md`, banner in the shell
- Tests: `tests/test_catalog.py`

APIs:

- `GET /api/health`
- `GET /api/catalog`
- `GET|POST /api/engagements`
- `POST /api/engagements/demo`
- `GET /api/engagements/{id}`

Acceptance that already passed:

- Catalog count is 92 at the current pin
- Health reports engine available or catalog fallback
- Demo workspace writes under `ADASSASSIN_DATA_DIR` / `~/.adassassin`

---

## Phase 1 — Guided shell (done)

Intent: a novice can use the product with zero network and a clear next step.

Shipped:

- `src/adassassin/doctor.py` — offline checks
- `src/adassassin/guide.py` — six-step path + glossary
- Guided marks on engagements (`guided_marked`)
- Overview doctor panel
- Catalog inspector (approval, rollback, tools, environment)
- Glossary page
- Tests: `tests/test_phase1.py`

APIs:

- `GET /api/doctor` — `contacts_directory` must be `false`
- `GET /api/guide`
- `GET /api/glossary`
- `POST /api/engagements/{id}/guided` body `{ "step_id": "glossary" }`

Guided steps (keep stable unless you update this file and the UI together):

1. `doctor` — console ready
2. `demo` — seed offline demo
3. `green-catalog` — browse GREEN capabilities
4. `findings` — read demo findings
5. `glossary` — open glossary
6. `engagement` — name a live-ready workspace

Acceptance that already passed:

- Doctor never contacts a DC
- Missing engine is a **warn**, not a hard fail
- Demo seeds three fixture findings
- Guide marks persist on disk

Known leftover from Phase 1 (resolved in Phase 2):

- Shipped `webapp/` rebuilt from React so pip-install UI matches Connect/Run.

---

## Phase 2 — Live connect + observe-only runs (done)

Intent: an operator with written scope can point the console at an authorized
DC and run **green/yellow observe** capabilities. No directory mutation.

Shipped:

- `src/adassassin/targets.py` — connect + live-ad doctor preflight wrap
- `src/adassassin/runner.py` — observe-only gate + `execute_capability` wrap
- `src/adassassin/secrets.py` — in-memory bind password/hashes (not on disk)
- Connect + Run React pages; catalog **Run** button for observe caps
- Guided steps `connect` and `observe-run`
- Tests: `tests/test_phase2.py`

APIs:

- `POST /api/engagements/{id}/connect` — preflight only; no capability run
- `POST /api/engagements/{id}/run` — 403 red/non-observe, 409 yellow without connect
- `GET /api/engagements/{id}/jobs/{job_id}`
- `GET /api/catalog/{capability_id}` — prompts + runnable flag

`target_contacted` behavior: set when connect supplies domain+dc and the
engine live-ad path runs DC TCP probes (dns/kerberos/ldap/smb). Probes count
even if they fail. Missing fields never reach that path, so contact stays
false. Yellow observe runs also set it after a completed engine call.

Acceptance that already passed:

- Yellow run requires successful connect/preflight on that engagement
- Green/offline caps run with no DC
- Red POST names Phase 5
- Secrets never written into engagement JSON
- Tests cover refuse red, refuse yellow without connect, mocked observe run

---

## Phase 3 — Findings, explain, remediate

Intent: the console becomes the place you read evidence, not just launch work.

- Findings list grouped by severity, engagement-scoped
- Finding detail: evidence refs, engine `explain_finding_payload`
- Remediation checklist from `novice.remediation_checklist`
- “What next” from `beginner_next_actions` / `suggested_next_actions`
- Mark finding status: open / accepted / fixed / retest

Suggested APIs:

- `GET /api/engagements/{id}/findings`
- `GET /api/engagements/{id}/findings/{finding_id}`
- `POST /api/engagements/{id}/findings/{finding_id}/explain`
- `POST /api/engagements/{id}/findings/{finding_id}/status`

Acceptance: a demo finding and a live observe finding use the same pane.
No live directory writes from this phase.

---

## Phase 4 — Vault, tickets, rollback UI

Intent: operators can see that secrets exist without dumping them.

- Vault counters already exist on the engagement (`secrets`, `tickets`,
  `certificates`). Wire them to the engine vault.
- List items metadata-only: type, label, created, last used
- Unmask a **single** item behind an explicit click + short TTL
- Rollback pane lists pending engine cleanup entries
- “Preview rollback” vs “Apply rollback” as two actions

Acceptance:

- Engagement JSON on disk never stores raw ticket bytes or NT hashes
- Unmask is audited on the engagement
- Rollback apply is still a mutation: treat it as Phase 5-adjacent and
  require the same confirmation pattern if the engine says so

---

## Phase 5 — Typed-confirm RED execution

Intent: destructive and side-effect capabilities become runnable without
becoming one-click.

Hard rules:

- Button label includes the capability id and the word **destructive** or
  **side effect**
- Operator types the capability id (or `YES` if that is what the engine
  `force` path expects — match the engine, do not invent a second language)
- Show rollback expectation from SafetyProfile before submit
- Record ack actor, timestamp, capability, options (redact secrets) on the
  engagement
- If the engine refuses, surface that refusal verbatim

Do not add a global “enable red” toggle that bypasses per-run ack.

Acceptance: automated test posts a red run without ack and gets 403.
Integration test with ack is optional and must use a mock engine.

---

## Phase 6 — Report export + closeout

Intent: leave the customer with evidence, not a running console.

- Wrap engine report / export capabilities
- Markdown + HTML download from `/report`
- Include: scope notes, capabilities run, findings, remediation status,
  rollback leftovers, authorization banner
- Closeout checklist: pending rollback, unmasked vault items, live sessions

Acceptance: a demo engagement can export a report with zero network.

---

## How to work a phase (Grok CLI or otherwise)

1. Read this file and `README.md`.
2. Confirm engine pin in `src/adassassin/__init__.py` and `pyproject.toml`.
3. Inspect ADAF-ATTACK at `ENGINE_COMMIT` before adding a wrapper.
4. Implement the smallest API + UI that meets that phase’s acceptance.
5. Add tests under `tests/test_phaseN.py`.
6. Bump version in `__init__.py` and `pyproject.toml` when the phase lands
   (Phase 2 → `0.3.0`).
7. Mark the phase **done** in the status table above and write the date.
8. Leave `webapp/` fallback working even if you do not rebuild React.

Local run:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev]"
python -m pytest
adassassin
```

Optional vendor UI rebuild:

```bash
cd web && npm install && npm run build
```

Vite build output must land in `src/adassassin/webapp/` (see `web/vite.config.ts`).

---

## Explicit non-goals

- Rewriting ADAF-ATTACK capabilities inside this repo
- Shipping a remote multi-user SaaS
- Binding `0.0.0.0` by default
- Embedding real customer credentials in git
- A first-run “I have authorization” modal that blocks doctor/demo
- Ranking or hiding catalog entries that the engine ships — lanes filter,
  they do not delete

---

## Change log for this document

- 2026-09-01 — Initial roadmap. Phase 0 and Phase 1 recorded as done.
  Phase 2 specified as the next CLI slice.
- 2026-09-01 — Phase 2 landed (connect, observe runs, jobs, 0.3.0).
  Next slice is Phase 3.
