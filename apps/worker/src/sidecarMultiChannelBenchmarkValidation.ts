import fs from "node:fs";

export type MultiChannelBundleName = "economy" | "medical";
export type MultiChannelBenchmarkKind = "presets" | "backends";

type ValidationPolicy = {
  minScore: number;
  allowedVerdicts: Array<"recommended" | "acceptable">;
  maxFallbackCount: number;
  maxRetakeCount: number;
  minVisualSignalScore: number;
  minChartSafeScore: number | null;
  minIdentityScore: number | null;
  minFaceStabilityScore: number | null;
};

type CrossChannelValidationPolicy = {
  requireSharedTriplet: boolean;
  maxDifferingAxes: number;
  maxScoreGap: number | null;
  allowQcDivergence: boolean;
};

export type MultiChannelBundleValidationResult = {
  bundle: MultiChannelBundleName;
  benchmark_kind: MultiChannelBenchmarkKind;
  channel_domain: "economy" | "medical" | null;
  status: string;
  ready: boolean;
  issues: string[];
  matrix_path: string | null;
  summary: Record<string, unknown> | null;
  selected_scenario: Record<string, unknown> | null;
  selected_backend: Record<string, unknown> | null;
  policy: ValidationPolicy;
};

export type MultiChannelCrossChannelValidation = {
  benchmark_kind: MultiChannelBenchmarkKind;
  status: "shared" | "diverged" | "insufficient" | "not_applicable";
  severity: "info" | "warn" | "error";
  ready: boolean;
  shared_best_triplet: boolean | null;
  divergence_level: "none" | "minor" | "moderate" | "major" | "critical" | "insufficient" | "n/a";
  differing_axes: Array<"controlnet" | "impact" | "qc">;
  score_gap: number | null;
  economy_triplet: {
    controlnet_preset: string | null;
    impact_preset: string | null;
    qc_preset: string | null;
  } | null;
  medical_triplet: {
    controlnet_preset: string | null;
    impact_preset: string | null;
    qc_preset: string | null;
  } | null;
  economy_score: number | null;
  medical_score: number | null;
  recommendation: string;
  issues: string[];
  policy: CrossChannelValidationPolicy;
};

export type MultiChannelBenchmarkValidationReport = {
  schema_version: "1.0";
  benchmark_kind: MultiChannelBenchmarkKind;
  ready: boolean;
  summary_path: string;
  bundle_count: number;
  bundles: MultiChannelBundleValidationResult[];
  cross_channel: MultiChannelCrossChannelValidation;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseAllowedVerdicts(value: string | undefined, fallback: Array<"recommended" | "acceptable">) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is "recommended" | "acceptable" => entry === "recommended" || entry === "acceptable");
  return parsed.length > 0 ? parsed : fallback;
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function parseTruthy(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolveBundlePolicy(bundle: MultiChannelBundleName): ValidationPolicy {
  const prefix = bundle.toUpperCase();
  const fallbackAllowed = bundle === "medical" ? (["recommended", "acceptable"] as const) : (["recommended"] as const);
  return {
    minScore: Number.parseFloat(process.env[`BENCHMARK_MULTICHANNEL_${prefix}_MIN_SCORE`] ?? (bundle === "medical" ? "80" : "84")),
    allowedVerdicts: parseAllowedVerdicts(
      process.env[`BENCHMARK_MULTICHANNEL_${prefix}_ALLOWED_VERDICTS`],
      [...fallbackAllowed]
    ),
    maxFallbackCount: Number.parseInt(process.env[`BENCHMARK_MULTICHANNEL_${prefix}_MAX_FALLBACKS`] ?? "0", 10),
    maxRetakeCount: Number.parseInt(process.env[`BENCHMARK_MULTICHANNEL_${prefix}_MAX_RETAKES`] ?? "0", 10),
    minVisualSignalScore: Number.parseFloat(
      process.env[`BENCHMARK_MULTICHANNEL_${prefix}_MIN_VISUAL_SIGNAL_SCORE`] ?? (bundle === "medical" ? "60" : "58")
    ),
    minChartSafeScore:
      bundle === "economy"
        ? Number.parseFloat(process.env[`BENCHMARK_MULTICHANNEL_${prefix}_MIN_CHART_SAFE_SCORE`] ?? "60")
        : null,
    minIdentityScore:
      bundle === "medical"
        ? Number.parseFloat(process.env[`BENCHMARK_MULTICHANNEL_${prefix}_MIN_IDENTITY_SCORE`] ?? "60")
        : null,
    minFaceStabilityScore:
      bundle === "medical"
        ? Number.parseFloat(process.env[`BENCHMARK_MULTICHANNEL_${prefix}_MIN_FACE_STABILITY_SCORE`] ?? "58")
        : null
  };
}

function resolveCrossChannelPolicy(): CrossChannelValidationPolicy {
  const maxDifferingAxesRaw = Number.parseInt(process.env.BENCHMARK_MULTICHANNEL_MAX_DIFFERING_AXES ?? "3", 10);
  const maxScoreGapRaw = Number.parseFloat(process.env.BENCHMARK_MULTICHANNEL_MAX_SCORE_GAP ?? "20");
  return {
    requireSharedTriplet: parseTruthy(process.env.BENCHMARK_MULTICHANNEL_REQUIRE_SHARED_TRIPLET, false),
    maxDifferingAxes:
      Number.isInteger(maxDifferingAxesRaw) && maxDifferingAxesRaw >= 0 ? maxDifferingAxesRaw : 3,
    maxScoreGap: Number.isFinite(maxScoreGapRaw) && maxScoreGapRaw >= 0 ? maxScoreGapRaw : null,
    allowQcDivergence: parseTruthy(process.env.BENCHMARK_MULTICHANNEL_ALLOW_QC_DIVERGENCE, true)
  };
}

function resolveTriplet(summary: Record<string, unknown> | null) {
  if (!summary) {
    return null;
  }
  return {
    controlnet_preset: asString(summary.controlnet_preset),
    impact_preset: asString(summary.impact_preset),
    qc_preset: asString(summary.qc_preset)
  };
}

function validateCrossChannelComparison(
  benchmarkKind: MultiChannelBenchmarkKind,
  bundles: MultiChannelBundleValidationResult[]
): MultiChannelCrossChannelValidation {
  const policy = resolveCrossChannelPolicy();
  if (benchmarkKind !== "presets") {
    return {
      benchmark_kind: benchmarkKind,
      status: "not_applicable",
      severity: "info",
      ready: true,
      shared_best_triplet: null,
      divergence_level: "n/a",
      differing_axes: [],
      score_gap: null,
      economy_triplet: null,
      medical_triplet: null,
      economy_score: null,
      medical_score: null,
      recommendation: "cross-channel triplet comparison applies to preset benchmarks only",
      issues: [],
      policy
    };
  }

  const economy = bundles.find((bundle) => bundle.bundle === "economy") ?? null;
  const medical = bundles.find((bundle) => bundle.bundle === "medical") ?? null;
  const economyTriplet = resolveTriplet(economy?.summary ?? null);
  const medicalTriplet = resolveTriplet(medical?.summary ?? null);
  const economyScore = asNumber(economy?.summary?.score);
  const medicalScore = asNumber(medical?.summary?.score);
  const scoreGap =
    typeof economyScore === "number" && typeof medicalScore === "number"
      ? Number(Math.abs(economyScore - medicalScore).toFixed(2))
      : null;
  if (!economyTriplet || !medicalTriplet) {
    return {
      benchmark_kind: benchmarkKind,
      status: "insufficient",
      severity: "warn",
      ready: false,
      shared_best_triplet: null,
      divergence_level: "insufficient",
      differing_axes: [],
      score_gap: scoreGap,
      economy_triplet: economyTriplet,
      medical_triplet: medicalTriplet,
      economy_score: economyScore,
      medical_score: medicalScore,
      recommendation: "insufficient completed bundle summaries for cross-channel comparison",
      issues: ["missing_bundle_summary"],
      policy
    };
  }

  const differingAxes = [
    economyTriplet.controlnet_preset !== medicalTriplet.controlnet_preset ? "controlnet" : null,
    economyTriplet.impact_preset !== medicalTriplet.impact_preset ? "impact" : null,
    economyTriplet.qc_preset !== medicalTriplet.qc_preset ? "qc" : null
  ].filter((value): value is "controlnet" | "impact" | "qc" => Boolean(value));
  const sharedBestTriplet = differingAxes.length === 0;
  const divergenceLevel: MultiChannelCrossChannelValidation["divergence_level"] = sharedBestTriplet
    ? "none"
    : differingAxes.length === 1 && differingAxes[0] === "impact"
      ? "minor"
      : differingAxes.length === 1
        ? "moderate"
        : differingAxes.length === 2
          ? "major"
          : "critical";
  const issues: string[] = [];
  if (policy.requireSharedTriplet && !sharedBestTriplet) {
    issues.push("shared_triplet_required");
  }
  if (differingAxes.length > policy.maxDifferingAxes) {
    issues.push(`differing_axes_exceeded:${differingAxes.length}>${policy.maxDifferingAxes}`);
  }
  if (!policy.allowQcDivergence && differingAxes.includes("qc")) {
    issues.push("qc_divergence_blocked");
  }
  if (policy.maxScoreGap !== null && typeof scoreGap === "number" && scoreGap > policy.maxScoreGap) {
    issues.push(`score_gap_exceeded:${scoreGap.toFixed(2)}>${policy.maxScoreGap.toFixed(2)}`);
  }
  return {
    benchmark_kind: benchmarkKind,
    status: sharedBestTriplet ? "shared" : "diverged",
    severity: issues.length > 0 ? "error" : sharedBestTriplet ? "info" : divergenceLevel === "minor" ? "info" : "warn",
    ready: issues.length === 0,
    shared_best_triplet: sharedBestTriplet,
    divergence_level: divergenceLevel,
    differing_axes: differingAxes,
    score_gap: scoreGap,
    economy_triplet: economyTriplet,
    medical_triplet: medicalTriplet,
    economy_score: economyScore,
    medical_score: medicalScore,
    recommendation: sharedBestTriplet
      ? `shared triplet ${economyTriplet.controlnet_preset}/${economyTriplet.impact_preset}/${economyTriplet.qc_preset}`
      : `diverged(${divergenceLevel}) economy=${economyTriplet.controlnet_preset}/${economyTriplet.impact_preset}/${economyTriplet.qc_preset} medical=${medicalTriplet.controlnet_preset}/${medicalTriplet.impact_preset}/${medicalTriplet.qc_preset}`,
    issues,
    policy
  };
}

function validatePresetBundle(input: {
  bundle: MultiChannelBundleName;
  status: string;
  matrixPath: string | null;
  matrix: Record<string, unknown> | null;
}): MultiChannelBundleValidationResult {
  const policy = resolveBundlePolicy(input.bundle);
  const issues: string[] = [];
  const recommendationSummary = asRecord(input.matrix?.recommendation_summary ?? null);
  const bestOverall = asRecord(recommendationSummary?.best_overall ?? null);
  const scenarios = Array.isArray(input.matrix?.scenarios) ? input.matrix?.scenarios : [];
  const scenarioName = asString(bestOverall?.scenario);
  const selectedScenario =
    (scenarios.find((entry) => asRecord(entry)?.scenario === scenarioName) as Record<string, unknown> | undefined) ?? null;
  const channelDomain =
    (asString(input.matrix?.channel_domain) as "economy" | "medical" | null) ??
    (input.bundle === "medical" ? "medical" : "economy");

  if (input.status !== "completed") {
    issues.push(`bundle_status:${input.status}`);
  }
  if (!input.matrixPath || !input.matrix) {
    issues.push("matrix_missing");
  }
  if (!bestOverall) {
    issues.push("best_overall_missing");
  }
  if (!selectedScenario) {
    issues.push("selected_scenario_missing");
  }

  const score = asNumber(bestOverall?.score);
  const verdict = asString(bestOverall?.verdict) as "recommended" | "acceptable" | null;
  const fallbackCount = asNumber(selectedScenario?.fallback_count);
  const retakeCount = asNumber(selectedScenario?.retake_count);
  const qcPassed = selectedScenario?.qc_passed;
  const visualSignalScore = asNumber(selectedScenario?.premium_actual_visual_signal_score);
  const chartSafeScore = asNumber(selectedScenario?.premium_actual_chart_safe_score);
  const identityScore = asNumber(selectedScenario?.premium_actual_mascot_identity_preservation_score);
  const faceStabilityScore = asNumber(selectedScenario?.premium_actual_face_stability_score);

  if (typeof score === "number" && score < policy.minScore) {
    issues.push(`score_below_min:${score.toFixed(2)}<${policy.minScore.toFixed(2)}`);
  }
  if (verdict && !policy.allowedVerdicts.includes(verdict)) {
    issues.push(`verdict_blocked:${verdict}`);
  }
  if (typeof fallbackCount === "number" && fallbackCount > policy.maxFallbackCount) {
    issues.push(`fallbacks_exceeded:${fallbackCount}>${policy.maxFallbackCount}`);
  }
  if (typeof retakeCount === "number" && retakeCount > policy.maxRetakeCount) {
    issues.push(`retakes_exceeded:${retakeCount}>${policy.maxRetakeCount}`);
  }
  if (qcPassed !== true) {
    issues.push("qc_not_passed");
  }
  if (typeof visualSignalScore === "number" && visualSignalScore < policy.minVisualSignalScore) {
    issues.push(`visual_signal_below_min:${visualSignalScore.toFixed(2)}<${policy.minVisualSignalScore.toFixed(2)}`);
  }
  if (typeof policy.minChartSafeScore === "number" && typeof chartSafeScore === "number" && chartSafeScore < policy.minChartSafeScore) {
    issues.push(`chart_safe_below_min:${chartSafeScore.toFixed(2)}<${policy.minChartSafeScore.toFixed(2)}`);
  }
  if (typeof policy.minIdentityScore === "number" && typeof identityScore === "number" && identityScore < policy.minIdentityScore) {
    issues.push(`identity_below_min:${identityScore.toFixed(2)}<${policy.minIdentityScore.toFixed(2)}`);
  }
  if (
    typeof policy.minFaceStabilityScore === "number" &&
    typeof faceStabilityScore === "number" &&
    faceStabilityScore < policy.minFaceStabilityScore
  ) {
    issues.push(`face_stability_below_min:${faceStabilityScore.toFixed(2)}<${policy.minFaceStabilityScore.toFixed(2)}`);
  }

  return {
    bundle: input.bundle,
    benchmark_kind: "presets",
    channel_domain: channelDomain,
    status: input.status,
    ready: issues.length === 0,
    issues,
    matrix_path: input.matrixPath,
    summary: bestOverall,
    selected_scenario: selectedScenario,
    selected_backend: null,
    policy
  };
}

function validateBackendBundle(input: {
  bundle: MultiChannelBundleName;
  status: string;
  matrixPath: string | null;
  matrix: Record<string, unknown> | null;
}): MultiChannelBundleValidationResult {
  const policy = resolveBundlePolicy(input.bundle);
  const issues: string[] = [];
  const scenarios = Array.isArray(input.matrix?.scenarios)
    ? input.matrix.scenarios.map((entry) => asRecord(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
  const selectedBackend =
    scenarios
      .filter((entry) => asString(entry.backend) !== "still_placeholder")
      .sort((left, right) => {
        const leftSuccess = left.success === true ? 1 : 0;
        const rightSuccess = right.success === true ? 1 : 0;
        if (rightSuccess !== leftSuccess) {
          return rightSuccess - leftSuccess;
        }
        const leftAcceptance = asNumber(left.acceptance_rate) ?? 0;
        const rightAcceptance = asNumber(right.acceptance_rate) ?? 0;
        return rightAcceptance - leftAcceptance;
      })[0] ?? null;
  const channelDomain =
    (asString(input.matrix?.channel_domain) as "economy" | "medical" | null) ??
    (input.bundle === "medical" ? "medical" : "economy");

  if (input.status !== "completed") {
    issues.push(`bundle_status:${input.status}`);
  }
  if (!input.matrixPath || !input.matrix) {
    issues.push("matrix_missing");
  }
  if (!selectedBackend) {
    issues.push("no_generative_backend_result");
  } else {
    if (selectedBackend.success !== true) {
      issues.push("no_successful_generative_backend");
    }
    const acceptanceRate = asNumber(selectedBackend.acceptance_rate);
    if (typeof acceptanceRate === "number" && acceptanceRate < 1) {
      issues.push(`acceptance_rate_below_one:${acceptanceRate.toFixed(2)}`);
    }
  }

  return {
    bundle: input.bundle,
    benchmark_kind: "backends",
    channel_domain: channelDomain,
    status: input.status,
    ready: issues.length === 0,
    issues,
    matrix_path: input.matrixPath,
    summary: selectedBackend,
    selected_scenario: null,
    selected_backend: selectedBackend,
    policy
  };
}

export function validateMultiChannelBenchmarks(input: {
  summaryPath: string;
}): MultiChannelBenchmarkValidationReport {
  const parsed = asRecord(readJson(input.summaryPath));
  if (!parsed) {
    throw new Error(`invalid multi-channel benchmark summary: ${input.summaryPath}`);
  }
  const benchmarkKind = (asString(parsed.benchmark_kind) === "backends" ? "backends" : "presets") as MultiChannelBenchmarkKind;
  const bundlesRaw = Array.isArray(parsed.bundles) ? parsed.bundles : [];
  const bundleResults = bundlesRaw.map((entry) => {
    const bundleRecord = asRecord(entry) ?? {};
    const bundle = (asString(bundleRecord.bundle) === "medical" ? "medical" : "economy") as MultiChannelBundleName;
    const matrixPath = asString(bundleRecord.matrix_path);
    const matrix = matrixPath && fs.existsSync(matrixPath) ? asRecord(readJson(matrixPath)) : null;
    const status = asString(bundleRecord.status) ?? "missing";
    return benchmarkKind === "backends"
      ? validateBackendBundle({
          bundle,
          status,
          matrixPath,
          matrix
        })
      : validatePresetBundle({
          bundle,
          status,
          matrixPath,
          matrix
        });
  });
  const crossChannel = validateCrossChannelComparison(benchmarkKind, bundleResults);

  return {
    schema_version: "1.0",
    benchmark_kind: benchmarkKind,
    ready: bundleResults.length > 0 && bundleResults.every((bundle) => bundle.ready) && crossChannel.ready,
    summary_path: input.summaryPath,
    bundle_count: bundleResults.length,
    bundles: bundleResults,
    cross_channel: crossChannel
  };
}
