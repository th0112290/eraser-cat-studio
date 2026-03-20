import type { CharacterView } from "@ec/image-gen";
import type { CharacterGenerationView } from "@ec/shared";
import { formatContinuityDescriptor, formatContinuityQueueStats, formatContinuitySentence, type ManifestContinuity } from "./characterGenerationManifestState";

type CoherenceLike = {
  severity: string;
  score: number;
  issues: string[];
};

type AutoRerouteLike = {
  attempted?: boolean;
  recovered?: boolean;
};

type SummaryLevelLike = {
  level?: string;
};

type SummarySeverityLike = {
  severity?: string;
  summary?: string;
  reviewOnly?: boolean;
};

export function buildHitlSessionStatusMessage(input: {
  viewToGenerate: CharacterGenerationView | undefined;
  missingGeneratedViews: CharacterView[];
  lowQualityGeneratedViews: CharacterView[];
  coherenceIssues?: string[];
  packCoherence?: CoherenceLike;
  autoReroute?: AutoRerouteLike;
  rigStability?: SummarySeverityLike;
  selectionRiskLevel?: string | null;
  selectionRiskSummary?: string | null;
  qualityEmbargoLevel?: string | null;
  qualityEmbargoSummary?: string | null;
  finalQualityFirewallLevel?: string | null;
  finalQualityFirewallSummary?: string | null;
  continuity: ManifestContinuity | undefined;
}): string {
  const continuitySentence = formatContinuitySentence(input.continuity);
  const continuityDescriptor = formatContinuityDescriptor(input.continuity);
  const continuityQueueStats = formatContinuityQueueStats(input.continuity);
  const continuityQueueStatusSuffix = continuityQueueStats ? ` Queue: ${continuityQueueStats}.` : "";
  const continuityQueuePipeSuffix = continuityQueueStats ? ` | ${continuityQueueStats}` : "";
  const continuityDescriptorPipeSuffix = continuityDescriptor ? ` | ${continuityDescriptor}` : "";
  const autoRerouteSentence = input.autoReroute?.attempted
    ? input.autoReroute.recovered
      ? " Auto-reroute recovered the pack once before review."
      : " Auto-reroute already ran and still needs review."
    : "";
  const selectionRiskSentence =
    input.selectionRiskLevel && input.selectionRiskLevel !== "none" && input.selectionRiskSummary
      ? ` Selection risk=${input.selectionRiskSummary}.`
      : "";
  const rigStabilitySentence =
    input.rigStability && input.rigStability.severity && input.rigStability.severity !== "none" && input.rigStability.summary
      ? ` Rig stability=${input.rigStability.summary}.`
      : "";
  const qualityEmbargoSentence =
    input.qualityEmbargoLevel && input.qualityEmbargoLevel !== "none" && input.qualityEmbargoSummary
      ? ` Quality embargo=${input.qualityEmbargoSummary}.`
      : "";
  const finalQualityFirewallSentence =
    input.finalQualityFirewallLevel && input.finalQualityFirewallLevel !== "none" && input.finalQualityFirewallSummary
      ? ` Final quality firewall=${input.finalQualityFirewallSummary}.`
      : "";

  if (input.viewToGenerate) {
    return `Candidates ready for view ${input.viewToGenerate}. Pick to continue.${autoRerouteSentence}${rigStabilitySentence}${selectionRiskSentence}${qualityEmbargoSentence}${finalQualityFirewallSentence}${continuitySentence}${continuityQueueStatusSuffix}`;
  }
  if (input.missingGeneratedViews.length > 0) {
    return `Partial generation complete. Missing: ${input.missingGeneratedViews.join(", ")}${autoRerouteSentence}${rigStabilitySentence}${selectionRiskSentence}${qualityEmbargoSentence}${finalQualityFirewallSentence}${continuityDescriptorPipeSuffix}${continuityQueuePipeSuffix}`;
  }
  if (input.lowQualityGeneratedViews.length > 0) {
    return `Candidates generated but quality below threshold for: ${input.lowQualityGeneratedViews.join(", ")}${autoRerouteSentence}${rigStabilitySentence}${selectionRiskSentence}${qualityEmbargoSentence}${finalQualityFirewallSentence}${continuityDescriptorPipeSuffix}${continuityQueuePipeSuffix}`;
  }
  if (Array.isArray(input.coherenceIssues) && input.coherenceIssues.length > 0) {
    const packSummary = input.packCoherence
      ? ` severity=${input.packCoherence.severity} score=${input.packCoherence.score.toFixed(2)}`
      : "";
    return `Candidates generated but pack coherence needs review:${packSummary} ${input.coherenceIssues.join(", ")}${autoRerouteSentence}${rigStabilitySentence}${selectionRiskSentence}${qualityEmbargoSentence}${finalQualityFirewallSentence}${continuityDescriptorPipeSuffix}${continuityQueuePipeSuffix}`;
  }
  return `Candidates ready. Waiting for pick.${autoRerouteSentence}${rigStabilitySentence}${selectionRiskSentence}${qualityEmbargoSentence}${finalQualityFirewallSentence}${continuitySentence}${continuityQueueStatusSuffix}`;
}

export function buildSelectionGateBlockedMessage(input: {
  source: "auto" | "hitl";
  rigStability: SummarySeverityLike;
  packCoherence: CoherenceLike;
  selectionRisk: SummaryLevelLike;
  selectionRiskSummary: string;
  qualityEmbargo: SummaryLevelLike;
  qualityEmbargoSummary: string;
  finalQualityFirewall: SummaryLevelLike;
  finalQualityFirewallSummary: string;
}): string {
  const coherenceSummary = `${input.packCoherence.issues.join(", ")} (score=${input.packCoherence.score.toFixed(2)})`;
  const rigStabilitySummary = input.rigStability.summary ?? "-";

  if (input.rigStability.severity === "block") {
    return `Selected candidate pack failed rig stability guard: ${rigStabilitySummary}`;
  }
  if (input.packCoherence.severity === "block") {
    return `Selected candidate pack failed coherence gate: ${coherenceSummary}`;
  }
  if (input.finalQualityFirewall.level === "block") {
    return `Selected candidate pack failed final quality firewall: ${input.finalQualityFirewallSummary}`;
  }
  if (input.qualityEmbargo.level === "block") {
    return `Selected candidate pack failed quality embargo: ${input.qualityEmbargoSummary}`;
  }
  if (input.finalQualityFirewall.level === "review") {
    return `Auto-selected pack failed final quality firewall review gate: ${input.finalQualityFirewallSummary}`;
  }
  return input.source === "auto"
    ? `Auto-selected pack failed high-risk review gate: ${input.selectionRiskSummary}`
    : `Selected candidate pack failed high-risk review gate: ${input.selectionRiskSummary}`;
}

export function buildSelectionGateReviewSummary(input: {
  rigStability: SummarySeverityLike;
  packCoherence: CoherenceLike;
  selectionRiskSummary: string;
  qualityEmbargo: SummaryLevelLike;
  qualityEmbargoSummary: string;
  finalQualityFirewall: SummaryLevelLike;
  finalQualityFirewallSummary: string;
}): string {
  const coherenceSummary = `${input.packCoherence.issues.join(", ")} (score=${input.packCoherence.score.toFixed(2)})`;
  const rigStabilitySummary = input.rigStability.summary ?? "-";

  if (input.rigStability.severity === "block") {
    return `Selected candidates still fail the rig stability guard: ${rigStabilitySummary}. Manual compare or full-pack recreate is recommended.`;
  }
  if (input.packCoherence.severity === "block") {
    return `Selected candidates still fail the pack coherence gate: ${coherenceSummary}. Pick a different combination or regenerate weak views.`;
  }
  if (input.finalQualityFirewall.level === "block") {
    return `Selected candidates still fail the final quality firewall: ${input.finalQualityFirewallSummary}. Recreate the pack or replace persistent weak views.`;
  }
  if (input.qualityEmbargo.level === "block") {
    return `Selected candidates still fail the quality embargo: ${input.qualityEmbargoSummary}. Recreate the pack or replace blocked views.`;
  }
  if (input.finalQualityFirewall.level === "review") {
    return `Auto-selected candidates tripped the final quality firewall: ${input.finalQualityFirewallSummary}. Manual pick or full-pack recreate is recommended.`;
  }
  return `Auto-selected candidates tripped the high-risk review gate: ${input.selectionRiskSummary}. Manual pick or full-pack recreate is recommended.`;
}
