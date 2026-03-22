import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCharacterPrompt,
  createCharacterProvider,
  resolveProviderName,
  type CharacterProviderGenerateInput,
  type CharacterProviderName,
  type CharacterView,
  type MascotReferenceBankManifest,
  type MascotSpeciesId
} from "./index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const ROOT_ENV_PATH = path.join(REPO_ROOT, ".env");

type SlotKind = "style" | "family" | "hero";

type CandidateBankAssetPlan = {
  slotId: string;
  kind: SlotKind;
  view: CharacterView;
  fileName: string;
  promptAdditions: string[];
  negativeAdditions?: string[];
};

const BASE_ASSET_PLANS: CandidateBankAssetPlan[] = [
  {
    slotId: "style.front.primary",
    kind: "style",
    view: "front",
    fileName: "style_front_primary.png",
    promptAdditions: [
      "canonical house style front reference",
      "neutral standing pose",
      "both short arms visible",
      "both paws visible and attached",
      "full body visible",
      "clean centered sticker silhouette"
    ]
  },
  {
    slotId: "family.front.primary",
    kind: "family",
    view: "front",
    fileName: "family_front_primary.png",
    promptAdditions: [
      "front composition anchor",
      "full body visible",
      "centered composition",
      "readable body proportion",
      "readable paws",
      "friendly neutral mascot pose"
    ]
  },
  {
    slotId: "family.threeQuarter.primary",
    kind: "family",
    view: "threeQuarter",
    fileName: "family_threeQuarter_primary.png",
    promptAdditions: [
      "three-quarter composition anchor",
      "full body visible",
      "clear torso yaw",
      "no near-front collapse",
      "preserve the same body proportion and silhouette family"
    ]
  },
  {
    slotId: "family.profile.primary",
    kind: "family",
    view: "profile",
    fileName: "family_profile_primary.png",
    promptAdditions: [
      "profile composition anchor",
      "full body visible",
      "one-eye side profile only",
      "clean readable silhouette",
      "preserve the same body proportion and silhouette family"
    ]
  },
  {
    slotId: "hero.front.primary",
    kind: "hero",
    view: "front",
    fileName: "hero_front_primary.png",
    promptAdditions: [
      "front hero identity reference",
      "head and upper torso emphasized",
      "face detail readable",
      "neutral expression",
      "strong eye and ear readability",
      "no dramatic pose"
    ],
    negativeAdditions: [
      "multiple characters",
      "comparison panels",
      "inset figures",
      "turnaround sheet",
      "fur hatching",
      "dense texture"
    ]
  }
];

const SPECIES_PLAN_ADDITIONS: Record<MascotSpeciesId, string[]> = {
  cat: [
    "near-square cat head",
    "pointed cat ears",
    "very short cat muzzle",
    "two whisker dashes each cheek",
    "eraser-crumb tail silhouette"
  ],
  dog: [
    "domestic puppy mascot",
    "soft rounded dog ears",
    "short rounded puppy muzzle",
    "tiny button nose",
    "cute domestic dog silhouette",
    "not a wolf",
    "not a rabbit",
    "both eyes same size",
    "no eye patch marking"
  ],
  wolf: [
    "alert wolf mascot",
    "upright wolf ears",
    "short angular wedge muzzle",
    "broad wolf cheek ruff",
    "cute wolf silhouette",
    "not a dog",
    "not a fox",
    "minimal fur detail only",
    "no fur hatching",
    "broader wolf head instead of a narrow fox face",
    "simple tail with no furry texture"
  ]
};

function loadRepoEnv(envPath: string): void {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function getArgValues(name: string): string[] {
  const results: string[] = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const current = process.argv[index];
    if (current === `--${name}`) {
      const next = process.argv[index + 1];
      if (next && !next.startsWith("--")) {
        results.push(next);
        index += 1;
      }
      continue;
    }

    if (current.startsWith(`--${name}=`)) {
      results.push(current.slice(name.length + 3));
    }
  }
  return results;
}

function getArgValue(name: string): string | undefined {
  return getArgValues(name).at(-1);
}

function parseSpeciesSelection(): MascotSpeciesId[] {
  const argValues = getArgValues("species");
  const source = argValues.length > 0 ? argValues.join(",") : process.env.MASCOT_BANK_SPECIES ?? "dog,wolf";
  const species = source
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is MascotSpeciesId => entry === "cat" || entry === "dog" || entry === "wolf");
  return [...new Set(species)];
}

function parseSlotSelection(): Set<string> {
  const argValues = getArgValues("slot");
  const source = argValues.length > 0 ? argValues.join(",") : process.env.MASCOT_BANK_SLOT_FILTER ?? "";
  return new Set(
    source
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeFloat(value: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugifySlotId(slotId: string): string {
  return slotId.replaceAll(".", "_");
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("png")) {
    return "png";
  }
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    return "jpg";
  }
  if (mimeType.includes("webp")) {
    return "webp";
  }
  if (mimeType.includes("svg")) {
    return "svg";
  }
  return "bin";
}

function mergeUniqueNotes(existing: string[] | undefined, next: string[]): string[] {
  return [...new Set([...(existing ?? []), ...next])];
}

function buildProvider(): { provider: ReturnType<typeof createCharacterProvider>; providerName: CharacterProviderName } {
  const requestedProvider = getArgValue("provider") ?? process.env.MASCOT_BANK_PROVIDER;
  const providerName = resolveProviderName({
    requestedProvider,
    comfyUiUrl: process.env.COMFYUI_URL ?? process.env.COMFYUI_BASE_URL,
    vertexImagenProjectId: process.env.IMAGEGEN_VERTEX_PROJECT_ID,
    remoteApiBaseUrl: process.env.IMAGEGEN_REMOTE_BASE_URL
  });

  if (providerName === "mock") {
    throw new Error("No real premium provider configured. Set MASCOT_BANK_PROVIDER or IMAGEGEN_VERTEX_*/IMAGEGEN_REMOTE_* env.");
  }

  const provider = createCharacterProvider({
    provider: providerName,
    comfyUiUrl: process.env.COMFYUI_URL ?? process.env.COMFYUI_BASE_URL,
    remoteApi: {
      baseUrl: process.env.IMAGEGEN_REMOTE_BASE_URL,
      apiKey: process.env.IMAGEGEN_REMOTE_API_KEY,
      headerName: process.env.IMAGEGEN_REMOTE_HEADER_NAME,
      headerValuePrefix: process.env.IMAGEGEN_REMOTE_HEADER_VALUE_PREFIX,
      timeoutMs: parsePositiveInt(process.env.IMAGEGEN_REMOTE_TIMEOUT_MS, 60_000),
      model: process.env.IMAGEGEN_REMOTE_MODEL,
      imageSize: process.env.IMAGEGEN_REMOTE_IMAGE_SIZE,
      quality: process.env.IMAGEGEN_REMOTE_QUALITY,
      outputFormat: process.env.IMAGEGEN_REMOTE_OUTPUT_FORMAT,
      estimatedCostUsdPerImage: parseNonNegativeFloat(process.env.IMAGEGEN_COST_PER_IMAGE_USD, 0)
    },
    vertexImagen: {
      projectId: process.env.IMAGEGEN_VERTEX_PROJECT_ID,
      location: process.env.IMAGEGEN_VERTEX_LOCATION,
      model: process.env.IMAGEGEN_VERTEX_MODEL,
      generateModel: process.env.IMAGEGEN_VERTEX_GENERATE_MODEL,
      editModel: process.env.IMAGEGEN_VERTEX_EDIT_MODEL,
      accessToken: process.env.IMAGEGEN_VERTEX_ACCESS_TOKEN,
      timeoutMs: parsePositiveInt(process.env.IMAGEGEN_VERTEX_TIMEOUT_MS, 60_000),
      outputFormat: process.env.IMAGEGEN_VERTEX_OUTPUT_FORMAT,
      aspectRatio: process.env.IMAGEGEN_VERTEX_ASPECT_RATIO,
      estimatedCostUsdPerImage: parseNonNegativeFloat(process.env.IMAGEGEN_COST_PER_IMAGE_USD, 0)
    }
  });

  return { provider, providerName };
}

function buildCandidateBankManifest(input: {
  current: MascotReferenceBankManifest;
  speciesId: MascotSpeciesId;
  providerName: CharacterProviderName;
  presetId: string;
  keepScaffoldOnly: boolean;
}): MascotReferenceBankManifest {
  const generatedNote = `${input.speciesId} candidate bank staged from ${input.providerName} preset ${input.presetId} on ${new Date().toISOString().slice(0, 10)}`;
  return {
    ...input.current,
    profileId: input.speciesId,
    speciesId: input.speciesId,
    variant: "candidate",
    replacementStrategy: "replace",
    bankStatus: input.keepScaffoldOnly ? "scaffold_only" : "species_ready",
    notes: mergeUniqueNotes(input.current.notes, [
      generatedNote,
      input.keepScaffoldOnly
        ? "generated candidate assets are staged for manual review before promotion"
        : "generated candidate assets were promoted ready for species rollout"
    ]),
    style: [
      {
        path: "./style_front_primary.png",
        note: `${input.speciesId} candidate front style canon`
      }
    ],
    starterByView: {
      front: [
        {
          path: "./family_front_primary.png",
          note: `${input.speciesId} candidate front starter scaffold`
        }
      ],
      threeQuarter: [
        {
          path: "./family_threeQuarter_primary.png",
          note: `${input.speciesId} candidate three-quarter starter scaffold`
        }
      ],
      profile: [
        {
          path: "./family_profile_primary.png",
          note: `${input.speciesId} candidate profile starter scaffold`
        }
      ]
    },
    familyByView: {
      front: [
        {
          path: "./family_front_primary.png",
          note: `${input.speciesId} candidate front composition anchor`
        }
      ],
      threeQuarter: [
        {
          path: "./family_threeQuarter_primary.png",
          note: `${input.speciesId} candidate three-quarter composition anchor`
        }
      ],
      profile: [
        {
          path: "./family_profile_primary.png",
          note: `${input.speciesId} candidate profile composition anchor`
        }
      ]
    },
    heroByView: {
      front: [
        {
          path: "./hero_front_primary.png",
          note: `${input.speciesId} candidate front hero identity ref`
        }
      ]
    }
  };
}

async function run(): Promise<void> {
  loadRepoEnv(ROOT_ENV_PATH);

  const speciesList = parseSpeciesSelection();
  if (speciesList.length === 0) {
    throw new Error("No valid species selected. Use --species dog --species wolf or MASCOT_BANK_SPECIES=dog,wolf.");
  }
  const slotSelection = parseSlotSelection();

  const presetId = getArgValue("preset") ?? process.env.MASCOT_BANK_PRESET ?? "mascot-bank-canon-premium";
  const baseSeed = parsePositiveInt(getArgValue("base-seed") ?? process.env.MASCOT_BANK_BASE_SEED, 4200);
  const candidateCount = Math.min(2, parsePositiveInt(getArgValue("candidate-count") ?? process.env.MASCOT_BANK_CANDIDATE_COUNT, 1));
  const keepScaffoldOnly = !parseBoolean(getArgValue("promote-ready") ?? process.env.MASCOT_BANK_PROMOTE_READY, false);
  const { provider, providerName } = buildProvider();

  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary: Array<Record<string, unknown>> = [];

  for (const [speciesIndex, speciesId] of speciesList.entries()) {
    const candidateDir = path.join(REPO_ROOT, "refs", "mascots", speciesId, "candidate");
    const bankManifestPath = path.join(candidateDir, "bank.json");
    if (!fs.existsSync(bankManifestPath)) {
      throw new Error(`Missing candidate bank manifest for ${speciesId}: ${bankManifestPath}`);
    }

    ensureDir(candidateDir);
    const outDir = path.join(REPO_ROOT, "out", "mascot_bank_generation", speciesId, runStamp);
    ensureDir(outDir);

    const generationRecords: Array<Record<string, unknown>> = [];
    const activePlans =
      slotSelection.size > 0 ? BASE_ASSET_PLANS.filter((entry) => slotSelection.has(entry.slotId)) : BASE_ASSET_PLANS;
    if (activePlans.length === 0) {
      throw new Error(`No matching asset slots selected for species=${speciesId}.`);
    }

    for (const [slotIndex, slot] of activePlans.entries()) {
      const slotPromptBundle = buildCharacterPrompt({
        mode: "new",
        presetId,
        speciesId,
        positivePrompt: [...SPECIES_PLAN_ADDITIONS[speciesId], ...slot.promptAdditions].join(", "),
        negativePrompt: slot.negativeAdditions?.join(", ")
      });

      const input: CharacterProviderGenerateInput = {
        mode: "new",
        views: [slot.view],
        candidateCount,
        baseSeed: baseSeed + speciesIndex * 10_000 + slotIndex * 1_000,
        speciesId,
        positivePrompt: slotPromptBundle.viewPrompts[slot.view],
        negativePrompt: slotPromptBundle.negativePrompt,
        presetId: slotPromptBundle.presetId,
        qualityProfile: slotPromptBundle.qualityProfile,
        guardrails: slotPromptBundle.guardrails,
        viewPrompts: {
          [slot.view]: slotPromptBundle.viewPrompts[slot.view]
        },
        selectionHints: slotPromptBundle.selectionHints
      };

      const result = await provider.generate(input);
      const sortedCandidates = [...result.candidates].sort((left, right) => left.candidateIndex - right.candidateIndex);
      if (sortedCandidates.length === 0) {
        throw new Error(`Provider returned no candidates for ${speciesId} ${slot.slotId}`);
      }

      const slotOutDir = path.join(outDir, slugifySlotId(slot.slotId));
      ensureDir(slotOutDir);

      const candidateFiles = sortedCandidates.map((candidate) => {
        const ext = extensionForMimeType(candidate.mimeType);
        const fileName = `${slot.fileName.replace(/\.[^.]+$/, "")}_candidate_${candidate.candidateIndex}.${ext}`;
        const filePath = path.join(slotOutDir, fileName);
        fs.writeFileSync(filePath, candidate.data);
        return {
          candidateId: candidate.id,
          candidateIndex: candidate.candidateIndex,
          filePath,
          mimeType: candidate.mimeType,
          seed: candidate.seed,
          providerMeta: candidate.providerMeta ?? null
        };
      });

      const promotedCandidate = sortedCandidates[0];
      const promotedPath = path.join(candidateDir, slot.fileName);
      fs.writeFileSync(promotedPath, promotedCandidate.data);

      generationRecords.push({
        slotId: slot.slotId,
        kind: slot.kind,
        view: slot.view,
        targetPath: promotedPath,
        promptPresetId: slotPromptBundle.presetId,
        qualityProfileId: slotPromptBundle.qualityProfile.id,
        prompt: slotPromptBundle.viewPrompts[slot.view],
        negativePrompt: slotPromptBundle.negativePrompt,
        generatedCandidates: candidateFiles
      });
    }

    const currentManifest = JSON.parse(fs.readFileSync(bankManifestPath, "utf8")) as MascotReferenceBankManifest;
    const nextManifest = buildCandidateBankManifest({
      current: currentManifest,
      speciesId,
      providerName,
      presetId,
      keepScaffoldOnly
    });
    fs.writeFileSync(bankManifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");

    const runManifestPath = path.join(outDir, "manifest.json");
    fs.writeFileSync(
      runManifestPath,
      `${JSON.stringify(
        {
          speciesId,
          provider: providerName,
          presetId,
          candidateCount,
          keepScaffoldOnly,
          generatedAt: new Date().toISOString(),
          outDir,
          candidateDir,
          assets: generationRecords
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    summary.push({
      speciesId,
      provider: providerName,
      presetId,
      keepScaffoldOnly,
      candidateDir,
      runManifestPath
    });
  }

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

await run();
