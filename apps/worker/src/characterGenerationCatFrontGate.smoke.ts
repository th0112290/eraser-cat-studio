import assert from "node:assert/strict";
import {
  deriveRetryAdjustmentForCandidate,
  shouldDowngradeCatFrontFragmentationRisk
} from "./characterGeneration";

assert.equal(
  shouldDowngradeCatFrontFragmentationRisk({
    speciesId: "cat",
    view: "front",
    subjectFillRatio: 0.064,
    subjectIsolationScore: 0.2961,
    largestComponentShare: 0.154,
    significantComponentCount: 3,
    speciesScore: 0.4615,
    speciesEarScore: 0.1911,
    speciesMuzzleScore: 0.5873,
    targetStyleScore: 0.6514,
    frontSymmetryScore: 0.998,
    headSquarenessScore: 0.3801,
    handRegionDensityScore: 0.4731
  }),
  true,
  "cat front candidates with strong symmetry/species/style cues should downgrade narrow fragmentation false positives"
);

assert.equal(
  shouldDowngradeCatFrontFragmentationRisk({
    speciesId: "cat",
    view: "front",
    subjectFillRatio: 0.03,
    subjectIsolationScore: 0.19,
    largestComponentShare: 0.08,
    significantComponentCount: 6,
    speciesScore: 0.28,
    speciesEarScore: 0.09,
    speciesMuzzleScore: 0.31,
    targetStyleScore: 0.44,
    frontSymmetryScore: 0.61,
    headSquarenessScore: 0.19,
    handRegionDensityScore: 0.11
  }),
  false,
  "severely fragmented cat fronts should remain rejected"
);

const retryAdjustment = deriveRetryAdjustmentForCandidate({
  stage: "front",
  view: "front",
  speciesId: "cat",
  candidate: {
    candidate: {
      id: "cat-front-stub",
      view: "front"
    },
    analysis: {},
    score: 0.6566,
    styleScore: 0.6514,
    referenceSimilarity: null,
    consistencyScore: 0.41,
    warnings: ["face_or_eyes_region_unstable", "cat_ear_silhouette_too_flat", "subject_isolation_low"],
    rejections: ["fragmented_or_multi_object_front"],
    breakdown: {}
  } as any
});

assert.ok(
  retryAdjustment.notes.includes("reinforced cat front anchor and silhouette"),
  "cat front retry adjustment should surface a dedicated reinforcement note"
);
assert.ok(
  retryAdjustment.extraNegativeTokens.includes("detached ear fragment") &&
    retryAdjustment.extraNegativeTokens.includes("detached whisker fragment"),
  "cat front retry adjustment should suppress detached ear/whisker fragment failure modes"
);
assert.ok(
  retryAdjustment.viewPromptHints.some((hint) => hint.includes("single centered full-body cat mascot")),
  "cat front retry adjustment should strengthen centered single-subject guidance"
);

console.log("[characterGenerationCatFrontGate.smoke] PASS");
process.exit(0);
