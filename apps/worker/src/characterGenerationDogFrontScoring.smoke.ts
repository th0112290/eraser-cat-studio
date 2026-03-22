import assert from "node:assert/strict";
import { scoreCandidate } from "./characterGeneration";

const weakDogFrontAnalysis: any = {
  originalWidth: 1024,
  originalHeight: 1024,
  width: 128,
  height: 128,
  alphaCoverage: 0.162,
  bboxOccupancy: 0.252,
  bboxCenterX: 0.5,
  bboxCenterY: 0.5,
  bboxScale: 0.5,
  bboxAspectRatio: 1.0769,
  contrast: 92,
  blurScore: 2900,
  noiseScore: 10,
  watermarkTextRisk: 0.02,
  edgeDensityBottomRight: 0.01,
  upperFaceCoverage: 0.0466,
  upperAlphaRatio: 0.5757,
  headBoxAspectRatio: 1.2727,
  monochromeScore: 0.97,
  paletteComplexity: 0.04,
  symmetryScore: 0.9963,
  handRegionEdgeDensity: 0.424,
  pawRoundnessScore: 0.4332,
  pawSymmetryScore: 0.9632,
  fingerSpikeScore: 0.4081,
  largestComponentShare: 0.98,
  significantComponentCount: 1,
  phash: "0000000000000000",
  palette: [[0, 0, 0]]
};

const strongDogFrontAnalysis: any = {
  originalWidth: 1024,
  originalHeight: 1024,
  width: 128,
  height: 128,
  alphaCoverage: 0.19,
  bboxOccupancy: 0.34,
  bboxCenterX: 0.5,
  bboxCenterY: 0.5,
  bboxScale: 0.58,
  bboxAspectRatio: 0.84,
  contrast: 86,
  blurScore: 3200,
  noiseScore: 8,
  watermarkTextRisk: 0.01,
  edgeDensityBottomRight: 0.01,
  upperFaceCoverage: 0.14,
  upperAlphaRatio: 0.54,
  headBoxAspectRatio: 1.05,
  monochromeScore: 0.96,
  paletteComplexity: 0.04,
  symmetryScore: 0.94,
  handRegionEdgeDensity: 0.22,
  pawRoundnessScore: 0.62,
  pawSymmetryScore: 0.81,
  fingerSpikeScore: 0.18,
  largestComponentShare: 0.96,
  significantComponentCount: 1,
  phash: "1111111111111111",
  palette: [[0, 0, 0]]
};

const weakDogFront = scoreCandidate({
  candidate: {
    id: "weak_dog_front",
    view: "front"
  } as any,
  analysis: weakDogFrontAnalysis,
  mode: "generated",
  styleScore: 1,
  targetStyle: "compact mascot",
  speciesId: "dog",
  generationRound: 0
});

assert.ok(weakDogFront.rejections.includes("dog_front_species_breakdown"));
assert.ok(weakDogFront.rejections.includes("dog_front_face_too_small"));
assert.ok(weakDogFront.rejections.includes("dog_front_arm_zone_empty"));

const strongDogFront = scoreCandidate({
  candidate: {
    id: "strong_dog_front",
    view: "front"
  } as any,
  analysis: strongDogFrontAnalysis,
  mode: "generated",
  styleScore: 1,
  targetStyle: "compact mascot",
  speciesId: "dog",
  generationRound: 0
});

assert.ok(!strongDogFront.rejections.includes("dog_front_species_breakdown"));
assert.ok(!strongDogFront.rejections.includes("dog_front_face_too_small"));
assert.ok(!strongDogFront.rejections.includes("dog_front_arm_zone_empty"));
assert.ok((strongDogFront.breakdown.speciesScore ?? 0) >= 0.34);
assert.ok((strongDogFront.breakdown.headSquarenessScore ?? 0) >= 0.45);
assert.ok((weakDogFront.breakdown.headSquarenessScore ?? 0) >= 0.4);

console.log("[characterGenerationDogFrontScoring.smoke] PASS");
process.exit(0);
