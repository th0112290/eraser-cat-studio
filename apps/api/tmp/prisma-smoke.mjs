import { PrismaClient } from "@prisma/client";
process.env.DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/eraser?schema=public";
const prisma = new PrismaClient();
const timeout = setTimeout(() => {
  console.error('timeout');
  process.exit(2);
}, 15000);
try {
  const channels = await prisma.channel.findMany({ take: 1 });
  console.log(JSON.stringify({ ok: true, channels: channels.length }));
} catch (error) {
  console.error(error);
} finally {
  clearTimeout(timeout);
  await prisma.$disconnect();
}
