import type { PrismaClient } from "@prisma/client";
import type { CharacterView } from "@ec/image-gen";
import type { CharacterGenerationPayload, CharacterPackJobPayload, EpisodeJobPayload } from "./queue";
import type { ManifestContinuity } from "./characterGenerationManifestState";
import { persistSelectedCandidateAssets } from "./characterGenerationSelectionAssets";
import {
  buildSelectionBuildPayload,
  enqueueSelectionBuild,
  finalizeSelectionSessionReady,
  resolveSelectedAssetIds,
  resolveSelectedCandidateIds,
  resolveSelectedSeed,
  writeQueuedSelectionManifestAndLog
} from "./characterGenerationSelectionQueue";

type JobLogger = (jobId: string, level: string, message: string, details?: unknown) => Promise<void>;

type AddEpisodeJob = (
  name: string,
  payload: EpisodeJobPayload,
  maxAttempts: number,
  retryBackoffMs: number
) => Promise<{ id?: string | number }>;

type SelectedCandidateLike = {
  candidate: {
    id: string;
    seed?: number;
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

type ManifestSelectedViewLike = {
  candidateId?: string;
  assetId?: string;
  assetIngestJobId?: string;
};

type ManifestCandidateLike = {
  id: string;
  seed?: number;
};

type SelectionManifestLike = {
  schemaVersion?: string;
  selectedByView: Partial<Record<CharacterView, ManifestSelectedViewLike>>;
  candidates: ManifestCandidateLike[];
  qualityProfileId?: string;
  mode: string;
  species?: string;
  promptPreset: string;
  positivePrompt: string;
  negativePrompt: string;
  reference: { continuity?: ManifestContinuity };
};

export async function finalizeSelectedCandidatePersistence<TManifest extends SelectionManifestLike>(input: {
  prisma: PrismaClient;
  episodeId: string;
  episodeChannelId: string;
  jobDbId: string;
  source: "auto" | "hitl";
  manifest: TManifest;
  manifestPath: string;
  character: CharacterPackJobPayload;
  sessionId?: string;
  providerName: string;
  workflowHash: string;
  maxAttempts: number;
  retryBackoffMs: number;
  normalizedSpecies: NonNullable<CharacterGenerationPayload["species"]>;
  selectedByView: Partial<Record<CharacterView, SelectedCandidateLike | undefined>>;
  withManifestHashes: (manifest: unknown) => (TManifest & {
    schemaVersion: string;
    inputHash: string;
    manifestHash: string;
  });
  flattenContinuityFields: (continuity: ManifestContinuity | undefined) => Record<string, unknown>;
  markPicked: (input: {
    sessionId: string;
    selectedByView: Record<CharacterView, { candidateId: string; assetId: string }>;
  }) => Promise<void>;
  updateSessionReady: (input: { sessionId: string; statusMessage: string }) => Promise<void>;
  helpers: {
    addEpisodeJob: AddEpisodeJob;
    logJob: JobLogger;
  };
}): Promise<void> {
  const selectedAssets = await persistSelectedCandidateAssets({
    prisma: input.prisma,
    episodeChannelId: input.episodeChannelId,
    episodeId: input.episodeId,
    jobDbId: input.jobDbId,
    source: input.source,
    qualityProfileId: input.manifest.qualityProfileId,
    selectedByView: input.selectedByView
  });

  const allViews: CharacterView[] = ["front", "threeQuarter", "profile"];
  for (const [view, persistedAsset] of selectedAssets) {
    input.manifest.selectedByView[view] = {
      candidateId: persistedAsset.candidateId,
      assetId: persistedAsset.assetId,
      assetIngestJobId: persistedAsset.ingestJobId
    };
  }

  const assetIds = resolveSelectedAssetIds({
    views: allViews,
    selectedAssets,
    existingAssetIds: input.character.assetIds
  });

  const resolvedSelectedCandidateIds = resolveSelectedCandidateIds({
    views: allViews,
    selectedByView: input.selectedByView,
    manifestSelectedByView: input.manifest.selectedByView ?? {},
    existingSelectedIds: input.character.generation?.selectedCandidateIds
  });

  const resolvedSeed = resolveSelectedSeed({
    selectedByView: input.selectedByView,
    selectedCandidateIds: resolvedSelectedCandidateIds,
    manifestCandidates: input.manifest.candidates,
    existingSeed: input.character.generation?.seed
  });

  const buildJobId = input.character.buildJobDbId;
  if (!buildJobId) {
    throw new Error("payload.character.buildJobDbId is required for generation pipeline");
  }

  const buildPayload = buildSelectionBuildPayload({
    buildJobId,
    episodeId: input.episodeId,
    character: input.character,
    sessionId: input.sessionId,
    assetIds,
    normalizedSpecies: input.normalizedSpecies,
    manifestMode: input.manifest.mode,
    providerName: input.providerName,
    promptPreset: input.manifest.promptPreset,
    positivePrompt: input.manifest.positivePrompt,
    negativePrompt: input.manifest.negativePrompt,
    seed: resolvedSeed,
    candidateCount: input.manifest.candidates.length,
    manifestPath: input.manifestPath,
    selectedCandidateIds: resolvedSelectedCandidateIds
  });

  const buildBullmqJobId = await enqueueSelectionBuild({
    prisma: input.prisma,
    helpers: input.helpers,
    buildJobId,
    parentJobDbId: input.jobDbId,
    buildPayload,
    assetIds,
    maxAttempts: input.maxAttempts,
    retryBackoffMs: input.retryBackoffMs
  });

  const hashedManifest = await writeQueuedSelectionManifestAndLog({
    manifest: {
      ...input.manifest,
      schemaVersion: "1.0"
    },
    manifestPath: input.manifestPath,
    withManifestHashes: input.withManifestHashes,
    helpers: input.helpers,
    jobDbId: input.jobDbId,
    source: input.source,
    providerName: input.providerName,
    workflowHash: input.workflowHash,
    flattenContinuityFields: input.flattenContinuityFields,
    assetIds,
    buildJobId,
    buildBullmqJobId
  });

  await finalizeSelectionSessionReady({
    sessionId: input.sessionId,
    source: input.source,
    continuity: hashedManifest.reference.continuity,
    assetIds,
    selectedCandidateIds: resolvedSelectedCandidateIds,
    markPicked: input.markPicked,
    updateReadyStatus: input.updateSessionReady
  });
}
