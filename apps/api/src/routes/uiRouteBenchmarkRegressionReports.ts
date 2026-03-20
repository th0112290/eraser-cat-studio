import path from "node:path";

type Tone = "ok" | "warn" | "bad" | "muted";
type JsonRecord = Record<string, unknown>;

type RolloutArtifactSource = {
  label: string;
  outRoot: string;
};

type SourceStatus = {
  label: string;
  outRoot: string;
  exists: boolean;
  recordCount: number;
  latestGeneratedAt: string | null;
};

export type RegressionReportView = {
  benchmarkName: string;
  bundlePath: string;
  episodeId: string;
  status: string;
  tone: Tone;
  warningCount: number;
  errorCount: number;
  generatedAt: string;
  issueSummary: string;
  profileSummary: string;
  renderModeSummary: string;
  mismatchCount: number;
  sourceLabel: string;
  sourcePath: string;
  artifactPath: string;
  smokeArtifactPath: string | null;
  renderModeArtifactPath: string | null;
  candidateCompareItems: Array<{ label: string; path: string }>;
  artifactRelativePath: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function compact(parts: Array<string | null | undefined>, separator = " | "): string {
  return parts
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
    .join(separator);
}

function recordList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((row): row is JsonRecord => isRecord(row)) : [];
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

export function buildRegressionReportViews(input: {
  source: RolloutArtifactSource;
  pathExists: (filePath: string) => boolean;
  findFilesByName: (rootDir: string, targetName: string, maxDepth?: number) => string[];
  readJsonFileSafe: (filePath: string) => unknown | null;
  safeJsonArtifactPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null;
  findCandidateCompareItems: (source: RolloutArtifactSource, baseDir: string) => Array<{ label: string; path: string }>;
  normalizeRolloutStatus: (value: string | null, ready?: boolean) => string;
  rolloutTone: (status: string) => Tone;
  artifactRelativePath: (outRoot: string, filePath: string) => string;
}): RegressionReportView[] {
  const benchmarkRoot = path.join(input.source.outRoot, "multi_channel_benchmarks");
  if (!input.pathExists(benchmarkRoot)) {
    return [];
  }

  const files = input.findFilesByName(benchmarkRoot, "episode_regression_report.json", 6);
  const rows: RegressionReportView[] = [];
  for (const filePath of files) {
    const doc = input.readJsonFileSafe(filePath);
    if (!isRecord(doc)) {
      continue;
    }

    const dirPath = path.dirname(filePath);
    const smokePath = path.join(dirPath, "smoke_report.json");
    const renderModePath = path.join(dirPath, "shot_render_mode_report.json");
    const smokeArtifactPath = input.safeJsonArtifactPath(input.source, smokePath);
    const renderModeArtifactPath = input.safeJsonArtifactPath(input.source, renderModePath);
    const candidateCompareItems = input.findCandidateCompareItems(input.source, dirPath);
    const smokeDoc = smokeArtifactPath ? input.readJsonFileSafe(smokeArtifactPath) : null;
    const renderModeDoc = renderModeArtifactPath ? input.readJsonFileSafe(renderModeArtifactPath) : null;
    const relativeDir = input.artifactRelativePath(benchmarkRoot, dirPath);
    const warningCount = Math.max(0, Math.round(num(doc.warning_count) ?? 0));
    const errorCount = Math.max(0, Math.round(num(doc.error_count) ?? 0));
    const finalPassed = doc.final_passed === true;
    const status = !finalPassed || errorCount > 0 ? "blocked" : warningCount > 0 ? "warn" : "ready";
    const profileSelection = isRecord(smokeDoc) && isRecord(smokeDoc.profile_selection) ? smokeDoc.profile_selection : {};
    const profileSummary = compact([
      str(isRecord(smokeDoc) ? smokeDoc.profile_bundle : undefined),
      str(profileSelection.channel_profile_id) ? `channel ${str(profileSelection.channel_profile_id)}` : null,
      str(profileSelection.mascot_profile_id) ? `mascot ${str(profileSelection.mascot_profile_id)}` : null,
      str(profileSelection.studio_profile_id) ? `studio ${str(profileSelection.studio_profile_id)}` : null
    ]);
    const issues = recordList(doc.issues);
    const issueSummary = issues.length > 0
      ? summarizeValues(
          issues.map((issue) => compact([str(issue.code), str(issue.message)], " - ")),
          2
        )
      : "no regression issues";
    const renderModeSummaryDoc = isRecord(renderModeDoc) && isRecord(renderModeDoc.summary) ? renderModeDoc.summary : {};
    const mismatchCount = Math.max(0, Math.round(num(renderModeSummaryDoc.mismatched_stored_vs_recommended) ?? 0));
    const totalShots = Math.max(0, Math.round(num(renderModeSummaryDoc.total_shots) ?? 0));
    const renderModeSummary =
      mismatchCount > 0
        ? `${mismatchCount}/${totalShots || "-"} mismatched stored vs recommended`
        : totalShots > 0
          ? `0/${totalShots} mismatched`
          : "-";

    rows.push({
      benchmarkName: relativeDir.split("/")[0] ?? "benchmark",
      bundlePath: relativeDir,
      episodeId: str(doc.episode_id) ?? "-",
      status,
      tone: input.rolloutTone(status),
      warningCount,
      errorCount,
      generatedAt: str(doc.generated_at) ?? "-",
      issueSummary,
      profileSummary: profileSummary || "-",
      renderModeSummary,
      mismatchCount,
      sourceLabel: input.source.label,
      sourcePath: input.source.outRoot,
      artifactPath: filePath,
      smokeArtifactPath,
      renderModeArtifactPath,
      candidateCompareItems,
      artifactRelativePath: input.artifactRelativePath(input.source.outRoot, filePath)
    });
  }

  const priority = new Map<string, number>([
    ["blocked", 0],
    ["warn", 1],
    ["ready", 2],
    ["unknown", 3]
  ]);
  rows.sort((left, right) => {
    const leftPriority = priority.get(input.normalizeRolloutStatus(left.status)) ?? 9;
    const rightPriority = priority.get(input.normalizeRolloutStatus(right.status)) ?? 9;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const leftTime = new Date(left.generatedAt).getTime();
    const rightTime = new Date(right.generatedAt).getTime();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left.bundlePath.localeCompare(right.bundlePath);
  });
  return rows;
}

export function collectBenchmarkViewerDataFromSources<TBackend extends { generatedAt: string }>(input: {
  sources: RolloutArtifactSource[];
  pathExists: (filePath: string) => boolean;
  buildBackendBenchmarkViews: (source: RolloutArtifactSource) => TBackend[];
  buildRegressionReportViews: (source: RolloutArtifactSource) => RegressionReportView[];
  selectGeneratedAt: (values: string[]) => string | null;
}): {
  sources: SourceStatus[];
  backendScenarios: TBackend[];
  regressions: RegressionReportView[];
} {
  const sources: SourceStatus[] = [];
  const backendScenarios: TBackend[] = [];
  const regressions: RegressionReportView[] = [];
  for (const source of input.sources) {
    const exists = input.pathExists(source.outRoot);
    const sourceBackend = exists ? input.buildBackendBenchmarkViews(source) : [];
    const sourceRegressions = exists ? input.buildRegressionReportViews(source) : [];
    const latestGeneratedAt = input.selectGeneratedAt(
      [...sourceBackend.map((row) => row.generatedAt), ...sourceRegressions.map((row) => row.generatedAt)].filter((value) => value !== "-")
    );
    sources.push({
      label: source.label,
      outRoot: source.outRoot,
      exists,
      recordCount: sourceBackend.length + sourceRegressions.length,
      latestGeneratedAt
    });
    backendScenarios.push(...sourceBackend);
    regressions.push(...sourceRegressions);
  }
  return { sources, backendScenarios, regressions };
}
