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

const catProfileStyleDriftLowIsolationButStrongSilhouette = {
  candidate: { view: "profile" },
  score: 0.8532,
  consistencyScore: 0.43,
  warnings: ["text_or_watermark_suspected", "text_or_watermark_high_risk", "consistency_style_drift"],
  rejections: [],
  breakdown: {
    targetStyleScore: 0.8976,
    speciesScore: 0.5267,
    speciesMuzzleScore: 0.7348,
    speciesSilhouetteScore: 0.9931,
    subjectIsolationScore: 0.554,
    frontSymmetryScore: 0.9,
    headSquarenessScore: 0.9412
  }
} as any;

assert.equal(
  hasBlockingConsistencyRecoveryIssue(catProfileStyleDriftLowIsolationButStrongSilhouette, "cat"),
  false,
  "cat profile candidates with style-drift-only warnings should remain recoverable when silhouette and muzzle cues stay strong"
);

const repairRefineProfileStyleDriftOnly = {
  candidate: {
    view: "profile",
    providerMeta: {
      workflowStage: "repair_refine"
    }
  },
  score: 0.6362,
  consistencyScore: 0.31,
  warnings: ["text_or_watermark_suspected", "finger_spikes_detected", "consistency_style_drift"],
  rejections: [],
  breakdown: {
    targetStyleScore: 0.8684,
    speciesScore: 0.5388,
    speciesMuzzleScore: 0.7689,
    speciesSilhouetteScore: 0.9618,
    subjectIsolationScore: 0.8585,
    frontSymmetryScore: 0.9,
    headSquarenessScore: 0.991
  }
} as any;

assert.equal(
  hasBlockingConsistencyRecoveryIssue(repairRefineProfileStyleDriftOnly, "cat"),
  false,
  "repair refine profile candidates with style-drift-only warnings should not stay blocked when identity cues remain strong"
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

const highScoreProfileMixedDriftOnly = {
  candidate: { view: "profile" },
  score: 0.8305,
  consistencyScore: 0.31,
  warnings: [
    "text_or_watermark_suspected",
    "text_or_watermark_high_risk",
    "consistency_shape_drift",
    "consistency_style_drift"
  ],
  rejections: [],
  breakdown: {
    targetStyleScore: 0.8564,
    speciesScore: 0.5211,
    speciesMuzzleScore: 0.7816,
    speciesSilhouetteScore: 0.9502,
    subjectIsolationScore: 0.9727,
    frontSymmetryScore: 0.9,
    headSquarenessScore: 0.9093
  }
} as any;

assert.equal(
  hasBlockingConsistencyRecoveryIssue(highScoreProfileMixedDriftOnly, "cat"),
  false,
  "high-score profile candidates with mixed drift warnings should not stay blocked when profile identity and style cues remain strong"
);

const highScoreCatThreeQuarterWarningOnlyShapeDrift = {
  candidate: { view: "threeQuarter" },
  score: 0.7641,
  consistencyScore: 0.31,
  warnings: [
    "text_or_watermark_suspected",
    "text_or_watermark_high_risk",
    "consistency_low",
    "consistency_shape_drift"
  ],
  rejections: [],
  breakdown: {
    targetStyleScore: 0.7049,
    speciesScore: 0.5147,
    speciesMuzzleScore: 0.2424,
    speciesSilhouetteScore: 0.4221,
    subjectIsolationScore: 0.9999,
    frontSymmetryScore: 0.9,
    headSquarenessScore: 0.2114,
    handRegionDensityScore: 0.769
  }
} as any;

assert.equal(
  hasBlockingConsistencyRecoveryIssue(highScoreCatThreeQuarterWarningOnlyShapeDrift, "cat"),
  false,
  "high-score cat three-quarter candidates with warning-only consistency low + shape drift should remain recoverable"
);

const highScoreCatThreeQuarterLowMixedDrift = {
  candidate: { view: "threeQuarter" },
  score: 0.7686,
  consistencyScore: 0.31,
  warnings: [
    "text_or_watermark_suspected",
    "text_or_watermark_high_risk",
    "consistency_low",
    "consistency_shape_drift",
    "consistency_style_drift"
  ],
  rejections: [],
  breakdown: {
    targetStyleScore: 0.7156,
    speciesScore: 0.5169,
    speciesMuzzleScore: 0.2854,
    speciesSilhouetteScore: 0.4238,
    subjectIsolationScore: 1,
    frontSymmetryScore: 0.9,
    headSquarenessScore: 0.2745,
    handRegionDensityScore: 0.6052
  }
} as any;

assert.equal(
  hasBlockingConsistencyRecoveryIssue(highScoreCatThreeQuarterLowMixedDrift, "cat"),
  false,
  "high-score cat three-quarter candidates with consistency low + mixed drift warnings should remain recoverable"
);

const repairRefineCatThreeQuarterSelectedLike = {
  candidate: {
    view: "threeQuarter",
    providerMeta: {
      workflowStage: "repair_refine"
    }
  },
  score: 0.7243,
  consistencyScore: 0.7555,
  warnings: [
    "text_or_watermark_suspected",
    "text_or_watermark_high_risk",
    "palette_too_complex_for_mascot",
    "species_readability_low"
  ],
  rejections: ["threequarter_front_collapse"],
  breakdown: {
    alphaScore: 0.7725,
    occupancyScore: 0.5493,
    qualityScore: 0.548,
    referenceScore: 0.8379,
    styleScore: 1
  }
} as any;

assert.equal(
  hasBlockingConsistencyRecoveryIssue(repairRefineCatThreeQuarterSelectedLike, "cat"),
  false,
  "selected-like cat three-quarter repair candidates should stay recoverable when collapse/style issues remain soft and generic repair metrics are strong"
);

const highScoreProfileWarningOnlyShapeDrift = {
  candidate: { view: "profile" },
  score: 0.8472,
  consistencyScore: 0.31,
  warnings: [
    "text_or_watermark_suspected",
    "text_or_watermark_high_risk",
    "consistency_low",
    "consistency_shape_drift"
  ],
  rejections: [],
  breakdown: {
    targetStyleScore: 0.8844,
    speciesScore: 0.5214,
    speciesMuzzleScore: 0.7348,
    speciesSilhouetteScore: 0.9931,
    subjectIsolationScore: 0.9008,
    frontSymmetryScore: 0.9,
    headSquarenessScore: 0.9412
  }
} as any;

assert.equal(
  hasBlockingConsistencyRecoveryIssue(highScoreProfileWarningOnlyShapeDrift, "cat"),
  false,
  "high-score profile candidates with warning-only consistency low + shape drift should remain recoverable"
);

const highScoreProfileLowOnly = {
  candidate: { view: "profile" },
  score: 0.8796,
  consistencyScore: 0.43,
  warnings: [
    "text_or_watermark_suspected",
    "text_or_watermark_high_risk",
    "consistency_low"
  ],
  rejections: [],
  breakdown: {
    targetStyleScore: 0.8694,
    speciesScore: 0.522,
    speciesMuzzleScore: 0.7816,
    speciesSilhouetteScore: 0.9502,
    subjectIsolationScore: 0.972,
    frontSymmetryScore: 0.9,
    headSquarenessScore: 0.9093
  }
} as any;

assert.equal(
  hasBlockingConsistencyRecoveryIssue(highScoreProfileLowOnly, "cat"),
  false,
  "high-score profile candidates with warning-only consistency_low should remain recoverable"
);

console.log("[characterGenerationSequentialStageGate.smoke] PASS");
process.exit(0);
