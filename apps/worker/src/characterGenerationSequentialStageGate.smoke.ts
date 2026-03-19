import assert from "node:assert/strict";
import {
  hasBlockingConsistencyRecoveryIssue,
  shouldRunIdentityLockForCandidate,
  shouldRunSideRefineForCandidate
} from "./characterGeneration";

const acceptedScoreThreshold = 0.58;

const recoverableThreeQuarter = {
  candidate: { view: "threeQuarter" },
  score: 0.7499,
  consistencyScore: 0.41,
  breakdown: {},
  warnings: ["paw_symmetry_low", "consistency_shape_drift"],
  rejections: ["threequarter_front_collapse", "inconsistent_with_front_baseline"]
} as any;

assert.equal(
  shouldRunSideRefineForCandidate({
    candidate: recoverableThreeQuarter,
    view: "threeQuarter",
    acceptedScoreThreshold
  }),
  true
);

assert.equal(
  shouldRunIdentityLockForCandidate({
    candidate: recoverableThreeQuarter,
    view: "threeQuarter",
    acceptedScoreThreshold
  }),
  true
);

const recoverableProfile = {
  candidate: { view: "profile" },
  score: 0.7701,
  consistencyScore: 0.45,
  breakdown: {},
  warnings: ["dog_muzzle_too_short", "consistency_shape_drift"],
  rejections: ["inconsistent_with_front_baseline"]
} as any;

assert.equal(
  shouldRunSideRefineForCandidate({
    candidate: recoverableProfile,
    view: "profile",
    acceptedScoreThreshold
  }),
  true
);

assert.equal(
  shouldRunIdentityLockForCandidate({
    candidate: recoverableProfile,
    view: "profile",
    acceptedScoreThreshold
  }),
  true
);

const unrecoverable = {
  candidate: { view: "threeQuarter" },
  score: 0.73,
  consistencyScore: 0.39,
  breakdown: {},
  warnings: ["consistency_shape_drift"],
  rejections: ["head_shape_breakdown"]
} as any;

assert.equal(
  shouldRunSideRefineForCandidate({
    candidate: unrecoverable,
    view: "threeQuarter",
    acceptedScoreThreshold
  }),
  false
);

assert.equal(
  shouldRunIdentityLockForCandidate({
    candidate: unrecoverable,
    view: "threeQuarter",
    acceptedScoreThreshold
  }),
  false
);

const highScoreProfileStyleDriftOnly = {
  candidate: { view: "profile" },
  score: 0.8753,
  consistencyScore: 0.45,
  warnings: ["text_or_watermark_suspected", "text_or_watermark_high_risk", "consistency_style_drift"],
  rejections: [],
  breakdown: {
    targetStyleScore: 0.8578,
    speciesScore: 0.5198,
    speciesMuzzleScore: 0.8163,
    speciesSilhouetteScore: 0.9184,
    subjectIsolationScore: 0.8549
  }
} as any;

assert.equal(
  hasBlockingConsistencyRecoveryIssue(highScoreProfileStyleDriftOnly, "cat"),
  false,
  "high-score profile candidates with style-drift-only recovery issues should not stay blocked"
);

const highScoreCatThreeQuarterMixedDriftOnly = {
  candidate: { view: "threeQuarter" },
  score: 0.7651,
  consistencyScore: 0.32,
  warnings: [
    "text_or_watermark_suspected",
    "text_or_watermark_high_risk",
    "consistency_shape_drift",
    "consistency_style_drift"
  ],
  rejections: [],
  breakdown: {
    targetStyleScore: 0.7094,
    speciesScore: 0.5157,
    speciesMuzzleScore: 0.1004,
    speciesSilhouetteScore: 0.4229,
    subjectIsolationScore: 0.9951,
    frontSymmetryScore: 0.9,
    headSquarenessScore: 0.2114,
    handRegionDensityScore: 0.6154
  }
} as any;

assert.equal(
  hasBlockingConsistencyRecoveryIssue(highScoreCatThreeQuarterMixedDriftOnly, "cat"),
  false,
  "high-score cat three-quarter candidates with mixed drift warnings should not stay blocked when side silhouette cues remain strong"
);

console.log("[characterGenerationSequentialStageGate.smoke] PASS");
process.exit(0);
