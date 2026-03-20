import fs from "node:fs";
import type { CharacterView } from "@ec/image-gen";
import {
  buildInitialProviderMeta,
  buildInitialSelectionDiagnostics
} from "./characterGenerationInitialSelection";
import { buildSelectionDecisionOutcome } from "./characterGenerationSelectionDecision";

type ParsedManifestCandidateLike = {
  id: string;
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
  score: number;
  styleScore: number;
  referenceSimilarity: number | null;
  consistencyScore: number | null;
  warnings: string[];
  rejections: string[];
  breakdown: unknown;
  candidate: {
    id: string;
    provider?: string;
    view: CharacterView;
    candidateIndex: number;
    seed: number;
    mimeType: string;
    providerMeta?: unknown;
  };
};

type SelectionOutcomeLike = {
  selectedByView: Partial<Record<CharacterView, unknown>>;
  missingGeneratedViews: CharacterView[];
  lowQualityGeneratedViews: CharacterView[];
  packCoherence?: unknown;
  rigStability?: unknown;
  coherenceIssues: string[];
};

type PromptBundleLike = {
  presetId: string;
  speciesId?: string;
  positivePrompt: string;
  negativePrompt: string;
  guardrails?: unknown;
  selectionHints?: unknown;
  qualityProfile: {
    id: string;
    targetStyle?: string;
  };
};

type GenerationLike = {
  mode: string;
  viewToGenerate?: CharacterView;
  requireHitlPick?: boolean;
  autoPick?: boolean;
  referenceAssetId?: string | null;
};

type ReviewPlanLike = {
  reviewOnly?: boolean;
};

type ReviewChecklistLike = {
  handoff?: string;
};

export function loadRetainedManifestState<TSelectedByView>(input: {
  referenceSourceManifestPath: string;
  viewToGenerate?: CharacterView;
  isRecord: (value: unknown) => value is Record<string, unknown>;
  parseManifestCandidate: (
    sourcePath: string,
    candidate: unknown
  ) => ParsedManifestCandidateLike | null;
}): {
  retainedManifestCandidates: Array<Record<string, unknown>>;
  retainedSelectedByView: TSelectedByView;
} {
  let retainedManifestCandidates: Array<Record<string, unknown>> = [];
  let retainedSelectedByView = {} as TSelectedByView;

  if (!input.viewToGenerate || !fs.existsSync(input.referenceSourceManifestPath)) {
    return { retainedManifestCandidates, retainedSelectedByView };
  }

  const previousRaw = JSON.parse(fs.readFileSync(input.referenceSourceManifestPath, "utf8")) as unknown;
  if (!input.isRecord(previousRaw)) {
    return { retainedManifestCandidates, retainedSelectedByView };
  }

  const previousCandidates = Array.isArray(previousRaw.candidates)
    ? previousRaw.candidates
        .map((candidate) => input.parseManifestCandidate(input.referenceSourceManifestPath, candidate))
        .filter((candidate): candidate is ParsedManifestCandidateLike => candidate !== null)
    : [];

  retainedManifestCandidates = previousCandidates
    .filter((candidate) => candidate.view !== input.viewToGenerate)
    .map((entry) => ({
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
    }));

  if (input.isRecord(previousRaw.selectedByView)) {
    retainedSelectedByView = { ...previousRaw.selectedByView } as TSelectedByView;
    delete (retainedSelectedByView as Record<string, unknown>)[input.viewToGenerate];
  }

  return { retainedManifestCandidates, retainedSelectedByView };
}

export function buildInitialGenerationManifest<TManifest>(input: {
  selectionOutcome: SelectionOutcomeLike;
  acceptedScoreThreshold: number;
  autoRerouteDiagnostics?: unknown;
  workflowStageRuns: Array<Record<string, unknown>>;
  promptBundle: PromptBundleLike;
  mascotReferenceBankDiagnostics?: unknown;
  mascotReferenceBankReviewPlan: ReviewPlanLike;
  mascotReferenceBankReviewChecklist: ReviewChecklistLike;
  providerRunMeta?: {
    selectionDiagnostics?: Record<string, unknown>;
    [key: string]: unknown;
  };
  providerName: string;
  requestedProvider: string;
  providerWarning?: string | null;
  clampedWarnings: string[];
  providerWorkflowHash: string;
  providerGeneratedAt: string;
  generation: GenerationLike;
  ultraWorkflowEnabled: boolean;
  workflowTemplateVersion: string;
  episodeId: string;
  sessionId: string;
  characterPackId: string;
  retainedManifestCandidates: Array<Record<string, unknown>>;
  retainedSelectedByView: Record<string, unknown>;
  continuityReferenceSessionId?: string | null;
  starterReferencePath?: string | null;
  starterReferencePathsByView?: Partial<Record<CharacterView, string>>;
  referenceAnalysis?: {
    phash?: string | null;
    palette?: Array<[number, number, number]> | null;
  };
  continuitySnapshot?: unknown;
  scored: ScoredCandidateLike[];
  resolveSelectionRisk: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    packCoherence: unknown;
    rigStability: unknown;
    targetStyle: string | undefined;
    acceptedScoreThreshold: number;
    autoReroute: unknown;
    speciesId: string | undefined;
  }) => unknown;
  resolveQualityEmbargo: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    rigStability: unknown;
    targetStyle: string | undefined;
    acceptedScoreThreshold: number;
    autoReroute: unknown;
    speciesId: string | undefined;
  }) => unknown;
  buildPackDefectSummary: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    workflowStages: Array<Record<string, unknown>>;
    speciesId: string | undefined;
  }) => unknown;
  resolveFinalQualityFirewall: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    targetStyle: string | undefined;
    acceptedScoreThreshold: number;
    autoReroute: unknown;
    packCoherence: unknown;
    rigStability: unknown;
    selectionRisk: unknown;
    qualityEmbargo: unknown;
    packDefectSummary: unknown;
    speciesId: string | undefined;
  }) => { level?: string } | undefined;
  summarizeSelectionCandidateSummaryByView: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    targetStyle: string | undefined;
    acceptedScoreThreshold: number;
  }) => unknown;
  resolveSelectionWorstRuntimeBucket: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    targetStyle: string | undefined;
  }) => "clean" | "warn" | "degraded" | "compound" | "block" | undefined;
  withManifestHashes: (manifest: unknown) => TManifest;
}): {
  selectedByView: Partial<Record<CharacterView, unknown>>;
  missingGeneratedViews: CharacterView[];
  lowQualityGeneratedViews: CharacterView[];
  packCoherence: unknown;
  initialRigStability: unknown;
  coherenceIssues: string[];
  initialSelectionRisk: unknown;
  initialQualityEmbargo: unknown;
  initialFinalQualityFirewall: { level?: string } | undefined;
  requiresHitl: boolean;
  manifest: TManifest;
} {
  const selectedByView = input.selectionOutcome.selectedByView;
  const missingGeneratedViews = input.selectionOutcome.missingGeneratedViews;
  const lowQualityGeneratedViews = input.selectionOutcome.lowQualityGeneratedViews;
  const packCoherence = input.selectionOutcome.packCoherence;
  const initialRigStability = input.selectionOutcome.rigStability;
  const coherenceIssues = input.selectionOutcome.coherenceIssues;

  const hasSelectedViews = selectedByView && Object.keys(selectedByView).length > 0;
  const initialSelectionRisk =
    packCoherence && hasSelectedViews
      ? input.resolveSelectionRisk({
          selectedByView,
          packCoherence,
          rigStability: initialRigStability,
          targetStyle: input.promptBundle.qualityProfile.targetStyle,
          acceptedScoreThreshold: input.acceptedScoreThreshold,
          autoReroute: input.autoRerouteDiagnostics,
          speciesId: input.promptBundle.speciesId
        })
      : undefined;
  const initialQualityEmbargo = hasSelectedViews
    ? input.resolveQualityEmbargo({
        selectedByView,
        rigStability: initialRigStability,
        targetStyle: input.promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold: input.acceptedScoreThreshold,
        autoReroute: input.autoRerouteDiagnostics,
        speciesId: input.promptBundle.speciesId
      })
    : undefined;
  const initialPackDefectSummary = hasSelectedViews
    ? input.buildPackDefectSummary({
        selectedByView,
        workflowStages: input.workflowStageRuns,
        speciesId: input.promptBundle.speciesId
      })
    : undefined;
  const initialFinalQualityFirewall =
    initialPackDefectSummary && hasSelectedViews
      ? input.resolveFinalQualityFirewall({
          selectedByView,
          targetStyle: input.promptBundle.qualityProfile.targetStyle,
          acceptedScoreThreshold: input.acceptedScoreThreshold,
          autoReroute: input.autoRerouteDiagnostics,
          packCoherence,
          rigStability: initialRigStability,
          selectionRisk: initialSelectionRisk,
          qualityEmbargo: initialQualityEmbargo,
          packDefectSummary: initialPackDefectSummary,
          speciesId: input.promptBundle.speciesId
        })
      : undefined;
  const initialSelectedCandidateSummaryByView = input.summarizeSelectionCandidateSummaryByView({
    selectedByView,
    targetStyle: input.promptBundle.qualityProfile.targetStyle,
    acceptedScoreThreshold: input.acceptedScoreThreshold
  });
  const requiresHitl =
    input.mascotReferenceBankReviewPlan.reviewOnly ||
    input.generation.viewToGenerate !== undefined ||
    input.generation.requireHitlPick === true ||
    input.generation.autoPick === false ||
    missingGeneratedViews.length > 0 ||
    lowQualityGeneratedViews.length > 0 ||
    Boolean((initialRigStability as { reviewOnly?: boolean } | undefined)?.reviewOnly) ||
    coherenceIssues.length > 0 ||
    (packCoherence as { severity?: string } | undefined)?.severity === "block" ||
    (initialRigStability as { severity?: string } | undefined)?.severity === "block" ||
    initialFinalQualityFirewall?.level === "block";
  const decisionOutcome = buildSelectionDecisionOutcome({
    kind: requiresHitl ? "hitl_review" : "auto_selected",
    sourceStage: input.workflowStageRuns.at(-1)?.stage as string | undefined,
    missingGeneratedViews,
    lowQualityGeneratedViews,
    packCoherence: packCoherence as never,
    autoReroute: input.autoRerouteDiagnostics as never,
    worstRuntimeBucket: input.resolveSelectionWorstRuntimeBucket({
      selectedByView,
      targetStyle: input.promptBundle.qualityProfile.targetStyle
    }),
    rigStability: initialRigStability as never,
    selectionRisk: initialSelectionRisk as never,
    qualityEmbargo: initialQualityEmbargo as never,
    finalQualityFirewall: initialFinalQualityFirewall as never,
    referenceBankReviewOnly: input.mascotReferenceBankReviewPlan.reviewOnly,
    referenceBankHandoff: input.mascotReferenceBankReviewChecklist.handoff
  });

  const initialSelectionDiagnostics = buildInitialSelectionDiagnostics({
    existingSelectionDiagnostics: input.providerRunMeta?.selectionDiagnostics,
    workflowStages: input.workflowStageRuns,
    coherenceIssues,
    packCoherence,
    rigStability: initialRigStability,
    selectionRisk: initialSelectionRisk,
    qualityEmbargo: initialQualityEmbargo,
    packDefectSummary: initialPackDefectSummary,
    finalQualityFirewall: initialFinalQualityFirewall,
    selectedCandidateSummaryByView: initialSelectedCandidateSummaryByView,
    referenceBankDiagnostics: input.mascotReferenceBankDiagnostics,
    referenceBankReviewPlan: input.mascotReferenceBankReviewPlan,
    referenceBankReviewChecklist: input.mascotReferenceBankReviewChecklist,
    decisionOutcome,
    autoReroute: input.autoRerouteDiagnostics
  });

  const manifest = input.withManifestHashes({
    schemaVersion: "1.0",
    ...(input.ultraWorkflowEnabled ? { templateVersion: input.workflowTemplateVersion } : {}),
    status: requiresHitl ? "PENDING_HITL" : "AUTO_SELECTED",
    sessionId: input.sessionId,
    episodeId: input.episodeId,
    characterPackId: input.characterPackId,
    provider: input.providerName,
    providerRequested: input.requestedProvider,
    providerWarning:
      [input.providerWarning, ...input.clampedWarnings]
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .join(" | ") || null,
    workflowHash: input.providerWorkflowHash,
    generatedAt: input.providerGeneratedAt,
    mode: input.generation.mode,
    promptPreset: input.promptBundle.presetId,
    species: input.promptBundle.speciesId,
    qualityProfileId: input.promptBundle.qualityProfile.id,
    qualityProfile: input.promptBundle.qualityProfile,
    positivePrompt: input.promptBundle.positivePrompt,
    negativePrompt: input.promptBundle.negativePrompt,
    guardrails: input.promptBundle.guardrails,
    selectionHints: input.promptBundle.selectionHints,
    ...(packCoherence ? { packCoherence } : {}),
    ...(input.autoRerouteDiagnostics ? { autoReroute: input.autoRerouteDiagnostics } : {}),
    providerMeta: buildInitialProviderMeta({
      providerRunMeta: input.providerRunMeta,
      workflowStages: input.workflowStageRuns,
      workflowTemplateVersion: input.workflowTemplateVersion,
      selectionDiagnostics: initialSelectionDiagnostics
    }),
    ...(input.workflowStageRuns.length > 0 ? { workflowStages: input.workflowStageRuns } : {}),
    reference: {
      assetId: input.generation.referenceAssetId ?? null,
      sourceSessionId: input.continuityReferenceSessionId,
      starterPath: input.starterReferencePath,
      ...(input.starterReferencePathsByView ? { starterPathsByView: input.starterReferencePathsByView } : {}),
      phash: input.referenceAnalysis?.phash ?? null,
      palette: input.referenceAnalysis?.palette ?? null,
      continuity: input.continuitySnapshot
    },
    candidates: [
      ...input.retainedManifestCandidates,
      ...input.scored.map((entry) => ({
        id: entry.candidate.id,
        provider: entry.candidate.provider,
        view: entry.candidate.view,
        candidateIndex: entry.candidate.candidateIndex,
        seed: entry.candidate.seed,
        mimeType: entry.candidate.mimeType,
        filePath:
          typeof entry.candidate.providerMeta === "object" && entry.candidate.providerMeta !== null
            ? ((entry.candidate.providerMeta as Record<string, unknown>).localCandidatePath as string | undefined) ?? ""
            : "",
        score: Number(entry.score.toFixed(4)),
        styleScore: Number(entry.styleScore.toFixed(4)),
        referenceSimilarity: entry.referenceSimilarity === null ? null : Number(entry.referenceSimilarity.toFixed(4)),
        consistencyScore: entry.consistencyScore === null ? null : Number(entry.consistencyScore.toFixed(4)),
        warnings: entry.warnings,
        rejections: entry.rejections,
        breakdown: entry.breakdown,
        ...(entry.candidate.providerMeta ? { providerMeta: entry.candidate.providerMeta } : {})
      }))
    ],
    selectedByView: input.retainedSelectedByView
  });

  return {
    selectedByView,
    missingGeneratedViews,
    lowQualityGeneratedViews,
    packCoherence,
    initialRigStability,
    coherenceIssues,
    initialSelectionRisk,
    initialQualityEmbargo,
    initialFinalQualityFirewall,
    requiresHitl,
    manifest
  };
}
