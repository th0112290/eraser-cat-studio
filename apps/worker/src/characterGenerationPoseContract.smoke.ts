import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolveMascotSpeciesProfile } from "@ec/image-gen";
import {
  buildPreferredSideReferenceInputByView,
  defaultStructureControlStrength,
  deriveRetryAdjustmentForCandidate,
  loadStagePoseGuides,
  rebalanceReferenceBankForRetry,
  stageRequiresPoseGuide
} from "./characterGeneration";

function makeCandidate(reasons: string[]): any {
  return {
    candidate: {
      id: "stub",
      view: "threeQuarter"
    },
    analysis: {},
    score: 0.64,
    styleScore: 0.62,
    referenceSimilarity: null,
    consistencyScore: 0.48,
    warnings: reasons,
    rejections: [],
    breakdown: {}
  };
}

assert.equal(stageRequiresPoseGuide("angles"), true);
assert.equal(stageRequiresPoseGuide("view_only"), true);
assert.equal(stageRequiresPoseGuide("refine"), true);
assert.equal(stageRequiresPoseGuide("lock"), true);
assert.equal(stageRequiresPoseGuide("repair"), false);
assert.equal(stageRequiresPoseGuide("front"), false);

const sideStageAdjustment = deriveRetryAdjustmentForCandidate({
  stage: "angles",
  view: "threeQuarter",
  candidate: makeCandidate(["missing arm"]),
  speciesId: "dog"
});

assert.equal(sideStageAdjustment.disablePose, false);
assert.ok(!sideStageAdjustment.notes.includes("disabled pose guide for paw recovery"));
assert.ok(sideStageAdjustment.extraNegativeTokens.includes("missing arm"));

const repairStageAdjustment = deriveRetryAdjustmentForCandidate({
  stage: "repair",
  view: "threeQuarter",
  candidate: makeCandidate(["missing arm"]),
  speciesId: "dog"
});

assert.equal(repairStageAdjustment.disablePose, true);
assert.ok(repairStageAdjustment.notes.includes("disabled pose guide for paw recovery"));

const sideTurnAdjustment = deriveRetryAdjustmentForCandidate({
  stage: "angles",
  view: "threeQuarter",
  candidate: makeCandidate(["front_collapse_detected", "mascot_identity_too_weak", "palette_drift"]),
  speciesId: "dog"
});

assert.equal(sideTurnAdjustment.enforceSideTurnBalance, true);

const rebalanced = rebalanceReferenceBankForRetry({
  stage: "angles",
  view: "threeQuarter",
  adjustment: sideTurnAdjustment,
  entries: [
    { id: "front", role: "front_master", view: "front", weight: 0.83 } as any,
    { id: "style", role: "style", view: "front", weight: 0.31 } as any,
    { id: "comp", role: "composition", view: "threeQuarter", weight: 0.67 } as any
  ]
});

assert.equal(rebalanced?.find((entry) => entry.role === "front_master")?.weight, 0.6);
assert.equal(rebalanced?.find((entry) => entry.role === "style")?.weight, 0.16);
assert.equal(rebalanced?.find((entry) => entry.role === "composition")?.weight, 0.82);
assert.equal(defaultStructureControlStrength("lineart"), 0.44);
assert.equal(defaultStructureControlStrength("canny"), 0.36);
assert.equal(defaultStructureControlStrength("depth"), 0.28);
assert.equal(resolveMascotSpeciesProfile("dog").qcThresholds.frontMasterMinSpeciesScore, 0.34);
assert.equal(resolveMascotSpeciesProfile("dog").qcThresholds.minFrontSymmetryScore, 0.52);
assert.equal(resolveMascotSpeciesProfile("wolf").qcThresholds.frontMasterMinSpeciesScore, 0.28);
assert.equal(resolveMascotSpeciesProfile("wolf").qcThresholds.minGeometryCueByView.threeQuarter, 0.42);

const repoRoot = path.resolve(process.cwd(), "..", "..");
const dogPoseGuides = loadStagePoseGuides({
  speciesId: "dog",
  views: ["threeQuarter", "profile"]
});

assert.equal(
  dogPoseGuides.threeQuarter?.referenceImageBase64,
  fs.readFileSync(path.join(repoRoot, "refs", "mascots", "dog", "family_threeQuarter_primary.png")).toString("base64")
);
assert.equal(
  dogPoseGuides.profile?.referenceImageBase64,
  fs.readFileSync(path.join(repoRoot, "refs", "mascots", "dog", "family_profile_primary.png")).toString("base64")
);

const fallbackPoseGuides = loadStagePoseGuides({
  speciesId: "unknown",
  views: ["threeQuarter"]
});

assert.equal(
  fallbackPoseGuides.threeQuarter?.referenceImageBase64,
  fs.readFileSync(path.join(repoRoot, "workflows", "comfy", "pose_guides", "threeQuarter.png")).toString("base64")
);

const preferredSideReferences = buildPreferredSideReferenceInputByView({
  views: ["front", "threeQuarter", "profile"],
  familyReferencesByView: {
    threeQuarter: { referenceImageBase64: "family-3q", referenceMimeType: "image/png" } as any
  },
  starterReferenceByView: {
    threeQuarter: { referenceImageBase64: "starter-3q", referenceMimeType: "image/png" } as any,
    profile: { referenceImageBase64: "starter-p", referenceMimeType: "image/png" } as any
  }
});

assert.equal(preferredSideReferences.front, undefined);
assert.equal(preferredSideReferences.threeQuarter?.referenceImageBase64, "starter-3q");
assert.equal(preferredSideReferences.profile?.referenceImageBase64, "starter-p");

console.log("[characterGenerationPoseContract.smoke] PASS");
process.exit(0);
