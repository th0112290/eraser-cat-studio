import { bootstrapEnv } from "./bootstrapEnv";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, type JobsOptions } from "bullmq";
import { SchemaValidator, sha256Hex, stableStringify } from "@ec/shared";
import {
  compileShots,
  generateBeats,
  toBeatsDocument,
  toShotsDocument,
  type Beat,
  type EpisodeInput,
  type StoryInput
} from "@ec/story";
import { orchestrateRenderEpisode } from "@ec/render-orchestrator";
import { createPublishManifest } from "@ec/publish";
import {
  LocalMockMusicLibrary,
  MockTTSProvider,
  runAudioPipeline,
  type BeatCue as AudioBeatCue,
  type ShotCue as AudioShotCue
} from "@ec/audio";
import {
  ASSET_INGEST_JOB_NAME,
  BUILD_CHARACTER_PACK_JOB_NAME,
  COMPILE_SHOTS_JOB_NAME,
  type CharacterAssetSelection,
  type CharacterPackJobPayload,
  EPISODE_JOB_NAME,
  GENERATE_CHARACTER_ASSETS_JOB_NAME,
  GENERATE_BEATS_JOB_NAME,
  getEpisodeOutputPaths,
  MAX_JOB_ATTEMPTS,
  PACKAGE_OUTPUTS_JOB_NAME,
  queue,
  QUEUE_NAME,
  REDIS_CONNECTION,
  REDIS_URL,
  RENDER_CHARACTER_PREVIEW_JOB_NAME,
  RENDER_EPISODE_JOB_NAME,
  RENDER_FINAL_JOB_NAME,
  RENDER_PREVIEW_JOB_NAME,
  REPO_ROOT
} from "./queue";
import type { EpisodeJobPayload, PipelineJobName, RenderJobPayload } from "./queue";
import type { Prisma } from "@prisma/client";
import type { AssetIngestJobPayload } from "./assetIngest";
import { handleAssetIngestJob } from "./assetIngest";
import { getAssetObject } from "./assetStorage";
import { handleGenerateCharacterAssetsJob } from "./characterGeneration";

bootstrapEnv();

const prismaModule = await import("@prisma/client");
const { PrismaClient, Prisma: PrismaRuntime } = prismaModule;
const prisma = new PrismaClient();

type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
type ActiveJobStatus = "QUEUED" | "RUNNING";
type EpisodeStatus = "GENERATING" | "PREVIEW_READY" | "COMPLETED" | "FAILED";
type RenderStage = typeof RENDER_PREVIEW_JOB_NAME | typeof RENDER_FINAL_JOB_NAME | typeof RENDER_EPISODE_JOB_NAME;
type CurrentJobState = { status: JobStatus; maxAttempts: number; retryBackoffMs: number };
type WorkerQueuePayload = EpisodeJobPayload | AssetIngestJobPayload;
type StoredQcReport = {
  final_passed?: boolean;
  final_stage?: string;
  generated_at?: string;
  fallback_steps_applied?: string[];
  runs?: Array<{ issues?: Array<{ code?: string; severity?: string; message?: string; shotId?: string; details?: Record<string, unknown> }> }>;
};

type ShotsDocumentLike = {
  shots?: Array<{
    shot_id?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

type BeatDocFileLike = {
  beats?: Array<{
    beat_id?: unknown;
    narration?: unknown;
    tags?: unknown;
  }>;
};

type ShotDocFileLike = {
  render?: {
    fps?: unknown;
  };
  shots?: Array<{
    shot_id?: unknown;
    beat_ids?: unknown;
    start_frame?: unknown;
    duration_frames?: unknown;
    camera?: {
      preset?: unknown;
    };
    transition?: unknown;
    chart?: {
      highlights?: unknown;
      callouts?: unknown;
    };
  }>;
};

type CharacterPackJson = {
  schema_version: "1.0";
  pack_id: string;
  meta: {
    name: string;
    created_at: string;
    source_image_ref?: string;
    notes?: string;
  };
  canvas: {
    base_width: number;
    base_height: number;
    coord_space: "pixels";
  };
  assets: {
    images: Record<string, string>;
  };
  slots: Array<{
    slot_id: string;
    default_image_id: string;
    z_index?: number;
  }>;
  skeleton: {
    bones: Array<{
      bone_id: string;
      parent_id: string;
      rest: {
        x: number;
        y: number;
        rotation_deg: number;
      };
      limits?: {
        min_rotation_deg?: number;
        max_rotation_deg?: number;
      };
    }>;
    attachments: Array<{
      slot_id: string;
      image_id: string;
      bone_id: string;
      pivot: {
        px: number;
        py: number;
      };
      offset?: {
        x?: number;
        y?: number;
      };
      scale?: {
        x?: number;
        y?: number;
      };
      rotation_deg?: number;
    }>;
  };
  visemes: Record<
    string,
    {
      slot_id: string;
      image_id: string;
    }
  >;
  expressions: Record<
    string,
    {
      slot_overrides?: Array<{
        slot_id: string;
        image_id: string;
      }>;
      bone_overrides?: Array<{
        bone_id: string;
        rotation_deg?: number;
        x?: number;
        y?: number;
      }>;
    }
  >;
  clips: Array<{
    clip_id: string;
    duration_frames: number;
    tracks: Record<string, unknown>;
  }>;
  ik_chains: Array<{
    chain_id: string;
    bones: [string, string];
    effector_bone_id: string;
    elbow_hint?: "up" | "down";
    max_stretch?: number;
  }>;
};

type CharacterOutputPaths = {
  outDir: string;
  packPath: string;
  previewPath: string;
  qcReportPath: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaValidator = new SchemaValidator(path.resolve(__dirname, "../../../packages/schemas"));

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function sanitizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x.length > 0);
}

function parseBoolean(v: string | undefined, fallback: boolean): boolean {
  if (!v) return fallback;
  const n = v.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(n)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(n)) return false;
  return fallback;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function isEpisodePayload(value: unknown): value is EpisodeJobPayload {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.jobDbId === "string" && value.jobDbId.trim().length > 0 && typeof value.episodeId === "string" && value.episodeId.trim().length > 0;
}

function isAssetIngestPayload(value: unknown): value is AssetIngestJobPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.assetId === "string" &&
    value.assetId.trim().length > 0 &&
    typeof value.assetType === "string" &&
    typeof value.originalKey === "string" &&
    typeof value.mime === "string"
  );
}

function requireCharacterPayload(
  payload: EpisodeJobPayload
): CharacterPackJobPayload & { assetIds: CharacterAssetSelection } {
  const character = payload.character;
  if (!character) {
    throw new Error("Missing payload.character");
  }

  if (typeof character.characterPackId !== "string" || character.characterPackId.trim().length === 0) {
    throw new Error("payload.character.characterPackId is required");
  }

  if (!character.assetIds || typeof character.assetIds.front !== "string" || typeof character.assetIds.threeQuarter !== "string" || typeof character.assetIds.profile !== "string") {
    throw new Error("payload.character.assetIds(front/threeQuarter/profile) are required");
  }

  return character as CharacterPackJobPayload & { assetIds: CharacterAssetSelection };
}

function getCharacterOutputPaths(characterPackId: string): CharacterOutputPaths {
  const outDir = path.join(REPO_ROOT, "out", "characters", characterPackId);
  return {
    outDir,
    packPath: path.join(outDir, "pack.json"),
    previewPath: path.join(outDir, "preview.mp4"),
    qcReportPath: path.join(outDir, "qc_report.json")
  };
}

function ensureCharacterOut(characterPackId: string): CharacterOutputPaths {
  const out = getCharacterOutputPaths(characterPackId);
  fs.mkdirSync(path.join(out.outDir, "assets"), { recursive: true });
  return out;
}

function resolveAssetStorageKey(asset: {
  normalizedKey1024: string | null;
  normalizedKey2048: string | null;
  originalKey: string | null;
  storageKey: string;
}): string {
  return asset.normalizedKey1024 ?? asset.normalizedKey2048 ?? asset.originalKey ?? asset.storageKey;
}

async function normalizeCharacterViewImage(buffer: Buffer, outputPath: string): Promise<string> {
  const processed = await sharp(buffer)
    .rotate()
    .ensureAlpha()
    .resize({
      height: 820,
      fit: "inside",
      withoutEnlargement: true
    })
    .png()
    .toBuffer();
  fs.writeFileSync(outputPath, processed);
  return pathToFileURL(outputPath).href;
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const message = [
        `Command failed: ${command} ${args.join(" ")}`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
        stderr.trim() ? `stderr:\n${stderr.trim()}` : ""
      ]
        .filter((part) => part.length > 0)
        .join("\n\n");

      reject(new Error(message));
    });
  });
}

function resolveAudioPronunciationDictionaryPath(outDir: string): string {
  const envPath = process.env.AUDIO_PRONUNCIATION_DICTIONARY_PATH;
  if (envPath) {
    const resolved = path.resolve(envPath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  const fixturePath = path.join(REPO_ROOT, "packages", "audio", "fixtures", "pronunciation.json");
  if (fs.existsSync(fixturePath)) {
    return fixturePath;
  }

  const fallbackPath = path.join(outDir, "pronunciation.empty.json");
  if (!fs.existsSync(fallbackPath)) {
    fs.writeFileSync(fallbackPath, "{}\n", "utf8");
  }
  return fallbackPath;
}

function buildAudioCues(beatsPath: string, shotsPath: string): {
  beats: AudioBeatCue[];
  shots: AudioShotCue[];
  scriptText: string;
} {
  const beatDoc = readJsonFile<BeatDocFileLike>(beatsPath);
  const shotDoc = readJsonFile<ShotDocFileLike>(shotsPath);

  const shotRows = Array.isArray(shotDoc.shots) ? shotDoc.shots : [];
  const fps = Math.max(1, parseNumber(shotDoc.render?.fps, 30));

  const beatStartSecById = new Map<string, number>();
  const shots: AudioShotCue[] = shotRows.map((shot, index) => {
    const shotIdRaw = typeof shot.shot_id === "string" ? shot.shot_id : `shot_${index + 1}`;
    const shotId = shotIdRaw.trim() || `shot_${index + 1}`;
    const startFrame = Math.max(0, parseNumber(shot.start_frame, index * 90));
    const durationFrames = Math.max(1, parseNumber(shot.duration_frames, 90));
    const startSec = startFrame / fps;
    const durationSec = durationFrames / fps;

    const beatIds = parseStringArray(shot.beat_ids);
    for (const beatId of beatIds) {
      if (!beatStartSecById.has(beatId)) {
        beatStartSecById.set(beatId, startSec);
      }
    }

    const tags: string[] = [];
    const preset = typeof shot.camera?.preset === "string" ? shot.camera.preset.toLowerCase() : "";
    if (preset) {
      tags.push(`camera:${preset}`);
      if (/(whip|fade|cut|flash|transition)/i.test(preset)) {
        tags.push("transition");
      }
    }

    if (typeof shot.transition === "string" && shot.transition.trim().length > 0) {
      tags.push(`transition:${shot.transition.trim().toLowerCase()}`);
      tags.push("transition");
    }

    const chartHighlights = Array.isArray(shot.chart?.highlights) ? shot.chart?.highlights : [];
    const chartCallouts = Array.isArray(shot.chart?.callouts) ? shot.chart?.callouts : [];
    if (shot.chart) {
      tags.push("chart");
      tags.push("countup");
    }
    if (chartHighlights && chartHighlights.length > 0) {
      tags.push("highlight");
    }
    if (chartCallouts && chartCallouts.length > 0) {
      tags.push("emphasis");
    }

    return {
      id: shotId,
      startSec,
      durationSec,
      tags: uniqueStrings(tags)
    };
  });

  const beatRows = Array.isArray(beatDoc.beats) ? beatDoc.beats : [];
  const beats: AudioBeatCue[] = beatRows.map((beat, index) => {
    const beatIdRaw = typeof beat.beat_id === "string" ? beat.beat_id : `beat_${index + 1}`;
    const beatId = beatIdRaw.trim() || `beat_${index + 1}`;
    const tags = parseStringArray(beat.tags);
    const fallbackSec = index * 2.2;
    const startSec = beatStartSecById.get(beatId) ?? fallbackSec;
    const text = typeof beat.narration === "string" ? beat.narration : undefined;
    return { id: beatId, startSec, tags, ...(text ? { text } : {}) };
  });

  const scriptText = beatRows
    .map((beat) => (typeof beat.narration === "string" ? beat.narration.trim() : ""))
    .filter((line) => line.length > 0)
    .join(" ");

  return {
    beats,
    shots,
    scriptText: scriptText.length > 0 ? scriptText : "Episode preview narration."
  };
}

function readFailedShotIdsFromQcReport(qcReportPath: string): string[] {
  if (!fs.existsSync(qcReportPath)) return [];
  try {
    const report = JSON.parse(fs.readFileSync(qcReportPath, "utf8")) as StoredQcReport;
    const runs = Array.isArray(report.runs) ? report.runs : [];
    const issues = Array.isArray(runs[runs.length - 1]?.issues) ? runs[runs.length - 1]!.issues! : [];
    const out: string[] = [];
    for (const issue of issues) {
      const severity = asString(issue.severity, "INFO").toUpperCase();
      if (severity !== "ERROR") continue;
      const shotId = asString(issue.shotId, "").trim();
      if (!shotId) continue;
      out.push(shotId);
    }
    return uniqueStrings(out);
  } catch {
    return [];
  }
}

function createPartialShotsPath(baseShotsPath: string, failedShotIds: string[], attempt: number): string | null {
  if (!fs.existsSync(baseShotsPath)) return null;
  const raw = fs.readFileSync(baseShotsPath, "utf8");
  const parsed = JSON.parse(raw) as ShotsDocumentLike;
  if (!Array.isArray(parsed.shots)) return null;

  const wanted = new Set(failedShotIds);
  const filtered = parsed.shots.filter((shot) => {
    const shotId = typeof shot.shot_id === "string" ? shot.shot_id : "";
    return wanted.has(shotId);
  });

  if (filtered.length === 0 || filtered.length === parsed.shots.length) return null;

  const outDir = path.join(path.dirname(baseShotsPath), "recovery");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `shots_retry_attempt_${attempt}.json`);

  const nextDoc: ShotsDocumentLike = {
    ...parsed,
    shots: filtered
  };
  fs.writeFileSync(outPath, `${JSON.stringify(nextDoc, null, 2)}\n`, "utf8");
  return outPath;
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map((item) => toPrismaJsonValue(item));
  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = toPrismaJsonValue(v);
    }
    return out;
  }
  return String(value);
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  const normalized = toPrismaJsonValue(value);
  return normalized === null ? PrismaRuntime.JsonNull : normalized;
}

async function logJob(jobId: string, level: string, message: string, details?: unknown) {
  await prisma.jobLog.create({
    data: { jobId, level, message, details: details === undefined ? undefined : toPrismaJson(details) }
  });
}

async function setJobStatus(
  jobId: string,
  status: JobStatus,
  patch?: Partial<{ progress: number; attemptsMade: number; lastError: string | null; startedAt: Date | null; finishedAt: Date | null }>
) {
  await prisma.job.update({
    where: { id: jobId },
    data: {
      status,
      progress: patch?.progress ?? undefined,
      attemptsMade: patch?.attemptsMade ?? undefined,
      startedAt: patch?.startedAt ?? undefined,
      finishedAt: patch?.finishedAt ?? undefined,
      lastError: patch?.lastError ?? undefined
    }
  });
}

async function setEpisodeStatus(episodeId: string, status: EpisodeStatus) {
  await prisma.episode.update({ where: { id: episodeId }, data: { status } });
}

function ensureOut(episodeId: string) {
  const out = getEpisodeOutputPaths(episodeId);
  fs.mkdirSync(out.outDir, { recursive: true });
  return out;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shouldAutoRenderFinal(payload: EpisodeJobPayload): boolean {
  if (typeof payload.pipeline?.autoRenderFinal === "boolean") return payload.pipeline.autoRenderFinal;
  if (typeof payload.pipeline?.stopAfterPreview === "boolean") return !payload.pipeline.stopAfterPreview;
  return parseBoolean(process.env.WORKER_AUTO_RENDER_FINAL, false);
}

function renderDefaults(stage: RenderStage, episodeId: string) {
  const out = getEpisodeOutputPaths(episodeId);
  if (stage === RENDER_PREVIEW_JOB_NAME) return { shotsPath: out.shotsPath, outputPath: out.previewOutputPath, srtPath: out.previewSrtPath, qcReportPath: out.qcReportPath, renderLogPath: out.previewRenderLogPath };
  if (stage === RENDER_FINAL_JOB_NAME) return { shotsPath: out.shotsPath, outputPath: out.finalOutputPath, srtPath: out.finalSrtPath, qcReportPath: out.qcReportPath, renderLogPath: out.finalRenderLogPath };
  const legacyOut = path.join(REPO_ROOT, "out");
  return { shotsPath: path.join(legacyOut, "shots.json"), outputPath: path.join(legacyOut, "render_episode.mp4"), srtPath: path.join(legacyOut, "render_episode.srt"), qcReportPath: path.join(legacyOut, "qc_report.json"), renderLogPath: path.join(legacyOut, "render_log.json") };
}

function normalizeRender(stage: RenderStage, payload: EpisodeJobPayload): RenderJobPayload {
  const d = renderDefaults(stage, payload.episodeId);
  const r = payload.render ?? {};
  if (stage === RENDER_PREVIEW_JOB_NAME) return { ...r, shotsPath: r.shotsPath ?? d.shotsPath, outputPath: r.outputPath ?? d.outputPath, srtPath: r.srtPath ?? d.srtPath, qcReportPath: r.qcReportPath ?? d.qcReportPath, renderLogPath: r.renderLogPath ?? d.renderLogPath, preset: { videoBitrate: "6M", x264Preset: "veryfast", ...(r.preset ?? {}) } };
  if (stage === RENDER_FINAL_JOB_NAME) return { ...r, shotsPath: r.shotsPath ?? d.shotsPath, outputPath: r.outputPath ?? d.outputPath, srtPath: r.srtPath ?? d.srtPath, qcReportPath: r.qcReportPath ?? d.qcReportPath, renderLogPath: r.renderLogPath ?? d.renderLogPath, preset: { ...(r.preset ?? {}), videoBitrate: "12M", x264Preset: "slow", ...(payload.pipeline?.finalPreset ?? {}) } };
  return { ...r, shotsPath: r.shotsPath ?? d.shotsPath, outputPath: r.outputPath ?? d.outputPath, srtPath: r.srtPath ?? d.srtPath, qcReportPath: r.qcReportPath ?? d.qcReportPath, renderLogPath: r.renderLogPath ?? d.renderLogPath };
}

async function persistQc(episodeId: string, jobDbId: string, qcReportPath: string) {
  if (!fs.existsSync(qcReportPath)) return;
  const report = JSON.parse(fs.readFileSync(qcReportPath, "utf8")) as StoredQcReport;
  const runs = Array.isArray(report.runs) ? report.runs : [];
  const issues = Array.isArray(runs[runs.length - 1]?.issues) ? runs[runs.length - 1]!.issues! : [];
  const finalPassed = Boolean(report.final_passed);

  await prisma.qCResult.create({
    data: {
      episodeId,
      check: "SCHEMA",
      severity: finalPassed ? "INFO" : "ERROR",
      passed: finalPassed,
      details: toPrismaJson({
        qcReportPath,
        finalStage: report.final_stage ?? null,
        generatedAt: report.generated_at ?? null,
        fallbackStepsApplied: report.fallback_steps_applied ?? [],
        finalRunIssues: issues
      })
    }
  });

  for (const issue of issues) {
    const sev = asString(issue.severity, "INFO").toUpperCase();
    if (sev === "INFO") continue;
    await prisma.qCResult.create({
      data: {
        episodeId,
        check: "SCHEMA",
        severity: sev === "ERROR" ? "ERROR" : "WARN",
        passed: false,
        details: toPrismaJson({
          code: issue.code ?? "unknown",
          message: issue.message ?? "unknown",
          shotId: issue.shotId ?? null,
          details: issue.details ?? null,
          qcReportPath
        })
      }
    });
  }

  await logJob(jobDbId, "info", "QC report stored in DB", { qcReportPath, finalPassed, issueCount: issues.length });
}

async function addToQueue(name: string, payload: EpisodeJobPayload, maxAttempts: number, retryBackoffMs: number) {
  const options: JobsOptions = { jobId: payload.jobDbId, attempts: maxAttempts, backoff: { type: "exponential", delay: retryBackoffMs }, removeOnComplete: false, removeOnFail: false };
  try {
    return await queue.add(name, payload, options);
  } catch {
    const existing = await queue.getJob(payload.jobDbId);
    if (existing) return existing;
    throw new Error(`failed to enqueue job ${payload.jobDbId}`);
  }
}

async function enqueueNext(input: { parentJobDbId: string; episodeId: string; type: PipelineJobName; templatePayload: EpisodeJobPayload; render?: RenderJobPayload; maxAttempts: number; retryBackoffMs: number }) {
  const active = await prisma.job.findFirst({
    where: { episodeId: input.episodeId, type: input.type, status: { in: ["QUEUED", "RUNNING"] satisfies ActiveJobStatus[] } },
    orderBy: { createdAt: "desc" }
  });
  if (active) {
    await logJob(input.parentJobDbId, "info", "Reusing active downstream job", { nextType: input.type, nextJobDbId: active.id });
    return active;
  }

  const nextJob = await prisma.job.create({
    data: { episodeId: input.episodeId, type: input.type, status: "QUEUED", progress: 0, maxAttempts: input.maxAttempts > 0 ? input.maxAttempts : MAX_JOB_ATTEMPTS, retryBackoffMs: input.retryBackoffMs > 0 ? input.retryBackoffMs : 1000 }
  });
  await logJob(nextJob.id, "info", "Transition -> QUEUED", { source: "worker:pipeline", parentJobDbId: input.parentJobDbId, type: input.type });

  const payload: EpisodeJobPayload = { jobDbId: nextJob.id, episodeId: input.episodeId, schemaChecks: [], ...(input.templatePayload.pipeline ? { pipeline: input.templatePayload.pipeline } : {}), ...(input.render ? { render: input.render } : {}) };
  const bull = await addToQueue(input.type, payload, nextJob.maxAttempts, nextJob.retryBackoffMs);
  await prisma.job.update({ where: { id: nextJob.id }, data: { bullmqJobId: String(bull.id), status: "QUEUED", lastError: null } });
  await logJob(nextJob.id, "info", "Transition -> ENQUEUED", { source: "worker:pipeline", bullmqJobId: String(bull.id), type: input.type });
  await logJob(input.parentJobDbId, "info", "Pipeline next job enqueued", { nextType: input.type, nextJobDbId: nextJob.id, bullmqJobId: String(bull.id) });
  return nextJob;
}

function parseBeatDoc(json: Prisma.JsonValue, fallbackEpisode: EpisodeInput): { episode: EpisodeInput; beats: Beat[] } {
  if (!isRecord(json)) throw new Error("BeatDoc json must be object");
  const e = isRecord(json.episode) ? json.episode : {};
  const episode: EpisodeInput = { episode_id: asString(e.episode_id, fallbackEpisode.episode_id), bible_ref: asString(e.bible_ref, fallbackEpisode.bible_ref), topic: asString(e.topic, fallbackEpisode.topic), target_duration_sec: typeof e.target_duration_sec === "number" && e.target_duration_sec > 0 ? Math.round(e.target_duration_sec) : fallbackEpisode.target_duration_sec };
  const rows = Array.isArray(json.beats) ? json.beats : [];
  const beats: Beat[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = asString(row.beat_id).trim();
    if (!id) continue;
    const tags = sanitizeStringArray(row.tags);
    const tag = tags.find((x) => x.startsWith("emphasis:"));
    const eraw = tag ? tag.slice("emphasis:".length) : "medium";
    const emphasis: "low" | "medium" | "high" = eraw === "high" ? "high" : eraw === "low" ? "low" : "medium";
    beats.push({ id, type: asString(row.kind, "narrative"), intent: asString(row.intent, "Narrative progression"), narration: asString(row.narration, ""), onScreen: sanitizeStringArray(row.on_screen_text), emphasis });
  }
  if (beats.length === 0) throw new Error("BeatDoc has no beats");
  return { episode, beats };
}

function buildStoryInput(episode: { id: string; topic: string; targetDurationSec: number; bibleId: string | null }, payload: EpisodeJobPayload): StoryInput {
  const outline = sanitizeStringArray(payload.pipeline?.story?.outline);
  const paragraphs = sanitizeStringArray(payload.pipeline?.story?.paragraphs);
  const targetBeatCount = typeof payload.pipeline?.story?.targetBeatCount === "number" && payload.pipeline.story.targetBeatCount > 0 ? Math.round(payload.pipeline.story.targetBeatCount) : undefined;
  return {
    episode: { episode_id: episode.id, bible_ref: asString(payload.pipeline?.story?.bibleRef, "").trim() || episode.bibleId || "channel_bible:default", topic: episode.topic, target_duration_sec: episode.targetDurationSec },
    ...(outline.length > 0 ? { outline } : {}),
    ...(paragraphs.length > 0 ? { paragraphs } : {}),
    ...(targetBeatCount !== undefined ? { target_beat_count: targetBeatCount } : {})
  };
}

async function handleGenerate(payload: EpisodeJobPayload, jobDbId: string, current: CurrentJobState) {
  await setEpisodeStatus(payload.episodeId, "GENERATING");
  const episode = await prisma.episode.findUnique({ where: { id: payload.episodeId }, select: { id: true, topic: true, targetDurationSec: true, bibleId: true } });
  if (!episode) throw new Error(`Episode not found: ${payload.episodeId}`);
  const input = buildStoryInput(episode, payload);
  const beats = generateBeats(input);
  const beatsDoc = toBeatsDocument(input, beats);
  const vr = schemaValidator.validate("beats.schema.json", beatsDoc);
  if (!vr.ok) throw new Error("Schema validation failed: beats.schema.json");
  const out = ensureOut(payload.episodeId);
  writeJson(out.beatsPath, beatsDoc);
  const hash = sha256Hex(stableStringify(beatsDoc));
  const beatsDocJson = toPrismaJsonValue(beatsDoc);
  if (beatsDocJson === null) throw new Error("beats doc serialization failed");
  await prisma.beatDoc.upsert({ where: { episodeId: payload.episodeId }, update: { schemaId: "beats.schema.json", json: beatsDocJson, hash }, create: { episodeId: payload.episodeId, schemaId: "beats.schema.json", json: beatsDocJson, hash } });
  await logJob(jobDbId, "info", "Beats generated", { beatsPath: out.beatsPath, beatsCount: beatsDoc.beats.length, hash });
  await enqueueNext({ parentJobDbId: jobDbId, episodeId: payload.episodeId, type: COMPILE_SHOTS_JOB_NAME, templatePayload: payload, maxAttempts: current.maxAttempts, retryBackoffMs: current.retryBackoffMs });
}

async function handleCompile(payload: EpisodeJobPayload, jobDbId: string, current: CurrentJobState) {
  const episode = await prisma.episode.findUnique({ where: { id: payload.episodeId }, select: { id: true, topic: true, targetDurationSec: true, bibleId: true } });
  if (!episode) throw new Error(`Episode not found: ${payload.episodeId}`);
  const beatDoc = await prisma.beatDoc.findUnique({ where: { episodeId: payload.episodeId }, select: { json: true } });
  if (!beatDoc) throw new Error(`BeatDoc not found: ${payload.episodeId}`);
  const fallbackEpisode: EpisodeInput = { episode_id: payload.episodeId, bible_ref: episode.bibleId ?? "channel_bible:default", topic: episode.topic, target_duration_sec: episode.targetDurationSec };
  const parsed = parseBeatDoc(beatDoc.json, fallbackEpisode);
  const shots = compileShots(parsed.beats);
  const shotsDoc = toShotsDocument({ ...parsed.episode, episode_id: payload.episodeId }, shots, 30);
  const vr = schemaValidator.validate("shots.schema.json", shotsDoc);
  if (!vr.ok) throw new Error("Schema validation failed: shots.schema.json");
  const out = ensureOut(payload.episodeId);
  writeJson(out.shotsPath, shotsDoc);
  const hash = sha256Hex(stableStringify(shotsDoc));
  const shotsDocJson = toPrismaJsonValue(shotsDoc);
  if (shotsDocJson === null) throw new Error("shots doc serialization failed");
  await prisma.shotDoc.upsert({ where: { episodeId: payload.episodeId }, update: { schemaId: "shots.schema.json", json: shotsDocJson, hash }, create: { episodeId: payload.episodeId, schemaId: "shots.schema.json", json: shotsDocJson, hash } });
  await logJob(jobDbId, "info", "Shots compiled", { shotsPath: out.shotsPath, shotsCount: shotsDoc.shots.length, hash });
  await enqueueNext({ parentJobDbId: jobDbId, episodeId: payload.episodeId, type: RENDER_PREVIEW_JOB_NAME, templatePayload: payload, render: { ...(payload.render ?? {}), shotsPath: out.shotsPath, outputPath: out.previewOutputPath, srtPath: out.previewSrtPath, qcReportPath: out.qcReportPath, renderLogPath: out.previewRenderLogPath }, maxAttempts: current.maxAttempts, retryBackoffMs: current.retryBackoffMs });
}

async function handleRender(stage: RenderStage, payload: EpisodeJobPayload, jobDbId: string, attempt: number, current: CurrentJobState) {
  const render = normalizeRender(stage, payload);
  const explicitFailedShotIds = uniqueStrings(sanitizeStringArray(render.failedShotIds));
  const shouldUseQcRecovery = render.rerenderFailedShotsOnly !== false && attempt > 1;

  const defaultPaths = renderDefaults(stage, payload.episodeId);
  const baseShotsPath = path.resolve(render.shotsPath ?? defaultPaths.shotsPath);
  const qcReportPath = path.resolve(render.qcReportPath ?? defaultPaths.qcReportPath);

  let failedShotIds: string[] = [];
  let recoverySource: "explicit" | "qc_report" | "none" = "none";

  if (explicitFailedShotIds.length > 0) {
    failedShotIds = explicitFailedShotIds;
    recoverySource = "explicit";
  } else if (shouldUseQcRecovery) {
    failedShotIds = readFailedShotIdsFromQcReport(qcReportPath);
    if (failedShotIds.length > 0) {
      recoverySource = "qc_report";
    }
  }

  let partialShotsPath: string | null = null;
  let shotsPathForAttempt = baseShotsPath;

  if (failedShotIds.length > 0) {
    partialShotsPath = createPartialShotsPath(baseShotsPath, failedShotIds, attempt);
    if (partialShotsPath) {
      shotsPathForAttempt = partialShotsPath;
    }
  }

  const recoveryMode = shotsPathForAttempt !== baseShotsPath;
  await logJob(jobDbId, "info", "Render pipeline started", {
    stage,
    attempt,
    recoveryMode,
    recoverySource,
    failedShotIds,
    baseShotsPath,
    partialShotsPath
  });

  const result = await orchestrateRenderEpisode({ shotsPath: shotsPathForAttempt, outputPath: render.outputPath, srtPath: render.srtPath, qcReportPath: render.qcReportPath, renderLogPath: render.renderLogPath, compositionId: render.compositionId, dryRun: render.dryRun ?? false, qc: render.qc, preset: render.preset, attempt, maxAttempts: current.maxAttempts });
  await persistQc(payload.episodeId, jobDbId, result.qcReportPath);
  await logJob(jobDbId, "info", "Render completed", {
    stage,
    outputPath: result.outputPath,
    srtPath: result.srtPath,
    qcReportPath: result.qcReportPath,
    renderLogPath: result.renderLogPath,
    recoveryMode,
    partialShotsPath,
    failedShotIds
  });

  if (stage === RENDER_PREVIEW_JOB_NAME) {
    await runPreviewAudioArtifacts(payload.episodeId, jobDbId, baseShotsPath);
    await setEpisodeStatus(payload.episodeId, "PREVIEW_READY");
    if (shouldAutoRenderFinal(payload)) {
      const out = ensureOut(payload.episodeId);
      await enqueueNext({ parentJobDbId: jobDbId, episodeId: payload.episodeId, type: RENDER_FINAL_JOB_NAME, templatePayload: payload, render: { ...(payload.render ?? {}), shotsPath: out.shotsPath, outputPath: out.finalOutputPath, srtPath: out.finalSrtPath, qcReportPath: out.qcReportPath, renderLogPath: out.finalRenderLogPath, preset: { ...(payload.render?.preset ?? {}), videoBitrate: "12M", x264Preset: "slow", ...(payload.pipeline?.finalPreset ?? {}) } }, maxAttempts: current.maxAttempts, retryBackoffMs: current.retryBackoffMs });
    } else {
      await logJob(jobDbId, "info", "Auto final render disabled", { autoRenderFinal: false });
    }
  }

  if (stage === RENDER_FINAL_JOB_NAME) {
    await setEpisodeStatus(payload.episodeId, "COMPLETED");
    await enqueueNext({ parentJobDbId: jobDbId, episodeId: payload.episodeId, type: PACKAGE_OUTPUTS_JOB_NAME, templatePayload: payload, maxAttempts: current.maxAttempts, retryBackoffMs: current.retryBackoffMs });
  }
}

async function runPreviewAudioArtifacts(episodeId: string, jobDbId: string, shotsPath: string) {
  const out = ensureOut(episodeId);
  if (!fs.existsSync(out.beatsPath)) {
    throw new Error(`Missing beats for audio pipeline: ${out.beatsPath}`);
  }
  if (!fs.existsSync(shotsPath)) {
    throw new Error(`Missing shots for audio pipeline: ${shotsPath}`);
  }

  const cues = buildAudioCues(out.beatsPath, shotsPath);
  const pronunciationDictionaryPath = resolveAudioPronunciationDictionaryPath(out.outDir);

  const result = await runAudioPipeline(
    {
      ttsProvider: new MockTTSProvider(out.outDir),
      musicLibrary: new LocalMockMusicLibrary(path.join(out.outDir, "assets"))
    },
    {
      scriptText: cues.scriptText,
      voice: process.env.AUDIO_VOICE ?? "mock-voice-preview",
      speed: parseNumber(Number(process.env.AUDIO_SPEED ?? "1"), 1),
      beats: cues.beats,
      shots: cues.shots,
      pronunciationDictionaryPath,
      outDir: out.outDir
    }
  );

  await logJob(jobDbId, "info", "Preview audio artifacts generated", {
    mixPath: result.mixPath,
    licenseLogPath: result.licenseLogPath,
    narrationPath: result.narrationPath,
    sfxEvents: result.placementPlan.sfxEvents.length
  });

  return result;
}

async function handlePackage(payload: EpisodeJobPayload, jobDbId: string) {
  const out = ensureOut(payload.episodeId);
  const episode = await prisma.episode.findUnique({ where: { id: payload.episodeId }, select: { topic: true, scheduledFor: true } });
  if (!episode) throw new Error(`Episode not found: ${payload.episodeId}`);
  const renderOutputPath = fs.existsSync(out.finalOutputPath) ? out.finalOutputPath : fs.existsSync(out.previewOutputPath) ? out.previewOutputPath : undefined;
  const publish = await createPublishManifest({ episodeId: payload.episodeId, topic: episode.topic, plannedPublishAt: episode.scheduledFor ?? new Date(Date.now() + 60 * 60 * 1000), outputRootDir: path.join(REPO_ROOT, "out"), ...(renderOutputPath ? { renderOutputPath } : {}) });
  await logJob(jobDbId, "info", "Publish manifest created", { manifestPath: publish.manifestPath, status: publish.manifest.status });
}

async function buildCharacterPackJson(payload: EpisodeJobPayload, jobDbId: string): Promise<CharacterPackJson> {
  const character = requireCharacterPayload(payload);
  const out = ensureCharacterOut(character.characterPackId);

  const requestedAssetIds = [character.assetIds.front, character.assetIds.threeQuarter, character.assetIds.profile];
  const assets = await prisma.asset.findMany({
    where: {
      id: {
        in: requestedAssetIds
      }
    },
    select: {
      id: true,
      channelId: true,
      status: true,
      normalizedKey1024: true,
      normalizedKey2048: true,
      originalKey: true,
      storageKey: true
    }
  });

  if (assets.length !== requestedAssetIds.length) {
    throw new Error("One or more character view assets are missing");
  }

  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  for (const assetId of requestedAssetIds) {
    const asset = assetById.get(assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }
    if (asset.status !== "READY") {
      throw new Error(`Asset is not READY: ${assetId}`);
    }
  }

  const frontAsset = assetById.get(character.assetIds.front)!;
  const threeQuarterAsset = assetById.get(character.assetIds.threeQuarter)!;
  const profileAsset = assetById.get(character.assetIds.profile)!;

  const frontBuffer = await getAssetObject(resolveAssetStorageKey(frontAsset));
  const threeQuarterBuffer = await getAssetObject(resolveAssetStorageKey(threeQuarterAsset));
  const profileBuffer = await getAssetObject(resolveAssetStorageKey(profileAsset));

  const frontImageHref = await normalizeCharacterViewImage(frontBuffer, path.join(out.outDir, "assets", "front.png"));
  const threeQuarterImageHref = await normalizeCharacterViewImage(threeQuarterBuffer, path.join(out.outDir, "assets", "three-quarter.png"));
  const profileImageHref = await normalizeCharacterViewImage(profileBuffer, path.join(out.outDir, "assets", "profile.png"));

  const pack: CharacterPackJson = {
    schema_version: "1.0",
    pack_id: `character_pack_${character.characterPackId}`,
    meta: {
      name: `Character Pack ${character.version}`,
      created_at: new Date().toISOString(),
      source_image_ref: `${character.assetIds.front},${character.assetIds.threeQuarter},${character.assetIds.profile}`,
      notes: "Generated from uploaded multi-view character assets"
    },
    canvas: {
      base_width: 1024,
      base_height: 1024,
      coord_space: "pixels"
    },
    assets: {
      images: {
        body_front: frontImageHref,
        body_3q: threeQuarterImageHref,
        body_profile: profileImageHref,
        upper_arm: "shape://upper_arm",
        lower_arm: "shape://lower_arm",
        paw: "shape://paw",
        upper_arm_profile: "shape://upper_arm_profile",
        lower_arm_profile: "shape://lower_arm_profile",
        paw_profile: "shape://paw_profile"
      }
    },
    slots: [
      { slot_id: "body", default_image_id: "body_front", z_index: 1 },
      { slot_id: "upper_arm", default_image_id: "upper_arm", z_index: 2 },
      { slot_id: "lower_arm", default_image_id: "lower_arm", z_index: 3 },
      { slot_id: "paw", default_image_id: "paw", z_index: 4 }
    ],
    skeleton: {
      bones: [
        { bone_id: "root", parent_id: "", rest: { x: 512, y: 730, rotation_deg: 0 } },
        { bone_id: "torso", parent_id: "root", rest: { x: 0, y: 0, rotation_deg: 0 } },
        {
          bone_id: "upper_arm",
          parent_id: "torso",
          rest: { x: 148, y: -108, rotation_deg: 12 },
          limits: { min_rotation_deg: -70, max_rotation_deg: 95 }
        },
        {
          bone_id: "lower_arm",
          parent_id: "upper_arm",
          rest: { x: 96, y: 0, rotation_deg: 10 },
          limits: { min_rotation_deg: -130, max_rotation_deg: 130 }
        }
      ],
      attachments: [
        {
          slot_id: "body",
          image_id: "body_front",
          bone_id: "torso",
          pivot: { px: 0.5, py: 0.83 },
          offset: { x: 0, y: -205 },
          scale: { x: 2.9, y: 3.4 },
          rotation_deg: 0
        },
        {
          slot_id: "upper_arm",
          image_id: "upper_arm",
          bone_id: "upper_arm",
          pivot: { px: 0.12, py: 0.5 },
          offset: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation_deg: 0
        },
        {
          slot_id: "lower_arm",
          image_id: "lower_arm",
          bone_id: "lower_arm",
          pivot: { px: 0.1, py: 0.5 },
          offset: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation_deg: 0
        },
        {
          slot_id: "paw",
          image_id: "paw",
          bone_id: "lower_arm",
          pivot: { px: 0.5, py: 0.5 },
          offset: { x: 82, y: 0 },
          scale: { x: 1, y: 1 },
          rotation_deg: 0
        }
      ]
    },
    visemes: {},
    expressions: {
      view_front: {
        slot_overrides: [{ slot_id: "body", image_id: "body_front" }],
        bone_overrides: [{ bone_id: "torso", x: 0, y: 0, rotation_deg: 0 }]
      },
      view_right_3q: {
        slot_overrides: [{ slot_id: "body", image_id: "body_3q" }],
        bone_overrides: [{ bone_id: "torso", x: 8, y: 0, rotation_deg: 0 }]
      },
      view_right_profile: {
        slot_overrides: [
          { slot_id: "body", image_id: "body_profile" },
          { slot_id: "upper_arm", image_id: "upper_arm_profile" },
          { slot_id: "lower_arm", image_id: "lower_arm_profile" },
          { slot_id: "paw", image_id: "paw_profile" }
        ],
        bone_overrides: [{ bone_id: "torso", x: 12, y: 0, rotation_deg: 0 }]
      },
      view_left_3q: {
        slot_overrides: [{ slot_id: "body", image_id: "body_3q" }],
        bone_overrides: [{ bone_id: "torso", x: -8, y: 0, rotation_deg: 0 }]
      },
      view_left_profile: {
        slot_overrides: [
          { slot_id: "body", image_id: "body_profile" },
          { slot_id: "upper_arm", image_id: "upper_arm_profile" },
          { slot_id: "lower_arm", image_id: "lower_arm_profile" },
          { slot_id: "paw", image_id: "paw_profile" }
        ],
        bone_overrides: [{ bone_id: "torso", x: -12, y: 0, rotation_deg: 0 }]
      }
    },
    clips: [],
    ik_chains: [
      {
        chain_id: "arm_point",
        bones: ["upper_arm", "lower_arm"],
        effector_bone_id: "lower_arm",
        elbow_hint: "down",
        max_stretch: 1.15
      }
    ]
  };

  const schemaCheck = schemaValidator.validate("character_pack.schema.json", pack);
  if (!schemaCheck.ok) {
    throw new Error("Schema validation failed: character_pack.schema.json");
  }

  writeJson(out.packPath, pack);

  const hash = sha256Hex(stableStringify(pack));
  const packJson = toPrismaJsonValue(pack);
  if (packJson === null) {
    throw new Error("character pack serialization failed");
  }

  await prisma.characterPack.update({
    where: {
      id: character.characterPackId
    },
    data: {
      json: packJson,
      hash,
      status: "APPROVED"
    }
  });

  await logJob(jobDbId, "info", "Character pack built", {
    characterPackId: character.characterPackId,
    version: character.version,
    packPath: out.packPath,
    hash,
    assets: character.assetIds
  });

  return pack;
}

async function handleBuildCharacterPack(payload: EpisodeJobPayload, jobDbId: string) {
  const character = requireCharacterPayload(payload);
  await setEpisodeStatus(payload.episodeId, "GENERATING");

  await buildCharacterPackJson(payload, jobDbId);

  const previewJobId = character.previewJobDbId;
  if (!previewJobId) {
    throw new Error("Missing previewJobDbId in payload.character");
  }

  const previewJob = await prisma.job.findUnique({
    where: {
      id: previewJobId
    },
    select: {
      id: true,
      episodeId: true,
      maxAttempts: true,
      retryBackoffMs: true,
      status: true
    }
  });

  if (!previewJob || previewJob.episodeId !== payload.episodeId) {
    throw new Error(`Preview job not found or episode mismatch: ${previewJobId}`);
  }

  if (previewJob.status === "SUCCEEDED") {
    await logJob(jobDbId, "info", "Character preview already succeeded", {
      previewJobDbId: previewJob.id
    });
    return;
  }

  const previewPayload: EpisodeJobPayload = {
    jobDbId: previewJob.id,
    episodeId: payload.episodeId,
    schemaChecks: [],
    character
  };

  await logJob(previewJob.id, "info", "Transition -> QUEUED", {
    source: "worker:character-pack",
    parentJobDbId: jobDbId
  });

  const queued = await addToQueue(
    RENDER_CHARACTER_PREVIEW_JOB_NAME,
    previewPayload,
    previewJob.maxAttempts,
    previewJob.retryBackoffMs
  );

  await prisma.job.update({
    where: {
      id: previewJob.id
    },
    data: {
      status: "QUEUED",
      bullmqJobId: String(queued.id),
      progress: 0,
      lastError: null,
      finishedAt: null
    }
  });

  await logJob(previewJob.id, "info", "Transition -> ENQUEUED", {
    source: "worker:character-pack",
    bullmqJobId: String(queued.id)
  });

  await logJob(jobDbId, "info", "Character preview job enqueued", {
    previewJobDbId: previewJob.id,
    bullmqJobId: String(queued.id)
  });
}

async function handleRenderCharacterPreview(payload: EpisodeJobPayload, jobDbId: string) {
  const character = requireCharacterPayload(payload);
  const out = ensureCharacterOut(character.characterPackId);

  const characterPack = await prisma.characterPack.findUnique({
    where: {
      id: character.characterPackId
    },
    select: {
      id: true,
      json: true
    }
  });

  if (!characterPack) {
    throw new Error(`CharacterPack not found: ${character.characterPackId}`);
  }

  const pack = characterPack.json as CharacterPackJson;
  const schemaCheck = schemaValidator.validate("character_pack.schema.json", pack);
  if (!schemaCheck.ok) {
    throw new Error("Schema validation failed for persisted character pack");
  }

  if (!fs.existsSync(out.packPath)) {
    writeJson(out.packPath, pack);
  }

  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const props = JSON.stringify({
    characterPackId: character.characterPackId,
    pack
  });

  await logJob(jobDbId, "info", "Character preview render started", {
    compositionId: "CHARACTER-PACK-PREVIEW",
    outputPath: out.previewPath
  });

  await runCommand(
    pnpmCommand,
    [
      "-C",
      "apps/video",
      "exec",
      "remotion",
      "render",
      "src/index.ts",
      "CHARACTER-PACK-PREVIEW",
      out.previewPath,
      "--overwrite",
      "--props",
      props
    ],
    REPO_ROOT
  );

  const previewExists = fs.existsSync(out.previewPath);
  const qcReport = {
    ok: previewExists,
    characterPackId: character.characterPackId,
    generatedAt: new Date().toISOString(),
    checks: [
      {
        code: "CHARACTER_PACK_SCHEMA",
        passed: true
      },
      {
        code: "PREVIEW_OUTPUT_EXISTS",
        passed: previewExists
      }
    ],
    output: {
      previewPath: out.previewPath
    }
  };

  writeJson(out.qcReportPath, qcReport);

  await prisma.qCResult.create({
    data: {
      episodeId: payload.episodeId,
      check: "SCHEMA",
      severity: previewExists ? "INFO" : "ERROR",
      passed: previewExists,
      details: toPrismaJson(qcReport)
    }
  });

  await setEpisodeStatus(payload.episodeId, "PREVIEW_READY");

  await logJob(jobDbId, "info", "Character preview render completed", {
    previewPath: out.previewPath,
    qcReportPath: out.qcReportPath
  });
}

const worker = new Worker<WorkerQueuePayload>(
  QUEUE_NAME,
  async (bullJob) => {
    const jobName = String(bullJob.name);
    const rawPayload = bullJob.data as unknown;

    if (jobName === ASSET_INGEST_JOB_NAME) {
      if (!isAssetIngestPayload(rawPayload)) {
        throw new Error("Invalid ASSET_INGEST payload");
      }

      return handleAssetIngestJob({
        prisma,
        payload: rawPayload,
        bullmqJobId: String(bullJob.id)
      });
    }

    if (!isEpisodePayload(rawPayload)) {
      throw new Error(`Invalid payload for job=${jobName}`);
    }

    const payload = rawPayload;
    const attempt = bullJob.attemptsMade + 1;
    const jobDbId = payload.jobDbId;

    const current = await prisma.job.findUnique({ where: { id: jobDbId }, select: { status: true, maxAttempts: true, retryBackoffMs: true } });
    if (!current) throw new Error(`Job row not found: ${jobDbId}`);
    if (current.status === "SUCCEEDED") {
      await logJob(jobDbId, "warn", "Duplicate delivery ignored", { bullmqJobId: String(bullJob.id), jobName });
      return { ok: true, skipped: true };
    }

    await setJobStatus(jobDbId, "RUNNING", { progress: 1, attemptsMade: attempt, lastError: null, startedAt: attempt === 1 ? new Date() : undefined, finishedAt: null });
    await logJob(jobDbId, "info", "Transition -> RUNNING", { bullmqJobId: String(bullJob.id), jobName, attempt });

    if (payload.schemaChecks?.length) {
      for (const check of payload.schemaChecks) {
        const vr = schemaValidator.validate(check.schemaId, check.data);
        if (!vr.ok) throw new Error(`Schema validation failed: ${check.schemaId}`);
      }
    }

    if (jobName === GENERATE_CHARACTER_ASSETS_JOB_NAME) {
      await handleGenerateCharacterAssetsJob({
        prisma,
        payload,
        jobDbId,
        maxAttempts: current.maxAttempts,
        retryBackoffMs: current.retryBackoffMs,
        helpers: {
          logJob,
          setJobStatus,
          setEpisodeStatus,
          addEpisodeJob: addToQueue
        }
      });
    } else if (jobName === GENERATE_BEATS_JOB_NAME) {
      await handleGenerate(payload, jobDbId, current);
    } else if (jobName === COMPILE_SHOTS_JOB_NAME) {
      await handleCompile(payload, jobDbId, current);
    } else if (jobName === BUILD_CHARACTER_PACK_JOB_NAME) {
      await handleBuildCharacterPack(payload, jobDbId);
    } else if (jobName === RENDER_CHARACTER_PREVIEW_JOB_NAME) {
      await handleRenderCharacterPreview(payload, jobDbId);
    } else if (jobName === RENDER_PREVIEW_JOB_NAME) {
      await handleRender(RENDER_PREVIEW_JOB_NAME, payload, jobDbId, attempt, current);
    } else if (jobName === RENDER_FINAL_JOB_NAME) {
      await handleRender(RENDER_FINAL_JOB_NAME, payload, jobDbId, attempt, current);
    } else if (jobName === RENDER_EPISODE_JOB_NAME) {
      await handleRender(RENDER_EPISODE_JOB_NAME, payload, jobDbId, attempt, current);
    } else if (jobName === PACKAGE_OUTPUTS_JOB_NAME) {
      await handlePackage(payload, jobDbId);
    } else {
      await logJob(jobDbId, "info", "No-op handler", { jobName });
    }

    await setJobStatus(jobDbId, "SUCCEEDED", { progress: 100, attemptsMade: attempt, lastError: null, finishedAt: new Date() });
    await logJob(jobDbId, "info", "Transition -> SUCCEEDED", { bullmqJobId: String(bullJob.id), jobName, attempt });
    return { ok: true };
  },
  { connection: REDIS_CONNECTION, concurrency: 2 }
);

worker.on("failed", async (bullJob, err) => {
  if (!bullJob) return;
  const jobName = String(bullJob.name);
  const rawPayload = bullJob.data as unknown;

  if (jobName === ASSET_INGEST_JOB_NAME && isAssetIngestPayload(rawPayload)) {
    const safeError = err instanceof Error ? err.message : String(err);
    try {
      await prisma.asset.update({
        where: { id: rawPayload.assetId },
        data: {
          status: "FAILED",
          qcJson: {
            ok: false,
            stage: "worker_failed",
            error: safeError,
            bullmqJobId: String(bullJob.id),
            failedAt: new Date().toISOString()
          }
        }
      });
    } catch {
      // Ignore secondary failure.
    }
    return;
  }

  if (!isEpisodePayload(rawPayload)) {
    return;
  }

  const payload = rawPayload;
  await setJobStatus(payload.jobDbId, "FAILED", { lastError: err.stack ?? err.message, finishedAt: new Date() });
  await logJob(payload.jobDbId, "error", "Transition -> FAILED", { bullmqJobId: String(bullJob.id), jobName, error: err.message, stack: err.stack });
  try {
    await setEpisodeStatus(payload.episodeId, "FAILED");
  } catch {
    // Ignore missing episode in failed hook.
  }
});

console.log(
  `[worker] running. redis=${REDIS_URL} queue=${QUEUE_NAME} jobs=${EPISODE_JOB_NAME},${GENERATE_CHARACTER_ASSETS_JOB_NAME},${BUILD_CHARACTER_PACK_JOB_NAME},${COMPILE_SHOTS_JOB_NAME},${RENDER_CHARACTER_PREVIEW_JOB_NAME},${RENDER_PREVIEW_JOB_NAME},${RENDER_FINAL_JOB_NAME},${PACKAGE_OUTPUTS_JOB_NAME},${RENDER_EPISODE_JOB_NAME},${ASSET_INGEST_JOB_NAME}`
);
