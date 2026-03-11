import { bootstrapEnv } from "./bootstrapEnv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRuntimeSidecarPresetRolloutFile,
  writeRuntimeSidecarPresetRolloutArtifacts
} from "./sidecarPresetRolloutArtifact";

bootstrapEnv();

type BenchmarkMatrixLike = {
  renderer?: unknown;
  fixture_path?: unknown;
  character_pack_id?: unknown;
  scenario_set?: unknown;
  score_formula_version?: unknown;
  recommendation_summary?: {
    best_overall?: unknown;
    best_balanced_qc?: unknown;
    best_strict_qc?: unknown;
  };
};

type TargetName = "overall" | "balanced" | "strict";

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function resolveDefaultTarget(): TargetName {
  const raw = (
    resolveArgValue("default-target") ??
    process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_TARGET?.trim() ??
    "overall"
  ).toLowerCase();
  return raw === "balanced" || raw === "strict" ? raw : "overall";
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const matrixPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("matrix") ?? path.join("out", "preset_benchmarks", "video_i2v", "preset_benchmark_matrix.json")
  );
  if (!fs.existsSync(matrixPath)) {
    throw new Error(`benchmark matrix not found: ${matrixPath}`);
  }

  const outputPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("out") ?? path.join("out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.json")
  );
  const envPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("env-out") ?? path.join("out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.env")
  );

  const parsed = JSON.parse(fs.readFileSync(matrixPath, "utf8")) as BenchmarkMatrixLike;
  const recommendationSummary = asRecord(parsed.recommendation_summary ?? null);
  if (!recommendationSummary) {
    throw new Error(`benchmark matrix missing recommendation_summary: ${matrixPath}`);
  }

  const defaultTarget = resolveDefaultTarget();
  const rolloutJson = buildRuntimeSidecarPresetRolloutFile({
    recommendationSummary,
    defaultTarget,
    sourceMatrixPath: matrixPath,
    sourceRenderer: isString(parsed.renderer) ? parsed.renderer.trim() : null,
    sourceFixturePath: isString(parsed.fixture_path) ? parsed.fixture_path.trim() : null,
    sourceCharacterPackId: isString(parsed.character_pack_id) ? parsed.character_pack_id.trim() : null,
    sourceScenarioSet: isString(parsed.scenario_set) ? parsed.scenario_set.trim() : null,
    scoreFormulaVersion: isString(parsed.score_formula_version) ? parsed.score_formula_version.trim() : null
  });
  const targets = rolloutJson.targets;
  if (!targets.overall && !targets.balanced && !targets.strict) {
    throw new Error(`benchmark matrix did not contain any rollout candidates: ${matrixPath}`);
  }

  writeRuntimeSidecarPresetRolloutArtifacts({
    outputPath,
    envPath,
    rolloutJson
  });

  console.log(`SIDECAR ROLLOUT FILE: ${outputPath}`);
  console.log(`SIDECAR ROLLOUT ENV: ${envPath}`);
}

main().catch((error) => {
  console.error(`materializeSidecarPresetRollout FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
