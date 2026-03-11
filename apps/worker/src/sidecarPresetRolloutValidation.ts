import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { inspectRuntimeSidecarPresetRollout, type SidecarPresetRolloutInspection } from "./sidecarPresetRollout";
import {
  parseRuntimeRolloutSummaryCandidate,
  type RuntimeRolloutArtifactTarget
} from "./sidecarPresetRolloutArtifact";
import {
  parseRuntimeSidecarPresetMultiChannelCrossChannelComparison,
  type RuntimeSidecarPresetMultiChannelCrossChannelComparison
} from "./sidecarMultiChannelRolloutArtifact";

type RolloutFileLike = {
  rollout_kind?: unknown;
  default_target?: unknown;
  source_matrix_path?: unknown;
  source_matrix_sha256?: unknown;
  targets?: {
    overall?: unknown;
    balanced?: unknown;
    strict?: unknown;
  };
};

type MultiChannelRolloutFileLike = {
  rollout_kind?: unknown;
  default_bundle?: unknown;
  source_summary_path?: unknown;
  cross_channel_comparison?: unknown;
  bundles?: {
    economy?: unknown;
    medical?: unknown;
  };
};

type EnvMap = Record<string, string | null>;

type RolloutChannelDomain = "economy" | "medical";

type RuntimeSidecarPresetRolloutValidationTargets = {
  overall: ReturnType<typeof parseRuntimeRolloutSummaryCandidate>;
  balanced: ReturnType<typeof parseRuntimeRolloutSummaryCandidate>;
  strict: ReturnType<typeof parseRuntimeRolloutSummaryCandidate>;
};

export type RuntimeSidecarPresetRolloutValidationBundleReport = {
  channel_domain: RolloutChannelDomain | null;
  default_target: RuntimeRolloutArtifactTarget;
  targets: RuntimeSidecarPresetRolloutValidationTargets;
  source_matrix_path: string | null;
  source_matrix_exists: boolean;
  source_matrix_sha256: string | null;
  source_matrix_sha256_actual: string | null;
  source_matrix_sha256_matches: boolean | null;
  inspection: SidecarPresetRolloutInspection;
  ready: boolean;
};

export type RuntimeSidecarPresetRolloutValidationCrossChannelReport = {
  status: "shared" | "diverged" | "insufficient" | "unknown";
  shared_best_triplet: boolean | null;
  divergence_level: "none" | "minor" | "moderate" | "major" | "critical" | "insufficient" | "n/a" | null;
  differing_axes: Array<"controlnet" | "impact" | "qc">;
  score_gap: number | null;
  economy_score: number | null;
  medical_score: number | null;
  economy_triplet: {
    controlnet_preset: string | null;
    impact_preset: string | null;
    qc_preset: string | null;
  } | null;
  medical_triplet: {
    controlnet_preset: string | null;
    impact_preset: string | null;
    qc_preset: string | null;
  } | null;
  recommendation: string | null;
};

export type RuntimeSidecarPresetRolloutValidationReport = {
  schema_version: "1.0";
  generated_at: string;
  rollout_mode: "single" | "multichannel";
  rollout_path: string;
  rollout_file_exists: boolean;
  env_file_path: string;
  env_file_exists: boolean;
  default_target: RuntimeRolloutArtifactTarget;
  default_bundle: RolloutChannelDomain | null;
  targets: RuntimeSidecarPresetRolloutValidationTargets | null;
  source_matrix_path: string | null;
  source_matrix_exists: boolean;
  source_matrix_sha256: string | null;
  source_matrix_sha256_actual: string | null;
  source_matrix_sha256_matches: boolean | null;
  source_summary_path: string | null;
  source_summary_exists: boolean;
  cross_channel: RuntimeSidecarPresetRolloutValidationCrossChannelReport | null;
  inspection: SidecarPresetRolloutInspection;
  bundles: {
    economy: RuntimeSidecarPresetRolloutValidationBundleReport | null;
    medical: RuntimeSidecarPresetRolloutValidationBundleReport | null;
  } | null;
  ready: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function readEnvFile(filePath: string): EnvMap {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const values: EnvMap = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key.length > 0) {
      values[key] = value;
    }
  }
  return values;
}

function withEnvOverrides<T>(overrides: EnvMap, task: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (typeof value === "string") {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
  try {
    return task();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (typeof value === "string") {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}

function resolveDefaultTarget(value: unknown): RuntimeRolloutArtifactTarget {
  return value === "balanced" || value === "strict" ? value : "overall";
}

function resolveDefaultBundle(value: unknown): RolloutChannelDomain {
  return value === "medical" ? "medical" : "economy";
}

function resolveCrossChannelStatus(
  value: RuntimeSidecarPresetMultiChannelCrossChannelComparison | null
): RuntimeSidecarPresetRolloutValidationCrossChannelReport | null {
  if (!value) {
    return null;
  }
  const status: RuntimeSidecarPresetRolloutValidationCrossChannelReport["status"] =
    value.shared_best_triplet === true
      ? "shared"
      : value.divergence_level === "insufficient" ||
          (!value.economy_triplet && !value.medical_triplet)
        ? "insufficient"
        : value.economy_triplet || value.medical_triplet
          ? "diverged"
          : "unknown";
  return {
    status,
    shared_best_triplet: value.shared_best_triplet,
    divergence_level: value.divergence_level,
    differing_axes: value.differing_axes,
    score_gap: value.score_gap,
    economy_score: value.economy_score,
    medical_score: value.medical_score,
    economy_triplet: value.economy_triplet,
    medical_triplet: value.medical_triplet,
    recommendation: value.recommendation
  };
}

function resolveDefaultRolloutPath(repoRoot: string): string {
  const multiChannelPath = process.env.VIDEO_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_FILE_PATH?.trim();
  if (multiChannelPath) {
    return path.isAbsolute(multiChannelPath) ? multiChannelPath : path.resolve(repoRoot, multiChannelPath);
  }
  const raw = process.env.VIDEO_SIDECAR_PRESET_ROLLOUT_FILE_PATH?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
  }
  return path.resolve(repoRoot, "out", "preset_benchmarks", "video_i2v", "runtime_sidecar_preset_rollout.json");
}

function buildTargets(rollout: RolloutFileLike): RuntimeSidecarPresetRolloutValidationTargets {
  const targetsRecord = asRecord(rollout.targets ?? null);
  return {
    overall: parseRuntimeRolloutSummaryCandidate(targetsRecord?.overall),
    balanced: parseRuntimeRolloutSummaryCandidate(targetsRecord?.balanced),
    strict: parseRuntimeRolloutSummaryCandidate(targetsRecord?.strict)
  };
}

function validateSingleRolloutBundle(input: {
  repoRoot: string;
  envOverrides: EnvMap;
  rollout: RolloutFileLike;
  channelDomain: RolloutChannelDomain | null;
}): RuntimeSidecarPresetRolloutValidationBundleReport {
  const rolloutRecord = asRecord(input.rollout);
  const defaultTarget = resolveDefaultTarget(input.rollout.default_target);
  const targets = buildTargets(input.rollout);
  const sourceMatrixPath = asString(rolloutRecord?.source_matrix_path ?? null);
  const sourceMatrixExists = sourceMatrixPath ? fs.existsSync(sourceMatrixPath) : false;
  const sourceMatrixSha256 = asString(rolloutRecord?.source_matrix_sha256 ?? null);
  const actualMatrixSha256 = sourceMatrixExists && sourceMatrixPath ? sha256File(sourceMatrixPath) : null;
  const sourceMatrixSha256Matches =
    sourceMatrixSha256 && actualMatrixSha256 ? sourceMatrixSha256 === actualMatrixSha256 : null;
  const inspection = withEnvOverrides(
    {
      ...input.envOverrides,
      VIDEO_SIDECAR_PRESET_ROLLOUT_ENABLED: "true",
      VIDEO_SIDECAR_PRESET_ROLLOUT_TARGET: defaultTarget
    },
    () =>
      inspectRuntimeSidecarPresetRollout({
        repoRoot: input.repoRoot,
        controlnetPreset: "pose_depth_balance_v1",
        impactPreset: "broadcast_cleanup_v1",
        qcPreset: "broadcast_balanced_v1",
        channelDomain: input.channelDomain,
        renderMode: "generative_broll",
        shotType: "broll",
        cameraPreset: "medium",
        policyTags: []
      })
  );
  const ready =
    Boolean(targets[defaultTarget]) &&
    (inspection.status === "applied" || inspection.status === "no_change") &&
    (sourceMatrixPath === null || sourceMatrixExists) &&
    (sourceMatrixSha256Matches === null || sourceMatrixSha256Matches === true);
  return {
    channel_domain: input.channelDomain,
    default_target: defaultTarget,
    targets,
    source_matrix_path: sourceMatrixPath,
    source_matrix_exists: sourceMatrixExists,
    source_matrix_sha256: sourceMatrixSha256,
    source_matrix_sha256_actual: actualMatrixSha256,
    source_matrix_sha256_matches: sourceMatrixSha256Matches,
    inspection,
    ready
  };
}

export function validateRuntimeSidecarPresetRollout(input: {
  repoRoot: string;
  rolloutPath?: string;
  envFilePath?: string;
}): RuntimeSidecarPresetRolloutValidationReport {
  const rolloutPath = input.rolloutPath ?? resolveDefaultRolloutPath(input.repoRoot);
  const envFilePath =
    input.envFilePath ?? path.join(path.dirname(rolloutPath), `${path.basename(rolloutPath, ".json")}.env`);
  const rolloutFileExists = fs.existsSync(rolloutPath);
  const envFileExists = fs.existsSync(envFilePath);
  const envFileValues = readEnvFile(envFilePath);
  const rolloutRaw = rolloutFileExists ? JSON.parse(fs.readFileSync(rolloutPath, "utf8")) : {};
  const rolloutRecord = asRecord(rolloutRaw);
  const rolloutMode =
    asString(rolloutRecord?.rollout_kind) === "sidecar_preset_runtime_multichannel" ? "multichannel" : "single";

  if (rolloutMode === "multichannel") {
    const multiChannelRollout = rolloutRaw as MultiChannelRolloutFileLike;
    const bundlesRecord = asRecord(multiChannelRollout.bundles ?? null);
    const defaultBundle = resolveDefaultBundle(multiChannelRollout.default_bundle);
    const envOverridesBase: EnvMap = {
      ...envFileValues,
      VIDEO_SIDECAR_PRESET_ROLLOUT_FILE_PATH: null,
      VIDEO_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_FILE_PATH: rolloutPath
    };
    const economyBundleRecord = asRecord(bundlesRecord?.economy);
    const medicalBundleRecord = asRecord(bundlesRecord?.medical);
    const economyBundle = economyBundleRecord
      ? validateSingleRolloutBundle({
          repoRoot: input.repoRoot,
          envOverrides: envOverridesBase,
          rollout: economyBundleRecord as RolloutFileLike,
          channelDomain: "economy"
        })
      : null;
    const medicalBundle = medicalBundleRecord
      ? validateSingleRolloutBundle({
          repoRoot: input.repoRoot,
          envOverrides: envOverridesBase,
          rollout: medicalBundleRecord as RolloutFileLike,
          channelDomain: "medical"
        })
      : null;
    const selectedBundle =
      (defaultBundle === "medical" ? medicalBundle : economyBundle) ??
      economyBundle ??
      medicalBundle;
    const sourceSummaryPath = asString(rolloutRecord?.source_summary_path ?? null);
    const sourceSummaryExists = sourceSummaryPath ? fs.existsSync(sourceSummaryPath) : false;
    const crossChannel = resolveCrossChannelStatus(
      parseRuntimeSidecarPresetMultiChannelCrossChannelComparison(rolloutRecord?.cross_channel_comparison ?? null)
    );
    const bundleReports = [economyBundle, medicalBundle].filter(
      (bundle): bundle is RuntimeSidecarPresetRolloutValidationBundleReport => Boolean(bundle)
    );
    return {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      rollout_mode: "multichannel",
      rollout_path: rolloutPath,
      rollout_file_exists: rolloutFileExists,
      env_file_path: envFilePath,
      env_file_exists: envFileExists,
      default_target: selectedBundle?.default_target ?? "overall",
      default_bundle: defaultBundle,
      targets: selectedBundle?.targets ?? null,
      source_matrix_path: selectedBundle?.source_matrix_path ?? null,
      source_matrix_exists: selectedBundle?.source_matrix_exists ?? false,
      source_matrix_sha256: selectedBundle?.source_matrix_sha256 ?? null,
      source_matrix_sha256_actual: selectedBundle?.source_matrix_sha256_actual ?? null,
      source_matrix_sha256_matches: selectedBundle?.source_matrix_sha256_matches ?? null,
      source_summary_path: sourceSummaryPath,
      source_summary_exists: sourceSummaryExists,
      cross_channel: crossChannel,
      inspection: selectedBundle?.inspection ?? {
        enabled: false,
        status: "artifact_missing",
        reason: "No multichannel rollout bundle could be validated.",
        requestedTarget: "auto",
        resolvedTarget: "overall",
        rolloutSourcePath: rolloutPath,
        rolloutSourceKind: "file",
        artifactAgeHours: null,
        minScore: 85,
        maxAgeHours: 168,
        allowedVerdicts: ["recommended"],
        preserveControlnet: true,
        mustPreserveControlnet: false,
        candidate: null,
        currentPresets: {
          controlnetPreset: "pose_depth_balance_v1",
          impactPreset: "broadcast_cleanup_v1",
          qcPreset: "broadcast_balanced_v1"
        },
        nextPresets: null,
        resolution: null
      },
      bundles: {
        economy: economyBundle,
        medical: medicalBundle
      },
      ready:
        bundleReports.length > 0 &&
        bundleReports.every((bundle) => bundle.ready) &&
        selectedBundle !== null &&
        (sourceSummaryPath === null || sourceSummaryExists)
    };
  }

  const singleRollout = rolloutRaw as RolloutFileLike;
  const bundle = validateSingleRolloutBundle({
    repoRoot: input.repoRoot,
    envOverrides: {
      ...envFileValues,
      VIDEO_SIDECAR_PRESET_ROLLOUT_FILE_PATH: rolloutPath,
      VIDEO_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_FILE_PATH: null
    },
    rollout: singleRollout,
    channelDomain: null
  });
  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    rollout_mode: "single",
    rollout_path: rolloutPath,
    rollout_file_exists: rolloutFileExists,
    env_file_path: envFilePath,
    env_file_exists: envFileExists,
    default_target: bundle.default_target,
    default_bundle: null,
    targets: bundle.targets,
    source_matrix_path: bundle.source_matrix_path,
    source_matrix_exists: bundle.source_matrix_exists,
    source_matrix_sha256: bundle.source_matrix_sha256,
    source_matrix_sha256_actual: bundle.source_matrix_sha256_actual,
    source_matrix_sha256_matches: bundle.source_matrix_sha256_matches,
    source_summary_path: null,
    source_summary_exists: false,
    cross_channel: null,
    inspection: bundle.inspection,
    bundles: null,
    ready: bundle.ready
  };
}
