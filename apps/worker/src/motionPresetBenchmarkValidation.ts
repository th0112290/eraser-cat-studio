import fs from "node:fs";
import path from "node:path";
import {
  ALL_MOTION_PROFILE_IDS,
  resolveMotionProfile,
  type ChannelVisualMotionProfileId,
  type ChannelVisualMotionPresetId
} from "@ec/profiles";

type MotionPresetBenchmarkRecordLike = {
  motionProfileId?: unknown;
  motionPreset?: unknown;
  passed?: unknown;
  failures?: unknown;
};

type MotionPresetBenchmarkFileLike = {
  generated_at?: unknown;
  record_count?: unknown;
  failed_count?: unknown;
  profiles?: unknown;
  records?: unknown;
};

export type MotionPresetBenchmarkValidationStatus =
  | "disabled"
  | "artifact_missing"
  | "invalid"
  | "artifact_too_old"
  | "profile_mismatch"
  | "record_mismatch"
  | "record_failed"
  | "ready";

export type MotionPresetBenchmarkValidationRecord = {
  motionProfileId: ChannelVisualMotionProfileId;
  motionPreset: ChannelVisualMotionPresetId;
  passed: boolean;
  failures: string[];
};

export type MotionPresetBenchmarkValidationReport = {
  schema_version: "1.0";
  generated_at: string;
  enabled: boolean;
  benchmark_path: string;
  benchmark_file_exists: boolean;
  status: MotionPresetBenchmarkValidationStatus;
  reason: string;
  ready: boolean;
  benchmark_generated_at: string | null;
  benchmark_age_hours: number | null;
  max_age_hours: number | null;
  expected_profile_ids: ChannelVisualMotionProfileId[];
  benchmark_profile_ids: string[];
  expected_record_count: number;
  observed_record_count: number;
  reported_record_count: number | null;
  reported_failed_count: number | null;
  missing_profiles: string[];
  unexpected_profiles: string[];
  duplicate_records: string[];
  missing_records: Array<{
    motionProfileId: ChannelVisualMotionProfileId;
    motionPreset: ChannelVisualMotionPresetId;
  }>;
  failed_records: MotionPresetBenchmarkValidationRecord[];
  issues: string[];
};

export const DEFAULT_MOTION_PRESET_BENCHMARK_MAX_AGE_HOURS = 168;

function parseTruthy(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function isMotionProfileId(value: unknown): value is ChannelVisualMotionProfileId {
  return typeof value === "string" && ALL_MOTION_PROFILE_IDS.includes(value as ChannelVisualMotionProfileId);
}

function isMotionPresetForProfile(
  motionProfileId: ChannelVisualMotionProfileId,
  motionPreset: unknown
): motionPreset is ChannelVisualMotionPresetId {
  return (
    typeof motionPreset === "string" &&
    resolveMotionProfile(motionProfileId).benchmarked_motion_presets.includes(motionPreset as ChannelVisualMotionPresetId)
  );
}

function resolveMotionBenchmarkEnabled(): boolean {
  if (typeof process.env.VIDEO_MOTION_PRESET_BENCHMARK_ENABLED !== "string") {
    return true;
  }
  return parseTruthy(process.env.VIDEO_MOTION_PRESET_BENCHMARK_ENABLED);
}

function resolveMotionBenchmarkMaxAgeHours(): number | null {
  const raw = Number.parseFloat(
    process.env.VIDEO_MOTION_PRESET_BENCHMARK_MAX_AGE_HOURS ?? String(DEFAULT_MOTION_PRESET_BENCHMARK_MAX_AGE_HOURS)
  );
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return raw;
}

function resolveDefaultMotionBenchmarkPath(repoRoot: string): string {
  const raw = process.env.VIDEO_MOTION_PRESET_BENCHMARK_FILE_PATH?.trim();
  if (raw) {
    return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
  }
  return path.resolve(repoRoot, "out", "motion_preset_benchmark.json");
}

function buildExpectedRecordPairs(): Array<{
  motionProfileId: ChannelVisualMotionProfileId;
  motionPreset: ChannelVisualMotionPresetId;
}> {
  return ALL_MOTION_PROFILE_IDS.flatMap((motionProfileId) =>
    resolveMotionProfile(motionProfileId).benchmarked_motion_presets.map((motionPreset) => ({
      motionProfileId,
      motionPreset
    }))
  );
}

function parseBenchmarkRecords(
  value: unknown
): {
  records: MotionPresetBenchmarkValidationRecord[];
  invalidCount: number;
} {
  if (!Array.isArray(value)) {
    return {
      records: [],
      invalidCount: 0
    };
  }

  const records: MotionPresetBenchmarkValidationRecord[] = [];
  let invalidCount = 0;

  for (const entry of value as MotionPresetBenchmarkRecordLike[]) {
    if (!isMotionProfileId(entry.motionProfileId)) {
      invalidCount += 1;
      continue;
    }
    if (!isMotionPresetForProfile(entry.motionProfileId, entry.motionPreset)) {
      invalidCount += 1;
      continue;
    }
    records.push({
      motionProfileId: entry.motionProfileId,
      motionPreset: entry.motionPreset,
      passed: entry.passed === true,
      failures: asStringArray(entry.failures)
    });
  }

  return {
    records,
    invalidCount
  };
}

export function validateMotionPresetBenchmark(input: {
  repoRoot: string;
  benchmarkPath?: string;
  now?: Date;
}): MotionPresetBenchmarkValidationReport {
  const enabled = resolveMotionBenchmarkEnabled();
  const benchmarkPath = input.benchmarkPath ?? resolveDefaultMotionBenchmarkPath(input.repoRoot);
  const maxAgeHours = resolveMotionBenchmarkMaxAgeHours();
  const expectedRecords = buildExpectedRecordPairs();
  const expectedRecordKeys = new Set(expectedRecords.map((record) => `${record.motionProfileId}::${record.motionPreset}`));
  const expectedProfileIds = [...ALL_MOTION_PROFILE_IDS];
  const benchmarkFileExists = fs.existsSync(benchmarkPath);
  const generatedAt = (input.now ?? new Date()).toISOString();

  if (!enabled) {
    return {
      schema_version: "1.0",
      generated_at: generatedAt,
      enabled,
      benchmark_path: benchmarkPath,
      benchmark_file_exists: benchmarkFileExists,
      status: "disabled",
      reason: "Motion preset benchmark validation is disabled by environment.",
      ready: false,
      benchmark_generated_at: null,
      benchmark_age_hours: null,
      max_age_hours: maxAgeHours,
      expected_profile_ids: expectedProfileIds,
      benchmark_profile_ids: [],
      expected_record_count: expectedRecords.length,
      observed_record_count: 0,
      reported_record_count: null,
      reported_failed_count: null,
      missing_profiles: expectedProfileIds,
      unexpected_profiles: [],
      duplicate_records: [],
      missing_records: expectedRecords,
      failed_records: [],
      issues: ["disabled"]
    };
  }

  if (!benchmarkFileExists) {
    return {
      schema_version: "1.0",
      generated_at: generatedAt,
      enabled,
      benchmark_path: benchmarkPath,
      benchmark_file_exists: false,
      status: "artifact_missing",
      reason: "Motion preset benchmark artifact was not found.",
      ready: false,
      benchmark_generated_at: null,
      benchmark_age_hours: null,
      max_age_hours: maxAgeHours,
      expected_profile_ids: expectedProfileIds,
      benchmark_profile_ids: [],
      expected_record_count: expectedRecords.length,
      observed_record_count: 0,
      reported_record_count: null,
      reported_failed_count: null,
      missing_profiles: expectedProfileIds,
      unexpected_profiles: [],
      duplicate_records: [],
      missing_records: expectedRecords,
      failed_records: [],
      issues: ["artifact_missing"]
    };
  }

  const raw = JSON.parse(fs.readFileSync(benchmarkPath, "utf8")) as MotionPresetBenchmarkFileLike;
  const parsedGeneratedAt = typeof raw.generated_at === "string" && raw.generated_at.trim().length > 0 ? raw.generated_at.trim() : null;
  const benchmarkDate = parsedGeneratedAt ? new Date(parsedGeneratedAt) : null;
  const stat = fs.statSync(benchmarkPath);
  const sourceDate = benchmarkDate && Number.isFinite(benchmarkDate.getTime()) ? benchmarkDate : new Date(stat.mtimeMs);
  const benchmarkAgeHours = Math.max(0, ((input.now ?? new Date()).getTime() - sourceDate.getTime()) / 3600000);
  const benchmarkProfileIds = asStringArray(raw.profiles);
  const { records, invalidCount } = parseBenchmarkRecords(raw.records);
  const observedRecordCount = records.length;
  const reportedRecordCount = asFiniteNumber(raw.record_count);
  const reportedFailedCount = asFiniteNumber(raw.failed_count);
  const missingProfiles = expectedProfileIds.filter((profileId) => !benchmarkProfileIds.includes(profileId));
  const unexpectedProfiles = benchmarkProfileIds.filter((profileId) => !expectedProfileIds.includes(profileId as ChannelVisualMotionProfileId));
  const duplicateRecords: string[] = [];
  const seenRecordKeys = new Set<string>();

  for (const record of records) {
    const key = `${record.motionProfileId}::${record.motionPreset}`;
    if (seenRecordKeys.has(key)) {
      duplicateRecords.push(key);
      continue;
    }
    seenRecordKeys.add(key);
  }

  const missingRecords = expectedRecords.filter(
    (record) => !seenRecordKeys.has(`${record.motionProfileId}::${record.motionPreset}`)
  );
  const failedRecords = records.filter((record) => !record.passed || record.failures.length > 0);
  const issues: string[] = [];

  if (invalidCount > 0) {
    issues.push(`invalid_records:${invalidCount}`);
  }
  if (maxAgeHours !== null && benchmarkAgeHours > maxAgeHours) {
    issues.push(`artifact_too_old:${benchmarkAgeHours.toFixed(2)}>${maxAgeHours}`);
  }
  if (missingProfiles.length > 0 || unexpectedProfiles.length > 0) {
    issues.push(`profile_mismatch:${missingProfiles.length}/${unexpectedProfiles.length}`);
  }
  if (
    duplicateRecords.length > 0 ||
    missingRecords.length > 0 ||
    observedRecordCount !== expectedRecords.length ||
    (reportedRecordCount !== null && reportedRecordCount !== observedRecordCount)
  ) {
    issues.push(
      `record_mismatch:observed=${observedRecordCount}:expected=${expectedRecords.length}:missing=${missingRecords.length}:duplicate=${duplicateRecords.length}`
    );
  }
  if (
    failedRecords.length > 0 ||
    (reportedFailedCount !== null && reportedFailedCount !== failedRecords.length)
  ) {
    issues.push(`record_failed:${failedRecords.length}`);
  }

  let status: MotionPresetBenchmarkValidationStatus = "ready";
  let reason = "Motion preset benchmark artifact is ready.";

  if (invalidCount > 0) {
    status = "invalid";
    reason = `Motion preset benchmark contains ${invalidCount} invalid record(s).`;
  } else if (maxAgeHours !== null && benchmarkAgeHours > maxAgeHours) {
    status = "artifact_too_old";
    reason = `Motion preset benchmark age ${benchmarkAgeHours.toFixed(2)}h exceeds max age ${maxAgeHours}h.`;
  } else if (missingProfiles.length > 0 || unexpectedProfiles.length > 0) {
    status = "profile_mismatch";
    reason = `Motion preset benchmark profile set does not match current profiles. missing=${missingProfiles.join(",") || "none"} unexpected=${unexpectedProfiles.join(",") || "none"}`;
  } else if (
    duplicateRecords.length > 0 ||
    missingRecords.length > 0 ||
    observedRecordCount !== expectedRecords.length ||
    (reportedRecordCount !== null && reportedRecordCount !== observedRecordCount)
  ) {
    status = "record_mismatch";
    reason = `Motion preset benchmark coverage mismatch. observed=${observedRecordCount} expected=${expectedRecords.length} missing=${missingRecords.length} duplicate=${duplicateRecords.length}`;
  } else if (failedRecords.length > 0 || (reportedFailedCount !== null && reportedFailedCount !== failedRecords.length)) {
    status = "record_failed";
    reason = `Motion preset benchmark contains failing records=${failedRecords.length}.`;
  }

  return {
    schema_version: "1.0",
    generated_at: generatedAt,
    enabled,
    benchmark_path: benchmarkPath,
    benchmark_file_exists: true,
    status,
    reason,
    ready: status === "ready",
    benchmark_generated_at: parsedGeneratedAt,
    benchmark_age_hours: Number(benchmarkAgeHours.toFixed(2)),
    max_age_hours: maxAgeHours,
    expected_profile_ids: expectedProfileIds,
    benchmark_profile_ids: benchmarkProfileIds,
    expected_record_count: expectedRecords.length,
    observed_record_count: observedRecordCount,
    reported_record_count: reportedRecordCount,
    reported_failed_count: reportedFailedCount,
    missing_profiles: missingProfiles,
    unexpected_profiles: unexpectedProfiles,
    duplicate_records: duplicateRecords,
    missing_records: missingRecords,
    failed_records: failedRecords,
    issues
  };
}
