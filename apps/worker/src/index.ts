import { bootstrapEnv } from "./bootstrapEnv";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, type JobsOptions } from "bullmq";
import { SchemaValidator, sha256Hex, stableStringify } from "@ec/shared";
import { validateMotionPresetBenchmark } from "./motionPresetBenchmarkValidation";
import { resolveRequestedReferenceView } from "./sidecarViewPreference";
import {
  evaluatePremiumActualVisualSignals,
  type PremiumActualVisualSignalMode,
  type PremiumActualVisualSignalReport
} from "./premiumSidecarVisualJudge";
import {
  buildSidecarRetakePromptRefinements,
  downgradeSidecarRequestPackForBaseHunyuan,
  evaluateSidecarRuntimeJudge,
  resolveSidecarBackendCapability,
  resolveSidecarFallbackChain,
  resolveSidecarRuntimeJudgePolicy,
  type SidecarBackendCapability,
  type SidecarBrollRequestPack,
  type SidecarRuntimeJudgePolicy
} from "./generatedSidecar";
import {
  SIDECAR_CONTROLNET_PRESET_MANIFEST,
  SIDECAR_IMPACT_PRESET_MANIFEST,
  SIDECAR_PRESET_MANIFEST_VERSION,
  SIDECAR_QC_PRESET_MANIFEST
} from "./sidecarPresetManifest";
import { resolveRuntimeSidecarPresetRollout } from "./sidecarPresetRollout";
import { validateRuntimeSidecarPresetRollout } from "./sidecarPresetRolloutValidation";
import {
  coerceProfileSelection,
  resolveProfiles,
  type ProfileSelection,
  type SidecarControlNetPresetId,
  type SidecarImpactPresetId,
  type SidecarQcPresetId
} from "@ec/profiles";
import {
  compileShots,
  generateBeats,
  toBeatsDocument,
  toShotsDocument,
  type Beat,
  type EpisodeInput,
  type StoryInput
} from "@ec/story";
import {
  createGeneratedPackSidecarPlaceholderRenderer,
  createGeneratedPackSidecarStillVideoRenderer,
  orchestrateRenderEpisode,
  type ShotSidecarJudge,
  type ShotSidecarJudgeDecision,
  type ShotSidecarPlan,
  type ShotSidecarPlanStatus,
  type ShotSidecarRenderRequest,
  type ShotSidecarRenderer,
  type ShotSidecarRetakeOutcome,
  type ShotSidecarRetakeStep
} from "@ec/render-orchestrator";
import { createPublishManifest } from "@ec/publish";
import {
  LocalMockMusicLibrary,
  MockTTSProvider,
  runAudioPipeline,
  type BeatCue as AudioBeatCue,
  type ShotCue as AudioShotCue,
  type TTSProvider
} from "@ec/audio";
import {
  ASSET_INGEST_JOB_NAME,
  ASSET_QUEUE_NAME,
  BUILD_CHARACTER_PACK_JOB_NAME,
  COMPILE_SHOTS_JOB_NAME,
  type AssetIngestQueuePayload,
  type CharacterAssetSelection,
  type CharacterPackJobPayload,
  EPISODE_JOB_NAME,
  GENERATE_CHARACTER_ASSETS_JOB_NAME,
  GENERATE_BEATS_JOB_NAME,
  getEpisodeOutputPaths,
  MAX_JOB_ATTEMPTS,
  PACKAGE_OUTPUTS_JOB_NAME,
  queue,
  QUEUE_NAME,
  REDIS_CONNECTION,
  REDIS_URL,
  RENDER_CHARACTER_PREVIEW_JOB_NAME,
  RENDER_EPISODE_JOB_NAME,
  RENDER_FINAL_JOB_NAME,
  RENDER_PREVIEW_JOB_NAME,
  REPO_ROOT
} from "./queue";
import type { EpisodeJobPayload, PipelineJobName, RenderJobPayload } from "./queue";
import type { Prisma } from "@prisma/client";
import { getAssetObject } from "./assetStorage";
import { handleAssetIngestJob } from "./assetIngest";
import { handleGenerateCharacterAssetsJob } from "./characterGeneration";
import { workerQueueRetentionOptions } from "./jobRetention";

function resolveDefaultCatQualityReferenceImage(repoRoot: string): string {
  const dirPath = path.join(repoRoot, "refs", "cat_quality_input", "01_main_style");
  if (!fs.existsSync(dirPath)) {
    return path.join(repoRoot, "refs", "cat_quality_input");
  }

  const imageName = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        [".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(entry.name).toLowerCase())
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"))[0];

  return imageName ? path.join(dirPath, imageName) : dirPath;
}

bootstrapEnv();

const prismaModule = await import("@prisma/client");
const { PrismaClient, Prisma: PrismaRuntime } = prismaModule;
const prisma = new PrismaClient();
const ASSET_INGEST_TIMEOUT_MS = Number.parseInt(process.env.ASSET_INGEST_TIMEOUT_MS ?? "20000", 10);
const WORKER_LOCK_DURATION_MS = Number.parseInt(process.env.WORKER_LOCK_DURATION_MS ?? "900000", 10);
const WORKER_STALLED_INTERVAL_MS = Number.parseInt(process.env.WORKER_STALLED_INTERVAL_MS ?? "60000", 10);
const WORKER_MAX_STALLED_COUNT = Number.parseInt(process.env.WORKER_MAX_STALLED_COUNT ?? "5", 10);
const COMFY_SERVER_URL = (process.env.COMFY_SERVER_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "");
const COMFY_INPUT_DIR = process.env.COMFY_INPUT_DIR?.trim() || "C:\\input";
const VIDEO_BROLL_COMFY_TIMEOUT_MS = Number.parseInt(process.env.VIDEO_BROLL_COMFY_TIMEOUT_MS ?? "900000", 10);
const VIDEO_HUNYUAN_COMFY_TIMEOUT_MS = parsePositiveInt(
  process.env.VIDEO_HUNYUAN_COMFY_TIMEOUT_MS,
  VIDEO_BROLL_COMFY_TIMEOUT_MS
);
const VIDEO_HUNYUAN_SR_COMFY_TIMEOUT_MS = parsePositiveInt(
  process.env.VIDEO_HUNYUAN_SR_COMFY_TIMEOUT_MS,
  4 * 60 * 60 * 1000
);
const COMFY_FETCH_RETRY_COUNT = Math.max(1, Number.parseInt(process.env.COMFY_FETCH_RETRY_COUNT ?? "3", 10) || 3);
const COMFY_FETCH_RETRY_DELAY_MS = Math.max(
  100,
  Number.parseInt(process.env.COMFY_FETCH_RETRY_DELAY_MS ?? "750", 10) || 750
);
const VIDEO_BROLL_WAN_MODEL = process.env.VIDEO_BROLL_WAN_MODEL?.trim() || "wan2.2_ti2v_5B_fp16.safetensors";
const VIDEO_BROLL_WAN_TEXT_ENCODER =
  process.env.VIDEO_BROLL_WAN_TEXT_ENCODER?.trim() || "umt5_xxl_fp8_e4m3fn_scaled.safetensors";
const VIDEO_BROLL_WAN_VAE = process.env.VIDEO_BROLL_WAN_VAE?.trim() || "wan2.2_vae.safetensors";
const VIDEO_BROLL_WAN_CLIP_VISION = process.env.VIDEO_BROLL_WAN_CLIP_VISION?.trim() || "clip_vision_h.safetensors";
const VIDEO_BROLL_WAN_USE_CLIP_VISION = parseBoolean(process.env.VIDEO_BROLL_WAN_USE_CLIP_VISION, false);
const VIDEO_BROLL_WAN_SHIFT = Number.parseFloat(process.env.VIDEO_BROLL_WAN_SHIFT ?? "5.0");
const VIDEO_BROLL_WAN_STEPS = Number.parseInt(process.env.VIDEO_BROLL_WAN_STEPS ?? "20", 10);
const VIDEO_BROLL_WAN_CFG = Number.parseFloat(process.env.VIDEO_BROLL_WAN_CFG ?? "1.0");
const VIDEO_BROLL_WAN_SAMPLER = process.env.VIDEO_BROLL_WAN_SAMPLER?.trim() || "euler";
const VIDEO_BROLL_WAN_SCHEDULER = process.env.VIDEO_BROLL_WAN_SCHEDULER?.trim() || "simple";
const VIDEO_BROLL_WAN_WIDTH = Number.parseInt(process.env.VIDEO_BROLL_WAN_WIDTH ?? "640", 10);
const VIDEO_BROLL_WAN_HEIGHT = Number.parseInt(process.env.VIDEO_BROLL_WAN_HEIGHT ?? "640", 10);
const VIDEO_BROLL_WAN_FPS = Number.parseInt(process.env.VIDEO_BROLL_WAN_FPS ?? "16", 10);
const VIDEO_BROLL_WAN_MAX_FRAMES = parsePositiveInt(process.env.VIDEO_BROLL_WAN_MAX_FRAMES, 49);
const VIDEO_BROLL_REFERENCE_IMAGE =
  process.env.VIDEO_BROLL_REFERENCE_IMAGE?.trim() ||
  resolveDefaultCatQualityReferenceImage(REPO_ROOT);
const COMFY_MODELS_ROOT = process.env.COMFY_MODELS_ROOT?.trim() || "C:\\models";
const HF_HUB_CACHE_ROOT =
  process.env.HF_HUB_CACHE_ROOT?.trim() || path.join(os.homedir(), ".cache", "huggingface", "hub");
const VIDEO_BROLL_WAN_AUTO_MATERIALIZE_FROM_CACHE = parseBoolean(
  process.env.VIDEO_BROLL_WAN_AUTO_MATERIALIZE_FROM_CACHE,
  true
);
const VIDEO_HUNYUAN_I2V_MODEL =
  process.env.VIDEO_HUNYUAN_I2V_MODEL?.trim() ||
  "hunyuanvideo1.5_480p_i2v_step_distilled_fp8_scaled.safetensors";
const VIDEO_HUNYUAN_SR_MODEL =
  process.env.VIDEO_HUNYUAN_SR_MODEL?.trim() ||
  "hunyuanvideo1.5_1080p_sr_distilled_fp8_scaled.safetensors";
const VIDEO_HUNYUAN_MODEL_IS_480P = /(^|_)480p(_|$)/i.test(VIDEO_HUNYUAN_I2V_MODEL);
const VIDEO_HUNYUAN_TEXT_ENCODER_PRIMARY =
  process.env.VIDEO_HUNYUAN_TEXT_ENCODER_PRIMARY?.trim() || "qwen_2.5_vl_7b_fp8_scaled.safetensors";
const VIDEO_HUNYUAN_TEXT_ENCODER_SECONDARY =
  process.env.VIDEO_HUNYUAN_TEXT_ENCODER_SECONDARY?.trim() || "byt5_small_glyphxl_fp16.safetensors";
const VIDEO_HUNYUAN_VAE =
  process.env.VIDEO_HUNYUAN_VAE?.trim() || "hunyuanvideo15_vae_fp16.safetensors";
const VIDEO_HUNYUAN_CLIP_VISION =
  process.env.VIDEO_HUNYUAN_CLIP_VISION?.trim() || "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors";
const VIDEO_HUNYUAN_CLIP_DEVICE = process.env.VIDEO_HUNYUAN_CLIP_DEVICE?.trim() || "default";
const VIDEO_HUNYUAN_WEIGHT_DTYPE = process.env.VIDEO_HUNYUAN_WEIGHT_DTYPE?.trim() || "default";
const VIDEO_HUNYUAN_WIDTH = Number.parseInt(
  process.env.VIDEO_HUNYUAN_WIDTH ?? (VIDEO_HUNYUAN_MODEL_IS_480P ? "848" : "1280"),
  10
);
const VIDEO_HUNYUAN_HEIGHT = Number.parseInt(
  process.env.VIDEO_HUNYUAN_HEIGHT ?? (VIDEO_HUNYUAN_MODEL_IS_480P ? "480" : "720"),
  10
);
const VIDEO_HUNYUAN_FPS = Number.parseInt(process.env.VIDEO_HUNYUAN_FPS ?? "16", 10);
const VIDEO_HUNYUAN_MAX_FRAMES = parsePositiveInt(process.env.VIDEO_HUNYUAN_MAX_FRAMES, 49);
const VIDEO_HUNYUAN_STEPS = Number.parseInt(
  process.env.VIDEO_HUNYUAN_STEPS ?? (VIDEO_HUNYUAN_MODEL_IS_480P ? "12" : "20"),
  10
);
const VIDEO_HUNYUAN_CFG = Number.parseFloat(process.env.VIDEO_HUNYUAN_CFG ?? "1.0");
const VIDEO_HUNYUAN_SAMPLER = process.env.VIDEO_HUNYUAN_SAMPLER?.trim() || "euler";
const VIDEO_HUNYUAN_SCHEDULER = process.env.VIDEO_HUNYUAN_SCHEDULER?.trim() || "simple";
const VIDEO_HUNYUAN_IMAGE_INTERLEAVE = Number.parseInt(process.env.VIDEO_HUNYUAN_IMAGE_INTERLEAVE ?? "2", 10);
const VIDEO_HUNYUAN_RESOLUTION_PROFILE =
  process.env.VIDEO_HUNYUAN_RESOLUTION_PROFILE?.trim() ||
  (VIDEO_HUNYUAN_MODEL_IS_480P ? "480p_i2v_step_distilled" : "720p_i2v");
const VIDEO_HUNYUAN_STEP_PROFILE = process.env.VIDEO_HUNYUAN_STEP_PROFILE?.trim() || "installed-default";
const VIDEO_HUNYUAN_CACHE_PROFILE = process.env.VIDEO_HUNYUAN_CACHE_PROFILE?.trim() || "off";
const VIDEO_HUNYUAN_SR_PROFILE = process.env.VIDEO_HUNYUAN_SR_PROFILE?.trim() || "off";
const VIDEO_HUNYUAN_PREMIUM_DEFAULT = parseBoolean(process.env.VIDEO_HUNYUAN_PREMIUM_DEFAULT, true);
const VIDEO_HUNYUAN_OFFLOAD_MODE = process.env.VIDEO_HUNYUAN_OFFLOAD_MODE?.trim() || "auto";
const VIDEO_HUNYUAN_VRAM_MODE = process.env.VIDEO_HUNYUAN_VRAM_MODE?.trim() || "auto";
const VIDEO_HUNYUAN_SR_NOISE_AUGMENTATION = Number.parseFloat(
  process.env.VIDEO_HUNYUAN_SR_NOISE_AUGMENTATION ?? "0.7"
);
const VIDEO_HUNYUAN_SR_SCALE = Number.parseFloat(
  process.env.VIDEO_HUNYUAN_SR_SCALE ?? (VIDEO_HUNYUAN_MODEL_IS_480P ? "2.25" : "1.5")
);
const VIDEO_HUNYUAN_SR_TILED_VAE_DECODE = parseBoolean(process.env.VIDEO_HUNYUAN_SR_TILED_VAE_DECODE, true);
const VIDEO_HUNYUAN_SR_VAE_TILE_SIZE = parsePositiveInt(process.env.VIDEO_HUNYUAN_SR_VAE_TILE_SIZE, 512);
const VIDEO_HUNYUAN_SR_VAE_OVERLAP = parseNonNegativeInt(process.env.VIDEO_HUNYUAN_SR_VAE_OVERLAP, 64);
const VIDEO_HUNYUAN_SR_VAE_TEMPORAL_SIZE = parsePositiveInt(process.env.VIDEO_HUNYUAN_SR_VAE_TEMPORAL_SIZE, 16);
const VIDEO_HUNYUAN_SR_VAE_TEMPORAL_OVERLAP = parsePositiveInt(process.env.VIDEO_HUNYUAN_SR_VAE_TEMPORAL_OVERLAP, 4);
const VIDEO_SIDECAR_BENCHMARK_FAST_MODE = parseBoolean(
  process.env.VIDEO_SIDECAR_BENCHMARK_FAST_MODE ?? process.env.BENCHMARK_PRESET_FAST_MODE,
  false
);
const VIDEO_SIDECAR_PREMIUM_CANDIDATE_COUNT = Math.min(
  3,
  parsePositiveInt(process.env.VIDEO_SIDECAR_PREMIUM_CANDIDATE_COUNT, VIDEO_SIDECAR_BENCHMARK_FAST_MODE ? 1 : 3)
);
const PREMIUM_SIDECAR_PROMPT_CANDIDATE_JUDGE_VERSION = "premium_prompt_candidate_judge_v1";
const VIDEO_SIDECAR_PREMIUM_ACTUAL_CANDIDATE_COUNT = Math.min(
  3,
  parsePositiveInt(process.env.VIDEO_SIDECAR_PREMIUM_ACTUAL_CANDIDATE_COUNT, VIDEO_SIDECAR_BENCHMARK_FAST_MODE ? 1 : 2)
);
const VIDEO_SIDECAR_PREMIUM_ACTUAL_RETAKE_COUNT = Math.max(
  0,
  Math.min(1, parseNonNegativeInt(process.env.VIDEO_SIDECAR_PREMIUM_ACTUAL_RETAKE_COUNT, VIDEO_SIDECAR_BENCHMARK_FAST_MODE ? 0 : 1))
);
const PREMIUM_SIDECAR_ACTUAL_CANDIDATE_JUDGE_VERSION = "premium_actual_output_candidate_judge_v2";

type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
type ActiveJobStatus = "QUEUED" | "RUNNING";
type EpisodeStatus = "GENERATING" | "PREVIEW_READY" | "COMPLETED" | "FAILED";
type RenderStage = typeof RENDER_PREVIEW_JOB_NAME | typeof RENDER_FINAL_JOB_NAME | typeof RENDER_EPISODE_JOB_NAME;
type CurrentJobState = { status: JobStatus; maxAttempts: number; retryBackoffMs: number };
type WorkerQueuePayload = EpisodeJobPayload;
type StoredQcReport = {
  final_passed?: boolean;
  final_stage?: string;
  generated_at?: string;
  fallback_steps_applied?: string[];
  runs?: Array<{ issues?: Array<{ code?: string; severity?: string; message?: string; shotId?: string; details?: Record<string, unknown> }> }>;
};

type RenderFailureIssue = {
  code: string;
  severity: "INFO" | "WARN" | "ERROR";
  message: string;
  shotId: string | null;
};

type RetrySummaryReport = {
  schema_version: "1.0";
  generated_at: string;
  episode_id: string;
  stage: RenderStage;
  attempt: number;
  recovery_mode: boolean;
  recovery_source: "explicit" | "qc_report" | "none";
  requested_failed_shot_ids: string[];
  partial_shots_path: string | null;
  failed_shot_summary: {
    total_error_issues: number;
    unique_failed_shot_count: number;
    unique_failed_shot_ids: string[];
    by_code: Array<{ code: string; count: number }>;
  };
  issues: RenderFailureIssue[];
  qc_report_path: string;
};

type ShotSidecarPresetLike = {
  sidecar_preset?: {
    controlnet_preset?: unknown;
    impact_preset?: unknown;
    qc_preset?: unknown;
    preset_source?: unknown;
    policy_tags?: unknown;
  };
};

type ResolvedShotSidecarPreset = {
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
  presetSource: string;
  policyTags: string[];
  rolloutSource: string | null;
  rolloutSourceKind: "file" | "matrix" | null;
  rolloutScenario: string | null;
  rolloutScore: number | null;
  rolloutVerdict: string | null;
  rolloutTarget: "overall" | "balanced" | "strict" | null;
  rolloutArtifactAgeHours: number | null;
  rolloutChannelDomain: "economy" | "medical" | null;
};

type PremiumSidecarCandidateObjective = "identity_anchor" | "motion_balance" | "silhouette_safe";

type PremiumSidecarPromptCandidateScoreBreakdown = {
  face_stability: number;
  motion_coherence: number;
  silhouette_readability: number;
  mascot_identity_preservation: number;
  safe_zone_readiness: number;
  total: number;
};

type PremiumSidecarPromptCandidateSnapshot = {
  candidate_id: string;
  objective: PremiumSidecarCandidateObjective;
  prompt_additions: string[];
  negative_prompt_additions: string[];
  prompt: string;
  negative_prompt: string;
  seed_override: number;
  score: number;
  score_breakdown: PremiumSidecarPromptCandidateScoreBreakdown;
  reasoning_tags: string[];
};

type PremiumSidecarPromptJudgeReport = {
  schema_version: "1.0";
  judge_version: string;
  episode_id: string;
  shot_id: string;
  renderer: string;
  backend: SidecarBackendCapability;
  premium_flag: true;
  candidate_count: number;
  selected_candidate_id: string;
  selected_objective: PremiumSidecarCandidateObjective;
  selected_score: number;
  selected_seed_override: number;
  selection_reason: string;
  candidates: PremiumSidecarPromptCandidateSnapshot[];
};

type PremiumSidecarSelectionMetadata = {
  premiumCandidateJudgeVersion: string | null;
  premiumCandidateCount: number | null;
  premiumSelectedCandidateId: string | null;
  premiumSelectedCandidateObjective: string | null;
  premiumSelectedCandidateScore: number | null;
  premiumCandidateSelectionReason: string | null;
  premiumCandidateJudgePath: string | null;
  premiumSelectedSeedOverride: number | null;
};

type PremiumSidecarExecutionCandidate = {
  candidateId: string;
  objective: PremiumSidecarCandidateObjective;
  priorScore: number;
  reasoningTags: string[];
  requestPack: ReturnType<typeof buildBrollPromptPack>;
};

type PremiumActualOutputCandidateReport = {
  candidate_id: string;
  objective: PremiumSidecarCandidateObjective;
  execution_shot_id: string;
  prior_score: number;
  output_score: number;
  selected: boolean;
  success: boolean;
  accepted_by_policy: boolean | null;
  policy_rejection_reasons: string[];
  judge_policy_version: string | null;
  retake_round: number;
  cached: boolean | null;
  latency_ms: number | null;
  output_duration_seconds: number | null;
  duration_delta_seconds: number | null;
  qc_passed: boolean | null;
  qc_reasons: string[];
  qc_warnings: string[];
  public_video_src: string | null;
  output_video_path: string | null;
  result_path: string | null;
  workflow_path: string | null;
  preflight_path: string | null;
  cache_key: string | null;
  seed_override: number | null;
  visual_signal_mode: PremiumActualVisualSignalMode | null;
  visual_signal_score: number | null;
  face_stability_score: number | null;
  motion_coherence_score: number | null;
  silhouette_readability_score: number | null;
  mascot_identity_preservation_score: number | null;
  subtitle_safe_score: number | null;
  chart_safe_score: number | null;
  visual_signal_warnings: string[];
  visual_signal_report_path: string | null;
  error: string | null;
  reasoning_tags: string[];
};

type PremiumActualOutputJudgeReport = {
  schema_version: "1.0";
  judge_version: string;
  judge_policy_version: string;
  episode_id: string;
  shot_id: string;
  renderer: string;
  backend: SidecarBackendCapability;
  candidate_count: number;
  accepted_candidate_count: number;
  retake_count: number;
  selected_candidate_id: string | null;
  selected_objective: PremiumSidecarCandidateObjective | null;
  selected_score: number | null;
  selection_reason: string | null;
  candidates: PremiumActualOutputCandidateReport[];
};

type PremiumActualSelectionMetadata = {
  premiumActualJudgeVersion: string | null;
  premiumActualJudgePolicyVersion: string | null;
  premiumActualCandidateCount: number | null;
  premiumActualSelectedCandidateId: string | null;
  premiumActualSelectedObjective: string | null;
  premiumActualSelectedScore: number | null;
  premiumActualSelectionReason: string | null;
  premiumActualJudgePath: string | null;
  premiumActualPolicyAccepted: boolean | null;
  premiumActualPolicyRejectionReasons: string[];
  premiumActualRetakeRound: number | null;
  premiumActualRetakeCount: number | null;
  premiumActualVisualSignalMode: PremiumActualVisualSignalMode | null;
  premiumActualVisualSignalScore: number | null;
  premiumActualVisualSignalReportPath: string | null;
  premiumActualFaceStabilityScore: number | null;
  premiumActualMotionCoherenceScore: number | null;
  premiumActualSilhouetteReadabilityScore: number | null;
  premiumActualMascotIdentityPreservationScore: number | null;
  premiumActualSubtitleSafeScore: number | null;
  premiumActualChartSafeScore: number | null;
};

type ShotsDocumentLike = {
  shots?: Array<{
    shot_id?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

type BeatDocFileLike = {
  episode?: {
    profiles?: unknown;
  };
  beats?: Array<{
    beat_id?: unknown;
    narration?: unknown;
    tags?: unknown;
  }>;
};

type ShotDocFileLike = {
  render?: {
    fps?: unknown;
  };
  shots?: Array<{
    shot_id?: unknown;
    beat_ids?: unknown;
    start_frame?: unknown;
    duration_frames?: unknown;
    talk_text?: unknown;
    emphasis_words?: unknown;
    camera?: {
      preset?: unknown;
    };
    transition?: unknown;
    chart?: {
      highlights?: unknown;
      callouts?: unknown;
    };
  }>;
};

type CharacterPackJson = {
  schema_version: "1.0";
  pack_id: string;
  meta: {
    name: string;
    created_at: string;
    source_image_ref?: string;
    notes?: string;
  };
  canvas: {
    base_width: number;
    base_height: number;
    coord_space: "pixels";
  };
  assets: {
    images: Record<string, string>;
  };
  slots: Array<{
    slot_id: string;
    default_image_id: string;
    z_index?: number;
  }>;
  skeleton: {
    bones: Array<{
      bone_id: string;
      parent_id: string;
      rest: {
        x: number;
        y: number;
        rotation_deg: number;
      };
      limits?: {
        min_rotation_deg?: number;
        max_rotation_deg?: number;
      };
    }>;
    attachments: Array<{
      slot_id: string;
      image_id: string;
      bone_id: string;
      pivot: {
        px: number;
        py: number;
      };
      offset?: {
        x?: number;
        y?: number;
      };
      scale?: {
        x?: number;
        y?: number;
      };
      rotation_deg?: number;
    }>;
  };
  visemes: Record<
    string,
    {
      slot_id: string;
      image_id: string;
    }
  >;
  expressions: Record<
    string,
    {
      slot_overrides?: Array<{
        slot_id: string;
        image_id: string;
      }>;
      bone_overrides?: Array<{
        bone_id: string;
        rotation_deg?: number;
        x?: number;
        y?: number;
      }>;
    }
  >;
  clips: Array<{
    clip_id: string;
    duration_frames: number;
    tracks: Record<string, unknown>;
  }>;
  ik_chains: Array<{
    chain_id: string;
    bones: [string, string];
    effector_bone_id: string;
    elbow_hint?: "up" | "down";
    max_stretch?: number;
  }>;
};

type CharacterOutputPaths = {
  outDir: string;
  packPath: string;
  previewPath: string;
  qcReportPath: string;
};

type PremiumActualSuccessfulCandidate = {
  candidate: PremiumSidecarExecutionCandidate;
  plan: ShotSidecarPlan;
  outputScore: number;
  visualSignalReport: PremiumActualVisualSignalReport;
  visualSignalPath: string;
  policyEvaluation: ReturnType<typeof evaluateSidecarRuntimeJudge>;
  retakeRound: number;
};

type CharacterViewName = "front" | "threeQuarter" | "profile";
type VideoBrollSpeciesId = "cat" | "dog" | "wolf";
type VideoBrollReferenceSource = "generated_asset" | "character_pack_asset" | "starter" | "env_fallback";
type CharacterViewScoreSummary = {
  candidateId: string | null;
  source: "selected_candidate" | "best_in_view" | "missing";
  score: number | null;
  alpha: number | null;
  bbox: number | null;
  sharpness: number | null;
  consistency: number | null;
  warningCount: number;
  rejectionCount: number;
  warnings: string[];
  rejections: string[];
};

const CHARACTER_VIEW_NAMES: CharacterViewName[] = ["front", "threeQuarter", "profile"];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaValidator = new SchemaValidator(path.resolve(__dirname, "../../../packages/schemas"));

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function sanitizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x.length > 0);
}

function parseBoolean(v: string | undefined, fallback: boolean): boolean {
  if (!v) return fallback;
  const n = v.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(n)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(n)) return false;
  return fallback;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function logSidecarPresetRolloutStartupHealth(): void {
  try {
    const validation = validateRuntimeSidecarPresetRollout({
      repoRoot: REPO_ROOT
    });
    const inspection = validation.inspection;
    if (!inspection.enabled) {
      console.log(`[worker] sidecar preset rollout disabled. reason=${inspection.reason}`);
      return;
    }
    const sourceLabel = inspection.rolloutSourcePath ? path.basename(inspection.rolloutSourcePath) : "missing";
    const candidateLabel = inspection.candidate
      ? `${inspection.candidate.controlnet_preset}/${inspection.candidate.impact_preset}/${inspection.candidate.qc_preset}`
      : "none";
    const modeLabel = validation.rollout_mode;
    const bundleLabel = validation.default_bundle ? ` bundle=${validation.default_bundle}` : "";
    console.log(
      `[worker] sidecar preset rollout mode=${modeLabel}${bundleLabel} status=${inspection.status} target=${inspection.resolvedTarget} source=${sourceLabel} candidate=${candidateLabel} reason=${inspection.reason}`
    );
    if (validation.cross_channel) {
      const differingAxesLabel =
        validation.cross_channel.differing_axes.length > 0
          ? validation.cross_channel.differing_axes.join(",")
          : "none";
      console.log(
        `[worker] sidecar preset rollout cross-channel status=${validation.cross_channel.status} divergence=${validation.cross_channel.divergence_level ?? "unknown"} axes=${differingAxesLabel} score_gap=${validation.cross_channel.score_gap ?? "n/a"} recommendation=${validation.cross_channel.recommendation ?? "n/a"}`
      );
    }
    if (parseBoolean(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_REQUIRE_READY, false) && !validation.ready) {
      throw new Error(
        `required rollout is not ready: target=${validation.default_target} status=${inspection.status} reason=${inspection.reason}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (parseBoolean(process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_REQUIRE_READY, false)) {
      throw new Error(`[worker] sidecar preset rollout health check failed: ${message}`);
    }
    console.error(`[worker] sidecar preset rollout health check failed: ${message}`);
  }
}

function logMotionPresetBenchmarkStartupHealth(): void {
  try {
    const validation = validateMotionPresetBenchmark({
      repoRoot: REPO_ROOT
    });
    if (!validation.enabled) {
      console.log(`[worker] motion preset benchmark disabled. reason=${validation.reason}`);
      return;
    }
    const sourceLabel = validation.benchmark_file_exists ? path.basename(validation.benchmark_path) : "missing";
    console.log(
      `[worker] motion preset benchmark status=${validation.status} source=${sourceLabel} records=${validation.observed_record_count}/${validation.expected_record_count} failed=${validation.failed_records.length} age_hours=${validation.benchmark_age_hours ?? "n/a"} reason=${validation.reason}`
    );
    if (parseBoolean(process.env.VIDEO_MOTION_PRESET_BENCHMARK_REQUIRE_READY, false) && !validation.ready) {
      throw new Error(`required motion preset benchmark is not ready: status=${validation.status} reason=${validation.reason}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (parseBoolean(process.env.VIDEO_MOTION_PRESET_BENCHMARK_REQUIRE_READY, false)) {
      throw new Error(`[worker] motion preset benchmark health check failed: ${message}`);
    }
    console.error(`[worker] motion preset benchmark health check failed: ${message}`);
  }
}

function isEpisodePayload(value: unknown): value is EpisodeJobPayload {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.jobDbId === "string" && value.jobDbId.trim().length > 0 && typeof value.episodeId === "string" && value.episodeId.trim().length > 0;
}

function isAssetIngestPayload(value: unknown): value is AssetIngestQueuePayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.assetId === "string";
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return task;
  }
  return await Promise.race([
    task,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
    })
  ]);
}

function requireCharacterPayload(
  payload: EpisodeJobPayload
): CharacterPackJobPayload & { assetIds: CharacterAssetSelection } {
  const character = payload.character;
  if (!character) {
    throw new Error("Missing payload.character");
  }

  if (typeof character.characterPackId !== "string" || character.characterPackId.trim().length === 0) {
    throw new Error("payload.character.characterPackId is required");
  }

  if (!character.assetIds || typeof character.assetIds.front !== "string" || typeof character.assetIds.threeQuarter !== "string" || typeof character.assetIds.profile !== "string") {
    throw new Error("payload.character.assetIds(front/threeQuarter/profile) are required");
  }

  return character as CharacterPackJobPayload & { assetIds: CharacterAssetSelection };
}

function getCharacterOutputPaths(characterPackId: string): CharacterOutputPaths {
  const outDir = path.join(REPO_ROOT, "out", "characters", characterPackId);
  return {
    outDir,
    packPath: path.join(outDir, "pack.json"),
    previewPath: path.join(outDir, "preview.mp4"),
    qcReportPath: path.join(outDir, "qc_report.json")
  };
}

function toNullableScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function emptyCharacterViewScoreSummary(): CharacterViewScoreSummary {
  return {
    candidateId: null,
    source: "missing",
    score: null,
    alpha: null,
    bbox: null,
    sharpness: null,
    consistency: null,
    warningCount: 0,
    rejectionCount: 0,
    warnings: [],
    rejections: []
  };
}

function emptyCharacterViewScoreMap(): Record<CharacterViewName, CharacterViewScoreSummary> {
  return {
    front: emptyCharacterViewScoreSummary(),
    threeQuarter: emptyCharacterViewScoreSummary(),
    profile: emptyCharacterViewScoreSummary()
  };
}

function extractSelectedCandidateId(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (isRecord(value) && typeof value.candidateId === "string" && value.candidateId.trim().length > 0) {
    return value.candidateId.trim();
  }
  return null;
}

function normalizeSelectedCandidateMap(value: unknown): Record<CharacterViewName, string | null> {
  const record = isRecord(value) ? value : {};
  return {
    front: extractSelectedCandidateId(record.front),
    threeQuarter: extractSelectedCandidateId(record.threeQuarter),
    profile: extractSelectedCandidateId(record.profile)
  };
}

function summarizeCharacterGenerationScoresFromManifest(input: {
  manifest: Record<string, unknown>;
  selectedCandidateIds?: Record<CharacterViewName, string | null>;
}): Record<CharacterViewName, CharacterViewScoreSummary> {
  const views = emptyCharacterViewScoreMap();
  const manifestSelectedByView = isRecord(input.manifest.selectedByView) ? input.manifest.selectedByView : {};
  const selectedMap: Record<CharacterViewName, string | null> = {
    front: input.selectedCandidateIds?.front ?? extractSelectedCandidateId(manifestSelectedByView.front),
    threeQuarter:
      input.selectedCandidateIds?.threeQuarter ?? extractSelectedCandidateId(manifestSelectedByView.threeQuarter),
    profile: input.selectedCandidateIds?.profile ?? extractSelectedCandidateId(manifestSelectedByView.profile)
  };

  const manifestCandidates = Array.isArray(input.manifest.candidates) ? input.manifest.candidates : [];
  for (const viewName of CHARACTER_VIEW_NAMES) {
    const candidates = manifestCandidates
      .filter((entry): entry is Record<string, unknown> => isRecord(entry) && entry.view === viewName)
      .sort((left, right) => {
        const leftScore = typeof left.score === "number" ? left.score : -1;
        const rightScore = typeof right.score === "number" ? right.score : -1;
        return rightScore - leftScore;
      });

    const selectedId = selectedMap[viewName];
    const selectedCandidate =
      selectedId === null
        ? null
        : candidates.find((candidate) => typeof candidate.id === "string" && candidate.id === selectedId) ?? null;
    const target = selectedCandidate ?? candidates[0] ?? null;
    if (!target) {
      continue;
    }

    const breakdown = isRecord(target.breakdown) ? target.breakdown : {};
    const warnings = sanitizeStringArray(target.warnings);
    const rejections = sanitizeStringArray(target.rejections);
    views[viewName] = {
      candidateId: typeof target.id === "string" ? target.id : null,
      source: selectedCandidate ? "selected_candidate" : "best_in_view",
      score: toNullableScore(target.score),
      alpha: toNullableScore(breakdown.alphaScore),
      bbox: toNullableScore(breakdown.occupancyScore),
      sharpness: toNullableScore(breakdown.sharpnessScore),
      consistency: toNullableScore(
        typeof target.consistencyScore === "number" ? target.consistencyScore : breakdown.consistencyScore
      ),
      warningCount: warnings.length,
      rejectionCount: rejections.length,
      warnings,
      rejections
    };
  }

  return views;
}

function summarizeCharacterGenerationScores(character: CharacterPackJobPayload): {
  manifestPath: string | null;
  views: Record<CharacterViewName, CharacterViewScoreSummary>;
  warnings: string[];
} {
  const views = emptyCharacterViewScoreMap();

  const manifestPathRaw = character.generation?.manifestPath;
  const manifestPath = typeof manifestPathRaw === "string" && manifestPathRaw.trim().length > 0 ? manifestPathRaw : null;
  const warnings: string[] = [];

  if (!manifestPath) {
    warnings.push("generation_manifest_path_missing");
    return { manifestPath, views, warnings };
  }

  if (!fs.existsSync(manifestPath)) {
    warnings.push("generation_manifest_not_found");
    return { manifestPath, views, warnings };
  }

  const parsed = readJsonFile<unknown>(manifestPath);
  if (!isRecord(parsed) || !Array.isArray(parsed.candidates)) {
    warnings.push("generation_manifest_invalid_shape");
    return { manifestPath, views, warnings };
  }

  return {
    manifestPath,
    views: summarizeCharacterGenerationScoresFromManifest({
      manifest: parsed,
      selectedCandidateIds: normalizeSelectedCandidateMap(character.generation?.selectedCandidateIds)
    }),
    warnings
  };
}

function ensureCharacterOut(characterPackId: string): CharacterOutputPaths {
  const out = getCharacterOutputPaths(characterPackId);
  fs.mkdirSync(path.join(out.outDir, "assets"), { recursive: true });
  return out;
}

function resolveAssetStorageKey(asset: {
  normalizedKey1024: string | null;
  normalizedKey2048: string | null;
  originalKey: string | null;
  storageKey: string;
}): string {
  return asset.normalizedKey1024 ?? asset.normalizedKey2048 ?? asset.originalKey ?? asset.storageKey;
}

async function normalizeCharacterViewImage(buffer: Buffer, outputPath: string): Promise<string> {
  const processed = await sharp(buffer)
    .rotate()
    .ensureAlpha()
    .resize({
      height: 820,
      fit: "inside",
      withoutEnlargement: true
    })
    .png()
    .toBuffer();
  fs.writeFileSync(outputPath, processed);
  return pathToFileURL(outputPath).href;
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const message = [
        `Command failed: ${command} ${args.join(" ")}`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
        stderr.trim() ? `stderr:\n${stderr.trim()}` : ""
      ]
        .filter((part) => part.length > 0)
        .join("\n\n");

      reject(new Error(message));
    });
  });
}

function resolveAudioPronunciationDictionaryPath(outDir: string): string {
  const envPath = process.env.AUDIO_PRONUNCIATION_DICTIONARY_PATH;
  if (envPath) {
    const resolved = path.resolve(envPath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  const fixturePath = path.join(REPO_ROOT, "packages", "audio", "fixtures", "pronunciation.json");
  if (fs.existsSync(fixturePath)) {
    return fixturePath;
  }

  const fallbackPath = path.join(outDir, "pronunciation.empty.json");
  if (!fs.existsSync(fallbackPath)) {
    fs.writeFileSync(fallbackPath, "{}\n", "utf8");
  }
  return fallbackPath;
}

type PreviewTtsResolution = {
  provider: TTSProvider;
  providerName: "mock";
  fallbackName?: never;
  warning?: string;
};

function parseJsonStringArray(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function resolvePreviewTtsProvider(outDir: string, onFallback: (reason: string) => void): PreviewTtsResolution {
  const requested = (process.env.AUDIO_TTS_PROVIDER ?? "auto").trim().toLowerCase();
  void onFallback;
  void parseJsonStringArray;

  const mockProvider = new MockTTSProvider(outDir);

  if (requested === "mock" || requested === "auto") {
    return {
      provider: mockProvider,
      providerName: "mock"
    };
  }

  return {
    provider: mockProvider,
    providerName: "mock",
    warning: `AUDIO_TTS_PROVIDER=${requested} is not supported in this build; using mock`
  };
}

function buildAudioCues(beatsPath: string, shotsPath: string): {
  beats: AudioBeatCue[];
  shots: AudioShotCue[];
  scriptText: string;
} {
  const beatDoc = readJsonFile<BeatDocFileLike>(beatsPath);
  const shotDoc = readJsonFile<ShotDocFileLike>(shotsPath);

  const shotRows = Array.isArray(shotDoc.shots) ? shotDoc.shots : [];
  const fps = Math.max(1, parseNumber(shotDoc.render?.fps, 30));

  const beatStartSecById = new Map<string, number>();
  const beatTextById = new Map<string, string>();
  for (const beat of Array.isArray(beatDoc.beats) ? beatDoc.beats : []) {
    const beatId = typeof beat.beat_id === "string" ? beat.beat_id.trim() : "";
    const narration = typeof beat.narration === "string" ? beat.narration.trim() : "";
    if (beatId.length > 0 && narration.length > 0) {
      beatTextById.set(beatId, narration);
    }
  }
  const shots: AudioShotCue[] = shotRows.map((shot, index) => {
    const shotIdRaw = typeof shot.shot_id === "string" ? shot.shot_id : `shot_${index + 1}`;
    const shotId = shotIdRaw.trim() || `shot_${index + 1}`;
    const startFrame = Math.max(0, parseNumber(shot.start_frame, index * 90));
    const durationFrames = Math.max(1, parseNumber(shot.duration_frames, 90));
    const startSec = startFrame / fps;
    const durationSec = durationFrames / fps;

    const beatIds = parseStringArray(shot.beat_ids);
    const explicitTalkText = typeof shot.talk_text === "string" ? shot.talk_text.trim() : "";
    const shotText =
      explicitTalkText.length > 0
        ? explicitTalkText
        : beatIds
            .map((beatId) => beatTextById.get(beatId) ?? "")
            .filter((value) => value.length > 0)
            .join(" ")
            .trim();
    for (const beatId of beatIds) {
      if (!beatStartSecById.has(beatId)) {
        beatStartSecById.set(beatId, startSec);
      }
    }

    const tags: string[] = [];
    const preset = typeof shot.camera?.preset === "string" ? shot.camera.preset.toLowerCase() : "";
    if (preset) {
      tags.push(`camera:${preset}`);
      if (/(whip|fade|cut|flash|transition)/i.test(preset)) {
        tags.push("transition");
      }
    }

    if (typeof shot.transition === "string" && shot.transition.trim().length > 0) {
      tags.push(`transition:${shot.transition.trim().toLowerCase()}`);
      tags.push("transition");
    }

    const chartHighlights = Array.isArray(shot.chart?.highlights) ? shot.chart?.highlights : [];
    const chartCallouts = Array.isArray(shot.chart?.callouts) ? shot.chart?.callouts : [];
    if (shot.chart) {
      tags.push("chart");
      tags.push("countup");
    }
    if (chartHighlights && chartHighlights.length > 0) {
      tags.push("highlight");
    }
    if (chartCallouts && chartCallouts.length > 0) {
      tags.push("emphasis");
    }

    const emphasisWords = parseStringArray(shot.emphasis_words);
    if (emphasisWords.length > 0) {
      tags.push(...emphasisWords.map((word) => `emphasis:${word.toLowerCase()}`));
    }

    return {
      id: shotId,
      startSec,
      durationSec,
      tags: uniqueStrings(tags),
      ...(shotText.length > 0 ? { text: shotText } : {})
    };
  });

  const beatRows = Array.isArray(beatDoc.beats) ? beatDoc.beats : [];
  const beats: AudioBeatCue[] = beatRows.map((beat, index) => {
    const beatIdRaw = typeof beat.beat_id === "string" ? beat.beat_id : `beat_${index + 1}`;
    const beatId = beatIdRaw.trim() || `beat_${index + 1}`;
    const tags = parseStringArray(beat.tags);
    const fallbackSec = index * 2.2;
    const startSec = beatStartSecById.get(beatId) ?? fallbackSec;
    const text = typeof beat.narration === "string" ? beat.narration : undefined;
    return { id: beatId, startSec, tags, ...(text ? { text } : {}) };
  });

  const scriptText = beatRows
    .map((beat) => (typeof beat.narration === "string" ? beat.narration.trim() : ""))
    .filter((line) => line.length > 0)
    .join(" ");

  return {
    beats,
    shots,
    scriptText: scriptText.length > 0 ? scriptText : "Episode preview narration."
  };
}

function readFailedShotIdsFromQcReport(qcReportPath: string): string[] {
  if (!fs.existsSync(qcReportPath)) return [];
  try {
    const report = JSON.parse(fs.readFileSync(qcReportPath, "utf8")) as StoredQcReport;
    const runs = Array.isArray(report.runs) ? report.runs : [];
    const issues = Array.isArray(runs[runs.length - 1]?.issues) ? runs[runs.length - 1]!.issues! : [];
    const out: string[] = [];
    for (const issue of issues) {
      const severity = asString(issue.severity, "INFO").toUpperCase();
      if (severity !== "ERROR") continue;
      const shotId = asString(issue.shotId, "").trim();
      if (!shotId) continue;
      out.push(shotId);
    }
    return uniqueStrings(out);
  } catch {
    return [];
  }
}

function readErrorIssuesFromQcReport(qcReportPath: string): RenderFailureIssue[] {
  if (!fs.existsSync(qcReportPath)) return [];
  try {
    const report = JSON.parse(fs.readFileSync(qcReportPath, "utf8")) as StoredQcReport;
    const runs = Array.isArray(report.runs) ? report.runs : [];
    const issues = Array.isArray(runs[runs.length - 1]?.issues) ? runs[runs.length - 1]!.issues! : [];
    const out: RenderFailureIssue[] = [];

    for (const issue of issues) {
      const severityRaw = asString(issue.severity, "INFO").toUpperCase();
      const severity: RenderFailureIssue["severity"] =
        severityRaw === "ERROR" ? "ERROR" : severityRaw === "WARN" ? "WARN" : "INFO";
      if (severity !== "ERROR") continue;
      out.push({
        code: asString(issue.code, "unknown"),
        severity,
        message: asString(issue.message, "unknown"),
        shotId: asString(issue.shotId, "").trim() || null
      });
    }
    return out;
  } catch {
    return [];
  }
}

function buildRetrySummaryReport(input: {
  episodeId: string;
  stage: RenderStage;
  attempt: number;
  recoveryMode: boolean;
  recoverySource: "explicit" | "qc_report" | "none";
  requestedFailedShotIds: string[];
  partialShotsPath: string | null;
  qcReportPath: string;
}): RetrySummaryReport {
  const issues = readErrorIssuesFromQcReport(input.qcReportPath);
  const failedShotIds = uniqueStrings(
    issues.map((issue) => (issue.shotId ? issue.shotId.trim() : "")).filter((shotId) => shotId.length > 0)
  );
  const codeCount = new Map<string, number>();
  for (const issue of issues) {
    const code = issue.code.trim() || "unknown";
    codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
  }
  const byCode = Array.from(codeCount.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    episode_id: input.episodeId,
    stage: input.stage,
    attempt: input.attempt,
    recovery_mode: input.recoveryMode,
    recovery_source: input.recoverySource,
    requested_failed_shot_ids: input.requestedFailedShotIds,
    partial_shots_path: input.partialShotsPath,
    failed_shot_summary: {
      total_error_issues: issues.length,
      unique_failed_shot_count: failedShotIds.length,
      unique_failed_shot_ids: failedShotIds,
      by_code: byCode
    },
    issues,
    qc_report_path: input.qcReportPath
  };
}

function retrySummaryReportPath(episodeId: string, stage: RenderStage): string {
  const out = getEpisodeOutputPaths(episodeId);
  return path.join(out.outDir, `retry_summary_${stage.toLowerCase()}.json`);
}

function createPartialShotsPath(baseShotsPath: string, failedShotIds: string[], attempt: number): string | null {
  if (!fs.existsSync(baseShotsPath)) return null;
  const raw = fs.readFileSync(baseShotsPath, "utf8");
  const parsed = JSON.parse(raw) as ShotsDocumentLike;
  if (!Array.isArray(parsed.shots)) return null;

  const wanted = new Set(failedShotIds);
  const filtered = parsed.shots.filter((shot) => {
    const shotId = typeof shot.shot_id === "string" ? shot.shot_id : "";
    return wanted.has(shotId);
  });

  if (filtered.length === 0 || filtered.length === parsed.shots.length) return null;

  const outDir = path.join(path.dirname(baseShotsPath), "recovery");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `shots_retry_attempt_${attempt}.json`);

  const nextDoc: ShotsDocumentLike = {
    ...parsed,
    shots: filtered
  };
  fs.writeFileSync(outPath, `${JSON.stringify(nextDoc, null, 2)}\n`, "utf8");
  return outPath;
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map((item) => toPrismaJsonValue(item));
  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = toPrismaJsonValue(v);
    }
    return out;
  }
  return String(value);
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  const normalized = toPrismaJsonValue(value);
  return normalized === null ? PrismaRuntime.JsonNull : normalized;
}

async function logJob(jobId: string, level: string, message: string, details?: unknown) {
  await prisma.jobLog.create({
    data: { jobId, level, message, details: details === undefined ? undefined : toPrismaJson(details) }
  });
}

async function setJobStatus(
  jobId: string,
  status: JobStatus,
  patch?: Partial<{ progress: number; attemptsMade: number; lastError: string | null; startedAt: Date | null; finishedAt: Date | null }>
) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status,
      progress: patch?.progress ?? undefined,
      attemptsMade: patch?.attemptsMade ?? undefined,
      startedAt: patch?.startedAt ?? undefined,
      finishedAt: patch?.finishedAt ?? undefined,
      lastError: patch?.lastError ?? undefined
    }
  });
}

async function setEpisodeStatus(episodeId: string, status: EpisodeStatus) {
  await prisma.episode.update({ where: { id: episodeId }, data: { status } });
}

function ensureOut(episodeId: string) {
  const out = getEpisodeOutputPaths(episodeId);
  fs.mkdirSync(out.outDir, { recursive: true });
  return out;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function defaultShotRenderModeReportPath(shotsPath: string): string {
  const parsed = path.parse(shotsPath);
  return path.join(parsed.dir, `${parsed.name}.render_mode_report.json`);
}

function generateShotRenderModeReport(input: { shotsPath: string; outPath?: string | null }): {
  ok: boolean;
  reportPath: string;
  stdout?: string;
  stderr?: string;
  error?: string;
} {
  const scriptPath = path.join(REPO_ROOT, "scripts", "reportShotRenderModes.mjs");
  const reportPath = path.resolve(input.outPath?.trim() || defaultShotRenderModeReportPath(input.shotsPath));

  if (!fs.existsSync(scriptPath)) {
    return {
      ok: false,
      reportPath,
      error: `Missing script: ${scriptPath}`
    };
  }

  const result = spawnSync(process.execPath, [scriptPath, `--shots=${path.resolve(input.shotsPath)}`, `--out=${reportPath}`], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });

  if (result.error) {
    return {
      ok: false,
      reportPath,
      stdout: result.stdout ?? undefined,
      stderr: result.stderr ?? undefined,
      error: result.error.message
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      reportPath,
      stdout: result.stdout ?? undefined,
      stderr: result.stderr ?? undefined,
      error: `reportShotRenderModes exited with code ${result.status ?? 1}`
    };
  }

  return {
    ok: true,
    reportPath,
    stdout: result.stdout ?? undefined,
    stderr: result.stderr ?? undefined
  };
}

function attachShotRenderModeReportPathToRenderLog(renderLogPath: string, reportPath: string): void {
  if (!fs.existsSync(renderLogPath)) {
    return;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(renderLogPath, "utf8")) as Record<string, unknown>;
    parsed.shot_render_mode_report_path = reportPath;
    writeJson(renderLogPath, parsed);
  } catch {
    // Keep render completion non-fatal if the existing render log cannot be patched.
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= COMFY_FETCH_RETRY_COUNT; attempt += 1) {
    try {
      const res = await fetch(url, init);
      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        throw new Error(`ComfyUI request failed (${res.status}) [${url}]: ${text.slice(0, 300)}`);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt >= COMFY_FETCH_RETRY_COUNT) {
        break;
      }
      await sleep(COMFY_FETCH_RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error(
    `ComfyUI network request failed (${url}) after ${COMFY_FETCH_RETRY_COUNT} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function fetchBuffer(url: string): Promise<{ data: Buffer; contentType: string }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= COMFY_FETCH_RETRY_COUNT; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ComfyUI download failed (${res.status}) [${url}]: ${text.slice(0, 300)}`);
      }
      const ab = await res.arrayBuffer();
      return {
        data: Buffer.from(ab),
        contentType: res.headers.get("content-type") || "application/octet-stream"
      };
    } catch (error) {
      lastError = error;
      if (attempt >= COMFY_FETCH_RETRY_COUNT) {
        break;
      }
      await sleep(COMFY_FETCH_RETRY_DELAY_MS * attempt);
    }
  }
  throw new Error(
    `ComfyUI network download failed (${url}) after ${COMFY_FETCH_RETRY_COUNT} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

function hasComfyNode(objectInfo: unknown, name: string): boolean {
  return isRecord(objectInfo) && isRecord(objectInfo[name]);
}

function readComfyOptions(objectInfo: unknown, pathKeys: Array<string | number>): string[] {
  let cursor: unknown = objectInfo;
  for (const key of pathKeys) {
    if (Array.isArray(cursor) && typeof key === "number") {
      cursor = cursor[key];
      continue;
    }
    if (!isRecord(cursor) || !(String(key) in cursor)) {
      return [];
    }
    cursor = cursor[String(key)];
  }
  return Array.isArray(cursor) ? cursor.filter((entry): entry is string => typeof entry === "string") : [];
}

function normalizeComfyOptionName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.(safetensors|ckpt|pt|pth|bin)$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeComfyOptionName(value: string): string[] {
  return normalizeComfyOptionName(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function resolvePreferredComfyOption(input: {
  preferred: string | null | undefined;
  available: string[];
}): { selected: string | null; source: "configured" | "normalized_match" | "similar_match" | "first_available" | "missing" } {
  const available = input.available.filter((entry) => entry.trim().length > 0);
  if (available.length === 0) {
    return {
      selected: null,
      source: "missing"
    };
  }
  const preferred = input.preferred?.trim() || null;
  if (!preferred) {
    return {
      selected: available[0] ?? null,
      source: "first_available"
    };
  }
  const exact = available.find((entry) => entry === preferred);
  if (exact) {
    return {
      selected: exact,
      source: "configured"
    };
  }
  const preferredNormalized = normalizeComfyOptionName(preferred);
  const normalizedMatch = available.find((entry) => normalizeComfyOptionName(entry) === preferredNormalized);
  if (normalizedMatch) {
    return {
      selected: normalizedMatch,
      source: "normalized_match"
    };
  }
  const preferredTokens = new Set(tokenizeComfyOptionName(preferred));
  const ranked = available
    .map((entry) => {
      const optionTokens = tokenizeComfyOptionName(entry);
      const overlap = optionTokens.filter((token) => preferredTokens.has(token)).length;
      const normalized = normalizeComfyOptionName(entry);
      const containmentBonus =
        preferredNormalized.includes(normalized) || normalized.includes(preferredNormalized) ? 2 : 0;
      return {
        entry,
        score: overlap * 10 + containmentBonus - Math.abs(optionTokens.length - preferredTokens.size)
      };
    })
    .sort((left, right) => right.score - left.score);
  if ((ranked[0]?.score ?? 0) > 0) {
    return {
      selected: ranked[0]!.entry,
      source: "similar_match"
    };
  }
  return {
    selected: available[0] ?? null,
    source: "first_available"
  };
}

function normalizeWanLength(frames: number): number {
  const base = Math.max(17, Number.isFinite(frames) ? Math.round(frames) : 17);
  return Math.ceil((base - 1) / 4) * 4 + 1;
}

function normalizeWanTargetLength(durationSeconds: number, targetFps: number): number {
  const rawFrames = Math.max(17, Math.round(Math.max(0.8, durationSeconds) * Math.max(1, targetFps)));
  const cappedFrames = Math.min(rawFrames, Math.max(17, VIDEO_BROLL_WAN_MAX_FRAMES));
  return normalizeWanLength(cappedFrames);
}

function normalizeHunyuanTargetLength(durationSeconds: number, targetFps: number): number {
  const rawFrames = Math.max(17, Math.round(Math.max(0.8, durationSeconds) * Math.max(1, targetFps)));
  const cappedFrames = Math.min(rawFrames, Math.max(17, VIDEO_HUNYUAN_MAX_FRAMES));
  return normalizeWanLength(cappedFrames);
}

function roundDimensionToStep(value: number, step: number): number {
  const safeStep = Math.max(1, step);
  const rounded = Math.round(value / safeStep) * safeStep;
  return Math.max(safeStep, rounded);
}

function detectComfyModelRootStatus() {
  const extraModelPathsPath = path.join(
    process.env.COMFY_EXTRA_MODEL_PATHS_FILE?.trim() ||
      path.join(
        os.homedir(),
        "AppData",
        "Local",
        "Programs",
        "ComfyUI",
        "resources",
        "ComfyUI",
        "extra_model_paths.yaml"
      )
  );
  const exists = fs.existsSync(extraModelPathsPath);
  const yamlText = exists ? fs.readFileSync(extraModelPathsPath, "utf8") : "";
  const recognizesConfiguredRoot = yamlText.includes("base_path: C:\\models") || yamlText.includes("base_path: C:/models");
  return {
    extraModelPathsPath,
    exists,
    configuredRoot: COMFY_MODELS_ROOT,
    recognizesConfiguredRoot
  };
}

const SIDECAR_CONTROLNET_PRESET_IDS = new Set<SidecarControlNetPresetId>([
  "pose_depth_balance_v1",
  "pose_canny_balance_v1",
  "profile_lineart_depth_v1"
]);

const SIDECAR_IMPACT_PRESET_IDS = new Set<SidecarImpactPresetId>([
  "broadcast_cleanup_v1",
  "identity_repair_detail_v1",
  "soft_clarity_cleanup_v1",
  "soft_clarity_repair_v1"
]);

const SIDECAR_QC_PRESET_IDS = new Set<SidecarQcPresetId>([
  "broadcast_balanced_v1",
  "broadcast_identity_strict_v1"
]);

function isSidecarControlNetPresetId(value: unknown): value is SidecarControlNetPresetId {
  return typeof value === "string" && SIDECAR_CONTROLNET_PRESET_IDS.has(value as SidecarControlNetPresetId);
}

function isSidecarImpactPresetId(value: unknown): value is SidecarImpactPresetId {
  return typeof value === "string" && SIDECAR_IMPACT_PRESET_IDS.has(value as SidecarImpactPresetId);
}

function isSidecarQcPresetId(value: unknown): value is SidecarQcPresetId {
  return typeof value === "string" && SIDECAR_QC_PRESET_IDS.has(value as SidecarQcPresetId);
}

function resolveShotViewForSidecarPreset(
  shot: ShotSidecarRenderRequest["shot"],
  renderMode: ShotSidecarRenderRequest["renderMode"]
): "front" | "threeQuarter" | "profile" {
  const viewTrack = shot.character?.tracks?.view_track;
  if (Array.isArray(viewTrack) && viewTrack.length > 0) {
    const firstEntry = [...viewTrack].sort((left, right) => (left.f ?? 0) - (right.f ?? 0))[0];
    const candidate = firstEntry?.view;
    if (candidate === "front" || candidate === "threeQuarter" || candidate === "profile") {
      return candidate;
    }
  }
  if (renderMode === "generative_s2v") {
    return "profile";
  }
  if (renderMode === "generative_broll") {
    return "threeQuarter";
  }
  return "front";
}

function fallbackSidecarControlNetPreset(input: {
  shot: ShotSidecarRenderRequest["shot"];
  renderMode: ShotSidecarRenderRequest["renderMode"];
  cameraPreset: string;
}): SidecarControlNetPresetId {
  const view = resolveShotViewForSidecarPreset(input.shot, input.renderMode);
  if (view === "profile" || input.renderMode === "generative_s2v") {
    return "profile_lineart_depth_v1";
  }
  if (/whip|shake/i.test(input.cameraPreset)) {
    return "pose_canny_balance_v1";
  }
  return "pose_depth_balance_v1";
}

function fallbackSidecarImpactPreset(input: {
  renderMode: ShotSidecarRenderRequest["renderMode"];
  shotType: ShotSidecarRenderRequest["shotType"];
}): SidecarImpactPresetId {
  if (input.renderMode === "generative_i2v" || input.shotType === "reaction") {
    return "identity_repair_detail_v1";
  }
  return "broadcast_cleanup_v1";
}

function fallbackSidecarQcPreset(input: {
  shot: ShotSidecarRenderRequest["shot"];
  renderMode: ShotSidecarRenderRequest["renderMode"];
}): SidecarQcPresetId {
  const view = resolveShotViewForSidecarPreset(input.shot, input.renderMode);
  return input.renderMode === "generative_i2v" || view === "profile"
    ? "broadcast_identity_strict_v1"
    : "broadcast_balanced_v1";
}

function resolveShotSidecarPreset(input: {
  shot: ShotSidecarRenderRequest["shot"];
  renderMode: ShotSidecarRenderRequest["renderMode"];
  shotType: ShotSidecarRenderRequest["shotType"];
  cameraPreset: string;
  channelDomain?: "economy" | "medical" | null;
}): ResolvedShotSidecarPreset {
  const preset = (input.shot as ShotSidecarPresetLike).sidecar_preset;
  const controlnetPreset = isSidecarControlNetPresetId(preset?.controlnet_preset)
    ? preset.controlnet_preset
    : fallbackSidecarControlNetPreset({
        shot: input.shot,
        renderMode: input.renderMode,
        cameraPreset: input.cameraPreset
      });
  const impactPreset = isSidecarImpactPresetId(preset?.impact_preset)
    ? preset.impact_preset
    : fallbackSidecarImpactPreset({
        renderMode: input.renderMode,
        shotType: input.shotType
      });
  const qcPreset = isSidecarQcPresetId(preset?.qc_preset)
    ? preset.qc_preset
    : fallbackSidecarQcPreset({
        shot: input.shot,
        renderMode: input.renderMode
      });
  const basePreset: ResolvedShotSidecarPreset = {
    controlnetPreset,
    impactPreset,
    qcPreset,
    presetSource: typeof preset?.preset_source === "string" && preset.preset_source.trim().length > 0
      ? preset.preset_source.trim()
      : "worker_fallback_v1",
    policyTags: parseStringArray(preset?.policy_tags),
    rolloutSource: null,
    rolloutSourceKind: null,
    rolloutScenario: null,
    rolloutScore: null,
    rolloutVerdict: null,
    rolloutTarget: null,
    rolloutArtifactAgeHours: null,
    rolloutChannelDomain: null
  };
  const rolloutPreset = resolveRuntimeSidecarPresetRollout({
    repoRoot: REPO_ROOT,
    controlnetPreset: basePreset.controlnetPreset,
    impactPreset: basePreset.impactPreset,
    qcPreset: basePreset.qcPreset,
    channelDomain: input.channelDomain ?? null,
    renderMode: input.renderMode,
    shotType: input.shotType,
    cameraPreset: input.cameraPreset,
    policyTags: basePreset.policyTags
  });
  if (!rolloutPreset) {
    return basePreset;
  }
  return {
    ...basePreset,
    controlnetPreset: rolloutPreset.controlnetPreset,
    impactPreset: rolloutPreset.impactPreset,
    qcPreset: rolloutPreset.qcPreset,
    presetSource: rolloutPreset.presetSource,
    policyTags: rolloutPreset.policyTags,
    rolloutSource: rolloutPreset.rolloutSource,
    rolloutSourceKind: rolloutPreset.rolloutSourceKind,
    rolloutScenario: rolloutPreset.rolloutScenario,
    rolloutScore: rolloutPreset.rolloutScore,
    rolloutVerdict: rolloutPreset.rolloutVerdict,
    rolloutTarget: rolloutPreset.rolloutTarget,
    rolloutArtifactAgeHours: rolloutPreset.rolloutArtifactAgeHours,
    rolloutChannelDomain: rolloutPreset.rolloutChannelDomain
  };
}

function resolveSidecarPresetPolicyBundle(input: {
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
}) {
  return {
    controlnet: SIDECAR_CONTROLNET_PRESET_MANIFEST[input.controlnetPreset],
    impact: SIDECAR_IMPACT_PRESET_MANIFEST[input.impactPreset],
    qc: SIDECAR_QC_PRESET_MANIFEST[input.qcPreset]
  };
}

type ResolvedWanWorkflowBinding = {
  bindingProfile: string;
  manifestVersion: string;
  denoise: number;
  clipVisionCrop: "center";
  outputCodec: "h264";
};

type ResolvedHunyuanWorkflowBinding = {
  bindingProfile: string;
  manifestVersion: string;
  denoise: number;
  clipVisionCrop: "center";
  srNoiseAugmentation: number;
  srScale: number;
  latentUpscaleMethod: "bilinear" | "bicubic";
  outputCodec: "h264";
};

function buildSidecarWorkflowBindingProfile(input: {
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
}): string {
  return `${input.controlnetPreset}__${input.impactPreset}__${input.qcPreset}`;
}

function resolveWanWorkflowBinding(input: { requestPack: SidecarBrollRequestPack }): ResolvedWanWorkflowBinding {
  const presetPolicies = resolveSidecarPresetPolicyBundle({
    controlnetPreset: input.requestPack.controlnet_preset,
    impactPreset: input.requestPack.impact_preset,
    qcPreset: input.requestPack.qc_preset
  });
  const hints = [
    presetPolicies.controlnet.workflow.wan,
    presetPolicies.impact.workflow.wan,
    presetPolicies.qc.workflow.wan
  ];
  let denoise = 1;
  let clipVisionCrop: "center" = "center";
  let outputCodec: "h264" = "h264";
  for (const hint of hints) {
    if (!hint) {
      continue;
    }
    if (typeof hint.denoise === "number") {
      denoise = Math.min(denoise, hint.denoise);
    }
    if (hint.clipVisionCrop) {
      clipVisionCrop = hint.clipVisionCrop;
    }
    if (hint.outputCodec) {
      outputCodec = hint.outputCodec;
    }
  }
  return {
    bindingProfile: buildSidecarWorkflowBindingProfile({
      controlnetPreset: input.requestPack.controlnet_preset,
      impactPreset: input.requestPack.impact_preset,
      qcPreset: input.requestPack.qc_preset
    }),
    manifestVersion: input.requestPack.preset_manifest_version || SIDECAR_PRESET_MANIFEST_VERSION,
    denoise: Number(Math.max(0.6, Math.min(1, denoise)).toFixed(2)),
    clipVisionCrop,
    outputCodec
  };
}

function resolveHunyuanWorkflowBinding(input: { requestPack: SidecarBrollRequestPack }): ResolvedHunyuanWorkflowBinding {
  const presetPolicies = resolveSidecarPresetPolicyBundle({
    controlnetPreset: input.requestPack.controlnet_preset,
    impactPreset: input.requestPack.impact_preset,
    qcPreset: input.requestPack.qc_preset
  });
  const hints = [
    presetPolicies.controlnet.workflow.hunyuan,
    presetPolicies.impact.workflow.hunyuan,
    presetPolicies.qc.workflow.hunyuan
  ];
  let denoise = 1;
  let clipVisionCrop: "center" = "center";
  let srNoiseAugmentation = VIDEO_HUNYUAN_SR_NOISE_AUGMENTATION;
  let srScale = VIDEO_HUNYUAN_SR_SCALE;
  let latentUpscaleMethod: "bilinear" | "bicubic" = "bilinear";
  let outputCodec: "h264" = "h264";
  for (const hint of hints) {
    if (!hint) {
      continue;
    }
    if (typeof hint.denoise === "number") {
      denoise = Math.min(denoise, hint.denoise);
    }
    if (hint.clipVisionCrop) {
      clipVisionCrop = hint.clipVisionCrop;
    }
    if (typeof hint.srNoiseAugmentation === "number") {
      srNoiseAugmentation = Math.min(srNoiseAugmentation, hint.srNoiseAugmentation);
    }
    if (typeof hint.srScale === "number") {
      srScale = Math.max(srScale, hint.srScale);
    }
    if (hint.latentUpscaleMethod) {
      latentUpscaleMethod = hint.latentUpscaleMethod;
    }
    if (hint.outputCodec) {
      outputCodec = hint.outputCodec;
    }
  }
  return {
    bindingProfile: buildSidecarWorkflowBindingProfile({
      controlnetPreset: input.requestPack.controlnet_preset,
      impactPreset: input.requestPack.impact_preset,
      qcPreset: input.requestPack.qc_preset
    }),
    manifestVersion: input.requestPack.preset_manifest_version || SIDECAR_PRESET_MANIFEST_VERSION,
    denoise: Number(Math.max(0.6, Math.min(1, denoise)).toFixed(2)),
    clipVisionCrop,
    srNoiseAugmentation: Number(Math.max(0, srNoiseAugmentation).toFixed(2)),
    srScale: Number(Math.max(1, srScale).toFixed(2)),
    latentUpscaleMethod,
    outputCodec
  };
}

function deriveSidecarRenderQuality(input: {
  renderMode: ShotSidecarRenderRequest["renderMode"];
  cameraPreset: string;
  shotType: ShotSidecarRenderRequest["shotType"];
}) {
  if (VIDEO_SIDECAR_BENCHMARK_FAST_MODE) {
    return "standard";
  }
  const preset = input.cameraPreset.trim().toLowerCase();
  const premium =
    VIDEO_HUNYUAN_PREMIUM_DEFAULT &&
    (input.renderMode === "generative_i2v" ||
      input.shotType === "reaction" ||
      preset.includes("close") ||
      preset.includes("portrait"));
  return premium ? "premium" : "standard";
}

function resolveBenchmarkFastDurationSeconds(durationSeconds: number): number {
  if (!VIDEO_SIDECAR_BENCHMARK_FAST_MODE) {
    return durationSeconds;
  }
  return Number(Math.max(0.8, Math.min(durationSeconds, 1)).toFixed(2));
}

function deriveSidecarMotionProfile(input: {
  renderMode: ShotSidecarRenderRequest["renderMode"];
  cameraPreset: string;
}) {
  const preset = input.cameraPreset.trim().toLowerCase();
  if (input.renderMode === "generative_s2v") {
    return "style_hold";
  }
  if (preset.includes("push")) {
    return "push";
  }
  if (preset.includes("pan") || preset.includes("tilt")) {
    return "camera_move";
  }
  return input.renderMode === "generative_i2v" ? "portrait_breathing" : "gentle_insert";
}

function deriveSidecarControlMode(input: {
  renderMode: ShotSidecarRenderRequest["renderMode"];
  controlnetPreset: SidecarControlNetPresetId;
}): string {
  if (input.controlnetPreset === "profile_lineart_depth_v1") {
    return "lineart_depth_anchor";
  }
  if (input.controlnetPreset === "pose_canny_balance_v1") {
    return "pose_canny_anchor";
  }
  if (input.renderMode === "generative_s2v") {
    return "style_anchor";
  }
  if (input.renderMode === "generative_overlay") {
    return "overlay";
  }
  return "pose_depth_anchor";
}

function buildSidecarPresetPromptTuning(input: {
  renderMode: ShotSidecarRenderRequest["renderMode"];
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
}): {
  positive: string[];
  negative: string[];
} {
  const presetPolicies = resolveSidecarPresetPolicyBundle(input);
  const positive = [
    ...presetPolicies.controlnet.prompt.positive,
    ...presetPolicies.impact.prompt.positive,
    ...presetPolicies.qc.prompt.positive
  ];
  const negative = [
    ...presetPolicies.controlnet.prompt.negative,
    ...presetPolicies.impact.prompt.negative,
    ...presetPolicies.qc.prompt.negative
  ];

  if (input.renderMode === "generative_s2v") {
    positive.push("minimal stylization drift");
    negative.push("style overtake", "identity override");
  }

  return {
    positive: uniqueStrings(positive),
    negative: uniqueStrings(negative)
  };
}

function deriveSidecarOperationalProfiles(input: {
  backendCapability: SidecarBackendCapability;
  premiumFlag: boolean;
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
}) {
  const presetPolicies = resolveSidecarPresetPolicyBundle(input);
  const strictIdentity = presetPolicies.qc.flags.strictIdentity;
  const detailImpact = Boolean(presetPolicies.impact.flags.detailImpact);
  const forceDetailProfile = Boolean(presetPolicies.controlnet.flags.forceDetailProfile);

  if (input.backendCapability === "hunyuan15_local_i2v" || input.backendCapability === "hunyuan15_local_i2v_sr") {
    const enableSr = input.backendCapability === "hunyuan15_local_i2v_sr";
    return {
      resolutionProfile: enableSr
        ? VIDEO_HUNYUAN_MODEL_IS_480P
          ? "480p_i2v_sr_detail_v1"
          : "720p_i2v_sr_detail_v1"
        : VIDEO_HUNYUAN_RESOLUTION_PROFILE || "720p_i2v",
      stepProfile:
        strictIdentity || detailImpact || forceDetailProfile
          ? "hunyuan_detail_v1"
          : VIDEO_HUNYUAN_STEP_PROFILE || "installed-default",
      cacheProfile: strictIdentity ? "identity_strict_v1" : VIDEO_HUNYUAN_CACHE_PROFILE || "off",
      srProfile: enableSr ? (strictIdentity ? "identity_strict_v1" : "on") : "off"
    };
  }

  return {
    resolutionProfile:
      strictIdentity || detailImpact || input.premiumFlag ? "wan_square_detail_v1" : "wan_square_balanced_v1",
    stepProfile:
      strictIdentity || detailImpact || forceDetailProfile
        ? "wan_detail_v1"
        : "wan_balanced_v1",
    cacheProfile: strictIdentity ? "identity_strict_v1" : "default",
    srProfile: "off"
  };
}

function resolveWanExecutionProfile(input: {
  requestPack: SidecarBrollRequestPack;
  width: number;
  height: number;
  fps: number;
}) {
  const presetPolicies = resolveSidecarPresetPolicyBundle({
    controlnetPreset: input.requestPack.controlnet_preset,
    impactPreset: input.requestPack.impact_preset,
    qcPreset: input.requestPack.qc_preset
  });
  const executionHints = [
    presetPolicies.controlnet.execution.wan,
    presetPolicies.impact.execution.wan,
    presetPolicies.qc.execution.wan
  ];
  const useClipVision =
    VIDEO_BROLL_WAN_USE_CLIP_VISION || executionHints.some((hint) => hint?.useClipVision === true);

  let width = VIDEO_BROLL_WAN_WIDTH || input.width;
  let height = VIDEO_BROLL_WAN_HEIGHT || input.height;
  let steps = VIDEO_BROLL_WAN_STEPS;
  let cfg = VIDEO_BROLL_WAN_CFG;
  let shift = VIDEO_BROLL_WAN_SHIFT;
  let shiftFloor = Number.NEGATIVE_INFINITY;

  for (const hint of executionHints) {
    if (!hint) {
      continue;
    }
    if (typeof hint.minWidth === "number") {
      width = Math.max(width, hint.minWidth);
    }
    if (typeof hint.minHeight === "number") {
      height = Math.max(height, hint.minHeight);
    }
    steps += hint.stepDelta ?? 0;
    cfg += hint.cfgDelta ?? 0;
    shift += hint.shiftDelta ?? 0;
    if (typeof hint.shiftFloor === "number") {
      shiftFloor = Math.max(shiftFloor, hint.shiftFloor);
    }
  }
  if (Number.isFinite(shiftFloor)) {
    shift = Math.max(shiftFloor, shift);
  }

  if (VIDEO_SIDECAR_BENCHMARK_FAST_MODE) {
    width = Math.min(width, 512);
    height = Math.min(height, 512);
    steps = Math.min(steps, 12);
    cfg = Math.min(cfg, 1.2);
  }

  return {
    width: roundDimensionToStep(width, 16),
    height: roundDimensionToStep(height, 16),
    fps: VIDEO_BROLL_WAN_FPS || input.fps,
    steps,
    cfg: Number(cfg.toFixed(2)),
    shift: Number(shift.toFixed(2)),
    sampler: VIDEO_BROLL_WAN_SAMPLER,
    scheduler: VIDEO_BROLL_WAN_SCHEDULER,
    useClipVision,
    resolutionProfile: input.requestPack.resolution_profile,
    stepProfile: input.requestPack.step_profile,
    cacheProfile: input.requestPack.cache_profile
  };
}

function resolveHunyuanExecutionProfile(input: {
  requestPack: SidecarBrollRequestPack;
  width: number;
  height: number;
  fps: number;
  backendCapability: Extract<SidecarBackendCapability, "hunyuan15_local_i2v" | "hunyuan15_local_i2v_sr">;
}) {
  const presetPolicies = resolveSidecarPresetPolicyBundle({
    controlnetPreset: input.requestPack.controlnet_preset,
    impactPreset: input.requestPack.impact_preset,
    qcPreset: input.requestPack.qc_preset
  });
  const strictIdentity = presetPolicies.qc.flags.strictIdentity;
  const detailImpact = Boolean(presetPolicies.impact.flags.detailImpact);
  const executionHints = [
    presetPolicies.controlnet.execution.hunyuan,
    presetPolicies.impact.execution.hunyuan,
    presetPolicies.qc.execution.hunyuan
  ];
  const enableSr =
    input.backendCapability === "hunyuan15_local_i2v_sr" ||
    input.requestPack.sr_profile === "on" ||
    input.requestPack.sr_profile === "identity_strict_v1";
  const maxBaseWidth = VIDEO_HUNYUAN_MODEL_IS_480P ? 848 : Number.POSITIVE_INFINITY;
  const maxBaseHeight = VIDEO_HUNYUAN_MODEL_IS_480P ? 480 : Number.POSITIVE_INFINITY;

  let width = VIDEO_HUNYUAN_WIDTH || input.width;
  let height = VIDEO_HUNYUAN_HEIGHT || input.height;
  let steps = VIDEO_HUNYUAN_STEPS;
  let cfg = VIDEO_HUNYUAN_CFG;
  let imageInterleave = VIDEO_HUNYUAN_IMAGE_INTERLEAVE;

  for (const hint of executionHints) {
    if (!hint) {
      continue;
    }
    if (typeof hint.minWidth === "number") {
      width = Math.max(width, Math.min(hint.minWidth, maxBaseWidth));
    }
    if (typeof hint.minHeight === "number") {
      height = Math.max(height, Math.min(hint.minHeight, maxBaseHeight));
    }
    steps += hint.stepDelta ?? 0;
    cfg += hint.cfgDelta ?? 0;
    if (typeof hint.imageInterleaveMin === "number") {
      imageInterleave = Math.max(imageInterleave, hint.imageInterleaveMin);
    }
  }

  if (VIDEO_SIDECAR_BENCHMARK_FAST_MODE) {
    const maxLongEdge = enableSr ? 960 : 720;
    const currentLongEdge = Math.max(width, height);
    if (currentLongEdge > maxLongEdge) {
      const scale = maxLongEdge / currentLongEdge;
      width = Math.max(512, Math.round(width * scale));
      height = Math.max(384, Math.round(height * scale));
    }
    steps = Math.min(steps, enableSr ? 10 : 8);
    cfg = Math.min(cfg, 1.2);
    imageInterleave = Math.min(imageInterleave, 1);
  }

  return {
    width: roundDimensionToStep(width, 16),
    height: roundDimensionToStep(height, 16),
    fps: VIDEO_HUNYUAN_FPS || input.fps,
    steps,
    cfg: Number(cfg.toFixed(2)),
    sampler: VIDEO_HUNYUAN_SAMPLER,
    scheduler: VIDEO_HUNYUAN_SCHEDULER,
    imageInterleave,
    enableSr,
    resolutionProfile: input.requestPack.resolution_profile,
    stepProfile: input.requestPack.step_profile,
    cacheProfile: input.requestPack.cache_profile,
    srProfile: input.requestPack.sr_profile
  };
}

function resolveRenderedSidecarQcPolicy(input: {
  requestPack: SidecarBrollRequestPack;
  referenceImagePath: string | null;
}) {
  const presetPolicies = resolveSidecarPresetPolicyBundle({
    controlnetPreset: input.requestPack.controlnet_preset,
    impactPreset: input.requestPack.impact_preset,
    qcPreset: input.requestPack.qc_preset
  });
  return {
    preset: input.requestPack.qc_preset,
    manifestVersion: input.requestPack.preset_manifest_version || SIDECAR_PRESET_MANIFEST_VERSION,
    requireReference:
      presetPolicies.qc.flags.requireReference ||
      Boolean(presetPolicies.controlnet.flags.requireReference) ||
      Boolean(presetPolicies.impact.flags.requireReference),
    minDurationRatio: presetPolicies.qc.qc.minDurationRatio,
    minDurationSeconds: presetPolicies.qc.qc.minDurationSeconds,
    referenceAvailable:
      typeof input.referenceImagePath === "string" &&
      input.referenceImagePath.trim().length > 0 &&
      fs.existsSync(input.referenceImagePath)
  };
}

function evaluateRenderedSidecarQc(input: {
  requestPack: SidecarBrollRequestPack;
  referenceImagePath: string | null;
  expectedDurationSeconds: number;
  outputDurationSeconds: number | null;
}) {
  const policy = resolveRenderedSidecarQcPolicy({
    requestPack: input.requestPack,
    referenceImagePath: input.referenceImagePath
  });
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (policy.requireReference && !policy.referenceAvailable) {
    reasons.push("missing_reference_anchor");
  }

  if (typeof input.outputDurationSeconds === "number" && Number.isFinite(input.outputDurationSeconds)) {
    const floor = Math.max(
      Math.min(policy.minDurationSeconds, input.expectedDurationSeconds),
      input.expectedDurationSeconds * policy.minDurationRatio
    );
    if (input.outputDurationSeconds + 0.05 < floor) {
      reasons.push(`output_duration_short:${input.outputDurationSeconds.toFixed(2)}<${floor.toFixed(2)}`);
    }
  } else {
    warnings.push("output_duration_unavailable");
  }

  return {
    passed: reasons.length === 0,
    policy,
    expectedDurationSeconds: Number(input.expectedDurationSeconds.toFixed(2)),
    outputDurationSeconds:
      typeof input.outputDurationSeconds === "number" && Number.isFinite(input.outputDurationSeconds)
        ? Number(input.outputDurationSeconds.toFixed(2))
        : null,
    reasons,
    warnings
  };
}

function probeVideoDurationSeconds(filePath: string): number | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const ffprobe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ],
    {
      encoding: "utf8",
      windowsHide: true
    }
  );
  if (ffprobe.status === 0) {
    const value = Number.parseFloat((ffprobe.stdout || "").trim());
    if (Number.isFinite(value)) {
      return value;
    }
  }
  try {
    const fileBuffer = fs.readFileSync(filePath);
    return probeMp4DurationSecondsFromBuffer(fileBuffer);
  } catch {
    return null;
  }
}

function probeMp4DurationSecondsFromBuffer(buffer: Buffer): number | null {
  const mvhd = findIsoBoxDurationSeconds(buffer, 0, buffer.length);
  return typeof mvhd === "number" && Number.isFinite(mvhd) && mvhd > 0 ? mvhd : null;
}

function findIsoBoxDurationSeconds(buffer: Buffer, start: number, end: number): number | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let boxSize = size32;
    let headerSize = 8;
    if (size32 === 1) {
      if (offset + 16 > end) {
        return null;
      }
      const extendedSize = Number(buffer.readBigUInt64BE(offset + 8));
      if (!Number.isFinite(extendedSize) || extendedSize < 16) {
        return null;
      }
      boxSize = extendedSize;
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = end - offset;
    }
    if (!Number.isFinite(boxSize) || boxSize < headerSize || offset + boxSize > end) {
      return null;
    }
    if (type === "moov") {
      const nested = findIsoBoxDurationSeconds(buffer, offset + headerSize, offset + boxSize);
      if (typeof nested === "number" && Number.isFinite(nested)) {
        return nested;
      }
    }
    if (type === "mvhd") {
      const version = buffer.readUInt8(offset + headerSize);
      const dataStart = offset + headerSize;
      if (version === 1) {
        if (dataStart + 32 > offset + boxSize) {
          return null;
        }
        const timescale = buffer.readUInt32BE(dataStart + 20);
        const duration = Number(buffer.readBigUInt64BE(dataStart + 24));
        if (timescale > 0 && Number.isFinite(duration)) {
          return duration / timescale;
        }
        return null;
      }
      if (dataStart + 20 > offset + boxSize) {
        return null;
      }
      const timescale = buffer.readUInt32BE(dataStart + 12);
      const duration = buffer.readUInt32BE(dataStart + 16);
      if (timescale > 0 && Number.isFinite(duration)) {
        return duration / timescale;
      }
      return null;
    }
    offset += boxSize;
  }
  return null;
}

function guessImageContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

async function materializeComfyInputFromFile(sourcePath: string, prefix: string) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Missing ComfyUI input source: ${sourcePath}`);
  }
  const buffer = fs.readFileSync(sourcePath);
  const extension = path.extname(sourcePath) || ".png";
  const fileName = `${prefix}_${createHash("sha1").update(buffer).digest("hex")}${extension}`;
  try {
    const form = new FormData();
    const blob = new Blob([buffer], { type: guessImageContentType(sourcePath) });
    form.set("image", blob, fileName);
    form.set("type", "input");
    form.set("overwrite", "true");
    const response = await fetch(`${COMFY_SERVER_URL}/upload/image`, {
      method: "POST",
      body: form
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`ComfyUI upload failed (${response.status}): ${bodyText.slice(0, 300)}`);
    }
    const payload = bodyText.length > 0 ? (JSON.parse(bodyText) as { name?: string }) : null;
    const uploadedName = typeof payload?.name === "string" && payload.name.trim().length > 0 ? payload.name.trim() : fileName;
    return {
      fileName: uploadedName,
      absolutePath: null,
      sourcePath
    };
  } catch {
    const absolutePath = path.join(COMFY_INPUT_DIR, fileName);
    fs.mkdirSync(COMFY_INPUT_DIR, { recursive: true });
    if (!fs.existsSync(absolutePath)) {
      fs.copyFileSync(sourcePath, absolutePath);
    }
    return {
      fileName,
      absolutePath,
      sourcePath
    };
  }
}

type WanModelMaterializationAttempt = {
  kind: "diffusion_model" | "text_encoder" | "vae" | "clip_vision";
  targetPath: string;
  sourcePath: string | null;
  status: "existing" | "materialized" | "missing";
};

function readExistingSubdirectories(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function resolveHfSnapshotDirs(repoId: string): string[] {
  const repoDir = path.join(HF_HUB_CACHE_ROOT, `models--${repoId.replace("/", "--")}`);
  if (!fs.existsSync(repoDir)) {
    return [];
  }
  const refsMainPath = path.join(repoDir, "refs", "main");
  const refsMain =
    fs.existsSync(refsMainPath) && fs.statSync(refsMainPath).isFile()
      ? fs.readFileSync(refsMainPath, "utf8").trim()
      : "";
  const snapshotsDir = path.join(repoDir, "snapshots");
  const snapshots = readExistingSubdirectories(snapshotsDir);
  const orderedSnapshots = [
    ...(refsMain.length > 0 ? [refsMain] : []),
    ...snapshots.filter((name) => name !== refsMain)
  ];
  return orderedSnapshots.map((name) => path.join(snapshotsDir, name));
}

function resolveWanCacheSourcePath(repoId: string, relativePath: string): string | null {
  const pathParts = relativePath.split("/").filter((part) => part.length > 0);
  for (const snapshotDir of resolveHfSnapshotDirs(repoId)) {
    const candidate = path.join(snapshotDir, ...pathParts);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return null;
}

function ensureWanModelMaterialized(input: {
  kind: WanModelMaterializationAttempt["kind"];
  targetDir: string;
  fileName: string;
  repoId: string;
  relativePath: string;
}): WanModelMaterializationAttempt {
  const targetPath = path.join(input.targetDir, input.fileName);
  if (fs.existsSync(targetPath)) {
    return {
      kind: input.kind,
      targetPath,
      sourcePath: targetPath,
      status: "existing"
    };
  }

  const sourcePath = resolveWanCacheSourcePath(input.repoId, input.relativePath);
  if (!sourcePath) {
    return {
      kind: input.kind,
      targetPath,
      sourcePath: null,
      status: "missing"
    };
  }

  fs.mkdirSync(input.targetDir, { recursive: true });
  try {
    fs.linkSync(sourcePath, targetPath);
  } catch {
    fs.copyFileSync(sourcePath, targetPath);
  }

  return {
    kind: input.kind,
    targetPath,
    sourcePath,
    status: "materialized"
  };
}

function autoMaterializeWanModelsFromCache(): NonNullable<WanVideoPreflightResult["materialization"]> {
  if (!VIDEO_BROLL_WAN_AUTO_MATERIALIZE_FROM_CACHE) {
    return {
      enabled: false,
      modelRoot: COMFY_MODELS_ROOT,
      cacheRoot: HF_HUB_CACHE_ROOT,
      restartSuggested: false,
      attempts: []
    };
  }

  const attempts: WanModelMaterializationAttempt[] = [
    ensureWanModelMaterialized({
      kind: "diffusion_model",
      targetDir: path.join(COMFY_MODELS_ROOT, "diffusion_models"),
      fileName: VIDEO_BROLL_WAN_MODEL,
      repoId: "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
      relativePath: `split_files/diffusion_models/${VIDEO_BROLL_WAN_MODEL}`
    }),
    ensureWanModelMaterialized({
      kind: "text_encoder",
      targetDir: path.join(COMFY_MODELS_ROOT, "text_encoders"),
      fileName: VIDEO_BROLL_WAN_TEXT_ENCODER,
      repoId: "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
      relativePath: `split_files/text_encoders/${VIDEO_BROLL_WAN_TEXT_ENCODER}`
    }),
    ensureWanModelMaterialized({
      kind: "vae",
      targetDir: path.join(COMFY_MODELS_ROOT, "vae"),
      fileName: VIDEO_BROLL_WAN_VAE,
      repoId: "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
      relativePath: `split_files/vae/${VIDEO_BROLL_WAN_VAE}`
    }),
    ...(VIDEO_BROLL_WAN_USE_CLIP_VISION
      ? [
          ensureWanModelMaterialized({
            kind: "clip_vision",
            targetDir: path.join(COMFY_MODELS_ROOT, "clip_vision"),
            fileName: VIDEO_BROLL_WAN_CLIP_VISION,
            repoId: "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
            relativePath: `split_files/clip_vision/${VIDEO_BROLL_WAN_CLIP_VISION}`
          })
        ]
      : [])
  ];

  return {
    enabled: true,
    modelRoot: COMFY_MODELS_ROOT,
    cacheRoot: HF_HUB_CACHE_ROOT,
    restartSuggested: false,
    attempts
  };
}

type ComfyHistoryFileRef = {
  filename: string;
  subfolder: string;
  type: string;
  nodeId: string;
};

function extractComfyHistoryFileRef(candidate: unknown, nodeId: string): ComfyHistoryFileRef | null {
  if (!isRecord(candidate)) {
    return null;
  }
  const outputLists = ["images", "gifs", "videos", "files"];
  for (const key of outputLists) {
    const entries = candidate[key];
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      if (!isRecord(entry)) {
        continue;
      }
      const filename = asString(entry.filename);
      const subfolder = asString(entry.subfolder);
      const type = asString(entry.type, "output");
      if (!filename) {
        continue;
      }
      const lower = filename.toLowerCase();
      if (lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".mov")) {
        return { filename, subfolder, type, nodeId };
      }
    }
  }
  return null;
}

type WanVideoPreflightResult = {
  ok: boolean;
  comfyServerUrl: string;
  referenceImagePath: string | null;
  missingNodes: string[];
  missingModels: string[];
  warnings?: string[];
  materialization?: {
    enabled: boolean;
    modelRoot: string;
    cacheRoot: string;
    restartSuggested: boolean;
    attempts: WanModelMaterializationAttempt[];
  };
  target: {
    model: string;
    textEncoder: string;
    vae: string;
    clipVision: string | null;
    requestedClipVision: string | null;
    clipVisionSelectionSource?: "configured" | "normalized_match" | "similar_match" | "first_available" | "missing";
    useClipVision: boolean;
  };
  available: {
    diffusionModels: string[];
    textEncoders: string[];
    vaes: string[];
    clipVision: string[];
  };
  reason?: string;
  installCommand?: string;
};

type HunyuanVideoPreflightResult = {
  ok: boolean;
  comfyServerUrl: string;
  referenceImagePath: string | null;
  missingNodes: string[];
  missingModels: string[];
  warnings?: string[];
  supportsTiledVaeDecode: boolean;
  modelRoot: ReturnType<typeof detectComfyModelRootStatus>;
  target: {
    baseModel: string;
    srModel: string | null;
    textEncoderPrimary: string;
    textEncoderSecondary: string;
    vae: string;
    clipVision: string;
    requestedClipVision: string;
    clipVisionSelectionSource?: "configured" | "normalized_match" | "similar_match" | "first_available" | "missing";
    srEnabled: boolean;
  };
  available: {
    diffusionModels: string[];
    textEncoders: string[];
    vaes: string[];
    clipVision: string[];
    dualClipTypes: string[];
    latentUpscaleModels: string[];
  };
  reason?: string;
  installCommand?: string;
};

async function waitForComfyHistoryFile(promptId: string, timeoutMs = VIDEO_BROLL_COMFY_TIMEOUT_MS): Promise<ComfyHistoryFileRef> {
  const deadline = Date.now() + timeoutMs;
  let lastTransientError: string | null = null;
  while (Date.now() < deadline) {
    let history: unknown;
    try {
      history = await fetchJson(`${COMFY_SERVER_URL}/history/${encodeURIComponent(promptId)}`);
      lastTransientError = null;
    } catch (error) {
      lastTransientError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1000, COMFY_FETCH_RETRY_COUNT * COMFY_FETCH_RETRY_DELAY_MS))
      );
      continue;
    }
    if (!isRecord(history)) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    const item = history[promptId];
    if (isRecord(item)) {
      const status = item.status;
      if (isRecord(status)) {
        const messages = status.messages;
        if (Array.isArray(messages)) {
          for (const entry of messages) {
            if (!Array.isArray(entry) || entry.length < 2) continue;
            const kind = asString(entry[0]);
            const payload = isRecord(entry[1]) ? entry[1] : null;
            if (kind !== "execution_error" || payload === null) continue;
            const nodeId = asString(payload.node_id, "unknown");
            const nodeType = asString(payload.node_type, "unknown");
            const exceptionMessage = asString(payload.exception_message, "unknown ComfyUI execution error");
            throw new Error(`ComfyUI execution_error at node ${nodeId} (${nodeType}): ${exceptionMessage.trim()}`);
          }
        }
      }
    }
    if (!isRecord(item) || !isRecord(item.outputs)) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    for (const [nodeId, candidate] of Object.entries(item.outputs)) {
      const fileRef = extractComfyHistoryFileRef(candidate, nodeId);
      if (fileRef) {
        return fileRef;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (lastTransientError) {
    throw new Error(`Timed out waiting for ComfyUI video prompt result: ${promptId} (last error: ${lastTransientError})`);
  }
  throw new Error(`Timed out waiting for ComfyUI video prompt result: ${promptId}`);
}

async function preflightComfyWanVideo(): Promise<WanVideoPreflightResult> {
  return preflightComfyWanVideoWithReference({
    referenceImagePathOverride: null,
    requestedUseClipVision: VIDEO_BROLL_WAN_USE_CLIP_VISION
  });
}

async function preflightComfyWanVideoWithReference(input: {
  referenceImagePathOverride: string | null;
  requestedUseClipVision: boolean;
}): Promise<WanVideoPreflightResult> {
  const materialization = autoMaterializeWanModelsFromCache();
  const objectInfo = await fetchJson(`${COMFY_SERVER_URL}/object_info`);
  const requiredNodes = [
    "LoadImage",
    "UNETLoader",
    "CLIPLoader",
    "CLIPTextEncode",
    "VAELoader",
    "ModelSamplingSD3",
    "WanImageToVideo",
    "KSampler",
    "VAEDecode",
    "CreateVideo",
    "SaveVideo"
  ];
  const missingNodes = requiredNodes.filter((name) => !hasComfyNode(objectInfo, name));
  const diffusionModels = readComfyOptions(objectInfo, ["UNETLoader", "input", "required", "unet_name", 0]);
  const textEncoders = readComfyOptions(objectInfo, ["CLIPLoader", "input", "required", "clip_name", 0]);
  const clipLoaderTypes = readComfyOptions(objectInfo, ["CLIPLoader", "input", "required", "type", 0]);
  const vaes = readComfyOptions(objectInfo, ["VAELoader", "input", "required", "vae_name", 0]);
  const clipVisionModels = readComfyOptions(objectInfo, ["CLIPVisionLoader", "input", "required", "clip_name", 0]);
  const clipVisionSelection = input.requestedUseClipVision
    ? resolvePreferredComfyOption({
        preferred: VIDEO_BROLL_WAN_CLIP_VISION,
        available: clipVisionModels
      })
    : {
        selected: null,
        source: "missing" as const
      };
  const effectiveClipVisionModel = clipVisionSelection.selected;
  const effectiveUseClipVision = input.requestedUseClipVision && Boolean(effectiveClipVisionModel);
  const warnings: string[] = [];
  const missingModels: string[] = [];
  if (!diffusionModels.includes(VIDEO_BROLL_WAN_MODEL)) {
    missingModels.push(`diffusion_models/${VIDEO_BROLL_WAN_MODEL}`);
  }
  if (!textEncoders.includes(VIDEO_BROLL_WAN_TEXT_ENCODER)) {
    missingModels.push(`text_encoders/${VIDEO_BROLL_WAN_TEXT_ENCODER}`);
  }
  if (!clipLoaderTypes.includes("wan")) {
    missingModels.push("CLIPLoader type=wan");
  }
  if (!vaes.includes(VIDEO_BROLL_WAN_VAE)) {
    missingModels.push(`vae/${VIDEO_BROLL_WAN_VAE}`);
  }
  if (input.requestedUseClipVision && !effectiveClipVisionModel) {
    warnings.push(`clip vision unavailable; disabling CLIP vision assist for Wan render (${VIDEO_BROLL_WAN_CLIP_VISION})`);
  } else if (
    effectiveClipVisionModel &&
    effectiveClipVisionModel !== VIDEO_BROLL_WAN_CLIP_VISION &&
    clipVisionSelection.source !== "configured"
  ) {
    warnings.push(`using compatible clip vision model ${effectiveClipVisionModel} instead of ${VIDEO_BROLL_WAN_CLIP_VISION}`);
  }
  const referenceCandidate = input.referenceImagePathOverride?.trim() || VIDEO_BROLL_REFERENCE_IMAGE;
  const referenceImagePath = fs.existsSync(referenceCandidate) ? referenceCandidate : null;
  if (!referenceImagePath) {
    missingModels.push(`reference_image:${referenceCandidate}`);
  }

  const restartSuggested =
    materialization.attempts.some((attempt) => attempt.status === "materialized") &&
    missingModels.some((entry) =>
      entry === `diffusion_models/${VIDEO_BROLL_WAN_MODEL}` ||
      entry === `text_encoders/${VIDEO_BROLL_WAN_TEXT_ENCODER}` ||
      entry === `vae/${VIDEO_BROLL_WAN_VAE}` ||
      entry === `clip_vision/${VIDEO_BROLL_WAN_CLIP_VISION}`
    );
  const ok = missingNodes.length === 0 && missingModels.length === 0;
  return {
    ok,
    comfyServerUrl: COMFY_SERVER_URL,
    referenceImagePath,
    missingNodes,
    missingModels,
    warnings,
    materialization: {
      ...materialization,
      restartSuggested
    },
    target: {
      model: VIDEO_BROLL_WAN_MODEL,
      textEncoder: VIDEO_BROLL_WAN_TEXT_ENCODER,
      vae: VIDEO_BROLL_WAN_VAE,
      clipVision: effectiveClipVisionModel,
      requestedClipVision: input.requestedUseClipVision ? VIDEO_BROLL_WAN_CLIP_VISION : null,
      clipVisionSelectionSource: clipVisionSelection.source,
      useClipVision: effectiveUseClipVision
    },
    available: {
      diffusionModels,
      textEncoders,
      vaes,
      clipVision: clipVisionModels
    },
    reason: ok
      ? undefined
      : [
          restartSuggested ? "Wan models were materialized from cache; restart ComfyUI to refresh model lists" : "",
          missingNodes.length > 0 ? `missing nodes: ${missingNodes.join(", ")}` : "",
          missingModels.length > 0 ? `missing models/assets: ${missingModels.join(", ")}` : ""
        ]
          .filter((entry) => entry.length > 0)
          .join(" | "),
    installCommand: "pnpm comfy:download:video-broll"
  };
}

async function preflightComfyHunyuanVideoWithReference(input: {
  referenceImagePathOverride: string | null;
  enableSr: boolean;
}): Promise<HunyuanVideoPreflightResult> {
  const objectInfo = await fetchJson(`${COMFY_SERVER_URL}/object_info`);
  const requiredNodes = [
    "LoadImage",
    "CLIPVisionLoader",
    "CLIPVisionEncode",
    "DualCLIPLoader",
    "TextEncodeHunyuanVideo_ImageToVideo",
    "VAELoader",
    "UNETLoader",
    "HunyuanVideo15ImageToVideo",
    "KSampler",
    "VAEDecode",
    "CreateVideo",
    "SaveVideo"
  ];
  const optionalSrNodes = ["HunyuanVideo15SuperResolution", "LatentUpscale"];
  const missingNodes = [
    ...requiredNodes.filter((name) => !hasComfyNode(objectInfo, name)),
    ...(input.enableSr ? optionalSrNodes.filter((name) => !hasComfyNode(objectInfo, name)) : [])
  ];
  const diffusionModels = readComfyOptions(objectInfo, ["UNETLoader", "input", "required", "unet_name", 0]);
  const textEncoders = readComfyOptions(objectInfo, ["DualCLIPLoader", "input", "required", "clip_name1", 0]);
  const dualClipTypes = readComfyOptions(objectInfo, ["DualCLIPLoader", "input", "required", "type", 0]);
  const vaes = readComfyOptions(objectInfo, ["VAELoader", "input", "required", "vae_name", 0]);
  const clipVisionModels = readComfyOptions(objectInfo, ["CLIPVisionLoader", "input", "required", "clip_name", 0]);
  const supportsTiledVaeDecode = hasComfyNode(objectInfo, "VAEDecodeTiled");
  const clipVisionSelection = resolvePreferredComfyOption({
    preferred: VIDEO_HUNYUAN_CLIP_VISION,
    available: clipVisionModels
  });
  const effectiveClipVisionModel = clipVisionSelection.selected;
  const warnings: string[] = [];
  const latentUpscaleModels = readComfyOptions(objectInfo, [
    "LatentUpscaleModelLoader",
    "input",
    "required",
    "model_name",
    1,
    "options"
  ]);
  const missingModels: string[] = [];
  if (!diffusionModels.includes(VIDEO_HUNYUAN_I2V_MODEL)) {
    missingModels.push(`diffusion_models/${VIDEO_HUNYUAN_I2V_MODEL}`);
  }
  if (input.enableSr && !diffusionModels.includes(VIDEO_HUNYUAN_SR_MODEL)) {
    missingModels.push(`diffusion_models/${VIDEO_HUNYUAN_SR_MODEL}`);
  }
  if (!textEncoders.includes(VIDEO_HUNYUAN_TEXT_ENCODER_PRIMARY)) {
    missingModels.push(`text_encoders/${VIDEO_HUNYUAN_TEXT_ENCODER_PRIMARY}`);
  }
  if (!textEncoders.includes(VIDEO_HUNYUAN_TEXT_ENCODER_SECONDARY)) {
    missingModels.push(`text_encoders/${VIDEO_HUNYUAN_TEXT_ENCODER_SECONDARY}`);
  }
  if (!dualClipTypes.includes("hunyuan_video_15")) {
    missingModels.push("DualCLIPLoader type=hunyuan_video_15");
  }
  if (!vaes.includes(VIDEO_HUNYUAN_VAE)) {
    missingModels.push(`vae/${VIDEO_HUNYUAN_VAE}`);
  }
  if (!effectiveClipVisionModel) {
    missingModels.push(`clip_vision/${VIDEO_HUNYUAN_CLIP_VISION}`);
  } else if (
    effectiveClipVisionModel !== VIDEO_HUNYUAN_CLIP_VISION &&
    clipVisionSelection.source !== "configured"
  ) {
    warnings.push(`using compatible clip vision model ${effectiveClipVisionModel} instead of ${VIDEO_HUNYUAN_CLIP_VISION}`);
  }
  const referenceCandidate = input.referenceImagePathOverride?.trim() || VIDEO_BROLL_REFERENCE_IMAGE;
  const referenceImagePath = fs.existsSync(referenceCandidate) ? referenceCandidate : null;
  if (!referenceImagePath) {
    missingModels.push(`reference_image:${referenceCandidate}`);
  }
  const modelRoot = detectComfyModelRootStatus();
  const ok = missingNodes.length === 0 && missingModels.length === 0;
  return {
    ok,
    comfyServerUrl: COMFY_SERVER_URL,
    referenceImagePath,
    missingNodes,
    missingModels,
    warnings,
    supportsTiledVaeDecode,
    modelRoot,
    target: {
      baseModel: VIDEO_HUNYUAN_I2V_MODEL,
      srModel: input.enableSr ? VIDEO_HUNYUAN_SR_MODEL : null,
      textEncoderPrimary: VIDEO_HUNYUAN_TEXT_ENCODER_PRIMARY,
      textEncoderSecondary: VIDEO_HUNYUAN_TEXT_ENCODER_SECONDARY,
      vae: VIDEO_HUNYUAN_VAE,
      clipVision: effectiveClipVisionModel ?? VIDEO_HUNYUAN_CLIP_VISION,
      requestedClipVision: VIDEO_HUNYUAN_CLIP_VISION,
      clipVisionSelectionSource: clipVisionSelection.source,
      srEnabled: input.enableSr
    },
    available: {
      diffusionModels,
      textEncoders,
      vaes,
      clipVision: clipVisionModels,
      dualClipTypes,
      latentUpscaleModels
    },
    reason: ok
      ? undefined
      : [
          modelRoot.exists && modelRoot.recognizesConfiguredRoot
            ? ""
            : `Comfy extra model paths do not clearly expose ${modelRoot.configuredRoot}`,
          missingNodes.length > 0 ? `missing nodes: ${missingNodes.join(", ")}` : "",
          missingModels.length > 0 ? `missing models/assets: ${missingModels.join(", ")}` : ""
        ]
          .filter((entry) => entry.length > 0)
          .join(" | "),
    installCommand: "verify extra_model_paths.yaml and installed HunyuanVideo 1.5 I2V/SR models"
  };
}

function buildWanImageToVideoWorkflow(input: {
  prompt: string;
  negativePrompt: string;
  referenceFileName: string;
  outputPrefix: string;
  width: number;
  height: number;
  length: number;
  fps: number;
  seed: number;
  steps: number;
  cfg: number;
  shift: number;
  sampler: string;
  scheduler: string;
  useClipVision: boolean;
  clipVisionModelName?: string | null;
  denoise: number;
  clipVisionCrop: "center";
  outputCodec: "h264";
}) {
  const width = Math.max(256, Math.round(input.width / 16) * 16);
  const height = Math.max(256, Math.round(input.height / 16) * 16);
  const workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: input.referenceFileName
      }
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: VIDEO_BROLL_WAN_TEXT_ENCODER,
        type: "wan",
        device: "default"
      }
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: input.prompt,
        clip: ["2", 0]
      }
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: input.negativePrompt,
        clip: ["2", 0]
      }
    },
    "5": {
      class_type: "VAELoader",
      inputs: {
        vae_name: VIDEO_BROLL_WAN_VAE
      }
    },
    "6": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: VIDEO_BROLL_WAN_MODEL,
        weight_dtype: "default"
      }
    },
    "7": {
      class_type: "ModelSamplingSD3",
      inputs: {
        model: ["6", 0],
        shift: input.shift
      }
    },
    "8": {
      class_type: "WanImageToVideo",
      inputs: {
        positive: ["3", 0],
        negative: ["4", 0],
        vae: ["5", 0],
        width,
        height,
        length: input.length,
        batch_size: 1,
        start_image: ["1", 0]
      }
    },
    "9": {
      class_type: "KSampler",
      inputs: {
        model: ["7", 0],
        seed: input.seed,
        steps: input.steps,
        cfg: input.cfg,
        sampler_name: input.sampler,
        scheduler: input.scheduler,
        positive: ["8", 0],
        negative: ["8", 1],
        latent_image: ["8", 2],
        denoise: input.denoise
      }
    },
    "10": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["9", 0],
        vae: ["5", 0]
      }
    },
    "11": {
      class_type: "CreateVideo",
      inputs: {
        images: ["10", 0],
        fps: input.fps
      }
    },
    "12": {
      class_type: "SaveVideo",
      inputs: {
        video: ["11", 0],
        filename_prefix: input.outputPrefix,
        format: "mp4",
        codec: input.outputCodec
      }
    }
  };

  if (input.useClipVision) {
    workflow["13"] = {
      class_type: "CLIPVisionLoader",
      inputs: {
        clip_name: input.clipVisionModelName ?? VIDEO_BROLL_WAN_CLIP_VISION
      }
    };
    workflow["14"] = {
      class_type: "CLIPVisionEncode",
      inputs: {
        clip_vision: ["13", 0],
        image: ["1", 0],
        crop: input.clipVisionCrop
      }
    };
    workflow["8"]!.inputs.clip_vision_output = ["14", 0];
  }

  return workflow;
}

async function renderComfyWanBroll(input: {
  requestPack: SidecarBrollRequestPack;
  episodeId: string;
  outputRootDir: string;
  shotId: string;
  referenceImagePath: string | null;
  fps: number;
  width: number;
  height: number;
}) {
  const sidecarDir = path.join(input.outputRootDir, "shot_sidecar");
  const preflightPath = path.join(sidecarDir, `${input.shotId}.preflight.json`);
  const workflowPath = path.join(sidecarDir, `${input.shotId}.workflow_api.json`);
  const resultPath = path.join(sidecarDir, `${input.shotId}.result.json`);
  const cacheDir = path.join(sidecarDir, "cache");
  const outputVideoPath = path.join(sidecarDir, `${input.shotId}.mp4`);
  const publicDir = path.join(REPO_ROOT, "apps", "video", "public", "sidecar_videos", input.episodeId);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const executionProfile = resolveWanExecutionProfile({
    requestPack: input.requestPack,
    width: input.width,
    height: input.height,
    fps: input.fps
  });
  const preflight = await preflightComfyWanVideoWithReference({
    referenceImagePathOverride: input.referenceImagePath,
    requestedUseClipVision: executionProfile.useClipVision
  });
  writeJson(preflightPath, preflight);
  if (!preflight.ok || !preflight.referenceImagePath) {
    throw new Error(preflight.reason || "Wan video preflight failed");
  }

  const referenceImage = await materializeComfyInputFromFile(preflight.referenceImagePath, `ec_broll_${input.shotId}`);
  const workflowBinding = resolveWanWorkflowBinding({
    requestPack: input.requestPack
  });
  const targetFps = executionProfile.fps;
  const length = normalizeWanTargetLength(input.requestPack.duration_seconds, targetFps);
  const effectiveUseClipVision = executionProfile.useClipVision && preflight.target.useClipVision;
  const seed =
    typeof input.requestPack.seed_override === "number" && Number.isFinite(input.requestPack.seed_override)
      ? input.requestPack.seed_override
      : Math.floor(Math.random() * 4_294_967_295);
  const workflow = buildWanImageToVideoWorkflow({
    prompt: input.requestPack.prompt,
    negativePrompt: input.requestPack.negative_prompt,
    referenceFileName: referenceImage.fileName,
    outputPrefix: `video/ecs_sidecar_${input.shotId}`,
    width: executionProfile.width,
    height: executionProfile.height,
    length,
    fps: targetFps,
    seed,
    steps: executionProfile.steps,
    cfg: executionProfile.cfg,
    shift: executionProfile.shift,
    sampler: executionProfile.sampler,
    scheduler: executionProfile.scheduler,
    useClipVision: effectiveUseClipVision,
    clipVisionModelName: preflight.target.clipVision,
    denoise: workflowBinding.denoise,
    clipVisionCrop: workflowBinding.clipVisionCrop,
    outputCodec: workflowBinding.outputCodec
  });
  writeJson(workflowPath, workflow);

  const cacheKey = sha256Hex(
    stableStringify({
      workflow,
      request: input.requestPack,
      referenceImagePath: preflight.referenceImagePath,
      renderer: "comfyui-wan-i2v"
    })
  );
  const cachePath = path.join(cacheDir, `${cacheKey}.mp4`);
  const publicFileName = `${input.shotId}-${cacheKey.slice(0, 12)}.mp4`;
  const publicVideoPath = path.join(publicDir, publicFileName);
  const publicVideoSrc = path.posix.join("sidecar_videos", input.episodeId, publicFileName);
  if (fs.existsSync(cachePath)) {
    fs.copyFileSync(cachePath, outputVideoPath);
    if (!fs.existsSync(publicVideoPath)) {
      fs.copyFileSync(cachePath, publicVideoPath);
    }
    const outputDurationSeconds = probeVideoDurationSeconds(cachePath);
    const qcEvaluation = evaluateRenderedSidecarQc({
      requestPack: input.requestPack,
      referenceImagePath: preflight.referenceImagePath,
      expectedDurationSeconds: input.requestPack.duration_seconds,
      outputDurationSeconds
    });
    writeJson(resultPath, {
      cacheKey,
      cached: true,
      outputVideoPath,
      publicVideoPath,
      publicVideoSrc,
      workflowPath,
      preflightPath,
      seed,
      executionProfile,
      workflowBinding,
      preflightWarnings: preflight.warnings ?? [],
      effectiveUseClipVision,
      clipVisionModelName: preflight.target.clipVision,
      outputDurationSeconds,
      qcEvaluation
    });
    if (!qcEvaluation.passed) {
      throw new Error(`Wan sidecar QC failed: ${qcEvaluation.reasons.join(", ")}`);
    }
    return {
      outputVideoPath,
      publicVideoPath,
      publicVideoSrc,
      workflowPath,
      preflightPath,
      resultPath,
      cacheKey,
      cached: true,
      seed,
      executionProfile,
      workflowBinding,
      preflightWarnings: preflight.warnings ?? [],
      effectiveUseClipVision,
      clipVisionModelName: preflight.target.clipVision,
      outputDurationSeconds,
      qcEvaluation
    };
  }

  const queued = await fetchJson(`${COMFY_SERVER_URL}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: randomUUID(),
      prompt: workflow
    })
  });
  const promptId = isRecord(queued) ? asString(queued.prompt_id) : "";
  if (!promptId) {
    throw new Error("ComfyUI did not return prompt_id for video workflow");
  }
  const fileRef = await waitForComfyHistoryFile(promptId);
  const viewUrl =
    `${COMFY_SERVER_URL}/view?filename=${encodeURIComponent(fileRef.filename)}` +
    `&subfolder=${encodeURIComponent(fileRef.subfolder)}` +
    `&type=${encodeURIComponent(fileRef.type)}`;
  const video = await fetchBuffer(viewUrl);
  if (video.data.length === 0) {
    throw new Error("ComfyUI returned empty video data");
  }
  fs.writeFileSync(cachePath, video.data);
  fs.copyFileSync(cachePath, outputVideoPath);
  fs.copyFileSync(cachePath, publicVideoPath);
  const outputDurationSeconds = probeVideoDurationSeconds(cachePath);
  const qcEvaluation = evaluateRenderedSidecarQc({
    requestPack: input.requestPack,
    referenceImagePath: preflight.referenceImagePath,
    expectedDurationSeconds: input.requestPack.duration_seconds,
    outputDurationSeconds
  });
  writeJson(resultPath, {
    promptId,
    fileRef,
    cacheKey,
    cached: false,
    outputVideoPath,
    publicVideoPath,
    publicVideoSrc,
    workflowPath,
    preflightPath,
    contentType: video.contentType,
    seed,
    executionProfile,
    workflowBinding,
    preflightWarnings: preflight.warnings ?? [],
    effectiveUseClipVision,
    clipVisionModelName: preflight.target.clipVision,
    outputDurationSeconds,
    qcEvaluation
  });
  if (!qcEvaluation.passed) {
    throw new Error(`Wan sidecar QC failed: ${qcEvaluation.reasons.join(", ")}`);
  }
  return {
    outputVideoPath,
    publicVideoPath,
    publicVideoSrc,
    workflowPath,
    preflightPath,
    resultPath,
    cacheKey,
    cached: false,
    promptId,
    fileRef,
    seed,
    executionProfile,
    workflowBinding,
    preflightWarnings: preflight.warnings ?? [],
    effectiveUseClipVision,
    clipVisionModelName: preflight.target.clipVision,
    outputDurationSeconds,
    qcEvaluation
  };
}

function buildHunyuanImageToVideoWorkflow(input: {
  prompt: string;
  negativePrompt: string;
  referenceFileName: string;
  outputPrefix: string;
  width: number;
  height: number;
  length: number;
  fps: number;
  seed: number;
  enableSr: boolean;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  imageInterleave: number;
  denoise: number;
  clipVisionCrop: "center";
  srNoiseAugmentation: number;
  srScale: number;
  latentUpscaleMethod: "bilinear" | "bicubic";
  outputCodec: "h264";
  clipVisionModelName: string;
  useTiledVaeDecode: boolean;
}) {
  const minBaseDimension = VIDEO_HUNYUAN_MODEL_IS_480P ? 480 : 512;
  const width = roundDimensionToStep(Math.max(minBaseDimension, input.width), 16);
  const height = roundDimensionToStep(Math.max(minBaseDimension, input.height), 16);
  const workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }> = {
    "1": {
      class_type: "LoadImage",
      inputs: {
        image: input.referenceFileName
      }
    },
    "2": {
      class_type: "CLIPVisionLoader",
      inputs: {
        clip_name: input.clipVisionModelName
      }
    },
    "3": {
      class_type: "CLIPVisionEncode",
      inputs: {
        clip_vision: ["2", 0],
        image: ["1", 0],
        crop: input.clipVisionCrop
      }
    },
    "4": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: VIDEO_HUNYUAN_TEXT_ENCODER_PRIMARY,
        clip_name2: VIDEO_HUNYUAN_TEXT_ENCODER_SECONDARY,
        type: "hunyuan_video_15",
        device: VIDEO_HUNYUAN_CLIP_DEVICE
      }
    },
    "5": {
      class_type: "TextEncodeHunyuanVideo_ImageToVideo",
      inputs: {
        clip: ["4", 0],
        clip_vision_output: ["3", 0],
        prompt: input.prompt,
        image_interleave: input.imageInterleave
      }
    },
    "6": {
      class_type: "TextEncodeHunyuanVideo_ImageToVideo",
      inputs: {
        clip: ["4", 0],
        clip_vision_output: ["3", 0],
        prompt: input.negativePrompt,
        image_interleave: input.imageInterleave
      }
    },
    "7": {
      class_type: "VAELoader",
      inputs: {
        vae_name: VIDEO_HUNYUAN_VAE
      }
    },
    "8": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: VIDEO_HUNYUAN_I2V_MODEL,
        weight_dtype: VIDEO_HUNYUAN_WEIGHT_DTYPE
      }
    },
    "9": {
      class_type: "HunyuanVideo15ImageToVideo",
      inputs: {
        positive: ["5", 0],
        negative: ["6", 0],
        vae: ["7", 0],
        width,
        height,
        length: input.length,
        batch_size: 1,
        start_image: ["1", 0]
      }
    },
    "10": {
      class_type: "KSampler",
      inputs: {
        model: ["8", 0],
        seed: input.seed,
        steps: input.steps,
        cfg: input.cfg,
        sampler_name: input.sampler,
        scheduler: input.scheduler,
        positive: ["9", 0],
        negative: ["9", 1],
        latent_image: ["9", 2],
        denoise: input.denoise
      }
    }
  };

  if (!input.enableSr) {
    workflow["11"] = {
      class_type: "VAEDecode",
      inputs: {
        samples: ["10", 0],
        vae: ["7", 0]
      }
    };
    workflow["12"] = {
      class_type: "CreateVideo",
      inputs: {
        images: ["11", 0],
        fps: input.fps
      }
    };
    workflow["13"] = {
      class_type: "SaveVideo",
      inputs: {
        video: ["12", 0],
        filename_prefix: input.outputPrefix,
        format: "mp4",
        codec: input.outputCodec
      }
    };
    return workflow;
  }

  const srWidth = roundDimensionToStep(width * input.srScale, 16);
  const srHeight = roundDimensionToStep(height * input.srScale, 16);
  workflow["11"] = {
    class_type: "LatentUpscale",
    inputs: {
      samples: ["10", 0],
      upscale_method: input.latentUpscaleMethod,
      width: srWidth,
      height: srHeight,
      crop: "center"
    }
  };
  workflow["12"] = {
    class_type: "UNETLoader",
    inputs: {
      unet_name: VIDEO_HUNYUAN_SR_MODEL,
      weight_dtype: VIDEO_HUNYUAN_WEIGHT_DTYPE
    }
  };
  workflow["13"] = {
    class_type: "HunyuanVideo15SuperResolution",
    inputs: {
      positive: ["5", 0],
      negative: ["6", 0],
      vae: ["7", 0],
      start_image: ["1", 0],
      latent: ["11", 0],
      noise_augmentation: input.srNoiseAugmentation
    }
  };
  workflow["14"] = {
    class_type: "KSampler",
    inputs: {
      model: ["12", 0],
      seed: input.seed,
      steps: input.steps,
      cfg: input.cfg,
      sampler_name: input.sampler,
      scheduler: input.scheduler,
      positive: ["13", 0],
      negative: ["13", 1],
      latent_image: ["13", 2],
      denoise: input.denoise
    }
  };
  workflow["15"] = input.useTiledVaeDecode
    ? {
        class_type: "VAEDecodeTiled",
        inputs: {
          samples: ["14", 0],
          vae: ["7", 0],
          tile_size: VIDEO_HUNYUAN_SR_VAE_TILE_SIZE,
          overlap: VIDEO_HUNYUAN_SR_VAE_OVERLAP,
          temporal_size: VIDEO_HUNYUAN_SR_VAE_TEMPORAL_SIZE,
          temporal_overlap: VIDEO_HUNYUAN_SR_VAE_TEMPORAL_OVERLAP
        }
      }
    : {
        class_type: "VAEDecode",
        inputs: {
          samples: ["14", 0],
          vae: ["7", 0]
        }
      };
  workflow["16"] = {
    class_type: "CreateVideo",
    inputs: {
      images: ["15", 0],
      fps: input.fps
    }
  };
  workflow["17"] = {
    class_type: "SaveVideo",
    inputs: {
      video: ["16", 0],
      filename_prefix: input.outputPrefix,
      format: "mp4",
      codec: input.outputCodec
    }
  };
  return workflow;
}

async function renderComfyHunyuanI2V(input: {
  requestPack: SidecarBrollRequestPack;
  episodeId: string;
  outputRootDir: string;
  shotId: string;
  referenceImagePath: string | null;
  fps: number;
  width: number;
  height: number;
  backendCapability: Extract<SidecarBackendCapability, "hunyuan15_local_i2v" | "hunyuan15_local_i2v_sr">;
}) {
  const sidecarDir = path.join(input.outputRootDir, "shot_sidecar");
  const preflightPath = path.join(sidecarDir, `${input.shotId}.preflight.json`);
  const workflowPath = path.join(sidecarDir, `${input.shotId}.workflow_api.json`);
  const resultPath = path.join(sidecarDir, `${input.shotId}.result.json`);
  const cacheDir = path.join(sidecarDir, "cache");
  const outputVideoPath = path.join(sidecarDir, `${input.shotId}.mp4`);
  const publicDir = path.join(REPO_ROOT, "apps", "video", "public", "sidecar_videos", input.episodeId);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });

  const executionProfile = resolveHunyuanExecutionProfile({
    requestPack: input.requestPack,
    width: input.width,
    height: input.height,
    fps: input.fps,
    backendCapability: input.backendCapability
  });
  const workflowBinding = resolveHunyuanWorkflowBinding({
    requestPack: input.requestPack
  });
  const enableSr = executionProfile.enableSr;
  const preflight = await preflightComfyHunyuanVideoWithReference({
    referenceImagePathOverride: input.referenceImagePath,
    enableSr
  });
  writeJson(preflightPath, preflight);
  if (!preflight.ok || !preflight.referenceImagePath) {
    throw new Error(preflight.reason || "HunyuanVideo 1.5 preflight failed");
  }

  const referenceImage = await materializeComfyInputFromFile(preflight.referenceImagePath, `ec_hunyuan_${input.shotId}`);
  const targetFps = executionProfile.fps;
  const length = normalizeHunyuanTargetLength(input.requestPack.duration_seconds, targetFps);
  const seed =
    typeof input.requestPack.seed_override === "number" && Number.isFinite(input.requestPack.seed_override)
      ? input.requestPack.seed_override
      : Math.floor(Math.random() * 4_294_967_295);
  const workflow = buildHunyuanImageToVideoWorkflow({
    prompt: input.requestPack.prompt,
    negativePrompt: input.requestPack.negative_prompt,
    referenceFileName: referenceImage.fileName,
    outputPrefix: `video/ecs_hunyuan_sidecar_${input.shotId}`,
    width: executionProfile.width,
    height: executionProfile.height,
    length,
    fps: targetFps,
    seed,
    enableSr,
    steps: executionProfile.steps,
    cfg: executionProfile.cfg,
    sampler: executionProfile.sampler,
    scheduler: executionProfile.scheduler,
    imageInterleave: executionProfile.imageInterleave,
    denoise: workflowBinding.denoise,
    clipVisionCrop: workflowBinding.clipVisionCrop,
    srNoiseAugmentation: workflowBinding.srNoiseAugmentation,
    srScale: workflowBinding.srScale,
    latentUpscaleMethod: workflowBinding.latentUpscaleMethod,
    outputCodec: workflowBinding.outputCodec,
    clipVisionModelName: preflight.target.clipVision,
    useTiledVaeDecode: enableSr && VIDEO_HUNYUAN_SR_TILED_VAE_DECODE && preflight.supportsTiledVaeDecode
  });
  writeJson(workflowPath, workflow);

  const cacheKey = sha256Hex(
    stableStringify({
      workflow,
      request: input.requestPack,
      referenceImagePath: preflight.referenceImagePath,
      renderer: input.backendCapability
    })
  );
  const cachePath = path.join(cacheDir, `${cacheKey}.mp4`);
  const publicFileName = `${input.shotId}-${cacheKey.slice(0, 12)}.mp4`;
  const publicVideoPath = path.join(publicDir, publicFileName);
  const publicVideoSrc = path.posix.join("sidecar_videos", input.episodeId, publicFileName);
  if (fs.existsSync(cachePath)) {
    fs.copyFileSync(cachePath, outputVideoPath);
    if (!fs.existsSync(publicVideoPath)) {
      fs.copyFileSync(cachePath, publicVideoPath);
    }
    const outputDurationSeconds = probeVideoDurationSeconds(cachePath);
    const qcEvaluation = evaluateRenderedSidecarQc({
      requestPack: input.requestPack,
      referenceImagePath: preflight.referenceImagePath,
      expectedDurationSeconds: input.requestPack.duration_seconds,
      outputDurationSeconds
    });
    writeJson(resultPath, {
      backend: input.backendCapability,
      cacheKey,
      cached: true,
      outputVideoPath,
      publicVideoPath,
      publicVideoSrc,
      workflowPath,
      preflightPath,
      seed,
      executionProfile,
      workflowBinding,
      preflightWarnings: preflight.warnings ?? [],
      clipVisionModelName: preflight.target.clipVision,
      outputDurationSeconds,
      qcEvaluation
    });
    if (!qcEvaluation.passed) {
      throw new Error(`Hunyuan sidecar QC failed: ${qcEvaluation.reasons.join(", ")}`);
    }
    return {
      outputVideoPath,
      publicVideoPath,
      publicVideoSrc,
      workflowPath,
      preflightPath,
      resultPath,
      cacheKey,
      cached: true,
      latencyMs: 0,
      seed,
      executionProfile,
      workflowBinding,
      preflightWarnings: preflight.warnings ?? [],
      clipVisionModelName: preflight.target.clipVision,
      outputDurationSeconds,
      qcEvaluation
    };
  }

  const startedAt = Date.now();
  const queued = await fetchJson(`${COMFY_SERVER_URL}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: randomUUID(),
      prompt: workflow
    })
  });
  const promptId = isRecord(queued) ? asString(queued.prompt_id) : "";
  if (!promptId) {
    throw new Error("ComfyUI did not return prompt_id for Hunyuan video workflow");
  }
  const fileRef = await waitForComfyHistoryFile(
    promptId,
    enableSr ? Math.max(VIDEO_HUNYUAN_COMFY_TIMEOUT_MS, VIDEO_HUNYUAN_SR_COMFY_TIMEOUT_MS) : VIDEO_HUNYUAN_COMFY_TIMEOUT_MS
  );
  const viewUrl =
    `${COMFY_SERVER_URL}/view?filename=${encodeURIComponent(fileRef.filename)}` +
    `&subfolder=${encodeURIComponent(fileRef.subfolder)}` +
    `&type=${encodeURIComponent(fileRef.type)}`;
  const video = await fetchBuffer(viewUrl);
  if (video.data.length === 0) {
    throw new Error("ComfyUI returned empty video data for Hunyuan workflow");
  }
  fs.writeFileSync(cachePath, video.data);
  fs.copyFileSync(cachePath, outputVideoPath);
  fs.copyFileSync(cachePath, publicVideoPath);
  const latencyMs = Date.now() - startedAt;
  const outputDurationSeconds = probeVideoDurationSeconds(cachePath);
  const qcEvaluation = evaluateRenderedSidecarQc({
    requestPack: input.requestPack,
    referenceImagePath: preflight.referenceImagePath,
    expectedDurationSeconds: input.requestPack.duration_seconds,
    outputDurationSeconds
  });
  writeJson(resultPath, {
    backend: input.backendCapability,
    promptId,
    fileRef,
    cacheKey,
    cached: false,
    outputVideoPath,
    publicVideoPath,
    publicVideoSrc,
    workflowPath,
    preflightPath,
    latencyMs,
    contentType: video.contentType,
    seed,
    executionProfile,
    workflowBinding,
    preflightWarnings: preflight.warnings ?? [],
    clipVisionModelName: preflight.target.clipVision,
    outputDurationSeconds,
    qcEvaluation
  });
  if (!qcEvaluation.passed) {
    throw new Error(`Hunyuan sidecar QC failed: ${qcEvaluation.reasons.join(", ")}`);
  }
  return {
    outputVideoPath,
    publicVideoPath,
    publicVideoSrc,
    workflowPath,
    preflightPath,
    resultPath,
    cacheKey,
    cached: false,
    promptId,
    fileRef,
    latencyMs,
    seed,
    executionProfile,
    workflowBinding,
    preflightWarnings: preflight.warnings ?? [],
    clipVisionModelName: preflight.target.clipVision,
    outputDurationSeconds,
    qcEvaluation
  };
}

function shouldAutoRenderFinal(payload: EpisodeJobPayload): boolean {
  if (typeof payload.pipeline?.autoRenderFinal === "boolean") return payload.pipeline.autoRenderFinal;
  if (typeof payload.pipeline?.stopAfterPreview === "boolean") return !payload.pipeline.stopAfterPreview;
  return parseBoolean(process.env.WORKER_AUTO_RENDER_FINAL, false);
}

function renderDefaults(stage: RenderStage, episodeId: string) {
  const out = getEpisodeOutputPaths(episodeId);
  if (stage === RENDER_PREVIEW_JOB_NAME) return { shotsPath: out.shotsPath, outputPath: out.previewOutputPath, srtPath: out.previewSrtPath, qcReportPath: out.qcReportPath, renderLogPath: out.previewRenderLogPath };
  if (stage === RENDER_FINAL_JOB_NAME) return { shotsPath: out.shotsPath, outputPath: out.finalOutputPath, srtPath: out.finalSrtPath, qcReportPath: out.qcReportPath, renderLogPath: out.finalRenderLogPath };
  const legacyOut = path.join(REPO_ROOT, "out");
  return { shotsPath: path.join(legacyOut, "shots.json"), outputPath: path.join(legacyOut, "render_episode.mp4"), srtPath: path.join(legacyOut, "render_episode.srt"), qcReportPath: path.join(legacyOut, "qc_report.json"), renderLogPath: path.join(legacyOut, "render_log.json") };
}

function compactNarrationForPrompt(narration: string): string {
  return narration
    .replace(/\s+/g, " ")
    .replace(/[“”"]/g, "")
    .trim();
}

function localPathFromMaybeFileHref(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("file:///")) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return null;
    }
  }
  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }
  return null;
}

function normalizeVideoBrollSpeciesId(value: unknown): VideoBrollSpeciesId | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "cat" || normalized === "dog" || normalized === "wolf" ? normalized : null;
}

function resolveExistingPath(...candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0 && fs.existsSync(candidate.trim())) {
      return candidate.trim();
    }
  }
  return null;
}

function readCharacterGenerationManifestContext(characterPackId: string): {
  speciesId: VideoBrollSpeciesId | null;
  starterPathsByView: Partial<Record<CharacterViewName, string>>;
  manifestPath: string | null;
  viewScores: Record<CharacterViewName, CharacterViewScoreSummary>;
  warnings: string[];
} {
  const emptyViewScores = emptyCharacterViewScoreMap();
  const out = getCharacterOutputPaths(characterPackId);
  if (!fs.existsSync(out.qcReportPath)) {
    return {
      speciesId: null,
      starterPathsByView: {},
      manifestPath: null,
      viewScores: emptyViewScores,
      warnings: ["generation_qc_report_missing"]
    };
  }

  const qcReport = readJsonFile<unknown>(out.qcReportPath);
  const generationQc = isRecord(qcReport) && isRecord(qcReport.generationQc) ? qcReport.generationQc : null;
  const manifestPath =
    generationQc && typeof generationQc.manifestPath === "string" && generationQc.manifestPath.trim().length > 0
      ? generationQc.manifestPath.trim()
      : null;
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return {
      speciesId: null,
      starterPathsByView: {},
      manifestPath,
      viewScores: emptyViewScores,
      warnings: [manifestPath ? "generation_manifest_not_found" : "generation_manifest_path_missing"]
    };
  }

  const manifest = readJsonFile<unknown>(manifestPath);
  if (!isRecord(manifest)) {
    return {
      speciesId: null,
      starterPathsByView: {},
      manifestPath,
      viewScores: emptyViewScores,
      warnings: ["generation_manifest_invalid_shape"]
    };
  }
  const reference = isRecord(manifest) && isRecord(manifest.reference) ? manifest.reference : null;
  const starterPathsByViewRaw =
    reference && isRecord(reference.starterPathsByView) ? reference.starterPathsByView : null;
  const selectedCandidateIds = normalizeSelectedCandidateMap(generationQc?.selectedCandidateIds);

  return {
    speciesId: normalizeVideoBrollSpeciesId(manifest.species),
    starterPathsByView: {
      front:
        starterPathsByViewRaw && typeof starterPathsByViewRaw.front === "string" && starterPathsByViewRaw.front.trim().length > 0
          ? starterPathsByViewRaw.front.trim()
          : undefined,
      threeQuarter:
        starterPathsByViewRaw &&
        typeof starterPathsByViewRaw.threeQuarter === "string" &&
        starterPathsByViewRaw.threeQuarter.trim().length > 0
          ? starterPathsByViewRaw.threeQuarter.trim()
          : undefined,
      profile:
        starterPathsByViewRaw &&
        typeof starterPathsByViewRaw.profile === "string" &&
        starterPathsByViewRaw.profile.trim().length > 0
          ? starterPathsByViewRaw.profile.trim()
          : undefined
    },
    manifestPath,
    viewScores: Array.isArray(manifest.candidates)
      ? summarizeCharacterGenerationScoresFromManifest({
          manifest,
          selectedCandidateIds
        })
      : emptyViewScores,
    warnings: Array.isArray(manifest.candidates) ? [] : ["generation_manifest_candidates_missing"]
  };
}

function inferGeneratedPackSpeciesId(input: {
  manifest?: Record<string, unknown> | null;
  qcReport?: Record<string, unknown> | null;
}): VideoBrollSpeciesId | null {
  const promptTexts: string[] = [];

  const pushPrompt = (value: unknown) => {
    if (isRecord(value) && typeof value.prompt === "string" && value.prompt.trim().length > 0) {
      promptTexts.push(value.prompt.trim().toLowerCase());
    }
  };

  pushPrompt(input.manifest?.front_master);

  const promptCandidates = [input.manifest?.views, input.qcReport];
  for (const candidate of promptCandidates) {
    if (!isRecord(candidate)) {
      continue;
    }
    for (const value of Object.values(candidate)) {
      pushPrompt(value);
    }
  }

  const combined = promptTexts.join(" ");
  if (combined.includes("wolf")) {
    return "wolf";
  }
  if (combined.includes("dog") || combined.includes("puppy")) {
    return "dog";
  }
  if (combined.includes("cat") || combined.includes("feline")) {
    return "cat";
  }
  return null;
}

function createGeneratedPackAcceptedViewScore(view: CharacterViewName): CharacterViewScoreSummary {
  return {
    candidateId: `generated-pack:${view}`,
    source: "selected_candidate",
    score: view === "front" ? 0.72 : 0.66,
    alpha: null,
    bbox: null,
    sharpness: null,
    consistency: view === "front" ? 0.68 : 0.58,
    warningCount: 0,
    rejectionCount: 0,
    warnings: [],
    rejections: []
  };
}

function appendGeneratedPackQcSignal(
  summary: CharacterViewScoreSummary,
  check: Record<string, unknown>,
  severity: string,
  passed: boolean
): CharacterViewScoreSummary {
  const code = typeof check.code === "string" ? check.code.trim() : "";
  if (!code) {
    return summary;
  }

  if (!passed) {
    if (severity === "ERROR") {
      summary.rejectionCount += 1;
      summary.rejections.push(code.toLowerCase());
      summary.score = typeof summary.score === "number" ? Math.max(0.42, summary.score - 0.12) : 0.42;
      summary.consistency =
        typeof summary.consistency === "number" ? Math.max(0.34, summary.consistency - 0.14) : 0.34;
    } else if (severity === "WARN") {
      summary.warningCount += 1;
      summary.warnings.push(code.toLowerCase());
      summary.score = typeof summary.score === "number" ? Math.max(0.5, summary.score - 0.04) : 0.5;
      summary.consistency =
        typeof summary.consistency === "number" ? Math.max(0.46, summary.consistency - 0.08) : 0.46;
    }
  }

  const metric = typeof check.metric === "number" && Number.isFinite(check.metric) ? Number(check.metric) : null;
  if (metric === null) {
    return summary;
  }

  if (code === "FRONT_FACE_EYES_PRESENT" || code === "FRONT_FACE_MOUTH_PRESENT") {
    summary.score = Math.max(summary.score ?? 0, 0.72);
    summary.consistency = Math.max(summary.consistency ?? 0, 0.68);
  } else if (code === "VIEW_VARIATION_THREEQUARTER" || code === "VIEW_VARIATION_PROFILE") {
    summary.score = Math.max(summary.score ?? 0, Math.min(0.82, 0.56 + metric * 5));
    summary.consistency = Math.max(summary.consistency ?? 0, 0.58);
  } else if (code === "VIEW_HEAD_SCALE_THREEQUARTER" || code === "VIEW_HEAD_SCALE_PROFILE") {
    summary.consistency = Math.max(0.46, (summary.consistency ?? 0.58) - Math.min(0.1, metric * 0.5));
  }

  return summary;
}

function summarizeGeneratedPackViewScoresFromQcReport(input: {
  qcReportPath: string | null;
  accepted: boolean;
  availableViews: Partial<Record<CharacterViewName, string>>;
}): {
  viewScores: Record<CharacterViewName, CharacterViewScoreSummary>;
  warnings: string[];
} {
  const viewScores = emptyCharacterViewScoreMap();
  for (const view of CHARACTER_VIEW_NAMES) {
    if (typeof input.availableViews[view] === "string" && input.availableViews[view]!.trim().length > 0) {
      viewScores[view] = input.accepted
        ? createGeneratedPackAcceptedViewScore(view)
        : {
            ...emptyCharacterViewScoreSummary(),
            candidateId: `generated-pack:${view}`,
            source: "best_in_view",
            score: 0.58,
            consistency: 0.5
          };
    }
  }

  if (!input.qcReportPath || !fs.existsSync(input.qcReportPath)) {
    return {
      viewScores,
      warnings: ["generation_qc_report_missing"]
    };
  }

  const qcReport = readJsonFile<unknown>(input.qcReportPath);
  if (!isRecord(qcReport) || !Array.isArray(qcReport.checks)) {
    return {
      viewScores,
      warnings: ["generation_qc_report_invalid_shape"]
    };
  }

  for (const checkEntry of qcReport.checks) {
    if (!isRecord(checkEntry)) {
      continue;
    }
    const code = typeof checkEntry.code === "string" ? checkEntry.code.trim().toUpperCase() : "";
    const severity = typeof checkEntry.severity === "string" ? checkEntry.severity.trim().toUpperCase() : "INFO";
    const passed = checkEntry.passed === true;

    if (code.startsWith("FRONT_") || code === "APPROVED_FRONT_MASTER" || code === "VIEW_FRONT") {
      viewScores.front = appendGeneratedPackQcSignal(viewScores.front, checkEntry, severity, passed);
    }
    if (code.includes("THREEQUARTER")) {
      viewScores.threeQuarter = appendGeneratedPackQcSignal(viewScores.threeQuarter, checkEntry, severity, passed);
    }
    if (code.includes("PROFILE")) {
      viewScores.profile = appendGeneratedPackQcSignal(viewScores.profile, checkEntry, severity, passed);
    }
  }

  return {
    viewScores,
    warnings: []
  };
}

function readGeneratedPackManifestContext(characterPackId: string): {
  speciesId: VideoBrollSpeciesId | null;
  starterPathsByView: Partial<Record<CharacterViewName, string>>;
  manifestPath: string | null;
  viewScores: Record<CharacterViewName, CharacterViewScoreSummary>;
  warnings: string[];
} {
  const emptyViewScores = emptyCharacterViewScoreMap();
  const generatedRoot = path.join(REPO_ROOT, "assets", "generated", "characters", characterPackId);
  const manifestPath = path.join(generatedRoot, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return {
      speciesId: null,
      starterPathsByView: {},
      manifestPath: null,
      viewScores: emptyViewScores,
      warnings: ["generated_pack_manifest_missing"]
    };
  }

  const manifest = readJsonFile<unknown>(manifestPath);
  if (!isRecord(manifest)) {
    return {
      speciesId: null,
      starterPathsByView: {},
      manifestPath,
      viewScores: emptyViewScores,
      warnings: ["generated_pack_manifest_invalid_shape"]
    };
  }

  const manifestViews = isRecord(manifest.views) ? manifest.views : {};
  const frontMaster = isRecord(manifest.front_master) ? manifest.front_master : null;
  const approvedFrontMaster = isRecord(manifest.approved_front_master) ? manifest.approved_front_master : null;
  const acceptance = isRecord(manifest.acceptance) ? manifest.acceptance : null;
  const qcInfo = isRecord(manifest.qc) ? manifest.qc : null;
  const starterPathsByView: Partial<Record<CharacterViewName, string>> = {
    front:
      (isRecord(manifestViews.front) && typeof manifestViews.front.file_path === "string"
        ? manifestViews.front.file_path.trim()
        : "") ||
      (approvedFrontMaster && typeof approvedFrontMaster.file_path === "string"
        ? approvedFrontMaster.file_path.trim()
        : "") ||
      (frontMaster && typeof frontMaster.file_path === "string" ? frontMaster.file_path.trim() : "") ||
      undefined,
    threeQuarter:
      isRecord(manifestViews.threeQuarter) && typeof manifestViews.threeQuarter.file_path === "string"
        ? manifestViews.threeQuarter.file_path.trim()
        : undefined,
    profile:
      isRecord(manifestViews.profile) && typeof manifestViews.profile.file_path === "string"
        ? manifestViews.profile.file_path.trim()
        : undefined
  };
  const accepted = Boolean(
    (acceptance && typeof acceptance.status === "string" && acceptance.status === "accepted") ||
      (qcInfo && typeof qcInfo.acceptance_status === "string" && qcInfo.acceptance_status === "accepted")
  );
  const qcReportPath =
    (qcInfo && typeof qcInfo.report_path === "string" && qcInfo.report_path.trim().length > 0
      ? qcInfo.report_path.trim()
      : null) ||
    path.join(generatedRoot, "qc", "qc_report.json");
  const qcReport =
    qcReportPath && fs.existsSync(qcReportPath) ? (readJsonFile<unknown>(qcReportPath) as unknown) : null;
  const summarized = summarizeGeneratedPackViewScoresFromQcReport({
    qcReportPath,
    accepted,
    availableViews: starterPathsByView
  });
  const warnings = [...summarized.warnings];
  if (!accepted) {
    warnings.push("generated_pack_not_accepted");
  }

  return {
    speciesId: inferGeneratedPackSpeciesId({
      manifest,
      qcReport: isRecord(qcReport) ? qcReport : null
    }),
    starterPathsByView,
    manifestPath,
    viewScores: summarized.viewScores,
    warnings: uniqueStrings(warnings)
  };
}

function resolveCharacterPackReferenceImagePaths(input: {
  characterPackId?: string | null;
  characterPack?: unknown;
}): {
  speciesId: VideoBrollSpeciesId | null;
  manifestPath: string | null;
  referenceImagePathByView: Partial<Record<CharacterViewName, string>>;
  referenceSourceByView: Partial<Record<CharacterViewName, VideoBrollReferenceSource>>;
  referenceScoreByView: Record<CharacterViewName, CharacterViewScoreSummary>;
  generationWarnings: string[];
} {
  const byView: Partial<Record<CharacterViewName, string>> = {};
  const sourceByView: Partial<Record<CharacterViewName, VideoBrollReferenceSource>> = {};
  let speciesId: VideoBrollSpeciesId | null = null;
  let manifestPath: string | null = null;
  let referenceScoreByView = emptyCharacterViewScoreMap();
  let generationWarnings: string[] = [];
  const assignViewPath = (
    view: CharacterViewName,
    source: VideoBrollReferenceSource,
    ...candidates: Array<string | null | undefined>
  ) => {
    if (byView[view]) {
      return;
    }
    const resolved = resolveExistingPath(...candidates);
    if (!resolved) {
      return;
    }
    byView[view] = resolved;
    sourceByView[view] = source;
  };

  if (typeof input.characterPackId === "string" && input.characterPackId.trim().length > 0) {
    const trimmedPackId = input.characterPackId.trim();
    const out = getCharacterOutputPaths(trimmedPackId);
    assignViewPath("front", "generated_asset", path.join(out.outDir, "assets", "front.png"));
    assignViewPath("threeQuarter", "generated_asset", path.join(out.outDir, "assets", "three-quarter.png"));
    assignViewPath("profile", "generated_asset", path.join(out.outDir, "assets", "profile.png"));

    const generationContext = readCharacterGenerationManifestContext(trimmedPackId);
    speciesId = generationContext.speciesId;
    manifestPath = generationContext.manifestPath;
    referenceScoreByView = generationContext.viewScores;
    generationWarnings = generationContext.warnings;
    assignViewPath("front", "starter", generationContext.starterPathsByView.front);
    assignViewPath("threeQuarter", "starter", generationContext.starterPathsByView.threeQuarter);
    assignViewPath("profile", "starter", generationContext.starterPathsByView.profile);

    if (
      !byView.front ||
      !byView.threeQuarter ||
      !byView.profile ||
      !manifestPath ||
      generationWarnings.includes("generation_manifest_not_found") ||
      generationWarnings.includes("generation_manifest_path_missing") ||
      generationWarnings.includes("generation_qc_report_missing")
    ) {
      const generatedPackContext = readGeneratedPackManifestContext(trimmedPackId);
      if (!speciesId) {
        speciesId = generatedPackContext.speciesId;
      }
      if ((!manifestPath || !fs.existsSync(manifestPath)) && generatedPackContext.manifestPath) {
        manifestPath = generatedPackContext.manifestPath;
      }
      if (
        referenceScoreByView.front.source === "missing" &&
        referenceScoreByView.threeQuarter.source === "missing" &&
        referenceScoreByView.profile.source === "missing"
      ) {
        referenceScoreByView = generatedPackContext.viewScores;
      }
      if (
        generatedPackContext.manifestPath &&
        (!manifestPath ||
          generationWarnings.length === 0 ||
          generationWarnings.includes("generation_manifest_not_found") ||
          generationWarnings.includes("generation_manifest_path_missing") ||
          generationWarnings.includes("generation_qc_report_missing"))
      ) {
        generationWarnings = generatedPackContext.warnings;
      }
      assignViewPath("front", "generated_asset", generatedPackContext.starterPathsByView.front);
      assignViewPath("threeQuarter", "generated_asset", generatedPackContext.starterPathsByView.threeQuarter);
      assignViewPath("profile", "generated_asset", generatedPackContext.starterPathsByView.profile);
    }
  }

  if (isRecord(input.characterPack) && isRecord(input.characterPack.assets) && isRecord(input.characterPack.assets.images)) {
    const imageRecord = input.characterPack.assets.images;
    assignViewPath("front", "character_pack_asset", localPathFromMaybeFileHref(imageRecord.body_front));
    assignViewPath("threeQuarter", "character_pack_asset", localPathFromMaybeFileHref(imageRecord.body_3q));
    assignViewPath("profile", "character_pack_asset", localPathFromMaybeFileHref(imageRecord.body_profile));
  }

  if (!byView.front) {
    assignViewPath("front", "env_fallback", VIDEO_BROLL_REFERENCE_IMAGE);
  }

  return {
    speciesId,
    manifestPath,
    referenceImagePathByView: byView,
    referenceSourceByView: sourceByView,
    referenceScoreByView,
    generationWarnings
  };
}

type BrollReferenceSelection = {
  referenceView: CharacterViewName | null;
  selectionMode: "missing" | "single" | "scored" | "requested";
  availableViews: CharacterViewName[];
  missingViews: CharacterViewName[];
  scores: Partial<Record<CharacterViewName, number>>;
  reasons: string[];
};

function selectBrollReferenceView(input: {
  shot: ShotSidecarRenderRequest["shot"];
  narration: string;
  availableViews: Partial<Record<CharacterViewName, string>>;
  referenceSourceByView?: Partial<Record<CharacterViewName, VideoBrollReferenceSource>>;
  viewScoresByView?: Partial<Record<CharacterViewName, CharacterViewScoreSummary>>;
}): BrollReferenceSelection {
  const available = input.availableViews;
  const orderedViews = CHARACTER_VIEW_NAMES;
  const availableViewNames = orderedViews.filter((view) => typeof available[view] === "string" && available[view]!.trim().length > 0);
  const missingViews = orderedViews.filter((view) => !availableViewNames.includes(view));
  if (availableViewNames.length === 0) {
    return {
      referenceView: null,
      selectionMode: "missing",
      availableViews: [],
      missingViews,
      scores: {},
      reasons: ["no_character_pack_views"]
    };
  }
  if (availableViewNames.length === 1) {
    const onlyView = availableViewNames[0] ?? null;
    return {
      referenceView: onlyView,
      selectionMode: "single",
      availableViews: availableViewNames,
      missingViews,
      scores: onlyView ? { [onlyView]: 1 } : {},
      reasons: onlyView ? ["single_available_view"] : ["no_character_pack_views"]
    };
  }

  const narration = typeof input.narration === "string" ? input.narration.trim().toLowerCase() : "";
  const cameraPreset = typeof input.shot.camera?.preset === "string" ? input.shot.camera.preset.trim().toLowerCase() : "";
  const transition = typeof input.shot.transition === "string" ? input.shot.transition.trim().toLowerCase() : "";
  const renderMode = typeof input.shot.render_mode === "string" ? input.shot.render_mode.trim().toLowerCase() : "";
  const emphasisWords = Array.isArray(input.shot.emphasis_words)
    ? input.shot.emphasis_words
    : Array.isArray((input.shot as { emphasisWords?: string[] }).emphasisWords)
      ? (input.shot as { emphasisWords?: string[] }).emphasisWords ?? []
      : [];
  const emphasisSource = emphasisWords
    .filter((word): word is string => typeof word === "string" && word.trim().length > 0)
    .map((word) => word.trim().toLowerCase())
    .join(" ");
  const flipX = input.shot.character?.transform?.flip_x === true;
  const requestedReference = resolveRequestedReferenceView({
    shot: input.shot,
    renderMode,
    availableViewNames
  });
  const explicitView = requestedReference.source === "view_track" ? requestedReference.view : null;
  const referenceSourceByView = input.referenceSourceByView ?? {};
  const viewScoresByView = input.viewScoresByView ?? {};

  const reasonTags = new Set<string>();
  const rememberReason = (reason: string) => {
    if (reason.trim().length > 0) {
      reasonTags.add(reason);
    }
  };
  const hasPattern = (source: string, patterns: RegExp[]): boolean =>
    source.length > 0 && patterns.some((pattern) => pattern.test(source));
  const addScore = (scores: Record<CharacterViewName, number>, view: CharacterViewName, amount: number, reason?: string) => {
    if (availableViewNames.includes(view)) {
      scores[view] += amount;
      if (reason) {
        rememberReason(reason);
      }
    }
  };

  const profileViewPatterns = [
    /\bprofile\b/,
    /\bside(?:\s|-)?view\b/,
    /\bside(?:\s|-)?profile\b/,
    /\b90(?:\s|-)?degree\b/,
    /\blateral\b/
  ];
  const profileSilhouettePatterns = [/\bsilhouette\b/, /\bcontour\b/, /\boutline\b/, /\bone\s+eye\b/];
  const threeQuarterViewPatterns = [
    /\bthree(?:\s|-)?quarter\b/,
    /\bthree(?:\s|-)?quarters\b/,
    /\b3q\b/,
    /\b3\/4\b/,
    /\bquarter(?:\s|-)?turn\b/,
    /\bangled\b/,
    /\boblique\b/
  ];
  const threeQuarterMotionPatterns = [
    /\bturn(?:ing)?\b/,
    /\bglanc(?:e|ing)\b/,
    /\blook(?:ing)?\s+(?:back|aside|over)\b/,
    /\bgesture\b/,
    /\bpose\b/,
    /\bpoint(?:ing)?\b/,
    /\bstep(?:ping)?\b/,
    /\bwalk(?:ing)?\b/,
    /\brun(?:ning)?\b/
  ];
  const frontViewPatterns = [/\bfront\b/, /\bhead[\s-]?on\b/, /\bstraight[\s-]?on\b/, /\bdirect\b/, /\bcentered\b/];
  const frontExpressionPatterns = [
    /\bface\b/,
    /\beyes?\b/,
    /\bsmil(?:e|ing)\b/,
    /\bexpression\b/,
    /\breaction\b/,
    /\blook(?:ing)?\s+(?:at|into)\b/,
    /\bstare\b/
  ];
  const motionTransitionPatterns = [/\bwhip\b/, /\bflash\b/, /\bglitch\b/, /\bslide\b/, /\bpush\b/, /\bswipe\b/];
  const calmTransitionPatterns = [/\bfade\b/, /\bcrossfade\b/, /\bdissolve\b/, /\bcut\b/, /\bstatic\b/];

  const scores: Record<CharacterViewName, number> = {
    front: availableViewNames.includes("front") ? 100 : Number.NEGATIVE_INFINITY,
    threeQuarter: availableViewNames.includes("threeQuarter") ? 84 : Number.NEGATIVE_INFINITY,
    profile: availableViewNames.includes("profile") ? 72 : Number.NEGATIVE_INFINITY
  };

  if (explicitView) {
    addScore(scores, explicitView, 28, `explicit_view_track_${explicitView}`);
  }
  if (renderMode === "generative_i2v") {
    addScore(scores, "front", 18, "render_mode_i2v_front_bias");
  } else if (renderMode === "generative_s2v") {
    addScore(scores, "profile", 18, "render_mode_s2v_profile_bias");
    addScore(scores, "threeQuarter", 6, "render_mode_s2v_threequarter_support");
  }

  const hasSevereInstability = (summary: CharacterViewScoreSummary | undefined): boolean => {
    if (!summary) {
      return false;
    }
    return [...summary.rejections, ...summary.warnings].some(
      (reason) =>
        reason === "fragmented_or_multi_object_front" ||
        reason === "inconsistent_with_front_baseline" ||
        reason === "consistency_low" ||
        reason === "consistency_shape_drift" ||
        reason === "mascot_identity_too_weak" ||
        reason === "subject_fill_too_sparse" ||
        reason.includes("species_breakdown")
    );
  };

  for (const view of availableViewNames) {
    const referenceSource = referenceSourceByView[view];
    if (referenceSource === "generated_asset") {
      addScore(scores, view, 8, `${view}_generated_asset_bonus`);
    } else if (referenceSource === "character_pack_asset") {
      addScore(scores, view, 3, `${view}_pack_asset_bonus`);
    } else if (referenceSource === "starter") {
      addScore(scores, view, -18, `${view}_starter_penalty`);
    } else if (referenceSource === "env_fallback") {
      addScore(scores, view, -42, `${view}_env_fallback_penalty`);
    }

    const qc = viewScoresByView[view];
    if (!qc || qc.source === "missing") {
      if (referenceSource === "generated_asset") {
        addScore(scores, view, -6, `${view}_generation_qc_missing`);
      }
      continue;
    }

    if (qc.source === "selected_candidate") {
      addScore(scores, view, 3, `${view}_selected_candidate`);
    }
    if (typeof qc.score === "number") {
      if (qc.score >= 0.72) {
        addScore(scores, view, 9, `${view}_generation_score_strong`);
      } else if (qc.score >= 0.62) {
        addScore(scores, view, 5, `${view}_generation_score_good`);
      } else if (qc.score < 0.52) {
        addScore(scores, view, -12, `${view}_generation_score_weak`);
      }
    }
    if (typeof qc.consistency === "number") {
      if (qc.consistency >= 0.62) {
        addScore(scores, view, 12, `${view}_consistency_strong`);
      } else if (qc.consistency >= 0.5) {
        addScore(scores, view, 6, `${view}_consistency_ok`);
      } else if (qc.consistency < 0.42) {
        addScore(scores, view, -18, `${view}_consistency_low`);
      }
    }
    if (typeof qc.alpha === "number" && qc.alpha < 0.22) {
      addScore(scores, view, -8, `${view}_alpha_low`);
    }
    if (typeof qc.bbox === "number") {
      if (qc.bbox < 0.18) {
        addScore(scores, view, -9, `${view}_bbox_sparse`);
      } else if (qc.bbox > 0.82) {
        addScore(scores, view, -4, `${view}_bbox_tight`);
      }
    }
    if (typeof qc.sharpness === "number" && qc.sharpness < 0.38) {
      addScore(scores, view, -6, `${view}_sharpness_low`);
    }
    if (qc.rejectionCount > 0) {
      addScore(scores, view, -20, `${view}_rejection_penalty`);
    }
    if (qc.warningCount >= 3) {
      addScore(scores, view, -5, `${view}_warning_penalty`);
    }
    if (hasSevereInstability(qc)) {
      addScore(scores, view, -14, `${view}_identity_unstable`);
    }
  }

  const frontQc = viewScoresByView.front;
  const weakFront =
    availableViewNames.includes("front") &&
    (referenceSourceByView.front === "starter" ||
      (typeof frontQc?.consistency === "number" && frontQc.consistency < 0.46) ||
      (typeof frontQc?.score === "number" && frontQc.score < 0.56) ||
      (frontQc?.rejectionCount ?? 0) > 0 ||
      hasSevereInstability(frontQc));
  if (weakFront) {
    addScore(scores, "front", -16, "front_qc_risk");
    addScore(scores, "threeQuarter", 6, "weak_front_fallback");
    addScore(scores, "profile", 3, "weak_front_fallback");
  }

  if (flipX) {
    addScore(scores, "threeQuarter", 8, "character_flip_x");
  }

  if (cameraPreset === "slow_push") {
    addScore(scores, "front", 8, "camera_slow_push");
  } else if (cameraPreset === "whip_pan") {
    addScore(scores, "threeQuarter", 12, "camera_whip_pan");
  } else if (cameraPreset === "shake_emphasis") {
    addScore(scores, "front", 10, "camera_shake_front");
    addScore(scores, "threeQuarter", 4, "camera_shake_threequarter");
  } else if (cameraPreset === "static") {
    addScore(scores, "front", 4, "camera_static");
  }

  if (hasPattern(cameraPreset, profileViewPatterns)) {
    addScore(scores, "profile", 48, "camera_profile_hint");
  }
  if (hasPattern(cameraPreset, threeQuarterViewPatterns)) {
    addScore(scores, "threeQuarter", 36, "camera_threequarter_hint");
  }
  if (hasPattern(cameraPreset, frontViewPatterns)) {
    addScore(scores, "front", 24, "camera_front_hint");
  }

  if (hasPattern(transition, motionTransitionPatterns)) {
    addScore(scores, "threeQuarter", 10, "transition_motion");
  }
  if (hasPattern(transition, calmTransitionPatterns)) {
    addScore(scores, "front", 4, "transition_calm");
  }
  if (hasPattern(transition, profileViewPatterns)) {
    addScore(scores, "profile", 20, "transition_profile_hint");
  }

  if (hasPattern(narration, profileViewPatterns)) {
    addScore(scores, "profile", 30, "narration_profile_hint");
  }
  if (hasPattern(narration, profileSilhouettePatterns)) {
    addScore(scores, "profile", 16, "narration_profile_silhouette");
  }
  if (hasPattern(narration, threeQuarterViewPatterns)) {
    addScore(scores, "threeQuarter", 24, "narration_threequarter_hint");
  }
  if (hasPattern(narration, threeQuarterMotionPatterns)) {
    addScore(scores, "threeQuarter", 16, "narration_threequarter_motion");
  }
  if (hasPattern(narration, frontViewPatterns)) {
    addScore(scores, "front", 16, "narration_front_hint");
  }
  if (hasPattern(narration, frontExpressionPatterns)) {
    addScore(scores, "front", 14, "narration_front_expression");
  }

  if (hasPattern(emphasisSource, profileViewPatterns) || hasPattern(emphasisSource, profileSilhouettePatterns)) {
    addScore(scores, "profile", 20, "emphasis_profile_hint");
  }
  if (hasPattern(emphasisSource, threeQuarterViewPatterns) || hasPattern(emphasisSource, threeQuarterMotionPatterns)) {
    addScore(scores, "threeQuarter", 14, "emphasis_threequarter_hint");
  }
  if (hasPattern(emphasisSource, frontViewPatterns) || hasPattern(emphasisSource, frontExpressionPatterns)) {
    addScore(scores, "front", 12, "emphasis_front_hint");
  }

  let referenceView =
    orderedViews
      .filter((view) => availableViewNames.includes(view))
      .sort((left, right) => scores[right] - scores[left] || orderedViews.indexOf(left) - orderedViews.indexOf(right))[0] ??
    null;
  let selectionMode: BrollReferenceSelection["selectionMode"] = "scored";

  if (requestedReference.view) {
    const highestScore = Math.max(...availableViewNames.map((view) => scores[view]));
    scores[requestedReference.view] = Math.max(scores[requestedReference.view], highestScore + 1);
    referenceView = requestedReference.view;
    selectionMode = "requested";
    rememberReason(`requested_reference_source_${requestedReference.source}`);
    rememberReason(`requested_reference_view_${requestedReference.view}`);
  }

  return {
    referenceView,
    selectionMode,
    availableViews: availableViewNames,
    missingViews,
    scores: Object.fromEntries(availableViewNames.map((view) => [view, scores[view]])) as Partial<
      Record<CharacterViewName, number>
    >,
    reasons: Array.from(reasonTags)
  };
}

function videoBrollSpeciesPromptTuning(speciesId: VideoBrollSpeciesId | null): {
  positive: string[];
  negative: string[];
} {
  if (speciesId === "dog") {
    return {
      positive: [
        "cute dog mascot identity",
        "short rounded puppy muzzle",
        "friendly domestic dog silhouette",
        "soft dog ear shape"
      ],
      negative: ["cat whiskers", "pointed cat ear silhouette", "wolf snout", "feral wolf face"]
    };
  }
  if (speciesId === "wolf") {
    return {
      positive: [
        "cute wolf mascot identity",
        "alert upright wolf ears",
        "slightly longer wolf muzzle",
        "small feral cheek silhouette"
      ],
      negative: ["round puppy muzzle", "floppy dog ears", "cat whiskers", "domestic dog face"]
    };
  }
  return {
    positive: [
      "cute cat mascot identity",
      "pointed cat ears",
      "short feline muzzle",
      "simple feline cheek silhouette"
    ],
    negative: ["dog muzzle", "wolf snout", "floppy dog ears", "domestic dog face"]
  };
}

function referenceViewPromptHint(view: CharacterViewName | null): string {
  if (view === "threeQuarter") {
    return "match the three-quarter mascot silhouette from the reference image";
  }
  if (view === "profile") {
    return "match the side profile silhouette from the reference image";
  }
  return "match the front mascot identity from the reference image";
}

function buildBrollReferenceBundle(input: {
  selection: BrollReferenceSelection;
  referenceView: CharacterViewName | null;
  referenceMode: "character_pack" | "env_fallback" | "missing";
  referenceImagePathByView: Partial<Record<CharacterViewName, string>>;
  referenceSourceByView: Partial<Record<CharacterViewName, VideoBrollReferenceSource>>;
  referenceScoreByView: Partial<Record<CharacterViewName, CharacterViewScoreSummary>>;
  fallbackReferenceImagePath: string | null;
  selectedReferenceImagePath: string | null;
  generationManifestPath?: string | null;
  generationWarnings?: string[];
}) {
  const orderedViews = CHARACTER_VIEW_NAMES;
  const availableViews = orderedViews.filter((view) => {
    const viewPath = input.referenceImagePathByView[view];
    return typeof viewPath === "string" && viewPath.trim().length > 0;
  });
  const sourcePriority = (source: VideoBrollReferenceSource | null | undefined): number => {
    if (source === "generated_asset") return 4;
    if (source === "character_pack_asset") return 3;
    if (source === "starter") return 2;
    if (source === "env_fallback") return 1;
    return 0;
  };
  const rankedViews = [...availableViews].sort((left, right) => {
    const leftScore = typeof input.selection.scores[left] === "number" ? input.selection.scores[left] ?? 0 : Number.NEGATIVE_INFINITY;
    const rightScore =
      typeof input.selection.scores[right] === "number" ? input.selection.scores[right] ?? 0 : Number.NEGATIVE_INFINITY;
    return rightScore - leftScore || orderedViews.indexOf(left) - orderedViews.indexOf(right);
  });
  const continuityWarnings = new Set<string>(input.generationWarnings ?? []);
  const frontQc = input.referenceScoreByView.front;
  const selectedQc = input.referenceView ? input.referenceScoreByView[input.referenceView] ?? null : null;
  if (
    !frontQc ||
    frontQc.source === "missing" ||
    (typeof frontQc.consistency === "number" && frontQc.consistency < 0.46) ||
    (typeof frontQc.score === "number" && frontQc.score < 0.56) ||
    frontQc.rejectionCount > 0
  ) {
    continuityWarnings.add("front_anchor_weak");
  }
  if (selectedQc?.rejectionCount) {
    continuityWarnings.add("selected_view_has_generation_rejections");
  }
  if (selectedQc && typeof selectedQc.consistency === "number" && selectedQc.consistency < 0.45) {
    continuityWarnings.add("selected_view_consistency_low");
  }
  const frontAnchorStrength =
    !frontQc || frontQc.source === "missing"
      ? "missing"
      : (typeof frontQc.consistency === "number" && frontQc.consistency >= 0.62) &&
          (typeof frontQc.score !== "number" || frontQc.score >= 0.62) &&
          frontQc.rejectionCount === 0
        ? "strong"
        : (typeof frontQc.consistency === "number" && frontQc.consistency >= 0.5) ||
            (typeof frontQc.score === "number" && frontQc.score >= 0.56)
          ? "usable"
          : "weak";

  return {
    schema_version: "1.0",
    selection_policy_version: "broll_reference_v2",
    selection_mode: input.selection.selectionMode,
    selected_view: input.referenceView,
    selected_image_path: input.selectedReferenceImagePath,
    fallback_image_path: input.fallbackReferenceImagePath,
    reference_mode: input.referenceMode,
    generation_manifest_path: input.generationManifestPath ?? null,
    generation_warnings: input.generationWarnings ?? [],
    continuity_warnings: [...continuityWarnings],
    front_anchor_strength: frontAnchorStrength,
    available_view_names: input.selection.availableViews,
    missing_view_names: input.selection.missingViews,
    selection_reasons: input.selection.reasons,
    view_scores: Object.fromEntries(
      orderedViews.map((view) => [view, typeof input.selection.scores[view] === "number" ? input.selection.scores[view] : null])
    ),
    view_generation_qc: Object.fromEntries(
      orderedViews.map((view) => {
        const summary = input.referenceScoreByView[view];
        return [
          view,
          summary
            ? {
                candidate_id: summary.candidateId,
                score: summary.score,
                consistency: summary.consistency,
                alpha: summary.alpha,
                bbox: summary.bbox,
                sharpness: summary.sharpness,
                warning_count: summary.warningCount,
                rejection_count: summary.rejectionCount,
                warnings: summary.warnings,
                rejections: summary.rejections,
                source: summary.source
              }
            : null
        ];
      })
    ),
    available_views: availableViews,
    missing_views: orderedViews.filter((view) => !availableViews.includes(view)),
    views: Object.fromEntries(
      orderedViews.map((view) => {
        const viewPath = input.referenceImagePathByView[view];
        const source = input.referenceSourceByView[view] ?? null;
        const generationQc = input.referenceScoreByView[view] ?? null;
        return [
          view,
          {
            available: typeof viewPath === "string" && viewPath.trim().length > 0,
            selected: input.referenceView === view,
            path: viewPath ?? null,
            source,
            source_priority: sourcePriority(source),
            continuity_rank: rankedViews.indexOf(view) >= 0 ? rankedViews.indexOf(view) + 1 : null,
            score: typeof input.selection.scores[view] === "number" ? input.selection.scores[view] : null,
            generation_qc: generationQc
              ? {
                  candidate_id: generationQc.candidateId,
                  source: generationQc.source,
                  score: generationQc.score,
                  consistency: generationQc.consistency,
                  alpha: generationQc.alpha,
                  bbox: generationQc.bbox,
                  sharpness: generationQc.sharpness,
                  warning_count: generationQc.warningCount,
                  rejection_count: generationQc.rejectionCount
                }
              : null
          }
        ];
      })
    )
  };
}

function videoBrollNarrationToneTuning(narration: string): {
  toneId: "neutral" | "problem" | "progress" | "closing";
  positive: string[];
  negative: string[];
} {
  const source = narration.toLowerCase();
  if (
    source.includes("challenge") ||
    source.includes("trade-off") ||
    source.includes("disruption") ||
    source.includes("wait times") ||
    source.includes("crowding")
  ) {
    return {
      toneId: "problem",
      positive: [
        "editorial problem framing",
        "slight concern in the mascot expression",
        "clear readable concern pose",
        "restrained dramatic mood"
      ],
      negative: ["celebration pose", "confetti", "victory gesture", "overly cheerful tone"]
    };
  }
  if (
    source.includes("improvement") ||
    source.includes("upgrade") ||
    source.includes("throughput") ||
    source.includes("measurable") ||
    source.includes("optimization")
  ) {
    return {
      toneId: "progress",
      positive: [
        "optimistic progress mood",
        "clean confident mascot pose",
        "editorial success insert",
        "gentle upward momentum"
      ],
      negative: ["sad expression", "gloomy mood", "disaster framing"]
    };
  }
  if (
    source.includes("next quarter") ||
    source.includes("watch") ||
    source.includes("final takeaway") ||
    source.includes("close with")
  ) {
    return {
      toneId: "closing",
      positive: [
        "forward-looking closing mood",
        "clear concluding insert",
        "calm confident mascot expression",
        "light anticipatory tone"
      ],
      negative: ["chaotic action", "heavy danger mood", "grim expression"]
    };
  }
  return {
    toneId: "neutral",
    positive: ["balanced editorial mascot insert", "clean neutral storytelling mood"],
    negative: []
  };
}

function resolveCharacterPackFrontReferencePath(input: {
  characterPackId?: string | null;
  characterPack?: unknown;
}): string | null {
  const resolved = resolveCharacterPackReferenceImagePaths(input);
  return resolved.referenceImagePathByView.front ?? null;
}

function buildBrollPromptPack(input: {
  episodeId: string;
  shot: ShotSidecarRenderRequest["shot"];
  shotType: ShotSidecarRenderRequest["shotType"];
  renderMode: ShotSidecarRenderRequest["renderMode"];
  narration: string;
  modelName: string;
  rendererName: string;
  fps: number;
  width: number;
  height: number;
  attempt: number;
  maxAttempts: number;
  referenceMode: "character_pack" | "env_fallback" | "missing";
  referenceView: CharacterViewName | null;
  speciesId: VideoBrollSpeciesId | null;
  characterPackId?: string | null;
  backendCapability: SidecarBackendCapability;
  referenceBundle: ReturnType<typeof buildBrollReferenceBundle>;
  requestedReference?: {
    view: CharacterViewName | null;
    source: "view_track" | "render_mode_default" | "none";
    rawViewTrack: unknown;
    rawViewTrackCamel: unknown;
  };
  channelDomain?: "economy" | "medical" | null;
  resolvedSidecarPreset?: ResolvedShotSidecarPreset;
}): SidecarBrollRequestPack {
  const {
    episodeId,
    shot,
    shotType,
    renderMode,
    narration,
    modelName,
    rendererName,
    fps,
    width,
    height,
    attempt,
    maxAttempts,
    referenceMode,
    referenceView,
    speciesId,
    characterPackId,
    backendCapability,
    referenceBundle,
    requestedReference
  } = input;
  const durationFrames = Math.max(1, shot.duration_frames ?? 1);
  const requestedDurationSeconds = Number((durationFrames / fps).toFixed(2));
  const durationSeconds = resolveBenchmarkFastDurationSeconds(requestedDurationSeconds);
  const emphasisWords = Array.isArray(shot.emphasis_words)
    ? shot.emphasis_words
    : Array.isArray((shot as { emphasisWords?: string[] }).emphasisWords)
      ? (shot as { emphasisWords?: string[] }).emphasisWords ?? []
      : [];
  const transition = typeof shot.transition === "string" ? shot.transition : shot.camera?.preset ?? "cut";
  const chartTargets = Array.isArray(shot.chart?.highlights)
    ? shot.chart!.highlights!.slice(0, 4).map((entry) => entry.target_id)
    : [];
  const narrationPrompt = compactNarrationForPrompt(narration);
  const visualIntent =
    shotType === "reaction"
      ? "short reaction insert shot"
      : shotType === "transition"
        ? "minimal transition b-roll shot"
        : shotType === "fx"
          ? "atmospheric effects overlay shot"
          : "short atmospheric b-roll shot";
  const sidecarPreset =
    input.resolvedSidecarPreset ??
    resolveShotSidecarPreset({
      shot,
      renderMode,
      shotType,
      cameraPreset: shot.camera.preset,
      channelDomain: input.channelDomain ?? null
    });
  const presetPromptTuning = buildSidecarPresetPromptTuning({
    renderMode,
    controlnetPreset: sidecarPreset.controlnetPreset,
    impactPreset: sidecarPreset.impactPreset,
    qcPreset: sidecarPreset.qcPreset
  });

  const speciesPrompt = videoBrollSpeciesPromptTuning(speciesId);
  const tonePrompt = videoBrollNarrationToneTuning(narrationPrompt);
  const promptParts = [
    visualIntent,
    "single mascot subject",
    "same character identity as the reference image",
    "clean 2d mascot animation clip",
    "simple readable silhouette",
    "minimal camera motion",
    "clean editorial insert",
    ...presetPromptTuning.positive,
    ...tonePrompt.positive,
    ...speciesPrompt.positive,
    referenceViewPromptHint(referenceView),
    `set ${shot.set.set_id}`,
    `camera ${shot.camera.preset}`,
    emphasisWords.length > 0 ? `emphasis ${emphasisWords.join(", ")}` : "",
    chartTargets.length > 0 ? `chart context ${chartTargets.join(" | ")}` : "",
    narrationPrompt.length > 0 ? `narration context ${narrationPrompt}` : "",
    "no subtitles on frame",
    "no on-screen text",
    "no watermark"
  ]
    .filter((part) => part.length > 0)
    .join(", ");

  const negativePrompt = [
    "subtitles",
    "captions",
    "watermark",
    "logo",
    "ui overlay",
    "chart labels",
    "text",
    "multiple subjects",
    "photorealistic",
    "3d render",
    "complex background",
    "textured fur",
    "human hands",
    "fingers",
    ...tonePrompt.negative,
    ...speciesPrompt.negative,
    ...presetPromptTuning.negative,
    "extra characters",
    "flicker",
    "deformed anatomy",
    "low resolution"
  ].join(", ");
  const renderQuality = deriveSidecarRenderQuality({
    renderMode,
    cameraPreset: shot.camera.preset,
    shotType
  });
  const premiumFlag =
    !VIDEO_SIDECAR_BENCHMARK_FAST_MODE &&
    (renderQuality === "premium" ||
      sidecarPreset.impactPreset === "identity_repair_detail_v1" ||
      sidecarPreset.impactPreset === "soft_clarity_repair_v1");
  const cameraProfile = shot.camera.preset;
  const motionProfile = deriveSidecarMotionProfile({
    renderMode,
    cameraPreset: shot.camera.preset
  });
  const controlMode = deriveSidecarControlMode({
    renderMode,
    controlnetPreset: sidecarPreset.controlnetPreset
  });
  const operationalProfiles = deriveSidecarOperationalProfiles({
    backendCapability,
    premiumFlag,
    controlnetPreset: sidecarPreset.controlnetPreset,
    impactPreset: sidecarPreset.impactPreset,
    qcPreset: sidecarPreset.qcPreset
  });
  const resolutionProfile = operationalProfiles.resolutionProfile;
  const stepProfile = operationalProfiles.stepProfile;
  const cacheProfile = operationalProfiles.cacheProfile;
  const srProfile = operationalProfiles.srProfile;
  const fallbackChain = resolveSidecarFallbackChain(backendCapability);

  return {
    schema_version: "1.0",
    request_kind:
      renderMode === "generative_i2v"
        ? "image_to_video"
        : renderMode === "generative_s2v"
          ? "style_to_video"
          : renderMode === "generative_overlay"
            ? "video_overlay"
            : "video_broll",
    backend: backendCapability,
    render_quality: renderQuality,
    camera_profile: cameraProfile,
    motion_profile: motionProfile,
    control_mode: controlMode,
    controlnet_preset: sidecarPreset.controlnetPreset,
    impact_preset: sidecarPreset.impactPreset,
    qc_preset: sidecarPreset.qcPreset,
    preset_manifest_version: SIDECAR_PRESET_MANIFEST_VERSION,
    preset_source: sidecarPreset.presetSource,
    preset_rollout_source: sidecarPreset.rolloutSource,
    preset_rollout_source_kind: sidecarPreset.rolloutSourceKind,
    preset_rollout_scenario: sidecarPreset.rolloutScenario,
    preset_rollout_score: sidecarPreset.rolloutScore,
    preset_rollout_verdict: sidecarPreset.rolloutVerdict,
    preset_rollout_target: sidecarPreset.rolloutTarget,
    preset_rollout_artifact_age_hours: sidecarPreset.rolloutArtifactAgeHours,
    preset_rollout_channel_domain: sidecarPreset.rolloutChannelDomain,
    episode_id: episodeId,
    shot_id: shot.shot_id,
    shot_type: shotType,
    render_mode: renderMode,
    renderer: rendererName,
    model: modelName,
    duration_seconds: durationSeconds,
    fps,
    width,
    height,
    prompt: promptParts,
    negative_prompt: negativePrompt,
    requested_reference_view: requestedReference?.view ?? null,
    first_frame: (referenceBundle as { selected_image_path?: string | null }).selected_image_path ?? null,
    last_frame: null,
    premium_flag: premiumFlag,
    seed_override: null as number | null,
    resolution_profile: resolutionProfile,
    step_profile: stepProfile,
    cache_profile: cacheProfile,
    sr_profile: srProfile,
    optional_audio_input_future: null,
    reference_bundle: referenceBundle,
    metadata: {
      set_id: shot.set.set_id,
      camera_preset: shot.camera.preset,
      transition,
      has_chart: Boolean(shot.chart),
      chart_targets: chartTargets,
      emphasis_words: emphasisWords,
      narration: narrationPrompt,
      tone_id: tonePrompt.toneId,
      reference_mode: referenceMode,
      reference_view: referenceView,
      available_reference_views: referenceBundle.available_views,
      species_id: speciesId,
      character_pack_id: characterPackId ?? null,
      backend_capability: backendCapability,
      actual_backend_capability: null,
      fallback_chain: fallbackChain,
      requested_reference_view: requestedReference?.view ?? null,
      requested_reference_source: requestedReference?.source ?? "none",
      raw_view_track: requestedReference?.rawViewTrack ?? null,
      raw_view_track_camel: requestedReference?.rawViewTrackCamel ?? null,
      controlnet_preset: sidecarPreset.controlnetPreset,
      impact_preset: sidecarPreset.impactPreset,
      qc_preset: sidecarPreset.qcPreset,
      preset_manifest_version: SIDECAR_PRESET_MANIFEST_VERSION,
      preset_source: sidecarPreset.presetSource,
      preset_rollout_source: sidecarPreset.rolloutSource,
      preset_rollout_source_kind: sidecarPreset.rolloutSourceKind,
      preset_rollout_scenario: sidecarPreset.rolloutScenario,
      preset_rollout_score: sidecarPreset.rolloutScore,
      preset_rollout_verdict: sidecarPreset.rolloutVerdict,
      preset_rollout_target: sidecarPreset.rolloutTarget,
      preset_rollout_artifact_age_hours: sidecarPreset.rolloutArtifactAgeHours,
      preset_rollout_channel_domain: sidecarPreset.rolloutChannelDomain,
      preset_policy_tags: sidecarPreset.policyTags,
      render_quality: renderQuality,
      camera_profile: cameraProfile,
      motion_profile: motionProfile,
      control_mode: controlMode,
      premium_flag: premiumFlag,
      seed_override: null as number | null,
      premium_candidate_judge_version: null as string | null,
      premium_candidate_count: null as number | null,
      premium_candidate_id: null as string | null,
      premium_candidate_objective: null as string | null,
      premium_candidate_score: null as number | null,
      premium_candidate_reasoning_tags: [] as string[],
      premium_candidate_prompt_additions: [] as string[],
      premium_candidate_negative_prompt_additions: [] as string[],
      premium_selected_candidate_id: null as string | null,
      premium_selected_candidate_objective: null as string | null,
      premium_selected_candidate_score: null as number | null,
      premium_candidate_selection_reason: null as string | null,
      premium_candidate_judge_path: null as string | null,
      premium_render_candidate_judge_version: null as string | null,
      premium_render_candidate_count: null as number | null,
      premium_render_selected_candidate_id: null as string | null,
      premium_render_selected_candidate_objective: null as string | null,
      premium_render_selected_candidate_score: null as number | null,
      premium_render_candidate_judge_path: null as string | null,
      resolution_profile: resolutionProfile,
      step_profile: stepProfile,
      cache_profile: cacheProfile,
      sr_profile: srProfile,
      optional_audio_input_future: null,
      attempt,
      max_attempts: maxAttempts
    }
  };
}

function normalizeSidecarRendererOverride(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }
  const lower = normalized.toLowerCase();
  if (lower === "wan") {
    return "comfyui-wan-i2v";
  }
  if (lower === "still_placeholder") {
    return "generated-pack-still-video";
  }
  return normalized;
}

function resolveShotSidecarRendererOverride(shot: ShotSidecarRenderRequest["shot"]): string | null {
  const rendererOverride = normalizeSidecarRendererOverride(
    typeof (shot as { sidecar_renderer?: unknown }).sidecar_renderer === "string"
      ? ((shot as { sidecar_renderer?: string }).sidecar_renderer ?? null)
      : null
  );
  if (rendererOverride) {
    return rendererOverride;
  }
  return normalizeSidecarRendererOverride(
    typeof (shot as { sidecar_backend?: unknown }).sidecar_backend === "string"
      ? ((shot as { sidecar_backend?: string }).sidecar_backend ?? null)
      : null
  );
}

function resolveSidecarRendererNameForMode(
  renderMode: ShotSidecarRenderRequest["renderMode"],
  shot?: ShotSidecarRenderRequest["shot"]
): string {
  const shotOverride = shot ? resolveShotSidecarRendererOverride(shot) : null;
  if (shotOverride) {
    return shotOverride;
  }
  if (renderMode === "generative_i2v") {
    return (
      process.env.SMOKE_VIDEO_I2V_RENDERER?.trim() ||
      process.env.VIDEO_I2V_RENDERER?.trim() ||
      process.env.SMOKE_VIDEO_BROLL_RENDERER?.trim() ||
      process.env.VIDEO_BROLL_RENDERER?.trim() ||
      "request-pack"
    );
  }
  if (renderMode === "generative_s2v") {
    return (
      process.env.SMOKE_VIDEO_S2V_RENDERER?.trim() ||
      process.env.VIDEO_S2V_RENDERER?.trim() ||
      process.env.SMOKE_VIDEO_BROLL_RENDERER?.trim() ||
      process.env.VIDEO_BROLL_RENDERER?.trim() ||
      "request-pack"
    );
  }
  if (renderMode === "generative_overlay") {
    return (
      process.env.SMOKE_VIDEO_OVERLAY_RENDERER?.trim() ||
      process.env.VIDEO_OVERLAY_RENDERER?.trim() ||
      process.env.SMOKE_VIDEO_BROLL_RENDERER?.trim() ||
      process.env.VIDEO_BROLL_RENDERER?.trim() ||
      "request-pack"
    );
  }
  return process.env.SMOKE_VIDEO_BROLL_RENDERER?.trim() || process.env.VIDEO_BROLL_RENDERER?.trim() || "request-pack";
}

function resolveSidecarModelName(rendererName: string): string {
  const normalized = rendererName.trim();
  if (normalized === "comfyui-wan-i2v" || normalized === "wan") {
    return process.env.VIDEO_BROLL_MODEL?.trim() || VIDEO_BROLL_WAN_MODEL;
  }
  if (normalized === "hunyuan15_local_i2v") {
    return VIDEO_HUNYUAN_I2V_MODEL;
  }
  if (normalized === "hunyuan15_local_i2v_sr") {
    return `${VIDEO_HUNYUAN_I2V_MODEL} + ${VIDEO_HUNYUAN_SR_MODEL}`;
  }
  if (
    normalized === "generated-pack-still-video" ||
    normalized === "generated-pack-placeholder" ||
    normalized === "still_placeholder"
  ) {
    return process.env.VIDEO_STILL_VIDEO_MODEL?.trim() || "remotion-sidecar-still-video";
  }
  return process.env.VIDEO_BROLL_MODEL?.trim() || "unconfigured";
}

function sanitizeSidecarCandidateSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function buildSidecarCandidateId(input: {
  shotId: string;
  attemptIndex: number;
  ordinal: number;
  renderer: string;
}): string {
  return [
    sanitizeSidecarCandidateSegment(input.shotId) || "shot",
    `attempt${input.attemptIndex}`,
    `candidate${input.ordinal}`,
    sanitizeSidecarCandidateSegment(input.renderer) || "renderer"
  ].join(":");
}

function buildSidecarRetakeStep(input: {
  candidateId: string;
  attemptIndex: number;
  renderer: string;
  backend: string | null;
  actualBackendCapability?: string | null;
  outcome: ShotSidecarRetakeOutcome;
  reason?: string;
  retryWithRenderer?: string | null;
  retryWithBackend?: string | null;
  retryWithProfile?: string | null;
  selectedForRender?: boolean;
}): ShotSidecarRetakeStep {
  return {
    candidateId: input.candidateId,
    attemptIndex: input.attemptIndex,
    renderer: input.renderer,
    backend: input.backend,
    actualBackendCapability: input.actualBackendCapability ?? null,
    outcome: input.outcome,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.retryWithRenderer ? { retryWithRenderer: input.retryWithRenderer } : {}),
    ...(input.retryWithBackend ? { retryWithBackend: input.retryWithBackend } : {}),
    ...(input.retryWithProfile ? { retryWithProfile: input.retryWithProfile } : {}),
    ...(typeof input.selectedForRender === "boolean" ? { selectedForRender: input.selectedForRender } : {})
  };
}

function attachSidecarJudge(input: {
  plan: ShotSidecarPlan;
  requestedRenderer: string;
  requestedBackend: string | null;
  candidateId: string;
  attemptIndex: number;
  decision: ShotSidecarJudgeDecision;
  accepted: boolean;
  reason?: string;
  actualRenderer?: string | null;
  actualBackendCapability?: string | null;
  retryWithRenderer?: string | null;
  retryWithBackend?: string | null;
  retryWithProfile?: string | null;
  retakes: ShotSidecarRetakeStep[];
}): ShotSidecarPlan {
  const judge: ShotSidecarJudge = {
    candidateId: input.candidateId,
    attemptIndex: input.attemptIndex,
    decision: input.decision,
    accepted: input.accepted,
    judgeSource: "worker_rules_v1",
    requestedRenderer: input.requestedRenderer,
    requestedBackend: input.requestedBackend,
    actualRenderer: input.actualRenderer ?? input.plan.renderer,
    actualBackendCapability:
      input.actualBackendCapability ??
      (typeof input.plan.metadata?.actualBackendCapability === "string"
        ? input.plan.metadata.actualBackendCapability
        : typeof input.plan.metadata?.backendCapability === "string"
          ? input.plan.metadata.backendCapability
          : null),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.retryWithRenderer ? { retryWithRenderer: input.retryWithRenderer } : {}),
    ...(input.retryWithBackend ? { retryWithBackend: input.retryWithBackend } : {}),
    ...(input.retryWithProfile ? { retryWithProfile: input.retryWithProfile } : {})
  };

  return {
    ...input.plan,
    judge,
    retakes: [...input.retakes],
    metadata: {
      ...(input.plan.metadata ?? {}),
      requestedRenderer: input.requestedRenderer,
      requestedBackend: input.requestedBackend,
      actualRenderer: judge.actualRenderer ?? null,
      actualBackendCapability: judge.actualBackendCapability ?? null,
      candidateId: input.candidateId,
      retakeCount: input.retakes.length,
      judgeAccepted: input.accepted,
      judgeDecision: input.decision,
      judgeSource: judge.judgeSource
    }
  };
}

function sidecarPlanStatusToJudgeDecision(status: ShotSidecarPlanStatus): ShotSidecarJudgeDecision {
  if (status === "resolved") {
    return "accepted";
  }
  if (status === "planned") {
    return "planned";
  }
  if (status === "skipped") {
    return "not_applicable";
  }
  return "rejected";
}

function sidecarPlanStatusToRetakeOutcome(status: ShotSidecarPlanStatus): ShotSidecarRetakeOutcome {
  if (status === "resolved") {
    return "accepted";
  }
  if (status === "planned") {
    return "planned";
  }
  if (status === "skipped") {
    return "not_applicable";
  }
  return "failed";
}

function appendPromptAdditions(base: string, additions: string[]): string {
  const normalizedAdditions = uniqueStrings(
    additions
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
  if (normalizedAdditions.length === 0) {
    return base;
  }
  return [base.trim(), ...normalizedAdditions].filter((value) => value.length > 0).join(", ");
}

function buildPremiumSidecarPromptCandidateId(input: {
  shotId: string;
  attemptIndex: number;
  objective: PremiumSidecarCandidateObjective;
}): string {
  return [
    sanitizeSidecarCandidateSegment(input.shotId) || "shot",
    `attempt${input.attemptIndex}`,
    "premium",
    sanitizeSidecarCandidateSegment(input.objective) || "candidate"
  ].join(":");
}

function buildPremiumSidecarSeedOverride(input: {
  episodeId: string;
  shotId: string;
  attemptIndex: number;
  renderer: string;
  objective: PremiumSidecarCandidateObjective;
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
}): number {
  const seedHex = sha256Hex(
    stableStringify({
      episodeId: input.episodeId,
      shotId: input.shotId,
      attemptIndex: input.attemptIndex,
      renderer: input.renderer,
      objective: input.objective,
      controlnetPreset: input.controlnetPreset,
      impactPreset: input.impactPreset,
      qcPreset: input.qcPreset
    })
  ).slice(0, 8);
  const parsed = Number.parseInt(seedHex, 16);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function resolvePremiumSidecarCandidateObjectives(input: {
  requestPack: ReturnType<typeof buildBrollPromptPack>;
  shot: ShotSidecarRenderRequest["shot"];
  renderMode: ShotSidecarRenderRequest["renderMode"];
  candidateCount: number;
}): PremiumSidecarCandidateObjective[] {
  const hasChart = Boolean(input.shot.chart);
  const overlaySafe = input.renderMode === "generative_overlay";
  const preferredOrder: PremiumSidecarCandidateObjective[] = hasChart || overlaySafe
    ? ["identity_anchor", "silhouette_safe", "motion_balance"]
    : ["identity_anchor", "motion_balance", "silhouette_safe"];
  if (input.requestPack.qc_preset === "broadcast_identity_strict_v1") {
    return preferredOrder.slice(0, input.candidateCount);
  }
  return preferredOrder.slice(0, input.candidateCount);
}

function buildPremiumSidecarPromptCandidate(input: {
  episodeId: string;
  baseRequestPack: ReturnType<typeof buildBrollPromptPack>;
  shot: ShotSidecarRenderRequest["shot"];
  shotType: ShotSidecarRenderRequest["shotType"];
  renderMode: ShotSidecarRenderRequest["renderMode"];
  referenceMode: "character_pack" | "env_fallback" | "missing";
  attemptIndex: number;
  rendererName: string;
  objective: PremiumSidecarCandidateObjective;
}): {
  candidateId: string;
  objective: PremiumSidecarCandidateObjective;
  requestPack: ReturnType<typeof buildBrollPromptPack>;
  score: number;
  scoreBreakdown: PremiumSidecarPromptCandidateScoreBreakdown;
  reasoningTags: string[];
  promptAdditions: string[];
  negativePromptAdditions: string[];
  seedOverride: number;
} {
  const hasChart = Boolean(input.shot.chart);
  const overlaySafe = input.renderMode === "generative_overlay";
  const motionHeavy = input.renderMode === "generative_broll" || input.shotType === "transition";
  const strictIdentityQc = input.baseRequestPack.qc_preset === "broadcast_identity_strict_v1";
  const identityRepair =
    input.baseRequestPack.impact_preset === "identity_repair_detail_v1" ||
    input.baseRequestPack.impact_preset === "soft_clarity_repair_v1";
  const reasoningTags = [
    input.objective,
    input.referenceMode === "character_pack" ? "character_pack_reference" : input.referenceMode,
    strictIdentityQc ? "identity_strict_qc" : "balanced_qc",
    hasChart ? "chart_safe_bias" : "",
    overlaySafe ? "overlay_safe_bias" : "",
    motionHeavy ? "motion_heavy_shot" : "steady_shot",
    identityRepair ? "identity_repair_bias" : ""
  ].filter((value) => value.length > 0);
  const promptAdditions =
    input.objective === "identity_anchor"
      ? [
          "locked mascot identity",
          "stable face proportions",
          "consistent eye and nose placement",
          "clean model sheet fidelity",
          strictIdentityQc ? "strict identity continuity" : "",
          input.referenceMode === "character_pack" ? "match the approved character pack reference" : ""
        ]
      : input.objective === "motion_balance"
        ? [
            "controlled motion arcs",
            "readable gesture timing",
            "stable body rhythm",
            motionHeavy ? "coherent movement between frames" : "subtle presenter motion"
          ]
        : [
            "clear silhouette readability",
            "preserve negative space for subtitles and charts",
            "clean presenter-safe framing",
            hasChart ? "safe separation from chart area" : "",
            overlaySafe ? "safe overlay margins" : ""
          ];
  const negativePromptAdditions =
    input.objective === "identity_anchor"
      ? ["identity drift", "face wobble", "eye asymmetry", "muzzle warping"]
      : input.objective === "motion_balance"
        ? ["jitter motion", "frozen inbetween", "frame stutter", "pose snap"]
        : ["edge tangents", "cropped ears", "subtitle overlap", "busy silhouette"];
  const seedOverride = buildPremiumSidecarSeedOverride({
    episodeId: input.episodeId,
    shotId: input.shot.shot_id,
    attemptIndex: input.attemptIndex,
    renderer: input.rendererName,
    objective: input.objective,
    controlnetPreset: input.baseRequestPack.controlnet_preset,
    impactPreset: input.baseRequestPack.impact_preset,
    qcPreset: input.baseRequestPack.qc_preset
  });
  const capScore = (value: number) => Math.max(0, Math.min(22, Number(value.toFixed(2))));
  const faceStability = capScore(
    (input.objective === "identity_anchor" ? 18 : input.objective === "motion_balance" ? 14 : 13) +
      (strictIdentityQc ? (input.objective === "identity_anchor" ? 3 : 1) : 0) +
      (input.referenceMode === "character_pack" ? 2 : 0) +
      (identityRepair ? (input.objective === "identity_anchor" ? 3 : 1) : 0)
  );
  const motionCoherence = capScore(
    (input.objective === "motion_balance" ? 18 : input.objective === "silhouette_safe" ? 13 : 12) +
      (motionHeavy ? (input.objective === "motion_balance" ? 3 : 1) : 0)
  );
  const silhouetteReadability = capScore(
    (input.objective === "silhouette_safe" ? 18 : input.objective === "identity_anchor" ? 15 : 13) +
      (hasChart ? (input.objective === "silhouette_safe" ? 3 : 1) : 0) +
      (overlaySafe ? (input.objective === "silhouette_safe" ? 2 : 1) : 0)
  );
  const mascotIdentityPreservation = capScore(
    (input.objective === "identity_anchor" ? 18 : 15) +
      (identityRepair ? (input.objective === "identity_anchor" ? 3 : 1) : 0) +
      (strictIdentityQc ? (input.objective === "identity_anchor" ? 2 : 1) : 0)
  );
  const safeZoneReadiness = capScore(
    (input.objective === "silhouette_safe" ? 18 : input.objective === "identity_anchor" ? 14 : 12) +
      (hasChart ? (input.objective === "silhouette_safe" ? 3 : 1) : 0) +
      (overlaySafe ? (input.objective === "silhouette_safe" ? 2 : 1) : 0)
  );
  const total = Math.max(
    0,
    Math.min(
      100,
      Number(
        (
          faceStability +
          motionCoherence +
          silhouetteReadability +
          mascotIdentityPreservation +
          safeZoneReadiness
        ).toFixed(2)
      )
    )
  );
  const candidateId = buildPremiumSidecarPromptCandidateId({
    shotId: input.shot.shot_id,
    attemptIndex: input.attemptIndex,
    objective: input.objective
  });
  return {
    candidateId,
    objective: input.objective,
    requestPack: {
      ...input.baseRequestPack,
      prompt: appendPromptAdditions(input.baseRequestPack.prompt, promptAdditions),
      negative_prompt: appendPromptAdditions(input.baseRequestPack.negative_prompt, negativePromptAdditions),
      seed_override: seedOverride,
      metadata: {
        ...(input.baseRequestPack.metadata ?? {}),
        seed_override: seedOverride,
        premium_candidate_id: candidateId,
        premium_candidate_objective: input.objective,
        premium_candidate_score: total,
        premium_candidate_reasoning_tags: uniqueStrings(reasoningTags),
        premium_candidate_prompt_additions: uniqueStrings(promptAdditions),
        premium_candidate_negative_prompt_additions: uniqueStrings(negativePromptAdditions)
      }
    },
    score: total,
    scoreBreakdown: {
      face_stability: faceStability,
      motion_coherence: motionCoherence,
      silhouette_readability: silhouetteReadability,
      mascot_identity_preservation: mascotIdentityPreservation,
      safe_zone_readiness: safeZoneReadiness,
      total
    },
    reasoningTags: uniqueStrings(reasoningTags),
    promptAdditions: uniqueStrings(promptAdditions),
    negativePromptAdditions: uniqueStrings(negativePromptAdditions),
    seedOverride
  };
}

function buildPremiumSidecarPromptSelection(input: {
  episodeId: string;
  shot: ShotSidecarRenderRequest["shot"];
  shotType: ShotSidecarRenderRequest["shotType"];
  renderMode: ShotSidecarRenderRequest["renderMode"];
  referenceMode: "character_pack" | "env_fallback" | "missing";
  rendererName: string;
  backendCapability: SidecarBackendCapability;
  attemptIndex: number;
  requestPack: ReturnType<typeof buildBrollPromptPack>;
  judgePath: string;
}): {
  requestPack: ReturnType<typeof buildBrollPromptPack>;
  judgeReport: PremiumSidecarPromptJudgeReport | null;
  executionCandidates: PremiumSidecarExecutionCandidate[];
} {
  if (!input.requestPack.premium_flag) {
    return {
      requestPack: input.requestPack,
      judgeReport: null,
      executionCandidates: []
    };
  }
  const candidateObjectives = resolvePremiumSidecarCandidateObjectives({
    requestPack: input.requestPack,
    shot: input.shot,
    renderMode: input.renderMode,
    candidateCount: VIDEO_SIDECAR_PREMIUM_CANDIDATE_COUNT
  });
  const candidates = candidateObjectives.map((objective) =>
    buildPremiumSidecarPromptCandidate({
      episodeId: input.episodeId,
      baseRequestPack: input.requestPack,
      shot: input.shot,
      shotType: input.shotType,
      renderMode: input.renderMode,
      referenceMode: input.referenceMode,
      attemptIndex: input.attemptIndex,
      rendererName: input.rendererName,
      objective
    })
  );
  const rankedCandidates = [...candidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.objective.localeCompare(right.objective, "en");
  });
  const selectedCandidate = rankedCandidates[0] ?? candidates[0];
  if (!selectedCandidate) {
    return {
      requestPack: input.requestPack,
      judgeReport: null,
      executionCandidates: []
    };
  }
  const selectionReason = `selected ${selectedCandidate.objective} (${selectedCandidate.score.toFixed(2)}) for ${selectedCandidate.reasoningTags
    .slice(0, 3)
    .join(", ")}`;
  const selectedRequestPack = {
    ...selectedCandidate.requestPack,
    metadata: {
      ...(selectedCandidate.requestPack.metadata ?? {}),
      premium_candidate_judge_version: PREMIUM_SIDECAR_PROMPT_CANDIDATE_JUDGE_VERSION,
      premium_candidate_count: candidates.length,
      premium_selected_candidate_id: selectedCandidate.candidateId,
      premium_selected_candidate_objective: selectedCandidate.objective,
      premium_selected_candidate_score: selectedCandidate.score,
      premium_candidate_selection_reason: selectionReason,
      premium_candidate_judge_path: input.judgePath
    }
  };
  return {
    requestPack: selectedRequestPack,
    judgeReport: {
      schema_version: "1.0",
      judge_version: PREMIUM_SIDECAR_PROMPT_CANDIDATE_JUDGE_VERSION,
      episode_id: input.episodeId,
      shot_id: input.shot.shot_id,
      renderer: input.rendererName,
      backend: input.backendCapability,
      premium_flag: true,
      candidate_count: candidates.length,
      selected_candidate_id: selectedCandidate.candidateId,
      selected_objective: selectedCandidate.objective,
      selected_score: selectedCandidate.score,
      selected_seed_override: selectedCandidate.seedOverride,
      selection_reason: selectionReason,
      candidates: candidates.map((candidate) => ({
        candidate_id: candidate.candidateId,
        objective: candidate.objective,
        prompt_additions: candidate.promptAdditions,
        negative_prompt_additions: candidate.negativePromptAdditions,
        prompt: candidate.requestPack.prompt,
        negative_prompt: candidate.requestPack.negative_prompt,
        seed_override: candidate.seedOverride,
        score: candidate.score,
        score_breakdown: candidate.scoreBreakdown,
        reasoning_tags: candidate.reasoningTags
      }))
    },
    executionCandidates: rankedCandidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      objective: candidate.objective,
      priorScore: candidate.score,
      reasoningTags: candidate.reasoningTags,
      requestPack: {
        ...candidate.requestPack,
        metadata: {
          ...(candidate.requestPack.metadata ?? {}),
          premium_candidate_judge_version: PREMIUM_SIDECAR_PROMPT_CANDIDATE_JUDGE_VERSION,
          premium_candidate_count: candidates.length,
          premium_selected_candidate_id: selectedCandidate.candidateId,
          premium_selected_candidate_objective: selectedCandidate.objective,
          premium_selected_candidate_score: selectedCandidate.score,
          premium_candidate_selection_reason: selectionReason,
          premium_candidate_judge_path: input.judgePath
        }
      }
    }))
  };
}

function resolvePremiumSidecarSelectionMetadata(
  requestPack: Pick<SidecarBrollRequestPack, "seed_override" | "metadata">
): PremiumSidecarSelectionMetadata {
  const metadata = requestPack.metadata ?? {};
  return {
    premiumCandidateJudgeVersion:
      typeof metadata.premium_candidate_judge_version === "string" ? metadata.premium_candidate_judge_version : null,
    premiumCandidateCount:
      typeof metadata.premium_candidate_count === "number" ? metadata.premium_candidate_count : null,
    premiumSelectedCandidateId:
      typeof metadata.premium_selected_candidate_id === "string" ? metadata.premium_selected_candidate_id : null,
    premiumSelectedCandidateObjective:
      typeof metadata.premium_selected_candidate_objective === "string"
        ? metadata.premium_selected_candidate_objective
        : null,
    premiumSelectedCandidateScore:
      typeof metadata.premium_selected_candidate_score === "number" ? metadata.premium_selected_candidate_score : null,
    premiumCandidateSelectionReason:
      typeof metadata.premium_candidate_selection_reason === "string"
        ? metadata.premium_candidate_selection_reason
        : null,
    premiumCandidateJudgePath:
      typeof metadata.premium_candidate_judge_path === "string" ? metadata.premium_candidate_judge_path : null,
    premiumSelectedSeedOverride: typeof requestPack.seed_override === "number" ? requestPack.seed_override : null
  };
}

function buildPremiumSidecarExecutionShotId(input: {
  shotId: string;
  attemptIndex: number;
  candidateId: string;
}): string {
  return [
    sanitizeSidecarCandidateSegment(input.shotId) || "shot",
    `attempt${input.attemptIndex}`,
    sanitizeSidecarCandidateSegment(input.candidateId) || "premium"
  ].join("__");
}

function buildPremiumActualRetakeSeedOverride(input: {
  episodeId: string;
  shotId: string;
  attemptIndex: number;
  renderer: string;
  parentCandidateId: string;
  retakeRound: number;
  rejectionReasons: string[];
}): number {
  const seedHex = sha256Hex(
    stableStringify({
      episodeId: input.episodeId,
      shotId: input.shotId,
      attemptIndex: input.attemptIndex,
      renderer: input.renderer,
      parentCandidateId: input.parentCandidateId,
      retakeRound: input.retakeRound,
      rejectionReasons: uniqueStrings(input.rejectionReasons)
    })
  ).slice(0, 8);
  const parsed = Number.parseInt(seedHex, 16);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function buildPremiumActualRetakeCandidate(input: {
  episodeId: string;
  shotId: string;
  attemptIndex: number;
  rendererName: string;
  channelDomain: "economy" | "medical" | null;
  candidate: PremiumSidecarExecutionCandidate;
  rejectionReasons: string[];
  retakeRound: number;
}): PremiumSidecarExecutionCandidate {
  const refinements = buildSidecarRetakePromptRefinements({
    rejectionReasons: input.rejectionReasons,
    channelDomain: input.channelDomain
  });
  const seedOverride = buildPremiumActualRetakeSeedOverride({
    episodeId: input.episodeId,
    shotId: input.shotId,
    attemptIndex: input.attemptIndex,
    renderer: input.rendererName,
    parentCandidateId: input.candidate.candidateId,
    retakeRound: input.retakeRound,
    rejectionReasons: input.rejectionReasons
  });
  const candidateId = `${input.candidate.candidateId}:retake${input.retakeRound}`;
  const reasoningTags = uniqueStrings([
    ...input.candidate.reasoningTags,
    ...refinements.reasoningTags,
    `premium_actual_retake_round_${input.retakeRound}`
  ]);
  return {
    candidateId,
    objective: input.candidate.objective,
    priorScore: input.candidate.priorScore,
    reasoningTags,
    requestPack: {
      ...input.candidate.requestPack,
      prompt: appendPromptAdditions(input.candidate.requestPack.prompt, refinements.promptAdditions),
      negative_prompt: appendPromptAdditions(
        input.candidate.requestPack.negative_prompt,
        refinements.negativePromptAdditions
      ),
      seed_override: seedOverride,
      metadata: {
        ...(input.candidate.requestPack.metadata ?? {}),
        seed_override: seedOverride,
        premium_actual_candidate_id: candidateId,
        premium_actual_retake_parent_candidate_id: input.candidate.candidateId,
        premium_actual_retake_round: input.retakeRound,
        premium_actual_policy_rejection_reasons: uniqueStrings(input.rejectionReasons),
        premium_actual_retake_reasoning_tags: refinements.reasoningTags,
        premium_actual_retake_prompt_additions: refinements.promptAdditions,
        premium_actual_retake_negative_prompt_additions: refinements.negativePromptAdditions
      }
    }
  };
}

function scorePremiumActualOutputCandidate(input: {
  priorScore: number;
  expectedDurationSeconds: number;
  outputDurationSeconds: number | null;
  qcEvaluation: {
    passed: boolean;
    reasons: string[];
    warnings: string[];
  };
  cached: boolean;
  latencyMs: number;
  visualSignalScore: number | null;
}): number {
  const durationDelta =
    typeof input.outputDurationSeconds === "number"
      ? Math.abs(input.outputDurationSeconds - input.expectedDurationSeconds)
      : 1.5;
  const durationPenalty = Math.min(18, Number((durationDelta * 10).toFixed(2)));
  const qcPenalty = input.qcEvaluation.reasons.length * 6 + Math.min(6, input.qcEvaluation.warnings.length * 2);
  const latencyPenalty = input.cached ? 0 : Math.min(8, Number((input.latencyMs / 15000).toFixed(2)));
  const visualSignalComponent =
    typeof input.visualSignalScore === "number" && Number.isFinite(input.visualSignalScore)
      ? input.visualSignalScore * 0.24
      : 12;
  return Math.max(
    0,
    Math.min(
      100,
      Number(
        (
          input.priorScore * 0.5 +
          (input.qcEvaluation.passed ? 18 : 6) +
          visualSignalComponent -
          durationPenalty -
          qcPenalty -
          latencyPenalty
        ).toFixed(2)
      )
    )
  );
}

function resolvePremiumActualSelectionMetadata(
  report: PremiumActualOutputJudgeReport | null,
  judgePath: string | null
): PremiumActualSelectionMetadata {
  const selectedCandidate = report?.candidates.find((candidate) => candidate.selected) ?? null;
  const leadingRejectedCandidate =
    report?.candidates
      .filter((candidate) => candidate.success && candidate.accepted_by_policy === false)
      .sort((left, right) => {
        if (right.output_score !== left.output_score) {
          return right.output_score - left.output_score;
        }
        return left.candidate_id.localeCompare(right.candidate_id, "en");
      })[0] ?? null;
  return {
    premiumActualJudgeVersion: report?.judge_version ?? null,
    premiumActualJudgePolicyVersion:
      selectedCandidate?.judge_policy_version ?? report?.judge_policy_version ?? null,
    premiumActualCandidateCount: report?.candidate_count ?? null,
    premiumActualSelectedCandidateId: report?.selected_candidate_id ?? null,
    premiumActualSelectedObjective: report?.selected_objective ?? null,
    premiumActualSelectedScore: report?.selected_score ?? null,
    premiumActualSelectionReason: report?.selection_reason ?? null,
    premiumActualJudgePath: report ? judgePath : null,
    premiumActualPolicyAccepted:
      typeof selectedCandidate?.accepted_by_policy === "boolean"
        ? selectedCandidate.accepted_by_policy
        : report
          ? report.accepted_candidate_count > 0
          : null,
    premiumActualPolicyRejectionReasons:
      selectedCandidate?.policy_rejection_reasons ?? leadingRejectedCandidate?.policy_rejection_reasons ?? [],
    premiumActualRetakeRound: selectedCandidate?.retake_round ?? null,
    premiumActualRetakeCount: report?.retake_count ?? null,
    premiumActualVisualSignalMode: selectedCandidate?.visual_signal_mode ?? null,
    premiumActualVisualSignalScore: selectedCandidate?.visual_signal_score ?? null,
    premiumActualVisualSignalReportPath: selectedCandidate?.visual_signal_report_path ?? null,
    premiumActualFaceStabilityScore: selectedCandidate?.face_stability_score ?? null,
    premiumActualMotionCoherenceScore: selectedCandidate?.motion_coherence_score ?? null,
    premiumActualSilhouetteReadabilityScore: selectedCandidate?.silhouette_readability_score ?? null,
    premiumActualMascotIdentityPreservationScore: selectedCandidate?.mascot_identity_preservation_score ?? null,
    premiumActualSubtitleSafeScore: selectedCandidate?.subtitle_safe_score ?? null,
    premiumActualChartSafeScore: selectedCandidate?.chart_safe_score ?? null
  };
}

function mergeSidecarArtifacts(
  ...artifactGroups: Array<ShotSidecarPlan["artifacts"] | undefined>
): NonNullable<ShotSidecarPlan["artifacts"]> {
  const merged: NonNullable<ShotSidecarPlan["artifacts"]> = [];
  const seen = new Set<string>();
  for (const group of artifactGroups) {
    for (const artifact of group ?? []) {
      const key = `${artifact.kind}:${artifact.path}:${artifact.label}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(artifact);
    }
  }
  return merged;
}

function createShotSidecarRenderer(input?: {
  referenceImagePath?: string | null;
  referenceImagePathByView?: Partial<Record<CharacterViewName, string>>;
  referenceSourceByView?: Partial<Record<CharacterViewName, VideoBrollReferenceSource>>;
  referenceScoreByView?: Partial<Record<CharacterViewName, CharacterViewScoreSummary>>;
  speciesId?: VideoBrollSpeciesId | null;
  generationManifestPath?: string | null;
  generationWarnings?: string[];
  characterPackId?: string | null;
  channelDomain?: "economy" | "medical" | null;
}): ShotSidecarRenderer {
  const fallbackReferenceImagePath = input?.referenceImagePath?.trim() || null;
  const referenceImagePathByView = input?.referenceImagePathByView ?? {};
  const referenceSourceByView = input?.referenceSourceByView ?? {};
  const hasGeneratedPackManifest =
    typeof input?.generationManifestPath === "string" &&
    input.generationManifestPath.trim().length > 0 &&
    fs.existsSync(input.generationManifestPath);
  const stillVideoRenderer = hasGeneratedPackManifest
    ? createGeneratedPackSidecarStillVideoRenderer({
        rendererName: "generated-pack-still-video",
        modelName: resolveSidecarModelName("generated-pack-still-video")
      })
    : null;
  const placeholderRenderer = hasGeneratedPackManifest
    ? createGeneratedPackSidecarPlaceholderRenderer({
        rendererName: "generated-pack-placeholder",
        modelName: resolveSidecarModelName("generated-pack-still-video")
      })
    : null;

  return async ({ episodeId, shot, shotType, renderMode, narration, outputRootDir, fps, width, height, attempt, maxAttempts }) => {
    const generatedPackShot =
      input?.characterPackId &&
      (!shot.character ||
        typeof shot.character.pack_id !== "string" ||
        shot.character.pack_id.trim().length === 0 ||
        shot.character.pack_id.trim() !== input.characterPackId)
        ? {
            ...shot,
            character: {
              ...(shot.character ?? {}),
              pack_id: input.characterPackId
            }
          }
        : shot;
    const rendererName = resolveSidecarRendererNameForMode(renderMode, generatedPackShot);
    const modelName = resolveSidecarModelName(rendererName);
    const backendCapability = resolveSidecarBackendCapability(rendererName);
    const resolvedSidecarPreset = resolveShotSidecarPreset({
      shot: generatedPackShot,
      renderMode,
      shotType,
      cameraPreset: generatedPackShot.camera.preset,
      channelDomain: input?.channelDomain ?? null
    });
    let candidateOrdinal = 0;
    const retakes: ShotSidecarRetakeStep[] = [];
    const nextCandidateId = (renderer: string) =>
      buildSidecarCandidateId({
        shotId: shot.shot_id,
        attemptIndex: attempt,
        ordinal: (candidateOrdinal += 1),
        renderer
      });
    const pushRetake = (retake: Omit<ShotSidecarRetakeStep, "candidateId"> & { candidateId?: string }) => {
      const step = buildSidecarRetakeStep({
        candidateId: retake.candidateId ?? nextCandidateId(retake.renderer),
        attemptIndex: retake.attemptIndex,
        renderer: retake.renderer,
        backend: retake.backend,
        actualBackendCapability: retake.actualBackendCapability,
        outcome: retake.outcome,
        reason: retake.reason,
        retryWithRenderer: retake.retryWithRenderer,
        retryWithBackend: retake.retryWithBackend,
        retryWithProfile: retake.retryWithProfile,
        selectedForRender: retake.selectedForRender
      });
      retakes.push(step);
      return step;
    };
    const finalizeSidecarPlan = (input: {
      plan: ShotSidecarPlan;
      candidateId: string;
      decision: ShotSidecarJudgeDecision;
      accepted: boolean;
      reason?: string;
      actualRenderer?: string | null;
      actualBackendCapability?: string | null;
      retryWithRenderer?: string | null;
      retryWithBackend?: string | null;
      retryWithProfile?: string | null;
    }) =>
      attachSidecarJudge({
        plan: input.plan,
        requestedRenderer: rendererName,
        requestedBackend: backendCapability,
        candidateId: input.candidateId,
        attemptIndex: attempt,
        decision: input.decision,
        accepted: input.accepted,
        reason: input.reason,
        actualRenderer: input.actualRenderer,
        actualBackendCapability: input.actualBackendCapability,
        retryWithRenderer: input.retryWithRenderer,
        retryWithBackend: input.retryWithBackend,
        retryWithProfile: input.retryWithProfile,
        retakes
      });
    const withResolvedSidecarPresetMetadata = (plan: ShotSidecarPlan): ShotSidecarPlan => ({
      ...plan,
      metadata: {
        ...(plan.metadata ?? {}),
        controlnetPreset: resolvedSidecarPreset.controlnetPreset,
        impactPreset: resolvedSidecarPreset.impactPreset,
        qcPreset: resolvedSidecarPreset.qcPreset,
        presetSource: resolvedSidecarPreset.presetSource,
        policyTags: uniqueStrings(resolvedSidecarPreset.policyTags),
        presetRolloutSource: resolvedSidecarPreset.rolloutSource,
        presetRolloutSourceKind: resolvedSidecarPreset.rolloutSourceKind,
        presetRolloutScenario: resolvedSidecarPreset.rolloutScenario,
        presetRolloutScore: resolvedSidecarPreset.rolloutScore,
        presetRolloutVerdict: resolvedSidecarPreset.rolloutVerdict,
        presetRolloutTarget: resolvedSidecarPreset.rolloutTarget,
        presetRolloutArtifactAgeHours: resolvedSidecarPreset.rolloutArtifactAgeHours
      }
    });
    if ((rendererName === "generated-pack-still-video" || rendererName === "still_placeholder") && stillVideoRenderer) {
      const plan = await stillVideoRenderer({
        episodeId,
        shot: generatedPackShot,
        shotType,
        renderMode,
        narration,
        outputRootDir,
        fps,
        width,
        height,
        attempt,
        maxAttempts
      });
      if (!plan) {
        return null;
      }
      const resolvedPlan = withResolvedSidecarPresetMetadata(plan);
      const accepted = resolvedPlan.status === "resolved";
      const step = pushRetake({
        attemptIndex: attempt,
        renderer: rendererName,
        backend: backendCapability,
        actualBackendCapability:
          typeof resolvedPlan.metadata?.actualBackendCapability === "string"
            ? resolvedPlan.metadata.actualBackendCapability
            : backendCapability,
        outcome: sidecarPlanStatusToRetakeOutcome(resolvedPlan.status),
        reason: resolvedPlan.notes,
        selectedForRender: resolvedPlan.status === "resolved" || resolvedPlan.status === "planned"
      });
      return finalizeSidecarPlan({
        plan: resolvedPlan,
        candidateId: step.candidateId,
        decision: sidecarPlanStatusToJudgeDecision(resolvedPlan.status),
        accepted,
        reason: resolvedPlan.notes,
        actualRenderer: resolvedPlan.renderer,
        actualBackendCapability:
          typeof resolvedPlan.metadata?.actualBackendCapability === "string"
            ? resolvedPlan.metadata.actualBackendCapability
            : backendCapability
      });
    }
    if (
      placeholderRenderer &&
      (rendererName === "generated-pack-placeholder" ||
        rendererName === "request-pack" ||
        (backendCapability === "still_placeholder" && !stillVideoRenderer))
    ) {
      const plan = await placeholderRenderer({
        episodeId,
        shot: generatedPackShot,
        shotType,
        renderMode,
        narration,
        outputRootDir,
        fps,
        width,
        height,
        attempt,
        maxAttempts
      });
      if (!plan) {
        return null;
      }
      const resolvedPlan = withResolvedSidecarPresetMetadata(plan);
      const accepted = resolvedPlan.status === "resolved";
      const step = pushRetake({
        attemptIndex: attempt,
        renderer: rendererName,
        backend: backendCapability,
        actualBackendCapability:
          typeof resolvedPlan.metadata?.actualBackendCapability === "string"
            ? resolvedPlan.metadata.actualBackendCapability
            : backendCapability,
        outcome: sidecarPlanStatusToRetakeOutcome(resolvedPlan.status),
        reason: resolvedPlan.notes,
        selectedForRender: resolvedPlan.status === "resolved" || resolvedPlan.status === "planned"
      });
      return finalizeSidecarPlan({
        plan: resolvedPlan,
        candidateId: step.candidateId,
        decision: sidecarPlanStatusToJudgeDecision(resolvedPlan.status),
        accepted,
        reason: resolvedPlan.notes,
        actualRenderer: resolvedPlan.renderer,
        actualBackendCapability:
          typeof resolvedPlan.metadata?.actualBackendCapability === "string"
            ? resolvedPlan.metadata.actualBackendCapability
            : backendCapability
      });
    }

    const requestedReferenceDebug = resolveRequestedReferenceView({
      shot: generatedPackShot,
      renderMode,
      availableViewNames: CHARACTER_VIEW_NAMES.filter(
        (view) =>
          typeof referenceImagePathByView[view] === "string" &&
          referenceImagePathByView[view]!.trim().length > 0
      )
    });
    const referenceSelection = selectBrollReferenceView({
      shot: generatedPackShot,
      narration,
      availableViews: referenceImagePathByView,
      referenceSourceByView,
      viewScoresByView: input?.referenceScoreByView
    });
    const referenceView = referenceSelection.referenceView;
    const referenceImagePath =
      (referenceView ? referenceImagePathByView[referenceView] : null) ?? fallbackReferenceImagePath ?? null;
    const referenceMode =
      referenceImagePath && referenceImagePath !== VIDEO_BROLL_REFERENCE_IMAGE ? "character_pack" : referenceImagePath ? "env_fallback" : "missing";
    const referenceBundle = buildBrollReferenceBundle({
      selection: referenceSelection,
      referenceView,
      referenceMode,
      referenceImagePathByView,
      referenceSourceByView,
      referenceScoreByView: input?.referenceScoreByView ?? {},
      fallbackReferenceImagePath,
      selectedReferenceImagePath: referenceImagePath,
      generationManifestPath: input?.generationManifestPath ?? null,
      generationWarnings: input?.generationWarnings ?? []
    });
    const sidecarDir = path.join(outputRootDir, "shot_sidecar");
    fs.mkdirSync(sidecarDir, { recursive: true });
    const planPath = path.join(sidecarDir, `${shot.shot_id}.plan.json`);
    const requestPath = path.join(sidecarDir, `${shot.shot_id}.request.json`);
    const promptPath = path.join(sidecarDir, `${shot.shot_id}.prompt.txt`);
    const premiumCandidateJudgePath = path.join(sidecarDir, `${shot.shot_id}.premium_candidate_judge.json`);
    const premiumActualJudgePath = path.join(sidecarDir, `${shot.shot_id}.premium_actual_judge.json`);
    const baseRequestPack = buildBrollPromptPack({
      episodeId,
      shot: generatedPackShot,
      shotType,
      renderMode,
      narration,
      modelName,
      rendererName,
      fps,
      width,
      height,
      attempt,
      maxAttempts,
      referenceMode,
      referenceView,
      backendCapability,
      speciesId: input?.speciesId ?? null,
      characterPackId: input?.characterPackId ?? null,
      referenceBundle,
      requestedReference: {
        view: requestedReferenceDebug.view,
        source: requestedReferenceDebug.source,
        rawViewTrack: generatedPackShot.character?.tracks?.view_track ?? null,
        rawViewTrackCamel: (generatedPackShot.character?.tracks as { viewTrack?: unknown } | undefined)?.viewTrack ?? null
      },
      channelDomain: input?.channelDomain ?? null,
      resolvedSidecarPreset
    });
    const premiumPromptSelection = buildPremiumSidecarPromptSelection({
      episodeId,
      shot: generatedPackShot,
      shotType,
      renderMode,
      referenceMode,
      rendererName,
      backendCapability,
      attemptIndex: attempt,
      requestPack: baseRequestPack,
      judgePath: premiumCandidateJudgePath
    });
    let requestPack = premiumPromptSelection.requestPack;
    let premiumActualJudgeReport: PremiumActualOutputJudgeReport | null = null;
    const resolvePromptSelectionMetadata = (activeRequestPack: typeof requestPack = requestPack) =>
      resolvePremiumSidecarSelectionMetadata(activeRequestPack);
    const resolveActualSelectionMetadata = () =>
      resolvePremiumActualSelectionMetadata(premiumActualJudgeReport, premiumActualJudgeReport ? premiumActualJudgePath : null);
    const buildPlanPayload = (activeRequestPack: typeof requestPack = requestPack) => {
      const premiumSelectionMetadata = resolvePromptSelectionMetadata(activeRequestPack);
      const premiumActualSelectionMetadata = resolveActualSelectionMetadata();
      return {
        schema_version: "1.0",
        episode_id: episodeId,
        shot_id: shot.shot_id,
        shot_type: shotType,
        render_mode: renderMode,
        renderer: rendererName,
        model: modelName,
        set_id: shot.set.set_id,
        has_chart: Boolean(shot.chart),
        narration,
        backend: backendCapability,
        render_quality: activeRequestPack.render_quality,
        camera_profile: activeRequestPack.camera_profile,
        motion_profile: activeRequestPack.motion_profile,
        control_mode: activeRequestPack.control_mode,
        controlnet_preset: activeRequestPack.controlnet_preset,
        impact_preset: activeRequestPack.impact_preset,
        qc_preset: activeRequestPack.qc_preset,
        preset_manifest_version: activeRequestPack.preset_manifest_version,
        preset_source: activeRequestPack.preset_source,
        preset_rollout_source: activeRequestPack.preset_rollout_source,
        preset_rollout_source_kind: activeRequestPack.preset_rollout_source_kind,
        preset_rollout_scenario: activeRequestPack.preset_rollout_scenario,
        preset_rollout_score: activeRequestPack.preset_rollout_score,
        preset_rollout_verdict: activeRequestPack.preset_rollout_verdict,
        preset_rollout_target: activeRequestPack.preset_rollout_target,
        preset_rollout_artifact_age_hours: activeRequestPack.preset_rollout_artifact_age_hours,
        preset_rollout_channel_domain: activeRequestPack.preset_rollout_channel_domain,
        resolution_profile: activeRequestPack.resolution_profile,
        step_profile: activeRequestPack.step_profile,
        cache_profile: activeRequestPack.cache_profile,
        sr_profile: activeRequestPack.sr_profile,
        seed_override: activeRequestPack.seed_override,
        premium_candidate_judge_version: premiumSelectionMetadata.premiumCandidateJudgeVersion,
        premium_candidate_count: premiumSelectionMetadata.premiumCandidateCount,
        premium_selected_candidate_id: premiumSelectionMetadata.premiumSelectedCandidateId,
        premium_selected_candidate_objective: premiumSelectionMetadata.premiumSelectedCandidateObjective,
        premium_selected_candidate_score: premiumSelectionMetadata.premiumSelectedCandidateScore,
        premium_candidate_selection_reason: premiumSelectionMetadata.premiumCandidateSelectionReason,
        premium_candidate_judge_path: premiumSelectionMetadata.premiumCandidateJudgePath,
        premium_actual_judge_version: premiumActualSelectionMetadata.premiumActualJudgeVersion,
        premium_actual_candidate_count: premiumActualSelectionMetadata.premiumActualCandidateCount,
        premium_actual_selected_candidate_id: premiumActualSelectionMetadata.premiumActualSelectedCandidateId,
        premium_actual_selected_candidate_objective: premiumActualSelectionMetadata.premiumActualSelectedObjective,
        premium_actual_selected_candidate_score: premiumActualSelectionMetadata.premiumActualSelectedScore,
        premium_actual_selection_reason: premiumActualSelectionMetadata.premiumActualSelectionReason,
        premium_actual_judge_path: premiumActualSelectionMetadata.premiumActualJudgePath,
        premium_actual_judge_policy_version: premiumActualSelectionMetadata.premiumActualJudgePolicyVersion,
        premium_actual_policy_accepted: premiumActualSelectionMetadata.premiumActualPolicyAccepted,
        premium_actual_policy_rejection_reasons: premiumActualSelectionMetadata.premiumActualPolicyRejectionReasons,
        premium_actual_retake_round: premiumActualSelectionMetadata.premiumActualRetakeRound,
        premium_actual_retake_count: premiumActualSelectionMetadata.premiumActualRetakeCount,
        premium_actual_visual_signal_mode: premiumActualSelectionMetadata.premiumActualVisualSignalMode,
        premium_actual_visual_signal_score: premiumActualSelectionMetadata.premiumActualVisualSignalScore,
        premium_actual_visual_signal_report_path: premiumActualSelectionMetadata.premiumActualVisualSignalReportPath,
        premium_actual_face_stability_score: premiumActualSelectionMetadata.premiumActualFaceStabilityScore,
        premium_actual_motion_coherence_score: premiumActualSelectionMetadata.premiumActualMotionCoherenceScore,
        premium_actual_silhouette_readability_score:
          premiumActualSelectionMetadata.premiumActualSilhouetteReadabilityScore,
        premium_actual_mascot_identity_preservation_score:
          premiumActualSelectionMetadata.premiumActualMascotIdentityPreservationScore,
        premium_actual_subtitle_safe_score: premiumActualSelectionMetadata.premiumActualSubtitleSafeScore,
        premium_actual_chart_safe_score: premiumActualSelectionMetadata.premiumActualChartSafeScore,
        request_path: requestPath,
        prompt_path: promptPath,
        reference_bundle: referenceBundle
      };
    };
    const writeCanonicalSidecarArtifacts = (activeRequestPack: typeof requestPack = requestPack) => {
      writeJson(planPath, buildPlanPayload(activeRequestPack));
      writeJson(requestPath, activeRequestPack);
      fs.writeFileSync(promptPath, `${activeRequestPack.prompt}\n`, "utf8");
      if (premiumPromptSelection.judgeReport) {
        writeJson(premiumCandidateJudgePath, premiumPromptSelection.judgeReport);
      }
      if (premiumActualJudgeReport) {
        writeJson(premiumActualJudgePath, premiumActualJudgeReport);
      }
    };
    const buildBaseArtifacts = () => [
      {
        kind: "json" as const,
        path: planPath,
        label: "shot-sidecar-plan"
      },
      {
        kind: "json" as const,
        path: requestPath,
        label: "shot-sidecar-request"
      },
      {
        kind: "plan" as const,
        path: promptPath,
        label: "shot-sidecar-prompt"
      },
      ...(premiumPromptSelection.judgeReport
        ? [
            {
              kind: "json" as const,
              path: premiumCandidateJudgePath,
              label: "shot-sidecar-premium-candidate-judge"
            }
          ]
        : []),
      ...(premiumActualJudgeReport
        ? [
            {
              kind: "json" as const,
              path: premiumActualJudgePath,
              label: "shot-sidecar-premium-actual-judge"
            }
          ]
        : [])
    ];
    const buildBaseMetadata = (activeRequestPack: typeof requestPack = requestPack) => {
      const premiumSelectionMetadata = resolvePromptSelectionMetadata(activeRequestPack);
      const premiumActualSelectionMetadata = resolveActualSelectionMetadata();
      return {
        episodeId,
        modelName,
        hasChart: Boolean(shot.chart),
        requestKind: activeRequestPack.request_kind,
        referenceView,
        durationSeconds: activeRequestPack.duration_seconds,
        fps,
        width,
        height,
        referenceImagePath,
        generationManifestPath: input?.generationManifestPath ?? null,
        referenceBundle,
        attempt,
        maxAttempts,
        backendCapability,
        renderQuality: activeRequestPack.render_quality,
        cameraProfile: activeRequestPack.camera_profile,
        motionProfile: activeRequestPack.motion_profile,
        controlMode: activeRequestPack.control_mode,
        controlnetPreset: activeRequestPack.controlnet_preset,
        impactPreset: activeRequestPack.impact_preset,
        qcPreset: activeRequestPack.qc_preset,
        presetManifestVersion: activeRequestPack.preset_manifest_version,
        presetSource: activeRequestPack.preset_source,
        presetRolloutSource:
          typeof activeRequestPack.preset_rollout_source === "string" ? activeRequestPack.preset_rollout_source : null,
        presetRolloutSourceKind:
          activeRequestPack.preset_rollout_source_kind === "file" ||
          activeRequestPack.preset_rollout_source_kind === "matrix"
            ? activeRequestPack.preset_rollout_source_kind
            : null,
        presetRolloutScenario:
          typeof activeRequestPack.preset_rollout_scenario === "string" ? activeRequestPack.preset_rollout_scenario : null,
        presetRolloutScore:
          typeof activeRequestPack.preset_rollout_score === "number" ? activeRequestPack.preset_rollout_score : null,
        presetRolloutVerdict:
          typeof activeRequestPack.preset_rollout_verdict === "string" ? activeRequestPack.preset_rollout_verdict : null,
        presetRolloutTarget:
          activeRequestPack.preset_rollout_target === "overall" ||
          activeRequestPack.preset_rollout_target === "balanced" ||
          activeRequestPack.preset_rollout_target === "strict"
            ? activeRequestPack.preset_rollout_target
            : null,
        presetRolloutArtifactAgeHours:
          typeof activeRequestPack.preset_rollout_artifact_age_hours === "number"
            ? activeRequestPack.preset_rollout_artifact_age_hours
            : null,
        presetRolloutChannelDomain:
          activeRequestPack.preset_rollout_channel_domain === "economy" ||
          activeRequestPack.preset_rollout_channel_domain === "medical"
            ? activeRequestPack.preset_rollout_channel_domain
            : null,
        policyTags: parseStringArray(activeRequestPack.metadata?.preset_policy_tags),
        premiumFlag: activeRequestPack.premium_flag,
        seedOverride: typeof activeRequestPack.seed_override === "number" ? activeRequestPack.seed_override : null,
        premiumCandidateJudgeVersion: premiumSelectionMetadata.premiumCandidateJudgeVersion,
        premiumCandidateCount: premiumSelectionMetadata.premiumCandidateCount,
        premiumSelectedCandidateId: premiumSelectionMetadata.premiumSelectedCandidateId,
        premiumSelectedCandidateObjective: premiumSelectionMetadata.premiumSelectedCandidateObjective,
        premiumSelectedCandidateScore: premiumSelectionMetadata.premiumSelectedCandidateScore,
        premiumCandidateSelectionReason: premiumSelectionMetadata.premiumCandidateSelectionReason,
        premiumCandidateJudgePath: premiumSelectionMetadata.premiumCandidateJudgePath,
        premiumSelectedSeedOverride: premiumSelectionMetadata.premiumSelectedSeedOverride,
        premiumActualJudgeVersion: premiumActualSelectionMetadata.premiumActualJudgeVersion,
        premiumActualCandidateCount: premiumActualSelectionMetadata.premiumActualCandidateCount,
        premiumActualSelectedCandidateId: premiumActualSelectionMetadata.premiumActualSelectedCandidateId,
        premiumActualSelectedCandidateObjective: premiumActualSelectionMetadata.premiumActualSelectedObjective,
        premiumActualSelectedCandidateScore: premiumActualSelectionMetadata.premiumActualSelectedScore,
        premiumActualSelectionReason: premiumActualSelectionMetadata.premiumActualSelectionReason,
        premiumActualJudgePath: premiumActualSelectionMetadata.premiumActualJudgePath,
        premiumActualJudgePolicyVersion: premiumActualSelectionMetadata.premiumActualJudgePolicyVersion,
        premiumActualPolicyAccepted: premiumActualSelectionMetadata.premiumActualPolicyAccepted,
        premiumActualPolicyRejectionReasons: premiumActualSelectionMetadata.premiumActualPolicyRejectionReasons,
        premiumActualRetakeRound: premiumActualSelectionMetadata.premiumActualRetakeRound,
        premiumActualRetakeCount: premiumActualSelectionMetadata.premiumActualRetakeCount,
        premiumActualVisualSignalMode: premiumActualSelectionMetadata.premiumActualVisualSignalMode,
        premiumActualVisualSignalScore: premiumActualSelectionMetadata.premiumActualVisualSignalScore,
        premiumActualVisualSignalReportPath: premiumActualSelectionMetadata.premiumActualVisualSignalReportPath,
        premiumActualFaceStabilityScore: premiumActualSelectionMetadata.premiumActualFaceStabilityScore,
        premiumActualMotionCoherenceScore: premiumActualSelectionMetadata.premiumActualMotionCoherenceScore,
        premiumActualSilhouetteReadabilityScore: premiumActualSelectionMetadata.premiumActualSilhouetteReadabilityScore,
        premiumActualMascotIdentityPreservationScore:
          premiumActualSelectionMetadata.premiumActualMascotIdentityPreservationScore,
        premiumActualSubtitleSafeScore: premiumActualSelectionMetadata.premiumActualSubtitleSafeScore,
        premiumActualChartSafeScore: premiumActualSelectionMetadata.premiumActualChartSafeScore,
        resolutionProfile: activeRequestPack.resolution_profile,
        stepProfile: activeRequestPack.step_profile,
        cacheProfile: activeRequestPack.cache_profile,
        srProfile: activeRequestPack.sr_profile,
        optionalAudioInputFuture: activeRequestPack.optional_audio_input_future
      };
    };
    writeCanonicalSidecarArtifacts();

    const notes =
      renderMode === "generative_broll"
        ? "B-roll request pack generated. Deterministic main render remains active until a video model executor is attached."
        : "Overlay request pack generated. Deterministic main render remains active until a sidecar executor is attached.";

    const tryStillFallback = async (reason: string) => {
      if (stillVideoRenderer) {
        const fallbackPlan = await stillVideoRenderer({
          episodeId,
          shot: generatedPackShot,
          shotType,
          renderMode,
          narration,
          outputRootDir,
          fps,
          width,
          height,
          attempt,
          maxAttempts
        });
        if (fallbackPlan) {
          const resolvedFallbackPlan = withResolvedSidecarPresetMetadata(fallbackPlan);
          return {
            ...resolvedFallbackPlan,
            notes: `${resolvedFallbackPlan.notes ?? "Still-video fallback resolved."} Fallback reason: ${reason}`.trim(),
            artifacts: mergeSidecarArtifacts(resolvedFallbackPlan.artifacts, buildBaseArtifacts()),
            metadata: {
              ...buildBaseMetadata(),
              ...(resolvedFallbackPlan.metadata ?? {}),
              fallbackFrom: backendCapability,
              fallbackReason: reason,
              requestPackPath: requestPath
            }
          };
        }
      }
      if (placeholderRenderer) {
        const fallbackPlan = await placeholderRenderer({
          episodeId,
          shot: generatedPackShot,
          shotType,
          renderMode,
          narration,
          outputRootDir,
          fps,
          width,
          height,
          attempt,
          maxAttempts
        });
        if (fallbackPlan) {
          const resolvedFallbackPlan = withResolvedSidecarPresetMetadata(fallbackPlan);
          return {
            ...resolvedFallbackPlan,
            notes: `${resolvedFallbackPlan.notes ?? "Placeholder fallback planned."} Fallback reason: ${reason}`.trim(),
            artifacts: mergeSidecarArtifacts(resolvedFallbackPlan.artifacts, buildBaseArtifacts()),
            metadata: {
              ...buildBaseMetadata(),
              ...(resolvedFallbackPlan.metadata ?? {}),
              fallbackFrom: backendCapability,
              fallbackReason: reason,
              requestPackPath: requestPath
            }
          };
        }
      }
      return null;
    };

    const tryWanRender = async (input: {
      fallbackFrom: SidecarBackendCapability | null;
      requestPackOverride?: ReturnType<typeof buildBrollPromptPack>;
      shotIdOverride?: string;
      candidate?: PremiumSidecarExecutionCandidate | null;
    }) => {
      const activeRequestPack = input.requestPackOverride ?? requestPack;
      const activeShotId = input.shotIdOverride ?? shot.shot_id;
      const activeMetadata = {
        ...buildBaseMetadata(activeRequestPack),
        premiumActualCandidateId: input.candidate?.candidateId ?? null,
        premiumActualCandidateObjective: input.candidate?.objective ?? null,
        premiumActualCandidatePriorScore: input.candidate?.priorScore ?? null,
        premiumActualCandidateReasoningTags: input.candidate?.reasoningTags ?? []
      };
      if (renderMode === "generative_overlay") {
        return {
          shotId: shot.shot_id,
          shotType,
          renderMode,
          status: "skipped" as const,
          renderer: input.fallbackFrom ? `${rendererName} -> comfyui-wan-i2v` : rendererName,
          notes: "Wan I2V executor currently supports generated still driven sidecar shots only (broll/i2v/s2v).",
          artifacts: buildBaseArtifacts(),
          metadata: {
            ...activeMetadata,
            actualBackendCapability: "wan",
            fallbackFrom: input.fallbackFrom,
            success: false
          }
        };
      }

      const startedAt = Date.now();
      const result = await renderComfyWanBroll({
        requestPack: activeRequestPack,
        episodeId,
        outputRootDir,
        shotId: activeShotId,
        referenceImagePath,
        fps,
        width,
        height
      });
      const latencyMs = result.cached ? 0 : Date.now() - startedAt;
      return {
        shotId: shot.shot_id,
        shotType,
        renderMode,
        status: "resolved" as const,
        renderer: input.fallbackFrom ? `${rendererName} -> comfyui-wan-i2v` : rendererName,
        notes: result.cached
          ? "Wan I2V sidecar video resolved from cache."
          : "Wan I2V sidecar video rendered through ComfyUI and saved as an MP4 artifact.",
        artifacts: [
          ...buildBaseArtifacts(),
          {
            kind: "json" as const,
            path: result.preflightPath,
            label: "shot-sidecar-preflight"
          },
          {
            kind: "json" as const,
            path: result.workflowPath,
            label: "shot-sidecar-workflow-api"
          },
          {
            kind: "json" as const,
            path: result.resultPath,
            label: "shot-sidecar-result"
          },
          {
            kind: "video" as const,
            path: result.outputVideoPath,
            label: "shot-sidecar-video"
          }
        ],
        metadata: {
          ...activeMetadata,
          actualBackendCapability: "wan",
          fallbackFrom: input.fallbackFrom,
          cacheKey: result.cacheKey,
          cached: result.cached,
          promptId: "promptId" in result ? result.promptId : null,
          publicVideoSrc: result.publicVideoSrc,
          latencyMs,
          outputDurationSeconds: result.outputDurationSeconds,
          executionProfile: result.executionProfile,
          workflowBinding: result.workflowBinding,
          preflightWarnings: "preflightWarnings" in result ? result.preflightWarnings : [],
          effectiveUseClipVision: "effectiveUseClipVision" in result ? result.effectiveUseClipVision : null,
          clipVisionModelName: "clipVisionModelName" in result ? result.clipVisionModelName : null,
          qcEvaluation: result.qcEvaluation,
          offloadingMode: process.env.VIDEO_BROLL_OFFLOAD_MODE?.trim() || "default",
          vramMode: process.env.VIDEO_BROLL_VRAM_MODE?.trim() || "auto",
          success: true
        }
      };
    };

    const tryHunyuanRender = async (input: {
      capability: Extract<SidecarBackendCapability, "hunyuan15_local_i2v" | "hunyuan15_local_i2v_sr">;
      requestPackOverride?: ReturnType<typeof buildBrollPromptPack>;
      shotIdOverride?: string;
      candidate?: PremiumSidecarExecutionCandidate | null;
    }) => {
      const activeRequestPack = input.requestPackOverride ?? requestPack;
      const activeShotId = input.shotIdOverride ?? shot.shot_id;
      const activeMetadata = {
        ...buildBaseMetadata(activeRequestPack),
        premiumActualCandidateId: input.candidate?.candidateId ?? null,
        premiumActualCandidateObjective: input.candidate?.objective ?? null,
        premiumActualCandidatePriorScore: input.candidate?.priorScore ?? null,
        premiumActualCandidateReasoningTags: input.candidate?.reasoningTags ?? []
      };
      const result = await renderComfyHunyuanI2V({
        requestPack: activeRequestPack,
        episodeId,
        outputRootDir,
        shotId: activeShotId,
        referenceImagePath,
        fps,
        width,
        height,
        backendCapability: input.capability
      });
      return {
        shotId: shot.shot_id,
        shotType,
        renderMode,
        status: "resolved" as const,
        renderer: rendererName,
        notes: result.cached
          ? "HunyuanVideo 1.5 I2V sidecar resolved from cache."
          : "HunyuanVideo 1.5 I2V sidecar video rendered through ComfyUI and saved as an MP4 artifact.",
        artifacts: [
          ...buildBaseArtifacts(),
          {
            kind: "json" as const,
            path: result.preflightPath,
            label: "shot-sidecar-preflight"
          },
          {
            kind: "json" as const,
            path: result.workflowPath,
            label: "shot-sidecar-workflow-api"
          },
          {
            kind: "json" as const,
            path: result.resultPath,
            label: "shot-sidecar-result"
          },
          {
            kind: "video" as const,
            path: result.outputVideoPath,
            label: "shot-sidecar-video"
          }
        ],
        metadata: {
          ...activeMetadata,
          actualBackendCapability: input.capability,
          cacheKey: result.cacheKey,
          cached: result.cached,
          promptId: "promptId" in result ? result.promptId : null,
          publicVideoSrc: result.publicVideoSrc,
          latencyMs: result.latencyMs,
          outputDurationSeconds: result.outputDurationSeconds,
          executionProfile: result.executionProfile,
          workflowBinding: result.workflowBinding,
          preflightWarnings: "preflightWarnings" in result ? result.preflightWarnings : [],
          clipVisionModelName: "clipVisionModelName" in result ? result.clipVisionModelName : null,
          qcEvaluation: result.qcEvaluation,
          offloadingMode: VIDEO_HUNYUAN_OFFLOAD_MODE,
          vramMode: VIDEO_HUNYUAN_VRAM_MODE,
          success: true
        }
      };
    };

    const tryPremiumActualOutputJudge = async (input: {
      backend: "wan" | "hunyuan";
      capability?: Extract<SidecarBackendCapability, "hunyuan15_local_i2v" | "hunyuan15_local_i2v_sr">;
      fallbackFrom: SidecarBackendCapability | null;
    }): Promise<ShotSidecarPlan | null> => {
      if (!requestPack.premium_flag) {
        return null;
      }
      const executionCandidates = premiumPromptSelection.executionCandidates.slice(
        0,
        Math.min(VIDEO_SIDECAR_PREMIUM_ACTUAL_CANDIDATE_COUNT, premiumPromptSelection.executionCandidates.length)
      );
      if (executionCandidates.length < 2) {
        return null;
      }

      const runtimeJudgeChannelDomain =
        requestPack.preset_rollout_channel_domain === "economy" || requestPack.preset_rollout_channel_domain === "medical"
          ? requestPack.preset_rollout_channel_domain
          : null;
      const runtimeJudgePolicy: SidecarRuntimeJudgePolicy = resolveSidecarRuntimeJudgePolicy(runtimeJudgeChannelDomain);
      const candidateReports: PremiumActualOutputCandidateReport[] = [];
      const successfulCandidates: PremiumActualSuccessfulCandidate[] = [];
      let executedRetakeCount = 0;

      const runExecutionCandidate = async (
        candidate: PremiumSidecarExecutionCandidate,
        retakeRound: number
      ): Promise<PremiumActualSuccessfulCandidate | null> => {
        const executionShotId = buildPremiumSidecarExecutionShotId({
          shotId: shot.shot_id,
          attemptIndex: attempt,
          candidateId: candidate.candidateId
        });
        try {
          const candidatePlan =
            input.backend === "wan"
              ? await tryWanRender({
                  fallbackFrom: input.fallbackFrom,
                  requestPackOverride: candidate.requestPack,
                  shotIdOverride: executionShotId,
                  candidate
                })
              : await tryHunyuanRender({
                  capability: input.capability!,
                  requestPackOverride: candidate.requestPack,
                  shotIdOverride: executionShotId,
                  candidate
                });
          const planMetadata = (candidatePlan.metadata ?? {}) as Record<string, unknown>;
          const qcEvaluation =
            typeof planMetadata.qcEvaluation === "object" &&
            planMetadata.qcEvaluation !== null &&
            !Array.isArray(planMetadata.qcEvaluation)
              ? (planMetadata.qcEvaluation as Record<string, unknown>)
              : null;
          const qcPassed = typeof qcEvaluation?.passed === "boolean" ? qcEvaluation.passed : false;
          const qcReasons = Array.isArray(qcEvaluation?.reasons)
            ? qcEvaluation.reasons.filter((value): value is string => typeof value === "string")
            : [];
          const qcWarnings = Array.isArray(qcEvaluation?.warnings)
            ? qcEvaluation.warnings.filter((value): value is string => typeof value === "string")
            : [];
          const outputDurationSeconds =
            typeof planMetadata.outputDurationSeconds === "number" ? planMetadata.outputDurationSeconds : null;
          const latencyMs = typeof planMetadata.latencyMs === "number" ? planMetadata.latencyMs : null;
          const cached = typeof planMetadata.cached === "boolean" ? planMetadata.cached : false;
          const outputVideoPath =
            candidatePlan.artifacts?.find((artifact) => artifact.label === "shot-sidecar-video")?.path ?? null;
          const visualSignalPath = path.join(sidecarDir, `${executionShotId}.premium_visual_judge.json`);
          const visualSignalReport = await evaluatePremiumActualVisualSignals({
            judgeVersion: PREMIUM_SIDECAR_ACTUAL_CANDIDATE_JUDGE_VERSION,
            sidecarDir,
            shotId: shot.shot_id,
            candidateId: candidate.candidateId,
            objective: candidate.objective,
            outputVideoPath,
            referenceImagePath,
            expectedDurationSeconds: candidate.requestPack.duration_seconds,
            outputDurationSeconds,
            hasChart: Boolean(generatedPackShot.chart)
          });
          writeJson(visualSignalPath, visualSignalReport);
          const outputScore = scorePremiumActualOutputCandidate({
            priorScore: candidate.priorScore,
            expectedDurationSeconds: candidate.requestPack.duration_seconds,
            outputDurationSeconds,
            qcEvaluation: {
              passed: qcPassed,
              reasons: qcReasons,
              warnings: qcWarnings
            },
            cached,
            latencyMs: latencyMs ?? 0,
            visualSignalScore: visualSignalReport.overall_score
          });
          const policyEvaluation = evaluateSidecarRuntimeJudge({
            channelDomain: runtimeJudgeChannelDomain,
            outputScore,
            expectedDurationSeconds: candidate.requestPack.duration_seconds,
            outputDurationSeconds,
            qcPassed,
            visualSignalMode: visualSignalReport.mode,
            visualSignalScore: visualSignalReport.overall_score,
            faceStabilityScore: visualSignalReport.face_stability_score,
            mascotIdentityPreservationScore: visualSignalReport.mascot_identity_preservation_score,
            subtitleSafeScore: visualSignalReport.subtitle_safe_score,
            chartSafeScore: visualSignalReport.chart_safe_score
          });
          const successfulCandidate: PremiumActualSuccessfulCandidate = {
            candidate,
            plan: candidatePlan,
            outputScore,
            visualSignalReport,
            visualSignalPath,
            policyEvaluation,
            retakeRound
          };
          successfulCandidates.push(successfulCandidate);
          candidateReports.push({
            candidate_id: candidate.candidateId,
            objective: candidate.objective,
            execution_shot_id: executionShotId,
            prior_score: candidate.priorScore,
            output_score: outputScore,
            selected: false,
            success: true,
            accepted_by_policy: policyEvaluation.accepted,
            policy_rejection_reasons: policyEvaluation.reasons,
            judge_policy_version: policyEvaluation.policy.policy_version,
            retake_round: retakeRound,
            cached,
            latency_ms: latencyMs,
            output_duration_seconds: outputDurationSeconds,
            duration_delta_seconds:
              typeof outputDurationSeconds === "number"
                ? Number(Math.abs(outputDurationSeconds - candidate.requestPack.duration_seconds).toFixed(2))
                : null,
            qc_passed: qcPassed,
            qc_reasons: qcReasons,
            qc_warnings: qcWarnings,
            public_video_src: typeof planMetadata.publicVideoSrc === "string" ? planMetadata.publicVideoSrc : null,
            output_video_path:
              candidatePlan.artifacts?.find((artifact) => artifact.label === "shot-sidecar-video")?.path ?? null,
            result_path:
              candidatePlan.artifacts?.find((artifact) => artifact.label === "shot-sidecar-result")?.path ?? null,
            workflow_path:
              candidatePlan.artifacts?.find((artifact) => artifact.label === "shot-sidecar-workflow-api")?.path ?? null,
            preflight_path:
              candidatePlan.artifacts?.find((artifact) => artifact.label === "shot-sidecar-preflight")?.path ?? null,
            cache_key: typeof planMetadata.cacheKey === "string" ? planMetadata.cacheKey : null,
            seed_override: typeof candidate.requestPack.seed_override === "number" ? candidate.requestPack.seed_override : null,
            visual_signal_mode: visualSignalReport.mode,
            visual_signal_score: visualSignalReport.overall_score,
            face_stability_score: visualSignalReport.face_stability_score,
            motion_coherence_score: visualSignalReport.motion_coherence_score,
            silhouette_readability_score: visualSignalReport.silhouette_readability_score,
            mascot_identity_preservation_score: visualSignalReport.mascot_identity_preservation_score,
            subtitle_safe_score: visualSignalReport.subtitle_safe_score,
            chart_safe_score: visualSignalReport.chart_safe_score,
            visual_signal_warnings: visualSignalReport.warnings,
            visual_signal_report_path: visualSignalPath,
            error: null,
            reasoning_tags: candidate.reasoningTags
          });
          return successfulCandidate;
        } catch (error) {
          candidateReports.push({
            candidate_id: candidate.candidateId,
            objective: candidate.objective,
            execution_shot_id: executionShotId,
            prior_score: candidate.priorScore,
            output_score: 0,
            selected: false,
            success: false,
            accepted_by_policy: null,
            policy_rejection_reasons: [],
            judge_policy_version: runtimeJudgePolicy.policy_version,
            retake_round: retakeRound,
            cached: null,
            latency_ms: null,
            output_duration_seconds: null,
            duration_delta_seconds: null,
            qc_passed: null,
            qc_reasons: [],
            qc_warnings: [],
            public_video_src: null,
            output_video_path: null,
            result_path: null,
            workflow_path: null,
            preflight_path: null,
            cache_key: null,
            seed_override: typeof candidate.requestPack.seed_override === "number" ? candidate.requestPack.seed_override : null,
            visual_signal_mode: null,
            visual_signal_score: null,
            face_stability_score: null,
            motion_coherence_score: null,
            silhouette_readability_score: null,
            mascot_identity_preservation_score: null,
            subtitle_safe_score: null,
            chart_safe_score: null,
            visual_signal_warnings: [],
            visual_signal_report_path: null,
            error: error instanceof Error ? error.message : String(error),
            reasoning_tags: candidate.reasoningTags
          });
          return null;
        }
      };

      let roundCandidates = executionCandidates;
      for (let retakeRound = 0; roundCandidates.length > 0; retakeRound += 1) {
        const roundSuccessfulCandidates: PremiumActualSuccessfulCandidate[] = [];
        for (const candidate of roundCandidates) {
          const executedCandidate = await runExecutionCandidate(candidate, retakeRound);
          if (executedCandidate) {
            roundSuccessfulCandidates.push(executedCandidate);
          }
        }
        if (roundSuccessfulCandidates.some((candidate) => candidate.policyEvaluation.accepted)) {
          break;
        }
        if (retakeRound >= VIDEO_SIDECAR_PREMIUM_ACTUAL_RETAKE_COUNT) {
          break;
        }
        const retryCandidateBase =
          [...roundSuccessfulCandidates]
            .filter((candidate) => !candidate.policyEvaluation.accepted && candidate.policyEvaluation.reasons.length > 0)
            .sort((left, right) => {
              if (right.outputScore !== left.outputScore) {
                return right.outputScore - left.outputScore;
              }
              return right.candidate.priorScore - left.candidate.priorScore;
            })[0] ?? null;
        if (!retryCandidateBase) {
          break;
        }
        executedRetakeCount = retakeRound + 1;
        roundCandidates = [
          buildPremiumActualRetakeCandidate({
            episodeId,
            shotId: shot.shot_id,
            attemptIndex: attempt,
            rendererName,
            channelDomain: runtimeJudgeChannelDomain,
            candidate: retryCandidateBase.candidate,
            rejectionReasons: retryCandidateBase.policyEvaluation.reasons,
            retakeRound: retakeRound + 1
          })
        ];
      }

      const rankedAcceptedCandidates = [...successfulCandidates]
        .filter((candidate) => candidate.policyEvaluation.accepted)
        .sort((left, right) => {
          if (right.outputScore !== left.outputScore) {
            return right.outputScore - left.outputScore;
          }
          return right.candidate.priorScore - left.candidate.priorScore;
        });
      const selectedCandidate = rankedAcceptedCandidates[0] ?? null;
      const selectionReason = selectedCandidate
        ? `selected ${selectedCandidate.candidate.objective} actual output (${selectedCandidate.outputScore.toFixed(
            2
          )}) via ${runtimeJudgePolicy.policy_version}${selectedCandidate.retakeRound > 0 ? ` after retake ${selectedCandidate.retakeRound}` : ""}`
        : null;
      premiumActualJudgeReport = {
        schema_version: "1.0",
        judge_version: PREMIUM_SIDECAR_ACTUAL_CANDIDATE_JUDGE_VERSION,
        judge_policy_version: runtimeJudgePolicy.policy_version,
        episode_id: episodeId,
        shot_id: shot.shot_id,
        renderer: rendererName,
        backend: backendCapability,
        candidate_count: candidateReports.length,
        accepted_candidate_count: rankedAcceptedCandidates.length,
        retake_count: executedRetakeCount,
        selected_candidate_id: selectedCandidate?.candidate.candidateId ?? null,
        selected_objective: selectedCandidate?.candidate.objective ?? null,
        selected_score: selectedCandidate?.outputScore ?? null,
        selection_reason: selectionReason,
        candidates: candidateReports.map((report) => ({
          ...report,
          selected: report.candidate_id === selectedCandidate?.candidate.candidateId
        }))
      };

      if (!selectedCandidate) {
        writeCanonicalSidecarArtifacts();
        const rejectionSummary = candidateReports
          .filter(
            (candidate) =>
              candidate.success && candidate.accepted_by_policy === false && candidate.policy_rejection_reasons.length > 0
          )
          .sort((left, right) => {
            if (right.output_score !== left.output_score) {
              return right.output_score - left.output_score;
            }
            return left.candidate_id.localeCompare(right.candidate_id, "en");
          })
          .map((candidate) => `${candidate.objective}: ${candidate.policy_rejection_reasons.slice(0, 2).join(", ")}`)
          .slice(0, 2)
          .join(" | ");
        const failureSummary = candidateReports
          .filter((candidate) => !candidate.success && typeof candidate.error === "string" && candidate.error.length > 0)
          .map((candidate) => `${candidate.objective}: ${candidate.error}`)
          .slice(0, 2)
          .join(" | ");
        if (rejectionSummary.length > 0 && failureSummary.length > 0) {
          throw new Error(
            `Premium actual candidate judge rejected all outputs: ${rejectionSummary}. Render failures: ${failureSummary}`
          );
        }
        if (rejectionSummary.length > 0) {
          throw new Error(`Premium actual candidate judge rejected all outputs: ${rejectionSummary}`);
        }
        throw new Error(
          failureSummary.length > 0
            ? `Premium actual candidate judge failed: ${failureSummary}`
            : "Premium actual candidate judge produced no policy-accepted output."
        );
      }

      requestPack = {
        ...selectedCandidate.candidate.requestPack,
        metadata: {
          ...(selectedCandidate.candidate.requestPack.metadata ?? {}),
          premium_render_candidate_judge_version: PREMIUM_SIDECAR_ACTUAL_CANDIDATE_JUDGE_VERSION,
          premium_render_candidate_count: candidateReports.length,
          premium_render_selected_candidate_id: selectedCandidate.candidate.candidateId,
          premium_render_selected_candidate_objective: selectedCandidate.candidate.objective,
          premium_render_selected_candidate_score: selectedCandidate.outputScore,
          premium_render_candidate_judge_path: premiumActualJudgePath,
          premium_render_finalization_reason: selectionReason,
          premium_render_candidate_judge_policy_version: runtimeJudgePolicy.policy_version,
          premium_render_policy_accepted: true,
          premium_render_policy_rejection_reasons: [],
          premium_render_retake_round: selectedCandidate.retakeRound,
          premium_render_retake_count: executedRetakeCount
        }
      };
      writeCanonicalSidecarArtifacts();
      return {
        ...selectedCandidate.plan,
        artifacts: mergeSidecarArtifacts(buildBaseArtifacts(), selectedCandidate.plan.artifacts, [
          {
            kind: "json" as const,
            path: selectedCandidate.visualSignalPath,
            label: "shot-sidecar-premium-visual-judge"
          }
        ]),
        metadata: {
          ...(selectedCandidate.plan.metadata ?? {}),
          ...buildBaseMetadata(),
          premiumActualCandidateId: selectedCandidate.candidate.candidateId,
          premiumActualCandidateObjective: selectedCandidate.candidate.objective,
          premiumActualCandidateScore: selectedCandidate.outputScore,
          premiumActualJudgePolicyVersion: selectedCandidate.policyEvaluation.policy.policy_version,
          premiumActualPolicyAccepted: selectedCandidate.policyEvaluation.accepted,
          premiumActualPolicyRejectionReasons: selectedCandidate.policyEvaluation.reasons,
          premiumActualRetakeRound: selectedCandidate.retakeRound,
          premiumActualRetakeCount: executedRetakeCount,
          premiumActualVisualSignalMode: selectedCandidate.visualSignalReport.mode,
          premiumActualVisualSignalScore: selectedCandidate.visualSignalReport.overall_score,
          premiumActualVisualSignalReportPath: selectedCandidate.visualSignalPath,
          premiumActualFaceStabilityScore: selectedCandidate.visualSignalReport.face_stability_score,
          premiumActualMotionCoherenceScore: selectedCandidate.visualSignalReport.motion_coherence_score,
          premiumActualSilhouetteReadabilityScore: selectedCandidate.visualSignalReport.silhouette_readability_score,
          premiumActualMascotIdentityPreservationScore:
            selectedCandidate.visualSignalReport.mascot_identity_preservation_score,
          premiumActualSubtitleSafeScore: selectedCandidate.visualSignalReport.subtitle_safe_score,
          premiumActualChartSafeScore: selectedCandidate.visualSignalReport.chart_safe_score
        }
      };
    };

    if (backendCapability === "wan") {
      try {
        const resolvedPlan =
          (await tryPremiumActualOutputJudge({
            backend: "wan",
            fallbackFrom: null
          })) ??
          (await tryWanRender({
            fallbackFrom: null
          }));
        const step = pushRetake({
          attemptIndex: attempt,
          renderer: rendererName,
          backend: backendCapability,
          actualBackendCapability: "wan",
          outcome: "accepted",
          reason: resolvedPlan.notes,
          selectedForRender: true
        });
        return finalizeSidecarPlan({
          plan: resolvedPlan,
          candidateId: step.candidateId,
          decision: "accepted",
          accepted: true,
          reason: resolvedPlan.notes,
          actualRenderer: "comfyui-wan-i2v",
          actualBackendCapability: "wan"
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retryWithRenderer = stillVideoRenderer
          ? "generated-pack-still-video"
          : placeholderRenderer
            ? "generated-pack-placeholder"
            : null;
        const retryWithBackend = retryWithRenderer ? "still_placeholder" : null;
        const primaryFailure = pushRetake({
          attemptIndex: attempt,
          renderer: rendererName,
          backend: backendCapability,
          actualBackendCapability: "wan",
          outcome: "rejected",
          reason: message,
          retryWithRenderer,
          retryWithBackend,
          selectedForRender: false
        });
        const fallbackPlan = await tryStillFallback(message);
        if (fallbackPlan) {
          const fallbackMetadata = (fallbackPlan.metadata ?? {}) as Record<string, unknown>;
          const fallbackCapability =
            typeof fallbackMetadata.actualBackendCapability === "string"
              ? fallbackMetadata.actualBackendCapability
              : "still_placeholder";
          const fallbackStep = pushRetake({
            attemptIndex: attempt,
            renderer: fallbackPlan.renderer,
            backend: "still_placeholder",
            actualBackendCapability: fallbackCapability,
            outcome: sidecarPlanStatusToRetakeOutcome(fallbackPlan.status),
            reason: fallbackPlan.notes ?? message,
            selectedForRender: fallbackPlan.status === "resolved" || fallbackPlan.status === "planned"
          });
          return finalizeSidecarPlan({
            plan: fallbackPlan,
            candidateId: fallbackStep.candidateId,
            decision: "fallback",
            accepted: fallbackPlan.status === "resolved",
            reason: message,
            actualRenderer: fallbackPlan.renderer,
            actualBackendCapability: fallbackCapability
          });
        }
        const failedPlan: ShotSidecarPlan = {
          shotId: shot.shot_id,
          shotType,
          renderMode,
          status: "failed",
          renderer: rendererName,
          notes: `Wan I2V sidecar failed: ${message}`,
          artifacts: buildBaseArtifacts(),
          metadata: {
            ...buildBaseMetadata(),
            actualBackendCapability: "wan",
            failure: message,
            success: false
          }
        };
        return finalizeSidecarPlan({
          plan: failedPlan,
          candidateId: primaryFailure.candidateId,
          decision: "rejected",
          accepted: false,
          reason: message,
          actualRenderer: rendererName,
          actualBackendCapability: "wan",
          retryWithRenderer,
          retryWithBackend
        });
      }
    }

    if (backendCapability === "hunyuan15_local_i2v" || backendCapability === "hunyuan15_local_i2v_sr") {
      const hunyuanApplicable = renderMode === "generative_i2v" || renderMode === "generative_broll";
      if (hunyuanApplicable) {
        try {
          const resolvedPlan =
            (await tryPremiumActualOutputJudge({
              backend: "hunyuan",
              capability: backendCapability,
              fallbackFrom: null
            })) ??
            (await tryHunyuanRender({
              capability: backendCapability
            }));
          const step = pushRetake({
            attemptIndex: attempt,
            renderer: rendererName,
            backend: backendCapability,
            actualBackendCapability: backendCapability,
            outcome: "accepted",
            reason: resolvedPlan.notes,
            selectedForRender: true
          });
          return finalizeSidecarPlan({
            plan: resolvedPlan,
            candidateId: step.candidateId,
            decision: "accepted",
            accepted: true,
            reason: resolvedPlan.notes,
            actualRenderer: rendererName,
            actualBackendCapability: backendCapability
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const retryWithRenderer =
            backendCapability === "hunyuan15_local_i2v_sr" ? "hunyuan15_local_i2v" : "comfyui-wan-i2v";
          const retryWithBackend =
            backendCapability === "hunyuan15_local_i2v_sr" ? "hunyuan15_local_i2v" : "wan";
          pushRetake({
            attemptIndex: attempt,
            renderer: rendererName,
            backend: backendCapability,
            actualBackendCapability: backendCapability,
            outcome: "rejected",
            reason: message,
            retryWithRenderer,
            retryWithBackend,
            selectedForRender: false
          });
          let fallbackMessage = message;
          if (backendCapability === "hunyuan15_local_i2v_sr") {
            try {
              const baseHunyuanRequestPack = downgradeSidecarRequestPackForBaseHunyuan(requestPack, backendCapability);
              const baseHunyuanPlan = await tryHunyuanRender({
                capability: "hunyuan15_local_i2v",
                requestPackOverride: baseHunyuanRequestPack
              });
              const baseHunyuanStep = pushRetake({
                attemptIndex: attempt,
                renderer: baseHunyuanPlan.renderer,
                backend: "hunyuan15_local_i2v",
                actualBackendCapability: "hunyuan15_local_i2v",
                outcome:
                  baseHunyuanPlan.status === "resolved"
                    ? "accepted"
                    : sidecarPlanStatusToRetakeOutcome(baseHunyuanPlan.status),
                reason: baseHunyuanPlan.notes ?? message,
                selectedForRender: true
              });
              return finalizeSidecarPlan({
                plan: {
                  ...baseHunyuanPlan,
                  notes: `${baseHunyuanPlan.notes ?? ""} SR fallback reason: ${message}`.trim(),
                  metadata: {
                    ...(baseHunyuanPlan.metadata ?? {}),
                    fallbackFrom: backendCapability,
                    fallbackReason: message,
                    srFallbackFailure: message
                  }
                },
                candidateId: baseHunyuanStep.candidateId,
                decision: "fallback",
                accepted: baseHunyuanPlan.status === "resolved",
                reason: message,
                actualRenderer: baseHunyuanPlan.renderer,
                actualBackendCapability: "hunyuan15_local_i2v"
              });
            } catch (baseHunyuanError) {
              const baseHunyuanMessage =
                baseHunyuanError instanceof Error ? baseHunyuanError.message : String(baseHunyuanError);
              fallbackMessage = `${message} | hunyuan base fallback failed: ${baseHunyuanMessage}`;
              pushRetake({
                attemptIndex: attempt,
                renderer: "hunyuan15_local_i2v",
                backend: "hunyuan15_local_i2v",
                actualBackendCapability: "hunyuan15_local_i2v",
                outcome: "rejected",
                reason: baseHunyuanMessage,
                retryWithRenderer: "comfyui-wan-i2v",
                retryWithBackend: "wan",
                selectedForRender: false
              });
            }
          }
          try {
            const wanFallback = await tryWanRender({
              fallbackFrom: backendCapability
            });
            const wanStep = pushRetake({
              attemptIndex: attempt,
              renderer: wanFallback.renderer,
              backend: "wan",
              actualBackendCapability: "wan",
              outcome: wanFallback.status === "resolved" ? "accepted" : sidecarPlanStatusToRetakeOutcome(wanFallback.status),
              reason: wanFallback.notes ?? message,
              selectedForRender: true
            });
            return {
              ...finalizeSidecarPlan({
                plan: {
                  ...wanFallback,
                  notes: `${wanFallback.notes ?? ""} Fallback reason: ${fallbackMessage}`.trim(),
                  metadata: {
                    ...(wanFallback.metadata ?? {}),
                    fallbackReason: fallbackMessage,
                    hunyuanFailure: message,
                    ...(fallbackMessage !== message ? { hunyuanFallbackChainFailure: fallbackMessage } : {})
                  }
                },
                candidateId: wanStep.candidateId,
                decision: "fallback",
                accepted: wanFallback.status === "resolved",
                reason: fallbackMessage,
                actualRenderer: "comfyui-wan-i2v",
                actualBackendCapability: "wan"
              })
            };
          } catch (wanError) {
            const wanMessage = wanError instanceof Error ? wanError.message : String(wanError);
            const retryWithRenderer = stillVideoRenderer
              ? "generated-pack-still-video"
              : placeholderRenderer
                ? "generated-pack-placeholder"
                : null;
            const retryWithBackend = retryWithRenderer ? "still_placeholder" : null;
            const wanFailure = pushRetake({
              attemptIndex: attempt,
              renderer: "comfyui-wan-i2v",
              backend: "wan",
              actualBackendCapability: "wan",
              outcome: "rejected",
              reason: wanMessage,
              retryWithRenderer,
              retryWithBackend,
              selectedForRender: false
            });
            const fallbackPlan = await tryStillFallback(`${fallbackMessage} | wan fallback failed: ${wanMessage}`);
            if (fallbackPlan) {
              const fallbackMetadata = (fallbackPlan.metadata ?? {}) as Record<string, unknown>;
              const fallbackCapability =
                typeof fallbackMetadata.actualBackendCapability === "string"
                  ? fallbackMetadata.actualBackendCapability
                  : "still_placeholder";
              const fallbackStep = pushRetake({
                attemptIndex: attempt,
                renderer: fallbackPlan.renderer,
                backend: "still_placeholder",
                actualBackendCapability: fallbackCapability,
                outcome: sidecarPlanStatusToRetakeOutcome(fallbackPlan.status),
                reason: fallbackPlan.notes ?? wanMessage,
                selectedForRender: fallbackPlan.status === "resolved" || fallbackPlan.status === "planned"
              });
              return finalizeSidecarPlan({
                plan: fallbackPlan,
                candidateId: fallbackStep.candidateId,
                decision: "fallback",
                accepted: fallbackPlan.status === "resolved",
                reason: `${fallbackMessage} | wan fallback failed: ${wanMessage}`,
                actualRenderer: fallbackPlan.renderer,
                actualBackendCapability: fallbackCapability
              });
            }
            const failedPlan: ShotSidecarPlan = {
              shotId: shot.shot_id,
              shotType,
              renderMode,
              status: "failed",
              renderer: rendererName,
              notes: `HunyuanVideo 1.5 sidecar failed: ${message}. Wan fallback also failed: ${wanMessage}`,
              artifacts: buildBaseArtifacts(),
              metadata: {
                ...buildBaseMetadata(),
                actualBackendCapability: backendCapability,
                failure: message,
                fallbackReason: fallbackMessage,
                wanFallbackFailure: wanMessage,
                success: false
              }
            };
            return finalizeSidecarPlan({
              plan: failedPlan,
              candidateId: wanFailure.candidateId,
              decision: "rejected",
              accepted: false,
              reason: `${fallbackMessage} | wan fallback failed: ${wanMessage}`,
              actualRenderer: rendererName,
              actualBackendCapability: backendCapability,
              retryWithRenderer,
              retryWithBackend
            });
          }
        }
      }

      try {
        pushRetake({
          attemptIndex: attempt,
          renderer: rendererName,
          backend: backendCapability,
          actualBackendCapability: backendCapability,
          outcome: "not_applicable",
          reason: "HunyuanVideo 1.5 is currently reserved for I2V/B-roll still-anchored shots.",
          retryWithRenderer: "comfyui-wan-i2v",
          retryWithBackend: "wan",
          selectedForRender: false
        });
        const wanFallback = await tryWanRender({
          fallbackFrom: backendCapability
        });
        const wanStep = pushRetake({
          attemptIndex: attempt,
          renderer: wanFallback.renderer,
          backend: "wan",
          actualBackendCapability: "wan",
          outcome: wanFallback.status === "resolved" ? "accepted" : sidecarPlanStatusToRetakeOutcome(wanFallback.status),
          reason: wanFallback.notes,
          selectedForRender: true
        });
        return finalizeSidecarPlan({
          plan: {
            ...wanFallback,
            notes: `${wanFallback.notes ?? ""} HunyuanVideo 1.5 is currently reserved for I2V/B-roll still-anchored shots; Wan handled this render mode.`.trim()
          },
          candidateId: wanStep.candidateId,
          decision: "fallback",
          accepted: wanFallback.status === "resolved",
          reason: "HunyuanVideo 1.5 is currently reserved for I2V/B-roll still-anchored shots.",
          actualRenderer: "comfyui-wan-i2v",
          actualBackendCapability: "wan"
        });
      } catch (wanError) {
        const wanMessage = wanError instanceof Error ? wanError.message : String(wanError);
        const retryWithRenderer = stillVideoRenderer
          ? "generated-pack-still-video"
          : placeholderRenderer
            ? "generated-pack-placeholder"
            : null;
        const retryWithBackend = retryWithRenderer ? "still_placeholder" : null;
        const wanFailure = pushRetake({
          attemptIndex: attempt,
          renderer: "comfyui-wan-i2v",
          backend: "wan",
          actualBackendCapability: "wan",
          outcome: "rejected",
          reason: wanMessage,
          retryWithRenderer,
          retryWithBackend,
          selectedForRender: false
        });
        const fallbackPlan = await tryStillFallback(wanMessage);
        if (fallbackPlan) {
          const fallbackMetadata = (fallbackPlan.metadata ?? {}) as Record<string, unknown>;
          const fallbackCapability =
            typeof fallbackMetadata.actualBackendCapability === "string"
              ? fallbackMetadata.actualBackendCapability
              : "still_placeholder";
          const fallbackStep = pushRetake({
            attemptIndex: attempt,
            renderer: fallbackPlan.renderer,
            backend: "still_placeholder",
            actualBackendCapability: fallbackCapability,
            outcome: sidecarPlanStatusToRetakeOutcome(fallbackPlan.status),
            reason: fallbackPlan.notes ?? wanMessage,
            selectedForRender: fallbackPlan.status === "resolved" || fallbackPlan.status === "planned"
          });
          return finalizeSidecarPlan({
            plan: fallbackPlan,
            candidateId: fallbackStep.candidateId,
            decision: "fallback",
            accepted: fallbackPlan.status === "resolved",
            reason: wanMessage,
            actualRenderer: fallbackPlan.renderer,
            actualBackendCapability: fallbackCapability
          });
        }
        const failedPlan: ShotSidecarPlan = {
          shotId: shot.shot_id,
          shotType,
          renderMode,
          status: "failed",
          renderer: rendererName,
          notes: `HunyuanVideo 1.5 route was not applicable and Wan fallback failed: ${wanMessage}`,
          artifacts: buildBaseArtifacts(),
          metadata: {
            ...buildBaseMetadata(),
            actualBackendCapability: "wan",
            failure: wanMessage,
            success: false
          }
        };
        return finalizeSidecarPlan({
          plan: failedPlan,
          candidateId: wanFailure.candidateId,
          decision: "rejected",
          accepted: false,
          reason: wanMessage,
          actualRenderer: rendererName,
          actualBackendCapability: "wan",
          retryWithRenderer,
          retryWithBackend
        });
      }
    }

    const plannedPlan: ShotSidecarPlan = {
      shotId: shot.shot_id,
      shotType,
      renderMode,
      status: "planned",
      renderer: rendererName,
      notes,
      artifacts: buildBaseArtifacts(),
      metadata: {
        ...buildBaseMetadata(),
        actualBackendCapability: null,
        success: false
      }
    };
    const plannedStep = pushRetake({
      attemptIndex: attempt,
      renderer: rendererName,
      backend: backendCapability,
      actualBackendCapability: null,
      outcome: "planned",
      reason: notes,
      selectedForRender: true
    });
    return finalizeSidecarPlan({
      plan: plannedPlan,
      candidateId: plannedStep.candidateId,
      decision: "planned",
      accepted: false,
      reason: notes,
      actualRenderer: rendererName,
      actualBackendCapability: null
    });
  };
}

function normalizeRender(stage: RenderStage, payload: EpisodeJobPayload): RenderJobPayload {
  const d = renderDefaults(stage, payload.episodeId);
  const r = payload.render ?? {};
  if (stage === RENDER_PREVIEW_JOB_NAME) return { ...r, shotsPath: r.shotsPath ?? d.shotsPath, outputPath: r.outputPath ?? d.outputPath, srtPath: r.srtPath ?? d.srtPath, qcReportPath: r.qcReportPath ?? d.qcReportPath, renderLogPath: r.renderLogPath ?? d.renderLogPath, preset: { videoBitrate: "6M", x264Preset: "veryfast", ...(r.preset ?? {}) } };
  if (stage === RENDER_FINAL_JOB_NAME) return { ...r, shotsPath: r.shotsPath ?? d.shotsPath, outputPath: r.outputPath ?? d.outputPath, srtPath: r.srtPath ?? d.srtPath, qcReportPath: r.qcReportPath ?? d.qcReportPath, renderLogPath: r.renderLogPath ?? d.renderLogPath, preset: { ...(r.preset ?? {}), videoBitrate: "12M", x264Preset: "slow", ...(payload.pipeline?.finalPreset ?? {}) } };
  return { ...r, shotsPath: r.shotsPath ?? d.shotsPath, outputPath: r.outputPath ?? d.outputPath, srtPath: r.srtPath ?? d.srtPath, qcReportPath: r.qcReportPath ?? d.qcReportPath, renderLogPath: r.renderLogPath ?? d.renderLogPath };
}

async function persistQc(episodeId: string, jobDbId: string, qcReportPath: string) {
  if (!fs.existsSync(qcReportPath)) return;
  const report = JSON.parse(fs.readFileSync(qcReportPath, "utf8")) as StoredQcReport;
  const runs = Array.isArray(report.runs) ? report.runs : [];
  const issues = Array.isArray(runs[runs.length - 1]?.issues) ? runs[runs.length - 1]!.issues! : [];
  const finalPassed = Boolean(report.final_passed);

  await prisma.qCResult.create({
    data: {
      episodeId,
      check: "SCHEMA",
      severity: finalPassed ? "INFO" : "ERROR",
      passed: finalPassed,
      details: toPrismaJson({
        qcReportPath,
        finalStage: report.final_stage ?? null,
        generatedAt: report.generated_at ?? null,
        fallbackStepsApplied: report.fallback_steps_applied ?? [],
        finalRunIssues: issues
      })
    }
  });

  for (const issue of issues) {
    const sev = asString(issue.severity, "INFO").toUpperCase();
    if (sev === "INFO") continue;
    await prisma.qCResult.create({
      data: {
        episodeId,
        check: "SCHEMA",
        severity: sev === "ERROR" ? "ERROR" : "WARN",
        passed: false,
        details: toPrismaJson({
          code: issue.code ?? "unknown",
          message: issue.message ?? "unknown",
          shotId: issue.shotId ?? null,
          details: issue.details ?? null,
          qcReportPath
        })
      }
    });
  }

  await logJob(jobDbId, "info", "QC report stored in DB", { qcReportPath, finalPassed, issueCount: issues.length });
}

async function addToQueue(name: string, payload: EpisodeJobPayload, maxAttempts: number, retryBackoffMs: number) {
  const hasFailedShotIds =
    Array.isArray(payload.render?.failedShotIds) &&
    payload.render.failedShotIds.some((shotId) => typeof shotId === "string" && shotId.trim().length > 0);
  const retryPriority = payload.render?.rerenderFailedShotsOnly === true || hasFailedShotIds ? 1 : undefined;
  const options: JobsOptions = {
    jobId: payload.jobDbId,
    attempts: maxAttempts,
    backoff: { type: "exponential", delay: retryBackoffMs },
    ...workerQueueRetentionOptions(),
    ...(retryPriority !== undefined ? { priority: retryPriority } : {})
  };
  try {
    return await queue.add(name, payload, options);
  } catch {
    const existing = await queue.getJob(payload.jobDbId);
    if (existing) return existing;
    throw new Error(`failed to enqueue job ${payload.jobDbId}`);
  }
}

const downstreamEnqueueLocks = new Map<string, Promise<void>>();

async function withDownstreamEnqueueLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = downstreamEnqueueLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => next);
  downstreamEnqueueLocks.set(key, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (downstreamEnqueueLocks.get(key) === chain) {
      downstreamEnqueueLocks.delete(key);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRedisDownstreamLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const enabled = parseBoolean(process.env.WORKER_DISTRIBUTED_STAGE_LOCK_ENABLED, true);
  if (!enabled) {
    return fn();
  }

  const acquireTimeoutMs = parsePositiveInt(process.env.WORKER_DISTRIBUTED_STAGE_LOCK_ACQUIRE_TIMEOUT_MS, 5000);
  const retryDelayMs = parsePositiveInt(process.env.WORKER_DISTRIBUTED_STAGE_LOCK_RETRY_DELAY_MS, 100);
  const lockTtlMs = parsePositiveInt(process.env.WORKER_DISTRIBUTED_STAGE_LOCK_TTL_MS, 120000);
  const redisKey = `worker:stage-lock:${key}`;
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  const client = await queue.client.catch(() => null);
  if (!client) {
    return fn();
  }

  const startedAt = Date.now();
  let acquired = false;
  while (Date.now() - startedAt < acquireTimeoutMs) {
    const ok = await (client as any).set(redisKey, token, "PX", lockTtlMs, "NX");
    if (ok === "OK") {
      acquired = true;
      break;
    }
    await sleep(retryDelayMs);
  }

  if (!acquired) {
    throw new Error(`downstream enqueue lock timeout: ${key}`);
  }

  try {
    return await fn();
  } finally {
    const releaseScript =
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
    await (client as any).eval(releaseScript, 1, redisKey, token).catch(() => undefined);
  }
}

async function enqueueNext(input: { parentJobDbId: string; episodeId: string; type: PipelineJobName; templatePayload: EpisodeJobPayload; render?: RenderJobPayload; maxAttempts: number; retryBackoffMs: number }) {
  const lockKey = `${input.episodeId}:${input.type}`;
  return withRedisDownstreamLock(lockKey, async () =>
    withDownstreamEnqueueLock(lockKey, async () => {
    const active = await prisma.job.findFirst({
      where: { episodeId: input.episodeId, type: input.type, status: { in: ["QUEUED", "RUNNING"] satisfies ActiveJobStatus[] } },
      orderBy: { createdAt: "desc" }
    });
    if (active) {
      await logJob(input.parentJobDbId, "info", "Reusing active downstream job", { nextType: input.type, nextJobDbId: active.id });
      return active;
    }

    const nextJob = await prisma.job.create({
      data: { episodeId: input.episodeId, type: input.type, status: "QUEUED", progress: 0, maxAttempts: input.maxAttempts > 0 ? input.maxAttempts : MAX_JOB_ATTEMPTS, retryBackoffMs: input.retryBackoffMs > 0 ? input.retryBackoffMs : 1000 }
    });
    await logJob(nextJob.id, "info", "Transition -> QUEUED", { source: "worker:pipeline", parentJobDbId: input.parentJobDbId, type: input.type });

    const payload: EpisodeJobPayload = { jobDbId: nextJob.id, episodeId: input.episodeId, schemaChecks: [], ...(input.templatePayload.pipeline ? { pipeline: input.templatePayload.pipeline } : {}), ...(input.render ? { render: input.render } : {}) };
    const bull = await addToQueue(input.type, payload, nextJob.maxAttempts, nextJob.retryBackoffMs);
    await prisma.job.update({ where: { id: nextJob.id }, data: { bullmqJobId: String(bull.id), status: "QUEUED", lastError: null } });
    await logJob(nextJob.id, "info", "Transition -> ENQUEUED", { source: "worker:pipeline", bullmqJobId: String(bull.id), type: input.type });
    await logJob(input.parentJobDbId, "info", "Pipeline next job enqueued", { nextType: input.type, nextJobDbId: nextJob.id, bullmqJobId: String(bull.id) });
    return nextJob;
  }));
}

function parseBeatDoc(json: Prisma.JsonValue, fallbackEpisode: EpisodeInput): { episode: EpisodeInput; beats: Beat[] } {
  if (!isRecord(json)) throw new Error("BeatDoc json must be object");
  const e = isRecord(json.episode) ? json.episode : {};
  const parsedCharacterPackId =
    typeof e.character_pack_id === "string" && e.character_pack_id.trim().length > 0
      ? e.character_pack_id.trim()
      : fallbackEpisode.character_pack_id;
  const episode: EpisodeInput = {
    episode_id: asString(e.episode_id, fallbackEpisode.episode_id),
    bible_ref: asString(e.bible_ref, fallbackEpisode.bible_ref),
    topic: asString(e.topic, fallbackEpisode.topic),
    target_duration_sec:
      typeof e.target_duration_sec === "number" && e.target_duration_sec > 0
        ? Math.round(e.target_duration_sec)
        : fallbackEpisode.target_duration_sec,
    ...(coerceProfileSelection(e.profiles) || fallbackEpisode.profiles
      ? {
          profiles: resolveProfiles({
            ...(fallbackEpisode.profiles ?? {}),
            ...(coerceProfileSelection(e.profiles) ?? {})
          }).selection
        }
      : {}),
    ...(parsedCharacterPackId ? { character_pack_id: parsedCharacterPackId } : {})
  };
  const rows = Array.isArray(json.beats) ? json.beats : [];
  const beats: Beat[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = asString(row.beat_id).trim();
    if (!id) continue;
    const tags = sanitizeStringArray(row.tags);
    const tag = tags.find((x) => x.startsWith("emphasis:"));
    const eraw = tag ? tag.slice("emphasis:".length) : "medium";
    const emphasis: "low" | "medium" | "high" = eraw === "high" ? "high" : eraw === "low" ? "low" : "medium";
    beats.push({ id, type: asString(row.kind, "narrative"), intent: asString(row.intent, "Narrative progression"), narration: asString(row.narration, ""), onScreen: sanitizeStringArray(row.on_screen_text), emphasis });
  }
  if (beats.length === 0) throw new Error("BeatDoc has no beats");
  return { episode, beats };
}

function resolveStoryProfileSelection(payload: EpisodeJobPayload, fallback?: Partial<ProfileSelection>): ProfileSelection {
  return resolveProfiles({
    ...(fallback ?? {}),
    studio_profile_id:
      typeof payload.pipeline?.story?.studioProfileId === "string"
        ? (payload.pipeline.story.studioProfileId.trim() as ProfileSelection["studio_profile_id"])
        : fallback?.studio_profile_id,
    channel_profile_id:
      typeof payload.pipeline?.story?.channelProfileId === "string"
        ? (payload.pipeline.story.channelProfileId.trim() as ProfileSelection["channel_profile_id"])
        : fallback?.channel_profile_id,
    mascot_profile_id:
      typeof payload.pipeline?.story?.mascotProfileId === "string"
        ? (payload.pipeline.story.mascotProfileId.trim() as ProfileSelection["mascot_profile_id"])
        : fallback?.mascot_profile_id
  }).selection;
}

function resolveChannelDomainFromShotsPath(shotsPath: string): "economy" | "medical" | null {
  if (!fs.existsSync(shotsPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(shotsPath, "utf8")) as Record<string, unknown>;
    const episode = isRecord(parsed.episode) ? parsed.episode : null;
    const selection = coerceProfileSelection(episode?.profiles);
    if (!selection) {
      return null;
    }
    return resolveProfiles(selection).channel.domain;
  } catch {
    return null;
  }
}

function buildStoryInput(episode: { id: string; topic: string; targetDurationSec: number; bibleId: string | null }, payload: EpisodeJobPayload): StoryInput {
  const outline = sanitizeStringArray(payload.pipeline?.story?.outline);
  const paragraphs = sanitizeStringArray(payload.pipeline?.story?.paragraphs);
  const targetBeatCount = typeof payload.pipeline?.story?.targetBeatCount === "number" && payload.pipeline.story.targetBeatCount > 0 ? Math.round(payload.pipeline.story.targetBeatCount) : undefined;
  const profiles = resolveStoryProfileSelection(payload);
  return {
    episode: {
      episode_id: episode.id,
      bible_ref: asString(payload.pipeline?.story?.bibleRef, "").trim() || episode.bibleId || "channel_bible:default",
      topic: episode.topic,
      target_duration_sec: episode.targetDurationSec,
      profiles
    },
    ...(outline.length > 0 ? { outline } : {}),
    ...(paragraphs.length > 0 ? { paragraphs } : {}),
    ...(targetBeatCount !== undefined ? { target_beat_count: targetBeatCount } : {})
  };
}

function parseCompileSpeed(value: unknown): "slow" | "medium" | "fast" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "slow" || normalized === "medium" || normalized === "fast") {
    return normalized;
  }
  return undefined;
}

function parseCompileAbVariant(value: unknown): "A" | "B" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "A" || normalized === "B") {
    return normalized;
  }
  return undefined;
}

function parseHookBoostValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, value));
}

function firstDefinedString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return undefined;
}

function firstDefinedSpeed(...values: unknown[]): "slow" | "medium" | "fast" | undefined {
  for (const value of values) {
    const parsed = parseCompileSpeed(value);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}

function firstDefinedAbVariant(...values: unknown[]): "A" | "B" | undefined {
  for (const value of values) {
    const parsed = parseCompileAbVariant(value);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}

function firstDefinedKpiFocus(...values: unknown[]): string[] | undefined {
  for (const value of values) {
    const parsed = sanitizeStringArray(value);
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return undefined;
}

function firstDefinedHookBoost(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = parseHookBoostValue(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function resolveCompileStyleOptions(payload: EpisodeJobPayload, episodeSnapshot: unknown, episodeTopic: string): {
  stylePresetId?: string;
  styleSeed?: string;
  hookBoost?: number;
  episodeTopic?: string;
  episodeTitle?: string;
  tone?: string;
  speed?: "slow" | "medium" | "fast";
  kpiFocus?: string[];
  abVariant?: "A" | "B";
  channelBible?: unknown;
} {
  const story = isRecord(payload.pipeline?.story) ? payload.pipeline.story : {};
  const snapshot = isRecord(episodeSnapshot) ? episodeSnapshot : {};
  const snapshotStyle = isRecord(snapshot.style) ? snapshot.style : {};
  const snapshotSelector = isRecord(snapshot.style_selector) ? snapshot.style_selector : {};
  const snapshotEpisode = isRecord(snapshot.episode) ? snapshot.episode : {};

  return {
    stylePresetId: firstDefinedString(story.stylePresetId, snapshotStyle.stylePresetId, snapshotSelector.stylePresetId),
    styleSeed: firstDefinedString(story.styleSeed, snapshotSelector.styleSeed, snapshotStyle.styleSeed, snapshot.style_seed),
    hookBoost: firstDefinedHookBoost(story.hookBoost, snapshotStyle.hookBoost, snapshotSelector.hookBoost),
    episodeTopic: firstDefinedString(story.episodeTopic, snapshotEpisode.topic, snapshot.topic, episodeTopic),
    episodeTitle: firstDefinedString(story.episodeTitle, snapshotEpisode.title, snapshot.title),
    tone: firstDefinedString(story.tone, snapshotSelector.tone, snapshotStyle.tone),
    speed: firstDefinedSpeed(story.speed, snapshotSelector.speed, snapshotStyle.speed),
    kpiFocus: firstDefinedKpiFocus(story.kpiFocus, snapshotSelector.kpiFocus, snapshotStyle.kpiFocus),
    abVariant: firstDefinedAbVariant(story.abVariant, snapshotSelector.abVariant, snapshotStyle.abVariant),
    channelBible: snapshot.channelBible ?? snapshot.channel_bible
  };
}

async function handleGenerate(payload: EpisodeJobPayload, jobDbId: string, current: CurrentJobState) {
  await setEpisodeStatus(payload.episodeId, "GENERATING");
  const episode = await prisma.episode.findUnique({ where: { id: payload.episodeId }, select: { id: true, topic: true, targetDurationSec: true, bibleId: true } });
  if (!episode) throw new Error(`Episode not found: ${payload.episodeId}`);
  const input = buildStoryInput(episode, payload);
  const beats = generateBeats(input);
  const beatsDoc = toBeatsDocument(input, beats);
  const vr = schemaValidator.validate("beats.schema.json", beatsDoc);
  if (!vr.ok) throw new Error("Schema validation failed: beats.schema.json");
  const out = ensureOut(payload.episodeId);
  writeJson(out.beatsPath, beatsDoc);
  const beatsDocJson = toPrismaJsonValue(beatsDoc);
  if (beatsDocJson === null) throw new Error("beats doc serialization failed");
  const hash = sha256Hex(stableStringify(beatsDocJson));
  await prisma.beatDoc.upsert({ where: { episodeId: payload.episodeId }, update: { schemaId: "beats.schema.json", json: beatsDocJson, hash }, create: { episodeId: payload.episodeId, schemaId: "beats.schema.json", json: beatsDocJson, hash } });
  await logJob(jobDbId, "info", "Beats generated", { beatsPath: out.beatsPath, beatsCount: beatsDoc.beats.length, hash });
  await enqueueNext({ parentJobDbId: jobDbId, episodeId: payload.episodeId, type: COMPILE_SHOTS_JOB_NAME, templatePayload: payload, maxAttempts: current.maxAttempts, retryBackoffMs: current.retryBackoffMs });
}

async function handleCompile(payload: EpisodeJobPayload, jobDbId: string, current: CurrentJobState) {
  const episode = await prisma.episode.findUnique({
    where: { id: payload.episodeId },
    select: {
      id: true,
      topic: true,
      targetDurationSec: true,
      bibleId: true,
      datasetVersionSnapshot: true,
      characterPackId: true
    }
  });
  if (!episode) throw new Error(`Episode not found: ${payload.episodeId}`);
  const beatDoc = await prisma.beatDoc.findUnique({ where: { episodeId: payload.episodeId }, select: { json: true } });
  if (!beatDoc) throw new Error(`BeatDoc not found: ${payload.episodeId}`);
  const fallbackEpisode: EpisodeInput = {
    episode_id: payload.episodeId,
    bible_ref: episode.bibleId ?? "channel_bible:default",
    topic: episode.topic,
    target_duration_sec: episode.targetDurationSec,
    profiles: resolveStoryProfileSelection(payload),
    ...(episode.characterPackId ? { character_pack_id: episode.characterPackId } : {})
  };
  const parsed = parseBeatDoc(beatDoc.json, fallbackEpisode);
  const resolvedProfiles = resolveProfiles(parsed.episode.profiles ?? fallbackEpisode.profiles);
  const shots = compileShots(parsed.beats, {
    characterPackId: parsed.episode.character_pack_id,
    profiles: resolvedProfiles
  });
  const shotsDoc = toShotsDocument({ ...parsed.episode, episode_id: payload.episodeId }, shots, 30);
  const vr = schemaValidator.validate("shots.schema.json", shotsDoc);
  if (!vr.ok) throw new Error("Schema validation failed: shots.schema.json");
  const out = ensureOut(payload.episodeId);
  writeJson(out.shotsPath, shotsDoc);
  const reportResult = generateShotRenderModeReport({ shotsPath: out.shotsPath });
  if (reportResult.ok) {
    await logJob(jobDbId, "info", "Shot render mode report generated", {
      shotsPath: out.shotsPath,
      shotRenderModeReportPath: reportResult.reportPath
    });
  } else {
    await logJob(jobDbId, "warn", "Shot render mode report failed", {
      shotsPath: out.shotsPath,
      shotRenderModeReportPath: reportResult.reportPath,
      error: reportResult.error ?? null,
      stdout: reportResult.stdout ?? null,
      stderr: reportResult.stderr ?? null
    });
  }
  const shotsDocJson = toPrismaJsonValue(shotsDoc);
  if (shotsDocJson === null) throw new Error("shots doc serialization failed");
  const hash = sha256Hex(stableStringify(shotsDocJson));
  await prisma.shotDoc.upsert({ where: { episodeId: payload.episodeId }, update: { schemaId: "shots.schema.json", json: shotsDocJson, hash }, create: { episodeId: payload.episodeId, schemaId: "shots.schema.json", json: shotsDocJson, hash } });
  await logJob(jobDbId, "info", "Shots compiled", {
    shotsPath: out.shotsPath,
    shotsCount: shotsDoc.shots.length,
    hash,
    shotRenderModeReportPath: reportResult.reportPath
  });
  await enqueueNext({ parentJobDbId: jobDbId, episodeId: payload.episodeId, type: RENDER_PREVIEW_JOB_NAME, templatePayload: payload, render: { ...(payload.render ?? {}), shotsPath: out.shotsPath, outputPath: out.previewOutputPath, srtPath: out.previewSrtPath, qcReportPath: out.qcReportPath, renderLogPath: out.previewRenderLogPath }, maxAttempts: current.maxAttempts, retryBackoffMs: current.retryBackoffMs });
}

async function handleRender(stage: RenderStage, payload: EpisodeJobPayload, jobDbId: string, attempt: number, current: CurrentJobState) {
  const render = normalizeRender(stage, payload);
  const explicitFailedShotIds = uniqueStrings(sanitizeStringArray(render.failedShotIds));
  const shouldUseQcRecovery = render.rerenderFailedShotsOnly !== false && attempt > 1;

  const defaultPaths = renderDefaults(stage, payload.episodeId);
  const baseShotsPath = path.resolve(render.shotsPath ?? defaultPaths.shotsPath);
  const qcReportPath = path.resolve(render.qcReportPath ?? defaultPaths.qcReportPath);
  let narrationAlignmentPath = render.narrationAlignmentPath;
  const episodeForRender = await prisma.episode.findUnique({
    where: { id: payload.episodeId },
    select: {
      characterPackId: true,
      characterPack: {
        select: {
          json: true
        }
      }
    }
  });

  let failedShotIds: string[] = [];
  let recoverySource: "explicit" | "qc_report" | "none" = "none";

  if (explicitFailedShotIds.length > 0) {
    failedShotIds = explicitFailedShotIds;
    recoverySource = "explicit";
  } else if (shouldUseQcRecovery) {
    failedShotIds = readFailedShotIdsFromQcReport(qcReportPath);
    if (failedShotIds.length > 0) {
      recoverySource = "qc_report";
    }
  }

  let partialShotsPath: string | null = null;
  let shotsPathForAttempt = baseShotsPath;

  if (failedShotIds.length > 0) {
    partialShotsPath = createPartialShotsPath(baseShotsPath, failedShotIds, attempt);
    if (partialShotsPath) {
      shotsPathForAttempt = partialShotsPath;
    }
  }

  const recoveryMode = shotsPathForAttempt !== baseShotsPath;

  if (stage === RENDER_PREVIEW_JOB_NAME) {
    await runPreviewAudioArtifacts(payload.episodeId, jobDbId, baseShotsPath);
    const previewOut = ensureOut(payload.episodeId);
    const candidate = path.join(previewOut.outDir, "narration_alignment.json");
    if (fs.existsSync(candidate)) {
      narrationAlignmentPath = candidate;
    }
  } else if (!narrationAlignmentPath) {
    const out = ensureOut(payload.episodeId);
    const candidate = path.join(out.outDir, "narration_alignment.json");
    if (fs.existsSync(candidate)) {
      narrationAlignmentPath = candidate;
    }
  }

  await logJob(jobDbId, "info", "Render pipeline started", {
    stage,
    attempt,
    recoveryMode,
    recoverySource,
    failedShotIds,
    baseShotsPath,
    partialShotsPath,
    characterPackId: episodeForRender?.characterPackId ?? null,
    videoBrollReferenceImagePath: resolveCharacterPackFrontReferencePath({
      characterPackId: episodeForRender?.characterPackId ?? null,
      characterPack: episodeForRender?.characterPack?.json ?? null
    }),
    narrationAlignmentPath: narrationAlignmentPath ?? null
  });

  const videoBrollReferenceContext = resolveCharacterPackReferenceImagePaths({
    characterPackId: episodeForRender?.characterPackId ?? null,
    characterPack: episodeForRender?.characterPack?.json ?? null
  });
  const videoBrollReferenceImagePath = videoBrollReferenceContext.referenceImagePathByView.front ?? null;
  const channelDomain = resolveChannelDomainFromShotsPath(shotsPathForAttempt) ?? resolveChannelDomainFromShotsPath(baseShotsPath);

  const result = await orchestrateRenderEpisode({
    shotsPath: shotsPathForAttempt,
    outputPath: render.outputPath,
    srtPath: render.srtPath,
    qcReportPath: render.qcReportPath,
    renderLogPath: render.renderLogPath,
    sidecarPlanPath: path.join(path.dirname(render.outputPath ?? baseShotsPath), "shot_sidecar_plan.json"),
    compositionId: render.compositionId,
    dryRun: render.dryRun ?? false,
    qc: render.qc,
    preset: render.preset,
    shotSidecarRenderer: createShotSidecarRenderer({
      referenceImagePath: videoBrollReferenceImagePath,
      referenceImagePathByView: videoBrollReferenceContext.referenceImagePathByView,
      referenceSourceByView: videoBrollReferenceContext.referenceSourceByView,
      referenceScoreByView: videoBrollReferenceContext.referenceScoreByView,
      speciesId: videoBrollReferenceContext.speciesId,
      generationManifestPath: videoBrollReferenceContext.manifestPath,
      generationWarnings: videoBrollReferenceContext.generationWarnings,
      characterPackId: episodeForRender?.characterPackId ?? null,
      channelDomain
    }),
    ...(narrationAlignmentPath ? { narrationAlignmentPath } : {}),
    attempt,
    maxAttempts: current.maxAttempts,
    ...(episodeForRender?.characterPackId ? { characterPackId: episodeForRender.characterPackId } : {}),
    ...(episodeForRender?.characterPack?.json ? { characterPack: episodeForRender.characterPack.json } : {})
  });
  const shotRenderModeReportPath = path.join(
    path.dirname(render.outputPath ?? baseShotsPath),
    "shot_render_mode_report.json"
  );
  const shotRenderModeReportResult = generateShotRenderModeReport({
    shotsPath: shotsPathForAttempt,
    outPath: shotRenderModeReportPath
  });
  if (shotRenderModeReportResult.ok) {
    attachShotRenderModeReportPathToRenderLog(result.renderLogPath, shotRenderModeReportResult.reportPath);
  }
  if (shotRenderModeReportResult.ok) {
    await logJob(jobDbId, "info", "Render shot mode report generated", {
      stage,
      shotsPath: shotsPathForAttempt,
      shotRenderModeReportPath: shotRenderModeReportResult.reportPath
    });
  } else {
    await logJob(jobDbId, "warn", "Render shot mode report failed", {
      stage,
      shotsPath: shotsPathForAttempt,
      shotRenderModeReportPath: shotRenderModeReportResult.reportPath,
      error: shotRenderModeReportResult.error ?? null,
      stdout: shotRenderModeReportResult.stdout ?? null,
      stderr: shotRenderModeReportResult.stderr ?? null
    });
  }
  await persistQc(payload.episodeId, jobDbId, result.qcReportPath);
  const retrySummary = buildRetrySummaryReport({
    episodeId: payload.episodeId,
    stage,
    attempt,
    recoveryMode,
    recoverySource,
    requestedFailedShotIds: failedShotIds,
    partialShotsPath,
    qcReportPath: result.qcReportPath
  });
  const retrySummaryPath = retrySummaryReportPath(payload.episodeId, stage);
  writeJson(retrySummaryPath, retrySummary);
  await logJob(jobDbId, "info", "Render retry summary aggregated", {
    stage,
    attempt,
    retrySummaryPath,
    failedShotSummary: retrySummary.failed_shot_summary
  });
  await logJob(jobDbId, "info", "Render completed", {
    stage,
    outputPath: result.outputPath,
    srtPath: result.srtPath,
    qcReportPath: result.qcReportPath,
    renderLogPath: result.renderLogPath,
    sidecarPlanPath: result.sidecarPlanPath,
    sidecarPlanCount: result.sidecarPlanCount,
    recoveryMode,
    partialShotsPath,
    failedShotIds,
    retrySummaryPath,
    shotRenderModeReportPath: shotRenderModeReportResult.reportPath,
    characterPackId: episodeForRender?.characterPackId ?? null,
    videoBrollReferenceImagePath,
    videoBrollReferenceImagePathByView: videoBrollReferenceContext.referenceImagePathByView,
    videoBrollReferenceSourceByView: videoBrollReferenceContext.referenceSourceByView,
    videoBrollSpeciesId: videoBrollReferenceContext.speciesId,
    videoBrollGenerationManifestPath: videoBrollReferenceContext.manifestPath,
    narrationAlignmentPath: narrationAlignmentPath ?? null
  });

  if (stage === RENDER_PREVIEW_JOB_NAME) {
    await setEpisodeStatus(payload.episodeId, "PREVIEW_READY");
    if (shouldAutoRenderFinal(payload)) {
      const out = ensureOut(payload.episodeId);
      await enqueueNext({ parentJobDbId: jobDbId, episodeId: payload.episodeId, type: RENDER_FINAL_JOB_NAME, templatePayload: payload, render: { ...(payload.render ?? {}), shotsPath: out.shotsPath, outputPath: out.finalOutputPath, srtPath: out.finalSrtPath, qcReportPath: out.qcReportPath, renderLogPath: out.finalRenderLogPath, preset: { ...(payload.render?.preset ?? {}), videoBitrate: "12M", x264Preset: "slow", ...(payload.pipeline?.finalPreset ?? {}) } }, maxAttempts: current.maxAttempts, retryBackoffMs: current.retryBackoffMs });
    } else {
      await logJob(jobDbId, "info", "Auto final render disabled", { autoRenderFinal: false });
    }
  }

  if (stage === RENDER_FINAL_JOB_NAME) {
    await setEpisodeStatus(payload.episodeId, "COMPLETED");
    await enqueueNext({ parentJobDbId: jobDbId, episodeId: payload.episodeId, type: PACKAGE_OUTPUTS_JOB_NAME, templatePayload: payload, maxAttempts: current.maxAttempts, retryBackoffMs: current.retryBackoffMs });
  }
}

async function runPreviewAudioArtifacts(episodeId: string, jobDbId: string, shotsPath: string) {
  const out = ensureOut(episodeId);
  if (!fs.existsSync(out.beatsPath)) {
    throw new Error(`Missing beats for audio pipeline: ${out.beatsPath}`);
  }
  if (!fs.existsSync(shotsPath)) {
    throw new Error(`Missing shots for audio pipeline: ${shotsPath}`);
  }

  const cues = buildAudioCues(out.beatsPath, shotsPath);
  const pronunciationDictionaryPath = resolveAudioPronunciationDictionaryPath(out.outDir);
  let ttsFallbackReason: string | undefined;
  const tts = resolvePreviewTtsProvider(out.outDir, (reason) => {
    ttsFallbackReason = reason;
  });
  if (tts.warning) {
    await logJob(jobDbId, "warn", "Preview TTS provider warning", {
      warning: tts.warning
    });
  }

  const result = await runAudioPipeline(
    {
      ttsProvider: tts.provider,
      musicLibrary: new LocalMockMusicLibrary(path.join(out.outDir, "assets"))
    },
    {
      scriptText: cues.scriptText,
      voice: process.env.AUDIO_VOICE ?? "mock-voice-preview",
      speed: parseNumber(Number(process.env.AUDIO_SPEED ?? "1"), 1),
      beats: cues.beats,
      shots: cues.shots,
      pronunciationDictionaryPath,
      outDir: out.outDir
    }
  );

  await logJob(jobDbId, "info", "Preview audio artifacts generated", {
    mixPath: result.mixPath,
    licenseLogPath: result.licenseLogPath,
    narrationPath: result.narrationPath,
    alignmentPath: result.alignmentPath,
    sfxEvents: result.placementPlan.sfxEvents.length,
    ttsProvider: tts.providerName,
    ttsFallback: ttsFallbackReason ? tts.fallbackName ?? null : null,
    ttsFallbackReason: ttsFallbackReason ?? null
  });

  return result;
}

async function handlePackage(payload: EpisodeJobPayload, jobDbId: string) {
  const out = ensureOut(payload.episodeId);
  const episode = await prisma.episode.findUnique({ where: { id: payload.episodeId }, select: { topic: true, scheduledFor: true } });
  if (!episode) throw new Error(`Episode not found: ${payload.episodeId}`);
  const renderOutputPath = fs.existsSync(out.finalOutputPath) ? out.finalOutputPath : fs.existsSync(out.previewOutputPath) ? out.previewOutputPath : undefined;
  const publish = await createPublishManifest({ episodeId: payload.episodeId, topic: episode.topic, plannedPublishAt: episode.scheduledFor ?? new Date(Date.now() + 60 * 60 * 1000), outputRootDir: path.join(REPO_ROOT, "out"), ...(renderOutputPath ? { renderOutputPath } : {}) });
  await logJob(jobDbId, "info", "Publish manifest created", { manifestPath: publish.manifestPath, status: publish.manifest.status });
}

async function buildCharacterPackJson(payload: EpisodeJobPayload, jobDbId: string): Promise<CharacterPackJson> {
  const character = requireCharacterPayload(payload);
  const out = ensureCharacterOut(character.characterPackId);

  const requestedAssetIds = [character.assetIds.front, character.assetIds.threeQuarter, character.assetIds.profile];
  const assets = await prisma.asset.findMany({
    where: {
      id: {
        in: requestedAssetIds
      }
    },
    select: {
      id: true,
      channelId: true,
      status: true,
      normalizedKey1024: true,
      normalizedKey2048: true,
      originalKey: true,
      storageKey: true
    }
  });

  if (assets.length !== requestedAssetIds.length) {
    throw new Error("One or more character view assets are missing");
  }

  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const assetId of requestedAssetIds) {
    const asset = assetById.get(assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }
    if (asset.status !== "READY") {
      throw new Error(`Asset is not READY: ${assetId}`);
    }
  }

  const frontAsset = assetById.get(character.assetIds.front)!;
  const threeQuarterAsset = assetById.get(character.assetIds.threeQuarter)!;
  const profileAsset = assetById.get(character.assetIds.profile)!;

  const frontBuffer = await getAssetObject(resolveAssetStorageKey(frontAsset));
  const threeQuarterBuffer = await getAssetObject(resolveAssetStorageKey(threeQuarterAsset));
  const profileBuffer = await getAssetObject(resolveAssetStorageKey(profileAsset));

  const frontImageHref = await normalizeCharacterViewImage(frontBuffer, path.join(out.outDir, "assets", "front.png"));
  const threeQuarterImageHref = await normalizeCharacterViewImage(threeQuarterBuffer, path.join(out.outDir, "assets", "three-quarter.png"));
  const profileImageHref = await normalizeCharacterViewImage(profileBuffer, path.join(out.outDir, "assets", "profile.png"));

  const pack: CharacterPackJson = {
    schema_version: "1.0",
    pack_id: `character_pack_${character.characterPackId}`,
    meta: {
      name: `Character Pack ${character.version}`,
      created_at: new Date().toISOString(),
      source_image_ref: `${character.assetIds.front},${character.assetIds.threeQuarter},${character.assetIds.profile}`,
      notes: "Generated from uploaded multi-view character assets"
    },
    canvas: {
      base_width: 1024,
      base_height: 1024,
      coord_space: "pixels"
    },
    assets: {
      images: {
        body_front: frontImageHref,
        body_3q: threeQuarterImageHref,
        body_profile: profileImageHref,
        upper_arm: "shape://upper_arm",
        lower_arm: "shape://lower_arm",
        paw: "shape://paw",
        upper_arm_profile: "shape://upper_arm_profile",
        lower_arm_profile: "shape://lower_arm_profile",
        paw_profile: "shape://paw_profile"
      }
    },
    slots: [
      { slot_id: "body", default_image_id: "body_front", z_index: 1 },
      { slot_id: "upper_arm", default_image_id: "upper_arm", z_index: 2 },
      { slot_id: "lower_arm", default_image_id: "lower_arm", z_index: 3 },
      { slot_id: "paw", default_image_id: "paw", z_index: 4 }
    ],
    skeleton: {
      bones: [
        { bone_id: "root", parent_id: "", rest: { x: 512, y: 730, rotation_deg: 0 } },
        { bone_id: "torso", parent_id: "root", rest: { x: 0, y: 0, rotation_deg: 0 } },
        {
          bone_id: "upper_arm",
          parent_id: "torso",
          rest: { x: 148, y: -108, rotation_deg: 12 },
          limits: { min_rotation_deg: -70, max_rotation_deg: 95 }
        },
        {
          bone_id: "lower_arm",
          parent_id: "upper_arm",
          rest: { x: 96, y: 0, rotation_deg: 10 },
          limits: { min_rotation_deg: -130, max_rotation_deg: 130 }
        }
      ],
      attachments: [
        {
          slot_id: "body",
          image_id: "body_front",
          bone_id: "torso",
          pivot: { px: 0.5, py: 0.83 },
          offset: { x: 0, y: -205 },
          scale: { x: 2.9, y: 3.4 },
          rotation_deg: 0
        },
        {
          slot_id: "upper_arm",
          image_id: "upper_arm",
          bone_id: "upper_arm",
          pivot: { px: 0.12, py: 0.5 },
          offset: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation_deg: 0
        },
        {
          slot_id: "lower_arm",
          image_id: "lower_arm",
          bone_id: "lower_arm",
          pivot: { px: 0.1, py: 0.5 },
          offset: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation_deg: 0
        },
        {
          slot_id: "paw",
          image_id: "paw",
          bone_id: "lower_arm",
          pivot: { px: 0.5, py: 0.5 },
          offset: { x: 82, y: 0 },
          scale: { x: 1, y: 1 },
          rotation_deg: 0
        }
      ]
    },
    visemes: {},
    expressions: {
      view_front: {
        slot_overrides: [{ slot_id: "body", image_id: "body_front" }],
        bone_overrides: [{ bone_id: "torso", x: 0, y: 0, rotation_deg: 0 }]
      },
      view_right_3q: {
        slot_overrides: [{ slot_id: "body", image_id: "body_3q" }],
        bone_overrides: [{ bone_id: "torso", x: 8, y: 0, rotation_deg: 0 }]
      },
      view_right_profile: {
        slot_overrides: [
          { slot_id: "body", image_id: "body_profile" },
          { slot_id: "upper_arm", image_id: "upper_arm_profile" },
          { slot_id: "lower_arm", image_id: "lower_arm_profile" },
          { slot_id: "paw", image_id: "paw_profile" }
        ],
        bone_overrides: [{ bone_id: "torso", x: 12, y: 0, rotation_deg: 0 }]
      },
      view_left_3q: {
        slot_overrides: [{ slot_id: "body", image_id: "body_3q" }],
        bone_overrides: [{ bone_id: "torso", x: -8, y: 0, rotation_deg: 0 }]
      },
      view_left_profile: {
        slot_overrides: [
          { slot_id: "body", image_id: "body_profile" },
          { slot_id: "upper_arm", image_id: "upper_arm_profile" },
          { slot_id: "lower_arm", image_id: "lower_arm_profile" },
          { slot_id: "paw", image_id: "paw_profile" }
        ],
        bone_overrides: [{ bone_id: "torso", x: -12, y: 0, rotation_deg: 0 }]
      }
    },
    clips: [],
    ik_chains: [
      {
        chain_id: "arm_point",
        bones: ["upper_arm", "lower_arm"],
        effector_bone_id: "lower_arm",
        elbow_hint: "down",
        max_stretch: 1.15
      }
    ]
  };

  const schemaCheck = schemaValidator.validate("character_pack.schema.json", pack);
  if (!schemaCheck.ok) {
    throw new Error("Schema validation failed: character_pack.schema.json");
  }

  writeJson(out.packPath, pack);

  const packJson = toPrismaJsonValue(pack);
  if (packJson === null) {
    throw new Error("character pack serialization failed");
  }
  const hash = sha256Hex(stableStringify(packJson));

  await prisma.characterPack.update({
    where: {
      id: character.characterPackId
    },
    data: {
      json: packJson,
      hash,
      status: "APPROVED"
    }
  });

  await logJob(jobDbId, "info", "Character pack built", {
    characterPackId: character.characterPackId,
    version: character.version,
    packPath: out.packPath,
    hash,
    assets: character.assetIds
  });

  return pack;
}

async function handleBuildCharacterPack(payload: EpisodeJobPayload, jobDbId: string) {
  const character = requireCharacterPayload(payload);
  await setEpisodeStatus(payload.episodeId, "GENERATING");

  await buildCharacterPackJson(payload, jobDbId);

  const previewJobId = character.previewJobDbId;
  if (!previewJobId) {
    throw new Error("Missing previewJobDbId in payload.character");
  }

  const previewJob = await prisma.job.findUnique({
    where: {
      id: previewJobId
    },
    select: {
      id: true,
      episodeId: true,
      maxAttempts: true,
      retryBackoffMs: true,
      status: true
    }
  });

  if (!previewJob || previewJob.episodeId !== payload.episodeId) {
    throw new Error(`Preview job not found or episode mismatch: ${previewJobId}`);
  }

  if (previewJob.status === "SUCCEEDED") {
    await logJob(jobDbId, "info", "Character preview already succeeded", {
      previewJobDbId: previewJob.id
    });
    return;
  }

  const previewPayload: EpisodeJobPayload = {
    jobDbId: previewJob.id,
    episodeId: payload.episodeId,
    schemaChecks: [],
    character
  };

  await logJob(previewJob.id, "info", "Transition -> QUEUED", {
    source: "worker:character-pack",
    parentJobDbId: jobDbId
  });

  const queued = await addToQueue(
    RENDER_CHARACTER_PREVIEW_JOB_NAME,
    previewPayload,
    previewJob.maxAttempts,
    previewJob.retryBackoffMs
  );

  await prisma.job.update({
    where: {
      id: previewJob.id
    },
    data: {
      status: "QUEUED",
      bullmqJobId: String(queued.id),
      progress: 0,
      lastError: null,
      finishedAt: null
    }
  });

  await logJob(previewJob.id, "info", "Transition -> ENQUEUED", {
    source: "worker:character-pack",
    bullmqJobId: String(queued.id)
  });

  await logJob(jobDbId, "info", "Character preview job enqueued", {
    previewJobDbId: previewJob.id,
    bullmqJobId: String(queued.id)
  });
}

async function handleRenderCharacterPreview(payload: EpisodeJobPayload, jobDbId: string) {
  const character = requireCharacterPayload(payload);
  const out = ensureCharacterOut(character.characterPackId);
  const generationScoreSummary = summarizeCharacterGenerationScores(character);

  const characterPack = await prisma.characterPack.findUnique({
    where: {
      id: character.characterPackId
    },
    select: {
      id: true,
      json: true
    }
  });

  if (!characterPack) {
    throw new Error(`CharacterPack not found: ${character.characterPackId}`);
  }

  const pack = characterPack.json as CharacterPackJson;
  const schemaCheck = schemaValidator.validate("character_pack.schema.json", pack);
  if (!schemaCheck.ok) {
    throw new Error("Schema validation failed for persisted character pack");
  }

  if (!fs.existsSync(out.packPath)) {
    writeJson(out.packPath, pack);
  }

  const remotionCli = path.resolve(REPO_ROOT, "apps", "video", "node_modules", "@remotion", "cli", "remotion-cli.js");
  const props = JSON.stringify({
    characterPackId: character.characterPackId,
    pack
  });

  await logJob(jobDbId, "info", "Character preview render started", {
    compositionId: "CHARACTER-PACK-PREVIEW",
    outputPath: out.previewPath
  });

  await runCommand(
    process.execPath,
    [
      remotionCli,
      "render",
      "apps/video/src/index.ts",
      "CHARACTER-PACK-PREVIEW",
      out.previewPath,
      "--overwrite",
      "--props",
      props
    ],
    REPO_ROOT
  );

  const previewExists = fs.existsSync(out.previewPath);
  const qcReport = {
    ok: previewExists,
    characterPackId: character.characterPackId,
    generatedAt: new Date().toISOString(),
    generationQc: {
      manifestPath: generationScoreSummary.manifestPath,
      views: generationScoreSummary.views,
      warnings: generationScoreSummary.warnings
    },
    checks: [
      {
        code: "CHARACTER_PACK_SCHEMA",
        passed: true
      },
      {
        code: "PREVIEW_OUTPUT_EXISTS",
        passed: previewExists
      }
    ],
    output: {
      previewPath: out.previewPath
    }
  };

  writeJson(out.qcReportPath, qcReport);

  await prisma.qCResult.create({
    data: {
      episodeId: payload.episodeId,
      check: "SCHEMA",
      severity: previewExists ? "INFO" : "ERROR",
      passed: previewExists,
      details: toPrismaJson(qcReport)
    }
  });

  await setEpisodeStatus(payload.episodeId, "PREVIEW_READY");

  await logJob(jobDbId, "info", "Character preview render completed", {
    previewPath: out.previewPath,
    qcReportPath: out.qcReportPath
  });
}

const worker = new Worker<WorkerQueuePayload>(
  QUEUE_NAME,
  async (bullJob) => {
    const jobName = String(bullJob.name);
    const rawPayload = bullJob.data as unknown;

    if (!isEpisodePayload(rawPayload)) {
      throw new Error(`Invalid payload for job=${jobName}`);
    }

    const payload = rawPayload;
    const attempt = bullJob.attemptsMade + 1;
    const jobDbId = payload.jobDbId;

    const current = await prisma.job.findUnique({ where: { id: jobDbId }, select: { status: true, maxAttempts: true, retryBackoffMs: true } });
    if (!current) throw new Error(`Job row not found: ${jobDbId}`);
    if (current.status === "SUCCEEDED") {
      await logJob(jobDbId, "warn", "Duplicate delivery ignored", { bullmqJobId: String(bullJob.id), jobName });
      return { ok: true, skipped: true };
    }

    await setJobStatus(jobDbId, "RUNNING", { progress: 1, attemptsMade: attempt, lastError: null, startedAt: attempt === 1 ? new Date() : undefined, finishedAt: null });
    await logJob(jobDbId, "info", "Transition -> RUNNING", { bullmqJobId: String(bullJob.id), jobName, attempt });

    if (payload.schemaChecks?.length) {
      for (const check of payload.schemaChecks) {
        const vr = schemaValidator.validate(check.schemaId, check.data);
        if (!vr.ok) throw new Error(`Schema validation failed: ${check.schemaId}`);
      }
    }

    if (jobName === GENERATE_CHARACTER_ASSETS_JOB_NAME) {
      await handleGenerateCharacterAssetsJob({
        prisma,
        payload,
        jobDbId,
        maxAttempts: current.maxAttempts,
        retryBackoffMs: current.retryBackoffMs,
        helpers: {
          logJob,
          setJobStatus,
          setEpisodeStatus,
          addEpisodeJob: addToQueue
        }
      });
    } else if (jobName === GENERATE_BEATS_JOB_NAME) {
      await handleGenerate(payload, jobDbId, current);
    } else if (jobName === COMPILE_SHOTS_JOB_NAME) {
      await handleCompile(payload, jobDbId, current);
    } else if (jobName === BUILD_CHARACTER_PACK_JOB_NAME) {
      await handleBuildCharacterPack(payload, jobDbId);
    } else if (jobName === RENDER_CHARACTER_PREVIEW_JOB_NAME) {
      await handleRenderCharacterPreview(payload, jobDbId);
    } else if (jobName === RENDER_PREVIEW_JOB_NAME) {
      await handleRender(RENDER_PREVIEW_JOB_NAME, payload, jobDbId, attempt, current);
    } else if (jobName === RENDER_FINAL_JOB_NAME) {
      await handleRender(RENDER_FINAL_JOB_NAME, payload, jobDbId, attempt, current);
    } else if (jobName === RENDER_EPISODE_JOB_NAME) {
      await handleRender(RENDER_EPISODE_JOB_NAME, payload, jobDbId, attempt, current);
    } else if (jobName === PACKAGE_OUTPUTS_JOB_NAME) {
      await handlePackage(payload, jobDbId);
    } else {
      await logJob(jobDbId, "info", "No-op handler", { jobName });
    }

    await setJobStatus(jobDbId, "SUCCEEDED", { progress: 100, attemptsMade: attempt, lastError: null, finishedAt: new Date() });
    await logJob(jobDbId, "info", "Transition -> SUCCEEDED", { bullmqJobId: String(bullJob.id), jobName, attempt });
    return { ok: true };
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 2,
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: WORKER_MAX_STALLED_COUNT
  }
);

const assetIngestWorker = new Worker<AssetIngestQueuePayload>(
  ASSET_QUEUE_NAME,
  async (bullJob) => {
    if (String(bullJob.name) !== ASSET_INGEST_JOB_NAME) {
      throw new Error(`asset worker received unsupported job: ${String(bullJob.name)}`);
    }
    if (!isAssetIngestPayload(bullJob.data)) {
      throw new Error("Invalid ASSET_INGEST payload");
    }
    return withTimeout(
      handleAssetIngestJob({
        prisma,
        payload: bullJob.data,
        bullmqJobId: String(bullJob.id)
      }),
      ASSET_INGEST_TIMEOUT_MS,
      `ASSET_INGEST job=${String(bullJob.id)}`
    );
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 1,
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: WORKER_MAX_STALLED_COUNT
  }
);

worker.on("failed", async (bullJob, err) => {
  if (!bullJob) return;
  const jobName = String(bullJob.name);
  const rawPayload = bullJob.data as unknown;

  if (!isEpisodePayload(rawPayload)) {
    return;
  }

  const payload = rawPayload;
  const configuredAttemptsRaw = bullJob.opts.attempts;
  const configuredAttempts =
    typeof configuredAttemptsRaw === "number" && Number.isFinite(configuredAttemptsRaw)
      ? configuredAttemptsRaw
      : 1;
  const terminalFailure = bullJob.attemptsMade >= Math.max(1, configuredAttempts);

  if (!terminalFailure) {
    await setJobStatus(payload.jobDbId, "QUEUED", {
      attemptsMade: bullJob.attemptsMade,
      lastError: err.stack ?? err.message,
      finishedAt: null
    });
    await logJob(payload.jobDbId, "warn", "Attempt failed, retry scheduled", {
      bullmqJobId: String(bullJob.id),
      jobName,
      error: err.message,
      attempt: bullJob.attemptsMade,
      maxAttempts: configuredAttempts
    });
    return;
  }

  await setJobStatus(payload.jobDbId, "FAILED", {
    attemptsMade: bullJob.attemptsMade,
    lastError: err.stack ?? err.message,
    finishedAt: new Date()
  });
  await logJob(payload.jobDbId, "error", "Transition -> FAILED", {
    bullmqJobId: String(bullJob.id),
    jobName,
    error: err.message,
    stack: err.stack,
    attempt: bullJob.attemptsMade,
    maxAttempts: configuredAttempts
  });
  try {
    await setEpisodeStatus(payload.episodeId, "FAILED");
  } catch {
    // Ignore missing episode in failed hook.
  }
});

assetIngestWorker.on("failed", async (bullJob, error) => {
  if (!bullJob || String(bullJob.name) !== ASSET_INGEST_JOB_NAME) {
    return;
  }
  const payload = bullJob.data;
  if (!isAssetIngestPayload(payload)) {
    return;
  }
  const safeError = error instanceof Error ? error.message : String(error);
  const configuredAttemptsRaw = bullJob.opts.attempts;
  const configuredAttempts =
    typeof configuredAttemptsRaw === "number" && Number.isFinite(configuredAttemptsRaw)
      ? configuredAttemptsRaw
      : 1;
  const terminalFailure = bullJob.attemptsMade >= Math.max(1, configuredAttempts);
  if (!terminalFailure) {
    return;
  }
  try {
    await prisma.asset.update({
      where: { id: payload.assetId },
      data: {
        status: "FAILED",
        qcJson: {
          ok: false,
          stage: "worker_failed",
          error: safeError,
          bullmqJobId: String(bullJob.id),
          failedAt: new Date().toISOString()
        } as Prisma.JsonObject
      }
    });
  } catch {
    // ignore secondary failure
  }
});

let isShuttingDown = false;

async function shutdownWorker(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`[worker] shutting down signal=${signal}`);
  await assetIngestWorker.close().catch(() => undefined);
  await worker.close().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdownWorker(signal);
  });
}

console.log(
  `[worker] running. redis=${REDIS_URL} queue=${QUEUE_NAME} jobs=${EPISODE_JOB_NAME},${GENERATE_CHARACTER_ASSETS_JOB_NAME},${BUILD_CHARACTER_PACK_JOB_NAME},${COMPILE_SHOTS_JOB_NAME},${RENDER_CHARACTER_PREVIEW_JOB_NAME},${RENDER_PREVIEW_JOB_NAME},${RENDER_FINAL_JOB_NAME},${PACKAGE_OUTPUTS_JOB_NAME},${RENDER_EPISODE_JOB_NAME}`
);
console.log(`[worker] asset ingest enabled. queue=${ASSET_QUEUE_NAME} job=${ASSET_INGEST_JOB_NAME}`);
logMotionPresetBenchmarkStartupHealth();
logSidecarPresetRolloutStartupHealth();
