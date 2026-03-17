import { bootstrapEnv } from "./bootstrapEnv";
import { PrismaClient } from "@prisma/client";
import { queue } from "./queue";
import { reconcileStaleCharacterGenerationJobs } from "./jobReconciliation";

bootstrapEnv();

const prisma = new PrismaClient();

async function main() {
  const staleAgeMinutes = (() => {
    const parsed = Number.parseInt(process.env.WORKER_STALE_CHARACTER_JOB_AGE_MINUTES ?? "720", 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 720;
  })();
  const maxRows = (() => {
    const parsed = Number.parseInt(process.env.WORKER_STALE_CHARACTER_JOB_MAX_ROWS ?? "250", 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 250;
  })();
  const dryRun = process.env.WORKER_STALE_CHARACTER_JOB_DRY_RUN === "1";

  const summary = await reconcileStaleCharacterGenerationJobs({
    prisma,
    queue,
    staleAgeMs: staleAgeMinutes * 60 * 1000,
    dryRun,
    maxRows,
    log: (message) => console.log(message)
  });

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([prisma.$disconnect(), queue.close()]);
  });
