import { bootstrapEnv } from "./bootstrapEnv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRuntimeSidecarPresetRolloutFile,
  type RuntimeRolloutRecommendationSummary,
  type RuntimeRolloutArtifactTarget,
  type RuntimeRolloutGuardrailPolicy
} from "./sidecarPresetRolloutArtifact";
import {
  buildRuntimeSidecarPresetMultiChannelRolloutFile,
  parseRuntimeSidecarPresetMultiChannelCrossChannelComparison,
  writeRuntimeSidecarPresetMultiChannelRolloutArtifacts,
  type MultiChannelRolloutBundleName
} from "./sidecarMultiChannelRolloutArtifact";
import {
  DEFAULT_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_POLICIES,
  DEFAULT_SIDECAR_PRESET_ROLLOUT_MAX_AGE_HOURS,
  DEFAULT_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET
} from "./sidecarPresetRollout";

bootstrapEnv();

type MultiChannelSummaryLike = {
  benchmark_kind?: unknown;
  cross_channel_comparison?: unknown;
  bundles?: unknown;
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

function resolveLocalPath(repoRoot: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function parseFiniteNumber(value: string | undefined): number | null {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTruthy(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseAllowedVerdicts(raw: string | undefined, fallback: readonly string[]): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [...fallback];
  }
  const values = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return values.length > 0 ? values : [...fallback];
}

function resolveDefaultTarget(): RuntimeRolloutArtifactTarget {
  const raw =
    resolveArgValue("default-target") ??
    process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_TARGET?.trim() ??
    process.env.VIDEO_SIDECAR_PRESET_PROMOTION_DEFAULT_TARGET?.trim() ??
    "overall";
  return raw === "balanced" || raw === "strict" ? raw : "overall";
}

function resolveDefaultBundle(): MultiChannelRolloutBundleName {
  const raw =
    resolveArgValue("default-bundle") ??
    process.env.VIDEO_SIDECAR_PRESET_MULTICHANNEL_DEFAULT_BUNDLE?.trim() ??
    "economy";
  return raw === "medical" ? "medical" : "economy";
}

function resolveBundleRolloutPolicy(bundle: MultiChannelRolloutBundleName): RuntimeRolloutGuardrailPolicy {
  const prefix = bundle.toUpperCase();
  const defaults = DEFAULT_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_POLICIES[bundle];
  const minScore =
    parseFiniteNumber(process.env[`VIDEO_SIDECAR_PRESET_MULTICHANNEL_${prefix}_MIN_SCORE`]) ??
    parseFiniteNumber(process.env[`BENCHMARK_MULTICHANNEL_${prefix}_MIN_SCORE`]) ??
    defaults.minScore;
  const allowedVerdicts = parseAllowedVerdicts(
    process.env[`VIDEO_SIDECAR_PRESET_MULTICHANNEL_${prefix}_ALLOWED_VERDICTS`] ??
      process.env[`BENCHMARK_MULTICHANNEL_${prefix}_ALLOWED_VERDICTS`],
    defaults.allowedVerdicts
  );
  const maxAgeHours =
    parseFiniteNumber(process.env[`VIDEO_SIDECAR_PRESET_MULTICHANNEL_${prefix}_MAX_AGE_HOURS`]) ??
    parseFiniteNumber(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_MAX_AGE_HOURS) ??
    DEFAULT_SIDECAR_PRESET_ROLLOUT_MAX_AGE_HOURS;
  const preserveControlnet =
    typeof process.env[`VIDEO_SIDECAR_PRESET_MULTICHANNEL_${prefix}_PRESERVE_CONTROLNET`] === "string"
      ? parseTruthy(process.env[`VIDEO_SIDECAR_PRESET_MULTICHANNEL_${prefix}_PRESERVE_CONTROLNET`], true)
      : typeof process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET === "string"
        ? parseTruthy(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET, true)
        : DEFAULT_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET;
  const requireReady =
    typeof process.env[`VIDEO_SIDECAR_PRESET_MULTICHANNEL_${prefix}_REQUIRE_READY`] === "string"
      ? parseTruthy(process.env[`VIDEO_SIDECAR_PRESET_MULTICHANNEL_${prefix}_REQUIRE_READY`], true)
      : typeof process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_REQUIRE_READY === "string"
        ? parseTruthy(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_REQUIRE_READY, true)
        : parseTruthy(process.env.BENCHMARK_MULTICHANNEL_REQUIRE_READY, true);
  return {
    min_score: minScore,
    max_age_hours: maxAgeHours > 0 ? maxAgeHours : null,
    allowed_verdicts: allowedVerdicts,
    preserve_controlnet: preserveControlnet,
    require_ready: requireReady
  };
}

function main() {
  const repoRoot = resolveRepoRoot();
  const summaryPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("summary") ??
      path.join("out", "multi_channel_benchmarks", "video_i2v", "multi_channel_benchmark_summary.json")
  );
  const outputPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("out") ??
      path.join("out", "multi_channel_benchmarks", "video_i2v", "runtime_sidecar_multichannel_rollout.json")
  );
  const envPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("env-out") ??
      path.join("out", "multi_channel_benchmarks", "video_i2v", "runtime_sidecar_multichannel_rollout.env")
  );
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`multi-channel benchmark summary not found: ${summaryPath}`);
  }

  const summary = readJson(summaryPath) as MultiChannelSummaryLike;
  const benchmarkKind = asString(summary.benchmark_kind) ?? "presets";
  if (benchmarkKind !== "presets") {
    throw new Error(`multichannel rollout materialization requires presets summary, received ${benchmarkKind}`);
  }

  const bundles = Array.isArray(summary.bundles) ? summary.bundles : [];
  const rolloutBundles: Partial<
    Record<MultiChannelRolloutBundleName, ReturnType<typeof buildRuntimeSidecarPresetRolloutFile>>
  > = {};

  for (const bundleName of ["economy", "medical"] as const) {
    const bundleEntry =
      bundles.find((value) => asString(asRecord(value)?.bundle) === bundleName) ??
      null;
    const bundleRecord = asRecord(bundleEntry);
    const matrixPath = asString(bundleRecord?.matrix_path);
    if (!matrixPath || !fs.existsSync(matrixPath)) {
      throw new Error(`missing matrix for ${bundleName}: ${matrixPath ?? "null"}`);
    }
    const matrix = asRecord(readJson(matrixPath));
    const recommendationSummary = asRecord(matrix?.recommendation_summary) as RuntimeRolloutRecommendationSummary | null;
    if (!recommendationSummary) {
      throw new Error(`matrix missing recommendation_summary for ${bundleName}: ${matrixPath}`);
    }
    rolloutBundles[bundleName] = buildRuntimeSidecarPresetRolloutFile({
      recommendationSummary,
      defaultTarget: resolveDefaultTarget(),
      rolloutPolicy: resolveBundleRolloutPolicy(bundleName),
      sourceMatrixPath: matrixPath,
      sourceRenderer: asString(matrix?.renderer),
      sourceFixturePath: asString(matrix?.fixture_path),
      sourceCharacterPackId: asString(matrix?.character_pack_id),
      sourceScenarioSet: asString(matrix?.scenario_set),
      scoreFormulaVersion: asString(matrix?.score_formula_version)
    });
  }

  const rolloutJson = buildRuntimeSidecarPresetMultiChannelRolloutFile({
    sourceSummaryPath: summaryPath,
    sourceBenchmarkKind: benchmarkKind,
    defaultBundle: resolveDefaultBundle(),
    crossChannelComparison: parseRuntimeSidecarPresetMultiChannelCrossChannelComparison(
      summary.cross_channel_comparison
    ),
    bundles: rolloutBundles
  });

  writeRuntimeSidecarPresetMultiChannelRolloutArtifacts({
    outputPath,
    envPath,
    rolloutJson,
    defaultTarget: resolveDefaultTarget()
  });

  console.log(`SIDECAR MULTICHANNEL ROLLOUT: ${outputPath}`);
  console.log(`SIDECAR MULTICHANNEL ROLLOUT ENV: ${envPath}`);
}

try {
  main();
} catch (error) {
  console.error(
    `materializeSidecarMultiChannelRollout FAIL: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
