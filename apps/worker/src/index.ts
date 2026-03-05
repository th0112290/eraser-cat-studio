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
  FallbackTTSProvider,
  LocalMockMusicLibrary,
  MockTTSProvider,
  PiperTTSProvider,
  runAudioPipeline,
  type BeatCue as AudioBeatCue,
  type ShotCue as AudioShotCue,
  type TTSProvider
} from "@ec/audio";
import {
  ASSET_INGEST_JOB_NAME,
  ASSET_QUEUE_NAME,
  BUILD_CHARACTER_PACK_JOB_NAME,
  COMPILE_SHOTS_JOB_NAME,
  type AssetIngestQueuePayload,
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
import { getAssetObject } from "./assetStorage";
import { handleAssetIngestJob } from "./assetIngest";
import { handleGenerateCharacterAssetsJob } from "./characterGeneration";

bootstrapEnv();

const prismaModule = await import("@prisma/client");
const { PrismaClient, Prisma: PrismaRuntime } = prismaModule;
const prisma = new PrismaClient();
const ASSET_INGEST_TIMEOUT_MS = Number.parseInt(process.env.ASSET_INGEST_TIMEOUT_MS ?? "20000", 10);
const WORKER_LOCK_DURATION_MS = Number.parseInt(process.env.WORKER_LOCK_DURATION_MS ?? "900000", 10);
const WORKER_STALLED_INTERVAL_MS = Number.parseInt(process.env.WORKER_STALLED_INTERVAL_MS ?? "60000", 10);
const WORKER_MAX_STALLED_COUNT = Number.parseInt(process.env.WORKER_MAX_STALLED_COUNT ?? "5", 10);

type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
type ActiveJobStatus = "QUEUED" | "RUNNING";
type EpisodeStatus = "GENERATING" | "PREVIEW_READY" | "COMPLETED" | "FAILED";
type RenderStage = typeof RENDER_PREVIEW_JOB_NAME | typeof RENDER_FINAL_JOB_NAME | typeof RENDER_EPISODE_JOB_NAME;
type CurrentJobState = { status: JobStatus; maxAttempts: number; retryBackoffMs: number };
type WorkerQueuePayload = EpisodeJobPayload;
type StoredQcReport = {
  final_passed?: boolean;
  final_stage?: string;
  generated_at?: string;
  fallback_steps_applied?: string[];
  runs?: Array<{ issues?: Array<{ code?: string; severity?: string; message?: string; shotId?: string; details?: Record<string, unknown> }> }>;
};

type RenderFailureIssue = {
  code: string;
  severity: "INFO" | "WARN" | "ERROR";
  message: string;
  shotId: string | null;
};

type RetrySummaryReport = {
  schema_version: "1.0";
  generated_at: string;
  episode_id: string;
  stage: RenderStage;
  attempt: number;
  recovery_mode: boolean;
  recovery_source: "explicit" | "qc_report" | "none";
  requested_failed_shot_ids: string[];
  partial_shots_path: string | null;
  failed_shot_summary: {
    total_error_issues: number;
    unique_failed_shot_count: number;
    unique_failed_shot_ids: string[];
    by_code: Array<{ code: string; count: number }>;
  };
  issues: RenderFailureIssue[];
  qc_report_path: string;
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

type CharacterViewName = "front" | "threeQuarter" | "profile";
type CharacterViewScoreSummary = {
  candidateId: string | null;
  source: "selected_candidate" | "best_in_view" | "missing";
  alpha: number | null;
  bbox: number | null;
  sharpness: number | null;
  consistency: number | null;
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

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
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

function isAssetIngestPayload(value: unknown): value is AssetIngestQueuePayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.assetId === "string";
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return task;
  }
  return await Promise.race([
    task,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
    })
  ]);
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

function toNullableScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function summarizeCharacterGenerationScores(character: CharacterPackJobPayload): {
  manifestPath: string | null;
  views: Record<CharacterViewName, CharacterViewScoreSummary>;
  warnings: string[];
} {
  const emptyView = (): CharacterViewScoreSummary => ({
    candidateId: null,
    source: "missing",
    alpha: null,
    bbox: null,
    sharpness: null,
    consistency: null
  });

  const views: Record<CharacterViewName, CharacterViewScoreSummary> = {
    front: emptyView(),
    threeQuarter: emptyView(),
    profile: emptyView()
  };

  const manifestPathRaw = character.generation?.manifestPath;
  const manifestPath = typeof manifestPathRaw === "string" && manifestPathRaw.trim().length > 0 ? manifestPathRaw : null;
  const warnings: string[] = [];

  if (!manifestPath) {
    warnings.push("generation_manifest_path_missing");
    return { manifestPath, views, warnings };
  }

  if (!fs.existsSync(manifestPath)) {
    warnings.push("generation_manifest_not_found");
    return { manifestPath, views, warnings };
  }

  const parsed = readJsonFile<unknown>(manifestPath);
  if (!isRecord(parsed) || !Array.isArray(parsed.candidates)) {
    warnings.push("generation_manifest_invalid_shape");
    return { manifestPath, views, warnings };
  }

  const selected = character.generation?.selectedCandidateIds;
  const selectedMap: Record<CharacterViewName, string | null> = {
    front: typeof selected?.front === "string" && selected.front.trim().length > 0 ? selected.front : null,
    threeQuarter:
      typeof selected?.threeQuarter === "string" && selected.threeQuarter.trim().length > 0
        ? selected.threeQuarter
        : null,
    profile: typeof selected?.profile === "string" && selected.profile.trim().length > 0 ? selected.profile : null
  };

  for (const viewName of ["front", "threeQuarter", "profile"] as const) {
    const candidates = parsed.candidates
      .filter((entry): entry is Record<string, unknown> => isRecord(entry) && entry.view === viewName)
      .sort((left, right) => {
        const leftScore = typeof left.score === "number" ? left.score : -1;
        const rightScore = typeof right.score === "number" ? right.score : -1;
        return rightScore - leftScore;
      });

    const selectedId = selectedMap[viewName];
    const selectedCandidate =
      selectedId === null
        ? null
        : candidates.find((candidate) => typeof candidate.id === "string" && candidate.id === selectedId) ?? null;
    const bestCandidate = candidates[0] ?? null;
    const target = selectedCandidate ?? bestCandidate;

    if (!target) {
      views[viewName] = emptyView();
      continue;
    }

    const breakdown = isRecord(target.breakdown) ? target.breakdown : {};
    views[viewName] = {
      candidateId: typeof target.id === "string" ? target.id : null,
      source: selectedCandidate ? "selected_candidate" : "best_in_view",
      alpha: toNullableScore(breakdown.alphaScore),
      bbox: toNullableScore(breakdown.occupancyScore),
      sharpness: toNullableScore(breakdown.sharpnessScore),
      consistency: toNullableScore(
        typeof target.consistencyScore === "number" ? target.consistencyScore : breakdown.consistencyScore
      )
    };
  }

  return { manifestPath, views, warnings };
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

type PreviewTtsResolution = {
  provider: TTSProvider;
  providerName: "mock" | "piper";
  fallbackName?: "mock";
  warning?: string;
};

function parseJsonStringArray(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function resolvePreviewTtsProvider(outDir: string, onFallback: (reason: string) => void): PreviewTtsResolution {
  const requested = (process.env.AUDIO_TTS_PROVIDER ?? "auto").trim().toLowerCase();
  const modelPath = process.env.AUDIO_TTS_PIPER_MODEL?.trim();
  const piperBin = process.env.AUDIO_TTS_PIPER_BIN?.trim() || "piper";
  const piperSpeaker = process.env.AUDIO_TTS_PIPER_SPEAKER?.trim();
  const piperTimeoutMs = parsePositiveInt(process.env.AUDIO_TTS_PIPER_TIMEOUT_MS, 120_000);
  const piperExtraArgs = parseJsonStringArray(process.env.AUDIO_TTS_PIPER_EXTRA_ARGS);

  const mockProvider = new MockTTSProvider(outDir);

  if (requested === "mock") {
    return {
      provider: mockProvider,
      providerName: "mock"
    };
  }

  const shouldTryPiper = requested === "piper" || requested === "auto";
  if (!shouldTryPiper) {
    return {
      provider: mockProvider,
      providerName: "mock",
      warning: `Unknown AUDIO_TTS_PROVIDER=${requested}; using mock`
    };
  }

  if (!modelPath) {
    const warning = "AUDIO_TTS_PIPER_MODEL is not configured; using mock TTS";
    return {
      provider: mockProvider,
      providerName: "mock",
      warning
    };
  }

  const piperProvider = new PiperTTSProvider(outDir, {
    binPath: piperBin,
    modelPath,
    ...(piperSpeaker && piperSpeaker.length > 0 ? { speakerId: parseNonNegativeInt(piperSpeaker, 0) } : {}),
    timeoutMs: piperTimeoutMs,
    ...(piperExtraArgs.length > 0 ? { extraArgs: piperExtraArgs } : {})
  });

  return {
    provider: new FallbackTTSProvider(piperProvider, mockProvider, {
      onFallback: (error) => onFallback(error.message)
    }),
    providerName: "piper",
    fallbackName: "mock"
  };
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

function readErrorIssuesFromQcReport(qcReportPath: string): RenderFailureIssue[] {
  if (!fs.existsSync(qcReportPath)) return [];
  try {
    const report = JSON.parse(fs.readFileSync(qcReportPath, "utf8")) as StoredQcReport;
    const runs = Array.isArray(report.runs) ? report.runs : [];
    const issues = Array.isArray(runs[runs.length - 1]?.issues) ? runs[runs.length - 1]!.issues! : [];
    const out: RenderFailureIssue[] = [];

    for (const issue of issues) {
      const severityRaw = asString(issue.severity, "INFO").toUpperCase();
      const severity: RenderFailureIssue["severity"] =
        severityRaw === "ERROR" ? "ERROR" : severityRaw === "WARN" ? "WARN" : "INFO";
      if (severity !== "ERROR") continue;
      out.push({
        code: asString(issue.code, "unknown"),
        severity,
        message: asString(issue.message, "unknown"),
        shotId: asString(issue.shotId, "").trim() || null
      });
    }
    return out;
  } catch {
    return [];
  }
}

function buildRetrySummaryReport(input: {
  episodeId: string;
  stage: RenderStage;
  attempt: number;
  recoveryMode: boolean;
  recoverySource: "explicit" | "qc_report" | "none";
  requestedFailedShotIds: string[];
  partialShotsPath: string | null;
  qcReportPath: string;
}): RetrySummaryReport {
  const issues = readErrorIssuesFromQcReport(input.qcReportPath);
  const failedShotIds = uniqueStrings(
    issues.map((issue) => (issue.shotId ? issue.shotId.trim() : "")).filter((shotId) => shotId.length > 0)
  );
  const codeCount = new Map<string, number>();
  for (const issue of issues) {
    const code = issue.code.trim() || "unknown";
    codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
  }
  const byCode = Array.from(codeCount.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    episode_id: input.episodeId,
    stage: input.stage,
    attempt: input.attempt,
    recovery_mode: input.recoveryMode,
    recovery_source: input.recoverySource,
    requested_failed_shot_ids: input.requestedFailedShotIds,
    partial_shots_path: input.partialShotsPath,
    failed_shot_summary: {
      total_error_issues: issues.length,
      unique_failed_shot_count: failedShotIds.length,
      unique_failed_shot_ids: failedShotIds,
      by_code: byCode
    },
    issues,
    qc_report_path: input.qcReportPath
  };
}

function retrySummaryReportPath(episodeId: string, stage: RenderStage): string {
  const out = getEpisodeOutputPaths(episodeId);
  return path.join(out.outDir, `retry_summary_${stage.toLowerCase()}.json`);
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
  const hasFailedShotIds =
    Array.isArray(payload.render?.failedShotIds) &&
    payload.render.failedShotIds.some((shotId) => typeof shotId === "string" && shotId.trim().length > 0);
  const retryPriority = payload.render?.rerenderFailedShotsOnly === true || hasFailedShotIds ? 1 : undefined;
  const options: JobsOptions = {
    jobId: payload.jobDbId,
    attempts: maxAttempts,
    backoff: { type: "exponential", delay: retryBackoffMs },
    removeOnComplete: false,
    removeOnFail: false,
    ...(retryPriority !== undefined ? { priority: retryPriority } : {})
  };
  try {
    return await queue.add(name, payload, options);
  } catch {
    const existing = await queue.getJob(payload.jobDbId);
    if (existing) return existing;
    throw new Error(`failed to enqueue job ${payload.jobDbId}`);
  }
}

const downstreamEnqueueLocks = new Map<string, Promise<void>>();

async function withDownstreamEnqueueLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = downstreamEnqueueLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => next);
  downstreamEnqueueLocks.set(key, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (downstreamEnqueueLocks.get(key) === chain) {
      downstreamEnqueueLocks.delete(key);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRedisDownstreamLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const enabled = parseBoolean(process.env.WORKER_DISTRIBUTED_STAGE_LOCK_ENABLED, true);
  if (!enabled) {
    return fn();
  }

  const acquireTimeoutMs = parsePositiveInt(process.env.WORKER_DISTRIBUTED_STAGE_LOCK_ACQUIRE_TIMEOUT_MS, 5000);
  const retryDelayMs = parsePositiveInt(process.env.WORKER_DISTRIBUTED_STAGE_LOCK_RETRY_DELAY_MS, 100);
  const lockTtlMs = parsePositiveInt(process.env.WORKER_DISTRIBUTED_STAGE_LOCK_TTL_MS, 120000);
  const redisKey = `worker:stage-lock:${key}`;
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

  const client = await queue.client.catch(() => null);
  if (!client) {
    return fn();
  }

  const startedAt = Date.now();
  let acquired = false;
  while (Date.now() - startedAt < acquireTimeoutMs) {
    const ok = await (client as any).set(redisKey, token, "PX", lockTtlMs, "NX");
    if (ok === "OK") {
      acquired = true;
      break;
    }
    await sleep(retryDelayMs);
  }

  if (!acquired) {
    throw new Error(`downstream enqueue lock timeout: ${key}`);
  }

  try {
    return await fn();
  } finally {
    const releaseScript =
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
    await (client as any).eval(releaseScript, 1, redisKey, token).catch(() => undefined);
  }
}

async function enqueueNext(input: { parentJobDbId: string; episodeId: string; type: PipelineJobName; templatePayload: EpisodeJobPayload; render?: RenderJobPayload; maxAttempts: number; retryBackoffMs: number }) {
  const lockKey = `${input.episodeId}:${input.type}`;
  return withRedisDownstreamLock(lockKey, async () =>
    withDownstreamEnqueueLock(lockKey, async () => {
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
  }));
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

function parseCompileSpeed(value: unknown): "slow" | "medium" | "fast" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "slow" || normalized === "medium" || normalized === "fast") {
    return normalized;
  }
  return undefined;
}

function parseCompileAbVariant(value: unknown): "A" | "B" | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === "A" || normalized === "B") {
    return normalized;
  }
  return undefined;
}

function parseHookBoostValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(1, value));
}

function firstDefinedString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return undefined;
}

function firstDefinedSpeed(...values: unknown[]): "slow" | "medium" | "fast" | undefined {
  for (const value of values) {
    const parsed = parseCompileSpeed(value);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}

function firstDefinedAbVariant(...values: unknown[]): "A" | "B" | undefined {
  for (const value of values) {
    const parsed = parseCompileAbVariant(value);
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}

function firstDefinedKpiFocus(...values: unknown[]): string[] | undefined {
  for (const value of values) {
    const parsed = sanitizeStringArray(value);
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return undefined;
}

function firstDefinedHookBoost(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = parseHookBoostValue(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function resolveCompileStyleOptions(payload: EpisodeJobPayload, episodeSnapshot: unknown, episodeTopic: string): {
  stylePresetId?: string;
  styleSeed?: string;
  hookBoost?: number;
  episodeTopic?: string;
  episodeTitle?: string;
  tone?: string;
  speed?: "slow" | "medium" | "fast";
  kpiFocus?: string[];
  abVariant?: "A" | "B";
  channelBible?: unknown;
} {
  const story = isRecord(payload.pipeline?.story) ? payload.pipeline.story : {};
  const snapshot = isRecord(episodeSnapshot) ? episodeSnapshot : {};
  const snapshotStyle = isRecord(snapshot.style) ? snapshot.style : {};
  const snapshotSelector = isRecord(snapshot.style_selector) ? snapshot.style_selector : {};
  const snapshotEpisode = isRecord(snapshot.episode) ? snapshot.episode : {};

  return {
    stylePresetId: firstDefinedString(story.stylePresetId, snapshotStyle.stylePresetId, snapshotSelector.stylePresetId),
    styleSeed: firstDefinedString(story.styleSeed, snapshotSelector.styleSeed, snapshotStyle.styleSeed, snapshot.style_seed),
    hookBoost: firstDefinedHookBoost(story.hookBoost, snapshotStyle.hookBoost, snapshotSelector.hookBoost),
    episodeTopic: firstDefinedString(story.episodeTopic, snapshotEpisode.topic, snapshot.topic, episodeTopic),
    episodeTitle: firstDefinedString(story.episodeTitle, snapshotEpisode.title, snapshot.title),
    tone: firstDefinedString(story.tone, snapshotSelector.tone, snapshotStyle.tone),
    speed: firstDefinedSpeed(story.speed, snapshotSelector.speed, snapshotStyle.speed),
    kpiFocus: firstDefinedKpiFocus(story.kpiFocus, snapshotSelector.kpiFocus, snapshotStyle.kpiFocus),
    abVariant: firstDefinedAbVariant(story.abVariant, snapshotSelector.abVariant, snapshotStyle.abVariant),
    channelBible: snapshot.channelBible ?? snapshot.channel_bible
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
  const beatsDocJson = toPrismaJsonValue(beatsDoc);
  if (beatsDocJson === null) throw new Error("beats doc serialization failed");
  const hash = sha256Hex(stableStringify(beatsDocJson));
  await prisma.beatDoc.upsert({ where: { episodeId: payload.episodeId }, update: { schemaId: "beats.schema.json", json: beatsDocJson, hash }, create: { episodeId: payload.episodeId, schemaId: "beats.schema.json", json: beatsDocJson, hash } });
  await logJob(jobDbId, "info", "Beats generated", { beatsPath: out.beatsPath, beatsCount: beatsDoc.beats.length, hash });
  await enqueueNext({ parentJobDbId: jobDbId, episodeId: payload.episodeId, type: COMPILE_SHOTS_JOB_NAME, templatePayload: payload, maxAttempts: current.maxAttempts, retryBackoffMs: current.retryBackoffMs });
}

async function handleCompile(payload: EpisodeJobPayload, jobDbId: string, current: CurrentJobState) {
  const episode = await prisma.episode.findUnique({ where: { id: payload.episodeId }, select: { id: true, topic: true, targetDurationSec: true, bibleId: true, datasetVersionSnapshot: true } });
  if (!episode) throw new Error(`Episode not found: ${payload.episodeId}`);
  const beatDoc = await prisma.beatDoc.findUnique({ where: { episodeId: payload.episodeId }, select: { json: true } });
  if (!beatDoc) throw new Error(`BeatDoc not found: ${payload.episodeId}`);
  const fallbackEpisode: EpisodeInput = { episode_id: payload.episodeId, bible_ref: episode.bibleId ?? "channel_bible:default", topic: episode.topic, target_duration_sec: episode.targetDurationSec };
  const parsed = parseBeatDoc(beatDoc.json, fallbackEpisode);
  const compileStyleOptions = resolveCompileStyleOptions(payload, episode.datasetVersionSnapshot, parsed.episode.topic);
  const shots = compileShots(parsed.beats, compileStyleOptions);
  const shotsDoc = toShotsDocument({ ...parsed.episode, episode_id: payload.episodeId }, shots, 30);
  const vr = schemaValidator.validate("shots.schema.json", shotsDoc);
  if (!vr.ok) throw new Error("Schema validation failed: shots.schema.json");
  const out = ensureOut(payload.episodeId);
  writeJson(out.shotsPath, shotsDoc);
  const shotsDocJson = toPrismaJsonValue(shotsDoc);
  if (shotsDocJson === null) throw new Error("shots doc serialization failed");
  const hash = sha256Hex(stableStringify(shotsDocJson));
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
  let narrationAlignmentPath = render.narrationAlignmentPath;
  const episodeForRender = await prisma.episode.findUnique({
    where: { id: payload.episodeId },
    select: {
      characterPackId: true,
      characterPack: {
        select: {
          json: true
        }
      }
    }
  });

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

  if (stage === RENDER_PREVIEW_JOB_NAME) {
    const audioResult = await runPreviewAudioArtifacts(payload.episodeId, jobDbId, baseShotsPath);
    narrationAlignmentPath = audioResult.narrationAlignmentPath;
  } else if (!narrationAlignmentPath) {
    const out = ensureOut(payload.episodeId);
    const candidate = path.join(out.outDir, "narration_alignment.json");
    if (fs.existsSync(candidate)) {
      narrationAlignmentPath = candidate;
    }
  }

  await logJob(jobDbId, "info", "Render pipeline started", {
    stage,
    attempt,
    recoveryMode,
    recoverySource,
    failedShotIds,
    baseShotsPath,
    partialShotsPath,
    characterPackId: episodeForRender?.characterPackId ?? null,
    narrationAlignmentPath: narrationAlignmentPath ?? null
  });

  const result = await orchestrateRenderEpisode({
    shotsPath: shotsPathForAttempt,
    outputPath: render.outputPath,
    srtPath: render.srtPath,
    qcReportPath: render.qcReportPath,
    renderLogPath: render.renderLogPath,
    compositionId: render.compositionId,
    dryRun: render.dryRun ?? false,
    qc: render.qc,
    preset: render.preset,
    ...(narrationAlignmentPath ? { narrationAlignmentPath } : {}),
    attempt,
    maxAttempts: current.maxAttempts,
    ...(episodeForRender?.characterPackId ? { characterPackId: episodeForRender.characterPackId } : {}),
    ...(episodeForRender?.characterPack?.json ? { characterPack: episodeForRender.characterPack.json } : {})
  });
  await persistQc(payload.episodeId, jobDbId, result.qcReportPath);
  const retrySummary = buildRetrySummaryReport({
    episodeId: payload.episodeId,
    stage,
    attempt,
    recoveryMode,
    recoverySource,
    requestedFailedShotIds: failedShotIds,
    partialShotsPath,
    qcReportPath: result.qcReportPath
  });
  const retrySummaryPath = retrySummaryReportPath(payload.episodeId, stage);
  writeJson(retrySummaryPath, retrySummary);
  await logJob(jobDbId, "info", "Render retry summary aggregated", {
    stage,
    attempt,
    retrySummaryPath,
    failedShotSummary: retrySummary.failed_shot_summary
  });
  await logJob(jobDbId, "info", "Render completed", {
    stage,
    outputPath: result.outputPath,
    srtPath: result.srtPath,
    qcReportPath: result.qcReportPath,
    renderLogPath: result.renderLogPath,
    recoveryMode,
    partialShotsPath,
    failedShotIds,
    retrySummaryPath,
    characterPackId: episodeForRender?.characterPackId ?? null,
    narrationAlignmentPath: narrationAlignmentPath ?? null
  });

  if (stage === RENDER_PREVIEW_JOB_NAME) {
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
  let ttsFallbackReason: string | undefined;
  const tts = resolvePreviewTtsProvider(out.outDir, (reason) => {
    ttsFallbackReason = reason;
  });
  if (tts.warning) {
    await logJob(jobDbId, "warn", "Preview TTS provider warning", {
      warning: tts.warning
    });
  }

  const result = await runAudioPipeline(
    {
      ttsProvider: tts.provider,
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
    narrationAlignmentPath: result.narrationAlignmentPath,
    sfxEvents: result.placementPlan.sfxEvents.length,
    ttsProvider: tts.providerName,
    ttsFallback: ttsFallbackReason ? tts.fallbackName ?? null : null,
    ttsFallbackReason: ttsFallbackReason ?? null
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

  const packJson = toPrismaJsonValue(pack);
  if (packJson === null) {
    throw new Error("character pack serialization failed");
  }
  const hash = sha256Hex(stableStringify(packJson));

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
  const generationScoreSummary = summarizeCharacterGenerationScores(character);

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

  const remotionCli = path.resolve(REPO_ROOT, "apps", "video", "node_modules", "@remotion", "cli", "remotion-cli.js");
  const props = JSON.stringify({
    characterPackId: character.characterPackId,
    pack
  });

  await logJob(jobDbId, "info", "Character preview render started", {
    compositionId: "CHARACTER-PACK-PREVIEW",
    outputPath: out.previewPath
  });

  await runCommand(
    process.execPath,
    [
      remotionCli,
      "render",
      "apps/video/src/index.ts",
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
    generationQc: {
      manifestPath: generationScoreSummary.manifestPath,
      views: generationScoreSummary.views,
      warnings: generationScoreSummary.warnings
    },
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
  {
    connection: REDIS_CONNECTION,
    concurrency: 2,
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: WORKER_MAX_STALLED_COUNT
  }
);

const assetIngestWorker = new Worker<AssetIngestQueuePayload>(
  ASSET_QUEUE_NAME,
  async (bullJob) => {
    if (String(bullJob.name) !== ASSET_INGEST_JOB_NAME) {
      throw new Error(`asset worker received unsupported job: ${String(bullJob.name)}`);
    }
    if (!isAssetIngestPayload(bullJob.data)) {
      throw new Error("Invalid ASSET_INGEST payload");
    }
    return withTimeout(
      handleAssetIngestJob({
        prisma,
        payload: bullJob.data,
        bullmqJobId: String(bullJob.id)
      }),
      ASSET_INGEST_TIMEOUT_MS,
      `ASSET_INGEST job=${String(bullJob.id)}`
    );
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 1,
    lockDuration: WORKER_LOCK_DURATION_MS,
    stalledInterval: WORKER_STALLED_INTERVAL_MS,
    maxStalledCount: WORKER_MAX_STALLED_COUNT
  }
);

worker.on("failed", async (bullJob, err) => {
  if (!bullJob) return;
  const jobName = String(bullJob.name);
  const rawPayload = bullJob.data as unknown;

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

assetIngestWorker.on("failed", async (bullJob, error) => {
  if (!bullJob || String(bullJob.name) !== ASSET_INGEST_JOB_NAME) {
    return;
  }
  const payload = bullJob.data;
  if (!isAssetIngestPayload(payload)) {
    return;
  }
  const safeError = error instanceof Error ? error.message : String(error);
  try {
    await prisma.asset.update({
      where: { id: payload.assetId },
      data: {
        status: "FAILED",
        qcJson: {
          ok: false,
          stage: "worker_failed",
          error: safeError,
          bullmqJobId: String(bullJob.id),
          failedAt: new Date().toISOString()
        } as Prisma.JsonObject
      }
    });
  } catch {
    // ignore secondary failure
  }
});

let isShuttingDown = false;

async function shutdownWorker(signal: "SIGINT" | "SIGTERM"): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.log(`[worker] shutting down signal=${signal}`);
  await assetIngestWorker.close().catch(() => undefined);
  await worker.close().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdownWorker(signal);
  });
}

console.log(
  `[worker] running. redis=${REDIS_URL} queue=${QUEUE_NAME} jobs=${EPISODE_JOB_NAME},${GENERATE_CHARACTER_ASSETS_JOB_NAME},${BUILD_CHARACTER_PACK_JOB_NAME},${COMPILE_SHOTS_JOB_NAME},${RENDER_CHARACTER_PREVIEW_JOB_NAME},${RENDER_PREVIEW_JOB_NAME},${RENDER_FINAL_JOB_NAME},${PACKAGE_OUTPUTS_JOB_NAME},${RENDER_EPISODE_JOB_NAME}`
);
console.log(`[worker] asset ingest enabled. queue=${ASSET_QUEUE_NAME} job=${ASSET_INGEST_JOB_NAME}`);
