import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orchestrateRenderEpisode } from "@ec/render-orchestrator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_API_BASE_URL = process.env.API_BASE_URL?.trim() || "http://localhost:3000";
const POLL_INTERVAL_MS = Number.parseInt(process.env.SMOKE_POLL_MS ?? "1200", 10);
const POLL_TIMEOUT_MS = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? "1200000", 10);

type MascotSpeciesId = "cat" | "dog" | "wolf";

type CliArgs = {
  characterId: string;
  positivePrompt: string;
  negativePrompt?: string;
  frontSeed: number;
  species?: MascotSpeciesId;
  apiBaseUrl: string;
  provider: string;
  candidateCount: number;
  promptPreset: string;
  shotsPath?: string;
  outputPath?: string;
  noRender: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const map = new Map<string, string>();
  let noRender = false;

  for (const entry of argv) {
    if (entry === "--no-render") {
      noRender = true;
      continue;
    }
    const match = entry.match(/^--([^=]+)=(.*)$/);
    if (!match) {
      continue;
    }
    map.set(match[1], match[2]);
  }

  const characterId = map.get("character-id")?.trim() || "";
  const positivePrompt = map.get("positive-prompt")?.trim() || "";
  const frontSeed = Number.parseInt(map.get("front-seed") ?? "", 10);
  const species = normalizeSpecies(map.get("species"));
  if (!characterId || !positivePrompt || !Number.isFinite(frontSeed)) {
    throw new Error(
      "usage: pnpm -C packages/image-gen run pipeline:mvp -- --character-id=<id> --positive-prompt=\"...\" --front-seed=<n> [--species=cat|dog|wolf] [--negative-prompt=\"...\"] [--shots=out/shots.json] [--output=out/generated-episode.mp4] [--api-base-url=http://localhost:3000] [--provider=comfyui] [--candidate-count=4] [--no-render]"
    );
  }

  return {
    characterId,
    positivePrompt,
    negativePrompt: map.get("negative-prompt")?.trim() || undefined,
    frontSeed,
    species,
    apiBaseUrl: map.get("api-base-url")?.trim() || DEFAULT_API_BASE_URL,
    provider: map.get("provider")?.trim() || "comfyui",
    candidateCount: Math.max(2, Math.min(8, Number.parseInt(map.get("candidate-count") ?? "4", 10) || 4)),
    promptPreset: map.get("prompt-preset")?.trim() || "compact-mascot-production",
    shotsPath: map.get("shots")?.trim() || undefined,
    outputPath: map.get("output")?.trim() || undefined,
    noRender
  };
}

function normalizeSpecies(value: string | undefined): MascotSpeciesId | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "cat" || normalized === "dog" || normalized === "wolf") {
    return normalized;
  }
  return undefined;
}

function inferSpecies(characterId: string, positivePrompt: string): MascotSpeciesId {
  const source = `${characterId} ${positivePrompt}`.toLowerCase();
  if (/\bwolf\b/.test(source)) {
    return "wolf";
  }
  if (/\bdog\b|\bpuppy\b/.test(source)) {
    return "dog";
  }
  return "cat";
}

function ensureString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${label}`);
  }
  return value.trim();
}

function firstLine(value: unknown): string {
  return typeof value === "string" ? (value.split(/\r?\n/, 1)[0] ?? "") : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(process.env.API_KEY ? { "x-api-key": process.env.API_KEY } : {}),
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  const parsed = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) {
    const message =
      parsed && typeof parsed === "object" && parsed !== null && typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : text || `${response.status}`;
    throw new Error(`HTTP ${response.status} ${url}: ${message}`);
  }
  return parsed as T;
}

async function pollJob(apiBaseUrl: string, jobId: string, label: string): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const json = await fetchJson<{ data?: { status?: string; progress?: number; lastError?: string | null } }>(
      `${apiBaseUrl}/api/character-generator/jobs/${encodeURIComponent(jobId)}`
    );
    const data = json.data ?? null;
    if (!data || typeof data.status !== "string") {
      throw new Error(`Invalid character-generator job response for ${jobId}`);
    }
    const status = data.status.toUpperCase();
    const progress = typeof data.progress === "number" ? data.progress : 0;
    process.stdout.write(`\r[pipeline:mvp] ${label} job=${jobId} status=${status} progress=${progress}%   `);
    if (status === "SUCCEEDED") {
      process.stdout.write("\n");
      return;
    }
    if (status === "FAILED" || status === "CANCELLED") {
      process.stdout.write("\n");
      throw new Error(`${label} job ${jobId} ended with ${status}: ${String(data.lastError ?? "(no error)")}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timeout while waiting for ${label} job ${jobId}`);
}

async function pollPreviewWithDependency(
  apiBaseUrl: string,
  previewJobId: string,
  dependencyJobId: string
): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [previewJson, dependencyJson] = await Promise.all([
      fetchJson<{ data?: { status?: string; progress?: number; lastError?: string | null } }>(
        `${apiBaseUrl}/api/jobs/${encodeURIComponent(previewJobId)}`
      ),
      fetchJson<{ data?: { status?: string; progress?: number; lastError?: string | null } }>(
        `${apiBaseUrl}/api/jobs/${encodeURIComponent(dependencyJobId)}`
      )
    ]);
    const preview = previewJson.data ?? null;
    const dependency = dependencyJson.data ?? null;
    if (!preview || typeof preview.status !== "string" || !dependency || typeof dependency.status !== "string") {
      throw new Error("Invalid preview/dependency job response");
    }
    const previewStatus = preview.status.toUpperCase();
    const dependencyStatus = dependency.status.toUpperCase();
    const previewProgress = typeof preview.progress === "number" ? preview.progress : 0;
    process.stdout.write(
      `\r[pipeline:mvp] preview job=${previewJobId} status=${previewStatus} progress=${previewProgress}% (pick=${dependencyStatus})   `
    );
    if (dependencyStatus === "FAILED" || dependencyStatus === "CANCELLED") {
      process.stdout.write("\n");
      throw new Error(
        `preview blocked: pick generate job ${dependencyJobId} ended with ${dependencyStatus}: ${String(
          dependency.lastError ?? "(no error)"
        )}`
      );
    }
    if (previewStatus === "SUCCEEDED") {
      process.stdout.write("\n");
      return;
    }
    if (previewStatus === "FAILED" || previewStatus === "CANCELLED") {
      process.stdout.write("\n");
      throw new Error(`preview job ${previewJobId} ended with ${previewStatus}: ${String(preview.lastError ?? "(no error)")}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timeout while waiting for preview job ${previewJobId}`);
}

function pickBestCandidate(manifest: unknown, view: "front" | "threeQuarter" | "profile"): { id: string; score: number } {
  const list = Array.isArray((manifest as { candidates?: unknown[] } | null)?.candidates)
    ? ((manifest as { candidates?: Array<{ id?: unknown; view?: unknown; score?: unknown }> }).candidates ?? []).filter(
        (candidate) => candidate?.view === view
      )
    : [];
  if (list.length === 0) {
    throw new Error(`No candidates found for view=${view}`);
  }
  const ranked = list
    .map((candidate) => ({
      id: ensureString(candidate.id, `${view}.candidate.id`),
      score: typeof candidate.score === "number" ? candidate.score : 0
    }))
    .sort((left, right) => right.score - left.score);
  return ranked[0];
}

function defaultViewForShotType(shotType: string): "front" | "threeQuarter" | "profile" {
  if (shotType === "transition") {
    return "profile";
  }
  if (shotType === "reaction" || shotType === "broll") {
    return "threeQuarter";
  }
  return "front";
}

function resolveCliPath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  const cwdResolved = path.resolve(process.cwd(), inputPath);
  if (fs.existsSync(cwdResolved)) {
    return cwdResolved;
  }
  return path.resolve(REPO_ROOT, inputPath);
}

function rewriteShotsWithCharacterPack(shotsPath: string, characterId: string): string {
  const absolutePath = resolveCliPath(shotsPath);
  const doc = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as {
    shots?: Array<{
      shot_type?: string;
      character?: {
        pack_id?: string;
        tracks?: Record<string, unknown>;
      };
    }>;
  };

  if (!Array.isArray(doc.shots)) {
    throw new Error(`invalid shots file: ${absolutePath}`);
  }

  for (const shot of doc.shots) {
    if (!shot.character) {
      continue;
    }
    shot.character.pack_id = characterId;
    const tracks = typeof shot.character.tracks === "object" && shot.character.tracks !== null ? shot.character.tracks : {};
    if (!Array.isArray((tracks as { view_track?: unknown }).view_track)) {
      (tracks as { view_track: Array<{ f: number; view: "front" | "threeQuarter" | "profile" }> }).view_track = [
        {
          f: 0,
          view: defaultViewForShotType(shot.shot_type ?? "talk")
        }
      ];
    }
    shot.character.tracks = tracks;
  }

  const parsed = path.parse(absolutePath);
  const rewrittenPath = path.join(parsed.dir, `${parsed.name}.${characterId}.generated.json`);
  fs.writeFileSync(rewrittenPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return rewrittenPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const species = args.species ?? inferSpecies(args.characterId, args.positivePrompt);
  const createPayload = {
    mode: "new",
    provider: args.provider,
    promptPreset: args.promptPreset,
    species,
    positivePrompt: args.positivePrompt,
    ...(args.negativePrompt ? { negativePrompt: args.negativePrompt } : {}),
    topic: `Image To Animation MVP ${args.characterId}`,
    candidateCount: args.candidateCount,
    autoPick: false,
    requireHitlPick: true,
    seed: args.frontSeed,
    maxAttempts: 2,
    retryBackoffMs: 1000
  };

  const created = await fetchJson<{
    data?: {
      generateJobId?: string;
      characterPackId?: string;
      sessionId?: string;
      episodeId?: string;
    };
  }>(`${args.apiBaseUrl}/api/character-generator/generate`, {
    method: "POST",
    body: JSON.stringify(createPayload)
  });
  const createdData = created.data ?? null;
  const generateJobId = ensureString(createdData?.generateJobId, "generateJobId");
  const characterPackId = ensureString(createdData?.characterPackId, "characterPackId");

  await pollJob(args.apiBaseUrl, generateJobId, "generate");

  const generationDetail = await fetchJson<{ data?: { manifest?: unknown; manifestPath?: string | null } }>(
    `${args.apiBaseUrl}/api/character-generator/jobs/${encodeURIComponent(generateJobId)}`
  );
  const manifest = generationDetail.data?.manifest ?? null;
  if (!manifest) {
    throw new Error("Generation manifest missing after generate job success");
  }

  const frontBest = pickBestCandidate(manifest, "front");
  const threeQuarterBest = pickBestCandidate(manifest, "threeQuarter");
  const profileBest = pickBestCandidate(manifest, "profile");

  const pickResult = await fetchJson<{
    data?: {
      generateJobId?: string;
      previewJobId?: string;
    };
  }>(`${args.apiBaseUrl}/api/character-generator/pick`, {
    method: "POST",
    body: JSON.stringify({
      generateJobId,
      frontCandidateId: frontBest.id,
      threeQuarterCandidateId: threeQuarterBest.id,
      profileCandidateId: profileBest.id
    })
  });
  const pickData = pickResult.data ?? null;
  const pickedGenerateJobId = ensureString(pickData?.generateJobId, "pick.generateJobId");
  const previewJobId = ensureString(pickData?.previewJobId, "pick.previewJobId");

  await pollPreviewWithDependency(args.apiBaseUrl, previewJobId, pickedGenerateJobId);

  const finalGenerate = await fetchJson<{ data?: { manifestPath?: string | null; lastError?: string | null } }>(
    `${args.apiBaseUrl}/api/character-generator/jobs/${encodeURIComponent(pickedGenerateJobId)}`
  );
  const finalManifestPath =
    typeof finalGenerate.data?.manifestPath === "string" && finalGenerate.data.manifestPath.trim().length > 0
      ? finalGenerate.data.manifestPath.trim()
      : null;
  const previewPath = path.resolve("out", "characters", characterPackId, "preview.mp4");

  const shotsPath = args.shotsPath ? rewriteShotsWithCharacterPack(args.shotsPath, characterPackId) : null;
  if (args.noRender || !shotsPath) {
    console.log(
      JSON.stringify(
        {
          characterId: args.characterId,
          species,
          apiBaseUrl: args.apiBaseUrl,
          characterPackId,
          sessionId: createdData?.sessionId ?? null,
          episodeId: createdData?.episodeId ?? null,
          generateJobId: pickedGenerateJobId,
          manifestPath: finalManifestPath,
          previewPath,
          lastError: firstLine(finalGenerate.data?.lastError ?? ""),
          routedShotsPath: shotsPath
        },
        null,
        2
      )
    );
    return;
  }

  const outputPath =
    (args.outputPath?.trim()
      ? resolveCliPath(args.outputPath)
      : path.join(path.dirname(shotsPath), `${characterPackId}.episode.mp4`));
  const render = await orchestrateRenderEpisode({
    shotsPath,
    outputPath: outputPath
  });

  console.log(
      JSON.stringify(
        {
          characterId: args.characterId,
          species,
          apiBaseUrl: args.apiBaseUrl,
          characterPackId,
          generateJobId: pickedGenerateJobId,
          manifestPath: finalManifestPath,
          previewPath,
          lastError: firstLine(finalGenerate.data?.lastError ?? ""),
          routedShotsPath: shotsPath,
          render
        },
        null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
