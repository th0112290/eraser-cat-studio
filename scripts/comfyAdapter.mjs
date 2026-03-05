import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";

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
const COMFY_CHECKPOINT_NAME = process.env.COMFY_CHECKPOINT_NAME?.trim() || "";

function nowIso() {
  return new Date().toISOString();
}

function hashWorkflowIdentity(input) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
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

async function resolveCheckpointName() {
  if (COMFY_CHECKPOINT_NAME) return COMFY_CHECKPOINT_NAME;
  if (cachedCheckpointName) return cachedCheckpointName;

  const objectInfo = await fetchJson(`${COMFY_SERVER_URL}/object_info`);
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

function buildWorkflow(input) {
  const workflow = {
    "1": {
      inputs: {
        ckpt_name: input.checkpointName
      },
      class_type: "CheckpointLoaderSimple"
    },
    "2": {
      inputs: {
        text: input.positivePrompt,
        clip: ["1", 1]
      },
      class_type: "CLIPTextEncode"
    },
    "3": {
      inputs: {
        text: input.negativePrompt,
        clip: ["1", 1]
      },
      class_type: "CLIPTextEncode"
    },
    "4": {
      inputs: {
        width: COMFY_WIDTH,
        height: COMFY_HEIGHT,
        batch_size: 1
      },
      class_type: "EmptyLatentImage"
    },
    "5": {
      inputs: {
        seed: input.seed,
        steps: COMFY_STEPS,
        cfg: COMFY_CFG,
        sampler_name: COMFY_SAMPLER,
        scheduler: COMFY_SCHEDULER,
        denoise: 1,
        model: ["1", 0],
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
        filename_prefix: `${COMFY_FILENAME_PREFIX}_${input.view}`,
        images: ["6", 0]
      },
      class_type: "SaveImage"
    }
  };
  return workflow;
}

async function waitForPromptResult(promptId) {
  const deadline = Date.now() + COMFY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const history = await fetchJson(`${COMFY_SERVER_URL}/history/${encodeURIComponent(promptId)}`);
    const item = history?.[promptId];
    const outputs = item?.outputs;
    if (isObject(outputs)) {
      const saveImageNode = outputs["7"];
      const images = saveImageNode?.images;
      if (Array.isArray(images) && images.length > 0 && isObject(images[0])) {
        return images[0];
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
  const negativePrompt = typeof payload.negativePrompt === "string"
    ? payload.negativePrompt
    : "";
  const checkpointName = await resolveCheckpointName();

  const workflow = buildWorkflow({
    checkpointName,
    view,
    seed,
    positivePrompt,
    negativePrompt
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
      checkpointName,
      steps: COMFY_STEPS,
      cfg: COMFY_CFG,
      sampler: COMFY_SAMPLER,
      scheduler: COMFY_SCHEDULER,
      width: COMFY_WIDTH,
      height: COMFY_HEIGHT
    }),
    meta: {
      promptId,
      fileName,
      subfolder,
      type,
      checkpointName
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
    `[comfy-adapter] listening http://${ADAPTER_HOST}:${ADAPTER_PORT} -> ${COMFY_SERVER_URL}`
  );
});
