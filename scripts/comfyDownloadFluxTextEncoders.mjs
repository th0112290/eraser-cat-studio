import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

const LOCALAPPDATA = process.env.LOCALAPPDATA?.trim() || "";
const DEFAULT_TEXT_ENCODER_DIR = LOCALAPPDATA
  ? path.join(LOCALAPPDATA, "Programs", "ComfyUI", "resources", "ComfyUI", "models", "text_encoders")
  : path.join(process.cwd(), "models", "text_encoders");

const TEXT_ENCODER_DIR =
  process.env.COMFY_TEXT_ENCODER_DIR?.trim() ||
  process.env.COMFY_MODELS_TEXT_ENCODER_DIR?.trim() ||
  DEFAULT_TEXT_ENCODER_DIR;

const FILES = [
  {
    name: "clip_l.safetensors",
    url: "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors"
  },
  {
    name: "t5xxl_fp16.safetensors",
    url: "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors"
  }
];

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function downloadOne(file) {
  const outPath = path.join(TEXT_ENCODER_DIR, file.name);
  if (existsSync(outPath)) {
    const info = await stat(outPath);
    console.log(`[download] skip ${file.name} (exists, ${mb(info.size)})`);
    return;
  }

  console.log(`[download] ${file.name}`);
  const res = await fetch(file.url);
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} while downloading ${file.url}`);
  }

  const total = Number.parseInt(res.headers.get("content-length") || "0", 10);
  const reader = res.body.getReader();
  let received = 0;

  const stream = new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        received += value.byteLength;
        if (total > 0) {
          const pct = ((received / total) * 100).toFixed(1);
          process.stdout.write(`\r[download] ${file.name} ${pct}% (${mb(received)}/${mb(total)})`);
        } else {
          process.stdout.write(`\r[download] ${file.name} ${mb(received)}`);
        }
        this.push(Buffer.from(value));
      } catch (error) {
        this.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });

  await pipeline(stream, createWriteStream(outPath));
  process.stdout.write("\n");
  const info = await stat(outPath);
  console.log(`[download] done ${file.name} (${mb(info.size)}) -> ${outPath}`);
}

async function main() {
  mkdirSync(TEXT_ENCODER_DIR, { recursive: true });
  console.log(`[download] target dir: ${TEXT_ENCODER_DIR}`);
  for (const file of FILES) {
    await downloadOne(file);
  }
  console.log("[download] completed. Restart ComfyUI or refresh model list.");
}

main().catch((error) => {
  console.error(`[download] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
