import { bootstrapEnv } from "./bootstrapEnv";
import { Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { QUEUE_NAME, REDIS_CONNECTION, REDIS_URL } from "./queue";
import { handleAssetIngestJob } from "./assetIngest";

bootstrapEnv();

const ASSET_INGEST_JOB_NAME = "ASSET_INGEST";

type AssetIngestQueuePayload = {
  assetId: string;
  assetType: "character_reference" | "character_view" | "background" | "chart_source";
  originalKey: string;
  mime: string;
};

function isAssetPayload(value: unknown): value is AssetIngestQueuePayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.assetId === "string";
}

const prisma = new PrismaClient();

if (process.env.ASSET_ONLY_WORKER !== "1") {
  console.error("[worker:asset] disabled. Set ASSET_ONLY_WORKER=1 to run this dedicated worker.");
  process.exit(1);
}

const worker = new Worker<AssetIngestQueuePayload>(
  QUEUE_NAME,
  async (bullJob) => {
    if (String(bullJob.name) !== ASSET_INGEST_JOB_NAME) {
      throw new Error(`asset worker received unsupported job: ${String(bullJob.name)}`);
    }

    if (!isAssetPayload(bullJob.data)) {
      throw new Error("Invalid ASSET_INGEST payload");
    }

    return handleAssetIngestJob({
      prisma,
      payload: bullJob.data,
      bullmqJobId: String(bullJob.id)
    });
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 1
  }
);

worker.on("failed", async (bullJob, error) => {
  if (!bullJob || String(bullJob.name) !== ASSET_INGEST_JOB_NAME) {
    return;
  }

  const payload = bullJob.data;
  if (!isAssetPayload(payload)) {
    return;
  }

  const safeError = error instanceof Error ? error.message : String(error);

  try {
    await prisma.asset.update({
      where: { id: payload.assetId },
      data: {
        status: "FAILED",
        qcJson: {
          ok: false,
          stage: "worker_failed",
          error: safeError,
          bullmqJobId: String(bullJob.id),
          failedAt: new Date().toISOString()
        }
      }
    });
  } catch {
    // ignore secondary failure
  }
});

process.on("SIGINT", async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});

console.log(`[worker:asset] running. redis=${REDIS_URL} queue=${QUEUE_NAME} job=${ASSET_INGEST_JOB_NAME}`);
