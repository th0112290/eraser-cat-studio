import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const rawArgs = process.argv.slice(2);

function printUsage() {
  console.log(`Usage:
  pnpm rollout:video-i2v-preset -- --character-pack-id=<packId> [options]

Pipeline:
  1. docker smoke / docker up / db migrate deploy
  2. motion preset benchmark + require-ready validation
  3. worker bootstrap
  4. comfy video preflight
  5. preset benchmark with --promote-rollout
  6. require-ready rollout validation

Options:
  --character-pack-id=<packId>
  --fixture=<path>
  --out-dir=<path>
  --scenario-file=<path>
  --scenario-set=curated|all
  --scenario=<name[,name2,...]>
  --max-scenarios=<n>
  --fast-mode
  --promotion-out=<path>
  --promotion-env-out=<path>
  --promotion-report-out=<path>
  --promotion-validate-report-out=<path>
  --motion-validation-out=<path>
  --validation-out=<path>
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

function runStep(label, args) {
  console.log(`[video-i2v-rollout] ${label}`);
  const result = spawnSync(resolvePnpmExecutable(), args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true
  });
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function runStepCapture(label, args) {
  console.log(`[video-i2v-rollout] ${label}`);
  const result = spawnSync(resolvePnpmExecutable(), args, {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true
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

function buildWorkerLogPath() {
  return path.join(repoRoot, "out", "preset_benchmarks", "video_i2v", "worker_rollout.log");
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
  fs.appendFileSync(logPath, `\n[${new Date().toISOString()}] starting worker for video-i2v rollout\n`);
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
  const firstAttempt = runStepCapture("comfy video preflight", ["comfy:preflight:video"]);
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

  console.log("[video-i2v-rollout] ComfyUI is not reachable yet. attempting local bootstrap");
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
    const retry = runStepCapture(`comfy video preflight retry ${attempt}/6`, ["comfy:preflight:video"]);
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
    "worker-ready-timeout-ms",
    "keep-comfy-running",
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
const skipRolloutPreflight = hasFlag("skip-rollout-preflight");
const keepComfyRunning = hasFlag("keep-comfy-running");
const workerReadyTimeoutMs = resolveIntArg(
  "worker-ready-timeout-ms",
  Number.parseInt(process.env.VIDEO_I2V_PRESET_WORKER_READY_TIMEOUT_MS ?? "120000", 10)
);
const requestedCharacterPackId = readArg("character-pack-id") ?? process.env.SMOKE_VIDEO_BROLL_CHARACTER_PACK_ID?.trim() ?? "";

if (!requestedCharacterPackId) {
  console.error("[video-i2v-rollout] Missing character pack id. Use --character-pack-id=<packId> or set SMOKE_VIDEO_BROLL_CHARACTER_PACK_ID.");
  process.exit(1);
}

const defaultRolloutPath = path.join(repoRoot, "out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.json");
const defaultRolloutEnvPath = path.join(repoRoot, "out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.env");
const defaultMotionValidationOutputPath = path.join(
  repoRoot,
  "out",
  "motion_preset_benchmark.pipeline_validation.json"
);
const promotionOutputPath = resolveLocalPath(readArg("promotion-out") ?? defaultRolloutPath);
const promotionEnvPath = resolveLocalPath(readArg("promotion-env-out") ?? defaultRolloutEnvPath);
const motionValidationOutputPath = resolveLocalPath(
  readArg("motion-validation-out") ?? defaultMotionValidationOutputPath
);
const validationOutputPath = resolveLocalPath(
  readArg("validation-out") ?? path.join("out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.pipeline_validation.json")
);

const benchmarkArgs = filterBenchmarkArgs();
if (!benchmarkArgs.some((arg) => arg.startsWith("--character-pack-id="))) {
  benchmarkArgs.push(`--character-pack-id=${requestedCharacterPackId}`);
}
if (!benchmarkArgs.includes("--promote-rollout")) {
  benchmarkArgs.push("--promote-rollout");
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
    if (!skipWorker) {
      console.log("[video-i2v-rollout] worker bootstrap");
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
        console.log(`[video-i2v-rollout] managed ComfyUI detected (pid ${managedComfyPid}). It will be stopped on exit.`);
      }
    }

    runStep("preset benchmark + promote", ["-C", "apps/worker", "run", "benchmark:video-i2v-presets", "--", ...benchmarkArgs]);

    if (!skipRolloutPreflight) {
      runStep("rollout require-ready preflight", [
        "-C",
        "apps/worker",
        "run",
        "preflight:video-i2v-preset-rollout",
        "--",
        `--rollout-file=${promotionOutputPath}`,
        `--rollout-env=${promotionEnvPath}`,
        `--out=${validationOutputPath}`,
        "--require-ready"
      ]);
    }

    console.log(`[video-i2v-rollout] rollout file: ${promotionOutputPath}`);
    console.log(`[video-i2v-rollout] rollout env: ${promotionEnvPath}`);
    if (!skipMotionBenchmarkValidation) {
      console.log(`[video-i2v-rollout] motion validation report: ${motionValidationOutputPath}`);
    }
    if (!skipRolloutPreflight) {
      console.log(`[video-i2v-rollout] validation report: ${validationOutputPath}`);
    }
    if (workerLogPath) {
      console.log(`[video-i2v-rollout] worker log: ${workerLogPath}`);
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
  console.error(`[video-i2v-rollout] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
