# ADAssassin installation guide

**Authorized internal red-team use only.** Written authorization is required
before any live target work. Availability of this repository is not
authorization.

This guide installs ADAssassin on **Windows**, **Kali Linux**, and **macOS**.
It is written so a novice operator can follow it top to bottom without
skipping steps. Every common failure includes:

1. what you will see,
2. how to collect verbose logs,
3. the fix action.

After install, use [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md) for doctor → demo
→ connect → observe → RED → report.

| Item | Value |
| --- | --- |
| Product | ADAssassin `0.8.0` |
| Python | `>=3.11,<3.15` (3.11, 3.12, 3.13, or 3.14) |
| Engine pin | `adaf-attack==0.10.1` @ `fdb60b90b910ba3dcbd582e2c72ce48189191214` |
| Default bind | `127.0.0.1:8745` only |
| Repo | https://github.com/rikterskale/ADAssassin |

ADAssassin wraps the pinned ADAF-ATTACK engine. It does **not** reimplement
capabilities. The engine is pulled from GitHub as a pip dependency during
install, so first install needs network access to GitHub.

---

## 0. Before you start (all platforms)

### 0.1 Confirm authorization

You may install and use ADAssassin only when:

- you have written authorization for the target environment,
- every domain / DC / identity you will enter is inside that scope,
- you will keep secrets in the engagement vault and treat them as evidence.

See [AUTHORIZED_USE.md](../AUTHORIZED_USE.md) and [SECURITY.md](../SECURITY.md).

### 0.2 What you need

| Requirement | Why |
| --- | --- |
| Python 3.11–3.14 | Runtime for FastAPI console + engine |
| `git` | Engine is installed from a pinned Git commit |
| Network to `github.com` | First `pip install` fetches ADAF-ATTACK |
| Modern browser | Console UI at `http://127.0.0.1:8745` |
| Optional: Node.js 20+ | Only if you rebuild the React UI from `web/` |

You do **not** need a domain controller to install, run Doctor, or seed the
offline demo.

### 0.3 Choose your OS section

| Platform | Jump to |
| --- | --- |
| Windows 10/11 / Server | [Section A — Windows](#a-windows) |
| Kali Linux | [Section B — Kali Linux](#b-kali-linux) |
| macOS | [Section C — macOS](#c-macos) |

Shared verify / uninstall / deep troubleshooting:

- [Section D — Verify install](#d-verify-install-all-platforms)
- [Section E — Uninstall](#e-uninstall)
- [Section F — Deep troubleshooting](#f-deep-troubleshooting-cross-platform)

### 0.4 Enable verbose logging early

When something fails, capture the full transcript before you change settings.

**Bash / zsh (Kali, macOS):**

```bash
mkdir -p "$HOME/adassassin-install-logs"
LOG="$HOME/adassassin-install-logs/install-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1
set -x
echo "Logging to $LOG"
```

**PowerShell (Windows):**

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\adassassin-install-logs" | Out-Null
$Log = Join-Path $env:USERPROFILE "adassassin-install-logs\install-$(Get-Date -Format yyyyMMdd-HHmmss).log"
Start-Transcript -Path $Log -Force
$VerbosePreference = "Continue"
Write-Host "Logging to $Log"
```

Also useful everywhere:

```bash
export PIP_VERBOSE=1                 # Bash/zsh
# PowerShell:
$env:PIP_VERBOSE = "1"
python -m pip install -v ...         # verbose pip
```

---

## A. Windows

Supported: Windows 10, Windows 11, Windows Server with Python 3.11–3.14.

### A1. Install prerequisites

#### A1.1 Install Git for Windows

1. Download Git for Windows from https://git-scm.com/download/win
2. Run the installer.
3. Recommended options:
   - **Git from the command line and also from 3rd-party software**
   - **Use the OpenSSL library**
   - **Checkout as-is, commit Unix-style line endings** (or the Windows default if your org requires it)
4. Finish, then **close and reopen** PowerShell.

Verify:

```powershell
git --version
where.exe git
```

**Error:** `'git' is not recognized...`

| Collect | Fix |
| --- | --- |
| `where.exe git` | Empty output means PATH is missing Git |
| Reopen PowerShell after install | PATH updates need a new shell |
| Install location | Default is `C:\Program Files\Git\cmd\git.exe` |

Fix:

```powershell
# Temporary for this shell:
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
git --version
```

If still missing, reinstall Git and tick the PATH option, then open a **new**
PowerShell window.

#### A1.2 Install Python 3.11–3.14

1. Download from https://www.python.org/downloads/windows/
2. Run the installer.
3. **Check** “Add python.exe to PATH”.
4. Choose “Install Now” (or Customize and keep pip + venv).
5. Close and reopen PowerShell.

Verify:

```powershell
py -0p
py -3.12 --version
python --version
where.exe python
where.exe py
```

Expect a version in `3.11`–`3.14`.

**Error:** `Python was not found; run without arguments to install from the Microsoft Store`

| Collect | Fix |
| --- | --- |
| `Get-Command python -All \| Format-List *` | Store stub often shadows real Python |
| `py -0p` | Shows installed py-launcher interpreters |

Fix:

1. Install python.org Python with **Add to PATH**.
2. Disable the Store alias:
   - Settings → Apps → Advanced app settings → App execution aliases
   - Turn **off** `python.exe` and `python3.exe`
3. New PowerShell:

```powershell
py -3.12 -c "import sys; print(sys.executable); print(sys.version)"
```

**Error:** Version is 3.10 or older / 3.15+

```powershell
py -0p
# Install a supported build, then always invoke it explicitly:
py -3.12 --version
```

#### A1.3 Confirm TLS / network to GitHub

```powershell
Test-NetConnection github.com -Port 443
git ls-remote https://github.com/rikterskale/ADAssassin.git HEAD
git ls-remote https://github.com/rikterskale/ADAF-ATTACK.git fdb60b90b910ba3dcbd582e2c72ce48189191214
```

**Error:** timeout / proxy / SSL failures — see [F3](#f3-github--tls--proxy-failures).

### A2. Get the source

```powershell
cd $env:USERPROFILE\Documents
git clone https://github.com/rikterskale/ADAssassin.git
cd ADAssassin
git status
git rev-parse --short HEAD
```

**Error:** `fatal: destination path 'ADAssassin' already exists`

```powershell
cd ADAssassin
git fetch origin
git checkout main
git pull --ff-only origin main
```

**Error:** `Authentication failed` on a private fork

Use a GitHub PAT or SSH remote your org provides. Do not embed tokens in the
docs or shell history.

### A3. Create and activate a virtual environment

Use the py launcher so you do not accidentally pick Store Python:

```powershell
cd $env:USERPROFILE\Documents\ADAssassin
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -c "import sys; print(sys.executable); print(sys.version)"
Get-Command python | Format-List Source
```

The `python` path **must** contain `.venv\Scripts\python.exe`.

**Error:** `...\Activate.ps1 cannot be loaded because running scripts is disabled`

```powershell
Get-ExecutionPolicy -List
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\.venv\Scripts\Activate.ps1
```

If policy is locked by GPO, activate via cmd shim:

```powershell
cmd /c ".\.venv\Scripts\activate.bat && python -c \"import sys; print(sys.executable)\""
```

Or call venv Python directly without activating:

```powershell
.\.venv\Scripts\python.exe -m pip --version
```

### A4. Upgrade pip tooling

```powershell
python -m pip install -U pip setuptools wheel
python -m pip --version
```

**Error:** `No module named pip`

```powershell
py -3.12 -m ensurepip --upgrade
.\.venv\Scripts\python.exe -m pip install -U pip setuptools wheel
```

### A5. Install ADAssassin

From the repo root with the venv active:

```powershell
$env:PIP_VERBOSE = "1"
python -m pip install -e ".[dev]" 2>&1 | Tee-Object -FilePath "$env:USERPROFILE\adassassin-install-logs\pip-install.log"
```

Operator-only (no pytest/ruff):

```powershell
python -m pip install -e .
```

This installs FastAPI/uvicorn and the pinned ADAF-ATTACK git commit.

**Error:** `Failed to build...` / cannot find git while installing `adaf-attack`

| Collect | Fix |
| --- | --- |
| `git --version` | Install/fix Git PATH |
| `python -m pip install -v "adaf-attack @ git+https://github.com/rikterskale/ADAF-ATTACK.git@fdb60b90b910ba3dcbd582e2c72ce48189191214"` | Isolates engine install |

**Error:** long compile failures around `cryptography` / `ldap3` / native wheels

```powershell
python -m pip install -U pip setuptools wheel
python -m pip cache purge
python -m pip install -e ".[dev]" --no-cache-dir -v
```

If corporate SSL inspection breaks wheels, see [F3](#f3-github--tls--proxy-failures).

### A6. Windows verify (quick)

```powershell
adassassin --version
python -c "from adassassin import ENGINE_PIN, ENGINE_COMMIT; print(ENGINE_PIN, ENGINE_COMMIT)"
python -c "from adassassin.catalog import static_catalog; c=static_catalog(); print(c['source'], c['count'])"
python -m pytest -q
```

Expect:

- version `0.8.0`
- pin `0.10.1` and commit `fdb60b90...`
- catalog count `92`
- pytest all passed

Continue at [Section D](#d-verify-install-all-platforms).

### A7. Optional: rebuild the React UI on Windows

Only needed if you change files under `web/`.

1. Install Node.js LTS from https://nodejs.org/
2. New PowerShell:

```powershell
node --version
npm --version
cd $env:USERPROFILE\Documents\ADAssassin\web
npm install 2>&1 | Tee-Object -FilePath "$env:USERPROFILE\adassassin-install-logs\npm-install.log"
npm run build 2>&1 | Tee-Object -FilePath "$env:USERPROFILE\adassassin-install-logs\npm-build.log"
```

Build output must land in `src\adassassin\webapp\`.

**Error:** `npm` not found — reopen shell after Node install, or use:

```powershell
$env:Path = "$env:ProgramFiles\nodejs;" + $env:Path
```

**Error:** `tsc` / Vite build fails — paste the log; usually fixed by:

```powershell
Remove-Item -Recurse -Force node_modules, dist -ErrorAction SilentlyContinue
npm cache clean --force
npm install
npm run build
```

---

## B. Kali Linux

Supported: Kali with Python 3.11–3.14. Prefer a project venv; do not use
`sudo pip`.

### B1. Update indexes and install prerequisites

```bash
sudo apt update
sudo apt install -y \
  git \
  curl \
  ca-certificates \
  build-essential \
  python3 \
  python3-venv \
  python3-pip \
  python3-dev \
  libffi-dev \
  libssl-dev
```

Verify:

```bash
git --version
python3 --version
python3 -m venv --help >/dev/null && echo "venv ok"
```

**Error:** `Unable to locate package python3-venv`

```bash
cat /etc/os-release
sudo apt update
sudo apt install -y python3-venv
```

**Error:** Python older than 3.11

Install a supported Python from Kali repos or deadsnakes-equivalent only if
your org allows it. Confirm:

```bash
python3 --version
```

If multiple Pythons exist:

```bash
ls /usr/bin/python3*
# Use an explicit binary later, e.g. python3.12
```

### B2. Confirm GitHub reachability

```bash
curl -I https://github.com | head -n 5
git ls-remote https://github.com/rikterskale/ADAssassin.git HEAD
git ls-remote https://github.com/rikterskale/ADAF-ATTACK.git fdb60b90b910ba3dcbd582e2c72ce48189191214
```

TLS/proxy failures → [F3](#f3-github--tls--proxy-failures).

### B3. Clone the repository

```bash
cd ~
git clone https://github.com/rikterskale/ADAssassin.git
cd ADAssassin
git status
git rev-parse --short HEAD
```

### B4. Create and activate a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
 which python
python -c "import sys; print(sys.executable); print(sys.version)"
```

`which python` must point inside `.../ADAssassin/.venv/bin/python`.

**Error:** `ensurepip is not available`

```bash
sudo apt install -y python3-venv python3-pip
deactivate 2>/dev/null || true
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
```

**Error:** you accidentally used system pip with `sudo pip install`

Do **not** continue that way. Remove the broken global packages if needed, then
recreate the venv and install only inside it.

### B5. Upgrade pip tooling

```bash
python -m pip install -U pip setuptools wheel
python -m pip --version
```

### B6. Install ADAssassin

```bash
export PIP_VERBOSE=1
python -m pip install -e ".[dev]" 2>&1 | tee "$HOME/adassassin-install-logs/pip-install.log"
```

Operator-only:

```bash
python -m pip install -e .
```

**Error:** `error: command 'gcc' failed` while building a dependency

```bash
sudo apt install -y build-essential python3-dev libffi-dev libssl-dev
python -m pip install -U pip setuptools wheel
python -m pip install -e ".[dev]" --no-cache-dir -v
```

**Error:** `Failed to fetch ... ADAF-ATTACK` / git clone during pip

```bash
git ls-remote https://github.com/rikterskale/ADAF-ATTACK.git fdb60b90b910ba3dcbd582e2c72ce48189191214
python -m pip install -v "adaf-attack @ git+https://github.com/rikterskale/ADAF-ATTACK.git@fdb60b90b910ba3dcbd582e2c72ce48189191214"
```

### B7. Kali verify (quick)

```bash
adassassin --version
python -c "from adassassin import ENGINE_PIN, ENGINE_COMMIT; print(ENGINE_PIN, ENGINE_COMMIT)"
python -c "from adassassin.catalog import static_catalog; c=static_catalog(); print(c['source'], c['count'])"
python -m pytest -q
```

Continue at [Section D](#d-verify-install-all-platforms).

### B8. Optional: rebuild React UI on Kali

```bash
# Node via NodeSource or nvm per your org standard. Example with apt node if available:
sudo apt install -y nodejs npm   # only if versions are recent enough
node --version
npm --version
cd ~/ADAssassin/web
npm install 2>&1 | tee "$HOME/adassassin-install-logs/npm-install.log"
npm run build 2>&1 | tee "$HOME/adassassin-install-logs/npm-build.log"
```

If Kali’s Node is too old, install Node 20+ via nvm:

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# reopen shell
nvm install 20
nvm use 20
cd ~/ADAssassin/web
npm install && npm run build
```

---

## C. macOS

Supported: macOS with Python 3.11–3.14 from python.org or Homebrew. Do **not**
use the ancient system `/usr/bin/python3` as your only interpreter if it is
outside 3.11–3.14.

### C1. Install prerequisites

#### C1.1 Xcode Command Line Tools (provides `git` and compilers)

```bash
xcode-select --install
git --version
clang --version
```

**Error:** `xcode-select: note: install requested` and nothing finishes

Open **System Settings → General → Software Update**, complete the CLT
install, reboot if prompted, then rerun `git --version`.

#### C1.2 Install a supported Python

**Option A — python.org**

1. Download macOS 64-bit universal2 installer for 3.12 or 3.13 from
   https://www.python.org/downloads/macos/
2. Run the `.pkg`
3. Open a new Terminal

**Option B — Homebrew**

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# Follow the "Next steps" it prints to add brew to PATH, then:
brew update
brew install python@3.12 git
```

Verify you are **not** on an unsupported Apple stub:

```bash
command -v python3
python3 --version
/usr/bin/python3 --version || true
which -a python3
```

Prefer the Homebrew or python.org binary under `/usr/local` / `/opt/homebrew` /
`Library/Frameworks`.

**Error:** `python3` is 3.9 from Xcode

```bash
brew install python@3.12
echo 'export PATH="$(brew --prefix python@3.12)/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile
python3.12 --version
```

### C2. Confirm GitHub reachability

```bash
curl -I https://github.com | head -n 5
git ls-remote https://github.com/rikterskale/ADAssassin.git HEAD
git ls-remote https://github.com/rikterskale/ADAF-ATTACK.git fdb60b90b910ba3dcbd582e2c72ce48189191214
```

### C3. Clone the repository

```bash
cd ~
git clone https://github.com/rikterskale/ADAssassin.git
cd ADAssassin
git status
git rev-parse --short HEAD
```

### C4. Create and activate a virtual environment

```bash
python3.12 -m venv .venv   # or: python3 -m venv .venv if that is 3.11–3.14
source .venv/bin/activate
which python
python -c "import sys; print(sys.executable); print(sys.version)"
```

### C5. Upgrade pip tooling

```bash
python -m pip install -U pip setuptools wheel
python -m pip --version
```

### C6. Install ADAssassin

```bash
export PIP_VERBOSE=1
python -m pip install -e ".[dev]" 2>&1 | tee "$HOME/adassassin-install-logs/pip-install.log"
```

**Error:** `xcrun: error: invalid active developer path`

```bash
xcode-select --install
sudo xcode-select -s /Library/Developer/CommandLineTools
```

**Error:** SSL `CERTIFICATE_VERIFY_FAILED` with python.org Python

```bash
# python.org installers ship an Install Certificates command, e.g.:
open "/Applications/Python 3.12/Install Certificates.command"
# then retry pip
python -m pip install -e ".[dev]" -v
```

### C7. macOS verify (quick)

```bash
adassassin --version
python -c "from adassassin import ENGINE_PIN, ENGINE_COMMIT; print(ENGINE_PIN, ENGINE_COMMIT)"
python -c "from adassassin.catalog import static_catalog; c=static_catalog(); print(c['source'], c['count'])"
python -m pytest -q
```

Continue at [Section D](#d-verify-install-all-platforms).

### C8. Optional: rebuild React UI on macOS

```bash
brew install node
node --version
npm --version
cd ~/ADAssassin/web
npm install 2>&1 | tee "$HOME/adassassin-install-logs/npm-install.log"
npm run build 2>&1 | tee "$HOME/adassassin-install-logs/npm-build.log"
```

---

## D. Verify install (all platforms)

Run these after the platform-specific install. Keep the venv activated.

### D1. Dependency integrity

```bash
python -m pip check
python -m pip show adassassin adaf-attack fastapi uvicorn
```

Expect no broken requirements. `adaf-attack` version should be `0.10.1`.

### D2. Console boot (offline)

```bash
adassassin --no-browser
```

In another terminal (venv active):

```bash
# Bash/zsh
curl -s http://127.0.0.1:8745/api/health | python -m json.tool
curl -s http://127.0.0.1:8745/api/doctor | python -m json.tool
```

```powershell
# PowerShell
Invoke-RestMethod http://127.0.0.1:8745/api/health | ConvertTo-Json -Depth 6
Invoke-RestMethod http://127.0.0.1:8745/api/doctor | ConvertTo-Json -Depth 6
```

Expect:

| Field | Expected |
| --- | --- |
| `product` | `adassassin` |
| `version` | `0.8.0` |
| `phase` | `6` |
| `catalog_count` | `92` |
| `engine_pin` | `0.10.1` |
| `bind` | starts with `127.0.0.1:` |
| doctor `contacts_directory` | `false` |

Open a browser to `http://127.0.0.1:8745/` and confirm the authorized-use banner.

### D3. Offline demo smoke

With the console running, in the UI:

1. Guided → **Seed offline demo**
2. Findings shows three fixtures
3. Report → **Generate report** → download Markdown/HTML

Or via API:

```bash
curl -s -X POST http://127.0.0.1:8745/api/engagements/demo | python -m json.tool
```

### D4. Stop the console

In the terminal running `adassassin`, press `Ctrl+C`.

---

## E. Uninstall

### E1. Remove the project venv (keeps engagement data)

**Windows (PowerShell):**

```powershell
deactivate
cd $env:USERPROFILE\Documents\ADAssassin
Remove-Item -Recurse -Force .venv
```

**Kali / macOS:**

```bash
deactivate
cd ~/ADAssassin
rm -rf .venv
```

### E2. Engagement / workspace data (optional, irreversible)

Default console data directory is `~/.adassassin` (override with
`ADASSASSIN_DATA_DIR`).

**Windows:**

```powershell
# Confirm path first
python -c "from pathlib import Path; print(Path.home() / '.adassassin')"
Remove-Item -Recurse -Force "$env:USERPROFILE\.adassassin"
```

**Kali / macOS:**

```bash
ls -la ~/.adassassin
rm -rf ~/.adassassin
```

Delete only after evidence-retention approval.

### E3. Remove the source checkout (optional)

```bash
# after deactivate + data decision
rm -rf ~/ADAssassin                 # Kali/macOS
Remove-Item -Recurse -Force $env:USERPROFILE\Documents\ADAssassin   # Windows
```

---

## F. Deep troubleshooting (cross-platform)

### F1. Collect a support bundle of facts (no secrets)

Run inside the venv:

```bash
python - <<'PY'
import os, platform, sys, traceback
print("platform:", platform.platform())
print("python:", sys.version)
print("executable:", sys.executable)
print("prefix:", sys.prefix)
try:
    import adassassin, adaf_attack
    print("adassassin:", adassassin.__version__, adassassin.ENGINE_PIN, adassassin.ENGINE_COMMIT)
    print("adaf_attack:", getattr(adaf_attack, "__version__", "?"), adaf_attack.__file__)
except Exception:
    traceback.print_exc()
print("ADASSASSIN_DATA_DIR:", os.environ.get("ADASSASSIN_DATA_DIR"))
print("HTTP(S)_PROXY:", os.environ.get("HTTP_PROXY"), os.environ.get("HTTPS_PROXY"))
PY
python -m pip freeze
python -m pip check
```

Do **not** paste passwords, tickets, hashes, or customer hostnames into tickets.

### F2. `adassassin` command not found

Symptoms: `command not found` / `'adassassin' is not recognized`

Verbose check:

```bash
which python
python -m pip show -f adassassin | head
python -m adassassin --help
```

Fix actions:

1. Confirm venv is active (`which python` shows `.venv`).
2. Reinstall scripts entry point:

```bash
python -m pip install -e .
```

3. Invoke via module if PATH shim is broken:

```bash
python -m adassassin --no-browser
```

Windows equivalent:

```powershell
.\.venv\Scripts\python.exe -m adassassin --no-browser
```

### F3. GitHub / TLS / proxy failures

Symptoms during `pip install` or `git clone`:

- `Could not find a version that satisfies...` for the git URL
- `SSLCertVerificationError`
- `ProxyError`
- `Failed to establish a new connection`

Collect:

```bash
curl -vI https://github.com 2>&1 | tee /tmp/github-tls.txt
git -c http.version=HTTP/1.1 ls-remote https://github.com/rikterskale/ADAF-ATTACK.git HEAD
env | grep -i proxy
python -m pip install -v "adaf-attack @ git+https://github.com/rikterskale/ADAF-ATTACK.git@fdb60b90b910ba3dcbd582e2c72ce48189191214"
```

Fix actions:

| Situation | Action |
| --- | --- |
| Corporate proxy | Set `HTTPS_PROXY`/`HTTP_PROXY` to the org proxy URL; retry |
| SSL inspection MITM | Install the corp root CA into the OS trust store / certifi bundle your org documents |
| Git blocked but HTTPS wheel allowed | Obtain an approved ADAF-ATTACK wheel through your release channel and install ADAssassin after pre-installing that wheel into the venv |
| Transient network | Retry with `python -m pip install -e ".[dev]" --no-cache-dir` |

Example proxy (replace with your org values):

```bash
export HTTPS_PROXY="http://proxy.example.local:8080"
export HTTP_PROXY="http://proxy.example.local:8080"
```

### F4. Port `8745` already in use

Symptoms: `Address already in use` / WinError 10048

```bash
# Linux/macOS
ss -ltnp | grep 8745 || lsof -i :8745
# Windows PowerShell
netstat -ano | findstr :8745
```

Fix:

```bash
adassassin --port 8750 --no-browser
```

Or stop the other process after confirming it is safe to kill.

### F5. Browser opens but API calls fail / blank UI

Collect:

```bash
curl -v http://127.0.0.1:8745/api/health
curl -v http://127.0.0.1:8745/
ls src/adassassin/webapp
```

Fix actions:

1. Confirm you are hitting `127.0.0.1`, not a remote host.
2. Confirm `src/adassassin/webapp/index.html` exists (shipped fallback).
3. If you customized UI, rebuild: `cd web && npm install && npm run build`.
4. Hard-refresh the browser (cache).

### F6. Engine import warn in Doctor

Doctor shows engine status `warn` and catalog still has 92 capabilities.

That is expected when `adaf-attack` failed to import: catalog falls back to
bundled `src/adassassin/data/catalog.json`. Console Doctor/demo still work
offline. Live capability execution needs a successful engine import.

Fix:

```bash
python -c "import adaf_attack; print(adaf_attack.__version__, adaf_attack.__file__)"
python -m pip install -v "adaf-attack @ git+https://github.com/rikterskale/ADAF-ATTACK.git@fdb60b90b910ba3dcbd582e2c72ce48189191214"
python -m pip install -e .
```

### F7. Pytest failures after install

```bash
python -m pytest tests/ -vv --maxfail=1 --tb=long 2>&1 | tee "$HOME/adassassin-install-logs/pytest.log"
```

Common causes:

| Failure | Fix |
| --- | --- |
| Import errors for `adaf_attack` | Reinstall pinned engine (F6) |
| Wrong Python | Recreate venv with 3.11–3.14 |
| Stale editable install | `python -m pip install -e ".[dev]"` again |

### F8. Data directory permissions

Symptoms: Doctor `data-dir` fail; cannot create engagements.

```bash
python - <<'PY'
from pathlib import Path
p = Path.home() / ".adassassin"
print(p)
p.mkdir(parents=True, exist_ok=True)
(p / "write-test").write_text("ok", encoding="utf-8")
(p / "write-test").unlink()
print("writable")
PY
```

Or point data elsewhere:

```bash
export ADASSASSIN_DATA_DIR="$HOME/adassassin-data"   # Bash/zsh
# PowerShell:
$env:ADASSASSIN_DATA_DIR = "$env:USERPROFILE\adassassin-data"
adassassin --no-browser
```

---

## G. Configuration reference

| Variable / flag | Meaning |
| --- | --- |
| `ADASSASSIN_DATA_DIR` | Override data root (default `~/.adassassin`) |
| `ADASSASSIN_HOST` | Loopback bind host only (default `127.0.0.1`) |
| `ADASSASSIN_PORT` | Bind port (default `8745`) |
| `ADASSASSIN_OPEN_BROWSER` | Open browser on start (`true`/`false`) |
| `ADAF_SESSION_VAULT_KEY` | Operator-supplied Fernet key for live engine vault evidence |
| `adassassin --host` | Loopback bind host (`127.0.0.1` or `localhost`) |
| `adassassin --port` | CLI bind port |
| `adassassin --no-browser` | Do not open a browser |
| `adassassin --version` | Print version |

Non-loopback binds such as `0.0.0.0` are refused. ADAssassin is not a remote
or multi-user service. Before collecting or unmasking live vault material, load
the approved engagement Fernet key into `ADAF_SESSION_VAULT_KEY`; use the same
key after restart. Never paste that key into source, logs, reports, or support
requests. See [SECURITY.md](../SECURITY.md).

---

## H. What success looks like

You are done with installation when all of the following are true:

1. Venv Python is 3.11–3.14 and `adassassin --version` prints `0.8.0`
2. `ENGINE_PIN` is `0.10.1` and commit starts with `fdb60b90`
3. Catalog count is `92`
4. `adassassin --no-browser` serves `/api/health` on `127.0.0.1`
5. Doctor reports `contacts_directory: false`
6. Offline demo seeds three findings
7. (Optional) `python -m pytest` is green

Next: [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md).

---

## Related documents

- [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md) — day-to-day operator path
- [ROADMAP.md](../ROADMAP.md) — product phases and acceptance
- [AUTHORIZED_USE.md](../AUTHORIZED_USE.md)
- [SECURITY.md](../SECURITY.md)
