import { PrismaClient } from "@prisma/client";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://app:app@localhost:5432/eraser?schema=public";
const prisma = new PrismaClient();
const started = Date.now();
try {
  const channels = await prisma.channel.findMany({ take: 1 });
  console.log(JSON.stringify({ ok: true, channels: channels.length, ms: Date.now() - started }));
} catch (error) {
  console.error(error);
} finally {
  await prisma.$disconnect();
}
