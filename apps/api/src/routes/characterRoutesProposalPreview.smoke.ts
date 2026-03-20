import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { summarizeProposalApplyPreview } from "./characterRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cg-proposal-preview-"));
const proposalPath = path.join(tempRoot, "proposal.json");
const anchorsOverridePath = path.join(tempRoot, "pack", "overrides", "anchors.json");
const cropBoxesOverridePath = path.join(tempRoot, "pack", "overrides", "crop-boxes.json");
fs.mkdirSync(path.dirname(anchorsOverridePath), { recursive: true });

fs.writeFileSync(
  proposalPath,
  JSON.stringify(
    {
      auto_proposal: {
        anchors: {
          views: {
            front: {
              head_center: { x: 0.5, y: 0.4, status: "present" }
            },
            threeQuarter: {
              head_center: { x: 0.58, y: 0.42, status: "present" }
            }
          }
        },
        crop_boxes: {
          head: {
            front: { x: 10, y: 12, w: 32, h: 28 },
            threeQuarter: { x: 12, y: 12, w: 30, h: 28 }
          }
        }
      }
    },
    null,
    2
  ),
  "utf8"
);

const createPreview = summarizeProposalApplyPreview({
  proposalPath,
  anchorsOverridePath: null,
  cropBoxesOverridePath: null
});
assert(createPreview.length === 2, "expected proposal preview for both override kinds");
assert(createPreview.every((entry) => entry.available), "expected proposal preview to mark both kinds available");
assert(createPreview.every((entry) => entry.state === "create"), "expected missing override files to be create state");
assert(
  createPreview.some((entry) => entry.kind === "anchors" && entry.summary === "2 views / 2 anchors"),
  "expected anchor preview summary"
);
assert(
  createPreview.some((entry) => entry.kind === "cropBoxes" && entry.summary === "1 groups / 2 crop boxes"),
  "expected crop-box preview summary"
);

fs.writeFileSync(
  anchorsOverridePath,
  JSON.stringify(
    {
      views: {
        front: {
          head_center: { x: 0.5, y: 0.4, status: "present" }
        },
        threeQuarter: {
          head_center: { x: 0.58, y: 0.42, status: "present" }
        }
      }
    },
    null,
    2
  ),
  "utf8"
);
fs.writeFileSync(
  cropBoxesOverridePath,
  JSON.stringify(
    {
      head: {
        front: { x: 20, y: 22, w: 18, h: 18 }
      }
    },
    null,
    2
  ),
  "utf8"
);

const mixedPreview = summarizeProposalApplyPreview({
  proposalPath,
  anchorsOverridePath,
  cropBoxesOverridePath
});
assert(
  mixedPreview.some((entry) => entry.kind === "anchors" && entry.state === "unchanged"),
  "expected identical anchors override to be unchanged"
);
assert(
  mixedPreview.some((entry) => entry.kind === "cropBoxes" && entry.state === "update"),
  "expected differing crop-box override to be update"
);

const missingPreview = summarizeProposalApplyPreview({
  proposalPath: path.join(tempRoot, "missing-proposal.json"),
  anchorsOverridePath,
  cropBoxesOverridePath
});
assert(missingPreview.every((entry) => entry.state === "missing"), "expected missing proposal to disable both kinds");

console.log("[character-routes-proposal-preview-smoke] PASS");
