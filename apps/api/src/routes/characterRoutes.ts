import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { JobsOptions, Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import { sha256Hex, stableStringify } from "@ec/shared";
import type { EpisodeJobPayload } from "../services/scheduleService";

type JsonRecord = Record<string, unknown>;
type HttpError = Error & { statusCode: number; details?: unknown };

type CharacterAssetIds = {
  front: string;
  threeQuarter: string;
  profile: string;
};

type CharacterGenerationMode = "reference" | "new";
type CharacterGenerationProvider = "mock" | "comfyui";
type CharacterGeneratorStatus = "PENDING_HITL" | "AUTO_SELECTED";

type CharacterGenerationInput = {
  mode: CharacterGenerationMode;
  provider: CharacterGenerationProvider;
  promptPreset: string;
  positivePrompt?: string;
  negativePrompt?: string;
  referenceAssetId?: string;
  candidateCount: number;
  autoPick: boolean;
  requireHitlPick: boolean;
  seed: number;
  topic?: string;
  maxAttempts: number;
  retryBackoffMs: number;
};

type CharacterGenerationCreateResult = {
  characterPackId: string;
  version: number;
  episodeId: string;
  generateJobId: string;
  buildJobId: string;
  previewJobId: string;
  bullmqJobId: string;
  manifestPath: string;
  generatorStatus: CharacterGeneratorStatus;
};

type RegisterCharacterRoutesInput = {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue: Queue<EpisodeJobPayload>;
  queueName: string;
};

type CharacterCreateResult = {
  characterPackId: string;
  version: number;
  previewJobId: string;
  buildJobId: string;
  episodeId: string;
  bullmqJobId: string;
};

const BUILD_CHARACTER_PACK_JOB_NAME = "BUILD_CHARACTER_PACK";
const RENDER_CHARACTER_PREVIEW_JOB_NAME = "RENDER_CHARACTER_PREVIEW";
const GENERATE_CHARACTER_ASSETS_JOB_NAME = "GENERATE_CHARACTER_ASSETS";
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = 1000;
const MAX_LIST = 100;
const DEFAULT_GENERATION_SEED = 101;
const DEFAULT_PROMPT_PRESET = "eraser-cat-flat";
const DEMO_USER_EMAIL = "demo.extreme@example.com";
const DEMO_USER_NAME = "demo-extreme";
const DEMO_CHANNEL_NAME = "Extreme Demo Channel";
const CHARACTER_STYLE_PRESETS = [
  { id: "eraser-cat-flat", label: "Eraser Cat Flat" },
  { id: "playful-cartoon", label: "Playful Cartoon" },
  { id: "minimal-rig", label: "Minimal Rig" }
] as const;

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireBodyObject(body: unknown): JsonRecord {
  if (!isRecord(body)) {
    throw createHttpError(400, "Request body must be a JSON object");
  }
  return body;
}

function requireRouteParam(params: unknown, field: string): string {
  if (!isRecord(params)) {
    throw createHttpError(400, "Route params are invalid");
  }

  const value = params[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, `${field} path param must be a non-empty string`);
  }

  return value.trim();
}

function optionalString(obj: JsonRecord, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `${field} must be a string`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInt(value: unknown, field: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) {
      throw createHttpError(400, `${field} must be a positive integer`);
    }
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw createHttpError(400, `${field} must be a positive integer`);
    }
    return parsed;
  }

  throw createHttpError(400, `${field} must be a positive integer`);
}

function parseBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  throw createHttpError(400, `${field} must be a boolean`);
}

function getRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../../");
}

function getCharacterArtifacts(characterPackId: string): {
  outDir: string;
  packJsonPath: string;
  previewPath: string;
  qcReportPath: string;
} {
  const outDir = path.join(getRepoRoot(), "out", "characters", characterPackId);
  return {
    outDir,
    packJsonPath: path.join(outDir, "pack.json"),
    previewPath: path.join(outDir, "preview.mp4"),
    qcReportPath: path.join(outDir, "qc_report.json")
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function ensureDefaultChannel(prisma: PrismaClient): Promise<{ id: string }> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { name: DEMO_USER_NAME },
    create: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME }
  });

  const existing = await prisma.channel.findFirst({
    where: {
      userId: user.id,
      name: DEMO_CHANNEL_NAME
    },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return { id: existing.id };
  }

  const created = await prisma.channel.create({
    data: {
      userId: user.id,
      name: DEMO_CHANNEL_NAME
    }
  });

  return { id: created.id };
}

function escHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function uiBadge(status: string): string {
  const normalized = status.toUpperCase();
  if (["READY", "SUCCEEDED", "APPROVED", "PREVIEW_READY", "COMPLETED"].includes(normalized)) {
    return "ok";
  }
  if (["FAILED"].includes(normalized)) {
    return "bad";
  }
  if (["RUNNING", "PROCESSING", "QUEUED", "DRAFT", "GENERATING"].includes(normalized)) {
    return "warn";
  }
  return "muted";
}

function uiPage(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(
    title
  )}</title><style>body{margin:0;font-family:Segoe UI,Noto Sans KR,sans-serif;background:#f5f7fb;color:#1a2433}header{background:#fff;border-bottom:1px solid #d6deea;position:sticky;top:0}nav{max-width:1200px;margin:0 auto;padding:12px 18px;display:flex;gap:14px;align-items:center}nav strong{margin-right:auto}main{max-width:1200px;margin:18px auto;padding:0 18px;display:grid;gap:12px}.card{background:#fff;border:1px solid #d6deea;border-radius:12px;padding:14px}.notice{padding:9px;border-left:4px solid #2f7eed;background:#edf4ff}.error{padding:9px;border-left:4px solid #d92d20;background:#fff0ef}.grid{display:grid;gap:10px}.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}a{color:#0f5bd8;text-decoration:none}a:hover{text-decoration:underline}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #e3e8f1;padding:7px;text-align:left;vertical-align:top}.badge{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}.badge.ok{background:#eaf6ed;color:#1d7a34}.badge.warn{background:#fff8e8;color:#945f02}.badge.bad{background:#fff1ef;color:#b42318}.badge.muted{background:#f2f4f7;color:#475467}input,select,button,textarea{font:inherit;border:1px solid #ccd6e5;border-radius:8px;padding:7px 9px}button{background:#0f5bd8;color:#fff;border:none;font-weight:700;cursor:pointer}.secondary{background:#eef3fc;color:#143d6a;border:1px solid #cad8f2}pre{margin:0;background:#0b1220;color:#d3e1ff;padding:10px;border-radius:8px;overflow:auto;font-size:12px}</style></head><body><header><nav><strong>Eraser Cat Characters</strong><a href="/ui">Dashboard</a><a href="/ui/assets">Assets</a><a href="/ui/characters">Characters</a><a href="/ui/character-generator">Character Generator</a><a href="/ui/artifacts">Artifacts</a></nav></header><main>${body}</main></body></html>`;
}

function parseAssetIdsFromBody(body: JsonRecord): CharacterAssetIds {
  const nested = isRecord(body.assetIds) ? body.assetIds : undefined;

  const front =
    optionalString(body, "front") ??
    optionalString(body, "frontAssetId") ??
    (nested ? optionalString(nested, "front") : undefined);

  const threeQuarter =
    optionalString(body, "threeQuarter") ??
    optionalString(body, "threeQuarterAssetId") ??
    optionalString(body, "three_quarter") ??
    (nested ? optionalString(nested, "threeQuarter") : undefined);

  const profile =
    optionalString(body, "profile") ??
    optionalString(body, "profileAssetId") ??
    (nested ? optionalString(nested, "profile") : undefined);

  if (!front || !threeQuarter || !profile) {
    throw createHttpError(400, "assetIds.front, assetIds.threeQuarter, assetIds.profile are required");
  }

  return {
    front,
    threeQuarter,
    profile
  };
}

function buildPlaceholderPack(input: {
  packId: string;
  name: string;
  sourceImageRef: string;
}): Prisma.InputJsonValue {
  const pack = {
    schema_version: "1.0",
    pack_id: input.packId,
    meta: {
      name: input.name,
      created_at: new Date().toISOString(),
      source_image_ref: input.sourceImageRef,
      notes: "Placeholder before BUILD_CHARACTER_PACK completes"
    },
    canvas: {
      base_width: 1024,
      base_height: 1024,
      coord_space: "pixels"
    },
    assets: {
      images: {
        body_front: "shape://torso_front",
        upper_arm: "shape://upper_arm",
        lower_arm: "shape://lower_arm",
        paw: "shape://paw"
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
        { bone_id: "root", parent_id: "", rest: { x: 512, y: 736, rotation_deg: 0 } },
        { bone_id: "torso", parent_id: "root", rest: { x: 0, y: 0, rotation_deg: 0 } },
        {
          bone_id: "upper_arm",
          parent_id: "torso",
          rest: { x: 140, y: -108, rotation_deg: 16 },
          limits: { min_rotation_deg: -75, max_rotation_deg: 85 }
        },
        {
          bone_id: "lower_arm",
          parent_id: "upper_arm",
          rest: { x: 98, y: 0, rotation_deg: 14 },
          limits: { min_rotation_deg: -125, max_rotation_deg: 125 }
        }
      ],
      attachments: [
        {
          slot_id: "body",
          image_id: "body_front",
          bone_id: "torso",
          pivot: { px: 0.5, py: 0.8 },
          offset: { x: 0, y: -188 },
          scale: { x: 2.8, y: 3.2 },
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
    expressions: {},
    clips: [],
    ik_chains: [
      {
        chain_id: "arm_point",
        bones: ["upper_arm", "lower_arm"],
        effector_bone_id: "lower_arm",
        elbow_hint: "down",
        max_stretch: 1.12
      }
    ]
  };

  return toPrismaJson(pack);
}

function parseGenerationMode(value: unknown): CharacterGenerationMode {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "reference") {
      return "reference";
    }
    if (normalized === "new") {
      return "new";
    }
  }

  return "new";
}

function parseGenerationProvider(value: unknown): CharacterGenerationProvider {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "comfyui") {
      return "comfyui";
    }
    if (normalized === "mock") {
      return "mock";
    }
  }

  return process.env.COMFYUI_URL && process.env.COMFYUI_URL.trim().length > 0 ? "comfyui" : "mock";
}

function parsePromptPreset(value: unknown): string {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (CHARACTER_STYLE_PRESETS.some((preset) => preset.id === normalized)) {
      return normalized;
    }
  }

  return DEFAULT_PROMPT_PRESET;
}

function getGenerationManifestPath(generateJobId: string): string {
  return path.join(getRepoRoot(), "out", "characters", "generations", generateJobId, "generation_manifest.json");
}

function parseCharacterGenerationInput(body: JsonRecord): CharacterGenerationInput {
  const mode = parseGenerationMode(body.mode);
  const provider = parseGenerationProvider(body.provider);
  const promptPreset = parsePromptPreset(body.promptPreset);
  const positivePrompt = optionalString(body, "positivePrompt");
  const negativePrompt = optionalString(body, "negativePrompt");
  const referenceAssetId = optionalString(body, "referenceAssetId");
  const candidateCount = Math.min(parsePositiveInt(body.candidateCount, "candidateCount", 4), 8);
  const autoPick = parseBoolean(body.autoPick, "autoPick", true);
  const requireHitlPick = parseBoolean(body.requireHitlPick, "requireHitlPick", false);
  const seed = parsePositiveInt(body.seed, "seed", DEFAULT_GENERATION_SEED);
  const topic = optionalString(body, "topic");
  const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
  const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);

  if (mode === "reference" && !referenceAssetId) {
    throw createHttpError(400, "reference mode requires referenceAssetId");
  }

  return {
    mode,
    provider,
    promptPreset,
    ...(positivePrompt ? { positivePrompt } : {}),
    ...(negativePrompt ? { negativePrompt } : {}),
    ...(referenceAssetId ? { referenceAssetId } : {}),
    candidateCount,
    autoPick,
    requireHitlPick,
    seed,
    ...(topic ? { topic } : {}),
    maxAttempts,
    retryBackoffMs
  };
}

async function createCharacterGeneration(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    channelId?: string;
    generation: CharacterGenerationInput;
  }
): Promise<CharacterGenerationCreateResult> {
  const generation = input.generation;
  const fallbackChannel = input.channelId ? { id: input.channelId } : await ensureDefaultChannel(prisma);
  let channelId = fallbackChannel.id;

  if (generation.referenceAssetId) {
    const referenceAsset = await prisma.asset.findUnique({
      where: { id: generation.referenceAssetId },
      select: {
        id: true,
        channelId: true,
        status: true
      }
    });

    if (!referenceAsset) {
      throw createHttpError(404, `reference asset not found: ${generation.referenceAssetId}`);
    }

    if (referenceAsset.status !== "READY") {
      throw createHttpError(400, `reference asset is not READY: ${generation.referenceAssetId}`);
    }

    channelId = referenceAsset.channelId;
  }

  const latestVersion = await prisma.characterPack.findFirst({
    where: { channelId },
    orderBy: { version: "desc" },
    select: { version: true }
  });

  const version = (latestVersion?.version ?? 0) + 1;

  const txResult = await prisma.$transaction(async (tx) => {
    const tempPackId = `character_pack_${channelId}_${version}_${Date.now()}`;
    const placeholderPack = buildPlaceholderPack({
      packId: tempPackId,
      name: `Character Pack v${version}`,
      sourceImageRef:
        generation.mode === "reference" ? `reference:${generation.referenceAssetId}` : `preset:${generation.promptPreset}`
    });

    const placeholderHash = sha256Hex(
      stableStringify({
        tempPackId,
        version,
        createdAt: new Date().toISOString(),
        generation: {
          mode: generation.mode,
          provider: generation.provider,
          promptPreset: generation.promptPreset
        }
      })
    );

    const characterPack = await tx.characterPack.create({
      data: {
        channelId,
        version,
        status: "DRAFT",
        schemaId: "character_pack.schema.json",
        hash: placeholderHash,
        json: placeholderPack
      }
    });

    const episode = await tx.episode.create({
      data: {
        channelId,
        topic: generation.topic ?? `Character Generated Preview v${version}`,
        status: "GENERATING",
        targetDurationSec: 120,
        characterPackId: characterPack.id,
        characterPackVersion: version
      }
    });

    const previewJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: RENDER_CHARACTER_PREVIEW_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: generation.maxAttempts,
        retryBackoffMs: generation.retryBackoffMs
      }
    });

    const buildJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: BUILD_CHARACTER_PACK_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: generation.maxAttempts,
        retryBackoffMs: generation.retryBackoffMs
      }
    });

    const generateJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: GENERATE_CHARACTER_ASSETS_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: generation.maxAttempts,
        retryBackoffMs: generation.retryBackoffMs
      }
    });

    await tx.jobLog.createMany({
      data: [
        {
          jobId: generateJob.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: toPrismaJson({
            source: "api:character-generator:create",
            queueName,
            characterPackId: characterPack.id,
            version,
            generation
          })
        },
        {
          jobId: buildJob.id,
          level: "info",
          message: "Awaiting GENERATE_CHARACTER_ASSETS completion",
          details: toPrismaJson({
            source: "api:character-generator:create",
            parentJobType: GENERATE_CHARACTER_ASSETS_JOB_NAME,
            characterPackId: characterPack.id
          })
        },
        {
          jobId: previewJob.id,
          level: "info",
          message: "Awaiting BUILD_CHARACTER_PACK completion",
          details: toPrismaJson({
            source: "api:character-generator:create",
            parentJobType: BUILD_CHARACTER_PACK_JOB_NAME,
            characterPackId: characterPack.id
          })
        }
      ]
    });

    return {
      characterPack,
      episode,
      buildJob,
      previewJob,
      generateJob,
      version
    };
  });

  const manifestPath = getGenerationManifestPath(txResult.generateJob.id);
  const payload = {
    jobDbId: txResult.generateJob.id,
    episodeId: txResult.episode.id,
    schemaChecks: [],
    character: {
      characterPackId: txResult.characterPack.id,
      version: txResult.version,
      buildJobDbId: txResult.buildJob.id,
      previewJobDbId: txResult.previewJob.id,
      generation: {
        mode: generation.mode,
        provider: generation.provider,
        promptPreset: generation.promptPreset,
        positivePrompt: generation.positivePrompt,
        negativePrompt: generation.negativePrompt,
        referenceAssetId: generation.referenceAssetId,
        candidateCount: generation.candidateCount,
        autoPick: generation.autoPick,
        requireHitlPick: generation.requireHitlPick,
        seed: generation.seed,
        manifestPath
      }
    }
  } as unknown as EpisodeJobPayload;

  const queued = await enqueueWithIdempotency(
    queue,
    GENERATE_CHARACTER_ASSETS_JOB_NAME,
    payload,
    txResult.generateJob.maxAttempts,
    txResult.generateJob.retryBackoffMs
  );

  const bullmqJobId = String(queued.id);

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: txResult.generateJob.id },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await tx.jobLog.create({
      data: {
        jobId: txResult.generateJob.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:character-generator:create",
          queueName,
          bullmqJobId,
          manifestPath,
          characterPackId: txResult.characterPack.id
        })
      }
    });
  });

  return {
    characterPackId: txResult.characterPack.id,
    version: txResult.version,
    episodeId: txResult.episode.id,
    generateJobId: txResult.generateJob.id,
    buildJobId: txResult.buildJob.id,
    previewJobId: txResult.previewJob.id,
    bullmqJobId,
    manifestPath,
    generatorStatus: generation.requireHitlPick || !generation.autoPick ? "PENDING_HITL" : "AUTO_SELECTED"
  };
}

async function enqueueWithIdempotency(
  queue: Queue<EpisodeJobPayload>,
  name: string,
  payload: EpisodeJobPayload,
  maxAttempts: number,
  retryBackoffMs: number
) {
  const options: JobsOptions = {
    jobId: payload.jobDbId,
    attempts: maxAttempts,
    backoff: {
      type: "exponential",
      delay: retryBackoffMs
    },
    removeOnComplete: false,
    removeOnFail: false
  };

  try {
    return await queue.add(name, payload, options);
  } catch {
    const existing = await queue.getJob(payload.jobDbId);
    if (existing) {
      return existing;
    }
    throw createHttpError(503, "Redis unavailable");
  }
}

async function createCharacterPack(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    assetIds: CharacterAssetIds;
    topic?: string;
    maxAttempts: number;
    retryBackoffMs: number;
  }
): Promise<CharacterCreateResult> {
  const assetIds = input.assetIds;
  const requestedIds = [assetIds.front, assetIds.threeQuarter, assetIds.profile];

  const assets = await prisma.asset.findMany({
    where: {
      id: { in: requestedIds }
    },
    select: {
      id: true,
      channelId: true,
      status: true,
      normalizedKey1024: true,
      originalKey: true,
      createdAt: true
    }
  });

  if (assets.length !== 3) {
    throw createHttpError(404, "One or more assets were not found");
  }

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const id of requestedIds) {
    const asset = byId.get(id);
    if (!asset) {
      throw createHttpError(404, `Asset not found: ${id}`);
    }

    if (asset.status !== "READY") {
      throw createHttpError(400, `Asset is not READY: ${id}`);
    }
  }

  const channelId = assets[0].channelId;
  const sameChannel = assets.every((asset) => asset.channelId === channelId);
  if (!sameChannel) {
    throw createHttpError(400, "All assets must belong to the same channel");
  }

  const latestVersion = await prisma.characterPack.findFirst({
    where: { channelId },
    orderBy: { version: "desc" },
    select: { version: true }
  });

  const version = (latestVersion?.version ?? 0) + 1;

  const txResult = await prisma.$transaction(async (tx) => {
    const tempPackId = `character_pack_${channelId}_${version}_${Date.now()}`;
    const placeholderPack = buildPlaceholderPack({
      packId: tempPackId,
      name: `Character Pack v${version}`,
      sourceImageRef: `${assetIds.front},${assetIds.threeQuarter},${assetIds.profile}`
    });

    const placeholderHash = sha256Hex(
      stableStringify({
        tempPackId,
        version,
        createdAt: new Date().toISOString(),
        assets: assetIds
      })
    );

    const characterPack = await tx.characterPack.create({
      data: {
        channelId,
        version,
        status: "DRAFT",
        schemaId: "character_pack.schema.json",
        hash: placeholderHash,
        json: placeholderPack
      }
    });

    const episode = await tx.episode.create({
      data: {
        channelId,
        topic: input.topic ?? `Character Preview v${version}`,
        status: "GENERATING",
        targetDurationSec: 120,
        characterPackId: characterPack.id,
        characterPackVersion: version
      }
    });

    const previewJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: RENDER_CHARACTER_PREVIEW_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: input.maxAttempts,
        retryBackoffMs: input.retryBackoffMs
      }
    });

    const buildJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: BUILD_CHARACTER_PACK_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: input.maxAttempts,
        retryBackoffMs: input.retryBackoffMs
      }
    });

    await tx.jobLog.createMany({
      data: [
        {
          jobId: buildJob.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: toPrismaJson({
            source: "api:character-packs:create",
            queueName,
            characterPackId: characterPack.id,
            version,
            assetIds
          })
        },
        {
          jobId: previewJob.id,
          level: "info",
          message: "Awaiting BUILD_CHARACTER_PACK completion",
          details: toPrismaJson({
            source: "api:character-packs:create",
            parentJobType: BUILD_CHARACTER_PACK_JOB_NAME,
            characterPackId: characterPack.id,
            version
          })
        }
      ]
    });

    return {
      characterPack,
      episode,
      buildJob,
      previewJob,
      version
    };
  });

  const payload = {
    jobDbId: txResult.buildJob.id,
    episodeId: txResult.episode.id,
    schemaChecks: [],
    character: {
      characterPackId: txResult.characterPack.id,
      version: txResult.version,
      previewJobDbId: txResult.previewJob.id,
      assetIds
    }
  } as unknown as EpisodeJobPayload;

  const queued = await enqueueWithIdempotency(
    queue,
    BUILD_CHARACTER_PACK_JOB_NAME,
    payload,
    txResult.buildJob.maxAttempts,
    txResult.buildJob.retryBackoffMs
  );

  const bullmqJobId = String(queued.id);

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: txResult.buildJob.id },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await tx.jobLog.create({
      data: {
        jobId: txResult.buildJob.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:character-packs:create",
          queueName,
          bullmqJobId,
          characterPackId: txResult.characterPack.id,
          previewJobId: txResult.previewJob.id
        })
      }
    });
  });

  return {
    characterPackId: txResult.characterPack.id,
    version: txResult.version,
    previewJobId: txResult.previewJob.id,
    buildJobId: txResult.buildJob.id,
    episodeId: txResult.episode.id,
    bullmqJobId
  };
}

function toCharacterPackResponse(pack: {
  id: string;
  channelId: string;
  version: number;
  status: string;
  schemaId: string;
  hash: string;
  json: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  const artifacts = getCharacterArtifacts(pack.id);

  return {
    id: pack.id,
    channelId: pack.channelId,
    version: pack.version,
    status: pack.status,
    schemaId: pack.schemaId,
    hash: pack.hash,
    json: pack.json,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    artifacts: {
      outDir: artifacts.outDir,
      packJsonPath: artifacts.packJsonPath,
      previewPath: artifacts.previewPath,
      qcReportPath: artifacts.qcReportPath,
      packJsonExists: fs.existsSync(artifacts.packJsonPath),
      previewExists: fs.existsSync(artifacts.previewPath),
      qcReportExists: fs.existsSync(artifacts.qcReportPath),
      packJsonUrl: `/artifacts/characters/${encodeURIComponent(pack.id)}/pack.json`,
      previewUrl: `/artifacts/characters/${encodeURIComponent(pack.id)}/preview.mp4`,
      qcReportUrl: `/artifacts/characters/${encodeURIComponent(pack.id)}/qc_report.json`
    }
  };
}

export function registerCharacterRoutes(input: RegisterCharacterRoutesInput): void {
  const { app, prisma, queue, queueName } = input;

  app.get("/api/character-packs", async (request) => {
    const query = isRecord(request.query) ? request.query : {};
    const limit = Math.min(parsePositiveInt(query.limit, "limit", 30), MAX_LIST);

    const packs = await prisma.characterPack.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        episodes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            topic: true,
            status: true,
            createdAt: true
          }
        }
      }
    });

    return {
      data: packs.map((pack) => ({
        ...toCharacterPackResponse(pack),
        latestEpisode: pack.episodes[0] ?? null
      }))
    };
  });

  app.get("/api/character-packs/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");

    const pack = await prisma.characterPack.findUnique({
      where: { id },
      include: {
        episodes: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            jobs: {
              orderBy: { createdAt: "desc" },
              take: 20,
              include: {
                logs: {
                  orderBy: { createdAt: "asc" },
                  take: 50
                }
              }
            }
          }
        }
      }
    });

    if (!pack) {
      throw createHttpError(404, "Character pack not found");
    }

    return {
      data: {
        ...toCharacterPackResponse(pack),
        episodes: pack.episodes
      }
    };
  });

  app.post("/api/character-packs/create", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const assetIds = parseAssetIdsFromBody(body);
    const topic = optionalString(body, "topic");
    const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
    const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);

    const created = await createCharacterPack(prisma, queue, queueName, {
      assetIds,
      topic,
      maxAttempts,
      retryBackoffMs
    });

    return reply.code(201).send({
      data: {
        characterPackId: created.characterPackId,
        version: created.version,
        previewJobId: created.previewJobId,
        buildJobId: created.buildJobId,
        episodeId: created.episodeId,
        bullmqJobId: created.bullmqJobId
      }
    });
  });

  app.post("/api/character-generator/generate", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const channelId = optionalString(body, "channelId");
    const generation = parseCharacterGenerationInput(body);

    const created = await createCharacterGeneration(prisma, queue, queueName, {
      ...(channelId ? { channelId } : {}),
      generation
    });

    return reply.code(201).send({
      data: created
    });
  });

  app.get("/ui/character-generator", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const message = optionalString(query, "message");
    const error = optionalString(query, "error");
    const selectedJobId = optionalString(query, "jobId");

    const [jobs, referenceAssets] = await Promise.all([
      prisma.job.findMany({
        where: { type: GENERATE_CHARACTER_ASSETS_JOB_NAME },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          episode: {
            select: {
              id: true,
              topic: true,
              status: true,
              characterPackId: true
            }
          },
          logs: {
            orderBy: { createdAt: "desc" },
            take: 10
          }
        }
      }),
      prisma.asset.findMany({
        where: {
          status: "READY",
          assetType: "CHARACTER_REFERENCE"
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          channelId: true,
          createdAt: true
        }
      })
    ]);

    const selectedJob = selectedJobId ? jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null : jobs[0] ?? null;
    const selectedManifestPath = (() => {
      if (!selectedJob) {
        return null;
      }
      const log = selectedJob.logs.find((row) => row.message.includes("ENQUEUED") || row.message.includes("generated"));
      if (!log || !isRecord(log.details)) {
        return null;
      }
      const value = log.details.manifestPath;
      return typeof value === "string" && value.trim().length > 0 ? value : null;
    })();

    const selectedManifest = selectedManifestPath && fs.existsSync(selectedManifestPath)
      ? JSON.parse(fs.readFileSync(selectedManifestPath, "utf8"))
      : null;

    const styleOptions = CHARACTER_STYLE_PRESETS.map((preset) => `<option value="${escHtml(preset.id)}">${escHtml(preset.label)}</option>`).join("");
    const referenceOptions = referenceAssets
      .map(
        (asset) =>
          `<option value="${escHtml(asset.id)}">${escHtml(asset.id)} (channel=${escHtml(asset.channelId)}, ${escHtml(
            asset.createdAt.toLocaleString("ko-KR", { hour12: false })
          )})</option>`
      )
      .join("");

    const rows = jobs
      .map((job) => {
        const manifestGuess = getGenerationManifestPath(job.id);
        const manifestExists = fs.existsSync(manifestGuess);
        return `<tr><td><a href="/ui/character-generator?jobId=${encodeURIComponent(job.id)}">${escHtml(job.id)}</a></td><td>${escHtml(
          job.episodeId
        )}</td><td>${job.episode ? `<a href="/ui/episodes/${escHtml(job.episode.id)}">${escHtml(job.episode.topic)}</a>` : "-"}</td><td><span class="badge ${uiBadge(
          job.status
        )}">${escHtml(job.status)}</span></td><td>${escHtml(job.progress)}%</td><td>${
          manifestExists
            ? `<a href="/artifacts/characters/generations/${encodeURIComponent(job.id)}/generation_manifest.json">manifest</a>`
            : "-"
        }</td><td>${escHtml(job.createdAt.toLocaleString("ko-KR", { hour12: false }))}</td></tr>`;
      })
      .join("");

    const selectedSection = selectedJob
      ? `<section class="card"><h2>Selected Generation Job</h2><p>jobId: <strong>${escHtml(
          selectedJob.id
        )}</strong></p><p>status: <span class="badge ${uiBadge(selectedJob.status)}">${escHtml(
          selectedJob.status
        )}</span></p><p>episode: <a href="/ui/episodes/${escHtml(selectedJob.episodeId)}">${escHtml(
          selectedJob.episodeId
        )}</a></p><p>manifest path: <code>${escHtml(selectedManifestPath ?? "not generated yet")}</code></p><pre>${escHtml(
          JSON.stringify(selectedManifest ?? null, null, 2)
        )}</pre></section>`
      : "";

    const html = `<section class="card"><h1>Character Generator</h1>${
      message ? `<div class="notice">${escHtml(message)}</div>` : ""
    }${error ? `<div class="error">${escHtml(error)}</div>` : ""}<form method="post" action="/ui/character-generator/create" class="grid"><div class="grid two"><label>mode<select name="mode"><option value="new">new</option><option value="reference">reference</option></select></label><label>provider<select name="provider"><option value="mock">mock</option><option value="comfyui">comfyui (optional)</option></select></label><label>promptPreset<select name="promptPreset">${styleOptions}</select></label><label>topic(optional)<input name="topic" placeholder="Character Generator Demo"/></label><label>positivePrompt(optional)<textarea name="positivePrompt" rows="2" placeholder="orange cat mascot, friendly style"></textarea></label><label>negativePrompt(optional)<textarea name="negativePrompt" rows="2" placeholder="text, watermark, busy background"></textarea></label><label>referenceAssetId(reference mode)<select name="referenceAssetId"><option value=\"\">(none)</option>${referenceOptions}</select></label><label>candidateCount<input name="candidateCount" value="4"/></label><label>seed<input name="seed" value="${DEFAULT_GENERATION_SEED}"/></label><label>autoPick<select name="autoPick"><option value="true">true</option><option value="false">false</option></select></label><label>requireHitlPick<select name="requireHitlPick"><option value="false">false</option><option value="true">true</option></select></label></div><button type="submit">Generate Character Assets</button></form></section>${selectedSection}<section class=\"card\"><h2>Recent Generation Jobs</h2><table><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Status</th><th>Progress</th><th>Manifest</th><th>Created</th></tr></thead><tbody>${
      rows || '<tr><td colspan="7">No generation jobs</td></tr>'
    }</tbody></table></section>`;

    return reply.type("text/html; charset=utf-8").send(uiPage("Character Generator", html));
  });

  app.post("/ui/character-generator/create", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};

    try {
      const generation = parseCharacterGenerationInput(body);
      const channelId = optionalString(body, "channelId");
      const created = await createCharacterGeneration(prisma, queue, queueName, {
        ...(channelId ? { channelId } : {}),
        generation
      });

      return reply.redirect(
        `/ui/character-generator?jobId=${encodeURIComponent(created.generateJobId)}&message=${encodeURIComponent(
          `Enqueued ${GENERATE_CHARACTER_ASSETS_JOB_NAME} for episode ${created.episodeId}`
        )}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.get("/ui/characters", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const selectedPackId = optionalString(query, "characterPackId");
    const message = optionalString(query, "message");
    const error = optionalString(query, "error");

    const [readyAssets, packs] = await Promise.all([
      prisma.asset.findMany({
        where: {
          status: "READY",
          assetType: { in: ["CHARACTER_REFERENCE", "CHARACTER_VIEW"] }
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          assetType: true,
          channelId: true,
          createdAt: true
        }
      }),
      prisma.characterPack.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          episodes: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              topic: true,
              status: true,
              createdAt: true
            }
          }
        }
      })
    ]);

    const selectedPackLookupId = selectedPackId ?? packs[0]?.id;
    const selectedPack = selectedPackLookupId
      ? await prisma.characterPack.findUnique({
          where: { id: selectedPackLookupId },
          include: {
            episodes: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                jobs: {
                  orderBy: { createdAt: "desc" },
                  take: 20
                }
              }
            }
          }
        })
      : null;

    const selectedArtifacts = selectedPack ? getCharacterArtifacts(selectedPack.id) : null;

    const assetOptions = readyAssets
      .map(
        (asset) =>
          `<option value="${escHtml(asset.id)}">${escHtml(asset.id)} (${escHtml(
            asset.assetType ?? "-"
          )}, channel=${escHtml(asset.channelId)})</option>`
      )
      .join("");

    const packRows = packs
      .map((pack) => {
        const episode = pack.episodes[0];
        const artifacts = getCharacterArtifacts(pack.id);
        return `<tr><td><a href="/ui/characters?characterPackId=${encodeURIComponent(pack.id)}">${escHtml(
          pack.id
        )}</a></td><td>${escHtml(pack.version)}</td><td><span class="badge ${uiBadge(pack.status)}">${escHtml(
          pack.status
        )}</span></td><td>${episode ? `<a href="/ui/episodes/${escHtml(episode.id)}">${escHtml(episode.topic)}</a>` : "-"}</td><td>${
          fs.existsSync(artifacts.previewPath)
            ? `<a href="/artifacts/characters/${encodeURIComponent(pack.id)}/preview.mp4">preview.mp4</a>`
            : "-"
        }</td><td>${escHtml(pack.createdAt.toLocaleString("ko-KR", { hour12: false }))}</td></tr>`;
      })
      .join("");

    const selectedJobs =
      selectedPack && selectedPack.episodes[0]
        ? selectedPack.episodes[0].jobs
            .map(
              (job) =>
                `<tr><td><a href="/ui/jobs/${escHtml(job.id)}">${escHtml(job.id)}</a></td><td>${escHtml(job.type)}</td><td><span class="badge ${uiBadge(
                  job.status
                )}">${escHtml(job.status)}</span></td><td>${escHtml(job.progress)}%</td><td>${escHtml(
                  job.createdAt.toLocaleString("ko-KR", { hour12: false })
                )}</td></tr>`
            )
            .join("")
        : "";

    const selectedSection = selectedPack
      ? `<section class="card"><h2>Selected Pack</h2><p>id: <strong>${escHtml(selectedPack.id)}</strong></p><p>version: <strong>${escHtml(
          selectedPack.version
        )}</strong></p><p>status: <span class="badge ${uiBadge(selectedPack.status)}">${escHtml(
          selectedPack.status
        )}</span></p><div class="grid two"><div><p><a href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/pack.json">pack.json</a> ${
          selectedArtifacts && fs.existsSync(selectedArtifacts.packJsonPath) ? "(exists)" : "(missing)"
        }</p><p><a href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/preview.mp4">preview.mp4</a> ${
          selectedArtifacts && fs.existsSync(selectedArtifacts.previewPath) ? "(exists)" : "(missing)"
        }</p><p><a href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/qc_report.json">qc_report.json</a> ${
          selectedArtifacts && fs.existsSync(selectedArtifacts.qcReportPath) ? "(exists)" : "(missing)"
        }</p></div><div><p>episode: ${
          selectedPack.episodes[0]
            ? `<a href="/ui/episodes/${escHtml(selectedPack.episodes[0].id)}">${escHtml(selectedPack.episodes[0].id)}</a>`
            : "-"
        }</p></div></div><pre>${escHtml(JSON.stringify(selectedPack.json, null, 2))}</pre></section><section class="card"><h2>Selected Pack Jobs</h2><table><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead><tbody>${
          selectedJobs || '<tr><td colspan="5">No jobs</td></tr>'
        }</tbody></table></section>`
      : "";

    const html = `<section class="card"><h1>Character Packs</h1>${
      message ? `<div class="notice">${escHtml(message)}</div>` : ""
    }${error ? `<div class="error">${escHtml(error)}</div>` : ""}<form method="post" action="/ui/characters/create" class="grid"><div class="grid two"><label>front asset<select name="front" required>${
      assetOptions || '<option value="">No READY assets</option>'
    }</select></label><label>threeQuarter asset<select name="threeQuarter" required>${
      assetOptions || '<option value="">No READY assets</option>'
    }</select></label><label>profile asset<select name="profile" required>${
      assetOptions || '<option value="">No READY assets</option>'
    }</select></label><label>topic(optional)<input name="topic" placeholder="Character Preview"/></label></div><button type="submit">Create Character Pack + Enqueue Preview</button></form></section>${selectedSection}<section class="card"><h2>Recent Character Packs</h2><table><thead><tr><th>ID</th><th>Version</th><th>Status</th><th>Episode</th><th>Preview</th><th>Created</th></tr></thead><tbody>${
      packRows || '<tr><td colspan="6">No character packs</td></tr>'
    }</tbody></table></section>`;

    return reply.type("text/html; charset=utf-8").send(uiPage("Character Packs", html));
  });

  app.post("/ui/characters/create", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};

    try {
      const assetIds = parseAssetIdsFromBody(body);
      const topic = optionalString(body, "topic");
      const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
      const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);

      const created = await createCharacterPack(prisma, queue, queueName, {
        assetIds,
        topic,
        maxAttempts,
        retryBackoffMs
      });

      return reply.redirect(
        `/ui/characters?characterPackId=${encodeURIComponent(created.characterPackId)}&message=${encodeURIComponent(
          `Created pack ${created.characterPackId} and enqueued ${BUILD_CHARACTER_PACK_JOB_NAME}`
        )}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      if (statusCode >= 500) {
        app.log.error(error);
      }

      return reply.redirect(`/ui/characters?error=${encodeURIComponent(message)}`);
    }
  });
}
