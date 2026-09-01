import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// End-to-end "user readiness" suite. It boots the real adassassin server (which
// serves the shipped src/adassassin/webapp bundle) and walks the operator
// journey through the actual GUI, exactly as a user would. No domain controller
// is contacted: the whole journey runs against the offline demo.
const PORT = Number(process.env.E2E_PORT ?? 8799);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Isolate engagement data in a throwaway temp dir so the E2E run never touches
// a real ~/.adassassin, and start from a clean slate every run.
const DATA_DIR = path.join(os.tmpdir(), "adassassin-e2e-data");
try {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
} catch {
  /* first run: nothing to clean */
}

export default defineConfig({
  testDir: "./e2e",
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
  webServer: {
    command: `python -m adassassin --no-browser --port ${PORT}`,
    cwd: "..",
    env: { ADASSASSIN_DATA_DIR: DATA_DIR, ADASSASSIN_OPEN_BROWSER: "false" },
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
