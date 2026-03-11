import { bootstrapEnv } from "./bootstrapEnv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRuntimeSidecarPresetRollout } from "./sidecarPresetRolloutValidation";

bootstrapEnv();

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function resolveArgValue(name: string): string | null {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!entry) {
    return null;
  }
  const value = entry.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

function resolveLocalPath(repoRoot: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function parseTruthy(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const rolloutPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("rollout-file") ??
      process.env.VIDEO_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_FILE_PATH?.trim() ??
      process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_FILE_PATH?.trim() ??
      path.join("out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.json")
  );
  const envFilePath = resolveLocalPath(
    repoRoot,
    resolveArgValue("rollout-env") ??
      path.join(path.dirname(rolloutPath), `${path.basename(rolloutPath, ".json")}.env`)
  );
  const outPath = resolveArgValue("out") ? resolveLocalPath(repoRoot, resolveArgValue("out") as string) : null;
  const requireReady =
    hasFlag("require-ready") || parseTruthy(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_REQUIRE_READY);

  const report = validateRuntimeSidecarPresetRollout({
    repoRoot,
    rolloutPath,
    envFilePath
  });

  if (outPath) {
    writeJson(outPath, report);
  }

  console.log(`SIDECAR ROLLOUT VALIDATION: ${report.ready ? "ready" : "not_ready"}`);
  console.log(`SIDECAR ROLLOUT MODE: ${report.rollout_mode}`);
  console.log(`SIDECAR ROLLOUT TARGET: ${report.default_target}`);
  if (report.default_bundle) {
    console.log(`SIDECAR ROLLOUT DEFAULT BUNDLE: ${report.default_bundle}`);
  }
  if (report.cross_channel) {
    console.log(
      `SIDECAR ROLLOUT CROSS-CHANNEL: status=${report.cross_channel.status} divergence=${report.cross_channel.divergence_level ?? "unknown"} score_gap=${report.cross_channel.score_gap ?? "n/a"}`
    );
    console.log(
      `SIDECAR ROLLOUT CROSS-CHANNEL RECOMMENDATION: ${report.cross_channel.recommendation ?? "n/a"}`
    );
  }
  console.log(`SIDECAR ROLLOUT STATUS: ${report.inspection.status}`);
  if (outPath) {
    console.log(`SIDECAR ROLLOUT REPORT: ${outPath}`);
  }
  if (requireReady && !report.ready) {
    throw new Error(
      `sidecar preset rollout not ready: target=${report.default_target} status=${report.inspection.status} reason=${report.inspection.reason}`
    );
  }
}

main().catch((error) => {
  console.error(`validateSidecarPresetRollout FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
