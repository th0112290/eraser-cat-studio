import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { SchemaValidator, sha256Hex, stableStringify } from "@ec/shared";
import { ComfyUiCharacterGenerationProvider } from "./comfyuiProvider";
import {
  buildMascotReferenceBankReviewPlan,
  resolveMascotCompositionReferenceAsset,
  resolveMascotReferenceBankDiagnostics,
  resolveMascotStyleReferenceAsset,
  type MascotReferenceBankDiagnostics
} from "./mascotReferenceBank";
import { materializeGeneratedCharacterPack } from "./generatedCharacterPackBuild";
import { collectCharacterPipelineAnimationChecks } from "./generatedCharacterPipelineAnimationChecks";
import { collectCharacterPipelinePackQcChecks } from "./generatedCharacterPipelinePackQc";
import { materializeCharacterPipelineQcArtifacts } from "./generatedCharacterPipelineQcMaterialize";
import { runCharacterPipelineEditRepairLoopWithDeps } from "./generatedCharacterPipelineRepairLoop";
import {
  expressionGenerationNegativePrompt as expressionGenerationNegativePromptImpl,
  expressionRepairNegativePrompt as expressionRepairNegativePromptImpl,
  resolveInitialEditDenoise as resolveInitialEditDenoiseImpl,
  runAdapterViewOnlyRepairStillWithDeps,
  viewRepairPrompt as viewRepairPromptImpl,
  viewRepairNegativePrompt as viewRepairNegativePromptImpl,
  visemeGenerationNegativePrompt as visemeGenerationNegativePromptImpl,
  visemeRepairNegativePrompt as visemeRepairNegativePromptImpl,
  visemeRepairPrompt as visemeRepairPromptImpl,
  expressionRepairPrompt as expressionRepairPromptImpl,
  type StageRepairKind
} from "./generatedCharacterPipelineRepairPrimitives";
import {
  resolveMascotAnchorHeuristics,
  resolveMascotSpeciesProfile,
  type MascotAnchorExpectation,
  type MascotSpeciesAnchorExtractorViewProfile
} from "./species";
import type {
  CharacterCandidateProviderMeta,
  CharacterReferenceBankEntry,
  CharacterStructureControlImage,
  CharacterStructureControlKind,
  MascotSpeciesId,
  PromptQualityProfile
} from "./types";

type JsonRecord = Record<string, unknown>;

export type GeneratedCharacterView = "front" | "threeQuarter" | "profile";
export type GeneratedCharacterExpression =
  | "neutral"
  | "happy"
  | "surprised"
  | "blink"
  | "angry"
  | "sad"
  | "thinking";
export type GeneratedCharacterViseme =
  | "mouth_closed"
  | "mouth_open_small"
  | "mouth_open_wide"
  | "mouth_round_o"
  | "mouth_smile_open"
  | "mouth_fv";
export type GeneratedCharacterAssetStage =
  | "front_master"
  | "view"
  | "expression"
  | "viseme"
  | "repair"
  | "alias";
export type StillWorkflowKind = "generate_zimage" | "edit_kontext" | "view_only_adapter";

export type CharacterStillAsset = {
  schema_version: "1.0";
  asset_id: string;
  character_id: string;
  stage: GeneratedCharacterAssetStage;
  workflow: StillWorkflowKind;
  workflow_template_path: string;
  workflow_version: string;
  workflow_hash: string;
  request_hash: string;
  file_path: string;
  file_url: string;
  metadata_path: string;
  output_prefix: string;
  prompt: string;
  negative_prompt: string;
  seed: number;
  width: number;
  height: number;
  view?: GeneratedCharacterView;
  expression?: GeneratedCharacterExpression;
  viseme?: GeneratedCharacterViseme;
  parent_asset_id?: string;
  parent_asset_path?: string;
  approved: boolean;
  created_at: string;
  model_stack: string[];
  postprocess: string[];
  repair_history: string[];
  cached?: boolean;
};

export type GeneratedCharacterManifest = {
  schema_version: "1.0";
  character_id: string;
  created_at: string;
  updated_at: string;
  root_dir: string;
  species?: MascotSpeciesId;
  approved_front_master?: {
    asset_id: string;
    file_path: string;
    approved_at: string;
  };
  front_master?: CharacterStillAsset;
  views: Partial<Record<GeneratedCharacterView, CharacterStillAsset>>;
  expressions: Partial<Record<GeneratedCharacterView, Partial<Record<GeneratedCharacterExpression, CharacterStillAsset>>>>;
  visemes: Partial<Record<GeneratedCharacterView, Partial<Record<GeneratedCharacterViseme, CharacterStillAsset>>>>;
  qc?: {
    report_path: string;
    repair_tasks_path: string;
    passed: boolean;
    generated_at: string;
    acceptance_status: CharacterPipelineAcceptanceStatus;
    blocker_count: number;
    error_count: number;
    warning_count: number;
    reference_bank?: CharacterPipelineReferenceBankStatus;
  };
  acceptance?: CharacterPipelineAcceptance;
  pack?: {
    pack_id: string;
    pack_path: string;
    proposal_path: string;
    meta_path: string;
    built_at: string;
  };
};

export type CharacterPackAnchorView = GeneratedCharacterView;
export type CharacterPackAnchorId =
  | "head_center"
  | "mouth_center"
  | "eye_near"
  | "eye_far"
  | "ear_near"
  | "ear_far"
  | "paw_anchor"
  | "tail_root";
export type CharacterPackAnchorStatus = "present" | "occluded" | "missing" | "not_applicable";
export type CharacterPackAnchor = {
  x?: number;
  y?: number;
  confidence?: number;
  status?: CharacterPackAnchorStatus;
  notes?: string;
};
export type CharacterPackAnchorViewManifest = Partial<Record<CharacterPackAnchorId, CharacterPackAnchor>>;
export type CharacterPackAnchorViewSummary = {
  present_anchor_ids?: CharacterPackAnchorId[];
  missing_anchor_ids?: CharacterPackAnchorId[];
  notes?: string;
};
export type CharacterPackAnchorSummary = {
  covered_views?: CharacterPackAnchorView[];
  missing_views?: CharacterPackAnchorView[];
  by_view?: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewSummary>>;
  notes?: string;
};
export type CharacterPackAnchorConfidenceSummary = {
  overall?: number;
  by_view?: Partial<Record<CharacterPackAnchorView, number>>;
  notes?: string;
};
export type CharacterPackAnchorManifest = {
  views?: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>>;
  summary?: CharacterPackAnchorSummary;
  confidence_summary?: CharacterPackAnchorConfidenceSummary;
};

const CHARACTER_PACK_ANCHOR_VIEWS = ["front", "threeQuarter", "profile"] as const;
const CHARACTER_PACK_ANCHOR_IDS = [
  "head_center",
  "mouth_center",
  "eye_near",
  "eye_far",
  "ear_near",
  "ear_far",
  "paw_anchor",
  "tail_root"
] as const satisfies readonly CharacterPackAnchorId[];

export type RunGenerateCharacterStillInput = {
  characterId: string;
  positivePrompt: string;
  negativePrompt?: string;
  seed: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  loraStrength?: number;
  outputPrefix?: string;
  autoApprove?: boolean;
};

export type RunEditCharacterStillInput = {
  characterId: string;
  inputImagePath: string;
  editPrompt: string;
  negativePrompt?: string;
  seed: number;
  denoise?: number;
  outputPrefix?: string;
  stage: Exclude<GeneratedCharacterAssetStage, "front_master" | "repair" | "alias">;
  view?: GeneratedCharacterView;
  expression?: GeneratedCharacterExpression;
  viseme?: GeneratedCharacterViseme;
  parentAssetId?: string;
  repairHistory?: string[];
};

export type GenerateCharacterViewSetInput = {
  characterId: string;
  speciesId?: MascotSpeciesId;
  negativePrompt?: string;
  threeQuarterSeed: number;
  profileSeed: number;
  denoise?: number;
};

export type GenerateExpressionPackInput = {
  characterId: string;
  speciesId?: MascotSpeciesId;
  negativePrompt?: string;
  baseSeed: number;
  expressions?: GeneratedCharacterExpression[];
  denoise?: number;
};

export type GenerateVisemePackInput = {
  characterId: string;
  speciesId?: MascotSpeciesId;
  negativePrompt?: string;
  baseSeed: number;
  visemes?: GeneratedCharacterViseme[];
  denoise?: number;
};

export type CharacterPipelineAcceptanceStatus = "accepted" | "repair_required" | "blocked";
export type CharacterPipelineRepairAction =
  | "approve_front_master"
  | "rerun_view_generation"
  | "rerun_expression_generation"
  | "rerun_viseme_generation"
  | "repair_source_asset"
  | "rebuild_pack";
export type CharacterPipelineQcCheck = {
  code: string;
  severity: "INFO" | "WARN" | "ERROR";
  passed: boolean;
  message: string;
  asset_paths?: string[];
  metric?: number;
  threshold?: number;
};
export type CharacterPipelineRepairTask = {
  code: string;
  severity: "WARN" | "ERROR";
  action: CharacterPipelineRepairAction;
  reason: string;
  asset_paths?: string[];
  status: "open";
};
export type CharacterPipelineReferenceBankStatus = {
  species_id: MascotSpeciesId;
  status: "species_ready" | "scaffold_only";
  style_count: number;
  hero_count: number;
  missing_roles: string[];
  notes: string[];
};
export type CharacterPipelineAcceptance = {
  status: CharacterPipelineAcceptanceStatus;
  accepted: boolean;
  updated_at: string;
  report_path?: string;
  repair_tasks_path?: string;
  blocking_check_codes: string[];
  repair_task_count: number;
  reference_bank?: CharacterPipelineReferenceBankStatus;
};

export type CharacterPipelineQcReport = {
  schema_version: "1.0";
  generated_at: string;
  character_id: string;
  approved_front_master_present: boolean;
  checks: CharacterPipelineQcCheck[];
  passed: boolean;
  acceptance_status: CharacterPipelineAcceptanceStatus;
  error_count: number;
  warning_count: number;
  blocker_count: number;
  blocking_check_codes: string[];
  reference_bank?: CharacterPipelineReferenceBankStatus;
};

type CharacterPipelineRepairDocument = {
  schema_version: "1.0";
  generated_at: string;
  character_id: string;
  acceptance_status: CharacterPipelineAcceptanceStatus;
  tasks: CharacterPipelineRepairTask[];
};

export type RunDeterministicCharacterPipelineInput = {
  characterId: string;
  speciesId?: MascotSpeciesId;
  positivePrompt: string;
  negativePrompt?: string;
  frontSeed: number;
  threeQuarterSeed?: number;
  profileSeed?: number;
  expressionBaseSeed?: number;
  visemeBaseSeed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  loraStrength?: number;
  denoise?: number;
  autoApproveFrontMaster?: boolean;
  autoRepairRounds?: number;
};

export type RunCharacterPipelineEditRepairLoopInput = {
  characterId: string;
  negativePrompt?: string;
  threeQuarterSeed: number;
  profileSeed: number;
  expressionBaseSeed: number;
  visemeBaseSeed: number;
  denoise?: number;
  maxRounds?: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const GENERATED_ROOT_DIR = path.join(REPO_ROOT, "assets", "generated", "characters");
const DEFAULT_LOCAL_COMFY_INPUT_DIR =
  "C:\\Users\\th011\\AppData\\Local\\Programs\\ComfyUI\\resources\\ComfyUI\\input";
const COMFY_SERVER_URL = (process.env.COMFY_SERVER_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "");
const COMFY_ADAPTER_URL = (process.env.COMFY_ADAPTER_URL?.trim() || "http://127.0.0.1:8013").replace(/\/+$/, "");
const COMFY_INPUT_DIR =
  process.env.COMFY_INPUT_DIR?.trim() ||
  (fs.existsSync(DEFAULT_LOCAL_COMFY_INPUT_DIR) ? DEFAULT_LOCAL_COMFY_INPUT_DIR : "C:\\input");
const COMFY_IMAGE_TIMEOUT_MS = parsePositiveInt(process.env.COMFY_IMAGE_TIMEOUT_MS, 10 * 60 * 1000);
const DEFAULT_IMAGE_WIDTH = 1024;
const DEFAULT_IMAGE_HEIGHT = 1024;
const DEFAULT_GENERATE_STEPS = 8;
const DEFAULT_GENERATE_CFG = 1;
const DEFAULT_LORA_STRENGTH = 0.8;
const DEFAULT_EDIT_DENOISE = 0.32;
const DEFAULT_AUTO_REPAIR_ROUNDS = parseNonNegativeInt(process.env.CHARACTER_PIPELINE_AUTO_REPAIR_ROUNDS, 2);
const ENABLE_ADAPTER_VIEW_REPAIR = parseBooleanFlag(process.env.CHARACTER_PIPELINE_ENABLE_ADAPTER_VIEW_REPAIR);
const DEFAULT_ADAPTER_VIEW_REPAIR_SPECIES_ID = resolveMascotSpeciesProfile(
  process.env.CHARACTER_PIPELINE_ADAPTER_VIEW_REPAIR_SPECIES_ID
).id;
const schemaValidator = new SchemaValidator(path.join(REPO_ROOT, "packages", "schemas"));
const VIEW_ONLY_STAGE_TEMPLATE_PATH = path.join(
  REPO_ROOT,
  "workflows",
  "comfy",
  "character",
  "view_only",
  "ultra_view_only_v1.stage.json"
);
const POSE_GUIDE_ROOT = path.join(REPO_ROOT, "workflows", "comfy", "pose_guides");
const VIEW_ONLY_QUALITY_PROFILE: PromptQualityProfile = {
  id: "compact_mascot_production_v1",
  label: "Compact Mascot Production",
  qualityTier: "production",
  targetStyle: "compact monochrome mascot",
  width: 1152,
  height: 1152,
  steps: 36,
  cfg: 4.6,
  sampler: "dpmpp_2m_sde",
  scheduler: "karras"
};

const DEFAULT_CROP_BOXES = {
  torso: {
    front: { cx: 0.5, cy: 0.58, w: 0.34, h: 0.36 },
    threeQuarter: { cx: 0.5, cy: 0.58, w: 0.34, h: 0.36 },
    profile: { cx: 0.5, cy: 0.58, w: 0.3, h: 0.36 }
  },
  head: {
    front: { cx: 0.5, cy: 0.26, w: 0.28, h: 0.28 },
    threeQuarter: { cx: 0.5, cy: 0.26, w: 0.28, h: 0.28 },
    profile: { cx: 0.5, cy: 0.26, w: 0.24, h: 0.28 }
  },
  eyes: {
    left: { cx: 0.43, cy: 0.22, w: 0.09, h: 0.06 },
    right: { cx: 0.57, cy: 0.22, w: 0.09, h: 0.06 }
  },
  mouth: { cx: 0.5, cy: 0.31, w: 0.16, h: 0.11 }
} as const;

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

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundNumber(value: number, digits = 4): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function averageNumbers(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function joinNotes(notes: Array<string | undefined>): string | undefined {
  const unique = notes
    .map((entry) => entry?.trim())
    .filter((entry): entry is string => Boolean(entry && entry.length > 0))
    .filter((entry, index, all) => all.indexOf(entry) === index);
  return unique.length > 0 ? unique.join("; ") : undefined;
}

function characterRootDir(characterId: string): string {
  return path.join(GENERATED_ROOT_DIR, characterId);
}

function manifestPathForCharacter(characterId: string): string {
  return path.join(characterRootDir(characterId), "manifest.json");
}

function defaultManifest(characterId: string, speciesId?: MascotSpeciesId): GeneratedCharacterManifest {
  const rootDir = characterRootDir(characterId);
  const now = new Date().toISOString();
  return {
    schema_version: "1.0",
    character_id: characterId,
    created_at: now,
    updated_at: now,
    root_dir: rootDir,
    ...(speciesId ? { species: speciesId } : {}),
    views: {},
    expressions: {},
    visemes: {}
  };
}

function loadManifest(characterId: string): GeneratedCharacterManifest {
  const manifestPath = manifestPathForCharacter(characterId);
  if (!fs.existsSync(manifestPath)) {
    const manifest = defaultManifest(characterId);
    writeJson(manifestPath, manifest);
    return manifest;
  }
  return readJson<GeneratedCharacterManifest>(manifestPath);
}

function resolveManifestSpeciesId(
  manifest: GeneratedCharacterManifest,
  overrideSpeciesId?: MascotSpeciesId
): MascotSpeciesId {
  return resolveMascotSpeciesProfile(overrideSpeciesId ?? manifest.species ?? DEFAULT_ADAPTER_VIEW_REPAIR_SPECIES_ID).id;
}

function assignManifestSpecies(
  manifest: GeneratedCharacterManifest,
  speciesId?: MascotSpeciesId
): GeneratedCharacterManifest {
  const resolvedSpeciesId = resolveManifestSpeciesId(manifest, speciesId);
  if (manifest.species !== resolvedSpeciesId) {
    manifest.species = resolvedSpeciesId;
  }
  return manifest;
}

function resolveAnimationQcThresholds(speciesId?: MascotSpeciesId) {
  return resolveMascotSpeciesProfile(speciesId).animationQc;
}

function saveManifest(manifest: GeneratedCharacterManifest): GeneratedCharacterManifest {
  manifest.updated_at = new Date().toISOString();
  writeJson(manifestPathForCharacter(manifest.character_id), manifest);
  return manifest;
}

export type LoadedImageRaster = {
  filePath: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  data: Buffer;
};

type RgbaColor = {
  r: number;
  g: number;
  b: number;
  alpha: number;
};

type LocalImageReference = {
  filePath: string;
  mimeType: string;
  imageBase64: string;
};

export type ForegroundBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  coverage: number;
};

export type DarkFeatureComponent = {
  pixelCount: number;
  touchesBorder: boolean;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  density: number;
  relativeCenterX: number;
  relativeCenterY: number;
};

const BLOCKING_QC_CODES = new Set<string>([
  "APPROVED_FRONT_MASTER",
  "MANIFEST_INTEGRITY",
  "VIEW_FRONT",
  "VIEW_THREEQUARTER",
  "VIEW_PROFILE",
  "VIEW_VARIATION_THREEQUARTER",
  "VIEW_VARIATION_PROFILE",
  "EXPRESSION_FRONT_NEUTRAL",
  "EXPRESSION_FRONT_HAPPY",
  "EXPRESSION_FRONT_BLINK",
  "VISEME_FRONT_MOUTH_CLOSED",
  "VISEME_FRONT_MOUTH_OPEN_SMALL",
  "VISEME_FRONT_MOUTH_OPEN_WIDE",
  "VISEME_FRONT_MOUTH_ROUND_O",
  "FRONT_FACE_EYES_PRESENT",
  "FRONT_FACE_MOUTH_PRESENT",
  "EXPRESSION_FACE_VARIATION_HAPPY",
  "EXPRESSION_FACE_VARIATION_BLINK",
  "EXPRESSION_FACE_VARIATION_SURPRISED",
  "VISEME_FACE_VARIATION_MOUTH_OPEN_SMALL",
  "VISEME_FACE_VARIATION_MOUTH_OPEN_WIDE",
  "VISEME_FACE_VARIATION_MOUTH_ROUND_O",
  "PACK_ANCHOR_MANIFEST",
  "PACK_ANCHOR_MISSING_FRONT",
  "PACK_ANCHOR_MISSING_THREEQUARTER",
  "PACK_ANCHOR_MISSING_PROFILE",
  "PACK_SCHEMA",
  "PACK_REQUIRED_SLOTS",
  "PACK_REQUIRED_VISEMES",
  "PACK_FACE_EYE_OPEN_CONTENT",
  "PACK_FACE_MOUTH_CLOSED_CONTENT"
]);

const FULL_IMAGE_CROP = { cx: 0.5, cy: 0.5, w: 1, h: 1 } as const;
const MIN_FRONT_EYE_DENSITY = 0.002;
const MAX_FRONT_EYE_DENSITY = 0.18;
const MIN_FRONT_MOUTH_DENSITY = 0.0003;
const MAX_FRONT_MOUTH_DENSITY = 0.08;
const MIN_VIEW_VARIATION = 0.01;
const MIN_PACK_ANCHOR_CONFIDENCE = 0.55;
const MIN_PACK_ANCHOR_VIEW_CONFIDENCE = 0.58;
const MIN_PACK_ANCHOR_OVERALL_CONFIDENCE = 0.6;
const MAX_VIEW_LANDMARK_VERTICAL_DELTA = 0.14;
const MAX_VIEW_LANDMARK_HORIZONTAL_DELTA = 0.18;
async function loadImageRaster(filePath: string): Promise<LoadedImageRaster> {
  const image = sharp(filePath).rotate().ensureAlpha();
  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return {
    filePath,
    width: info.width,
    height: info.height,
    hasAlpha: Boolean(metadata.hasAlpha),
    data
  };
}

async function loadImageRasterFromBuffer(buffer: Buffer, filePath = "<buffer>"): Promise<LoadedImageRaster> {
  const image = sharp(buffer, { limitInputPixels: false }).rotate().ensureAlpha();
  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return {
    filePath,
    width: info.width,
    height: info.height,
    hasAlpha: Boolean(metadata.hasAlpha),
    data
  };
}

function lumaAt(buffer: Buffer, offset: number): number {
  return 0.299 * (buffer[offset] ?? 0) + 0.587 * (buffer[offset + 1] ?? 0) + 0.114 * (buffer[offset + 2] ?? 0);
}

function isDarkFeaturePixel(buffer: Buffer, offset: number): boolean {
  const alpha = buffer[offset + 3] ?? 255;
  if (alpha < 24) {
    return false;
  }
  const red = buffer[offset] ?? 0;
  const green = buffer[offset + 1] ?? 0;
  const blue = buffer[offset + 2] ?? 0;
  const luma = lumaAt(buffer, offset);
  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  const sorted = [red, green, blue].sort((a, b) => b - a);
  const dominantGap = (sorted[0] ?? 0) - (sorted[1] ?? 0);
  // Worker-selected mascot fronts can preserve facial marks as warm or saturated
  // accent strokes instead of pure black linework. Keep the original dark-line
  // detector, but also treat strong chroma accents as feature pixels so eye and
  // mouth crops still localize on the interior face instead of falling back.
  return luma <= 96 || (chroma >= 60 && dominantGap >= 32 && luma <= 235);
}

function isForegroundPixel(buffer: Buffer, offset: number): boolean {
  const alpha = buffer[offset + 3] ?? 255;
  if (alpha < 24) {
    return false;
  }
  return alpha < 250 || lumaAt(buffer, offset) < 235;
}

function normalizedRegionToPixels(image: LoadedImageRaster, crop: { cx: number; cy: number; w: number; h: number }) {
  const left = clamp(Math.floor((crop.cx - crop.w / 2) * image.width), 0, Math.max(0, image.width - 1));
  const top = clamp(Math.floor((crop.cy - crop.h / 2) * image.height), 0, Math.max(0, image.height - 1));
  const right = clamp(Math.ceil((crop.cx + crop.w / 2) * image.width), left + 1, image.width);
  const bottom = clamp(Math.ceil((crop.cy + crop.h / 2) * image.height), top + 1, image.height);
  return { left, top, right, bottom };
}

function measureForegroundBounds(
  image: LoadedImageRaster,
  crop?: { cx: number; cy: number; w: number; h: number }
): ForegroundBounds | null {
  const region = crop
    ? normalizedRegionToPixels(image, crop)
    : { left: 0, top: 0, right: image.width, bottom: image.height };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;

  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (!isForegroundPixel(image.data, offset)) {
        continue;
      }
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (pixels === 0 || maxX < minX || maxY < minY) {
    return null;
  }

  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  const regionArea = Math.max(1, (region.right - region.left) * (region.bottom - region.top));
  return {
    left: minX / image.width,
    top: minY / image.height,
    right: (maxX + 1) / image.width,
    bottom: (maxY + 1) / image.height,
    width: width / image.width,
    height: height / image.height,
    centerX: (minX + maxX + 1) / 2 / image.width,
    centerY: (minY + maxY + 1) / 2 / image.height,
    coverage: pixels / regionArea
  };
}

function measureDarkFeatureCenter(
  image: LoadedImageRaster,
  crop: { cx: number; cy: number; w: number; h: number }
): { x: number; y: number; density: number } | null {
  const region = normalizedRegionToPixels(image, crop);
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (!isDarkFeaturePixel(image.data, offset)) {
        continue;
      }
      sumX += x;
      sumY += y;
      count += 1;
    }
  }
  if (count === 0) {
    return null;
  }
  const area = Math.max(1, (region.right - region.left) * (region.bottom - region.top));
  return {
    x: sumX / count / image.width,
    y: sumY / count / image.height,
    density: count / area
  };
}

function meanVisibleRegionColor(
  image: LoadedImageRaster,
  crop: { cx: number; cy: number; w: number; h: number },
  options?: {
    skipDarkFeatures?: boolean;
    minLuma?: number;
  }
): RgbaColor | null {
  const region = normalizedRegionToPixels(image, crop);
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let alphaTotal = 0;
  let count = 0;
  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const offset = (y * image.width + x) * 4;
      const alpha = image.data[offset + 3] ?? 255;
      if (alpha < 40) {
        continue;
      }
      if (options?.skipDarkFeatures && isDarkFeaturePixel(image.data, offset)) {
        continue;
      }
      const luma = lumaAt(image.data, offset);
      if (luma < (options?.minLuma ?? 0)) {
        continue;
      }
      redTotal += image.data[offset] ?? 0;
      greenTotal += image.data[offset + 1] ?? 0;
      blueTotal += image.data[offset + 2] ?? 0;
      alphaTotal += alpha;
      count += 1;
    }
  }
  if (count === 0) {
    return null;
  }
  return {
    r: Math.round(redTotal / count),
    g: Math.round(greenTotal / count),
    b: Math.round(blueTotal / count),
    alpha: Math.round(alphaTotal / count)
  };
}

function meanRegionDifference(
  a: LoadedImageRaster,
  b: LoadedImageRaster,
  crop: { cx: number; cy: number; w: number; h: number }
): number {
  const regionA = normalizedRegionToPixels(a, crop);
  const regionB = normalizedRegionToPixels(b, crop);
  const width = Math.max(1, Math.min(regionA.right - regionA.left, regionB.right - regionB.left));
  const height = Math.max(1, Math.min(regionA.bottom - regionA.top, regionB.bottom - regionB.top));
  let total = 0;
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offsetA = ((regionA.top + y) * a.width + (regionA.left + x)) * 4;
      const offsetB = ((regionB.top + y) * b.width + (regionB.left + x)) * 4;
      const lumaDiff = Math.abs(lumaAt(a.data, offsetA) - lumaAt(b.data, offsetB)) / 255;
      const alphaDiff = Math.abs((a.data[offsetA + 3] ?? 255) - (b.data[offsetB + 3] ?? 255)) / 255;
      total += lumaDiff * 0.7 + alphaDiff * 0.3;
      count += 1;
    }
  }

  return count > 0 ? total / count : 0;
}

function clampCropBox(crop: CropBox): CropBox {
  const width = clamp(crop.w, 0.02, 1);
  const height = clamp(crop.h, 0.02, 1);
  return {
    cx: clamp(crop.cx, width / 2, 1 - width / 2),
    cy: clamp(crop.cy, height / 2, 1 - height / 2),
    w: width,
    h: height
  };
}

function cropBoxWithinBounds(bounds: ForegroundBounds, relativeCrop: CropBox): CropBox {
  return clampCropBox({
    cx: bounds.left + bounds.width * relativeCrop.cx,
    cy: bounds.top + bounds.height * relativeCrop.cy,
    w: bounds.width * relativeCrop.w,
    h: bounds.height * relativeCrop.h
  });
}

function componentToCropBox(component: DarkFeatureComponent, padX: number, padY: number): CropBox {
  return clampCropBox({
    cx: component.centerX,
    cy: component.centerY,
    w: component.width * (1 + padX * 2),
    h: component.height * (1 + padY * 2)
  });
}

function normalizeEyeFeatureCrop(crop: CropBox, headCrop: CropBox): CropBox {
  return clampCropBox({
    cx: crop.cx,
    cy: crop.cy,
    w: Math.max(crop.w * 1.18, headCrop.w * 0.11),
    h: Math.max(crop.h * 1.24, headCrop.h * 0.14)
  });
}

function deriveHeadCropFromBodyBounds(bounds: ForegroundBounds, view: GeneratedCharacterView): CropBox {
  const widthRatio = view === "profile" ? 0.6 : 0.62;
  const heightRatio = view === "profile" ? 0.5 : 0.54;
  // Compact mascot faces sit noticeably lower than the ear tips, so keep more
  // vertical head area to preserve ears plus the eye/mouth band in one crop.
  const centerYOffset = view === "profile" ? 0.31 : 0.32;
  const centerXOffset = view === "profile" ? 0.01 : 0;
  return clampCropBox({
    cx: bounds.centerX + centerXOffset,
    cy: bounds.top + bounds.height * centerYOffset,
    w: bounds.width * widthRatio,
    h: bounds.height * heightRatio
  });
}

function deriveTorsoCropFromBodyBounds(bounds: ForegroundBounds, view: GeneratedCharacterView): CropBox {
  const widthRatio = view === "profile" ? 0.34 : 0.42;
  const heightRatio = 0.46;
  const centerYOffset = 0.62;
  const centerXOffset = view === "profile" ? 0.01 : 0;
  return clampCropBox({
    cx: bounds.centerX + centerXOffset,
    cy: bounds.top + bounds.height * centerYOffset,
    w: bounds.width * widthRatio,
    h: bounds.height * heightRatio
  });
}

function detectInteriorDarkComponents(image: LoadedImageRaster, crop: CropBox): DarkFeatureComponent[] {
  const region = normalizedRegionToPixels(image, crop);
  const regionWidth = Math.max(1, region.right - region.left);
  const regionHeight = Math.max(1, region.bottom - region.top);
  const visited = new Uint8Array(regionWidth * regionHeight);
  const indexOf = (x: number, y: number) => (y - region.top) * regionWidth + (x - region.left);
  const minimumPixels = Math.max(20, Math.floor(regionWidth * regionHeight * 0.00015));
  const components: DarkFeatureComponent[] = [];

  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      const startIndex = indexOf(x, y);
      if (visited[startIndex]) {
        continue;
      }
      visited[startIndex] = 1;
      const startOffset = (y * image.width + x) * 4;
      if (!isDarkFeaturePixel(image.data, startOffset)) {
        continue;
      }

      const queue: Array<[number, number]> = [[x, y]];
      let cursor = 0;
      let pixelCount = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let touchesBorder = false;

      while (cursor < queue.length) {
        const [cx, cy] = queue[cursor]!;
        cursor += 1;
        pixelCount += 1;
        sumX += cx;
        sumY += cy;
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
        if (cx === region.left || cx === region.right - 1 || cy === region.top || cy === region.bottom - 1) {
          touchesBorder = true;
        }
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1]
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < region.left || nx >= region.right || ny < region.top || ny >= region.bottom) {
            continue;
          }
          const nextIndex = indexOf(nx, ny);
          if (visited[nextIndex]) {
            continue;
          }
          visited[nextIndex] = 1;
          const nextOffset = (ny * image.width + nx) * 4;
          if (!isDarkFeaturePixel(image.data, nextOffset)) {
            continue;
          }
          queue.push([nx, ny]);
        }
      }

      if (pixelCount < minimumPixels) {
        continue;
      }

      const width = Math.max(1, maxX - minX + 1);
      const height = Math.max(1, maxY - minY + 1);
      const area = Math.max(1, width * height);
      components.push({
        pixelCount,
        touchesBorder,
        left: minX / image.width,
        top: minY / image.height,
        right: (maxX + 1) / image.width,
        bottom: (maxY + 1) / image.height,
        width: width / image.width,
        height: height / image.height,
        centerX: sumX / pixelCount / image.width,
        centerY: sumY / pixelCount / image.height,
        density: pixelCount / area,
        relativeCenterX: (sumX / pixelCount - region.left) / regionWidth,
        relativeCenterY: (sumY / pixelCount - region.top) / regionHeight
      });
    }
  }

  return components.filter((component) => !component.touchesBorder).sort((a, b) => b.pixelCount - a.pixelCount);
}

function cropBoxWithinCrop(parentCrop: CropBox, relativeCrop: CropBox): CropBox {
  const left = parentCrop.cx - parentCrop.w / 2;
  const top = parentCrop.cy - parentCrop.h / 2;
  return clampCropBox({
    cx: left + parentCrop.w * relativeCrop.cx,
    cy: top + parentCrop.h * relativeCrop.cy,
    w: parentCrop.w * relativeCrop.w,
    h: parentCrop.h * relativeCrop.h
  });
}

function boundsFromCropBox(crop: CropBox, coverage = 0): ForegroundBounds {
  const left = clamp(crop.cx - crop.w / 2, 0, 1);
  const top = clamp(crop.cy - crop.h / 2, 0, 1);
  const right = clamp(crop.cx + crop.w / 2, left, 1);
  const bottom = clamp(crop.cy + crop.h / 2, top, 1);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(0.0001, right - left),
    height: Math.max(0.0001, bottom - top),
    centerX: clamp((left + right) / 2, 0, 1),
    centerY: clamp((top + bottom) / 2, 0, 1),
    coverage
  };
}

function searchContainsComponentCenter(searchCrop: CropBox, component: DarkFeatureComponent): boolean {
  return (
    Math.abs(component.centerX - searchCrop.cx) <= searchCrop.w / 2 &&
    Math.abs(component.centerY - searchCrop.cy) <= searchCrop.h / 2
  );
}

function pickBestDarkComponentForSearch(
  candidates: DarkFeatureComponent[],
  searchCrop: CropBox,
  options?: {
    verticalWeight?: number;
    widthMultiplier?: number;
    heightMultiplier?: number;
  }
): DarkFeatureComponent | undefined {
  const verticalWeight = options?.verticalWeight ?? 1.2;
  const widthMultiplier = options?.widthMultiplier ?? 1.18;
  const heightMultiplier = options?.heightMultiplier ?? 1.14;
  return [...candidates]
    .filter((component) => searchContainsComponentCenter(expandCropBox(searchCrop, widthMultiplier, heightMultiplier), component))
    .sort((a, b) => {
      const distanceA = Math.hypot(a.centerX - searchCrop.cx, (a.centerY - searchCrop.cy) * verticalWeight);
      const distanceB = Math.hypot(b.centerX - searchCrop.cx, (b.centerY - searchCrop.cy) * verticalWeight);
      return distanceA - distanceB || b.pixelCount - a.pixelCount;
    })[0];
}

function fallbackFeatureCropFromDarkCenter(
  image: LoadedImageRaster,
  searchCrop: CropBox,
  widthScale: number,
  heightScale: number
): CropBox | undefined {
  const center = measureDarkFeatureCenter(image, searchCrop);
  if (!center) {
    return undefined;
  }
  return clampCropBox({
    cx: center.x,
    cy: center.y,
    w: searchCrop.w * widthScale,
    h: searchCrop.h * heightScale
  });
}

function componentDetectionConfidence(component: DarkFeatureComponent, searchCrop: CropBox): number {
  const distance = Math.hypot(
    (component.centerX - searchCrop.cx) / Math.max(searchCrop.w, 0.001),
    ((component.centerY - searchCrop.cy) / Math.max(searchCrop.h, 0.001)) * 1.15
  );
  return clamp(
    0.44 +
      clamp(component.density / 0.42, 0, 1) * 0.18 +
      clamp(component.pixelCount / 1400, 0, 1) * 0.18 +
      (1 - clamp(distance / 0.75, 0, 1)) * 0.16,
    0.18,
    0.98
  );
}

function boundsDetectionConfidence(bounds: ForegroundBounds, searchCrop: CropBox): number {
  const distance = Math.hypot(
    (bounds.centerX - searchCrop.cx) / Math.max(searchCrop.w, 0.001),
    ((bounds.centerY - searchCrop.cy) / Math.max(searchCrop.h, 0.001)) * 1.1
  );
  return clamp(
    0.4 +
      clamp(bounds.coverage / 0.3, 0, 1) * 0.24 +
      clamp(bounds.height / Math.max(searchCrop.h, 0.001), 0, 1) * 0.12 +
      (1 - clamp(distance / 0.8, 0, 1)) * 0.16,
    0.16,
    0.92
  );
}

function measureTopForegroundAnchor(
  image: LoadedImageRaster,
  crop: CropBox
): { x: number; y: number; density: number } | null {
  const region = normalizedRegionToPixels(image, crop);
  const bandHeight = Math.max(2, Math.floor((region.bottom - region.top) * 0.12));
  let topY = Number.POSITIVE_INFINITY;
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = region.top; y < region.bottom; y += 1) {
    let rowHasForeground = false;
    for (let x = region.left; x < region.right; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (!isForegroundPixel(image.data, offset)) {
        continue;
      }
      rowHasForeground = true;
      if (y < topY) {
        topY = y;
        count = 0;
        sumX = 0;
        sumY = 0;
      }
      if (y <= topY + bandHeight) {
        count += 1;
        sumX += x;
        sumY += y;
      }
    }
    if (rowHasForeground && y > topY + bandHeight) {
      break;
    }
  }
  if (!Number.isFinite(topY) || count === 0) {
    return null;
  }
  const area = Math.max(1, (region.right - region.left) * (region.bottom - region.top));
  return {
    x: sumX / count / image.width,
    y: sumY / count / image.height,
    density: count / area
  };
}

function detectFrontFaceFeatureCrops(
  image: LoadedImageRaster,
  headCrop: CropBox
): {
  leftEye?: CropBox;
  rightEye?: CropBox;
  mouth?: CropBox;
  components: DarkFeatureComponent[];
} {
  const components = detectInteriorDarkComponents(image, headCrop);
  const leftEyeSearch = clampCropBox({
    cx: headCrop.cx - headCrop.w * 0.12,
    cy: headCrop.cy + headCrop.h * 0.11,
    w: headCrop.w * 0.14,
    h: headCrop.h * 0.2
  });
  const rightEyeSearch = clampCropBox({
    cx: headCrop.cx + headCrop.w * 0.12,
    cy: headCrop.cy + headCrop.h * 0.11,
    w: headCrop.w * 0.14,
    h: headCrop.h * 0.2
  });
  const mouthSearch = clampCropBox({
    cx: headCrop.cx,
    cy: headCrop.cy + headCrop.h * 0.46,
    w: headCrop.w * 0.3,
    h: headCrop.h * 0.16
  });

  if (components.length === 0) {
    return {
      leftEye: fallbackFeatureCropFromDarkCenter(image, leftEyeSearch, 0.7, 0.78),
      rightEye: fallbackFeatureCropFromDarkCenter(image, rightEyeSearch, 0.7, 0.78),
      mouth: fallbackFeatureCropFromDarkCenter(image, mouthSearch, 0.72, 0.82),
      components
    };
  }

  const leftEyeComponent = pickBestDarkComponentForSearch(components, leftEyeSearch);
  const rightEyeComponent = pickBestDarkComponentForSearch(
    components.filter((component) => component !== leftEyeComponent),
    rightEyeSearch
  );
  const mouthComponent =
    [...components]
      .filter((component) => component !== leftEyeComponent && component !== rightEyeComponent)
      .filter((component) => searchContainsComponentCenter(expandCropBox(mouthSearch, 1.24, 1.28), component))
      .sort((a, b) => b.pixelCount - a.pixelCount || b.centerY - a.centerY)[0] ??
    [...components]
      .filter((component) => component !== leftEyeComponent && component !== rightEyeComponent)
      .sort((a, b) => b.centerY - a.centerY || b.pixelCount - a.pixelCount)[0] ??
    undefined;

  return {
    leftEye: normalizeEyeFeatureCrop(
      leftEyeComponent
        ? componentToCropBox(leftEyeComponent, 0.45, 0.45)
        : fallbackFeatureCropFromDarkCenter(image, leftEyeSearch, 0.7, 0.78) ?? leftEyeSearch,
      headCrop
    ),
    rightEye: normalizeEyeFeatureCrop(
      rightEyeComponent
        ? componentToCropBox(rightEyeComponent, 0.45, 0.45)
        : fallbackFeatureCropFromDarkCenter(image, rightEyeSearch, 0.7, 0.78) ?? rightEyeSearch,
      headCrop
    ),
    mouth: mouthComponent
      ? componentToCropBox(mouthComponent, 0.4, 0.55)
      : fallbackFeatureCropFromDarkCenter(image, mouthSearch, 0.72, 0.82),
    components
  };
}

function resolvePackImageFilePath(value: unknown): string | null {
  const raw = asString(value).trim();
  if (!raw.startsWith("file:")) {
    return null;
  }
  try {
    return fileURLToPath(raw);
  } catch {
    return null;
  }
}

function inspectBackgroundSafety(image: LoadedImageRaster): {
  safe: boolean;
  mode: "alpha" | "solid_light" | "unsafe";
  meanLuma: number;
  meanVariance: number;
} {
  const sampleSize = Math.max(6, Math.floor(Math.min(image.width, image.height) * 0.02));
  const corners: Array<{ x: number; y: number }> = [
    { x: 0, y: 0 },
    { x: Math.max(0, image.width - sampleSize), y: 0 },
    { x: 0, y: Math.max(0, image.height - sampleSize) },
    { x: Math.max(0, image.width - sampleSize), y: Math.max(0, image.height - sampleSize) }
  ];
  let alphaTransparentCount = 0;
  let lumaTotal = 0;
  let count = 0;
  const samples: number[] = [];
  for (const corner of corners) {
    for (let y = corner.y; y < corner.y + sampleSize; y += 1) {
      for (let x = corner.x; x < corner.x + sampleSize; x += 1) {
        const offset = (y * image.width + x) * 4;
        const alpha = image.data[offset + 3] ?? 255;
        if (alpha < 10) {
          alphaTransparentCount += 1;
        }
        const luma = lumaAt(image.data, offset);
        samples.push(luma);
        lumaTotal += luma;
        count += 1;
      }
    }
  }
  if (count === 0) {
    return { safe: false, mode: "unsafe", meanLuma: 0, meanVariance: 0 };
  }
  const meanLuma = lumaTotal / count;
  const meanVariance =
    samples.reduce((accumulator, entry) => accumulator + (entry - meanLuma) * (entry - meanLuma), 0) / count;
  if (alphaTransparentCount / count >= 0.6) {
    return { safe: true, mode: "alpha", meanLuma, meanVariance };
  }
  if (meanLuma >= 200 && meanVariance <= 160) {
    return { safe: true, mode: "solid_light", meanLuma, meanVariance };
  }
  return { safe: false, mode: "unsafe", meanLuma, meanVariance };
}

function collectManifestAssets(manifest: GeneratedCharacterManifest): CharacterStillAsset[] {
  const assets: CharacterStillAsset[] = [];
  if (manifest.front_master) {
    assets.push(manifest.front_master);
  }
  for (const asset of Object.values(manifest.views)) {
    if (asset) {
      assets.push(asset);
    }
  }
  for (const viewMap of Object.values(manifest.expressions)) {
    if (!viewMap) {
      continue;
    }
    for (const asset of Object.values(viewMap)) {
      if (asset) {
        assets.push(asset);
      }
    }
  }
  for (const viewMap of Object.values(manifest.visemes)) {
    if (!viewMap) {
      continue;
    }
    for (const asset of Object.values(viewMap)) {
      if (asset) {
        assets.push(asset);
      }
    }
  }
  return assets;
}

async function synchronizeManifestCanvasToApprovedFront(characterId: string): Promise<GeneratedCharacterManifest> {
  const manifest = loadManifest(characterId);
  const frontAsset = manifest.front_master;
  if (!frontAsset || !fs.existsSync(frontAsset.file_path)) {
    return manifest;
  }
  const frontMetadata = await sharp(frontAsset.file_path, { failOn: "none" }).metadata();
  const targetWidth = frontMetadata.width ?? frontAsset.width ?? DEFAULT_IMAGE_WIDTH;
  const targetHeight = frontMetadata.height ?? frontAsset.height ?? DEFAULT_IMAGE_HEIGHT;
  let changed = false;
  const allAssets = collectManifestAssets(manifest);
  for (const asset of allAssets) {
    const synced = await synchronizeAssetCanvasToTarget({
      asset,
      targetWidth,
      targetHeight,
      postprocessTag: asset.stage === "front_master" ? "canvas_metadata_sync" : "canvas_sync_to_front_master"
    });
    if (
      synced.width !== asset.width ||
      synced.height !== asset.height ||
      synced.postprocess.length !== (asset.postprocess ?? []).length ||
      synced.postprocess.some((entry, index) => entry !== (asset.postprocess ?? [])[index])
    ) {
      updateManifestWithAsset(manifest, synced);
      changed = true;
    }
  }
  return changed ? saveManifest(manifest) : manifest;
}

function isSyntheticSmokeManifest(manifest: GeneratedCharacterManifest): boolean {
  const assets = collectManifestAssets(manifest);
  return (
    assets.length > 0 &&
    assets.every(
      (asset) =>
        asset.workflow_hash.startsWith("smoke-") ||
        asset.request_hash.startsWith("smoke-") ||
        asset.prompt.toLowerCase().includes("smoke fixture")
    )
  );
}

function repairActionForCode(code: string): CharacterPipelineRepairAction {
  if (code === "APPROVED_FRONT_MASTER") {
    return "approve_front_master";
  }
  if (
    code.startsWith("VIEW_") ||
    code.startsWith("VIEW_CANVAS_") ||
    code.startsWith("VIEW_HEAD_") ||
    code.startsWith("PACK_LANDMARK_CONSISTENCY_")
  ) {
    return "rerun_view_generation";
  }
  if (code.startsWith("EXPRESSION_") || code.startsWith("EXPRESSION_BODY_") || code.startsWith("EYE_ANCHOR_")) {
    return "rerun_expression_generation";
  }
  if (code.startsWith("VISEME_") || code.startsWith("MOUTH_ANCHOR_") || code === "PACK_MOUTH_ANCHOR_INSTABILITY") {
    return "rerun_viseme_generation";
  }
  if (code.startsWith("PACK_")) {
    return "rebuild_pack";
  }
  return "repair_source_asset";
}

function resolveAcceptanceFromChecks(
  checks: CharacterPipelineQcCheck[]
): {
  status: CharacterPipelineAcceptanceStatus;
  errorCount: number;
  warningCount: number;
  blockerCount: number;
  blockingCheckCodes: string[];
} {
  const failedChecks = checks.filter((entry) => !entry.passed);
  const errorCount = failedChecks.filter((entry) => entry.severity === "ERROR").length;
  const warningCount = failedChecks.filter((entry) => entry.severity === "WARN").length;
  const blockingCheckCodes = failedChecks
    .filter((entry) => BLOCKING_QC_CODES.has(entry.code))
    .map((entry) => entry.code);
  const blockerCount = blockingCheckCodes.length;
  return {
    status: blockerCount > 0 ? "blocked" : errorCount > 0 ? "repair_required" : "accepted",
    errorCount,
    warningCount,
    blockerCount,
    blockingCheckCodes
  };
}

function toCharacterPipelineReferenceBankStatus(
  diagnostics: MascotReferenceBankDiagnostics
): CharacterPipelineReferenceBankStatus {
  return {
    species_id: diagnostics.speciesId,
    status: diagnostics.status,
    style_count: diagnostics.styleCount,
    hero_count: diagnostics.heroCount,
    missing_roles: [...diagnostics.missingRoles],
    notes: [...diagnostics.notes]
  };
}

function resolveManifestReferenceBankStatus(
  manifest: GeneratedCharacterManifest
): CharacterPipelineReferenceBankStatus {
  return toCharacterPipelineReferenceBankStatus(resolveMascotReferenceBankDiagnostics(resolveManifestSpeciesId(manifest)));
}

function invalidateDerivedState(
  manifest: GeneratedCharacterManifest,
  scope: "front_master" | "derived_assets" | "acceptance_only"
): GeneratedCharacterManifest {
  manifest.qc = undefined;
  manifest.acceptance = undefined;
  if (scope === "front_master") {
    manifest.views = {};
    manifest.expressions = {};
    manifest.visemes = {};
    manifest.pack = undefined;
    return manifest;
  }
  if (scope === "derived_assets") {
    manifest.pack = undefined;
  }
  return manifest;
}

function workflowTemplatePath(kind: StillWorkflowKind): string {
  if (kind === "view_only_adapter") {
    return VIEW_ONLY_STAGE_TEMPLATE_PATH;
  }
  return path.join(
    REPO_ROOT,
    "workflows",
    "comfy",
    "payloads",
    kind === "generate_zimage" ? "workflow_generate_zimage.json" : "workflow_edit_kontext.json"
  );
}

function workflowVersionFromPath(filePath: string): string {
  return path.basename(filePath, path.extname(filePath)).replace(/\.stage$/i, "");
}

function workflowHashFromTemplate(filePath: string): string {
  return sha256Hex(fs.readFileSync(filePath, "utf8"));
}

function summarizeModelStack(prompt: JsonRecord): string[] {
  const values = Object.values(prompt).flatMap((node) => {
    const record = asRecord(node);
    const inputs = record ? asRecord(record.inputs) : null;
    if (!inputs) {
      return [];
    }
    return Object.entries(inputs).flatMap(([key, value]) => {
      if (!key.endsWith("_name") && !key.includes("clip_name") && key !== "lora_name") {
        return [];
      }
      const text = asString(value).trim();
      return text.length > 0 ? [`${key}:${text}`] : [];
    });
  });
  return values.filter((value, index) => values.indexOf(value) === index);
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}: ${text.slice(0, 300)}`);
  }
  return text.length > 0 ? JSON.parse(text) : null;
}

async function fetchBuffer(url: string): Promise<{ data: Buffer; contentType: string | null }> {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${url}: ${text.slice(0, 300)}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    data: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type")
  };
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".svg") {
    return "image/svg+xml";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

function hashFileContents(filePath: string): string {
  return sha256Hex(fs.readFileSync(filePath).toString("base64"));
}

function readLocalImageReference(filePath: string): LocalImageReference {
  const buffer = fs.readFileSync(filePath);
  return {
    filePath,
    mimeType: mimeFromPath(filePath),
    imageBase64: buffer.toString("base64")
  };
}

function readRequiredLocalImageReference(filePath: string, label: string): LocalImageReference {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
  return readLocalImageReference(filePath);
}

function referenceBankEntry(
  id: string,
  role: CharacterReferenceBankEntry["role"],
  view: GeneratedCharacterView,
  weight: number,
  note: string,
  reference: LocalImageReference
): CharacterReferenceBankEntry {
  return {
    id,
    role,
    view,
    weight,
    note,
    imageBase64: reference.imageBase64,
    mimeType: reference.mimeType
  };
}

function poseGuidePathForView(view: Exclude<GeneratedCharacterView, "front">): string {
  return path.join(POSE_GUIDE_ROOT, view === "threeQuarter" ? "threeQuarter.png" : "profile.png");
}

async function resolveStructureGuideSourceBuffers(sourceBuffer: Buffer): Promise<{
  edgeSourceBuffer: Buffer;
  maskSourceBuffer: Buffer;
}> {
  const prepared = sharp(sourceBuffer, { limitInputPixels: false }).rotate().ensureAlpha();
  const { data, info } = await prepared.raw().toBuffer({ resolveWithObject: true });
  const pixelCount = Math.max(1, info.width * info.height);
  let transparentPixels = 0;
  let alphaSignalPixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index] ?? 255;
    if (alpha < 12) {
      transparentPixels += 1;
    }
    if (alpha >= 12) {
      alphaSignalPixels += 1;
    }
  }

  const alphaTransparentCoverage = transparentPixels / pixelCount;
  const alphaSignalCoverage = alphaSignalPixels / pixelCount;
  const alphaUsable = alphaTransparentCoverage >= 0.01 && alphaSignalCoverage >= 0.015 && alphaSignalCoverage <= 0.985;

  const edgeSourceBuffer = await sharp(sourceBuffer, { limitInputPixels: false })
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();

  const inkMaskBuffer = await sharp(edgeSourceBuffer, { limitInputPixels: false })
    .negate()
    .threshold(24)
    .png()
    .toBuffer();

  if (!alphaUsable) {
    return {
      edgeSourceBuffer,
      maskSourceBuffer: inkMaskBuffer
    };
  }

  const alphaMaskBuffer = await sharp(sourceBuffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .extractChannel("alpha")
    .threshold(12)
    .png()
    .toBuffer();
  const alphaMask = await sharp(alphaMaskBuffer, { limitInputPixels: false }).raw().toBuffer({ resolveWithObject: true });
  const inkMask = await sharp(inkMaskBuffer, { limitInputPixels: false }).raw().toBuffer({ resolveWithObject: true });
  const mergedMask = Buffer.alloc(alphaMask.data.length);
  for (let index = 0; index < mergedMask.length; index += 1) {
    mergedMask[index] = Math.max(alphaMask.data[index] ?? 0, inkMask.data[index] ?? 0);
  }

  const maskSourceBuffer = await sharp(mergedMask, {
    raw: {
      width: alphaMask.info.width,
      height: alphaMask.info.height,
      channels: alphaMask.info.channels
    }
  })
    .png()
    .toBuffer();

  return {
    edgeSourceBuffer,
    maskSourceBuffer
  };
}

async function buildStructureControlsFromReference(
  reference: LocalImageReference,
  kinds: CharacterStructureControlKind[],
  source: {
    sourceRole: CharacterReferenceBankEntry["role"];
    sourceRefId: string;
    sourceView: GeneratedCharacterView;
  }
): Promise<Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>>> {
  const sourceBuffer = Buffer.from(reference.imageBase64, "base64");
  const { edgeSourceBuffer, maskSourceBuffer } = await resolveStructureGuideSourceBuffers(sourceBuffer);

  const controls: Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>> = {};

  if (kinds.includes("lineart")) {
    const lineart = await sharp(edgeSourceBuffer, { limitInputPixels: false })
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
      })
      .normalise()
      .threshold(8)
      .png()
      .toBuffer();
    controls.lineart = {
      imageBase64: lineart.toString("base64"),
      mimeType: "image/png",
      strength: source.sourceView === "profile" ? 0.46 : 0.44,
      endPercent: 0.82,
      note: "single-view lineart guide",
      sourceRole: source.sourceRole,
      sourceRefId: source.sourceRefId,
      sourceView: source.sourceView
    };
  }

  if (kinds.includes("canny")) {
    const canny = await sharp(edgeSourceBuffer, { limitInputPixels: false })
      .blur(0.6)
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
      })
      .normalise()
      .threshold(14)
      .png()
      .toBuffer();
    controls.canny = {
      imageBase64: canny.toString("base64"),
      mimeType: "image/png",
      strength: source.sourceView === "profile" ? 0.38 : 0.36,
      endPercent: 0.78,
      note: "single-view edge guide",
      sourceRole: source.sourceRole,
      sourceRefId: source.sourceRefId,
      sourceView: source.sourceView
    };
  }

  if (kinds.includes("depth")) {
    const depth = await sharp(maskSourceBuffer, { limitInputPixels: false })
      .blur(18)
      .normalise()
      .png()
      .toBuffer();
    controls.depth = {
      imageBase64: depth.toString("base64"),
      mimeType: "image/png",
      strength: source.sourceView === "profile" ? 0.5 : 0.48,
      endPercent: 0.72,
      note: "single-view depth guide",
      sourceRole: source.sourceRole,
      sourceRefId: source.sourceRefId,
      sourceView: source.sourceView
    };
  }

  return controls;
}

function setNodeInput(prompt: JsonRecord, nodeId: string, key: string, value: unknown): void {
  const node = asRecord(prompt[nodeId]);
  const inputs = node ? asRecord(node.inputs) : null;
  if (!node || !inputs) {
    throw new Error(`Workflow node ${nodeId}.${key} not found`);
  }
  inputs[key] = value;
}

function materializeComfyInputFile(sourcePath: string, prefix: string): string {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Input image not found: ${sourcePath}`);
  }
  ensureDir(COMFY_INPUT_DIR);
  const ext = path.extname(sourcePath) || ".png";
  const targetFileName = `${prefix}${ext}`;
  const targetPath = path.join(COMFY_INPUT_DIR, targetFileName);
  fs.copyFileSync(sourcePath, targetPath);
  return targetFileName;
}

type ComfyImageFileRef = {
  filename: string;
  subfolder: string;
  type: string;
};

async function waitForComfyHistoryImageFile(promptId: string): Promise<ComfyImageFileRef> {
  const deadline = Date.now() + COMFY_IMAGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const history = await fetchJson(`${COMFY_SERVER_URL}/history/${encodeURIComponent(promptId)}`);
    const historyRecord = asRecord(history);
    const entry = historyRecord ? asRecord(historyRecord[promptId]) : null;
    const outputs = entry ? asRecord(entry.outputs) : null;
    if (!outputs) {
      await sleep(1000);
      continue;
    }
    for (const candidate of Object.values(outputs)) {
      const output = asRecord(candidate);
      const images = output?.images;
      if (!Array.isArray(images) || images.length === 0) {
        continue;
      }
      const first = asRecord(images[0]);
      const filename = asString(first?.filename).trim();
      if (filename.length === 0) {
        continue;
      }
      return {
        filename,
        subfolder: asString(first?.subfolder),
        type: asString(first?.type) || "output"
      };
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ComfyUI image prompt result: ${promptId}`);
}

async function removeSolidBackground(buffer: Buffer): Promise<{ buffer: Buffer; applied: boolean }> {
  const image = sharp(buffer).rotate().ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const sampleSize = Math.max(6, Math.floor(Math.min(info.width, info.height) * 0.02));
  const corners: Array<{ x: number; y: number }> = [
    { x: 0, y: 0 },
    { x: Math.max(0, info.width - sampleSize), y: 0 },
    { x: 0, y: Math.max(0, info.height - sampleSize) },
    { x: Math.max(0, info.width - sampleSize), y: Math.max(0, info.height - sampleSize) }
  ];

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  let varianceAccumulator = 0;

  for (const corner of corners) {
    for (let y = corner.y; y < corner.y + sampleSize; y += 1) {
      for (let x = corner.x; x < corner.x + sampleSize; x += 1) {
        const offset = (y * info.width + x) * 4;
        r += data[offset] ?? 0;
        g += data[offset + 1] ?? 0;
        b += data[offset + 2] ?? 0;
        count += 1;
      }
    }
  }

  if (count === 0) {
    return { buffer: await image.png().toBuffer(), applied: false };
  }

  const bg = { r: r / count, g: g / count, b: b / count };
  const bgLuma = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
  for (const corner of corners) {
    for (let y = corner.y; y < corner.y + sampleSize; y += 1) {
      for (let x = corner.x; x < corner.x + sampleSize; x += 1) {
        const offset = (y * info.width + x) * 4;
        const dr = (data[offset] ?? 0) - bg.r;
        const dg = (data[offset + 1] ?? 0) - bg.g;
        const db = (data[offset + 2] ?? 0) - bg.b;
        varianceAccumulator += dr * dr + dg * dg + db * db;
      }
    }
  }

  const meanVariance = varianceAccumulator / count;
  if (bgLuma < 170 || meanVariance > 260) {
    return { buffer: await image.png().toBuffer(), applied: false };
  }

  const keyed = Buffer.from(data);
  for (let index = 0; index < keyed.length; index += 4) {
    const dr = keyed[index] - bg.r;
    const dg = keyed[index + 1] - bg.g;
    const db = keyed[index + 2] - bg.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    if (distance <= 24) {
      keyed[index + 3] = 0;
      continue;
    }
    if (distance < 52) {
      const alpha = Math.round(((distance - 24) / 28) * 255);
      keyed[index + 3] = Math.min(keyed[index + 3], alpha);
    }
  }

  return {
    buffer: await sharp(keyed, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4
      }
    })
      .png()
      .toBuffer(),
    applied: true
  };
}

function buildRequestHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

function metaPathForImagePath(imagePath: string): string {
  const parsed = path.parse(imagePath);
  return path.join(parsed.dir, `${parsed.name}.meta.json`);
}

function defaultOutputPrefix(characterId: string, label: string): string {
  return `ecs_${characterId}_${label}`.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function viewLabel(view: GeneratedCharacterView): string {
  return view === "threeQuarter" ? "threeQuarter" : view;
}

function stillOutputPath(input: {
  characterId: string;
  stage: GeneratedCharacterAssetStage;
  view?: GeneratedCharacterView;
  expression?: GeneratedCharacterExpression;
  viseme?: GeneratedCharacterViseme;
}): string {
  const root = characterRootDir(input.characterId);
  if (input.stage === "front_master") {
    return path.join(root, "front_master", "front_neutral_master.png");
  }
  if (input.stage === "view" && input.view) {
    return path.join(root, "views", `${viewLabel(input.view)}_neutral.png`);
  }
  if (input.stage === "expression" && input.view && input.expression) {
    return path.join(root, "expressions", `${viewLabel(input.view)}_${input.expression}.png`);
  }
  if (input.stage === "viseme" && input.view && input.viseme) {
    return path.join(root, "visemes", `${viewLabel(input.view)}_${input.viseme}.png`);
  }
  if (input.stage === "repair") {
    return path.join(root, "repair", "repair.png");
  }
  throw new Error(`Unsupported output contract for stage=${input.stage}`);
}

function buildAssetMetadata(input: {
  characterId: string;
  stage: GeneratedCharacterAssetStage;
  workflow: StillWorkflowKind;
  workflowTemplatePath: string;
  requestHash: string;
  outputPath: string;
  outputPrefix: string;
  prompt: string;
  negativePrompt: string;
  seed: number;
  width: number;
  height: number;
  view?: GeneratedCharacterView;
  expression?: GeneratedCharacterExpression;
  viseme?: GeneratedCharacterViseme;
  parentAsset?: CharacterStillAsset;
  approved?: boolean;
  postprocess?: string[];
  cached?: boolean;
  repairHistory?: string[];
  modelStackOverride?: string[];
}): CharacterStillAsset {
  const modelStack =
    input.modelStackOverride ??
    summarizeModelStack(readJson<{ prompt: JsonRecord }>(input.workflowTemplatePath).prompt);
  return {
    schema_version: "1.0",
    asset_id: `${input.characterId}_${input.stage}_${sha256Hex(input.requestHash).slice(0, 12)}`,
    character_id: input.characterId,
    stage: input.stage,
    workflow: input.workflow,
    workflow_template_path: input.workflowTemplatePath,
    workflow_version: workflowVersionFromPath(input.workflowTemplatePath),
    workflow_hash: workflowHashFromTemplate(input.workflowTemplatePath),
    request_hash: input.requestHash,
    file_path: input.outputPath,
    file_url: pathToFileURL(input.outputPath).href,
    metadata_path: metaPathForImagePath(input.outputPath),
    output_prefix: input.outputPrefix,
    prompt: input.prompt,
    negative_prompt: input.negativePrompt,
    seed: input.seed,
    width: input.width,
    height: input.height,
    ...(input.view ? { view: input.view } : {}),
    ...(input.expression ? { expression: input.expression } : {}),
    ...(input.viseme ? { viseme: input.viseme } : {}),
    ...(input.parentAsset
      ? {
          parent_asset_id: input.parentAsset.asset_id,
          parent_asset_path: input.parentAsset.file_path
        }
      : {}),
    approved: input.approved ?? false,
    created_at: new Date().toISOString(),
    model_stack: modelStack,
    postprocess: input.postprocess ?? [],
    repair_history: input.repairHistory ?? [],
    ...(input.cached === true ? { cached: true } : {})
  };
}

function updateManifestWithAsset(manifest: GeneratedCharacterManifest, asset: CharacterStillAsset): GeneratedCharacterManifest {
  if (asset.stage === "front_master") {
    invalidateDerivedState(manifest, "front_master");
    manifest.front_master = asset;
    if (asset.approved) {
      manifest.approved_front_master = {
        asset_id: asset.asset_id,
        file_path: asset.file_path,
        approved_at: new Date().toISOString()
      };
    } else {
      manifest.approved_front_master = undefined;
    }
    return manifest;
  }

  if (asset.stage === "view" && asset.view) {
    invalidateDerivedState(manifest, "derived_assets");
    manifest.views[asset.view] = asset;
    return manifest;
  }

  if (asset.stage === "expression" && asset.view && asset.expression) {
    invalidateDerivedState(manifest, "derived_assets");
    manifest.expressions[asset.view] = manifest.expressions[asset.view] ?? {};
    manifest.expressions[asset.view]![asset.expression] = asset;
    return manifest;
  }

  if (asset.stage === "viseme" && asset.view && asset.viseme) {
    invalidateDerivedState(manifest, "derived_assets");
    manifest.visemes[asset.view] = manifest.visemes[asset.view] ?? {};
    manifest.visemes[asset.view]![asset.viseme] = asset;
    return manifest;
  }

  return manifest;
}

async function submitComfyWorkflow(prompt: JsonRecord): Promise<Buffer> {
  const queued = await fetchJson(`${COMFY_SERVER_URL}/prompt`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: randomUUID(),
      prompt
    })
  });
  const promptId = asString(asRecord(queued)?.prompt_id).trim();
  if (promptId.length === 0) {
    throw new Error("ComfyUI did not return prompt_id");
  }
  const fileRef = await waitForComfyHistoryImageFile(promptId);
  const viewUrl =
    `${COMFY_SERVER_URL}/view?filename=${encodeURIComponent(fileRef.filename)}` +
    `&subfolder=${encodeURIComponent(fileRef.subfolder)}` +
    `&type=${encodeURIComponent(fileRef.type)}`;
  const image = await fetchBuffer(viewUrl);
  if (image.data.byteLength === 0) {
    throw new Error("ComfyUI returned empty image buffer");
  }
  return image.data;
}

function mutateGenerateWorkflow(
  template: { prompt: JsonRecord },
  input: RunGenerateCharacterStillInput & { outputPrefix: string }
): JsonRecord {
  const prompt = structuredClone(template.prompt);
  setNodeInput(prompt, "5", "text", input.positivePrompt);
  setNodeInput(prompt, "6", "text", input.negativePrompt ?? "");
  setNodeInput(prompt, "7", "width", input.width ?? DEFAULT_IMAGE_WIDTH);
  setNodeInput(prompt, "7", "height", input.height ?? DEFAULT_IMAGE_HEIGHT);
  setNodeInput(prompt, "9", "seed", input.seed);
  setNodeInput(prompt, "9", "steps", input.steps ?? DEFAULT_GENERATE_STEPS);
  setNodeInput(prompt, "9", "cfg", input.cfg ?? DEFAULT_GENERATE_CFG);
  setNodeInput(prompt, "4", "strength_model", input.loraStrength ?? DEFAULT_LORA_STRENGTH);
  setNodeInput(prompt, "4", "strength_clip", input.loraStrength ?? DEFAULT_LORA_STRENGTH);
  setNodeInput(prompt, "11", "filename_prefix", input.outputPrefix);
  return prompt;
}

function mutateEditWorkflow(
  template: { prompt: JsonRecord },
  input: RunEditCharacterStillInput & { outputPrefix: string; comfyInputFileName: string }
): JsonRecord {
  const prompt = structuredClone(template.prompt);
  setNodeInput(prompt, "1", "image", input.comfyInputFileName);
  setNodeInput(prompt, "7", "text", input.editPrompt);
  setNodeInput(prompt, "9", "text", input.negativePrompt ?? "");
  setNodeInput(prompt, "16", "seed", input.seed);
  setNodeInput(prompt, "16", "denoise", input.denoise ?? DEFAULT_EDIT_DENOISE);
  setNodeInput(prompt, "18", "filename_prefix", input.outputPrefix);
  return prompt;
}

const GENERATE_PROMPT_SUFFIXES = [
  "simple face only",
  "visible facial features",
  "two small visible eyes",
  "vertical oval or dot eyes only",
  "tiny visible mouth",
  "tiny single-stroke mouth only",
  "readable eye and mouth geometry",
  "cute face details must be present",
  "do not leave the face blank"
] as const;

const EDIT_PROMPT_SUFFIXES = [
  "keep eye and mouth placement readable",
  "make facial features clearly visible",
  "preserve two visible eyes and one visible mouth",
  "do not remove eyes or mouth",
  "keep body pose stable"
] as const;

const NEGATIVE_PROMPT_SUFFIXES = [
  "blank face",
  "no blank face",
  "empty face",
  "no empty face",
  "featureless face",
  "faceless",
  "missing eyes",
  "missing mouth",
  "missing facial features"
] as const;

function mergePromptWithSuffixes(basePrompt: string, suffixes: readonly string[]): string {
  const normalized = basePrompt.trim();
  const lower = normalized.toLowerCase();
  const extras = suffixes.filter((suffix) => !lower.includes(suffix.toLowerCase()));
  if (extras.length === 0) {
    return normalized;
  }
  return [normalized, ...extras].filter((entry) => entry.length > 0).join(", ");
}

function buildAnimationSafeGeneratePrompt(basePrompt: string): string {
  return mergePromptWithSuffixes(basePrompt, GENERATE_PROMPT_SUFFIXES);
}

function buildAnimationSafeEditPrompt(basePrompt: string): string {
  return mergePromptWithSuffixes(basePrompt, EDIT_PROMPT_SUFFIXES);
}

function buildAnimationSafeNegativePrompt(basePrompt: string | undefined): string {
  return mergePromptWithSuffixes(basePrompt ?? "", NEGATIVE_PROMPT_SUFFIXES);
}

async function persistStillAsset(
  outputPath: string,
  metadata: CharacterStillAsset,
  rawBuffer: Buffer
): Promise<CharacterStillAsset> {
  ensureDir(path.dirname(outputPath));
  const cleaned = await removeSolidBackground(rawBuffer);
  fs.writeFileSync(outputPath, cleaned.buffer);
  metadata.postprocess = cleaned.applied ? [...metadata.postprocess, "solid_background_key"] : metadata.postprocess;
  metadata.file_url = pathToFileURL(outputPath).href;
  writeJson(metadata.metadata_path, metadata);
  return metadata;
}

async function normalizeStillToCanvas(rawBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(rawBuffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .resize({
      width,
      height,
      fit: "contain",
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    })
    .png()
    .toBuffer();
}

async function synchronizeAssetCanvasToTarget(input: {
  asset: CharacterStillAsset;
  targetWidth: number;
  targetHeight: number;
  postprocessTag: string;
}): Promise<CharacterStillAsset> {
  if (!fs.existsSync(input.asset.file_path) || !fs.existsSync(input.asset.metadata_path)) {
    return input.asset;
  }
  const metadata = readJson<CharacterStillAsset>(input.asset.metadata_path);
  const imageMetadata = await sharp(input.asset.file_path, { failOn: "none" }).metadata();
  const actualWidth = imageMetadata.width ?? metadata.width;
  const actualHeight = imageMetadata.height ?? metadata.height;
  const needsResize = actualWidth !== input.targetWidth || actualHeight !== input.targetHeight;
  const needsMetadataSync = metadata.width !== input.targetWidth || metadata.height !== input.targetHeight;
  if (!needsResize && !needsMetadataSync) {
    return metadata;
  }
  if (needsResize) {
    const normalizedBuffer = await normalizeStillToCanvas(fs.readFileSync(input.asset.file_path), input.targetWidth, input.targetHeight);
    fs.writeFileSync(input.asset.file_path, normalizedBuffer);
  }
  metadata.width = input.targetWidth;
  metadata.height = input.targetHeight;
  metadata.postprocess = [...new Set([...(metadata.postprocess ?? []), input.postprocessTag])];
  writeJson(metadata.metadata_path, metadata);
  return metadata;
}

async function maybeReturnCachedAsset(input: {
  outputPath: string;
  requestHash: string;
}): Promise<CharacterStillAsset | null> {
  const metaPath = metaPathForImagePath(input.outputPath);
  if (!fs.existsSync(input.outputPath) || !fs.existsSync(metaPath)) {
    return null;
  }
  const metadata = readJson<CharacterStillAsset>(metaPath);
  if (metadata.request_hash !== input.requestHash) {
    return null;
  }
  metadata.cached = true;
  return metadata;
}

function aliasAssetWithNewContract(input: {
  parentAsset: CharacterStillAsset;
  stage: "view" | "expression" | "viseme";
  outputPath: string;
  view: GeneratedCharacterView;
  expression?: GeneratedCharacterExpression;
  viseme?: GeneratedCharacterViseme;
}): CharacterStillAsset {
  ensureDir(path.dirname(input.outputPath));
  fs.copyFileSync(input.parentAsset.file_path, input.outputPath);
  const metadata: CharacterStillAsset = {
    ...input.parentAsset,
    asset_id: `${input.parentAsset.character_id}_${input.stage}_${sha256Hex(input.outputPath).slice(0, 12)}`,
    stage: input.stage,
    file_path: input.outputPath,
    file_url: pathToFileURL(input.outputPath).href,
    metadata_path: metaPathForImagePath(input.outputPath),
    view: input.view,
    expression: input.expression,
    viseme: input.viseme,
    parent_asset_id: input.parentAsset.asset_id,
    parent_asset_path: input.parentAsset.file_path,
    created_at: new Date().toISOString()
  };
  writeJson(metadata.metadata_path, metadata);
  return metadata;
}

function findAssetById(
  manifest: GeneratedCharacterManifest,
  assetId: string
): CharacterStillAsset | null {
  const allAssets: CharacterStillAsset[] = [];
  if (manifest.front_master) {
    allAssets.push(manifest.front_master);
  }
  allAssets.push(...Object.values(manifest.views));
  for (const perView of Object.values(manifest.expressions)) {
    allAssets.push(...Object.values(perView ?? {}));
  }
  for (const perView of Object.values(manifest.visemes)) {
    allAssets.push(...Object.values(perView ?? {}));
  }
  return allAssets.find((asset) => asset.asset_id === assetId) ?? null;
}

function requireApprovedFrontMaster(characterId: string): CharacterStillAsset {
  const manifest = loadManifest(characterId);
  const frontAsset = manifest.front_master;
  if (!frontAsset || !manifest.approved_front_master || !frontAsset.approved) {
    throw new Error(`approved front master required for ${characterId}`);
  }
  return frontAsset;
}

export async function approveFrontMaster(input: {
  characterId: string;
  assetId?: string;
}): Promise<GeneratedCharacterManifest> {
  const manifest = loadManifest(input.characterId);
  const candidate =
    typeof input.assetId === "string" && input.assetId.trim().length > 0
      ? findAssetById(manifest, input.assetId)
      : manifest.front_master ?? null;
  if (!candidate || candidate.stage !== "front_master") {
    throw new Error(`front master asset not found for ${input.characterId}`);
  }
  candidate.approved = true;
  writeJson(candidate.metadata_path, candidate);
  manifest.front_master = candidate;
  manifest.approved_front_master = {
    asset_id: candidate.asset_id,
    file_path: candidate.file_path,
    approved_at: new Date().toISOString()
  };
  invalidateDerivedState(manifest, "acceptance_only");
  return saveManifest(manifest);
}

export async function runGenerateCharacterStill(input: RunGenerateCharacterStillInput): Promise<CharacterStillAsset> {
  const workflowPath = workflowTemplatePath("generate_zimage");
  const outputPath = stillOutputPath({
    characterId: input.characterId,
    stage: "front_master"
  });
  const outputPrefix = input.outputPrefix ?? defaultOutputPrefix(input.characterId, "front_master");
  const positivePrompt = buildAnimationSafeGeneratePrompt(input.positivePrompt);
  const negativePrompt = buildAnimationSafeNegativePrompt(input.negativePrompt);
  const workflowPrompt = mutateGenerateWorkflow(readJson<{ prompt: JsonRecord }>(workflowPath), {
    ...input,
    positivePrompt,
    negativePrompt,
    outputPrefix
  });
  const requestHash = buildRequestHash({
    workflow: "generate_zimage",
    workflowPath,
    workflowPrompt
  });
  const cached = await maybeReturnCachedAsset({
    outputPath,
    requestHash
  });
  if (cached) {
    return cached;
  }
  const metadata = buildAssetMetadata({
    characterId: input.characterId,
    stage: "front_master",
    workflow: "generate_zimage",
    workflowTemplatePath: workflowPath,
    requestHash,
    outputPath,
    outputPrefix,
    prompt: positivePrompt,
    negativePrompt,
    seed: input.seed,
    width: input.width ?? DEFAULT_IMAGE_WIDTH,
    height: input.height ?? DEFAULT_IMAGE_HEIGHT,
    approved: input.autoApprove === true
  });
  const image = await submitComfyWorkflow(workflowPrompt);
  const asset = await persistStillAsset(outputPath, metadata, image);
  const manifest = loadManifest(input.characterId);
  updateManifestWithAsset(manifest, asset);
  saveManifest(manifest);
  if (input.autoApprove) {
    await approveFrontMaster({
      characterId: input.characterId,
      assetId: asset.asset_id
    });
  }
  return asset;
}

export async function runEditCharacterStill(input: RunEditCharacterStillInput): Promise<CharacterStillAsset> {
  const workflowPath = workflowTemplatePath("edit_kontext");
  const inputMetadata = await sharp(input.inputImagePath, { failOn: "none" }).metadata();
  const targetWidth = inputMetadata.width ?? DEFAULT_IMAGE_WIDTH;
  const targetHeight = inputMetadata.height ?? DEFAULT_IMAGE_HEIGHT;
  const outputPath = stillOutputPath({
    characterId: input.characterId,
    stage: input.stage,
    view: input.view,
    expression: input.expression,
    viseme: input.viseme
  });
  const outputPrefix =
    input.outputPrefix ??
    defaultOutputPrefix(
      input.characterId,
      input.stage === "view"
        ? `${viewLabel(input.view ?? "front")}_neutral`
        : input.stage === "expression"
          ? `${viewLabel(input.view ?? "front")}_${input.expression ?? "neutral"}`
          : `${viewLabel(input.view ?? "front")}_${input.viseme ?? "mouth_closed"}`
    );
  const editPrompt = buildAnimationSafeEditPrompt(input.editPrompt);
  const negativePrompt = buildAnimationSafeNegativePrompt(input.negativePrompt);
  const comfyInputFileName = materializeComfyInputFile(input.inputImagePath, outputPrefix);
  const workflowPrompt = mutateEditWorkflow(readJson<{ prompt: JsonRecord }>(workflowPath), {
    ...input,
    editPrompt,
    negativePrompt,
    outputPrefix,
    comfyInputFileName
  });
  const requestHash = buildRequestHash({
    workflow: "edit_kontext",
    workflowPath,
    workflowPrompt,
    inputImagePath: path.resolve(input.inputImagePath),
    inputImageHash: hashFileContents(input.inputImagePath)
  });
  const cached = await maybeReturnCachedAsset({
    outputPath,
    requestHash
  });
  if (cached) {
    const syncedCached = await synchronizeAssetCanvasToTarget({
      asset: cached,
      targetWidth,
      targetHeight,
      postprocessTag: "edit_canvas_sync"
    });
    const manifest = loadManifest(input.characterId);
    updateManifestWithAsset(manifest, syncedCached);
    saveManifest(manifest);
    return syncedCached;
  }
  const parentAsset =
    input.parentAssetId && fs.existsSync(manifestPathForCharacter(input.characterId))
      ? findAssetById(loadManifest(input.characterId), input.parentAssetId)
      : null;
  const metadata = buildAssetMetadata({
    characterId: input.characterId,
    stage: input.stage,
    workflow: "edit_kontext",
    workflowTemplatePath: workflowPath,
    requestHash,
    outputPath,
    outputPrefix,
    prompt: editPrompt,
    negativePrompt,
    seed: input.seed,
    width: targetWidth,
    height: targetHeight,
    view: input.view,
    expression: input.expression,
    viseme: input.viseme,
    ...(parentAsset ? { parentAsset } : {}),
    repairHistory: input.repairHistory
  });
  const image = await submitComfyWorkflow(workflowPrompt);
  const normalizedImage = await normalizeStillToCanvas(image, targetWidth, targetHeight);
  const asset = await persistStillAsset(outputPath, metadata, normalizedImage);
  const manifest = loadManifest(input.characterId);
  updateManifestWithAsset(manifest, asset);
  saveManifest(manifest);
  const syncedAsset = await synchronizeAssetCanvasToTarget({
    asset,
    targetWidth,
    targetHeight,
    postprocessTag: "edit_canvas_sync"
  });
  updateManifestWithAsset(manifest, syncedAsset);
  saveManifest(manifest);
  return syncedAsset;
}

export async function generateCharacterViewSet(
  input: GenerateCharacterViewSetInput
): Promise<GeneratedCharacterManifest> {
  const frontMaster = requireApprovedFrontMaster(input.characterId);
  const manifest = assignManifestSpecies(loadManifest(input.characterId), input.speciesId);
  const speciesProfile = resolveMascotSpeciesProfile(resolveManifestSpeciesId(manifest, input.speciesId));
  const threeQuarterViewHint = speciesProfile.viewHints.threeQuarter ?? "";
  const profileViewHint = speciesProfile.viewHints.profile ?? "";
  const frontViewPath = stillOutputPath({
    characterId: input.characterId,
    stage: "view",
    view: "front"
  });
  const frontViewAsset = aliasAssetWithNewContract({
    parentAsset: frontMaster,
    stage: "view",
    outputPath: frontViewPath,
    view: "front"
  });
  updateManifestWithAsset(manifest, frontViewAsset);

  const derivedViews: Array<{
    view: GeneratedCharacterView;
    seed: number;
    prompt: string;
  }> = [
    {
      view: "threeQuarter",
      seed: input.threeQuarterSeed,
      prompt: mergePromptWithSuffixes(
        "same character, strict right three-quarter turnaround frame, neutral expression, rotate head and torso away from camera, keep one eye partially occluded, preserve approved front identity, preserve head ratio and mascot silhouette, do not keep a front view",
        [
          threeQuarterViewHint,
          ...speciesProfile.identityTokens.slice(0, 2),
          legacySpeciesRepairHint(speciesProfile.id, "view"),
          "clear torso yaw, near eye larger than far eye, far paw still present, absolutely not front-facing"
        ]
      )
    },
    {
      view: "profile",
      seed: input.profileSeed,
      prompt: mergePromptWithSuffixes(
        "same character, strict right profile turnaround frame, neutral expression, rotate head and torso to a full side silhouette, show only one visible eye, preserve approved front identity, preserve silhouette clarity and body proportions, do not keep a front view",
        [
          profileViewHint,
          ...speciesProfile.identityTokens.slice(0, 2),
          legacySpeciesRepairHint(speciesProfile.id, "view"),
          "one visible eye only, one readable near paw, true side silhouette, absolutely not front-facing"
        ]
      )
    }
  ];

  for (const entry of derivedViews) {
    const asset = await runEditCharacterStill({
      characterId: input.characterId,
      inputImagePath: frontMaster.file_path,
      editPrompt: entry.prompt,
      negativePrompt: input.negativePrompt,
      seed: entry.seed,
      denoise: input.denoise,
      stage: "view",
      view: entry.view,
      parentAssetId: frontMaster.asset_id
    });
    updateManifestWithAsset(manifest, asset);
  }

  return saveManifest(manifest);
}

const DEFAULT_EXPRESSION_SET: GeneratedCharacterExpression[] = ["neutral", "happy", "surprised", "blink"];
const DEFAULT_VISEME_SET: GeneratedCharacterViseme[] = [
  "mouth_closed",
  "mouth_open_small",
  "mouth_open_wide",
  "mouth_round_o"
];

function legacySpeciesRepairHint(speciesId: MascotSpeciesId, mode: "view" | "expression" | "viseme"): string {
  if (speciesId === "dog") {
    return mode === "view"
      ? "dog first, rounded puppy muzzle, soft dog ears, both short arms readable when visible, not cat and not wolf"
      : mode === "expression"
        ? "keep the rounded puppy muzzle and button nose locked while changing the face clearly"
        : "mouth opening must stay obvious inside the rounded puppy muzzle and remain readable at thumbnail size";
  }
  if (speciesId === "wolf") {
    return mode === "view"
      ? "wolf first, taller upright ears, short angular wedge muzzle, broader wolf head, not fox and not dog"
      : mode === "expression"
        ? "keep the tall wolf ears and short angular wedge muzzle locked, wolf first and not fox-like"
        : "mouth opening must stay readable inside the short angular wolf muzzle and must not collapse into a thin fox mouth";
  }
  return mode === "view"
    ? "cat first, pointed ears, minimal feline muzzle, not dog and not wolf"
    : mode === "expression"
      ? "keep the pointed cat ears and minimal feline muzzle locked while changing the face clearly"
      : "mouth opening must stay simple and readable inside the minimal feline muzzle";
}

export function expressionPrompt(expression: GeneratedCharacterExpression, speciesId?: MascotSpeciesId): string {
  const speciesProfile = resolveMascotSpeciesProfile(speciesId);
  const frontViewHint = speciesProfile.viewHints.front ?? "";
  if (expression === "happy") {
    return mergePromptWithSuffixes(
      "same character, front view, happy expression, broad visible smile, clearly lifted mouth corners, cheerful eye shape, keep body pose stable, keep silhouette and costume unchanged, make the face unmistakably different from neutral",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "expression"),
        "the happy face must read clearly at thumbnail size"
      ]
    );
  }
  if (expression === "surprised") {
    return mergePromptWithSuffixes(
      "same character, front view, surprised expression, very clear rounded open mouth, widened eyes, keep body pose stable and preserve proportions, make the face unmistakably different from neutral",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "expression"),
        "the surprise face must read clearly at thumbnail size"
      ]
    );
  }
  if (expression === "blink") {
    return mergePromptWithSuffixes(
      "same character, front view, blinking eyes fully closed into thick visible lid lines, neutral mouth, keep body pose stable and preserve identity, make the face unmistakably different from neutral",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "expression"),
        "the blink must read clearly at thumbnail size"
      ]
    );
  }
  if (expression === "angry") {
    return mergePromptWithSuffixes(
      "same character, front view, angry expression, lowered brows, narrowed eyes, tight frowning mouth, keep body pose stable and preserve proportions, make the face unmistakably different from neutral",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "expression"),
        "the angry face must read clearly at thumbnail size"
      ]
    );
  }
  if (expression === "sad") {
    return mergePromptWithSuffixes(
      "same character, front view, sad expression, softened eyes, drooping brows, clearly downturned mouth, keep body pose stable and preserve proportions, make the face unmistakably different from neutral",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "expression"),
        "the sad face must read clearly at thumbnail size"
      ]
    );
  }
  if (expression === "thinking") {
    return mergePromptWithSuffixes(
      "same character, front view, thinking expression, one brow raised, focused eyes, clear pondering mouth, keep body pose stable and preserve proportions, make the face unmistakably different from neutral",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "expression"),
        "the thinking face must read clearly at thumbnail size"
      ]
    );
  }
  return mergePromptWithSuffixes("same character, front view, neutral expression, keep body pose stable and preserve proportions", [
    frontViewHint,
    ...speciesProfile.identityTokens.slice(0, 2),
    legacySpeciesRepairHint(speciesProfile.id, "expression")
  ]);
}

export function visemePrompt(viseme: GeneratedCharacterViseme, speciesId?: MascotSpeciesId): string {
  const speciesProfile = resolveMascotSpeciesProfile(speciesId);
  const frontViewHint = speciesProfile.viewHints.front ?? "";
  if (viseme === "mouth_open_small") {
    return mergePromptWithSuffixes(
      "same character, front view, neutral eyes, speech mouth with a small but clearly visible dark opening below the nose, preserve identity and body pose, visibly change only the lower mouth, the mouth must not read as closed",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "viseme"),
        "the small open mouth must read clearly at thumbnail size",
        "do not leave the lower mouth loop closed",
        "do not change only the nose"
      ]
    );
  }
  if (viseme === "mouth_open_wide") {
    return mergePromptWithSuffixes(
      "same character, front view, neutral eyes, speech mouth with a wide clearly visible dark opening below the nose, preserve identity and body pose, visibly change only the lower mouth, the mouth must read as wide open",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "viseme"),
        "the wide open mouth must read clearly at thumbnail size",
        "do not leave the lower mouth loop closed",
        "do not change only the nose"
      ]
    );
  }
  if (viseme === "mouth_round_o") {
    return mergePromptWithSuffixes(
      "same character, front view, neutral eyes, rounded O mouth shape with a clearly visible dark inner opening below the nose, preserve identity and body pose, visibly change only the lower mouth, the mouth must read as a strong O shape",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "viseme"),
        "the O mouth must read clearly at thumbnail size",
        "do not leave the lower mouth loop closed",
        "do not change only the nose"
      ]
    );
  }
  if (viseme === "mouth_smile_open") {
    return mergePromptWithSuffixes(
      "same character, front view, smiling open mouth for speech, clear visible mouth opening with smiling corners, preserve identity and body pose, visibly change only the mouth",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "viseme"),
        "the smiling open mouth must read clearly at thumbnail size"
      ]
    );
  }
  if (viseme === "mouth_fv") {
    return mergePromptWithSuffixes(
      "same character, front view, mouth shape for F or V phoneme, upper teeth touching lower lip in a clearly readable FV speech shape, preserve identity and body pose, visibly change only the mouth",
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        legacySpeciesRepairHint(speciesProfile.id, "viseme"),
        "the FV mouth shape must read clearly at thumbnail size"
      ]
    );
  }
  return mergePromptWithSuffixes("same character, front view, neutral eyes, mouth closed, preserve identity and body pose", [
    frontViewHint,
    ...speciesProfile.identityTokens.slice(0, 2),
    legacySpeciesRepairHint(speciesProfile.id, "viseme")
  ]);
}

function buildRepairPrimitiveDeps() {
  return {
    resolveMascotSpeciesProfile,
    legacySpeciesRepairHint,
    expressionPrompt,
    visemePrompt,
    mergePromptWithSuffixes,
    buildAnimationSafeGeneratePrompt,
    buildAnimationSafeEditPrompt,
    buildAnimationSafeNegativePrompt,
    clamp,
    workflowTemplatePath,
    stillOutputPath,
    defaultOutputPrefix,
    viewLabel,
    resolveManifestSpeciesId,
    loadManifest,
    poseGuidePathForView,
    readRequiredLocalImageReference,
    readLocalImageReference,
    buildStructureControlsFromReference,
    buildRequestHash,
    hashFileContents,
    maybeReturnCachedAsset,
    normalizeStillToCanvas,
    persistStillAsset,
    buildAssetMetadata,
    updateManifestWithAsset,
    saveManifest,
    repoRoot: REPO_ROOT,
    comfyAdapterUrl: COMFY_ADAPTER_URL,
    viewOnlyQualityProfile: VIEW_ONLY_QUALITY_PROFILE
  };
}

function viewRepairPrompt(view: GeneratedCharacterView, round: number, speciesId?: MascotSpeciesId): string {
  return viewRepairPromptImpl(view, round, speciesId, buildRepairPrimitiveDeps());
}

function expressionRepairPrompt(
  expression: GeneratedCharacterExpression,
  round: number,
  speciesId?: MascotSpeciesId
): string {
  return expressionRepairPromptImpl(expression, round, speciesId, buildRepairPrimitiveDeps());
}

function visemeRepairPrompt(viseme: GeneratedCharacterViseme, round: number, speciesId?: MascotSpeciesId): string {
  return visemeRepairPromptImpl(viseme, round, speciesId, buildRepairPrimitiveDeps());
}

function viewRepairNegativePrompt(basePrompt: string | undefined, view: GeneratedCharacterView): string {
  return viewRepairNegativePromptImpl(basePrompt, view, buildRepairPrimitiveDeps());
}

export function expressionGenerationNegativePrompt(basePrompt: string | undefined): string {
  return expressionGenerationNegativePromptImpl(basePrompt, buildRepairPrimitiveDeps());
}

function expressionRepairNegativePrompt(basePrompt: string | undefined): string {
  return expressionRepairNegativePromptImpl(basePrompt, buildRepairPrimitiveDeps());
}

export function visemeGenerationNegativePrompt(basePrompt: string | undefined): string {
  return visemeGenerationNegativePromptImpl(basePrompt, buildRepairPrimitiveDeps());
}

function visemeRepairNegativePrompt(basePrompt: string | undefined): string {
  return visemeRepairNegativePromptImpl(basePrompt, buildRepairPrimitiveDeps());
}

export function resolveInitialEditDenoise(kind: StageRepairKind, baseDenoise: number | undefined): number {
  return resolveInitialEditDenoiseImpl(kind, baseDenoise, buildRepairPrimitiveDeps());
}

async function runAdapterViewOnlyRepairStill(input: {
  characterId: string;
  frontMaster: CharacterStillAsset;
  view: Exclude<GeneratedCharacterView, "front">;
  negativePrompt?: string;
  speciesId?: MascotSpeciesId;
  baseSeed: number;
  round: number;
  repairHistory?: string[];
}): Promise<CharacterStillAsset> {
  return runAdapterViewOnlyRepairStillWithDeps(input, buildRepairPrimitiveDeps());
}

export async function runCharacterPipelineEditRepairLoop(
  input: RunCharacterPipelineEditRepairLoopInput
): Promise<{
  roundsAttempted: number;
  acceptanceStatus: CharacterPipelineAcceptanceStatus;
  reportPath?: string;
  repairTasksPath?: string;
}> {
  return runCharacterPipelineEditRepairLoopWithDeps(input, {
    characterRootDir,
    readJson,
    loadManifest,
    saveManifest,
    assignManifestSpecies,
    resolveManifestSpeciesId: (manifest) => resolveManifestSpeciesId(manifest),
    requireApprovedFrontMaster,
    stillOutputPath,
    aliasAssetWithNewContract,
    updateManifestWithAsset,
    runAdapterViewOnlyRepairStill,
    runEditCharacterStill,
    runLocalFaceRepairStill,
    buildGeneratedCharacterPack,
    viewRepairPrompt,
    viewRepairNegativePrompt,
    expressionRepairPrompt,
    expressionRepairNegativePrompt,
    visemeRepairPrompt,
    visemeRepairNegativePrompt,
    resolveCharacterPipelineAcceptance,
    resolveInitialEditDenoise,
    defaultAutoRepairRounds: DEFAULT_AUTO_REPAIR_ROUNDS,
    enableAdapterViewRepair: ENABLE_ADAPTER_VIEW_REPAIR,
    runCharacterAnimationSafeQc
  });
}

export async function generateCharacterExpressionPack(
  input: GenerateExpressionPackInput
): Promise<GeneratedCharacterManifest> {
  const frontMaster = requireApprovedFrontMaster(input.characterId);
  const manifest = assignManifestSpecies(loadManifest(input.characterId), input.speciesId);
  const frontNeutralPath = stillOutputPath({
    characterId: input.characterId,
    stage: "expression",
    view: "front",
    expression: "neutral"
  });
  const frontNeutralAsset = aliasAssetWithNewContract({
    parentAsset: frontMaster,
    stage: "expression",
    outputPath: frontNeutralPath,
    view: "front",
    expression: "neutral"
  });
  updateManifestWithAsset(manifest, frontNeutralAsset);

  const expressions = (input.expressions ?? DEFAULT_EXPRESSION_SET).filter((entry) => entry !== "neutral");
  for (let index = 0; index < expressions.length; index += 1) {
    const expression = expressions[index];
    const asset = await runEditCharacterStill({
      characterId: input.characterId,
      inputImagePath: frontMaster.file_path,
      editPrompt: expressionPrompt(expression, manifest.species),
      negativePrompt: expressionGenerationNegativePrompt(input.negativePrompt),
      seed: input.baseSeed + index * 97 + 11,
      denoise: resolveInitialEditDenoise("expression", input.denoise),
      stage: "expression",
      view: "front",
      expression,
      parentAssetId: frontMaster.asset_id
    });
    updateManifestWithAsset(manifest, asset);
  }

  return saveManifest(manifest);
}

export async function generateCharacterVisemePack(
  input: GenerateVisemePackInput
): Promise<GeneratedCharacterManifest> {
  const frontMaster = requireApprovedFrontMaster(input.characterId);
  const manifest = assignManifestSpecies(loadManifest(input.characterId), input.speciesId);
  const closedPath = stillOutputPath({
    characterId: input.characterId,
    stage: "viseme",
    view: "front",
    viseme: "mouth_closed"
  });
  const closedAsset = aliasAssetWithNewContract({
    parentAsset: frontMaster,
    stage: "viseme",
    outputPath: closedPath,
    view: "front",
    viseme: "mouth_closed"
  });
  updateManifestWithAsset(manifest, closedAsset);

  const visemes = (input.visemes ?? DEFAULT_VISEME_SET).filter((entry) => entry !== "mouth_closed");
  for (let index = 0; index < visemes.length; index += 1) {
    const viseme = visemes[index];
    const asset = await runEditCharacterStill({
      characterId: input.characterId,
      inputImagePath: frontMaster.file_path,
      editPrompt: visemePrompt(viseme, manifest.species),
      negativePrompt: visemeGenerationNegativePrompt(input.negativePrompt),
      seed: input.baseSeed + index * 89 + 17,
      denoise: resolveInitialEditDenoise("viseme", input.denoise),
      stage: "viseme",
      view: "front",
      viseme,
      parentAssetId: frontMaster.asset_id
    });
    const strengthenedAsset = await strengthenVisemeAssetIfNeeded({
      characterId: input.characterId,
      baseAsset: closedAsset,
      visemeAsset: asset,
      viseme,
      speciesId: manifest.species
    });
    updateManifestWithAsset(manifest, strengthenedAsset);
  }

  return saveManifest(manifest);
}

export type CropBox = { cx: number; cy: number; w: number; h: number };
export type CharacterCropBoxes = {
  torso: Record<GeneratedCharacterView, CropBox>;
  head: Record<GeneratedCharacterView, CropBox>;
  eyes: {
    left: CropBox;
    right: CropBox;
  };
  mouth: CropBox;
};

function normalizeCropBox(crop: CropBox): CropBox {
  const width = clamp(crop.w, 0.02, 1);
  const height = clamp(crop.h, 0.02, 1);
  return {
    cx: clamp(crop.cx, width / 2, 1 - width / 2),
    cy: clamp(crop.cy, height / 2, 1 - height / 2),
    w: width,
    h: height
  };
}

async function cropNormalizedRegion(input: {
  sourcePath: string;
  crop: CropBox;
  targetPath: string;
  targetWidth: number;
  targetHeight: number;
}): Promise<string> {
  const metadata = await sharp(input.sourcePath, { failOn: "none" }).metadata();
  const sourceWidth = metadata.width ?? DEFAULT_IMAGE_WIDTH;
  const sourceHeight = metadata.height ?? DEFAULT_IMAGE_HEIGHT;
  const width = clamp(Math.round(sourceWidth * input.crop.w), 1, sourceWidth);
  const height = clamp(Math.round(sourceHeight * input.crop.h), 1, sourceHeight);
  const left = clamp(Math.round(sourceWidth * input.crop.cx - width / 2), 0, Math.max(0, sourceWidth - width));
  const top = clamp(Math.round(sourceHeight * input.crop.cy - height / 2), 0, Math.max(0, sourceHeight - height));

  ensureDir(path.dirname(input.targetPath));
  await sharp(input.sourcePath, { failOn: "none" })
    .extract({ left, top, width, height })
    .resize({
      width: input.targetWidth,
      height: input.targetHeight,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(input.targetPath);

  return input.targetPath;
}

async function recenterPackedEyeAsset(slotPath: string): Promise<void> {
  if (!fs.existsSync(slotPath)) {
    return;
  }
  const raster = await loadImageRaster(slotPath);
  const candidates = detectInteriorDarkComponents(raster, { cx: 0.5, cy: 0.5, w: 0.78, h: 0.88 });
  const primary = candidates[0];
  if (!primary) {
    return;
  }
  const metadata = await sharp(slotPath, { failOn: "none" }).metadata();
  const targetWidth = metadata.width ?? 60;
  const targetHeight = metadata.height ?? 36;
  const crop = clampCropBox({
    cx: primary.centerX,
    cy: primary.centerY,
    w: Math.max(primary.width * 2.4, 0.24),
    h: Math.max(primary.height * 2.8, 0.46)
  });
  const tempPath = path.join(path.dirname(slotPath), `${path.parse(slotPath).name}__recenter.png`);
  await cropNormalizedRegion({
    sourcePath: slotPath,
    crop,
    targetPath: tempPath,
    targetWidth,
    targetHeight
  });
  fs.copyFileSync(tempPath, slotPath);
  fs.unlinkSync(tempPath);
}

async function ensurePackedEyeSlotContent(
  slotPath: string,
  mode: "open" | "closed",
  speciesId: MascotSpeciesId
): Promise<void> {
  if (!fs.existsSync(slotPath)) {
    return;
  }
  const raster = await loadImageRaster(slotPath);
  if (detectInteriorDarkComponents(raster, FULL_IMAGE_CROP).length > 0) {
    return;
  }
  const metadata = await sharp(slotPath, { failOn: "none" }).metadata();
  const width = metadata.width ?? 60;
  const height = metadata.height ?? 36;
  const openWidth = speciesId === "wolf" ? 12 : speciesId === "dog" ? 14 : 13;
  const openHeight = speciesId === "wolf" ? 22 : 20;
  const strokeHeight = speciesId === "wolf" ? 7 : 8;
  const glyphSvg =
    mode === "open"
      ? `<ellipse cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.48)}" rx="${Math.round(openWidth / 2)}" ry="${Math.round(openHeight / 2)}" fill="rgba(14,14,14,0.98)" />`
      : `<rect x="${Math.round(width * 0.26)}" y="${Math.round(height * 0.44)}" width="${Math.round(width * 0.48)}" height="${strokeHeight}" rx="${Math.max(3, Math.round(strokeHeight / 2))}" ry="${Math.max(3, Math.round(strokeHeight / 2))}" fill="rgba(14,14,14,0.98)" />`;
  const slotBuffer = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${glyphSvg}
</svg>`
    ),
    { limitInputPixels: false }
  )
    .png()
    .toBuffer();
  fs.writeFileSync(slotPath, slotBuffer);
}

async function deriveAutoCropBoxes(manifest: GeneratedCharacterManifest): Promise<CharacterCropBoxes> {
  const cropBoxes: CharacterCropBoxes = {
    torso: {
      front: { ...DEFAULT_CROP_BOXES.torso.front },
      threeQuarter: { ...DEFAULT_CROP_BOXES.torso.threeQuarter },
      profile: { ...DEFAULT_CROP_BOXES.torso.profile }
    },
    head: {
      front: { ...DEFAULT_CROP_BOXES.head.front },
      threeQuarter: { ...DEFAULT_CROP_BOXES.head.threeQuarter },
      profile: { ...DEFAULT_CROP_BOXES.head.profile }
    },
    eyes: {
      left: { ...DEFAULT_CROP_BOXES.eyes.left },
      right: { ...DEFAULT_CROP_BOXES.eyes.right }
    },
    mouth: { ...DEFAULT_CROP_BOXES.mouth }
  };

  const viewEntries = await Promise.all(
    (["front", "threeQuarter", "profile"] as const).map(async (view) => {
      const asset = manifest.views[view];
      if (!asset?.file_path || !fs.existsSync(asset.file_path)) {
        return null;
      }
      const raster = await loadImageRaster(asset.file_path);
      const bounds = measureForegroundBounds(raster);
      return bounds ? { view, raster, bounds } : null;
    })
  );

  for (const entry of viewEntries) {
    if (!entry) {
      continue;
    }
    cropBoxes.torso[entry.view] = deriveTorsoCropFromBodyBounds(entry.bounds, entry.view);
    cropBoxes.head[entry.view] = deriveHeadCropFromBodyBounds(entry.bounds, entry.view);
    if (entry.view === "front") {
      const frontFace = detectFrontFaceFeatureCrops(entry.raster, cropBoxes.head.front);
      if (frontFace.leftEye) {
        cropBoxes.eyes.left = frontFace.leftEye;
      }
      if (frontFace.rightEye) {
        cropBoxes.eyes.right = frontFace.rightEye;
      }
      if (frontFace.mouth) {
        cropBoxes.mouth = frontFace.mouth;
      }
    }
  }

  return cropBoxes;
}

function applyCropBoxOverrides(characterId: string, baseCropBoxes: CharacterCropBoxes): CharacterCropBoxes {
  const overridesPath = path.join(characterRootDir(characterId), "pack", "overrides", "crop-boxes.json");
  if (!fs.existsSync(overridesPath)) {
    return baseCropBoxes;
  }
  const overrides = readJson<Partial<CharacterCropBoxes>>(overridesPath);
  return {
    torso: {
      front: overrides.torso?.front ?? baseCropBoxes.torso.front,
      threeQuarter: overrides.torso?.threeQuarter ?? baseCropBoxes.torso.threeQuarter,
      profile: overrides.torso?.profile ?? baseCropBoxes.torso.profile
    },
    head: {
      front: overrides.head?.front ?? baseCropBoxes.head.front,
      threeQuarter: overrides.head?.threeQuarter ?? baseCropBoxes.head.threeQuarter,
      profile: overrides.head?.profile ?? baseCropBoxes.head.profile
    },
    eyes: {
      left: overrides.eyes?.left ?? baseCropBoxes.eyes.left,
      right: overrides.eyes?.right ?? baseCropBoxes.eyes.right
    },
    mouth: overrides.mouth ?? baseCropBoxes.mouth
  };
}

function buildAnchorEntry(input: {
  x?: number;
  y?: number;
  confidence?: number;
  status: CharacterPackAnchorStatus;
  notes?: string;
}): CharacterPackAnchor {
  const entry: CharacterPackAnchor = {
    status: input.status,
    ...(typeof input.confidence === "number" ? { confidence: roundNumber(clamp(input.confidence, 0, 1), 3) } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
  if (typeof input.x === "number" && typeof input.y === "number") {
    entry.x = roundNumber(clamp(input.x, 0, 1), 4);
    entry.y = roundNumber(clamp(input.y, 0, 1), 4);
  }
  return entry;
}

function anchorLabel(
  view: CharacterPackAnchorView,
  anchorId: CharacterPackAnchorId,
  confidence?: number,
  status?: CharacterPackAnchorStatus
): string {
  const suffix: string[] = [];
  if (typeof confidence === "number") {
    suffix.push(confidence.toFixed(2));
  }
  if (status && status !== "present") {
    suffix.push(status);
  }
  return suffix.length > 0 ? `${view}.${anchorId} (${suffix.join(", ")})` : `${view}.${anchorId}`;
}

function finalizeCharacterPackAnchorManifest(
  views: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>>,
  notes?: string[]
): CharacterPackAnchorManifest {
  const normalizedViews: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>> = {};
  const summaryByView: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewSummary>> = {};
  const coveredViews: CharacterPackAnchorView[] = [];
  const missingViews: CharacterPackAnchorView[] = [];
  const confidenceByView: Partial<Record<CharacterPackAnchorView, number>> = {};
  const confidenceValues: number[] = [];

  for (const view of CHARACTER_PACK_ANCHOR_VIEWS) {
    const sourceView = views[view] ?? {};
    const normalizedView: CharacterPackAnchorViewManifest = {};
    const presentAnchorIds: CharacterPackAnchorId[] = [];
    const missingAnchorIds: CharacterPackAnchorId[] = [];
    const occludedAnchorIds: CharacterPackAnchorId[] = [];
    const viewConfidences: number[] = [];

    for (const anchorId of CHARACTER_PACK_ANCHOR_IDS) {
      const entry = sourceView[anchorId] ?? buildAnchorEntry({ status: "missing", confidence: 0, notes: "anchor not derived" });
      normalizedView[anchorId] = entry;
      if (entry.status === "present") {
        presentAnchorIds.push(anchorId);
      } else if (entry.status === "missing") {
        missingAnchorIds.push(anchorId);
      } else if (entry.status === "occluded") {
        occludedAnchorIds.push(anchorId);
      }
      if (typeof entry.confidence === "number") {
        viewConfidences.push(entry.confidence);
        confidenceValues.push(entry.confidence);
      }
    }

    const viewConfidence = averageNumbers(viewConfidences);
    if (viewConfidence !== null) {
      confidenceByView[view] = roundNumber(viewConfidence, 3);
    }
    if (presentAnchorIds.length > 0 || occludedAnchorIds.length > 0) {
      coveredViews.push(view);
    } else {
      missingViews.push(view);
    }
    normalizedViews[view] = normalizedView;
    summaryByView[view] = {
      present_anchor_ids: presentAnchorIds,
      missing_anchor_ids: missingAnchorIds,
      notes: joinNotes([
        occludedAnchorIds.length > 0 ? `occluded anchors: ${occludedAnchorIds.join(", ")}` : undefined,
        viewConfidence !== null ? `mean confidence=${viewConfidence.toFixed(2)}` : undefined
      ])
    };
  }

  const manifestNotes = [
    "Coordinates are normalized to source view rasters",
    "Occluded anchors can carry inferred coordinates",
    ...(notes ?? [])
  ];
  const overallConfidence = averageNumbers(confidenceValues);
  return {
    views: normalizedViews,
    summary: {
      covered_views: coveredViews,
      missing_views: missingViews,
      by_view: summaryByView,
      notes: joinNotes(manifestNotes)
    },
    confidence_summary: {
      ...(overallConfidence !== null ? { overall: roundNumber(overallConfidence, 3) } : {}),
      by_view: confidenceByView,
      notes: joinNotes(manifestNotes)
    }
  };
}

function collectAnchorReviewSummary(anchorManifest: CharacterPackAnchorManifest): {
  missingAnchorIds: string[];
  lowConfidenceAnchorIds: string[];
  overallConfidence?: number;
} {
  const missingAnchorIds: string[] = [];
  const lowConfidenceAnchorIds: string[] = [];
  for (const view of CHARACTER_PACK_ANCHOR_VIEWS) {
    const viewManifest = anchorManifest.views?.[view];
    for (const anchorId of CHARACTER_PACK_ANCHOR_IDS) {
      const entry = viewManifest?.[anchorId];
      if (!entry || entry.status === "missing") {
        missingAnchorIds.push(anchorLabel(view, anchorId));
        continue;
      }
      if (
        entry.status !== "not_applicable" &&
        typeof entry.confidence === "number" &&
        entry.confidence < MIN_PACK_ANCHOR_CONFIDENCE
      ) {
        lowConfidenceAnchorIds.push(anchorLabel(view, anchorId, entry.confidence, entry.status));
      }
    }
  }
  return {
    missingAnchorIds,
    lowConfidenceAnchorIds,
    ...(typeof anchorManifest.confidence_summary?.overall === "number"
      ? { overallConfidence: anchorManifest.confidence_summary.overall }
      : {})
  };
}

function applyAnchorOverrideEntry(baseEntry: CharacterPackAnchor, overrideEntry: JsonRecord): CharacterPackAnchor {
  const status = asString(overrideEntry.status).trim();
  return buildAnchorEntry({
    x: asNumber(overrideEntry.x) ?? baseEntry.x,
    y: asNumber(overrideEntry.y) ?? baseEntry.y,
    confidence: asNumber(overrideEntry.confidence) ?? baseEntry.confidence,
    status:
      status === "present" || status === "occluded" || status === "missing" || status === "not_applicable"
        ? status
        : (baseEntry.status ?? "missing"),
    notes: asString(overrideEntry.notes).trim() || baseEntry.notes
  });
}

function applyAnchorOverrides(characterId: string, baseAnchorManifest: CharacterPackAnchorManifest): CharacterPackAnchorManifest {
  const overridesPath = path.join(characterRootDir(characterId), "pack", "overrides", "anchors.json");
  if (!fs.existsSync(overridesPath)) {
    return baseAnchorManifest;
  }
  const rawOverrides = readJson<unknown>(overridesPath);
  const overrideRoot = asRecord(rawOverrides);
  const overrideViews = asRecord(overrideRoot?.views) ?? overrideRoot;
  const mergedViews: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>> = {};
  for (const view of CHARACTER_PACK_ANCHOR_VIEWS) {
    const baseView = { ...(baseAnchorManifest.views?.[view] ?? {}) };
    const overrideView = asRecord(overrideViews?.[view]);
    if (overrideView) {
      for (const anchorId of CHARACTER_PACK_ANCHOR_IDS) {
        const overrideEntry = asRecord(overrideView[anchorId]);
        if (!overrideEntry) {
          continue;
        }
        baseView[anchorId] = applyAnchorOverrideEntry(
          baseView[anchorId] ?? buildAnchorEntry({ status: "missing", confidence: 0 }),
          overrideEntry
        );
      }
    }
    mergedViews[view] = baseView;
  }
  return finalizeCharacterPackAnchorManifest(mergedViews, ["anchors.json override applied"]);
}

function directionalAnchorX(
  view: GeneratedCharacterView,
  facingSign: number,
  input: {
    defaultPositiveX: number;
    defaultNegativeX: number;
    profilePositiveX?: number;
    profileNegativeX?: number;
    biasX?: number;
  }
): number {
  const positiveX = view === "profile" ? (input.profilePositiveX ?? input.defaultPositiveX) : input.defaultPositiveX;
  const negativeX = view === "profile" ? (input.profileNegativeX ?? input.defaultNegativeX) : input.defaultNegativeX;
  const biasX = input.biasX ?? 0;
  return clamp((facingSign >= 0 ? positiveX : negativeX) + (facingSign >= 0 ? biasX : -biasX), 0.08, 0.92);
}

function applyConfidenceBoost(baseConfidence: number, boost: number | undefined, floor = 0.12, ceiling = 0.98): number {
  return clamp(baseConfidence + (boost ?? 0), floor, ceiling);
}

function buildFallbackAnchorByExpectation(input: {
  x: number;
  y: number;
  confidence: number;
  expectation: MascotAnchorExpectation;
  notes: string;
}): CharacterPackAnchor {
  if (input.expectation === "not_applicable") {
    return buildAnchorEntry({
      confidence: input.confidence,
      status: "not_applicable",
      notes: input.notes
    });
  }
  return buildAnchorEntry({
    x: input.x,
    y: input.y,
    confidence: input.confidence,
    status: input.expectation,
    notes: input.notes
  });
}

function anchorStatusMatchesExpectation(
  actualStatus: CharacterPackAnchorStatus | undefined,
  expectation: MascotAnchorExpectation
): boolean {
  const actual = actualStatus ?? "missing";
  if (expectation === "present") {
    return actual === "present";
  }
  if (expectation === "occluded") {
    return actual === "occluded" || actual === "present";
  }
  return actual === "not_applicable" || actual === "occluded";
}

function normalizedHorizontalDelta(
  head: CharacterPackAnchor | undefined,
  anchor: CharacterPackAnchor | undefined,
  bounds: ForegroundBounds,
  facingSign: number
): number | null {
  if (typeof head?.x !== "number" || typeof anchor?.x !== "number") {
    return null;
  }
  return clamp(((anchor.x - head.x) * facingSign) / Math.max(bounds.width, 0.0001), 0, 1);
}

function normalizedEarHeight(
  head: CharacterPackAnchor | undefined,
  ear: CharacterPackAnchor | undefined,
  bounds: ForegroundBounds
): number | null {
  if (typeof head?.y !== "number" || typeof ear?.y !== "number") {
    return null;
  }
  return clamp((head.y - ear.y) / Math.max(bounds.height, 0.0001), 0, 1);
}

async function deriveAutoAnchorManifest(
  manifest: GeneratedCharacterManifest,
  cropBoxes: CharacterCropBoxes
): Promise<CharacterPackAnchorManifest> {
  const views: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>> = {};
  const speciesId = resolveManifestSpeciesId(manifest);
  const speciesProfile = resolveMascotSpeciesProfile(speciesId);
  const speciesAnchorHeuristics = resolveMascotAnchorHeuristics(speciesId);

  for (const view of CHARACTER_PACK_ANCHOR_VIEWS) {
    const asset = manifest.views[view];
    if (!asset?.file_path || !fs.existsSync(asset.file_path)) {
      views[view] = Object.fromEntries(
        CHARACTER_PACK_ANCHOR_IDS.map((anchorId) => [anchorId, buildAnchorEntry({ status: "missing", confidence: 0, notes: "view asset missing" })])
      ) as CharacterPackAnchorViewManifest;
      continue;
    }

    const raster = await loadImageRaster(asset.file_path);
    const viewHeuristics = speciesAnchorHeuristics.byView[view];
    const bodyBounds = measureForegroundBounds(raster) ?? boundsFromCropBox(FULL_IMAGE_CROP, 0);
    const torsoCrop = cropBoxes.torso[view];
    const headCrop = cropBoxes.head[view];
    const headSearch = expandCropBox(headCrop, 1.06, 1.1);
    const headBounds = measureForegroundBounds(raster, headSearch) ?? boundsFromCropBox(headCrop, 0);
    const headComponents = detectInteriorDarkComponents(raster, headSearch);

    const provisionalEyeCandidates = headComponents.filter(
      (component) => component.relativeCenterY >= 0.1 && component.relativeCenterY <= 0.52
    );
    const provisionalMouthCandidates = headComponents.filter((component) => component.relativeCenterY >= 0.36);
    const directionSource =
      provisionalMouthCandidates.sort((a, b) => b.centerY - a.centerY || b.pixelCount - a.pixelCount)[0] ??
      provisionalEyeCandidates.sort((a, b) => b.pixelCount - a.pixelCount)[0];
    const facingSign = view === "front" ? 1 : directionSource ? (directionSource.centerX >= headBounds.centerX ? 1 : -1) : 1;
    const nearRelativeX = directionalAnchorX(view, facingSign, {
      defaultPositiveX: 0.64,
      defaultNegativeX: 0.36,
      profilePositiveX: 0.7,
      profileNegativeX: 0.3,
      biasX: viewHeuristics.eyeNearBiasX
    });
    const farRelativeX = directionalAnchorX(view, facingSign, {
      defaultPositiveX: 0.36,
      defaultNegativeX: 0.64,
      profilePositiveX: 0.3,
      profileNegativeX: 0.7,
      biasX: viewHeuristics.eyeFarBiasX
    });
    const earNearRelativeX = directionalAnchorX(view, facingSign, {
      defaultPositiveX: 0.8,
      defaultNegativeX: 0.2,
      profilePositiveX: 0.82,
      profileNegativeX: 0.18,
      biasX: viewHeuristics.earNearBiasX
    });
    const earFarRelativeX = directionalAnchorX(view, facingSign, {
      defaultPositiveX: 0.2,
      defaultNegativeX: 0.8,
      profilePositiveX: 0.18,
      profileNegativeX: 0.82,
      biasX: viewHeuristics.earFarBiasX
    });

    const frontEyeFarCenter = view === "front" ? measureDarkFeatureCenter(raster, cropBoxes.eyes.left) : null;
    const frontEyeNearCenter = view === "front" ? measureDarkFeatureCenter(raster, cropBoxes.eyes.right) : null;
    const frontMouthCenter = view === "front" ? measureDarkFeatureCenter(raster, cropBoxes.mouth) : null;

    const eyeNearSearch =
      view === "front"
        ? cropBoxes.eyes.right
        : cropBoxWithinCrop(headCrop, {
            cx: nearRelativeX,
            cy: view === "profile" ? 0.38 : 0.36,
            w: view === "profile" ? 0.18 : 0.2,
            h: 0.18
          });
    const eyeFarSearch =
      view === "front"
        ? cropBoxes.eyes.left
        : cropBoxWithinCrop(headCrop, {
            cx: farRelativeX,
            cy: 0.35,
            w: view === "profile" ? 0.14 : 0.18,
            h: 0.18
          });
    const mouthSearch =
      view === "front"
        ? cropBoxes.mouth
        : cropBoxWithinCrop(headCrop, {
            cx: directionalAnchorX(view, facingSign, {
              defaultPositiveX: 0.62,
              defaultNegativeX: 0.38,
              profilePositiveX: 0.68,
              profileNegativeX: 0.32,
              biasX: viewHeuristics.mouthBiasX
            }),
            cy: 0.72,
            w: (view === "profile" ? 0.24 : 0.28) * viewHeuristics.mouthWidthScale,
            h: 0.18 * viewHeuristics.mouthHeightScale
          });
    const earNearSearch = cropBoxWithinCrop(headCrop, {
      cx: earNearRelativeX,
      cy: clamp((view === "profile" ? 0.14 : 0.18) + viewHeuristics.earBiasY, 0.08, 0.28),
      w: (view === "profile" ? 0.22 : 0.24) * viewHeuristics.earWidthScale,
      h: (view === "profile" ? 0.28 : 0.3) * viewHeuristics.earHeightScale
    });
    const earFarSearch = cropBoxWithinCrop(headCrop, {
      cx: earFarRelativeX,
      cy: clamp(0.18 + viewHeuristics.earBiasY, 0.08, 0.28),
      w: (view === "profile" ? 0.18 : 0.22) * viewHeuristics.earWidthScale,
      h: (view === "profile" ? 0.24 : 0.28) * viewHeuristics.earHeightScale
    });
    const pawSearch = cropBoxWithinBounds(bodyBounds, {
      cx: directionalAnchorX(view, facingSign, {
        defaultPositiveX: 0.68,
        defaultNegativeX: 0.32,
        profilePositiveX: 0.76,
        profileNegativeX: 0.24,
        biasX: viewHeuristics.pawBiasX
      }),
      cy: clamp(0.77 + viewHeuristics.pawBiasY, 0.64, 0.86),
      w: (view === "profile" ? 0.18 : 0.24) * viewHeuristics.pawWidthScale,
      h: 0.24 * viewHeuristics.pawHeightScale
    });
    const tailSearch = cropBoxWithinBounds(bodyBounds, {
      cx: directionalAnchorX(view, facingSign, {
        defaultPositiveX: 0.22,
        defaultNegativeX: 0.78,
        profilePositiveX: 0.22,
        profileNegativeX: 0.78,
        biasX: viewHeuristics.tailBiasX
      }),
      cy: clamp(0.61 + viewHeuristics.tailBiasY, 0.46, 0.76),
      w: 0.22 * viewHeuristics.tailWidthScale,
      h: 0.24 * viewHeuristics.tailHeightScale
    });

    const eyeCandidates = headComponents.filter((component) => component.relativeCenterY >= 0.08 && component.relativeCenterY <= 0.52);
    const mouthCandidates = headComponents.filter((component) => component.relativeCenterY >= 0.36);
    const eyeNearComponent = view === "front" ? null : pickBestDarkComponentForSearch(eyeCandidates, eyeNearSearch, { verticalWeight: 1.1 });
    const eyeFarComponent =
      view === "front"
        ? null
        : pickBestDarkComponentForSearch(
            eyeCandidates.filter((component) => component !== eyeNearComponent),
            eyeFarSearch,
            { verticalWeight: 1.1 }
          );
    const mouthComponent =
      view === "front"
        ? null
        : pickBestDarkComponentForSearch(mouthCandidates, mouthSearch, {
            verticalWeight: 1.35,
            widthMultiplier: 1.24,
            heightMultiplier: 1.22
          }) ??
          [...mouthCandidates].sort((a, b) => b.centerY - a.centerY || b.pixelCount - a.pixelCount)[0];

    const mouthCenter = frontMouthCenter ?? (mouthComponent ? measureDarkFeatureCenter(raster, componentToCropBox(mouthComponent, 0.4, 0.5)) : measureDarkFeatureCenter(raster, mouthSearch));
    const earNearTip = measureTopForegroundAnchor(raster, earNearSearch);
    const earFarTip = measureTopForegroundAnchor(raster, earFarSearch);
    const pawBounds = measureForegroundBounds(raster, pawSearch);
    const tailBounds = measureForegroundBounds(raster, tailSearch);

    const headCenter = buildAnchorEntry({
      x: headBounds.centerX,
      y: headBounds.centerY,
      confidence: boundsDetectionConfidence(headBounds, headSearch),
      status: "present",
      notes: `${speciesId} ${view} head silhouette centroid`
    });
    const mouthCenterEntry = mouthCenter
      ? buildAnchorEntry({
          x: mouthCenter.x,
          y: mouthCenter.y,
          confidence: applyConfidenceBoost(
            view === "front"
              ? clamp(
                  0.5 +
                    clamp((mouthCenter.density - MIN_FRONT_MOUTH_DENSITY) / (MAX_FRONT_MOUTH_DENSITY - MIN_FRONT_MOUTH_DENSITY), 0, 1) * 0.3,
                  0.38,
                  0.96
                )
              : mouthComponent
                ? componentDetectionConfidence(mouthComponent, mouthSearch)
                : 0.44,
            viewHeuristics.componentConfidenceBoost.mouth,
            0.18,
            0.96
          ),
          status: "present",
          notes: view === "front" ? `${speciesId} front mouth crop dark-feature center` : `${speciesId} side muzzle dark-feature center`
        })
      : buildFallbackAnchorByExpectation({
          x: mouthSearch.cx,
          y: mouthSearch.cy,
          confidence: viewHeuristics.fallbackConfidence.mouth,
          expectation: "present",
          notes: `${speciesId} fallback to current-view mouth search center`
        });

    const eyeFarEntry =
      view === "front" && frontEyeFarCenter
        ? buildAnchorEntry({
            x: frontEyeFarCenter.x,
            y: frontEyeFarCenter.y,
            confidence: applyConfidenceBoost(
              clamp(
                0.5 +
                  clamp((frontEyeFarCenter.density - MIN_FRONT_EYE_DENSITY) / (MAX_FRONT_EYE_DENSITY - MIN_FRONT_EYE_DENSITY), 0, 1) * 0.28,
                0.4,
                0.96
              ),
              viewHeuristics.componentConfidenceBoost.eyeFar,
              0.18,
              0.96
            ),
            status: "present",
            notes: `${speciesId} front far-eye crop dark-feature center`
          })
        : eyeFarComponent
          ? buildAnchorEntry({
              x: eyeFarComponent.centerX,
              y: eyeFarComponent.centerY,
              confidence: applyConfidenceBoost(
                componentDetectionConfidence(eyeFarComponent, eyeFarSearch),
                viewHeuristics.componentConfidenceBoost.eyeFar
              ),
              status: "present",
              notes: `${speciesId} far-eye component localized in current view`
            })
          : buildFallbackAnchorByExpectation({
              x: eyeFarSearch.cx,
              y: eyeFarSearch.cy,
              confidence: viewHeuristics.fallbackConfidence.eyeFar,
              expectation: view === "front" ? "present" : viewHeuristics.expectedVisibility.eyeFar,
              notes:
                view === "front"
                  ? `${speciesId} fallback to front far-eye crop center`
                  : `${speciesId} far eye inferred from current-view head geometry`
            });
    const eyeNearEntry =
      view === "front" && frontEyeNearCenter
        ? buildAnchorEntry({
            x: frontEyeNearCenter.x,
            y: frontEyeNearCenter.y,
            confidence: applyConfidenceBoost(
              clamp(
                0.5 +
                  clamp((frontEyeNearCenter.density - MIN_FRONT_EYE_DENSITY) / (MAX_FRONT_EYE_DENSITY - MIN_FRONT_EYE_DENSITY), 0, 1) * 0.28,
                0.4,
                0.96
              ),
              viewHeuristics.componentConfidenceBoost.eyeNear,
              0.18,
              0.96
            ),
            status: "present",
            notes: `${speciesId} front near-eye crop dark-feature center`
          })
        : eyeNearComponent
          ? buildAnchorEntry({
              x: eyeNearComponent.centerX,
              y: eyeNearComponent.centerY,
              confidence: applyConfidenceBoost(
                componentDetectionConfidence(eyeNearComponent, eyeNearSearch),
                viewHeuristics.componentConfidenceBoost.eyeNear
              ),
              status: "present",
              notes: `${speciesId} near-eye component localized in current view`
            })
          : buildFallbackAnchorByExpectation({
              x: eyeNearSearch.cx,
              y: eyeNearSearch.cy,
              confidence: viewHeuristics.fallbackConfidence.eyeNear,
              expectation: "present",
              notes: `${speciesId} fallback to near-eye search center`
            });

    const earNearEntry = earNearTip
      ? buildAnchorEntry({
          x: earNearTip.x,
          y: earNearTip.y,
          confidence: applyConfidenceBoost(
            clamp(0.4 + clamp(earNearTip.density / 0.03, 0, 1) * 0.28, 0.28, 0.9),
            viewHeuristics.componentConfidenceBoost.earNear,
            0.18,
            0.92
          ),
          status: "present",
          notes: `${speciesId} near-ear top silhouette anchor`
        })
      : buildFallbackAnchorByExpectation({
          x: earNearSearch.cx,
          y: earNearSearch.cy - earNearSearch.h * 0.22,
          confidence: viewHeuristics.fallbackConfidence.earNear,
          expectation: "present",
          notes: `${speciesId} fallback to near-ear search apex`
        });
    const earFarEntry = earFarTip
      ? buildAnchorEntry({
          x: earFarTip.x,
          y: earFarTip.y,
          confidence: applyConfidenceBoost(
            clamp(0.38 + clamp(earFarTip.density / 0.025, 0, 1) * 0.26, 0.26, 0.86),
            viewHeuristics.componentConfidenceBoost.earFar,
            0.18,
            0.9
          ),
          status: "present",
          notes: `${speciesId} far-ear top silhouette anchor`
        })
      : buildFallbackAnchorByExpectation({
          x: earFarSearch.cx,
          y: earFarSearch.cy - earFarSearch.h * 0.2,
          confidence: viewHeuristics.fallbackConfidence.earFar,
          expectation: view === "front" ? "present" : viewHeuristics.expectedVisibility.earFar,
          notes:
            view === "front"
              ? `${speciesId} fallback to front far-ear search apex`
              : `${speciesId} far ear inferred from current-view head silhouette`
        });

    const pawAnchor = pawBounds
      ? buildAnchorEntry({
          x: facingSign >= 0 ? pawBounds.right - pawBounds.width * 0.12 : pawBounds.left + pawBounds.width * 0.12,
          y: pawBounds.bottom - pawBounds.height * 0.16,
          confidence: applyConfidenceBoost(
            clamp(0.36 + clamp(pawBounds.coverage / 0.18, 0, 1) * 0.28, 0.24, 0.86),
            viewHeuristics.componentConfidenceBoost.paw,
            0.16,
            0.9
          ),
          status: "present",
          notes: `${speciesId} near-paw foreground cluster anchor`
        })
      : buildFallbackAnchorByExpectation({
          x: torsoCrop.cx + facingSign * torsoCrop.w * 0.46,
          y: torsoCrop.cy + torsoCrop.h * 0.34,
          confidence: viewHeuristics.fallbackConfidence.paw,
          expectation: viewHeuristics.expectedVisibility.pawAnchor,
          notes: `${speciesId} fallback to near-paw torso anchor`
        });

    const tailRoot = tailBounds
      ? buildAnchorEntry({
          x: facingSign >= 0 ? tailBounds.right - tailBounds.width * 0.08 : tailBounds.left + tailBounds.width * 0.08,
          y: clamp((tailBounds.top + tailBounds.bottom) / 2, bodyBounds.top, bodyBounds.bottom),
          confidence: applyConfidenceBoost(
            clamp(0.34 + clamp(tailBounds.coverage / 0.16, 0, 1) * 0.26, 0.24, 0.82),
            viewHeuristics.componentConfidenceBoost.tail,
            0.16,
            0.88
          ),
          status: "present",
          notes: `${speciesId} tail-root back-body cluster anchor`
        })
      : buildFallbackAnchorByExpectation({
          x: torsoCrop.cx - facingSign * torsoCrop.w * 0.46,
          y: torsoCrop.cy + torsoCrop.h * 0.06,
          confidence: viewHeuristics.fallbackConfidence.tail,
          expectation: viewHeuristics.expectedVisibility.tailRoot,
          notes: `${speciesId} tail root inferred from back torso edge`
        });

    views[view] = {
      head_center: headCenter,
      mouth_center: mouthCenterEntry,
      eye_near: eyeNearEntry,
      eye_far: eyeFarEntry,
      ear_near: earNearEntry,
      ear_far: earFarEntry,
      paw_anchor: pawAnchor,
      tail_root: tailRoot
    };
  }

  return finalizeCharacterPackAnchorManifest(views, [
    `Species-aware heuristic anchors derived for ${speciesProfile.label.toLowerCase()}`,
    "Foreground bounds, crop boxes, and view-local feature detection remain the primary signals"
  ]);
}

function coerceCharacterPackAnchorManifest(value: unknown): CharacterPackAnchorManifest | null {
  const record = asRecord(value);
  const viewRecord = asRecord(record?.views);
  if (!viewRecord) {
    return null;
  }
  const views: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>> = {};
  for (const view of CHARACTER_PACK_ANCHOR_VIEWS) {
    const rawView = asRecord(viewRecord[view]);
    if (!rawView) {
      continue;
    }
    const parsedView: CharacterPackAnchorViewManifest = {};
    for (const anchorId of CHARACTER_PACK_ANCHOR_IDS) {
      const rawEntry = asRecord(rawView[anchorId]);
      if (!rawEntry) {
        continue;
      }
      const status = asString(rawEntry.status).trim();
      parsedView[anchorId] = buildAnchorEntry({
        x: asNumber(rawEntry.x),
        y: asNumber(rawEntry.y),
        confidence: asNumber(rawEntry.confidence),
        status:
          status === "present" || status === "occluded" || status === "missing" || status === "not_applicable"
            ? status
            : "missing",
        notes: asString(rawEntry.notes).trim() || undefined
      });
    }
    views[view] = parsedView;
  }
  return Object.keys(views).length > 0 ? finalizeCharacterPackAnchorManifest(views) : null;
}

function normalizeAnchorWithinBounds(
  entry: CharacterPackAnchor | undefined,
  bounds: ForegroundBounds
): { x: number; y: number } | null {
  if (!entry || typeof entry.x !== "number" || typeof entry.y !== "number") {
    return null;
  }
  return {
    x: clamp((entry.x - bounds.left) / Math.max(bounds.width, 0.0001), 0, 1),
    y: clamp((entry.y - bounds.top) / Math.max(bounds.height, 0.0001), 0, 1)
  };
}

function expandCropBox(crop: CropBox, widthMultiplier: number, heightMultiplier: number, offsetY = 0): CropBox {
  return normalizeCropBox({
    cx: crop.cx,
    cy: crop.cy + offsetY,
    w: crop.w * widthMultiplier,
    h: crop.h * heightMultiplier
  });
}

function buildVisemeRepairCrop(cropBoxes: CharacterCropBoxes): CropBox {
  const head = cropBoxes.head.front;
  const mouth = cropBoxes.mouth;
  return normalizeCropBox({
    cx: mouth.cx,
    cy: mouth.cy - 0.01,
    w: Math.max(mouth.w * 4.4, head.w * 0.56),
    h: Math.max(mouth.h * 4.2, head.h * 0.44)
  });
}

async function resolveRepairCropBoxes(characterId: string): Promise<CharacterCropBoxes> {
  const manifest = loadManifest(characterId);
  const autoCropBoxes = await deriveAutoCropBoxes(manifest);
  return applyCropBoxOverrides(characterId, autoCropBoxes);
}

async function computeCropPixelRegion(
  sourcePath: string,
  crop: CropBox
): Promise<{ left: number; top: number; width: number; height: number; sourceWidth: number; sourceHeight: number }> {
  const metadata = await sharp(sourcePath, { failOn: "none" }).metadata();
  const sourceWidth = metadata.width ?? DEFAULT_IMAGE_WIDTH;
  const sourceHeight = metadata.height ?? DEFAULT_IMAGE_HEIGHT;
  const width = clamp(Math.round(sourceWidth * crop.w), 1, sourceWidth);
  const height = clamp(Math.round(sourceHeight * crop.h), 1, sourceHeight);
  const left = clamp(Math.round(sourceWidth * crop.cx - width / 2), 0, Math.max(0, sourceWidth - width));
  const top = clamp(Math.round(sourceHeight * crop.cy - height / 2), 0, Math.max(0, sourceHeight - height));
  return { left, top, width, height, sourceWidth, sourceHeight };
}

function repairCropTargetSize(width: number, height: number): { width: number; height: number } {
  const longestSide = Math.max(width, height, 1);
  const scale = clamp(1024 / longestSide, 1, 4);
  return {
    width: Math.max(192, Math.round(width * scale)),
    height: Math.max(192, Math.round(height * scale))
  };
}

async function compositeEditedCropOntoBase(input: {
  basePath: string;
  overlayPath: string;
  crop: CropBox;
  outputPath: string;
}): Promise<void> {
  const region = await computeCropPixelRegion(input.basePath, input.crop);
  const overlayBuffer = await sharp(input.overlayPath, { failOn: "none" })
    .resize({
      width: region.width,
      height: region.height,
      fit: "fill"
    })
    .png()
    .toBuffer();

  ensureDir(path.dirname(input.outputPath));
  await sharp(input.basePath, { failOn: "none" })
    .ensureAlpha()
    .composite([
      {
        input: overlayBuffer,
        left: region.left,
        top: region.top,
        blend: "over"
      }
    ])
    .png()
    .toFile(input.outputPath);
}

type SyntheticVisemeGeometry = {
  kind: "ellipse" | "roundRect";
  mouthWidthRatio: number;
  mouthHeightRatio: number;
  eraseWidthRatio: number;
  eraseHeightRatio: number;
  verticalOffsetRatio: number;
  cornerRatio: number;
};

function darkenColor(color: RgbaColor, amount: number): RgbaColor {
  const factor = clamp(1 - amount, 0, 1);
  return {
    r: Math.round(color.r * factor),
    g: Math.round(color.g * factor),
    b: Math.round(color.b * factor),
    alpha: color.alpha
  };
}

function rgbaToCss(color: RgbaColor): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${Math.max(0, Math.min(1, color.alpha / 255)).toFixed(3)})`;
}

function resolveSyntheticVisemeGeometry(
  viseme: GeneratedCharacterViseme,
  speciesId: MascotSpeciesId,
  scaleBoost: number
): SyntheticVisemeGeometry | null {
  const canineWidthBoost = speciesId === "dog" || speciesId === "wolf" ? 1.08 : 1;
  if (viseme === "mouth_open_small") {
    return {
      kind: "ellipse",
      mouthWidthRatio: 0.74 * canineWidthBoost * scaleBoost,
      mouthHeightRatio: 0.78 * scaleBoost,
      eraseWidthRatio: 1.48 * scaleBoost,
      eraseHeightRatio: 1.82 * scaleBoost,
      verticalOffsetRatio: 0.12,
      cornerRatio: 0.5
    };
  }
  if (viseme === "mouth_open_wide") {
    return {
      kind: "roundRect",
      mouthWidthRatio: 1.18 * canineWidthBoost * scaleBoost,
      mouthHeightRatio: 0.82 * scaleBoost,
      eraseWidthRatio: 1.72 * scaleBoost,
      eraseHeightRatio: 1.96 * scaleBoost,
      verticalOffsetRatio: 0.1,
      cornerRatio: speciesId === "wolf" ? 0.24 : 0.42
    };
  }
  if (viseme === "mouth_round_o") {
    return {
      kind: "ellipse",
      mouthWidthRatio: 0.76 * scaleBoost,
      mouthHeightRatio: 1.12 * scaleBoost,
      eraseWidthRatio: 1.4 * scaleBoost,
      eraseHeightRatio: 1.96 * scaleBoost,
      verticalOffsetRatio: 0.12,
      cornerRatio: 0.5
    };
  }
  return null;
}

function resolveFrontMouthCrop(image: LoadedImageRaster, cropBoxes: CharacterCropBoxes): CropBox {
  const bounds = measureForegroundBounds(image, FULL_IMAGE_CROP);
  const headCrop = bounds ? deriveHeadCropFromBodyBounds(bounds, "front") : cropBoxes.head.front;
  return detectFrontFaceFeatureCrops(image, headCrop).mouth ?? cropBoxes.mouth;
}

async function strengthenVisemeAssetIfNeeded(input: {
  characterId: string;
  baseAsset: CharacterStillAsset;
  visemeAsset: CharacterStillAsset;
  viseme: GeneratedCharacterViseme;
  speciesId?: MascotSpeciesId;
}): Promise<CharacterStillAsset> {
  if (input.viseme === "mouth_closed") {
    return input.visemeAsset;
  }
  const speciesId = resolveManifestSpeciesId(loadManifest(input.characterId), input.speciesId);
  const geometryAttempts = [1, 1.16, 1.32];
  const cropBoxes = await resolveRepairCropBoxes(input.characterId);
  const baseRaster = await loadImageRaster(input.baseAsset.file_path);
  let workingVisemeBuffer: Buffer = fs.readFileSync(input.visemeAsset.file_path);
  let visemeRaster = await loadImageRasterFromBuffer(workingVisemeBuffer, input.visemeAsset.file_path);
  if (visemeRaster.width !== baseRaster.width || visemeRaster.height !== baseRaster.height) {
    workingVisemeBuffer = Buffer.from(
      await normalizeStillToCanvas(workingVisemeBuffer, baseRaster.width, baseRaster.height)
    );
    visemeRaster = await loadImageRasterFromBuffer(workingVisemeBuffer, input.visemeAsset.file_path);
  }
  const mouthCrop = resolveFrontMouthCrop(baseRaster, cropBoxes);
  const currentDelta = meanRegionDifference(baseRaster, visemeRaster, mouthCrop);
  const targetDelta = Math.max(resolveAnimationQcThresholds(speciesId).minVisemeFaceVariation * 1.3, 0.01);
  if (currentDelta >= targetDelta) {
    return input.visemeAsset;
  }

  const overlayCrop = expandCropBox(mouthCrop, 1.9, 2.35, 0.03);
  const overlayRegion = normalizedRegionToPixels(baseRaster, overlayCrop);
  const mouthRegion = normalizedRegionToPixels(baseRaster, mouthCrop);
  const overlayWidth = Math.max(1, overlayRegion.right - overlayRegion.left);
  const overlayHeight = Math.max(1, overlayRegion.bottom - overlayRegion.top);
  const mouthWidthPx = Math.max(1, mouthRegion.right - mouthRegion.left);
  const mouthHeightPx = Math.max(1, mouthRegion.bottom - mouthRegion.top);
  const mouthCenter = measureDarkFeatureCenter(baseRaster, mouthCrop) ?? {
    x: mouthCrop.cx,
    y: mouthCrop.cy,
    density: 0
  };
  const muzzleColor =
    meanVisibleRegionColor(baseRaster, expandCropBox(mouthCrop, 1.6, 1.85, 0), {
      skipDarkFeatures: true,
      minLuma: 72
    }) ??
    meanVisibleRegionColor(baseRaster, expandCropBox(mouthCrop, 1.4, 1.6, 0), {
      skipDarkFeatures: true
    }) ?? {
      r: 224,
      g: 214,
      b: 198,
      alpha: 255
    };
  const mouthFill = darkenColor({ r: 28, g: 20, b: 18, alpha: 245 }, speciesId === "wolf" ? 0.08 : 0);
  const lipStroke = darkenColor(muzzleColor, speciesId === "wolf" ? 0.5 : 0.42);

  for (const scaleBoost of geometryAttempts) {
    const geometry = resolveSyntheticVisemeGeometry(input.viseme, speciesId, scaleBoost);
    if (!geometry) {
      break;
    }
    const mouthWidth = clamp(
      Math.round(mouthWidthPx * geometry.mouthWidthRatio),
      Math.max(10, Math.round(overlayWidth * 0.22)),
      Math.max(12, Math.round(overlayWidth * 0.94))
    );
    const mouthHeight = clamp(
      Math.round(mouthHeightPx * geometry.mouthHeightRatio),
      Math.max(8, Math.round(overlayHeight * 0.18)),
      Math.max(10, Math.round(overlayHeight * 0.9))
    );
    const eraseWidth = clamp(
      Math.round(mouthWidthPx * geometry.eraseWidthRatio),
      mouthWidth + 4,
      Math.max(14, Math.round(overlayWidth * 0.98))
    );
    const eraseHeight = clamp(
      Math.round(mouthHeightPx * geometry.eraseHeightRatio),
      mouthHeight + 4,
      Math.max(14, Math.round(overlayHeight * 0.98))
    );
    const anchorX = clamp(
      Math.round(mouthCenter.x * baseRaster.width) - overlayRegion.left,
      Math.floor(overlayWidth * 0.2),
      Math.ceil(overlayWidth * 0.8)
    );
    const anchorY = clamp(
      Math.round((mouthCenter.y + mouthCrop.h * geometry.verticalOffsetRatio) * baseRaster.height) - overlayRegion.top,
      Math.floor(overlayHeight * 0.24),
      Math.ceil(overlayHeight * 0.82)
    );
    const eraseX = Math.round(anchorX - eraseWidth / 2);
    const eraseY = Math.round(anchorY - eraseHeight / 2);
    const mouthX = Math.round(anchorX - mouthWidth / 2);
    const mouthY = Math.round(anchorY - mouthHeight / 2);
    const strokeWidth = Math.max(2, Math.round(Math.min(mouthWidth, mouthHeight) * 0.09));
    const lipY = Math.round(mouthY + mouthHeight * 0.1);
    const lipStartX = Math.round(mouthX + mouthWidth * 0.14);
    const lipEndX = Math.round(mouthX + mouthWidth * 0.86);
    const lipControlY = Math.round(lipY - Math.max(2, mouthHeight * 0.16));
    const mouthNode =
      geometry.kind === "roundRect"
        ? `<rect x="${mouthX}" y="${mouthY}" width="${mouthWidth}" height="${mouthHeight}" rx="${Math.max(4, Math.round(mouthHeight * geometry.cornerRatio))}" ry="${Math.max(4, Math.round(mouthHeight * geometry.cornerRatio))}" fill="${rgbaToCss(mouthFill)}" />`
        : `<ellipse cx="${anchorX}" cy="${anchorY}" rx="${Math.max(4, Math.round(mouthWidth / 2))}" ry="${Math.max(4, Math.round(mouthHeight / 2))}" fill="${rgbaToCss(mouthFill)}" />`;
    const overlaySvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${overlayWidth}" height="${overlayHeight}" viewBox="0 0 ${overlayWidth} ${overlayHeight}">
  <ellipse cx="${anchorX}" cy="${anchorY}" rx="${Math.max(6, Math.round(eraseWidth / 2))}" ry="${Math.max(6, Math.round(eraseHeight / 2))}" fill="${rgbaToCss(muzzleColor)}" />
  ${mouthNode}
  <path d="M ${lipStartX} ${lipY} Q ${anchorX} ${lipControlY} ${lipEndX} ${lipY}" fill="none" stroke="${rgbaToCss(lipStroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="0.9" />
</svg>`
    );
    const overlayBuffer = await sharp(overlaySvg, { limitInputPixels: false })
      .resize({
        width: overlayWidth,
        height: overlayHeight,
        fit: "fill"
      })
      .png()
      .toBuffer();
    const candidateBuffer = await sharp(workingVisemeBuffer, { limitInputPixels: false })
      .ensureAlpha()
      .composite([
        {
          input: overlayBuffer,
          left: overlayRegion.left,
          top: overlayRegion.top,
          blend: "over"
        }
      ])
      .png()
      .toBuffer();
    const candidateRaster = await loadImageRasterFromBuffer(candidateBuffer, input.visemeAsset.file_path);
    const candidateDelta = meanRegionDifference(baseRaster, candidateRaster, mouthCrop);
    if (candidateDelta < targetDelta && scaleBoost !== geometryAttempts[geometryAttempts.length - 1]) {
      continue;
    }
    fs.writeFileSync(input.visemeAsset.file_path, candidateBuffer);
    const metadata = readJson<CharacterStillAsset>(input.visemeAsset.metadata_path);
    metadata.postprocess = [...new Set([...(metadata.postprocess ?? []), "viseme_local_strengthen", "viseme_local_composite"])];
    writeJson(metadata.metadata_path, metadata);
    return metadata;
  }

  return input.visemeAsset;
}

async function runLocalFaceRepairStill(input: {
  characterId: string;
  baseAsset: CharacterStillAsset;
  stage: "expression" | "viseme";
  expression?: GeneratedCharacterExpression;
  viseme?: GeneratedCharacterViseme;
  editPrompt: string;
  negativePrompt?: string;
  seed: number;
  denoise?: number;
  round: number;
  speciesId?: MascotSpeciesId;
  repairHistory?: string[];
}): Promise<CharacterStillAsset> {
  const cropBoxes = await resolveRepairCropBoxes(input.characterId);
  const crop =
    input.stage === "expression"
      ? expandCropBox(cropBoxes.head.front, 1.08, 1.1, 0.01)
      : buildVisemeRepairCrop(cropBoxes);
  const cropRegion = await computeCropPixelRegion(input.baseAsset.file_path, crop);
  const targetSize = repairCropTargetSize(cropRegion.width, cropRegion.height);
  const targetLabel = input.stage === "expression" ? input.expression ?? "neutral" : input.viseme ?? "mouth_closed";
  const tempInputPath = path.join(
    characterRootDir(input.characterId),
    "repair",
    `${input.stage}_${targetLabel}_round_${input.round}_local_input.png`
  );

  await cropNormalizedRegion({
    sourcePath: input.baseAsset.file_path,
    crop,
    targetPath: tempInputPath,
    targetWidth: targetSize.width,
    targetHeight: targetSize.height
  });

  const asset = await runEditCharacterStill({
    characterId: input.characterId,
    inputImagePath: tempInputPath,
    editPrompt: input.editPrompt,
    negativePrompt: input.negativePrompt,
    seed: input.seed,
    denoise: input.denoise,
    stage: input.stage,
    view: "front",
    expression: input.expression,
    viseme: input.viseme,
    parentAssetId: input.baseAsset.asset_id,
    repairHistory: [...(input.repairHistory ?? []), "repair_strategy:face_local_crop_edit"]
  });

  await compositeEditedCropOntoBase({
    basePath: input.baseAsset.file_path,
    overlayPath: asset.file_path,
    crop,
    outputPath: asset.file_path
  });

  const metadata = readJson<CharacterStillAsset>(asset.metadata_path);
  metadata.width = input.baseAsset.width;
  metadata.height = input.baseAsset.height;
  metadata.postprocess = [...new Set([...(metadata.postprocess ?? []), "face_local_crop_edit", "face_local_composite"])];
  writeJson(metadata.metadata_path, metadata);
  const finalAsset =
    input.stage === "viseme" && input.viseme && input.viseme !== "mouth_closed"
      ? await strengthenVisemeAssetIfNeeded({
          characterId: input.characterId,
          baseAsset: input.baseAsset,
          visemeAsset: metadata,
          viseme: input.viseme,
          speciesId: input.speciesId
        })
      : metadata;

  const manifest = loadManifest(input.characterId);
  updateManifestWithAsset(manifest, finalAsset);
  saveManifest(manifest);
  return finalAsset;
}

export async function buildGeneratedCharacterPack(input: {
  characterId: string;
}): Promise<{ packId: string; packPath: string; proposalPath: string; metaPath: string }> {
  await synchronizeManifestCanvasToApprovedFront(input.characterId);
  const manifest = loadManifest(input.characterId);
  requireApprovedFrontMaster(input.characterId);
  const referenceBank = resolveManifestReferenceBankStatus(manifest);
  const referenceBankReview = buildMascotReferenceBankReviewPlan(
    resolveMascotReferenceBankDiagnostics(referenceBank.species_id)
  );
  const autoCropBoxes = await deriveAutoCropBoxes(manifest);
  const cropBoxes = applyCropBoxOverrides(input.characterId, autoCropBoxes);
  const autoAnchorManifest = await deriveAutoAnchorManifest(manifest, cropBoxes);
  const anchorManifest = applyAnchorOverrides(input.characterId, autoAnchorManifest);
  const anchorReview = collectAnchorReviewSummary(anchorManifest);
  const { packPath, proposalPath, metaPath, builtAt } = await materializeGeneratedCharacterPack({
    characterId: input.characterId,
    rootDir: characterRootDir(input.characterId),
    sourceManifestPath: manifestPathForCharacter(input.characterId),
    manifest,
    cropBoxes,
    anchorManifest,
    anchorReview,
    referenceBank,
    referenceBankReview,
    speciesId: resolveManifestSpeciesId(manifest),
    deps: {
      cropNormalizedRegion,
      recenterPackedEyeAsset,
      ensurePackedEyeSlotContent,
      validatePack: (pack) => {
        const validation = schemaValidator.validate("character_pack.schema.json", pack);
        if (!validation.ok) {
          const summary = validation.errors
            .map((entry) => `${entry.instancePath || entry.schemaPath} ${entry.message ?? "validation error"}`)
            .join("; ");
          throw new Error(`Generated character pack invalid: ${summary}`);
        }
      }
    }
  });

  manifest.pack = {
    pack_id: input.characterId,
    pack_path: packPath,
    proposal_path: proposalPath,
    meta_path: metaPath,
    built_at: builtAt
  };
  invalidateDerivedState(manifest, "acceptance_only");
  saveManifest(manifest);

  return { packId: input.characterId, packPath, proposalPath, metaPath };
}

export async function runCharacterAnimationSafeQc(input: {
  characterId: string;
}): Promise<{
  reportPath: string;
  repairTasksPath: string;
  passed: boolean;
  acceptanceStatus: CharacterPipelineAcceptanceStatus;
}> {
  await synchronizeManifestCanvasToApprovedFront(input.characterId);
  const manifest = loadManifest(input.characterId);
  const cropBoxes = applyCropBoxOverrides(input.characterId, await deriveAutoCropBoxes(manifest));
  const referenceBank = resolveManifestReferenceBankStatus(manifest);
  const animationQc = resolveAnimationQcThresholds(resolveManifestSpeciesId(manifest));
  const requiredExpressions = ["neutral", "happy", "blink"] as const;
  const requiredVisemes = ["mouth_closed", "mouth_open_small", "mouth_open_wide", "mouth_round_o"] as const;
  const eyeRegion = { cx: 0.5, cy: 0.22, w: 0.28, h: 0.09 };
  const strictGeneratedChecks = !isSyntheticSmokeManifest(manifest);
  const { checks, rasterMap, referenceFrontRaster, mouthCrop } = await collectCharacterPipelineAnimationChecks({
    manifest,
    referenceBank,
    animationQc,
    requiredExpressions,
    requiredVisemes,
    strictGeneratedChecks,
    eyeRegion,
    constants: {
      defaultCropBoxes: DEFAULT_CROP_BOXES,
      fullImageCrop: FULL_IMAGE_CROP,
      minFrontEyeDensity: MIN_FRONT_EYE_DENSITY,
      minFrontMouthDensity: MIN_FRONT_MOUTH_DENSITY,
      minViewVariation: MIN_VIEW_VARIATION
    },
    deps: {
      collectManifestAssets,
      isSyntheticSmokeManifest,
      loadImageRaster,
      measureForegroundBounds,
      deriveHeadCropFromBodyBounds,
      detectFrontFaceFeatureCrops,
      inspectBackgroundSafety,
      measureDarkFeatureCenter,
      meanRegionDifference
    }
  });

  checks.push(
    ...(await collectCharacterPipelinePackQcChecks({
      manifest,
      cropBoxes,
      referenceFrontRaster,
      rasterMap,
      mouthCrop,
      strictGeneratedChecks,
      requiredVisemes,
      animationQc,
      constants: {
        fullImageCrop: FULL_IMAGE_CROP,
        minPackAnchorConfidence: MIN_PACK_ANCHOR_CONFIDENCE,
        minPackAnchorViewConfidence: MIN_PACK_ANCHOR_VIEW_CONFIDENCE,
        minPackAnchorOverallConfidence: MIN_PACK_ANCHOR_OVERALL_CONFIDENCE,
        maxViewLandmarkVerticalDelta: MAX_VIEW_LANDMARK_VERTICAL_DELTA,
        maxViewLandmarkHorizontalDelta: MAX_VIEW_LANDMARK_HORIZONTAL_DELTA,
        characterPackAnchorViews: CHARACTER_PACK_ANCHOR_VIEWS,
        characterPackAnchorIds: CHARACTER_PACK_ANCHOR_IDS
      },
      deps: {
        readJson,
        asRecord,
        coerceCharacterPackAnchorManifest,
        validatePackSchema: (pack) => schemaValidator.validate("character_pack.schema.json", pack),
        resolveSpeciesId: resolveManifestSpeciesId,
        resolveAnchorHeuristics: resolveMascotAnchorHeuristics,
        anchorStatusMatchesExpectation: (actual, expected) =>
          expected === "missing" ? (actual ?? "missing") === "missing" : anchorStatusMatchesExpectation(actual, expected),
        normalizeAnchorWithinBounds,
        resolvePackImageFilePath,
        detectInteriorDarkComponents,
        measureForegroundBounds,
        loadImageRaster,
        measureDarkFeatureCenter,
        averageNumbers,
        normalizedHorizontalDelta,
        normalizedEarHeight,
        expandCropBox,
        boundsFromCropBox
      }
    }))
  );

  return materializeCharacterPipelineQcArtifacts({
    characterId: input.characterId,
    manifest,
    checks,
    referenceBank,
    deps: {
      characterRootDir,
      writeJson,
      saveManifest,
      resolveAcceptanceFromChecks,
      repairActionForCode
    }
  });
}

export function resolveCharacterPipelineAcceptance(characterId: string): CharacterPipelineAcceptance {
  const manifest = loadManifest(characterId);
  const referenceBank = resolveManifestReferenceBankStatus(manifest);
  if (manifest.acceptance) {
    return {
      ...manifest.acceptance,
      reference_bank: manifest.acceptance.reference_bank ?? referenceBank
    };
  }
  if (manifest.qc) {
    return {
      status: manifest.qc.acceptance_status,
      accepted: manifest.qc.acceptance_status === "accepted",
      updated_at: manifest.qc.generated_at,
      report_path: manifest.qc.report_path,
      repair_tasks_path: manifest.qc.repair_tasks_path,
      blocking_check_codes: [],
      repair_task_count: 0,
      reference_bank: manifest.qc.reference_bank ?? referenceBank
    };
  }
  return {
    status: "blocked",
    accepted: false,
    updated_at: new Date(0).toISOString(),
    blocking_check_codes: ["QC_NOT_RUN"],
    repair_task_count: 0,
    reference_bank: referenceBank
  };
}

export function assertCharacterPipelineAccepted(characterId: string): CharacterPipelineAcceptance {
  const acceptance = resolveCharacterPipelineAcceptance(characterId);
  if (acceptance.status !== "accepted") {
    const reportHint = acceptance.report_path ? ` See ${acceptance.report_path}` : "";
    throw new Error(
      `Generated character pack ${characterId} is not accepted for render (status=${acceptance.status}).${reportHint}`
    );
  }
  return acceptance;
}

// Legacy local fallback. One-off character generation should use the worker
// character-generator API so the real stage chain runs:
// front_master -> side_view_base -> side_view_refine ->
// identity_lock_refine -> repair_refine.
export async function runDeterministicCharacterPipeline(
  input: RunDeterministicCharacterPipelineInput
): Promise<GeneratedCharacterManifest> {
  const autoApproveFrontMaster = input.autoApproveFrontMaster ?? true;
  const existingManifest = loadManifest(input.characterId);
  const manifestSpeciesBefore = existingManifest.species;
  const seededManifest = assignManifestSpecies(existingManifest, input.speciesId);
  if (seededManifest.species !== manifestSpeciesBefore) {
    saveManifest(seededManifest);
  }
  if (!existingManifest.approved_front_master) {
    await runGenerateCharacterStill({
      characterId: input.characterId,
      positivePrompt: input.positivePrompt,
      negativePrompt: input.negativePrompt,
      seed: input.frontSeed,
      width: input.width,
      height: input.height,
      steps: input.steps,
      cfg: input.cfg,
      loraStrength: input.loraStrength,
      autoApprove: autoApproveFrontMaster
    });
  }

  if (autoApproveFrontMaster && !loadManifest(input.characterId).approved_front_master) {
    await approveFrontMaster({ characterId: input.characterId });
  }

  await generateCharacterViewSet({
    characterId: input.characterId,
    speciesId: input.speciesId,
    negativePrompt: input.negativePrompt,
    threeQuarterSeed: input.threeQuarterSeed ?? input.frontSeed + 23,
    profileSeed: input.profileSeed ?? input.frontSeed + 37,
    denoise: input.denoise
  });
  await generateCharacterExpressionPack({ characterId: input.characterId, speciesId: input.speciesId, negativePrompt: input.negativePrompt, baseSeed: input.expressionBaseSeed ?? input.frontSeed + 101, denoise: input.denoise });
  await generateCharacterVisemePack({ characterId: input.characterId, speciesId: input.speciesId, negativePrompt: input.negativePrompt, baseSeed: input.visemeBaseSeed ?? input.frontSeed + 211, denoise: input.denoise });
  await buildGeneratedCharacterPack({ characterId: input.characterId });
  await runCharacterAnimationSafeQc({ characterId: input.characterId });
  await runCharacterPipelineEditRepairLoop({
    characterId: input.characterId,
    negativePrompt: input.negativePrompt,
    threeQuarterSeed: input.threeQuarterSeed ?? input.frontSeed + 23,
    profileSeed: input.profileSeed ?? input.frontSeed + 37,
    expressionBaseSeed: input.expressionBaseSeed ?? input.frontSeed + 101,
    visemeBaseSeed: input.visemeBaseSeed ?? input.frontSeed + 211,
    denoise: input.denoise,
    maxRounds: input.autoRepairRounds ?? DEFAULT_AUTO_REPAIR_ROUNDS
  });
  return loadManifest(input.characterId);
}

export function resolveGeneratedCharacterPackPath(packId: string): string {
  return path.join(GENERATED_ROOT_DIR, packId, "pack", "character.pack.json");
}

export function loadGeneratedCharacterPack(packId: string): unknown | null {
  const packPath = resolveGeneratedCharacterPackPath(packId);
  if (!fs.existsSync(packPath)) {
    return null;
  }
  return readJson<unknown>(packPath);
}
