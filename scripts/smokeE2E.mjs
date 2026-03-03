#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const API_BASE_URL = process.env.SMOKE_API_BASE_URL ?? "http://localhost:3000";
const POLL_INTERVAL_MS = 1000;
const TIMEOUT_MS = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? "300000", 10);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEnvFile(filePath) {
  const output = new Map();
  if (!fs.existsSync(filePath)) {
    return output;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    output.set(key, value);
  }

  return output;
}

function resolveApiKey() {
  if (process.env.API_KEY && process.env.API_KEY.trim().length > 0) {
    return process.env.API_KEY.trim();
  }

  const rootEnv = parseEnvFile(path.join(repoRoot, ".env"));
  const value = rootEnv.get("API_KEY");
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toJsonText(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();

  let data = null;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    text
  };
}

function extractFromData(data, pathParts) {
  let current = data;
  for (const part of pathParts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

function listMp4Files(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function bool(value) {
  return value === true;
}

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

async function main() {
  if (!Number.isInteger(TIMEOUT_MS) || TIMEOUT_MS <= 0) {
    throw new Error("SMOKE_TIMEOUT_MS must be a positive integer");
  }

  const apiKey = resolveApiKey();
  const headers = {
    "content-type": "application/json",
    accept: "application/json"
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const startedAt = Date.now();
  const topic = `Smoke E2E ${new Date().toISOString()}`;

  const enqueue = await fetchJson(`${API_BASE_URL}/api/episodes`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      topic,
      targetDurationSec: 180,
      jobType: "GENERATE_BEATS",
      pipeline: {
        stopAfterPreview: true,
        autoRenderFinal: false
      }
    })
  });

  if (!enqueue.ok) {
    throw new Error(`POST /api/episodes failed (${enqueue.status}): ${toJsonText(enqueue.data ?? enqueue.text)}`);
  }

  const episodeId =
    extractFromData(enqueue.data, ["data", "episode", "id"]) ??
    extractFromData(enqueue.data, ["data", "episodeId"]) ??
    extractFromData(enqueue.data, ["episodeId"]);
  const rootJobId =
    extractFromData(enqueue.data, ["data", "job", "id"]) ??
    extractFromData(enqueue.data, ["data", "jobId"]) ??
    extractFromData(enqueue.data, ["jobId"]);

  if (typeof episodeId !== "string" || episodeId.trim().length === 0) {
    throw new Error(`POST /api/episodes returned no episodeId: ${toJsonText(enqueue.data)}`);
  }

  if (typeof rootJobId !== "string" || rootJobId.trim().length === 0) {
    throw new Error(`POST /api/episodes returned no root job id: ${toJsonText(enqueue.data)}`);
  }

  const episodeOutDir = path.join(repoRoot, "out", episodeId);
  const previewPath = path.join(episodeOutDir, "preview.mp4");
  const qcPath = path.join(episodeOutDir, "qc_report.json");

  let pollCount = 0;
  let lastEpisodeStatus = "UNKNOWN";
  let lastJobStatus = "UNKNOWN";
  let lastJobId = rootJobId;
  let lastError = "";

  while (Date.now() - startedAt < TIMEOUT_MS) {
    const [statusRes, jobsRes] = await Promise.all([
      fetchJson(`${API_BASE_URL}/episodes/${encodeURIComponent(episodeId)}/status`, {
        method: "GET",
        headers: apiKey ? { "x-api-key": apiKey, accept: "application/json" } : { accept: "application/json" }
      }),
      fetchJson(`${API_BASE_URL}/api/jobs?episodeId=${encodeURIComponent(episodeId)}&limit=30`, {
        method: "GET",
        headers: apiKey ? { "x-api-key": apiKey, accept: "application/json" } : { accept: "application/json" }
      })
    ]);

    if (!statusRes.ok) {
      throw new Error(
        `GET /episodes/${episodeId}/status failed (${statusRes.status}): ${toJsonText(statusRes.data ?? statusRes.text)}`
      );
    }
    if (!jobsRes.ok) {
      throw new Error(`GET /api/jobs failed (${jobsRes.status}): ${toJsonText(jobsRes.data ?? jobsRes.text)}`);
    }

    const statusData = extractFromData(statusRes.data, ["data"]);
    const jobsData = extractFromData(jobsRes.data, ["data"]);

    const episodeStatus = normalizeString(extractFromData(statusData, ["episodeStatus"]), "UNKNOWN");
    const previewExistsFromApi = bool(extractFromData(statusData, ["preview", "exists"]));
    const latestJob = extractFromData(statusData, ["latestJob"]);
    const latestJobStatus = normalizeString(extractFromData(latestJob, ["status"]), "UNKNOWN");
    const latestJobId = normalizeString(extractFromData(latestJob, ["id"]), rootJobId);
    const latestJobError = normalizeString(extractFromData(latestJob, ["lastError"]), "");

    lastEpisodeStatus = episodeStatus;
    lastJobStatus = latestJobStatus;
    lastJobId = latestJobId;
    lastError = latestJobError;

    const failedJobs = Array.isArray(jobsData)
      ? jobsData.filter(
          (row) => row && typeof row === "object" && row.status === "FAILED"
        )
      : [];
    if (failedJobs.length > 0) {
      const first = failedJobs[0];
      const failedId = normalizeString(first.id, "(unknown)");
      const failedType = normalizeString(first.type, "(unknown)");
      const failedErr = normalizeString(first.lastError, "(none)");
      throw new Error(`Pipeline failed: job=${failedId} type=${failedType} error=${failedErr}`);
    }

    const previewExists = previewExistsFromApi || fs.existsSync(previewPath);
    const qcExists = fs.existsSync(qcPath);
    const previewReady = episodeStatus === "PREVIEW_READY" || episodeStatus === "COMPLETED";

    pollCount += 1;
    if (pollCount % 5 === 0) {
      console.log(
        `[smoke:e2e] episode=${episodeId} episodeStatus=${episodeStatus} latestJob=${latestJobId}:${latestJobStatus} preview=${previewExists ? "yes" : "no"} qc=${qcExists ? "yes" : "no"}`
      );
    }

    if (previewReady && previewExists && qcExists) {
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      const mp4Files = listMp4Files(episodeOutDir);

      if (mp4Files.length === 0) {
        throw new Error(`Preview marked ready but no mp4 files found in ${episodeOutDir}`);
      }

      console.log("SMOKE E2E: PASS");
      console.log(`  rootJobId=${rootJobId}`);
      console.log(`  latestJobId=${latestJobId}`);
      console.log(`  episodeId=${episodeId}`);
      console.log(`  episodeStatus=${episodeStatus}`);
      console.log(`  elapsedSec=${elapsedSec}`);
      console.log(`  outDir=${episodeOutDir}`);
      console.log(`  preview=${previewPath}`);
      console.log(`  qc=${qcPath}`);
      console.log(`  mp4=${mp4Files.join(", ")}`);
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out after ${TIMEOUT_MS}ms waiting for preview readiness. episodeStatus=${lastEpisodeStatus} latestJob=${lastJobId}:${lastJobStatus} lastError=${lastError || "(none)"}`
  );
}

main().catch((error) => {
  console.error("SMOKE E2E: FAIL");
  console.error(`  reason=${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
