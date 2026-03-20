import type { CharacterView } from "@ec/image-gen";
import { buildManifestSelectedByView, toFlatContinuityFields, type ManifestContinuity } from "./characterGenerationManifestState";
import {
  buildPersistedSelectionDiagnostics,
  handleBlockedSelectionReview
} from "./characterGenerationSelectionReview";
import {
  buildSelectionDecisionOutcome,
  summarizeFinalQualityFirewall,
  summarizeQualityEmbargo,
  summarizeSelectionRisk
} from "./characterGenerationSelectionDecision";

type PackCoherenceLike = {
  severity: string;
  score: number;
  issues: string[];
};

type SummarySeverityLike = {
  severity?: string;
  summary?: string;
  reviewOnly?: boolean;
  level?: string;
  reasonCodes?: string[];
  fallbackReasonCodes?: string[];
  reasonFamilies?: string[];
  repairability?: string;
  suggestedAction?: "pick-manually" | "recreate";
};

type SummaryLevelLike = {
  level?: string;
  reasonCodes: string[];
  suggestedAction?: "pick-manually" | "recreate";
};

type WorkflowStageLike = {
  stage?: string;
};

type ManifestLike = {
  species?: string;
  qualityProfile?: {
    targetStyle?: string;
  };
  autoReroute?: unknown;
  workflowStages?: WorkflowStageLike[];
  providerMeta?: {
    workflowStage?: string;
    selectionDiagnostics?: Record<string, unknown>;
  };
  reference: { continuity?: ManifestContinuity };
  packCoherence?: unknown;
  selectedByView: Record<string, unknown>;
  status: string;
};

export function prepareSelectionPersistenceContext<TManifest extends ManifestLike>(input: {
  source: "auto" | "hitl";
  selectedByView: Partial<Record<CharacterView, unknown>>;
  manifest: TManifest;
  resolveAcceptedScoreThreshold: (manifest: TManifest) => number;
  buildPackCoherenceDiagnostics: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    targetStyle: string | undefined;
    acceptedScoreThreshold: number;
    speciesId: string | undefined;
  }) => PackCoherenceLike;
  summarizeSelectionCandidateSummaryByView: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    targetStyle: string | undefined;
    acceptedScoreThreshold: number;
  }) => unknown;
  assessRigStability: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    packCoherence: unknown;
    targetStyle: string | undefined;
    speciesId: string | undefined;
    autoReroute: unknown;
  }) => SummarySeverityLike;
  assessAutoSelectionRisk: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    packCoherence: unknown;
    rigStability: unknown;
    targetStyle: string | undefined;
    acceptedScoreThreshold: number;
    autoReroute: unknown;
    speciesId: string | undefined;
  }) => SummaryLevelLike;
  assessQualityEmbargo: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    rigStability: unknown;
    targetStyle: string | undefined;
    acceptedScoreThreshold: number;
    autoReroute: unknown;
    speciesId: string | undefined;
  }) => SummaryLevelLike;
  buildPackDefectSummary: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    workflowStages: WorkflowStageLike[] | undefined;
    speciesId: string | undefined;
  }) => unknown;
  assessFinalQualityFirewall: (input: {
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
  }) => SummaryLevelLike;
  resolveSelectionWorstRuntimeBucket: (input: {
    selectedByView: Partial<Record<CharacterView, unknown>>;
    targetStyle: string | undefined;
  }) => "clean" | "warn" | "degraded" | "compound" | "block" | undefined;
}): {
  manifest: TManifest;
  acceptedScoreThreshold: number;
  packCoherence: PackCoherenceLike;
  attemptedSelectionSummary: unknown;
  rigStability: SummarySeverityLike;
  selectionRisk: SummaryLevelLike;
  qualityEmbargo: SummaryLevelLike;
  packDefectSummary: unknown;
  finalQualityFirewall: SummaryLevelLike;
  selectionRiskSummary: string;
  qualityEmbargoSummary: string;
  finalQualityFirewallSummary: string;
  requiresSelectionReview: boolean;
} {
  const acceptedScoreThreshold = input.resolveAcceptedScoreThreshold(input.manifest);
  const packCoherence = input.buildPackCoherenceDiagnostics({
    selectedByView: input.selectedByView,
    targetStyle: input.manifest.qualityProfile?.targetStyle,
    acceptedScoreThreshold,
    speciesId: input.manifest.species
  });
  const attemptedSelectionSummary = input.summarizeSelectionCandidateSummaryByView({
    selectedByView: input.selectedByView,
    targetStyle: input.manifest.qualityProfile?.targetStyle,
    acceptedScoreThreshold
  });
  const rigStability = input.assessRigStability({
    selectedByView: input.selectedByView,
    packCoherence,
    targetStyle: input.manifest.qualityProfile?.targetStyle,
    speciesId: input.manifest.species,
    autoReroute: input.manifest.autoReroute
  });
  const selectionRisk = input.assessAutoSelectionRisk({
    selectedByView: input.selectedByView,
    packCoherence,
    rigStability,
    targetStyle: input.manifest.qualityProfile?.targetStyle,
    acceptedScoreThreshold,
    autoReroute: input.manifest.autoReroute,
    speciesId: input.manifest.species
  });
  const qualityEmbargo = input.assessQualityEmbargo({
    selectedByView: input.selectedByView,
    rigStability,
    targetStyle: input.manifest.qualityProfile?.targetStyle,
    acceptedScoreThreshold,
    autoReroute: input.manifest.autoReroute,
    speciesId: input.manifest.species
  });
  const packDefectSummary = input.buildPackDefectSummary({
    selectedByView: input.selectedByView,
    workflowStages: input.manifest.workflowStages,
    speciesId: input.manifest.species
  });
  const finalQualityFirewall = input.assessFinalQualityFirewall({
    selectedByView: input.selectedByView,
    targetStyle: input.manifest.qualityProfile?.targetStyle,
    acceptedScoreThreshold,
    autoReroute: input.manifest.autoReroute,
    packCoherence,
    rigStability,
    selectionRisk,
    qualityEmbargo,
    packDefectSummary,
    speciesId: input.manifest.species
  });
  const selectionRiskSummary = summarizeSelectionRisk(selectionRisk);
  const qualityEmbargoSummary = summarizeQualityEmbargo(qualityEmbargo);
  const finalQualityFirewallSummary = summarizeFinalQualityFirewall(finalQualityFirewall);
  const requiresSelectionReview =
    rigStability.severity === "block" ||
    packCoherence.severity === "block" ||
    qualityEmbargo.level === "block" ||
    finalQualityFirewall.level === "block" ||
    (input.source === "auto" &&
      (rigStability.reviewOnly ||
        selectionRisk.level !== "none" ||
        qualityEmbargo.level === "review" ||
        finalQualityFirewall.level === "review"));
  const decisionOutcome = buildSelectionDecisionOutcome({
    kind: input.source === "hitl" ? "hitl_selected" : requiresSelectionReview ? "hitl_review" : "auto_selected",
    sourceStage:
      (Array.isArray(input.manifest.workflowStages) && input.manifest.workflowStages.length > 0
        ? input.manifest.workflowStages.at(-1)?.stage
        : undefined) ?? input.manifest.providerMeta?.workflowStage,
    missingGeneratedViews: [],
    lowQualityGeneratedViews: [],
    packCoherence,
    autoReroute: input.manifest.autoReroute as never,
    worstRuntimeBucket: input.resolveSelectionWorstRuntimeBucket({
      selectedByView: input.selectedByView,
      targetStyle: input.manifest.qualityProfile?.targetStyle
    }),
    rigStability: rigStability as never,
    selectionRisk: selectionRisk as never,
    qualityEmbargo: qualityEmbargo as never,
    finalQualityFirewall: finalQualityFirewall as never
  });

  input.manifest.packCoherence = packCoherence;
  input.manifest.providerMeta = {
    ...(input.manifest.providerMeta ?? {}),
    selectionDiagnostics: buildPersistedSelectionDiagnostics({
      existingSelectionDiagnostics:
        input.manifest.providerMeta?.selectionDiagnostics ?? undefined,
      source: input.source,
      attemptedSelectionSummary,
      packCoherence,
      rigStability,
      selectionRisk,
      qualityEmbargo,
      packDefectSummary,
      finalQualityFirewall,
      decisionOutcome
    })
  };
  input.manifest.selectedByView = buildManifestSelectedByView(input.selectedByView as never);

  return {
    manifest: input.manifest,
    acceptedScoreThreshold,
    packCoherence,
    attemptedSelectionSummary,
    rigStability,
    selectionRisk,
    qualityEmbargo,
    packDefectSummary,
    finalQualityFirewall,
    selectionRiskSummary,
    qualityEmbargoSummary,
    finalQualityFirewallSummary,
    requiresSelectionReview
  };
}

export async function handleSelectionReviewGate<TManifest extends ManifestLike>(input: {
  prismaCreateReviewSuggestion: (summary: string, payload: unknown) => Promise<void>;
  updateSessionReady?: (statusMessage: string) => Promise<void>;
  manifest: TManifest;
  source: "auto" | "hitl";
  manifestPath: string;
  withManifestHashes: (manifest: TManifest) => TManifest & { inputHash: string; manifestHash: string };
  providerName: string;
  jobDbId: string;
  buildJobDbId?: string;
  previewJobDbId?: string;
  helpers: {
    logJob: (jobId: string, level: string, message: string, details?: unknown) => Promise<void>;
    setJobStatus: (
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
  };
  rigStability: SummarySeverityLike;
  packCoherence: PackCoherenceLike;
  selectionRisk: SummaryLevelLike;
  selectionRiskSummary: string;
  qualityEmbargo: SummaryLevelLike;
  qualityEmbargoSummary: string;
  packDefectSummary: unknown;
  finalQualityFirewall: SummaryLevelLike;
  finalQualityFirewallSummary: string;
  attemptedSelectionSummary: unknown;
}): Promise<void> {
  const { continueBlockedSelectionBuild, blockedMessage } = await handleBlockedSelectionReview({
    manifest: input.manifest,
    source: input.source,
    manifestPath: input.manifestPath,
    withManifestHashes: input.withManifestHashes,
    providerName: input.providerName,
    jobDbId: input.jobDbId,
    buildJobDbId: input.buildJobDbId,
    previewJobDbId: input.previewJobDbId,
    helpers: input.helpers,
    rigStability: input.rigStability,
    packCoherence: input.packCoherence,
    selectionRisk: input.selectionRisk,
    selectionRiskSummary: input.selectionRiskSummary,
    qualityEmbargo: input.qualityEmbargo,
    qualityEmbargoSummary: input.qualityEmbargoSummary,
    packDefectSummary: input.packDefectSummary,
    finalQualityFirewall: input.finalQualityFirewall,
    finalQualityFirewallSummary: input.finalQualityFirewallSummary,
    attemptedSelectionSummary: input.attemptedSelectionSummary,
    flattenContinuityFields: toFlatContinuityFields,
    createReviewSuggestion: async ({ summary, payload }) => {
      await input.prismaCreateReviewSuggestion(summary, payload);
    },
    updateSessionReady: input.updateSessionReady
  });

  if (!continueBlockedSelectionBuild) {
    throw new Error(blockedMessage);
  }
}
