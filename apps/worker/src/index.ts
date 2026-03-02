import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "bullmq";
import { PrismaClient, JobStatus } from "@prisma/client";
import { SchemaValidator } from "@ec/shared/src/schemaValidator";
import { REDIS_URL, QUEUE_NAME, EpisodeJobPayload } from "./queue";

const prisma = new PrismaClient();

// schema dir absolute
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaDir = path.resolve(__dirname, "../../../packages/schemas");
const schemaValidator = new SchemaValidator(schemaDir);

async function logJob(jobId: string, level: string, message: string, details?: any) {
  await prisma.jobLog.create({
    data: { jobId, level, message, details }
  });
}

async function setJobStatus(jobId: string, status: JobStatus, patch?: Partial<{ progress: number; lastError: string | null }>) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status,
      startedAt: status === "RUNNING" ? new Date() : undefined,
      finishedAt: status === "SUCCEEDED" || status === "FAILED" ? new Date() : undefined,
      progress: patch?.progress ?? undefined,
      lastError: patch?.lastError ?? undefined
    }
  });
}

const worker = new Worker<EpisodeJobPayload>(
  QUEUE_NAME,
  async (bullJob) => {
    const payload = bullJob.data;
    const jobDbId = payload.jobDbId;

    await setJobStatus(jobDbId, "RUNNING", { progress: 1, lastError: null });
    await logJob(jobDbId, "info", `Worker started bullmqJobId=${bullJob.id}`);

    if (payload.schemaChecks?.length) {
      for (const check of payload.schemaChecks) {
        const res = schemaValidator.validate(check.schemaId, check.data);
        if (!res.ok) {
          await logJob(jobDbId, "error", `Schema validation failed: ${check.schemaId}`, res.errors);
          throw new Error(`Schema validation failed: ${check.schemaId}`);
        }
      }
    }

    await setJobStatus(jobDbId, "SUCCEEDED", { progress: 100 });
    await logJob(jobDbId, "info", "Job succeeded");
    return { ok: true };
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 2
  }
);

worker.on("failed", async (bullJob, err) => {
  if (!bullJob) return;
  const payload = bullJob.data as EpisodeJobPayload;
  await setJobStatus(payload.jobDbId, "FAILED", { lastError: err.message });
  await logJob(payload.jobDbId, "error", "Job failed", { error: err.message, stack: err.stack });
});

console.log(`[worker] running. redis=${REDIS_URL} queue=${QUEUE_NAME}`);
