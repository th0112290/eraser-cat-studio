import assert from "node:assert/strict";
import {
  deriveSparseCatFrontAnchorScoreFallback,
  deriveRetryAdjustmentForCandidate,
  isStrongFrontMasterCandidate,
  scoreCandidate,
  shouldDowngradeCatFrontFragmentationRisk,
  shouldDowngradeCatFrontHeadShapeBreakdownRisk
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

assert.equal(
  shouldDowngradeCatFrontFragmentationRisk({
    speciesId: "cat",
    view: "front",
    subjectFillRatio: 0.197,
    subjectIsolationScore: 0.4375,
    largestComponentShare: 0.5045,
    significantComponentCount: 6,
    speciesScore: 0.6013,
    speciesEarScore: 0.5691,
    speciesMuzzleScore: 0.7822,
    targetStyleScore: 0.6154,
    frontSymmetryScore: 0.9897,
    headSquarenessScore: 0.2998,
    handRegionDensityScore: 0.2879
  }),
  true,
  "sparse but clearly single-subject cat fronts with up to six components should downgrade fragmentation risk"
);

assert.equal(
  shouldDowngradeCatFrontFragmentationRisk({
    speciesId: "cat",
    view: "front",
    subjectFillRatio: 0.1021,
    subjectIsolationScore: 0.1547,
    largestComponentShare: 0.1983,
    significantComponentCount: 7,
    speciesScore: 0.5168,
    speciesEarScore: 0.2916,
    speciesMuzzleScore: 0.6667,
    speciesSilhouetteScore: 0.7143,
    targetStyleScore: 0.5855,
    frontSymmetryScore: 0.9979,
    headSquarenessScore: 0.2049,
    handRegionDensityScore: 0.5386
  }),
  true,
  "ultra sparse but symmetric cat outline fronts should downgrade fragmentation hard rejects into warnings"
);

assert.equal(
  shouldDowngradeCatFrontFragmentationRisk({
    speciesId: "cat",
    view: "front",
    subjectFillRatio: 0.0933,
    subjectIsolationScore: 0.1604,
    largestComponentShare: 0.1493,
    significantComponentCount: 6,
    speciesScore: 0.5482,
    speciesEarScore: 0.2647,
    speciesMuzzleScore: 0.7083,
    speciesSilhouetteScore: 0.75,
    targetStyleScore: 0.6035,
    frontSymmetryScore: 0.9981,
    headSquarenessScore: 0.2524,
    handRegionDensityScore: 0.5228
  }),
  true,
  "live sparse single-subject cat fronts with low component concentration should still downgrade fragmentation when symmetry and species cues are strong"
);

assert.equal(
  shouldDowngradeCatFrontFragmentationRisk({
    speciesId: "cat",
    view: "front",
    subjectFillRatio: 0.0715,
    subjectIsolationScore: 0.503,
    largestComponentShare: 0.4192,
    significantComponentCount: 3,
    speciesScore: 0.5185,
    speciesEarScore: 0.165,
    speciesMuzzleScore: 0.8042,
    speciesSilhouetteScore: 0.8322,
    targetStyleScore: 0.5865,
    frontSymmetryScore: 0.9986,
    headSquarenessScore: 0.1909,
    handRegionDensityScore: 0.2112
  }),
  true,
  "structured sparse cat fronts with strong muzzle and silhouette cues should downgrade fragmentation hard rejects into warnings"
);

assert.equal(
  shouldDowngradeCatFrontFragmentationRisk({
    speciesId: "cat",
    view: "front",
    subjectFillRatio: 0.079,
    subjectIsolationScore: 0.24,
    largestComponentShare: 0.17,
    significantComponentCount: 6,
    speciesScore: 0.39,
    speciesEarScore: 0.11,
    speciesMuzzleScore: 0.42,
    speciesSilhouetteScore: 0.36,
    targetStyleScore: 0.5,
    frontSymmetryScore: 0.997,
    headSquarenessScore: 0.19,
    handRegionDensityScore: 0.19
  }),
  false,
  "symmetry alone should not rescue genuinely fragmented cat fronts with weak subject and species signals"
);

assert.equal(
  shouldDowngradeCatFrontHeadShapeBreakdownRisk({
    speciesId: "cat",
    view: "front",
    subjectFillRatio: 0.3073,
    subjectIsolationScore: 0.7699,
    largestComponentShare: 0.8178,
    significantComponentCount: 4,
    speciesScore: 0.6416,
    speciesEarScore: 0.6218,
    speciesMuzzleScore: 0.5067,
    speciesHeadShapeScore: 0.9639,
    speciesSilhouetteScore: 0.5772,
    targetStyleScore: 0.6519,
    frontSymmetryScore: 0.9964,
    headSquarenessScore: 0.1251,
    handRegionDensityScore: 0.2846
  }),
  true,
  "cat front candidates with strong subject/species cues should downgrade head-shape hard rejects into warnings"
);

assert.equal(
  shouldDowngradeCatFrontHeadShapeBreakdownRisk({
    speciesId: "cat",
    view: "front",
    subjectFillRatio: 0.09,
    subjectIsolationScore: 0.31,
    largestComponentShare: 0.22,
    significantComponentCount: 7,
    speciesScore: 0.44,
    speciesEarScore: 0.14,
    speciesMuzzleScore: 0.28,
    speciesHeadShapeScore: 0.33,
    speciesSilhouetteScore: 0.24,
    targetStyleScore: 0.47,
    frontSymmetryScore: 0.69,
    headSquarenessScore: 0.11,
    handRegionDensityScore: 0.12
  }),
  false,
  "weak cat fronts should keep head-shape breakdown as a hard reject"
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
assert.ok(
  (retryAdjustment.referenceWeightDeltas.composition ?? 0) >= 0.09,
  "cat front retry adjustment should preserve composition anchor under fragmentation/isolation pressure"
);

const fragmentedStyleRetryAdjustment = deriveRetryAdjustmentForCandidate({
  stage: "front",
  view: "front",
  speciesId: "cat",
  candidate: {
    candidate: {
      id: "cat-front-fragmented-style-stub",
      view: "front"
    },
    analysis: {},
    score: 0.5871,
    styleScore: 0.5723,
    referenceSimilarity: null,
    consistencyScore: 0.41,
    warnings: [
      "too_colorful_for_mascot",
      "palette_too_complex_for_mascot",
      "head_shape_not_square_enough",
      "paw_symmetry_low",
      "cat_ear_silhouette_too_flat",
      "subject_isolation_low"
    ],
    rejections: ["fragmented_or_multi_object_front"],
    breakdown: {}
  } as any
});

assert.ok(
  (fragmentedStyleRetryAdjustment.referenceWeightDeltas.composition ?? 0) >= 0.1,
  "style reinforcement should not suppress composition anchor during cat front fragmentation recovery"
);

assert.equal(
  isStrongFrontMasterCandidate(
    {
      candidate: { view: "front" },
      rejections: [],
      score: 0.8765,
      breakdown: {
        frontSymmetryScore: 0.9937,
        headSquarenessScore: 0.2567,
        speciesScore: 0.643,
        targetStyleScore: 0.7787,
        speciesEarScore: 0.4488,
        speciesMuzzleScore: 0.9298,
        speciesSilhouetteScore: 0.9398
      }
    } as any,
    "eraser-cat-mascot-production",
    0.62,
    "cat"
  ),
  true,
  "cat front strong gate should accept highly symmetric fronts that miss the square-head floor by a rounding margin when species/style cues are otherwise strong"
);

assert.equal(
  isStrongFrontMasterCandidate(
    {
      candidate: { view: "front" },
      rejections: [],
      score: 0.767,
      breakdown: {
        frontSymmetryScore: 0.9979,
        headSquarenessScore: 0.2049,
        speciesScore: 0.531,
        targetStyleScore: 0.5976,
        speciesEarScore: 0.3114,
        speciesMuzzleScore: 0.6667,
        speciesSilhouetteScore: 0.7143,
        handRegionDensityScore: 0.5657,
        subjectFillRatio: 0.1057,
        subjectIsolationScore: 0.1595,
        largestComponentShare: 0.2045,
        significantComponentCount: 7
      }
    } as any,
    "eraser-cat-mascot-production",
    0.62,
    "cat"
  ),
  true,
  "cat sparse-outline fronts with strong symmetry and identity cues should still count as a strong front baseline"
);

const sparseRepairFrontCandidate = {
  candidate: {
    id: "cat-front-sparse-repair",
    view: "front",
    providerMeta: {
      workflowStage: "repair_refine"
    }
  },
  rejections: [],
  warnings: ["palette_too_complex_for_mascot"],
  score: 0.9997,
  consistencyScore: 1,
  breakdown: {
    alphaScore: 0.9888,
    occupancyScore: 0.7383,
    qualityScore: 0.6866,
    referenceScore: 0.6223,
    styleScore: 1
  }
} as any;

assert.ok(
  (deriveSparseCatFrontAnchorScoreFallback({
    candidate: sparseRepairFrontCandidate,
    acceptedScoreThreshold: 0.58,
    speciesId: "cat"
  }) ?? 0) >= 0.7,
  "cat repair-refine fronts with sparse generic metrics should derive a conservative front-anchor fallback"
);

assert.equal(
  isStrongFrontMasterCandidate(
    sparseRepairFrontCandidate,
    "eraser-cat-mascot-production",
    0.58,
    "cat"
  ),
  true,
  "cat repair-refine fronts should still count as a strong front baseline when generic quality/reference signals are very strong"
);

const duplicateFrontGateCandidate = scoreCandidate({
  candidate: {
    id: "cat-front-duplicate-risk",
    view: "front",
    seed: 4242
  } as any,
  analysis: {
    originalWidth: 1024,
    originalHeight: 1024,
    width: 1024,
    height: 1024,
    alphaCoverage: 0.03,
    bboxOccupancy: 0.4,
    bboxCenterX: 0.5,
    bboxCenterY: 0.5,
    bboxScale: 0.45,
    bboxAspectRatio: 0.92,
    contrast: 48,
    blurScore: 260,
    noiseScore: 12,
    watermarkTextRisk: 0.02,
    edgeDensityBottomRight: 0.02,
    upperFaceCoverage: 0.08,
    upperAlphaRatio: 0.62,
    headBoxAspectRatio: 0.92,
    monochromeScore: 0.94,
    paletteComplexity: 0.12,
    symmetryScore: 0.97,
    handRegionEdgeDensity: 0.4,
    pawRoundnessScore: 0.58,
    pawSymmetryScore: 0.6,
    fingerSpikeScore: 0.08,
    largestComponentShare: 0.2,
    significantComponentCount: 6,
    phash: "00ff00ff00ff00ff",
    palette: [
      [250, 250, 250],
      [25, 25, 25],
      [180, 180, 180]
    ]
  },
  mode: "reference",
  styleScore: 0.76,
  targetStyle: "eraser-cat-mascot-production",
  speciesId: "cat",
  generationRound: 1
});

assert.equal(
  duplicateFrontGateCandidate.rejections.filter((reason) => reason === "fragmented_or_multi_object_front").length,
  1,
  "duplicate front fragmentation gates should collapse to a single rejection reason"
);

console.log("[characterGenerationCatFrontGate.smoke] PASS");
process.exit(0);
