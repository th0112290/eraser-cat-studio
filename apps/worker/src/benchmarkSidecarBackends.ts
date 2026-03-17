import { bootstrapEnv } from "./bootstrapEnv";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveEffectiveRetakeCount,
  resolveSidecarBackendBenchmarkScenarios,
  resolveSidecarBackendSmokeTimeoutMs,
  resolveSidecarFailureReason,
  resolveSidecarFallbackReason,
  resolveSidecarJudgeScore,
  type SidecarBackendBenchmarkScenario
} from "./generatedSidecar";
import {
  buildSidecarBackendRecommendationSummary,
  buildSidecarBenchmarkRow,
  resolveSidecarBenchmarkRigFields,
  writeSidecarBackendNightlyScaffold,
  type SidecarBenchmarkRow
} from "./sidecarBenchmarkSchema";
import { resolveSmokeProfileSelection, toSmokeProfileArgs } from "./sidecarSmokeProfiles";
import { runSidecarSmokePreflight } from "./sidecarSmokePreflight";
import { ensureSidecarSmokeCharacterPack } from "./sidecarSmokeCharacterPack";
import { PrismaClient } from "@prisma/client";

bootstrapEnv();

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

function shouldReuseExistingScenarioResults(): boolean {
  const raw = process.env.BENCHMARK_BACKEND_REUSE_EXISTING?.trim().toLowerCase();
  return hasFlag("reuse-existing") || raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function resolveScenarioTimeoutGraceMs(smokeTimeoutMs: number): number {
  const raw =
    resolveArgValue("scenario-timeout-grace-ms") ?? process.env.BENCHMARK_BACKEND_SCENARIO_TIMEOUT_GRACE_MS ?? "";
  const parsed = Number.parseInt(raw.trim(), 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return Math.max(30_000, Math.min(180_000, Math.round(smokeTimeoutMs * 0.05)));
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const fixturePath = resolveLocalPath(
    resolveArgValue("fixture") ?? path.join(repoRoot, "scripts", "fixtures", "video_i2v_smoke_shots.json")
  );
  const outDir = resolveLocalPath(
    resolveArgValue("out-dir") ?? path.join(repoRoot, "out", "backend_benchmarks", "video_i2v")
  );
  const profileSelection = resolveSmokeProfileSelection({ resolveArgValue });
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
    channelName: "Video Backend Benchmark"
  }).finally(async () => {
    await prisma.$disconnect();
  });
  const characterPackId = resolvedCharacterPack.characterPackId;
  const scenarios: SidecarBackendBenchmarkScenario[] = resolveSidecarBackendBenchmarkScenarios();
  const preflightResult = await runSidecarSmokePreflight({
    fixturePath,
    characterPackId,
    renderer: scenarios.find((scenario) => scenario.renderer !== "generated-pack-still-video")?.renderer ?? null,
    requireCharacterPack: true,
    requireApprovedCharacterPack: true
  });

  const generatedAt = new Date().toISOString();
  const runId = `sidecar_backend_i2v:${Date.now()}`;
  const reuseExistingScenarioResults = shouldReuseExistingScenarioResults();
  const results: Array<Record<string, unknown>> = [];
  const rows: SidecarBenchmarkRow[] = [];
  for (const scenario of scenarios) {
    const scenarioOutDir = path.join(outDir, scenario.name);
    const smokeTimeoutMs = resolveSidecarBackendSmokeTimeoutMs(scenario.name);
    const scenarioTimeoutMs = smokeTimeoutMs + resolveScenarioTimeoutGraceMs(smokeTimeoutMs);
    const reportPath = path.join(scenarioOutDir, "smoke_report.json");
    const planPath = path.join(scenarioOutDir, "shot_sidecar_plan.json");
    const renderLogPath = path.join(scenarioOutDir, "render_log.json");
    const canReuseExistingScenario =
      reuseExistingScenarioResults && (fs.existsSync(reportPath) || fs.existsSync(planPath) || fs.existsSync(renderLogPath));
    const startedAt = Date.now();
    const pnpmExecutable = resolvePnpmExecutable();
    let run: {
      status: number | null;
      error?: Error;
      stdout: string;
      stderr: string;
    } = {
      status: null,
      stdout: "",
      stderr: ""
    };
    if (!canReuseExistingScenario) {
      const spawnResult = spawnSync(
        pnpmExecutable,
        [
          "-C",
          path.join(repoRoot, "apps", "worker"),
          "exec",
          "tsx",
          "src/smokeVideoBrollRender.ts",
          `--fixture=${fixturePath}`,
          `--out-dir=${scenarioOutDir}`,
          `--label=benchmark-${scenario.name}`,
          "--channel=Video Backend Benchmark",
          `--topic=Video Backend Benchmark ${scenario.name}`,
          ...toSmokeProfileArgs(profileSelection)
        ],
        {
          cwd: repoRoot,
          encoding: "utf8",
          shell: process.platform === "win32",
          windowsHide: true,
          timeout: scenarioTimeoutMs,
          env: {
            ...process.env,
            SMOKE_VIDEO_BROLL_CHARACTER_PACK_ID: characterPackId,
            SMOKE_VIDEO_I2V_RENDERER: scenario.renderer,
            SMOKE_EXPECT_SIDECAR_STATUS: "resolved",
            SMOKE_VIDEO_BROLL_TIMEOUT_MS: String(smokeTimeoutMs)
          }
        }
      );
      run = {
        status: spawnResult.status,
        error: spawnResult.error ? (spawnResult.error as Error) : undefined,
        stdout: typeof spawnResult.stdout === "string" ? spawnResult.stdout : "",
        stderr: typeof spawnResult.stderr === "string" ? spawnResult.stderr : ""
      };
    }
    const endedAt = Date.now();
    const report = readJson(reportPath);
    const plan = readJson(planPath);
    const renderLog = readJson(renderLogPath);
    const firstPlan = Array.isArray((plan as { plans?: unknown } | null)?.plans)
      ? asRecord((plan as { plans: unknown[] }).plans[0] ?? null)
      : null;
    const firstPlanMetadata = asRecord(firstPlan?.metadata ?? null);
    const firstPlanJudge = asRecord(firstPlan?.judge ?? null);
    const firstPlanArtifacts = Array.isArray(firstPlan?.artifacts)
      ? firstPlan.artifacts.map((artifact) => asRecord(artifact)).filter((artifact): artifact is Record<string, unknown> => Boolean(artifact))
      : [];
    const resolveArtifactPath = (label: string): string | null =>
      firstPlanArtifacts.find((artifact) => artifact.label === label && typeof artifact.path === "string")?.path as string | null;
    const firstPlanRetakes = Array.isArray(firstPlan?.retakes) ? firstPlan.retakes : [];
    const effectiveRetakeCount = deriveEffectiveRetakeCount(firstPlanRetakes);
    const firstPlanExecutionProfile = asRecord(firstPlanMetadata?.executionProfile ?? null);
    const firstPlanWorkflowBinding = asRecord(firstPlanMetadata?.workflowBinding ?? null);
    const firstPlanQcEvaluation = asRecord(firstPlanMetadata?.qcEvaluation ?? null);
    const failureReason = resolveSidecarFailureReason({
      metadata: firstPlanMetadata,
      judge: firstPlanJudge
    });
    const fallbackReason = resolveSidecarFallbackReason({
      metadata: firstPlanMetadata,
      judge: firstPlanJudge
    });
    const judgeScore = resolveSidecarJudgeScore(firstPlanMetadata);
    const premiumActualPolicyRejectionReasons = Array.isArray(firstPlanMetadata?.premiumActualPolicyRejectionReasons)
      ? firstPlanMetadata.premiumActualPolicyRejectionReasons.filter((value): value is string => typeof value === "string")
      : [];
    const rigFields = resolveSidecarBenchmarkRigFields({
      sources: [firstPlanMetadata, firstPlanJudge],
      fallbackReason,
      fallbackReasonCodes: premiumActualPolicyRejectionReasons
    });
    const renderLogRecord = asRecord(renderLog);
    const latencyMs =
      canReuseExistingScenario && typeof renderLogRecord?.duration_ms === "number"
        ? renderLogRecord.duration_ms
        : endedAt - startedAt;
    const renderLogSucceeded = renderLogRecord?.status === "SUCCEEDED";
    const sidecarResolved = firstPlan?.status === "resolved";
    const actualBackendCapability =
      typeof firstPlanJudge?.actualBackendCapability === "string"
        ? firstPlanJudge.actualBackendCapability
        : typeof firstPlanMetadata?.actualBackendCapability === "string"
          ? firstPlanMetadata.actualBackendCapability
          : null;
    const effectiveSuccess = Boolean(
      renderLogSucceeded && sidecarResolved && actualBackendCapability === scenario.name
    );
    const resultRow = {
      backend: scenario.name,
      renderer: scenario.renderer,
      success: effectiveSuccess,
      failure: failureReason,
      exitCode: run.status,
      spawnError: run.error ? String(run.error) : null,
      latency_ms: latencyMs,
      smoke_timeout_ms: smokeTimeoutMs,
      scenario_timeout_ms: canReuseExistingScenario ? null : scenarioTimeoutMs,
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
      shot_sidecar_plan_path: fs.existsSync(planPath) ? planPath : null,
      render_log_path: fs.existsSync(renderLogPath) ? renderLogPath : null,
      sidecar_status: typeof firstPlan?.status === "string" ? firstPlan.status : null,
      actual_renderer: typeof firstPlan?.renderer === "string" ? firstPlan.renderer : null,
      judge_decision: typeof firstPlanJudge?.decision === "string" ? firstPlanJudge.decision : null,
      judge_accepted: typeof firstPlanJudge?.accepted === "boolean" ? firstPlanJudge.accepted : null,
      accepted: typeof firstPlanJudge?.accepted === "boolean" ? firstPlanJudge.accepted : null,
      judge_score: judgeScore,
      actual_backend_capability: actualBackendCapability,
      fallback_from: typeof firstPlanMetadata?.fallbackFrom === "string" ? firstPlanMetadata.fallbackFrom : null,
      fallback_reason: fallbackReason,
      fallback_reason_codes: rigFields.fallback_reason_codes,
      head_pose_score: rigFields.head_pose_score,
      eye_drift_score: rigFields.eye_drift_score,
      mouth_readability_score: rigFields.mouth_readability_score,
      landmark_consistency_score: rigFields.landmark_consistency_score,
      anchor_confidence_overall: rigFields.anchor_confidence_overall,
      anchor_confidence_by_view: rigFields.anchor_confidence_by_view,
      review_only: rigFields.review_only,
      recreate_recommended: rigFields.recreate_recommended,
      repairable: rigFields.repairable,
      species_id: rigFields.species_id,
      selected_view: rigFields.selected_view,
      required_manual_slots: rigFields.required_manual_slots,
      repair_source_candidate_ids: rigFields.repair_source_candidate_ids,
      repair_lineage_summary: rigFields.repair_lineage_summary,
      directive_family_summary: rigFields.directive_family_summary,
      rig_reason_families: rigFields.rig_reason_families,
      anchor_override_present: rigFields.anchor_override_present,
      crop_override_present: rigFields.crop_override_present,
      retake_count: effectiveRetakeCount,
      duration_sec:
        typeof firstPlanMetadata?.outputDurationSeconds === "number"
          ? (firstPlanMetadata.outputDurationSeconds as number)
          : null,
      output_duration_sec:
        typeof firstPlanMetadata?.outputDurationSeconds === "number"
          ? (firstPlanMetadata.outputDurationSeconds as number)
          : null,
      control_mode: typeof firstPlanMetadata?.controlMode === "string" ? firstPlanMetadata.controlMode : null,
      controlnet_preset:
        typeof firstPlanMetadata?.controlnetPreset === "string" ? firstPlanMetadata.controlnetPreset : null,
      impact_preset: typeof firstPlanMetadata?.impactPreset === "string" ? firstPlanMetadata.impactPreset : null,
      qc_preset: typeof firstPlanMetadata?.qcPreset === "string" ? firstPlanMetadata.qcPreset : null,
      preset_source: typeof firstPlanMetadata?.presetSource === "string" ? firstPlanMetadata.presetSource : null,
      preset_rollout_source:
        typeof firstPlanMetadata?.presetRolloutSource === "string" ? firstPlanMetadata.presetRolloutSource : null,
      preset_rollout_source_kind:
        firstPlanMetadata?.presetRolloutSourceKind === "file" || firstPlanMetadata?.presetRolloutSourceKind === "matrix"
          ? firstPlanMetadata.presetRolloutSourceKind
          : null,
      preset_rollout_scenario:
        typeof firstPlanMetadata?.presetRolloutScenario === "string" ? firstPlanMetadata.presetRolloutScenario : null,
      preset_rollout_score:
        typeof firstPlanMetadata?.presetRolloutScore === "number" ? firstPlanMetadata.presetRolloutScore : null,
      preset_rollout_verdict:
        typeof firstPlanMetadata?.presetRolloutVerdict === "string" ? firstPlanMetadata.presetRolloutVerdict : null,
      preset_rollout_target:
        firstPlanMetadata?.presetRolloutTarget === "overall" ||
        firstPlanMetadata?.presetRolloutTarget === "balanced" ||
        firstPlanMetadata?.presetRolloutTarget === "strict"
          ? firstPlanMetadata.presetRolloutTarget
          : null,
      preset_rollout_artifact_age_hours:
        typeof firstPlanMetadata?.presetRolloutArtifactAgeHours === "number"
          ? firstPlanMetadata.presetRolloutArtifactAgeHours
          : null,
      preset_rollout_channel_domain:
        firstPlanMetadata?.presetRolloutChannelDomain === "economy" ||
        firstPlanMetadata?.presetRolloutChannelDomain === "medical"
          ? firstPlanMetadata.presetRolloutChannelDomain
          : null,
      premium_candidate_judge_version:
        typeof firstPlanMetadata?.premiumCandidateJudgeVersion === "string"
          ? firstPlanMetadata.premiumCandidateJudgeVersion
          : null,
      premium_candidate_count:
        typeof firstPlanMetadata?.premiumCandidateCount === "number" ? firstPlanMetadata.premiumCandidateCount : null,
      premium_selected_candidate_id:
        typeof firstPlanMetadata?.premiumSelectedCandidateId === "string"
          ? firstPlanMetadata.premiumSelectedCandidateId
          : null,
      premium_selected_candidate_objective:
        typeof firstPlanMetadata?.premiumSelectedCandidateObjective === "string"
          ? firstPlanMetadata.premiumSelectedCandidateObjective
          : null,
      premium_selected_candidate_score:
        typeof firstPlanMetadata?.premiumSelectedCandidateScore === "number"
          ? firstPlanMetadata.premiumSelectedCandidateScore
          : null,
      premium_candidate_selection_reason:
        typeof firstPlanMetadata?.premiumCandidateSelectionReason === "string"
          ? firstPlanMetadata.premiumCandidateSelectionReason
          : null,
      premium_candidate_judge_path:
        typeof firstPlanMetadata?.premiumCandidateJudgePath === "string" ? firstPlanMetadata.premiumCandidateJudgePath : null,
      premium_selected_seed_override:
        typeof firstPlanMetadata?.premiumSelectedSeedOverride === "number"
          ? firstPlanMetadata.premiumSelectedSeedOverride
          : null,
      premium_actual_judge_version:
        typeof firstPlanMetadata?.premiumActualJudgeVersion === "string"
          ? firstPlanMetadata.premiumActualJudgeVersion
          : null,
      premium_actual_candidate_count:
        typeof firstPlanMetadata?.premiumActualCandidateCount === "number"
          ? firstPlanMetadata.premiumActualCandidateCount
          : null,
      premium_actual_selected_candidate_id:
        typeof firstPlanMetadata?.premiumActualSelectedCandidateId === "string"
          ? firstPlanMetadata.premiumActualSelectedCandidateId
          : null,
      premium_actual_selected_candidate_objective:
        typeof firstPlanMetadata?.premiumActualSelectedCandidateObjective === "string"
          ? firstPlanMetadata.premiumActualSelectedCandidateObjective
          : null,
      premium_actual_selected_candidate_score:
        typeof firstPlanMetadata?.premiumActualSelectedCandidateScore === "number"
          ? firstPlanMetadata.premiumActualSelectedCandidateScore
          : null,
      premium_actual_selection_reason:
        typeof firstPlanMetadata?.premiumActualSelectionReason === "string"
          ? firstPlanMetadata.premiumActualSelectionReason
          : null,
      premium_actual_judge_path:
        typeof firstPlanMetadata?.premiumActualJudgePath === "string" ? firstPlanMetadata.premiumActualJudgePath : null,
      premium_actual_judge_policy_version:
        typeof firstPlanMetadata?.premiumActualJudgePolicyVersion === "string"
          ? firstPlanMetadata.premiumActualJudgePolicyVersion
          : null,
      premium_actual_policy_accepted:
        typeof firstPlanMetadata?.premiumActualPolicyAccepted === "boolean"
          ? firstPlanMetadata.premiumActualPolicyAccepted
          : null,
      premium_actual_policy_rejection_reasons: premiumActualPolicyRejectionReasons,
      premium_actual_retake_round:
        typeof firstPlanMetadata?.premiumActualRetakeRound === "number" ? firstPlanMetadata.premiumActualRetakeRound : null,
      premium_actual_retake_count:
        typeof firstPlanMetadata?.premiumActualRetakeCount === "number" ? firstPlanMetadata.premiumActualRetakeCount : null,
      premium_actual_visual_signal_mode:
        typeof firstPlanMetadata?.premiumActualVisualSignalMode === "string"
          ? firstPlanMetadata.premiumActualVisualSignalMode
          : null,
      premium_actual_visual_signal_score:
        typeof firstPlanMetadata?.premiumActualVisualSignalScore === "number"
          ? firstPlanMetadata.premiumActualVisualSignalScore
          : null,
      premium_actual_visual_signal_report_path:
        typeof firstPlanMetadata?.premiumActualVisualSignalReportPath === "string"
          ? firstPlanMetadata.premiumActualVisualSignalReportPath
          : null,
      premium_actual_face_stability_score:
        typeof firstPlanMetadata?.premiumActualFaceStabilityScore === "number"
          ? firstPlanMetadata.premiumActualFaceStabilityScore
          : null,
      premium_actual_motion_coherence_score:
        typeof firstPlanMetadata?.premiumActualMotionCoherenceScore === "number"
          ? firstPlanMetadata.premiumActualMotionCoherenceScore
          : null,
      premium_actual_silhouette_readability_score:
        typeof firstPlanMetadata?.premiumActualSilhouetteReadabilityScore === "number"
          ? firstPlanMetadata.premiumActualSilhouetteReadabilityScore
          : null,
      premium_actual_mascot_identity_preservation_score:
        typeof firstPlanMetadata?.premiumActualMascotIdentityPreservationScore === "number"
          ? firstPlanMetadata.premiumActualMascotIdentityPreservationScore
          : null,
      premium_actual_subtitle_safe_score:
        typeof firstPlanMetadata?.premiumActualSubtitleSafeScore === "number"
          ? firstPlanMetadata.premiumActualSubtitleSafeScore
          : null,
      premium_actual_chart_safe_score:
        typeof firstPlanMetadata?.premiumActualChartSafeScore === "number"
          ? firstPlanMetadata.premiumActualChartSafeScore
          : null,
      effective_use_clip_vision:
        typeof firstPlanMetadata?.effectiveUseClipVision === "boolean" ? firstPlanMetadata.effectiveUseClipVision : null,
      clip_vision_model_name:
        typeof firstPlanMetadata?.clipVisionModelName === "string" ? firstPlanMetadata.clipVisionModelName : null,
      preflight_warnings: Array.isArray(firstPlanMetadata?.preflightWarnings)
        ? firstPlanMetadata.preflightWarnings.filter((value): value is string => typeof value === "string")
        : [],
      resolution_profile:
        typeof firstPlanMetadata?.resolutionProfile === "string" ? firstPlanMetadata.resolutionProfile : null,
      step_profile: typeof firstPlanMetadata?.stepProfile === "string" ? firstPlanMetadata.stepProfile : null,
      cache_profile: typeof firstPlanMetadata?.cacheProfile === "string" ? firstPlanMetadata.cacheProfile : null,
      sr_profile: typeof firstPlanMetadata?.srProfile === "string" ? firstPlanMetadata.srProfile : null,
      workflow_binding: firstPlanWorkflowBinding,
      execution_profile: firstPlanExecutionProfile,
      qc_passed: typeof firstPlanQcEvaluation?.passed === "boolean" ? firstPlanQcEvaluation.passed : null,
      qc_reasons: Array.isArray(firstPlanQcEvaluation?.reasons) ? firstPlanQcEvaluation.reasons : [],
      qc_warnings: Array.isArray(firstPlanQcEvaluation?.warnings) ? firstPlanQcEvaluation.warnings : [],
      motion_coherence_score: null,
      face_consistency_score: null,
      geometric_drift_score: null,
      render_failure_rate: effectiveSuccess ? 0 : 1,
      acceptance_rate: effectiveSuccess ? 1 : 0,
      reused_existing: canReuseExistingScenario,
      stdout_tail: run.stdout.split(/\r?\n/).slice(-20).join("\n"),
      stderr_tail: run.stderr.split(/\r?\n/).slice(-20).join("\n")
    };
    results.push(resultRow);
    rows.push(
      buildSidecarBenchmarkRow({
        benchmarkKind: "sidecar_backend_i2v",
        runId,
        generatedAt,
        scenarioId: scenario.name,
        scenarioGroup: "backend",
        scenarioLabel: scenario.renderer,
        channelDomain: profileSelection.resolvedProfiles.channel.domain,
        profileBundle: profileSelection.bundleName,
        backend: scenario.name,
        renderer: scenario.renderer,
        requestedBackend: scenario.name,
        actualBackend: actualBackendCapability,
        success: effectiveSuccess,
        failure: failureReason,
        latencyMs,
        durationSec: typeof firstPlanMetadata?.outputDurationSeconds === "number" ? firstPlanMetadata.outputDurationSeconds : null,
        resolutionProfile: typeof firstPlanMetadata?.resolutionProfile === "string" ? firstPlanMetadata.resolutionProfile : null,
        stepProfile: typeof firstPlanMetadata?.stepProfile === "string" ? firstPlanMetadata.stepProfile : null,
        cacheProfile: typeof firstPlanMetadata?.cacheProfile === "string" ? firstPlanMetadata.cacheProfile : null,
        srProfile: typeof firstPlanMetadata?.srProfile === "string" ? firstPlanMetadata.srProfile : null,
        accepted: typeof firstPlanJudge?.accepted === "boolean" ? firstPlanJudge.accepted : null,
        judgeDecision: typeof firstPlanJudge?.decision === "string" ? firstPlanJudge.decision : null,
        judgeScore,
        fallbackReason,
        fallbackReasonCodes: rigFields.fallback_reason_codes,
        fallbackFrom: typeof firstPlanMetadata?.fallbackFrom === "string" ? firstPlanMetadata.fallbackFrom : null,
        fallbackTo:
          fallbackReason && typeof actualBackendCapability === "string" && actualBackendCapability !== scenario.name
            ? actualBackendCapability
            : null,
        headPoseScore: rigFields.head_pose_score,
        eyeDriftScore: rigFields.eye_drift_score,
        mouthReadabilityScore: rigFields.mouth_readability_score,
        landmarkConsistencyScore: rigFields.landmark_consistency_score,
        anchorConfidenceOverall: rigFields.anchor_confidence_overall,
        anchorConfidenceByView: rigFields.anchor_confidence_by_view,
        reviewOnly: rigFields.review_only,
        recreateRecommended: rigFields.recreate_recommended,
        repairable: rigFields.repairable,
        speciesId: rigFields.species_id,
        selectedView: rigFields.selected_view,
        requiredManualSlots: rigFields.required_manual_slots,
        repairSourceCandidateIds: rigFields.repair_source_candidate_ids,
        repairLineageSummary: rigFields.repair_lineage_summary,
        directiveFamilySummary: rigFields.directive_family_summary,
        rigReasonFamilies: rigFields.rig_reason_families,
        anchorOverridePresent: rigFields.anchor_override_present,
        cropOverridePresent: rigFields.crop_override_present,
        retakeCount: effectiveRetakeCount,
        candidateCount:
          typeof firstPlanMetadata?.premiumActualCandidateCount === "number"
            ? firstPlanMetadata.premiumActualCandidateCount
            : typeof firstPlanMetadata?.premiumCandidateCount === "number"
              ? firstPlanMetadata.premiumCandidateCount
              : null,
        selectedCandidateId:
          typeof firstPlanMetadata?.premiumActualSelectedCandidateId === "string"
            ? firstPlanMetadata.premiumActualSelectedCandidateId
            : typeof firstPlanMetadata?.premiumSelectedCandidateId === "string"
              ? firstPlanMetadata.premiumSelectedCandidateId
              : null,
        cacheHit: typeof firstPlanMetadata?.cached === "boolean" ? firstPlanMetadata.cached : null,
        controlnetPreset:
          typeof firstPlanMetadata?.controlnetPreset === "string" ? firstPlanMetadata.controlnetPreset : null,
        impactPreset: typeof firstPlanMetadata?.impactPreset === "string" ? firstPlanMetadata.impactPreset : null,
        qcPreset: typeof firstPlanMetadata?.qcPreset === "string" ? firstPlanMetadata.qcPreset : null,
        outputDurationSec:
          typeof firstPlanMetadata?.outputDurationSeconds === "number" ? firstPlanMetadata.outputDurationSeconds : null,
        expectedDurationSec:
          typeof firstPlanMetadata?.durationSeconds === "number" ? firstPlanMetadata.durationSeconds : null,
        durationDeltaSec:
          typeof firstPlanMetadata?.outputDurationSeconds === "number" &&
          typeof firstPlanMetadata?.durationSeconds === "number"
            ? Math.abs(firstPlanMetadata.outputDurationSeconds - firstPlanMetadata.durationSeconds)
            : null,
        qcPassed: typeof firstPlanQcEvaluation?.passed === "boolean" ? firstPlanQcEvaluation.passed : null,
        qcReasons: Array.isArray(firstPlanQcEvaluation?.reasons) ? firstPlanQcEvaluation.reasons : [],
        qcWarnings: Array.isArray(firstPlanQcEvaluation?.warnings) ? firstPlanQcEvaluation.warnings : [],
        preflightWarnings: Array.isArray(firstPlanMetadata?.preflightWarnings) ? firstPlanMetadata.preflightWarnings : [],
        artifacts: {
          plan_path: fs.existsSync(planPath) ? planPath : null,
          preflight_path: resolveArtifactPath("shot-sidecar-preflight"),
          workflow_path: resolveArtifactPath("shot-sidecar-workflow-api"),
          result_path: resolveArtifactPath("shot-sidecar-result"),
          video_path: resolveArtifactPath("shot-sidecar-video"),
          judge_path:
            resolveArtifactPath("shot-sidecar-premium-actual-judge") ??
            resolveArtifactPath("shot-sidecar-premium-candidate-judge")
        },
        extras: {
          shot_sidecar_plan_path: fs.existsSync(planPath) ? planPath : null,
          render_log_path: fs.existsSync(renderLogPath) ? renderLogPath : null,
          smoke_report_path: fs.existsSync(reportPath) ? reportPath : null,
          reused_existing: canReuseExistingScenario,
          studio_profile_id: profileSelection.selection.studio_profile_id,
          channel_profile_id: profileSelection.selection.channel_profile_id,
          mascot_profile_id: profileSelection.selection.mascot_profile_id,
          information_priority: profileSelection.resolvedProfiles.channel.information_priority,
          finish_profile_id: profileSelection.resolvedProfiles.channel.finish_profile_id,
          premium_sidecar_frequency: profileSelection.resolvedProfiles.channel.premium_sidecar_frequency
        }
      })
    );
  }

  const matrixPath = path.join(outDir, "benchmark_matrix.json");
  const recommendationSummary = buildSidecarBackendRecommendationSummary(rows);
  writeJson(matrixPath, {
    schema_version: "1.1",
    generated_at: generatedAt,
    fixture_path: fixturePath,
    character_pack_id: characterPackId,
    requested_character_pack_id: requestedCharacterPackId,
    resolved_character_pack: resolvedCharacterPack,
    preflight: preflightResult,
    profile_selection: profileSelection.selection,
    profile_bundle: profileSelection.bundleName,
    channel_domain: profileSelection.resolvedProfiles.channel.domain,
    benchmark_kind: "sidecar_backend_i2v",
    scenarios: results,
    rows,
    recommendation_summary: recommendationSummary,
    ready: recommendationSummary.ready,
    status: recommendationSummary.status,
    comparison_dimensions: [
      "latency_ms",
      "success",
      "output_duration_sec",
      "head_pose_score",
      "eye_drift_score",
      "mouth_readability_score",
      "landmark_consistency_score",
      "anchor_confidence_overall",
      "review_only",
      "recreate_recommended",
      "repairable",
      "species_id",
      "selected_view",
      "rig_reason_families",
      "motion_coherence_score",
      "face_consistency_score",
      "geometric_drift_score",
      "render_failure_rate",
      "acceptance_rate"
    ]
  });
  const backendSummaryPath = path.join(outDir, "benchmark_summary.json");
  const backendAlertPath = path.join(outDir, "benchmark_alert.json");
  const backendAlertMarkdownPath = path.join(outDir, "benchmark_alert.md");
  const backendEnvPath = path.join(outDir, "nightly_sidecar_backend_rollout.env");
  writeSidecarBackendNightlyScaffold({
    summaryPath: backendSummaryPath,
    alertPath: backendAlertPath,
    alertMarkdownPath: backendAlertMarkdownPath,
    envPath: backendEnvPath,
    generatedAt,
    rows,
    sourceMatrixPath: matrixPath
  });

  console.log(`SIDEcar BACKEND BENCHMARK: ${matrixPath}`);
  console.log(`SIDECAR BACKEND SUMMARY: ${backendSummaryPath}`);
  console.log(`SIDECAR BACKEND ALERT: ${backendAlertPath}`);
  console.log(`SIDECAR BACKEND ENV: ${backendEnvPath}`);
}

main().catch((error) => {
  console.error(`benchmarkSidecarBackends FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
