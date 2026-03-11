import fs from "node:fs";
import path from "node:path";
import {
  buildRuntimeSidecarPresetRolloutEnvLines,
  parseRuntimeRolloutGuardrailPolicy,
  type RuntimeRolloutArtifactTarget,
  type RuntimeSidecarPresetRolloutFile
} from "./sidecarPresetRolloutArtifact";

export type MultiChannelRolloutBundleName = "economy" | "medical";
export type MultiChannelRolloutDifferingAxis = "controlnet" | "impact" | "qc";

export type RuntimeSidecarPresetMultiChannelTriplet = {
  controlnet_preset: string | null;
  impact_preset: string | null;
  qc_preset: string | null;
};

export type RuntimeSidecarPresetMultiChannelCrossChannelComparison = {
  shared_best_triplet: boolean | null;
  divergence_level: "none" | "minor" | "moderate" | "major" | "critical" | "insufficient" | "n/a" | null;
  differing_axes: MultiChannelRolloutDifferingAxis[];
  score_gap: number | null;
  economy_score: number | null;
  medical_score: number | null;
  economy_triplet: RuntimeSidecarPresetMultiChannelTriplet | null;
  medical_triplet: RuntimeSidecarPresetMultiChannelTriplet | null;
  recommendation: string | null;
};

export type RuntimeSidecarPresetMultiChannelRolloutFile = {
  schema_version: "1.0";
  generated_at: string;
  rollout_kind: "sidecar_preset_runtime_multichannel";
  default_bundle: MultiChannelRolloutBundleName;
  source_summary_path: string | null;
  source_benchmark_kind: string | null;
  cross_channel_comparison: RuntimeSidecarPresetMultiChannelCrossChannelComparison | null;
  bundles: {
    economy: RuntimeSidecarPresetRolloutFile | null;
    medical: RuntimeSidecarPresetRolloutFile | null;
  };
};

type WriteRuntimeSidecarPresetMultiChannelRolloutArtifactsInput = {
  outputPath: string;
  envPath: string;
  rolloutJson: RuntimeSidecarPresetMultiChannelRolloutFile;
  defaultTarget: RuntimeRolloutArtifactTarget;
  minScore?: number;
  maxAgeHours?: number | null;
  allowedVerdicts?: string[];
  preserveControlnet?: boolean;
  requireReady?: boolean;
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
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

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseTriplet(value: unknown): RuntimeSidecarPresetMultiChannelTriplet | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    controlnet_preset: asString(record.controlnet_preset),
    impact_preset: asString(record.impact_preset),
    qc_preset: asString(record.qc_preset)
  };
}

export function parseRuntimeSidecarPresetMultiChannelCrossChannelComparison(
  value: unknown
): RuntimeSidecarPresetMultiChannelCrossChannelComparison | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const differingAxes = Array.isArray(record.differing_axes)
    ? record.differing_axes.filter(
        (entry): entry is MultiChannelRolloutDifferingAxis =>
          entry === "controlnet" || entry === "impact" || entry === "qc"
      )
    : [];
  const divergenceLevelRaw = asString(record.divergence_level);
  const divergenceLevel =
    divergenceLevelRaw === "none" ||
    divergenceLevelRaw === "minor" ||
    divergenceLevelRaw === "moderate" ||
    divergenceLevelRaw === "major" ||
    divergenceLevelRaw === "critical" ||
    divergenceLevelRaw === "insufficient" ||
    divergenceLevelRaw === "n/a"
      ? divergenceLevelRaw
      : null;
  return {
    shared_best_triplet: asBoolean(record.shared_best_triplet),
    divergence_level: divergenceLevel,
    differing_axes: differingAxes,
    score_gap: asFiniteNumber(record.score_gap),
    economy_score: asFiniteNumber(record.economy_score),
    medical_score: asFiniteNumber(record.medical_score),
    economy_triplet: parseTriplet(record.economy_triplet),
    medical_triplet: parseTriplet(record.medical_triplet),
    recommendation: asString(record.recommendation)
  };
}

export function buildRuntimeSidecarPresetMultiChannelRolloutFile(input: {
  sourceSummaryPath: string | null;
  sourceBenchmarkKind: string | null;
  defaultBundle?: MultiChannelRolloutBundleName;
  crossChannelComparison?: RuntimeSidecarPresetMultiChannelCrossChannelComparison | null;
  bundles: Partial<Record<MultiChannelRolloutBundleName, RuntimeSidecarPresetRolloutFile | null>>;
}): RuntimeSidecarPresetMultiChannelRolloutFile {
  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    rollout_kind: "sidecar_preset_runtime_multichannel",
    default_bundle: input.defaultBundle ?? "economy",
    source_summary_path: input.sourceSummaryPath,
    source_benchmark_kind: input.sourceBenchmarkKind,
    cross_channel_comparison: input.crossChannelComparison ?? null,
    bundles: {
      economy: input.bundles.economy ?? null,
      medical: input.bundles.medical ?? null
    }
  };
}

export function buildRuntimeSidecarPresetMultiChannelRolloutEnvLines(input: {
  outputPath: string;
  rolloutJson: RuntimeSidecarPresetMultiChannelRolloutFile;
  defaultTarget?: RuntimeRolloutArtifactTarget;
}): string[] {
  const defaultBundleRollout =
    input.rolloutJson.bundles[input.rolloutJson.default_bundle] ??
    input.rolloutJson.bundles.economy ??
    input.rolloutJson.bundles.medical;
  const defaultTarget = input.defaultTarget ?? defaultBundleRollout?.default_target ?? "overall";
  const defaultPolicy = parseRuntimeRolloutGuardrailPolicy(defaultBundleRollout?.rollout_policy ?? null);
  const baseLines = buildRuntimeSidecarPresetRolloutEnvLines({
    outputPath: input.outputPath,
    defaultTarget,
    minScore: defaultPolicy?.min_score,
    maxAgeHours: defaultPolicy?.max_age_hours,
    allowedVerdicts: defaultPolicy?.allowed_verdicts,
    preserveControlnet: defaultPolicy?.preserve_controlnet,
    requireReady: defaultPolicy?.require_ready
  }).filter((line) => !line.startsWith("VIDEO_SIDECAR_PRESET_ROLLOUT_FILE_PATH="));
  const bundlePolicyLines = (["economy", "medical"] as const).flatMap((bundleName) => {
    const bundleRollout = input.rolloutJson.bundles[bundleName];
    const policy = parseRuntimeRolloutGuardrailPolicy(bundleRollout?.rollout_policy ?? null);
    if (!policy) {
      return [];
    }
    const prefix = `VIDEO_SIDECAR_PRESET_MULTICHANNEL_${bundleName.toUpperCase()}`;
    return [
      `${prefix}_MIN_SCORE=${policy.min_score}`,
      `${prefix}_ALLOWED_VERDICTS=${policy.allowed_verdicts.join(",")}`,
      ...(policy.max_age_hours === null ? [] : [`${prefix}_MAX_AGE_HOURS=${policy.max_age_hours}`]),
      `${prefix}_PRESERVE_CONTROLNET=${policy.preserve_controlnet ? "true" : "false"}`,
      `${prefix}_REQUIRE_READY=${policy.require_ready ? "true" : "false"}`
    ];
  });
  return [
    ...baseLines,
    ...bundlePolicyLines,
    `VIDEO_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_FILE_PATH=${input.outputPath}`
  ];
}

export function writeRuntimeSidecarPresetMultiChannelRolloutArtifacts(
  input: WriteRuntimeSidecarPresetMultiChannelRolloutArtifactsInput
): { outputPath: string; envPath: string; envLines: string[] } {
  ensureDir(path.dirname(input.outputPath));
  fs.writeFileSync(input.outputPath, `${JSON.stringify(input.rolloutJson, null, 2)}\n`, "utf8");
  const envLines = buildRuntimeSidecarPresetMultiChannelRolloutEnvLines({
    outputPath: input.outputPath,
    rolloutJson: input.rolloutJson,
    defaultTarget: input.defaultTarget
  });
  ensureDir(path.dirname(input.envPath));
  fs.writeFileSync(input.envPath, `${envLines.join("\n")}\n`, "utf8");
  return {
    outputPath: input.outputPath,
    envPath: input.envPath,
    envLines
  };
}
