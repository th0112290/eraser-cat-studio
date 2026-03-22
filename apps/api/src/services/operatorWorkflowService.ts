import fs from "node:fs";
import type { Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { UploadManifest } from "@ec/publish";
import { createPublishManifest, MockYouTubeUploader, readUploadManifest } from "@ec/publish";
import { estimateJobCost } from "@ec/ops";
import type { EpisodeJobPayload } from "./scheduleService";
import { enqueueWithResilience } from "./enqueueWithResilience";

type HttpError = Error & { statusCode: number; details?: unknown };

const DEMO_USER_EMAIL = "demo.extreme@example.com";
const DEMO_USER_NAME = "demo-extreme";
const DEMO_CHANNEL_NAME = "Extreme Demo Channel";
const DEMO_TOPIC = "Extreme Demo";
const DEMO_MAX_ATTEMPTS = 2;
const DEMO_BACKOFF_MS = 1000;

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

async function ensureDemoChannel(prisma: PrismaClient): Promise<{ id: string }> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { name: DEMO_USER_NAME },
    create: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME }
  });

  const existing = await prisma.channel.findFirst({
    where: { userId: user.id, name: DEMO_CHANNEL_NAME },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return { id: existing.id };
  }

  const created = await prisma.channel.create({
    data: { userId: user.id, name: DEMO_CHANNEL_NAME }
  });
  return { id: created.id };
}

type PublishLogDetails = {
  manifestPath: string | null;
  plannedPublishAt: string | null;
};

function detailsToRecord(details: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  return details as Record<string, unknown>;
}

function readStringDetail(details: Prisma.JsonValue | null, key: string): string | null {
  const record = detailsToRecord(details);
  if (!record) {
    return null;
  }
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function extractPublishLogDetails(logs: Array<{ details: Prisma.JsonValue | null }>): PublishLogDetails {
  for (const log of logs) {
    const manifestPath = readStringDetail(log.details, "manifestPath");
    const plannedPublishAt = readStringDetail(log.details, "plannedPublishAt");
    if (manifestPath || plannedPublishAt) {
      return {
        manifestPath: manifestPath ?? null,
        plannedPublishAt: plannedPublishAt ?? null
      };
    }
  }
  return {
    manifestPath: null,
    plannedPublishAt: null
  };
}

function readManifestSafely(manifestPath: string | null): UploadManifest | null {
  if (!manifestPath) {
    return null;
  }

  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    return readUploadManifest(manifestPath);
  } catch {
    return null;
  }
}

export async function createExtremeDemoRun(input: {
  prisma: PrismaClient;
  queue: Queue<EpisodeJobPayload>;
  queueName: string;
  alwaysCreateNewEpisode?: boolean;
}) {
  let createdJobId: string | null = null;

  try {
    const channel = await ensureDemoChannel(input.prisma);
    const episode = input.alwaysCreateNewEpisode
      ? await input.prisma.episode.create({
          data: {
            channelId: channel.id,
            topic: DEMO_TOPIC,
            targetDurationSec: 600
          }
        })
      : ((await input.prisma.episode.findFirst({
          where: { channelId: channel.id, topic: DEMO_TOPIC },
          orderBy: { createdAt: "desc" }
        })) ??
        (await input.prisma.episode.create({
          data: {
            channelId: channel.id,
            topic: DEMO_TOPIC,
            targetDurationSec: 600
          }
        })));

    const activeJob = await input.prisma.job.findFirst({
      where: {
        episodeId: episode.id,
        type: "GENERATE_BEATS",
        status: { in: ["QUEUED", "RUNNING"] }
      },
      orderBy: { createdAt: "desc" }
    });

    if (activeJob?.bullmqJobId) {
      return {
        idempotent: true,
        episodeId: episode.id,
        jobId: activeJob.id,
        bullmqJobId: activeJob.bullmqJobId,
        alwaysCreateNewEpisode: input.alwaysCreateNewEpisode === true
      };
    }

    const job =
      activeJob ??
      (await input.prisma.job.create({
        data: {
          episodeId: episode.id,
          type: "GENERATE_BEATS",
          status: "QUEUED",
          progress: 0,
          maxAttempts: DEMO_MAX_ATTEMPTS,
          retryBackoffMs: DEMO_BACKOFF_MS,
          ...estimateJobCost({
            estimatedApiCalls: 2
          })
        }
      }));
    createdJobId = activeJob ? null : job.id;

    if (!activeJob) {
      await input.prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: {
            source: "service:demo:extreme",
            maxAttempts: job.maxAttempts,
            backoffMs: job.retryBackoffMs
          } as Prisma.InputJsonValue
        }
      });
    }

    const enqueueResult = await enqueueWithResilience({
      queue: input.queue,
      name: "GENERATE_BEATS",
      payload: {
        jobDbId: job.id,
        episodeId: episode.id,
        schemaChecks: [],
        pipeline: {
          stopAfterPreview: false,
          autoRenderFinal: true
        }
      },
      maxAttempts: job.maxAttempts,
      backoffMs: job.retryBackoffMs,
      maxEnqueueRetries: 0,
      redisUnavailableAsHttp503: true
    });
    const bullmqJobId = String(enqueueResult.job.id);

    await input.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          bullmqJobId,
          lastError: null,
          finishedAt: null
        }
      });

      await tx.jobLog.create({
        data: {
          jobId: job.id,
          level: "info",
          message: activeJob ? "Transition -> REENQUEUED" : "Transition -> ENQUEUED",
          details: {
            source: "service:demo:extreme",
            queueName: input.queueName,
            bullmqJobId,
            enqueueMode: enqueueResult.mode,
            enqueueAttemptCount: enqueueResult.attemptCount,
            enqueueErrorSummary: enqueueResult.errorSummary
          } as Prisma.InputJsonValue
        }
      });
    });

    return {
      idempotent: false,
      episodeId: episode.id,
      jobId: job.id,
      bullmqJobId,
      alwaysCreateNewEpisode: input.alwaysCreateNewEpisode === true
    };
  } catch (error) {
    if (createdJobId) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      await input.prisma.job.update({
        where: { id: createdJobId },
        data: {
          status: "FAILED",
          lastError: stack ?? message,
          finishedAt: new Date()
        }
      });
      await input.prisma.jobLog.create({
        data: {
          jobId: createdJobId,
          level: "error",
          message: "Transition -> FAILED",
          details: {
            source: "service:demo:extreme",
            error: message,
            stack: stack ?? null
          } as Prisma.InputJsonValue
        }
      });
    }
    throw error;
  }
}

export async function createPublishJob(input: {
  prisma: PrismaClient;
  episodeId: string;
  plannedPublishAt?: Date;
  sourceFramePath?: string;
  renderOutputPath?: string;
  thumbnailTemplateName?: string;
  outputRootDir: string;
}) {
  let createdJobId: string | null = null;

  try {
    const episode = await input.prisma.episode.findUnique({
      where: { id: input.episodeId },
      select: { id: true, topic: true }
    });

    if (!episode) {
      throw createHttpError(404, "Episode not found");
    }

    const plannedPublishAt = input.plannedPublishAt ?? new Date();
    const plannedPublishAtIso = plannedPublishAt.toISOString();

    const existingPublishJob = await input.prisma.job.findFirst({
      where: {
        episodeId: input.episodeId,
        type: "PACKAGE_OUTPUTS"
      },
      orderBy: { createdAt: "desc" },
      include: {
        logs: {
          orderBy: { createdAt: "desc" },
          take: 20
        }
      }
    });

    if (existingPublishJob && existingPublishJob.status === "SUCCEEDED") {
      const details = extractPublishLogDetails(existingPublishJob.logs);
      if (details.plannedPublishAt === plannedPublishAtIso) {
        const manifest = readManifestSafely(details.manifestPath);
        if (manifest && details.manifestPath) {
          return {
            idempotent: true,
            episodeId: input.episodeId,
            status: existingPublishJob.status,
            publishAt: plannedPublishAtIso,
            jobId: existingPublishJob.id,
            manifestPath: details.manifestPath,
            manifest
          };
        }
      }
    }

    const cost = estimateJobCost({
      estimatedApiCalls: 3,
      estimatedRenderSeconds: 0,
      estimatedAudioSeconds: 0
    });

    const publishJob = await input.prisma.job.create({
      data: {
        episodeId: input.episodeId,
        type: "PACKAGE_OUTPUTS",
        status: "RUNNING",
        progress: 10,
        maxAttempts: 1,
        retryBackoffMs: 1000,
        startedAt: new Date(),
        estimatedRenderSeconds: cost.estimatedRenderSeconds,
        estimatedAudioSeconds: cost.estimatedAudioSeconds,
        estimatedApiCalls: cost.estimatedApiCalls,
        estimatedCostUsd: cost.estimatedCostUsd
      }
    });
    createdJobId = publishJob.id;

    await input.prisma.jobLog.create({
      data: {
        jobId: publishJob.id,
        level: "info",
        message: "Transition -> RUNNING",
        details: {
          source: "service:publish",
          plannedPublishAt: plannedPublishAtIso,
          estimatedCostUsd: cost.estimatedCostUsd
        } as Prisma.InputJsonValue
      }
    });

    const publishResult = await createPublishManifest(
      {
        episodeId: input.episodeId,
        topic: episode.topic,
        plannedPublishAt,
        outputRootDir: input.outputRootDir,
        sourceFramePath: input.sourceFramePath,
        renderOutputPath: input.renderOutputPath,
        thumbnailTemplateName: input.thumbnailTemplateName
      },
      new MockYouTubeUploader()
    );

    await input.prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id: publishJob.id },
        data: {
          status: "SUCCEEDED",
          progress: 100,
          finishedAt: new Date(),
          lastError: null
        }
      });

      await tx.jobLog.create({
        data: {
          jobId: publishJob.id,
          level: "info",
          message: "Publish manifest stored",
          details: {
            source: "service:publish",
            plannedPublishAt: plannedPublishAtIso,
            manifestPath: publishResult.manifestPath,
            uploadStatus: publishResult.manifest.status,
            externalVideoId: publishResult.manifest.upload.externalVideoId,
            watchUrl: publishResult.manifest.upload.watchUrl
          } as Prisma.InputJsonValue
        }
      });

      await tx.jobLog.create({
        data: {
          jobId: publishJob.id,
          level: "info",
          message: "Transition -> SUCCEEDED",
          details: {
            source: "service:publish",
            plannedPublishAt: plannedPublishAtIso,
            manifestPath: publishResult.manifestPath
          } as Prisma.InputJsonValue
        }
      });
    });

    return {
      idempotent: false,
      episodeId: input.episodeId,
      status: "SUCCEEDED",
      publishAt: plannedPublishAtIso,
      jobId: publishJob.id,
      manifestPath: publishResult.manifestPath,
      manifest: publishResult.manifest
    };
  } catch (error) {
    if (createdJobId) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      await input.prisma.job.update({
        where: { id: createdJobId },
        data: {
          status: "FAILED",
          lastError: stack ?? message,
          finishedAt: new Date()
        }
      });
      await input.prisma.jobLog.create({
        data: {
          jobId: createdJobId,
          level: "error",
          message: "Transition -> FAILED",
          details: {
            source: "service:publish",
            error: message,
            stack: stack ?? null
          } as Prisma.InputJsonValue
        }
      });
    }
    throw error;
  }
}
