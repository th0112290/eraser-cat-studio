import assert from "node:assert/strict";
import {
  shouldRunIdentityLockForCandidate,
  shouldRunSideRefineForCandidate
} from "./characterGeneration";

const acceptedScoreThreshold = 0.58;

const recoverableThreeQuarter = {
  score: 0.7499,
  consistencyScore: 0.41,
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
  score: 0.7701,
  consistencyScore: 0.45,
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
  score: 0.73,
  consistencyScore: 0.39,
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

console.log("[characterGenerationSequentialStageGate.smoke] PASS");
process.exit(0);
