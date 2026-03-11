import fs from "node:fs";
import path from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { sha256Hex, stableStringify } from "@ec/shared";

type EnsureAcceptedGeneratedPackRecordInput = {
  prisma: PrismaClient;
  repoRoot: string;
  channelId: string;
  generatedPackId: string;
};

type EnsureAcceptedGeneratedPackRecordResult = {
  characterPackId: string;
  version: number;
  created: boolean;
  manifestPath: string;
  packPath: string;
};

type GeneratedPackManifest = {
  acceptance?: {
    status?: string;
  };
};

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function ensureAcceptedGeneratedPackRecord(
  input: EnsureAcceptedGeneratedPackRecordInput
): Promise<EnsureAcceptedGeneratedPackRecordResult> {
  const generatedPackId = input.generatedPackId.trim();
  if (generatedPackId.length === 0) {
    throw new Error("generatedPackId is required");
  }

  const manifestPath = path.join(input.repoRoot, "assets", "generated", "characters", generatedPackId, "manifest.json");
  const packPath = path.join(
    input.repoRoot,
    "assets",
    "generated",
    "characters",
    generatedPackId,
    "pack",
    "character.pack.json"
  );

  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Generated pack manifest not found: ${manifestPath}`);
  }
  if (!fs.existsSync(packPath)) {
    throw new Error(`Generated pack file not found: ${packPath}`);
  }

  const manifest = readJsonFile<GeneratedPackManifest>(manifestPath);
  if (manifest.acceptance?.status !== "accepted") {
    throw new Error(`Generated pack ${generatedPackId} is not accepted (status=${manifest.acceptance?.status ?? "missing"})`);
  }

  const packJson = readJsonFile<unknown>(packPath);
  const hash = sha256Hex(
    stableStringify({
      generatedPackId,
      packJson
    })
  );

  const existing = await input.prisma.characterPack.findUnique({
    where: { id: generatedPackId },
    select: {
      id: true,
      channelId: true,
      version: true
    }
  });

  if (existing) {
    if (existing.channelId !== input.channelId) {
      throw new Error(
        `Generated pack ${generatedPackId} is already registered under channel ${existing.channelId}, expected ${input.channelId}`
      );
    }

    const updated = await input.prisma.characterPack.update({
      where: { id: generatedPackId },
      data: {
        hash,
        status: "APPROVED",
        schemaId: "character_pack.schema.json",
        json: toPrismaJson(packJson)
      },
      select: {
        id: true,
        version: true
      }
    });

    return {
      characterPackId: updated.id,
      version: updated.version,
      created: false,
      manifestPath,
      packPath
    };
  }

  const latestVersion = await input.prisma.characterPack.findFirst({
    where: { channelId: input.channelId },
    orderBy: { version: "desc" },
    select: { version: true }
  });
  const version = (latestVersion?.version ?? 0) + 1;

  const created = await input.prisma.characterPack.create({
    data: {
      id: generatedPackId,
      channelId: input.channelId,
      version,
      hash,
      status: "APPROVED",
      schemaId: "character_pack.schema.json",
      json: toPrismaJson(packJson)
    },
    select: {
      id: true,
      version: true
    }
  });

  return {
    characterPackId: created.id,
    version: created.version,
    created: true,
    manifestPath,
    packPath
  };
}
