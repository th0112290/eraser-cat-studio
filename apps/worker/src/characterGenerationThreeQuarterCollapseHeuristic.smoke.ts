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
  catThreeQuarterRetryAdjustment.notes.includes("reinforced cat three-quarter ear and muzzle offset"),
  "cat three-quarter collapse retry should add a species-specific side-turn rescue note"
);
assert.ok(
  catThreeQuarterRetryAdjustment.extraNegativeTokens.includes("front-facing cat chest") &&
    catThreeQuarterRetryAdjustment.extraNegativeTokens.includes("level frontal cat ears"),
  "cat three-quarter collapse retry should suppress front-facing chest and ear flattening"
);
assert.ok(
  catThreeQuarterRetryAdjustment.viewPromptHints.some((hint) =>
    hint.includes("near ear visibly larger than the far ear") && hint.includes("short cat muzzle rotated off center")
  ),
  "cat three-quarter collapse retry should reinforce ear size asymmetry and off-center muzzle placement"
);

console.log("[characterGenerationThreeQuarterCollapseHeuristic.smoke] PASS");
process.exit(0);
