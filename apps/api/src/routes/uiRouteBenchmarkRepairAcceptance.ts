import type { RigReviewState } from "./uiRouteRigReviewState";
import type { SmokeArtifactBundle } from "./uiRouteBenchmarkSmokeBundles";
import type { BundleReviewState, ReviewIssueEntry } from "./uiRouteBenchmarkBundleReview";

type Tone = "ok" | "warn" | "bad" | "muted";

export type RepairAcceptanceRow = {
  scenario: string;
  bundle: string;
  episodeId: string;
  shotId: string;
  shotType: string;
  backend: string;
  renderer: string;
  providerSummary: string;
  policySummary: string;
  attemptSummary: string;
  selectedCandidateId: string;
  acceptanceStatus: string;
  acceptanceTone: Tone;
  qcStatus: string;
  qcTone: Tone;
  judgeSummary: string;
  repairSignals: string[];
  repairSummary: string;
  qcSummary: string;
  issueSummary: string;
  issueCount: number;
  finalPassed: boolean | null;
  finalStage: string | null;
  fallbackSteps: string[];
  fallbackSummary: string;
  failureSummary: string;
  generatedAt: string;
  characterPackId: string | null;
  fixturePath: string | null;
  sourceLabel: string;
  sourcePath: string;
  smokeArtifactPath: string;
  planArtifactPath: string | null;
  qcArtifactPath: string | null;
  renderLogPath: string | null;
  actualJudgePath: string | null;
  visualJudgePath: string | null;
  candidateComparePath: string | null;
  artifactRelativePath: string;
  rig: RigReviewState;
};

type SidecarPlanReviewEntry = {
  providerSummary: string;
  policySummary: string;
  attemptSummary: string;
  selectedCandidateId: string;
  actualJudgePath: string | null;
  visualJudgePath: string | null;
};

type QcState = { status: string; tone: Tone; summary: string };

function compact(parts: Array<string | null | undefined>, separator = " | "): string {
  return parts
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
    .join(separator);
}

function str(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function formatNumber(value: unknown, digits = 2): string {
  const parsed = num(value);
  if (parsed === null) return "-";
  return parsed.toFixed(digits).replace(/\.?0+$/, "");
}

function summarizeValues(values: Array<string | null | undefined>, limit = 3): string {
  const normalized = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  if (normalized.length === 0) {
    return "-";
  }
  const preview = normalized.slice(0, limit).join(", ");
  return normalized.length > limit ? `${preview} (+${normalized.length - limit})` : preview;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function collectRepairAcceptanceRowsFromBundles(input: {
  bundles: SmokeArtifactBundle[];
  buildCandidateCompareMap: (bundle: SmokeArtifactBundle, baseDir: string) => Map<string, string>;
  buildSidecarPlanReviewMap: (bundle: SmokeArtifactBundle) => Map<string, SidecarPlanReviewEntry>;
  collectBundleFixturePath: (bundle: SmokeArtifactBundle) => string | null;
  collectBundleReviewState: (bundle: SmokeArtifactBundle) => BundleReviewState;
  reviewIssuesForShot: (issuesByShot: Map<string, ReviewIssueEntry[]>, shotId: string) => ReviewIssueEntry[];
  summarizeReviewIssues: (entries: ReviewIssueEntry[], limit?: number) => string;
  acceptanceStatusFromArtifact: (raw: Record<string, unknown>) => string;
  acceptanceTone: (status: string) => Tone;
  qcStatusFromArtifact: (raw: Record<string, unknown>) => QcState;
  resolveRuntimeShotCharacterPackId: (runtimeDoc: unknown, shotId: string) => string | null;
  safeActualJudgePath: (bundle: SmokeArtifactBundle, raw: Record<string, unknown>, planReview: SidecarPlanReviewEntry | undefined) => string | null;
  safeVisualJudgePath: (bundle: SmokeArtifactBundle, raw: Record<string, unknown>, planReview: SidecarPlanReviewEntry | undefined) => string | null;
  artifactRelativePath: (outRoot: string, filePath: string) => string;
  mergeRigReviewStates: (...states: RigReviewState[]) => RigReviewState;
  extractRigReviewState: (doc: unknown, candidateId?: string | null) => RigReviewState;
  readRigReviewStateFromArtifactPath: (filePath: string | null, candidateId?: string | null) => RigReviewState;
}): RepairAcceptanceRow[] {
  const rows: RepairAcceptanceRow[] = [];
  for (const bundle of input.bundles) {
    const baseDir = bundle.sidecarPlanPath ?? bundle.smokePath;
    const compareMap = input.buildCandidateCompareMap(bundle, baseDir);
    const planReviewByShot = input.buildSidecarPlanReviewMap(bundle);
    const bundleFixturePath = input.collectBundleFixturePath(bundle);
    const bundleReview = input.collectBundleReviewState(bundle);
    const sidecarArtifacts = Array.isArray(bundle.smokeDoc.sidecar_artifacts) ? bundle.smokeDoc.sidecar_artifacts : [];
    for (const raw of sidecarArtifacts) {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        continue;
      }
      const doc = raw as Record<string, unknown>;
      const shotId = str(doc.shot_id);
      if (!shotId) continue;
      const qcState = input.qcStatusFromArtifact(doc);
      const planReview = planReviewByShot.get(shotId);
      const issueEntries = input.reviewIssuesForShot(bundleReview.issuesByShot, shotId);
      const repairSignals = uniqueStrings([
        str(doc.impact_preset),
        ...(Array.isArray(doc.preset_policy_tags) ? doc.preset_policy_tags : []).map((item) => str(item)),
        ...(Array.isArray(doc.premium_actual_policy_rejection_reasons) ? doc.premium_actual_policy_rejection_reasons : []).map((item) => str(item)),
        ...(qcState.summary !== "-" ? [qcState.summary] : [])
      ]).filter((value) => value.toLowerCase().includes("repair") || value.toLowerCase().includes("identity") || value.toLowerCase().includes("reject"));
      const failureSummary = compact([
        str(doc.failure),
        str(doc.error),
        Array.isArray(doc.visual_signal_warnings) && doc.visual_signal_warnings.length > 0
          ? summarizeValues((doc.visual_signal_warnings as unknown[]).map((item) => str(item)), 2)
          : null
      ]);
      const acceptanceStatus = input.acceptanceStatusFromArtifact(doc);
      const selectedCandidateId =
        str(doc.premium_actual_selected_candidate_id) ??
        str(doc.premium_selected_candidate_id) ??
        (planReview?.selectedCandidateId && planReview.selectedCandidateId !== "-" ? planReview.selectedCandidateId : null) ??
        "-";
      const actualJudgePath = input.safeActualJudgePath(bundle, doc, planReview);
      const visualJudgePath = input.safeVisualJudgePath(bundle, doc, planReview);
      const rig = input.mergeRigReviewStates(
        input.extractRigReviewState(doc, selectedCandidateId === "-" ? null : selectedCandidateId),
        input.readRigReviewStateFromArtifactPath(actualJudgePath, selectedCandidateId === "-" ? null : selectedCandidateId),
        input.readRigReviewStateFromArtifactPath(visualJudgePath, selectedCandidateId === "-" ? null : selectedCandidateId)
      );
      rows.push({
        scenario: bundle.scenario,
        bundle: bundle.bundle,
        episodeId: bundle.episodeId,
        shotId,
        shotType: str(doc.shot_type) ?? "-",
        backend: str(doc.backend) ?? str(doc.actual_backend) ?? "-",
        renderer: str(doc.renderer) ?? str(doc.expected_renderer) ?? "-",
        providerSummary:
          planReview?.providerSummary && planReview.providerSummary !== "-"
            ? planReview.providerSummary
            : compact([str(doc.actual_backend) ?? str(doc.backend), str(doc.renderer) ?? str(doc.expected_renderer)], " / ") || "-",
        policySummary:
          planReview?.policySummary && planReview.policySummary !== "-"
            ? planReview.policySummary
            : compact(
                [
                  str(doc.controlnet_preset),
                  str(doc.impact_preset),
                  str(doc.qc_preset),
                  Array.isArray(doc.preset_policy_tags) && doc.preset_policy_tags.length > 0
                    ? `tags ${summarizeValues((doc.preset_policy_tags as unknown[]).map((item) => str(item)), 3)}`
                    : null
                ],
                " | "
              ) || "-",
        attemptSummary: planReview?.attemptSummary && planReview.attemptSummary !== "-" ? planReview.attemptSummary : "-",
        selectedCandidateId,
        acceptanceStatus,
        acceptanceTone: input.acceptanceTone(acceptanceStatus),
        qcStatus: qcState.status,
        qcTone: qcState.tone,
        judgeSummary: compact([
          str(doc.judge_decision),
          num(doc.judge_score) === null ? null : `score ${formatNumber(doc.judge_score)}`,
          num(doc.retake_count) === null ? null : `${formatNumber(doc.retake_count, 0)} retake`
        ]),
        repairSignals,
        repairSummary: summarizeValues(repairSignals, 4),
        qcSummary: qcState.summary,
        issueSummary: input.summarizeReviewIssues(issueEntries, 2),
        issueCount: issueEntries.length,
        finalPassed: bundleReview.finalPassed,
        finalStage: bundleReview.finalStage,
        fallbackSteps: bundleReview.fallbackSteps,
        fallbackSummary: summarizeValues(bundleReview.fallbackSteps, 4),
        failureSummary: failureSummary || "-",
        generatedAt: bundle.generatedAt,
        characterPackId: input.resolveRuntimeShotCharacterPackId(bundle.runtimeDoc, shotId),
        fixturePath: bundleFixturePath,
        sourceLabel: bundle.source.label,
        sourcePath: bundle.source.outRoot,
        smokeArtifactPath: bundle.smokePath,
        planArtifactPath: bundle.sidecarPlanPath,
        qcArtifactPath: bundleReview.qcArtifactPath,
        renderLogPath: bundleReview.renderLogPath,
        actualJudgePath,
        visualJudgePath,
        candidateComparePath: compareMap.get(shotId) ?? null,
        artifactRelativePath: input.artifactRelativePath(bundle.source.outRoot, bundle.smokePath),
        rig
      });
    }
  }

  rows.sort((left, right) => {
    const toneOrder = new Map<Tone, number>([
      ["bad", 0],
      ["warn", 1],
      ["ok", 2],
      ["muted", 3]
    ]);
    const leftTone = toneOrder.get(left.acceptanceTone) ?? 9;
    const rightTone = toneOrder.get(right.acceptanceTone) ?? 9;
    if (leftTone !== rightTone) return leftTone - rightTone;
    const leftTime = new Date(left.generatedAt).getTime();
    const rightTime = new Date(right.generatedAt).getTime();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left.shotId.localeCompare(right.shotId);
  });
  return rows;
}
