import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const COMFY_SERVER_URL = (process.env.COMFY_SERVER_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "");
const TARGET_BASE_MODEL =
  process.env.VIDEO_HUNYUAN_I2V_MODEL?.trim() || "hunyuanvideo1.5_720p_i2v_fp16.safetensors";
const TARGET_SR_MODEL =
  process.env.VIDEO_HUNYUAN_SR_MODEL?.trim() || "hunyuanvideo1.5_1080p_sr_distilled_fp16.safetensors";
const TARGET_TEXT_ENCODER_PRIMARY =
  process.env.VIDEO_HUNYUAN_TEXT_ENCODER_PRIMARY?.trim() || "qwen_2.5_vl_7b_fp8_scaled.safetensors";
const TARGET_TEXT_ENCODER_SECONDARY =
  process.env.VIDEO_HUNYUAN_TEXT_ENCODER_SECONDARY?.trim() || "byt5_small_glyphxl_fp16.safetensors";
const TARGET_VAE = process.env.VIDEO_HUNYUAN_VAE?.trim() || "hunyuanvideo15_vae_fp16.safetensors";
const TARGET_CLIP_VISION =
  process.env.VIDEO_HUNYUAN_CLIP_VISION?.trim() || "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors";
const ENABLE_SR = /^(1|true|yes|on|enabled)$/i.test(process.env.VIDEO_HUNYUAN_ENABLE_SR ?? "");
const EXTRA_MODEL_PATHS_FILE =
  process.env.COMFY_EXTRA_MODEL_PATHS_FILE?.trim() ||
  path.join(
    os.homedir(),
    "AppData",
    "Local",
    "Programs",
    "ComfyUI",
    "resources",
    "ComfyUI",
    "extra_model_paths.yaml"
  );
const MODELS_ROOT = process.env.COMFY_MODELS_ROOT?.trim() || "C:\\models";

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
    "CLIPVisionLoader",
    "CLIPVisionEncode",
    "DualCLIPLoader",
    "TextEncodeHunyuanVideo_ImageToVideo",
    "VAELoader",
    "UNETLoader",
    "HunyuanVideo15ImageToVideo",
    "KSampler",
    "VAEDecode",
    "CreateVideo",
    "SaveVideo"
  ];
  const optionalSrNodes = ["HunyuanVideo15SuperResolution", "LatentUpscale"];
  const missingNodes = [
    ...requiredNodes.filter((name) => !hasNode(objectInfo, name)),
    ...(ENABLE_SR ? optionalSrNodes.filter((name) => !hasNode(objectInfo, name)) : [])
  ];

  const diffusionModels = readOptions(objectInfo, ["UNETLoader", "input", "required", "unet_name", 0]);
  const textEncoders = readOptions(objectInfo, ["DualCLIPLoader", "input", "required", "clip_name1", 0]);
  const dualClipTypes = readOptions(objectInfo, ["DualCLIPLoader", "input", "required", "type", 0]);
  const vaes = readOptions(objectInfo, ["VAELoader", "input", "required", "vae_name", 0]);
  const clipVisionModels = readOptions(objectInfo, ["CLIPVisionLoader", "input", "required", "clip_name", 0]);
  const missingModels = [];
  if (!diffusionModels.includes(TARGET_BASE_MODEL)) {
    missingModels.push(`diffusion_models/${TARGET_BASE_MODEL}`);
  }
  if (ENABLE_SR && !diffusionModels.includes(TARGET_SR_MODEL)) {
    missingModels.push(`diffusion_models/${TARGET_SR_MODEL}`);
  }
  if (!textEncoders.includes(TARGET_TEXT_ENCODER_PRIMARY)) {
    missingModels.push(`text_encoders/${TARGET_TEXT_ENCODER_PRIMARY}`);
  }
  if (!textEncoders.includes(TARGET_TEXT_ENCODER_SECONDARY)) {
    missingModels.push(`text_encoders/${TARGET_TEXT_ENCODER_SECONDARY}`);
  }
  if (!dualClipTypes.includes("hunyuan_video_15")) {
    missingModels.push("DualCLIPLoader type=hunyuan_video_15");
  }
  if (!vaes.includes(TARGET_VAE)) {
    missingModels.push(`vae/${TARGET_VAE}`);
  }
  if (!clipVisionModels.includes(TARGET_CLIP_VISION)) {
    missingModels.push(`clip_vision/${TARGET_CLIP_VISION}`);
  }

  const extraModelPathsExists = fs.existsSync(EXTRA_MODEL_PATHS_FILE);
  const extraModelPathsText = extraModelPathsExists ? fs.readFileSync(EXTRA_MODEL_PATHS_FILE, "utf8") : "";
  const modelsRootRecognized =
    extraModelPathsText.includes(`base_path: ${MODELS_ROOT}`) ||
    extraModelPathsText.includes(`base_path: ${MODELS_ROOT.replace(/\\/g, "/")}`);

  const report = {
    comfyServerUrl: COMFY_SERVER_URL,
    modelsRoot: {
      expected: MODELS_ROOT,
      extraModelPathsFile: EXTRA_MODEL_PATHS_FILE,
      exists: extraModelPathsExists,
      recognized: modelsRootRecognized
    },
    target: {
      baseModel: TARGET_BASE_MODEL,
      srModel: ENABLE_SR ? TARGET_SR_MODEL : null,
      textEncoderPrimary: TARGET_TEXT_ENCODER_PRIMARY,
      textEncoderSecondary: TARGET_TEXT_ENCODER_SECONDARY,
      vae: TARGET_VAE,
      clipVision: TARGET_CLIP_VISION,
      srEnabled: ENABLE_SR
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
        dualClipTypes,
        vaes,
        clipVisionModels
      }
    }
  };

  console.log(JSON.stringify(report, null, 2));

  if (!modelsRootRecognized || missingNodes.length > 0 || missingModels.length > 0) {
    console.error("\n[comfy:hunyuan:preflight] Missing requirements detected.");
    console.error("[comfy:hunyuan:preflight] Check extra_model_paths.yaml and installed HunyuanVideo 1.5 models.");
    process.exit(1);
  }

  console.log("\n[comfy:hunyuan:preflight] OK - HunyuanVideo 1.5 I2V requirements are ready.");
}

main().catch((error) => {
  console.error(`[comfy:hunyuan:preflight] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
