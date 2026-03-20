import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { CharacterView, CharacterProviderCallLog } from "@ec/image-gen";
import type { CharacterGenerationPayload } from "./queue";

export type CharacterGenerationSessionDelegate = {
  findUnique: (args: unknown) => Promise<any>;
  findFirst: (args: unknown) => Promise<any>;
  findMany: (args: unknown) => Promise<any[]>;
  create: (args: unknown) => Promise<any>;
  update: (args: unknown) => Promise<any>;
};

export type CharacterGenerationCandidateDelegate = {
  findMany: (args: unknown) => Promise<any[]>;
  deleteMany: (args: unknown) => Promise<any>;
  createMany: (args: unknown) => Promise<any>;
  updateMany: (args: unknown) => Promise<any>;
};

type ScoredCandidateLike = {
  score: number;
  styleScore: number;
  referenceSimilarity: number | null;
  consistencyScore: number | null;
  breakdown: unknown;
  warnings: string[];
  rejections: string[];
  analysis: unknown;
  candidate: {
    id: string;
    view: CharacterView;
    candidateIndex: number;
    seed: number;
    mimeType: string;
    providerMeta?: unknown;
  };
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function getCharacterGenerationSessionDelegate(prisma: PrismaClient): CharacterGenerationSessionDelegate | null {
  const delegate = (prisma as unknown as Record<string, unknown>).characterGenerationSession;
  if (!delegate || typeof delegate !== "object") {
    return null;
  }
  const candidate = delegate as CharacterGenerationSessionDelegate;
  if (
    typeof candidate.findUnique !== "function" ||
    typeof candidate.findFirst !== "function" ||
    typeof candidate.findMany !== "function" ||
    typeof candidate.create !== "function" ||
    typeof candidate.update !== "function"
  ) {
    return null;
  }
  return candidate;
}

export function getCharacterGenerationCandidateDelegate(prisma: PrismaClient): CharacterGenerationCandidateDelegate | null {
  const delegate = (prisma as unknown as Record<string, unknown>).characterGenerationCandidate;
  if (!delegate || typeof delegate !== "object") {
    return null;
  }
  const candidate = delegate as CharacterGenerationCandidateDelegate;
  if (
    typeof candidate.findMany !== "function" ||
    typeof candidate.deleteMany !== "function" ||
    typeof candidate.createMany !== "function" ||
    typeof candidate.updateMany !== "function"
  ) {
    return null;
  }
  return candidate;
}

function toDbGenerationMode(mode: CharacterGenerationPayload["mode"]): "NEW" | "REFERENCE" {
  return mode === "reference" ? "REFERENCE" : "NEW";
}

function toDbGenerationProvider(
  provider: CharacterGenerationPayload["provider"]
): "MOCK" | "COMFYUI" | "REMOTEAPI" {
  if (provider === "comfyui") {
    return "COMFYUI";
  }
  if (provider === "remoteApi") {
    return "REMOTEAPI";
  }
  return "MOCK";
}

function toDbGenerationView(
  view: CharacterGenerationPayload["viewToGenerate"]
): "FRONT" | "THREE_QUARTER" | "PROFILE" | undefined {
  if (view === "front") {
    return "FRONT";
  }
  if (view === "threeQuarter") {
    return "THREE_QUARTER";
  }
  if (view === "profile") {
    return "PROFILE";
  }
  return undefined;
}

function toDbCandidateView(view: CharacterView): "FRONT" | "THREE_QUARTER" | "PROFILE" {
  if (view === "front") {
    return "FRONT";
  }
  if (view === "threeQuarter") {
    return "THREE_QUARTER";
  }
  return "PROFILE";
}

function normalizeSeedForDb(seed: number): number {
  const MAX_INT4 = 2_147_483_647;
  const MIN_INT4 = -2_147_483_648;
  if (!Number.isFinite(seed)) {
    return 0;
  }
  const rounded = Math.trunc(seed);
  if (rounded > MAX_INT4) {
    return rounded % MAX_INT4;
  }
  if (rounded < MIN_INT4) {
    return MIN_INT4;
  }
  return rounded;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function insertProviderCallLogs(input: {
  prisma: PrismaClient;
  sessionId?: string;
  episodeId: string;
  callLogs: CharacterProviderCallLog[];
}): Promise<void> {
  const { prisma, sessionId, episodeId, callLogs } = input;
  if (callLogs.length === 0) {
    return;
  }

  try {
    for (const log of callLogs) {
      await prisma.$executeRaw`
        INSERT INTO provider_call_logs (
          id,
          session_id,
          episode_id,
          provider,
          view,
          candidate_index,
          attempt,
          duration_ms,
          estimated_cost_usd,
          result,
          error_summary,
          status_code
        ) VALUES (
          ${randomUUID()},
          ${sessionId ?? null},
          ${episodeId},
          ${log.provider},
          ${log.view},
          ${log.candidateIndex},
          ${log.attempt},
          ${Math.max(0, Math.floor(log.durationMs))},
          ${Math.max(0, log.estimatedCostUsd)},
          ${log.result},
          ${log.errorSummary ?? null},
          ${log.statusCode ?? null}
        )
      `;
    }
  } catch {
    return;
  }
}

export async function upsertGenerationSession(input: {
  prisma: PrismaClient;
  generation: CharacterGenerationPayload;
  episodeId: string;
  characterPackId: string;
  promptPresetId: string;
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  candidateCount: number;
  manifestPath: string;
  statusMessage: string;
}): Promise<{ id: string }> {
  const sessionDelegate = getCharacterGenerationSessionDelegate(input.prisma);
  if (!sessionDelegate) {
    return { id: input.generation.sessionId ?? `legacy-${input.episodeId}` };
  }

  const data = {
    episodeId: input.episodeId,
    characterPackId: input.characterPackId,
    mode: toDbGenerationMode(input.generation.mode),
    provider: toDbGenerationProvider(input.generation.provider),
    promptPresetId: input.promptPresetId,
    positivePrompt: input.positivePrompt,
    negativePrompt: input.negativePrompt,
    seed: normalizeSeedForDb(input.seed),
    candidateCount: input.candidateCount,
    referenceAssetId: input.generation.referenceAssetId ?? null,
    viewToGenerate: toDbGenerationView(input.generation.viewToGenerate) ?? null,
    status: "GENERATING" as const,
    statusMessage: input.statusMessage,
    manifestPath: input.manifestPath
  };

  if (input.generation.sessionId) {
    const existing = await sessionDelegate.findUnique({
      where: { id: input.generation.sessionId },
      select: { id: true, episodeId: true }
    });
    if (existing && existing.episodeId === input.episodeId) {
      await sessionDelegate.update({
        where: { id: existing.id },
        data
      });
      return { id: existing.id };
    }
  }

  const latest = await sessionDelegate.findFirst({
    where: {
      episodeId: input.episodeId,
      characterPackId: input.characterPackId
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  });

  if (latest) {
    await sessionDelegate.update({
      where: { id: latest.id },
      data
    });
    return { id: latest.id };
  }

  const created = await sessionDelegate.create({
    data
  });

  return { id: created.id };
}

export async function upsertSessionCandidates(input: {
  prisma: PrismaClient;
  sessionId: string;
  scored: ScoredCandidateLike[];
  viewToGenerate?: CharacterView;
}): Promise<void> {
  if (input.scored.length === 0) {
    return;
  }
  const candidateDelegate = getCharacterGenerationCandidateDelegate(input.prisma);
  if (!candidateDelegate) {
    return;
  }

  if (input.viewToGenerate) {
    await candidateDelegate.deleteMany({
      where: {
        sessionId: input.sessionId,
        view: toDbCandidateView(input.viewToGenerate)
      }
    });
  } else {
    await candidateDelegate.deleteMany({
      where: {
        sessionId: input.sessionId
      }
    });
  }

  await candidateDelegate.createMany({
    data: input.scored.map((entry) => ({
      sessionId: input.sessionId,
      view: toDbCandidateView(entry.candidate.view),
      candidateId: entry.candidate.id,
      candidateIndex: entry.candidate.candidateIndex,
      seed: normalizeSeedForDb(entry.candidate.seed),
      scoreJson: toPrismaJson({
        score: entry.score,
        styleScore: entry.styleScore,
        referenceSimilarity: entry.referenceSimilarity,
        consistencyScore: entry.consistencyScore,
        breakdown: entry.breakdown
      }),
      qcJson: toPrismaJson({
        mime: entry.candidate.mimeType,
        warnings: entry.warnings,
        rejections: entry.rejections,
        analysis: entry.analysis
      }),
      localPath: asString(
        typeof entry.candidate.providerMeta === "object" && entry.candidate.providerMeta !== null
          ? (entry.candidate.providerMeta as Record<string, unknown>).localCandidatePath
          : undefined
      )
    }))
  });
}

export async function markSessionCandidatesPicked(input: {
  prisma: PrismaClient;
  sessionId: string;
  selectedByView: Record<CharacterView, { candidateId: string; assetId: string }>;
}): Promise<void> {
  const candidateDelegate = getCharacterGenerationCandidateDelegate(input.prisma);
  if (!candidateDelegate) {
    return;
  }

  await candidateDelegate.updateMany({
    where: { sessionId: input.sessionId },
    data: { picked: false }
  });

  for (const selected of Object.values(input.selectedByView)) {
    if (!selected || typeof selected.candidateId !== "string" || typeof selected.assetId !== "string") {
      throw new Error("Invalid selectedByView payload for markSessionCandidatesPicked");
    }
    await candidateDelegate.updateMany({
      where: {
        sessionId: input.sessionId,
        candidateId: selected.candidateId
      },
      data: {
        picked: true,
        assetId: selected.assetId
      }
    });
  }
}
