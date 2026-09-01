# ADAssassin operator runbook

**Authorized internal red-team use only.** Written authorization is required
before any live target work. Availability of this repository is not
authorization.

This runbook is the shortest path from install to closeout for a novice
authorized operator. Product build order and acceptance live in
[ROADMAP.md](../ROADMAP.md).

Engine pin: `adaf-attack==0.10.1` @ `fdb60b90b910ba3dcbd582e2c72ce48189191214`.

---

## 1. Install

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
python -m pip install -U pip
python -m pip install -e ".[dev]"  # or: pip install .
adassassin --version
```

Optional UI rebuild (only if you change React source):

```bash
cd web && npm install && npm run build
```

---

## 2. Doctor (offline)

```bash
adassassin --no-browser
```

Open `http://127.0.0.1:8745/`.

1. Confirm the authorized-use banner.
2. On **Overview**, read Doctor checks.
3. Doctor must never contact a domain controller (`contacts_directory: no`).
4. A missing engine import is a **warn**, not a hard fail (catalog fallback /
   bundled catalog still works).

Mark guided step **Check the console** when ready.

---

## 3. Demo (offline)

1. Open **Guided** → **Seed offline demo**, or call `POST /api/engagements/demo`.
2. Confirm three fixture findings appear under **Findings**.
3. Open **Glossary** once.
4. Demo and Doctor never contact a DC.

---

## 4. Connect (authorized target only)

1. Create a **live-ready** engagement under **Engagements** (name + scope notes).
2. Open **Connect**.
3. Enter authorized **domain** and **DC host/IP**.
4. Optional username / password / NTLM hashes — secrets stay in process memory,
   not engagement JSON on disk.
5. Run **preflight** (engine live-ad doctor: DNS + DC ports). Preflight does
   **not** run a capability.
6. Yellow and RED work require a successful preflight on that engagement.

---

## 5. Observe (GREEN / YELLOW)

1. Open **Catalog** (filter GREEN or YELLOW) or **Run**.
2. GREEN / offline observe caps can run without a DC.
3. YELLOW observe caps require connect/preflight first.
4. After a run, check **Job log**, then **Findings**.
5. Use **Explain + remediate** and set finding status
   (`open` / `accepted` / `fixed` / `retest`).

---

## 6. RED (typed confirm)

Destructive and side-effect capabilities are not one-click.

1. Open **Catalog** → lane **red**, or pick a RED id on **Run**.
2. Button labels include the capability id and **destructive** or **side effect**.
3. Review rollback expectation before submit.
4. Type the **capability id** exactly (for example `dcsync`).
5. Submit. The console sends `ack` + `force` + that confirm string.
6. Refusal text from the engine is shown verbatim on failure.
7. Successful RED acks are recorded on the engagement (`red_ack_audit`) with
   secrets redacted.

There is no global “enable red” toggle.

---

## 7. Report and closeout

1. Open **Vault** — metadata only until you unmask a single item (short TTL,
   audited).
2. Open **Rollback** — **Preview** never contacts a DC. **Apply** requires
   typed `YES` plus force/ack and a successful connect.
3. Open **Report** → **Generate report**.
4. Download **Markdown** and/or **HTML**.
5. Confirm the export includes:
   - authorization banner
   - scope notes
   - capabilities run
   - findings / remediation status
   - rollback leftovers
   - closeout checklist
6. Clear closeout leftovers (pending rollback, active unmasks, open findings)
   before you leave the engagement.

Demo export works with zero network.

---

## Quick API map

| Step | Useful endpoints |
| --- | --- |
| Health / doctor | `GET /api/health`, `GET /api/doctor` |
| Demo | `POST /api/engagements/demo` |
| Connect | `POST /api/engagements/{id}/connect` |
| Run | `POST /api/engagements/{id}/run` |
| Findings | `GET/POST .../findings/...` |
| Vault | `GET .../vault`, `POST .../vault/{name}/unmask` |
| Rollback | `GET/POST .../rollback...` |
| Report | `GET .../report`, `.../report.md`, `.../report.html` |

Default bind: `127.0.0.1:8745` only.

---

## Related

- [AUTHORIZED_USE.md](../AUTHORIZED_USE.md)
- [SECURITY.md](../SECURITY.md)
- [ROADMAP.md](../ROADMAP.md)
