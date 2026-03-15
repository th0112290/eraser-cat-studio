import assert from "node:assert/strict";
import {
  isStrongFrontMasterCandidate,
  shouldDowngradeCanineFrontFragmentationRisk
} from "./characterGeneration";

assert.equal(
  shouldDowngradeCanineFrontFragmentationRisk({
    speciesId: "wolf",
    view: "front",
    subjectFillRatio: 0.24,
    subjectIsolationScore: 0.36,
    largestComponentShare: 0.74,
    significantComponentCount: 6,
    speciesScore: 0.5535,
    speciesMuzzleScore: 0.58,
    speciesSilhouetteScore: 0.43,
    targetStyleScore: 0.8842,
    frontSymmetryScore: 0.9989,
    headSquarenessScore: 0.8096,
    handRegionDensityScore: 0.2134
  }),
  true,
  "wolf front candidates with strong species/style cues should downgrade fragmentation false positives to a warning-only path"
);

assert.equal(
  shouldDowngradeCanineFrontFragmentationRisk({
    speciesId: "wolf",
    view: "front",
    subjectFillRatio: 0.17,
    subjectIsolationScore: 0.24,
    largestComponentShare: 0.42,
    significantComponentCount: 8,
    speciesScore: 0.31,
    speciesMuzzleScore: 0.16,
    speciesSilhouetteScore: 0.18,
    targetStyleScore: 0.7,
    frontSymmetryScore: 0.84,
    headSquarenessScore: 0.31,
    handRegionDensityScore: 0.12
  }),
  false,
  "severely fragmented wolf fronts should remain rejected"
);

assert.equal(
  isStrongFrontMasterCandidate(
    {
      candidate: { view: "front" },
      rejections: [],
      score: 0.8163,
      breakdown: {
        frontSymmetryScore: 0.9989,
        headSquarenessScore: 0.8096,
        speciesScore: 0.5535,
        targetStyleScore: 0.8842,
        speciesEarScore: 0.8062,
        speciesMuzzleScore: 0.58,
        speciesHeadShapeScore: 0.115,
        speciesSilhouetteScore: 0.43
      }
    } as any,
    "compact mascot",
    0.62,
    "wolf"
  ),
  true,
  "wolf front strong gate should accept broad wolf muzzle/silhouette support even when head-shape cue is slightly below the previous floor"
);

console.log("[characterGenerationWolfFrontGate.smoke] PASS");
process.exit(0);
