import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { Prisma, PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import {
  analyticsPaths,
  analyzeDropoffs,
  buildRepurposePlan,
  buildRetentionCurve,
  hasFile,
  parseRetentionCsv,
  parseShotTimingsFromDocument,
  readRetentionCurve,
  saveDropoffAnalysis,
  saveRepurposePlan,
  saveRetentionCurve,
  type RetentionPoint
} from "@ec/analytics";
import { createDefaultNotifier, estimateJobCost } from "@ec/ops";
import { writeAuditLog } from "./auditService";
import type { EpisodeJobPayload } from "./scheduleService";
import { enqueueWithResilience } from "./enqueueWithResilience";

type JsonRecord = Record<string, unknown>;
type HttpError = Error & { statusCode: number; details?: unknown };
type ActiveJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED";

type RepurposeJobInfo = {
  candidateId: string;
  segmentKey: string;
  jobId: string;
  bullmqJobId: string | null;
  status: ActiveJobStatus;
};

const notifier = createDefaultNotifier();
const DEFAULT_BACKOFF_MS = 1000;
const MAX_RETRY_ATTEMPTS = 5;

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function requireBodyObject(body: unknown): JsonRecord {
  if (!isRecord(body)) {
    throw createHttpError(400, "Request body must be a JSON object");
  }
  return body;
}

function optionalString(obj: JsonRecord, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, `${field} must be a non-empty string`);
  }

  return value.trim();
}

function optionalPositiveNumber(obj: JsonRecord, field: string): number | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw createHttpError(400, `${field} must be a positive number`);
  }

  return value;
}

function optionalPositiveInteger(obj: JsonRecord, field: string): number | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw createHttpError(400, `${field} must be a positive integer`);
  }

  return value;
}

function optionalStringArray(obj: JsonRecord, field: string): string[] | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw createHttpError(400, `${field} must be an array of non-empty strings`);
  }

  const out = value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw createHttpError(400, `${field}[${index}] must be a non-empty string`);
    }
    return item.trim();
  });

  return out;
}

function optionalQueryNumber(query: unknown, field: string): number | undefined {
  if (!isRecord(query)) {
    return undefined;
  }

  const value = query[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, `${field} query must be a number`);
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createHttpError(400, `${field} query must be a positive number`);
  }

  return parsed;
}

function parseRetentionPointsFromJson(body: JsonRecord, field: string): RetentionPoint[] | undefined {
  const value = body[field];
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw createHttpError(400, `${field} must be an array`);
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw createHttpError(400, `${field}[${index}] must be an object`);
    }

    const timeSec = item.timeSec;
    const retentionPct = item.retentionPct;

    if (typeof timeSec !== "number" || !Number.isFinite(timeSec)) {
      throw createHttpError(400, `${field}[${index}].timeSec must be a finite number`);
    }

    if (typeof retentionPct !== "number" || !Number.isFinite(retentionPct)) {
      throw createHttpError(400, `${field}[${index}].retentionPct must be a finite number`);
    }

    return { timeSec, retentionPct };
  });
}

function logDetails(value: JsonRecord): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readStringDetail(details: Prisma.JsonValue | null, key: string): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  const value = (details as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function getRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../../");
}

function getAnalyticsOutputRoot(): string {
  return path.join(getRepoRoot(), "out", "analytics");
}

function normalizeRetryConfig(input: {
  maxAttempts?: number;
  backoffMs?: number;
}): { maxAttempts: number; backoffMs: number } {
  const maxAttempts = Math.min(Math.max(1, input.maxAttempts ?? 2), MAX_RETRY_ATTEMPTS);
  const backoffMs = Math.max(100, input.backoffMs ?? DEFAULT_BACKOFF_MS);

  return {
    maxAttempts,
    backoffMs
  };
}

async function ensureEpisodeExists(prisma: PrismaClient, episodeId: string): Promise<{ id: string; topic: string }> {
  const episode = await prisma.episode.findUnique({
    where: { id: episodeId },
    select: {
      id: true,
      topic: true
    }
  });

  if (!episode) {
    throw createHttpError(404, "Episode not found");
  }

  return episode;
}

async function loadShotTimings(prisma: PrismaClient, episodeId: string) {
  const shotDoc = await prisma.shotDoc.findUnique({
    where: { episodeId },
    select: {
      json: true
    }
  });

  if (!shotDoc) {
    return [];
  }

  return parseShotTimingsFromDocument(shotDoc.json);
}

async function buildExistingRepurposeJobMap(prisma: PrismaClient, episodeId: string) {
  const jobs = await prisma.job.findMany({
    where: {
      episodeId,
      type: "GENERATE_METADATA",
      status: { in: ["QUEUED", "RUNNING", "SUCCEEDED"] }
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      logs: {
        where: {
          message: "Repurpose short candidate"
        },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  const map = new Map<string, RepurposeJobInfo>();

  for (const job of jobs) {
    const details = job.logs[0]?.details ?? null;
    const segmentKey = readStringDetail(details, "segmentKey");
    const candidateId = readStringDetail(details, "candidateId") ?? "unknown";

    if (!segmentKey || map.has(segmentKey)) {
      continue;
    }

    map.set(segmentKey, {
      candidateId,
      segmentKey,
      jobId: job.id,
      bullmqJobId: job.bullmqJobId,
      status: job.status as ActiveJobStatus
    });
  }

  return map;
}

export function registerAnalyticsRoutes(input: {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue?: Queue<EpisodeJobPayload>;
  queueName?: string;
}): void {
  const { app, prisma } = input;

  const queueName = input.queueName ?? input.queue?.name ?? "episode-jobs";
  let ownsQueue = false;

  const queue =
    input.queue ??
    (() => {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) {
        throw createHttpError(500, "REDIS_URL is required for repurpose enqueue");
      }

      ownsQueue = true;
      return new Queue<EpisodeJobPayload>(queueName, {
        connection: { url: redisUrl }
      });
    })();

  if (ownsQueue) {
    app.addHook("onClose", async () => {
      await queue.close();
    });
  }

  app.post("/analytics/retention", async (request, reply) => {
    try {
      const body = requireBodyObject(request.body);

      const episodeId = optionalString(body, "episodeId");
      if (!episodeId) {
        throw createHttpError(400, "episodeId is required");
      }

      const csv = optionalString(body, "csv");
      const pointsFromJson = parseRetentionPointsFromJson(body, "points");

      if ((csv === undefined && pointsFromJson === undefined) || (csv !== undefined && pointsFromJson !== undefined)) {
        throw createHttpError(400, "Provide exactly one of csv or points");
      }

      const source = optionalString(body, "source") ?? (csv ? "manual_csv" : "manual_json");
      const minDropPct = optionalPositiveNumber(body, "minDropPct");
      const mergeGapSec = optionalPositiveNumber(body, "mergeGapSec");

      await ensureEpisodeExists(prisma, episodeId);

      const points = csv ? parseRetentionCsv(csv) : pointsFromJson!;
      const curve = buildRetentionCurve({
        episodeId,
        points,
        source
      });

      const shotTimings = await loadShotTimings(prisma, episodeId);
      const analysis = analyzeDropoffs(curve, shotTimings, {
        ...(minDropPct !== undefined ? { minDropPct } : {}),
        ...(mergeGapSec !== undefined ? { mergeGapSec } : {})
      });

      const outputRoot = getAnalyticsOutputRoot();
      const retentionPath = saveRetentionCurve(outputRoot, curve);
      const dropoffPath = saveDropoffAnalysis(outputRoot, analysis);

      await writeAuditLog({
        prisma,
        request,
        statusCode: 201,
        success: true,
        action: "analytics.retention.ingest",
        details: {
          episodeId,
          pointCount: curve.points.length,
          dropoffCount: analysis.segments.length
        }
      });

      return reply.code(201).send({
        data: {
          episodeId,
          retentionPath,
          dropoffPath,
          pointCount: curve.points.length,
          durationSec: curve.durationSec,
          dropoffCount: analysis.segments.length,
          segments: analysis.segments
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "analytics.retention.ingest",
        errorMessage: message
      });

      throw error;
    }
  });

  app.get("/analytics/episode/:id/dropoffs", async (request) => {
    try {
      const episodeId = requireRouteParam(request.params, "id");

      await ensureEpisodeExists(prisma, episodeId);

      const minDropPct = optionalQueryNumber(request.query, "minDropPct");
      const mergeGapSec = optionalQueryNumber(request.query, "mergeGapSec");

      const outputRoot = getAnalyticsOutputRoot();
      const paths = analyticsPaths(outputRoot, episodeId);

      if (!hasFile(paths.retentionPath)) {
        throw createHttpError(404, "Retention data not found. POST /analytics/retention first.");
      }

      const curve = readRetentionCurve(paths.retentionPath);
      const shotTimings = await loadShotTimings(prisma, episodeId);
      const analysis = analyzeDropoffs(curve, shotTimings, {
        ...(minDropPct !== undefined ? { minDropPct } : {}),
        ...(mergeGapSec !== undefined ? { mergeGapSec } : {})
      });

      const dropoffPath = saveDropoffAnalysis(outputRoot, analysis);

      await writeAuditLog({
        prisma,
        request,
        statusCode: 200,
        success: true,
        action: "analytics.dropoffs.get",
        details: {
          episodeId,
          dropoffCount: analysis.segments.length
        }
      });

      return {
        data: {
          episodeId,
          dropoffPath,
          analysis
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "analytics.dropoffs.get",
        errorMessage: message
      });

      throw error;
    }
  });

  app.post("/repurpose/:episodeId", async (request, reply) => {
    try {
      const episodeId = requireRouteParam(request.params, "episodeId");
      const body = request.body === undefined ? {} : requireBodyObject(request.body);

      const maxShorts = optionalPositiveInteger(body, "maxShorts");
      const languages = optionalStringArray(body, "languages");
      const minDropPct = optionalPositiveNumber(body, "minDropPct");
      const mergeGapSec = optionalPositiveNumber(body, "mergeGapSec");
      const requestMaxAttempts = optionalPositiveInteger(body, "maxAttempts");
      const requestBackoffMs = optionalPositiveInteger(body, "backoffMs");

      const retry = normalizeRetryConfig({
        maxAttempts: requestMaxAttempts,
        backoffMs: requestBackoffMs
      });

      const episode = await ensureEpisodeExists(prisma, episodeId);
      const outputRoot = getAnalyticsOutputRoot();
      const paths = analyticsPaths(outputRoot, episodeId);

      if (!hasFile(paths.retentionPath)) {
        throw createHttpError(400, "Retention data not found. POST /analytics/retention first.");
      }

      const curve = readRetentionCurve(paths.retentionPath);
      const shotTimings = await loadShotTimings(prisma, episodeId);
      const analysis = analyzeDropoffs(curve, shotTimings, {
        ...(minDropPct !== undefined ? { minDropPct } : {}),
        ...(mergeGapSec !== undefined ? { mergeGapSec } : {})
      });

      const dropoffPath = saveDropoffAnalysis(outputRoot, analysis);

      const plan = buildRepurposePlan({
        episodeId,
        topic: episode.topic,
        analysis,
        ...(maxShorts !== undefined ? { maxShorts } : {}),
        ...(languages !== undefined ? { languages } : {})
      });

      const repurposePath = saveRepurposePlan(outputRoot, plan);

      const existingBySegment = await buildExistingRepurposeJobMap(prisma, episodeId);
      const created: RepurposeJobInfo[] = [];
      const reused: RepurposeJobInfo[] = [];

      for (const candidate of plan.shorts) {
        const existing = existingBySegment.get(candidate.segmentKey);
        if (existing) {
          reused.push(existing);
          continue;
        }

        const cost = estimateJobCost({
          estimatedApiCalls: 2,
          estimatedRenderSeconds: candidate.durationSec,
          estimatedAudioSeconds: candidate.durationSec
        });

        const job = await prisma.job.create({
          data: {
            episodeId,
            type: "GENERATE_METADATA",
            status: "QUEUED",
            progress: 0,
            maxAttempts: retry.maxAttempts,
            retryBackoffMs: retry.backoffMs,
            estimatedRenderSeconds: cost.estimatedRenderSeconds,
            estimatedAudioSeconds: cost.estimatedAudioSeconds,
            estimatedApiCalls: cost.estimatedApiCalls,
            estimatedCostUsd: cost.estimatedCostUsd
          }
        });

        await prisma.jobLog.create({
          data: {
            jobId: job.id,
            level: "info",
            message: "Transition -> QUEUED",
            details: logDetails({
              source: "api:repurpose",
              queueName,
              segmentKey: candidate.segmentKey,
              candidateId: candidate.id,
              maxAttempts: retry.maxAttempts,
              backoffMs: retry.backoffMs,
              estimatedCostUsd: cost.estimatedCostUsd
            })
          }
        });

        await prisma.jobLog.create({
          data: {
            jobId: job.id,
            level: "info",
            message: "Repurpose short candidate",
            details: logDetails({
              source: "api:repurpose",
              segmentKey: candidate.segmentKey,
              candidateId: candidate.id,
              startSec: candidate.startSec,
              endSec: candidate.endSec,
              durationSec: candidate.durationSec,
              score: candidate.score,
              title: candidate.title
            })
          }
        });

        const payload: EpisodeJobPayload = {
          jobDbId: job.id,
          episodeId,
          schemaChecks: []
        };

        try {
          const enqueueResult = await enqueueWithResilience({
            queue,
            name: "GENERATE_METADATA",
            payload,
            maxAttempts: retry.maxAttempts,
            backoffMs: retry.backoffMs,
            maxEnqueueRetries: 2,
            retryDelayMs: 200,
            redisUnavailableAsHttp503: true
          });
          const bullmqJobId = String(enqueueResult.job.id);

          await prisma.job.update({
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
              details: logDetails({
                source: "api:repurpose",
                queueName,
                bullmqJobId,
                segmentKey: candidate.segmentKey,
                candidateId: candidate.id,
                enqueueMode: enqueueResult.mode,
                enqueueAttemptCount: enqueueResult.attemptCount,
                enqueueErrorSummary: enqueueResult.errorSummary
              })
            }
          });

          const info: RepurposeJobInfo = {
            candidateId: candidate.id,
            segmentKey: candidate.segmentKey,
            jobId: job.id,
            bullmqJobId,
            status: "QUEUED"
          };

          created.push(info);
          existingBySegment.set(candidate.segmentKey, info);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;

          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              lastError: stack ?? message,
              finishedAt: new Date()
            }
          });

          await prisma.jobLog.create({
            data: {
              jobId: job.id,
              level: "error",
              message: "Transition -> FAILED",
              details: logDetails({
                source: "api:repurpose",
                segmentKey: candidate.segmentKey,
                candidateId: candidate.id,
                error: message,
                stack: stack ?? null
              })
            }
          });

          await notifier.notify({
            source: "api:repurpose",
            title: "Repurpose enqueue failed",
            level: "error",
            body: `Failed to enqueue repurpose job for episode ${episodeId}.`,
            metadata: {
              segmentKey: candidate.segmentKey,
              candidateId: candidate.id,
              error: message
            }
          });

          throw createHttpError(500, `Failed to enqueue repurpose job: ${message}`);
        }
      }

      await writeAuditLog({
        prisma,
        request,
        statusCode: 201,
        success: true,
        action: "analytics.repurpose.create",
        details: {
          episodeId,
          createdJobs: created.length,
          reusedJobs: reused.length,
          shortsCount: plan.shorts.length
        }
      });

      return reply.code(201).send({
        data: {
          episodeId,
          dropoffPath,
          repurposePath,
          repurpose: plan,
          retry: {
            maxAttempts: retry.maxAttempts,
            backoffMs: retry.backoffMs,
            strategy: "exponential"
          },
          jobs: {
            created,
            reused
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      await writeAuditLog({
        prisma,
        request,
        statusCode,
        success: false,
        action: "analytics.repurpose.create",
        errorMessage: message
      });

      throw error;
    }
  });
}
