import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveMascotReferenceBankDiagnostics,
  resolveMascotReferenceBankManifest,
  resolveMascotReferenceRequirementStatuses
} from "./mascotReferenceBank";
import type { MascotReferenceAssetEntry, MascotReferenceBankManifest, MascotSpeciesId } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

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

function parseSpeciesSelection(): MascotSpeciesId[] {
  const source = getArgValues("species").join(",") || "dog,wolf";
  return [
    ...new Set(
      source
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry): entry is MascotSpeciesId => entry === "cat" || entry === "dog" || entry === "wolf")
    )
  ];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function withCandidateEnv<T>(speciesId: MascotSpeciesId, run: () => T): T {
  const previous = process.env.MASCOT_REFERENCE_BANK_CANDIDATES;
  process.env.MASCOT_REFERENCE_BANK_CANDIDATES = speciesId;
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.MASCOT_REFERENCE_BANK_CANDIDATES;
    } else {
      process.env.MASCOT_REFERENCE_BANK_CANDIDATES = previous;
    }
  }
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function collectManifestAssetPaths(manifest: MascotReferenceBankManifest): string[] {
  const paths = new Set<string>();
  const pushEntry = (entry: MascotReferenceAssetEntry | undefined) => {
    if (entry?.path && entry.path.trim().length > 0) {
      paths.add(entry.path.trim());
    }
  };

  for (const entry of manifest.style ?? []) {
    pushEntry(entry);
  }
  for (const entries of Object.values(manifest.starterByView ?? {})) {
    for (const entry of entries ?? []) {
      pushEntry(entry);
    }
  }
  for (const entries of Object.values(manifest.familyByView ?? {})) {
    for (const entry of entries ?? []) {
      pushEntry(entry);
    }
  }
  for (const entries of Object.values(manifest.heroByView ?? {})) {
    for (const entry of entries ?? []) {
      pushEntry(entry);
    }
  }

  return [...paths];
}

function copyReferencedAssets(input: {
  manifest: MascotReferenceBankManifest;
  fromDir: string;
  toDir: string;
}): void {
  for (const relativeAssetPath of collectManifestAssetPaths(input.manifest)) {
    const sourcePath = path.resolve(input.fromDir, relativeAssetPath);
    const targetPath = path.resolve(input.toDir, relativeAssetPath);
    ensureDir(path.dirname(targetPath));
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function buildPromotedCanonicalManifest(candidateManifest: MascotReferenceBankManifest): MascotReferenceBankManifest {
  const now = new Date().toISOString();
  const speciesId = candidateManifest.speciesId ?? "unknown";
  return {
    ...candidateManifest,
    extends: "../shared/bank.json",
    variant: "canonical",
    bankStatus: "species_ready",
    canonStage: "species_ready",
    qualityStatus: "approved",
    legacyTemporary: false,
    notes: [
      ...(candidateManifest.notes ?? []),
      `${speciesId} candidate promoted to canonical on ${now.slice(0, 10)}`
    ],
    qualityNotes: [
      ...(candidateManifest.qualityNotes ?? []),
      "canonical promotion completed from approved candidate bank"
    ]
  };
}

async function run(): Promise<void> {
  const speciesList = parseSpeciesSelection();
  if (speciesList.length === 0) {
    throw new Error("No valid species selected. Use --species dog or --species wolf.");
  }

  const checkOnly = hasFlag("check-only");
  const force = hasFlag("force");
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const summary: Array<Record<string, unknown>> = [];

  for (const speciesId of speciesList) {
    const candidateDir = path.join(REPO_ROOT, "refs", "mascots", speciesId, "candidate");
    const canonicalDir = path.join(REPO_ROOT, "refs", "mascots", speciesId);
    const candidateManifestPath = path.join(candidateDir, "bank.json");
    const canonicalManifestPath = path.join(canonicalDir, "bank.json");

    if (!fs.existsSync(candidateManifestPath)) {
      throw new Error(`Missing candidate bank for ${speciesId}: ${candidateManifestPath}`);
    }

    const diagnostics = withCandidateEnv(speciesId, () => resolveMascotReferenceBankDiagnostics(speciesId));
    const requirementStatuses = withCandidateEnv(speciesId, () => resolveMascotReferenceRequirementStatuses(speciesId));
    const candidateManifest = withCandidateEnv(speciesId, () => resolveMascotReferenceBankManifest(speciesId));
    if (!candidateManifest) {
      throw new Error(`Unable to read candidate manifest for ${speciesId}: ${candidateManifestPath}`);
    }

    const ready =
      diagnostics.variant === "candidate" &&
      diagnostics.status === "species_ready" &&
      diagnostics.canonStage === "species_ready" &&
      diagnostics.qualityStatus === "approved" &&
      diagnostics.frontApproved &&
      requirementStatuses.every((entry) => entry.satisfied);

    const failedChecks = [
      diagnostics.variant !== "candidate" ? "candidate_variant_missing" : null,
      diagnostics.status !== "species_ready" ? `status:${diagnostics.status}` : null,
      diagnostics.canonStage !== "species_ready" ? `canonStage:${diagnostics.canonStage}` : null,
      diagnostics.qualityStatus !== "approved" ? `qualityStatus:${diagnostics.qualityStatus}` : null,
      !diagnostics.frontApproved ? "front_not_approved" : null,
      ...requirementStatuses.filter((entry) => !entry.satisfied).map((entry) => `missing:${entry.slotId}`)
    ].filter((entry): entry is string => Boolean(entry));

    if (!checkOnly && !ready && !force) {
      throw new Error(
        `Candidate bank for ${speciesId} is not ready for canonical promotion: ${failedChecks.join(", ")}`
      );
    }

    if (!checkOnly) {
      const backupDir = path.join(REPO_ROOT, "out", "mascot_reference_promotions", speciesId, runStamp, "canonical_backup");
      ensureDir(backupDir);
      if (fs.existsSync(canonicalManifestPath)) {
        const existingCanonical = resolveMascotReferenceBankManifest(speciesId);
        if (existingCanonical) {
          copyReferencedAssets({
            manifest: existingCanonical,
            fromDir: canonicalDir,
            toDir: backupDir
          });
        }
        fs.copyFileSync(canonicalManifestPath, path.join(backupDir, "bank.json"));
      }

      copyReferencedAssets({
        manifest: candidateManifest,
        fromDir: candidateDir,
        toDir: canonicalDir
      });
      const promotedManifest = buildPromotedCanonicalManifest(candidateManifest);
      fs.writeFileSync(canonicalManifestPath, `${JSON.stringify(promotedManifest, null, 2)}\n`, "utf8");
    }

    summary.push({
      speciesId,
      checkOnly,
      ready,
      forced: !ready && force,
      candidateManifestPath,
      canonicalManifestPath,
      failedChecks
    });
  }

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

await run();
