import fs from "node:fs";
import path from "node:path";

const API_BASE_URL = process.env.API_BASE_URL?.trim() || "http://localhost:3000";
const POLL_INTERVAL_MS = Number.parseInt(process.env.SMOKE_POLL_MS ?? "1200", 10);
const POLL_TIMEOUT_MS = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? "360000", 10);

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

async function main() {
  console.log(`[smoke:character] API base: ${API_BASE_URL}`);

  const seed = Number.parseInt(process.env.SMOKE_CHARACTER_SEED ?? "4242", 10);
  const topic = `Smoke Character Session ${new Date().toISOString()}`;

  const createPayload = {
    mode: "new",
    provider: "mock",
    promptPreset: "eraser-cat-flat",
    topic,
    candidateCount: 4,
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
  if (!manifest) {
    throw new Error("Generation manifest missing after generate job success");
  }
  const hasGenerateContinuity = assertContinuityShape(manifest, "generateManifest");
  if (!hasGenerateContinuity) {
    console.log("[smoke:character] WARN: generateManifest.reference.continuity missing");
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

  await pollJob(previewJobId, "preview");

  const previewPath = path.resolve("out", "characters", characterPackId, "preview.mp4");
  if (!fs.existsSync(previewPath)) {
    throw new Error(`preview.mp4 not found: ${previewPath}`);
  }

  const finalGenerate = await fetchJson(`${API_BASE_URL}/api/character-generator/jobs/${encodeURIComponent(pickGenerateJobId)}`);
  const manifestStatus = String(finalGenerate?.data?.manifest?.status ?? "unknown");
  const finalManifest = finalGenerate?.data?.manifest ?? null;
  if (finalManifest) {
    const hasFinalContinuity = assertContinuityShape(finalManifest, "finalManifest");
    if (!hasFinalContinuity) {
      console.log("[smoke:character] WARN: finalManifest.reference.continuity missing");
    }
  }
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
