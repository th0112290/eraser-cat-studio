import type { CharacterView } from "@ec/image-gen";
import type {
  CharacterAssetSelection,
  CharacterGenerationPayload,
  CharacterPackJobPayload,
  EpisodeJobPayload
} from "./queue";
import { formatContinuitySentence, type ManifestContinuity } from "./characterGenerationManifestState";

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
