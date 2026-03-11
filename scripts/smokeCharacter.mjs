import fs from "node:fs";
import path from "node:path";

const API_BASE_URL = process.env.API_BASE_URL?.trim() || "http://localhost:3000";
const POLL_INTERVAL_MS = Number.parseInt(process.env.SMOKE_POLL_MS ?? "1200", 10);
const POLL_TIMEOUT_MS = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? "1200000", 10);
const REQUIRE_CONTINUITY = process.env.SMOKE_REQUIRE_CONTINUITY === "1";
const REQUESTED_PROVIDER = process.env.SMOKE_CHARACTER_PROVIDER?.trim() || "comfyui";
const REQUESTED_CANDIDATE_COUNT = Number.parseInt(process.env.SMOKE_CHARACTER_CANDIDATE_COUNT ?? "4", 10);
const REQUESTED_SPECIES = (process.env.SMOKE_CHARACTER_SPECIES?.trim().toLowerCase() || "cat");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${label}`);
  }
  return value;
}

function firstLine(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.split(/\r?\n/, 1)[0] ?? "";
}

async function fetchJson(url, init = {}) {
  const headers = {
    accept: "application/json",
    ...(init.body ? { "content-type": "application/json" } : {}),
    ...(process.env.API_KEY ? { "x-api-key": process.env.API_KEY } : {}),
    ...(init.headers ?? {})
  };

  const response = await fetch(url, {
    ...init,
    headers
  });

  const text = await response.text();
  let json = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message = json && typeof json.error === "string" ? json.error : text || `${response.status}`;
    throw new Error(`HTTP ${response.status} ${url}: ${message}`);
  }

  return json;
}

async function pollJob(jobId, label) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const json = await fetchJson(`${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}`);
    const data = json?.data ?? null;
    if (!data || typeof data.status !== "string") {
      throw new Error(`Invalid /api/jobs/${jobId} response`);
    }

    const status = String(data.status).toUpperCase();
    const progress = typeof data.progress === "number" ? data.progress : 0;
    process.stdout.write(`\r[smoke:character] ${label} job=${jobId} status=${status} progress=${progress}%   `);

    if (status === "SUCCEEDED") {
      process.stdout.write("\n");
      return data;
    }
    if (status === "FAILED" || status === "CANCELLED") {
      process.stdout.write("\n");
      throw new Error(`${label} job ${jobId} ended with ${status}: ${String(data.lastError ?? "(no error)")}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timeout while waiting for ${label} job ${jobId}`);
}

async function fetchJobData(jobId) {
  const json = await fetchJson(`${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}`);
  const data = json?.data ?? null;
  if (!data || typeof data.status !== "string") {
    throw new Error(`Invalid /api/jobs/${jobId} response`);
  }
  return data;
}

function summarizeJob(data) {
  const status = String(data?.status ?? "UNKNOWN").toUpperCase();
  const progress = typeof data?.progress === "number" ? data.progress : 0;
  const lastError = firstLine(data?.lastError ?? "");
  const logs = Array.isArray(data?.logs) ? data.logs : [];
  const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const latestMessage =
    latestLog && typeof latestLog.message === "string" ? firstLine(latestLog.message) : "";

  return {
    status,
    progress,
    lastError,
    latestMessage
  };
}

async function pollPreviewWithDependency(previewJobId, dependencyJobId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const [previewData, dependencyData] = await Promise.all([
      fetchJobData(previewJobId),
      fetchJobData(dependencyJobId)
    ]);

    const preview = summarizeJob(previewData);
    const dependency = summarizeJob(dependencyData);

    process.stdout.write(
      `\r[smoke:character] preview job=${previewJobId} status=${preview.status} progress=${preview.progress}% (pick=${dependency.status})   `
    );

    if (dependency.status === "FAILED" || dependency.status === "CANCELLED") {
      process.stdout.write("\n");
      const logs = Array.isArray(dependencyData?.logs) ? dependencyData.logs : [];
      const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;
      const latestLogMessage =
        latestLog && typeof latestLog.message === "string" ? firstLine(latestLog.message) : "";
      const fullLastError =
        typeof dependencyData?.lastError === "string" && dependencyData.lastError.trim().length > 0
          ? dependencyData.lastError.trim()
          : "";
      throw new Error(
        `preview blocked: pick generate job ${dependencyJobId} ended with ${dependency.status}` +
          (dependency.lastError ? `: ${dependency.lastError}` : "") +
          (latestLogMessage ? ` | pick.log=${latestLogMessage}` : "") +
          (fullLastError ? `\n[pick.lastError]\n${fullLastError}` : "")
      );
    }

    if (preview.status === "SUCCEEDED") {
      process.stdout.write("\n");
      return previewData;
    }
    if (preview.status === "FAILED" || preview.status === "CANCELLED") {
      process.stdout.write("\n");
      throw new Error(
        `preview job ${previewJobId} ended with ${preview.status}` +
          (preview.lastError ? `: ${preview.lastError}` : "")
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  const [previewData, dependencyData] = await Promise.all([
    fetchJobData(previewJobId),
    fetchJobData(dependencyJobId)
  ]);
  const preview = summarizeJob(previewData);
  const dependency = summarizeJob(dependencyData);
  throw new Error(
    `Timeout while waiting for preview job ${previewJobId} (preview=${preview.status}/${preview.progress}%, pick=${dependency.status}/${dependency.progress}%)` +
      (dependency.latestMessage ? `; pick.log=${dependency.latestMessage}` : "") +
      (preview.latestMessage ? `; preview.log=${preview.latestMessage}` : "")
  );
}

function pickBestCandidate(manifest, view) {
  const list = Array.isArray(manifest?.candidates)
    ? manifest.candidates.filter((candidate) => candidate?.view === view)
    : [];
  if (list.length === 0) {
    throw new Error(`No candidates found for view=${view}`);
  }

  const ranked = list
    .map((candidate) => ({
      id: ensureString(candidate.id, `${view}.id`),
      score: typeof candidate.score === "number" ? candidate.score : 0
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0];
}

function ensureFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${label}: expected finite number`);
  }
  return value;
}

function assertContinuityShape(manifest, label) {
  const continuity = manifest?.reference?.continuity ?? null;
  if (!continuity || typeof continuity !== "object") {
    return false;
  }

  if (typeof continuity.enabled !== "boolean") {
    throw new Error(`Invalid ${label}.reference.continuity.enabled`);
  }
  if (typeof continuity.attempted !== "boolean") {
    throw new Error(`Invalid ${label}.reference.continuity.attempted`);
  }
  if (typeof continuity.applied !== "boolean") {
    throw new Error(`Invalid ${label}.reference.continuity.applied`);
  }
  if (typeof continuity.reason !== "string" || continuity.reason.trim().length === 0) {
    throw new Error(`Invalid ${label}.reference.continuity.reason`);
  }

  const hasQueueCounts =
    continuity.queuedSessionCount !== undefined ||
    continuity.uniqueQueuedSessionCount !== undefined ||
    continuity.duplicateSessionCount !== undefined;
  if (hasQueueCounts) {
    const queued = ensureFiniteNumber(
      continuity.queuedSessionCount,
      `${label}.reference.continuity.queuedSessionCount`
    );
    const unique = ensureFiniteNumber(
      continuity.uniqueQueuedSessionCount,
      `${label}.reference.continuity.uniqueQueuedSessionCount`
    );
    const dup = ensureFiniteNumber(
      continuity.duplicateSessionCount,
      `${label}.reference.continuity.duplicateSessionCount`
    );
    if (queued < unique) {
      throw new Error(`Invalid ${label}.reference.continuity queue counts: queued < unique`);
    }
    if (dup !== queued - unique) {
      throw new Error(`Invalid ${label}.reference.continuity queue counts: dup != queued - unique`);
    }
  }

  if (continuity.attempted && continuity.queuedSessionCount !== undefined) {
    ensureFiniteNumber(continuity.searchedSessionCount, `${label}.reference.continuity.searchedSessionCount`);
  }
  return true;
}

function readManifestFromPath(manifestPath) {
  if (typeof manifestPath !== "string" || manifestPath.trim().length === 0) {
    return null;
  }
  try {
    if (!fs.existsSync(manifestPath)) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveManifestPathFromJobData(data) {
  const candidates = [];
  if (typeof data?.manifestPath === "string" && data.manifestPath.trim().length > 0) {
    candidates.push(data.manifestPath.trim());
  }
  const logs = Array.isArray(data?.logs) ? data.logs : [];
  for (const entry of logs) {
    const manifestPath = entry?.details?.manifestPath;
    if (typeof manifestPath === "string" && manifestPath.trim().length > 0) {
      candidates.push(manifestPath.trim());
    }
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? null;
}

function resolveManifestStatus(...manifests) {
  for (const manifest of manifests) {
    const raw = manifest?.status;
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw.trim();
    }
  }
  return "unknown";
}

function readJsonIfExists(filePath) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return null;
  }
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function countWorkflowNodes(workflow) {
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    return 0;
  }
  return Object.keys(workflow).length;
}

function assertSelectedWorkflowRuntimeDiagnostics(jobData, label) {
  const entries = Array.isArray(jobData?.selectedWorkflowRuntimeDiagnostics)
    ? jobData.selectedWorkflowRuntimeDiagnostics
    : [];
  if (entries.length === 0) {
    throw new Error(`Missing ${label}.selectedWorkflowRuntimeDiagnostics`);
  }

  for (const entry of entries) {
    ensureString(entry?.view, `${label}.selectedWorkflowRuntimeDiagnostics.view`);
    ensureString(entry?.candidateId, `${label}.selectedWorkflowRuntimeDiagnostics.candidateId`);
    ensureString(entry?.compact, `${label}.selectedWorkflowRuntimeDiagnostics.compact`);
  }

  if (typeof jobData?.selectedWorkflowRuntimeSummary !== "string" || jobData.selectedWorkflowRuntimeSummary.trim().length === 0) {
    throw new Error(`Missing ${label}.selectedWorkflowRuntimeSummary`);
  }
}

function assertWorkflowArtifacts(manifest, label) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error(`Missing ${label} manifest`);
  }

  const selectedIds = new Set(
    Object.values(manifest.selectedByView ?? {})
      .map((entry) => entry?.candidateId)
      .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
  );

  const selectedCandidates = Array.isArray(manifest.candidates)
    ? manifest.candidates.filter((candidate) => selectedIds.has(candidate?.id))
    : [];
  if (selectedCandidates.length === 0) {
    throw new Error(`Missing ${label} selected candidates`);
  }

  for (const candidate of selectedCandidates) {
    const workflowFiles = candidate?.providerMeta?.workflowFiles ?? {};
    const apiPromptPath = ensureString(workflowFiles.apiPromptPath, `${label}.${candidate.id}.workflow.apiPromptPath`);
    const summaryPath = ensureString(workflowFiles.summaryPath, `${label}.${candidate.id}.workflow.summaryPath`);
    if (!fs.existsSync(apiPromptPath)) {
      throw new Error(`Missing ${label}.${candidate.id} workflow_api.json: ${apiPromptPath}`);
    }
    if (!fs.existsSync(summaryPath)) {
      throw new Error(`Missing ${label}.${candidate.id} workflow_summary.json: ${summaryPath}`);
    }

    const workflowApi = readJsonIfExists(apiPromptPath);
    const workflowSummary = readJsonIfExists(summaryPath);
    if (!workflowApi || typeof workflowApi !== "object") {
      throw new Error(`Invalid ${label}.${candidate.id} workflow_api.json`);
    }
    if (!workflowSummary || typeof workflowSummary !== "object") {
      throw new Error(`Invalid ${label}.${candidate.id} workflow_summary.json`);
    }

    const selectedMode =
      typeof workflowSummary.routeDecision?.selectedMode === "string"
        ? workflowSummary.routeDecision.selectedMode
        : typeof workflowSummary.mode === "string"
          ? workflowSummary.mode
          : "";
    if (!selectedMode) {
      throw new Error(`Missing ${label}.${candidate.id} workflow_summary.routeDecision.selectedMode`);
    }
    if (!Array.isArray(workflowSummary.warnings)) {
      throw new Error(`Missing ${label}.${candidate.id} workflow_summary.warnings`);
    }
    if (!workflowSummary.structureControlDiagnostics || typeof workflowSummary.structureControlDiagnostics !== "object") {
      throw new Error(`Missing ${label}.${candidate.id} workflow_summary.structureControlDiagnostics`);
    }

    const nodeCount = countWorkflowNodes(workflowApi);
    if (selectedMode.startsWith("checkpoint-ultra") && nodeCount < 18) {
      throw new Error(
        `Unexpected thin ultra workflow for ${label}.${candidate.id}: mode=${selectedMode} nodeCount=${nodeCount}`
      );
    }
  }
}

async function main() {
  console.log(`[smoke:character] API base: ${API_BASE_URL}`);
  console.log(`[smoke:character] requireContinuity=${REQUIRE_CONTINUITY ? "1" : "0"}`);
  console.log(`[smoke:character] species=${REQUESTED_SPECIES}`);

  const seed = Number.parseInt(process.env.SMOKE_CHARACTER_SEED ?? "4242", 10);
  const topic = `Smoke Character Session ${new Date().toISOString()}`;

  const createPayload = {
    mode: "new",
    provider: REQUESTED_PROVIDER,
    promptPreset: "eraser-cat-mascot-production",
    species: REQUESTED_SPECIES,
    topic,
    candidateCount: Number.isFinite(REQUESTED_CANDIDATE_COUNT) && REQUESTED_CANDIDATE_COUNT > 0
      ? REQUESTED_CANDIDATE_COUNT
      : 4,
    autoPick: false,
    requireHitlPick: true,
    seed,
    maxAttempts: 2,
    retryBackoffMs: 1000
  };

  const created = await fetchJson(`${API_BASE_URL}/api/character-generator/generate`, {
    method: "POST",
    body: JSON.stringify(createPayload)
  });

  const createdData = created?.data ?? null;
  const episodeId = ensureString(createdData?.episodeId, "episodeId");
  const generateJobId = ensureString(createdData?.generateJobId, "generateJobId");
  const characterPackId = ensureString(createdData?.characterPackId, "characterPackId");
  const sessionId = ensureString(createdData?.sessionId, "sessionId");

  console.log(`[smoke:character] episodeId=${episodeId}`);
  console.log(`[smoke:character] sessionId=${sessionId}`);
  console.log(`[smoke:character] generateJobId=${generateJobId}`);
  console.log(`[smoke:character] characterPackId=${characterPackId}`);

  await pollJob(generateJobId, "generate");

  const generationDetail = await fetchJson(`${API_BASE_URL}/api/character-generator/jobs/${encodeURIComponent(generateJobId)}`);
  const manifest = generationDetail?.data?.manifest ?? null;
  const manifestPath = resolveManifestPathFromJobData(generationDetail?.data ?? null);
  if (!manifest) {
    throw new Error("Generation manifest missing after generate job success");
  }
  const fallbackGenerateManifest = readManifestFromPath(manifestPath);
  const generateManifestStatus = resolveManifestStatus(manifest, fallbackGenerateManifest);
  if (generateManifestStatus === "unknown") {
    throw new Error("generate manifest status missing (api+file)");
  }
  const hasGenerateContinuity =
    assertContinuityShape(manifest, "generateManifest") ||
    assertContinuityShape(fallbackGenerateManifest, "generateManifest(file)");
  if (!hasGenerateContinuity) {
    if (REQUIRE_CONTINUITY) {
      throw new Error("Missing generateManifest.reference.continuity (api+file)");
    }
    console.log("[smoke:character] WARN: generateManifest.reference.continuity missing (api+file)");
  }

  const frontBest = pickBestCandidate(manifest, "front");
  const threeQuarterBest = pickBestCandidate(manifest, "threeQuarter");
  const profileBest = pickBestCandidate(manifest, "profile");

  console.log(
    `[smoke:character] best picks front=${frontBest.id}(${frontBest.score.toFixed(3)}), threeQuarter=${threeQuarterBest.id}(${threeQuarterBest.score.toFixed(3)}), profile=${profileBest.id}(${profileBest.score.toFixed(3)})`
  );

  const pickResult = await fetchJson(`${API_BASE_URL}/api/character-generator/pick`, {
    method: "POST",
    body: JSON.stringify({
      generateJobId,
      frontCandidateId: frontBest.id,
      threeQuarterCandidateId: threeQuarterBest.id,
      profileCandidateId: profileBest.id
    })
  });

  const pickData = pickResult?.data ?? null;
  const pickGenerateJobId = ensureString(pickData?.generateJobId, "pick.generateJobId");
  const previewJobId = ensureString(pickData?.previewJobId, "pick.previewJobId");
  console.log(`[smoke:character] pickGenerateJobId=${pickGenerateJobId}`);
  console.log(`[smoke:character] previewJobId=${previewJobId}`);

  await pollPreviewWithDependency(previewJobId, pickGenerateJobId);

  const previewPath = path.resolve("out", "characters", characterPackId, "preview.mp4");
  if (!fs.existsSync(previewPath)) {
    throw new Error(`preview.mp4 not found: ${previewPath}`);
  }

  const finalGenerate = await fetchJson(`${API_BASE_URL}/api/character-generator/jobs/${encodeURIComponent(pickGenerateJobId)}`);
  const finalManifest = finalGenerate?.data?.manifest ?? null;
  const finalManifestPath = resolveManifestPathFromJobData(finalGenerate?.data ?? null);
  const fallbackFinalManifest = readManifestFromPath(finalManifestPath);
  assertSelectedWorkflowRuntimeDiagnostics(finalGenerate?.data ?? null, "finalGenerate");
  const manifestStatus = resolveManifestStatus(finalManifest, fallbackFinalManifest);
  if (manifestStatus === "unknown") {
    throw new Error("final manifest status missing (api+file)");
  }
  if (finalManifest) {
    const hasFinalContinuity =
      assertContinuityShape(finalManifest, "finalManifest") ||
      assertContinuityShape(fallbackFinalManifest, "finalManifest(file)");
    if (!hasFinalContinuity) {
      if (REQUIRE_CONTINUITY) {
        throw new Error("Missing finalManifest.reference.continuity (api+file)");
      }
      console.log("[smoke:character] WARN: finalManifest.reference.continuity missing (api+file)");
    }
  }
  assertWorkflowArtifacts(finalManifest ?? fallbackFinalManifest, "finalManifest");
  const lastError = firstLine(finalGenerate?.data?.lastError ?? "");

  console.log(`[smoke:character] manifest.status=${manifestStatus}`);
  if (lastError) {
    console.log(`[smoke:character] lastError(first line)=${lastError}`);
  }
  console.log(`[smoke:character] preview=${previewPath}`);
  console.log("[smoke:character] PASS");
}

main().catch((error) => {
  console.error(`\n[smoke:character] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
