import assert from "node:assert/strict";
import { deriveRetryAdjustmentForCandidate } from "./characterGeneration";

const adjustment = deriveRetryAdjustmentForCandidate({
  stage: "lock",
  view: "threeQuarter",
  speciesId: "cat",
  candidate: {
    candidate: {
      id: "cat-threequarter-lock-stub",
      view: "threeQuarter"
    },
    analysis: {},
    score: 0.6897,
    styleScore: 0.7478,
    referenceSimilarity: null,
    consistencyScore: 0.31,
    warnings: ["consistency_shape_drift", "consistency_style_drift", "head_shape_not_square_enough"],
    rejections: ["threequarter_front_collapse", "inconsistent_with_front_baseline"],
    breakdown: {}
  } as any
});

assert.ok(
  adjustment.notes.includes("reinforced cat three-quarter yaw silhouette"),
  "cat three-quarter collapse retries should emit a dedicated yaw silhouette note"
);
assert.ok(
  adjustment.extraNegativeTokens.includes("front-facing cat chest") &&
    adjustment.extraNegativeTokens.includes("same-size cat ears") &&
    adjustment.extraNegativeTokens.includes("centered cat muzzle"),
  "cat three-quarter collapse retries should suppress front-facing chest and centered feline features"
);
assert.ok(
  adjustment.viewPromptHints.some((hint) => hint.includes("35 to 45 degrees")) &&
    adjustment.viewPromptHints.some((hint) => hint.includes("near ear visibly larger than the far ear")),
  "cat three-quarter collapse retries should strengthen turn angle and near/far ear asymmetry guidance"
);
assert.ok(
  (adjustment.referenceWeightDeltas.view_starter ?? 0) >= 0.12 &&
    (adjustment.referenceWeightDeltas.subject ?? 0) >= 0.04 &&
    (adjustment.referenceWeightDeltas.hero ?? 0) >= 0.04,
  "cat three-quarter collapse retries should boost starter, subject, and hero references"
);

console.log("[characterGenerationCatThreeQuarterRepair.smoke] PASS");
process.exit(0);
