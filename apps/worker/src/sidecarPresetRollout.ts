import fs from "node:fs";
import path from "node:path";
import type { SidecarControlNetPresetId, SidecarImpactPresetId, SidecarQcPresetId } from "@ec/profiles";

type RolloutSummaryCandidate = {
  controlnet_preset: SidecarControlNetPresetId;
  impact_preset: SidecarImpactPresetId;
  qc_preset: SidecarQcPresetId;
  scenario: string | null;
  score: number | null;
  verdict: string | null;
};

type RuntimeRolloutMatrix = {
  recommendation_summary?: {
    best_overall?: unknown;
    best_balanced_qc?: unknown;
    best_strict_qc?: unknown;
  };
};

type RuntimeRolloutFile = {
  generated_at?: unknown;
  default_target?: unknown;
  rollout_policy?: unknown;
  targets?: {
    overall?: unknown;
    balanced?: unknown;
    strict?: unknown;
  };
};

type RolloutChannelDomain = "economy" | "medical";

type RuntimeMultiChannelRolloutFile = {
  default_bundle?: unknown;
  bundles?: {
    economy?: unknown;
    medical?: unknown;
  };
};

export type SidecarPresetRolloutResolution = {
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
  presetSource: string;
  policyTags: string[];
  rolloutSource: string;
  rolloutSourceKind: "file" | "matrix";
  rolloutScenario: string | null;
  rolloutScore: number | null;
  rolloutVerdict: string | null;
  rolloutTarget: Exclude<RolloutTarget, "auto">;
  rolloutArtifactAgeHours: number | null;
  rolloutChannelDomain: RolloutChannelDomain | null;
};

export type SidecarPresetRolloutInspectionStatus =
  | "disabled"
  | "artifact_missing"
  | "candidate_missing"
  | "below_min_score"
  | "verdict_blocked"
  | "artifact_too_old"
  | "no_change"
  | "applied";

export type RolloutTarget = "auto" | "overall" | "balanced" | "strict";

export type SidecarPresetRolloutInspection = {
  enabled: boolean;
  status: SidecarPresetRolloutInspectionStatus;
  reason: string;
  requestedTarget: RolloutTarget;
  resolvedTarget: Exclude<RolloutTarget, "auto">;
  rolloutSourcePath: string | null;
  rolloutSourceKind: "file" | "matrix" | null;
  artifactAgeHours: number | null;
  minScore: number;
  maxAgeHours: number | null;
  allowedVerdicts: string[];
  preserveControlnet: boolean;
  mustPreserveControlnet: boolean;
  candidate: RolloutSummaryCandidate | null;
  currentPresets: {
    controlnetPreset: SidecarControlNetPresetId;
    impactPreset: SidecarImpactPresetId;
    qcPreset: SidecarQcPresetId;
  };
  nextPresets: {
    controlnetPreset: SidecarControlNetPresetId;
    impactPreset: SidecarImpactPresetId;
    qcPreset: SidecarQcPresetId;
  } | null;
  resolution: SidecarPresetRolloutResolution | null;
};

export const DEFAULT_SIDECAR_PRESET_ROLLOUT_MIN_SCORE = 85;
export const DEFAULT_SIDECAR_PRESET_ROLLOUT_MAX_AGE_HOURS = 168;
export const DEFAULT_SIDECAR_PRESET_ROLLOUT_ALLOWED_VERDICTS = ["recommended"] as const;
export const DEFAULT_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET = true;
export const DEFAULT_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_POLICIES = {
  economy: {
    minScore: 84,
    allowedVerdicts: ["recommended"] as const
  },
  medical: {
    minScore: 80,
    allowedVerdicts: ["recommended", "acceptable"] as const
  }
} as const;

type RuntimeRolloutGuardrailPolicyLike = {
  min_score: number;
  max_age_hours: number | null;
  allowed_verdicts: string[];
  preserve_controlnet: boolean;
  require_ready: boolean;
};

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

let cachedMatrixPath: string | null = null;
let cachedMatrixMtimeMs: number | null = null;
let cachedMatrix: RuntimeRolloutMatrix | null = null;
let cachedRolloutFilePath: string | null = null;
let cachedRolloutFileMtimeMs: number | null = null;
let cachedRolloutFile: RuntimeRolloutFile | null = null;
let cachedMultiChannelRolloutFilePath: string | null = null;
let cachedMultiChannelRolloutFileMtimeMs: number | null = null;
let cachedMultiChannelRolloutFile: RuntimeMultiChannelRolloutFile | null = null;

function isTruthy(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isControlnetPreset(value: unknown): value is SidecarControlNetPresetId {
  return typeof value === "string" && CONTROLNET_PRESETS.has(value as SidecarControlNetPresetId);
}

function isImpactPreset(value: unknown): value is SidecarImpactPresetId {
  return typeof value === "string" && IMPACT_PRESETS.has(value as SidecarImpactPresetId);
}

function isQcPreset(value: unknown): value is SidecarQcPresetId {
  return typeof value === "string" && QC_PRESETS.has(value as SidecarQcPresetId);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRolloutChannelDomain(value: unknown): RolloutChannelDomain | null {
  return value === "medical" || value === "economy" ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function resolveRolloutTarget(): RolloutTarget {
  const raw = process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_TARGET?.trim().toLowerCase() ?? "auto";
  return raw === "overall" || raw === "balanced" || raw === "strict" ? raw : "auto";
}

function parseFiniteEnvNumber(raw: string | undefined): number | null {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAllowedVerdicts(raw: string | null | undefined, fallback: readonly string[]): string[] {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [...fallback];
  }
  const values = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return values.length > 0 ? values : [...fallback];
}

function parseRolloutPolicy(value: unknown): RuntimeRolloutGuardrailPolicyLike | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const minScore = asFiniteNumber(record.min_score);
  const maxAgeHours =
    record.max_age_hours === null ? null : asFiniteNumber(record.max_age_hours);
  const allowedVerdicts = Array.isArray(record.allowed_verdicts)
    ? record.allowed_verdicts
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0)
    : [];
  const preserveControlnet = asBoolean(record.preserve_controlnet);
  const requireReady = asBoolean(record.require_ready);
  if (minScore === null || allowedVerdicts.length === 0 || preserveControlnet === null || requireReady === null) {
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

function resolveMultiChannelBundleDefaults(channelDomain: RolloutChannelDomain) {
  return DEFAULT_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_POLICIES[channelDomain];
}

function resolveEffectiveRolloutPolicy(input: {
  channelDomain: RolloutChannelDomain | null;
  rolloutFile: RuntimeRolloutFile | null;
}): {
  minScore: number;
  maxAgeHours: number | null;
  allowedVerdicts: string[];
  preserveControlnet: boolean;
} {
  const filePolicy = parseRolloutPolicy(input.rolloutFile?.rollout_policy ?? null);
  const bundlePrefix = input.channelDomain
    ? `VIDEO_SIDECAR_PRESET_MULTICHANNEL_${input.channelDomain.toUpperCase()}_`
    : null;
  const bundleDefaults = input.channelDomain ? resolveMultiChannelBundleDefaults(input.channelDomain) : null;
  const minScore =
    (bundlePrefix ? parseFiniteEnvNumber(process.env[`${bundlePrefix}MIN_SCORE`]) : null) ??
    parseFiniteEnvNumber(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_MIN_SCORE) ??
    filePolicy?.min_score ??
    bundleDefaults?.minScore ??
    DEFAULT_SIDECAR_PRESET_ROLLOUT_MIN_SCORE;
  const maxAgeHoursRaw =
    (bundlePrefix ? parseFiniteEnvNumber(process.env[`${bundlePrefix}MAX_AGE_HOURS`]) : null) ??
    parseFiniteEnvNumber(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_MAX_AGE_HOURS);
  const maxAgeHours =
    maxAgeHoursRaw !== null
      ? maxAgeHoursRaw
      : filePolicy
        ? filePolicy.max_age_hours
        : DEFAULT_SIDECAR_PRESET_ROLLOUT_MAX_AGE_HOURS;
  const fallbackAllowedVerdicts = bundleDefaults?.allowedVerdicts ?? DEFAULT_SIDECAR_PRESET_ROLLOUT_ALLOWED_VERDICTS;
  const allowedVerdicts = parseAllowedVerdicts(
    (bundlePrefix ? process.env[`${bundlePrefix}ALLOWED_VERDICTS`] : undefined) ??
      process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_ALLOWED_VERDICTS ??
      filePolicy?.allowed_verdicts.join(","),
    fallbackAllowedVerdicts
  );
  const preserveControlnet =
    (bundlePrefix && typeof process.env[`${bundlePrefix}PRESERVE_CONTROLNET`] === "string"
      ? isTruthy(process.env[`${bundlePrefix}PRESERVE_CONTROLNET`])
      : null) ??
    (typeof process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET === "string"
      ? isTruthy(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET)
      : null) ??
    filePolicy?.preserve_controlnet ??
    DEFAULT_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET;
  return {
    minScore,
    maxAgeHours: maxAgeHours !== null && maxAgeHours <= 0 ? null : maxAgeHours,
    allowedVerdicts,
    preserveControlnet
  };
}

function resolveRolloutMatrixPath(repoRoot: string): string {
  const raw = process.env.VIDEO_SIDECAR_PRESET_BENCHMARK_MATRIX_PATH?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
  }
  return path.resolve(repoRoot, "out", "preset_benchmarks", "video_i2v", "preset_benchmark_matrix.json");
}

function resolveRolloutFilePath(repoRoot: string): string {
  const raw = process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_FILE_PATH?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
  }
  return path.resolve(repoRoot, "out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.json");
}

function resolveMultiChannelRolloutFilePath(repoRoot: string): string {
  const raw = process.env.VIDEO_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_FILE_PATH?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
  }
  return path.resolve(
    repoRoot,
    "out",
    "multi_channel_benchmarks",
    "video_i2v",
    "runtime_sidecar_multichannel_rollout.json"
  );
}

function loadRolloutMatrix(matrixPath: string): RuntimeRolloutMatrix | null {
  if (!fs.existsSync(matrixPath)) {
    return null;
  }
  const stat = fs.statSync(matrixPath);
  if (cachedMatrixPath === matrixPath && cachedMatrixMtimeMs === stat.mtimeMs) {
    return cachedMatrix;
  }
  const parsed = JSON.parse(fs.readFileSync(matrixPath, "utf8")) as RuntimeRolloutMatrix;
  cachedMatrixPath = matrixPath;
  cachedMatrixMtimeMs = stat.mtimeMs;
  cachedMatrix = parsed;
  return parsed;
}

function loadRolloutFile(filePath: string): RuntimeRolloutFile | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stat = fs.statSync(filePath);
  if (cachedRolloutFilePath === filePath && cachedRolloutFileMtimeMs === stat.mtimeMs) {
    return cachedRolloutFile;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as RuntimeRolloutFile;
  cachedRolloutFilePath = filePath;
  cachedRolloutFileMtimeMs = stat.mtimeMs;
  cachedRolloutFile = parsed;
  return parsed;
}

function loadMultiChannelRolloutFile(filePath: string): RuntimeMultiChannelRolloutFile | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const stat = fs.statSync(filePath);
  if (cachedMultiChannelRolloutFilePath === filePath && cachedMultiChannelRolloutFileMtimeMs === stat.mtimeMs) {
    return cachedMultiChannelRolloutFile;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as RuntimeMultiChannelRolloutFile;
  cachedMultiChannelRolloutFilePath = filePath;
  cachedMultiChannelRolloutFileMtimeMs = stat.mtimeMs;
  cachedMultiChannelRolloutFile = parsed;
  return parsed;
}

function parseSummaryCandidate(value: unknown): RolloutSummaryCandidate | null {
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
  return {
    controlnet_preset: record.controlnet_preset,
    impact_preset: record.impact_preset,
    qc_preset: record.qc_preset,
    scenario: typeof record.scenario === "string" ? record.scenario : null,
    score: typeof record.score === "number" && Number.isFinite(record.score) ? record.score : null,
    verdict: typeof record.verdict === "string" ? record.verdict : null
  };
}

function selectRolloutCandidate(input: {
  matrix: RuntimeRolloutMatrix;
  target: RolloutTarget;
  qcPreset: SidecarQcPresetId;
}): RolloutSummaryCandidate | null {
  const summary = asRecord(input.matrix.recommendation_summary ?? null);
  if (!summary) {
    return null;
  }
  if (input.target === "overall") {
    return parseSummaryCandidate(summary.best_overall);
  }
  if (input.target === "balanced") {
    return parseSummaryCandidate(summary.best_balanced_qc);
  }
  if (input.target === "strict") {
    return parseSummaryCandidate(summary.best_strict_qc);
  }
  return input.qcPreset === "broadcast_identity_strict_v1"
    ? parseSummaryCandidate(summary.best_strict_qc) ?? parseSummaryCandidate(summary.best_overall)
    : parseSummaryCandidate(summary.best_balanced_qc) ?? parseSummaryCandidate(summary.best_overall);
}

function selectRolloutCandidateFromFile(input: {
  rolloutFile: RuntimeRolloutFile;
  target: RolloutTarget;
  qcPreset: SidecarQcPresetId;
}): { candidate: RolloutSummaryCandidate | null; resolvedTarget: Exclude<RolloutTarget, "auto"> } {
  const targets = asRecord(input.rolloutFile.targets ?? null);
  if (!targets) {
    return {
      candidate: null,
      resolvedTarget: "overall"
    };
  }
  const defaultTarget =
    typeof input.rolloutFile.default_target === "string" &&
    ["overall", "balanced", "strict"].includes(input.rolloutFile.default_target)
      ? (input.rolloutFile.default_target as Exclude<RolloutTarget, "auto">)
      : "overall";
  const effectiveTarget =
    input.target === "auto"
      ? input.qcPreset === "broadcast_identity_strict_v1"
        ? (targets.strict ? "strict" : defaultTarget)
        : (targets.balanced ? "balanced" : defaultTarget)
      : input.target;
  const candidate =
    effectiveTarget === "overall"
      ? targets.overall
      : effectiveTarget === "balanced"
        ? targets.balanced
        : targets.strict;
  return {
    candidate: parseSummaryCandidate(candidate),
    resolvedTarget: effectiveTarget
  };
}

function selectRolloutCandidateFromMultiChannelFile(input: {
  rolloutFile: RuntimeMultiChannelRolloutFile;
  channelDomain: RolloutChannelDomain | null;
  target: RolloutTarget;
  qcPreset: SidecarQcPresetId;
}): {
  bundle: RolloutChannelDomain | null;
  rolloutFile: RuntimeRolloutFile | null;
  candidate: RolloutSummaryCandidate | null;
  resolvedTarget: Exclude<RolloutTarget, "auto">;
} {
  const bundles = asRecord(input.rolloutFile.bundles ?? null);
  if (!bundles) {
    return {
      bundle: null,
      rolloutFile: null,
      candidate: null,
      resolvedTarget: "overall"
    };
  }
  const defaultBundle = asRolloutChannelDomain(input.rolloutFile.default_bundle) ?? "economy";
  const requestedBundle =
    (input.channelDomain && asRecord(bundles[input.channelDomain]) ? input.channelDomain : null) ??
    (asRecord(bundles[defaultBundle]) ? defaultBundle : null) ??
    (asRecord(bundles.economy) ? "economy" : null) ??
    (asRecord(bundles.medical) ? "medical" : null);
  if (!requestedBundle) {
    return {
      bundle: null,
      rolloutFile: null,
      candidate: null,
      resolvedTarget: "overall"
    };
  }
  const bundleRollout = asRecord(bundles[requestedBundle]) as RuntimeRolloutFile | null;
  if (!bundleRollout) {
    return {
      bundle: requestedBundle,
      rolloutFile: null,
      candidate: null,
      resolvedTarget: "overall"
    };
  }
  const selection = selectRolloutCandidateFromFile({
    rolloutFile: bundleRollout,
    target: input.target,
    qcPreset: input.qcPreset
  });
  return {
    bundle: requestedBundle,
    rolloutFile: bundleRollout,
    candidate: selection.candidate,
    resolvedTarget: selection.resolvedTarget
  };
}

export function inspectRuntimeSidecarPresetRollout(input: {
  repoRoot: string;
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
  channelDomain?: RolloutChannelDomain | null;
  renderMode: string;
  shotType: string;
  cameraPreset: string;
  policyTags: string[];
}): SidecarPresetRolloutInspection {
  const requestedTarget = resolveRolloutTarget();
  const initialPolicy = resolveEffectiveRolloutPolicy({
    channelDomain: input.channelDomain ?? null,
    rolloutFile: null
  });
  const defaultInspection: Omit<SidecarPresetRolloutInspection, "status" | "reason" | "resolution"> = {
    enabled: isTruthy(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_ENABLED),
    requestedTarget,
    resolvedTarget:
      requestedTarget === "auto"
        ? input.qcPreset === "broadcast_identity_strict_v1"
          ? "strict"
          : "balanced"
        : requestedTarget,
    rolloutSourcePath: null,
      rolloutSourceKind: null,
      artifactAgeHours: null,
      minScore: initialPolicy.minScore,
      maxAgeHours: initialPolicy.maxAgeHours,
      allowedVerdicts: initialPolicy.allowedVerdicts,
      preserveControlnet: initialPolicy.preserveControlnet,
      mustPreserveControlnet: false,
      candidate: null,
      currentPresets: {
      controlnetPreset: input.controlnetPreset,
      impactPreset: input.impactPreset,
      qcPreset: input.qcPreset
    },
    nextPresets: null
  };
  if (!isTruthy(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_ENABLED)) {
    return {
      ...defaultInspection,
      status: "disabled",
      reason: "VIDEO_SIDECAR_PRESET_ROLLOUT_ENABLED is disabled.",
      resolution: null
    };
  }

  const multiChannelRolloutFilePath = resolveMultiChannelRolloutFilePath(input.repoRoot);
  const multiChannelRolloutFile = loadMultiChannelRolloutFile(multiChannelRolloutFilePath);
  const multiChannelSelection = multiChannelRolloutFile
    ? selectRolloutCandidateFromMultiChannelFile({
        rolloutFile: multiChannelRolloutFile,
        channelDomain: input.channelDomain ?? null,
        target: requestedTarget,
        qcPreset: input.qcPreset
      })
    : null;
  const hasMultiChannelCandidate = Boolean(multiChannelSelection?.bundle && multiChannelSelection.candidate);
  const rolloutFilePath = resolveRolloutFilePath(input.repoRoot);
  const rolloutFile = hasMultiChannelCandidate ? null : loadRolloutFile(rolloutFilePath);
  const matrixPath = resolveRolloutMatrixPath(input.repoRoot);
    const matrix = hasMultiChannelCandidate || rolloutFile ? null : loadRolloutMatrix(matrixPath);
    const fileSelection = rolloutFile
      ? selectRolloutCandidateFromFile({
          rolloutFile,
        target: requestedTarget,
        qcPreset: input.qcPreset
      })
    : null;
  const candidate = hasMultiChannelCandidate
    ? multiChannelSelection?.candidate ?? null
    : rolloutFile
    ? fileSelection?.candidate ?? null
    : matrix
      ? selectRolloutCandidate({
          matrix,
          target: requestedTarget,
          qcPreset: input.qcPreset
        })
      : null;
    const resolvedTarget: Exclude<RolloutTarget, "auto"> = hasMultiChannelCandidate
      ? multiChannelSelection?.resolvedTarget ?? "overall"
      : rolloutFile
    ? fileSelection?.resolvedTarget ?? "overall"
      : requestedTarget === "auto"
        ? input.qcPreset === "broadcast_identity_strict_v1"
          ? "strict"
          : "balanced"
        : requestedTarget;
    const resolvedChannelDomain =
      (hasMultiChannelCandidate ? multiChannelSelection?.bundle : null) ?? input.channelDomain ?? null;
    const selectedRolloutFile = hasMultiChannelCandidate
      ? multiChannelSelection?.rolloutFile ?? null
      : rolloutFile;
    const effectivePolicy = resolveEffectiveRolloutPolicy({
      channelDomain: resolvedChannelDomain,
      rolloutFile: selectedRolloutFile ?? null
    });
    const minScore = effectivePolicy.minScore;
    const maxAgeHours = effectivePolicy.maxAgeHours;
    const allowedVerdicts = effectivePolicy.allowedVerdicts;
    const preserveControlnet = effectivePolicy.preserveControlnet;
    const artifactPath = hasMultiChannelCandidate
      ? multiChannelRolloutFilePath
      : rolloutFile
        ? rolloutFilePath
        : matrix
        ? matrixPath
        : null;
  const artifactStat = artifactPath && fs.existsSync(artifactPath) ? fs.statSync(artifactPath) : null;
  const artifactAgeHours =
    artifactStat ? Math.max(0, (Date.now() - artifactStat.mtimeMs) / (1000 * 60 * 60)) : null;
  const mustPreserveControlnet =
    preserveControlnet &&
    (input.renderMode === "generative_s2v" ||
      input.controlnetPreset === "profile_lineart_depth_v1" ||
      input.controlnetPreset === "pose_canny_balance_v1" ||
      /whip|shake/i.test(input.cameraPreset));
  const inspectionBase: Omit<SidecarPresetRolloutInspection, "status" | "reason" | "resolution"> = {
    ...defaultInspection,
      enabled: true,
      resolvedTarget,
      rolloutSourcePath: artifactPath,
      rolloutSourceKind: hasMultiChannelCandidate || rolloutFile ? "file" : matrix ? "matrix" : null,
      artifactAgeHours: artifactAgeHours !== null ? Number(artifactAgeHours.toFixed(2)) : null,
      minScore,
      maxAgeHours,
      allowedVerdicts,
      preserveControlnet,
      mustPreserveControlnet,
      candidate
    };
  if (!artifactPath) {
    return {
      ...inspectionBase,
      status: "artifact_missing",
      reason: "No runtime rollout file or benchmark matrix was found.",
      resolution: null
    };
  }
  if (!candidate) {
    return {
      ...inspectionBase,
      status: "candidate_missing",
      reason: `No rollout candidate was available for target ${resolvedTarget}.`,
      resolution: null
    };
  }
  const candidateScore = asFiniteNumber(candidate.score);
  if (candidateScore === null || candidateScore < minScore) {
    return {
      ...inspectionBase,
      status: "below_min_score",
      reason: `Rollout candidate score ${candidateScore ?? "null"} is below min score ${minScore}.`,
      nextPresets: {
        controlnetPreset: mustPreserveControlnet ? input.controlnetPreset : candidate.controlnet_preset,
        impactPreset: candidate.impact_preset,
        qcPreset: candidate.qc_preset
      },
      resolution: null
    };
  }
  const candidateVerdict = typeof candidate.verdict === "string" ? candidate.verdict.trim().toLowerCase() : null;
  if (!candidateVerdict || !allowedVerdicts.includes(candidateVerdict)) {
    return {
      ...inspectionBase,
      status: "verdict_blocked",
      reason: `Rollout candidate verdict ${candidateVerdict ?? "null"} is not allowed.`,
      nextPresets: {
        controlnetPreset: mustPreserveControlnet ? input.controlnetPreset : candidate.controlnet_preset,
        impactPreset: candidate.impact_preset,
        qcPreset: candidate.qc_preset
      },
      resolution: null
    };
  }
  if (maxAgeHours !== null && artifactAgeHours !== null && artifactAgeHours > maxAgeHours) {
    return {
      ...inspectionBase,
      status: "artifact_too_old",
      reason: `Rollout artifact age ${artifactAgeHours.toFixed(2)}h exceeds max age ${maxAgeHours}h.`,
      nextPresets: {
        controlnetPreset: mustPreserveControlnet ? input.controlnetPreset : candidate.controlnet_preset,
        impactPreset: candidate.impact_preset,
        qcPreset: candidate.qc_preset
      },
      resolution: null
    };
  }

  const nextControlnetPreset = mustPreserveControlnet ? input.controlnetPreset : candidate.controlnet_preset;
  const nextImpactPreset = candidate.impact_preset;
  const nextQcPreset = candidate.qc_preset;

  if (
    nextControlnetPreset === input.controlnetPreset &&
    nextImpactPreset === input.impactPreset &&
    nextQcPreset === input.qcPreset
  ) {
    return {
      ...inspectionBase,
      status: "no_change",
      reason: "Rollout candidate does not change the effective preset triplet.",
      nextPresets: {
        controlnetPreset: nextControlnetPreset,
        impactPreset: nextImpactPreset,
        qcPreset: nextQcPreset
      },
      resolution: null
    };
  }

  const resolution: SidecarPresetRolloutResolution = {
    controlnetPreset: nextControlnetPreset,
    impactPreset: nextImpactPreset,
    qcPreset: nextQcPreset,
    presetSource: "benchmark_rollout_v1",
    policyTags: [
      ...input.policyTags,
      "runtime_rollout",
      `rollout_target:${resolvedTarget}`,
      `rollout_verdict:${candidateVerdict}`,
      ...(resolvedChannelDomain ? [`rollout_channel_domain:${resolvedChannelDomain}`] : []),
      ...(candidate.scenario ? [`rollout_scenario:${candidate.scenario}`] : []),
      ...(mustPreserveControlnet ? ["rollout_preserve_controlnet"] : [])
    ],
    rolloutSource: artifactPath,
    rolloutSourceKind: hasMultiChannelCandidate || rolloutFile ? "file" : "matrix",
    rolloutScenario: candidate.scenario,
    rolloutScore: candidateScore,
    rolloutVerdict: candidateVerdict,
    rolloutTarget: resolvedTarget,
    rolloutArtifactAgeHours: artifactAgeHours !== null ? Number(artifactAgeHours.toFixed(2)) : null,
    rolloutChannelDomain: resolvedChannelDomain
  };
  return {
    ...inspectionBase,
    status: "applied",
    reason: "Rollout candidate passed guardrails and changes the effective preset triplet.",
    nextPresets: {
      controlnetPreset: nextControlnetPreset,
      impactPreset: nextImpactPreset,
      qcPreset: nextQcPreset
    },
    resolution
  };
}

export function resolveRuntimeSidecarPresetRollout(input: {
  repoRoot: string;
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
  channelDomain?: RolloutChannelDomain | null;
  renderMode: string;
  shotType: string;
  cameraPreset: string;
  policyTags: string[];
}): SidecarPresetRolloutResolution | null {
  return inspectRuntimeSidecarPresetRollout(input).resolution;
}
