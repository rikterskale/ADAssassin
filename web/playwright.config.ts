import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// End-to-end "user readiness" suite. It boots the real adassassin server (which
// serves the shipped src/adassassin/webapp bundle) and walks the operator
// journey through the actual GUI, exactly as a user would. No domain controller
// is contacted: the whole journey runs against the offline demo.
const PORT = Number(process.env.E2E_PORT ?? 8799);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WEB_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DIR = path.resolve(WEB_DIR, "..");
const VENV_PYTHON = path.join(
  REPO_DIR,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const PYTHON = process.env.ADASSASSIN_E2E_PYTHON
  ? `"${process.env.ADASSASSIN_E2E_PYTHON}"`
  : fs.existsSync(VENV_PYTHON)
    ? `"${VENV_PYTHON}"`
    : process.platform === "win32" ? "python" : "python3";

// Configuration is evaluated again in workers. Storage belongs to the outer
// launcher, which cleans it up only after Playwright stops the server.
const MODE = process.env.ADASSASSIN_E2E_MODE;
const DATA_DIR = process.env.ADASSASSIN_E2E_DATA_DIR;
const ARTIFACT_DIR = process.env.ADASSASSIN_E2E_ARTIFACT_DIR;
if (MODE !== "list" && (MODE !== "run" || !DATA_DIR || !ARTIFACT_DIR)) {
  throw new Error("Run E2E through npm run e2e (including -- --list) so the launcher owns its storage and server.");
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: ARTIFACT_DIR ? path.join(ARTIFACT_DIR, "results") : undefined,
  // The journey shares one server + one engagement store, so run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: MODE === "list" ? undefined : {
    command: `${PYTHON} -m adassassin --no-browser --host 127.0.0.1 --port ${PORT}`,
    cwd: "..",
    env: { ADASSASSIN_DATA_DIR: DATA_DIR!, ADASSASSIN_OPEN_BROWSER: "false" },
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
