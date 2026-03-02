import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { queue } from "./queue";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "test@example.com" },
    update: {},
    create: { email: "test@example.com", name: "tester" }
  });

  const channel = await prisma.channel.create({
    data: { userId: user.id, name: "Eraser Cat Economy" }
  });

  const episode = await prisma.episode.create({
    data: { channelId: channel.id, topic: "Test Episode" }
  });

  const job = await prisma.job.create({
    data: {
      episodeId: episode.id,
      type: "GENERATE_BEATS",
      status: "QUEUED",
      maxAttempts: 2
    }
  });

  const bull = await queue.add("GENERATE_BEATS", {
    jobDbId: job.id,
    episodeId: episode.id,
    schemaChecks: [] // 빈 검증
  });

  await prisma.job.update({
    where: { id: job.id },
    data: { bullmqJobId: String(bull.id) }
  });

  console.log("enqueued", { jobDbId: job.id, bullmqJobId: bull.id, episodeId: episode.id });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
