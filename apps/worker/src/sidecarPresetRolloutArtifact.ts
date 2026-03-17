import fs from "node:fs";
import path from "node:path";
import type { SidecarControlNetPresetId, SidecarImpactPresetId, SidecarQcPresetId } from "@ec/profiles";
import {
  DEFAULT_SIDECAR_PRESET_ROLLOUT_ALLOWED_VERDICTS,
  DEFAULT_SIDECAR_PRESET_ROLLOUT_MAX_AGE_HOURS,
  DEFAULT_SIDECAR_PRESET_ROLLOUT_MIN_SCORE,
  DEFAULT_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET,
  type RolloutTarget
} from "./sidecarPresetRollout";
import {
  normalizeSidecarBenchmarkAnchorConfidenceByView,
  type SidecarBenchmarkAnchorConfidenceByView
} from "./sidecarBenchmarkSchema";

export type RuntimeRolloutArtifactTarget = Exclude<RolloutTarget, "auto">;

export type RuntimeRolloutSummaryCandidate = {
  scenario: string | null;
  score: number | null;
  verdict: string | null;
  fallback_reason: string | null;
  fallback_reason_codes: string[];
  head_pose_score: number | null;
  eye_drift_score: number | null;
  mouth_readability_score: number | null;
  landmark_consistency_score: number | null;
  anchor_confidence_overall: number | null;
  anchor_confidence_by_view: SidecarBenchmarkAnchorConfidenceByView | null;
  review_only: boolean | null;
  controlnet_preset: SidecarControlNetPresetId;
  impact_preset: SidecarImpactPresetId;
  qc_preset: SidecarQcPresetId;
};

export type RuntimeRolloutGuardrailPolicy = {
  min_score: number;
  max_age_hours: number | null;
  allowed_verdicts: string[];
  preserve_controlnet: boolean;
  require_ready: boolean;
};

export type RuntimeRolloutRecommendationSummary = {
  best_overall?: unknown;
  best_balanced_qc?: unknown;
  best_strict_qc?: unknown;
};

export type RuntimeSidecarPresetRolloutFile = {
  schema_version: "1.0";
  generated_at: string;
  rollout_kind: "sidecar_preset_runtime";
  default_target: RuntimeRolloutArtifactTarget;
  rollout_policy: RuntimeRolloutGuardrailPolicy | null;
  source_matrix_path: string | null;
  source_renderer: string | null;
  source_fixture_path: string | null;
  source_character_pack_id: string | null;
  source_scenario_set: string | null;
  score_formula_version: string | null;
  targets: {
    overall: RuntimeRolloutSummaryCandidate | null;
    balanced: RuntimeRolloutSummaryCandidate | null;
    strict: RuntimeRolloutSummaryCandidate | null;
  };
};

type WriteRuntimeSidecarPresetRolloutArtifactsInput = {
  outputPath: string;
  envPath: string;
  rolloutJson: RuntimeSidecarPresetRolloutFile;
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeStringArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
    : [];
}

function normalizeFallbackReasonCodes(values: unknown, fallbackReason: string | null): string[] {
  const codes = new Set<string>();
  if (fallbackReason) {
    codes.add(fallbackReason);
  }
  for (const code of normalizeStringArray(values)) {
    codes.add(code);
  }
  return [...codes];
}

function normalizeNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeFiniteNumber(value: unknown, digits = 2): number | null {
  if (!isFiniteNumber(value)) {
    return null;
  }
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const CONTROLNET_PRESETS = new Set<SidecarControlNetPresetId>([
  "pose_depth_balance_v1",
  "pose_canny_balance_v1",
  "profile_lineart_depth_v1"
]);

const IMPACT_PRESETS = new Set<SidecarImpactPresetId>([
  "broadcast_cleanup_v1",
  "identity_repair_detail_v1",
  "soft_clarity_cleanup_v1",
  "soft_clarity_repair_v1"
]);

const QC_PRESETS = new Set<SidecarQcPresetId>(["broadcast_balanced_v1", "broadcast_identity_strict_v1"]);

function isControlnetPreset(value: unknown): value is SidecarControlNetPresetId {
  return typeof value === "string" && CONTROLNET_PRESETS.has(value as SidecarControlNetPresetId);
}

function isImpactPreset(value: unknown): value is SidecarImpactPresetId {
  return typeof value === "string" && IMPACT_PRESETS.has(value as SidecarImpactPresetId);
}

function isQcPreset(value: unknown): value is SidecarQcPresetId {
  return typeof value === "string" && QC_PRESETS.has(value as SidecarQcPresetId);
}

export function parseRuntimeRolloutSummaryCandidate(value: unknown): RuntimeRolloutSummaryCandidate | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  if (!isControlnetPreset(record.controlnet_preset)) {
    return null;
  }
  if (!isImpactPreset(record.impact_preset)) {
    return null;
  }
  if (!isQcPreset(record.qc_preset)) {
    return null;
  }
  const fallbackReason = isNonEmptyString(record.fallback_reason) ? record.fallback_reason.trim() : null;
  return {
    scenario: isNonEmptyString(record.scenario) ? record.scenario.trim() : null,
    score: isFiniteNumber(record.score) ? record.score : null,
    verdict: isNonEmptyString(record.verdict) ? record.verdict.trim() : null,
    fallback_reason: fallbackReason,
    fallback_reason_codes: normalizeFallbackReasonCodes(record.fallback_reason_codes, fallbackReason),
    head_pose_score: normalizeFiniteNumber(record.head_pose_score),
    eye_drift_score: normalizeFiniteNumber(record.eye_drift_score),
    mouth_readability_score: normalizeFiniteNumber(record.mouth_readability_score),
    landmark_consistency_score: normalizeFiniteNumber(record.landmark_consistency_score),
    anchor_confidence_overall: normalizeFiniteNumber(record.anchor_confidence_overall, 3),
    anchor_confidence_by_view: normalizeSidecarBenchmarkAnchorConfidenceByView(record.anchor_confidence_by_view),
    review_only: normalizeNullableBoolean(record.review_only),
    controlnet_preset: record.controlnet_preset,
    impact_preset: record.impact_preset,
    qc_preset: record.qc_preset
  };
}

export function parseRuntimeRolloutGuardrailPolicy(value: unknown): RuntimeRolloutGuardrailPolicy | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const minScore = isFiniteNumber(record.min_score) ? record.min_score : null;
  const maxAgeHours =
    record.max_age_hours === null ? null : isFiniteNumber(record.max_age_hours) ? record.max_age_hours : null;
  const allowedVerdicts = Array.isArray(record.allowed_verdicts)
    ? record.allowed_verdicts.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
  const preserveControlnet = typeof record.preserve_controlnet === "boolean" ? record.preserve_controlnet : null;
  const requireReady = typeof record.require_ready === "boolean" ? record.require_ready : null;
  if (minScore === null || preserveControlnet === null || requireReady === null || allowedVerdicts.length === 0) {
    return null;
  }
  return {
    min_score: minScore,
    max_age_hours: maxAgeHours,
    allowed_verdicts: allowedVerdicts,
    preserve_controlnet: preserveControlnet,
    require_ready: requireReady
  };
}

export function buildRuntimeSidecarPresetRolloutFile(input: {
  recommendationSummary: RuntimeRolloutRecommendationSummary;
  defaultTarget: RuntimeRolloutArtifactTarget;
  rolloutPolicy?: RuntimeRolloutGuardrailPolicy | null;
  sourceMatrixPath: string | null;
  sourceRenderer: string | null;
  sourceFixturePath: string | null;
  sourceCharacterPackId: string | null;
  sourceScenarioSet: string | null;
  scoreFormulaVersion: string | null;
}): RuntimeSidecarPresetRolloutFile {
  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    rollout_kind: "sidecar_preset_runtime",
    default_target: input.defaultTarget,
    rollout_policy: input.rolloutPolicy ?? null,
    source_matrix_path: input.sourceMatrixPath,
    source_renderer: input.sourceRenderer,
    source_fixture_path: input.sourceFixturePath,
    source_character_pack_id: input.sourceCharacterPackId,
    source_scenario_set: input.sourceScenarioSet,
    score_formula_version: input.scoreFormulaVersion,
    targets: {
      overall: parseRuntimeRolloutSummaryCandidate(input.recommendationSummary.best_overall),
      balanced: parseRuntimeRolloutSummaryCandidate(input.recommendationSummary.best_balanced_qc),
      strict: parseRuntimeRolloutSummaryCandidate(input.recommendationSummary.best_strict_qc)
    }
  };
}

export function buildRuntimeSidecarPresetRolloutEnvLines(input: {
  outputPath: string;
  defaultTarget: RuntimeRolloutArtifactTarget;
  minScore?: number;
  maxAgeHours?: number | null;
  allowedVerdicts?: string[];
  preserveControlnet?: boolean;
  requireReady?: boolean;
}): string[] {
  const minScore = input.minScore ?? DEFAULT_SIDECAR_PRESET_ROLLOUT_MIN_SCORE;
  const maxAgeHours =
    input.maxAgeHours === undefined ? DEFAULT_SIDECAR_PRESET_ROLLOUT_MAX_AGE_HOURS : input.maxAgeHours;
  const allowedVerdicts =
    input.allowedVerdicts && input.allowedVerdicts.length > 0
      ? input.allowedVerdicts
      : [...DEFAULT_SIDECAR_PRESET_ROLLOUT_ALLOWED_VERDICTS];
  const preserveControlnet =
    input.preserveControlnet === undefined
      ? DEFAULT_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET
      : input.preserveControlnet;
  const requireReady = input.requireReady === undefined ? true : input.requireReady;
  return [
    "VIDEO_SIDECAR_PRESET_ROLLOUT_ENABLED=true",
    `VIDEO_SIDECAR_PRESET_ROLLOUT_FILE_PATH=${input.outputPath}`,
    `VIDEO_SIDECAR_PRESET_ROLLOUT_TARGET=${input.defaultTarget}`,
    `VIDEO_SIDECAR_PRESET_ROLLOUT_MIN_SCORE=${minScore}`,
    `VIDEO_SIDECAR_PRESET_ROLLOUT_ALLOWED_VERDICTS=${allowedVerdicts.join(",")}`,
    ...(maxAgeHours === null ? [] : [`VIDEO_SIDECAR_PRESET_ROLLOUT_MAX_AGE_HOURS=${maxAgeHours}`]),
    `VIDEO_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET=${preserveControlnet ? "true" : "false"}`,
    `VIDEO_SIDECAR_PRESET_ROLLOUT_REQUIRE_READY=${requireReady ? "true" : "false"}`
  ];
}

export function writeRuntimeSidecarPresetRolloutArtifacts(
  input: WriteRuntimeSidecarPresetRolloutArtifactsInput
): { outputPath: string; envPath: string; envLines: string[] } {
  ensureDir(path.dirname(input.outputPath));
  fs.writeFileSync(input.outputPath, `${JSON.stringify(input.rolloutJson, null, 2)}\n`, "utf8");
  const rolloutPolicy = parseRuntimeRolloutGuardrailPolicy(input.rolloutJson.rollout_policy ?? null);
  const envLines = buildRuntimeSidecarPresetRolloutEnvLines({
    outputPath: input.outputPath,
    defaultTarget: input.rolloutJson.default_target,
    minScore: input.minScore ?? rolloutPolicy?.min_score,
    maxAgeHours: input.maxAgeHours === undefined ? rolloutPolicy?.max_age_hours : input.maxAgeHours,
    allowedVerdicts: input.allowedVerdicts ?? rolloutPolicy?.allowed_verdicts,
    preserveControlnet: input.preserveControlnet ?? rolloutPolicy?.preserve_controlnet,
    requireReady: input.requireReady ?? rolloutPolicy?.require_ready
  });
  ensureDir(path.dirname(input.envPath));
  fs.writeFileSync(input.envPath, `${envLines.join("\n")}\n`, "utf8");
  return {
    outputPath: input.outputPath,
    envPath: input.envPath,
    envLines
  };
}
