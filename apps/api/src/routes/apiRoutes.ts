import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import sharp from "sharp";
import type { Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { EpisodeJobPayload } from "../services/scheduleService";
import { makeStorageKey, putAssetObject } from "../services/assetStorage";
import { enqueueWithResilience } from "../services/enqueueWithResilience";

type JsonRecord = Record<string, unknown>;
type HttpError = Error & { statusCode: number; details?: unknown };
type EpisodeJobPayloadWithRender = EpisodeJobPayload & {
  pipeline?: {
    stopAfterPreview?: boolean;
    autoRenderFinal?: boolean;
    finalPreset?: Record<string, unknown>;
    story?: {
      bibleRef?: string;
      outline?: string[];
      paragraphs?: string[];
      targetBeatCount?: number;
      stylePresetId?: string;
      hookBoost?: number;
    };
  };
  render?: {
    rerenderFailedShotsOnly?: boolean;
    failedShotIds?: string[];
    dryRun?: boolean;
  };
};

type RegisterApiRoutesInput = {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue: Queue;
  queueName: string;
};

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = 1000;
const MAX_LIST_LIMIT = 200;
const DEFAULT_LIST_LIMIT = 50;

const DEMO_USER_EMAIL = "demo.extreme@example.com";
const DEMO_USER_NAME = "demo-extreme";
const DEMO_CHANNEL_NAME = "Extreme Demo Channel";

const ENQUEUE_JOB_TYPES = [
  "GENERATE_BEATS",
  "COMPILE_SHOTS",
  "RENDER_PREVIEW",
  "RENDER_FINAL",
  "PACKAGE_OUTPUTS"
] as const;

const STYLE_PRESET_VALUES = [
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
const AUTO_STYLE_PRESET_ID = "AUTO";

const JOB_STATUS_VALUES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
const ASSET_TYPE_VALUES = [
  "character_reference",
  "character_view",
  "background",
  "chart_source"
] as const;
const ASSET_INGEST_JOB_NAME = "ASSET_INGEST";
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MIN_UPLOAD_DIMENSION = 512;
const MAX_UPLOAD_DIMENSION = 12_000;
const EXTREME_ASPECT_RATIO = 3.5;
const BLUR_WARN_VARIANCE = 18;

type AssetQcIssue = {
  code: string;
  message: string;
};

type UploadQcSummary = {
  ok: boolean;
  dimensions: {
    width: number;
    height: number;
  };
  aspectRatio: number;
  hasAlpha: boolean;
  exifOrientation: number | null;
  exifRotationHandled: boolean;
  blurVariance: number;
  warnings: AssetQcIssue[];
  hardFails: AssetQcIssue[];
};

type QcBadgeSummary = {
  level: "OK" | "WARN" | "ERROR" | "N/A";
  className: "ok" | "warn" | "bad" | "muted";
  reason: string;
};

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireBodyObject(body: unknown): JsonRecord {
  if (!isRecord(body)) {
    throw createHttpError(400, "Request body must be a JSON object");
  }
  return body;
}

function requireRouteParam(params: unknown, field: string): string {
  if (!isRecord(params)) {
    throw createHttpError(400, "Route params are invalid");
  }

  const value = params[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, `${field} path param must be a non-empty string`);
  }

  return value.trim();
}

function optionalString(obj: JsonRecord, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `${field} must be a string`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalQueryString(query: unknown, field: string): string | undefined {
  if (!isRecord(query)) {
    return undefined;
  }

  const value = query[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `${field} query must be a string`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInt(value: unknown, field: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) {
      throw createHttpError(400, `${field} must be a positive integer`);
    }
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw createHttpError(400, `${field} must be a positive integer`);
    }
    return parsed;
  }

  throw createHttpError(400, `${field} must be a positive integer`);
}

function parseBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseStringArray(value: unknown, field: string): string[] {
  if (value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    const out = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter((entry) => entry.length > 0);
    return Array.from(new Set(out));
  }

  if (typeof value === "string") {
    const out = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return Array.from(new Set(out));
  }

  throw createHttpError(400, `${field} must be an array or comma-separated string`);
}

type EpisodeStyleConfig = {
  stylePresetId: string;
  hookBoost: number;
};

function normalizeStylePresetId(value: unknown, fallback: string = AUTO_STYLE_PRESET_ID): string {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `stylePresetId must be one of: ${AUTO_STYLE_PRESET_ID}, ${STYLE_PRESET_VALUES.join(", ")}`);
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === AUTO_STYLE_PRESET_ID) {
    return AUTO_STYLE_PRESET_ID;
  }

  const found = STYLE_PRESET_VALUES.find((item) => item === normalized);
  if (!found) {
    throw createHttpError(400, `stylePresetId must be one of: ${AUTO_STYLE_PRESET_ID}, ${STYLE_PRESET_VALUES.join(", ")}`);
  }

  return found;
}

function parseHookBoost(value: unknown, fallback = 0.55): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  let parsed: number | null = null;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    const n = Number.parseFloat(value);
    if (Number.isFinite(n)) {
      parsed = n;
    }
  }

  if (parsed === null) {
    throw createHttpError(400, "hookBoost must be a number between 0 and 1");
  }

  return clamp(parsed, 0, 1);
}

function readEpisodeStyleFromSnapshot(snapshot: unknown): EpisodeStyleConfig {
  if (!isRecord(snapshot) || !isRecord(snapshot.style)) {
    return {
      stylePresetId: AUTO_STYLE_PRESET_ID,
      hookBoost: 0.55
    };
  }

  const style = snapshot.style;
  return {
    stylePresetId: normalizeStylePresetId(style.stylePresetId, AUTO_STYLE_PRESET_ID),
    hookBoost: parseHookBoost(style.hookBoost, 0.55)
  };
}

function resolveEpisodeStyleConfig(body: JsonRecord, fallback: EpisodeStyleConfig): EpisodeStyleConfig {
  return {
    stylePresetId: normalizeStylePresetId(body.stylePresetId, fallback.stylePresetId),
    hookBoost: parseHookBoost(body.hookBoost, fallback.hookBoost)
  };
}

function requireTopic(body: JsonRecord): string {
  const topic = optionalString(body, "topic");
  if (!topic) {
    throw createHttpError(400, "topic is required");
  }
  return topic;
}

function requireEpisodeJobType(value: unknown): (typeof ENQUEUE_JOB_TYPES)[number] {
  if (typeof value !== "string") {
    throw createHttpError(400, "jobType is required");
  }

  const normalized = value.trim().toUpperCase();
  const found = ENQUEUE_JOB_TYPES.find((item) => item === normalized);
  if (!found) {
    throw createHttpError(400, `jobType must be one of: ${ENQUEUE_JOB_TYPES.join(", ")}`);
  }

  return found;
}

function requireAssetType(value: unknown): (typeof ASSET_TYPE_VALUES)[number] {
  if (typeof value !== "string") {
    throw createHttpError(400, `assetType is required and must be one of: ${ASSET_TYPE_VALUES.join(", ")}`);
  }

  const normalized = value.trim().toLowerCase();
  const found = ASSET_TYPE_VALUES.find((item) => item === normalized);
  if (!found) {
    throw createHttpError(400, `assetType must be one of: ${ASSET_TYPE_VALUES.join(", ")}`);
  }

  return found;
}

function toPrismaAssetType(value: (typeof ASSET_TYPE_VALUES)[number]):
  | "CHARACTER_REFERENCE"
  | "CHARACTER_VIEW"
  | "BACKGROUND"
  | "CHART_SOURCE" {
  switch (value) {
    case "character_reference":
      return "CHARACTER_REFERENCE";
    case "character_view":
      return "CHARACTER_VIEW";
    case "background":
      return "BACKGROUND";
    case "chart_source":
      return "CHART_SOURCE";
  }
}

function fileExtensionFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "bin";
}

function ensureJobStatus(value: string): (typeof JOB_STATUS_VALUES)[number] {
  const found = JOB_STATUS_VALUES.find((item) => item === value);
  if (!found) {
    throw createHttpError(400, `status query must be one of: ${JOB_STATUS_VALUES.join(", ")}`);
  }
  return found;
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toQcIssue(code: string, message: string): AssetQcIssue {
  return { code, message };
}

function readIssueArray(value: unknown): AssetQcIssue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const out: AssetQcIssue[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const code = typeof item.code === "string" ? item.code : "";
    const message = typeof item.message === "string" ? item.message : "";
    if (!code || !message) {
      continue;
    }
    out.push({ code, message });
  }
  return out;
}

async function estimateBlurVariance(buffer: Buffer): Promise<number> {
  const resized = await sharp(buffer)
    .rotate()
    .grayscale()
    .resize({
      width: 192,
      height: 192,
      fit: "inside",
      withoutEnlargement: true
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = resized.info.width;
  const height = resized.info.height;
  if (width < 3 || height < 3) {
    return 0;
  }

  const data = resized.data;
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const center = data[idx];
      const lap =
        4 * center -
        data[idx - 1] -
        data[idx + 1] -
        data[idx - width] -
        data[idx + width];
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }

  if (count === 0) {
    return 0;
  }

  const mean = sum / count;
  const variance = sumSq / count - mean * mean;
  if (!Number.isFinite(variance) || variance < 0) {
    return 0;
  }
  return variance;
}

async function analyzeUploadQc(input: {
  fileBuffer: Buffer;
  metadata: sharp.Metadata;
  assetType: (typeof ASSET_TYPE_VALUES)[number];
}): Promise<UploadQcSummary> {
  const width = input.metadata.width ?? 0;
  const height = input.metadata.height ?? 0;
  const orientation = typeof input.metadata.orientation === "number" ? input.metadata.orientation : null;
  const hasAlpha = input.metadata.hasAlpha === true;

  const warnings: AssetQcIssue[] = [];
  const hardFails: AssetQcIssue[] = [];

  if (width <= 0 || height <= 0) {
    hardFails.push(toQcIssue("unreadable_image", "이미지 메타데이터를 읽을 수 없습니다."));
  }

  if (width > 0 && height > 0 && (width < MIN_UPLOAD_DIMENSION || height < MIN_UPLOAD_DIMENSION)) {
    hardFails.push(
      toQcIssue(
        "image_too_small",
        `이미지가 너무 작습니다 (${width}x${height}). 최소 ${MIN_UPLOAD_DIMENSION}px 이상이어야 합니다.`
      )
    );
  }

  if (width > MAX_UPLOAD_DIMENSION || height > MAX_UPLOAD_DIMENSION) {
    hardFails.push(
      toQcIssue(
        "image_too_large_dimension",
        `이미지 해상도가 너무 큽니다 (${width}x${height}). 긴 변은 ${MAX_UPLOAD_DIMENSION}px 이하여야 합니다.`
      )
    );
  }

  const aspectRatio = width > 0 && height > 0 ? width / height : 0;
  if (aspectRatio > EXTREME_ASPECT_RATIO || (aspectRatio > 0 && aspectRatio < 1 / EXTREME_ASPECT_RATIO)) {
    warnings.push(
      toQcIssue(
        "extreme_aspect_ratio",
        `가로세로 비율이 극단적입니다 (${aspectRatio.toFixed(3)}). 구성/크롭 품질을 확인하세요.`
      )
    );
  }

  if ((input.assetType === "character_reference" || input.assetType === "character_view") && !hasAlpha) {
    warnings.push(toQcIssue("no_alpha_channel", "캐릭터 이미지에 알파 채널이 없습니다. 배경 제거가 필요할 수 있습니다."));
  }

  let blurVariance = 0;
  try {
    blurVariance = await estimateBlurVariance(input.fileBuffer);
    if (blurVariance < BLUR_WARN_VARIANCE) {
      warnings.push(
        toQcIssue("blur_detected", `이미지가 흐릴 수 있습니다 (blurVariance=${blurVariance.toFixed(2)}).`)
      );
    }
  } catch (error) {
    warnings.push(toQcIssue("blur_check_failed", `블러 지표 계산 실패: ${errorMessage(error)}`));
  }

  return {
    ok: hardFails.length === 0,
    dimensions: { width, height },
    aspectRatio: Number(aspectRatio.toFixed(4)),
    hasAlpha,
    exifOrientation: orientation,
    exifRotationHandled: orientation !== null && orientation !== 1,
    blurVariance: Number(blurVariance.toFixed(4)),
    warnings,
    hardFails
  };
}

function getQcBadgeSummary(status: string, qcJson: unknown): QcBadgeSummary {
  if (!isRecord(qcJson)) {
    if (status.toUpperCase() === "FAILED") {
      return { level: "ERROR", className: "bad", reason: "FAILED" };
    }
    return { level: "N/A", className: "muted", reason: "qcJson 없음" };
  }

  const warnings = readIssueArray(qcJson.warnings);
  const hardFails = readIssueArray(qcJson.hardFails);
  const hasFallbackWarning = isRecord(qcJson.normalization)
    ? readIssueArray((qcJson.normalization as JsonRecord).warnings).length > 0
    : false;

  if (hardFails.length > 0 || qcJson.ok === false || status.toUpperCase() === "FAILED") {
    const reason =
      hardFails[0]?.message ??
      (typeof qcJson.error === "string" ? qcJson.error : "QC 실패");
    return { level: "ERROR", className: "bad", reason };
  }

  if (warnings.length > 0 || hasFallbackWarning) {
    const reason =
      warnings[0]?.message ??
      (hasFallbackWarning ? "정규화 일부 실패(원본 폴백)" : "경고 있음");
    return { level: "WARN", className: "warn", reason };
  }

  if (status.toUpperCase() === "READY" || qcJson.ok === true) {
    return { level: "OK", className: "ok", reason: "문제 없음" };
  }

  return { level: "N/A", className: "muted", reason: "처리 중" };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRedisUnavailableError(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes("Redis unavailable") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("Connection is closed")
  );
}

async function ensureDefaultChannel(prisma: PrismaClient): Promise<{ id: string }> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { name: DEMO_USER_NAME },
    create: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME }
  });

  const existing = await prisma.channel.findFirst({
    where: {
      userId: user.id,
      name: DEMO_CHANNEL_NAME
    },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return { id: existing.id };
  }

  const created = await prisma.channel.create({
    data: {
      userId: user.id,
      name: DEMO_CHANNEL_NAME
    }
  });

  return { id: created.id };
}

function getRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../../");
}

function getEpisodeOutPaths(episodeId: string): { outDir: string; beatsPath: string; shotsPath: string; previewPath: string; finalPath: string } {
  const outDir = path.join(getRepoRoot(), "out", episodeId);
  return {
    outDir,
    beatsPath: path.join(outDir, "beats.json"),
    shotsPath: path.join(outDir, "shots.json"),
    previewPath: path.join(outDir, "preview.mp4"),
    finalPath: path.join(outDir, "final.mp4")
  };
}

function normalizeStorageKey(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

function storageKeyToArtifactUrl(storageKey: string | null | undefined): string | null {
  if (!storageKey) {
    return null;
  }

  const normalized = normalizeStorageKey(storageKey);
  if (!normalized) {
    return null;
  }

  const encoded = normalized
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/artifacts/storage/${encoded}`;
}

function storageKeyExistsLocally(storageKey: string | null | undefined): boolean {
  if (!storageKey) {
    return false;
  }

  const normalized = normalizeStorageKey(storageKey);
  if (!normalized) {
    return false;
  }

  const localPath = path.join(getRepoRoot(), "out", "storage", normalized);
  return fs.existsSync(localPath);
}

function isDbUnavailableError(error: unknown): boolean {
  const msg = errorMessage(error).toLowerCase();
  return msg.includes("can't reach database server") || msg.includes("prismaclientinitializationerror");
}

function internalHeaders(): Record<string, string> {
  const apiKey = process.env.API_KEY?.trim();
  if (apiKey) {
    return {
      "x-api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json"
    };
  }

  return {
    "content-type": "application/json",
    accept: "application/json"
  };
}

function parseJsonBody(raw: string): unknown {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function escHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function uiBadgeClass(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === "READY" || normalized === "SUCCEEDED") return "ok";
  if (normalized === "FAILED") return "bad";
  if (normalized === "PROCESSING" || normalized === "RUNNING") return "warn";
  return "muted";
}

function fmtUiDate(value: Date): string {
  return value.toLocaleString("ko-KR", { hour12: false });
}

function uiPage(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(
    title
  )}</title><style>body{margin:0;font-family:Segoe UI,Noto Sans KR,sans-serif;background:#f5f7fb;color:#1a2433}header{background:#fff;border-bottom:1px solid #d6deea;position:sticky;top:0}nav{max-width:1100px;margin:0 auto;padding:12px 18px;display:flex;gap:14px;align-items:center}nav strong{margin-right:auto}main{max-width:1100px;margin:18px auto;padding:0 18px;display:grid;gap:12px}.card{background:#fff;border:1px solid #d6deea;border-radius:12px;padding:14px}a{color:#0f5bd8;text-decoration:none}a:hover{text-decoration:underline}.grid{display:grid;gap:10px}.two{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #e3e8f1;padding:7px;text-align:left}.badge{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}.badge.ok{background:#eaf6ed;color:#1d7a34}.badge.warn{background:#fff8e8;color:#945f02}.badge.bad{background:#fff1ef;color:#b42318}.badge.muted{background:#f2f4f7;color:#475467}input,select,button{font:inherit;border:1px solid #ccd6e5;border-radius:8px;padding:7px 9px}button{background:#0f5bd8;color:#fff;border:none;font-weight:700;cursor:pointer}pre{margin:0;background:#0b1220;color:#d3e1ff;padding:10px;border-radius:8px;overflow:auto;font-size:12px}.preview-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.preview-card{border:1px solid #e3e8f1;border-radius:10px;padding:8px;background:#f8fbff}.preview-card img{width:100%;max-height:240px;object-fit:contain;background:#fff;border:1px solid #dce5f3;border-radius:8px}</style></head><body><header><nav><strong>Eraser Cat 에셋</strong><a href=\"/ui\">대시보드</a><a href=\"/ui/studio\">통합 스튜디오</a><a href=\"/ui/assets\">에셋</a><a href=\"/ui/characters\">캐릭터</a><a href=\"/ui/character-generator\">캐릭터 생성기</a><a href=\"/ui/artifacts\">아티팩트</a></nav></header><main>${body}</main></body></html>`;
}

export function registerApiRoutes(input: RegisterApiRoutesInput): void {
  const { app, prisma, queue, queueName } = input;

  app.register(multipart, {
    limits: {
      files: 1,
      fileSize: MAX_UPLOAD_BYTES
    }
  });

  app.get("/api/jobs", async (request) => {
    const episodeId = optionalQueryString(request.query, "episodeId");
    const statusRaw = optionalQueryString(request.query, "status");
    const limitValue = optionalQueryString(request.query, "limit");
    const limit = Math.min(parsePositiveInt(limitValue, "limit", DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT);

    const where: Prisma.JobWhereInput = {};
    if (episodeId) {
      where.episodeId = episodeId;
    }
    if (statusRaw) {
      where.status = ensureJobStatus(statusRaw.toUpperCase());
    }

    const rows = await prisma.job.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        episode: {
          select: {
            id: true,
            topic: true,
            status: true
          }
        }
      }
    });

    return { data: rows };
  });

  app.get("/api/jobs/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!job) {
      throw createHttpError(404, "Job not found");
    }

    return {
      data: {
        id: job.id,
        episodeId: job.episodeId,
        type: job.type,
        status: job.status,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.maxAttempts,
        bullmqJobId: job.bullmqJobId,
        lastError: job.lastError,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        logs: job.logs
      }
    };
  });

  app.post("/api/jobs/:id/retry", async (request, reply) => {
    const id = requireRouteParam(request.params, "id");
    const body = request.body === undefined ? {} : requireBodyObject(request.body);

    const source = await prisma.job.findUnique({
      where: { id }
    });

    if (!source) {
      throw createHttpError(404, "Job not found");
    }

    const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", Math.max(1, source.maxAttempts));
    const retryBackoffMs = parsePositiveInt(
      body.retryBackoffMs,
      "retryBackoffMs",
      Math.max(DEFAULT_RETRY_BACKOFF_MS, source.retryBackoffMs)
    );

    const failedShotIds = parseStringArray(body.failedShotIds, "failedShotIds");
    const dryRun = parseBoolean(body.dryRun, false);

    const created = await prisma.job.create({
      data: {
        episodeId: source.episodeId,
        type: source.type,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: created.id,
        level: "info",
        message: "Transition -> QUEUED",
        details: toPrismaJson({
          source: "api:jobs:retry",
          retryOfJobId: source.id,
          queueName,
          maxAttempts,
          retryBackoffMs
        })
      }
    });

    const payload: EpisodeJobPayloadWithRender = {
      jobDbId: created.id,
      episodeId: created.episodeId,
      schemaChecks: []
    };

    if (failedShotIds.length > 0 || source.type === "RENDER_PREVIEW" || source.type === "RENDER_FINAL") {
      payload.render = {
        rerenderFailedShotsOnly: failedShotIds.length > 0,
        ...(failedShotIds.length > 0 ? { failedShotIds } : {}),
        dryRun
      };
    }

    const enqueueResult = await enqueueWithResilience({
      queue,
      name: source.type,
      payload,
      maxAttempts,
      backoffMs: retryBackoffMs,
      maxEnqueueRetries: 2,
      retryDelayMs: 200,
      redisUnavailableAsHttp503: true
    });
    const bullmqJobId = String(enqueueResult.job.id);

    const updated = await prisma.job.update({
      where: { id: created.id },
      data: {
        status: "QUEUED",
        bullmqJobId,
        lastError: null,
        finishedAt: null
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: updated.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:jobs:retry",
          retryOfJobId: source.id,
          queueName,
          bullmqJobId,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });

    return reply.code(201).send({
      data: {
        sourceJobId: source.id,
        job: updated,
        queue: {
          queueName,
          bullmqJobId
        }
      }
    });
  });

  app.get("/api/episodes", async (request) => {
    const limitValue = optionalQueryString(request.query, "limit");
    const limit = Math.min(parsePositiveInt(limitValue, "limit", DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT);

    const rows = await prisma.episode.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        channel: {
          select: {
            id: true,
            name: true
          }
        },
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            type: true,
            status: true,
            progress: true,
            createdAt: true,
            updatedAt: true
          }
        },
        beatsDoc: {
          select: {
            id: true,
            updatedAt: true
          }
        },
        shotsDoc: {
          select: {
            id: true,
            updatedAt: true
          }
        }
      }
    });

    const data = rows.map((row) => {
      const out = getEpisodeOutPaths(row.id);
      return {
        ...row,
        artifacts: {
          previewExists: fs.existsSync(out.previewPath),
          finalExists: fs.existsSync(out.finalPath)
        }
      };
    });

    return { data };
  });

  app.get("/api/episodes/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");

    const episode = await prisma.episode.findUnique({
      where: { id },
      include: {
        channel: {
          select: {
            id: true,
            name: true
          }
        },
        bible: {
          select: {
            id: true,
            version: true,
            updatedAt: true
          }
        },
        season: {
          select: {
            id: true,
            name: true
          }
        },
        beatsDoc: {
          select: {
            id: true,
            updatedAt: true,
            hash: true
          }
        },
        shotsDoc: {
          select: {
            id: true,
            updatedAt: true,
            hash: true
          }
        }
      }
    });

    if (!episode) {
      throw createHttpError(404, "Episode not found");
    }

    const jobs = await prisma.job.findMany({
      where: { episodeId: id },
      orderBy: { createdAt: "desc" },
      include: {
        logs: {
          orderBy: { createdAt: "asc" }
        }
      }
    });

    const out = getEpisodeOutPaths(id);

    return {
      data: {
        episode,
        jobs,
        artifacts: {
          outDir: out.outDir,
          beatsPath: out.beatsPath,
          shotsPath: out.shotsPath,
          previewPath: out.previewPath,
          finalPath: out.finalPath,
          beatsFileExists: fs.existsSync(out.beatsPath),
          shotsFileExists: fs.existsSync(out.shotsPath),
          previewExists: fs.existsSync(out.previewPath),
          finalExists: fs.existsSync(out.finalPath)
        }
      }
    };
  });

  app.post("/api/episodes", async (request, reply) => {
    const body = requireBodyObject(request.body);

    const topic = requireTopic(body);
    const targetDurationSec = parsePositiveInt(body.targetDurationSec, "targetDurationSec", 600);
    const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
    const jobType = body.jobType === undefined ? "GENERATE_BEATS" : requireEpisodeJobType(body.jobType);
    const styleConfig = resolveEpisodeStyleConfig(body, {
      stylePresetId: AUTO_STYLE_PRESET_ID,
      hookBoost: 0.55
    });
    const characterPackId = optionalString(body, "characterPackId");
    let characterPackVersion: number | undefined;
    if (characterPackId) {
      const pack = await prisma.characterPack.findUnique({
        where: { id: characterPackId },
        select: { id: true, version: true }
      });
      if (!pack) {
        throw createHttpError(400, `characterPackId not found: ${characterPackId}`);
      }
      characterPackVersion = pack.version;
    }

    const channelId = optionalString(body, "channelId") ?? (await ensureDefaultChannel(prisma)).id;

    const episode = await prisma.episode.create({
      data: {
        channelId,
        topic,
        targetDurationSec,
        ...(characterPackId ? { characterPackId } : {}),
        ...(typeof characterPackVersion === "number" ? { characterPackVersion } : {}),
        datasetVersionSnapshot: toPrismaJson({
          style: styleConfig
        })
      }
    });

    const job = await prisma.job.create({
      data: {
        episodeId: episode.id,
        type: jobType,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs: DEFAULT_RETRY_BACKOFF_MS
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: "info",
        message: "Transition -> QUEUED",
        details: toPrismaJson({
          source: "api:episodes:create",
          queueName,
          maxAttempts,
          stylePresetId: styleConfig.stylePresetId,
          hookBoost: styleConfig.hookBoost
        })
      }
    });

    const payload: EpisodeJobPayloadWithRender = {
      jobDbId: job.id,
      episodeId: episode.id,
      schemaChecks: [],
      pipeline: {
        story: {
          stylePresetId: styleConfig.stylePresetId,
          hookBoost: styleConfig.hookBoost
        }
      }
    };

    const enqueueResult = await enqueueWithResilience({
      queue,
      name: jobType,
      payload,
      maxAttempts,
      backoffMs: DEFAULT_RETRY_BACKOFF_MS,
      maxEnqueueRetries: 2,
      retryDelayMs: 200,
      redisUnavailableAsHttp503: true
    });
    const bullmqJobId = String(enqueueResult.job.id);

    const updatedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        bullmqJobId,
        lastError: null,
        finishedAt: null
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:episodes:create",
          queueName,
          bullmqJobId,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });

    return reply.code(201).send({
      data: {
        episode,
        job: updatedJob,
        queue: {
          queueName,
          bullmqJobId
        }
      }
    });
  });

  app.post("/api/episodes/:id/enqueue", async (request, reply) => {
    const episodeId = requireRouteParam(request.params, "id");
    const body = request.body === undefined ? {} : requireBodyObject(request.body);

    const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
    if (!episode) {
      throw createHttpError(404, "Episode not found");
    }

    const jobType = body.jobType === undefined ? "COMPILE_SHOTS" : requireEpisodeJobType(body.jobType);
    const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
    const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);
    const failedShotIds = parseStringArray(body.failedShotIds, "failedShotIds");
    const dryRun = parseBoolean(body.dryRun, false);
    const baseStyleConfig = readEpisodeStyleFromSnapshot(episode.datasetVersionSnapshot);
    const styleConfig = resolveEpisodeStyleConfig(body, baseStyleConfig);
    const hasStyleOverrides = body.stylePresetId !== undefined || body.hookBoost !== undefined;

    if (hasStyleOverrides) {
      const currentSnapshot = isRecord(episode.datasetVersionSnapshot) ? episode.datasetVersionSnapshot : {};
      await prisma.episode.update({
        where: { id: episodeId },
        data: {
          datasetVersionSnapshot: toPrismaJson({
            ...currentSnapshot,
            style: styleConfig
          })
        }
      });
    }

    const job = await prisma.job.create({
      data: {
        episodeId,
        type: jobType,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: "info",
        message: "Transition -> QUEUED",
        details: toPrismaJson({
          source: "api:episodes:enqueue",
          queueName,
          maxAttempts,
          retryBackoffMs,
          jobType,
          stylePresetId: styleConfig.stylePresetId,
          hookBoost: styleConfig.hookBoost
        })
      }
    });

    const payload: EpisodeJobPayloadWithRender = {
      jobDbId: job.id,
      episodeId,
      schemaChecks: [],
      pipeline: {
        story: {
          stylePresetId: styleConfig.stylePresetId,
          hookBoost: styleConfig.hookBoost
        }
      }
    };

    if (jobType === "RENDER_PREVIEW" || jobType === "RENDER_FINAL") {
      payload.render = {
        rerenderFailedShotsOnly: failedShotIds.length > 0,
        ...(failedShotIds.length > 0 ? { failedShotIds } : {}),
        dryRun
      };
    }

    const enqueueResult = await enqueueWithResilience({
      queue,
      name: jobType,
      payload,
      maxAttempts,
      backoffMs: retryBackoffMs,
      maxEnqueueRetries: 2,
      retryDelayMs: 200,
      redisUnavailableAsHttp503: true
    });
    const bullmqJobId = String(enqueueResult.job.id);

    const updatedJob = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        bullmqJobId,
        lastError: null,
        finishedAt: null
      }
    });

    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:episodes:enqueue",
          queueName,
          bullmqJobId,
          jobType,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });

    return reply.code(201).send({
      data: {
        episodeId,
        job: updatedJob,
        queue: {
          queueName,
          bullmqJobId
        }
      }
    });
  });

  app.get("/api/assets", async (request) => {
    const limitValue = optionalQueryString(request.query, "limit");
    const limit = Math.min(parsePositiveInt(limitValue, "limit", DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT);

    const rows = await prisma.asset.findMany({
      orderBy: { createdAt: "desc" },
      take: limit
    });

    return {
      data: rows.map((row) => ({
        id: row.id,
        channelId: row.channelId,
        type: row.type,
        assetType: row.assetType,
        status: row.status,
        mime: row.mime,
        sizeBytes: row.sizeBytes ? row.sizeBytes.toString() : null,
        sha256: row.sha256,
        originalKey: row.originalKey,
        normalizedKey1024: row.normalizedKey1024,
        normalizedKey2048: row.normalizedKey2048,
        qcJson: row.qcJson,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    };
  });

  app.post("/api/assets/upload", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      throw createHttpError(400, "multipart file field 'file' is required");
    }

    const fields = file.fields as Record<string, { value?: unknown }>;
    const assetType = requireAssetType(fields.assetType?.value);

    const mime = (file.mimetype ?? "application/octet-stream").toLowerCase();
    if (!mime.startsWith("image/")) {
      throw createHttpError(400, `Unsupported mime type: ${mime}`);
    }

    const fileBuffer = await file.toBuffer();
    if (fileBuffer.byteLength === 0) {
      throw createHttpError(400, "Uploaded file is empty");
    }

    if (fileBuffer.byteLength > MAX_UPLOAD_BYTES) {
      throw createHttpError(400, `Uploaded file is too large. max=${MAX_UPLOAD_BYTES} bytes`);
    }

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(fileBuffer, { failOn: "warning" }).metadata();
    } catch (error) {
      throw createHttpError(400, `Unreadable image file: ${errorMessage(error)}`);
    }

    const qcSummary = await analyzeUploadQc({
      fileBuffer,
      metadata,
      assetType
    });

    if (!qcSummary.ok) {
      const firstHardFail = qcSummary.hardFails[0];
      throw createHttpError(400, firstHardFail?.message ?? "이미지 QC 실패", {
        qcSummary
      });
    }

    const requestedChannelId =
      typeof fields.channelId?.value === "string" && fields.channelId.value.trim().length > 0
        ? fields.channelId.value.trim()
        : undefined;
    const channelId = requestedChannelId ?? (await ensureDefaultChannel(prisma)).id;

    const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    const prismaAssetType = toPrismaAssetType(assetType);

    const existing = await prisma.asset.findFirst({
      where: {
        channelId,
        assetType: prismaAssetType,
        sha256
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        qcJson: true,
        originalKey: true,
        storageKey: true,
        mime: true
      }
    });

    if (existing) {
      if (existing.status !== "FAILED") {
        return reply.code(200).send({
          data: {
            assetId: existing.id,
            status: existing.status,
            reused: true,
            qcSummary: existing.qcJson,
            bullmqJobId: null
          }
        });
      }

      let retryBullmqJobId: string | null = null;
      try {
        const queued = await queue.add(
          ASSET_INGEST_JOB_NAME,
          {
            assetId: existing.id,
            assetType,
            originalKey: existing.originalKey ?? existing.storageKey ?? "",
            mime: existing.mime ?? "application/octet-stream"
          },
          {
            jobId: `asset-ingest:${existing.id}`,
            attempts: DEFAULT_MAX_ATTEMPTS,
            backoff: {
              type: "exponential",
              delay: DEFAULT_RETRY_BACKOFF_MS
            },
            removeOnComplete: false,
            removeOnFail: false
          }
        );
        retryBullmqJobId = String(queued.id);
      } catch (error) {
        if (isRedisUnavailableError(error)) {
          throw createHttpError(503, "Redis unavailable");
        }
        throw error;
      }

      await prisma.asset.update({
        where: { id: existing.id },
        data: {
          status: "QUEUED"
        }
      });

      return reply.code(200).send({
        data: {
          assetId: existing.id,
          status: "QUEUED",
          reused: true,
          qcSummary: existing.qcJson,
          bullmqJobId: retryBullmqJobId
        }
      });
    }

    const ext = fileExtensionFromMime(mime);
    const originalKey = makeStorageKey(
      `assets/uploads/${channelId}`,
      `${Date.now()}_${sha256.slice(0, 12)}.${ext}`
    );

    const stored = await putAssetObject(originalKey, fileBuffer, mime);

    const created = await prisma.asset.create({
      data: {
        channelId,
        type: "IMAGE",
        assetType: prismaAssetType,
        status: "QUEUED",
        mime,
        sizeBytes: BigInt(fileBuffer.byteLength),
        storageKey: originalKey,
        originalKey,
        contentType: mime,
        bytes: BigInt(fileBuffer.byteLength),
        sha256,
        qcJson: toPrismaJson({
          stage: "uploaded",
          ...qcSummary,
          minioWarning: stored.minioError ?? null
        })
      }
    });

    let bullmqJobId: string | null = null;
    try {
      const queued = await queue.add(
        ASSET_INGEST_JOB_NAME,
        {
          assetId: created.id,
          assetType,
          originalKey,
          mime
        },
        {
          jobId: `asset-ingest:${created.id}`,
          attempts: DEFAULT_MAX_ATTEMPTS,
          backoff: {
            type: "exponential",
            delay: DEFAULT_RETRY_BACKOFF_MS
          },
          removeOnComplete: false,
          removeOnFail: false
        }
      );
      bullmqJobId = String(queued.id);
    } catch (error) {
      if (isRedisUnavailableError(error)) {
        await prisma.asset.update({
          where: { id: created.id },
          data: {
            status: "FAILED",
            qcJson: toPrismaJson({
              ok: false,
              stage: "enqueue",
              error: "Redis unavailable"
            })
          }
        });
        throw createHttpError(503, "Redis unavailable");
      }
      throw error;
    }

    await prisma.asset.update({
      where: { id: created.id },
      data: {
        status: "QUEUED",
        qcJson: toPrismaJson({
          stage: "queued",
          ...qcSummary,
          minioWarning: stored.minioError ?? null,
          bullmqJobId
        })
      }
    });

    return reply.code(201).send({
      data: {
        assetId: created.id,
        status: "QUEUED",
        qcSummary: {
          ...qcSummary,
          minioWarning: stored.minioError ?? null
        },
        bullmqJobId
      }
    });
  });

  app.get("/api/assets/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");
    const asset = await prisma.asset.findUnique({
      where: { id }
    });

    if (!asset) {
      throw createHttpError(404, "Asset not found");
    }

    return {
      data: {
        id: asset.id,
        channelId: asset.channelId,
        type: asset.type,
        assetType: asset.assetType,
        status: asset.status,
        mime: asset.mime,
        sizeBytes: asset.sizeBytes ? asset.sizeBytes.toString() : null,
        sha256: asset.sha256,
        originalKey: asset.originalKey,
        normalizedKey1024: asset.normalizedKey1024,
        normalizedKey2048: asset.normalizedKey2048,
        qcJson: asset.qcJson,
        createdAt: asset.createdAt,
        updatedAt: asset.updatedAt
      }
    };
  });

  app.get("/ui/assets", async (request, reply) => {
    try {
      const selectedAssetId = optionalQueryString(request.query, "assetId");
      const assets = await prisma.asset.findMany({
        orderBy: { createdAt: "desc" },
        take: 50
      });

      const selected = selectedAssetId
        ? await prisma.asset.findUnique({
            where: { id: selectedAssetId }
          })
        : assets[0] ?? null;

      const rows = assets
        .map((asset) => {
          const qcBadge = getQcBadgeSummary(asset.status, asset.qcJson);
          return `<tr><td><a href="/ui/assets?assetId=${encodeURIComponent(asset.id)}">${escHtml(asset.id)}</a></td><td>${escHtml(
            asset.assetType ?? "-"
          )}</td><td><span class="badge ${uiBadgeClass(asset.status)}">${escHtml(
            asset.status
          )}</span></td><td><span class="badge ${qcBadge.className}" title="${escHtml(qcBadge.reason)}">${escHtml(
            qcBadge.level
          )}</span></td><td>${escHtml(asset.mime ?? "-")}</td><td>${escHtml(
            asset.sizeBytes ? asset.sizeBytes.toString() : "-"
          )}</td><td>${escHtml(fmtUiDate(asset.createdAt))}</td></tr>`;
        })
        .join("");

      const originalUrl = selected ? storageKeyToArtifactUrl(selected.originalKey ?? selected.storageKey) : null;
      const normalized1024Url = selected ? storageKeyToArtifactUrl(selected.normalizedKey1024) : null;
      const normalized2048Url = selected ? storageKeyToArtifactUrl(selected.normalizedKey2048) : null;
      const canPreviewImage = selected ? (selected.mime ?? "").startsWith("image/") : false;
      const previewLabel = (label: string): string => {
        if (label === "original") return "원본";
        if (label === "normalized1024") return "정규화 1024";
        if (label === "normalized2048") return "정규화 2048";
        return label;
      };

      const previewCards = selected && canPreviewImage
        ? [
            { label: "original", key: selected.originalKey ?? selected.storageKey, url: originalUrl },
            { label: "normalized1024", key: selected.normalizedKey1024, url: normalized1024Url },
            { label: "normalized2048", key: selected.normalizedKey2048, url: normalized2048Url }
          ]
            .filter((entry) => typeof entry.key === "string" && entry.key.trim().length > 0 && entry.url)
            .map(
              (entry) =>
                `<div class="preview-card"><h4>${escHtml(previewLabel(entry.label))}</h4><p><code>${escHtml(entry.key ?? "-")}</code></p>${
                  storageKeyExistsLocally(entry.key)
                    ? `<img src="${entry.url}" alt="${escHtml(previewLabel(entry.label))} 미리보기"/>`
                    : `<p>로컬 미리보기를 찾을 수 없습니다.</p>`
                }<p><a href="${entry.url}">열기: ${escHtml(previewLabel(entry.label))}</a></p></div>`
            )
            .join("")
        : "";

      const selectedDetails = selected
        ? `<div class="card"><h3>선택된 에셋</h3><p>ID: <strong>${escHtml(
            selected.id
          )}</strong></p><p>상태: <span class="badge ${uiBadgeClass(selected.status)}">${escHtml(
            selected.status
          )}</span></p><p>QC: <span class="badge ${getQcBadgeSummary(selected.status, selected.qcJson).className}" title="${escHtml(
            getQcBadgeSummary(selected.status, selected.qcJson).reason
          )}">${escHtml(getQcBadgeSummary(selected.status, selected.qcJson).level)}</span></p><p>MIME: <code>${escHtml(selected.mime ?? "-")}</code></p><p>원본 키: <code>${escHtml(
            selected.originalKey ?? selected.storageKey
          )}</code></p><p>정규화 1024: <code>${escHtml(
            selected.normalizedKey1024 ?? "-"
          )}</code></p><p>정규화 2048: <code>${escHtml(
            selected.normalizedKey2048 ?? "-"
          )}</code></p><p><a href="/api/assets/${encodeURIComponent(selected.id)}">JSON 열기</a></p>${
            previewCards.length > 0 ? `<div class="preview-grid">${previewCards}</div>` : "<p>미리보기 가능한 이미지가 없습니다.</p>"
          }<pre>${escHtml(
            JSON.stringify(selected.qcJson ?? null, null, 2)
          )}</pre></div>`
        : `<div class="card"><h3>선택된 에셋</h3><p>\uC5D0\uC14B\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p></div>`;

      const body = `<style>.asset-shell{display:grid;gap:12px;grid-template-columns:minmax(360px,1fr) minmax(460px,1.35fr)}.asset-table-wrap{max-height:420px;overflow:auto;border:1px solid #dce5f3;border-radius:10px}.asset-table-wrap table{margin:0}.asset-head{display:flex;justify-content:space-between;gap:8px;align-items:center}@media (max-width:1100px){.asset-shell{grid-template-columns:1fr}}</style><section class="card"><h1>\uC5D0\uC14B (\uC0C1\uC138 \uBAA8\uB4DC)</h1><div class="notice">\uBE60\uB978 \uC791\uC5C5\uC740 <a href="/ui/studio">\uD1B5\uD569 \uC2A4\uD29C\uB514\uC624</a>\uC5D0\uC11C \uD55C \uD654\uBA74\uC73C\uB85C \uC9C4\uD589\uD558\uACE0, \uC774 \uD398\uC774\uC9C0\uB294 \uC5D0\uC14B \uAC80\uC218/\uC138\uBD80 \uC810\uAC80\uC5D0 \uC0AC\uC6A9\uD558\uC138\uC694.</div></section><section class="asset-shell"><section class="card"><h2>\uC5C5\uB85C\uB4DC</h2><form id="asset-upload-form" enctype="multipart/form-data" class="grid"><div class="grid two"><label>\uC5D0\uC14B \uC720\uD615<select name="assetType"><option value="character_reference">character_reference (레퍼런스)</option><option value="character_view">character_view (뷰 변형)</option><option value="background">background (배경)</option><option value="chart_source">chart_source (차트 소스)</option></select></label><label>\uD30C\uC77C<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label></div><button id="asset-upload-submit" type="submit">\uC5C5\uB85C\uB4DC + \uC5D0\uC14B \uCC98\uB9AC \uC2DC\uC791</button></form><pre id="asset-upload-result">\uB300\uAE30 \uC911</pre></section><section class="card"><div class="asset-head"><h2 style="margin:0">\uCD5C\uADFC \uC5D0\uC14B</h2><input id="asset-filter" placeholder="\uAC80\uC0C9 (ID/\uC720\uD615/\uC0C1\uD0DC)" /></div><div class="asset-table-wrap"><table id="asset-table"><thead><tr><th>ID</th><th>\uC720\uD615</th><th>\uC0C1\uD0DC</th><th>QC</th><th>MIME</th><th>\uC6A9\uB7C9</th><th>\uC0DD\uC131 \uC2DC\uAC01</th></tr></thead><tbody>${rows || '<tr><td colspan="7">\uC5D0\uC14B\uC774 \uC5C6\uC2B5\uB2C8\uB2E4</td></tr>'}</tbody></table></div></section></section>${selectedDetails}<script>const form=document.getElementById(\"asset-upload-form\");const output=document.getElementById(\"asset-upload-result\");const submit=document.getElementById(\"asset-upload-submit\");const filter=document.getElementById(\"asset-filter\");const assetTable=document.getElementById(\"asset-table\");const applyFilter=()=>{if(!(filter instanceof HTMLInputElement)||!(assetTable instanceof HTMLTableElement))return;const q=filter.value.trim().toLowerCase();assetTable.querySelectorAll(\"tbody tr\").forEach((row)=>{if(!(row instanceof HTMLElement))return;const text=String(row.textContent||\"\").toLowerCase();row.style.display=!q||text.includes(q)?\"\":\"none\";});};if(filter){filter.addEventListener(\"input\",applyFilter);}if(form&&output&&submit){form.addEventListener(\"submit\",async(event)=>{event.preventDefault();submit.disabled=true;output.textContent=\"\uC5C5\uB85C\uB4DC \uC911...\";const fd=new FormData(form);try{const res=await fetch(\"/api/assets/upload\",{method:\"POST\",body:fd});const json=await res.json();output.textContent=JSON.stringify(json,null,2);if(res.ok&&json&&json.data&&json.data.assetId){window.location.href=\"/ui/assets?assetId=\"+encodeURIComponent(json.data.assetId);} }catch(error){output.textContent=String(error);}finally{submit.disabled=false;}});}</script>`;

      return reply.type("text/html; charset=utf-8").send(uiPage("\uC5D0\uC14B", body));
    } catch (error) {
      if (isDbUnavailableError(error)) {
        const body = `<section class="card"><h1>에셋 (상세 모드)</h1><div class="error">DB 연결이 없어 에셋 목록을 불러오지 못했습니다.</div><p>조치: <code>pnpm docker:up</code> 또는 DB 실행 상태를 확인한 뒤 새로고침하세요.</p><pre>${escHtml(
          JSON.stringify(
            {
              error: "database_unavailable",
              hint: "Start PostgreSQL and retry.",
              route: "/ui/assets"
            },
            null,
            2
          )
        )}</pre></section>`;
        return reply.code(503).type("text/html; charset=utf-8").send(uiPage("에셋", body));
      }
      throw error;
    }
  });

  app.post("/api/hitl/rerender", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const episodeId = optionalString(body, "episodeId");

    if (!episodeId) {
      throw createHttpError(400, "episodeId is required");
    }

    const shotIds = parseStringArray(body.shotIds ?? body.failedShotIds, "shotIds");
    if (shotIds.length === 0) {
      throw createHttpError(400, "shotIds must include at least one item");
    }

    const dryRun = parseBoolean(body.dryRun, false);

    const injected = await app.inject({
      method: "POST",
      url: "/hitl/rerender",
      payload: {
        episodeId,
        shotIds,
        dryRun
      },
      headers: internalHeaders()
    });

    const parsed = parseJsonBody(injected.body);

    if (injected.statusCode >= 400) {
      const message =
        isRecord(parsed) && typeof parsed.error === "string"
          ? parsed.error
          : `Failed to rerender selected shots: status=${injected.statusCode}`;

      throw createHttpError(injected.statusCode, message, parsed);
    }

    return reply.code(injected.statusCode).send(
      parsed ?? {
        data: {
          ok: true
        }
      }
    );
  });
}
