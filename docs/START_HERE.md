# ADAssassin: Start Here

**Authorized internal red-team use only. Written authorization is required
before any live target work. Availability of this repository is not
authorization.**

This is the canonical start-to-finish operator guide for ADAssassin 1.0.0. It
is written for someone who has never used the product. Follow it in order the
first time. Each stage tells you what to do, what success looks like, and where
to recover if the result is different.

Nothing is hidden in a simplified mode:

- all 92 engine capabilities remain visible in **Catalog** and **Run**;
- all 12 console surfaces remain directly accessible in the navigation and
  with `Ctrl+K` / `Command+K`;
- every CLI option, runtime setting, and local API operation is documented in
  this guide;
- capabilities that are not locally ready remain visible with the exact
  missing dependency;
- RED work remains visible but cannot bypass its target, approval, typed
  confirmation, or rollback gates.

## The path at a glance

```text
Install -> Start -> Doctor -> Offline demo -> Learn the console
        -> Confirm written scope -> Create engagement -> Connect/preflight
        -> GREEN/YELLOW observe -> Review findings -> Approved RED, if needed
        -> Vault review -> Rollback -> Report -> Closeout -> Stop
```

If you only want to learn the interface, stop after the offline demo. Doctor,
demo, demo findings, glossary, demo vault, rollback preview, and demo report do
not contact a domain controller.

## 1. Before you touch the keyboard

### 1.1 Choose the correct track

| Your goal | Use this track | Target contact |
| --- | --- | --- |
| Learn the product | Offline demo | None |
| Review saved/local evidence | GREEN capabilities | None |
| Read an authorized directory | YELLOW capabilities | Yes, after preflight |
| Perform an approved state-changing action | RED capabilities | Yes, after preflight and explicit gates |

### 1.2 Live-work checklist

Do not create a live connection until you can answer every item:

- [ ] I have written authorization from the environment owner.
- [ ] The authorization names the in-scope domain or forest.
- [ ] The target DC hostname or IP is in scope.
- [ ] The operator identity and any supplied account are approved.
- [ ] The assessment start/end time and change window are known.
- [ ] Out-of-scope systems, OUs, accounts, and techniques are written down.
- [ ] The owner has approved the intended YELLOW and RED activities.
- [ ] Stop conditions and an escalation contact are known.
- [ ] A rollback owner and evidence-retention location are known.
- [ ] The workstation and engagement-data location are approved and encrypted.

Paste this information into the engagement's **Scope notes**. Do not paste
passwords, NTLM material, tickets, approval tokens, or vault keys into notes.

## 2. Install ADAssassin

The supported Python range is 3.11 through 3.14. The first install needs Git
and network access to GitHub because the ADAF-ATTACK engine is pinned to a Git
commit. Node.js is not required for normal operation; it is only required when
changing the React source.

For exhaustive platform troubleshooting, use
[INSTALLATION.md](INSTALLATION.md). The commands below are the shortest
supported paths.

### 2.1 Windows PowerShell

```powershell
cd $env:USERPROFILE\Documents
git clone https://github.com/rikterskale/ADAssassin.git
cd ADAssassin
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip setuptools wheel
python -m pip install -e .
adassassin --version
```

Expected final line:

```text
adassassin 1.0.0
```

If activation is blocked by PowerShell policy, either follow the policy-safe
alternatives in the installation guide or invoke the executable directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -e .
.\.venv\Scripts\adassassin.exe --version
```

### 2.2 Kali Linux

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip
git clone https://github.com/rikterskale/ADAssassin.git
cd ADAssassin
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip setuptools wheel
python -m pip install -e .
adassassin --version
```

### 2.3 macOS

With Homebrew already available:

```bash
brew install git python@3.12
git clone https://github.com/rikterskale/ADAssassin.git
cd ADAssassin
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -U pip setuptools wheel
python -m pip install -e .
adassassin --version
```

### 2.4 Confirm the correct environment

Run these from the activated virtual environment:

```bash
python -c "import sys; print(sys.executable); print(sys.version)"
python -m pip show adassassin
adassassin --version
```

Success means the Python executable is inside this repository's `.venv`, the
package is present, and the version is `1.0.0`.

## 3. Start and stop the console

### 3.1 Normal launch

```bash
adassassin
```

The console binds to `127.0.0.1:8745` and opens the default browser. If the
browser does not open, leave the terminal running and manually open:

```text
http://127.0.0.1:8745
```

Success in the terminal looks like:

```text
Uvicorn running on http://127.0.0.1:8745
```

The process intentionally refuses non-loopback binds. ADAssassin is a local,
single-operator console, not a remote control plane.

### 3.2 Stop safely

Return to the terminal that is running ADAssassin and press `Ctrl+C`. Wait for
the application-shutdown message before closing the terminal.

Stopping the server does not delete engagements or reports. Passwords, hashes,
approval tokens, and unmasked vault values held only in process memory are no
longer available after shutdown.

### 3.3 Resume later

```bash
cd ADAssassin
source .venv/bin/activate          # Windows: .\.venv\Scripts\Activate.ps1
adassassin
```

The current engagement is restored in the browser when it still exists. The
server also reconciles jobs interrupted by an earlier shutdown.

## 4. Understand the console chrome

Before selecting a capability, learn the controls that stay visible on every
page:

| Control | What it tells you or does |
| --- | --- |
| Authorized-use banner | Reminder that live work requires written scope |
| Engagement selector | Switches the active workspace without hiding other workspaces |
| Jump / `Ctrl+K` | Searches every page, engagement, and capability |
| Refresh | Reloads health, Doctor, catalog, guide, and engagement state |
| Status pills | Product version, engine status, capability count, and bind address |
| Scope bar | Active engagement, mode, preflight, target, findings, and rollback count |
| Navigation | Direct access to all 11 console surfaces |

On a narrow screen, choose **Menu** to open navigation. No page is removed on
mobile. If a refresh fails, the existing console remains visible and displays
a stale-data warning with **Retry**.

## 5. Complete the zero-contact walkthrough first

This walkthrough is both training and an installation smoke test.

### 5.1 Check Overview and Doctor

1. Open **Start Here** from the first navigation group.
2. Open **Overview**.
3. Find **Console health**.
4. Confirm Doctor reports ready or shows only an understood warning.
5. Confirm the page explicitly says **no directory contact**.
6. Confirm the capability count is 92 and the bind is loopback.

Doctor checks Python, local storage, the catalog, the engine import, and the
local bind. It does not run a capability or contact a target.

If Doctor is blocked, do not continue to live work. Read the exact check, then
use [Troubleshooting](#20-troubleshooting-without-guessing).

### 5.2 Seed the offline demo

When the data directory is empty, the console seeds the offline demo once so
the first page is not blank. You can also seed or restore it explicitly:

1. Open **Guided**.
2. Choose **Seed offline demo**.
3. Confirm the engagement selector shows `Offline demo · demo`.
4. Confirm the scope bar says `offline fixture · no target contact`.
5. Confirm the demo has three findings and one pending rollback entry.

The demo is permanently isolated server-side. Connect, target-interacting
capabilities, and rollback apply are refused even if a client attempts them.

### 5.3 Practice Findings

1. Open **Findings**.
2. Select each fixture in the left pane.
3. Read severity, source, summary, impact, remediation, evidence references,
   affected assets, and technique mappings.
4. Choose **Explain + remediate**.
5. Read the plain-language meaning, why it matters, recommended next step, and
   remediation checklist.
6. Practice the four local status values: `open`, `accepted`, `fixed`, and
   `retest`.
7. Use the search field and status filters.

Finding status changes are engagement-local. This page does not write to a
directory.

### 5.4 Practice Catalog and Run

1. Open **Catalog**.
2. Leave lane and category on **all** to see every capability.
3. Filter to **GREEN**.
4. Select several capabilities and inspect environment, maturity, approval,
   rollback, tools, required prompts, and local readiness.
5. Use **Copy id** and the Run link.
6. On **Run**, verify the execution review shows capability, target, lane,
   authentication, noise, approval, and rollback.

A capability that lacks a dependency stays visible. The inspector explains
why it cannot currently run and names the missing dependency.

### 5.5 Practice Vault, Rollback, and Report

1. Open **Vault**, select a secret fixture, and choose **Unmask for 30s**.
2. Watch the TTL countdown and confirm an audit entry appears.
3. Open **Rollback** and choose **Preview rollback**. Preview is offline.
4. Confirm **Apply rollback** is disabled for the demo.
5. Open **Report** and choose **Generate report**.
6. Download Markdown and HTML.
7. Read each closeout check.

At this point you know every evidence-management surface without contacting a
domain controller.

## 6. Create the live-ready engagement

Only continue after the live-work checklist in Section 1 is complete.

1. Open **Engagements**.
2. Under **New engagement**, enter:

| Field | What to enter | Stored on disk |
| --- | --- | --- |
| Name | Unique assessment name, customer, or change reference | Yes |
| Domain | Authorized FQDN, or leave blank until Connect | Yes |
| Domain controller | Authorized hostname/IP, or leave blank until Connect | Yes |
| Scope notes | Authorization reference, inclusions, exclusions, window, stop conditions | Yes |

3. Choose **Create**.
4. Select the new engagement under **Saved**.
5. Confirm the scope bar shows the new engagement and `live-ready` mode.
6. Re-read the displayed domain/DC before proceeding.

Use one engagement per authorized assessment. Do not reuse the demo for live
work, and do not combine targets governed by different authorization records.

## 7. Connect and pass preflight

1. Open **Connect**.
2. Confirm the correct engagement ID above the form.
3. Enter the authorized domain FQDN.
4. Enter the authorized DC hostname or IP.
5. Optionally enter the approved bind username.
6. Enter either the password or NTLM material only when required by the
   approved engine workflow.
7. Choose **Run preflight**.

Credential handling:

- username is stored on the engagement;
- password and NTLM material are held in process memory only;
- password and hashes are cleared from the form after submission;
- secrets are never written into engagement JSON;
- stopping the console removes these in-memory values.

Preflight wraps the engine live-AD doctor. It can perform DNS and DC-port
checks, so it can contact the target. It does not execute a capability.

### 7.1 Interpret the result

| Result | Meaning | Action |
| --- | --- | --- |
| `ready` | All blocking checks passed | Continue to observe work |
| `blocked` | A required target or local check failed | Read each blocking check and fix it |
| `warning` check | Advisory issue | Review before continuing; document acceptance if applicable |
| `target contacted yes` | Preflight reached the authorized target | Confirm this matches the scope |

YELLOW and RED Run buttons remain disabled until the active engagement has a
successful preflight. The scope bar then displays **preflight ready**.

## 8. Choose a capability without losing visibility

Open **Catalog** for discovery or **Run** when you already know the ID.

Catalog provides:

- free-text search across capability metadata;
- lane filters: all, GREEN, YELLOW, RED;
- category filters;
- the capability ID and plain-language summary;
- environment, maturity, tools, authentication modes, and noise;
- approval and rollback expectations;
- every required prompt;
- local readiness and missing dependencies;
- a direct link to Run.

Use `Ctrl+K` / `Command+K` to search capabilities from any page. Choosing a
capability in the command palette opens it in Run; it does not execute it.

### 8.1 Lane contract

| Lane | Expected effect | Connection | Additional gate |
| --- | --- | --- | --- |
| GREEN | Local/saved-evidence processing | Not required | Capability readiness |
| YELLOW | Target-reading observe work | Successful preflight | Capability readiness |
| RED | Destructive or side-effect work | Successful preflight | Review, `ack`, `force`, exact typed ID; scoped token when declared |

The catalog is the authoritative, complete command list. Do not rely on a
memorized capability name or old runbook: inspect the pinned engine metadata
immediately before every run.

## 9. Run GREEN and YELLOW observe work

1. Confirm the active engagement in the scope bar.
2. Open **Run**.
3. Search for or select the approved capability.
4. Wait for capability details to load.
5. Complete every required prompt. Sensitive prompts are masked.
6. Review:
   - capability ID;
   - target;
   - lane and risk;
   - authentication modes;
   - expected noise;
   - approval requirement;
   - rollback expectation.
7. Confirm local readiness is ready.
8. For YELLOW, confirm the active engagement says preflight ready.
9. Choose **Run observe**.
10. Keep the page open while the live job log updates.
11. Confirm the final job status is completed or read the refusal/error in
    full.
12. Open **Findings** and inspect all new evidence.

Changing capabilities clears old prompts, confirmation text, and scoped
approval material so stale hidden values cannot cross into a different run.

## 10. Run RED only for a specifically approved action

There is deliberately no global “enable RED” switch. The capability remains
visible, but each individual action must pass every gate.

1. Confirm the authorization names or clearly covers this exact action.
2. Confirm the active engagement, domain, and DC in the scope bar.
3. Confirm preflight is still ready for this engagement.
4. Select the RED capability from Catalog or Run.
5. Complete its required prompts.
6. Read the execution review line by line.
7. Confirm the expected noise and rollback are acceptable now.
8. If the capability declares `scoped_token`, enter:
   - the approved scoped approval token;
   - the approval engagement ID to which that token is bound.
9. Type the capability ID exactly into **Typed confirmation**.
10. Submit the button that names the capability and risk.
11. Watch the job log to completion.
12. Review findings, vault additions, rollback entries, and the engagement's
    RED acknowledgment audit.

The console submits `ack=true`, `force=true`, and the exact confirmation to the
engine. The engine remains authoritative and may refuse the run. Refusal text
is displayed to the operator; do not work around it.

## 11. Read jobs and findings

The Run page shows the active job's status, elapsed time, log, error, findings,
and next actions. Completed jobs are attached to the engagement and appear on
Overview.

For each finding:

1. Verify the source capability and evidence pointer.
2. Use **Explain + remediate** for plain-language context.
3. Validate affected assets and technique/control mappings.
4. Assign an explicit disposition:

| Status | Use when |
| --- | --- |
| `open` | Needs investigation or remediation |
| `accepted` | The owner explicitly accepts the documented risk |
| `fixed` | Remediation is complete and evidence supports closure |
| `retest` | A change was made and verification is still required |

Never mark a finding fixed solely to clear the closeout screen.

## 12. Handle the vault

Vault displays metadata by default. Select one item to view its name, label,
kind, scope, creation time, and last-used time.

To reveal a secret:

1. Confirm the item and active engagement.
2. Choose **Unmask for 30s**.
3. Use the value only for the approved operation.
4. Avoid copying it unless necessary.
5. Wait for the TTL to expire.
6. Confirm the unmask event appears in the audit.

Live vault evidence requires an operator-supplied Fernet key in
`ADAF_SESSION_VAULT_KEY`. Deliver it through the approved secret channel and
use the same key after restart. Never put it in Git, engagement notes, command
history, screenshots, tickets, or exported reports.

## 13. Preview and apply rollback

1. Open **Rollback**.
2. Read each entry's status, kind, session, target, classification, and whether
   a previous value was recorded.
3. Choose **Preview rollback**. Preview does not contact a DC.
4. Resolve uncertainty before Apply.
5. Confirm the engagement is live-ready and connected.
6. Confirm the cleanup action is authorized in the current window.
7. Type uppercase `YES`.
8. Choose **Apply rollback**.
9. Review every returned session and entry.
10. Investigate failed or pending cleanup rather than assuming success.

Rollback Apply submits `ack=true`, `force=true`, and `confirm="YES"` to the
engine cleanup path. It contacts the authorized target. Demo rollback is
preview-only and can never be applied.

## 14. Generate the report and close out

1. Open **Report**.
2. Read the closeout checklist before generating an export.
3. Address each remaining item:
   - pending/failed rollback;
   - active unmask state;
   - findings that still require disposition;
   - incomplete evidence review.
4. Choose **Generate report**.
5. Download **Markdown** and **HTML**.
6. Open both files and verify:
   - authorization banner;
   - engagement identity and scope notes;
   - capabilities run;
   - findings and remediation status;
   - rollback leftovers;
   - closeout status.
7. Store the exports in the approved evidence location.
8. Stop the server with `Ctrl+C`.

On POSIX, app-owned data directories use mode `0700` and engagement/report
files use `0600`. These permissions reduce accidental cross-user disclosure;
they do not replace encrypted storage or your evidence-handling policy.

## 15. Complete console map

| Page | Route | Everything available there |
| --- | --- | --- |
| Start Here | `/start` | Integrated workflow, lanes, page map, commands, settings, closeout |
| Overview | `/` | Doctor, health, capability metrics, active workspace, recent jobs |
| Guided | `/guided` | Nine state-backed milestones and direct Continue action |
| Engagements | `/engagements` | Create, seed demo, list, select, and inspect workspaces |
| Connect | `/connect` | Domain, DC, username, password/hashes, preflight checks |
| Run | `/run` | Full capability picker, prompts, review, confirmations, live job log |
| Findings | `/findings` | Search, filters, evidence, explain, remediation, all four statuses |
| Catalog | `/catalog` | All capabilities, lanes, categories, dependencies, prompts, run links |
| Glossary | `/glossary` | Searchable plain-language AD and engine terminology |
| Vault | `/vault` | Inventory, audited unmask, copy, countdown, audit trail |
| Rollback | `/rollback` | Entries, sessions, offline preview, confirmed apply |
| Report | `/report` | Closeout checks, generation, preview, copy, MD/HTML downloads |

## 16. Complete launch-command reference

`adassassin` is the single runtime command. These are all of its CLI options:

```text
usage: adassassin [-h] [--host HOST] [--port PORT] [--no-browser] [--version]
```

| Command | Result |
| --- | --- |
| `adassassin` | Start on configured/default loopback host and port; open browser when enabled |
| `adassassin --help` | Show all CLI options |
| `adassassin --version` | Print product version and exit |
| `adassassin --no-browser` | Start without opening a browser |
| `adassassin --port 8750` | Start on alternate local port 8750 |
| `adassassin --host localhost` | Use the alternate accepted loopback hostname |
| `adassassin --host localhost --port 8750 --no-browser` | Combine host, port, and browser behavior |

Ports must be between 1 and 65535. Accepted hosts are `127.0.0.1` and
`localhost`. A CLI `--host` or `--port` overrides the corresponding environment
setting for that launch.

## 17. Complete runtime-setting reference

ADAssassin settings use the `ADASSASSIN_` prefix.

| Setting | Default | Purpose |
| --- | --- | --- |
| `ADASSASSIN_DATA_DIR` | `~/.adassassin` | Engagement, report, rollback, and demo-vault storage root |
| `ADASSASSIN_HOST` | `127.0.0.1` | Loopback bind host; non-loopback is refused |
| `ADASSASSIN_PORT` | `8745` | Local HTTP port |
| `ADASSASSIN_OPEN_BROWSER` | `true` | Automatically open the browser |
| `ADASSASSIN_RUN_SYNCHRONOUS` | `false` | Test/development mode that completes runs inline; leave false in production |
| `ADAF_SESSION_VAULT_KEY` | unset | Operator-delivered Fernet key for live engine vault interoperability |

Bash/zsh example:

```bash
export ADASSASSIN_DATA_DIR="$HOME/adassassin-data"
export ADASSASSIN_HOST="127.0.0.1"
export ADASSASSIN_PORT="8750"
export ADASSASSIN_OPEN_BROWSER="false"
export ADASSASSIN_RUN_SYNCHRONOUS="false"
export ADAF_SESSION_VAULT_KEY="<approved Fernet key>"
adassassin
```

PowerShell example:

```powershell
$env:ADASSASSIN_DATA_DIR = "$env:USERPROFILE\adassassin-data"
$env:ADASSASSIN_HOST = "127.0.0.1"
$env:ADASSASSIN_PORT = "8750"
$env:ADASSASSIN_OPEN_BROWSER = "false"
$env:ADASSASSIN_RUN_SYNCHRONOUS = "false"
$env:ADAF_SESSION_VAULT_KEY = "<approved Fernet key>"
adassassin
```

Development-only E2E settings are also visible:

| Setting | Purpose |
| --- | --- |
| `ADASSASSIN_E2E_PYTHON` | Explicit Python executable for Playwright's local server |
| `E2E_PORT` | Alternate Playwright server port; default 8799 |

## 18. Discover all capabilities from the command line

The GUI's **Catalog** is the complete capability surface. The local API returns
the same full catalog.

Bash/zsh, formatted with Python (no `jq` requirement):

```bash
curl -s http://127.0.0.1:8745/api/catalog | python -c 'import json,sys; data=json.load(sys.stdin); [print("{:<32} {:<7} {}".format(c["id"], c["lane"], c["risk"])) for c in data["capabilities"]]'
```

PowerShell:

```powershell
$Catalog = Invoke-RestMethod http://127.0.0.1:8745/api/catalog
$Catalog.capabilities | Select-Object id, lane, risk, category, runnable | Format-Table -AutoSize
```

Inspect one capability by ID:

```bash
curl http://127.0.0.1:8745/api/catalog/CAPABILITY_ID
```

Use the returned `required_prompts`, `readiness`, `approval`, and `rollback`
fields rather than guessing parameters.

## 19. Complete local API reference

The GUI uses the same local API documented here. It has 27 operations. There
is no remote API mode and no hidden administrative endpoint. Replace
`ENGAGEMENT_ID`, `JOB_ID`, `FINDING_ID`, `ITEM_NAME`, `CAPABILITY_ID`, and
example target values before use.

Set a convenient base URL in Bash/zsh:

```bash
BASE_URL="http://127.0.0.1:8745"
```

PowerShell:

```powershell
$BaseUrl = "http://127.0.0.1:8745"
```

### 19.1 Every endpoint

| # | Method | Endpoint | Purpose / body |
| ---: | --- | --- | --- |
| 1 | GET | `/api/health` | Product, engine, catalog, and bind health |
| 2 | GET | `/api/doctor` | Offline readiness checks |
| 3 | GET | `/api/guide` | Guided milestones and completion state |
| 4 | GET | `/api/glossary` | Plain-language glossary |
| 5 | GET | `/api/catalog` | Complete capability catalog |
| 6 | GET | `/api/catalog/{capability_id}` | One capability with prompts/readiness |
| 7 | GET | `/api/engagements` | List all engagements |
| 8 | POST | `/api/engagements` | Create; JSON `name`, optional `domain`, `dc`, `notes` |
| 9 | POST | `/api/engagements/demo` | Ensure and return isolated demo |
| 10 | POST | `/api/engagements/{id}/guided` | Record `green-catalog` or `glossary` visit only |
| 11 | GET | `/api/engagements/{id}` | Get one engagement |
| 12 | POST | `/api/engagements/{id}/connect` | Live preflight; domain/DC and optional credentials |
| 13 | POST | `/api/engagements/{id}/run` | Start capability job with options and gates |
| 14 | GET | `/api/engagements/{id}/jobs/{job_id}` | Poll live or completed job |
| 15 | GET | `/api/engagements/{id}/findings` | List/group findings |
| 16 | GET | `/api/engagements/{id}/findings/{finding_id}` | One finding |
| 17 | POST | `/api/engagements/{id}/findings/{finding_id}/explain` | Attach explanation/remediation |
| 18 | POST | `/api/engagements/{id}/findings/{finding_id}/status` | JSON status: open/accepted/fixed/retest |
| 19 | GET | `/api/engagements/{id}/vault` | Vault metadata inventory |
| 20 | POST | `/api/engagements/{id}/vault/{name}/unmask` | JSON scope and TTL 5–300 seconds |
| 21 | GET | `/api/engagements/{id}/rollback` | Rollback entries/sessions |
| 22 | POST | `/api/engagements/{id}/rollback/preview` | Offline cleanup preview |
| 23 | POST | `/api/engagements/{id}/rollback/apply` | Apply with ack, force, `YES`, optional session |
| 24 | GET | `/api/engagements/{id}/closeout` | Closeout readiness/checks |
| 25 | GET | `/api/engagements/{id}/report` | Generate JSON response and report content |
| 26 | GET | `/api/engagements/{id}/report.md` | Download Markdown report |
| 27 | GET | `/api/engagements/{id}/report.html` | Download HTML report |

### 19.2 Safe discovery and demo commands

```bash
curl "$BASE_URL/api/health"
curl "$BASE_URL/api/doctor"
curl "$BASE_URL/api/guide"
curl "$BASE_URL/api/glossary"
curl "$BASE_URL/api/catalog"
curl "$BASE_URL/api/engagements"
curl -X POST "$BASE_URL/api/engagements/demo"
```

PowerShell equivalent:

```powershell
Invoke-RestMethod "$BaseUrl/api/health"
Invoke-RestMethod "$BaseUrl/api/doctor"
Invoke-RestMethod "$BaseUrl/api/catalog"
Invoke-RestMethod -Method Post "$BaseUrl/api/engagements/demo"
```

### 19.3 Create and retrieve an engagement

```bash
curl -X POST "$BASE_URL/api/engagements" \
  -H "Content-Type: application/json" \
  -d '{"name":"Authorized assessment","domain":"corp.example","dc":"dc01.corp.example","notes":"Authorization CHG-1234; approved targets and exclusions recorded here."}'

curl "$BASE_URL/api/engagements/ENGAGEMENT_ID"
```

PowerShell:

```powershell
$Body = @{
  name = "Authorized assessment"
  domain = "corp.example"
  dc = "dc01.corp.example"
  notes = "Authorization CHG-1234; approved targets and exclusions recorded here."
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/engagements" -ContentType "application/json" -Body $Body
```

### 19.4 Connect/preflight

This can contact the named target. Use only authorized values.

```bash
curl -X POST "$BASE_URL/api/engagements/ENGAGEMENT_ID/connect" \
  -H "Content-Type: application/json" \
  -d '{"domain":"corp.example","dc":"dc01.corp.example","username":"approved-operator","password":"REDACTED","timeout":3.0}'
```

Use `hashes` instead of `password` only when approved. Valid timeout is 0.2 to
30 seconds. Avoid placing real secrets in shell history; the GUI's masked form
or an approved secret-injection process is preferable.

### 19.5 Start and poll a GREEN/YELLOW run

The `options` keys must match the selected capability's `required_prompts`.

```bash
curl -X POST "$BASE_URL/api/engagements/ENGAGEMENT_ID/run" \
  -H "Content-Type: application/json" \
  -d '{"capability_id":"CAPABILITY_ID","options":{},"actor":"operator"}'

curl "$BASE_URL/api/engagements/ENGAGEMENT_ID/jobs/JOB_ID"
```

### 19.6 Start a specifically approved RED run

Replace both occurrences of `APPROVED_RED_CAPABILITY_ID` with the exact same
ID. Include scoped approval fields only when the capability declares them.

```bash
curl -X POST "$BASE_URL/api/engagements/ENGAGEMENT_ID/run" \
  -H "Content-Type: application/json" \
  -d '{
    "capability_id":"APPROVED_RED_CAPABILITY_ID",
    "options":{},
    "ack":true,
    "force":true,
    "confirm":"APPROVED_RED_CAPABILITY_ID",
    "actor":"operator",
    "approval_token":"APPROVED_SCOPED_TOKEN_IF_REQUIRED",
    "approval_engagement_id":"APPROVAL_ENGAGEMENT_ID_IF_REQUIRED"
  }'
```

The API applies the same server/engine gates as the GUI. A refusal is a stop
condition, not an invitation to weaken the request.

### 19.7 Findings operations

```bash
curl "$BASE_URL/api/engagements/ENGAGEMENT_ID/findings"
curl "$BASE_URL/api/engagements/ENGAGEMENT_ID/findings/FINDING_ID"

curl -X POST "$BASE_URL/api/engagements/ENGAGEMENT_ID/findings/FINDING_ID/explain"

curl -X POST "$BASE_URL/api/engagements/ENGAGEMENT_ID/findings/FINDING_ID/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"retest"}'
```

### 19.8 Vault operations

```bash
curl "$BASE_URL/api/engagements/ENGAGEMENT_ID/vault"

curl -X POST "$BASE_URL/api/engagements/ENGAGEMENT_ID/vault/ITEM_NAME/unmask" \
  -H "Content-Type: application/json" \
  -d '{"scope":"engagement","ttl_seconds":30}'
```

Valid TTL is 5–300 seconds. Unmask is audited.

### 19.9 Rollback operations

```bash
curl "$BASE_URL/api/engagements/ENGAGEMENT_ID/rollback"
curl -X POST "$BASE_URL/api/engagements/ENGAGEMENT_ID/rollback/preview"

curl -X POST "$BASE_URL/api/engagements/ENGAGEMENT_ID/rollback/apply" \
  -H "Content-Type: application/json" \
  -d '{"ack":true,"force":true,"confirm":"YES","session_id":"OPTIONAL_SESSION_ID"}'
```

Preview is offline. Apply contacts the target and requires a live-ready,
preflight-ready engagement.

### 19.10 Closeout and report operations

```bash
curl "$BASE_URL/api/engagements/ENGAGEMENT_ID/closeout"
curl "$BASE_URL/api/engagements/ENGAGEMENT_ID/report"
curl -o engagement-report.md "$BASE_URL/api/engagements/ENGAGEMENT_ID/report.md"
curl -o engagement-report.html "$BASE_URL/api/engagements/ENGAGEMENT_ID/report.html"
```

### 19.11 Guided visit tracking

Only two page visits can be recorded manually:

```bash
curl -X POST "$BASE_URL/api/engagements/ENGAGEMENT_ID/guided" \
  -H "Content-Type: application/json" \
  -d '{"step_id":"green-catalog"}'

curl -X POST "$BASE_URL/api/engagements/ENGAGEMENT_ID/guided" \
  -H "Content-Type: application/json" \
  -d '{"step_id":"glossary"}'
```

Doctor, demo, engagement, connect, observe, and RED milestones complete only
from real application state. They cannot be marked done through the endpoint.

## 20. Troubleshooting without guessing

### Console command is not found

Confirm the virtual environment is active:

```bash
python -c "import sys; print(sys.executable)"
python -m pip show adassassin
```

Then use the direct executable if needed:

```bash
.venv/bin/adassassin --version
```

Windows:

```powershell
.\.venv\Scripts\adassassin.exe --version
```

### Port 8745 is already in use

Start on another local port:

```bash
adassassin --port 8750
```

Then open `http://127.0.0.1:8750`.

### Browser loaded but says it cannot reach the API

1. Keep the browser open.
2. Confirm the server terminal is still running.
3. Read the terminal error.
4. Confirm the browser port matches the server port.
5. Choose **Retry** or **Refresh** after the server is available.

### Engine is in catalog fallback

The full bundled catalog stays visible, but live execution may not be ready.
From the activated environment run:

```bash
python -c "import adaf_attack; print(adaf_attack.__file__)"
python -m pip show adaf-attack
python -m pip install -e .
```

Restart ADAssassin and re-check Doctor.

### Preflight is blocked

Do not try RED or work around the gate. Confirm:

- the active engagement is correct;
- the domain and DC match written scope;
- DNS resolves as expected;
- required DC ports are reachable from the approved workstation;
- the supplied identity/material is correct and authorized;
- local engine dependencies are available.

Read the exact blocking and advisory checks in the right pane.

### Run button is disabled

Check, in order:

1. a capability is selected and its details finished loading;
2. the engagement is not the offline demo for target-interacting work;
3. the active engagement passed preflight for YELLOW/RED;
4. local readiness says ready;
5. every required prompt is filled;
6. the RED typed confirmation exactly matches the capability ID;
7. any declared scoped approval token and approval engagement ID are present;
8. no earlier job is still running.

### Report says items remain

The checklist is evidence, not an error. Review finding dispositions, active
vault unmask state, and every rollback entry. Complete or document each item,
then refresh and generate the report again.

For verbose installation, proxy/TLS, permissions, and platform-specific fixes,
continue in [INSTALLATION.md](INSTALLATION.md).

## 21. Definition of a successfully closed session

- [ ] The intended engagement—not the demo or another customer—was active.
- [ ] Written scope was recorded before target contact.
- [ ] Preflight passed before every target-interacting run.
- [ ] Every executed capability was reviewed immediately before submission.
- [ ] Every RED action had specific approval and exact typed confirmation.
- [ ] Job logs and refusals were reviewed.
- [ ] Findings have explicit, honest dispositions.
- [ ] Vault unmask events are understood and no value remains exposed.
- [ ] Rollback has no unexplained pending or failed work.
- [ ] Markdown and HTML reports were verified and retained appropriately.
- [ ] The console was stopped cleanly.

## Related documents

- [INSTALLATION.md](INSTALLATION.md) — exhaustive Windows, Kali, and macOS setup/troubleshooting
- [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md) — compact field checklist
- [../AUTHORIZED_USE.md](../AUTHORIZED_USE.md) — authorization boundary
- [../SECURITY.md](../SECURITY.md) — product security model and storage behavior
- [../ROADMAP.md](../ROADMAP.md) — production phases and acceptance criteria
