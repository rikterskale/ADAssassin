import { Link } from "react-router-dom";
import { CopyButton } from "../components/CopyButton";

const LAUNCH_COMMANDS = `adassassin --help
adassassin --version
adassassin
adassassin --no-browser
adassassin --port 8750
adassassin --host localhost --port 8750 --no-browser`;

const SETTINGS_COMMANDS = `# Bash / zsh
export ADASSASSIN_DATA_DIR="$HOME/adassassin-data"
export ADASSASSIN_HOST="127.0.0.1"
export ADASSASSIN_PORT="8750"
export ADASSASSIN_OPEN_BROWSER="false"
export ADASSASSIN_PREFLIGHT_TTL_SECONDS="900"
export ADASSASSIN_RUN_SYNCHRONOUS="false"
export ADAF_SESSION_VAULT_KEY="<approved Fernet key>"
adassassin

# PowerShell
$env:ADASSASSIN_DATA_DIR = "$env:USERPROFILE\\adassassin-data"
$env:ADASSASSIN_HOST = "127.0.0.1"
$env:ADASSASSIN_PORT = "8750"
$env:ADASSASSIN_OPEN_BROWSER = "false"
$env:ADASSASSIN_PREFLIGHT_TTL_SECONDS = "900"
$env:ADASSASSIN_RUN_SYNCHRONOUS = "false"
$env:ADAF_SESSION_VAULT_KEY = "<approved Fernet key>"
adassassin`;

const API_COMMANDS = `curl http://127.0.0.1:8745/api/health
curl http://127.0.0.1:8745/api/doctor
curl http://127.0.0.1:8745/api/catalog
curl http://127.0.0.1:8745/api/glossary
curl http://127.0.0.1:8745/api/engagements`;

const ENGINE_COMMANDS = `adaf-attack --help
adaf-attack guide
adaf-attack list-capabilities
adaf-attack capability-help <capability-id>
adaf-attack doctor --help
adaf-attack run --help
adaf-attack cleanup --help
adaf-attack support-bundle --help`;

const PAGES = [
  ["Start Here", "/start", "Integrated workflow, risk lanes, commands, settings, and closeout."],
  ["Overview", "/", "Health, Doctor, current workspace, and recent jobs."],
  ["Guided", "/guided", "State-backed novice path from demo through closeout."],
  ["Engagements", "/engagements", "Create, select, and review assessment workspaces."],
  ["Connect", "/connect", "Authorized target details and live preflight."],
  ["Run", "/run", "All capabilities, including blocked entries, typed prompts, gates, and live job recovery."],
  ["Findings", "/findings", "Evidence, explanations, remediation, and status."],
  ["Catalog", "/catalog", "All engine capabilities, including blocked and RED entries."],
  ["Glossary", "/glossary", "Plain-language Active Directory terminology."],
  ["Vault", "/vault", "Secret metadata, audited single-item unmask, and TTL."],
  ["Rollback", "/rollback", "Cleanup inventory, offline preview, and confirmed apply."],
  ["Report", "/report", "Closeout checks and Markdown/HTML evidence export."],
] as const;

export function StartHere() {
  return (
    <>
      <section className="hero">
        <div className="brand-sub">Start here</div>
        <h1>From first click to defensible closeout.</h1>
        <p className="lede">
          Learn the console without touching a target, then follow the same visible workflow for an
          authorized assessment. Nothing is removed in this view: all capabilities, controls, and
          operator commands remain available through the Catalog, navigation, and local API.
        </p>
        <div className="actions">
          <Link className="btn primary" to="/guided">Begin the zero-contact walkthrough</Link>
        </div>
      </section>

      <div className="guide-index" aria-label="Start Here sections">
        <a href="#first-session">First session</a>
        <a href="#risk-lanes">Risk lanes</a>
        <a href="#live-work">Live workflow</a>
        <a href="#console-map">Console map</a>
        <a href="#commands">Commands</a>
        <a href="#closeout">Closeout</a>
      </div>

      <div className="grid">
        <section className="panel span-8" id="first-session">
          <h2>Your first safe session</h2>
          <ol className="steps guide-steps">
            <li>
              <strong>Confirm Console health.</strong> Doctor should pass and say no directory contact.{" "}
              <Link className="linklike" to="/">Check console health</Link>.
            </li>
            <li>
              <strong>Open Guided.</strong> The console normally seeds an offline demo automatically; the button is always available too.{" "}
              <Link className="linklike" to="/guided">Open Guided walkthrough</Link>.
            </li>
            <li>
              <strong>Open Findings.</strong> Select a fixture, choose Explain + remediate, and try each local status.{" "}
              <Link className="linklike" to="/findings">Open demo findings</Link>.
            </li>
            <li>
              <strong>Open the GREEN Catalog.</strong> Inspect prompts, dependencies, approval, noise, and rollback metadata.{" "}
              <Link className="linklike" to="/catalog?lane=green">Browse GREEN capabilities</Link>.
            </li>
            <li>
              <strong>Open Vault and Rollback.</strong> Practice a 30-second unmask and an offline rollback preview.{" "}
              <Link className="linklike" to="/vault">Review the demo vault</Link> and{" "}
              <Link className="linklike" to="/rollback">Preview rollback</Link>.
            </li>
            <li>
              <strong>Generate a Report.</strong> Download both formats and read the closeout checks.{" "}
              <Link className="linklike" to="/report">Review closeout</Link>.
            </li>
          </ol>
        </section>

        <section className="panel span-4" id="risk-lanes">
          <h2>Risk lanes</h2>
          <div className="lane-guide">
            <div><span className="badge green">green</span><p>Local or saved-evidence work. No target contact.</p></div>
            <div><span className="badge yellow">yellow</span><p>Reads an authorized target. Successful preflight required.</p></div>
            <div><span className="badge red">red</span><p>Can change state. Preflight, review, ack, force, and exact typed confirmation are required.</p></div>
          </div>
          <div className="banner-warning">
            The lane is a safety boundary, not a feature filter. RED capabilities remain visible at all times.
          </div>
        </section>

        <section className="panel span-12" id="live-work">
          <h2>Authorized live workflow</h2>
          <ol className="steps guide-steps wide">
            <li><strong>Verify written scope.</strong> Record in-scope domains, DCs, identities, time window, approvals, exclusions, stop conditions, and rollback owner.</li>
            <li><strong>Create a live-ready engagement.</strong> Use a unique name and paste the scope into Scope notes.</li>
            <li><strong>Run Connect preflight.</strong> Enter the authorized domain and DC. Authenticated mode requires an approved username plus one password or NTLM hash and makes one LDAP bind to validate it. A rejection blocks execution and shows a redacted authentication trace with ordered remediation and no automatic retries. The result is bound to that exact target, expires after 15 minutes by default, and is invalidated by a restart or target edit.</li>
            <li><strong>Resolve every blocking check.</strong> Do not continue with YELLOW or RED until the scope bar says preflight ready.</li>
            <li><strong>Select work from Catalog or Run.</strong> Search all capabilities, inspect required prompts and local dependencies, then review the target and safety metadata.</li>
            <li><strong>Run GREEN/YELLOW observe work first.</strong> Watch the live job log and review the resulting evidence.</li>
            <li><strong>Use RED only when the specific action is approved.</strong> Re-check target, options, noise, approval, and rollback; then type the capability ID exactly.</li>
            <li><strong>Triage findings and preserve evidence.</strong> Explain, remediate, and set each finding to open, accepted, fixed, or retest.</li>
            <li><strong>Preview and complete rollback.</strong> Preview is offline. Apply contacts the target and requires typed YES.</li>
            <li><strong>Generate the report and satisfy closeout.</strong> Resolve pending rollback, active unmasks, and open findings, then download the checksummed evidence bundle.</li>
          </ol>
          <div className="actions guide-actions">
            <Link className="btn primary" to="/engagements">Create engagement</Link>
            <Link className="btn ghost" to="/connect">Open Connect</Link>
            <Link className="btn ghost" to="/run">Open Run</Link>
            <Link className="btn ghost" to="/report">Open Report</Link>
          </div>
        </section>

        <section className="panel span-12" id="console-map">
          <h2>Complete console map</h2>
          <p className="muted">Every operator surface is listed here and remains directly reachable.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Surface</th><th>Purpose</th><th>Open</th></tr></thead>
              <tbody>
                {PAGES.map(([label, to, purpose]) => (
                  <tr key={to}>
                    <td>{label}</td>
                    <td>{purpose}</td>
                    <td><Link to={to}>Open {label}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted guide-note">
            Press <span className="kbd">Ctrl K</span> or <span className="kbd">⌘ K</span> from anywhere to search pages,
            engagements, and capabilities. The Catalog defaults to all lanes; readiness problems are shown, not hidden.
          </p>
        </section>

        <section className="panel span-6" id="commands">
          <div className="id-row command-heading">
            <h2>Complete launch CLI</h2>
            <CopyButton value={LAUNCH_COMMANDS} label="Copy launch commands" />
          </div>
          <pre className="log guide-command">{LAUNCH_COMMANDS}</pre>
          <p className="muted">Only loopback hosts are accepted. CLI flags override matching environment settings.</p>
        </section>

        <section className="panel span-6">
          <div className="id-row command-heading">
            <h2>Runtime settings</h2>
            <CopyButton value={SETTINGS_COMMANDS} label="Copy runtime settings" />
          </div>
          <pre className="log guide-command">{SETTINGS_COMMANDS}</pre>
          <p className="muted">Set the live vault key through your approved secret-delivery process; never commit it.</p>
        </section>

        <section className="panel span-12">
          <div className="id-row command-heading">
            <h2>Visible local API</h2>
            <CopyButton value={API_COMMANDS} label="Copy API commands" />
          </div>
          <pre className="log guide-command">{API_COMMANDS}</pre>
          <p className="muted">
            <a href="/operator-guide.md">Download the complete packaged guide</a> for all 30 local API operations and every request body, or inspect the{' '}
            <a href="/openapi.json">live OpenAPI document</a>. Both work from an installed wheel without a repository
            checkout. The API is intentionally local-only and has no remote control-plane mode.
          </p>
        </section>

        <section className="panel span-12">
          <div className="id-row command-heading">
            <h2>Underlying engine CLI</h2>
            <CopyButton value={ENGINE_COMMANDS} label="Copy engine discovery commands" />
          </div>
          <pre className="log guide-command">{ENGINE_COMMANDS}</pre>
          <p className="muted">
            ADAssassin does not conceal the installed ADAF-ATTACK command surface. Use its built-in help to inspect
            workflows, profiles, sessions, rollback, reporting, support, and every capability option. GUI safety gates
            still apply to GUI runs; direct engine use remains subject to the same written authorization.
          </p>
        </section>

        <section className="panel span-8" id="closeout">
          <h2>Closeout is part of the run</h2>
          <ol className="steps">
            <li>Check Vault for exposed material and wait for any active unmask TTL to expire.</li>
            <li>Preview Rollback, apply approved cleanup, and investigate every failed or pending entry.</li>
            <li>Give every finding an explicit disposition: open, accepted, fixed, or retest.</li>
            <li>Generate and retain the Markdown, HTML, and checksummed evidence bundle in the approved evidence location.</li>
            <li>Stop the local server with <span className="kbd">Ctrl C</span> in its terminal.</li>
          </ol>
        </section>

        <section className="panel span-4">
          <h2>If you get stuck</h2>
          <ul className="steps">
            <li>Use Refresh after a transient local API error.</li>
            <li>Read the exact blocking check or capability readiness message.</li>
            <li>Confirm the active engagement in the scope bar before changing anything.</li>
            <li>Return to Guided to see the next state-backed milestone.</li>
            <li>Use the repository installation guide for platform-specific repair commands.</li>
          </ul>
        </section>
      </div>
    </>
  );
}
