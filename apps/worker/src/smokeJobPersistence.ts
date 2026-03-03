import { bootstrapEnv } from "./bootstrapEnv";

bootstrapEnv();

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const latest = await prisma.job.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      logs: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!latest) {
    throw new Error("No Job rows found");
  }

  const hasRunning = latest.logs.some((log) => log.message.includes("RUNNING"));
  const hasSucceeded = latest.logs.some((log) => log.message.includes("SUCCEEDED"));

  console.log(
    JSON.stringify(
      {
        jobId: latest.id,
        status: latest.status,
        bullmqJobId: latest.bullmqJobId,
        logs: latest.logs.map((log) => ({ level: log.level, message: log.message })),
        checks: {
          hasRunning,
          hasSucceeded
        }
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
