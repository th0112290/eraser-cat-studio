import { existsSync } from "node:fs";
import path from "node:path";

const COMFY_SERVER_URL = (process.env.COMFY_SERVER_URL?.trim() || "http://127.0.0.1:8000").replace(/\/+$/, "");
const TARGET_UNET = process.env.COMFY_UNET_NAME?.trim() || "flux-2-klein-base-4b-fp8.safetensors";
const TARGET_VAE = process.env.COMFY_VAE_NAME?.trim() || "flux2-vae.safetensors";
const TARGET_QWEN = process.env.COMFY_QWEN_NAME?.trim() || "qwen_3_4b.safetensors";
const TARGET_CLIP_L = process.env.COMFY_CLIP_L_NAME?.trim() || "clip_l.safetensors";
const TARGET_T5 = process.env.COMFY_T5_NAME?.trim() || "t5xxl_fp16.safetensors";
const TARGET_POSE_CONTROLNET =
  process.env.COMFY_POSE_CONTROLNET_NAME?.trim() || "control-lora-openposeXL2-rank256.safetensors";
const TARGET_CANNY_CONTROLNET =
  process.env.COMFY_CANNY_CONTROLNET_NAME?.trim() || "controlnet-canny.safetensors";
const TARGET_LINEART_CONTROLNET =
  process.env.COMFY_LINEART_CONTROLNET_NAME?.trim() || "controlnet-lineart.safetensors";
const TARGET_DEPTH_CONTROLNET =
  process.env.COMFY_DEPTH_CONTROLNET_NAME?.trim() || "controlnet-depth.safetensors";
const REQUIRE_ULTRA = !["false", "0", "no", "off"].includes(
  (process.env.COMFY_PREFLIGHT_REQUIRE_ULTRA ?? "false").trim().toLowerCase()
);
const LOCALAPPDATA = process.env.LOCALAPPDATA?.trim() || "";
const TEXT_ENCODER_DIR =
  process.env.COMFY_TEXT_ENCODER_DIR?.trim() ||
  (LOCALAPPDATA
    ? path.join(LOCALAPPDATA, "Programs", "ComfyUI", "resources", "ComfyUI", "models", "text_encoders")
    : "");
const ALT_TEXT_ENCODER_DIR = "C:\\user\\models\\text_encoders";

function hasNode(objectInfo, name) {
  return typeof objectInfo?.[name] === "object" && objectInfo[name] !== null;
}

function readOptions(objectInfo, path) {
  let cursor = objectInfo;
  for (const key of path) {
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
    "UNETLoader",
    "DualCLIPLoader",
    "VAELoader",
    "CLIPTextEncodeFlux",
    "FluxGuidance",
    "EmptyFlux2LatentImage",
    "ModelSamplingFlux",
    "RandomNoise",
    "KSamplerSelect",
    "Flux2Scheduler",
    "BasicGuider",
    "SamplerCustomAdvanced",
    "VAEDecode",
    "SaveImage"
  ];
  const ultraRequiredNodes = [
    "CheckpointLoaderSimple",
    "CLIPTextEncode",
    "IPAdapterUnifiedLoader",
    "IPAdapterAdvanced",
    "OpenposePreprocessor",
    "ControlNetLoader",
    "ControlNetApplyAdvanced",
    "PrepImageForClipVision",
    "LatentUpscaleBy",
    "VAEEncodeForInpaint",
    "ImageCompositeMasked"
  ];

  const missingNodes = requiredNodes.filter((name) => !hasNode(objectInfo, name));
  const missingUltraNodes = ultraRequiredNodes.filter((name) => !hasNode(objectInfo, name));

  const unetOptions = readOptions(objectInfo, ["UNETLoader", "input", "required", "unet_name", 0]);
  const vaeOptions = readOptions(objectInfo, ["VAELoader", "input", "required", "vae_name", 0]);
  const clipOptions = readOptions(objectInfo, ["DualCLIPLoader", "input", "required", "clip_name1", 0]);
  const clipLoaderOptions = readOptions(objectInfo, ["CLIPLoader", "input", "required", "clip_name", 0]);
  const clipLoaderTypes = readOptions(objectInfo, ["CLIPLoader", "input", "required", "type", 0]);
  const controlNetOptions = readOptions(objectInfo, ["ControlNetLoader", "input", "required", "control_net_name", 0]);
  const supportsFlux2QwenPath =
    clipLoaderOptions.includes(TARGET_QWEN) && clipLoaderTypes.includes("flux2");
  const supportsFluxClassicPath = clipOptions.includes(TARGET_CLIP_L) && clipOptions.includes(TARGET_T5);

  const checks = {
    comfyServerUrl: COMFY_SERVER_URL,
    target: {
      unet: TARGET_UNET,
      vae: TARGET_VAE,
      qwen: TARGET_QWEN,
      clipL: TARGET_CLIP_L,
      t5xxl: TARGET_T5
    },
    nodes: {
      ok: missingNodes.length === 0,
      missing: missingNodes
    },
    ultraCharacterCheckpoint: {
      required: REQUIRE_ULTRA,
      nodesOk: missingUltraNodes.length === 0,
      missingNodes: missingUltraNodes,
      models: {
        poseFound: controlNetOptions.includes(TARGET_POSE_CONTROLNET),
        cannyFound: controlNetOptions.includes(TARGET_CANNY_CONTROLNET),
        lineartFound: controlNetOptions.includes(TARGET_LINEART_CONTROLNET),
        depthFound: controlNetOptions.includes(TARGET_DEPTH_CONTROLNET),
        availableControlNets: controlNetOptions
      }
    },
    models: {
      unetFound: unetOptions.includes(TARGET_UNET),
      vaeFound: vaeOptions.includes(TARGET_VAE),
      qwenFound: clipLoaderOptions.includes(TARGET_QWEN),
      clipLoaderSupportsFlux2: clipLoaderTypes.includes("flux2"),
      clipLFound: clipOptions.includes(TARGET_CLIP_L),
      t5xxlFound: clipOptions.includes(TARGET_T5),
      available: {
        unet: unetOptions,
        vae: vaeOptions,
        textEncoders: clipOptions,
        clipLoaderTextEncoders: clipLoaderOptions,
        clipLoaderTypes
      }
    },
    mode: {
      supportsFlux2QwenPath,
      supportsFluxClassicPath,
      recommended: supportsFluxClassicPath ? "flux-clip_l+t5" : supportsFlux2QwenPath ? "flux2-qwen" : "unavailable"
    },
    filesOnDisk: {
      checkedDirs: [TEXT_ENCODER_DIR, ALT_TEXT_ENCODER_DIR].filter(Boolean),
      byDir: [TEXT_ENCODER_DIR, ALT_TEXT_ENCODER_DIR]
        .filter(Boolean)
        .map((dir) => ({
          dir,
          clipLFile: existsSync(path.join(dir, TARGET_CLIP_L)),
          t5xxlFile: existsSync(path.join(dir, TARGET_T5))
        }))
    }
  };

  console.log(JSON.stringify(checks, null, 2));

  const pass =
    checks.nodes.ok &&
    checks.models.unetFound &&
    checks.models.vaeFound &&
    (checks.mode.supportsFlux2QwenPath || checks.mode.supportsFluxClassicPath) &&
    (!REQUIRE_ULTRA ||
      (checks.ultraCharacterCheckpoint.nodesOk &&
        checks.ultraCharacterCheckpoint.models.poseFound &&
        checks.ultraCharacterCheckpoint.models.cannyFound &&
        checks.ultraCharacterCheckpoint.models.lineartFound &&
        checks.ultraCharacterCheckpoint.models.depthFound));

  if (!pass) {
    console.error("\n[comfy:preflight] Missing requirements detected.");
    if (!checks.mode.supportsFlux2QwenPath && !checks.mode.supportsFluxClassicPath) {
      console.error("[comfy:preflight] Run: pnpm comfy:download:text-encoders");
      const existsAnywhere = checks.filesOnDisk.byDir.some((item) => item.clipLFile || item.t5xxlFile);
      if (existsAnywhere) {
        console.error("[comfy:preflight] Files exist on disk but are not listed by ComfyUI. Restart ComfyUI.");
      }
    }
    if (REQUIRE_ULTRA) {
      console.error("[comfy:preflight] Ultra mascot checkpoint stack is required in this mode.");
      if (checks.ultraCharacterCheckpoint.missingNodes.length > 0) {
        console.error(
          `[comfy:preflight] Missing ultra nodes: ${checks.ultraCharacterCheckpoint.missingNodes.join(", ")}`
        );
      }
    }
    process.exit(1);
  }

  console.log(
    `\n[comfy:preflight] OK - local generation requirements are ready${
      REQUIRE_ULTRA ? " (including ultra mascot checkpoint stack)" : ""
    }.`
  );
}

main().catch((error) => {
  console.error(`[comfy:preflight] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
