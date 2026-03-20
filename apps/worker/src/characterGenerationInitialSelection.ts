import fs from "node:fs";
import type { CharacterView } from "@ec/image-gen";
import type { CharacterGenerationView } from "@ec/shared";
import type { ManifestContinuity } from "./characterGenerationManifestState";
import {
  formatContinuityDescriptor,
  formatContinuityQueueStats,
  toFlatContinuityFields
} from "./characterGenerationManifestState";
import { buildHitlSessionStatusMessage } from "./characterGenerationSelectionMessaging";
import {
  summarizeFinalQualityFirewall,
  summarizeQualityEmbargo,
  summarizeSelectionRisk
} from "./characterGenerationSelectionDecision";

type SummarySeverityLike = {
  severity?: string;
  summary?: string;
  reviewOnly?: boolean;
};

type SummaryLevelLike = {
  level?: string;
  reasonCodes: string[];
  suggestedAction?: "pick-manually" | "recreate";
};

type PackCoherenceLike = {
  severity: string;
  score: number;
  issues: string[];
};

type WorkflowStageRunLike = {
  stage?: string;
} & Record<string, unknown>;

type ProviderMetaLike = {
  workflowStage?: string;
  workflowTemplateVersion?: string;
  selectionDiagnostics?: Record<string, unknown>;
  [key: string]: unknown;
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

export function buildInitialSelectionDiagnostics(input: {
  existingSelectionDiagnostics?: Record<string, unknown>;
  workflowStages: WorkflowStageRunLike[];
  coherenceIssues: string[];
  packCoherence?: unknown;
  rigStability?: unknown;
  selectionRisk?: unknown;
  qualityEmbargo?: unknown;
  packDefectSummary?: unknown;
  finalQualityFirewall?: unknown;
  selectedCandidateSummaryByView?: unknown;
  referenceBankDiagnostics?: unknown;
  referenceBankReviewPlan?: unknown;
  referenceBankReviewChecklist?: unknown;
  decisionOutcome?: unknown;
  autoReroute?: unknown;
}): Record<string, unknown> {
  return {
    ...(input.existingSelectionDiagnostics ?? {}),
    workflowStages: input.workflowStages,
    coherenceIssues: input.coherenceIssues,
    ...(input.packCoherence ? { packCoherence: input.packCoherence } : {}),
    ...(input.rigStability ? { rigStability: input.rigStability } : {}),
    ...(input.selectionRisk ? { selectionRisk: input.selectionRisk } : {}),
    ...(input.qualityEmbargo ? { qualityEmbargo: input.qualityEmbargo } : {}),
    ...(input.packDefectSummary ? { packDefectSummary: input.packDefectSummary } : {}),
    ...(input.finalQualityFirewall ? { finalQualityFirewall: input.finalQualityFirewall } : {}),
    ...(input.selectedCandidateSummaryByView
      ? { selectedCandidateSummaryByView: input.selectedCandidateSummaryByView }
      : {}),
    referenceBankDiagnostics: input.referenceBankDiagnostics,
    referenceBankReviewPlan: input.referenceBankReviewPlan,
    referenceBankReviewChecklist: input.referenceBankReviewChecklist,
    decisionOutcome: input.decisionOutcome,
    ...(input.autoReroute ? { autoReroute: input.autoReroute } : {})
  };
}

export function buildInitialProviderMeta(input: {
  providerRunMeta?: ProviderMetaLike;
  workflowStages: WorkflowStageRunLike[];
  workflowTemplateVersion: string;
  selectionDiagnostics: Record<string, unknown>;
}): ProviderMetaLike {
  if (input.providerRunMeta) {
    return {
      ...input.providerRunMeta,
      selectionDiagnostics: input.selectionDiagnostics
    };
  }

  if (input.workflowStages.length > 0) {
    return {
      workflowStage: input.workflowStages.at(-1)?.stage,
      workflowTemplateVersion: input.workflowTemplateVersion,
      selectionDiagnostics: input.selectionDiagnostics
    };
  }

  return {
    selectionDiagnostics: input.selectionDiagnostics
  };
}

export async function handleHitlRequiredSelection<
  TManifest extends {
    inputHash: string;
    manifestHash: string;
    reference: { continuity?: ManifestContinuity };
  }
>(input: {
  manifest: TManifest;
  manifestPath: string;
  providerName: string;
  providerWarning?: string | null;
  scoredCandidateCount: number;
  acceptedScoreThreshold: number;
  missingGeneratedViews: CharacterView[];
  lowQualityGeneratedViews: CharacterView[];
  coherenceIssues: string[];
  packCoherence?: PackCoherenceLike;
  rigStability?: SummarySeverityLike;
  selectionRisk?: SummaryLevelLike;
  qualityEmbargo?: SummaryLevelLike;
  finalQualityFirewall?: SummaryLevelLike;
  autoReroute?: Record<string, unknown>;
  viewToGenerate?: CharacterGenerationView | null;
  mode: string;
  promptPresetId: string;
  sessionId: string;
  episodeId: string;
  jobDbId: string;
  buildJobDbId?: string | null;
  previewJobDbId?: string | null;
  limits: {
    maxCandidatesPerView: number;
    maxTotalImages: number;
    maxRetries: number;
  };
  budget: unknown;
  writeGenerationProgress: (progress: number, stage: string, details?: Record<string, unknown>) => Promise<void>;
  createAgentSuggestion: (input: { title: string; summary: string; payload: unknown }) => Promise<void>;
  setJobStatus: SetJobStatus;
  logJob: JobLogger;
  updateSessionReady?: (statusMessage: string) => Promise<void>;
}): Promise<void> {
  const missingText =
    input.missingGeneratedViews.length > 0 ? ` Missing views: ${input.missingGeneratedViews.join(", ")}.` : "";
  const lowQualityText =
    input.lowQualityGeneratedViews.length > 0
      ? ` Low-quality views: ${input.lowQualityGeneratedViews.join(", ")} (threshold=${input.acceptedScoreThreshold.toFixed(
          2
        )}).`
      : "";
  const coherenceText =
    input.coherenceIssues.length > 0
      ? ` Pack coherence issues: ${input.coherenceIssues.join(", ")}${
          input.packCoherence
            ? ` (severity=${input.packCoherence.severity}, score=${input.packCoherence.score.toFixed(2)})`
            : ""
        }.`
      : "";
  const rigStabilityText =
    input.rigStability?.severity && input.rigStability.severity !== "none"
      ? ` Rig stability: ${input.rigStability.summary}.`
      : "";
  const continuityDescriptor = formatContinuityDescriptor(input.manifest.reference.continuity);
  const continuityQueueStats = formatContinuityQueueStats(input.manifest.reference.continuity);
  const continuityText = continuityDescriptor
    ? ` Continuity: ${continuityDescriptor}${input.manifest.reference.continuity?.applied ? " (applied)." : "."}`
    : "";
  const continuityQueueText = continuityQueueStats ? ` Queue: ${continuityQueueStats}.` : "";

  await input.createAgentSuggestion({
    title: input.viewToGenerate
      ? `Regenerate ${input.viewToGenerate} candidates`
      : "Choose best character view candidates",
    summary: input.viewToGenerate
      ? `View-only regenerate completed for ${input.viewToGenerate}. Pick candidates to continue.${continuityText}${continuityQueueText}`
      : `Auto-pick disabled or partial provider failure.${missingText}${lowQualityText}${coherenceText}${rigStabilityText}${continuityText}${continuityQueueText} Select one candidate per view from generation manifest.`,
    payload: {
      manifestPath: input.manifestPath,
      provider: input.providerName,
      providerWarning: input.providerWarning,
      mode: input.mode,
      promptPreset: input.promptPresetId,
      sessionId: input.sessionId,
      viewToGenerate: input.viewToGenerate ?? null,
      ...(input.packCoherence ? { packCoherence: input.packCoherence } : {}),
      ...(input.rigStability ? { rigStability: input.rigStability } : {}),
      ...(input.autoReroute ? { autoReroute: input.autoReroute } : {}),
      ...toFlatContinuityFields(input.manifest.reference.continuity)
    }
  });

  const cancelAwaitingHitlPick = async (jobId?: string | null) => {
    if (!jobId) {
      return;
    }
    await input.setJobStatus(jobId, "CANCELLED", { finishedAt: new Date() });
    await input.logJob(jobId, "warn", "Cancelled awaiting HITL pick", {
      source: "worker:generate-character-assets",
      manifestPath: input.manifestPath
    });
  };

  await cancelAwaitingHitlPick(input.buildJobDbId);
  await cancelAwaitingHitlPick(input.previewJobDbId);

  fs.writeFileSync(input.manifestPath, `${JSON.stringify(input.manifest, null, 2)}\n`, "utf8");
  await input.writeGenerationProgress(97, "manifest_written_hitl", {
    manifestPath: input.manifestPath,
    requiresHitl: true,
    provider: input.providerName
  });

  if (input.updateSessionReady) {
    await input.updateSessionReady(
      buildHitlSessionStatusMessage({
        viewToGenerate: input.viewToGenerate ?? undefined,
        missingGeneratedViews: input.missingGeneratedViews,
        lowQualityGeneratedViews: input.lowQualityGeneratedViews,
        coherenceIssues: input.coherenceIssues,
        packCoherence: input.packCoherence,
        autoReroute: input.autoReroute,
        rigStability: input.rigStability,
        selectionRiskLevel: input.selectionRisk?.level,
        selectionRiskSummary: input.selectionRisk ? summarizeSelectionRisk(input.selectionRisk) : undefined,
        qualityEmbargoLevel: input.qualityEmbargo?.level,
        qualityEmbargoSummary: input.qualityEmbargo ? summarizeQualityEmbargo(input.qualityEmbargo) : undefined,
        finalQualityFirewallLevel: input.finalQualityFirewall?.level,
        finalQualityFirewallSummary: input.finalQualityFirewall
          ? summarizeFinalQualityFirewall(input.finalQualityFirewall)
          : undefined,
        continuity: input.manifest.reference.continuity
      })
    );
  }

  await input.logJob(input.jobDbId, "info", "Character generation completed (HITL required)", {
    manifestPath: input.manifestPath,
    provider: input.providerName,
    providerWarning: input.providerWarning,
    candidateCount: input.scoredCandidateCount,
    inputHash: input.manifest.inputHash,
    manifestHash: input.manifest.manifestHash,
    ...toFlatContinuityFields(input.manifest.reference.continuity),
    sessionId: input.sessionId,
    viewToGenerate: input.viewToGenerate ?? null,
    lowQualityViews: input.lowQualityGeneratedViews,
    coherenceIssues: input.coherenceIssues,
    ...(input.autoReroute ? { autoReroute: input.autoReroute } : {}),
    qualityThreshold: input.acceptedScoreThreshold,
    limits: input.limits,
    budget: input.budget
  });
}
