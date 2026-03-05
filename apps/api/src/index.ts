import { bootstrapEnv } from "./bootstrapEnv";

bootstrapEnv();

import { createHash, randomUUID } from "node:crypto";
import Fastify from "fastify";
import { Queue, type JobsOptions } from "bullmq";
import { createValidator } from "@ec/shared";
import { autoScheduleSeason } from "./services/scheduleService";
import type { EpisodeJobPayload } from "./services/scheduleService";
import { buildWeeklyReport, startOfUtcWeek, weeklyReportToCsv } from "./services/reportService";
import { registerPublishRoutes } from "./services/publishService";
import { apiQueueRetentionOptions } from "./services/jobRetention";
import { isDbUnavailableError } from "./routes/ui/dbFallback";
import { createServiceUnavailablePayload } from "./errors/errorPayload";
import type {
  BacklogStatus as PrismaBacklogStatus,
  ExperimentStatus as PrismaExperimentStatus,
  JobType as PrismaJobType,
  Prisma
} from "@prisma/client";

const prismaModule = await import("@prisma/client");
const {
  PrismaClient,
  Prisma: PrismaRuntime,
  JobType: JobTypeRuntime,
  BacklogStatus: BacklogStatusRuntime,
  ExperimentStatus: ExperimentStatusRuntime
} = prismaModule;

const API_HOST = process.env.API_HOST ?? "0.0.0.0";
const API_PORT = Number.parseInt(process.env.API_PORT ?? "3000", 10);
const API_KEY = process.env.API_KEY?.trim() ?? "";
const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";
const DATABASE_URL = process.env.DATABASE_URL;
const QUEUE_NAME = "episode-jobs";
const CHANNEL_BIBLE_SCHEMA_ID = "channel_bible.schema.json";

if (!Number.isInteger(API_PORT) || API_PORT <= 0) {
  throw new Error("[api] API_PORT must be a positive integer");
}

if (!DATABASE_URL) {
  throw new Error("[api] DATABASE_URL is required. Check repo-root .env");
}

const prisma = new PrismaClient();
const validator = createValidator();
const app = Fastify({ logger: true });

const JOB_TYPE_SET = new Set<string>(Object.values(JobTypeRuntime));
const BACKLOG_STATUS_SET = new Set<string>(Object.values(BacklogStatusRuntime));
const EXPERIMENT_STATUS_SET = new Set<string>(Object.values(ExperimentStatusRuntime));

type JsonRecord = Record<string, unknown>;
type SchemaCheckPayload = NonNullable<EpisodeJobPayload["schemaChecks"]>[number];
type ExperimentVariantInput = {
  key: string;
  name: string;
  weight: number;
  isControl: boolean;
};

class ApiError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasFields(value: object): boolean {
  return Object.keys(value).length > 0;
}

function isJsonValue(value: unknown): value is Prisma.InputJsonValue {
  if (value === null) {
    return true;
  }

  const typeOfValue = typeof value;
  if (typeOfValue === "string" || typeOfValue === "number" || typeOfValue === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.values(value).every((entry) => entry !== undefined && isJsonValue(entry));
  }

  return false;
}

function parseDateValue(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, `${field} must be a valid ISO date string`);
  }
  return parsed;
}

function requireBodyObject(body: unknown): JsonRecord {
  if (!isRecord(body)) {
    throw new ApiError(400, "Request body must be a JSON object");
  }
  return body;
}

function requireRouteParam(params: unknown, field: string): string {
  if (!isRecord(params)) {
    throw new ApiError(400, "Route params are invalid");
  }

  const value = params[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${field} path param must be a non-empty string`);
  }

  return value.trim();
}

function requireString(obj: JsonRecord, field: string): string {
  const value = obj[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${field} must be a non-empty string`);
  }
  return value.trim();
}

function requireInteger(obj: JsonRecord, field: string): number {
  const value = obj[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError(400, `${field} must be an integer`);
  }
  return value;
}

function requireNumber(obj: JsonRecord, field: string): number {
  const value = obj[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError(400, `${field} must be a finite number`);
  }
  return value;
}
function requireDate(obj: JsonRecord, field: string): Date {
  const value = obj[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${field} must be a non-empty ISO date string`);
  }
  return parseDateValue(value.trim(), field);
}

function optionalInteger(obj: JsonRecord, field: string): number | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ApiError(400, `${field} must be an integer`);
  }
  return value;
}

function optionalString(obj: JsonRecord, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalDate(obj: JsonRecord, field: string): Date | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${field} must be a non-empty ISO date string`);
  }
  return parseDateValue(value.trim(), field);
}

function optionalNullableString(obj: JsonRecord, field: string): string | null | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${field} must be null or a non-empty string`);
  }
  return value.trim();
}

function optionalBoolean(obj: JsonRecord, field: string): boolean | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new ApiError(400, `${field} must be a boolean`);
  }
  return value;
}

function requireJsonValue(obj: JsonRecord, field: string): Prisma.InputJsonValue {
  if (!(field in obj)) {
    throw new ApiError(400, `${field} is required`);
  }

  const value = obj[field];
  if (!isJsonValue(value)) {
    throw new ApiError(400, `${field} must be valid JSON`);
  }

  return value;
}

function optionalJsonValue(obj: JsonRecord, field: string): Prisma.InputJsonValue | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (!isJsonValue(value)) {
    throw new ApiError(400, `${field} must be valid JSON`);
  }

  return value;
}

function optionalQueryString(query: unknown, field: string): string | undefined {
  if (query === undefined || query === null) {
    return undefined;
  }
  if (!isRecord(query)) {
    throw new ApiError(400, "Query params are invalid");
  }

  const value = query[field];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${field} query must be a non-empty string`);
  }

  return value.trim();
}

function optionalQueryBoolean(query: unknown, field: string): boolean | undefined {
  const value = optionalQueryString(query, field);
  if (value === undefined) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new ApiError(400, `${field} query must be \"true\" or \"false\"`);
}

function optionalQueryInteger(query: unknown, field: string): number | undefined {
  const value = optionalQueryString(query, field);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new ApiError(400, `${field} query must be an integer`);
  }

  return parsed;
}

function optionalEnum<T extends string>(obj: JsonRecord, field: string, allowed: Set<string>): T | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || !allowed.has(value)) {
    throw new ApiError(400, `${field} is invalid`);
  }

  return value as T;
}

function optionalQueryEnum<T extends string>(query: unknown, field: string, allowed: Set<string>): T | undefined {
  const value = optionalQueryString(query, field);
  if (value === undefined) {
    return undefined;
  }

  if (!allowed.has(value)) {
    throw new ApiError(400, `${field} query is invalid`);
  }

  return value as T;
}

function optionalJobType(body: JsonRecord, field: string): PrismaJobType | undefined {
  return optionalEnum<PrismaJobType>(body, field, JOB_TYPE_SET);
}

function optionalSchemaChecks(body: JsonRecord, field: string): SchemaCheckPayload[] | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ApiError(400, `${field} must be an array`);
  }

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new ApiError(400, `${field}[${index}] must be an object`);
    }

    const schemaId = entry.schemaId;
    if (typeof schemaId !== "string" || schemaId.trim() === "") {
      throw new ApiError(400, `${field}[${index}].schemaId must be a non-empty string`);
    }

    if (!("data" in entry)) {
      throw new ApiError(400, `${field}[${index}].data is required`);
    }

    const data = entry.data;
    if (!isJsonValue(data)) {
      throw new ApiError(400, `${field}[${index}].data must be valid JSON`);
    }

    const result = validator.validate(schemaId, data);
    if (!result.ok) {
      throw new ApiError(400, `${field}[${index}] schema validation failed`, {
        schemaId,
        errors: result.errors
      });
    }

    return {
      schemaId,
      data
    };
  });
}

function parseExperimentVariants(body: JsonRecord, field: string): ExperimentVariantInput[] | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, `${field} must be a non-empty array`);
  }

  const keys = new Set<string>();

  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new ApiError(400, `${field}[${index}] must be an object`);
    }

    const key = requireString(entry, "key");
    const name = requireString(entry, "name");
    const weight = optionalInteger(entry, "weight") ?? 50;
    const isControl = optionalBoolean(entry, "isControl") ?? false;

    if (weight <= 0) {
      throw new ApiError(400, `${field}[${index}].weight must be greater than 0`);
    }

    if (keys.has(key)) {
      throw new ApiError(400, `${field} has duplicate variant key: ${key}`);
    }

    keys.add(key);

    return {
      key,
      name,
      weight,
      isControl
    };
  });
}

function buildDefaultIngestionId(input: {
  episodeId: string;
  metricKey: string;
  observedAt: Date;
  source: string;
  experimentId?: string | null;
  variantId?: string | null;
}): string {
  const raw = [
    input.episodeId,
    input.metricKey,
    input.observedAt.toISOString(),
    input.source,
    input.experimentId ?? "",
    input.variantId ?? ""
  ].join("|");

  return createHash("sha256").update(raw).digest("hex");
}

function assertSchemaValid(schemaId: string, payload: unknown, statusCode: number, context: string): void {
  const result = validator.validate(schemaId, payload);
  if (result.ok) {
    return;
  }

  throw new ApiError(statusCode, `${context} validation failed`, {
    schemaId,
    errors: result.errors
  });
}

function logDetails(details: JsonRecord): Prisma.InputJsonValue {
  return details as Prisma.InputJsonValue;
}

async function enqueueWithIdempotency(name: string, payload: EpisodeJobPayload, maxAttempts: number) {
  const options: JobsOptions = {
    jobId: payload.jobDbId,
    attempts: maxAttempts,
    ...apiQueueRetentionOptions()
  };

  const activeQueue = requireQueue();

  try {
    return await activeQueue.add(name, payload, options);
  } catch (error) {
    if (isRedisUnavailableError(error)) {
      await markQueueUnavailable(error);
      throw new ApiError(503, "Redis unavailable");
    }

    const existingJob = await activeQueue.getJob(payload.jobDbId);
    if (existingJob) {
      return existingJob;
    }
    throw error;
  }
}

type RedisHealth = "up" | "down";

let queue: Queue<EpisodeJobPayload> | null = null;
let redisHealth: RedisHealth = "down";
let queueRetryDelayMs = 1000;
let queueRetryTimer: NodeJS.Timeout | null = null;
let queueInitPromise: Promise<void> | null = null;
let isShuttingDown = false;
let lastRedisError: string | null = null;

function normalizeRedisUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const REDIS_URL = normalizeRedisUrl(process.env.REDIS_URL ?? DEFAULT_REDIS_URL);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRedisUnavailableError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("EAI_AGAIN") ||
    message.includes("Connection is closed") ||
    message.includes("connect ECONNREFUSED") ||
    message.includes("All sentinels are unreachable")
  );
}

function readRequestId(request: { id: string; headers: Record<string, unknown> }): string {
  const raw = request.headers["x-request-id"];
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim().length > 0) {
    return raw[0].trim();
  }
  return request.id || randomUUID();
}

function setRedisDown(reason: unknown): void {
  redisHealth = "down";
  lastRedisError = errorMessage(reason);
}

function setRedisUp(): void {
  redisHealth = "up";
  lastRedisError = null;
  queueRetryDelayMs = 1000;
}

function scheduleQueueReconnect(): void {
  if (isShuttingDown || queueRetryTimer !== null) {
    return;
  }

  const retryInMs = queueRetryDelayMs;
  queueRetryDelayMs = Math.min(queueRetryDelayMs * 2, 30000);

  app.log.warn(
    {
      redis: "down",
      redisUrl: REDIS_URL,
      retryInMs,
      reason: lastRedisError ?? "connection_failed"
    },
    "Redis unavailable. Queue routes will return 503 until reconnect succeeds."
  );

  queueRetryTimer = setTimeout(() => {
    queueRetryTimer = null;
    void initQueue();
  }, retryInMs);
  queueRetryTimer.unref?.();
}

async function markQueueUnavailable(reason: unknown): Promise<void> {
  const current = queue;
  if (current !== null) {
    queue = null;
    await current.close().catch(() => undefined);
  }
  setRedisDown(reason);
  scheduleQueueReconnect();
}

async function initQueue(): Promise<void> {
  if (isShuttingDown || queue !== null) {
    return;
  }

  if (queueInitPromise) {
    await queueInitPromise;
    return;
  }

  queueInitPromise = (async () => {
    const candidate = new Queue<EpisodeJobPayload>(QUEUE_NAME, {
      connection: {
        url: REDIS_URL,
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null
      }
    });

    candidate.on("error", (error) => {
      if (isRedisUnavailableError(error)) {
        void markQueueUnavailable(error);
      }
    });

    try {
      await candidate.waitUntilReady();
      queue = candidate;
      setRedisUp();
      app.log.info(
        {
          redis: "up",
          redisUrl: REDIS_URL,
          queue: QUEUE_NAME
        },
        "Redis connection established"
      );
    } catch (error) {
      await candidate.close().catch(() => undefined);
      setRedisDown(error);
      scheduleQueueReconnect();
    } finally {
      queueInitPromise = null;
    }
  })();

  await queueInitPromise;
}

function requireQueue(): Queue<EpisodeJobPayload> {
  if (queue === null) {
    throw new ApiError(503, "Redis unavailable");
  }
  return queue;
}

function isQueueDependentRequest(method: string, rawUrl: string): boolean {
  if (method !== "POST") {
    return false;
  }

  const path = rawUrl.split("?", 1)[0] ?? rawUrl;
  return (
    path === "/episodes" ||
    path === "/schedule/auto" ||
    path === "/demo/extreme" ||
    path.startsWith("/repurpose/") ||
    path === "/hitl/rerender"
  );
}

const queueFacade = {
  get name() {
    return QUEUE_NAME;
  },
  async add(name: string, payload: EpisodeJobPayload, options?: JobsOptions) {
    const activeQueue = requireQueue();
    try {
      return await activeQueue.add(name, payload, options);
    } catch (error) {
      if (isRedisUnavailableError(error)) {
        await markQueueUnavailable(error);
        throw new ApiError(503, "Redis unavailable");
      }
      throw error;
    }
  },
  async getJob(jobId: string) {
    const activeQueue = queue;
    if (activeQueue === null) {
      return null;
    }
    try {
      return await activeQueue.getJob(jobId);
    } catch (error) {
      if (isRedisUnavailableError(error)) {
        await markQueueUnavailable(error);
        return null;
      }
      throw error;
    }
  },
  async close() {
    const activeQueue = queue;
    queue = null;
    if (activeQueue !== null) {
      await activeQueue.close();
    }
  }
} as unknown as Queue<EpisodeJobPayload>;

app.addHook("preHandler", async (request) => {
  if (API_KEY.length === 0) {
    return;
  }
  const routePath = request.routeOptions?.url ?? "";
  if (routePath.startsWith("/ui") || routePath.startsWith("/artifacts")) {
    return;
  }

  const rawValue = request.headers["x-api-key"];
  const providedKey = Array.isArray(rawValue) ? rawValue[0] : rawValue;

  if (typeof providedKey !== "string" || providedKey !== API_KEY) {
    throw new ApiError(401, "Unauthorized");
  }
});

app.addHook("onRequest", async (request, reply) => {
  const requestId = readRequestId(request);
  reply.header("x-request-id", requestId);
});

app.addHook("onSend", async (request, reply, payload) => {
  const routePath = request.routeOptions?.url ?? "";
  const isLegacyApiSurface =
    (routePath.startsWith("/episodes") || routePath.startsWith("/jobs") || routePath.startsWith("/assets")) &&
    !routePath.startsWith("/api");
  if (isLegacyApiSurface) {
    reply.header("x-api-legacy-route", "true");
    reply.header("warning", '299 - "Legacy route is deprecated. Use /api/* route equivalents."');
  }
  return payload;
});

app.addHook("preHandler", async (request) => {
  if (!isQueueDependentRequest(request.method, request.url)) {
    return;
  }

  if (queue === null) {
    throw new ApiError(503, "Redis unavailable");
  }
});

app.setNotFoundHandler((request, reply) => {
  const requestId = readRequestId(request);
  reply.header("x-request-id", requestId);
  reply.code(404).send({
    error: "Not Found",
    message: `Route ${request.method} ${request.url} not found`,
    requestId
  });
});

app.setErrorHandler((error, request, reply) => {
  const requestId = readRequestId(request);
  reply.header("x-request-id", requestId);
  let statusCode = 500;
  let body: Record<string, unknown> = {
    error: "Internal Server Error",
    requestId
  };

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
    body = {
      error: error.message,
      requestId,
      ...(error.details !== undefined ? { details: error.details } : {})
    };
  } else if (error instanceof PrismaRuntime.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      statusCode = 404;
      body = { error: "Resource not found", requestId };
    } else if (error.code === "P2002") {
      statusCode = 409;
      body = { error: "Unique constraint violated", requestId };
    } else if (error.code === "P2003") {
      statusCode = 400;
      body = { error: "Invalid relation reference", requestId };
    } else {
      statusCode = 400;
      body = { error: "Database request failed", requestId };
    }
  } else if (isRecord(error) && typeof error.statusCode === "number") {
    statusCode = error.statusCode;
    body = {
      error: typeof error.message === "string" ? error.message : "Request failed",
      requestId,
      ...(error.details !== undefined ? { details: error.details } : {})
    };
  }

  if (typeof body.error === "string" && body.error.includes("Redis unavailable")) {
    statusCode = 503;
    body = createServiceUnavailablePayload({
      dependency: "redis",
      requestId
    });
  }

  if (isDbUnavailableError(error)) {
    statusCode = 503;
    body = createServiceUnavailablePayload({
      dependency: "postgresql",
      requestId
    });
  }

  if (statusCode >= 500) {
    request.log.error(error);
  }

  reply.code(statusCode).send(body);
});

app.get("/health", async () => {
  let queueStats:
    | {
        wait: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        paused: number;
        prioritized: number;
      }
    | null = null;
  let queueStatsError: string | null = null;
  if (queue !== null) {
    try {
      const counts = await queue.getJobCounts(
        "wait",
        "active",
        "completed",
        "failed",
        "delayed",
        "paused",
        "prioritized"
      );
      queueStats = {
        wait: counts.wait ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        paused: counts.paused ?? 0,
        prioritized: counts.prioritized ?? 0
      };
    } catch (error) {
      queueStatsError = errorMessage(error);
    }
  }

  let failedTrend:
    | {
        last15m: number;
        last60m: number;
        last24h: number;
      }
    | null = null;
  let failedTrendError: string | null = null;
  try {
    const nowMs = Date.now();
    const [last15m, last60m, last24h] = await Promise.all([
      prisma.job.count({
        where: {
          status: "FAILED",
          finishedAt: { gte: new Date(nowMs - 15 * 60 * 1000) }
        }
      }),
      prisma.job.count({
        where: {
          status: "FAILED",
          finishedAt: { gte: new Date(nowMs - 60 * 60 * 1000) }
        }
      }),
      prisma.job.count({
        where: {
          status: "FAILED",
          finishedAt: { gte: new Date(nowMs - 24 * 60 * 60 * 1000) }
        }
      })
    ]);
    failedTrend = { last15m, last60m, last24h };
  } catch (error) {
    failedTrendError = errorMessage(error);
  }

  const hasIssue = queue === null || queueStatsError !== null || failedTrendError !== null;
  const overallStatus = hasIssue ? "degraded" : "ok";
  return {
    data: {
      ok: overallStatus === "ok",
      status: overallStatus,
      redis: redisHealth,
      queue: QUEUE_NAME,
      queueReady: queue !== null,
      authEnabled: API_KEY.length > 0,
      redisUrl: REDIS_URL,
      ...(queueStats ? { queueStats } : {}),
      ...(failedTrend ? { failedTrend } : {}),
      ...(lastRedisError ? { redisError: lastRedisError } : {}),
      ...(queueStatsError ? { queueStatsError } : {}),
      ...(failedTrendError ? { failedTrendError } : {}),
      loadedSchemas: validator.registry.list()
    }
  };
});

app.get("/channel-bible", async (request) => {
  const channelId = optionalQueryString(request.query, "channelId");
  const isActive = optionalQueryBoolean(request.query, "isActive");

  const where: Prisma.ChannelBibleWhereInput = {};
  if (channelId !== undefined) {
    where.channelId = channelId;
  }
  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  const items = await prisma.channelBible.findMany({
    where: hasFields(where) ? where : undefined,
    orderBy: [{ channelId: "asc" }, { version: "desc" }]
  });

  for (const item of items) {
    assertSchemaValid(item.schemaId, item.json, 500, `Response channel-bible ${item.id}`);
  }

  return { data: items };
});

app.get("/channel-bible/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");

  const item = await prisma.channelBible.findUnique({ where: { id } });
  if (!item) {
    throw new ApiError(404, "ChannelBible not found");
  }

  assertSchemaValid(item.schemaId, item.json, 500, `Response channel-bible ${item.id}`);
  return { data: item };
});

app.post("/channel-bible", async (request, reply) => {
  const body = requireBodyObject(request.body);

  const channelId = requireString(body, "channelId");
  const version = requireInteger(body, "version");
  const hash = requireString(body, "hash");
  const schemaId = optionalString(body, "schemaId") ?? CHANNEL_BIBLE_SCHEMA_ID;
  const json = requireJsonValue(body, "json");
  const isActive = optionalBoolean(body, "isActive");

  assertSchemaValid(schemaId, json, 400, "Request channel-bible.json");

  const created = await prisma.$transaction(async (tx) => {
    if (isActive === true) {
      await tx.channelBible.updateMany({
        where: { channelId, isActive: true },
        data: { isActive: false }
      });
    }

    return tx.channelBible.create({
      data: {
        channelId,
        version,
        hash,
        schemaId,
        json,
        ...(isActive !== undefined ? { isActive } : {})
      }
    });
  });

  assertSchemaValid(created.schemaId, created.json, 500, `Response channel-bible ${created.id}`);

  return reply.code(201).send({ data: created });
});

app.put("/channel-bible/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");
  const body = requireBodyObject(request.body);

  const version = optionalInteger(body, "version");
  const hash = optionalString(body, "hash");
  const schemaId = optionalString(body, "schemaId");
  const json = optionalJsonValue(body, "json");
  const isActive = optionalBoolean(body, "isActive");

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.channelBible.findUnique({
      where: { id },
      select: {
        channelId: true,
        schemaId: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "ChannelBible not found");
    }

    const nextSchemaId = schemaId ?? existing.schemaId;

    if (json !== undefined) {
      assertSchemaValid(nextSchemaId, json, 400, "Request channel-bible.json");
    }

    if (isActive === true) {
      await tx.channelBible.updateMany({
        where: {
          channelId: existing.channelId,
          isActive: true,
          NOT: { id }
        },
        data: { isActive: false }
      });
    }

    const data: Prisma.ChannelBibleUpdateInput = {};
    if (version !== undefined) {
      data.version = version;
    }
    if (hash !== undefined) {
      data.hash = hash;
    }
    if (schemaId !== undefined) {
      data.schemaId = schemaId;
    }
    if (json !== undefined) {
      data.json = json;
    }
    if (isActive !== undefined) {
      data.isActive = isActive;
    }

    if (!hasFields(data)) {
      throw new ApiError(400, "No fields to update");
    }

    return tx.channelBible.update({
      where: { id },
      data
    });
  });

  assertSchemaValid(updated.schemaId, updated.json, 500, `Response channel-bible ${updated.id}`);

  return { data: updated };
});

app.delete("/channel-bible/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");

  const deleted = await prisma.channelBible.delete({ where: { id } });
  return { data: deleted };
});

app.post("/episodes", async (request, reply) => {
  const body = requireBodyObject(request.body);

  const channelId = requireString(body, "channelId");
  const topic = requireString(body, "topic");
  const targetDurationSec = optionalInteger(body, "targetDurationSec");
  const bibleId = optionalNullableString(body, "bibleId");
  const characterPackId = optionalNullableString(body, "characterPackId");
  const seasonId = optionalNullableString(body, "seasonId");
  const backlogItemId = optionalNullableString(body, "backlogItemId");
  const scheduledFor = optionalDate(body, "scheduledFor");
  const jobType = optionalJobType(body, "jobType") ?? JobTypeRuntime.GENERATE_BEATS;
  const maxAttempts = optionalInteger(body, "maxAttempts") ?? 2;
  const schemaChecks = optionalSchemaChecks(body, "schemaChecks");

  if (targetDurationSec !== undefined && targetDurationSec <= 0) {
    throw new ApiError(400, "targetDurationSec must be greater than 0");
  }

  if (maxAttempts <= 0) {
    throw new ApiError(400, "maxAttempts must be greater than 0");
  }

  const created = await prisma.$transaction(async (tx) => {
    const episode = await tx.episode.create({
      data: {
        channelId,
        topic,
        ...(targetDurationSec !== undefined ? { targetDurationSec } : {}),
        ...(bibleId !== undefined ? { bibleId } : {}),
        ...(characterPackId !== undefined ? { characterPackId } : {}),
        ...(seasonId !== undefined ? { seasonId } : {}),
        ...(backlogItemId !== undefined ? { backlogItemId } : {}),
        ...(scheduledFor !== undefined ? { scheduledFor } : {})
      }
    });

    const job = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: jobType,
        status: "QUEUED",
        progress: 0,
        maxAttempts
      }
    });

    await tx.jobLog.create({
      data: {
        jobId: job.id,
        level: "info",
        message: "Transition -> QUEUED",
        details: logDetails({ source: "api" })
      }
    });

    return { episode, job };
  });

  const payload: EpisodeJobPayload = {
    jobDbId: created.job.id,
    episodeId: created.episode.id,
    ...(schemaChecks && schemaChecks.length > 0 ? { schemaChecks } : {})
  };

  try {
    const queuedJob = await enqueueWithIdempotency(created.job.type, payload, maxAttempts);
    const bullmqJobId = String(queuedJob.id);

    const updatedJob = await prisma.job.update({
      where: { id: created.job.id },
      data: {
        status: "QUEUED",
        bullmqJobId,
        lastError: null,
        finishedAt: null
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: created.job.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: logDetails({ source: "api", bullmqJobId })
      }
    });

    return reply.code(201).send({
      data: {
        episode: created.episode,
        job: updatedJob,
        queue: {
          queueName: QUEUE_NAME,
          bullmqJobId
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const statusCode = error instanceof ApiError ? error.statusCode : 500;

    await prisma.job
      .update({
        where: { id: created.job.id },
        data: {
          status: "FAILED",
          lastError: stack ?? message,
          finishedAt: new Date()
        }
      })
      .catch(() => undefined);

    await prisma.jobLog
      .create({
        data: {
          jobId: created.job.id,
          level: "error",
          message: "Transition -> FAILED",
          details: logDetails({ source: "api", error: message, stack: stack ?? null })
        }
      })
      .catch(() => undefined);

    if (statusCode === 503 || isRedisUnavailableError(error)) {
      await markQueueUnavailable(error);
      throw new ApiError(503, "Redis unavailable");
    }

    throw new ApiError(500, `Failed to enqueue job: ${message}`);
  }
});

app.get("/jobs/:id", async (request) => {
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
    throw new ApiError(404, "Job not found");
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

app.get("/seasons", async (request) => {
  const channelId = optionalQueryString(request.query, "channelId");
  const isActive = optionalQueryBoolean(request.query, "isActive");

  const where: Prisma.SeasonWhereInput = {};
  if (channelId !== undefined) {
    where.channelId = channelId;
  }
  if (isActive !== undefined) {
    where.isActive = isActive;
  }

  const seasons = await prisma.season.findMany({
    where: hasFields(where) ? where : undefined,
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }]
  });

  return { data: seasons };
});

app.get("/seasons/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");

  const season = await prisma.season.findUnique({
    where: { id },
    include: {
      slots: {
        orderBy: { scheduledDate: "asc" }
      },
      backlogItems: {
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!season) {
    throw new ApiError(404, "Season not found");
  }

  return { data: season };
});

app.post("/seasons", async (request, reply) => {
  const body = requireBodyObject(request.body);

  const channelId = requireString(body, "channelId");
  const name = requireString(body, "name");
  const startDate = requireDate(body, "startDate");
  const endDate = requireDate(body, "endDate");
  const episodesPerWeek = optionalInteger(body, "episodesPerWeek") ?? 3;
  const isActive = optionalBoolean(body, "isActive");

  if (endDate <= startDate) {
    throw new ApiError(400, "endDate must be later than startDate");
  }

  if (episodesPerWeek <= 0) {
    throw new ApiError(400, "episodesPerWeek must be greater than 0");
  }

  const season = await prisma.season.create({
    data: {
      channelId,
      name,
      startDate,
      endDate,
      episodesPerWeek,
      ...(isActive !== undefined ? { isActive } : {})
    }
  });

  return reply.code(201).send({ data: season });
});

app.put("/seasons/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");
  const body = requireBodyObject(request.body);

  const name = optionalString(body, "name");
  const startDate = optionalDate(body, "startDate");
  const endDate = optionalDate(body, "endDate");
  const episodesPerWeek = optionalInteger(body, "episodesPerWeek");
  const isActive = optionalBoolean(body, "isActive");

  if (episodesPerWeek !== undefined && episodesPerWeek <= 0) {
    throw new ApiError(400, "episodesPerWeek must be greater than 0");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.season.findUnique({
      where: { id },
      select: {
        startDate: true,
        endDate: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Season not found");
    }

    const nextStart = startDate ?? existing.startDate;
    const nextEnd = endDate ?? existing.endDate;

    if (nextEnd <= nextStart) {
      throw new ApiError(400, "endDate must be later than startDate");
    }

    const data: Prisma.SeasonUpdateInput = {};
    if (name !== undefined) {
      data.name = name;
    }
    if (startDate !== undefined) {
      data.startDate = startDate;
    }
    if (endDate !== undefined) {
      data.endDate = endDate;
    }
    if (episodesPerWeek !== undefined) {
      data.episodesPerWeek = episodesPerWeek;
    }
    if (isActive !== undefined) {
      data.isActive = isActive;
    }

    if (!hasFields(data)) {
      throw new ApiError(400, "No fields to update");
    }

    return tx.season.update({
      where: { id },
      data
    });
  });

  return { data: updated };
});

app.delete("/seasons/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");

  const deleted = await prisma.season.delete({ where: { id } });
  return { data: deleted };
});

app.get("/backlog", async (request) => {
  const channelId = optionalQueryString(request.query, "channelId");
  const seasonId = optionalQueryString(request.query, "seasonId");
  const status = optionalQueryEnum<PrismaBacklogStatus>(request.query, "status", BACKLOG_STATUS_SET);
  const limit = optionalQueryInteger(request.query, "limit") ?? 100;

  if (limit <= 0 || limit > 500) {
    throw new ApiError(400, "limit must be between 1 and 500");
  }

  const where: Prisma.BacklogItemWhereInput = {};
  if (channelId !== undefined) {
    where.channelId = channelId;
  }
  if (seasonId !== undefined) {
    where.seasonId = seasonId;
  }
  if (status !== undefined) {
    where.status = status;
  }

  const backlog = await prisma.backlogItem.findMany({
    where: hasFields(where) ? where : undefined,
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: limit,
    include: {
      episode: {
        select: {
          id: true,
          status: true,
          scheduledFor: true
        }
      }
    }
  });

  return { data: backlog };
});

app.get("/backlog/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");

  const item = await prisma.backlogItem.findUnique({
    where: { id },
    include: {
      episode: true,
      slots: {
        orderBy: { scheduledDate: "asc" }
      }
    }
  });

  if (!item) {
    throw new ApiError(404, "Backlog item not found");
  }

  return { data: item };
});

app.post("/backlog", async (request, reply) => {
  const body = requireBodyObject(request.body);

  const channelId = requireString(body, "channelId");
  const title = requireString(body, "title");
  const description = optionalNullableString(body, "description");
  const seasonId = optionalNullableString(body, "seasonId");
  const priority = optionalInteger(body, "priority") ?? 0;
  const status = optionalEnum<PrismaBacklogStatus>(body, "status", BACKLOG_STATUS_SET) ?? BacklogStatusRuntime.PENDING;

  const created = await prisma.backlogItem.create({
    data: {
      channelId,
      title,
      ...(description !== undefined ? { description } : {}),
      ...(seasonId !== undefined ? { seasonId } : {}),
      priority,
      status
    }
  });

  return reply.code(201).send({ data: created });
});

app.put("/backlog/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");
  const body = requireBodyObject(request.body);

  const title = optionalString(body, "title");
  const description = optionalNullableString(body, "description");
  const seasonId = optionalNullableString(body, "seasonId");
  const priority = optionalInteger(body, "priority");
  const status = optionalEnum<PrismaBacklogStatus>(body, "status", BACKLOG_STATUS_SET);

  const data: Prisma.BacklogItemUncheckedUpdateInput = {};
  if (title !== undefined) {
    data.title = title;
  }
  if (description !== undefined) {
    data.description = description;
  }
  if (seasonId !== undefined) {
    data.seasonId = seasonId;
  }
  if (priority !== undefined) {
    data.priority = priority;
  }
  if (status !== undefined) {
    data.status = status;
  }

  if (!hasFields(data)) {
    throw new ApiError(400, "No fields to update");
  }

  const updated = await prisma.backlogItem.update({
    where: { id },
    data
  });

  return { data: updated };
});

app.delete("/backlog/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");

  const deleted = await prisma.backlogItem.delete({ where: { id } });
  return { data: deleted };
});

app.post("/schedule/auto", async (request) => {
  const body = requireBodyObject(request.body);

  const seasonId = requireString(body, "seasonId");
  const startDate = optionalDate(body, "startDate");
  const days = optionalInteger(body, "days");
  const episodesPerWeek = optionalInteger(body, "episodesPerWeek");
  const maxAttempts = optionalInteger(body, "maxAttempts");
  const targetDurationSec = optionalInteger(body, "targetDurationSec");
  const jobType = optionalJobType(body, "jobType");
  const activeQueue = requireQueue();

  let result;
  try {
    result = await autoScheduleSeason(
      {
        prisma,
        queue: activeQueue,
        queueName: QUEUE_NAME
      },
      {
        seasonId,
        ...(startDate !== undefined ? { startDate } : {}),
        ...(days !== undefined ? { days } : {}),
        ...(episodesPerWeek !== undefined ? { episodesPerWeek } : {}),
        ...(maxAttempts !== undefined ? { maxAttempts } : {}),
        ...(targetDurationSec !== undefined ? { targetDurationSec } : {}),
        ...(jobType !== undefined ? { jobType } : {})
      }
    );
  } catch (error) {
    const statusCode =
      error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
        ? error.statusCode
        : undefined;

    if (statusCode === 503 || isRedisUnavailableError(error)) {
      await markQueueUnavailable(error);
      throw new ApiError(503, "Redis unavailable");
    }

    throw error;
  }

  return { data: result };
});

app.get("/experiments", async (request) => {
  const channelId = optionalQueryString(request.query, "channelId");
  const status = optionalQueryEnum<PrismaExperimentStatus>(request.query, "status", EXPERIMENT_STATUS_SET);

  const where: Prisma.ExperimentWhereInput = {};
  if (channelId !== undefined) {
    where.channelId = channelId;
  }
  if (status !== undefined) {
    where.status = status;
  }

  const experiments = await prisma.experiment.findMany({
    where: hasFields(where) ? where : undefined,
    orderBy: [{ createdAt: "desc" }],
    include: {
      variants: {
        orderBy: [{ key: "asc" }]
      }
    }
  });

  return { data: experiments };
});

app.get("/experiments/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");

  const experiment = await prisma.experiment.findUnique({
    where: { id },
    include: {
      variants: {
        orderBy: [{ key: "asc" }]
      }
    }
  });

  if (!experiment) {
    throw new ApiError(404, "Experiment not found");
  }

  return { data: experiment };
});

app.post("/experiments", async (request, reply) => {
  const body = requireBodyObject(request.body);

  const channelId = requireString(body, "channelId");
  const name = requireString(body, "name");
  const description = optionalNullableString(body, "description");
  const status = optionalEnum<PrismaExperimentStatus>(body, "status", EXPERIMENT_STATUS_SET) ?? ExperimentStatusRuntime.DRAFT;
  const startDate = optionalDate(body, "startDate");
  const endDate = optionalDate(body, "endDate");
  const variants = parseExperimentVariants(body, "variants");

  if (startDate && endDate && endDate <= startDate) {
    throw new ApiError(400, "endDate must be later than startDate");
  }

  const created = await prisma.$transaction(async (tx) => {
    const experiment = await tx.experiment.create({
      data: {
        channelId,
        name,
        ...(description !== undefined ? { description } : {}),
        status,
        ...(startDate !== undefined ? { startDate } : {}),
        ...(endDate !== undefined ? { endDate } : {})
      }
    });

    if (variants && variants.length > 0) {
      await tx.experimentVariant.createMany({
        data: variants.map((variant) => ({
          experimentId: experiment.id,
          key: variant.key,
          name: variant.name,
          weight: variant.weight,
          isControl: variant.isControl
        }))
      });
    }

    return tx.experiment.findUnique({
      where: { id: experiment.id },
      include: {
        variants: {
          orderBy: [{ key: "asc" }]
        }
      }
    });
  });

  return reply.code(201).send({ data: created });
});

app.put("/experiments/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");
  const body = requireBodyObject(request.body);

  const name = optionalString(body, "name");
  const description = optionalNullableString(body, "description");
  const status = optionalEnum<PrismaExperimentStatus>(body, "status", EXPERIMENT_STATUS_SET);
  const startDate = optionalDate(body, "startDate");
  const endDate = optionalDate(body, "endDate");
  const variants = parseExperimentVariants(body, "variants");

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.experiment.findUnique({
      where: { id },
      select: {
        startDate: true,
        endDate: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Experiment not found");
    }

    const nextStart = startDate ?? existing.startDate;
    const nextEnd = endDate ?? existing.endDate;

    if (nextStart && nextEnd && nextEnd <= nextStart) {
      throw new ApiError(400, "endDate must be later than startDate");
    }

    const data: Prisma.ExperimentUpdateInput = {};
    if (name !== undefined) {
      data.name = name;
    }
    if (description !== undefined) {
      data.description = description;
    }
    if (status !== undefined) {
      data.status = status;
    }
    if (startDate !== undefined) {
      data.startDate = startDate;
    }
    if (endDate !== undefined) {
      data.endDate = endDate;
    }

    if (!hasFields(data) && variants === undefined) {
      throw new ApiError(400, "No fields to update");
    }

    if (hasFields(data)) {
      await tx.experiment.update({
        where: { id },
        data
      });
    }

    if (variants !== undefined) {
      await tx.experimentVariant.deleteMany({
        where: { experimentId: id }
      });

      if (variants.length > 0) {
        await tx.experimentVariant.createMany({
          data: variants.map((variant) => ({
            experimentId: id,
            key: variant.key,
            name: variant.name,
            weight: variant.weight,
            isControl: variant.isControl
          }))
        });
      }
    }

    return tx.experiment.findUnique({
      where: { id },
      include: {
        variants: {
          orderBy: [{ key: "asc" }]
        }
      }
    });
  });

  return { data: updated };
});

app.delete("/experiments/:id", async (request) => {
  const id = requireRouteParam(request.params, "id");

  const deleted = await prisma.experiment.delete({ where: { id } });
  return { data: deleted };
});

app.post("/episodes/:id/metrics", async (request, reply) => {
  const episodeId = requireRouteParam(request.params, "id");
  const body = requireBodyObject(request.body);

  const metricKey = requireString(body, "metricKey");
  const value = requireNumber(body, "value");
  const observedAt = optionalDate(body, "observedAt") ?? new Date();
  const source = optionalString(body, "source") ?? "manual";
  const metricName = optionalString(body, "metricName");
  const unit = optionalString(body, "unit");
  const ingestionId = optionalString(body, "ingestionId");
  const experimentId = optionalNullableString(body, "experimentId");
  const variantId = optionalNullableString(body, "variantId");

  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    select: {
      id: true,
      channelId: true
    }
  });

  if (!episode) {
    throw new ApiError(404, "Episode not found");
  }

  let resolvedExperimentId: string | null = experimentId ?? null;
  let resolvedVariantId: string | null = variantId ?? null;

  if (resolvedExperimentId) {
    const experiment = await prisma.experiment.findUnique({
      where: { id: resolvedExperimentId },
      select: {
        id: true,
        channelId: true
      }
    });

    if (!experiment) {
      throw new ApiError(400, "experimentId is invalid");
    }

    if (experiment.channelId !== episode.channelId) {
      throw new ApiError(400, "experimentId does not belong to episode channel");
    }
  }

  if (resolvedVariantId) {
    const variant = await prisma.experimentVariant.findUnique({
      where: { id: resolvedVariantId },
      include: {
        experiment: {
          select: {
            id: true,
            channelId: true
          }
        }
      }
    });

    if (!variant) {
      throw new ApiError(400, "variantId is invalid");
    }

    if (variant.experiment.channelId !== episode.channelId) {
      throw new ApiError(400, "variantId does not belong to episode channel");
    }

    if (resolvedExperimentId && variant.experimentId !== resolvedExperimentId) {
      throw new ApiError(400, "variantId does not belong to experimentId");
    }

    resolvedExperimentId = resolvedExperimentId ?? variant.experimentId;
  }

  const metric = await prisma.metric.upsert({
    where: {
      channelId_key: {
        channelId: episode.channelId,
        key: metricKey
      }
    },
    update: {
      ...(metricName !== undefined ? { displayName: metricName } : {}),
      ...(unit !== undefined ? { unit } : {})
    },
    create: {
      channelId: episode.channelId,
      key: metricKey,
      ...(metricName !== undefined ? { displayName: metricName } : {}),
      ...(unit !== undefined ? { unit } : {})
    }
  });

  const resolvedIngestionId =
    ingestionId ??
    buildDefaultIngestionId({
      episodeId,
      metricKey,
      observedAt,
      source,
      experimentId: resolvedExperimentId,
      variantId: resolvedVariantId
    });

  const existed = await prisma.episodeMetric.findUnique({
    where: { ingestionId: resolvedIngestionId },
    select: { id: true }
  });

  const stored = await prisma.episodeMetric.upsert({
    where: { ingestionId: resolvedIngestionId },
    create: {
      episodeId,
      metricId: metric.id,
      value,
      observedAt,
      source,
      ingestionId: resolvedIngestionId,
      experimentId: resolvedExperimentId,
      variantId: resolvedVariantId
    },
    update: {
      metricId: metric.id,
      value,
      observedAt,
      source,
      experimentId: resolvedExperimentId,
      variantId: resolvedVariantId
    },
    include: {
      metric: true,
      experiment: true,
      variant: true
    }
  });

  return reply.code(existed ? 200 : 201).send({
    data: {
      created: !existed,
      episodeMetric: stored
    }
  });
});

app.get("/reports/weekly", async (request, reply) => {
  const channelId = optionalQueryString(request.query, "channelId");
  if (!channelId) {
    throw new ApiError(400, "channelId query is required");
  }

  const weeks = optionalQueryInteger(request.query, "weeks") ?? 1;
  if (weeks <= 0 || weeks > 26) {
    throw new ApiError(400, "weeks query must be between 1 and 26");
  }

  const weekStartParam = optionalQueryString(request.query, "weekStart");
  const weekStart = weekStartParam ? startOfUtcWeek(parseDateValue(weekStartParam, "weekStart")) : startOfUtcWeek(new Date());

  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + weeks * 7);

  const rows = await prisma.episodeMetric.findMany({
    where: {
      episode: {
        channelId
      },
      observedAt: {
        gte: weekStart,
        lt: weekEndExclusive
      }
    },
    include: {
      metric: {
        select: {
          key: true
        }
      },
      experiment: {
        select: {
          id: true,
          name: true
        }
      },
      variant: {
        select: {
          id: true,
          key: true
        }
      }
    },
    orderBy: [{ observedAt: "asc" }, { id: "asc" }]
  });

  const report = buildWeeklyReport(
    rows.map((row) => ({
      observedAt: row.observedAt,
      metricKey: row.metric.key,
      value: row.value,
      experimentId: row.experiment?.id ?? null,
      experimentName: row.experiment?.name ?? null,
      variantId: row.variant?.id ?? null,
      variantKey: row.variant?.key ?? null
    })),
    weekStart,
    weeks
  );

  const format = optionalQueryString(request.query, "format") ?? "json";

  if (format === "csv") {
    const csv = weeklyReportToCsv(report);
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename=weekly_report_${report.weekStart}.csv`);
    return reply.send(csv);
  }

  if (format !== "json") {
    throw new ApiError(400, "format query must be json or csv");
  }

  return {
    data: {
      channelId,
      generatedAt: new Date().toISOString(),
      report
    }
  };
});

registerPublishRoutes({
  app,
  prisma,
  queue: queueFacade
});


app.addHook("onClose", async () => {
  if (queueRetryTimer !== null) {
    clearTimeout(queueRetryTimer);
    queueRetryTimer = null;
  }
  await queueFacade.close();
  await prisma.$disconnect();
});

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  app.log.info({ signal }, "Shutting down API server");
  await app.close();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

async function start(): Promise<void> {
  await initQueue();
  await app.listen({ host: API_HOST, port: API_PORT });
  app.log.info(
    {
      host: API_HOST,
      port: API_PORT,
      queue: QUEUE_NAME,
      redis: redisHealth,
      authEnabled: API_KEY.length > 0
    },
    "API server started"
  );
}

start().catch(async (error) => {
  app.log.error(error);
  await shutdown("startup_error");
  process.exit(1);
});












