
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createValidator, sha256Hex, stableStringify } from "@ec/shared";
import type { EpisodeJobPayload } from "../services/scheduleService";

type JsonRecord = Record<string, unknown>;
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
    return "힌트: 먼저 COMPILE_SHOTS를 실행해 shots.json을 생성하세요.";
  }
  if (text.includes("redis") || text.includes("queue") || text.includes("503") || text.includes("unavailable")) {
    return "힌트: queue/redis 상태를 확인하고 /ui/health에서 서비스 상태를 점검하세요.";
  }
  if (text.includes("preview") || text.includes("render")) {
    return "힌트: render 단계 실패입니다. /ui/jobs에서 lastError와 로그를 확인하세요.";
  }
  return "힌트: /ui/jobs에서 실패한 job 로그를 확인 후 retry 하세요.";
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
    preview: path.join(outDir, "preview.mp4"),
    final: path.join(outDir, "final.mp4"),
    qc: path.join(outDir, "qc_report.json")
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

function fmtDate(value: unknown): string {
  if (typeof value !== "string") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return date.toLocaleString("ko-KR", { hour12: false });
}

function badgeClass(status: string): string {
  const s = status.toUpperCase();
  if (["SUCCEEDED", "COMPLETED", "PREVIEW_READY", "UP", "READY", "OK"].includes(s)) return "ok";
  if (["FAILED", "DOWN", "ERROR"].includes(s)) return "bad";
  if (["RUNNING", "GENERATING"].includes(s)) return "warn";
  return "muted";
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)}</title><style>
body{margin:0;font-family:Segoe UI,Noto Sans KR,sans-serif;background:#f5f7fb;color:#1a2433}header{background:#fff;border-bottom:1px solid #d6deea;position:sticky;top:0}nav{max-width:1200px;margin:0 auto;padding:12px 18px;display:flex;gap:14px;align-items:center}nav strong{margin-right:auto}main{max-width:1200px;margin:18px auto;padding:0 18px;display:grid;gap:12px}.card{background:#fff;border:1px solid #d6deea;border-radius:12px;padding:14px}.notice{padding:9px;border-left:4px solid #2f7eed;background:#edf4ff}.error{padding:9px;border-left:4px solid #d92d20;background:#fff0ef}.grid{display:grid;gap:10px}.two{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}a{color:#0f5bd8;text-decoration:none}a:hover{text-decoration:underline}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #e3e8f1;padding:7px;text-align:left;vertical-align:top}.badge{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}.badge.ok{background:#eaf6ed;color:#1d7a34}.badge.warn{background:#fff8e8;color:#945f02}.badge.bad{background:#fff1ef;color:#b42318}.badge.muted{background:#f2f4f7;color:#475467}input,select,textarea,button{font:inherit;border:1px solid #ccd6e5;border-radius:8px;padding:7px 9px}textarea{width:100%;min-height:220px;resize:vertical}button{background:#0f5bd8;color:#fff;border:none;font-weight:700;cursor:pointer}.secondary{background:#eef3fc;color:#143d6a;border:1px solid #cad8f2}pre{margin:0;background:#0b1220;color:#d3e1ff;padding:10px;border-radius:8px;overflow:auto;font-size:12px}.actions{display:flex;flex-wrap:wrap;gap:8px}.inline{display:inline-flex;gap:8px;align-items:center}
.toast-wrap{position:fixed;right:16px;bottom:16px;display:grid;gap:8px;z-index:9999}.toast{background:#0b1220;color:#f8fbff;border-radius:10px;padding:10px 12px;box-shadow:0 8px 22px rgba(0,0,0,.2);min-width:240px;max-width:460px}.toast.ok{background:#14532d}.toast.warn{background:#854d0e}.toast.bad{background:#7f1d1d}.toast .title{font-weight:700;margin-bottom:4px}.submit-loading{opacity:.72;pointer-events:none}.submit-loading::after{content:"...";margin-left:4px}.field-error{color:#b42318;font-size:12px;padding-top:2px}.hint{display:inline-block;border-bottom:1px dotted #8ca1bf;color:#305f99;cursor:help;font-size:12px}
.shortcut-help{position:fixed;inset:0;background:rgba(11,18,32,.45);display:none;align-items:center;justify-content:center;z-index:9998}.shortcut-help.open{display:flex}.shortcut-card{width:min(620px,90vw);background:#fff;border-radius:12px;border:1px solid #d6deea;padding:14px}.shortcut-card h2{margin:0 0 8px}.shortcut-card table{font-size:14px}.sr-live{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}
</style></head><body><header><nav><strong>Eraser Cat Control Plane</strong><a href="/ui">Dashboard</a><a href="/ui/jobs">Jobs</a><a href="/ui/assets">Assets</a><a href="/ui/characters">Characters</a><a href="/ui/character-generator">Character Generator</a><a href="/ui/hitl">HITL</a><a href="/ui/episodes">Render Preview</a><a href="/ui/publish">Publish</a><a href="/ui/health">Health</a><a href="/ui/artifacts">Artifacts</a><button id="shortcut-open" type="button" class="secondary" title="단축키 도움말 (?)">?</button></nav></header><main>${body}</main><div id="global-live" class="sr-live" aria-live="polite"></div><div id="toast-wrap" class="toast-wrap" aria-live="polite" aria-atomic="true"></div><div id="shortcut-help" class="shortcut-help"><div class="shortcut-card"><h2>Shortcuts</h2><table><thead><tr><th>Key</th><th>Action</th></tr></thead><tbody><tr><td>?</td><td>도움말 열기/닫기</td></tr><tr><td>g then e</td><td>Episodes 이동</td></tr><tr><td>g then j</td><td>Jobs 이동</td></tr><tr><td>g then h</td><td>Health 이동</td></tr><tr><td>r</td><td>현재 페이지 주요 액션 실행</td></tr></tbody></table><div class="actions" style="margin-top:10px"><button id="shortcut-close" type="button">닫기</button></div></div></div><script>
(() => {
  const toastWrap = document.getElementById('toast-wrap');
  const live = document.getElementById('global-live');
  const shortcut = document.getElementById('shortcut-help');
  const openShortcut = document.getElementById('shortcut-open');
  const closeShortcut = document.getElementById('shortcut-close');
  if (openShortcut && shortcut) openShortcut.addEventListener('click', () => shortcut.classList.add('open'));
  if (closeShortcut && shortcut) closeShortcut.addEventListener('click', () => shortcut.classList.remove('open'));

  const speak = (text) => { if (live) live.textContent = text; };
  const classifyError = (msg) => {
    const text = (msg || '').toLowerCase();
    if (text.includes('503') || text.includes('unavailable') || text.includes('redis')) return { label: 'ServiceUnavailable', tone: 'bad' };
    if (text.includes('404') || text.includes('not found')) return { label: 'NotFound', tone: 'warn' };
    if (text.includes('400') || text.includes('required') || text.includes('validation')) return { label: 'Validation', tone: 'warn' };
    return { label: 'UnknownError', tone: 'bad' };
  };
  const toast = (title, message, tone = 'ok', timeoutMs = 5000) => {
    if (!toastWrap) return;
    const node = document.createElement('div');
    node.className = 'toast ' + tone;
    node.innerHTML = '<div class="title">' + title + '</div><div>' + message + '</div>';
    toastWrap.appendChild(node);
    speak(title + ': ' + message);
    setTimeout(() => node.remove(), timeoutMs);
  };

  const url = new URL(window.location.href);
  const message = url.searchParams.get('message');
  const error = url.searchParams.get('error');
  if (message) {
    toast('Success', message, 'ok');
    document.querySelectorAll('.notice').forEach((el, idx) => { if (idx === 0) el.remove(); });
  }
  if (error) {
    const c = classifyError(error);
    toast(c.label, error, c.tone, 7000);
    document.querySelectorAll('.error').forEach((el, idx) => { if (idx === 0) el.remove(); });
  }

  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      const failedShotIds = form.querySelector('input[name="failedShotIds"]');
      if (failedShotIds instanceof HTMLInputElement) {
        const value = failedShotIds.value.trim();
        if (value.length > 0 && !/^shot_[\\w-]+(\\s*,\\s*shot_[\\w-]+)*$/.test(value)) {
          event.preventDefault();
          const next = failedShotIds.nextElementSibling;
          if (!next || !(next instanceof HTMLElement) || !next.classList.contains('field-error')) {
            const msg = document.createElement('div');
            msg.className = 'field-error';
            msg.textContent = '형식: shot_1,shot_2';
            failedShotIds.insertAdjacentElement('afterend', msg);
          }
          toast('Validation', 'failedShotIds 형식이 잘못되었습니다.', 'warn');
          failedShotIds.focus();
          return;
        }
      }
      const submit = form.querySelector('button[type="submit"]');
      if (submit instanceof HTMLButtonElement) {
        if (submit.dataset.busy === '1') {
          event.preventDefault();
          return;
        }
        submit.dataset.busy = '1';
        submit.classList.add('submit-loading');
        submit.disabled = true;
      }
      const runGroup = form.dataset.runGroup;
      if (runGroup) {
        document.querySelectorAll('form[data-run-group="' + runGroup + '"] button[type="submit"]').forEach((node) => {
          if (!(node instanceof HTMLButtonElement)) return;
          node.dataset.busy = '1';
          node.classList.add('submit-loading');
          node.disabled = true;
        });
      }
    });
  });

  document.querySelectorAll('[data-tooltip]').forEach((node) => {
    if (node instanceof HTMLElement && !node.title) {
      node.title = String(node.dataset.tooltip || '');
    }
  });

  const runLive = document.getElementById('run-profile-live');
  if (runLive instanceof HTMLElement) {
    const episodeId = String(runLive.dataset.episodeId || '').trim();
    const hintForError = (msg) => {
      const text = String(msg || '').toLowerCase();
      if (text.includes('shots.json')) return '힌트: COMPILE_SHOTS를 먼저 실행하세요.';
      if (text.includes('redis') || text.includes('queue') || text.includes('503') || text.includes('unavailable')) return '힌트: /ui/health에서 queue/redis를 확인하세요.';
      return '힌트: /ui/jobs에서 lastError를 확인하세요.';
    };
    const renderLive = (item) => {
      if (!item) {
        runLive.innerHTML = '최근 실행 이력이 없습니다.';
        return;
      }
      const status = String(item.status || 'UNKNOWN');
      const type = String(item.type || '-');
      const progress = Number.isFinite(Number(item.progress)) ? Number(item.progress) : 0;
      const jobId = String(item.id || '');
      const base = '최근 작업: ' + type + ' / ' + status + ' / ' + progress + '%';
      if (status === 'FAILED') {
        const err = String(item.lastError || '(none)');
        runLive.textContent = base + ' | ' + err + ' | ' + hintForError(err);
        runLive.classList.remove('notice');
        runLive.classList.add('error');
        return;
      }
      runLive.textContent = base;
      runLive.classList.remove('error');
      runLive.classList.add('notice');
      if (jobId) {
        const a = document.createElement('a');
        a.href = '/ui/jobs/' + encodeURIComponent(jobId);
        a.textContent = ' (job)';
        runLive.appendChild(a);
      }
    };
    const poll = async () => {
      if (!episodeId) return;
      try {
        const res = await fetch('/api/jobs?episodeId=' + encodeURIComponent(episodeId) + '&limit=10', { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error('poll failed: ' + res.status);
        const json = await res.json();
        const list = Array.isArray(json && json.data) ? json.data : [];
        const latest = list.length > 0 ? list[0] : null;
        renderLive(latest);
      } catch (e) {
        runLive.classList.remove('notice');
        runLive.classList.add('error');
        runLive.textContent = '상태 갱신 실패: ' + String(e);
      }
    };
    let timer = null;
    const startPolling = () => {
      if (timer !== null) return;
      timer = setInterval(() => { void poll(); }, 5000);
    };
    const stopPolling = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }
      void poll();
      startPolling();
    };
    void poll();
    startPolling();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  let pendingGo = false;
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
    if (editing) return;
    if (e.key === '?') {
      e.preventDefault();
      if (shortcut) shortcut.classList.toggle('open');
      return;
    }
    if (pendingGo) {
      pendingGo = false;
      if (e.key === 'e') window.location.href = '/ui/episodes';
      if (e.key === 'j') window.location.href = '/ui/jobs';
      if (e.key === 'h') window.location.href = '/ui/health';
      return;
    }
    if (e.key === 'g') {
      pendingGo = true;
      setTimeout(() => { pendingGo = false; }, 1500);
      return;
    }
    if (e.key === 'r') {
      const primary = document.querySelector('button[data-primary-action="1"], form button[type="submit"]');
      if (primary instanceof HTMLButtonElement && !primary.disabled) {
        e.preventDefault();
        primary.click();
      }
    }
  });
})();
</script></body></html>`;
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
    removeOnComplete: false,
    removeOnFail: false
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
    return { label: "ServiceUnavailable", badge: "bad", hint: "Health 페이지에서 Redis/Queue 상태를 확인하세요." };
  }
  if (text.includes("404") || text.includes("not found")) {
    return { label: "NotFound", badge: "warn", hint: "ID를 다시 확인하고 목록 페이지에서 존재 여부를 점검하세요." };
  }
  if (text.includes("400") || text.includes("required") || text.includes("validation")) {
    return { label: "Validation", badge: "warn", hint: "입력 형식을 확인한 뒤 다시 시도하세요." };
  }
  return { label: "UnknownError", badge: "bad", hint: "Jobs/Health 로그를 확인하고 필요하면 Retry 하세요." };
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

    const body = `
<section class="card"><h1>Dashboard</h1>
${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}
${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}
<div class="grid two">
  <div class="card">
    <h2>현재 상태</h2>
    <p>health: <span class="badge ${badgeClass(overall)}">${esc(overall)}</span></p>
    <p>database: <span class="badge ${badgeClass(dbStatus)}">${esc(dbStatus)}</span></p>
    <p>redis: <span class="badge ${badgeClass(redisStatus)}">${esc(redisStatus)}</span></p>
    <p>minio: <span class="badge ${badgeClass(minioStatus)}">${esc(minioStatus)}</span></p>
    <p>queueReady: <span class="badge ${queueReady ? "ok" : "bad"}">${esc(queueReady)}</span></p>
    <p><a href="/ui/health">Open full health report</a></p>
  </div>
  <div class="card">
    <h2>Quick Actions</h2>
    <form method="post" action="/ui/actions/demo-extreme" class="inline"><button type="submit" data-primary-action="1">Demo Extreme 실행</button></form>
    <form method="post" action="/ui/actions/generate-preview" class="grid"><label>Preview topic<input name="topic" value="UI Preview Demo"/></label><label>targetDurationSec<input name="targetDurationSec" value="600"/></label><div class="actions"><button type="submit">원클릭 Preview Render 시작</button></div></form>
    <form method="post" action="/ui/actions/generate-full" class="grid"><label>Full pipeline topic<input name="topic" value="UI Full Pipeline Demo"/></label><label>targetDurationSec<input name="targetDurationSec" value="600"/></label><div class="actions"><button type="submit" class="secondary">Run Final + Package</button></div></form>
  </div>
</div>
</section>

<section class="card"><h2>Control Plane</h2>
<div class="grid two">
<a href="/ui/jobs">Jobs</a>
<a href="/ui/assets">Assets</a>
<a href="/ui/characters">Characters</a>
<a href="/ui/character-generator">Character Generator</a>
<a href="/ui/hitl">HITL</a>
<a href="/ui/episodes">Render Preview</a>
<a href="/ui/publish">Publish</a>
<a href="/ui/health">Health Report</a>
</div>
</section>

<section class="card"><h2>원클릭 개발 실행 가이드</h2>
<ol>
<li>Infra 시작: <code>pnpm docker:up</code></li>
<li>DB 마이그레이션: <code>pnpm db:migrate</code></li>
<li>API 실행: <code>pnpm -C apps/api run dev</code></li>
<li>Worker 실행: <code>pnpm -C apps/worker run dev</code></li>
</ol>
<div class="actions">
<button type="button" onclick="navigator.clipboard.writeText('pnpm docker:up')">Copy docker:up</button>
<button type="button" onclick="navigator.clipboard.writeText('pnpm db:migrate')">Copy db:migrate</button>
<button type="button" onclick="navigator.clipboard.writeText('pnpm -C apps/api run dev')">Copy api dev</button>
<button type="button" onclick="navigator.clipboard.writeText('pnpm -C apps/worker run dev')">Copy worker dev</button>
</div>
</section>`;

    return reply.type("text/html; charset=utf-8").send(page("Dashboard", body));
  });

  app.get("/ui/health", async (_request, reply) => {
    const [healthz, health] = await Promise.all([injectJson(app, "GET", "/healthz"), injectJson(app, "GET", "/health")]);

    if (healthz.statusCode >= 400 || !isRecord(healthz.body) || !isRecord(healthz.body.data)) {
      const fallbackMessage =
        isRecord(healthz.body) && typeof healthz.body.error === "string"
          ? healthz.body.error
          : `healthz unavailable (${healthz.statusCode})`;

      return reply.type("text/html; charset=utf-8").send(page("Health", `<section class="card"><h1>Health</h1><div class="error">${esc(fallbackMessage)}</div><p><a href="/health">Open /health JSON</a></p></section>`));
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
        `<section class="card"><h1>Health Report</h1><p>overall: <span class="badge ${overallOk ? "ok" : "bad"}">${overallOk ? "up" : "down"}</span></p><p>checkedAt: ${esc(checkedAt)}</p><p>queue: ${esc(baseHealthData.queue ?? "-")} / redis=${esc(baseHealthData.redis ?? "-")} / queueReady=${esc(baseHealthData.queueReady ?? "-")}</p>${overallOk ? '<div class="notice">All core services are healthy.</div>' : '<div class="error">One or more services are down. Run the fix commands below.</div>'}</section><section class="card"><h2>Run Profile Dedup</h2><p>window: ${RUN_PROFILE_DEDUP_WINDOW_MS}ms / active keys: ${runProfileDedupCache.size} / hits: ${runProfileDedupStats.hits} / enqueues: ${runProfileDedupStats.enqueues}</p><div class="actions"><form method="post" action="/ui/health/dedup/reset" class="inline"><button type="submit" class="secondary">Reset Dedup Cache/Stats</button></form></div><table><thead><tr><th>Dedup Key</th><th>Job</th><th>Age</th></tr></thead><tbody>${dedupEntries || '<tr><td colspan="3"><div class="notice">No recent dedup entries.</div></td></tr>'}</tbody></table></section><section class="card"><h2>Service Status</h2><table><thead><tr><th>Service</th><th>Status</th><th>Details</th></tr></thead><tbody>${serviceRows}</tbody></table></section><section class="card"><h2>Fix Commands (PowerShell)</h2><table><thead><tr><th>Name</th><th>Command</th></tr></thead><tbody>${commandRows}</tbody></table></section>`
      )
    );
  });

  app.post("/ui/health/dedup/reset", async (_request, reply) => {
    runProfileDedupCache.clear();
    runProfileDedupStats.hits = 0;
    runProfileDedupStats.enqueues = 0;
    return reply.redirect(`/ui/health?message=${encodeURIComponent("Run profile dedup cache/stats reset")}`);
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

    return reply.type("text/html; charset=utf-8").send(page("Episodes", `<section class="card"><h1>Episodes</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<form method="post" action="/ui/episodes" class="grid two"><label>topic<input name="topic" required data-tooltip="예: Q4 성장률 분석"/></label><label>channelId(optional)<input name="channelId"/></label><label>targetDurationSec<input name="targetDurationSec" value="600"/></label><label>jobType<select name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option></select></label><label>pipelineMode<select name="pipelineMode"><option value="preview">preview-only</option><option value="full">full(final+package)</option><option value="manual">manual</option></select></label><label>stylePreset <span class="hint" data-tooltip="AUTO면 episode snapshot tone/speed/KPI를 기반으로 자동 선택">?</span><select name="stylePresetId">${styleOptions}</select></label><label>hookBoost(0~1)<input type="range" name="hookBoost" min="0" max="1" step="0.05" value="${DEFAULT_HOOK_BOOST}" oninput="this.nextElementSibling.value=this.value"/><output>${DEFAULT_HOOK_BOOST}</output></label><div class="actions" style="grid-column:1/-1"><button type="submit" data-primary-action="1">Create Episode + Enqueue</button></div></form></section><section class="card"><h2>Latest Episodes</h2><p class="notice">목록은 7초마다 자동 갱신됩니다(백그라운드 탭에서는 중지).</p><table id="episodes-table"><thead><tr><th>ID</th><th>Topic</th><th>Status</th><th>Channel</th><th>Style</th><th>Latest Job</th><th>Duration</th><th>Created</th><th>Quick Run</th></tr></thead><tbody>${list || '<tr><td colspan="9"><div class="notice">에피소드가 없습니다. 위 폼에서 먼저 생성하세요.</div></td></tr>'}</tbody></table></section>${autoRefreshScript}`));
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
    const qcIssueRows = qcIssues
      .map(
        (issue, index) =>
          `<tr><td>${index + 1}</td><td>${esc(issue.check)}</td><td><span class="badge ${badgeClass(issue.severity)}">${esc(issue.severity)}</span></td><td>${esc(issue.message)}</td><td><pre>${esc(JSON.stringify(issue.details, null, 2))}</pre></td></tr>`
      )
      .join("");

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
    const selectedRunProfile = normalizeRunProfile(q(request.query, "profile"));
    const runProfileOptions = RUN_PROFILE_VALUES
      .map((profileId) => {
        const label =
          profileId === "preview"
            ? "preview (추천)"
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
        return `<tr><td>${esc(type)}</td><td><span class="badge ${badgeClass(status)}">${esc(status)}</span></td><td>${esc(progress)}%</td><td>${jobId ? `<a href="/ui/jobs/${esc(jobId)}">${esc(jobId)}</a>` : "-"}</td></tr>`;
      })
      .join("");
    const recommendAction = (() => {
      const shotsReady = artifacts.shotsFileExists === true || fs.existsSync(localOut.shots);
      if (!shotsReady) {
        return {
          title: "추천: COMPILE_SHOTS 먼저 실행",
          detail: "shots.json이 없어 render 단계가 실패할 수 있습니다. COMPILE_SHOTS를 먼저 수행하세요."
        };
      }
      if (!previewExists) {
        return {
          title: "추천: Preview 렌더 실행",
          detail: "preview.mp4가 아직 없습니다. Run Profile을 preview로 실행해 빠르게 확인하세요."
        };
      }
      if (!finalExists || !uploadManifestExists) {
        return {
          title: "추천: Full pipeline 실행",
          detail: "최종 결과(final/manifest)가 아직 완성되지 않았습니다. full 프로필로 마무리하세요."
        };
      }
      return {
        title: "파이프라인 주요 산출물 준비 완료",
        detail: "preview/final/manifest가 모두 존재합니다. 필요 시 style A/B 비교나 publish를 진행하세요."
      };
    })();

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
      <h3>Documents</h3>
      <p>beats.json: <span class="badge ${artifacts.beatsFileExists ? "ok" : "bad"}">${artifacts.beatsFileExists ? "exists" : "missing"}</span></p>
      <p>shots.json: <span class="badge ${artifacts.shotsFileExists ? "ok" : "bad"}">${artifacts.shotsFileExists ? "exists" : "missing"}</span></p>
      <p>qc_report.json: <span class="badge ${qcExists ? "ok" : "bad"}">${qcExists ? "exists" : "missing"}</span></p>
      <p>STYLE_QC(main): fail=${styleQcMain.failCount} warn=${styleQcMain.warnCount} forced=${esc(styleQcMain.forcedStyle)}</p>
    </div>
    <div class="card">
      <h3>Renders</h3>
      <p>preview.mp4: <span class="badge ${previewExists ? "ok" : "bad"}">${previewExists ? "exists" : "missing"}</span></p>
      <p>preview_A.mp4: <span class="badge ${previewAExists ? "ok" : "bad"}">${previewAExists ? "exists" : "missing"}</span></p>
      <p>preview_B.mp4: <span class="badge ${previewBExists ? "ok" : "bad"}">${previewBExists ? "exists" : "missing"}</span></p>
      <p>final.mp4: <span class="badge ${finalExists ? "ok" : "bad"}">${finalExists ? "exists" : "missing"}</span></p>
      <p>upload_manifest.json: <span class="badge ${uploadManifestExists ? "ok" : "bad"}">${uploadManifestExists ? "exists" : "missing"}</span></p>
    </div>
  </div>
  <div class="card">
    <h3>Studio Control Panel</h3>
    <div class="notice"><strong>${esc(recommendAction.title)}</strong><br/>${esc(recommendAction.detail)}</div>
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
        <button type="submit" data-primary-action="1">Run Profile (원클릭)</button>
        <a href="/ui/jobs" class="secondary" style="padding:7px 9px;border-radius:8px;border:1px solid #cad8f2">Jobs Monitor</a>
      </div>
    </form>
    <p class="notice">프로필 설명: preview=빠른 프리뷰, full=최종 렌더+패키징, render_only=현재 shots 기준 preview 렌더만 수행</p>
    <div id="run-profile-live" data-episode-id="${esc(id)}" class="notice">최근 실행 상태를 불러오는 중...</div>
    <table><thead><tr><th>Latest Job Type</th><th>Status</th><th>Progress</th><th>Job</th></tr></thead><tbody>${runStateRows || '<tr><td colspan="4"><div class="notice">작업 이력이 없습니다. 위 Run Profile로 시작하세요.</div></td></tr>'}</tbody></table>
  </div>
  <div class="card">
    <h3>Style Controls</h3>
    <form method="post" action="/ui/episodes/${esc(id)}/style-preview" class="grid two">
      <label>stylePreset<select name="stylePresetId">${styleOptions}</select></label>
      <label>hookBoost(0~1)<input type="range" name="hookBoost" min="0" max="1" step="0.05" value="${esc(style.hookBoost.toFixed(2))}" oninput="this.nextElementSibling.value=this.value"/><output>${esc(style.hookBoost.toFixed(2))}</output></label>
      <div class="actions" style="grid-column:1/-1"><button type="submit">Style Preview (약 10초)</button></div>
    </form>
    <form method="post" action="/ui/episodes/${esc(id)}/ab-preview" class="grid two">
      <label>Variant A Style<select name="styleA">${concreteStyleOptionsA}</select></label>
      <label>Variant B Style<select name="styleB">${concreteStyleOptionsB}</select></label>
      <div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">A/B 프리뷰 비교 생성</button><a href="/ui/episodes/${esc(id)}/ab-compare">A/B 비교 페이지</a></div>
    </form>
    <p>A STYLE_QC: fail=${styleQcA.failCount} warn=${styleQcA.warnCount} forced=${esc(styleQcA.forcedStyle)} | B STYLE_QC: fail=${styleQcB.failCount} warn=${styleQcB.warnCount} forced=${esc(styleQcB.forcedStyle)}</p>
  </div>
  <div class="actions">
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="GENERATE_BEATS"/><input type="hidden" name="pipelineMode" value="preview"/>${styleHidden}<button type="submit">원클릭: Preview Render 시작</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="GENERATE_BEATS"/><input type="hidden" name="pipelineMode" value="full"/>${styleHidden}<button type="submit" class="secondary">Run Final + Package</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="COMPILE_SHOTS"/>${styleHidden}<button type="submit">Enqueue COMPILE_SHOTS</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="RENDER_PREVIEW"/>${styleHidden}<button type="submit">Render Preview</button></form>
    <form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><select name="jobType"><option value="GENERATE_BEATS">GENERATE_BEATS</option><option value="COMPILE_SHOTS">COMPILE_SHOTS</option><option value="RENDER_PREVIEW">RENDER_PREVIEW</option><option value="RENDER_FINAL">RENDER_FINAL</option><option value="PACKAGE_OUTPUTS">PACKAGE_OUTPUTS</option></select>${styleHidden}<button type="submit" class="secondary">Force Enqueue</button></form>
    <a href="/ui/episodes/${esc(id)}/editor" class="secondary" style="padding:7px 9px;border-radius:8px;border:1px solid #cad8f2">Shot Editor (timeline)</a>
  </div>
</section>
<section class="card">
  <h2>Preview Player</h2>
  ${previewExists ? `<video controls preload="metadata" style="width:100%;max-width:960px;background:#000;border-radius:8px" src="${previewUrl}"></video><p><a href="${previewUrl}">Open preview.mp4 directly</a></p>` : '<div class="error">preview.mp4가 아직 생성되지 않았습니다. 위 버튼으로 Preview Render를 시작하세요.</div>'}
  ${(previewAExists || previewBExists) ? `<p>${previewAExists ? `<a href="${previewAUrl}">Open preview_A.mp4</a>` : "preview_A missing"} | ${previewBExists ? `<a href="${previewBUrl}">Open preview_B.mp4</a>` : "preview_B missing"}</p>` : ""}
</section>
<section class="card">
  <h2>QC Report</h2>
  ${qcExists ? (qcIssues.length > 0 ? `<table><thead><tr><th>#</th><th>Check</th><th>Severity</th><th>Message</th><th>Details</th></tr></thead><tbody>${qcIssueRows}</tbody></table>` : `<div class="notice">qc_report.json이 존재하지만 실패 이슈가 없습니다.</div><pre>${esc(JSON.stringify(qcReport, null, 2))}</pre>`) : '<div class="error">qc_report.json이 아직 없습니다.</div>'}
</section>
<section class="card">
  <h2>Jobs</h2>
  <div aria-live="polite" class="notice">작업 상태는 아래 테이블에서 실시간으로 갱신됩니다. 실패 시 Retry를 사용하세요.</div>
  <table><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Attempts</th><th>Backoff</th><th>Created</th></tr></thead><tbody>${rows || '<tr><td colspan="7"><div class="notice">작업 이력이 없습니다. 위의 Enqueue 버튼으로 시작하세요.</div></td></tr>'}</tbody></table>
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

    const shotsDoc = doc as JsonRecord & { shots: unknown[] };
    const shots = shotsDoc.shots
      .map((raw, index) => {
        if (!isRecord(raw)) return "";
        const shotId = typeof raw.shot_id === "string" ? raw.shot_id : `shot_${index + 1}`;
        const startFrame = typeof raw.start_frame === "number" ? raw.start_frame : 0;
        const durationFrames = typeof raw.duration_frames === "number" ? raw.duration_frames : 0;
        const transition = typeof raw.transition === "string" ? raw.transition : "cut";
        const keyframes = isRecord(raw.camera) && Array.isArray(raw.camera.keyframes) ? raw.camera.keyframes.length : 0;
        return `<tr><td>${index + 1}</td><td><code>${esc(shotId)}</code></td><td>${startFrame}</td><td>${durationFrames}</td><td>${esc(transition)}</td><td>${keyframes}</td><td><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="move"/><input type="hidden" name="index" value="${index}"/><input type="hidden" name="delta" value="-1"/><button type="submit">Up</button></form><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="move"/><input type="hidden" name="index" value="${index}"/><input type="hidden" name="delta" value="1"/><button type="submit">Down</button></form></td><td><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="tweak"/><input type="hidden" name="shotId" value="${esc(shotId)}"/><label>zoom<input name="zoomMult" value="1.00" style="width:64px"/></label><label>panX<input name="panXDelta" value="0.00" style="width:64px"/></label><label>transition<input name="transitionStrength" value="0.50" style="width:64px"/></label><button type="submit">Apply</button></form></td></tr>`;
      })
      .join("");

    const snapshotsPath = editorSnapshotsDir(id);
    const snapshots = fs.existsSync(snapshotsPath)
      ? fs.readdirSync(snapshotsPath).filter((name) => name.endsWith(".json")).sort((a, b) => b.localeCompare(a)).slice(0, 10)
      : [];
    const snapshotItems = snapshots.length > 0 ? snapshots.map((name) => `<li><a href="/artifacts/${encodeURIComponent(id)}/editor_snapshots/${encodeURIComponent(name)}">${esc(name)}</a></li>`).join("") : "<li>(none)</li>";

    const body = `<section class="card"><h1>Shot Timeline Editor</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<p>episodeId: <a href="/ui/episodes/${esc(id)}">${esc(id)}</a></p><p>history: ${history.pointer + 1} / ${history.states.length}</p><div class="actions"><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="undo"/><button type="submit" ${history.pointer <= 0 ? "disabled" : ""}>Undo</button></form><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="redo"/><button type="submit" ${history.pointer >= history.states.length - 1 ? "disabled" : ""}>Redo</button></form><form method="post" action="/ui/episodes/${esc(id)}/editor" class="inline"><input type="hidden" name="op" value="snapshot"/><button type="submit" class="secondary" data-primary-action="1">Save Snapshot</button></form><form method="post" action="/ui/episodes/${esc(id)}/enqueue" class="inline"><input type="hidden" name="jobType" value="RENDER_PREVIEW"/><button type="submit" class="secondary">Render Preview</button></form></div><div class="notice">단축키: <strong>r</strong> (현재 주요 액션), shot 이동은 Up/Down 버튼 사용</div></section><section class="card"><h2>Timeline</h2><table><thead><tr><th>#</th><th>shot_id</th><th>start</th><th>duration</th><th>transition</th><th>camera keys</th><th>order</th><th>override</th></tr></thead><tbody>${shots}</tbody></table></section><section class="card"><h2>Snapshots</h2><ul>${snapshotItems}</ul></section>`;
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
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?message=${encodeURIComponent("Undo applied")}`);
    }

    if (op === "redo") {
      if (history.pointer < history.states.length - 1) {
        history.pointer += 1;
      }
      writeEditorHistory(id, history);
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?message=${encodeURIComponent("Redo applied")}`);
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
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?message=${encodeURIComponent("Timeline reordered")}`);
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
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}/editor?message=${encodeURIComponent(`Shot updated: ${shotId}`)}`);
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
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?message=${encodeURIComponent("shots.json이 없어 COMPILE_SHOTS를 먼저 enqueue했습니다. 완료 후 Style Preview를 다시 실행하세요.")}`);
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
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?error=${encodeURIComponent("A/B 스타일은 서로 달라야 합니다.")}`);
    }

    const out = getEpisodeOutPaths(id);
    const baseShotsDoc = readJsonFileSafe(out.shots);
    if (!baseShotsDoc) {
      return reply.redirect(`/ui/episodes/${encodeURIComponent(id)}?error=${encodeURIComponent("shots.json이 없습니다. 먼저 COMPILE_SHOTS를 실행하세요.")}`);
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

    return reply.type("text/html; charset=utf-8").send(
      page(
        "Jobs",
        `<section class="card"><h1>Jobs</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<table><thead><tr><th>Job</th><th>Episode</th><th>Type</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead><tbody>${rows || '<tr><td colspan="6"><div class="notice">아직 작업이 없습니다. Dashboard에서 Quick Action을 실행하세요.</div></td></tr>'}</tbody></table></section>`
      )
    );
  });

  app.get("/ui/publish", async (request, reply) => {
    const episodeId = q(request.query, "episodeId") ?? "";
    return reply.type("text/html; charset=utf-8").send(
      page(
        "Publish",
        `<section class="card"><h1>Publish</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<form method="post" action="/ui/publish" class="grid two"><label>episodeId <span class="hint" data-tooltip="Episode Detail의 ID를 입력하세요">?</span><input name="episodeId" value="${esc(episodeId)}" placeholder="clx..." required/></label><div class="actions" style="align-items:end"><button type="submit" data-primary-action="1">Publish 실행</button></div></form><p><a href="/ui/jobs">작업 상태는 Jobs에서 확인</a></p></section>`
      )
    );
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
    const errorStack = job.lastError ? `<details><summary>lastError stack 펼치기/접기</summary><pre>${esc(job.lastError)}</pre></details>` : "<p>lastError: (none)</p>";

    return reply.type("text/html; charset=utf-8").send(page(`Job ${id}`, `<section class="card"><h1>Job Detail</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<p>jobId: <strong>${esc(job.id)}</strong></p><p>episodeId: <a href="/ui/episodes/${esc(episodeId)}">${esc(episodeId)}</a></p><p>type: ${esc(job.type)}</p><p>status: <span class="badge ${badgeClass(String(job.status ?? ""))}">${esc(job.status)}</span></p><p>progress: ${esc(job.progress)}%</p><p>attempts: ${esc(job.attemptsMade)} / ${esc(job.maxAttempts)} (backoff: ${esc(job.retryBackoffMs)}ms)</p>${errorStack}<div class="actions">${canRetry ? `<form method="post" action="/ui/jobs/${esc(id)}/retry"><button type="submit">Retry (FAILED job)</button></form>` : `<button type="button" class="secondary" disabled>Retry는 FAILED 상태에서만 가능</button>`}<a href="/artifacts/${esc(episodeId)}/">Open artifacts folder</a><a href="/ui/artifacts?episodeId=${encodeURIComponent(episodeId)}">Artifacts shortcuts</a></div></section><section class="card"><h2>Job Logs</h2><table><thead><tr><th>Created</th><th>Level</th><th>Message</th><th>Details</th></tr></thead><tbody>${logRows || '<tr><td colspan="4">No logs</td></tr>'}</tbody></table></section>`));
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

    return reply.type("text/html; charset=utf-8").send(page("HITL", `<section class="card"><h1>HITL Rerender</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<form method="post" action="/ui/hitl/rerender" class="grid"><div class="grid two"><label>episodeId<input name="episodeId" value="${esc(q(request.query, "episodeId") ?? "")}" required/></label><label>failedShotIds <span class="hint" data-tooltip="형식: shot_1,shot_2">?</span><input name="failedShotIds" value="${esc(q(request.query, "failedShotIds") ?? "")}" placeholder="shot_1,shot_2" required/></label></div><label><input type="checkbox" name="dryRun" value="true"/> dryRun</label><div class="actions"><button type="submit" data-primary-action="1">Rerender selected shots</button></div></form></section><section class="card"><h2>Failed Jobs</h2><table><thead><tr><th>Job</th><th>Episode</th><th>Topic</th><th>Type</th><th>Created</th><th>Error</th></tr></thead><tbody>${rows || '<tr><td colspan="6"><div class="notice">실패한 작업이 없습니다. 문제가 재현되면 여기에 표시됩니다.</div></td></tr>'}</tbody></table></section>`));
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

    return reply.type("text/html; charset=utf-8").send(page("Artifacts", `<section class="card"><h1>Artifacts</h1>${q(request.query, "message") ? `<div class="notice">${esc(q(request.query, "message"))}</div>` : ""}${q(request.query, "error") ? `<div class="error">${esc(q(request.query, "error"))}</div>` : ""}<p><a href="/artifacts/">Open /artifacts/</a></p><form method="get" action="/ui/artifacts" class="inline"><label>episodeId <input name="episodeId" value="${esc(episodeId ?? "")}"/></label><button type="submit" class="secondary" data-primary-action="1">Open shortcuts</button></form>${episodeLinks}</section><section class="card"><h2>out/ index</h2><table><thead><tr><th>Type</th><th>Name</th><th>URL</th></tr></thead><tbody>${rows || '<tr><td colspan="3"><div class="notice">아직 생성된 아티팩트가 없습니다. Episode를 렌더링하면 여기에 표시됩니다.</div></td></tr>'}</tbody></table></section>`));
  });
}







