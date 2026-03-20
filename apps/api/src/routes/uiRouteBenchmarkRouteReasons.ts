import type { RigReviewState } from "./uiRouteRigReviewState";
import type { SmokeArtifactBundle } from "./uiRouteBenchmarkSmokeBundles";
import type { BundleReviewState, ReviewIssueEntry } from "./uiRouteBenchmarkBundleReview";

export type RouteReasonExplorerRow = {
  scenario: string;
  bundle: string;
  episodeId: string;
  shotId: string;
  shotType: string;
  routeReason: string;
  routeReasonLabel: string;
  renderModeSummary: string;
  backend: string;
  providerSummary: string;
  policySummary: string;
  attemptSummary: string;
  selectedCandidateId: string;
  acceptanceStatus: string;
  acceptanceTone: "ok" | "warn" | "bad" | "muted";
  qcSummary: string;
  issueSummary: string;
  issueCount: number;
  repairSummary: string;
  finalPassed: boolean | null;
  finalStage: string | null;
  fallbackSteps: string[];
  fallbackSummary: string;
  generatedAt: string;
  characterPackId: string | null;
  fixturePath: string | null;
  sourceLabel: string;
  sourcePath: string;
  smokeArtifactPath: string;
  runtimePath: string | null;
  planArtifactPath: string | null;
  qcArtifactPath: string | null;
  renderLogPath: string | null;
  actualJudgePath: string | null;
  visualJudgePath: string | null;
  candidateComparePath: string | null;
  renderModeArtifactPath: string | null;
  artifactRelativePath: string;
  rig: RigReviewState;
};

export type RouteReasonSourceItem = {
  shotId: string;
  shotType: string;
  routeReason: string | null;
  routeReasonLabel: string;
  renderModeSummary: string;
  backend: string | null;
  acceptanceStatus: string | null;
  sidecarStatus: string | null;
  qcSummary: string;
  repairSummary: string;
  fallbackSummary: string;
};

function compact(parts: Array<string | null | undefined>, separator = " | "): string {
  return parts
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
    .join(separator);
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

export function collectRouteReasonRowsFromBundles(input: {
  bundles: SmokeArtifactBundle[];
  buildCandidateCompareMap: (bundle: SmokeArtifactBundle, baseDir: string) => Map<string, string>;
  buildSidecarPlanReviewMap: (bundle: SmokeArtifactBundle) => Map<string, {
    providerSummary: string;
    policySummary: string;
    attemptSummary: string;
    selectedCandidateId: string;
    actualJudgePath: string | null;
    visualJudgePath: string | null;
  }>;
  collectBundleFixturePath: (bundle: SmokeArtifactBundle) => string | null;
  collectBundleReviewState: (bundle: SmokeArtifactBundle) => BundleReviewState;
  buildShotOpsItems: (bundle: SmokeArtifactBundle) => RouteReasonSourceItem[];
  reviewIssuesForShot: (issuesByShot: Map<string, ReviewIssueEntry[]>, shotId: string) => ReviewIssueEntry[];
  summarizeReviewIssues: (entries: ReviewIssueEntry[], limit?: number) => string;
  resolveRuntimeShotCharacterPackId: (runtimeDoc: unknown, shotId: string) => string | null;
  artifactRelativePath: (outRoot: string, filePath: string) => string;
  acceptanceTone: (status: string) => "ok" | "warn" | "bad" | "muted";
  mergeRigReviewStates: (...states: RigReviewState[]) => RigReviewState;
  extractRigReviewState: (doc: unknown, candidateId?: string | null) => RigReviewState;
  readRigReviewStateFromArtifactPath: (filePath: string | null, candidateId?: string | null) => RigReviewState;
}): RouteReasonExplorerRow[] {
  const rows: RouteReasonExplorerRow[] = [];
  for (const bundle of input.bundles) {
    const baseDir = bundle.sidecarPlanPath ?? bundle.smokePath;
    const compareMap = input.buildCandidateCompareMap(bundle, baseDir);
    const planReviewByShot = input.buildSidecarPlanReviewMap(bundle);
    const bundleFixturePath = input.collectBundleFixturePath(bundle);
    const bundleReview = input.collectBundleReviewState(bundle);
    const shotItems = input.buildShotOpsItems(bundle);
    for (const item of shotItems) {
      const acceptanceStatus = item.acceptanceStatus ?? item.sidecarStatus ?? "-";
      const planReview = planReviewByShot.get(item.shotId);
      const issueEntries = input.reviewIssuesForShot(bundleReview.issuesByShot, item.shotId);
      const selectedCandidateId =
        planReview?.selectedCandidateId && planReview.selectedCandidateId !== "-" ? planReview.selectedCandidateId : "-";
      const actualJudgePath = planReview?.actualJudgePath ?? null;
      const visualJudgePath = planReview?.visualJudgePath ?? null;
      const rig = input.mergeRigReviewStates(
        input.extractRigReviewState(item as unknown, selectedCandidateId === "-" ? null : selectedCandidateId),
        input.readRigReviewStateFromArtifactPath(actualJudgePath, selectedCandidateId === "-" ? null : selectedCandidateId),
        input.readRigReviewStateFromArtifactPath(visualJudgePath, selectedCandidateId === "-" ? null : selectedCandidateId)
      );
      rows.push({
        scenario: bundle.scenario,
        bundle: bundle.bundle,
        episodeId: bundle.episodeId,
        shotId: item.shotId,
        shotType: item.shotType,
        routeReason: item.routeReason ?? "-",
        routeReasonLabel: item.routeReasonLabel,
        renderModeSummary: item.renderModeSummary,
        backend: item.backend ?? "-",
        providerSummary: planReview?.providerSummary && planReview.providerSummary !== "-" ? planReview.providerSummary : item.backend ?? "-",
        policySummary: planReview?.policySummary && planReview.policySummary !== "-" ? planReview.policySummary : "-",
        attemptSummary: planReview?.attemptSummary && planReview.attemptSummary !== "-" ? planReview.attemptSummary : "-",
        selectedCandidateId,
        acceptanceStatus,
        acceptanceTone: input.acceptanceTone(acceptanceStatus),
        qcSummary: item.qcSummary,
        issueSummary: input.summarizeReviewIssues(issueEntries, 2),
        issueCount: issueEntries.length,
        repairSummary: item.repairSummary,
        finalPassed: bundleReview.finalPassed,
        finalStage: bundleReview.finalStage,
        fallbackSteps: bundleReview.fallbackSteps,
        fallbackSummary:
          compact(
            [
              item.fallbackSummary !== "-" ? item.fallbackSummary : null,
              bundleReview.fallbackSteps.length > 0 ? `bundle ${summarizeValues(bundleReview.fallbackSteps, 3)}` : null
            ],
            " | "
          ) || "-",
        generatedAt: bundle.generatedAt,
        characterPackId: input.resolveRuntimeShotCharacterPackId(bundle.runtimeDoc, item.shotId),
        fixturePath: bundleFixturePath,
        sourceLabel: bundle.source.label,
        sourcePath: bundle.source.outRoot,
        smokeArtifactPath: bundle.smokePath,
        runtimePath: bundle.runtimePath,
        planArtifactPath: bundle.sidecarPlanPath,
        qcArtifactPath: bundleReview.qcArtifactPath,
        renderLogPath: bundleReview.renderLogPath,
        actualJudgePath,
        visualJudgePath,
        candidateComparePath: compareMap.get(item.shotId) ?? null,
        renderModeArtifactPath: bundle.renderModePath,
        artifactRelativePath: input.artifactRelativePath(bundle.source.outRoot, bundle.smokePath),
        rig
      });
    }
  }

  rows.sort((left, right) => {
    const leftTime = new Date(left.generatedAt).getTime();
    const rightTime = new Date(right.generatedAt).getTime();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    if (left.routeReason !== right.routeReason) {
      return left.routeReason.localeCompare(right.routeReason);
    }
    return left.shotId.localeCompare(right.shotId);
  });
  return rows;
}
