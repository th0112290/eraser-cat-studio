import { collectBundleFixturePath as collectBundleFixturePathWithNormalizer } from "./uiRouteBenchmarkRuntimeArtifacts";
import {
  buildCandidateCompareMapFromItems,
  collectReferenceLineageWithResolvers
} from "./uiRouteBenchmarkReferenceArtifacts";
import {
  collectDatasetLineageRowsFromBundles,
  type DatasetLineageRow
} from "./uiRouteBenchmarkDatasetLineage";
import {
  collectRouteReasonRowsFromBundles,
  type RouteReasonExplorerRow,
  type RouteReasonSourceItem
} from "./uiRouteBenchmarkRouteReasons";
import {
  collectRepairAcceptanceRowsFromBundles,
  type RepairAcceptanceRow
} from "./uiRouteBenchmarkRepairAcceptance";
import {
  collectSmokeArtifactBundlesWithResolvers,
  type SmokeArtifactBundle
} from "./uiRouteBenchmarkSmokeBundles";
import {
  buildBackendBenchmarkViews as buildBackendBenchmarkViewsFromSource,
  type BenchmarkScenarioView
} from "./uiRouteBenchmarkBackendScenarios";
import {
  buildRegressionReportViews as buildRegressionReportViewsFromSource,
  collectBenchmarkViewerDataFromSources,
  type RegressionReportView
} from "./uiRouteBenchmarkRegressionReports";
import type { BundleReviewState } from "./uiRouteBenchmarkBundleReview";
import type { SidecarPlanReviewEntry } from "./uiRouteBenchmarkPlanReview";
import type { RigReviewState } from "./uiRouteRigReviewState";

type RolloutArtifactSourceLike = {
  label: string;
  outRoot: string;
};

type RolloutSourceStatusLike = {
  label: string;
  outRoot: string;
  exists: boolean;
  recordCount: number;
  latestGeneratedAt: string | null;
};

export function collectBenchmarkViewerDataWithDeps(input: {
  getRolloutArtifactSources: () => RolloutArtifactSourceLike[];
  pathExists: (filePath: string) => boolean;
  buildBackendBenchmarkViews: (source: RolloutArtifactSourceLike) => BenchmarkScenarioView[];
  buildRegressionReportViews: (source: RolloutArtifactSourceLike) => RegressionReportView[];
  selectGeneratedAt: (values: Array<string | null | undefined>) => string | null;
}): {
  sources: RolloutSourceStatusLike[];
  backendScenarios: BenchmarkScenarioView[];
  regressions: RegressionReportView[];
} {
  return collectBenchmarkViewerDataFromSources({
    sources: input.getRolloutArtifactSources(),
    pathExists: input.pathExists,
    buildBackendBenchmarkViews: input.buildBackendBenchmarkViews,
    buildRegressionReportViews: input.buildRegressionReportViews,
    selectGeneratedAt: input.selectGeneratedAt
  });
}

export function collectBundleFixturePath(input: {
  bundle: SmokeArtifactBundle;
  safeRolloutArtifactPath: (value: unknown) => string | null;
}): string | null {
  return collectBundleFixturePathWithNormalizer(input.bundle, input.safeRolloutArtifactPath);
}

export function collectSmokeArtifactBundlesWithDeps(input: {
  getRolloutArtifactSources: () => RolloutArtifactSourceLike[];
  pathExists: (filePath: string) => boolean;
  findFilesByName: (rootDir: string, fileName: string) => string[];
  readJsonFileSafe: (filePath: string) => unknown | null;
  safeJsonArtifactPath: (source: RolloutArtifactSourceLike, candidatePath: unknown) => string | null;
  artifactRelativePath: (outRoot: string, filePath: string) => string;
}): SmokeArtifactBundle[] {
  return collectSmokeArtifactBundlesWithResolvers({
    sources: input.getRolloutArtifactSources(),
    pathExists: input.pathExists,
    findFilesByName: input.findFilesByName,
    readJsonFileSafe: input.readJsonFileSafe,
    normalizeJsonArtifactPath: input.safeJsonArtifactPath,
    artifactRelativePath: input.artifactRelativePath
  });
}

export function collectReferenceLineageWithDeps(input: {
  source: RolloutArtifactSourceLike;
  baseDir: string;
  readJsonFileSafe: (filePath: string) => unknown | null;
  safeJsonArtifactPath: (source: RolloutArtifactSourceLike, candidatePath: unknown) => string | null;
  createEmptyRigReviewState: () => RigReviewState;
  mergeRigReviewStates: (left: RigReviewState, right: RigReviewState) => RigReviewState;
  extractRigReviewState: (value: unknown) => RigReviewState;
}): { manifestPaths: string[]; selectedImagePaths: string[]; rig: RigReviewState } {
  return collectReferenceLineageWithResolvers({
    baseDir: input.baseDir,
    readJsonFileSafe: input.readJsonFileSafe,
    normalizeJsonArtifactPath: (candidatePath) => input.safeJsonArtifactPath(input.source, candidatePath),
    createEmptyRigReviewState: input.createEmptyRigReviewState,
    mergeRigReviewStates: input.mergeRigReviewStates,
    extractRigReviewState: input.extractRigReviewState
  });
}

export function buildCandidateCompareMapWithDeps(input: {
  source: RolloutArtifactSourceLike;
  baseDir: string;
  findCandidateCompareItems: (source: RolloutArtifactSourceLike, baseDir: string) => Array<{ label: string; path: string }>;
  readJsonFileSafe: (filePath: string) => unknown | null;
}): Map<string, string> {
  return buildCandidateCompareMapFromItems(
    input.findCandidateCompareItems(input.source, input.baseDir),
    input.readJsonFileSafe
  );
}

export function collectRepairAcceptanceRowsWithDeps(input: {
  bundles: SmokeArtifactBundle[];
  buildCandidateCompareMap: (bundle: SmokeArtifactBundle, baseDir: string) => Map<string, string>;
  buildSidecarPlanReviewMap: (bundle: SmokeArtifactBundle) => Map<string, SidecarPlanReviewEntry>;
  collectBundleFixturePath: (bundle: SmokeArtifactBundle) => string | null;
  collectBundleReviewState: (bundle: SmokeArtifactBundle) => BundleReviewState;
  reviewIssuesForShot: (...args: any[]) => any;
  summarizeReviewIssues: (...args: any[]) => string;
  acceptanceStatusFromArtifact: (raw: Record<string, unknown>) => string;
  acceptanceTone: (status: string) => "ok" | "warn" | "bad" | "muted";
  qcStatusFromArtifact: (raw: Record<string, unknown>) => {
    status: string;
    tone: "ok" | "warn" | "bad" | "muted";
    summary: string;
  };
  resolveRuntimeShotCharacterPackId: (runtimeDoc: unknown, scenario: string) => string | null;
  safeActualJudgePath: (bundle: SmokeArtifactBundle, raw: Record<string, unknown>, planReview: any) => string | null;
  safeVisualJudgePath: (bundle: SmokeArtifactBundle, raw: Record<string, unknown>, planReview: any) => string | null;
  artifactRelativePath: (outRoot: string, filePath: string) => string;
  mergeRigReviewStates: (left: RigReviewState, right: RigReviewState) => RigReviewState;
  extractRigReviewState: (value: unknown) => RigReviewState;
  readRigReviewStateFromArtifactPath: (filePath: string | null, candidateId?: string | null) => RigReviewState;
}): RepairAcceptanceRow[] {
  return collectRepairAcceptanceRowsFromBundles(input);
}

export function collectRouteReasonRowsWithDeps(input: {
  bundles: SmokeArtifactBundle[];
  buildCandidateCompareMap: (bundle: SmokeArtifactBundle, baseDir: string) => Map<string, string>;
  buildSidecarPlanReviewMap: (bundle: SmokeArtifactBundle) => Map<string, SidecarPlanReviewEntry>;
  collectBundleFixturePath: (bundle: SmokeArtifactBundle) => string | null;
  collectBundleReviewState: (bundle: SmokeArtifactBundle) => BundleReviewState;
  buildShotOpsItems: (bundle: SmokeArtifactBundle) => RouteReasonSourceItem[];
  reviewIssuesForShot: (...args: any[]) => any;
  summarizeReviewIssues: (...args: any[]) => string;
  resolveRuntimeShotCharacterPackId: (runtimeDoc: unknown, scenario: string) => string | null;
  artifactRelativePath: (outRoot: string, filePath: string) => string;
  acceptanceTone: (status: string) => "ok" | "warn" | "bad" | "muted";
  mergeRigReviewStates: (left: RigReviewState, right: RigReviewState) => RigReviewState;
  extractRigReviewState: (value: unknown) => RigReviewState;
  readRigReviewStateFromArtifactPath: (filePath: string | null, candidateId?: string | null) => RigReviewState;
}): RouteReasonExplorerRow[] {
  return collectRouteReasonRowsFromBundles(input);
}

export function collectDatasetLineageRowsWithDeps(input: {
  bundles: SmokeArtifactBundle[];
  isShotsDocLike: (value: unknown) => boolean;
  collectRuntimePackIdsFromShotsDoc: (value: unknown) => string[];
  collectReferenceLineage: (bundle: SmokeArtifactBundle, baseDir: string) => {
    manifestPaths: string[];
    selectedImagePaths: string[];
    rig: RigReviewState;
  };
  artifactRelativePath: (outRoot: string, filePath: string) => string;
  collectBundleFixturePath: (bundle: SmokeArtifactBundle) => string | null;
}): DatasetLineageRow[] {
  return collectDatasetLineageRowsFromBundles(input);
}
