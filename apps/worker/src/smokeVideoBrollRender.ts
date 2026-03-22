import { bootstrapEnv } from "./bootstrapEnv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SIDECAR_CONTROLNET_PRESET_MANIFEST,
  SIDECAR_IMPACT_PRESET_MANIFEST,
  SIDECAR_PRESET_MANIFEST_VERSION,
  SIDECAR_QC_PRESET_MANIFEST
} from "./sidecarPresetManifest";
import {
  deriveEffectiveRetakeCount,
  resolveSidecarBackendCapability,
  resolveSidecarBackendSmokeTimeoutMs,
  resolveSidecarFailureReason,
  resolveSidecarFallbackReason,
  resolveSidecarJudgeScore
} from "./generatedSidecar";
import { resolveSmokeProfileSelection } from "./sidecarSmokeProfiles";
import { runSidecarSmokePreflight } from "./sidecarSmokePreflight";
import { closeEpisodeQueues, getEpisodeQueueForJobName, RENDER_EPISODE_JOB_NAME, type EpisodeJobPayload } from "./queue";
import { ensureSidecarSmokeCharacterPack } from "./sidecarSmokeCharacterPack";
import type { Job, Prisma } from "@prisma/client";
import type { JobsOptions } from "bullmq";
import type { SidecarControlNetPresetId, SidecarImpactPresetId, SidecarQcPresetId } from "@ec/profiles";

bootstrapEnv();

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const TEST_USER_EMAIL = "video-broll-smoke@example.com";
const TEST_USER_NAME = "video-broll-smoke";
const PREMIUM_ACTUAL_CANDIDATE_COUNT = Math.max(
  1,
  Math.min(3, Number.parseInt(process.env.VIDEO_SIDECAR_PREMIUM_ACTUAL_CANDIDATE_COUNT ?? "2", 10) || 2)
);
function resolveDefaultSmokeTimeoutMs(): number {
  const rendererHint =
    process.env.SMOKE_VIDEO_I2V_RENDERER?.trim() ||
    process.env.VIDEO_I2V_RENDERER?.trim() ||
    process.env.SMOKE_VIDEO_BROLL_RENDERER?.trim() ||
    process.env.VIDEO_BROLL_RENDERER?.trim() ||
    "comfyui-wan-i2v";
  const backendTimeoutMs = resolveSidecarBackendSmokeTimeoutMs(
    resolveSidecarBackendCapability(rendererHint),
    process.env
  );
  return Math.max(backendTimeoutMs, 900000 * Math.max(1, PREMIUM_ACTUAL_CANDIDATE_COUNT));
}
const TIMEOUT_MS = Number.parseInt(
  process.env.SMOKE_VIDEO_BROLL_TIMEOUT_MS ?? String(resolveDefaultSmokeTimeoutMs()),
  10
);
const POLL_INTERVAL_MS = 2000;
const SMOKE_CHARACTER_PACK_ID = process.env.SMOKE_VIDEO_BROLL_CHARACTER_PACK_ID?.trim() || null;
const EXPECTED_SIDECAR_STATUS = process.env.SMOKE_EXPECT_SIDECAR_STATUS?.trim() || null;
const EXPECTED_SIDECAR_RENDERER = process.env.SMOKE_EXPECT_SIDECAR_RENDERER?.trim() || null;
const PRESERVE_SMOKE_OUT_DIR = parseEnvFlag(process.env.SMOKE_PRESERVE_OUT_DIR, false);

type ActiveJobStatus = "QUEUED" | "RUNNING";

let activeJobId: string | null = null;
let processExitCode = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseEnvFlag(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

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

function resolveLocalPath(repoRoot: string, inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

function resolveExpectedRendererForMode(renderMode: string): string {
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

function resolveActiveSmokeRenderer(): string | null {
  return (
    process.env.SMOKE_VIDEO_I2V_RENDERER?.trim() ||
    process.env.VIDEO_I2V_RENDERER?.trim() ||
    process.env.SMOKE_VIDEO_S2V_RENDERER?.trim() ||
    process.env.VIDEO_S2V_RENDERER?.trim() ||
    process.env.SMOKE_VIDEO_OVERLAY_RENDERER?.trim() ||
    process.env.VIDEO_OVERLAY_RENDERER?.trim() ||
    process.env.SMOKE_VIDEO_BROLL_RENDERER?.trim() ||
    process.env.VIDEO_BROLL_RENDERER?.trim() ||
    null
  );
}

type FixtureShotSummary = {
  shotId: string;
  renderMode: string;
};

type SmokePresetOverride = {
  controlnetPreset: SidecarControlNetPresetId | null;
  impactPreset: SidecarImpactPresetId | null;
  qcPreset: SidecarQcPresetId | null;
};

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function parsePresetOverride<T extends string>(
  args: { argName: string; envName: string; allowed: readonly T[] }
): T | null {
  const raw = resolveArgValue(args.argName) ?? process.env[args.envName]?.trim() ?? null;
  if (!raw) {
    return null;
  }
  return args.allowed.includes(raw as T) ? (raw as T) : null;
}

function resolveSmokePresetOverride(): SmokePresetOverride {
  return {
    controlnetPreset: parsePresetOverride({
      argName: "controlnet-preset",
      envName: "SMOKE_CONTROLNET_PRESET",
      allowed: Object.keys(SIDECAR_CONTROLNET_PRESET_MANIFEST) as SidecarControlNetPresetId[]
    }),
    impactPreset: parsePresetOverride({
      argName: "impact-preset",
      envName: "SMOKE_IMPACT_PRESET",
      allowed: Object.keys(SIDECAR_IMPACT_PRESET_MANIFEST) as SidecarImpactPresetId[]
    }),
    qcPreset: parsePresetOverride({
      argName: "qc-preset",
      envName: "SMOKE_QC_PRESET",
      allowed: Object.keys(SIDECAR_QC_PRESET_MANIFEST) as SidecarQcPresetId[]
    })
  };
}

function buildDefaultSmokeShotGrammar(input: {
  renderMode: string;
  shotType: string;
}): Record<string, unknown> {
  const requiredView =
    input.renderMode === "generative_s2v"
      ? "profile"
      : input.renderMode === "generative_broll"
        ? "threeQuarter"
        : "front";
  const educationalIntent =
    input.renderMode === "generative_s2v"
      ? "premium_insert"
      : input.renderMode === "generative_i2v"
        ? "premium_insert"
        : input.renderMode === "generative_broll"
          ? "cutaway_support"
          : "hook_context";
  return {
    camera_size: input.shotType === "reaction" ? "cu" : "mcu",
    camera_motion: "hold",
    acting_intent: input.shotType === "reaction" ? "reaction_hold" : "steady_delivery",
    emotion_curve: input.shotType === "reaction" ? "accent" : "flat",
    primary_speaking_character: "host",
    required_view: requiredView,
    educational_intent: educationalIntent,
    insert_need: [],
    route_reason: input.renderMode === "deterministic" ? "character_focused_dialogue" : "smoke_sidecar_fixture"
  };
}

function buildDefaultSmokeActing(): Record<string, unknown> {
  return {
    blink_cues: [],
    gesture_cues: [],
    look_cues: [
      {
        f: 0,
        target: "viewer",
        intensity: 0.7
      }
    ],
    expression_cues: [
      {
        f: 0,
        expression: "neutral",
        intensity: 0.6
      }
    ],
    mouth_cues: [
      {
        f: 0,
        viseme: "mouth_closed",
        intensity: 0
      }
    ]
  };
}

function materializeRuntimeFixture(input: {
  fixturePath: string;
  outDir: string;
  expectedRenderersByMode: Record<string, string>;
  presetOverride: SmokePresetOverride;
  profileSelection: ReturnType<typeof resolveSmokeProfileSelection>;
}): string {
  const raw = JSON.parse(fs.readFileSync(input.fixturePath, "utf8")) as {
    episode?: Record<string, unknown>;
    shots?: Array<Record<string, unknown>>;
  };
  const shots = Array.isArray(raw.shots) ? raw.shots : [];
  const updated = {
    ...raw,
    episode: {
      ...(raw.episode ?? {}),
      profiles: {
        ...(typeof raw.episode?.profiles === "object" && raw.episode?.profiles !== null && !Array.isArray(raw.episode?.profiles)
          ? (raw.episode.profiles as Record<string, unknown>)
          : {}),
        ...input.profileSelection.selection
      }
    },
    shots: shots.map((shot) => {
      const renderMode = typeof shot.render_mode === "string" ? shot.render_mode.trim() : "deterministic";
      const shotType = typeof shot.shot_type === "string" ? shot.shot_type.trim() : "talk";
      if (renderMode === "deterministic") {
        return {
          ...shot,
          shot_grammar: shot.shot_grammar ?? buildDefaultSmokeShotGrammar({ renderMode, shotType }),
          acting: shot.acting ?? buildDefaultSmokeActing()
        };
      }
      const expectedRenderer = input.expectedRenderersByMode[renderMode] ?? null;
      const existingPreset =
        typeof shot.sidecar_preset === "object" && shot.sidecar_preset !== null && !Array.isArray(shot.sidecar_preset)
          ? (shot.sidecar_preset as Record<string, unknown>)
          : {};
      const policyTags = Array.isArray(existingPreset.policy_tags)
        ? existingPreset.policy_tags.filter((value): value is string => typeof value === "string")
        : [];
      const hasPresetOverride = Boolean(
        input.presetOverride.controlnetPreset || input.presetOverride.impactPreset || input.presetOverride.qcPreset
      );
      const sidecarPreset = hasPresetOverride
        ? {
            ...existingPreset,
            ...(input.presetOverride.controlnetPreset
              ? { controlnet_preset: input.presetOverride.controlnetPreset }
              : {}),
            ...(input.presetOverride.impactPreset ? { impact_preset: input.presetOverride.impactPreset } : {}),
            ...(input.presetOverride.qcPreset ? { qc_preset: input.presetOverride.qcPreset } : {}),
            preset_source: "smoke_override_v1",
            policy_tags: uniqueStrings([...policyTags, "smoke_override"]),
            preset_manifest_version: SIDECAR_PRESET_MANIFEST_VERSION
          }
        : shot.sidecar_preset;
      return {
        ...shot,
        ...(expectedRenderer ? { sidecar_renderer: expectedRenderer } : {}),
        ...(sidecarPreset ? { sidecar_preset: sidecarPreset } : {}),
        shot_grammar: shot.shot_grammar ?? buildDefaultSmokeShotGrammar({ renderMode, shotType }),
        acting: shot.acting ?? buildDefaultSmokeActing()
      };
    })
  };
  const runtimeFixturePath = path.join(input.outDir, "runtime_shots.json");
  writeJson(runtimeFixturePath, updated);
  return runtimeFixturePath;
}

function resolveSmokePaths() {
  const repoRoot = resolveRepoRoot();
  const fixtureArg = resolveArgValue("fixture");
  const outDirArg = resolveArgValue("out-dir");
  const smokeLabel = resolveArgValue("label")?.trim() || "video-broll";
  const fixturePath = fixtureArg
    ? resolveLocalPath(repoRoot, fixtureArg)
    : path.join(repoRoot, "scripts", "fixtures", "video_broll_smoke_shots.json");
  const outDir = outDirArg ? resolveLocalPath(repoRoot, outDirArg) : path.join(repoRoot, "out", "video_broll_smoke");
  const channelName = resolveArgValue("channel")?.trim() || `Video ${smokeLabel} Smoke`;
  const episodeTopic = resolveArgValue("topic")?.trim() || `Video ${smokeLabel} Smoke Episode`;
  const shotsDoc = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as {
    shots?: Array<{
      shot_id?: string;
      render_mode?: string;
    }>;
  };
  const sidecarShots: FixtureShotSummary[] = Array.isArray(shotsDoc.shots)
    ? shotsDoc.shots
        .map((shot, index) => ({
          shotId:
            typeof shot?.shot_id === "string" && shot.shot_id.trim().length > 0
              ? shot.shot_id.trim()
              : `shot_${index + 1}`,
          renderMode:
            typeof shot?.render_mode === "string" && shot.render_mode.trim().length > 0
              ? shot.render_mode.trim()
              : "deterministic"
        }))
        .filter((shot) => shot.renderMode !== "deterministic")
    : [];
  const primaryRenderMode = sidecarShots[0]?.renderMode ?? "generative_broll";
  const effectiveRenderer = resolveExpectedRendererForMode(primaryRenderMode);
  const expectedRenderersByMode = Object.fromEntries(
    [...new Set(sidecarShots.map((shot) => shot.renderMode))].map((renderMode) => [
      renderMode,
      resolveExpectedRendererForMode(renderMode)
    ])
  ) as Record<string, string>;
  return {
    repoRoot,
    fixturePath,
    outDir,
    smokeLabel,
    channelName,
    episodeTopic,
    sidecarShots,
    primaryRenderMode,
    effectiveRenderer,
    expectedRenderersByMode,
    outputPath: path.join(outDir, "render_episode.mp4"),
    srtPath: path.join(outDir, "render_episode.srt"),
    qcReportPath: path.join(outDir, "qc_report.json"),
    renderLogPath: path.join(outDir, "render_log.json"),
    sidecarPlanPath: path.join(outDir, "shot_sidecar_plan.json"),
    shotRenderModeReportPath: path.join(outDir, "shot_render_mode_report.json")
  };
}

async function logJob(jobId: string, level: string, message: string, details?: Prisma.InputJsonValue) {
  await prisma.jobLog.create({
    data: { jobId, level, message, details: details ?? undefined }
  });
}

async function findOrCreateChannel(userId: string) {
  const paths = resolveSmokePaths();
  const existing = await prisma.channel.findFirst({
    where: { userId, name: paths.channelName },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (existing) {
    return existing;
  }

  return prisma.channel.create({
    data: { userId, name: paths.channelName },
    select: { id: true }
  });
}

async function resolveSmokeChannel(userId: string) {
  if (SMOKE_CHARACTER_PACK_ID) {
    const existingPack = await prisma.characterPack.findUnique({
      where: { id: SMOKE_CHARACTER_PACK_ID },
      select: { channelId: true }
    });
    if (existingPack?.channelId) {
      return { id: existingPack.channelId };
    }
  }
  return findOrCreateChannel(userId);
}

async function createEpisode(channelId: string, characterPackId: string | null) {
  const paths = resolveSmokePaths();
  return prisma.episode.create({
    data: {
      channelId,
      topic: `${paths.episodeTopic} ${new Date().toISOString()}`,
      ...(characterPackId ? { characterPackId } : {})
    },
    select: { id: true }
  });
}

async function createRenderJob(episodeId: string) {
  const job = await prisma.job.create({
    data: {
      episodeId,
      type: "RENDER_FINAL",
      status: "QUEUED",
      progress: 0,
      maxAttempts: 1,
      retryBackoffMs: 1000
    }
  });

  await logJob(job.id, "info", "Transition -> QUEUED", {
    source: "smoke:video-broll"
  });

  return job;
}

async function addToQueue(job: Job, payload: EpisodeJobPayload) {
  const targetQueue = getEpisodeQueueForJobName(RENDER_EPISODE_JOB_NAME);
  const addOptions: JobsOptions = {
    jobId: job.id,
    attempts: job.maxAttempts,
    removeOnComplete: false,
    removeOnFail: false
  };

  try {
    return await targetQueue.add(RENDER_EPISODE_JOB_NAME, payload, addOptions);
  } catch (error) {
    const existing = await targetQueue.getJob(job.id);
    if (existing) {
      return existing;
    }
    throw error;
  }
}

async function waitForJobCompletion(jobId: string) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        progress: true,
        lastError: true,
        finishedAt: true
      }
    });
    if (!job) {
      throw new Error(`Job row disappeared: ${jobId}`);
    }
    if (job.status === "SUCCEEDED") {
      return job;
    }
    if (job.status === "FAILED" || job.status === "CANCELLED") {
      throw new Error(`Render job failed: ${job.lastError ?? job.status}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for video-broll smoke job: ${jobId}`);
}

async function main() {
  const paths = resolveSmokePaths();
  const presetOverride = resolveSmokePresetOverride();
  const profileSelection = resolveSmokeProfileSelection({ resolveArgValue });
  if (!fs.existsSync(paths.fixturePath)) {
    throw new Error(`Missing fixture: ${paths.fixturePath}`);
  }
  const resolvedCharacterPack = SMOKE_CHARACTER_PACK_ID
    ? await ensureSidecarSmokeCharacterPack({
        prisma,
        repoRoot: paths.repoRoot,
        requestedPackId: SMOKE_CHARACTER_PACK_ID,
        channelName: paths.channelName
      })
    : null;
  const effectiveCharacterPackId = resolvedCharacterPack?.characterPackId ?? null;
  const preflightResult = await runSidecarSmokePreflight({
    fixturePath: paths.fixturePath,
    characterPackId: effectiveCharacterPackId,
    renderer: resolveActiveSmokeRenderer(),
    requireCharacterPack: false,
    requireApprovedCharacterPack: true
  });

  if (!PRESERVE_SMOKE_OUT_DIR && fs.existsSync(paths.outDir)) {
    fs.rmSync(paths.outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(paths.outDir, { recursive: true });

  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: { name: TEST_USER_NAME },
    create: { email: TEST_USER_EMAIL, name: TEST_USER_NAME }
  });

  const channel = await resolveSmokeChannel(user.id);
  const registeredGeneratedPack = resolvedCharacterPack?.registeredGeneratedPack ?? null;
  const episode = await createEpisode(channel.id, effectiveCharacterPackId);
  const job = await createRenderJob(episode.id);
  activeJobId = job.id;
  const runtimeFixturePath = materializeRuntimeFixture({
    fixturePath: paths.fixturePath,
    outDir: paths.outDir,
    expectedRenderersByMode: paths.expectedRenderersByMode,
    presetOverride,
    profileSelection
  });

  const payload: EpisodeJobPayload = {
    jobDbId: job.id,
    episodeId: episode.id,
    schemaChecks: [],
    render: {
      shotsPath: runtimeFixturePath,
      outputPath: paths.outputPath,
      srtPath: paths.srtPath,
      qcReportPath: paths.qcReportPath,
      renderLogPath: paths.renderLogPath
    }
  };

  const bullJob = await addToQueue(job, payload);
  const bullmqJobId = String(bullJob.id);

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      bullmqJobId,
      lastError: null
    }
  });

  await logJob(job.id, "info", "Transition -> ENQUEUED", {
    source: "smoke:video-broll",
    bullmqJobId,
    shotsPath: runtimeFixturePath,
    outputPath: paths.outputPath,
    sidecarPlanPath: paths.sidecarPlanPath
  });

  await waitForJobCompletion(job.id);

  const sidecarPlan = JSON.parse(fs.readFileSync(paths.sidecarPlanPath, "utf8")) as {
    plans?: Array<{
      shotId?: string;
      renderMode?: string;
      renderer?: string;
      status?: string;
      metadata?: Record<string, unknown>;
    }>;
  };
  const sidecarEntries = Array.isArray(sidecarPlan.plans) ? sidecarPlan.plans : [];
  const sidecarEntry = sidecarEntries.length > 0 ? sidecarEntries[0] ?? null : null;
  const sidecarByShotId = new Map(
    sidecarEntries
      .filter(
        (
          entry
        ): entry is {
          shotId: string;
          renderMode?: string;
          renderer?: string;
          status?: string;
          metadata?: Record<string, unknown>;
          judge?: unknown;
          retakes?: unknown[];
        } => typeof entry?.shotId === "string"
      )
      .map((entry) => [entry.shotId, entry])
  );
  const sidecarArtifacts = paths.sidecarShots.map((expected) => {
    const plan = sidecarByShotId.get(expected.shotId) ?? null;
    const metadata = asRecord(plan?.metadata ?? null);
    const executionProfile = asRecord(metadata?.executionProfile ?? null);
    const qcEvaluation = asRecord(metadata?.qcEvaluation ?? null);
    const publicVideoSrc =
      typeof metadata?.publicVideoSrc === "string" && metadata.publicVideoSrc.trim().length > 0
        ? metadata.publicVideoSrc.trim()
        : null;
    const publicVideoPath = publicVideoSrc
      ? path.join(paths.repoRoot, "apps", "video", "public", ...publicVideoSrc.split("/"))
      : null;
    const judge =
      plan &&
      typeof plan.judge === "object" &&
      plan.judge !== null &&
      !Array.isArray(plan.judge)
        ? (plan.judge as Record<string, unknown>)
        : null;
    const retakes = plan && Array.isArray(plan.retakes) ? plan.retakes : [];
    const effectiveRetakeCount = deriveEffectiveRetakeCount(retakes);
    const judgeScore = resolveSidecarJudgeScore(metadata);
    const failureReason = resolveSidecarFailureReason({
      metadata,
      judge
    });
    const fallbackReason = resolveSidecarFallbackReason({
      metadata,
      judge
    });
    return {
      shot_id: expected.shotId,
      render_mode: expected.renderMode,
      expected_renderer: paths.expectedRenderersByMode[expected.renderMode] ?? "request-pack",
      backend:
        typeof metadata?.backendCapability === "string"
          ? metadata.backendCapability
          : typeof judge?.requestedBackend === "string"
            ? judge.requestedBackend
            : null,
      renderer: plan?.renderer ?? null,
      status: plan?.status ?? null,
      success: typeof metadata?.success === "boolean" ? metadata.success : plan?.status === "resolved",
      failure: failureReason,
      latency_ms: typeof metadata?.latencyMs === "number" ? metadata.latencyMs : null,
      duration_sec:
        typeof metadata?.outputDurationSeconds === "number" ? metadata.outputDurationSeconds : null,
      accepted: typeof judge?.accepted === "boolean" ? judge.accepted : null,
      judge_score: judgeScore,
      fallback_reason: fallbackReason,
      judge_decision: typeof judge?.decision === "string" ? judge.decision : null,
      judge_accepted: typeof judge?.accepted === "boolean" ? judge.accepted : null,
      requested_backend: typeof judge?.requestedBackend === "string" ? judge.requestedBackend : null,
      actual_backend: typeof judge?.actualBackendCapability === "string" ? judge.actualBackendCapability : null,
      retake_count: effectiveRetakeCount,
      public_video_src: publicVideoSrc,
      public_video_path: publicVideoPath,
      control_mode: typeof metadata?.controlMode === "string" ? metadata.controlMode : null,
      controlnet_preset: typeof metadata?.controlnetPreset === "string" ? metadata.controlnetPreset : null,
      impact_preset: typeof metadata?.impactPreset === "string" ? metadata.impactPreset : null,
      qc_preset: typeof metadata?.qcPreset === "string" ? metadata.qcPreset : null,
      preset_manifest_version:
        typeof metadata?.presetManifestVersion === "string" ? metadata.presetManifestVersion : null,
      preset_source: typeof metadata?.presetSource === "string" ? metadata.presetSource : null,
      preset_rollout_source: typeof metadata?.presetRolloutSource === "string" ? metadata.presetRolloutSource : null,
      preset_rollout_source_kind:
        metadata?.presetRolloutSourceKind === "file" || metadata?.presetRolloutSourceKind === "matrix"
          ? metadata.presetRolloutSourceKind
          : null,
      preset_rollout_scenario:
        typeof metadata?.presetRolloutScenario === "string" ? metadata.presetRolloutScenario : null,
      preset_rollout_score:
        typeof metadata?.presetRolloutScore === "number" ? metadata.presetRolloutScore : null,
      preset_rollout_verdict:
        typeof metadata?.presetRolloutVerdict === "string" ? metadata.presetRolloutVerdict : null,
      preset_rollout_target:
        metadata?.presetRolloutTarget === "overall" ||
        metadata?.presetRolloutTarget === "balanced" ||
        metadata?.presetRolloutTarget === "strict"
          ? metadata.presetRolloutTarget
          : null,
      preset_rollout_artifact_age_hours:
        typeof metadata?.presetRolloutArtifactAgeHours === "number" ? metadata.presetRolloutArtifactAgeHours : null,
      preset_rollout_channel_domain:
        metadata?.presetRolloutChannelDomain === "economy" || metadata?.presetRolloutChannelDomain === "medical"
          ? metadata.presetRolloutChannelDomain
          : null,
      preset_policy_tags: Array.isArray(metadata?.policyTags)
        ? metadata.policyTags.filter((value): value is string => typeof value === "string")
        : [],
      premium_candidate_judge_version:
        typeof metadata?.premiumCandidateJudgeVersion === "string" ? metadata.premiumCandidateJudgeVersion : null,
      premium_candidate_count:
        typeof metadata?.premiumCandidateCount === "number" ? metadata.premiumCandidateCount : null,
      premium_selected_candidate_id:
        typeof metadata?.premiumSelectedCandidateId === "string" ? metadata.premiumSelectedCandidateId : null,
      premium_selected_candidate_objective:
        typeof metadata?.premiumSelectedCandidateObjective === "string"
          ? metadata.premiumSelectedCandidateObjective
          : null,
      premium_selected_candidate_score:
        typeof metadata?.premiumSelectedCandidateScore === "number" ? metadata.premiumSelectedCandidateScore : null,
      premium_candidate_selection_reason:
        typeof metadata?.premiumCandidateSelectionReason === "string"
          ? metadata.premiumCandidateSelectionReason
          : null,
      premium_candidate_judge_path:
        typeof metadata?.premiumCandidateJudgePath === "string" ? metadata.premiumCandidateJudgePath : null,
      premium_selected_seed_override:
        typeof metadata?.premiumSelectedSeedOverride === "number" ? metadata.premiumSelectedSeedOverride : null,
      premium_actual_judge_version:
        typeof metadata?.premiumActualJudgeVersion === "string" ? metadata.premiumActualJudgeVersion : null,
      premium_actual_candidate_count:
        typeof metadata?.premiumActualCandidateCount === "number" ? metadata.premiumActualCandidateCount : null,
      premium_actual_selected_candidate_id:
        typeof metadata?.premiumActualSelectedCandidateId === "string" ? metadata.premiumActualSelectedCandidateId : null,
      premium_actual_selected_candidate_objective:
        typeof metadata?.premiumActualSelectedCandidateObjective === "string"
          ? metadata.premiumActualSelectedCandidateObjective
          : null,
      premium_actual_selected_candidate_score:
        typeof metadata?.premiumActualSelectedCandidateScore === "number" ? metadata.premiumActualSelectedCandidateScore : null,
      premium_actual_selection_reason:
        typeof metadata?.premiumActualSelectionReason === "string" ? metadata.premiumActualSelectionReason : null,
      premium_actual_judge_path:
        typeof metadata?.premiumActualJudgePath === "string" ? metadata.premiumActualJudgePath : null,
      premium_actual_judge_policy_version:
        typeof metadata?.premiumActualJudgePolicyVersion === "string" ? metadata.premiumActualJudgePolicyVersion : null,
      premium_actual_policy_accepted:
        typeof metadata?.premiumActualPolicyAccepted === "boolean" ? metadata.premiumActualPolicyAccepted : null,
      premium_actual_policy_rejection_reasons: Array.isArray(metadata?.premiumActualPolicyRejectionReasons)
        ? metadata.premiumActualPolicyRejectionReasons.filter((value): value is string => typeof value === "string")
        : [],
      premium_actual_retake_round:
        typeof metadata?.premiumActualRetakeRound === "number" ? metadata.premiumActualRetakeRound : null,
      premium_actual_retake_count:
        typeof metadata?.premiumActualRetakeCount === "number" ? metadata.premiumActualRetakeCount : null,
      premium_actual_visual_signal_mode:
        typeof metadata?.premiumActualVisualSignalMode === "string" ? metadata.premiumActualVisualSignalMode : null,
      premium_actual_visual_signal_score:
        typeof metadata?.premiumActualVisualSignalScore === "number" ? metadata.premiumActualVisualSignalScore : null,
      premium_actual_visual_signal_report_path:
        typeof metadata?.premiumActualVisualSignalReportPath === "string"
          ? metadata.premiumActualVisualSignalReportPath
          : null,
      premium_actual_face_stability_score:
        typeof metadata?.premiumActualFaceStabilityScore === "number" ? metadata.premiumActualFaceStabilityScore : null,
      premium_actual_motion_coherence_score:
        typeof metadata?.premiumActualMotionCoherenceScore === "number"
          ? metadata.premiumActualMotionCoherenceScore
          : null,
      premium_actual_silhouette_readability_score:
        typeof metadata?.premiumActualSilhouetteReadabilityScore === "number"
          ? metadata.premiumActualSilhouetteReadabilityScore
          : null,
      premium_actual_mascot_identity_preservation_score:
        typeof metadata?.premiumActualMascotIdentityPreservationScore === "number"
          ? metadata.premiumActualMascotIdentityPreservationScore
          : null,
      premium_actual_subtitle_safe_score:
        typeof metadata?.premiumActualSubtitleSafeScore === "number" ? metadata.premiumActualSubtitleSafeScore : null,
      premium_actual_chart_safe_score:
        typeof metadata?.premiumActualChartSafeScore === "number" ? metadata.premiumActualChartSafeScore : null,
      effective_use_clip_vision:
        typeof metadata?.effectiveUseClipVision === "boolean" ? metadata.effectiveUseClipVision : null,
      clip_vision_model_name:
        typeof metadata?.clipVisionModelName === "string" ? metadata.clipVisionModelName : null,
      preflight_warnings: Array.isArray(metadata?.preflightWarnings)
        ? metadata.preflightWarnings.filter((value): value is string => typeof value === "string")
        : [],
      resolution_profile: typeof metadata?.resolutionProfile === "string" ? metadata.resolutionProfile : null,
      step_profile: typeof metadata?.stepProfile === "string" ? metadata.stepProfile : null,
      cache_profile: typeof metadata?.cacheProfile === "string" ? metadata.cacheProfile : null,
      sr_profile: typeof metadata?.srProfile === "string" ? metadata.srProfile : null,
      workflow_binding: asRecord(metadata?.workflowBinding ?? null),
      execution_profile: executionProfile,
      qc_evaluation: qcEvaluation
    };
  });
  const publicVideoSrc = sidecarArtifacts[0]?.public_video_src ?? null;
  const publicVideoPath = sidecarArtifacts[0]?.public_video_path ?? null;

  const reportPath = path.join(paths.outDir, "smoke_report.json");
  writeJson(reportPath, {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    episode_id: episode.id,
    job_id: job.id,
    bullmq_job_id: bullmqJobId,
    fixture_path: paths.fixturePath,
    runtime_fixture_path: runtimeFixturePath,
    character_pack_id: effectiveCharacterPackId,
    requested_character_pack_id: SMOKE_CHARACTER_PACK_ID,
    preflight: preflightResult,
    preset_override: presetOverride,
    profile_selection: profileSelection.selection,
    profile_bundle: profileSelection.bundleName,
    resolved_profiles: {
      studio: profileSelection.resolvedProfiles.studio,
      channel: profileSelection.resolvedProfiles.channel,
      mascot: {
        id: profileSelection.resolvedProfiles.mascot.id,
        label: profileSelection.resolvedProfiles.mascot.label,
        species: profileSelection.resolvedProfiles.mascot.species
      },
      mascot_morph: profileSelection.resolvedProfiles.mascot_morph,
      mascot_acting: profileSelection.resolvedProfiles.mascot_acting,
      mascot_brand: profileSelection.resolvedProfiles.mascot_brand
    },
    resolved_character_pack: resolvedCharacterPack,
    registered_generated_pack: registeredGeneratedPack,
    output_path: paths.outputPath,
    qc_report_path: paths.qcReportPath,
    render_log_path: paths.renderLogPath,
    sidecar_plan_path: paths.sidecarPlanPath,
    shot_render_mode_report_path: paths.shotRenderModeReportPath,
    smoke_label: paths.smokeLabel,
    out_dir_cleaned: !PRESERVE_SMOKE_OUT_DIR,
    primary_render_mode: paths.primaryRenderMode,
    effective_video_sidecar_renderer: paths.effectiveRenderer,
    effective_video_broll_renderer: paths.effectiveRenderer,
    expected_renderers_by_mode: paths.expectedRenderersByMode,
    sidecar_shot_count: paths.sidecarShots.length,
    sidecar_plan_count: sidecarEntries.length,
    sidecar_fallback_count: sidecarArtifacts.filter((artifact) => artifact.judge_decision === "fallback").length,
    sidecar_retake_count: sidecarArtifacts.reduce((sum, artifact) => sum + artifact.retake_count, 0),
    sidecar_artifacts: sidecarArtifacts,
    public_video_src: publicVideoSrc,
    public_video_path: publicVideoPath,
    sidecar_status: sidecarEntry?.status ?? null,
    sidecar_renderer: sidecarEntry?.renderer ?? null
  });

  if (!fs.existsSync(paths.outputPath)) {
    throw new Error(`Missing render output: ${paths.outputPath}`);
  }
  if (!fs.existsSync(paths.sidecarPlanPath)) {
    throw new Error(`Missing sidecar plan: ${paths.sidecarPlanPath}`);
  }
  if (!fs.existsSync(paths.shotRenderModeReportPath)) {
    throw new Error(`Missing shot render mode report: ${paths.shotRenderModeReportPath}`);
  }
  if (sidecarEntries.length !== paths.sidecarShots.length) {
    throw new Error(`Expected ${paths.sidecarShots.length} sidecar plans, got ${sidecarEntries.length}`);
  }

  for (const artifact of sidecarArtifacts) {
    if (EXPECTED_SIDECAR_RENDERER && artifact.renderer !== EXPECTED_SIDECAR_RENDERER) {
      throw new Error(
        `Expected sidecar renderer ${EXPECTED_SIDECAR_RENDERER} for ${artifact.shot_id}, got ${artifact.renderer ?? "missing"}`
      );
    }
    const rendererMatchesExpected =
      Boolean(artifact.renderer) &&
      (artifact.renderer === artifact.expected_renderer ||
        (artifact.judge_decision === "fallback" &&
          typeof artifact.renderer === "string" &&
          (artifact.renderer.startsWith(`${artifact.expected_renderer} -> `) || artifact.renderer.length > 0)));
    if (!rendererMatchesExpected) {
      throw new Error(
        `Expected renderer ${artifact.expected_renderer} for ${artifact.shot_id}, got ${artifact.renderer ?? "missing"}`
      );
    }

    if (EXPECTED_SIDECAR_STATUS) {
      if (artifact.status !== EXPECTED_SIDECAR_STATUS) {
        throw new Error(
          `Expected sidecar status ${EXPECTED_SIDECAR_STATUS} for ${artifact.shot_id}, got ${artifact.status ?? "missing"}`
        );
      }
      if (EXPECTED_SIDECAR_STATUS === "resolved") {
        if (!artifact.public_video_src || !artifact.public_video_path || !fs.existsSync(artifact.public_video_path)) {
          throw new Error(`Expected resolved public sidecar video for ${artifact.shot_id}, but none was produced`);
        }
      }
      continue;
    }

    if (artifact.expected_renderer === "comfyui-wan-i2v" || artifact.expected_renderer === "generated-pack-still-video") {
      if (artifact.status !== "resolved") {
        throw new Error(
          `Expected resolved ${artifact.expected_renderer} sidecar plan for ${artifact.shot_id}, got ${artifact.status ?? "missing"}`
        );
      }
      if (!artifact.public_video_src || !artifact.public_video_path || !fs.existsSync(artifact.public_video_path)) {
        throw new Error(`Expected resolved public sidecar video for ${artifact.shot_id}, but none was produced`);
      }
    }
  }

  console.log("SMOKE VIDEO SIDECAR: PASS");
  console.log(`  episodeId=${episode.id}`);
  console.log(`  jobId=${job.id}`);
  console.log(`  label=${paths.smokeLabel}`);
  console.log(`  renderMode=${paths.primaryRenderMode}`);
  console.log(`  sidecarShots=${paths.sidecarShots.length}`);
  console.log(`  output=${paths.outputPath}`);
  console.log(`  sidecarPlan=${paths.sidecarPlanPath}`);
  console.log(`  publicVideoSrc=${publicVideoSrc ?? "(missing)"}`);
  console.log(`  smokeReport=${reportPath}`);
}

main()
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    console.error("SMOKE VIDEO SIDECAR: FAIL");
    console.error(`  reason=${message}`);
    processExitCode = 1;

    if (activeJobId) {
      await prisma.job.update({
        where: { id: activeJobId },
        data: {
          status: "FAILED",
          lastError: stack ?? message,
          finishedAt: new Date()
        }
      });

      await logJob(activeJobId, "error", "Transition -> FAILED", {
        source: "smoke:video-broll",
        error: message,
        stack
      });
    }
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closeEpisodeQueues();
    process.exit(processExitCode);
  });
