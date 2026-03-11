#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "out", "comfy_adapter_fake_smoke");
const INPUT_DIR = path.join(OUT_DIR, "input");
const REPORT_PATH = path.join(OUT_DIR, "report.json");
const PLACEHOLDER_PATTERN = /^\{\{[a-z0-9_]+\}\}$/i;
const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0pQAAAAASUVORK5CYII=";
const ONE_PIXEL_PNG_BUFFER = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function substitutePlaceholderImages(value) {
  if (Array.isArray(value)) {
    return value.map(substitutePlaceholderImages);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, substitutePlaceholderImages(entry)])
    );
  }
  if (typeof value === "string" && PLACEHOLDER_PATTERN.test(value.trim())) {
    return ONE_PIXEL_PNG_BASE64;
  }
  return value;
}

function tailLines(lines, limit = 80) {
  return lines.slice(Math.max(0, lines.length - limit));
}

async function getFreePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = isRecord(address) ? address.port : null;
  server.close();
  await once(server, "close");
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("Failed to allocate free port");
  }
  return port;
}

async function fetchJson(url, init = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    return {
      ok: response.ok,
      status: response.status,
      body: parsed
    };
  } finally {
    clearTimeout(timer);
  }
}

function createFakeObjectInfo() {
  return {
    CheckpointLoaderSimple: {
      input: {
        required: {
          ckpt_name: [["fake_mascot_checkpoint.safetensors"]]
        }
      },
      output: ["MODEL", "CLIP", "VAE"],
      output_name: ["MODEL", "CLIP", "VAE"]
    },
    CLIPTextEncode: {
      input: {
        required: {
          text: ["STRING", {}],
          clip: ["CLIP", {}]
        }
      },
      output: ["CONDITIONING"],
      output_name: ["CONDITIONING"]
    },
    LoadImage: {
      input: {
        required: {
          image: [["fake.png"]]
        }
      },
      output: ["IMAGE", "MASK"],
      output_name: ["IMAGE", "MASK"]
    },
    EmptyLatentImage: {
      input: {
        required: {
          width: ["INT", {}],
          height: ["INT", {}],
          batch_size: ["INT", {}]
        }
      },
      output: ["LATENT"],
      output_name: ["LATENT"]
    },
    KSampler: {
      input: {
        required: {
          model: ["MODEL", {}],
          seed: ["INT", {}],
          steps: ["INT", {}],
          cfg: ["FLOAT", {}],
          sampler_name: [["euler", "dpmpp_2m_sde"]],
          scheduler: [["normal", "karras"]],
          positive: ["CONDITIONING", {}],
          negative: ["CONDITIONING", {}],
          latent_image: ["LATENT", {}],
          denoise: ["FLOAT", {}]
        }
      },
      output: ["LATENT"],
      output_name: ["LATENT"]
    },
    VAEDecode: {
      input: {
        required: {
          samples: ["LATENT", {}],
          vae: ["VAE", {}]
        }
      },
      output: ["IMAGE"],
      output_name: ["IMAGE"]
    },
    SaveImage: {
      input: {
        required: {
          images: ["IMAGE", {}],
          filename_prefix: ["STRING", {}]
        }
      },
      output: [],
      output_name: []
    },
    ImageScale: {
      input: {
        required: {
          image: ["IMAGE", {}],
          upscale_method: [["lanczos"]],
          width: ["INT", {}],
          height: ["INT", {}],
          crop: [["center", "disabled"]]
        }
      },
      output: ["IMAGE"],
      output_name: ["IMAGE"]
    },
    VAEEncode: {
      input: {
        required: {
          pixels: ["IMAGE", {}],
          vae: ["VAE", {}]
        }
      },
      output: ["LATENT"],
      output_name: ["LATENT"]
    },
    IPAdapterUnifiedLoader: {
      input: {
        required: {
          model: ["MODEL", {}],
          preset: [["PLUS (high strength)", "PLUS (medium strength)"]]
        }
      },
      output: ["MODEL", "IPADAPTER"],
      output_name: ["MODEL", "IPADAPTER"]
    },
    IPAdapterAdvanced: {
      input: {
        required: {
          model: ["MODEL", {}],
          ipadapter: ["IPADAPTER", {}],
          image: ["IMAGE", {}],
          weight: ["FLOAT", {}],
          weight_type: [["linear", "style transfer", "composition"]],
          combine_embeds: [["average"]],
          start_at: ["FLOAT", {}],
          end_at: ["FLOAT", {}],
          embeds_scaling: [["V only"]]
        }
      },
      output: ["MODEL"],
      output_name: ["MODEL"]
    },
    OpenposePreprocessor: {
      input: {
        required: {
          image: ["IMAGE", {}],
          detect_hand: [["disable"]],
          detect_body: [["enable"]],
          detect_face: [["enable"]],
          resolution: ["INT", {}],
          scale_stick_for_xinsr_cn: [["disable"]]
        }
      },
      output: ["IMAGE"],
      output_name: ["IMAGE"]
    },
    ControlNetLoader: {
      input: {
        required: {
          control_net_name: [[
            "control-lora-openposeXL2-rank256.safetensors",
            "controlnet-canny.safetensors",
            "controlnet-lineart.safetensors",
            "controlnet-depth.safetensors"
          ]]
        }
      },
      output: ["CONTROL_NET"],
      output_name: ["CONTROL_NET"]
    },
    ControlNetApplyAdvanced: {
      input: {
        required: {
          positive: ["CONDITIONING", {}],
          negative: ["CONDITIONING", {}],
          control_net: ["CONTROL_NET", {}],
          image: ["IMAGE", {}],
          strength: ["FLOAT", {}],
          start_percent: ["FLOAT", {}],
          end_percent: ["FLOAT", {}]
        }
      },
      output: ["CONDITIONING", "CONDITIONING"],
      output_name: ["POSITIVE", "NEGATIVE"]
    },
    CannyEdgePreprocessor: {
      input: {
        required: {
          image: ["IMAGE", {}],
          low_threshold: ["INT", {}],
          high_threshold: ["INT", {}],
          resolution: ["INT", {}]
        }
      },
      output: ["IMAGE"],
      output_name: ["IMAGE"]
    },
    LineArtPreprocessor: {
      input: {
        required: {
          image: ["IMAGE", {}],
          resolution: ["INT", {}],
          coarse: ["BOOLEAN", {}]
        }
      },
      output: ["IMAGE"],
      output_name: ["IMAGE"]
    },
    DepthAnythingPreprocessor: {
      input: {
        required: {
          image: ["IMAGE", {}],
          resolution: ["INT", {}]
        }
      },
      output: ["IMAGE"],
      output_name: ["IMAGE"]
    },
    VAEEncodeForInpaint: {
      input: {
        required: {
          pixels: ["IMAGE", {}],
          vae: ["VAE", {}],
          mask: ["MASK", {}],
          grow_mask_by: ["INT", {}]
        }
      },
      output: ["LATENT"],
      output_name: ["LATENT"]
    },
    MaskToImage: {
      input: {
        required: {
          mask: ["MASK", {}]
        }
      },
      output: ["IMAGE"],
      output_name: ["IMAGE"]
    },
    ImageToMask: {
      input: {
        required: {
          image: ["IMAGE", {}],
          channel: [["alpha"]]
        }
      },
      output: ["MASK"],
      output_name: ["MASK"]
    },
    InvertMask: {
      input: {
        required: {
          mask: ["MASK", {}]
        }
      },
      output: ["MASK"],
      output_name: ["MASK"]
    },
    ThresholdMask: {
      input: {
        required: {
          mask: ["MASK", {}],
          value: ["FLOAT", {}]
        }
      },
      output: ["MASK"],
      output_name: ["MASK"]
    },
    GrowMask: {
      input: {
        required: {
          mask: ["MASK", {}],
          expand: ["INT", {}],
          tapered_corners: ["BOOLEAN", {}]
        }
      },
      output: ["MASK"],
      output_name: ["MASK"]
    },
    FeatherMask: {
      input: {
        required: {
          mask: ["MASK", {}],
          left: ["INT", {}],
          top: ["INT", {}],
          right: ["INT", {}],
          bottom: ["INT", {}]
        }
      },
      output: ["MASK"],
      output_name: ["MASK"]
    },
    SetLatentNoiseMask: {
      input: {
        required: {
          samples: ["LATENT", {}],
          mask: ["MASK", {}]
        }
      },
      output: ["LATENT"],
      output_name: ["LATENT"]
    },
    LatentUpscaleBy: {
      input: {
        required: {
          samples: ["LATENT", {}],
          upscale_method: [["bislerp"]],
          scale_by: ["FLOAT", {}]
        }
      },
      output: ["LATENT"],
      output_name: ["LATENT"]
    },
    LatentUpscale: {
      input: {
        required: {
          samples: ["LATENT", {}],
          upscale_method: [["bislerp"]],
          width: ["INT", {}],
          height: ["INT", {}],
          crop: [["disabled"]]
        }
      },
      output: ["LATENT"],
      output_name: ["LATENT"]
    },
    PrepImageForClipVision: {
      input: {
        required: {
          image: ["IMAGE", {}],
          interpolation: [["LANCZOS"]],
          crop_position: [["center", "pad"]],
          sharpening: ["FLOAT", {}]
        }
      },
      output: ["IMAGE"],
      output_name: ["IMAGE"]
    },
    IPAdapterPreciseStyleTransfer: {
      input: {
        required: {
          model: ["MODEL", {}],
          ipadapter: ["IPADAPTER", {}],
          image: ["IMAGE", {}],
          weight: ["FLOAT", {}],
          combine_embeds: [["average"]],
          start_at: ["FLOAT", {}],
          end_at: ["FLOAT", {}],
          embeds_scaling: [["V only"]],
          style_boost: ["FLOAT", {}]
        }
      },
      output: ["MODEL"],
      output_name: ["MODEL"]
    },
    IPAdapterPreciseComposition: {
      input: {
        required: {
          model: ["MODEL", {}],
          ipadapter: ["IPADAPTER", {}],
          image: ["IMAGE", {}],
          weight: ["FLOAT", {}],
          combine_embeds: [["average"]],
          start_at: ["FLOAT", {}],
          end_at: ["FLOAT", {}],
          embeds_scaling: [["V only"]],
          composition_boost: ["FLOAT", {}]
        }
      },
      output: ["MODEL"],
      output_name: ["MODEL"]
    },
    ImageCompositeMasked: {
      input: {
        required: {
          destination: ["IMAGE", {}],
          source: ["IMAGE", {}],
          x: ["INT", {}],
          y: ["INT", {}],
          resize_source: ["BOOLEAN", {}],
          mask: ["MASK", {}]
        }
      },
      output: ["IMAGE"],
      output_name: ["IMAGE"]
    }
  };
}

function removeObjectNodes(objectInfo, nodeNames) {
  const next = structuredClone(objectInfo);
  for (const nodeName of nodeNames) {
    delete next[nodeName];
  }
  return next;
}

function removeControlNetModelNames(objectInfo, modelNames) {
  const next = structuredClone(objectInfo);
  const options = next?.ControlNetLoader?.input?.required?.control_net_name?.[0];
  if (Array.isArray(options)) {
    next.ControlNetLoader.input.required.control_net_name[0] = options.filter(
      (entry) => !modelNames.includes(entry)
    );
  }
  return next;
}

function jsonResponse(res, statusCode, body) {
  const raw = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(raw)
  });
  res.end(raw);
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function startFakeComfyServer(port) {
  const defaultObjectInfo = createFakeObjectInfo();
  let objectInfo = structuredClone(defaultObjectInfo);
  const promptRecords = new Map();
  let promptCounter = 1;

  const server = createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? `127.0.0.1:${port}`}`);

    if (req.method === "GET" && requestUrl.pathname === "/object_info") {
      jsonResponse(res, 200, objectInfo);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/prompt") {
      const body = await readRequestJson(req);
      const promptId = `fake_prompt_${promptCounter++}`;
      const fileName = `${promptId}.png`;
      promptRecords.set(promptId, {
        promptId,
        request: body,
        prompt: isRecord(body?.prompt) ? body.prompt : null,
        imageInfo: {
          filename: fileName,
          subfolder: "",
          type: "output"
        }
      });
      jsonResponse(res, 200, { prompt_id: promptId });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname.startsWith("/history/")) {
      const promptId = decodeURIComponent(requestUrl.pathname.replace(/^\/history\//, ""));
      const record = promptRecords.get(promptId);
      if (!record) {
        jsonResponse(res, 200, {});
        return;
      }
      jsonResponse(res, 200, {
        [promptId]: {
          outputs: {
            save_image: {
              images: [record.imageInfo]
            }
          }
        }
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/view") {
      res.writeHead(200, {
        "content-type": "image/png",
        "content-length": ONE_PIXEL_PNG_BUFFER.byteLength
      });
      res.end(ONE_PIXEL_PNG_BUFFER);
      return;
    }

    jsonResponse(res, 404, { error: "not_found" });
  });

  server.listen(port, "127.0.0.1");
  await once(server, "listening");

  return {
    server,
    promptRecords,
    setObjectInfo(nextObjectInfo) {
      objectInfo = structuredClone(nextObjectInfo);
    },
    resetObjectInfo() {
      objectInfo = structuredClone(defaultObjectInfo);
    }
  };
}

function collectLines(target, chunk) {
  const text = chunk.toString("utf8");
  for (const line of text.split(/\r?\n/)) {
    if (line.length > 0) {
      target.push(line);
    }
  }
}

async function waitForAdapterHealth(baseUrl, child, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Adapter exited before health check: code=${child.exitCode}`);
    }
    try {
      const response = await fetchJson(`${baseUrl}/health`, {}, 1200);
      if (response.ok && response.body?.ok === true) {
        return response.body;
      }
    } catch {
      // keep polling until ready
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for adapter health: ${baseUrl}/health`);
}

function listClassTypes(prompt) {
  if (!isRecord(prompt)) {
    return [];
  }
  return Array.from(
    new Set(
      Object.values(prompt)
        .map((node) => (nonEmptyString(node?.class_type) ? node.class_type.trim() : null))
        .filter((value) => value !== null)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function countWorkflowNodes(prompt) {
  return isRecord(prompt) ? Object.keys(prompt).length : 0;
}

function countClassType(prompt, classType) {
  if (!isRecord(prompt)) {
    return 0;
  }
  return Object.values(prompt).filter((node) => node?.class_type === classType).length;
}

function loadSamplePayload(relativePath) {
  const filePath = path.join(REPO_ROOT, relativePath);
  return {
    filePath,
    payload: substitutePlaceholderImages(readJson(filePath))
  };
}

function requireNodeTypes(caseName, classTypes, required) {
  for (const classType of required) {
    assert(classTypes.includes(classType), `${caseName}: missing workflow node ${classType}`);
  }
}

function requireClassTypeCount(caseName, classTypeCounts, classType, expected) {
  assert(
    classTypeCounts[classType] === expected,
    `${caseName}: expected ${classType} count ${expected} but got ${String(classTypeCounts[classType])}`
  );
}

function requireNodeCountAtLeast(caseName, nodeCount, minimum) {
  assert(nodeCount >= minimum, `${caseName}: expected nodeCount >= ${minimum} but got ${nodeCount}`);
}

function findStructureControlSummaryEntry(summary, kind) {
  if (!Array.isArray(summary)) {
    return null;
  }
  return summary.find((entry) => isRecord(entry) && entry.type === kind) ?? null;
}

function requireStructureControlProvenance(caseName, summary, kind, expected) {
  const entry = findStructureControlSummaryEntry(summary, kind);
  assert(entry, `${caseName}: missing structure summary for ${kind}`);
  if (nonEmptyString(expected.sourceRole)) {
    assert(
      entry.sourceRole === expected.sourceRole,
      `${caseName}: expected ${kind}.sourceRole=${expected.sourceRole} but got ${String(entry.sourceRole)}`
    );
  }
  if (nonEmptyString(expected.sourceRefId)) {
    assert(
      entry.sourceRefId === expected.sourceRefId,
      `${caseName}: expected ${kind}.sourceRefId=${expected.sourceRefId} but got ${String(entry.sourceRefId)}`
    );
  }
  if (nonEmptyString(expected.sourceView)) {
    assert(
      entry.sourceView === expected.sourceView,
      `${caseName}: expected ${kind}.sourceView=${expected.sourceView} but got ${String(entry.sourceView)}`
    );
  }
}

async function runSmokeCase(
  name,
  payloadRelativePath,
  adapterBaseUrl,
  promptRecords,
  inspect,
  mutatePayload = undefined,
  options = {}
) {
  if (typeof options.beforeRequest === "function") {
    await options.beforeRequest();
  }
  try {
    const { filePath, payload: loadedPayload } = loadSamplePayload(payloadRelativePath);
    const payload = typeof mutatePayload === "function" ? mutatePayload(loadedPayload) : loadedPayload;
    const response = await fetchJson(
      `${adapterBaseUrl}/api/generate-character-view`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      },
      15000
    );

    if (options.expectFailure === true) {
      assert(!response.ok, `${name}: expected failure but got HTTP ${response.status}`);
      const errorText = nonEmptyString(response.body?.error) ? response.body.error : "";
      if (nonEmptyString(options.expectedErrorIncludes)) {
        assert(
          errorText.includes(options.expectedErrorIncludes),
          `${name}: expected error to include "${options.expectedErrorIncludes}" but got "${errorText}"`
        );
      }
      return {
        case: name,
        failedAsExpected: true,
        status: response.status,
        error: errorText
      };
    }

    assert(
      response.ok,
      `${name}: adapter returned HTTP ${response.status}${
        nonEmptyString(response.body?.error) ? ` error=${response.body.error}` : ""
      }`
    );
    const result = response.body;
    assert(isRecord(result), `${name}: response body is not an object`);
    assert(nonEmptyString(result.imageBase64), `${name}: imageBase64 missing`);
    assert(nonEmptyString(result.mimeType), `${name}: mimeType missing`);
    assert(isRecord(result.meta), `${name}: meta missing`);
    assert(nonEmptyString(result.meta.promptId), `${name}: meta.promptId missing`);

    const promptRecord = promptRecords.get(result.meta.promptId);
    assert(promptRecord, `${name}: fake Comfy did not capture prompt ${String(result.meta.promptId)}`);
    const prompt = promptRecord.prompt;
    assert(isRecord(prompt), `${name}: captured prompt missing`);

    const classTypes = listClassTypes(prompt);
    const nodeCount = countWorkflowNodes(prompt);
    const classTypeCounts = {
      ControlNetLoader: countClassType(prompt, "ControlNetLoader"),
      ControlNetApplyAdvanced: countClassType(prompt, "ControlNetApplyAdvanced"),
      LoadImage: countClassType(prompt, "LoadImage"),
      ImageScale: countClassType(prompt, "ImageScale")
    };
    try {
      inspect({
        result,
        prompt,
        classTypes,
        classTypeCounts,
        nodeCount
      });
    } catch (error) {
      if (error instanceof Error) {
        error.cause = {
          case: name,
          payloadPath: filePath,
          promptId: result.meta.promptId,
          mode: result.meta.mode,
          workflowStage: result.meta.workflowStage,
          workflowTemplateVersion: result.meta.workflowTemplateVersion,
          poseApplied: result.meta.poseApplied === true,
          repairMaskApplied: result.meta.repairMaskApplied === true,
          structureControlsApplied: result.meta.structureControlsApplied ?? [],
          nodeCount,
          classTypeCounts,
          classTypes
        };
      }
      throw error;
    }

    return {
      case: name,
      payloadPath: filePath,
      promptId: result.meta.promptId,
      mode: result.meta.mode,
      workflowHash: result.workflowHash,
      workflowStage: result.meta.workflowStage,
      workflowTemplateVersion: result.meta.workflowTemplateVersion,
      referenceMode: result.meta.referenceMode,
      referenceApplied: result.meta.referenceApplied === true,
      poseApplied: result.meta.poseApplied === true,
      repairMaskApplied: result.meta.repairMaskApplied === true,
      repairMaskSource: result.meta.repairMaskSource ?? null,
      structureControlsApplied: Array.isArray(result.meta.structureControlsApplied)
        ? result.meta.structureControlsApplied
        : [],
      nodeCount,
      classTypeCounts,
      featureFlags: {
        preciseStyleTransfer: classTypes.includes("IPAdapterPreciseStyleTransfer"),
        preciseComposition: classTypes.includes("IPAdapterPreciseComposition"),
        prepImageForClipVision: classTypes.includes("PrepImageForClipVision"),
        latentRefine: classTypes.includes("LatentUpscaleBy") || classTypes.includes("LatentUpscale"),
        repairInpaint: classTypes.includes("VAEEncodeForInpaint"),
        imageCompositeMasked: classTypes.includes("ImageCompositeMasked")
      },
      classTypes
    };
  } finally {
    if (typeof options.afterRequest === "function") {
      await options.afterRequest();
    }
  }
}

function writeReport(report) {
  ensureDir(OUT_DIR);
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  ensureDir(OUT_DIR);
  ensureDir(INPUT_DIR);

  const fakeComfyPort = await getFreePort();
  const adapterPort = await getFreePort();
  const fakeComfy = await startFakeComfyServer(fakeComfyPort);
  const adapterStdout = [];
  const adapterStderr = [];

  const adapter = spawn(process.execPath, ["scripts/comfyAdapter.mjs"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      COMFY_SERVER_URL: `http://127.0.0.1:${fakeComfyPort}`,
      COMFY_ADAPTER_HOST: "127.0.0.1",
      COMFY_ADAPTER_PORT: String(adapterPort),
      COMFY_TIMEOUT_MS: "5000",
      COMFY_INPUT_DIR: INPUT_DIR,
      COMFY_REFERENCE_MODE: "img2img",
      COMFY_DISABLE_OBJECT_INFO_CACHE: "true",
      COMFY_ULTRA_ENABLE_LATENT_REFINE: "true",
      COMFY_ULTRA_ENABLE_REPAIR_INPAINT: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  adapter.stdout.on("data", (chunk) => collectLines(adapterStdout, chunk));
  adapter.stderr.on("data", (chunk) => collectLines(adapterStderr, chunk));

  const report = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    fake_comfy_url: `http://127.0.0.1:${fakeComfyPort}`,
    adapter_url: `http://127.0.0.1:${adapterPort}`,
    cases: [],
    adapter_stdout_tail: [],
    adapter_stderr_tail: []
  };

  try {
    await waitForAdapterHealth(report.adapter_url, adapter, 12000);

    const frontCase = await runSmokeCase(
      "front_master_ultra",
      "workflows/comfy/character/front_master/ultra_front_master_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      ({ result, classTypes }) => {
        assert(result.meta.mode === "checkpoint-ultra", "front_master_ultra: expected checkpoint-ultra mode");
        assert(result.meta.workflowStage === "front_master", "front_master_ultra: workflowStage mismatch");
        assert(result.meta.poseApplied === false, "front_master_ultra: pose should be disabled");
        assert(result.meta.repairMaskApplied === false, "front_master_ultra: repair mask should be disabled");
        assert(result.meta.referenceMode === "off", "front_master_ultra: referenceMode should be off");
        assert(result.meta.referenceApplied === false, "front_master_ultra: direct reference image should be absent");
        assert(nonEmptyString(result.meta.templateManifestPath), "front_master_ultra: templateManifestPath missing");
        assert(Array.isArray(result.meta.referenceBankSummary), "front_master_ultra: referenceBankSummary missing");
        assert(result.meta.referenceBankSummary.length >= 2, "front_master_ultra: referenceBankSummary too small");
        assert(result.meta.structureControlApplied === true, "front_master_ultra: structure controls should be enabled");
        assert(
          Array.isArray(result.meta.structureControlsApplied) &&
            result.meta.structureControlsApplied.includes("lineart") &&
            result.meta.structureControlsApplied.includes("canny"),
          "front_master_ultra: expected lineart/canny structure controls"
        );
        assert(isRecord(result.meta.capabilitySnapshot), "front_master_ultra: capabilitySnapshot missing");
        assert(result.meta.capabilitySnapshot.hasRepairInpaint === true, "front_master_ultra: repair capability missing");
        assert(isRecord(result.meta.workflowApi), "front_master_ultra: workflowApi missing");
        assert(isRecord(result.meta.workflowGui), "front_master_ultra: workflowGui missing");
        assert(isRecord(result.meta.workflowSummary), "front_master_ultra: workflowSummary missing");
        requireNodeTypes("front_master_ultra", classTypes, [
          "CheckpointLoaderSimple",
          "IPAdapterUnifiedLoader",
          "PrepImageForClipVision",
          "ControlNetApplyAdvanced",
          "LatentUpscaleBy",
          "SaveImage"
        ]);
        assert(
          classTypes.includes("IPAdapterPreciseStyleTransfer") || classTypes.includes("IPAdapterAdvanced"),
          "front_master_ultra: expected style transfer or advanced IPAdapter node"
        );
      }
    );

    const frontMissingStructureTraceCase = await runSmokeCase(
      "front_master_missing_structure_trace",
      "workflows/comfy/character/front_master/ultra_front_master_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        if (isRecord(clone.structureControls?.lineart)) {
          delete clone.structureControls.lineart.sourceView;
        }
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "structure_control_source_trace_missing:lineart:sourceView"
      }
    );

    const sideViewBaseCase = await runSmokeCase(
      "side_view_base_ultra",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      ({ result, classTypes, classTypeCounts, nodeCount }) => {
        assert(result.meta.mode === "checkpoint-ultra-pose", "side_view_base_ultra: expected checkpoint-ultra-pose mode");
        assert(result.meta.workflowStage === "side_view_base", "side_view_base_ultra: workflowStage mismatch");
        assert(
          result.meta.workflowTemplateVersion === "ultra_side_view_base_v1",
          "side_view_base_ultra: workflowTemplateVersion mismatch"
        );
        assert(result.meta.referenceMode === "img2img", "side_view_base_ultra: referenceMode should be img2img");
        assert(result.meta.referenceApplied === true, "side_view_base_ultra: reference should be applied");
        assert(result.meta.poseApplied === true, "side_view_base_ultra: pose should be enabled");
        assert(result.meta.repairMaskApplied === false, "side_view_base_ultra: repair mask should be disabled");
        assert(result.meta.warning === null, "side_view_base_ultra: warning should be null");
        assert(isRecord(result.meta.stagePlan), "side_view_base_ultra: stagePlan missing");
        assert(result.meta.stagePlan.stage === "side_view_base", "side_view_base_ultra: stagePlan.stage mismatch");
        assert(
          result.meta.stagePlan.templateVersion === "ultra_side_view_base_v1",
          "side_view_base_ultra: stagePlan.templateVersion mismatch"
        );
        assert(
          Array.isArray(result.meta.stagePlan.views) &&
            result.meta.stagePlan.views.length === 1 &&
            result.meta.stagePlan.views[0] === "threeQuarter",
          "side_view_base_ultra: stagePlan.views mismatch"
        );
        assert(result.meta.stagePlan.candidateCount === 4, "side_view_base_ultra: stagePlan.candidateCount mismatch");
        assert(isRecord(result.meta.templateManifest), "side_view_base_ultra: templateManifest missing");
        assert(result.meta.templateManifest.stage === "side_view_base", "side_view_base_ultra: templateManifest.stage mismatch");
        assert(
          result.meta.templateManifest.template_version === "ultra_side_view_base_v1",
          "side_view_base_ultra: templateManifest.template_version mismatch"
        );
        assert(Array.isArray(result.meta.referenceBankSummary), "side_view_base_ultra: referenceBankSummary missing");
        assert(result.meta.referenceBankSummary.length === 3, "side_view_base_ultra: referenceBankSummary length mismatch");
        assert(isRecord(result.meta.structureControlDiagnostics), "side_view_base_ultra: structureControlDiagnostics missing");
        assert(
          Array.isArray(result.meta.structureControlDiagnostics.requiredKinds) &&
            result.meta.structureControlDiagnostics.requiredKinds.includes("lineart") &&
            result.meta.structureControlDiagnostics.requiredKinds.includes("canny"),
          "side_view_base_ultra: structureControlDiagnostics.requiredKinds mismatch"
        );
        assert(isRecord(result.meta.preflightDiagnostics), "side_view_base_ultra: preflightDiagnostics missing");
        assert(isRecord(result.meta.routeDecision), "side_view_base_ultra: routeDecision missing");
        assert(
          result.meta.routeDecision.selectedMode === "checkpoint-ultra-pose",
          "side_view_base_ultra: routeDecision.selectedMode mismatch"
        );
        assert(
          Array.isArray(result.meta.workflowSummary?.warnings),
          "side_view_base_ultra: workflowSummary.warnings missing"
        );
        requireNodeTypes("side_view_base_ultra", classTypes, [
          "CheckpointLoaderSimple",
          "OpenposePreprocessor",
          "ControlNetLoader",
          "ControlNetApplyAdvanced",
          "IPAdapterUnifiedLoader",
          "IPAdapterAdvanced",
          "IPAdapterPreciseStyleTransfer",
          "IPAdapterPreciseComposition",
          "PrepImageForClipVision",
          "LatentUpscaleBy",
          "ImageScale",
          "VAEEncode",
          "SaveImage"
        ]);
        requireClassTypeCount("side_view_base_ultra", classTypeCounts, "ControlNetLoader", 3);
        requireClassTypeCount("side_view_base_ultra", classTypeCounts, "ControlNetApplyAdvanced", 3);
        requireNodeCountAtLeast("side_view_base_ultra", nodeCount, 28);
        assert(
          Array.isArray(result.meta.structureControlsApplied) &&
            result.meta.structureControlsApplied.length === 2 &&
            result.meta.structureControlsApplied.includes("lineart") &&
            result.meta.structureControlsApplied.includes("canny"),
          "side_view_base_ultra: structureControlsApplied mismatch"
        );
        requireStructureControlProvenance(
          "side_view_base_ultra",
          result.meta.structureControlsSummary,
          "lineart",
          {
            sourceRole: "composition",
            sourceRefId: "family_view_composition",
            sourceView: "threeQuarter"
          }
        );
        requireStructureControlProvenance(
          "side_view_base_ultra",
          result.meta.structureControlsSummary,
          "canny",
          {
            sourceRole: "composition",
            sourceRefId: "family_view_composition",
            sourceView: "threeQuarter"
          }
        );
        assert(classTypes.includes("LatentUpscaleBy") || classTypes.includes("LatentUpscale"), "side_view_base_ultra: latent refine should be enabled");
        assert(!classTypes.includes("VAEEncodeForInpaint"), "side_view_base_ultra: repair inpaint node should be absent");
        assert(!classTypes.includes("SetLatentNoiseMask"), "side_view_base_ultra: latent noise mask should be absent");
        assert(!classTypes.includes("ImageCompositeMasked"), "side_view_base_ultra: composite node should be absent");
      }
    );

    const viewOnlyCase = await runSmokeCase(
      "view_only_ultra",
      "workflows/comfy/character/view_only/ultra_view_only_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      ({ result, classTypes, classTypeCounts, nodeCount }) => {
        assert(result.meta.mode === "checkpoint-ultra-pose", "view_only_ultra: expected checkpoint-ultra-pose mode");
        assert(result.meta.workflowStage === "view_only", "view_only_ultra: workflowStage mismatch");
        assert(
          result.meta.workflowTemplateVersion === "ultra_view_only_v1",
          "view_only_ultra: workflowTemplateVersion mismatch"
        );
        assert(result.meta.referenceMode === "img2img", "view_only_ultra: referenceMode should be img2img");
        assert(result.meta.referenceApplied === true, "view_only_ultra: reference should be applied");
        assert(result.meta.poseApplied === true, "view_only_ultra: pose should be enabled");
        assert(result.meta.repairMaskApplied === false, "view_only_ultra: repair mask should be disabled");
        assert(result.meta.warning === null, "view_only_ultra: warning should be null");
        assert(isRecord(result.meta.stagePlan), "view_only_ultra: stagePlan missing");
        assert(result.meta.stagePlan.stage === "view_only", "view_only_ultra: stagePlan.stage mismatch");
        assert(
          result.meta.stagePlan.templateVersion === "ultra_view_only_v1",
          "view_only_ultra: stagePlan.templateVersion mismatch"
        );
        assert(
          Array.isArray(result.meta.stagePlan.views) &&
            result.meta.stagePlan.views.length === 1 &&
            result.meta.stagePlan.views[0] === "profile",
          "view_only_ultra: stagePlan.views mismatch"
        );
        assert(result.meta.stagePlan.candidateCount === 3, "view_only_ultra: stagePlan.candidateCount mismatch");
        assert(isRecord(result.meta.templateManifest), "view_only_ultra: templateManifest missing");
        assert(result.meta.templateManifest.stage === "view_only", "view_only_ultra: templateManifest.stage mismatch");
        assert(
          result.meta.templateManifest.template_version === "ultra_view_only_v1",
          "view_only_ultra: templateManifest.template_version mismatch"
        );
        assert(Array.isArray(result.meta.referenceBankSummary), "view_only_ultra: referenceBankSummary missing");
        assert(result.meta.referenceBankSummary.length === 3, "view_only_ultra: referenceBankSummary length mismatch");
        requireNodeTypes("view_only_ultra", classTypes, [
          "CheckpointLoaderSimple",
          "OpenposePreprocessor",
          "ControlNetLoader",
          "ControlNetApplyAdvanced",
          "IPAdapterUnifiedLoader",
          "IPAdapterAdvanced",
          "IPAdapterPreciseStyleTransfer",
          "IPAdapterPreciseComposition",
          "PrepImageForClipVision",
          "LatentUpscaleBy",
          "ImageScale",
          "VAEEncode",
          "SaveImage"
        ]);
        requireClassTypeCount("view_only_ultra", classTypeCounts, "ControlNetLoader", 3);
        requireClassTypeCount("view_only_ultra", classTypeCounts, "ControlNetApplyAdvanced", 3);
        requireNodeCountAtLeast("view_only_ultra", nodeCount, 28);
        assert(
          Array.isArray(result.meta.structureControlsApplied) &&
            result.meta.structureControlsApplied.length === 2 &&
            result.meta.structureControlsApplied.includes("lineart") &&
            result.meta.structureControlsApplied.includes("canny"),
          "view_only_ultra: structureControlsApplied mismatch"
        );
        assert(classTypes.includes("LatentUpscaleBy") || classTypes.includes("LatentUpscale"), "view_only_ultra: latent refine should be enabled");
        assert(!classTypes.includes("VAEEncodeForInpaint"), "view_only_ultra: repair inpaint node should be absent");
        assert(!classTypes.includes("SetLatentNoiseMask"), "view_only_ultra: latent noise mask should be absent");
        assert(!classTypes.includes("ImageCompositeMasked"), "view_only_ultra: composite node should be absent");
      }
    );

    const sideViewRefineCase = await runSmokeCase(
      "side_view_refine_ultra",
      "workflows/comfy/character/side_view_refine/ultra_side_view_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      ({ result, classTypes, classTypeCounts, nodeCount }) => {
        assert(result.meta.mode === "checkpoint-ultra-pose", "side_view_refine_ultra: expected checkpoint-ultra-pose mode");
        assert(result.meta.workflowStage === "side_view_refine", "side_view_refine_ultra: workflowStage mismatch");
        assert(
          result.meta.workflowTemplateVersion === "ultra_side_view_refine_v1",
          "side_view_refine_ultra: workflowTemplateVersion mismatch"
        );
        assert(result.meta.referenceMode === "img2img", "side_view_refine_ultra: referenceMode should be img2img");
        assert(result.meta.referenceApplied === true, "side_view_refine_ultra: reference should be applied");
        assert(result.meta.poseApplied === true, "side_view_refine_ultra: pose should be enabled");
        assert(result.meta.repairMaskApplied === false, "side_view_refine_ultra: repair mask should be disabled");
        assert(result.meta.warning === null, "side_view_refine_ultra: warning should be null");
        assert(isRecord(result.meta.stagePlan), "side_view_refine_ultra: stagePlan missing");
        assert(result.meta.stagePlan.stage === "side_view_refine", "side_view_refine_ultra: stagePlan.stage mismatch");
        assert(
          result.meta.stagePlan.templateVersion === "ultra_side_view_refine_v1",
          "side_view_refine_ultra: stagePlan.templateVersion mismatch"
        );
        assert(
          Array.isArray(result.meta.stagePlan.views) && result.meta.stagePlan.views.includes("profile"),
          "side_view_refine_ultra: stagePlan.views missing profile"
        );
        assert(isRecord(result.meta.templateManifest), "side_view_refine_ultra: templateManifest missing");
        assert(result.meta.templateManifest.stage === "side_view_refine", "side_view_refine_ultra: templateManifest.stage mismatch");
        assert(
          result.meta.templateManifest.template_version === "ultra_side_view_refine_v1",
          "side_view_refine_ultra: templateManifest.template_version mismatch"
        );
        assert(Array.isArray(result.meta.referenceBankSummary), "side_view_refine_ultra: referenceBankSummary missing");
        assert(result.meta.referenceBankSummary.length >= 3, "side_view_refine_ultra: referenceBankSummary too small");
        const referenceRoles = new Set(result.meta.referenceBankSummary.map((entry) => entry.role));
        assert(referenceRoles.has("front_master"), "side_view_refine_ultra: front_master role missing");
        assert(referenceRoles.has("composition"), "side_view_refine_ultra: composition role missing");
        requireNodeTypes("side_view_refine_ultra", classTypes, [
          "CheckpointLoaderSimple",
          "OpenposePreprocessor",
          "ControlNetLoader",
          "ControlNetApplyAdvanced",
          "IPAdapterUnifiedLoader",
          "IPAdapterAdvanced",
          "IPAdapterPreciseStyleTransfer",
          "IPAdapterPreciseComposition",
          "PrepImageForClipVision",
          "LatentUpscaleBy",
          "ImageScale",
          "VAEEncode",
          "SaveImage"
        ]);
        requireClassTypeCount("side_view_refine_ultra", classTypeCounts, "ControlNetLoader", 4);
        requireClassTypeCount("side_view_refine_ultra", classTypeCounts, "ControlNetApplyAdvanced", 4);
        requireNodeCountAtLeast("side_view_refine_ultra", nodeCount, 34);
        assert(
          Array.isArray(result.meta.structureControlsApplied) &&
            result.meta.structureControlsApplied.length === 3 &&
            result.meta.structureControlsApplied.includes("lineart") &&
            result.meta.structureControlsApplied.includes("canny") &&
            result.meta.structureControlsApplied.includes("depth"),
          "side_view_refine_ultra: structureControlsApplied mismatch"
        );
        requireStructureControlProvenance(
          "side_view_refine_ultra",
          result.meta.structureControlsSummary,
          "lineart",
          {
            sourceRole: "composition",
            sourceRefId: "draft_profile_composition",
            sourceView: "profile"
          }
        );
        requireStructureControlProvenance(
          "side_view_refine_ultra",
          result.meta.structureControlsSummary,
          "depth",
          {
            sourceRole: "composition",
            sourceRefId: "draft_profile_composition",
            sourceView: "profile"
          }
        );
        assert(classTypes.includes("LatentUpscaleBy") || classTypes.includes("LatentUpscale"), "side_view_refine_ultra: latent refine should be enabled");
        assert(!classTypes.includes("VAEEncodeForInpaint"), "side_view_refine_ultra: repair inpaint node should be absent");
        assert(!classTypes.includes("SetLatentNoiseMask"), "side_view_refine_ultra: latent noise mask should be absent");
        assert(!classTypes.includes("ImageCompositeMasked"), "side_view_refine_ultra: composite node should be absent");
      }
    );

    const identityLockCase = await runSmokeCase(
      "identity_lock_refine_ultra",
      "workflows/comfy/character/identity_lock_refine/ultra_identity_lock_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      ({ result, classTypes, classTypeCounts, nodeCount }) => {
        assert(result.meta.mode === "checkpoint-ultra-pose", "identity_lock_refine_ultra: expected checkpoint-ultra-pose mode");
        assert(result.meta.workflowStage === "identity_lock_refine", "identity_lock_refine_ultra: workflowStage mismatch");
        assert(
          result.meta.workflowTemplateVersion === "ultra_identity_lock_refine_v1",
          "identity_lock_refine_ultra: workflowTemplateVersion mismatch"
        );
        assert(result.meta.referenceMode === "img2img", "identity_lock_refine_ultra: referenceMode should be img2img");
        assert(result.meta.referenceApplied === true, "identity_lock_refine_ultra: reference should be applied");
        assert(result.meta.poseApplied === true, "identity_lock_refine_ultra: pose should be enabled");
        assert(result.meta.repairMaskApplied === false, "identity_lock_refine_ultra: repair mask should be disabled");
        assert(isRecord(result.meta.stagePlan), "identity_lock_refine_ultra: stagePlan missing");
        assert(result.meta.stagePlan.stage === "identity_lock_refine", "identity_lock_refine_ultra: stagePlan.stage mismatch");
        assert(isRecord(result.meta.templateManifest), "identity_lock_refine_ultra: templateManifest missing");
        assert(
          result.meta.templateManifest.stage === "identity_lock_refine",
          "identity_lock_refine_ultra: templateManifest.stage mismatch"
        );
        assert(Array.isArray(result.meta.referenceBankSummary), "identity_lock_refine_ultra: referenceBankSummary missing");
        assert(result.meta.referenceBankSummary.length === 3, "identity_lock_refine_ultra: referenceBankSummary length mismatch");
        requireNodeTypes("identity_lock_refine_ultra", classTypes, [
          "CheckpointLoaderSimple",
          "OpenposePreprocessor",
          "ControlNetLoader",
          "ControlNetApplyAdvanced",
          "IPAdapterUnifiedLoader",
          "IPAdapterAdvanced",
          "IPAdapterPreciseStyleTransfer",
          "IPAdapterPreciseComposition",
          "PrepImageForClipVision",
          "LatentUpscaleBy",
          "ImageScale",
          "VAEEncode",
          "SaveImage"
        ]);
        requireClassTypeCount("identity_lock_refine_ultra", classTypeCounts, "ControlNetLoader", 4);
        requireClassTypeCount("identity_lock_refine_ultra", classTypeCounts, "ControlNetApplyAdvanced", 4);
        requireNodeCountAtLeast("identity_lock_refine_ultra", nodeCount, 34);
        assert(
          Array.isArray(result.meta.structureControlsApplied) &&
            result.meta.structureControlsApplied.length === 3 &&
            result.meta.structureControlsApplied.includes("lineart") &&
            result.meta.structureControlsApplied.includes("canny") &&
            result.meta.structureControlsApplied.includes("depth"),
          "identity_lock_refine_ultra: structureControlsApplied mismatch"
        );
        assert(
          classTypes.includes("LatentUpscaleBy") || classTypes.includes("LatentUpscale"),
          "identity_lock_refine_ultra: latent refine should be enabled"
        );
      }
    );

    const identityLockCompositionRequiredCase = await runSmokeCase(
      "identity_lock_refine_missing_composition_contract",
      "workflows/comfy/character/identity_lock_refine/ultra_identity_lock_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        clone.referenceBank = Array.isArray(clone.referenceBank)
          ? clone.referenceBank.filter((entry) => entry?.role !== "composition")
          : clone.referenceBank;
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "required_reference_roles_missing:composition"
      }
    );

    const sideViewRefinePoseRequiredCase = await runSmokeCase(
      "side_view_refine_missing_pose_contract",
      "workflows/comfy/character/side_view_refine/ultra_side_view_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        delete clone.poseImageBase64;
        delete clone.poseMimeType;
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "pose_input_required"
      }
    );

    const sideViewRefineRoleRequiredCase = await runSmokeCase(
      "side_view_refine_missing_composition_contract",
      "workflows/comfy/character/side_view_refine/ultra_side_view_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        clone.referenceBank = Array.isArray(clone.referenceBank)
          ? clone.referenceBank.filter((entry) => entry?.role !== "composition")
          : clone.referenceBank;
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "required_reference_roles_missing:composition"
      }
    );

    const identityLockApprovedViewCase = await runSmokeCase(
      "identity_lock_refine_invalid_view_contract",
      "workflows/comfy/character/identity_lock_refine/ultra_identity_lock_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        clone.view = "front";
        clone.stagePlan = {
          ...clone.stagePlan,
          views: ["front"]
        };
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "approved_view_required:front"
      }
    );

    const sideViewPoseRequiredCase = await runSmokeCase(
      "side_view_base_missing_pose_contract",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        delete clone.poseImageBase64;
        delete clone.poseMimeType;
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "pose_input_required"
      }
    );

    const sideViewStructureRequiredCase = await runSmokeCase(
      "side_view_base_missing_structure_controls_contract",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        delete clone.structureControls;
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "structure_controls_required"
      }
    );

    const sideViewUnexpectedDepthCase = await runSmokeCase(
      "side_view_base_unexpected_depth_structure_contract",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        clone.structureControls = {
          ...(isRecord(clone.structureControls) ? clone.structureControls : {}),
          depth: {
            imageBase64: ONE_PIXEL_PNG_BASE64,
            mimeType: "image/png",
            strength: 0.28,
            endPercent: 0.62
          }
        };
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "unexpected_structure_controls:depth"
      }
    );

    const sideViewRefineDepthRequiredCase = await runSmokeCase(
      "side_view_refine_missing_depth_structure_contract",
      "workflows/comfy/character/side_view_refine/ultra_side_view_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        if (isRecord(clone.structureControls)) {
          delete clone.structureControls.depth;
        }
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "required_structure_controls_missing:depth"
      }
    );

    const viewOnlyReferenceRequiredCase = await runSmokeCase(
      "view_only_missing_reference_contract",
      "workflows/comfy/character/view_only/ultra_view_only_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        delete clone.referenceImageBase64;
        delete clone.referenceMimeType;
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "reference_image_required"
      }
    );

    const sideViewPoseCapabilityCase = await runSmokeCase(
      "side_view_base_missing_pose_capability",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      undefined,
      {
        beforeRequest: async () => {
          fakeComfy.setObjectInfo(
            removeObjectNodes(createFakeObjectInfo(), [
              "OpenposePreprocessor",
              "ControlNetLoader",
              "ControlNetApplyAdvanced"
            ])
          );
        },
        afterRequest: async () => {
          fakeComfy.resetObjectInfo();
        },
        expectFailure: true,
        expectedErrorIncludes: "pose_capability_required"
      }
    );

    const sideViewLatentRefineCapabilityCase = await runSmokeCase(
      "side_view_base_missing_latent_refine_capability",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      undefined,
      {
        beforeRequest: async () => {
          fakeComfy.setObjectInfo(removeObjectNodes(createFakeObjectInfo(), ["LatentUpscaleBy", "LatentUpscale"]));
        },
        afterRequest: async () => {
          fakeComfy.resetObjectInfo();
        },
        expectFailure: true,
        expectedErrorIncludes: "latent_refine_capability_required"
      }
    );

    const sideViewStructureCapabilityCase = await runSmokeCase(
      "side_view_base_missing_lineart_structure_capability",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      undefined,
      {
        beforeRequest: async () => {
          fakeComfy.setObjectInfo(
            removeControlNetModelNames(createFakeObjectInfo(), ["controlnet-lineart.safetensors"])
          );
        },
        afterRequest: async () => {
          fakeComfy.resetObjectInfo();
        },
        expectFailure: true,
        expectedErrorIncludes: "structure_control_capability_required:lineart"
      }
    );

    const sideViewInvalidStructureScheduleCase = await runSmokeCase(
      "side_view_base_invalid_structure_schedule",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        if (isRecord(clone.structureControls?.lineart)) {
          clone.structureControls.lineart.startPercent = 0.88;
          clone.structureControls.lineart.endPercent = 0.44;
        }
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "invalid_structure_schedule:lineart"
      }
    );

    const sideViewLineartWrongSourceRoleCase = await runSmokeCase(
      "side_view_base_lineart_wrong_source_role",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        if (isRecord(clone.structureControls?.lineart)) {
          clone.structureControls.lineart.sourceRole = "front_master";
        }
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "structure_control_source_role_required:lineart:composition"
      }
    );

    const sideViewCannyMissingSourceRefCase = await runSmokeCase(
      "side_view_base_canny_missing_source_ref",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        if (isRecord(clone.structureControls?.canny)) {
          clone.structureControls.canny.sourceRefId = "missing_composition_ref";
        }
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "structure_control_source_ref_missing:canny:missing_composition_ref"
      }
    );

    const sideViewLineartMissingSourceViewCase = await runSmokeCase(
      "side_view_base_lineart_missing_source_view",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        if (isRecord(clone.structureControls?.lineart)) {
          delete clone.structureControls.lineart.sourceView;
        }
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "structure_control_source_trace_missing:lineart:sourceView"
      }
    );

    const repairDepthWrongSourceRoleCase = await runSmokeCase(
      "repair_refine_depth_wrong_source_role",
      "workflows/comfy/character/repair_refine/ultra_repair_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        if (isRecord(clone.structureControls?.depth)) {
          clone.structureControls.depth.sourceRole = "composition";
        }
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "structure_control_source_role_required:depth:repair_base"
      }
    );

    const repairCase = await runSmokeCase(
      "repair_refine_ultra",
      "workflows/comfy/character/repair_refine/ultra_repair_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      ({ result, classTypes, classTypeCounts, nodeCount }) => {
        assert(
          nonEmptyString(result.meta.mode) && result.meta.mode.startsWith("checkpoint-ultra"),
          "repair_refine_ultra: expected checkpoint-ultra* mode"
        );
        assert(result.meta.workflowStage === "repair_refine", "repair_refine_ultra: workflowStage mismatch");
        assert(result.meta.referenceMode === "img2img", "repair_refine_ultra: referenceMode should be img2img");
        assert(result.meta.referenceApplied === true, "repair_refine_ultra: reference should be applied");
        assert(result.meta.poseApplied === true, "repair_refine_ultra: pose should be enabled");
        assert(result.meta.repairMaskApplied === true, "repair_refine_ultra: repair mask should be enabled");
        assert(result.meta.repairMaskSource === "explicit", "repair_refine_ultra: repairMaskSource should be explicit");
        assert(nonEmptyString(result.meta.repairMaskFileName), "repair_refine_ultra: repairMaskFileName missing");
        assert(nonEmptyString(result.meta.poseFileName), "repair_refine_ultra: poseFileName missing");
        assert(isRecord(result.meta.workflowSummary), "repair_refine_ultra: workflowSummary missing");
        assert(isRecord(result.meta.capabilitySnapshot), "repair_refine_ultra: capabilitySnapshot missing");
        assert(result.meta.capabilitySnapshot.hasImageCompositeMasked === true, "repair_refine_ultra: composite capability missing");
        assert(isRecord(result.meta.stagePlan), "repair_refine_ultra: stagePlan missing");
        assert(result.meta.stagePlan.repairFromStage === "identity_lock_refine", "repair_refine_ultra: repairFromStage mismatch");
        assert(result.meta.stagePlan.acceptedByGate === true, "repair_refine_ultra: acceptedByGate mismatch");
        assert(result.meta.stagePlan.gateDecision === "promote_lock", "repair_refine_ultra: gateDecision mismatch");
        requireNodeTypes("repair_refine_ultra", classTypes, [
          "CheckpointLoaderSimple",
          "OpenposePreprocessor",
          "ControlNetLoader",
          "ControlNetApplyAdvanced",
          "IPAdapterUnifiedLoader",
          "IPAdapterAdvanced",
          "PrepImageForClipVision",
          "VAEEncodeForInpaint",
          "SetLatentNoiseMask",
          "ImageCompositeMasked",
          "SaveImage"
        ]);
        requireClassTypeCount("repair_refine_ultra", classTypeCounts, "ControlNetLoader", 4);
        requireClassTypeCount("repair_refine_ultra", classTypeCounts, "ControlNetApplyAdvanced", 4);
        requireNodeCountAtLeast("repair_refine_ultra", nodeCount, 42);
        assert(
          Array.isArray(result.meta.structureControlsApplied) &&
            result.meta.structureControlsApplied.length === 3 &&
            result.meta.structureControlsApplied.includes("lineart") &&
            result.meta.structureControlsApplied.includes("canny") &&
            result.meta.structureControlsApplied.includes("depth"),
          "repair_refine_ultra: structureControlsApplied mismatch"
        );
        requireStructureControlProvenance(
          "repair_refine_ultra",
          result.meta.structureControlsSummary,
          "lineart",
          {
            sourceRole: "composition",
            sourceRefId: "repair_composition",
            sourceView: "threeQuarter"
          }
        );
        requireStructureControlProvenance(
          "repair_refine_ultra",
          result.meta.structureControlsSummary,
          "depth",
          {
            sourceRole: "repair_base",
            sourceRefId: "repair_base",
            sourceView: "threeQuarter"
          }
        );
      }
    );

    const repairAlphaFallbackCase = await runSmokeCase(
      "repair_refine_reference_alpha_fallback",
      "workflows/comfy/character/repair_refine/ultra_repair_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      ({ result, classTypes, classTypeCounts }) => {
        assert(
          nonEmptyString(result.meta.mode) && result.meta.mode.startsWith("checkpoint-ultra"),
          "repair_refine_reference_alpha_fallback: expected checkpoint-ultra* mode"
        );
        assert(
          result.meta.workflowStage === "repair_refine",
          "repair_refine_reference_alpha_fallback: workflowStage mismatch"
        );
        assert(
          result.meta.referenceMode === "img2img",
          "repair_refine_reference_alpha_fallback: referenceMode should be img2img"
        );
        assert(
          result.meta.referenceApplied === true,
          "repair_refine_reference_alpha_fallback: reference should be applied"
        );
        assert(result.meta.poseApplied === true, "repair_refine_reference_alpha_fallback: pose should be enabled");
        assert(
          result.meta.repairMaskApplied === true,
          "repair_refine_reference_alpha_fallback: repair mask should still be enabled"
        );
        assert(
          result.meta.repairMaskSource === "reference_alpha",
          "repair_refine_reference_alpha_fallback: repairMaskSource should fall back to reference_alpha"
        );
        assert(
          result.meta.repairMaskFileName === null,
          "repair_refine_reference_alpha_fallback: repairMaskFileName should be null"
        );
        requireNodeTypes("repair_refine_reference_alpha_fallback", classTypes, [
          "OpenposePreprocessor",
          "ControlNetLoader",
          "ControlNetApplyAdvanced",
          "VAEEncodeForInpaint",
          "MaskToImage",
          "ImageToMask",
          "ImageCompositeMasked"
        ]);
        requireClassTypeCount("repair_refine_reference_alpha_fallback", classTypeCounts, "ControlNetLoader", 4);
        requireClassTypeCount("repair_refine_reference_alpha_fallback", classTypeCounts, "ControlNetApplyAdvanced", 4);
      },
      (payload) => {
        const clone = structuredClone(payload);
        delete clone.repairMaskImageBase64;
        delete clone.repairMaskMimeType;
        return clone;
      }
    );

    const repairNoPoseCase = await runSmokeCase(
      "repair_refine_without_pose",
      "workflows/comfy/character/repair_refine/ultra_repair_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      ({ result, classTypes, classTypeCounts, nodeCount }) => {
        assert(
          result.meta.mode === "checkpoint-ultra-repair",
          "repair_refine_without_pose: expected checkpoint-ultra-repair mode"
        );
        assert(result.meta.workflowStage === "repair_refine", "repair_refine_without_pose: workflowStage mismatch");
        assert(result.meta.referenceMode === "img2img", "repair_refine_without_pose: referenceMode should be img2img");
        assert(result.meta.referenceApplied === true, "repair_refine_without_pose: reference should be applied");
        assert(result.meta.poseApplied === false, "repair_refine_without_pose: pose should be disabled");
        assert(result.meta.poseFileName === null, "repair_refine_without_pose: poseFileName should be null");
        assert(result.meta.repairMaskApplied === true, "repair_refine_without_pose: repair mask should stay enabled");
        assert(
          result.meta.repairMaskSource === "explicit",
          "repair_refine_without_pose: repairMaskSource should remain explicit"
        );
        assert(!classTypes.includes("OpenposePreprocessor"), "repair_refine_without_pose: pose node should be absent");
        requireNodeTypes("repair_refine_without_pose", classTypes, [
          "VAEEncodeForInpaint",
          "ImageCompositeMasked",
          "IPAdapterUnifiedLoader",
          "SaveImage"
        ]);
        requireClassTypeCount("repair_refine_without_pose", classTypeCounts, "ControlNetLoader", 3);
        requireClassTypeCount("repair_refine_without_pose", classTypeCounts, "ControlNetApplyAdvanced", 3);
        requireNodeCountAtLeast("repair_refine_without_pose", nodeCount, 34);
        assert(
          Array.isArray(result.meta.structureControlsApplied) &&
            result.meta.structureControlsApplied.length === 3 &&
            result.meta.structureControlsApplied.includes("lineart") &&
            result.meta.structureControlsApplied.includes("canny") &&
            result.meta.structureControlsApplied.includes("depth"),
          "repair_refine_without_pose: structureControlsApplied mismatch"
        );
      },
      (payload) => {
        const clone = structuredClone(payload);
        delete clone.poseImageBase64;
        delete clone.poseMimeType;
        return clone;
      }
    );

    const repairMissingGateLineageCase = await runSmokeCase(
      "repair_refine_missing_gate_lineage_contract",
      "workflows/comfy/character/repair_refine/ultra_repair_refine_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      () => {},
      (payload) => {
        const clone = structuredClone(payload);
        clone.stagePlan = {
          ...clone.stagePlan,
          acceptedByGate: false
        };
        return clone;
      },
      {
        expectFailure: true,
        expectedErrorIncludes: "repair_base_not_gate_accepted"
      }
    );

    const sideViewBaseStructureVariantCase = await runSmokeCase(
      "side_view_base_structure_variant",
      "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      ({ result, classTypeCounts }) => {
        assert(result.meta.mode === "checkpoint-ultra-pose", "side_view_base_structure_variant: expected checkpoint-ultra-pose");
        requireClassTypeCount("side_view_base_structure_variant", classTypeCounts, "ControlNetApplyAdvanced", 3);
      },
      (payload) => {
        const clone = structuredClone(payload);
        if (isRecord(clone.structureControls?.lineart)) {
          clone.structureControls.lineart.strength = 0.52;
        }
        return clone;
      }
    );

    const frontRepeatCase = await runSmokeCase(
      "front_master_ultra_repeat",
      "workflows/comfy/character/front_master/ultra_front_master_v1.payload.sample.json",
      report.adapter_url,
      fakeComfy.promptRecords,
      ({ result }) => {
        assert(result.meta.mode === "checkpoint-ultra", "front_master_ultra_repeat: expected checkpoint-ultra mode");
      }
    );

    assert(
      frontRepeatCase.workflowHash === frontCase.workflowHash,
      "workflowHash should be deterministic for identical front_master payloads"
    );
    assert(
      repairAlphaFallbackCase.workflowHash !== repairCase.workflowHash,
      "workflowHash should change when repair mask source changes"
    );
    assert(
      repairNoPoseCase.workflowHash !== repairCase.workflowHash,
      "workflowHash should change when pose guidance is removed"
    );
    assert(
      sideViewBaseCase.workflowHash !== viewOnlyCase.workflowHash,
      "workflowHash should differ between side_view_base and view_only payloads"
    );
    assert(
      sideViewRefineCase.workflowHash !== sideViewBaseCase.workflowHash,
      "workflowHash should differ between side_view_refine and side_view_base payloads"
    );
    assert(
      identityLockCase.workflowHash !== sideViewRefineCase.workflowHash,
      "workflowHash should differ between identity_lock_refine and side_view_refine payloads"
    );
    assert(
      sideViewBaseStructureVariantCase.workflowHash !== sideViewBaseCase.workflowHash,
      "workflowHash should change when structure control strength changes"
    );

    report.hash_checks = {
      front_repeat_stable: frontRepeatCase.workflowHash === frontCase.workflowHash,
      repair_alpha_fallback_differs: repairAlphaFallbackCase.workflowHash !== repairCase.workflowHash,
      repair_without_pose_differs: repairNoPoseCase.workflowHash !== repairCase.workflowHash,
      side_view_vs_view_only_differs: sideViewBaseCase.workflowHash !== viewOnlyCase.workflowHash,
      side_view_refine_differs: sideViewRefineCase.workflowHash !== sideViewBaseCase.workflowHash,
      identity_lock_refine_differs: identityLockCase.workflowHash !== sideViewRefineCase.workflowHash,
      structure_variant_differs: sideViewBaseStructureVariantCase.workflowHash !== sideViewBaseCase.workflowHash
    };
    report.cases.push(
      frontCase,
      frontMissingStructureTraceCase,
      sideViewBaseCase,
      sideViewRefineCase,
      identityLockCase,
      viewOnlyCase,
      identityLockCompositionRequiredCase,
      sideViewRefinePoseRequiredCase,
      sideViewRefineRoleRequiredCase,
      identityLockApprovedViewCase,
      sideViewPoseRequiredCase,
      sideViewStructureRequiredCase,
      sideViewUnexpectedDepthCase,
      sideViewRefineDepthRequiredCase,
      viewOnlyReferenceRequiredCase,
      sideViewPoseCapabilityCase,
      sideViewLatentRefineCapabilityCase,
      sideViewStructureCapabilityCase,
      sideViewInvalidStructureScheduleCase,
      sideViewLineartWrongSourceRoleCase,
      sideViewCannyMissingSourceRefCase,
      sideViewLineartMissingSourceViewCase,
      repairCase,
      repairAlphaFallbackCase,
      repairNoPoseCase,
      repairMissingGateLineageCase,
      repairDepthWrongSourceRoleCase,
      sideViewBaseStructureVariantCase,
      frontRepeatCase
    );
    report.adapter_stdout_tail = tailLines(adapterStdout);
    report.adapter_stderr_tail = tailLines(adapterStderr);
    writeReport(report);

    console.log("[comfy-adapter-fake-smoke] PASS");
    console.log(`  report=${REPORT_PATH}`);
    console.log(`  cases=${report.cases.length}`);
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && isRecord(error.cause)) {
      report.error_context = error.cause;
    }
    report.adapter_stdout_tail = tailLines(adapterStdout);
    report.adapter_stderr_tail = tailLines(adapterStderr);
    writeReport(report);
    console.error("[comfy-adapter-fake-smoke] FAIL");
    console.error(`  report=${REPORT_PATH}`);
    console.error(`  error=${report.error}`);
    process.exitCode = 1;
  } finally {
    fakeComfy.server.close();
    if (adapter.exitCode === null) {
      adapter.kill();
      try {
        await once(adapter, "exit");
      } catch {
        // ignore shutdown race
      }
    }
  }
}

main();
