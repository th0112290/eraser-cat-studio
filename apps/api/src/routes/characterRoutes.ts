import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import { sha256Hex, stableStringify } from "@ec/shared";
import type { EpisodeJobPayload } from "../services/scheduleService";
import { enqueueWithResilience } from "../services/enqueueWithResilience";
import { isDbUnavailableError, renderDbUnavailableCard } from "./ui/dbFallback";
import {
  buildCharacterGeneratorPageBody,
  buildCharacterGeneratorStatusScript,
  buildCharacterGeneratorTopSection
} from "./ui/pages/characterGeneratorPage";
import { renderUiPage as uiPage } from "./ui/uiPage";
import { buildStudioBody } from "./ui/pages/studioPage";

type JsonRecord = Record<string, unknown>;
type HttpError = Error & { statusCode: number; details?: unknown };

type CharacterAssetIds = {
  front: string;
  threeQuarter: string;
  profile: string;
};

type CharacterGenerationSelection = {
  front: string;
  threeQuarter: string;
  profile: string;
};

type CharacterGenerationMode = "reference" | "new";
type CharacterGenerationProvider = "mock" | "comfyui" | "remoteApi";
type CharacterGenerationView = "front" | "threeQuarter" | "profile";
type CharacterGeneratorStatus = "PENDING_HITL" | "AUTO_SELECTED";

type CharacterGenerationInput = {
  mode: CharacterGenerationMode;
  provider: CharacterGenerationProvider;
  promptPreset: string;
  positivePrompt?: string;
  negativePrompt?: string;
  boostNegativePrompt: boolean;
  referenceAssetId?: string;
  candidateCount: number;
  autoPick: boolean;
  requireHitlPick: boolean;
  seed: number;
  topic?: string;
  maxAttempts: number;
  retryBackoffMs: number;
};

type ChannelStylePreset = {
  id: string;
  label: string;
  positivePrompt?: string;
  negativePrompt?: string;
};

type GenerationManifestCandidate = {
  id: string;
  view: "front" | "threeQuarter" | "profile";
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
  breakdown?: {
    alphaScore?: number;
    occupancyScore?: number;
    sharpnessScore?: number;
    noiseScore?: number;
    watermarkScore?: number;
    resolutionScore?: number;
    referenceScore?: number;
    styleScore?: number;
    qualityScore?: number;
    consistencyScore?: number | null;
    generationRound?: number;
    consistencyParts?: {
      phash?: number;
      palette?: number;
      bboxCenter?: number;
      bboxScale?: number;
    };
  };
};

type GenerationManifest = {
  schemaVersion: string;
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
  candidates: GenerationManifestCandidate[];
  selectedByView: Partial<Record<"front" | "threeQuarter" | "profile", { candidateId: string; assetId?: string; assetIngestJobId?: string }>>;
};

type CharacterArtifactSource = {
  label: string;
  root: string;
};

type CharacterLineageTask = {
  code: string;
  severity: string;
  status: string;
  action: string;
  reason: string;
  assetPaths: string[];
};

type CharacterViewLineage = {
  view: CharacterGenerationView;
  assetId: string | null;
  approved: boolean | null;
  workflow: string | null;
  workflowVersion: string | null;
  createdAt: string | null;
  filePath: string | null;
  fileUrl: string | null;
  metadataPath: string | null;
  metadataUrl: string | null;
  parentAssetId: string | null;
  parentAssetPath: string | null;
  parentAssetUrl: string | null;
  repairHistory: string[];
};

type CharacterPackLineage = {
  sourceLabel: string;
  characterRoot: string;
  manifestPath: string;
  manifestUrl: string | null;
  packMetaPath: string | null;
  packMetaUrl: string | null;
  packJsonPath: string | null;
  packJsonUrl: string | null;
  proposalPath: string | null;
  proposalUrl: string | null;
  qcReportPath: string | null;
  qcReportUrl: string | null;
  repairTasksPath: string | null;
  repairTasksUrl: string | null;
  builtAt: string | null;
  sourceManifestPath: string | null;
  sourceManifestUrl: string | null;
  sourceImageRef: string | null;
  sourceImageUrl: string | null;
  acceptanceStatus: string | null;
  approvedFrontMasterPresent: boolean | null;
  qcFailedCount: number;
  qcTotalCount: number;
  repairOpenCount: number;
  repairTasks: CharacterLineageTask[];
  viewEntries: CharacterViewLineage[];
};

function computeManifestHashes(input: {
  episodeId: string;
  characterPackId: string;
  mode: string;
  promptPreset: string;
  positivePrompt: string;
  negativePrompt: string;
  workflowHash: string;
  provider: string;
  candidates: GenerationManifestCandidate[];
}): { inputHash: string; manifestHash: string } {
  const candidateFingerprint = input.candidates
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
      episodeId: input.episodeId,
      characterPackId: input.characterPackId,
      mode: input.mode,
      promptPreset: input.promptPreset,
      positivePrompt: input.positivePrompt,
      negativePrompt: input.negativePrompt,
      workflowHash: input.workflowHash,
      provider: input.provider,
      candidateFingerprint
    })
  );
  const manifestHash = sha256Hex(
    stableStringify({
      ...input,
      inputHash
    })
  );
  return { inputHash, manifestHash };
}

type CharacterGenerationCreateResult = {
  sessionId: string;
  characterPackId: string;
  version: number;
  episodeId: string;
  generateJobId: string;
  buildJobId: string;
  previewJobId: string;
  bullmqJobId: string;
  manifestPath: string;
  generatorStatus: CharacterGeneratorStatus;
  reusedExisting: boolean;
};

type RegisterCharacterRoutesInput = {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue: Queue<EpisodeJobPayload>;
  queueName: string;
};

type CharacterCreateResult = {
  characterPackId: string;
  version: number;
  previewJobId: string;
  buildJobId: string;
  episodeId: string;
  bullmqJobId: string;
};

type CharacterGenerationRegenerateResult = {
  sessionId: string;
  view: CharacterGenerationView;
  generateJobId: string;
  bullmqJobId: string;
  manifestPath: string;
};

type CharacterGenerationRecreateResult = {
  sessionId: string;
  generateJobId: string;
  bullmqJobId: string;
  manifestPath: string;
  seed: number;
};

const BUILD_CHARACTER_PACK_JOB_NAME = "BUILD_CHARACTER_PACK";
const RENDER_CHARACTER_PREVIEW_JOB_NAME = "RENDER_CHARACTER_PREVIEW";
const GENERATE_CHARACTER_ASSETS_JOB_NAME = "GENERATE_CHARACTER_ASSETS";
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = 1000;
const MAX_LIST = 100;
const DEFAULT_GENERATION_SEED = 101;
const GENERATION_DEDUPE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_PROMPT_PRESET = "eraser-cat-flat";
const DEMO_USER_EMAIL = "demo.extreme@example.com";
const DEMO_USER_NAME = "demo-extreme";
const DEMO_CHANNEL_NAME = "Extreme Demo Channel";
const CHARACTER_STYLE_PRESETS = [
  { id: "eraser-cat-flat", label: "Eraser Cat Flat" },
  { id: "playful-cartoon", label: "Playful Cartoon" },
  { id: "minimal-rig", label: "Minimal Rig" }
] as const;

type CharacterGenerationSessionDelegate = {
  findFirst: (args: unknown) => Promise<any>;
  create: (args: unknown) => Promise<any>;
  update: (args: unknown) => Promise<any>;
};

function getCharacterGenerationSessionDelegate(client: unknown): CharacterGenerationSessionDelegate | null {
  if (!client || typeof client !== "object") {
    return null;
  }
  const delegate = (client as Record<string, unknown>).characterGenerationSession;
  if (!delegate || typeof delegate !== "object") {
    return null;
  }
  const candidate = delegate as CharacterGenerationSessionDelegate;
  if (
    typeof candidate.findFirst !== "function" ||
    typeof candidate.create !== "function" ||
    typeof candidate.update !== "function"
  ) {
    return null;
  }
  return candidate;
}

function isLiveJobStatus(status: string): boolean {
  return status === "QUEUED" || status === "RUNNING";
}

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

function parseBoolean(value: unknown, field: string, fallback: boolean): boolean {
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

  throw createHttpError(400, `${field} must be a boolean`);
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function parseStringArrayAtPath(root: JsonRecord, keys: string[]): string[] {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) {
      return [];
    }
    current = current[key];
  }
  return parseStringArray(current);
}

function getRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../../");
}

function pathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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

function getGeneratedCharacterArtifactSources(): CharacterArtifactSource[] {
  const repoRoot = getRepoRoot();
  const candidates: CharacterArtifactSource[] = [
    { label: "local worktree", root: path.join(repoRoot, "assets", "generated", "characters") },
    { label: "main repo", root: path.resolve(repoRoot, "../eraser-cat-studio/assets/generated/characters") }
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = path.resolve(candidate.root).toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveGeneratedCharacterRoot(
  characterPackId: string
): { source: CharacterArtifactSource; characterRoot: string } | null {
  for (const source of getGeneratedCharacterArtifactSources()) {
    const characterRoot = path.join(source.root, characterPackId);
    if (fs.existsSync(characterRoot) && fs.statSync(characterRoot).isDirectory()) {
      return { source, characterRoot };
    }
  }
  return null;
}

function resolveGeneratedCharacterFile(
  requestedPath: string,
  allowedExtensions = [".json", ".png", ".jpg", ".jpeg", ".webp", ".mp4"]
): { resolvedPath: string; source: CharacterArtifactSource } | null {
  const resolvedPath = path.resolve(requestedPath);
  const source = getGeneratedCharacterArtifactSources().find((candidate) => pathInside(candidate.root, resolvedPath));
  if (!source) {
    return null;
  }
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    return null;
  }
  const ext = path.extname(resolvedPath).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return null;
  }
  return {
    resolvedPath,
    source
  };
}

function mimeTypeForGeneratedCharacterFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

function toGeneratedCharacterFileUrl(filePath: string | null | undefined): string | null {
  if (!filePath) {
    return null;
  }
  const resolved = resolveGeneratedCharacterFile(filePath);
  if (!resolved) {
    return null;
  }
  return `/ui/characters/generated-file?path=${encodeURIComponent(resolved.resolvedPath)}`;
}

function getCharacterArtifacts(characterPackId: string): {
  outDir: string;
  packJsonPath: string;
  previewPath: string;
  qcReportPath: string;
} {
  const outDir = path.join(getRepoRoot(), "out", "characters", characterPackId);
  return {
    outDir,
    packJsonPath: path.join(outDir, "pack.json"),
    previewPath: path.join(outDir, "preview.mp4"),
    qcReportPath: path.join(outDir, "qc_report.json")
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
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

function escHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function uiBadge(status: string): string {
  const normalized = status.toUpperCase();
  if (["READY", "SUCCEEDED", "APPROVED", "PREVIEW_READY", "COMPLETED"].includes(normalized)) {
    return "ok";
  }
  if (["FAILED"].includes(normalized)) {
    return "bad";
  }
  if (["RUNNING", "PROCESSING", "QUEUED", "DRAFT", "GENERATING"].includes(normalized)) {
    return "warn";
  }
  return "muted";
}


function parseAssetIdsFromBody(body: JsonRecord): CharacterAssetIds {
  const nested = isRecord(body.assetIds) ? body.assetIds : undefined;

  const front =
    optionalString(body, "front") ??
    optionalString(body, "frontAssetId") ??
    (nested ? optionalString(nested, "front") : undefined);

  const threeQuarter =
    optionalString(body, "threeQuarter") ??
    optionalString(body, "threeQuarterAssetId") ??
    optionalString(body, "three_quarter") ??
    (nested ? optionalString(nested, "threeQuarter") : undefined);

  const profile =
    optionalString(body, "profile") ??
    optionalString(body, "profileAssetId") ??
    (nested ? optionalString(nested, "profile") : undefined);

  if (!front || !threeQuarter || !profile) {
    throw createHttpError(400, "assetIds.front, assetIds.threeQuarter, assetIds.profile are required");
  }

  return {
    front,
    threeQuarter,
    profile
  };
}

function buildPlaceholderPack(input: {
  packId: string;
  name: string;
  sourceImageRef: string;
}): Prisma.InputJsonValue {
  const pack = {
    schema_version: "1.0",
    pack_id: input.packId,
    meta: {
      name: input.name,
      created_at: new Date().toISOString(),
      source_image_ref: input.sourceImageRef,
      notes: "Placeholder before BUILD_CHARACTER_PACK completes"
    },
    canvas: {
      base_width: 1024,
      base_height: 1024,
      coord_space: "pixels"
    },
    assets: {
      images: {
        body_front: "shape://torso_front",
        upper_arm: "shape://upper_arm",
        lower_arm: "shape://lower_arm",
        paw: "shape://paw"
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
        { bone_id: "root", parent_id: "", rest: { x: 512, y: 736, rotation_deg: 0 } },
        { bone_id: "torso", parent_id: "root", rest: { x: 0, y: 0, rotation_deg: 0 } },
        {
          bone_id: "upper_arm",
          parent_id: "torso",
          rest: { x: 140, y: -108, rotation_deg: 16 },
          limits: { min_rotation_deg: -75, max_rotation_deg: 85 }
        },
        {
          bone_id: "lower_arm",
          parent_id: "upper_arm",
          rest: { x: 98, y: 0, rotation_deg: 14 },
          limits: { min_rotation_deg: -125, max_rotation_deg: 125 }
        }
      ],
      attachments: [
        {
          slot_id: "body",
          image_id: "body_front",
          bone_id: "torso",
          pivot: { px: 0.5, py: 0.8 },
          offset: { x: 0, y: -188 },
          scale: { x: 2.8, y: 3.2 },
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
    expressions: {},
    clips: [],
    ik_chains: [
      {
        chain_id: "arm_point",
        bones: ["upper_arm", "lower_arm"],
        effector_bone_id: "lower_arm",
        elbow_hint: "down",
        max_stretch: 1.12
      }
    ]
  };

  return toPrismaJson(pack);
}

function parseGenerationMode(value: unknown): CharacterGenerationMode {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "reference") {
      return "reference";
    }
    if (normalized === "new") {
      return "new";
    }
  }

  return "new";
}

function resolveComfyUiBaseUrl(): string | undefined {
  const preferred = process.env.COMFYUI_BASE_URL?.trim();
  if (preferred && preferred.length > 0) {
    return preferred;
  }

  const legacy = process.env.COMFYUI_URL?.trim();
  if (legacy && legacy.length > 0) {
    return legacy;
  }

  return undefined;
}

function resolveRemoteApiBaseUrl(): string | undefined {
  const configured = process.env.IMAGEGEN_REMOTE_BASE_URL?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }
  return undefined;
}

function parseGenerationProvider(value: unknown): CharacterGenerationProvider {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "comfyui") {
      return "comfyui";
    }
    if (normalized === "remoteapi" || normalized === "remote_api" || normalized === "remote-api") {
      return "remoteApi";
    }
    if (normalized === "mock") {
      return "mock";
    }
  }

  if (resolveComfyUiBaseUrl()) {
    return "comfyui";
  }
  if (resolveRemoteApiBaseUrl()) {
    return "remoteApi";
  }
  return "mock";
}

function parseGenerationView(value: unknown, field: string): CharacterGenerationView {
  if (typeof value !== "string") {
    throw createHttpError(400, `${field} must be one of front|threeQuarter|profile`);
  }

  const normalized = value.trim();
  if (normalized === "front" || normalized === "threeQuarter" || normalized === "profile") {
    return normalized;
  }

  throw createHttpError(400, `${field} must be one of front|threeQuarter|profile`);
}

function toDbGenerationMode(mode: CharacterGenerationMode): "NEW" | "REFERENCE" {
  return mode === "reference" ? "REFERENCE" : "NEW";
}

function toDbGenerationProvider(provider: CharacterGenerationProvider): "MOCK" | "COMFYUI" | "REMOTEAPI" {
  if (provider === "comfyui") {
    return "COMFYUI";
  }
  if (provider === "remoteApi") {
    return "REMOTEAPI";
  }
  return "MOCK";
}

function parsePromptPreset(value: unknown): string {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return DEFAULT_PROMPT_PRESET;
}

function pickFirstLine(value: string | null | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const line = value.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return line.length > 0 ? line : null;
}

function getGenerationManifestPath(generateJobId: string): string {
  return path.join(getRepoRoot(), "out", "characters", "generations", generateJobId, "generation_manifest.json");
}

function toArtifactUrlFromAbsolutePath(filePath: string): string | null {
  const outRoot = path.join(getRepoRoot(), "out");
  const resolved = path.resolve(filePath);
  const relative = path.relative(outRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  const encoded = relative
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `/artifacts/${encoded}`;
}

function readLineageTasks(repairTasksRaw: unknown): CharacterLineageTask[] {
  if (!isRecord(repairTasksRaw) || !Array.isArray(repairTasksRaw.tasks)) {
    return [];
  }

  return repairTasksRaw.tasks
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      return {
        code: typeof entry.code === "string" ? entry.code : "UNKNOWN",
        severity: typeof entry.severity === "string" ? entry.severity : "WARN",
        status: typeof entry.status === "string" ? entry.status : "open",
        action: typeof entry.action === "string" ? entry.action : "-",
        reason: typeof entry.reason === "string" ? entry.reason : "-",
        assetPaths: parseStringArray(entry.asset_paths)
      };
    })
    .filter((entry): entry is CharacterLineageTask => Boolean(entry));
}

function readCharacterPackLineage(characterPackId: string): CharacterPackLineage | null {
  const resolvedRoot = resolveGeneratedCharacterRoot(characterPackId);
  if (!resolvedRoot) {
    return null;
  }

  const manifestPath = path.join(resolvedRoot.characterRoot, "manifest.json");
  const packMetaPath = path.join(resolvedRoot.characterRoot, "pack", "character.pack.meta.json");
  const packJsonPath = path.join(resolvedRoot.characterRoot, "pack", "character.pack.json");
  const proposalPath = path.join(resolvedRoot.characterRoot, "pack", "proposal.json");
  const qcReportPath = path.join(resolvedRoot.characterRoot, "qc", "qc_report.json");
  const repairTasksPath = path.join(resolvedRoot.characterRoot, "qc", "repair_tasks.json");

  const manifestRaw = readJsonFileSafe(manifestPath);
  const packMetaRaw = readJsonFileSafe(packMetaPath);
  const packJsonRaw = readJsonFileSafe(packJsonPath);
  const qcReportRaw = readJsonFileSafe(qcReportPath);
  const repairTasksRaw = readJsonFileSafe(repairTasksPath);
  const manifest = isRecord(manifestRaw) ? manifestRaw : {};
  const packMeta = isRecord(packMetaRaw) ? packMetaRaw : {};
  const packJson = isRecord(packJsonRaw) ? packJsonRaw : {};
  const qcReport = isRecord(qcReportRaw) ? qcReportRaw : {};
  const repairTasks = readLineageTasks(repairTasksRaw);
  const viewRoot = isRecord(manifest.views) ? manifest.views : {};
  const viewEntries = (["front", "threeQuarter", "profile"] as CharacterGenerationView[]).map((view) => {
    const item = isRecord(viewRoot[view]) ? viewRoot[view] : {};
    const filePath = typeof item.file_path === "string" ? item.file_path : null;
    const metadataPath = typeof item.metadata_path === "string" ? item.metadata_path : null;
    const parentAssetPath = typeof item.parent_asset_path === "string" ? item.parent_asset_path : null;
    return {
      view,
      assetId: typeof item.asset_id === "string" ? item.asset_id : null,
      approved: typeof item.approved === "boolean" ? item.approved : null,
      workflow: typeof item.workflow === "string" ? item.workflow : null,
      workflowVersion: typeof item.workflow_version === "string" ? item.workflow_version : null,
      createdAt: typeof item.created_at === "string" ? item.created_at : null,
      filePath,
      fileUrl: toGeneratedCharacterFileUrl(filePath),
      metadataPath,
      metadataUrl: toGeneratedCharacterFileUrl(metadataPath),
      parentAssetId: typeof item.parent_asset_id === "string" ? item.parent_asset_id : null,
      parentAssetPath,
      parentAssetUrl: toGeneratedCharacterFileUrl(parentAssetPath),
      repairHistory: parseStringArray(item.repair_history)
    };
  });

  const qcChecks = Array.isArray(qcReport.checks) ? qcReport.checks.filter((entry) => isRecord(entry)) : [];
  const qcFailedCount = qcChecks.filter((entry) => entry.passed !== true).length;
  const approvalStatus =
    typeof (repairTasksRaw as { acceptance_status?: unknown } | null)?.acceptance_status === "string"
      ? ((repairTasksRaw as { acceptance_status: string }).acceptance_status ?? null)
      : typeof qcReport.acceptance_status === "string"
        ? qcReport.acceptance_status
        : typeof manifest.acceptance_status === "string"
          ? manifest.acceptance_status
          : readStringAtPath(manifest, ["acceptance", "status"]);

  return {
    sourceLabel: resolvedRoot.source.label,
    characterRoot: resolvedRoot.characterRoot,
    manifestPath,
    manifestUrl: toGeneratedCharacterFileUrl(manifestPath),
    packMetaPath: fs.existsSync(packMetaPath) ? packMetaPath : null,
    packMetaUrl: toGeneratedCharacterFileUrl(packMetaPath),
    packJsonPath: fs.existsSync(packJsonPath) ? packJsonPath : null,
    packJsonUrl: toGeneratedCharacterFileUrl(packJsonPath),
    proposalPath: fs.existsSync(proposalPath) ? proposalPath : null,
    proposalUrl: toGeneratedCharacterFileUrl(proposalPath),
    qcReportPath: fs.existsSync(qcReportPath) ? qcReportPath : null,
    qcReportUrl: toGeneratedCharacterFileUrl(qcReportPath),
    repairTasksPath: fs.existsSync(repairTasksPath) ? repairTasksPath : null,
    repairTasksUrl: toGeneratedCharacterFileUrl(repairTasksPath),
    builtAt:
      typeof packMeta.built_at === "string"
        ? packMeta.built_at
        : typeof manifest.updated_at === "string"
          ? manifest.updated_at
          : typeof manifest.created_at === "string"
            ? manifest.created_at
            : null,
    sourceManifestPath:
      typeof packMeta.source_manifest_path === "string" ? packMeta.source_manifest_path : fs.existsSync(manifestPath) ? manifestPath : null,
    sourceManifestUrl: toGeneratedCharacterFileUrl(
      typeof packMeta.source_manifest_path === "string" ? packMeta.source_manifest_path : manifestPath
    ),
    sourceImageRef:
      readStringAtPath(packJson, ["meta", "source_image_ref"]) ??
      readStringAtPath(manifest, ["views", "front", "parent_asset_path"]),
    sourceImageUrl: toGeneratedCharacterFileUrl(
      readStringAtPath(packJson, ["meta", "source_image_ref"]) ??
        readStringAtPath(manifest, ["views", "front", "parent_asset_path"])
    ),
    acceptanceStatus: approvalStatus,
    approvedFrontMasterPresent:
      typeof qcReport.approved_front_master_present === "boolean" ? qcReport.approved_front_master_present : null,
    qcFailedCount,
    qcTotalCount: qcChecks.length,
    repairOpenCount: repairTasks.filter((task) => task.status.toLowerCase() === "open").length,
    repairTasks,
    viewEntries
  };
}

function parseManifestCandidate(entry: unknown): GenerationManifestCandidate | null {
  if (!isRecord(entry)) {
    return null;
  }

  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const viewRaw = typeof entry.view === "string" ? entry.view.trim() : "";
  const view = viewRaw === "front" || viewRaw === "threeQuarter" || viewRaw === "profile" ? viewRaw : null;
  const candidateIndex = typeof entry.candidateIndex === "number" ? entry.candidateIndex : 0;
  const seed = typeof entry.seed === "number" ? entry.seed : 0;
  const mimeType = typeof entry.mimeType === "string" && entry.mimeType.trim().length > 0 ? entry.mimeType : "image/png";
  const filePath = typeof entry.filePath === "string" ? entry.filePath.trim() : "";

  if (!id || !view || !filePath) {
    return null;
  }

  const score = typeof entry.score === "number" ? entry.score : 0;
  const styleScore = typeof entry.styleScore === "number" ? entry.styleScore : 0;
  const referenceSimilarity = typeof entry.referenceSimilarity === "number" ? entry.referenceSimilarity : null;
  const consistencyScore = typeof entry.consistencyScore === "number" ? entry.consistencyScore : null;
  const warnings = parseStringArray(entry.warnings);
  const rejections = parseStringArray(entry.rejections);
  const breakdown = isRecord(entry.breakdown)
    ? {
        ...(typeof entry.breakdown.alphaScore === "number" ? { alphaScore: entry.breakdown.alphaScore } : {}),
        ...(typeof entry.breakdown.occupancyScore === "number"
          ? { occupancyScore: entry.breakdown.occupancyScore }
          : {}),
        ...(typeof entry.breakdown.sharpnessScore === "number"
          ? { sharpnessScore: entry.breakdown.sharpnessScore }
          : {}),
        ...(typeof entry.breakdown.noiseScore === "number" ? { noiseScore: entry.breakdown.noiseScore } : {}),
        ...(typeof entry.breakdown.watermarkScore === "number"
          ? { watermarkScore: entry.breakdown.watermarkScore }
          : {}),
        ...(typeof entry.breakdown.resolutionScore === "number"
          ? { resolutionScore: entry.breakdown.resolutionScore }
          : {}),
        ...(typeof entry.breakdown.referenceScore === "number"
          ? { referenceScore: entry.breakdown.referenceScore }
          : {}),
        ...(typeof entry.breakdown.styleScore === "number" ? { styleScore: entry.breakdown.styleScore } : {}),
        ...(typeof entry.breakdown.qualityScore === "number"
          ? { qualityScore: entry.breakdown.qualityScore }
          : {}),
        ...(typeof entry.breakdown.consistencyScore === "number" || entry.breakdown.consistencyScore === null
          ? { consistencyScore: entry.breakdown.consistencyScore as number | null }
          : {}),
        ...(typeof entry.breakdown.generationRound === "number"
          ? { generationRound: entry.breakdown.generationRound }
          : {}),
        ...(isRecord(entry.breakdown.consistencyParts)
          ? {
              consistencyParts: {
                ...(typeof entry.breakdown.consistencyParts.phash === "number"
                  ? { phash: entry.breakdown.consistencyParts.phash }
                  : {}),
                ...(typeof entry.breakdown.consistencyParts.palette === "number"
                  ? { palette: entry.breakdown.consistencyParts.palette }
                  : {}),
                ...(typeof entry.breakdown.consistencyParts.bboxCenter === "number"
                  ? { bboxCenter: entry.breakdown.consistencyParts.bboxCenter }
                  : {}),
                ...(typeof entry.breakdown.consistencyParts.bboxScale === "number"
                  ? { bboxScale: entry.breakdown.consistencyParts.bboxScale }
                  : {})
              }
            }
          : {})
      }
    : undefined;

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

function readGenerationManifest(manifestPath: string): GenerationManifest | null {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(raw)) {
    return null;
  }

  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.map((entry) => parseManifestCandidate(entry)).filter((entry): entry is GenerationManifestCandidate => entry !== null)
    : [];
  const statusRaw = typeof raw.status === "string" ? raw.status : "PENDING_HITL";
  const status =
    statusRaw === "PENDING_HITL" || statusRaw === "AUTO_SELECTED" || statusRaw === "HITL_SELECTED"
      ? statusRaw
      : "PENDING_HITL";

  const episodeId = typeof raw.episodeId === "string" ? raw.episodeId : "";
  const characterPackId = typeof raw.characterPackId === "string" ? raw.characterPackId : "";
  const provider = typeof raw.provider === "string" ? raw.provider : "mock";
  const workflowHash = typeof raw.workflowHash === "string" ? raw.workflowHash : "";
  const mode = typeof raw.mode === "string" ? raw.mode : "new";
  const promptPreset = typeof raw.promptPreset === "string" ? raw.promptPreset : DEFAULT_PROMPT_PRESET;
  const positivePrompt = typeof raw.positivePrompt === "string" ? raw.positivePrompt : "";
  const negativePrompt = typeof raw.negativePrompt === "string" ? raw.negativePrompt : "";
  const fallbackHashes = computeManifestHashes({
    episodeId,
    characterPackId,
    mode,
    promptPreset,
    positivePrompt,
    negativePrompt,
    workflowHash,
    provider,
    candidates
  });

  return {
    schemaVersion: typeof raw.schemaVersion === "string" ? raw.schemaVersion : "1.0",
    inputHash:
      typeof raw.inputHash === "string" && raw.inputHash.trim().length > 0
        ? raw.inputHash
        : fallbackHashes.inputHash,
    manifestHash:
      typeof raw.manifestHash === "string" && raw.manifestHash.trim().length > 0
        ? raw.manifestHash
        : fallbackHashes.manifestHash,
    status,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : undefined,
    episodeId,
    characterPackId,
    provider,
    providerRequested: typeof raw.providerRequested === "string" ? raw.providerRequested : null,
    providerWarning: typeof raw.providerWarning === "string" ? raw.providerWarning : null,
    workflowHash,
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : "",
    mode,
    promptPreset,
    positivePrompt,
    negativePrompt,
    guardrails: parseStringArray(raw.guardrails),
    candidates,
    selectedByView: isRecord(raw.selectedByView)
      ? (raw.selectedByView as GenerationManifest["selectedByView"])
      : {}
  };
}

function extractChannelStylePresets(channelBibleJson: unknown): ChannelStylePreset[] {
  if (!isRecord(channelBibleJson)) {
    return [];
  }

  const candidates: unknown[] = [];
  if (Array.isArray(channelBibleJson.character_generator_style_presets)) {
    candidates.push(...channelBibleJson.character_generator_style_presets);
  }
  if (isRecord(channelBibleJson.character_generator) && Array.isArray(channelBibleJson.character_generator.style_presets)) {
    candidates.push(...channelBibleJson.character_generator.style_presets);
  }
  if (isRecord(channelBibleJson.character) && Array.isArray(channelBibleJson.character.style_presets)) {
    candidates.push(...channelBibleJson.character.style_presets);
  }

  const out: ChannelStylePreset[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    if (!isRecord(item)) {
      continue;
    }
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const label = typeof item.label === "string" && item.label.trim().length > 0 ? item.label.trim() : id;
    const positivePrompt =
      typeof item.positivePrompt === "string"
        ? item.positivePrompt.trim()
        : typeof item.positive === "string"
          ? item.positive.trim()
          : undefined;
    const negativePrompt =
      typeof item.negativePrompt === "string"
        ? item.negativePrompt.trim()
        : typeof item.negative === "string"
          ? item.negative.trim()
          : undefined;

    out.push({
      id,
      label,
      ...(positivePrompt && positivePrompt.length > 0 ? { positivePrompt } : {}),
      ...(negativePrompt && negativePrompt.length > 0 ? { negativePrompt } : {})
    });
  }

  return out;
}

function extractChannelPromptRules(channelBibleJson: unknown): {
  forbiddenTerms: string[];
  negativePromptTerms: string[];
} {
  if (!isRecord(channelBibleJson)) {
    return {
      forbiddenTerms: [],
      negativePromptTerms: []
    };
  }

  const forbiddenTerms = Array.from(
    new Set([
      ...parseStringArrayAtPath(channelBibleJson, ["policy", "forbidden_words"]),
      ...parseStringArrayAtPath(channelBibleJson, ["policy", "banned_phrases"]),
      ...parseStringArrayAtPath(channelBibleJson, ["character_generator", "forbidden_terms"])
    ])
  );

  const negativePromptTerms = Array.from(
    new Set([
      ...parseStringArrayAtPath(channelBibleJson, ["character_generator", "negative_prompt_terms"]),
      ...parseStringArrayAtPath(channelBibleJson, ["policy", "negative_prompt_terms"])
    ])
  );

  return {
    forbiddenTerms,
    negativePromptTerms
  };
}

function readStringAtPath(root: unknown, keys: string[]): string | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

function formatStudioDateTime(value: Date | null | undefined): string {
  return value ? value.toLocaleString("ko-KR", { hour12: false }) : "-";
}

function readQcIssues(qcReportRaw: unknown): Array<{ severity: string; check: string; message: string; details: unknown }> {
  if (!isRecord(qcReportRaw)) {
    return [];
  }

  const groups: unknown[] = [];
  if (Array.isArray(qcReportRaw.issues)) groups.push(qcReportRaw.issues);
  if (Array.isArray(qcReportRaw.findings)) groups.push(qcReportRaw.findings);
  if (Array.isArray(qcReportRaw.checks)) groups.push(qcReportRaw.checks);
  if (Array.isArray(qcReportRaw.results)) groups.push(qcReportRaw.results);

  const out: Array<{ severity: string; check: string; message: string; details: unknown }> = [];
  for (const group of groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const item of group) {
      if (!isRecord(item)) {
        continue;
      }
      const passed = item.passed;
      if (passed === true) {
        continue;
      }
      const severity =
        typeof item.severity === "string"
          ? item.severity
          : typeof item.level === "string"
            ? item.level
            : "WARN";
      const check =
        typeof item.check === "string"
          ? item.check
          : typeof item.rule === "string"
            ? item.rule
            : "unknown";
      const message =
        typeof item.message === "string"
          ? item.message
          : typeof item.reason === "string"
            ? item.reason
            : "issue detected";
      out.push({
        severity,
        check,
        message,
        details: "details" in item ? item.details : item
      });
    }
  }

  return out;
}

function basenameOrDash(filePath: string | null | undefined): string {
  return filePath ? path.basename(filePath) : "-";
}

function formatLineageTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const time = new Date(value);
  if (!Number.isNaN(time.getTime())) {
    return time.toLocaleString("ko-KR", { hour12: false });
  }
  return value;
}

function renderLineageLinks(links: Array<{ label: string; href: string | null }>): string {
  const items = links
    .filter((link) => link.href)
    .map((link) => `<a href="${escHtml(link.href)}">${escHtml(link.label)}</a>`)
    .join("");
  return items ? `<div class="quick-links">${items}</div>` : "";
}

function buildCharacterPackLineageSection(input: {
  lineage: CharacterPackLineage | null;
  selectedPackId: string;
  activePackId: string | null;
  compareHref: string | null;
}): string {
  if (!input.lineage) {
    return `<section class="card"><h3>Generated Pack Lineage</h3><div class="error">No generated character artifact root was found for <strong>${escHtml(
      input.selectedPackId
    )}</strong>. This page only reads existing generated pack artifacts; it does not rerun generation.</div>${renderLineageLinks([
      input.compareHref ? { label: "Compare vs active pack", href: input.compareHref } : null
    ].filter((item): item is { label: string; href: string | null } => Boolean(item)))}</section>`;
  }

  const lineage = input.lineage;
  const acceptanceTone = uiBadge(lineage.acceptanceStatus ?? "UNKNOWN");
  const qcTone = lineage.qcFailedCount > 0 ? "bad" : lineage.qcTotalCount > 0 ? "ok" : "muted";
  const repairTone = lineage.repairOpenCount > 0 ? "warn" : "ok";
  const actionLinks = renderLineageLinks(
    [
      { label: "Manifest", href: lineage.manifestUrl },
      { label: "Pack Meta", href: lineage.packMetaUrl },
      { label: "Pack JSON", href: lineage.packJsonUrl },
      { label: "Proposal", href: lineage.proposalUrl },
      { label: "Pack QC", href: lineage.qcReportUrl },
      { label: "Repair Tasks", href: lineage.repairTasksUrl },
      input.compareHref ? { label: "Compare vs active pack", href: input.compareHref } : null
    ].filter((item): item is { label: string; href: string | null } => Boolean(item))
  );

  const summaryCards = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px"><div style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#f8fbff"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5f7288">Pack Build</div><p style="margin:8px 0 0"><strong>${escHtml(
    formatLineageTimestamp(lineage.builtAt)
  )}</strong></p><p style="margin:6px 0 0;color:#516175">source: ${escHtml(lineage.sourceLabel)}</p><p style="margin:6px 0 0;color:#516175">manifest: ${escHtml(
    basenameOrDash(lineage.sourceManifestPath)
  )}</p></div><div style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#f8fbff"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5f7288">Acceptance Gate</div><p style="margin:8px 0 0"><span class="badge ${acceptanceTone}">${escHtml(
    lineage.acceptanceStatus ?? "unknown"
  )}</span></p><p style="margin:6px 0 0;color:#516175">QC: <span class="badge ${qcTone}">${escHtml(
    lineage.qcFailedCount > 0 ? `${lineage.qcFailedCount} flagged` : lineage.qcTotalCount > 0 ? "clear" : "missing"
  )}</span></p><p style="margin:6px 0 0;color:#516175">front master: ${escHtml(
    lineage.approvedFrontMasterPresent === null ? "-" : lineage.approvedFrontMasterPresent ? "approved" : "missing"
  )}</p></div><div style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#f8fbff"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5f7288">Repair Queue</div><p style="margin:8px 0 0"><span class="badge ${repairTone}">${escHtml(
    lineage.repairOpenCount > 0 ? `${lineage.repairOpenCount} open` : "clear"
  )}</span></p><p style="margin:6px 0 0;color:#516175">active pack: ${escHtml(input.activePackId ?? "-")}</p><p style="margin:6px 0 0;color:#516175">source image: ${escHtml(
    basenameOrDash(lineage.sourceImageRef)
  )}</p></div></div>`;

  const viewCards = lineage.viewEntries
    .map((entry) => {
      const tone = entry.approved === true ? "ok" : entry.approved === false ? "warn" : "muted";
      const preview = entry.fileUrl
        ? `<div style="border:1px solid #d8e1ec;border-radius:10px;background:#eef3f8;padding:8px;margin-bottom:10px"><img src="${escHtml(
            entry.fileUrl
          )}" alt="${escHtml(entry.view)} lineage asset" loading="lazy" style="display:block;width:100%;max-height:200px;object-fit:contain;border-radius:8px"/></div>`
        : "";
      const history =
        entry.repairHistory.length > 0
          ? `<ul style="margin:8px 0 0 18px;padding:0">${entry.repairHistory
              .slice(0, 3)
              .map((item) => `<li>${escHtml(item)}</li>`)
              .join("")}${entry.repairHistory.length > 3 ? `<li>+${entry.repairHistory.length - 3} more</li>` : ""}</ul>`
          : `<p style="margin:8px 0 0;color:#516175">repair history: none</p>`;
      return `<article style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#fff"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><h4 style="margin:0">${escHtml(
        entry.view
      )}</h4><p style="margin:6px 0 0;color:#516175">workflow: ${escHtml(entry.workflow ?? "-")}</p><p style="margin:6px 0 0;color:#516175">created: ${escHtml(
        formatLineageTimestamp(entry.createdAt)
      )}</p></div><span class="badge ${tone}">${escHtml(
        entry.approved === null ? "unknown" : entry.approved ? "approved" : "review"
      )}</span></div>${preview}<p style="margin:0;color:#516175">asset: ${escHtml(entry.assetId ?? "-")}</p><p style="margin:6px 0 0;color:#516175">parent: ${escHtml(
        basenameOrDash(entry.parentAssetPath))
      }</p><p style="margin:6px 0 0;color:#516175">version: ${escHtml(entry.workflowVersion ?? "-")}</p>${renderLineageLinks(
        [
          { label: "View Image", href: entry.fileUrl },
          { label: "Metadata", href: entry.metadataUrl },
          { label: "Parent Asset", href: entry.parentAssetUrl }
        ].filter((item) => item.href)
      )}${history}</article>`;
    })
    .join("");

  const repairRows = lineage.repairTasks
    .map(
      (task, index) =>
        `<tr><td>${index + 1}</td><td>${escHtml(task.code)}</td><td><span class="badge ${uiBadge(task.severity)}">${escHtml(
          task.severity
        )}</span></td><td>${escHtml(task.action)}</td><td>${escHtml(task.reason)}</td><td>${escHtml(
          task.assetPaths.map((assetPath) => path.basename(assetPath)).join(", ") || "-"
        )}</td></tr>`
    )
    .join("");

  return `<section class="card"><h3>Generated Pack Lineage</h3><p>Reads the generated character artifact tree directly so operators can inspect source image lineage, pack build inputs, and open repair tasks without rerunning generation.</p>${actionLinks}${summaryCards}<section class="card" style="margin-top:16px"><h4>View Lineage</h4><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${viewCards || '<div class="notice">No view lineage entries.</div>'}</div></section><section class="card" style="margin-top:16px"><h4>Repair Tasks</h4>${
    repairRows
      ? `<table><thead><tr><th>#</th><th>Code</th><th>Severity</th><th>Action</th><th>Reason</th><th>Assets</th></tr></thead><tbody>${repairRows}</tbody></table>`
      : `<div class="notice">No open repair tasks were recorded for this pack.</div>`
  }</section></section>`;
}

function parseCharacterGenerationInput(body: JsonRecord): CharacterGenerationInput {
  const mode = parseGenerationMode(body.mode);
  const provider = parseGenerationProvider(body.provider);
  const promptPreset = parsePromptPreset(body.promptPreset);
  const positivePrompt = optionalString(body, "positivePrompt");
  const negativePrompt = optionalString(body, "negativePrompt");
  const boostNegativePrompt = parseBoolean(body.boostNegativePrompt, "boostNegativePrompt", false);
  const referenceAssetId = optionalString(body, "referenceAssetId");
  const candidateCount = Math.min(parsePositiveInt(body.candidateCount, "candidateCount", 4), 8);
  const autoPick = parseBoolean(body.autoPick, "autoPick", true);
  const requireHitlPick = parseBoolean(body.requireHitlPick, "requireHitlPick", false);
  const seed = parsePositiveInt(body.seed, "seed", DEFAULT_GENERATION_SEED);
  const topic = optionalString(body, "topic");
  const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
  const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);

  if (mode === "reference" && !referenceAssetId) {
    throw createHttpError(400, "reference mode requires referenceAssetId");
  }

  return {
    mode,
    provider,
    promptPreset,
    ...(positivePrompt ? { positivePrompt } : {}),
    ...(negativePrompt ? { negativePrompt } : {}),
    boostNegativePrompt,
    ...(referenceAssetId ? { referenceAssetId } : {}),
    candidateCount,
    autoPick,
    requireHitlPick,
    seed,
    ...(topic ? { topic } : {}),
    maxAttempts,
    retryBackoffMs
  };
}

async function createCharacterGeneration(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    channelId?: string;
    generation: CharacterGenerationInput;
  }
): Promise<CharacterGenerationCreateResult> {
  const generation = input.generation;
  const fallbackChannel = input.channelId ? { id: input.channelId } : await ensureDefaultChannel(prisma);
  let channelId = fallbackChannel.id;

  if (generation.referenceAssetId) {
    const referenceAsset = await prisma.asset.findUnique({
      where: { id: generation.referenceAssetId },
      select: {
        id: true,
        channelId: true,
        status: true
      }
    });

    if (!referenceAsset) {
      throw createHttpError(404, `reference asset not found: ${generation.referenceAssetId}`);
    }

    if (referenceAsset.status !== "READY") {
      throw createHttpError(400, `reference asset is not READY: ${generation.referenceAssetId}`);
    }

    channelId = referenceAsset.channelId;
  }

  const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
  const duplicateSession = sessionDelegate
    ? await sessionDelegate.findFirst({
        where: {
          mode: toDbGenerationMode(generation.mode),
          provider: toDbGenerationProvider(generation.provider),
          promptPresetId: generation.promptPreset,
          positivePrompt: generation.positivePrompt ?? "",
          negativePrompt: generation.negativePrompt ?? "",
          seed: generation.seed,
          candidateCount: generation.candidateCount,
          referenceAssetId: generation.referenceAssetId ?? null,
          createdAt: {
            gte: new Date(Date.now() - GENERATION_DEDUPE_WINDOW_MS)
          },
          episode: {
            is: {
              channelId
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          episodeId: true,
          characterPackId: true,
          manifestPath: true,
          characterPack: {
            select: {
              id: true,
              version: true
            }
          }
        }
      })
    : null;

  if (duplicateSession?.episodeId && duplicateSession.characterPack?.id) {
    const relatedJobs = await prisma.job.findMany({
      where: {
        episodeId: duplicateSession.episodeId,
        type: {
          in: [GENERATE_CHARACTER_ASSETS_JOB_NAME, BUILD_CHARACTER_PACK_JOB_NAME, RENDER_CHARACTER_PREVIEW_JOB_NAME]
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        type: true,
        status: true,
        bullmqJobId: true
      }
    });

    const byType = new Map<string, (typeof relatedJobs)[number]>();
    for (const job of relatedJobs) {
      if (!byType.has(job.type)) {
        byType.set(job.type, job);
      }
    }

    const liveGenerateJob = byType.get(GENERATE_CHARACTER_ASSETS_JOB_NAME);
    const buildJob = byType.get(BUILD_CHARACTER_PACK_JOB_NAME);
    const previewJob = byType.get(RENDER_CHARACTER_PREVIEW_JOB_NAME);
    if (liveGenerateJob && isLiveJobStatus(liveGenerateJob.status) && buildJob && previewJob) {
      const manifestPath = duplicateSession.manifestPath ?? getGenerationManifestPath(liveGenerateJob.id);
      return {
        sessionId: duplicateSession.id,
        characterPackId: duplicateSession.characterPack.id,
        version: duplicateSession.characterPack.version,
        episodeId: duplicateSession.episodeId,
        generateJobId: liveGenerateJob.id,
        buildJobId: buildJob.id,
        previewJobId: previewJob.id,
        bullmqJobId: liveGenerateJob.bullmqJobId ?? "",
        manifestPath,
        generatorStatus: "PENDING_HITL",
        reusedExisting: true
      };
    }
  }

  const latestVersion = await prisma.characterPack.findFirst({
    where: { channelId },
    orderBy: { version: "desc" },
    select: { version: true }
  });

  const version = (latestVersion?.version ?? 0) + 1;

  const txResult = await prisma.$transaction(async (tx) => {
    const tempPackId = `character_pack_${channelId}_${version}_${Date.now()}`;
    const placeholderPack = buildPlaceholderPack({
      packId: tempPackId,
      name: `Character Pack v${version}`,
      sourceImageRef:
        generation.mode === "reference" ? `reference:${generation.referenceAssetId}` : `preset:${generation.promptPreset}`
    });

    const placeholderHash = sha256Hex(
      stableStringify({
        tempPackId,
        version,
        createdAt: new Date().toISOString(),
        generation: {
          mode: generation.mode,
          provider: generation.provider,
          promptPreset: generation.promptPreset
        }
      })
    );

    const characterPack = await tx.characterPack.create({
      data: {
        channelId,
        version,
        status: "DRAFT",
        schemaId: "character_pack.schema.json",
        hash: placeholderHash,
        json: placeholderPack
      }
    });

    const episode = await tx.episode.create({
      data: {
        channelId,
        topic: generation.topic ?? `Character Generated Preview v${version}`,
        status: "GENERATING",
        targetDurationSec: 120,
        characterPackId: characterPack.id,
        characterPackVersion: version
      }
    });

    const txSessionDelegate = getCharacterGenerationSessionDelegate(tx);
    const generationSession = txSessionDelegate
      ? await txSessionDelegate.create({
          data: {
            episodeId: episode.id,
            characterPackId: characterPack.id,
            mode: toDbGenerationMode(generation.mode),
            provider: toDbGenerationProvider(generation.provider),
            promptPresetId: generation.promptPreset,
            positivePrompt: generation.positivePrompt ?? "",
            negativePrompt: generation.negativePrompt ?? "",
            seed: generation.seed,
            candidateCount: generation.candidateCount,
            referenceAssetId: generation.referenceAssetId ?? null,
            status: "DRAFT",
            statusMessage: "Queued"
          }
        })
      : null;

    const previewJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: RENDER_CHARACTER_PREVIEW_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: generation.maxAttempts,
        retryBackoffMs: generation.retryBackoffMs
      }
    });

    const buildJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: BUILD_CHARACTER_PACK_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: generation.maxAttempts,
        retryBackoffMs: generation.retryBackoffMs
      }
    });

    const generateJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: GENERATE_CHARACTER_ASSETS_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: generation.maxAttempts,
        retryBackoffMs: generation.retryBackoffMs
      }
    });

    await tx.jobLog.createMany({
      data: [
        {
          jobId: generateJob.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: toPrismaJson({
            source: "api:character-generator:create",
            queueName,
            characterPackId: characterPack.id,
            version,
            generation
          })
        },
        {
          jobId: buildJob.id,
          level: "info",
          message: "Awaiting GENERATE_CHARACTER_ASSETS completion",
          details: toPrismaJson({
            source: "api:character-generator:create",
            parentJobType: GENERATE_CHARACTER_ASSETS_JOB_NAME,
            characterPackId: characterPack.id
          })
        },
        {
          jobId: previewJob.id,
          level: "info",
          message: "Awaiting BUILD_CHARACTER_PACK completion",
          details: toPrismaJson({
            source: "api:character-generator:create",
            parentJobType: BUILD_CHARACTER_PACK_JOB_NAME,
            characterPackId: characterPack.id
          })
        }
      ]
    });

    return {
      characterPack,
      episode,
      generationSessionId: generationSession?.id ?? `legacy-${generateJob.id}`,
      buildJob,
      previewJob,
      generateJob,
      version
    };
  });

  const manifestPath = getGenerationManifestPath(txResult.generateJob.id);
  const payload = {
    jobDbId: txResult.generateJob.id,
    episodeId: txResult.episode.id,
    schemaChecks: [],
    character: {
      characterPackId: txResult.characterPack.id,
      version: txResult.version,
      buildJobDbId: txResult.buildJob.id,
      previewJobDbId: txResult.previewJob.id,
      generation: {
        sessionId: txResult.generationSessionId,
        mode: generation.mode,
        provider: generation.provider,
        promptPreset: generation.promptPreset,
        positivePrompt: generation.positivePrompt,
        negativePrompt: generation.negativePrompt,
        boostNegativePrompt: generation.boostNegativePrompt,
        referenceAssetId: generation.referenceAssetId,
        candidateCount: generation.candidateCount,
        autoPick: generation.autoPick,
        requireHitlPick: generation.requireHitlPick,
        seed: generation.seed,
        manifestPath
      }
    }
  } as unknown as EpisodeJobPayload;

  const enqueueResult = await enqueueWithResilience({
    queue,
    name: GENERATE_CHARACTER_ASSETS_JOB_NAME,
    payload,
    maxAttempts: txResult.generateJob.maxAttempts,
    backoffMs: txResult.generateJob.retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: txResult.generateJob.id },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await tx.jobLog.create({
      data: {
        jobId: txResult.generateJob.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:character-generator:create",
          queueName,
          bullmqJobId,
          manifestPath,
          characterPackId: txResult.characterPack.id,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });
  });

  return {
    sessionId: txResult.generationSessionId,
    characterPackId: txResult.characterPack.id,
    version: txResult.version,
    episodeId: txResult.episode.id,
    generateJobId: txResult.generateJob.id,
    buildJobId: txResult.buildJob.id,
    previewJobId: txResult.previewJob.id,
    bullmqJobId,
    manifestPath,
    generatorStatus: generation.requireHitlPick || !generation.autoPick ? "PENDING_HITL" : "AUTO_SELECTED",
    reusedExisting: false
  };
}

async function createCharacterGenerationPick(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    generateJobId: string;
    selection: CharacterGenerationSelection;
  }
): Promise<{
  sessionId: string;
  episodeId: string;
  generateJobId: string;
  buildJobId: string;
  previewJobId: string;
  bullmqJobId: string;
  manifestPath: string;
}> {
  const sourceGenerateJob = await prisma.job.findUnique({
    where: { id: input.generateJobId },
    include: {
      episode: {
        select: {
          id: true,
          channelId: true,
          topic: true,
          characterPackId: true,
          characterPackVersion: true
        }
      }
    }
  });

  if (!sourceGenerateJob) {
    throw createHttpError(404, "generate job not found");
  }

  if (sourceGenerateJob.type !== GENERATE_CHARACTER_ASSETS_JOB_NAME) {
    throw createHttpError(400, "job is not GENERATE_CHARACTER_ASSETS");
  }

  const episode = sourceGenerateJob.episode;
  if (!episode.characterPackId || !episode.characterPackVersion) {
    throw createHttpError(400, "episode does not have characterPack metadata");
  }

  const manifestPath = getGenerationManifestPath(sourceGenerateJob.id);
  const manifest = readGenerationManifest(manifestPath);
  if (!manifest) {
    throw createHttpError(404, `generation manifest not found: ${manifestPath}`);
  }

  const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
  const fallbackSession = sessionDelegate
    ? await sessionDelegate.findFirst({
        where: {
          episodeId: episode.id,
          characterPackId: episode.characterPackId
        },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      })
    : null;
  const sessionId = manifest.sessionId ?? fallbackSession?.id;
  if (!sessionId) {
    throw createHttpError(400, "generation session not found for this job");
  }

  const byId = new Map(manifest.candidates.map((candidate) => [candidate.id, candidate]));
  const front = byId.get(input.selection.front);
  const threeQuarter = byId.get(input.selection.threeQuarter);
  const profile = byId.get(input.selection.profile);
  if (!front || front.view !== "front") {
    throw createHttpError(400, "front candidate is invalid");
  }
  if (!threeQuarter || threeQuarter.view !== "threeQuarter") {
    throw createHttpError(400, "threeQuarter candidate is invalid");
  }
  if (!profile || profile.view !== "profile") {
    throw createHttpError(400, "profile candidate is invalid");
  }

  for (const candidate of [front, threeQuarter, profile]) {
    const absPath = path.isAbsolute(candidate.filePath)
      ? candidate.filePath
      : path.resolve(path.dirname(manifestPath), candidate.filePath);
    if (!fs.existsSync(absPath)) {
      throw createHttpError(400, `selected candidate file not found: ${absPath}`);
    }
  }

  const maxAttempts = sourceGenerateJob.maxAttempts;
  const retryBackoffMs = sourceGenerateJob.retryBackoffMs;

  const tx = await prisma.$transaction(async (trx) => {
    const previewJob = await trx.job.create({
      data: {
        episodeId: episode.id,
        type: RENDER_CHARACTER_PREVIEW_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs
      }
    });

    const buildJob = await trx.job.create({
      data: {
        episodeId: episode.id,
        type: BUILD_CHARACTER_PACK_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs
      }
    });

    const generateJob = await trx.job.create({
      data: {
        episodeId: episode.id,
        type: GENERATE_CHARACTER_ASSETS_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs
      }
    });

    await trx.jobLog.createMany({
      data: [
        {
          jobId: generateJob.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: toPrismaJson({
            source: "api:character-generator:pick",
            queueName,
            manifestPath,
            selection: input.selection
          })
        },
        {
          jobId: buildJob.id,
          level: "info",
          message: "Awaiting GENERATE_CHARACTER_ASSETS completion (HITL pick)",
          details: toPrismaJson({
            source: "api:character-generator:pick",
            parentJobType: GENERATE_CHARACTER_ASSETS_JOB_NAME,
            characterPackId: episode.characterPackId
          })
        },
        {
          jobId: previewJob.id,
          level: "info",
          message: "Awaiting BUILD_CHARACTER_PACK completion (HITL pick)",
          details: toPrismaJson({
            source: "api:character-generator:pick",
            parentJobType: BUILD_CHARACTER_PACK_JOB_NAME,
            characterPackId: episode.characterPackId
          })
        }
      ]
    });

    return {
      buildJobId: buildJob.id,
      previewJobId: previewJob.id,
      generateJobId: generateJob.id
    };
  });

  const payload = {
    jobDbId: tx.generateJobId,
    episodeId: episode.id,
    schemaChecks: [],
    character: {
      characterPackId: episode.characterPackId,
      version: episode.characterPackVersion,
      buildJobDbId: tx.buildJobId,
      previewJobDbId: tx.previewJobId,
      generation: {
        sessionId,
        mode: manifest.mode === "reference" ? "reference" : "new",
        provider: manifest.provider === "comfyui" ? "comfyui" : "mock",
        promptPreset: manifest.promptPreset,
        positivePrompt: manifest.positivePrompt,
        negativePrompt: manifest.negativePrompt,
        autoPick: false,
        requireHitlPick: false,
        seed: front.seed,
        candidateCount: 3,
        manifestPath,
        selectedCandidateIds: input.selection
      }
    }
  } as unknown as EpisodeJobPayload;

  const enqueueResult = await enqueueWithResilience({
    queue,
    name: GENERATE_CHARACTER_ASSETS_JOB_NAME,
    payload,
    maxAttempts,
    backoffMs: retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);

  await prisma.$transaction(async (trx) => {
    await trx.job.update({
      where: { id: tx.generateJobId },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await trx.jobLog.create({
      data: {
        jobId: tx.generateJobId,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:character-generator:pick",
          queueName,
          bullmqJobId,
          manifestPath,
          selection: input.selection,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });

    await trx.agentSuggestion.updateMany({
      where: {
        episodeId: episode.id,
        type: "HITL_REVIEW",
        status: "PENDING"
      },
      data: {
        status: "APPLIED"
      }
    });
  });

  return {
    sessionId,
    episodeId: episode.id,
    generateJobId: tx.generateJobId,
    buildJobId: tx.buildJobId,
    previewJobId: tx.previewJobId,
    bullmqJobId,
    manifestPath
  };
}

async function createCharacterGenerationRegenerateView(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    generateJobId: string;
    viewToGenerate: CharacterGenerationView;
    candidateCount: number;
    seed?: number;
    regenerateSameSeed: boolean;
    boostNegativePrompt: boolean;
  }
): Promise<CharacterGenerationRegenerateResult> {
  const sourceGenerateJob = await prisma.job.findUnique({
    where: { id: input.generateJobId },
    include: {
      episode: {
        select: {
          id: true,
          characterPackId: true,
          characterPackVersion: true
        }
      }
    }
  });

  if (!sourceGenerateJob) {
    throw createHttpError(404, "generate job not found");
  }
  if (sourceGenerateJob.type !== GENERATE_CHARACTER_ASSETS_JOB_NAME) {
    throw createHttpError(400, "job is not GENERATE_CHARACTER_ASSETS");
  }

  const episode = sourceGenerateJob.episode;
  if (!episode.characterPackId || !episode.characterPackVersion) {
    throw createHttpError(400, "episode does not have characterPack metadata");
  }

  const sourceManifestPath = getGenerationManifestPath(sourceGenerateJob.id);
  const manifest = readGenerationManifest(sourceManifestPath);
  if (!manifest) {
    throw createHttpError(404, `generation manifest not found: ${sourceManifestPath}`);
  }

  const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
  const fallbackSession = sessionDelegate
    ? await sessionDelegate.findFirst({
        where: {
          episodeId: episode.id,
          characterPackId: episode.characterPackId
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          referenceAssetId: true
        }
      })
    : null;
  const sessionId = manifest.sessionId ?? fallbackSession?.id;
  if (!sessionId) {
    throw createHttpError(400, "generation session not found for this job");
  }

  const firstCandidateForView = manifest.candidates.find((candidate) => candidate.view === input.viewToGenerate);
  const seed = input.regenerateSameSeed
    ? (firstCandidateForView?.seed ?? Number.parseInt(String(sourceGenerateJob.attemptsMade + 1), 10) + DEFAULT_GENERATION_SEED)
    : (input.seed ?? (firstCandidateForView?.seed ?? DEFAULT_GENERATION_SEED) + 1);

  const generateJob = await prisma.job.create({
    data: {
      episodeId: episode.id,
      type: GENERATE_CHARACTER_ASSETS_JOB_NAME,
      status: "QUEUED",
      progress: 0,
      maxAttempts: sourceGenerateJob.maxAttempts,
      retryBackoffMs: sourceGenerateJob.retryBackoffMs
    }
  });

  const manifestPath = getGenerationManifestPath(generateJob.id);
  const payload = {
    jobDbId: generateJob.id,
    episodeId: episode.id,
    schemaChecks: [],
    character: {
      characterPackId: episode.characterPackId,
      version: episode.characterPackVersion,
      generation: {
        sessionId,
        mode: manifest.mode === "reference" ? "reference" : "new",
        provider: manifest.provider === "comfyui" ? "comfyui" : "mock",
        promptPreset: manifest.promptPreset,
        positivePrompt: manifest.positivePrompt,
        negativePrompt: manifest.negativePrompt,
        boostNegativePrompt: input.boostNegativePrompt,
        referenceAssetId: fallbackSession?.referenceAssetId ?? undefined,
        candidateCount: input.candidateCount,
        autoPick: false,
        requireHitlPick: true,
        seed,
        viewToGenerate: input.viewToGenerate,
        regenerateSameSeed: input.regenerateSameSeed,
        manifestPath
      }
    }
  } as unknown as EpisodeJobPayload;

  const enqueueResult = await enqueueWithResilience({
    queue,
    name: GENERATE_CHARACTER_ASSETS_JOB_NAME,
    payload,
    maxAttempts: generateJob.maxAttempts,
    backoffMs: generateJob.retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);

  await prisma.$transaction(async (trx) => {
    await trx.job.update({
      where: { id: generateJob.id },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await trx.jobLog.create({
      data: {
        jobId: generateJob.id,
        level: "info",
        message: "Transition -> ENQUEUED (view regenerate)",
        details: toPrismaJson({
          source: "api:character-generator:regenerate-view",
          queueName,
          bullmqJobId,
          sessionId,
          viewToGenerate: input.viewToGenerate,
          regenerateSameSeed: input.regenerateSameSeed,
          seed,
          manifestPath,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });

    const txSessionDelegate = getCharacterGenerationSessionDelegate(trx);
    if (txSessionDelegate) {
      await txSessionDelegate.update({
        where: { id: sessionId },
        data: {
          status: "GENERATING",
          viewToGenerate:
            input.viewToGenerate === "front"
              ? "FRONT"
              : input.viewToGenerate === "threeQuarter"
                ? "THREE_QUARTER"
                : "PROFILE",
          statusMessage: `Regenerating ${input.viewToGenerate} candidates`
        }
      });
    }
  });

  return {
    sessionId,
    view: input.viewToGenerate,
    generateJobId: generateJob.id,
    bullmqJobId,
    manifestPath
  };
}

async function createCharacterGenerationRecreate(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    generateJobId: string;
    candidateCount: number;
    seed?: number;
    regenerateSameSeed: boolean;
    boostNegativePrompt: boolean;
  }
): Promise<CharacterGenerationRecreateResult> {
  const sourceGenerateJob = await prisma.job.findUnique({
    where: { id: input.generateJobId },
    include: {
      episode: {
        select: {
          id: true,
          characterPackId: true,
          characterPackVersion: true
        }
      }
    }
  });

  if (!sourceGenerateJob) {
    throw createHttpError(404, "generate job not found");
  }
  if (sourceGenerateJob.type !== GENERATE_CHARACTER_ASSETS_JOB_NAME) {
    throw createHttpError(400, "job is not GENERATE_CHARACTER_ASSETS");
  }

  const episode = sourceGenerateJob.episode;
  if (!episode.characterPackId || !episode.characterPackVersion) {
    throw createHttpError(400, "episode does not have characterPack metadata");
  }

  const sourceManifestPath = getGenerationManifestPath(sourceGenerateJob.id);
  const manifest = readGenerationManifest(sourceManifestPath);
  if (!manifest) {
    throw createHttpError(404, `generation manifest not found: ${sourceManifestPath}`);
  }

  if (!manifest.inputHash || !manifest.manifestHash) {
    throw createHttpError(400, "manifest hash fields are missing");
  }

  const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
  const fallbackSession = sessionDelegate
    ? await sessionDelegate.findFirst({
        where: {
          episodeId: episode.id,
          characterPackId: episode.characterPackId
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          referenceAssetId: true
        }
      })
    : null;
  const sessionId = manifest.sessionId ?? fallbackSession?.id;
  if (!sessionId) {
    throw createHttpError(400, "generation session not found for this job");
  }

  const previousSeed = manifest.candidates[0]?.seed ?? DEFAULT_GENERATION_SEED;
  const seed = input.regenerateSameSeed ? previousSeed : (input.seed ?? previousSeed + 1);

  const generateJob = await prisma.job.create({
    data: {
      episodeId: episode.id,
      type: GENERATE_CHARACTER_ASSETS_JOB_NAME,
      status: "QUEUED",
      progress: 0,
      maxAttempts: sourceGenerateJob.maxAttempts,
      retryBackoffMs: sourceGenerateJob.retryBackoffMs
    }
  });

  const manifestPath = getGenerationManifestPath(generateJob.id);
  const provider =
    manifest.provider === "comfyui" ? "comfyui" : "mock";
  const payload = {
    jobDbId: generateJob.id,
    episodeId: episode.id,
    schemaChecks: [],
    character: {
      characterPackId: episode.characterPackId,
      version: episode.characterPackVersion,
      generation: {
        sessionId,
        mode: manifest.mode === "reference" ? "reference" : "new",
        provider,
        promptPreset: manifest.promptPreset,
        positivePrompt: manifest.positivePrompt,
        negativePrompt: manifest.negativePrompt,
        boostNegativePrompt: input.boostNegativePrompt,
        referenceAssetId: fallbackSession?.referenceAssetId ?? undefined,
        candidateCount: input.candidateCount,
        autoPick: false,
        requireHitlPick: true,
        seed,
        regenerateSameSeed: input.regenerateSameSeed,
        manifestPath
      }
    }
  } as unknown as EpisodeJobPayload;

  const enqueueResult = await enqueueWithResilience({
    queue,
    name: GENERATE_CHARACTER_ASSETS_JOB_NAME,
    payload,
    maxAttempts: generateJob.maxAttempts,
    backoffMs: generateJob.retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);

  await prisma.$transaction(async (trx) => {
    await trx.job.update({
      where: { id: generateJob.id },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await trx.jobLog.create({
      data: {
        jobId: generateJob.id,
        level: "info",
        message: "Transition -> ENQUEUED (recreate)",
        details: toPrismaJson({
          source: "api:character-generator:recreate",
          queueName,
          bullmqJobId,
          sessionId,
          sourceGenerateJobId: input.generateJobId,
          sourceManifestPath,
          sourceManifestHash: manifest.manifestHash,
          sourceInputHash: manifest.inputHash,
          regenerateSameSeed: input.regenerateSameSeed,
          seed,
          manifestPath,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });
  });

  return {
    sessionId,
    generateJobId: generateJob.id,
    bullmqJobId,
    manifestPath,
    seed
  };
}

async function createCharacterPack(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    assetIds: CharacterAssetIds;
    topic?: string;
    maxAttempts: number;
    retryBackoffMs: number;
  }
): Promise<CharacterCreateResult> {
  const assetIds = input.assetIds;
  const requestedIds = [assetIds.front, assetIds.threeQuarter, assetIds.profile];

  const assets = await prisma.asset.findMany({
    where: {
      id: { in: requestedIds }
    },
    select: {
      id: true,
      channelId: true,
      status: true,
      normalizedKey1024: true,
      originalKey: true,
      createdAt: true
    }
  });

  if (assets.length !== 3) {
    throw createHttpError(404, "One or more assets were not found");
  }

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const id of requestedIds) {
    const asset = byId.get(id);
    if (!asset) {
      throw createHttpError(404, `Asset not found: ${id}`);
    }

    if (asset.status !== "READY") {
      throw createHttpError(400, `Asset is not READY: ${id}`);
    }
  }

  const channelId = assets[0].channelId;
  const sameChannel = assets.every((asset) => asset.channelId === channelId);
  if (!sameChannel) {
    throw createHttpError(400, "All assets must belong to the same channel");
  }

  const latestVersion = await prisma.characterPack.findFirst({
    where: { channelId },
    orderBy: { version: "desc" },
    select: { version: true }
  });

  const version = (latestVersion?.version ?? 0) + 1;

  const txResult = await prisma.$transaction(async (tx) => {
    const tempPackId = `character_pack_${channelId}_${version}_${Date.now()}`;
    const placeholderPack = buildPlaceholderPack({
      packId: tempPackId,
      name: `Character Pack v${version}`,
      sourceImageRef: `${assetIds.front},${assetIds.threeQuarter},${assetIds.profile}`
    });

    const placeholderHash = sha256Hex(
      stableStringify({
        tempPackId,
        version,
        createdAt: new Date().toISOString(),
        assets: assetIds
      })
    );

    const characterPack = await tx.characterPack.create({
      data: {
        channelId,
        version,
        status: "DRAFT",
        schemaId: "character_pack.schema.json",
        hash: placeholderHash,
        json: placeholderPack
      }
    });

    const episode = await tx.episode.create({
      data: {
        channelId,
        topic: input.topic ?? `Character Preview v${version}`,
        status: "GENERATING",
        targetDurationSec: 120,
        characterPackId: characterPack.id,
        characterPackVersion: version
      }
    });

    const previewJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: RENDER_CHARACTER_PREVIEW_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: input.maxAttempts,
        retryBackoffMs: input.retryBackoffMs
      }
    });

    const buildJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: BUILD_CHARACTER_PACK_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: input.maxAttempts,
        retryBackoffMs: input.retryBackoffMs
      }
    });

    await tx.jobLog.createMany({
      data: [
        {
          jobId: buildJob.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: toPrismaJson({
            source: "api:character-packs:create",
            queueName,
            characterPackId: characterPack.id,
            version,
            assetIds
          })
        },
        {
          jobId: previewJob.id,
          level: "info",
          message: "Awaiting BUILD_CHARACTER_PACK completion",
          details: toPrismaJson({
            source: "api:character-packs:create",
            parentJobType: BUILD_CHARACTER_PACK_JOB_NAME,
            characterPackId: characterPack.id,
            version
          })
        }
      ]
    });

    return {
      characterPack,
      episode,
      buildJob,
      previewJob,
      version
    };
  });

  const payload = {
    jobDbId: txResult.buildJob.id,
    episodeId: txResult.episode.id,
    schemaChecks: [],
    character: {
      characterPackId: txResult.characterPack.id,
      version: txResult.version,
      previewJobDbId: txResult.previewJob.id,
      assetIds
    }
  } as unknown as EpisodeJobPayload;

  const enqueueResult = await enqueueWithResilience({
    queue,
    name: BUILD_CHARACTER_PACK_JOB_NAME,
    payload,
    maxAttempts: txResult.buildJob.maxAttempts,
    backoffMs: txResult.buildJob.retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: txResult.buildJob.id },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await tx.jobLog.create({
      data: {
        jobId: txResult.buildJob.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:character-packs:create",
          queueName,
          bullmqJobId,
          characterPackId: txResult.characterPack.id,
          previewJobId: txResult.previewJob.id,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });
  });

  return {
    characterPackId: txResult.characterPack.id,
    version: txResult.version,
    previewJobId: txResult.previewJob.id,
    buildJobId: txResult.buildJob.id,
    episodeId: txResult.episode.id,
    bullmqJobId
  };
}

function toCharacterPackResponse(pack: {
  id: string;
  channelId: string;
  version: number;
  status: string;
  schemaId: string;
  hash: string;
  json: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  const artifacts = getCharacterArtifacts(pack.id);

  return {
    id: pack.id,
    channelId: pack.channelId,
    version: pack.version,
    status: pack.status,
    schemaId: pack.schemaId,
    hash: pack.hash,
    json: pack.json,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    artifacts: {
      outDir: artifacts.outDir,
      packJsonPath: artifacts.packJsonPath,
      previewPath: artifacts.previewPath,
      qcReportPath: artifacts.qcReportPath,
      packJsonExists: fs.existsSync(artifacts.packJsonPath),
      previewExists: fs.existsSync(artifacts.previewPath),
      qcReportExists: fs.existsSync(artifacts.qcReportPath),
      packJsonUrl: `/artifacts/characters/${encodeURIComponent(pack.id)}/pack.json`,
      previewUrl: `/artifacts/characters/${encodeURIComponent(pack.id)}/preview.mp4`,
      qcReportUrl: `/artifacts/characters/${encodeURIComponent(pack.id)}/qc_report.json`
    }
  };
}

export function registerCharacterRoutes(input: RegisterCharacterRoutesInput): void {
  const { app, prisma, queue, queueName } = input;

  app.get("/api/character-packs", async (request) => {
    const query = isRecord(request.query) ? request.query : {};
    const limit = Math.min(parsePositiveInt(query.limit, "limit", 30), MAX_LIST);

    const packs = await prisma.characterPack.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        episodes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            topic: true,
            status: true,
            createdAt: true
          }
        }
      }
    });

    return {
      data: packs.map((pack) => ({
        ...toCharacterPackResponse(pack),
        latestEpisode: pack.episodes[0] ?? null
      }))
    };
  });

  app.get("/api/character-packs/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");

    const pack = await prisma.characterPack.findUnique({
      where: { id },
      include: {
        episodes: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            jobs: {
              orderBy: { createdAt: "desc" },
              take: 20,
              include: {
                logs: {
                  orderBy: { createdAt: "asc" },
                  take: 50
                }
              }
            }
          }
        }
      }
    });

    if (!pack) {
      throw createHttpError(404, "character pack not found");
    }

    return {
      data: {
        ...toCharacterPackResponse(pack),
        episodes: pack.episodes
      }
    };
  });

  app.post("/api/character-packs/create", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const assetIds = parseAssetIdsFromBody(body);
    const topic = optionalString(body, "topic");
    const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
    const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);

    const created = await createCharacterPack(prisma, queue, queueName, {
      assetIds,
      topic,
      maxAttempts,
      retryBackoffMs
    });

    return reply.code(201).send({
      data: {
        characterPackId: created.characterPackId,
        version: created.version,
        previewJobId: created.previewJobId,
        buildJobId: created.buildJobId,
        episodeId: created.episodeId,
        bullmqJobId: created.bullmqJobId
      }
    });
  });

  app.post("/api/character-generator/generate", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const channelId = optionalString(body, "channelId");
    const generation = parseCharacterGenerationInput(body);

    const created = await createCharacterGeneration(prisma, queue, queueName, {
      ...(channelId ? { channelId } : {}),
      generation
    });

    return reply.code(201).send({
      data: created
    });
  });

  app.get("/api/character-generator/jobs/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        episode: {
          select: {
            id: true,
            topic: true,
            status: true,
            characterPackId: true
          }
        },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 20
        }
      }
    });

    if (!job) {
      throw createHttpError(404, "generation job not found");
    }

    if (job.type !== GENERATE_CHARACTER_ASSETS_JOB_NAME) {
      throw createHttpError(400, "job is not GENERATE_CHARACTER_ASSETS");
    }

    const manifestPath = getGenerationManifestPath(job.id);
    const manifest = readGenerationManifest(manifestPath);
    const failureSummary = pickFirstLine(job.lastError);

    return {
      data: {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.maxAttempts,
        retryBackoffMs: job.retryBackoffMs,
        bullmqJobId: job.bullmqJobId,
        lastError: job.lastError,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        episode: job.episode,
        manifestPath,
        manifestExists: manifest !== null,
        manifest,
        sessionId: manifest?.sessionId ?? null,
        failureSummary,
        logs: job.logs
      }
    };
  });

  app.post("/api/character-generator/pick", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const generateJobId = optionalString(body, "generateJobId");
    if (!generateJobId) {
      throw createHttpError(400, "generateJobId is required");
    }

    const selection: CharacterGenerationSelection = {
      front: optionalString(body, "frontCandidateId") ?? "",
      threeQuarter: optionalString(body, "threeQuarterCandidateId") ?? "",
      profile: optionalString(body, "profileCandidateId") ?? ""
    };

    if (!selection.front || !selection.threeQuarter || !selection.profile) {
      throw createHttpError(400, "frontCandidateId/threeQuarterCandidateId/profileCandidateId are required");
    }

    const created = await createCharacterGenerationPick(prisma, queue, queueName, {
      generateJobId,
      selection
    });

    return reply.code(201).send({
      data: created
    });
  });

  app.post("/api/character-generator/regenerate-view", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const generateJobId = optionalString(body, "generateJobId");
    if (!generateJobId) {
      throw createHttpError(400, "generateJobId is required");
    }

    const viewToGenerate = parseGenerationView(body.viewToGenerate, "viewToGenerate");
    const candidateCount = Math.min(parsePositiveInt(body.candidateCount, "candidateCount", 4), 8);
    const regenerateSameSeed = parseBoolean(body.regenerateSameSeed, "regenerateSameSeed", true);
    const seed = parsePositiveInt(body.seed, "seed", DEFAULT_GENERATION_SEED);
    const boostNegativePrompt = parseBoolean(body.boostNegativePrompt, "boostNegativePrompt", false);

    const created = await createCharacterGenerationRegenerateView(prisma, queue, queueName, {
      generateJobId,
      viewToGenerate,
      candidateCount,
      seed,
      regenerateSameSeed,
      boostNegativePrompt
    });

    return reply.code(201).send({
      data: created
    });
  });

  app.post("/api/character-generator/recreate", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const generateJobId = optionalString(body, "generateJobId");
    if (!generateJobId) {
      throw createHttpError(400, "generateJobId is required");
    }

    const candidateCount = Math.min(parsePositiveInt(body.candidateCount, "candidateCount", 4), 8);
    const regenerateSameSeed = parseBoolean(body.regenerateSameSeed, "regenerateSameSeed", true);
    const seed = parsePositiveInt(body.seed, "seed", DEFAULT_GENERATION_SEED);
    const boostNegativePrompt = parseBoolean(body.boostNegativePrompt, "boostNegativePrompt", false);

    const created = await createCharacterGenerationRecreate(prisma, queue, queueName, {
      generateJobId,
      candidateCount,
      seed,
      regenerateSameSeed,
      boostNegativePrompt
    });

    return reply.code(201).send({
      data: created
    });
  });

  app.get("/ui/studio", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const message = optionalString(query, "message");
    const error = optionalString(query, "error");
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (routeError) {
      if (isDbUnavailableError(routeError)) {
        request.log.warn(
          {
            error_code: "database_unavailable",
            dependency: "postgresql",
            hint: "Start PostgreSQL and retry.",
            route: "/ui/studio"
          },
          "UI fallback: database unavailable"
        );
        const body = renderDbUnavailableCard({
          title: "Studio (DB Fallback)",
          route: "/ui/studio",
          requestId: request.id
        });
        return reply.code(503).type("text/html; charset=utf-8").send(uiPage("Studio", body));
      }
      throw routeError;
    }
    const [activeChannelBible, recentPacks] = await Promise.all([
      prisma.channelBible.findFirst({
        where: { isActive: true },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          channelId: true,
          version: true,
          updatedAt: true,
          json: true
        }
      }),
      prisma.characterPack.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          version: true,
          status: true,
          createdAt: true
        }
      })
    ]);
    const promptRules = extractChannelPromptRules(activeChannelBible?.json);
    const stylePresets = extractChannelStylePresets(activeChannelBible?.json);
    const activePack = recentPacks.find((pack) => pack.status === "APPROVED") ?? null;
    const latestPack = recentPacks[0] ?? null;
    const approvedPacks = recentPacks.filter((pack) => pack.status === "APPROVED");
    const archivedCount = recentPacks.filter((pack) => pack.status === "ARCHIVED").length;
    const pendingCount = recentPacks.filter((pack) => !["APPROVED", "ARCHIVED"].includes(pack.status)).length;
    const channelProfile = {
      source: activeChannelBible ? `DB v${activeChannelBible.version}` : "Snapshot",
      channelName: readStringAtPath(activeChannelBible?.json, ["channel", "name"]) ?? "Eraser Cat",
      channelId: activeChannelBible?.channelId ?? "",
      language: readStringAtPath(activeChannelBible?.json, ["channel", "language"]) ?? "ko-KR",
      tone: readStringAtPath(activeChannelBible?.json, ["style", "tone"]) ?? "default",
      pacing: readStringAtPath(activeChannelBible?.json, ["style", "pacing"]) ?? "default",
      stylePresetCount: stylePresets.length,
      forbiddenTermsSummary: promptRules.forbiddenTerms.length > 0 ? promptRules.forbiddenTerms.slice(0, 3).join(", ") : "(none)",
      negativeTermsSummary: promptRules.negativePromptTerms.length > 0 ? promptRules.negativePromptTerms.slice(0, 3).join(", ") : "(none)",
      updatedAt: formatStudioDateTime(activeChannelBible?.updatedAt),
      editorHref: "/ui/channel-bible"
    };
    const compareHref = approvedPacks.length >= 2
      ? `/ui/character-generator/compare?leftPackId=${encodeURIComponent(approvedPacks[0].id)}&rightPackId=${encodeURIComponent(approvedPacks[1].id)}`
      : "";
    const packState = {
      activePackId: activePack?.id ?? "",
      activePackVersion: activePack ? String(activePack.version) : "-",
      activePackStatus: activePack?.status ?? "inactive",
      latestPackId: latestPack?.id ?? "",
      latestPackCreatedAt: formatStudioDateTime(latestPack?.createdAt),
      approvedCount: approvedPacks.length,
      archivedCount,
      pendingCount,
      compareHref,
      charactersHref: "/ui/characters",
      generatorHref: "/ui/character-generator"
    };
    return reply
      .type("text/html; charset=utf-8")
      .send(uiPage("Studio", buildStudioBody({ message, error, channelProfile, packState })));
  });

  app.get("/ui/character-generator", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const message = optionalString(query, "message");
    const error = optionalString(query, "error");
    const selectedJobId = optionalString(query, "jobId");

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (routeError) {
      if (isDbUnavailableError(routeError)) {
        request.log.warn(
          {
            error_code: "database_unavailable",
            dependency: "postgresql",
            hint: "Start PostgreSQL and retry.",
            route: "/ui/character-generator"
          },
          "UI fallback: database unavailable"
        );
        const body = renderDbUnavailableCard({
          title: "Character Generator (DB Fallback)",
          route: "/ui/character-generator",
          requestId: request.id
        });
        return reply.code(503).type("text/html; charset=utf-8").send(uiPage("Character Generator", body));
      }
      throw routeError;
    }

    const [readyAssets, recentJobs, approvedPacks, activeChannelBible] = await Promise.all([
      prisma.asset.findMany({
        where: {
          status: "READY",
          assetType: { in: ["CHARACTER_REFERENCE", "CHARACTER_VIEW"] }
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          assetType: true,
          channelId: true
        }
      }),
      prisma.job.findMany({
        where: { type: GENERATE_CHARACTER_ASSETS_JOB_NAME },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          episode: {
            select: {
              id: true,
              topic: true
            }
          }
        }
      }),
      prisma.characterPack.findMany({
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          version: true,
          status: true
        }
      }),
      prisma.channelBible.findFirst({
        where: { isActive: true },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { json: true }
      })
    ]);

    const stylePresetMap = new Map<string, { id: string; label: string }>();
    for (const preset of CHARACTER_STYLE_PRESETS) {
      stylePresetMap.set(preset.id, { id: preset.id, label: preset.label });
    }
    for (const preset of extractChannelStylePresets(activeChannelBible?.json)) {
      stylePresetMap.set(preset.id, { id: preset.id, label: preset.label });
    }
    const styleOptions = Array.from(stylePresetMap.values())
      .map((preset) => `<option value="${escHtml(preset.id)}">${escHtml(preset.label)}</option>`)
      .join("");
    const referenceOptions = readyAssets
      .map(
        (asset) =>
          `<option value="${escHtml(asset.id)}">${escHtml(asset.id)} (${escHtml(asset.assetType)}, channel=${escHtml(
            asset.channelId
          )})</option>`
      )
      .join("");

    const promptRules = extractChannelPromptRules(activeChannelBible?.json);
    const topSection = buildCharacterGeneratorTopSection({
      message,
      error,
      styleOptions,
      referenceOptions,
      defaultSeed: DEFAULT_GENERATION_SEED,
      forbiddenTermsSummary: promptRules.forbiddenTerms.length > 0 ? promptRules.forbiddenTerms.join(", ") : "(none)",
      negativeTermsSummary:
        promptRules.negativePromptTerms.length > 0 ? promptRules.negativePromptTerms.join(", ") : "(none)"
    });

    const selectedJob = selectedJobId ? recentJobs.find((job) => job.id === selectedJobId) ?? null : null;
    const selectedManifest = selectedJob ? readGenerationManifest(getGenerationManifestPath(selectedJob.id)) : null;

    const selectedSection = selectedJob
      ? `<section class="card"><h2>Selected Generation Job</h2><p>jobId: <strong>${escHtml(selectedJob.id)}</strong></p><p>status: <span class="badge ${uiBadge(
          selectedJob.status
        )}">${escHtml(selectedJob.status)}</span> / progress: ${escHtml(selectedJob.progress)}%</p><p>episode: ${
          selectedJob.episode
            ? `<a href="/ui/episodes/${escHtml(selectedJob.episode.id)}">${escHtml(selectedJob.episode.id)}</a> (${escHtml(
                selectedJob.episode.topic ?? "-"
              )})`
            : "-"
        }</p><div id="generation-status" class="notice" data-job-id="${escHtml(selectedJob.id)}">Polling latest status...</div><div class="actions"><button id="generation-retry" type="button" class="secondary" style="display:none">Retry now</button></div></section>`
      : `<section class="card"><h2>Selected Generation Job</h2><div class="notice">Select a job from the list below.</div></section>`;

    const regenerateSection = selectedJob
      ? `<section class="card"><h2>Regenerate View</h2><form method="post" action="/ui/character-generator/regenerate-view" class="grid two"><input type="hidden" name="generateJobId" value="${escHtml(
          selectedJob.id
        )}"/><label>View<select name="viewToGenerate"><option value="front">front</option><option value="threeQuarter">threeQuarter</option><option value="profile">profile</option></select></label><label>Candidate Count<input name="candidateCount" value="4"/></label><label>Seed<input name="seed" value="${DEFAULT_GENERATION_SEED}"/></label><label><input type="checkbox" name="regenerateSameSeed" value="true" checked/> Regenerate with same seed</label><label><input type="checkbox" name="boostNegativePrompt" value="true"/> Strengthen negative prompt</label><div class="actions" style="grid-column:1/-1"><button type="submit">Run View Regeneration</button></div></form></section>`
      : "";

    const candidateOptions = (view: CharacterGenerationView): string => {
      if (!selectedManifest) return "";
      return selectedManifest.candidates
        .filter((candidate) => candidate.view === view)
        .map(
          (candidate) =>
            `<option value="${escHtml(candidate.id)}">${escHtml(candidate.id)} (score=${escHtml(
              candidate.score.toFixed(3)
            )})</option>`
        )
        .join("");
    };
    const pickSection =
      selectedJob && selectedManifest
        ? `<section class="card"><h2>Pick Candidates (HITL)</h2><form method="post" action="/ui/character-generator/pick" class="grid two"><input type="hidden" name="generateJobId" value="${escHtml(
            selectedJob.id
          )}"/><label>Front Candidate<select name="frontCandidateId">${candidateOptions("front")}</select></label><label>ThreeQuarter Candidate<select name="threeQuarterCandidateId">${candidateOptions(
            "threeQuarter"
          )}</select></label><label>Profile Candidate<select name="profileCandidateId">${candidateOptions(
            "profile"
          )}</select></label><div class="actions" style="grid-column:1/-1"><button type="submit">Apply HITL Selection + Build Pack</button></div></form></section>`
        : `<section class="card"><h2>Pick Candidates (HITL)</h2><div class="notice">A selected generation job is required.</div></section>`;

    const previewSection =
      selectedManifest && selectedManifest.characterPackId
        ? (() => {
            const artifacts = getCharacterArtifacts(selectedManifest.characterPackId);
            const previewExists = fs.existsSync(artifacts.previewPath);
            const qcExists = fs.existsSync(artifacts.qcReportPath);
            return `<section class="card"><h2>Selected Pack Preview</h2><p>characterPackId: <a href="/ui/characters?characterPackId=${encodeURIComponent(
              selectedManifest.characterPackId
            )}">${escHtml(selectedManifest.characterPackId)}</a></p><p><a href="/artifacts/characters/${encodeURIComponent(
              selectedManifest.characterPackId
            )}/pack.json">pack.json</a> | <a href="/artifacts/characters/${encodeURIComponent(
              selectedManifest.characterPackId
            )}/preview.mp4">preview.mp4</a> | <a href="/artifacts/characters/${encodeURIComponent(
              selectedManifest.characterPackId
            )}/qc_report.json">qc_report.json</a></p><p>preview: <span class="badge ${
              previewExists ? "ok" : "bad"
            }">${previewExists ? "exists" : "missing"}</span> / qc: <span class="badge ${
              qcExists ? "ok" : "bad"
            }">${qcExists ? "exists" : "missing"}</span></p><form method="post" action="/ui/character-generator/set-active" class="inline"><input type="hidden" name="characterPackId" value="${escHtml(
              selectedManifest.characterPackId
            )}"/><button type="submit" class="secondary">Set Pack Active</button></form></section>`;
          })()
        : "";

    const rollbackSection =
      approvedPacks.length > 0
        ? `<section class="card"><h2>Rollback Active Pack</h2><form method="post" action="/ui/character-generator/rollback-active" class="grid two"><label>Target Pack<select name="targetCharacterPackId">${approvedPacks
            .map(
              (pack) =>
                `<option value="${escHtml(pack.id)}">${escHtml(pack.id)} (v${escHtml(pack.version)}, ${escHtml(pack.status)})</option>`
            )
            .join("")}</select></label><div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">Rollback Active Pack</button></div></form></section>`
        : `<section class="card"><h2>Rollback Active Pack</h2><div class="notice">No approved packs available.</div></section>`;

    const compareSection =
      approvedPacks.length >= 2
        ? `<section class="card"><h2>Compare Approved Packs</h2><form method="get" action="/ui/character-generator/compare" class="grid two"><label>Left Pack<select name="leftPackId">${approvedPacks
            .map((pack) => `<option value="${escHtml(pack.id)}">${escHtml(pack.id)} (v${escHtml(pack.version)})</option>`)
            .join("")}</select></label><label>Right Pack<select name="rightPackId">${approvedPacks
            .map((pack, index) => `<option value="${escHtml(pack.id)}"${index === 1 ? " selected" : ""}>${escHtml(
              pack.id
            )} (v${escHtml(pack.version)})</option>`)
            .join("")}</select></label><div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">Open A/B Compare</button></div></form></section>`
        : `<section class="card"><h2>Compare Approved Packs</h2><div class="notice">At least two approved packs are required.</div></section>`;

    const rows = recentJobs
      .map((job) => {
        const manifest = readGenerationManifest(getGenerationManifestPath(job.id));
        return `<tr><td><a href="/ui/character-generator?jobId=${encodeURIComponent(job.id)}">${escHtml(
          job.id
        )}</a></td><td>${job.episode ? `<a href="/ui/episodes/${escHtml(job.episode.id)}">${escHtml(job.episode.id)}</a>` : "-"}</td><td>${escHtml(
          job.episode?.topic ?? "-"
        )}</td><td><span class="badge ${uiBadge(job.status)}">${escHtml(job.status)}</span></td><td>${escHtml(
          job.progress
        )}%</td><td>${manifest ? escHtml(manifest.status) : '<span class="badge bad">missing</span>'}</td><td>${escHtml(
          job.createdAt.toLocaleString("en-US", { hour12: false })
        )}</td></tr>`;
      })
      .join("");

    const body = buildCharacterGeneratorPageBody({
      topSection,
      selectedSection,
      regenerateSection,
      pickSection,
      previewSection,
      rollbackSection,
      compareSection,
      rows,
      statusScript: selectedJob ? buildCharacterGeneratorStatusScript() : ""
    });

    return reply.type("text/html; charset=utf-8").send(uiPage("Character Generator", body));
  });

  app.post("/ui/character-generator/create", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};

    try {
      const generation = parseCharacterGenerationInput(body);
      const channelId = optionalString(body, "channelId");
      const created = await createCharacterGeneration(prisma, queue, queueName, {
        ...(channelId ? { channelId } : {}),
        generation
      });

      return reply.redirect(
        `/ui/character-generator?jobId=${encodeURIComponent(created.generateJobId)}&message=${encodeURIComponent(
          created.reusedExisting
            ? `Reused active generation job: ${created.generateJobId} (episode ${created.episodeId})`
            : `${GENERATE_CHARACTER_ASSETS_JOB_NAME} queued successfully (episode ${created.episodeId})`
        )}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.post("/ui/character-generator/pick", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    try {
      const generateJobId = optionalString(body, "generateJobId");
      if (!generateJobId) {
        throw createHttpError(400, "generateJobId is required");
      }

      const selection: CharacterGenerationSelection = {
        front: optionalString(body, "frontCandidateId") ?? "",
        threeQuarter: optionalString(body, "threeQuarterCandidateId") ?? "",
        profile: optionalString(body, "profileCandidateId") ?? ""
      };
      if (!selection.front || !selection.threeQuarter || !selection.profile) {
        throw createHttpError(400, "front/threeQuarter/profile candidate must be selected");
      }

      const created = await createCharacterGenerationPick(prisma, queue, queueName, {
        generateJobId,
        selection
      });

      return reply.redirect(
        `/ui/character-generator?jobId=${encodeURIComponent(created.generateJobId)}&message=${encodeURIComponent(
          "HITL selection applied. BUILD_CHARACTER_PACK has been queued."
        )}`
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.post("/ui/character-generator/regenerate-view", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    try {
      const generateJobId = optionalString(body, "generateJobId");
      if (!generateJobId) {
        throw createHttpError(400, "generateJobId is required");
      }
      const viewToGenerate = parseGenerationView(body.viewToGenerate, "viewToGenerate");
      const candidateCount = Math.min(parsePositiveInt(body.candidateCount, "candidateCount", 4), 8);
      const seed = parsePositiveInt(body.seed, "seed", DEFAULT_GENERATION_SEED);
      const regenerateSameSeed = parseBoolean(body.regenerateSameSeed, "regenerateSameSeed", true);
      const boostNegativePrompt = parseBoolean(body.boostNegativePrompt, "boostNegativePrompt", false);

      const created = await createCharacterGenerationRegenerateView(prisma, queue, queueName, {
        generateJobId,
        viewToGenerate,
        candidateCount,
        seed,
        regenerateSameSeed,
        boostNegativePrompt
      });

      return reply.redirect(
        `/ui/character-generator?jobId=${encodeURIComponent(created.generateJobId)}&message=${encodeURIComponent(
          `View regeneration queued: ${created.view} (${regenerateSameSeed ? "same seed" : "new seed"})`
        )}`
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.post("/ui/character-generator/set-active", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    try {
      const characterPackId = optionalString(body, "characterPackId");
      if (!characterPackId) {
        throw createHttpError(400, "characterPackId is required");
      }

      const targetPack = await prisma.characterPack.findUnique({
        where: { id: characterPackId },
        select: { id: true, channelId: true }
      });
      if (!targetPack) {
        throw createHttpError(404, `character pack not found: ${characterPackId}`);
      }

      await prisma.$transaction(async (tx) => {
        await tx.characterPack.updateMany({
          where: {
            status: "APPROVED",
            channelId: targetPack.channelId,
            id: {
              not: characterPackId
            }
          },
          data: {
            status: "ARCHIVED"
          }
        });

        await tx.characterPack.update({
          where: { id: characterPackId },
          data: {
            status: "APPROVED"
          }
        });
      });

      return reply.redirect(
        `/ui/character-generator?message=${encodeURIComponent(`Character pack ${characterPackId} is now active with APPROVED status.`)}`
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.post("/ui/character-generator/rollback-active", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    try {
      const targetCharacterPackId = optionalString(body, "targetCharacterPackId");
      if (!targetCharacterPackId) {
        throw createHttpError(400, "targetCharacterPackId is required");
      }

      const targetPack = await prisma.characterPack.findUnique({
        where: { id: targetCharacterPackId },
        select: { id: true, channelId: true }
      });
      if (!targetPack) {
        throw createHttpError(404, `character pack not found: ${targetCharacterPackId}`);
      }

      await prisma.$transaction(async (tx) => {
        await tx.characterPack.updateMany({
          where: {
            status: "APPROVED",
            channelId: targetPack.channelId,
            id: {
              not: targetCharacterPackId
            }
          },
          data: {
            status: "ARCHIVED"
          }
        });
        await tx.characterPack.update({
          where: { id: targetCharacterPackId },
          data: {
            status: "APPROVED"
          }
        });
      });

      return reply.redirect(
        `/ui/character-generator?message=${encodeURIComponent(`Active pack rollback complete: ${targetCharacterPackId}`)}`
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.get("/ui/character-generator/compare", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const leftPackId = optionalString(query, "leftPackId");
    const rightPackId = optionalString(query, "rightPackId");
    if (!leftPackId || !rightPackId) {
      throw createHttpError(400, "leftPackId and rightPackId are required");
    }

    const [leftPack, rightPack] = await Promise.all([
      prisma.characterPack.findUnique({
        where: { id: leftPackId },
        select: {
          id: true,
          version: true,
          status: true
        }
      }),
      prisma.characterPack.findUnique({
        where: { id: rightPackId },
        select: {
          id: true,
          version: true,
          status: true
        }
      })
    ]);

    if (!leftPack || !rightPack) {
      throw createHttpError(404, "one or more character packs were not found");
    }

    const leftArtifacts = getCharacterArtifacts(leftPack.id);
    const rightArtifacts = getCharacterArtifacts(rightPack.id);
    const leftPreviewExists = fs.existsSync(leftArtifacts.previewPath);
    const rightPreviewExists = fs.existsSync(rightArtifacts.previewPath);
    const leftQcExists = fs.existsSync(leftArtifacts.qcReportPath);
    const rightQcExists = fs.existsSync(rightArtifacts.qcReportPath);

    const panel = (
      side: "A" | "B",
      pack: { id: string; version: number; status: string },
      previewExists: boolean,
      qcExists: boolean
    ) => `<section class="card"><h2>${escHtml(side)}: ${escHtml(pack.id)}</h2><p>version: <strong>${escHtml(
      pack.version
    )}</strong></p><p>status: <span class="badge ${uiBadge(pack.status)}">${escHtml(pack.status)}</span></p>${
      previewExists
        ? `<video controls preload="metadata" style="width:100%;max-width:560px;background:#000;border-radius:8px"><source src="/artifacts/characters/${encodeURIComponent(
            pack.id
          )}/preview.mp4" type="video/mp4"/></video>`
        : `<div class="error">preview.mp4 missing</div>`
    }<p><a href="/artifacts/characters/${encodeURIComponent(pack.id)}/pack.json">pack.json</a></p><p><a href="/artifacts/characters/${encodeURIComponent(
      pack.id
    )}/preview.mp4">preview.mp4</a></p><p><a href="/artifacts/characters/${encodeURIComponent(
      pack.id
    )}/qc_report.json">qc_report.json</a> ${qcExists ? "(exists)" : "(missing)"}</p></section>`;

    const html = `<section class="card"><h1>Character Pack A/B Compare</h1><p><a href="/ui/character-generator">Back to Character Generator</a></p><div class="grid two">${panel(
      "A",
      leftPack,
      leftPreviewExists,
      leftQcExists
    )}${panel("B", rightPack, rightPreviewExists, rightQcExists)}</div></section>`;
    return reply.type("text/html; charset=utf-8").send(uiPage("\uCE90\uB9AD\uD130 \uD329 \uBE44\uAD50", html));
  });

  app.get("/ui/characters/generated-file", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const requestedPath = optionalString(query, "path");
    if (!requestedPath) {
      throw createHttpError(400, "path is required");
    }

    const resolved = resolveGeneratedCharacterFile(requestedPath);
    if (!resolved) {
      return reply.code(404).type("text/plain; charset=utf-8").send("generated character artifact not found");
    }

    return reply.type(mimeTypeForGeneratedCharacterFile(resolved.resolvedPath)).send(fs.createReadStream(resolved.resolvedPath));
  });

  app.get("/ui/characters", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const selectedPackId = optionalString(query, "characterPackId");
    const message = optionalString(query, "message");
    const error = optionalString(query, "error");

    const [readyAssets, packs] = await Promise.all([
      prisma.asset.findMany({
        where: {
          status: "READY",
          assetType: { in: ["CHARACTER_REFERENCE", "CHARACTER_VIEW"] }
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          assetType: true,
          channelId: true,
          createdAt: true
        }
      }),
      prisma.characterPack.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          episodes: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              topic: true,
              status: true,
              createdAt: true
            }
          }
        }
      })
    ]);

    const selectedPackLookupId = selectedPackId ?? packs[0]?.id;
    const selectedPack = selectedPackLookupId
      ? await prisma.characterPack.findUnique({
          where: { id: selectedPackLookupId },
          include: {
            episodes: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                jobs: {
                  orderBy: { createdAt: "desc" },
                  take: 20
                }
              }
            }
          }
        })
      : null;

    const selectedArtifacts = selectedPack ? getCharacterArtifacts(selectedPack.id) : null;
    const selectedPreviewExists = selectedArtifacts ? fs.existsSync(selectedArtifacts.previewPath) : false;
    const selectedQcExists = selectedArtifacts ? fs.existsSync(selectedArtifacts.qcReportPath) : false;
    const selectedPreviewUrl = selectedPack
      ? `/artifacts/characters/${encodeURIComponent(selectedPack.id)}/preview.mp4`
      : null;
    const selectedQcUrl = selectedPack
      ? `/artifacts/characters/${encodeURIComponent(selectedPack.id)}/qc_report.json`
      : null;
    const selectedQcReport =
      selectedArtifacts && selectedQcExists
        ? (() => {
            try {
              return JSON.parse(fs.readFileSync(selectedArtifacts.qcReportPath, "utf8")) as unknown;
            } catch {
              return null;
            }
          })()
        : null;

    const assetOptions = readyAssets
      .map(
        (asset) =>
          `<option value="${escHtml(asset.id)}">${escHtml(asset.id)} (${escHtml(
            asset.assetType ?? "-"
          )}, channel=${escHtml(asset.channelId)})</option>`
      )
      .join("");

    const packRows = packs
      .map((pack) => {
        const episode = pack.episodes[0];
        const artifacts = getCharacterArtifacts(pack.id);
        return `<tr><td><a href="/ui/characters?characterPackId=${encodeURIComponent(pack.id)}">${escHtml(
          pack.id
        )}</a></td><td>${escHtml(pack.version)}</td><td><span class="badge ${uiBadge(pack.status)}">${escHtml(
          pack.status
        )}</span></td><td>${episode ? `<a href="/ui/episodes/${escHtml(episode.id)}">${escHtml(episode.topic)}</a>` : "-"}</td><td>${
          fs.existsSync(artifacts.previewPath)
            ? `<a href="/artifacts/characters/${encodeURIComponent(pack.id)}/preview.mp4">preview.mp4</a>`
            : "-"
        }</td><td>${escHtml(pack.createdAt.toLocaleString("ko-KR", { hour12: false }))}</td></tr>`;
      })
      .join("");

    const selectedJobs =
      selectedPack && selectedPack.episodes[0]
        ? selectedPack.episodes[0].jobs
            .map(
              (job) =>
                `<tr><td><a href="/ui/jobs/${escHtml(job.id)}">${escHtml(job.id)}</a></td><td>${escHtml(job.type)}</td><td><span class="badge ${uiBadge(
                  job.status
                )}">${escHtml(job.status)}</span></td><td>${escHtml(job.progress)}%</td><td>${escHtml(
                  job.createdAt.toLocaleString("ko-KR", { hour12: false })
                )}</td></tr>`
            )
            .join("")
        : "";
    const selectedQcIssues = readQcIssues(selectedQcReport);
    const selectedQcIssueRows = selectedQcIssues
      .map(
        (issue, index) =>
          `<tr><td>${index + 1}</td><td>${escHtml(issue.check)}</td><td><span class="badge ${uiBadge(
            issue.severity
          )}">${escHtml(issue.severity)}</span></td><td>${escHtml(issue.message)}</td><td><pre>${escHtml(
            JSON.stringify(issue.details, null, 2)
          )}</pre></td></tr>`
      )
      .join("");
    const selectedGeneratedLineage = selectedPack ? readCharacterPackLineage(selectedPack.id) : null;
    const activePack =
      selectedPack && selectedPack.channelId
        ? packs.find((pack) => pack.channelId === selectedPack.channelId && pack.status === "APPROVED") ?? null
        : null;
    const compareHref =
      selectedPack && activePack && activePack.id !== selectedPack.id
        ? `/ui/character-generator/compare?leftPackId=${encodeURIComponent(selectedPack.id)}&rightPackId=${encodeURIComponent(
            activePack.id
          )}`
        : null;
    const selectedLineageSection = selectedPack
      ? buildCharacterPackLineageSection({
          lineage: selectedGeneratedLineage,
          selectedPackId: selectedPack.id,
          activePackId: activePack?.id ?? null,
          compareHref
        })
      : "";

    const selectedSection = selectedPack
      ? `<section class="card"><h2>Selected Pack</h2><p>id: <strong>${escHtml(selectedPack.id)}</strong></p><p>version: <strong>${escHtml(
          selectedPack.version
        )}</strong></p><p>status: <span class="badge ${uiBadge(selectedPack.status)}">${escHtml(
          selectedPack.status
        )}</span></p><div class="grid two"><div><p><a href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/pack.json">pack.json</a> ${
          selectedArtifacts && fs.existsSync(selectedArtifacts.packJsonPath) ? "(exists)" : "(missing)"
        }</p><p><a href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/preview.mp4">preview.mp4</a> ${
          selectedArtifacts && fs.existsSync(selectedArtifacts.previewPath) ? "(exists)" : "(missing)"
        }</p><p><a href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/qc_report.json">qc_report.json</a> ${
          selectedArtifacts && fs.existsSync(selectedArtifacts.qcReportPath) ? "(exists)" : "(missing)"
        }</p></div><div><p>episode: ${
          selectedPack.episodes[0]
            ? `<a href="/ui/episodes/${escHtml(selectedPack.episodes[0].id)}">${escHtml(selectedPack.episodes[0].id)}</a>`
            : "-"
        }</p></div></div>${
          selectedPreviewExists && selectedPreviewUrl
            ? `<section class="card"><h3>Preview Player</h3><video controls preload="metadata" style="width:100%;max-width:960px;background:#000;border-radius:8px" src="${escHtml(
                selectedPreviewUrl
              )}"></video><p><a href="${escHtml(selectedPreviewUrl)}">Open preview.mp4</a></p></section>`
            : `<section class="card"><h3>Preview Player</h3><div class="error">preview.mp4 is not generated yet.</div></section>`
        }${
          selectedQcExists
            ? selectedQcIssues.length > 0
              ? `<section class="card"><h3>QC Issues</h3><table><thead><tr><th>#</th><th>Check</th><th>Severity</th><th>Message</th><th>Details</th></tr></thead><tbody>${selectedQcIssueRows}</tbody></table><p><a href="${escHtml(
                  selectedQcUrl ?? ""
                )}">Open qc_report.json</a></p></section>`
              : `<section class="card"><h3>QC Report</h3><div class="notice">No issues</div><pre>${escHtml(
                  JSON.stringify(selectedQcReport, null, 2)
                )}</pre></section>`
            : `<section class="card"><h3>QC Report</h3><div class="error">qc_report.json is not generated yet.</div></section>`
        }${selectedLineageSection}<details><summary>View pack.json</summary><pre>${escHtml(
          JSON.stringify(selectedPack.json, null, 2)
        )}</pre></details></section><section class="card"><h2>Selected Pack Jobs</h2><table><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Created At</th></tr></thead><tbody>${
          selectedJobs || '<tr><td colspan="5">No jobs</td></tr>'
        }</tbody></table></section>`
      : "";

    const html = `<section class="card"><h1>\uCE90\uB9AD\uD130 \uD329 (\uC0C1\uC138 \uBAA8\uB4DC)</h1><div class="notice">For fast flow, use <a href="/ui/studio">Studio</a>. This page is for manual pack inspection and creation.</div>${
      message ? `<div class="notice">${escHtml(message)}</div>` : ""
    }${error ? `<div class="error">${escHtml(error)}</div>` : ""}<form method="post" action="/ui/characters/create" class="grid"><div class="grid two"><label>Front Asset<select name="front" required>${
      assetOptions || '<option value="">No READY assets available</option>'
    }</select></label><label>ThreeQuarter Asset<select name="threeQuarter" required>${
      assetOptions || '<option value="">No READY assets available</option>'
    }</select></label><label>Profile Asset<select name="profile" required>${
      assetOptions || '<option value="">No READY assets available</option>'
    }</select></label><label>Topic (optional)<input name="topic" placeholder="character preview"/></label></div><button type="submit">Create character pack + enqueue preview</button></form></section>${selectedSection}<section class="card"><h2>\uCD5C\uADFC \uCE90\uB9AD\uD130 \uD329</h2><table><thead><tr><th>ID</th><th>Version</th><th>Status</th><th>Episode</th><th>Preview</th><th>Created At</th></tr></thead><tbody>${
      packRows || '<tr><td colspan="6">No character packs</td></tr>'
    }</tbody></table></section>`;
    return reply.type("text/html; charset=utf-8").send(uiPage("\uCE90\uB9AD\uD130 \uD329", html));
  });

  app.post("/ui/characters/create", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};

    try {
      const assetIds = parseAssetIdsFromBody(body);
      const topic = optionalString(body, "topic");
      const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
      const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);

      const created = await createCharacterPack(prisma, queue, queueName, {
        assetIds,
        topic,
        maxAttempts,
        retryBackoffMs
      });

      return reply.redirect(
        `/ui/characters?characterPackId=${encodeURIComponent(created.characterPackId)}&message=${encodeURIComponent(
          `Character pack created: ${created.characterPackId} / ${BUILD_CHARACTER_PACK_JOB_NAME} queued`
        )}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      if (statusCode >= 500) {
        app.log.error(error);
      }

      return reply.redirect(`/ui/characters?error=${encodeURIComponent(message)}`);
    }
  });
}
