import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  buildMascotBankPromptBundle,
  createCharacterProvider,
  resolveProviderName,
  type CharacterProviderGenerateInput,
  type CharacterProviderName,
  type CharacterView,
  type MascotReferenceBankManifest,
  type MascotSpeciesId,
  resolveMascotFamilyArchetype,
  resolveMascotSpeciesProfile
} from "./index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const ROOT_ENV_PATH = path.join(REPO_ROOT, ".env");

type SlotKind = "style" | "family" | "hero";
type CandidateBankGenerationPhase = "front_master" | "family_views" | "full";

type CandidateBankAssetPlan = {
  slotId: string;
  kind: SlotKind;
  view: CharacterView;
  fileName: string;
  executionMode: "generate_front" | "copy_front" | "hero_crop" | "reference_edit";
  promptAdditions: string[];
  negativeAdditions?: string[];
  deriveFromFrontMaster?: boolean;
  candidateCountOverride?: number;
};

type GeneratedReferenceAsset = {
  filePath: string;
  buffer: Buffer;
  mimeType: string;
  base64: string;
  width: number;
  height: number;
};

const FRONT_MASTER_SLOT_ID = "style.front.primary";

const BASE_ASSET_PLANS: CandidateBankAssetPlan[] = [
  {
    slotId: "style.front.primary",
    kind: "style",
    view: "front",
    fileName: "style_front_primary.png",
    executionMode: "generate_front",
    promptAdditions: [
      "approved front master bank seed",
      "strict front view",
      "neutral standing pose",
      "both short arms visible",
      "full body visible",
      "clean centered composition",
      "no prop",
      "no emotion"
    ],
    candidateCountOverride: 2
  },
  {
    slotId: "family.front.primary",
    kind: "family",
    view: "front",
    fileName: "family_front_primary.png",
    executionMode: "copy_front",
    promptAdditions: ["reuse the approved front master as the front family composition anchor"],
    deriveFromFrontMaster: true,
    candidateCountOverride: 1
  },
  {
    slotId: "family.threeQuarter.primary",
    kind: "family",
    view: "threeQuarter",
    fileName: "family_threeQuarter_primary.png",
    executionMode: "reference_edit",
    promptAdditions: [
      "derive from the supplied front master without redesign",
      "three-quarter composition anchor",
      "full body visible",
      "clear torso yaw",
      "no near-front collapse",
      "preserve the same body proportion and silhouette family"
    ],
    deriveFromFrontMaster: true,
    candidateCountOverride: 1
  },
  {
    slotId: "family.profile.primary",
    kind: "family",
    view: "profile",
    fileName: "family_profile_primary.png",
    executionMode: "reference_edit",
    promptAdditions: [
      "derive from the supplied front master without redesign",
      "profile composition anchor",
      "full body visible",
      "one-eye side profile only",
      "clean readable silhouette",
      "preserve the same body proportion and silhouette family"
    ],
    deriveFromFrontMaster: true,
    candidateCountOverride: 1
  },
  {
    slotId: "hero.front.primary",
    kind: "hero",
    view: "front",
    fileName: "hero_front_primary.png",
    executionMode: "hero_crop",
    promptAdditions: ["derive a stable front hero identity crop from the approved front master"],
    negativeAdditions: [
      "multiple characters",
      "comparison panels",
      "inset figures",
      "turnaround sheet",
      "fur hatching",
      "dense texture"
    ],
    deriveFromFrontMaster: true,
    candidateCountOverride: 1
  }
];

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

function parsePhaseSelection(): CandidateBankGenerationPhase {
  const value = (getArgValue("phase") ?? process.env.MASCOT_BANK_PHASE ?? "front_master").trim().toLowerCase();
  if (value === "family_views" || value === "full") {
    return value;
  }
  return "front_master";
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

function removeIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
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

function mimeTypeForFilePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") {
    return "image/png";
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "application/octet-stream";
}

async function loadReferenceAsset(filePath: string): Promise<GeneratedReferenceAsset> {
  const buffer = fs.readFileSync(filePath);
  const metadata = await sharp(buffer).metadata();
  return {
    filePath,
    buffer,
    mimeType: mimeTypeForFilePath(filePath),
    base64: buffer.toString("base64"),
    width: metadata.width ?? 1024,
    height: metadata.height ?? 1024
  };
}

type SubjectBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type EstimatedBackground = {
  r: number;
  g: number;
  b: number;
  alpha: number;
};

async function loadRaster(asset: GeneratedReferenceAsset): Promise<{
  data: Buffer<ArrayBufferLike>;
  width: number;
  height: number;
  channels: number;
  background: EstimatedBackground;
}> {
  const { data, info } = await sharp(asset.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
    background: estimateBackgroundColor(data, info.width, info.height, info.channels)
  };
}

function estimateBackgroundColor(
  data: Buffer<ArrayBufferLike>,
  width: number,
  height: number,
  channels: number
): EstimatedBackground {
  const points: Array<[number, number]> = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), Math.max(0, height - 1)]
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let alpha = 0;
  for (const [x, y] of points) {
    const idx = (y * width + x) * channels;
    r += data[idx] ?? 255;
    g += data[idx + 1] ?? 255;
    b += data[idx + 2] ?? 255;
    alpha += data[idx + 3] ?? 255;
  }
  return {
    r: Math.round(r / points.length),
    g: Math.round(g / points.length),
    b: Math.round(b / points.length),
    alpha: Math.round(alpha / points.length)
  };
}

function foregroundDistance(data: Buffer<ArrayBufferLike>, index: number, background: EstimatedBackground): number {
  return (
    Math.abs((data[index] ?? 255) - background.r) +
    Math.abs((data[index + 1] ?? 255) - background.g) +
    Math.abs((data[index + 2] ?? 255) - background.b)
  );
}

function detectSubjectBounds(
  data: Buffer<ArrayBufferLike>,
  width: number,
  height: number,
  channels: number,
  background: EstimatedBackground,
  threshold = 18
): SubjectBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * channels;
      const alpha = data[idx + 3] ?? 255;
      if (alpha < 16 || foregroundDistance(data, idx, background) < threshold) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) {
    return null;
  }
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

async function createSubjectMaskBase64(asset: GeneratedReferenceAsset): Promise<string> {
  const raster = await loadRaster(asset);
  const mask = Buffer.alloc(raster.width * raster.height * 4, 0);
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const idx = (y * raster.width + x) * raster.channels;
      const outIdx = (y * raster.width + x) * 4;
      const alpha = raster.data[idx + 3] ?? 255;
      const enabled = alpha >= 16 && foregroundDistance(raster.data, idx, raster.background) >= 18;
      const value = enabled ? 255 : 0;
      mask[outIdx] = value;
      mask[outIdx + 1] = value;
      mask[outIdx + 2] = value;
      mask[outIdx + 3] = 255;
    }
  }
  const buffer = await sharp(mask, {
    raw: { width: raster.width, height: raster.height, channels: 4 }
  })
    .dilate(2)
    .png()
    .toBuffer();
  return buffer.toString("base64");
}

async function deriveHeroCropBuffer(asset: GeneratedReferenceAsset, familyId: string): Promise<Buffer> {
  const family = resolveMascotFamilyArchetype(familyId);
  const raster = await loadRaster(asset);
  const subject =
    detectSubjectBounds(raster.data, raster.width, raster.height, raster.channels, raster.background) ?? {
      left: 0,
      top: 0,
      width: raster.width,
      height: raster.height
    };
  const cropLeft = Math.max(0, subject.left - Math.round(subject.width * family.heroCrop.sidePadRatio));
  const cropWidth = Math.min(
    raster.width - cropLeft,
    subject.width + Math.round(subject.width * family.heroCrop.sidePadRatio * 2)
  );
  const cropTop = Math.max(0, Math.round(subject.top - subject.height * family.heroCrop.topBias));
  const cropHeight = Math.min(raster.height - cropTop, Math.max(1, Math.round(subject.height * family.heroCrop.heightRatio)));
  const resizedHeight = Math.max(1, Math.round(raster.height * family.heroCrop.targetHeightRatio));
  const topPad = Math.max(0, Math.floor((raster.height - resizedHeight) / 2));
  const bottomPad = Math.max(0, raster.height - resizedHeight - topPad);
  return sharp(asset.buffer)
    .extract({
      left: cropLeft,
      top: cropTop,
      width: Math.max(1, cropWidth),
      height: Math.max(1, cropHeight)
    })
    .resize(raster.width, resizedHeight, {
      fit: "contain",
      background: {
        r: raster.background.r,
        g: raster.background.g,
        b: raster.background.b,
        alpha: 1
      }
    })
    .extend({
      top: topPad,
      bottom: bottomPad,
      left: 0,
      right: 0,
      background: {
        r: raster.background.r,
        g: raster.background.g,
        b: raster.background.b,
        alpha: 1
      }
    })
    .png()
    .toBuffer();
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

function buildSlotPromptBundle(input: {
  speciesId: MascotSpeciesId;
  presetId: string;
  slot: CandidateBankAssetPlan;
  referenceDriven: boolean;
}) {
  return buildMascotBankPromptBundle({
    presetId: input.presetId,
    speciesId: input.speciesId,
    view: input.slot.view,
    stage: input.referenceDriven ? "reference_derivation" : "front_master",
    positiveTokens: input.slot.promptAdditions,
    negativeTokens: input.slot.negativeAdditions
  });
}

function resolvePlansForPhase(phase: CandidateBankGenerationPhase): CandidateBankAssetPlan[] {
  switch (phase) {
    case "family_views":
      return BASE_ASSET_PLANS.filter(
        (entry) => entry.slotId === "family.threeQuarter.primary" || entry.slotId === "family.profile.primary"
      );
    case "full":
      return BASE_ASSET_PLANS;
    case "front_master":
    default:
      return BASE_ASSET_PLANS.filter(
        (entry) =>
          entry.slotId === FRONT_MASTER_SLOT_ID ||
          entry.slotId === "family.front.primary" ||
          entry.slotId === "hero.front.primary"
      );
  }
}

function pruneStaleCandidateOutputsForPhase(candidateDir: string, phase: CandidateBankGenerationPhase): void {
  if (phase !== "front_master") {
    return;
  }
  removeIfExists(path.join(candidateDir, "family_threeQuarter_primary.png"));
  removeIfExists(path.join(candidateDir, "family_profile_primary.png"));
}

function buildAssetEntry(relativePath: string, note: string): { path: string; note: string }[] {
  return [{ path: relativePath, note }];
}

function ensurePhaseUnlock(input: {
  currentManifest: MascotReferenceBankManifest;
  speciesId: MascotSpeciesId;
  phase: CandidateBankGenerationPhase;
}): void {
  if (input.phase !== "family_views") {
    return;
  }
  if (!input.currentManifest.frontApproval?.approvedAt) {
    throw new Error(
      `Cannot generate family views for ${input.speciesId} before front approval. Run bank front review/approval first.`
    );
  }
}

function buildCandidateBankManifest(input: {
  current: MascotReferenceBankManifest;
  speciesId: MascotSpeciesId;
  providerName: CharacterProviderName;
  presetId: string;
  keepScaffoldOnly: boolean;
  candidateDir: string;
  phase: CandidateBankGenerationPhase;
}): MascotReferenceBankManifest {
  const speciesProfile = resolveMascotSpeciesProfile(input.speciesId);
  const generatedNote = `${input.speciesId} candidate bank staged from ${input.providerName} preset ${input.presetId} on ${new Date().toISOString().slice(0, 10)}`;
  const styleExists = fs.existsSync(path.join(input.candidateDir, "style_front_primary.png"));
  const frontExists = fs.existsSync(path.join(input.candidateDir, "family_front_primary.png"));
  const threeQuarterExists = fs.existsSync(path.join(input.candidateDir, "family_threeQuarter_primary.png"));
  const profileExists = fs.existsSync(path.join(input.candidateDir, "family_profile_primary.png"));
  const heroExists = fs.existsSync(path.join(input.candidateDir, "hero_front_primary.png"));
  const sideViewCount = Number(threeQuarterExists) + Number(profileExists);
  const allRequiredExist = styleExists && frontExists && threeQuarterExists && profileExists && heroExists;
  const frontApproved = Boolean(input.current.frontApproval?.approvedAt) && input.phase === "family_views";
  const canonStage = !styleExists
    ? "scaffold"
    : allRequiredExist
      ? input.keepScaffoldOnly
        ? "review_ready"
        : "species_ready"
      : sideViewCount > 0
        ? "family_views_seeded"
        : frontApproved
          ? "front_approved"
          : heroExists
          ? "hero_seeded"
          : "front_master_seeded";
  const qualityStatus =
    !styleExists
      ? "unchecked"
      : input.phase === "front_master"
        ? "review_needed"
        : input.keepScaffoldOnly
          ? "review_needed"
          : "approved";
  const bankStatus = !input.keepScaffoldOnly && allRequiredExist ? "species_ready" : "scaffold_only";
  const phaseNotes =
    input.phase === "front_master"
      ? [
          "front-master phase only: generate style.front, copy family.front, and derive hero.front before any side-view generation",
          "do not derive three-quarter/profile until the front master is manually approved"
        ]
      : input.phase === "family_views"
        ? [
            "family-views phase: derive three-quarter/profile only from an approved front master",
            "reject and rerun family-views if side silhouettes drift away from the approved front master"
          ]
        : [
            "full phase: front master and family views were generated in a single staged run",
            "use full phase only when front-master discovery has already been validated for this species family"
          ];
  return {
    ...input.current,
    profileId: input.speciesId,
    speciesId: input.speciesId,
    familyId: speciesProfile.familyId,
    variant: "candidate",
    replacementStrategy: "replace",
    bankStatus,
    canonStage,
    qualityStatus,
    frontApproval: input.phase === "family_views" ? input.current.frontApproval : undefined,
    visualQc: input.phase === "family_views" ? input.current.visualQc : undefined,
    notes: mergeUniqueNotes(input.current.notes, [
      generatedNote,
      ...phaseNotes,
      `front master first workflow: ${FRONT_MASTER_SLOT_ID} establishes identity, family.front reuses the approved front, hero.front is cropped from the approved front, and side views derive from the approved front master`,
      bankStatus === "scaffold_only"
        ? "generated candidate assets are staged for manual review before promotion"
        : "generated candidate assets were promoted ready for species rollout"
    ]),
    qualityNotes: [
      "front family slot is copied directly from the approved front master to avoid front drift",
      "hero front slot is derived by deterministic crop from the approved front master",
      ...(input.phase === "front_master"
        ? ["side views stay intentionally ungenerated until front-master QA is complete"]
        : ["three-quarter and profile slots are generated from a subject-mask front-master derivation path"])
    ],
    style: styleExists ? buildAssetEntry("./style_front_primary.png", `${input.speciesId} candidate front style canon`) : [],
    starterByView: {
      front: frontExists ? buildAssetEntry("./family_front_primary.png", `${input.speciesId} candidate front starter scaffold`) : [],
      threeQuarter: threeQuarterExists
        ? buildAssetEntry("./family_threeQuarter_primary.png", `${input.speciesId} candidate three-quarter starter scaffold`)
        : [],
      profile: profileExists
        ? buildAssetEntry("./family_profile_primary.png", `${input.speciesId} candidate profile starter scaffold`)
        : []
    },
    familyByView: {
      front: frontExists ? buildAssetEntry("./family_front_primary.png", `${input.speciesId} candidate front composition anchor`) : [],
      threeQuarter: threeQuarterExists
        ? buildAssetEntry("./family_threeQuarter_primary.png", `${input.speciesId} candidate three-quarter composition anchor`)
        : [],
      profile: profileExists
        ? buildAssetEntry("./family_profile_primary.png", `${input.speciesId} candidate profile composition anchor`)
        : []
    },
    heroByView: {
      front: heroExists ? buildAssetEntry("./hero_front_primary.png", `${input.speciesId} candidate front hero identity ref`) : []
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
  const phase = parsePhaseSelection();

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
    pruneStaleCandidateOutputsForPhase(candidateDir, phase);
    const outDir = path.join(REPO_ROOT, "out", "mascot_bank_generation", speciesId, runStamp);
    ensureDir(outDir);

    const generationRecords: Array<Record<string, unknown>> = [];
    const phasePlans = resolvePlansForPhase(phase);
    const activePlansRaw =
      slotSelection.size > 0 ? phasePlans.filter((entry) => slotSelection.has(entry.slotId)) : phasePlans;
    const activePlans = [
      ...activePlansRaw.filter((entry) => entry.slotId === FRONT_MASTER_SLOT_ID),
      ...activePlansRaw.filter((entry) => entry.slotId !== FRONT_MASTER_SLOT_ID)
    ];
    if (activePlans.length === 0) {
      throw new Error(`No matching asset slots selected for species=${speciesId}.`);
    }

    const explicitFrontMasterPath = getArgValue("front-master-path");
    let frontMasterAsset: GeneratedReferenceAsset | null = null;
    let frontMasterMaskBase64: string | null = null;

    for (const [slotIndex, slot] of activePlans.entries()) {
      if (slot.deriveFromFrontMaster && !frontMasterAsset) {
        const existingFrontMasterPath =
          explicitFrontMasterPath ?? path.join(candidateDir, BASE_ASSET_PLANS[0].fileName);
        if (!fs.existsSync(existingFrontMasterPath)) {
          throw new Error(
            `Cannot derive ${slot.slotId} for ${speciesId} without a front master. Generate ${FRONT_MASTER_SLOT_ID} first or pass --front-master-path.`
          );
        }
        frontMasterAsset = await loadReferenceAsset(existingFrontMasterPath);
        frontMasterMaskBase64 = await createSubjectMaskBase64(frontMasterAsset);
      }

      const slotOutDir = path.join(outDir, slugifySlotId(slot.slotId));
      ensureDir(slotOutDir);
      const promotedPath = path.join(candidateDir, slot.fileName);

      if (slot.executionMode === "copy_front") {
        if (!frontMasterAsset) {
          throw new Error(`Cannot copy ${slot.slotId} without an approved front master for ${speciesId}.`);
        }
        const derivedPath = path.join(slotOutDir, `${slot.fileName.replace(/\.[^.]+$/, "")}_candidate_0.png`);
        fs.writeFileSync(derivedPath, frontMasterAsset.buffer);
        fs.writeFileSync(promotedPath, frontMasterAsset.buffer);
        generationRecords.push({
          slotId: slot.slotId,
          kind: slot.kind,
          view: slot.view,
          targetPath: promotedPath,
          promptPresetId: presetId,
          qualityProfileId: "derived_from_front_master",
          mode: "derived_copy",
          frontMasterSourcePath: frontMasterAsset.filePath,
          prompt: null,
          negativePrompt: null,
          generatedCandidates: [
            {
              candidateId: `derived_copy_${slot.slotId}`,
              candidateIndex: 0,
              filePath: derivedPath,
              mimeType: frontMasterAsset.mimeType,
              seed: null,
              providerMeta: {
                derivationMode: "copy_front_master"
              }
            }
          ]
        });
        continue;
      }

      if (slot.executionMode === "hero_crop") {
        if (!frontMasterAsset) {
          throw new Error(`Cannot derive ${slot.slotId} without an approved front master for ${speciesId}.`);
        }
        const speciesProfile = resolveMascotSpeciesProfile(speciesId);
        const heroBuffer = await deriveHeroCropBuffer(frontMasterAsset, speciesProfile.familyId);
        const derivedPath = path.join(slotOutDir, `${slot.fileName.replace(/\.[^.]+$/, "")}_candidate_0.png`);
        fs.writeFileSync(derivedPath, heroBuffer);
        fs.writeFileSync(promotedPath, heroBuffer);
        generationRecords.push({
          slotId: slot.slotId,
          kind: slot.kind,
          view: slot.view,
          targetPath: promotedPath,
          promptPresetId: presetId,
          qualityProfileId: "derived_from_front_master_crop",
          mode: "derived_hero_crop",
          frontMasterSourcePath: frontMasterAsset.filePath,
          prompt: null,
          negativePrompt: null,
          generatedCandidates: [
            {
              candidateId: `derived_hero_crop_${slot.slotId}`,
              candidateIndex: 0,
              filePath: derivedPath,
              mimeType: "image/png",
              seed: null,
              providerMeta: {
                derivationMode: "hero_crop_from_front_master",
                familyId: speciesProfile.familyId
              }
            }
          ]
        });
        continue;
      }

      const referenceDriven = slot.executionMode === "reference_edit";
      const slotPromptBundle = buildSlotPromptBundle({
        speciesId,
        presetId,
        slot,
        referenceDriven
      });

      const input: CharacterProviderGenerateInput = {
        mode: referenceDriven ? "reference" : "new",
        views: [slot.view],
        candidateCount: slot.candidateCountOverride ?? candidateCount,
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
        selectionHints: slotPromptBundle.selectionHints,
        ...(referenceDriven && frontMasterAsset
          ? {
              referenceMode: "img2img" as const,
              referenceImageBase64: frontMasterAsset.base64,
              referenceMimeType: frontMasterAsset.mimeType,
              repairMaskImageBase64: frontMasterMaskBase64 ?? undefined,
              repairMaskMimeType: "image/png" as const
            }
          : {})
      };

      const result = await provider.generate(input);
      const sortedCandidates = [...result.candidates].sort((left, right) => left.candidateIndex - right.candidateIndex);
      if (sortedCandidates.length === 0) {
        throw new Error(`Provider returned no candidates for ${speciesId} ${slot.slotId}`);
      }

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
      fs.writeFileSync(promotedPath, promotedCandidate.data);

      generationRecords.push({
        slotId: slot.slotId,
        kind: slot.kind,
        view: slot.view,
        targetPath: promotedPath,
        promptPresetId: slotPromptBundle.presetId,
        qualityProfileId: slotPromptBundle.qualityProfile.id,
        mode: referenceDriven ? "reference" : "new",
        executionMode: slot.executionMode,
        ...(referenceDriven && frontMasterAsset ? { frontMasterSourcePath: frontMasterAsset.filePath } : {}),
        prompt: slotPromptBundle.viewPrompts[slot.view],
        negativePrompt: slotPromptBundle.negativePrompt,
        generatedCandidates: candidateFiles
      });

      if (slot.slotId === FRONT_MASTER_SLOT_ID) {
        frontMasterAsset = await loadReferenceAsset(promotedPath);
        frontMasterMaskBase64 = await createSubjectMaskBase64(frontMasterAsset);
      }
    }

    const currentManifest = JSON.parse(fs.readFileSync(bankManifestPath, "utf8")) as MascotReferenceBankManifest;
    ensurePhaseUnlock({
      currentManifest,
      speciesId,
      phase
    });
    const nextManifest = buildCandidateBankManifest({
      current: currentManifest,
      speciesId,
      providerName,
      presetId,
      keepScaffoldOnly,
      candidateDir,
      phase
    });
    fs.writeFileSync(bankManifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");

    const runManifestPath = path.join(outDir, "manifest.json");
    fs.writeFileSync(
      runManifestPath,
      `${JSON.stringify(
        {
          speciesId,
          provider: providerName,
          phase,
          presetId,
          candidateCount,
          frontMasterSlotId: FRONT_MASTER_SLOT_ID,
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
