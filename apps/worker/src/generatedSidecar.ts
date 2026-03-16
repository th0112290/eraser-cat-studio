import type { SidecarControlNetPresetId, SidecarImpactPresetId, SidecarQcPresetId } from "@ec/profiles";

export const SIDECAR_SIGNAL_KEYS = ["motion", "subtitle", "chart", "identity"] as const;

export type SidecarSignalKey = (typeof SIDECAR_SIGNAL_KEYS)[number];
export type SidecarChannelDomain = "economy" | "medical" | "default";
export type SidecarJudgeSeverity = "INFO" | "WARN" | "ERROR";
export type SidecarJudgeStatus = "pass" | "warn" | "fail";

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
      motion: 0.18,
      subtitle: 0.28,
      chart: 0.14,
      identity: 0.4
    };
  }
  if (domain === "economy") {
    return {
      motion: 0.24,
      subtitle: 0.22,
      chart: 0.3,
      identity: 0.24
    };
  }
  return {
    motion: 0.24,
    subtitle: 0.24,
    chart: 0.22,
    identity: 0.3
  };
}

function signalThresholdsForDomain(domain: SidecarChannelDomain): Record<SidecarSignalKey, number> {
  if (domain === "medical") {
    return {
      motion: 58,
      subtitle: 68,
      chart: 60,
      identity: 72
    };
  }
  if (domain === "economy") {
    return {
      motion: 60,
      subtitle: 64,
      chart: 68,
      identity: 64
    };
  }
  return {
    motion: 60,
    subtitle: 64,
    chart: 64,
    identity: 68
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
