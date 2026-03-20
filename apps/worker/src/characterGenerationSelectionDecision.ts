import type { CharacterView } from "@ec/image-gen";

type CandidateRuntimeBucketLevel = "clean" | "warn" | "degraded" | "compound" | "block";

type SelectionDecisionOutcome = {
  kind: "auto_selected" | "hitl_review" | "hitl_selected";
  status: "ok" | "review" | "blocked";
  sourceStage?: string;
  summary: string;
  reasonCodes: string[];
  recoveryAttempted: boolean;
  recoveredViews?: CharacterView[];
  escalatedAction?: "pick-manually" | "recreate";
  worstRuntimeBucket?: CandidateRuntimeBucketLevel;
};

type CoherenceLike = {
  severity: string;
  issues: string[];
};

type AutoRerouteViewDeltaLike = {
  scoreDelta?: number | null;
  warningDelta?: number | null;
  rejectionDelta?: number | null;
  consistencyDelta?: number | null;
  beforeCandidateId?: string;
  afterCandidateId?: string;
};

type AutoRerouteLike = {
  attempted?: boolean;
  recovered?: boolean;
  viewDeltaByView?: Partial<Record<CharacterView, AutoRerouteViewDeltaLike>>;
};

type RigStabilityLike = {
  severity?: string;
  summary?: string;
  reviewOnly?: boolean;
  reasonCodes: string[];
  fallbackReasonCodes: string[];
  reasonFamilies?: string[];
  repairability?: string;
  suggestedAction?: "pick-manually" | "recreate";
};

type SummaryAssessmentLike = {
  level?: string;
  reasonCodes: string[];
  suggestedAction?: "pick-manually" | "recreate";
};

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function summarizeSelectionRisk(assessment: SummaryAssessmentLike): string {
  if (assessment.level === "none" || assessment.reasonCodes.length === 0) {
    return "selection risk clear";
  }
  return `${assessment.level}:${assessment.reasonCodes.join(",")}`;
}

export function summarizeQualityEmbargo(assessment: SummaryAssessmentLike): string {
  if (assessment.level === "none" || assessment.reasonCodes.length === 0) {
    return "quality embargo clear";
  }
  return `${assessment.level}:${assessment.reasonCodes.join(",")}`;
}

export function summarizeFinalQualityFirewall(assessment: SummaryAssessmentLike): string {
  if (assessment.level === "none" || assessment.reasonCodes.length === 0) {
    return "final quality firewall clear";
  }
  return `${assessment.level}:${assessment.reasonCodes.join(",")}`;
}

function deriveRecoveredViews(autoReroute: AutoRerouteLike | undefined): CharacterView[] {
  if (!autoReroute?.viewDeltaByView) {
    return [];
  }
  return (Object.entries(autoReroute.viewDeltaByView) as Array<[CharacterView, AutoRerouteViewDeltaLike]>)
    .filter(([, delta]) => {
      if (typeof delta.scoreDelta === "number" && delta.scoreDelta > 0.015) {
        return true;
      }
      if (typeof delta.warningDelta === "number" && delta.warningDelta < 0) {
        return true;
      }
      if (typeof delta.rejectionDelta === "number" && delta.rejectionDelta < 0) {
        return true;
      }
      if (typeof delta.consistencyDelta === "number" && delta.consistencyDelta > 0.02) {
        return true;
      }
      return Boolean(delta.beforeCandidateId && delta.afterCandidateId && delta.beforeCandidateId !== delta.afterCandidateId);
    })
    .map(([view]) => view);
}

export function buildSelectionDecisionOutcome(input: {
  kind: SelectionDecisionOutcome["kind"];
  sourceStage: string | undefined;
  missingGeneratedViews: CharacterView[];
  lowQualityGeneratedViews: CharacterView[];
  packCoherence: CoherenceLike | undefined;
  autoReroute: AutoRerouteLike | undefined;
  rigStability?: RigStabilityLike;
  selectionRisk?: SummaryAssessmentLike;
  qualityEmbargo?: SummaryAssessmentLike;
  finalQualityFirewall?: SummaryAssessmentLike;
  referenceBankReviewOnly?: boolean;
  referenceBankHandoff?: string;
  worstRuntimeBucket?: CandidateRuntimeBucketLevel;
}): SelectionDecisionOutcome {
  const reasonCodes: string[] = [];
  if (input.missingGeneratedViews.length > 0) {
    reasonCodes.push(...input.missingGeneratedViews.map((view) => `missing:${view}`));
  }
  if (input.lowQualityGeneratedViews.length > 0) {
    reasonCodes.push(...input.lowQualityGeneratedViews.map((view) => `low-quality:${view}`));
  }
  if (input.packCoherence?.severity === "block") {
    reasonCodes.push("coherence:block");
  } else if (input.packCoherence?.severity === "review") {
    reasonCodes.push("coherence:review");
  }
  if (input.selectionRisk?.level && input.selectionRisk.level !== "none") {
    reasonCodes.push(`selection-risk:${input.selectionRisk.level}`);
    reasonCodes.push(...input.selectionRisk.reasonCodes.map((reason) => `risk:${reason}`));
  }
  if (input.rigStability?.severity && input.rigStability.severity !== "none") {
    reasonCodes.push(`rig-stability:${input.rigStability.severity}`);
    reasonCodes.push(...input.rigStability.reasonCodes.map((reason) => `rig:${reason}`));
    reasonCodes.push(...input.rigStability.fallbackReasonCodes.map((reason) => `rig-fallback:${reason}`));
    reasonCodes.push(...(input.rigStability.reasonFamilies ?? []).map((family) => `rig-family:${family}`));
    if (input.rigStability.repairability && input.rigStability.repairability !== "none") {
      reasonCodes.push(`rig-repairability:${input.rigStability.repairability}`);
    }
  }
  if (input.qualityEmbargo?.level && input.qualityEmbargo.level !== "none") {
    reasonCodes.push(`quality-embargo:${input.qualityEmbargo.level}`);
    reasonCodes.push(...input.qualityEmbargo.reasonCodes.map((reason) => `embargo:${reason}`));
  }
  if (input.finalQualityFirewall?.level && input.finalQualityFirewall.level !== "none") {
    reasonCodes.push(`final-firewall:${input.finalQualityFirewall.level}`);
    reasonCodes.push(...input.finalQualityFirewall.reasonCodes.map((reason) => `firewall:${reason}`));
  }
  if (input.autoReroute?.attempted) {
    reasonCodes.push(`auto-reroute:${input.autoReroute.recovered ? "recovered" : "failed"}`);
  }
  if (input.referenceBankReviewOnly) {
    reasonCodes.push("reference-bank:review-only");
    if (input.referenceBankHandoff) {
      reasonCodes.push(`reference-bank-handoff:${input.referenceBankHandoff}`);
    }
  }

  const blocked =
    input.rigStability?.severity === "block" ||
    input.packCoherence?.severity === "block" ||
    input.selectionRisk?.level === "block" ||
    input.qualityEmbargo?.level === "block" ||
    input.finalQualityFirewall?.level === "block";
  const review =
    blocked ||
    input.referenceBankReviewOnly === true ||
    input.rigStability?.reviewOnly === true ||
    input.missingGeneratedViews.length > 0 ||
    input.lowQualityGeneratedViews.length > 0 ||
    input.packCoherence?.severity === "review" ||
    input.selectionRisk?.level === "review" ||
    input.qualityEmbargo?.level === "review" ||
    input.finalQualityFirewall?.level === "review";
  const status: SelectionDecisionOutcome["status"] = blocked ? "blocked" : review ? "review" : "ok";
  const recoveredViews = deriveRecoveredViews(input.autoReroute);

  let summary = "pack auto-selected";
  if (input.kind === "hitl_selected") {
    summary = "pack accepted after manual selection";
  } else if (blocked) {
    summary =
      input.finalQualityFirewall?.level === "block"
        ? `blocked by final quality firewall: ${summarizeFinalQualityFirewall(input.finalQualityFirewall)}`
        : input.qualityEmbargo?.level === "block"
          ? `blocked by quality embargo: ${summarizeQualityEmbargo(input.qualityEmbargo)}`
          : input.rigStability?.severity === "block"
            ? `blocked by rig stability: ${input.rigStability.summary}`
            : input.selectionRisk?.level === "block"
              ? `blocked by selection risk: ${summarizeSelectionRisk(input.selectionRisk)}`
              : `blocked by pack coherence: ${input.packCoherence?.issues.join(", ") || "unknown"}`;
  } else if (review) {
    summary =
      input.referenceBankReviewOnly
        ? "manual review required: mascot reference bank is scaffold-only"
        : input.rigStability?.reviewOnly
          ? `manual review required: ${input.rigStability.summary}`
          : input.finalQualityFirewall?.level === "review"
            ? `manual review required: ${summarizeFinalQualityFirewall(input.finalQualityFirewall)}`
            : input.qualityEmbargo?.level === "review"
              ? `manual review required: ${summarizeQualityEmbargo(input.qualityEmbargo)}`
              : input.selectionRisk?.level === "review"
                ? `manual review required: ${summarizeSelectionRisk(input.selectionRisk)}`
                : input.packCoherence?.severity === "review"
                  ? `manual review required: ${input.packCoherence.issues.join(", ") || "review"}`
                  : "manual review required";
  }

  return {
    kind: input.kind,
    status,
    ...(input.sourceStage ? { sourceStage: input.sourceStage } : {}),
    summary,
    reasonCodes: dedupeStrings(reasonCodes),
    recoveryAttempted: input.autoReroute?.attempted === true,
    ...(recoveredViews.length > 0 ? { recoveredViews } : {}),
    ...(input.worstRuntimeBucket ? { worstRuntimeBucket: input.worstRuntimeBucket } : {}),
    ...(input.finalQualityFirewall?.suggestedAction
      ? { escalatedAction: input.finalQualityFirewall.suggestedAction }
      : input.qualityEmbargo?.suggestedAction
        ? { escalatedAction: input.qualityEmbargo.suggestedAction }
        : input.rigStability?.suggestedAction
          ? { escalatedAction: input.rigStability.suggestedAction }
          : input.selectionRisk?.suggestedAction
            ? { escalatedAction: input.selectionRisk.suggestedAction }
            : {})
  };
}
