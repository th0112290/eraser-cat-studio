import type { RigReviewState } from "./uiRouteRigReviewState";
import type { SmokeArtifactBundle } from "./uiRouteBenchmarkSmokeBundles";

type JsonRecord = Record<string, unknown>;

export type DatasetLineageRow = {
  scenario: string;
  bundle: string;
  episodeId: string;
  generatedAt: string;
  sourceLabel: string;
  sourcePath: string;
  smokeArtifactPath: string;
  artifactRelativePath: string;
  bibleRef: string;
  datasetIds: string[];
  packIds: string[];
  beatCount: number;
  routeReasons: string[];
  inputShotsPath: string | null;
  runtimeShotsPath: string | null;
  renderLogPath: string | null;
  qcReportPath: string | null;
  sidecarPlanPath: string | null;
  renderModeArtifactPath: string | null;
  manifestPaths: string[];
  selectedImagePaths: string[];
  schemaGaps: string[];
  rig: RigReviewState;
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

function recordList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((row): row is JsonRecord => isRecord(row)) : [];
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

export function collectDatasetLineageRowsFromBundles(input: {
  bundles: SmokeArtifactBundle[];
  isShotsDocLike: (value: unknown) => boolean;
  collectRuntimePackIdsFromShotsDoc: (runtimeDoc: unknown) => string[];
  collectReferenceLineage: (bundle: SmokeArtifactBundle, baseDir: string) => { manifestPaths: string[]; selectedImagePaths: string[]; rig: RigReviewState };
  artifactRelativePath: (outRoot: string, filePath: string) => string;
  collectBundleFixturePath: (bundle: SmokeArtifactBundle) => string | null;
}): DatasetLineageRow[] {
  const rows: DatasetLineageRow[] = [];
  for (const bundle of input.bundles) {
    if (!input.isShotsDocLike(bundle.runtimeDoc)) {
      continue;
    }
    const runtimeDoc = bundle.runtimeDoc as JsonRecord & { shots: unknown[] };
    const datasetIds = uniqueStrings(
      recordList(runtimeDoc.shots).map((shot) => {
        const chart = isRecord(shot.chart) ? shot.chart : {};
        return str(chart.dataset_id) ?? str(chart.datasetId);
      })
    );
    const packIds = input.collectRuntimePackIdsFromShotsDoc(runtimeDoc);
    const beatIds = new Set<string>();
    const routeReasons = uniqueStrings(
      recordList(runtimeDoc.shots).flatMap((shot) => {
        const beats = Array.isArray(shot.beat_ids) ? shot.beat_ids : [];
        for (const beatId of beats) {
          const normalized = str(beatId);
          if (normalized) {
            beatIds.add(normalized);
          }
        }
        const shotGrammar = isRecord(shot.shot_grammar) ? shot.shot_grammar : {};
        return [str(shotGrammar.route_reason) ?? str(shot.route_reason)];
      })
    );
    const episodeInfo = isRecord(runtimeDoc.episode) ? runtimeDoc.episode : {};
    const baseDir = bundle.sidecarPlanPath ?? bundle.smokePath;
    const referenceLineage = input.collectReferenceLineage(bundle, baseDir);
    const schemaGaps = uniqueStrings([
      datasetIds.length > 0 ? "chart dataset version/hash is not recorded; showing dataset_id only" : "chart dataset ids are missing in runtime shots",
      str(episodeInfo.bible_ref) ? null : "episode.bible_ref is missing in runtime shots",
      packIds.length > 0 && referenceLineage.manifestPaths.length === 0
        ? "sidecar request does not expose generation manifest path for the character source"
        : null
    ]);
    rows.push({
      scenario: bundle.scenario,
      bundle: bundle.bundle,
      episodeId: bundle.episodeId,
      generatedAt: bundle.generatedAt,
      sourceLabel: bundle.source.label,
      sourcePath: bundle.source.outRoot,
      smokeArtifactPath: bundle.smokePath,
      artifactRelativePath: input.artifactRelativePath(bundle.source.outRoot, bundle.smokePath),
      bibleRef: str(episodeInfo.bible_ref) ?? "-",
      datasetIds,
      packIds,
      beatCount: beatIds.size,
      routeReasons,
      inputShotsPath: input.collectBundleFixturePath(bundle),
      runtimeShotsPath: bundle.runtimePath,
      renderLogPath: bundle.renderLogPath,
      qcReportPath: bundle.qcPath,
      sidecarPlanPath: bundle.sidecarPlanPath,
      renderModeArtifactPath: bundle.renderModePath,
      manifestPaths: referenceLineage.manifestPaths,
      selectedImagePaths: referenceLineage.selectedImagePaths,
      schemaGaps,
      rig: referenceLineage.rig
    });
  }

  rows.sort((left, right) => {
    const leftTime = new Date(left.generatedAt).getTime();
    const rightTime = new Date(right.generatedAt).getTime();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    if (left.bundle !== right.bundle) {
      return left.bundle.localeCompare(right.bundle);
    }
    return left.episodeId.localeCompare(right.episodeId);
  });
  return rows;
}
