import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const MODELS_ROOT = process.env.COMFY_MODELS_ROOT?.trim() || "C:\\models";
const DIFFUSION_MODEL = process.env.VIDEO_BROLL_WAN_MODEL?.trim() || "wan2.2_ti2v_5B_fp16.safetensors";
const TEXT_ENCODER =
  process.env.VIDEO_BROLL_WAN_TEXT_ENCODER?.trim() || "umt5_xxl_fp8_e4m3fn_scaled.safetensors";
const VAE = process.env.VIDEO_BROLL_WAN_VAE?.trim() || "wan2.2_vae.safetensors";
const CLIP_VISION = process.env.VIDEO_BROLL_WAN_CLIP_VISION?.trim() || "clip_vision_h.safetensors";
const USE_CLIP_VISION = /^(1|true|yes|on|enabled)$/i.test(process.env.VIDEO_BROLL_WAN_USE_CLIP_VISION ?? "");

const DOWNLOADS = [
  {
    repo: "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
    file: `split_files/diffusion_models/${DIFFUSION_MODEL}`,
    destDir: path.join(MODELS_ROOT, "diffusion_models"),
    destName: DIFFUSION_MODEL
  },
  {
    repo: "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
    file: `split_files/vae/${VAE}`,
    destDir: path.join(MODELS_ROOT, "vae"),
    destName: VAE
  },
  {
    repo: "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
    file: `split_files/text_encoders/${TEXT_ENCODER}`,
    destDir: path.join(MODELS_ROOT, "text_encoders"),
    destName: TEXT_ENCODER
  },
  ...(USE_CLIP_VISION
    ? [
        {
          repo: "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
          file: `split_files/clip_vision/${CLIP_VISION}`,
          destDir: path.join(MODELS_ROOT, "clip_vision"),
          destName: CLIP_VISION
        }
      ]
    : [])
];

function runHf(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("hf", args, {
      stdio: ["ignore", "pipe", "inherit"],
      shell: false
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      process.stdout.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(new Error(`hf ${args[0]} failed with exit code ${code}`));
    });
  });
}

async function main() {
  mkdirSync(MODELS_ROOT, { recursive: true });
  console.log(`[download] target model root: ${MODELS_ROOT}`);
  for (const job of DOWNLOADS) {
    mkdirSync(job.destDir, { recursive: true });
    console.log(`[download] ${job.repo} :: ${job.file}`);
    const cachedPath = await runHf([
      "download",
      job.repo,
      job.file,
      "--repo-type",
      "model",
      "--quiet",
      "--max-workers",
      "4"
    ]);
    const fromPath = cachedPath.split(/\r?\n/).filter((line) => line.trim().length > 0).at(-1);
    if (!fromPath) {
      throw new Error(`hf download did not return a path for ${job.file}`);
    }
    const toPath = path.join(job.destDir, job.destName);
    copyFileSync(fromPath, toPath);
    console.log(`[download] saved -> ${toPath}`);
  }
  console.log("[download] completed. Restart ComfyUI to refresh model lists.");
}

main().catch((error) => {
  console.error(`[download] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
