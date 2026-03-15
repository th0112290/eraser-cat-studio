import assert from "node:assert/strict";
import {
  buildPreferredSideReferenceInputByView,
  deriveRetryAdjustmentForCandidate,
  rebalanceReferenceBankForRetry,
  resolveAdaptiveReferenceWeight,
  resolveStageInputMinimumReferenceWeights
} from "./characterGeneration";

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

const threeQuarterFrontWeight = resolveAdaptiveReferenceWeight({
  stage: "angles",
  role: "front_master",
  targetView: "threeQuarter",
  hasStarter: true
});
const threeQuarterCompositionWeight = resolveAdaptiveReferenceWeight({
  stage: "angles",
  role: "composition",
  targetView: "threeQuarter",
  hasStarter: true
});
const threeQuarterStarterWeight = resolveAdaptiveReferenceWeight({
  stage: "angles",
  role: "view_starter",
  targetView: "threeQuarter",
  hasStarter: true
});

assert.equal(threeQuarterFrontWeight, 0.54);
assert.equal(threeQuarterCompositionWeight, 0.82);
assert.equal(threeQuarterStarterWeight, 0.6);
assert.ok(threeQuarterCompositionWeight > threeQuarterFrontWeight);
assert.ok(threeQuarterStarterWeight > threeQuarterFrontWeight);

const profileFrontWeight = resolveAdaptiveReferenceWeight({
  stage: "angles",
  role: "front_master",
  targetView: "profile",
  hasStarter: true
});
const profileCompositionWeight = resolveAdaptiveReferenceWeight({
  stage: "angles",
  role: "composition",
  targetView: "profile",
  hasStarter: true
});
const profileStarterWeight = resolveAdaptiveReferenceWeight({
  stage: "angles",
  role: "view_starter",
  targetView: "profile",
  hasStarter: true
});

assert.equal(profileFrontWeight, 0.5);
assert.equal(profileCompositionWeight, 0.86);
assert.equal(profileStarterWeight, 0.62);
assert.ok(profileCompositionWeight > profileFrontWeight);
assert.ok(profileStarterWeight > profileFrontWeight);

const angleMinimumsThreeQuarter = resolveStageInputMinimumReferenceWeights("angles", "threeQuarter");
assert.equal(angleMinimumsThreeQuarter.front_master, 0.54);
assert.equal(angleMinimumsThreeQuarter.composition, 0.48);
assert.equal(angleMinimumsThreeQuarter.view_starter, 0.42);

const angleMinimumsProfile = resolveStageInputMinimumReferenceWeights("angles", "profile");
assert.equal(angleMinimumsProfile.front_master, 0.48);
assert.equal(angleMinimumsProfile.composition, 0.48);
assert.equal(angleMinimumsProfile.view_starter, 0.42);

const retryAdjustment = deriveRetryAdjustmentForCandidate({
  stage: "angles",
  view: "threeQuarter",
  speciesId: "dog",
  candidate: {
    warnings: ["consistency_shape_drift"],
    rejections: ["threequarter_front_collapse", "inconsistent_with_front_baseline"]
  } as any
});

assert.equal(retryAdjustment.enforceSideTurnBalance, true);
assert.ok((retryAdjustment.referenceWeightDeltas.composition ?? 0) >= 0.2);
assert.ok((retryAdjustment.referenceWeightDeltas.view_starter ?? 0) >= 0.12);
assert.ok((retryAdjustment.referenceWeightDeltas.front_master ?? 0) <= -0.08);
assert.ok(
  retryAdjustment.viewPromptHints.some((hint) => hint.includes("torso and hips must rotate with the head")),
  "three-quarter collapse retry should reinforce torso yaw"
);

const rebalanced = rebalanceReferenceBankForRetry({
  entries: [
    { role: "front_master", weight: 0.9 } as any,
    { role: "composition", weight: 0.5 } as any,
    { role: "view_starter", weight: 0.4 } as any
  ],
  stage: "angles",
  view: "threeQuarter",
  adjustment: retryAdjustment
});

assert.equal(rebalanced?.find((entry) => entry.role === "front_master")?.weight, 0.6);
assert.equal(rebalanced?.find((entry) => entry.role === "composition")?.weight, 0.82);
assert.equal(rebalanced?.find((entry) => entry.role === "view_starter")?.weight, 0.66);

console.log("[characterGenerationAngleReferenceWeight.smoke] PASS");
process.exit(0);
