import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateMascotFrontCanon } from "./mascotReferenceCanonQc";
import type { MascotReferenceBankManifest, MascotSpeciesId } from "./types";

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
  return [...new Set(
    source
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry): entry is MascotSpeciesId => entry === "cat" || entry === "dog" || entry === "wolf")
  )];
}

function parseBooleanFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function mergeUnique(existing: string[] | undefined, next: string[]): string[] {
  return [...new Set([...(existing ?? []), ...next])];
}

async function run(): Promise<void> {
  const speciesList = parseSpeciesSelection();
  if (speciesList.length === 0) {
    throw new Error("No valid species selected. Use --species dog or --species wolf.");
  }
  const force = parseBooleanFlag("force");
  const checkOnly = parseBooleanFlag("check-only");
  const summary: Array<Record<string, unknown>> = [];

  for (const speciesId of speciesList) {
    const candidateDir = path.join(REPO_ROOT, "refs", "mascots", speciesId, "candidate");
    const manifestPath = path.join(candidateDir, "bank.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Missing candidate bank manifest for ${speciesId}: ${manifestPath}`);
    }
    const frontPath = path.join(candidateDir, "style_front_primary.png");
    const familyFrontPath = path.join(candidateDir, "family_front_primary.png");
    const heroPath = path.join(candidateDir, "hero_front_primary.png");
    for (const requiredPath of [frontPath, familyFrontPath, heroPath]) {
      if (!fs.existsSync(requiredPath)) {
        throw new Error(`Missing front-discovery asset for ${speciesId}: ${requiredPath}`);
      }
    }

    const visualQc = await evaluateMascotFrontCanon({
      speciesId,
      frontAssetPath: frontPath,
      familyFrontAssetPath: familyFrontPath,
      heroAssetPath: heroPath
    });
    if (!checkOnly && !visualQc.passed && !force) {
      throw new Error(
        `Front approval QC failed for ${speciesId} (score=${visualQc.overallScore}). Re-run front discovery or pass --force to approve manually.`
      );
    }

    if (!checkOnly) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MascotReferenceBankManifest;
      const now = new Date().toISOString();
      const nextManifest: MascotReferenceBankManifest = {
        ...manifest,
        canonStage: "front_approved",
        qualityStatus: visualQc.passed ? "approved" : "review_needed",
        frontApproval: {
          approvedAt: now,
          forced: !visualQc.passed && force ? true : undefined,
          visualQcPassed: visualQc.passed,
          visualQcOverallScore: visualQc.overallScore
        },
        visualQc,
        notes: mergeUnique(manifest.notes, [
          `${speciesId} front master approved on ${now.slice(0, 10)}${visualQc.passed ? "" : " (forced approval)"}`,
          "front approval unlocks family_views generation from the approved front master"
        ]),
        qualityNotes: mergeUnique(manifest.qualityNotes, [
          visualQc.passed
            ? `front visual canon QC passed with score ${visualQc.overallScore}`
            : `front visual canon QC stayed below threshold (${visualQc.overallScore}); approval was forced`
        ])
      };
      fs.writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
    }

    summary.push({
      speciesId,
      manifestPath,
      checkOnly,
      approvedAt: checkOnly ? null : new Date().toISOString(),
      forced: !visualQc.passed && force,
      overallScore: visualQc.overallScore,
      passed: visualQc.passed,
      failedChecks: visualQc.checks.filter((entry) => !entry.passed).map((entry) => entry.id)
    });
  }

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
}

await run();
