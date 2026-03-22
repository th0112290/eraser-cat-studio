import assert from "node:assert/strict";
import {
  buildInitialAngleReferenceBiasAdjustment,
  buildPreferredSideReferenceInputByView,
  deriveRetryAdjustmentForCandidate,
  rebalanceReferenceBankForRetry,
  resolveAdaptiveReferenceWeight,
  resolveStageInputMinimumReferenceWeights,
  selectRetryInlineReferenceInput,
  shouldSuppressDuplicateViewStarterReference
} from "./characterGeneration";

const preferredSideReferences = buildPreferredSideReferenceInputByView({
  views: ["front", "threeQuarter", "profile"],
  speciesId: "dog",
  familyReferencesByView: {
    threeQuarter: { referenceImageBase64: "family-3q", referenceMimeType: "image/png" } as any
  },
  starterReferenceByView: {
    threeQuarter: { referenceImageBase64: "starter-3q", referenceMimeType: "image/png" } as any,
    profile: { referenceImageBase64: "starter-p", referenceMimeType: "image/png" } as any
  }
});

assert.equal(preferredSideReferences.front, undefined);
assert.equal(
  preferredSideReferences.threeQuarter,
  undefined,
  "dog side-view generation should fall back to the front anchor instead of trusting canonical side refs"
);
assert.equal(
  preferredSideReferences.profile,
  undefined,
  "dog profile generation should fall back to the front anchor instead of trusting canonical side refs"
);

const catPreferredSideReferences = buildPreferredSideReferenceInputByView({
  views: ["threeQuarter", "profile"],
  speciesId: "cat",
  familyReferencesByView: {
    threeQuarter: { referenceImageBase64: "family-3q", referenceMimeType: "image/png" } as any
  },
  starterReferenceByView: {
    threeQuarter: { referenceImageBase64: "family-3q", referenceMimeType: "image/png" } as any,
    profile: { referenceImageBase64: "starter-p", referenceMimeType: "image/png" } as any
  }
});

assert.equal(
  catPreferredSideReferences.threeQuarter?.referenceImageBase64,
  "family-3q",
  "cat three-quarter initial side reference should prefer composition over starter"
);
assert.equal(catPreferredSideReferences.profile?.referenceImageBase64, "starter-p");
const dogThreeQuarterInitialBias = buildInitialAngleReferenceBiasAdjustment({
  view: "threeQuarter",
  speciesId: "dog",
  hasApprovedFrontAnchor: true
});
assert.ok(dogThreeQuarterInitialBias);
assert.equal(dogThreeQuarterInitialBias?.enforceSideTurnBalance, true);
assert.ok((dogThreeQuarterInitialBias?.referenceWeightDeltas.front_master ?? 0) > 0);
assert.match(
  dogThreeQuarterInitialBias?.viewPromptHints.join(" ") ?? "",
  /strict dog three-quarter turn/i
);
assert.equal(
  shouldSuppressDuplicateViewStarterReference({
    stage: "angles",
    view: "threeQuarter",
    speciesId: "cat",
    starterReference: { referenceImageBase64: "family-3q", referenceMimeType: "image/png" } as any,
    familyReference: { referenceImageBase64: "family-3q", referenceMimeType: "image/png" } as any
  }),
  true,
  "cat three-quarter angles should suppress duplicate starter references when composition matches starter"
);
assert.equal(
  shouldSuppressDuplicateViewStarterReference({
    stage: "angles",
    view: "threeQuarter",
    speciesId: "dog",
    starterReference: { referenceImageBase64: "family-3q", referenceMimeType: "image/png" } as any,
    familyReference: { referenceImageBase64: "family-3q", referenceMimeType: "image/png" } as any
  }),
  false
);

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

const catInitialAngleBias = buildInitialAngleReferenceBiasAdjustment({
  view: "threeQuarter",
  speciesId: "cat",
  hasApprovedFrontAnchor: true
});
assert.equal(catInitialAngleBias?.enforceSideTurnBalance, true);
assert.ok((catInitialAngleBias?.referenceWeightDeltas.composition ?? 0) >= 0.16);
assert.ok((catInitialAngleBias?.referenceWeightDeltas.view_starter ?? 0) >= 0.12);
assert.ok((catInitialAngleBias?.referenceWeightDeltas.front_master ?? 0) <= -0.16);
assert.ok(
  catInitialAngleBias?.viewPromptHints.some((hint) => hint.includes("strict cat three-quarter turn around 35 to 45 degrees")),
  "cat initial angle bias should reinforce a real three-quarter turn before retries"
);

const dogInitialAngleBias = buildInitialAngleReferenceBiasAdjustment({
  view: "threeQuarter",
  speciesId: "dog",
  hasApprovedFrontAnchor: true
});
assert.ok(dogInitialAngleBias);
assert.equal(dogInitialAngleBias?.enforceSideTurnBalance, true);
assert.ok((dogInitialAngleBias?.referenceWeightDeltas.front_master ?? 0) > 0);
assert.ok(
  dogInitialAngleBias?.viewPromptHints.some((hint) => hint.includes("strict dog three-quarter turn around 35 to 45 degrees")),
  "dog initial angle bias should reinforce a true dog three-quarter turn before retries"
);

const retryAdjustment = deriveRetryAdjustmentForCandidate({
  stage: "angles",
  view: "threeQuarter",
  speciesId: "dog",
  candidate: {
    candidate: {
      id: "threequarter-angle-weight-stub",
      view: "threeQuarter"
    },
    analysis: {},
    score: 0.64,
    styleScore: 0.62,
    referenceSimilarity: null,
    consistencyScore: 0.48,
    warnings: ["consistency_shape_drift"],
    rejections: ["threequarter_front_collapse", "inconsistent_with_front_baseline"],
    breakdown: {
      speciesEarScore: 0.52,
      speciesMuzzleScore: 0.58,
      speciesHeadShapeScore: 0.56,
      speciesSilhouetteScore: 0.6,
      speciesScore: 0.61,
      targetStyleScore: 0.74,
      frontSymmetryScore: 0.72,
      headSquarenessScore: 0.48
    }
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

const catRetryReference = selectRetryInlineReferenceInput({
  view: "threeQuarter",
  speciesId: "cat",
  enforceSideTurnBalance: true,
  viewReferenceBank: [{ role: "view_starter", imageBase64: "starter-cat" } as any],
  adjustedReferenceBank: [{ role: "composition", imageBase64: "composition-cat" } as any]
});
assert.equal(catRetryReference?.referenceImageBase64, "composition-cat");

const dogRetryReference = selectRetryInlineReferenceInput({
  view: "threeQuarter",
  speciesId: "dog",
  enforceSideTurnBalance: true,
  viewReferenceBank: [{ role: "view_starter", imageBase64: "starter-dog" } as any],
  adjustedReferenceBank: [{ role: "composition", imageBase64: "composition-dog" } as any]
});
assert.equal(dogRetryReference?.referenceImageBase64, "starter-dog");

console.log("[characterGenerationAngleReferenceWeight.smoke] PASS");
process.exit(0);
