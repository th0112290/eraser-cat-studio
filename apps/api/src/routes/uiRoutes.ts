
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
  buildArtifactsPageBody,
  buildHitlPageBody,
  buildJobDetailPageBody,
  buildJobsPageBody,
  buildPublishPageBody,
} from "./ui/pages/operationsPages";
import {
  buildDatasetLineagePageBody,
  buildRepairAcceptancePageBody,
  buildRouteReasonPageBody
} from "./ui/pages/opsReviewPages";
import { buildDashboardPageBody, buildEpisodesPageBody } from "./ui/pages/dashboardEpisodesPages";
import {
  buildBenchmarkRefreshActions,
  buildBenchmarkRefreshPlaybooksSection,
  buildCompactRefreshPlaybookHandoff,
  buildRigRepairHandoffLinks,
  buildRolloutRefreshPlaybooksSection,
  resolveSinglePackId,
  type BenchmarkRefreshAction
} from "./uiRouteBenchmarkHandoffs";
import { resolveBenchmarkScenarioHandoffStateWithNormalizer } from "./uiRouteBenchmarkScenarioHandoff";
import {
  collectBundleFixturePath as collectBundleFixturePathWithNormalizer,
  collectRuntimePackIdsFromShotsDoc,
  resolveRuntimeShotCharacterPackId
} from "./uiRouteBenchmarkRuntimeArtifacts";
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
  type RouteReasonExplorerRow
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
  buildSidecarPlanReviewMap as buildSidecarPlanReviewMapFromSource,
  type SidecarPlanReviewEntry
} from "./uiRouteBenchmarkPlanReview";
import {
  buildRegressionReportViews as buildRegressionReportViewsFromSource,
  collectBenchmarkViewerDataFromSources,
  type RegressionReportView
} from "./uiRouteBenchmarkRegressionReports";
import {
  collectBundleReviewState,
  reviewIssuesForShot,
  summarizeReviewIssues,
  type BundleReviewState,
  type ReviewIssueEntry
} from "./uiRouteBenchmarkBundleReview";
import {
  createEmptyRigReviewState,
  extractRigReviewState,
  mergeRigReviewStates,
  readRigReviewStateFromArtifactPath,
  RIG_SIGNAL_KEYS,
  type RigReviewState,
  type RigSignalCell,
  type RigSignalKey
} from "./uiRouteRigReviewState";
export {
  buildBenchmarkRefreshActions,
  buildBenchmarkRefreshPlaybooksSection,
  buildCompactRefreshPlaybookHandoff,
  buildRigRepairHandoffLinks,
  buildRolloutRefreshPlaybooksSection,
  resolveSinglePackId
} from "./uiRouteBenchmarkHandoffs";

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

type DecisionLinkState = {
  focus: string | null;
  selected: string[];
  returnTo: string | null;
  compare: string[];
  pinned: string[];
  view: string | null;
};

type UiHrefValue = string | string[] | null | undefined;

function normalizeUiReturnTo(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replaceAll("\\", "/");
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("http:") || lower.startsWith("https:")) {
    return null;
  }
  return trimmed;
}

function readDecisionLinkState(query: unknown): DecisionLinkState {
  const queryRecord = isRecord(query) ? query : {};
  return {
    focus: q(query, "focus") ?? null,
    selected: csv(queryRecord.selected),
    returnTo: normalizeUiReturnTo(q(query, "returnTo")),
    compare: csv(queryRecord.compare),
    pinned: csv(queryRecord.pinned),
    view: q(query, "view") ?? null
  };
}

function decisionStateParams(state: DecisionLinkState): Record<string, UiHrefValue> {
  return {
    focus: state.focus,
    selected: state.selected,
    returnTo: state.returnTo,
    compare: state.compare,
    pinned: state.pinned,
    view: state.view
  };
}

function setUiHrefParam(params: URLSearchParams, key: string, value: UiHrefValue): void {
  if (Array.isArray(value)) {
    const normalized = uniqueStrings(value.map((entry) => (typeof entry === "string" ? entry.trim() : "")));
    if (normalized.length === 0) {
      params.delete(key);
      return;
    }
    params.set(key, normalized.join(","));
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      params.delete(key);
      return;
    }
    params.set(key, trimmed);
    return;
  }
  params.delete(key);
}

function uiHref(
  pathname: string,
  input?: {
    params?: Record<string, UiHrefValue>;
    preserveDecision?: DecisionLinkState | null;
    hash?: string | null;
  }
): string {
  const params = new URLSearchParams();
  if (input?.preserveDecision) {
    for (const [key, value] of Object.entries(decisionStateParams(input.preserveDecision))) {
      setUiHrefParam(params, key, value);
    }
  }
  for (const [key, value] of Object.entries(input?.params ?? {})) {
    setUiHrefParam(params, key, value);
  }
  const query = params.toString();
  const hash = input?.hash ? (input.hash.startsWith("#") ? input.hash : `#${input.hash}`) : "";
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

function uiHrefFromExisting(
  href: string,
  input?: {
    params?: Record<string, UiHrefValue>;
    hash?: string | null;
  }
): string {
  const [pathAndQuery, existingHash] = href.split("#", 2);
  const queryIndex = pathAndQuery.indexOf("?");
  const pathname = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
  const params = new URLSearchParams(queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : "");
  for (const [key, value] of Object.entries(input?.params ?? {})) {
    setUiHrefParam(params, key, value);
  }
  const query = params.toString();
  const hashValue = input?.hash === undefined ? existingHash ?? "" : input.hash ?? "";
  const hash = hashValue ? (hashValue.startsWith("#") ? hashValue : `#${hashValue}`) : "";
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

function renderDecisionStateHiddenInputs(state: DecisionLinkState): string {
  return compact(
    [
      state.focus ? `<input type="hidden" name="focus" value="${esc(state.focus)}"/>` : null,
      state.selected.length > 0 ? `<input type="hidden" name="selected" value="${esc(state.selected.join(","))}"/>` : null,
      state.returnTo ? `<input type="hidden" name="returnTo" value="${esc(state.returnTo)}"/>` : null,
      state.compare.length > 0 ? `<input type="hidden" name="compare" value="${esc(state.compare.join(","))}"/>` : null,
      state.pinned.length > 0 ? `<input type="hidden" name="pinned" value="${esc(state.pinned.join(","))}"/>` : null,
      state.view ? `<input type="hidden" name="view" value="${esc(state.view)}"/>` : null
    ],
    ""
  );
}

function decisionToken(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function decisionTokenSet(values: string[]): Set<string> {
  return new Set(values.map((value) => decisionToken(value)).filter((value) => value.length > 0));
}

function decisionSetHas(values: Set<string>, ...candidates: Array<string | null | undefined>): boolean {
  return candidates.some((candidate) => {
    const normalized = decisionToken(candidate);
    return normalized.length > 0 && values.has(normalized);
  });
}

function hasDecisionLinkState(state: DecisionLinkState): boolean {
  return Boolean(state.focus || state.returnTo || state.view || state.selected.length > 0 || state.compare.length > 0 || state.pinned.length > 0);
}

function buildDecisionAnchorId(prefix: string, value: string | null | undefined): string {
  const normalized = (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${normalized || "item"}`;
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

function safeRolloutArtifactPath(candidatePath: unknown): string | null {
  const filePath = str(candidatePath);
  if (!filePath) {
    return null;
  }
  return resolveRolloutFile(filePath)?.resolvedPath ?? filePath;
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
  return buildBackendBenchmarkViewsFromSource({
    source,
    pathExists: (filePath) => fs.existsSync(filePath),
    listDirectories,
    readJsonFileSafe,
    safeJsonArtifactPath,
    findCandidateCompareItems,
    normalizeRolloutStatus,
    rolloutTone,
    resolveBenchmarkScenarioHandoffState,
    artifactRelativePath
  });
}

function buildRegressionReportViews(source: RolloutArtifactSource): RegressionReportView[] {
  return buildRegressionReportViewsFromSource({
    source,
    pathExists: (filePath) => fs.existsSync(filePath),
    findFilesByName,
    readJsonFileSafe,
    safeJsonArtifactPath,
    findCandidateCompareItems,
    normalizeRolloutStatus,
    rolloutTone,
    artifactRelativePath
  });
}

function collectBenchmarkViewerData(): {
  sources: RolloutSourceStatus[];
  backendScenarios: BenchmarkScenarioView[];
  regressions: RegressionReportView[];
} {
  return collectBenchmarkViewerDataFromSources({
    sources: getRolloutArtifactSources(),
    pathExists: (filePath) => fs.existsSync(filePath),
    buildBackendBenchmarkViews,
    buildRegressionReportViews,
    selectGeneratedAt
  });
}

function collectBundleFixturePath(bundle: SmokeArtifactBundle): string | null {
  return collectBundleFixturePathWithNormalizer(bundle, safeRolloutArtifactPath);
}

function collectSmokeArtifactBundles(): SmokeArtifactBundle[] {
  return collectSmokeArtifactBundlesWithResolvers({
    sources: getRolloutArtifactSources(),
    pathExists: (filePath) => fs.existsSync(filePath),
    findFilesByName,
    readJsonFileSafe,
    normalizeJsonArtifactPath: (source, candidatePath) => safeJsonArtifactPath(source, candidatePath),
    artifactRelativePath
  });
}

function readBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function buildSidecarPlanReviewMap(
  source: RolloutArtifactSource,
  sidecarPlan: unknown
): Map<string, SidecarPlanReviewEntry> {
  return buildSidecarPlanReviewMapFromSource({
    source,
    sidecarPlan,
    safeJsonArtifactPath,
    safeRolloutTextPath,
    safeRolloutVideoPath
  });
}

function collectReferenceLineage(
  source: RolloutArtifactSource,
  baseDir: string
): { manifestPaths: string[]; selectedImagePaths: string[]; rig: RigReviewState } {
  return collectReferenceLineageWithResolvers({
    baseDir,
    readJsonFileSafe,
    normalizeJsonArtifactPath: (candidatePath) => safeJsonArtifactPath(source, candidatePath),
    createEmptyRigReviewState,
    mergeRigReviewStates,
    extractRigReviewState
  });
}

function buildCandidateCompareMap(source: RolloutArtifactSource, baseDir: string): Map<string, string> {
  return buildCandidateCompareMapFromItems(findCandidateCompareItems(source, baseDir), readJsonFileSafe);
}

function acceptanceStatusFromArtifact(raw: JsonRecord): string {
  const explicit = str(raw.acceptance_status);
  if (explicit) {
    return explicit;
  }
  if (raw.accepted === true || raw.judge_accepted === true) {
    return "accepted";
  }
  if (raw.accepted === false || raw.judge_accepted === false) {
    return "rejected";
  }
  return str(raw.judge_decision) ?? str(raw.status) ?? "unknown";
}

function acceptanceTone(status: string): UiBadgeTone {
  const normalized = status.trim().toLowerCase();
  if (["accepted", "ready", "resolved", "passed", "ok"].includes(normalized)) return "ok";
  if (["rejected", "failed", "blocked", "error"].includes(normalized)) return "bad";
  if (["warn", "warning", "review"].includes(normalized)) return "warn";
  return "muted";
}

function qcStatusFromArtifact(raw: JsonRecord): { status: string; tone: UiBadgeTone; summary: string } {
  const reasons = uniqueStrings([
    ...(Array.isArray(raw.qc_reasons) ? raw.qc_reasons : []).map((item) => str(item)),
    ...(Array.isArray(isRecord(raw.qc_evaluation) ? raw.qc_evaluation.reasons : undefined)
      ? ((raw.qc_evaluation as JsonRecord).reasons as unknown[]).map((item) => str(item))
      : [])
  ]);
  const warnings = uniqueStrings([
    ...(Array.isArray(raw.qc_warnings) ? raw.qc_warnings : []).map((item) => str(item)),
    ...(Array.isArray(isRecord(raw.qc_evaluation) ? raw.qc_evaluation.warnings : undefined)
      ? ((raw.qc_evaluation as JsonRecord).warnings as unknown[]).map((item) => str(item))
      : [])
  ]);
  if (raw.qc_passed === true) {
    return {
      status: warnings.length > 0 ? "passed_with_warnings" : "passed",
      tone: warnings.length > 0 ? "warn" : "ok",
      summary: warnings.length > 0 ? summarizeValues(warnings, 3) : "passed"
    };
  }
  if (raw.qc_passed === false || reasons.length > 0) {
    return {
      status: "failed",
      tone: "bad",
      summary: summarizeValues(reasons, 3)
    };
  }
  return { status: "unknown", tone: "muted", summary: "-" };
}

function collectRepairAcceptanceRows(): RepairAcceptanceRow[] {
  const bundles = collectSmokeArtifactBundles();
  return collectRepairAcceptanceRowsFromBundles({
    bundles,
    buildCandidateCompareMap: (bundle, baseDir) =>
      buildCandidateCompareMap(bundle.source, path.dirname(baseDir)),
    buildSidecarPlanReviewMap: (bundle) => buildSidecarPlanReviewMap(bundle.source, bundle.sidecarPlanDoc),
    collectBundleFixturePath,
    collectBundleReviewState: (bundle) =>
      collectBundleReviewState({
        qcDoc: bundle.qcDoc,
        renderLogDoc: bundle.renderLogDoc,
        qcArtifactPath: bundle.qcPath,
        renderLogPath: bundle.renderLogPath
      }),
    reviewIssuesForShot,
    summarizeReviewIssues,
    acceptanceStatusFromArtifact,
    acceptanceTone,
    qcStatusFromArtifact,
    resolveRuntimeShotCharacterPackId,
    safeActualJudgePath: (bundle, raw, planReview) =>
      safeJsonArtifactPath(bundle.source, raw.premium_actual_judge_path) ?? planReview?.actualJudgePath ?? null,
    safeVisualJudgePath: (bundle, raw, planReview) =>
      safeJsonArtifactPath(bundle.source, raw.premium_actual_visual_signal_report_path) ?? planReview?.visualJudgePath ?? null,
    artifactRelativePath,
    mergeRigReviewStates,
    extractRigReviewState,
    readRigReviewStateFromArtifactPath
  });
}

function collectRouteReasonRows(): RouteReasonExplorerRow[] {
  const bundles = collectSmokeArtifactBundles();
  return collectRouteReasonRowsFromBundles({
    bundles,
    buildCandidateCompareMap: (bundle, baseDir) =>
      buildCandidateCompareMap(bundle.source, path.dirname(baseDir)),
    buildSidecarPlanReviewMap: (bundle) => buildSidecarPlanReviewMap(bundle.source, bundle.sidecarPlanDoc),
    collectBundleFixturePath,
    collectBundleReviewState: (bundle) =>
      collectBundleReviewState({
        qcDoc: bundle.qcDoc,
        renderLogDoc: bundle.renderLogDoc,
        qcArtifactPath: bundle.qcPath,
        renderLogPath: bundle.renderLogPath
      }),
    buildShotOpsItems: (bundle) =>
      buildShotOpsItems({
        shotsDoc: bundle.runtimeDoc,
        qcReport: bundle.qcDoc,
        sidecarPlan: bundle.sidecarPlanDoc,
        renderModeReport: bundle.renderModeDoc
      }),
    reviewIssuesForShot,
    summarizeReviewIssues,
    resolveRuntimeShotCharacterPackId,
    artifactRelativePath,
    acceptanceTone,
    mergeRigReviewStates,
    extractRigReviewState,
    readRigReviewStateFromArtifactPath
  });
}

function collectDatasetLineageRows(): DatasetLineageRow[] {
  const bundles = collectSmokeArtifactBundles();
  return collectDatasetLineageRowsFromBundles({
    bundles,
    isShotsDocLike,
    collectRuntimePackIdsFromShotsDoc,
    collectReferenceLineage: (bundle, baseDir) =>
      collectReferenceLineage(bundle.source, path.dirname(baseDir)),
    artifactRelativePath,
    collectBundleFixturePath
  });
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

function readNumberAtPath(root: unknown, keys: string[]): number | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return num(current);
}

function readBooleanAtPath(root: unknown, keys: string[]): boolean | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return readBooleanOrNull(current);
}

function readRecordAtPath(root: unknown, keys: string[]): JsonRecord | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return isRecord(current) ? current : null;
}

function firstStringAtPaths(root: unknown, keyPaths: string[][]): string | null {
  for (const keyPath of keyPaths) {
    const value = readStringAtPath(root, keyPath);
    if (value) {
      return value;
    }
  }
  return null;
}

function firstNumberAtPaths(root: unknown, keyPaths: string[][]): number | null {
  for (const keyPath of keyPaths) {
    const value = readNumberAtPath(root, keyPath);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function firstBooleanAtPaths(root: unknown, keyPaths: string[][]): boolean | null {
  for (const keyPath of keyPaths) {
    const value = readBooleanAtPath(root, keyPath);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function firstRecordAtPaths(root: unknown, keyPaths: string[][]): JsonRecord | null {
  for (const keyPath of keyPaths) {
    const value = readRecordAtPath(root, keyPath);
    if (value) {
      return value;
    }
  }
  return null;
}

function flattenStringArraysAtPaths(root: unknown, keyPaths: string[][]): string[] {
  return uniqueStrings(keyPaths.flatMap((keyPath) => readStringArrayAtPath(root, keyPath)));
}

function averageNumbers(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}


function rigStateTone(state: RigReviewState): UiBadgeTone {
  if (state.rigBlocked) return "bad";
  if (state.reviewOnly || state.lowAnchorConfidence || state.rigReasonCodes.length > 0) return "warn";
  if (
    state.anchorConfidence !== null ||
    RIG_SIGNAL_KEYS.some((signal) => state.signals[signal].score !== null) ||
    state.fallbackReasonCodes.length > 0
  ) {
    return "ok";
  }
  return "muted";
}

function formatRigSignalValue(state: RigReviewState, signal: RigSignalKey): string {
  const score = state.signals[signal].score;
  return score === null ? "-" : formatNumber(score);
}

function formatRigSignalTableCell(state: RigReviewState, signal: RigSignalKey): string {
  const cell = state.signals[signal];
  if (cell.score === null) {
    return "-";
  }
  const tone: UiBadgeTone = cell.status === "fail" ? "bad" : cell.status === "warn" ? "warn" : "ok";
  return `<div class="table-note"><strong>${esc(formatNumber(cell.score))}</strong><span class="badge ${tone}">${esc(cell.status ?? "pass")}</span></div>`;
}

function formatAnchorConfidenceSummary(state: RigReviewState): string {
  const parts: string[] = [];
  if (state.anchorConfidence !== null) {
    parts.push(formatNumber(state.anchorConfidence, 2));
  }
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const value = state.anchorByView[view];
    if (typeof value === "number") {
      parts.push(`${view === "threeQuarter" ? "3/4" : view} ${formatNumber(value, 2)}`);
    }
  }
  return parts.length > 0 ? parts.join(" | ") : "-";
}

function formatAnchorConfidenceTableCell(state: RigReviewState): string {
  if (state.anchorConfidence === null && Object.keys(state.anchorByView).length === 0) {
    return "-";
  }
  const tone = state.lowAnchorConfidence ? "warn" : rigStateTone(state);
  return `<div class="table-note"><strong>${esc(state.anchorConfidence === null ? "-" : formatNumber(state.anchorConfidence, 2))}</strong><span class="badge ${tone}">${esc(
    state.reviewOnly ? "review_only" : state.lowAnchorConfidence ? "low" : "tracked"
  )}</span></div>`;
}

function summarizeRigFlags(state: RigReviewState): string {
  const flags = uniqueStrings([
    ...(state.rigBlocked ? ["rig_blocked"] : []),
    ...(state.reviewOnly ? ["review_only"] : []),
    ...(state.lowAnchorConfidence ? ["low_anchor_confidence"] : []),
    ...(state.recreateRecommended ? ["recreate_recommended"] : [])
  ]);
  return flags.length > 0 ? flags.join(", ") : "-";
}

function summarizeRigSignals(state: RigReviewState): string {
  const parts = RIG_SIGNAL_KEYS.map((signal) => {
    const score = state.signals[signal].score;
    return score === null ? null : `${humanizeOpsLabel(signal)} ${formatNumber(score)}`;
  }).filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" | ") : "-";
}

function summarizeRigContext(state: RigReviewState): string {
  const parts = compact([
    state.speciesId ? `species ${state.speciesId}` : null,
    state.selectedView ? `view ${state.selectedView}` : null,
    state.repairable === true ? "repairable" : state.recreateRecommended ? "recreate_required" : null,
    state.anchorOverridePresent === true ? "anchor override" : null,
    state.cropOverridePresent === true ? "crop override" : null
  ]);
  return parts || "-";
}

function summarizeRigLineage(state: RigReviewState): string {
  const parts = compact([
    state.requiredManualSlots.length > 0 ? `manual ${summarizeValues(state.requiredManualSlots, 3)}` : null,
    state.repairLineageSummary.length > 0 ? `lineage ${summarizeValues(state.repairLineageSummary, 2)}` : null,
    state.directiveFamilySummary.length > 0 ? `directives ${summarizeValues(state.directiveFamilySummary, 2)}` : null,
    state.rigReasonFamilies.length > 0 ? `families ${summarizeValues(state.rigReasonFamilies, 3)}` : null,
    state.repairSourceCandidateIds.length > 0 ? `repair from ${summarizeValues(state.repairSourceCandidateIds, 2)}` : null
  ]);
  return parts || "-";
}

function renderRigDiffChip(label: string, left: number | null, right: number | null): string {
  if (left === null && right === null) {
    return `<span class="decision-diff-chip tone-muted">${esc(label)} -</span>`;
  }
  if (left === null || right === null) {
    return `<span class="decision-diff-chip tone-warn">${esc(label)} ${esc(left === null ? "-" : formatNumber(left))} -> ${esc(
      right === null ? "-" : formatNumber(right)
    )}</span>`;
  }
  const delta = right - left;
  const tone: UiBadgeTone = delta >= 4 ? "ok" : delta <= -4 ? "warn" : "muted";
  const deltaLabel = delta === 0 ? "0" : `${delta > 0 ? "+" : ""}${formatNumber(delta, 2)}`;
  return `<span class="decision-diff-chip tone-${tone}">${esc(label)} ${esc(formatNumber(left))} -> ${esc(formatNumber(right))} (${esc(deltaLabel)})</span>`;
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

type DecisionStat = {
  label: string;
  value: string;
  hint: string;
  tone?: UiBadgeTone;
};

type DecisionFact = {
  label: string;
  value: string;
  hint?: string;
};

type DecisionCard = {
  title: string;
  detail: string;
  tone?: UiBadgeTone;
  badge?: string;
  html?: string;
};

type ObjectHeroInput = {
  eyebrow?: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone?: UiBadgeTone;
  flash?: string;
  headerContextHtml?: string;
  quickLinksHtml?: string;
  summaryCards?: DecisionStat[];
  metaItems?: DecisionFact[];
  blockers?: DecisionCard[];
  primaryActions?: DecisionCard[];
  secondaryActions?: DecisionCard[];
  recoveryActions?: DecisionCard[];
  recentActivity?: DecisionCard[];
  linkedObjects?: DecisionCard[];
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

function runProfileUiLabel(value: RunProfileId): string {
  if (value === "full") return "전체";
  if (value === "render_only") return "렌더 전용";
  return "프리뷰";
}

function statusLabelKo(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return "-";
  const labels: Record<string, string> = {
    ACCEPTED: "승인됨",
    BLOCKED: "차단됨",
    CANCELLED: "취소됨",
    CANCELED: "취소됨",
    COMPLETED: "완료됨",
    DEBUG: "디버그",
    DOWN: "중단됨",
    ENQUEUED: "큐 등록됨",
    ERROR: "오류",
    FAILED: "실패",
    GENERATING: "생성 중",
    INFO: "정보",
    OK: "정상",
    PENDING: "보류",
    PREVIEW_READY: "프리뷰 준비 완료",
    QUEUED: "대기 중",
    READY: "준비 완료",
    REJECTED: "거절됨",
    RESOLVED: "해결됨",
    RUNNING: "실행 중",
    SUCCEEDED: "성공",
    UNKNOWN: "알 수 없음",
    UP: "정상",
    WARN: "경고",
    WARNING: "경고",
    WAITING: "대기 중"
  };
  return labels[normalized] ?? humanizeOpsLabel(value);
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

function decisionSurfaceStyles(): string {
  return `<style>
.decision-surface{display:grid;gap:12px}
.decision-hero{position:relative;overflow:hidden;padding:16px;border-color:#c7dade;background:linear-gradient(140deg,#f7fcfb 0%,#ffffff 54%,#eef8f5 100%)}
.decision-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid #bfd7d3;background:#eff8f6;color:#0d5e59;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.decision-title{display:grid;gap:6px}
.decision-title h1{margin:0}
.decision-statusline{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.decision-statusline .muted-text{font-size:13px}
.decision-reading-order{display:grid;gap:4px;padding:11px 12px;border:1px dashed #c7d7e6;border-radius:14px;background:#f8fbff}
.decision-reading-order strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#365063}
.decision-layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.9fr);gap:12px}
.decision-column{display:grid;gap:10px}
.decision-panel{display:grid;gap:8px;padding:12px;border-radius:16px;border:1px solid #d6e4ea;background:#ffffffd9}
.decision-panel h2,.decision-panel h3{margin:0}
.decision-panel-heading{display:grid;gap:4px}
.decision-panel p{margin:0;color:#405663;line-height:1.5}
.decision-panel.tone-ok{border-color:#cbe6d7;background:linear-gradient(180deg,#effcf7,#ffffff)}
.decision-panel.tone-warn{border-color:#ecd9ad;background:linear-gradient(180deg,#fff8ea,#fffdf7)}
.decision-panel.tone-bad{border-color:#efc4c4;background:linear-gradient(180deg,#fff4f4,#fffdfd)}
.decision-panel.tone-muted{border-color:#dbe5ef;background:linear-gradient(180deg,#f7fafc,#ffffff)}
.decision-meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px}
.decision-meta-card{display:grid;gap:5px;padding:10px;border:1px solid #d8e5ee;border-radius:14px;background:#f8fbff}
.decision-meta-card .label{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#557083}
.decision-meta-card .value{font-size:15px;font-weight:800;line-height:1.35;word-break:break-word}
.decision-meta-card .hint{font-size:12px;line-height:1.45;color:#5f7380}
.decision-stack{display:grid;gap:8px}
.decision-item{display:grid;gap:6px;padding:10px;border-radius:14px;border:1px solid #d7e3eb;background:#fbfdff}
.decision-item.tone-ok{border-color:#cbe6d7;background:#f3fbf7}
.decision-item.tone-warn{border-color:#ecd9ad;background:#fffaf0}
.decision-item.tone-bad{border-color:#efc4c4;background:#fff6f6}
.decision-item.tone-muted{border-color:#dbe5ef;background:#fbfdff}
.decision-item-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}
.decision-item-title{font-size:15px;font-weight:800;letter-spacing:-.01em}
.decision-item p{margin:0;color:#425466;line-height:1.45}
.decision-actions{display:flex;flex-wrap:wrap;gap:8px}
.decision-empty{padding:12px;border:1px dashed #cbd6e2;border-radius:12px;background:#f8fbff;color:#536475}
	.decision-media-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
	.decision-media-card{display:grid;gap:8px;padding:12px;border:1px solid #d8e4ed;border-radius:16px;background:linear-gradient(180deg,#fbfdff,#ffffff)}
	.decision-compare-shell{display:grid;gap:12px}
	.decision-compare-axis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
	.decision-compare-card{display:grid;gap:10px;padding:12px;border:1px solid #d8e5ee;border-radius:16px;background:linear-gradient(180deg,#fbfdff,#ffffff)}
	.decision-compare-card[data-compare-side="left"]{border-color:#c7d9eb}
	.decision-compare-card[data-compare-side="right"]{border-color:#cbe6d7}
	.decision-compare-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
	.decision-compare-axis-label{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#557083}
	.decision-compare-card h3{margin:2px 0 0}
	.decision-action-rail{display:flex;flex-wrap:wrap;gap:8px}
	.decision-action-rail a,.decision-action-rail button,.decision-action-rail .secondary,.decision-actions a,.decision-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:34px}
	.decision-diff-row{display:flex;flex-wrap:wrap;gap:8px}
	.decision-diff-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid #c8d8e5;background:#fff;color:#173040;font-size:12px;font-weight:800}
	.decision-diff-chip.tone-ok{border-color:#cbe6d7;background:#f3fbf7;color:#17603a}
	.decision-diff-chip.tone-warn{border-color:#ecd9ad;background:#fffaf0;color:#8a5a00}
	.decision-diff-chip.tone-bad{border-color:#efc4c4;background:#fff6f6;color:#9f1d1d}
	.decision-diff-chip.tone-muted{border-color:#c8d8e5;background:#fff;color:#173040}
	.decision-help-callout{display:grid;gap:4px;padding:10px 12px;border:1px solid #d8e5ee;border-radius:14px;background:#f8fbff}
	.decision-help-callout strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#365063}
	.decision-video-frame{width:100%;max-width:560px;background:#000;border-radius:10px}
	.decision-compare-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px}
	.decision-priority-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:12px}
	.decision-pill-row{display:flex;flex-wrap:wrap;gap:8px}
	.decision-jump-banner{display:grid;gap:10px;padding:12px;border:1px solid #d8e5ee;border-radius:16px;background:linear-gradient(180deg,#fcfefe,#f4f9fd)}
	.decision-jump-banner.tone-ok{border-color:#cbe6d7;background:#f3fbf7}
	.decision-jump-banner.tone-warn{border-color:#ecd9ad;background:#fffaf0}
	.decision-jump-banner.tone-bad{border-color:#efc4c4;background:#fff6f6}
	.decision-jump-copy{margin:0;font-size:13px;line-height:1.5;color:#415565}
	.decision-drawer{border:1px solid #d8e5ee;border-radius:14px;background:#fff}
	.decision-drawer>summary{cursor:pointer;list-style:none;padding:11px 12px;font-weight:800;color:#12344d}
	.decision-drawer>summary::-webkit-details-marker{display:none}
	.decision-drawer>summary:focus-visible,.decision-actions a:focus-visible,.decision-actions button:focus-visible,.decision-action-rail a:focus-visible,.decision-action-rail button:focus-visible,.quick-links a:focus-visible{outline:2px solid #0f766e;outline-offset:2px}
	.decision-drawer[open]>summary{border-bottom:1px solid #e2ebf4}
	.decision-drawer-body{display:grid;gap:10px;padding:12px}
	.decision-copy{font-size:13px;line-height:1.5;color:#415565}
	.decision-jump-target:target{scroll-margin-top:14px;box-shadow:inset 0 0 0 2px #0f766e33}
	.decision-focus-row.is-focused,.decision-focus-row:target{background:#eef7ff}
	.decision-hero .summary-grid .summary-card{background:#ffffffcc}
	.decision-code{font-family:"Cascadia Code","JetBrains Mono","Fira Code",monospace;font-size:12px;word-break:break-all}
	@media (max-width:900px){.decision-layout,.decision-priority-grid{grid-template-columns:1fr}.decision-hero{padding:14px}}
	@media (max-width:780px){.decision-compare-axis{grid-template-columns:1fr}}
	@media (max-width:640px){.decision-surface{gap:10px}.decision-hero{padding:12px}.decision-panel,.decision-media-card,.decision-compare-card{padding:10px}.decision-meta-grid,.decision-compare-grid{grid-template-columns:1fr}.decision-item-title{font-size:14px}}
</style>`;
}

function decisionTone(value: UiBadgeTone | string | null | undefined): UiBadgeTone {
  if (value === "ok" || value === "warn" || value === "bad" || value === "muted") {
    return value;
  }
  return "muted";
}

function renderDecisionSummaryCards(cards: DecisionStat[]): string {
  return cards
    .map(
      (card) =>
        `<div class="summary-card"><span class="badge ${decisionTone(card.tone)}">${esc(card.label)}</span><div class="metric">${esc(card.value)}</div><div class="caption">${esc(card.hint)}</div></div>`
    )
    .join("");
}

function renderDecisionMetaGrid(items: DecisionFact[], emptyMessage: string): string {
  if (items.length === 0) {
    return `<div class="decision-empty">${esc(emptyMessage)}</div>`;
  }
  return `<div class="decision-meta-grid">${items
    .map(
      (item) =>
        `<div class="decision-meta-card"><span class="label">${esc(item.label)}</span><div class="value">${esc(item.value)}</div>${
          item.hint ? `<div class="hint">${esc(item.hint)}</div>` : ""
        }</div>`
    )
    .join("")}</div>`;
}

function renderDecisionCards(items: DecisionCard[], emptyMessage: string): string {
  if (items.length === 0) {
    return `<div class="decision-empty">${esc(emptyMessage)}</div>`;
  }
  return `<div class="decision-stack">${items
    .map((item) => {
      const tone = decisionTone(item.tone);
      return `<article class="decision-item tone-${tone}"><div class="decision-item-head"><div class="decision-item-title">${esc(
        item.title
      )}</div>${item.badge ? `<span class="badge ${tone}">${esc(item.badge)}</span>` : ""}</div><p>${esc(item.detail)}</p>${
        item.html ? `<div class="decision-actions">${item.html}</div>` : ""
      }</article>`;
    })
    .join("")}</div>`;
}

function renderDecisionPanel(
  title: string,
  intro: string,
  body: string,
  tone: UiBadgeTone = "muted",
  headingLevel: "h2" | "h3" = "h2"
): string {
  return `<section class="decision-panel tone-${decisionTone(tone)}" role="region" aria-label="${esc(title)}"><div class="decision-panel-heading"><${headingLevel}>${esc(
    title
  )}</${headingLevel}><p>${esc(
    intro
  )}</p></div>${body}</section>`;
}

function renderDecisionDualSection(input: {
  sectionId?: string;
  title: string;
  intro: string;
  linksHtml?: string;
  leftTitle: string;
  leftIntro: string;
  leftBody: string;
  leftTone?: UiBadgeTone;
  rightTitle: string;
  rightIntro: string;
  rightBody: string;
  rightTone?: UiBadgeTone;
}): string {
  const titleId = input.sectionId ? `${input.sectionId}-title` : "";
  return `<section class="card decision-jump-target"${input.sectionId ? ` id="${esc(input.sectionId)}"` : ""}${
    titleId ? ` aria-labelledby="${esc(titleId)}"` : ` aria-label="${esc(input.title)}"`
  }><div class="section-head"><div><h2${titleId ? ` id="${esc(titleId)}"` : ""}>${esc(input.title)}</h2><p class="section-intro">${esc(
    input.intro
  )}</p></div>${input.linksHtml ? `<div class="quick-links">${input.linksHtml}</div>` : ""}</div><div class="decision-priority-grid">${renderDecisionPanel(
    input.leftTitle,
    input.leftIntro,
    input.leftBody,
    input.leftTone ?? "muted",
    "h3"
  )}${renderDecisionPanel(input.rightTitle, input.rightIntro, input.rightBody, input.rightTone ?? "muted", "h3")}</div></section>`;
}

function renderDecisionPrioritySection(input: {
  sectionId?: string;
  title: string;
  intro: string;
  linksHtml?: string;
  railTitle: string;
  railIntro: string;
  railCards: DecisionCard[];
  railEmpty: string;
  railTone?: UiBadgeTone;
  snapshotTitle?: string;
  snapshotIntro: string;
  snapshotFacts: DecisionFact[];
  snapshotEmpty: string;
  snapshotTone?: UiBadgeTone;
}): string {
  const drawerId = input.sectionId ? `${input.sectionId}-drawer` : "";
  return renderDecisionDualSection({
    sectionId: input.sectionId,
    title: input.title,
    intro: input.intro,
    linksHtml: input.linksHtml,
    leftTitle: input.railTitle,
    leftIntro: input.railIntro,
    leftBody: renderDecisionCards(input.railCards, input.railEmpty),
    leftTone: input.railTone ?? ((input.railCards[0]?.tone ? decisionTone(input.railCards[0].tone) : "muted") as UiBadgeTone),
    rightTitle: input.snapshotTitle ?? "복구 스냅샷",
    rightIntro: input.snapshotIntro,
    rightBody: renderDecisionMetaGrid(input.snapshotFacts, input.snapshotEmpty),
    rightTone: input.snapshotTone ?? "muted"
  });
}

function renderRecoveryRailSection(input: {
  sectionId?: string;
  title: string;
  intro: string;
  linksHtml?: string;
  recoveryTitle: string;
  recoveryIntro: string;
  recoveryCards: DecisionCard[];
  recoveryEmpty: string;
  recoveryTone?: UiBadgeTone;
  linkedTitle: string;
  linkedIntro: string;
  linkedCards: DecisionCard[];
  linkedEmpty: string;
  linkedTone?: UiBadgeTone;
}): string {
  return renderDecisionDualSection({
    sectionId: input.sectionId,
    title: input.title,
    intro: input.intro,
    linksHtml: input.linksHtml,
    leftTitle: input.recoveryTitle,
    leftIntro: input.recoveryIntro,
    leftBody: renderDecisionCards(input.recoveryCards, input.recoveryEmpty),
    leftTone: input.recoveryTone ?? ((input.recoveryCards[0]?.tone ? decisionTone(input.recoveryCards[0].tone) : "muted") as UiBadgeTone),
    rightTitle: input.linkedTitle,
    rightIntro: input.linkedIntro,
    rightBody: renderDecisionCards(input.linkedCards, input.linkedEmpty),
    rightTone: input.linkedTone ?? ((input.linkedCards[0]?.tone ? decisionTone(input.linkedCards[0].tone) : "muted") as UiBadgeTone)
  });
}

function renderArtifactEvidenceSection(input: {
  sectionId?: string;
  title: string;
  intro: string;
  linksHtml?: string;
  summaryTitle: string;
  summaryIntro: string;
  summaryFacts: DecisionFact[];
  summaryEmpty: string;
  summaryTone?: UiBadgeTone;
  drawerTitle: string;
  drawerIntro: string;
  drawerSummary: string;
  drawerBodyHtml: string;
  drawerTone?: UiBadgeTone;
  drawerOpen?: boolean;
}): string {
  const drawerId = input.sectionId ? `${input.sectionId}-drawer` : "";
  return renderDecisionDualSection({
    sectionId: input.sectionId,
    title: input.title,
    intro: input.intro,
    linksHtml: input.linksHtml,
    leftTitle: input.summaryTitle,
    leftIntro: input.summaryIntro,
    leftBody: renderDecisionMetaGrid(input.summaryFacts, input.summaryEmpty),
    leftTone: input.summaryTone ?? "muted",
    rightTitle: input.drawerTitle,
    rightIntro: input.drawerIntro,
    rightBody: `<details class="decision-drawer"${drawerId ? ` id="${esc(drawerId)}"` : ""} aria-label="${esc(
      input.drawerTitle
    )}"${input.drawerOpen ? " open" : ""}><summary>${esc(
      input.drawerSummary
    )}</summary><div class="decision-drawer-body">${input.drawerBodyHtml}</div></details>`,
    rightTone: input.drawerTone ?? "muted"
  });
}

function renderDecisionJumpBanner(input: {
  title: string;
  intro: string;
  facts: DecisionFact[];
  linksHtml?: string;
  tone?: UiBadgeTone;
}): string {
  if (input.facts.length === 0 && !input.linksHtml) {
    return "";
  }
  return `<div class="decision-jump-banner tone-${decisionTone(input.tone ?? "muted")}" role="note" aria-label="Deep-link handoff"><div class="section-head"><div><strong>${esc(
    input.title
  )}</strong><p class="decision-jump-copy">${esc(input.intro)}</p></div>${input.linksHtml ? `<div class="quick-links">${input.linksHtml}</div>` : ""}</div>${renderDecisionMetaGrid(
    input.facts,
    "No deep-link or compare handoff state is active."
  )}</div>`;
}

function renderOpsReviewJumpBanner(input: {
  title: string;
  intro: string;
  facts: DecisionFact[];
  linksHtml?: string;
}): string {
  if (input.facts.length === 0 && !input.linksHtml) {
    return "";
  }
  const factsHtml =
    input.facts.length > 0
      ? `<div class="ops-review-fact-grid">${input.facts
          .map(
            (fact) => `<article class="ops-review-fact">
        <span class="ops-review-fact-label">${esc(fact.label)}</span>
        <strong>${esc(fact.value)}</strong>
        ${fact.hint ? `<span class="muted-text">${esc(fact.hint)}</span>` : ""}
      </article>`
          )
          .join("")}</div>`
      : `<div class="ops-review-empty">No deep-link or compare handoff state is active.</div>`;
  return `<div class="ops-review-jump-banner"><div class="section-head"><div><strong>${esc(input.title)}</strong><p class="section-intro">${esc(
    input.intro
  )}</p></div>${input.linksHtml ? `<div class="quick-links">${input.linksHtml}</div>` : ""}</div>${factsHtml}</div>`;
}

function renderDecisionJumpScript(): string {
  return `<script>
(() => {
  const hash = window.location.hash ? window.location.hash.slice(1) : "";
  if (!hash) return;
  const target = document.getElementById(hash);
  if (!(target instanceof HTMLElement)) return;
  if (target instanceof HTMLDetailsElement) {
    target.open = true;
  }
  const parentDetails = target.closest("details");
  if (parentDetails instanceof HTMLDetailsElement) {
    parentDetails.open = true;
  }
  target.querySelectorAll("details").forEach((node) => {
    if (node instanceof HTMLDetailsElement) {
      node.open = true;
    }
  });
  const focusTarget =
    target instanceof HTMLDetailsElement
      ? target.querySelector("summary")
      : target.querySelector("summary, h1, h2, h3, a, button, input, select, textarea, [tabindex]") || target;
  if (focusTarget instanceof HTMLElement && !focusTarget.hasAttribute("tabindex") && !["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"].includes(focusTarget.tagName)) {
    focusTarget.tabIndex = -1;
  }
  requestAnimationFrame(() => {
    target.scrollIntoView({ block: "start", behavior: "auto" });
    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus({ preventScroll: true });
    }
  });
})();
</script>`;
}

function renderObjectHero(input: ObjectHeroInput): string {
  const leftPanels = [
    renderDecisionPanel(
      "핵심 메타데이터",
      "이 오브젝트의 식별자, 현재 상태, 제어면 맥락입니다.",
      renderDecisionMetaGrid(input.metaItems ?? [], "아직 수집된 오브젝트 메타데이터가 없습니다.")
    ),
    renderDecisionPanel(
      "경고 / 차단 요인",
      "차단 사유를 상단에 유지해 다음 운영 판단을 바로 내릴 수 있게 합니다.",
      renderDecisionCards(input.blockers ?? [], "현재 활성 차단 요인이 없습니다."),
      (input.blockers ?? []).length > 0 ? decisionTone(input.blockers?.[0]?.tone) : "ok"
    ),
    renderDecisionPanel(
      "최근 활동",
      "원시 로그로 내려가지 않고도 최근 흐름을 확인합니다.",
      renderDecisionCards(input.recentActivity ?? [], "아직 수집된 최근 활동이 없습니다.")
    )
  ].join("");
  const rightPanels = [
    renderDecisionPanel(
      "주요 액션",
      "이 상세 화면에서 운영자가 우선 수행해야 할 핵심 액션입니다.",
      renderDecisionCards(input.primaryActions ?? [], "사용 가능한 주요 액션이 없습니다.")
    ),
    renderDecisionPanel(
      "보조 액션",
      "더 깊은 점검과 대체 검토 경로입니다.",
      renderDecisionCards(input.secondaryActions ?? [], "사용 가능한 보조 액션이 없습니다.")
    ),
    renderDecisionPanel(
      "복구 액션",
      "실패 상태에서도 재시도, 폴백, 롤백, 대체 경로 제어를 바로 볼 수 있습니다.",
      renderDecisionCards(input.recoveryActions ?? [], "지금은 복구 액션이 필요하지 않습니다."),
      (input.recoveryActions ?? []).length > 0 ? decisionTone(input.recoveryActions?.[0]?.tone) : "ok"
    ),
    renderDecisionPanel(
      "연결된 오브젝트",
      "목록으로 돌아가지 않고 관련 오브젝트와 근거로 바로 이동합니다.",
      renderDecisionCards(input.linkedObjects ?? [], "연결된 오브젝트가 아직 없습니다.")
    )
  ].join("");

  return `<section class="card decision-hero"><div class="section-head"><div class="decision-title">${
    input.eyebrow ? `<span class="decision-eyebrow">${esc(input.eyebrow)}</span>` : ""
  }<h1>${esc(input.title)}</h1><p class="section-intro">${esc(input.subtitle)}</p><div class="decision-statusline"><span class="badge ${decisionTone(
    input.statusTone
  )}">${esc(input.statusLabel)}</span>${input.headerContextHtml ? input.headerContextHtml : ""}</div></div>${
    input.quickLinksHtml ? `<div class="quick-links">${input.quickLinksHtml}</div>` : ""
  }</div>${input.flash ?? ""}${
    (input.summaryCards ?? []).length > 0 ? `<div class="summary-grid">${renderDecisionSummaryCards(input.summaryCards ?? [])}</div>` : ""
  }<div class="decision-reading-order" role="note" aria-label="Reading order"><strong>Reading order</strong><span class="muted-text">Start with the object summary and action panels, then move through decision rail, recovery rail, evidence drawer, and only then the compare or raw detail sections.</span></div><div class="decision-layout"><div class="decision-column">${leftPanels}</div><div class="decision-column">${rightPanels}</div></div></section>`;
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

function buildShotOpsItems(input: {
  shotsDoc: unknown;
  qcReport: unknown;
  sidecarPlan: unknown;
  renderModeReport: unknown;
}): EpisodeShotOpsView[] {
  if (!isShotsDocLike(input.shotsDoc)) {
    return [];
  }

  const shotIssueMap = collectShotIssueMap(input.qcReport);
  const renderModeByShot = new Map<
    string,
    {
      recommendedRenderMode: string | null;
      blockers: string[];
    }
  >();
  if (isRecord(input.renderModeReport)) {
    for (const shot of recordList(input.renderModeReport.shots)) {
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
  if (isRecord(input.sidecarPlan)) {
    for (const plan of recordList(input.sidecarPlan.plans)) {
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
  for (const rawShot of input.shotsDoc.shots ?? []) {
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

  return shotItems;
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

  const qcFallbackSteps =
    isRecord(qcReport) && Array.isArray(qcReport.fallback_steps_applied)
      ? qcReport.fallback_steps_applied.map((value) => str(value))
      : [];
  const renderFallbackSteps =
    isRecord(renderLog) && Array.isArray(renderLog.fallback_steps_applied)
      ? renderLog.fallback_steps_applied.map((value) => str(value))
      : [];
  const fallbackSteps = uniqueStrings([...qcFallbackSteps, ...renderFallbackSteps]);
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

const DEFAULT_BENCHMARK_ARTIFACT_MAX_AGE_HOURS = 168;

function describeArtifactFreshness(
  generatedAt: string | null,
  maxAgeHours = DEFAULT_BENCHMARK_ARTIFACT_MAX_AGE_HOURS
): {
  tone: UiBadgeTone;
  label: string;
  detail: string;
  ageHours: number | null;
  isStale: boolean;
  isAging: boolean;
} {
  if (!generatedAt) {
    return {
      tone: "warn",
      label: "no data",
      detail: "No recent artifact timestamp was recorded.",
      ageHours: null,
      isStale: false,
      isAging: false
    };
  }
  const generatedMs = new Date(generatedAt).getTime();
  if (!Number.isFinite(generatedMs)) {
    return {
      tone: "warn",
      label: "unknown age",
      detail: "Artifact timestamp could not be parsed.",
      ageHours: null,
      isStale: false,
      isAging: false
    };
  }
  const ageHours = Math.max(0, (Date.now() - generatedMs) / (60 * 60 * 1000));
  const roundedAgeHours = ageHours >= 10 ? ageHours.toFixed(0) : ageHours.toFixed(1);
  if (ageHours > maxAgeHours) {
    return {
      tone: "bad",
      label: "stale",
      detail: `${roundedAgeHours}h old; refresh the benchmark or rollout artifact before trusting this queue.`,
      ageHours,
      isStale: true,
      isAging: false
    };
  }
  if (ageHours > maxAgeHours / 2) {
    return {
      tone: "warn",
      label: "aging",
      detail: `${roundedAgeHours}h old; refresh soon to keep rig regressions current.`,
      ageHours,
      isStale: false,
      isAging: true
    };
  }
  return {
    tone: "ok",
    label: "fresh",
    detail: `${roundedAgeHours}h old; current enough for queue review.`,
    ageHours,
    isStale: false,
    isAging: false
  };
}

export function summarizeArtifactFreshnessForRows(rows: Array<{ generatedAt: string }>): {
  staleCount: number;
  agingCount: number;
  unknownCount: number;
  newestDetail: string;
} {
  const freshness = rows.map((row) => describeArtifactFreshness(row.generatedAt));
  const staleCount = freshness.filter((entry) => entry.isStale).length;
  const agingCount = freshness.filter((entry) => entry.isAging).length;
  const unknownCount = freshness.filter((entry) => entry.ageHours === null).length;
  const latestGeneratedAt = selectGeneratedAt(rows.map((row) => row.generatedAt));
  return {
    staleCount,
    agingCount,
    unknownCount,
    newestDetail: latestGeneratedAt ? `latest ${fmtDate(latestGeneratedAt)}` : "no artifact timestamp"
  };
}


export function resolveBenchmarkScenarioHandoffState(doc: JsonRecord, rawScenario: JsonRecord): {
  characterPackId: string | null;
  fixturePath: string | null;
} {
  return resolveBenchmarkScenarioHandoffStateWithNormalizer(doc, rawScenario, safeRolloutArtifactPath);
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
  const runtimeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const key = typeof runtimeProcess?.env?.API_KEY === "string" ? runtimeProcess.env.API_KEY.trim() : "";
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

  app.get("/ui/health", async (request, reply) => {
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

    const serviceEntries = [
      { name: "database", value: services.database },
      { name: "redis", value: services.redis },
      { name: "minio", value: services.minio }
    ].map(({ name, value }) => {
      const record = isRecord(value) ? value : {};
      const status = typeof record.status === "string" ? record.status : "unknown";
      const detail = JSON.stringify(record, null, 2);
      return { name, status, detail };
    });

    const degradedServices = serviceEntries.filter((entry) => entry.status !== "up");
    const serviceRows = serviceEntries
      .map(
        (entry) =>
          `<tr><td>${esc(entry.name)}</td><td><span class="badge ${badgeClass(entry.status)}">${esc(statusLabelKo(entry.status))}</span></td><td><pre>${esc(entry.detail)}</pre></td></tr>`
      )
      .join("");

    const fixEntries = Object.entries(fixes);
    const commandRows = fixEntries
      .map(
        ([key, command]) =>
          `<tr><td>${esc(key)}</td><td><code>${esc(command)}</code></td><td><button type="button" class="secondary" data-copy="${esc(command)}">복사</button></td></tr>`
      )
      .join("");
    const baseHealthData = isRecord(health.body) && isRecord(health.body.data) ? health.body.data : {};
    const nowMs = Date.now();
    cleanupRunProfileDedupCache(nowMs);
    const dedupEntries = Array.from(runProfileDedupCache.entries())
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 10)
      .map(([key, value]) => {
        const ageSec = Math.max(0, Math.floor((nowMs - value.at) / 1000));
        return `<tr><td><code>${esc(key)}</code></td><td>${esc(value.jobId ?? "-")}</td><td>${ageSec}초 전</td></tr>`;
      })
      .join("");
    const degradedSummaryText = degradedServices.length > 0 ? summarizeValues(degradedServices.map((entry) => entry.name), 3) : "없음";
    const firstFixEntry = fixEntries[0] ?? null;
    const healthTone: UiBadgeTone = overallOk ? "ok" : "bad";
    const healthSummaryCards: DecisionStat[] = [
      {
        label: "전체 상태",
        value: overallOk ? "정상" : "저하",
        hint: checkedAt ? `checkedAt ${checkedAt}` : "healthz check timestamp unavailable",
        tone: healthTone
      },
      {
        label: "저하 서비스",
        value: String(degradedServices.length),
        hint: degradedSummaryText === "없음" ? "차단된 의존성이 없습니다" : degradedSummaryText,
        tone: degradedServices.length > 0 ? "bad" : "ok"
      },
      {
        label: "복구 명령",
        value: String(fixEntries.length),
        hint: fixEntries.length > 0 ? "복구 레일에서 먼저 복사 후 실행" : "정의된 복구 명령이 없습니다",
        tone: fixEntries.length > 0 ? "warn" : "muted"
      },
      {
        label: "중복 방지 가드",
        value: String(runProfileDedupCache.size),
        hint: `${runProfileDedupStats.hits} dedup hits / ${runProfileDedupStats.enqueues} enqueues`,
        tone: runProfileDedupCache.size > 0 ? "warn" : "ok"
      }
    ];
    const healthBlockers: DecisionCard[] = degradedServices.map((entry) => ({
      title: `${entry.name} 저하`,
      detail: `${statusLabelKo(entry.status)} 상태입니다. 이 서비스에 의존하는 작업을 재시도하기 전에 상태와 복구 명령을 확인하세요.`,
      tone: decisionTone(badgeClass(entry.status)),
      badge: statusLabelKo(entry.status)
    }));
    const healthPrimaryActions: DecisionCard[] = [
      overallOk
        ? {
            title: "복구 작업 없음",
            detail: "핵심 서비스는 정상입니다. 작업 재시도보다 먼저 dedup 가드와 최근 작업 상태만 점검하면 됩니다.",
            tone: "ok",
            badge: "ready",
            html: `<a href="/ui/jobs">작업 열기</a><a href="/ui/rollouts">롤아웃 열기</a>`
          }
        : {
            title: "복구 명령 먼저 실행",
            detail: firstFixEntry ? `${firstFixEntry[0]} 복구 명령을 먼저 복사하고, 의존 서비스가 정상으로 돌아온 뒤 작업을 재시도하세요.` : "정의된 복구 명령이 없으므로 서비스 상세를 보고 수동 복구가 필요합니다.",
            tone: "bad",
            badge: "recover",
            html: firstFixEntry
              ? `<button type="button" class="secondary" data-copy="${esc(firstFixEntry[1])}">${esc(firstFixEntry[0])} 복사</button><a href="/ui/jobs">작업 열기</a>`
              : `<a href="/ui/jobs">작업 열기</a><a href="/ui/hitl">복구 큐</a>`
          }
    ];
    const healthSecondaryActions: DecisionCard[] = [
      {
        title: "작업 영향 범위 확인",
        detail: "저하 서비스가 어떤 작업과 롤아웃 흐름을 막는지 확인합니다.",
        tone: "muted",
        badge: "inspect",
        html: `<a href="/ui/jobs">작업</a><a href="/ui/rollouts">롤아웃</a><a href="/ui/hitl">복구 큐</a>`
      }
    ];
    const healthRecoveryActions: DecisionCard[] =
      fixEntries.length > 0
        ? fixEntries.slice(0, 3).map(([key, command]) => ({
            title: key,
            detail: "상태 상세와 서비스 표를 확인한 뒤 이 명령을 복사해 복구를 진행하세요.",
            tone: "warn" as UiBadgeTone,
            badge: "command",
            html: `<button type="button" class="secondary" data-copy="${esc(command)}">명령 복사</button>`
          }))
        : [
            {
              title: "수동 복구 필요",
              detail: "설정된 복구 명령이 없으므로 서비스 상태 상세를 확인해 수동 복구 경로를 정해야 합니다.",
              tone: "muted",
              badge: "manual",
              html: `<a href="/ui/jobs">작업</a><a href="/ui/hitl">복구 큐</a>`
            }
          ];
    const healthRecentActivity: DecisionCard[] = serviceEntries.map((entry) => ({
      title: entry.name,
      detail: `${statusLabelKo(entry.status)} | ${entry.detail.replace(/\s+/g, " ").slice(0, 140)}`,
      tone: decisionTone(badgeClass(entry.status)),
      badge: statusLabelKo(entry.status)
    }));
    const healthLinkedObjects: DecisionCard[] = [
      {
        title: "중복 방지 가드",
        detail: `active ${runProfileDedupCache.size} / hits ${runProfileDedupStats.hits} / enqueues ${runProfileDedupStats.enqueues}`,
        tone: runProfileDedupCache.size > 0 ? "warn" : "ok",
        badge: "guard",
        html: `<a href="#health-dedup-guard">가드 보기</a>`
      },
      {
        title: "작업 및 복구 큐",
        detail: "서비스 복구 후 바로 재시도할 오브젝트들입니다.",
        tone: "muted",
        badge: "objects",
        html: `<a href="/ui/jobs">작업</a><a href="/ui/hitl">복구 큐</a><a href="/ui/rollouts">롤아웃</a>`
      }
    ];
    const healthDecisionRail: DecisionCard[] = [
      {
        title: overallOk ? "서비스 정상 유지" : "복구 후 재시도",
        detail: overallOk
          ? "핵심 서비스는 정상입니다. 작업 재실행보다 먼저 현재 큐와 dedup 가드만 확인하세요."
          : "저하된 서비스를 먼저 복구하고, 이후에만 작업 또는 롤아웃을 재시도하세요.",
        tone: healthTone,
        badge: overallOk ? "ready" : "recover",
        html: `<a href="/ui/jobs">작업</a><a href="/ui/rollouts">롤아웃</a>`
      },
      {
        title: "복구 명령 레일",
        detail: firstFixEntry
          ? `${firstFixEntry[0]} 명령을 첫 복구 앵커로 사용하세요. 복구 후에는 서비스 표와 healthz를 다시 확인합니다.`
          : "설정된 복구 명령이 없으므로 서비스 상세를 열고 수동 복구 절차를 선택해야 합니다.",
        tone: firstFixEntry ? "warn" : "bad",
        badge: firstFixEntry ? "command" : "manual",
        html: firstFixEntry ? `<button type="button" class="secondary" data-copy="${esc(firstFixEntry[1])}">명령 복사</button>` : `<a href="/ui/hitl">복구 큐</a>`
      },
      {
        title: "가드 초기화는 마지막 수단",
        detail: "큐가 실제로 멈췄고 최근 작업 목록을 이미 확인한 경우에만 dedup 가드를 초기화하세요.",
        tone: "warn",
        badge: "guard",
        html: `<a href="#health-dedup-guard">가드 보기</a>`
      }
    ];
    const healthSnapshotFacts: DecisionFact[] = [
      {
        label: "실패 사유",
        value: degradedServices.length > 0 ? degradedSummaryText : "없음",
        hint: "현재 최상위 차단 의존성"
      },
      {
        label: "마지막 정상 상태",
        value: checkedAt || "unknown",
        hint: overallOk ? "최근 healthz 확인 시각" : "복구 후 다시 확인해야 할 시각"
      },
      {
        label: "적용된 폴백",
        value: `queue ${String(baseHealthData.queue ?? "-")} / redis ${statusLabelKo(String(baseHealthData.redis ?? "-"))}`,
        hint: "현재 기본 런타임 신호"
      },
      {
        label: "재시도 경로",
        value: overallOk ? "작업 또는 롤아웃 재개" : firstFixEntry ? `${firstFixEntry[0]} 복구 후 재시도` : "서비스 상세 확인 후 수동 복구",
        hint: "서비스 복구 이후에만 재시도"
      },
      {
        label: "대체 경로",
        value: "작업 / 복구 큐 / 롤아웃",
        hint: "영향 범위를 확인하는 연결 오브젝트"
      },
      {
        label: "롤백 지점",
        value: checkedAt || "최근 healthz snapshot 없음",
        hint: "마지막 정상 확인값"
      }
    ];

    return reply.type("text/html; charset=utf-8").send(
      page(
        "상태",
        `${decisionSurfaceStyles()}<div class="decision-surface">${renderObjectHero({
          eyebrow: "Service Control Plane",
          title: "상태 리포트",
          subtitle: "복구 판단, 중복 방지 가드, 영향을 받는 오브젝트를 서비스 페이로드보다 먼저 유지합니다.",
          statusLabel: overallOk ? "서비스 정상" : "복구 필요",
          statusTone: healthTone,
          flash: flashHtml(request.query),
          headerContextHtml: `<span class="muted-text">checkedAt <span class="decision-code">${esc(checkedAt || "-")}</span></span><span class="muted-text">queue <span class="decision-code">${esc(
            String(baseHealthData.queue ?? "-")
          )}</span></span>`,
          quickLinksHtml: `<a href="/ui/jobs">작업 열기</a><a href="/ui/rollouts">롤아웃 열기</a><a href="/ui/hitl">복구 큐</a>`,
          summaryCards: healthSummaryCards,
          metaItems: [
            { label: "전체 상태", value: overallOk ? "정상" : "저하", hint: checkedAt || "healthz timestamp unavailable" },
            { label: "큐", value: String(baseHealthData.queue ?? "-"), hint: `ready ${String(baseHealthData.queueReady ?? "-")}` },
            { label: "Redis", value: statusLabelKo(String(baseHealthData.redis ?? "-")), hint: "queue backing service" },
            { label: "저하 서비스", value: String(degradedServices.length), hint: degradedSummaryText }
          ],
          blockers: healthBlockers,
          primaryActions: healthPrimaryActions,
          secondaryActions: healthSecondaryActions,
          recoveryActions: healthRecoveryActions,
          recentActivity: healthRecentActivity,
          linkedObjects: healthLinkedObjects
        })}${renderDecisionPrioritySection({
          title: "판단 레일",
          intro: "복구 명령, 영향 범위, dedup 가드를 서비스 상세보다 먼저 유지합니다.",
          linksHtml: `<a href="/ui/jobs">작업</a><a href="/ui/rollouts">롤아웃</a><a href="/ui/hitl">복구 큐</a>`,
          railTitle: "서비스 액션",
          railIntro: "서비스가 저하되면 먼저 복구를 수행하고, 그 다음에만 작업과 롤아웃을 재시도합니다.",
          railCards: healthDecisionRail,
          railEmpty: "사용 가능한 서비스 액션이 없습니다.",
          railTone: healthTone,
          snapshotIntro: "실패 사유, 마지막 정상 확인값, 재시도 경로, 롤백 지점을 상단에 유지합니다.",
          snapshotFacts: healthSnapshotFacts,
          snapshotEmpty: "복구 스냅샷이 아직 없습니다.",
          snapshotTone: healthTone
        })}<section class="card" id="health-dedup-guard"><div class="section-head"><div><h2>실행 프로필 중복 방지 가드</h2><p class="section-intro">큐가 멈췄고 최근 작업 목록을 이미 확인한 경우에만 중복 상태를 초기화하세요.</p></div><div class="actions"><form method="post" action="/ui/health/dedup/reset" class="inline"><button type="submit" class="secondary">중복 캐시/통계 초기화</button></form></div></div><p>window: ${RUN_PROFILE_DEDUP_WINDOW_MS}ms / active keys: ${runProfileDedupCache.size} / hits: ${runProfileDedupStats.hits} / enqueues: ${runProfileDedupStats.enqueues}</p><table><thead><tr><th>중복 키</th><th>작업</th><th>경과 시간</th></tr></thead><tbody>${dedupEntries || '<tr><td colspan="3"><div class="notice">최근 중복 항목이 없습니다.</div></td></tr>'}</tbody></table></section><section class="card"><div class="section-head"><div><h2>서비스 상태 근거</h2><p class="section-intro">원시 서비스 페이로드는 복구 판단 아래로 내리고, 실제 상태 근거가 필요할 때만 확인합니다.</p></div></div><table><thead><tr><th>서비스</th><th>상태</th><th>상세</th></tr></thead><tbody>${serviceRows}</tbody></table></section><section class="card"><div class="section-head"><div><h2>복구 명령 (PowerShell)</h2><p class="section-intro">판단 레일에서 복구 방향을 정한 뒤에만 이 명령 테이블로 내려오세요.</p></div></div><table><thead><tr><th>이름</th><th>명령</th><th>복사</th></tr></thead><tbody>${commandRows || '<tr><td colspan="3"><div class="notice">설정된 복구 명령이 없습니다.</div></td></tr>'}</tbody></table></section></div>`
      )
    );
  });

  app.post("/ui/health/dedup/reset", async (_request, reply) => {
    runProfileDedupCache.clear();
    runProfileDedupStats.hits = 0;
    runProfileDedupStats.enqueues = 0;
    return reply.redirect(`/ui/health?message=${encodeURIComponent("실행 프로필 중복 캐시/통계를 초기화했습니다.")}`);
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
    const blockedEvidenceCount = filteredEvidenceRows.filter((row) => row.tone === "bad").length;
    const warnEvidenceCount = filteredEvidenceRows.filter((row) => row.tone === "warn").length;
    const sourceFreshness = sources.map((source) => ({ source, freshness: describeArtifactFreshness(source.latestGeneratedAt) }));
    const staleSourceCount = sourceFreshness.filter((entry) => entry.source.exists && entry.freshness.isStale).length;
    const agingSourceCount = sourceFreshness.filter((entry) => entry.source.exists && entry.freshness.isAging).length;
    const profileSummaryStats: DecisionStat[] = [
      {
        label: "Runtime Combos",
        value: String(filteredBundleCards.length),
        tone: "ok",
        hint: `${bundleCount} bundles observed from rollout smoke artifacts`
      },
      {
        label: "Evidence Rows",
        value: String(filteredEvidenceRows.length),
        tone: "muted",
        hint: `${sources.filter((source) => source.exists).length}/${sources.length} artifact roots available`
      },
      {
        label: "Freshness",
        value: `${staleSourceCount} stale / ${agingSourceCount} aging`,
        tone: staleSourceCount > 0 ? "bad" : agingSourceCount > 0 ? "warn" : "ok",
        hint: "artifact age relative to the 168h freshness window"
      },
      {
        label: "Active Bibles",
        value: String(activeBibleCount),
        tone: activeBibleCount > 0 ? "ok" : "warn",
        hint: bibleCount > 0 ? `${bibleCount} recent bible versions loaded from DB` : "DB unavailable or no channel bibles yet"
      },
      {
        label: "Blocked Signals",
        value: String(blockedEvidenceCount),
        tone: "bad",
        hint: "runtime profile evidence with QC-reported blockers"
      }
    ];
    const sourceRows = sourceFreshness
      .map(({ source, freshness }) => {
        const tone: UiBadgeTone = !source.exists ? "bad" : source.recordCount > 0 ? "ok" : "warn";
        const label = !source.exists ? "missing" : source.recordCount > 0 ? `${source.recordCount} smoke reports` : "empty";
        const meta = compact([
          source.exists ? "scan ok" : "root missing",
          source.latestGeneratedAt ? `latest ${fmtDate(source.latestGeneratedAt)}` : "no profile evidence",
          source.exists ? freshness.detail : ""
        ]);
        return `<div class="status-row"><div class="stack"><span class="label"><strong>${esc(source.label)}</strong></span><span class="mono">${esc(source.outRoot)}</span><span class="muted-text">${esc(meta)}</span></div><div class="inline-actions"><span class="badge ${tone}">${esc(label)}</span>${source.exists ? `<span class="badge ${freshness.tone}">${esc(freshness.label)}</span>` : ""}<button type="button" class="secondary" data-copy="${esc(source.outRoot)}">Copy path</button></div></div>`;
      })
      .join("");

    const bundleCardsHtml = filteredBundleCards
      .map((card) => {
        const detailHref = `/ui/rollouts/detail?path=${encodeURIComponent(card.smokeArtifactPath)}`;
        const renderLogHref = card.renderLogPath
          ? `/ui/rollouts/detail?path=${encodeURIComponent(card.renderLogPath)}`
          : null;
        const deepLinkHref = profileBrowserHref([card.bundle, card.studioProfileId, card.channelProfileId, card.mascotProfileId]);
        const matchingEvidence = filteredEvidenceRows.filter((row) => row.bundle === card.bundle);
        const blockedCount = matchingEvidence.filter((row) => row.tone === "bad").length;
        const warnCount = matchingEvidence.filter((row) => row.tone === "warn").length;
        const bundleTone: UiBadgeTone = blockedCount > 0 ? "bad" : warnCount > 0 ? "warn" : "ok";
        const nextAction =
          blockedCount > 0
            ? "inspect the blocked runtime evidence before promoting this bundle"
            : warnCount > 0
              ? "review warning evidence and compare with ChannelBible"
              : "use this bundle as the current review baseline";
        return `<article class="decision-media-card"><div class="section-head"><div><h3 style="margin:0">${esc(
          card.channelLabel
        )} / ${esc(card.mascotLabel)}</h3><p class="muted-text" style="margin:6px 0 0">studio: ${esc(
          card.studioLabel
        )} | domain: ${esc(card.channelDomain)} | source: ${esc(card.sourceLabel)}</p></div><span class="badge ${bundleTone}">${esc(
          blockedCount > 0 ? "blocked" : warnCount > 0 ? "review" : "ready"
        )}</span></div><div class="inline-actions"><span class="badge ok">${esc(
          card.bundle
        )}</span><span class="badge muted">${esc(card.studioProfileId)}</span><span class="badge muted">${esc(
          card.channelProfileId
        )}</span><span class="badge muted">${esc(card.mascotProfileId)}</span></div><div><h3 style="margin:0">${esc(
          nextAction
        )}</h3></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px"><div class="form-card"><strong>Tone / Pacing</strong><span>${esc(
          card.tone
        )} / ${esc(card.pacing)}</span><small>information priority: ${esc(card.infoPriority)}</small></div><div class="form-card"><strong>Finish / Sidecar</strong><span>${esc(
          card.finishProfileId
        )}</span><small>impact ${esc(card.impactPreset)} | qc ${esc(card.qcPreset)}</small></div><div class="form-card"><strong>Insert / Gesture Bias</strong><span>${esc(
          card.insertSummary || "-"
        )}</span><small>gestures: ${esc(card.gestureSummary || "-")}</small></div></div><div class="decision-meta-grid"><div class="decision-meta-card"><span class="label">Evidence</span><div class="value">${esc(
          String(matchingEvidence.length)
        )}</div><div class="hint">${esc(`${blockedCount} blocked / ${warnCount} warn`)}</div></div><div class="decision-meta-card"><span class="label">Next Action</span><div class="value">${esc(
          blockedCount > 0 ? "recover" : warnCount > 0 ? "review" : "focus"
        )}</div><div class="hint">${esc(nextAction)}</div></div></div><div class="quick-links"><a href="${deepLinkHref}">Focus Bundle</a><a href="${detailHref}">Artifact Detail</a>${
          renderLogHref ? `<a href="${renderLogHref}">Render Log Detail</a>` : ""
        }<a href="/ui/channel-bible">Open ChannelBible</a><a href="/ui/benchmarks">Open Benchmarks</a></div><p class="mono" style="margin:0">${esc(
          card.smokeArtifactRelativePath
        )}</p><p class="muted-text" style="margin:0">generated: ${esc(fmtDate(card.generatedAt))}</p></article>`;
      })
      .join("");

    const evidenceTableRows = filteredEvidenceRows
      .map((row) => {
        const detailHref = `/ui/rollouts/detail?path=${encodeURIComponent(row.smokeArtifactPath)}`;
        const renderLogHref = row.renderLogPath
          ? `/ui/rollouts/detail?path=${encodeURIComponent(row.renderLogPath)}`
          : null;
        const deepLinkHref = profileBrowserHref([row.bundle, row.studioProfileId, row.channelProfileId, row.mascotProfileId]);
        return `<tr><td><div class="table-note"><strong>${esc(row.scenario)}</strong><span class="muted-text">${esc(
          row.bundle
        )}</span><span class="mono">${esc(row.artifactRelativePath)}</span><div class="inline-actions"><a href="${deepLinkHref}">Focus</a><a href="${detailHref}">Artifact Detail</a>${
          renderLogHref ? `<a href="${renderLogHref}">Render Log Detail</a>` : ""
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

    const urgentEvidenceRows = filteredEvidenceRows.filter((row) => row.tone !== "ok");
    const urgentEvidenceCards = urgentEvidenceRows
      .slice(0, 4)
      .map((row) => {
        const detailHref = `/ui/rollouts/detail?path=${encodeURIComponent(row.smokeArtifactPath)}`;
        return `<article class="decision-item tone-${row.tone}"><div class="decision-item-head"><div class="decision-item-title">${esc(
          row.bundle
        )}</div><span class="badge ${row.tone}">${esc(humanizeOpsLabel(row.status))}</span></div><p>${esc(
          `${row.scenario} | ${row.runtimeSummary || row.profileSummary || "-"}`
        )}</p><div class="decision-actions"><a href="${profileBrowserHref([
          row.bundle,
          row.studioProfileId,
          row.channelProfileId,
          row.mascotProfileId
        ])}">Focus Bundle</a><a href="${detailHref}">Artifact Detail</a><a href="/ui/benchmarks">Benchmarks</a></div></article>`;
      })
      .join("");
    const flash = `${flashHtml(request.query)}${dbNotice}`;
    const profileTone: UiBadgeTone = blockedEvidenceCount > 0 ? "bad" : warnEvidenceCount > 0 ? "warn" : "ok";
    const profileStatusLabel =
      blockedEvidenceCount > 0 ? "recovery queue active" : warnEvidenceCount > 0 ? "compare before baseline promote" : "baseline ready";
    const profileScope = profileSearch ? `filter ${profileSearch}` : "all profile objects";
    const profileBlockers: DecisionCard[] = urgentEvidenceRows.slice(0, 3).map((row) => ({
      title: `${row.bundle} ${humanizeOpsLabel(row.status)}`,
      detail: `${row.scenario} | ${row.runtimeSummary || row.profileSummary || "-"} | source ${row.sourceLabel}`,
      tone: row.tone,
      badge: humanizeOpsLabel(row.status),
      html: `<a href="${profileBrowserHref([row.bundle, row.studioProfileId, row.channelProfileId, row.mascotProfileId])}">Focus Bundle</a><a href="/ui/rollouts/detail?path=${encodeURIComponent(
        row.smokeArtifactPath
      )}">Artifact Detail</a>`
    }));
    const profilePrimaryActions: DecisionCard[] = [
      {
        title: blockedEvidenceCount > 0 ? "Recover blocked profile bundles" : "Review profile baseline",
        detail:
          blockedEvidenceCount > 0
            ? `${blockedEvidenceCount} runtime profile rows are blocked. Clear those before treating any profile bundle as promotable baseline evidence.`
            : warnEvidenceCount > 0
              ? `${warnEvidenceCount} rows still need comparison against the active ChannelBible before baseline promotion.`
              : "Runtime profile objects and active ChannelBibles are aligned enough to treat the current bundle set as the working baseline.",
        tone: profileTone,
        badge: blockedEvidenceCount > 0 ? "recover" : warnEvidenceCount > 0 ? "review" : "ready",
        html: `<a href="/ui/channel-bible">Open ChannelBible</a><a href="/ui/benchmarks">Benchmarks</a>`
      }
    ];
    const profileSecondaryActions: DecisionCard[] = [
      {
        title: "Compare before baseline promote",
        detail: "Compare runtime profile objects against the active ChannelBible before adopting a bundle as the new baseline or review reference.",
        tone: "warn",
        badge: "compare",
        html: `<a href="/ui/channel-bible">ChannelBible</a><a href="/ui/benchmarks">Benchmarks</a><a href="/ui/rollouts">Rollouts</a>`
      }
    ];
    const profileRecoveryActions: DecisionCard[] = [
      {
        title: "Artifact-first recovery path",
        detail: "Open artifact detail before raw JSON when runtime profile evidence diverges from ChannelBible or smoke expectations.",
        tone: blockedEvidenceCount > 0 ? "bad" : "muted",
        badge: blockedEvidenceCount > 0 ? "recover" : "detail",
        html: `<a href="/ui/rollouts">Rollout Queue</a><a href="/ui/benchmarks">Benchmark Queue</a>`
      }
    ];
    const profileRecentActivity: DecisionCard[] = filteredEvidenceRows.slice(0, 4).map((row) => ({
      title: `${row.bundle} / ${row.scenario}`,
      detail: `${humanizeOpsLabel(row.status)} | ${row.runtimeSummary || row.profileSummary || "-"} | ${fmtDate(row.generatedAt)}`,
      tone: row.tone,
      badge: humanizeOpsLabel(row.status)
    }));
    const profileLinkedObjects: DecisionCard[] = [
      {
        title: "Active ChannelBibles",
        detail: `${activeBibleCount}/${bibleCount} active or recent ChannelBible rows are loaded for comparison.`,
        tone: activeBibleCount > 0 ? "ok" : "warn",
        badge: "baseline",
        html: `<a href="/ui/channel-bible">Open ChannelBible</a>`
      },
      {
        title: "Artifact roots",
        detail: `${sources.filter((source) => source.exists).length}/${sources.length} shared roots are available for profile evidence.`,
        tone: sources.every((source) => source.exists) ? "ok" : "warn",
        badge: "sources",
        html: `<a href="#profile-artifact-sources">Artifact Sources</a><a href="/ui/rollouts">Rollouts</a>`
      }
    ];
    const profileDecisionRail: DecisionCard[] = [
      {
        title: blockedEvidenceCount > 0 ? "Recover queue first" : "Profile baseline gate",
        detail:
          blockedEvidenceCount > 0
            ? "Blocked runtime profile evidence stays ahead of bundle browsing. Recover those rows before promoting a new baseline."
            : "If the current queue is clean, use the active ChannelBible and runtime object cards to confirm the working baseline.",
        tone: profileTone,
        badge: blockedEvidenceCount > 0 ? "recover" : "baseline",
        html: `<a href="/ui/channel-bible">ChannelBible</a><a href="/ui/benchmarks">Benchmarks</a>`
      },
      {
        title: "Compare before promote",
        detail:
          warnEvidenceCount > 0
            ? `${warnEvidenceCount} warning rows still need compare-before-promote review against ChannelBible and smoke evidence.`
            : "No warning rows remain. Drop into artifact detail only when the bundle cards still look inconsistent.",
        tone: warnEvidenceCount > 0 ? "warn" : "ok",
        badge: "compare",
        html: `<a href="/ui/rollouts">Rollouts</a><a href="/ui/benchmarks">Benchmark Queue</a>`
      },
      {
        title: "Rollback anchor",
        detail: blockedEvidenceCount > 0 ? "Use the last clean ChannelBible + runtime bundle pair as the rollback baseline." : "The current active ChannelBible remains the rollback anchor for profile drift.",
        tone: activeBibleCount > 0 ? "ok" : "warn",
        badge: "rollback",
        html: `<a href="/ui/channel-bible">Active ChannelBible</a>`
      }
    ];
    const profileSnapshotFacts: DecisionFact[] = [
      { label: "Failure Reason", value: blockedEvidenceCount > 0 ? `${blockedEvidenceCount} blocked runtime rows` : warnEvidenceCount > 0 ? `${warnEvidenceCount} warning runtime rows` : "none", hint: "top profile review blocker" },
      { label: "Last Known Good", value: activeBibleCount > 0 ? `${activeBibleCount} active ChannelBible rows` : "no active ChannelBible", hint: "current baseline anchor" },
      { label: "Fallback Applied", value: profileScope, hint: "current profile browser scope" },
      { label: "Retry Path", value: blockedEvidenceCount > 0 ? "artifact detail -> bundle focus -> channel bible" : "bundle focus -> channel bible", hint: "baseline recovery path" },
      { label: "Alternate Path", value: "benchmarks / rollouts", hint: "linked review surfaces" },
      { label: "Rollback Point", value: activeBibleCount > 0 ? "active ChannelBible + last clean bundle" : "runtime smoke bundle only", hint: "profile rollback anchor" }
    ];
    const body = `${decisionSurfaceStyles()}<div class="decision-surface">${renderObjectHero({
      eyebrow: "Profile Control Plane",
      title: "Profile Browser",
      subtitle: "Runtime profile objects, ChannelBible baselines, and compare-before-promote review stay visible before artifact roots or payload detail.",
      statusLabel: profileStatusLabel,
      statusTone: profileTone,
      flash,
      headerContextHtml: `<span class="muted-text">scope <span class="decision-code">${esc(profileScope)}</span></span>`,
      quickLinksHtml: `<a href="/ui/channel-bible">Open ChannelBible</a><a href="/ui/benchmarks">Open Benchmarks</a><a href="/ui/rollouts">Open Rollouts</a>`,
      summaryCards: profileSummaryStats,
      metaItems: [
        { label: "Runtime combos", value: String(filteredBundleCards.length), hint: `${bundleCount} bundles in current scope` },
        { label: "Evidence rows", value: String(filteredEvidenceRows.length), hint: `${blockedEvidenceCount} blocked / ${warnEvidenceCount} warn` },
        { label: "ChannelBibles", value: `${activeBibleCount}/${bibleCount}`, hint: "active / recent rows from DB" },
        { label: "Filter scope", value: profileScope, hint: "deep-linkable browser scope" }
      ],
      blockers: profileBlockers,
      primaryActions: profilePrimaryActions,
      secondaryActions: profileSecondaryActions,
      recoveryActions: profileRecoveryActions,
      recentActivity: profileRecentActivity,
      linkedObjects: profileLinkedObjects
    })}${renderDecisionPrioritySection({
      title: "Decision Rail",
      intro: "Baseline choice, compare-before-promote review, and rollback anchor stay above runtime object cards and artifact roots.",
      linksHtml: `<a href="/ui/channel-bible">ChannelBible</a><a href="/ui/benchmarks">Benchmarks</a><a href="/ui/rollouts">Rollouts</a>`,
      railTitle: "Profile actions",
      railIntro: "Recover blocked bundles first, compare warnings before promote, then only open artifact detail when you need deeper proof.",
      railCards: profileDecisionRail,
      railEmpty: "No profile actions are available.",
      railTone: profileTone,
      snapshotIntro: "Failure reason, baseline anchor, retry path, and rollback point stay above bundle browsing.",
      snapshotFacts: profileSnapshotFacts,
      snapshotEmpty: "No profile recovery snapshot is available.",
      snapshotTone: profileTone
    })}${urgentEvidenceCards ? `<section class="card"><div class="section-head"><div><h2>Review Queue</h2><p class="section-intro">Blocked and warning profile objects stay above the fold so recovery starts here.</p></div></div><div class="decision-stack">${urgentEvidenceCards}</div></section>` : ""}<section class="card"><div class="section-head"><div><h2>Runtime Profile Objects</h2><p class="section-intro">Use these bundle objects as the primary compare-before-promote surface.</p></div>${profileSearch ? `<div class="quick-links"><a href="/ui/profiles">Clear Filter</a><span class="badge warn">filter ${esc(profileSearch)}</span></div>` : ""}</div><div class="decision-media-grid">${bundleCardsHtml || '<div class="notice">No runtime profile bundles found.</div>'}</div></section><section class="card"><div class="section-head"><div><h2>Profile Runtime Evidence</h2><p class="section-intro">Artifact detail links stay available, but raw payloads are pushed behind the profile decision surfaces above.</p></div><input type="search" data-table-filter="profiles-evidence-table" aria-label="Filter profile runtime evidence" value="${esc(
      profileSearch
    )}" placeholder="Search by scenario / bundle / profile / source"/></div><div class="table-wrap"><table id="profiles-evidence-table"><thead><tr><th>Scenario</th><th>Status</th><th>Profiles</th><th>Runtime Summary</th><th>Generated</th><th>Source</th></tr></thead><tbody>${
      evidenceTableRows || `<tr><td colspan="6"><div class="notice">No profile runtime evidence found.</div></td></tr>`
    }</tbody></table></div></section><section class="card"><div class="section-head"><h2>Active Channel Bibles</h2><input type="search" data-table-filter="profiles-bible-table" aria-label="Filter active channel bibles" value="${esc(
      profileSearch
    )}" placeholder="Search by channel / tone / pacing / version"/></div><div class="table-wrap"><table id="profiles-bible-table"><thead><tr><th>Channel</th><th>Version</th><th>Status</th><th>Language</th><th>Tone / Pacing</th><th>Presets / Rules</th><th>Updated</th><th>Actions</th></tr></thead><tbody>${
      bibleRows || `<tr><td colspan="8"><div class="notice">No ChannelBible rows available.</div></td></tr>`
    }</tbody></table></div></section><section class="card dashboard-shell" id="profile-artifact-sources"><div class="section-head"><div><h2>Artifact Sources</h2><span class="muted-text">Shared roots remain available as evidence, but they no longer lead the page narrative.</span></div>${
      profileSearch
        ? `<div class="quick-links"><a href="/ui/profiles">Clear Filter</a><span class="badge warn">filter ${esc(profileSearch)}</span></div>`
        : ""
    }</div><div class="form-card"><div class="field"><label for="profiles-search">Deep-link filter</label><input id="profiles-search" type="search" data-table-filter="profiles-evidence-table" aria-label="Filter profiles by bundle or profile id" value="${esc(
      profileSearch
    )}" placeholder="Search by bundle / studio_default / economy_channel / med_dog"/></div><small>This filter is also applied server-side for direct links such as <code>/ui/profiles?q=economy_channel</code>.</small></div><div class="status-list">${sourceRows || '<div class="notice">No artifact sources configured.</div>'}</div></section></div>`;

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
        const quickRun = `<form method="post" action="/ui/episodes/${esc(row.id)}/run-profile" class="inline" data-run-group="episode-${esc(row.id)}"><input type="hidden" name="profile" value="preview"/><input type="hidden" name="stylePresetId" value="${esc(style.stylePresetId)}"/><input type="hidden" name="hookBoost" value="${esc(style.hookBoost.toFixed(2))}"/><input type="hidden" name="redirectTarget" value="episodes"/><button type="submit">Preview</button></form><form method="post" action="/ui/episodes/${esc(row.id)}/run-profile" class="inline" data-run-group="episode-${esc(row.id)}"><input type="hidden" name="profile" value="full"/><input type="hidden" name="stylePresetId" value="${esc(style.stylePresetId)}"/><input type="hidden" name="hookBoost" value="${esc(style.hookBoost.toFixed(2))}"/><input type="hidden" name="redirectTarget" value="episodes"/><button type="submit" class="secondary">Full</button></form><form method="post" action="/ui/episodes/${esc(row.id)}/run-profile" class="inline" data-run-group="episode-${esc(row.id)}"><input type="hidden" name="profile" value="render_only"/><input type="hidden" name="stylePresetId" value="${esc(style.stylePresetId)}"/><input type="hidden" name="hookBoost" value="${esc(style.hookBoost.toFixed(2))}"/><input type="hidden" name="redirectTarget" value="episodes"/><button type="submit" class="secondary">Render</button></form>`;
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
    const decisionState = readDecisionLinkState(request.query);
    const episodeFocusValue = decisionToken(decisionState.focus);
    const episodeSelectedTokens = decisionTokenSet(decisionState.selected);
    const episodePinnedTokens = decisionTokenSet(decisionState.pinned);
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
        (item) => {
          const shotRowId = buildDecisionAnchorId("episode-shot", item.shotId);
          const isFocused =
            episodeFocusValue === decisionToken(item.shotId) ||
            episodeFocusValue === decisionToken(`shot:${item.shotId}`) ||
            decisionSetHas(episodeSelectedTokens, item.shotId, `shot:${item.shotId}`) ||
            decisionSetHas(episodePinnedTokens, item.shotId, `shot:${item.shotId}`);
          return `<tr id="${shotRowId}" class="decision-focus-row${isFocused ? " is-focused" : ""}">
          <td><code>${esc(item.shotId)}</code></td>
          <td>${esc(humanizeOpsLabel(item.shotType))}</td>
          <td>${esc(item.routeReasonLabel)}</td>
          <td>${esc(item.backend ?? "-")}</td>
          <td><span class="badge ${badgeClass(item.acceptanceStatus ?? item.sidecarStatus ?? "")}">${esc(item.acceptanceStatus ?? item.sidecarStatus ?? "-")}</span></td>
          <td>${esc(item.visualSummary)}</td>
          <td>${esc(item.fallbackSummary)}</td>
          <td>${esc(item.qcSummary === "-" ? item.repairSummary : compact([item.qcSummary, item.repairSummary], " | "))}</td>
        </tr>`;
        }
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
      .map((job) => `<tr><td><a href="/ui/jobs/${esc(job.id)}">${esc(job.id)}</a></td><td>${esc(job.type)}</td><td><span class="badge ${badgeClass(String(job.status ?? ""))}">${esc(statusLabelKo(String(job.status ?? "")))}</span></td><td>${esc(job.progress)}%</td><td>${esc(job.attemptsMade ?? 0)} / ${esc(job.maxAttempts ?? "-")}</td><td>${esc(job.retryBackoffMs ?? "-")}ms</td><td>${fmtDate(job.createdAt)}</td></tr>`)
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
            ? "preview (권장)"
            : profileId === "full"
              ? "full (최종/패키지)"
              : "render_only (빠른 렌더)";
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
        return `<tr><td>${esc(type)}</td><td><span class="badge ${badgeClass(status)}">${esc(statusLabelKo(status))}</span></td><td>${esc(progress)}%</td><td>${jobId ? `<a href="/ui/jobs/${esc(jobId)}">${esc(jobId)}</a>` : "-"}</td></tr>`;
      })
      .join("");
    const recommendAction = (() => {
      if (styleQcMain.failCount > 0) {
        return {
          title: "권장: STYLE_QC 실패를 스타일 프리뷰로 해결",
          detail: `STYLE_QC 실패=${styleQcMain.failCount}. 전체 실행 전에 스타일 프리셋과 hookBoost를 조정하세요.`,
          profile: "preview" as RunProfileId
        };
      }
      if (styleQcMain.warnCount > 0) {
        return {
          title: "권장: 남은 경고를 A/B 비교로 검토",
          detail: `STYLE_QC 경고=${styleQcMain.warnCount}. 전체 실행 전에 A/B 프리뷰 비교를 돌려보세요.`,
          profile: "preview" as RunProfileId
        };
      }
      if (!shotsReady) {
        return {
          title: "권장: 먼저 COMPILE_SHOTS 실행",
          detail: "shots.json이 없어 렌더가 실패할 수 있습니다. 먼저 COMPILE_SHOTS를 실행하세요.",
          profile: "preview" as RunProfileId
        };
      }
      if (!previewExists) {
        return {
          title: "권장: 프리뷰 렌더 실행",
          detail: "preview.mp4가 아직 없습니다. 먼저 preview 프로필로 실행하세요.",
          profile: "preview" as RunProfileId
        };
      }
      if (!finalExists || !uploadManifestExists) {
        return {
          title: "권장: 전체 파이프라인 실행",
          detail: "최종 출력(final/manifest)이 아직 준비되지 않았습니다. full 프로필로 마무리하세요.",
          profile: "full" as RunProfileId
        };
      }
      return {
        title: "파이프라인 출력 준비 완료",
        detail: "preview/final/manifest가 모두 존재합니다. 필요하면 스타일 A/B 비교 후 퍼블리시하세요.",
        profile: "full" as RunProfileId
      };
    })();
    const editorSnapshotsPath = editorSnapshotsDir(id);
    const editorSnapshotCount = fs.existsSync(editorSnapshotsPath)
      ? fs.readdirSync(editorSnapshotsPath).filter((name) => name.endsWith(".json")).length
      : 0;
    const editorHistoryState = readEditorHistory(id);
    const lastGoodState =
      finalExists && uploadManifestExists
        ? "final.mp4 + upload manifest"
        : previewExists
          ? "preview.mp4"
          : shotsReady
            ? "shots.json"
            : "none";
    const rollbackPoint =
      editorSnapshotCount > 0
        ? `editor snapshots ${editorSnapshotCount}`
        : previewExists
          ? "preview.mp4"
          : shotsReady
            ? "shots.json"
            : "rebuild from COMPILE_SHOTS";
    const episodeProfilesHref = profileBrowserHref([
      opsView.channelProfileId,
      opsView.mascotProfileId,
      opsView.studioProfileId
    ]);
	    const episodeStatusLabel = String(episode.status ?? "UNKNOWN");
	    const episodeStatusDisplay = statusLabelKo(episodeStatusLabel);
	    const episodeStatusTone = decisionTone(badgeClass(episodeStatusLabel));
	    const currentProfileSummary =
	      summarizeValues([opsView.channelProfileId, opsView.mascotProfileId, opsView.studioProfileId], 3) || "profile unresolved";
	    const renderPathSummary =
	      compact(
	        [
	          opsView.routeSummary !== "-" ? `route ${opsView.routeSummary}` : null,
	          opsView.renderModeSummary !== "-" ? `render ${opsView.renderModeSummary}` : null,
	          opsView.backendSummary !== "-" ? `backend ${opsView.backendSummary}` : null
	        ],
	        " | "
	      ) || "runtime render path unavailable";
	    const currentEpisodeHref = uiHref(`/ui/episodes/${encodeURIComponent(id)}`, {
	      params: {
	        ...decisionStateParams(decisionState),
	        profile: selectedRunProfile
	      }
	    });
	    const episodeStateHidden = renderDecisionStateHiddenInputs(decisionState);
	    const episodeActionHidden = `${episodeStateHidden}<input type="hidden" name="redirectPath" value="${esc(currentEpisodeHref)}"/>`;
	    const opsWorkbenchHref = uiHref(`/ui/episodes/${encodeURIComponent(id)}/editor`, {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentEpisodeHref
	      },
	      hash: episodeFocusValue.includes("shot") ? "editor-timeline" : null
	    });
	    const episodeCompareHref = uiHref(`/ui/episodes/${encodeURIComponent(id)}/ab-compare`, {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentEpisodeHref,
	        compare: uniqueStrings([...decisionState.compare, style.stylePresetId])
	      },
	      hash: "episode-ab-compare-shell"
	    });
	    const episodeReturnHref = decisionState.returnTo ?? "/ui/episodes";
	    const episodeReturnLabel = decisionState.returnTo
	      ? decisionState.returnTo.includes("/ab-compare") || decisionState.returnTo.includes("/candidates")
	        ? "비교로 돌아가기"
	        : "목록으로 돌아가기"
	      : "에피소드로 돌아가기";
	    const episodeArtifactsHref = `/ui/artifacts?episodeId=${encodeURIComponent(id)}`;
	    const episodeJumpFacts: DecisionFact[] = [
	      ...(decisionState.focus
	        ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "incoming object or section focus" }]
	        : []),
	      ...(decisionState.selected.length > 0
	        ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected ids carried into detail` }]
	        : []),
	      ...(decisionState.compare.length > 0
	        ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare handoff carried from the list or prior surface" }]
	        : []),
	      ...(decisionState.pinned.length > 0
	        ? [{ label: "Pinned", value: summarizeValues(decisionState.pinned, 3), hint: "header-pinned objects kept in view" }]
	        : []),
	      ...(decisionState.view
	        ? [{ label: "View", value: humanizeOpsLabel(decisionState.view), hint: "view mode preserved from the previous surface" }]
	        : [])
	    ];
	    const episodeJumpBanner = renderDecisionJumpBanner({
	      title: "Deep-link handoff",
	      intro: "Selected objects, compare intent, and the return path stay visible so this detail surface reads like a continuation of the previous queue.",
	      facts: episodeJumpFacts,
	      linksHtml: `<a href="${episodeReturnHref}">${episodeReturnLabel}</a><a href="${episodeCompareHref}">Compare handoff</a><a href="${opsWorkbenchHref}">Open workbench</a>`,
	      tone: episodeStatusTone
	    });
	    const channelName =
	      str(isRecord(episode.channel) ? episode.channel.name : undefined) ??
	      str(episode.channelName) ??
	      "-";
    const characterPackId = str(episode.characterPackId);
    const characterPackVersion = str(episode.characterPackVersion);
    const latestFailedJob = jobs.find((job) => String(job.status ?? "").toUpperCase() === "FAILED") ?? null;
    const latestSucceededJob =
      jobs.find((job) => ["COMPLETED", "SUCCEEDED"].includes(String(job.status ?? "").toUpperCase())) ?? null;
	    const pipelineStateLabel =
	      finalExists && uploadManifestExists
	        ? "최종 패키지 준비 완료"
        : previewExists
          ? "프리뷰 준비 완료"
          : shotsReady
            ? "샷 컴파일 완료"
            : "스크립트만 준비됨";
	    const outputsReady = [previewExists, finalExists, uploadManifestExists].filter(Boolean).length;
	    const episodeSummaryCards: DecisionStat[] = [
	      {
	        label: "파이프라인 게이트",
	        value: pipelineStateLabel,
	        hint: recommendAction.title,
	        tone: outputsReady === 3 ? "ok" : previewExists ? "warn" : "bad"
	      },
	      {
	        label: "렌더 경로",
	        value: renderPathSummary,
	        hint: opsView.visualSummary !== "-" ? `visual ${opsView.visualSummary}` : "route / render / backend summary",
	        tone: opsView.renderModeSummary.includes("mismatched") || opsView.routeSummary !== "-" ? "warn" : "muted"
	      },
	      {
	        label: "현재 프로필",
	        value: currentProfileSummary,
	        hint: "channel / mascot / studio runtime profiles",
	        tone: currentProfileSummary === "profile unresolved" ? "warn" : "ok"
	      },
	      {
	        label: "QC / 폴백",
	        value: `${styleQcMain.failCount} 실패 / ${styleQcMain.warnCount} 경고`,
	        hint: episodeFallbackSummary || `강제 스타일 ${styleQcMain.forcedStyle}`,
	        tone: styleQcMain.failCount > 0 ? "bad" : styleQcMain.warnCount > 0 || opsView.fallbackSteps.length > 0 ? "warn" : "ok"
	      },
	      {
	        label: "Last Good / Rollback",
	        value: lastGoodState,
	        hint: rollbackPoint,
	        tone: lastGoodState === "none" ? "warn" : "ok"
	      }
	    ];
    const blockerCards: DecisionCard[] = [];
    if (latestFailedJob) {
      blockerCards.push({
        title: `실패 작업 ${str(latestFailedJob.type) ?? "job"}`,
        detail: str(latestFailedJob.lastError) ?? "최근 실패 작업에 lastError 메시지가 기록되지 않았습니다.",
        tone: "bad",
        badge: statusLabelKo(String(latestFailedJob.status ?? "FAILED")),
        html: `<a href="/ui/jobs/${encodeURIComponent(String(latestFailedJob.id ?? ""))}">실패 작업 열기</a>`
      });
    }
    if (!shotsReady) {
      blockerCards.push({
        title: "shots.json 누락",
        detail: "샷 그래프를 먼저 컴파일하지 않으면 프리뷰/전체 렌더가 안정적인 롤백 지점 없이 실패할 수 있습니다.",
        tone: "bad",
        badge: "먼저 컴파일"
      });
    }
    if (!previewExists) {
      blockerCards.push({
        title: "프리뷰 산출물 누락",
        detail: "preview.mp4가 없어 프리뷰 렌더가 완료되기 전까지 비교/복구 판단이 막혀 있습니다.",
        tone: "warn",
        badge: "프리뷰 필요"
      });
    }
    if (styleQcMain.failCount > 0 || styleQcMain.warnCount > 0) {
      blockerCards.push({
        title: styleQcMain.failCount > 0 ? "STYLE_QC 실패 감지" : "STYLE_QC 경고 검토 필요",
        detail:
          styleQcMain.failCount > 0
            ? `STYLE_QC 실패=${styleQcMain.failCount}. 전체 렌더 전에 stylePreset과 hookBoost를 조정하세요.`
            : `STYLE_QC 경고=${styleQcMain.warnCount}. 이 에피소드를 승격하기 전에 A/B 비교를 검토하세요.`,
        tone: styleQcMain.failCount > 0 ? "bad" : "warn",
        badge: styleQcMain.failCount > 0 ? "복구" : "검토"
      });
    }
    if (episodeFallbackSummary) {
      blockerCards.push({
        title: "폴백 경로 적용됨",
        detail: episodeFallbackSummary,
        tone: "warn",
        badge: "폴백"
      });
    }
    const primaryActionCards: DecisionCard[] = [
      {
        title: recommendAction.title,
        detail: `${recommendAction.detail} 권장 프로필: ${runProfileUiLabel(recommendAction.profile)}.`,
        tone: recommendAction.profile === "full" && !previewExists ? "warn" : "ok",
        badge: runProfileUiLabel(recommendAction.profile),
        html: `<form method="post" action="/ui/episodes/${esc(id)}/run-profile" class="inline"><input type="hidden" name="profile" value="${esc(
          recommendAction.profile
        )}"/><input type="hidden" name="stylePresetId" value="${esc(style.stylePresetId)}"/><input type="hidden" name="hookBoost" value="${esc(
          style.hookBoost.toFixed(2)
        )}"/><input type="hidden" name="redirectTarget" value="episode"/>${episodeActionHidden}<button type="submit">${esc(
          runProfileUiLabel(recommendAction.profile)
        )} 실행</button></form><a href="/ui/jobs">작업 모니터</a>`
      }
    ];
    const secondaryActionCards: DecisionCard[] = [
      {
        title: "승격 전 비교",
        detail: "변형 비교와 프로필 라우팅 점검을 먼저 끝낸 뒤에만 이 에피소드를 승격하세요.",
        tone: "warn",
        badge: "compare",
        html: `<a href="${episodeCompareHref}">A/B 비교</a><a href="${episodeProfilesHref}">프로필 브라우저</a>`
      },
      {
        title: "Ops 워크벤치",
        detail: "경로 사유, 렌더 모드, 롤백 판단에 샷 단위 문맥이 필요하면 단순 에디터가 아니라 ops-aware workbench를 사용하세요.",
        tone: "muted",
        badge: "workbench",
        html: `<a href="${opsWorkbenchHref}">Ops 워크벤치</a><a href="${episodeArtifactsHref}">산출물 인덱스</a>`
      }
    ];
    const recoveryActionCards: DecisionCard[] = [];
    if (latestFailedJob?.id) {
      recoveryActionCards.push({
        title: "마지막 실패 작업 재시도",
        detail: "파이프라인을 수동으로 다시 조립하기 전에 기록된 실패 단계를 먼저 재실행하세요.",
        tone: "bad",
        badge: String(latestFailedJob.type ?? "retry"),
        html: `<form method="post" action="/ui/jobs/${encodeURIComponent(String(latestFailedJob.id))}/retry" class="inline"><button type="submit">실패 작업 재시도</button></form><a href="/ui/jobs/${encodeURIComponent(
          String(latestFailedJob.id)
        )}">실패 상세 보기</a>`
      });
    }
    if (!shotsReady) {
      recoveryActionCards.push({
        title: "샷 그래프 복구",
        detail: "프리뷰나 전체 렌더를 다시 시도하기 전에 shots.json을 재생성하세요.",
        tone: "bad",
        badge: "컴파일",
        html: `<form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="COMPILE_SHOTS"/>${styleHidden}${episodeActionHidden}<button type="submit">COMPILE_SHOTS 실행</button></form>`
      });
    }
    if (!previewExists) {
      recoveryActionCards.push({
        title: "프리뷰 재생성",
        detail: "비교와 롤백 판단을 다시 신뢰할 수 있도록 주요 검토 산출물을 복원하세요.",
        tone: "warn",
        badge: "프리뷰",
        html: `<form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="RENDER_PREVIEW"/>${styleHidden}${episodeActionHidden}<button type="submit">프리뷰 렌더 실행</button></form>`
      });
    }
    if (styleQcMain.failCount > 0 || styleQcMain.warnCount > 0) {
      recoveryActionCards.push({
        title: "대체 검토 경로 사용",
        detail: "전체 재실행을 확정하기 전에 스타일 프리뷰나 변형 비교를 먼저 수행하세요.",
        tone: "warn",
        badge: "대체 경로",
        html: `<form method="post" action="/ui/episodes/${esc(id)}/style-preview" class="inline"><input type="hidden" name="stylePresetId" value="${esc(
          style.stylePresetId
        )}"/><input type="hidden" name="hookBoost" value="${esc(
          style.hookBoost.toFixed(2)
        )}"/>${episodeActionHidden}<button type="submit">스타일 프리뷰 실행</button></form><a href="${episodeCompareHref}">A/B 비교 보기</a>`
      });
    }
	    const linkedObjectCards: DecisionCard[] = [
	      {
	        title: "현재 프로필 오브젝트",
	        detail: `채널 ${opsView.channelProfileId ?? "-"} / 마스코트 ${opsView.mascotProfileId ?? "-"} / 스튜디오 ${opsView.studioProfileId ?? "-"}`,
	        tone: "muted",
	        badge: "profiles",
	        html: `<a href="${episodeProfilesHref}">일치하는 프로필 열기</a>`
	      },
	      {
	        title: "렌더 경로 요약",
	        detail: renderPathSummary,
	        tone: opsView.renderModeSummary.includes("mismatched") ? "warn" : "muted",
	        badge: "render path",
	        html: `<a href="${opsWorkbenchHref}">Ops 워크벤치</a><a href="${episodeProfilesHref}">프로필 브라우저</a>`
	      },
	      {
	        title: "마지막 정상 상태",
	        detail: lastGoodState,
        tone: lastGoodState === "none" ? "warn" : "ok",
        badge: "last good",
        html: latestSucceededJob?.id ? `<a href="/ui/jobs/${encodeURIComponent(String(latestSucceededJob.id))}">최근 성공 작업</a>` : `<a href="${episodeArtifactsHref}">산출물 인덱스</a>`
      },
      {
        title: "롤백 포인트 / 워크벤치",
        detail: `${rollbackPoint}${editorHistoryState ? ` | history ${editorHistoryState.pointer + 1}/${editorHistoryState.states.length}` : ""}`,
        tone: rollbackPoint === "rebuild from COMPILE_SHOTS" ? "warn" : "ok",
        badge: "rollback",
        html: `<a href="${opsWorkbenchHref}">Ops 워크벤치 열기</a>`
      },
      {
        title: "에피소드 근거",
	        detail: "판단 요약만으로 부족할 때 원시 운영 산출물로 한 번에 이동할 수 있습니다.",
	        tone: "muted",
        html: opsArtifactLinks || `<a href="${episodeArtifactsHref}">에피소드 산출물 열기</a>`
	      }
	    ];
    if (characterPackId) {
      linkedObjectCards.push({
        title: "캐릭터 팩",
        detail: `characterPackId ${characterPackId}${characterPackVersion ? ` / 버전 ${characterPackVersion}` : ""}`,
        tone: "muted",
        html: `<a href="/ui/characters?characterPackId=${encodeURIComponent(characterPackId)}">캐릭터 팩 상세 열기</a>`
      });
    }
    const recentActivityCards: DecisionCard[] = jobs.slice(0, 4).map((job) => {
      const status = String(job.status ?? "UNKNOWN");
      return {
        title: `${str(job.type) ?? "job"} ${statusLabelKo(status)}`,
        detail: `${esc(job.progress)}% 완료 | 생성 시각 ${fmtDate(job.createdAt)}`,
        tone: decisionTone(badgeClass(status)),
        badge: statusLabelKo(status),
        html: job.id ? `<a href="/ui/jobs/${encodeURIComponent(String(job.id))}">작업 열기</a>` : ""
      };
    });
    const recoveryFacts: DecisionFact[] = [
      {
        label: "실패 사유",
        value:
          str(latestFailedJob?.lastError) ??
          (qcIssues[0] ? compact([qcIssues[0].check, qcIssues[0].message], " - ") : null) ??
          recommendAction.detail,
        hint: "레일의 첫 차단 요인"
      },
      {
        label: "마지막 정상 지점",
        value: lastGoodState,
        hint: finalExists && uploadManifestExists ? "전체 패키지 사용 가능" : "가장 가까운 복구 앵커"
      },
      { label: "적용된 폴백", value: episodeFallbackSummary || "없음", hint: "현재 폴백 체인" },
      { label: "재시도 경로", value: recommendAction.title, hint: `프로필 ${runProfileUiLabel(recommendAction.profile)}` },
      {
        label: "대체 경로",
        value: styleQcMain.failCount > 0 || styleQcMain.warnCount > 0 ? "스타일 프리뷰 -> A/B 비교" : "프로필 브라우저 -> Ops 워크벤치",
        hint: "운영자 검토 경로"
      },
      {
        label: "롤백 지점",
        value: rollbackPoint,
        hint: editorHistoryState ? `history ${editorHistoryState.pointer + 1}/${editorHistoryState.states.length}` : String(artifacts.outDir ?? localOut.outDir)
      }
    ];
	    const episodeDecisionRail: DecisionCard[] = [
      {
        title: recommendAction.title,
        detail: `${recommendAction.detail} 현재 기본 경로는 ${runProfileUiLabel(recommendAction.profile)}로 유지하세요.`,
        tone: episodeStatusTone,
        badge: "기본 경로",
        html: `<a href="#episode-run-control">실행 제어</a><a href="/ui/jobs">작업 모니터</a>`
      },
      {
        title: "승격 전 비교",
        detail: previewAExists || previewBExists ? "A/B 산출물이 이미 연결되어 있어 승격 전 비교 게이트를 바로 통과시킬 수 있습니다." : "스타일, QC, 폴백 신호가 남아 있으면 승격 전에 A/B 프리뷰 비교를 생성하세요.",
        tone: previewAExists || previewBExists ? "warn" : "muted",
        badge: "compare",
        html: `<a href="${episodeCompareHref}">A/B 비교</a><a href="${episodeProfilesHref}">프로필 브라우저</a>`
      },
      {
        title: "롤백 앵커",
        detail: `${lastGoodState}가 현재 가장 가까운 last-good state이며, ${rollbackPoint}가 작업면 기준 rollback point입니다.`,
        tone: lastGoodState === "none" ? "warn" : "ok",
        badge: "rollback",
        html: `<a href="${episodeArtifactsHref}">산출물 인덱스</a><a href="${opsWorkbenchHref}">Ops 워크벤치</a>`
	      }
	    ];
	    const episodeEvidenceFacts: DecisionFact[] = [
	      { label: "Render Path", value: renderPathSummary, hint: "route / render mode / backend at a glance" },
	      { label: "Current Profiles", value: currentProfileSummary, hint: "resolved runtime profile set" },
	      { label: "Last Good", value: lastGoodState, hint: "nearest trusted episode state" },
	      { label: "Rollback Point", value: rollbackPoint, hint: "operator rollback anchor" }
	    ];
	    const episodeEvidenceDrawerBody = `<div class="decision-copy">Use the episode object summary and linked review rails first. Drop into artifact files or raw QC only when the promotion gate, render path, or rollback anchor still feels uncertain.</div>
	<div class="quick-links">${opsArtifactLinks || `<a href="${episodeArtifactsHref}">에피소드 산출물 인덱스</a>`}</div>
	<details class="decision-drawer"><summary>Open QC evidence memo</summary><div class="decision-drawer-body"><div class="decision-copy">STYLE_QC 실패 ${esc(
	      String(styleQcMain.failCount)
	    )} / 경고 ${esc(String(styleQcMain.warnCount))} / 강제 스타일 ${esc(styleQcMain.forcedStyle)}. Raw qc_report.json stays lower on the page because the operator should decide from the control-plane summary first.</div></div></details>`;

	    const episodeBody = `${decisionSurfaceStyles()}<div class="decision-surface">${renderObjectHero({
      eyebrow: "에피소드 제어면",
      title: "에피소드 상세",
      subtitle: "승격 전 비교, last-good state, rollback point를 같은 오브젝트 화면에서 유지하며 에피소드를 운영합니다.",
      statusLabel: episodeStatusDisplay,
      statusTone: episodeStatusTone,
      flash: `${flashHtml(request.query)}${episodeJumpBanner}`,
      headerContextHtml: `<span class="muted-text">에피소드 <span class="decision-code">${esc(episode.id ?? id)}</span></span><span class="muted-text">주제 ${esc(
        String(episode.topic ?? "")
      )}</span>`,
      quickLinksHtml: `<a href="${episodeReturnHref}">${episodeReturnLabel}</a><a href="${episodeProfilesHref}">프로필 브라우저</a><a href="/ui/jobs">작업 모니터</a><a href="${episodeCompareHref}">A/B 비교</a><a href="${opsWorkbenchHref}">Ops 워크벤치</a>`,
      summaryCards: episodeSummaryCards,
      metaItems: [
        { label: "에피소드 ID", value: String(episode.id ?? id), hint: "오브젝트 키" },
        { label: "채널", value: channelName, hint: "퍼블리시 대상" },
        { label: "스타일 프리셋", value: style.stylePresetId, hint: `hookBoost ${style.hookBoost.toFixed(2)}` },
        { label: "산출물 경로", value: String(artifacts.outDir ?? localOut.outDir), hint: "산출물 루트" },
        {
          label: "프로필",
          value: summarizeValues([opsView.channelProfileId, opsView.mascotProfileId, opsView.studioProfileId], 3),
          hint: "해결된 런타임 프로필"
        },
        {
          label: "캐릭터 팩",
          value: characterPackId ? `${characterPackId}${characterPackVersion ? ` v${characterPackVersion}` : ""}` : "없음",
          hint: "연결된 캐릭터 오브젝트"
        }
      ],
      blockers: blockerCards,
      primaryActions: primaryActionCards,
      secondaryActions: secondaryActionCards,
      recoveryActions: recoveryActionCards,
      recentActivity: recentActivityCards,
	      linkedObjects: linkedObjectCards
	    })}${renderDecisionPrioritySection({
	      sectionId: "episode-decision-rail",
	      title: "판단 레일",
      intro: "권장 실행 경로, 승격 전 비교, rollback anchor를 무거운 근거 섹션보다 위에 유지합니다.",
      linksHtml: `<a href="${opsWorkbenchHref}">Ops 워크벤치</a><a href="${episodeArtifactsHref}">산출물 인덱스</a>`,
      railTitle: "다음 운영자 액션",
      railIntro: "원시 근거로 내려가기 전에 실행, 비교, 복구 중 무엇을 할지 이 레일에서 결정하세요.",
      railCards: episodeDecisionRail,
      railEmpty: "아직 운영자 레일이 없습니다.",
      railTone: episodeStatusTone,
      snapshotIntro: "실패 사유, last-good state, 폴백, 재시도 경로, rollback point를 상단에 유지합니다.",
	      snapshotFacts: recoveryFacts,
	      snapshotEmpty: "복구 데이터가 아직 없습니다.",
	      snapshotTone: episodeStatusTone
	    })}${renderRecoveryRailSection({
	      sectionId: "episode-recovery-rail",
	      title: "복구 / 연결 오브젝트",
	      intro: "복구 레일과 linked object rail을 분리해, 재시도 순서와 인접 오브젝트 이동 경로를 같은 높이에 둡니다.",
	      linksHtml: `<a href="${opsWorkbenchHref}">Ops 워크벤치</a><a href="${episodeProfilesHref}">프로필 브라우저</a><a href="${episodeArtifactsHref}">산출물 인덱스</a>`,
	      recoveryTitle: "복구 레일",
	      recoveryIntro: "실패, 산출물 누락, QC 경고가 남아 있으면 이 순서대로 복구를 진행합니다.",
	      recoveryCards: recoveryActionCards,
	      recoveryEmpty: "지금은 별도 복구 액션이 필요하지 않습니다.",
	      recoveryTone: recoveryActionCards[0]?.tone ? decisionTone(recoveryActionCards[0].tone) : episodeStatusTone,
	      linkedTitle: "연결 오브젝트 레일",
	      linkedIntro: "render path, current profiles, last-good state, rollback point를 연결 오브젝트 맥락으로 유지합니다.",
	      linkedCards: linkedObjectCards,
	      linkedEmpty: "연결된 오브젝트가 아직 없습니다.",
	      linkedTone: linkedObjectCards[1]?.tone ? decisionTone(linkedObjectCards[1].tone) : "muted"
	    })}${renderArtifactEvidenceSection({
	      sectionId: "episode-evidence",
	      title: "아티팩트 근거 드로어",
	      intro: "기본 판단 UI를 먼저 보고, artifact-backed evidence는 드로어에서 보조 확인합니다.",
	      linksHtml: `<a href="${episodeProfilesHref}">프로필 브라우저</a><a href="${opsWorkbenchHref}">Ops 워크벤치</a>`,
	      summaryTitle: "오브젝트 근거 요약",
	      summaryIntro: "render path, current profiles, last-good state, rollback point를 한 묶음으로 유지합니다.",
	      summaryFacts: episodeEvidenceFacts,
	      summaryEmpty: "아직 에피소드 근거 요약이 없습니다.",
	      summaryTone: episodeStatusTone,
	      drawerTitle: "근거 드로어",
	      drawerIntro: "원시 artifact와 QC는 여기로 밀어 두고, 상단 control plane에서 먼저 결정을 내립니다.",
	      drawerSummary: "Open episode artifact evidence and raw-evidence policy",
	      drawerBodyHtml: episodeEvidenceDrawerBody,
	      drawerTone: "muted",
	      drawerOpen: ["evidence", "artifact", "raw", "qc"].includes(episodeFocusValue) || decisionToken(decisionState.view) === "evidence"
	    })}
<section class="card decision-jump-target" id="episode-context">
	  <div class="section-head">
	    <div>
	      <h2>운영 컨텍스트</h2>
	      <p class="section-intro">판단 요약은 위에 유지하고, 이 섹션은 render path와 shot-level ops context를 읽기 쉽게 정리합니다.</p>
	    </div>
	    <div class="quick-links"><a href="${episodeProfilesHref}">프로필 브라우저 보기</a><a href="${opsWorkbenchHref}">Ops 워크벤치</a></div>
	  </div>
  <p>episodeId: <strong>${esc(episode.id ?? id)}</strong></p>
  <p>주제: <strong>${esc(episode.topic ?? "")}</strong></p>
  <p>상태: <span class="badge ${badgeClass(String(episode.status ?? ""))}">${esc(episodeStatusDisplay)}</span></p>
  <p>스타일 프리셋: <strong>${esc(style.stylePresetId)}</strong> / hookBoost: <strong>${esc(style.hookBoost.toFixed(2))}</strong></p>
  <p>산출물 경로: <code>${esc(artifacts.outDir ?? localOut.outDir)}</code></p>
  <div class="grid two">
    <div class="card">
      <h3>프로필 및 경로 점검기</h3>
      <p>채널 프로필: <strong>${esc(opsView.channelProfileId ?? "-")}</strong></p>
      <p>마스코트 프로필: <strong>${esc(opsView.mascotProfileId ?? "-")}</strong></p>
      <p>스튜디오 프로필: <strong>${esc(opsView.studioProfileId ?? "-")}</strong></p>
      <p>경로 사유: <strong>${esc(opsView.routeSummary)}</strong></p>
      <p>비주얼 오브젝트: <strong>${esc(opsView.visualSummary)}</strong></p>
      <p>렌더 모드: <strong>${esc(opsView.renderModeSummary)}</strong></p>
      <p><a href="${episodeProfilesHref}">일치하는 프로필 브라우저 보기</a></p>
    </div>
    <div class="card">
      <h3>승인 / QC 사유</h3>
      <p>선택된 백엔드: <strong>${esc(opsView.backendSummary)}</strong></p>
      <p>승인 상태: <strong>${esc(opsView.acceptanceSummary)}</strong></p>
      <p>복구 신호: <strong>${esc(opsView.repairSummary)}</strong></p>
      <p>QC 사유: <strong>${esc(opsView.qcSummary)}</strong></p>
      <p>폴백 체인: <strong>${esc(episodeFallbackSummary || "-")}</strong></p>
      <p><a href="${opsWorkbenchHref}">Ops 워크벤치 열기</a></p>
    </div>
  </div>
	  <div class="card">
	    <h3>에피소드 산출물 점검기</h3>
	    <p class="notice">경로/백엔드/승인 메타데이터의 원문 확인이 필요할 때만 이 드로어를 여세요.</p>
	    <details><summary>원시 운영 산출물 열기</summary><div class="actions" style="margin-top:10px">${opsArtifactLinks || '<span class="notice">에피소드 로컬 운영 산출물이 아직 없습니다.</span>'}</div></details>
	  </div>
  <div class="card">
    <h3>샷별 운영 신호</h3>
    <table>
      <thead><tr><th>샷</th><th>타입</th><th>route_reason</th><th>백엔드</th><th>승인</th><th>비주얼 오브젝트</th><th>폴백 / 차단 요인</th><th>qc / 복구</th></tr></thead>
      <tbody>${opsShotRows || '<tr><td colspan="8"><div class="notice">shots.json/runtime_shots.json에 아직 route 또는 sidecar 메타데이터가 없습니다.</div></td></tr>'}</tbody>
    </table>
  </div>
  <div class="grid two">
    <div class="card">
      <h3>문서</h3>
      <p>beats.json: <span class="badge ${artifacts.beatsFileExists ? "ok" : "bad"}">${artifacts.beatsFileExists ? "있음" : "없음"}</span></p>
      <p>shots.json: <span class="badge ${artifacts.shotsFileExists ? "ok" : "bad"}">${artifacts.shotsFileExists ? "있음" : "없음"}</span></p>
      <p>qc_report.json: <span class="badge ${qcExists ? "ok" : "bad"}">${qcExists ? "있음" : "없음"}</span></p>
      <p>STYLE_QC(main): 실패=${styleQcMain.failCount} 경고=${styleQcMain.warnCount} 강제=${esc(styleQcMain.forcedStyle)}</p>
    </div>
    <div class="card">
      <h3>렌더 출력</h3>
      <p>preview.mp4: <span class="badge ${previewExists ? "ok" : "bad"}">${previewExists ? "있음" : "없음"}</span></p>
      <p>preview_A.mp4: <span class="badge ${previewAExists ? "ok" : "bad"}">${previewAExists ? "있음" : "없음"}</span></p>
      <p>preview_B.mp4: <span class="badge ${previewBExists ? "ok" : "bad"}">${previewBExists ? "있음" : "없음"}</span></p>
      <p>final.mp4: <span class="badge ${finalExists ? "ok" : "bad"}">${finalExists ? "있음" : "없음"}</span></p>
      <p>upload_manifest.json: <span class="badge ${uploadManifestExists ? "ok" : "bad"}">${uploadManifestExists ? "있음" : "없음"}</span></p>
    </div>
  </div>
  <div class="card decision-jump-target" id="episode-run-control">
    <div class="section-head"><div><h3>실행 제어</h3><p class="section-intro">기본 실행 경로와 실시간 작업 레일을 에피소드 오브젝트에 붙여 둡니다.</p></div><div class="quick-links"><a href="/ui/jobs">작업 모니터</a><a href="/ui/publish?episodeId=${encodeURIComponent(
      id
    )}">퍼블리시 화면</a></div></div>
    <div class="notice"><strong>${esc(recommendAction.title)}</strong><br/>${esc(recommendAction.detail)}<br/>권장 프로필: <strong>${esc(runProfileUiLabel(recommendAction.profile))}</strong></div>
    <form method="post" action="/ui/episodes/${esc(id)}/run-profile" class="grid two">
      <label>실행 프로필
        <select name="profile">${runProfileOptions}</select>
      </label>
      <label>스타일 프리셋
        <select name="stylePresetId">${styleOptions}</select>
      </label>
      <label>hookBoost(0~1)
        <input type="range" name="hookBoost" min="0" max="1" step="0.05" value="${esc(style.hookBoost.toFixed(2))}" oninput="this.nextElementSibling.value=this.value"/>
        <output>${esc(style.hookBoost.toFixed(2))}</output>
      </label>
      <input type="hidden" name="redirectTarget" value="episode"/>
      ${episodeActionHidden}
      <div class="actions" style="grid-column:1/-1">
        <button type="submit" data-primary-action="1" data-primary-label="권장 에피소드 프로필 실행">실행 프로필 (권장)</button>
        <a href="/ui/jobs" class="secondary" style="padding:7px 9px;border-radius:8px;border:1px solid #cad8f2">작업 모니터 열기</a>
        <a href="/ui/episodes/${esc(id)}/editor" class="secondary" style="padding:7px 9px;border-radius:8px;border:1px solid #cad8f2">샷 에디터 열기</a>
      </div>
    </form>
    <p class="notice">프로필 메모: preview = 빠른 프리뷰, full = 최종 렌더 + 패키지, render_only = 현재 샷 기준 프리뷰 렌더입니다.</p>
    <div id="run-profile-live" data-episode-id="${esc(id)}" class="notice">최신 실행 상태를 불러오는 중...</div>
    <table><thead><tr><th>최근 작업 타입</th><th>상태</th><th>진행률</th><th>작업</th></tr></thead><tbody>${runStateRows || '<tr><td colspan="4"><div class="notice">작업 히스토리가 없습니다. 위의 실행 프로필에서 시작하세요.</div></td></tr>'}</tbody></table>
  </div>
  <div class="card decision-jump-target" id="episode-compare-review">
    <div class="section-head"><div><h3>비교 / 검토</h3><p class="section-intro">명시적인 비교 대상과 대체 검토 경로를 상세 화면 안에 유지합니다.</p></div><div class="quick-links"><a href="${episodeCompareHref}">A/B 비교 열기</a><a href="${episodeProfilesHref}">프로필 브라우저 포커스</a></div></div>
    <form method="post" action="/ui/episodes/${esc(id)}/style-preview" class="grid two">
      <label>스타일 프리셋<select name="stylePresetId">${styleOptions}</select></label>
      <label>hookBoost(0~1)<input type="range" name="hookBoost" min="0" max="1" step="0.05" value="${esc(style.hookBoost.toFixed(2))}" oninput="this.nextElementSibling.value=this.value"/><output>${esc(style.hookBoost.toFixed(2))}</output></label>
      ${episodeActionHidden}
      <div class="actions" style="grid-column:1/-1"><button type="submit">스타일 프리뷰 실행 (~10초)</button></div>
    </form>
    <form method="post" action="/ui/episodes/${esc(id)}/ab-preview" class="grid two">
      <label>변형 A 스타일<select name="styleA">${concreteStyleOptionsA}</select></label>
      <label>변형 B 스타일<select name="styleB">${concreteStyleOptionsB}</select></label>
      ${episodeActionHidden}
      <div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">A/B 프리뷰 비교 생성</button><a href="${episodeCompareHref}">A/B 비교 페이지</a></div>
    </form>
    <p>A STYLE_QC: 실패=${styleQcA.failCount} 경고=${styleQcA.warnCount} 강제=${esc(styleQcA.forcedStyle)} | B STYLE_QC: 실패=${styleQcB.failCount} 경고=${styleQcB.warnCount} 강제=${esc(styleQcB.forcedStyle)}</p>
  </div>
  <div class="card">
    <div class="section-head"><div><h3>수동 단계 레일</h3><p class="section-intro">수동 파이프라인 단계도 유지하되, 권장 실행 경로보다 명시적으로 뒤에 둡니다.</p></div></div>
  <div class="actions">
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="GENERATE_BEATS"/><input type="hidden" name="pipelineMode" value="preview"/>${styleHidden}${episodeActionHidden}<button type="submit">원클릭 프리뷰 렌더 시작</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="GENERATE_BEATS"/><input type="hidden" name="pipelineMode" value="full"/>${styleHidden}${episodeActionHidden}<button type="submit" class="secondary">최종 + 패키지 실행</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="COMPILE_SHOTS"/>${styleHidden}${episodeActionHidden}<button type="submit" class="secondary">COMPILE_SHOTS 실행</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="RENDER_PREVIEW"/>${styleHidden}${episodeActionHidden}<button type="submit" class="secondary">프리뷰 렌더 실행</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><select name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option><option value="RENDER_FINAL">RENDER_FINAL</option><option value="PACKAGE_OUTPUTS">PACKAGE_OUTPUTS</option></select>${styleHidden}${episodeActionHidden}<button type="submit" class="secondary">선택한 단계 실행</button></form>
  </div>
  </div>
</section>
<section class="card">
  <div class="section-head"><div><h2>검토 산출물</h2><p class="section-intro">프리뷰와 변형 산출물은 운영 판단을 돕는 보조 근거입니다.</p></div></div>
  ${previewExists ? `<video controls preload="metadata" style="width:100%;max-width:960px;background:#000;border-radius:8px" src="${previewUrl}"></video><p><a href="${previewUrl}">preview.mp4 열기</a></p>` : '<div class="error">preview.mp4가 아직 생성되지 않았습니다. 위 버튼으로 프리뷰 렌더를 시작하세요.</div>'}
  ${(previewAExists || previewBExists) ? `<p>${previewAExists ? `<a href="${previewAUrl}">preview_A.mp4 열기</a>` : "preview_A 없음"} | ${previewBExists ? `<a href="${previewBUrl}">preview_B.mp4 열기</a>` : "preview_B 없음"}</p>` : ""}
</section>
<section class="card decision-jump-target" id="episode-raw-qc">
  <div class="section-head"><div><h2>QC 리포트</h2><p class="section-intro">원시 디버그 데이터는 접을 수 있지만, 위의 판단 요약이 항상 우선입니다.</p></div></div>
  ${qcExists ? (qcIssues.length > 0 ? `<table><thead><tr><th>#</th><th>점검</th><th>심각도</th><th>메시지</th><th>상세</th></tr></thead><tbody>${qcIssueRows}</tbody></table><details style="margin-top:12px"><summary>원시 qc_report.json</summary><pre>${esc(JSON.stringify(qcReport, null, 2))}</pre></details>` : `<div class="notice">qc_report.json이 존재하며 실패 이슈가 없습니다.</div><details style="margin-top:12px"><summary>원시 qc_report.json</summary><pre>${esc(JSON.stringify(qcReport, null, 2))}</pre></details>`) : '<div class="error">qc_report.json이 아직 없습니다.</div>'}
</section>
<section class="card">
  <div class="section-head"><div><h2>작업 레일</h2><p class="section-intro">빠른 재시도와 검토를 위해 최근 작업 히스토리를 에피소드 오브젝트에 계속 붙여 둡니다.</p></div></div>
  <div aria-live="polite" class="notice">아래 표에서 작업 상태가 갱신됩니다. 실패 시 재시도를 사용하세요.</div>
  <table><thead><tr><th>작업</th><th>타입</th><th>상태</th><th>진행률</th><th>시도 횟수</th><th>백오프</th><th>생성 시각</th></tr></thead><tbody>${rows || '<tr><td colspan="7"><div class="notice">작업 히스토리가 없습니다. 위의 큐 등록 액션으로 시작하세요.</div></td></tr>'}</tbody></table>
  </section></div>`;

    return reply.type("text/html; charset=utf-8").send(page(`에피소드 ${id}`, episodeBody));
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
    const decisionState = readDecisionLinkState(request.query);
    const workbenchFocusValue = decisionToken(decisionState.focus);
    const workbenchSelectedTokens = decisionTokenSet(decisionState.selected);
    const workbenchPinnedTokens = decisionTokenSet(decisionState.pinned);
    const editorStateHidden = renderDecisionStateHiddenInputs(decisionState);
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
    let initialWorkbenchObjectKey: string | null = null;
    let initialWorkbenchJumpId: string | null = null;
    shotsDoc.shots.forEach((raw, index) => {
      if (!isRecord(raw)) return;
      const shotId = typeof raw.shot_id === "string" ? raw.shot_id : `shot_${index + 1}`;
      const startFrame = typeof raw.start_frame === "number" ? raw.start_frame : 0;
      const durationFrames = typeof raw.duration_frames === "number" ? raw.duration_frames : 0;
      const transition = typeof raw.transition === "string" ? raw.transition : "cut";
      const keyframes = isRecord(raw.camera) && Array.isArray(raw.camera.keyframes) ? raw.camera.keyframes.length : 0;
      const objectKey = `shot:${shotId}`;
      const objectLabel = `Shot ${index + 1}: ${shotId}`;
      const rowId = buildDecisionAnchorId("editor-shot", shotId);
      const isJumpTarget =
        workbenchFocusValue === decisionToken(shotId) ||
        workbenchFocusValue === decisionToken(objectKey) ||
        decisionSetHas(workbenchSelectedTokens, shotId, objectKey) ||
        decisionSetHas(workbenchPinnedTokens, shotId, objectKey);
      if (isJumpTarget && !initialWorkbenchObjectKey) {
        initialWorkbenchObjectKey = objectKey;
        initialWorkbenchJumpId = rowId;
      }
      shotRows.push(`<tr id="${rowId}" class="editor-shot-row${isJumpTarget ? " is-selected" : ""}" data-editor-object="${esc(objectKey)}" data-editor-label="${esc(objectLabel)}" tabindex="0" role="button" aria-label="Select shot ${index + 1}: ${esc(shotId)}"><td>${index + 1}</td><td><code>${esc(shotId)}</code></td><td>${startFrame}</td><td>${durationFrames}</td><td>${esc(transition)}</td><td>${keyframes}</td><td><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="move"/><input type="hidden" name="index" value="${index}"/><input type="hidden" name="delta" value="-1"/>${editorStateHidden}<button type="submit" class="secondary">Move up</button></form><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="move"/><input type="hidden" name="index" value="${index}"/><input type="hidden" name="delta" value="1"/>${editorStateHidden}<button type="submit" class="secondary">Move down</button></form></td><td><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="tweak"/><input type="hidden" name="shotId" value="${esc(shotId)}"/>${editorStateHidden}<label>zoom<input name="zoomMult" value="1.00" style="width:64px"/></label><label>panX<input name="panXDelta" value="0.00" style="width:64px"/></label><label>transition<input name="transitionStrength" value="0.50" style="width:64px"/></label><button type="submit">Apply tweak</button></form></td></tr>`);
      if (stageShotObjects.length < 8) {
        stageShotObjects.push(`<button type="button" class="editor-object editor-object-shot${isJumpTarget ? " active" : ""}" data-editor-object="${esc(objectKey)}" data-editor-label="${esc(objectLabel)}"><span>Shot ${index + 1}</span><small>${esc(shotId)}</small></button>`);
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
	    const currentEditorHref = uiHref(`/ui/episodes/${encodeURIComponent(id)}/editor`, {
	      params: decisionStateParams(decisionState),
	      hash: initialWorkbenchJumpId ?? "editor-shell"
	    });
	    const editorActionHidden = `${editorStateHidden}<input type="hidden" name="redirectPath" value="${esc(currentEditorHref)}"/>`;
	    const editorBenchmarksHref = uiHref("/ui/benchmarks", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentEditorHref
	      },
	      hash: "benchmark-regressions"
	    });
	    const editorRolloutsHref = uiHref("/ui/rollouts", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentEditorHref
	      },
	      hash: "rollout-signal-table"
	    });
	    const compareHref = uiHref(`/ui/episodes/${encodeURIComponent(id)}/ab-compare`, {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentEditorHref
	      },
	      hash: "episode-ab-compare-shell"
	    });
	    const episodeDetailHref = uiHref(`/ui/episodes/${encodeURIComponent(id)}`, {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentEditorHref
	      },
	      hash: decisionState.focus && decisionToken(decisionState.focus).includes("run") ? "episode-run-control" : "episode-context"
	    });
	    const workbenchReturnHref = decisionState.returnTo ?? episodeDetailHref;
	    const workbenchReturnLabel = decisionState.returnTo
	      ? decisionState.returnTo.includes("/ab-compare") || decisionState.returnTo.includes("/candidates")
	        ? "Reopen Compare"
	        : "Back to list"
	      : "Episode Detail";
	    const shotCount = shotsDoc.shots.length;
	    const workbenchProfileSummary =
	      summarizeValues([opsView.channelProfileId, opsView.mascotProfileId, opsView.studioProfileId], 3) || "profile unresolved";
	    const workbenchRenderPathSummary =
	      compact(
	        [
	          opsView.routeSummary !== "-" ? `route ${opsView.routeSummary}` : null,
	          opsView.renderModeSummary !== "-" ? `render ${opsView.renderModeSummary}` : null,
	          opsView.backendSummary !== "-" ? `backend ${opsView.backendSummary}` : null
	        ],
	        " | "
	      ) || "route / render path unavailable";
	    const workbenchTone: UiBadgeTone =
	      shotCount === 0
	        ? "bad"
        : opsView.fallbackSteps.length > 0 || opsView.repairSummary !== "-" || opsView.qcSummary !== "-" || opsView.renderModeSummary.includes("mismatched")
          ? "warn"
          : "ok";
    const workbenchStatusLabel =
      shotCount === 0 ? "graph missing" : workbenchTone === "warn" ? "compare before promote" : "workbench ready";
	    const workbenchSummaryCards: DecisionStat[] = [
	      { label: "Shots", value: String(shotCount), hint: "timeline rows currently loaded", tone: shotCount > 0 ? "ok" : "bad" },
	      {
	        label: "History",
        value: `${history.pointer + 1}/${history.states.length}`,
        hint: history.states[history.pointer]?.reason ?? "active history checkpoint",
        tone: history.states.length > 1 ? "warn" : "muted"
      },
	      {
	        label: "Rollback Anchor",
	        value: snapshots[0] ?? `history ${history.pointer + 1}/${history.states.length}`,
	        hint: snapshots.length > 0 ? "latest snapshot file" : "save a snapshot before rerender",
	        tone: snapshots.length > 0 ? "ok" : "warn"
	      },
	      {
	        label: "Render Path / Review",
	        value: workbenchRenderPathSummary,
	        hint: compact(
	          [
	            workbenchProfileSummary !== "profile unresolved" ? workbenchProfileSummary : null,
	            summarizeValues([opsView.qcSummary, opsView.repairSummary, opsView.renderModeSummary.includes("mismatched") ? "render drift" : null], 3)
	          ],
	          " | "
	        ),
	        tone: workbenchTone
	      }
	    ];
    const workbenchBlockers: DecisionCard[] = [];
    if (shotCount === 0) {
      workbenchBlockers.push({
        title: "Timeline graph missing",
        detail: "shots.json is not loaded, so rollback, compare, and rerender decisions should stop until COMPILE_SHOTS succeeds.",
        tone: "bad",
        badge: "blocked"
      });
    }
    if (opsView.fallbackSteps.length > 0) {
      workbenchBlockers.push({
        title: "Fallback chain detected",
        detail: opsView.fallbackSteps.map((step) => humanizeOpsLabel(step)).join(", "),
        tone: "warn",
        badge: "fallback"
      });
    }
    if (opsView.qcSummary !== "-" || opsView.repairSummary !== "-") {
      workbenchBlockers.push({
        title: "QC or repair baggage",
        detail: compact([opsView.qcSummary !== "-" ? opsView.qcSummary : null, opsView.repairSummary !== "-" ? opsView.repairSummary : null], " | "),
        tone: "warn",
        badge: "review"
      });
    }
    const workbenchPrimaryActions: DecisionCard[] = [
      {
        title: "Snapshot before rerender",
        detail: "Save a rollback snapshot before changing order, tweaking shots, or rerendering the episode.",
        tone: "ok",
        badge: "snapshot",
        html: `<form method="post" action="/ui/episodes/${encodeURIComponent(id)}/editor" class="inline"><input type="hidden" name="op" value="snapshot"/>${editorStateHidden}<button type="submit">Save snapshot</button></form><form method="post" action="/ui/episodes/${encodeURIComponent(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="RENDER_PREVIEW"/>${editorActionHidden}<button type="submit" class="secondary">Run preview render</button></form>`
      }
    ];
    const workbenchSecondaryActions: DecisionCard[] = [
      {
        title: "Compare before promote",
        detail: "Open A/B compare or episode detail after snapshotting. Do not treat workbench edits as promotable until compare surfaces stay clean.",
        tone: "warn",
        badge: "compare",
        html: `<a href="${compareHref}">A/B Compare</a><a href="${episodeDetailHref}">Episode Detail</a>`
      },
      {
        title: "Linked review objects",
        detail: "Keep routing, profiles, and benchmark context adjacent to the workbench instead of dropping straight to raw artifacts.",
        tone: "muted",
        badge: "objects",
        html: `<a href="${editorProfilesHref}">Profile Browser</a><a href="${editorBenchmarksHref}">Benchmarks</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(id)}">Artifacts</a>`
      }
    ];
    const workbenchRecoveryActions: DecisionCard[] = [
      {
        title: "Rollback anchor",
        detail: snapshots.length > 0 ? `Use ${snapshots[0]} as the nearest rollback file, then compare against the episode detail before rerender.` : "No snapshot files exist yet. Save one before making more workbench changes.",
        tone: snapshots.length > 0 ? "ok" : "warn",
        badge: "rollback",
        html: `<a href="#editor-snapshots">Rollback snapshots</a><a href="${episodeDetailHref}">Episode Detail</a>`
      }
    ];
    const workbenchRecentActivity: DecisionCard[] = history.states
      .slice(Math.max(0, history.pointer - 2), history.pointer + 1)
      .reverse()
      .map((state, index) => ({
        title: index === 0 ? "active checkpoint" : "history checkpoint",
        detail: `${state.reason} @ ${fmtDate(state.saved_at)}`,
        tone: index === 0 ? workbenchTone : ("muted" as UiBadgeTone),
        badge: index === 0 ? "current" : "history"
      }));
	    const workbenchLinkedObjects: DecisionCard[] = [
	      {
	        title: "Episode detail",
	        detail: "Promotion, rollback decision, and last-good state stay anchored in the episode detail surface.",
        tone: "muted",
        badge: "episode",
        html: `<a href="${episodeDetailHref}">Episode Detail</a>`
      },
	      {
	        title: "Profile browser",
	        detail: workbenchProfileSummary === "profile unresolved" ? editorOpsOverview || "linked runtime profile view" : workbenchProfileSummary,
	        tone: "muted",
	        badge: "profiles",
	        html: `<a href="${editorProfilesHref}">Profile Browser</a>`
	      },
	      {
	        title: "Render path summary",
	        detail: workbenchRenderPathSummary,
	        tone: opsView.renderModeSummary.includes("mismatched") ? "warn" : "muted",
	        badge: "render path",
	        html: `<a href="${compareHref}">A/B Compare</a><a href="${editorBenchmarksHref}">Benchmarks</a>`
	      }
	    ];
    const workbenchDecisionRail: DecisionCard[] = [
      {
        title: "Snapshot first",
        detail: "Every rerender or timeline tweak should start with a saved snapshot so rollback remains explicit.",
        tone: "ok",
        badge: "snapshot",
        html: `<a href="#editor-snapshots">Rollback snapshots</a>`
      },
      {
        title: "Compare before promote",
        detail: "Use A/B compare or episode detail after editing. The workbench is not the final promotion surface.",
        tone: "warn",
        badge: "compare",
        html: `<a href="${compareHref}">A/B Compare</a><a href="${episodeDetailHref}">Episode Detail</a>`
      },
      {
        title: "Rollback anchor",
        detail: snapshots.length > 0 ? `Latest snapshot ${snapshots[0]} is the current rollback file.` : "Save the first snapshot before taking further workbench actions.",
        tone: snapshots.length > 0 ? "ok" : "warn",
        badge: "rollback",
        html: `<a href="#editor-snapshots">Snapshots</a>`
      }
    ];
	    const workbenchSnapshotFacts: DecisionFact[] = [
	      { label: "Failure Reason", value: shotCount === 0 ? "shots missing" : compact([opsView.qcSummary !== "-" ? opsView.qcSummary : null, opsView.repairSummary !== "-" ? opsView.repairSummary : null], " | ") || "none", hint: "top workbench blocker" },
	      { label: "Last Known Good", value: snapshots[0] ?? history.states[history.pointer]?.reason ?? "none", hint: "nearest checkpoint or snapshot" },
      { label: "Fallback Applied", value: opsView.fallbackSteps.length > 0 ? opsView.fallbackSteps.map((step) => humanizeOpsLabel(step)).join(", ") : "none", hint: "current fallback chain" },
      { label: "Retry Path", value: shotCount === 0 ? "compile shots first" : "save snapshot -> rerender preview", hint: "safe rerender order" },
	      { label: "Alternate Path", value: "episode detail / A-B compare / profile browser", hint: "adjacent decision surfaces" },
	      { label: "Rollback Point", value: snapshots[0] ?? `history ${history.pointer + 1}/${history.states.length}`, hint: "explicit workbench rollback anchor" }
	    ];
	    const workbenchEvidenceFacts: DecisionFact[] = [
	      { label: "Current Profiles", value: workbenchProfileSummary, hint: "runtime profile context kept adjacent" },
	      { label: "Render Path", value: workbenchRenderPathSummary, hint: "route / render mode / backend summary" },
	      { label: "Last Good", value: snapshots[0] ?? history.states[history.pointer]?.reason ?? "none", hint: "nearest checkpoint" },
	      { label: "Rollback Point", value: snapshots[0] ?? `history ${history.pointer + 1}/${history.states.length}`, hint: "explicit workbench rollback file or checkpoint" }
	    ];
	    const workbenchEvidenceDrawerBody = `<div class="decision-copy">This workbench stays ops-aware by keeping snapshots, compare surfaces, and runtime metadata above the interactive canvas. Raw artifacts are not the default starting point.</div>
	<div class="quick-links"><a href="#editor-snapshots">Rollback snapshots</a><a href="${compareHref}">A/B Compare</a><a href="${episodeDetailHref}">Episode Detail</a></div>
	<details class="decision-drawer"><summary>Open workbench evidence order</summary><div class="decision-drawer-body"><div class="decision-copy">Snapshot -> rerender preview -> episode detail or A/B compare -> profile browser. Use benchmark or rollout objects only when the workbench still cannot explain the route or acceptance drift.</div><div class="quick-links"><a href="${editorProfilesHref}">Profile Browser</a><a href="${editorBenchmarksHref}">Benchmarks</a><a href="${editorRolloutsHref}">Rollouts</a></div></div></details>`;
	    const workbenchJumpFacts: DecisionFact[] = [
	      ...(decisionState.focus
	        ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "jumped object or section from the previous surface" }]
	        : []),
	      ...(decisionState.selected.length > 0
	        ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected objects preserved in URL state` }]
	        : []),
	      ...(decisionState.compare.length > 0
	        ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare handoff preserved for reopen flows" }]
	        : []),
	      ...(decisionState.view
	        ? [{ label: "View", value: humanizeOpsLabel(decisionState.view), hint: "view mode retained across handoff" }]
	        : [])
	    ];
	    const workbenchJumpBanner = renderDecisionJumpBanner({
	      title: "Deep-link handoff",
	      intro: "Selected shots, compare context, and the return path stay visible so the workbench reads as the next step in the same review flow.",
	      facts: workbenchJumpFacts,
	      linksHtml: `<a href="${workbenchReturnHref}">${workbenchReturnLabel}</a><a href="${episodeDetailHref}">Episode Detail</a><a href="${compareHref}">A/B Compare</a>`,
	      tone: workbenchTone
	    });

	    const body = `${decisionSurfaceStyles()}<div class="decision-surface">${renderObjectHero({
      eyebrow: "Episode Ops Workbench",
      title: "Ops Workbench",
      subtitle: "Use the workbench to inspect shot-level routing and stage timeline edits, but compare before promote and keep rollback anchors explicit.",
      statusLabel: workbenchStatusLabel,
      statusTone: workbenchTone,
      flash: `${flashHtml(request.query)}${workbenchJumpBanner}`,
      headerContextHtml: `<span class="muted-text">episode <span class="decision-code">${esc(id)}</span></span><span class="muted-text">history <span class="decision-code">${history.pointer + 1}/${history.states.length}</span></span>`,
      quickLinksHtml: `<a href="${workbenchReturnHref}">${workbenchReturnLabel}</a><a href="${episodeDetailHref}">Episode Detail</a><a href="${compareHref}">A/B Compare</a><a href="${editorProfilesHref}">Profile Browser</a>`,
      summaryCards: workbenchSummaryCards,
	      metaItems: [
	        { label: "Episode", value: id, hint: "workbench owner object" },
	        { label: "Shots", value: String(shotCount), hint: "timeline rows in memory" },
	        { label: "Current Profiles", value: workbenchProfileSummary, hint: "runtime profile set" },
	        { label: "Rollback Point", value: snapshots[0] ?? `history ${history.pointer + 1}/${history.states.length}`, hint: editorOpsOverview || "route / backend / acceptance overview" }
	      ],
      blockers: workbenchBlockers,
      primaryActions: workbenchPrimaryActions,
      secondaryActions: workbenchSecondaryActions,
      recoveryActions: workbenchRecoveryActions,
      recentActivity: workbenchRecentActivity,
      linkedObjects: workbenchLinkedObjects
    })}${renderDecisionPrioritySection({
      sectionId: "editor-decision-rail",
      title: "Decision Rail",
      intro: "Snapshot, compare-before-promote, and rollback rules stay above the interactive editor canvas.",
      linksHtml: `<a href="${episodeDetailHref}">Episode Detail</a><a href="${compareHref}">A/B Compare</a><a href="${editorProfilesHref}">Profile Browser</a>`,
      railTitle: "Workbench actions",
      railIntro: "Treat this as an ops-aware workbench: snapshot before edits, compare before promote, and keep the rollback file visible.",
      railCards: workbenchDecisionRail,
      railEmpty: "No workbench actions are available.",
      railTone: workbenchTone,
      snapshotIntro: "Failure reason, last checkpoint, rerender path, and rollback point stay above the editor stage.",
	      snapshotFacts: workbenchSnapshotFacts,
	      snapshotEmpty: "No workbench recovery snapshot is available.",
	      snapshotTone: workbenchTone
	    })}${renderRecoveryRailSection({
	      sectionId: "editor-recovery-rail",
	      title: "Recovery / Linked Objects",
	      intro: "Keep the rollback path and adjacent decision objects visible before diving into the workbench canvas.",
	      linksHtml: `<a href="${episodeDetailHref}">Episode Detail</a><a href="${compareHref}">A/B Compare</a><a href="${editorProfilesHref}">Profile Browser</a>`,
	      recoveryTitle: "Workbench recovery rail",
	      recoveryIntro: "Snapshot first, then rerender, then compare. The workbench is not the final promotion surface.",
	      recoveryCards: workbenchRecoveryActions,
	      recoveryEmpty: "No workbench recovery actions are available.",
	      recoveryTone: workbenchRecoveryActions[0]?.tone ? decisionTone(workbenchRecoveryActions[0].tone) : workbenchTone,
	      linkedTitle: "Linked object rail",
	      linkedIntro: "Keep profile context, render path, and owner objects adjacent to the workbench.",
	      linkedCards: workbenchLinkedObjects,
	      linkedEmpty: "No linked workbench objects are available.",
	      linkedTone: workbenchLinkedObjects[1]?.tone ? decisionTone(workbenchLinkedObjects[1].tone) : "muted"
	    })}${renderArtifactEvidenceSection({
	      sectionId: "editor-evidence",
	      title: "Artifact Evidence Drawer",
	      intro: "Runtime metadata and rollback anchors stay readable here; deeper evidence is pushed behind the drawer.",
	      linksHtml: `<a href="#editor-snapshots">Rollback snapshots</a><a href="${editorBenchmarksHref}">Benchmarks</a><a href="${editorRolloutsHref}">Rollouts</a>`,
	      summaryTitle: "Workbench evidence summary",
	      summaryIntro: "Current profiles, render path, and rollback anchor stay above the canvas.",
	      summaryFacts: workbenchEvidenceFacts,
	      summaryEmpty: "No workbench evidence summary is available.",
	      summaryTone: workbenchTone,
	      drawerTitle: "Workbench evidence drawer",
	      drawerIntro: "Use the workbench evidence order before reaching for downstream artifact detail.",
	      drawerSummary: "Open workbench evidence order and raw-evidence policy",
	      drawerBodyHtml: workbenchEvidenceDrawerBody,
	      drawerTone: "muted",
	      drawerOpen: ["evidence", "artifact", "raw"].includes(workbenchFocusValue) || decisionToken(decisionState.view) === "evidence"
	    })}<section class="card editor-shell" id="editor-shell">
<style>
.editor-shell{padding:14px;display:grid;gap:12px}
.editor-topbar{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
.editor-topbar h1{margin:0 0 4px}
.editor-topbar p{margin:0;color:#425466;font-size:13px}
.editor-top-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.editor-reading-order{display:grid;gap:4px;padding:10px 12px;border:1px dashed #c7d7e6;border-radius:14px;background:#f8fbff}
.editor-reading-order strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#365063}
.editor-layout{display:grid;grid-template-columns:minmax(220px,.92fr) minmax(0,1.2fr) minmax(240px,.95fr);gap:12px;align-items:start}
.editor-shell.editor-left-collapsed .editor-layout{grid-template-columns:minmax(0,1fr) 280px}
.editor-shell.editor-left-collapsed .editor-left{display:none}
.editor-left,.editor-center,.editor-right,.editor-bottom{border:1px solid #dbe6f1;border-radius:12px;background:#fff}
.editor-left,.editor-right,.editor-bottom{padding:12px;display:grid;gap:10px;align-content:start}
.editor-center{padding:12px;display:grid;gap:12px;min-width:0}
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
.editor-stage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
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
@media (max-width:1280px){.editor-layout{grid-template-columns:minmax(210px,.85fr) minmax(0,1fr) minmax(220px,.9fr)}}
@media (max-width:1100px){.editor-layout{grid-template-columns:1fr}.editor-shell.editor-left-collapsed .editor-layout{grid-template-columns:1fr}.editor-center{order:-1}}
@media (max-width:640px){.editor-shell,.editor-left,.editor-center,.editor-right,.editor-bottom{padding:10px}.editor-top-actions{gap:6px}.editor-stage-grid{grid-template-columns:1fr}}
</style>
<div class="editor-topbar">
  <div>
    <h1>Episode Ops Workbench</h1>
    <p>episodeId: <a href="${episodeDetailHref}">${esc(id)}</a> | history: ${history.pointer + 1} / ${history.states.length} | rollback snapshots: ${snapshots.length}</p>
  </div>
  <div class="editor-top-actions">
    <form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="undo"/>${editorStateHidden}<button type="submit" ${history.pointer <= 0 ? "disabled" : ""}>Undo</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="redo"/>${editorStateHidden}<button type="submit" ${history.pointer >= history.states.length - 1 ? "disabled" : ""}>Redo</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="snapshot"/>${editorStateHidden}<button type="submit" class="secondary" data-primary-action="1" data-primary-label="Save shot editor snapshot">Save snapshot</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="RENDER_PREVIEW"/>${editorActionHidden}<button type="submit" class="secondary">Run preview render</button></form>
    <button type="button" class="secondary" id="editor-left-toggle" aria-expanded="true">Collapse Left Panel</button>
  </div>
</div>
<div class="notice">Shortcut: <strong>r</strong> runs the primary action. Snapshot before rerender, then compare in the episode detail or A/B surface before promote.</div>
${editorOpsOverview ? `<div class="notice">Ops context: ${esc(editorOpsOverview)}</div>` : ""}
<div class="editor-reading-order" role="note" aria-label="Workbench reading order"><strong>Reading order</strong><span class="muted-text">Use the decision and recovery rails first, then the center stage, then the inspector, and keep snapshots as the rollback anchor at the bottom.</span></div>
<div class="editor-layout">
  <aside class="editor-left" aria-labelledby="editor-assets-title">
    <h2 id="editor-assets-title">Workbench Assets</h2>
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
  <section class="editor-center decision-jump-target" id="editor-stage" aria-labelledby="editor-stage-title">
    <h2 id="editor-stage-title">Workbench Stage</h2>
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
    <div class="editor-table-wrap decision-jump-target" id="editor-timeline">
      <table>
        <thead><tr><th>#</th><th>shot_id</th><th>start</th><th>duration</th><th>transition</th><th>camera keys</th><th>order</th><th>override</th></tr></thead>
        <tbody>${shots || '<tr><td colspan="8"><div class="notice">No timeline rows yet.</div></td></tr>'}</tbody>
      </table>
    </div>
  </section>
  <aside class="editor-right decision-jump-target" id="editor-inspector" aria-labelledby="editor-inspector-title">
    <h2 id="editor-inspector-title">Ops Inspector</h2>
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
    <div class="quick-links"><a href="${editorProfilesHref}">Open matching profile browser view</a><a href="${editorBenchmarksHref}">Benchmarks</a></div>
  </aside>
</div>
<section class="editor-bottom" id="editor-snapshots" aria-labelledby="editor-snapshots-title">
  <div>
    <h2 id="editor-snapshots-title">Rollback snapshots</h2>
    <p>Recent snapshots stay linked for quick rollback and compare-before-promote review.</p>
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
  const initialObjectKey = ${JSON.stringify(initialWorkbenchObjectKey)};
  const initialJumpTargetId = ${JSON.stringify(initialWorkbenchJumpId)};
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
  const initialNode = Array.from(shell.querySelectorAll('[data-editor-object]')).find((node) => {
    return node instanceof HTMLElement && initialObjectKey && node.dataset.editorObject === initialObjectKey;
  });
  const firstShot = initialNode instanceof HTMLElement ? initialNode : shell.querySelector('.editor-shot-row[data-editor-object]');
  if (firstShot instanceof HTMLElement) {
    const key = firstShot.dataset.editorObject || '';
    if (key) {
      selectObject(key, firstShot.dataset.editorLabel || key);
    }
  }
  const jumpTargetId = initialJumpTargetId || (window.location.hash ? window.location.hash.slice(1) : '');
  if (jumpTargetId) {
    const jumpTarget = document.getElementById(jumpTargetId);
    if (jumpTarget instanceof HTMLElement) {
      requestAnimationFrame(() => {
        jumpTarget.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    }
  }
})();
</script></div>${renderDecisionJumpScript()}`;
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
    const decisionState = readDecisionLinkState(body);
    const editorRedirect = (params: Record<string, UiHrefValue>) =>
      uiHref(`/ui/episodes/${encodeURIComponent(id)}/editor`, {
        params: {
          ...decisionStateParams(decisionState),
          ...params
        },
        hash: decisionState.focus && decisionToken(decisionState.focus).includes("shot") ? "editor-timeline" : null
      });
    const out = getEpisodeOutPaths(id);
    let doc = readJsonFileSafe(out.shots);
    if (!isShotsDocLike(doc)) {
      const shotDoc = await prisma.shotDoc.findUnique({ where: { episodeId: id }, select: { json: true } });
      doc = shotDoc?.json ?? null;
    }
    if (!isShotsDocLike(doc)) {
      return reply.redirect(editorRedirect({ error: "shots.json not found" }));
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
      return reply.redirect(editorRedirect({ message: "Undo complete" }));
    }

    if (op === "redo") {
      if (history.pointer < history.states.length - 1) {
        history.pointer += 1;
      }
      writeEditorHistory(id, history);
      return reply.redirect(editorRedirect({ message: "Redo complete" }));
    }

    if (op === "snapshot") {
      const snapshots = editorSnapshotsDir(id);
      fs.mkdirSync(snapshots, { recursive: true });
      const filename = `shots_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      const filePath = path.join(snapshots, filename);
      writeJsonFile(filePath, shotsDoc);
      return reply.redirect(editorRedirect({ message: `Snapshot saved: ${filename}` }));
    }

    if (op === "move") {
      const index = typeof body.index === "string" ? Number.parseInt(body.index, 10) : typeof body.index === "number" ? Math.round(body.index) : -1;
      const delta = typeof body.delta === "string" ? Number.parseInt(body.delta, 10) : typeof body.delta === "number" ? Math.round(body.delta) : 0;
      const ok = moveShot(shotsDoc, index, delta);
      if (!ok) {
        return reply.redirect(editorRedirect({ error: "Invalid move command" }));
      }
      history = pushHistory(history, shotsDoc, `move:${index}:${delta}`);
      writeEditorHistory(id, history);
      writeJsonFile(out.shots, shotsDoc);
      return reply.redirect(editorRedirect({ message: "Timeline reordered successfully" }));
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
        return reply.redirect(editorRedirect({ error: "Shot override failed" }));
      }
      history = pushHistory(history, shotsDoc, `tweak:${shotId}`);
      writeEditorHistory(id, history);
      writeJsonFile(out.shots, shotsDoc);
      return reply.redirect(editorRedirect({ message: `Tweak applied: ${shotId}` }));
    }

    return reply.redirect(editorRedirect({ error: "Unknown op" }));
  });

  app.post("/ui/episodes/:id/style-preview", async (request, reply) => {
    const params = isRecord(request.params) ? request.params : {};
    const rawId = params.id;
    const id = typeof rawId === "string" && rawId.trim().length > 0 ? rawId.trim() : "";
    if (!id) {
      return reply.code(400).type("text/html; charset=utf-8").send(simpleErrorHtml("episode id is required"));
    }

    const body = request.body;
    const decisionState = readDecisionLinkState(body);
    const redirectPath = normalizeUiReturnTo(b(body, "redirectPath"));
    const episodeRedirectBase =
      redirectPath ??
      uiHref(`/ui/episodes/${encodeURIComponent(id)}`, {
        params: decisionStateParams(decisionState)
      });
    const episodeRedirect = (key: "message" | "error", value: string): string =>
      uiHrefFromExisting(episodeRedirectBase, {
        params: {
          [key]: value
        }
      });
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
        return reply.redirect(episodeRedirect("error", msg));
      }
      return reply.redirect(episodeRedirect("message", "shots.json was missing, so COMPILE_SHOTS was enqueued first. Run Style Preview again after completion."));
    }

    const res = await injectJson(app, "POST", `/api/episodes/${encodeURIComponent(id)}/enqueue`, {
      jobType: "RENDER_PREVIEW",
      failedShotIds: previewShotIds,
      stylePresetId,
      hookBoost
    });
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `style preview enqueue failed (${res.statusCode})`;
      return reply.redirect(episodeRedirect("error", msg));
    }
    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.redirect(episodeRedirect("message", "Style preview enqueued"));
    if (redirectPath || hasDecisionLinkState(decisionState)) {
      return reply.redirect(episodeRedirect("message", `Style preview enqueued (${jobId})`));
    }
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
    const decisionState = readDecisionLinkState(body);
    const redirectPath = normalizeUiReturnTo(b(body, "redirectPath"));
    const episodeRedirectBase =
      redirectPath ??
      uiHref(`/ui/episodes/${encodeURIComponent(id)}`, {
        params: decisionStateParams(decisionState)
      });
    const episodeRedirect = (key: "message" | "error", value: string): string =>
      uiHrefFromExisting(episodeRedirectBase, {
        params: {
          [key]: value
        }
      });
    const styleA = normalizeAbStylePresetId(b(body, "styleA"), AB_DEFAULT_STYLE_A);
    const styleB = normalizeAbStylePresetId(b(body, "styleB"), AB_DEFAULT_STYLE_B);
    if (styleA === styleB) {
      return reply.redirect(episodeRedirect("error", "A/B styles must be different."));
    }

    const out = getEpisodeOutPaths(id);
    const baseShotsDoc = readJsonFileSafe(out.shots);
    if (!baseShotsDoc) {
      return reply.redirect(episodeRedirect("error", "shots.json is missing. Run COMPILE_SHOTS first."));
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
      const compareRedirectBase =
        redirectPath && redirectPath.includes("/ab-compare")
          ? redirectPath
          : uiHref(`/ui/episodes/${encodeURIComponent(id)}/ab-compare`, {
              params: {
                ...decisionStateParams(decisionState),
                compare: uniqueStrings([...decisionState.compare, styleA, styleB])
              },
              hash: "episode-ab-compare-shell"
            });
      return reply.redirect(
        uiHrefFromExisting(compareRedirectBase, {
          params: {
            jobA: jobA.jobId,
            jobB: jobB.jobId,
            compare: uniqueStrings([...decisionState.compare, styleA, styleB]),
            message: "A/B compare enqueued"
          }
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.redirect(episodeRedirect("error", `A/B preview enqueue failed: ${message}`));
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
    const decisionState = readDecisionLinkState(request.query);
    const compareFocusValue = decisionToken(decisionState.focus);
    const compareStateHidden = renderDecisionStateHiddenInputs(decisionState);
    const episodeRow = await prisma.episode.findUnique({
      where: { id },
      select: {
        topic: true,
        status: true,
        datasetVersionSnapshot: true
      }
    });
    const snapshot = isRecord(episodeRow?.datasetVersionSnapshot) ? episodeRow.datasetVersionSnapshot : {};
    const styleAb = isRecord(snapshot.style_ab) ? snapshot.style_ab : {};
    const variantAInfo = isRecord(styleAb.variantA) ? styleAb.variantA : {};
    const variantBInfo = isRecord(styleAb.variantB) ? styleAb.variantB : {};
    const variantAStyle = str(variantAInfo.stylePresetId) ?? AB_DEFAULT_STYLE_A;
    const variantBStyle = str(variantBInfo.stylePresetId) ?? AB_DEFAULT_STYLE_B;
    const compareReady = aExists && bExists;
    const scoreA = (aExists ? 0 : 10_000) + qa.failCount * 100 + qa.warnCount * 10;
    const scoreB = (bExists ? 0 : 10_000) + qb.failCount * 100 + qb.warnCount * 10;
    const verdict =
      !compareReady
        ? "산출물 누락으로 보류"
        : scoreA === scoreB
          ? "수동 검토 필요"
          : scoreA < scoreB
            ? `${variantAStyle} 승격`
            : `${variantBStyle} 승격`;
    const verdictTone: UiBadgeTone = !compareReady ? "bad" : scoreA === scoreB ? "warn" : "ok";
    const nextDecision =
      !compareReady
        ? "누락된 변형을 먼저 다시 실행하세요"
        : qa.failCount === qb.failCount && qa.warnCount === qb.warnCount
          ? "두 프리뷰를 모두 보고 에피소드 상세에서 결정하세요"
          : scoreA < scoreB
            ? `${variantAStyle}를 에피소드 상세로 가져가세요`
            : `${variantBStyle}를 에피소드 상세로 가져가세요`;
	    const promotionTarget =
	      !compareReady ? "none" : qa.failCount === qb.failCount && qa.warnCount === qb.warnCount ? "operator decision" : scoreA < scoreB ? variantAStyle : variantBStyle;
	    const compareLastKnownGood = aExists && bExists ? "paired previews ready" : aExists || bExists ? "single preview ready" : "none";
	    const compareRollbackPoint = aExists ? `${variantAStyle} preview` : bExists ? `${variantBStyle} preview` : "episode detail";
	    const currentCompareHref = uiHref(`/ui/episodes/${encodeURIComponent(id)}/ab-compare`, {
	      params: {
	        ...decisionStateParams(decisionState),
	        jobA,
	        jobB,
	        compare: uniqueStrings([...decisionState.compare, variantAStyle, variantBStyle])
	      },
	      hash: "episode-ab-compare-shell"
	    });
	    const compareActionHidden = `${compareStateHidden}<input type="hidden" name="redirectPath" value="${esc(currentCompareHref)}"/>`;
	    const compareEpisodeHref = uiHref(`/ui/episodes/${encodeURIComponent(id)}`, {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentCompareHref,
	        compare: uniqueStrings([...decisionState.compare, variantAStyle, variantBStyle])
	      },
	      hash: "episode-compare-review"
	    });
	    const compareWorkbenchHref = uiHref(`/ui/episodes/${encodeURIComponent(id)}/editor`, {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentCompareHref,
	        compare: uniqueStrings([...decisionState.compare, variantAStyle, variantBStyle])
	      },
	      hash: "editor-stage"
	    });
	    const compareReturnHref = decisionState.returnTo ?? compareEpisodeHref;
	    const compareReturnLabel = decisionState.returnTo
	      ? decisionState.returnTo.includes("/candidates") || decisionState.returnTo.includes("/ab-compare")
	        ? "Reopen Compare"
	        : "Back to list"
	      : "Episode Detail";
	    const compareJumpFacts: DecisionFact[] = [
	      ...(decisionState.focus
	        ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "incoming compare or object focus" }]
	        : []),
	      ...(decisionState.compare.length > 0
	        ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare handoff preserved in URL state" }]
	        : []),
	      ...(decisionState.selected.length > 0
	        ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected ids carried into compare` }]
	        : []),
	      ...(decisionState.view
	        ? [{ label: "View", value: humanizeOpsLabel(decisionState.view), hint: "view mode preserved across handoff" }]
	        : [])
	    ];
	    const compareJumpBanner = renderDecisionJumpBanner({
	      title: "Deep-link handoff",
	      intro: "The previous selection, compare intent, and return path stay visible so this A/B surface reads as the next decision step instead of a detached media page.",
	      facts: compareJumpFacts,
	      linksHtml: `<a href="${compareReturnHref}">${compareReturnLabel}</a><a href="${compareEpisodeHref}">Episode Detail</a><a href="${compareWorkbenchHref}">Ops Workbench</a>`,
	      tone: verdictTone
	    });
	    const compareBlockers =
	      !compareReady
	        ? [{ title: "비교가 차단됨", detail: "프리뷰 산출물 하나 이상이 없어 지금 승인하거나 롤백하기에는 이릅니다.", tone: "bad" as UiBadgeTone, badge: "재실행" }]
	        : [];
	    const comparePrimaryActions = [
	      {
	        title: "판정을 에피소드로 가져가기",
	        detail: `${nextDecision} compare gate를 통과한 뒤에만 episode detail에서 승격을 반영하세요.`,
	        tone: verdictTone,
	        badge: verdict,
	        html: `<a href="${compareEpisodeHref}">에피소드 상세 열기</a><a href="${currentCompareHref}">비교 새로고침</a>`
	      }
	    ];
	    const compareSecondaryActions = [
	      {
	        title: "연결된 실행 점검",
	        detail: "승인하거나 재시도하기 전에 각 변형을 만든 정확한 작업을 확인하세요.",
	        tone: "muted" as UiBadgeTone,
	        html: `${jobA ? `<a href="/ui/jobs/${encodeURIComponent(jobA)}">jobA 열기</a>` : ""}${jobB ? `<a href="/ui/jobs/${encodeURIComponent(jobB)}">jobB 열기</a>` : ""}`
	      }
	    ];
	    const compareRecoveryActions = [
	      {
	        title: "재시도 / 대체 경로",
	        detail: compareReady ? "판정이 여전히 불명확하면 새 compare set을 만들거나 episode detail로 돌아가 last-good state와 함께 검토하세요." : "결정하기 전에 비교 세트를 다시 생성하세요.",
	        tone: compareReady ? ("warn" as UiBadgeTone) : ("bad" as UiBadgeTone),
	        badge: compareReady ? "대체 경로" : "재시도",
	        html: `<form method="post" action="/ui/episodes/${esc(id)}/ab-preview" class="inline"><input type="hidden" name="styleA" value="${esc(
	          variantAStyle
	        )}"/><input type="hidden" name="styleB" value="${esc(variantBStyle)}"/>${compareActionHidden}<button type="submit">A/B 비교 다시 실행</button></form><a href="${compareEpisodeHref}">에피소드 상세</a>`
	      }
	    ];
	    const compareRecentActivity = [
	      { title: "변형 A 작업", detail: jobA ? `jobA ${jobA}` : "query string에 jobA가 연결되지 않았습니다", tone: jobA ? ("ok" as UiBadgeTone) : ("muted" as UiBadgeTone), badge: "A" },
	      { title: "변형 B 작업", detail: jobB ? `jobB ${jobB}` : "query string에 jobB가 연결되지 않았습니다", tone: jobB ? ("ok" as UiBadgeTone) : ("muted" as UiBadgeTone), badge: "B" }
	    ];
	    const compareLinkedObjects = [
	      { title: "에피소드 오브젝트", detail: "승격과 롤백 판단은 모두 에피소드 상세에서 이뤄집니다.", tone: "muted" as UiBadgeTone, html: `<a href="${compareEpisodeHref}">에피소드 상세 열기</a>` },
	      { title: "Ops 워크벤치", detail: "샷 단위 편집과 snapshot rollback은 workbench에서 처리합니다.", tone: "muted" as UiBadgeTone, html: `<a href="${compareWorkbenchHref}">Ops 워크벤치</a>` }
	    ];
	    const compareDecisionRail = [
	      {
	        title: "현재 compare gate",
	        detail: `${nextDecision} promotion target은 ${promotionTarget}입니다.`,
	        tone: verdictTone,
	        badge: verdict,
	        html: `<a href="${compareEpisodeHref}">판정을 에피소드 상세로 반영</a>`
	      },
	      {
	        title: "비교 세트 재생성",
	        detail: compareReady ? "판정이 여전히 애매하면 같은 조합을 다시 실행하거나 새 스타일 조합을 비교에 넣으세요." : "프리뷰가 하나 이상 없어 승인이나 롤백 전에 다시 실행해야 합니다.",
	        tone: compareReady ? ("warn" as UiBadgeTone) : ("bad" as UiBadgeTone),
	        badge: compareReady ? "재실행" : "차단됨",
	        html: `<form method="post" action="/ui/episodes/${esc(id)}/ab-preview" class="inline"><input type="hidden" name="styleA" value="${esc(
	          variantAStyle
	        )}"/><input type="hidden" name="styleB" value="${esc(variantBStyle)}"/>${compareActionHidden}<button type="submit">A/B 비교 다시 실행</button></form>`
	      },
	      {
	        title: "롤백 앵커",
	        detail: `${compareRollbackPoint}가 현재 비교면의 last-good preview이며, 최종 rollback 반영은 episode detail에서 처리합니다.`,
	        tone: compareLastKnownGood === "none" ? ("warn" as UiBadgeTone) : ("ok" as UiBadgeTone),
	        badge: "rollback",
	        html: `${jobA ? `<a href="/ui/jobs/${encodeURIComponent(jobA)}">jobA 열기</a>` : ""}${jobB ? `<a href="/ui/jobs/${encodeURIComponent(jobB)}">jobB 열기</a>` : ""}<a href="${compareEpisodeHref}">에피소드 상세</a>`
	      }
	    ];
	    const compareSnapshotFacts = [
	      {
	        label: "실패 사유",
	        value: !compareReady ? "프리뷰 산출물 하나 이상이 없습니다" : "강한 차단 요인은 없지만 운영자 판정이 필요합니다",
	        hint: "최상위 비교 차단 요인"
	      },
	      { label: "마지막 정상 지점", value: compareLastKnownGood, hint: "현재 가장 좋은 복구 앵커" },
	      { label: "적용된 폴백", value: `${qa.forcedStyle} / ${qb.forcedStyle}`, hint: "STYLE_QC가 감지한 강제 스타일" },
	      { label: "재시도 경로", value: compareReady ? "A/B 재실행 또는 에피소드 상세로 복귀" : "A/B 비교 생성 재실행", hint: nextDecision },
	      { label: "대체 경로", value: "스타일 프리뷰 / Ops 워크벤치", hint: "비교 결과가 애매할 때 사용" },
	      { label: "롤백 지점", value: compareRollbackPoint, hint: "승격과 롤백은 episode detail에서 반영됩니다" }
	    ];
	    const compareEvidenceFacts = [
	      { label: "Compare Gate", value: verdict, hint: nextDecision },
	      { label: "Promotion Target", value: promotionTarget, hint: "episode detail이 최종 승격 오브젝트" },
	      { label: "Last Good", value: compareLastKnownGood, hint: "paired preview or single preview anchor" },
	      { label: "Rollback Point", value: compareRollbackPoint, hint: "현재 비교면 기준 rollback anchor" }
	    ];
	    const compareEvidenceDrawerBody = `<div class="decision-copy">The compare shell is the default decision surface. Use preview playback, QC deltas, and linked jobs before escalating to lower-level artifacts or rerunning the whole episode flow.</div>
	<div class="quick-links"><a href="${compareEpisodeHref}">에피소드 상세</a>${jobA ? `<a href="/ui/jobs/${encodeURIComponent(jobA)}">jobA</a>` : ""}${jobB ? `<a href="/ui/jobs/${encodeURIComponent(jobB)}">jobB</a>` : ""}</div>
	<details class="decision-drawer"><summary>Open compare evidence order</summary><div class="decision-drawer-body"><div class="decision-copy">Compare shell -> episode detail -> ops workbench. If the gate is still unclear, rerun the compare set before promoting or rolling back.</div><div class="quick-links"><a href="${compareWorkbenchHref}">Ops 워크벤치</a><a href="/ui/jobs">작업</a></div></div></details>`;

	    const body = `${decisionSurfaceStyles()}<div class="decision-surface">${renderObjectHero({
      eyebrow: "변형 검토",
      title: "A/B 프리뷰 비교",
      subtitle: "compare-before-promote 게이트, promotion target, rollback anchor를 프리뷰 재생보다 먼저 유지합니다.",
      statusLabel: verdict,
      statusTone: verdictTone,
      flash: `${flashHtml(request.query)}${compareJumpBanner}`,
      headerContextHtml: `<span class="muted-text">에피소드 <span class="decision-code">${esc(id)}</span></span><span class="muted-text">주제 ${esc(
        episodeRow?.topic ?? "-"
      )}</span>`,
      quickLinksHtml: `<a href="${compareReturnHref}">${compareReturnLabel}</a><a href="${compareEpisodeHref}">에피소드 상세</a><a href="/ui/jobs">작업</a>${jobA ? `<a href="/ui/jobs/${encodeURIComponent(
        jobA
      )}">jobA</a>` : ""}${jobB ? `<a href="/ui/jobs/${encodeURIComponent(jobB)}">jobB</a>` : ""}`,
      summaryCards: [
        { label: "비교 대상", value: `${variantAStyle} vs ${variantBStyle}`, hint: "명시적인 스타일 변형", tone: "muted" },
        { label: "판정", value: verdict, hint: nextDecision, tone: verdictTone },
        { label: "승격 대상", value: promotionTarget, hint: "episode detail에서 최종 반영", tone: verdictTone },
        { label: "QC 차이", value: `${Math.abs(qa.failCount - qb.failCount)} 실패 / ${Math.abs(qa.warnCount - qb.warnCount)} 경고`, hint: "차이를 한눈에 확인", tone: verdictTone },
        { label: "산출물 상태", value: compareReady ? "둘 다 준비됨" : "부분 준비", hint: "두 프리뷰가 모두 있어야 비교가 가능합니다", tone: compareReady ? "ok" : "bad" }
      ],
      metaItems: [
        { label: "에피소드", value: id, hint: String(episodeRow?.topic ?? "-") },
        { label: "변형 A", value: variantAStyle, hint: `실패 ${qa.failCount} / 경고 ${qa.warnCount}` },
        { label: "변형 B", value: variantBStyle, hint: `실패 ${qb.failCount} / 경고 ${qb.warnCount}` },
        { label: "에피소드 상태", value: statusLabelKo(String(episodeRow?.status ?? "-")), hint: "연결된 오브젝트 상태" },
        { label: "롤백 앵커", value: compareRollbackPoint, hint: "현재 비교면의 last-good preview" }
      ],
	      blockers: compareBlockers,
	      primaryActions: comparePrimaryActions,
	      secondaryActions: compareSecondaryActions,
	      recoveryActions: compareRecoveryActions,
	      recentActivity: compareRecentActivity,
	      linkedObjects: compareLinkedObjects
	    })}${renderDecisionPrioritySection({
	      sectionId: "episode-ab-decision-rail",
	      title: "판단 레일",
	      intro: "재생 전에 현재 compare gate, 재실행 경로, episode promotion target을 계속 보이게 유지합니다.",
	      linksHtml: `<a href="${compareEpisodeHref}">에피소드 상세</a><a href="${currentCompareHref}">비교 새로고침</a>`,
	      railTitle: "비교 액션",
	      railIntro: "대상 문맥을 잃지 않고 compare before promote, compare set 재생성, rollback anchor 검토를 처리하세요.",
	      railCards: compareDecisionRail,
	      railEmpty: "사용 가능한 비교 액션이 없습니다.",
	      railTone: verdictTone,
	      snapshotIntro: "실패 사유, last-good state, retry path, rollback point를 재생 화면 위에 유지합니다.",
	      snapshotFacts: compareSnapshotFacts,
	      snapshotEmpty: "복구 스냅샷이 없습니다.",
	      snapshotTone: verdictTone
	    })}${renderRecoveryRailSection({
	      sectionId: "episode-ab-recovery-rail",
	      title: "복구 / 연결 오브젝트",
	      intro: "compare shell과 연결된 recovery path, owner object, and workbench remain visible before playback.",
	      linksHtml: `<a href="${compareEpisodeHref}">에피소드 상세</a><a href="${compareWorkbenchHref}">Ops 워크벤치</a>`,
	      recoveryTitle: "복구 레일",
	      recoveryIntro: "비교 결과가 막히면 compare set을 다시 만들고, episode detail에서 최종 rollback을 반영합니다.",
	      recoveryCards: compareRecoveryActions,
	      recoveryEmpty: "사용 가능한 복구 액션이 없습니다.",
	      recoveryTone: compareRecoveryActions[0]?.tone ? decisionTone(compareRecoveryActions[0].tone) : verdictTone,
	      linkedTitle: "연결 오브젝트 레일",
	      linkedIntro: "owner episode와 workbench를 adjacent object로 유지합니다.",
	      linkedCards: compareLinkedObjects,
	      linkedEmpty: "연결된 오브젝트가 없습니다.",
	      linkedTone: "muted"
	    })}${renderArtifactEvidenceSection({
	      sectionId: "episode-ab-evidence",
	      title: "아티팩트 근거 드로어",
	      intro: "compare gate와 rollback anchor를 먼저 보고, deeper evidence는 drawer에서 보조 확인합니다.",
	      linksHtml: `<a href="${compareEpisodeHref}">에피소드 상세</a><a href="/ui/jobs">작업</a>`,
	      summaryTitle: "비교 근거 요약",
	      summaryIntro: "compare gate, promotion target, last-good state, rollback point를 한 묶음으로 유지합니다.",
	      summaryFacts: compareEvidenceFacts,
	      summaryEmpty: "비교 근거 요약이 없습니다.",
	      summaryTone: verdictTone,
	      drawerTitle: "근거 드로어",
	      drawerIntro: "재생과 QC 차이를 먼저 보고, 필요할 때만 더 깊은 증거로 내려갑니다.",
	      drawerSummary: "Open compare evidence order and raw-evidence policy",
	      drawerBodyHtml: compareEvidenceDrawerBody,
	      drawerTone: "muted",
	      drawerOpen: ["evidence", "artifact", "raw"].includes(compareFocusValue) || decisionToken(decisionState.view) === "evidence"
	    })}<section class="card decision-jump-target" id="episode-ab-compare-shell" aria-labelledby="episode-ab-compare-shell-title"><div class="section-head"><div><h2 id="episode-ab-compare-shell-title">Compare Shell</h2><p class="section-intro">위 decision and recovery rails가 정리된 뒤에만 두 대상을 같은 문법으로 나란히 확인하세요.</p></div><div class="quick-links"><a href="${compareReturnHref}">${compareReturnLabel}</a><a href="${compareEpisodeHref}">Episode Detail</a></div></div><div class="decision-help-callout" role="note" aria-label="Compare reading order"><strong>Compare reading order</strong><span class="muted-text">1. 판정과 diff chip을 확인하고 2. 좌/우 프리뷰 축을 비교한 뒤 3. action rail로 detail, job, rerun handoff를 여세요.</span></div><div class="decision-diff-row" aria-label="A/B compare deltas"><span class="decision-diff-chip tone-${Math.abs(qa.failCount - qb.failCount) > 0 ? "warn" : "ok"}">Fail delta ${Math.abs(
	      qa.failCount - qb.failCount
	    )}</span><span class="decision-diff-chip tone-${Math.abs(qa.warnCount - qb.warnCount) > 0 ? "warn" : "ok"}">Warn delta ${Math.abs(
	      qa.warnCount - qb.warnCount
	    )}</span><span class="decision-diff-chip tone-${compareReady ? "ok" : "bad"}">${compareReady ? "Both previews ready" : "One or more previews missing"}</span><span class="decision-diff-chip tone-${verdictTone}">Promotion target ${esc(
	      promotionTarget
	    )}</span></div><div class="decision-compare-shell"><div class="decision-action-rail" aria-label="Compare shell actions"><a href="${compareEpisodeHref}">Episode Detail</a><a href="${compareWorkbenchHref}">Ops Workbench</a><a href="#episode-ab-promotion-matrix">Promotion Matrix</a>${jobA ? `<a href="/ui/jobs/${encodeURIComponent(
	      jobA
	    )}">jobA</a>` : ""}${jobB ? `<a href="/ui/jobs/${encodeURIComponent(jobB)}">jobB</a>` : ""}</div><div class="decision-compare-axis"><article class="decision-compare-card" data-compare-side="left"><div class="decision-compare-card-head"><div><span class="decision-compare-axis-label">Left axis</span><h3>변형 A</h3><p class="muted-text">${esc(
	      variantAStyle
	    )}</p></div><span class="badge ${aExists ? "ok" : "bad"}">${aExists ? "준비됨" : "없음"}</span></div>${aExists ? `<video controls preload="metadata" class="decision-video-frame" src="${aUrl}" aria-label="Variant A preview"></video>` : `<div class="error">preview_A.mp4를 찾을 수 없습니다</div>`}<div class="decision-meta-grid"><div class="decision-meta-card"><span class="label">STYLE_QC fail</span><div class="value">${qa.failCount}</div><div class="hint">variant A blocker count</div></div><div class="decision-meta-card"><span class="label">STYLE_QC warn</span><div class="value">${qa.warnCount}</div><div class="hint">variant A warning count</div></div><div class="decision-meta-card"><span class="label">Forced style</span><div class="value">${esc(
	      qa.forcedStyle
	    )}</div><div class="hint">forced by STYLE_QC</div></div></div><div class="decision-action-rail" aria-label="Variant A actions">${aExists ? `<a href="${aUrl}">Open preview_A.mp4</a>` : ""}${jobA ? `<a href="/ui/jobs/${encodeURIComponent(
	      jobA
	    )}">Open jobA</a>` : ""}<a href="${compareEpisodeHref}">Episode detail</a></div></article><article class="decision-compare-card" data-compare-side="right"><div class="decision-compare-card-head"><div><span class="decision-compare-axis-label">Right axis</span><h3>변형 B</h3><p class="muted-text">${esc(
	      variantBStyle
	    )}</p></div><span class="badge ${bExists ? "ok" : "bad"}">${bExists ? "준비됨" : "없음"}</span></div>${bExists ? `<video controls preload="metadata" class="decision-video-frame" src="${bUrl}" aria-label="Variant B preview"></video>` : `<div class="error">preview_B.mp4를 찾을 수 없습니다</div>`}<div class="decision-meta-grid"><div class="decision-meta-card"><span class="label">STYLE_QC fail</span><div class="value">${qb.failCount}</div><div class="hint">variant B blocker count</div></div><div class="decision-meta-card"><span class="label">STYLE_QC warn</span><div class="value">${qb.warnCount}</div><div class="hint">variant B warning count</div></div><div class="decision-meta-card"><span class="label">Forced style</span><div class="value">${esc(
	      qb.forcedStyle
	    )}</div><div class="hint">forced by STYLE_QC</div></div></div><div class="decision-action-rail" aria-label="Variant B actions">${bExists ? `<a href="${bUrl}">Open preview_B.mp4</a>` : ""}${jobB ? `<a href="/ui/jobs/${encodeURIComponent(
	      jobB
	    )}">Open jobB</a>` : ""}<a href="${compareEpisodeHref}">Episode detail</a></div></article></div></div></section><section class="card decision-jump-target" id="episode-ab-promotion-matrix"><div class="section-head"><div><h2>Promotion Matrix</h2><p class="section-intro">승인하거나 재시도하기 전에 한 표에서 compare delta와 QC 차이를 확인합니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>지표</th><th>변형 A</th><th>변형 B</th></tr></thead><tbody><tr><td>스타일 프리셋</td><td>${esc(
	      variantAStyle
	    )}</td><td>${esc(variantBStyle)}</td></tr><tr><td>STYLE_QC fail_count</td><td>${qa.failCount}</td><td>${qb.failCount}</td></tr><tr><td>STYLE_QC warn_count</td><td>${qa.warnCount}</td><td>${qb.warnCount}</td></tr><tr><td>forced_episode_style</td><td>${esc(
	      qa.forcedStyle
	    )}</td><td>${esc(qb.forcedStyle)}</td></tr></tbody></table></div></section></div>${renderDecisionJumpScript()}`;

    return reply.type("text/html; charset=utf-8").send(page(`A/B 비교 ${id}`, body));
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
    const decisionState = readDecisionLinkState(body);
    const redirectPath = normalizeUiReturnTo(b(body, "redirectPath"));
    const profile = normalizeRunProfile(b(body, "profile"));
    const stylePresetId = normalizeStylePresetId(b(body, "stylePresetId"));
    const hookBoost = parseHookBoost(b(body, "hookBoost"), DEFAULT_HOOK_BOOST);
    const redirectTarget = normalizeRunProfileReturnTarget(
      b(body, "redirectTarget") ?? (normalizeUiReturnTo(b(body, "returnTo")) ? undefined : b(body, "returnTo"))
    );
    const surfaceRedirectBase =
      redirectPath ??
      uiHref(`/ui/episodes/${encodeURIComponent(id)}`, {
        params: {
          ...decisionStateParams(decisionState),
          profile
        }
      });
    const surfaceRedirect = (key: "message" | "error", value: string): string =>
      uiHrefFromExisting(surfaceRedirectBase, {
        params: {
          profile,
          [key]: value
        }
      });
    const res = await injectJson(app, "POST", `/api/episodes/${encodeURIComponent(id)}/run-profile`, {
      profile,
      stylePresetId,
      hookBoost
    });

    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `run profile failed (${res.statusCode})`;
      const hint = isRecord(res.body) && typeof res.body.hint === "string" ? res.body.hint : runProfileFailureHint(msg);
      const combined = `${msg} (${hint})`;
      if (redirectPath || hasDecisionLinkState(decisionState)) {
        return reply.redirect(surfaceRedirect("error", combined));
      }
      const errorTarget =
        redirectTarget === "episodes"
          ? `/ui/episodes?error=${encodeURIComponent(combined)}`
          : `/ui/episodes/${encodeURIComponent(id)}?profile=${encodeURIComponent(profile)}&error=${encodeURIComponent(combined)}`;
      return reply.redirect(errorTarget);
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && typeof res.body.data.jobId === "string" ? res.body.data.jobId : null;
    const deduped = isRecord(res.body) && isRecord(res.body.data) && res.body.data.deduped === true;
    const message = deduped ? `Run profile skipped (dedup): ${profile}` : `Run profile started: ${profile}`;
    if (redirectPath || hasDecisionLinkState(decisionState) || redirectTarget === "episode" || !jobId) {
      return reply.redirect(surfaceRedirect("message", message));
    }
    if (redirectTarget === "episodes") {
      return reply.redirect(`/ui/episodes?message=${encodeURIComponent(`${id}: ${message}`)}`);
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
    const decisionState = readDecisionLinkState(body);
    const redirectPath = normalizeUiReturnTo(b(body, "redirectPath"));
    const jobType = b(body, "jobType") ?? "COMPILE_SHOTS";
    const mode = b(body, "pipelineMode");
    const stylePresetId = normalizeStylePresetId(b(body, "stylePresetId"));
    const hookBoost = parseHookBoost(b(body, "hookBoost"), DEFAULT_HOOK_BOOST);
    const pipeline = pipelineFromMode(mode);
    const surfaceRedirectBase =
      redirectPath ??
      uiHref(`/ui/episodes/${encodeURIComponent(id)}`, {
        params: decisionStateParams(decisionState)
      });
    const surfaceRedirect = (key: "message" | "error", value: string): string =>
      uiHrefFromExisting(surfaceRedirectBase, {
        params: {
          [key]: value
        }
      });

    const payload: JsonRecord = { jobType, stylePresetId, hookBoost };
    if (pipeline) {
      payload.pipeline = pipeline;
    }

    const res = await injectJson(app, "POST", `/api/episodes/${encodeURIComponent(id)}/enqueue`, payload);
    if (res.statusCode >= 400) {
      const msg = isRecord(res.body) && typeof res.body.error === "string" ? res.body.error : `enqueue failed (${res.statusCode})`;
      return reply.redirect(surfaceRedirect("error", msg));
    }

    const jobId = isRecord(res.body) && isRecord(res.body.data) && isRecord(res.body.data.job) && typeof res.body.data.job.id === "string" ? res.body.data.job.id : null;
    if (!jobId) return reply.redirect(surfaceRedirect("message", "Job enqueued"));
    if (redirectPath || hasDecisionLinkState(decisionState)) {
      return reply.redirect(surfaceRedirect("message", `Job enqueued (${jobId})`));
    }
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
        episode: {
          select: {
            topic: true,
            status: true,
            characterPackId: true
          }
        },
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
      .map((log) => `<tr><td>${fmtDate(log.createdAt.toISOString())}</td><td>${esc(statusLabelKo(String(log.level ?? "info")))}</td><td>${esc(log.message ?? "")}</td><td><pre>${esc(JSON.stringify(log.details ?? null, null, 2))}</pre></td></tr>`)
      .join("");

    const episodeId = job.episodeId;
    const canRetry = job.status === "FAILED";
    const errorStack = job.lastError ? `<details><summary>lastError 스택 열기/닫기</summary><pre>${esc(job.lastError)}</pre></details>` : "<p>lastError: (없음)</p>";
    const jobStatusLabel = String(job.status ?? "UNKNOWN");
    const jobStatusDisplay = statusLabelKo(jobStatusLabel);
    const jobStatusTone = decisionTone(badgeClass(jobStatusLabel));
    const lastLog = logs.at(-1) ?? null;
    const recoveryCategory = classifyErrorType(job.lastError ?? "");
    const retryAction = canRetry
      ? `<form method="post" action="/ui/jobs/${esc(id)}/retry"><button type="submit">실패 작업 재시도</button></form>`
      : `<button type="button" class="secondary" disabled>재시도는 상태가 FAILED일 때만 가능합니다.</button>`;
    const jobHero = renderObjectHero({
      eyebrow: "실행 제어면",
      title: "작업 / 실행 상세",
      subtitle: "실행을 하나의 오브젝트로 다루세요. 상태, 복구, 최근 활동, 연결된 에피소드를 원시 로그 위에 계속 보이게 둡니다.",
      statusLabel: jobStatusDisplay,
      statusTone: jobStatusTone,
      flash: flashHtml(request.query),
      headerContextHtml: `<span class="muted-text">작업 <span class="decision-code">${esc(job.id)}</span></span><span class="muted-text">에피소드 <span class="decision-code">${esc(
        episodeId
      )}</span></span>`,
      quickLinksHtml: `<a href="/ui/jobs">작업으로 돌아가기</a><a href="/ui/episodes/${esc(episodeId)}">에피소드 상세</a><a href="/ui/hitl">복구 큐</a>`,
      summaryCards: [
        { label: "진행률", value: `${job.progress}%`, hint: "현재 진행 상태", tone: jobStatusTone },
        { label: "시도 횟수", value: `${job.attemptsMade}/${job.maxAttempts}`, hint: `${job.retryBackoffMs}ms 백오프`, tone: canRetry ? "bad" : "muted" },
        { label: "로그", value: String(logs.length), hint: lastLog ? `최신 ${fmtDate(lastLog.createdAt.toISOString())}` : "로그 없음", tone: logs.length > 0 ? "ok" : "muted" },
        { label: "에피소드 상태", value: statusLabelKo(String(job.episode?.status ?? "-")), hint: String(job.episode?.topic ?? "-"), tone: decisionTone(badgeClass(String(job.episode?.status ?? ""))) }
      ],
      metaItems: [
        { label: "작업 ID", value: job.id, hint: "실행 오브젝트 키" },
        { label: "에피소드", value: episodeId, hint: String(job.episode?.topic ?? "-") },
        { label: "타입", value: job.type, hint: "워커 단계" },
        { label: "재시도 백오프", value: `${job.retryBackoffMs}ms`, hint: `${job.attemptsMade}/${job.maxAttempts}회 시도` },
        { label: "캐릭터 팩", value: String(job.episode?.characterPackId ?? "없음"), hint: "연결된 오브젝트" }
      ],
      blockers: job.lastError
        ? [
            {
              title: recoveryCategory.label,
              detail: job.lastError,
              tone: "bad",
              badge: "실패"
            }
          ]
        : [],
      primaryActions: [
        {
          title: canRetry ? "실패 실행 재시도" : "재시도 불가",
          detail: canRetry ? "이 실행 상세 화면에서 실패 작업을 직접 재실행합니다." : "여기서는 FAILED 상태의 작업만 재시도할 수 있습니다.",
          tone: canRetry ? "bad" : "muted",
          badge: canRetry ? "재시도" : "잠김",
          html: `${retryAction}${episodeId ? `<a href="/ui/episodes/${esc(episodeId)}">에피소드 열기</a>` : ""}`
        }
      ],
      secondaryActions: [
        {
          title: "관련 오브젝트 점검",
          detail: "실행 문맥을 잃지 않고 소유 에피소드, 산출물 인덱스, 복구 큐로 이동합니다.",
          tone: "muted",
          html: `<a href="/ui/episodes/${esc(episodeId)}">에피소드 상세</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}">산출물</a><a href="/ui/hitl">HITL 큐</a>`
        }
      ],
      recoveryActions: [
        {
          title: "복구 경로",
          detail: job.lastError ? recoveryCategory.hint : "지금은 복구 액션이 필요하지 않습니다.",
          tone: job.lastError ? "warn" : "ok",
          badge: recoveryCategory.label,
          html: job.lastError ? `<a href="/ui/health">상태 열기</a><a href="/ui/hitl">복구 큐 열기</a>` : `<a href="/ui/jobs">작업으로 돌아가기</a>`
        }
      ],
      recentActivity: logs.slice(-4).reverse().map((log) => ({
        title: `${statusLabelKo(String(log.level ?? "info"))} @ ${fmtDate(log.createdAt.toISOString())}`,
        detail: log.message ?? "(메시지 없음)",
        tone: decisionTone(badgeClass(String(log.level ?? ""))),
        badge: statusLabelKo(String(log.level ?? "info"))
      })),
      linkedObjects: [
        {
          title: "에피소드 오브젝트",
          detail: `${episodeId} / ${String(job.episode?.topic ?? "-")}`,
          tone: "muted",
          html: `<a href="/ui/episodes/${esc(episodeId)}">에피소드 상세 열기</a>`
        }
      ]
    });
    const jobDecisionRail: DecisionCard[] = [
      {
        title: canRetry ? "이 실행 재시도" : "이 실행 모니터링",
        detail: canRetry ? "실패한 실행에서 바로 재시도한 뒤, 아래 근거에서 다음 체크포인트를 확인하세요." : "실행이 FAILED가 될 때까지 재시도는 잠겨 있습니다. 대체 액션은 소유 에피소드에서 진행하세요.",
        tone: canRetry ? "bad" : jobStatusTone,
        badge: canRetry ? "재시도" : "모니터링",
        html: `${retryAction}${episodeId ? `<a href="/ui/episodes/${esc(episodeId)}">에피소드 상세</a>` : ""}`
      },
      {
        title: "소유 오브젝트",
        detail: `${episodeId}는 이 실행의 롤백 및 대체 경로 앵커로 유지됩니다.`,
        tone: "muted",
        badge: "에피소드",
        html: `<a href="/ui/episodes/${esc(episodeId)}">에피소드 상세 열기</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}">산출물</a>`
      },
      {
        title: "복구 경로",
        detail: job.lastError ? recoveryCategory.hint : "이후 체크포인트가 실패하지 않는 한 복구 작업은 필요하지 않습니다.",
        tone: job.lastError ? "warn" : "ok",
        badge: recoveryCategory.label,
        html: `<a href="/ui/hitl">복구 큐</a><a href="/ui/health">상태</a>`
      }
    ];
    const jobDetailBody = buildJobDetailPageBody({
      flash: "",
      jobId: esc(job.id),
      episodeId: esc(episodeId),
      type: esc(job.type),
      statusBadge: `<span class="badge ${badgeClass(String(job.status ?? ""))}">${esc(jobStatusDisplay)}</span>`,
      progress: esc(job.progress),
      attempts: `${esc(job.attemptsMade)} / ${esc(job.maxAttempts)} (백오프: ${esc(job.retryBackoffMs)}ms)`,
      errorStack,
      retryAction,
      logRows
    }).replace(
      "<h1>작업 상세</h1>",
      '<div class="section-head"><div><h2>실행 근거</h2><p class="section-intro">원시 로그와 페이로드 근거는 판단면 바로 아래에 붙여 둡니다.</p></div></div>'
    );
    return reply.type("text/html; charset=utf-8").send(
      page(
        `작업 ${id}`,
        `${decisionSurfaceStyles()}<div class="decision-surface">${jobHero}${renderDecisionPrioritySection({
          title: "판단 레일",
          intro: "원시 실행 근거보다 먼저 재시도 액션, 소유 에피소드, 복구 경로를 보이게 유지합니다.",
          linksHtml: `<a href="/ui/jobs">작업으로 돌아가기</a><a href="/ui/episodes/${esc(episodeId)}">에피소드 상세</a>`,
          railTitle: "실행 액션",
          railIntro: "즉시 재시도는 실행 오브젝트에서 처리하고, 대체 경로에 더 많은 문맥이 필요하면 소유 에피소드로 이동하세요.",
          railCards: jobDecisionRail,
          railEmpty: "사용 가능한 실행 액션이 없습니다.",
          railTone: canRetry ? "bad" : jobStatusTone,
          snapshotIntro: "실패 사유, 재시도 경로, 소유 오브젝트를 원시 로그 표 위에 유지합니다.",
          snapshotFacts: [
            { label: "실패 사유", value: job.lastError ?? "없음", hint: recoveryCategory.label },
            {
              label: "마지막 정상 지점",
              value: lastLog?.message ?? "기록된 성공 체크포인트 없음",
              hint: lastLog ? fmtDate(lastLog.createdAt.toISOString()) : "로그 대기 중"
            },
            { label: "재시도 경로", value: canRetry ? "실패 작업 재시도" : "종료 상태까지 모니터링", hint: recoveryCategory.hint },
            { label: "대체 경로", value: "에피소드 상세 -> 산출물 -> HITL", hint: "연결된 오브젝트 복구 경로" },
            { label: "롤백 지점", value: episodeId, hint: "소유 에피소드 오브젝트" }
          ],
          snapshotEmpty: "복구 메타데이터가 없습니다.",
          snapshotTone: job.lastError ? "warn" : jobStatusTone
        })}${jobDetailBody}</div>`
      )
    );
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

    const decisionState = readDecisionLinkState(request.query);
    const rolloutFocusValue = decisionToken(decisionState.focus);
    const rolloutSelectedTokens = decisionTokenSet(decisionState.selected);
    const rolloutPinnedTokens = decisionTokenSet(decisionState.pinned);
    const isFocused = (...values: Array<string | null | undefined>): boolean =>
      decisionSetHas(rolloutSelectedTokens, ...values) ||
      decisionSetHas(rolloutPinnedTokens, ...values) ||
      values.some((value) => rolloutFocusValue === decisionToken(value));

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
            const targetKey = str(entry.target) ?? "-";
            const rowId = buildDecisionAnchorId("rollout-target", targetKey);
            return [
              `<tr id="${rowId}" class="decision-focus-row${isFocused(targetKey) ? " is-focused" : ""}"><td>${esc(
                targetKey
              )}</td><td><span class="badge ${rolloutTone(normalizeRolloutStatus(str(entry.reason), entry.passed === true))}">${esc(
                entry.passed === true ? "ready" : normalizeRolloutStatus(str(entry.reason), false).replaceAll("_", " ")
              )}</span></td><td>${esc(formatNumber(candidate.score))}</td><td>${esc(str(candidate.verdict) ?? "-")}</td><td>${esc(
                str(entry.reason) ?? "-"
              )}</td></tr>`
            ];
          })
          .join("")
      : "";
    const bundleRows = isRecord(doc) && Array.isArray(doc.bundles)
      ? doc.bundles
          .flatMap((entry) => {
            if (!isRecord(entry)) return [];
            const summary = isRecord(entry.summary) ? entry.summary : {};
            const bundleKey = str(entry.bundle) ?? str(entry.channel_domain) ?? "-";
            const rowId = buildDecisionAnchorId("rollout-bundle", bundleKey);
            return [
              `<tr id="${rowId}" class="decision-focus-row${isFocused(bundleKey) ? " is-focused" : ""}"><td>${esc(
                bundleKey
              )}</td><td><span class="badge ${rolloutTone(normalizeRolloutStatus(str(entry.status), entry.ready === true))}">${esc(
                normalizeRolloutStatus(str(entry.status), entry.ready === true).replaceAll("_", " ")
              )}</span></td><td>${esc(formatNumber(summary.score))}</td><td>${esc(str(summary.verdict) ?? "-")}</td><td>${esc(
                previewStrings(entry.issues) ?? "-"
              )}</td></tr>`
            ];
          })
          .join("")
      : "";
    const metricRows = detailPairs.length > 0
      ? detailPairs.map((pair) => `<div class="status-row"><span class="label">${esc(pair.label)}</span><strong>${esc(pair.value)}</strong></div>`).join("")
      : `<div class="notice">No structured rollout fields were detected for this artifact.</div>`;
    const issueList = issues.length > 0
      ? `<ul>${issues.map((entry) => `<li>${esc(entry)}</li>`).join("")}</ul>`
      : `<div class="notice">No warnings, issues, or cross-channel notes were found.</div>`;
    const artifactStatus = isRecord(doc)
      ? normalizeRolloutStatus(str(doc.status) ?? str(doc.reason), doc.ready === true)
      : "unknown";
    const artifactTone = rolloutTone(artifactStatus);
    const readyTarget = isRecord(doc) && Array.isArray(doc.target_results)
      ? doc.target_results.find((entry) => isRecord(entry) && entry.passed === true)
      : null;
    const readyBundle = isRecord(doc) && Array.isArray(doc.bundles)
      ? doc.bundles.find((entry) => isRecord(entry) && normalizeRolloutStatus(str(entry.status), entry.ready === true) === "ready")
      : null;
    const lastKnownGood =
      str(isRecord(readyTarget) ? readyTarget.target : undefined) ??
      str(isRecord(readyBundle) ? readyBundle.bundle : undefined) ??
      (isRecord(doc) && doc.ready === true ? "artifact is already ready" : "none");
	    const rolloutPromotionGate =
	      artifactTone === "bad" ? "recover before promote" : artifactTone === "warn" ? "compare before promote" : "ready to promote";
	    const rolloutRecommendation = str(isRecord(doc) ? doc.recommendation : undefined) ?? "No explicit recommendation stored in the artifact.";
	    const currentRolloutDetailHref = uiHref("/ui/rollouts/detail", {
	      params: {
	        path: resolved.resolvedPath,
	        ...decisionStateParams(decisionState)
	      },
	      hash: "rollout-evidence"
	    });
	    const rolloutQueueHref = uiHref("/ui/rollouts", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentRolloutDetailHref
	      },
	      hash: "rollout-signal-table"
	    });
	    const benchmarkQueueHref = uiHref("/ui/benchmarks", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentRolloutDetailHref
	      },
	      hash: "benchmark-regressions"
	    });
	    const detailReturnHref = decisionState.returnTo ?? rolloutQueueHref;
	    const detailReturnLabel = decisionState.returnTo
	      ? decisionState.returnTo.includes("/candidates") || decisionState.returnTo.includes("/ab-compare")
	        ? "Reopen Compare"
	        : "Back to list"
	      : "Back to Rollouts";
	    const rawArtifactHref = uiHref("/ui/rollouts/artifact", {
	      params: {
	        path: resolved.resolvedPath
	      }
	    });
	    const detailJumpFacts: DecisionFact[] = [
	      ...(decisionState.focus
	        ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "incoming object or section focus" }]
	        : []),
	      ...(decisionState.selected.length > 0
	        ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected ids preserved in URL state` }]
	        : []),
	      ...(decisionState.compare.length > 0
	        ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare context carried into rollout detail" }]
	        : []),
	      ...(decisionState.pinned.length > 0
	        ? [{ label: "Pinned", value: summarizeValues(decisionState.pinned, 3), hint: "pinned objects remain visible in the header" }]
	        : []),
	      ...(decisionState.view
	        ? [{ label: "View", value: humanizeOpsLabel(decisionState.view), hint: "view mode preserved across the jump" }]
	        : [])
	    ];
	    const detailJumpBanner = renderDecisionJumpBanner({
	      title: "Deep-link handoff",
	      intro: "Selection, compare context, and return path stay visible so this artifact reads as a continuation of the queue or compare flow.",
	      facts: detailJumpFacts,
	      linksHtml: `<a href="${detailReturnHref}">${detailReturnLabel}</a><a href="${rolloutQueueHref}">Rollout Queue</a><a href="${benchmarkQueueHref}">Benchmark Queue</a>`,
	      tone: artifactTone
	    });
	    const rolloutRecoveryRail: DecisionCard[] = [
	      {
	        title: "Recovery path",
	        detail: artifactTone === "bad" ? "Inspect the failing target or bundle rows first, then rerun from the owning rollout flow." : "Use bundle and target rows to compare before promote or choose the rollback anchor.",
	        tone: artifactTone,
	        badge: artifactTone === "bad" ? "recover" : "review",
	        html: `<button type="button" class="secondary" data-copy="${esc(resolved.resolvedPath)}">Copy path</button><a href="${rolloutQueueHref}">Rollout Queue</a>`
	      },
	      {
	        title: "Linked review objects",
	        detail: "Keep rollout queue and benchmark queue adjacent so the operator stays in artifact-backed review instead of dropping into raw JSON.",
	        tone: "muted",
	        badge: "objects",
	        html: `<a href="${rolloutQueueHref}">Rollout Queue</a><a href="${benchmarkQueueHref}">Benchmarks</a>`
	      }
	    ];
	    const rolloutLinkedRail: DecisionCard[] = [
	      { title: "Rollout source", detail: resolved.source.label, tone: "muted", html: `<a href="${rolloutQueueHref}">Open Rollout Queue</a>` },
	      {
	        title: "Rollback anchor",
	        detail: `${lastKnownGood} is the nearest ready bundle or target currently stored in this artifact.`,
	        tone: lastKnownGood === "none" ? "warn" : "ok",
	        badge: "anchor",
	        html: `<a href="${benchmarkQueueHref}">Benchmark Queue</a><a href="${rolloutQueueHref}">Rollout Queue</a>`
	      }
	    ];
	    const rolloutEvidenceFacts: DecisionFact[] = [
	      { label: "Promotion Gate", value: rolloutPromotionGate, hint: "next operator decision" },
	      { label: "Recommendation", value: rolloutRecommendation, hint: "stored rollout recommendation" },
	      { label: "Last Known Good", value: lastKnownGood, hint: "nearest ready target / bundle" },
	      { label: "Artifact Path", value: artifactRelativePath(resolved.source.outRoot, resolved.resolvedPath), hint: "resolved artifact path" }
	    ];
	    const rolloutEvidenceDrawerBody = `<div class="decision-copy">Use the rollout review object, target rows, and bundle rows before opening raw JSON. Raw payloads are intentionally secondary because promotion should be decided from the normalized artifact summary first.</div>
	<div class="quick-links"><a href="${detailReturnHref}">${detailReturnLabel}</a><a href="${benchmarkQueueHref}">Benchmarks</a><button type="button" class="secondary" data-copy="${esc(
	      resolved.resolvedPath
	    )}">Copy path</button><a href="${rawArtifactHref}">Raw JSON</a></div>
	<details class="decision-drawer"><summary>Open rollout evidence order</summary><div class="decision-drawer-body"><div class="decision-copy">Rollout detail -> target rows -> bundle rows -> raw artifact payload. Open raw JSON only if the normalized status, recommendation, and issue summary still look inconsistent.</div></div></details>`;
	    const body = `${decisionSurfaceStyles()}<div class="decision-surface">${renderObjectHero({
      eyebrow: "Rollout Review",
      title: "Rollout Detail",
      subtitle: "Promotion gate, compare-before-promote context, and rollback anchor stay visible before any raw artifact payload.",
      statusLabel: rolloutStatusLabel(artifactStatus),
      statusTone: artifactTone,
      flash: `${flashHtml(request.query)}${detailJumpBanner}`,
      quickLinksHtml: `<a href="${detailReturnHref}">${detailReturnLabel}</a><a href="${benchmarkQueueHref}">Benchmarks</a><button type="button" class="secondary" data-copy="${esc(
        resolved.resolvedPath
      )}">Copy path</button>`,
      summaryCards: [
        { label: "Source", value: resolved.source.label, hint: resolved.source.outRoot, tone: "muted" },
        { label: "Artifact", value: path.basename(resolved.resolvedPath), hint: artifactRelativePath(resolved.source.outRoot, resolved.resolvedPath), tone: "muted" },
        { label: "Promotion Gate", value: rolloutPromotionGate, hint: "next decision at a glance", tone: artifactTone },
        { label: "Verdict", value: str(isRecord(doc) ? doc.recommendation : undefined) ?? str(isRecord(doc) ? doc.reason : undefined) ?? "-", hint: "stored rollout recommendation", tone: artifactTone },
        { label: "Issue Count", value: String(issues.length), hint: issues.length > 0 ? issues[0] : "no warnings detected", tone: issues.length > 0 ? "warn" : "ok" }
      ],
      metaItems: [
        { label: "Status", value: rolloutStatusLabel(artifactStatus), hint: "normalized rollout state" },
        { label: "Generated", value: str(isRecord(doc) ? doc.generated_at : undefined) ?? "-", hint: "artifact timestamp" },
        { label: "Source Root", value: resolved.source.label, hint: resolved.source.outRoot },
        { label: "Artifact Path", value: artifactRelativePath(resolved.source.outRoot, resolved.resolvedPath), hint: "relative path" }
      ],
      blockers: issues.length > 0 ? [{ title: "Warnings / blockers", detail: issues[0], tone: artifactTone, badge: rolloutStatusLabel(artifactStatus) }] : [],
      primaryActions: [
        {
          title: "Promotion gate",
          detail: `${rolloutRecommendation} Resolve this gate before dropping to raw JSON or rerunning the owning flow.`,
          tone: artifactTone,
          badge: rolloutPromotionGate,
          html: `<a href="${rolloutQueueHref}">Rollout Queue</a><a href="${benchmarkQueueHref}">Benchmarks</a>`
        }
      ],
	      secondaryActions: [
	        {
	          title: "Inspect related objects",
	          detail: "Jump to benchmarks or the rollout queue without losing the artifact context. Raw JSON stays behind the evidence drawer below.",
	          tone: "muted",
	          html: `<a href="${benchmarkQueueHref}">Benchmarks</a><a href="${rolloutQueueHref}">Rollout Queue</a><a href="#rollout-evidence">Evidence Drawer</a>`
	        }
	      ],
	      recoveryActions: rolloutRecoveryRail,
	      recentActivity: detailPairs.slice(0, 4).map((pair) => ({ title: pair.label, detail: pair.value, tone: "muted" })),
	      linkedObjects: rolloutLinkedRail
	    })}${renderDecisionPrioritySection({
      sectionId: "rollout-decision-rail",
      title: "Decision Rail",
      intro: "Keep promotion gate, compare-before-promote context, and rollback anchor visible before target rows or payload detail.",
      linksHtml: `<a href="${detailReturnHref}">${detailReturnLabel}</a><a href="${benchmarkQueueHref}">Benchmarks</a>`,
      railTitle: "Rollout actions",
      railIntro: "Use this rail to confirm promotion, compare before promote, rerun the owning rollout flow, or hold on the safest ready anchor.",
      railCards: [
        {
          title: "Current promotion gate",
          detail: `${rolloutRecommendation} Gate state: ${rolloutPromotionGate}.`,
          tone: artifactTone,
          badge: rolloutPromotionGate,
          html: `<a href="${rolloutQueueHref}">Rollout Queue</a><a href="${benchmarkQueueHref}">Benchmarks</a>`
        },
	        {
	          title: artifactTone === "bad" ? "Rerun or inspect" : "Compare before promote",
	          detail: artifactTone === "bad" ? "Inspect the blocking target or bundle rows first, then rerun the owning rollout flow." : "Inspect bundle and target rows only if promotion still feels uncertain.",
	          tone: artifactTone === "bad" ? "bad" : "warn",
	          badge: artifactTone === "bad" ? "rerun" : "review",
	          html: `<button type="button" class="secondary" data-copy="${esc(resolved.resolvedPath)}">Copy path</button><a href="#rollout-evidence">Evidence Drawer</a>`
	        },
        {
          title: "Rollback anchor",
          detail: `${lastKnownGood} is the closest ready bundle or target available for rollback or confirmation.`,
          tone: lastKnownGood === "none" ? "warn" : "ok",
          badge: "anchor",
          html: `<a href="${benchmarkQueueHref}">Benchmark Queue</a><a href="${rolloutQueueHref}">Rollout Queue</a>`
        }
      ],
      railEmpty: "No rollout actions are available.",
      railTone: artifactTone,
      snapshotIntro: "Failure reason, last known good state, retry path, alternate path, and rollback point stay above raw JSON.",
	      snapshotFacts: [
	        { label: "Failure Reason", value: issues[0] ?? str(isRecord(doc) ? doc.reason : undefined) ?? "none", hint: "top rollout blocker" },
	        { label: "Last Known Good", value: lastKnownGood, hint: "best ready target/bundle in this artifact" },
        { label: "Fallback Applied", value: str(isRecord(doc) ? doc.recommendation : undefined) ?? "-", hint: "recommended fallback / promotion" },
        { label: "Retry Path", value: artifactTone === "bad" ? "rerun from rollout flow" : "confirm promotion from rollout queue", hint: rolloutStatusLabel(artifactStatus) },
        { label: "Alternate Path", value: "benchmark queue / rollout queue", hint: "linked object review path" },
        { label: "Rollback Point", value: lastKnownGood, hint: "nearest ready anchor" }
      ],
	      snapshotEmpty: "No rollout recovery snapshot available.",
	      snapshotTone: artifactTone
	    })}${renderRecoveryRailSection({
	      sectionId: "rollout-recovery-rail",
	      title: "Recovery / Linked Objects",
	      intro: "Recovery order and linked review objects stay visible before target rows or raw payload detail.",
	      linksHtml: `<a href="${detailReturnHref}">${detailReturnLabel}</a><a href="${benchmarkQueueHref}">Benchmarks</a>`,
	      recoveryTitle: "Recovery rail",
	      recoveryIntro: "Use recovery order and rerun guidance before escalating to raw artifact inspection.",
	      recoveryCards: rolloutRecoveryRail,
	      recoveryEmpty: "No rollout recovery actions are available.",
	      recoveryTone: artifactTone,
	      linkedTitle: "Linked object rail",
	      linkedIntro: "Keep source and rollback anchors adjacent to the rollout detail object.",
	      linkedCards: rolloutLinkedRail,
	      linkedEmpty: "No linked rollout objects are available.",
	      linkedTone: "muted"
	    })}${renderArtifactEvidenceSection({
	      sectionId: "rollout-evidence",
	      title: "Artifact Evidence Drawer",
	      intro: "Artifact-backed rollout evidence stays adjacent; raw JSON is pushed behind the drawer.",
	      linksHtml: `<a href="${detailReturnHref}">${detailReturnLabel}</a><a href="${benchmarkQueueHref}">Benchmarks</a>`,
	      summaryTitle: "Rollout evidence summary",
	      summaryIntro: "Promotion gate, recommendation, last known good state, and artifact path stay above payload detail.",
	      summaryFacts: rolloutEvidenceFacts,
	      summaryEmpty: "No rollout evidence summary is available.",
	      summaryTone: artifactTone,
	      drawerTitle: "Rollout evidence drawer",
	      drawerIntro: "Open raw JSON only after target rows, bundle rows, and normalized evidence still feel insufficient.",
	      drawerSummary: "Open rollout evidence order and raw-evidence policy",
	      drawerBodyHtml: rolloutEvidenceDrawerBody,
	      drawerTone: "muted",
	      drawerOpen: ["evidence", "artifact", "raw"].includes(rolloutFocusValue) || decisionToken(decisionState.view) === "evidence"
	    })}
<section class="card dashboard-shell decision-jump-target" id="rollout-key-fields">
	  <div class="section-head"><h2>Key Fields</h2><span class="muted-text">Top-level artifact metadata extracted from the JSON.</span></div>
	  <div class="status-list">${metricRows}</div>
</section>
<section class="card dashboard-shell decision-jump-target" id="rollout-decision-evidence">
  <div class="section-head"><h2>Decision Evidence</h2><span class="muted-text">Warnings, validation issues, and divergence hints that explain the current promotion gate.</span></div>
  ${issueList}
</section>
	${targetRows ? `<section class="card decision-jump-target" id="rollout-target-results"><div class="section-head"><h2>Target Results</h2><span class="muted-text">Per-target rollout validation rows.</span></div><div class="table-wrap"><table><thead><tr><th>Target</th><th>Status</th><th>Score</th><th>Verdict</th><th>Reason</th></tr></thead><tbody>${targetRows}</tbody></table></div></section>` : ""}
	${bundleRows ? `<section class="card decision-jump-target" id="rollout-bundle-results"><div class="section-head"><h2>Bundle Results</h2><span class="muted-text">Per-bundle multi-channel validation rows.</span></div><div class="table-wrap"><table><thead><tr><th>Bundle</th><th>Status</th><th>Score</th><th>Verdict</th><th>Issues</th></tr></thead><tbody>${bundleRows}</tbody></table></div></section>` : ""}
	<section class="card decision-jump-target" id="rollout-raw-payload">
	  <div class="section-head"><h2>Raw Artifact Payload</h2><button type="button" class="secondary" data-copy="${esc(resolved.resolvedPath)}">Copy path</button></div>
	  <details${["raw", "payload"].includes(rolloutFocusValue) || decisionToken(decisionState.view) === "raw" ? " open" : ""}><summary>Open raw JSON only if the decision view above is insufficient.</summary><pre>${esc(rawJson)}</pre></details>
	</section></div>${renderDecisionJumpScript()}`;
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
	    const decisionState = readDecisionLinkState(request.query);
	    const benchmarkFocusValue = decisionToken(decisionState.focus);
	    const benchmarkSelectedTokens = decisionTokenSet(decisionState.selected);
	    const benchmarkPinnedTokens = decisionTokenSet(decisionState.pinned);
	    const withBenchmarkSelection = (...values: Array<string | null | undefined>): string[] =>
	      uniqueStrings([
	        ...decisionState.selected,
	        ...values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
	      ]);
	    const isBenchmarkFocused = (...values: Array<string | null | undefined>): boolean =>
	      decisionSetHas(benchmarkSelectedTokens, ...values) ||
	      decisionSetHas(benchmarkPinnedTokens, ...values) ||
	      values.some((value) => benchmarkFocusValue === decisionToken(value));
	    const { sources, backendScenarios, regressions } = collectBenchmarkViewerData();
      const benchmarkRigRows = collectRepairAcceptanceRows();
      const benchmarkLineageRows = collectDatasetLineageRows();
      const benchmarkPackIds = uniqueStrings(benchmarkLineageRows.flatMap((row) => row.packIds));
      const rigAttentionRows = benchmarkRigRows.filter(
        (row) => row.rig.rigBlocked || row.rig.reviewOnly || row.rig.lowAnchorConfidence || row.rig.recreateRecommended
      );
	    const backendReady = backendScenarios.filter((row) => normalizeRolloutStatus(row.status) === "ready").length;
	    const regressionBlocked = regressions.filter((row) => normalizeRolloutStatus(row.status) === "blocked").length;
	    const regressionWarn = regressions.filter((row) => normalizeRolloutStatus(row.status) === "warn").length;
	    const mismatchTotal = regressions.reduce((sum, row) => sum + row.mismatchCount, 0);
      const rigBlockedCount = benchmarkRigRows.filter((row) => row.rig.rigBlocked).length;
      const reviewOnlyCount = benchmarkRigRows.filter((row) => row.rig.reviewOnly).length;
      const lowAnchorCount = benchmarkRigRows.filter((row) => row.rig.lowAnchorConfidence).length;
      const repairableCount = benchmarkRigRows.filter((row) => row.rig.repairable === true).length;
      const recreateCount = benchmarkRigRows.filter((row) => row.rig.recreateRecommended).length;
      const rigSpeciesSummary = summarizeCounts(rigAttentionRows.map((row) => row.rig.speciesId), 2);
      const rigViewSummary = summarizeCounts(rigAttentionRows.map((row) => row.rig.selectedView), 2);
	    const availableSources = sources.filter((source) => source.exists).length;
	    const benchmarkCompareLinks =
	      backendScenarios.reduce((sum, row) => sum + row.candidateCompareItems.length, 0) +
	      regressions.reduce((sum, row) => sum + row.candidateCompareItems.length, 0);
	    const benchmarkTone: UiBadgeTone =
	      regressionBlocked > 0 ? "bad" : regressionWarn > 0 || mismatchTotal > 0 ? "warn" : backendScenarios.length > 0 ? "ok" : "muted";
	    const benchmarkStatusLabel =
	      regressionBlocked > 0
	        ? "recovery queue active"
	        : regressionWarn > 0 || mismatchTotal > 0
	          ? "compare before promote"
	          : backendScenarios.length > 0
	            ? "benchmark queue ready"
	            : "artifact queue empty";
	    const currentBenchmarksHref = uiHref("/ui/benchmarks", {
	      params: decisionStateParams(decisionState),
	      hash: "benchmark-regressions"
	    });
	    const benchmarkRolloutsHref = uiHref("/ui/rollouts", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentBenchmarksHref
	      },
	      hash: "rollout-signal-table"
	    });
	    const benchmarkRepairHref = uiHref("/ui/benchmarks/repair-acceptance", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentBenchmarksHref
	      },
	      hash: "repair-acceptance-table-decision"
	    });
	    const benchmarkRouteHref = uiHref("/ui/benchmarks/route-reasons", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentBenchmarksHref
	      },
	      hash: "route-reason-table-decision"
	    });
	    const benchmarkLineageHref = uiHref("/ui/benchmarks/dataset-lineage", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentBenchmarksHref
	      },
	      hash: "dataset-lineage-table-decision"
	    });
	    const benchmarkReturnHref = decisionState.returnTo ?? benchmarkRolloutsHref;
	    const benchmarkReturnLabel = decisionState.returnTo
	      ? decisionState.returnTo.includes("/candidates") || decisionState.returnTo.includes("/ab-compare")
	        ? "Reopen Compare"
	        : "Back to list"
	      : "Rollouts";
      const sourceFreshness = sources.map((source) => ({ source, freshness: describeArtifactFreshness(source.latestGeneratedAt) }));
      const staleSourceCount = sourceFreshness.filter((entry) => entry.source.exists && entry.freshness.isStale).length;
      const agingSourceCount = sourceFreshness.filter((entry) => entry.source.exists && entry.freshness.isAging).length;
      const benchmarkRefreshActions = buildBenchmarkRefreshActions({
        staleSourceCount,
        agingSourceCount,
        packIds: benchmarkPackIds
      });
	    const benchmarkSummaryCards: DecisionStat[] = [
	      { label: "Backend Objects", value: String(backendScenarios.length), hint: `${availableSources}/${sources.length} artifact roots available`, tone: "muted" },
	      { label: "Ready Backends", value: String(backendReady), hint: "usable benchmark scenarios", tone: backendReady > 0 ? "ok" : "warn" },
	      { label: "Regression Queue", value: String(regressions.length), hint: `${regressionBlocked} blocked / ${regressionWarn} warn`, tone: benchmarkTone },
        { label: "Freshness", value: `${staleSourceCount} stale / ${agingSourceCount} aging`, hint: "artifact age relative to the 168h benchmark freshness window", tone: staleSourceCount > 0 ? "bad" : agingSourceCount > 0 ? "warn" : "ok" },
	      { label: "Compare Links", value: String(benchmarkCompareLinks), hint: "candidate compare surfaces adjacent to queue review", tone: benchmarkCompareLinks > 0 ? "warn" : "muted" },
	      { label: "Render Drift", value: String(mismatchTotal), hint: "stored vs recommended render-mode mismatches", tone: mismatchTotal > 0 ? "warn" : "ok" },
        { label: "Rig Blocked", value: String(rigBlockedCount), hint: "selected winners with fail-level rig signals", tone: rigBlockedCount > 0 ? "bad" : "ok" },
        { label: "Review Only", value: String(reviewOnlyCount), hint: "anchor-backed rows still marked review_only", tone: reviewOnlyCount > 0 ? "warn" : "ok" },
        { label: "Low Anchor", value: String(lowAnchorCount), hint: "rows with low anchor confidence or low-confidence anchors", tone: lowAnchorCount > 0 ? "warn" : "ok" },
        { label: "Repairable Rig", value: String(repairableCount), hint: rigSpeciesSummary === "-" ? "repair-first candidates in queue" : rigSpeciesSummary, tone: repairableCount > 0 ? "warn" : "ok" },
        { label: "Recreate Needed", value: String(recreateCount), hint: rigViewSummary === "-" ? "recreate-required rig rows" : rigViewSummary, tone: recreateCount > 0 ? "bad" : "ok" }
	    ];

	    const sourceRows = sourceFreshness
	      .map(({ source, freshness }) => {
	        const tone: UiBadgeTone = !source.exists ? "bad" : source.recordCount > 0 ? "ok" : "warn";
        const label = !source.exists ? "missing" : source.recordCount > 0 ? `${source.recordCount} artifacts` : "empty";
        const meta = compact([
          source.exists ? "scan ok" : "root missing",
          source.latestGeneratedAt ? `latest ${fmtDate(source.latestGeneratedAt)}` : "no benchmark artifacts",
          source.exists ? freshness.detail : ""
        ]);
        return `<div class="status-row"><div class="stack"><span class="label"><strong>${esc(source.label)}</strong></span><span class="mono">${esc(source.outRoot)}</span><span class="muted-text">${esc(meta)}</span></div><div class="inline-actions"><span class="badge ${tone}">${esc(label)}</span>${source.exists ? `<span class="badge ${freshness.tone}">${esc(freshness.label)}</span>` : ""}${freshness.isStale || freshness.isAging ? `<a class="secondary" href="#benchmark-refresh-playbooks">Refresh playbooks</a>` : ""}${freshness.isStale ? `<a class="secondary" href="${benchmarkRepairHref}">Open repair queue</a>` : ""}<button type="button" class="secondary" data-copy="${esc(source.outRoot)}">Copy path</button></div></div>`;
      })
      .join("");
      const benchmarkRefreshSection = buildBenchmarkRefreshPlaybooksSection({
        staleSourceCount,
        agingSourceCount,
        benchmarkRepairHref,
        benchmarkRolloutsHref,
        actions: benchmarkRefreshActions
      });

	    const backendRows = backendScenarios
	      .map((row) => {
	        const rowId = buildDecisionAnchorId("benchmark-backend", compact([row.backend, row.renderer, row.benchmarkKind], "-") || row.artifactRelativePath);
	        const detailHref = uiHref("/ui/rollouts/detail", {
	          preserveDecision: decisionState,
	          params: {
	            path: row.detailArtifactPath,
	            returnTo: currentBenchmarksHref,
	            focus: row.backend,
	            selected: withBenchmarkSelection(row.backend, row.renderer, row.benchmarkKind)
	          },
	          hash: "rollout-evidence"
	        });
	        const smokeHref = row.smokeArtifactPath
	          ? uiHref("/ui/rollouts/detail", {
	              preserveDecision: decisionState,
	              params: {
	                path: row.smokeArtifactPath,
	                returnTo: currentBenchmarksHref,
	                focus: row.backend,
	                selected: withBenchmarkSelection(row.backend, row.renderer, row.benchmarkKind)
	              },
	              hash: "rollout-evidence"
	            })
	          : "";
	        const planHref = row.planArtifactPath
	          ? uiHref("/ui/rollouts/detail", {
	              preserveDecision: decisionState,
	              params: {
	                path: row.planArtifactPath,
	                returnTo: currentBenchmarksHref,
	                focus: row.backend,
	                selected: withBenchmarkSelection(row.backend, row.renderer, row.benchmarkKind)
	              },
	              hash: "rollout-evidence"
	            })
	          : "";
	        const candidateLinks = row.candidateCompareItems
	          .map((item) => `<a href="${uiHref("/ui/benchmarks/candidates", {
	            preserveDecision: decisionState,
	            params: {
	              path: item.path,
	              returnTo: currentBenchmarksHref,
	              focus: "selected",
	              selected: withBenchmarkSelection(row.backend, row.renderer, row.benchmarkKind),
	              compare: withBenchmarkSelection(item.label, row.backend)
	            },
	            hash: "candidate-compare-shell"
	          })}">${esc(item.label)}</a>`)
	          .join("");
          const repairHandoffLinks = buildRigRepairHandoffLinks({
            currentHref: currentBenchmarksHref,
            characterPackId: row.characterPackId,
            fixturePath: row.fixturePath,
            repairable: row.repairable,
            recreateRecommended: row.recreateRecommended
          });
	        return `<tr id="${rowId}" class="decision-focus-row${isBenchmarkFocused(row.backend, row.renderer, row.benchmarkKind, row.artifactRelativePath) ? " is-focused" : ""}">
	          <td><div class="table-note"><strong>${esc(row.backend)}</strong><span class="muted-text">${esc(`${row.benchmarkKind} / ${row.renderer}`)}</span><span class="muted-text">${esc(compact([row.speciesId ? `species ${row.speciesId}` : null, row.selectedView ? `view ${row.selectedView}` : null, row.repairable === true ? "repairable" : row.recreateRecommended ? "recreate_required" : null]) || "-")}</span><span class="mono">${esc(row.artifactRelativePath)}</span><div class="inline-actions"><a href="${detailHref}">Decision Detail</a>${smokeHref ? `<a href="${smokeHref}">Smoke</a>` : ""}${planHref ? `<a href="${planHref}">Plan</a>` : ""}${repairHandoffLinks}${candidateLinks}<button type="button" class="secondary" data-copy="${esc(row.detailArtifactPath)}">Copy path</button></div></div></td>
	          <td><span class="badge ${row.tone}">${esc(rolloutStatusLabel(row.status))}</span></td>
	          <td>${esc(row.latencyMs)}</td>
	          <td>${esc(row.acceptanceRate)}</td>
          <td>${esc(row.failureRate)}</td>
          <td><div class="table-note"><strong>${esc(row.notes)}</strong><span class="muted-text">${esc(row.rigReasonFamilies.length > 0 ? `families ${summarizeValues(row.rigReasonFamilies, 3)}` : "-")}</span><span class="muted-text">${esc(row.repairLineageSummary.length > 0 ? `lineage ${summarizeValues(row.repairLineageSummary, 2)}` : row.directiveFamilySummary.length > 0 ? `directives ${summarizeValues(row.directiveFamilySummary, 2)}` : "-")}</span></div></td>
          <td><div class="stack"><strong>${esc(row.sourceLabel)}</strong><span class="mono">${esc(row.sourcePath)}</span><span class="muted-text">${fmtDate(row.generatedAt)}</span></div></td>
        </tr>`;
      })
      .join("");

	    const regressionRows = regressions
	      .map((row) => {
	        const rowId = buildDecisionAnchorId("benchmark-regression", compact([row.episodeId, row.benchmarkName], "-") || row.artifactRelativePath);
	        const detailHref = uiHref("/ui/rollouts/detail", {
	          preserveDecision: decisionState,
	          params: {
	            path: row.artifactPath,
	            returnTo: currentBenchmarksHref,
	            focus: row.episodeId,
	            selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
	          },
	          hash: "rollout-evidence"
	        });
	        const smokeHref = row.smokeArtifactPath
	          ? uiHref("/ui/rollouts/detail", {
	              preserveDecision: decisionState,
	              params: {
	                path: row.smokeArtifactPath,
	                returnTo: currentBenchmarksHref,
	                focus: row.episodeId,
	                selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
	              },
	              hash: "rollout-evidence"
	            })
	          : "";
	        const renderModeHref = row.renderModeArtifactPath
	          ? uiHref("/ui/rollouts/detail", {
	              preserveDecision: decisionState,
	              params: {
	                path: row.renderModeArtifactPath,
	                returnTo: currentBenchmarksHref,
	                focus: row.episodeId,
	                selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
	              },
	              hash: "rollout-evidence"
	            })
	          : "";
	        const rowRepairHref = uiHref("/ui/benchmarks/repair-acceptance", {
	          preserveDecision: decisionState,
	          params: {
	            q: row.episodeId,
	            source: row.sourcePath,
	            returnTo: currentBenchmarksHref,
	            focus: row.episodeId,
	            selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
	          },
	          hash: "repair-acceptance-table"
	        });
	        const rowRouteHref = uiHref("/ui/benchmarks/route-reasons", {
	          preserveDecision: decisionState,
	          params: {
	            q: row.episodeId,
	            source: row.sourcePath,
	            returnTo: currentBenchmarksHref,
	            focus: row.episodeId,
	            selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
	          },
	          hash: "route-reason-table"
	        });
	        const rowLineageHref = uiHref("/ui/benchmarks/dataset-lineage", {
	          preserveDecision: decisionState,
	          params: {
	            episodeId: row.episodeId,
	            source: row.sourcePath,
	            returnTo: currentBenchmarksHref,
	            focus: row.episodeId,
	            selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath)
	          },
	          hash: "dataset-lineage-table"
	        });
	        const candidateLinks = row.candidateCompareItems
	          .map((item) => `<a href="${uiHref("/ui/benchmarks/candidates", {
	            preserveDecision: decisionState,
	            params: {
	              path: item.path,
	              returnTo: currentBenchmarksHref,
	              focus: "selected",
	              selected: withBenchmarkSelection(row.episodeId, row.benchmarkName, row.bundlePath),
	              compare: withBenchmarkSelection(item.label, row.episodeId)
	            },
	            hash: "candidate-compare-shell"
	          })}">${esc(item.label)}</a>`)
	          .join("");
	        return `<tr id="${rowId}" class="decision-focus-row${isBenchmarkFocused(row.episodeId, row.benchmarkName, row.bundlePath, row.artifactRelativePath) ? " is-focused" : ""}">
	          <td><div class="table-note"><strong>${esc(row.benchmarkName)}</strong><span class="muted-text">${esc(row.bundlePath)}</span><span class="mono">${esc(row.artifactRelativePath)}</span><div class="inline-actions"><a href="${detailHref}">Decision Detail</a>${smokeHref ? `<a href="${smokeHref}">Smoke</a>` : ""}${renderModeHref ? `<a href="${renderModeHref}">Render Modes</a>` : ""}<a href="${rowRepairHref}">Repair</a><a href="${rowRouteHref}">route_reason</a><a href="${rowLineageHref}">Lineage</a>${candidateLinks}<button type="button" class="secondary" data-copy="${esc(row.artifactPath)}">Copy path</button></div></div></td>
	          <td><span class="badge ${row.tone}">${esc(rolloutStatusLabel(row.status))}</span></td>
	          <td>${esc(`${row.warningCount} warn / ${row.errorCount} err`)}</td>
	          <td>${esc(row.profileSummary)}</td>
          <td>${esc(row.renderModeSummary)}</td>
          <td>${esc(row.issueSummary)}</td>
          <td><div class="stack"><strong>${esc(row.sourceLabel)}</strong><span class="mono">${esc(row.sourcePath)}</span><span class="muted-text">${fmtDate(row.generatedAt)}</span></div></td>
        </tr>`;
      })
      .join("");

	    const benchmarkBlockers: DecisionCard[] = [];
	    if (regressionBlocked > 0) {
	      benchmarkBlockers.push({
	        title: "Regression blockers in queue",
	        detail: `${regressionBlocked} regression objects are blocked or failed. Clear those before treating backend-ready rows as promotable evidence.`,
	        tone: "bad",
	        badge: "blocked"
	      });
	    }
	    if (availableSources < sources.length) {
	      benchmarkBlockers.push({
	        title: "Artifact roots missing",
	        detail: `${sources.length - availableSources} configured roots are missing, so queue coverage is incomplete for this review object.`,
	        tone: "warn",
	        badge: "sources"
	      });
	    }
      if (rigBlockedCount > 0) {
        benchmarkBlockers.push({
          title: "Rig-blocked winners in queue",
          detail: `${rigBlockedCount} benchmark shots currently point at selected candidates with fail-level rig signals. Keep those in compare-before-promote review.`,
          tone: "bad",
          badge: "rig"
        });
      }
	    const benchmarkPrimaryActions: DecisionCard[] = [
	      {
	        title: "Start with blocked regression rows",
	        detail: regressionBlocked > 0 ? `${regressionBlocked} blocked rows should be cleared before backend-ready scenarios are treated as promotion candidates.` : "Regression blockers are clear. Use the queue to confirm compare-before-promote readiness.",
	        tone: benchmarkTone,
	        badge: regressionBlocked > 0 ? "recover" : "ready",
	        html: `<a href="#benchmark-regressions">Regression Queue</a><a href="${benchmarkRolloutsHref}">Rollouts</a>`
	      }
	    ];
	    const benchmarkSecondaryActions: DecisionCard[] = [
	      {
	        title: "Compare before promote",
	        detail: benchmarkCompareLinks > 0 ? `${benchmarkCompareLinks} candidate compare links are attached to the queue. Stay in those review objects before dropping to raw evidence.` : "Candidate compare artifacts are sparse in this queue, so rely on rollout detail, smoke, and route explorers instead.",
	        tone: benchmarkCompareLinks > 0 ? "warn" : "muted",
	        badge: "compare",
	        html: `<a href="${benchmarkRepairHref}">Acceptance Explorer</a><a href="${benchmarkRouteHref}">Route Explorer</a>`
	      }
	    ];
	    const benchmarkRecoveryActions: DecisionCard[] = [
	      {
	        title: "Recovery path",
	        detail: "Acceptance, route reason, and lineage explorers stay adjacent so blocked bundles recover without forcing the operator into raw JSON.",
	        tone: benchmarkTone,
	        badge: "recover",
	        html: `<a href="${benchmarkRepairHref}">Acceptance</a><a href="${benchmarkLineageHref}">Lineage</a>`
	      }
	    ];
	    const benchmarkLinkedObjects: DecisionCard[] = [
	      { title: "Rollout queue", detail: "Benchmark review hands off to rollout review once a candidate is promotion-ready.", tone: "muted", html: `<a href="${benchmarkRolloutsHref}">Open Rollouts</a>` },
	      { title: "Artifact sources", detail: `${availableSources}/${sources.length} roots are readable for this queue object.`, tone: availableSources === sources.length ? "ok" : "warn", badge: "sources", html: `<a href="#benchmark-sources">Artifact Sources</a>` }
	    ];
	    const benchmarkDecisionRail: DecisionCard[] = [
	      {
	        title: regressionBlocked > 0 ? "Recover blocked regressions" : "Benchmark queue gate",
	        detail: regressionBlocked > 0 ? "Blocked regressions stay ahead of backend browsing. Recover those rows before treating the queue as promotable." : "If the regression queue is clean, use backend and compare objects to confirm promotable benchmark outputs.",
	        tone: benchmarkTone,
	        badge: regressionBlocked > 0 ? "recover" : "gate",
	        html: `<a href="#benchmark-regressions">Regression Queue</a><a href="#benchmark-backends">Backend Objects</a>`
	      },
	      {
	        title: "Compare before promote",
	        detail: benchmarkCompareLinks > 0 ? `${benchmarkCompareLinks} compare links remain available from the queue. Use them before opening deeper artifact evidence.` : "Stay in rollout detail, smoke, and route explorers when compare artifacts are missing.",
	        tone: benchmarkCompareLinks > 0 ? "warn" : "muted",
	        badge: "compare",
	        html: `<a href="${benchmarkRolloutsHref}">Rollouts</a><a href="${benchmarkRouteHref}">Route Explorer</a>`
	      },
	      {
	        title: "Rollback anchor",
	        detail: backendReady > 0 ? `${backendReady} backend scenarios are currently usable as the cleanest queue-side benchmark anchor.` : "No backend-ready scenario is available yet, so regression recovery remains the current anchor.",
	        tone: backendReady > 0 ? "ok" : "warn",
	        badge: "rollback",
	        html: `<a href="${benchmarkRepairHref}">Acceptance Explorer</a><a href="${benchmarkRolloutsHref}">Rollouts</a>`
	      }
	    ];
	    const benchmarkSnapshotFacts: DecisionFact[] = [
	      { label: "Failure Reason", value: regressionBlocked > 0 ? `${regressionBlocked} blocked regression rows` : regressionWarn > 0 ? `${regressionWarn} warning regression rows` : "none", hint: "top benchmark blocker" },
	      { label: "Last Known Good", value: backendReady > 0 ? `${backendReady} ready backend scenarios` : "no ready backend scenario", hint: "queue-side clean anchor" },
	      { label: "Fallback Applied", value: mismatchTotal > 0 ? `${mismatchTotal} render drift mismatches` : "no render drift", hint: "current compare baggage" },
	      { label: "Retry Path", value: regressionBlocked > 0 ? "repair explorer -> rollout detail -> candidate compare" : "benchmark queue -> rollout detail", hint: benchmarkStatusLabel },
	      { label: "Alternate Path", value: "repair / route / lineage explorers", hint: "adjacent review surfaces" },
	      { label: "Rollback Point", value: backendReady > 0 ? "ready backend scenarios" : "regression recovery queue", hint: "benchmark queue rollback anchor" }
	    ];
	    const benchmarkEvidenceFacts: DecisionFact[] = [
	      { label: "Sources", value: `${availableSources}/${sources.length}`, hint: "configured artifact roots available" },
	      { label: "Backend Objects", value: String(backendScenarios.length), hint: "artifact-backed backend scenarios" },
	      { label: "Regression Objects", value: String(regressions.length), hint: `${regressionBlocked} blocked / ${regressionWarn} warn` },
	      { label: "Compare Links", value: String(benchmarkCompareLinks), hint: "candidate compare surfaces attached to queue" },
        { label: "Rig Flags", value: `${rigBlockedCount} blocked / ${reviewOnlyCount} review_only / ${lowAnchorCount} low anchor`, hint: "selected-candidate rig summary across benchmark shots" }
	    ];
	    const benchmarkJumpFacts: DecisionFact[] = [
	      ...(decisionState.focus
	        ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "incoming object or section focus" }]
	        : []),
	      ...(decisionState.selected.length > 0
	        ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected ids preserved in queue state` }]
	        : []),
	      ...(decisionState.compare.length > 0
	        ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare handoff kept adjacent to benchmark review" }]
	        : []),
	      ...(decisionState.pinned.length > 0
	        ? [{ label: "Pinned", value: summarizeValues(decisionState.pinned, 3), hint: "pinned objects remain visible in the header" }]
	        : []),
	      ...(decisionState.view
	        ? [{ label: "View", value: humanizeOpsLabel(decisionState.view), hint: "view mode preserved across the jump" }]
	        : [])
	    ];
	    const benchmarkJumpBanner = renderDecisionJumpBanner({
	      title: "Deep-link handoff",
	      intro: "Selection, compare context, and return path stay visible so the benchmark queue reads as the next decision surface instead of a detached artifact list.",
	      facts: benchmarkJumpFacts,
	      linksHtml: `<a href="${benchmarkReturnHref}">${benchmarkReturnLabel}</a><a href="${benchmarkRolloutsHref}">Rollouts</a><a href="${currentBenchmarksHref}">Refresh handoff</a>`,
	      tone: benchmarkTone
	    });
	    const benchmarkEvidenceDrawerBody = `<div class="decision-copy">This queue is an artifact-backed benchmark review object. Use decision detail, smoke, render modes, and compare surfaces before raw artifact payloads.</div><div class="status-list">${sourceRows || '<div class="notice">No benchmark artifact sources configured.</div>'}</div><details class="decision-drawer"><summary>Open benchmark evidence order</summary><div class="decision-drawer-body"><div class="decision-copy">Benchmark queue -> regression queue -> rollout detail -> candidate compare -> raw artifact payloads. Raw evidence should be the fallback, not the default queue workflow.</div><div class="quick-links"><a href="${benchmarkRolloutsHref}">Rollouts</a><a href="/ui/artifacts">Artifacts</a></div></div></details>`;
	    const benchmarksBody = `${decisionSurfaceStyles()}<div class="decision-surface">${renderObjectHero({
	      eyebrow: "Benchmark Review",
	      title: "Benchmarks",
	      subtitle: "Treat benchmarks as artifact-backed review objects: blocked regressions, compare-before-promote context, and rollback anchors stay above source rows and raw evidence.",
	      statusLabel: benchmarkStatusLabel,
	      statusTone: benchmarkTone,
	      flash: `${flashHtml(request.query)}${benchmarkJumpBanner}`,
	      quickLinksHtml: `<a href="${benchmarkReturnHref}">${benchmarkReturnLabel}</a><a href="${benchmarkRolloutsHref}">Open Rollouts</a><a href="${benchmarkRepairHref}">Acceptance</a><a href="${benchmarkRouteHref}">Route Explorer</a><a href="${benchmarkLineageHref}">Lineage</a>`,
	      summaryCards: benchmarkSummaryCards,
	      metaItems: [
	        { label: "Artifact Sources", value: `${availableSources}/${sources.length}`, hint: "configured roots available" },
	        { label: "Ready Backends", value: String(backendReady), hint: "usable backend scenarios" },
	        { label: "Regression Blocked", value: String(regressionBlocked), hint: "blocked or failed regression objects" },
	        { label: "Rollout Handoff", value: benchmarkCompareLinks > 0 ? "candidate compare ready" : "detail-first review", hint: "queue-side handoff to rollout objects" }
	      ],
	      blockers: benchmarkBlockers,
	      primaryActions: benchmarkPrimaryActions,
	      secondaryActions: benchmarkSecondaryActions,
	      recoveryActions: benchmarkRecoveryActions,
	      recentActivity: regressions.slice(0, 4).map((row) => ({
	        title: row.benchmarkName,
	        detail: `${rolloutStatusLabel(row.status)} | ${row.issueSummary} | ${fmtDate(row.generatedAt)}`,
	        tone: row.tone,
	        badge: row.episodeId
	      })),
	      linkedObjects: benchmarkLinkedObjects
	    })}${renderDecisionPrioritySection({
	      sectionId: "benchmark-decision-rail",
	      title: "Decision Rail",
	      intro: "Blocked regressions, compare-before-promote rules, and rollback anchors stay above queue scanning.",
	      linksHtml: `<a href="${benchmarkReturnHref}">${benchmarkReturnLabel}</a><a href="#benchmark-backends">Backend Objects</a><a href="${benchmarkRolloutsHref}">Rollouts</a>`,
	      railTitle: "Benchmark actions",
	      railIntro: "Recover blocked rows first, compare before promote, then use the cleanest ready scenario as the queue-side rollback anchor.",
	      railCards: benchmarkDecisionRail,
	      railEmpty: "No benchmark actions are available.",
	      railTone: benchmarkTone,
	      snapshotIntro: "Failure reason, last-known-good queue anchor, retry path, and rollback point stay above queue tables.",
	      snapshotFacts: benchmarkSnapshotFacts,
	      snapshotEmpty: "No benchmark recovery snapshot is available.",
	      snapshotTone: benchmarkTone
	    })}${renderRecoveryRailSection({
	      sectionId: "benchmark-recovery-rail",
	      title: "Recovery / Linked Objects",
	      intro: "Recovery explorers and linked queues stay visible before table-heavy evidence.",
	      linksHtml: `<a href="${benchmarkRepairHref}">Acceptance</a><a href="${benchmarkRouteHref}">Route Explorer</a><a href="${benchmarkLineageHref}">Lineage</a>`,
	      recoveryTitle: "Recovery rail",
	      recoveryIntro: "Keep acceptance, route, and lineage explorers adjacent to the queue so review stays at the decision layer.",
	      recoveryCards: benchmarkRecoveryActions,
	      recoveryEmpty: "No benchmark recovery rail is available.",
	      recoveryTone: benchmarkTone,
	      linkedTitle: "Linked object rail",
	      linkedIntro: "Rollout queue and artifact sources remain attached to the benchmark queue object.",
	      linkedCards: benchmarkLinkedObjects,
	      linkedEmpty: "No linked benchmark objects are available.",
	      linkedTone: "muted"
	    })}${benchmarkRefreshSection}${renderArtifactEvidenceSection({
	      sectionId: "benchmark-evidence",
	      title: "Artifact Evidence Drawer",
	      intro: "Artifact sources and raw evidence stay available, but the queue remains the primary review surface.",
	      linksHtml: `<a href="${benchmarkReturnHref}">${benchmarkReturnLabel}</a><a href="/ui/artifacts">Artifacts</a>`,
	      summaryTitle: "Benchmark evidence summary",
	      summaryIntro: "Source availability, queue counts, and compare links stay above source rows.",
	      summaryFacts: benchmarkEvidenceFacts,
	      summaryEmpty: "No benchmark evidence summary is available.",
	      summaryTone: benchmarkTone,
	      drawerTitle: "Benchmark evidence drawer",
	      drawerIntro: "Open source roots and evidence order only after the queue still looks inconclusive.",
	      drawerSummary: "Open benchmark evidence order and raw-evidence policy",
	      drawerBodyHtml: benchmarkEvidenceDrawerBody,
	      drawerTone: "muted",
	      drawerOpen: ["evidence", "artifact", "raw"].includes(benchmarkFocusValue) || decisionToken(decisionState.view) === "evidence"
	    })}<section class="card decision-jump-target" id="benchmark-backends"><div class="section-head"><div><h2>Backend Review Objects</h2><p class="section-intro">Use backend artifacts as the primary compare-before-promote surface.</p></div><input type="search" data-table-filter="benchmark-backend-table" aria-label="Filter backend benchmark objects" placeholder="Search backend, renderer, detail path..."/></div><div class="table-wrap"><table id="benchmark-backend-table"><thead><tr><th>Scenario / Next Action</th><th>Status</th><th>Latency</th><th>Acceptance</th><th>Failure</th><th>Notes</th><th>Source</th></tr></thead><tbody>${backendRows || '<tr><td colspan="7"><div class="notice">No backend benchmark scenarios were found.</div></td></tr>'}</tbody></table></div></section><section class="card decision-jump-target" id="benchmark-regressions"><div class="section-head"><div><h2>Regression Review Queue</h2><p class="section-intro">Blocked and warning regression objects stay explicit so recovery starts here.</p></div><input type="search" data-table-filter="benchmark-regression-table" aria-label="Filter benchmark regression objects" placeholder="Search bundle, episode, issue, render drift..."/></div><div class="table-wrap"><table id="benchmark-regression-table"><thead><tr><th>Regression Object / Next Action</th><th>Status</th><th>Warnings / Errors</th><th>Profiles</th><th>Render Path</th><th>Issue Summary</th><th>Source</th></tr></thead><tbody>${regressionRows || '<tr><td colspan="7"><div class="notice">No regression artifacts were found.</div></td></tr>'}</tbody></table></div></section><section class="card decision-jump-target" id="benchmark-sources"><div class="section-head"><div><h2>Artifact Sources</h2><p class="section-intro">Source roots remain available as supporting evidence, but they no longer lead the page narrative.</p></div></div><div class="status-list">${sourceRows || '<div class="notice">No benchmark artifact sources configured.</div>'}</div></section></div>${renderDecisionJumpScript()}`;
	    return reply.type("text/html; charset=utf-8").send(page("Benchmarks", benchmarksBody));
	  });

  app.get("/ui/benchmarks/repair-acceptance", async (request, reply) => {
    const statusFilter = (q(request.query, "status") ?? "").toLowerCase();
    const repairFilter = (q(request.query, "repair") ?? "").toLowerCase();
    const backendFilter = (q(request.query, "backend") ?? "").toLowerCase();
    const bundleFilter = (q(request.query, "bundle") ?? "").toLowerCase();
    const sourceFilter = (q(request.query, "source") ?? "").toLowerCase();
    const speciesFilter = (q(request.query, "species") ?? "").toLowerCase();
    const viewFilter = (q(request.query, "view") ?? "").toLowerCase();
    const rigFilter = (q(request.query, "rig") ?? "").toLowerCase();
    const fallbackFilter = (q(request.query, "fallback") ?? "").toLowerCase();
    const reviewOnlyFilter = q(request.query, "reviewOnly") === "1";
    const lowAnchorFilter = q(request.query, "lowAnchor") === "1";
    const recreateFilter = q(request.query, "recreate") === "1";
    const repairableFilter = q(request.query, "repairable") === "1";
    const queryFilter = (q(request.query, "q") ?? "").toLowerCase();
    const decisionState = readDecisionLinkState(request.query);
    const repairFocusValue = decisionToken(decisionState.focus);
    const repairSelectedTokens = decisionTokenSet(decisionState.selected);
    const repairPinnedTokens = decisionTokenSet(decisionState.pinned);
    const withRepairSelection = (...values: Array<string | null | undefined>): string[] =>
      uniqueStrings([
        ...decisionState.selected,
        ...values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      ]);
    const isRepairFocused = (...values: Array<string | null | undefined>): boolean =>
      decisionSetHas(repairSelectedTokens, ...values) ||
      decisionSetHas(repairPinnedTokens, ...values) ||
      values.some((value) => repairFocusValue === decisionToken(value));
    const rows = collectRepairAcceptanceRows().filter((row) => {
      if (statusFilter && ![row.acceptanceStatus, row.qcStatus].some((value) => value.toLowerCase().includes(statusFilter))) return false;
      if (repairFilter && !row.repairSignals.some((value) => value.toLowerCase().includes(repairFilter))) return false;
      if (backendFilter && ![row.backend, row.renderer, row.providerSummary].some((value) => value.toLowerCase().includes(backendFilter))) return false;
      if (bundleFilter && ![row.bundle, row.scenario].some((value) => value.toLowerCase().includes(bundleFilter))) return false;
      if (sourceFilter && ![row.sourceLabel, row.sourcePath].some((value) => value.toLowerCase().includes(sourceFilter))) return false;
      if (speciesFilter && !(row.rig.speciesId ?? "").toLowerCase().includes(speciesFilter)) return false;
      if (viewFilter && !(row.rig.selectedView ?? "").toLowerCase().includes(viewFilter)) return false;
      if (rigFilter && !row.rig.rigReasonCodes.some((value) => value.toLowerCase().includes(rigFilter))) return false;
      if (fallbackFilter && !row.rig.fallbackReasonCodes.some((value) => value.toLowerCase().includes(fallbackFilter))) return false;
      if (reviewOnlyFilter && !row.rig.reviewOnly) return false;
      if (lowAnchorFilter && !row.rig.lowAnchorConfidence) return false;
      if (recreateFilter && !row.rig.recreateRecommended) return false;
      if (repairableFilter && row.rig.repairable !== true) return false;
      if (
        queryFilter &&
        ![
          row.episodeId,
          row.shotId,
          row.qcSummary,
          row.issueSummary,
          row.failureSummary,
          row.judgeSummary,
          row.repairSummary,
          row.policySummary,
          row.selectedCandidateId,
          row.rig.speciesId ?? "",
          row.rig.selectedView ?? "",
          ...row.rig.rigReasonFamilies,
          ...row.rig.requiredManualSlots,
          ...row.rig.repairLineageSummary,
          ...row.rig.rigReasonCodes,
          ...row.rig.fallbackReasonCodes
        ].some((value) => value.toLowerCase().includes(queryFilter))
      ) {
        return false;
      }
      return true;
    });

    const freshnessSummary = summarizeArtifactFreshnessForRows(rows);
    const summaryCards = [
      { label: "Rows", value: String(rows.length), tone: "muted" as UiBadgeTone, hint: "sidecar artifacts in scope" },
      { label: "Rejected", value: String(rows.filter((row) => row.acceptanceTone === "bad").length), tone: "bad" as UiBadgeTone, hint: "rejected or failed artifacts" },
      { label: "QC Failed", value: String(rows.filter((row) => row.qcTone === "bad").length), tone: "bad" as UiBadgeTone, hint: "qc reasons need operator review" },
      { label: "Freshness", value: `${freshnessSummary.staleCount} stale / ${freshnessSummary.agingCount} aging / ${freshnessSummary.unknownCount} unknown`, tone: freshnessSummary.staleCount > 0 ? "bad" as UiBadgeTone : freshnessSummary.agingCount > 0 || freshnessSummary.unknownCount > 0 ? "warn" as UiBadgeTone : "ok" as UiBadgeTone, hint: freshnessSummary.newestDetail },
      { label: "Rig Blocked", value: String(rows.filter((row) => row.rig.rigBlocked).length), tone: "bad" as UiBadgeTone, hint: "selected candidates with fail-level rig signals" },
      { label: "Review Only", value: String(rows.filter((row) => row.rig.reviewOnly).length), tone: "warn" as UiBadgeTone, hint: "rows still tagged review_only" },
      { label: "Low Anchor", value: String(rows.filter((row) => row.rig.lowAnchorConfidence).length), tone: "warn" as UiBadgeTone, hint: "low anchor confidence or low-confidence anchors" },
      { label: "Repairable", value: String(rows.filter((row) => row.rig.repairable === true).length), tone: "warn" as UiBadgeTone, hint: summarizeCounts(rows.map((row) => row.rig.speciesId), 2) },
      { label: "Recreate", value: String(rows.filter((row) => row.rig.recreateRecommended).length), tone: "bad" as UiBadgeTone, hint: summarizeCounts(rows.map((row) => row.rig.selectedView), 2) }
    ]
      .map((card) => `<div class="summary-card"><span class="badge ${card.tone}">${esc(card.label)}</span><div class="metric">${esc(card.value)}</div><div class="caption">${esc(card.hint)}</div></div>`)
      .join("");
    const currentRepairHref = uiHref("/ui/benchmarks/repair-acceptance", {
      params: {
        status: statusFilter || null,
        repair: repairFilter || null,
        backend: backendFilter || null,
        bundle: bundleFilter || null,
        source: sourceFilter || null,
        species: speciesFilter || null,
        view: viewFilter || null,
        rig: rigFilter || null,
        fallback: fallbackFilter || null,
        reviewOnly: reviewOnlyFilter ? "1" : null,
        lowAnchor: lowAnchorFilter ? "1" : null,
        recreate: recreateFilter ? "1" : null,
        repairable: repairableFilter ? "1" : null,
        q: queryFilter || null,
        ...decisionStateParams(decisionState)
      },
      hash: "repair-acceptance-table"
    });
    const repairBenchmarksHref = uiHref("/ui/benchmarks", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentRepairHref
      },
      hash: "benchmark-regressions"
    });
    const repairRolloutsHref = uiHref("/ui/rollouts", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentRepairHref
      },
      hash: "rollout-signal-table"
    });
    const repairRouteHref = uiHref("/ui/benchmarks/route-reasons", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentRepairHref
      },
      hash: "route-reason-table-decision"
    });
    const repairLineageHref = uiHref("/ui/benchmarks/dataset-lineage", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentRepairHref
      },
      hash: "dataset-lineage-table-decision"
    });
    const repairPlaybooksHref = uiHref("/ui/benchmarks/repair-acceptance", {
      params: {
        status: statusFilter || null,
        repair: repairFilter || null,
        source: sourceFilter || null,
        backend: backendFilter || null,
        bundle: bundleFilter || null,
        fallback: fallbackFilter || null,
        species: speciesFilter || null,
        view: viewFilter || null,
        rig: rigFilter || null,
        reviewOnly: reviewOnlyFilter ? "1" : null,
        lowAnchor: lowAnchorFilter ? "1" : null,
        recreate: recreateFilter ? "1" : null,
        repairable: repairableFilter ? "1" : null,
        q: queryFilter || null,
        ...decisionStateParams(decisionState)
      },
      hash: "benchmark-refresh-playbooks"
    });
    const repairReturnHref = decisionState.returnTo ?? repairBenchmarksHref;
    const repairReturnLabel = decisionState.returnTo
      ? decisionState.returnTo.includes("/candidates") || decisionState.returnTo.includes("/ab-compare")
        ? "Reopen Compare"
        : "Back to list"
      : "Benchmark Queue";
    const filters = `
<form method="get" action="/ui/benchmarks/repair-acceptance">
  <div class="quick-grid">
    <div class="field"><label for="repair-status">Acceptance / QC status</label><input id="repair-status" name="status" value="${esc(statusFilter)}" placeholder="accepted, rejected, failed..."/></div>
    <div class="field"><label for="repair-signal">Repair signal</label><input id="repair-signal" name="repair" value="${esc(repairFilter)}" placeholder="identity_repair, rejection..."/></div>
    <div class="field"><label for="repair-backend">Backend / renderer</label><input id="repair-backend" name="backend" value="${esc(backendFilter)}" placeholder="wan, hunyuan..."/></div>
    <div class="field"><label for="repair-bundle">Bundle / scenario</label><input id="repair-bundle" name="bundle" value="${esc(bundleFilter)}" placeholder="economy, convergence..."/></div>
    <div class="field"><label for="repair-source">Source root</label><input id="repair-source" name="source" value="${esc(sourceFilter)}" placeholder="local worktree..."/></div>
    <div class="field"><label for="repair-species">Species</label><input id="repair-species" name="species" value="${esc(speciesFilter)}" placeholder="cat, dog, wolf..."/></div>
    <div class="field"><label for="repair-view">View</label><input id="repair-view" name="view" value="${esc(viewFilter)}" placeholder="front, threeQuarter, profile..."/></div>
    <div class="field"><label for="repair-rig">Rig reason code</label><input id="repair-rig" name="rig" value="${esc(rigFilter)}" placeholder="head_pose_below_threshold, review_only..."/></div>
    <div class="field"><label for="repair-fallback">Fallback reason code</label><input id="repair-fallback" name="fallback" value="${esc(fallbackFilter)}" placeholder="metadata_head_pose_fallback, anchor_manifest..."/></div>
    <div class="field"><label><input type="checkbox" name="reviewOnly" value="1"${reviewOnlyFilter ? " checked" : ""}/> review_only only</label></div>
    <div class="field"><label><input type="checkbox" name="lowAnchor" value="1"${lowAnchorFilter ? " checked" : ""}/> low anchor only</label></div>
    <div class="field"><label><input type="checkbox" name="recreate" value="1"${recreateFilter ? " checked" : ""}/> recreate recommended</label></div>
    <div class="field"><label><input type="checkbox" name="repairable" value="1"${repairableFilter ? " checked" : ""}/> repairable only</label></div>
    <div class="field"><label for="repair-q">Free text</label><input id="repair-q" name="q" value="${esc(queryFilter)}" placeholder="episode id, shot id, failure, qc reason..."/></div>
  </div>
  ${renderDecisionStateHiddenInputs(decisionState)}
  <div class="actions"><button type="submit" data-primary-action="1">Apply filters</button><a href="${uiHref("/ui/benchmarks/repair-acceptance", { params: decisionStateParams(decisionState) })}">Reset explorer</a></div>
</form>`;
    const tableRows = rows
      .map((row) => {
        const rowId = buildDecisionAnchorId("repair-row", compact([row.episodeId, row.shotId], "-") || row.artifactRelativePath);
        const smokeHref = uiHref("/ui/rollouts/detail", {
          preserveDecision: decisionState,
          params: {
            path: row.smokeArtifactPath,
            returnTo: currentRepairHref,
            focus: row.shotId,
            selected: withRepairSelection(row.episodeId, row.shotId, row.selectedCandidateId)
          },
          hash: "rollout-evidence"
        });
        const planHref = row.planArtifactPath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.planArtifactPath,
                returnTo: currentRepairHref,
                focus: row.shotId,
                selected: withRepairSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const qcHref = row.qcArtifactPath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.qcArtifactPath,
                returnTo: currentRepairHref,
                focus: row.shotId,
                selected: withRepairSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const renderLogHref = row.renderLogPath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.renderLogPath,
                returnTo: currentRepairHref,
                focus: row.shotId,
                selected: withRepairSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const actualJudgeHref = row.actualJudgePath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.actualJudgePath,
                returnTo: currentRepairHref,
                focus: row.selectedCandidateId,
                selected: withRepairSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const visualJudgeHref = row.visualJudgePath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.visualJudgePath,
                returnTo: currentRepairHref,
                focus: row.selectedCandidateId,
                selected: withRepairSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const compareHref = row.candidateComparePath
          ? uiHref("/ui/benchmarks/candidates", {
              preserveDecision: decisionState,
              params: {
                path: row.candidateComparePath,
                returnTo: currentRepairHref,
                focus: "selected",
                selected: withRepairSelection(row.episodeId, row.shotId, row.selectedCandidateId),
                compare: withRepairSelection(row.selectedCandidateId, row.episodeId)
              },
              hash: "candidate-compare-shell"
            })
          : "";
        const repairHandoffLinks = buildRigRepairHandoffLinks({
          currentHref: currentRepairHref,
          characterPackId: row.characterPackId,
          fixturePath: row.fixturePath,
          repairable: row.rig.repairable,
          recreateRecommended: row.rig.recreateRecommended
        });
        const finalLabel = row.finalPassed === null ? "unknown" : row.finalPassed ? "passed" : "failed";
        return `<tr id="${rowId}" class="ops-review-table-row${isRepairFocused(row.episodeId, row.shotId, row.selectedCandidateId, row.bundle, row.artifactRelativePath) ? " is-focused" : ""}">
          <td><div class="table-note"><strong>${esc(row.shotId)}</strong><span class="muted-text">${esc(`${row.episodeId} / ${row.scenario} / ${row.bundle}`)}</span><span class="muted-text">${esc(humanizeOpsLabel(row.shotType))}</span><span class="muted-text">provider ${esc(row.providerSummary)}</span><span class="muted-text">attempt ${esc(row.attemptSummary)}</span><span class="muted-text">${esc(summarizeRigContext(row.rig))}</span></div></td>
          <td><div class="table-note"><span class="badge ${row.acceptanceTone}">${esc(humanizeOpsLabel(row.acceptanceStatus))}</span><span class="muted-text">final ${esc(finalLabel)} / ${esc(row.finalStage ?? "-")}</span><span class="mono">${esc(row.selectedCandidateId)}</span></div></td>
          <td><div class="table-note"><span class="badge ${row.qcTone}">${esc(humanizeOpsLabel(row.qcStatus))}</span><span class="muted-text">${esc(row.qcSummary)}</span><span class="muted-text">${esc(row.issueCount > 0 ? `${row.issueCount} issues: ${row.issueSummary}` : "no run issues")}</span><span class="muted-text">${esc(row.fallbackSummary === "-" ? "no fallback steps" : `fallback ${row.fallbackSummary}`)}</span></div></td>
          <td><div class="table-note"><strong>${esc(row.policySummary)}</strong><span class="muted-text">${esc(row.repairSummary)}</span><span class="muted-text">rig ${esc(summarizeRigSignals(row.rig))}</span><span class="muted-text">anchor ${esc(formatAnchorConfidenceSummary(row.rig))}</span><span class="muted-text">${esc(summarizeRigLineage(row.rig))}</span></div></td>
          <td><div class="table-note"><strong>${esc(row.judgeSummary || "-")}</strong><span class="muted-text">${esc(row.failureSummary)}</span><span class="muted-text">${esc(summarizeRigFlags(row.rig))}</span><span class="muted-text">families ${esc(summarizeValues(row.rig.rigReasonFamilies, 3))}</span><span class="muted-text">rig codes ${esc(summarizeValues(row.rig.rigReasonCodes, 3))}</span><span class="muted-text">fallback ${esc(summarizeValues(row.rig.fallbackReasonCodes, 3))}</span></div></td>
          <td><div class="inline-actions"><a href="${smokeHref}">Smoke</a>${planHref ? `<a href="${planHref}">Plan</a>` : ""}${qcHref ? `<a href="${qcHref}">QC</a>` : ""}${renderLogHref ? `<a href="${renderLogHref}">Render Log</a>` : ""}${actualJudgeHref ? `<a href="${actualJudgeHref}">Actual Judge</a>` : ""}${visualJudgeHref ? `<a href="${visualJudgeHref}">Visual Judge</a>` : ""}${compareHref ? `<a href="${compareHref}">Candidate Compare</a>` : ""}${repairHandoffLinks}<button type="button" class="secondary" data-copy="${esc(row.smokeArtifactPath)}">Copy path</button></div></td>
          <td><div class="stack"><strong>${esc(row.sourceLabel)}</strong><span class="mono">${esc(row.artifactRelativePath)}</span><span class="muted-text">${fmtDate(row.generatedAt)}</span></div></td>
        </tr>`;
      })
      .join("");
    const repairScope = compact(
      [
        statusFilter ? `status ${statusFilter}` : null,
        repairFilter ? `repair ${repairFilter}` : null,
        backendFilter ? `backend ${backendFilter}` : null,
        bundleFilter ? `bundle ${bundleFilter}` : null,
        sourceFilter ? `source ${sourceFilter}` : null,
        speciesFilter ? `species ${speciesFilter}` : null,
        viewFilter ? `view ${viewFilter}` : null,
        rigFilter ? `rig ${rigFilter}` : null,
        fallbackFilter ? `fallback ${fallbackFilter}` : null,
        reviewOnlyFilter ? "review_only" : null,
        lowAnchorFilter ? "low_anchor" : null,
        recreateFilter ? "recreate" : null,
        repairableFilter ? "repairable" : null,
        queryFilter ? `q ${queryFilter}` : null
      ],
      " | "
    ) || "all acceptance rows";
    const rejectedCount = rows.filter((row) => row.acceptanceTone === "bad").length;
    const qcFailedCount = rows.filter((row) => row.qcTone === "bad").length;
    const compareCount = rows.filter((row) => Boolean(row.candidateComparePath)).length;
    const rigBlockedCount = rows.filter((row) => row.rig.rigBlocked).length;
    const repairRail = [
      {
        title: "Start with blocked acceptance rows",
        detail:
          rejectedCount > 0 || rigBlockedCount > 0
            ? `${rejectedCount} rows are rejected or failed, and ${rigBlockedCount} rows are rig-blocked. Clear those before treating accepted rows as a promotion baseline.`
            : qcFailedCount > 0
              ? `No rejected rows remain, but ${qcFailedCount} rows still carry QC-failed baggage.`
              : "No blocked acceptance rows remain. Review compare evidence before promoting a candidate set.",
        tone: rejectedCount > 0 || rigBlockedCount > 0 ? ("bad" as UiBadgeTone) : qcFailedCount > 0 ? ("warn" as UiBadgeTone) : ("ok" as UiBadgeTone),
        badge: rejectedCount > 0 || rigBlockedCount > 0 ? "blocked" : qcFailedCount > 0 ? "review" : "ready",
        html: `<a href="${repairBenchmarksHref}">Benchmark Queue</a><a href="${repairRolloutsHref}">Rollouts</a>`
      },
      {
        title: "Compare before promote",
        detail:
          compareCount > 0
            ? `${compareCount} rows link to Candidate Compare. Use compare evidence before promoting any accepted candidate with repair or QC baggage.`
            : "Candidate compare artifacts are missing for the current scope, so rely on smoke, plan, and judge detail before promoting.",
        tone: compareCount > 0 ? ("warn" as UiBadgeTone) : ("muted" as UiBadgeTone),
        badge: "compare",
        html: `<a href="${repairBenchmarksHref}">Benchmark Queue</a><a href="${repairRouteHref}">Route Explorer</a>`
      },
      {
        title: "Recovery path",
        detail: "Open Smoke, then Plan/QC, then Actual Judge when acceptance, final state, and selected candidate diverge.",
        tone: rejectedCount > 0 || qcFailedCount > 0 ? ("warn" as UiBadgeTone) : ("muted" as UiBadgeTone),
        badge: "recover",
        html: `<a href="${repairRolloutsHref}">Rollout Queue</a><a href="${repairLineageHref}">Lineage Explorer</a>`
      }
    ];
    const repairFacts = [
      { label: "Filter Scope", value: repairScope, hint: "current explorer scope" },
      { label: "Rows", value: String(rows.length), hint: `${compareCount} compare-linked rows` },
      { label: "QC Failed", value: String(qcFailedCount), hint: "rows that still need operator recovery review" },
      { label: "Rig Review", value: `${rigBlockedCount} blocked / ${rows.filter((row) => row.rig.reviewOnly).length} review_only`, hint: "selected-candidate rig gate summary" },
      {
        label: "Rollback Anchor",
        value: compareCount > 0 ? "candidate compare -> smoke -> plan" : "smoke -> plan -> QC",
        hint: "open the compare surface before promote when it exists"
      }
    ];
    const repairRecoveryRail = [
      {
        title: "Recovery order",
        detail: "Open Smoke first, then Plan or QC, then Actual Judge when acceptance, final state, and selected candidate diverge.",
        tone: rejectedCount > 0 || qcFailedCount > 0 ? ("warn" as UiBadgeTone) : ("muted" as UiBadgeTone),
        badge: "recover",
        html: `<a href="${repairRolloutsHref}">Rollout Queue</a><a href="${repairBenchmarksHref}">Benchmark Queue</a>`
      },
      {
        title: "Linked review objects",
        detail: "Keep acceptance, route, and lineage views adjacent so the operator does not have to jump straight into raw payloads.",
        tone: "muted" as UiBadgeTone,
        badge: "objects",
        html: `<a href="${repairRouteHref}">Route Explorer</a><a href="${repairLineageHref}">Lineage Explorer</a>`
      },
      {
        title: "Rollback anchor",
        detail: compareCount > 0 ? "Candidate compare remains the first rollback proof before falling back to smoke, plan, and QC." : "Smoke, then Plan, then QC remains the rollback order for the current scope.",
        tone: compareCount > 0 ? ("ok" as UiBadgeTone) : ("warn" as UiBadgeTone),
        badge: "rollback",
        html: `<a href="${repairBenchmarksHref}">Benchmarks</a><a href="${repairRolloutsHref}">Rollouts</a>`
      }
    ];
    const repairEvidenceCards = [
      {
        title: "Artifact-backed review",
        detail: `${rows.length} acceptance rows are in scope. Use compare, smoke, plan, and judge detail before opening raw evidence.`,
        tone: "muted" as UiBadgeTone,
        badge: "evidence"
      },
      {
        title: "Raw payload policy",
        detail: "Raw JSON is intentionally pushed behind detail pages. Escalate only when the operator still cannot reconcile the acceptance gate.",
        tone: compareCount > 0 ? ("ok" as UiBadgeTone) : ("warn" as UiBadgeTone),
        badge: "defer"
      }
    ];
    const repairEvidenceDrawer = {
      summary: "Open the acceptance evidence order and raw-evidence policy",
      bodyHtml: `<div class="ops-review-fact-grid">
        <article class="ops-review-fact"><span class="ops-review-fact-label">Primary order</span><strong>${esc(
          compareCount > 0 ? "Candidate Compare -> Smoke -> Plan" : "Smoke -> Plan -> QC"
        )}</strong><span class="muted-text">keep compare-first review ahead of raw payloads</span></article>
        <article class="ops-review-fact"><span class="ops-review-fact-label">Judge fallback</span><strong>Actual Judge -> Visual Judge</strong><span class="muted-text">open judge artifacts only after compare or smoke still looks inconclusive</span></article>
        <article class="ops-review-fact"><span class="ops-review-fact-label">Review objects</span><strong>Acceptance -> Route -> Lineage</strong><span class="muted-text">linked explorers stay adjacent for operator review</span></article>
      </div>
      <div class="ops-review-note"><strong>Evidence rule</strong><span class="muted-text">Use detail surfaces first. Raw JSON remains a last resort because the operator should not have to parse payload shape to understand the acceptance gate.</span></div>`
    ,
      open: ["evidence", "artifact", "raw"].includes(repairFocusValue) || decisionToken(decisionState.view) === "evidence"
    };
    const repairJumpFacts: DecisionFact[] = [
      ...(decisionState.focus
        ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "incoming row or section focus" }]
        : []),
      ...(decisionState.selected.length > 0
        ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected ids preserved in explorer state` }]
        : []),
      ...(decisionState.compare.length > 0
        ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare handoff kept adjacent to acceptance review" }]
        : []),
      ...(decisionState.pinned.length > 0
        ? [{ label: "Pinned", value: summarizeValues(decisionState.pinned, 3), hint: "pinned objects remain visible in the header" }]
        : []),
      ...(decisionState.view
        ? [{ label: "View", value: humanizeOpsLabel(decisionState.view), hint: "view mode preserved across the jump" }]
        : [])
    ];
    const repairJumpBanner = renderOpsReviewJumpBanner({
      title: "Deep-link handoff",
      intro: "Selection, compare context, and return path stay visible so the acceptance explorer reads as a continuation of the benchmark flow.",
      facts: repairJumpFacts,
      linksHtml: `<a href="${repairReturnHref}">${repairReturnLabel}</a><a href="${repairBenchmarksHref}">Benchmark Queue</a><a href="${repairPlaybooksHref}">Refresh handoff</a>`
    });
    const repairRefreshHandoff = buildCompactRefreshPlaybookHandoff({
      staleSourceCount: freshnessSummary.staleCount,
      agingSourceCount: freshnessSummary.agingCount,
      unknownCount: freshnessSummary.unknownCount,
      benchmarkRepairHref: currentRepairHref,
      benchmarkRolloutsHref: repairRolloutsHref
    });
    const notes = `<div class="ops-review-note"><strong>Required schema memo</strong><span class="muted-text">Some artifacts do not emit an explicit <code>acceptance_status</code> or normalized <code>repair_reasons[]</code>. This explorer derives acceptance from <code>accepted</code>, <code>judge_accepted</code>, and <code>judge_decision</code>, and derives repair signals from presets, rejection reasons, and QC output.</span></div><div class="ops-review-note"><strong>Freshness</strong><span class="muted-text">${
      freshnessSummary.staleCount > 0
        ? `${freshnessSummary.staleCount} rows are stale. Refresh benchmark artifacts or reopen the benchmark queue before promoting repaired output.`
        : freshnessSummary.unknownCount > 0
          ? `${freshnessSummary.unknownCount} rows are missing parseable artifact timestamps. Treat freshness as indeterminate until those artifacts are refreshed.`
          : freshnessSummary.agingCount > 0
          ? `${freshnessSummary.agingCount} rows are aging. Refresh soon if a repair decision still looks ambiguous.`
          : `Artifacts are fresh enough for queue review. ${freshnessSummary.newestDetail}.`
    }</span></div>${repairRefreshHandoff}`;
    const body = buildRepairAcceptancePageBody({
      flash: `${flashHtml(request.query)}${repairJumpBanner}`,
      filters,
      summaryCards,
      linksHtml: `<a href="${repairReturnHref}">${repairReturnLabel}</a><a href="${repairRouteHref}">Route Explorer</a><a href="${repairLineageHref}">Lineage Explorer</a><a href="${repairRolloutsHref}">Rollouts</a>`,
      railCards: repairRail,
      recoveryCards: repairRecoveryRail,
      facts: repairFacts,
      evidenceCards: repairEvidenceCards,
      evidenceDrawer: repairEvidenceDrawer,
      notes,
      rows: tableRows
    });
    return reply.type("text/html; charset=utf-8").send(page("Repair / Acceptance Explorer", body));
  });

  app.get("/ui/benchmarks/route-reasons", async (request, reply) => {
    const reasonFilter = (q(request.query, "reason") ?? "").toLowerCase();
    const acceptanceFilter = (q(request.query, "acceptance") ?? "").toLowerCase();
    const backendFilter = (q(request.query, "backend") ?? "").toLowerCase();
    const bundleFilter = (q(request.query, "bundle") ?? "").toLowerCase();
    const sourceFilter = (q(request.query, "source") ?? "").toLowerCase();
    const speciesFilter = (q(request.query, "species") ?? "").toLowerCase();
    const viewFilter = (q(request.query, "view") ?? "").toLowerCase();
    const rigFilter = (q(request.query, "rig") ?? "").toLowerCase();
    const fallbackFilter = (q(request.query, "fallback") ?? "").toLowerCase();
    const reviewOnlyFilter = q(request.query, "reviewOnly") === "1";
    const lowAnchorFilter = q(request.query, "lowAnchor") === "1";
    const recreateFilter = q(request.query, "recreate") === "1";
    const repairableFilter = q(request.query, "repairable") === "1";
    const queryFilter = (q(request.query, "q") ?? "").toLowerCase();
    const decisionState = readDecisionLinkState(request.query);
    const routeFocusValue = decisionToken(decisionState.focus);
    const routeSelectedTokens = decisionTokenSet(decisionState.selected);
    const routePinnedTokens = decisionTokenSet(decisionState.pinned);
    const withRouteSelection = (...values: Array<string | null | undefined>): string[] =>
      uniqueStrings([
        ...decisionState.selected,
        ...values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      ]);
    const isRouteFocused = (...values: Array<string | null | undefined>): boolean =>
      decisionSetHas(routeSelectedTokens, ...values) ||
      decisionSetHas(routePinnedTokens, ...values) ||
      values.some((value) => routeFocusValue === decisionToken(value));
    const rows = collectRouteReasonRows().filter((row) => {
      if (reasonFilter && !row.routeReason.toLowerCase().includes(reasonFilter)) return false;
      if (acceptanceFilter && !row.acceptanceStatus.toLowerCase().includes(acceptanceFilter)) return false;
      if (backendFilter && ![row.backend, row.providerSummary].some((value) => value.toLowerCase().includes(backendFilter))) return false;
      if (bundleFilter && ![row.bundle, row.scenario].some((value) => value.toLowerCase().includes(bundleFilter))) return false;
      if (sourceFilter && ![row.sourceLabel, row.sourcePath].some((value) => value.toLowerCase().includes(sourceFilter))) return false;
      if (speciesFilter && !(row.rig.speciesId ?? "").toLowerCase().includes(speciesFilter)) return false;
      if (viewFilter && !(row.rig.selectedView ?? "").toLowerCase().includes(viewFilter)) return false;
      if (rigFilter && !row.rig.rigReasonCodes.some((value) => value.toLowerCase().includes(rigFilter))) return false;
      if (fallbackFilter && !row.rig.fallbackReasonCodes.some((value) => value.toLowerCase().includes(fallbackFilter))) return false;
      if (reviewOnlyFilter && !row.rig.reviewOnly) return false;
      if (lowAnchorFilter && !row.rig.lowAnchorConfidence) return false;
      if (recreateFilter && !row.rig.recreateRecommended) return false;
      if (repairableFilter && row.rig.repairable !== true) return false;
      if (
        queryFilter &&
        ![
          row.episodeId,
          row.shotId,
          row.routeReason,
          row.qcSummary,
          row.issueSummary,
          row.repairSummary,
          row.fallbackSummary,
          row.policySummary,
          row.selectedCandidateId,
          row.rig.speciesId ?? "",
          row.rig.selectedView ?? "",
          ...row.rig.rigReasonFamilies,
          ...row.rig.rigReasonCodes,
          ...row.rig.fallbackReasonCodes
        ].some((value) => value.toLowerCase().includes(queryFilter))
      ) {
        return false;
      }
      return true;
    });
    const mismatchedCount = rows.filter((row) => row.renderModeSummary.includes("->")).length;
    const freshnessSummary = summarizeArtifactFreshnessForRows(rows);
    const summaryCards = [
      { label: "Shots", value: String(rows.length), tone: "muted" as UiBadgeTone, hint: "runtime shots with route metadata" },
      { label: "Reasons", value: String(new Set(rows.map((row) => row.routeReason)).size), tone: "warn" as UiBadgeTone, hint: summarizeCounts(rows.map((row) => row.routeReason), 1) },
      { label: "Accepted", value: String(rows.filter((row) => row.acceptanceTone === "ok").length), tone: "ok" as UiBadgeTone, hint: "accepted / resolved routed shots" },
      { label: "Render Drift", value: String(mismatchedCount), tone: mismatchedCount > 0 ? ("warn" as UiBadgeTone) : ("ok" as UiBadgeTone), hint: "stored vs recommended render-mode mismatches" },
      { label: "Freshness", value: `${freshnessSummary.staleCount} stale / ${freshnessSummary.agingCount} aging / ${freshnessSummary.unknownCount} unknown`, tone: freshnessSummary.staleCount > 0 ? ("bad" as UiBadgeTone) : freshnessSummary.agingCount > 0 || freshnessSummary.unknownCount > 0 ? ("warn" as UiBadgeTone) : ("ok" as UiBadgeTone), hint: freshnessSummary.newestDetail },
      { label: "Rig Blocked", value: String(rows.filter((row) => row.rig.rigBlocked).length), tone: "bad" as UiBadgeTone, hint: "selected candidates with fail-level rig signals" },
      { label: "Review Only", value: String(rows.filter((row) => row.rig.reviewOnly).length), tone: "warn" as UiBadgeTone, hint: "route rows still tagged review_only" },
      { label: "Repairable", value: String(rows.filter((row) => row.rig.repairable === true).length), tone: "warn" as UiBadgeTone, hint: summarizeCounts(rows.map((row) => row.rig.speciesId), 2) },
      { label: "Recreate", value: String(rows.filter((row) => row.rig.recreateRecommended).length), tone: "bad" as UiBadgeTone, hint: summarizeCounts(rows.map((row) => row.rig.selectedView), 2) }
    ]
      .map((card) => `<div class="summary-card"><span class="badge ${card.tone}">${esc(card.label)}</span><div class="metric">${esc(card.value)}</div><div class="caption">${esc(card.hint)}</div></div>`)
      .join("");
    const currentRouteHref = uiHref("/ui/benchmarks/route-reasons", {
      params: {
        reason: reasonFilter || null,
        acceptance: acceptanceFilter || null,
        backend: backendFilter || null,
        bundle: bundleFilter || null,
        source: sourceFilter || null,
        species: speciesFilter || null,
        view: viewFilter || null,
        rig: rigFilter || null,
        fallback: fallbackFilter || null,
        reviewOnly: reviewOnlyFilter ? "1" : null,
        lowAnchor: lowAnchorFilter ? "1" : null,
        recreate: recreateFilter ? "1" : null,
        repairable: repairableFilter ? "1" : null,
        q: queryFilter || null,
        ...decisionStateParams(decisionState)
      },
      hash: "route-reason-table"
    });
    const routeBenchmarksHref = uiHref("/ui/benchmarks", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentRouteHref
      },
      hash: "benchmark-regressions"
    });
    const routeRolloutsHref = uiHref("/ui/rollouts", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentRouteHref
      },
      hash: "rollout-signal-table"
    });
    const routeAcceptanceHref = uiHref("/ui/benchmarks/repair-acceptance", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentRouteHref
      },
      hash: "repair-acceptance-table-decision"
    });
    const routeLineageHref = uiHref("/ui/benchmarks/dataset-lineage", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentRouteHref
      },
      hash: "dataset-lineage-table-decision"
    });
    const routePlaybooksHref = uiHref("/ui/benchmarks/route-reasons", {
      params: {
        reason: reasonFilter || null,
        acceptance: acceptanceFilter || null,
        backend: backendFilter || null,
        bundle: bundleFilter || null,
        source: sourceFilter || null,
        species: speciesFilter || null,
        view: viewFilter || null,
        rig: rigFilter || null,
        fallback: fallbackFilter || null,
        reviewOnly: reviewOnlyFilter ? "1" : null,
        lowAnchor: lowAnchorFilter ? "1" : null,
        recreate: recreateFilter ? "1" : null,
        repairable: repairableFilter ? "1" : null,
        q: queryFilter || null,
        ...decisionStateParams(decisionState)
      },
      hash: "benchmark-refresh-playbooks"
    });
    const routeReturnHref = decisionState.returnTo ?? routeBenchmarksHref;
    const routeReturnLabel = decisionState.returnTo
      ? decisionState.returnTo.includes("/candidates") || decisionState.returnTo.includes("/ab-compare")
        ? "Reopen Compare"
        : "Back to list"
      : "Benchmark Queue";
    const filters = `
<form method="get" action="/ui/benchmarks/route-reasons">
  <div class="quick-grid">
    <div class="field"><label for="route-reason-filter">route_reason</label><input id="route-reason-filter" name="reason" value="${esc(reasonFilter)}" placeholder="character_focused_dialogue..."/></div>
    <div class="field"><label for="route-acceptance-filter">Acceptance</label><input id="route-acceptance-filter" name="acceptance" value="${esc(acceptanceFilter)}" placeholder="accepted, resolved..."/></div>
    <div class="field"><label for="route-backend-filter">Backend</label><input id="route-backend-filter" name="backend" value="${esc(backendFilter)}" placeholder="wan, hunyuan..."/></div>
    <div class="field"><label for="route-bundle-filter">Bundle / scenario</label><input id="route-bundle-filter" name="bundle" value="${esc(bundleFilter)}" placeholder="economy, convergence..."/></div>
    <div class="field"><label for="route-source-filter">Source root</label><input id="route-source-filter" name="source" value="${esc(sourceFilter)}" placeholder="main repo..."/></div>
    <div class="field"><label for="route-species-filter">Species</label><input id="route-species-filter" name="species" value="${esc(speciesFilter)}" placeholder="cat, dog, wolf..."/></div>
    <div class="field"><label for="route-view-filter">View</label><input id="route-view-filter" name="view" value="${esc(viewFilter)}" placeholder="front, threeQuarter, profile..."/></div>
    <div class="field"><label for="route-rig-filter">Rig reason code</label><input id="route-rig-filter" name="rig" value="${esc(rigFilter)}" placeholder="head_pose_near_threshold, review_only..."/></div>
    <div class="field"><label for="route-fallback-filter">Fallback reason code</label><input id="route-fallback-filter" name="fallback" value="${esc(fallbackFilter)}" placeholder="anchor_manifest_eye_drift, metadata..."/></div>
    <div class="field"><label><input type="checkbox" name="reviewOnly" value="1"${reviewOnlyFilter ? " checked" : ""}/> review_only only</label></div>
    <div class="field"><label><input type="checkbox" name="lowAnchor" value="1"${lowAnchorFilter ? " checked" : ""}/> low anchor only</label></div>
    <div class="field"><label><input type="checkbox" name="recreate" value="1"${recreateFilter ? " checked" : ""}/> recreate recommended</label></div>
    <div class="field"><label><input type="checkbox" name="repairable" value="1"${repairableFilter ? " checked" : ""}/> repairable only</label></div>
    <div class="field"><label for="route-q-filter">Free text</label><input id="route-q-filter" name="q" value="${esc(queryFilter)}" placeholder="episode id, shot id, blocker, qc reason..."/></div>
  </div>
  ${renderDecisionStateHiddenInputs(decisionState)}
  <div class="actions"><button type="submit" data-primary-action="1">Apply filters</button><a href="${uiHref("/ui/benchmarks/route-reasons", { params: decisionStateParams(decisionState) })}">Reset explorer</a></div>
</form>`;
    const tableRows = rows
      .map((row) => {
        const rowId = buildDecisionAnchorId("route-row", compact([row.episodeId, row.shotId], "-") || row.artifactRelativePath);
        const smokeHref = uiHref("/ui/rollouts/detail", {
          preserveDecision: decisionState,
          params: {
            path: row.smokeArtifactPath,
            returnTo: currentRouteHref,
            focus: row.shotId,
            selected: withRouteSelection(row.episodeId, row.shotId, row.selectedCandidateId)
          },
          hash: "rollout-evidence"
        });
        const runtimeHref = row.runtimePath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.runtimePath,
                returnTo: currentRouteHref,
                focus: row.shotId,
                selected: withRouteSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const planHref = row.planArtifactPath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.planArtifactPath,
                returnTo: currentRouteHref,
                focus: row.shotId,
                selected: withRouteSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const qcHref = row.qcArtifactPath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.qcArtifactPath,
                returnTo: currentRouteHref,
                focus: row.shotId,
                selected: withRouteSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const renderLogHref = row.renderLogPath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.renderLogPath,
                returnTo: currentRouteHref,
                focus: row.shotId,
                selected: withRouteSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const actualJudgeHref = row.actualJudgePath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.actualJudgePath,
                returnTo: currentRouteHref,
                focus: row.selectedCandidateId,
                selected: withRouteSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const visualJudgeHref = row.visualJudgePath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.visualJudgePath,
                returnTo: currentRouteHref,
                focus: row.selectedCandidateId,
                selected: withRouteSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const compareHref = row.candidateComparePath
          ? uiHref("/ui/benchmarks/candidates", {
              preserveDecision: decisionState,
              params: {
                path: row.candidateComparePath,
                returnTo: currentRouteHref,
                focus: "selected",
                selected: withRouteSelection(row.episodeId, row.shotId, row.selectedCandidateId),
                compare: withRouteSelection(row.selectedCandidateId, row.routeReason)
              },
              hash: "candidate-compare-shell"
            })
          : "";
        const renderModeHref = row.renderModeArtifactPath
          ? uiHref("/ui/rollouts/detail", {
              preserveDecision: decisionState,
              params: {
                path: row.renderModeArtifactPath,
                returnTo: currentRouteHref,
                focus: row.routeReason,
                selected: withRouteSelection(row.episodeId, row.shotId, row.selectedCandidateId)
              },
              hash: "rollout-evidence"
            })
          : "";
        const repairHandoffLinks = buildRigRepairHandoffLinks({
          currentHref: currentRouteHref,
          characterPackId: row.characterPackId,
          fixturePath: row.fixturePath,
          repairable: row.rig.repairable,
          recreateRecommended: row.rig.recreateRecommended
        });
        const finalLabel = row.finalPassed === null ? "unknown" : row.finalPassed ? "passed" : "failed";
        return `<tr id="${rowId}" class="ops-review-table-row${isRouteFocused(row.episodeId, row.shotId, row.routeReason, row.selectedCandidateId, row.bundle, row.artifactRelativePath) ? " is-focused" : ""}">
          <td><div class="table-note"><strong>${esc(row.shotId)}</strong><span class="muted-text">${esc(`${row.episodeId} / ${row.scenario} / ${row.bundle}`)}</span><span class="muted-text">${esc(humanizeOpsLabel(row.shotType))}</span><span class="muted-text">attempt ${esc(row.attemptSummary)}</span><span class="muted-text">${esc(summarizeRigContext(row.rig))}</span></div></td>
          <td><div class="table-note"><strong>${esc(row.routeReasonLabel)}</strong><span class="mono">${esc(row.routeReason)}</span><span class="muted-text">candidate ${esc(row.selectedCandidateId)}</span></div></td>
          <td><div class="table-note"><strong>${esc(row.renderModeSummary)}</strong><span class="muted-text">${esc(row.providerSummary)}</span><span class="muted-text">${esc(row.policySummary)}</span><span class="muted-text">anchor ${esc(formatAnchorConfidenceSummary(row.rig))}</span><span class="muted-text">${esc(summarizeRigLineage(row.rig))}</span></div></td>
          <td><div class="table-note"><span class="badge ${row.acceptanceTone}">${esc(humanizeOpsLabel(row.acceptanceStatus))}</span><span class="muted-text">final ${esc(finalLabel)} / ${esc(row.finalStage ?? "-")}</span></div></td>
          <td><div class="table-note"><span class="muted-text">${esc(compact([row.qcSummary !== "-" ? row.qcSummary : null, row.repairSummary !== "-" ? row.repairSummary : null], " | ") || "-")}</span><span class="muted-text">rig ${esc(summarizeRigSignals(row.rig))}</span><span class="muted-text">${esc(summarizeRigFlags(row.rig))}</span><span class="muted-text">${esc(row.issueCount > 0 ? `${row.issueCount} issues: ${row.issueSummary}` : "no run issues")}</span><span class="muted-text">families ${esc(summarizeValues(row.rig.rigReasonFamilies, 3))}</span><span class="muted-text">rig codes ${esc(summarizeValues(row.rig.rigReasonCodes, 3))}</span><span class="muted-text">fallback ${esc(summarizeValues(row.rig.fallbackReasonCodes, 3))}</span></div></td>
          <td><div class="inline-actions"><a href="${smokeHref}">Smoke</a>${runtimeHref ? `<a href="${runtimeHref}">Runtime Shots</a>` : ""}${planHref ? `<a href="${planHref}">Plan</a>` : ""}${qcHref ? `<a href="${qcHref}">QC</a>` : ""}${renderLogHref ? `<a href="${renderLogHref}">Render Log</a>` : ""}${actualJudgeHref ? `<a href="${actualJudgeHref}">Actual Judge</a>` : ""}${visualJudgeHref ? `<a href="${visualJudgeHref}">Visual Judge</a>` : ""}${compareHref ? `<a href="${compareHref}">Candidate Compare</a>` : ""}${renderModeHref ? `<a href="${renderModeHref}">Render Modes</a>` : ""}${repairHandoffLinks}<button type="button" class="secondary" data-copy="${esc(row.smokeArtifactPath)}">Copy path</button></div></td>
          <td><div class="stack"><strong>${esc(row.sourceLabel)}</strong><span class="mono">${esc(row.artifactRelativePath)}</span><span class="muted-text">${fmtDate(row.generatedAt)}</span></div></td>
        </tr>`;
      })
      .join("");
    const routeScope = compact(
      [
        reasonFilter ? `reason ${reasonFilter}` : null,
        acceptanceFilter ? `acceptance ${acceptanceFilter}` : null,
        backendFilter ? `backend ${backendFilter}` : null,
        bundleFilter ? `bundle ${bundleFilter}` : null,
        sourceFilter ? `source ${sourceFilter}` : null,
        speciesFilter ? `species ${speciesFilter}` : null,
        viewFilter ? `view ${viewFilter}` : null,
        rigFilter ? `rig ${rigFilter}` : null,
        fallbackFilter ? `fallback ${fallbackFilter}` : null,
        reviewOnlyFilter ? "review_only" : null,
        lowAnchorFilter ? "low_anchor" : null,
        recreateFilter ? "recreate" : null,
        repairableFilter ? "repairable" : null,
        queryFilter ? `q ${queryFilter}` : null
      ],
      " | "
    ) || "all routed shots";
    const compareCount = rows.filter((row) => Boolean(row.candidateComparePath)).length;
    const routedBlockers = rows.filter((row) => row.acceptanceTone !== "ok" || row.issueCount > 0 || row.repairSummary !== "-" || row.rig.rigBlocked).length;
    const rigBlockedCount = rows.filter((row) => row.rig.rigBlocked).length;
    const routeRail = [
      {
        title: "Start with routed blockers",
        detail:
          routedBlockers > 0
            ? `${routedBlockers} rows still carry acceptance, QC, repair, or rig baggage. ${rigBlockedCount} are rig-blocked. Review those before trusting the route_reason mix.`
            : "No routed blockers remain. Use this explorer to confirm route_reason still matches the promoted outcome.",
        tone: routedBlockers > 0 ? ("warn" as UiBadgeTone) : ("ok" as UiBadgeTone),
        badge: routedBlockers > 0 ? "review" : "ready",
        html: `<a href="${routeBenchmarksHref}">Benchmark Queue</a><a href="${routeRolloutsHref}">Rollouts</a>`
      },
      {
        title: "Compare before promote",
        detail:
          compareCount > 0
            ? `${compareCount} rows link to Candidate Compare. Open compare evidence when route_reason and actual selected candidate do not line up.`
            : "Candidate compare artifacts are not available in this scope, so rely on runtime shots, plan, and actual judge detail before promoting.",
        tone: compareCount > 0 ? ("warn" as UiBadgeTone) : ("muted" as UiBadgeTone),
        badge: "compare",
        html: `<a href="${routeAcceptanceHref}">Acceptance Explorer</a><a href="${routeLineageHref}">Lineage Explorer</a>`
      },
      {
        title: "Recovery path",
        detail: "Use Runtime Shots, then Plan, then Render Modes to understand whether the route itself drifted or the selected candidate drifted.",
        tone: mismatchedCount > 0 ? ("warn" as UiBadgeTone) : ("muted" as UiBadgeTone),
        badge: mismatchedCount > 0 ? "drift" : "inspect",
        html: `<a href="${routeRolloutsHref}">Rollout Queue</a><a href="${routeBenchmarksHref}">Benchmarks</a>`
      }
    ];
    const routeFacts = [
      { label: "Filter Scope", value: routeScope, hint: "current route explorer scope" },
      { label: "Rows", value: String(rows.length), hint: `${compareCount} compare-linked rows` },
      { label: "Render Drift", value: String(mismatchedCount), hint: "stored vs recommended render-mode mismatches" },
      { label: "Rig Review", value: `${rigBlockedCount} blocked / ${rows.filter((row) => row.rig.reviewOnly).length} review_only`, hint: "route-side rig summary" },
      {
        label: "Rollback Anchor",
        value: compareCount > 0 ? "candidate compare -> runtime shots" : "runtime shots -> render modes",
        hint: "keep route evidence ahead of raw payloads"
      }
    ];
    const routeRecoveryRail = [
      {
        title: "Recovery order",
        detail: "Open Runtime Shots first, then Plan, then Render Modes to decide whether route_reason drift or candidate drift is driving the mismatch.",
        tone: mismatchedCount > 0 ? ("warn" as UiBadgeTone) : ("muted" as UiBadgeTone),
        badge: mismatchedCount > 0 ? "drift" : "inspect",
        html: `<a href="${routeRolloutsHref}">Rollout Queue</a><a href="${routeBenchmarksHref}">Benchmarks</a>`
      },
      {
        title: "Linked review objects",
        detail: "Keep acceptance and lineage review adjacent so route_reason never loses the surrounding decision context.",
        tone: "muted" as UiBadgeTone,
        badge: "objects",
        html: `<a href="${routeAcceptanceHref}">Acceptance Explorer</a><a href="${routeLineageHref}">Lineage Explorer</a>`
      },
      {
        title: "Rollback anchor",
        detail: compareCount > 0 ? "Candidate compare plus runtime shots remains the safest rollback proof for route drift." : "Runtime shots plus render modes remains the fallback proof when compare artifacts are unavailable.",
        tone: compareCount > 0 ? ("ok" as UiBadgeTone) : ("warn" as UiBadgeTone),
        badge: "rollback",
        html: `<a href="${routeBenchmarksHref}">Benchmarks</a><a href="${routeRolloutsHref}">Rollouts</a>`
      }
    ];
    const routeEvidenceCards = [
      {
        title: "Artifact-backed route proof",
        detail: `${rows.length} routed shots are in scope. Keep route_reason, runtime, render mode, and compare evidence adjacent before falling back to raw payloads.`,
        tone: "muted" as UiBadgeTone,
        badge: "evidence"
      },
      {
        title: "Raw payload policy",
        detail: "Use route detail pages only when the route_reason, render path, and candidate evidence still fail to line up.",
        tone: compareCount > 0 ? ("ok" as UiBadgeTone) : ("warn" as UiBadgeTone),
        badge: "defer"
      }
    ];
    const routeEvidenceDrawer = {
      summary: "Open the route evidence order and raw-evidence policy",
      bodyHtml: `<div class="ops-review-fact-grid">
        <article class="ops-review-fact"><span class="ops-review-fact-label">Primary order</span><strong>${esc(
          compareCount > 0 ? "Candidate Compare -> Runtime Shots" : "Runtime Shots -> Render Modes"
        )}</strong><span class="muted-text">trace route proof before dropping to raw payloads</span></article>
        <article class="ops-review-fact"><span class="ops-review-fact-label">Drift checks</span><strong>Plan -> QC -> Render Log</strong><span class="muted-text">confirm whether route drift is downstream or upstream</span></article>
        <article class="ops-review-fact"><span class="ops-review-fact-label">Review objects</span><strong>Route -> Acceptance -> Lineage</strong><span class="muted-text">linked explorers stay available as adjacent proof</span></article>
      </div>
      <div class="ops-review-note"><strong>Evidence rule</strong><span class="muted-text">Keep route_reason readable at the decision layer. Raw payloads should only appear when the route stack still feels inconsistent after the artifact-backed compare path.</span></div>`
    ,
      open: ["evidence", "artifact", "raw"].includes(routeFocusValue) || decisionToken(decisionState.view) === "evidence"
    };
    const routeJumpFacts: DecisionFact[] = [
      ...(decisionState.focus
        ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "incoming row or section focus" }]
        : []),
      ...(decisionState.selected.length > 0
        ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected ids preserved in explorer state` }]
        : []),
      ...(decisionState.compare.length > 0
        ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare handoff kept adjacent to route review" }]
        : []),
      ...(decisionState.pinned.length > 0
        ? [{ label: "Pinned", value: summarizeValues(decisionState.pinned, 3), hint: "pinned objects remain visible in the header" }]
        : []),
      ...(decisionState.view
        ? [{ label: "View", value: humanizeOpsLabel(decisionState.view), hint: "view mode preserved across the jump" }]
        : [])
    ];
    const routeJumpBanner = renderOpsReviewJumpBanner({
      title: "Deep-link handoff",
      intro: "Selection, compare context, and return path stay visible so the route explorer reads as a continuation of the benchmark flow.",
      facts: routeJumpFacts,
      linksHtml: `<a href="${routeReturnHref}">${routeReturnLabel}</a><a href="${routeBenchmarksHref}">Benchmark Queue</a><a href="${routePlaybooksHref}">Refresh handoff</a>`
    });
    const routeRefreshHandoff = buildCompactRefreshPlaybookHandoff({
      staleSourceCount: freshnessSummary.staleCount,
      agingSourceCount: freshnessSummary.agingCount,
      unknownCount: freshnessSummary.unknownCount,
      benchmarkRepairHref: routeAcceptanceHref,
      benchmarkRolloutsHref: routeRolloutsHref
    });
    const notes = `<div class="ops-review-note"><strong>Required schema memo</strong><span class="muted-text">This explorer depends on <code>shot_grammar.route_reason</code> inside runtime shots. If route reasons are missing, benchmark smoke output needs to persist that field for every shot, not only episode-local previews.</span></div><div class="ops-review-note"><strong>Freshness</strong><span class="muted-text">${
      freshnessSummary.staleCount > 0
        ? `${freshnessSummary.staleCount} routed rows are stale. Refresh rollout evidence or rerun benchmark smoke before promoting a route_reason decision.`
        : freshnessSummary.unknownCount > 0
          ? `${freshnessSummary.unknownCount} routed rows are missing parseable artifact timestamps. Treat freshness as indeterminate until those artifacts are refreshed.`
          : freshnessSummary.agingCount > 0
          ? `${freshnessSummary.agingCount} routed rows are aging. Refresh soon if drift and compare evidence still disagree.`
          : `Artifacts are fresh enough for route review. ${freshnessSummary.newestDetail}.`
    }</span></div>${routeRefreshHandoff}`;
    const body = buildRouteReasonPageBody({
      flash: `${flashHtml(request.query)}${routeJumpBanner}`,
      filters,
      summaryCards,
      linksHtml: `<a href="${routeReturnHref}">${routeReturnLabel}</a><a href="${routeAcceptanceHref}">Acceptance Explorer</a><a href="${routeLineageHref}">Lineage Explorer</a><a href="${routeRolloutsHref}">Rollouts</a>`,
      railCards: routeRail,
      recoveryCards: routeRecoveryRail,
      facts: routeFacts,
      evidenceCards: routeEvidenceCards,
      evidenceDrawer: routeEvidenceDrawer,
      notes,
      rows: tableRows
    });
    return reply.type("text/html; charset=utf-8").send(page("Route Reason Explorer", body));
  });

  app.get("/ui/benchmarks/dataset-lineage", async (request, reply) => {
    const episodeFilter = (q(request.query, "episodeId") ?? "").toLowerCase();
    const datasetFilter = (q(request.query, "dataset") ?? "").toLowerCase();
    const packFilter = (q(request.query, "pack") ?? "").toLowerCase();
    const sourceFilter = (q(request.query, "source") ?? "").toLowerCase();
    const speciesFilter = (q(request.query, "species") ?? "").toLowerCase();
    const viewFilter = (q(request.query, "view") ?? "").toLowerCase();
    const rigFilter = (q(request.query, "rig") ?? "").toLowerCase();
    const fallbackFilter = (q(request.query, "fallback") ?? "").toLowerCase();
    const reviewOnlyFilter = q(request.query, "reviewOnly") === "1";
    const lowAnchorFilter = q(request.query, "lowAnchor") === "1";
    const recreateFilter = q(request.query, "recreate") === "1";
    const repairableFilter = q(request.query, "repairable") === "1";
    const queryFilter = (q(request.query, "q") ?? "").toLowerCase();
    const decisionState = readDecisionLinkState(request.query);
    const lineageFocusValue = decisionToken(decisionState.focus);
    const lineageSelectedTokens = decisionTokenSet(decisionState.selected);
    const lineagePinnedTokens = decisionTokenSet(decisionState.pinned);
    const withLineageSelection = (...values: Array<string | null | undefined>): string[] =>
      uniqueStrings([
        ...decisionState.selected,
        ...values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      ]);
    const isLineageFocused = (...values: Array<string | null | undefined>): boolean =>
      decisionSetHas(lineageSelectedTokens, ...values) ||
      decisionSetHas(lineagePinnedTokens, ...values) ||
      values.some((value) => lineageFocusValue === decisionToken(value));
    const rows = collectDatasetLineageRows().filter((row) => {
      if (episodeFilter && !row.episodeId.toLowerCase().includes(episodeFilter)) return false;
      if (datasetFilter && !row.datasetIds.some((value) => value.toLowerCase().includes(datasetFilter))) return false;
      if (packFilter && !row.packIds.some((value) => value.toLowerCase().includes(packFilter))) return false;
      if (sourceFilter && ![row.sourceLabel, row.sourcePath].some((value) => value.toLowerCase().includes(sourceFilter))) return false;
      if (speciesFilter && !(row.rig.speciesId ?? "").toLowerCase().includes(speciesFilter)) return false;
      if (viewFilter && !(row.rig.selectedView ?? "").toLowerCase().includes(viewFilter)) return false;
      if (rigFilter && !row.rig.rigReasonCodes.some((value) => value.toLowerCase().includes(rigFilter))) return false;
      if (fallbackFilter && !row.rig.fallbackReasonCodes.some((value) => value.toLowerCase().includes(fallbackFilter))) return false;
      if (reviewOnlyFilter && !row.rig.reviewOnly) return false;
      if (lowAnchorFilter && !row.rig.lowAnchorConfidence) return false;
      if (recreateFilter && !row.rig.recreateRecommended) return false;
      if (repairableFilter && row.rig.repairable !== true) return false;
      if (
        queryFilter &&
        ![
          row.episodeId,
          row.bibleRef,
          row.datasetIds.join(" "),
          row.packIds.join(" "),
          row.routeReasons.join(" "),
          row.schemaGaps.join(" "),
          row.rig.speciesId ?? "",
          row.rig.selectedView ?? "",
          row.rig.rigReasonFamilies.join(" "),
          row.rig.rigReasonCodes.join(" "),
          row.rig.fallbackReasonCodes.join(" ")
        ]
          .some((value) => value.toLowerCase().includes(queryFilter))
      ) {
        return false;
      }
      return true;
    });
    const freshnessSummary = summarizeArtifactFreshnessForRows(rows);
    const summaryCards = [
      { label: "Bundles", value: String(rows.length), tone: "muted" as UiBadgeTone, hint: "smoke bundles with runtime lineage" },
      { label: "Datasets", value: String(new Set(rows.flatMap((row) => row.datasetIds)).size), tone: "warn" as UiBadgeTone, hint: summarizeCounts(rows.flatMap((row) => row.datasetIds), 1) },
      { label: "Character Packs", value: String(new Set(rows.flatMap((row) => row.packIds)).size), tone: "ok" as UiBadgeTone, hint: summarizeCounts(rows.flatMap((row) => row.packIds), 1) },
      { label: "Bible Refs", value: String(new Set(rows.map((row) => row.bibleRef).filter((value) => value !== "-")).size), tone: "muted" as UiBadgeTone, hint: summarizeCounts(rows.map((row) => row.bibleRef), 1) },
      { label: "Freshness", value: `${freshnessSummary.staleCount} stale / ${freshnessSummary.agingCount} aging / ${freshnessSummary.unknownCount} unknown`, tone: freshnessSummary.staleCount > 0 ? ("bad" as UiBadgeTone) : freshnessSummary.agingCount > 0 || freshnessSummary.unknownCount > 0 ? ("warn" as UiBadgeTone) : ("ok" as UiBadgeTone), hint: freshnessSummary.newestDetail },
      { label: "Schema Gaps", value: String(rows.filter((row) => row.schemaGaps.length > 0).length), tone: "bad" as UiBadgeTone, hint: "rows missing lossless dataset versioning" },
      { label: "Review Only", value: String(rows.filter((row) => row.rig.reviewOnly).length), tone: "warn" as UiBadgeTone, hint: "manifest or request lineage still tagged review_only" },
      { label: "Low Anchor", value: String(rows.filter((row) => row.rig.lowAnchorConfidence).length), tone: "warn" as UiBadgeTone, hint: "low anchor confidence across lineage inputs" },
      { label: "Repairable", value: String(rows.filter((row) => row.rig.repairable === true).length), tone: "warn" as UiBadgeTone, hint: summarizeCounts(rows.map((row) => row.rig.speciesId), 2) },
      { label: "Recreate", value: String(rows.filter((row) => row.rig.recreateRecommended).length), tone: "bad" as UiBadgeTone, hint: summarizeCounts(rows.map((row) => row.rig.selectedView), 2) }
    ]
      .map((card) => `<div class="summary-card"><span class="badge ${card.tone}">${esc(card.label)}</span><div class="metric">${esc(card.value)}</div><div class="caption">${esc(card.hint)}</div></div>`)
      .join("");
    const currentLineageHref = uiHref("/ui/benchmarks/dataset-lineage", {
      params: {
        episodeId: episodeFilter || null,
        dataset: datasetFilter || null,
        pack: packFilter || null,
        source: sourceFilter || null,
        species: speciesFilter || null,
        view: viewFilter || null,
        rig: rigFilter || null,
        fallback: fallbackFilter || null,
        reviewOnly: reviewOnlyFilter ? "1" : null,
        lowAnchor: lowAnchorFilter ? "1" : null,
        recreate: recreateFilter ? "1" : null,
        repairable: repairableFilter ? "1" : null,
        q: queryFilter || null,
        ...decisionStateParams(decisionState)
      },
      hash: "dataset-lineage-table"
    });
    const lineageBenchmarksHref = uiHref("/ui/benchmarks", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentLineageHref
      },
      hash: "benchmark-regressions"
    });
    const lineageRolloutsHref = uiHref("/ui/rollouts", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentLineageHref
      },
      hash: "rollout-signal-table"
    });
    const lineageRouteHref = uiHref("/ui/benchmarks/route-reasons", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentLineageHref
      },
      hash: "route-reason-table-decision"
    });
    const lineageAcceptanceHref = uiHref("/ui/benchmarks/repair-acceptance", {
      params: {
        ...decisionStateParams(decisionState),
        returnTo: currentLineageHref
      },
      hash: "repair-acceptance-table-decision"
    });
    const lineagePlaybooksHref = uiHref("/ui/benchmarks/dataset-lineage", {
      params: {
        episodeId: episodeFilter || null,
        dataset: datasetFilter || null,
        pack: packFilter || null,
        source: sourceFilter || null,
        species: speciesFilter || null,
        view: viewFilter || null,
        rig: rigFilter || null,
        fallback: fallbackFilter || null,
        reviewOnly: reviewOnlyFilter ? "1" : null,
        lowAnchor: lowAnchorFilter ? "1" : null,
        recreate: recreateFilter ? "1" : null,
        repairable: repairableFilter ? "1" : null,
        q: queryFilter || null,
        ...decisionStateParams(decisionState)
      },
      hash: "benchmark-refresh-playbooks"
    });
    const lineageReturnHref = decisionState.returnTo ?? lineageBenchmarksHref;
    const lineageReturnLabel = decisionState.returnTo
      ? decisionState.returnTo.includes("/candidates") || decisionState.returnTo.includes("/ab-compare")
        ? "Reopen Compare"
        : "Back to list"
      : "Benchmark Queue";
    const filters = `
<form method="get" action="/ui/benchmarks/dataset-lineage">
  <div class="quick-grid">
    <div class="field"><label for="lineage-episode-filter">episodeId</label><input id="lineage-episode-filter" name="episodeId" value="${esc(episodeFilter)}" placeholder="ep_video_i2v_smoke..."/></div>
    <div class="field"><label for="lineage-dataset-filter">dataset_id</label><input id="lineage-dataset-filter" name="dataset" value="${esc(datasetFilter)}" placeholder="transit_ridership..."/></div>
    <div class="field"><label for="lineage-pack-filter">character pack</label><input id="lineage-pack-filter" name="pack" value="${esc(packFilter)}" placeholder="smoke-generated-rig..."/></div>
    <div class="field"><label for="lineage-source-filter">Source root</label><input id="lineage-source-filter" name="source" value="${esc(sourceFilter)}" placeholder="main repo..."/></div>
    <div class="field"><label for="lineage-species-filter">Species</label><input id="lineage-species-filter" name="species" value="${esc(speciesFilter)}" placeholder="cat, dog, wolf..."/></div>
    <div class="field"><label for="lineage-view-filter">View</label><input id="lineage-view-filter" name="view" value="${esc(viewFilter)}" placeholder="front, threeQuarter, profile..."/></div>
    <div class="field"><label for="lineage-rig-filter">Rig reason code</label><input id="lineage-rig-filter" name="rig" value="${esc(rigFilter)}" placeholder="review_only, low_anchor_confidence..."/></div>
    <div class="field"><label for="lineage-fallback-filter">Fallback reason code</label><input id="lineage-fallback-filter" name="fallback" value="${esc(fallbackFilter)}" placeholder="anchor_manifest, metadata..."/></div>
    <div class="field"><label><input type="checkbox" name="reviewOnly" value="1"${reviewOnlyFilter ? " checked" : ""}/> review_only only</label></div>
    <div class="field"><label><input type="checkbox" name="lowAnchor" value="1"${lowAnchorFilter ? " checked" : ""}/> low anchor only</label></div>
    <div class="field"><label><input type="checkbox" name="recreate" value="1"${recreateFilter ? " checked" : ""}/> recreate recommended</label></div>
    <div class="field"><label><input type="checkbox" name="repairable" value="1"${repairableFilter ? " checked" : ""}/> repairable only</label></div>
    <div class="field"><label for="lineage-q-filter">Free text</label><input id="lineage-q-filter" name="q" value="${esc(queryFilter)}" placeholder="bible ref, route_reason, schema gap..."/></div>
  </div>
  ${renderDecisionStateHiddenInputs(decisionState)}
  <div class="actions"><button type="submit" data-primary-action="1">Apply filters</button><a href="${uiHref("/ui/benchmarks/dataset-lineage", { params: decisionStateParams(decisionState) })}">Reset viewer</a></div>
</form>`;
    const tableRows = rows
      .map((row) => {
        const rowId = buildDecisionAnchorId("lineage-row", compact([row.episodeId, row.bundle], "-") || row.artifactRelativePath);
        const artifactLinks = [
          `<a href="${uiHref("/ui/rollouts/detail", {
            preserveDecision: decisionState,
            params: {
              path: row.smokeArtifactPath,
              returnTo: currentLineageHref,
              focus: row.episodeId,
              selected: withLineageSelection(row.episodeId, row.bundle, ...row.datasetIds)
            },
            hash: "rollout-evidence"
          })}">Smoke</a>`,
          row.runtimeShotsPath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.runtimeShotsPath,
                  returnTo: currentLineageHref,
                  focus: row.episodeId,
                  selected: withLineageSelection(row.episodeId, row.bundle, ...row.datasetIds)
                },
                hash: "rollout-evidence"
              })}">Runtime Shots</a>`
            : "",
          row.renderLogPath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.renderLogPath,
                  returnTo: currentLineageHref,
                  focus: row.episodeId,
                  selected: withLineageSelection(row.episodeId, row.bundle, ...row.datasetIds)
                },
                hash: "rollout-evidence"
              })}">Render Log</a>`
            : "",
          row.qcReportPath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.qcReportPath,
                  returnTo: currentLineageHref,
                  focus: row.episodeId,
                  selected: withLineageSelection(row.episodeId, row.bundle, ...row.datasetIds)
                },
                hash: "rollout-evidence"
              })}">QC</a>`
            : "",
          row.sidecarPlanPath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.sidecarPlanPath,
                  returnTo: currentLineageHref,
                  focus: row.episodeId,
                  selected: withLineageSelection(row.episodeId, row.bundle, ...row.datasetIds)
                },
                hash: "rollout-evidence"
              })}">Plan</a>`
            : "",
          row.renderModeArtifactPath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.renderModeArtifactPath,
                  returnTo: currentLineageHref,
                  focus: row.episodeId,
                  selected: withLineageSelection(row.episodeId, row.bundle, ...row.datasetIds)
                },
                hash: "rollout-evidence"
              })}">Render Modes</a>`
            : ""
        ]
          .filter((item) => item.length > 0)
          .join("");
        const repairHandoffLinks = buildRigRepairHandoffLinks({
          currentHref: currentLineageHref,
          characterPackId: resolveSinglePackId(row.packIds),
          fixturePath: row.inputShotsPath,
          repairable: row.rig.repairable,
          recreateRecommended: row.rig.recreateRecommended
        });
        return `<tr id="${rowId}" class="ops-review-table-row${isLineageFocused(row.episodeId, row.bundle, row.artifactRelativePath, ...row.datasetIds, ...row.packIds) ? " is-focused" : ""}">
          <td><div class="table-note"><strong>${esc(row.bundle)}</strong><span class="muted-text">${esc(row.scenario)}</span><span class="mono">${esc(row.artifactRelativePath)}</span></div></td>
          <td><div class="table-note"><strong>${esc(row.episodeId)}</strong><span class="muted-text">bible ${esc(row.bibleRef)}</span><span class="muted-text">beats ${esc(String(row.beatCount))} / route reasons ${esc(summarizeValues(row.routeReasons, 2))}</span></div></td>
          <td><div class="table-note"><strong>${esc(summarizeValues(row.datasetIds, 3))}</strong><span class="muted-text">packs ${esc(summarizeValues(row.packIds, 3))}</span><span class="muted-text">${esc(summarizeRigContext(row.rig))}</span></div></td>
          <td><div class="inline-actions">${artifactLinks}${repairHandoffLinks}<button type="button" class="secondary" data-copy="${esc(row.smokeArtifactPath)}">Copy path</button></div><div class="muted-text">${esc(compact([row.inputShotsPath, row.runtimeShotsPath], " -> ") || "-")}</div></td>
          <td><div class="table-note"><strong>${esc(summarizeValues(row.manifestPaths, 2))}</strong><span class="muted-text">${esc(summarizeValues(row.selectedImagePaths, 2))}</span><span class="muted-text">anchor ${esc(formatAnchorConfidenceSummary(row.rig))}</span><span class="muted-text">${esc(summarizeRigLineage(row.rig))}</span></div></td>
          <td><div class="table-note"><strong>${esc(summarizeValues(row.schemaGaps, 3))}</strong><span class="muted-text">${esc(summarizeRigFlags(row.rig))}</span><span class="muted-text">families ${esc(summarizeValues(row.rig.rigReasonFamilies, 3))}</span><span class="muted-text">rig codes ${esc(summarizeValues(row.rig.rigReasonCodes, 3))}</span><span class="muted-text">fallback ${esc(summarizeValues(row.rig.fallbackReasonCodes, 3))}</span></div></td>
          <td><div class="stack"><strong>${esc(row.sourceLabel)}</strong><span class="mono">${esc(row.sourcePath)}</span><span class="muted-text">${fmtDate(row.generatedAt)}</span></div></td>
        </tr>`;
      })
      .join("");
    const lineageScope = compact(
      [
        episodeFilter ? `episode ${episodeFilter}` : null,
        datasetFilter ? `dataset ${datasetFilter}` : null,
        packFilter ? `pack ${packFilter}` : null,
        sourceFilter ? `source ${sourceFilter}` : null,
        speciesFilter ? `species ${speciesFilter}` : null,
        viewFilter ? `view ${viewFilter}` : null,
        rigFilter ? `rig ${rigFilter}` : null,
        fallbackFilter ? `fallback ${fallbackFilter}` : null,
        reviewOnlyFilter ? "review_only" : null,
        lowAnchorFilter ? "low_anchor" : null,
        recreateFilter ? "recreate" : null,
        repairableFilter ? "repairable" : null,
        queryFilter ? `q ${queryFilter}` : null
      ],
      " | "
    ) || "all lineage rows";
    const schemaGapCount = rows.filter((row) => row.schemaGaps.length > 0).length;
    const manifestBackedRows = rows.filter((row) => row.manifestPaths.length > 0 || row.selectedImagePaths.length > 0).length;
    const lineageReviewOnlyCount = rows.filter((row) => row.rig.reviewOnly).length;
    const lineageLowAnchorCount = rows.filter((row) => row.rig.lowAnchorConfidence).length;
    const lineageRail = [
      {
        title: "Verify lineage before promote",
        detail:
          rows.length > 0
            ? "Confirm dataset ids, pack ids, and bible refs before treating a bundle as promotable or reusable."
            : "No lineage rows matched the current filters, so provenance cannot be confirmed from this scope.",
        tone: rows.length > 0 ? ("warn" as UiBadgeTone) : ("bad" as UiBadgeTone),
        badge: rows.length > 0 ? "verify" : "blocked",
        html: `<a href="${lineageBenchmarksHref}">Benchmark Queue</a><a href="${lineageRolloutsHref}">Rollouts</a>`
      },
      {
        title: "Trace the artifact chain",
        detail:
          manifestBackedRows > 0
            ? `${manifestBackedRows} rows expose manifests or selected images. Use those before falling back to raw payloads.`
            : "Manifest-backed lineage is thin in this scope, so use smoke and runtime shots as the current provenance chain.",
        tone: manifestBackedRows > 0 ? ("ok" as UiBadgeTone) : ("warn" as UiBadgeTone),
        badge: "trace",
        html: `<a href="${lineageRouteHref}">Route Explorer</a><a href="${lineageAcceptanceHref}">Acceptance Explorer</a>`
      },
      {
        title: "Schema gap gate",
        detail:
          schemaGapCount > 0
            ? `${schemaGapCount} rows still miss lossless dataset revision fields. Treat those as review-only, not final provenance.`
            : "No schema gaps were detected in the current scope.",
        tone: schemaGapCount > 0 ? ("bad" as UiBadgeTone) : ("ok" as UiBadgeTone),
        badge: schemaGapCount > 0 ? "gap" : "clean",
        html: `<a href="${lineageRolloutsHref}">Rollout Queue</a><a href="/ui/artifacts">Artifacts</a>`
      }
    ];
    const lineageFacts = [
      { label: "Filter Scope", value: lineageScope, hint: "current lineage explorer scope" },
      { label: "Bundles", value: String(rows.length), hint: `${manifestBackedRows} manifest-backed rows` },
      { label: "Datasets", value: String(new Set(rows.flatMap((row) => row.datasetIds)).size), hint: summarizeCounts(rows.flatMap((row) => row.datasetIds), 2) },
      { label: "Rig Review", value: `${lineageReviewOnlyCount} review_only / ${lineageLowAnchorCount} low anchor`, hint: "lineage-side rig summary" },
      {
        label: "Rollback Anchor",
        value: schemaGapCount > 0 ? "smoke -> runtime shots -> manifest" : "manifest-backed lineage",
        hint: "use lineage proof before promote when schema gaps remain"
      }
    ];
    const lineageRecoveryRail = [
      {
        title: "Recovery order",
        detail: schemaGapCount > 0 ? "Use Smoke first, then Runtime Shots, then manifest-backed references until lossless dataset revision fields are restored." : "Manifest-backed lineage is available first, with smoke and runtime shots as the fallback proof chain.",
        tone: schemaGapCount > 0 ? ("warn" as UiBadgeTone) : ("ok" as UiBadgeTone),
        badge: schemaGapCount > 0 ? "recover" : "ready",
        html: `<a href="${lineageRolloutsHref}">Rollout Queue</a><a href="${lineageBenchmarksHref}">Benchmarks</a>`
      },
      {
        title: "Linked review objects",
        detail: "Keep route_reason and acceptance explorers adjacent so provenance checks do not lose the actual decision context.",
        tone: "muted" as UiBadgeTone,
        badge: "objects",
        html: `<a href="${lineageRouteHref}">Route Explorer</a><a href="${lineageAcceptanceHref}">Acceptance Explorer</a>`
      },
      {
        title: "Rollback anchor",
        detail: schemaGapCount > 0 ? "Smoke, runtime shots, and manifest references remain the current rollback proof while schema gaps are open." : "Manifest-backed lineage remains the safest rollback proof for bundle provenance.",
        tone: schemaGapCount > 0 ? ("warn" as UiBadgeTone) : ("ok" as UiBadgeTone),
        badge: "rollback",
        html: `<a href="/ui/artifacts">Artifacts</a><a href="${lineageRolloutsHref}">Rollouts</a>`
      }
    ];
    const lineageEvidenceCards = [
      {
        title: "Artifact-backed provenance",
        detail: `${rows.length} lineage rows are in scope. Use manifest paths, selected-image references, smoke, and runtime shots before raw payload inspection.`,
        tone: "muted" as UiBadgeTone,
        badge: "evidence"
      },
      {
        title: "Raw payload policy",
        detail: "If provenance still looks uncertain, escalate only after the manifest-backed chain and linked explorers have been exhausted.",
        tone: schemaGapCount > 0 ? ("warn" as UiBadgeTone) : ("ok" as UiBadgeTone),
        badge: "defer"
      }
    ];
    const lineageEvidenceDrawer = {
      summary: "Open the lineage evidence order and raw-evidence policy",
      bodyHtml: `<div class="ops-review-fact-grid">
        <article class="ops-review-fact"><span class="ops-review-fact-label">Primary order</span><strong>${esc(
          schemaGapCount > 0 ? "Smoke -> Runtime Shots -> Manifest" : "Manifest-backed lineage"
        )}</strong><span class="muted-text">prove provenance before dropping to raw payloads</span></article>
        <article class="ops-review-fact"><span class="ops-review-fact-label">Reference chain</span><strong>${esc(
          manifestBackedRows > 0 ? `${manifestBackedRows} manifest-backed rows` : "selected images or manifests are thin"
        )}</strong><span class="muted-text">selected-image and manifest references stay ahead of raw JSON</span></article>
        <article class="ops-review-fact"><span class="ops-review-fact-label">Review objects</span><strong>Lineage -> Route -> Acceptance</strong><span class="muted-text">linked explorers stay adjacent for operator review</span></article>
      </div>
      <div class="ops-review-note"><strong>Evidence rule</strong><span class="muted-text">Raw payloads stay behind the drawer because provenance should first be proven from smoke, runtime, manifest, and linked review surfaces.</span></div>`
    ,
      open: ["evidence", "artifact", "raw"].includes(lineageFocusValue) || decisionToken(decisionState.view) === "evidence"
    };
    const lineageJumpFacts: DecisionFact[] = [
      ...(decisionState.focus
        ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "incoming row or section focus" }]
        : []),
      ...(decisionState.selected.length > 0
        ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected ids preserved in explorer state` }]
        : []),
      ...(decisionState.compare.length > 0
        ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare handoff kept adjacent to lineage review" }]
        : []),
      ...(decisionState.pinned.length > 0
        ? [{ label: "Pinned", value: summarizeValues(decisionState.pinned, 3), hint: "pinned objects remain visible in the header" }]
        : []),
      ...(decisionState.view
        ? [{ label: "View", value: humanizeOpsLabel(decisionState.view), hint: "view mode preserved across the jump" }]
        : [])
    ];
    const lineageJumpBanner = renderOpsReviewJumpBanner({
      title: "Deep-link handoff",
      intro: "Selection, compare context, and return path stay visible so the lineage explorer reads as a continuation of the benchmark flow.",
      facts: lineageJumpFacts,
      linksHtml: `<a href="${lineageReturnHref}">${lineageReturnLabel}</a><a href="${lineageBenchmarksHref}">Benchmark Queue</a><a href="${lineagePlaybooksHref}">Refresh handoff</a>`
    });
    const lineageRefreshHandoff = buildCompactRefreshPlaybookHandoff({
      staleSourceCount: freshnessSummary.staleCount,
      agingSourceCount: freshnessSummary.agingCount,
      unknownCount: freshnessSummary.unknownCount,
      benchmarkRepairHref: lineageAcceptanceHref,
      benchmarkRolloutsHref: lineageRolloutsHref,
      packIds: uniqueStrings(rows.flatMap((row) => row.packIds))
    });
    const notes = `<div class="ops-review-note"><strong>Required schema memo</strong><span class="muted-text">Current artifacts expose <code>dataset_id</code>, <code>pack_id</code>, <code>bible_ref</code>, and sidecar reference manifest paths. They do not consistently expose <code>dataset_version_id</code>, source URIs, or manifest versions, so this viewer cannot prove lossless dataset revisions yet.</span></div><div class="ops-review-note"><strong>Freshness</strong><span class="muted-text">${
      freshnessSummary.staleCount > 0
        ? `${freshnessSummary.staleCount} lineage rows are stale. Refresh smoke/runtime provenance before treating this lineage view as promotion-ready proof.`
        : freshnessSummary.unknownCount > 0
          ? `${freshnessSummary.unknownCount} lineage rows are missing parseable artifact timestamps. Treat provenance freshness as indeterminate until those artifacts are refreshed.`
          : freshnessSummary.agingCount > 0
          ? `${freshnessSummary.agingCount} lineage rows are aging. Refresh if schema gaps or review_only tags still look ambiguous.`
          : `Artifacts are fresh enough for lineage review. ${freshnessSummary.newestDetail}.`
    }</span></div>${lineageRefreshHandoff}`;
    const body = buildDatasetLineagePageBody({
      flash: `${flashHtml(request.query)}${lineageJumpBanner}`,
      filters,
      summaryCards,
      linksHtml: `<a href="${lineageReturnHref}">${lineageReturnLabel}</a><a href="${lineageRouteHref}">Route Explorer</a><a href="${lineageAcceptanceHref}">Acceptance Explorer</a><a href="${lineageRolloutsHref}">Rollouts</a>`,
      railCards: lineageRail,
      recoveryCards: lineageRecoveryRail,
      facts: lineageFacts,
      evidenceCards: lineageEvidenceCards,
      evidenceDrawer: lineageEvidenceDrawer,
      notes,
      rows: tableRows
    });
    return reply.type("text/html; charset=utf-8").send(page("Dataset Lineage Viewer", body));
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
    const decisionState = readDecisionLinkState(request.query);
    const candidateFocusValue = decisionToken(decisionState.focus);
    const candidateSelectedTokens = decisionTokenSet(decisionState.selected);
    const candidatePinnedTokens = decisionTokenSet(decisionState.pinned);

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
    const effectiveSelectedView = decisionState.view ?? selectedView;
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
      rig: RigReviewState;
    };

    const bundleRig = mergeRigReviewStates(extractRigReviewState(requestDoc), extractRigReviewState(planDoc));
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
        notes: [],
        rig: mergeRigReviewStates(bundleRig)
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
        const scoreBreakdownEntries: Array<[string, unknown]> = [
          ["face", breakdown.face_stability],
          ["motion", breakdown.motion_coherence],
          ["silhouette", breakdown.silhouette_readability],
          ["identity", breakdown.mascot_identity_preservation],
          ["safe", breakdown.safe_zone_readiness],
          ["total", breakdown.total]
        ];
        row.scoreBreakdown = scoreBreakdownEntries
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

    for (const row of candidateMap.values()) {
      row.rig = mergeRigReviewStates(
        row.rig,
        extractRigReviewState(actualJudgeDoc, row.candidateId),
        readRigReviewStateFromArtifactPath(row.visualJudgePath, row.candidateId)
      );
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
    const focusSelected = candidateFocusValue === "selected";
    const selectedCandidateIds = new Set(
      uniqueStrings([
        ...candidateRows.filter((row) => row.plannedSelected || row.actualSelected).map((row) => row.candidateId),
        ...decisionState.selected,
        ...decisionState.pinned
      ])
    );
    const visibleCandidateRows =
      focusSelected && selectedCandidateIds.size > 0
        ? candidateRows.filter((row) => selectedCandidateIds.has(row.candidateId))
        : candidateRows;
    const focusBanner =
      focusSelected && selectedCandidateIds.size > 0
        ? `<div class="notice">Selected-candidate focus is on. Only prompt-selected or actual-selected candidates are shown first.</div>`
        : "";

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
        value: effectiveSelectedView ?? "-",
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

    const promptWinner = str(isRecord(candidateJudgeDoc) ? candidateJudgeDoc.selected_objective : undefined) ?? "-";
    const actualWinner = str(isRecord(actualJudgeDoc) ? actualJudgeDoc.selected_objective : undefined) ?? "-";
    const comparisonAligned = Boolean(plannedSelectionId) && plannedSelectionId === actualSelectionId;
    const comparisonTone: UiBadgeTone = !actualSelectionId ? "bad" : comparisonAligned ? "ok" : "warn";
    const comparisonVerdict = !actualSelectionId ? "retry actual judge" : comparisonAligned ? "ready to promote" : "compare before promote";
	    const comparisonNextDecision = !actualSelectionId
	      ? "actual winner is missing, so rerun or inspect actual judge artifacts first"
	      : comparisonAligned
	        ? `approve ${humanizeOpsLabel(actualWinner)} if QC stays clean`
	        : `decide between prompt ${humanizeOpsLabel(promptWinner)} and actual ${humanizeOpsLabel(actualWinner)}`;
	    const promotionTarget = comparisonAligned ? humanizeOpsLabel(actualWinner) : humanizeOpsLabel(promptWinner);
	    const currentCandidateCompareHref = uiHref("/ui/benchmarks/candidates", {
	      params: {
	        path: bundle.requestedPath,
	        ...decisionStateParams(decisionState),
	        view: effectiveSelectedView
	      },
	      hash: "candidate-compare-shell"
	    });
	    const candidateBenchmarkHref = uiHref("/ui/benchmarks", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentCandidateCompareHref,
	        selected: Array.from(selectedCandidateIds),
	        compare: uniqueStrings([...decisionState.compare, ...Array.from(selectedCandidateIds)]),
	        view: effectiveSelectedView
	      },
	      hash: "benchmark-regressions"
	    });
	    const candidateRolloutsHref = uiHref("/ui/rollouts", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentCandidateCompareHref,
	        selected: Array.from(selectedCandidateIds),
	        compare: uniqueStrings([...decisionState.compare, ...Array.from(selectedCandidateIds)]),
	        view: effectiveSelectedView
	      },
	      hash: "rollout-signal-table"
	    });
	    const candidateReturnHref = decisionState.returnTo ?? "/ui/benchmarks#benchmark-regressions";
	    const candidateReturnLabel = decisionState.returnTo
	      ? decisionState.returnTo.includes("/ab-compare") || decisionState.returnTo.includes("/candidates")
	        ? "Reopen Compare"
	        : "Back to list"
	      : "Back to Benchmarks";
	    const candidateEpisodeHref =
	      episodeId !== "-"
	        ? uiHref(`/ui/episodes/${encodeURIComponent(episodeId)}`, {
	            params: {
	              ...decisionStateParams(decisionState),
	              returnTo: currentCandidateCompareHref,
	              selected: Array.from(selectedCandidateIds)
	            },
	            hash: "episode-compare-review"
	          })
	        : "";
	    const topLinks = [
	      bundle.planPath
	        ? `<a href="${uiHref("/ui/rollouts/detail", {
	            preserveDecision: decisionState,
	            params: {
	              path: bundle.planPath,
	              returnTo: currentCandidateCompareHref,
	              focus: "plan",
	              selected: Array.from(selectedCandidateIds),
	              view: effectiveSelectedView
	            },
	            hash: "rollout-evidence"
	          })}">Plan</a>`
	        : "",
	      bundle.requestPath
	        ? `<a href="${uiHref("/ui/rollouts/detail", {
	            preserveDecision: decisionState,
	            params: {
	              path: bundle.requestPath,
	              returnTo: currentCandidateCompareHref,
	              focus: "request",
	              selected: Array.from(selectedCandidateIds),
	              view: effectiveSelectedView
	            },
	            hash: "rollout-evidence"
	          })}">Request</a>`
	        : "",
	      bundle.candidateJudgePath
	        ? `<a href="${uiHref("/ui/rollouts/detail", {
	            preserveDecision: decisionState,
	            params: {
	              path: bundle.candidateJudgePath,
	              returnTo: currentCandidateCompareHref,
	              focus: "prompt-judge",
	              selected: Array.from(selectedCandidateIds),
	              view: effectiveSelectedView
	            },
	            hash: "rollout-evidence"
	          })}">Prompt Judge</a>`
	        : "",
	      bundle.actualJudgePath
	        ? `<a href="${uiHref("/ui/rollouts/detail", {
	            preserveDecision: decisionState,
	            params: {
	              path: bundle.actualJudgePath,
	              returnTo: currentCandidateCompareHref,
	              focus: "actual-judge",
	              selected: Array.from(selectedCandidateIds),
	              view: effectiveSelectedView
	            },
	            hash: "rollout-evidence"
	          })}">Actual Judge</a>`
	        : "",
	      `<button type="button" class="secondary" data-copy="${esc(bundle.requestedPath)}">Copy path</button>`
	    ]
	      .filter((item) => item.length > 0)
	      .join("");
	    const topCandidate = visibleCandidateRows[0] ?? candidateRows[0] ?? null;
	    const promptWinnerRow =
	      candidateRows.find((row) => row.candidateId === plannedSelectionId) ??
	      candidateRows.find((row) => row.plannedSelected) ??
	      null;
	    const actualWinnerRow =
	      candidateRows.find((row) => row.candidateId === actualSelectionId) ??
	      candidateRows.find((row) => row.actualSelected) ??
	      null;
	    const promptRigState = promptWinnerRow?.rig ?? bundleRig;
	    const actualRigState = actualWinnerRow?.rig ?? promptRigState;
	    const promptRigFlags = summarizeRigFlags(promptRigState);
	    const actualRigFlags = summarizeRigFlags(actualRigState);
	    const promptRigSignals = summarizeRigSignals(promptRigState);
	    const actualRigSignals = summarizeRigSignals(actualRigState);
	    const promptRigAnchorSummary = formatAnchorConfidenceSummary(promptRigState);
	    const actualRigAnchorSummary = formatAnchorConfidenceSummary(actualRigState);
	    const selectedRigCardValue = actualRigState.rigBlocked
	      ? "rig_blocked"
	      : actualRigState.reviewOnly
	        ? "review_only"
	        : actualRigState.lowAnchorConfidence
	          ? "low_anchor_confidence"
	          : actualRigState.anchorConfidence !== null
	            ? "tracked"
	            : "pending";
	    const selectedRigFallbackSummary = summarizeValues(actualRigState.fallbackReasonCodes, 3);
	    const winnerRigFlagTone: UiBadgeTone =
	      actualRigState.rigBlocked || promptRigState.rigBlocked
	        ? "bad"
	        : actualRigState.reviewOnly ||
	            actualRigState.lowAnchorConfidence ||
	            promptRigState.reviewOnly ||
	            promptRigState.lowAnchorConfidence
	          ? "warn"
	          : actualRigSignals !== "-" || promptRigSignals !== "-"
	            ? "ok"
	            : "muted";
	    const winnerRigFlagChip = `<span class="decision-diff-chip tone-${winnerRigFlagTone}">Rig flags ${esc(promptRigFlags)} -> ${esc(
	      actualRigFlags
	    )}</span>`;
	    const winnerRigDiffChips = [
	      renderRigDiffChip("Head Pose", promptRigState.signals.head_pose.score, actualRigState.signals.head_pose.score),
	      renderRigDiffChip("Eye Drift", promptRigState.signals.eye_drift.score, actualRigState.signals.eye_drift.score),
	      renderRigDiffChip(
	        "Mouth Readability",
	        promptRigState.signals.mouth_readability.score,
	        actualRigState.signals.mouth_readability.score
	      ),
	      renderRigDiffChip(
	        "Landmark Consistency",
	        promptRigState.signals.landmark_consistency.score,
	        actualRigState.signals.landmark_consistency.score
	      ),
	      renderRigDiffChip("Anchor Confidence", promptRigState.anchorConfidence, actualRigState.anchorConfidence),
	      winnerRigFlagChip
	    ].join("");
	    const candidateRecoveryRail: DecisionCard[] = [
	      {
	        title: "Retry / rollback path",
	        detail: !actualSelectionId ? "Retry actual judge generation or reopen the benchmark flow before approving or rolling back." : "Rollback means preferring the prompt winner and inspecting its artifacts before promotion.",
	        tone: comparisonTone,
	        badge: !actualSelectionId ? "retry" : "rollback",
	        html: `<a href="${candidateReturnHref}">${candidateReturnLabel}</a>${topCandidate?.resultPath ? `<a href="${uiHref("/ui/rollouts/detail", {
	          preserveDecision: decisionState,
	          params: {
	            path: topCandidate.resultPath,
	            returnTo: currentCandidateCompareHref,
	            focus: topCandidate.candidateId,
	            selected: uniqueStrings([...decisionState.selected, topCandidate.candidateId]),
	            view: effectiveSelectedView
	          },
	          hash: "rollout-evidence"
	        })}">Inspect Top Result</a>` : ""}`
	      },
	      {
	        title: "Linked review objects",
	        detail: "Keep the owning rollout bundle and episode object adjacent so compare-before-promote does not collapse into raw payload reading.",
	        tone: "muted",
	        badge: "objects",
	        html: `<a href="${candidateRolloutsHref}">Rollouts</a>${candidateEpisodeHref ? `<a href="${candidateEpisodeHref}">Episode Detail</a>` : ""}`
	      }
	    ];
	    const candidateLinkedRail: DecisionCard[] = [
	      { title: "Rollout bundle", detail: bundle.stem, tone: "muted", html: topLinks || `<a href="${candidateRolloutsHref}">Rollouts</a>` },
	      {
	        title: "Episode object",
	        detail: episodeId !== "-" ? `promotion and rollback resolve in episode ${episodeId}` : "episode id unavailable",
	        tone: "muted",
	        html: candidateEpisodeHref ? `<a href="${candidateEpisodeHref}">Episode Detail</a>` : ""
	      }
	    ];
	    const candidateEvidenceFacts: DecisionFact[] = [
	      { label: "Prompt Winner", value: humanizeOpsLabel(promptWinner), hint: "prompt-side approved candidate" },
	      { label: "Actual Winner", value: humanizeOpsLabel(actualWinner), hint: "actual-side chosen candidate" },
	      { label: "Promotion Gate", value: comparisonVerdict, hint: comparisonNextDecision },
	      { label: "Rig Review", value: selectedRigCardValue, hint: `${actualRigSignals} | anchor ${actualRigAnchorSummary}` },
	      { label: "Rig Context", value: summarizeRigContext(actualRigState), hint: summarizeRigLineage(actualRigState) },
	      { label: "Rollback Point", value: humanizeOpsLabel(promptWinner), hint: "prompt winner remains the safest rollback anchor" },
	      { label: "Fallback Reasons", value: selectedRigFallbackSummary, hint: "metadata or anchor-derived fallback context" }
	    ];
	    const candidateEvidenceDrawerBody = `<div class="decision-copy">Use the compare shell, candidate score matrix, and linked artifact detail before reading lower-level request payloads. Raw prompt text stays intentionally below the gate.</div>
	<div class="quick-links"><a href="${candidateReturnHref}">${candidateReturnLabel}</a>${topLinks || `<a href="${candidateRolloutsHref}">Open Rollouts</a>`}</div>
	<details class="decision-drawer"><summary>Open compare evidence order</summary><div class="decision-drawer-body"><div class="decision-copy">Compare shell -> candidate score matrix -> top candidate detail -> prompt preview. Only open prompt or request payloads if the compare gate still looks uncertain.</div><div class="quick-links"><a href="${candidateReturnHref}">${candidateReturnLabel}</a><a href="${candidateRolloutsHref}">Rollouts</a></div></div></details>`;
	    const candidateJumpFacts: DecisionFact[] = [
	      ...(decisionState.focus
	        ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "incoming object or compare focus" }]
	        : []),
	      ...(decisionState.selected.length > 0
	        ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected ids preserved in URL state` }]
	        : []),
	      ...(decisionState.compare.length > 0
	        ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare handoff carried from the queue or prior surface" }]
	        : []),
	      ...(decisionState.pinned.length > 0
	        ? [{ label: "Pinned", value: summarizeValues(decisionState.pinned, 3), hint: "pinned candidate ids stay visible in the header" }]
	        : []),
	      ...(effectiveSelectedView
	        ? [{ label: "View", value: humanizeOpsLabel(effectiveSelectedView), hint: "reference view preserved across the jump" }]
	        : [])
	    ];
	    const candidateJumpBanner = renderDecisionJumpBanner({
	      title: "Deep-link handoff",
	      intro: "The selection, compare context, and return path stay visible so this candidate surface reads as the next step from the queue or compare shell.",
	      facts: candidateJumpFacts,
	      linksHtml: `<a href="${candidateReturnHref}">${candidateReturnLabel}</a>${candidateEpisodeHref ? `<a href="${candidateEpisodeHref}">Episode Detail</a>` : ""}<a href="${currentCandidateCompareHref}">Refresh handoff</a>`,
	      tone: comparisonTone
	    });

    const compareTableRows = visibleCandidateRows
      .map((row) => {
        const delta = row.actualScore !== null && row.plannedScore !== null ? row.actualScore - row.plannedScore : null;
        const rowId = buildDecisionAnchorId("candidate-row", row.candidateId);
        const isFocused =
          decisionSetHas(candidateSelectedTokens, row.candidateId) ||
          decisionSetHas(candidatePinnedTokens, row.candidateId) ||
          candidateFocusValue === decisionToken(row.candidateId);
        const detailLinks = [
          row.resultPath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.resultPath,
                  returnTo: currentCandidateCompareHref,
                  focus: row.candidateId,
                  selected: uniqueStrings([...decisionState.selected, row.candidateId]),
                  view: effectiveSelectedView
                },
                hash: "rollout-evidence"
              })}">Result</a>`
            : "",
          row.visualJudgePath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.visualJudgePath,
                  returnTo: currentCandidateCompareHref,
                  focus: row.candidateId,
                  selected: uniqueStrings([...decisionState.selected, row.candidateId]),
                  view: effectiveSelectedView
                },
                hash: "rollout-evidence"
              })}">Visual Judge</a>`
            : "",
          row.preflightPath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.preflightPath,
                  returnTo: currentCandidateCompareHref,
                  focus: row.candidateId,
                  selected: uniqueStrings([...decisionState.selected, row.candidateId]),
                  view: effectiveSelectedView
                },
                hash: "rollout-evidence"
              })}">Preflight</a>`
            : "",
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
        return `<tr id="${rowId}" class="decision-focus-row${isFocused ? " is-focused" : ""}">
          <td><div class="table-note"><strong>${esc(humanizeOpsLabel(row.objective))}</strong><span class="muted-text">${esc(row.candidateId)}</span><span class="muted-text">${esc(summarizeValues(row.tags, 4))}</span><div class="inline-actions">${row.plannedSelected ? '<span class="badge ok">prompt selected</span>' : ''}${row.actualSelected ? '<span class="badge warn">actual selected</span>' : ''}</div></div></td>
          <td>${esc(row.plannedScore === null ? "-" : formatNumber(row.plannedScore))}</td>
          <td>${esc(row.actualScore === null ? "-" : formatNumber(row.actualScore))}</td>
          <td>${esc(delta === null ? "-" : formatNumber(delta, 2))}</td>
          <td>${esc(qcLabel)}</td>
          <td>${formatRigSignalTableCell(row.rig, "head_pose")}</td>
          <td>${formatRigSignalTableCell(row.rig, "eye_drift")}</td>
          <td>${formatRigSignalTableCell(row.rig, "mouth_readability")}</td>
          <td>${formatRigSignalTableCell(row.rig, "landmark_consistency")}</td>
          <td>${formatAnchorConfidenceTableCell(row.rig)}</td>
          <td>${esc(row.latencyMs === null ? "-" : `${Math.round(row.latencyMs)} ms`)}</td>
          <td>${esc(row.visualSignalScore === null ? "-" : formatNumber(row.visualSignalScore))}</td>
          <td><div class="inline-actions">${detailLinks || "-"}</div></td>
        </tr>`;
      })
      .join("");

    const candidateCards = visibleCandidateRows
      .map((row) => {
        const videoHref = row.videoPath ? `/ui/rollouts/file?path=${encodeURIComponent(row.videoPath)}` : "";
        const cardId = buildDecisionAnchorId("candidate-card", row.candidateId);
        const isFocused =
          decisionSetHas(candidateSelectedTokens, row.candidateId) ||
          decisionSetHas(candidatePinnedTokens, row.candidateId) ||
          candidateFocusValue === decisionToken(row.candidateId);
        const detailLinks = [
          row.resultPath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.resultPath,
                  returnTo: currentCandidateCompareHref,
                  focus: row.candidateId,
                  selected: uniqueStrings([...decisionState.selected, row.candidateId]),
                  view: effectiveSelectedView
                },
                hash: "rollout-evidence"
              })}">Result JSON</a>`
            : "",
          row.visualJudgePath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.visualJudgePath,
                  returnTo: currentCandidateCompareHref,
                  focus: row.candidateId,
                  selected: uniqueStrings([...decisionState.selected, row.candidateId]),
                  view: effectiveSelectedView
                },
                hash: "rollout-evidence"
              })}">Visual Judge</a>`
            : "",
          row.workflowPath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.workflowPath,
                  returnTo: currentCandidateCompareHref,
                  focus: row.candidateId,
                  selected: uniqueStrings([...decisionState.selected, row.candidateId]),
                  view: effectiveSelectedView
                },
                hash: "rollout-evidence"
              })}">Workflow</a>`
            : "",
          row.preflightPath
            ? `<a href="${uiHref("/ui/rollouts/detail", {
                preserveDecision: decisionState,
                params: {
                  path: row.preflightPath,
                  returnTo: currentCandidateCompareHref,
                  focus: row.candidateId,
                  selected: uniqueStrings([...decisionState.selected, row.candidateId]),
                  view: effectiveSelectedView
                },
                hash: "rollout-evidence"
              })}">Preflight</a>`
            : ""
        ]
          .filter((item) => item.length > 0)
          .join("");
        const breakdown = row.scoreBreakdown
          .map((item) => `<span class="editor-chip">${esc(item.label)} ${esc(item.value)}</span>`)
          .join("");
        const rigBadges = [
          row.rig.rigBlocked ? '<span class="badge bad">rig blocked</span>' : "",
          row.rig.reviewOnly ? '<span class="badge warn">review_only</span>' : "",
          row.rig.lowAnchorConfidence ? '<span class="badge warn">low anchor</span>' : "",
          row.rig.recreateRecommended ? '<span class="badge bad">recreate</span>' : ""
        ]
          .filter((item) => item.length > 0)
          .join("");
        return `<section class="card decision-jump-target${isFocused ? " decision-focus-row is-focused" : ""}" id="${cardId}">
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
          <div class="form-card" style="margin-top:10px">
            <h3>Rig Review</h3>
            <div class="inline-actions">${rigBadges || '<span class="badge ok">rig tracked</span>'}</div>
            <p>head pose: <strong>${esc(formatRigSignalValue(row.rig, "head_pose"))}</strong></p>
            <p>eye drift: <strong>${esc(formatRigSignalValue(row.rig, "eye_drift"))}</strong></p>
            <p>mouth readability: <strong>${esc(formatRigSignalValue(row.rig, "mouth_readability"))}</strong></p>
            <p>landmark consistency: <strong>${esc(formatRigSignalValue(row.rig, "landmark_consistency"))}</strong></p>
            <p>anchor confidence: <strong>${esc(formatAnchorConfidenceSummary(row.rig))}</strong></p>
            <p>rig reasons: <strong>${esc(summarizeValues(row.rig.rigReasonCodes, 4))}</strong></p>
            <p>fallback reasons: <strong>${esc(summarizeValues(row.rig.fallbackReasonCodes, 4))}</strong></p>
          </div>
          <div class="quick-links" style="margin-top:10px">${detailLinks || '<span class="muted-text">No detailed artifacts for this candidate.</span>'}${videoHref ? `<a href="${videoHref}">Open Video</a>` : ""}</div>
          ${row.notes.length > 0 ? `<div class="notice" style="margin-top:10px">notes: ${esc(summarizeValues(row.notes, 4))}</div>` : ""}
        </section>`;
      })
      .join("");

    const body = `${decisionSurfaceStyles()}<div class="decision-surface">${renderObjectHero({
      eyebrow: "Candidate Review",
      title: "Sidecar Candidate Compare",
      subtitle: "Prompt winner, actual winner, promotion gate, and rollback anchor stay visible before the candidate matrix or prompt payload.",
      statusLabel: comparisonVerdict,
      statusTone: comparisonTone,
      flash: `${flashHtml(request.query)}${candidateJumpBanner}`,
      headerContextHtml: `<span class="muted-text">episode <span class="decision-code">${esc(episodeId)}</span></span><span class="muted-text">shot <span class="decision-code">${esc(
        shotId
      )}</span></span>`,
      quickLinksHtml: `<a href="${candidateReturnHref}">${candidateReturnLabel}</a><a href="${candidateRolloutsHref}">Open Rollouts</a>${focusSelected ? `<a href="${uiHref("/ui/benchmarks/candidates", {
        params: {
          path: bundle.requestedPath,
          ...decisionStateParams(decisionState),
          focus: null,
          view: effectiveSelectedView
        },
        hash: "candidate-score-matrix"
      })}">Show Full Matrix</a>` : ""}`,
      summaryCards: [
        { label: "Prompt Winner", value: humanizeOpsLabel(promptWinner), hint: "prompt candidate judge", tone: "muted" },
        { label: "Actual Winner", value: humanizeOpsLabel(actualWinner), hint: "actual output judge", tone: comparisonTone },
        { label: "Promotion Gate", value: comparisonVerdict, hint: comparisonNextDecision, tone: comparisonTone },
        {
          label: "Rig Review",
          value: selectedRigCardValue,
          hint: actualRigSignals !== "-" ? actualRigSignals : actualRigFlags,
          tone: rigStateTone(actualRigState)
        },
        {
          label: "Reference View",
          value: effectiveSelectedView ?? "-",
          hint: selectedImagePath ? path.basename(selectedImagePath) : "reference bundle",
          tone: "warn"
        }
      ],
      metaItems: [
        { label: "Episode", value: episodeId, hint: shotId },
        { label: "Renderer", value: renderer, hint: backend },
        {
          label: "Visible Candidates",
          value: String(visibleCandidateRows.length),
          hint: focusSelected ? `filtered from ${candidateRows.length}` : "full compare set"
        },
        { label: "Promotion Target", value: promotionTarget, hint: topCandidate?.candidateId ?? "none" },
        {
          label: "Anchor Confidence",
          value: actualRigAnchorSummary,
          hint: selectedRigFallbackSummary !== "-" ? selectedRigFallbackSummary : "selected winner anchor fallback context"
        }
      ],
      blockers: !actualSelectionId ? [{ title: "Actual judge missing", detail: "No actual selected candidate was recorded, so approval and rollback should pause until the actual judge is inspected.", tone: "bad", badge: "retry" }] : [],
      primaryActions: [
        { title: "Promotion gate", detail: `${comparisonNextDecision} Raw request and prompt payload stay below until this gate is cleared.`, tone: comparisonTone, badge: comparisonVerdict, html: topLinks || `<a href="${candidateRolloutsHref}">Open Rollouts</a>` }
      ],
      secondaryActions: [
        { title: "Inspect artifacts", detail: "Inspect prompt judge, actual judge, plan, or request detail only after the compare gate still looks uncertain.", tone: "muted", html: topLinks || `<a href="${candidateRolloutsHref}">Open Rollouts</a>` }
      ],
      recoveryActions: [
        {
          title: "Retry / rollback path",
          detail: !actualSelectionId ? "Retry actual judge generation or reopen the benchmark flow." : "Rollback means preferring the prompt winner and inspecting its artifacts before promotion.",
          tone: comparisonTone,
          badge: !actualSelectionId ? "retry" : "rollback",
          html: `<a href="${candidateBenchmarkHref}">Benchmark Queue</a>${topCandidate?.resultPath ? `<a href="${uiHref("/ui/rollouts/detail", {
            preserveDecision: decisionState,
            params: {
              path: topCandidate.resultPath,
              returnTo: currentCandidateCompareHref,
              focus: topCandidate.candidateId,
              selected: uniqueStrings([...decisionState.selected, topCandidate.candidateId]),
              view: effectiveSelectedView
            },
            hash: "rollout-evidence"
          })}">Inspect Top Result</a>` : ""}`
        }
      ],
      recentActivity: candidateRows.slice(0, 3).map((row) => ({
        title: humanizeOpsLabel(row.objective),
        detail: `planned ${row.plannedScore === null ? "-" : formatNumber(row.plannedScore)} / actual ${row.actualScore === null ? "-" : formatNumber(row.actualScore)}`,
        tone: row.actualSelected ? "ok" : row.plannedSelected ? "warn" : "muted",
        badge: row.actualSelected ? "actual" : row.plannedSelected ? "prompt" : "candidate"
      })),
      linkedObjects: [
        { title: "Rollout bundle", detail: bundle.stem, tone: "muted", html: topLinks || `<a href="${candidateRolloutsHref}">Rollouts</a>` },
        {
          title: "Episode object",
          detail: episodeId !== "-" ? `promotion and rollback resolve in episode ${episodeId}` : "episode id unavailable",
          tone: "muted",
          html: candidateEpisodeHref ? `<a href="${candidateEpisodeHref}">Episode Detail</a>` : ""
        }
      ]
	    })}${renderDecisionPrioritySection({
	      sectionId: "candidate-decision-rail",
	      title: "Decision Rail",
      intro: "Keep compare-before-promote, retry, and rollback logic visible before the candidate matrix or prompt payload.",
      linksHtml: `<a href="${candidateReturnHref}">${candidateReturnLabel}</a><a href="${candidateRolloutsHref}">Rollouts</a>${focusSelected ? `<a href="${uiHref("/ui/benchmarks/candidates", {
        params: {
          path: bundle.requestedPath,
          ...decisionStateParams(decisionState),
          focus: null,
          view: effectiveSelectedView
        },
        hash: "candidate-score-matrix"
      })}">Show Full Matrix</a>` : ""}`,
      railTitle: "Compare actions",
      railIntro: "Use this rail to decide whether to promote the aligned winner, compare before promote, retry actual judging, or fall back to the prompt winner.",
      railCards: [
        {
          title: "Current promotion gate",
          detail: `${comparisonNextDecision} current target: ${promotionTarget}.`,
          tone: comparisonTone,
          badge: comparisonVerdict,
          html: topLinks || `<a href="${candidateRolloutsHref}">Open Rollouts</a>`
        },
        {
          title: "Retry actual judge",
          detail: !actualSelectionId ? "The actual selected candidate is missing, so retry the actual judge before approving or rolling back." : "Retry only if the artifact evidence still looks inconsistent with the verdict.",
          tone: !actualSelectionId ? "bad" : "warn",
          badge: !actualSelectionId ? "blocked" : "optional",
          html: `<a href="${candidateBenchmarkHref}">Benchmark Queue</a>${topCandidate?.resultPath ? `<a href="${uiHref("/ui/rollouts/detail", {
            preserveDecision: decisionState,
            params: {
              path: topCandidate.resultPath,
              returnTo: currentCandidateCompareHref,
              focus: topCandidate.candidateId,
              selected: uniqueStrings([...decisionState.selected, topCandidate.candidateId]),
              view: effectiveSelectedView
            },
            hash: "rollout-evidence"
          })}">Inspect Top Result</a>` : ""}`
        },
        {
          title: "Rollback anchor",
          detail: `${humanizeOpsLabel(promptWinner)} remains the safest prompt-side rollback point when actual and prompt winners diverge.`,
          tone: comparisonAligned ? "ok" : "warn",
          badge: "rollback",
          html: topLinks || `<a href="${candidateRolloutsHref}">Open Rollouts</a>`
        }
      ],
      railEmpty: "No candidate actions are available.",
      railTone: comparisonTone,
      snapshotIntro: "Failure reason, last-good state, fallback path, retry path, and rollback point stay above the candidate matrix.",
      snapshotFacts: [
        { label: "Failure Reason", value: !actualSelectionId ? "actual selected candidate missing" : comparisonAligned ? "none" : "prompt and actual winners diverge", hint: "top compare blocker" },
        { label: "Last Known Good", value: promptWinner, hint: "prompt-side approved candidate" },
        { label: "Fallback Applied", value: actualWinner, hint: "actual-side chosen candidate" },
        { label: "Retry Path", value: !actualSelectionId ? "retry actual judge" : "inspect actual artifacts then decide", hint: comparisonNextDecision },
        { label: "Alternate Path", value: "benchmark queue / rollout detail", hint: "linked object review path" },
        { label: "Rollback Point", value: promptWinner, hint: "prompt winner remains the safest rollback anchor" }
      ],
	      snapshotEmpty: "No candidate recovery snapshot available.",
	      snapshotTone: comparisonTone
	    })}${renderRecoveryRailSection({
	      sectionId: "candidate-recovery-rail",
	      title: "Recovery / Linked Objects",
	      intro: "Retry, rollback, and linked object rails stay visible before the candidate matrix or prompt payload.",
	      linksHtml: `<a href="${candidateReturnHref}">${candidateReturnLabel}</a><a href="${candidateRolloutsHref}">Rollouts</a>${focusSelected ? `<a href="${uiHref("/ui/benchmarks/candidates", {
	        params: {
	          path: bundle.requestedPath,
	          ...decisionStateParams(decisionState),
	          focus: null,
	          view: effectiveSelectedView
	        },
	        hash: "candidate-score-matrix"
	      })}">Show Full Matrix</a>` : ""}`,
	      recoveryTitle: "Recovery rail",
	      recoveryIntro: "Retry actual judge or use the prompt-side rollback anchor before promoting the bundle.",
	      recoveryCards: candidateRecoveryRail,
	      recoveryEmpty: "No candidate recovery rail is available.",
	      recoveryTone: comparisonTone,
	      linkedTitle: "Linked object rail",
	      linkedIntro: "Keep rollout bundle and episode object context adjacent to the compare shell.",
	      linkedCards: candidateLinkedRail,
	      linkedEmpty: "No linked objects are available for this compare bundle.",
	      linkedTone: "muted"
	    })}${renderArtifactEvidenceSection({
	      sectionId: "candidate-evidence",
	      title: "Artifact Evidence Drawer",
	      intro: "Artifact-backed compare evidence stays adjacent, but raw prompt payloads remain behind the drawer.",
	      linksHtml: `<a href="${candidateReturnHref}">${candidateReturnLabel}</a><a href="${candidateRolloutsHref}">Rollouts</a>`,
	      summaryTitle: "Compare evidence summary",
	      summaryIntro: "Prompt winner, actual winner, promotion gate, and rollback point stay above the matrix.",
	      summaryFacts: candidateEvidenceFacts,
	      summaryEmpty: "No compare evidence summary is available.",
	      summaryTone: comparisonTone,
	      drawerTitle: "Compare evidence drawer",
	      drawerIntro: "Use linked judge, plan, request, and result detail only after the compare gate remains uncertain.",
	      drawerSummary: "Open compare evidence order and raw-evidence policy",
	      drawerBodyHtml: candidateEvidenceDrawerBody,
	      drawerTone: "muted",
	      drawerOpen: ["evidence", "artifact", "raw"].includes(candidateFocusValue) || decisionToken(decisionState.view) === "evidence"
	    })}
<section class="card dashboard-shell decision-jump-target" id="candidate-compare-shell" aria-labelledby="candidate-compare-shell-title">
	  <div class="section-head">
	    <div>
	      <h2 id="candidate-compare-shell-title">Compare Shell</h2>
	      <p class="section-intro">Prompt candidate scoring vs actual sidecar output scoring for one shot. Rig-aware compare-before-promote logic stays above the matrix.</p>
	    </div>
	    <div class="quick-links"><a href="${candidateReturnHref}">${candidateReturnLabel}</a><a href="${candidateRolloutsHref}">Open Rollouts</a></div>
	  </div>
  ${focusBanner}
  <div class="decision-help-callout" role="note" aria-label="Candidate compare reading order"><strong>Compare reading order</strong><span class="muted-text">Start with prompt winner vs actual winner, then the score matrix, then per-candidate cards, and only then the prompt preview or lower-level artifact payloads.</span></div>
  <div class="decision-diff-row" aria-label="Candidate compare summary">
    <span class="decision-diff-chip tone-${comparisonTone}">Gate ${esc(comparisonVerdict)}</span>
    <span class="decision-diff-chip tone-${comparisonAligned ? "ok" : "warn"}">Prompt ${esc(humanizeOpsLabel(promptWinner))} vs Actual ${esc(humanizeOpsLabel(actualWinner))}</span>
    <span class="decision-diff-chip tone-${focusSelected ? "warn" : "muted"}">${focusSelected ? `Focused ${visibleCandidateRows.length}/${candidateRows.length}` : `${candidateRows.length} candidates in matrix`}</span>
    <span class="decision-diff-chip tone-${selectedImagePath ? "ok" : "muted"}">Reference ${esc(effectiveSelectedView ?? "-")}</span>
    ${winnerRigDiffChips}
  </div>
  <div class="decision-compare-shell">
    <div class="decision-action-rail" aria-label="Candidate compare actions"><a href="${candidateReturnHref}">${candidateReturnLabel}</a><a href="${candidateRolloutsHref}">Rollouts</a>${candidateEpisodeHref ? `<a href="${candidateEpisodeHref}">Episode Detail</a>` : ""}<a href="#candidate-score-matrix">Score Matrix</a>${topLinks}</div>
    <div class="decision-compare-axis">
      <article class="decision-compare-card" data-compare-side="left">
        <div class="decision-compare-card-head">
          <div>
            <span class="decision-compare-axis-label">Left axis</span>
            <h3>Prompt side</h3>
            <p class="muted-text">${esc(humanizeOpsLabel(promptWinner))}</p>
          </div>
          <span class="badge ${comparisonAligned ? "ok" : "warn"}">${esc(humanizeOpsLabel(promptWinner))}</span>
        </div>
        <div class="decision-meta-grid">
          <div class="decision-meta-card"><span class="label">Episode / Shot</span><div class="value">${esc(episodeId)}</div><div class="hint">${esc(shotId)}</div></div>
          <div class="decision-meta-card"><span class="label">Reference view</span><div class="value">${esc(effectiveSelectedView ?? "-")}</div><div class="hint">${selectedImagePath ? esc(path.basename(selectedImagePath)) : "reference bundle"}</div></div>
          <div class="decision-meta-card"><span class="label">Preset stack</span><div class="value">${esc(requestSummary || "-")}</div><div class="hint">prompt-side request context</div></div>
          <div class="decision-meta-card"><span class="label">Rig review</span><div class="value">${esc(promptRigFlags)}</div><div class="hint">${esc(promptRigSignals !== "-" ? `${promptRigSignals} | anchor ${promptRigAnchorSummary}` : `anchor ${promptRigAnchorSummary}`)}</div></div>
        </div>
        <div class="decision-action-rail" aria-label="Prompt-side actions">${topLinks || `<a href="${candidateRolloutsHref}">Open Rollouts</a>`}</div>
      </article>
      <article class="decision-compare-card" data-compare-side="right">
        <div class="decision-compare-card-head">
          <div>
            <span class="decision-compare-axis-label">Right axis</span>
            <h3>Actual side</h3>
            <p class="muted-text">${esc(humanizeOpsLabel(actualWinner))}</p>
          </div>
          <span class="badge ${comparisonTone}">${esc(comparisonVerdict)}</span>
        </div>
        <div class="decision-meta-grid">
          <div class="decision-meta-card"><span class="label">Renderer / Backend</span><div class="value">${esc(renderer)}</div><div class="hint">${esc(backend)}</div></div>
          <div class="decision-meta-card"><span class="label">Promotion target</span><div class="value">${esc(promotionTarget)}</div><div class="hint">${topCandidate?.candidateId ? esc(topCandidate.candidateId) : "no top candidate"}</div></div>
          <div class="decision-meta-card"><span class="label">Visible candidates</span><div class="value">${esc(String(visibleCandidateRows.length))}</div><div class="hint">${focusSelected ? `filtered from ${candidateRows.length}` : "full compare set"}</div></div>
          <div class="decision-meta-card"><span class="label">Rig review</span><div class="value">${esc(actualRigFlags)}</div><div class="hint">${esc(actualRigSignals !== "-" ? `${actualRigSignals} | anchor ${actualRigAnchorSummary}` : `anchor ${actualRigAnchorSummary}`)}</div></div>
        </div>
        <div class="decision-action-rail" aria-label="Actual-side actions"><a href="#candidate-score-matrix">Open score matrix</a>${candidateEpisodeHref ? `<a href="${candidateEpisodeHref}">Episode Detail</a>` : ""}<a href="${candidateRolloutsHref}">Rollouts</a></div>
      </article>
    </div>
  </div>
</section>
<section class="card decision-jump-target" id="candidate-score-matrix">
  <div class="section-head"><h2>Candidate Score Matrix</h2><span class="muted-text">Compare prompt selection score, actual rendered output score, and rig-aware judge signals before deciding on promotion.</span></div>
  <div class="table-wrap"><table><thead><tr><th>Candidate</th><th>Prompt Score</th><th>Actual Score</th><th>Delta</th><th>QC</th><th>Head Pose</th><th>Eye Drift</th><th>Mouth Readability</th><th>Landmark Consistency</th><th>Anchor Confidence</th><th>Latency</th><th>Visual Signal</th><th>Artifacts</th></tr></thead><tbody>${compareTableRows || '<tr><td colspan="13"><div class="notice">No candidate judge rows found.</div></td></tr>'}</tbody></table></div>
</section>
<section class="card decision-jump-target" id="candidate-raw-evidence">
	  <div class="section-head"><h2>Artifact Evidence Drawer</h2><span class="muted-text">Prompt and reference bundle that produced this candidate set. Raw prompt text stays behind a disclosure.</span></div>
  <div class="grid two">
    <div class="form-card">
      <h3>Reference Bundle</h3>
      <p>selected view: <strong>${esc(effectiveSelectedView ?? "-")}</strong></p>
      <p>available views: <strong>${esc(summarizeValues(Array.isArray(requestReference.available_views) ? requestReference.available_views.map((item) => str(item)) : [], 4))}</strong></p>
      <p>selection reasons: <strong>${esc(summarizeValues(Array.isArray(requestReference.selection_reasons) ? requestReference.selection_reasons.map((item) => str(item)) : [], 5))}</strong></p>
    </div>
    <div class="form-card">
      <h3>Prompt Preview</h3>
      <details><summary>Open prompt preview only if the compare gate still needs deeper context.</summary><pre>${esc(promptSource || "prompt.txt not available")}</pre></details>
    </div>
  </div>
</section>
<section class="grid two">
  ${candidateCards || '<div class="notice">No candidate detail cards found.</div>'}
</section></div>${renderDecisionJumpScript()}`;
    return reply.type("text/html; charset=utf-8").send(page(`Candidate Compare ${shotId}`, body));
  });

	  app.get("/ui/rollouts", async (request, reply) => {
	    const decisionState = readDecisionLinkState(request.query);
	    const rolloutFocusValue = decisionToken(decisionState.focus);
	    const rolloutSelectedTokens = decisionTokenSet(decisionState.selected);
	    const rolloutPinnedTokens = decisionTokenSet(decisionState.pinned);
	    const withSelectedValues = (...values: Array<string | null | undefined>): string[] =>
	      uniqueStrings([
	        ...decisionState.selected,
	        ...values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
	      ]);
	    const isFocused = (...values: Array<string | null | undefined>): boolean =>
	      decisionSetHas(rolloutSelectedTokens, ...values) ||
	      decisionSetHas(rolloutPinnedTokens, ...values) ||
	      values.some((value) => rolloutFocusValue === decisionToken(value));
	    const { sources, signals } = collectRolloutSignals();
	    const stats = {
	      total: signals.length,
      ready: signals.filter((signal) => normalizeRolloutStatus(signal.status) === "ready").length,
      blocked: signals.filter((signal) => normalizeRolloutStatus(signal.status) === "blocked").length,
	      belowMinScore: signals.filter((signal) => normalizeRolloutStatus(signal.status) === "below_min_score").length,
	      divergence: signals.filter((signal) => normalizeRolloutStatus(signal.status) === "divergence").length
	    };
	    const availableSources = sources.filter((source) => source.exists).length;
	    const rolloutTone: UiBadgeTone =
	      stats.blocked > 0 || stats.belowMinScore > 0 ? "bad" : stats.divergence > 0 ? "warn" : stats.ready > 0 ? "ok" : "muted";
	    const rolloutQueueStatusLabel =
	      stats.blocked > 0 || stats.belowMinScore > 0
	        ? "recovery queue active"
	        : stats.divergence > 0
	          ? "compare before promote"
	          : stats.ready > 0
	            ? "promotion queue ready"
	            : "artifact queue empty";
	    const currentRolloutsHref = uiHref("/ui/rollouts", {
	      params: decisionStateParams(decisionState),
	      hash: "rollout-signal-table"
	    });
	    const rolloutBenchmarkHref = uiHref("/ui/benchmarks", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentRolloutsHref
	      },
	      hash: "benchmark-regressions"
	    });
	    const rolloutRepairHref = uiHref("/ui/benchmarks/repair-acceptance", {
	      params: {
	        ...decisionStateParams(decisionState),
	        returnTo: currentRolloutsHref
	      },
	      hash: "repair-acceptance-table-decision"
	    });
	    const rolloutReturnHref = decisionState.returnTo ?? rolloutBenchmarkHref;
	    const rolloutReturnLabel = decisionState.returnTo
	      ? decisionState.returnTo.includes("/candidates") || decisionState.returnTo.includes("/ab-compare")
	        ? "Reopen Compare"
	        : "Back to list"
	      : "Benchmark Queue";
      const sourceFreshness = sources.map((source) => ({ source, freshness: describeArtifactFreshness(source.latestGeneratedAt) }));
      const staleSourceCount = sourceFreshness.filter((entry) => entry.source.exists && entry.freshness.isStale).length;
      const agingSourceCount = sourceFreshness.filter((entry) => entry.source.exists && entry.freshness.isAging).length;
      const rolloutRefreshSection = buildRolloutRefreshPlaybooksSection({
        staleSourceCount,
        agingSourceCount,
        benchmarkRepairHref: rolloutRepairHref,
        currentRolloutsHref
      });
	    const rolloutSummaryCards: DecisionStat[] = [
	      { label: "Signals", value: String(stats.total), hint: `${availableSources}/${sources.length} artifact roots available`, tone: "muted" },
        { label: "Freshness", value: `${staleSourceCount} stale / ${agingSourceCount} aging`, hint: "artifact age relative to the 168h rollout freshness window", tone: staleSourceCount > 0 ? "bad" : agingSourceCount > 0 ? "warn" : "ok" },
	      { label: "Ready", value: String(stats.ready), hint: "usable or no-change rollout states", tone: stats.ready > 0 ? "ok" : "warn" },
	      { label: "Blocked", value: String(stats.blocked), hint: "failed promotion or inspection states", tone: stats.blocked > 0 ? "bad" : "ok" },
	      { label: "Below Min", value: String(stats.belowMinScore), hint: "scores under rollout threshold", tone: stats.belowMinScore > 0 ? "bad" : "ok" },
	      { label: "Divergence", value: String(stats.divergence), hint: "cross-channel drift to inspect", tone: stats.divergence > 0 ? "warn" : "ok" }
	    ];

	    const sourceRows = sourceFreshness
	      .map(({ source, freshness }) => {
        const tone: UiBadgeTone = !source.exists ? "bad" : source.recordCount > 0 ? "ok" : "warn";
        const label = !source.exists ? "missing" : source.recordCount > 0 ? `${source.recordCount} signals` : "empty";
        const meta = compact([
          source.exists ? "scan ok" : "root missing",
          source.latestGeneratedAt ? `latest ${fmtDate(source.latestGeneratedAt)}` : "no benchmark artifacts",
          source.exists ? freshness.detail : ""
        ]);
        return `<div class="status-row"><div class="stack"><span class="label"><strong>${esc(source.label)}</strong></span><span class="mono">${esc(source.outRoot)}</span><span class="muted-text">${esc(meta)}</span></div><div class="inline-actions"><span class="badge ${tone}">${esc(label)}</span>${source.exists ? `<span class="badge ${freshness.tone}">${esc(freshness.label)}</span>` : ""}${freshness.isStale || freshness.isAging ? `<a class="secondary" href="#benchmark-refresh-playbooks">Refresh playbooks</a>` : ""}${freshness.isStale ? `<a class="secondary" href="${rolloutRepairHref}">Open repair queue</a>` : ""}<button type="button" class="secondary" data-copy="${esc(source.outRoot)}">Copy path</button></div></div>`;
      })
      .join("");

	    const rows = signals
	      .map((signal) => {
	        const rowId = buildDecisionAnchorId("rollout-signal", compact([signal.kind, signal.scope, signal.target], "-") || signal.artifactRelativePath);
	        const detailHref = uiHref("/ui/rollouts/detail", {
	          preserveDecision: decisionState,
	          params: {
	            path: signal.artifactPath,
	            returnTo: currentRolloutsHref,
	            focus: signal.target,
	            selected: withSelectedValues(signal.target, signal.scope, signal.kind)
	          },
	          hash: "rollout-evidence"
	        });
	        return `<tr id="${rowId}" class="decision-focus-row${isFocused(signal.target, signal.scope, signal.kind, signal.artifactRelativePath, signal.artifactPath) ? " is-focused" : ""}"><td><div class="table-note"><strong>${esc(signal.kind)}</strong><span class="muted-text">${esc(`${signal.scope} / ${signal.target}`)}</span><span class="mono">${esc(signal.artifactRelativePath)}</span><div class="inline-actions"><a href="${detailHref}">Decision Detail</a><button type="button" class="secondary" data-copy="${esc(signal.artifactPath)}">Copy path</button></div></div></td><td><span class="badge ${signal.tone}">${esc(rolloutStatusLabel(signal.status))}</span></td><td>${esc(signal.score)}</td><td>${esc(signal.verdict)}</td><td>${esc(signal.reason || "-")}</td><td>${fmtDate(signal.generatedAt)}</td><td><div class="stack"><strong>${esc(signal.sourceLabel)}</strong><span class="mono">${esc(signal.sourcePath)}</span></div></td></tr>`;
	      })
	      .join("");
	    const rolloutBlockers: DecisionCard[] = [];
	    if (stats.blocked > 0 || stats.belowMinScore > 0) {
	      rolloutBlockers.push({
	        title: "Blocked rollout signals",
	        detail: `${stats.blocked} blocked and ${stats.belowMinScore} below-min signals remain in the queue. Recover those before treating ready signals as promotable.`,
	        tone: "bad",
	        badge: "blocked"
	      });
	    }
	    if (availableSources < sources.length) {
	      rolloutBlockers.push({
	        title: "Artifact roots missing",
	        detail: `${sources.length - availableSources} rollout roots are missing, so the queue cannot prove full rollout coverage yet.`,
	        tone: "warn",
	        badge: "sources"
	      });
	    }
	    const rolloutPrimaryActions: DecisionCard[] = [
	      {
	        title: stats.blocked > 0 || stats.belowMinScore > 0 ? "Recover queue first" : "Promotion queue gate",
	        detail: stats.blocked > 0 || stats.belowMinScore > 0 ? "Blocked or below-min rollout signals should be cleared before ready signals are treated as promotion candidates." : "Use the rollout queue as the first promotion gate, then drill into detail only for the signals that still diverge.",
	        tone: rolloutTone,
	        badge: stats.blocked > 0 || stats.belowMinScore > 0 ? "recover" : "gate",
	        html: `<a href="#rollout-signal-table">Signal Queue</a><a href="${rolloutBenchmarkHref}">Benchmarks</a>`
	      }
	    ];
	    const rolloutSecondaryActions: DecisionCard[] = [
	      {
	        title: "Compare before promote",
	        detail: stats.divergence > 0 ? `${stats.divergence} signals still show divergence. Use rollout detail and benchmark objects before opening raw evidence.` : "Divergence is currently quiet, so use detail pages only when a ready signal still feels suspicious.",
	        tone: stats.divergence > 0 ? "warn" : "muted",
	        badge: "compare",
	        html: `<a href="${rolloutBenchmarkHref}">Benchmarks</a><a href="/ui/artifacts">Artifacts</a>`
	      }
	    ];
	    const rolloutRecoveryActions: DecisionCard[] = [
	      {
	        title: "Recovery path",
	        detail: "Rollout detail remains the recovery object. Open it before raw JSON when a signal is blocked, below minimum, or divergent.",
	        tone: rolloutTone,
	        badge: "recover",
	        html: `<a href="#rollout-signal-table">Signal Queue</a><a href="${rolloutBenchmarkHref}">Benchmarks</a>`
	      }
	    ];
	    const rolloutLinkedObjects: DecisionCard[] = [
	      { title: "Benchmark queue", detail: "Rollout review stays adjacent to benchmark review so compare-before-promote keeps upstream context.", tone: "muted", html: `<a href="${rolloutBenchmarkHref}">Open Benchmarks</a>` },
	      { title: "Artifact sources", detail: `${availableSources}/${sources.length} roots are readable for this queue object.`, tone: availableSources === sources.length ? "ok" : "warn", badge: "sources", html: `<a href="#rollout-sources">Artifact Sources</a>` }
	    ];
	    const rolloutDecisionRail: DecisionCard[] = [
	      {
	        title: stats.blocked > 0 || stats.belowMinScore > 0 ? "Recover blocked signals" : "Current promotion gate",
	        detail: stats.blocked > 0 || stats.belowMinScore > 0 ? "Blocked and below-min signals stay ahead of ready rows. Recover those first." : "Use the queue as the normalized promotion gate before moving into rollout detail.",
	        tone: rolloutTone,
	        badge: stats.blocked > 0 || stats.belowMinScore > 0 ? "recover" : "gate",
	        html: `<a href="#rollout-signal-table">Signal Queue</a><a href="${rolloutBenchmarkHref}">Benchmarks</a>`
	      },
	      {
	        title: "Compare before promote",
	        detail: stats.divergence > 0 ? `${stats.divergence} divergence signals still need compare-before-promote review.` : "No divergence signals remain. Open detail only for edge cases that still feel inconsistent.",
	        tone: stats.divergence > 0 ? "warn" : "ok",
	        badge: "compare",
	        html: `<a href="${rolloutBenchmarkHref}">Benchmark Queue</a>`
	      },
	      {
	        title: "Rollback anchor",
	        detail: stats.ready > 0 ? `${stats.ready} ready signals remain as the cleanest queue-side rollback anchor.` : "No ready signal is available yet, so blocked or divergent rows remain the active review anchor.",
	        tone: stats.ready > 0 ? "ok" : "warn",
	        badge: "rollback",
	        html: `<a href="${rolloutBenchmarkHref}">Benchmarks</a><a href="/ui/artifacts">Artifacts</a>`
	      }
	    ];
	    const rolloutSnapshotFacts: DecisionFact[] = [
	      { label: "Failure Reason", value: stats.blocked > 0 ? `${stats.blocked} blocked signals` : stats.belowMinScore > 0 ? `${stats.belowMinScore} below-min signals` : stats.divergence > 0 ? `${stats.divergence} divergence signals` : "none", hint: "top rollout queue blocker" },
	      { label: "Last Known Good", value: stats.ready > 0 ? `${stats.ready} ready signals` : "no ready signal", hint: "queue-side clean anchor" },
	      { label: "Fallback Applied", value: stats.divergence > 0 ? "compare before promote" : "detail-first review", hint: "current rollout queue mode" },
	      { label: "Retry Path", value: "rollout detail -> benchmark queue -> evidence drawer", hint: rolloutQueueStatusLabel },
	      { label: "Alternate Path", value: "benchmark queue / artifact sources", hint: "adjacent review surfaces" },
	      { label: "Rollback Point", value: stats.ready > 0 ? "ready rollout signals" : "signal recovery queue", hint: "rollout queue rollback anchor" }
	    ];
	    const rolloutEvidenceFacts: DecisionFact[] = [
	      { label: "Sources", value: `${availableSources}/${sources.length}`, hint: "configured rollout roots available" },
	      { label: "Signals", value: String(stats.total), hint: `${stats.ready} ready / ${stats.blocked} blocked` },
	      { label: "Divergence", value: String(stats.divergence), hint: "signals needing compare-before-promote review" },
	      { label: "Below Min", value: String(stats.belowMinScore), hint: "signals under rollout threshold" }
	    ];
	    const rolloutJumpFacts: DecisionFact[] = [
	      ...(decisionState.focus
	        ? [{ label: "Focus", value: humanizeOpsLabel(decisionState.focus), hint: "incoming object or section focus" }]
	        : []),
	      ...(decisionState.selected.length > 0
	        ? [{ label: "Selected", value: summarizeValues(decisionState.selected, 3), hint: `${decisionState.selected.length} selected ids preserved in queue state` }]
	        : []),
	      ...(decisionState.compare.length > 0
	        ? [{ label: "Compare", value: summarizeValues(decisionState.compare, 3), hint: "compare handoff kept adjacent to rollout review" }]
	        : []),
	      ...(decisionState.pinned.length > 0
	        ? [{ label: "Pinned", value: summarizeValues(decisionState.pinned, 3), hint: "pinned objects remain visible in the header" }]
	        : []),
	      ...(decisionState.view
	        ? [{ label: "View", value: humanizeOpsLabel(decisionState.view), hint: "view mode preserved across the jump" }]
	        : [])
	    ];
	    const rolloutJumpBanner = renderDecisionJumpBanner({
	      title: "Deep-link handoff",
	      intro: "Selection, compare context, and return path stay visible so the rollout queue reads as the next decision surface instead of a detached artifact list.",
	      facts: rolloutJumpFacts,
	      linksHtml: `<a href="${rolloutReturnHref}">${rolloutReturnLabel}</a><a href="${rolloutBenchmarkHref}">Benchmark Queue</a><a href="${currentRolloutsHref}">Refresh handoff</a>`,
	      tone: rolloutTone
	    });
	    const rolloutEvidenceDrawerBody = `<div class="decision-copy">This queue is the normalized rollout review object. Use decision detail and linked benchmark objects before reading raw artifact payloads.</div><div class="status-list">${sourceRows || '<div class="notice">No rollout artifact sources configured.</div>'}</div><details class="decision-drawer"><summary>Open rollout queue evidence order</summary><div class="decision-drawer-body"><div class="decision-copy">Rollout queue -> rollout detail -> benchmark queue -> raw artifact payloads. Raw JSON should be the fallback, not the first-line review surface.</div><div class="quick-links"><a href="${rolloutBenchmarkHref}">Benchmarks</a><a href="/ui/artifacts">Artifacts</a></div></div></details>`;
	    const rolloutsBody = `${decisionSurfaceStyles()}<div class="decision-surface">${renderObjectHero({
	      eyebrow: "Rollout Review",
	      title: "Rollouts",
	      subtitle: "Treat rollout signals as artifact-backed review objects: blocked states, compare-before-promote context, and rollback anchors stay above raw evidence.",
	      statusLabel: rolloutQueueStatusLabel,
	      statusTone: rolloutTone,
	      flash: `${flashHtml(request.query)}${rolloutJumpBanner}`,
	      quickLinksHtml: `<a href="${rolloutReturnHref}">${rolloutReturnLabel}</a><a href="${rolloutBenchmarkHref}">Benchmarks</a><a href="/ui/artifacts">Artifacts</a><a href="/ui/health">Health</a>`,
	      summaryCards: rolloutSummaryCards,
	      metaItems: [
	        { label: "Artifact Sources", value: `${availableSources}/${sources.length}`, hint: "configured roots available" },
	        { label: "Ready Signals", value: String(stats.ready), hint: "usable promotion candidates" },
	        { label: "Blocked Signals", value: String(stats.blocked), hint: "failed or inspection-required states" },
	        { label: "Queue Mode", value: stats.divergence > 0 ? "compare before promote" : "detail-first review", hint: "current rollout review stance" }
	      ],
	      blockers: rolloutBlockers,
	      primaryActions: rolloutPrimaryActions,
	      secondaryActions: rolloutSecondaryActions,
	      recoveryActions: rolloutRecoveryActions,
	      recentActivity: signals.slice(0, 4).map((signal) => ({
	        title: `${signal.kind} / ${signal.target}`,
	        detail: `${rolloutStatusLabel(signal.status)} | ${signal.verdict} | ${fmtDate(signal.generatedAt)}`,
	        tone: signal.tone,
	        badge: signal.scope
	      })),
	      linkedObjects: rolloutLinkedObjects
	    })}${renderDecisionPrioritySection({
	      sectionId: "rollout-decision-rail",
	      title: "Decision Rail",
	      intro: "Blocked states, compare-before-promote rules, and rollback anchors stay above signal scanning.",
	      linksHtml: `<a href="${rolloutReturnHref}">${rolloutReturnLabel}</a><a href="${rolloutBenchmarkHref}">Benchmarks</a>`,
	      railTitle: "Rollout actions",
	      railIntro: "Recover blocked signals first, compare before promote, then hold on the cleanest ready signal as the queue-side rollback anchor.",
	      railCards: rolloutDecisionRail,
	      railEmpty: "No rollout actions are available.",
	      railTone: rolloutTone,
	      snapshotIntro: "Failure reason, last-known-good queue anchor, retry path, and rollback point stay above the table.",
	      snapshotFacts: rolloutSnapshotFacts,
	      snapshotEmpty: "No rollout recovery snapshot is available.",
	      snapshotTone: rolloutTone
	    })}${renderRecoveryRailSection({
	      sectionId: "rollout-recovery-rail",
	      title: "Recovery / Linked Objects",
	      intro: "Recovery order and linked queues stay visible before signal tables or source roots.",
	      linksHtml: `<a href="${rolloutReturnHref}">${rolloutReturnLabel}</a><a href="/ui/artifacts">Artifacts</a>`,
	      recoveryTitle: "Recovery rail",
	      recoveryIntro: "Use rollout detail as the recovery object and keep benchmark context adjacent while recovering blocked signals.",
	      recoveryCards: rolloutRecoveryActions,
	      recoveryEmpty: "No rollout recovery rail is available.",
	      recoveryTone: rolloutTone,
	      linkedTitle: "Linked object rail",
	      linkedIntro: "Benchmark queue and artifact sources remain attached to the rollout queue object.",
	      linkedCards: rolloutLinkedObjects,
	      linkedEmpty: "No linked rollout objects are available.",
	      linkedTone: "muted"
	    })}${renderArtifactEvidenceSection({
	      sectionId: "rollout-evidence",
	      title: "Artifact Evidence Drawer",
	      intro: "Source roots and raw evidence remain available, but the queue stays the primary rollout review surface.",
	      linksHtml: `<a href="${rolloutReturnHref}">${rolloutReturnLabel}</a><a href="/ui/artifacts">Artifacts</a>`,
	      summaryTitle: "Rollout evidence summary",
	      summaryIntro: "Source availability, signal counts, and compare pressure stay above source rows.",
	      summaryFacts: rolloutEvidenceFacts,
	      summaryEmpty: "No rollout evidence summary is available.",
	      summaryTone: rolloutTone,
	      drawerTitle: "Rollout queue evidence drawer",
	      drawerIntro: "Open source roots and evidence order only after the normalized queue still feels inconclusive.",
	      drawerSummary: "Open rollout queue evidence order and raw-evidence policy",
	      drawerBodyHtml: rolloutEvidenceDrawerBody,
	      drawerTone: "muted",
	      drawerOpen: ["evidence", "artifact", "raw"].includes(rolloutFocusValue) || decisionToken(decisionState.view) === "evidence"
	    })}${rolloutRefreshSection}<section class="card decision-jump-target" id="rollout-signal-table"><div class="section-head"><div><h2>Signal Queue</h2><p class="section-intro">Each signal remains an artifact-backed review object. Open decision detail only for rows that still need deeper proof.</p></div><input type="search" data-table-filter="rollouts-table" aria-label="Filter rollout signals" placeholder="Search signal kind, scope, target, verdict, reason..."/></div><div class="table-wrap"><table id="rollouts-table"><thead><tr><th>Object / Next Action</th><th>Status</th><th>Score</th><th>Verdict</th><th>Reason</th><th>Generated</th><th>Source</th></tr></thead><tbody>${rows || '<tr><td colspan="7"><div class="notice">No rollout signals were found.</div></td></tr>'}</tbody></table></div></section><section class="card decision-jump-target" id="rollout-sources"><div class="section-head"><div><h2>Artifact Sources</h2><p class="section-intro">Source roots remain visible as supporting evidence, but they no longer lead the queue narrative.</p></div></div><div class="status-list">${sourceRows || '<div class="notice">No rollout artifact sources configured.</div>'}</div></section></div>${renderDecisionJumpScript()}`;
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










