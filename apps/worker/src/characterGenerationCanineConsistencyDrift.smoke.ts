import assert from "node:assert/strict";
import {
  hasBlockingConsistencyRecoveryIssue,
  isConsistencyCriticalShapeDrift,
  shouldDowngradeCanineSideStyleDrift,
  shouldDowngradeCanineThreeQuarterFrontCollapseRisk,
  shouldDowngradeCanineSideCriticalShapeDrift
} from "./characterGeneration";

assert.equal(
  isConsistencyCriticalShapeDrift({
    speciesId: "dog",
    view: "threeQuarter",
    upperAlpha: 0.25,
    headAspect: 0.23,
    upperFace: 0.19
  }),
  false,
  "dog three-quarter should allow moderate muzzle-driven shape drift without tripping critical consistency rejection"
);

assert.equal(
  isConsistencyCriticalShapeDrift({
    speciesId: "dog",
    view: "threeQuarter",
    upperAlpha: 0.23,
    headAspect: 0.27,
    upperFace: 0.2
  }),
  false,
  "dog three-quarter should keep a single weak consistency metric as a warning path, not a hard reject"
);

assert.equal(
  isConsistencyCriticalShapeDrift({
    speciesId: "wolf",
    view: "threeQuarter",
    upperAlpha: 0.24,
    headAspect: 0.22,
    upperFace: 0.18
  }),
  false,
  "wolf three-quarter should allow canine head-turn drift without tripping critical consistency rejection"
);

assert.equal(
  isConsistencyCriticalShapeDrift({
    speciesId: "cat",
    view: "threeQuarter",
    upperAlpha: 0.25,
    headAspect: 0.23,
    upperFace: 0.19
  }),
  true,
  "cat three-quarter should keep the stricter compact-shape consistency gate"
);

assert.equal(
  isConsistencyCriticalShapeDrift({
    speciesId: "dog",
    view: "profile",
    upperAlpha: 0.27,
    headAspect: 0.29,
    upperFace: 0.4
  }),
  false,
  "dog profile should allow a single weak side-view shape cue without tripping a critical reject"
);

assert.equal(
  isConsistencyCriticalShapeDrift({
    speciesId: "wolf",
    view: "profile",
    upperAlpha: 0.25,
    headAspect: 0.22,
    upperFace: 0.4
  }),
  true,
  "wolf profile should still reject when multiple canine side-view cues collapse together"
);

assert.equal(
  isConsistencyCriticalShapeDrift({
    speciesId: "dog",
    view: "threeQuarter",
    upperAlpha: 0.18,
    headAspect: 0.19,
    upperFace: 0.12
  }),
  true,
  "severe canine drift should still be rejected"
);

assert.equal(
  shouldDowngradeCanineThreeQuarterFrontCollapseRisk({
    speciesId: "dog",
    view: "threeQuarter",
    referenceScore: 0.5166,
    subjectIsolationScore: 0.9997,
    speciesScore: 0.4618,
    speciesMuzzleScore: 0.7063,
    speciesSilhouetteScore: 0.5641,
    targetStyleScore: 0.7832,
    pawStabilityScore: 0.8756
  }),
  true,
  "dog three-quarter candidates with strong isolation, muzzle cues, and consistency should downgrade front-collapse false positives"
);

assert.equal(
  shouldDowngradeCanineThreeQuarterFrontCollapseRisk({
    speciesId: "wolf",
    view: "threeQuarter",
    referenceScore: 0.44,
    subjectIsolationScore: 0.93,
    speciesScore: 0.41,
    speciesMuzzleScore: 0.5,
    speciesSilhouetteScore: 0.48,
    targetStyleScore: 0.72,
    pawStabilityScore: 0.7
  }),
  false,
  "canine collapse downgrade should stay off when the side-view evidence is still weak"
);

assert.equal(
  shouldDowngradeCanineSideStyleDrift({
    speciesId: "dog",
    view: "threeQuarter",
    consistencyScore: 0.8363,
    subjectIsolationScore: 1,
    speciesScore: 0.4308,
    speciesMuzzleScore: 0.6541,
    speciesSilhouetteScore: 0.5162,
    targetStyleScore: 0.7799,
    paletteScore: 0.6988,
    monochromeScore: 0.9848,
    paletteComplexityScore: 0
  }),
  true,
  "dog side views should not be marked as style drift when the only mismatch is palette complexity on otherwise strong monochrome reference-preserving results"
);

assert.equal(
  shouldDowngradeCanineSideStyleDrift({
    speciesId: "dog",
    view: "profile",
    consistencyScore: 0.74,
    subjectIsolationScore: 1,
    speciesScore: 0.52,
    speciesMuzzleScore: 0.87,
    speciesSilhouetteScore: 0.47,
    targetStyleScore: 0.73,
    paletteScore: 0.72,
    monochromeScore: 0.98,
    paletteComplexityScore: 0
  }),
  false,
  "canine style drift downgrade should stay off when overall side consistency is still too weak"
);

assert.equal(
  shouldDowngradeCanineSideCriticalShapeDrift({
    speciesId: "dog",
    view: "threeQuarter",
    consistencyScore: 0.84,
    warningThreshold: 0.58,
    speciesScore: 0.356,
    frontSymmetryScore: 0.9,
    hasFrontCollapse: false,
    hasSpeciesReadabilityWarning: false
  }),
  true,
  "dog three-quarter with strong consistency and acceptable species cues should downgrade critical shape drift to a warning-only path"
);

assert.equal(
  shouldDowngradeCanineSideCriticalShapeDrift({
    speciesId: "dog",
    view: "profile",
    consistencyScore: 0.83,
    warningThreshold: 0.58,
    speciesScore: 0.274,
    frontSymmetryScore: 0.9,
    hasFrontCollapse: false,
    hasSpeciesReadabilityWarning: true
  }),
  false,
  "dog profile should keep rejecting when species readability is still weak"
);

assert.equal(
  shouldDowngradeCanineSideCriticalShapeDrift({
    speciesId: "wolf",
    view: "threeQuarter",
    consistencyScore: 0.86,
    warningThreshold: 0.58,
    speciesScore: 0.34,
    frontSymmetryScore: 0.95,
    hasFrontCollapse: true,
    hasSpeciesReadabilityWarning: false
  }),
  false,
  "wolf three-quarter should not downgrade when front-collapse risk is still present"
);

assert.equal(
  shouldDowngradeCanineSideCriticalShapeDrift({
    speciesId: "cat",
    view: "threeQuarter",
    consistencyScore: 0.84,
    warningThreshold: 0.58,
    speciesScore: 0.41,
    frontSymmetryScore: 0.9,
    hasFrontCollapse: false,
    hasSpeciesReadabilityWarning: false
  }),
  false,
  "non-canine side views should keep the stricter hard-reject path"
);

assert.equal(
  hasBlockingConsistencyRecoveryIssue(
    {
      candidate: { view: "profile" },
      rejections: [],
      warnings: ["dog_muzzle_too_short", "consistency_shape_drift"],
      consistencyScore: 0.8243,
      breakdown: {
        speciesScore: 0.3045,
        frontSymmetryScore: 0.9
      }
    } as any,
    "dog"
  ),
  false,
  "warning-only canine profile drift should stop blocking stage admission once species readability recovers"
);

assert.equal(
  hasBlockingConsistencyRecoveryIssue(
    {
      candidate: { view: "profile" },
      rejections: ["inconsistent_with_front_baseline"],
      warnings: ["species_readability_low", "consistency_shape_drift"],
      consistencyScore: 0.8096,
      breakdown: {
        speciesScore: 0.27,
        frontSymmetryScore: 0.9
      }
    } as any,
    "dog"
  ),
  true,
  "canine profile drift should keep blocking when the recovery still depends on a hard consistency rejection"
);

console.log("[characterGenerationCanineConsistencyDrift.smoke] PASS");
process.exit(0);
