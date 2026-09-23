import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(WEB_DIR, "node_modules/@playwright/test/cli.js");
const LAUNCHER = fileURLToPath(import.meta.url);

// Only launch/runtime settings are inherited, not operator credentials or
// application settings. The harness supplies all engagement storage settings.
function childEnvironment(source) {
  const allowed = /^(path|pathext|systemroot|windir|comspec|temp|tmp|tmpdir|home|userprofile|appdata|localappdata|programfiles(?:\(x86\))?|programdata|virtual_env|ci|term|no_color|force_color|playwright_browsers_path|adassassin_e2e_python)$/i;
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.test(key)));
}

async function portFree(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(
      `E2E port 127.0.0.1:${port} is unavailable. Stop its owner or choose another E2E_PORT.`,
    )));
    probe.listen({ host: "127.0.0.1", port, exclusive: true }, () => probe.close(resolve));
  });
}

async function ownedRoot(webDir, name) {
  const dir = path.join(webDir, name);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await lstat(dir)).isSymbolicLink() || await realpath(dir) !== dir) {
    throw new Error(`E2E storage must be a real directory inside the checkout: ${dir}`);
  }
  return dir;
}

async function removeOwned(dir, identity) {
  const current = await lstat(dir);
  if (!current.isDirectory() || current.isSymbolicLink()
      || current.ino !== identity.ino || current.dev !== identity.dev
      || await realpath(dir) !== dir) {
    throw new Error("temporary directory identity changed; refusing removal");
  }
  await rm(dir, { recursive: true, maxRetries: 3, retryDelay: 100 });
}

/** The outer process owns storage until Playwright has disposed its server. */
export async function runE2E(args, {
  webDir = WEB_DIR,
  cli = CLI,
  executable = process.execPath,
  env = process.env,
  stdio = "inherit",
  log = console.error,
} = {}) {
  let dataDir;
  let identity;
  let child;
  let childClosed = false;
  let exitFile;
  let interrupted = false;
  let uncertainShutdown = false;
  let exitCode = 1;
  const interrupt = (signal) => {
    if (interrupted) return;
    interrupted = true;
    log(`E2E received ${signal}; waiting for Playwright to stop. Temporary data will be retained.`);
    // Windows delivers console Ctrl+C to the child too; child.kill('SIGINT')
    // would forcibly terminate it before Playwright cleans up its Python server.
    if (process.platform !== "win32") child?.kill("SIGINT");
  };
  const onInt = () => interrupt("SIGINT");
  const onTerm = () => interrupt("SIGTERM");

  try {
    // These options can bypass the owned configuration/output or leave a
    // long-lived interactive server. Ordinary filters/reporters are forwarded.
    if (args.some((arg) => /^(--(?:config|output|ui|ui-host|ui-port|watch)(?:=|$)|-[co])/.test(arg))) {
      throw new Error("E2E owns --config and --output; interactive UI/watch mode is not supported by this launcher.");
    }
    const listing = args.includes("--list");
    const help = args.includes("--help") || args.includes("-h");
    const passive = listing || help;
    const port = Number(env.E2E_PORT ?? 8799);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("E2E_PORT must be an integer between 1 and 65535.");
    }
    webDir = await realpath(webDir);
    const scratch = await ownedRoot(webDir, ".playwright");
    const childEnv = {
      ...childEnvironment(env),
      E2E_PORT: String(port),
      ADASSASSIN_E2E_MODE: passive ? "list" : "run",
      PWTEST_CACHE_DIR: path.join(scratch, "transform-cache"),
      TMP: scratch,
      TEMP: scratch,
      TMPDIR: scratch,
    };
    if (!passive) {
      // This is a collision check, not an atomic reservation. Playwright also
      // refuses an existing healthy server; the console must bind successfully.
      await portFree(port);
      dataDir = await mkdtemp(path.join(scratch, "data-"));
      identity = await lstat(dataDir);
      const artifacts = await mkdtemp(path.join(await ownedRoot(webDir, "test-results"), "e2e-"));
      exitFile = path.join(artifacts, ".child-exited");
      Object.assign(childEnv, {
        ADASSASSIN_E2E_EXIT_FILE: exitFile,
        ADASSASSIN_E2E_DATA_DIR: dataDir,
        ADASSASSIN_E2E_ARTIFACT_DIR: artifacts,
        PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(artifacts, "html"),
        PLAYWRIGHT_HTML_OPEN: "never",
        PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(artifacts, "report.json"),
        PLAYWRIGHT_JUNIT_OUTPUT_FILE: path.join(artifacts, "junit.xml"),
        PLAYWRIGHT_BLOB_OUTPUT_DIR: path.join(artifacts, "blob"),
      });
      log(`E2E artifacts: ${artifacts}`);
    }
    process.on("SIGINT", onInt);
    process.on("SIGTERM", onTerm);
    const result = await new Promise((resolve, reject) => {
      child = spawn(executable, [
        LAUNCHER, "--playwright-child", cli, "test", ...args, "--config", path.join(webDir, "playwright.config.ts"),
        // Ensure a passive invocation stays passive even if a preceding flag
        // consumed the original --list/--help as its argument.
        ...(help ? ["--help"] : listing ? ["--list"] : []),
      ], { cwd: webDir, env: childEnv, stdio, windowsHide: true });
      child.once("error", reject);
      child.once("close", (code, signal) => {
        childClosed = true;
        resolve({ code, signal });
      });
    });
    uncertainShutdown = result.signal !== null || result.code === null;
    exitCode = result.code ?? 1;
    if (exitFile && await readFile(exitFile, "utf8").catch(() => "") !== String(result.code)) {
      uncertainShutdown = true;
    }
    if (dataDir && !uncertainShutdown && !interrupted) {
      try {
        await portFree(port);
      } catch {
        uncertainShutdown = true;
        exitCode = exitCode || 1;
      }
    }
  } catch (error) {
    uncertainShutdown ||= Boolean(child?.pid && !childClosed);
    log(`E2E: ${error.message}`);
  } finally {
    if (dataDir) {
      if (interrupted || uncertainShutdown) {
        log(`E2E shutdown is unconfirmed; data retained at ${dataDir}. Confirm the server has stopped before removing it.`);
        exitCode = exitCode || 1;
      } else {
        try {
          await removeOwned(dataDir, identity);
        } catch (error) {
          log(`E2E cleanup failed; data retained at ${dataDir}: ${error.message}`);
          exitCode = exitCode || 1;
        }
      }
    }
    process.off("SIGINT", onInt);
    process.off("SIGTERM", onTerm);
  }
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === LAUNCHER) {
  if (process.argv[2] === "--playwright-child") {
    // Windows may report forced termination as code 1 with no signal. A normal
    // Node exit acknowledges completion; a killed process cannot write this.
    const exitFile = process.env.ADASSASSIN_E2E_EXIT_FILE;
    if (exitFile) process.on("exit", (code) => {
      try { writeFileSync(exitFile, String(code), { flag: "wx" }); } catch { /* Parent retains data. */ }
    });
    process.argv = [process.execPath, process.argv[3], ...process.argv.slice(4)];
    await import(pathToFileURL(process.argv[1]).href);
  } else {
    process.exitCode = await runE2E(process.argv.slice(2));
  }
}
