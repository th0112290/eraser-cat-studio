import {
  buildCharacterProposalApplyUiHref,
  buildCharacterRebuildSelectedUiHref
} from "./characterRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectIncludes(haystack: string, needle: string, label: string): void {
  assert(haystack.includes(needle), `[${label}] expected "${needle}" in "${haystack}"`);
}

const proposalApplyHref = buildCharacterProposalApplyUiHref({
  generateJobId: "job-123",
  appliedKinds: ["anchors", "cropBoxes"],
  creationNav: {
    returnTo: "/ui/studio",
    currentObject: "run:job-123",
    focus: "cg-manual-overrides",
    assetId: undefined,
    referenceAssetId: undefined,
    jobId: undefined,
    characterPackId: undefined,
    packId: undefined,
    episodeId: undefined
  }
});
expectIncludes(proposalApplyHref, "/ui/character-generator?", "proposal apply path");
expectIncludes(proposalApplyHref, "jobId=job-123", "proposal apply job id");
expectIncludes(proposalApplyHref, "focus=cg-apply-proposal", "proposal apply focus");
expectIncludes(proposalApplyHref, "currentObject=run%3Ajob-123", "proposal apply current object");
expectIncludes(
  proposalApplyHref,
  "Applied+proposal+anchors+%2B+cropBoxes+to+override+files.",
  "proposal apply message"
);

const proposalApplyRebuildHref = buildCharacterProposalApplyUiHref({
  generateJobId: "job-123",
  rebuiltGenerateJobId: "job-456",
  appliedKinds: ["anchors"],
  creationNav: {
    returnTo: "/ui/studio",
    currentObject: "run:job-123",
    focus: "cg-manual-overrides",
    assetId: undefined,
    referenceAssetId: undefined,
    jobId: undefined,
    characterPackId: undefined,
    packId: undefined,
    episodeId: undefined
  }
});
expectIncludes(proposalApplyRebuildHref, "jobId=job-456", "proposal apply rebuild job id");
expectIncludes(proposalApplyRebuildHref, "focus=cg-apply-proposal", "proposal apply rebuild focus");
expectIncludes(proposalApplyRebuildHref, "currentObject=run%3Ajob-456", "proposal apply rebuild current object");
expectIncludes(
  proposalApplyRebuildHref,
  "Applied+proposal+anchors+and+queued+current-selection+rebuild.",
  "proposal apply rebuild message"
);

const rebuildHref = buildCharacterRebuildSelectedUiHref({
  rebuiltGenerateJobId: "job-789",
  creationNav: {
    returnTo: "/ui/characters",
    currentObject: "run:job-123",
    focus: "cg-apply-proposal",
    assetId: undefined,
    referenceAssetId: undefined,
    jobId: undefined,
    characterPackId: undefined,
    packId: undefined,
    episodeId: undefined
  }
});
expectIncludes(rebuildHref, "jobId=job-789", "rebuild job id");
expectIncludes(rebuildHref, "focus=cg-manual-overrides", "rebuild focus");
expectIncludes(rebuildHref, "currentObject=run%3Ajob-789", "rebuild current object");
expectIncludes(rebuildHref, "Current+selection+rebuild+queued.", "rebuild message");

console.log("[character-routes-ui-action-smoke] PASS");
