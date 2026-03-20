import fs from "node:fs";
import type { CharacterView } from "@ec/image-gen";
import type { ManifestContinuity } from "./characterGenerationManifestState";
import {
  shouldContinueBlockedSelectionBuild,
  shouldRetainSelectedByViewOnSelectionBlock
} from "./characterGenerationManifestState";
import {
  buildHitlSessionStatusMessage,
  buildSelectionGateBlockedMessage,
  buildSelectionGateReviewSummary
} from "./characterGenerationSelectionMessaging";

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

type SummarySeverityLike = {
  severity?: string;
  summary?: string;
  reviewOnly?: boolean;
};

type SummaryLevelLike = {
  level?: string;
};

type CoherenceLike = {
  severity: string;
  score: number;
  issues: string[];
};

export function buildPersistedSelectionDiagnostics(input: {
  existingSelectionDiagnostics?: Record<string, unknown>;
  source: "auto" | "hitl";
  attemptedSelectionSummary: unknown;
  packCoherence: unknown;
  rigStability: unknown;
  selectionRisk: unknown;
  qualityEmbargo: unknown;
  packDefectSummary: unknown;
  finalQualityFirewall: unknown;
  decisionOutcome: unknown;
}): Record<string, unknown> {
  return {
    ...(input.existingSelectionDiagnostics ?? {}),
    finalSelectionSource: input.source,
    selectedCandidateSummaryByView: input.attemptedSelectionSummary,
    packCoherence: input.packCoherence,
    rigStability: input.rigStability,
    selectionRisk: input.selectionRisk,
    qualityEmbargo: input.qualityEmbargo,
    packDefectSummary: input.packDefectSummary,
    finalQualityFirewall: input.finalQualityFirewall,
    decisionOutcome: input.decisionOutcome
  };
}

export async function handleBlockedSelectionReview<
  TManifest extends {
    status: string;
    selectedByView: unknown;
    reference: { continuity?: ManifestContinuity };
  }
>(input: {
  manifest: TManifest;
  source: "auto" | "hitl";
  manifestPath: string;
  withManifestHashes: (manifest: TManifest) => TManifest & { inputHash: string; manifestHash: string };
  providerName: string;
  jobDbId: string;
  buildJobDbId?: string;
  previewJobDbId?: string;
  helpers: {
    logJob: JobLogger;
    setJobStatus: SetJobStatus;
  };
  rigStability: SummarySeverityLike;
  packCoherence: CoherenceLike;
  selectionRisk: SummaryLevelLike;
  selectionRiskSummary: string;
  qualityEmbargo: SummaryLevelLike;
  qualityEmbargoSummary: string;
  packDefectSummary: unknown;
  finalQualityFirewall: SummaryLevelLike;
  finalQualityFirewallSummary: string;
  attemptedSelectionSummary: unknown;
  flattenContinuityFields: (continuity: ManifestContinuity | undefined) => Record<string, unknown>;
  createReviewSuggestion: (input: { summary: string; payload: unknown }) => Promise<void>;
  updateSessionReady?: (statusMessage: string) => Promise<void>;
}): Promise<{
  continueBlockedSelectionBuild: boolean;
  blockedMessage: string;
  blockedManifest: TManifest & { inputHash: string; manifestHash: string };
}> {
  const continueBlockedSelectionBuild = shouldContinueBlockedSelectionBuild(input.source);
  input.manifest.status = continueBlockedSelectionBuild ? "HITL_SELECTED" : "PENDING_HITL";
  if (!shouldRetainSelectedByViewOnSelectionBlock(input.source)) {
    input.manifest.selectedByView = {};
  }

  const blockedManifest = input.withManifestHashes(input.manifest);
  fs.writeFileSync(input.manifestPath, `${JSON.stringify(blockedManifest, null, 2)}\n`, "utf8");

  const blockedMessage = buildSelectionGateBlockedMessage({
    source: input.source,
    rigStability: input.rigStability,
    packCoherence: input.packCoherence,
    selectionRisk: input.selectionRisk,
    selectionRiskSummary: input.selectionRiskSummary,
    qualityEmbargo: input.qualityEmbargo,
    qualityEmbargoSummary: input.qualityEmbargoSummary,
    finalQualityFirewall: input.finalQualityFirewall,
    finalQualityFirewallSummary: input.finalQualityFirewallSummary
  });

  await input.helpers.logJob(input.jobDbId, "warn", "Selected candidate pack blocked by selection gate", {
    source: input.source,
    provider: input.providerName,
    manifestPath: input.manifestPath,
    continueBlockedSelectionBuild,
    rigStability: input.rigStability,
    packCoherence: input.packCoherence,
    selectionRisk: input.selectionRisk,
    qualityEmbargo: input.qualityEmbargo,
    packDefectSummary: input.packDefectSummary,
    finalQualityFirewall: input.finalQualityFirewall,
    selectedCandidateSummaryByView: input.attemptedSelectionSummary
  });

  if (!continueBlockedSelectionBuild && input.buildJobDbId) {
    await input.helpers.setJobStatus(input.buildJobDbId, "CANCELLED", {
      lastError: blockedMessage,
      finishedAt: new Date()
    });
    await input.helpers.logJob(input.buildJobDbId, "warn", "Cancelled after selection gate blocked selected pack", {
      source: `worker:generate-character-assets:${input.source}`,
      manifestPath: input.manifestPath,
      rigStability: input.rigStability,
      packCoherence: input.packCoherence,
      selectionRisk: input.selectionRisk,
      qualityEmbargo: input.qualityEmbargo,
      finalQualityFirewall: input.finalQualityFirewall
    });
  }

  if (!continueBlockedSelectionBuild && input.previewJobDbId) {
    await input.helpers.setJobStatus(input.previewJobDbId, "CANCELLED", {
      lastError: blockedMessage,
      finishedAt: new Date()
    });
    await input.helpers.logJob(input.previewJobDbId, "warn", "Cancelled after selection gate blocked selected pack", {
      source: `worker:generate-character-assets:${input.source}`,
      manifestPath: input.manifestPath,
      packCoherence: input.packCoherence,
      selectionRisk: input.selectionRisk,
      qualityEmbargo: input.qualityEmbargo
    });
  }

  await input.createReviewSuggestion({
    summary: buildSelectionGateReviewSummary({
      rigStability: input.rigStability,
      packCoherence: input.packCoherence,
      selectionRiskSummary: input.selectionRiskSummary,
      qualityEmbargo: input.qualityEmbargo,
      qualityEmbargoSummary: input.qualityEmbargoSummary,
      finalQualityFirewall: input.finalQualityFirewall,
      finalQualityFirewallSummary: input.finalQualityFirewallSummary
    }),
    payload: {
      manifestPath: input.manifestPath,
      provider: input.providerName,
      source: input.source,
      rigStability: input.rigStability,
      packCoherence: input.packCoherence,
      selectionRisk: input.selectionRisk,
      qualityEmbargo: input.qualityEmbargo,
      packDefectSummary: input.packDefectSummary,
      finalQualityFirewall: input.finalQualityFirewall,
      selectedCandidateSummaryByView: input.attemptedSelectionSummary,
      ...input.flattenContinuityFields(blockedManifest.reference.continuity)
    }
  });

  if (!continueBlockedSelectionBuild && input.updateSessionReady) {
    await input.updateSessionReady(
      buildHitlSessionStatusMessage({
        viewToGenerate: undefined,
        missingGeneratedViews: [],
        lowQualityGeneratedViews: [],
        coherenceIssues: input.packCoherence.issues,
        packCoherence: input.packCoherence,
        rigStability: input.rigStability,
        selectionRiskLevel: input.selectionRisk.level,
        selectionRiskSummary: input.selectionRiskSummary,
        qualityEmbargoLevel: input.qualityEmbargo.level,
        qualityEmbargoSummary: input.qualityEmbargoSummary,
        finalQualityFirewallLevel: input.finalQualityFirewall.level,
        finalQualityFirewallSummary: input.finalQualityFirewallSummary,
        continuity: blockedManifest.reference.continuity
      })
    );
  }

  if (continueBlockedSelectionBuild) {
    await input.helpers.logJob(input.jobDbId, "info", "Continuing blocked HITL-selected rebuild for evidence generation", {
      source: input.source,
      manifestPath: input.manifestPath,
      rigStability: input.rigStability,
      packCoherence: input.packCoherence,
      selectionRisk: input.selectionRisk,
      qualityEmbargo: input.qualityEmbargo,
      packDefectSummary: input.packDefectSummary,
      finalQualityFirewall: input.finalQualityFirewall
    });
  }

  return {
    continueBlockedSelectionBuild,
    blockedMessage,
    blockedManifest
  };
}
