import fs from "node:fs";

import type { SidecarControlNetPresetId, SidecarImpactPresetId, SidecarQcPresetId } from "@ec/profiles";

export const SIDECAR_SIGNAL_KEYS = [
  "motion",
  "subtitle",
  "chart",
  "identity",
  "head_pose",
  "eye_drift",
  "mouth_readability",
  "landmark_consistency"
] as const;

export type SidecarSignalKey = (typeof SIDECAR_SIGNAL_KEYS)[number];
export type SidecarChannelDomain = "economy" | "medical" | "default";
export type SidecarJudgeSeverity = "INFO" | "WARN" | "ERROR";
export type SidecarJudgeStatus = "pass" | "warn" | "fail";

type SidecarAnchorView = "front" | "threeQuarter" | "profile";
type SidecarAnchorStatus = "present" | "occluded" | "missing" | "not_applicable";
type SidecarFallbackFlavor = "judge" | "provider";

export type SidecarJudgeArtifactRef = {
  kind: "video" | "image" | "json" | "text";
  path: string;
  label?: string;
};

export type SidecarJudgeSignalHint = {
  score?: number | null;
  confidence?: number | null;
  reasons?: string[];
  evidence?: Record<string, unknown>;
};

export type SidecarJudgeCandidateInput = {
  shotId: string;
  candidateId: string;
  expectedDurationSeconds: number;
  outputDurationSeconds?: number | null;
  outputVideoPath?: string | null;
  referenceImagePath?: string | null;
  narration?: string | null;
  subtitleText?: string | null;
  subtitlesExpected?: boolean;
  chartExpected?: boolean;
  signalHints?: Partial<Record<SidecarSignalKey, SidecarJudgeSignalHint>>;
  artifacts?: SidecarJudgeArtifactRef[];
  metadata?: Record<string, unknown>;
};

export type SidecarJudgeProviderDescriptor = {
  kind: "local_vlm";
  mode: string;
  model: string | null;
  prompt_version: string;
};

export type SidecarStandardizedSignalScore = {
  schema_version: "1.0";
  signal: SidecarSignalKey;
  score: number;
  normalized_score: number;
  threshold: number;
  weight: number;
  confidence: number;
  status: SidecarJudgeStatus;
  reasons: string[];
  evidence: Record<string, unknown>;
};

export type SidecarScorecard = {
  schema_version: "1.0";
  overall_score: number;
  normalized_overall_score: number;
  confidence: number;
  accepted: boolean;
  failing_signals: SidecarSignalKey[];
  warning_signals: SidecarSignalKey[];
  signals: Record<SidecarSignalKey, SidecarStandardizedSignalScore>;
};

export type SidecarJudgeCheck = {
  name: string;
  passed: boolean;
  severity: "WARN" | "ERROR";
  details: string;
};

export type SidecarJudgeIssue = {
  code: string;
  severity: SidecarJudgeSeverity;
  message: string;
  shotId?: string;
  details?: Record<string, unknown>;
};

export type AdaptiveBestOfPolicyConfig = {
  policy_version: "adaptive_best_of_2_3_v1";
  channel_domain: SidecarChannelDomain;
  initial_candidate_count: 2;
  max_candidate_count: 3;
  overall_pass_threshold: number;
  signal_thresholds: Record<SidecarSignalKey, number>;
  signal_weights: Record<SidecarSignalKey, number>;
  warning_buffer: number;
  escalation_margin_threshold: number;
  escalation_overall_threshold: number;
  escalation_confidence_threshold: number;
  escalation_signal_buffer: number;
};

export type AdaptiveBestOfPolicyOverrides = Partial<
  Omit<
    AdaptiveBestOfPolicyConfig,
    | "policy_version"
    | "channel_domain"
    | "initial_candidate_count"
    | "max_candidate_count"
    | "signal_thresholds"
    | "signal_weights"
  >
> & {
  signal_thresholds?: Partial<Record<SidecarSignalKey, number>>;
  signal_weights?: Partial<Record<SidecarSignalKey, number>>;
};

export type SidecarJudgeRunCandidate = {
  candidate_id: string;
  provider_summary: string;
  provider_confidence: number;
  accepted: boolean;
  scorecard: SidecarScorecard;
  raw_response?: Record<string, unknown>;
};

export type SidecarJudgeRun = {
  stage: string;
  checks: SidecarJudgeCheck[];
  issues: SidecarJudgeIssue[];
  passed: boolean;
  errorCount: number;
  warnCount: number;
  evaluated_candidate_ids: string[];
  ranked_candidate_ids: string[];
  selected_candidate_id: string | null;
  scorecards: SidecarJudgeRunCandidate[];
  policy_snapshot: AdaptiveBestOfPolicyConfig;
};

export type AdaptiveBestOfPolicyAudit = AdaptiveBestOfPolicyConfig & {
  attempted_candidate_ids: string[];
  initial_candidate_ids: string[];
  escalated_to_best_of_3: boolean;
  escalation_reason: string | null;
  selected_candidate_id: string | null;
};

export type SidecarJudgeArtifact = {
  schema_version: "1.0";
  artifact_kind: "sidecar_visual_judge";
  generated_at: string;
  final_passed: boolean;
  final_stage: string;
  fallback_steps_applied: string[];
  selected_candidate_id: string | null;
  attempt_count: number;
  provider: SidecarJudgeProviderDescriptor;
  policy: AdaptiveBestOfPolicyAudit;
  runs: SidecarJudgeRun[];
};

type RawSignalScoreInput = {
  score?: number | null;
  confidence?: number | null;
  reasons?: string[];
  evidence?: Record<string, unknown>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function signalWeightsForDomain(domain: SidecarChannelDomain): Record<SidecarSignalKey, number> {
  if (domain === "medical") {
    return {
      motion: 0.14,
      subtitle: 0.22,
      chart: 0.11,
      identity: 0.31,
      head_pose: 0.06,
      eye_drift: 0.05,
      mouth_readability: 0.07,
      landmark_consistency: 0.04
    };
  }
  if (domain === "economy") {
    return {
      motion: 0.19,
      subtitle: 0.17,
      chart: 0.23,
      identity: 0.19,
      head_pose: 0.06,
      eye_drift: 0.05,
      mouth_readability: 0.04,
      landmark_consistency: 0.07
    };
  }
  return {
    motion: 0.19,
    subtitle: 0.19,
    chart: 0.17,
    identity: 0.23,
    head_pose: 0.07,
    eye_drift: 0.05,
    mouth_readability: 0.05,
    landmark_consistency: 0.05
  };
}

function signalThresholdsForDomain(domain: SidecarChannelDomain): Record<SidecarSignalKey, number> {
  if (domain === "medical") {
    return {
      motion: 58,
      subtitle: 68,
      chart: 60,
      identity: 72,
      head_pose: 64,
      eye_drift: 62,
      mouth_readability: 64,
      landmark_consistency: 60
    };
  }
  if (domain === "economy") {
    return {
      motion: 60,
      subtitle: 64,
      chart: 68,
      identity: 64,
      head_pose: 60,
      eye_drift: 58,
      mouth_readability: 58,
      landmark_consistency: 58
    };
  }
  return {
    motion: 60,
    subtitle: 64,
    chart: 64,
    identity: 68,
    head_pose: 60,
    eye_drift: 58,
    mouth_readability: 58,
    landmark_consistency: 58
  };
}

export function resolveAdaptiveBestOfPolicy(
  domain: SidecarChannelDomain,
  overrides: AdaptiveBestOfPolicyOverrides = {}
): AdaptiveBestOfPolicyConfig {
  const baseThresholds = signalThresholdsForDomain(domain);
  const baseWeights = signalWeightsForDomain(domain);
  return {
    policy_version: "adaptive_best_of_2_3_v1",
    channel_domain: domain,
    initial_candidate_count: 2,
    max_candidate_count: 3,
    overall_pass_threshold: overrides.overall_pass_threshold ?? (domain === "medical" ? 74 : 72),
    signal_thresholds: {
      ...baseThresholds,
      ...(overrides.signal_thresholds ?? {})
    },
    signal_weights: {
      ...baseWeights,
      ...(overrides.signal_weights ?? {})
    },
    warning_buffer: overrides.warning_buffer ?? 4,
    escalation_margin_threshold: overrides.escalation_margin_threshold ?? 6,
    escalation_overall_threshold: overrides.escalation_overall_threshold ?? (domain === "medical" ? 80 : 76),
    escalation_confidence_threshold: overrides.escalation_confidence_threshold ?? 0.75,
    escalation_signal_buffer: overrides.escalation_signal_buffer ?? 3
  };
}

export function buildSidecarSignalScore(input: {
  signal: SidecarSignalKey;
  threshold: number;
  weight: number;
  warning_buffer: number;
  raw: RawSignalScoreInput;
}): SidecarStandardizedSignalScore {
  const score = round(clamp(input.raw.score ?? 0, 0, 100));
  const confidence = round(clamp(input.raw.confidence ?? 0.5, 0, 1), 3);
  const threshold = round(clamp(input.threshold, 0, 100));
  const status: SidecarJudgeStatus =
    score < threshold ? "fail" : score < threshold + input.warning_buffer ? "warn" : "pass";

  return {
    schema_version: "1.0",
    signal: input.signal,
    score,
    normalized_score: round(score / 100, 4),
    threshold,
    weight: round(clamp(input.weight, 0, 1), 4),
    confidence,
    status,
    reasons: uniqueStrings(input.raw.reasons ?? []),
    evidence: { ...(input.raw.evidence ?? {}) }
  };
}

export function buildSidecarScorecard(input: {
  policy: AdaptiveBestOfPolicyConfig;
  signals: Record<SidecarSignalKey, RawSignalScoreInput>;
}): SidecarScorecard {
  const standardizedSignals = Object.fromEntries(
    SIDECAR_SIGNAL_KEYS.map((signal) => [
      signal,
      buildSidecarSignalScore({
        signal,
        threshold: input.policy.signal_thresholds[signal],
        weight: input.policy.signal_weights[signal],
        warning_buffer: input.policy.warning_buffer,
        raw: input.signals[signal]
      })
    ])
  ) as Record<SidecarSignalKey, SidecarStandardizedSignalScore>;

  let weightedScore = 0;
  let confidenceTotal = 0;
  const failingSignals: SidecarSignalKey[] = [];
  const warningSignals: SidecarSignalKey[] = [];

  for (const signal of SIDECAR_SIGNAL_KEYS) {
    const current = standardizedSignals[signal];
    weightedScore += current.score * current.weight;
    confidenceTotal += current.confidence;
    if (current.status === "fail") {
      failingSignals.push(signal);
    } else if (current.status === "warn") {
      warningSignals.push(signal);
    }
  }

  const overallScore = round(weightedScore);
  const confidence = round(confidenceTotal / SIDECAR_SIGNAL_KEYS.length, 3);

  return {
    schema_version: "1.0",
    overall_score: overallScore,
    normalized_overall_score: round(overallScore / 100, 4),
    confidence,
    accepted: failingSignals.length === 0 && overallScore >= input.policy.overall_pass_threshold,
    failing_signals: failingSignals,
    warning_signals: warningSignals,
    signals: standardizedSignals
  };
}

export function compareSidecarScorecards(left: SidecarScorecard, right: SidecarScorecard): number {
  if (left.accepted !== right.accepted) {
    return left.accepted ? -1 : 1;
  }
  if (left.overall_score !== right.overall_score) {
    return right.overall_score - left.overall_score;
  }
  if (left.failing_signals.length !== right.failing_signals.length) {
    return left.failing_signals.length - right.failing_signals.length;
  }
  const leftWeakest = Math.min(...SIDECAR_SIGNAL_KEYS.map((signal) => left.signals[signal].score));
  const rightWeakest = Math.min(...SIDECAR_SIGNAL_KEYS.map((signal) => right.signals[signal].score));
  if (leftWeakest !== rightWeakest) {
    return rightWeakest - leftWeakest;
  }
  if (left.confidence !== right.confidence) {
    return right.confidence - left.confidence;
  }
  return 0;
}

export function countJudgeIssues(issues: SidecarJudgeIssue[]): { errorCount: number; warnCount: number } {
  let errorCount = 0;
  let warnCount = 0;
  for (const issue of issues) {
    if (issue.severity === "ERROR") {
      errorCount += 1;
      continue;
    }
    if (issue.severity === "WARN") {
      warnCount += 1;
    }
  }
  return { errorCount, warnCount };
}

export function createJudgeIssue(
  code: string,
  severity: SidecarJudgeSeverity,
  message: string,
  shotId?: string,
  details?: Record<string, unknown>
): SidecarJudgeIssue {
  return {
    code,
    severity,
    message,
    shotId,
    details
  };
}

export function createJudgeCheck(
  name: string,
  passed: boolean,
  severity: "WARN" | "ERROR",
  details: string
): SidecarJudgeCheck {
  return {
    name,
    passed,
    severity,
    details
  };
}

export type SidecarBackendCapability =
  | "wan"
  | "hunyuan15_local_i2v"
  | "hunyuan15_local_i2v_sr"
  | "still_placeholder";

export type SidecarBackendCapabilityFuture =
  | "hunyuan15_local_t2v_future"
  | "hunyuan15_local_step_distill_future"
  | "hunyuan15_future_remote";

export type SidecarBrollRequestPack = {
  schema_version: "1.0";
  request_kind: string;
  backend: SidecarBackendCapability;
  render_quality: string;
  camera_profile: string;
  motion_profile: string;
  control_mode: string;
  controlnet_preset: SidecarControlNetPresetId;
  impact_preset: SidecarImpactPresetId;
  qc_preset: SidecarQcPresetId;
  preset_manifest_version: string;
  preset_source: string;
  preset_rollout_source: string | null;
  preset_rollout_source_kind: "file" | "matrix" | null;
  preset_rollout_scenario: string | null;
  preset_rollout_score: number | null;
  preset_rollout_verdict: string | null;
  preset_rollout_target: "overall" | "balanced" | "strict" | null;
  preset_rollout_artifact_age_hours: number | null;
  preset_rollout_channel_domain: "economy" | "medical" | null;
  episode_id: string;
  shot_id: string;
  shot_type: string;
  render_mode: string;
  renderer: string;
  model: string;
  duration_seconds: number;
  fps: number;
  width: number;
  height: number;
  prompt: string;
  negative_prompt: string;
  requested_reference_view: string | null;
  first_frame: string | null;
  last_frame: string | null;
  premium_flag: boolean;
  seed_override: number | null;
  resolution_profile: string;
  step_profile: string;
  cache_profile: string;
  sr_profile: string;
  optional_audio_input_future: unknown | null;
  reference_bundle: Record<string, unknown> | null;
  metadata: Record<string, unknown> & {
    preset_policy_tags?: string[];
  };
  [key: string]: unknown;
};

export type SidecarBackendBenchmarkScenario = {
  name: SidecarBackendCapability;
  renderer: string;
  optional: boolean;
};

export type SidecarRuntimeJudgePolicy = {
  policy_version: "sidecar_runtime_judge_v1";
  channel_domain: "economy" | "medical" | "default";
  min_output_score: number;
  min_visual_signal_score: number;
  min_duration_ratio: number;
  min_duration_seconds: number;
  min_face_stability_score: number | null;
  min_identity_score: number | null;
  min_subtitle_safe_score: number | null;
  min_chart_safe_score: number | null;
  allow_metadata_only_mode: boolean;
};

export type SidecarRuntimeJudgeEvaluation = {
  accepted: boolean;
  reasons: string[];
  duration_ratio: number | null;
  policy: SidecarRuntimeJudgePolicy;
};

export function parseSidecarTruthy(value: string | undefined, fallback = false): boolean {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parsePositiveInt(value: string | undefined): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolvePositiveIntOverride(env: NodeJS.ProcessEnv, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = parsePositiveInt(env[key]);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

export function resolveSidecarBackendCapability(rendererName: string): SidecarBackendCapability {
  const normalized = rendererName.trim().toLowerCase();
  if (normalized === "hunyuan15_local_i2v_sr") {
    return "hunyuan15_local_i2v_sr";
  }
  if (normalized === "hunyuan15_local_i2v" || normalized === "hunyuan15" || normalized === "hunyuan") {
    return "hunyuan15_local_i2v";
  }
  if (
    normalized === "generated-pack-still-video" ||
    normalized === "generated-pack-placeholder" ||
    normalized === "still_placeholder" ||
    normalized === "still-placeholder"
  ) {
    return "still_placeholder";
  }
  return "wan";
}

export function resolveSidecarFallbackChain(
  backendCapability: SidecarBackendCapability
): SidecarBackendCapability[] {
  if (backendCapability === "hunyuan15_local_i2v_sr") {
    return ["hunyuan15_local_i2v_sr", "hunyuan15_local_i2v", "wan", "still_placeholder"];
  }
  if (backendCapability === "hunyuan15_local_i2v") {
    return ["hunyuan15_local_i2v", "wan", "still_placeholder"];
  }
  if (backendCapability === "wan") {
    return ["wan", "still_placeholder"];
  }
  return ["still_placeholder"];
}

export function resolveSidecarRendererForBackend(backendCapability: SidecarBackendCapability): string {
  if (backendCapability === "wan") {
    return "comfyui-wan-i2v";
  }
  if (backendCapability === "still_placeholder") {
    return "generated-pack-still-video";
  }
  return backendCapability;
}

export function shouldIncludeOptionalSrBackend(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseSidecarTruthy(env.BENCHMARK_INCLUDE_OPTIONAL_SR, parseSidecarTruthy(env.VIDEO_HUNYUAN_ENABLE_SR));
}

export function resolveSidecarBackendBenchmarkScenarios(input?: {
  includeOptionalSr?: boolean;
}): SidecarBackendBenchmarkScenario[] {
  const includeOptionalSr = input?.includeOptionalSr ?? shouldIncludeOptionalSrBackend();
  return [
    { name: "wan", renderer: "comfyui-wan-i2v", optional: false },
    { name: "hunyuan15_local_i2v", renderer: "hunyuan15_local_i2v", optional: false },
    ...(includeOptionalSr
      ? ([{ name: "hunyuan15_local_i2v_sr", renderer: "hunyuan15_local_i2v_sr", optional: true }] satisfies
          SidecarBackendBenchmarkScenario[])
      : []),
    { name: "still_placeholder", renderer: "generated-pack-still-video", optional: false }
  ];
}

export function resolveSidecarBackendSmokeTimeoutMs(
  backendCapability: SidecarBackendCapability,
  env: NodeJS.ProcessEnv = process.env
): number {
  const benchmarkFastMode = parseSidecarTruthy(
    env.VIDEO_SIDECAR_BENCHMARK_FAST_MODE ?? env.BENCHMARK_PRESET_FAST_MODE,
    false
  );
  if (backendCapability === "hunyuan15_local_i2v_sr") {
    return (
      resolvePositiveIntOverride(env, [
        "VIDEO_SIDECAR_BACKEND_HUNYUAN_SR_SMOKE_TIMEOUT_MS",
        "VIDEO_HUNYUAN_SR_COMFY_TIMEOUT_MS",
        "VIDEO_HUNYUAN_COMFY_TIMEOUT_MS",
        "VIDEO_BROLL_COMFY_TIMEOUT_MS",
        "VIDEO_SIDECAR_BACKEND_SMOKE_TIMEOUT_MS",
        "SMOKE_VIDEO_BROLL_TIMEOUT_MS"
      ]) ?? (benchmarkFastMode ? 3_000_000 : 6_000_000)
    );
  }
  if (backendCapability === "hunyuan15_local_i2v") {
    return (
      resolvePositiveIntOverride(env, [
        "VIDEO_SIDECAR_BACKEND_HUNYUAN_SMOKE_TIMEOUT_MS",
        "VIDEO_HUNYUAN_COMFY_TIMEOUT_MS",
        "VIDEO_BROLL_COMFY_TIMEOUT_MS",
        "VIDEO_SIDECAR_BACKEND_SMOKE_TIMEOUT_MS",
        "SMOKE_VIDEO_BROLL_TIMEOUT_MS"
      ]) ?? (benchmarkFastMode ? 2_400_000 : 3_600_000)
    );
  }
  if (backendCapability === "wan") {
    return (
      resolvePositiveIntOverride(env, [
        "VIDEO_SIDECAR_BACKEND_WAN_SMOKE_TIMEOUT_MS",
        "VIDEO_BROLL_COMFY_TIMEOUT_MS",
        "VIDEO_SIDECAR_BACKEND_SMOKE_TIMEOUT_MS",
        "SMOKE_VIDEO_BROLL_TIMEOUT_MS"
      ]) ?? (benchmarkFastMode ? 900_000 : 1_800_000)
    );
  }
  return (
    resolvePositiveIntOverride(env, [
      "VIDEO_SIDECAR_BACKEND_STILL_SMOKE_TIMEOUT_MS",
      "VIDEO_SIDECAR_BACKEND_SMOKE_TIMEOUT_MS",
      "SMOKE_VIDEO_BROLL_TIMEOUT_MS"
    ]) ?? 600_000
  );
}

export function deriveEffectiveRetakeCount(retakes: unknown[]): number {
  return Math.max(0, retakes.length - 1);
}

export function resolveSidecarRuntimeJudgePolicy(
  channelDomain: "economy" | "medical" | null
): SidecarRuntimeJudgePolicy {
  if (channelDomain === "medical") {
    return {
      policy_version: "sidecar_runtime_judge_v1",
      channel_domain: "medical",
      min_output_score: 74,
      min_visual_signal_score: 64,
      min_duration_ratio: 0.88,
      min_duration_seconds: 1.0,
      min_face_stability_score: 68,
      min_identity_score: 70,
      min_subtitle_safe_score: 68,
      min_chart_safe_score: null,
      allow_metadata_only_mode: false
    };
  }
  if (channelDomain === "economy") {
    return {
      policy_version: "sidecar_runtime_judge_v1",
      channel_domain: "economy",
      min_output_score: 72,
      min_visual_signal_score: 60,
      min_duration_ratio: 0.86,
      min_duration_seconds: 0.9,
      min_face_stability_score: null,
      min_identity_score: null,
      min_subtitle_safe_score: 64,
      min_chart_safe_score: 68,
      allow_metadata_only_mode: false
    };
  }
  return {
    policy_version: "sidecar_runtime_judge_v1",
    channel_domain: "default",
    min_output_score: 72,
    min_visual_signal_score: 60,
    min_duration_ratio: 0.85,
    min_duration_seconds: 0.9,
    min_face_stability_score: null,
    min_identity_score: null,
    min_subtitle_safe_score: 64,
    min_chart_safe_score: null,
    allow_metadata_only_mode: false
  };
}

export function evaluateSidecarRuntimeJudge(input: {
  channelDomain: "economy" | "medical" | null;
  outputScore: number;
  expectedDurationSeconds: number;
  outputDurationSeconds: number | null;
  qcPassed: boolean;
  visualSignalMode: string | null;
  visualSignalScore: number | null;
  faceStabilityScore: number | null;
  mascotIdentityPreservationScore: number | null;
  subtitleSafeScore: number | null;
  chartSafeScore: number | null;
}): SidecarRuntimeJudgeEvaluation {
  const policy = resolveSidecarRuntimeJudgePolicy(input.channelDomain);
  const reasons: string[] = [];
  const durationRatio =
    typeof input.outputDurationSeconds === "number" &&
    Number.isFinite(input.outputDurationSeconds) &&
    input.expectedDurationSeconds > 0
      ? Number((input.outputDurationSeconds / input.expectedDurationSeconds).toFixed(3))
      : null;
  const minimumDuration = Math.max(policy.min_duration_seconds, input.expectedDurationSeconds * policy.min_duration_ratio);

  if (!input.qcPassed) {
    reasons.push("qc_failed");
  }
  if (input.visualSignalMode === "metadata-only" && !policy.allow_metadata_only_mode) {
    reasons.push("metadata_only_visual_signal");
  }
  if (input.outputScore < policy.min_output_score) {
    reasons.push(`output_score_below_min:${input.outputScore.toFixed(2)}<${policy.min_output_score.toFixed(2)}`);
  }
  if (typeof input.visualSignalScore !== "number" || !Number.isFinite(input.visualSignalScore)) {
    reasons.push("visual_signal_missing");
  } else if (input.visualSignalScore < policy.min_visual_signal_score) {
    reasons.push(
      `visual_signal_below_min:${input.visualSignalScore.toFixed(2)}<${policy.min_visual_signal_score.toFixed(2)}`
    );
  }
  if (typeof input.outputDurationSeconds !== "number" || !Number.isFinite(input.outputDurationSeconds)) {
    reasons.push("output_duration_missing");
  } else if (input.outputDurationSeconds + 0.05 < minimumDuration) {
    reasons.push(`duration_ratio_below_min:${input.outputDurationSeconds.toFixed(2)}<${minimumDuration.toFixed(2)}`);
  }
  if (
    policy.min_face_stability_score !== null &&
    (typeof input.faceStabilityScore !== "number" || input.faceStabilityScore < policy.min_face_stability_score)
  ) {
    reasons.push(
      `face_stability_below_min:${input.faceStabilityScore?.toFixed?.(2) ?? "missing"}<${policy.min_face_stability_score.toFixed(2)}`
    );
  }
  if (
    policy.min_identity_score !== null &&
    (typeof input.mascotIdentityPreservationScore !== "number" ||
      input.mascotIdentityPreservationScore < policy.min_identity_score)
  ) {
    reasons.push(
      `identity_below_min:${input.mascotIdentityPreservationScore?.toFixed?.(2) ?? "missing"}<${policy.min_identity_score.toFixed(2)}`
    );
  }
  if (
    policy.min_subtitle_safe_score !== null &&
    (typeof input.subtitleSafeScore !== "number" || input.subtitleSafeScore < policy.min_subtitle_safe_score)
  ) {
    reasons.push(
      `subtitle_safe_below_min:${input.subtitleSafeScore?.toFixed?.(2) ?? "missing"}<${policy.min_subtitle_safe_score.toFixed(2)}`
    );
  }
  if (
    policy.min_chart_safe_score !== null &&
    (typeof input.chartSafeScore !== "number" || input.chartSafeScore < policy.min_chart_safe_score)
  ) {
    reasons.push(
      `chart_safe_below_min:${input.chartSafeScore?.toFixed?.(2) ?? "missing"}<${policy.min_chart_safe_score.toFixed(2)}`
    );
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    duration_ratio: durationRatio,
    policy
  };
}

export function buildSidecarRetakePromptRefinements(input: {
  rejectionReasons: string[];
  channelDomain: "economy" | "medical" | null;
}): {
  promptAdditions: string[];
  negativePromptAdditions: string[];
  reasoningTags: string[];
} {
  const promptAdditions: string[] = [];
  const negativePromptAdditions: string[] = [];
  const reasoningTags: string[] = [];

  for (const reason of input.rejectionReasons) {
    if (reason.startsWith("face_stability_below_min") || reason.startsWith("identity_below_min")) {
      promptAdditions.push("exact mascot face landmarks", "stable facial geometry", "identity-safe cleanup");
      negativePromptAdditions.push("identity drift", "face wobble", "eye asymmetry");
      reasoningTags.push("retake_identity_lock");
    }
    if (reason.startsWith("subtitle_safe_below_min")) {
      promptAdditions.push("keep lower third clear", "preserve subtitle-safe negative space");
      negativePromptAdditions.push("subtitle overlap", "lower-third obstruction");
      reasoningTags.push("retake_subtitle_safe");
    }
    if (reason.startsWith("chart_safe_below_min")) {
      promptAdditions.push("keep chart lane unobstructed", "safe separation from chart area");
      negativePromptAdditions.push("chart overlap", "presentation obstruction");
      reasoningTags.push("retake_chart_safe");
    }
    if (reason.startsWith("visual_signal_below_min") || reason === "metadata_only_visual_signal") {
      promptAdditions.push("clear broadcast-safe framing", "readable subject silhouette");
      negativePromptAdditions.push("muddy composition", "ambiguous framing");
      reasoningTags.push("retake_visual_signal");
    }
    if (reason.startsWith("duration_ratio_below_min") || reason === "output_duration_missing") {
      promptAdditions.push("complete motion phrase matching requested shot duration");
      negativePromptAdditions.push("abrupt ending", "truncated motion");
      reasoningTags.push("retake_duration_fit");
    }
  }

  if (input.channelDomain === "medical") {
    promptAdditions.push("medical explainer clarity", "high-trust presenter framing");
    reasoningTags.push("retake_medical_domain");
  } else if (input.channelDomain === "economy") {
    promptAdditions.push("chart-friendly editorial framing");
    reasoningTags.push("retake_economy_domain");
  }

  return {
    promptAdditions: uniqueStrings(promptAdditions),
    negativePromptAdditions: uniqueStrings(negativePromptAdditions),
    reasoningTags: uniqueStrings(reasoningTags)
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

const SIDECAR_ANCHOR_VIEWS = ["front", "threeQuarter", "profile"] as const;
const SIDECAR_ANCHOR_IDS = [
  "head_center",
  "mouth_center",
  "eye_near",
  "eye_far",
  "ear_near",
  "ear_far",
  "paw_anchor",
  "tail_root"
] as const;
const SIDECAR_ANCHOR_LOW_CONFIDENCE = 0.55;
const SIDECAR_ANCHOR_VIEW_CONFIDENCE = 0.58;
const SIDECAR_ANCHOR_OVERALL_CONFIDENCE = 0.6;
const SIDECAR_LANDMARK_VERTICAL_DELTA = 0.18;
const SIDECAR_LANDMARK_HORIZONTAL_DELTA = 0.22;
const SIDECAR_LANDMARK_PROFILE_HORIZONTAL_DELTA = 0.28;

const SIDECAR_METADATA_SCOPE_KEYS = [
  "auto_proposal",
  "autoProposal",
  "proposal",
  "pack",
  "character_pack",
  "characterPack",
  "character_pack_meta",
  "characterPackMeta",
  "packMeta",
  "character_pack_proposal",
  "characterPackProposal",
  "packProposal"
] as const;

const SIDECAR_METADATA_FILE_PATH_KEYS = [
  "proposal_path",
  "proposalPath",
  "pack_path",
  "packPath",
  "meta_path",
  "metaPath",
  "character_pack_meta_path",
  "characterPackMetaPath",
  "character_pack_proposal_path",
  "characterPackProposalPath",
  "character_pack_path",
  "characterPackPath"
] as const;

const SIDECAR_SIGNAL_METADATA_SCORE_KEYS: Record<SidecarSignalKey, string[]> = {
  motion: [
    "motion_score",
    "motionScore",
    "motion_coherence_score",
    "motionCoherenceScore",
    "premium_actual_motion_coherence_score",
    "premiumActualMotionCoherenceScore"
  ],
  subtitle: [
    "subtitle_score",
    "subtitleScore",
    "subtitle_safe_score",
    "subtitleSafeScore",
    "premium_actual_subtitle_safe_score",
    "premiumActualSubtitleSafeScore"
  ],
  chart: [
    "chart_score",
    "chartScore",
    "chart_safe_score",
    "chartSafeScore",
    "premium_actual_chart_safe_score",
    "premiumActualChartSafeScore"
  ],
  identity: [
    "identity_score",
    "identityScore",
    "mascot_identity_preservation_score",
    "mascotIdentityPreservationScore",
    "premium_actual_mascot_identity_preservation_score",
    "premiumActualMascotIdentityPreservationScore"
  ],
  head_pose: [
    "head_pose_score",
    "headPoseScore",
    "pose_score",
    "poseScore",
    "head_pose_stability_score",
    "headPoseStabilityScore"
  ],
  eye_drift: [
    "eye_drift_score",
    "eyeDriftScore",
    "eye_anchor_stability_score",
    "eyeAnchorStabilityScore",
    "eye_consistency_score",
    "eyeConsistencyScore"
  ],
  mouth_readability: [
    "mouth_readability_score",
    "mouthReadabilityScore",
    "mouth_anchor_stability_score",
    "mouthAnchorStabilityScore",
    "viseme_readability_score",
    "visemeReadabilityScore"
  ],
  landmark_consistency: [
    "landmark_consistency_score",
    "landmarkConsistencyScore",
    "rig_consistency_score",
    "rigConsistencyScore",
    "pack_landmark_consistency_score",
    "packLandmarkConsistencyScore"
  ]
};

type SidecarAnchorId = (typeof SIDECAR_ANCHOR_IDS)[number];
type SidecarRigMetadataScope = {
  label: string;
  record: Record<string, unknown>;
};

type SidecarExplicitSignalScore = {
  score: number;
  scope: string;
  key: string;
};

type SidecarAnchorEntry = {
  x: number | null;
  y: number | null;
  confidence: number | null;
  status: SidecarAnchorStatus | null;
};

type SidecarRigComparison = {
  comparable_anchor_count: number;
  vertical_max_delta: number | null;
  span_delta: number | null;
};

type SidecarRigContext = {
  requestedView: SidecarAnchorView | null;
  reviewOnly: boolean;
  requiredManualSlots: string[];
  notes: string[];
  anchorManifest: Record<string, unknown> | null;
  anchorSource: string | null;
  anchorConfidenceSummary: {
    overall: number | null;
    by_view: Partial<Record<SidecarAnchorView, number>>;
  };
  missingAnchorIds: string[];
  lowConfidenceAnchorIds: string[];
  comparisons: Partial<Record<Exclude<SidecarAnchorView, "front">, SidecarRigComparison>>;
};

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeScoreValue(value: unknown): number | null {
  const parsed = asFiniteNumber(value);
  if (parsed === null) {
    return null;
  }
  return clamp(parsed <= 1 ? parsed * 100 : parsed, 0, 100);
}

function normalizeConfidenceValue(value: unknown): number | null {
  const parsed = asFiniteNumber(value);
  if (parsed === null) {
    return null;
  }
  return clamp(parsed > 1 ? parsed / 100 : parsed, 0, 1);
}

function normalizeAnchorCoordinate(value: unknown): number | null {
  const parsed = asFiniteNumber(value);
  if (parsed === null || parsed < 0 || parsed > 1) {
    return null;
  }
  return parsed;
}

function normalizeAnchorView(value: unknown): SidecarAnchorView | null {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (normalized === "front") {
    return "front";
  }
  if (normalized === "threequarter" || normalized === "three_quarter" || normalized === "3q") {
    return "threeQuarter";
  }
  if (normalized === "profile") {
    return "profile";
  }
  return null;
}

function anchorLabel(view: SidecarAnchorView, anchorId: SidecarAnchorId): string {
  return `${view}:${anchorId}`;
}

function averageNumbers(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMaybe(value: number | null, digits = 3): number | null {
  return value === null ? null : round(value, digits);
}

function isAnchorUsable(status: SidecarAnchorStatus | null | undefined): boolean {
  return status === "present" || status === "occluded";
}

function pushRigScope(scopes: SidecarRigMetadataScope[], label: string, value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return;
  }
  scopes.push({ label, record });
}

function readJsonRecordIfExists(filePath: string | null): Record<string, unknown> | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function collectRigMetadataScopes(metadata: Record<string, unknown> | null): SidecarRigMetadataScope[] {
  const scopes: SidecarRigMetadataScope[] = [];
  if (!metadata) {
    return scopes;
  }

  pushRigScope(scopes, "metadata", metadata);
  for (const key of SIDECAR_METADATA_SCOPE_KEYS) {
    const record = asRecord(metadata[key]);
    if (!record) {
      continue;
    }
    pushRigScope(scopes, `metadata.${key}`, record);
    pushRigScope(scopes, `metadata.${key}.auto_proposal`, record.auto_proposal);
    pushRigScope(scopes, `metadata.${key}.autoProposal`, record.autoProposal);
  }

  for (const key of SIDECAR_METADATA_FILE_PATH_KEYS) {
    const filePath = asNonEmptyString(metadata[key]);
    const record = readJsonRecordIfExists(filePath);
    if (!record) {
      continue;
    }
    pushRigScope(scopes, `file:${key}`, record);
    pushRigScope(scopes, `file:${key}.auto_proposal`, record.auto_proposal);
    pushRigScope(scopes, `file:${key}.autoProposal`, record.autoProposal);
  }

  return scopes;
}

function findFirstRecordByKeys(
  scopes: SidecarRigMetadataScope[],
  keys: string[]
): { label: string; key: string; record: Record<string, unknown> } | null {
  for (const scope of scopes) {
    for (const key of keys) {
      const record = asRecord(scope.record[key]);
      if (record) {
        return {
          label: scope.label,
          key,
          record
        };
      }
    }
  }
  return null;
}

function findFirstNumberByKeys(
  scopes: SidecarRigMetadataScope[],
  keys: string[],
  normalize: (value: unknown) => number | null = normalizeScoreValue
): { label: string; key: string; value: number } | null {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = normalize(scope.record[key]);
      if (value !== null) {
        return {
          label: scope.label,
          key,
          value
        };
      }
    }
  }
  return null;
}

function findFirstBooleanByKeys(
  scopes: SidecarRigMetadataScope[],
  keys: string[]
): { label: string; key: string; value: boolean } | null {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = asBoolean(scope.record[key]);
      if (value !== null) {
        return {
          label: scope.label,
          key,
          value
        };
      }
    }
  }
  return null;
}

function findFirstStringArrayByKeys(
  scopes: SidecarRigMetadataScope[],
  keys: string[]
): { label: string; key: string; value: string[] } | null {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = asStringArray(scope.record[key]);
      if (value.length > 0) {
        return {
          label: scope.label,
          key,
          value
        };
      }
    }
  }
  return null;
}

function findFirstStringByKeys(
  scopes: SidecarRigMetadataScope[],
  keys: string[]
): { label: string; key: string; value: string } | null {
  for (const scope of scopes) {
    for (const key of keys) {
      const value = asNonEmptyString(scope.record[key]);
      if (value) {
        return {
          label: scope.label,
          key,
          value
        };
      }
    }
  }
  return null;
}

function resolveAnchorManifest(scopes: SidecarRigMetadataScope[]): { label: string; manifest: Record<string, unknown> } | null {
  const direct = findFirstRecordByKeys(scopes, ["anchors", "anchor_manifest", "anchorManifest"]);
  if (direct) {
    return {
      label: `${direct.label}.${direct.key}`,
      manifest: direct.record
    };
  }

  for (const scope of scopes) {
    const looksLikeManifest =
      asRecord(scope.record.views) !== null ||
      asRecord(scope.record.summary) !== null ||
      asRecord(scope.record.confidence_summary) !== null ||
      asRecord(scope.record.confidenceSummary) !== null;
    if (looksLikeManifest) {
      return {
        label: scope.label,
        manifest: scope.record
      };
    }
  }
  return null;
}

function resolveAnchorViewManifest(
  anchorManifest: Record<string, unknown> | null,
  view: SidecarAnchorView
): Record<string, unknown> | null {
  return asRecord(asRecord(anchorManifest?.views)?.[view]);
}

function resolveAnchorEntry(viewManifest: Record<string, unknown> | null, anchorId: SidecarAnchorId): SidecarAnchorEntry | null {
  const record = asRecord(viewManifest?.[anchorId]);
  if (!record) {
    return null;
  }
  const normalizedStatus = asNonEmptyString(record.status);
  const status: SidecarAnchorStatus | null =
    normalizedStatus === "present" ||
    normalizedStatus === "occluded" ||
    normalizedStatus === "missing" ||
    normalizedStatus === "not_applicable"
      ? normalizedStatus
      : null;

  return {
    x: normalizeAnchorCoordinate(record.x),
    y: normalizeAnchorCoordinate(record.y),
    confidence: normalizeConfidenceValue(record.confidence),
    status
  };
}

function deriveAnchorConfidenceSummary(anchorManifest: Record<string, unknown> | null): {
  overall: number | null;
  by_view: Partial<Record<SidecarAnchorView, number>>;
} {
  const summaryRecord = asRecord(anchorManifest?.confidence_summary) ?? asRecord(anchorManifest?.confidenceSummary);
  const summaryByViewRecord = asRecord(summaryRecord?.by_view) ?? asRecord(summaryRecord?.byView);
  const byView: Partial<Record<SidecarAnchorView, number>> = {};
  for (const view of SIDECAR_ANCHOR_VIEWS) {
    const explicit = normalizeConfidenceValue(summaryByViewRecord?.[view]);
    if (explicit !== null) {
      byView[view] = round(explicit, 3);
      continue;
    }
    const viewManifest = resolveAnchorViewManifest(anchorManifest, view);
    const derived = averageNumbers(
      SIDECAR_ANCHOR_IDS.flatMap((anchorId) => {
        const confidence = resolveAnchorEntry(viewManifest, anchorId)?.confidence ?? null;
        return confidence !== null ? [confidence] : [];
      })
    );
    if (derived !== null) {
      byView[view] = round(derived, 3);
    }
  }

  const overallExplicit = normalizeConfidenceValue(summaryRecord?.overall);
  const overallDerived = averageNumbers(
    Object.values(byView).flatMap((value) => (typeof value === "number" ? [value] : []))
  );
  return {
    overall: roundMaybe(overallExplicit ?? overallDerived),
    by_view: byView
  };
}

function deriveAnchorReview(anchorManifest: Record<string, unknown> | null): {
  missingAnchorIds: string[];
  lowConfidenceAnchorIds: string[];
} {
  const missingAnchorIds: string[] = [];
  const lowConfidenceAnchorIds: string[] = [];
  if (!anchorManifest) {
    return { missingAnchorIds, lowConfidenceAnchorIds };
  }

  for (const view of SIDECAR_ANCHOR_VIEWS) {
    const viewManifest = resolveAnchorViewManifest(anchorManifest, view);
    for (const anchorId of SIDECAR_ANCHOR_IDS) {
      const entry = resolveAnchorEntry(viewManifest, anchorId);
      if (!entry || entry.status === "missing") {
        missingAnchorIds.push(anchorLabel(view, anchorId));
        continue;
      }
      if (entry.status !== "not_applicable" && entry.confidence !== null && entry.confidence < SIDECAR_ANCHOR_LOW_CONFIDENCE) {
        lowConfidenceAnchorIds.push(anchorLabel(view, anchorId));
      }
    }
  }

  return {
    missingAnchorIds,
    lowConfidenceAnchorIds
  };
}

function deriveRigComparisons(
  anchorManifest: Record<string, unknown> | null
): Partial<Record<Exclude<SidecarAnchorView, "front">, SidecarRigComparison>> {
  const frontView = resolveAnchorViewManifest(anchorManifest, "front");
  if (!frontView) {
    return {};
  }

  const comparisons: Partial<Record<Exclude<SidecarAnchorView, "front">, SidecarRigComparison>> = {};
  for (const view of ["threeQuarter", "profile"] as const) {
    const sideView = resolveAnchorViewManifest(anchorManifest, view);
    if (!sideView) {
      continue;
    }

    const verticalDeltas = (["head_center", "mouth_center", "paw_anchor", "tail_root"] as const).flatMap((anchorId) => {
      const frontEntry = resolveAnchorEntry(frontView, anchorId);
      const sideEntry = resolveAnchorEntry(sideView, anchorId);
      const frontY = frontEntry?.y ?? null;
      const sideY = sideEntry?.y ?? null;
      return frontY !== null && sideY !== null ? [Math.abs(sideY - frontY)] : [];
    });

    const frontPaw = resolveAnchorEntry(frontView, "paw_anchor");
    const frontTail = resolveAnchorEntry(frontView, "tail_root");
    const sidePaw = resolveAnchorEntry(sideView, "paw_anchor");
    const sideTail = resolveAnchorEntry(sideView, "tail_root");
    const frontPawX = frontPaw?.x ?? null;
    const frontTailX = frontTail?.x ?? null;
    const sidePawX = sidePaw?.x ?? null;
    const sideTailX = sideTail?.x ?? null;
    const spanDelta =
      frontPawX !== null && frontTailX !== null && sidePawX !== null && sideTailX !== null
        ? Math.abs(Math.abs(sidePawX - sideTailX) - Math.abs(frontPawX - frontTailX))
        : null;

    comparisons[view] = {
      comparable_anchor_count: verticalDeltas.length,
      vertical_max_delta: roundMaybe(verticalDeltas.length > 0 ? Math.max(...verticalDeltas) : null),
      span_delta: roundMaybe(spanDelta)
    };
  }

  return comparisons;
}

function resolveRigContext(candidate: SidecarJudgeCandidateInput): SidecarRigContext {
  const scopes = collectRigMetadataScopes(candidate.metadata ?? null);
  const requestedView =
    normalizeAnchorView(
      findFirstStringByKeys(scopes, [
        "requested_reference_view",
        "requestedReferenceView",
        "reference_view",
        "referenceView",
        "selected_view",
        "selectedView",
        "view"
      ])?.value ?? null
    ) ?? null;

  const reviewOnly = findFirstBooleanByKeys(scopes, ["review_only", "reviewOnly"])?.value ?? false;
  const requiredManualSlots =
    findFirstStringArrayByKeys(scopes, ["required_manual_slots", "requiredManualSlots"])?.value ?? [];
  const notes = uniqueStrings(findFirstStringArrayByKeys(scopes, ["review_notes", "reviewNotes", "notes"])?.value ?? []);

  const manifestHit = resolveAnchorManifest(scopes);
  const summaryHit = findFirstRecordByKeys(scopes, ["anchor_confidence_summary", "anchorConfidenceSummary"]);
  const reviewHit = findFirstRecordByKeys(scopes, ["anchor_review", "anchorReview"]);

  const derivedSummary = deriveAnchorConfidenceSummary(manifestHit?.manifest ?? null);
  const summaryByView = { ...derivedSummary.by_view };
  const summaryRecord = summaryHit?.record;
  const summaryByViewRecord = asRecord(summaryRecord?.by_view) ?? asRecord(summaryRecord?.byView);
  for (const view of SIDECAR_ANCHOR_VIEWS) {
    const explicit = normalizeConfidenceValue(summaryByViewRecord?.[view]);
    if (explicit !== null) {
      summaryByView[view] = round(explicit, 3);
    }
  }

  const explicitOverall = normalizeConfidenceValue(summaryRecord?.overall);
  const derivedReview = deriveAnchorReview(manifestHit?.manifest ?? null);
  const missingAnchorIds = uniqueStrings([
    ...derivedReview.missingAnchorIds,
    ...asStringArray(reviewHit?.record.missing_anchor_ids),
    ...asStringArray(reviewHit?.record.missingAnchorIds)
  ]);
  const lowConfidenceAnchorIds = uniqueStrings([
    ...derivedReview.lowConfidenceAnchorIds,
    ...asStringArray(reviewHit?.record.low_confidence_anchor_ids),
    ...asStringArray(reviewHit?.record.lowConfidenceAnchorIds)
  ]);

  return {
    requestedView,
    reviewOnly,
    requiredManualSlots,
    notes,
    anchorManifest: manifestHit?.manifest ?? null,
    anchorSource: manifestHit?.label ?? summaryHit?.label ?? reviewHit?.label ?? null,
    anchorConfidenceSummary: {
      overall: roundMaybe(explicitOverall ?? derivedSummary.overall),
      by_view: summaryByView
    },
    missingAnchorIds,
    lowConfidenceAnchorIds,
    comparisons: deriveRigComparisons(manifestHit?.manifest ?? null)
  };
}

function buildAnchorConfidenceSummaryEvidence(context: SidecarRigContext): Record<string, unknown> | null {
  const byViewEntries = Object.entries(context.anchorConfidenceSummary.by_view).filter(
    (entry): entry is [SidecarAnchorView, number] => typeof entry[1] === "number"
  );
  if (context.anchorConfidenceSummary.overall === null && byViewEntries.length === 0) {
    return null;
  }

  return {
    ...(context.anchorConfidenceSummary.overall !== null ? { overall: round(context.anchorConfidenceSummary.overall, 3) } : {}),
    ...(byViewEntries.length > 0
      ? {
          by_view: Object.fromEntries(byViewEntries.map(([view, value]) => [view, round(value, 3)]))
        }
      : {})
  };
}

function buildFallbackEvidenceBase(
  candidate: SidecarJudgeCandidateInput,
  context: SidecarRigContext,
  source: string,
  sourceDetail: string
): Record<string, unknown> {
  const anchorConfidenceSummary = buildAnchorConfidenceSummaryEvidence(context);
  return {
    candidate_id: candidate.candidateId,
    source,
    source_detail: sourceDetail,
    ...(context.requestedView ? { requested_view: context.requestedView } : {}),
    ...(context.anchorSource ? { anchor_source: context.anchorSource } : {}),
    ...(anchorConfidenceSummary ? { anchor_confidence_summary: anchorConfidenceSummary } : {}),
    ...(context.requiredManualSlots.length > 0 ? { required_manual_slots: context.requiredManualSlots } : {}),
    ...(context.reviewOnly ? { review_only: true } : {})
  };
}

function buildFallbackSignalHint(input: {
  score: number;
  confidence: number;
  reasons: string[];
  evidence: Record<string, unknown>;
}): SidecarJudgeSignalHint {
  return {
    score: round(clamp(input.score, 0, 100)),
    confidence: round(clamp(input.confidence, 0, 1), 3),
    reasons: uniqueStrings(input.reasons),
    evidence: input.evidence
  };
}

function fallbackConfidence(flavor: SidecarFallbackFlavor, source: "metadata" | "manifest" | "heuristic"): number {
  if (source === "metadata") {
    return flavor === "provider" ? 0.72 : 0.66;
  }
  if (source === "manifest") {
    return flavor === "provider" ? 0.68 : 0.62;
  }
  return flavor === "provider" ? 0.6 : 0.55;
}

function resolveExplicitSignalScore(
  scopes: SidecarRigMetadataScope[],
  signal: SidecarSignalKey
): SidecarExplicitSignalScore | null {
  const resolved = findFirstNumberByKeys(scopes, SIDECAR_SIGNAL_METADATA_SCORE_KEYS[signal]);
  if (!resolved) {
    return null;
  }
  return {
    score: resolved.value,
    scope: resolved.label,
    key: resolved.key
  };
}

function resolveHeadPoseFallback(
  candidate: SidecarJudgeCandidateInput,
  context: SidecarRigContext,
  flavor: SidecarFallbackFlavor
): SidecarJudgeSignalHint | null {
  const targetView = context.requestedView ?? "front";
  const viewManifest = resolveAnchorViewManifest(context.anchorManifest, targetView);
  const viewConfidence =
    context.anchorConfidenceSummary.by_view[targetView] ??
    context.anchorConfidenceSummary.by_view.front ??
    context.anchorConfidenceSummary.overall;

  if (!viewManifest && viewConfidence === null) {
    return null;
  }

  const head = resolveAnchorEntry(viewManifest, "head_center");
  const mouth = resolveAnchorEntry(viewManifest, "mouth_center");
  const eyeNear = resolveAnchorEntry(viewManifest, "eye_near");
  const eyeFar = resolveAnchorEntry(viewManifest, "eye_far");
  const earNear = resolveAnchorEntry(viewManifest, "ear_near");
  const earFar = resolveAnchorEntry(viewManifest, "ear_far");

  let score = 56 + (viewConfidence ?? SIDECAR_ANCHOR_VIEW_CONFIDENCE) * 22;
  score += isAnchorUsable(head?.status) ? 6 : -8;
  score += isAnchorUsable(mouth?.status) ? 3 : -4;

  if (targetView === "front") {
    score += isAnchorUsable(eyeNear?.status) && isAnchorUsable(eyeFar?.status) ? 8 : -10;
    const nearEyeX = eyeNear?.x ?? null;
    const farEyeX = eyeFar?.x ?? null;
    if (nearEyeX !== null && farEyeX !== null) {
      const spacing = Math.abs(nearEyeX - farEyeX);
      score += spacing >= 0.04 && spacing <= 0.5 ? 4 : -4;
    }
    const nearEyeY = eyeNear?.y ?? null;
    const farEyeY = eyeFar?.y ?? null;
    if (nearEyeY !== null && farEyeY !== null) {
      score += Math.abs(nearEyeY - farEyeY) <= 0.12 ? 2 : -2;
    }
  } else if (targetView === "threeQuarter") {
    score += isAnchorUsable(eyeNear?.status) ? 6 : -8;
    score += eyeFar?.status === "present" || eyeFar?.status === "occluded" ? 4 : -8;
    const nearEyeX = eyeNear?.x ?? null;
    const farEyeX = eyeFar?.x ?? null;
    if (nearEyeX !== null && farEyeX !== null) {
      score += nearEyeX > farEyeX ? 5 : -5;
    }
    const nearEarX = earNear?.x ?? null;
    const farEarX = earFar?.x ?? null;
    if (nearEarX !== null && farEarX !== null) {
      score += nearEarX > farEarX ? 2 : -2;
    }
  } else {
    score += isAnchorUsable(eyeNear?.status) ? 6 : -8;
    score += eyeFar?.status === "missing" || eyeFar?.status === "not_applicable" || eyeFar?.status === "occluded" ? 8 : -8;
    const headX = head?.x ?? null;
    const mouthX = mouth?.x ?? null;
    if (headX !== null && mouthX !== null) {
      score += Math.abs(mouthX - headX) >= 0.03 ? 3 : -3;
    }
  }

  score -= context.lowConfidenceAnchorIds.filter((anchorId) => anchorId.startsWith(`${targetView}:`)).length * 3;
  score -= context.missingAnchorIds.filter((anchorId) => anchorId.startsWith(`${targetView}:`)).length * 2;

  return buildFallbackSignalHint({
    score,
    confidence: fallbackConfidence(flavor, "manifest") + (viewManifest ? 0.03 : 0),
    reasons: ["anchor_manifest_head_pose"],
    evidence: {
      ...buildFallbackEvidenceBase(candidate, context, "manifest", "anchor_manifest.head_pose"),
      target_view: targetView,
      view_confidence: round(viewConfidence ?? SIDECAR_ANCHOR_VIEW_CONFIDENCE, 3),
      head_status: head?.status ?? null,
      mouth_status: mouth?.status ?? null,
      eye_statuses: {
        near: eyeNear?.status ?? null,
        far: eyeFar?.status ?? null
      }
    }
  });
}

function resolveEyeDriftFallback(
  candidate: SidecarJudgeCandidateInput,
  context: SidecarRigContext,
  flavor: SidecarFallbackFlavor
): SidecarJudgeSignalHint | null {
  const targetView = context.requestedView ?? "front";
  const viewManifest = resolveAnchorViewManifest(context.anchorManifest, targetView) ?? resolveAnchorViewManifest(context.anchorManifest, "front");
  const targetViewConfidence =
    context.anchorConfidenceSummary.by_view[targetView] ??
    context.anchorConfidenceSummary.by_view.front ??
    context.anchorConfidenceSummary.overall;

  if (!viewManifest && targetViewConfidence === null) {
    return null;
  }

  const eyeNear = resolveAnchorEntry(viewManifest, "eye_near");
  const eyeFar = resolveAnchorEntry(viewManifest, "eye_far");
  const eyeConfidenceMean = averageNumbers(
    [eyeNear?.confidence, eyeFar?.confidence].filter((value): value is number => typeof value === "number")
  );

  let score = 58 + (targetViewConfidence ?? SIDECAR_ANCHOR_VIEW_CONFIDENCE) * 18;
  score += (eyeConfidenceMean ?? SIDECAR_ANCHOR_VIEW_CONFIDENCE) * 10;
  score += isAnchorUsable(eyeNear?.status) ? 6 : -10;

  if (targetView === "profile") {
    score += eyeFar?.status === "missing" || eyeFar?.status === "not_applicable" || eyeFar?.status === "occluded" ? 6 : -6;
  } else {
    score += isAnchorUsable(eyeFar?.status) ? 6 : -8;
    const nearEyeX = eyeNear?.x ?? null;
    const farEyeX = eyeFar?.x ?? null;
    if (nearEyeX !== null && farEyeX !== null) {
      const spacing = Math.abs(nearEyeX - farEyeX);
      score += spacing >= 0.04 && spacing <= 0.45 ? 4 : -4;
    }
    const nearEyeY = eyeNear?.y ?? null;
    const farEyeY = eyeFar?.y ?? null;
    if (nearEyeY !== null && farEyeY !== null) {
      score += Math.abs(nearEyeY - farEyeY) <= 0.12 ? 2 : -2;
    }
  }

  if (context.requiredManualSlots.some((slot) => slot.startsWith("eye_"))) {
    score -= 8;
  }
  score -= context.lowConfidenceAnchorIds.filter((anchorId) => /eye_near|eye_far/.test(anchorId)).length * 4;
  score -= context.missingAnchorIds.filter((anchorId) => /eye_near|eye_far/.test(anchorId)).length * 3;

  return buildFallbackSignalHint({
    score,
    confidence: fallbackConfidence(flavor, "manifest"),
    reasons: ["anchor_manifest_eye_drift"],
    evidence: {
      ...buildFallbackEvidenceBase(candidate, context, "manifest", "anchor_manifest.eye_drift"),
      target_view: targetView,
      eye_statuses: {
        near: eyeNear?.status ?? null,
        far: eyeFar?.status ?? null
      },
      eye_confidences: {
        near: roundMaybe(eyeNear?.confidence ?? null),
        far: roundMaybe(eyeFar?.confidence ?? null)
      }
    }
  });
}

function resolveMouthReadabilityFallback(
  candidate: SidecarJudgeCandidateInput,
  context: SidecarRigContext,
  flavor: SidecarFallbackFlavor
): SidecarJudgeSignalHint | null {
  const frontManifest = resolveAnchorViewManifest(context.anchorManifest, "front");
  const targetManifest = resolveAnchorViewManifest(context.anchorManifest, context.requestedView ?? "front");
  const mouth = resolveAnchorEntry(frontManifest, "mouth_center") ?? resolveAnchorEntry(targetManifest, "mouth_center");
  const mouthConfidence =
    mouth?.confidence ??
    context.anchorConfidenceSummary.by_view.front ??
    context.anchorConfidenceSummary.by_view[context.requestedView ?? "front"] ??
    context.anchorConfidenceSummary.overall;

  if (!mouth && mouthConfidence === null && context.requiredManualSlots.length === 0 && !context.reviewOnly) {
    return null;
  }

  let score = 56 + (mouthConfidence ?? SIDECAR_ANCHOR_VIEW_CONFIDENCE) * 18;
  score += isAnchorUsable(mouth?.status) ? 8 : -12;
  score += typeof mouth?.confidence === "number" ? mouth.confidence * 10 : 0;
  score += candidate.narration || candidate.subtitleText ? 2 : 0;
  score -= context.requiredManualSlots.filter((slot) => slot.startsWith("mouth_")).length * 4;
  score -= context.lowConfidenceAnchorIds.filter((anchorId) => anchorId.endsWith(":mouth_center")).length * 6;
  score -= context.missingAnchorIds.filter((anchorId) => anchorId.endsWith(":mouth_center")).length * 6;
  if (context.reviewOnly) {
    score -= 4;
  }

  return buildFallbackSignalHint({
    score,
    confidence: fallbackConfidence(flavor, "manifest"),
    reasons: ["anchor_manifest_mouth_readability"],
    evidence: {
      ...buildFallbackEvidenceBase(candidate, context, "manifest", "anchor_manifest.mouth_readability"),
      mouth_status: mouth?.status ?? null,
      mouth_confidence: roundMaybe(mouth?.confidence ?? null),
      speech_expected: Boolean(candidate.narration || candidate.subtitleText)
    }
  });
}

function resolveLandmarkConsistencyFallback(
  candidate: SidecarJudgeCandidateInput,
  context: SidecarRigContext,
  flavor: SidecarFallbackFlavor
): SidecarJudgeSignalHint | null {
  const comparisons = Object.entries(context.comparisons).filter(
    (entry): entry is [Exclude<SidecarAnchorView, "front">, SidecarRigComparison] => Boolean(entry[1])
  );
  if (comparisons.length === 0 && context.anchorConfidenceSummary.overall === null) {
    return null;
  }

  let score = 58 + (context.anchorConfidenceSummary.overall ?? SIDECAR_ANCHOR_OVERALL_CONFIDENCE) * 18;
  let strongComparisons = 0;
  const comparisonEvidence: Record<string, unknown> = {};

  for (const [view, comparison] of comparisons) {
    const horizontalThreshold = view === "profile" ? SIDECAR_LANDMARK_PROFILE_HORIZONTAL_DELTA : SIDECAR_LANDMARK_HORIZONTAL_DELTA;
    if (comparison.comparable_anchor_count >= 3) {
      if (comparison.vertical_max_delta !== null) {
        score -= Math.min(1, comparison.vertical_max_delta / SIDECAR_LANDMARK_VERTICAL_DELTA) * 14;
      }
      if (comparison.span_delta !== null) {
        score -= Math.min(1, comparison.span_delta / horizontalThreshold) * 10;
      }
      if (
        comparison.vertical_max_delta !== null &&
        comparison.vertical_max_delta <= SIDECAR_LANDMARK_VERTICAL_DELTA &&
        comparison.span_delta !== null &&
        comparison.span_delta <= horizontalThreshold
      ) {
        strongComparisons += 1;
      }
    } else {
      score -= 4;
    }
    comparisonEvidence[view] = comparison;
  }

  score += strongComparisons * 4;
  score -= Math.min(12, context.missingAnchorIds.length * 1.25);
  score -= Math.min(10, context.lowConfidenceAnchorIds.length * 1.1);

  return buildFallbackSignalHint({
    score,
    confidence: fallbackConfidence(flavor, "manifest") + (strongComparisons > 0 ? 0.03 : 0),
    reasons: ["anchor_manifest_landmark_consistency"],
    evidence: {
      ...buildFallbackEvidenceBase(candidate, context, "manifest", "anchor_manifest.landmark_consistency"),
      comparisons: comparisonEvidence
    }
  });
}

function resolveIdentityRigFallback(
  candidate: SidecarJudgeCandidateInput,
  context: SidecarRigContext,
  flavor: SidecarFallbackFlavor
): SidecarJudgeSignalHint | null {
  const overall = context.anchorConfidenceSummary.overall;
  const frontConfidence = context.anchorConfidenceSummary.by_view.front ?? overall;
  if (
    overall === null &&
    frontConfidence === null &&
    context.missingAnchorIds.length === 0 &&
    context.lowConfidenceAnchorIds.length === 0 &&
    !context.reviewOnly
  ) {
    return null;
  }

  let score = candidate.referenceImagePath ? 68 : 56;
  score += (overall ?? SIDECAR_ANCHOR_OVERALL_CONFIDENCE) * 12;
  score += (frontConfidence ?? overall ?? SIDECAR_ANCHOR_VIEW_CONFIDENCE) * 10;
  score -= Math.min(12, context.lowConfidenceAnchorIds.length * 2.5);
  score -= Math.min(12, context.missingAnchorIds.length * 1.5);
  if (context.reviewOnly) {
    score -= 4;
  }
  if (context.requiredManualSlots.some((slot) => slot.startsWith("eye_") || slot.startsWith("mouth_"))) {
    score -= 3;
  }

  return buildFallbackSignalHint({
    score,
    confidence: fallbackConfidence(flavor, "manifest"),
    reasons: ["anchor_manifest_identity_fallback"],
    evidence: {
      ...buildFallbackEvidenceBase(candidate, context, "manifest", "anchor_manifest.identity"),
      reference_image_present: Boolean(candidate.referenceImagePath)
    }
  });
}

export function deriveSidecarFallbackSignal(
  candidate: SidecarJudgeCandidateInput,
  signal: SidecarSignalKey,
  flavor: SidecarFallbackFlavor = "judge"
): SidecarJudgeSignalHint {
  const scopes = collectRigMetadataScopes(candidate.metadata ?? null);
  const context = resolveRigContext(candidate);
  const explicitScore = resolveExplicitSignalScore(scopes, signal);

  if (explicitScore) {
    return buildFallbackSignalHint({
      score: explicitScore.score,
      confidence: fallbackConfidence(flavor, "metadata"),
      reasons: [`metadata_${signal}_fallback`],
      evidence: {
        ...buildFallbackEvidenceBase(candidate, context, "metadata", `${explicitScore.scope}.${explicitScore.key}`),
        metadata_key: explicitScore.key
      }
    });
  }

  if (signal === "identity") {
    const identityFallback = resolveIdentityRigFallback(candidate, context, flavor);
    if (identityFallback) {
      return identityFallback;
    }
    return buildFallbackSignalHint({
      score: candidate.referenceImagePath ? 72 : 58,
      confidence: flavor === "provider" ? 0.64 : 0.58,
      reasons: [candidate.referenceImagePath ? "reference_anchor_present_default" : "reference_anchor_missing_default"],
      evidence: buildFallbackEvidenceBase(candidate, context, "heuristic", "default.identity")
    });
  }

  if (signal === "head_pose") {
    const fallback = resolveHeadPoseFallback(candidate, context, flavor);
    if (fallback) {
      return fallback;
    }
    return buildFallbackSignalHint({
      score:
        context.requestedView === "profile"
          ? candidate.referenceImagePath
            ? 68
            : 60
          : context.requestedView === "threeQuarter"
            ? candidate.referenceImagePath
              ? 70
              : 62
            : candidate.referenceImagePath
              ? 72
              : 60,
      confidence: fallbackConfidence(flavor, "heuristic"),
      reasons: [context.requestedView ? `requested_view_${context.requestedView}_default` : "head_pose_default"],
      evidence: buildFallbackEvidenceBase(candidate, context, "heuristic", "default.head_pose")
    });
  }

  if (signal === "eye_drift") {
    const fallback = resolveEyeDriftFallback(candidate, context, flavor);
    if (fallback) {
      return fallback;
    }
    return buildFallbackSignalHint({
      score: candidate.referenceImagePath ? 70 : 58,
      confidence: fallbackConfidence(flavor, "heuristic"),
      reasons: [candidate.referenceImagePath ? "reference_eye_anchor_default" : "reference_eye_anchor_missing_default"],
      evidence: buildFallbackEvidenceBase(candidate, context, "heuristic", "default.eye_drift")
    });
  }

  if (signal === "mouth_readability") {
    const fallback = resolveMouthReadabilityFallback(candidate, context, flavor);
    if (fallback) {
      return fallback;
    }
    return buildFallbackSignalHint({
      score: candidate.narration || candidate.subtitleText ? 66 : 72,
      confidence: fallbackConfidence(flavor, "heuristic"),
      reasons: [candidate.narration || candidate.subtitleText ? "speech_mouth_default" : "non_speech_mouth_default"],
      evidence: {
        ...buildFallbackEvidenceBase(candidate, context, "heuristic", "default.mouth_readability"),
        speech_expected: Boolean(candidate.narration || candidate.subtitleText)
      }
    });
  }

  if (signal === "landmark_consistency") {
    const fallback = resolveLandmarkConsistencyFallback(candidate, context, flavor);
    if (fallback) {
      return fallback;
    }
    return buildFallbackSignalHint({
      score: candidate.referenceImagePath ? 70 : 60,
      confidence: fallbackConfidence(flavor, "heuristic"),
      reasons: [candidate.referenceImagePath ? "reference_landmark_default" : "reference_landmark_missing_default"],
      evidence: buildFallbackEvidenceBase(candidate, context, "heuristic", "default.landmark_consistency")
    });
  }

  if (signal === "motion") {
    const durationRatio =
      typeof candidate.outputDurationSeconds === "number" &&
      Number.isFinite(candidate.outputDurationSeconds) &&
      candidate.expectedDurationSeconds > 0
        ? candidate.outputDurationSeconds / candidate.expectedDurationSeconds
        : null;
    return buildFallbackSignalHint({
      score:
        durationRatio === null
          ? 62
          : durationRatio >= 0.94 && durationRatio <= 1.08
            ? 76
            : durationRatio >= 0.9 && durationRatio <= 1.12
              ? 68
              : 54,
      confidence: flavor === "provider" ? 0.62 : 0.55,
      reasons: [durationRatio === null ? "duration_ratio_missing" : "duration_ratio_heuristic"],
      evidence: {
        ...buildFallbackEvidenceBase(candidate, context, "heuristic", "default.motion"),
        duration_ratio: durationRatio === null ? null : round(durationRatio, 3)
      }
    });
  }

  if (signal === "subtitle") {
    return buildFallbackSignalHint({
      score: candidate.subtitlesExpected ? 68 : 78,
      confidence: flavor === "provider" ? 0.58 : 0.55,
      reasons: [candidate.subtitlesExpected ? "subtitle_expected_default" : "subtitle_not_expected_default"],
      evidence: {
        ...buildFallbackEvidenceBase(candidate, context, "heuristic", "default.subtitle"),
        subtitle_text_present: Boolean(candidate.subtitleText)
      }
    });
  }

  return buildFallbackSignalHint({
    score: candidate.chartExpected ? 68 : 76,
    confidence: flavor === "provider" ? 0.58 : 0.55,
    reasons: [candidate.chartExpected ? "chart_expected_default" : "chart_not_expected_default"],
    evidence: {
      ...buildFallbackEvidenceBase(candidate, context, "heuristic", "default.chart"),
      chart_expected: candidate.chartExpected ?? false
    }
  });
}

export function resolveSidecarJudgeScore(metadata: Record<string, unknown> | null): number | null {
  return (
    asFiniteNumber(metadata?.premiumActualSelectedCandidateScore) ??
    asFiniteNumber(metadata?.premiumSelectedCandidateScore) ??
    asFiniteNumber(metadata?.premiumActualVisualSignalScore) ??
    null
  );
}

export function resolveSidecarFailureReason(input: {
  metadata: Record<string, unknown> | null;
  judge?: Record<string, unknown> | null;
}): string | null {
  return (
    asNonEmptyString(input.metadata?.failure) ??
    asNonEmptyString(input.metadata?.hunyuanFailure) ??
    asNonEmptyString(input.metadata?.wanFallbackFailure) ??
    (asNonEmptyString(input.judge?.decision) !== "accepted" && asNonEmptyString(input.judge?.decision) !== "fallback"
      ? asNonEmptyString(input.judge?.reason)
      : null) ??
    null
  );
}

export function resolveSidecarFallbackReason(input: {
  metadata: Record<string, unknown> | null;
  judge?: Record<string, unknown> | null;
}): string | null {
  return (
    asNonEmptyString(input.metadata?.fallbackReason) ??
    (asNonEmptyString(input.judge?.decision) === "fallback" ? asNonEmptyString(input.judge?.reason) : null) ??
    null
  );
}

export function downgradeSidecarRequestPackForBaseHunyuan(
  requestPack: SidecarBrollRequestPack,
  fallbackFrom: Extract<SidecarBackendCapability, "hunyuan15_local_i2v_sr">
): SidecarBrollRequestPack {
  return {
    ...requestPack,
    backend: "hunyuan15_local_i2v",
    renderer: resolveSidecarRendererForBackend("hunyuan15_local_i2v"),
    sr_profile: "off",
    metadata: {
      ...(asRecord(requestPack.metadata) ?? {}),
      backend_capability: "hunyuan15_local_i2v",
      actual_backend_capability: null,
      fallback_chain: resolveSidecarFallbackChain("hunyuan15_local_i2v"),
      sr_profile: "off",
      downgraded_from_backend: fallbackFrom,
      downgraded_from_sr_profile: requestPack.sr_profile
    }
  };
}
