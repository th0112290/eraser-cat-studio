import {
  buildCharacterProposalApplyApiResponse,
  buildCharacterRebuildSelectedApiResponse,
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

const proposalApiResponse = buildCharacterProposalApplyApiResponse({
  applyMode: "anchors",
  appliedKinds: ["anchors"],
  characterPackId: "pack-123",
  anchorsOverridePath: "/tmp/anchors.json",
  cropBoxesOverridePath: null,
  rebuilt: {
    sessionId: "session-123",
    episodeId: "episode-123",
    generateJobId: "job-789",
    buildJobId: "build-123",
    previewJobId: "preview-123",
    bullmqJobId: "bull-123",
    manifestPath: "/tmp/manifest.json",
    selection: {
      front: "cand-front",
      threeQuarter: "cand-3q",
      profile: "cand-profile"
    }
  }
});
assert(proposalApiResponse.data.applyMode === "anchors", "expected proposal API response applyMode");
assert(proposalApiResponse.data.appliedKinds.length === 1, "expected proposal API applied kinds");
assert(proposalApiResponse.data.rebuilt?.generateJobId === "job-789", "expected rebuilt payload to be preserved");

const rebuildApiResponse = buildCharacterRebuildSelectedApiResponse({
  created: {
    sessionId: "session-456",
    episodeId: "episode-456",
    generateJobId: "job-456",
    buildJobId: "build-456",
    previewJobId: "preview-456",
    bullmqJobId: "bull-456",
    manifestPath: "/tmp/rebuild-manifest.json",
    selection: {
      front: "cand-front",
      threeQuarter: "cand-3q",
      profile: "cand-profile"
    }
  }
});
assert(rebuildApiResponse.data.generateJobId === "job-456", "expected rebuild API response job id");
assert(rebuildApiResponse.data.selection.profile === "cand-profile", "expected rebuild API response selection");

console.log("[character-routes-action-contract-smoke] PASS");
