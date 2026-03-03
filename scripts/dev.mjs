#!/usr/bin/env node
import net from "node:net";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const dockerComposeFile = path.join("docker", "docker-compose.yml");
const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const childProcesses = [];
let shuttingDown = false;

function runSyncChecked(command, args, purpose) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    shell: false
  });

  if (result.status === 0) {
    return;
  }

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  const combined = [stdout, stderr].filter((v) => v.length > 0).join("\n");

  console.error(`[dev] ${purpose} failed.`);
  if (combined.length > 0) {
    console.error(combined);
  }
  process.exit(result.status ?? 1);
}

function runChecked(command, args, purpose) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: false
    });

    proc.on("error", (error) => {
      reject(new Error(`[dev] ${purpose} failed to start: ${error.message}`));
    });

    proc.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `[dev] ${purpose} failed with ${signal ? `signal ${signal}` : `exit code ${code ?? 1}`}.`
        )
      );
    });
  });
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });

    const done = (ok) => {
      socket.removeAllListeners();
      socket.end();
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(1000);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function waitForPort(host, port, timeoutMs, optional = false) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortOpen(host, port)) {
      console.log(`[dev] Port ready: ${host}:${port}`);
      return true;
    }
    await waitMs(1000);
  }

  if (optional) {
    console.warn(`[dev] Optional port not ready within timeout: ${host}:${port}`);
    return false;
  }

  throw new Error(`[dev] Timed out waiting for ${host}:${port}`);
}

function startLongRunning(name, args) {
  const proc = spawn(pnpmCmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false
  });

  childProcesses.push({ name, proc });

  proc.on("error", (error) => {
    if (shuttingDown) {
      return;
    }
    console.error(`[dev] ${name} failed to start: ${error.message}`);
    void shutdownAndExit(1);
  });

  proc.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    console.error(
      `[dev] ${name} exited unexpectedly (${signal ? `signal ${signal}` : `code ${code ?? 1}`}).`
    );
    void shutdownAndExit(code ?? 1);
  });
}

async function shutdownChildren() {
  for (const child of childProcesses) {
    if (child.proc.killed || child.proc.exitCode !== null) {
      continue;
    }

    try {
      child.proc.kill("SIGINT");
    } catch {
      // ignore
    }
  }

  await waitMs(1200);

  for (const child of childProcesses) {
    if (child.proc.killed || child.proc.exitCode !== null) {
      continue;
    }

    try {
      child.proc.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
}

async function shutdownAndExit(code) {
  if (!shuttingDown) {
    shuttingDown = true;
    await shutdownChildren();
  }
  process.exit(code);
}

function maybeOpenBrowser(url) {
  const openEnabled = (process.env.DEV_OPEN_BROWSER ?? "true").toLowerCase() !== "false";
  if (!openEnabled) {
    return;
  }

  if (process.platform === "win32") {
    const opener = spawn("cmd", ["/c", "start", "", url], {
      cwd: repoRoot,
      stdio: "ignore",
      detached: true,
      shell: false
    });
    opener.unref();
  }
}

function registerSignalHandlers() {
  const handler = (signal) => {
    if (shuttingDown) {
      return;
    }

    console.log(`[dev] Caught ${signal}. Shutting down child processes...`);
    void shutdownAndExit(0);
  };

  process.on("SIGINT", () => handler("SIGINT"));
  process.on("SIGTERM", () => handler("SIGTERM"));
}

async function main() {
  console.log("[dev] Preflight: docker version");
  runSyncChecked("docker", ["version"], "docker preflight");

  console.log("[dev] Starting docker services");
  await runChecked("docker", ["compose", "-f", dockerComposeFile, "up", "-d"], "docker compose up");

  console.log("[dev] Waiting for infrastructure ports...");
  await waitForPort("127.0.0.1", 5432, 60000, false);
  await waitForPort("127.0.0.1", 6379, 60000, false);
  await waitForPort("127.0.0.1", 9000, 60000, true);

  console.log("[dev] Running Prisma migration");
  await runChecked(pnpmCmd, ["db:migrate"], "db migration");

  registerSignalHandlers();

  console.log("[dev] Starting API and Worker...");
  startLongRunning("api", ["-C", "apps/api", "run", "dev"]);
  startLongRunning("worker", ["-C", "apps/worker", "run", "dev"]);

  console.log("\n[dev] Local stack is running:");
  console.log("  - http://localhost:3000/ui");
  console.log("  - http://localhost:3000/health");
  console.log("  - http://localhost:3000/artifacts/");
  console.log("  - http://localhost:3000/hitl");
  console.log("\n[dev] Stop with Ctrl+C, then run: pnpm dev:down\n");

  maybeOpenBrowser("http://localhost:3000/ui");

  await new Promise(() => {
    // keep process alive while child services run
  });
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await shutdownAndExit(1);
});
