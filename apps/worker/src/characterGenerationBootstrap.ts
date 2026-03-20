import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { CharacterView } from "@ec/image-gen";

type GenerationLike = {
  mode: string;
  promptPreset: string;
  species?: string;
  positivePrompt?: string | null;
  negativePrompt?: string | null;
  referenceAssetId?: string | null;
  viewToGenerate?: CharacterView;
  provider?: string | null;
  seed?: number | null;
  manifestPath?: string | null;
  sourceManifestPath?: string | null;
  selectedCandidateIds?: Record<CharacterView, string> | null;
};

type PromptBundleLike = {
  presetId: string;
  speciesId?: string;
  positivePrompt: string;
  negativePrompt: string;
  qualityProfile: {
    targetStyle?: string;
  };
};

type SessionLike = {
  id: string;
};

type ImageAnalysisLike = {
  phash?: string | null;
  palette?: Array<[number, number, number]> | null;
};

type JobLogger = (jobId: string, level: string, message: string, details?: unknown) => Promise<void>;
type SetJobStatus = (
  jobId: string,
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED",
  patch?: Partial<{
    progress: number;
    attemptsMade: number;
    lastError: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
  }>
) => Promise<void>;
type SetEpisodeStatus = (
  episodeId: string,
  status: "GENERATING" | "PREVIEW_READY" | "COMPLETED" | "FAILED"
) => Promise<void>;

export async function initializeCharacterGenerationBootstrap(input: {
  prisma: PrismaClient;
  episodeId: string;
  characterPackId: string;
  generation: GenerationLike;
  continuityAutoOverride?: boolean | null;
  repoRoot: string;
  jobDbId: string;
  buildCharacterPrompt: (input: {
    mode: string;
    presetId: string;
    speciesId: unknown;
    positivePrompt: string;
    negativePrompt: string | null | undefined;
    styleHints: unknown;
  }) => PromptBundleLike;
  deriveStyleHintsFromChannelBible: (input: unknown) => unknown;
  summarizeMascotReferenceBankDiagnostics: (speciesId?: string) => unknown;
  buildMascotReferenceBankReviewPlan: (diagnostics: unknown) => unknown;
  buildReferenceBankReviewChecklist: (input: {
    diagnostics: unknown;
    reviewPlan: unknown;
  }) => unknown;
  readContinuityReferenceConfig: () => Record<string, unknown>;
  shouldAutoContinuityReference: () => boolean;
  analyzeImage: (buffer: Buffer) => Promise<ImageAnalysisLike>;
  getAssetObject: (assetKey: unknown) => Promise<Buffer>;
  normalizeReferenceAssetStorageKey: (asset: unknown) => unknown;
  readGenerationLimits: () => unknown;
  clampGenerationRequest: (
    generation: GenerationLike,
    viewCount: number,
    limits: unknown
  ) => { candidateCount: number; [key: string]: unknown };
  manifestBasePath: (
    jobDbId: string,
    manifestPath: string | null | undefined,
    repoRoot: string
  ) => string;
  resolveManifestReadPath: (
    jobDbId: string,
    input: {
      manifestPath: string | null | undefined;
      sourceManifestPath: string | null | undefined;
    },
    repoRoot: string
  ) => string;
  upsertGenerationSession: (input: {
    prisma: PrismaClient;
    generation: GenerationLike;
    episodeId: string;
    characterPackId: string;
    promptPresetId: string;
    positivePrompt: string;
    negativePrompt: string;
    seed: number;
    candidateCount: number;
    manifestPath: string;
    statusMessage: string;
  }) => Promise<SessionLike>;
  hasCandidateSelection: (value: GenerationLike["selectedCandidateIds"]) => boolean;
  normalizeSelectedCandidateIds: (value: Record<CharacterView, string>) => Record<CharacterView, string>;
  resolveAutoContinuityReference: (input: {
    prisma: PrismaClient;
    episodeId: string;
    channelId: string;
    characterPackId: string;
    currentSessionId: string;
    config: Record<string, unknown>;
  }) => Promise<{
    match?: {
      referenceImageBase64: string;
      referenceMimeType?: string;
      sessionId: string;
      sourcePool?: string;
      candidatePicked?: boolean;
      candidateScore?: number | null;
      candidateRejectionCount?: number | null;
      candidateUpdatedAt?: string | null;
    } | null;
    diagnostics: Record<string, unknown>;
  }>;
  isMascotTargetStyle: (targetStyle: string | undefined) => boolean;
  loadMascotStarterReference: (
    speciesId: string | undefined,
    view: CharacterView
  ) => { referenceImageBase64: string; referenceMimeType?: string; sourcePath: string } | null;
  loadMascotFamilyReferenceCached: (
    speciesId: string | undefined,
    view: CharacterView
  ) => { referenceImageBase64: string; referenceMimeType?: string; sourcePath: string } | null;
  logJob: JobLogger;
  setJobStatus: SetJobStatus;
  setEpisodeStatus: SetEpisodeStatus;
}): Promise<{
  episode: { id: string; topic: string; channelId: string };
  promptBundle: PromptBundleLike;
  mascotReferenceBankDiagnostics: unknown;
  mascotReferenceBankReviewPlan: unknown;
  mascotReferenceBankReviewChecklist: unknown;
  continuityConfig: Record<string, unknown>;
  continuityPolicy: Record<string, unknown>;
  continuityAutoEnabled: boolean;
  referenceAnalysis?: ImageAnalysisLike;
  referenceImageBase64?: string;
  referenceMimeType?: string;
  continuityReferenceSessionId: string | null;
  starterReferencePath: string | null;
  starterReferencePathsByView?: Partial<Record<CharacterView, string>>;
  continuitySnapshot?: unknown;
  limits: unknown;
  earlyViews: CharacterView[];
  clamped: { candidateCount: number; [key: string]: unknown };
  manifestPath: string;
  referenceSourceManifestPath: string;
  sessionId: string;
  selectedCandidateIds?: Record<CharacterView, string>;
  writeGenerationProgress: (progress: number, stage: string, details?: Record<string, unknown>) => Promise<void>;
}> {
  await input.setEpisodeStatus(input.episodeId, "GENERATING");

  const episode = await input.prisma.episode.findUnique({
    where: { id: input.episodeId },
    select: {
      id: true,
      topic: true,
      channelId: true
    }
  });
  if (!episode) {
    throw new Error(`Episode not found: ${input.episodeId}`);
  }

  const channelBible = await input.prisma.channelBible.findFirst({
    where: {
      channelId: episode.channelId,
      isActive: true
    },
    orderBy: {
      version: "desc"
    },
    select: {
      id: true,
      json: true
    }
  });

  const promptBundle = input.buildCharacterPrompt({
    mode: input.generation.mode,
    presetId: input.generation.promptPreset,
    speciesId: input.generation.species,
    positivePrompt: input.generation.positivePrompt ?? episode.topic,
    negativePrompt: input.generation.negativePrompt,
    styleHints: input.deriveStyleHintsFromChannelBible(channelBible?.json)
  });
  const mascotReferenceBankDiagnostics = input.summarizeMascotReferenceBankDiagnostics(promptBundle.speciesId);
  const mascotReferenceBankReviewPlan =
    input.buildMascotReferenceBankReviewPlan(mascotReferenceBankDiagnostics);
  const mascotReferenceBankReviewChecklist = input.buildReferenceBankReviewChecklist({
    diagnostics: mascotReferenceBankDiagnostics,
    reviewPlan: mascotReferenceBankReviewPlan
  });
  const continuityConfig = input.readContinuityReferenceConfig();
  const continuityAutoEnabled = input.continuityAutoOverride ?? input.shouldAutoContinuityReference();
  const continuityPolicy = {
    ...continuityConfig,
    requestOverride: input.continuityAutoOverride ?? null
  };

  let referenceAnalysis: ImageAnalysisLike | undefined;
  let referenceImageBase64: string | undefined;
  let referenceMimeType: string | undefined;
  let continuityReferenceSessionId: string | null = null;
  let starterReferencePath: string | null = null;
  let starterReferencePathsByView: Partial<Record<CharacterView, string>> | undefined;
  let continuitySnapshot: unknown;

  if (input.generation.mode === "reference") {
    continuitySnapshot = {
      enabled: false,
      attempted: false,
      applied: false,
      reason: "reference_mode"
    };
    if (!input.generation.referenceAssetId) {
      throw new Error("reference mode requires generation.referenceAssetId");
    }

    const referenceAsset = await input.prisma.asset.findUnique({
      where: { id: input.generation.referenceAssetId },
      select: {
        id: true,
        channelId: true,
        status: true,
        normalizedKey1024: true,
        normalizedKey2048: true,
        originalKey: true,
        storageKey: true,
        mime: true
      }
    });
    if (!referenceAsset) {
      throw new Error(`reference asset not found: ${input.generation.referenceAssetId}`);
    }
    if (referenceAsset.channelId !== episode.channelId) {
      throw new Error("reference asset channel mismatch");
    }
    if (referenceAsset.status !== "READY") {
      throw new Error("reference asset must be READY");
    }
    const referenceBuffer = await input.getAssetObject(
      input.normalizeReferenceAssetStorageKey(referenceAsset)
    );
    referenceAnalysis = await input.analyzeImage(referenceBuffer);
    referenceImageBase64 = referenceBuffer.toString("base64");
    referenceMimeType = referenceAsset.mime ?? "image/png";
  }

  const limits = input.readGenerationLimits();
  const earlyViews: CharacterView[] = input.generation.viewToGenerate
    ? [input.generation.viewToGenerate]
    : ["front", "threeQuarter", "profile"];
  const clamped = input.clampGenerationRequest(input.generation, earlyViews.length, limits) as {
    candidateCount: number;
    [key: string]: unknown;
  };
  const manifestPath = input.manifestBasePath(input.jobDbId, input.generation.manifestPath, input.repoRoot);
  const referenceSourceManifestPath = input.resolveManifestReadPath(
    input.jobDbId,
    {
      manifestPath: input.generation.manifestPath,
      sourceManifestPath: input.generation.sourceManifestPath
    },
    input.repoRoot
  );
  const progressPath = path.join(path.dirname(manifestPath), "generation_progress.json");

  const session = await input.upsertGenerationSession({
    prisma: input.prisma,
    generation: input.generation,
    episodeId: input.episodeId,
    characterPackId: input.characterPackId,
    promptPresetId: promptBundle.presetId,
    positivePrompt: promptBundle.positivePrompt,
    negativePrompt: promptBundle.negativePrompt,
    seed: input.generation.seed ?? 101,
    candidateCount: clamped.candidateCount,
    manifestPath,
    statusMessage: input.generation.viewToGenerate
      ? `Generating candidates for view: ${input.generation.viewToGenerate}`
      : "Generating candidates for all views."
  });

  const writeGenerationProgress = async (
    progress: number,
    stage: string,
    details?: Record<string, unknown>
  ) => {
    const progressPayload = {
      schemaVersion: "1.0",
      updatedAt: new Date().toISOString(),
      jobId: input.jobDbId,
      episodeId: input.episodeId,
      characterPackId: input.characterPackId,
      sessionId: session.id,
      stage,
      progress,
      details: details ?? {}
    };
    fs.mkdirSync(path.dirname(progressPath), { recursive: true });
    fs.writeFileSync(progressPath, `${JSON.stringify(progressPayload, null, 2)}\n`, "utf8");
    await input.setJobStatus(input.jobDbId, "RUNNING", { progress, lastError: null });
  };

  await writeGenerationProgress(4, "session_ready", {
    sessionId: session.id,
    providerRequested: input.generation.provider ?? null,
    requestedViews: earlyViews,
    candidateCount: clamped.candidateCount
  });

  const selectedCandidateIds = input.hasCandidateSelection(input.generation.selectedCandidateIds)
    ? input.normalizeSelectedCandidateIds(input.generation.selectedCandidateIds as Record<CharacterView, string>)
    : undefined;

  if (
    !selectedCandidateIds &&
    input.generation.mode === "new" &&
    !referenceImageBase64 &&
    continuityAutoEnabled
  ) {
    const continuity = await input.resolveAutoContinuityReference({
      prisma: input.prisma,
      episodeId: input.episodeId,
      channelId: episode.channelId,
      characterPackId: input.characterPackId,
      currentSessionId: session.id,
      config: continuityConfig
    });
    if (continuity.match) {
      try {
        referenceImageBase64 = continuity.match.referenceImageBase64;
        referenceMimeType = continuity.match.referenceMimeType;
        continuityReferenceSessionId = continuity.match.sessionId;
        referenceAnalysis = await input.analyzeImage(
          Buffer.from(continuity.match.referenceImageBase64, "base64")
        );
        await input.logJob(input.jobDbId, "info", "Auto continuity reference applied", {
          sourceSessionId: continuity.match.sessionId,
          characterPackId: input.characterPackId,
          policy: continuityPolicy,
          diagnostics: {
            ...continuity.diagnostics,
            sourcePool: continuity.match.sourcePool,
            candidatePicked: continuity.match.candidatePicked,
            candidateScore: continuity.match.candidateScore,
            candidateRejectionCount: continuity.match.candidateRejectionCount,
            candidateUpdatedAt: continuity.match.candidateUpdatedAt
          }
        });
        continuitySnapshot = {
          enabled: true,
          attempted: true,
          applied: true,
          reason: "matched",
          attemptedSourceSessionId: continuity.match.sessionId,
          ...continuity.diagnostics,
          sourcePool: continuity.match.sourcePool,
          candidatePicked: continuity.match.candidatePicked,
          candidateScore: continuity.match.candidateScore,
          candidateRejectionCount: continuity.match.candidateRejectionCount,
          candidateUpdatedAt: continuity.match.candidateUpdatedAt,
          policy: continuityPolicy
        };
      } catch (error) {
        referenceImageBase64 = undefined;
        referenceMimeType = undefined;
        continuityReferenceSessionId = null;
        referenceAnalysis = undefined;
        await input.logJob(input.jobDbId, "warn", "Auto continuity reference ignored due to invalid source", {
          characterPackId: input.characterPackId,
          sourceSessionId: continuity.match.sessionId,
          policy: continuityPolicy,
          diagnostics: continuity.diagnostics,
          error: error instanceof Error ? error.message : String(error)
        });
        continuitySnapshot = {
          enabled: true,
          attempted: true,
          applied: false,
          reason: "invalid_source",
          attemptedSourceSessionId: continuity.match.sessionId,
          ...continuity.diagnostics,
          policy: continuityPolicy
        };
      }
    } else {
      await input.logJob(input.jobDbId, "info", "Auto continuity reference skipped", {
        characterPackId: input.characterPackId,
        policy: continuityPolicy,
        diagnostics: continuity.diagnostics
      });
      continuitySnapshot = {
        enabled: true,
        attempted: true,
        applied: false,
        reason: continuity.diagnostics.reason ?? "skipped",
        ...continuity.diagnostics,
        policy: continuityPolicy
      };
    }
  } else if (input.generation.mode === "new") {
    const hasHitlSelection = Boolean(selectedCandidateIds);
    const hasReferenceAlready = Boolean(referenceImageBase64);
    let reason = "not_attempted";
    if (!continuityAutoEnabled) {
      reason = input.continuityAutoOverride === false ? "disabled_by_request" : "disabled_by_env";
    } else if (hasHitlSelection) {
      reason = "hitl_selection_present";
    } else if (hasReferenceAlready) {
      reason = "reference_already_present";
    }
    continuitySnapshot = {
      enabled: continuityAutoEnabled,
      attempted: false,
      applied: false,
      reason,
      policy: continuityPolicy
    };
    await input.logJob(input.jobDbId, "info", "Auto continuity reference not attempted", {
      characterPackId: input.characterPackId,
      reason,
      policy: continuityPolicy
    });
  }

  if (
    input.generation.mode === "new" &&
    !referenceImageBase64 &&
    input.isMascotTargetStyle(promptBundle.qualityProfile.targetStyle) &&
    (input.generation.viewToGenerate !== undefined || earlyViews.length === 1)
  ) {
    const mascotSeedReference =
      input.loadMascotStarterReference(promptBundle.speciesId, "front") ??
      input.loadMascotFamilyReferenceCached(promptBundle.speciesId, "front");
    if (mascotSeedReference) {
      referenceImageBase64 = mascotSeedReference.referenceImageBase64;
      referenceMimeType = mascotSeedReference.referenceMimeType;
      starterReferencePath = mascotSeedReference.sourcePath;
      starterReferencePathsByView = {
        ...(starterReferencePathsByView ?? {}),
        front: mascotSeedReference.sourcePath
      };
      referenceAnalysis = await input.analyzeImage(
        Buffer.from(mascotSeedReference.referenceImageBase64, "base64")
      );
      await input.logJob(input.jobDbId, "info", "Mascot seed reference applied", {
        speciesId: promptBundle.speciesId,
        starterReferencePath
      });
    }
  }

  return {
    episode,
    promptBundle,
    mascotReferenceBankDiagnostics,
    mascotReferenceBankReviewPlan,
    mascotReferenceBankReviewChecklist,
    continuityConfig,
    continuityPolicy,
    continuityAutoEnabled,
    referenceAnalysis,
    referenceImageBase64,
    referenceMimeType,
    continuityReferenceSessionId,
    starterReferencePath,
    starterReferencePathsByView,
    continuitySnapshot,
    limits,
    earlyViews,
    clamped,
    manifestPath,
    referenceSourceManifestPath,
    sessionId: session.id,
    selectedCandidateIds,
    writeGenerationProgress
  };
}
