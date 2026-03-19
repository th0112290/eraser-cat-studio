import assert from "node:assert/strict";
import {
  buildManifestSelectedByView,
  shouldRetainSelectedByViewOnSelectionBlock
} from "./characterGeneration";

const selectedByView = {
  front: {
    candidate: { id: "front_candidate" }
  },
  threeQuarter: {
    candidate: { id: "threequarter_candidate" }
  },
  profile: {
    candidate: { id: "profile_candidate" }
  }
} as const;

assert.deepEqual(buildManifestSelectedByView(selectedByView as never), {
  front: { candidateId: "front_candidate" },
  threeQuarter: { candidateId: "threequarter_candidate" },
  profile: { candidateId: "profile_candidate" }
});

assert.equal(shouldRetainSelectedByViewOnSelectionBlock("hitl"), true);
assert.equal(shouldRetainSelectedByViewOnSelectionBlock("auto"), false);

console.log("[characterGenerationHitlSelectionBlock.smoke] PASS");
process.exit(0);
