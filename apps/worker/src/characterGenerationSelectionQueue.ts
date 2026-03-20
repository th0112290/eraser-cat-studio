import fs from "node:fs";
import type { PrismaClient } from "@prisma/client";
import type { CharacterView } from "@ec/image-gen";
import type {
  CharacterAssetSelection,
  CharacterGenerationPayload,
  CharacterPackJobPayload,
  EpisodeJobPayload
} from "./queue";
import { formatContinuitySentence, type ManifestContinuity } from "./characterGenerationManifestState";
import { BUILD_CHARACTER_PACK_JOB_NAME as BUILD_CHARACTER_PACK_JOB } from "./queue";

type SelectedAssetRecord = {
  assetId: string;
};

type SelectedCandidateLike = {
  candidate: {
    id: string;
    seed?: number;
  };
};

type ManifestSelectedViewLike = {
  candidateId?: string;
};

type ManifestCandidateLike = {
  id: string;
  seed?: number;
};

export type SelectedCandidateIdMap = Record<CharacterView, string>;
export type SessionPickedCandidateMap = Record<CharacterView, { candidateId: string; assetId: string }>;

type AddEpisodeJob = (
  name: string,
  payload: EpisodeJobPayload,
  maxAttempts: number,
  retryBackoffMs: number
) => Promise<{ id?: string | number }>;

type JobLogger = (jobId: string, level: string, message: string, details?: unknown) => Promise<void>;

type SelectionQueueHelpers = {
  addEpisodeJob: AddEpisodeJob;
  logJob: JobLogger;
};

type SessionPickedUpdater = (input: {
  sessionId: string;
  selectedByView: SessionPickedCandidateMap;
}) => Promise<void>;

type SessionReadyUpdater = (input: { sessionId: string; statusMessage: string }) => Promise<void>;

export function resolveSelectedAssetIds(input: {
  views: CharacterView[];
  selectedAssets: Map<CharacterView, SelectedAssetRecord>;
  existingAssetIds?: Partial<Record<CharacterView, string>>;
}): CharacterAssetSelection {
  const resolvedAssetIds: Partial<Record<CharacterView, string>> = {};
  for (const view of input.views) {
    const fromSelected = input.selectedAssets.get(view)?.assetId;
    const fromExisting = input.existingAssetIds?.[view];
    const resolved = fromSelected ?? fromExisting;
    if (!resolved) {
      throw new Error(`Missing assetId for required view=${view}`);
    }
    resolvedAssetIds[view] = resolved;
  }
  return {
    front: resolvedAssetIds.front!,
    threeQuarter: resolvedAssetIds.threeQuarter!,
    profile: resolvedAssetIds.profile!
  };
}

export function resolveSelectedCandidateIds(input: {
  views: CharacterView[];
  selectedByView: Partial<Record<CharacterView, SelectedCandidateLike | undefined>>;
  manifestSelectedByView?: Partial<Record<CharacterView, ManifestSelectedViewLike | undefined>>;
  existingSelectedIds?: Partial<Record<CharacterView, string>>;
}): SelectedCandidateIdMap {
  const resolvedSelectedCandidateIds: Partial<Record<CharacterView, string>> = {};
  for (const view of input.views) {
    const fromSelected = input.selectedByView[view]?.candidate.id;
    const fromManifest = input.manifestSelectedByView?.[view]?.candidateId;
    const fromExisting = input.existingSelectedIds?.[view];
    const resolved = fromSelected ?? fromManifest ?? fromExisting;
    if (!resolved) {
      throw new Error(`Missing selectedCandidateId for required view=${view}`);
    }
    resolvedSelectedCandidateIds[view] = resolved;
  }
  return {
    front: resolvedSelectedCandidateIds.front!,
    threeQuarter: resolvedSelectedCandidateIds.threeQuarter!,
    profile: resolvedSelectedCandidateIds.profile!
  };
}

export function resolveSelectedSeed(input: {
  selectedByView: Partial<Record<CharacterView, SelectedCandidateLike | undefined>>;
  selectedCandidateIds: SelectedCandidateIdMap;
  manifestCandidates: ManifestCandidateLike[];
  existingSeed?: number;
}): number {
  const frontSeedFromSelected = input.selectedByView.front?.candidate.seed;
  const frontCandidateId = input.selectedCandidateIds.front;
  const frontSeedFromManifest = input.manifestCandidates.find((row) => row.id === frontCandidateId)?.seed;
  return frontSeedFromSelected ?? frontSeedFromManifest ?? input.existingSeed ?? 101;
}

export function buildSelectionBuildPayload(input: {
  buildJobId: string;
  episodeId: string;
  character: CharacterPackJobPayload;
  sessionId?: string;
  assetIds: CharacterAssetSelection;
  normalizedSpecies: NonNullable<CharacterGenerationPayload["species"]>;
  manifestMode: string;
  providerName: string;
  promptPreset: string;
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  candidateCount: number;
  manifestPath: string;
  selectedCandidateIds: SelectedCandidateIdMap;
}): EpisodeJobPayload {
  return {
    jobDbId: input.buildJobId,
    episodeId: input.episodeId,
    schemaChecks: [],
    character: {
      characterPackId: input.character.characterPackId,
      version: input.character.version,
      buildJobDbId: input.buildJobId,
      previewJobDbId: input.character.previewJobDbId,
      assetIds: input.assetIds,
      generation: {
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        mode: input.manifestMode === "reference" ? "reference" : "new",
        provider:
          input.providerName === "comfyui"
            ? "comfyui"
            : input.providerName === "remoteApi"
              ? "remoteApi"
              : "mock",
        promptPreset: input.promptPreset,
        species: input.normalizedSpecies,
        positivePrompt: input.positivePrompt,
        negativePrompt: input.negativePrompt,
        seed: input.seed,
        candidateCount: input.candidateCount,
        manifestPath: input.manifestPath,
        selectedCandidateIds: {
          front: input.selectedCandidateIds.front,
          threeQuarter: input.selectedCandidateIds.threeQuarter,
          profile: input.selectedCandidateIds.profile
        }
      }
    }
  };
}

export function buildSelectionSessionPickedMap(input: {
  assetIds: CharacterAssetSelection;
  selectedCandidateIds: SelectedCandidateIdMap;
}): SessionPickedCandidateMap {
  return {
    front: {
      candidateId: input.selectedCandidateIds.front,
      assetId: input.assetIds.front
    },
    threeQuarter: {
      candidateId: input.selectedCandidateIds.threeQuarter,
      assetId: input.assetIds.threeQuarter
    },
    profile: {
      candidateId: input.selectedCandidateIds.profile,
      assetId: input.assetIds.profile
    }
  };
}

export function buildSelectionQueuedStatusMessage(input: {
  source: "auto" | "hitl";
  continuity: ManifestContinuity | undefined;
}): string {
  return input.source === "hitl"
    ? `HITL selection applied and build queued.${formatContinuitySentence(input.continuity)}`
    : `Auto-selected and build queued.${formatContinuitySentence(input.continuity)}`;
}

export async function enqueueSelectionBuild(input: {
  prisma: PrismaClient;
  helpers: SelectionQueueHelpers;
  buildJobId: string;
  parentJobDbId: string;
  buildPayload: EpisodeJobPayload;
  assetIds: CharacterAssetSelection;
  maxAttempts: number;
  retryBackoffMs: number;
}): Promise<string> {
  await input.helpers.logJob(input.buildJobId, "info", "Transition -> QUEUED", {
    source: "worker:generate-character-assets",
    parentJobDbId: input.parentJobDbId,
    assetIds: input.assetIds
  });

  const buildBull = await input.helpers.addEpisodeJob(
    BUILD_CHARACTER_PACK_JOB,
    input.buildPayload,
    input.maxAttempts,
    input.retryBackoffMs
  );
  const buildBullmqJobId = buildBull.id === undefined ? input.buildJobId : String(buildBull.id);

  await input.prisma.job.update({
    where: {
      id: input.buildJobId
    },
    data: {
      status: "QUEUED",
      bullmqJobId: buildBullmqJobId,
      lastError: null,
      finishedAt: null
    }
  });

  await input.helpers.logJob(input.buildJobId, "info", "Transition -> ENQUEUED", {
    source: "worker:generate-character-assets",
    bullmqJobId: buildBullmqJobId,
    assetIds: input.assetIds
  });

  return buildBullmqJobId;
}

export async function writeQueuedSelectionManifestAndLog<TManifest extends { reference: { continuity?: ManifestContinuity } }>(
  input: {
    manifest: TManifest;
    manifestPath: string;
    withManifestHashes: (manifest: TManifest) => TManifest & { inputHash: string; manifestHash: string };
    helpers: Pick<SelectionQueueHelpers, "logJob">;
    jobDbId: string;
    source: "auto" | "hitl";
    providerName: string;
    workflowHash: string;
    flattenContinuityFields: (continuity: ManifestContinuity | undefined) => Record<string, unknown>;
    assetIds: CharacterAssetSelection;
    buildJobId: string;
    buildBullmqJobId: string;
  }
): Promise<TManifest & { inputHash: string; manifestHash: string }> {
  const hashedManifest = input.withManifestHashes(input.manifest);
  fs.writeFileSync(input.manifestPath, `${JSON.stringify(hashedManifest, null, 2)}\n`, "utf8");

  await input.helpers.logJob(
    input.jobDbId,
    "info",
    input.source === "hitl" ? "Character assets selected from HITL and queued" : "Character assets generated and auto-selected",
    {
      provider: input.providerName,
      workflowHash: input.workflowHash,
      inputHash: hashedManifest.inputHash,
      manifestHash: hashedManifest.manifestHash,
      ...input.flattenContinuityFields(hashedManifest.reference.continuity),
      manifestPath: input.manifestPath,
      selectedAssetIds: input.assetIds,
      buildJobDbId: input.buildJobId,
      buildBullmqJobId: input.buildBullmqJobId
    }
  );

  return hashedManifest;
}

export async function finalizeSelectionSessionReady(input: {
  sessionId?: string;
  source: "auto" | "hitl";
  continuity: ManifestContinuity | undefined;
  assetIds: CharacterAssetSelection;
  selectedCandidateIds: SelectedCandidateIdMap;
  markPicked: SessionPickedUpdater;
  updateReadyStatus: SessionReadyUpdater;
}): Promise<void> {
  if (!input.sessionId) {
    return;
  }

  await input.markPicked({
    sessionId: input.sessionId,
    selectedByView: buildSelectionSessionPickedMap({
      assetIds: input.assetIds,
      selectedCandidateIds: input.selectedCandidateIds
    })
  });

  await input.updateReadyStatus({
    sessionId: input.sessionId,
    statusMessage: buildSelectionQueuedStatusMessage({
      source: input.source,
      continuity: input.continuity
    })
  });
}
