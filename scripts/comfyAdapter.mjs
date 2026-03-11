import { createServer } from "node:http";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

function loadRootEnvFile() {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const text = readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadRootEnvFile();

const ADAPTER_HOST = process.env.COMFY_ADAPTER_HOST?.trim() || "127.0.0.1";
const ADAPTER_PORT = Number.parseInt(process.env.COMFY_ADAPTER_PORT ?? "8010", 10);
const COMFY_SERVER_URL = (process.env.COMFY_SERVER_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "");
const COMFY_TIMEOUT_MS = Number.parseInt(process.env.COMFY_TIMEOUT_MS ?? "120000", 10);
const COMFY_STEPS = Number.parseInt(process.env.COMFY_STEPS ?? "20", 10);
const COMFY_CFG = Number.parseFloat(process.env.COMFY_CFG ?? "7");
const COMFY_SAMPLER = process.env.COMFY_SAMPLER?.trim() || "euler";
const COMFY_SCHEDULER = process.env.COMFY_SCHEDULER?.trim() || "normal";
const COMFY_WIDTH = Number.parseInt(process.env.COMFY_WIDTH ?? "1024", 10);
const COMFY_HEIGHT = Number.parseInt(process.env.COMFY_HEIGHT ?? "1024", 10);
const COMFY_FILENAME_PREFIX = process.env.COMFY_FILENAME_PREFIX?.trim() || "ec_adapter";
const COMFY_INPUT_DIR = process.env.COMFY_INPUT_DIR?.trim() || "C:\\input";
const COMFY_CHECKPOINT_NAME = process.env.COMFY_CHECKPOINT_NAME?.trim() || "";
const COMFY_ADAPTER_MODE = (process.env.COMFY_ADAPTER_MODE?.trim() || "auto").toLowerCase();
const COMFY_UNET_NAME = process.env.COMFY_UNET_NAME?.trim() || "flux-2-klein-base-4b-fp8.safetensors";
const COMFY_VAE_NAME = process.env.COMFY_VAE_NAME?.trim() || "flux2-vae.safetensors";
const COMFY_QWEN_NAME = process.env.COMFY_QWEN_NAME?.trim() || "qwen_3_4b.safetensors";
const COMFY_CLIP_L_NAME = process.env.COMFY_CLIP_L_NAME?.trim() || "clip_l.safetensors";
const COMFY_T5_NAME = process.env.COMFY_T5_NAME?.trim() || "t5xxl_fp16.safetensors";
const COMFY_FLUX_MAX_SHIFT = Number.parseFloat(process.env.COMFY_FLUX_MAX_SHIFT ?? "1.15");
const COMFY_FLUX_BASE_SHIFT = Number.parseFloat(process.env.COMFY_FLUX_BASE_SHIFT ?? "0.5");
const COMFY_REFERENCE_MODE = (process.env.COMFY_REFERENCE_MODE?.trim() || "off").toLowerCase();
const COMFY_REFERENCE_DENOISE = Number.parseFloat(process.env.COMFY_REFERENCE_DENOISE ?? "0.58");
const COMFY_POSE_CONTROLNET_NAME =
  process.env.COMFY_POSE_CONTROLNET_NAME?.trim() || "control-lora-openposeXL2-rank256.safetensors";
const COMFY_POSE_STRENGTH = Number.parseFloat(process.env.COMFY_POSE_STRENGTH ?? "0.54");
const COMFY_POSE_END_PERCENT = Number.parseFloat(process.env.COMFY_POSE_END_PERCENT ?? "0.74");
const COMFY_OPENPOSE_RESOLUTION = Number.parseInt(process.env.COMFY_OPENPOSE_RESOLUTION ?? "1024", 10);
const COMFY_IPADAPTER_PRESET = process.env.COMFY_IPADAPTER_PRESET?.trim() || "PLUS (high strength)";
const COMFY_IPADAPTER_WEIGHT = Number.parseFloat(process.env.COMFY_IPADAPTER_WEIGHT ?? "0.9");
const COMFY_ULTRA_ENABLE_LATENT_REFINE = !["false", "0", "no", "off"].includes(
  (process.env.COMFY_ULTRA_ENABLE_LATENT_REFINE ?? "true").trim().toLowerCase()
);
const COMFY_ULTRA_REFINE_UPSCALE = Number.parseFloat(process.env.COMFY_ULTRA_REFINE_UPSCALE ?? "1.18");
const COMFY_ULTRA_REFINE_DENOISE = Number.parseFloat(process.env.COMFY_ULTRA_REFINE_DENOISE ?? "0.22");
const COMFY_ULTRA_STYLE_BOOST = Number.parseFloat(process.env.COMFY_ULTRA_STYLE_BOOST ?? "0.9");
const COMFY_ULTRA_COMPOSITION_BOOST = Number.parseFloat(process.env.COMFY_ULTRA_COMPOSITION_BOOST ?? "0.65");
const COMFY_ULTRA_CLIPVISION_SHARPEN = Number.parseFloat(process.env.COMFY_ULTRA_CLIPVISION_SHARPEN ?? "0.22");
const COMFY_ULTRA_ENABLE_REPAIR_INPAINT = !["false", "0", "no", "off"].includes(
  (process.env.COMFY_ULTRA_ENABLE_REPAIR_INPAINT ?? "true").trim().toLowerCase()
);
const COMFY_ULTRA_REPAIR_MASK_THRESHOLD = Number.parseFloat(process.env.COMFY_ULTRA_REPAIR_MASK_THRESHOLD ?? "0.08");
const COMFY_ULTRA_REPAIR_MASK_GROW = Number.parseInt(process.env.COMFY_ULTRA_REPAIR_MASK_GROW ?? "12", 10);
const COMFY_ULTRA_REPAIR_MASK_FEATHER = Number.parseInt(process.env.COMFY_ULTRA_REPAIR_MASK_FEATHER ?? "10", 10);
const COMFY_ULTRA_REPAIR_DENOISE = Number.parseFloat(process.env.COMFY_ULTRA_REPAIR_DENOISE ?? "0.46");
const COMFY_ULTRA_ENABLE_STRUCTURE_CONTROLS = !["false", "0", "no", "off"].includes(
  (process.env.COMFY_ULTRA_ENABLE_STRUCTURE_CONTROLS ?? "true").trim().toLowerCase()
);
const COMFY_CANNY_CONTROLNET_NAME =
  process.env.COMFY_CANNY_CONTROLNET_NAME?.trim() || "controlnet-canny.safetensors";
const COMFY_LINEART_CONTROLNET_NAME =
  process.env.COMFY_LINEART_CONTROLNET_NAME?.trim() || "controlnet-lineart.safetensors";
const COMFY_DEPTH_CONTROLNET_NAME =
  process.env.COMFY_DEPTH_CONTROLNET_NAME?.trim() || "controlnet-depth.safetensors";
const COMFY_ULTRA_CANNY_STRENGTH = Number.parseFloat(process.env.COMFY_ULTRA_CANNY_STRENGTH ?? "0.24");
const COMFY_ULTRA_LINEART_STRENGTH = Number.parseFloat(process.env.COMFY_ULTRA_LINEART_STRENGTH ?? "0.32");
const COMFY_ULTRA_DEPTH_STRENGTH = Number.parseFloat(process.env.COMFY_ULTRA_DEPTH_STRENGTH ?? "0.18");
const COMFY_ULTRA_STRUCTURE_END_PERCENT = Number.parseFloat(process.env.COMFY_ULTRA_STRUCTURE_END_PERCENT ?? "0.72");
const COMFY_ULTRA_STRUCTURE_RESOLUTION = Number.parseInt(process.env.COMFY_ULTRA_STRUCTURE_RESOLUTION ?? "1024", 10);
const COMFY_ULTRA_CANNY_LOW_THRESHOLD = Number.parseInt(process.env.COMFY_ULTRA_CANNY_LOW_THRESHOLD ?? "80", 10);
const COMFY_ULTRA_CANNY_HIGH_THRESHOLD = Number.parseInt(process.env.COMFY_ULTRA_CANNY_HIGH_THRESHOLD ?? "180", 10);
const COMFY_STAGE_TEMPLATE_ROOT = path.join(REPO_ROOT, "workflows", "comfy", "character");
const COMFY_DISABLE_OBJECT_INFO_CACHE = ["true", "1", "yes", "on"].includes(
  (process.env.COMFY_DISABLE_OBJECT_INFO_CACHE ?? "false").trim().toLowerCase()
);
const COMFY_MASCOT_CAT_LORA_NAME = process.env.COMFY_MASCOT_CAT_LORA_NAME?.trim() || "";
const COMFY_MASCOT_CAT_LORA_STRENGTH_MODEL = Number.parseFloat(process.env.COMFY_MASCOT_CAT_LORA_STRENGTH_MODEL ?? "1.35");
const COMFY_MASCOT_CAT_LORA_STRENGTH_CLIP = Number.parseFloat(process.env.COMFY_MASCOT_CAT_LORA_STRENGTH_CLIP ?? "1.0");
const DEFAULT_QUALITY_PROFILE = Object.freeze({
  id: "adapter_default",
  label: "Adapter Default",
  targetStyle: "2d character",
  qualityTier: "balanced",
  sampler: COMFY_SAMPLER,
  scheduler: COMFY_SCHEDULER,
  steps: COMFY_STEPS,
  cfg: COMFY_CFG,
  width: COMFY_WIDTH,
  height: COMFY_HEIGHT,
  maxShift: COMFY_FLUX_MAX_SHIFT,
  baseShift: COMFY_FLUX_BASE_SHIFT,
  postprocessPlan: [],
  upscaleLongSide: 0,
  sharpen: 0,
  saturationBoost: 1
});

const QUALITY_PROFILE_PRESETS = Object.freeze({
  eraser_cat_mascot_production_v1: {
    id: "eraser_cat_mascot_production_v1",
    label: "Eraser Cat Mascot Production",
    targetStyle: "eraser cat mascot",
    qualityTier: "production",
    sampler: "dpmpp_2m_sde",
    scheduler: "karras",
    steps: 36,
    cfg: 4.6,
    width: 1152,
    height: 1152,
    maxShift: 1.05,
    baseShift: 0.44,
    postprocessPlan: [],
    upscaleLongSide: 0,
    sharpen: 0,
    saturationBoost: 1
  },
  anime_2d_production_24gb_v1: {
    id: "anime_2d_production_24gb_v1",
    label: "Anime 2D Production 24GB",
    targetStyle: "2d anime",
    qualityTier: "production",
    sampler: "dpmpp_2m_sde",
    scheduler: "karras",
    steps: 42,
    cfg: 4.1,
    width: 1024,
    height: 1536,
    maxShift: 1.05,
    baseShift: 0.42,
    postprocessPlan: [
      "upscale-long-side-2048",
      "alpha-safe-lanczos-resize",
      "mild-line-sharpen",
      "subtle-saturation-boost"
    ],
    upscaleLongSide: 2048,
    sharpen: 1.15,
    saturationBoost: 1.03
  },
  anime_2d_balanced_24gb_v1: {
    id: "anime_2d_balanced_24gb_v1",
    label: "Anime 2D Balanced 24GB",
    targetStyle: "2d anime",
    qualityTier: "quality",
    sampler: "dpmpp_2m",
    scheduler: "karras",
    steps: 30,
    cfg: 3.7,
    width: 896,
    height: 1344,
    maxShift: 1.1,
    baseShift: 0.46,
    postprocessPlan: ["upscale-long-side-1792", "alpha-safe-lanczos-resize", "mild-line-sharpen"],
    upscaleLongSide: 1792,
    sharpen: 0.95,
    saturationBoost: 1.01
  },
  mascot_flat_fast_v1: {
    id: "mascot_flat_fast_v1",
    label: "Mascot Flat Fast",
    targetStyle: "2d mascot",
    qualityTier: "balanced",
    sampler: "euler",
    scheduler: "normal",
    steps: 20,
    cfg: 7,
    width: 1024,
    height: 1024,
    maxShift: 1.15,
    baseShift: 0.5,
    postprocessPlan: [],
    upscaleLongSide: 0,
    sharpen: 0,
    saturationBoost: 1
  }
});

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function asNumber(value, fallback) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asPositiveInt(value, fallback) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeQualityProfile(profile) {
  return {
    id: asString(profile?.id, DEFAULT_QUALITY_PROFILE.id),
    label: asString(profile?.label, DEFAULT_QUALITY_PROFILE.label),
    targetStyle: asString(profile?.targetStyle, DEFAULT_QUALITY_PROFILE.targetStyle),
    qualityTier: asString(profile?.qualityTier, DEFAULT_QUALITY_PROFILE.qualityTier),
    sampler: asString(profile?.sampler, DEFAULT_QUALITY_PROFILE.sampler),
    scheduler: asString(profile?.scheduler, DEFAULT_QUALITY_PROFILE.scheduler),
    steps: asPositiveInt(profile?.steps, DEFAULT_QUALITY_PROFILE.steps),
    cfg: asNumber(profile?.cfg, DEFAULT_QUALITY_PROFILE.cfg),
    width: asPositiveInt(profile?.width, DEFAULT_QUALITY_PROFILE.width),
    height: asPositiveInt(profile?.height, DEFAULT_QUALITY_PROFILE.height),
    maxShift: asNumber(profile?.maxShift, DEFAULT_QUALITY_PROFILE.maxShift),
    baseShift: asNumber(profile?.baseShift, DEFAULT_QUALITY_PROFILE.baseShift),
    postprocessPlan: Array.isArray(profile?.postprocessPlan)
      ? profile.postprocessPlan.filter((entry) => typeof entry === "string" && entry.trim().length > 0)
      : DEFAULT_QUALITY_PROFILE.postprocessPlan,
    upscaleLongSide: asPositiveInt(profile?.upscaleLongSide, DEFAULT_QUALITY_PROFILE.upscaleLongSide),
    sharpen: asNumber(profile?.sharpen, DEFAULT_QUALITY_PROFILE.sharpen),
    saturationBoost: asNumber(profile?.saturationBoost, DEFAULT_QUALITY_PROFILE.saturationBoost)
  };
}

function resolveQualityProfile(payload) {
  const fromPayload = isObject(payload?.qualityProfile) ? payload.qualityProfile : null;
  const payloadId = asString(fromPayload?.id);
  const presetId =
    payloadId && isObject(QUALITY_PROFILE_PRESETS[payloadId])
      ? payloadId
      : asString(payload?.presetId) === "eraser-cat-mascot-production"
        ? "eraser_cat_mascot_production_v1"
      : asString(payload?.presetId) === "anime-production-2d"
        ? "anime_2d_production_24gb_v1"
        : asString(payload?.presetId) === "anime-sheet-balanced"
          ? "anime_2d_balanced_24gb_v1"
          : "";
  const preset = presetId ? QUALITY_PROFILE_PRESETS[presetId] : null;
  return sanitizeQualityProfile({
    ...DEFAULT_QUALITY_PROFILE,
    ...(preset ?? {}),
    ...(fromPayload ?? {})
  });
}

function shouldPreferCheckpointForPayload(payload, qualityProfile) {
  const presetId = asString(payload?.presetId);
  if (presetId === "eraser-cat-mascot-production") {
    return true;
  }

  if (asString(qualityProfile?.id) === "eraser_cat_mascot_production_v1") {
    return true;
  }

  return asString(qualityProfile?.targetStyle).toLowerCase() === "eraser cat mascot";
}

function resolveMascotLoraConfig(payload, qualityProfile, objectInfo) {
  const speciesId = asString(payload?.speciesId).toLowerCase();
  const targetStyle = asString(qualityProfile?.targetStyle).toLowerCase();
  if (speciesId !== "cat" || targetStyle !== "eraser cat mascot") {
    return null;
  }

  if (!COMFY_MASCOT_CAT_LORA_NAME) {
    return null;
  }

  if (!hasObjectNode(objectInfo, "LoraLoader")) {
    return {
      warning: "Cat mascot LoRA requested but ComfyUI LoraLoader node is unavailable."
    };
  }

  const options = readArray(objectInfo, ["LoraLoader", "input", "required", "lora_name", 0]);
  const loraName = resolvePreferredOrFirst(options, COMFY_MASCOT_CAT_LORA_NAME);
  if (!loraName) {
    return { warning: `Configured cat mascot LoRA not found in ComfyUI: ${COMFY_MASCOT_CAT_LORA_NAME}` };
  }

  return {
    loraName,
    strengthModel: Number.isFinite(COMFY_MASCOT_CAT_LORA_STRENGTH_MODEL) ? COMFY_MASCOT_CAT_LORA_STRENGTH_MODEL : 1.35,
    strengthClip: Number.isFinite(COMFY_MASCOT_CAT_LORA_STRENGTH_CLIP) ? COMFY_MASCOT_CAT_LORA_STRENGTH_CLIP : 1.0
  };
}

function summarizeWorkflow(input) {
  return {
    adapter: "comfyui",
    mode: input.mode,
    workflowStage: input.workflowStage ?? null,
    workflowTemplateVersion: input.workflowTemplateVersion ?? null,
    templateManifestPath: input.templateManifestPath ?? null,
    templateManifest: isObject(input.templateManifest) ? input.templateManifest : null,
    runtimeContract: isObject(input.runtimeContract) ? input.runtimeContract : null,
    targetStyle: input.qualityProfile.targetStyle,
    qualityProfileId: input.qualityProfile.id,
    qualityTier: input.qualityProfile.qualityTier,
    view: input.view,
    seed: input.seed,
    prompt: input.positivePrompt,
    viewPrompt: input.viewPrompt,
    negativePrompt: input.negativePrompt,
    guardrails: Array.isArray(input.guardrails) ? input.guardrails : [],
    referenceMode: input.referenceMode,
    referenceSupplied: input.referenceSupplied === true,
    repairMaskSupplied: input.repairMaskSupplied === true,
    referenceBankSummary: Array.isArray(input.referenceBankSummary) ? input.referenceBankSummary : [],
    poseSupplied: input.poseSupplied === true,
    poseApplied: input.poseApplied === true,
    poseSettings: input.poseSettings ?? null,
    structureControlsSupplied: Array.isArray(input.structureControls) && input.structureControls.length > 0,
    structureControlsApplied: Array.isArray(input.structureControlsApplied) ? input.structureControlsApplied : [],
    structureControlSummary: Array.isArray(input.structureControlSummary) ? input.structureControlSummary : [],
    structureControlDiagnostics: isObject(input.structureControlDiagnostics) ? input.structureControlDiagnostics : null,
    preflightDiagnostics: isObject(input.preflightDiagnostics) ? input.preflightDiagnostics : null,
    routeDecision: isObject(input.routeDecision) ? input.routeDecision : null,
    warnings: Array.isArray(input.warnings) ? input.warnings : [],
    capabilitySnapshot: isObject(input.capabilitySnapshot) ? input.capabilitySnapshot : null,
    runSettings: {
      sampler: input.qualityProfile.sampler,
      scheduler: input.qualityProfile.scheduler,
      steps: input.qualityProfile.steps,
      cfg: input.qualityProfile.cfg,
      width: input.qualityProfile.width,
      height: input.qualityProfile.height,
      maxShift: input.qualityProfile.maxShift,
      baseShift: input.qualityProfile.baseShift
    },
    postprocessPlan: input.qualityProfile.postprocessPlan,
    recommendedComfyGuiPath:
      input.mode === "flux2"
        ? "Build and save the same graph in ComfyUI canvas, then import the saved workflow JSON for visual inspection."
        : input.mode === "checkpoint-ipadapter-openpose" || String(input.mode).startsWith("checkpoint-ultra")
          ? "workflow_gui.json is importable into ComfyUI canvas. Replace identity/pose images in LoadImage nodes if you want to rerun."
          : "Checkpoint path uses API prompt JSON only; create a matching GUI workflow in ComfyUI if you need canvas import."
  };
}

function resolvePoseSettings(payload) {
  const payloadPose = isObject(payload?.poseConfig) ? payload.poseConfig : {};
  return {
    poseStrength: asNumber(payloadPose.poseStrength, COMFY_POSE_STRENGTH),
    poseEndPercent: asNumber(payloadPose.poseEndPercent, COMFY_POSE_END_PERCENT),
    openposeResolution: asPositiveInt(payloadPose.openposeResolution, COMFY_OPENPOSE_RESOLUTION),
    ipAdapterWeight: asNumber(payloadPose.ipAdapterWeight, COMFY_IPADAPTER_WEIGHT),
    ipAdapterPreset: asString(payloadPose.ipAdapterPreset, COMFY_IPADAPTER_PRESET),
    controlNetName: asString(payloadPose.controlNetName, COMFY_POSE_CONTROLNET_NAME)
  };
}

function nowIso() {
  return new Date().toISOString();
}

function hashWorkflowIdentity(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function mimeToExtension(mimeType) {
  const normalized = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) {
    return "jpg";
  }
  if (normalized.includes("webp")) {
    return "webp";
  }
  return "png";
}

function materializeInlineImage(base64, mimeType, prefix) {
  const normalizedPrefix = typeof prefix === "string" && prefix.trim().length > 0 ? prefix.trim() : "ec_inline";
  const trimmedBase64 = typeof base64 === "string" ? base64.trim() : "";
  if (!trimmedBase64) {
    return null;
  }

  const buffer = Buffer.from(trimmedBase64, "base64");
  if (buffer.length === 0) {
    throw new Error(`${normalizedPrefix} image payload was empty after base64 decode`);
  }

  const extension = mimeToExtension(mimeType);
  const fileName = `${normalizedPrefix}_${createHash("sha1").update(buffer).digest("hex")}.${extension}`;
  const absolutePath = path.join(COMFY_INPUT_DIR, fileName);
  if (!existsSync(absolutePath)) {
    mkdirSync(COMFY_INPUT_DIR, { recursive: true });
    writeFileSync(absolutePath, buffer);
  }

  return {
    fileName,
    absolutePath,
    denoise: Number.isFinite(COMFY_REFERENCE_DENOISE) ? COMFY_REFERENCE_DENOISE : 0.58
  };
}

function materializeReferenceImage(payload) {
  const base64 = typeof payload?.referenceImageBase64 === "string" ? payload.referenceImageBase64.trim() : "";
  if (!base64) {
    return null;
  }

  return materializeInlineImage(base64, payload?.referenceMimeType, "ec_ref");
}

function materializeRepairMaskImage(payload) {
  const base64 = typeof payload?.repairMaskImageBase64 === "string" ? payload.repairMaskImageBase64.trim() : "";
  if (!base64) {
    return null;
  }

  return materializeInlineImage(base64, payload?.repairMaskMimeType, "ec_mask");
}

function materializeReferenceBank(payload) {
  if (!Array.isArray(payload?.referenceBank)) {
    return [];
  }

  return payload.referenceBank
    .map((entry, index) => {
      if (!isObject(entry)) {
        return null;
      }

      const role = asString(entry.role, "subject");
      const image = materializeInlineImage(entry.imageBase64, entry.mimeType, `ec_refbank_${role}_${index}`);
      if (!image) {
        return null;
      }

      return {
        id: asString(entry.id, `ref_${index}`),
        role,
        view: asString(entry.view),
        weight: Number.isFinite(asNumber(entry.weight, Number.NaN)) ? asNumber(entry.weight, Number.NaN) : undefined,
        note: asString(entry.note),
        ...image
      };
    })
    .filter((entry) => entry !== null);
}

function summarizeReferenceBank(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  return entries.map((entry) => ({
    id: entry.id,
    role: entry.role,
    ...(entry.view ? { view: entry.view } : {}),
    ...(typeof entry.weight === "number" ? { weight: Number(entry.weight.toFixed(3)) } : {}),
    ...(entry.fileName ? { fileName: entry.fileName } : {}),
    ...(entry.note ? { note: entry.note } : {})
  }));
}

function resolveStageTemplateManifest(workflowStage, workflowTemplateVersion) {
  if (typeof workflowStage !== "string" || workflowStage.length === 0) {
    return { manifestPath: null, manifest: null, warning: null };
  }
  if (typeof workflowTemplateVersion !== "string" || workflowTemplateVersion.length === 0) {
    return { manifestPath: null, manifest: null, warning: null };
  }

  const manifestPath = path.join(COMFY_STAGE_TEMPLATE_ROOT, workflowStage, `${workflowTemplateVersion}.stage.json`);
  if (!existsSync(manifestPath)) {
    return {
      manifestPath,
      manifest: null,
      warning: `Stage template manifest not found for ${workflowStage}:${workflowTemplateVersion}`
    };
  }

  try {
    return {
      manifestPath,
      manifest: JSON.parse(readFileSync(manifestPath, "utf8")),
      warning: null
    };
  } catch (error) {
    return {
      manifestPath,
      manifest: null,
      warning: `Failed to parse stage template manifest ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function readStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function dedupeStrings(values) {
  return [...new Set(readStringArray(Array.isArray(values) ? values : []))];
}

function normalizeStructureControlKind(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "lineart" || normalized === "canny" || normalized === "depth") {
    return normalized;
  }
  return null;
}

function readStructureControlKinds(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value
        .map((entry) => normalizeStructureControlKind(entry))
        .filter((entry) => entry !== null)
    )
  ];
}

function differenceStructureControlKinds(requiredKinds, providedKinds) {
  const provided = new Set(readStructureControlKinds(providedKinds));
  return readStructureControlKinds(requiredKinds).filter((kind) => !provided.has(kind));
}

function readViewScopedValue(value, view) {
  if (!isObject(value) || typeof view !== "string" || view.length === 0) {
    return undefined;
  }
  return value[view];
}

function readStructureControlRoleMap(value) {
  if (!isObject(value)) {
    return {};
  }
  const out = {};
  for (const kind of ["lineart", "canny", "depth"]) {
    const roles = readStringArray(value[kind]);
    if (roles.length > 0) {
      out[kind] = roles;
    }
  }
  return out;
}

function readStructureControlPrimaryRoleMap(value) {
  if (!isObject(value)) {
    return {};
  }
  const out = {};
  for (const kind of ["lineart", "canny", "depth"]) {
    const role = asString(value[kind]);
    if (role) {
      out[kind] = role;
    }
  }
  return out;
}

function readNamedCountMap(value, allowedKeys = null) {
  if (!isObject(value)) {
    return {};
  }
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = asString(key);
    if (!normalizedKey) {
      continue;
    }
    if (Array.isArray(allowedKeys) && allowedKeys.length > 0 && !allowedKeys.includes(normalizedKey)) {
      continue;
    }
    const count = asPositiveInt(raw, null);
    if (Number.isInteger(count) && count >= 0) {
      out[normalizedKey] = count;
    }
  }
  return out;
}

function readNamedNumberMap(value, allowedKeys = null) {
  if (!isObject(value)) {
    return {};
  }
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const normalizedKey = asString(key);
    if (!normalizedKey) {
      continue;
    }
    if (Array.isArray(allowedKeys) && allowedKeys.length > 0 && !allowedKeys.includes(normalizedKey)) {
      continue;
    }
    const number = asNumber(raw, null);
    if (Number.isFinite(number)) {
      out[normalizedKey] = number;
    }
  }
  return out;
}

function readStructureControlRangeMap(value) {
  if (!isObject(value)) {
    return {};
  }
  const out = {};
  for (const kind of ["lineart", "canny", "depth"]) {
    const entry = isObject(value[kind]) ? value[kind] : null;
    if (!entry) {
      continue;
    }
    const min = asNumber(entry.min, null);
    const max = asNumber(entry.max, null);
    if (Number.isFinite(min) && Number.isFinite(max) && min <= max) {
      out[kind] = { min, max };
    }
  }
  return out;
}

function isNumberWithinRange(value, range) {
  return Number.isFinite(value) && isObject(range) && Number.isFinite(range.min) && Number.isFinite(range.max)
    ? value >= range.min && value <= range.max
    : true;
}

function resolveStageRuntimeContract(manifest, view = "") {
  const runtimeContract = isObject(manifest?.runtime_contract) ? manifest.runtime_contract : {};
  const structurePolicy = isObject(manifest?.structure_policy) ? manifest.structure_policy : {};
  const poseRequirement = asString(runtimeContract.pose_requirement, "optional").toLowerCase();
  const repairMaskPolicy = asString(runtimeContract.repair_mask_policy, "not_applicable").toLowerCase();
  const structureControlRequirement = asString(
    readViewScopedValue(runtimeContract.structure_control_requirement_by_view, view) ??
      runtimeContract.structure_control_requirement,
    "optional"
  ).toLowerCase();
  const requireReferenceMode = asString(runtimeContract.require_reference_mode);
  const latentRefineQualityTiers = readStringArray(
    runtimeContract.latent_refine_quality_tiers ?? manifest?.reference_policy?.latent_refine_quality_tiers
  );
  const approvedViews = readStringArray(manifest?.output_contract?.approved_views);

  return {
    requireReferenceMode,
    requireReferenceImage: runtimeContract.require_reference_image === true,
    requiredReferenceRoles: readStringArray(
      readViewScopedValue(runtimeContract.required_reference_roles_by_view, view) ?? runtimeContract.required_reference_roles
    ),
    minimumReferenceCountByRole: readNamedCountMap(
      readViewScopedValue(runtimeContract.min_reference_count_by_role_by_view, view) ??
        runtimeContract.min_reference_count_by_role
    ),
    poseRequirement:
      poseRequirement === "required" || poseRequirement === "optional" ? poseRequirement : "optional",
    strictPoseCapabilityWhenRequired: runtimeContract.strict_pose_capability_when_required === true,
    repairMaskPolicy:
      repairMaskPolicy === "explicit_or_reference_alpha" || repairMaskPolicy === "required_explicit"
        ? repairMaskPolicy
        : "not_applicable",
    allowBasicCheckpointFallback: runtimeContract.allow_basic_checkpoint_fallback === true,
    allowPoselessUltraFallback: runtimeContract.allow_poseless_ultra_fallback === true,
    strictLatentRefineCapability: runtimeContract.strict_latent_refine_capability === true,
    structureControlRequirement:
      structureControlRequirement === "required" || structureControlRequirement === "optional"
        ? structureControlRequirement
        : "optional",
    requiredStructureControlKinds: readStructureControlKinds(
      readViewScopedValue(runtimeContract.required_structure_control_kinds_by_view, view) ??
        runtimeContract.required_structure_control_kinds ??
        readViewScopedValue(structurePolicy.preferred_modes_by_view, view) ??
        structurePolicy.preferred_modes
    ),
    strictStructureControlCapabilityWhenRequired:
      runtimeContract.strict_structure_control_capability_when_required === true,
    requireStructureControlSourceTraceFields: readStringArray(
      runtimeContract.require_structure_control_source_trace_fields
    ),
    requireStructureControlSourceRefInReferenceBank:
      runtimeContract.require_structure_control_source_ref_in_reference_bank === true,
    requireStructureControlSourceRoleMatchReferenceRole:
      runtimeContract.require_structure_control_source_role_match_reference_role === true,
    requireStructureControlSourceViewMatchReferenceView:
      runtimeContract.require_structure_control_source_view_match_reference_view === true,
    allowedStructureSourceRolesByKind: readStructureControlRoleMap(
      readViewScopedValue(structurePolicy.allowed_source_roles_by_kind_by_view, view) ??
        structurePolicy.allowed_source_roles_by_kind
    ),
    requiredPrimaryStructureSourceRoleByKind: readStructureControlPrimaryRoleMap(
      readViewScopedValue(structurePolicy.required_primary_source_role_by_kind_by_view, view) ??
        structurePolicy.required_primary_source_role_by_kind
    ),
    minimumStructureEntriesByKind: readNamedCountMap(
      readViewScopedValue(structurePolicy.min_entries_by_kind_by_view, view) ??
        structurePolicy.min_entries_by_kind,
      ["lineart", "canny", "depth"]
    ),
    maximumStructureEntriesByKind: readNamedCountMap(
      readViewScopedValue(structurePolicy.max_entries_by_kind_by_view, view) ??
        structurePolicy.max_entries_by_kind,
      ["lineart", "canny", "depth"]
    ),
    structureStrengthRangeByKind: readStructureControlRangeMap(
      readViewScopedValue(structurePolicy.strength_range_by_kind_by_view, view) ??
        structurePolicy.strength_range_by_kind
    ),
    structureStartPercentRangeByKind: readStructureControlRangeMap(
      readViewScopedValue(structurePolicy.start_percent_range_by_kind_by_view, view) ??
        structurePolicy.start_percent_range_by_kind
    ),
    structureEndPercentRangeByKind: readStructureControlRangeMap(
      readViewScopedValue(structurePolicy.end_percent_range_by_kind_by_view, view) ??
        structurePolicy.end_percent_range_by_kind
    ),
    minimumStructureScheduleSpanByKind: readNamedNumberMap(
      readViewScopedValue(structurePolicy.min_schedule_span_by_kind_by_view, view) ??
        structurePolicy.min_schedule_span_by_kind,
      ["lineart", "canny", "depth"]
    ),
    requireViewMatchForSourceRoles: readStringArray(structurePolicy.require_view_match_for_source_roles),
    disallowedStructureSourceRoles: readStringArray(structurePolicy.disallowed_source_roles),
    latentRefineQualityTiers,
    approvedViews,
    allowedRepairBaseStages: readStringArray(runtimeContract.allowed_repair_base_stages),
    requireGateAcceptedRepairBaseViews: readStringArray(runtimeContract.require_gate_accepted_repair_base_views)
  };
}

function validateStageRuntimeContract(input) {
  const contract = input.contract ?? resolveStageRuntimeContract(null);
  const failures = [];
  const warnings = [];
  const suppliedStructureControlKinds = readStructureControlKinds(input.structureControlsSupplied);
  const referenceBankEntries = Array.isArray(input.referenceBank) ? input.referenceBank : [];
  const referenceBankById = new Map();
  const referenceRoleCounts = {};
  const referenceRoles = new Set(
    referenceBankEntries
      .map((entry) => (typeof entry?.role === "string" ? entry.role.trim() : ""))
      .filter((entry) => entry.length > 0)
  );
  for (const entry of referenceBankEntries) {
    const id = asString(entry?.id);
    const role = asString(entry?.role);
    if (role) {
      referenceRoleCounts[role] = (referenceRoleCounts[role] ?? 0) + 1;
    }
    if (!id) {
      continue;
    }
    if (!referenceBankById.has(id)) {
      referenceBankById.set(id, []);
    }
    referenceBankById.get(id).push(entry);
  }
  if (input.referenceAssetPresent === true) {
    referenceRoles.add("subject");
    referenceRoleCounts.subject = Math.max(1, referenceRoleCounts.subject ?? 0);
  }

  if (contract.requireReferenceMode === "img2img" && input.referenceMode !== "img2img") {
    failures.push("reference_mode_img2img_required");
  }
  if (contract.requireReferenceImage && input.referenceAssetPresent !== true) {
    failures.push("reference_image_required");
  }
  if (contract.requiredReferenceRoles.length > 0) {
    const missingReferenceRoles = contract.requiredReferenceRoles.filter((role) => !referenceRoles.has(role));
    if (missingReferenceRoles.length > 0) {
      failures.push(`required_reference_roles_missing:${missingReferenceRoles.join("+")}`);
    }
  }
  for (const [role, minimumCount] of Object.entries(contract.minimumReferenceCountByRole ?? {})) {
    const actualCount = Number.isInteger(referenceRoleCounts[role]) ? referenceRoleCounts[role] : 0;
    if (actualCount < minimumCount) {
      failures.push(`reference_role_count_below_min:${role}:${actualCount}:${minimumCount}`);
    }
  }
  if (
    contract.approvedViews.length > 0 &&
    typeof input.view === "string" &&
    input.view.length > 0 &&
    !contract.approvedViews.includes(input.view)
  ) {
    failures.push(`approved_view_required:${input.view}`);
  }
  if (contract.poseRequirement === "required" && input.poseSupplied !== true) {
    failures.push("pose_input_required");
  }
  if (
    contract.repairMaskPolicy === "required_explicit" &&
    input.repairMaskSupplied !== true
  ) {
    failures.push("explicit_repair_mask_required");
  }
  if (
    contract.repairMaskPolicy === "explicit_or_reference_alpha" &&
    input.referenceAssetPresent !== true
  ) {
    failures.push("repair_mask_policy_requires_reference");
  }
  if (
    contract.strictLatentRefineCapability &&
    contract.latentRefineQualityTiers.includes(input.qualityTier) &&
    input.capabilities.latentUpscale !== true
  ) {
    failures.push("latent_refine_capability_required");
  }
  if (contract.structureControlRequirement === "required") {
    if (suppliedStructureControlKinds.length === 0) {
      failures.push("structure_controls_required");
    }
    if (contract.requiredStructureControlKinds.length > 0) {
      const missingKinds = differenceStructureControlKinds(
        contract.requiredStructureControlKinds,
        suppliedStructureControlKinds
      );
      if (missingKinds.length > 0) {
        failures.push(`required_structure_controls_missing:${missingKinds.join("+")}`);
      }
    }
    if (contract.strictStructureControlCapabilityWhenRequired) {
      const unavailableKinds = contract.requiredStructureControlKinds.filter(
        (kind) => input.capabilities?.structureControlModels?.[kind] !== true
      );
      if (unavailableKinds.length > 0) {
        failures.push(`structure_control_capability_required:${unavailableKinds.join("+")}`);
      }
    }
  }
  if (suppliedStructureControlKinds.length > 0) {
    const unexpectedKinds =
      contract.requiredStructureControlKinds.length > 0
        ? suppliedStructureControlKinds.filter((kind) => !contract.requiredStructureControlKinds.includes(kind))
        : suppliedStructureControlKinds;
    if (unexpectedKinds.length > 0) {
      failures.push(`unexpected_structure_controls:${unexpectedKinds.join("+")}`);
    }
  }
  if (Array.isArray(input.structureControlEntries)) {
    const structureEntryCountByKind = Object.fromEntries(
      ["lineart", "canny", "depth"].map((kind) => [kind, 0])
    );
    for (const entry of input.structureControlEntries) {
      const kind = asString(entry?.kind);
      if (kind && Object.prototype.hasOwnProperty.call(structureEntryCountByKind, kind)) {
        structureEntryCountByKind[kind] += 1;
      }
    }
    for (const [kind, minimumCount] of Object.entries(contract.minimumStructureEntriesByKind ?? {})) {
      const actualCount = Number.isInteger(structureEntryCountByKind[kind]) ? structureEntryCountByKind[kind] : 0;
      if (actualCount < minimumCount) {
        failures.push(`structure_control_count_below_min:${kind}:${actualCount}:${minimumCount}`);
      }
    }
    for (const [kind, maximumCount] of Object.entries(contract.maximumStructureEntriesByKind ?? {})) {
      const actualCount = Number.isInteger(structureEntryCountByKind[kind]) ? structureEntryCountByKind[kind] : 0;
      if (actualCount > maximumCount) {
        failures.push(`structure_control_count_above_max:${kind}:${actualCount}:${maximumCount}`);
      }
    }
    for (const entry of input.structureControlEntries) {
      const kind = asString(entry?.kind, "unknown");
      const sourceRole = asString(entry?.sourceRole);
      const sourceRefId = asString(entry?.sourceRefId);
      const sourceView = asString(entry?.sourceView);
      if (!Number.isFinite(entry?.strength) || entry.strength < 0 || entry.strength > 1) {
        failures.push(`invalid_structure_strength:${kind}`);
      }
      if (!Number.isFinite(entry?.startPercent) || entry.startPercent < 0 || entry.startPercent > 1) {
        failures.push(`invalid_structure_start_percent:${kind}`);
      }
      if (!Number.isFinite(entry?.endPercent) || entry.endPercent < 0 || entry.endPercent > 1) {
        failures.push(`invalid_structure_end_percent:${kind}`);
      }
      if (
        Number.isFinite(entry?.startPercent) &&
        Number.isFinite(entry?.endPercent) &&
        entry.startPercent >= entry.endPercent
      ) {
        failures.push(`invalid_structure_schedule:${kind}`);
      }
      if (!isNumberWithinRange(entry?.strength, contract.structureStrengthRangeByKind?.[kind])) {
        failures.push(`structure_strength_out_of_policy:${kind}`);
      }
      if (!isNumberWithinRange(entry?.startPercent, contract.structureStartPercentRangeByKind?.[kind])) {
        failures.push(`structure_start_percent_out_of_policy:${kind}`);
      }
      if (!isNumberWithinRange(entry?.endPercent, contract.structureEndPercentRangeByKind?.[kind])) {
        failures.push(`structure_end_percent_out_of_policy:${kind}`);
      }
      const minimumScheduleSpan = asNumber(contract.minimumStructureScheduleSpanByKind?.[kind], null);
      if (
        Number.isFinite(minimumScheduleSpan) &&
        Number.isFinite(entry?.startPercent) &&
        Number.isFinite(entry?.endPercent) &&
        entry.endPercent - entry.startPercent < minimumScheduleSpan
      ) {
        failures.push(`structure_schedule_span_out_of_policy:${kind}`);
      }
      for (const field of contract.requireStructureControlSourceTraceFields ?? []) {
        if (field === "sourceRole" && !sourceRole) {
          failures.push(`structure_control_source_trace_missing:${kind}:sourceRole`);
        }
        if (field === "sourceRefId" && !sourceRefId) {
          failures.push(`structure_control_source_trace_missing:${kind}:sourceRefId`);
        }
        if (field === "sourceView" && !sourceView) {
          failures.push(`structure_control_source_trace_missing:${kind}:sourceView`);
        }
      }
      if (sourceRole && Array.isArray(contract.disallowedStructureSourceRoles)) {
        if (contract.disallowedStructureSourceRoles.includes(sourceRole)) {
          failures.push(`structure_control_source_role_disallowed:${kind}:${sourceRole}`);
        }
      }
      const allowedRolesForKind = Array.isArray(contract.allowedStructureSourceRolesByKind?.[kind])
        ? contract.allowedStructureSourceRolesByKind[kind]
        : [];
      if (sourceRole && allowedRolesForKind.length > 0 && !allowedRolesForKind.includes(sourceRole)) {
        failures.push(`structure_control_source_role_not_allowed:${kind}:${sourceRole}`);
      }
      const requiredPrimaryRole = asString(contract.requiredPrimaryStructureSourceRoleByKind?.[kind]);
      if (requiredPrimaryRole && sourceRole && sourceRole !== requiredPrimaryRole) {
        failures.push(`structure_control_source_role_required:${kind}:${requiredPrimaryRole}`);
      }
      if (sourceRole && contract.requireViewMatchForSourceRoles?.includes(sourceRole) && typeof input.view === "string" && input.view.length > 0) {
        if (sourceView !== input.view) {
          failures.push(`structure_control_source_view_target_mismatch:${kind}:${sourceView || "missing"}:${input.view}`);
        }
      }
      if (contract.requireStructureControlSourceRefInReferenceBank && sourceRefId) {
        const matches = Array.isArray(referenceBankById.get(sourceRefId)) ? referenceBankById.get(sourceRefId) : [];
        if (matches.length === 0) {
          failures.push(`structure_control_source_ref_missing:${kind}:${sourceRefId}`);
        } else if (matches.length > 1) {
          failures.push(`structure_control_source_ref_ambiguous:${kind}:${sourceRefId}`);
        } else {
          const match = matches[0];
          if (
            contract.requireStructureControlSourceRoleMatchReferenceRole &&
            sourceRole &&
            asString(match?.role) !== sourceRole
          ) {
            failures.push(`structure_control_source_ref_role_mismatch:${kind}:${sourceRefId}:${sourceRole}`);
          }
          if (
            contract.requireStructureControlSourceViewMatchReferenceView &&
            sourceView &&
            asString(match?.view) &&
            asString(match?.view) !== sourceView
          ) {
            failures.push(`structure_control_source_ref_view_mismatch:${kind}:${sourceRefId}:${sourceView}`);
          }
          if (
            sourceRole &&
            contract.requireViewMatchForSourceRoles?.includes(sourceRole) &&
            typeof input.view === "string" &&
            input.view.length > 0 &&
            asString(match?.view) &&
            asString(match?.view) !== input.view
          ) {
            failures.push(
              `structure_control_source_ref_target_view_mismatch:${kind}:${sourceRefId}:${asString(match?.view)}:${input.view}`
            );
          }
        }
      }
    }
  }
  if (contract.allowedRepairBaseStages.length > 0) {
    const repairFromStage = asString(input.stagePlan?.repairFromStage);
    if (!repairFromStage) {
      failures.push("repair_lineage_missing");
    } else if (!contract.allowedRepairBaseStages.includes(repairFromStage)) {
      failures.push(`repair_base_stage_not_allowed:${repairFromStage}`);
    }
  }
  if (
    contract.requireGateAcceptedRepairBaseViews.length > 0 &&
    typeof input.view === "string" &&
    input.view.length > 0 &&
    contract.requireGateAcceptedRepairBaseViews.includes(input.view) &&
    input.stagePlan?.acceptedByGate !== true
  ) {
    failures.push("repair_base_not_gate_accepted");
  }
  if (
    contract.poseRequirement === "required" &&
    input.poseSupplied === true &&
    input.capabilities.poseControl !== true &&
    contract.strictPoseCapabilityWhenRequired
  ) {
    failures.push("pose_capability_required");
  } else if (
    contract.poseRequirement === "required" &&
    input.poseSupplied !== true &&
    contract.allowPoselessUltraFallback
  ) {
    warnings.push("poseless_ultra_fallback_allowed");
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings
  };
}

function buildCapabilitySnapshot(objectInfo) {
  const controlNetOptions = readArray(objectInfo, ["ControlNetLoader", "input", "required", "control_net_name", 0]);
  const cannyPreprocessor = resolveFirstAvailableNodeName(objectInfo, ["CannyEdgePreprocessor", "Canny"]);
  const lineartPreprocessor = resolveFirstAvailableNodeName(objectInfo, ["LineArtPreprocessor"]);
  const depthPreprocessor = resolveFirstAvailableNodeName(objectInfo, [
    "DepthAnythingPreprocessor",
    "MiDaS-DepthMapPreprocessor"
  ]);
  return {
    hasCheckpoint: hasObjectNode(objectInfo, "CheckpointLoaderSimple"),
    hasFluxClassic: hasObjectNode(objectInfo, "DualCLIPLoader") && hasObjectNode(objectInfo, "CLIPTextEncodeFlux"),
    hasFluxQwen: hasObjectNode(objectInfo, "CLIPLoader") && hasObjectNode(objectInfo, "CLIPTextEncode"),
    hasPoseControl:
      hasObjectNode(objectInfo, "OpenposePreprocessor") &&
      hasObjectNode(objectInfo, "ControlNetLoader") &&
      hasObjectNode(objectInfo, "ControlNetApplyAdvanced"),
    hasStructureControl:
      hasObjectNode(objectInfo, "ControlNetLoader") &&
      hasObjectNode(objectInfo, "ControlNetApplyAdvanced"),
    hasIpAdapter: hasObjectNode(objectInfo, "IPAdapterUnifiedLoader") && hasObjectNode(objectInfo, "IPAdapterAdvanced"),
    hasIpAdapterPreciseStyle: hasObjectNode(objectInfo, "IPAdapterPreciseStyleTransfer"),
    hasIpAdapterPreciseComposition: hasObjectNode(objectInfo, "IPAdapterPreciseComposition"),
    hasPrepImageForClipVision: hasObjectNode(objectInfo, "PrepImageForClipVision"),
    hasImageToImage: hasObjectNode(objectInfo, "LoadImage") && hasObjectNode(objectInfo, "VAEEncode"),
    hasRepairInpaint:
      hasObjectNode(objectInfo, "VAEEncodeForInpaint") &&
      hasObjectNode(objectInfo, "MaskToImage") &&
      hasObjectNode(objectInfo, "ImageToMask") &&
      hasObjectNode(objectInfo, "InvertMask") &&
      hasObjectNode(objectInfo, "ThresholdMask") &&
      hasObjectNode(objectInfo, "GrowMask") &&
      hasObjectNode(objectInfo, "FeatherMask"),
    hasImageCompositeMasked: hasObjectNode(objectInfo, "ImageCompositeMasked"),
    hasSetLatentNoiseMask: hasObjectNode(objectInfo, "SetLatentNoiseMask"),
    hasLatentUpscaleBy: hasObjectNode(objectInfo, "LatentUpscaleBy"),
    hasLatentUpscale: hasObjectNode(objectInfo, "LatentUpscale"),
    hasLoraLoader: hasObjectNode(objectInfo, "LoraLoader"),
    hasStructureControlModelCanny: Boolean(
      resolveStructureControlNetName(controlNetOptions, "canny", COMFY_CANNY_CONTROLNET_NAME)
    ),
    hasStructureControlModelLineart: Boolean(
      resolveStructureControlNetName(controlNetOptions, "lineart", COMFY_LINEART_CONTROLNET_NAME)
    ),
    hasStructureControlModelDepth: Boolean(
      resolveStructureControlNetName(controlNetOptions, "depth", COMFY_DEPTH_CONTROLNET_NAME)
    ),
    hasStructureControlCanny:
      Boolean(cannyPreprocessor) &&
      hasObjectNode(objectInfo, "ControlNetLoader") &&
      hasObjectNode(objectInfo, "ControlNetApplyAdvanced"),
    hasStructureControlLineart:
      Boolean(lineartPreprocessor) &&
      hasObjectNode(objectInfo, "ControlNetLoader") &&
      hasObjectNode(objectInfo, "ControlNetApplyAdvanced"),
    hasStructureControlDepth:
      Boolean(depthPreprocessor) &&
      hasObjectNode(objectInfo, "ControlNetLoader") &&
      hasObjectNode(objectInfo, "ControlNetApplyAdvanced")
  };
}

function materializePoseImage(payload) {
  const base64 = typeof payload?.poseImageBase64 === "string" ? payload.poseImageBase64.trim() : "";
  if (!base64) {
    return null;
  }

  return materializeInlineImage(base64, payload?.poseMimeType, "ec_pose");
}

function defaultStructureControlStrength(kind) {
  if (kind === "lineart") {
    return 0.52;
  }
  if (kind === "canny") {
    return 0.42;
  }
  return 0.32;
}

function defaultStructureControlEndPercent(kind) {
  if (kind === "depth") {
    return 0.62;
  }
  if (kind === "canny") {
    return 0.78;
  }
  return 0.82;
}

function structureControlKindPatterns(kind) {
  if (kind === "canny") {
    return [/canny/i];
  }
  if (kind === "lineart") {
    return [/lineart/i, /scribble/i, /sketch/i, /softedge/i];
  }
  return [/depth/i, /zoe/i, /midas/i];
}

function preferredStructureControlName(kind) {
  if (kind === "canny") {
    return COMFY_CANNY_CONTROLNET_NAME;
  }
  if (kind === "lineart") {
    return COMFY_LINEART_CONTROLNET_NAME;
  }
  return COMFY_DEPTH_CONTROLNET_NAME;
}

function materializeStructureControls(payload) {
  const structureControls = isObject(payload?.structureControls) ? payload.structureControls : null;
  if (!structureControls) {
    return [];
  }

  return ["lineart", "canny", "depth"]
    .map((kind) => {
      const entry = isObject(structureControls[kind]) ? structureControls[kind] : null;
      if (!entry) {
        return null;
      }
      const image = materializeInlineImage(entry.imageBase64, entry.mimeType, `ec_struct_${kind}`);
      if (!image) {
        return null;
      }
      return {
        kind,
        strength: asNumber(entry.strength, defaultStructureControlStrength(kind)),
        startPercent: asNumber(entry.startPercent, 0),
        endPercent: asNumber(entry.endPercent, defaultStructureControlEndPercent(kind)),
        controlNetName: asString(entry.controlNetName),
        note: asString(entry.note),
        sourceRole: asString(entry.sourceRole),
        sourceRefId: asString(entry.sourceRefId),
        sourceView: asString(entry.sourceView),
        ...image
      };
    })
    .filter((entry) => entry !== null);
}

function resolveStructureControlNetName(options, kind, explicitName) {
  const cleanedOptions = Array.isArray(options)
    ? options.filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim())
    : [];
  if (cleanedOptions.length === 0) {
    return null;
  }

  if (typeof explicitName === "string" && explicitName.trim().length > 0) {
    const exact = cleanedOptions.find((value) => value === explicitName.trim());
    if (exact) {
      return exact;
    }
  }

  const preferred = preferredStructureControlName(kind);
  if (preferred) {
    const exact = cleanedOptions.find((value) => value === preferred);
    if (exact) {
      return exact;
    }
  }

  const patterns = structureControlKindPatterns(kind);
  for (const pattern of patterns) {
    const match = cleanedOptions.find((value) => pattern.test(value));
    if (match) {
      return match;
    }
  }

  return null;
}

function resolveStructureControlConfig(objectInfo, structureControls) {
  if (!Array.isArray(structureControls) || structureControls.length === 0) {
    return {
      applied: [],
      warnings: []
    };
  }

  if (!hasObjectNode(objectInfo, "ControlNetLoader") || !hasObjectNode(objectInfo, "ControlNetApplyAdvanced")) {
    return {
      applied: [],
      warnings: ["Structure controls supplied but ControlNetLoader/ControlNetApplyAdvanced is unavailable."]
    };
  }

  const controlNetOptions = readArray(objectInfo, ["ControlNetLoader", "input", "required", "control_net_name", 0]);
  if (!Array.isArray(controlNetOptions) || controlNetOptions.length === 0) {
    return {
      applied: [],
      warnings: ["Structure controls supplied but no ControlNet models were found."]
    };
  }

  const applied = [];
  const warnings = [];
  for (const entry of structureControls) {
    const controlNetName = resolveStructureControlNetName(controlNetOptions, entry.kind, entry.controlNetName);
    if (!controlNetName) {
      warnings.push(`Structure control skipped for ${entry.kind}: matching ControlNet model not found.`);
      continue;
    }
    applied.push({
      ...entry,
      controlNetName
    });
  }

  return {
    applied,
    warnings
  };
}

function json(res, statusCode, body) {
  const raw = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(raw)
  });
  res.end(raw);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }
  if (!isObject(parsed)) {
    throw new Error("invalid_body");
  }
  return parsed;
}

async function fetchJson(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMFY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 300)}`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COMFY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 300)}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      contentType: res.headers.get("content-type") || "image/png",
      data: Buffer.from(arrayBuffer)
    };
  } finally {
    clearTimeout(timer);
  }
}

let cachedCheckpointName = null;
let cachedObjectInfo = null;

async function getObjectInfo() {
  if (!COMFY_DISABLE_OBJECT_INFO_CACHE && cachedObjectInfo) return cachedObjectInfo;
  const objectInfo = await fetchJson(`${COMFY_SERVER_URL}/object_info`);
  if (!COMFY_DISABLE_OBJECT_INFO_CACHE) {
    cachedObjectInfo = objectInfo;
  }
  return objectInfo;
}

async function resolveCheckpointName() {
  if (COMFY_CHECKPOINT_NAME) return COMFY_CHECKPOINT_NAME;
  if (cachedCheckpointName) return cachedCheckpointName;

  const objectInfo = await getObjectInfo();
  const names =
    objectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
  if (!Array.isArray(names) || names.length === 0 || typeof names[0] !== "string") {
    throw new Error(
      "No checkpoint names found from ComfyUI object_info. Add a model under ComfyUI models/checkpoints or set COMFY_CHECKPOINT_NAME."
    );
  }
  cachedCheckpointName = names[0];
  return cachedCheckpointName;
}

function buildCheckpointWorkflow(input) {
  const modelRef = input.loraName ? ["10", 0] : ["1", 0];
  const clipRef = input.loraName ? ["10", 1] : ["1", 1];
  if (typeof input.referenceFileName === "string" && input.referenceFileName.length > 0) {
    return {
      "1": {
        inputs: {
          ckpt_name: input.checkpointName
        },
        class_type: "CheckpointLoaderSimple"
      },
      ...(input.loraName
        ? {
            "10": {
              inputs: {
                model: ["1", 0],
                clip: ["1", 1],
                lora_name: input.loraName,
                strength_model: input.loraStrengthModel,
                strength_clip: input.loraStrengthClip
              },
              class_type: "LoraLoader"
            }
          }
        : {}),
      "2": {
        inputs: {
          text: input.viewPrompt,
          clip: clipRef
        },
        class_type: "CLIPTextEncode"
      },
      "3": {
        inputs: {
          text: input.negativePrompt,
          clip: clipRef
        },
        class_type: "CLIPTextEncode"
      },
      "4": {
        inputs: {
          image: input.referenceFileName
        },
        class_type: "LoadImage"
      },
      "5": {
        inputs: {
          image: ["4", 0],
          upscale_method: "lanczos",
          width: input.qualityProfile.width,
          height: input.qualityProfile.height,
          crop: "center"
        },
        class_type: "ImageScale"
      },
      "6": {
        inputs: {
          pixels: ["5", 0],
          vae: ["1", 2]
        },
        class_type: "VAEEncode"
      },
      "7": {
        inputs: {
          seed: input.seed,
          steps: input.qualityProfile.steps,
          cfg: input.qualityProfile.cfg,
          sampler_name: input.qualityProfile.sampler,
          scheduler: input.qualityProfile.scheduler,
          denoise: input.referenceDenoise,
          model: modelRef,
          positive: ["2", 0],
          negative: ["3", 0],
          latent_image: ["6", 0]
        },
        class_type: "KSampler"
      },
      "8": {
        inputs: {
          samples: ["7", 0],
          vae: ["1", 2]
        },
        class_type: "VAEDecode"
      },
      "9": {
        inputs: {
          filename_prefix: `${COMFY_FILENAME_PREFIX}_${input.view}_${input.seed}`,
          images: ["8", 0]
        },
        class_type: "SaveImage"
      }
    };
  }

  const workflow = {
    "1": {
      inputs: {
        ckpt_name: input.checkpointName
      },
      class_type: "CheckpointLoaderSimple"
    },
    ...(input.loraName
      ? {
          "10": {
            inputs: {
              model: ["1", 0],
              clip: ["1", 1],
              lora_name: input.loraName,
              strength_model: input.loraStrengthModel,
              strength_clip: input.loraStrengthClip
            },
            class_type: "LoraLoader"
          }
        }
      : {}),
    "2": {
      inputs: {
        text: input.viewPrompt,
        clip: clipRef
      },
      class_type: "CLIPTextEncode"
    },
    "3": {
      inputs: {
        text: input.negativePrompt,
        clip: clipRef
      },
      class_type: "CLIPTextEncode"
    },
    "4": {
      inputs: {
        width: input.qualityProfile.width,
        height: input.qualityProfile.height,
        batch_size: 1
      },
      class_type: "EmptyLatentImage"
    },
    "5": {
      inputs: {
        seed: input.seed,
        steps: input.qualityProfile.steps,
        cfg: input.qualityProfile.cfg,
        sampler_name: input.qualityProfile.sampler,
        scheduler: input.qualityProfile.scheduler,
        denoise: 1,
        model: modelRef,
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0]
      },
      class_type: "KSampler"
    },
    "6": {
      inputs: {
        samples: ["5", 0],
        vae: ["1", 2]
      },
      class_type: "VAEDecode"
    },
    "7": {
      inputs: {
        filename_prefix: `${COMFY_FILENAME_PREFIX}_${input.view}_${input.seed}`,
        images: ["6", 0]
      },
      class_type: "SaveImage"
    }
  };
  return workflow;
}

function resolveCheckpointPoseConfig(objectInfo) {
  const requiredNodes = [
    "CheckpointLoaderSimple",
    "CLIPTextEncode",
    "LoadImage",
    "OpenposePreprocessor",
    "ControlNetLoader",
    "ControlNetApplyAdvanced",
    "EmptyLatentImage",
    "IPAdapterUnifiedLoader",
    "IPAdapterAdvanced",
    "KSampler",
    "VAEDecode",
    "SaveImage"
  ];

  const missingNodes = requiredNodes.filter((name) => !hasObjectNode(objectInfo, name));
  if (missingNodes.length > 0) {
    return {
      ok: false,
      reason: `Missing ComfyUI nodes for pose-guided checkpoint path: ${missingNodes.join(", ")}`
    };
  }

  const controlNetOptions = readArray(objectInfo, ["ControlNetLoader", "input", "required", "control_net_name", 0]);
  const ipAdapterPresets = readArray(objectInfo, ["IPAdapterUnifiedLoader", "input", "required", "preset", 0]);
  const controlNetName = resolvePreferredOrFirst(controlNetOptions, COMFY_POSE_CONTROLNET_NAME);
  const ipAdapterPreset = resolvePreferredOrFirst(ipAdapterPresets, COMFY_IPADAPTER_PRESET);

  if (!controlNetName) {
    return {
      ok: false,
      reason: "No ControlNet models found for pose-guided checkpoint path."
    };
  }

  if (!ipAdapterPreset) {
    return {
      ok: false,
      reason: "No IPAdapter presets available for pose-guided checkpoint path."
    };
  }

  return {
    ok: true,
    resolved: {
      controlNetName,
      ipAdapterPreset
    }
  };
}

function resolveCheckpointUltraConfig(objectInfo, input = {}) {
  const requiredNodes = [
    "CheckpointLoaderSimple",
    "CLIPTextEncode",
    "LoadImage",
    "EmptyLatentImage",
    "KSampler",
    "VAEDecode",
    "SaveImage",
    "ImageScale",
    "VAEEncode",
    "IPAdapterUnifiedLoader",
    "IPAdapterAdvanced"
  ];
  const missingNodes = requiredNodes.filter((name) => !hasObjectNode(objectInfo, name));
  if (missingNodes.length > 0) {
    return {
      ok: false,
      reason: `Missing ComfyUI nodes for ultra checkpoint path: ${missingNodes.join(", ")}`
    };
  }

  const ipAdapterPresets = readArray(objectInfo, ["IPAdapterUnifiedLoader", "input", "required", "preset", 0]);
  const controlNetOptions = readArray(objectInfo, ["ControlNetLoader", "input", "required", "control_net_name", 0]);
  const ipAdapterPreset = resolvePreferredOrFirst(ipAdapterPresets, COMFY_IPADAPTER_PRESET);
  if (!ipAdapterPreset) {
    return {
      ok: false,
      reason: "No IPAdapter presets available for ultra checkpoint path."
    };
  }

  let controlNetName = null;
  if (input.requirePose === true) {
    const poseConfig = resolveCheckpointPoseConfig(objectInfo);
    if (!poseConfig.ok) {
      return poseConfig;
    }
    controlNetName = poseConfig.resolved.controlNetName;
  }

  const structureControls = {};
  const canUseStructureControls =
    COMFY_ULTRA_ENABLE_STRUCTURE_CONTROLS &&
    hasObjectNode(objectInfo, "ControlNetLoader") &&
    hasObjectNode(objectInfo, "ControlNetApplyAdvanced");
  if (canUseStructureControls) {
    const cannyPreprocessor = resolveFirstAvailableNodeName(objectInfo, ["CannyEdgePreprocessor", "Canny"]);
    const lineartPreprocessor = resolveFirstAvailableNodeName(objectInfo, ["LineArtPreprocessor"]);
    const depthPreprocessor = resolveFirstAvailableNodeName(objectInfo, [
      "DepthAnythingPreprocessor",
      "MiDaS-DepthMapPreprocessor"
    ]);

    const cannyControlNetName =
      cannyPreprocessor
        ? resolvePreferredByHints(controlNetOptions, COMFY_CANNY_CONTROLNET_NAME, [/canny/i])
        : null;
    if (cannyPreprocessor && cannyControlNetName) {
      structureControls.canny = {
        mode: "canny",
        preprocessorClass: cannyPreprocessor,
        controlNetName: cannyControlNetName,
        strength: COMFY_ULTRA_CANNY_STRENGTH,
        startPercent: 0,
        endPercent: defaultStructureControlEndPercent("canny")
      };
    }

    const lineartControlNetName =
      lineartPreprocessor
        ? resolvePreferredByHints(controlNetOptions, COMFY_LINEART_CONTROLNET_NAME, [/lineart/i, /scribble/i])
        : null;
    if (lineartPreprocessor && lineartControlNetName) {
      structureControls.lineart = {
        mode: "lineart",
        preprocessorClass: lineartPreprocessor,
        controlNetName: lineartControlNetName,
        strength: COMFY_ULTRA_LINEART_STRENGTH,
        startPercent: 0,
        endPercent: defaultStructureControlEndPercent("lineart")
      };
    }

    const depthControlNetName =
      depthPreprocessor
        ? resolvePreferredByHints(controlNetOptions, COMFY_DEPTH_CONTROLNET_NAME, [/depth/i, /midas/i])
        : null;
    if (depthPreprocessor && depthControlNetName) {
      structureControls.depth = {
        mode: "depth",
        preprocessorClass: depthPreprocessor,
        controlNetName: depthControlNetName,
        strength: COMFY_ULTRA_DEPTH_STRENGTH,
        startPercent: 0,
        endPercent: defaultStructureControlEndPercent("depth")
      };
    }
  }

  return {
    ok: true,
    resolved: {
      ipAdapterPreset,
      controlNetName,
      preciseStyleTransfer: hasObjectNode(objectInfo, "IPAdapterPreciseStyleTransfer"),
      preciseComposition: hasObjectNode(objectInfo, "IPAdapterPreciseComposition"),
      prepImageForClipVision: hasObjectNode(objectInfo, "PrepImageForClipVision"),
      repairInpaint:
        COMFY_ULTRA_ENABLE_REPAIR_INPAINT &&
        hasObjectNode(objectInfo, "VAEEncodeForInpaint") &&
        hasObjectNode(objectInfo, "MaskToImage") &&
        hasObjectNode(objectInfo, "ImageToMask") &&
        hasObjectNode(objectInfo, "InvertMask") &&
        hasObjectNode(objectInfo, "ThresholdMask") &&
        hasObjectNode(objectInfo, "GrowMask") &&
        hasObjectNode(objectInfo, "FeatherMask"),
      imageCompositeMasked: hasObjectNode(objectInfo, "ImageCompositeMasked"),
      setLatentNoiseMask: hasObjectNode(objectInfo, "SetLatentNoiseMask"),
      latentUpscaleBy: hasObjectNode(objectInfo, "LatentUpscaleBy"),
      latentUpscale: hasObjectNode(objectInfo, "LatentUpscale"),
      structureControls
    }
  };
}

function defaultReferenceWeight(role, isRepairStage) {
  if (role === "front_master" || role === "subject") {
    return isRepairStage ? 0.92 : 0.98;
  }
  if (role === "repair_base") {
    return 0.84;
  }
  if (role === "starter" || role === "view_starter") {
    return 0.62;
  }
  if (role === "composition") {
    return 0.46;
  }
  if (role === "style") {
    return 0.38;
  }
  return 0.58;
}

function buildAdaptiveNodeInputs(objectInfo, classType, candidates) {
  const spec = getNodeSpec(objectInfo, classType);
  const inputs = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (getInputSpec(spec, key) !== null) {
      inputs[key] = value;
    }
  }
  return inputs;
}

function resolveStructureControlPlans(input) {
  const structureControls = isObject(input.structureControls) ? input.structureControls : {};
  if (Object.keys(structureControls).length === 0) {
    return [];
  }

  const sourceRefs = input.referenceImageSourcesByRole ?? new Map();
  const contract = isObject(input.stageRuntimeContract) ? input.stageRuntimeContract : {};
  const allowedSourceRolesByKind = isObject(contract.allowedStructureSourceRolesByKind)
    ? contract.allowedStructureSourceRolesByKind
    : {};
  const requiredPrimarySourceRoleByKind = isObject(contract.requiredPrimaryStructureSourceRoleByKind)
    ? contract.requiredPrimaryStructureSourceRoleByKind
    : {};
  const getSource = (roles) => {
    for (const role of roles) {
      if (role === "repair_base" && input.repairBaseImageRef) {
        return {
          role,
          ref: input.repairBaseImageRef,
          sourceRefId: input.repairBaseSourceId,
          sourceView: input.repairBaseSourceView
        };
      }
      const found = sourceRefs.get(role);
      if (found) {
        return {
          role,
          ref: found.ref,
          sourceRefId: found.id,
          sourceView: found.view
        };
      }
    }
    return null;
  };

  const plans = [];
  const addPlan = (mode, legacyRoles) => {
    const config = structureControls[mode];
    if (!config) {
      return;
    }
    const orderedRoles = dedupeStrings([
      asString(requiredPrimarySourceRoleByKind?.[mode]),
      ...readStringArray(allowedSourceRolesByKind?.[mode]),
      ...legacyRoles
    ]);
    const source = getSource(orderedRoles);
    if (!source) {
      return;
    }
    plans.push({
      ...config,
      sourceRole: source.role,
      sourceRef: source.ref,
      sourceRefId: source.sourceRefId,
      sourceView: source.sourceView
    });
  };

  addPlan("lineart", ["view_starter", "composition", "repair_base", "starter", "front_master"]);
  addPlan("canny", ["composition", "view_starter", "repair_base", "starter", "front_master"]);
  if (
    input.workflowStage === "repair_refine" ||
    input.workflowStage === "identity_lock_refine" ||
    input.workflowStage === "side_view_refine"
  ) {
    addPlan("depth", ["repair_base", "front_master", "composition", "view_starter"]);
  }

  return plans;
}

function referenceWeightType(role) {
  if (role === "style") {
    return "style transfer";
  }
  if (role === "composition") {
    return "composition";
  }
  return "linear";
}

function buildCheckpointUltraWorkflow(input) {
  const prompt =
    typeof input.viewPrompt === "string" && input.viewPrompt.trim().length > 0
      ? input.viewPrompt.trim()
      : typeof input.positivePrompt === "string" && input.positivePrompt.trim().length > 0
        ? input.positivePrompt.trim()
        : "single mascot character, full body, plain background, consistent identity";
  const negative =
    typeof input.negativePrompt === "string" && input.negativePrompt.trim().length > 0
      ? input.negativePrompt.trim()
      : "photorealistic, text, watermark, multiple characters, blurry";
  const isRepairStage = input.workflowStage === "repair_refine";
  const latentRefineQualityTiers = Array.isArray(input.stageRuntimeContract?.latentRefineQualityTiers)
    ? input.stageRuntimeContract.latentRefineQualityTiers
    : [];
  const referenceEntries =
    Array.isArray(input.referenceEntries) && input.referenceEntries.length > 0
      ? input.referenceEntries
      : typeof input.referenceFileName === "string" && input.referenceFileName.length > 0
        ? [
            {
              id: "fallback_subject",
              role: "subject",
              fileName: input.referenceFileName,
              weight: 0.9
            }
          ]
        : [];

  let nextId = 1;
  const workflow = {};
  const next = () => String(nextId++);

  const checkpointId = next();
  workflow[checkpointId] = {
    class_type: "CheckpointLoaderSimple",
    inputs: {
      ckpt_name: input.checkpointName
    }
  };

  let modelRef = [checkpointId, 0];
  let clipRef = [checkpointId, 1];
  const vaeRef = [checkpointId, 2];

  if (input.loraName) {
    const loraId = next();
    workflow[loraId] = {
      class_type: "LoraLoader",
      inputs: {
        model: modelRef,
        clip: clipRef,
        lora_name: input.loraName,
        strength_model: input.loraStrengthModel,
        strength_clip: input.loraStrengthClip
      }
    };
    modelRef = [loraId, 0];
    clipRef = [loraId, 1];
  }

  const positiveId = next();
  workflow[positiveId] = {
    class_type: "CLIPTextEncode",
    inputs: {
      text: prompt,
      clip: clipRef
    }
  };
  const negativeId = next();
  workflow[negativeId] = {
    class_type: "CLIPTextEncode",
    inputs: {
      text: negative,
      clip: clipRef
    }
  };

  let positiveRef = [positiveId, 0];
  let negativeRef = [negativeId, 0];

  if (input.poseFileName && input.controlNetName) {
    const poseImageId = next();
    workflow[poseImageId] = {
      class_type: "LoadImage",
      inputs: {
        image: input.poseFileName
      }
    };
    const openPoseId = next();
    workflow[openPoseId] = {
      class_type: "OpenposePreprocessor",
      inputs: {
        image: [poseImageId, 0],
        detect_hand: "disable",
        detect_body: "enable",
        detect_face: "enable",
        resolution: input.poseSettings.openposeResolution,
        scale_stick_for_xinsr_cn: "disable"
      }
    };
    const controlNetId = next();
    workflow[controlNetId] = {
      class_type: "ControlNetLoader",
      inputs: {
        control_net_name: input.controlNetName
      }
    };
    const applyId = next();
    workflow[applyId] = {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: positiveRef,
        negative: negativeRef,
        control_net: [controlNetId, 0],
        image: [openPoseId, 0],
        strength: input.poseSettings.poseStrength,
        start_percent: 0,
        end_percent: input.poseSettings.poseEndPercent,
        vae: vaeRef
      }
    };
    positiveRef = [applyId, 0];
    negativeRef = [applyId, 1];
  }

  if (Array.isArray(input.structureControls) && input.structureControls.length > 0) {
    for (const control of input.structureControls) {
      if (!control?.fileName || !control?.controlNetName) {
        continue;
      }
      const structureImageId = next();
      workflow[structureImageId] = {
        class_type: "LoadImage",
        inputs: {
          image: control.fileName
        }
      };
      const structureScaleId = next();
      workflow[structureScaleId] = {
        class_type: "ImageScale",
        inputs: {
          image: [structureImageId, 0],
          upscale_method: "lanczos",
          width: input.qualityProfile.width,
          height: input.qualityProfile.height,
          crop: "center"
        }
      };
      const structureControlNetId = next();
      workflow[structureControlNetId] = {
        class_type: "ControlNetLoader",
        inputs: {
          control_net_name: control.controlNetName
        }
      };
      const structureApplyId = next();
      workflow[structureApplyId] = {
        class_type: "ControlNetApplyAdvanced",
        inputs: {
          positive: positiveRef,
          negative: negativeRef,
          control_net: [structureControlNetId, 0],
          image: [structureScaleId, 0],
          strength:
            typeof control.strength === "number" ? control.strength : defaultStructureControlStrength(control.kind),
          start_percent: typeof control.startPercent === "number" ? control.startPercent : 0,
          end_percent:
            typeof control.endPercent === "number"
              ? control.endPercent
              : defaultStructureControlEndPercent(control.kind),
          vae: vaeRef
        }
      };
      positiveRef = [structureApplyId, 0];
      negativeRef = [structureApplyId, 1];
    }
  }

  let latentRef;
  let denoise = 1;
  let useRepairInpaint = false;
  let repairBaseImageRef = null;
  let repairCompositeMaskRef = null;
  if (typeof input.referenceFileName === "string" && input.referenceFileName.length > 0) {
    const referenceImageId = next();
    workflow[referenceImageId] = {
      class_type: "LoadImage",
      inputs: {
        image: input.referenceFileName
      }
    };
    const scaleId = next();
    workflow[scaleId] = {
      class_type: "ImageScale",
      inputs: {
        image: [referenceImageId, 0],
        upscale_method: "lanczos",
        width: input.qualityProfile.width,
        height: input.qualityProfile.height,
        crop: "center"
      }
    };
    repairBaseImageRef = [scaleId, 0];
    useRepairInpaint =
      isRepairStage &&
      input.ultraFeatures?.repairInpaint &&
      typeof input.referenceFileName === "string" &&
      input.referenceFileName.length > 0;
    if (useRepairInpaint) {
      let maskImageSourceRef;
      if (typeof input.repairMaskFileName === "string" && input.repairMaskFileName.length > 0) {
        const repairMaskImageId = next();
        workflow[repairMaskImageId] = {
          class_type: "LoadImage",
          inputs: {
            image: input.repairMaskFileName
          }
        };
        const maskToImageId = next();
        workflow[maskToImageId] = {
          class_type: "MaskToImage",
          inputs: {
            mask: [repairMaskImageId, 1]
          }
        };
        maskImageSourceRef = [maskToImageId, 0];
      } else {
        const maskToImageId = next();
        workflow[maskToImageId] = {
          class_type: "MaskToImage",
          inputs: {
            mask: [referenceImageId, 1]
          }
        };
        maskImageSourceRef = [maskToImageId, 0];
      }
      const scaleMaskImageId = next();
      workflow[scaleMaskImageId] = {
        class_type: "ImageScale",
        inputs: {
          image: maskImageSourceRef,
          upscale_method: "lanczos",
          width: input.qualityProfile.width,
          height: input.qualityProfile.height,
          crop: "center"
        }
      };
      const scaledMaskId = next();
      workflow[scaledMaskId] = {
        class_type: "ImageToMask",
        inputs: {
          image: [scaleMaskImageId, 0],
          channel: "alpha"
        }
      };
      const invertMaskId = next();
      workflow[invertMaskId] = {
        class_type: "InvertMask",
        inputs: {
          mask: [scaledMaskId, 0]
        }
      };
      const thresholdMaskId = next();
      workflow[thresholdMaskId] = {
        class_type: "ThresholdMask",
        inputs: {
          mask: [invertMaskId, 0],
          value:
            Number.isFinite(COMFY_ULTRA_REPAIR_MASK_THRESHOLD) && COMFY_ULTRA_REPAIR_MASK_THRESHOLD >= 0
              ? COMFY_ULTRA_REPAIR_MASK_THRESHOLD
              : 0.08
        }
      };
      const growMaskId = next();
      workflow[growMaskId] = {
        class_type: "GrowMask",
        inputs: {
          mask: [thresholdMaskId, 0],
          expand: Number.isInteger(COMFY_ULTRA_REPAIR_MASK_GROW) ? COMFY_ULTRA_REPAIR_MASK_GROW : 12,
          tapered_corners: true
        }
      };
      const featherMaskId = next();
      workflow[featherMaskId] = {
        class_type: "FeatherMask",
        inputs: {
          mask: [growMaskId, 0],
          left: Number.isInteger(COMFY_ULTRA_REPAIR_MASK_FEATHER) ? COMFY_ULTRA_REPAIR_MASK_FEATHER : 10,
          top: Number.isInteger(COMFY_ULTRA_REPAIR_MASK_FEATHER) ? COMFY_ULTRA_REPAIR_MASK_FEATHER : 10,
          right: Number.isInteger(COMFY_ULTRA_REPAIR_MASK_FEATHER) ? COMFY_ULTRA_REPAIR_MASK_FEATHER : 10,
          bottom: Number.isInteger(COMFY_ULTRA_REPAIR_MASK_FEATHER) ? COMFY_ULTRA_REPAIR_MASK_FEATHER : 10
        }
      };
      repairCompositeMaskRef = [featherMaskId, 0];
      const encodeId = next();
      workflow[encodeId] = {
        class_type: "VAEEncodeForInpaint",
        inputs: {
          pixels: [scaleId, 0],
          vae: vaeRef,
          mask: [featherMaskId, 0],
          grow_mask_by: 0
        }
      };
      if (input.ultraFeatures?.setLatentNoiseMask) {
        const noiseMaskId = next();
        workflow[noiseMaskId] = {
          class_type: "SetLatentNoiseMask",
          inputs: {
            samples: [encodeId, 0],
            mask: [featherMaskId, 0]
          }
        };
        latentRef = [noiseMaskId, 0];
      } else {
        latentRef = [encodeId, 0];
      }
      denoise =
        typeof input.referenceDenoise === "number"
          ? Math.max(input.referenceDenoise, Number.isFinite(COMFY_ULTRA_REPAIR_DENOISE) ? COMFY_ULTRA_REPAIR_DENOISE : 0.46)
          : Number.isFinite(COMFY_ULTRA_REPAIR_DENOISE)
            ? COMFY_ULTRA_REPAIR_DENOISE
            : 0.46;
    } else {
      const encodeId = next();
      workflow[encodeId] = {
        class_type: "VAEEncode",
        inputs: {
          pixels: [scaleId, 0],
          vae: vaeRef
        }
      };
      latentRef = [encodeId, 0];
      denoise = typeof input.referenceDenoise === "number" ? input.referenceDenoise : COMFY_REFERENCE_DENOISE;
    }
  } else {
    const emptyId = next();
    workflow[emptyId] = {
      class_type: "EmptyLatentImage",
      inputs: {
        width: input.qualityProfile.width,
        height: input.qualityProfile.height,
        batch_size: 1
      }
    };
    latentRef = [emptyId, 0];
  }

  let finalModelRef = modelRef;
  const referenceImageSourcesByRole = new Map();
  if (referenceEntries.length > 0) {
    const loaderId = next();
    workflow[loaderId] = {
      class_type: "IPAdapterUnifiedLoader",
      inputs: {
        model: modelRef,
        preset: input.ipAdapterPreset
      }
    };
    const ipAdapterRef = [loaderId, 1];
    let currentModelRef = [loaderId, 0];

    for (const entry of referenceEntries) {
      if (!entry?.fileName) {
        continue;
      }
      const imageId = next();
      workflow[imageId] = {
        class_type: "LoadImage",
        inputs: {
          image: entry.fileName
        }
      };
      if (!referenceImageSourcesByRole.has(entry.role)) {
        referenceImageSourcesByRole.set(entry.role, {
          ref: [imageId, 0],
          id: entry.id,
          view: entry.view
        });
      }
      let adapterImageRef = [imageId, 0];
      if (
        (entry.role === "style" || entry.role === "composition") &&
        input.ultraFeatures?.prepImageForClipVision
      ) {
        const prepId = next();
        workflow[prepId] = {
          class_type: "PrepImageForClipVision",
          inputs: {
            image: [imageId, 0],
            interpolation: "LANCZOS",
            crop_position: entry.role === "composition" ? "center" : "pad",
            sharpening: Number.isFinite(COMFY_ULTRA_CLIPVISION_SHARPEN) ? COMFY_ULTRA_CLIPVISION_SHARPEN : 0.22
          }
        };
        adapterImageRef = [prepId, 0];
      }
      const applyId = next();
      const baseInputs = {
        model: currentModelRef,
        ipadapter: ipAdapterRef,
        image: adapterImageRef,
        weight:
          typeof entry.weight === "number"
            ? entry.weight
            : defaultReferenceWeight(entry.role, isRepairStage),
        combine_embeds: "average",
        start_at: entry.role === "style" ? 0.04 : 0,
        end_at: entry.role === "repair_base" ? 0.88 : entry.role === "style" ? 0.78 : 1,
        embeds_scaling: "V only"
      };

      if (entry.role === "style" && input.ultraFeatures?.preciseStyleTransfer) {
        workflow[applyId] = {
          class_type: "IPAdapterPreciseStyleTransfer",
          inputs: {
            ...baseInputs,
            style_boost: Number.isFinite(COMFY_ULTRA_STYLE_BOOST) ? COMFY_ULTRA_STYLE_BOOST : 0.9
          }
        };
      } else if (entry.role === "composition" && input.ultraFeatures?.preciseComposition) {
        workflow[applyId] = {
          class_type: "IPAdapterPreciseComposition",
          inputs: {
            ...baseInputs,
            composition_boost: Number.isFinite(COMFY_ULTRA_COMPOSITION_BOOST) ? COMFY_ULTRA_COMPOSITION_BOOST : 0.65
          }
        };
      } else {
        workflow[applyId] = {
          class_type: "IPAdapterAdvanced",
          inputs: {
            ...baseInputs,
            weight_type: referenceWeightType(entry.role)
          }
        };
      }
      currentModelRef = [applyId, 0];
    }

    finalModelRef = currentModelRef;
  }

  const structureControlPlans = resolveStructureControlPlans({
    workflowStage: input.workflowStage,
    stageRuntimeContract: input.stageRuntimeContract,
    structureControls: input.ultraFeatures?.structureControls,
    referenceImageSourcesByRole,
    repairBaseImageRef,
    repairBaseSourceId: referenceEntries.find((entry) => entry?.role === "repair_base")?.id,
    repairBaseSourceView: referenceEntries.find((entry) => entry?.role === "repair_base")?.view
  });
  for (const controlPlan of structureControlPlans) {
    const preprocessorId = next();
    workflow[preprocessorId] = {
      class_type: controlPlan.preprocessorClass,
      inputs: buildAdaptiveNodeInputs(input.objectInfo, controlPlan.preprocessorClass, {
        image: controlPlan.sourceRef,
        resolution: COMFY_ULTRA_STRUCTURE_RESOLUTION,
        low_threshold: COMFY_ULTRA_CANNY_LOW_THRESHOLD,
        high_threshold: COMFY_ULTRA_CANNY_HIGH_THRESHOLD,
        coarse: false
      })
    };
    const controlNetId = next();
    workflow[controlNetId] = {
      class_type: "ControlNetLoader",
      inputs: {
        control_net_name: controlPlan.controlNetName
      }
    };
    const applyId = next();
    workflow[applyId] = {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: positiveRef,
        negative: negativeRef,
        control_net: [controlNetId, 0],
        image: [preprocessorId, 0],
        strength: controlPlan.strength,
        start_percent: 0,
        end_percent: controlPlan.endPercent,
        vae: vaeRef
      }
    };
    positiveRef = [applyId, 0];
    negativeRef = [applyId, 1];
  }

  const samplerId = next();
  workflow[samplerId] = {
    class_type: "KSampler",
    inputs: {
      model: finalModelRef,
      seed: input.seed,
      steps: input.qualityProfile.steps,
      cfg: input.qualityProfile.cfg,
      sampler_name: input.qualityProfile.sampler,
      scheduler: input.qualityProfile.scheduler,
      positive: positiveRef,
      negative: negativeRef,
      latent_image: latentRef,
      denoise
    }
  };
  let finalLatentRef = [samplerId, 0];
  const shouldRefine =
    COMFY_ULTRA_ENABLE_LATENT_REFINE &&
    latentRefineQualityTiers.includes(input.qualityProfile.qualityTier) &&
    !useRepairInpaint &&
    (input.ultraFeatures?.latentUpscaleBy || input.ultraFeatures?.latentUpscale);

  if (shouldRefine) {
    const refineScale = Number.isFinite(COMFY_ULTRA_REFINE_UPSCALE) && COMFY_ULTRA_REFINE_UPSCALE > 1
      ? COMFY_ULTRA_REFINE_UPSCALE
      : 1.18;
    const upscaleId = next();
    if (input.ultraFeatures?.latentUpscaleBy) {
      workflow[upscaleId] = {
        class_type: "LatentUpscaleBy",
        inputs: {
          samples: finalLatentRef,
          upscale_method: "bislerp",
          scale_by: refineScale
        }
      };
    } else {
      workflow[upscaleId] = {
        class_type: "LatentUpscale",
        inputs: {
          samples: finalLatentRef,
          upscale_method: "bislerp",
          width: Math.max(8, Math.round(input.qualityProfile.width * refineScale / 8) * 8),
          height: Math.max(8, Math.round(input.qualityProfile.height * refineScale / 8) * 8),
          crop: "disabled"
        }
      };
    }

    const refineSamplerId = next();
    workflow[refineSamplerId] = {
      class_type: "KSampler",
      inputs: {
        model: finalModelRef,
        seed: input.seed + 17,
        steps: Math.max(10, Math.round((input.qualityProfile.steps ?? 24) * 0.44)),
        cfg: Math.max(1.8, (input.qualityProfile.cfg ?? 4) * 0.94),
        sampler_name: input.qualityProfile.sampler,
        scheduler: input.qualityProfile.scheduler,
        positive: positiveRef,
        negative: negativeRef,
        latent_image: [upscaleId, 0],
        denoise: Number.isFinite(COMFY_ULTRA_REFINE_DENOISE) ? COMFY_ULTRA_REFINE_DENOISE : 0.22
      }
    };
    finalLatentRef = [refineSamplerId, 0];
  }

  const decodeId = next();
  workflow[decodeId] = {
    class_type: "VAEDecode",
    inputs: {
      samples: finalLatentRef,
      vae: vaeRef
    }
  };
  const finalImageRef =
    useRepairInpaint &&
    input.ultraFeatures?.imageCompositeMasked &&
    repairBaseImageRef &&
    repairCompositeMaskRef
      ? (() => {
          const compositeId = next();
          workflow[compositeId] = {
            class_type: "ImageCompositeMasked",
            inputs: {
              destination: repairBaseImageRef,
              source: [decodeId, 0],
              x: 0,
              y: 0,
              resize_source: true,
              mask: repairCompositeMaskRef
            }
          };
          return [compositeId, 0];
        })()
      : [decodeId, 0];
  const saveId = next();
  workflow[saveId] = {
    class_type: "SaveImage",
    inputs: {
      images: finalImageRef,
      filename_prefix: `${COMFY_FILENAME_PREFIX}_${input.view}_${input.seed}`
    }
  };

  return workflow;
}

function buildCheckpointPoseWorkflow(input) {
  const prompt =
    typeof input.viewPrompt === "string" && input.viewPrompt.trim().length > 0
      ? input.viewPrompt.trim()
      : typeof input.positivePrompt === "string" && input.positivePrompt.trim().length > 0
        ? input.positivePrompt.trim()
        : "single anime character, consistent identity, full body, plain background";
  const negative =
    typeof input.negativePrompt === "string" && input.negativePrompt.trim().length > 0
      ? input.negativePrompt.trim()
      : "photorealistic, text, watermark, multiple characters, blurry";

  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: input.checkpointName
      }
    },
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: prompt,
        clip: ["1", 1]
      }
    },
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: negative,
        clip: ["1", 1]
      }
    },
    "4": {
      class_type: "LoadImage",
      inputs: {
        image: input.referenceFileName
      }
    },
    "5": {
      class_type: "LoadImage",
      inputs: {
        image: input.poseFileName
      }
    },
    "6": {
      class_type: "OpenposePreprocessor",
      inputs: {
        image: ["5", 0],
        detect_hand: "disable",
        detect_body: "enable",
        detect_face: "enable",
        resolution: input.poseSettings.openposeResolution,
        scale_stick_for_xinsr_cn: "disable"
      }
    },
    "7": {
      class_type: "ControlNetLoader",
      inputs: {
        control_net_name: input.controlNetName
      }
    },
    "8": {
      class_type: "ControlNetApplyAdvanced",
      inputs: {
        positive: ["2", 0],
        negative: ["3", 0],
        control_net: ["7", 0],
        image: ["6", 0],
        strength: input.poseSettings.poseStrength,
        start_percent: 0,
        end_percent: input.poseSettings.poseEndPercent,
        vae: ["1", 2]
      }
    },
    "9": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: input.qualityProfile.width,
        height: input.qualityProfile.height,
        batch_size: 1
      }
    },
    "10": {
      class_type: "IPAdapterUnifiedLoader",
      inputs: {
        model: ["1", 0],
        preset: input.poseSettings.ipAdapterPreset
      }
    },
    "11": {
      class_type: "IPAdapterAdvanced",
      inputs: {
        model: ["10", 0],
        ipadapter: ["10", 1],
        image: ["4", 0],
        weight: input.poseSettings.ipAdapterWeight,
        weight_type: "linear",
        combine_embeds: "concat",
        start_at: 0,
        end_at: 1,
        embeds_scaling: "V only"
      }
    },
    "12": {
      class_type: "KSampler",
      inputs: {
        model: ["11", 0],
        seed: input.seed,
        steps: input.qualityProfile.steps,
        cfg: input.qualityProfile.cfg,
        sampler_name: input.qualityProfile.sampler,
        scheduler: input.qualityProfile.scheduler,
        positive: ["8", 0],
        negative: ["8", 1],
        latent_image: ["9", 0],
        denoise: 1
      }
    },
    "13": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["12", 0],
        vae: ["1", 2]
      }
    },
    "14": {
      class_type: "SaveImage",
      inputs: {
        images: ["13", 0],
        filename_prefix: `${COMFY_FILENAME_PREFIX}_${input.view}_${input.seed}`
      }
    }
  };
}

function hasObjectNode(objectInfo, name) {
  return typeof objectInfo?.[name] === "object" && objectInfo[name] !== null;
}

function readArray(objectInfo, path) {
  let cursor = objectInfo;
  for (const key of path) {
    cursor = cursor?.[key];
  }
  return Array.isArray(cursor) ? cursor : [];
}

function resolvePreferredOrFirst(options, preferred) {
  if (options.includes(preferred)) return preferred;
  return options.length > 0 ? String(options[0]) : null;
}

function resolvePreferredByHints(options, preferred, patterns = []) {
  if (preferred && options.includes(preferred)) {
    return preferred;
  }
  for (const pattern of patterns) {
    const match = options.find((option) => pattern.test(String(option)));
    if (match) {
      return String(match);
    }
  }
  return options.length > 0 ? String(options[0]) : null;
}

function resolveFirstAvailableNodeName(objectInfo, candidates) {
  for (const candidate of candidates) {
    if (hasObjectNode(objectInfo, candidate)) {
      return candidate;
    }
  }
  return null;
}

function resolveFlux2Config(objectInfo) {
  const requiredNodes = ["UNETLoader", "VAELoader", "EmptyFlux2LatentImage", "ModelSamplingFlux", "KSampler", "VAEDecode", "SaveImage"];

  const missingNodes = requiredNodes.filter((name) => !hasObjectNode(objectInfo, name));
  if (missingNodes.length > 0) {
    return {
      ok: false,
      reason: `Missing ComfyUI nodes for flux2: ${missingNodes.join(", ")}`
    };
  }

  const unetOptions = readArray(objectInfo, ["UNETLoader", "input", "required", "unet_name", 0]);
  const vaeOptions = readArray(objectInfo, ["VAELoader", "input", "required", "vae_name", 0]);
  const dualOptions = readArray(objectInfo, ["DualCLIPLoader", "input", "required", "clip_name1", 0]);
  const clipLoaderOptions = readArray(objectInfo, ["CLIPLoader", "input", "required", "clip_name", 0]);
  const clipLoaderTypes = readArray(objectInfo, ["CLIPLoader", "input", "required", "type", 0]);

  const unetName = resolvePreferredOrFirst(unetOptions, COMFY_UNET_NAME);
  const vaeName = resolvePreferredOrFirst(vaeOptions, COMFY_VAE_NAME);

  if (!unetName) {
    return { ok: false, reason: "No UNET models found in ComfyUI." };
  }
  if (!vaeName) {
    return { ok: false, reason: "No VAE models found in ComfyUI." };
  }

  const qwenName = resolvePreferredOrFirst(clipLoaderOptions, COMFY_QWEN_NAME);
  const supportsFlux2Qwen =
    hasObjectNode(objectInfo, "CLIPLoader") &&
    hasObjectNode(objectInfo, "CLIPTextEncode") &&
    clipLoaderTypes.includes("flux2") &&
    !!qwenName;

  const clipLName = resolvePreferredOrFirst(dualOptions, COMFY_CLIP_L_NAME);
  const t5Name = resolvePreferredOrFirst(dualOptions, COMFY_T5_NAME);
  const schedulerNode =
    hasObjectNode(objectInfo, "BasicScheduler")
      ? "BasicScheduler"
      : hasObjectNode(objectInfo, "Flux2Scheduler")
        ? "Flux2Scheduler"
        : null;
  const supportsFluxClassic =
    hasObjectNode(objectInfo, "DualCLIPLoader") &&
    hasObjectNode(objectInfo, "CLIPTextEncodeFlux") &&
    hasObjectNode(objectInfo, "FluxGuidance") &&
    hasObjectNode(objectInfo, "RandomNoise") &&
    hasObjectNode(objectInfo, "KSamplerSelect") &&
    !!schedulerNode &&
    hasObjectNode(objectInfo, "BasicGuider") &&
    hasObjectNode(objectInfo, "SamplerCustomAdvanced") &&
    !!clipLName &&
    !!t5Name;

  if (!supportsFlux2Qwen && !supportsFluxClassic) {
    return { ok: false, reason: "No compatible flux2 text-encoding path is available." };
  }

  const missingPreferred = [];
  if (!unetOptions.includes(COMFY_UNET_NAME)) missingPreferred.push(`UNET(${COMFY_UNET_NAME})`);
  if (!vaeOptions.includes(COMFY_VAE_NAME)) missingPreferred.push(`VAE(${COMFY_VAE_NAME})`);
  if (supportsFlux2Qwen && !clipLoaderOptions.includes(COMFY_QWEN_NAME))
    missingPreferred.push(`QWEN(${COMFY_QWEN_NAME})`);
  if (supportsFluxClassic && !dualOptions.includes(COMFY_CLIP_L_NAME))
    missingPreferred.push(`CLIP_L(${COMFY_CLIP_L_NAME})`);
  if (supportsFluxClassic && !dualOptions.includes(COMFY_T5_NAME))
    missingPreferred.push(`T5(${COMFY_T5_NAME})`);

  const resolved = {
    unetName,
    vaeName,
    mode: supportsFluxClassic ? "flux-classic" : "flux2-qwen",
    qwenName,
    clipLName,
    t5Name,
    schedulerNode
  };

  return {
    ok: true,
    resolved,
    warning:
      [
        missingPreferred.length > 0
          ? `Preferred models not found, using fallback: ${missingPreferred.join(", ")}`
          : null,
        resolved.mode === "flux2-qwen"
          ? "QWEN-only FLUX2 path is active. For best 2D anime consistency, install clip_l + t5xxl and use flux-classic path."
          : null
      ]
        .filter((entry) => typeof entry === "string" && entry.length > 0)
        .join(" | ") || null
  };
}

function buildFlux2QwenWorkflow(input) {
  const prompt =
    typeof input.viewPrompt === "string" && input.viewPrompt.trim().length > 0
      ? input.viewPrompt.trim()
      : typeof input.positivePrompt === "string" && input.positivePrompt.trim().length > 0
        ? input.positivePrompt.trim()
        : "single anime mascot character, full body, plain background, consistent identity";
  const negative =
    typeof input.negativePrompt === "string" && input.negativePrompt.trim().length > 0
      ? input.negativePrompt.trim()
      : "blurry, low quality, distorted";

  if (typeof input.referenceFileName === "string" && input.referenceFileName.length > 0) {
    return {
      "1": {
        class_type: "UNETLoader",
        inputs: {
          unet_name: input.unetName,
          weight_dtype: "default"
        }
      },
      "2": {
        class_type: "CLIPLoader",
        inputs: {
          clip_name: input.qwenName,
          type: "flux2"
        }
      },
      "3": {
        class_type: "VAELoader",
        inputs: {
          vae_name: input.vaeName
        }
      },
      "4": {
        class_type: "CLIPTextEncode",
        inputs: {
          clip: ["2", 0],
          text: prompt
        }
      },
      "5": {
        class_type: "CLIPTextEncode",
        inputs: {
          clip: ["2", 0],
          text: negative
        }
      },
      "6": {
        class_type: "LoadImage",
        inputs: {
          image: input.referenceFileName
        }
      },
      "7": {
        class_type: "ImageScale",
        inputs: {
          image: ["6", 0],
          upscale_method: "lanczos",
          width: input.qualityProfile.width,
          height: input.qualityProfile.height,
          crop: "center"
        }
      },
      "8": {
        class_type: "VAEEncode",
        inputs: {
          pixels: ["7", 0],
          vae: ["3", 0]
        }
      },
      "9": {
        class_type: "ModelSamplingFlux",
        inputs: {
          model: ["1", 0],
          max_shift: input.qualityProfile.maxShift,
          base_shift: input.qualityProfile.baseShift,
          width: input.qualityProfile.width,
          height: input.qualityProfile.height
        }
      },
      "10": {
        class_type: "KSampler",
        inputs: {
          model: ["9", 0],
          seed: input.seed,
          steps: input.qualityProfile.steps,
          cfg: input.qualityProfile.cfg,
          sampler_name: input.qualityProfile.sampler,
          scheduler: input.qualityProfile.scheduler,
          positive: ["4", 0],
          negative: ["5", 0],
          latent_image: ["8", 0],
          denoise: input.referenceDenoise
        }
      },
      "11": {
        class_type: "VAEDecode",
        inputs: {
          samples: ["10", 0],
          vae: ["3", 0]
        }
      },
      "14": {
        class_type: "SaveImage",
        inputs: {
          filename_prefix: `${COMFY_FILENAME_PREFIX}_${input.view}_${input.seed}`,
          images: ["11", 0]
        }
      }
    };
  }

  return {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: input.unetName,
        weight_dtype: "default"
      }
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: {
        clip_name: input.qwenName,
        type: "flux2"
      }
    },
    "3": {
      class_type: "VAELoader",
      inputs: {
        vae_name: input.vaeName
      }
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["2", 0],
        text: prompt
      }
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: {
        clip: ["2", 0],
        text: negative
      }
    },
    "6": {
      class_type: "EmptyFlux2LatentImage",
      inputs: {
        width: input.qualityProfile.width,
        height: input.qualityProfile.height,
        batch_size: 1
      }
    },
    "7": {
      class_type: "ModelSamplingFlux",
      inputs: {
        model: ["1", 0],
        max_shift: input.qualityProfile.maxShift,
        base_shift: input.qualityProfile.baseShift,
        width: input.qualityProfile.width,
        height: input.qualityProfile.height
      }
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        model: ["7", 0],
        seed: input.seed,
        steps: input.qualityProfile.steps,
        cfg: input.qualityProfile.cfg,
        sampler_name: input.qualityProfile.sampler,
        scheduler: input.qualityProfile.scheduler,
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
        denoise: 1
      }
    },
    "9": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["8", 0],
        vae: ["3", 0]
      }
    },
    "14": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: `${COMFY_FILENAME_PREFIX}_${input.view}_${input.seed}`,
        images: ["9", 0]
      }
    }
  };
}

function buildFlux2ClassicWorkflow(input) {
  const viewSpecificPrompt =
    typeof input.viewPrompt === "string" && input.viewPrompt.trim().length > 0
      ? input.viewPrompt.trim()
      : typeof input.positivePrompt === "string" && input.positivePrompt.trim().length > 0
        ? input.positivePrompt.trim()
        : "single anime mascot character, full body, plain background, consistent identity";

  const negative = typeof input.negativePrompt === "string" ? input.negativePrompt.trim() : "";
  const clipLPrompt = `${viewSpecificPrompt}${negative ? `, avoid: ${negative}` : ""}`.trim();
  const t5Prompt = `${viewSpecificPrompt}, production model sheet quality, consistent proportions`.trim();

  const workflow = {
    "1": {
      class_type: "UNETLoader",
      inputs: {
        unet_name: input.unetName,
        weight_dtype: "default"
      }
    },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: input.clipLName,
        clip_name2: input.t5Name,
        type: "flux"
      }
    },
    "3": {
      class_type: "VAELoader",
      inputs: {
        vae_name: input.vaeName
      }
    },
    "4": {
      class_type: "CLIPTextEncodeFlux",
      inputs: {
        clip: ["2", 0],
        clip_l: clipLPrompt,
        t5xxl: t5Prompt,
        guidance: input.qualityProfile.cfg
      }
    },
    "5": {
      class_type: "FluxGuidance",
      inputs: {
        conditioning: ["4", 0],
        guidance: input.qualityProfile.cfg
      }
    },
    "7": {
      class_type: "ModelSamplingFlux",
      inputs: {
        model: ["1", 0],
        max_shift: input.qualityProfile.maxShift,
        base_shift: input.qualityProfile.baseShift,
        width: input.qualityProfile.width,
        height: input.qualityProfile.height
      }
    },
    "8": {
      class_type: "RandomNoise",
      inputs: {
        noise_seed: input.seed
      }
    },
    "9": {
      class_type: "KSamplerSelect",
      inputs: {
        sampler_name: input.qualityProfile.sampler
      }
    },
    "11": {
      class_type: "BasicGuider",
      inputs: {
        model: ["7", 0],
        conditioning: ["5", 0]
      }
    },
    "12": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["8", 0],
        guider: ["11", 0],
        sampler: ["9", 0],
        sigmas: ["10", 0],
        latent_image: ["6", 0]
      }
    },
    "13": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["12", 0],
        vae: ["3", 0]
      }
    },
    "14": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: `${COMFY_FILENAME_PREFIX}_${input.view}_${input.seed}`,
        images: ["13", 0]
      }
    }
  };

  if (typeof input.referenceFileName === "string" && input.referenceFileName.length > 0) {
    workflow["6"] = {
      class_type: "VAEEncode",
      inputs: {
        pixels: ["15", 0],
        vae: ["3", 0]
      }
    };
    workflow["15"] = {
      class_type: "ImageScale",
      inputs: {
        image: ["16", 0],
        upscale_method: "lanczos",
        width: input.qualityProfile.width,
        height: input.qualityProfile.height,
        crop: "center"
      }
    };
    workflow["16"] = {
      class_type: "LoadImage",
      inputs: {
        image: input.referenceFileName
      }
    };
  } else {
    workflow["6"] = {
      class_type: "EmptyFlux2LatentImage",
      inputs: {
        width: input.qualityProfile.width,
        height: input.qualityProfile.height,
        batch_size: 1
      }
    };
  }

  workflow["10"] =
    input.schedulerNode === "BasicScheduler"
      ? {
          class_type: "BasicScheduler",
          inputs: {
            scheduler: input.qualityProfile.scheduler,
            steps: input.qualityProfile.steps,
            denoise:
              typeof input.referenceFileName === "string" && input.referenceFileName.length > 0
                ? input.referenceDenoise
                : 1,
            model: ["7", 0]
          }
        }
      : {
          class_type: "Flux2Scheduler",
          inputs: {
            steps: input.qualityProfile.steps,
            width: input.qualityProfile.width,
            height: input.qualityProfile.height
          }
        };

  return workflow;
}

function isLinkValue(value) {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    (typeof value[0] === "string" || typeof value[0] === "number") &&
    Number.isInteger(Number(value[1]))
  );
}

function getNodeSpec(objectInfo, classType) {
  return isObject(objectInfo?.[classType]) ? objectInfo[classType] : null;
}

function getOrderedInputNames(spec) {
  const required =
    Array.isArray(spec?.input_order?.required) && spec.input_order.required.length > 0
      ? spec.input_order.required
      : isObject(spec?.input?.required)
        ? Object.keys(spec.input.required)
        : [];
  const optional =
    Array.isArray(spec?.input_order?.optional) && spec.input_order.optional.length > 0
      ? spec.input_order.optional
      : isObject(spec?.input?.optional)
        ? Object.keys(spec.input.optional)
        : [];
  return [...required, ...optional];
}

function getInputSpec(spec, inputName) {
  if (isObject(spec?.input?.required) && Object.prototype.hasOwnProperty.call(spec.input.required, inputName)) {
    return spec.input.required[inputName];
  }
  if (isObject(spec?.input?.optional) && Object.prototype.hasOwnProperty.call(spec.input.optional, inputName)) {
    return spec.input.optional[inputName];
  }
  return null;
}

function getPortType(spec, inputName) {
  const inputSpec = getInputSpec(spec, inputName);
  const rawType = Array.isArray(inputSpec) ? inputSpec[0] : inputSpec;
  if (Array.isArray(rawType)) {
    return "COMBO";
  }
  return typeof rawType === "string" && rawType.length > 0 ? rawType : "*";
}

function exposesWidgetPort(portType) {
  return portType === "INT" || portType === "FLOAT" || portType === "STRING" || portType === "BOOLEAN";
}

function collectWidgetValues(nodeSpec, nodeInputs) {
  const values = [];
  for (const inputName of getOrderedInputNames(nodeSpec)) {
    if (!Object.prototype.hasOwnProperty.call(nodeInputs, inputName)) {
      continue;
    }
    const inputValue = nodeInputs[inputName];
    if (isLinkValue(inputValue)) {
      continue;
    }
    values.push(inputValue);
    const inputSpec = getInputSpec(nodeSpec, inputName);
    const inputOptions = Array.isArray(inputSpec) && isObject(inputSpec[1]) ? inputSpec[1] : null;
    if (inputOptions?.control_after_generate === true) {
      values.push("fixed");
    }
  }
  return values;
}

function getNodeSize(classType, inputCount, outputCount, widgetCount) {
  if (classType === "CLIPTextEncode" || classType === "CLIPTextEncodeFlux") {
    return [420, 188];
  }
  if (classType === "SaveImage") {
    return [320, 94];
  }
  const width = 315;
  const height = 72 + inputCount * 26 + outputCount * 22 + Math.max(widgetCount - inputCount, 0) * 22;
  return [width, Math.max(height, 82)];
}

function buildWorkflowSummaryNote(context, noteId, order) {
  const lines = [
    "eraser-cat-studio generated workflow",
    `mode: ${context.mode}`,
    `view: ${context.view}`,
    `qualityProfile: ${context.qualityProfile.id}`,
    `sampler: ${context.qualityProfile.sampler}`,
    `scheduler: ${context.qualityProfile.scheduler}`,
    `steps: ${context.qualityProfile.steps}`,
    `cfg: ${context.qualityProfile.cfg}`,
    `resolution: ${context.qualityProfile.width}x${context.qualityProfile.height}`
  ];

  return {
    id: noteId,
    type: "Note",
    pos: [48, 16],
    size: { 0: 320, 1: 192 },
    flags: {},
    order,
    mode: 0,
    properties: {
      text: ""
    },
    widgets_values: [lines.join("\n")],
    color: "#24364a",
    bgcolor: "#35536d"
  };
}

function buildWorkflowGui(prompt, objectInfo, context) {
  const nodeIds = Object.keys(prompt)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => left - right);

  const predecessors = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
  for (const nodeId of nodeIds) {
    const nodeInputs = isObject(prompt[String(nodeId)]?.inputs) ? prompt[String(nodeId)].inputs : {};
    for (const inputValue of Object.values(nodeInputs)) {
      if (!isLinkValue(inputValue)) {
        continue;
      }
      const sourceId = Number.parseInt(String(inputValue[0]), 10);
      if (Number.isInteger(sourceId) && predecessors.has(nodeId)) {
        predecessors.get(nodeId).add(sourceId);
      }
    }
  }

  const depthCache = new Map();
  const visitDepth = (nodeId) => {
    if (depthCache.has(nodeId)) {
      return depthCache.get(nodeId);
    }
    const parents = predecessors.get(nodeId);
    const depth = !parents || parents.size === 0 ? 0 : Math.max(...Array.from(parents, (parentId) => visitDepth(parentId))) + 1;
    depthCache.set(nodeId, depth);
    return depth;
  };

  const rowByDepth = new Map();
  const guiNodesById = new Map();
  const pendingLinks = [];

  for (const nodeId of nodeIds) {
    const rawNode = prompt[String(nodeId)];
    const classType = typeof rawNode?.class_type === "string" ? rawNode.class_type : "UnknownNode";
    const nodeSpec = getNodeSpec(objectInfo, classType);
    const nodeInputs = isObject(rawNode?.inputs) ? rawNode.inputs : {};
    const orderedInputs = getOrderedInputNames(nodeSpec);
    const guiInputs = [];

    let visibleInputSlot = 0;
    for (const inputName of orderedInputs) {
      if (!Object.prototype.hasOwnProperty.call(nodeInputs, inputName)) {
        continue;
      }
      const inputValue = nodeInputs[inputName];
      if (!isLinkValue(inputValue)) {
        continue;
      }
      const portType = getPortType(nodeSpec, inputName);
      const inputEntry = {
        name: inputName,
        type: portType,
        link: null,
        slot_index: visibleInputSlot
      };
      if (exposesWidgetPort(portType)) {
        inputEntry.widget = { name: inputName };
      }
      guiInputs.push(inputEntry);
      pendingLinks.push({
        sourceId: Number.parseInt(String(inputValue[0]), 10),
        sourceSlot: Number.parseInt(String(inputValue[1]), 10),
        targetId: nodeId,
        targetSlot: visibleInputSlot
      });
      visibleInputSlot += 1;
    }

    const outputTypes = Array.isArray(nodeSpec?.output) ? nodeSpec.output : [];
    const outputNames =
      Array.isArray(nodeSpec?.output_name) && nodeSpec.output_name.length > 0 ? nodeSpec.output_name : outputTypes;
    const guiOutputs = outputNames.map((outputName, outputIndex) => ({
      name:
        typeof outputName === "string" && outputName.length > 0 ? outputName : `output_${outputIndex}`,
      type:
        typeof outputTypes[outputIndex] === "string" && outputTypes[outputIndex].length > 0
          ? outputTypes[outputIndex]
          : "*",
      links: [],
      shape: 3,
      slot_index: outputIndex
    }));

    const widgetValues = collectWidgetValues(nodeSpec, nodeInputs);
    const depth = visitDepth(nodeId);
    const row = rowByDepth.get(depth) ?? 0;
    rowByDepth.set(depth, row + 1);
    const [width, height] = getNodeSize(classType, guiInputs.length, guiOutputs.length, widgetValues.length);

    const guiNode = {
      id: nodeId,
      type: classType,
      pos: [48 + depth * 360, 256 + row * 196],
      size: { 0: width, 1: height },
      flags: {},
      order: guiNodesById.size,
      mode: 0,
      properties: {
        "Node name for S&R": classType
      }
    };

    if (guiInputs.length > 0) {
      guiNode.inputs = guiInputs;
    }
    if (guiOutputs.length > 0) {
      guiNode.outputs = guiOutputs;
    }
    if (widgetValues.length > 0) {
      guiNode.widgets_values = widgetValues;
    }
    if (typeof nodeSpec?.display_name === "string" && nodeSpec.display_name.length > 0 && nodeSpec.display_name !== classType) {
      guiNode.title = nodeSpec.display_name;
    }

    guiNodesById.set(nodeId, guiNode);
  }

  const links = [];
  let nextLinkId = 1;

  for (const link of pendingLinks) {
    const sourceNode = guiNodesById.get(link.sourceId);
    const targetNode = guiNodesById.get(link.targetId);
    if (!sourceNode || !targetNode || !Array.isArray(sourceNode.outputs) || !Array.isArray(targetNode.inputs)) {
      continue;
    }
    const sourceOutput = sourceNode.outputs[link.sourceSlot];
    const targetInput = targetNode.inputs[link.targetSlot];
    if (!sourceOutput || !targetInput) {
      continue;
    }
    sourceOutput.links.push(nextLinkId);
    targetInput.link = nextLinkId;
    links.push([
      nextLinkId,
      link.sourceId,
      link.sourceSlot,
      link.targetId,
      link.targetSlot,
      sourceOutput.type || targetInput.type || "*"
    ]);
    nextLinkId += 1;
  }

  const noteId = (nodeIds.at(-1) ?? 0) + 1;
  const guiNodes = [
    buildWorkflowSummaryNote(context, noteId, guiNodesById.size),
    ...nodeIds.map((nodeId) => guiNodesById.get(nodeId))
  ];

  return {
    last_node_id: noteId,
    last_link_id: nextLinkId - 1,
    nodes: guiNodes,
    links,
    groups: [],
    config: {},
    extra: {
      ds: {
        scale: 1,
        offset: [0, 0]
      },
      groupNodes: {}
    },
    version: 0.4
  };
}

async function waitForPromptResult(promptId) {
  const deadline = Date.now() + COMFY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const history = await fetchJson(`${COMFY_SERVER_URL}/history/${encodeURIComponent(promptId)}`);
    const item = history?.[promptId];
    const outputs = item?.outputs;
    if (isObject(outputs)) {
      for (const candidate of Object.values(outputs)) {
        const images = candidate?.images;
        if (Array.isArray(images) && images.length > 0 && isObject(images[0])) {
          return images[0];
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ComfyUI prompt result: ${promptId}`);
}

async function generateCharacterView(payload) {
  const view = typeof payload.view === "string" ? payload.view : "front";
  const seed = Number.isFinite(Number(payload.seed)) ? Number(payload.seed) : 101;
  const positivePrompt = typeof payload.prompt === "string" && payload.prompt.trim().length > 0
    ? payload.prompt.trim()
    : "friendly orange cat mascot";
  const viewPrompt = typeof payload.viewPrompt === "string" && payload.viewPrompt.trim().length > 0
    ? payload.viewPrompt.trim()
    : positivePrompt;
  const negativePrompt = typeof payload.negativePrompt === "string"
    ? payload.negativePrompt
    : "";
  const qualityProfile = resolveQualityProfile(payload);
  const workflowStage = asString(payload.workflowStage);
  const workflowTemplateVersion = asString(payload.workflowTemplateVersion);
  const stageTemplateManifest = resolveStageTemplateManifest(workflowStage, workflowTemplateVersion);
  if (workflowStage && !stageTemplateManifest.manifest) {
    throw new Error(
      `Stage template manifest missing for ${workflowStage || "unknown"}:${workflowTemplateVersion || "unknown"}`
    );
  }
  const stageRuntimeContract = resolveStageRuntimeContract(stageTemplateManifest.manifest, view);
  const stagePlan = isObject(payload.stagePlan) ? payload.stagePlan : null;
  const poseSettings = resolvePoseSettings(payload);
  const referenceMode = asString(payload.referenceMode, COMFY_REFERENCE_MODE).toLowerCase();
  const referenceAsset = materializeReferenceImage(payload);
  const repairMaskAsset = materializeRepairMaskImage(payload);
  const referenceBank = materializeReferenceBank(payload);
  const poseInput = materializePoseImage(payload);
  const suppliedStructureControls = materializeStructureControls(payload);
  const hasPoseReferencePair = Boolean(poseInput && referenceAsset);
  const referenceInput = referenceMode === "img2img" ? referenceAsset : null;
  const objectInfo = await getObjectInfo();
  const capabilitySnapshot = buildCapabilitySnapshot(objectInfo);
  const stageContractValidation = validateStageRuntimeContract({
    contract: stageRuntimeContract,
    workflowStage,
    referenceMode,
    referenceAssetPresent: Boolean(referenceAsset),
    referenceBank,
    stagePlan,
    view,
    poseSupplied: Boolean(poseInput),
    repairMaskSupplied: Boolean(repairMaskAsset),
    structureControlsSupplied: suppliedStructureControls.map((entry) => entry.kind),
    structureControlEntries: suppliedStructureControls,
    qualityTier: qualityProfile.qualityTier,
    capabilities: {
      poseControl: capabilitySnapshot.hasPoseControl === true,
      latentUpscale:
        capabilitySnapshot.hasLatentUpscaleBy === true || capabilitySnapshot.hasLatentUpscale === true,
      structureControlModels: {
        canny: capabilitySnapshot.hasStructureControlModelCanny === true,
        lineart: capabilitySnapshot.hasStructureControlModelLineart === true,
        depth: capabilitySnapshot.hasStructureControlModelDepth === true
      }
    }
  });
  if (!stageContractValidation.ok) {
    throw new Error(
      `Stage runtime contract failed for ${workflowStage || "unknown"}:${workflowTemplateVersion || "unknown"}: ${stageContractValidation.failures.join(", ")}`
    );
  }
  const flux2Config = resolveFlux2Config(objectInfo);
  const mascotLoraConfig = resolveMascotLoraConfig(payload, qualityProfile, objectInfo);
  const poseConfig =
    hasPoseReferencePair ? resolveCheckpointPoseConfig(objectInfo) : null;
  const ultraConfig = resolveCheckpointUltraConfig(objectInfo, {
    requirePose: hasPoseReferencePair
  });
  const suppliedStructureControlConfig = resolveStructureControlConfig(objectInfo, suppliedStructureControls);
  const preferUltraCheckpoint =
    referenceBank.length > 0 ||
    suppliedStructureControls.length > 0 ||
    workflowStage === "repair_refine" ||
    ((workflowStage === "front_master" ||
      workflowStage === "side_view_base" ||
      workflowStage === "side_view_refine" ||
      workflowStage === "identity_lock_refine" ||
      workflowStage === "view_only") &&
      Boolean(referenceAsset));
  const preferCheckpoint = shouldPreferCheckpointForPayload(payload, qualityProfile) || preferUltraCheckpoint;
  const canUseCheckpoint =
    Array.isArray(objectInfo?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]) &&
    objectInfo.CheckpointLoaderSimple.input.required.ckpt_name[0].length > 0;

  let workflow = null;
  let mode = "checkpoint";
  let checkpointName = null;
  let loraResolved = null;
  let fluxResolved = null;
  let poseResolved = null;
  const warnings = [];

  if (mascotLoraConfig?.warning) {
    warnings.push(mascotLoraConfig.warning);
  }
  if (stageTemplateManifest.warning) {
    warnings.push(stageTemplateManifest.warning);
  }
  warnings.push(...stageContractValidation.warnings);
  warnings.push(...suppliedStructureControlConfig.warnings);

  if (poseInput && !referenceAsset) {
    warnings.push("Pose guide supplied without identity reference. Ignoring pose-guided checkpoint path.");
  }

  if (preferUltraCheckpoint && !ultraConfig.ok) {
    if (stageRuntimeContract.allowBasicCheckpointFallback) {
      warnings.push(ultraConfig.reason);
    } else {
      throw new Error(
        `Stage runtime contract blocked fallback for ${workflowStage || "unknown"}:${workflowTemplateVersion || "unknown"}: ${ultraConfig.reason}`
      );
    }
  }

  const appliedSuppliedStructureKinds = new Set(
    suppliedStructureControlConfig.applied.map((entry) => entry.kind)
  );
  if (
    stageRuntimeContract.structureControlRequirement === "required" &&
    stageRuntimeContract.requiredStructureControlKinds.length > 0
  ) {
    const unresolvedRequiredKinds = differenceStructureControlKinds(
      stageRuntimeContract.requiredStructureControlKinds,
      [...appliedSuppliedStructureKinds]
    );
    if (unresolvedRequiredKinds.length > 0) {
      throw new Error(
        `Stage runtime contract failed for ${workflowStage || "unknown"}:${workflowTemplateVersion || "unknown"}: unresolved_structure_controls:${unresolvedRequiredKinds.join("+")}`
      );
    }
  }

  if (preferUltraCheckpoint && canUseCheckpoint && ultraConfig.ok) {
    const useUltraPose = hasPoseReferencePair && Boolean(ultraConfig.resolved.controlNetName);
    if (!useUltraPose && stageRuntimeContract.poseRequirement === "required" && !stageRuntimeContract.allowPoselessUltraFallback) {
      throw new Error(
        `Stage runtime contract blocked pose-less ultra fallback for ${workflowStage || "unknown"}:${workflowTemplateVersion || "unknown"}`
      );
    }
    const remainingAutoStructureControls =
      isObject(ultraConfig.resolved.structureControls)
        ? Object.fromEntries(
            Object.entries(ultraConfig.resolved.structureControls).filter(
              ([kind]) => !appliedSuppliedStructureKinds.has(kind)
            )
          )
        : {};
    mode = useUltraPose ? "checkpoint-ultra-pose" : workflowStage === "repair_refine" ? "checkpoint-ultra-repair" : "checkpoint-ultra";
    checkpointName = await resolveCheckpointName();
    loraResolved = mascotLoraConfig?.loraName ? mascotLoraConfig : null;
    poseResolved = useUltraPose
      ? {
          controlNetName: ultraConfig.resolved.controlNetName,
          ipAdapterPreset: ultraConfig.resolved.ipAdapterPreset
        }
      : null;
    workflow = buildCheckpointUltraWorkflow({
      objectInfo,
      checkpointName,
      view,
      seed,
      positivePrompt,
      viewPrompt,
      negativePrompt,
      qualityProfile,
      workflowStage,
      referenceFileName: referenceInput?.fileName ?? referenceAsset?.fileName,
      repairMaskFileName: workflowStage === "repair_refine" ? repairMaskAsset?.fileName : null,
      referenceDenoise: referenceInput?.denoise ?? referenceAsset?.denoise,
      referenceEntries: referenceBank,
      stageRuntimeContract,
      ultraFeatures: {
        ...ultraConfig.resolved,
        structureControls: remainingAutoStructureControls
      },
      structureControls: suppliedStructureControlConfig.applied,
      ipAdapterPreset: ultraConfig.resolved.ipAdapterPreset,
      poseFileName: useUltraPose ? poseInput?.fileName : null,
      controlNetName: useUltraPose ? ultraConfig.resolved.controlNetName : null,
      poseSettings: {
        ...poseSettings,
        ipAdapterPreset: ultraConfig.resolved.ipAdapterPreset,
        controlNetName: useUltraPose ? ultraConfig.resolved.controlNetName : null
      },
      loraName: loraResolved?.loraName,
      loraStrengthModel: loraResolved?.strengthModel,
      loraStrengthClip: loraResolved?.strengthClip
    });
  }

  if (!workflow && hasPoseReferencePair) {
    if (!canUseCheckpoint) {
      warnings.push("Pose guide supplied but no compatible checkpoint loader is available. Falling back to default workflow.");
    } else if (!poseConfig?.ok) {
      if (stageRuntimeContract.strictPoseCapabilityWhenRequired || stageRuntimeContract.poseRequirement === "required") {
        throw new Error(
          `Stage runtime contract blocked pose fallback for ${workflowStage || "unknown"}:${workflowTemplateVersion || "unknown"}: ${poseConfig?.reason ?? "pose-guided checkpoint path unavailable"}`
        );
      }
      warnings.push(poseConfig?.reason ?? "Pose-guided checkpoint path is not available. Falling back to default workflow.");
    } else {
      mode = "checkpoint-ipadapter-openpose";
      checkpointName = await resolveCheckpointName();
      poseResolved = poseConfig.resolved;
      workflow = buildCheckpointPoseWorkflow({
        checkpointName,
        controlNetName: poseResolved.controlNetName,
        view,
        seed,
        positivePrompt,
        viewPrompt,
        negativePrompt,
        qualityProfile,
        referenceFileName: referenceAsset.fileName,
        poseFileName: poseInput.fileName,
        poseSettings: {
          ...poseSettings,
          ipAdapterPreset: poseResolved.ipAdapterPreset,
          controlNetName: poseResolved.controlNetName
        }
      });
    }
  }

  if (!workflow && !preferCheckpoint && (COMFY_ADAPTER_MODE === "flux2" || COMFY_ADAPTER_MODE === "auto")) {
    if (flux2Config.ok) {
      mode = "flux2";
      fluxResolved = flux2Config.resolved;
      if (flux2Config.warning) {
        warnings.push(flux2Config.warning);
      }
      workflow =
        fluxResolved.mode === "flux2-qwen"
          ? buildFlux2QwenWorkflow({
              ...fluxResolved,
              view,
              seed,
              positivePrompt,
              viewPrompt,
              negativePrompt,
              qualityProfile,
              referenceFileName: referenceInput?.fileName,
              referenceDenoise: referenceInput?.denoise
            })
          : buildFlux2ClassicWorkflow({
              ...fluxResolved,
              view,
              seed,
              positivePrompt,
              viewPrompt,
              negativePrompt,
              qualityProfile,
              referenceFileName: referenceInput?.fileName,
              referenceDenoise: referenceInput?.denoise
            });
    } else if (COMFY_ADAPTER_MODE === "flux2") {
      throw new Error(`flux2 mode is enabled but not ready: ${flux2Config.reason}`);
    }
  }

  if (!workflow) {
    if (preferCheckpoint || COMFY_ADAPTER_MODE === "checkpoint" || COMFY_ADAPTER_MODE === "auto") {
      if (preferUltraCheckpoint && !stageRuntimeContract.allowBasicCheckpointFallback) {
        throw new Error(
          `Stage runtime contract requires ultra checkpoint path for ${workflowStage || "unknown"}:${workflowTemplateVersion || "unknown"}`
        );
      }
      if (!canUseCheckpoint) {
        throw new Error(
          `No compatible workflow path is ready. flux2: ${flux2Config.reason}. checkpoint: none found in object_info`
        );
      }
      mode = "checkpoint";
      checkpointName = await resolveCheckpointName();
      if (preferCheckpoint) {
        warnings.push("Mascot production profile prefers checkpoint workflow over flux2.");
      }
      loraResolved = mascotLoraConfig?.loraName ? mascotLoraConfig : null;
      workflow = buildCheckpointWorkflow({
        checkpointName,
        view,
        seed,
        positivePrompt,
        viewPrompt,
        negativePrompt,
        qualityProfile,
        loraName: loraResolved?.loraName,
        loraStrengthModel: loraResolved?.strengthModel,
        loraStrengthClip: loraResolved?.strengthClip,
        referenceFileName: referenceInput?.fileName,
        referenceDenoise: referenceInput?.denoise
      });
    } else {
      throw new Error(`Unsupported COMFY_ADAPTER_MODE: ${COMFY_ADAPTER_MODE}`);
    }
  }

  const warning = warnings.filter((entry) => typeof entry === "string" && entry.length > 0).join(" | ") || null;
  const poseApplied = mode === "checkpoint-ipadapter-openpose" || mode === "checkpoint-ultra-pose";
  const effectiveReferenceFileName = referenceInput?.fileName ?? referenceAsset?.fileName ?? null;
  const referenceBankSummary = summarizeReferenceBank(referenceBank);
  const referenceImageSourcesByRole = new Map();
  if (effectiveReferenceFileName) {
    referenceImageSourcesByRole.set("subject", {
      ref: [0, 0],
      id: "subject",
      view: asString(view)
    });
  }
  for (const entry of referenceBank) {
    if (!entry?.role || !entry?.imageBase64) {
      continue;
    }
    if (!referenceImageSourcesByRole.has(entry.role)) {
      referenceImageSourcesByRole.set(entry.role, {
        ref: [0, 0],
        id: entry.id,
        view: entry.view
      });
    }
  }
  const autoStructureControlPlans =
    ultraConfig.ok && isObject(ultraConfig.resolved.structureControls)
      ? resolveStructureControlPlans({
          workflowStage,
          stageRuntimeContract,
          structureControls: Object.fromEntries(
            Object.entries(ultraConfig.resolved.structureControls).filter(
              ([kind]) => !appliedSuppliedStructureKinds.has(kind)
            )
          ),
          referenceImageSourcesByRole,
          repairBaseImageRef: workflowStage === "repair_refine" && effectiveReferenceFileName ? [0, 0] : null,
          repairBaseSourceId: referenceBank.find((entry) => entry?.role === "repair_base")?.id,
          repairBaseSourceView: referenceBank.find((entry) => entry?.role === "repair_base")?.view
        })
      : [];
  const mergedStructureControlEntries = [
    ...suppliedStructureControlConfig.applied.map((entry) => ({
      kind: entry.kind,
      strength: entry.strength,
      startPercent: entry.startPercent,
      endPercent: entry.endPercent,
      sourceRole: entry.sourceRole,
      sourceRefId: entry.sourceRefId,
      sourceView: entry.sourceView
    })),
    ...autoStructureControlPlans.map((plan) => ({
      kind: plan.mode,
      strength: plan.strength,
      startPercent: plan.startPercent,
      endPercent: plan.endPercent,
      sourceRole: plan.sourceRole,
      sourceRefId: plan.sourceRefId,
      sourceView: plan.sourceView
    }))
  ];
  const mergedStageContractValidation = validateStageRuntimeContract({
    contract: stageRuntimeContract,
    workflowStage,
    referenceMode,
    referenceAssetPresent: Boolean(referenceAsset),
    referenceBank,
    stagePlan,
    view,
    poseSupplied: Boolean(poseInput),
    repairMaskSupplied: Boolean(repairMaskAsset),
    structureControlsSupplied: mergedStructureControlEntries.map((entry) => entry.kind),
    structureControlEntries: mergedStructureControlEntries,
    qualityTier: qualityProfile.qualityTier,
    capabilities: {
      poseControl: capabilitySnapshot.hasPoseControl === true,
      latentUpscale:
        capabilitySnapshot.hasLatentUpscaleBy === true || capabilitySnapshot.hasLatentUpscale === true,
      structureControlModels: {
        canny: capabilitySnapshot.hasStructureControlModelCanny === true,
        lineart: capabilitySnapshot.hasStructureControlModelLineart === true,
        depth: capabilitySnapshot.hasStructureControlModelDepth === true
      }
    }
  });
  if (!mergedStageContractValidation.ok) {
    throw new Error(
      `Merged stage runtime contract failed for ${workflowStage || "unknown"}:${workflowTemplateVersion || "unknown"}: ${mergedStageContractValidation.failures.join(", ")}`
    );
  }
  const structureControlSummary = [
    ...suppliedStructureControlConfig.applied.map((entry) => ({
      type: entry.kind,
      ...(typeof entry.strength === "number" ? { strength: entry.strength } : {}),
      ...(typeof entry.startPercent === "number" ? { startPercent: entry.startPercent } : {}),
      ...(typeof entry.endPercent === "number" ? { endPercent: entry.endPercent } : {}),
      ...(typeof entry.controlNetName === "string" ? { controlNetName: entry.controlNetName } : {}),
      ...(typeof entry.note === "string" && entry.note.length > 0 ? { note: entry.note } : {}),
      ...(typeof entry.sourceRole === "string" && entry.sourceRole.length > 0 ? { sourceRole: entry.sourceRole } : {}),
      ...(typeof entry.sourceRefId === "string" && entry.sourceRefId.length > 0 ? { sourceRefId: entry.sourceRefId } : {}),
      ...(typeof entry.sourceView === "string" && entry.sourceView.length > 0 ? { sourceView: entry.sourceView } : {}),
      source: "supplied"
    })),
    ...autoStructureControlPlans.map((plan) => ({
      type: plan.mode,
      ...(typeof plan.strength === "number" ? { strength: plan.strength } : {}),
      ...(typeof plan.startPercent === "number" ? { startPercent: plan.startPercent } : {}),
      ...(typeof plan.endPercent === "number" ? { endPercent: plan.endPercent } : {}),
      ...(typeof plan.controlNetName === "string" ? { controlNetName: plan.controlNetName } : {}),
      ...(typeof plan.preprocessorClass === "string" && plan.preprocessorClass.length > 0
        ? { note: `auto:${plan.preprocessorClass}` }
        : {}),
      ...(typeof plan.sourceRole === "string" && plan.sourceRole.length > 0 ? { sourceRole: plan.sourceRole } : {}),
      ...(typeof plan.sourceRefId === "string" && plan.sourceRefId.length > 0 ? { sourceRefId: plan.sourceRefId } : {}),
      ...(typeof plan.sourceView === "string" && plan.sourceView.length > 0 ? { sourceView: plan.sourceView } : {}),
      source: "reference_preprocessor"
    }))
  ];
  const structureControlsApplied = [...new Set(structureControlSummary.map((entry) => entry.type))];
  const structureControlDiagnostics = {
    requiredKinds: stageRuntimeContract.requiredStructureControlKinds,
    suppliedKinds: suppliedStructureControls.map((entry) => entry.kind),
    appliedKinds: structureControlsApplied,
    appliedSuppliedKinds: [
      ...new Set(
        structureControlSummary.filter((entry) => entry.source === "supplied").map((entry) => entry.type)
      )
    ],
    appliedAutoKinds: [
      ...new Set(
        structureControlSummary
          .filter((entry) => entry.source === "reference_preprocessor")
          .map((entry) => entry.type)
      )
    ],
    missingRequiredKinds: differenceStructureControlKinds(
      stageRuntimeContract.requiredStructureControlKinds,
      structureControlsApplied
    ),
    sourceRolesByKind: Object.fromEntries(
      ["lineart", "canny", "depth"]
        .map((kind) => [
          kind,
          [...new Set(
            structureControlSummary
              .filter((entry) => entry.type === kind && typeof entry.sourceRole === "string" && entry.sourceRole.length > 0)
              .map((entry) => entry.sourceRole)
          )]
        ])
        .filter(([, roles]) => Array.isArray(roles) && roles.length > 0)
    ),
    sourceRefsByKind: Object.fromEntries(
      ["lineart", "canny", "depth"]
        .map((kind) => [
          kind,
          [...new Set(
            structureControlSummary
              .filter((entry) => entry.type === kind && typeof entry.sourceRefId === "string" && entry.sourceRefId.length > 0)
              .map((entry) => entry.sourceRefId)
          )]
        ])
        .filter(([, refs]) => Array.isArray(refs) && refs.length > 0)
    )
  };
  const preflightDiagnostics = {
    ok: stageContractValidation.ok && mergedStageContractValidation.ok,
    warnings: dedupeStrings([...(stageContractValidation.warnings ?? []), ...(mergedStageContractValidation.warnings ?? [])]),
    requiredReferenceRoles: stageRuntimeContract.requiredReferenceRoles,
    requiredStructureControlKinds: stageRuntimeContract.requiredStructureControlKinds,
    approvedViews: stageRuntimeContract.approvedViews,
    provenancePolicy: {
      requireTraceFields: stageRuntimeContract.requireStructureControlSourceTraceFields,
      requireSourceRefInReferenceBank: stageRuntimeContract.requireStructureControlSourceRefInReferenceBank,
      requireSourceRoleMatchReferenceRole: stageRuntimeContract.requireStructureControlSourceRoleMatchReferenceRole,
      requireSourceViewMatchReferenceView: stageRuntimeContract.requireStructureControlSourceViewMatchReferenceView
    }
  };
  const routeDecision = {
    preferUltraCheckpoint,
    preferCheckpoint,
    canUseCheckpoint,
    ultraReady: ultraConfig.ok,
    fluxReady: flux2Config.ok,
    selectedMode: mode,
    fallbackUsed: preferUltraCheckpoint === true && !String(mode).startsWith("checkpoint-ultra")
  };

  const workflowGui = buildWorkflowGui(workflow, objectInfo, {
    mode,
    view,
    qualityProfile
  });

  const queued = await fetchJson(`${COMFY_SERVER_URL}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: randomUUID(),
      prompt: workflow
    })
  });

  const promptId = queued?.prompt_id;
  if (typeof promptId !== "string" || promptId.length === 0) {
    throw new Error("ComfyUI did not return prompt_id");
  }

  const imageInfo = await waitForPromptResult(promptId);
  const fileName = typeof imageInfo.filename === "string" ? imageInfo.filename : "";
  const subfolder = typeof imageInfo.subfolder === "string" ? imageInfo.subfolder : "";
  const type = typeof imageInfo.type === "string" ? imageInfo.type : "output";
  if (!fileName) {
    throw new Error("ComfyUI history did not include filename");
  }

  const viewUrl =
    `${COMFY_SERVER_URL}/view?filename=${encodeURIComponent(fileName)}` +
    `&subfolder=${encodeURIComponent(subfolder)}` +
    `&type=${encodeURIComponent(type)}`;

  const image = await fetchBuffer(viewUrl);
  if (image.data.length === 0) {
    throw new Error("ComfyUI returned empty image data");
  }

  return {
    imageBase64: image.data.toString("base64"),
    mimeType: image.contentType,
    seed,
    workflowHash: hashWorkflowIdentity({
      provider: "comfyui-adapter",
      mode,
      checkpointName,
      loraResolved,
      fluxResolved,
      poseResolved,
      poseSettings: poseApplied
        ? {
            poseStrength: poseSettings.poseStrength,
            poseEndPercent: poseSettings.poseEndPercent,
            openposeResolution: poseSettings.openposeResolution,
            ipAdapterWeight: poseSettings.ipAdapterWeight,
            ipAdapterPreset: poseResolved?.ipAdapterPreset ?? poseSettings.ipAdapterPreset,
            controlNetName: poseResolved?.controlNetName ?? poseSettings.controlNetName
          }
        : null,
      steps: qualityProfile.steps,
      cfg: qualityProfile.cfg,
      sampler: qualityProfile.sampler,
      scheduler: qualityProfile.scheduler,
      width: qualityProfile.width,
      height: qualityProfile.height,
      qualityProfileId: qualityProfile.id,
      workflowStage,
      workflowTemplateVersion,
      referenceMode,
      referenceFileName: effectiveReferenceFileName,
      repairMaskFileName: workflowStage === "repair_refine" ? repairMaskAsset?.fileName ?? null : null,
      referenceDenoise: referenceInput?.denoise ?? referenceAsset?.denoise ?? null,
      referenceBank: referenceBankSummary,
      structureControls: structureControlSummary,
      structureControlsApplied,
      runtimeContract: stageRuntimeContract
    }),
    meta: {
      promptId,
      fileName,
      subfolder,
      type,
      mode,
      workflowStage,
      workflowTemplateVersion,
      templateManifestPath: stageTemplateManifest.manifestPath,
      templateManifest: stageTemplateManifest.manifest,
      runtimeContract: stageRuntimeContract,
      stagePlan,
      checkpointName,
      loraName: loraResolved?.loraName ?? null,
      loraStrengthModel: loraResolved?.strengthModel ?? null,
      loraStrengthClip: loraResolved?.strengthClip ?? null,
      fluxResolved,
      poseApplied,
      poseFileName: poseInput?.fileName ?? null,
      poseControlNetName: poseResolved?.controlNetName ?? null,
      posePreset: poseResolved?.ipAdapterPreset ?? null,
      poseSettings:
        poseApplied
          ? {
              poseStrength: poseSettings.poseStrength,
              poseEndPercent: poseSettings.poseEndPercent,
              openposeResolution: poseSettings.openposeResolution,
              ipAdapterWeight: poseSettings.ipAdapterWeight,
              ipAdapterPreset: poseResolved?.ipAdapterPreset ?? poseSettings.ipAdapterPreset,
              controlNetName: poseResolved?.controlNetName ?? poseSettings.controlNetName
            }
          : null,
      warning,
      referenceMode,
      referenceApplied: Boolean(effectiveReferenceFileName),
      referenceFileName: effectiveReferenceFileName,
      repairMaskApplied: Boolean(workflowStage === "repair_refine" && ultraConfig.ok && ultraConfig.resolved.repairInpaint),
      repairMaskSource:
        workflowStage === "repair_refine" && ultraConfig.ok && ultraConfig.resolved.repairInpaint
          ? repairMaskAsset?.fileName
            ? "explicit"
            : "reference_alpha"
          : undefined,
      repairMaskFileName: workflowStage === "repair_refine" ? repairMaskAsset?.fileName ?? null : null,
      referenceBankSummary,
      structureControlsSummary: structureControlSummary,
      structureControlApplied: structureControlsApplied.length > 0,
      structureControlsApplied,
      structureControlSummary,
      structureControlDiagnostics,
      preflightDiagnostics,
      routeDecision,
      warnings,
      capabilitySnapshot,
      qualityProfileId: qualityProfile.id,
      targetStyle: qualityProfile.targetStyle,
      qualityTier: qualityProfile.qualityTier,
      viewPrompt,
      runSettings: qualityProfile,
      workflowApi: workflow,
      workflowGui,
      workflowSummary: summarizeWorkflow({
        mode,
        qualityProfile,
        view,
        seed,
        positivePrompt,
        viewPrompt,
        negativePrompt,
        workflowStage,
        workflowTemplateVersion,
        templateManifestPath: stageTemplateManifest.manifestPath,
        templateManifest: stageTemplateManifest.manifest,
        runtimeContract: stageRuntimeContract,
        referenceMode,
        referenceBankSummary,
        structureControlSummary,
        structureControlDiagnostics,
        preflightDiagnostics,
        routeDecision,
        warnings,
        guardrails: payload.guardrails,
        referenceSupplied:
          typeof payload.referenceImageBase64 === "string" && payload.referenceImageBase64.trim().length > 0,
        repairMaskSupplied:
          typeof payload.repairMaskImageBase64 === "string" && payload.repairMaskImageBase64.trim().length > 0,
        structureControls: suppliedStructureControlConfig.applied,
        poseSupplied: typeof payload.poseImageBase64 === "string" && payload.poseImageBase64.trim().length > 0,
        poseApplied,
        capabilitySnapshot,
        structureControlsApplied,
        poseSettings:
          poseApplied
            ? {
                poseStrength: poseSettings.poseStrength,
                poseEndPercent: poseSettings.poseEndPercent,
                openposeResolution: poseSettings.openposeResolution,
                ipAdapterWeight: poseSettings.ipAdapterWeight,
                ipAdapterPreset: poseResolved?.ipAdapterPreset ?? poseSettings.ipAdapterPreset,
                controlNetName: poseResolved?.controlNetName ?? poseSettings.controlNetName
              }
            : null
      })
    }
  };
}

const server = createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = req.url || "/";

  if (method === "GET" && url === "/health") {
    json(res, 200, {
      ok: true,
      status: "ok",
      adapter: "comfy",
      comfyServerUrl: COMFY_SERVER_URL,
      generatedAt: nowIso()
    });
    return;
  }

  if (method === "POST" && url === "/api/generate-character-view") {
    try {
      const body = await readJsonBody(req);
      const result = await generateCharacterView(body);
      json(res, 200, result);
      return;
    } catch (error) {
      json(res, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
      return;
    }
  }

  json(res, 404, { error: "not_found" });
});

server.listen(ADAPTER_PORT, ADAPTER_HOST, () => {
  console.log(
    `[comfy-adapter] listening http://${ADAPTER_HOST}:${ADAPTER_PORT} -> ${COMFY_SERVER_URL} mode=${COMFY_ADAPTER_MODE} timeoutMs=${COMFY_TIMEOUT_MS} checkpoint=${COMFY_CHECKPOINT_NAME || "-"} unet=${COMFY_UNET_NAME} vae=${COMFY_VAE_NAME}`
  );
});
