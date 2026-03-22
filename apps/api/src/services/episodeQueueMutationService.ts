import type { Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { EpisodeJobPayload, PipelineOptions } from "@ec/shared";
import { enqueueWithResilience } from "./enqueueWithResilience";

type JsonRecord = Record<string, unknown>;
type HttpError = Error & { statusCode: number; details?: unknown };

export type EpisodeStyleConfig = {
  stylePresetId: string;
  hookBoost: number;
};

export type EnqueueEpisodeJobType =
  | "GENERATE_BEATS"
  | "COMPILE_SHOTS"
  | "RENDER_PREVIEW"
  | "RENDER_FINAL"
  | "PACKAGE_OUTPUTS";

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = 1000;
const AUTO_STYLE_PRESET_ID = "AUTO";
const STYLE_PRESET_VALUES = [
  "NEWS_CLEAN",
  "DOCU_CALM",
  "FINANCE_TRADER",
  "TIKTOK_PUNCH",
  "WHITEBOARD_EXPLAIN",
  "COMIC_POP",
  "RETRO_VHS",
  "CINEMATIC_DRAMA",
  "COZY_STUDY",
  "GAME_HUD",
  "CORPORATE_DECK",
  "CHAOS_ENERGY"
] as const;
const ENQUEUE_JOB_TYPES: readonly EnqueueEpisodeJobType[] = [
  "GENERATE_BEATS",
  "COMPILE_SHOTS",
  "RENDER_PREVIEW",
  "RENDER_FINAL",
  "PACKAGE_OUTPUTS"
] as const;
const DEMO_USER_EMAIL = "demo.extreme@example.com";
const DEMO_USER_NAME = "demo-extreme";
const DEMO_CHANNEL_NAME = "Extreme Demo Channel";

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function parsePositiveInt(value: unknown, field: string, fallback: number): number {
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

export function parseBoolean(value: unknown, fallback = false): boolean {
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

  return fallback;
}

export function parseStringArray(value: unknown, field: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    const out = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
    return Array.from(new Set(out));
  }

  if (typeof value === "string") {
    const out = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return Array.from(new Set(out));
  }

  throw createHttpError(400, `${field} must be an array or comma-separated string`);
}

export function normalizeStylePresetId(value: unknown, fallback = AUTO_STYLE_PRESET_ID): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    throw createHttpError(
      400,
      `stylePresetId must be one of: ${AUTO_STYLE_PRESET_ID}, ${STYLE_PRESET_VALUES.join(", ")}`
    );
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === AUTO_STYLE_PRESET_ID) {
    return AUTO_STYLE_PRESET_ID;
  }

  const found = STYLE_PRESET_VALUES.find((item) => item === normalized);
  if (!found) {
    throw createHttpError(
      400,
      `stylePresetId must be one of: ${AUTO_STYLE_PRESET_ID}, ${STYLE_PRESET_VALUES.join(", ")}`
    );
  }

  return found;
}

export function parseHookBoost(value: unknown, fallback = 0.55): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  let parsed: number | null = null;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric)) {
      parsed = numeric;
    }
  }

  if (parsed === null) {
    throw createHttpError(400, "hookBoost must be a number between 0 and 1");
  }

  return clamp(parsed, 0, 1);
}

export function readEpisodeStyleFromSnapshot(snapshot: unknown): EpisodeStyleConfig {
  if (!isRecord(snapshot) || !isRecord(snapshot.style)) {
    return {
      stylePresetId: AUTO_STYLE_PRESET_ID,
      hookBoost: 0.55
    };
  }

  const style = snapshot.style;
  return {
    stylePresetId: normalizeStylePresetId(style.stylePresetId, AUTO_STYLE_PRESET_ID),
    hookBoost: parseHookBoost(style.hookBoost, 0.55)
  };
}

export function resolveEpisodeStyleConfig(body: JsonRecord, fallback: EpisodeStyleConfig): EpisodeStyleConfig {
  return {
    stylePresetId: normalizeStylePresetId(body.stylePresetId, fallback.stylePresetId),
    hookBoost: parseHookBoost(body.hookBoost, fallback.hookBoost)
  };
}

function requireTopic(body: JsonRecord): string {
  const raw = body.topic;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw createHttpError(400, "topic is required");
  }
  return raw.trim();
}

export function requireEpisodeJobType(value: unknown): EnqueueEpisodeJobType {
  if (typeof value !== "string") {
    throw createHttpError(400, "jobType is required");
  }

  const normalized = value.trim().toUpperCase();
  const found = ENQUEUE_JOB_TYPES.find((item) => item === normalized);
  if (!found) {
    throw createHttpError(400, `jobType must be one of: ${ENQUEUE_JOB_TYPES.join(", ")}`);
  }

  return found;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function normalizePipelineOptions(value: unknown): PipelineOptions | undefined {
  return isRecord(value) ? (value as unknown as PipelineOptions) : undefined;
}

function mergePipelineOptions(
  pipeline: PipelineOptions | undefined,
  style: EpisodeStyleConfig
): PipelineOptions | undefined {
  const merged: PipelineOptions = {
    ...(pipeline ?? {}),
    story: {
      ...(pipeline?.story ?? {}),
      stylePresetId: style.stylePresetId,
      hookBoost: style.hookBoost
    }
  };
  return merged;
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

export async function createEpisodeWithInitialJob(input: {
  prisma: PrismaClient;
  queue: Queue;
  queueName: string;
  body: JsonRecord;
}) {
  const topic = requireTopic(input.body);
  const targetDurationSec = parsePositiveInt(input.body.targetDurationSec, "targetDurationSec", 600);
  const maxAttempts = parsePositiveInt(input.body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
  const jobType =
    input.body.jobType === undefined ? "GENERATE_BEATS" : requireEpisodeJobType(input.body.jobType);
  const styleConfig = resolveEpisodeStyleConfig(input.body, {
    stylePresetId: AUTO_STYLE_PRESET_ID,
    hookBoost: 0.55
  });
  const requestedChannelId =
    typeof input.body.channelId === "string" && input.body.channelId.trim().length > 0
      ? input.body.channelId.trim()
      : undefined;
  const channelId = requestedChannelId ?? (await ensureDefaultChannel(input.prisma)).id;
  const pipeline = mergePipelineOptions(normalizePipelineOptions(input.body.pipeline), styleConfig);

  const characterPackId =
    typeof input.body.characterPackId === "string" && input.body.characterPackId.trim().length > 0
      ? input.body.characterPackId.trim()
      : undefined;
  let characterPackVersion: number | undefined;
  if (characterPackId) {
    const pack = await input.prisma.characterPack.findUnique({
      where: { id: characterPackId },
      select: { id: true, version: true }
    });
    if (!pack) {
      throw createHttpError(400, `characterPackId not found: ${characterPackId}`);
    }
    characterPackVersion = pack.version;
  }

  const episode = await input.prisma.episode.create({
    data: {
      channelId,
      topic,
      targetDurationSec,
      ...(characterPackId ? { characterPackId } : {}),
      ...(typeof characterPackVersion === "number" ? { characterPackVersion } : {}),
      datasetVersionSnapshot: toPrismaJson({
        style: styleConfig
      })
    }
  });

  const job = await input.prisma.job.create({
    data: {
      episodeId: episode.id,
      type: jobType,
      status: "QUEUED",
      progress: 0,
      maxAttempts,
      retryBackoffMs: DEFAULT_RETRY_BACKOFF_MS
    }
  });

  await input.prisma.jobLog.create({
    data: {
      jobId: job.id,
      level: "info",
      message: "Transition -> QUEUED",
      details: toPrismaJson({
        source: "mutation:episodes:create",
        queueName: input.queueName,
        maxAttempts,
        stylePresetId: styleConfig.stylePresetId,
        hookBoost: styleConfig.hookBoost
      })
    }
  });

  const payload: EpisodeJobPayload = {
    jobDbId: job.id,
    episodeId: episode.id,
    schemaChecks: [],
    ...(pipeline ? { pipeline } : {})
  };

  const enqueueResult = await enqueueWithResilience({
    queue: input.queue,
    name: jobType,
    payload,
    maxAttempts,
    backoffMs: DEFAULT_RETRY_BACKOFF_MS,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);
  const updatedJob = await input.prisma.job.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      bullmqJobId,
      lastError: null,
      finishedAt: null
    }
  });

  await input.prisma.jobLog.create({
    data: {
      jobId: job.id,
      level: "info",
      message: "Transition -> ENQUEUED",
      details: toPrismaJson({
        source: "mutation:episodes:create",
        queueName: input.queueName,
        bullmqJobId,
        enqueueMode: enqueueResult.mode,
        enqueueAttemptCount: enqueueResult.attemptCount,
        enqueueErrorSummary: enqueueResult.errorSummary
      })
    }
  });

  return {
    episode,
    job: updatedJob,
    queue: {
      queueName: input.queueName,
      bullmqJobId
    }
  };
}

export async function enqueueEpisodeJob(input: {
  prisma: PrismaClient;
  queue: Queue;
  queueName: string;
  episodeId: string;
  body: JsonRecord;
}) {
  const episode = await input.prisma.episode.findUnique({ where: { id: input.episodeId } });
  if (!episode) {
    throw createHttpError(404, "Episode not found");
  }

  const jobType =
    input.body.jobType === undefined ? "COMPILE_SHOTS" : requireEpisodeJobType(input.body.jobType);
  const maxAttempts = parsePositiveInt(input.body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
  const retryBackoffMs = parsePositiveInt(
    input.body.retryBackoffMs,
    "retryBackoffMs",
    DEFAULT_RETRY_BACKOFF_MS
  );
  const failedShotIds = parseStringArray(input.body.failedShotIds, "failedShotIds");
  const dryRun = parseBoolean(input.body.dryRun, false);
  const baseStyleConfig = readEpisodeStyleFromSnapshot(episode.datasetVersionSnapshot);
  const styleConfig = resolveEpisodeStyleConfig(input.body, baseStyleConfig);
  const pipeline = mergePipelineOptions(normalizePipelineOptions(input.body.pipeline), styleConfig);
  const hasStyleOverrides = input.body.stylePresetId !== undefined || input.body.hookBoost !== undefined;

  if (hasStyleOverrides) {
    const currentSnapshot =
      typeof episode.datasetVersionSnapshot === "object" &&
      episode.datasetVersionSnapshot !== null &&
      !Array.isArray(episode.datasetVersionSnapshot)
        ? (episode.datasetVersionSnapshot as Record<string, unknown>)
        : {};
    await input.prisma.episode.update({
      where: { id: input.episodeId },
      data: {
        datasetVersionSnapshot: toPrismaJson({
          ...currentSnapshot,
          style: styleConfig
        })
      }
    });
  }

  const job = await input.prisma.job.create({
    data: {
      episodeId: input.episodeId,
      type: jobType,
      status: "QUEUED",
      progress: 0,
      maxAttempts,
      retryBackoffMs
    }
  });

  await input.prisma.jobLog.create({
    data: {
      jobId: job.id,
      level: "info",
      message: "Transition -> QUEUED",
      details: toPrismaJson({
        source: "mutation:episodes:enqueue",
        queueName: input.queueName,
        maxAttempts,
        retryBackoffMs,
        jobType,
        stylePresetId: styleConfig.stylePresetId,
        hookBoost: styleConfig.hookBoost
      })
    }
  });

  const payload: EpisodeJobPayload = {
    jobDbId: job.id,
    episodeId: input.episodeId,
    schemaChecks: [],
    ...(pipeline ? { pipeline } : {})
  };

  if (jobType === "RENDER_PREVIEW" || jobType === "RENDER_FINAL") {
    payload.render = {
      rerenderFailedShotsOnly: failedShotIds.length > 0,
      ...(failedShotIds.length > 0 ? { failedShotIds } : {}),
      dryRun
    };
  }

  const enqueueResult = await enqueueWithResilience({
    queue: input.queue,
    name: jobType,
    payload,
    maxAttempts,
    backoffMs: retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);
  const updatedJob = await input.prisma.job.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      bullmqJobId,
      lastError: null,
      finishedAt: null
    }
  });

  await input.prisma.jobLog.create({
    data: {
      jobId: job.id,
      level: "info",
      message: "Transition -> ENQUEUED",
      details: toPrismaJson({
        source: "mutation:episodes:enqueue",
        queueName: input.queueName,
        bullmqJobId,
        jobType,
        enqueueMode: enqueueResult.mode,
        enqueueAttemptCount: enqueueResult.attemptCount,
        enqueueErrorSummary: enqueueResult.errorSummary
      })
    }
  });

  return {
    episodeId: input.episodeId,
    job: updatedJob,
    queue: {
      queueName: input.queueName,
      bullmqJobId
    }
  };
}

export async function retryEpisodeJob(input: {
  prisma: PrismaClient;
  queue: Queue;
  queueName: string;
  jobId: string;
  body: JsonRecord;
}) {
  const source = await input.prisma.job.findUnique({
    where: { id: input.jobId }
  });

  if (!source) {
    throw createHttpError(404, "Job not found");
  }

  const maxAttempts = parsePositiveInt(
    input.body.maxAttempts,
    "maxAttempts",
    Math.max(1, source.maxAttempts)
  );
  const retryBackoffMs = parsePositiveInt(
    input.body.retryBackoffMs,
    "retryBackoffMs",
    Math.max(DEFAULT_RETRY_BACKOFF_MS, source.retryBackoffMs)
  );
  const failedShotIds = parseStringArray(input.body.failedShotIds, "failedShotIds");
  const dryRun = parseBoolean(input.body.dryRun, false);

  const created = await input.prisma.job.create({
    data: {
      episodeId: source.episodeId,
      type: source.type,
      status: "QUEUED",
      progress: 0,
      maxAttempts,
      retryBackoffMs
    }
  });

  await input.prisma.jobLog.create({
    data: {
      jobId: created.id,
      level: "info",
      message: "Transition -> QUEUED",
      details: toPrismaJson({
        source: "mutation:jobs:retry",
        retryOfJobId: source.id,
        queueName: input.queueName,
        maxAttempts,
        retryBackoffMs
      })
    }
  });

  const payload: EpisodeJobPayload = {
    jobDbId: created.id,
    episodeId: created.episodeId,
    schemaChecks: []
  };

  if (failedShotIds.length > 0 || source.type === "RENDER_PREVIEW" || source.type === "RENDER_FINAL") {
    payload.render = {
      rerenderFailedShotsOnly: failedShotIds.length > 0,
      ...(failedShotIds.length > 0 ? { failedShotIds } : {}),
      dryRun
    };
  }

  const enqueueResult = await enqueueWithResilience({
    queue: input.queue,
    name: source.type,
    payload,
    maxAttempts,
    backoffMs: retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });
  const bullmqJobId = String(enqueueResult.job.id);

  const updated = await input.prisma.job.update({
    where: { id: created.id },
    data: {
      status: "QUEUED",
      bullmqJobId,
      lastError: null,
      finishedAt: null
    }
  });

  await input.prisma.jobLog.create({
    data: {
      jobId: updated.id,
      level: "info",
      message: "Transition -> ENQUEUED",
      details: toPrismaJson({
        source: "mutation:jobs:retry",
        retryOfJobId: source.id,
        queueName: input.queueName,
        bullmqJobId,
        enqueueMode: enqueueResult.mode,
        enqueueAttemptCount: enqueueResult.attemptCount,
        enqueueErrorSummary: enqueueResult.errorSummary,
        dryRun,
        failedShotIds
      })
    }
  });

  return {
    sourceJob: source,
    job: updated,
    queue: {
      queueName: input.queueName,
      bullmqJobId
    }
  };
}
