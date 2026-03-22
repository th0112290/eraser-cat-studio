import fs from "node:fs";
import type {
  CharacterGenerationCandidate,
  CharacterView,
  PromptQualityProfile
} from "@ec/image-gen";

type ParsedManifestCandidateLike = {
  id: string;
  provider?: string;
  view: CharacterView;
  candidateIndex: number;
  seed: number;
  mimeType: string;
  filePath: string;
  score: number;
  styleScore: number;
  referenceSimilarity: number | null;
  consistencyScore: number | null;
  warnings: string[];
  rejections: string[];
  breakdown?: unknown;
  providerMeta?: unknown;
};

type ScoredCandidateLike = {
  candidate: CharacterGenerationCandidate;
  analysis: {
    phash?: string | null;
    palette?: Array<[number, number, number]> | null;
  };
  score: number;
  styleScore: number;
  referenceSimilarity: number | null;
  consistencyScore: number | null;
  warnings: string[];
  rejections: string[];
  breakdown: unknown;
};

type PromptBundleLike = {
  presetId: string;
  speciesId?: string;
  positivePrompt: string;
  negativePrompt: string;
  guardrails?: string[];
  selectionHints?: Record<string, unknown>;
  qualityProfile: PromptQualityProfile;
};

type GenerationLike = {
  mode: string;
  species?: string;
  referenceAssetId?: string | null;
};

export async function handleHitlSelectedGeneration<TManifest>(input: {
  selectedManifestPath: string;
  selectedCandidateIds: Record<CharacterView, string>;
  promptBundle: PromptBundleLike;
  generation: GenerationLike;
  sessionId: string;
  episodeId: string;
  characterPackId: string;
  continuityReferenceSessionId?: string | null;
  starterReferencePath?: string | null;
  starterReferencePathsByView?: Partial<Record<CharacterView, string>>;
  continuitySnapshot?: unknown;
  referenceAnalysis?: {
    phash?: string | null;
    palette?: Array<[number, number, number]> | null;
  };
  isRecord: (value: unknown) => value is Record<string, unknown>;
  asString: (value: unknown) => string;
  parseManifestCandidate: (
    sourcePath: string,
    candidate: unknown
  ) => ParsedManifestCandidateLike | null;
  parseManifestContinuity: (value: unknown) => unknown;
  analyzeImage: (buffer: Buffer) => Promise<{
    phash?: string | null;
    palette?: Array<[number, number, number]> | null;
  }>;
  clamp01: (value: number) => number;
  normalizeSpecies: (value: unknown) => string;
  scoreAlphaCoverage: (analysis: unknown) => number;
  scoreBBoxOccupancy: (analysis: unknown) => number;
  scoreSharpness: (analysis: unknown) => number;
  scoreNoise: (analysis: unknown) => number;
  scoreWatermarkSafety: (analysis: unknown) => number;
  scoreResolutionQuality: (analysis: unknown) => number;
  withManifestHashes: (manifest: unknown) => TManifest;
  persistHitlSelection: (input: {
    manifest: TManifest;
    selectedByView: Record<CharacterView, ScoredCandidateLike>;
    providerName: string;
    workflowHash: string;
  }) => Promise<void>;
}): Promise<void> {
  if (!fs.existsSync(input.selectedManifestPath)) {
    throw new Error(`HITL manifest not found: ${input.selectedManifestPath}`);
  }

  const parsedManifest = JSON.parse(fs.readFileSync(input.selectedManifestPath, "utf8")) as unknown;
  if (!input.isRecord(parsedManifest)) {
    throw new Error("Invalid generation manifest format");
  }

  const manifestCandidates = Array.isArray(parsedManifest.candidates) ? parsedManifest.candidates : [];
  const parsedCandidates = manifestCandidates
    .map((candidate) => input.parseManifestCandidate(input.selectedManifestPath, candidate))
    .filter((candidate): candidate is ParsedManifestCandidateLike => candidate !== null);

  const byId = new Map(parsedCandidates.map((candidate) => [candidate.id, candidate]));
  const selectedEntries = {
    front: byId.get(input.selectedCandidateIds.front),
    threeQuarter: byId.get(input.selectedCandidateIds.threeQuarter),
    profile: byId.get(input.selectedCandidateIds.profile)
  };

  if (!selectedEntries.front || selectedEntries.front.view !== "front") {
    throw new Error(`Invalid HITL selection for front: ${input.selectedCandidateIds.front}`);
  }
  if (!selectedEntries.threeQuarter || selectedEntries.threeQuarter.view !== "threeQuarter") {
    throw new Error(`Invalid HITL selection for threeQuarter: ${input.selectedCandidateIds.threeQuarter}`);
  }
  if (!selectedEntries.profile || selectedEntries.profile.view !== "profile") {
    throw new Error(`Invalid HITL selection for profile: ${input.selectedCandidateIds.profile}`);
  }

  const toScored = async (
    entry: ParsedManifestCandidateLike | undefined
  ): Promise<ScoredCandidateLike> => {
    if (!entry) {
      throw new Error("Missing selected candidate");
    }
    if (!fs.existsSync(entry.filePath)) {
      throw new Error(`Selected candidate file missing: ${entry.filePath}`);
    }

    const data = fs.readFileSync(entry.filePath);
    const analysis = await input.analyzeImage(data);
    const manifestProvider = input.asString(parsedManifest.provider).trim();
    const candidate: CharacterGenerationCandidate = {
      id: entry.id,
      ...(entry.provider ? { provider: entry.provider } : {}),
      view: entry.view,
      candidateIndex: entry.candidateIndex,
      seed: entry.seed,
      provider:
        manifestProvider === "comfyui"
          ? "comfyui"
          : manifestProvider === "remoteApi"
            ? "remoteApi"
            : manifestProvider === "vertexImagen"
              ? "vertexImagen"
            : "mock",
      prompt: input.asString(parsedManifest.positivePrompt),
      negativePrompt: input.asString(parsedManifest.negativePrompt),
      mimeType: entry.mimeType,
      data,
      providerMeta: {
        ...(entry.providerMeta ?? {}),
        localCandidatePath: entry.filePath
      }
    };

    return {
      candidate,
      analysis,
      score: input.clamp01(entry.score),
      styleScore: input.clamp01(entry.styleScore),
      referenceSimilarity: entry.referenceSimilarity,
      consistencyScore: entry.consistencyScore,
      warnings: entry.warnings,
      rejections: entry.rejections,
      breakdown:
        entry.breakdown ?? {
          alphaScore: input.scoreAlphaCoverage(analysis),
          occupancyScore: input.scoreBBoxOccupancy(analysis),
          sharpnessScore: input.scoreSharpness(analysis),
          noiseScore: input.scoreNoise(analysis),
          watermarkScore: input.scoreWatermarkSafety(analysis),
          resolutionScore: input.scoreResolutionQuality(analysis),
          referenceScore: entry.referenceSimilarity ?? 0.5,
          styleScore: input.clamp01(entry.styleScore),
          qualityScore: input.clamp01(
            input.scoreAlphaCoverage(analysis) * 0.16 +
              input.scoreBBoxOccupancy(analysis) * 0.18 +
              input.scoreSharpness(analysis) * 0.2 +
              input.scoreNoise(analysis) * 0.12 +
              input.scoreWatermarkSafety(analysis) * 0.2 +
              input.scoreResolutionQuality(analysis) * 0.14
          ),
          consistencyScore: entry.consistencyScore,
          generationRound: 0
        }
    };
  };

  const selectedByView: Record<CharacterView, ScoredCandidateLike> = {
    front: await toScored(selectedEntries.front),
    threeQuarter: await toScored(selectedEntries.threeQuarter),
    profile: await toScored(selectedEntries.profile)
  };

  const guardrails = Array.isArray(parsedManifest.guardrails)
    ? parsedManifest.guardrails.filter((item): item is string => typeof item === "string")
    : input.promptBundle.guardrails;
  const parsedQualityProfile =
    input.isRecord(parsedManifest.qualityProfile)
      ? (parsedManifest.qualityProfile as PromptQualityProfile)
      : undefined;
  const parsedSelectionHints = input.isRecord(parsedManifest.selectionHints)
    ? {
        ...(typeof parsedManifest.selectionHints.minAcceptedScore === "number"
          ? { minAcceptedScore: parsedManifest.selectionHints.minAcceptedScore }
          : {}),
        ...(typeof parsedManifest.selectionHints.frontMasterMinAcceptedScore === "number"
          ? { frontMasterMinAcceptedScore: parsedManifest.selectionHints.frontMasterMinAcceptedScore }
          : {}),
        ...(typeof parsedManifest.selectionHints.autoRetryRounds === "number"
          ? { autoRetryRounds: parsedManifest.selectionHints.autoRetryRounds }
          : {}),
        ...(typeof parsedManifest.selectionHints.frontMasterCandidateCount === "number"
          ? { frontMasterCandidateCount: parsedManifest.selectionHints.frontMasterCandidateCount }
          : {}),
        ...(typeof parsedManifest.selectionHints.sequentialReference === "boolean"
          ? { sequentialReference: parsedManifest.selectionHints.sequentialReference }
          : {}),
        ...(typeof parsedManifest.selectionHints.prioritizeConsistency === "boolean"
          ? { prioritizeConsistency: parsedManifest.selectionHints.prioritizeConsistency }
          : {})
      }
    : undefined;
  const parsedProviderMeta =
    input.isRecord(parsedManifest.providerMeta)
      ? parsedManifest.providerMeta
      : undefined;
  const providerRequestedRaw = input.asString(parsedManifest.providerRequested).trim();
  const providerWarningRaw = input.asString(parsedManifest.providerWarning).trim();
  const parsedReference = input.isRecord(parsedManifest.reference) ? parsedManifest.reference : {};
  const parsedContinuity = input.parseManifestContinuity(parsedReference.continuity);

  const manifest = input.withManifestHashes({
    schemaVersion: "1.0",
    status: "HITL_SELECTED",
    sessionId: input.sessionId,
    episodeId: input.episodeId,
    characterPackId: input.characterPackId,
    provider: input.asString(parsedManifest.provider).trim() || "mock",
    providerRequested: providerRequestedRaw.length > 0 ? providerRequestedRaw : null,
    providerWarning: providerWarningRaw.length > 0 ? providerWarningRaw : null,
    workflowHash: input.asString(parsedManifest.workflowHash).trim() || "hitl-selection",
    generatedAt: input.asString(parsedManifest.generatedAt).trim() || new Date().toISOString(),
    mode: input.asString(parsedManifest.mode).trim() || input.generation.mode,
    promptPreset: input.asString(parsedManifest.promptPreset).trim() || input.promptBundle.presetId,
    species:
      input.asString(parsedManifest.species).trim() ||
      input.promptBundle.speciesId ||
      input.normalizeSpecies(input.generation.species),
    qualityProfileId:
      input.asString(parsedManifest.qualityProfileId).trim() ||
      parsedQualityProfile?.id ||
      input.promptBundle.qualityProfile.id,
    qualityProfile: parsedQualityProfile ?? input.promptBundle.qualityProfile,
    positivePrompt: input.asString(parsedManifest.positivePrompt).trim() || input.promptBundle.positivePrompt,
    negativePrompt: input.asString(parsedManifest.negativePrompt).trim() || input.promptBundle.negativePrompt,
    guardrails,
    selectionHints: parsedSelectionHints ?? input.promptBundle.selectionHints,
    ...(parsedProviderMeta ? { providerMeta: parsedProviderMeta } : {}),
    reference: {
      assetId:
        typeof parsedReference.assetId === "string"
          ? parsedReference.assetId
          : input.generation.referenceAssetId ?? null,
      sourceSessionId:
        typeof parsedReference.sourceSessionId === "string" && parsedReference.sourceSessionId.trim().length > 0
          ? parsedReference.sourceSessionId
          : input.continuityReferenceSessionId,
      starterPath:
        typeof parsedReference.starterPath === "string" && parsedReference.starterPath.trim().length > 0
          ? parsedReference.starterPath
          : input.starterReferencePath,
      starterPathsByView:
        parsedReference.starterPathsByView &&
        typeof parsedReference.starterPathsByView === "object" &&
        !Array.isArray(parsedReference.starterPathsByView)
          ? (parsedReference.starterPathsByView as Partial<Record<CharacterView, string>>)
          : input.starterReferencePathsByView,
      phash: typeof parsedReference.phash === "string" ? parsedReference.phash : null,
      palette: Array.isArray(parsedReference.palette)
        ? (parsedReference.palette.filter(
            (item): item is [number, number, number] =>
              Array.isArray(item) &&
              item.length === 3 &&
              item.every((value) => typeof value === "number")
          ) as Array<[number, number, number]>)
        : null,
      continuity: parsedContinuity ?? input.continuitySnapshot
    },
    candidates: parsedCandidates.map((entry) => ({
      id: entry.id,
      view: entry.view,
      candidateIndex: entry.candidateIndex,
      seed: entry.seed,
      mimeType: entry.mimeType,
      filePath: entry.filePath,
      score: Number(entry.score.toFixed(4)),
      styleScore: Number(entry.styleScore.toFixed(4)),
      referenceSimilarity: entry.referenceSimilarity === null ? null : Number(entry.referenceSimilarity.toFixed(4)),
      consistencyScore: entry.consistencyScore === null ? null : Number(entry.consistencyScore.toFixed(4)),
      warnings: entry.warnings,
      rejections: entry.rejections,
      ...(entry.breakdown ? { breakdown: entry.breakdown } : {}),
      ...(entry.providerMeta ? { providerMeta: entry.providerMeta } : {})
    })),
    selectedByView: {}
  });

  await input.persistHitlSelection({
    manifest,
    selectedByView,
    providerName:
      typeof (manifest as { provider?: unknown }).provider === "string"
        ? ((manifest as { provider: string }).provider)
        : "mock",
    workflowHash:
      typeof (manifest as { workflowHash?: unknown }).workflowHash === "string"
        ? ((manifest as { workflowHash: string }).workflowHash)
        : "hitl-selection"
  });
}
