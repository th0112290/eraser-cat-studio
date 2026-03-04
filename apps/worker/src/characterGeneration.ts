import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { JobsOptions } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import { sha256Hex, stableStringify } from "@ec/shared";
import {
  buildCharacterPrompt,
  createCharacterProvider,
  deriveStyleHintsFromChannelBible,
  resolveProviderName,
  type CharacterGenerationCandidate,
  type CharacterProviderCallLog,
  type CharacterProviderGenerateInput,
  type CharacterView
} from "@ec/image-gen";
import {
  ASSET_INGEST_JOB_NAME,
  BUILD_CHARACTER_PACK_JOB_NAME,
  queue,
  REPO_ROOT,
  type CharacterAssetSelection,
  type CharacterGenerationPayload,
  type CharacterGenerationSelection,
  type CharacterGenerationView,
  type CharacterPackJobPayload,
  type EpisodeJobPayload
} from "./queue";
import { getAssetObject, makeStorageKey, putAssetObject } from "./assetStorage";
import type { AssetIngestJobPayload } from "./assetIngest";

type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

type JobLogger = (jobId: string, level: string, message: string, details?: unknown) => Promise<void>;

type AddEpisodeJob = (
  name: string,
  payload: EpisodeJobPayload,
  maxAttempts: number,
  retryBackoffMs: number
) => Promise<{ id?: string | number }>;

type SetJobStatus = (
  jobId: string,
  status: JobStatus,
  patch?: Partial<{
    progress: number;
    attemptsMade: number;
    lastError: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
  }>
) => Promise<void>;

type SetEpisodeStatus = (
  episodeId: string,
  status: "GENERATING" | "PREVIEW_READY" | "COMPLETED" | "FAILED"
) => Promise<void>;

type GenerationHelpers = {
  logJob: JobLogger;
  setJobStatus: SetJobStatus;
  setEpisodeStatus: SetEpisodeStatus;
  addEpisodeJob: AddEpisodeJob;
};

type ImageAnalysis = {
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  alphaCoverage: number;
  bboxOccupancy: number;
  bboxCenterX: number;
  bboxCenterY: number;
  bboxScale: number;
  contrast: number;
  blurScore: number;
  noiseScore: number;
  watermarkTextRisk: number;
  edgeDensityBottomRight: number;
  upperFaceCoverage: number;
  phash: string;
  palette: Array<[number, number, number]>;
};

type CandidateScoreBreakdown = {
  alphaScore: number;
  occupancyScore: number;
  sharpnessScore: number;
  noiseScore: number;
  watermarkScore: number;
  resolutionScore: number;
  referenceScore: number;
  styleScore: number;
  qualityScore: number;
  consistencyScore: number | null;
  consistencyParts?: {
    phash: number;
    palette: number;
    bboxCenter: number;
    bboxScale: number;
  };
  generationRound: number;
};

type ScoredCandidate = {
  candidate: CharacterGenerationCandidate;
  analysis: ImageAnalysis;
  score: number;
  styleScore: number;
  referenceSimilarity: number | null;
  consistencyScore: number | null;
  warnings: string[];
  rejections: string[];
  breakdown: CandidateScoreBreakdown;
};

type GenerationManifest = {
  schemaVersion: "1.0";
  inputHash: string;
  manifestHash: string;
  status: "PENDING_HITL" | "AUTO_SELECTED" | "HITL_SELECTED";
  sessionId?: string;
  episodeId: string;
  characterPackId: string;
  provider: string;
  providerRequested?: string | null;
  providerWarning?: string | null;
  workflowHash: string;
  generatedAt: string;
  mode: string;
  promptPreset: string;
  positivePrompt: string;
  negativePrompt: string;
  guardrails: string[];
  reference: {
    assetId: string | null;
    sourceSessionId?: string | null;
    phash: string | null;
    palette: Array<[number, number, number]> | null;
    continuity?: {
      enabled: boolean;
      attempted: boolean;
      applied: boolean;
      reason: string;
      attemptedSourceSessionId?: string;
      cutoffUpdatedAt?: string;
      queuedSessionCount?: number;
      searchedSessionCount?: number;
      searchedSessionIdsPreview?: string[];
      preferredPoolCount?: number;
      fallbackPoolCount?: number;
      sourcePool?: "preferred" | "fallback";
      candidatePicked?: boolean;
      candidateScore?: number | null;
      candidateRejectionCount?: number | null;
      candidateUpdatedAt?: string | null;
      policy?: {
        maxSessionAgeHours: number;
        minScore: number;
        maxRejections: number;
        requirePicked: boolean;
        requireScore: boolean;
        candidateTake: number;
        preferredSessionTake: number;
        fallbackSessionTake: number;
        requestOverride: boolean | null;
      };
    };
  };
  candidates: Array<{
    id: string;
    view: CharacterView;
    candidateIndex: number;
    seed: number;
    mimeType: string;
    filePath: string;
    score: number;
    styleScore: number;
    referenceSimilarity: number | null;
    consistencyScore: number | null;
    warnings: string[];
    rejections: string[];
    breakdown?: CandidateScoreBreakdown;
  }>;
  selectedByView: Partial<Record<CharacterView, { candidateId: string; assetId?: string; assetIngestJobId?: string }>>;
};

function withManifestHashes(
  manifest: Omit<GenerationManifest, "inputHash" | "manifestHash">
): GenerationManifest {
  const candidateFingerprint = manifest.candidates
    .map((candidate) => ({
      id: candidate.id,
      view: candidate.view,
      candidateIndex: candidate.candidateIndex,
      seed: candidate.seed,
      filePath: candidate.filePath
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const inputHash = sha256Hex(
    stableStringify({
      episodeId: manifest.episodeId,
      characterPackId: manifest.characterPackId,
      mode: manifest.mode,
      promptPreset: manifest.promptPreset,
      positivePrompt: manifest.positivePrompt,
      negativePrompt: manifest.negativePrompt,
      workflowHash: manifest.workflowHash,
      provider: manifest.provider,
      candidateFingerprint
    })
  );
  const manifestWithInput = {
    ...manifest,
    inputHash
  };
  const manifestHash = sha256Hex(stableStringify(manifestWithInput));
  return {
    ...manifestWithInput,
    manifestHash
  };
}

const CHARACTER_VIEWS: CharacterView[] = ["front", "threeQuarter", "profile"];

type GenerationLimits = {
  maxCandidatesPerView: number;
  maxTotalImages: number;
  maxRetries: number;
  monthlyBudgetUsd: number;
  costPerImageUsd: number;
  budgetFallbackToMock: boolean;
};

type GenerationBudgetState = {
  monthSpentUsd: number;
  monthBudgetUsd: number;
  estimatedCostThisRunUsd: number;
  wouldExceed: boolean;
};

type GenerationQualityConfig = {
  minAcceptedScore: number;
  autoRetryRounds: number;
  sequentialReference: boolean;
};

type ContinuityReferenceConfig = {
  maxSessionAgeHours: number;
  minScore: number;
  maxRejections: number;
  requirePicked: boolean;
  requireScore: boolean;
  candidateTake: number;
  preferredSessionTake: number;
  fallbackSessionTake: number;
};

function toFiniteNonNegative(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function readGenerationLimits(): GenerationLimits {
  const budgetFallbackFlag = (process.env.IMAGEGEN_BUDGET_FALLBACK_TO_MOCK ?? "true").trim().toLowerCase();
  return {
    maxCandidatesPerView: toPositiveInt(process.env.IMAGEGEN_MAX_CANDIDATES_PER_VIEW, 4),
    maxTotalImages: toPositiveInt(process.env.IMAGEGEN_MAX_TOTAL_IMAGES, 18),
    maxRetries: toPositiveInt(process.env.IMAGEGEN_MAX_RETRIES, 2),
    monthlyBudgetUsd: toFiniteNonNegative(process.env.IMAGEGEN_MONTHLY_BUDGET_USD, 30),
    costPerImageUsd: toFiniteNonNegative(process.env.IMAGEGEN_COST_PER_IMAGE_USD, 0),
    budgetFallbackToMock: !["false", "0", "no", "off"].includes(budgetFallbackFlag)
  };
}

function readGenerationQualityConfig(): GenerationQualityConfig {
  const sequentialFlag = (process.env.IMAGEGEN_SEQUENTIAL_REFERENCE ?? "true").trim().toLowerCase();
  return {
    minAcceptedScore: toFiniteNonNegative(process.env.IMAGEGEN_MIN_ACCEPTED_SCORE, 0.64),
    autoRetryRounds: Math.max(0, toPositiveInt(process.env.IMAGEGEN_AUTO_RETRY_ROUNDS, 2)),
    sequentialReference: !["false", "0", "no", "off"].includes(sequentialFlag)
  };
}

function shouldAutoContinuityReference(): boolean {
  const raw = (process.env.CHARACTER_AUTO_CONTINUITY_REFERENCE ?? "true").trim().toLowerCase();
  return !["false", "0", "no", "off"].includes(raw);
}

function readContinuityReferenceConfig(): ContinuityReferenceConfig {
  const requirePickedFlag = (process.env.CHARACTER_AUTO_CONTINUITY_REQUIRE_PICKED ?? "true").trim().toLowerCase();
  const requireScoreFlag = (process.env.CHARACTER_AUTO_CONTINUITY_REQUIRE_SCORE ?? "true").trim().toLowerCase();
  const maxSessionAgeHours = clampInt(toPositiveInt(process.env.CHARACTER_AUTO_CONTINUITY_MAX_SESSION_AGE_HOURS, 168), 1, 24 * 365);
  const candidateTake = clampInt(toPositiveInt(process.env.CHARACTER_AUTO_CONTINUITY_CANDIDATE_TAKE, 10), 1, 50);
  const preferredSessionTake = clampInt(
    toPositiveInt(process.env.CHARACTER_AUTO_CONTINUITY_PREFERRED_TAKE, 8),
    1,
    100
  );
  const fallbackSessionTake = clampInt(
    toPositiveInt(process.env.CHARACTER_AUTO_CONTINUITY_FALLBACK_TAKE, 12),
    1,
    150
  );
  return {
    maxSessionAgeHours,
    minScore: clamp01(toFiniteNonNegative(process.env.CHARACTER_AUTO_CONTINUITY_MIN_SCORE, 0.62)),
    maxRejections: toNonNegativeInt(process.env.CHARACTER_AUTO_CONTINUITY_MAX_REJECTIONS, 1),
    requirePicked: !["false", "0", "no", "off"].includes(requirePickedFlag),
    requireScore: !["false", "0", "no", "off"].includes(requireScoreFlag),
    candidateTake,
    preferredSessionTake,
    fallbackSessionTake
  };
}

function clampGenerationRequest(
  input: CharacterGenerationPayload,
  viewCount: number,
  limits: GenerationLimits
): {
  candidateCount: number;
  totalImages: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let candidateCount = Math.max(1, input.candidateCount ?? 4);
  if (candidateCount > limits.maxCandidatesPerView) {
    warnings.push(`candidateCount clamped ${candidateCount} -> ${limits.maxCandidatesPerView}`);
    candidateCount = limits.maxCandidatesPerView;
  }

  const maxByTotal = Math.max(1, Math.floor(limits.maxTotalImages / Math.max(1, viewCount)));
  if (candidateCount > maxByTotal) {
    warnings.push(`candidateCount clamped by maxTotalImages ${candidateCount} -> ${maxByTotal}`);
    candidateCount = maxByTotal;
  }

  const totalImages = candidateCount * Math.max(1, viewCount);
  return {
    candidateCount,
    totalImages,
    warnings
  };
}

function getRemoteApiConfig(): {
  baseUrl?: string;
  apiKey?: string;
  headerName: string;
  headerValuePrefix: string;
  timeoutMs: number;
} {
  const baseUrl = process.env.IMAGEGEN_REMOTE_BASE_URL?.trim();
  const apiKey = process.env.IMAGEGEN_REMOTE_API_KEY?.trim();
  const headerName = process.env.IMAGEGEN_REMOTE_HEADER_NAME?.trim() || "Authorization";
  const headerValuePrefix = process.env.IMAGEGEN_REMOTE_HEADER_VALUE_PREFIX ?? "Bearer ";
  const timeoutMs = toPositiveInt(process.env.IMAGEGEN_REMOTE_TIMEOUT_MS, 60_000);

  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
    headerName,
    headerValuePrefix,
    timeoutMs
  };
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number.parseFloat(String(value));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

async function readMonthlySpentUsd(prisma: PrismaClient): Promise<number> {
  let rows: Array<{ total: unknown }> = [];
  try {
    rows = await prisma.$queryRaw<Array<{ total: unknown }>>`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total
      FROM provider_call_logs
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `;
  } catch {
    return 0;
  }
  if (rows.length === 0) {
    return 0;
  }
  return Math.max(0, asNumber(rows[0].total));
}

async function evaluateBudget(
  prisma: PrismaClient,
  estimatedImageCount: number,
  limits: GenerationLimits
): Promise<GenerationBudgetState> {
  const monthSpentUsd = await readMonthlySpentUsd(prisma);
  const estimatedCostThisRunUsd = Math.max(0, estimatedImageCount * limits.costPerImageUsd);
  const wouldExceed = monthSpentUsd + estimatedCostThisRunUsd > limits.monthlyBudgetUsd;
  return {
    monthSpentUsd,
    monthBudgetUsd: limits.monthlyBudgetUsd,
    estimatedCostThisRunUsd,
    wouldExceed
  };
}

async function insertProviderCallLogs(input: {
  prisma: PrismaClient;
  sessionId?: string;
  episodeId: string;
  callLogs: CharacterProviderCallLog[];
}): Promise<void> {
  const { prisma, sessionId, episodeId, callLogs } = input;
  if (callLogs.length === 0) {
    return;
  }

  try {
    for (const log of callLogs) {
      await prisma.$executeRaw`
        INSERT INTO provider_call_logs (
          id,
          session_id,
          episode_id,
          provider,
          view,
          candidate_index,
          attempt,
          duration_ms,
          estimated_cost_usd,
          result,
          error_summary,
          status_code
        ) VALUES (
          ${randomUUID()},
          ${sessionId ?? null},
          ${episodeId},
          ${log.provider},
          ${log.view},
          ${log.candidateIndex},
          ${log.attempt},
          ${Math.max(0, Math.floor(log.durationMs))},
          ${Math.max(0, log.estimatedCostUsd)},
          ${log.result},
          ${log.errorSummary ?? null},
          ${log.statusCode ?? null}
        )
      `;
    }
  } catch {
    // Do not fail generation if provider_call_logs table is not migrated yet.
    return;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function strengthenNegativePrompt(base: string, boost: boolean, round: number): string {
  const defaultGuardrails = [
    "text",
    "watermark",
    "logo",
    "signature",
    "extra fingers",
    "deformed hands",
    "blurry face",
    "cropped head",
    "busy background"
  ];

  const existing = base
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const merged = new Set(existing);

  if (boost) {
    for (const token of defaultGuardrails) {
      merged.add(token);
    }
  }

  if (round > 0) {
    merged.add("low quality");
    merged.add("jpeg artifacts");
  }
  if (round > 1) {
    merged.add("multiple characters");
    merged.add("background text");
  }

  return [...merged].join(", ");
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function normalizeReferenceAssetStorageKey(asset: {
  normalizedKey1024: string | null;
  normalizedKey2048: string | null;
  originalKey: string | null;
  storageKey: string;
}): string {
  return asset.normalizedKey1024 ?? asset.normalizedKey2048 ?? asset.originalKey ?? asset.storageKey;
}

function hammingSimilarity(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length || hashA.length === 0) {
    return 0;
  }

  let same = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    if (hashA[i] === hashB[i]) {
      same += 1;
    }
  }

  return same / hashA.length;
}

function paletteSimilarity(a: Array<[number, number, number]>, b: Array<[number, number, number]>): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const size = Math.min(a.length, b.length);
  let total = 0;

  for (let i = 0; i < size; i += 1) {
    const colorA = a[i];
    const colorB = b[i];
    const distance = Math.sqrt(
      Math.pow(colorA[0] - colorB[0], 2) + Math.pow(colorA[1] - colorB[1], 2) + Math.pow(colorA[2] - colorB[2], 2)
    );
    total += 1 - distance / 441.6729559300637;
  }

  return clamp01(total / size);
}

async function computePHash(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== 9 || info.height !== 8) {
    return "";
  }

  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      bits += left > right ? "1" : "0";
    }
  }

  return bits;
}

async function analyzeImage(buffer: Buffer): Promise<ImageAnalysis> {
  const metadata = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .resize(128, 128, { fit: "inside", withoutEnlargement: false })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const originalWidth = metadata.width ?? width;
  const originalHeight = metadata.height ?? height;
  const pixelCount = width * height;

  let alphaPixels = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let edgeCount = 0;
  let edgeTotal = 0;
  let upperAlphaPixels = 0;
  let upperPixels = 0;
  let bboxMinX = width;
  let bboxMinY = height;
  let bboxMaxX = -1;
  let bboxMaxY = -1;

  const lumaMap = new Float64Array(pixelCount);
  let noiseAccum = 0;
  let noiseCount = 0;

  const paletteBucket = new Map<string, number>();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      const pixelIndex = y * width + x;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaMap[pixelIndex] = luma;

      if (a > 8) {
        alphaPixels += 1;
        if (x < bboxMinX) {
          bboxMinX = x;
        }
        if (x > bboxMaxX) {
          bboxMaxX = x;
        }
        if (y < bboxMinY) {
          bboxMinY = y;
        }
        if (y > bboxMaxY) {
          bboxMaxY = y;
        }
        if (y < height * 0.45) {
          upperAlphaPixels += 1;
        }
        if (luma < minLuma) {
          minLuma = luma;
        }
        if (luma > maxLuma) {
          maxLuma = luma;
        }

        const qr = Math.round(r / 32) * 32;
        const qg = Math.round(g / 32) * 32;
        const qb = Math.round(b / 32) * 32;
        const key = `${qr}:${qg}:${qb}`;
        paletteBucket.set(key, (paletteBucket.get(key) ?? 0) + 1);
      }

      if (x > width * 0.65 && y > height * 0.65 && x < width - 1 && y < height - 1) {
        const idxRight = idx + 4;
        const idxDown = idx + width * 4;
        const dr = Math.abs(data[idx] - data[idxRight]);
        const dg = Math.abs(data[idx + 1] - data[idxRight + 1]);
        const db = Math.abs(data[idx + 2] - data[idxRight + 2]);
        const vr = Math.abs(data[idx] - data[idxDown]);
        const vg = Math.abs(data[idx + 1] - data[idxDown + 1]);
        const vb = Math.abs(data[idx + 2] - data[idxDown + 2]);
        const diff = (dr + dg + db + vr + vg + vb) / 6;
        if (diff > 26) {
          edgeCount += 1;
        }
        edgeTotal += 1;
      }

      if (x < width - 1 && y < height - 1) {
        const idxRight = idx + 4;
        const idxDown = idx + width * 4;
        const lumaRight = 0.2126 * data[idxRight] + 0.7152 * data[idxRight + 1] + 0.0722 * data[idxRight + 2];
        const lumaDown = 0.2126 * data[idxDown] + 0.7152 * data[idxDown + 1] + 0.0722 * data[idxDown + 2];
        noiseAccum += Math.abs(luma - lumaRight) + Math.abs(luma - lumaDown);
        noiseCount += 2;
      }

      if (y < height * 0.45) {
        upperPixels += 1;
      }
    }
  }

  const palette = [...paletteBucket.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const [r, g, b] = key.split(":").map((part) => Number.parseInt(part, 10));
      return [r, g, b] as [number, number, number];
    });

  let blurMean = 0;
  let blurSqMean = 0;
  let blurCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap =
        4 * lumaMap[i] -
        lumaMap[i - 1] -
        lumaMap[i + 1] -
        lumaMap[i - width] -
        lumaMap[i + width];
      blurMean += lap;
      blurSqMean += lap * lap;
      blurCount += 1;
    }
  }
  const blurAvg = blurCount > 0 ? blurMean / blurCount : 0;
  const blurVariance = blurCount > 0 ? Math.max(0, blurSqMean / blurCount - blurAvg * blurAvg) : 0;

  const bboxWidth = bboxMaxX >= bboxMinX ? bboxMaxX - bboxMinX + 1 : 0;
  const bboxHeight = bboxMaxY >= bboxMinY ? bboxMaxY - bboxMinY + 1 : 0;
  const bboxArea = bboxWidth * bboxHeight;
  const bboxOccupancy = pixelCount > 0 ? bboxArea / pixelCount : 0;
  const bboxCenterX = bboxWidth > 0 ? (bboxMinX + bboxWidth / 2) / width : 0.5;
  const bboxCenterY = bboxHeight > 0 ? (bboxMinY + bboxHeight / 2) / height : 0.5;
  const bboxScale = pixelCount > 0 ? Math.sqrt(Math.max(0, bboxArea / pixelCount)) : 0;

  const alphaCoverage = pixelCount > 0 ? alphaPixels / pixelCount : 0;
  const contrast = maxLuma - minLuma;
  const edgeDensityBottomRight = edgeTotal > 0 ? edgeCount / edgeTotal : 0;
  const upperFaceCoverage = upperPixels > 0 ? upperAlphaPixels / upperPixels : 0;
  const blurScore = blurVariance;
  const noiseScore = noiseCount > 0 ? noiseAccum / noiseCount : 0;
  const watermarkTextRisk = clamp01(edgeDensityBottomRight * 1.6 + Math.max(0, contrast - 55) / 220);
  const phash = await computePHash(buffer);

  return {
    originalWidth,
    originalHeight,
    width,
    height,
    alphaCoverage,
    bboxOccupancy,
    bboxCenterX,
    bboxCenterY,
    bboxScale,
    contrast,
    blurScore,
    noiseScore,
    watermarkTextRisk,
    edgeDensityBottomRight,
    upperFaceCoverage,
    phash,
    palette
  };
}

function scoreStyleMatch(prompt: string): number {
  const required = ["transparent background", "mascot", "character"];
  const normalized = prompt.toLowerCase();
  let matched = 0;

  for (const token of required) {
    if (normalized.includes(token)) {
      matched += 1;
    }
  }

  return clamp01(matched / required.length);
}

function scoreResolutionQuality(analysis: ImageAnalysis): number {
  const minDimension = Math.min(analysis.originalWidth, analysis.originalHeight);
  if (minDimension >= 1024) {
    return 1;
  }
  if (minDimension <= 256) {
    return 0;
  }
  return clamp01((minDimension - 256) / 768);
}

function scoreBBoxOccupancy(analysis: ImageAnalysis): number {
  const target = 0.48;
  const distance = Math.abs(analysis.bboxOccupancy - target);
  return clamp01(1 - distance / 0.45);
}

function scoreAlphaCoverage(analysis: ImageAnalysis): number {
  const target = 0.42;
  const distance = Math.abs(analysis.alphaCoverage - target);
  return clamp01(1 - distance / 0.5);
}

function scoreSharpness(analysis: ImageAnalysis): number {
  return clamp01(analysis.blurScore / 2600);
}

function scoreNoise(analysis: ImageAnalysis): number {
  return clamp01(1 - analysis.noiseScore / 70);
}

function scoreWatermarkSafety(analysis: ImageAnalysis): number {
  return clamp01(1 - analysis.watermarkTextRisk);
}

function scoreCandidate(input: {
  candidate: CharacterGenerationCandidate;
  analysis: ImageAnalysis;
  mode: string;
  styleScore: number;
  referenceAnalysis?: ImageAnalysis;
  generationRound: number;
}): ScoredCandidate {
  const warnings: string[] = [];
  const rejections: string[] = [];

  if (input.analysis.alphaCoverage > 0.995 || input.analysis.alphaCoverage < 0.04) {
    warnings.push("background_not_transparent");
  }

  if (input.analysis.contrast < 20) {
    warnings.push("low_contrast");
  }

  if (input.analysis.edgeDensityBottomRight > 0.4) {
    rejections.push("watermark_or_text_artifact");
  }

  if (input.analysis.watermarkTextRisk > 0.72) {
    warnings.push("text_or_watermark_suspected");
  }
  if (input.analysis.watermarkTextRisk > 0.88) {
    rejections.push("text_or_watermark_high_risk");
  }

  if (input.analysis.upperFaceCoverage < 0.04 || input.analysis.upperFaceCoverage > 0.9) {
    warnings.push("face_or_eyes_region_unstable");
  }

  if (Math.min(input.analysis.originalWidth, input.analysis.originalHeight) < 512) {
    warnings.push("low_resolution");
  }

  if (input.analysis.bboxOccupancy < 0.12 || input.analysis.bboxOccupancy > 0.92) {
    warnings.push("bbox_occupancy_outlier");
  }

  if (input.analysis.blurScore < 180) {
    warnings.push("blurry");
  }

  if (input.analysis.noiseScore > 48) {
    warnings.push("noisy");
  }

  let referenceSimilarity: number | null = null;
  if (input.referenceAnalysis) {
    const hashSimilarity = hammingSimilarity(input.analysis.phash, input.referenceAnalysis.phash);
    const paletteScore = paletteSimilarity(input.analysis.palette, input.referenceAnalysis.palette);
    referenceSimilarity = clamp01(hashSimilarity * 0.7 + paletteScore * 0.3);
    if (input.mode === "reference" && referenceSimilarity < 0.28) {
      rejections.push("reference_similarity_too_low");
    }
  }

  const alphaScore = scoreAlphaCoverage(input.analysis);
  const occupancyScore = scoreBBoxOccupancy(input.analysis);
  const sharpnessScore = scoreSharpness(input.analysis);
  const noiseScore = scoreNoise(input.analysis);
  const watermarkScore = scoreWatermarkSafety(input.analysis);
  const resolutionScore = scoreResolutionQuality(input.analysis);
  const referenceScore = referenceSimilarity ?? 0.5;

  const qualityScore = clamp01(
    alphaScore * 0.16 +
      occupancyScore * 0.18 +
      sharpnessScore * 0.2 +
      noiseScore * 0.12 +
      watermarkScore * 0.2 +
      resolutionScore * 0.14
  );

  let score = 0.48;
  score += input.styleScore * 0.14;
  score += qualityScore * 0.24;
  score += referenceScore * 0.14;
  score -= warnings.length * 0.05;
  score -= rejections.length * 0.25;

  return {
    candidate: input.candidate,
    analysis: input.analysis,
    score: clamp01(score),
    styleScore: input.styleScore,
    referenceSimilarity,
    consistencyScore: null,
    warnings,
    rejections,
    breakdown: {
      alphaScore,
      occupancyScore,
      sharpnessScore,
      noiseScore,
      watermarkScore,
      resolutionScore,
      referenceScore,
      styleScore: input.styleScore,
      qualityScore,
      consistencyScore: null,
      generationRound: input.generationRound
    }
  };
}

function scoreConsistencyAgainstFront(analysis: ImageAnalysis, frontAnalysis: ImageAnalysis): {
  score: number;
  parts: {
    phash: number;
    palette: number;
    bboxCenter: number;
    bboxScale: number;
  };
} {
  const phash = hammingSimilarity(analysis.phash, frontAnalysis.phash);
  const palette = paletteSimilarity(analysis.palette, frontAnalysis.palette);
  const centerDistance = Math.sqrt(
    Math.pow(analysis.bboxCenterX - frontAnalysis.bboxCenterX, 2) +
      Math.pow(analysis.bboxCenterY - frontAnalysis.bboxCenterY, 2)
  );
  const bboxCenter = clamp01(1 - centerDistance / 0.5);
  const bboxScale = clamp01(1 - Math.abs(analysis.bboxScale - frontAnalysis.bboxScale) / 0.45);
  const score = clamp01(phash * 0.42 + palette * 0.22 + bboxCenter * 0.18 + bboxScale * 0.18);
  return {
    score,
    parts: {
      phash,
      palette,
      bboxCenter,
      bboxScale
    }
  };
}

function applyConsistencyScoring(scored: ScoredCandidate[]): void {
  const frontCandidates = scored
    .filter((entry) => entry.candidate.view === "front")
    .sort((a, b) => {
      const rejectionWeightA = a.rejections.length > 0 ? 1 : 0;
      const rejectionWeightB = b.rejections.length > 0 ? 1 : 0;
      if (rejectionWeightA !== rejectionWeightB) {
        return rejectionWeightA - rejectionWeightB;
      }
      return b.score - a.score;
    });

  const frontBaseline = frontCandidates[0];
  if (!frontBaseline) {
    return;
  }

  for (const entry of scored) {
    if (entry.candidate.view === "front") {
      entry.consistencyScore = 1;
      entry.breakdown.consistencyScore = 1;
      continue;
    }

    const consistency = scoreConsistencyAgainstFront(entry.analysis, frontBaseline.analysis);
    entry.consistencyScore = consistency.score;
    entry.breakdown.consistencyScore = consistency.score;
    entry.breakdown.consistencyParts = consistency.parts;
    entry.score = clamp01(entry.score * 0.72 + consistency.score * 0.28);

    if (consistency.score < 0.34) {
      if (!entry.rejections.includes("inconsistent_with_front_baseline")) {
        entry.rejections.push("inconsistent_with_front_baseline");
      }
    } else if (consistency.score < 0.48) {
      if (!entry.warnings.includes("consistency_low")) {
        entry.warnings.push("consistency_low");
      }
    }
  }
}

function groupBestByView(scored: ScoredCandidate[]): Partial<Record<CharacterView, ScoredCandidate>> {
  const out: Partial<Record<CharacterView, ScoredCandidate>> = {};

  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const pool = scored
      .filter((entry) => entry.candidate.view === view)
      .sort((a, b) => {
        const rejectionWeightA = a.rejections.length > 0 ? 1 : 0;
        const rejectionWeightB = b.rejections.length > 0 ? 1 : 0;
        if (rejectionWeightA !== rejectionWeightB) {
          return rejectionWeightA - rejectionWeightB;
        }
        return b.score - a.score;
      });

    if (pool.length > 0) {
      out[view] = pool[0];
    }
  }

  return out;
}

async function waitForAssetsReady(prisma: PrismaClient, assetIds: string[]): Promise<void> {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const rows = await prisma.asset.findMany({
      where: {
        id: {
          in: assetIds
        }
      },
      select: {
        id: true,
        status: true,
        qcJson: true
      }
    });

    if (rows.length !== assetIds.length) {
      throw new Error("Asset rows disappeared during ASSET_INGEST wait");
    }

    const failed = rows.find((row) => row.status === "FAILED");
    if (failed) {
      throw new Error(`ASSET_INGEST failed for asset ${failed.id}`);
    }

    if (rows.every((row) => row.status === "READY")) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  throw new Error("Timed out waiting for ASSET_INGEST completion");
}

function requireCharacter(payload: EpisodeJobPayload): CharacterPackJobPayload {
  if (!payload.character) {
    throw new Error("Missing payload.character");
  }

  const character = payload.character;
  if (typeof character.characterPackId !== "string" || character.characterPackId.trim().length === 0) {
    throw new Error("payload.character.characterPackId is required");
  }

  if (typeof character.version !== "number" || !Number.isInteger(character.version) || character.version <= 0) {
    throw new Error("payload.character.version must be a positive integer");
  }

  return character;
}

function normalizeGenerationView(value: unknown): CharacterGenerationView | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "front") {
    return "front";
  }
  if (
    normalized === "threequarter" ||
    normalized === "three_quarter" ||
    normalized === "three-quarter" ||
    normalized === "threequarterview"
  ) {
    return "threeQuarter";
  }
  if (normalized === "profile") {
    return "profile";
  }
  return undefined;
}

function normalizeGenerationConfig(generation: CharacterGenerationPayload | undefined): CharacterGenerationPayload {
  const selectedCandidateIds = generation?.selectedCandidateIds;
  const normalizedSelection =
    selectedCandidateIds &&
    typeof selectedCandidateIds.front === "string" &&
    typeof selectedCandidateIds.threeQuarter === "string" &&
    typeof selectedCandidateIds.profile === "string"
      ? {
          front: selectedCandidateIds.front.trim(),
          threeQuarter: selectedCandidateIds.threeQuarter.trim(),
          profile: selectedCandidateIds.profile.trim()
        }
      : undefined;
  const viewToGenerate = normalizeGenerationView(generation?.viewToGenerate);

  return {
    sessionId:
      typeof generation?.sessionId === "string" && generation.sessionId.trim().length > 0
        ? generation.sessionId.trim()
        : undefined,
    mode: generation?.mode === "reference" ? "reference" : "new",
    provider: generation?.provider,
    promptPreset: generation?.promptPreset ?? "eraser-cat-flat",
    positivePrompt: generation?.positivePrompt,
    negativePrompt: generation?.negativePrompt,
    boostNegativePrompt: generation?.boostNegativePrompt === true,
    referenceAssetId: generation?.referenceAssetId,
    viewToGenerate,
    regenerateSameSeed: generation?.regenerateSameSeed !== false,
    candidateCount: Math.max(1, Math.min(8, generation?.candidateCount ?? 4)),
    autoPick: generation?.autoPick !== false,
    requireHitlPick: generation?.requireHitlPick === true,
    seed: generation?.seed ?? 101,
    manifestPath: generation?.manifestPath,
    ...(normalizedSelection &&
    normalizedSelection.front.length > 0 &&
    normalizedSelection.threeQuarter.length > 0 &&
    normalizedSelection.profile.length > 0
      ? {
          selectedCandidateIds: normalizedSelection
        }
      : {})
  };
}

function resolveAutoContinuityOverride(generation: CharacterGenerationPayload | undefined): boolean | undefined {
  if (!isRecord(generation)) {
    return undefined;
  }
  const record = generation as Record<string, unknown>;
  const value = record.autoContinuityReference;
  return typeof value === "boolean" ? value : undefined;
}

function toDbGenerationMode(mode: CharacterGenerationPayload["mode"]): "NEW" | "REFERENCE" {
  return mode === "reference" ? "REFERENCE" : "NEW";
}

function toDbGenerationProvider(
  provider: CharacterGenerationPayload["provider"]
): "MOCK" | "COMFYUI" | "REMOTEAPI" {
  if (provider === "comfyui") {
    return "COMFYUI";
  }
  if (provider === "remoteApi") {
    return "REMOTEAPI";
  }
  if (provider === "mock") {
    return "MOCK";
  }
  return "MOCK";
}

function toDbGenerationView(
  view: CharacterGenerationPayload["viewToGenerate"]
): "FRONT" | "THREE_QUARTER" | "PROFILE" | undefined {
  if (view === "front") {
    return "FRONT";
  }
  if (view === "threeQuarter") {
    return "THREE_QUARTER";
  }
  if (view === "profile") {
    return "PROFILE";
  }
  return undefined;
}

function toDbCandidateView(view: CharacterView): "FRONT" | "THREE_QUARTER" | "PROFILE" {
  if (view === "front") {
    return "FRONT";
  }
  if (view === "threeQuarter") {
    return "THREE_QUARTER";
  }
  return "PROFILE";
}

function normalizeSeedForDb(seed: number): number {
  const MAX_INT4 = 2_147_483_647;
  const MIN_INT4 = -2_147_483_648;
  if (!Number.isFinite(seed)) {
    return 0;
  }
  const rounded = Math.trunc(seed);
  if (rounded > MAX_INT4) {
    return rounded % MAX_INT4;
  }
  if (rounded < MIN_INT4) {
    return MIN_INT4;
  }
  return rounded;
}

async function upsertGenerationSession(input: {
  prisma: PrismaClient;
  generation: CharacterGenerationPayload;
  episodeId: string;
  characterPackId: string;
  promptPresetId: string;
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  candidateCount: number;
  manifestPath: string;
  statusMessage: string;
}): Promise<{ id: string }> {
  const data = {
    episodeId: input.episodeId,
    characterPackId: input.characterPackId,
    mode: toDbGenerationMode(input.generation.mode),
    provider: toDbGenerationProvider(input.generation.provider),
    promptPresetId: input.promptPresetId,
    positivePrompt: input.positivePrompt,
    negativePrompt: input.negativePrompt,
    seed: normalizeSeedForDb(input.seed),
    candidateCount: input.candidateCount,
    referenceAssetId: input.generation.referenceAssetId ?? null,
    viewToGenerate: toDbGenerationView(input.generation.viewToGenerate) ?? null,
    status: "GENERATING" as const,
    statusMessage: input.statusMessage,
    manifestPath: input.manifestPath
  };

  if (input.generation.sessionId) {
    const existing = await input.prisma.characterGenerationSession.findUnique({
      where: { id: input.generation.sessionId },
      select: { id: true, episodeId: true }
    });
    if (existing && existing.episodeId === input.episodeId) {
      await input.prisma.characterGenerationSession.update({
        where: { id: existing.id },
        data
      });
      return { id: existing.id };
    }
  }

  const latest = await input.prisma.characterGenerationSession.findFirst({
    where: {
      episodeId: input.episodeId,
      characterPackId: input.characterPackId
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  });

  if (latest) {
    await input.prisma.characterGenerationSession.update({
      where: { id: latest.id },
      data
    });
    return { id: latest.id };
  }

  const created = await input.prisma.characterGenerationSession.create({
    data
  });

  return { id: created.id };
}

async function upsertSessionCandidates(input: {
  prisma: PrismaClient;
  sessionId: string;
  scored: ScoredCandidate[];
  viewToGenerate?: CharacterView;
}): Promise<void> {
  if (input.scored.length === 0) {
    return;
  }

  if (input.viewToGenerate) {
    await input.prisma.characterGenerationCandidate.deleteMany({
      where: {
        sessionId: input.sessionId,
        view: toDbCandidateView(input.viewToGenerate)
      }
    });
  } else {
    await input.prisma.characterGenerationCandidate.deleteMany({
      where: {
        sessionId: input.sessionId
      }
    });
  }

  await input.prisma.characterGenerationCandidate.createMany({
    data: input.scored.map((entry) => ({
      sessionId: input.sessionId,
      view: toDbCandidateView(entry.candidate.view),
      candidateId: entry.candidate.id,
      candidateIndex: entry.candidate.candidateIndex,
      seed: normalizeSeedForDb(entry.candidate.seed),
      scoreJson: toPrismaJson({
        score: entry.score,
        styleScore: entry.styleScore,
        referenceSimilarity: entry.referenceSimilarity,
        consistencyScore: entry.consistencyScore,
        breakdown: entry.breakdown
      }),
      qcJson: toPrismaJson({
        mime: entry.candidate.mimeType,
        warnings: entry.warnings,
        rejections: entry.rejections,
        analysis: entry.analysis
      }),
      localPath: asString(entry.candidate.providerMeta?.localCandidatePath)
    }))
  });
}

async function markSessionCandidatesPicked(input: {
  prisma: PrismaClient;
  sessionId: string;
  selectedByView: Record<CharacterView, { candidateId: string; assetId: string }>;
}): Promise<void> {
  await input.prisma.characterGenerationCandidate.updateMany({
    where: { sessionId: input.sessionId },
    data: { picked: false }
  });

  for (const selected of Object.values(input.selectedByView)) {
    await input.prisma.characterGenerationCandidate.updateMany({
      where: {
        sessionId: input.sessionId,
        candidateId: selected.candidateId
      },
      data: {
        picked: true,
        assetId: selected.assetId
      }
    });
  }
}

function manifestBasePath(jobDbId: string, manifestPath?: string): string {
  if (manifestPath && manifestPath.trim().length > 0) {
    return path.resolve(manifestPath);
  }

  return path.join(REPO_ROOT, "out", "characters", "generations", jobDbId, "generation_manifest.json");
}

function getComfyUiUrl(): string | undefined {
  const base = process.env.COMFYUI_BASE_URL?.trim();
  if (base && base.length > 0) {
    return base;
  }

  const legacy = process.env.COMFYUI_URL?.trim();
  if (legacy && legacy.length > 0) {
    return legacy;
  }

  return undefined;
}

function hasCandidateSelection(
  value: CharacterGenerationPayload["selectedCandidateIds"]
): value is CharacterGenerationSelection {
  if (!value) {
    return false;
  }

  return (
    typeof value.front === "string" &&
    value.front.trim().length > 0 &&
    typeof value.threeQuarter === "string" &&
    value.threeQuarter.trim().length > 0 &&
    typeof value.profile === "string" &&
    value.profile.trim().length > 0
  );
}

function normalizeSelectedCandidateIds(value: CharacterGenerationSelection): CharacterGenerationSelection {
  return {
    front: value.front.trim(),
    threeQuarter: value.threeQuarter.trim(),
    profile: value.profile.trim()
  };
}

function parseManifestCandidate(manifestPath: string, candidate: unknown): {
  id: string;
  view: CharacterView;
  candidateIndex: number;
  seed: number;
  mimeType: string;
  filePath: string;
  score: number;
  styleScore: number;
  referenceSimilarity: number | null;
  consistencyScore: number | null;
  warnings: string[];
  rejections: string[];
  breakdown?: CandidateScoreBreakdown;
} | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const id = asString(candidate.id).trim();
  const viewRaw = asString(candidate.view).trim();
  const candidateIndex = typeof candidate.candidateIndex === "number" ? candidate.candidateIndex : 0;
  const seed = typeof candidate.seed === "number" ? candidate.seed : 0;
  const mimeType = asString(candidate.mimeType).trim() || "image/png";
  const filePathRaw = asString(candidate.filePath).trim();
  if (!id || !filePathRaw) {
    return null;
  }

  let view: CharacterView;
  if (viewRaw === "front" || viewRaw === "threeQuarter" || viewRaw === "profile") {
    view = viewRaw;
  } else {
    return null;
  }

  const filePath = path.resolve(path.dirname(manifestPath), filePathRaw);
  const score = typeof candidate.score === "number" ? candidate.score : 0.5;
  const styleScore = typeof candidate.styleScore === "number" ? candidate.styleScore : 0.5;
  const referenceSimilarity = typeof candidate.referenceSimilarity === "number" ? candidate.referenceSimilarity : null;
  const consistencyScore = typeof candidate.consistencyScore === "number" ? candidate.consistencyScore : null;
  const warnings = Array.isArray(candidate.warnings)
    ? candidate.warnings.filter((item): item is string => typeof item === "string")
    : [];
  const rejections = Array.isArray(candidate.rejections)
    ? candidate.rejections.filter((item): item is string => typeof item === "string")
    : [];
  const breakdown = isRecord(candidate.breakdown) ? (candidate.breakdown as CandidateScoreBreakdown) : undefined;

  return {
    id,
    view,
    candidateIndex,
    seed,
    mimeType,
    filePath,
    score,
    styleScore,
    referenceSimilarity,
    consistencyScore,
    warnings,
    rejections,
    ...(breakdown ? { breakdown } : {})
  };
}

async function resolveFrontReferenceFromManifest(manifestPath: string): Promise<{
  referenceImageBase64: string;
  referenceMimeType: string;
} | undefined> {
  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    return undefined;
  }

  if (!isRecord(parsedRaw)) {
    return undefined;
  }

  const manifestCandidates = Array.isArray(parsedRaw.candidates) ? parsedRaw.candidates : [];
  const parsedCandidates = manifestCandidates
    .map((candidate) => parseManifestCandidate(manifestPath, candidate))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .filter((candidate) => candidate.view === "front")
    .sort((a, b) => b.score - a.score);

  const selectedByView = isRecord(parsedRaw.selectedByView) ? parsedRaw.selectedByView : null;
  const selectedFrontCandidateId =
    selectedByView &&
    isRecord(selectedByView.front) &&
    typeof selectedByView.front.candidateId === "string" &&
    selectedByView.front.candidateId.trim().length > 0
      ? selectedByView.front.candidateId.trim()
      : null;

  const selected = selectedFrontCandidateId
    ? parsedCandidates.find((candidate) => candidate.id === selectedFrontCandidateId)
    : null;
  const chosen = selected ?? parsedCandidates[0];
  if (!chosen) {
    return undefined;
  }

  if (!fs.existsSync(chosen.filePath)) {
    return undefined;
  }

  const data = fs.readFileSync(chosen.filePath);
  return {
    referenceImageBase64: data.toString("base64"),
    referenceMimeType: chosen.mimeType
  };
}

async function resolveFrontReferenceFromSession(
  prisma: PrismaClient,
  sessionId: string,
  config: ContinuityReferenceConfig
): Promise<{
  referenceImageBase64: string;
  referenceMimeType: string;
  picked: boolean;
  score: number | null;
  rejectionCount: number;
  updatedAtMs: number;
} | undefined> {
  const rows = await prisma.characterGenerationCandidate.findMany({
    where: {
      sessionId,
      view: "FRONT",
      ...(config.requirePicked ? { picked: true } : {})
    },
    orderBy: [{ picked: "desc" }, { updatedAt: "desc" }],
    take: config.candidateTake,
    select: {
      localPath: true,
      picked: true,
      updatedAt: true,
      scoreJson: true,
      qcJson: true
    }
  });

  type RankedReference = {
    referenceImageBase64: string;
    referenceMimeType: string;
    picked: boolean;
    score: number | null;
    rankScore: number;
    rejectionCount: number;
    updatedAtMs: number;
  };
  let best: RankedReference | null = null;

  for (const row of rows) {
    const localPath = typeof row.localPath === "string" ? row.localPath.trim() : "";
    if (!localPath || !fs.existsSync(localPath)) {
      continue;
    }

    const score = extractCandidateScore(row.scoreJson);
    if (score === null && config.requireScore) {
      continue;
    }
    if (score !== null && score < config.minScore) {
      continue;
    }

    const qc = isRecord(row.qcJson) ? row.qcJson : null;
    const rejectionCount = extractCandidateRejectionCount(qc);
    if (rejectionCount > config.maxRejections) {
      continue;
    }

    const mimeType =
      qc && typeof qc.mime === "string" && qc.mime.trim().length > 0
        ? qc.mime.trim()
        : "image/png";
    let data: Buffer;
    try {
      data = fs.readFileSync(localPath);
    } catch {
      continue;
    }
    const candidate: RankedReference = {
      referenceImageBase64: data.toString("base64"),
      referenceMimeType: mimeType,
      picked: row.picked,
      score,
      rankScore: score ?? -1,
      rejectionCount,
      updatedAtMs: row.updatedAt.getTime()
    };
    if (!best) {
      best = candidate;
      continue;
    }
    if (isBetterContinuityCandidate(candidate, best)) {
      best = candidate;
    }
  }

  if (!best) {
    return undefined;
  }
  return {
    referenceImageBase64: best.referenceImageBase64,
    referenceMimeType: best.referenceMimeType,
    picked: best.picked,
    score: best.score,
    rejectionCount: best.rejectionCount,
    updatedAtMs: best.updatedAtMs
  };
}

function isBetterContinuityCandidate(
  next: { picked: boolean; rankScore: number; rejectionCount: number; updatedAtMs: number },
  current: { picked: boolean; rankScore: number; rejectionCount: number; updatedAtMs: number }
): boolean {
  if (next.picked !== current.picked) {
    return next.picked;
  }
  if (next.rankScore !== current.rankScore) {
    return next.rankScore > current.rankScore;
  }
  if (next.rejectionCount !== current.rejectionCount) {
    return next.rejectionCount < current.rejectionCount;
  }
  return next.updatedAtMs > current.updatedAtMs;
}

async function resolveAutoContinuityReference(input: {
  prisma: PrismaClient;
  episodeId: string;
  channelId: string;
  characterPackId: string;
  currentSessionId?: string;
  config: ContinuityReferenceConfig;
}): Promise<{
  match?:
    | {
        sessionId: string;
        referenceImageBase64: string;
        referenceMimeType: string;
        sourcePool: "preferred" | "fallback";
        candidatePicked: boolean;
        candidateScore: number | null;
        candidateRejectionCount: number;
        candidateUpdatedAt: string;
      }
    | undefined;
  diagnostics: {
    cutoffUpdatedAt: string;
    queuedSessionCount: number;
    searchedSessionCount: number;
    searchedSessionIdsPreview: string[];
    preferredPoolCount: number;
    fallbackPoolCount: number;
    reason?: "matched" | "no_recent_ready_session" | "no_eligible_front_candidate";
  };
}> {
  const cutoffDate = new Date(Date.now() - input.config.maxSessionAgeHours * 60 * 60 * 1000);
  const whereBase: Prisma.CharacterGenerationSessionWhereInput = {
    status: "READY",
    NOT: {
      episodeId: input.episodeId
    },
    updatedAt: {
      gte: cutoffDate
    },
    ...(input.currentSessionId ? { id: { not: input.currentSessionId } } : {})
  };

  const preferred = await input.prisma.characterGenerationSession.findMany({
    where: {
      ...whereBase,
      characterPackId: input.characterPackId
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true
    },
    take: input.config.preferredSessionTake
  });

  const fallback = await input.prisma.characterGenerationSession.findMany({
    where: {
      ...whereBase,
      episode: {
        is: {
          channelId: input.channelId
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true
    },
    take: input.config.fallbackSessionTake
  });

  const queue = [...preferred.map((row) => row.id), ...fallback.map((row) => row.id)];
  const preferredSet = new Set(preferred.map((row) => row.id));
  const visited = new Set<string>();
  const visitedOrder: string[] = [];
  for (const sessionId of queue) {
    if (visited.has(sessionId)) {
      continue;
    }
    visited.add(sessionId);
    visitedOrder.push(sessionId);
    const resolved = await resolveFrontReferenceFromSession(input.prisma, sessionId, input.config);
    if (resolved) {
      return {
        match: {
          sessionId,
          referenceImageBase64: resolved.referenceImageBase64,
          referenceMimeType: resolved.referenceMimeType,
          sourcePool: preferredSet.has(sessionId) ? "preferred" : "fallback",
          candidatePicked: resolved.picked,
          candidateScore: resolved.score,
          candidateRejectionCount: resolved.rejectionCount,
          candidateUpdatedAt: new Date(resolved.updatedAtMs).toISOString()
        },
        diagnostics: {
          cutoffUpdatedAt: cutoffDate.toISOString(),
          queuedSessionCount: queue.length,
          searchedSessionCount: visited.size,
          searchedSessionIdsPreview: visitedOrder.slice(0, 5),
          preferredPoolCount: preferred.length,
          fallbackPoolCount: fallback.length,
          reason: "matched"
        }
      };
    }
  }

  const reason =
    queue.length === 0
      ? ("no_recent_ready_session" as const)
      : ("no_eligible_front_candidate" as const);
  return {
    diagnostics: {
      cutoffUpdatedAt: cutoffDate.toISOString(),
      queuedSessionCount: queue.length,
      searchedSessionCount: visited.size,
      searchedSessionIdsPreview: visitedOrder.slice(0, 5),
      preferredPoolCount: preferred.length,
      fallbackPoolCount: fallback.length,
      reason
    }
  };
}

function extractCandidateScore(value: unknown): number | null {
  if (!isRecord(value)) {
    return null;
  }
  const raw = value.score;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  return clamp01(raw);
}

function extractCandidateRejectionCount(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }
  const raw = value.rejections;
  if (!Array.isArray(raw)) {
    return 0;
  }
  return raw.filter((item) => typeof item === "string" && item.trim().length > 0).length;
}

function parseManifestContinuity(value: unknown): GenerationManifest["reference"]["continuity"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const enabled = typeof value.enabled === "boolean" ? value.enabled : undefined;
  const attempted = typeof value.attempted === "boolean" ? value.attempted : undefined;
  const applied = typeof value.applied === "boolean" ? value.applied : undefined;
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (enabled === undefined || attempted === undefined || applied === undefined || reason.length === 0) {
    return undefined;
  }
  const asOptionalNumber = (input: unknown): number | undefined =>
    typeof input === "number" && Number.isFinite(input) ? input : undefined;
  const asOptionalNullableNumber = (input: unknown): number | null | undefined =>
    input === null ? null : typeof input === "number" && Number.isFinite(input) ? input : undefined;
  const asOptionalNullableString = (input: unknown): string | null | undefined =>
    input === null ? null : typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
  const asOptionalString = (input: unknown): string | undefined =>
    typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
  const asOptionalStringArray = (input: unknown): string[] | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }
    const out = input
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    return out.length > 0 ? out : undefined;
  };

  const policyRaw = isRecord(value.policy) ? value.policy : undefined;
  const parsedPolicy =
    policyRaw &&
    typeof policyRaw.maxSessionAgeHours === "number" &&
    Number.isFinite(policyRaw.maxSessionAgeHours) &&
    typeof policyRaw.minScore === "number" &&
    Number.isFinite(policyRaw.minScore) &&
    typeof policyRaw.maxRejections === "number" &&
    Number.isFinite(policyRaw.maxRejections) &&
    typeof policyRaw.requirePicked === "boolean" &&
    typeof policyRaw.requireScore === "boolean" &&
    typeof policyRaw.candidateTake === "number" &&
    Number.isFinite(policyRaw.candidateTake) &&
    typeof policyRaw.preferredSessionTake === "number" &&
    Number.isFinite(policyRaw.preferredSessionTake) &&
    typeof policyRaw.fallbackSessionTake === "number" &&
    Number.isFinite(policyRaw.fallbackSessionTake)
      ? {
          maxSessionAgeHours: policyRaw.maxSessionAgeHours,
          minScore: policyRaw.minScore,
          maxRejections: policyRaw.maxRejections,
          requirePicked: policyRaw.requirePicked,
          requireScore: policyRaw.requireScore,
          candidateTake: policyRaw.candidateTake,
          preferredSessionTake: policyRaw.preferredSessionTake,
          fallbackSessionTake: policyRaw.fallbackSessionTake,
          requestOverride:
            typeof policyRaw.requestOverride === "boolean" || policyRaw.requestOverride === null
              ? policyRaw.requestOverride
              : null
        }
      : undefined;

  return {
    enabled,
    attempted,
    applied,
    reason,
    ...(asOptionalString(value.attemptedSourceSessionId)
      ? { attemptedSourceSessionId: asOptionalString(value.attemptedSourceSessionId) }
      : {}),
    ...(asOptionalString(value.cutoffUpdatedAt) ? { cutoffUpdatedAt: asOptionalString(value.cutoffUpdatedAt) } : {}),
    ...(asOptionalNumber(value.queuedSessionCount) !== undefined
      ? { queuedSessionCount: asOptionalNumber(value.queuedSessionCount) }
      : {}),
    ...(asOptionalNumber(value.searchedSessionCount) !== undefined
      ? { searchedSessionCount: asOptionalNumber(value.searchedSessionCount) }
      : {}),
    ...(asOptionalStringArray(value.searchedSessionIdsPreview)
      ? { searchedSessionIdsPreview: asOptionalStringArray(value.searchedSessionIdsPreview) }
      : {}),
    ...(asOptionalNumber(value.preferredPoolCount) !== undefined
      ? { preferredPoolCount: asOptionalNumber(value.preferredPoolCount) }
      : {}),
    ...(asOptionalNumber(value.fallbackPoolCount) !== undefined
      ? { fallbackPoolCount: asOptionalNumber(value.fallbackPoolCount) }
      : {}),
    ...(value.sourcePool === "preferred" || value.sourcePool === "fallback" ? { sourcePool: value.sourcePool } : {}),
    ...(typeof value.candidatePicked === "boolean" ? { candidatePicked: value.candidatePicked } : {}),
    ...(asOptionalNullableNumber(value.candidateScore) !== undefined
      ? { candidateScore: asOptionalNullableNumber(value.candidateScore) }
      : {}),
    ...(asOptionalNullableNumber(value.candidateRejectionCount) !== undefined
      ? { candidateRejectionCount: asOptionalNullableNumber(value.candidateRejectionCount) }
      : {}),
    ...(asOptionalNullableString(value.candidateUpdatedAt) !== undefined
      ? { candidateUpdatedAt: asOptionalNullableString(value.candidateUpdatedAt) }
      : {}),
    ...(parsedPolicy ? { policy: parsedPolicy } : {})
  };
}

function formatContinuityDescriptor(
  continuity: GenerationManifest["reference"]["continuity"] | undefined
): string | null {
  if (!continuity?.reason) {
    return null;
  }
  const parts = [`Continuity=${continuity.reason}`];
  if (continuity.attemptedSourceSessionId) {
    parts.push(`source=${continuity.attemptedSourceSessionId}`);
  }
  if (continuity.sourcePool) {
    parts.push(`pool=${continuity.sourcePool}`);
  }
  return parts.join(" ");
}

function formatContinuitySentence(
  continuity: GenerationManifest["reference"]["continuity"] | undefined
): string {
  const descriptor = formatContinuityDescriptor(continuity);
  if (!descriptor) {
    return "";
  }
  return ` ${descriptor}.`;
}

async function persistSelectedCandidates(input: {
  prisma: PrismaClient;
  sessionId?: string;
  episodeId: string;
  episodeChannelId: string;
  jobDbId: string;
  character: CharacterPackJobPayload;
  selectedByView: Record<CharacterView, ScoredCandidate>;
  manifest: GenerationManifest;
  manifestPath: string;
  maxAttempts: number;
  retryBackoffMs: number;
  helpers: GenerationHelpers;
  source: "auto" | "hitl";
  providerName: string;
  workflowHash: string;
}): Promise<void> {
  const {
    prisma,
    sessionId,
    episodeId,
    episodeChannelId,
    jobDbId,
    character,
    selectedByView,
    manifest,
    manifestPath,
    maxAttempts,
    retryBackoffMs,
    helpers,
    source,
    providerName,
    workflowHash
  } = input;

  const selectedAssets = new Map<CharacterView, { assetId: string; originalKey: string; ingestJobId: string }>();

  for (const [view, scoredCandidate] of Object.entries(selectedByView) as Array<[CharacterView, ScoredCandidate]>) {
    const candidate = scoredCandidate.candidate;
    const extension = candidate.mimeType.includes("svg") ? "svg" : "png";
    const originalKey = makeStorageKey(
      `characters/generated/${episodeId}/${jobDbId}`,
      `${view}_candidate_${candidate.candidateIndex}.${extension}`
    );

    const putResult = await putAssetObject(originalKey, candidate.data, candidate.mimeType);

    const assetData = {
      channelId: episodeChannelId,
      type: "IMAGE" as const,
      assetType: "CHARACTER_VIEW" as const,
      status: "QUEUED" as const,
      mime: candidate.mimeType,
      sizeBytes: BigInt(candidate.data.byteLength),
      storageKey: originalKey,
      originalKey,
      contentType: candidate.mimeType,
      bytes: BigInt(candidate.data.byteLength),
      sha256: null,
      qcJson: toPrismaJson({
        ok: true,
        stage: source === "hitl" ? "generated_selected" : "generated",
        provider: candidate.provider,
        candidateId: candidate.id,
        score: scoredCandidate.score,
        scoreBreakdown: scoredCandidate.breakdown,
        warnings: scoredCandidate.warnings,
        rejections: scoredCandidate.rejections,
        minioWarning: putResult.minioError ?? null
      })
    };

    let asset = await prisma.asset.findFirst({
      where: {
        storageKey: originalKey
      }
    });
    if (!asset) {
      asset = await prisma.asset.create({
        data: assetData
      });
    }

    const ingestPayload: AssetIngestJobPayload = {
      assetId: asset.id,
      assetType: "character_view",
      originalKey,
      mime: candidate.mimeType
    };

    const options: JobsOptions = {
      jobId: `asset-ingest-${asset.id}`,
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 1000
      },
      removeOnComplete: false,
      removeOnFail: false
    };

    const ingestQueued = await queue.add(
      ASSET_INGEST_JOB_NAME,
      ingestPayload as unknown as EpisodeJobPayload,
      options
    );
    const ingestJobId = String(ingestQueued.id);

    selectedAssets.set(view, {
      assetId: asset.id,
      originalKey,
      ingestJobId
    });

    manifest.selectedByView[view] = {
      candidateId: candidate.id,
      assetId: asset.id,
      assetIngestJobId: ingestJobId
    };
  }

  await waitForAssetsReady(prisma, [...selectedAssets.values()].map((row) => row.assetId));

  const assetIds: CharacterAssetSelection = {
    front: selectedAssets.get("front")!.assetId,
    threeQuarter: selectedAssets.get("threeQuarter")!.assetId,
    profile: selectedAssets.get("profile")!.assetId
  };

  const buildJobId = character.buildJobDbId;
  if (!buildJobId) {
    throw new Error("payload.character.buildJobDbId is required for generation pipeline");
  }

  const buildPayload: EpisodeJobPayload = {
    jobDbId: buildJobId,
    episodeId,
    schemaChecks: [],
    character: {
      characterPackId: character.characterPackId,
      version: character.version,
      buildJobDbId: buildJobId,
      previewJobDbId: character.previewJobDbId,
      assetIds,
      generation: {
        ...(sessionId ? { sessionId } : {}),
        mode: manifest.mode === "reference" ? "reference" : "new",
        provider:
          providerName === "comfyui" ? "comfyui" : providerName === "remoteApi" ? "remoteApi" : "mock",
        promptPreset: manifest.promptPreset,
        positivePrompt: manifest.positivePrompt,
        negativePrompt: manifest.negativePrompt,
        seed: selectedByView.front.candidate.seed,
        candidateCount: manifest.candidates.length,
        manifestPath,
        selectedCandidateIds: {
          front: selectedByView.front.candidate.id,
          threeQuarter: selectedByView.threeQuarter.candidate.id,
          profile: selectedByView.profile.candidate.id
        }
      }
    }
  };

  await helpers.logJob(buildJobId, "info", "Transition -> QUEUED", {
    source: "worker:generate-character-assets",
    parentJobDbId: jobDbId,
    assetIds
  });

  const buildBull = await helpers.addEpisodeJob(
    BUILD_CHARACTER_PACK_JOB_NAME,
    buildPayload,
    maxAttempts,
    retryBackoffMs
  );
  const buildBullmqJobId = buildBull.id === undefined ? buildJobId : String(buildBull.id);

  await prisma.job.update({
    where: {
      id: buildJobId
    },
    data: {
      status: "QUEUED",
      bullmqJobId: buildBullmqJobId,
      lastError: null,
      finishedAt: null
    }
  });

  await helpers.logJob(buildJobId, "info", "Transition -> ENQUEUED", {
    source: "worker:generate-character-assets",
    bullmqJobId: buildBullmqJobId,
    assetIds
  });

  const hashedManifest = withManifestHashes({
    ...manifest,
    schemaVersion: "1.0"
  });
  fs.writeFileSync(manifestPath, `${JSON.stringify(hashedManifest, null, 2)}\n`, "utf8");

  await helpers.logJob(
    jobDbId,
    "info",
    source === "hitl" ? "Character assets selected from HITL and queued" : "Character assets generated and auto-selected",
    {
      provider: providerName,
      workflowHash,
      inputHash: hashedManifest.inputHash,
      manifestHash: hashedManifest.manifestHash,
      continuitySummary: hashedManifest.reference.continuity ?? null,
      continuityDescriptor: formatContinuityDescriptor(hashedManifest.reference.continuity),
      continuityReason: hashedManifest.reference.continuity?.reason ?? null,
      continuityApplied: hashedManifest.reference.continuity?.applied ?? null,
      continuityAttempted: hashedManifest.reference.continuity?.attempted ?? null,
      continuitySourceSessionId: hashedManifest.reference.continuity?.attemptedSourceSessionId ?? null,
      continuitySourcePool: hashedManifest.reference.continuity?.sourcePool ?? null,
      manifestPath,
      selectedAssetIds: assetIds,
      buildJobDbId: buildJobId,
      buildBullmqJobId
    }
  );

  if (sessionId) {
    await markSessionCandidatesPicked({
      prisma,
      sessionId,
      selectedByView: {
        front: {
          candidateId: selectedByView.front.candidate.id,
          assetId: assetIds.front
        },
        threeQuarter: {
          candidateId: selectedByView.threeQuarter.candidate.id,
          assetId: assetIds.threeQuarter
        },
        profile: {
          candidateId: selectedByView.profile.candidate.id,
          assetId: assetIds.profile
        }
      }
    });

    await prisma.characterGenerationSession.update({
      where: { id: sessionId },
      data: {
        status: "READY",
        statusMessage:
          source === "hitl"
            ? `HITL selection applied and build queued.${formatContinuitySentence(manifest.reference.continuity)}`
            : `Auto-selected and build queued.${formatContinuitySentence(manifest.reference.continuity)}`
      }
    });
  }
}

export async function handleGenerateCharacterAssetsJob(input: {
  prisma: PrismaClient;
  payload: EpisodeJobPayload;
  jobDbId: string;
  maxAttempts: number;
  retryBackoffMs: number;
  helpers: GenerationHelpers;
}): Promise<void> {
  const { prisma, payload, jobDbId, maxAttempts, retryBackoffMs, helpers } = input;
  const character = requireCharacter(payload);
  const continuityAutoOverride = resolveAutoContinuityOverride(character.generation);
  const generation = normalizeGenerationConfig(character.generation);
  let sessionId: string | undefined;

  try {

  await helpers.setEpisodeStatus(payload.episodeId, "GENERATING");

  const episode = await prisma.episode.findUnique({
    where: { id: payload.episodeId },
    select: {
      id: true,
      topic: true,
      channelId: true
    }
  });

  if (!episode) {
    throw new Error(`Episode not found: ${payload.episodeId}`);
  }

  const channelBible = await prisma.channelBible.findFirst({
    where: {
      channelId: episode.channelId,
      isActive: true
    },
    orderBy: {
      version: "desc"
    },
    select: {
      id: true,
      json: true
    }
  });

  const styleHints = deriveStyleHintsFromChannelBible(channelBible?.json);
  const promptBundle = buildCharacterPrompt({
    mode: generation.mode,
    presetId: generation.promptPreset,
    positivePrompt: generation.positivePrompt ?? episode.topic,
    negativePrompt: generation.negativePrompt,
    styleHints
  });
  const continuityConfig = readContinuityReferenceConfig();
  const continuityAutoEnabled = continuityAutoOverride ?? shouldAutoContinuityReference();
  const continuityPolicy = {
    ...continuityConfig,
    requestOverride: continuityAutoOverride ?? null
  };

  let referenceAnalysis: ImageAnalysis | undefined;
  let referenceImageBase64: string | undefined;
  let referenceMimeType: string | undefined;
  let continuityReferenceSessionId: string | null = null;
  let continuitySnapshot: GenerationManifest["reference"]["continuity"] | undefined;
  if (generation.mode === "reference") {
    continuitySnapshot = {
      enabled: false,
      attempted: false,
      applied: false,
      reason: "reference_mode"
    };
    if (!generation.referenceAssetId) {
      throw new Error("reference mode requires generation.referenceAssetId");
    }

    const referenceAsset = await prisma.asset.findUnique({
      where: { id: generation.referenceAssetId },
      select: {
        id: true,
        channelId: true,
        status: true,
        normalizedKey1024: true,
        normalizedKey2048: true,
        originalKey: true,
        storageKey: true,
        mime: true
      }
    });

    if (!referenceAsset) {
      throw new Error(`reference asset not found: ${generation.referenceAssetId}`);
    }

    if (referenceAsset.channelId !== episode.channelId) {
      throw new Error("reference asset channel mismatch");
    }

    if (referenceAsset.status !== "READY") {
      throw new Error("reference asset must be READY");
    }

    const referenceBuffer = await getAssetObject(normalizeReferenceAssetStorageKey(referenceAsset));
    referenceAnalysis = await analyzeImage(referenceBuffer);
    referenceImageBase64 = referenceBuffer.toString("base64");
    referenceMimeType = referenceAsset.mime ?? "image/png";
  }

  const earlyLimits = readGenerationLimits();
  const earlyViews = generation.viewToGenerate ? [generation.viewToGenerate] : CHARACTER_VIEWS;
  const earlyClamped = clampGenerationRequest(generation, earlyViews.length, earlyLimits);
  const manifestPath = manifestBasePath(jobDbId, generation.manifestPath);
  const session = await upsertGenerationSession({
    prisma,
    generation,
    episodeId: payload.episodeId,
    characterPackId: character.characterPackId,
    promptPresetId: promptBundle.presetId,
    positivePrompt: promptBundle.positivePrompt,
    negativePrompt: promptBundle.negativePrompt,
    seed: generation.seed ?? 101,
    candidateCount: earlyClamped.candidateCount,
    manifestPath,
    statusMessage: generation.viewToGenerate
      ? `Generating candidates for view: ${generation.viewToGenerate}`
      : "Generating candidates for all views."
  });
  sessionId = session.id;
  const selectedCandidateIds = hasCandidateSelection(generation.selectedCandidateIds)
    ? normalizeSelectedCandidateIds(generation.selectedCandidateIds)
    : undefined;

  if (
    !selectedCandidateIds &&
    generation.mode === "new" &&
    !referenceImageBase64 &&
    continuityAutoEnabled
  ) {
    const continuity = await resolveAutoContinuityReference({
      prisma,
      episodeId: payload.episodeId,
      channelId: episode.channelId,
      characterPackId: character.characterPackId,
      currentSessionId: sessionId,
      config: continuityConfig
    });
    if (continuity.match) {
      try {
        referenceImageBase64 = continuity.match.referenceImageBase64;
        referenceMimeType = continuity.match.referenceMimeType;
        continuityReferenceSessionId = continuity.match.sessionId;
        const continuityBuffer = Buffer.from(continuity.match.referenceImageBase64, "base64");
        referenceAnalysis = await analyzeImage(continuityBuffer);
        await helpers.logJob(jobDbId, "info", "Auto continuity reference applied", {
          sourceSessionId: continuity.match.sessionId,
          characterPackId: character.characterPackId,
          policy: continuityPolicy,
          diagnostics: {
            ...continuity.diagnostics,
            sourcePool: continuity.match.sourcePool,
            candidatePicked: continuity.match.candidatePicked,
            candidateScore: continuity.match.candidateScore,
            candidateRejectionCount: continuity.match.candidateRejectionCount,
            candidateUpdatedAt: continuity.match.candidateUpdatedAt
          }
        });
        continuitySnapshot = {
          enabled: true,
          attempted: true,
          applied: true,
          reason: "matched",
          attemptedSourceSessionId: continuity.match.sessionId,
          cutoffUpdatedAt: continuity.diagnostics.cutoffUpdatedAt,
          queuedSessionCount: continuity.diagnostics.queuedSessionCount,
          searchedSessionCount: continuity.diagnostics.searchedSessionCount,
          searchedSessionIdsPreview: continuity.diagnostics.searchedSessionIdsPreview,
          preferredPoolCount: continuity.diagnostics.preferredPoolCount,
          fallbackPoolCount: continuity.diagnostics.fallbackPoolCount,
          sourcePool: continuity.match.sourcePool,
          candidatePicked: continuity.match.candidatePicked,
          candidateScore: continuity.match.candidateScore,
          candidateRejectionCount: continuity.match.candidateRejectionCount,
          candidateUpdatedAt: continuity.match.candidateUpdatedAt,
          policy: continuityPolicy
        };
      } catch (error) {
        referenceImageBase64 = undefined;
        referenceMimeType = undefined;
        continuityReferenceSessionId = null;
        referenceAnalysis = undefined;
        await helpers.logJob(jobDbId, "warn", "Auto continuity reference ignored due to invalid source", {
          characterPackId: character.characterPackId,
          sourceSessionId: continuity.match.sessionId,
          policy: continuityPolicy,
          diagnostics: continuity.diagnostics,
          error: errorMessage(error)
        });
        continuitySnapshot = {
          enabled: true,
          attempted: true,
          applied: false,
          reason: "invalid_source",
          attemptedSourceSessionId: continuity.match.sessionId,
          cutoffUpdatedAt: continuity.diagnostics.cutoffUpdatedAt,
          queuedSessionCount: continuity.diagnostics.queuedSessionCount,
          searchedSessionCount: continuity.diagnostics.searchedSessionCount,
          searchedSessionIdsPreview: continuity.diagnostics.searchedSessionIdsPreview,
          preferredPoolCount: continuity.diagnostics.preferredPoolCount,
          fallbackPoolCount: continuity.diagnostics.fallbackPoolCount,
          policy: continuityPolicy
        };
      }
    } else {
      await helpers.logJob(jobDbId, "info", "Auto continuity reference skipped", {
        characterPackId: character.characterPackId,
        policy: continuityPolicy,
        diagnostics: continuity.diagnostics
      });
      continuitySnapshot = {
        enabled: true,
        attempted: true,
        applied: false,
        reason: continuity.diagnostics.reason ?? "skipped",
        cutoffUpdatedAt: continuity.diagnostics.cutoffUpdatedAt,
        queuedSessionCount: continuity.diagnostics.queuedSessionCount,
        searchedSessionCount: continuity.diagnostics.searchedSessionCount,
        searchedSessionIdsPreview: continuity.diagnostics.searchedSessionIdsPreview,
        preferredPoolCount: continuity.diagnostics.preferredPoolCount,
        fallbackPoolCount: continuity.diagnostics.fallbackPoolCount,
        policy: continuityPolicy
      };
    }
  } else if (generation.mode === "new") {
    const hasHitlSelection = Boolean(selectedCandidateIds);
    const hasReferenceAlready = Boolean(referenceImageBase64);
    let reason = "not_attempted";
    if (!continuityAutoEnabled) {
      reason = continuityAutoOverride === false ? "disabled_by_request" : "disabled_by_env";
    } else if (hasHitlSelection) {
      reason = "hitl_selection_present";
    } else if (hasReferenceAlready) {
      reason = "reference_already_present";
    }
    continuitySnapshot = {
      enabled: continuityAutoEnabled,
      attempted: false,
      applied: false,
      reason,
      policy: continuityPolicy
    };
    await helpers.logJob(jobDbId, "info", "Auto continuity reference not attempted", {
      characterPackId: character.characterPackId,
      reason,
      policy: continuityPolicy
    });
  }

  if (selectedCandidateIds) {
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`HITL manifest not found: ${manifestPath}`);
    }

    const parsedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
    if (!isRecord(parsedManifest)) {
      throw new Error("Invalid generation manifest format");
    }

    const manifestCandidates = Array.isArray(parsedManifest.candidates) ? parsedManifest.candidates : [];
    const parsedCandidates = manifestCandidates
      .map((candidate) => parseManifestCandidate(manifestPath, candidate))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

    const byId = new Map(parsedCandidates.map((candidate) => [candidate.id, candidate]));
    const selectedEntries = {
      front: byId.get(selectedCandidateIds.front),
      threeQuarter: byId.get(selectedCandidateIds.threeQuarter),
      profile: byId.get(selectedCandidateIds.profile)
    };

    if (!selectedEntries.front || selectedEntries.front.view !== "front") {
      throw new Error(`Invalid HITL selection for front: ${selectedCandidateIds.front}`);
    }
    if (!selectedEntries.threeQuarter || selectedEntries.threeQuarter.view !== "threeQuarter") {
      throw new Error(`Invalid HITL selection for threeQuarter: ${selectedCandidateIds.threeQuarter}`);
    }
    if (!selectedEntries.profile || selectedEntries.profile.view !== "profile") {
      throw new Error(`Invalid HITL selection for profile: ${selectedCandidateIds.profile}`);
    }

    const toScored = async (entry: (typeof selectedEntries)[keyof typeof selectedEntries]): Promise<ScoredCandidate> => {
      if (!entry) {
        throw new Error("Missing selected candidate");
      }

      if (!fs.existsSync(entry.filePath)) {
        throw new Error(`Selected candidate file missing: ${entry.filePath}`);
      }

      const data = fs.readFileSync(entry.filePath);
      const analysis = await analyzeImage(data);
      const manifestProvider = asString(parsedManifest.provider).trim();
      const candidate: CharacterGenerationCandidate = {
        id: entry.id,
        view: entry.view,
        candidateIndex: entry.candidateIndex,
        seed: entry.seed,
        provider:
          manifestProvider === "comfyui"
            ? "comfyui"
            : manifestProvider === "remoteApi"
              ? "remoteApi"
              : "mock",
        prompt: asString(parsedManifest.positivePrompt),
        negativePrompt: asString(parsedManifest.negativePrompt),
        mimeType: entry.mimeType,
        data,
        providerMeta: {
          localCandidatePath: entry.filePath
        }
      };

      return {
        candidate,
        analysis,
        score: clamp01(entry.score),
        styleScore: clamp01(entry.styleScore),
        referenceSimilarity: entry.referenceSimilarity,
        consistencyScore: entry.consistencyScore,
        warnings: entry.warnings,
        rejections: entry.rejections,
        breakdown:
          entry.breakdown ??
          {
            alphaScore: scoreAlphaCoverage(analysis),
            occupancyScore: scoreBBoxOccupancy(analysis),
            sharpnessScore: scoreSharpness(analysis),
            noiseScore: scoreNoise(analysis),
            watermarkScore: scoreWatermarkSafety(analysis),
            resolutionScore: scoreResolutionQuality(analysis),
            referenceScore: entry.referenceSimilarity ?? 0.5,
            styleScore: clamp01(entry.styleScore),
            qualityScore: clamp01(
              scoreAlphaCoverage(analysis) * 0.16 +
                scoreBBoxOccupancy(analysis) * 0.18 +
                scoreSharpness(analysis) * 0.2 +
                scoreNoise(analysis) * 0.12 +
                scoreWatermarkSafety(analysis) * 0.2 +
                scoreResolutionQuality(analysis) * 0.14
            ),
            consistencyScore: entry.consistencyScore,
            generationRound: 0
          }
      };
    };

    const scoredFront = await toScored(selectedEntries.front);
    const scoredThreeQuarter = await toScored(selectedEntries.threeQuarter);
    const scoredProfile = await toScored(selectedEntries.profile);
    const selectedByView: Record<CharacterView, ScoredCandidate> = {
      front: scoredFront,
      threeQuarter: scoredThreeQuarter,
      profile: scoredProfile
    };

    const guardrails = Array.isArray(parsedManifest.guardrails)
      ? parsedManifest.guardrails.filter((item): item is string => typeof item === "string")
      : promptBundle.guardrails;
    const providerRequestedRaw = asString(parsedManifest.providerRequested).trim();
    const providerWarningRaw = asString(parsedManifest.providerWarning).trim();
    const parsedReference = isRecord(parsedManifest.reference) ? parsedManifest.reference : {};
    const parsedContinuity = parseManifestContinuity(parsedReference.continuity);

    const manifest = withManifestHashes({
      schemaVersion: "1.0",
      status: "HITL_SELECTED",
      sessionId,
      episodeId: payload.episodeId,
      characterPackId: character.characterPackId,
      provider: asString(parsedManifest.provider).trim() || "mock",
      providerRequested: providerRequestedRaw.length > 0 ? providerRequestedRaw : null,
      providerWarning: providerWarningRaw.length > 0 ? providerWarningRaw : null,
      workflowHash: asString(parsedManifest.workflowHash).trim() || "hitl-selection",
      generatedAt: asString(parsedManifest.generatedAt).trim() || new Date().toISOString(),
      mode: asString(parsedManifest.mode).trim() || generation.mode,
      promptPreset: asString(parsedManifest.promptPreset).trim() || promptBundle.presetId,
      positivePrompt: asString(parsedManifest.positivePrompt).trim() || promptBundle.positivePrompt,
      negativePrompt: asString(parsedManifest.negativePrompt).trim() || promptBundle.negativePrompt,
      guardrails,
      reference: {
        assetId:
          typeof parsedReference.assetId === "string"
            ? parsedReference.assetId
            : generation.referenceAssetId ?? null,
        sourceSessionId:
          typeof parsedReference.sourceSessionId === "string" && parsedReference.sourceSessionId.trim().length > 0
            ? parsedReference.sourceSessionId
            : continuityReferenceSessionId,
        phash: typeof parsedReference.phash === "string" ? parsedReference.phash : null,
        palette: Array.isArray(parsedReference.palette)
          ? (parsedReference.palette.filter(
              (item): item is [number, number, number] =>
                Array.isArray(item) &&
                item.length === 3 &&
                item.every((value) => typeof value === "number")
            ) as Array<[number, number, number]>)
          : null,
        continuity: parsedContinuity ?? continuitySnapshot
      },
      candidates: parsedCandidates.map((entry) => ({
        id: entry.id,
        view: entry.view,
        candidateIndex: entry.candidateIndex,
        seed: entry.seed,
        mimeType: entry.mimeType,
        filePath: entry.filePath,
        score: Number(entry.score.toFixed(4)),
        styleScore: Number(entry.styleScore.toFixed(4)),
        referenceSimilarity: entry.referenceSimilarity === null ? null : Number(entry.referenceSimilarity.toFixed(4)),
        consistencyScore: entry.consistencyScore === null ? null : Number(entry.consistencyScore.toFixed(4)),
        warnings: entry.warnings,
        rejections: entry.rejections,
        ...(entry.breakdown ? { breakdown: entry.breakdown } : {})
      })),
      selectedByView: {}
    });

    await persistSelectedCandidates({
      prisma,
      sessionId,
      episodeId: payload.episodeId,
      episodeChannelId: episode.channelId,
      jobDbId,
      character,
      selectedByView,
      manifest,
      manifestPath,
      maxAttempts,
      retryBackoffMs,
      helpers,
      source: "hitl",
      providerName: manifest.provider,
      workflowHash: manifest.workflowHash
    });
    return;
  }

  const comfyUiUrl = getComfyUiUrl();
  const remoteApiConfig = getRemoteApiConfig();
  const limits = earlyLimits;
  const requestedViews = earlyViews;
  const clamped = earlyClamped;

  const requestedProvider =
    generation.provider ??
    (comfyUiUrl ? "comfyui" : remoteApiConfig.baseUrl ? "remoteApi" : "mock");

  let providerName = resolveProviderName({
    requestedProvider,
    comfyUiUrl,
    remoteApiBaseUrl: remoteApiConfig.baseUrl
  });
  let providerWarning: string | null = null;

  if (requestedProvider === "comfyui" && !comfyUiUrl && remoteApiConfig.baseUrl) {
    providerWarning = "COMFYUI_BASE_URL is not configured. Falling back to remoteApi provider.";
  } else if (requestedProvider === "comfyui" && !comfyUiUrl) {
    providerName = "mock";
    providerWarning = "COMFYUI_BASE_URL is not configured. Falling back to mock provider.";
  } else if (requestedProvider === "remoteApi" && !remoteApiConfig.baseUrl) {
    providerName = "mock";
    providerWarning = "IMAGEGEN_REMOTE_BASE_URL is not configured. Falling back to mock provider.";
  }

  const budget = await evaluateBudget(prisma, clamped.totalImages, limits);
  if (budget.wouldExceed) {
    if (limits.budgetFallbackToMock && providerName !== "mock") {
      providerWarning = `Budget exceeded (${budget.monthSpentUsd.toFixed(2)} / ${budget.monthBudgetUsd.toFixed(
        2
      )} USD). Falling back to mock provider.`;
      providerName = "mock";
    } else if (budget.wouldExceed) {
      throw new Error(
        `Image generation rejected by budget limit (monthSpent=${budget.monthSpentUsd.toFixed(
          2
        )}, estimatedRun=${budget.estimatedCostThisRunUsd.toFixed(2)}, budget=${budget.monthBudgetUsd.toFixed(2)})`
      );
    }
  }

  let provider = createCharacterProvider({
    provider: providerName,
    comfyUiUrl,
    remoteApi: {
      ...remoteApiConfig,
      maxRetries: limits.maxRetries,
      estimatedCostUsdPerImage: limits.costPerImageUsd
    }
  });

  const qualityConfig = readGenerationQualityConfig();
  const candidatesDir = path.join(path.dirname(manifestPath), "candidates");
  fs.mkdirSync(candidatesDir, { recursive: true });

  const scored: ScoredCandidate[] = [];
  const styleScore = scoreStyleMatch(promptBundle.positivePrompt);
  const providerCallLogs: CharacterProviderCallLog[] = [];
  let providerWorkflowHash = "unknown_workflow";
  let providerGeneratedAt = new Date().toISOString();

  const runProviderGenerate = async (
    providerInput: CharacterProviderGenerateInput
  ): Promise<CharacterGenerationCandidate[]> => {
    try {
      const result = await provider.generate(providerInput);
      providerCallLogs.push(...result.callLogs);
      providerWorkflowHash = result.workflowHash;
      providerGeneratedAt = result.generatedAt;
      return result.candidates;
    } catch (error) {
      if (providerName === "mock") {
        throw error;
      }

      providerWarning = `${providerName} unavailable (${errorMessage(error)}). Falling back to mock provider.`;
      providerName = "mock";
      provider = createCharacterProvider({
        provider: "mock"
      });
      const fallbackResult = await provider.generate(providerInput);
      providerCallLogs.push(...fallbackResult.callLogs);
      providerWorkflowHash = fallbackResult.workflowHash;
      providerGeneratedAt = fallbackResult.generatedAt;
      return fallbackResult.candidates;
    }
  };

  const runViewGeneration = async (input: {
    views: CharacterView[];
    stage: "front" | "view_only" | "angles";
    referenceInput?: {
      referenceImageBase64: string;
      referenceMimeType?: string;
    };
  }): Promise<void> => {
    const baseSeed = generation.seed ?? 101;
    for (let round = 0; round <= qualityConfig.autoRetryRounds; round += 1) {
      const roundSeed = baseSeed + round * 1009 + input.views.length * 41;
      const roundNegativePrompt = strengthenNegativePrompt(
        promptBundle.negativePrompt,
        generation.boostNegativePrompt === true,
        round
      );

      const generatedCandidates = await runProviderGenerate({
        mode: generation.mode,
        views: input.views,
        candidateCount: clamped.candidateCount,
        baseSeed: roundSeed,
        positivePrompt: promptBundle.positivePrompt,
        negativePrompt: roundNegativePrompt,
        ...(input.referenceInput
          ? {
              referenceImageBase64: input.referenceInput.referenceImageBase64,
              referenceMimeType: input.referenceInput.referenceMimeType ?? "image/png"
            }
          : {})
      });

      for (const candidate of generatedCandidates) {
        if (!input.views.includes(candidate.view)) {
          continue;
        }

        const analysis = await analyzeImage(candidate.data);
        const scoredCandidate = scoreCandidate({
          candidate,
          analysis,
          mode: generation.mode,
          styleScore,
          generationRound: round,
          ...(referenceAnalysis ? { referenceAnalysis } : {})
        });

        const extension = candidate.mimeType.includes("svg") ? "svg" : "png";
        const outputPath = path.join(
          candidatesDir,
          `${input.stage}_${candidate.view}_r${round}_${safeFileName(candidate.id)}_${candidate.candidateIndex}.${extension}`
        );
        fs.writeFileSync(outputPath, candidate.data);

        (scoredCandidate.candidate.providerMeta ??= {}).localCandidatePath = outputPath;
        scored.push(scoredCandidate);
      }

      applyConsistencyScoring(scored);
      const bestByViewNow = groupBestByView(scored);
      const belowThresholdViews = input.views.filter((view) => {
        const candidate = bestByViewNow[view];
        if (!candidate) {
          return true;
        }
        if (candidate.rejections.length > 0) {
          return true;
        }
        return candidate.score < qualityConfig.minAcceptedScore;
      });

      if (belowThresholdViews.length === 0) {
        break;
      }

      if (round < qualityConfig.autoRetryRounds) {
        const retryMessage = `Auto-regenerate round ${round + 1} for ${belowThresholdViews.join(", ")}`;
        providerWarning = providerWarning ? `${providerWarning} | ${retryMessage}` : retryMessage;
      }
    }
  };

  const supportsReferenceSequential =
    qualityConfig.sequentialReference &&
    providerName !== "mock" &&
    generation.viewToGenerate === undefined &&
    requestedViews.length > 1;

  if (supportsReferenceSequential && requestedViews.includes("front")) {
    await runViewGeneration({
      views: ["front"],
      stage: "front",
      ...(referenceImageBase64
        ? {
            referenceInput: {
              referenceImageBase64,
              referenceMimeType
            }
          }
        : {})
    });

    applyConsistencyScoring(scored);
    const bestAfterFront = groupBestByView(scored);
    const frontBaseline = bestAfterFront.front;
    const remainingViews = requestedViews.filter((view) => view !== "front");

    let sideReference:
      | {
          referenceImageBase64: string;
          referenceMimeType?: string;
        }
      | undefined;

    if (frontBaseline) {
      sideReference = {
        referenceImageBase64: frontBaseline.candidate.data.toString("base64"),
        referenceMimeType: frontBaseline.candidate.mimeType
      };
    } else if (referenceImageBase64) {
      sideReference = {
        referenceImageBase64,
        referenceMimeType
      };
    }

    if (remainingViews.length > 0) {
      await runViewGeneration({
        views: remainingViews,
        stage: "angles",
        ...(sideReference ? { referenceInput: sideReference } : {})
      });
    }
  } else {
    let perViewReference:
      | {
          referenceImageBase64: string;
          referenceMimeType?: string;
        }
      | undefined;
    if (generation.viewToGenerate && generation.viewToGenerate !== "front") {
      perViewReference = await resolveFrontReferenceFromManifest(manifestPath);
      if (!perViewReference && sessionId) {
        perViewReference = await resolveFrontReferenceFromSession(prisma, sessionId, continuityConfig);
      }
    } else if (referenceImageBase64) {
      perViewReference = {
        referenceImageBase64,
        referenceMimeType
      };
    }

    await runViewGeneration({
      views: requestedViews,
      stage: generation.viewToGenerate ? "view_only" : "angles",
      ...(perViewReference ? { referenceInput: perViewReference } : {})
    });
  }

  applyConsistencyScoring(scored);

  const preFallbackBest = groupBestByView(scored);
  const preFallbackLowQuality = requestedViews.filter((view) => {
    const candidate = preFallbackBest[view];
    if (!candidate) {
      return true;
    }
    if (candidate.rejections.length > 0) {
      return true;
    }
    return candidate.score < qualityConfig.minAcceptedScore;
  });

  if (preFallbackLowQuality.length > 0 && providerName !== "mock") {
    const fallbackMsg = `Low-quality views (${preFallbackLowQuality.join(
      ", "
    )}) detected. Running mock fallback candidates.`;
    providerWarning = providerWarning ? `${providerWarning} | ${fallbackMsg}` : fallbackMsg;
    providerName = "mock";
    provider = createCharacterProvider({ provider: "mock" });

    await runViewGeneration({
      views: preFallbackLowQuality,
      stage: generation.viewToGenerate ? "view_only" : "angles",
      ...(referenceImageBase64
        ? {
            referenceInput: {
              referenceImageBase64,
              referenceMimeType
            }
          }
        : {})
    });
    applyConsistencyScoring(scored);
  }

  await insertProviderCallLogs({
    prisma,
    sessionId,
    episodeId: payload.episodeId,
    callLogs: providerCallLogs
  });

  await upsertSessionCandidates({
    prisma,
    sessionId,
    scored,
    ...(generation.viewToGenerate ? { viewToGenerate: generation.viewToGenerate } : {})
  });

  let retainedManifestCandidates: GenerationManifest["candidates"] = [];
  let retainedSelectedByView: GenerationManifest["selectedByView"] = {};
  if (generation.viewToGenerate && fs.existsSync(manifestPath)) {
    const previousRaw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
    if (isRecord(previousRaw)) {
      const previousCandidates = Array.isArray(previousRaw.candidates)
        ? previousRaw.candidates
            .map((candidate) => parseManifestCandidate(manifestPath, candidate))
            .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
        : [];

      retainedManifestCandidates = previousCandidates
        .filter((candidate) => candidate.view !== generation.viewToGenerate)
        .map((entry) => ({
          id: entry.id,
          view: entry.view,
          candidateIndex: entry.candidateIndex,
          seed: entry.seed,
          mimeType: entry.mimeType,
          filePath: entry.filePath,
          score: Number(entry.score.toFixed(4)),
          styleScore: Number(entry.styleScore.toFixed(4)),
          referenceSimilarity:
            entry.referenceSimilarity === null ? null : Number(entry.referenceSimilarity.toFixed(4)),
          consistencyScore: entry.consistencyScore === null ? null : Number(entry.consistencyScore.toFixed(4)),
          warnings: entry.warnings,
          rejections: entry.rejections,
          ...(entry.breakdown ? { breakdown: entry.breakdown } : {})
        }));

      if (isRecord(previousRaw.selectedByView)) {
        retainedSelectedByView = { ...previousRaw.selectedByView } as GenerationManifest["selectedByView"];
        delete retainedSelectedByView[generation.viewToGenerate];
      }
    }
  }

  const selectedByView = groupBestByView(scored);
  const missingGeneratedViews = requestedViews.filter((view) => !selectedByView[view]);
  const lowQualityGeneratedViews = requestedViews.filter((view) => {
    const candidate = selectedByView[view];
    if (!candidate) {
      return true;
    }
    if (candidate.rejections.length > 0) {
      return true;
    }
    return candidate.score < qualityConfig.minAcceptedScore;
  });
  const requiresHitl =
    generation.viewToGenerate !== undefined ||
    generation.requireHitlPick === true ||
    generation.autoPick === false ||
    missingGeneratedViews.length > 0 ||
    lowQualityGeneratedViews.length > 0;

  const manifest = withManifestHashes({
    schemaVersion: "1.0",
    status: requiresHitl ? "PENDING_HITL" : "AUTO_SELECTED",
    sessionId,
    episodeId: payload.episodeId,
    characterPackId: character.characterPackId,
    provider: providerName,
    providerRequested: requestedProvider,
    providerWarning:
      [providerWarning, ...clamped.warnings]
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .join(" | ") || null,
    workflowHash: providerWorkflowHash,
    generatedAt: providerGeneratedAt,
    mode: generation.mode,
    promptPreset: promptBundle.presetId,
    positivePrompt: promptBundle.positivePrompt,
    negativePrompt: promptBundle.negativePrompt,
    guardrails: promptBundle.guardrails,
    reference: {
      assetId: generation.referenceAssetId ?? null,
      sourceSessionId: continuityReferenceSessionId,
      phash: referenceAnalysis?.phash ?? null,
      palette: referenceAnalysis?.palette ?? null,
      continuity: continuitySnapshot
    },
    candidates: [
      ...retainedManifestCandidates,
      ...scored.map((entry) => ({
        id: entry.candidate.id,
        view: entry.candidate.view,
        candidateIndex: entry.candidate.candidateIndex,
        seed: entry.candidate.seed,
        mimeType: entry.candidate.mimeType,
        filePath: asString(entry.candidate.providerMeta?.localCandidatePath),
        score: Number(entry.score.toFixed(4)),
        styleScore: Number(entry.styleScore.toFixed(4)),
        referenceSimilarity: entry.referenceSimilarity === null ? null : Number(entry.referenceSimilarity.toFixed(4)),
        consistencyScore: entry.consistencyScore === null ? null : Number(entry.consistencyScore.toFixed(4)),
        warnings: entry.warnings,
        rejections: entry.rejections,
        breakdown: entry.breakdown
      }))
    ],
    selectedByView: retainedSelectedByView
  });

  if (requiresHitl) {
    const missingText = missingGeneratedViews.length > 0 ? ` Missing views: ${missingGeneratedViews.join(", ")}.` : "";
    const lowQualityText =
      lowQualityGeneratedViews.length > 0
        ? ` Low-quality views: ${lowQualityGeneratedViews.join(", ")} (threshold=${qualityConfig.minAcceptedScore.toFixed(
            2
          )}).`
        : "";
    const continuityDescriptor = formatContinuityDescriptor(continuitySnapshot);
    const continuityText = continuityDescriptor
      ? ` Continuity: ${continuityDescriptor}${continuitySnapshot?.applied ? " (applied)." : "."}`
      : "";
    await prisma.agentSuggestion.create({
      data: {
        episodeId: payload.episodeId,
        jobId: jobDbId,
        type: "HITL_REVIEW",
        status: "PENDING",
        title: generation.viewToGenerate
          ? `Regenerate ${generation.viewToGenerate} candidates`
          : "Choose best character view candidates",
        summary: generation.viewToGenerate
          ? `View-only regenerate completed for ${generation.viewToGenerate}. Pick candidates to continue.${continuityText}`
          : `Auto-pick disabled or partial provider failure.${missingText}${lowQualityText}${continuityText} Select one candidate per view from generation manifest.`,
        payload: toPrismaJson({
          manifestPath,
          provider: providerName,
          providerWarning,
          mode: generation.mode,
          promptPreset: promptBundle.presetId,
          sessionId,
          viewToGenerate: generation.viewToGenerate ?? null,
          continuitySummary: manifest.reference.continuity ?? null,
          continuityDescriptor: formatContinuityDescriptor(manifest.reference.continuity),
          continuityReason: manifest.reference.continuity?.reason ?? null,
          continuityApplied: manifest.reference.continuity?.applied ?? null,
          continuityAttempted: manifest.reference.continuity?.attempted ?? null,
          continuitySourceSessionId: manifest.reference.continuity?.attemptedSourceSessionId ?? null,
          continuitySourcePool: manifest.reference.continuity?.sourcePool ?? null
        })
      }
    });

    if (character.buildJobDbId) {
      await helpers.setJobStatus(character.buildJobDbId, "CANCELLED", { finishedAt: new Date() });
      await helpers.logJob(character.buildJobDbId, "warn", "Cancelled awaiting HITL pick", {
        source: "worker:generate-character-assets",
        manifestPath
      });
    }

    if (character.previewJobDbId) {
      await helpers.setJobStatus(character.previewJobDbId, "CANCELLED", { finishedAt: new Date() });
      await helpers.logJob(character.previewJobDbId, "warn", "Cancelled awaiting HITL pick", {
        source: "worker:generate-character-assets",
        manifestPath
      });
    }

    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await prisma.characterGenerationSession.update({
      where: { id: sessionId },
      data: {
        status: "READY",
        statusMessage: generation.viewToGenerate
          ? `Candidates ready for view ${generation.viewToGenerate}. Pick to continue.${formatContinuitySentence(
              continuitySnapshot
            )}`
          : missingGeneratedViews.length > 0
            ? `Partial generation complete. Missing: ${missingGeneratedViews.join(", ")}${
                formatContinuityDescriptor(continuitySnapshot)
                  ? ` | ${formatContinuityDescriptor(continuitySnapshot)}`
                  : ""
              }`
            : lowQualityGeneratedViews.length > 0
              ? `Candidates generated but quality below threshold for: ${lowQualityGeneratedViews.join(", ")}${
                  formatContinuityDescriptor(continuitySnapshot)
                    ? ` | ${formatContinuityDescriptor(continuitySnapshot)}`
                    : ""
                }`
              : `Candidates ready. Waiting for pick.${formatContinuitySentence(continuitySnapshot)}`
      }
    });

    await helpers.logJob(jobDbId, "info", "Character generation completed (HITL required)", {
      manifestPath,
      provider: providerName,
      providerWarning,
      candidateCount: scored.length,
      inputHash: manifest.inputHash,
      manifestHash: manifest.manifestHash,
      continuitySummary: manifest.reference.continuity ?? null,
      continuityDescriptor: formatContinuityDescriptor(manifest.reference.continuity),
      continuityReason: manifest.reference.continuity?.reason ?? null,
      continuityApplied: manifest.reference.continuity?.applied ?? null,
      continuityAttempted: manifest.reference.continuity?.attempted ?? null,
      continuitySourceSessionId: manifest.reference.continuity?.attemptedSourceSessionId ?? null,
      continuitySourcePool: manifest.reference.continuity?.sourcePool ?? null,
      sessionId,
      viewToGenerate: generation.viewToGenerate ?? null,
      lowQualityViews: lowQualityGeneratedViews,
      qualityThreshold: qualityConfig.minAcceptedScore,
      limits: {
        maxCandidatesPerView: limits.maxCandidatesPerView,
        maxTotalImages: limits.maxTotalImages,
        maxRetries: limits.maxRetries
      },
      budget
    });

    return;
  }

  const selected = {
    front: selectedByView.front,
    threeQuarter: selectedByView.threeQuarter,
    profile: selectedByView.profile
  };
  if (!selected.front || !selected.threeQuarter || !selected.profile) {
    throw new Error("Failed to select candidates for all required views");
  }

  await persistSelectedCandidates({
    prisma,
    sessionId,
    episodeId: payload.episodeId,
    episodeChannelId: episode.channelId,
    jobDbId,
    character,
    selectedByView: {
      front: selected.front,
      threeQuarter: selected.threeQuarter,
      profile: selected.profile
    },
    manifest,
    manifestPath,
    maxAttempts,
    retryBackoffMs,
    helpers,
    source: "auto",
    providerName,
    workflowHash: providerWorkflowHash
  });
  } catch (error) {
    if (sessionId) {
      await prisma.characterGenerationSession
        .update({
          where: { id: sessionId },
          data: {
            status: "FAILED",
            statusMessage: errorMessage(error)
          }
        })
        .catch(() => undefined);
    }
    throw error;
  }
}
