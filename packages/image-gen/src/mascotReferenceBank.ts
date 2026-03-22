import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMascotSpeciesProfile } from "./species";
import type {
  CharacterReferenceRole,
  CharacterView,
  MascotReferenceAssetEntry,
  MascotReferenceAssetRequirement,
  MascotReferenceBankManifest,
  MascotSpeciesId
} from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const MASCOT_REFERENCE_BANK_ROOT = path.join(REPO_ROOT, "refs", "mascots");
export type ResolvedMascotReferenceAsset = {
  filePath: string;
  note?: string;
  weight?: number;
  speciesId: MascotSpeciesId;
  bankStatus: "species_ready" | "scaffold_only";
};

export type MascotReferenceBankDiagnostics = {
  speciesId: MascotSpeciesId;
  familyId: string;
  status: "species_ready" | "scaffold_only";
  declaredStatus: "species_ready" | "scaffold_only";
  statusMismatch: boolean;
  variant: "canonical" | "candidate";
  canonStage:
    | "scaffold"
    | "front_master_seeded"
    | "front_approved"
    | "family_views_seeded"
    | "hero_seeded"
    | "review_ready"
    | "species_ready";
  qualityStatus: "unchecked" | "review_needed" | "approved";
  frontApproved: boolean;
  productionLocked: boolean;
  visualQcOverallScore?: number;
  manifestPath: string;
  legacyTemporary: boolean;
  styleCount: number;
  heroCount: number;
  requiredAssetCount: number;
  requiredAssetSlots: string[];
  unsatisfiedRequiredAssetCount: number;
  unsatisfiedRequiredAssetSlots: string[];
  missingRoles: CharacterReferenceRole[];
  notes: string[];
  qualityNotes: string[];
};

export type MascotReferenceAssetRequirementStatus = MascotReferenceAssetRequirement & {
  satisfied: boolean;
  resolvedPath?: string;
};

export type MascotReferenceBankReviewPlan = {
  reviewOnly: boolean;
  requiredManualSlots: string[];
  reviewNotes: string[];
};

export function resolveEffectiveMascotReferenceBankStatus(input: {
  declaredStatus?: "species_ready" | "scaffold_only";
  styleCount: number;
  unsatisfiedRequiredAssetCount: number;
}): "species_ready" | "scaffold_only" {
  const declaredStatus = input.declaredStatus ?? (input.styleCount > 0 ? "species_ready" : "scaffold_only");
  if (declaredStatus !== "species_ready") {
    return "scaffold_only";
  }
  return input.unsatisfiedRequiredAssetCount === 0 ? "species_ready" : "scaffold_only";
}

function normalizeMascotReferenceSpeciesId(speciesId?: MascotSpeciesId | string): MascotSpeciesId {
  return resolveMascotSpeciesProfile(speciesId).id;
}

function resolveActiveCandidateSpeciesSet(): Set<string> {
  return new Set(
    (process.env.MASCOT_REFERENCE_BANK_CANDIDATES ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );
}

function allowReviewCandidateReferences(): boolean {
  const value = (process.env.MASCOT_REFERENCE_BANK_ALLOW_REVIEW_CANDIDATES ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function resolveCanonicalMascotReferenceBankManifestPath(speciesId: MascotSpeciesId): string {
  return path.join(MASCOT_REFERENCE_BANK_ROOT, speciesId, "bank.json");
}

function resolveCandidateMascotReferenceBankManifestPath(speciesId: MascotSpeciesId): string {
  return path.join(MASCOT_REFERENCE_BANK_ROOT, speciesId, "candidate", "bank.json");
}

export function resolveMascotReferenceBankManifestPath(speciesId?: MascotSpeciesId | string): string {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const candidatePath = resolveCandidateMascotReferenceBankManifestPath(normalizedSpecies);
  const activeCandidateSpecies = resolveActiveCandidateSpeciesSet();
  const resolvedPath =
    activeCandidateSpecies.has(normalizedSpecies) && fs.existsSync(candidatePath)
      ? candidatePath
      : resolveCanonicalMascotReferenceBankManifestPath(normalizedSpecies);
  return resolvedPath;
}

function readRawMascotReferenceBankManifest(speciesId?: MascotSpeciesId | string): MascotReferenceBankManifest | null {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const manifestPath = resolveMascotReferenceBankManifestPath(normalizedSpecies);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MascotReferenceBankManifest;
  } catch {
    return null;
  }
}

function mergeMascotReferenceByView(
  base: Partial<Record<CharacterView, MascotReferenceAssetEntry[]>> | undefined,
  override: Partial<Record<CharacterView, MascotReferenceAssetEntry[]>> | undefined
): Partial<Record<CharacterView, MascotReferenceAssetEntry[]>> | undefined {
  const merged: Partial<Record<CharacterView, MascotReferenceAssetEntry[]>> = {
    ...(base ?? {})
  };
  for (const [view, entries] of Object.entries(override ?? {}) as [CharacterView, MascotReferenceAssetEntry[]][]) {
    merged[view] = entries;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeMascotReferenceBankManifest(
  base: MascotReferenceBankManifest,
  override: MascotReferenceBankManifest
): MascotReferenceBankManifest {
  return {
    ...base,
    ...override,
    profileId: override.profileId ?? base.profileId,
    speciesId: override.speciesId ?? base.speciesId,
    familyId: override.familyId ?? base.familyId,
    bankStatus: override.bankStatus ?? base.bankStatus,
    notes: [...new Set([...(base.notes ?? []), ...(override.notes ?? [])])],
    requiredAssets: override.requiredAssets ?? base.requiredAssets,
    style: override.style ?? base.style,
    starterByView: mergeMascotReferenceByView(base.starterByView, override.starterByView),
    familyByView: mergeMascotReferenceByView(base.familyByView, override.familyByView),
    heroByView: mergeMascotReferenceByView(base.heroByView, override.heroByView)
  };
}

function readMascotReferenceBankManifestAtPath(
  manifestPath: string,
  lineage: Set<string> = new Set<string>()
): MascotReferenceBankManifest | null {
  const resolvedManifestPath = path.resolve(manifestPath);
  if (lineage.has(resolvedManifestPath) || !fs.existsSync(resolvedManifestPath)) {
    return null;
  }

  lineage.add(resolvedManifestPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(resolvedManifestPath, "utf8")) as MascotReferenceBankManifest;
    const baseReference =
      typeof parsed.extends === "string" && parsed.extends.trim().length > 0 ? parsed.extends.trim() : undefined;
    if (!baseReference) {
      return parsed;
    }

    const baseManifest = readMascotReferenceBankManifestAtPath(
      path.resolve(path.dirname(resolvedManifestPath), baseReference),
      lineage
    );
    return baseManifest ? mergeMascotReferenceBankManifest(baseManifest, parsed) : parsed;
  } catch {
    return null;
  } finally {
    lineage.delete(resolvedManifestPath);
  }
}

export function resolveMascotReferenceBankManifest(speciesId?: MascotSpeciesId | string): MascotReferenceBankManifest | null {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const manifestPath = resolveMascotReferenceBankManifestPath(normalizedSpecies);
  return readMascotReferenceBankManifestAtPath(manifestPath);
}

function resolveCanonicalMascotReferenceBankManifest(speciesId?: MascotSpeciesId | string): MascotReferenceBankManifest | null {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  return readMascotReferenceBankManifestAtPath(resolveCanonicalMascotReferenceBankManifestPath(normalizedSpecies));
}

export function canUseMascotReferenceBankForProduction(
  diagnostics: Pick<MascotReferenceBankDiagnostics, "variant" | "status" | "canonStage" | "qualityStatus">
): boolean {
  if (diagnostics.variant !== "candidate") {
    return true;
  }
  if (allowReviewCandidateReferences()) {
    return true;
  }
  return (
    diagnostics.status === "species_ready" &&
    diagnostics.canonStage === "species_ready" &&
    diagnostics.qualityStatus === "approved"
  );
}

export function canUseApprovedMascotSideCanonAnchors(
  manifest: MascotReferenceBankManifest | null | undefined
): boolean {
  if (!manifest || manifest.legacyTemporary === true) {
    return false;
  }
  if (manifest.canonStage !== "species_ready" || manifest.qualityStatus !== "approved") {
    return false;
  }
  if (!manifest.familyViewApproval?.approvedAt) {
    return false;
  }
  const threeQuarterCount = manifest.familyByView?.threeQuarter?.length ?? 0;
  const profileCount = manifest.familyByView?.profile?.length ?? 0;
  return threeQuarterCount > 0 && profileCount > 0;
}

function resolveRequirementIndex(slotId: string): number {
  if (slotId.endsWith(".secondary")) {
    return 1;
  }
  if (slotId.endsWith(".tertiary")) {
    return 2;
  }
  return 0;
}

function resolveRequirementEntry(
  manifest: MascotReferenceBankManifest | null,
  requirement: MascotReferenceAssetRequirement
): MascotReferenceAssetEntry | undefined {
  const index = resolveRequirementIndex(requirement.slotId);
  if (requirement.role === "style") {
    return manifest?.style?.[index];
  }
  if (requirement.role === "hero") {
    return requirement.view ? manifest?.heroByView?.[requirement.view]?.[index] : undefined;
  }
  if (requirement.role === "composition") {
    return requirement.view ? manifest?.familyByView?.[requirement.view]?.[index] : undefined;
  }
  return undefined;
}

export function resolveMascotReferenceRequirementStatuses(
  speciesId?: MascotSpeciesId | string
): MascotReferenceAssetRequirementStatus[] {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const manifest = resolveMascotReferenceBankManifest(normalizedSpecies);
  const rawManifest = readRawMascotReferenceBankManifest(normalizedSpecies);
  const manifestPath = resolveMascotReferenceBankManifestPath(normalizedSpecies);
  const manifestDir = path.dirname(manifestPath);

  return (manifest?.requiredAssets ?? []).map((requirement) => {
    const entry = resolveRequirementEntry(rawManifest, requirement);
    const resolvedPath =
      entry?.path && entry.path.trim().length > 0 ? path.resolve(manifestDir, entry.path.trim()) : undefined;
    const satisfied = Boolean(resolvedPath && fs.existsSync(resolvedPath));
    return {
      ...requirement,
      satisfied,
      ...(resolvedPath ? { resolvedPath } : {})
    };
  });
}

export function resolveMascotReferenceBankDiagnostics(
  speciesId?: MascotSpeciesId | string
): MascotReferenceBankDiagnostics {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const manifest = resolveMascotReferenceBankManifest(normalizedSpecies);
  const requirementStatuses = resolveMascotReferenceRequirementStatuses(normalizedSpecies);
  const manifestPath = resolveMascotReferenceBankManifestPath(normalizedSpecies);
  const styleCount = Array.isArray(manifest?.style) ? manifest.style.length : 0;
  const heroCount = Object.values(manifest?.heroByView ?? {}).reduce(
    (sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0),
    0
  );
  const missingRoles: CharacterReferenceRole[] = [];
  if (styleCount === 0) {
    missingRoles.push("style");
  }
  if (heroCount === 0) {
    missingRoles.push("hero");
  }
  const requiredAssetSlots = (manifest?.requiredAssets ?? []).map((entry) => entry.slotId);
  const unsatisfiedRequiredAssetSlots = requirementStatuses.filter((entry) => !entry.satisfied).map((entry) => entry.slotId);
  const declaredStatus = manifest?.bankStatus ?? (styleCount > 0 ? "species_ready" : "scaffold_only");
  const status = resolveEffectiveMascotReferenceBankStatus({
    declaredStatus,
    styleCount,
    unsatisfiedRequiredAssetCount: unsatisfiedRequiredAssetSlots.length
  });
  const frontApproved = Boolean(manifest?.frontApproval?.approvedAt) || status === "species_ready";
  const canonStage =
    manifest?.canonStage ??
    (status === "species_ready"
      ? "species_ready"
      : frontApproved
        ? "front_approved"
        : styleCount > 0 && heroCount > 0
          ? "hero_seeded"
          : styleCount > 0
            ? "front_master_seeded"
            : "scaffold");
  const qualityStatus = manifest?.qualityStatus ?? (status === "species_ready" ? "approved" : "unchecked");
  const productionLocked = !canUseMascotReferenceBankForProduction({
    variant: manifest?.variant === "candidate" ? "candidate" : "canonical",
    status,
    canonStage,
    qualityStatus
  });

  return {
    speciesId: normalizedSpecies,
    familyId: manifest?.familyId ?? resolveMascotSpeciesProfile(normalizedSpecies).familyId,
    status,
    declaredStatus,
    statusMismatch: declaredStatus !== status,
    variant: manifest?.variant === "candidate" ? "candidate" : "canonical",
    canonStage,
    qualityStatus,
    frontApproved,
    productionLocked,
    visualQcOverallScore: manifest?.visualQc?.overallScore,
    manifestPath,
    legacyTemporary: manifest?.legacyTemporary === true,
    styleCount,
    heroCount,
    requiredAssetCount: requiredAssetSlots.length,
    requiredAssetSlots,
    unsatisfiedRequiredAssetCount: unsatisfiedRequiredAssetSlots.length,
    unsatisfiedRequiredAssetSlots,
    missingRoles,
    notes: [...(manifest?.notes ?? [])],
    qualityNotes: [...(manifest?.qualityNotes ?? [])]
  };
}

export function buildMascotReferenceBankReviewPlan(
  diagnostics: MascotReferenceBankDiagnostics
): MascotReferenceBankReviewPlan {
  if (diagnostics.status === "species_ready") {
    return {
      reviewOnly: false,
      requiredManualSlots: [],
      reviewNotes: []
    };
  }

  const requiredManualSlots = new Set<string>([
    "head_front_neutral",
    "head_threeQuarter_neutral",
    "head_profile_neutral"
  ]);
  const reviewNotes = [
    diagnostics.statusMismatch
      ? `reference bank declared ${diagnostics.declaredStatus} but remains scaffold_only until required assets are satisfied`
      : `reference bank is scaffold_only for species=${diagnostics.speciesId}`,
    "keep accepted pack review-only until species-specific style and hero refs are supplied"
  ];
  if (diagnostics.qualityStatus === "review_needed") {
    reviewNotes.push("reference bank still requires visual QA before canon promotion");
  }
  if (!diagnostics.frontApproved && diagnostics.canonStage !== "scaffold") {
    reviewNotes.push("front master has not been explicitly approved yet; keep bank in discovery mode");
  }
  if (diagnostics.canonStage !== "review_ready" && diagnostics.canonStage !== "species_ready") {
    reviewNotes.push(`candidate bank canon stage is still ${diagnostics.canonStage}`);
  }
  if (diagnostics.canonStage === "front_master_seeded" || diagnostics.canonStage === "hero_seeded") {
    reviewNotes.push("approve the front master first; do not derive or trust side views before front identity is locked");
  }
  if (diagnostics.canonStage === "family_views_seeded") {
    reviewNotes.push("side views are only partially seeded; verify cross-view silhouette before promotion");
  }
  if (diagnostics.unsatisfiedRequiredAssetSlots.length > 0) {
    reviewNotes.push(`required asset intake still open: ${diagnostics.unsatisfiedRequiredAssetSlots.join(", ")}`);
  }

  if (diagnostics.missingRoles.includes("style")) {
    requiredManualSlots.add("torso_front_neutral");
    requiredManualSlots.add("torso_threeQuarter_neutral");
    requiredManualSlots.add("torso_profile_neutral");
    reviewNotes.push("style role is missing; manually review silhouette, body proportion, and cross-view family style");
  }

  if (diagnostics.missingRoles.includes("hero")) {
    requiredManualSlots.add("eye_open");
    requiredManualSlots.add("eye_closed");
    requiredManualSlots.add("mouth_closed");
    requiredManualSlots.add("mouth_open_small");
    requiredManualSlots.add("mouth_open_wide");
    requiredManualSlots.add("mouth_round_o");
    reviewNotes.push("hero role is missing; manually review face identity, expression stability, and viseme mouth shapes");
  }

  if (diagnostics.variant === "candidate") {
    reviewNotes.push("candidate reference bank is active; promote only after species identity and cross-view quality pass.");
  }
  if (diagnostics.productionLocked) {
    reviewNotes.push("production reference resolution is locked to canonical assets until the candidate bank reaches species_ready and approved quality.");
  }

  reviewNotes.push(...diagnostics.qualityNotes);

  if (diagnostics.legacyTemporary) {
    reviewNotes.push("active reference bank is marked legacy-temporary; replace with a new canon before rollout.");
  }

  return {
    reviewOnly: true,
    requiredManualSlots: [...requiredManualSlots],
    reviewNotes
  };
}

function buildResolvedMascotReferenceAsset(
  speciesId: MascotSpeciesId,
  entry: MascotReferenceAssetEntry | undefined,
  manifest: MascotReferenceBankManifest | null,
  manifestPath: string
): ResolvedMascotReferenceAsset | null {
  if (!entry?.path) {
    return null;
  }

  const resolvedPath = path.resolve(path.dirname(manifestPath), entry.path);
  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  return {
    filePath: resolvedPath,
    note: entry.note,
    weight: entry.weight,
    speciesId,
    bankStatus: manifest?.bankStatus ?? "scaffold_only"
  };
}

export function resolveMascotStyleReferenceAsset(
  speciesId?: MascotSpeciesId | string,
  index = 0
): ResolvedMascotReferenceAsset | null {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const diagnostics = resolveMascotReferenceBankDiagnostics(normalizedSpecies);
  const useCanonical = diagnostics.productionLocked;
  const manifest = useCanonical
    ? resolveCanonicalMascotReferenceBankManifest(normalizedSpecies)
    : resolveMascotReferenceBankManifest(normalizedSpecies);
  const manifestPath = useCanonical
    ? resolveCanonicalMascotReferenceBankManifestPath(normalizedSpecies)
    : resolveMascotReferenceBankManifestPath(normalizedSpecies);
  return buildResolvedMascotReferenceAsset(normalizedSpecies, manifest?.style?.[index], manifest, manifestPath);
}

export function resolveMascotCompositionReferenceAsset(
  speciesId: MascotSpeciesId | string | undefined,
  view: CharacterView,
  index = 0
): ResolvedMascotReferenceAsset | null {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const diagnostics = resolveMascotReferenceBankDiagnostics(normalizedSpecies);
  const useCanonical = diagnostics.productionLocked;
  const manifest = useCanonical
    ? resolveCanonicalMascotReferenceBankManifest(normalizedSpecies)
    : resolveMascotReferenceBankManifest(normalizedSpecies);
  const manifestPath = useCanonical
    ? resolveCanonicalMascotReferenceBankManifestPath(normalizedSpecies)
    : resolveMascotReferenceBankManifestPath(normalizedSpecies);
  const entry = manifest?.familyByView?.[view]?.[index] ?? manifest?.starterByView?.[view]?.[index];
  return buildResolvedMascotReferenceAsset(normalizedSpecies, entry, manifest, manifestPath);
}
