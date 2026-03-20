import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProposalApplyOverrideDocuments } from "./characterRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cg-proposal-apply-"));
const proposalPath = path.join(tempRoot, "proposal.json");
fs.writeFileSync(
  proposalPath,
  JSON.stringify(
    {
      auto_proposal: {
        anchors: {
          views: {
            front: {
              head_center: { x: 0.5, y: 0.4, status: "present" }
            }
          }
        },
        crop_boxes: {
          head: {
            front: { x: 10, y: 12, w: 32, h: 28 }
          }
        }
      }
    },
    null,
    2
  ),
  "utf8"
);

const all = buildProposalApplyOverrideDocuments({
  proposalPath,
  applyMode: "all"
});
assert(all.appliedKinds.length === 2, "expected all mode to materialize both proposal kinds");
assert(all.appliedKinds.includes("anchors"), "expected anchors proposal to be applied");
assert(all.appliedKinds.includes("cropBoxes"), "expected crop-box proposal to be applied");
assert(typeof all.anchorsText === "string" && all.anchorsText.includes('"views"'), "expected anchors override text");
assert(
  typeof all.cropBoxesText === "string" && all.cropBoxesText.includes('"head"'),
  "expected crop-box override text"
);

const anchorsOnly = buildProposalApplyOverrideDocuments({
  proposalPath,
  applyMode: "anchors"
});
assert(anchorsOnly.appliedKinds.length === 1 && anchorsOnly.appliedKinds[0] === "anchors", "expected anchors-only apply");
assert(anchorsOnly.cropBoxesText === null, "expected anchors-only apply to skip crop boxes");

const missingProposalPath = path.join(tempRoot, "missing-proposal.json");
let missingFailed = false;
try {
  buildProposalApplyOverrideDocuments({
    proposalPath: missingProposalPath,
    applyMode: "all"
  });
} catch {
  missingFailed = true;
}
assert(missingFailed, "expected missing proposal to fail");

console.log("[character-routes-proposal-apply-smoke] PASS");
