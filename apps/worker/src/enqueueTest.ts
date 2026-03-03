import { bootstrapEnv } from "./bootstrapEnv";
import { EPISODE_JOB_NAME, getEpisodeOutputPaths, queue } from "./queue";
import type { EpisodeJobPayload } from "./queue";
import type { Job, Prisma } from "@prisma/client";
import type { JobsOptions } from "bullmq";
import { DEFAULT_RETRY_BACKOFF_MS, MAX_JOB_ATTEMPTS } from "./queue";
import { estimateJobCost } from "@ec/ops";
import fs from "node:fs";

bootstrapEnv();

const prismaModule = await import("@prisma/client");
const { PrismaClient, Prisma: PrismaRuntime } = prismaModule;
const prisma = new PrismaClient();

const TEST_USER_EMAIL = "test@example.com";
const TEST_USER_NAME = "tester";
const TEST_CHANNEL_NAME = "Eraser Cat Economy";
const TEST_EPISODE_TOPIC = "Pipeline Test Episode";
const WAIT_TIMEOUT_MS = 180_000;
const WAIT_INTERVAL_MS = 2_000;

type ActiveJobStatus = "QUEUED" | "RUNNING";

let activeJobId: string | null = null;

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (Array.isArray(value)) {
    const out: Array<Prisma.InputJsonValue | null> = [];
    for (const entry of value) {
      out.push(toPrismaJsonValue(entry));
    }
    return out;
  }

  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue | null> = {};

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) {
        continue;
      }
      out[key] = toPrismaJsonValue(entry);
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
    data: {
      jobId,
      level,
      message,
      details: details === undefined ? undefined : toPrismaJson(details)
    }
  });
}

async function findOrCreateChannel(userId: string) {
  const existing = await prisma.channel.findFirst({
    where: { userId, name: TEST_CHANNEL_NAME },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return existing;
  }

  return prisma.channel.create({
    data: { userId, name: TEST_CHANNEL_NAME }
  });
}

async function findOrCreateEpisode(channelId: string) {
  const existing = await prisma.episode.findFirst({
    where: { channelId, topic: TEST_EPISODE_TOPIC },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    return existing;
  }

  return prisma.episode.create({
    data: { channelId, topic: TEST_EPISODE_TOPIC }
  });
}

async function findOrCreateActiveJob(episodeId: string): Promise<{ job: Job; created: boolean }> {
  const existing = await prisma.job.findFirst({
    where: {
      episodeId,
      type: EPISODE_JOB_NAME,
      status: { in: ["QUEUED", "RUNNING"] satisfies ActiveJobStatus[] }
    },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    return { job: existing, created: false };
  }

  const job = await prisma.job.create({
    data: {
      episodeId,
      type: EPISODE_JOB_NAME,
      status: "QUEUED",
      progress: 0,
      maxAttempts: Math.min(2, MAX_JOB_ATTEMPTS),
      retryBackoffMs: DEFAULT_RETRY_BACKOFF_MS,
      ...estimateJobCost({
        estimatedApiCalls: 2
      })
    }
  });

  await logJob(job.id, "info", "Transition -> QUEUED", {
    source: "enqueue:test"
  });

  return { job, created: true };
}

async function addToQueue(job: Job, payload: EpisodeJobPayload) {
  const addOptions: JobsOptions = {
    jobId: job.id,
    attempts: job.maxAttempts,
    backoff: {
      type: "exponential",
      delay: job.retryBackoffMs
    },
    removeOnComplete: false,
    removeOnFail: false
  };

  try {
    return await queue.add(EPISODE_JOB_NAME, payload, addOptions);
  } catch (error) {
    const existing = await queue.getJob(job.id);
    if (existing) {
      return existing;
    }
    throw error;
  }
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: { name: TEST_USER_NAME },
    create: { email: TEST_USER_EMAIL, name: TEST_USER_NAME }
  });

  const channel = await findOrCreateChannel(user.id);
  const episode = await findOrCreateEpisode(channel.id);
  const { job, created } = await findOrCreateActiveJob(episode.id);
  activeJobId = job.id;

  const payload: EpisodeJobPayload = {
    jobDbId: job.id,
    episodeId: episode.id,
    schemaChecks: [],
    pipeline: {
      autoRenderFinal: false,
      story: {
        bibleRef: "channel_bible:demo",
        outline: [
          "Summarize key economic indicators quickly.",
          "Explain change points by comparing metrics.",
          "End with one practical insight."
        ],
        targetBeatCount: 72
      }
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

  await logJob(job.id, "info", created ? "Transition -> ENQUEUED" : "Transition -> REENQUEUED", {
    source: "enqueue:test",
    bullmqJobId
  });

  console.log("enqueued", {
    createdJob: created,
    jobDbId: job.id,
    bullmqJobId,
    episodeId: episode.id
  });

  const waitForPreview = (process.env.ENQUEUE_TEST_WAIT_FOR_PREVIEW ?? "1") !== "0";
  if (!waitForPreview) {
    console.log("preview check skipped", { reason: "ENQUEUE_TEST_WAIT_FOR_PREVIEW=0" });
    return;
  }

  const out = getEpisodeOutputPaths(episode.id);
  const startedAt = Date.now();

  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    const previewJob = await prisma.job.findFirst({
      where: { episodeId: episode.id, type: "RENDER_PREVIEW" },
      orderBy: { createdAt: "desc" }
    });

    if (previewJob?.status === "FAILED") {
      throw new Error(`Preview render job failed: ${previewJob.id}`);
    }

    if (fs.existsSync(out.previewOutputPath) && previewJob?.status === "SUCCEEDED") {
      console.log("preview ready", {
        episodeId: episode.id,
        previewPath: out.previewOutputPath,
        previewJobId: previewJob.id
      });
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, WAIT_INTERVAL_MS);
    });
  }

  throw new Error(`Timed out waiting for preview output: ${out.previewOutputPath}`);
}

main()
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    console.error(error);

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
        source: "enqueue:test",
        error: message,
        stack
      });
    }

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await queue.close();
  });

