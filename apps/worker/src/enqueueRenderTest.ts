import { bootstrapEnv } from "./bootstrapEnv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { closeEpisodeQueues, getEpisodeQueueForJobName, RENDER_EPISODE_JOB_NAME } from "./queue";
import type { EpisodeJobPayload } from "./queue";
import type { Job, Prisma } from "@prisma/client";
import type { JobsOptions } from "bullmq";

bootstrapEnv();

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

const TEST_USER_EMAIL = "test@example.com";
const TEST_USER_NAME = "tester";
const TEST_CHANNEL_NAME = "Eraser Cat Economy";
const TEST_EPISODE_TOPIC = "Render Test Episode";

type ActiveJobStatus = "QUEUED" | "RUNNING";

let activeJobId: string | null = null;

function resolveRenderPaths() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");
  const outDir = path.join(repoRoot, "out");
  const shotsPath = path.join(outDir, "shots.json");
  const outputPath = path.join(outDir, "render_episode.mp4");
  const srtPath = path.join(outDir, "render_episode.srt");
  const qcReportPath = path.join(outDir, "qc_report.json");
  const renderLogPath = path.join(outDir, "render_log.json");

  if (!fs.existsSync(shotsPath)) {
    throw new Error(`shots.json not found: ${shotsPath}. Run pnpm -C packages/story run shots:demo first.`);
  }

  return { shotsPath, outputPath, srtPath, qcReportPath, renderLogPath };
}

async function logJob(jobId: string, level: string, message: string, details?: Prisma.InputJsonValue) {
  await prisma.jobLog.create({
    data: { jobId, level, message, details: details ?? undefined }
  });
}

async function findOrCreateChannel(userId: string) {
  const existing = await prisma.channel.findFirst({
    where: { userId, name: TEST_CHANNEL_NAME },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });

  if (existing) {
    return existing;
  }

  return prisma.channel.create({
    data: { userId, name: TEST_CHANNEL_NAME },
    select: { id: true }
  });
}

async function findOrCreateEpisode(channelId: string) {
  const existing = await prisma.episode.findFirst({
    where: { channelId, topic: TEST_EPISODE_TOPIC },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });

  if (existing) {
    return existing;
  }

  return prisma.episode.create({
    data: { channelId, topic: TEST_EPISODE_TOPIC },
    select: { id: true }
  });
}

async function findOrCreateActiveRenderJob(episodeId: string): Promise<{ job: Job; created: boolean }> {
  const existing = await prisma.job.findFirst({
    where: {
      episodeId,
      type: "RENDER_FINAL",
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
      type: "RENDER_FINAL",
      status: "QUEUED",
      progress: 0,
      maxAttempts: 2
    }
  });

  await logJob(job.id, "info", "Transition -> QUEUED", {
    source: "enqueue:render:test"
  });

  return { job, created: true };
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

async function main() {
  const renderPaths = resolveRenderPaths();

  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: { name: TEST_USER_NAME },
    create: { email: TEST_USER_EMAIL, name: TEST_USER_NAME }
  });

  const channel = await findOrCreateChannel(user.id);
  const episode = await findOrCreateEpisode(channel.id);
  const { job, created } = await findOrCreateActiveRenderJob(episode.id);
  activeJobId = job.id;

  const payload: EpisodeJobPayload = {
    jobDbId: job.id,
    episodeId: episode.id,
    schemaChecks: [],
    render: {
      shotsPath: renderPaths.shotsPath,
      outputPath: renderPaths.outputPath,
      srtPath: renderPaths.srtPath,
      qcReportPath: renderPaths.qcReportPath,
      renderLogPath: renderPaths.renderLogPath,
      qc: {
        dataset: {
          unit: "pts",
          expectedSum: 258,
          rows: [
            { label: "A", value: 72, unit: "pts" },
            { label: "B", value: 91, unit: "pts" },
            { label: "C", value: 64, unit: "pts" },
            { label: "D", value: 31, unit: "pts" }
          ]
        },
        minFontSizePx: 20,
        pointerTolerancePx: 28,
        expectOcclusion: true
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
    source: "enqueue:render:test",
    bullmqJobId,
    shotsPath: renderPaths.shotsPath,
    outputPath: renderPaths.outputPath,
    qcReportPath: renderPaths.qcReportPath
  });

  console.log("render enqueued", {
    createdJob: created,
    jobDbId: job.id,
    bullmqJobId,
    episodeId: episode.id,
    shotsPath: renderPaths.shotsPath,
    outputPath: renderPaths.outputPath
  });
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
        source: "enqueue:render:test",
        error: message,
        stack
      });
    }

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await closeEpisodeQueues();
  });
