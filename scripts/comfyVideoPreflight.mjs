import fs from "node:fs";
import path from "node:path";

const COMFY_SERVER_URL = (process.env.COMFY_SERVER_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "");
const REPO_ROOT = process.cwd();
const TARGET_MODEL = process.env.VIDEO_BROLL_WAN_MODEL?.trim() || "wan2.2_ti2v_5B_fp16.safetensors";
const TARGET_TEXT_ENCODER =
  process.env.VIDEO_BROLL_WAN_TEXT_ENCODER?.trim() || "umt5_xxl_fp8_e4m3fn_scaled.safetensors";
const TARGET_VAE = process.env.VIDEO_BROLL_WAN_VAE?.trim() || "wan2.2_vae.safetensors";
const TARGET_CLIP_VISION = process.env.VIDEO_BROLL_WAN_CLIP_VISION?.trim() || "clip_vision_h.safetensors";
const USE_CLIP_VISION = /^(1|true|yes|on|enabled)$/i.test(process.env.VIDEO_BROLL_WAN_USE_CLIP_VISION ?? "");

function resolveDefaultCatQualityReferenceImage(repoRoot) {
  const dirPath = path.join(repoRoot, "refs", "cat_quality_input", "01_main_style");
  if (!fs.existsSync(dirPath)) {
    return path.join(repoRoot, "refs", "cat_quality_input");
  }

  const imageName = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        [".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(entry.name).toLowerCase())
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"))[0];

  return imageName ? path.join(dirPath, imageName) : dirPath;
}

const REFERENCE_IMAGE =
  process.env.VIDEO_BROLL_REFERENCE_IMAGE?.trim() ||
  resolveDefaultCatQualityReferenceImage(REPO_ROOT);

function hasNode(objectInfo, name) {
  return typeof objectInfo?.[name] === "object" && objectInfo[name] !== null;
}

function readOptions(objectInfo, pathKeys) {
  let cursor = objectInfo;
  for (const key of pathKeys) {
    cursor = cursor?.[key];
  }
  return Array.isArray(cursor) ? cursor : [];
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 300)}`);
  }
  return data;
}

async function main() {
  const objectInfo = await fetchJson(`${COMFY_SERVER_URL}/object_info`);
  const requiredNodes = [
    "LoadImage",
    "UNETLoader",
    "CLIPLoader",
    "CLIPTextEncode",
    "VAELoader",
    "ModelSamplingSD3",
    "WanImageToVideo",
    "KSampler",
    "VAEDecode",
    "CreateVideo",
    "SaveVideo"
  ];
  const missingNodes = requiredNodes.filter((name) => !hasNode(objectInfo, name));
  const diffusionModels = readOptions(objectInfo, ["UNETLoader", "input", "required", "unet_name", 0]);
  const textEncoders = readOptions(objectInfo, ["CLIPLoader", "input", "required", "clip_name", 0]);
  const clipLoaderTypes = readOptions(objectInfo, ["CLIPLoader", "input", "required", "type", 0]);
  const vaes = readOptions(objectInfo, ["VAELoader", "input", "required", "vae_name", 0]);
  const clipVisionModels = readOptions(objectInfo, ["CLIPVisionLoader", "input", "required", "clip_name", 0]);

  const missingModels = [];
  if (!diffusionModels.includes(TARGET_MODEL)) {
    missingModels.push(`diffusion_models/${TARGET_MODEL}`);
  }
  if (!textEncoders.includes(TARGET_TEXT_ENCODER)) {
    missingModels.push(`text_encoders/${TARGET_TEXT_ENCODER}`);
  }
  if (!clipLoaderTypes.includes("wan")) {
    missingModels.push("CLIPLoader type=wan");
  }
  if (!vaes.includes(TARGET_VAE)) {
    missingModels.push(`vae/${TARGET_VAE}`);
  }
  if (USE_CLIP_VISION && !clipVisionModels.includes(TARGET_CLIP_VISION)) {
    missingModels.push(`clip_vision/${TARGET_CLIP_VISION}`);
  }
  if (!REFERENCE_IMAGE) {
    missingModels.push("reference_image:unset");
  }

  const report = {
    comfyServerUrl: COMFY_SERVER_URL,
    target: {
      model: TARGET_MODEL,
      textEncoder: TARGET_TEXT_ENCODER,
      vae: TARGET_VAE,
      clipVision: USE_CLIP_VISION ? TARGET_CLIP_VISION : null,
      referenceImage: REFERENCE_IMAGE
    },
    nodes: {
      ok: missingNodes.length === 0,
      missing: missingNodes
    },
    models: {
      ok: missingModels.length === 0,
      missing: missingModels,
      available: {
        diffusionModels,
        textEncoders,
        clipLoaderTypes,
        vaes,
        clipVisionModels
      }
    },
    installCommand: "pnpm comfy:download:video-broll"
  };

  console.log(JSON.stringify(report, null, 2));

  if (missingNodes.length > 0 || missingModels.length > 0) {
    console.error("\n[comfy:video:preflight] Missing requirements detected.");
    console.error("[comfy:video:preflight] Next: pnpm comfy:download:video-broll");
    process.exit(1);
  }

  console.log("\n[comfy:video:preflight] OK - Wan video sidecar requirements are ready.");
}

main().catch((error) => {
  console.error(`[comfy:video:preflight] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
