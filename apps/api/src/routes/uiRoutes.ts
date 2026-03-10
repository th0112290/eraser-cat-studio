
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createValidator, sha256Hex, stableStringify } from "@ec/shared";
import type { EpisodeJobPayload } from "@ec/shared";
import { apiQueueRetentionOptions } from "../services/jobRetention";
import { renderUiPage } from "./ui/uiPage";
import {
  buildBenchmarksPageBody,
  buildArtifactsPageBody,
  buildHitlPageBody,
  buildJobDetailPageBody,
  buildJobsPageBody,
  buildPublishPageBody,
  buildRolloutsPageBody
} from "./ui/pages/operationsPages";
import { buildDashboardPageBody, buildEpisodesPageBody } from "./ui/pages/dashboardEpisodesPages";

type JsonRecord = Record<string, unknown>;
type UiBadgeTone = "ok" | "warn" | "bad" | "muted";
type RegisterUiRoutesInput = {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue: Queue;
  queueName: string;
};

type ChannelBibleState = {
  source: string;
  channelId: string;
  version: number;
  schemaId: string;
  jsonText: string;
  isActive: boolean;
  message?: string;
  error?: string;
  validationErrors?: string[];
};

type RolloutArtifactSource = {
  label: string;
  outRoot: string;
};

type RolloutSourceStatus = {
  label: string;
  outRoot: string;
  exists: boolean;
  recordCount: number;
  latestGeneratedAt: string | null;
};

type RolloutSignal = {
  sortGroup: number;
  kind: string;
  scope: string;
  target: string;
  status: string;
  tone: UiBadgeTone;
  score: string;
  verdict: string;
  reason: string;
  generatedAt: string;
  sourceLabel: string;
  sourcePath: string;
  artifactPath: string;
  artifactRelativePath: string;
};

type BenchmarkScenarioView = {
  benchmarkName: string;
  benchmarkKind: string;
  backend: string;
  renderer: string;
  status: string;
  tone: UiBadgeTone;
  latencyMs: string;
  acceptanceRate: string;
  failureRate: string;
  generatedAt: string;
  notes: string;
  sourceLabel: string;
  sourcePath: string;
  matrixArtifactPath: string;
  detailArtifactPath: string;
  smokeArtifactPath: string | null;
  planArtifactPath: string | null;
  candidateCompareItems: Array<{ label: string; path: string }>;
  artifactRelativePath: string;
};

type RegressionReportView = {
  benchmarkName: string;
  bundlePath: string;
  episodeId: string;
  status: string;
  tone: UiBadgeTone;
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

type ProfileBrowserBundleCard = {
  bundle: string;
  channelDomain: string;
  studioProfileId: string;
  channelProfileId: string;
  mascotProfileId: string;
  studioLabel: string;
  channelLabel: string;
  mascotLabel: string;
  tone: string;
  pacing: string;
  infoPriority: string;
  finishProfileId: string;
  impactPreset: string;
  qcPreset: string;
  insertSummary: string;
  gestureSummary: string;
  generatedAt: string;
  sourceLabel: string;
  sourcePath: string;
  smokeArtifactPath: string;
  smokeArtifactRelativePath: string;
  renderLogPath: string | null;
};

type ProfileBrowserEvidenceRow = {
  scenario: string;
  bundle: string;
  status: string;
  tone: UiBadgeTone;
  studioProfileId: string;
  channelProfileId: string;
  mascotProfileId: string;
  profileSummary: string;
  runtimeSummary: string;
  generatedAt: string;
  sourceLabel: string;
  sourcePath: string;
  smokeArtifactPath: string;
  renderLogPath: string | null;
  artifactRelativePath: string;
};

const validator = createValidator();
const DEFAULT_CHANNEL_BIBLE_SCHEMA = "channel_bible.schema.json";
const DEMO_USER_EMAIL = "demo.extreme@example.com";
const DEMO_USER_NAME = "demo-extreme";
const DEMO_CHANNEL_NAME = "Extreme Demo Channel";
const DEFAULT_STYLE_PRESET_ID = "AUTO";
const DEFAULT_HOOK_BOOST = 0.55;
const AB_DEFAULT_STYLE_A = "NEWS_CLEAN";
const AB_DEFAULT_STYLE_B = "CHAOS_ENERGY";
const PREVIEW_JOB_DEFAULT_ATTEMPTS = 2;
const PREVIEW_JOB_DEFAULT_BACKOFF_MS = 1000;
const STYLE_PRESET_VALUES = [
  "AUTO",
  "NEWS_CLEAN",
  "DOCU_CALM",
  "FINANCE_TRADER",
  "TIKTOK_PUNCH",
  "WHITEBOARD_EXPLAIN",
  "COMIC_POP",
  "RETRO_VHS",
  "CINEMATIC_DRAMA",
  "COZY_STUDY",
  "GAME_HUD",
  "CORPORATE_DECK",
  "CHAOS_ENERGY"
] as const;
const CONCRETE_STYLE_VALUES = STYLE_PRESET_VALUES.filter((value) => value !== "AUTO");
const RUN_PROFILE_VALUES = ["preview", "full", "render_only"] as const;
type RunProfileId = (typeof RUN_PROFILE_VALUES)[number];
const RUN_PROFILE_RETURN_VALUES = ["jobs", "episodes", "episode"] as const;
type RunProfileReturnTarget = (typeof RUN_PROFILE_RETURN_VALUES)[number];
const RUN_PROFILE_DEDUP_WINDOW_MS = 10_000;
const runProfileDedupCache = new Map<string, { at: number; jobId: string | null }>();
const runProfileDedupStats = { hits: 0, enqueues: 0 };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function esc(value: unknown): string {
  const text = String(value ?? "");
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function q(requestQuery: unknown, key: string): string | undefined {
  if (!isRecord(requestQuery)) return undefined;
  const value = requestQuery[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function b(body: unknown, key: string): string | undefined {
  if (!isRecord(body)) return undefined;
  const value = body[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function flashHtml(query: unknown): string {
  const message = q(query, "message");
  const error = q(query, "error");
  return `${message ? `<div class="notice">${esc(message)}</div>` : ""}${error ? `<div class="error">${esc(error)}</div>` : ""}`;
}

function n(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function bool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const x = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(x)) return true;
    if (["0", "false", "no", "off"].includes(x)) return false;
  }
  return fallback;
}

function csv(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((v) => (typeof v === "string" ? v.trim() : "")).filter((v) => v.length > 0)));
  }
  if (typeof value === "string") {
    return Array.from(new Set(value.split(",").map((v) => v.trim()).filter((v) => v.length > 0)));
  }
  return [];
}

function normalizeStylePresetId(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_STYLE_PRESET_ID;
  }
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return DEFAULT_STYLE_PRESET_ID;
  }
  if (!STYLE_PRESET_VALUES.includes(normalized as (typeof STYLE_PRESET_VALUES)[number])) {
    return DEFAULT_STYLE_PRESET_ID;
  }
  return normalized;
}

function parseHookBoost(value: unknown, fallback = DEFAULT_HOOK_BOOST): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
  }
  return fallback;
}

function readEpisodeStyleConfig(episode: JsonRecord): { stylePresetId: string; hookBoost: number } {
  const snapshot = isRecord(episode.datasetVersionSnapshot) ? episode.datasetVersionSnapshot : {};
  const style = isRecord(snapshot.style) ? snapshot.style : {};
  return {
    stylePresetId: normalizeStylePresetId(style.stylePresetId),
    hookBoost: parseHookBoost(style.hookBoost, DEFAULT_HOOK_BOOST)
  };
}

function pipelineFromMode(mode: string | undefined): JsonRecord | undefined {
  if (!mode) {
    return undefined;
  }

  const normalized = mode.trim().toLowerCase();
  if (normalized === "preview") {
    return {
      stopAfterPreview: true,
      autoRenderFinal: false
    };
  }

  if (normalized === "full") {
    return {
      stopAfterPreview: false,
      autoRenderFinal: true
    };
  }

  return undefined;
}

function normalizeRunProfile(value: unknown): RunProfileId {
  if (typeof value !== "string") {
    return "preview";
  }
  const normalized = value.trim().toLowerCase();
  if (RUN_PROFILE_VALUES.includes(normalized as RunProfileId)) {
    return normalized as RunProfileId;
  }
  return "preview";
}

function runProfileToEnqueue(profile: RunProfileId): { jobType: string; pipeline?: JsonRecord; title: string } {
  if (profile === "full") {
    return {
      jobType: "GENERATE_BEATS",
      pipeline: pipelineFromMode("full"),
      title: "Full pipeline (final + package)"
    };
  }
  if (profile === "render_only") {
    return {
      jobType: "RENDER_PREVIEW",
      title: "Render preview only"
    };
  }
  return {
    jobType: "GENERATE_BEATS",
    pipeline: pipelineFromMode("preview"),
    title: "Preview pipeline"
  };
}

function normalizeRunProfileReturnTarget(value: unknown): RunProfileReturnTarget {
  if (typeof value !== "string") {
    return "jobs";
  }
  const normalized = value.trim().toLowerCase();
  if (RUN_PROFILE_RETURN_VALUES.includes(normalized as RunProfileReturnTarget)) {
    return normalized as RunProfileReturnTarget;
  }
  return "jobs";
}

function runProfileFailureHint(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("shots.json")) {
    return "Hint: run COMPILE_SHOTS first to generate shots.json.";
  }
  if (text.includes("redis") || text.includes("queue") || text.includes("503") || text.includes("unavailable")) {
    return "Hint: check queue/redis status and verify /ui/health.";
  }
  if (text.includes("preview") || text.includes("render")) {
    return "Hint: render step failed. Check lastError/logs on /ui/jobs.";
  }
  return "Hint: check failed job logs on /ui/jobs, then retry.";
}

function runProfileDedupKey(input: {
  episodeId: string;
  profile: RunProfileId;
  stylePresetId: string;
  hookBoost: number;
}): string {
  return [
    input.episodeId.trim(),
    input.profile,
    input.stylePresetId.trim().toUpperCase(),
    input.hookBoost.toFixed(2)
  ].join("|");
}

function cleanupRunProfileDedupCache(nowMs: number): void {
  const ttl = RUN_PROFILE_DEDUP_WINDOW_MS * 3;
  for (const [key, value] of runProfileDedupCache.entries()) {
    if (nowMs - value.at > ttl) {
      runProfileDedupCache.delete(key);
    }
  }
}

function getRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../../");
}

function getOutRoot(): string {
  return path.join(getRepoRoot(), "out");
}

function getEpisodeOutPaths(episodeId: string) {
  const outDir = path.join(getOutRoot(), episodeId);
  return {
    outDir,
    beats: path.join(outDir, "beats.json"),
    shots: path.join(outDir, "shots.json"),
    runtimeShots: path.join(outDir, "runtime_shots.json"),
    preview: path.join(outDir, "preview.mp4"),
    final: path.join(outDir, "final.mp4"),
    qc: path.join(outDir, "qc_report.json"),
    renderLog: path.join(outDir, "render_log.json"),
    sidecarPlan: path.join(outDir, "shot_sidecar_plan.json"),
    shotRenderModeReport: path.join(outDir, "shot_render_mode_report.json")
  };
}

function toEpisodeArtifactUrl(episodeId: string, filename: string): string {
  return `/artifacts/${encodeURIComponent(episodeId)}/${encodeURIComponent(filename)}`;
}

function readJsonFileSafe(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function readTextFileSafe(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function compact(parts: Array<string | null | undefined>, separator = " | "): string {
  return parts
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
    .join(separator);
}

function formatNumber(value: unknown, digits = 2): string {
  const parsed = num(value);
  if (parsed === null) return "-";
  return parsed.toFixed(digits).replace(/\.?0+$/, "");
}

function formatPercent(value: unknown, digits = 0): string {
  const parsed = num(value);
  if (parsed === null) return "-";
  const normalized = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
  return `${normalized.toFixed(digits).replace(/\.?0+$/, "")}%`;
}

function firstMeaningfulLine(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line ?? null;
}

function previewStrings(value: unknown, limit = 3): string | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((entry) => str(entry))
    .filter((entry): entry is string => Boolean(entry));
  if (items.length === 0) return null;
  const preview = items.slice(0, limit).map((entry) => humanizeRolloutReason(entry)).join(", ");
  return items.length > limit ? `${preview} (+${items.length - limit})` : preview;
}

function humanizeRolloutReason(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("score_below_min:")) {
    return trimmed.replace("score_below_min:", "score below min ");
  }
  if (trimmed.startsWith("below_min_score:")) {
    return trimmed.replace("below_min_score:", "below min score ");
  }
  if (trimmed.startsWith("verdict_blocked:")) {
    return trimmed.replace("verdict_blocked:", "verdict blocked ");
  }
  return trimmed.replaceAll("_", " ");
}

function findFilesByName(rootDir: string, targetName: string, maxDepth = 6): string[] {
  const results: string[] = [];
  const visit = (dirPath: string, depth: number): void => {
    if (depth < 0) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, depth - 1);
        continue;
      }
      if (entry.isFile() && entry.name === targetName) {
        results.push(fullPath);
      }
    }
  };
  if (fs.existsSync(rootDir)) {
    visit(rootDir, maxDepth);
  }
  return results.sort((left, right) => left.localeCompare(right));
}

function normalizeRolloutStatus(value: string | null, ready?: boolean): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (ready === true && ["", "ready", "ok", "passed", "no_change", "completed", "recommended"].includes(normalized)) {
    return "ready";
  }
  if (normalized === "diverged" || normalized === "divergence") return "divergence";
  if (normalized.includes("below_min_score") || normalized.includes("score_below_min")) return "below_min_score";
  if (["ready", "ok", "passed", "no_change", "completed", "up"].includes(normalized)) return "ready";
  if (["blocked", "failed", "reject", "rejected", "error", "down"].includes(normalized)) return "blocked";
  if (["warn", "warning", "stale", "missing"].includes(normalized)) return "warn";
  if (!normalized && ready === false) return "blocked";
  return normalized || "unknown";
}

function rolloutTone(status: string): UiBadgeTone {
  const normalized = normalizeRolloutStatus(status);
  if (normalized === "ready") return "ok";
  if (normalized === "divergence" || normalized === "warn") return "warn";
  if (normalized === "below_min_score" || normalized === "blocked") return "bad";
  return "muted";
}

function rolloutStatusLabel(status: string): string {
  return normalizeRolloutStatus(status).replaceAll("_", " ");
}

function pathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function artifactRelativePath(outRoot: string, filePath: string): string {
  if (!pathInside(outRoot, filePath)) {
    return path.basename(filePath);
  }
  const relative = path.relative(outRoot, filePath).replaceAll("\\", "/");
  return relative || path.basename(filePath);
}

function listDirectories(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

function selectGeneratedAt(values: string[]): string | null {
  const sorted = values
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => b.time - a.time);
  return sorted.length > 0 ? sorted[0].value : null;
}

function getRolloutArtifactSources(): RolloutArtifactSource[] {
  const repoRoot = getRepoRoot();
  const candidates: RolloutArtifactSource[] = [
    { label: "local worktree", outRoot: getOutRoot() },
    { label: "sidecar worktree", outRoot: path.resolve(repoRoot, "../ecs-sidecar-rollout/out") },
    { label: "main repo", outRoot: path.resolve(repoRoot, "../eraser-cat-studio/out") }
  ];
  const seen = new Set<string>();
  return candidates.filter((source) => {
    const key = path.resolve(source.outRoot).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createRolloutSignal(input: Omit<RolloutSignal, "tone" | "artifactRelativePath">): RolloutSignal {
  return {
    ...input,
    tone: rolloutTone(input.status),
    artifactRelativePath: artifactRelativePath(input.sourcePath, input.artifactPath)
  };
}

function buildMotionBenchmarkSignal(source: RolloutArtifactSource): RolloutSignal[] {
  const filePath = path.join(source.outRoot, "motion_preset_benchmark.validation_report.json");
  const doc = readJsonFileSafe(filePath);
  if (!isRecord(doc)) {
    return [];
  }

  return [
    createRolloutSignal({
      sortGroup: 10,
      kind: "Motion benchmark",
      scope: "motion presets",
      target: "validation",
      status: normalizeRolloutStatus(str(doc.status), doc.ready === true),
      score: "-",
      verdict: "-",
      reason: compact([str(doc.reason), previewStrings(doc.issues)]),
      generatedAt: str(doc.benchmark_generated_at) ?? str(doc.generated_at) ?? "-",
      sourceLabel: source.label,
      sourcePath: source.outRoot,
      artifactPath: filePath
    })
  ];
}

function buildPresetInspectionSignal(source: RolloutArtifactSource, benchmarkName: string): RolloutSignal[] {
  const filePath = path.join(source.outRoot, "preset_benchmarks", benchmarkName, "runtime_sidecar_preset_rollout.validation_report.json");
  const doc = readJsonFileSafe(filePath);
  if (!isRecord(doc)) {
    return [];
  }

  const inspection = isRecord(doc.inspection) ? doc.inspection : {};
  const candidate = isRecord(inspection.candidate) ? inspection.candidate : {};
  return [
    createRolloutSignal({
      sortGroup: 20,
      kind: "Preset inspection",
      scope: benchmarkName,
      target: str(inspection.resolvedTarget) ?? str(doc.default_target) ?? "overall",
      status: normalizeRolloutStatus(str(inspection.status) ?? str(doc.status), doc.ready === true),
      score: formatNumber(candidate.score),
      verdict: str(candidate.verdict) ?? "-",
      reason: compact([str(inspection.reason) ?? str(doc.reason), previewStrings(doc.issues)]),
      generatedAt: str(doc.generated_at) ?? "-",
      sourceLabel: source.label,
      sourcePath: source.outRoot,
      artifactPath: filePath
    })
  ];
}

function buildPresetTargetSignals(source: RolloutArtifactSource, benchmarkName: string): RolloutSignal[] {
  const filePath = path.join(source.outRoot, "preset_benchmarks", benchmarkName, "runtime_sidecar_preset_rollout.pipeline_validation.json");
  const doc = readJsonFileSafe(filePath);
  if (!isRecord(doc) || !Array.isArray(doc.target_results)) {
    return [];
  }

  const generatedAt = str(doc.generated_at) ?? "-";
  return doc.target_results.flatMap((rawRow, index) => {
    if (!isRecord(rawRow)) return [];
    const candidate = isRecord(rawRow.candidate) ? rawRow.candidate : {};
    const reason = str(rawRow.reason);
    const passed = rawRow.passed === true;
    return [
      createRolloutSignal({
        sortGroup: 30,
        kind: "Preset rollout",
        scope: benchmarkName,
        target: str(rawRow.target) ?? `target-${index + 1}`,
        status: passed ? "ready" : normalizeRolloutStatus(reason, false),
        score: formatNumber(candidate.score),
        verdict: str(candidate.verdict) ?? "-",
        reason: compact([str(candidate.scenario), reason ? humanizeRolloutReason(reason) : null]),
        generatedAt,
        sourceLabel: source.label,
        sourcePath: source.outRoot,
        artifactPath: filePath
      })
    ];
  });
}

function buildMultiChannelBundleSignals(source: RolloutArtifactSource, benchmarkName: string): { signals: RolloutSignal[]; validationDoc: JsonRecord | null } {
  const filePath = path.join(source.outRoot, "multi_channel_benchmarks", benchmarkName, "multi_channel_benchmark_validation.json");
  const doc = readJsonFileSafe(filePath);
  if (!isRecord(doc) || !Array.isArray(doc.bundles)) {
    return { signals: [], validationDoc: null };
  }

  const generatedAt = str(doc.generated_at) ?? "-";
  const benchmarkKind = str(doc.benchmark_kind) ?? benchmarkName;
  const signals = doc.bundles.flatMap((rawBundle, index) => {
    if (!isRecord(rawBundle)) return [];
    const summary = isRecord(rawBundle.summary) ? rawBundle.summary : {};
    const issues = previewStrings(rawBundle.issues);
    const status = rawBundle.ready === true
      ? "ready"
      : normalizeRolloutStatus(issues ?? str(rawBundle.status), false);
    return [
      createRolloutSignal({
        sortGroup: 40,
        kind: "Multi-channel bundle",
        scope: benchmarkKind,
        target: str(rawBundle.bundle) ?? str(rawBundle.channel_domain) ?? `bundle-${index + 1}`,
        status,
        score: formatNumber(summary.score),
        verdict: str(summary.verdict) ?? "-",
        reason: compact([str(summary.scenario), issues ?? str(rawBundle.status)]),
        generatedAt,
        sourceLabel: source.label,
        sourcePath: source.outRoot,
        artifactPath: filePath
      })
    ];
  });

  return { signals, validationDoc: doc };
}

function buildCrossChannelSignal(source: RolloutArtifactSource, benchmarkName: string, validationDoc: JsonRecord | null): RolloutSignal[] {
  const filePath = path.join(source.outRoot, "multi_channel_benchmarks", benchmarkName, "multi_channel_benchmark_alert.json");
  const alertDoc = readJsonFileSafe(filePath);
  if (isRecord(alertDoc)) {
    return [
      createRolloutSignal({
        sortGroup: 50,
        kind: "Cross-channel",
        scope: str(alertDoc.benchmark_kind) ?? benchmarkName,
        target: str(alertDoc.divergence_level) ? `cross-channel (${str(alertDoc.divergence_level)})` : "cross-channel",
        status: normalizeRolloutStatus(str(alertDoc.status), alertDoc.ready === true),
        score: formatNumber(alertDoc.score_gap),
        verdict: str(alertDoc.severity) ?? "-",
        reason: compact([str(alertDoc.recommendation), str(alertDoc.message)]),
        generatedAt: str(alertDoc.generated_at) ?? "-",
        sourceLabel: source.label,
        sourcePath: source.outRoot,
        artifactPath: filePath
      })
    ];
  }

  const crossChannel = validationDoc && isRecord(validationDoc.cross_channel) ? validationDoc.cross_channel : null;
  if (!crossChannel) {
    return [];
  }

  return [
    createRolloutSignal({
      sortGroup: 50,
      kind: "Cross-channel",
      scope: str(validationDoc?.benchmark_kind) ?? benchmarkName,
      target: str(crossChannel.divergence_level) ? `cross-channel (${str(crossChannel.divergence_level)})` : "cross-channel",
      status: normalizeRolloutStatus(str(crossChannel.status), validationDoc?.ready === true),
      score: formatNumber(crossChannel.score_gap),
      verdict: "-",
      reason: compact([previewStrings(crossChannel.differing_axes), str(crossChannel.recommendation)]),
      generatedAt: str(validationDoc?.generated_at) ?? "-",
      sourceLabel: source.label,
      sourcePath: source.outRoot,
      artifactPath: path.join(source.outRoot, "multi_channel_benchmarks", benchmarkName, "multi_channel_benchmark_validation.json")
    })
  ];
}

function scanRolloutSource(source: RolloutArtifactSource): { sourceStatus: RolloutSourceStatus; signals: RolloutSignal[] } {
  const signals: RolloutSignal[] = [];
  const exists = fs.existsSync(source.outRoot);
  if (exists) {
    signals.push(...buildMotionBenchmarkSignal(source));
    for (const benchmarkName of listDirectories(path.join(source.outRoot, "preset_benchmarks"))) {
      signals.push(...buildPresetInspectionSignal(source, benchmarkName));
      signals.push(...buildPresetTargetSignals(source, benchmarkName));
    }
    for (const benchmarkName of listDirectories(path.join(source.outRoot, "multi_channel_benchmarks"))) {
      const { signals: bundleSignals, validationDoc } = buildMultiChannelBundleSignals(source, benchmarkName);
      signals.push(...bundleSignals);
      signals.push(...buildCrossChannelSignal(source, benchmarkName, validationDoc));
    }
  }

  const latestGeneratedAt = selectGeneratedAt(
    signals.map((signal) => signal.generatedAt).filter((value) => value !== "-")
  );
  return {
    sourceStatus: {
      label: source.label,
      outRoot: source.outRoot,
      exists,
      recordCount: signals.length,
      latestGeneratedAt
    },
    signals
  };
}

function collectRolloutSignals(): { sources: RolloutSourceStatus[]; signals: RolloutSignal[] } {
  const sources: RolloutSourceStatus[] = [];
  const signals: RolloutSignal[] = [];
  for (const source of getRolloutArtifactSources()) {
    const result = scanRolloutSource(source);
    sources.push(result.sourceStatus);
    signals.push(...result.signals);
  }

  const priority = new Map<string, number>([
    ["blocked", 0],
    ["below_min_score", 1],
    ["divergence", 2],
    ["warn", 3],
    ["ready", 4],
    ["unknown", 5]
  ]);
  signals.sort((left, right) => {
    const leftPriority = priority.get(normalizeRolloutStatus(left.status)) ?? 9;
    const rightPriority = priority.get(normalizeRolloutStatus(right.status)) ?? 9;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const leftTime = new Date(left.generatedAt).getTime();
    const rightTime = new Date(right.generatedAt).getTime();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    if (left.sortGroup !== right.sortGroup) return left.sortGroup - right.sortGroup;
    return left.kind.localeCompare(right.kind);
  });

  return { sources, signals };
}

function resolveRolloutFile(
  requestedPath: string,
  allowedExtensions?: string[]
): { resolvedPath: string; source: RolloutArtifactSource } | null {
  const resolvedPath = path.resolve(requestedPath);
  const source = getRolloutArtifactSources().find((candidate) => pathInside(candidate.outRoot, resolvedPath));
  if (!source) {
    return null;
  }
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    return null;
  }
  if (allowedExtensions && allowedExtensions.length > 0) {
    const ext = path.extname(resolvedPath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return null;
    }
  }
  return { resolvedPath, source };
}

function safeJsonArtifactPath(source: RolloutArtifactSource, candidatePath: unknown): string | null {
  const filePath = str(candidatePath);
  if (!filePath) {
    return null;
  }
  return resolveRolloutFile(filePath, [".json"])?.resolvedPath ?? null;
}

function safeRolloutTextPath(source: RolloutArtifactSource, candidatePath: unknown): string | null {
  const filePath = str(candidatePath);
  if (!filePath) {
    return null;
  }
  return resolveRolloutFile(filePath, [".txt"])?.resolvedPath ?? null;
}

function safeRolloutVideoPath(source: RolloutArtifactSource, candidatePath: unknown): string | null {
  const filePath = str(candidatePath);
  if (!filePath) {
    return null;
  }
  return resolveRolloutFile(filePath, [".mp4", ".webm"])?.resolvedPath ?? null;
}

function mimeTypeForRolloutFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function findCandidateCompareItems(source: RolloutArtifactSource, baseDir: string): Array<{ label: string; path: string }> {
  const candidateDir = path.basename(baseDir).toLowerCase() === "shot_sidecar" ? baseDir : path.join(baseDir, "shot_sidecar");
  if (!fs.existsSync(candidateDir)) {
    return [];
  }

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(candidateDir)
      .filter((name) => name.endsWith(".plan.json"))
      .map((name) => path.join(candidateDir, name));
  } catch {
    return [];
  }

  return entries
    .map((filePath) => {
      const doc = readJsonFileSafe(filePath);
      if (!isRecord(doc)) return null;
      const hasCandidateJudge = safeJsonArtifactPath(source, doc.premium_candidate_judge_path);
      const hasActualJudge = safeJsonArtifactPath(source, doc.premium_actual_judge_path);
      if (!hasCandidateJudge && !hasActualJudge) return null;
      const shotId = str(doc.shot_id) ?? path.basename(filePath, ".plan.json");
      const objective =
        str(doc.premium_actual_selected_candidate_objective) ??
        str(doc.premium_selected_candidate_objective);
      return {
        label: objective ? `${shotId} (${humanizeOpsLabel(objective)})` : shotId,
        path: filePath
      };
    })
    .filter((item): item is { label: string; path: string } => Boolean(item))
    .slice(0, 4);
}

function buildBackendBenchmarkViews(source: RolloutArtifactSource): BenchmarkScenarioView[] {
  const benchmarkRoot = path.join(source.outRoot, "backend_benchmarks");
  if (!fs.existsSync(benchmarkRoot)) {
    return [];
  }

  const rows: BenchmarkScenarioView[] = [];
  for (const benchmarkName of listDirectories(benchmarkRoot)) {
    const matrixPath = path.join(benchmarkRoot, benchmarkName, "benchmark_matrix.json");
    const doc = readJsonFileSafe(matrixPath);
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
        : normalizeRolloutStatus(str(rawScenario.sidecar_status) ?? str(rawScenario.status) ?? "blocked", false);
      const smokeArtifactPath = safeJsonArtifactPath(source, rawScenario.smoke_report_path);
      const planArtifactPath = safeJsonArtifactPath(source, rawScenario.shot_sidecar_plan_path);
      const detailArtifactPath = smokeArtifactPath ?? planArtifactPath ?? matrixPath;
      const candidateCompareItems = planArtifactPath
        ? findCandidateCompareItems(source, path.dirname(planArtifactPath))
        : [];
      const note = compact([
        str(rawScenario.sidecar_status),
        firstMeaningfulLine(rawScenario.stderr_tail) ?? firstMeaningfulLine(rawScenario.stdout_tail)
      ]);
      rows.push({
        benchmarkName,
        benchmarkKind,
        backend: str(rawScenario.backend) ?? "-",
        renderer: str(rawScenario.renderer) ?? "-",
        status,
        tone: rolloutTone(status),
        latencyMs: num(rawScenario.latency_ms) === null ? "-" : `${Math.round(num(rawScenario.latency_ms) ?? 0).toString()} ms`,
        acceptanceRate: formatPercent(rawScenario.acceptance_rate),
        failureRate: formatPercent(rawScenario.render_failure_rate),
        generatedAt,
        notes: note || "-",
        sourceLabel: source.label,
        sourcePath: source.outRoot,
        matrixArtifactPath: matrixPath,
        detailArtifactPath,
        smokeArtifactPath,
        planArtifactPath,
        candidateCompareItems,
        artifactRelativePath: artifactRelativePath(source.outRoot, detailArtifactPath)
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
    const leftPriority = priority.get(normalizeRolloutStatus(left.status)) ?? 9;
    const rightPriority = priority.get(normalizeRolloutStatus(right.status)) ?? 9;
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

function buildRegressionReportViews(source: RolloutArtifactSource): RegressionReportView[] {
  const benchmarkRoot = path.join(source.outRoot, "multi_channel_benchmarks");
  if (!fs.existsSync(benchmarkRoot)) {
    return [];
  }

  const files = findFilesByName(benchmarkRoot, "episode_regression_report.json", 6);
  const rows: RegressionReportView[] = [];
  for (const filePath of files) {
    const doc = readJsonFileSafe(filePath);
    if (!isRecord(doc)) {
      continue;
    }

    const dirPath = path.dirname(filePath);
    const smokePath = path.join(dirPath, "smoke_report.json");
    const renderModePath = path.join(dirPath, "shot_render_mode_report.json");
    const smokeArtifactPath = safeJsonArtifactPath(source, smokePath);
    const renderModeArtifactPath = safeJsonArtifactPath(source, renderModePath);
    const candidateCompareItems = findCandidateCompareItems(source, dirPath);
    const smokeDoc = smokeArtifactPath ? readJsonFileSafe(smokeArtifactPath) : null;
    const renderModeDoc = renderModeArtifactPath ? readJsonFileSafe(renderModeArtifactPath) : null;
    const relativeDir = artifactRelativePath(benchmarkRoot, dirPath);
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
      tone: rolloutTone(status),
      warningCount,
      errorCount,
      generatedAt: str(doc.generated_at) ?? "-",
      issueSummary,
      profileSummary: profileSummary || "-",
      renderModeSummary,
      mismatchCount,
      sourceLabel: source.label,
      sourcePath: source.outRoot,
      artifactPath: filePath,
      smokeArtifactPath,
      renderModeArtifactPath,
      candidateCompareItems,
      artifactRelativePath: artifactRelativePath(source.outRoot, filePath)
    });
  }

  const priority = new Map<string, number>([
    ["blocked", 0],
    ["warn", 1],
    ["ready", 2],
    ["unknown", 3]
  ]);
  rows.sort((left, right) => {
    const leftPriority = priority.get(normalizeRolloutStatus(left.status)) ?? 9;
    const rightPriority = priority.get(normalizeRolloutStatus(right.status)) ?? 9;
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

function collectBenchmarkViewerData(): {
  sources: RolloutSourceStatus[];
  backendScenarios: BenchmarkScenarioView[];
  regressions: RegressionReportView[];
} {
  const sources: RolloutSourceStatus[] = [];
  const backendScenarios: BenchmarkScenarioView[] = [];
  const regressions: RegressionReportView[] = [];
  for (const source of getRolloutArtifactSources()) {
    const exists = fs.existsSync(source.outRoot);
    const sourceBackend = exists ? buildBackendBenchmarkViews(source) : [];
    const sourceRegressions = exists ? buildRegressionReportViews(source) : [];
    const latestGeneratedAt = selectGeneratedAt(
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

function readStringAtPath(root: unknown, keys: string[]): string | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return str(current);
}

function readStringArrayAtPath(root: unknown, keys: string[]): string[] {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return [];
    current = current[key];
  }
  return Array.isArray(current)
    ? current
        .map((item) => str(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function countBibleStylePresets(doc: unknown): number {
  const keys = [
    ["character_generator_style_presets"],
    ["character_generator", "style_presets"],
    ["character", "style_presets"]
  ];
  const ids = new Set<string>();
  for (const keyPath of keys) {
    let current: unknown = doc;
    for (const key of keyPath) {
      if (!isRecord(current)) {
        current = null;
        break;
      }
      current = current[key];
    }
    if (!Array.isArray(current)) continue;
    for (const entry of current) {
      if (!isRecord(entry)) continue;
      const id = str(entry.id) ?? str(entry.label);
      if (id) ids.add(id);
    }
  }
  return ids.size;
}

function countBiblePolicyTerms(doc: unknown): number {
  return new Set([
    ...readStringArrayAtPath(doc, ["policy", "forbidden_words"]),
    ...readStringArrayAtPath(doc, ["policy", "banned_phrases"]),
    ...readStringArrayAtPath(doc, ["character_generator", "forbidden_terms"]),
    ...readStringArrayAtPath(doc, ["policy", "negative_prompt_terms"]),
    ...readStringArrayAtPath(doc, ["character_generator", "negative_prompt_terms"])
  ]).size;
}

function parseProfileBrowserSmokeReport(
  source: RolloutArtifactSource,
  filePath: string
): { bundleCard: ProfileBrowserBundleCard; evidence: ProfileBrowserEvidenceRow } | null {
  const doc = readJsonFileSafe(filePath);
  if (!isRecord(doc)) {
    return null;
  }

  const profileSelection = isRecord(doc.profile_selection) ? doc.profile_selection : {};
  const studioProfileId = str(profileSelection.studio_profile_id) ?? str(doc.studio_profile_id) ?? "-";
  const channelProfileId = str(profileSelection.channel_profile_id) ?? str(doc.channel_profile_id) ?? "-";
  const mascotProfileId = str(profileSelection.mascot_profile_id) ?? str(doc.mascot_profile_id) ?? "-";
  if (studioProfileId === "-" && channelProfileId === "-" && mascotProfileId === "-") {
    return null;
  }

  const resolvedProfiles = isRecord(doc.resolved_profiles) ? doc.resolved_profiles : {};
  const studio = isRecord(resolvedProfiles.studio) ? resolvedProfiles.studio : {};
  const channel = isRecord(resolvedProfiles.channel) ? resolvedProfiles.channel : {};
  const mascot = isRecord(resolvedProfiles.mascot) ? resolvedProfiles.mascot : {};
  const mascotActing = isRecord(resolvedProfiles.mascot_acting) ? resolvedProfiles.mascot_acting : {};
  const bundle = str(doc.profile_bundle) ?? str(doc.channel_domain) ?? readStringAtPath(channel, ["domain"]) ?? "unknown";
  const generatedAt = str(doc.generated_at) ?? "-";
  const scenario = str(doc.smoke_label) ?? path.basename(path.dirname(filePath));
  const renderLogPath = safeJsonArtifactPath(source, doc.render_log_path);
  const finishProfileId =
    readStringAtPath(channel, ["finish_profile_id"]) ??
    readStringAtPath(studio, ["finish_profile_id"]) ??
    str(doc.finish_profile_id) ??
    "-";
  const impactPreset =
    readStringAtPath(channel, ["sidecar_impact_preset_premium"]) ??
    readStringAtPath(channel, ["sidecar_impact_preset"]) ??
    str(doc.impact_preset) ??
    "-";
  const qcPreset =
    readStringAtPath(studio, ["sidecar_qc_preset_strict"]) ??
    readStringAtPath(studio, ["sidecar_qc_preset"]) ??
    str(doc.qc_preset) ??
    "-";
  const qcReasons = Array.isArray(doc.qc_reasons)
    ? doc.qc_reasons.map((item) => str(item)).filter((item): item is string => Boolean(item))
    : [];
  const qcWarnings = Array.isArray(doc.qc_warnings)
    ? doc.qc_warnings.map((item) => str(item)).filter((item): item is string => Boolean(item))
    : [];
  const status = doc.qc_passed === true ? (qcWarnings.length > 0 ? "warn" : "ready") : qcReasons.length > 0 ? "blocked" : "unknown";
  const tone: UiBadgeTone = status === "blocked" ? "bad" : status === "warn" ? "warn" : status === "ready" ? "ok" : "muted";

  const bundleCard: ProfileBrowserBundleCard = {
    bundle,
    channelDomain: readStringAtPath(channel, ["domain"]) ?? str(doc.channel_domain) ?? "-",
    studioProfileId,
    channelProfileId,
    mascotProfileId,
    studioLabel: readStringAtPath(studio, ["label"]) ?? studioProfileId,
    channelLabel: readStringAtPath(channel, ["label"]) ?? channelProfileId,
    mascotLabel: readStringAtPath(mascot, ["label"]) ?? mascotProfileId,
    tone: readStringAtPath(studio, ["tone"]) ?? readStringAtPath(resolvedProfiles, ["mascot_brand", "channel_tone"]) ?? "-",
    pacing: readStringAtPath(channel, ["pacing"]) ?? "-",
    infoPriority: readStringAtPath(channel, ["information_priority"]) ?? "-",
    finishProfileId,
    impactPreset,
    qcPreset,
    insertSummary: summarizeValues(readStringArrayAtPath(channel, ["preferred_insert_types"]), 4),
    gestureSummary: summarizeValues(readStringArrayAtPath(mascotActing, ["gesture_vocabulary"]), 4),
    generatedAt,
    sourceLabel: source.label,
    sourcePath: source.outRoot,
    smokeArtifactPath: filePath,
    smokeArtifactRelativePath: artifactRelativePath(source.outRoot, filePath),
    renderLogPath
  };

  const evidence: ProfileBrowserEvidenceRow = {
    scenario,
    bundle,
    status,
    tone,
    studioProfileId,
    channelProfileId,
    mascotProfileId,
    profileSummary: compact(
      [
        bundle !== "unknown" ? `bundle ${bundle}` : null,
        readStringAtPath(channel, ["label"]),
        readStringAtPath(mascot, ["label"])
      ],
      " | "
    ),
    runtimeSummary: compact(
      [
        readStringAtPath(channel, ["information_priority"]) ? `priority ${readStringAtPath(channel, ["information_priority"])}` : null,
        finishProfileId !== "-" ? `finish ${finishProfileId}` : null,
        impactPreset !== "-" ? `impact ${impactPreset}` : null,
        qcPreset !== "-" ? `qc ${qcPreset}` : null,
        str(doc.primary_render_mode)
      ],
      " | "
    ),
    generatedAt,
    sourceLabel: source.label,
    sourcePath: source.outRoot,
    smokeArtifactPath: filePath,
    renderLogPath,
    artifactRelativePath: artifactRelativePath(source.outRoot, filePath)
  };

  return { bundleCard, evidence };
}

function collectProfileBrowserData(): {
  sources: RolloutSourceStatus[];
  bundleCards: ProfileBrowserBundleCard[];
  evidenceRows: ProfileBrowserEvidenceRow[];
} {
  const sources: RolloutSourceStatus[] = [];
  const bundleMap = new Map<string, ProfileBrowserBundleCard>();
  const evidenceRows: ProfileBrowserEvidenceRow[] = [];

  for (const source of getRolloutArtifactSources()) {
    const exists = fs.existsSync(source.outRoot);
    const smokeFiles: string[] = [];
    if (exists) {
      const presetRoot = path.join(source.outRoot, "preset_benchmarks");
      for (const benchmarkName of listDirectories(presetRoot)) {
        smokeFiles.push(...findFilesByName(path.join(presetRoot, benchmarkName), "smoke_report.json", 4));
      }
      const multiRoot = path.join(source.outRoot, "multi_channel_benchmarks");
      for (const benchmarkName of listDirectories(multiRoot)) {
        smokeFiles.push(...findFilesByName(path.join(multiRoot, benchmarkName), "smoke_report.json", 6));
      }
    }

    const latestCandidates: string[] = [];
    let recordCount = 0;
    for (const filePath of Array.from(new Set(smokeFiles))) {
      const parsed = parseProfileBrowserSmokeReport(source, filePath);
      if (!parsed) continue;
      recordCount += 1;
      evidenceRows.push(parsed.evidence);
      if (parsed.evidence.generatedAt !== "-") {
        latestCandidates.push(parsed.evidence.generatedAt);
      }
      const key = [
        parsed.bundleCard.bundle,
        parsed.bundleCard.studioProfileId,
        parsed.bundleCard.channelProfileId,
        parsed.bundleCard.mascotProfileId
      ].join("|");
      const existing = bundleMap.get(key);
      const nextTime = new Date(parsed.bundleCard.generatedAt).getTime();
      const existingTime = existing ? new Date(existing.generatedAt).getTime() : Number.NEGATIVE_INFINITY;
      if (!existing || (Number.isFinite(nextTime) && nextTime >= existingTime)) {
        bundleMap.set(key, parsed.bundleCard);
      }
    }

    sources.push({
      label: source.label,
      outRoot: source.outRoot,
      exists,
      recordCount,
      latestGeneratedAt: selectGeneratedAt(latestCandidates)
    });
  }

  const bundleCards = Array.from(bundleMap.values()).sort((left, right) => {
    const leftTime = new Date(left.generatedAt).getTime();
    const rightTime = new Date(right.generatedAt).getTime();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    if (left.bundle !== right.bundle) return left.bundle.localeCompare(right.bundle);
    return left.channelProfileId.localeCompare(right.channelProfileId);
  });

  evidenceRows.sort((left, right) => {
    const leftTime = new Date(left.generatedAt).getTime();
    const rightTime = new Date(right.generatedAt).getTime();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    if (left.bundle !== right.bundle) return left.bundle.localeCompare(right.bundle);
    return left.scenario.localeCompare(right.scenario);
  });

  return { sources, bundleCards, evidenceRows };
}

function candidateCompareStem(filePath: string): string {
  const name = path.basename(filePath);
  const suffixes = [
    ".premium_candidate_judge.json",
    ".premium_actual_judge.json",
    ".plan.json",
    ".request.json",
    ".prompt.txt"
  ];
  for (const suffix of suffixes) {
    if (name.endsWith(suffix)) {
      return name.slice(0, -suffix.length);
    }
  }
  return path.basename(filePath, path.extname(filePath));
}

function resolveCandidateCompareBundle(requestedPath: string): {
  source: RolloutArtifactSource;
  rootDir: string;
  stem: string;
  requestedPath: string;
  planPath: string | null;
  requestPath: string | null;
  promptPath: string | null;
  candidateJudgePath: string | null;
  actualJudgePath: string | null;
} | null {
  const resolved = resolveRolloutFile(requestedPath, [".json", ".txt"]);
  if (!resolved) {
    return null;
  }

  const rootDir = path.dirname(resolved.resolvedPath);
  const stem = candidateCompareStem(resolved.resolvedPath);
  const sibling = (suffix: string): string | null =>
    resolveRolloutFile(path.join(rootDir, `${stem}${suffix}`), [path.extname(suffix).toLowerCase()])?.resolvedPath ?? null;

  let planPath = sibling(".plan.json");
  let requestPath = sibling(".request.json");
  let promptPath = sibling(".prompt.txt");
  let candidateJudgePath = sibling(".premium_candidate_judge.json");
  let actualJudgePath = sibling(".premium_actual_judge.json");
  const planDoc = planPath ? readJsonFileSafe(planPath) : null;
  if (isRecord(planDoc)) {
    planPath = safeJsonArtifactPath(resolved.source, planPath) ?? planPath;
    requestPath = safeJsonArtifactPath(resolved.source, planDoc.request_path) ?? requestPath;
    promptPath = safeRolloutTextPath(resolved.source, planDoc.prompt_path) ?? promptPath;
    candidateJudgePath = safeJsonArtifactPath(resolved.source, planDoc.premium_candidate_judge_path) ?? candidateJudgePath;
    actualJudgePath = safeJsonArtifactPath(resolved.source, planDoc.premium_actual_judge_path) ?? actualJudgePath;
  }

  if (!candidateJudgePath && !actualJudgePath) {
    return null;
  }

  return {
    source: resolved.source,
    rootDir,
    stem,
    requestedPath: resolved.resolvedPath,
    planPath,
    requestPath,
    promptPath,
    candidateJudgePath,
    actualJudgePath
  };
}

function resolveRolloutArtifact(requestedPath: string): { resolvedPath: string; source: RolloutArtifactSource } | null {
  return resolveRolloutFile(requestedPath, [".json"]);
}

function rolloutDetailPairs(doc: unknown): Array<{ label: string; value: string }> {
  if (!isRecord(doc)) return [];
  const pairs: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && value.trim().length === 0) return;
    if (typeof value === "boolean") {
      pairs.push({ label, value: value ? "true" : "false" });
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      pairs.push({ label, value: formatNumber(value, 3) });
      return;
    }
    if (typeof value === "string") {
      pairs.push({ label, value });
    }
  };
  push("status", doc.status);
  push("ready", doc.ready);
  push("generated_at", doc.generated_at);
  push("benchmark_kind", doc.benchmark_kind);
  push("default_target", doc.default_target);
  push("resolved_target", isRecord(doc.inspection) ? doc.inspection.resolvedTarget : undefined);
  push("min_score", doc.min_score);
  push("score_gap", doc.score_gap);
  push("divergence_level", doc.divergence_level);
  push("recommendation", doc.recommendation);
  push("reason", doc.reason);
  return pairs;
}

function rolloutDetailItems(value: unknown, limit = 10): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (typeof entry === "string") return [entry];
        if (isRecord(entry)) {
          const check = str(entry.check);
          const severity = str(entry.severity);
          const message = str(entry.message) ?? str(entry.reason) ?? str(entry.issue);
          return [compact([severity, check, message], " / ")];
        }
        return [];
      })
      .filter((entry) => entry.length > 0)
      .slice(0, limit);
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .flatMap(([key, entry]) => {
        if (typeof entry === "string") return [`${key}: ${entry}`];
        if (typeof entry === "number" && Number.isFinite(entry)) return [`${key}: ${formatNumber(entry, 3)}`];
        if (typeof entry === "boolean") return [`${key}: ${entry ? "true" : "false"}`];
        return [];
      })
      .slice(0, limit);
  }
  return [];
}

function pickStylePreviewShotIds(shotsDoc: unknown, maxFrames: number = 300): string[] {
  if (!isRecord(shotsDoc) || !Array.isArray(shotsDoc.shots)) {
    return [];
  }

  let cursor = 0;
  const out: string[] = [];
  for (const row of shotsDoc.shots) {
    if (!isRecord(row)) continue;
    const shotId = typeof row.shot_id === "string" ? row.shot_id.trim() : "";
    if (!shotId) continue;
    const duration = typeof row.duration_frames === "number" && row.duration_frames > 0
      ? Math.round(row.duration_frames)
      : 0;
    out.push(shotId);
    cursor += duration;
    if (cursor >= maxFrames) {
      break;
    }
  }

  return out;
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJsonFile(filePath: string, value: unknown): void {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeAbStylePresetId(value: unknown, fallback: string): string {
  const normalized = normalizeStylePresetId(value);
  if (normalized === "AUTO") {
    return fallback;
  }
  return normalized;
}

function resolveStylePresetForVariant(variant: "A" | "B", stylePresetId: string): { cameraPreset: string; transition: string } {
  const preset = stylePresetId.toUpperCase();

  if (preset === "CHAOS_ENERGY" || preset === "TIKTOK_PUNCH" || preset === "COMIC_POP") {
    return { cameraPreset: "whip_pan", transition: "flash" };
  }
  if (preset === "RETRO_VHS") {
    return { cameraPreset: "shake_emphasis", transition: "glitch" };
  }
  if (preset === "CINEMATIC_DRAMA" || preset === "DOCU_CALM") {
    return { cameraPreset: "slow_push", transition: "crossfade" };
  }
  if (preset === "FINANCE_TRADER" || preset === "GAME_HUD") {
    return { cameraPreset: variant === "A" ? "slow_push" : "shake_emphasis", transition: "cut" };
  }
  return { cameraPreset: "static", transition: "cut" };
}

function applyStylePresetToShotsDoc(source: unknown, stylePresetId: string, variantId: "A" | "B"): unknown {
  if (!isRecord(source) || !Array.isArray(source.shots)) {
    return source;
  }

  const doc = JSON.parse(JSON.stringify(source)) as JsonRecord;
  const shots = doc.shots as unknown[];
  const mapping = resolveStylePresetForVariant(variantId, stylePresetId);

  for (const shotRaw of shots) {
    if (!isRecord(shotRaw)) continue;
    const shot = shotRaw as JsonRecord;

    if (isRecord(shot.camera)) {
      shot.camera = {
        ...shot.camera,
        preset: mapping.cameraPreset
      };
    }

    shot.transition = mapping.transition;
    if (isRecord(shot.set)) {
      shot.set = {
        ...shot.set,
        variant: mapping.transition === "crossfade" ? "fade" : "cut"
      };
    }

    const editStyle = isRecord(shot.edit_style) ? shot.edit_style : {};
    shot.edit_style = {
      ...editStyle,
      preset_id: stylePresetId,
      preset_name: stylePresetId,
      variant_id: variantId,
      variant_label: `AB_${variantId}`,
      style_seed: `${stylePresetId}:${variantId}`
    };
  }

  doc.edit_style_variant = {
    variant_id: variantId,
    style_preset_id: stylePresetId,
    generated_at: new Date().toISOString()
  };

  return doc;
}

function getAbVariantPaths(episodeId: string, variantId: "A" | "B") {
  const out = getEpisodeOutPaths(episodeId);
  return {
    shotsPath: path.join(out.outDir, `shots_ab_${variantId}.json`),
    outputPath: path.join(out.outDir, `preview_${variantId}.mp4`),
    srtPath: path.join(out.outDir, `preview_${variantId}.srt`),
    qcReportPath: path.join(out.outDir, `qc_report_${variantId}.json`),
    renderLogPath: path.join(out.outDir, `render_log_${variantId}.json`)
  };
}

type ShotEditorHistory = {
  pointer: number;
  states: Array<{
    saved_at: string;
    reason: string;
    doc: unknown;
  }>;
};

function editorHistoryPath(episodeId: string): string {
  return path.join(getEpisodeOutPaths(episodeId).outDir, "shots_editor_history.json");
}

function editorSnapshotsDir(episodeId: string): string {
  return path.join(getEpisodeOutPaths(episodeId).outDir, "editor_snapshots");
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isShotsDocLike(value: unknown): value is JsonRecord & { shots: unknown[] } {
  return isRecord(value) && Array.isArray(value.shots);
}

function normalizeShotTimeline(doc: JsonRecord & { shots: unknown[] }): void {
  let cursor = 0;
  for (const raw of doc.shots) {
    if (!isRecord(raw)) continue;
    const duration = typeof raw.duration_frames === "number" && raw.duration_frames > 0 ? Math.round(raw.duration_frames) : 1;
    raw.start_frame = cursor;
    raw.duration_frames = duration;
    cursor += duration;
  }
}

function moveShot(doc: JsonRecord & { shots: unknown[] }, index: number, delta: number): boolean {
  if (!Number.isInteger(index) || Math.abs(delta) !== 1) return false;
  const target = index + delta;
  if (index < 0 || index >= doc.shots.length) return false;
  if (target < 0 || target >= doc.shots.length) return false;
  const items = doc.shots;
  const current = items[index];
  items[index] = items[target];
  items[target] = current;
  normalizeShotTimeline(doc);
  return true;
}

function applyShotTweaks(
  doc: JsonRecord & { shots: unknown[] },
  shotId: string,
  zoomMult: number,
  panXDelta: number,
  transitionStrength: number
): boolean {
  if (!shotId) return false;
  const target = doc.shots.find((row) => isRecord(row) && typeof row.shot_id === "string" && row.shot_id === shotId);
  if (!isRecord(target)) return false;

  if (isRecord(target.camera)) {
    const camera = target.camera;
    const existing = Array.isArray(camera.keyframes) ? camera.keyframes : [];
    const safeZoom = Math.max(0.5, Math.min(2.0, zoomMult));
    const safePan = Math.max(-1, Math.min(1, panXDelta));
    camera.keyframes = existing.map((item) => {
      if (!isRecord(item)) return item;
      const next = { ...item };
      if (typeof next.zoom === "number") {
        next.zoom = Math.max(0.5, Math.min(2.5, next.zoom * safeZoom));
      }
      if (typeof next.x === "number") {
        next.x = Math.max(-1, Math.min(1, next.x + safePan));
      }
      return next;
    });
  }

  const strength = Math.max(0, Math.min(1, transitionStrength));
  const transition = strength >= 0.67 ? "flash" : strength >= 0.34 ? "fade" : "cut";
  target.transition = transition;
  if (isRecord(target.set)) {
    target.set = {
      ...target.set,
      variant: transition === "cut" ? "cut" : "fade"
    };
  }
  return true;
}

function readEditorHistory(episodeId: string): ShotEditorHistory | null {
  const filePath = editorHistoryPath(episodeId);
  const raw = readJsonFileSafe(filePath);
  if (!isRecord(raw) || !Array.isArray(raw.states) || typeof raw.pointer !== "number") {
    return null;
  }
  return {
    pointer: Math.max(0, Math.min(raw.states.length - 1, Math.round(raw.pointer))),
    states: raw.states
      .filter((row) => isRecord(row) && "doc" in row)
      .map((row) => ({
        saved_at: typeof row.saved_at === "string" ? row.saved_at : new Date().toISOString(),
        reason: typeof row.reason === "string" ? row.reason : "unknown",
        doc: row.doc
      }))
  };
}

function writeEditorHistory(episodeId: string, history: ShotEditorHistory): void {
  writeJsonFile(editorHistoryPath(episodeId), history);
}

function pushHistory(history: ShotEditorHistory, doc: unknown, reason: string): ShotEditorHistory {
  const clipped = history.states.slice(0, history.pointer + 1);
  clipped.push({
    saved_at: new Date().toISOString(),
    reason,
    doc: deepClone(doc)
  });
  const maxStates = 50;
  const kept = clipped.slice(Math.max(0, clipped.length - maxStates));
  return {
    pointer: kept.length - 1,
    states: kept
  };
}

function parseStyleQcSummary(report: unknown): { failCount: number; warnCount: number; forcedStyle: string } {
  if (!isRecord(report) || !isRecord(report.STYLE_QC) || !isRecord(report.STYLE_QC.summary)) {
    return { failCount: 0, warnCount: 0, forcedStyle: "-" };
  }
  const section = report.STYLE_QC;
  const summary = section.summary as JsonRecord;
  const failCount = typeof summary.fail_count === "number" ? summary.fail_count : 0;
  const warnCount = typeof summary.warn_count === "number" ? summary.warn_count : 0;
  const forcedStyle = typeof section.forced_episode_style === "string" && section.forced_episode_style
    ? section.forced_episode_style
    : "-";
  return { failCount, warnCount, forcedStyle };
}

type QcIssueView = {
  check: string;
  severity: string;
  message: string;
  details: unknown;
};

type EpisodeArtifactLink = {
  label: string;
  filename: string;
  exists: boolean;
};

type EpisodeShotOpsView = {
  shotId: string;
  shotType: string;
  renderMode: string;
  renderModeSummary: string;
  recommendedRenderMode: string | null;
  backend: string | null;
  acceptanceStatus: string | null;
  sidecarStatus: string | null;
  routeReason: string | null;
  routeReasonLabel: string;
  visualKinds: string[];
  visualSummary: string;
  fallbackPolicies: string[];
  fallbackSummary: string;
  qcReasons: string[];
  qcSummary: string;
  repairSignals: string[];
  repairSummary: string;
  blockers: string[];
};

type EpisodeOpsView = {
  studioProfileId: string | null;
  channelProfileId: string | null;
  mascotProfileId: string | null;
  fallbackStage: string | null;
  fallbackSteps: string[];
  backendSummary: string;
  acceptanceSummary: string;
  routeSummary: string;
  visualSummary: string;
  repairSummary: string;
  qcSummary: string;
  renderModeSummary: string;
  artifactLinks: EpisodeArtifactLink[];
  shotItems: EpisodeShotOpsView[];
  inspectorSeed: Record<
    string,
    {
      label: string;
      shotType: string;
      renderModeSummary: string;
      backend: string;
      acceptanceStatus: string;
      sidecarStatus: string;
      routeReason: string;
      visualSummary: string;
      fallbackSummary: string;
      qcSummary: string;
      repairSummary: string;
    }
  >;
};

function toQcIssues(report: unknown): QcIssueView[] {
  const pushIssue = (target: QcIssueView[], raw: unknown): void => {
    if (!isRecord(raw)) {
      return;
    }

    const passed = typeof raw.passed === "boolean" ? raw.passed : undefined;
    if (passed === true) {
      return;
    }

    const check =
      (typeof raw.check === "string" && raw.check) ||
      (typeof raw.rule === "string" && raw.rule) ||
      (typeof raw.id === "string" && raw.id) ||
      "unknown";
    const severity =
      (typeof raw.severity === "string" && raw.severity) ||
      (typeof raw.level === "string" && raw.level) ||
      (passed === false ? "error" : "warn");
    const message =
      (typeof raw.message === "string" && raw.message) ||
      (typeof raw.reason === "string" && raw.reason) ||
      (typeof raw.title === "string" && raw.title) ||
      "issue detected";
    const details = "details" in raw ? raw.details : raw;

    target.push({
      check,
      severity,
      message,
      details
    });
  };

  const out: QcIssueView[] = [];
  if (Array.isArray(report)) {
    for (const row of report) {
      pushIssue(out, row);
    }
    return out;
  }

  if (!isRecord(report)) {
    return out;
  }

  const candidateArrays: unknown[] = [];
  if (Array.isArray(report.issues)) candidateArrays.push(report.issues);
  if (Array.isArray(report.findings)) candidateArrays.push(report.findings);
  if (Array.isArray(report.checks)) candidateArrays.push(report.checks);
  if (Array.isArray(report.results)) candidateArrays.push(report.results);

  for (const group of candidateArrays) {
    if (!Array.isArray(group)) continue;
    for (const row of group) {
      pushIssue(out, row);
    }
  }

  return out;
}

function recordList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((row): row is JsonRecord => isRecord(row)) : [];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function humanizeOpsLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

function summarizeValues(values: Array<string | null | undefined>, limit = 3): string {
  const items = uniqueStrings(values).map((value) => humanizeOpsLabel(value));
  if (items.length === 0) return "-";
  const preview = items.slice(0, limit).join(", ");
  return items.length > limit ? `${preview} (+${items.length - limit})` : preview;
}

function summarizeCounts(values: Array<string | null | undefined>, limit = 4): string {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return "-";
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => {
      const label = humanizeOpsLabel(value);
      return count > 1 ? `${label} x${count}` : label;
    })
    .join(", ");
}

function serializeScriptData(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e");
}

function collectShotIssueMap(report: unknown): Map<string, string[]> {
  const issuesByShot = new Map<string, string[]>();
  const pushIssue = (raw: unknown): void => {
    if (!isRecord(raw)) return;
    const shotId = str(raw.shotId) ?? str(raw.shot_id);
    if (!shotId) return;
    const label = compact(
      [
        str(raw.code) ?? str(raw.check) ?? str(raw.rule) ?? str(raw.name),
        str(raw.message)
      ],
      " - "
    );
    if (!label) return;
    const items = issuesByShot.get(shotId) ?? [];
    if (!items.includes(label)) {
      items.push(label);
      issuesByShot.set(shotId, items);
    }
  };

  if (!isRecord(report)) return issuesByShot;
  for (const issue of recordList(report.issues)) {
    pushIssue(issue);
  }
  for (const run of recordList(report.runs)) {
    for (const issue of recordList(run.issues)) {
      pushIssue(issue);
    }
  }
  return issuesByShot;
}

function buildEpisodeOpsView(episodeId: string, preferredDoc: unknown): EpisodeOpsView {
  const out = getEpisodeOutPaths(episodeId);
  const runtimeDoc = readJsonFileSafe(out.runtimeShots);
  const primaryDoc = isShotsDocLike(runtimeDoc)
    ? runtimeDoc
    : isShotsDocLike(preferredDoc)
      ? preferredDoc
      : null;
  const renderLog = readJsonFileSafe(out.renderLog);
  const qcReport = readJsonFileSafe(out.qc);
  const sidecarPlan = readJsonFileSafe(out.sidecarPlan);
  const renderModeReport = readJsonFileSafe(out.shotRenderModeReport);

  const episodeInfo = primaryDoc && isRecord(primaryDoc.episode) ? primaryDoc.episode : {};
  const profiles = isRecord(episodeInfo.profiles) ? episodeInfo.profiles : {};
  const shotIssueMap = collectShotIssueMap(qcReport);

  const renderModeByShot = new Map<
    string,
    {
      recommendedRenderMode: string | null;
      blockers: string[];
    }
  >();
  if (isRecord(renderModeReport)) {
    for (const shot of recordList(renderModeReport.shots)) {
      const shotId = str(shot.shot_id);
      if (!shotId) continue;
      renderModeByShot.set(shotId, {
        recommendedRenderMode: str(shot.recommended_render_mode),
        blockers: uniqueStrings((Array.isArray(shot.blockers) ? shot.blockers : []).map((value) => str(value)))
      });
    }
  }

  const sidecarPlanByShot = new Map<
    string,
    {
      renderer: string | null;
      acceptanceStatus: string | null;
      status: string | null;
    }
  >();
  if (isRecord(sidecarPlan)) {
    for (const plan of recordList(sidecarPlan.plans)) {
      const shotId = str(plan.shotId);
      if (!shotId) continue;
      const metadata = isRecord(plan.metadata) ? plan.metadata : {};
      sidecarPlanByShot.set(shotId, {
        renderer: str(plan.renderer) ?? str(metadata.modelName),
        acceptanceStatus: str(metadata.acceptanceStatus),
        status: str(plan.status)
      });
    }
  }

  const shotItems: EpisodeShotOpsView[] = [];
  for (const rawShot of primaryDoc?.shots ?? []) {
    if (!isRecord(rawShot)) continue;
    const shotId = str(rawShot.shot_id) ?? `shot_${shotItems.length + 1}`;
    const shotType = str(rawShot.shot_type) ?? "-";
    const renderMode = str(rawShot.render_mode) ?? "-";
    const renderModeMeta = renderModeByShot.get(shotId);
    const shotGrammar = isRecord(rawShot.shot_grammar) ? rawShot.shot_grammar : {};
    const visualObjects = recordList(rawShot.visual_objects);
    const sourcePack = isRecord(rawShot.source_pack) ? rawShot.source_pack : {};
    const sidecarPreset = isRecord(rawShot.sidecar_preset) ? rawShot.sidecar_preset : {};
    const sidecarMeta = sidecarPlanByShot.get(shotId);
    const routeReason = str(shotGrammar.route_reason) ?? str(rawShot.route_reason);
    const visualKinds = uniqueStrings(visualObjects.map((item) => str(item.kind)));
    const fallbackPolicies = uniqueStrings(visualObjects.map((item) => str(item.fallback_policy)));
    const qcReasons = shotIssueMap.get(shotId) ?? [];
    const policyTags = uniqueStrings((Array.isArray(sidecarPreset.policy_tags) ? sidecarPreset.policy_tags : []).map((item) => str(item)));
    const repairSignals = uniqueStrings([
      str(sidecarPreset.impact_preset),
      ...policyTags.filter((value) => value.toLowerCase().includes("repair")),
      ...qcReasons.filter((value) => value.toLowerCase().includes("repair"))
    ]);
    const blockers = renderModeMeta?.blockers ?? [];
    const backend = sidecarMeta?.renderer ?? str(rawShot.sidecar_renderer);
    const acceptanceStatus = sidecarMeta?.acceptanceStatus ?? str(sourcePack.acceptance_status) ?? str(rawShot.acceptance_status);
    const recommendedRenderMode = renderModeMeta?.recommendedRenderMode ?? null;
    const renderModeSummary =
      recommendedRenderMode && recommendedRenderMode !== renderMode
        ? `${renderMode} -> ${recommendedRenderMode}`
        : renderMode;

    shotItems.push({
      shotId,
      shotType,
      renderMode,
      renderModeSummary,
      recommendedRenderMode,
      backend,
      acceptanceStatus,
      sidecarStatus: sidecarMeta?.status ?? null,
      routeReason,
      routeReasonLabel: routeReason ? humanizeOpsLabel(routeReason) : "-",
      visualKinds,
      visualSummary: summarizeValues(visualKinds, 4),
      fallbackPolicies,
      fallbackSummary: summarizeValues(
        [
          ...fallbackPolicies,
          blockers.length > 0 ? `render blockers: ${blockers.map((value) => humanizeOpsLabel(value)).join(", ")}` : null
        ],
        4
      ),
      qcReasons,
      qcSummary: summarizeValues(qcReasons, 2),
      repairSignals,
      repairSummary: summarizeValues(repairSignals, 3),
      blockers
    });
  }

  const fallbackSteps = uniqueStrings([
    ...(Array.isArray(isRecord(qcReport) ? qcReport.fallback_steps_applied : undefined)
      ? (qcReport.fallback_steps_applied as unknown[]).map((value) => str(value))
      : []),
    ...(Array.isArray(isRecord(renderLog) ? renderLog.fallback_steps_applied : undefined)
      ? (renderLog.fallback_steps_applied as unknown[]).map((value) => str(value))
      : [])
  ]);
  const fallbackStage =
    str(isRecord(qcReport) ? qcReport.final_stage : undefined) ??
    str(isRecord(renderLog) ? renderLog.final_stage : undefined) ??
    null;
  const mismatchedRenderModes = shotItems.filter(
    (item) => item.recommendedRenderMode && item.recommendedRenderMode !== item.renderMode
  ).length;
  const artifactLinks: EpisodeArtifactLink[] = [
    { label: "shots", filename: "shots.json", exists: fs.existsSync(out.shots) },
    { label: "runtime shots", filename: "runtime_shots.json", exists: fs.existsSync(out.runtimeShots) },
    { label: "qc report", filename: "qc_report.json", exists: fs.existsSync(out.qc) },
    { label: "render log", filename: "render_log.json", exists: fs.existsSync(out.renderLog) },
    { label: "sidecar plan", filename: "shot_sidecar_plan.json", exists: fs.existsSync(out.sidecarPlan) },
    { label: "render mode report", filename: "shot_render_mode_report.json", exists: fs.existsSync(out.shotRenderModeReport) }
  ];
  const inspectorSeed = Object.fromEntries(
    shotItems.map((item) => [
      `shot:${item.shotId}`,
      {
        label: item.shotId,
        shotType: humanizeOpsLabel(item.shotType),
        renderModeSummary: humanizeOpsLabel(item.renderModeSummary),
        backend: item.backend ? humanizeOpsLabel(item.backend) : "-",
        acceptanceStatus: item.acceptanceStatus ? humanizeOpsLabel(item.acceptanceStatus) : "-",
        sidecarStatus: item.sidecarStatus ? humanizeOpsLabel(item.sidecarStatus) : "-",
        routeReason: item.routeReasonLabel,
        visualSummary: item.visualSummary,
        fallbackSummary: item.fallbackSummary,
        qcSummary: item.qcSummary,
        repairSummary: item.repairSummary
      }
    ])
  );

  return {
    studioProfileId: str(profiles.studio_profile_id),
    channelProfileId: str(profiles.channel_profile_id),
    mascotProfileId: str(profiles.mascot_profile_id),
    fallbackStage,
    fallbackSteps,
    backendSummary: summarizeCounts(shotItems.map((item) => item.backend)),
    acceptanceSummary: summarizeCounts(shotItems.map((item) => item.acceptanceStatus ?? item.sidecarStatus)),
    routeSummary: summarizeCounts(shotItems.map((item) => item.routeReason)),
    visualSummary: summarizeCounts(shotItems.flatMap((item) => item.visualKinds)),
    repairSummary: summarizeCounts(shotItems.flatMap((item) => item.repairSignals)),
    qcSummary: summarizeCounts(shotItems.flatMap((item) => item.qcReasons)),
    renderModeSummary:
      shotItems.length === 0
        ? "-"
        : `${summarizeCounts(shotItems.map((item) => item.renderMode))}${mismatchedRenderModes > 0 ? ` | mismatched ${mismatchedRenderModes}` : ""}`,
    artifactLinks,
    shotItems,
    inspectorSeed
  };
}

function fmtDate(value: unknown): string {
  if (typeof value !== "string") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return date.toLocaleString("ko-KR", { hour12: false });
}

function profileBrowserHref(values: Array<string | null | undefined>): string {
  const query = values
    .map((value) => str(value))
    .filter((value): value is string => Boolean(value))
    .join(" ");
  return query ? `/ui/profiles?q=${encodeURIComponent(query)}` : "/ui/profiles";
}

function badgeClass(status: string): string {
  const s = status.toUpperCase();
  if (["SUCCEEDED", "COMPLETED", "PREVIEW_READY", "UP", "READY", "OK", "ACCEPTED", "RESOLVED"].includes(s)) return "ok";
  if (["FAILED", "DOWN", "ERROR", "REJECTED", "BLOCKED"].includes(s)) return "bad";
  if (["RUNNING", "GENERATING", "PENDING", "WAITING", "WARN"].includes(s)) return "warn";
  return "muted";
}

function page(title: string, body: string): string {
  return renderUiPage(title, body);
}

function internalHeaders(withJson: boolean): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (withJson) headers["content-type"] = "application/json";
  const key = process.env.API_KEY?.trim();
  if (key) headers["x-api-key"] = key;
  return headers;
}

function parseJson(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function injectJson(app: FastifyInstance, method: "GET" | "POST", url: string, payload?: unknown) {
  const res = (await app.inject({
    method,
    url,
    payload: payload as never,
    headers: internalHeaders(payload !== undefined)
  })) as { statusCode: number; body: string };
  return { statusCode: res.statusCode, body: parseJson(res.body), raw: res.body };
}

async function enqueuePreviewVariantJob(input: {
  prisma: PrismaClient;
  queue: Queue;
  queueName: string;
  episodeId: string;
  variantId: "A" | "B";
  stylePresetId: string;
  shotsPath: string;
  outputPath: string;
  srtPath: string;
  qcReportPath: string;
  renderLogPath: string;
}): Promise<{ jobId: string; bullmqJobId: string }> {
  const job = await input.prisma.job.create({
    data: {
      episodeId: input.episodeId,
      type: "RENDER_PREVIEW",
      status: "QUEUED",
      progress: 0,
      maxAttempts: PREVIEW_JOB_DEFAULT_ATTEMPTS,
      retryBackoffMs: PREVIEW_JOB_DEFAULT_BACKOFF_MS
    }
  });

  const payload: EpisodeJobPayload = {
    jobDbId: job.id,
    episodeId: input.episodeId,
    schemaChecks: [],
    pipeline: {},
    render: {
      shotsPath: input.shotsPath,
      outputPath: input.outputPath,
      srtPath: input.srtPath,
      qcReportPath: input.qcReportPath,
      renderLogPath: input.renderLogPath
    }
  };

  const queued = await input.queue.add("RENDER_PREVIEW", payload, {
    jobId: job.id,
    attempts: PREVIEW_JOB_DEFAULT_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: PREVIEW_JOB_DEFAULT_BACKOFF_MS
    },
    ...apiQueueRetentionOptions()
  });

  const bullmqJobId = String(queued.id);

  await input.prisma.job.update({
    where: { id: job.id },
    data: {
      bullmqJobId,
      status: "QUEUED"
    }
  });

  await input.prisma.jobLog.createMany({
    data: [
      {
        jobId: job.id,
        level: "info",
        message: "Transition -> QUEUED",
        details: {
          source: "ui:ab_preview",
          queueName: input.queueName,
          variantId: input.variantId,
          stylePresetId: input.stylePresetId
        } as Prisma.InputJsonValue
      },
      {
        jobId: job.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: {
          source: "ui:ab_preview",
          queueName: input.queueName,
          bullmqJobId,
          shotsPath: input.shotsPath,
          outputPath: input.outputPath,
          variantId: input.variantId
        } as Prisma.InputJsonValue
      }
    ]
  });

  return { jobId: job.id, bullmqJobId };
}

async function ensureDefaultChannel(prisma: PrismaClient): Promise<{ id: string; name: string }> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { name: DEMO_USER_NAME },
    create: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME }
  });

  const existing = await prisma.channel.findFirst({ where: { userId: user.id, name: DEMO_CHANNEL_NAME }, orderBy: { createdAt: "asc" } });
  if (existing) return { id: existing.id, name: existing.name };

  const created = await prisma.channel.create({ data: { userId: user.id, name: DEMO_CHANNEL_NAME } });
  return { id: created.id, name: created.name };
}

function snapshotBible(): unknown {
  const p = path.join(getOutRoot(), "channel-bible-snapshot.json");
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf8")) as unknown;
    } catch {
      // ignore broken snapshot
    }
  }
  return {
    channel: { name: "Eraser Cat", language: "ko-KR" },
    style: { tone: "friendly", pacing: "medium" },
    template: { opening: "hook", body: "development", closing: "payoff" }
  };
}

async function loadBibleState(prisma: PrismaClient, patch?: Partial<ChannelBibleState>): Promise<ChannelBibleState> {
  const latest = await prisma.channelBible.findFirst({ orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }] });
  const base: ChannelBibleState = {
    source: latest ? `DB: ${latest.id}` : "Snapshot",
    channelId: latest?.channelId ?? "",
    version: latest?.version ?? 1,
    schemaId: latest?.schemaId ?? DEFAULT_CHANNEL_BIBLE_SCHEMA,
    jsonText: JSON.stringify(latest?.json ?? snapshotBible(), null, 2),
    isActive: latest?.isActive ?? true
  };
  return { ...base, ...patch };
}

function bibleHtml(state: ChannelBibleState): string {
  const errors = (state.validationErrors ?? []).map((x) => `<li>${esc(x)}</li>`).join("");
  const statusBlock = state.validationErrors && state.validationErrors.length > 0
    ? `<div class="error"><strong>Validation failed</strong><ul>${errors}</ul></div>`
    : "";
  return page("ChannelBible", `<section class="card"><h1>ChannelBible Editor</h1><p>Source: ${esc(state.source)}</p>${state.message ? `<div class="notice">${esc(state.message)}</div>` : ""}${state.error ? `<div class="error">${esc(state.error)}</div>` : ""}${statusBlock}
<form method="post" action="/ui/channel-bible" class="grid">
<div class="grid two"><label>channelId<input name="channelId" value="${esc(state.channelId)}" placeholder="optional"/></label><label>version<input name="version" value="${esc(state.version)}"/></label><label>schemaId<input name="schemaId" value="${esc(state.schemaId)}"/></label><label>isActive<select name="isActive"><option value="true" ${state.isActive ? "selected" : ""}>true</option><option value="false" ${state.isActive ? "" : "selected"}>false</option></select></label></div>
<label>JSON<textarea name="jsonText">${esc(state.jsonText)}</textarea></label>
<div class="actions"><button type="submit" name="mode" value="validate">Validate</button><button type="submit" name="mode" value="save">Save</button></div></form></section>`);
}

function classifyErrorType(message: string): { label: string; badge: string; hint: string } {
  const text = message.toLowerCase();
  if (text.includes("503") || text.includes("unavailable") || text.includes("redis")) {
    return { label: "ServiceUnavailable", badge: "bad", hint: "Check Redis/Queue status on the Health page." };
  }
  if (text.includes("404") || text.includes("not found")) {
    return { label: "NotFound", badge: "warn", hint: "Verify the ID and check existence from list pages." };
  }
  if (text.includes("400") || text.includes("required") || text.includes("validation")) {
    return { label: "Validation", badge: "warn", hint: "Check input format and try again." };
  }
  return { label: "UnknownError", badge: "bad", hint: "Check Jobs/Health logs and retry if needed." };
}

function simpleErrorHtml(message: string): string {
  const category = classifyErrorType(message);
  return page("Error", `<section class="card"><h1>Error</h1><p>Category: <span class="badge ${category.badge}">${category.label}</span></p><div class="error">${esc(message)}</div><p class="notice">${esc(category.hint)}</p><p><a href="/ui">Back to Dashboard</a></p></section>`);
}

export function registerUiRoutes(input: RegisterUiRoutesInput): void {
  const { app, prisma, queue, queueName } = input;

  app.get("/", async (_request, reply) => reply.redirect("/ui"));

        app.get("/ui", async (request, reply) => {
    let redisStatus = "unknown";
    let queueReady = false;
    let dbStatus = "unknown";
    let minioStatus = "unknown";
    let overall = "down";

    try {
      const [health, healthz] = await Promise.all([
        injectJson(app, "GET", "/health"),
        injectJson(app, "GET", "/healthz")
      ]);
      const h = isRecord(health.body) && isRecord(health.body.data) ? health.body.data : {};
      const hz = isRecord(healthz.body) && isRecord(healthz.body.data) ? healthz.body.data : {};
      const services = isRecord(hz.services) ? hz.services : {};
      redisStatus = isRecord(services.redis) && typeof services.redis.status === "string"
        ? services.redis.status
        : (typeof h.redis === "string" ? h.redis : "unknown");
      queueReady = h.queueReady === true;
      dbStatus = isRecord(services.database) && typeof services.database.status === "string" ? services.database.status : "unknown";
      minioStatus = isRecord(services.minio) && typeof services.minio.status === "string" ? services.minio.status : "unknown";
      overall = hz.ok === true ? "up" : "down";
    } catch {
      // keep fallback status values
    }
    const body = buildDashboardPageBody({
      flash: flashHtml(request.query),
      overall: `<span class="badge ${badgeClass(overall)}">${esc(overall)}</span>`,
      dbStatus: `<span class="badge ${badgeClass(dbStatus)}">${esc(dbStatus)}</span>`,
      redisStatus: `<span class="badge ${badgeClass(redisStatus)}">${esc(redisStatus)}</span>`,
      minioStatus: `<span class="badge ${badgeClass(minioStatus)}">${esc(minioStatus)}</span>`,
      queueReady: `<span class="badge ${queueReady ? "ok" : "bad"}">${esc(queueReady)}</span>`
    });

    return reply.type("text/html; charset=utf-8").send(page("Dashboard", body));
  });

  app.get("/ui/health", async (_request, reply) => {
    const [healthz, health] = await Promise.all([injectJson(app, "GET", "/healthz"), injectJson(app, "GET", "/health")]);

    if (healthz.statusCode >= 400 || !isRecord(healthz.body) || !isRecord(healthz.body.data)) {
      const fallbackMessage =
        isRecord(healthz.body) && typeof healthz.body.error === "string"
          ? healthz.body.error
          : `healthz unavailable (${healthz.statusCode})`;

      return reply.type("text/html; charset=utf-8").send(page("Health", `<section class="card"><h1>Health Report</h1><div class="error">${esc(fallbackMessage)}</div><p><a href="/health">Open /health JSON</a></p></section>`));
    }

    const data = healthz.body.data;
    const services = isRecord(data.services) ? data.services : {};
    const fixes = isRecord(data.fixes) ? data.fixes : {};
    const overallOk = data.ok === true;
    const checkedAt = typeof data.checkedAt === "string" ? data.checkedAt : "";

    const serviceRows = [
      { name: "database", value: services.database },
      { name: "redis", value: services.redis },
      { name: "minio", value: services.minio }
    ]
      .map(({ name, value }) => {
        const record = isRecord(value) ? value : {};
        const status = typeof record.status === "string" ? record.status : "unknown";
        const detail = JSON.stringify(record, null, 2);
        return `<tr><td>${esc(name)}</td><td><span class="badge ${badgeClass(status)}">${esc(status)}</span></td><td><pre>${esc(detail)}</pre></td></tr>`;
      })
      .join("");

    const commandRows = Object.entries(fixes)
      .map(([key, command]) => `<tr><td>${esc(key)}</td><td><code>${esc(command)}</code></td></tr>`)
      .join("");

    const baseHealthData = isRecord(health.body) && isRecord(health.body.data) ? health.body.data : {};
    const nowMs = Date.now();
    cleanupRunProfileDedupCache(nowMs);
    const dedupEntries = Array.from(runProfileDedupCache.entries())
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 10)
      .map(([key, value]) => {
        const ageSec = Math.max(0, Math.floor((nowMs - value.at) / 1000));
        return `<tr><td><code>${esc(key)}</code></td><td>${esc(value.jobId ?? "-")}</td><td>${ageSec}s ago</td></tr>`;
      })
      .join("");

    return reply.type("text/html; charset=utf-8").send(
      page(
        "Health",
        `<section class="card"><h1>Health Report</h1><p>overall: <span class="badge ${overallOk ? "ok" : "bad"}">${overallOk ? "up" : "down"}</span></p><p>checkedAt: ${esc(checkedAt)}</p><p>queue: ${esc(baseHealthData.queue ?? "-")} / redis=${esc(baseHealthData.redis ?? "-")} / queueReady=${esc(baseHealthData.queueReady ?? "-")}</p>${overallOk ? '<div class="notice">Core services are healthy.</div>' : '<div class="error">One or more services are degraded. Run recovery commands below.</div>'}</section><section class="card"><h2>Run Profile Dedup Guard</h2><p>window: ${RUN_PROFILE_DEDUP_WINDOW_MS}ms / active keys: ${runProfileDedupCache.size} / hits: ${runProfileDedupStats.hits} / enqueues: ${runProfileDedupStats.enqueues}</p><div class="actions"><form method="post" action="/ui/health/dedup/reset" class="inline"><button type="submit" class="secondary">Reset dedup cache/stats</button></form></div><table><thead><tr><th>Dedup Key</th><th>Job</th><th>Age</th></tr></thead><tbody>${dedupEntries || '<tr><td colspan="3"><div class="notice">No recent dedup entries.</div></td></tr>'}</tbody></table></section><section class="card"><h2>Service Status</h2><table><thead><tr><th>Service</th><th>Status</th><th>Details</th></tr></thead><tbody>${serviceRows}</tbody></table></section><section class="card"><h2>Recovery Commands (PowerShell)</h2><table><thead><tr><th>Name</th><th>Command</th></tr></thead><tbody>${commandRows}</tbody></table></section>`
      )
    );
  });

  app.post("/ui/health/dedup/reset", async (_request, reply) => {
    runProfileDedupCache.clear();
    runProfileDedupStats.hits = 0;
    runProfileDedupStats.enqueues = 0;
    return reply.redirect(`/ui/health?message=${encodeURIComponent("Run profile dedup cache/stats reset.")}`);
  });

  app.post("/ui/actions/demo-extreme", async (_request, reply) => {
    const res = await injectJson(app, "POST", "/demo/extreme", {});
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Run Extreme Demo failed (${res.statusCode})`;
      return reply.code(res.statusCode).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && typeof res.body.data.jobId === "string" ? res.body.data.jobId : null;
    if (!jobId) return reply.code(500).type("text/html; charset=utf-8").send(simpleErrorHtml("Run Extreme Demo returned no jobId"));
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.post("/ui/actions/generate-preview", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const topic = b(body, "topic") ?? "UI Preview Demo";
    const targetDurationSec = n(body.targetDurationSec, 600);
    const channelId = b(body, "channelId");

    const payload: JsonRecord = {
      topic,
      targetDurationSec,
      jobType: "GENERATE_BEATS",
      pipeline: {
        stopAfterPreview: true,
        autoRenderFinal: false
      }
    };
    if (channelId) {
      payload.channelId = channelId;
    }

    const res = await injectJson(app, "POST", "/api/episodes", payload);
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Generate Preview failed (${res.statusCode})`;
      return reply.code(res.statusCode).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.code(500).type("text/html; charset=utf-8").send(simpleErrorHtml("Generate Preview returned no jobId"));
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.post("/ui/actions/generate-full", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const topic = b(body, "topic") ?? "UI Full Pipeline Demo";
    const targetDurationSec = n(body.targetDurationSec, 600);
    const channelId = b(body, "channelId");

    const payload: JsonRecord = {
      topic,
      targetDurationSec,
      jobType: "GENERATE_BEATS",
      pipeline: {
        stopAfterPreview: false,
        autoRenderFinal: true
      }
    };
    if (channelId) {
      payload.channelId = channelId;
    }

    const res = await injectJson(app, "POST", "/api/episodes", payload);
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Run full pipeline failed (${res.statusCode})`;
      return reply.code(res.statusCode).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.code(500).type("text/html; charset=utf-8").send(simpleErrorHtml("Run full pipeline returned no jobId"));
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.get("/ui/channel-bible", async (request, reply) => {
    const state = await loadBibleState(prisma, {
      ...(q(request.query, "message") ? { message: q(request.query, "message") } : {}),
      ...(q(request.query, "error") ? { error: q(request.query, "error") } : {})
    });
    return reply.type("text/html; charset=utf-8").send(bibleHtml(state));
  });

  app.post("/ui/channel-bible", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const mode = b(body, "mode") ?? "validate";
    const jsonText = b(body, "jsonText") ?? "";
    const schemaId = b(body, "schemaId") ?? DEFAULT_CHANNEL_BIBLE_SCHEMA;
    const requestedChannelId = b(body, "channelId");
    const requestedVersion = n(body.version, 1);
    const isActive = bool(body.isActive, true);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      const state = await loadBibleState(prisma, {
        source: "Form",
        channelId: requestedChannelId ?? "",
        version: requestedVersion,
        schemaId,
        jsonText,
        isActive,
        error: error instanceof Error ? error.message : "Invalid JSON",
        validationErrors: ["Invalid JSON syntax"]
      });
      return reply.type("text/html; charset=utf-8").send(bibleHtml(state));
    }
    const validation = validator.validate(schemaId, parsed);
    if (!validation.ok || mode === "validate") {
      const state = await loadBibleState(prisma, {
        source: "Form",
        channelId: requestedChannelId ?? "",
        version: requestedVersion,
        schemaId,
        jsonText,
        isActive,
        ...(validation.ok
          ? { message: "Validation passed." }
          : { error: "Validation failed.", validationErrors: validation.errors.map((e) => `${e.path} ${e.message}`) })
      });
      return reply.type("text/html; charset=utf-8").send(bibleHtml(state));
    }

    const channel = requestedChannelId ? { id: requestedChannelId, name: requestedChannelId } : await ensureDefaultChannel(prisma);
    const latest = await prisma.channelBible.findFirst({ where: { channelId: channel.id }, orderBy: { version: "desc" }, select: { version: true } });
    const version = Math.max(requestedVersion, (latest?.version ?? 0) + 1);
    const hash = sha256Hex(stableStringify(parsed));

    const existing = await prisma.channelBible.findUnique({ where: { hash } });
    if (existing) return reply.redirect(`/ui/channel-bible?message=${encodeURIComponent(`Already exists: ${existing.id}`)}`);

    if (isActive) {
      await prisma.channelBible.updateMany({ where: { channelId: channel.id, isActive: true }, data: { isActive: false } });
    }

    const created = await prisma.channelBible.create({
      data: {
        channelId: channel.id,
        version,
        hash,
        schemaId,
        json: parsed as Prisma.InputJsonValue,
        isActive
      }
    });

    return reply.redirect(`/ui/channel-bible?message=${encodeURIComponent(`Saved: ${created.id}`)}`);
  });

  app.get("/ui/profiles", async (request, reply) => {
    const profileSearch = q(request.query, "q") ?? "";
    const profileSearchLower = profileSearch.trim().toLowerCase();
    const matchesProfileSearch = (...parts: Array<string | null | undefined>): boolean => {
      if (!profileSearchLower) return true;
      return parts
        .map((part) => (typeof part === "string" ? part.toLowerCase() : ""))
        .some((part) => part.includes(profileSearchLower));
    };

    const { sources, bundleCards, evidenceRows } = collectProfileBrowserData();
    let bibleRows = "";
    let bibleCount = 0;
    let activeBibleCount = 0;
    let dbNotice = "";

    try {
      const bibles = await prisma.channelBible.findMany({
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        take: 30,
        include: {
          channel: {
            select: {
              id: true,
              name: true,
              language: true
            }
          }
        }
      });

      bibleCount = bibles.length;
      activeBibleCount = bibles.filter((item) => item.isActive).length;
      const filteredBibles = bibles.filter((item) =>
        matchesProfileSearch(
          item.channel.name,
          item.channel.id,
          item.id,
          readStringAtPath(item.json, ["style", "tone"]),
          readStringAtPath(item.json, ["style", "pacing"]),
          readStringAtPath(item.json, ["channel", "name"]),
          readStringAtPath(item.json, ["channel", "language"])
        )
      );
      bibleRows = filteredBibles
        .map((item) => {
          const tone = readStringAtPath(item.json, ["style", "tone"]) ?? "-";
          const pacing = readStringAtPath(item.json, ["style", "pacing"]) ?? "-";
          const stylePresetCount = countBibleStylePresets(item.json);
          const policyTerms = countBiblePolicyTerms(item.json);
          const rawHref = `/channel-bible/${encodeURIComponent(item.id)}`;
          return `<tr><td><div class="table-note"><strong>${esc(item.channel.name)}</strong><span class="muted-text">${esc(
            item.channel.id
          )}</span><span class="mono">${esc(item.id)}</span></div></td><td><strong>v${esc(item.version)}</strong></td><td><span class="badge ${item.isActive ? "ok" : "muted"}">${item.isActive ? "active" : "history"}</span></td><td>${esc(
            item.channel.language ?? "-"
          )}</td><td>${esc(tone)} / ${esc(pacing)}</td><td>${esc(String(stylePresetCount))} presets / ${esc(
            String(policyTerms)
          )} rules</td><td>${fmtDate(item.updatedAt.toISOString())}</td><td><div class="inline-actions"><a href="/ui/channel-bible">Editor</a><a href="${rawHref}">Raw JSON</a></div></td></tr>`;
        })
        .join("");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dbNotice = `<div class="error">ChannelBible query unavailable: ${esc(message)}</div>`;
    }

    const filteredBundleCards = bundleCards.filter((card) =>
      matchesProfileSearch(
        card.bundle,
        card.channelDomain,
        card.studioProfileId,
        card.channelProfileId,
        card.mascotProfileId,
        card.studioLabel,
        card.channelLabel,
        card.mascotLabel,
        card.tone,
        card.pacing,
        card.infoPriority,
        card.finishProfileId,
        card.impactPreset,
        card.qcPreset,
        card.insertSummary,
        card.gestureSummary
      )
    );
    const filteredEvidenceRows = evidenceRows.filter((row) =>
      matchesProfileSearch(
        row.scenario,
        row.bundle,
        row.status,
        row.studioProfileId,
        row.channelProfileId,
        row.mascotProfileId,
        row.profileSummary,
        row.runtimeSummary,
        row.sourceLabel,
        row.artifactRelativePath
      )
    );

    const bundleCount = new Set(filteredBundleCards.map((card) => card.bundle)).size;
    const summaryCards = [
      {
        label: "Runtime Combos",
        value: String(filteredBundleCards.length),
        tone: "ok" as UiBadgeTone,
        hint: `${bundleCount} bundles observed from rollout smoke artifacts`
      },
      {
        label: "Evidence Rows",
        value: String(filteredEvidenceRows.length),
        tone: "muted" as UiBadgeTone,
        hint: `${sources.filter((source) => source.exists).length}/${sources.length} artifact roots available`
      },
      {
        label: "Active Bibles",
        value: String(activeBibleCount),
        tone: activeBibleCount > 0 ? ("ok" as UiBadgeTone) : ("warn" as UiBadgeTone),
        hint: bibleCount > 0 ? `${bibleCount} recent bible versions loaded from DB` : "DB unavailable or no channel bibles yet"
      },
      {
        label: "Blocked Signals",
        value: String(filteredEvidenceRows.filter((row) => row.status === "blocked").length),
        tone: "bad" as UiBadgeTone,
        hint: "runtime profile evidence with QC-reported blockers"
      }
    ]
      .map((card) => `<div class="summary-card"><span class="badge ${card.tone}">${esc(card.label)}</span><div class="metric">${esc(card.value)}</div><div class="caption">${esc(card.hint)}</div></div>`)
      .join("");

    const sourceRows = sources
      .map((source) => {
        const tone: UiBadgeTone = !source.exists ? "bad" : source.recordCount > 0 ? "ok" : "warn";
        const label = !source.exists ? "missing" : source.recordCount > 0 ? `${source.recordCount} smoke reports` : "empty";
        const meta = compact([
          source.exists ? "scan ok" : "root missing",
          source.latestGeneratedAt ? `latest ${fmtDate(source.latestGeneratedAt)}` : "no profile evidence"
        ]);
        return `<div class="status-row"><div class="stack"><span class="label"><strong>${esc(source.label)}</strong></span><span class="mono">${esc(source.outRoot)}</span><span class="muted-text">${esc(meta)}</span></div><div class="inline-actions"><span class="badge ${tone}">${esc(label)}</span><button type="button" class="secondary" data-copy="${esc(source.outRoot)}">Copy path</button></div></div>`;
      })
      .join("");

    const bundleCardsHtml = filteredBundleCards
      .map((card) => {
        const rawHref = `/ui/rollouts/artifact?path=${encodeURIComponent(card.smokeArtifactPath)}`;
        const renderLogHref = card.renderLogPath
          ? `/ui/rollouts/artifact?path=${encodeURIComponent(card.renderLogPath)}`
          : null;
        const deepLinkHref = profileBrowserHref([card.bundle, card.studioProfileId, card.channelProfileId, card.mascotProfileId]);
        return `<article style="padding:14px;border:1px solid #d8e1ec;border-radius:14px;background:linear-gradient(180deg,#f9fcff,#ffffff);display:grid;gap:10px"><div class="inline-actions"><span class="badge ok">${esc(
          card.bundle
        )}</span><span class="badge muted">${esc(card.studioProfileId)}</span><span class="badge muted">${esc(
          card.channelProfileId
        )}</span><span class="badge muted">${esc(card.mascotProfileId)}</span></div><div><h3 style="margin:0">${esc(
          card.channelLabel
        )} / ${esc(card.mascotLabel)}</h3><p class="muted-text" style="margin:6px 0 0">studio: ${esc(
          card.studioLabel
        )} | domain: ${esc(card.channelDomain)} | source: ${esc(card.sourceLabel)}</p></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px"><div class="form-card"><strong>Tone / Pacing</strong><span>${esc(
          card.tone
        )} / ${esc(card.pacing)}</span><small>information priority: ${esc(card.infoPriority)}</small></div><div class="form-card"><strong>Finish / Sidecar</strong><span>${esc(
          card.finishProfileId
        )}</span><small>impact ${esc(card.impactPreset)} | qc ${esc(card.qcPreset)}</small></div><div class="form-card"><strong>Insert / Gesture Bias</strong><span>${esc(
          card.insertSummary || "-"
        )}</span><small>gestures: ${esc(card.gestureSummary || "-")}</small></div></div><div class="quick-links"><a href="${deepLinkHref}">Focus Bundle</a><a href="${rawHref}">Smoke JSON</a>${
          renderLogHref ? `<a href="${renderLogHref}">Render Log</a>` : ""
        }<a href="/ui/channel-bible">Open ChannelBible</a><a href="/ui/benchmarks">Open Benchmarks</a></div><p class="mono" style="margin:0">${esc(
          card.smokeArtifactRelativePath
        )}</p><p class="muted-text" style="margin:0">generated: ${esc(fmtDate(card.generatedAt))}</p></article>`;
      })
      .join("");

    const evidenceTableRows = filteredEvidenceRows
      .map((row) => {
        const rawHref = `/ui/rollouts/artifact?path=${encodeURIComponent(row.smokeArtifactPath)}`;
        const renderLogHref = row.renderLogPath
          ? `/ui/rollouts/artifact?path=${encodeURIComponent(row.renderLogPath)}`
          : null;
        const deepLinkHref = profileBrowserHref([row.bundle, row.studioProfileId, row.channelProfileId, row.mascotProfileId]);
        return `<tr><td><div class="table-note"><strong>${esc(row.scenario)}</strong><span class="muted-text">${esc(
          row.bundle
        )}</span><span class="mono">${esc(row.artifactRelativePath)}</span><div class="inline-actions"><a href="${deepLinkHref}">Focus</a><a href="${rawHref}">Smoke JSON</a>${
          renderLogHref ? `<a href="${renderLogHref}">Render Log</a>` : ""
        }<a href="/ui/benchmarks">Benchmarks</a></div></div></td><td><span class="badge ${row.tone}">${esc(
          humanizeOpsLabel(row.status)
        )}</span></td><td><div class="stack"><strong>${esc(row.channelProfileId)}</strong><span class="muted-text">${esc(
          `${row.studioProfileId} / ${row.mascotProfileId}`
        )}</span><span class="muted-text">${esc(row.profileSummary || "-")}</span></div></td><td>${esc(
          row.runtimeSummary || "-"
        )}</td><td>${fmtDate(row.generatedAt)}</td><td><div class="stack"><strong>${esc(row.sourceLabel)}</strong><span class="mono">${esc(
          row.sourcePath
        )}</span></div></td></tr>`;
      })
      .join("");

    const flash = `${flashHtml(request.query)}${dbNotice}`;
    const body = `<section class="card dashboard-shell"><div class="section-head"><div><h1>Profile Browser</h1><p class="section-intro">Multi-channel operator browser for active ChannelBible state and runtime profile evidence captured by benchmark and regression smoke runs.</p></div><div class="quick-links"><a href="/ui/channel-bible">Open ChannelBible</a><a href="/ui/benchmarks">Open Benchmarks</a><a href="/ui/rollouts">Open Rollouts</a></div></div>${flash}<div class="summary-grid">${summaryCards}</div></section><section class="card dashboard-shell"><div class="section-head"><div><h2>Artifact Sources</h2><span class="muted-text">Profile evidence is read from shared out/ roots without rerunning sidecar benchmarks.</span></div>${
      profileSearch
        ? `<div class="quick-links"><a href="/ui/profiles">Clear Filter</a><span class="badge warn">filter ${esc(profileSearch)}</span></div>`
        : ""
    }</div><div class="form-card"><div class="field"><label for="profiles-search">Deep-link filter</label><input id="profiles-search" type="search" data-table-filter="profiles-evidence-table" aria-label="Filter profiles by bundle or profile id" value="${esc(
      profileSearch
    )}" placeholder="Search by bundle / studio_default / economy_channel / med_dog"/></div><small>This filter is also applied server-side for direct links such as <code>/ui/profiles?q=economy_channel</code>.</small></div><div class="status-list">${sourceRows || '<div class="notice">No artifact sources configured.</div>'}</div></section><section class="card"><div class="section-head"><h2>Active Channel Bibles</h2><input type="search" data-table-filter="profiles-bible-table" aria-label="Filter active channel bibles" value="${esc(
      profileSearch
    )}" placeholder="Search by channel / tone / pacing / version"/></div><div class="table-wrap"><table id="profiles-bible-table"><thead><tr><th>Channel</th><th>Version</th><th>Status</th><th>Language</th><th>Tone / Pacing</th><th>Presets / Rules</th><th>Updated</th><th>Actions</th></tr></thead><tbody>${
      bibleRows || `<tr><td colspan="8"><div class="notice">No ChannelBible rows available.</div></td></tr>`
    }</tbody></table></div></section><section class="card"><div class="section-head"><h2>Runtime Profile Bundles</h2><span class="muted-text">Latest resolved studio/channel/mascot combinations observed in smoke artifacts.</span></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">${bundleCardsHtml || '<div class="notice">No runtime profile bundles found.</div>'}</div></section><section class="card"><div class="section-head"><h2>Profile Runtime Evidence</h2><input type="search" data-table-filter="profiles-evidence-table" aria-label="Filter profile runtime evidence" value="${esc(
      profileSearch
    )}" placeholder="Search by scenario / bundle / profile / source"/></div><div class="table-wrap"><table id="profiles-evidence-table"><thead><tr><th>Scenario</th><th>Status</th><th>Profiles</th><th>Runtime Summary</th><th>Generated</th><th>Source</th></tr></thead><tbody>${
      evidenceTableRows || `<tr><td colspan="6"><div class="notice">No profile runtime evidence found.</div></td></tr>`
    }</tbody></table></div></section>`;

    return reply.type("text/html; charset=utf-8").send(page("Profile Browser", body));
  });

  app.get("/ui/episodes", async (request, reply) => {
    const rows = await prisma.episode.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        channel: { select: { name: true } },
        jobs: { orderBy: { createdAt: "desc" }, take: 1, select: { type: true, status: true } }
      }
    });

    const styleOptions = STYLE_PRESET_VALUES
      .map((id) => `<option value="${id}">${id}</option>`)
      .join("");

    const list = rows
      .map((row) => {
        const style = readEpisodeStyleConfig(row as unknown as JsonRecord);
        const quickRun = `<form method="post" action="/ui/episodes/${esc(row.id)}/run-profile" class="inline" data-run-group="episode-${esc(row.id)}"><input type="hidden" name="profile" value="preview"/><input type="hidden" name="stylePresetId" value="${esc(style.stylePresetId)}"/><input type="hidden" name="hookBoost" value="${esc(style.hookBoost.toFixed(2))}"/><input type="hidden" name="returnTo" value="episodes"/><button type="submit">Preview</button></form><form method="post" action="/ui/episodes/${esc(row.id)}/run-profile" class="inline" data-run-group="episode-${esc(row.id)}"><input type="hidden" name="profile" value="full"/><input type="hidden" name="stylePresetId" value="${esc(style.stylePresetId)}"/><input type="hidden" name="hookBoost" value="${esc(style.hookBoost.toFixed(2))}"/><input type="hidden" name="returnTo" value="episodes"/><button type="submit" class="secondary">Full</button></form><form method="post" action="/ui/episodes/${esc(row.id)}/run-profile" class="inline" data-run-group="episode-${esc(row.id)}"><input type="hidden" name="profile" value="render_only"/><input type="hidden" name="stylePresetId" value="${esc(style.stylePresetId)}"/><input type="hidden" name="hookBoost" value="${esc(style.hookBoost.toFixed(2))}"/><input type="hidden" name="returnTo" value="episodes"/><button type="submit" class="secondary">Render</button></form>`;
        return `<tr data-episode-row="${esc(row.id)}"><td><a href="/ui/episodes/${esc(row.id)}">${esc(row.id)}</a></td><td>${esc(row.topic)}</td><td data-col="status"><span class="badge ${badgeClass(row.status)}">${esc(row.status)}</span></td><td>${esc(row.channel.name)}</td><td>${esc(style.stylePresetId)} / ${style.hookBoost.toFixed(2)}</td><td data-col="latestJob">${esc(row.jobs[0] ? `${row.jobs[0].type} (${row.jobs[0].status})` : "-")}</td><td>${esc(row.targetDurationSec)}s</td><td>${fmtDate(row.createdAt.toISOString())}</td><td>${quickRun}</td></tr>`;
      })
      .join("");

    const autoRefreshScript = `<script>(() => {
  const table = document.getElementById('episodes-table');
  if (!(table instanceof HTMLTableElement)) return;
  const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const badgeClass = (status) => {
    const text = String(status || '').toUpperCase();
    if (text === 'COMPLETED' || text === 'SUCCEEDED') return 'ok';
    if (text === 'FAILED' || text === 'ERROR') return 'bad';
    if (text === 'RUNNING' || text === 'QUEUED' || text === 'PENDING') return 'warn';
    return 'muted';
  };
  const updateRows = (episodes) => {
    const map = new Map();
    for (const row of episodes) {
      if (!row || typeof row !== 'object') continue;
      const id = String(row.id || '').trim();
      if (!id) continue;
      map.set(id, row);
    }
    document.querySelectorAll('tr[data-episode-row]').forEach((tr) => {
      if (!(tr instanceof HTMLTableRowElement)) return;
      const id = String(tr.dataset.episodeRow || '').trim();
      if (!id || !map.has(id)) return;
      const row = map.get(id);
      const statusCell = tr.querySelector('td[data-col="status"]');
      const latestCell = tr.querySelector('td[data-col="latestJob"]');
      if (statusCell instanceof HTMLTableCellElement) {
        const status = String(row.status || 'UNKNOWN');
        statusCell.innerHTML = '<span class="badge ' + badgeClass(status) + '">' + esc(status) + '</span>';
      }
      if (latestCell instanceof HTMLTableCellElement) {
        const latest = Array.isArray(row.jobs) && row.jobs.length > 0 ? row.jobs[0] : null;
        const latestText = latest && typeof latest === 'object'
          ? String(latest.type || '-') + ' (' + String(latest.status || '-') + ')'
          : '-';
        latestCell.textContent = latestText;
      }
    });
  };
  const poll = async () => {
    try {
      const res = await fetch('/api/episodes', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('poll failed: ' + res.status);
      const json = await res.json();
      const data = Array.isArray(json && json.data) ? json.data : [];
      updateRows(data);
    } catch (_) {
      // keep silent; base page still works without live refresh
    }
  };
  let timer = null;
  const start = () => {
    if (timer !== null) return;
    timer = setInterval(() => { void poll(); }, 7000);
  };
  const stop = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };
  const onVisibility = () => {
    if (document.hidden) {
      stop();
      return;
    }
    void poll();
    start();
  };
  void poll();
  start();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('beforeunload', () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
  });
})();</script>`;
    const episodesBody = buildEpisodesPageBody({
      flash: flashHtml(request.query),
      styleOptions,
      defaultHookBoost: DEFAULT_HOOK_BOOST,
      rows: list,
      autoRefreshScript
    });
    return reply.type("text/html; charset=utf-8").send(page("Episodes", episodesBody));
  });

  app.post("/ui/episodes", async (request, reply) => {
    const body = request.body;
    const topic = b(body, "topic");
    if (!topic) return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("topic is required"));

    const stylePresetId = normalizeStylePresetId(b(body, "stylePresetId"));
    const hookBoost = parseHookBoost(b(body, "hookBoost"), DEFAULT_HOOK_BOOST);

    const payload: JsonRecord = {
      topic,
      targetDurationSec: n(isRecord(body) ? body.targetDurationSec : undefined, 600),
      stylePresetId,
      hookBoost,
      ...(b(body, "channelId") ? { channelId: b(body, "channelId") } : {}),
      ...(b(body, "jobType") ? { jobType: b(body, "jobType") } : {})
    };
    const mode = b(body, "pipelineMode");
    const pipeline = pipelineFromMode(mode);
    if (pipeline) {
      payload.pipeline = pipeline;
    }

    const res = await injectJson(app, "POST", "/api/episodes", payload);
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Episode create failed (${res.statusCode})`;
      return reply.code(res.statusCode).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.redirect(`/ui/episodes?message=${encodeURIComponent("Episode created")}`);
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.get("/ui/episodes/:id", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }
    const res = await injectJson(app, "GET", `/api/episodes/${encodeURIComponent(id)}`);
    if (res.statusCode >= 400 || !isRecord(res.body) || !isRecord(res.body.data)) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Episode not found: ${id}`;
      return reply.code(res.statusCode >= 400 ? res.statusCode : 404).type("text/html; charset=utf-8").send(simpleErrorHtml(msg));
    }

    const data = res.body.data;
    const episode = isRecord(data.episode) ? data.episode : {};
    const style = readEpisodeStyleConfig(episode);
    const styleHidden = `<input type="hidden" name="stylePresetId" value="${esc(style.stylePresetId)}"/><input type="hidden" name="hookBoost" value="${esc(style.hookBoost.toFixed(2))}"/>`;
    const artifacts = isRecord(data.artifacts) ? data.artifacts : {};
    const jobs = Array.isArray(data.jobs) ? data.jobs.filter((x): x is JsonRecord => isRecord(x)) : [];
    const localOut = getEpisodeOutPaths(id);
    const previewExists = artifacts.previewExists === true || fs.existsSync(localOut.preview);
    const finalExists = artifacts.finalExists === true || fs.existsSync(localOut.final);
    const qcExists = fs.existsSync(localOut.qc);
    const uploadManifestExists =
      artifacts.uploadManifestExists === true ||
      fs.existsSync(path.join(localOut.outDir, "upload_manifest.json"));
    const previewUrl = previewExists ? toEpisodeArtifactUrl(id, "preview.mp4") : "";
    const previewAExists = fs.existsSync(path.join(localOut.outDir, "preview_A.mp4"));
    const previewBExists = fs.existsSync(path.join(localOut.outDir, "preview_B.mp4"));
    const previewAUrl = previewAExists ? toEpisodeArtifactUrl(id, "preview_A.mp4") : "";
    const previewBUrl = previewBExists ? toEpisodeArtifactUrl(id, "preview_B.mp4") : "";
    const qcReport = readJsonFileSafe(localOut.qc);
    const qcReportA = readJsonFileSafe(path.join(localOut.outDir, "qc_report_A.json"));
    const qcReportB = readJsonFileSafe(path.join(localOut.outDir, "qc_report_B.json"));
    const styleQcMain = parseStyleQcSummary(qcReport);
    const styleQcA = parseStyleQcSummary(qcReportA);
    const styleQcB = parseStyleQcSummary(qcReportB);
    const qcIssues = toQcIssues(qcReport);
    const opsView = buildEpisodeOpsView(id, readJsonFileSafe(localOut.shots));
    const qcIssueRows = qcIssues
      .map(
        (issue, index) =>
          `<tr><td>${index + 1}</td><td>${esc(issue.check)}</td><td><span class="badge ${badgeClass(issue.severity)}">${esc(issue.severity)}</span></td><td>${esc(issue.message)}</td><td><pre>${esc(JSON.stringify(issue.details, null, 2))}</pre></td></tr>`
      )
      .join("");
    const opsArtifactLinks = opsView.artifactLinks
      .map((artifact) =>
        artifact.exists
          ? `<a href="${toEpisodeArtifactUrl(id, artifact.filename)}" class="secondary" style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #cad8f2">${esc(artifact.label)}</a>`
          : `<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #dbe6f1;opacity:.55">${esc(artifact.label)} missing</span>`
      )
      .join("");
    const opsShotRows = opsView.shotItems
      .map(
        (item) => `<tr>
          <td><code>${esc(item.shotId)}</code></td>
          <td>${esc(humanizeOpsLabel(item.shotType))}</td>
          <td>${esc(item.routeReasonLabel)}</td>
          <td>${esc(item.backend ?? "-")}</td>
          <td><span class="badge ${badgeClass(item.acceptanceStatus ?? item.sidecarStatus ?? "")}">${esc(item.acceptanceStatus ?? item.sidecarStatus ?? "-")}</span></td>
          <td>${esc(item.visualSummary)}</td>
          <td>${esc(item.fallbackSummary)}</td>
          <td>${esc(item.qcSummary === "-" ? item.repairSummary : compact([item.qcSummary, item.repairSummary], " | "))}</td>
        </tr>`
      )
      .join("");
    const episodeFallbackSummary = compact(
      [
        opsView.fallbackStage ? `final stage ${humanizeOpsLabel(opsView.fallbackStage)}` : null,
        opsView.fallbackSteps.length > 0 ? `steps ${opsView.fallbackSteps.map((step) => humanizeOpsLabel(step)).join(", ")}` : null
      ],
      " | "
    );

    const rows = jobs
      .map((job) => `<tr><td><a href="/ui/jobs/${esc(job.id)}">${esc(job.id)}</a></td><td>${esc(job.type)}</td><td><span class="badge ${badgeClass(String(job.status ?? ""))}">${esc(job.status)}</span></td><td>${esc(job.progress)}%</td><td>${esc(job.attemptsMade ?? 0)} / ${esc(job.maxAttempts ?? "-")}</td><td>${esc(job.retryBackoffMs ?? "-")}ms</td><td>${fmtDate(job.createdAt)}</td></tr>`)
      .join("");

    const styleOptions = STYLE_PRESET_VALUES
      .map((idValue) => `<option value="${idValue}" ${idValue === style.stylePresetId ? "selected" : ""}>${idValue}</option>`)
      .join("");
    const concreteStyleOptionsA = CONCRETE_STYLE_VALUES
      .map((idValue) => `<option value="${idValue}" ${idValue === AB_DEFAULT_STYLE_A ? "selected" : ""}>${idValue}</option>`)
      .join("");
    const concreteStyleOptionsB = CONCRETE_STYLE_VALUES
      .map((idValue) => `<option value="${idValue}" ${idValue === AB_DEFAULT_STYLE_B ? "selected" : ""}>${idValue}</option>`)
      .join("");
    const shotsReady = artifacts.shotsFileExists === true || fs.existsSync(localOut.shots);
    const recommendedRunProfile: RunProfileId =
      !shotsReady || !previewExists ? "preview" : !finalExists || !uploadManifestExists ? "full" : "full";
    const requestedRunProfile = q(request.query, "profile");
    const selectedRunProfile = requestedRunProfile
      ? normalizeRunProfile(requestedRunProfile)
      : recommendedRunProfile;
    const runProfileOptions = RUN_PROFILE_VALUES
      .map((profileId) => {
        const label =
          profileId === "preview"
            ? "preview (recommended)"
            : profileId === "full"
              ? "full (final/package)"
              : "render_only (quick render)";
        return `<option value="${profileId}" ${profileId === selectedRunProfile ? "selected" : ""}>${label}</option>`;
      })
      .join("");
    const latestByType = new Map<string, JsonRecord>();
    for (const job of jobs) {
      const type = String(job.type ?? "");
      if (!type || latestByType.has(type)) continue;
      latestByType.set(type, job);
    }
    const runStateRows = Array.from(latestByType.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, job]) => {
        const status = String(job.status ?? "UNKNOWN");
        const progress = typeof job.progress === "number" ? job.progress : Number.parseInt(String(job.progress ?? "0"), 10) || 0;
        const jobId = String(job.id ?? "");
        return `<tr><td>${esc(type)}</td><td><span class="badge ${badgeClass(status)}">${esc(status)}</span></td><td>${esc(progress)}%</td><td>${jobId ? `<a href="/ui/jobs/${esc(jobId)}">${esc(jobId)}</a>` : "-"}</td></tr>`;
      })
      .join("");
    const recommendAction = (() => {
      if (styleQcMain.failCount > 0) {
        return {
          title: "Recommended: resolve STYLE_QC fails with Style Preview",
          detail: `STYLE_QC fail=${styleQcMain.failCount}. Adjust style preset/hookBoost before full run.`,
          profile: "preview" as RunProfileId
        };
      }
      if (styleQcMain.warnCount > 0) {
        return {
          title: "Recommended: review remaining warnings with A/B compare",
          detail: `STYLE_QC warn=${styleQcMain.warnCount}. Run A/B preview compare before full run.`,
          profile: "preview" as RunProfileId
        };
      }
      if (!shotsReady) {
        return {
          title: "Recommended: run COMPILE_SHOTS first",
          detail: "shots.json is missing and render may fail. Run COMPILE_SHOTS first.",
          profile: "preview" as RunProfileId
        };
      }
      if (!previewExists) {
        return {
          title: "Recommended: run Preview render",
          detail: "preview.mp4 is not available yet. Run profile as preview first.",
          profile: "preview" as RunProfileId
        };
      }
      if (!finalExists || !uploadManifestExists) {
        return {
          title: "Recommended: run Full pipeline",
          detail: "Final outputs (final/manifest) are not ready yet. Finish with full profile.",
          profile: "full" as RunProfileId
        };
      }
      return {
        title: "Pipeline outputs are ready",
        detail: "preview/final/manifest are all present. Run style A/B compare if needed, then publish.",
        profile: "full" as RunProfileId
      };
    })();
    const episodeProfilesHref = profileBrowserHref([
      opsView.channelProfileId,
      opsView.mascotProfileId,
      opsView.studioProfileId
    ]);

    const episodeBody = `
<section class="card">
  <h1>Episode Detail</h1>
  ${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}
  ${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}
  <p>episodeId: <strong>${esc(episode.id ?? id)}</strong></p>
  <p>topic: <strong>${esc(episode.topic ?? "")}</strong></p>
  <p>status: <span class="badge ${badgeClass(String(episode.status ?? ""))}">${esc(episode.status)}</span></p>
  <p>stylePreset: <strong>${esc(style.stylePresetId)}</strong> / hookBoost: <strong>${esc(style.hookBoost.toFixed(2))}</strong></p>
  <p>outDir: <code>${esc(artifacts.outDir ?? localOut.outDir)}</code></p>
  <div class="grid two">
    <div class="card">
      <h3>Profile & Route Inspector</h3>
      <p>channel profile: <strong>${esc(opsView.channelProfileId ?? "-")}</strong></p>
      <p>mascot profile: <strong>${esc(opsView.mascotProfileId ?? "-")}</strong></p>
      <p>studio profile: <strong>${esc(opsView.studioProfileId ?? "-")}</strong></p>
      <p>route reasons: <strong>${esc(opsView.routeSummary)}</strong></p>
      <p>visual objects: <strong>${esc(opsView.visualSummary)}</strong></p>
      <p>render modes: <strong>${esc(opsView.renderModeSummary)}</strong></p>
      <p><a href="${episodeProfilesHref}">Open matching profile browser view</a></p>
    </div>
    <div class="card">
      <h3>Acceptance / QC Reasons</h3>
      <p>selected backend: <strong>${esc(opsView.backendSummary)}</strong></p>
      <p>acceptance status: <strong>${esc(opsView.acceptanceSummary)}</strong></p>
      <p>repair signals: <strong>${esc(opsView.repairSummary)}</strong></p>
      <p>qc reasons: <strong>${esc(opsView.qcSummary)}</strong></p>
      <p>fallback chain: <strong>${esc(episodeFallbackSummary || "-")}</strong></p>
      <p><a href="/ui/episodes/${esc(id)}/editor">Open Shot Editor Inspector</a></p>
    </div>
  </div>
  <div class="card">
    <h3>Episode Artifact Inspector</h3>
    <p class="notice">Use these raw artifacts when route/backend/acceptance metadata needs source verification.</p>
    <div class="actions">${opsArtifactLinks || '<span class="notice">No episode-local ops artifacts yet.</span>'}</div>
  </div>
  <div class="card">
    <h3>Per-shot Ops Signals</h3>
    <table>
      <thead><tr><th>shot</th><th>type</th><th>route_reason</th><th>backend</th><th>acceptance</th><th>visual objects</th><th>fallback / blockers</th><th>qc / repair</th></tr></thead>
      <tbody>${opsShotRows || '<tr><td colspan="8"><div class="notice">shots.json/runtime_shots.json does not expose route or sidecar metadata yet.</div></td></tr>'}</tbody>
    </table>
  </div>
  <div class="grid two">
    <div class="card">
      <h3>Documents</h3>
      <p>beats.json: <span class="badge ${artifacts.beatsFileExists ? "ok" : "bad"}">${artifacts.beatsFileExists ? "Exists" : "Missing"}</span></p>
      <p>shots.json: <span class="badge ${artifacts.shotsFileExists ? "ok" : "bad"}">${artifacts.shotsFileExists ? "Exists" : "Missing"}</span></p>
      <p>qc_report.json: <span class="badge ${qcExists ? "ok" : "bad"}">${qcExists ? "Exists" : "Missing"}</span></p>
      <p>STYLE_QC(main): fail=${styleQcMain.failCount} warn=${styleQcMain.warnCount} forced=${esc(styleQcMain.forcedStyle)}</p>
    </div>
    <div class="card">
      <h3>Render Outputs</h3>
      <p>preview.mp4: <span class="badge ${previewExists ? "ok" : "bad"}">${previewExists ? "Exists" : "Missing"}</span></p>
      <p>preview_A.mp4: <span class="badge ${previewAExists ? "ok" : "bad"}">${previewAExists ? "Exists" : "Missing"}</span></p>
      <p>preview_B.mp4: <span class="badge ${previewBExists ? "ok" : "bad"}">${previewBExists ? "Exists" : "Missing"}</span></p>
      <p>final.mp4: <span class="badge ${finalExists ? "ok" : "bad"}">${finalExists ? "Exists" : "Missing"}</span></p>
      <p>upload_manifest.json: <span class="badge ${uploadManifestExists ? "ok" : "bad"}">${uploadManifestExists ? "Exists" : "Missing"}</span></p>
    </div>
  </div>
  <div class="card">
    <h3>Studio Control Panel</h3>
    <div class="notice"><strong>${esc(recommendAction.title)}</strong><br/>${esc(recommendAction.detail)}<br/>Recommended profile: <strong>${esc(recommendAction.profile)}</strong></div>
    <form method="post" action="/ui/episodes/${esc(id)}/run-profile" class="grid two">
      <label>runProfile
        <select name="profile">${runProfileOptions}</select>
      </label>
      <label>stylePreset
        <select name="stylePresetId">${styleOptions}</select>
      </label>
      <label>hookBoost(0~1)
        <input type="range" name="hookBoost" min="0" max="1" step="0.05" value="${esc(style.hookBoost.toFixed(2))}" oninput="this.nextElementSibling.value=this.value"/>
        <output>${esc(style.hookBoost.toFixed(2))}</output>
      </label>
      <input type="hidden" name="returnTo" value="episode"/>
      <div class="actions" style="grid-column:1/-1">
        <button type="submit" data-primary-action="1">Run Profile (Recommended)</button>
        <a href="/ui/jobs" class="secondary" style="padding:7px 9px;border-radius:8px;border:1px solid #cad8f2">Open Job Monitor</a>
        <a href="/ui/episodes/${esc(id)}/editor" class="secondary" style="padding:7px 9px;border-radius:8px;border:1px solid #cad8f2">Open Shot Editor</a>
      </div>
    </form>
    <p class="notice">Profile notes: preview = fast preview, full = final render + package, render_only = preview render from current shots.</p>
    <div id="run-profile-live" data-episode-id="${esc(id)}" class="notice">Loading latest run status...</div>
    <table><thead><tr><th>Recent Job Type</th><th>Status</th><th>Progress</th><th>Job</th></tr></thead><tbody>${runStateRows || '<tr><td colspan="4"><div class="notice">No job history. Start from Run Profile above.</div></td></tr>'}</tbody></table>
  </div>
  <div class="card">
    <h3>Style Controls</h3>
    <form method="post" action="/ui/episodes/${esc(id)}/style-preview" class="grid two">
      <label>stylePreset<select name="stylePresetId">${styleOptions}</select></label>
      <label>hookBoost(0~1)<input type="range" name="hookBoost" min="0" max="1" step="0.05" value="${esc(style.hookBoost.toFixed(2))}" oninput="this.nextElementSibling.value=this.value"/><output>${esc(style.hookBoost.toFixed(2))}</output></label>
      <div class="actions" style="grid-column:1/-1"><button type="submit">Run Style Preview (~10s)</button></div>
    </form>
    <form method="post" action="/ui/episodes/${esc(id)}/ab-preview" class="grid two">
      <label>Variant A Style<select name="styleA">${concreteStyleOptionsA}</select></label>
      <label>Variant B Style<select name="styleB">${concreteStyleOptionsB}</select></label>
      <div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">Generate A/B Preview Compare</button><a href="/ui/episodes/${esc(id)}/ab-compare">A/B Compare Page</a></div>
    </form>
    <p>A STYLE_QC: fail=${styleQcA.failCount} warn=${styleQcA.warnCount} forced=${esc(styleQcA.forcedStyle)} | B STYLE_QC: fail=${styleQcB.failCount} warn=${styleQcB.warnCount} forced=${esc(styleQcB.forcedStyle)}</p>
  </div>
  <div class="card">
    <h3>Quick Enqueue (Advanced)</h3>
    <p class="notice">Use the recommended Run Profile above for normal flow. These controls are for manual pipeline steps.</p>
  <div class="actions">
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="GENERATE_BEATS"/><input type="hidden" name="pipelineMode" value="preview"/>${styleHidden}<button type="submit">Start One-click Preview Render</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="GENERATE_BEATS"/><input type="hidden" name="pipelineMode" value="full"/>${styleHidden}<button type="submit" class="secondary">Run Final + Package</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="COMPILE_SHOTS"/>${styleHidden}<button type="submit" class="secondary">Run COMPILE_SHOTS</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="RENDER_PREVIEW"/>${styleHidden}<button type="submit" class="secondary">Run Preview Render</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><select name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option><option value="RENDER_FINAL">RENDER_FINAL</option><option value="PACKAGE_OUTPUTS">PACKAGE_OUTPUTS</option></select>${styleHidden}<button type="submit" class="secondary">Run Selected Step</button></form>
  </div>
  </div>
</section>
<section class="card">
  <h2>Preview Player</h2>
  ${previewExists ? `<video controls preload="metadata" style="width:100%;max-width:960px;background:#000;border-radius:8px" src="${previewUrl}"></video><p><a href="${previewUrl}">Open preview.mp4</a></p>` : '<div class="error">preview.mp4 is not generated yet. Start Preview render using the buttons above.</div>'}
  ${(previewAExists || previewBExists) ? `<p>${previewAExists ? `<a href="${previewAUrl}">Open preview_A.mp4</a>` : "preview_A missing"} | ${previewBExists ? `<a href="${previewBUrl}">Open preview_B.mp4</a>` : "preview_B missing"}</p>` : ""}
</section>
<section class="card">
  <h2>QC Report</h2>
  ${qcExists ? (qcIssues.length > 0 ? `<table><thead><tr><th>#</th><th>Check</th><th>Severity</th><th>Message</th><th>Details</th></tr></thead><tbody>${qcIssueRows}</tbody></table>` : `<div class="notice">qc_report.json exists and has no failing issues.</div><pre>${esc(JSON.stringify(qcReport, null, 2))}</pre>`) : '<div class="error">qc_report.json is not available yet.</div>'}
</section>
<section class="card">
  <h2>Jobs</h2>
  <div aria-live="polite" class="notice">Job status updates in the table below. Use Retry on failures.</div>
  <table><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Attempts</th><th>Backoff</th><th>Created</th></tr></thead><tbody>${rows || '<tr><td colspan="7"><div class="notice">No job history. Start with enqueue actions above.</div></td></tr>'}</tbody></table>
  </section>`;

    return reply.type("text/html; charset=utf-8").send(page(`Episode ${id}`, episodeBody));
  });

  app.get("/ui/episodes/:id/editor", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }

    const out = getEpisodeOutPaths(id);
    let doc = readJsonFileSafe(out.shots);
    if (!isShotsDocLike(doc)) {
      const shotDoc = await prisma.shotDoc.findUnique({ where: { episodeId: id }, select: { json: true } });
      doc = shotDoc?.json ?? null;
    }
    if (!isShotsDocLike(doc)) {
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?error=${encodeURIComponent("shots.json not found. Run COMPILE_SHOTS first.")}`);
    }

    let history = readEditorHistory(id);
    if (!history || history.states.length === 0) {
      history = {
        pointer: 0,
        states: [{ saved_at: new Date().toISOString(), reason: "init", doc: deepClone(doc) }]
      };
      writeEditorHistory(id, history);
    }

    const activeDoc = history.states[history.pointer]?.doc;
    if (isShotsDocLike(activeDoc)) {
      doc = activeDoc;
    }

    const opsView = buildEpisodeOpsView(id, doc);
    const inspectorSeedJson = serializeScriptData(opsView.inspectorSeed);
    const editorOpsOverview = compact(
      [
        opsView.channelProfileId ? `channel ${opsView.channelProfileId}` : null,
        opsView.mascotProfileId ? `mascot ${opsView.mascotProfileId}` : null,
        opsView.backendSummary !== "-" ? `backend ${opsView.backendSummary}` : null,
        opsView.acceptanceSummary !== "-" ? `acceptance ${opsView.acceptanceSummary}` : null,
        opsView.fallbackSteps.length > 0 ? `fallback ${opsView.fallbackSteps.map((step) => humanizeOpsLabel(step)).join(", ")}` : null
      ],
      " | "
    );
    const editorProfilesHref = profileBrowserHref([
      opsView.channelProfileId,
      opsView.mascotProfileId,
      opsView.studioProfileId
    ]);
    const shotsDoc = doc as JsonRecord & { shots: unknown[] };
    const shotRows: string[] = [];
    const stageShotObjects: string[] = [];
    const templateShotItems: string[] = [];
    shotsDoc.shots.forEach((raw, index) => {
      if (!isRecord(raw)) return;
      const shotId = typeof raw.shot_id === "string" ? raw.shot_id : `shot_${index + 1}`;
      const startFrame = typeof raw.start_frame === "number" ? raw.start_frame : 0;
      const durationFrames = typeof raw.duration_frames === "number" ? raw.duration_frames : 0;
      const transition = typeof raw.transition === "string" ? raw.transition : "cut";
      const keyframes = isRecord(raw.camera) && Array.isArray(raw.camera.keyframes) ? raw.camera.keyframes.length : 0;
      const objectKey = `shot:${shotId}`;
      const objectLabel = `Shot ${index + 1}: ${shotId}`;
      shotRows.push(`<tr class="editor-shot-row" data-editor-object="${esc(objectKey)}" data-editor-label="${esc(objectLabel)}" tabindex="0" role="button" aria-label="Select shot ${index + 1}: ${esc(shotId)}"><td>${index + 1}</td><td><code>${esc(shotId)}</code></td><td>${startFrame}</td><td>${durationFrames}</td><td>${esc(transition)}</td><td>${keyframes}</td><td><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="move"/><input type="hidden" name="index" value="${index}"/><input type="hidden" name="delta" value="-1"/><button type="submit" class="secondary">Move up</button></form><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="move"/><input type="hidden" name="index" value="${index}"/><input type="hidden" name="delta" value="1"/><button type="submit" class="secondary">Move down</button></form></td><td><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="tweak"/><input type="hidden" name="shotId" value="${esc(shotId)}"/><label>zoom<input name="zoomMult" value="1.00" style="width:64px"/></label><label>panX<input name="panXDelta" value="0.00" style="width:64px"/></label><label>transition<input name="transitionStrength" value="0.50" style="width:64px"/></label><button type="submit">Apply tweak</button></form></td></tr>`);
      if (stageShotObjects.length < 8) {
        stageShotObjects.push(`<button type="button" class="editor-object editor-object-shot" data-editor-object="${esc(objectKey)}" data-editor-label="${esc(objectLabel)}"><span>Shot ${index + 1}</span><small>${esc(shotId)}</small></button>`);
      }
      if (templateShotItems.length < 6) {
        templateShotItems.push(`<li data-editor-search-item>Shot ${index + 1}: <code>${esc(shotId)}</code></li>`);
      }
    });
    const shots = shotRows.join("");
    const stageObjects = stageShotObjects.length > 0
      ? stageShotObjects.join("")
      : `<div class="muted-text">No shots found. Run COMPILE_SHOTS first.</div>`;
    const templateItems = templateShotItems.length > 0
      ? templateShotItems.join("")
      : `<li data-editor-search-item>No shot templates yet.</li>`;

    const snapshotsPath = editorSnapshotsDir(id);
    const snapshots = fs.existsSync(snapshotsPath)
      ? fs.readdirSync(snapshotsPath).filter((name) => name.endsWith(".json")).sort((a, b) => b.localeCompare(a)).slice(0, 10)
      : [];
    const snapshotItems = snapshots.length > 0
      ? snapshots.map((name) => `<a class="editor-chip" href="/artifacts/${encodeURIComponent(id)}/editor_snapshots/${encodeURIComponent(name)}">${esc(name)}</a>`).join("")
      : `<span class="muted-text">No snapshots yet.</span>`;

    const body = `<section class="card editor-shell" id="editor-shell">
<style>
.editor-shell{padding:14px;display:grid;gap:12px}
.editor-topbar{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.editor-topbar h1{margin:0 0 4px}
.editor-topbar p{margin:0;color:#425466;font-size:13px}
.editor-top-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.editor-layout{display:grid;grid-template-columns:270px minmax(0,1fr) 280px;gap:12px;align-items:start}
.editor-shell.editor-left-collapsed .editor-layout{grid-template-columns:minmax(0,1fr) 280px}
.editor-shell.editor-left-collapsed .editor-left{display:none}
.editor-left,.editor-center,.editor-right,.editor-bottom{border:1px solid #dbe6f1;border-radius:12px;background:#fff}
.editor-left,.editor-right,.editor-bottom{padding:11px}
.editor-center{padding:11px;display:grid;gap:10px}
.editor-left h2,.editor-center h2,.editor-right h2,.editor-bottom h2{margin:0 0 8px;font-size:15px}
.editor-right h3{margin:12px 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4b647a}
.editor-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:8px}
.editor-tabs button{padding:7px 6px}
.editor-tabs button.active{background:linear-gradient(180deg,#0f857b,#0f766e);color:#effcf9}
.editor-search{width:100%;margin-bottom:8px}
.editor-tab-panel{display:none}
.editor-tab-panel[hidden]{display:none}
.editor-tab-panel.active{display:block}
.editor-tab-panel ul{margin:0;padding-left:18px;display:grid;gap:6px}
.editor-stage{position:relative;min-height:220px;border:1px solid #d8e3ef;border-radius:10px;background:linear-gradient(180deg,#f9fcff,#f2f8ff);padding:10px}
.editor-stage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.editor-object{display:grid;gap:2px;justify-items:start;padding:8px;border-radius:10px;border:1px solid #c8d8ea;background:#fff;color:#12344d;font-size:12px;cursor:pointer}
.editor-object small{font-size:11px;color:#4b647a}
.editor-object.active{outline:2px solid #0f766e;background:#e8f8f5}
.editor-context-toolbar{position:absolute;left:10px;top:10px;display:flex;gap:6px;align-items:center;padding:7px;border-radius:999px;background:#0f172a;color:#eef2ff;box-shadow:0 8px 20px #0f172a33}
.editor-context-toolbar[hidden]{display:none}
.editor-context-toolbar button{padding:5px 9px;border-radius:999px;box-shadow:none}
.editor-context-label{font-size:12px;font-weight:700}
.editor-table-wrap{overflow:auto;border:1px solid #dbe6f1;border-radius:10px}
.editor-table-wrap table{min-width:760px;border:none;border-radius:0}
.editor-shot-row{cursor:pointer}
.editor-shot-row.is-selected{background:#e8f8f5}
.editor-shot-row:focus-visible{outline:2px solid #0f766e;outline-offset:-2px}
.editor-right .field{display:grid;gap:5px;margin-bottom:8px}
.editor-right .field label{font-size:12px;font-weight:700;color:#4b647a}
.editor-readout{min-height:38px;padding:8px 10px;border:1px solid #dbe6f1;border-radius:10px;background:#f8fbff;color:#12344d;font-size:12px;line-height:1.45}
.editor-readout.empty{color:#6b7b8c}
.editor-bottom{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}
.editor-bottom p{margin:0;font-size:12px;color:#4b647a}
.editor-strip{display:flex;gap:8px;flex-wrap:wrap}
.editor-chip{display:inline-flex;align-items:center;padding:5px 8px;border:1px solid #c7d9eb;border-radius:999px;background:#f8fbff;font-size:12px}
@media (max-width:1100px){.editor-layout{grid-template-columns:1fr}.editor-shell.editor-left-collapsed .editor-layout{grid-template-columns:1fr}}
</style>
<div class="editor-topbar">
  <div>
    <h1>Shot Timeline Editor</h1>
    <p>episodeId: <a href="/ui/episodes/${esc(id)}">${esc(id)}</a> | history: ${history.pointer + 1} / ${history.states.length}</p>
  </div>
  <div class="editor-top-actions">
    <form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="undo"/><button type="submit" ${history.pointer <= 0 ? "disabled" : ""}>Undo</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="redo"/><button type="submit" ${history.pointer >= history.states.length - 1 ? "disabled" : ""}>Redo</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="snapshot"/><button type="submit" class="secondary" data-primary-action="1">Save snapshot</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="RENDER_PREVIEW"/><button type="submit" class="secondary">Run preview render</button></form>
    <button type="button" class="secondary" id="editor-left-toggle" aria-expanded="true">Collapse Left Panel</button>
  </div>
</div>
${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}
${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}
<div class="notice">Shortcut: <strong>r</strong> runs the primary action. Reorder timeline rows with Move up/Move down.</div>
${editorOpsOverview ? `<div class="notice">Ops context: ${esc(editorOpsOverview)}</div>` : ""}
<div class="editor-layout">
  <aside class="editor-left">
    <h2>Library</h2>
    <div class="editor-tabs" role="tablist" aria-label="Library tabs">
      <button id="editor-tab-btn-templates" type="button" role="tab" aria-selected="true" aria-controls="editor-tab-panel-templates" tabindex="0" class="secondary active" data-editor-tab-btn="templates">Templates</button>
      <button id="editor-tab-btn-elements" type="button" role="tab" aria-selected="false" aria-controls="editor-tab-panel-elements" tabindex="-1" class="secondary" data-editor-tab-btn="elements">Elements</button>
      <button id="editor-tab-btn-uploads" type="button" role="tab" aria-selected="false" aria-controls="editor-tab-panel-uploads" tabindex="-1" class="secondary" data-editor-tab-btn="uploads">Uploads</button>
    </div>
    <input id="editor-left-search" class="editor-search" type="search" placeholder="Search library" aria-label="Search left panel library"/>
    <div id="editor-tab-panel-templates" role="tabpanel" aria-labelledby="editor-tab-btn-templates" class="editor-tab-panel active" data-editor-tab="templates"><ul>${templateItems}<li data-editor-search-item>Intro lower-third</li><li data-editor-search-item>CTA end card</li></ul></div>
    <div id="editor-tab-panel-elements" role="tabpanel" aria-labelledby="editor-tab-btn-elements" class="editor-tab-panel" data-editor-tab="elements" hidden><ul><li data-editor-search-item>Shape: rounded rect</li><li data-editor-search-item>Arrow line</li><li data-editor-search-item>Subtitle block</li><li data-editor-search-item>Brand-safe icon</li></ul></div>
    <div id="editor-tab-panel-uploads" role="tabpanel" aria-labelledby="editor-tab-btn-uploads" class="editor-tab-panel" data-editor-tab="uploads" hidden><ul><li data-editor-search-item>voiceover_wave.png</li><li data-editor-search-item>chart_overlay.svg</li><li data-editor-search-item>product_cutout.webp</li></ul></div>
  </aside>
  <section class="editor-center">
    <h2>Canvas</h2>
    <div class="editor-stage">
      <div id="editor-context-toolbar" class="editor-context-toolbar" hidden>
        <span id="editor-context-label" class="editor-context-label">No selection</span>
        <button type="button" class="secondary" data-editor-placeholder-action="Crop">Crop</button>
        <button type="button" class="secondary" data-editor-placeholder-action="Animation">Animation</button>
        <button type="button" class="secondary" data-editor-placeholder-action="Style">Style</button>
      </div>
      <div class="editor-stage-grid">
        ${stageObjects}
        <button type="button" class="editor-object" data-editor-object="placeholder:title" data-editor-label="Template: Title Card"><span>Template</span><small>Title Card</small></button>
        <button type="button" class="editor-object" data-editor-object="placeholder:sticker" data-editor-label="Template: Sticker Pack"><span>Template</span><small>Sticker Pack</small></button>
      </div>
    </div>
    <div class="editor-table-wrap">
      <table>
        <thead><tr><th>#</th><th>shot_id</th><th>start</th><th>duration</th><th>transition</th><th>camera keys</th><th>order</th><th>override</th></tr></thead>
        <tbody>${shots || '<tr><td colspan="8"><div class="notice">No timeline rows yet.</div></td></tr>'}</tbody>
      </table>
    </div>
  </section>
  <aside class="editor-right">
    <h2>Inspector</h2>
    <p id="editor-inspector-target" class="muted-text">Select an object on the canvas or in the timeline table.</p>
    <h3>Shot Ops Metadata</h3>
    <div class="field"><label>Shot type</label><div id="editor-meta-shot-type" class="editor-readout empty">-</div></div>
    <div class="field"><label>Render mode / recommendation</label><div id="editor-meta-render-mode" class="editor-readout empty">-</div></div>
    <div class="field"><label>Selected backend</label><div id="editor-meta-backend" class="editor-readout empty">-</div></div>
    <div class="field"><label>Acceptance / sidecar status</label><div id="editor-meta-acceptance" class="editor-readout empty">-</div></div>
    <div class="field"><label>Route reason</label><div id="editor-meta-route-reason" class="editor-readout empty">-</div></div>
    <div class="field"><label>Visual object metadata</label><div id="editor-meta-visuals" class="editor-readout empty">-</div></div>
    <div class="field"><label>Fallback / blockers</label><div id="editor-meta-fallback" class="editor-readout empty">-</div></div>
    <div class="field"><label>QC / repair reasons</label><div id="editor-meta-qc" class="editor-readout empty">-</div></div>
    <div class="quick-links"><a href="${editorProfilesHref}">Open matching profile browser view</a><a href="/ui/benchmarks">Benchmarks</a></div>
  </aside>
</div>
<section class="editor-bottom">
  <div>
    <h2>Snapshots</h2>
    <p>Recent snapshots stay linked for quick rollback and comparison.</p>
  </div>
  <div class="editor-strip">${snapshotItems}</div>
</section>
</section>
<script id="editor-inspector-seed" type="application/json">${inspectorSeedJson}</script>
<script>
(() => {
  const shell = document.getElementById('editor-shell');
  if (!(shell instanceof HTMLElement)) return;
  const toolbar = document.getElementById('editor-context-toolbar');
  const toolbarLabel = document.getElementById('editor-context-label');
  const inspector = document.getElementById('editor-inspector-target');
  const inspectorSeedNode = document.getElementById('editor-inspector-seed');
  const leftToggle = document.getElementById('editor-left-toggle');
  const tabButtons = Array.from(shell.querySelectorAll('[data-editor-tab-btn]'));
  const tabPanels = Array.from(shell.querySelectorAll('[data-editor-tab]'));
  const searchInput = document.getElementById('editor-left-search');
  const toastWrap = document.getElementById('toast-wrap');
  const inspectorSeed = (() => {
    if (!(inspectorSeedNode instanceof HTMLScriptElement)) return {};
    try {
      return JSON.parse(inspectorSeedNode.textContent || '{}');
    } catch {
      return {};
    }
  })();
  const setReadout = (id, value) => {
    const node = document.getElementById(id);
    if (!(node instanceof HTMLElement)) return;
    const text = typeof value === 'string' && value.trim() ? value.trim() : '-';
    node.textContent = text;
    node.classList.toggle('empty', text === '-');
  };
  const updateInspector = (key, label) => {
    const meta = inspectorSeed && typeof inspectorSeed === 'object' ? inspectorSeed[key] : null;
    if (!(meta && typeof meta === 'object')) {
      if (inspector instanceof HTMLElement) inspector.textContent = 'Selected: ' + label;
      setReadout('editor-meta-shot-type', '-');
      setReadout('editor-meta-render-mode', '-');
      setReadout('editor-meta-backend', '-');
      setReadout('editor-meta-acceptance', '-');
      setReadout('editor-meta-route-reason', '-');
      setReadout('editor-meta-visuals', '-');
      setReadout('editor-meta-fallback', '-');
      setReadout('editor-meta-qc', '-');
      return;
    }
    if (inspector instanceof HTMLElement) inspector.textContent = 'Selected: ' + label;
    setReadout('editor-meta-shot-type', meta.shotType);
    setReadout('editor-meta-render-mode', meta.renderModeSummary);
    setReadout('editor-meta-backend', meta.backend);
    setReadout('editor-meta-acceptance', [meta.acceptanceStatus, meta.sidecarStatus].filter(Boolean).join(' | '));
    setReadout('editor-meta-route-reason', meta.routeReason);
    setReadout('editor-meta-visuals', meta.visualSummary);
    setReadout('editor-meta-fallback', meta.fallbackSummary);
    setReadout('editor-meta-qc', [meta.qcSummary, meta.repairSummary].filter((value) => value && value !== '-').join(' | '));
  };
  const toast = (title, message, tone = 'ok', timeoutMs = 2600) => {
    if (!(toastWrap instanceof HTMLElement)) return;
    const node = document.createElement('div');
    node.className = 'toast ' + tone;
    node.innerHTML = '<div class="title">' + title + '</div><div>' + message + '</div>';
    toastWrap.appendChild(node);
    setTimeout(() => node.remove(), timeoutMs);
  };
  const selectObject = (key, label) => {
    shell.querySelectorAll('[data-editor-object]').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const active = node.dataset.editorObject === key;
      node.classList.toggle('active', active);
      if (node instanceof HTMLButtonElement) node.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (node.classList.contains('editor-shot-row')) {
        node.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    });
    shell.querySelectorAll('.editor-shot-row').forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      node.classList.toggle('is-selected', node.dataset.editorObject === key);
    });
    if (toolbar instanceof HTMLElement) toolbar.hidden = false;
    if (toolbarLabel instanceof HTMLElement) toolbarLabel.textContent = label;
    updateInspector(key, label);
  };
  shell.querySelectorAll('[data-editor-object]').forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest('form') || target.closest('input') || target.closest('label'))) {
        return;
      }
      const key = node.dataset.editorObject || '';
      if (!key) return;
      const label = node.dataset.editorLabel || key;
      selectObject(key, label);
    });
    if (node.classList.contains('editor-shot-row')) {
      node.addEventListener('keydown', (event) => {
        if (!(event instanceof KeyboardEvent)) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const key = node.dataset.editorObject || '';
        if (!key) return;
        const label = node.dataset.editorLabel || key;
        selectObject(key, label);
      });
    }
  });
  if (leftToggle instanceof HTMLButtonElement) {
    leftToggle.addEventListener('click', () => {
      const collapsed = shell.classList.toggle('editor-left-collapsed');
      leftToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      leftToggle.textContent = collapsed ? 'Expand Left Panel' : 'Collapse Left Panel';
    });
  }
  const setActiveTab = (tab, focus = false) => {
    tabButtons.forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      const active = btn.dataset.editorTabBtn === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.setAttribute('tabindex', active ? '0' : '-1');
      if (focus && active && btn instanceof HTMLButtonElement) btn.focus();
    });
    tabPanels.forEach((panel) => {
      if (!(panel instanceof HTMLElement)) return;
      const active = panel.dataset.editorTab === tab;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    });
  };
  const applySearch = () => {
    const activePanel = tabPanels.find((panel) => panel instanceof HTMLElement && panel.classList.contains('active'));
    if (!(activePanel instanceof HTMLElement)) return;
    const query = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : '';
    activePanel.querySelectorAll('[data-editor-search-item]').forEach((item) => {
      if (!(item instanceof HTMLElement)) return;
      const text = String(item.textContent || '').toLowerCase();
      item.style.display = !query || text.includes(query) ? '' : 'none';
    });
  };
  tabButtons.forEach((btn, index) => {
    if (!(btn instanceof HTMLElement)) return;
    btn.addEventListener('click', () => {
      const tab = btn.dataset.editorTabBtn || 'templates';
      setActiveTab(tab);
      applySearch();
    });
    btn.addEventListener('keydown', (event) => {
      if (!(event instanceof KeyboardEvent)) return;
      let nextIndex = index;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabButtons.length;
      else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = tabButtons.length - 1;
      else return;
      event.preventDefault();
      const next = tabButtons[nextIndex];
      if (!(next instanceof HTMLElement)) return;
      const tab = next.dataset.editorTabBtn || 'templates';
      setActiveTab(tab, true);
      applySearch();
    });
  });
  shell.querySelectorAll('[data-editor-placeholder-action]').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) return;
    node.addEventListener('click', () => {
      const action = String(node.dataset.editorPlaceholderAction || 'Action');
      toast('Editor', action + ' will be expanded in next ticket (TICKET-UI-201).', 'warn');
    });
  });
  if (searchInput instanceof HTMLInputElement) {
    searchInput.addEventListener('input', applySearch);
  }
  const firstShot = shell.querySelector('.editor-shot-row[data-editor-object]');
  if (firstShot instanceof HTMLElement) {
    const key = firstShot.dataset.editorObject || '';
    if (key) {
      selectObject(key, firstShot.dataset.editorLabel || key);
    }
  }
})();
</script>`;
    return reply.type("text/html; charset=utf-8").send(page(`Editor ${id}`, body));
  });

  app.post("/ui/episodes/:id/editor", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }

    const body = isRecord(request.body) ? request.body : {};
    const op = b(body, "op") ?? "";
    const out = getEpisodeOutPaths(id);
    let doc = readJsonFileSafe(out.shots);
    if (!isShotsDocLike(doc)) {
      const shotDoc = await prisma.shotDoc.findUnique({ where: { episodeId: id }, select: { json: true } });
      doc = shotDoc?.json ?? null;
    }
    if (!isShotsDocLike(doc)) {
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?error=${encodeURIComponent("shots.json not found")}`);
    }

    let history = readEditorHistory(id);
    if (!history || history.states.length === 0) {
      history = {
        pointer: 0,
        states: [{ saved_at: new Date().toISOString(), reason: "init", doc: deepClone(doc) }]
      };
    }

    const active = history.states[history.pointer]?.doc;
    if (isShotsDocLike(active)) {
      doc = deepClone(active);
    } else {
      doc = deepClone(doc);
    }
    const shotsDoc = doc as JsonRecord & { shots: unknown[] };

    if (op === "undo") {
      if (history.pointer > 0) {
        history.pointer -= 1;
      }
      writeEditorHistory(id, history);
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?message=${encodeURIComponent("Undo complete")}`);
    }

    if (op === "redo") {
      if (history.pointer < history.states.length - 1) {
        history.pointer += 1;
      }
      writeEditorHistory(id, history);
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?message=${encodeURIComponent("Redo complete")}`);
    }

    if (op === "snapshot") {
      const snapshots = editorSnapshotsDir(id);
      fs.mkdirSync(snapshots, { recursive: true });
      const filename = `shots_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      const filePath = path.join(snapshots, filename);
      writeJsonFile(filePath, shotsDoc);
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?message=${encodeURIComponent(`Snapshot saved: ${filename}`)}`);
    }

    if (op === "move") {
      const index = typeof body.index === "string" ? Number.parseInt(body.index, 10) : typeof body.index === "number" ? Math.round(body.index) : -1;
      const delta = typeof body.delta === "string" ? Number.parseInt(body.delta, 10) : typeof body.delta === "number" ? Math.round(body.delta) : 0;
      const ok = moveShot(shotsDoc, index, delta);
      if (!ok) {
        return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?error=${encodeURIComponent("Invalid move command")}`);
      }
      history = pushHistory(history, shotsDoc, `move:${index}:${delta}`);
      writeEditorHistory(id, history);
      writeJsonFile(out.shots, shotsDoc);
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?message=${encodeURIComponent("Timeline reordered successfully")}`);
    }

    if (op === "tweak") {
      const shotId = b(body, "shotId") ?? "";
      const zoomMult = typeof body.zoomMult === "string" ? Number.parseFloat(body.zoomMult) : typeof body.zoomMult === "number" ? body.zoomMult : 1;
      const panXDelta = typeof body.panXDelta === "string" ? Number.parseFloat(body.panXDelta) : typeof body.panXDelta === "number" ? body.panXDelta : 0;
      const transitionStrength = typeof body.transitionStrength === "string"
        ? Number.parseFloat(body.transitionStrength)
        : typeof body.transitionStrength === "number"
          ? body.transitionStrength
          : 0.5;
      const ok = applyShotTweaks(shotsDoc, shotId, zoomMult, panXDelta, transitionStrength);
      if (!ok) {
        return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?error=${encodeURIComponent("Shot override failed")}`);
      }
      history = pushHistory(history, shotsDoc, `tweak:${shotId}`);
      writeEditorHistory(id, history);
      writeJsonFile(out.shots, shotsDoc);
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?message=${encodeURIComponent(`Tweak applied: ${shotId}`)}`);
    }

    return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?error=${encodeURIComponent("Unknown op")}`);
  });

  app.post("/ui/episodes/:id/style-preview", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }

    const body = request.body;
    const stylePresetId = normalizeStylePresetId(b(body, "stylePresetId"));
    const hookBoost = parseHookBoost(b(body, "hookBoost"), DEFAULT_HOOK_BOOST);
    const localOut = getEpisodeOutPaths(id);
    const shotDoc = readJsonFileSafe(localOut.shots);
    const previewShotIds = pickStylePreviewShotIds(shotDoc, 300);

    if (previewShotIds.length === 0) {
      const compileRes = await injectJson(app, "POST", `/api/episodes/${encodeURIComponent(id)}/enqueue`, {
        jobType: "COMPILE_SHOTS",
        stylePresetId,
        hookBoost
      });
      if (compileRes.statusCode >= 400) {
        const msg = isRecord(compileRes.body) && typeof compileRes.body.error === "string" ? compileRes.body.error : `style preview prepare failed (${compileRes.statusCode})`;
        return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?error=${encodeURIComponent(msg)}`);
      }
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?message=${encodeURIComponent("shots.json was missing, so COMPILE_SHOTS was enqueued first. Run Style Preview again after completion.")}`);
    }

    const res = await injectJson(app, "POST", `/api/episodes/${encodeURIComponent(id)}/enqueue`, {
      jobType: "RENDER_PREVIEW",
      failedShotIds: previewShotIds,
      stylePresetId,
      hookBoost
    });
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `style preview enqueue failed (${res.statusCode})`;
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?error=${encodeURIComponent(msg)}`);
    }
    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?message=${encodeURIComponent("Style preview enqueued")}`);
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.post("/ui/episodes/:id/ab-preview", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }

    const body = request.body;
    const styleA = normalizeAbStylePresetId(b(body, "styleA"), AB_DEFAULT_STYLE_A);
    const styleB = normalizeAbStylePresetId(b(body, "styleB"), AB_DEFAULT_STYLE_B);
    if (styleA === styleB) {
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?error=${encodeURIComponent("A/B styles must be different.")}`);
    }

    const out = getEpisodeOutPaths(id);
    const baseShotsDoc = readJsonFileSafe(out.shots);
    if (!baseShotsDoc) {
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?error=${encodeURIComponent("shots.json is missing. Run COMPILE_SHOTS first.")}`);
    }

    const variantAPaths = getAbVariantPaths(id, "A");
    const variantBPaths = getAbVariantPaths(id, "B");
    const variantADoc = applyStylePresetToShotsDoc(baseShotsDoc, styleA, "A");
    const variantBDoc = applyStylePresetToShotsDoc(baseShotsDoc, styleB, "B");
    writeJsonFile(variantAPaths.shotsPath, variantADoc);
    writeJsonFile(variantBPaths.shotsPath, variantBDoc);

    const episode = await prisma.episode.findUnique({
      where: { id },
      select: { datasetVersionSnapshot: true }
    });
    const snapshot = isRecord(episode?.datasetVersionSnapshot) ? episode.datasetVersionSnapshot : {};
    await prisma.episode.update({
      where: { id },
      data: {
        datasetVersionSnapshot: {
          ...snapshot,
          style_ab: {
            generatedAt: new Date().toISOString(),
            variantA: {
              variantId: "A",
              stylePresetId: styleA,
              shotsPath: variantAPaths.shotsPath,
              outputPath: variantAPaths.outputPath
            },
            variantB: {
              variantId: "B",
              stylePresetId: styleB,
              shotsPath: variantBPaths.shotsPath,
              outputPath: variantBPaths.outputPath
            }
          }
        } as Prisma.InputJsonValue
      }
    });

    try {
      const [jobA, jobB] = await Promise.all([
        enqueuePreviewVariantJob({
          prisma,
          queue,
          queueName,
          episodeId: id,
          variantId: "A",
          stylePresetId: styleA,
          shotsPath: variantAPaths.shotsPath,
          outputPath: variantAPaths.outputPath,
          srtPath: variantAPaths.srtPath,
          qcReportPath: variantAPaths.qcReportPath,
          renderLogPath: variantAPaths.renderLogPath
        }),
        enqueuePreviewVariantJob({
          prisma,
          queue,
          queueName,
          episodeId: id,
          variantId: "B",
          stylePresetId: styleB,
          shotsPath: variantBPaths.shotsPath,
          outputPath: variantBPaths.outputPath,
          srtPath: variantBPaths.srtPath,
          qcReportPath: variantBPaths.qcReportPath,
          renderLogPath: variantBPaths.renderLogPath
        })
      ]);

      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/ab-compare?jobA=${encodeURIComponent(jobA.jobId)}&jobB=${encodeURIComponent(jobB.jobId)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?error=${encodeURIComponent(`A/B preview enqueue failed: ${message}`)}`);
    }
  });

  app.get("/ui/episodes/:id/ab-compare", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }

    const variantAPaths = getAbVariantPaths(id, "A");
    const variantBPaths = getAbVariantPaths(id, "B");
    const aExists = fs.existsSync(variantAPaths.outputPath);
    const bExists = fs.existsSync(variantBPaths.outputPath);
    const aUrl = aExists ? toEpisodeArtifactUrl(id, "preview_A.mp4") : "";
    const bUrl = bExists ? toEpisodeArtifactUrl(id, "preview_B.mp4") : "";
    const qcA = readJsonFileSafe(variantAPaths.qcReportPath);
    const qcB = readJsonFileSafe(variantBPaths.qcReportPath);
    const qa = parseStyleQcSummary(qcA);
    const qb = parseStyleQcSummary(qcB);
    const jobA = q(request.query, "jobA");
    const jobB = q(request.query, "jobB");

    return reply.type("text/html; charset=utf-8").send(page(`A/B Compare ${id}`, `
<section class="card">
  <h1>A/B Preview Compare</h1>
  ${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}
  ${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}
  <p>episodeId: <a href="/ui/episodes/${esc(id)}">${esc(id)}</a></p>
  <div class="grid two">
    <div class="card">
      <h3>Variant A</h3>
      ${aExists ? `<video controls preload="metadata" style="width:100%;max-width:560px;background:#000;border-radius:8px" src="${aUrl}"></video><p><a href="${aUrl}">Open preview_A.mp4</a></p>` : `<div class="error">preview_A.mp4 not found</div>`}
      <p>STYLE_QC: fail=${qa.failCount}, warn=${qa.warnCount}, forced=${esc(qa.forcedStyle)}</p>
      ${jobA ? `<p><a href="/ui/jobs/${encodeURIComponent(jobA)}">jobA: ${esc(jobA)}</a></p>` : ""}
    </div>
    <div class="card">
      <h3>Variant B</h3>
      ${bExists ? `<video controls preload="metadata" style="width:100%;max-width:560px;background:#000;border-radius:8px" src="${bUrl}"></video><p><a href="${bUrl}">Open preview_B.mp4</a></p>` : `<div class="error">preview_B.mp4 not found</div>`}
      <p>STYLE_QC: fail=${qb.failCount}, warn=${qb.warnCount}, forced=${esc(qb.forcedStyle)}</p>
      ${jobB ? `<p><a href="/ui/jobs/${encodeURIComponent(jobB)}">jobB: ${esc(jobB)}</a></p>` : ""}
    </div>
  </div>
  <table>
    <thead><tr><th>Metric</th><th>Variant A</th><th>Variant B</th></tr></thead>
    <tbody>
      <tr><td>STYLE_QC fail_count</td><td>${qa.failCount}</td><td>${qb.failCount}</td></tr>
      <tr><td>STYLE_QC warn_count</td><td>${qa.warnCount}</td><td>${qb.warnCount}</td></tr>
      <tr><td>forced_episode_style</td><td>${esc(qa.forcedStyle)}</td><td>${esc(qb.forcedStyle)}</td></tr>
    </tbody>
  </table>
</section>`));
  });

  app.post("/api/episodes/:id/run-profile", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).send({ error: "episode id is required" });
    }

    const body = isRecord(request.body) ? request.body : {};
    const profile = normalizeRunProfile(b(body, "profile"));
    const stylePresetId = normalizeStylePresetId(b(body, "stylePresetId"));
    const hookBoost = parseHookBoost(b(body, "hookBoost"), DEFAULT_HOOK_BOOST);
    const plan = runProfileToEnqueue(profile);
    const nowMs = Date.now();
    cleanupRunProfileDedupCache(nowMs);
    const dedupKey = runProfileDedupKey({ episodeId: id, profile, stylePresetId, hookBoost });
    const recent = runProfileDedupCache.get(dedupKey);
    if (recent && nowMs - recent.at <= RUN_PROFILE_DEDUP_WINDOW_MS) {
      runProfileDedupStats.hits += 1;
      return reply.send({
        data: {
          episodeId: id,
          profile,
          title: plan.title,
          stylePresetId,
          hookBoost,
          jobId: recent.jobId,
          deduped: true,
          dedupWindowMs: RUN_PROFILE_DEDUP_WINDOW_MS,
          next: {
            episode: `/ui/episodes/${encodeURIComponent(id)}`,
            jobs: "/ui/jobs",
            job: recent.jobId ? `/ui/jobs/${encodeURIComponent(recent.jobId)}` : null
          }
        }
      });
    }

    const payload: JsonRecord = {
      jobType: plan.jobType,
      stylePresetId,
      hookBoost
    };
    if (plan.pipeline) {
      payload.pipeline = plan.pipeline;
    }

    const res = await injectJson(app, "POST", `/api/episodes/${encodeURIComponent(id)}/enqueue`, payload);
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `run profile failed (${res.statusCode})`;
      const hint = runProfileFailureHint(msg);
      return reply.code(res.statusCode).send({ error: msg, hint, profile, episodeId: id });
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    runProfileDedupStats.enqueues += 1;
    runProfileDedupCache.set(dedupKey, { at: nowMs, jobId });
    return reply.send({
      data: {
        episodeId: id,
        profile,
        title: plan.title,
        stylePresetId,
        hookBoost,
        jobId,
        deduped: false,
        dedupWindowMs: RUN_PROFILE_DEDUP_WINDOW_MS,
        next: {
          episode: `/ui/episodes/${encodeURIComponent(id)}`,
          jobs: "/ui/jobs",
          job: jobId ? `/ui/jobs/${encodeURIComponent(jobId)}` : null
        }
      }
    });
  });

  app.post("/ui/episodes/:id/run-profile", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }

    const body = isRecord(request.body) ? request.body : {};
    const profile = normalizeRunProfile(b(body, "profile"));
    const stylePresetId = normalizeStylePresetId(b(body, "stylePresetId"));
    const hookBoost = parseHookBoost(b(body, "hookBoost"), DEFAULT_HOOK_BOOST);
    const returnTo = normalizeRunProfileReturnTarget(b(body, "returnTo"));
    const res = await injectJson(app, "POST", `/api/episodes/${encodeURIComponent(id)}/run-profile`, {
      profile,
      stylePresetId,
      hookBoost
    });

    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `run profile failed (${res.statusCode})`;
      const hint = isRecord(res.body) && typeof res.body.hint === "string" ? res.body.hint : runProfileFailureHint(msg);
      const combined = `${msg} (${hint})`;
      const errorTarget =
        returnTo === "episodes"
          ? `/ui/episodes?error=${encodeURIComponent(combined)}`
          : `/ui/episodes/${encodeURIComponent(id)}?profile=${encodeURIComponent(profile)}&error=${encodeURIComponent(combined)}`;
      return reply.redirect(errorTarget);
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && typeof res.body.data.jobId === "string" ? res.body.data.jobId : null;
    const deduped = isRecord(res.body) && isRecord(res.body.data) && res.body.data.deduped === true;
    const message = deduped ? `Run profile skipped (dedup): ${profile}` : `Run profile started: ${profile}`;
    if (returnTo === "episodes") {
      return reply.redirect(`/ui/episodes?message=${encodeURIComponent(`${id}: ${message}`)}`);
    }
    if (returnTo === "episode" || !jobId) {
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?profile=${encodeURIComponent(profile)}&message=${encodeURIComponent(message)}`);
    }
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}?message=${encodeURIComponent(message)}`);
  });

  app.post("/ui/episodes/:id/enqueue", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }
    const body = request.body;
    const jobType = b(body, "jobType") ?? "COMPILE_SHOTS";
    const mode = b(body, "pipelineMode");
    const stylePresetId = normalizeStylePresetId(b(body, "stylePresetId"));
    const hookBoost = parseHookBoost(b(body, "hookBoost"), DEFAULT_HOOK_BOOST);
    const pipeline = pipelineFromMode(mode);

    const payload: JsonRecord = { jobType, stylePresetId, hookBoost };
    if (pipeline) {
      payload.pipeline = pipeline;
    }

    const res = await injectJson(app, "POST", `/api/episodes/${encodeURIComponent(id)}/enqueue`, payload);
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `enqueue failed (${res.statusCode})`;
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?error=${encodeURIComponent(msg)}`);
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?message=${encodeURIComponent("Job enqueued")}`);
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.get("/ui/jobs", async (request, reply) => {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { episode: { select: { id: true, topic: true } } }
    });

    const rows = jobs
      .map((job) => `<tr><td><a href="/ui/jobs/${esc(job.id)}">${esc(job.id)}</a></td><td>${job.episode ? `<a href="/ui/episodes/${esc(job.episode.id)}">${esc(job.episode.topic)}</a>` : "-"}</td><td>${esc(job.type)}</td><td><span class="badge ${badgeClass(String(job.status))}">${esc(job.status)}</span></td><td>${esc(job.progress)}%</td><td>${fmtDate(job.createdAt.toISOString())}</td></tr>`)
      .join("");

    const jobsBody = buildJobsPageBody({
      flash: flashHtml(request.query),
      rows
    });
    return reply.type("text/html; charset=utf-8").send(page("Jobs", jobsBody));
  });

  app.get("/ui/publish", async (request, reply) => {
    const episodeId = q(request.query, "episodeId") ?? "";
    const publishBody = buildPublishPageBody({
      flash: flashHtml(request.query),
      episodeId: esc(episodeId)
    });
    return reply.type("text/html; charset=utf-8").send(page("Publish", publishBody));
  });

  app.post("/ui/publish", async (request, reply) => {
    const episodeId = b(request.body, "episodeId");
    if (!episodeId) {
      return reply.redirect(`/ui/publish?error=${encodeURIComponent("episodeId is required")}`);
    }

    const res = await injectJson(app, "POST", `/publish/${encodeURIComponent(episodeId)}`, {});
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `publish failed (${res.statusCode})`;
      return reply.redirect(`/ui/publish?episodeId=${encodeURIComponent(episodeId)}&error=${encodeURIComponent(msg)}`);
    }

    return reply.redirect(`/ui/publish?episodeId=${encodeURIComponent(episodeId)}&message=${encodeURIComponent("Publish requested")}`);
  });
  app.get("/ui/jobs/:id", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("job id is required"));
    }
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { createdAt: "asc" }
        }
      }
    });
    if (!job) {
      return reply.code(404).type("text/html; charset=utf-8").send(simpleErrorHtml(`Job not found: ${id}`));
    }

    const logs = job.logs;
    const logRows = logs
      .map((log) => `<tr><td>${fmtDate(log.createdAt.toISOString())}</td><td>${esc(log.level ?? "info")}</td><td>${esc(log.message ?? "")}</td><td><pre>${esc(JSON.stringify(log.details ?? null, null, 2))}</pre></td></tr>`)
      .join("");

    const episodeId = job.episodeId;
    const canRetry = job.status === "FAILED";
    const errorStack = job.lastError ? `<details><summary>Toggle lastError stack</summary><pre>${esc(job.lastError)}</pre></details>` : "<p>lastError: (none)</p>";

    const retryAction = canRetry
      ? `<form method="post" action="/ui/jobs/${esc(id)}/retry"><button type="submit">Retry (FAILED job)</button></form>` 
      : `<button type="button" class="secondary" disabled>Retry is available only when status is FAILED</button>`;
    const jobDetailBody = buildJobDetailPageBody({
      flash: flashHtml(request.query),
      jobId: esc(job.id),
      episodeId: esc(episodeId),
      type: esc(job.type),
      statusBadge: `<span class="badge ${badgeClass(String(job.status ?? ""))}">${esc(job.status)}</span>`,
      progress: esc(job.progress),
      attempts: `${esc(job.attemptsMade)} / ${esc(job.maxAttempts)} (backoff: ${esc(job.retryBackoffMs)}ms)`,
      errorStack,
      retryAction,
      logRows
    });
    return reply.type("text/html; charset=utf-8").send(page(`Job ${id}`, jobDetailBody));
  });

  app.post("/ui/jobs/:id/retry", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("job id is required"));
    }
    const body = request.body;
    const res = await injectJson(app, "POST", `/api/jobs/${encodeURIComponent(id)}/retry`, {
      ...(csv(isRecord(body) ? body.failedShotIds : undefined).length > 0 ? { failedShotIds: csv(isRecord(body) ? body.failedShotIds : undefined) } : {}),
      dryRun: bool(isRecord(body) ? body.dryRun : undefined, false)
    });

    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `Retry failed (${res.statusCode})`;
      return reply.redirect(`/ui/jobs/${encodeURIComponent(id)}?error=${encodeURIComponent(msg)}`);
    }

    const newJobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!newJobId) return reply.redirect(`/ui/jobs/${encodeURIComponent(id)}?message=${encodeURIComponent("Retry requested")}`);
    return reply.redirect(`/ui/jobs/${encodeURIComponent(newJobId)}`);
  });

  app.get("/ui/hitl", async (request, reply) => {
    const failed = await prisma.job.findMany({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 50, include: { episode: { select: { topic: true } } } });
    const rows = failed
      .map((job) => `<tr><td><a href="/ui/jobs/${esc(job.id)}">${esc(job.id)}</a></td><td><a href="/ui/episodes/${esc(job.episodeId)}">${esc(job.episodeId)}</a></td><td>${esc(job.episode?.topic ?? "-")}</td><td>${esc(job.type)}</td><td>${fmtDate(job.createdAt.toISOString())}</td><td>${esc(job.lastError ?? "")}</td></tr>`)
      .join("");

    const hitlBody = buildHitlPageBody({
      flash: flashHtml(request.query),
      episodeIdValue: esc(q(request.query, "episodeId") ?? ""),
      failedShotIdsValue: esc(q(request.query, "failedShotIds") ?? ""),
      rows
    });
    return reply.type("text/html; charset=utf-8").send(page("HITL", hitlBody));
  });

  app.post("/ui/hitl/rerender", async (request, reply) => {
    const body = request.body;
    const episodeId = b(body, "episodeId");
    if (!episodeId) return reply.redirect(`/ui/hitl?error=${encodeURIComponent("episodeId is required")}`);

    const failedShotIdsRaw = b(body, "failedShotIds") ?? "";
    const shotIds = csv(failedShotIdsRaw);
    if (shotIds.length === 0) {
      return reply.redirect(`/ui/hitl?episodeId=${encodeURIComponent(episodeId)}&error=${encodeURIComponent("failedShotIds is required")}`);
    }

    const res = await injectJson(app, "POST", "/api/hitl/rerender", { episodeId, shotIds, dryRun: bool(isRecord(body) ? body.dryRun : undefined, false) });
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `HITL rerender failed (${res.statusCode})`;
      return reply.redirect(`/ui/hitl?episodeId=${encodeURIComponent(episodeId)}&failedShotIds=${encodeURIComponent(failedShotIdsRaw)}&error=${encodeURIComponent(msg)}`);
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.redirect(`/ui/hitl?message=${encodeURIComponent("Rerender requested")}`);
    return reply.redirect(`/ui/jobs/${encodeURIComponent(jobId)}`);
  });

  app.get("/ui/rollouts/detail", async (request, reply) => {
    const requestedPath = q(request.query, "path");
    if (!requestedPath) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("artifact path is required"));
    }

    const resolved = resolveRolloutArtifact(requestedPath);
    if (!resolved) {
      return reply.code(404).type("text/html; charset=utf-8").send(simpleErrorHtml("artifact path is outside rollout roots or missing"));
    }

    const rawJson = fs.readFileSync(resolved.resolvedPath, "utf8");
    const doc = readJsonFileSafe(resolved.resolvedPath);
    const detailPairs = rolloutDetailPairs(doc);
    const issues = [
      ...rolloutDetailItems(isRecord(doc) ? doc.issues : null, 6),
      ...rolloutDetailItems(isRecord(doc) ? doc.warnings : null, 4),
      ...rolloutDetailItems(isRecord(doc) ? doc.hardFails : null, 4),
      ...rolloutDetailItems(isRecord(doc) && isRecord(doc.cross_channel) ? doc.cross_channel.differing_axes : null, 4)
    ].slice(0, 10);
    const targetRows = isRecord(doc) && Array.isArray(doc.target_results)
      ? doc.target_results
          .flatMap((entry) => {
            if (!isRecord(entry)) return [];
            const candidate = isRecord(entry.candidate) ? entry.candidate : {};
            return [`<tr><td>${esc(str(entry.target) ?? "-")}</td><td><span class="badge ${rolloutTone(normalizeRolloutStatus(str(entry.reason), entry.passed === true))}">${esc(entry.passed === true ? "ready" : normalizeRolloutStatus(str(entry.reason), false).replaceAll("_", " "))}</span></td><td>${esc(formatNumber(candidate.score))}</td><td>${esc(str(candidate.verdict) ?? "-")}</td><td>${esc(str(entry.reason) ?? "-")}</td></tr>`];
          })
          .join("")
      : "";
    const bundleRows = isRecord(doc) && Array.isArray(doc.bundles)
      ? doc.bundles
          .flatMap((entry) => {
            if (!isRecord(entry)) return [];
            const summary = isRecord(entry.summary) ? entry.summary : {};
            return [`<tr><td>${esc(str(entry.bundle) ?? str(entry.channel_domain) ?? "-")}</td><td><span class="badge ${rolloutTone(normalizeRolloutStatus(str(entry.status), entry.ready === true))}">${esc(normalizeRolloutStatus(str(entry.status), entry.ready === true).replaceAll("_", " "))}</span></td><td>${esc(formatNumber(summary.score))}</td><td>${esc(str(summary.verdict) ?? "-")}</td><td>${esc(previewStrings(entry.issues) ?? "-")}</td></tr>`];
          })
          .join("")
      : "";
    const metricRows = detailPairs.length > 0
      ? detailPairs.map((pair) => `<div class="status-row"><span class="label">${esc(pair.label)}</span><strong>${esc(pair.value)}</strong></div>`).join("")
      : `<div class="notice">No structured rollout fields were detected for this artifact.</div>`;
    const issueList = issues.length > 0
      ? `<ul>${issues.map((entry) => `<li>${esc(entry)}</li>`).join("")}</ul>`
      : `<div class="notice">No warnings, issues, or cross-channel notes were found.</div>`;
    const body = `
<section class="card dashboard-shell">
  <div class="section-head">
    <div>
      <h1>Rollout Detail</h1>
      <p class="section-intro">Inspect one benchmark artifact without leaving the SSR ops console.</p>
    </div>
    <div class="quick-links"><a href="/ui/rollouts">Back to Rollouts</a><a href="/ui/rollouts/artifact?path=${encodeURIComponent(resolved.resolvedPath)}">Raw JSON</a></div>
  </div>
  <div class="summary-grid">
    <div class="summary-card"><span class="badge muted">source</span><div class="metric">${esc(resolved.source.label)}</div><div class="caption">${esc(resolved.source.outRoot)}</div></div>
    <div class="summary-card"><span class="badge muted">file</span><div class="metric">${esc(path.basename(resolved.resolvedPath))}</div><div class="caption">${esc(artifactRelativePath(resolved.source.outRoot, resolved.resolvedPath))}</div></div>
  </div>
</section>
<section class="card dashboard-shell">
  <div class="section-head"><h2>Key Fields</h2><span class="muted-text">Top-level artifact metadata extracted from the JSON.</span></div>
  <div class="status-list">${metricRows}</div>
</section>
<section class="card dashboard-shell">
  <div class="section-head"><h2>Issues & Notes</h2><span class="muted-text">Warnings, validation issues, and divergence hints.</span></div>
  ${issueList}
</section>
${targetRows ? `<section class="card"><div class="section-head"><h2>Target Results</h2><span class="muted-text">Per-target rollout validation rows.</span></div><div class="table-wrap"><table><thead><tr><th>Target</th><th>Status</th><th>Score</th><th>Verdict</th><th>Reason</th></tr></thead><tbody>${targetRows}</tbody></table></div></section>` : ""}
${bundleRows ? `<section class="card"><div class="section-head"><h2>Bundle Results</h2><span class="muted-text">Per-bundle multi-channel validation rows.</span></div><div class="table-wrap"><table><thead><tr><th>Bundle</th><th>Status</th><th>Score</th><th>Verdict</th><th>Issues</th></tr></thead><tbody>${bundleRows}</tbody></table></div></section>` : ""}
<section class="card">
  <div class="section-head"><h2>Raw JSON Preview</h2><button type="button" class="secondary" data-copy="${esc(resolved.resolvedPath)}">Copy path</button></div>
  <pre>${esc(rawJson)}</pre>
</section>`;
    return reply.type("text/html; charset=utf-8").send(page("Rollout Detail", body));
  });

  app.get("/ui/rollouts/artifact", async (request, reply) => {
    const requestedPath = q(request.query, "path");
    if (!requestedPath) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("artifact path is required"));
    }

    const resolved = resolveRolloutArtifact(requestedPath);
    if (!resolved) {
      return reply.code(404).type("text/html; charset=utf-8").send(simpleErrorHtml("artifact path is outside rollout roots or missing"));
    }

    try {
      return reply.type("application/json; charset=utf-8").send(fs.readFileSync(resolved.resolvedPath, "utf8"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).type("text/html; charset=utf-8").send(simpleErrorHtml(`Artifact read failed: ${message}`));
    }
  });

  app.get("/ui/rollouts/file", async (request, reply) => {
    const requestedPath = q(request.query, "path");
    if (!requestedPath) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("file path is required"));
    }

    const resolved = resolveRolloutFile(requestedPath, [".mp4", ".webm", ".json", ".txt", ".png", ".jpg", ".jpeg", ".webp"]);
    if (!resolved) {
      return reply.code(404).type("text/html; charset=utf-8").send(simpleErrorHtml("file path is outside rollout roots or missing"));
    }

    try {
      return reply.type(mimeTypeForRolloutFile(resolved.resolvedPath)).send(fs.createReadStream(resolved.resolvedPath));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(500).type("text/html; charset=utf-8").send(simpleErrorHtml(`File read failed: ${message}`));
    }
  });

  app.get("/ui/benchmarks", async (request, reply) => {
    const { sources, backendScenarios, regressions } = collectBenchmarkViewerData();
    const backendReady = backendScenarios.filter((row) => normalizeRolloutStatus(row.status) === "ready").length;
    const regressionBlocked = regressions.filter((row) => normalizeRolloutStatus(row.status) === "blocked").length;
    const regressionWarn = regressions.filter((row) => normalizeRolloutStatus(row.status) === "warn").length;
    const mismatchTotal = regressions.reduce((sum, row) => sum + row.mismatchCount, 0);
    const summaryCards = [
      {
        label: "Backend Scenarios",
        value: String(backendScenarios.length),
        tone: "muted" as UiBadgeTone,
        hint: `${sources.filter((source) => source.exists).length}/${sources.length} artifact roots available`
      },
      {
        label: "Backend Ready",
        value: String(backendReady),
        tone: "ok" as UiBadgeTone,
        hint: "benchmark scenarios with usable outputs"
      },
      {
        label: "Regression Blocked",
        value: String(regressionBlocked),
        tone: "bad" as UiBadgeTone,
        hint: "episode regression reports with errors or failed final check"
      },
      {
        label: "Regression Warn",
        value: String(regressionWarn),
        tone: "warn" as UiBadgeTone,
        hint: "reports that passed but still need operator review"
      },
      {
        label: "Render Drift",
        value: String(mismatchTotal),
        tone: mismatchTotal > 0 ? ("warn" as UiBadgeTone) : ("ok" as UiBadgeTone),
        hint: "stored vs recommended render-mode mismatches"
      }
    ]
      .map((card) => `<div class="summary-card"><span class="badge ${card.tone}">${esc(card.label)}</span><div class="metric">${esc(card.value)}</div><div class="caption">${esc(card.hint)}</div></div>`)
      .join("");

    const sourceRows = sources
      .map((source) => {
        const tone: UiBadgeTone = !source.exists ? "bad" : source.recordCount > 0 ? "ok" : "warn";
        const label = !source.exists ? "missing" : source.recordCount > 0 ? `${source.recordCount} artifacts` : "empty";
        const meta = compact([
          source.exists ? "scan ok" : "root missing",
          source.latestGeneratedAt ? `latest ${fmtDate(source.latestGeneratedAt)}` : "no benchmark artifacts"
        ]);
        return `<div class="status-row"><div class="stack"><span class="label"><strong>${esc(source.label)}</strong></span><span class="mono">${esc(source.outRoot)}</span><span class="muted-text">${esc(meta)}</span></div><div class="inline-actions"><span class="badge ${tone}">${esc(label)}</span><button type="button" class="secondary" data-copy="${esc(source.outRoot)}">Copy path</button></div></div>`;
      })
      .join("");

    const backendRows = backendScenarios
      .map((row) => {
        const detailHref = `/ui/rollouts/detail?path=${encodeURIComponent(row.detailArtifactPath)}`;
        const rawHref = `/ui/rollouts/artifact?path=${encodeURIComponent(row.detailArtifactPath)}`;
        const smokeHref = row.smokeArtifactPath ? `/ui/rollouts/detail?path=${encodeURIComponent(row.smokeArtifactPath)}` : "";
        const planHref = row.planArtifactPath ? `/ui/rollouts/detail?path=${encodeURIComponent(row.planArtifactPath)}` : "";
        const candidateLinks = row.candidateCompareItems
          .map((item) => `<a href="/ui/benchmarks/candidates?path=${encodeURIComponent(item.path)}">${esc(item.label)}</a>`)
          .join("");
        return `<tr>
          <td><div class="table-note"><strong>${esc(row.backend)}</strong><span class="muted-text">${esc(`${row.benchmarkKind} / ${row.renderer}`)}</span><span class="mono">${esc(row.artifactRelativePath)}</span><div class="inline-actions"><a href="${detailHref}">Detail</a><a href="${rawHref}">Raw JSON</a>${smokeHref ? `<a href="${smokeHref}">Smoke</a>` : ""}${planHref ? `<a href="${planHref}">Plan</a>` : ""}${candidateLinks}<button type="button" class="secondary" data-copy="${esc(row.detailArtifactPath)}">Copy path</button></div></div></td>
          <td><span class="badge ${row.tone}">${esc(rolloutStatusLabel(row.status))}</span></td>
          <td>${esc(row.latencyMs)}</td>
          <td>${esc(row.acceptanceRate)}</td>
          <td>${esc(row.failureRate)}</td>
          <td>${esc(row.notes)}</td>
          <td><div class="stack"><strong>${esc(row.sourceLabel)}</strong><span class="mono">${esc(row.sourcePath)}</span><span class="muted-text">${fmtDate(row.generatedAt)}</span></div></td>
        </tr>`;
      })
      .join("");

    const regressionRows = regressions
      .map((row) => {
        const detailHref = `/ui/rollouts/detail?path=${encodeURIComponent(row.artifactPath)}`;
        const rawHref = `/ui/rollouts/artifact?path=${encodeURIComponent(row.artifactPath)}`;
        const smokeHref = row.smokeArtifactPath ? `/ui/rollouts/detail?path=${encodeURIComponent(row.smokeArtifactPath)}` : "";
        const renderModeHref = row.renderModeArtifactPath ? `/ui/rollouts/detail?path=${encodeURIComponent(row.renderModeArtifactPath)}` : "";
        const candidateLinks = row.candidateCompareItems
          .map((item) => `<a href="/ui/benchmarks/candidates?path=${encodeURIComponent(item.path)}">${esc(item.label)}</a>`)
          .join("");
        return `<tr>
          <td><div class="table-note"><strong>${esc(row.benchmarkName)}</strong><span class="muted-text">${esc(row.bundlePath)}</span><span class="mono">${esc(row.artifactRelativePath)}</span><div class="inline-actions"><a href="${detailHref}">Detail</a><a href="${rawHref}">Raw JSON</a>${smokeHref ? `<a href="${smokeHref}">Smoke</a>` : ""}${renderModeHref ? `<a href="${renderModeHref}">Render Modes</a>` : ""}${candidateLinks}<button type="button" class="secondary" data-copy="${esc(row.artifactPath)}">Copy path</button></div></div></td>
          <td><span class="badge ${row.tone}">${esc(rolloutStatusLabel(row.status))}</span></td>
          <td>${esc(`${row.warningCount} warn / ${row.errorCount} err`)}</td>
          <td>${esc(row.profileSummary)}</td>
          <td>${esc(row.renderModeSummary)}</td>
          <td>${esc(row.issueSummary)}</td>
          <td><div class="stack"><strong>${esc(row.sourceLabel)}</strong><span class="mono">${esc(row.sourcePath)}</span><span class="muted-text">${fmtDate(row.generatedAt)}</span></div></td>
        </tr>`;
      })
      .join("");

    const benchmarksBody = buildBenchmarksPageBody({
      flash: flashHtml(request.query),
      summaryCards,
      sourceRows: sourceRows || `<div class="notice">No benchmark artifact sources configured.</div>`,
      backendRows,
      regressionRows
    });
    return reply.type("text/html; charset=utf-8").send(page("Benchmarks", benchmarksBody));
  });

  app.get("/ui/benchmarks/candidates", async (request, reply) => {
    const requestedPath = q(request.query, "path");
    if (!requestedPath) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("candidate compare path is required"));
    }

    const bundle = resolveCandidateCompareBundle(requestedPath);
    if (!bundle) {
      return reply.code(404).type("text/html; charset=utf-8").send(simpleErrorHtml("candidate compare artifacts are missing or outside rollout roots"));
    }

    const planDoc = bundle.planPath ? readJsonFileSafe(bundle.planPath) : null;
    const requestDoc = bundle.requestPath ? readJsonFileSafe(bundle.requestPath) : null;
    const promptText = bundle.promptPath ? readTextFileSafe(bundle.promptPath) : null;
    const candidateJudgeDoc = bundle.candidateJudgePath ? readJsonFileSafe(bundle.candidateJudgePath) : null;
    const actualJudgeDoc = bundle.actualJudgePath ? readJsonFileSafe(bundle.actualJudgePath) : null;
    const shotId =
      str(isRecord(planDoc) ? planDoc.shot_id : undefined) ??
      str(isRecord(candidateJudgeDoc) ? candidateJudgeDoc.shot_id : undefined) ??
      str(isRecord(actualJudgeDoc) ? actualJudgeDoc.shot_id : undefined) ??
      bundle.stem;
    const episodeId =
      str(isRecord(planDoc) ? planDoc.episode_id : undefined) ??
      str(isRecord(candidateJudgeDoc) ? candidateJudgeDoc.episode_id : undefined) ??
      str(isRecord(actualJudgeDoc) ? actualJudgeDoc.episode_id : undefined) ??
      "-";
    const renderer =
      str(isRecord(planDoc) ? planDoc.renderer : undefined) ??
      str(isRecord(requestDoc) ? requestDoc.renderer : undefined) ??
      str(isRecord(actualJudgeDoc) ? actualJudgeDoc.renderer : undefined) ??
      "-";
    const backend =
      str(isRecord(planDoc) ? planDoc.backend : undefined) ??
      str(isRecord(requestDoc) ? requestDoc.backend : undefined) ??
      str(isRecord(actualJudgeDoc) ? actualJudgeDoc.backend : undefined) ??
      "-";
    const requestReference = isRecord(requestDoc) && isRecord(requestDoc.reference_bundle) ? requestDoc.reference_bundle : {};
    const selectedView = str(requestReference.selected_view) ?? str(isRecord(requestDoc) ? requestDoc.requested_reference_view : undefined);
    const selectedImagePath = str(requestReference.selected_image_path);
    const promptSource = promptText ?? str(isRecord(requestDoc) ? requestDoc.prompt : undefined) ?? "";
    const plannedSelectionId = str(isRecord(candidateJudgeDoc) ? candidateJudgeDoc.selected_candidate_id : undefined);
    const actualSelectionId = str(isRecord(actualJudgeDoc) ? actualJudgeDoc.selected_candidate_id : undefined);

    type CandidateRow = {
      candidateId: string;
      objective: string;
      plannedSelected: boolean;
      actualSelected: boolean;
      plannedScore: number | null;
      actualScore: number | null;
      priorScore: number | null;
      seedOverride: string;
      tags: string[];
      promptAdditions: string[];
      negativePromptAdditions: string[];
      latencyMs: number | null;
      qcPassed: boolean | null;
      qcReasons: string[];
      qcWarnings: string[];
      visualSignalScore: number | null;
      scoreBreakdown: Array<{ label: string; value: string }>;
      resultPath: string | null;
      visualJudgePath: string | null;
      workflowPath: string | null;
      preflightPath: string | null;
      videoPath: string | null;
      notes: string[];
    };

    const candidateMap = new Map<string, CandidateRow>();
    const ensureCandidate = (candidateId: string): CandidateRow => {
      const existing = candidateMap.get(candidateId);
      if (existing) return existing;
      const created: CandidateRow = {
        candidateId,
        objective: "-",
        plannedSelected: false,
        actualSelected: false,
        plannedScore: null,
        actualScore: null,
        priorScore: null,
        seedOverride: "-",
        tags: [],
        promptAdditions: [],
        negativePromptAdditions: [],
        latencyMs: null,
        qcPassed: null,
        qcReasons: [],
        qcWarnings: [],
        visualSignalScore: null,
        scoreBreakdown: [],
        resultPath: null,
        visualJudgePath: null,
        workflowPath: null,
        preflightPath: null,
        videoPath: null,
        notes: []
      };
      candidateMap.set(candidateId, created);
      return created;
    };

    if (isRecord(candidateJudgeDoc)) {
      for (const raw of recordList(candidateJudgeDoc.candidates)) {
        const candidateId = str(raw.candidate_id);
        if (!candidateId) continue;
        const row = ensureCandidate(candidateId);
        row.objective = str(raw.objective) ?? row.objective;
        row.plannedSelected = plannedSelectionId === candidateId;
        row.plannedScore = num(raw.score);
        row.seedOverride = str(raw.seed_override) ?? row.seedOverride;
        row.promptAdditions = uniqueStrings((Array.isArray(raw.prompt_additions) ? raw.prompt_additions : []).map((item) => str(item)));
        row.negativePromptAdditions = uniqueStrings((Array.isArray(raw.negative_prompt_additions) ? raw.negative_prompt_additions : []).map((item) => str(item)));
        row.tags = uniqueStrings([
          ...row.tags,
          ...(Array.isArray(raw.reasoning_tags) ? raw.reasoning_tags : []).map((item) => str(item))
        ]);
        const breakdown = isRecord(raw.score_breakdown) ? raw.score_breakdown : {};
        row.scoreBreakdown = [
          ["face", breakdown.face_stability],
          ["motion", breakdown.motion_coherence],
          ["silhouette", breakdown.silhouette_readability],
          ["identity", breakdown.mascot_identity_preservation],
          ["safe", breakdown.safe_zone_readiness],
          ["total", breakdown.total]
        ]
          .map(([label, value]) => ({ label, value: formatNumber(value) }))
          .filter((item) => item.value !== "-");
      }
    }

    if (isRecord(actualJudgeDoc)) {
      for (const raw of recordList(actualJudgeDoc.candidates)) {
        const candidateId = str(raw.candidate_id);
        if (!candidateId) continue;
        const row = ensureCandidate(candidateId);
        row.objective = str(raw.objective) ?? row.objective;
        row.actualSelected = actualSelectionId === candidateId || raw.selected === true;
        row.actualScore = num(raw.output_score);
        row.priorScore = num(raw.prior_score);
        row.seedOverride = str(raw.seed_override) ?? row.seedOverride;
        row.latencyMs = num(raw.latency_ms);
        row.qcPassed = typeof raw.qc_passed === "boolean" ? raw.qc_passed : null;
        row.qcReasons = uniqueStrings((Array.isArray(raw.qc_reasons) ? raw.qc_reasons : []).map((item) => str(item)));
        row.qcWarnings = uniqueStrings((Array.isArray(raw.qc_warnings) ? raw.qc_warnings : []).map((item) => str(item)));
        row.visualSignalScore = num(raw.visual_signal_score);
        row.resultPath = safeJsonArtifactPath(bundle.source, raw.result_path);
        row.visualJudgePath = safeJsonArtifactPath(bundle.source, raw.visual_signal_report_path);
        row.workflowPath = safeJsonArtifactPath(bundle.source, raw.workflow_path);
        row.preflightPath = safeJsonArtifactPath(bundle.source, raw.preflight_path);
        row.videoPath = safeRolloutVideoPath(bundle.source, raw.output_video_path);
        row.tags = uniqueStrings([
          ...row.tags,
          ...(Array.isArray(raw.reasoning_tags) ? raw.reasoning_tags : []).map((item) => str(item))
        ]);
        row.notes = uniqueStrings([
          ...(row.notes ?? []),
          ...(Array.isArray(raw.visual_signal_warnings) ? raw.visual_signal_warnings : []).map((item) => str(item)),
          str(raw.error)
        ]);
      }
    }

    const candidateRows = Array.from(candidateMap.values()).sort((left, right) => {
      if (left.actualSelected !== right.actualSelected) return left.actualSelected ? -1 : 1;
      if (left.plannedSelected !== right.plannedSelected) return left.plannedSelected ? -1 : 1;
      const rightActual = right.actualScore ?? -1;
      const leftActual = left.actualScore ?? -1;
      if (leftActual !== rightActual) return rightActual - leftActual;
      const rightPlanned = right.plannedScore ?? -1;
      const leftPlanned = left.plannedScore ?? -1;
      if (leftPlanned !== rightPlanned) return rightPlanned - leftPlanned;
      return left.candidateId.localeCompare(right.candidateId);
    });

    const summaryCards = [
      {
        label: "Prompt Winner",
        value: str(isRecord(candidateJudgeDoc) ? candidateJudgeDoc.selected_objective : undefined) ?? "-",
        tone: "ok" as UiBadgeTone,
        hint: str(isRecord(candidateJudgeDoc) ? candidateJudgeDoc.selection_reason : undefined) ?? "prompt candidate judge"
      },
      {
        label: "Actual Winner",
        value: str(isRecord(actualJudgeDoc) ? actualJudgeDoc.selected_objective : undefined) ?? "-",
        tone: "ok" as UiBadgeTone,
        hint: str(isRecord(actualJudgeDoc) ? actualJudgeDoc.selection_reason : undefined) ?? "actual output judge"
      },
      {
        label: "Candidates",
        value: String(candidateRows.length),
        tone: "muted" as UiBadgeTone,
        hint: compact([renderer !== "-" ? renderer : null, backend !== "-" ? backend : null]) || "sidecar compare set"
      },
      {
        label: "Reference View",
        value: selectedView ?? "-",
        tone: "warn" as UiBadgeTone,
        hint: selectedImagePath ? path.basename(selectedImagePath) : "reference bundle"
      }
    ]
      .map((card) => `<div class="summary-card"><span class="badge ${card.tone}">${esc(card.label)}</span><div class="metric" style="font-size:18px">${esc(humanizeOpsLabel(card.value))}</div><div class="caption">${esc(card.hint)}</div></div>`)
      .join("");

    const requestSummary = compact([
      str(isRecord(requestDoc) ? requestDoc.controlnet_preset : undefined),
      str(isRecord(requestDoc) ? requestDoc.impact_preset : undefined),
      str(isRecord(requestDoc) ? requestDoc.qc_preset : undefined),
      str(isRecord(requestDoc) ? requestDoc.render_quality : undefined)
    ]);

    const topLinks = [
      bundle.planPath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(bundle.planPath)}">Plan</a>` : "",
      bundle.requestPath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(bundle.requestPath)}">Request</a>` : "",
      bundle.candidateJudgePath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(bundle.candidateJudgePath)}">Prompt Judge</a>` : "",
      bundle.actualJudgePath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(bundle.actualJudgePath)}">Actual Judge</a>` : "",
      `<button type="button" class="secondary" data-copy="${esc(bundle.requestedPath)}">Copy path</button>`
    ]
      .filter((item) => item.length > 0)
      .join("");

    const compareTableRows = candidateRows
      .map((row) => {
        const delta = row.actualScore !== null && row.plannedScore !== null ? row.actualScore - row.plannedScore : null;
        const detailLinks = [
          row.resultPath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(row.resultPath)}">Result</a>` : "",
          row.visualJudgePath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(row.visualJudgePath)}">Visual Judge</a>` : "",
          row.preflightPath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(row.preflightPath)}">Preflight</a>` : "",
          row.videoPath ? `<a href="/ui/rollouts/file?path=${encodeURIComponent(row.videoPath)}">Open Video</a>` : ""
        ]
          .filter((item) => item.length > 0)
          .join("");
        const qcLabel =
          row.qcPassed === null
            ? "-"
            : row.qcPassed
              ? `passed${row.qcWarnings.length > 0 ? ` / ${summarizeValues(row.qcWarnings, 2)}` : ""}`
              : `failed / ${summarizeValues(row.qcReasons, 2)}`;
        return `<tr>
          <td><div class="table-note"><strong>${esc(humanizeOpsLabel(row.objective))}</strong><span class="muted-text">${esc(row.candidateId)}</span><span class="muted-text">${esc(summarizeValues(row.tags, 4))}</span><div class="inline-actions">${row.plannedSelected ? '<span class="badge ok">prompt selected</span>' : ''}${row.actualSelected ? '<span class="badge warn">actual selected</span>' : ''}</div></div></td>
          <td>${esc(row.plannedScore === null ? "-" : formatNumber(row.plannedScore))}</td>
          <td>${esc(row.actualScore === null ? "-" : formatNumber(row.actualScore))}</td>
          <td>${esc(delta === null ? "-" : formatNumber(delta, 2))}</td>
          <td>${esc(qcLabel)}</td>
          <td>${esc(row.latencyMs === null ? "-" : `${Math.round(row.latencyMs)} ms`)}</td>
          <td>${esc(row.visualSignalScore === null ? "-" : formatNumber(row.visualSignalScore))}</td>
          <td><div class="inline-actions">${detailLinks || "-"}</div></td>
        </tr>`;
      })
      .join("");

    const candidateCards = candidateRows
      .map((row) => {
        const videoHref = row.videoPath ? `/ui/rollouts/file?path=${encodeURIComponent(row.videoPath)}` : "";
        const detailLinks = [
          row.resultPath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(row.resultPath)}">Result JSON</a>` : "",
          row.visualJudgePath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(row.visualJudgePath)}">Visual Judge</a>` : "",
          row.workflowPath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(row.workflowPath)}">Workflow</a>` : "",
          row.preflightPath ? `<a href="/ui/rollouts/detail?path=${encodeURIComponent(row.preflightPath)}">Preflight</a>` : ""
        ]
          .filter((item) => item.length > 0)
          .join("");
        const breakdown = row.scoreBreakdown
          .map((item) => `<span class="editor-chip">${esc(item.label)} ${esc(item.value)}</span>`)
          .join("");
        return `<section class="card">
          <div class="section-head">
            <div>
              <h2>${esc(humanizeOpsLabel(row.objective))}</h2>
              <p class="section-intro">${esc(row.candidateId)}</p>
            </div>
            <div class="inline-actions">${row.plannedSelected ? '<span class="badge ok">prompt selected</span>' : ''}${row.actualSelected ? '<span class="badge warn">actual selected</span>' : ''}</div>
          </div>
          ${videoHref ? `<video controls preload="metadata" style="width:100%;max-width:560px;background:#000;border-radius:10px" src="${videoHref}"></video>` : `<div class="notice">Actual output video is not available for this candidate.</div>`}
          <div class="grid two" style="margin-top:10px">
            <div class="form-card">
              <h3>Prompt Candidate</h3>
              <p>planned score: <strong>${esc(row.plannedScore === null ? "-" : formatNumber(row.plannedScore))}</strong></p>
              <p>seed: <strong>${esc(row.seedOverride)}</strong></p>
              <p>prompt additions: <strong>${esc(summarizeValues(row.promptAdditions, 4))}</strong></p>
              <p>negative additions: <strong>${esc(summarizeValues(row.negativePromptAdditions, 4))}</strong></p>
              <div class="inline-actions">${breakdown || '<span class="muted-text">No prompt score breakdown.</span>'}</div>
            </div>
            <div class="form-card">
              <h3>Actual Output</h3>
              <p>actual score: <strong>${esc(row.actualScore === null ? "-" : formatNumber(row.actualScore))}</strong></p>
              <p>latency: <strong>${esc(row.latencyMs === null ? "-" : `${Math.round(row.latencyMs)} ms`)}</strong></p>
              <p>QC: <strong>${esc(row.qcPassed === null ? "-" : row.qcPassed ? "passed" : "failed")}</strong></p>
              <p>qc warnings: <strong>${esc(summarizeValues(row.qcWarnings, 3))}</strong></p>
              <p>qc reasons: <strong>${esc(summarizeValues(row.qcReasons, 3))}</strong></p>
              <p>visual signal: <strong>${esc(row.visualSignalScore === null ? "-" : formatNumber(row.visualSignalScore))}</strong></p>
            </div>
          </div>
          <div class="quick-links" style="margin-top:10px">${detailLinks || '<span class="muted-text">No detailed artifacts for this candidate.</span>'}${videoHref ? `<a href="${videoHref}">Open Video</a>` : ""}</div>
          ${row.notes.length > 0 ? `<div class="notice" style="margin-top:10px">notes: ${esc(summarizeValues(row.notes, 4))}</div>` : ""}
        </section>`;
      })
      .join("");

    const body = `
<section class="card dashboard-shell">
  <div class="section-head">
    <div>
      <h1>Sidecar Candidate Compare</h1>
      <p class="section-intro">Prompt candidate scoring vs actual sidecar output scoring for one shot.</p>
    </div>
    <div class="quick-links"><a href="/ui/benchmarks">Back to Benchmarks</a><a href="/ui/rollouts">Open Rollouts</a></div>
  </div>
  ${flashHtml(request.query)}
  <p>episodeId: <strong>${esc(episodeId)}</strong> | shotId: <strong>${esc(shotId)}</strong></p>
  <p>renderer: <strong>${esc(renderer)}</strong> | backend: <strong>${esc(backend)}</strong></p>
  <p>preset stack: <strong>${esc(requestSummary || "-")}</strong></p>
  <p>reference view: <strong>${esc(selectedView ?? "-")}</strong> ${selectedImagePath ? `| <span class="mono">${esc(selectedImagePath)}</span>` : ""}</p>
  <div class="summary-grid">${summaryCards}</div>
  <div class="quick-links" style="margin-top:10px">${topLinks}</div>
</section>
<section class="card">
  <div class="section-head"><h2>Candidate Score Matrix</h2><span class="muted-text">Compare prompt selection score against actual rendered output score.</span></div>
  <div class="table-wrap"><table><thead><tr><th>Candidate</th><th>Prompt Score</th><th>Actual Score</th><th>Delta</th><th>QC</th><th>Latency</th><th>Visual Signal</th><th>Artifacts</th></tr></thead><tbody>${compareTableRows || '<tr><td colspan="8"><div class="notice">No candidate judge rows found.</div></td></tr>'}</tbody></table></div>
</section>
<section class="card">
  <div class="section-head"><h2>Request Context</h2><span class="muted-text">Prompt and reference bundle that produced this candidate set.</span></div>
  <div class="grid two">
    <div class="form-card">
      <h3>Reference Bundle</h3>
      <p>selected view: <strong>${esc(selectedView ?? "-")}</strong></p>
      <p>available views: <strong>${esc(summarizeValues(Array.isArray(requestReference.available_views) ? requestReference.available_views.map((item) => str(item)) : [], 4))}</strong></p>
      <p>selection reasons: <strong>${esc(summarizeValues(Array.isArray(requestReference.selection_reasons) ? requestReference.selection_reasons.map((item) => str(item)) : [], 5))}</strong></p>
    </div>
    <div class="form-card">
      <h3>Prompt Preview</h3>
      <pre>${esc(promptSource || "prompt.txt not available")}</pre>
    </div>
  </div>
</section>
<section class="grid two">
  ${candidateCards || '<div class="notice">No candidate detail cards found.</div>'}
</section>`;
    return reply.type("text/html; charset=utf-8").send(page(`Candidate Compare ${shotId}`, body));
  });

  app.get("/ui/rollouts", async (request, reply) => {
    const { sources, signals } = collectRolloutSignals();
    const stats = {
      total: signals.length,
      ready: signals.filter((signal) => normalizeRolloutStatus(signal.status) === "ready").length,
      blocked: signals.filter((signal) => normalizeRolloutStatus(signal.status) === "blocked").length,
      belowMinScore: signals.filter((signal) => normalizeRolloutStatus(signal.status) === "below_min_score").length,
      divergence: signals.filter((signal) => normalizeRolloutStatus(signal.status) === "divergence").length
    };
    const summaryCards = [
      {
        label: "Signals",
        value: String(stats.total),
        tone: "muted" as UiBadgeTone,
        hint: `${sources.filter((source) => source.exists).length}/${sources.length} artifact roots available`
      },
      {
        label: "Ready",
        value: String(stats.ready),
        tone: "ok" as UiBadgeTone,
        hint: "usable or no-change rollout states"
      },
      {
        label: "Blocked",
        value: String(stats.blocked),
        tone: "bad" as UiBadgeTone,
        hint: "failed promotion or inspection states"
      },
      {
        label: "Below Min",
        value: String(stats.belowMinScore),
        tone: "bad" as UiBadgeTone,
        hint: "scores under rollout threshold"
      },
      {
        label: "Divergence",
        value: String(stats.divergence),
        tone: "warn" as UiBadgeTone,
        hint: "cross-channel drift to inspect"
      }
    ]
      .map((card) => `<div class="summary-card"><span class="badge ${card.tone}">${esc(card.label)}</span><div class="metric">${esc(card.value)}</div><div class="caption">${esc(card.hint)}</div></div>`)
      .join("");

    const sourceRows = sources
      .map((source) => {
        const tone: UiBadgeTone = !source.exists ? "bad" : source.recordCount > 0 ? "ok" : "warn";
        const label = !source.exists ? "missing" : source.recordCount > 0 ? `${source.recordCount} signals` : "empty";
        const meta = compact([
          source.exists ? "scan ok" : "root missing",
          source.latestGeneratedAt ? `latest ${fmtDate(source.latestGeneratedAt)}` : "no benchmark artifacts"
        ]);
        return `<div class="status-row"><div class="stack"><span class="label"><strong>${esc(source.label)}</strong></span><span class="mono">${esc(source.outRoot)}</span><span class="muted-text">${esc(meta)}</span></div><div class="inline-actions"><span class="badge ${tone}">${esc(label)}</span><button type="button" class="secondary" data-copy="${esc(source.outRoot)}">Copy path</button></div></div>`;
      })
      .join("");

    const rows = signals
      .map((signal) => {
        const artifactHref = `/ui/rollouts/artifact?path=${encodeURIComponent(signal.artifactPath)}`;
        const detailHref = `/ui/rollouts/detail?path=${encodeURIComponent(signal.artifactPath)}`;
        return `<tr><td><div class="table-note"><strong>${esc(signal.kind)}</strong><span class="muted-text">${esc(`${signal.scope} / ${signal.target}`)}</span><span class="mono">${esc(signal.artifactRelativePath)}</span><div class="inline-actions"><a href="${detailHref}">Detail</a><a href="${artifactHref}">Raw JSON</a><button type="button" class="secondary" data-copy="${esc(signal.artifactPath)}">Copy path</button></div></div></td><td><span class="badge ${signal.tone}">${esc(rolloutStatusLabel(signal.status))}</span></td><td>${esc(signal.score)}</td><td>${esc(signal.verdict)}</td><td>${esc(signal.reason || "-")}</td><td>${fmtDate(signal.generatedAt)}</td><td><div class="stack"><strong>${esc(signal.sourceLabel)}</strong><span class="mono">${esc(signal.sourcePath)}</span></div></td></tr>`;
      })
      .join("");

    const rolloutsBody = buildRolloutsPageBody({
      flash: flashHtml(request.query),
      summaryCards,
      sourceRows: sourceRows || `<div class="notice">No rollout artifact sources configured.</div>`,
      rows
    });
    return reply.type("text/html; charset=utf-8").send(page("Rollouts", rolloutsBody));
  });

  app.get("/ui/artifacts", async (request, reply) => {
    const episodeId = q(request.query, "episodeId");
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(getOutRoot(), { withFileTypes: true });
    } catch {
      entries = [];
    }

    const rows = entries
      .filter((x) => x.isDirectory() || x.isFile())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => `<tr><td>${x.isDirectory() ? "directory" : "file"}</td><td>${esc(x.name)}</td><td><a href="${x.isDirectory() ? `/artifacts/${encodeURIComponent(x.name)}/` : `/artifacts/${encodeURIComponent(x.name)}`}">${x.isDirectory() ? `/artifacts/${encodeURIComponent(x.name)}/` : `/artifacts/${encodeURIComponent(x.name)}`}</a></td></tr>`)
      .join("");

    let episodeLinks = "";
    if (episodeId) {
      const out = getEpisodeOutPaths(episodeId);
      const links = [
        { label: "Episode folder", url: `/artifacts/${encodeURIComponent(episodeId)}/`, exists: fs.existsSync(out.outDir) },
        { label: "beats.json", url: `/artifacts/${encodeURIComponent(episodeId)}/beats.json`, exists: fs.existsSync(out.beats) },
        { label: "shots.json", url: `/artifacts/${encodeURIComponent(episodeId)}/shots.json`, exists: fs.existsSync(out.shots) },
        { label: "preview.mp4", url: `/artifacts/${encodeURIComponent(episodeId)}/preview.mp4`, exists: fs.existsSync(out.preview) },
        { label: "final.mp4", url: `/artifacts/${encodeURIComponent(episodeId)}/final.mp4`, exists: fs.existsSync(out.final) },
        { label: "qc_report.json", url: `/artifacts/${encodeURIComponent(episodeId)}/qc_report.json`, exists: fs.existsSync(out.qc) },
        { label: "upload_manifest.json", url: `/artifacts/${encodeURIComponent(episodeId)}/upload_manifest.json`, exists: fs.existsSync(path.join(out.outDir, "upload_manifest.json")) }
      ];
      episodeLinks = `<ul>${links.map((x) => `<li><a href="${x.url}">${x.label}</a> <span class="badge ${x.exists ? "ok" : "bad"}">${x.exists ? "exists" : "missing"}</span></li>`).join("")}</ul>`;
    }

    const artifactsBody = buildArtifactsPageBody({
      flash: flashHtml(request.query),
      episodeId: esc(episodeId ?? ""),
      episodeLinks,
      rows
    });
    return reply.type("text/html; charset=utf-8").send(page("Artifacts", artifactsBody));
  });
}










