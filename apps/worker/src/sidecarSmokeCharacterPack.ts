import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { ensureAcceptedGeneratedPackRecord } from "./generatedPackRegistry";

const DEFAULT_SMOKE_USER_EMAIL = "video-broll-smoke@example.com";
const DEFAULT_SMOKE_USER_NAME = "video-broll-smoke";

type RegisteredGeneratedPack = {
  characterPackId: string;
  version: number;
  created: boolean;
  manifestPath: string;
  packPath: string;
};

export type ResolvedSidecarSmokeCharacterPack = {
  requestedPackId: string;
  characterPackId: string;
  channelId: string;
  source: "character_pack" | "generated_pack_registry";
  status: string;
  registeredGeneratedPack: RegisteredGeneratedPack | null;
};

function resolveGeneratedPackPaths(repoRoot: string, generatedPackId: string): {
  manifestPath: string;
  packPath: string;
} {
  return {
    manifestPath: path.join(repoRoot, "assets", "generated", "characters", generatedPackId, "manifest.json"),
    packPath: path.join(repoRoot, "assets", "generated", "characters", generatedPackId, "pack", "character.pack.json")
  };
}

function hasGeneratedPackArtifacts(repoRoot: string, generatedPackId: string): boolean {
  const paths = resolveGeneratedPackPaths(repoRoot, generatedPackId);
  return fs.existsSync(paths.manifestPath) && fs.existsSync(paths.packPath);
}

async function findOrCreateSmokeChannel(input: {
  prisma: PrismaClient;
  channelName: string;
}): Promise<{ id: string }> {
  const user = await input.prisma.user.upsert({
    where: { email: DEFAULT_SMOKE_USER_EMAIL },
    update: { name: DEFAULT_SMOKE_USER_NAME },
    create: {
      email: DEFAULT_SMOKE_USER_EMAIL,
      name: DEFAULT_SMOKE_USER_NAME
    },
    select: { id: true }
  });
  const existingChannel = await input.prisma.channel.findFirst({
    where: {
      userId: user.id,
      name: input.channelName
    },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
  if (existingChannel) {
    return existingChannel;
  }
  return input.prisma.channel.create({
    data: {
      userId: user.id,
      name: input.channelName
    },
    select: { id: true }
  });
}

export async function ensureSidecarSmokeCharacterPack(input: {
  prisma: PrismaClient;
  repoRoot: string;
  requestedPackId: string;
  channelName: string;
}): Promise<ResolvedSidecarSmokeCharacterPack> {
  const requestedPackId = input.requestedPackId.trim();
  if (requestedPackId.length === 0) {
    throw new Error("requestedPackId is required");
  }

  const existingPack = await input.prisma.characterPack.findUnique({
    where: { id: requestedPackId },
    select: {
      id: true,
      channelId: true,
      status: true
    }
  });

  if (existingPack?.status === "APPROVED") {
    return {
      requestedPackId,
      characterPackId: existingPack.id,
      channelId: existingPack.channelId,
      source: "character_pack",
      status: existingPack.status,
      registeredGeneratedPack: null
    };
  }

  if (!hasGeneratedPackArtifacts(input.repoRoot, requestedPackId)) {
    if (existingPack) {
      throw new Error(`character pack ${requestedPackId} is not approved (status=${existingPack.status})`);
    }
    throw new Error(`character pack not found: ${requestedPackId}`);
  }

  const channelId =
    existingPack?.channelId ??
    (
      await findOrCreateSmokeChannel({
        prisma: input.prisma,
        channelName: input.channelName
      })
    ).id;
  const registeredGeneratedPack = await ensureAcceptedGeneratedPackRecord({
    prisma: input.prisma,
    repoRoot: input.repoRoot,
    channelId,
    generatedPackId: requestedPackId
  });

  return {
    requestedPackId,
    characterPackId: registeredGeneratedPack.characterPackId,
    channelId,
    source: "generated_pack_registry",
    status: "APPROVED",
    registeredGeneratedPack
  };
}
