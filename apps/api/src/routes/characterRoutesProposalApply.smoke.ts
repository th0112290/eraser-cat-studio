import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProposalApplyOverrideDocuments, materializeCharacterOverrideDocuments } from "./characterRoutes";

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

const overridesRoot = path.join(tempRoot, "pack", "overrides");
const anchorsOverridePath = path.join(overridesRoot, "anchors.json");
const cropBoxesOverridePath = path.join(overridesRoot, "crop-boxes.json");
fs.mkdirSync(overridesRoot, { recursive: true });
fs.writeFileSync(anchorsOverridePath, "{\n  \"seed\": \"keep\"\n}\n", "utf8");
fs.writeFileSync(cropBoxesOverridePath, "{\n  \"seed\": \"keep\"\n}\n", "utf8");

const anchorsMaterialized = materializeCharacterOverrideDocuments({
  appliedKinds: anchorsOnly.appliedKinds,
  anchorsText: anchorsOnly.anchorsText,
  cropBoxesText: anchorsOnly.cropBoxesText,
  anchorsOverridePath,
  cropBoxesOverridePath
});
assert(anchorsMaterialized.anchorsOverridePath === anchorsOverridePath, "expected anchors materialization path");
assert(anchorsMaterialized.cropBoxesOverridePath === null, "expected anchors-only materialization to skip crop boxes");
assert(fs.readFileSync(anchorsOverridePath, "utf8").includes("\"views\""), "expected anchors override file to be rewritten");
assert(fs.readFileSync(cropBoxesOverridePath, "utf8").includes("\"seed\""), "expected crop-box override file to remain untouched");

const cropBoxesOnly = buildProposalApplyOverrideDocuments({
  proposalPath,
  applyMode: "cropBoxes"
});
const cropMaterialized = materializeCharacterOverrideDocuments({
  appliedKinds: cropBoxesOnly.appliedKinds,
  anchorsText: cropBoxesOnly.anchorsText,
  cropBoxesText: cropBoxesOnly.cropBoxesText,
  anchorsOverridePath,
  cropBoxesOverridePath
});
assert(cropMaterialized.anchorsOverridePath === null, "expected crop-only materialization to skip anchors");
assert(cropMaterialized.cropBoxesOverridePath === cropBoxesOverridePath, "expected crop-box materialization path");
assert(fs.readFileSync(cropBoxesOverridePath, "utf8").includes("\"head\""), "expected crop-box override file to be rewritten");

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
