#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const API_BASE_URL = process.env.SMOKE_API_BASE_URL ?? "http://localhost:3000";
const POLL_INTERVAL_MS = 1000;
const TIMEOUT_MS = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? "420000", 10);
const HEALTH_WAIT_MS = Number.parseInt(process.env.SMOKE_HEALTH_WAIT_MS ?? "45000", 10);
const FORCE_NEW_EPISODE = (process.env.SMOKE_FORCE_NEW_EPISODE ?? "1").trim().toLowerCase() !== "0";
const LAST_RUN_PATH = process.env.SMOKE_LAST_RUN_PATH?.trim() || path.join(repoRoot, "out", "smoke_e2e_last.json");
const PIPELINE_TARGET = (process.env.SMOKE_PIPELINE_TARGET ?? "full").trim().toLowerCase();
const RUN_MANIFEST_SELFTEST = (process.env.SMOKE_E2E_MANIFEST_SELFTEST ?? "0").trim().toLowerCase() === "1";

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

function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function parseTimeMs(value) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function bool(value) {
  return value === true;
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

function collectManifestPathCandidates(episodeOutDir, latestJob, jobsData) {
  const candidates = [
    {
      path: path.join(episodeOutDir, "upload_manifest.json"),
      source: "default"
    }
  ];
  const addCandidate = (value, source) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return;
    }
    candidates.push({ path: trimmed, source });
  };

  addCandidate(extractFromData(latestJob, ["details", "manifestPath"]), "latestJob.details.manifestPath");
  if (Array.isArray(jobsData)) {
    for (let index = 0; index < jobsData.length; index += 1) {
      const row = jobsData[index];
      const rowId = normalizeString(extractFromData(row, ["id"]), `index:${index}`);
      addCandidate(extractFromData(row, ["details", "manifestPath"]), `jobs[${rowId}].details.manifestPath`);
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) {
      continue;
    }
    seen.add(candidate.path);
    deduped.push(candidate);
  }

  return deduped;
}

function resolveManifestPath(episodeOutDir, latestJob, jobsData) {
  const candidates = collectManifestPathCandidates(episodeOutDir, latestJob, jobsData);
  const existing = candidates.find((candidate) => fs.existsSync(candidate.path));
  if (existing) {
    return {
      path: existing.path,
      source: existing.source,
      exists: true,
      candidates
    };
  }
  return {
    path: candidates[0].path,
    source: candidates[0].source,
    exists: false,
    candidates
  };
}

function runManifestFallbackSelftest() {
  const testRoot = path.join(repoRoot, "out", "smoke_e2e_manifest_selftest");
  fs.mkdirSync(testRoot, { recursive: true });
  const fallbackPath = path.join(testRoot, "upload_manifest_fallback.json");
  fs.writeFileSync(
    fallbackPath,
    `${JSON.stringify({ status: "TEST" }, null, 2)}\n`,
    "utf8"
  );

  const latestJob = {
    details: {
      manifestPath: fallbackPath
    }
  };
  const jobsData = [
    {
      id: "selftest-job-1",
      details: {
        manifestPath: fallbackPath
      }
    }
  ];

  const resolved = resolveManifestPath(testRoot, latestJob, jobsData);
  if (resolved.path !== fallbackPath || resolved.source !== "latestJob.details.manifestPath" || !resolved.exists) {
    throw new Error(
      `manifest selftest failed: path=${resolved.path} source=${resolved.source} exists=${String(resolved.exists)}`
    );
  }

  console.log("SMOKE E2E MANIFEST SELFTEST: PASS");
  console.log(`  resolvedPath=${resolved.path}`);
  console.log(`  source=${resolved.source}`);
}

function printFixHints(extraReason) {
  console.error("  quick_fixes:");
  if (extraReason) {
    console.error(`    - reason_hint: ${extraReason}`);
  }
  console.error("    - start full stack: pnpm dev");
  console.error("    - infra only: pnpm docker:up");
  console.error("    - run migrations: pnpm db:migrate");
  console.error("    - api only: pnpm -C apps/api run dev");
  console.error("    - worker only: pnpm -C apps/worker run dev");
  console.error("    - docker preflight: pnpm smoke:docker");
}

function writeLastRunMetadata(payload) {
  try {
    const outDir = path.dirname(LAST_RUN_PATH);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      LAST_RUN_PATH,
      `${JSON.stringify(
        {
          ...payload,
          updatedAt: new Date().toISOString()
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[smoke:e2e] warning: failed to write last-run metadata (${message})`);
  }
}

function runPreviewSmoke() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(command, ["-C", "apps/video", "run", "qc:smoke"], {
    cwd: repoRoot,
    stdio: "inherit"
  });
  if (result.error || result.status !== 0) {
    const videoDir = path.join(repoRoot, "apps", "video");
    const fallback = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "src/qc/renderPreview.ts", "--dry-run"],
      {
        cwd: videoDir,
        stdio: "inherit"
      }
    );
    if (fallback.error) {
      throw fallback.error;
    }
    if (fallback.status !== 0) {
      throw new Error(
        `preview smoke failed (pnpm_exit=${result.status ?? "err"} fallback_exit=${fallback.status ?? "err"})`
      );
    }
    return;
  }
}

function runActionOverrideSmoke(episodeOutDir) {
  const videoDir = path.join(repoRoot, "apps", "video");
  const propsPath = path.join(episodeOutDir, "preview.props.json");
  const outputDir = path.join(episodeOutDir, "action-override-checks");
  const reportPath = path.join(episodeOutDir, "action-override-check-report.json");
  const summaryPath = path.join(episodeOutDir, "action-override-check-summary.md");

  if (!fs.existsSync(propsPath)) {
    throw new Error(`action override smoke props missing: ${propsPath}`);
  }

  const args = [
    "node_modules/tsx/dist/cli.mjs",
    "src/qc/renderActionOverrideChecks.ts",
    "--max-shots=3",
    "--strict-missing",
    "--strict-degrade",
    "--degrade-ratio=0.30",
    "--min-bytes=50000",
    "--render-stills",
    "--min-still-bytes=10000",
    `--props-path=${propsPath}`,
    `--output-dir=${outputDir}`,
    `--report-path=${reportPath}`
  ];

  const result = spawnSync(process.execPath, args, {
    cwd: videoDir,
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`action override smoke failed (exit=${result.status ?? 1})`);
  }

  if (!fs.existsSync(reportPath)) {
    throw new Error(`action override smoke report missing: ${reportPath}`);
  }

  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    throw new Error(`action override smoke report parse failed: ${reportPath}`);
  }

  const results = Array.isArray(report?.results) ? report.results : [];
  const rendered = results.filter((entry) => entry && entry.status === "RENDERED").length;
  const failed = results.filter((entry) => entry && entry.status === "FAILED").length;
  const missing = results.filter((entry) => entry && entry.status === "MISSING_SEQUENCE").length;
  const degraded =
    typeof report?.degraded_count === "number" && Number.isFinite(report.degraded_count)
      ? report.degraded_count
      : 0;

  return {
    reportPath,
    summaryPath,
    rendered,
    failed,
    missing,
    degraded,
    total: results.length
  };
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

async function waitForHealth(headers) {
  const started = Date.now();
  let lastError = "";

  while (Date.now() - started < HEALTH_WAIT_MS) {
    try {
      const healthz = await fetchJson(`${API_BASE_URL}/healthz`, {
        method: "GET",
        headers
      });

      if (healthz.status === 404) {
        const health = await fetchJson(`${API_BASE_URL}/health`, {
          method: "GET",
          headers
        });

        if (health.ok) {
          return {
            mode: "health",
            body: health.data
          };
        }

        lastError = `GET /health failed (${health.status})`;
      } else if (healthz.status === 401) {
        throw new Error("API key missing or invalid. Set API_KEY in environment or .env.");
      } else if (healthz.ok) {
        return {
          mode: "healthz",
          body: healthz.data
        };
      } else {
        lastError = `GET /healthz failed (${healthz.status})`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(1000);
  }

  if (lastError.includes("fetch failed")) {
    throw new Error(`Cannot reach API at ${API_BASE_URL}. Start API/worker first.`);
  }

  throw new Error(lastError || `API health endpoint did not become ready in time at ${API_BASE_URL}.`);
}

function assertInfraReady(healthResult) {
  if (!healthResult || typeof healthResult !== "object") {
    return;
  }

  if (healthResult.mode === "healthz") {
    const data = extractFromData(healthResult.body, ["data"]);
    const ok = bool(extractFromData(data, ["ok"]));
    const services = extractFromData(data, ["services"]);
    const dbStatus = normalizeString(extractFromData(services, ["database", "status"]), "unknown");
    const redisStatus = normalizeString(extractFromData(services, ["redis", "status"]), "unknown");
    const minioStatus = normalizeString(extractFromData(services, ["minio", "status"]), "unknown");

    if (!ok || dbStatus !== "up" || redisStatus !== "up") {
      throw new Error(
        `Infrastructure not ready (db=${dbStatus}, redis=${redisStatus}, minio=${minioStatus}).`
      );
    }

    return;
  }

  const data = extractFromData(healthResult.body, ["data"]);
  const redis = normalizeString(extractFromData(data, ["redis"]), "down");
  const queueReady = bool(extractFromData(data, ["queueReady"]));
  if (redis !== "up" || !queueReady) {
    throw new Error(`Queue not ready (redis=${redis}, queueReady=${String(queueReady)}).`);
  }
}

async function main() {
  if (RUN_MANIFEST_SELFTEST) {
    runManifestFallbackSelftest();
    return;
  }

  if (!Number.isInteger(TIMEOUT_MS) || TIMEOUT_MS <= 0) {
    throw new Error("SMOKE_TIMEOUT_MS must be a positive integer");
  }

  if (!Number.isInteger(HEALTH_WAIT_MS) || HEALTH_WAIT_MS <= 0) {
    throw new Error("SMOKE_HEALTH_WAIT_MS must be a positive integer");
  }

  const apiKey = resolveApiKey();
  const headers = {
    "content-type": "application/json",
    accept: "application/json"
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  console.log("[smoke:e2e] running preview qc smoke");
  runPreviewSmoke();

  console.log(`[smoke:e2e] waiting for API health: ${API_BASE_URL}`);
  const health = await waitForHealth(headers);
  assertInfraReady(health);

  const startedAt = Date.now();
  const shouldRunActionOverrideSmoke =
    (process.env.SMOKE_ACTION_OVERRIDES ?? "1").trim().toLowerCase() !== "0";

  const demo = await fetchJson(`${API_BASE_URL}/demo/extreme`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      alwaysCreateNewEpisode: FORCE_NEW_EPISODE
    })
  });

  if (!demo.ok) {
    throw new Error(`POST /demo/extreme failed (${demo.status}): ${toJsonText(demo.data ?? demo.text)}`);
  }

  const episodeId =
    extractFromData(demo.data, ["data", "episodeId"]) ??
    extractFromData(demo.data, ["episodeId"]);
  const rootJobId =
    extractFromData(demo.data, ["data", "jobId"]) ??
    extractFromData(demo.data, ["jobId"]);

  if (typeof episodeId !== "string" || episodeId.trim().length === 0) {
    throw new Error(`POST /demo/extreme returned no episodeId: ${toJsonText(demo.data)}`);
  }

  if (typeof rootJobId !== "string" || rootJobId.trim().length === 0) {
    throw new Error(`POST /demo/extreme returned no jobId: ${toJsonText(demo.data)}`);
  }

  console.log(`[smoke:e2e] started episode=${episodeId} rootJobId=${rootJobId}`);

  const episodeOutDir = path.join(repoRoot, "out", episodeId);
  const previewPath = path.join(episodeOutDir, "preview.mp4");
  const qcPath = path.join(episodeOutDir, "qc_report.json");
  const defaultManifestPath = path.join(episodeOutDir, "upload_manifest.json");

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
      fetchJson(`${API_BASE_URL}/api/jobs?episodeId=${encodeURIComponent(episodeId)}&limit=100`, {
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
    const latestJob = extractFromData(statusData, ["latestJob"]);
    const latestJobStatus = normalizeString(extractFromData(latestJob, ["status"]), "UNKNOWN");
    const latestJobType = normalizeString(extractFromData(latestJob, ["type"]), "UNKNOWN");
    const latestJobId = normalizeString(extractFromData(latestJob, ["id"]), rootJobId);
    const latestJobError = normalizeString(extractFromData(latestJob, ["lastError"]), "");

    lastEpisodeStatus = episodeStatus;
    lastJobStatus = latestJobStatus;
    lastJobId = latestJobId;
    lastError = latestJobError;

    const failedJobs = Array.isArray(jobsData)
      ? jobsData.filter((row) => {
          if (!row || typeof row !== "object" || row.status !== "FAILED") return false;
          const createdAtMs = parseTimeMs(row.createdAt);
          return createdAtMs === null || createdAtMs >= startedAt;
        })
      : [];

    if (failedJobs.length > 0) {
      const first = failedJobs[0];
      const failedId = normalizeString(first.id, "(unknown)");
      const failedType = normalizeString(first.type, "(unknown)");
      const failedErr = normalizeString(first.lastError, "(none)");
      throw new Error(`Pipeline failed: job=${failedId} type=${failedType} error=${failedErr}`);
    }

    const latestJobCreatedAtMs = parseTimeMs(extractFromData(latestJob, ["createdAt"]));
    const latestJobIsFromCurrentRun =
      latestJobId === rootJobId || (latestJobCreatedAtMs !== null && latestJobCreatedAtMs >= startedAt);

    if (episodeStatus === "FAILED" && latestJobIsFromCurrentRun && latestJobStatus === "FAILED") {
      throw new Error(
        `Pipeline failed: episodeStatus=FAILED latestJob=${latestJobId}:${latestJobType}:${latestJobStatus} error=${latestJobError || "(none)"}`
      );
    }

    const previewExistsFromApi = bool(extractFromData(statusData, ["preview", "exists"]));
    const previewExists = previewExistsFromApi || fs.existsSync(previewPath);
    const qcExists = fs.existsSync(qcPath);
    const manifestInfo = resolveManifestPath(episodeOutDir, latestJob, jobsData);
    const resolvedManifestPath = manifestInfo.path;
    const manifestExists = manifestInfo.exists;

    const previewReady = episodeStatus === "PREVIEW_READY" || episodeStatus === "COMPLETED";
    const packageDone = manifestExists || (latestJobType === "PACKAGE_OUTPUTS" && latestJobStatus === "SUCCEEDED");
    const pipelineDoneByTarget =
      PIPELINE_TARGET === "preview" ? previewReady && previewExists && qcExists : previewReady && previewExists && qcExists && packageDone;

    pollCount += 1;
    if (pollCount % 5 === 0) {
      console.log(
        `[smoke:e2e] episode=${episodeId} status=${episodeStatus} latest=${latestJobId}:${latestJobType}:${latestJobStatus} preview=${previewExists ? "yes" : "no"} qc=${qcExists ? "yes" : "no"} manifest=${manifestExists ? "yes" : "no"} manifestSource=${manifestInfo.source} manifestCandidates=${manifestInfo.candidates.length}`
      );
    }

    if (pipelineDoneByTarget) {
      const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
      const mp4Files = listMp4Files(episodeOutDir);

      if (mp4Files.length === 0) {
        throw new Error(`Render marked ready but no mp4 files found in ${episodeOutDir}`);
      }

      if (shouldRunActionOverrideSmoke) {
        console.log("[smoke:e2e] running action override smoke");
        const overrideSummary = runActionOverrideSmoke(episodeOutDir);
        console.log(
          `[smoke:e2e] action overrides: rendered=${overrideSummary.rendered} failed=${overrideSummary.failed} missing=${overrideSummary.missing} degraded=${overrideSummary.degraded} total=${overrideSummary.total}`
        );
        console.log(`[smoke:e2e] action override report: ${overrideSummary.reportPath}`);
        console.log(`[smoke:e2e] action override summary: ${overrideSummary.summaryPath}`);
      } else {
        console.log("[smoke:e2e] skipping action override smoke (SMOKE_ACTION_OVERRIDES=0)");
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
      console.log(`  manifest=${resolvedManifestPath}`);
      console.log(`  manifestSource=${manifestInfo.source}`);
      console.log(`  manifestCandidates=${manifestInfo.candidates.map((candidate) => `${candidate.source}:${candidate.path}`).join(" | ")}`);
      console.log(`  mp4=${mp4Files.join(", ")}`);
      writeLastRunMetadata({
        status: "PASS",
        episodeId,
        rootJobId,
        latestJobId,
        outDir: episodeOutDir,
        previewPath,
        qcPath,
        manifestPath: resolvedManifestPath ?? defaultManifestPath,
        manifestSource: manifestInfo.source,
        manifestCandidates: manifestInfo.candidates
      });
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Timed out after ${TIMEOUT_MS}ms waiting for completion. episodeStatus=${lastEpisodeStatus} latestJob=${lastJobId}:${lastJobStatus} lastError=${lastError || "(none)"}`
  );
}

main().catch((error) => {
  console.error("SMOKE E2E: FAIL");
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`  reason=${reason}`);
  printFixHints(reason.includes("Infrastructure not ready") ? "DB/Redis health is down" : undefined);
  process.exit(1);
});
