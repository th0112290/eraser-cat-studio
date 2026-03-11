import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex, stableStringify } from "@ec/shared";
import type {
  SidecarControlNetPresetId,
  SidecarImpactPresetId,
  SidecarQcPresetId
} from "@ec/profiles";
import type {
  ShotSidecarPlan,
  ShotSidecarPresetMetadata,
  ShotSidecarRenderer
} from "./types";

type GeneratedSidecarView = "front" | "threeQuarter" | "profile";
type GeneratedSidecarRequestKind = "video_broll" | "image_to_video" | "style_to_video" | "video_overlay";

type GeneratedStillAssetRecord = {
  asset_id?: string;
  file_path?: string;
  workflow?: string;
  prompt?: string;
  seed?: number;
  view?: GeneratedSidecarView;
};

type GeneratedCharacterManifestRecord = {
  acceptance?: {
    status?: string;
  };
  approved_front_master?: {
    file_path?: string;
  };
  front_master?: GeneratedStillAssetRecord;
  views?: Partial<Record<GeneratedSidecarView, GeneratedStillAssetRecord | undefined>>;
};

export type GeneratedPackSidecarReference = {
  asset_id?: string;
  file_path: string;
  source_stage: "view" | "front_master";
  source_view: GeneratedSidecarView;
  workflow?: string;
  prompt?: string;
  seed?: number;
};

export type GeneratedPackSidecarRequestPack = {
  schema_version: "1.0";
  request_kind: GeneratedSidecarRequestKind;
  episode_id: string;
  shot_id: string;
  shot_type: string;
  render_mode: string;
  duration_seconds: number;
  fps: number;
  width: number;
  height: number;
  prompt: string;
  negative_prompt: string;
  controlnet_preset: ShotSidecarPresetMetadata["controlnetPreset"];
  impact_preset: ShotSidecarPresetMetadata["impactPreset"];
  qc_preset: ShotSidecarPresetMetadata["qcPreset"];
  preset_source: string | null;
  preset_rollout_source: ShotSidecarPresetMetadata["presetRolloutSource"];
  preset_rollout_source_kind: ShotSidecarPresetMetadata["presetRolloutSourceKind"];
  preset_rollout_scenario: ShotSidecarPresetMetadata["presetRolloutScenario"];
  preset_rollout_score: ShotSidecarPresetMetadata["presetRolloutScore"];
  preset_rollout_verdict: ShotSidecarPresetMetadata["presetRolloutVerdict"];
  preset_rollout_target: ShotSidecarPresetMetadata["presetRolloutTarget"];
  preset_rollout_artifact_age_hours: ShotSidecarPresetMetadata["presetRolloutArtifactAgeHours"];
  preset_rollout_channel_domain: ShotSidecarPresetMetadata["presetRolloutChannelDomain"];
  reference_still: GeneratedPackSidecarReference | null;
  source_pack: {
    pack_id: string;
    pack_path: string | null;
    manifest_path: string | null;
    acceptance_status: string | null;
  };
  metadata: {
    placeholder: true;
    strategy: "generated_pack_placeholder";
    narration: string;
    set_id: string;
    camera_preset: string;
    selected_view: GeneratedSidecarView;
    reference_available: boolean;
    controlnet_preset: ShotSidecarPresetMetadata["controlnetPreset"];
    impact_preset: ShotSidecarPresetMetadata["impactPreset"];
    qc_preset: ShotSidecarPresetMetadata["qcPreset"];
    preset_source: string | null;
    preset_rollout_source: ShotSidecarPresetMetadata["presetRolloutSource"];
    preset_rollout_source_kind: ShotSidecarPresetMetadata["presetRolloutSourceKind"];
    preset_rollout_scenario: ShotSidecarPresetMetadata["presetRolloutScenario"];
    preset_rollout_score: ShotSidecarPresetMetadata["presetRolloutScore"];
    preset_rollout_verdict: ShotSidecarPresetMetadata["presetRolloutVerdict"];
    preset_rollout_target: ShotSidecarPresetMetadata["presetRolloutTarget"];
    preset_rollout_artifact_age_hours: ShotSidecarPresetMetadata["presetRolloutArtifactAgeHours"];
    preset_rollout_channel_domain: ShotSidecarPresetMetadata["presetRolloutChannelDomain"];
    preset_policy_tags: string[];
  };
};

export type CreateGeneratedPackSidecarPlaceholderRendererInput = {
  repoRoot?: string;
  rendererName?: string;
  modelName?: string;
};

export type CreateGeneratedPackSidecarStillVideoRendererInput = CreateGeneratedPackSidecarPlaceholderRendererInput & {
  compositionId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function requestKindForRenderMode(renderMode: string): GeneratedSidecarRequestKind {
  if (renderMode === "generative_i2v") {
    return "image_to_video";
  }
  if (renderMode === "generative_s2v") {
    return "style_to_video";
  }
  if (renderMode === "generative_overlay") {
    return "video_overlay";
  }
  return "video_broll";
}

function defaultViewForRenderMode(renderMode: string): GeneratedSidecarView {
  if (renderMode === "generative_s2v") {
    return "profile";
  }
  if (renderMode === "generative_broll") {
    return "threeQuarter";
  }
  return "front";
}

function resolveShotView(shot: {
  render_mode?: string;
  character?: {
    tracks?: {
      view_track?: Array<{
        f?: number;
        view?: GeneratedSidecarView;
      }>;
    };
  };
}): GeneratedSidecarView {
  const track = shot.character?.tracks?.view_track;
  if (Array.isArray(track) && track.length > 0) {
    const sorted = [...track].sort((left, right) => (left.f ?? 0) - (right.f ?? 0));
    const candidate = sorted[0]?.view;
    if (candidate === "front" || candidate === "threeQuarter" || candidate === "profile") {
      return candidate;
    }
  }
  return defaultViewForRenderMode(shot.render_mode ?? "generative_broll");
}

function parsePolicyTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
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

function resolveShotSidecarPresetMetadata(shot: {
  sidecar_preset?: {
    controlnet_preset?: unknown;
    impact_preset?: unknown;
    qc_preset?: unknown;
    preset_source?: unknown;
    preset_rollout_source?: unknown;
    preset_rollout_source_kind?: unknown;
    preset_rollout_scenario?: unknown;
    preset_rollout_score?: unknown;
    preset_rollout_verdict?: unknown;
    preset_rollout_target?: unknown;
    preset_rollout_artifact_age_hours?: unknown;
    preset_rollout_channel_domain?: unknown;
    policy_tags?: unknown;
  };
}): Required<ShotSidecarPresetMetadata> {
  const preset = shot.sidecar_preset;
  return {
    controlnetPreset: isSidecarControlNetPresetId(preset?.controlnet_preset) ? preset.controlnet_preset : null,
    impactPreset: isSidecarImpactPresetId(preset?.impact_preset) ? preset.impact_preset : null,
    qcPreset: isSidecarQcPresetId(preset?.qc_preset) ? preset.qc_preset : null,
    presetSource: typeof preset?.preset_source === "string" ? preset.preset_source : null,
    policyTags: parsePolicyTags(preset?.policy_tags),
    presetRolloutSource: typeof preset?.preset_rollout_source === "string" ? preset.preset_rollout_source : null,
    presetRolloutSourceKind:
      preset?.preset_rollout_source_kind === "file" || preset?.preset_rollout_source_kind === "matrix"
        ? preset.preset_rollout_source_kind
        : null,
    presetRolloutScenario: typeof preset?.preset_rollout_scenario === "string" ? preset.preset_rollout_scenario : null,
    presetRolloutScore:
      typeof preset?.preset_rollout_score === "number" ? preset.preset_rollout_score : null,
    presetRolloutVerdict: typeof preset?.preset_rollout_verdict === "string" ? preset.preset_rollout_verdict : null,
    presetRolloutTarget:
      preset?.preset_rollout_target === "overall" ||
      preset?.preset_rollout_target === "balanced" ||
      preset?.preset_rollout_target === "strict"
        ? preset.preset_rollout_target
        : null,
    presetRolloutArtifactAgeHours:
      typeof preset?.preset_rollout_artifact_age_hours === "number" ? preset.preset_rollout_artifact_age_hours : null,
    presetRolloutChannelDomain:
      preset?.preset_rollout_channel_domain === "economy" || preset?.preset_rollout_channel_domain === "medical"
        ? preset.preset_rollout_channel_domain
        : null
  };
}

function readGeneratedManifest(repoRoot: string, packId: string): {
  manifestPath: string | null;
  packPath: string | null;
  acceptanceStatus: string | null;
  manifest: GeneratedCharacterManifestRecord | null;
} {
  const manifestPath = path.join(repoRoot, "assets", "generated", "characters", packId, "manifest.json");
  const packPath = path.join(repoRoot, "assets", "generated", "characters", packId, "pack", "character.pack.json");
  if (!fs.existsSync(manifestPath)) {
    return {
      manifestPath: null,
      packPath: fs.existsSync(packPath) ? packPath : null,
      acceptanceStatus: null,
      manifest: null
    };
  }

  const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  if (!isRecord(raw)) {
    return {
      manifestPath,
      packPath: fs.existsSync(packPath) ? packPath : null,
      acceptanceStatus: null,
      manifest: null
    };
  }

  const manifest = raw as GeneratedCharacterManifestRecord;
  return {
    manifestPath,
    packPath: fs.existsSync(packPath) ? packPath : null,
    acceptanceStatus: typeof manifest.acceptance?.status === "string" ? manifest.acceptance.status : null,
    manifest
  };
}

function resolveGeneratedReference(
  manifest: GeneratedCharacterManifestRecord | null,
  targetView: GeneratedSidecarView
): GeneratedPackSidecarReference | null {
  const viewAsset = manifest?.views?.[targetView];
  if (viewAsset?.file_path && fs.existsSync(viewAsset.file_path)) {
    return {
      asset_id: viewAsset.asset_id,
      file_path: viewAsset.file_path,
      source_stage: "view",
      source_view: targetView,
      workflow: viewAsset.workflow,
      prompt: viewAsset.prompt,
      seed: viewAsset.seed
    };
  }

  const frontMaster = manifest?.front_master;
  if (frontMaster?.file_path && fs.existsSync(frontMaster.file_path)) {
    return {
      asset_id: frontMaster.asset_id,
      file_path: frontMaster.file_path,
      source_stage: "front_master",
      source_view: "front",
      workflow: frontMaster.workflow,
      prompt: frontMaster.prompt,
      seed: frontMaster.seed
    };
  }

  const approvedFrontPath = manifest?.approved_front_master?.file_path;
  if (typeof approvedFrontPath === "string" && approvedFrontPath.trim().length > 0 && fs.existsSync(approvedFrontPath)) {
    return {
      file_path: approvedFrontPath,
      source_stage: "front_master",
      source_view: "front"
    };
  }

  return null;
}

function buildPlaceholderPrompt(input: {
  renderMode: string;
  shotType: string;
  narration: string;
  reference: GeneratedPackSidecarReference | null;
  targetView: GeneratedSidecarView;
}): string {
  const modeHint =
    input.renderMode === "generative_i2v"
      ? "Animate the supplied character still into a short image-to-video clip with subtle motion and preserved identity."
      : input.renderMode === "generative_s2v"
        ? "Create a stylized short-form motion clip guided by the supplied character still and preserve silhouette continuity."
        : input.renderMode === "generative_overlay"
          ? "Create a lightweight overlay motion element that can sit above the deterministic backbone."
          : "Create a short insert b-roll clip that complements the deterministic backbone and preserves the referenced character identity.";
  const referenceHint = input.reference
    ? `Use the supplied ${input.reference.source_view} reference still as the identity anchor.`
    : "No approved generated still is attached; keep the request abstract and safe for later fulfillment.";
  const narrationHint = input.narration.trim().length > 0 ? `Narration context: ${input.narration.trim()}.` : "";
  return [modeHint, `Shot type: ${input.shotType}.`, `Preferred view: ${input.targetView}.`, referenceHint, narrationHint]
    .filter((entry) => entry.length > 0)
    .join(" ");
}

function sanitizeSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return normalized.replace(/^-|-$/g, "").toLowerCase() || "asset";
}

function extractArtifactPath(plan: ShotSidecarPlan, label: string): string | null {
  const artifact = Array.isArray(plan.artifacts) ? plan.artifacts.find((entry) => entry.label === label) ?? null : null;
  return artifact?.path ?? null;
}

function resolveStillMotionPreset(input: {
  renderMode: string;
  targetView: GeneratedSidecarView;
  cameraPreset: string;
}): "slow_push" | "gentle_rise" | "profile_slide" {
  const cameraPreset = input.cameraPreset.trim().toLowerCase();
  if (input.targetView === "profile" || input.renderMode === "generative_s2v") {
    return "profile_slide";
  }
  if (input.renderMode === "generative_i2v" || cameraPreset === "static") {
    return "gentle_rise";
  }
  return "slow_push";
}

function resolveStillBackground(input: {
  requestKind: GeneratedSidecarRequestKind;
  targetView: GeneratedSidecarView;
}): { backgroundTop: string; backgroundBottom: string } {
  if (input.requestKind === "style_to_video") {
    return {
      backgroundTop: "#e9e4dd",
      backgroundBottom: "#d8e1ef"
    };
  }
  if (input.targetView === "profile") {
    return {
      backgroundTop: "#eef1e7",
      backgroundBottom: "#dbe5ef"
    };
  }
  return {
    backgroundTop: "#f3efe6",
    backgroundBottom: "#dde9f6"
  };
}

function ensurePublicStillAsset(input: {
  repoRoot: string;
  episodeId: string;
  shotId: string;
  referenceStill: GeneratedPackSidecarReference;
}): {
  publicStillSrc: string;
  publicStillPath: string;
} {
  const extension = path.extname(input.referenceStill.file_path).toLowerCase() || ".png";
  const stat = fs.statSync(input.referenceStill.file_path);
  const fileName = `${sanitizeSegment(input.shotId)}-${sha256Hex(
    stableStringify({
      episodeId: input.episodeId,
      shotId: input.shotId,
      referencePath: input.referenceStill.file_path,
      mtimeMs: stat.mtimeMs,
      size: stat.size
    })
  ).slice(0, 12)}${extension}`;
  const publicDir = path.join(input.repoRoot, "apps", "video", "public", "sidecar_stills", input.episodeId);
  ensureDir(publicDir);
  const publicStillPath = path.join(publicDir, fileName);
  if (!fs.existsSync(publicStillPath)) {
    fs.copyFileSync(input.referenceStill.file_path, publicStillPath);
  }
  return {
    publicStillSrc: path.posix.join("sidecar_stills", input.episodeId, fileName),
    publicStillPath
  };
}

function resolveRemotionPaths(repoRoot: string): {
  videoDir: string;
  remotionCliPath: string;
} {
  const videoDir = path.join(repoRoot, "apps", "video");
  return {
    videoDir,
    remotionCliPath: path.join(videoDir, "node_modules", "@remotion", "cli", "remotion-cli.js")
  };
}

export function createGeneratedPackSidecarPlaceholderRenderer(
  input: CreateGeneratedPackSidecarPlaceholderRendererInput = {}
): ShotSidecarRenderer {
  const repoRoot = input.repoRoot ?? resolveRepoRoot();
  const rendererName = input.rendererName?.trim() || "generated-pack-placeholder";
  const modelName = input.modelName?.trim() || "placeholder-request-pack";

  return async ({ episodeId, shot, shotType, renderMode, narration, outputRootDir, fps, width, height }) => {
    const packId = shot.character.pack_id.trim();
    const targetView = resolveShotView(shot);
    const sidecarPreset = resolveShotSidecarPresetMetadata(shot);
    const manifestInfo = readGeneratedManifest(repoRoot, packId);
    const reference = resolveGeneratedReference(manifestInfo.manifest, targetView);
    const requestKind = requestKindForRenderMode(renderMode);
    const prompt = buildPlaceholderPrompt({
      renderMode,
      shotType,
      narration,
      reference,
      targetView
    });
    const negativePrompt =
      "text overlays, watermarks, logos, extra characters, broken anatomy, inconsistent identity, unreadable motion, flicker";

    const requestPack: GeneratedPackSidecarRequestPack = {
      schema_version: "1.0",
      request_kind: requestKind,
      episode_id: episodeId,
      shot_id: shot.shot_id,
      shot_type: shotType,
      render_mode: renderMode,
      duration_seconds: Number((shot.duration_frames / Math.max(1, fps)).toFixed(3)),
      fps,
      width,
      height,
      prompt,
      negative_prompt: negativePrompt,
      controlnet_preset: sidecarPreset.controlnetPreset,
      impact_preset: sidecarPreset.impactPreset,
      qc_preset: sidecarPreset.qcPreset,
      preset_source: sidecarPreset.presetSource,
      preset_rollout_source: sidecarPreset.presetRolloutSource,
      preset_rollout_source_kind: sidecarPreset.presetRolloutSourceKind,
      preset_rollout_scenario: sidecarPreset.presetRolloutScenario,
      preset_rollout_score: sidecarPreset.presetRolloutScore,
      preset_rollout_verdict: sidecarPreset.presetRolloutVerdict,
      preset_rollout_target: sidecarPreset.presetRolloutTarget,
      preset_rollout_artifact_age_hours: sidecarPreset.presetRolloutArtifactAgeHours,
      preset_rollout_channel_domain: sidecarPreset.presetRolloutChannelDomain,
      reference_still: reference,
      source_pack: {
        pack_id: packId,
        pack_path: manifestInfo.packPath,
        manifest_path: manifestInfo.manifestPath,
        acceptance_status: manifestInfo.acceptanceStatus
      },
      metadata: {
        placeholder: true,
        strategy: "generated_pack_placeholder",
        narration,
        set_id: shot.set.set_id,
        camera_preset: shot.camera.preset,
        selected_view: targetView,
        reference_available: Boolean(reference),
        controlnet_preset: sidecarPreset.controlnetPreset,
        impact_preset: sidecarPreset.impactPreset,
        qc_preset: sidecarPreset.qcPreset,
        preset_source: sidecarPreset.presetSource,
        preset_rollout_source: sidecarPreset.presetRolloutSource,
        preset_rollout_source_kind: sidecarPreset.presetRolloutSourceKind,
        preset_rollout_scenario: sidecarPreset.presetRolloutScenario,
        preset_rollout_score: sidecarPreset.presetRolloutScore,
        preset_rollout_verdict: sidecarPreset.presetRolloutVerdict,
        preset_rollout_target: sidecarPreset.presetRolloutTarget,
        preset_rollout_artifact_age_hours: sidecarPreset.presetRolloutArtifactAgeHours,
        preset_rollout_channel_domain: sidecarPreset.presetRolloutChannelDomain,
        preset_policy_tags: sidecarPreset.policyTags
      }
    };

    const sidecarDir = path.join(outputRootDir, "shot_sidecar");
    const planPath = path.join(sidecarDir, `${shot.shot_id}.plan.json`);
    const requestPath = path.join(sidecarDir, `${shot.shot_id}.request.json`);
    const promptPath = path.join(sidecarDir, `${shot.shot_id}.prompt.txt`);

    writeJson(planPath, {
      schema_version: "1.0",
      episode_id: episodeId,
      shot_id: shot.shot_id,
      shot_type: shotType,
      render_mode: renderMode,
      renderer: rendererName,
      model: modelName,
      prompt_path: promptPath,
      request_path: requestPath
    });
    writeJson(requestPath, requestPack);
    ensureDir(path.dirname(promptPath));
    fs.writeFileSync(promptPath, `${prompt}\n`, "utf8");

    const notes = reference
      ? "Generated-pack sidecar request pack prepared. Deterministic main render remains active until a sidecar executor is attached."
      : "Generated-pack sidecar request pack prepared without a reference still. Deterministic main render remains active.";

    const plan: ShotSidecarPlan = {
      shotId: shot.shot_id,
      shotType,
      renderMode,
      status: "planned",
      renderer: rendererName,
      notes,
      artifacts: [
        {
          kind: "json",
          path: planPath,
          label: "shot-sidecar-plan"
        },
        {
          kind: "json",
          path: requestPath,
          label: "shot-sidecar-request"
        },
        {
          kind: "plan",
          path: promptPath,
          label: "shot-sidecar-prompt"
        }
      ],
      metadata: {
        modelName,
        requestKind,
        targetView,
        referencePath: reference?.file_path ?? null,
        acceptanceStatus: manifestInfo.acceptanceStatus,
        placeholder: true,
        controlnetPreset: sidecarPreset.controlnetPreset,
        impactPreset: sidecarPreset.impactPreset,
        qcPreset: sidecarPreset.qcPreset,
        presetSource: sidecarPreset.presetSource,
        policyTags: sidecarPreset.policyTags,
        presetRolloutSource: sidecarPreset.presetRolloutSource,
        presetRolloutSourceKind: sidecarPreset.presetRolloutSourceKind,
        presetRolloutScenario: sidecarPreset.presetRolloutScenario,
        presetRolloutScore: sidecarPreset.presetRolloutScore,
        presetRolloutVerdict: sidecarPreset.presetRolloutVerdict,
        presetRolloutTarget: sidecarPreset.presetRolloutTarget,
        presetRolloutArtifactAgeHours: sidecarPreset.presetRolloutArtifactAgeHours,
        presetRolloutChannelDomain: sidecarPreset.presetRolloutChannelDomain
      }
    };

    return plan;
  };
}

export function createGeneratedPackSidecarStillVideoRenderer(
  input: CreateGeneratedPackSidecarStillVideoRendererInput = {}
): ShotSidecarRenderer {
  const repoRoot = input.repoRoot ?? resolveRepoRoot();
  const rendererName = input.rendererName?.trim() || "generated-pack-still-video";
  const modelName = input.modelName?.trim() || "remotion-sidecar-still-video";
  const compositionId = input.compositionId?.trim() || "SIDECAR-STILL-VIDEO";
  const placeholderRenderer = createGeneratedPackSidecarPlaceholderRenderer({
    repoRoot,
    rendererName,
    modelName
  });
  const { videoDir, remotionCliPath } = resolveRemotionPaths(repoRoot);

  return async (request) => {
    const planned =
      (await placeholderRenderer(request)) ??
      ({
        shotId: request.shot.shot_id,
        shotType: request.shotType,
        renderMode: request.renderMode,
        status: "planned",
        renderer: rendererName,
        notes: "Generated-pack still-video request pack prepared.",
        artifacts: []
      } satisfies ShotSidecarPlan);
    const requestPath = extractArtifactPath(planned, "shot-sidecar-request");
    const promptPath = extractArtifactPath(planned, "shot-sidecar-prompt");
    const sidecarDir = path.join(request.outputRootDir, "shot_sidecar");
    const propsPath = path.join(sidecarDir, `${request.shot.shot_id}.props.json`);
    const resultPath = path.join(sidecarDir, `${request.shot.shot_id}.result.json`);
    const outputVideoPath = path.join(sidecarDir, `${request.shot.shot_id}.mp4`);

    if (!requestPath || !fs.existsSync(requestPath)) {
      return {
        ...planned,
        status: "failed",
        notes: "Generated-pack still-video renderer could not find the request pack.",
        artifacts: [
          ...(planned.artifacts ?? []),
          {
            kind: "json",
            path: resultPath,
            label: "shot-sidecar-result"
          }
        ],
        metadata: {
          ...(planned.metadata ?? {}),
          failure: "request_pack_missing"
        }
      };
    }

    const requestPack = JSON.parse(fs.readFileSync(requestPath, "utf8")) as GeneratedPackSidecarRequestPack;
    const referenceStill = requestPack.reference_still;
    if (!referenceStill?.file_path || !fs.existsSync(referenceStill.file_path)) {
      writeJson(resultPath, {
        renderer: rendererName,
        status: "planned",
        reason: "reference_still_missing",
        requestPath
      });
      return {
        ...planned,
        notes: "Generated-pack still-video request pack prepared without a usable reference still.",
        artifacts: [
          ...(planned.artifacts ?? []),
          {
            kind: "json",
            path: resultPath,
            label: "shot-sidecar-result"
          }
        ],
        metadata: {
          ...(planned.metadata ?? {}),
          referencePath: null,
          acceptanceStatus: requestPack.source_pack.acceptance_status,
          placeholder: false
        }
      };
    }

    const publicStill = ensurePublicStillAsset({
      repoRoot,
      episodeId: request.episodeId,
      shotId: request.shot.shot_id,
      referenceStill
    });
    const durationInFrames = Math.max(1, Math.round(requestPack.duration_seconds * request.fps));
    const motionPreset = resolveStillMotionPreset({
      renderMode: request.renderMode,
      targetView: requestPack.metadata.selected_view,
      cameraPreset: request.shot.camera.preset
    });
    const background = resolveStillBackground({
      requestKind: requestPack.request_kind,
      targetView: requestPack.metadata.selected_view
    });
    const props = {
      stillSrc: publicStill.publicStillSrc,
      durationInFrames,
      motionPreset,
      backgroundTop: background.backgroundTop,
      backgroundBottom: background.backgroundBottom
    };
    writeJson(propsPath, props);

    const publicVideoDir = path.join(repoRoot, "apps", "video", "public", "sidecar_videos", request.episodeId);
    ensureDir(publicVideoDir);
    const cacheDir = path.join(sidecarDir, "cache");
    ensureDir(cacheDir);

    const cacheKey = sha256Hex(
      stableStringify({
        rendererName,
        modelName,
        compositionId,
        requestPack,
        props,
        publicStillSrc: publicStill.publicStillSrc
      })
    );
    const cachePath = path.join(cacheDir, `${cacheKey}.mp4`);
    const publicVideoFileName = `${sanitizeSegment(request.shot.shot_id)}-${cacheKey.slice(0, 12)}.mp4`;
    const publicVideoPath = path.join(publicVideoDir, publicVideoFileName);
    const publicVideoSrc = path.posix.join("sidecar_videos", request.episodeId, publicVideoFileName);

    let cached = true;
    if (!fs.existsSync(cachePath)) {
      cached = false;
      if (!fs.existsSync(remotionCliPath)) {
        writeJson(resultPath, {
          renderer: rendererName,
          status: "failed",
          reason: "remotion_cli_missing",
          remotionCliPath
        });
        return {
          ...planned,
          status: "failed",
          notes: `Remotion CLI not found for ${rendererName}: ${remotionCliPath}`,
          artifacts: [
            ...(planned.artifacts ?? []),
            {
              kind: "json",
              path: propsPath,
              label: "shot-sidecar-props"
            },
            {
              kind: "json",
              path: resultPath,
              label: "shot-sidecar-result"
            },
            {
              kind: "image",
              path: publicStill.publicStillPath,
              label: "shot-sidecar-reference"
            }
          ],
          metadata: {
            ...(planned.metadata ?? {}),
            referencePath: referenceStill.file_path,
            publicStillSrc: publicStill.publicStillSrc,
            failure: "remotion_cli_missing"
          }
        };
      }

      const renderArgs = [
        remotionCliPath,
        "render",
        "src/index.ts",
        compositionId,
        cachePath,
        "--overwrite",
        `--width=${request.width}`,
        `--height=${request.height}`,
        `--fps=${request.fps}`,
        "--codec=h264",
        "--video-bitrate=6M",
        "--x264-preset=veryfast",
        `--frames=0-${Math.max(0, durationInFrames - 1)}`,
        `--props=${propsPath}`
      ];
      const rendered = spawnSync(process.execPath, renderArgs, {
        cwd: videoDir,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024
      });
      if (rendered.status !== 0 || !fs.existsSync(cachePath)) {
        writeJson(resultPath, {
          renderer: rendererName,
          status: "failed",
          reason: "remotion_render_failed",
          command: [process.execPath, ...renderArgs],
          stdout: rendered.stdout,
          stderr: rendered.stderr,
          exitCode: rendered.status
        });
        return {
          ...planned,
          status: "failed",
          notes: `Generated-pack still-video render failed: ${rendered.stderr || rendered.stdout || "unknown error"}`,
          artifacts: [
            ...(planned.artifacts ?? []),
            {
              kind: "json",
              path: propsPath,
              label: "shot-sidecar-props"
            },
            {
              kind: "json",
              path: resultPath,
              label: "shot-sidecar-result"
            },
            {
              kind: "image",
              path: publicStill.publicStillPath,
              label: "shot-sidecar-reference"
            }
          ],
          metadata: {
            ...(planned.metadata ?? {}),
            referencePath: referenceStill.file_path,
            publicStillSrc: publicStill.publicStillSrc,
            failure: "remotion_render_failed"
          }
        };
      }
    }

    fs.copyFileSync(cachePath, outputVideoPath);
    fs.copyFileSync(cachePath, publicVideoPath);

    writeJson(resultPath, {
      renderer: rendererName,
      status: "resolved",
      cacheKey,
      cached,
      outputVideoPath,
      publicVideoPath,
      publicVideoSrc,
      propsPath,
      requestPath,
      promptPath,
      referencePath: referenceStill.file_path,
      publicStillPath: publicStill.publicStillPath,
      publicStillSrc: publicStill.publicStillSrc
    });

    return {
      ...planned,
      status: "resolved",
      notes: "Generated-pack still-video placeholder rendered to MP4 through Remotion.",
      artifacts: [
        ...(planned.artifacts ?? []),
        {
          kind: "json",
          path: propsPath,
          label: "shot-sidecar-props"
        },
        {
          kind: "json",
          path: resultPath,
          label: "shot-sidecar-result"
        },
        {
          kind: "image",
          path: publicStill.publicStillPath,
          label: "shot-sidecar-reference"
        },
        {
          kind: "video",
          path: outputVideoPath,
          label: "shot-sidecar-video"
        }
      ],
      metadata: {
        modelName,
        requestKind: requestPack.request_kind,
        targetView: requestPack.metadata.selected_view,
        referencePath: referenceStill.file_path,
        publicStillSrc: publicStill.publicStillSrc,
        acceptanceStatus: requestPack.source_pack.acceptance_status,
        publicVideoSrc,
        publicVideoPath,
        cached,
        placeholder: false
      }
    };
  };
}
