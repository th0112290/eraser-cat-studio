import type { FastifyInstance } from "fastify";
import { JobStatus, JobType, type Prisma, type PrismaClient } from "@prisma/client";
import { createDefaultNotifier } from "../../../../packages/ops/src/index";
import { writeAuditLog } from "./auditService";

type JsonRecord = Record<string, unknown>;
type HttpError = Error & { statusCode: number; details?: unknown };
type JobStatusValue = (typeof JobStatus)[keyof typeof JobStatus];
type JobTypeValue = (typeof JobType)[keyof typeof JobType];

const notifier = createDefaultNotifier();
const JOB_STATUS_SET = new Set<string>(Object.values(JobStatus));
const JOB_TYPE_SET = new Set<string>(Object.values(JobType));

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalQueryString(query: unknown, field: string): string | undefined {
  if (!isRecord(query)) {
    return undefined;
  }

  const value = query[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, `${field} query must be a non-empty string`);
  }

  return value.trim();
}

function optionalQueryInteger(query: unknown, field: string): number | undefined {
  const value = optionalQueryString(query, field);
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw createHttpError(400, `${field} query must be an integer`);
  }

  return parsed;
}

function optionalQueryDate(query: unknown, field: string): Date | undefined {
  const value = optionalQueryString(query, field);
  if (value === undefined) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, `${field} query must be an ISO date`);
  }

  return date;
}

function startOfUtcWeek(date: Date): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy;
}

function addUtcWeeks(date: Date, weeks: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + weeks * 7);
  return copy;
}

function weekKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function asNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}

function asInt(value: unknown): number {
  return Math.round(asNumber(value));
}

export function registerAdminOpsRoutes(input: {
  app: FastifyInstance;
  prisma: PrismaClient;
}): void {
  const { app, prisma } = input;

  app.get("/admin/jobs", async (request) => {
    try {
      const episodeId = optionalQueryString(request.query, "episodeId");
      const status = optionalQueryString(request.query, "status");
      const type = optionalQueryString(request.query, "type");
      const from = optionalQueryDate(request.query, "from");
      const to = optionalQueryDate(request.query, "to");
      const limit = optionalQueryInteger(request.query, "limit") ?? 100;

      if (limit <= 0 || limit > 500) {
        throw createHttpError(400, "limit query must be between 1 and 500");
      }

      const where: Prisma.JobWhereInput = {};

      if (episodeId) {
        where.episodeId = episodeId;
      }

      if (status) {
        if (!JOB_STATUS_SET.has(status)) {
          throw createHttpError(400, "status query is invalid");
        }
        where.status = status as JobStatusValue;
      }

      if (type) {
        if (!JOB_TYPE_SET.has(type)) {
          throw createHttpError(400, "type query is invalid");
        }
        where.type = type as JobTypeValue;
      }

      if (from || to) {
        where.createdAt = {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {})
        };
      }

      const rows = await prisma.job.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: limit,
        include: {
          episode: {
            select: {
              id: true,
              topic: true,
              templateVersion: true,
              characterPackVersion: true,
              datasetVersionSnapshot: true
            }
          },
          logs: {
            orderBy: { createdAt: "desc" },
            take: 20
          }
        }
      });

      const data = rows.map((row) => ({
        id: row.id,
        episodeId: row.episodeId,
        type: row.type,
        status: row.status,
        progress: row.progress,
        attemptsMade: row.attemptsMade,
        maxAttempts: row.maxAttempts,
        retryBackoffMs: row.retryBackoffMs,
        bullmqJobId: row.bullmqJobId,
        estimatedRenderSeconds: row.estimatedRenderSeconds,
        estimatedAudioSeconds: row.estimatedAudioSeconds,
        estimatedApiCalls: row.estimatedApiCalls,
        estimatedCostUsd: row.estimatedCostUsd,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        lastError: row.lastError,
        episode: row.episode,
        logs: row.logs
      }));

      await writeAuditLog({
        prisma,
        request,
        statusCode: 200,
        success: true,
        action: "admin.jobs.list",
        details: { count: data.length }
      });

      return { data };
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
        action: "admin.jobs.list",
        errorMessage: message
      });

      throw error;
    }
  });

  app.get("/admin/costs/weekly", async (request) => {
    try {
      const channelId = optionalQueryString(request.query, "channelId");
      const weeks = optionalQueryInteger(request.query, "weeks") ?? 4;

      if (weeks <= 0 || weeks > 26) {
        throw createHttpError(400, "weeks query must be between 1 and 26");
      }

      const now = new Date();
      const currentWeekStart = startOfUtcWeek(now);
      const from = addUtcWeeks(currentWeekStart, -(weeks - 1));
      const to = addUtcWeeks(currentWeekStart, 1);

      const rows = await prisma.job.findMany({
        where: {
          createdAt: {
            gte: from,
            lt: to
          },
          ...(channelId
            ? {
                episode: {
                  channelId
                }
              }
            : {})
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
          estimatedRenderSeconds: true,
          estimatedAudioSeconds: true,
          estimatedApiCalls: true,
          estimatedCostUsd: true
        },
        orderBy: { createdAt: "asc" }
      });

      const buckets = new Map<
        string,
        {
          weekStart: string;
          jobCount: number;
          failedJobs: number;
          estimatedRenderSeconds: number;
          estimatedAudioSeconds: number;
          estimatedApiCalls: number;
          estimatedCostUsd: number;
        }
      >();

      for (let index = 0; index < weeks; index += 1) {
        const weekStart = weekKey(addUtcWeeks(from, index));
        buckets.set(weekStart, {
          weekStart,
          jobCount: 0,
          failedJobs: 0,
          estimatedRenderSeconds: 0,
          estimatedAudioSeconds: 0,
          estimatedApiCalls: 0,
          estimatedCostUsd: 0
        });
      }

      for (const row of rows) {
        const key = weekKey(startOfUtcWeek(row.createdAt));
        const bucket = buckets.get(key);
        if (!bucket) {
          continue;
        }

        bucket.jobCount += 1;
        if (row.status === "FAILED") {
          bucket.failedJobs += 1;
        }

        bucket.estimatedRenderSeconds += asInt(row.estimatedRenderSeconds);
        bucket.estimatedAudioSeconds += asInt(row.estimatedAudioSeconds);
        bucket.estimatedApiCalls += asInt(row.estimatedApiCalls);
        bucket.estimatedCostUsd += asNumber(row.estimatedCostUsd);
      }

      const weekly = Array.from(buckets.values()).map((bucket) => ({
        ...bucket,
        estimatedCostUsd: Math.round(bucket.estimatedCostUsd * 10000) / 10000
      }));

      const totals = weekly.reduce(
        (acc, bucket) => {
          acc.jobCount += bucket.jobCount;
          acc.failedJobs += bucket.failedJobs;
          acc.estimatedRenderSeconds += bucket.estimatedRenderSeconds;
          acc.estimatedAudioSeconds += bucket.estimatedAudioSeconds;
          acc.estimatedApiCalls += bucket.estimatedApiCalls;
          acc.estimatedCostUsd += bucket.estimatedCostUsd;
          return acc;
        },
        {
          jobCount: 0,
          failedJobs: 0,
          estimatedRenderSeconds: 0,
          estimatedAudioSeconds: 0,
          estimatedApiCalls: 0,
          estimatedCostUsd: 0
        }
      );

      totals.estimatedCostUsd = Math.round(totals.estimatedCostUsd * 10000) / 10000;

      const failureRate = totals.jobCount > 0 ? totals.failedJobs / totals.jobCount : 0;
      const failureThreshold = Number.parseFloat(process.env.ALERT_FAILURE_RATE_THRESHOLD ?? "0.35");

      if (Number.isFinite(failureThreshold) && failureRate >= failureThreshold && totals.failedJobs > 0) {
        await notifier.notify({
          source: "api:admin-costs",
          title: "High weekly failure rate",
          level: "warn",
          body: `Failure rate is ${(failureRate * 100).toFixed(1)}% in the selected window.`,
          metadata: {
            from: from.toISOString(),
            to: to.toISOString(),
            totals,
            threshold: failureThreshold
          }
        });
      }

      await writeAuditLog({
        prisma,
        request,
        statusCode: 200,
        success: true,
        action: "admin.costs.weekly",
        details: {
          weeks,
          channelId,
          totals
        }
      });

      return {
        data: {
          from: from.toISOString(),
          to: to.toISOString(),
          weeks,
          weekly,
          totals,
          failureRate: Math.round(failureRate * 10000) / 10000
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
        action: "admin.costs.weekly",
        errorMessage: message
      });

      throw error;
    }
  });
}
