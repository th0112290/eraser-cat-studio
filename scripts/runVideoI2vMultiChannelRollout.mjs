import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const rawArgs = process.argv.slice(2);

function printUsage() {
  console.log(`Usage:
  pnpm rollout:video-i2v-multichannel -- --economy-character-pack-id=<packId> --medical-character-pack-id=<packId> [options]

Pipeline:
  1. docker smoke / docker up / db migrate deploy
  2. motion preset benchmark + require-ready validation
  3. worker bootstrap
  4. comfy video preflight
  5. multi-channel preset benchmark with --validate [--require-ready] --materialize-rollout
  6. multichannel rollout validation (skipped in allow-not-ready mode)

Options:
  --character-pack-id=<packId>
  --economy-character-pack-id=<packId>
  --medical-character-pack-id=<packId>
  --economy-fixture=<path>
  --medical-fixture=<path>
  --out-dir=<path>
  --scenario-file=<path>
  --scenario-set=curated|all
  --scenario=<name[,name2,...]>
  --max-scenarios=<n>
  --fast-mode
  --allow-not-ready
  --motion-validation-out=<path>
  --validation-out=<path>
  --benchmark-timeout-ms=<ms>
  --comfy-preflight-timeout-ms=<ms>
  --worker-ready-timeout-ms=<ms>
  --keep-comfy-running
  --skip-motion-benchmark
  --skip-motion-benchmark-validation
  --skip-docker-smoke
  --skip-docker-up
  --skip-db-migrate
  --skip-worker
  --skip-comfy-preflight
  --skip-rollout-preflight
  --skip-infra
  --help`);
}

function hasFlag(name) {
  return rawArgs.includes(`--${name}`);
}

function readArg(name) {
  const prefix = `--${name}=`;
  const entry = rawArgs.find((value) => value.startsWith(prefix));
  if (!entry) {
    return null;
  }
  const value = entry.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

function resolveLocalPath(inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
}

function resolvePnpmExecutable() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function resolveIntArg(name, fallback) {
  const raw = readArg(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function runStep(label, args, timeoutMs = 0) {
  console.log(`[video-i2v-multichannel-rollout] ${label}`);
  const result = spawnSync(resolvePnpmExecutable(), args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
    ...(timeoutMs > 0 ? { timeout: timeoutMs } : {})
  });
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function runStepCapture(label, args, timeoutMs = 0) {
  console.log(`[video-i2v-multichannel-rollout] ${label}`);
  const result = spawnSync(resolvePnpmExecutable(), args, {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    ...(timeoutMs > 0 ? { timeout: timeoutMs } : {})
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTcpEndpoint(rawUrl, fallback) {
  const value = rawUrl?.trim();
  if (!value) {
    return fallback;
  }
  try {
    const parsed = new URL(value);
    return {
      host: parsed.hostname || fallback.host,
      port: Number.parseInt(parsed.port, 10) || fallback.port
    };
  } catch {
    return fallback;
  }
}

function probeTcpEndpoint(endpoint, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = net.connect(endpoint.port, endpoint.host);
    const finalize = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finalize(true));
    socket.once("timeout", () => finalize(false));
    socket.once("error", () => finalize(false));
  });
}

async function ensureLocalInfraReady() {
  const redisEndpoint = resolveTcpEndpoint(process.env.REDIS_URL, {
    host: "127.0.0.1",
    port: 6379
  });
  const databaseEndpoint = resolveTcpEndpoint(process.env.DATABASE_URL, {
    host: "127.0.0.1",
    port: 5432
  });
  const [redisReady, databaseReady] = await Promise.all([
    probeTcpEndpoint(redisEndpoint),
    probeTcpEndpoint(databaseEndpoint)
  ]);
  if (!databaseReady) {
    throw new Error(
      `database unreachable at ${databaseEndpoint.host}:${databaseEndpoint.port}. Start local infra before running multichannel rollout.`
    );
  }
  if (!redisReady) {
    throw new Error(
      `redis unreachable at ${redisEndpoint.host}:${redisEndpoint.port}. Docker Desktop / local infra is not ready.`
    );
  }
}

function buildWorkerLogPath() {
  return path.join(repoRoot, "out", "multi_channel_benchmarks", "video_i2v", "worker_rollout.log");
}

function buildWorkerBootstrapEnv() {
  const workerEnv = { ...process.env };
  workerEnv.VIDEO_MOTION_PRESET_BENCHMARK_REQUIRE_READY = "true";
  if (hasFlag("fast-mode")) {
    workerEnv.BENCHMARK_PRESET_FAST_MODE = "true";
    workerEnv.VIDEO_SIDECAR_BENCHMARK_FAST_MODE = "true";
    workerEnv.VIDEO_SIDECAR_PREMIUM_CANDIDATE_COUNT = "1";
    workerEnv.VIDEO_SIDECAR_PREMIUM_ACTUAL_CANDIDATE_COUNT = "1";
    workerEnv.VIDEO_SIDECAR_PREMIUM_ACTUAL_RETAKE_COUNT = "0";
    workerEnv.VIDEO_HUNYUAN_PREMIUM_DEFAULT = "false";
  }
  return workerEnv;
}

function startWorkerProcess() {
  const logPath = buildWorkerLogPath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] starting worker for video-i2v multichannel rollout\n`);
  const logFd = fs.openSync(logPath, "a");
  const workerCommand = process.platform === "win32"
    ? {
        file: "cmd.exe",
        args: ["/d", "/s", "/c", `${resolvePnpmExecutable()} -C apps/worker dev`]
      }
    : {
        file: resolvePnpmExecutable(),
        args: ["-C", "apps/worker", "dev"]
      };
  const child = spawn(workerCommand.file, workerCommand.args, {
    cwd: repoRoot,
    env: buildWorkerBootstrapEnv(),
    detached: false,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd]
  });
  fs.closeSync(logFd);
  return {
    child,
    pid: child.pid ?? null,
    logPath
  };
}

async function waitForWorkerReady(input) {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() < deadline) {
    if (input.child.exitCode !== null) {
      throw new Error(`worker exited during bootstrap with code ${input.child.exitCode}. log=${input.logPath}`);
    }
    if (fs.existsSync(input.logPath)) {
      const logText = fs.readFileSync(input.logPath, "utf8");
      if (logText.includes("[worker] running.")) {
        return;
      }
    }
    await sleep(2000);
  }
  throw new Error(`worker did not become ready within ${input.timeoutMs}ms. log=${input.logPath}`);
}

function startLocalComfyUi() {
  if (process.platform !== "win32") {
    throw new Error("automatic ComfyUI bootstrap is only implemented for Windows in this repo");
  }
  const scriptPath = path.join(repoRoot, "scripts", "startLocalComfyUI.ps1");
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`ComfyUI bootstrap script not found: ${scriptPath}`);
  }
  const result = spawnSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    windowsHide: true
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null
  };
}

function readManagedLocalComfyPid() {
  if (process.platform !== "win32") {
    return null;
  }
  const pidPath = path.join(repoRoot, "out", "dev_logs", "comfyui-live.pid");
  if (!fs.existsSync(pidPath)) {
    return null;
  }
  const raw = fs.readFileSync(pidPath, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

async function ensureComfyVideoPreflightReady() {
  const firstAttempt = runStepCapture("comfy video preflight", ["comfy:preflight:video"], comfyPreflightTimeoutMs);
  if (firstAttempt.status === 0) {
    process.stdout.write(firstAttempt.stdout);
    process.stderr.write(firstAttempt.stderr);
    return {
      started: false,
      managedPid: readManagedLocalComfyPid()
    };
  }

  const combined = `${firstAttempt.stdout}\n${firstAttempt.stderr}`;
  if (!combined.includes("fetch failed")) {
    process.stdout.write(firstAttempt.stdout);
    process.stderr.write(firstAttempt.stderr);
    throw new Error(`comfy video preflight failed with exit code ${firstAttempt.status}`);
  }

  console.log("[video-i2v-multichannel-rollout] ComfyUI is not reachable yet. attempting local bootstrap");
  const bootstrap = startLocalComfyUi();
  if (bootstrap.error) {
    throw new Error(`comfy bootstrap failed: ${bootstrap.error.message}`);
  }
  if (bootstrap.stdout) {
    process.stdout.write(bootstrap.stdout);
  }
  if (bootstrap.stderr) {
    process.stderr.write(bootstrap.stderr);
  }

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await sleep(15000);
    const retry = runStepCapture(
      `comfy video preflight retry ${attempt}/6`,
      ["comfy:preflight:video"],
      comfyPreflightTimeoutMs
    );
    if (retry.status === 0) {
      process.stdout.write(retry.stdout);
      process.stderr.write(retry.stderr);
      return {
        started: true,
        managedPid: readManagedLocalComfyPid()
      };
    }
    if (attempt === 6) {
      process.stdout.write(retry.stdout);
      process.stderr.write(retry.stderr);
      throw new Error(`comfy video preflight failed after local bootstrap (exit ${retry.status})`);
    }
  }
}

function stopLocalComfyUi() {
  if (process.platform !== "win32") {
    return;
  }
  const scriptPath = path.join(repoRoot, "scripts", "stopLocalComfyUI.ps1");
  if (!fs.existsSync(scriptPath)) {
    return;
  }
  const result = spawnSync("powershell", ["-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function stopWorkerProcess(pid) {
  if (!pid) {
    return;
  }
  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
      cwd: repoRoot,
      env: process.env,
      windowsHide: true
    });
    if (result.status !== 0 && result.status !== 128) {
      throw new Error(`taskkill failed for worker pid ${pid}`);
    }
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch (error) {
    if (!(error instanceof Error) || !String(error.message).includes("ESRCH")) {
      throw error;
    }
  }
}

function filterBenchmarkArgs() {
  const rootOnlyFlags = new Set([
    "skip-docker-smoke",
    "skip-docker-up",
    "skip-db-migrate",
    "skip-worker",
    "skip-comfy-preflight",
    "skip-rollout-preflight",
    "skip-infra",
    "benchmark-timeout-ms",
    "comfy-preflight-timeout-ms",
    "worker-ready-timeout-ms",
    "keep-comfy-running",
    "allow-not-ready",
    "motion-validation-out",
    "skip-motion-benchmark",
    "skip-motion-benchmark-validation",
    "validation-out",
    "help"
  ]);
  return rawArgs.filter((arg) => {
    if (!arg.startsWith("--")) {
      return true;
    }
    const normalized = arg.slice(2);
    const separatorIndex = normalized.indexOf("=");
    const key = separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : normalized;
    return !rootOnlyFlags.has(key);
  });
}

if (hasFlag("help")) {
  printUsage();
  process.exit(0);
}

const skipInfra = hasFlag("skip-infra");
const skipMotionBenchmark = hasFlag("skip-motion-benchmark");
const skipMotionBenchmarkValidation = hasFlag("skip-motion-benchmark-validation");
const skipDockerSmoke = skipInfra || hasFlag("skip-docker-smoke");
const skipDockerUp = skipInfra || hasFlag("skip-docker-up");
const skipDbMigrate = skipInfra || hasFlag("skip-db-migrate");
const skipWorker = hasFlag("skip-worker");
const skipComfyPreflight = hasFlag("skip-comfy-preflight");
const allowNotReady = hasFlag("allow-not-ready");
const skipRolloutPreflight = hasFlag("skip-rollout-preflight") || allowNotReady;
const keepComfyRunning = hasFlag("keep-comfy-running");
const benchmarkTimeoutMs = resolveIntArg(
  "benchmark-timeout-ms",
  Number.parseInt(process.env.VIDEO_I2V_MULTICHANNEL_BENCHMARK_TIMEOUT_MS ?? "1800000", 10)
);
const comfyPreflightTimeoutMs = resolveIntArg(
  "comfy-preflight-timeout-ms",
  Number.parseInt(process.env.VIDEO_I2V_MULTICHANNEL_COMFY_PREFLIGHT_TIMEOUT_MS ?? "120000", 10)
);
const workerReadyTimeoutMs = resolveIntArg(
  "worker-ready-timeout-ms",
  Number.parseInt(process.env.VIDEO_I2V_MULTICHANNEL_WORKER_READY_TIMEOUT_MS ?? "120000", 10)
);

const sharedCharacterPackId =
  readArg("character-pack-id") ?? process.env.SMOKE_VIDEO_BROLL_CHARACTER_PACK_ID?.trim() ?? "";
const economyCharacterPackId =
  readArg("economy-character-pack-id") ??
  process.env.SMOKE_ECONOMY_CHARACTER_PACK_ID?.trim() ??
  sharedCharacterPackId;
const medicalCharacterPackId =
  readArg("medical-character-pack-id") ??
  process.env.SMOKE_MEDICAL_CHARACTER_PACK_ID?.trim() ??
  sharedCharacterPackId;

if (!economyCharacterPackId || !medicalCharacterPackId) {
  console.error(
    "[video-i2v-multichannel-rollout] Missing character pack ids. Use --economy-character-pack-id=... --medical-character-pack-id=... or provide shared --character-pack-id=..."
  );
  process.exit(1);
}

const outputRoot = resolveLocalPath(readArg("out-dir") ?? path.join("out", "multi_channel_benchmarks", "video_i2v"));
const rolloutFilePath = path.join(outputRoot, "runtime_sidecar_multichannel_rollout.json");
const rolloutEnvPath = path.join(outputRoot, "runtime_sidecar_multichannel_rollout.env");
const motionValidationOutputPath = resolveLocalPath(
  readArg("motion-validation-out") ?? path.join("out", "motion_preset_benchmark.pipeline_validation.json")
);
const validationOutputPath = resolveLocalPath(
  readArg("validation-out") ?? path.join(outputRoot, "runtime_sidecar_multichannel_rollout.pipeline_validation.json")
);
const benchmarkAlertPath = path.join(outputRoot, "multi_channel_benchmark_alert.json");

const benchmarkArgs = filterBenchmarkArgs();
if (!benchmarkArgs.some((arg) => arg.startsWith("--economy-character-pack-id="))) {
  benchmarkArgs.push(`--economy-character-pack-id=${economyCharacterPackId}`);
}
if (!benchmarkArgs.some((arg) => arg.startsWith("--medical-character-pack-id="))) {
  benchmarkArgs.push(`--medical-character-pack-id=${medicalCharacterPackId}`);
}
if (!benchmarkArgs.some((arg) => arg.startsWith("--out-dir="))) {
  benchmarkArgs.push(`--out-dir=${outputRoot}`);
}
if (!benchmarkArgs.includes("--validate")) {
  benchmarkArgs.push("--validate");
}
if (!allowNotReady && !benchmarkArgs.includes("--require-ready")) {
  benchmarkArgs.push("--require-ready");
}
if (!benchmarkArgs.includes("--materialize-rollout")) {
  benchmarkArgs.push("--materialize-rollout");
}

async function main() {
  let startedWorkerPid = null;
  let workerLogPath = null;
  let managedComfyPid = null;
  try {
    if (!skipDockerSmoke) {
      runStep("docker smoke", ["smoke:docker"]);
    }
    if (!skipDockerUp) {
      runStep("docker up", ["docker:up"]);
    }
    if (!skipDbMigrate) {
      runStep("db migrate deploy", ["-C", "packages/db", "run", "migrate:deploy"]);
    }
    if (!skipMotionBenchmark) {
      runStep("motion preset benchmark", ["benchmark:motion-presets"]);
    }
    if (!skipMotionBenchmarkValidation) {
      runStep("motion preset benchmark require-ready validation", [
        "validate:motion-preset-benchmark",
        "--",
        `--out=${motionValidationOutputPath}`,
        "--require-ready"
      ]);
    }
    await ensureLocalInfraReady();
    if (!skipWorker) {
      console.log("[video-i2v-multichannel-rollout] worker bootstrap");
      const workerProcess = startWorkerProcess();
      await waitForWorkerReady({
        child: workerProcess.child,
        logPath: workerProcess.logPath,
        timeoutMs: workerReadyTimeoutMs
      });
      workerProcess.child.unref();
      startedWorkerPid = workerProcess.pid;
      workerLogPath = workerProcess.logPath;
    }
    if (!skipComfyPreflight) {
      const comfyState = await ensureComfyVideoPreflightReady();
      managedComfyPid = comfyState.managedPid;
      if (managedComfyPid && !keepComfyRunning) {
        console.log(
          `[video-i2v-multichannel-rollout] managed ComfyUI detected (pid ${managedComfyPid}). It will be stopped on exit.`
        );
      }
    }

    runStep("multi-channel preset benchmark + validate + materialize", [
      "-C",
      "apps/worker",
      "run",
      "benchmark:video-i2v-multichannel",
      "--",
      ...benchmarkArgs
    ], benchmarkTimeoutMs);

    if (allowNotReady) {
      console.log("[video-i2v-multichannel-rollout] allow-not-ready mode enabled; rollout preflight is skipped.");
    }
    if (!skipRolloutPreflight) {
      runStep("multichannel rollout require-ready preflight", [
        "-C",
        "apps/worker",
        "run",
        "preflight:video-i2v-preset-rollout",
        "--",
        `--rollout-file=${rolloutFilePath}`,
        `--rollout-env=${rolloutEnvPath}`,
        `--out=${validationOutputPath}`,
        "--require-ready"
      ]);
    }

    const benchmarkAlert = readJsonIfExists(benchmarkAlertPath);
    if (benchmarkAlert) {
      console.log(
        `[video-i2v-multichannel-rollout] cross-channel alert severity=${benchmarkAlert.severity ?? "unknown"} status=${benchmarkAlert.status ?? "unknown"} divergence=${benchmarkAlert.divergence_level ?? "unknown"} score_gap=${benchmarkAlert.score_gap ?? "n/a"}`
      );
      console.log(
        `[video-i2v-multichannel-rollout] cross-channel recommendation: ${benchmarkAlert.message ?? benchmarkAlert.recommendation ?? "n/a"}`
      );
      console.log(`[video-i2v-multichannel-rollout] benchmark alert report: ${benchmarkAlertPath}`);
    }

    const rolloutValidation = readJsonIfExists(validationOutputPath);
    if (rolloutValidation?.cross_channel) {
      console.log(
        `[video-i2v-multichannel-rollout] rollout cross-channel status=${rolloutValidation.cross_channel.status ?? "unknown"} divergence=${rolloutValidation.cross_channel.divergence_level ?? "unknown"} score_gap=${rolloutValidation.cross_channel.score_gap ?? "n/a"}`
      );
    }

    console.log(`[video-i2v-multichannel-rollout] rollout file: ${rolloutFilePath}`);
    console.log(`[video-i2v-multichannel-rollout] rollout env: ${rolloutEnvPath}`);
    if (!skipMotionBenchmarkValidation) {
      console.log(`[video-i2v-multichannel-rollout] motion validation report: ${motionValidationOutputPath}`);
    }
    if (!skipRolloutPreflight) {
      console.log(`[video-i2v-multichannel-rollout] validation report: ${validationOutputPath}`);
    }
    if (workerLogPath) {
      console.log(`[video-i2v-multichannel-rollout] worker log: ${workerLogPath}`);
    }
  } finally {
    if (startedWorkerPid) {
      stopWorkerProcess(startedWorkerPid);
    }
    if (managedComfyPid && !keepComfyRunning) {
      stopLocalComfyUi();
    }
  }
}

main().catch((error) => {
  console.error(`[video-i2v-multichannel-rollout] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
