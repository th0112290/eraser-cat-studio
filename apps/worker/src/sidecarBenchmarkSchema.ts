import fs from "node:fs";
import path from "node:path";

export type SidecarBenchmarkKind = "sidecar_backend_i2v" | "sidecar_preset_matrix" | "sidecar_multichannel";
export type SidecarBenchmarkScenarioGroup = "backend" | "preset" | "multichannel";
export type SidecarBenchmarkChannelDomain = "economy" | "medical" | null;
export type SidecarBenchmarkProfileBundle = "economy" | "medical" | null;

export type SidecarBenchmarkArtifactPaths = {
  plan_path: string | null;
  preflight_path: string | null;
  workflow_path: string | null;
  result_path: string | null;
  video_path: string | null;
  judge_path: string | null;
};

export type SidecarBenchmarkRow = {
  schema_version: "1.1";
  benchmark_kind: SidecarBenchmarkKind;
  run_id: string;
  generated_at: string;
  scenario_id: string;
  scenario_group: SidecarBenchmarkScenarioGroup;
  scenario_label: string | null;
  channel_domain: SidecarBenchmarkChannelDomain;
  profile_bundle: SidecarBenchmarkProfileBundle;
  backend: string | null;
  renderer: string | null;
  requested_backend: string | null;
  actual_backend: string | null;
  success: boolean;
  failure: string | null;
  latency_ms: number | null;
  duration_sec: number | null;
  resolution_profile: string | null;
  step_profile: string | null;
  cache_profile: string | null;
  sr_profile: string | null;
  accepted: boolean | null;
  judge_decision: string | null;
  judge_score: number | null;
  fallback_reason: string | null;
  fallback_from: string | null;
  fallback_to: string | null;
  retake_count: number | null;
  candidate_count: number | null;
  selected_candidate_id: string | null;
  cache_hit: boolean | null;
  controlnet_preset: string | null;
  impact_preset: string | null;
  qc_preset: string | null;
  output_duration_sec: number | null;
  expected_duration_sec: number | null;
  duration_delta_sec: number | null;
  qc_passed: boolean | null;
  qc_reasons: string[];
  qc_warnings: string[];
  preflight_warnings: string[];
  artifacts: SidecarBenchmarkArtifactPaths | null;
  extras: Record<string, unknown>;
};

export type SidecarBenchmarkRecommendationCandidate = {
  scenario_id: string;
  scenario_label: string | null;
  backend: string | null;
  renderer: string | null;
  success: boolean;
  accepted: boolean | null;
  judge_score: number | null;
  latency_ms: number | null;
  fallback_reason: string | null;
  resolution_profile: string | null;
  step_profile: string | null;
  cache_profile: string | null;
  sr_profile: string | null;
};

export type SidecarBackendBenchmarkRecommendationSummary = {
  best_overall: SidecarBenchmarkRecommendationCandidate | null;
  default_backend: SidecarBenchmarkRecommendationCandidate | null;
  premium_local_backend: SidecarBenchmarkRecommendationCandidate | null;
  optional_sr_backend: SidecarBenchmarkRecommendationCandidate | null;
  fallback_backend: SidecarBenchmarkRecommendationCandidate | null;
  ready: boolean;
  status: "ready" | "degraded" | "not_ready";
  recommendation: string;
  warnings: string[];
};

export type SidecarBackendBenchmarkAlert = {
  schema_version: "1.1";
  generated_at: string;
  benchmark_kind: "sidecar_backend_i2v";
  ready: boolean;
  status: "ready" | "degraded" | "not_ready";
  severity: "info" | "warning" | "critical";
  message: string;
  warnings: string[];
  failures: Array<{
    backend: string | null;
    renderer: string | null;
    failure: string | null;
    fallback_reason: string | null;
  }>;
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeStringArray(values: string[] | null | undefined): string[] {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

function normalizeArtifactPaths(value: Partial<SidecarBenchmarkArtifactPaths> | null | undefined): SidecarBenchmarkArtifactPaths | null {
  if (!value) {
    return null;
  }
  return {
    plan_path: typeof value.plan_path === "string" ? value.plan_path : null,
    preflight_path: typeof value.preflight_path === "string" ? value.preflight_path : null,
    workflow_path: typeof value.workflow_path === "string" ? value.workflow_path : null,
    result_path: typeof value.result_path === "string" ? value.result_path : null,
    video_path: typeof value.video_path === "string" ? value.video_path : null,
    judge_path: typeof value.judge_path === "string" ? value.judge_path : null
  };
}

export function buildSidecarBenchmarkRow(input: {
  benchmarkKind: SidecarBenchmarkKind;
  runId: string;
  generatedAt: string;
  scenarioId: string;
  scenarioGroup: SidecarBenchmarkScenarioGroup;
  scenarioLabel?: string | null;
  channelDomain?: SidecarBenchmarkChannelDomain;
  profileBundle?: SidecarBenchmarkProfileBundle;
  backend?: string | null;
  renderer?: string | null;
  requestedBackend?: string | null;
  actualBackend?: string | null;
  success?: boolean;
  failure?: string | null;
  latencyMs?: number | null;
  durationSec?: number | null;
  resolutionProfile?: string | null;
  stepProfile?: string | null;
  cacheProfile?: string | null;
  srProfile?: string | null;
  accepted?: boolean | null;
  judgeDecision?: string | null;
  judgeScore?: number | null;
  fallbackReason?: string | null;
  fallbackFrom?: string | null;
  fallbackTo?: string | null;
  retakeCount?: number | null;
  candidateCount?: number | null;
  selectedCandidateId?: string | null;
  cacheHit?: boolean | null;
  controlnetPreset?: string | null;
  impactPreset?: string | null;
  qcPreset?: string | null;
  outputDurationSec?: number | null;
  expectedDurationSec?: number | null;
  durationDeltaSec?: number | null;
  qcPassed?: boolean | null;
  qcReasons?: string[];
  qcWarnings?: string[];
  preflightWarnings?: string[];
  artifacts?: Partial<SidecarBenchmarkArtifactPaths> | null;
  extras?: Record<string, unknown>;
}): SidecarBenchmarkRow {
  return {
    schema_version: "1.1",
    benchmark_kind: input.benchmarkKind,
    run_id: input.runId,
    generated_at: input.generatedAt,
    scenario_id: input.scenarioId,
    scenario_group: input.scenarioGroup,
    scenario_label: input.scenarioLabel ?? null,
    channel_domain: input.channelDomain ?? null,
    profile_bundle: input.profileBundle ?? null,
    backend: input.backend ?? null,
    renderer: input.renderer ?? null,
    requested_backend: input.requestedBackend ?? null,
    actual_backend: input.actualBackend ?? null,
    success: input.success ?? false,
    failure: input.failure ?? null,
    latency_ms: typeof input.latencyMs === "number" ? round(input.latencyMs) : null,
    duration_sec: typeof input.durationSec === "number" ? round(input.durationSec) : null,
    resolution_profile: input.resolutionProfile ?? null,
    step_profile: input.stepProfile ?? null,
    cache_profile: input.cacheProfile ?? null,
    sr_profile: input.srProfile ?? null,
    accepted: typeof input.accepted === "boolean" ? input.accepted : null,
    judge_decision: input.judgeDecision ?? null,
    judge_score: typeof input.judgeScore === "number" ? round(input.judgeScore) : null,
    fallback_reason: input.fallbackReason ?? null,
    fallback_from: input.fallbackFrom ?? null,
    fallback_to: input.fallbackTo ?? null,
    retake_count: typeof input.retakeCount === "number" ? input.retakeCount : null,
    candidate_count: typeof input.candidateCount === "number" ? input.candidateCount : null,
    selected_candidate_id: input.selectedCandidateId ?? null,
    cache_hit: typeof input.cacheHit === "boolean" ? input.cacheHit : null,
    controlnet_preset: input.controlnetPreset ?? null,
    impact_preset: input.impactPreset ?? null,
    qc_preset: input.qcPreset ?? null,
    output_duration_sec: typeof input.outputDurationSec === "number" ? round(input.outputDurationSec) : null,
    expected_duration_sec: typeof input.expectedDurationSec === "number" ? round(input.expectedDurationSec) : null,
    duration_delta_sec: typeof input.durationDeltaSec === "number" ? round(input.durationDeltaSec) : null,
    qc_passed: typeof input.qcPassed === "boolean" ? input.qcPassed : null,
    qc_reasons: normalizeStringArray(input.qcReasons),
    qc_warnings: normalizeStringArray(input.qcWarnings),
    preflight_warnings: normalizeStringArray(input.preflightWarnings),
    artifacts: normalizeArtifactPaths(input.artifacts),
    extras: input.extras ?? {}
  };
}

function rankBenchmarkRows(rows: SidecarBenchmarkRow[]): SidecarBenchmarkRow[] {
  return [...rows].sort((left, right) => {
    const leftAccepted = left.accepted === true ? 1 : left.success ? 0 : -1;
    const rightAccepted = right.accepted === true ? 1 : right.success ? 0 : -1;
    if (rightAccepted !== leftAccepted) {
      return rightAccepted - leftAccepted;
    }
    const leftFallbackPenalty = left.fallback_reason ? 1 : 0;
    const rightFallbackPenalty = right.fallback_reason ? 1 : 0;
    if (leftFallbackPenalty !== rightFallbackPenalty) {
      return leftFallbackPenalty - rightFallbackPenalty;
    }
    const leftScore = typeof left.judge_score === "number" ? left.judge_score : -1;
    const rightScore = typeof right.judge_score === "number" ? right.judge_score : -1;
    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }
    const leftLatency = typeof left.latency_ms === "number" ? left.latency_ms : Number.POSITIVE_INFINITY;
    const rightLatency = typeof right.latency_ms === "number" ? right.latency_ms : Number.POSITIVE_INFINITY;
    if (leftLatency !== rightLatency) {
      return leftLatency - rightLatency;
    }
    return left.scenario_id.localeCompare(right.scenario_id, "en");
  });
}

function toRecommendationCandidate(row: SidecarBenchmarkRow | null): SidecarBenchmarkRecommendationCandidate | null {
  if (!row) {
    return null;
  }
  return {
    scenario_id: row.scenario_id,
    scenario_label: row.scenario_label,
    backend: row.backend,
    renderer: row.renderer,
    success: row.success,
    accepted: row.accepted,
    judge_score: row.judge_score,
    latency_ms: row.latency_ms,
    fallback_reason: row.fallback_reason,
    resolution_profile: row.resolution_profile,
    step_profile: row.step_profile,
    cache_profile: row.cache_profile,
    sr_profile: row.sr_profile
  };
}

function selectBestBenchmarkRow(
  rows: SidecarBenchmarkRow[],
  predicate: (row: SidecarBenchmarkRow) => boolean
): SidecarBenchmarkRow | null {
  return rankBenchmarkRows(rows.filter(predicate))[0] ?? null;
}

export function buildSidecarBackendRecommendationSummary(
  rows: SidecarBenchmarkRow[]
): SidecarBackendBenchmarkRecommendationSummary {
  const defaultBackend = selectBestBenchmarkRow(rows, (row) => row.backend === "wan");
  const premiumLocalBackend = selectBestBenchmarkRow(rows, (row) => row.backend === "hunyuan15_local_i2v");
  const optionalSrBackend = selectBestBenchmarkRow(rows, (row) => row.backend === "hunyuan15_local_i2v_sr");
  const fallbackBackend = selectBestBenchmarkRow(rows, (row) => row.backend === "still_placeholder");
  const bestOverall = selectBestBenchmarkRow(rows, (row) => row.backend !== "still_placeholder");

  const warnings: string[] = [];
  const wanReady = Boolean(defaultBackend?.success && defaultBackend.accepted !== false);
  const fallbackReady = Boolean(fallbackBackend?.success);
  if (!wanReady) {
    warnings.push("wan_default_not_ready");
  }
  if (!fallbackReady) {
    warnings.push("fallback_chain_not_ready");
  }
  if (premiumLocalBackend && !premiumLocalBackend.success) {
    warnings.push("premium_local_backend_not_ready");
  }
  if (optionalSrBackend && !optionalSrBackend.success) {
    warnings.push("optional_sr_backend_not_ready");
  }

  const ready = wanReady && fallbackReady;
  const status = !ready ? "not_ready" : warnings.some((warning) => warning !== "wan_default_not_ready" && warning !== "fallback_chain_not_ready") ? "degraded" : "ready";
  const recommendation = ready
    ? premiumLocalBackend?.success
      ? `wan default remains ready; premium local backend ${premiumLocalBackend.backend ?? "unknown"} is available`
      : "wan default remains ready; premium local backend is not available"
    : "backend chain is not ready for nightly use";

  return {
    best_overall: toRecommendationCandidate(bestOverall),
    default_backend: toRecommendationCandidate(defaultBackend),
    premium_local_backend: toRecommendationCandidate(premiumLocalBackend),
    optional_sr_backend: toRecommendationCandidate(optionalSrBackend),
    fallback_backend: toRecommendationCandidate(fallbackBackend),
    ready,
    status,
    recommendation,
    warnings
  };
}

export function buildSidecarBackendBenchmarkAlert(input: {
  generatedAt: string;
  summary: SidecarBackendBenchmarkRecommendationSummary;
  rows: SidecarBenchmarkRow[];
}): SidecarBackendBenchmarkAlert {
  const failures = input.rows
    .filter((row) => !row.success || row.accepted === false)
    .map((row) => ({
      backend: row.backend,
      renderer: row.renderer,
      failure: row.failure,
      fallback_reason: row.fallback_reason
    }));
  const severity = input.summary.status === "not_ready" ? "critical" : input.summary.status === "degraded" ? "warning" : "info";
  return {
    schema_version: "1.1",
    generated_at: input.generatedAt,
    benchmark_kind: "sidecar_backend_i2v",
    ready: input.summary.ready,
    status: input.summary.status,
    severity,
    message: input.summary.recommendation,
    warnings: input.summary.warnings,
    failures
  };
}

export function buildSidecarBackendBenchmarkAlertMarkdown(alert: SidecarBackendBenchmarkAlert): string {
  const lines = [
    "# Sidecar Backend Benchmark Alert",
    "",
    `- Ready: \`${alert.ready}\``,
    `- Status: \`${alert.status}\``,
    `- Severity: \`${alert.severity}\``,
    `- Message: \`${alert.message}\``,
    "",
    "## Warnings",
    ""
  ];
  if (alert.warnings.length === 0) {
    lines.push("- none");
  } else {
    for (const warning of alert.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  lines.push("", "## Failures", "");
  if (alert.failures.length === 0) {
    lines.push("- none");
  } else {
    for (const failure of alert.failures) {
      lines.push(
        `- backend=\`${failure.backend ?? "unknown"}\` renderer=\`${failure.renderer ?? "unknown"}\` failure=\`${failure.failure ?? "n/a"}\` fallback=\`${failure.fallback_reason ?? "n/a"}\``
      );
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function buildSidecarBackendNightlyEnvLines(input: {
  summaryPath: string;
  alertPath: string;
  summary: SidecarBackendBenchmarkRecommendationSummary;
}): string[] {
  return [
    `VIDEO_SIDECAR_BACKEND_BENCHMARK_READY=${input.summary.ready ? "true" : "false"}`,
    `VIDEO_SIDECAR_BACKEND_BENCHMARK_STATUS=${input.summary.status}`,
    `VIDEO_SIDECAR_BACKEND_BENCHMARK_SUMMARY_PATH=${input.summaryPath}`,
    `VIDEO_SIDECAR_BACKEND_BENCHMARK_ALERT_PATH=${input.alertPath}`,
    `VIDEO_SIDECAR_BACKEND_BENCHMARK_DEFAULT_BACKEND=${input.summary.default_backend?.backend ?? "wan"}`,
    `VIDEO_SIDECAR_BACKEND_BENCHMARK_DEFAULT_RENDERER=${input.summary.default_backend?.renderer ?? "comfyui-wan-i2v"}`,
    ...(input.summary.premium_local_backend?.backend
      ? [`VIDEO_SIDECAR_BACKEND_BENCHMARK_PREMIUM_BACKEND=${input.summary.premium_local_backend.backend}`]
      : []),
    ...(input.summary.premium_local_backend?.renderer
      ? [`VIDEO_SIDECAR_BACKEND_BENCHMARK_PREMIUM_RENDERER=${input.summary.premium_local_backend.renderer}`]
      : []),
    ...(input.summary.optional_sr_backend?.backend
      ? [`VIDEO_SIDECAR_BACKEND_BENCHMARK_OPTIONAL_SR_BACKEND=${input.summary.optional_sr_backend.backend}`]
      : []),
    ...(input.summary.optional_sr_backend?.renderer
      ? [`VIDEO_SIDECAR_BACKEND_BENCHMARK_OPTIONAL_SR_RENDERER=${input.summary.optional_sr_backend.renderer}`]
      : [])
  ];
}

export function writeSidecarBackendNightlyScaffold(input: {
  summaryPath: string;
  alertPath: string;
  alertMarkdownPath: string;
  envPath: string;
  generatedAt: string;
  rows: SidecarBenchmarkRow[];
  sourceMatrixPath: string;
}): {
  summary: SidecarBackendBenchmarkRecommendationSummary & {
    schema_version: "1.1";
    generated_at: string;
    benchmark_kind: "sidecar_backend_i2v";
    source_matrix_path: string;
  };
  alert: SidecarBackendBenchmarkAlert;
  envLines: string[];
} {
  const recommendationSummary = buildSidecarBackendRecommendationSummary(input.rows);
  const alert = buildSidecarBackendBenchmarkAlert({
    generatedAt: input.generatedAt,
    summary: recommendationSummary,
    rows: input.rows
  });
  const summary = {
    schema_version: "1.1" as const,
    generated_at: input.generatedAt,
    benchmark_kind: "sidecar_backend_i2v" as const,
    source_matrix_path: input.sourceMatrixPath,
    ...recommendationSummary
  };
  const envLines = buildSidecarBackendNightlyEnvLines({
    summaryPath: input.summaryPath,
    alertPath: input.alertPath,
    summary: recommendationSummary
  });
  ensureDir(path.dirname(input.summaryPath));
  fs.writeFileSync(input.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  ensureDir(path.dirname(input.alertPath));
  fs.writeFileSync(input.alertPath, `${JSON.stringify(alert, null, 2)}\n`, "utf8");
  ensureDir(path.dirname(input.alertMarkdownPath));
  fs.writeFileSync(input.alertMarkdownPath, buildSidecarBackendBenchmarkAlertMarkdown(alert), "utf8");
  ensureDir(path.dirname(input.envPath));
  fs.writeFileSync(input.envPath, `${envLines.join("\n")}\n`, "utf8");
  return {
    summary,
    alert,
    envLines
  };
}
