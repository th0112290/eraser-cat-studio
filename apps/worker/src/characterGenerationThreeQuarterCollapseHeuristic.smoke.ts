import assert from "node:assert/strict";
import { deriveRetryAdjustmentForCandidate, isThreeQuarterFrontCollapseRisk } from "./characterGeneration";

assert.equal(
  isThreeQuarterFrontCollapseRisk({
    rawSymmetryScore: 0.95,
    frontSymmetryScore: 0.9,
    headSquarenessScore: 0.4367,
    pawSymmetryScore: 0.26
  }),
  false,
  "turned three-quarter candidates should not be rejected on raw symmetry alone"
);

assert.equal(
  isThreeQuarterFrontCollapseRisk({
    rawSymmetryScore: 0.952,
    frontSymmetryScore: 0.945,
    headSquarenessScore: 0.58,
    pawSymmetryScore: 0.49
  }),
  true,
  "front-like three-quarter candidates should still trip collapse rejection"
);

assert.equal(
  isThreeQuarterFrontCollapseRisk({
    rawSymmetryScore: 0.978,
    frontSymmetryScore: 0.88,
    headSquarenessScore: 0.42,
    pawSymmetryScore: 0.22
  }),
  true,
  "extreme raw symmetry should remain a hard reject"
);

const catThreeQuarterRetryAdjustment = deriveRetryAdjustmentForCandidate({
  stage: "lock",
  view: "threeQuarter",
  speciesId: "cat",
  candidate: {
    candidate: {
      id: "cat-threequarter-collapse",
      view: "threeQuarter"
    },
    analysis: {},
    score: 0.6897,
    styleScore: 0.7478,
    referenceSimilarity: null,
    consistencyScore: 0.52,
    warnings: ["head_shape_not_square_enough", "consistency_shape_drift", "consistency_style_drift"],
    rejections: ["threequarter_front_collapse", "inconsistent_with_front_baseline"],
    breakdown: {}
  } as any
});

assert.ok(
  catThreeQuarterRetryAdjustment.notes.includes("reinforced cat three-quarter yaw silhouette"),
  "cat three-quarter collapse retry should add a species-specific side-turn rescue note"
);
assert.ok(
  catThreeQuarterRetryAdjustment.extraNegativeTokens.includes("front-facing cat chest") &&
    catThreeQuarterRetryAdjustment.extraNegativeTokens.includes("same-size cat ears") &&
    catThreeQuarterRetryAdjustment.extraNegativeTokens.includes("centered cat muzzle"),
  "cat three-quarter collapse retry should suppress front-facing chest and ear flattening"
);
assert.ok(
  catThreeQuarterRetryAdjustment.viewPromptHints.some((hint) =>
    hint.includes("near ear larger than the far ear") && hint.includes("front-facing cat chest or centered muzzle")
  ),
  "cat three-quarter collapse retry should reinforce ear size asymmetry and off-center muzzle placement"
);

const liveLikeAnglesInitialRetryAdjustment = deriveRetryAdjustmentForCandidate({
  stage: "angles",
  view: "threeQuarter",
  speciesId: "cat",
  candidate: {
    candidate: {
      id: "cat-threequarter-live-angles-initial",
      view: "threeQuarter"
    },
    analysis: {},
    score: 0.7438,
    styleScore: 0.7531,
    referenceSimilarity: null,
    consistencyScore: 0.5,
    warnings: [
      "text_or_watermark_suspected",
      "text_or_watermark_high_risk",
      "head_shape_not_square_enough",
      "consistency_shape_drift"
    ],
    rejections: ["threequarter_front_collapse", "inconsistent_with_front_baseline"],
    breakdown: {
      frontSymmetryScore: 0.9,
      headSquarenessScore: 0.2745,
      speciesScore: 0.5113,
      targetStyleScore: 0.7531,
      speciesEarScore: 0,
      speciesMuzzleScore: 0.2854,
      speciesHeadShapeScore: 0,
      speciesSilhouetteScore: 0.4192
    }
  } as any
});

assert.ok(
  liveLikeAnglesInitialRetryAdjustment.notes.includes("reinforced side-view turn") &&
    liveLikeAnglesInitialRetryAdjustment.notes.includes("reinforced three-quarter torso yaw"),
  "live cat angles.initial collapse should keep routing into side-turn retry guidance"
);
assert.ok(
  liveLikeAnglesInitialRetryAdjustment.extraNegativeTokens.includes("same-size cat ears") &&
    liveLikeAnglesInitialRetryAdjustment.extraNegativeTokens.includes("centered cat muzzle"),
  "live cat angles.initial collapse should suppress frontal feline cues on retry"
);

console.log("[characterGenerationThreeQuarterCollapseHeuristic.smoke] PASS");
process.exit(0);
