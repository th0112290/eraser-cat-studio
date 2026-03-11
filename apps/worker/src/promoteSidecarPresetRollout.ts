import { bootstrapEnv } from "./bootstrapEnv";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  buildRuntimeSidecarPresetRolloutFile,
  parseRuntimeRolloutSummaryCandidate,
  writeRuntimeSidecarPresetRolloutArtifacts,
  type RuntimeRolloutRecommendationSummary,
  type RuntimeRolloutArtifactTarget,
  type RuntimeRolloutSummaryCandidate
} from "./sidecarPresetRolloutArtifact";

bootstrapEnv();

type BenchmarkMatrixLike = {
  renderer?: unknown;
  fixture_path?: unknown;
  character_pack_id?: unknown;
  scenario_set?: unknown;
  scenario_count?: unknown;
  score_formula_version?: unknown;
  recommendation_summary?: RuntimeRolloutRecommendationSummary;
  scenarios?: unknown;
};

type PromotionTargetGateResult = {
  target: RuntimeRolloutArtifactTarget;
  passed: boolean;
  reason: string;
  candidate: RuntimeRolloutSummaryCandidate | null;
};

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

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function resolveLocalPath(repoRoot: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveDefaultTarget(): RuntimeRolloutArtifactTarget {
  const raw =
    resolveArgValue("default-target") ??
    process.env.VIDEO_SIDECAR_PRESET_PROMOTION_DEFAULT_TARGET?.trim() ??
    process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_TARGET?.trim() ??
    "overall";
  return raw === "balanced" || raw === "strict" ? raw : "overall";
}

function resolveMinScore(): number {
  const raw = Number.parseFloat(resolveArgValue("min-score") ?? process.env.VIDEO_SIDECAR_PRESET_PROMOTION_MIN_SCORE ?? "85");
  return Number.isFinite(raw) ? raw : 85;
}

function resolveAllowedVerdicts(): string[] {
  const raw =
    resolveArgValue("allowed-verdicts") ??
    process.env.VIDEO_SIDECAR_PRESET_PROMOTION_ALLOWED_VERDICTS?.trim() ??
    "recommended";
  const values = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return values.length > 0 ? values : ["recommended"];
}

function resolveRequiredScenarioSet(): string | null {
  return (
    resolveArgValue("require-scenario-set") ??
    process.env.VIDEO_SIDECAR_PRESET_PROMOTION_REQUIRE_SCENARIO_SET?.trim() ??
    null
  );
}

function resolveMinScenarioCount(): number {
  const raw = Number.parseInt(
    process.env.VIDEO_SIDECAR_PRESET_PROMOTION_MIN_SCENARIO_COUNT ?? resolveArgValue("min-scenario-count") ?? "3",
    10
  );
  return Number.isInteger(raw) && raw >= 0 ? raw : 3;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function backupIfExists(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const backupPath = `${filePath}.bak`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function evaluateTargetGate(input: {
  target: RuntimeRolloutArtifactTarget;
  candidate: RuntimeRolloutSummaryCandidate | null;
  minScore: number;
  allowedVerdicts: string[];
}): PromotionTargetGateResult {
  if (!input.candidate) {
    return {
      target: input.target,
      passed: false,
      reason: "candidate_missing",
      candidate: null
    };
  }
  const score = input.candidate.score;
  if (score === null || score < input.minScore) {
    return {
      target: input.target,
      passed: false,
      reason: `below_min_score:${score ?? "null"}<${input.minScore}`,
      candidate: input.candidate
    };
  }
  const verdict = typeof input.candidate.verdict === "string" ? input.candidate.verdict.trim().toLowerCase() : null;
  if (!verdict || !input.allowedVerdicts.includes(verdict)) {
    return {
      target: input.target,
      passed: false,
      reason: `verdict_blocked:${verdict ?? "null"}`,
      candidate: input.candidate
    };
  }
  return {
    target: input.target,
    passed: true,
    reason: "passed",
    candidate: input.candidate
  };
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
  const reportPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("report-out") ?? path.join("out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.promotion_report.json")
  );

  const defaultTarget = resolveDefaultTarget();
  const minScore = resolveMinScore();
  const allowedVerdicts = resolveAllowedVerdicts();
  const requiredScenarioSet = resolveRequiredScenarioSet();
  const minScenarioCount = resolveMinScenarioCount();
  const dryRun = hasFlag("dry-run");

  const matrixRaw = fs.readFileSync(matrixPath, "utf8");
  const matrix = JSON.parse(matrixRaw) as BenchmarkMatrixLike;
  const recommendationSummary = asRecord(matrix.recommendation_summary ?? null);
  if (!recommendationSummary) {
    throw new Error(`benchmark matrix missing recommendation_summary: ${matrixPath}`);
  }
  const scenarioSet = asString(matrix.scenario_set);
  if (requiredScenarioSet && scenarioSet !== requiredScenarioSet) {
    throw new Error(`scenario_set mismatch: expected ${requiredScenarioSet}, received ${scenarioSet ?? "null"}`);
  }
  const scenarioCount =
    asFiniteNumber(matrix.scenario_count) ??
    (Array.isArray(matrix.scenarios) ? matrix.scenarios.length : null) ??
    0;
  if (scenarioCount < minScenarioCount) {
    throw new Error(`scenario_count ${scenarioCount} is below promotion minimum ${minScenarioCount}`);
  }

  const candidateByTarget = {
    overall: parseRuntimeRolloutSummaryCandidate(recommendationSummary.best_overall),
    balanced: parseRuntimeRolloutSummaryCandidate(recommendationSummary.best_balanced_qc),
    strict: parseRuntimeRolloutSummaryCandidate(recommendationSummary.best_strict_qc)
  } satisfies Record<RuntimeRolloutArtifactTarget, RuntimeRolloutSummaryCandidate | null>;
  const targetGateResults = (Object.keys(candidateByTarget) as RuntimeRolloutArtifactTarget[]).map((target) =>
    evaluateTargetGate({
      target,
      candidate: candidateByTarget[target],
      minScore,
      allowedVerdicts
    })
  );
  const passedTargets = Object.fromEntries(
    targetGateResults.map((result) => [result.target, result.passed ? result.candidate : null])
  ) as Record<RuntimeRolloutArtifactTarget, RuntimeRolloutSummaryCandidate | null>;
  const defaultTargetGate = targetGateResults.find((result) => result.target === defaultTarget);
  if (!defaultTargetGate?.passed || !passedTargets[defaultTarget]) {
    throw new Error(`default target ${defaultTarget} failed promotion gate: ${defaultTargetGate?.reason ?? "unknown"}`);
  }
  if (!passedTargets.overall && !passedTargets.balanced && !passedTargets.strict) {
    throw new Error("promotion gate rejected all rollout targets");
  }

  const promotedRollout = buildRuntimeSidecarPresetRolloutFile({
    recommendationSummary: {
      best_overall: passedTargets.overall,
      best_balanced_qc: passedTargets.balanced,
      best_strict_qc: passedTargets.strict
    },
    defaultTarget,
    sourceMatrixPath: matrixPath,
    sourceRenderer: asString(matrix.renderer),
    sourceFixturePath: asString(matrix.fixture_path),
    sourceCharacterPackId: asString(matrix.character_pack_id),
    sourceScenarioSet: scenarioSet,
    scoreFormulaVersion: asString(matrix.score_formula_version)
  });

  const report = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    promotion_kind: "sidecar_preset_rollout_v1",
    dry_run: dryRun,
    matrix_path: matrixPath,
    matrix_sha256: sha256File(matrixPath),
    output_path: outputPath,
    env_out_path: envPath,
    default_target: defaultTarget,
    scenario_set: scenarioSet,
    scenario_count: scenarioCount,
    gate: {
      min_score: minScore,
      allowed_verdicts: allowedVerdicts,
      required_scenario_set: requiredScenarioSet,
      min_scenario_count: minScenarioCount
    },
    target_results: targetGateResults,
    promoted_targets: promotedRollout.targets
  };

  if (dryRun) {
    writeJson(reportPath, report);
    console.log(`SIDECAR PRESET PROMOTION REPORT: ${reportPath}`);
    console.log(`SIDECAR PRESET PROMOTION DRY RUN: default target ${defaultTarget} passed`);
    return;
  }

  const outputBackupPath = backupIfExists(outputPath);
  const envBackupPath = backupIfExists(envPath);
  writeRuntimeSidecarPresetRolloutArtifacts({
    outputPath,
    envPath,
    rolloutJson: {
      ...promotedRollout,
      promoted_at: new Date().toISOString(),
      promotion_gate: report.gate,
      target_results: targetGateResults,
      source_matrix_sha256: report.matrix_sha256
    } as typeof promotedRollout,
    minScore,
    allowedVerdicts
  });
  writeJson(reportPath, {
    ...report,
    output_backup_path: outputBackupPath,
    env_backup_path: envBackupPath
  });

  console.log(`SIDECAR PRESET PROMOTED: ${outputPath}`);
  console.log(`SIDECAR PRESET ENV: ${envPath}`);
  console.log(`SIDECAR PRESET PROMOTION REPORT: ${reportPath}`);
}

main().catch((error) => {
  console.error(`promoteSidecarPresetRollout FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
