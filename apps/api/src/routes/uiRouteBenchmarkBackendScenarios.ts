import path from "node:path";

type Tone = "ok" | "warn" | "bad" | "muted";
type JsonRecord = Record<string, unknown>;

type RolloutArtifactSource = {
  label: string;
  outRoot: string;
};

type ScenarioHandoffState = {
  characterPackId: string | null;
  fixturePath: string | null;
};

export type BenchmarkScenarioView = {
  benchmarkName: string;
  benchmarkKind: string;
  backend: string;
  renderer: string;
  status: string;
  tone: Tone;
  latencyMs: string;
  acceptanceRate: string;
  failureRate: string;
  generatedAt: string;
  notes: string;
  speciesId: string | null;
  selectedView: string | null;
  repairable: boolean | null;
  recreateRecommended: boolean;
  rigReasonFamilies: string[];
  repairLineageSummary: string[];
  directiveFamilySummary: string[];
  anchorOverridePresent: boolean | null;
  cropOverridePresent: boolean | null;
  characterPackId: string | null;
  fixturePath: string | null;
  sourceLabel: string;
  sourcePath: string;
  matrixArtifactPath: string;
  detailArtifactPath: string;
  smokeArtifactPath: string | null;
  planArtifactPath: string | null;
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

function formatPercent(value: unknown, digits = 0): string {
  const parsed = num(value);
  if (parsed === null) return "-";
  return `${(parsed * 100).toFixed(digits)}%`;
}

function firstMeaningfulLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

function readBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function buildBackendBenchmarkViews(input: {
  source: RolloutArtifactSource;
  pathExists: (filePath: string) => boolean;
  listDirectories: (dirPath: string) => string[];
  readJsonFileSafe: (filePath: string) => unknown | null;
  safeJsonArtifactPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null;
  findCandidateCompareItems: (source: RolloutArtifactSource, baseDir: string) => Array<{ label: string; path: string }>;
  normalizeRolloutStatus: (value: string | null, ready?: boolean) => string;
  rolloutTone: (status: string) => Tone;
  resolveBenchmarkScenarioHandoffState: (doc: JsonRecord, rawScenario: JsonRecord) => ScenarioHandoffState;
  artifactRelativePath: (outRoot: string, filePath: string) => string;
}): BenchmarkScenarioView[] {
  const benchmarkRoot = path.join(input.source.outRoot, "backend_benchmarks");
  if (!input.pathExists(benchmarkRoot)) {
    return [];
  }

  const rows: BenchmarkScenarioView[] = [];
  for (const benchmarkName of input.listDirectories(benchmarkRoot)) {
    const matrixPath = path.join(benchmarkRoot, benchmarkName, "benchmark_matrix.json");
    const doc = input.readJsonFileSafe(matrixPath);
    if (!isRecord(doc) || !Array.isArray(doc.scenarios)) {
      continue;
    }

    const generatedAt = str(doc.generated_at) ?? "-";
    const benchmarkKind = str(doc.benchmark_kind) ?? benchmarkName;
    for (const rawScenario of doc.scenarios) {
      if (!isRecord(rawScenario)) continue;
      const success = rawScenario.success === true;
      const status = success
        ? "ready"
        : input.normalizeRolloutStatus(str(rawScenario.sidecar_status) ?? str(rawScenario.status) ?? "blocked", false);
      const smokeArtifactPath = input.safeJsonArtifactPath(input.source, rawScenario.smoke_report_path);
      const planArtifactPath = input.safeJsonArtifactPath(input.source, rawScenario.shot_sidecar_plan_path);
      const detailArtifactPath = smokeArtifactPath ?? planArtifactPath ?? matrixPath;
      const candidateCompareItems = planArtifactPath
        ? input.findCandidateCompareItems(input.source, path.dirname(planArtifactPath))
        : [];
      const speciesId = str(rawScenario.species_id) ?? str(rawScenario.speciesId);
      const selectedView =
        str(rawScenario.selected_view) ??
        str(rawScenario.selectedView) ??
        str(rawScenario.reference_view) ??
        str(rawScenario.referenceView);
      const repairable = readBooleanOrNull(rawScenario.repairable);
      const recreateRecommended =
        readBooleanOrNull(rawScenario.recreate_recommended) === true ||
        readBooleanOrNull(rawScenario.recreateRecommended) === true;
      const rigReasonFamilies = uniqueStrings([
        ...(Array.isArray(rawScenario.rig_reason_families) ? rawScenario.rig_reason_families : []).map((item) => str(item))
      ]);
      const repairLineageSummary = uniqueStrings([
        ...(Array.isArray(rawScenario.repair_lineage_summary) ? rawScenario.repair_lineage_summary : []).map((item) => str(item))
      ]);
      const directiveFamilySummary = uniqueStrings([
        ...(Array.isArray(rawScenario.directive_family_summary) ? rawScenario.directive_family_summary : []).map((item) => str(item))
      ]);
      const anchorOverridePresent =
        readBooleanOrNull(rawScenario.anchor_override_present) ??
        readBooleanOrNull(rawScenario.anchorOverridePresent);
      const cropOverridePresent =
        readBooleanOrNull(rawScenario.crop_override_present) ??
        readBooleanOrNull(rawScenario.cropOverridePresent);
      const handoffState = input.resolveBenchmarkScenarioHandoffState(doc, rawScenario);
      const note = compact([
        str(rawScenario.sidecar_status),
        compact([
          speciesId ? `species ${speciesId}` : null,
          selectedView ? `view ${selectedView}` : null,
          repairable === true ? "repairable" : recreateRecommended ? "recreate_required" : null
        ]),
        rigReasonFamilies.length > 0 ? `families ${summarizeValues(rigReasonFamilies, 3)}` : null,
        repairLineageSummary.length > 0 ? `lineage ${summarizeValues(repairLineageSummary, 2)}` : null,
        directiveFamilySummary.length > 0 ? `directives ${summarizeValues(directiveFamilySummary, 2)}` : null,
        anchorOverridePresent === true ? "anchor override" : null,
        cropOverridePresent === true ? "crop override" : null,
        firstMeaningfulLine(rawScenario.stderr_tail) ?? firstMeaningfulLine(rawScenario.stdout_tail)
      ]);
      rows.push({
        benchmarkName,
        benchmarkKind,
        backend: str(rawScenario.backend) ?? "-",
        renderer: str(rawScenario.renderer) ?? "-",
        status,
        tone: input.rolloutTone(status),
        latencyMs: num(rawScenario.latency_ms) === null ? "-" : `${Math.round(num(rawScenario.latency_ms) ?? 0).toString()} ms`,
        acceptanceRate: formatPercent(rawScenario.acceptance_rate),
        failureRate: formatPercent(rawScenario.render_failure_rate),
        generatedAt,
        notes: note || "-",
        speciesId,
        selectedView,
        repairable,
        recreateRecommended,
        rigReasonFamilies,
        repairLineageSummary,
        directiveFamilySummary,
        anchorOverridePresent,
        cropOverridePresent,
        characterPackId: handoffState.characterPackId,
        fixturePath: handoffState.fixturePath,
        sourceLabel: input.source.label,
        sourcePath: input.source.outRoot,
        matrixArtifactPath: matrixPath,
        detailArtifactPath,
        smokeArtifactPath,
        planArtifactPath,
        candidateCompareItems,
        artifactRelativePath: input.artifactRelativePath(input.source.outRoot, detailArtifactPath)
      });
    }
  }

  const priority = new Map<string, number>([
    ["blocked", 0],
    ["below_min_score", 1],
    ["divergence", 2],
    ["warn", 3],
    ["ready", 4],
    ["unknown", 5]
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
    if (left.benchmarkKind !== right.benchmarkKind) return left.benchmarkKind.localeCompare(right.benchmarkKind);
    return left.backend.localeCompare(right.backend);
  });
  return rows;
}
