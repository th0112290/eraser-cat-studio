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
const pnpmCmd = "pnpm";
const pnpmNeedsShell = process.platform === "win32";

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

function runSync(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    shell: false
  });
}

function getWindowsPortOwner(port) {
  const psScript = [
    `$c = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1`,
    "if (-not $c) { exit 0 }",
    "$ownerPid = [int]$c.OwningProcess",
    '$p = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $ownerPid) -ErrorAction SilentlyContinue',
    '$name = if ($p -and $p.Name) { $p.Name } else { "" }',
    '$cmd = if ($p -and $p.CommandLine) { $p.CommandLine } else { "" }',
    'Write-Output ($ownerPid.ToString() + "\\t" + $name + "\\t" + $cmd)'
  ].join("; ");
  const result = runSync("powershell", ["-NoProfile", "-Command", psScript]);
  if (result.status !== 0) {
    return null;
  }
  const line = (result.stdout ?? "").trim();
  if (!line) {
    return null;
  }
  const [pidText, processName = "", ...cmdParts] = line.split("\t");
  const pid = Number.parseInt(pidText, 10);
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }
  return {
    pid,
    processName: processName.trim(),
    commandLine: cmdParts.join("\t").trim()
  };
}

function stopProcessTreeWindows(pid) {
  const result = runSync("taskkill", ["/PID", String(pid), "/F", "/T"]);
  return result.status === 0;
}

function runChecked(command, args, purpose, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: repoRoot,
      stdio: "inherit",
      shell: options.shell ?? false
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

function startLongRunning(name, args, options = {}) {
  const env = options.env ? { ...process.env, ...options.env } : process.env;
  const proc = spawn(pnpmCmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: options.shell ?? pnpmNeedsShell,
    env
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
  await runChecked(pnpmCmd, ["db:migrate"], "db migration", { shell: pnpmNeedsShell });

  if (await isPortOpen("127.0.0.1", 3000)) {
    if (process.platform === "win32") {
      const owner = getWindowsPortOwner(3000);
      const cmd = owner?.commandLine ?? "";
      const isLocalApi =
        cmd.includes("eraser-cat-studio") && cmd.includes("src/index.ts") && cmd.includes("apps/api");
      const isNodeProcess = owner?.processName.toLowerCase() === "node.exe";
      if (owner && (isLocalApi || isNodeProcess)) {
        console.warn(`[dev] Found existing local API on 3000 (pid=${owner.pid}). Stopping it and retrying...`);
        stopProcessTreeWindows(owner.pid);
        await waitMs(1200);
      }
    }

    if (await isPortOpen("127.0.0.1", 3000)) {
      let hint =
        "Stop the existing API process and retry. (PowerShell: Get-Process node | Stop-Process -Force)";
      if (process.platform === "win32") {
        const owner = getWindowsPortOwner(3000);
        if (owner) {
          hint = `port owner pid=${owner.pid}${owner.commandLine ? ` cmd=${owner.commandLine}` : ""}`;
        }
      }
      throw new Error(`[dev] Port 3000 is already in use. ${hint}`);
    }
  }

  registerSignalHandlers();

  console.log("[dev] Starting API and Worker...");
  startLongRunning("api", ["-C", "apps/api", "run", "dev"], { shell: pnpmNeedsShell });
  startLongRunning("worker", ["-C", "apps/worker", "run", "dev"], { shell: pnpmNeedsShell });

  const withAssetWorker = (process.env.DEV_START_ASSET_WORKER ?? "0").trim() === "1";
  if (withAssetWorker) {
    console.log("[dev] Starting Asset Worker (DEV_START_ASSET_WORKER=1)...");
    startLongRunning("worker:asset", ["-C", "apps/worker", "run", "dev:asset"], {
      shell: pnpmNeedsShell
    });
  }

  console.log("\n[dev] Local stack is running:");
  console.log("  - http://localhost:3000/ui");
  console.log("  - http://localhost:3000/health");
  console.log("  - http://localhost:3000/artifacts/");
  console.log("  - http://localhost:3000/hitl");
  if (withAssetWorker) {
    console.log("  - asset worker: enabled");
  } else {
    console.log("  - asset worker: disabled (set DEV_START_ASSET_WORKER=1 to enable)");
  }
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
