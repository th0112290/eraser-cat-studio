import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMascotReferenceBankReviewPlan,
  resolveMascotReferenceBankDiagnostics,
  resolveMascotReferenceRequirementStatuses
} from "./mascotReferenceBank";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const OUTPUT_DIR = path.join(REPO_ROOT, "out", "mascot_reference_readiness");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "report.json");

type SpeciesId = "cat" | "dog" | "wolf";

const SPECIES_IDS: SpeciesId[] = ["cat", "dog", "wolf"];

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main(): void {
  const generatedAt = new Date().toISOString();
  const species = SPECIES_IDS.map((speciesId) => {
    const diagnostics = resolveMascotReferenceBankDiagnostics(speciesId);
    const requirements = resolveMascotReferenceRequirementStatuses(speciesId);
    const reviewPlan = buildMascotReferenceBankReviewPlan(diagnostics);

    return {
      speciesId,
      familyId: diagnostics.familyId,
      variant: diagnostics.variant,
      canonStage: diagnostics.canonStage,
      qualityStatus: diagnostics.qualityStatus,
      manifestPath: diagnostics.manifestPath,
      legacyTemporary: diagnostics.legacyTemporary,
      declaredStatus: diagnostics.declaredStatus,
      effectiveStatus: diagnostics.status,
      statusMismatch: diagnostics.statusMismatch,
      missingRoles: diagnostics.missingRoles,
      qualityNotes: diagnostics.qualityNotes,
      requiredAssetSlots: diagnostics.requiredAssetSlots,
      unsatisfiedRequiredAssetSlots: diagnostics.unsatisfiedRequiredAssetSlots,
      reviewOnly: reviewPlan.reviewOnly,
      requiredManualSlots: reviewPlan.requiredManualSlots,
      reviewNotes: reviewPlan.reviewNotes,
      requirements: requirements.map((entry) => ({
        slotId: entry.slotId,
        role: entry.role,
        view: entry.view ?? null,
        satisfied: entry.satisfied,
        description: entry.description,
        resolvedPath: entry.resolvedPath ?? null
      }))
    };
  });

  const report = {
    schemaVersion: "1.0",
    generatedAt,
    species
  };

  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  for (const entry of species) {
    const unsatisfiedSummary =
      entry.unsatisfiedRequiredAssetSlots.length > 0 ? entry.unsatisfiedRequiredAssetSlots.join(", ") : "none";
    console.log(
      `[mascot-reference-readiness] species=${entry.speciesId} family=${entry.familyId} variant=${entry.variant} canonStage=${entry.canonStage} quality=${entry.qualityStatus} declared=${entry.declaredStatus} effective=${entry.effectiveStatus} reviewOnly=${entry.reviewOnly} legacyTemporary=${entry.legacyTemporary} unsatisfied=${unsatisfiedSummary}`
    );
  }
  console.log(`[mascot-reference-readiness] report=${OUTPUT_PATH}`);
}

main();
