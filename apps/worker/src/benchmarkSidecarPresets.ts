import { bootstrapEnv } from "./bootstrapEnv";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveSidecarBackendCapability,
  resolveSidecarBackendSmokeTimeoutMs
} from "./generatedSidecar";
import {
  SIDECAR_CONTROLNET_PRESET_MANIFEST,
  SIDECAR_IMPACT_PRESET_MANIFEST,
  SIDECAR_PRESET_MANIFEST_VERSION,
  SIDECAR_QC_PRESET_MANIFEST
} from "./sidecarPresetManifest";
import {
  buildRuntimeSidecarPresetRolloutFile,
  writeRuntimeSidecarPresetRolloutArtifacts
} from "./sidecarPresetRolloutArtifact";
import { buildSidecarBenchmarkRow, type SidecarBenchmarkRow } from "./sidecarBenchmarkSchema";
import { resolveSmokeProfileSelection, toSmokeProfileArgs } from "./sidecarSmokeProfiles";
import { runSidecarSmokePreflight } from "./sidecarSmokePreflight";
import { ensureSidecarSmokeCharacterPack } from "./sidecarSmokeCharacterPack";
import { PrismaClient } from "@prisma/client";
import type { SidecarControlNetPresetId, SidecarImpactPresetId, SidecarQcPresetId } from "@ec/profiles";

bootstrapEnv();

type BenchmarkPresetScenario = {
  name: string;
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
};

type PresetBenchmarkRawResult = {
  scenario: string;
  backend: string | null;
  renderer: string;
  success: boolean;
  failure: string | null;
  exitCode: number | null;
  spawnError: string | null;
  latency_ms: number;
  scenario_timeout_ms: number | null;
  smoke_timeout_ms: number | null;
  fixture_path: string;
  output_dir: string;
  smoke_report_path: string | null;
  profile_bundle: "economy" | "medical";
  studio_profile_id: string;
  channel_profile_id: string;
  mascot_profile_id: string;
  channel_domain: "economy" | "medical";
  information_priority: "clarity" | "empathy";
  finish_profile_id: string;
  premium_sidecar_frequency: string;
  controlnet_preset: SidecarControlNetPresetId;
  impact_preset: SidecarImpactPresetId;
  qc_preset: SidecarQcPresetId;
  preset_manifest_version: string;
  preset_rollout_source: string | null;
  preset_rollout_source_kind: "file" | "matrix" | null;
  preset_rollout_scenario: string | null;
  preset_rollout_score: number | null;
  preset_rollout_verdict: string | null;
  preset_rollout_target: "overall" | "balanced" | "strict" | null;
  preset_rollout_artifact_age_hours: number | null;
  preset_rollout_channel_domain: "economy" | "medical" | null;
  premium_candidate_judge_version: string | null;
  premium_candidate_count: number | null;
  premium_selected_candidate_id: string | null;
  premium_selected_candidate_objective: string | null;
  premium_selected_candidate_score: number | null;
  premium_candidate_selection_reason: string | null;
  premium_candidate_judge_path: string | null;
  premium_selected_seed_override: number | null;
  premium_actual_judge_version: string | null;
  premium_actual_candidate_count: number | null;
  premium_actual_selected_candidate_id: string | null;
  premium_actual_selected_candidate_objective: string | null;
  premium_actual_selected_candidate_score: number | null;
  premium_actual_selection_reason: string | null;
  premium_actual_judge_path: string | null;
  premium_actual_judge_policy_version: string | null;
  premium_actual_policy_accepted: boolean | null;
  premium_actual_policy_rejection_reasons: string[];
  premium_actual_retake_round: number | null;
  premium_actual_retake_count: number | null;
  premium_actual_visual_signal_mode: string | null;
  premium_actual_visual_signal_score: number | null;
  premium_actual_visual_signal_report_path: string | null;
  premium_actual_face_stability_score: number | null;
  premium_actual_motion_coherence_score: number | null;
  premium_actual_silhouette_readability_score: number | null;
  premium_actual_mascot_identity_preservation_score: number | null;
  premium_actual_subtitle_safe_score: number | null;
  premium_actual_chart_safe_score: number | null;
  effective_use_clip_vision: boolean | null;
  clip_vision_model_name: string | null;
  preflight_warnings: string[];
  sidecar_status: string | null;
  sidecar_renderer: string | null;
  accepted: boolean | null;
  judge_score: number | null;
  fallback_reason: string | null;
  fallback_count: number | null;
  retake_count: number | null;
  duration_sec: number | null;
  output_duration_sec: number | null;
  expected_duration_sec: number | null;
  duration_delta_sec: number | null;
  control_mode: string | null;
  resolution_profile: string | null;
  step_profile: string | null;
  cache_profile: string | null;
  sr_profile: string | null;
  workflow_binding: Record<string, unknown> | null;
  execution_profile: Record<string, unknown> | null;
  qc_passed: boolean | null;
  qc_reasons: string[];
  qc_warnings: string[];
  stdout_tail: string;
  stderr_tail: string;
};

type PresetBenchmarkScoredResult = PresetBenchmarkRawResult & {
  score: number;
  verdict: "recommended" | "acceptable" | "reject";
  score_breakdown: {
    base: number;
    latency_penalty: number;
    fallback_penalty: number;
    retake_penalty: number;
    qc_reason_penalty: number;
    qc_warning_penalty: number;
    duration_penalty: number;
  };
  recommendation_notes: string[];
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

function resolveLocalPath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resolvePnpmExecutable(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function readJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function resolveRenderer(): string {
  return (
    resolveArgValue("renderer") ??
    process.env.SMOKE_VIDEO_I2V_RENDERER?.trim() ??
    process.env.VIDEO_I2V_RENDERER?.trim() ??
    process.env.SMOKE_VIDEO_BROLL_RENDERER?.trim() ??
    process.env.VIDEO_BROLL_RENDERER?.trim() ??
    "comfyui-wan-i2v"
  );
}

function parseTruthy(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function shouldPromoteRollout(): boolean {
  return hasFlag("promote-rollout") || parseTruthy(process.env.BENCHMARK_PRESET_PROMOTE_ROLLOUT);
}

function shouldFastMode(): boolean {
  return hasFlag("fast-mode") || parseTruthy(process.env.BENCHMARK_PRESET_FAST_MODE);
}

function resolveScenarioTimeoutMs(): number | null {
  const raw = resolveArgValue("scenario-timeout-ms") ?? process.env.BENCHMARK_PRESET_SCENARIO_TIMEOUT_MS ?? "";
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function resolveDefaultSmokeTimeoutMs(renderer: string): number {
  return resolveSidecarBackendSmokeTimeoutMs(resolveSidecarBackendCapability(renderer), process.env);
}

function resolveScenarioTimeoutGraceMs(scenarioTimeoutMs: number | null): number {
  if (!scenarioTimeoutMs) {
    return 0;
  }
  const raw =
    resolveArgValue("scenario-timeout-grace-ms") ?? process.env.BENCHMARK_PRESET_SCENARIO_TIMEOUT_GRACE_MS ?? "";
  const parsed = Number.parseInt(raw.trim(), 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return Math.max(30_000, Math.min(90_000, Math.round(scenarioTimeoutMs * 0.2)));
}

function buildEconomyCuratedScenarios(): BenchmarkPresetScenario[] {
  return [
    {
      name: "economy_balanced_default",
      controlnetPreset: "pose_depth_balance_v1",
      impactPreset: "broadcast_cleanup_v1",
      qcPreset: "broadcast_balanced_v1"
    },
    {
      name: "economy_motion_canny_balanced",
      controlnetPreset: "pose_canny_balance_v1",
      impactPreset: "broadcast_cleanup_v1",
      qcPreset: "broadcast_balanced_v1"
    },
    {
      name: "economy_detail_identity_balanced",
      controlnetPreset: "pose_depth_balance_v1",
      impactPreset: "identity_repair_detail_v1",
      qcPreset: "broadcast_balanced_v1"
    },
    {
      name: "economy_profile_identity_strict",
      controlnetPreset: "profile_lineart_depth_v1",
      impactPreset: "identity_repair_detail_v1",
      qcPreset: "broadcast_identity_strict_v1"
    },
    {
      name: "economy_soft_clarity_balanced",
      controlnetPreset: "pose_depth_balance_v1",
      impactPreset: "soft_clarity_cleanup_v1",
      qcPreset: "broadcast_balanced_v1"
    }
  ];
}

function buildMedicalCuratedScenarios(): BenchmarkPresetScenario[] {
  return [
    {
      name: "medical_soft_default",
      controlnetPreset: "pose_depth_balance_v1",
      impactPreset: "soft_clarity_cleanup_v1",
      qcPreset: "broadcast_balanced_v1"
    },
    {
      name: "medical_soft_identity_balanced",
      controlnetPreset: "pose_depth_balance_v1",
      impactPreset: "soft_clarity_repair_v1",
      qcPreset: "broadcast_balanced_v1"
    },
    {
      name: "medical_profile_soft_identity",
      controlnetPreset: "profile_lineart_depth_v1",
      impactPreset: "soft_clarity_repair_v1",
      qcPreset: "broadcast_identity_strict_v1"
    },
    {
      name: "medical_identity_anchor_balanced",
      controlnetPreset: "pose_depth_balance_v1",
      impactPreset: "identity_repair_detail_v1",
      qcPreset: "broadcast_balanced_v1"
    },
    {
      name: "medical_profile_soft_cleanup",
      controlnetPreset: "profile_lineart_depth_v1",
      impactPreset: "soft_clarity_cleanup_v1",
      qcPreset: "broadcast_balanced_v1"
    }
  ];
}

function buildCuratedScenarios(profileBundle: "economy" | "medical"): BenchmarkPresetScenario[] {
  return profileBundle === "medical" ? buildMedicalCuratedScenarios() : buildEconomyCuratedScenarios();
}

function buildAllCombinationScenarios(): BenchmarkPresetScenario[] {
  const controlnets = Object.keys(SIDECAR_CONTROLNET_PRESET_MANIFEST) as SidecarControlNetPresetId[];
  const impacts = Object.keys(SIDECAR_IMPACT_PRESET_MANIFEST) as SidecarImpactPresetId[];
  const qcs = Object.keys(SIDECAR_QC_PRESET_MANIFEST) as SidecarQcPresetId[];
  const scenarios: BenchmarkPresetScenario[] = [];
  for (const controlnetPreset of controlnets) {
    for (const impactPreset of impacts) {
      for (const qcPreset of qcs) {
        scenarios.push({
          name: `${controlnetPreset}__${impactPreset}__${qcPreset}`,
          controlnetPreset,
          impactPreset,
          qcPreset
        });
      }
    }
  }
  return scenarios;
}

function parseBenchmarkPresetScenario(value: unknown): BenchmarkPresetScenario | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const name = asNonEmptyString(record.name);
  const controlnetPreset = asNonEmptyString(record.controlnetPreset ?? record.controlnet_preset);
  const impactPreset = asNonEmptyString(record.impactPreset ?? record.impact_preset);
  const qcPreset = asNonEmptyString(record.qcPreset ?? record.qc_preset);
  if (
    !name ||
    !controlnetPreset ||
    !impactPreset ||
    !qcPreset ||
    !(controlnetPreset in SIDECAR_CONTROLNET_PRESET_MANIFEST) ||
    !(impactPreset in SIDECAR_IMPACT_PRESET_MANIFEST) ||
    !(qcPreset in SIDECAR_QC_PRESET_MANIFEST)
  ) {
    return null;
  }
  return {
    name,
    controlnetPreset: controlnetPreset as SidecarControlNetPresetId,
    impactPreset: impactPreset as SidecarImpactPresetId,
    qcPreset: qcPreset as SidecarQcPresetId
  };
}

function resolveScenarioFileSelection(): { name: string; scenarios: BenchmarkPresetScenario[] } | null {
  const scenarioFilePath = resolveArgValue("scenario-file") ?? process.env.BENCHMARK_PRESET_SCENARIO_FILE ?? "";
  if (!scenarioFilePath.trim()) {
    return null;
  }
  const resolvedPath = resolveLocalPath(scenarioFilePath.trim());
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Benchmark preset scenario file not found: ${resolvedPath}`);
  }
  const parsed = readJson(resolvedPath);
  const parsedRecord = asRecord(parsed);
  const scenariosRaw = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsedRecord?.scenarios)
      ? parsedRecord.scenarios
      : null;
  if (!scenariosRaw) {
    throw new Error(`Benchmark preset scenario file is invalid: ${resolvedPath}`);
  }
  const scenarios = scenariosRaw
    .map((entry) => parseBenchmarkPresetScenario(entry))
    .filter((entry): entry is BenchmarkPresetScenario => Boolean(entry));
  if (scenarios.length === 0) {
    throw new Error(`Benchmark preset scenario file did not contain any valid scenarios: ${resolvedPath}`);
  }
  const uniqueScenarios = Array.from(new Map(scenarios.map((scenario) => [scenario.name, scenario])).values());
  return {
    name: `file:${asNonEmptyString(parsedRecord?.name) ?? path.basename(resolvedPath, path.extname(resolvedPath))}`,
    scenarios: uniqueScenarios
  };
}

function resolveScenarioSet(profileBundle: "economy" | "medical"): { name: string; scenarios: BenchmarkPresetScenario[] } {
  const scenarioFileSelection = resolveScenarioFileSelection();
  if (scenarioFileSelection) {
    return scenarioFileSelection;
  }
  const scenarioSet = (resolveArgValue("scenario-set") ?? process.env.BENCHMARK_PRESET_SCENARIO_SET ?? "curated").trim();
  if (scenarioSet === "all") {
    return {
      name: "all",
      scenarios: buildAllCombinationScenarios()
    };
  }
  return {
    name: `curated:${profileBundle}`,
    scenarios: buildCuratedScenarios(profileBundle)
  };
}

function resolveScenarioSelection(input: {
  name: string;
  scenarios: BenchmarkPresetScenario[];
  fastMode: boolean;
}): { name: string; scenarios: BenchmarkPresetScenario[] } {
  const scenarioFilterRaw = resolveArgValue("scenario") ?? process.env.BENCHMARK_PRESET_SCENARIO ?? "";
  const maxScenariosRaw = resolveArgValue("max-scenarios") ?? process.env.BENCHMARK_PRESET_MAX_SCENARIOS ?? "";
  let scenarios = [...input.scenarios];
  let name = input.name;

  if (scenarioFilterRaw.trim().length > 0) {
    const selectedNames = scenarioFilterRaw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const selectedNameSet = new Set(selectedNames);
    scenarios = scenarios.filter((scenario) => selectedNameSet.has(scenario.name));
    if (scenarios.length === 0) {
      throw new Error(`No benchmark preset scenarios matched: ${selectedNames.join(", ")}`);
    }
    name = `${name}:filtered`;
  }

  const maxScenarios = Number.parseInt(maxScenariosRaw, 10);
  if (Number.isFinite(maxScenarios) && maxScenarios > 0 && scenarios.length > maxScenarios) {
    scenarios = scenarios.slice(0, maxScenarios);
    name = `${name}:top${maxScenarios}`;
  } else if (
    input.fastMode &&
    scenarioFilterRaw.trim().length === 0 &&
    scenarios.length > 1
  ) {
    scenarios = scenarios.slice(0, 1);
    name = `${name}:fast1`;
  }

  return {
    name,
    scenarios
  };
}

function scorePresetResult(result: PresetBenchmarkRawResult): PresetBenchmarkScoredResult {
  const base =
    (result.success ? 50 : 0) +
    (result.qc_passed === true ? 25 : 0) +
    (result.sidecar_status === "resolved" ? 15 : 0) +
    (result.sidecar_renderer ? 5 : 0) +
    (result.spawnError ? 0 : 5);
  const fallbackPenalty = Math.max(0, result.fallback_count ?? 0) * 8;
  const retakePenalty = Math.max(0, result.retake_count ?? 0) * 4;
  const qcReasonPenalty = result.qc_reasons.length * 6;
  const qcWarningPenalty = Math.min(8, result.qc_warnings.length * 2);
  const durationPenalty =
    typeof result.duration_delta_sec === "number" ? Math.min(20, round(result.duration_delta_sec * 10, 2)) : 6;
  const latencyPenalty = Math.min(15, round(result.latency_ms / 20000, 2));
  const visualSignalBonus =
    typeof result.premium_actual_visual_signal_score === "number"
      ? clamp(round((result.premium_actual_visual_signal_score - 50) * 0.28), 0, 12)
      : 0;
  const subtitlePenalty =
    result.channel_domain === "medical" && typeof result.premium_actual_subtitle_safe_score === "number"
      ? clamp(round((72 - result.premium_actual_subtitle_safe_score) * 0.25), 0, 8)
      : typeof result.premium_actual_subtitle_safe_score === "number"
        ? clamp(round((68 - result.premium_actual_subtitle_safe_score) * 0.18), 0, 6)
        : 0;
  const chartPenalty =
    result.channel_domain === "economy" && typeof result.premium_actual_chart_safe_score === "number"
      ? clamp(round((72 - result.premium_actual_chart_safe_score) * 0.25), 0, 8)
      : 0;
  const identityPenalty =
    result.channel_domain === "medical" &&
    typeof result.premium_actual_mascot_identity_preservation_score === "number"
      ? clamp(round((72 - result.premium_actual_mascot_identity_preservation_score) * 0.24), 0, 8)
      : typeof result.premium_actual_mascot_identity_preservation_score === "number"
        ? clamp(round((64 - result.premium_actual_mascot_identity_preservation_score) * 0.14), 0, 4)
        : 0;
  const facePenalty =
    typeof result.premium_actual_face_stability_score === "number"
      ? clamp(
          round(
            ((result.channel_domain === "medical" ? 70 : 64) - result.premium_actual_face_stability_score) *
              (result.channel_domain === "medical" ? 0.2 : 0.12)
          ),
          0,
          result.channel_domain === "medical" ? 6 : 4
        )
      : 0;
  const score = clamp(
    round(
      base +
        visualSignalBonus -
        fallbackPenalty -
        retakePenalty -
        qcReasonPenalty -
        qcWarningPenalty -
        durationPenalty -
        latencyPenalty -
        subtitlePenalty -
        chartPenalty -
        identityPenalty -
        facePenalty
    ),
    0,
    100
  );
  const notes: string[] = [];
  if (result.qc_passed === true) {
    notes.push("qc_pass");
  } else if (result.qc_passed === false) {
    notes.push("qc_failed");
  }
  if ((result.fallback_count ?? 0) > 0) {
    notes.push(`fallbacks:${result.fallback_count}`);
  }
  if ((result.retake_count ?? 0) > 0) {
    notes.push(`retakes:${result.retake_count}`);
  }
  if (typeof result.duration_delta_sec === "number") {
    notes.push(`duration_delta:${result.duration_delta_sec.toFixed(2)}s`);
  }
  if (typeof result.premium_actual_visual_signal_score === "number") {
    notes.push(`visual_signal:${result.premium_actual_visual_signal_score.toFixed(2)}`);
  }
  if (result.channel_domain === "economy" && typeof result.premium_actual_chart_safe_score === "number") {
    notes.push(`chart_safe:${result.premium_actual_chart_safe_score.toFixed(2)}`);
  }
  if (result.channel_domain === "medical" && typeof result.premium_actual_mascot_identity_preservation_score === "number") {
    notes.push(`identity:${result.premium_actual_mascot_identity_preservation_score.toFixed(2)}`);
  }
  if (result.qc_reasons.length > 0) {
    notes.push(`qc_reasons:${result.qc_reasons.join("|")}`);
  }

  let verdict: PresetBenchmarkScoredResult["verdict"] = "reject";
  if (score >= 85 && result.success && result.qc_passed === true && (result.fallback_count ?? 0) === 0) {
    verdict = "recommended";
  } else if (score >= 60 && result.success) {
    verdict = "acceptable";
  }

  return {
    ...result,
    score,
    verdict,
    score_breakdown: {
      base,
      latency_penalty: latencyPenalty,
      fallback_penalty: fallbackPenalty,
      retake_penalty: retakePenalty,
      qc_reason_penalty: qcReasonPenalty,
      qc_warning_penalty: qcWarningPenalty,
      duration_penalty: durationPenalty
    },
    recommendation_notes: notes
  };
}

function rankPresetResults(results: PresetBenchmarkScoredResult[]): PresetBenchmarkScoredResult[] {
  return [...results].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if ((left.fallback_count ?? 0) !== (right.fallback_count ?? 0)) {
      return (left.fallback_count ?? 0) - (right.fallback_count ?? 0);
    }
    if ((left.retake_count ?? 0) !== (right.retake_count ?? 0)) {
      return (left.retake_count ?? 0) - (right.retake_count ?? 0);
    }
    if (left.latency_ms !== right.latency_ms) {
      return left.latency_ms - right.latency_ms;
    }
    return left.scenario.localeCompare(right.scenario, "en");
  });
}

function summarizeTopScenario(result: PresetBenchmarkScoredResult | null) {
  if (!result) {
    return null;
  }
  return {
    scenario: result.scenario,
    score: result.score,
    verdict: result.verdict,
    controlnet_preset: result.controlnet_preset,
    impact_preset: result.impact_preset,
    qc_preset: result.qc_preset,
    latency_ms: result.latency_ms,
    fallback_count: result.fallback_count,
    retake_count: result.retake_count,
    qc_passed: result.qc_passed,
    duration_delta_sec: result.duration_delta_sec
  };
}

function selectBestScenario(
  results: PresetBenchmarkScoredResult[],
  predicate: (result: PresetBenchmarkScoredResult) => boolean
): PresetBenchmarkScoredResult | null {
  return results.find(predicate) ?? null;
}

function buildBestByKey(
  results: PresetBenchmarkScoredResult[],
  key: "controlnet_preset" | "impact_preset" | "qc_preset"
): Record<string, ReturnType<typeof summarizeTopScenario>> {
  const values = [...new Set(results.map((result) => result[key]))];
  return Object.fromEntries(
    values.map((value) => [value, summarizeTopScenario(selectBestScenario(results, (result) => result[key] === value))])
  );
}

function buildPresetBenchmarkMarkdown(input: {
  fixturePath: string;
  characterPackId: string;
  renderer: string;
  scenarioSetName: string;
  profileBundle: "economy" | "medical";
  channelDomain: "economy" | "medical";
  rankedResults: PresetBenchmarkScoredResult[];
}) {
  const top = input.rankedResults.slice(0, 5);
  const balanced = summarizeTopScenario(
    selectBestScenario(input.rankedResults, (result) => result.qc_preset === "broadcast_balanced_v1")
  );
  const strict = summarizeTopScenario(
    selectBestScenario(input.rankedResults, (result) => result.qc_preset === "broadcast_identity_strict_v1")
  );
  const lines = [
    "# Sidecar Preset Benchmark",
    "",
    `- Renderer: \`${input.renderer}\``,
    `- Fixture: \`${input.fixturePath}\``,
    `- Character Pack: \`${input.characterPackId}\``,
    `- Scenario Set: \`${input.scenarioSetName}\``,
    `- Profile Bundle: \`${input.profileBundle}\``,
    `- Channel Domain: \`${input.channelDomain}\``,
    "",
    "## Recommendations",
    "",
    `- Best Overall: ${
      top[0]
        ? `\`${top[0].scenario}\` (score ${top[0].score}, ${top[0].controlnet_preset} / ${top[0].impact_preset} / ${top[0].qc_preset})`
        : "none"
    }`,
    `- Best Balanced QC: ${
      balanced ? `\`${balanced.scenario}\` (score ${balanced.score})` : "none"
    }`,
    `- Best Strict QC: ${strict ? `\`${strict.scenario}\` (score ${strict.score})` : "none"}`,
    "",
    "## Top Scenarios",
    "",
    "| Rank | Scenario | Score | Verdict | Latency ms | Fallbacks | Retakes | QC | Duration Delta s |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: | --- | ---: |",
    ...top.map(
      (result, index) =>
        `| ${index + 1} | \`${result.scenario}\` | ${result.score} | ${result.verdict} | ${result.latency_ms} | ${
          result.fallback_count ?? 0
        } | ${result.retake_count ?? 0} | ${result.qc_passed === true ? "pass" : result.qc_passed === false ? "fail" : "n/a"} | ${
          typeof result.duration_delta_sec === "number" ? result.duration_delta_sec.toFixed(2) : "n/a"
        } |`
    ),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const fixturePath = resolveLocalPath(
    resolveArgValue("fixture") ?? path.join(repoRoot, "scripts", "fixtures", "video_i2v_smoke_shots.json")
  );
  const renderer = resolveRenderer();
  const profileSelection = resolveSmokeProfileSelection({ resolveArgValue });
  const outDir = resolveLocalPath(
    resolveArgValue("out-dir") ?? path.join(repoRoot, "out", "preset_benchmarks", "video_i2v")
  );
  const requestedCharacterPackId =
    resolveArgValue("character-pack-id") ?? process.env.SMOKE_VIDEO_BROLL_CHARACTER_PACK_ID?.trim() ?? "";
  if (!requestedCharacterPackId) {
    throw new Error("Missing character pack id. Set --character-pack-id=<packId> or SMOKE_VIDEO_BROLL_CHARACTER_PACK_ID.");
  }
  const prisma = new PrismaClient();
  const resolvedCharacterPack = await ensureSidecarSmokeCharacterPack({
    prisma,
    repoRoot,
    requestedPackId: requestedCharacterPackId,
    channelName: "Video Preset Benchmark"
  }).finally(async () => {
    await prisma.$disconnect();
  });
  const characterPackId = resolvedCharacterPack.characterPackId;
  const preflightResult = await runSidecarSmokePreflight({
    fixturePath,
    characterPackId,
    renderer,
    requireCharacterPack: true,
    requireApprovedCharacterPack: true
  });

  const expectedStatus = resolveArgValue("expected-status") ?? process.env.SMOKE_EXPECT_SIDECAR_STATUS?.trim() ?? "resolved";
  const fastMode = shouldFastMode();
  const scenarioSet = resolveScenarioSelection({
    ...resolveScenarioSet(profileSelection.bundleName),
    fastMode
  });
  const generatedAt = new Date().toISOString();
  const runId = `sidecar_preset_matrix:${Date.now()}`;
  const scenarioTimeoutMs = resolveScenarioTimeoutMs();
  const smokeTimeoutMs = scenarioTimeoutMs
    ? scenarioTimeoutMs + resolveScenarioTimeoutGraceMs(scenarioTimeoutMs)
    : resolveDefaultSmokeTimeoutMs(renderer);
  const pnpmExecutable = resolvePnpmExecutable();
  const rawResults: PresetBenchmarkRawResult[] = [];

  for (const scenario of scenarioSet.scenarios) {
    const scenarioOutDir = path.join(outDir, scenario.name);
    const startedAt = Date.now();
    const run = spawnSync(
      pnpmExecutable,
      [
        "-C",
        path.join(repoRoot, "apps", "worker"),
        "exec",
        "tsx",
        "src/smokeVideoBrollRender.ts",
        `--fixture=${fixturePath}`,
        `--out-dir=${scenarioOutDir}`,
        `--label=preset-${scenario.name}`,
        "--channel=Video Preset Benchmark",
        `--topic=Video Preset Benchmark ${scenario.name}`,
        ...toSmokeProfileArgs(profileSelection)
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        shell: process.platform === "win32",
        windowsHide: true,
        env: {
          ...process.env,
          SMOKE_VIDEO_BROLL_CHARACTER_PACK_ID: characterPackId,
          SMOKE_VIDEO_BROLL_RENDERER: renderer,
          SMOKE_VIDEO_I2V_RENDERER: renderer,
          SMOKE_VIDEO_S2V_RENDERER: renderer,
          SMOKE_VIDEO_OVERLAY_RENDERER: renderer,
          SMOKE_EXPECT_SIDECAR_STATUS: expectedStatus,
          SMOKE_CONTROLNET_PRESET: scenario.controlnetPreset,
          SMOKE_IMPACT_PRESET: scenario.impactPreset,
          SMOKE_QC_PRESET: scenario.qcPreset,
          SMOKE_VIDEO_BROLL_TIMEOUT_MS: String(smokeTimeoutMs),
          ...(fastMode
            ? {
                BENCHMARK_PRESET_FAST_MODE: "true",
                VIDEO_SIDECAR_BENCHMARK_FAST_MODE: "true",
                VIDEO_SIDECAR_PREMIUM_CANDIDATE_COUNT: "1",
                VIDEO_SIDECAR_PREMIUM_ACTUAL_CANDIDATE_COUNT: "1",
                VIDEO_HUNYUAN_PREMIUM_DEFAULT: "false"
              }
            : {})
        }
      }
    );
    const endedAt = Date.now();
    const reportPath = path.join(scenarioOutDir, "smoke_report.json");
    const report = asRecord(readJson(reportPath));
    const sidecarArtifacts = Array.isArray(report?.sidecar_artifacts) ? report.sidecar_artifacts : [];
    const firstArtifact = asRecord(sidecarArtifacts[0] ?? null);
    const qcEvaluation = asRecord(firstArtifact?.qc_evaluation ?? null);
    const executionProfile = asRecord(firstArtifact?.execution_profile ?? null);
    const workflowBinding = asRecord(firstArtifact?.workflow_binding ?? null);
    const expectedDurationSeconds = asFiniteNumber(qcEvaluation?.expectedDurationSeconds);
    const outputDurationSeconds =
      asFiniteNumber(firstArtifact?.output_duration_sec) ?? asFiniteNumber(qcEvaluation?.outputDurationSeconds);
    const durationDeltaSeconds =
      typeof expectedDurationSeconds === "number" && typeof outputDurationSeconds === "number"
        ? round(Math.abs(outputDurationSeconds - expectedDurationSeconds))
        : null;
    const sidecarFallbackCount =
      typeof report?.sidecar_fallback_count === "number" ? Number(report.sidecar_fallback_count) : null;
    const sidecarRetakeCount =
      typeof report?.sidecar_retake_count === "number" ? Number(report.sidecar_retake_count) : null;
    const sidecarStatus = typeof report?.sidecar_status === "string" ? report.sidecar_status : null;
    const effectiveSuccess = sidecarStatus === expectedStatus && run.status === 0;
    rawResults.push({
      scenario: scenario.name,
      backend: typeof firstArtifact?.backend === "string" ? firstArtifact.backend : null,
      renderer,
      success: effectiveSuccess,
      failure: typeof firstArtifact?.failure === "string" ? firstArtifact.failure : null,
      exitCode: run.status,
      spawnError: run.error ? String(run.error) : null,
      latency_ms: endedAt - startedAt,
      scenario_timeout_ms: scenarioTimeoutMs,
      smoke_timeout_ms: smokeTimeoutMs,
      fixture_path: fixturePath,
      output_dir: scenarioOutDir,
      smoke_report_path: fs.existsSync(reportPath) ? reportPath : null,
      profile_bundle: profileSelection.bundleName,
      studio_profile_id: profileSelection.selection.studio_profile_id,
      channel_profile_id: profileSelection.selection.channel_profile_id,
      mascot_profile_id: profileSelection.selection.mascot_profile_id,
      channel_domain: profileSelection.resolvedProfiles.channel.domain,
      information_priority: profileSelection.resolvedProfiles.channel.information_priority,
      finish_profile_id: profileSelection.resolvedProfiles.channel.finish_profile_id,
      premium_sidecar_frequency: profileSelection.resolvedProfiles.channel.premium_sidecar_frequency,
      controlnet_preset: scenario.controlnetPreset,
      impact_preset: scenario.impactPreset,
      qc_preset: scenario.qcPreset,
      preset_manifest_version:
        typeof firstArtifact?.preset_manifest_version === "string"
          ? firstArtifact.preset_manifest_version
          : SIDECAR_PRESET_MANIFEST_VERSION,
      preset_rollout_source:
        typeof firstArtifact?.preset_rollout_source === "string" ? firstArtifact.preset_rollout_source : null,
      preset_rollout_source_kind:
        firstArtifact?.preset_rollout_source_kind === "file" || firstArtifact?.preset_rollout_source_kind === "matrix"
          ? firstArtifact.preset_rollout_source_kind
          : null,
      preset_rollout_scenario:
        typeof firstArtifact?.preset_rollout_scenario === "string" ? firstArtifact.preset_rollout_scenario : null,
      preset_rollout_score:
        typeof firstArtifact?.preset_rollout_score === "number" ? Number(firstArtifact.preset_rollout_score) : null,
      preset_rollout_verdict:
        typeof firstArtifact?.preset_rollout_verdict === "string" ? firstArtifact.preset_rollout_verdict : null,
      preset_rollout_target:
        firstArtifact?.preset_rollout_target === "overall" ||
        firstArtifact?.preset_rollout_target === "balanced" ||
        firstArtifact?.preset_rollout_target === "strict"
          ? firstArtifact.preset_rollout_target
          : null,
      preset_rollout_artifact_age_hours:
        typeof firstArtifact?.preset_rollout_artifact_age_hours === "number"
          ? Number(firstArtifact.preset_rollout_artifact_age_hours)
          : null,
      preset_rollout_channel_domain:
        firstArtifact?.preset_rollout_channel_domain === "economy" ||
        firstArtifact?.preset_rollout_channel_domain === "medical"
          ? firstArtifact.preset_rollout_channel_domain
          : null,
      premium_candidate_judge_version:
        typeof firstArtifact?.premium_candidate_judge_version === "string"
          ? firstArtifact.premium_candidate_judge_version
          : null,
      premium_candidate_count:
        typeof firstArtifact?.premium_candidate_count === "number" ? Number(firstArtifact.premium_candidate_count) : null,
      premium_selected_candidate_id:
        typeof firstArtifact?.premium_selected_candidate_id === "string"
          ? firstArtifact.premium_selected_candidate_id
          : null,
      premium_selected_candidate_objective:
        typeof firstArtifact?.premium_selected_candidate_objective === "string"
          ? firstArtifact.premium_selected_candidate_objective
          : null,
      premium_selected_candidate_score:
        typeof firstArtifact?.premium_selected_candidate_score === "number"
          ? Number(firstArtifact.premium_selected_candidate_score)
          : null,
      premium_candidate_selection_reason:
        typeof firstArtifact?.premium_candidate_selection_reason === "string"
          ? firstArtifact.premium_candidate_selection_reason
          : null,
      premium_candidate_judge_path:
        typeof firstArtifact?.premium_candidate_judge_path === "string" ? firstArtifact.premium_candidate_judge_path : null,
      premium_selected_seed_override:
        typeof firstArtifact?.premium_selected_seed_override === "number"
          ? Number(firstArtifact.premium_selected_seed_override)
          : null,
      premium_actual_judge_version:
        typeof firstArtifact?.premium_actual_judge_version === "string"
          ? firstArtifact.premium_actual_judge_version
          : null,
      premium_actual_candidate_count:
        typeof firstArtifact?.premium_actual_candidate_count === "number"
          ? Number(firstArtifact.premium_actual_candidate_count)
          : null,
      premium_actual_selected_candidate_id:
        typeof firstArtifact?.premium_actual_selected_candidate_id === "string"
          ? firstArtifact.premium_actual_selected_candidate_id
          : null,
      premium_actual_selected_candidate_objective:
        typeof firstArtifact?.premium_actual_selected_candidate_objective === "string"
          ? firstArtifact.premium_actual_selected_candidate_objective
          : null,
      premium_actual_selected_candidate_score:
        typeof firstArtifact?.premium_actual_selected_candidate_score === "number"
          ? Number(firstArtifact.premium_actual_selected_candidate_score)
          : null,
      premium_actual_selection_reason:
        typeof firstArtifact?.premium_actual_selection_reason === "string"
          ? firstArtifact.premium_actual_selection_reason
          : null,
      premium_actual_judge_path:
        typeof firstArtifact?.premium_actual_judge_path === "string" ? firstArtifact.premium_actual_judge_path : null,
      premium_actual_judge_policy_version:
        typeof firstArtifact?.premium_actual_judge_policy_version === "string"
          ? firstArtifact.premium_actual_judge_policy_version
          : null,
      premium_actual_policy_accepted:
        typeof firstArtifact?.premium_actual_policy_accepted === "boolean"
          ? firstArtifact.premium_actual_policy_accepted
          : null,
      premium_actual_policy_rejection_reasons: Array.isArray(firstArtifact?.premium_actual_policy_rejection_reasons)
        ? firstArtifact.premium_actual_policy_rejection_reasons.filter((value): value is string => typeof value === "string")
        : [],
      premium_actual_retake_round:
        typeof firstArtifact?.premium_actual_retake_round === "number"
          ? Number(firstArtifact.premium_actual_retake_round)
          : null,
      premium_actual_retake_count:
        typeof firstArtifact?.premium_actual_retake_count === "number"
          ? Number(firstArtifact.premium_actual_retake_count)
          : null,
      premium_actual_visual_signal_mode:
        typeof firstArtifact?.premium_actual_visual_signal_mode === "string"
          ? firstArtifact.premium_actual_visual_signal_mode
          : null,
      premium_actual_visual_signal_score:
        typeof firstArtifact?.premium_actual_visual_signal_score === "number"
          ? Number(firstArtifact.premium_actual_visual_signal_score)
          : null,
      premium_actual_visual_signal_report_path:
        typeof firstArtifact?.premium_actual_visual_signal_report_path === "string"
          ? firstArtifact.premium_actual_visual_signal_report_path
          : null,
      premium_actual_face_stability_score:
        typeof firstArtifact?.premium_actual_face_stability_score === "number"
          ? Number(firstArtifact.premium_actual_face_stability_score)
          : null,
      premium_actual_motion_coherence_score:
        typeof firstArtifact?.premium_actual_motion_coherence_score === "number"
          ? Number(firstArtifact.premium_actual_motion_coherence_score)
          : null,
      premium_actual_silhouette_readability_score:
        typeof firstArtifact?.premium_actual_silhouette_readability_score === "number"
          ? Number(firstArtifact.premium_actual_silhouette_readability_score)
          : null,
      premium_actual_mascot_identity_preservation_score:
        typeof firstArtifact?.premium_actual_mascot_identity_preservation_score === "number"
          ? Number(firstArtifact.premium_actual_mascot_identity_preservation_score)
          : null,
      premium_actual_subtitle_safe_score:
        typeof firstArtifact?.premium_actual_subtitle_safe_score === "number"
          ? Number(firstArtifact.premium_actual_subtitle_safe_score)
          : null,
      premium_actual_chart_safe_score:
        typeof firstArtifact?.premium_actual_chart_safe_score === "number"
          ? Number(firstArtifact.premium_actual_chart_safe_score)
          : null,
      effective_use_clip_vision:
        typeof firstArtifact?.effective_use_clip_vision === "boolean" ? firstArtifact.effective_use_clip_vision : null,
      clip_vision_model_name:
        typeof firstArtifact?.clip_vision_model_name === "string" ? firstArtifact.clip_vision_model_name : null,
      preflight_warnings: Array.isArray(firstArtifact?.preflight_warnings)
        ? firstArtifact.preflight_warnings.filter((value): value is string => typeof value === "string")
        : [],
      sidecar_status: sidecarStatus,
      sidecar_renderer: typeof report?.sidecar_renderer === "string" ? report.sidecar_renderer : null,
      accepted: typeof firstArtifact?.accepted === "boolean" ? firstArtifact.accepted : null,
      judge_score: typeof firstArtifact?.judge_score === "number" ? firstArtifact.judge_score : null,
      fallback_reason: typeof firstArtifact?.fallback_reason === "string" ? firstArtifact.fallback_reason : null,
      fallback_count: sidecarFallbackCount,
      retake_count: sidecarRetakeCount,
      duration_sec: typeof firstArtifact?.duration_sec === "number" ? firstArtifact.duration_sec : outputDurationSeconds,
      output_duration_sec: outputDurationSeconds,
      expected_duration_sec: expectedDurationSeconds,
      duration_delta_sec: durationDeltaSeconds,
      control_mode: typeof firstArtifact?.control_mode === "string" ? firstArtifact.control_mode : null,
      resolution_profile:
        typeof firstArtifact?.resolution_profile === "string" ? firstArtifact.resolution_profile : null,
      step_profile: typeof firstArtifact?.step_profile === "string" ? firstArtifact.step_profile : null,
      cache_profile: typeof firstArtifact?.cache_profile === "string" ? firstArtifact.cache_profile : null,
      sr_profile: typeof firstArtifact?.sr_profile === "string" ? firstArtifact.sr_profile : null,
      workflow_binding: workflowBinding,
      execution_profile: executionProfile,
      qc_passed: typeof qcEvaluation?.passed === "boolean" ? qcEvaluation.passed : null,
      qc_reasons: Array.isArray(qcEvaluation?.reasons) ? qcEvaluation.reasons : [],
      qc_warnings: Array.isArray(qcEvaluation?.warnings) ? qcEvaluation.warnings : [],
      stdout_tail: (run.stdout || "").split(/\r?\n/).slice(-20).join("\n"),
      stderr_tail: (run.stderr || "").split(/\r?\n/).slice(-20).join("\n")
    });
  }

  const rankedResults = rankPresetResults(rawResults.map((result) => scorePresetResult(result)));
  const rows: SidecarBenchmarkRow[] = rankedResults.map((result) =>
    buildSidecarBenchmarkRow({
      benchmarkKind: "sidecar_preset_matrix",
      runId,
      generatedAt,
      scenarioId: result.scenario,
      scenarioGroup: "preset",
      scenarioLabel: result.scenario,
      channelDomain: result.channel_domain,
      profileBundle: result.profile_bundle,
      backend: result.backend,
      renderer: result.renderer,
      requestedBackend: result.backend,
      actualBackend: result.backend,
      success: result.success,
      failure: result.failure,
      latencyMs: result.latency_ms,
      durationSec: result.duration_sec,
      resolutionProfile: result.resolution_profile,
      stepProfile: result.step_profile,
      cacheProfile: result.cache_profile,
      srProfile: result.sr_profile,
      accepted: result.accepted,
      judgeDecision: result.success ? "accepted" : "rejected",
      judgeScore: result.judge_score ?? result.score,
      fallbackReason: result.fallback_reason,
      retakeCount: result.retake_count,
      candidateCount: result.premium_actual_candidate_count ?? result.premium_candidate_count,
      selectedCandidateId: result.premium_actual_selected_candidate_id ?? result.premium_selected_candidate_id,
      controlnetPreset: result.controlnet_preset,
      impactPreset: result.impact_preset,
      qcPreset: result.qc_preset,
      outputDurationSec: result.output_duration_sec,
      expectedDurationSec: result.expected_duration_sec,
      durationDeltaSec: result.duration_delta_sec,
      qcPassed: result.qc_passed,
      qcReasons: result.qc_reasons,
      qcWarnings: result.qc_warnings,
      preflightWarnings: result.preflight_warnings,
      artifacts: {
        plan_path: null,
        preflight_path: null,
        workflow_path: null,
        result_path: null,
        video_path: null,
        judge_path: result.premium_actual_judge_path ?? result.premium_candidate_judge_path
      },
      extras: {
        verdict: result.verdict,
        score: result.score,
        score_breakdown: result.score_breakdown,
        recommendation_notes: result.recommendation_notes,
        fixture_path: result.fixture_path,
        output_dir: result.output_dir,
        smoke_report_path: result.smoke_report_path,
        profile_ids: {
          studio_profile_id: result.studio_profile_id,
          channel_profile_id: result.channel_profile_id,
          mascot_profile_id: result.mascot_profile_id
        },
        information_priority: result.information_priority,
        finish_profile_id: result.finish_profile_id,
        premium_sidecar_frequency: result.premium_sidecar_frequency,
        preset_manifest_version: result.preset_manifest_version,
        preset_rollout_source: result.preset_rollout_source,
        preset_rollout_source_kind: result.preset_rollout_source_kind,
        preset_rollout_scenario: result.preset_rollout_scenario,
        preset_rollout_score: result.preset_rollout_score,
        preset_rollout_verdict: result.preset_rollout_verdict,
        preset_rollout_target: result.preset_rollout_target,
        preset_rollout_artifact_age_hours: result.preset_rollout_artifact_age_hours,
        premium_actual_policy_accepted: result.premium_actual_policy_accepted,
        premium_actual_policy_rejection_reasons: result.premium_actual_policy_rejection_reasons,
        premium_actual_retake_round: result.premium_actual_retake_round,
        premium_actual_retake_count: result.premium_actual_retake_count
      }
    })
  );
  const bestOverall = summarizeTopScenario(rankedResults[0] ?? null);
  const recommendationSummary = {
    best_overall: bestOverall,
    best_balanced_qc: summarizeTopScenario(
      selectBestScenario(rankedResults, (result) => result.qc_preset === "broadcast_balanced_v1")
    ),
    best_strict_qc: summarizeTopScenario(
      selectBestScenario(rankedResults, (result) => result.qc_preset === "broadcast_identity_strict_v1")
    ),
    best_by_controlnet_preset: buildBestByKey(rankedResults, "controlnet_preset"),
    best_by_impact_preset: buildBestByKey(rankedResults, "impact_preset"),
    best_by_qc_preset: buildBestByKey(rankedResults, "qc_preset")
  };

  const matrixPath = path.join(outDir, "preset_benchmark_matrix.json");
  writeJson(matrixPath, {
    schema_version: "1.1",
    generated_at: generatedAt,
    fixture_path: fixturePath,
    character_pack_id: characterPackId,
    requested_character_pack_id: requestedCharacterPackId,
    resolved_character_pack: resolvedCharacterPack,
    preflight: preflightResult,
    renderer,
    profile_selection: profileSelection.selection,
    profile_bundle: profileSelection.bundleName,
    channel_domain: profileSelection.resolvedProfiles.channel.domain,
    benchmark_kind: "sidecar_preset_matrix",
    scenario_set: scenarioSet.name,
    scenario_count: scenarioSet.scenarios.length,
    fast_mode: fastMode,
    scenario_timeout_ms: scenarioTimeoutMs,
    smoke_timeout_ms: smokeTimeoutMs,
    expected_status: expectedStatus,
    score_formula_version: "preset_score_v1",
    recommendation_summary: recommendationSummary,
    scenarios: rankedResults,
    rows,
    comparison_dimensions: [
      "score",
      "verdict",
      "latency_ms",
      "success",
      "output_duration_sec",
      "duration_delta_sec",
      "fallback_count",
      "retake_count",
      "qc_passed"
    ]
  });

  const markdownPath = path.join(outDir, "preset_benchmark_summary.md");
  fs.writeFileSync(
    markdownPath,
    buildPresetBenchmarkMarkdown({
      fixturePath,
      characterPackId,
      renderer,
      scenarioSetName: scenarioSet.name,
      profileBundle: profileSelection.bundleName,
      channelDomain: profileSelection.resolvedProfiles.channel.domain,
      rankedResults
    }),
    "utf8"
  );
  const rolloutPath = path.join(outDir, "runtime_sidecar_preset_rollout.json");
  const rolloutEnvPath = path.join(outDir, "runtime_sidecar_preset_rollout.env");
  const rolloutJson = buildRuntimeSidecarPresetRolloutFile({
    recommendationSummary,
    defaultTarget: "overall",
    sourceMatrixPath: matrixPath,
    sourceRenderer: renderer,
    sourceFixturePath: fixturePath,
    sourceCharacterPackId: characterPackId,
    sourceScenarioSet: scenarioSet.name,
    scoreFormulaVersion: "preset_score_v1"
  });
  writeRuntimeSidecarPresetRolloutArtifacts({
    outputPath: rolloutPath,
    envPath: rolloutEnvPath,
    rolloutJson
  });

  console.log(`SIDECAR PRESET BENCHMARK: ${matrixPath}`);
  console.log(`SIDECAR PRESET SUMMARY: ${markdownPath}`);
  console.log(`SIDECAR PRESET ROLLOUT: ${rolloutPath}`);
  console.log(`SIDECAR PRESET ROLLOUT ENV: ${rolloutEnvPath}`);

  if (shouldPromoteRollout()) {
    const promotionOutputPath = resolveLocalPath(
      resolveArgValue("promotion-out") ??
        path.join(repoRoot, "out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.json")
    );
    const promotionEnvPath = resolveLocalPath(
      resolveArgValue("promotion-env-out") ??
        path.join(repoRoot, "out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.env")
    );
    const promotionReportPath = resolveLocalPath(
      resolveArgValue("promotion-report-out") ??
        path.join(repoRoot, "out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.promotion_report.json")
    );
    const promotionValidationReportPath = resolveLocalPath(
      resolveArgValue("promotion-validate-report-out") ??
        path.join(repoRoot, "out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.validation_report.json")
    );
    const promotionDefaultTarget = resolveArgValue("promotion-default-target");
    const promotionMinScore = resolveArgValue("promotion-min-score");
    const promotionAllowedVerdicts = resolveArgValue("promotion-allowed-verdicts");
    const promotionRequiredScenarioSet = resolveArgValue("promotion-require-scenario-set");
    const promotionMinScenarioCount = resolveArgValue("promotion-min-scenario-count");
    const promoteRun = spawnSync(
      pnpmExecutable,
      [
        "-C",
        path.join(repoRoot, "apps", "worker"),
        "exec",
        "tsx",
        "src/promoteSidecarPresetRollout.ts",
        `--matrix=${matrixPath}`,
        `--out=${promotionOutputPath}`,
        `--env-out=${promotionEnvPath}`,
        `--report-out=${promotionReportPath}`,
        ...(promotionDefaultTarget ? [`--default-target=${promotionDefaultTarget}`] : []),
        ...(promotionMinScore ? [`--min-score=${promotionMinScore}`] : []),
        ...(promotionAllowedVerdicts ? [`--allowed-verdicts=${promotionAllowedVerdicts}`] : []),
        ...(promotionRequiredScenarioSet ? [`--require-scenario-set=${promotionRequiredScenarioSet}`] : []),
        ...(promotionMinScenarioCount ? [`--min-scenario-count=${promotionMinScenarioCount}`] : [])
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        shell: process.platform === "win32",
        windowsHide: true,
        env: process.env
      }
    );
    if (promoteRun.status !== 0) {
      const stderr = (promoteRun.stderr || "").trim();
      const stdout = (promoteRun.stdout || "").trim();
      throw new Error(
        `preset rollout promotion failed: ${stderr || stdout || `exit code ${promoteRun.status ?? "unknown"}`}`
      );
    }
    const validateRun = spawnSync(
      pnpmExecutable,
      [
        "-C",
        path.join(repoRoot, "apps", "worker"),
        "exec",
        "tsx",
        "src/validateSidecarPresetRollout.ts",
        `--rollout-file=${promotionOutputPath}`,
        `--rollout-env=${promotionEnvPath}`,
        `--out=${promotionValidationReportPath}`,
        "--require-ready"
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        shell: process.platform === "win32",
        windowsHide: true,
        env: process.env
      }
    );
    if (validateRun.status !== 0) {
      const stderr = (validateRun.stderr || "").trim();
      const stdout = (validateRun.stdout || "").trim();
      throw new Error(
        `promoted rollout validation failed: ${stderr || stdout || `exit code ${validateRun.status ?? "unknown"}`}`
      );
    }
    console.log(`SIDECAR PRESET PROMOTED ROLLOUT: ${promotionOutputPath}`);
    console.log(`SIDECAR PRESET PROMOTION REPORT: ${promotionReportPath}`);
    console.log(`SIDECAR PRESET VALIDATION REPORT: ${promotionValidationReportPath}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(`benchmarkSidecarPresets FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
