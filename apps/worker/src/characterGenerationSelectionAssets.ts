import type { Prisma, PrismaClient } from "@prisma/client";
import type { CharacterView } from "@ec/image-gen";
import { makeStorageKey, putAssetObject } from "./assetStorage";
import { handleAssetIngestJob, type AssetIngestJobPayload } from "./assetIngest";

type ScoredCandidateLike = {
  candidate: {
    id: string;
    candidateIndex: number;
    provider: string;
    mimeType: string;
    data: Buffer;
    providerMeta?: unknown;
  };
  score: number;
  breakdown: unknown;
  warnings: string[];
  rejections: string[];
};

export type PersistedSelectedAsset = {
  candidateId: string;
  assetId: string;
  originalKey: string;
  ingestJobId: string;
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function persistSelectedCandidateAssets(input: {
  prisma: PrismaClient;
  episodeChannelId: string;
  episodeId: string;
  jobDbId: string;
  source: "auto" | "hitl";
  qualityProfileId?: string;
  selectedByView: Partial<Record<CharacterView, ScoredCandidateLike>>;
}): Promise<Map<CharacterView, PersistedSelectedAsset>> {
  const selectedAssets = new Map<CharacterView, PersistedSelectedAsset>();

  for (const [view, scoredCandidate] of Object.entries(input.selectedByView) as Array<[CharacterView, ScoredCandidateLike]>) {
    const candidate = scoredCandidate.candidate;
    const extension = candidate.mimeType.includes("svg") ? "svg" : "png";
    const originalKey = makeStorageKey(
      `characters/generated/${input.episodeId}/${input.jobDbId}`,
      `${view}_candidate_${candidate.candidateIndex}.${extension}`
    );

    const putResult = await putAssetObject(originalKey, candidate.data, candidate.mimeType);

    const assetData = {
      channelId: input.episodeChannelId,
      type: "IMAGE" as const,
      assetType: "CHARACTER_VIEW" as const,
      status: "QUEUED" as const,
      mime: candidate.mimeType,
      sizeBytes: BigInt(candidate.data.byteLength),
      storageKey: originalKey,
      originalKey,
      contentType: candidate.mimeType,
      bytes: BigInt(candidate.data.byteLength),
      sha256: null,
      qcJson: toPrismaJson({
        ok: true,
        stage: input.source === "hitl" ? "generated_selected" : "generated",
        provider: candidate.provider,
        candidateId: candidate.id,
        qualityProfileId: input.qualityProfileId ?? null,
        score: scoredCandidate.score,
        scoreBreakdown: scoredCandidate.breakdown,
        warnings: scoredCandidate.warnings,
        rejections: scoredCandidate.rejections,
        providerMeta: candidate.providerMeta ?? null,
        minioWarning: putResult.minioError ?? null
      })
    };

    let asset = await input.prisma.asset.findFirst({
      where: {
        storageKey: originalKey
      }
    });
    if (!asset) {
      asset = await input.prisma.asset.create({
        data: assetData
      });
    }

    const ingestPayload: AssetIngestJobPayload = {
      assetId: asset.id,
      assetType: "character_view",
      originalKey,
      mime: candidate.mimeType
    };

    await handleAssetIngestJob({
      prisma: input.prisma,
      payload: ingestPayload,
      bullmqJobId: `inline-asset-ingest-${asset.id}`
    });
    const ingestJobId = `inline-asset-ingest-${asset.id}`;

    selectedAssets.set(view, {
      candidateId: candidate.id,
      assetId: asset.id,
      originalKey,
      ingestJobId
    });
  }

  return selectedAssets;
}
