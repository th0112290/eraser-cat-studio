import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { JobsOptions } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildCharacterPrompt,
  createCharacterProvider,
  deriveStyleHintsFromChannelBible,
  resolveProviderName,
  type CharacterGenerationCandidate,
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
  width: number;
  height: number;
  alphaCoverage: number;
  contrast: number;
  edgeDensityBottomRight: number;
  phash: string;
  palette: Array<[number, number, number]>;
};

type ScoredCandidate = {
  candidate: CharacterGenerationCandidate;
  analysis: ImageAnalysis;
  score: number;
  styleScore: number;
  referenceSimilarity: number | null;
  warnings: string[];
  rejections: string[];
};

type GenerationManifest = {
  schemaVersion: "1.0";
  status: "PENDING_HITL" | "AUTO_SELECTED";
  episodeId: string;
  characterPackId: string;
  provider: string;
  workflowHash: string;
  generatedAt: string;
  mode: string;
  promptPreset: string;
  positivePrompt: string;
  negativePrompt: string;
  guardrails: string[];
  reference: {
    assetId: string | null;
    phash: string | null;
    palette: Array<[number, number, number]> | null;
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
    warnings: string[];
    rejections: string[];
  }>;
  selectedByView: Partial<Record<CharacterView, { candidateId: string; assetId?: string; assetIngestJobId?: string }>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
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
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .resize(128, 128, { fit: "inside", withoutEnlargement: false })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const pixelCount = width * height;

  let alphaPixels = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let edgeCount = 0;
  let edgeTotal = 0;

  const paletteBucket = new Map<string, number>();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a > 8) {
        alphaPixels += 1;
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
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
    }
  }

  const palette = [...paletteBucket.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const [r, g, b] = key.split(":").map((part) => Number.parseInt(part, 10));
      return [r, g, b] as [number, number, number];
    });

  const alphaCoverage = pixelCount > 0 ? alphaPixels / pixelCount : 0;
  const contrast = maxLuma - minLuma;
  const edgeDensityBottomRight = edgeTotal > 0 ? edgeCount / edgeTotal : 0;
  const phash = await computePHash(buffer);

  return {
    width,
    height,
    alphaCoverage,
    contrast,
    edgeDensityBottomRight,
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

function scoreCandidate(input: {
  candidate: CharacterGenerationCandidate;
  analysis: ImageAnalysis;
  mode: string;
  styleScore: number;
  referenceAnalysis?: ImageAnalysis;
}): ScoredCandidate {
  const warnings: string[] = [];
  const rejections: string[] = [];

  if (input.analysis.alphaCoverage > 0.995) {
    warnings.push("background_not_transparent");
  }

  if (input.analysis.contrast < 20) {
    warnings.push("low_contrast");
  }

  if (input.analysis.edgeDensityBottomRight > 0.4) {
    rejections.push("watermark_or_text_artifact");
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

  let score = 0.55;
  score += input.styleScore * 0.2;
  score += (referenceSimilarity ?? 0.5) * 0.2;
  score -= warnings.length * 0.07;
  score -= rejections.length * 0.25;

  return {
    candidate: input.candidate,
    analysis: input.analysis,
    score: clamp01(score),
    styleScore: input.styleScore,
    referenceSimilarity,
    warnings,
    rejections
  };
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

function normalizeGenerationConfig(generation: CharacterGenerationPayload | undefined): CharacterGenerationPayload {
  return {
    mode: generation?.mode === "reference" ? "reference" : "new",
    provider: generation?.provider,
    promptPreset: generation?.promptPreset ?? "eraser-cat-flat",
    positivePrompt: generation?.positivePrompt,
    negativePrompt: generation?.negativePrompt,
    referenceAssetId: generation?.referenceAssetId,
    candidateCount: Math.max(1, Math.min(8, generation?.candidateCount ?? 4)),
    autoPick: generation?.autoPick !== false,
    requireHitlPick: generation?.requireHitlPick === true,
    seed: generation?.seed ?? 101,
    manifestPath: generation?.manifestPath
  };
}

function manifestBasePath(jobDbId: string, manifestPath?: string): string {
  if (manifestPath && manifestPath.trim().length > 0) {
    return path.resolve(manifestPath);
  }

  return path.join(REPO_ROOT, "out", "characters", "generations", jobDbId, "generation_manifest.json");
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
  const generation = normalizeGenerationConfig(character.generation);

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

  let referenceAnalysis: ImageAnalysis | undefined;
  let referenceImageBase64: string | undefined;
  let referenceMimeType: string | undefined;
  if (generation.mode === "reference") {
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

  const providerName = resolveProviderName({
    requestedProvider: generation.provider,
    comfyUiUrl: process.env.COMFYUI_URL
  });

  const provider = createCharacterProvider({
    provider: providerName,
    comfyUiUrl: process.env.COMFYUI_URL
  });

  const providerInput: CharacterProviderGenerateInput = {
    mode: generation.mode,
    views: ["front", "threeQuarter", "profile"],
    candidateCount: generation.candidateCount ?? 4,
    baseSeed: generation.seed ?? 101,
    positivePrompt: promptBundle.positivePrompt,
    negativePrompt: promptBundle.negativePrompt,
    ...(referenceImageBase64
      ? {
          referenceImageBase64,
          referenceMimeType
        }
      : {})
  };

  const providerResult = await provider.generate(providerInput);

  const manifestPath = manifestBasePath(jobDbId, generation.manifestPath);
  const candidatesDir = path.join(path.dirname(manifestPath), "candidates");
  fs.mkdirSync(candidatesDir, { recursive: true });

  const scored: ScoredCandidate[] = [];
  const styleScore = scoreStyleMatch(promptBundle.positivePrompt);

  for (const candidate of providerResult.candidates) {
    const analysis = await analyzeImage(candidate.data);
    const scoredCandidate = scoreCandidate({
      candidate,
      analysis,
      mode: generation.mode,
      styleScore,
      ...(referenceAnalysis ? { referenceAnalysis } : {})
    });

    const extension = candidate.mimeType.includes("svg") ? "svg" : "png";
    const outputPath = path.join(candidatesDir, `${candidate.view}_${candidate.candidateIndex}.${extension}`);
    fs.writeFileSync(outputPath, candidate.data);

    (scoredCandidate.candidate.providerMeta ??= {}).localCandidatePath = outputPath;
    scored.push(scoredCandidate);
  }

  const selectedByView = groupBestByView(scored);

  const requiresHitl = generation.requireHitlPick === true || generation.autoPick === false;

  const manifest: GenerationManifest = {
    schemaVersion: "1.0",
    status: requiresHitl ? "PENDING_HITL" : "AUTO_SELECTED",
    episodeId: payload.episodeId,
    characterPackId: character.characterPackId,
    provider: providerResult.provider,
    workflowHash: providerResult.workflowHash,
    generatedAt: providerResult.generatedAt,
    mode: generation.mode,
    promptPreset: promptBundle.presetId,
    positivePrompt: promptBundle.positivePrompt,
    negativePrompt: promptBundle.negativePrompt,
    guardrails: promptBundle.guardrails,
    reference: {
      assetId: generation.referenceAssetId ?? null,
      phash: referenceAnalysis?.phash ?? null,
      palette: referenceAnalysis?.palette ?? null
    },
    candidates: scored.map((entry) => ({
      id: entry.candidate.id,
      view: entry.candidate.view,
      candidateIndex: entry.candidate.candidateIndex,
      seed: entry.candidate.seed,
      mimeType: entry.candidate.mimeType,
      filePath: asString(entry.candidate.providerMeta?.localCandidatePath),
      score: Number(entry.score.toFixed(4)),
      styleScore: Number(entry.styleScore.toFixed(4)),
      referenceSimilarity: entry.referenceSimilarity === null ? null : Number(entry.referenceSimilarity.toFixed(4)),
      warnings: entry.warnings,
      rejections: entry.rejections
    })),
    selectedByView: {}
  };

  if (requiresHitl) {
    await prisma.agentSuggestion.create({
      data: {
        episodeId: payload.episodeId,
        jobId: jobDbId,
        type: "HITL_REVIEW",
        status: "PENDING",
        title: "Choose best character view candidates",
        summary: "Auto-pick disabled. Select one candidate per view from generation manifest.",
        payload: toPrismaJson({
          manifestPath,
          provider: providerResult.provider,
          mode: generation.mode,
          promptPreset: promptBundle.presetId
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

    await helpers.logJob(jobDbId, "info", "Character generation completed (HITL required)", {
      manifestPath,
      provider: providerResult.provider,
      candidateCount: providerResult.candidates.length
    });

    return;
  }

  const selection = {
    front: selectedByView.front,
    threeQuarter: selectedByView.threeQuarter,
    profile: selectedByView.profile
  };

  if (!selection.front || !selection.threeQuarter || !selection.profile) {
    throw new Error("Failed to select candidates for all required views");
  }

  const selectedAssets = new Map<CharacterView, { assetId: string; originalKey: string; ingestJobId: string }>();

  for (const [view, scoredCandidate] of Object.entries(selection) as Array<[CharacterView, ScoredCandidate]>) {
    const candidate = scoredCandidate.candidate;
    const extension = candidate.mimeType.includes("svg") ? "svg" : "png";
    const originalKey = makeStorageKey(
      `characters/generated/${payload.episodeId}/${jobDbId}`,
      `${view}_candidate_${candidate.candidateIndex}.${extension}`
    );

    const putResult = await putAssetObject(originalKey, candidate.data, candidate.mimeType);

    const asset = await prisma.asset.create({
      data: {
        channelId: episode.channelId,
        type: "IMAGE",
        assetType: "CHARACTER_VIEW",
        status: "QUEUED",
        mime: candidate.mimeType,
        sizeBytes: BigInt(candidate.data.byteLength),
        storageKey: originalKey,
        originalKey,
        contentType: candidate.mimeType,
        bytes: BigInt(candidate.data.byteLength),
        sha256: null,
        qcJson: toPrismaJson({
          ok: true,
          stage: "generated",
          provider: candidate.provider,
          candidateId: candidate.id,
          score: scoredCandidate.score,
          warnings: scoredCandidate.warnings,
          rejections: scoredCandidate.rejections,
          minioWarning: putResult.minioError ?? null
        })
      }
    });

    const ingestPayload: AssetIngestJobPayload = {
      assetId: asset.id,
      assetType: "character_view",
      originalKey,
      mime: candidate.mimeType
    };

    const options: JobsOptions = {
      jobId: `asset-ingest:${asset.id}`,
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
    episodeId: payload.episodeId,
    schemaChecks: [],
    character: {
      characterPackId: character.characterPackId,
      version: character.version,
      buildJobDbId: buildJobId,
      previewJobDbId: character.previewJobDbId,
      assetIds
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

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  await helpers.logJob(jobDbId, "info", "Character assets generated and auto-selected", {
    provider: providerResult.provider,
    workflowHash: providerResult.workflowHash,
    manifestPath,
    selectedAssetIds: assetIds,
    buildJobDbId: buildJobId,
    buildBullmqJobId
  });
}
