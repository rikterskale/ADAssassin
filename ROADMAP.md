# ADAssassin roadmap

**Authorized internal red-team use only.** This file is the source of truth
for build order. Update it when a phase lands or a decision changes.

Product: a 100% GUI web console for novice authorized operators. It wraps
every capability in `docs/CAPABILITY_CATALOG.md` from
[rikterskale/ADAF-ATTACK](https://github.com/rikterskale/ADAF-ATTACK)
(92 at pin 0.10.1). It does not reimplement those capabilities.

Repo: https://github.com/rikterskale/ADAssassin
Current slice: **Phase 6 complete.**
Package version at this writing: `0.8.0`.

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
                ├─ runner.py      observe + typed-confirm RED runs
                ├─ findings.py    explain / remediate / status
                ├─ vault.py       metadata list + TTL unmask
                ├─ rollback.py    preview / force-gated apply
                ├─ report.py      markdown/html export + closeout
                ├─ secrets.py     in-memory bind secrets
                ├─ engagements.py disk sessions under ~/.adassassin
                └─ web/           React source
                   webapp/        shipped static fallback (pip install)
```

Engine already has what we wrap: capability registry, SafetyProfile,
approval/rollback, session/vault, `next-actions`, `novice.py` plain language,
and a large Textual TUI. Approach is wrap-not-rewrite.

Catalog source order:

1. Live `adaf_attack.core.registry` if the package imported (no network required).
2. Bundled `src/adassassin/data/catalog.json` (shipped for the pin).
3. Pinned markdown (last resort when bundle missing):
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
| 3 | Findings, explain, remediate | **done** on `main` (2026-09-01) |
| 4 | Vault, tickets, rollback UI | **done** on `main` (2026-09-01) |
| 5 | Typed-confirm RED execution | **done** on `main` (2026-09-01) |
| 6 | Report export + closeout | **done** on `main` (2026-09-01) |

---

## Phase 0 — Launcher (done)

Intent: a pip-installable console that boots locally and shows the catalog.

Shipped:

- FastAPI app + `adassassin` CLI
- React source under `web/`
- Fallback console `src/adassassin/webapp/index.html` so `pip install` works without npm
- Catalog API with engine / bundled / markdown fallback
- Bundled pin snapshot `src/adassassin/data/catalog.json` (92 caps) for offline use
- Demo engagement with fixture findings
- `AUTHORIZED_USE.md`, `SECURITY.md`, banner in the shell
- Tests: `tests/test_catalog.py`, `tests/test_phase0.py`

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
- `src/adassassin/guide.py` — guided path + glossary (Phase 1 six steps; Phase 2 appends two)
- Guided marks on engagements (`guided_marked`)
- Overview doctor panel
- Catalog inspector (approval, rollback, tools, environment)
- Glossary page
- Tests: `tests/test_phase1.py` (includes missing-engine warn)

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
7. `connect` — connect an authorized target (Phase 2)
8. `observe-run` — run a GREEN or YELLOW observe capability (Phase 2)
9. `red-run` — run a RED capability with typed confirm (Phase 5)

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
- `src/adassassin/runner.py` — observe gate + `execute_capability` wrap (RED confirm landed in Phase 5)
- `src/adassassin/secrets.py` — in-memory bind password/hashes (not on disk)
- Connect + Run React pages; catalog **Run** button for observe caps
- Guided steps `connect` and `observe-run`
- Tests: `tests/test_phase2.py`

APIs:

- `POST /api/engagements/{id}/connect` — preflight only; no capability run
- `POST /api/engagements/{id}/run` — observe path; yellow without connect → 409
- `GET /api/engagements/{id}/jobs/{job_id}`
- `GET /api/catalog/{capability_id}` — prompts + runnable flag

`target_contacted` behavior: set when connect supplies domain+dc and the
engine live-ad path runs DC TCP probes (dns/kerberos/ldap/smb). Probes count
even if they fail. Missing fields never reach that path, so contact stays
false. Yellow observe runs also set it after a completed engine call.

Acceptance that already passed:

- Yellow run requires successful connect/preflight on that engagement
- Green/offline caps run with no DC
- Red without ack/force/confirm is refused (Phase 5 typed confirm)
- Secrets never written into engagement JSON
- Tests cover refuse red without confirm, refuse yellow without connect, mocked observe run

---

## Phase 3 — Findings, explain, remediate (done)

Intent: the console becomes the place you read evidence, not just launch work.

Shipped:

- `src/adassassin/findings.py` — normalize, list/group, explain, status
- Findings React pane: severity groups, detail, evidence, explain, checklist, status
- Demo and live observe findings share one shape and one UI
- Tests: `tests/test_phase3.py`

APIs:

- `GET /api/engagements/{id}/findings`
- `GET /api/engagements/{id}/findings/{finding_id}`
- `POST /api/engagements/{id}/findings/{finding_id}/explain`
- `POST /api/engagements/{id}/findings/{finding_id}/status` body `{ "status": "open|accepted|fixed|retest" }`

Explain wraps engine `explain_finding_payload` + `remediation_checklist` and, when a
source capability is known, `beginner_next_actions`. No directory mutation.

Acceptance that already passed:

- Demo finding and live observe finding use the same pane/APIs
- Status updates persist on the engagement
- Invalid status returns 400

---

## Phase 4 — Vault, tickets, rollback UI (done)

Intent: operators can see that secrets exist without dumping them.

Shipped:

- `src/adassassin/vault.py` — engine `SessionVault` list + single-item TTL unmask
- `src/adassassin/rollback.py` — pending cleanup list, preview, force-gated apply
- Vault + Rollback React pages; demo seeds metadata vault items and one pending cleanup
- Tests: `tests/test_phase4.py`

APIs:

- `GET /api/engagements/{id}/vault`
- `POST /api/engagements/{id}/vault/{name}/unmask` body `{ "scope", "ttl_seconds" }`
- `GET /api/engagements/{id}/rollback`
- `POST /api/engagements/{id}/rollback/preview` — no directory contact
- `POST /api/engagements/{id}/rollback/apply` — requires `force`, `ack`, typed `YES`

Acceptance that already passed:

- Engagement JSON never stores raw ticket bytes or NT hashes
- Unmask is audited on the engagement (`vault_audit`)
- Apply without force/ack/YES returns 403; engine cleanup is mocked in tests

---

## Phase 5 — Typed-confirm RED execution (done)

Intent: destructive and side-effect capabilities become runnable without
becoming one-click.

Shipped:

- `runner.execute_run` — RED requires `ack`, `force`, and typed capability id
- Catalog/Run buttons label `Run <id> destructive|side effect`
- Rollback expectation shown before RED submit
- `red_ack_audit` on engagement (actor, timestamp, capability, redacted options)
- Guided step `red-run`
- Engine refusal text surfaced on failed jobs
- Tests: `tests/test_phase5.py`

Run API additions:

- `POST /api/engagements/{id}/run` accepts `{ ack, force, confirm, actor }`
- Observe path unchanged (no confirm)
- RED without ack/force/confirm → 403
- RED without connect → 409

Acceptance that already passed:

- Red run without ack returns 403
- Red with wrong confirm returns 403
- Red without connect returns 409
- Mocked red run with ack/force/confirm records audit and completes

---

## Phase 6 — Report export + closeout (done)

Intent: leave the customer with evidence, not a running console.

Shipped:

- `src/adassassin/report.py` — engagement Markdown/HTML export + closeout checklist
- Wraps engine `generate_report_bundle` for session artifacts when present
- Report React page with generate + download links
- Tests: `tests/test_phase6.py`

APIs:

- `GET /api/engagements/{id}/closeout`
- `GET /api/engagements/{id}/report` — builds markdown/html (no network)
- `GET /api/engagements/{id}/report.md`
- `GET /api/engagements/{id}/report.html`

Report contents: authorization banner, scope notes, capabilities run, findings /
remediation status, rollback leftovers, closeout checklist.

Acceptance that already passed:

- Demo engagement exports Markdown and HTML with zero network
- `contacts_directory` is false on report/closeout payloads

---

## How to work a phase (Grok CLI or otherwise)

1. Read this file and `README.md`.
2. Confirm engine pin in `src/adassassin/__init__.py` and `pyproject.toml`.
3. Inspect ADAF-ATTACK at `ENGINE_COMMIT` before adding a wrapper.
4. Implement the smallest API + UI that meets that phase’s acceptance.
5. Add tests under `tests/test_phaseN.py`.
6. Bump version in `__init__.py` and `pyproject.toml` when the phase lands
   (Phase 6 → `0.7.0`).
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

Frontend tests (Vitest + React Testing Library) cover the API client, every
component, every page, and app bootstrap/routing:

```bash
cd web && npm install && npm test        # or: npm run test:coverage
```

End-to-end user-readiness journey (Playwright) boots the real server against the
shipped bundle and walks the operator path (demo → findings/explain → vault
unmask → rollback preview → report export → catalog/glossary/guided) plus the
RED typed-confirm safety gate, entirely offline:

```bash
cd web && npx playwright install chromium && npm run e2e
```

Vite build output must land in `src/adassassin/webapp/` (see `web/vite.config.ts`).
That built bundle is committed so `pip install` ships the console without a Node
toolchain. When you change anything under `web/`, rebuild and commit the
regenerated `src/adassassin/webapp/`; CI (`web` job) rebuilds and fails if the
committed bundle drifts from source.

---

## Explicit non-goals

- Rewriting ADAF-ATTACK capabilities inside this repo
- Shipping a remote multi-user SaaS
- Binding any non-loopback address (including `0.0.0.0`)
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
- 2026-09-01 — Phase 0–2 completeness pass: bundled catalog.json,
  Connect form hydration + hashes, stronger acceptance tests.
- 2026-09-01 — Phase 3 landed (findings explain/remediate/status, 0.4.0).
  Next slice is Phase 4.
- 2026-09-01 — Phase 4 landed (vault unmask TTL, rollback preview/apply, 0.5.0).
  Next slice is Phase 5.
- 2026-09-01 — Phase 5 landed (typed-confirm RED runs, 0.6.0).
  Next slice is Phase 6.
- 2026-09-01 — Phase 0–5 completeness pass: guide red-run step, observe-run
  progress ignores RED jobs, stale Phase 2 acceptance text updated.
- 2026-09-01 — Phase 6 landed (report export + closeout, 0.7.0).
- 2026-09-01 — Post-phase hardening: GitHub Actions CI, operator runbook,
  release tag `v0.7.0`.
- 2026-09-01 — Vendor-grade polish pass (no version bump): shipped genuine
  IBM Plex Sans Medium (the 500/600 weights were placeholder copies of 400;
  600 was unused and dropped), added a self-contained SVG reticle favicon plus
  `theme-color`/`description` meta, removed the dead `Placeholder` page, and
  extended CI with a `web` job that builds the console and enforces
  bundle-in-sync. No engine, API, or capability behavior changed.
- 2026-09-01 — Frontend test suite (Vitest + React Testing Library, jsdom):
  covers the `api` client (request/error handling, encoding, gating bodies),
  all shared components, all pages (including RED typed-confirm gating,
  vault unmask, rollback typed-YES, report export, and Run background polling),
  and App bootstrap (splash, fatal + retry, auto-seed). CI `web` job runs
  `npm test` before the build.
- 2026-09-01 — User-readiness E2E (Playwright, new CI `e2e` job): boots the real
  adassassin server against the shipped bundle and drives the full operator
  journey through the actual GUI — overview/demo, findings inspect + explain +
  status, vault unmask, rollback preview, report export, catalog/glossary/guided
  — plus backend readiness (health/doctor/catalog/SPA/traversal) and the RED
  typed-confirm safety gate. Runs entirely offline (no DC contact).
- 2026-09-02 — Production hardening release `0.8.0`: permanent demo isolation,
  restart-stable engine-compatible vault keys, scoped approval-token fields,
  engagement-scoped jobs, interrupted-run reconciliation, capability-level
  readiness, enforced loopback-only binding, and transactional engagement
  updates. Added offline regression coverage for every boundary.
