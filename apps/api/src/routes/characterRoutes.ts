import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import { sha256Hex, stableStringify } from "@ec/shared";
import type { EpisodeJobPayload } from "../services/scheduleService";
import { enqueueWithResilience } from "../services/enqueueWithResilience";

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

function uiPage(title: string, body: string): string {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(
    title
  )}</title><style>body{margin:0;font-family:Segoe UI,Noto Sans KR,sans-serif;background:#f5f7fb;color:#1a2433}header{background:#fff;border-bottom:1px solid #d6deea;position:sticky;top:0}nav{max-width:1200px;margin:0 auto;padding:12px 18px;display:flex;gap:14px;align-items:center}nav strong{margin-right:auto}main{max-width:1200px;margin:18px auto;padding:0 18px;display:grid;gap:12px}.card{background:#fff;border:1px solid #d6deea;border-radius:12px;padding:14px}.notice{padding:9px;border-left:4px solid #2f7eed;background:#edf4ff}.error{padding:9px;border-left:4px solid #d92d20;background:#fff0ef}.grid{display:grid;gap:10px}.two{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}a{color:#0f5bd8;text-decoration:none}a:hover{text-decoration:underline}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #e3e8f1;padding:7px;text-align:left;vertical-align:top}.badge{display:inline-block;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:700}.badge.ok{background:#eaf6ed;color:#1d7a34}.badge.warn{background:#fff8e8;color:#945f02}.badge.bad{background:#fff1ef;color:#b42318}.badge.muted{background:#f2f4f7;color:#475467}input,select,button,textarea{font:inherit;border:1px solid #ccd6e5;border-radius:8px;padding:7px 9px}button{background:#0f5bd8;color:#fff;border:none;font-weight:700;cursor:pointer}.secondary{background:#eef3fc;color:#143d6a;border:1px solid #cad8f2}pre{margin:0;background:#0b1220;color:#d3e1ff;padding:10px;border-radius:8px;overflow:auto;font-size:12px}.candidate{display:grid;gap:6px;border:1px solid #d6deea;border-radius:10px;padding:10px;background:#f9fbff}.candidate strong{word-break:break-all}details summary{cursor:pointer;font-weight:700}.toast-wrap{position:fixed;right:16px;bottom:16px;display:grid;gap:8px;z-index:9999}.toast{background:#0b1220;color:#f8fbff;border-radius:10px;padding:10px 12px;box-shadow:0 8px 22px rgba(0,0,0,.2);min-width:240px;max-width:460px}.toast.ok{background:#14532d}.toast.warn{background:#854d0e}.toast.bad{background:#7f1d1d}.submit-loading{opacity:.72;pointer-events:none}.submit-loading::after{content:"...";margin-left:4px}.hint{display:inline-block;border-bottom:1px dotted #8ca1bf;color:#305f99;cursor:help;font-size:12px}.sr-live{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}</style></head><body><header><nav><strong>Eraser Cat \\uCE90\\uB9AD\\uD130</strong><a href="/ui">\\uB300\\uC2DC\\uBCF4\\uB4DC</a><a href="/ui/studio">\\uD1B5\\uD569 \\uC2A4\\uD29C\\uB514\\uC624</a><a href="/ui/assets">\\uC5D0\\uC14B</a><a href="/ui/characters">\\uCE90\\uB9AD\\uD130</a><a href="/ui/character-generator">\\uCE90\\uB9AD\\uD130 \\uC0DD\\uC131\\uAE30</a><a href="/ui/artifacts">\\uC544\\uD2F0\\uD329\\uD2B8</a><button id="shortcut-open" type="button" class="secondary" title="단축키 도움말 (?)">?</button></nav></header><main>${body}</main><div id="global-live" class="sr-live" aria-live="polite"></div><div id="toast-wrap" class="toast-wrap" aria-live="polite"></div><script>
(() => {
  const toastWrap = document.getElementById('toast-wrap');
  const live = document.getElementById('global-live');
  const speak = (text) => { if (live) live.textContent = text; };
  const toast = (title, message, tone = 'ok', timeoutMs = 5000) => {
    if (!toastWrap) return;
    const node = document.createElement('div');
    node.className = 'toast ' + tone;
    node.innerHTML = '<div><strong>' + title + '</strong></div><div>' + message + '</div>';
    toastWrap.appendChild(node);
    speak(title + ': ' + message);
    setTimeout(() => node.remove(), timeoutMs);
  };
  window.__ecsToast = toast;
  window.__ecsSpeak = speak;

  const url = new URL(window.location.href);
  const message = url.searchParams.get('message');
  const error = url.searchParams.get('error');
  if (message) toast('성공', message, 'ok');
  if (error) toast('오류', error, 'bad', 7000);

  document.querySelectorAll('form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      const submit = form.querySelector('button[type="submit"]');
      if (!(submit instanceof HTMLButtonElement)) return;
      if (submit.dataset.busy === '1') {
        event.preventDefault();
        return;
      }
      submit.dataset.busy = '1';
      submit.disabled = true;
      submit.classList.add('submit-loading');
    });
  });

  document.querySelectorAll('[data-tooltip]').forEach((node) => {
    if (node instanceof HTMLElement && !node.title) {
      node.title = String(node.dataset.tooltip || '');
    }
  });

  let pendingGo = false;
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    const editing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);
    if (editing) return;
    if (e.key === '?') {
      e.preventDefault();
      toast("단축키", "g + c: 캐릭터 생성기, g + a: 에셋, r: 주요 액션");
      return;
    }
    if (pendingGo) {
      pendingGo = false;
      if (e.key === 'c') window.location.href = '/ui/character-generator';
      if (e.key === 'a') window.location.href = '/ui/assets';
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

  const duplicateSession = await prisma.characterGenerationSession.findFirst({
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
  });

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

    const generationSession = await tx.characterGenerationSession.create({
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
    });

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
      generationSession,
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
        sessionId: txResult.generationSession.id,
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
    sessionId: txResult.generationSession.id,
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

  const fallbackSession = await prisma.characterGenerationSession.findFirst({
    where: {
      episodeId: episode.id,
      characterPackId: episode.characterPackId
    },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
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

  const fallbackSession = await prisma.characterGenerationSession.findFirst({
    where: {
      episodeId: episode.id,
      characterPackId: episode.characterPackId
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      referenceAssetId: true
    }
  });
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

    await trx.characterGenerationSession.update({
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

  const fallbackSession = await prisma.characterGenerationSession.findFirst({
    where: {
      episodeId: episode.id,
      characterPackId: episode.characterPackId
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      referenceAssetId: true
    }
  });
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
    const html = `${message ? `<div class="notice">${escHtml(message)}</div>` : ""}${error ? `<div class="error">${escHtml(error)}</div>` : ""}
<section class="card studio-shell">
  <style>
    .studio-shell{display:grid;gap:10px}
    .studio-hint{margin:0;color:#425466;font-size:13px}
    .studio-grid{display:grid;gap:12px;grid-template-columns:minmax(360px,1.1fr) minmax(340px,1fr)}
    .studio-col{display:grid;gap:12px}
    .studio-section{background:#fff}
    .studio-head{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .studio-table-wrap{overflow:auto;max-height:320px;border:1px solid #dce5f3;border-radius:10px}
    .studio-table-wrap table{margin:0}
    .studio-table-wrap tbody tr:hover{background:#f8fbff}
    .studio-table-wrap tbody tr:focus-within{outline:2px solid #0f5bd8;outline-offset:-2px}
    .studio-actions{display:flex;gap:8px;flex-wrap:wrap}
    @media (max-width: 1100px){.studio-grid{grid-template-columns:1fr}}
  </style>
  <h1>통합 스튜디오</h1>
  <p class="studio-hint">에셋 업로드, 캐릭터 생성, 캐릭터 팩 확인, 렌더/퍼블리시 진입을 한 화면에서 처리합니다.</p>
  <div id="studio-status" class="notice" aria-live="polite">준비 완료: 좌측에서 생성하고 우측에서 내역을 선택하세요.</div>
  <details class="card" style="margin:0">
    <summary><strong>빠른 시작 가이드</strong> (클릭해서 펼치기)</summary>
    <ol style="margin:10px 0 0;padding-left:18px">
      <li>에셋 업로드 또는 기존 에셋 확인</li>
      <li>캐릭터 생성 시작 또는 기존 캐릭터 팩 선택</li>
      <li>원클릭 제작(생성→프리뷰) 실행 또는 에피소드 수동 생성</li>
      <li>최근 작업 패널에서 진행 상태 확인</li>
      <li>필요 시 편집기/퍼블리시로 이동</li>
    </ol>
    <p class="studio-hint" style="margin-top:8px">팁: 자동 새로고침을 켜면 우측 목록이 주기적으로 갱신됩니다.</p>
  </details>
  <div class="studio-actions">
    <label><input id="studio-auto-refresh" type="checkbox" checked/> 자동 새로고침</label>
    <label>주기
      <select id="studio-refresh-interval">
        <option value="3000">3초</option>
        <option value="5000" selected>5초</option>
        <option value="10000">10초</option>
      </select>
    </label>
  </div>
</section>
<section class="card studio-grid">
  <div class="studio-col">
    <section class="candidate studio-section">
      <h2 style="margin:0">1) 에셋 업로드</h2>
      <form id="studio-asset-upload-form" enctype="multipart/form-data" class="grid">
        <div class="grid two">
          <label>에셋 유형<select name="assetType"><option value="character_reference">character_reference (레퍼런스)</option><option value="character_view">character_view (캐릭터 뷰)</option><option value="background">background (배경)</option><option value="chart_source">chart_source (차트)</option></select></label>
          <label>파일<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required/></label>
        </div>
        <button id="studio-asset-upload-submit" type="submit">업로드</button>
      </form>
      <pre id="studio-asset-upload-result">대기 중</pre>
    </section>
    <section class="candidate studio-section">
      <h2 style="margin:0">2) 캐릭터 생성</h2>
      <form method="post" action="/ui/character-generator/create" class="grid">
        <div class="grid two">
          <label>모드<select name="mode"><option value="new">new (프롬프트 기반)</option><option value="reference">reference (레퍼런스 기반)</option></select></label>
          <label>프로바이더<select name="provider"><option value="mock">mock (기본 무료)</option><option value="comfyui">comfyui (옵션)</option><option value="remoteApi">remoteApi (옵션)</option></select></label>
          <label>스타일 프리셋<select name="promptPreset"><option value="default">default</option><option value="anime_clean">anime_clean</option><option value="brand_mascot">brand_mascot</option><option value="toon_bold">toon_bold</option></select></label>
          <label>후보 수<input name="candidateCount" type="number" min="1" max="8" value="4"/></label>
          <label>주제(선택)<input name="topic" placeholder="예: 교육용 고양이 캐릭터"/></label>
          <label>시드(seed)<input name="seed" type="number" value="20260305"/></label>
        </div>
        <label>긍정 프롬프트(선택)<textarea name="positivePrompt" rows="2" placeholder="friendly orange cat mascot, clean silhouette"></textarea></label>
        <label>부정 프롬프트(선택)<textarea name="negativePrompt" rows="2" placeholder="text, watermark, extra fingers, noisy background"></textarea></label>
        <button type="submit" data-primary-action="1">캐릭터 생성 시작</button>
      </form>
    </section>
    <section class="candidate studio-section">
      <h2 style="margin:0">3) 다음 단계 (편집/렌더/퍼블리시)</h2>
      <div class="grid two">
        <label>에피소드 주제<input id="studio-topic" placeholder="예: 고양이 캐릭터 소개 영상"/></label>
        <label>episodeId<input id="studio-episode-id" placeholder="cmm..."/></label>
        <label>선택 캐릭터 팩<input id="studio-selected-pack" placeholder="우측 목록에서 선택" readonly/></label>
      </div>
      <div class="studio-actions">
        <button type="button" id="studio-oneclick" data-primary-action="1">원클릭 제작(생성→프리뷰)</button>
        <button type="button" id="studio-create-episode" class="secondary">에피소드 생성(+선택 캐릭터 연결)</button>
        <button type="button" id="studio-open-editor" class="secondary">편집기 열기</button>
        <button type="button" id="studio-enqueue-preview" class="secondary">렌더 미리보기 큐 등록</button>
        <button type="button" id="studio-open-publish" class="secondary">퍼블리시 화면 열기</button>
      </div>
      <p class="studio-hint">단축키: <strong>r</strong>(주요 액션), <strong>?</strong>(도움말)</p>
    </section>
  </div>
  <div class="studio-col">
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">최근 에셋</h2><button type="button" id="studio-refresh-assets" class="secondary">새로고침</button></div>
      <input id="studio-filter-assets" placeholder="에셋 검색 (id/유형/상태)" />
      <div class="studio-table-wrap"><table id="studio-assets-table"><thead><tr><th>ID</th><th>유형</th><th>상태</th><th>생성시각</th></tr></thead><tbody><tr><td colspan="4">로딩 중...</td></tr></tbody></table></div>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">생성된 캐릭터 팩</h2><button type="button" id="studio-refresh-packs" class="secondary">새로고침</button></div>
      <input id="studio-filter-packs" placeholder="캐릭터 팩 검색 (id/상태/에피소드)" />
      <div class="studio-table-wrap"><table id="studio-packs-table"><thead><tr><th>ID</th><th>버전</th><th>상태</th><th>에피소드</th></tr></thead><tbody><tr><td colspan="4">로딩 중...</td></tr></tbody></table></div>
      <p class="studio-hint">행을 클릭하면 선택 캐릭터 팩/episodeId가 자동으로 채워집니다.</p>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">최근 에피소드</h2><button type="button" id="studio-refresh-episodes" class="secondary">새로고침</button></div>
      <input id="studio-filter-episodes" placeholder="에피소드 검색 (id/주제/상태)" />
      <div class="studio-table-wrap"><table id="studio-episodes-table"><thead><tr><th>ID</th><th>주제</th><th>상태</th><th>최근 작업</th></tr></thead><tbody><tr><td colspan="4">로딩 중...</td></tr></tbody></table></div>
      <p class="studio-hint">행 클릭 시 episodeId/주제가 입력칸에 자동 반영됩니다.</p>
    </section>
    <section class="candidate studio-section">
      <div class="studio-head"><h2 style="margin:0">최근 작업</h2><button type="button" id="studio-refresh-jobs" class="secondary">새로고침</button></div>
      <input id="studio-filter-jobs" placeholder="작업 검색 (id/유형/상태/에피소드)" />
      <div class="studio-table-wrap"><table id="studio-jobs-table"><thead><tr><th>작업</th><th>유형</th><th>상태</th><th>진행률</th><th>에피소드</th></tr></thead><tbody><tr><td colspan="5">로딩 중...</td></tr></tbody></table></div>
      <p class="studio-hint">행 클릭 시 작업 상세로 이동하고, episodeId가 있으면 자동 반영됩니다.</p>
    </section>
  </div>
</section>
<script>
(() => {
  const toast = (title, msg, tone = "ok") => {
    if (typeof window.__ecsToast === "function") window.__ecsToast(title, msg, tone);
  };
  const q = (id) => document.getElementById(id);
  const assetsBody = q("studio-assets-table")?.querySelector("tbody");
  const packsBody = q("studio-packs-table")?.querySelector("tbody");
  const episodesBody = q("studio-episodes-table")?.querySelector("tbody");
  const jobsBody = q("studio-jobs-table")?.querySelector("tbody");
  const filterAssets = q("studio-filter-assets");
  const filterPacks = q("studio-filter-packs");
  const filterEpisodes = q("studio-filter-episodes");
  const filterJobs = q("studio-filter-jobs");
  const statusBox = q("studio-status");
  const selectedPack = q("studio-selected-pack");
  const episodeInput = q("studio-episode-id");
  const topicInput = q("studio-topic");
  const autoRefreshInput = q("studio-auto-refresh");
  const refreshIntervalInput = q("studio-refresh-interval");
  let pollTimer = null;
  let refreshTimer = null;

  const safe = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
  const setStatus = (text) => {
    if (statusBox instanceof HTMLElement) statusBox.textContent = text;
  };
  const applyFilter = (inputEl, tbodyEl) => {
    if (!(inputEl instanceof HTMLInputElement) || !(tbodyEl instanceof HTMLElement)) return;
    const qText = inputEl.value.trim().toLowerCase();
    tbodyEl.querySelectorAll("tr").forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      const text = String(row.textContent || "").toLowerCase();
      row.style.display = !qText || text.includes(qText) ? "" : "none";
    });
  };
  const clearPoll = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
  const clearRefresh = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
  const readError = async (res, fallback) => {
    try {
      const json = await res.json();
      if (json && typeof json.error === "string" && json.error.trim()) return json.error.trim();
      return fallback;
    } catch {
      return fallback;
    }
  };
  const pollEpisodeProgress = (episodeId) => {
    clearPoll();
    const run = async () => {
      try {
        const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId), { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error("상태 조회 실패: " + res.status);
        const json = await res.json();
        const episode = json?.data?.episode || {};
        const jobs = Array.isArray(json?.data?.jobs) ? json.data.jobs : [];
        const latest = jobs.length > 0 ? jobs[0] : null;
        const status = String(episode.status || "UNKNOWN");
        const jobText = latest ? (String(latest.type || "-") + " / " + String(latest.status || "-") + " / " + String(latest.progress ?? 0) + "%") : "작업 없음";
        setStatus("진행 상태: " + status + " | 최근 작업: " + jobText);
        const done = latest && ["COMPLETED", "FAILED", "CANCELLED"].includes(String(latest.status || "").toUpperCase());
        if (done) clearPoll();
      } catch (e) {
        setStatus("진행 상태 조회 실패: " + String(e));
      }
    };
    void run();
    pollTimer = setInterval(() => { void run(); }, 2500);
  };
  const startAutoRefresh = () => {
    clearRefresh();
    const enabled = autoRefreshInput instanceof HTMLInputElement ? autoRefreshInput.checked : false;
    if (!enabled) return;
    const intervalMs = refreshIntervalInput instanceof HTMLSelectElement
      ? Number.parseInt(refreshIntervalInput.value, 10) || 5000
      : 5000;
    refreshTimer = setInterval(() => {
      void loadAssets();
      void loadPacks();
      void loadEpisodes();
      void loadJobs();
    }, intervalMs);
  };

  const loadAssets = async () => {
    if (!(assetsBody instanceof HTMLElement)) return;
    setStatus("에셋 목록을 불러오는 중...");
    assetsBody.innerHTML = "<tr><td colspan='4'>불러오는 중...</td></tr>";
    try {
      const res = await fetch("/api/assets?limit=30");
      if (!res.ok) throw new Error("에셋 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        assetsBody.innerHTML = "<tr><td colspan='4'>에셋이 없습니다.</td></tr>";
        setStatus("에셋 목록 로드 완료: 데이터 없음");
        return;
      }
      assetsBody.innerHTML = list.map((asset) => "<tr><td><a href=\"/ui/assets?assetId=" + encodeURIComponent(String(asset.id || "")) + "\">" + safe(asset.id) + "</a></td><td>" + safe(asset.assetType) + "</td><td>" + safe(asset.status) + "</td><td>" + safe(asset.createdAt) + "</td></tr>").join("");
      applyFilter(filterAssets, assetsBody);
      setStatus("에셋 목록 로드 완료");
    } catch (e) {
      assetsBody.innerHTML = "<tr><td colspan='4'>실패: " + safe(String(e)) + "</td></tr>";
      setStatus("에셋 목록 로드 실패");
      toast("에셋", String(e), "warn");
    }
  };

  const loadPacks = async () => {
    if (!(packsBody instanceof HTMLElement)) return;
    setStatus("캐릭터 팩 목록을 불러오는 중...");
    packsBody.innerHTML = "<tr><td colspan='4'>불러오는 중...</td></tr>";
    try {
      const res = await fetch("/api/character-packs?limit=30");
      if (!res.ok) throw new Error("캐릭터 팩 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        packsBody.innerHTML = "<tr><td colspan='4'>캐릭터 팩이 없습니다.</td></tr>";
        setStatus("캐릭터 팩 목록 로드 완료: 데이터 없음");
        return;
      }
      packsBody.innerHTML = list.map((pack) => {
        const packId = String(pack.id || "");
        return "<tr data-pack-id=\"" + safe(packId) + "\"><td><a href=\"/ui/characters?characterPackId=" + encodeURIComponent(packId) + "\">" + safe(packId) + "</a></td><td>" + safe(pack.version) + "</td><td>" + safe(pack.status) + "</td><td>" + safe(pack.episodeId || "-") + "</td></tr>";
      }).join("");
      packsBody.querySelectorAll("tr[data-pack-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const packId = row.dataset.packId || "";
          if (selectedPack instanceof HTMLInputElement) selectedPack.value = packId;
          const episodeCell = row.children.length > 3 ? row.children[3] : null;
          if (episodeCell instanceof HTMLElement) {
            const linkedEpisodeId = String(episodeCell.textContent || "").trim();
            if (episodeInput instanceof HTMLInputElement && linkedEpisodeId && linkedEpisodeId !== "-") {
              episodeInput.value = linkedEpisodeId;
            }
          }
          setStatus("캐릭터 팩 선택됨: " + packId);
        });
      });
      applyFilter(filterPacks, packsBody);
      setStatus("캐릭터 팩 목록 로드 완료");
    } catch (e) {
      packsBody.innerHTML = "<tr><td colspan='4'>실패: " + safe(String(e)) + "</td></tr>";
      setStatus("캐릭터 팩 목록 로드 실패");
      toast("캐릭터 팩", String(e), "warn");
    }
  };

  const loadEpisodes = async () => {
    if (!(episodesBody instanceof HTMLElement)) return;
    setStatus("에피소드 목록을 불러오는 중...");
    episodesBody.innerHTML = "<tr><td colspan='4'>불러오는 중...</td></tr>";
    try {
      const res = await fetch("/api/episodes?limit=20", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error("에피소드 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        episodesBody.innerHTML = "<tr><td colspan='4'>에피소드가 없습니다.</td></tr>";
        setStatus("에피소드 목록 로드 완료: 데이터 없음");
        return;
      }
      episodesBody.innerHTML = list.map((ep) => {
        const id = String(ep?.id || "");
        const topic = String(ep?.topic || "");
        const status = String(ep?.status || "");
        const latest = Array.isArray(ep?.jobs) && ep.jobs.length > 0 ? ep.jobs[0] : null;
        const latestText = latest ? (String(latest.type || "-") + " / " + String(latest.status || "-")) : "-";
        return "<tr data-episode-id=\"" + safe(id) + "\" data-episode-topic=\"" + safe(topic) + "\"><td><a href=\"/ui/episodes/" + encodeURIComponent(id) + "\">" + safe(id) + "</a></td><td>" + safe(topic) + "</td><td>" + safe(status) + "</td><td>" + safe(latestText) + "</td></tr>";
      }).join("");
      episodesBody.querySelectorAll("tr[data-episode-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const id = row.dataset.episodeId || "";
          const topic = row.dataset.episodeTopic || "";
          if (episodeInput instanceof HTMLInputElement) episodeInput.value = id;
          if (topicInput instanceof HTMLInputElement && !topicInput.value.trim()) topicInput.value = topic;
          setStatus("에피소드 선택됨: " + id);
        });
      });
      applyFilter(filterEpisodes, episodesBody);
      setStatus("에피소드 목록 로드 완료");
    } catch (e) {
      episodesBody.innerHTML = "<tr><td colspan='4'>실패: " + safe(String(e)) + "</td></tr>";
      setStatus("에피소드 목록 로드 실패");
      toast("에피소드", String(e), "warn");
    }
  };

  const loadJobs = async () => {
    if (!(jobsBody instanceof HTMLElement)) return;
    setStatus("작업 목록을 불러오는 중...");
    jobsBody.innerHTML = "<tr><td colspan='5'>불러오는 중...</td></tr>";
    try {
      const res = await fetch("/api/jobs?limit=20", { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error("작업 조회 실패: " + res.status);
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      if (!list.length) {
        jobsBody.innerHTML = "<tr><td colspan='5'>작업이 없습니다.</td></tr>";
        setStatus("작업 목록 로드 완료: 데이터 없음");
        return;
      }
      jobsBody.innerHTML = list.map((job) => {
        const id = String(job?.id || "");
        const episodeId = String(job?.episodeId || "");
        const type = String(job?.type || "");
        const status = String(job?.status || "");
        const progress = String(job?.progress ?? 0) + "%";
        return "<tr data-job-id=\"" + safe(id) + "\" data-episode-id=\"" + safe(episodeId) + "\"><td><a href=\"/ui/jobs/" + encodeURIComponent(id) + "\">" + safe(id) + "</a></td><td>" + safe(type) + "</td><td>" + safe(status) + "</td><td>" + safe(progress) + "</td><td>" + (episodeId ? ("<a href=\"/ui/episodes/" + encodeURIComponent(episodeId) + "\">" + safe(episodeId) + "</a>") : "-") + "</td></tr>";
      }).join("");
      jobsBody.querySelectorAll("tr[data-job-id]").forEach((row) => {
        if (!(row instanceof HTMLElement)) return;
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const episodeId = row.dataset.episodeId || "";
          if (episodeId && episodeInput instanceof HTMLInputElement) {
            episodeInput.value = episodeId;
          }
          const jobId = row.dataset.jobId || "";
          setStatus("작업 선택됨: " + jobId);
          window.location.href = "/ui/jobs/" + encodeURIComponent(jobId);
        });
      });
      applyFilter(filterJobs, jobsBody);
      setStatus("작업 목록 로드 완료");
    } catch (e) {
      jobsBody.innerHTML = "<tr><td colspan='5'>실패: " + safe(String(e)) + "</td></tr>";
      setStatus("작업 목록 로드 실패");
      toast("작업", String(e), "warn");
    }
  };

  const uploadForm = q("studio-asset-upload-form");
  const uploadSubmit = q("studio-asset-upload-submit");
  const uploadResult = q("studio-asset-upload-result");
  if (uploadForm instanceof HTMLFormElement && uploadSubmit instanceof HTMLButtonElement && uploadResult instanceof HTMLElement) {
    uploadForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      uploadSubmit.disabled = true;
      setStatus("에셋 업로드 진행 중...");
      uploadResult.textContent = "업로드 중...";
      try {
        const fd = new FormData(uploadForm);
        const res = await fetch("/api/assets/upload", { method: "POST", body: fd });
        const json = await res.json();
        uploadResult.textContent = JSON.stringify(json, null, 2);
        if (!res.ok) throw new Error(json?.error || ("업로드 실패: " + res.status));
        toast("에셋 업로드", "완료되었습니다.", "ok");
        setStatus("에셋 업로드 완료");
        await loadAssets();
      } catch (e) {
        uploadResult.textContent = String(e);
        setStatus("에셋 업로드 실패");
        toast("에셋 업로드", String(e), "bad");
      } finally {
        uploadSubmit.disabled = false;
      }
    });
  }

  q("studio-refresh-assets")?.addEventListener("click", () => { void loadAssets(); });
  q("studio-refresh-packs")?.addEventListener("click", () => { void loadPacks(); });
  q("studio-refresh-episodes")?.addEventListener("click", () => { void loadEpisodes(); });
  q("studio-refresh-jobs")?.addEventListener("click", () => { void loadJobs(); });
  filterAssets?.addEventListener("input", () => applyFilter(filterAssets, assetsBody));
  filterPacks?.addEventListener("input", () => applyFilter(filterPacks, packsBody));
  filterEpisodes?.addEventListener("input", () => applyFilter(filterEpisodes, episodesBody));
  filterJobs?.addEventListener("input", () => applyFilter(filterJobs, jobsBody));
  autoRefreshInput?.addEventListener("change", () => {
    startAutoRefresh();
    setStatus(autoRefreshInput instanceof HTMLInputElement && autoRefreshInput.checked ? "자동 새로고침 켜짐" : "자동 새로고침 꺼짐");
  });
  refreshIntervalInput?.addEventListener("change", () => {
    startAutoRefresh();
    const ms = refreshIntervalInput instanceof HTMLSelectElement ? refreshIntervalInput.value : "5000";
    setStatus("자동 새로고침 주기 변경: " + ms + "ms");
  });

  q("studio-create-episode")?.addEventListener("click", async () => {
    const topic = topicInput instanceof HTMLInputElement ? topicInput.value.trim() : "";
    if (!topic) {
      toast("입력 필요", "에피소드 주제를 입력하세요.", "warn");
      setStatus("에피소드 생성 실패: 주제 누락");
      return;
    }
    const characterPackId = selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() : "";
    const payload = {
      topic,
      targetDurationSec: 600,
      jobType: "GENERATE_BEATS",
      ...(characterPackId ? { characterPackId } : {})
    };
    try {
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(String(json?.error || ("에피소드 생성 실패: " + res.status)));

      const episodeId = String(json?.data?.episode?.id || "").trim();
      if (episodeInput instanceof HTMLInputElement && episodeId) episodeInput.value = episodeId;
      toast("에피소드 생성", episodeId ? ("생성 완료: " + episodeId) : "생성 완료", "ok");
      setStatus("에피소드 생성 완료" + (episodeId ? ": " + episodeId : ""));
      if (episodeId) {
        pollEpisodeProgress(episodeId);
      }
    } catch (e) {
      setStatus("에피소드 생성 실패");
      toast("에피소드 생성", String(e), "bad");
    }
  });

  q("studio-oneclick")?.addEventListener("click", async () => {
    const topic = topicInput instanceof HTMLInputElement ? topicInput.value.trim() : "";
    if (!topic) {
      toast("입력 필요", "에피소드 주제를 입력하세요.", "warn");
      setStatus("원클릭 실행 실패: 주제 누락");
      return;
    }
    const characterPackId = selectedPack instanceof HTMLInputElement ? selectedPack.value.trim() : "";
    setStatus("원클릭 실행: 에피소드 생성 중...");
    try {
      const createRes = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          targetDurationSec: 600,
          jobType: "GENERATE_BEATS",
          ...(characterPackId ? { characterPackId } : {})
        })
      });
      if (!createRes.ok) {
        const msg = await readError(createRes, "에피소드 생성 실패: " + createRes.status);
        throw new Error(msg);
      }
      const created = await createRes.json();
      const episodeId = String(created?.data?.episode?.id || "").trim();
      if (!episodeId) throw new Error("에피소드 ID가 반환되지 않았습니다.");
      if (episodeInput instanceof HTMLInputElement) episodeInput.value = episodeId;
      setStatus("원클릭 실행: 프리뷰 파이프라인 시작 중...");
      const runRes = await fetch("/api/episodes/" + encodeURIComponent(episodeId) + "/run-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: "preview", stylePresetId: "AUTO", hookBoost: 0.55 })
      });
      if (!runRes.ok) {
        const msg = await readError(runRes, "원클릭 실행 실패: " + runRes.status);
        throw new Error(msg);
      }
      toast("원클릭 제작", "에피소드 생성 + 프리뷰 파이프라인 시작 완료", "ok");
      setStatus("원클릭 실행 완료: 진행 상태 추적 중...");
      pollEpisodeProgress(episodeId);
    } catch (e) {
      toast("원클릭 제작", String(e), "bad");
      setStatus("원클릭 실행 실패: " + String(e));
    }
  });

  q("studio-open-editor")?.addEventListener("click", () => {
    if (!(episodeInput instanceof HTMLInputElement) || !episodeInput.value.trim()) {
      toast("입력 필요", "episodeId를 입력하세요.", "warn");
      setStatus("편집기 이동 실패: episodeId 누락");
      return;
    }
    setStatus("편집기 페이지로 이동 중...");
    window.location.href = "/ui/episodes/" + encodeURIComponent(episodeInput.value.trim()) + "/editor";
  });

  q("studio-open-publish")?.addEventListener("click", () => {
    if (!(episodeInput instanceof HTMLInputElement) || !episodeInput.value.trim()) {
      toast("입력 필요", "episodeId를 입력하세요.", "warn");
      setStatus("퍼블리시 이동 실패: episodeId 누락");
      return;
    }
    setStatus("퍼블리시 페이지로 이동 중...");
    window.location.href = "/ui/publish?episodeId=" + encodeURIComponent(episodeInput.value.trim());
  });

  q("studio-enqueue-preview")?.addEventListener("click", async () => {
    if (!(episodeInput instanceof HTMLInputElement) || !episodeInput.value.trim()) {
      toast("입력 필요", "episodeId를 입력하세요.", "warn");
      setStatus("렌더 미리보기 큐 등록 실패: episodeId 누락");
      return;
    }
    const episodeId = episodeInput.value.trim();
    try {
      const res = await fetch("/api/episodes/" + encodeURIComponent(episodeId) + "/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType: "RENDER_PREVIEW" })
      });
      if (!res.ok) throw new Error("큐 등록 실패: " + res.status);
      toast("렌더 미리보기", "큐 등록 완료", "ok");
      setStatus("렌더 미리보기 큐 등록 완료");
      window.location.href = "/ui/episodes/" + encodeURIComponent(episodeId);
    } catch (e) {
      setStatus("렌더 미리보기 큐 등록 실패");
      toast("렌더 미리보기", String(e), "bad");
    }
  });

  void loadAssets();
  void loadPacks();
  void loadEpisodes();
  void loadJobs();
  startAutoRefresh();
  window.addEventListener("beforeunload", clearPoll);
  window.addEventListener("beforeunload", clearRefresh);
})();
</script>`;
    return reply.type("text/html; charset=utf-8").send(uiPage("통합 스튜디오", html));
  });

  app.get("/ui/character-generator", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const message = optionalString(query, "message");
    const error = optionalString(query, "error");
    const selectedJobId = optionalString(query, "jobId");

    const [jobs, latestBible, referenceAssets, sessions, recentPacks] = await Promise.all([
      prisma.job.findMany({
        where: { type: GENERATE_CHARACTER_ASSETS_JOB_NAME },
        orderBy: { createdAt: "desc" },
        take: 30,
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
            take: 10
          }
        }
      }),
      prisma.channelBible.findFirst({
        where: {
          isActive: true
        },
        orderBy: {
          version: "desc"
        },
        select: {
          id: true,
          json: true
        }
      }),
      prisma.asset.findMany({
        where: {
          status: "READY",
          assetType: "CHARACTER_REFERENCE"
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          channelId: true,
          createdAt: true
        }
      }),
      prisma.characterGenerationSession.findMany({
        orderBy: { createdAt: "desc" },
        take: 60,
        include: {
          candidates: {
            orderBy: [{ view: "asc" }, { createdAt: "desc" }],
            take: 60
          }
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

    const selectedJob = selectedJobId ? jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null : jobs[0] ?? null;
    const selectedManifestPath = selectedJob ? getGenerationManifestPath(selectedJob.id) : null;
    const selectedManifest = selectedManifestPath ? readGenerationManifest(selectedManifestPath) : null;
    const selectedSession =
      (selectedManifest?.sessionId
        ? sessions.find((session) => session.id === selectedManifest.sessionId) ?? null
        : null) ??
      (selectedJob
        ? sessions.find(
            (session) =>
              session.episodeId === selectedJob.episodeId &&
              session.characterPackId === (selectedJob.episode?.characterPackId ?? null)
          ) ?? null
        : null);
    const channelPresets = extractChannelStylePresets(latestBible?.json);
    const promptRules = extractChannelPromptRules(latestBible?.json);
    const mergedPresets = [
      ...CHARACTER_STYLE_PRESETS.map((preset) => ({ id: preset.id, label: preset.label })),
      ...channelPresets
    ].filter((item, index, arr) => arr.findIndex((other) => other.id === item.id) === index);

    const styleOptions = mergedPresets
      .map((preset) => `<option value="${escHtml(preset.id)}">${escHtml(preset.label)}</option>`)
      .join("");
    const referenceOptions = referenceAssets
      .map(
        (asset) =>
          `<option value="${escHtml(asset.id)}">${escHtml(asset.id)} (channel=${escHtml(asset.channelId)}, ${escHtml(
            asset.createdAt.toLocaleString("ko-KR", { hour12: false })
          )})</option>`
      )
      .join("");

    const groupedCandidates = {
      front: selectedManifest?.candidates.filter((candidate) => candidate.view === "front") ?? [],
      threeQuarter: selectedManifest?.candidates.filter((candidate) => candidate.view === "threeQuarter") ?? [],
      profile: selectedManifest?.candidates.filter((candidate) => candidate.view === "profile") ?? []
    };

    const selectedPackId = selectedJob?.episode?.characterPackId ?? selectedManifest?.characterPackId ?? null;
    const selectedArtifacts = selectedPackId ? getCharacterArtifacts(selectedPackId) : null;
    const selectedPreviewExists = selectedArtifacts ? fs.existsSync(selectedArtifacts.previewPath) : false;
    const selectedPreviewUrl = selectedPackId
      ? `/artifacts/characters/${encodeURIComponent(selectedPackId)}/preview.mp4`
      : null;
    const selectedQcExists = selectedArtifacts ? fs.existsSync(selectedArtifacts.qcReportPath) : false;
    const selectedQcUrl = selectedPackId
      ? `/artifacts/characters/${encodeURIComponent(selectedPackId)}/qc_report.json`
      : null;

    const bestByView = {
      front: groupedCandidates.front.sort((a, b) => b.score - a.score)[0] ?? null,
      threeQuarter: groupedCandidates.threeQuarter.sort((a, b) => b.score - a.score)[0] ?? null,
      profile: groupedCandidates.profile.sort((a, b) => b.score - a.score)[0] ?? null
    };
    const consistencyValues = (selectedManifest?.candidates ?? [])
      .map((candidate) => candidate.consistencyScore)
      .filter((score): score is number => typeof score === "number");
    const consistencyAverage =
      consistencyValues.length > 0
        ? consistencyValues.reduce((sum, score) => sum + score, 0) / consistencyValues.length
        : null;
    const consistencyLowCount = consistencyValues.filter((score) => score < 0.48).length;
    const consistencyCriticalCount = consistencyValues.filter((score) => score < 0.34).length;
    const consistencySummaryTone =
      consistencyAverage === null ? "muted" : consistencyAverage < 0.48 ? "warn" : consistencyAverage < 0.62 ? "bad" : "ok";

    const candidateCard = (
      view: "front" | "threeQuarter" | "profile",
      candidate: GenerationManifestCandidate,
      required: boolean
    ): string => {
      const absolutePath = path.isAbsolute(candidate.filePath)
        ? candidate.filePath
        : selectedManifestPath
          ? path.resolve(path.dirname(selectedManifestPath), candidate.filePath)
          : candidate.filePath;
      const imageUrl = toArtifactUrlFromAbsolutePath(absolutePath);
      const warnings = candidate.warnings.length > 0 ? candidate.warnings.join(", ") : "-";
      const rejections = candidate.rejections.length > 0 ? candidate.rejections.join(", ") : "-";
      const breakdown = candidate.breakdown;
      const breakdownLine = breakdown
        ? `Quality=${typeof breakdown.qualityScore === "number" ? breakdown.qualityScore.toFixed(3) : "-"} / Consistency=${
            typeof breakdown.consistencyScore === "number" ? breakdown.consistencyScore.toFixed(3) : "-"
          } / Round=${typeof breakdown.generationRound === "number" ? breakdown.generationRound : "-"}`
        : "Quality=- / Consistency=- / Round=-";
      const breakdownLine2 = breakdown
        ? `Alpha=${typeof breakdown.alphaScore === "number" ? breakdown.alphaScore.toFixed(3) : "-"} / BBox=${
            typeof breakdown.occupancyScore === "number" ? breakdown.occupancyScore.toFixed(3) : "-"
          } / Sharp=${typeof breakdown.sharpnessScore === "number" ? breakdown.sharpnessScore.toFixed(3) : "-"} / Noise=${
            typeof breakdown.noiseScore === "number" ? breakdown.noiseScore.toFixed(3) : "-"
          }`
        : "Alpha=- / BBox=- / Sharp=- / Noise=-";

      return `<label class="candidate"><div><input type="radio" name="${escHtml(
        `${view}CandidateId`
      )}" value="${escHtml(candidate.id)}"${required ? " required" : ""}/><strong>${escHtml(
        candidate.id
      )}</strong></div><div>score=${escHtml(candidate.score.toFixed(3))} / style=${escHtml(
        candidate.styleScore.toFixed(3)
      )} / consistency=${escHtml(candidate.consistencyScore === null ? "-" : candidate.consistencyScore.toFixed(3))} / seed=${escHtml(
        candidate.seed
      )}</div><div>${escHtml(
        breakdownLine
      )}</div><div>${escHtml(
        breakdownLine2
      )}</div><div>warnings: ${escHtml(
        warnings
      )}</div><div>rejections: ${escHtml(rejections)}</div>${
        imageUrl
          ? `<img src="${escHtml(imageUrl)}" alt="${escHtml(candidate.id)}" style="width:100%;max-height:220px;object-fit:contain;border:1px solid #d6deea;border-radius:8px;background:#fff"/>`
          : `<div class="error">preview unavailable</div>`
      }</label>`;
    };

    const regenerateSection =
      selectedJob && selectedManifest
        ? `<section class="card"><h2>5) 뷰별 후보 재생성</h2><div class="notice">front/threeQuarter/profile 중 마음에 안 드는 뷰만 재생성할 수 있습니다. 동일 seed 재시도 또는 seed 변경 재시도를 선택하세요.</div><div class="grid two">${(
            ["front", "threeQuarter", "profile"] as const
          )
            .map((view) => {
              const best = bestByView[view];
              const seedValue = best?.seed ?? DEFAULT_GENERATION_SEED;
              const candidateCountValue = Math.max(
                1,
                selectedManifest.candidates.filter((candidate) => candidate.view === view).length
              );
              return `<form method="post" action="/ui/character-generator/regenerate-view" class="candidate"><input type="hidden" name="generateJobId" value="${escHtml(
                selectedJob.id
              )}"/><input type="hidden" name="viewToGenerate" value="${escHtml(view)}"/><h3>${escHtml(
                view
              )}</h3><div>best score: ${escHtml(best ? best.score.toFixed(3) : "-")}</div><label>candidateCount<input name="candidateCount" value="${escHtml(
                candidateCountValue
              )}" /></label><label>seed<input name="seed" value="${escHtml(
                seedValue
              )}" /></label><label><input type="checkbox" name="boostNegativePrompt" value="true" checked/> negative prompt 강화</label><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit" name="regenerateSameSeed" value="true">동일 seed 재생성</button><button class="secondary" type="submit" name="regenerateSameSeed" value="false">seed 변경 재생성</button></div></form>`;
            })
            .join("")}</div></section>`
        : "";

    const pickSection =
      selectedJob && selectedManifest && selectedManifest.status === "PENDING_HITL"
        ? `<section class="card"><h2>6) 후보 선택 + 적용(Pick)</h2><form method="post" action="/ui/character-generator/pick" class="grid"><input type="hidden" name="generateJobId" value="${escHtml(
            selectedJob.id
          )}"/><div><h3>front</h3><div class="grid two">${groupedCandidates.front
            .sort((a, b) => b.score - a.score)
            .map((candidate, index) => candidateCard("front", candidate, index === 0))
            .join("")}</div></div><div><h3>threeQuarter</h3><div class="grid two">${groupedCandidates.threeQuarter
            .sort((a, b) => b.score - a.score)
            .map((candidate, index) => candidateCard("threeQuarter", candidate, index === 0))
            .join("")}</div></div><div><h3>profile</h3><div class="grid two">${groupedCandidates.profile
            .sort((a, b) => b.score - a.score)
            .map((candidate, index) => candidateCard("profile", candidate, index === 0))
            .join("")}</div></div><button type="submit">후보 선택 완료 -> 팩 빌드 + 프리뷰 실행</button></form></section>`
        : "";

    const rows = jobs
      .map((job) => {
        const manifestGuess = getGenerationManifestPath(job.id);
        const manifestExists = fs.existsSync(manifestGuess);
        const manifest = manifestExists ? readGenerationManifest(manifestGuess) : null;
        const providerWarning = manifest?.providerWarning;
        return `<tr><td><a href="/ui/character-generator?jobId=${encodeURIComponent(job.id)}">${escHtml(job.id)}</a></td><td>${escHtml(
          job.episodeId
        )}</td><td>${job.episode ? `<a href="/ui/episodes/${escHtml(job.episode.id)}">${escHtml(
          job.episode.topic
        )}</a>` : "-"}</td><td><span class="badge ${uiBadge(job.status)}">${escHtml(job.status)}</span></td><td>${escHtml(
          job.progress
        )}%</td><td>${
          manifestExists
            ? `<a href="/artifacts/characters/generations/${encodeURIComponent(job.id)}/generation_manifest.json">매니페스트</a>`
            : "-"
        }${
          providerWarning ? `<div class="badge warn" style="margin-left:6px">${escHtml(providerWarning)}</div>` : ""
        }</td><td>${escHtml(job.createdAt.toLocaleString("ko-KR", { hour12: false }))}</td></tr>`;
      })
      .join("");

    const selectedFailureSummary = pickFirstLine(selectedJob?.lastError ?? null);
    const selectedSection = selectedJob
      ? `<section class="card"><h2>선택된 생성 작업</h2><p>작업 ID: <strong>${escHtml(
          selectedJob.id
        )}</strong></p><p>상태: <span class="badge ${uiBadge(selectedJob.status)}">${escHtml(
          selectedJob.status
        )}</span></p><p>에피소드: <a href="/ui/episodes/${escHtml(selectedJob.episodeId)}">${escHtml(
          selectedJob.episodeId
        )}</a></p><p>세션: ${
          selectedSession
            ? `<strong>${escHtml(selectedSession.id)}</strong> <span class="badge ${uiBadge(selectedSession.status)}">${escHtml(
                selectedSession.status
              )}</span>`
            : `<span class="badge muted">없음</span>`
        }</p><p>매니페스트 경로: <code>${escHtml(selectedManifestPath ?? "아직 생성되지 않음")}</code></p><p>생성기 상태: <span class="badge ${uiBadge(
          selectedManifest?.status ?? selectedJob.status
        )}">${escHtml(selectedManifest?.status ?? "없음")}</span></p>${
          selectedManifest?.providerWarning
            ? `<div class="notice">프로바이더 경고: ${escHtml(selectedManifest.providerWarning)}</div>`
            : ""
        }${
          selectedManifest
            ? `<div class="card" style="margin:10px 0"><h3>일관성 QC 요약</h3><p>평균 일관성: <span class="badge ${uiBadge(
                consistencySummaryTone
              )}">${escHtml(consistencyAverage === null ? "-" : consistencyAverage.toFixed(3))}</span></p><p>낮음 (&lt;0.48): <strong>${escHtml(
                consistencyLowCount
              )}</strong> / 위험 (&lt;0.34): <strong>${escHtml(
                consistencyCriticalCount
              )}</strong> / 측정 수: <strong>${escHtml(consistencyValues.length)}</strong></p></div>`
            : ""
        }${
          selectedFailureSummary
            ? `<div class="error">실패 요약: ${escHtml(selectedFailureSummary)}<details><summary>자세히 보기</summary><pre>${escHtml(
                selectedJob.lastError ?? ""
              )}</pre></details></div>`
            : ""
        }<div id="generation-status" data-job-id="${escHtml(selectedJob.id)}" class="notice" aria-live="polite">상태 폴링 중...</div><div class="actions"><button id="generation-retry" type="button" class="secondary" style="display:none">폴링 재시도</button></div><details><summary>매니페스트 상세</summary><pre>${escHtml(
          JSON.stringify(selectedManifest ?? null, null, 2)
        )}</pre></details></section>`
      : "";

    const previewSection =
      selectedPackId && selectedPreviewUrl
        ? `<section class="card"><h2>7) 프리뷰 + 활성화</h2><p>characterPackId: <code>${escHtml(
            selectedPackId
          )}</code></p>${
            selectedPreviewExists
              ? `<video controls style="width:100%;max-width:960px;border:1px solid #d6deea;border-radius:8px;background:#000"><source src="${escHtml(
                  selectedPreviewUrl
                )}" type="video/mp4"/>브라우저가 video 태그를 지원하지 않습니다.</video>`
              : `<div class="notice">preview.mp4가 아직 생성되지 않았습니다. Pick 이후 worker 진행 상태를 확인하세요.</div>`
          }<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">${
            selectedPreviewExists
              ? `<a class="secondary" href="${escHtml(selectedPreviewUrl)}" target="_blank" rel="noreferrer">preview.mp4 열기</a>`
              : ""
          }${
            selectedQcExists && selectedQcUrl
              ? `<a class="secondary" href="${escHtml(selectedQcUrl)}" target="_blank" rel="noreferrer">qc_report.json 열기</a>`
              : ""
          }</div><form method="post" action="/ui/character-generator/set-active" style="margin-top:10px"><input type="hidden" name="characterPackId" value="${escHtml(
            selectedPackId
          )}"/><button type="submit">활성 팩으로 지정 (APPROVED)</button></form></section>`
        : "";
    const approvedPack = recentPacks.find((pack) => pack.status === "APPROVED") ?? null;
    const rollbackOptions = recentPacks
      .filter((pack) => pack.id !== approvedPack?.id)
      .map(
        (pack) =>
          `<option value="${escHtml(pack.id)}">${escHtml(pack.id)} (v${escHtml(pack.version)}, ${escHtml(pack.status)})</option>`
      )
      .join("");
    const compareOptions = recentPacks
      .map(
        (pack) =>
          `<option value="${escHtml(pack.id)}">${escHtml(pack.id)} (v${escHtml(pack.version)}, ${escHtml(pack.status)})</option>`
      )
      .join("");
    const rollbackSection = `<section class="card"><h2>8) 활성 팩 롤백</h2><p>현재 활성(approved): <strong>${escHtml(
      approvedPack?.id ?? "(none)"
    )}</strong></p><form method="post" action="/ui/character-generator/rollback-active" class="grid two"><label>롤백 대상 팩<select name="targetCharacterPackId">${
      rollbackOptions || '<option value="">롤백 가능한 대상 없음</option>'
    }</select></label><button type="submit"${rollbackOptions ? "" : " disabled"}>활성 팩 롤백 실행</button></form></section>`;
    const compareSection = `<section class="card"><h2>9) A/B 비교</h2><form method="get" action="/ui/character-generator/compare" class="grid two"><label>A 팩<select name="leftPackId">${
      compareOptions || '<option value="">팩 없음</option>'
    }</select></label><label>B 팩<select name="rightPackId">${
      compareOptions || '<option value="">팩 없음</option>'
    }</select></label><button type="submit"${compareOptions ? "" : " disabled"}>비교 화면 열기</button></form></section>`;

    const html = `<section class="card"><h1>\uCE90\uB9AD\uD130 \uC0DD\uC131\uAE30 (\uC0C1\uC138 \uBAA8\uB4DC)</h1><div class="notice">\uC77C\uBC18 \uC0AC\uC6A9\uC740 <a href="/ui/studio">\uD1B5\uD569 \uC2A4\uD29C\uB514\uC624</a>\uB97C \uAD8C\uC7A5\uD569\uB2C8\uB2E4. \uC774 \uD398\uC774\uC9C0\uB294 \uACE0\uAE09/\uC138\uBD80 \uC870\uC815\uC6A9\uC785\uB2C8\uB2E4.</div>${
      message ? `<div class="notice">${escHtml(message)}</div>` : ""
    }${error ? `<div class="error">${escHtml(error)}</div>` : ""}<form method="post" action="/ui/character-generator/create" class="grid"><h2>1) 생성 모드</h2><div class="grid two"><label>모드<select name="mode"><option value="new">new (prompt)</option><option value="reference">reference (내 이미지 기반)</option></select></label><label>프로바이더 <span class="hint" data-tooltip="외부 provider 실패 시 mock 폴백됩니다">?</span><select name="provider"><option value="mock">mock (기본 무료)</option><option value="comfyui">comfyui (옵션)</option><option value="remoteApi">remoteApi (옵션)</option></select></label></div><h2>2) 스타일/프롬프트</h2><div class="grid two"><label>프롬프트 프리셋<select name="promptPreset">${styleOptions}</select></label><label>주제(선택)<input name="topic" placeholder="캐릭터 생성 데모"/></label><label>긍정 프롬프트(선택)<textarea name="positivePrompt" rows="2" placeholder="friendly orange cat mascot, clean silhouette"></textarea></label><label>부정 프롬프트(선택)<textarea name="negativePrompt" rows="2" placeholder="text, watermark, extra fingers, noisy background"></textarea></label><label><input type="checkbox" name="boostNegativePrompt" value="true"/> 부정 프롬프트 강화(손/텍스트/워터마크 억제)</label></div><div class="notice">채널 바이블 룰 자동 반영: forbidden=${escHtml(
      promptRules.forbiddenTerms.join(", ") || "(none)"
    )} / negative=${escHtml(promptRules.negativePromptTerms.join(", ") || "(none)")}</div><h2>3) 후보 수/시드/HITL 설정</h2><div class="grid two"><label>레퍼런스 에셋(reference 모드)<select name="referenceAssetId"><option value=\"\">(없음)</option>${referenceOptions}</select></label><label>후보 수 <span class="hint" data-tooltip="너무 높으면 비용/시간 증가">?</span><input name="candidateCount" value="4"/></label><label>시드(seed) <span class="hint" data-tooltip="같은 입력+seed면 재현성 유지">?</span><input name="seed" value="${DEFAULT_GENERATION_SEED}"/></label><label>자동 선택(autoPick)<select name="autoPick"><option value="false">false (직접 선택)</option><option value="true">true (자동 선택)</option></select></label><label>HITL 선택 강제(requireHitlPick)<select name="requireHitlPick"><option value="true">true</option><option value="false">false</option></select></label></div><h2>4) 생성 실행 + 진행 상태</h2><div class="notice">생성 실행 버튼을 누르면 아래 선택된 작업 영역에서 상태를 자동 조회합니다. ComfyUI 설정/오프라인이면 자동으로 mock 폴백됩니다.</div><button type="submit" data-primary-action="1">캐릭터 후보 생성 실행</button></form></section>${selectedSection}${regenerateSection}${pickSection}${previewSection}${rollbackSection}${compareSection}<section class=\"card\"><h2>최근 생성 작업</h2><table><thead><tr><th>작업</th><th>에피소드</th><th>주제</th><th>상태</th><th>진행률</th><th>매니페스트</th><th>생성 시각</th></tr></thead><tbody>${
      rows || '<tr><td colspan="7"><div class="notice">생성 작업이 없습니다. 위에서 생성 실행을 눌러주세요.</div></td></tr>'
    }</tbody></table></section><script>(function(){const el=document.getElementById("generation-status");if(!el){return;}const retryBtn=document.getElementById("generation-retry");const jobId=el.dataset.jobId;if(!jobId){return;}let timer=null;let failCount=0;const stageLabel=(status)=>{switch(String(status||"").toUpperCase()){case"QUEUED":return"대기중";case"RUNNING":return"생성중";case"SUCCEEDED":return"완료";case"FAILED":return"실패";case"CANCELLED":return"취소";default:return String(status||"unknown");}};const schedule=(ms)=>{if(timer){clearTimeout(timer);}timer=setTimeout(()=>{void tick();},ms);};const toast=(title,msg,tone)=>{if(typeof window.__ecsToast==="function"){window.__ecsToast(title,msg,tone||"warn");}};const speak=(msg)=>{if(typeof window.__ecsSpeak==="function"){window.__ecsSpeak(msg);}};const tick=async()=>{try{const res=await fetch("/api/character-generator/jobs/"+encodeURIComponent(jobId));if(!res.ok){throw new Error("상태 조회 실패: "+res.status);}const json=await res.json();const data=json&&json.data?json.data:null;if(!data){throw new Error("상태 조회 응답에 데이터가 없습니다.");}failCount=0;if(retryBtn){retryBtn.style.display="none";}const manifestStatus=data.manifest&&data.manifest.status?" / 매니페스트="+data.manifest.status:"";const text="상태="+stageLabel(data.status)+" 진행률="+data.progress+"%"+manifestStatus;el.textContent=text;speak(text);if(data.status==="SUCCEEDED"||data.status==="FAILED"||data.status==="CANCELLED"){if(data.manifestExists){toast("생성기", "작업이 종료되어 결과 화면으로 이동합니다.", data.status==="SUCCEEDED"?"ok":"warn");setTimeout(()=>{window.location.href="/ui/character-generator?jobId="+encodeURIComponent(jobId);},500);}return;}schedule(2000);}catch(error){failCount+=1;const wait=Math.min(15000,2000*Math.pow(2,failCount));el.textContent="폴링 실패. "+wait+"ms 후 재시도합니다.";if(retryBtn){retryBtn.style.display="inline-block";}toast("상태조회", String(error), "warn");schedule(wait);}};if(retryBtn){retryBtn.addEventListener("click",()=>{failCount=0;void tick();});}void tick();})();</script>`;

    return reply.type("text/html; charset=utf-8").send(uiPage("\uCE90\uB9AD\uD130 \uC0DD\uC131\uAE30", html));
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
            ? `이미 진행 중인 생성 작업 재사용: ${created.generateJobId} (episode ${created.episodeId})`
            : `${GENERATE_CHARACTER_ASSETS_JOB_NAME} 작업 등록 완료 (episode ${created.episodeId})`
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
          "HITL 선택이 반영되어 BUILD_CHARACTER_PACK가 큐에 등록되었습니다."
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
          `재생성 작업 등록: ${created.view} (${regenerateSameSeed ? "동일 시드" : "새 시드"})`
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
        `/ui/character-generator?message=${encodeURIComponent(`캐릭터 팩 ${characterPackId} 이(가) APPROVED 상태로 활성화되었습니다.`)}`
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
        `/ui/character-generator?message=${encodeURIComponent(`활성 팩 롤백 완료: ${targetCharacterPackId}`)}`
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

    const html = `<section class="card"><h1>캐릭터 팩 A/B 비교</h1><p><a href="/ui/character-generator">\uCE90\uB9AD\uD130 \uC0DD\uC131\uAE30\uB85C \uB3CC\uC544\uAC00\uAE30</a></p><div class="grid two">${panel(
      "A",
      leftPack,
      leftPreviewExists,
      leftQcExists
    )}${panel("B", rightPack, rightPreviewExists, rightQcExists)}</div></section>`;
    return reply.type("text/html; charset=utf-8").send(uiPage("\uCE90\uB9AD\uD130 \uD329 \uBE44\uAD50", html));
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

    const selectedSection = selectedPack
      ? `<section class="card"><h2>선택된 팩</h2><p>id: <strong>${escHtml(selectedPack.id)}</strong></p><p>version: <strong>${escHtml(
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
            ? `<section class="card"><h3>프리뷰 재생기</h3><video controls preload="metadata" style="width:100%;max-width:960px;background:#000;border-radius:8px" src="${escHtml(
                selectedPreviewUrl
              )}"></video><p><a href="${escHtml(selectedPreviewUrl)}">preview.mp4 열기</a></p></section>`
            : `<section class="card"><h3>프리뷰 재생기</h3><div class="error">preview.mp4가 아직 생성되지 않았습니다.</div></section>`
        }${
          selectedQcExists
            ? selectedQcIssues.length > 0
              ? `<section class="card"><h3>QC 이슈</h3><table><thead><tr><th>#</th><th>검사 항목</th><th>심각도</th><th>메시지</th><th>상세</th></tr></thead><tbody>${selectedQcIssueRows}</tbody></table><p><a href="${escHtml(
                  selectedQcUrl ?? ""
                )}">qc_report.json 열기</a></p></section>`
              : `<section class="card"><h3>QC 리포트</h3><div class="notice">이슈 없음</div><pre>${escHtml(
                  JSON.stringify(selectedQcReport, null, 2)
                )}</pre></section>`
            : `<section class="card"><h3>QC 리포트</h3><div class="error">qc_report.json이 아직 생성되지 않았습니다.</div></section>`
        }<details><summary>pack.json 보기</summary><pre>${escHtml(
          JSON.stringify(selectedPack.json, null, 2)
        )}</pre></details></section><section class="card"><h2>선택된 팩 작업</h2><table><thead><tr><th>작업</th><th>유형</th><th>상태</th><th>진행률</th><th>생성 시각</th></tr></thead><tbody>${
          selectedJobs || '<tr><td colspan="5">작업 없음</td></tr>'
        }</tbody></table></section>`
      : "";

    const html = `<section class="card"><h1>\uCE90\uB9AD\uD130 \uD329 (\uC0C1\uC138 \uBAA8\uB4DC)</h1><div class="notice">\uBE60\uB978 \uD750\uB984\uC740 <a href="/ui/studio">\uD1B5\uD569 \uC2A4\uD29C\uB514\uC624</a>\uB97C \uC0AC\uC6A9\uD558\uC138\uC694. \uC774 \uD398\uC774\uC9C0\uB294 \uD329 \uC218\uB3D9 \uC810\uAC80/\uC0DD\uC131\uC6A9\uC785\uB2C8\uB2E4.</div>${
      message ? `<div class="notice">${escHtml(message)}</div>` : ""
    }${error ? `<div class="error">${escHtml(error)}</div>` : ""}<form method="post" action="/ui/characters/create" class="grid"><div class="grid two"><label>정면(front) 에셋<select name="front" required>${
      assetOptions || '<option value="">사용 가능한 READY 에셋 없음</option>'
    }</select></label><label>3/4(threeQuarter) 에셋<select name="threeQuarter" required>${
      assetOptions || '<option value="">사용 가능한 READY 에셋 없음</option>'
    }</select></label><label>측면(profile) 에셋<select name="profile" required>${
      assetOptions || '<option value="">사용 가능한 READY 에셋 없음</option>'
    }</select></label><label>주제(선택)<input name="topic" placeholder="캐릭터 프리뷰"/></label></div><button type="submit">캐릭터 팩 생성 + 프리뷰 작업 등록</button></form></section>${selectedSection}<section class="card"><h2>\uCD5C\uADFC \uCE90\uB9AD\uD130 \uD329</h2><table><thead><tr><th>ID</th><th>버전</th><th>상태</th><th>에피소드</th><th>프리뷰</th><th>생성 시각</th></tr></thead><tbody>${
      packRows || '<tr><td colspan="6">캐릭터 팩이 없습니다</td></tr>'
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
          `캐릭터 팩 생성 완료: ${created.characterPackId} / ${BUILD_CHARACTER_PACK_JOB_NAME} 큐 등록`
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
