import assert from "node:assert/strict";
import { isThreeQuarterFrontCollapseRisk } from "./characterGeneration";

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

console.log("[characterGenerationThreeQuarterCollapseHeuristic.smoke] PASS");
process.exit(0);
