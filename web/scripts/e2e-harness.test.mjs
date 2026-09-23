import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { runE2E } from "./run-e2e.mjs";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAYWRIGHT = path.join(WEB, "node_modules/@playwright/test/cli.js");
const scratch = path.join(WEB, ".playwright");
await mkdir(scratch, { recursive: true });

async function fixture(t) {
  const root = await realpath(await mkdtemp(path.join(scratch, "harness-")));
  t.after(async () => {
    // Only remove this test's resolved allocation, never an environment path.
    assert.equal(path.dirname(await realpath(root)), await realpath(scratch));
    await rm(root, { recursive: true, maxRetries: 3, retryDelay: 100 });
  });
  return root;
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return String(port);
}

async function files(dir) {
  return readdir(dir).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
}

async function stub(t) {
  const root = await fixture(t);
  const cli = path.join(root, "stub.mjs");
  await writeFile(cli, `
    import { writeFile, rename, mkdir } from 'node:fs/promises';
    import path from 'node:path';
    const args = process.argv.slice(2);
    const data = process.env.ADASSASSIN_E2E_DATA_DIR;
    const artifacts = process.env.ADASSASSIN_E2E_ARTIFACT_DIR;
    const record = { args, data, artifacts, port: process.env.E2E_PORT,
      sensitive: 'ADAF_SESSION_VAULT_KEY' in process.env,
      application: 'ADASSASSIN_DATA_DIR' in process.env,
      python: process.env.ADASSASSIN_E2E_PYTHON };
    await writeFile('record-' + process.pid + '.json', JSON.stringify(record));
    if (data) {
      await writeFile(path.join(data, 'active'), 'owned');
      await writeFile(path.join(artifacts, 'retained.txt'), 'diagnostic');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    if (args.includes('--replace-data')) {
      await rename(data, data + '-moved');
      await writeFile(data, 'replacement');
    }
    if (args.includes('--abnormal')) process.kill(process.pid, 'SIGKILL');
    if (args.includes('--fail')) process.exitCode = 17;
  `);
  const messages = [];
  return {
    root, messages,
    options: { webDir: root, cli, stdio: "ignore", log: (line) => messages.push(line),
      env: { ...process.env, E2E_PORT: await freePort() } },
    records: async () => Promise.all((await files(root)).filter((name) => name.startsWith("record-"))
      .map(async (name) => JSON.parse(await readFile(path.join(root, name), "utf8")))),
  };
}

test("completion forwards arguments and exit status, cleans owned data, and retains artifacts", async (t) => {
  const f = await stub(t);
  await mkdir(path.join(f.root, ".playwright"));
  await writeFile(path.join(f.root, ".playwright", "unrelated.txt"), "keep");
  f.options.env.ADAF_SESSION_VAULT_KEY = "synthetic-do-not-forward";
  f.options.env.ADASSASSIN_DATA_DIR = "synthetic-do-not-use";
  f.options.env.ADASSASSIN_E2E_DATA_DIR = f.root; // never a cleanup target
  f.options.env.ADASSASSIN_E2E_PYTHON = "synthetic-python-path";
  for (const expected of [0, 17]) {
    assert.equal(await runE2E(["--reporter", "list", ...(expected ? ["--fail"] : [])], f.options), expected);
  }
  const records = await f.records();
  assert.equal(records.length, 2);
  for (const record of records) {
    assert.deepEqual(record.args.slice(0, 3), ["test", "--reporter", "list"]);
    assert.equal(record.sensitive, false);
    assert.equal(record.application, false);
    assert.equal(record.python, "synthetic-python-path");
    assert.equal(await readFile(path.join(record.artifacts, "retained.txt"), "utf8"), "diagnostic");
    await assert.rejects(realpath(record.data), { code: "ENOENT" });
  }
  assert.notEqual(records[0].artifacts, records[1].artifacts);
  assert.equal(await readFile(path.join(f.root, ".playwright", "unrelated.txt"), "utf8"), "keep");
});

test("concurrent runs receive separate data and artifact directories", async (t) => {
  const f = await stub(t);
  const other = { ...f.options, env: { ...f.options.env, E2E_PORT: await freePort() } };
  assert.deepEqual(await Promise.all([runE2E([], f.options), runE2E([], other)]), [0, 0]);
  const records = await f.records();
  assert.equal(new Set(records.map((r) => r.data)).size, 2);
  assert.equal(new Set(records.map((r) => r.artifacts)).size, 2);
  assert.deepEqual((await files(path.join(f.root, ".playwright"))).filter((name) => name.startsWith("data-")), []);
});

test("listing and help allocate no engagement data or artifacts", async (t) => {
  const f = await stub(t);
  assert.equal(await runE2E(["--list"], f.options), 0);
  assert.equal(await runE2E(["--help"], f.options), 0);
  assert.deepEqual(await files(path.join(f.root, ".playwright")), []);
  assert.deepEqual(await files(path.join(f.root, "test-results")), []);
  for (const record of await f.records()) assert.equal(record.data, undefined);
});

test("occupied ports fail before starting a child or allocating engagement data", async (t) => {
  const f = await stub(t);
  const sentinel = createServer();
  await new Promise((resolve) => sentinel.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => sentinel.close(resolve)));
  f.options.env.E2E_PORT = String(sentinel.address().port);
  assert.equal(await runE2E([], f.options), 1);
  assert.equal((await f.records()).length, 0);
  assert.deepEqual(await files(path.join(f.root, ".playwright")), []);
  assert.match(f.messages.join("\n"), /port .* unavailable/);
  assert.equal(sentinel.listening, true);
});

test("spawn failure cleans the allocation and reports the failure", async (t) => {
  const f = await stub(t);
  assert.equal(await runE2E([], { ...f.options, executable: path.join(f.root, "missing-node") }), 1);
  assert.deepEqual(await files(path.join(f.root, ".playwright")), []);
  assert.match(f.messages.join("\n"), /ENOENT/);
});

test("linked storage roots are refused without touching their targets", async (t) => {
  const f = await stub(t);
  const target = await fixture(t);
  await writeFile(path.join(target, "sentinel"), "keep");
  await symlink(target, path.join(f.root, ".playwright"), process.platform === "win32" ? "junction" : "dir");
  assert.equal(await runE2E([], f.options), 1);
  assert.equal(await readFile(path.join(target, "sentinel"), "utf8"), "keep");
  assert.deepEqual(await files(target), ["sentinel"]);
  assert.match(f.messages.join("\n"), /real directory inside the checkout/);
});

test("changed directory identity is preserved and cleanup failure is visible", async (t) => {
  const f = await stub(t);
  assert.equal(await runE2E(["--replace-data"], f.options), 1);
  const [record] = await f.records();
  assert.equal(await readFile(record.data, "utf8"), "replacement");
  assert.equal(await readFile(path.join(record.data + "-moved", "active"), "utf8"), "owned");
  assert.match(f.messages.join("\n"), /cleanup failed.*identity changed/);
});

test("abnormal child termination preserves data instead of assuming server shutdown", async (t) => {
  const f = await stub(t);
  assert.notEqual(await runE2E(["--abnormal"], f.options), 0);
  const [record] = await f.records();
  assert.equal(await readFile(path.join(record.data, "active"), "utf8"), "owned");
  assert.match(f.messages.join("\n"), /shutdown is unconfirmed/);
});

test("reserved overrides and invalid ports fail before starting a child", async (t) => {
  const f = await stub(t);
  for (const arg of ["--config=other.ts", "-cother.ts", "--output=../", "-o../", "--ui"]) {
    assert.equal(await runE2E([arg], f.options), 1);
  }
  for (const port of ["", "0", "65536", "1.5", "invalid"]) {
    assert.equal(await runE2E([], { ...f.options, env: { E2E_PORT: port } }), 1);
  }
  assert.deepEqual(await f.records(), []);
});

test("real Playwright configuration refuses execution without its launcher", async (t) => {
  const root = await fixture(t);
  const env = { ...process.env, PWTEST_CACHE_DIR: path.join(root, "cache"), TEMP: root, TMP: root };
  for (const key of Object.keys(env)) if (key.startsWith("ADASSASSIN_E2E_")) delete env[key];
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PLAYWRIGHT, "test", "--list"], { cwd: WEB, env, windowsHide: true });
    let output = "";
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Run E2E through npm run e2e/);
});

test("real Playwright stops its fixture server before data cleanup, including startup failure", async (t) => {
  const root = await fixture(t);
  const server = path.join(root, "server.cjs");
  await writeFile(server, `
    const fs = require('node:fs');
    const http = require('node:http');
    const path = require('node:path');
    fs.writeFileSync('server-data.txt', process.env.ADASSASSIN_DATA_DIR);
    fs.writeFileSync(path.join(process.env.ADASSASSIN_DATA_DIR, 'server-marker'), 'owned');
    http.createServer((req, res) => { res.end('ready'); }).listen(Number(process.env.E2E_PORT), '127.0.0.1');
  `);
  const config = `
    import base from ${JSON.stringify(path.join(WEB, "playwright.config.ts"))};
    export default { ...base, testDir: '.', testMatch: 'probe.spec.ts', fullyParallel: true, workers: 2,
      globalTimeout: 15000, timeout: 5000,
      reporter: [['list']], projects: [{ name: 'harness' }],
      webServer: base.webServer ? { ...base.webServer, timeout: 5000, cwd: ${JSON.stringify(root)},
        command: ${JSON.stringify(`"${process.execPath}" "${server}"`)} } : undefined };
  `;
  await writeFile(path.join(root, "playwright.config.ts"), config);
  await writeFile(path.join(root, "probe.spec.ts"), `
    import { test, expect } from '@playwright/test';
    import { readFileSync } from 'node:fs';
    import path from 'node:path';
    import base from ${JSON.stringify(path.join(WEB, "playwright.config.ts"))};
    for (const i of [1, 2]) test('worker ' + i, async () => {
      expect(base.webServer.reuseExistingServer).toBe(false);
      expect(base.webServer.env.ADASSASSIN_DATA_DIR).toBe(process.env.ADASSASSIN_E2E_DATA_DIR);
      expect(readFileSync(path.join(process.env.ADASSASSIN_E2E_DATA_DIR, 'server-marker'), 'utf8')).toBe('owned');
    });
  `);
  const options = { webDir: root, cli: PLAYWRIGHT, stdio: "ignore", log: () => {},
    env: { ...process.env, E2E_PORT: await freePort() } };
  // The old config deleted this shared path even during --list and again in
  // workers. This sentinel makes that destructive regression observable.
  const legacy = path.join(root, ".playwright", "adassassin-e2e-data");
  await mkdir(legacy, { recursive: true });
  await writeFile(path.join(legacy, "sentinel"), "keep");
  assert.equal(await runE2E(["--list"], options), 0);
  assert.equal(await readFile(path.join(legacy, "sentinel"), "utf8"), "keep");
  assert.deepEqual((await files(path.join(root, ".playwright"))).filter((name) => name.startsWith("data-")), []);
  assert.deepEqual(await files(path.join(root, "test-results")), []);
  assert.equal(await runE2E([], options), 0);
  assert.equal(await readFile(path.join(legacy, "sentinel"), "utf8"), "keep");
  const dataDir = await readFile(path.join(root, "server-data.txt"), "utf8");
  await assert.rejects(realpath(dataDir), { code: "ENOENT" });
  // A real webServer startup error must also dispose its process and data.
  await writeFile(server, "process.exit(23);");
  assert.notEqual(await runE2E([], options), 0);
  assert.deepEqual((await files(path.join(root, ".playwright"))).filter((name) => name.startsWith("data-")), []);
});
