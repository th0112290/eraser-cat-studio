import {
  buildProposalApplyOverrideDocuments,
  parseCharacterProposalApplyRequest,
  parseCharacterRebuildSelectedRequest
} from "./characterRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectThrows(label: string, fn: () => unknown, needle: string): void {
  let failed = false;
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(needle), `[${label}] expected "${needle}" but got "${message}"`);
    failed = true;
  }
  assert(failed, `[${label}] expected function to throw`);
}

const proposalDefault = parseCharacterProposalApplyRequest({
  generateJobId: "job-123"
});
assert(proposalDefault.generateJobId === "job-123", "expected proposal helper to keep generateJobId");
assert(proposalDefault.applyMode === "all", "expected proposal helper to default applyMode to all");
assert(proposalDefault.rebuild === false, "expected proposal helper to default rebuild=false");

const proposalAnchors = parseCharacterProposalApplyRequest({
  generateJobId: "job-123",
  applyMode: "anchors",
  afterApply: "rebuild"
});
assert(proposalAnchors.applyMode === "anchors", "expected anchors apply mode");
assert(proposalAnchors.rebuild === true, "expected afterApply=rebuild to request rebuild");

const proposalCropBoxes = parseCharacterProposalApplyRequest({
  generateJobId: "job-123",
  applyMode: "cropBoxes",
  rebuild: true
});
assert(proposalCropBoxes.applyMode === "cropBoxes", "expected cropBoxes apply mode");
assert(proposalCropBoxes.rebuild === true, "expected explicit rebuild flag to be respected");

expectThrows("proposal-missing-job", () => parseCharacterProposalApplyRequest({ applyMode: "all" }), "generateJobId is required");
expectThrows(
  "proposal-invalid-mode",
  () => parseCharacterProposalApplyRequest({ generateJobId: "job-123", applyMode: "proposal" }),
  "applyMode must be all, anchors, or cropBoxes"
);

const rebuildDefault = parseCharacterRebuildSelectedRequest({
  generateJobId: "job-456"
});
assert(rebuildDefault.generateJobId === "job-456", "expected rebuild helper to keep generateJobId");
expectThrows("rebuild-missing-job", () => parseCharacterRebuildSelectedRequest({}), "generateJobId is required");

expectThrows(
  "proposal-missing-seeds",
  () =>
    buildProposalApplyOverrideDocuments({
      proposalPath: null,
      applyMode: "all"
    }),
  "proposal.json"
);

console.log("[character-routes-action-contract-smoke] PASS");
