# ADAssassin operator runbook

**Authorized internal red-team use only.** Written authorization is required
before any live target work. Availability of this repository is not
authorization.

This runbook is the shortest path from install to closeout for a novice
authorized operator. Product build order and acceptance live in
[ROADMAP.md](../ROADMAP.md).

If this is your first session, use the comprehensive
[START HERE guide](START_HERE.md) instead. It includes every console surface,
CLI option, runtime setting, API operation, success checkpoint, and recovery
path. Nothing in this compact runbook replaces or hides those controls.

Engine pin: `adaf-attack==0.10.1` @ `df92b617ad7d2ca3603408d59fcef50338e50bab`.

---

## 1. Install

Follow the full platform guide (Windows / Kali / macOS), including verbose
error capture and fix actions:

**[INSTALLATION.md](INSTALLATION.md)**

Short path once prerequisites exist:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
python -m pip install -U pip
python -m pip install .
adassassin --version
```

Contributors who need tests and linting can instead use
`python -m pip install -e ".[dev]"`.

Optional UI rebuild (only if you change React source):

```bash
npm --prefix web ci
npm --prefix web run build
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

The guided **Check the console** step completes automatically when Doctor is
ready. Operational steps are state-backed and cannot be manually marked done.

---

## 3. Demo (offline)

1. Open **Guided** → **Seed offline demo**, or call `POST /api/engagements/demo`.
2. Confirm three fixture findings appear under **Findings**.
3. Open **Glossary** once.
4. Demo and Doctor never contact a DC.
5. The server rejects Connect, YELLOW/RED runs, and rollback application for a
   demo engagement. Create a separate live-ready engagement before live work.

---

## 4. Connect (authorized target only)

1. Create a **live-ready** engagement under **Engagements** (name + scope notes).
2. Open **Connect**.
3. Enter authorized **domain** and **DC host/IP**.
4. Choose **Anonymous — no domain credentials** when no domain credentials are
   available. Choose authenticated mode only for an approved credential workflow.
5. In authenticated mode, enter the approved bind username and exactly one
   password or NTLM hash. The credential stays in process memory, not
   engagement JSON on disk. Anonymous mode refuses credential fields.
6. Choose the approved directory transport. LDAP and StartTLS use port 389;
   LDAPS uses port 636. The port is derived and displayed, not freely editable.
7. Run **preflight** (engine live-ad doctor: DNS + DC ports, a blocking check
   of the selected directory endpoint, and one LDAP bind for authenticated
   mode). This is an active authentication attempt and may affect lockout
   counters or detection. Preflight does **not** run a capability.
8. Yellow and RED work require a successful preflight, including accepted
   credentials in authenticated mode, on that engagement.
   The Run button stays disabled until that preflight is ready.

The successful preflight binds domain, DC, directory transport, and standard
port together. Live runs and rollback reuse that exact endpoint and reject
per-run transport, LDAP-port, or target-credential overrides.

If `credential-bind` fails, do not repeat the attempt. Connect shows a redacted
authentication log containing the network gate, method, transport/port,
attempt/result, secret-handling decision, and confirmation that automatic
retries were disabled. It never logs the supplied username or credential.
Complete the displayed remediation in order:

1. Check the account lockout threshold and current bad-password count through
   the approved identity-administration channel.
2. Confirm the authorized domain/DC and the `DOMAIN\user` or `user@domain`
   principal form.
3. Verify that the account is enabled, unlocked, unexpired, permitted to
   authenticate, and paired with the current approved credential.
4. Re-enter the password without accidental whitespace, or supply the approved
   bare NT hash or `LM:NT` pair.
5. Check the selected LDAP transport against NTLM restrictions, LDAP signing
   and channel binding, TLS trust, DNS, and time synchronization.
6. Rerun Connect once. If it fails again, stop and escalate to the engagement
   or identity owner rather than risking lockout.

---

## 5. Observe (GREEN / YELLOW)

1. Open **Catalog** (filter GREEN or YELLOW) or **Run**.
2. GREEN / offline observe caps can run without a DC.
3. With no domain credentials, use the **Offline** or **Anonymous — no domain
   credentials** authentication filter. Anonymous checks still contact the
   authorized target and require anonymous preflight.
4. In anonymous connection mode, non-GREEN capabilities run only when the
   pinned engine declares `auth_modes: ["anonymous"]`; all others fail closed.
5. Treat **ACTIVE AUTHENTICATION** as a lockout/detection warning even when the
   capability needs no starting credentials.
6. YELLOW observe caps require connect/preflight first.
7. After a run, check **Job log**, then **Findings**.
8. Use **Explain + remediate** and set finding status
   (`open` / `accepted` / `fixed` / `retest`).

### AD CS policy evidence

`adcs-policy-probe` does not collect CA or DC policy. Before running it, prepare
an authorized JSON evidence file and select that path in the capability's
**Authorized evidence file path** field. Use `false` or an empty list when the
reviewed evidence is negative:

```json
{
  "weak_certificate_mapping": false,
  "rpc_encryption_not_enforced": false,
  "issuance_policy_group_links": [],
  "application_policy_maps_to_group": false,
  "shell_access_via_certificate": false,
  "privileged_enrollment_agent": false
}
```

The evidence file remains operator-supplied; ADAssassin does not create policy
facts or expand collection beyond the approved scope.

---

## 6. RED (typed confirm)

Destructive and side-effect capabilities are not one-click.

1. Open **Catalog** → lane **red**, or pick a RED id on **Run**.
2. Button labels include the capability id and **destructive** or **side effect**.
3. Review rollback expectation before submit.
4. Review the execution summary (target, lane, authentication, noise, approval,
   and rollback). Sensitive capability inputs are masked and cleared when you
   switch capabilities.
5. Type the **capability id** exactly (for example `dcsync`).
6. Submit. The console sends `ack` + `force` + that confirm string.
   Capabilities marked `scoped_token` also require the approved scoped token
   and its approval engagement ID; the token is sent to the engine but never
   persisted by the console.
7. Refusal text from the engine is shown verbatim on failure.
8. Successful RED acks are recorded on the engagement (`red_ack_audit`) with
   secrets redacted.

There is no global “enable red” toggle.

---

## 7. Report and closeout

1. Open **Vault** — metadata only until you unmask a single item (short TTL,
   audited). Live vault evidence requires the same operator-supplied
   `ADAF_SESSION_VAULT_KEY` used by the engine.
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

On POSIX, app-owned engagement directories are restricted to the current user
(`0700`) and metadata/report files are `0600`. Use an approved encrypted disk;
the file modes are not a substitute for encryption at rest.

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

- [START_HERE.md](START_HERE.md) — comprehensive first-session guide and full command reference
- [INSTALLATION.md](INSTALLATION.md) — Windows / Kali / macOS install + troubleshooting
- [AUTHORIZED_USE.md](../AUTHORIZED_USE.md)
- [SECURITY.md](../SECURITY.md)
- [ROADMAP.md](../ROADMAP.md)
