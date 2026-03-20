import path from "node:path";

type JsonRecord = Record<string, unknown>;

export type BenchmarkArtifactSource = {
  label: string;
  outRoot: string;
};

export type SmokeArtifactBundle = {
  source: BenchmarkArtifactSource;
  smokePath: string;
  smokeDoc: JsonRecord;
  generatedAt: string;
  scenario: string;
  bundle: string;
  episodeId: string;
  runtimePath: string | null;
  runtimeDoc: unknown | null;
  sidecarPlanPath: string | null;
  sidecarPlanDoc: unknown | null;
  renderModePath: string | null;
  renderModeDoc: unknown | null;
  qcPath: string | null;
  qcDoc: unknown | null;
  renderLogPath: string | null;
  renderLogDoc: unknown | null;
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

export function collectSmokeArtifactBundlesWithResolvers(input: {
  sources: BenchmarkArtifactSource[];
  pathExists: (filePath: string) => boolean;
  findFilesByName: (rootDir: string, targetName: string, maxDepth?: number) => string[];
  readJsonFileSafe: (filePath: string) => unknown | null;
  normalizeJsonArtifactPath: (source: BenchmarkArtifactSource, candidatePath: unknown) => string | null;
  artifactRelativePath: (outRoot: string, filePath: string) => string;
}): SmokeArtifactBundle[] {
  const bundles: SmokeArtifactBundle[] = [];
  const seen = new Set<string>();
  for (const source of input.sources) {
    if (!input.pathExists(source.outRoot)) {
      continue;
    }
    const smokePaths = input.findFilesByName(source.outRoot, "smoke_report.json", 8);
    for (const smokePath of smokePaths) {
      const key = path.resolve(smokePath).toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const smokeDoc = input.readJsonFileSafe(smokePath);
      if (!isRecord(smokeDoc)) {
        continue;
      }
      const runtimePath =
        input.normalizeJsonArtifactPath(source, smokeDoc.runtime_fixture_path) ??
        input.normalizeJsonArtifactPath(source, smokeDoc.input_path);
      const sidecarPlanPath = input.normalizeJsonArtifactPath(source, smokeDoc.sidecar_plan_path);
      const renderModePath = input.normalizeJsonArtifactPath(source, smokeDoc.shot_render_mode_report_path);
      const qcPath = input.normalizeJsonArtifactPath(source, smokeDoc.qc_report_path);
      const renderLogPath = input.normalizeJsonArtifactPath(source, smokeDoc.render_log_path);
      bundles.push({
        source,
        smokePath,
        smokeDoc,
        generatedAt: str(smokeDoc.generated_at) ?? "-",
        scenario: str(smokeDoc.smoke_label) ?? input.artifactRelativePath(source.outRoot, path.dirname(smokePath)),
        bundle: str(smokeDoc.profile_bundle) ?? str(smokeDoc.channel_domain) ?? "-",
        episodeId: str(smokeDoc.episode_id) ?? "-",
        runtimePath,
        runtimeDoc: runtimePath ? input.readJsonFileSafe(runtimePath) : null,
        sidecarPlanPath,
        sidecarPlanDoc: sidecarPlanPath ? input.readJsonFileSafe(sidecarPlanPath) : null,
        renderModePath,
        renderModeDoc: renderModePath ? input.readJsonFileSafe(renderModePath) : null,
        qcPath,
        qcDoc: qcPath ? input.readJsonFileSafe(qcPath) : null,
        renderLogPath,
        renderLogDoc: renderLogPath ? input.readJsonFileSafe(renderLogPath) : null
      });
    }
  }
  bundles.sort((left, right) => {
    const leftTime = new Date(left.generatedAt).getTime();
    const rightTime = new Date(right.generatedAt).getTime();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    if (left.bundle !== right.bundle) {
      return left.bundle.localeCompare(right.bundle);
    }
    return left.scenario.localeCompare(right.scenario);
  });
  return bundles;
}
