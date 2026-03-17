import path from "node:path";
import { spawn } from "node:child_process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import net from "node:net";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const workerRoot = path.join(repoRoot, "apps", "worker");
const requireFromWorker = createRequire(path.join(workerRoot, "package.json"));
const dotenv = requireFromWorker("dotenv");
const envPath = path.join(repoRoot, ".env");
const assetMode = process.argv.includes("--asset");
const targetScript = assetMode
  ? path.join(workerRoot, "src", "assetWorker.ts")
  : path.join(workerRoot, "src", "dev.ts");
const tsxCli = path.join(path.dirname(requireFromWorker.resolve("tsx/package.json")), "dist", "cli.mjs");

dotenv.config({
  path: envPath,
  override: false
});

const dockerComposeFile = path.join(repoRoot, "docker", "docker-compose.yml");

function isLocalHost(hostname) {
  const value = String(hostname || "").trim().toLowerCase();
  return value === "127.0.0.1" || value === "localhost" || value === "::1";
}

function parseEndpoint(rawValue, defaults) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return {
      raw: value,
      host: url.hostname || defaults.host,
      port: Number(url.port || defaults.port),
      local: isLocalHost(url.hostname || defaults.host)
    };
  } catch {
    return {
      raw: value,
      host: defaults.host,
      port: defaults.port,
      local: isLocalHost(defaults.host)
    };
  }
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

async function waitForPort(host, port, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isPortOpen(host, port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function runDockerCommand(args, purpose) {
  const result = spawnSync("docker", args, {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
    shell: false
  });

  const stdout = (result.stdout ?? "").trim();
  const stderr = (result.stderr ?? "").trim();
  const output = [stdout, stderr].filter((entry) => entry.length > 0).join("\n");

  if (result.status === 0) {
    return;
  }

  const detail = output.length > 0 ? `\n${output}` : "";
  throw new Error(`[worker] ${purpose} failed.${detail}`);
}

async function ensureLocalWorkerInfra() {
  if (process.env.WORKER_SKIP_INFRA_PREFLIGHT === "1") {
    return;
  }

  const redis = parseEndpoint(process.env.REDIS_URL, {
    host: "127.0.0.1",
    port: 6379
  });
  const postgres = parseEndpoint(process.env.DATABASE_URL, {
    host: "127.0.0.1",
    port: 5432
  });
  const minio = parseEndpoint(process.env.S3_ENDPOINT, {
    host: "127.0.0.1",
    port: 9000
  });

  const requiredTargets = [
    redis ? { name: "Redis", endpoint: redis } : null,
    postgres ? { name: "Postgres", endpoint: postgres } : null
  ].filter(Boolean);

  const missingRequired = [];
  for (const target of requiredTargets) {
    if (!target.endpoint.local) {
      continue;
    }
    const ready = await isPortOpen(target.endpoint.host, target.endpoint.port);
    if (!ready) {
      missingRequired.push(target);
    }
  }

  if (missingRequired.length === 0) {
    return;
  }

  const missingSummary = missingRequired
    .map((target) => `${target.name}(${target.endpoint.host}:${target.endpoint.port})`)
    .join(", ");

  console.warn(`[worker] Local runtime not ready: ${missingSummary}.`);

  try {
    runDockerCommand(["version"], "docker preflight");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message}\n[worker] Start Docker Desktop and run 'pnpm docker:up', or start local Redis/Postgres manually.`
    );
  }

  console.warn("[worker] Starting local docker services for worker runtime...");
  runDockerCommand(
    ["compose", "-f", dockerComposeFile, "up", "-d", "postgres", "redis", "minio", "minio_mc"],
    "docker compose up"
  );

  for (const target of missingRequired) {
    const ready = await waitForPort(target.endpoint.host, target.endpoint.port, 60000);
    if (!ready) {
      throw new Error(
        `[worker] ${target.name} did not become ready at ${target.endpoint.host}:${target.endpoint.port} within 60s.`
      );
    }
  }

  if (minio?.local) {
    await waitForPort(minio.host, minio.port, 15000).catch(() => false);
  }
}

await ensureLocalWorkerInfra();

const child = spawn(
  process.execPath,
  [tsxCli, targetScript],
  {
    cwd: workerRoot,
    env: process.env,
    stdio: "inherit"
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
