import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import sharp from "sharp";
import type { JobsOptions, Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { EpisodeJobPayload } from "../services/scheduleService";
import { makeStorageKey, putAssetObject } from "../services/assetStorage";

type JsonRecord = Record<string, unknown>;
type HttpError = Error & { statusCode: number; details?: unknown };
type EpisodeJobPayloadWithRender = EpisodeJobPayload & {
  render?: {
    rerenderFailedShotsOnly?: boolean;
    failedShotIds?: string[];
    dryRun?: boolean;
  };
};

type RegisterApiRoutesInput = {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue: Queue;
  queueName: string;
};

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = 1000;
const MAX_LIST_LIMIT = 200;
const DEFAULT_LIST_LIMIT = 50;

const DEMO_USER_EMAIL = "demo.extreme@example.com";
const DEMO_USER_NAME = "demo-extreme";
const DEMO_CHANNEL_NAME = "Extreme Demo Channel";

const ENQUEUE_JOB_TYPES = [
  "GENERATE_BEATS",
  "COMPILE_SHOTS",
  "RENDER_PREVIEW",
  "RENDER_FINAL",
  "PACKAGE_OUTPUTS"
] as const;

const JOB_STATUS_VALUES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
const ASSET_TYPE_VALUES = [
  "character_reference",
  "character_view",
  "background",
  "chart_source"
] as const;
const ASSET_INGEST_JOB_NAME = "ASSET_INGEST";
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MIN_UPLOAD_DIMENSION = 256;

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

function optionalQueryString(query: unknown, field: string): string | undefined {
  if (!isRecord(query)) {
    return undefined;
  }

  const value = query[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `${field} query must be a string`);
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

function parseBoolean(value: unknown, fallback = false): boolean {
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

function parseStringArray(value: unknown, field: string): string[] {
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

function requireTopic(body: JsonRecord): string {
  const topic = optionalString(body, "topic");
  if (!topic) {
    throw createHttpError(400, "topic is required");
  }
  return topic;
}

function requireEpisodeJobType(value: unknown): (typeof ENQUEUE_JOB_TYPES)[number] {
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

function requireAssetType(value: unknown): (typeof ASSET_TYPE_VALUES)[number] {
  if (typeof value !== "string") {
    throw createHttpError(400, `assetType is required and must be one of: ${ASSET_TYPE_VALUES.join(", ")}`);
  }

  const normalized = value.trim().toLowerCase();
  const found = ASSET_TYPE_VALUES.find((item) => item === normalized);
  if (!found) {
    throw createHttpError(400, `assetType must be one of: ${ASSET_TYPE_VALUES.join(", ")}`);
  }

  return found;
}

function toPrismaAssetType(value: (typeof ASSET_TYPE_VALUES)[number]):
  | "CHARACTER_REFERENCE"
  | "CHARACTER_VIEW"
  | "BACKGROUND"
  | "CHART_SOURCE" {
  switch (value) {
    case "character_reference":
      return "CHARACTER_REFERENCE";
    case "character_view":
      return "CHARACTER_VIEW";
    case "background":
      return "BACKGROUND";
    case "chart_source":
      return "CHART_SOURCE";
  }
}

function fileExtensionFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "bin";
}

function ensureJobStatus(value: string): (typeof JOB_STATUS_VALUES)[number] {
  const found = JOB_STATUS_VALUES.find((item) => item === value);
  if (!found) {
    throw createHttpError(400, `status query must be one of: ${JOB_STATUS_VALUES.join(", ")}`);
  }
  return found;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRedisUnavailableError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes("Redis unavailable") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("Connection is closed")
  );
}

async function enqueueWithIdempotency(
  queue: Queue,
  name: string,
  payload: EpisodeJobPayloadWithRender,
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
  } catch (error) {
    if (isRedisUnavailableError(error)) {
      throw createHttpError(503, "Redis unavailable");
    }

    const existing = await queue.getJob(payload.jobDbId);
    if (existing) {
      return existing;
    }

    throw error;
  }
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

function getRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../../");
}

function getEpisodeOutPaths(episodeId: string): { outDir: string; beatsPath: string; shotsPath: string; previewPath: string; finalPath: string } {
  const outDir = path.join(getRepoRoot(), "out", episodeId);
  return {
    outDir,
    beatsPath: path.join(outDir, "beats.json"),
    shotsPath: path.join(outDir, "shots.json"),
    previewPath: path.join(outDir, "preview.mp4"),
    finalPath: path.join(outDir, "final.mp4")
  };
}

function internalHeaders(): Record<string, string> {
  const apiKey = process.env.API_KEY?.trim();
  if (apiKey) {
    return {
      "x-api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json"
    };
  }

  return {
    "content-type": "application/json",
    accept: "application/json"
  };
}

function parseJsonBody(raw: string): unknown {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function escHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function uiBadgeClass(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "READY" || normalized === "SUCCEEDED") return "ok";
  if (normalized === "FAILED") return "bad";
  if (normalized === "PROCESSING" || normalized === "RUNNING") return "warn";
  return "muted";
}

function fmtUiDate(value: Date): string {
  return value.toLocaleString("ko-KR", { hour12: false });
}

function uiPage(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(
    title
  )}</title><style>body{margin:0;font-family:Segoe UI,Noto Sans KR,sans-serif;background:#f5f7fb;color:#1a2433}header{background:#fff;border-bottom:1px solid #d6deea;position:sticky;top:0}nav{max-width:1100px;margin:0 auto;padding:12px 18px;display:flex;gap:14px;align-items:center}nav strong{margin-right:auto}main{max-width:1100px;margin:18px auto;padding:0 18px;display:grid;gap:12px}.card{background:#fff;border:1px solid #d6deea;border-radius:12px;padding:14px}a{color:#0f5bd8;text-decoration:none}a:hover{text-decoration:underline}.grid{display:grid;gap:10px}.two{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #e3e8f1;padding:7px;text-align:left}.badge{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}.badge.ok{background:#eaf6ed;color:#1d7a34}.badge.warn{background:#fff8e8;color:#945f02}.badge.bad{background:#fff1ef;color:#b42318}.badge.muted{background:#f2f4f7;color:#475467}input,select,button{font:inherit;border:1px solid #ccd6e5;border-radius:8px;padding:7px 9px}button{background:#0f5bd8;color:#fff;border:none;font-weight:700;cursor:pointer}pre{margin:0;background:#0b1220;color:#d3e1ff;padding:10px;border-radius:8px;overflow:auto;font-size:12px}</style></head><body><header><nav><strong>Eraser Cat Assets</strong><a href=\"/ui\">Dashboard</a><a href=\"/ui/assets\">Assets</a><a href=\"/ui/artifacts\">Artifacts</a></nav></header><main>${body}</main></body></html>`;
}

export function registerApiRoutes(input: RegisterApiRoutesInput): void {
  const { app, prisma, queue, queueName } = input;

  app.register(multipart, {
    limits: {
      files: 1,
      fileSize: MAX_UPLOAD_BYTES
    }
  });

  app.get("/api/jobs", async (request) => {
    const episodeId = optionalQueryString(request.query, "episodeId");
    const statusRaw = optionalQueryString(request.query, "status");
    const limitValue = optionalQueryString(request.query, "limit");
    const limit = Math.min(parsePositiveInt(limitValue, "limit", DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT);

    const where: Prisma.JobWhereInput = {};
    if (episodeId) {
      where.episodeId = episodeId;
    }
    if (statusRaw) {
      where.status = ensureJobStatus(statusRaw.toUpperCase());
    }

    const rows = await prisma.job.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        episode: {
          select: {
            id: true,
            topic: true,
            status: true
          }
        }
      }
    });

    return { data: rows };
  });

  app.get("/api/jobs/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!job) {
      throw createHttpError(404, "Job not found");
    }

    return {
      data: {
        id: job.id,
        episodeId: job.episodeId,
        type: job.type,
        status: job.status,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.maxAttempts,
        bullmqJobId: job.bullmqJobId,
        lastError: job.lastError,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        logs: job.logs
      }
    };
  });

  app.post("/api/jobs/:id/retry", async (request, reply) => {
    const id = requireRouteParam(request.params, "id");
    const body = request.body === undefined ? {} : requireBodyObject(request.body);

    const source = await prisma.job.findUnique({
      where: { id }
    });

    if (!source) {
      throw createHttpError(404, "Job not found");
    }

    const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", Math.max(1, source.maxAttempts));
    const retryBackoffMs = parsePositiveInt(
      body.retryBackoffMs,
      "retryBackoffMs",
      Math.max(DEFAULT_RETRY_BACKOFF_MS, source.retryBackoffMs)
    );

    const failedShotIds = parseStringArray(body.failedShotIds, "failedShotIds");
    const dryRun = parseBoolean(body.dryRun, false);

    const created = await prisma.job.create({
      data: {
        episodeId: source.episodeId,
        type: source.type,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: created.id,
        level: "info",
        message: "Transition -> QUEUED",
        details: toPrismaJson({
          source: "api:jobs:retry",
          retryOfJobId: source.id,
          queueName,
          maxAttempts,
          retryBackoffMs
        })
      }
    });

    const payload: EpisodeJobPayloadWithRender = {
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

    const queued = await enqueueWithIdempotency(queue, source.type, payload, maxAttempts, retryBackoffMs);
    const bullmqJobId = String(queued.id);

    const updated = await prisma.job.update({
      where: { id: created.id },
      data: {
        status: "QUEUED",
        bullmqJobId,
        lastError: null,
        finishedAt: null
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: updated.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:jobs:retry",
          retryOfJobId: source.id,
          queueName,
          bullmqJobId
        })
      }
    });

    return reply.code(201).send({
      data: {
        sourceJobId: source.id,
        job: updated,
        queue: {
          queueName,
          bullmqJobId
        }
      }
    });
  });

  app.get("/api/episodes", async (request) => {
    const limitValue = optionalQueryString(request.query, "limit");
    const limit = Math.min(parsePositiveInt(limitValue, "limit", DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT);

    const rows = await prisma.episode.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        channel: {
          select: {
            id: true,
            name: true
          }
        },
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            type: true,
            status: true,
            progress: true,
            createdAt: true,
            updatedAt: true
          }
        },
        beatsDoc: {
          select: {
            id: true,
            updatedAt: true
          }
        },
        shotsDoc: {
          select: {
            id: true,
            updatedAt: true
          }
        }
      }
    });

    const data = rows.map((row) => {
      const out = getEpisodeOutPaths(row.id);
      return {
        ...row,
        artifacts: {
          previewExists: fs.existsSync(out.previewPath),
          finalExists: fs.existsSync(out.finalPath)
        }
      };
    });

    return { data };
  });

  app.get("/api/episodes/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");

    const episode = await prisma.episode.findUnique({
      where: { id },
      include: {
        channel: {
          select: {
            id: true,
            name: true
          }
        },
        bible: {
          select: {
            id: true,
            version: true,
            updatedAt: true
          }
        },
        season: {
          select: {
            id: true,
            name: true
          }
        },
        beatsDoc: {
          select: {
            id: true,
            updatedAt: true,
            hash: true
          }
        },
        shotsDoc: {
          select: {
            id: true,
            updatedAt: true,
            hash: true
          }
        }
      }
    });

    if (!episode) {
      throw createHttpError(404, "Episode not found");
    }

    const jobs = await prisma.job.findMany({
      where: { episodeId: id },
      orderBy: { createdAt: "desc" },
      include: {
        logs: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    const out = getEpisodeOutPaths(id);

    return {
      data: {
        episode,
        jobs,
        artifacts: {
          outDir: out.outDir,
          beatsPath: out.beatsPath,
          shotsPath: out.shotsPath,
          previewPath: out.previewPath,
          finalPath: out.finalPath,
          beatsFileExists: fs.existsSync(out.beatsPath),
          shotsFileExists: fs.existsSync(out.shotsPath),
          previewExists: fs.existsSync(out.previewPath),
          finalExists: fs.existsSync(out.finalPath)
        }
      }
    };
  });

  app.post("/api/episodes", async (request, reply) => {
    const body = requireBodyObject(request.body);

    const topic = requireTopic(body);
    const targetDurationSec = parsePositiveInt(body.targetDurationSec, "targetDurationSec", 600);
    const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
    const jobType = body.jobType === undefined ? "GENERATE_BEATS" : requireEpisodeJobType(body.jobType);

    const channelId = optionalString(body, "channelId") ?? (await ensureDefaultChannel(prisma)).id;

    const episode = await prisma.episode.create({
      data: {
        channelId,
        topic,
        targetDurationSec
      }
    });

    const job = await prisma.job.create({
      data: {
        episodeId: episode.id,
        type: jobType,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs: DEFAULT_RETRY_BACKOFF_MS
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: "info",
        message: "Transition -> QUEUED",
        details: toPrismaJson({
          source: "api:episodes:create",
          queueName,
          maxAttempts
        })
      }
    });

    const payload: EpisodeJobPayloadWithRender = {
      jobDbId: job.id,
      episodeId: episode.id,
      schemaChecks: []
    };

    const queued = await enqueueWithIdempotency(queue, jobType, payload, maxAttempts, DEFAULT_RETRY_BACKOFF_MS);
    const bullmqJobId = String(queued.id);

    const updatedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        bullmqJobId,
        lastError: null,
        finishedAt: null
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:episodes:create",
          queueName,
          bullmqJobId
        })
      }
    });

    return reply.code(201).send({
      data: {
        episode,
        job: updatedJob,
        queue: {
          queueName,
          bullmqJobId
        }
      }
    });
  });

  app.post("/api/episodes/:id/enqueue", async (request, reply) => {
    const episodeId = requireRouteParam(request.params, "id");
    const body = request.body === undefined ? {} : requireBodyObject(request.body);

    const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
    if (!episode) {
      throw createHttpError(404, "Episode not found");
    }

    const jobType = body.jobType === undefined ? "COMPILE_SHOTS" : requireEpisodeJobType(body.jobType);
    const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
    const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);
    const failedShotIds = parseStringArray(body.failedShotIds, "failedShotIds");
    const dryRun = parseBoolean(body.dryRun, false);

    const job = await prisma.job.create({
      data: {
        episodeId,
        type: jobType,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: "info",
        message: "Transition -> QUEUED",
        details: toPrismaJson({
          source: "api:episodes:enqueue",
          queueName,
          maxAttempts,
          retryBackoffMs,
          jobType
        })
      }
    });

    const payload: EpisodeJobPayloadWithRender = {
      jobDbId: job.id,
      episodeId,
      schemaChecks: []
    };

    if (jobType === "RENDER_PREVIEW" || jobType === "RENDER_FINAL") {
      payload.render = {
        rerenderFailedShotsOnly: failedShotIds.length > 0,
        ...(failedShotIds.length > 0 ? { failedShotIds } : {}),
        dryRun
      };
    }

    const queued = await enqueueWithIdempotency(queue, jobType, payload, maxAttempts, retryBackoffMs);
    const bullmqJobId = String(queued.id);

    const updatedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        bullmqJobId,
        lastError: null,
        finishedAt: null
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:episodes:enqueue",
          queueName,
          bullmqJobId,
          jobType
        })
      }
    });

    return reply.code(201).send({
      data: {
        episodeId,
        job: updatedJob,
        queue: {
          queueName,
          bullmqJobId
        }
      }
    });
  });

  app.get("/api/assets", async (request) => {
    const limitValue = optionalQueryString(request.query, "limit");
    const limit = Math.min(parsePositiveInt(limitValue, "limit", DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT);

    const rows = await prisma.asset.findMany({
      orderBy: { createdAt: "desc" },
      take: limit
    });

    return {
      data: rows.map((row) => ({
        id: row.id,
        channelId: row.channelId,
        type: row.type,
        assetType: row.assetType,
        status: row.status,
        mime: row.mime,
        sizeBytes: row.sizeBytes ? row.sizeBytes.toString() : null,
        sha256: row.sha256,
        originalKey: row.originalKey,
        normalizedKey1024: row.normalizedKey1024,
        normalizedKey2048: row.normalizedKey2048,
        qcJson: row.qcJson,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    };
  });

  app.post("/api/assets/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      throw createHttpError(400, "multipart file field 'file' is required");
    }

    const fields = file.fields as Record<string, { value?: unknown }>;
    const assetType = requireAssetType(fields.assetType?.value);

    const mime = (file.mimetype ?? "application/octet-stream").toLowerCase();
    if (!mime.startsWith("image/")) {
      throw createHttpError(400, `Unsupported mime type: ${mime}`);
    }

    const fileBuffer = await file.toBuffer();
    if (fileBuffer.byteLength === 0) {
      throw createHttpError(400, "Uploaded file is empty");
    }

    if (fileBuffer.byteLength > MAX_UPLOAD_BYTES) {
      throw createHttpError(400, `Uploaded file is too large. max=${MAX_UPLOAD_BYTES} bytes`);
    }

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(fileBuffer, { failOn: "warning" }).metadata();
    } catch (error) {
      throw createHttpError(400, `Unreadable image file: ${errorMessage(error)}`);
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < MIN_UPLOAD_DIMENSION || height < MIN_UPLOAD_DIMENSION) {
      throw createHttpError(
        400,
        `Image is too small (${width}x${height}). Minimum ${MIN_UPLOAD_DIMENSION}px on both sides`
      );
    }

    const requestedChannelId =
      typeof fields.channelId?.value === "string" && fields.channelId.value.trim().length > 0
        ? fields.channelId.value.trim()
        : undefined;
    const channelId = requestedChannelId ?? (await ensureDefaultChannel(prisma)).id;

    const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    const ext = fileExtensionFromMime(mime);
    const originalKey = makeStorageKey(
      `assets/uploads/${channelId}`,
      `${Date.now()}_${sha256.slice(0, 12)}.${ext}`
    );

    const stored = await putAssetObject(originalKey, fileBuffer, mime);

    const created = await prisma.asset.create({
      data: {
        channelId,
        type: "IMAGE",
        assetType: toPrismaAssetType(assetType),
        status: "QUEUED",
        mime,
        sizeBytes: BigInt(fileBuffer.byteLength),
        storageKey: originalKey,
        originalKey,
        contentType: mime,
        bytes: BigInt(fileBuffer.byteLength),
        sha256,
        qcJson: toPrismaJson({
          ok: true,
          stage: "uploaded",
          dimensions: { width, height },
          minioWarning: stored.minioError ?? null
        })
      }
    });

    let bullmqJobId: string | null = null;
    try {
      const queued = await queue.add(
        ASSET_INGEST_JOB_NAME,
        {
          assetId: created.id,
          assetType,
          originalKey,
          mime
        },
        {
          jobId: `asset-ingest:${created.id}`,
          attempts: DEFAULT_MAX_ATTEMPTS,
          backoff: {
            type: "exponential",
            delay: DEFAULT_RETRY_BACKOFF_MS
          },
          removeOnComplete: false,
          removeOnFail: false
        }
      );
      bullmqJobId = String(queued.id);
    } catch (error) {
      if (isRedisUnavailableError(error)) {
        await prisma.asset.update({
          where: { id: created.id },
          data: {
            status: "FAILED",
            qcJson: toPrismaJson({
              ok: false,
              stage: "enqueue",
              error: "Redis unavailable"
            })
          }
        });
        throw createHttpError(503, "Redis unavailable");
      }
      throw error;
    }

    await prisma.asset.update({
      where: { id: created.id },
      data: {
        status: "QUEUED",
        qcJson: toPrismaJson({
          ok: true,
          stage: "queued",
          dimensions: { width, height },
          minioWarning: stored.minioError ?? null,
          bullmqJobId
        })
      }
    });

    return reply.code(201).send({
      data: {
        assetId: created.id,
        status: "QUEUED",
        qcSummary: {
          dimensions: { width, height },
          minioWarning: stored.minioError ?? null
        },
        bullmqJobId
      }
    });
  });

  app.get("/api/assets/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");
    const asset = await prisma.asset.findUnique({
      where: { id }
    });

    if (!asset) {
      throw createHttpError(404, "Asset not found");
    }

    return {
      data: {
        id: asset.id,
        channelId: asset.channelId,
        type: asset.type,
        assetType: asset.assetType,
        status: asset.status,
        mime: asset.mime,
        sizeBytes: asset.sizeBytes ? asset.sizeBytes.toString() : null,
        sha256: asset.sha256,
        originalKey: asset.originalKey,
        normalizedKey1024: asset.normalizedKey1024,
        normalizedKey2048: asset.normalizedKey2048,
        qcJson: asset.qcJson,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt
      }
    };
  });

  app.get("/ui/assets", async (request, reply) => {
    const selectedAssetId = optionalQueryString(request.query, "assetId");
    const assets = await prisma.asset.findMany({
      orderBy: { createdAt: "desc" },
      take: 50
    });

    const selected = selectedAssetId
      ? await prisma.asset.findUnique({
          where: { id: selectedAssetId }
        })
      : assets[0] ?? null;

    const rows = assets
      .map(
        (asset) =>
          `<tr><td><a href="/ui/assets?assetId=${encodeURIComponent(asset.id)}">${escHtml(asset.id)}</a></td><td>${escHtml(
            asset.assetType ?? "-"
          )}</td><td><span class="badge ${uiBadgeClass(asset.status)}">${escHtml(
            asset.status
          )}</span></td><td>${escHtml(asset.mime ?? "-")}</td><td>${escHtml(
            asset.sizeBytes ? asset.sizeBytes.toString() : "-"
          )}</td><td>${escHtml(fmtUiDate(asset.createdAt))}</td></tr>`
      )
      .join("");

    const selectedDetails = selected
      ? `<div class="card"><h3>Selected Asset</h3><p>id: <strong>${escHtml(
          selected.id
        )}</strong></p><p>status: <span class="badge ${uiBadgeClass(selected.status)}">${escHtml(
          selected.status
        )}</span></p><p>original: <code>${escHtml(
          selected.originalKey ?? selected.storageKey
        )}</code></p><p>normalized1024: <code>${escHtml(
          selected.normalizedKey1024 ?? "-"
        )}</code></p><p>normalized2048: <code>${escHtml(
          selected.normalizedKey2048 ?? "-"
        )}</code></p><p><a href="/api/assets/${encodeURIComponent(selected.id)}">Open JSON</a></p><pre>${escHtml(
          JSON.stringify(selected.qcJson ?? null, null, 2)
        )}</pre></div>`
      : `<div class="card"><h3>Selected Asset</h3><p>No assets yet.</p></div>`;

    const body = `<section class="card"><h1>Assets</h1><form id="asset-upload-form" enctype="multipart/form-data" class="grid"><div class="grid two"><label>assetType<select name="assetType"><option value="character_reference">character_reference</option><option value="character_view">character_view</option><option value="background">background</option><option value="chart_source">chart_source</option></select></label><label>file<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label></div><button type="submit">Upload + Enqueue ASSET_INGEST</button></form><pre id="asset-upload-result"></pre></section><section class="card"><h2>Latest Assets</h2><table><thead><tr><th>ID</th><th>assetType</th><th>Status</th><th>MIME</th><th>Bytes</th><th>Created</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No assets</td></tr>'}</tbody></table></section>${selectedDetails}<script>const form=document.getElementById(\"asset-upload-form\");const output=document.getElementById(\"asset-upload-result\");if(form&&output){form.addEventListener(\"submit\",async(event)=>{event.preventDefault();output.textContent=\"Uploading...\";const fd=new FormData(form);try{const res=await fetch(\"/api/assets/upload\",{method:\"POST\",body:fd});const json=await res.json();output.textContent=JSON.stringify(json,null,2);if(res.ok&&json&&json.data&&json.data.assetId){window.location.href=\"/ui/assets?assetId=\"+encodeURIComponent(json.data.assetId);}}catch(error){output.textContent=String(error);}});}</script>`;

    return reply.type("text/html; charset=utf-8").send(uiPage("Assets", body));
  });

  app.post("/api/hitl/rerender", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const episodeId = optionalString(body, "episodeId");

    if (!episodeId) {
      throw createHttpError(400, "episodeId is required");
    }

    const shotIds = parseStringArray(body.shotIds ?? body.failedShotIds, "shotIds");
    if (shotIds.length === 0) {
      throw createHttpError(400, "shotIds must include at least one item");
    }

    const dryRun = parseBoolean(body.dryRun, false);

    const injected = await app.inject({
      method: "POST",
      url: "/hitl/rerender",
      payload: {
        episodeId,
        shotIds,
        dryRun
      },
      headers: internalHeaders()
    });

    const parsed = parseJsonBody(injected.body);

    if (injected.statusCode >= 400) {
      const message =
        isRecord(parsed) && typeof parsed.error === "string"
          ? parsed.error
          : `Failed to rerender selected shots: status=${injected.statusCode}`;

      throw createHttpError(injected.statusCode, message, parsed);
    }

    return reply.code(injected.statusCode).send(
      parsed ?? {
        data: {
          ok: true
        }
      }
    );
  });
}
