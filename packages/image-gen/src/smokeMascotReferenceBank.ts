import assert from "node:assert/strict";
import path from "node:path";
import {
  buildMascotReferenceBankReviewPlan,
  canUseApprovedMascotSideCanonAnchors,
  canUseMascotReferenceBankForProduction,
  resolveEffectiveMascotReferenceBankStatus,
  resolveMascotCompositionReferenceAsset,
  resolveMascotReferenceBankDiagnostics,
  resolveMascotReferenceBankManifest,
  resolveMascotReferenceRequirementStatuses,
  resolveMascotStyleReferenceAsset
} from "./mascotReferenceBank";

function expectCompositionAcrossViews(speciesId: "cat" | "dog" | "wolf"): void {
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const asset = resolveMascotCompositionReferenceAsset(speciesId, view);
    assert.ok(asset, `expected composition reference for species=${speciesId} view=${view}`);
  }
}

function run(): void {
  const catDiagnostics = resolveMascotReferenceBankDiagnostics("cat");
  const catReviewPlan = buildMascotReferenceBankReviewPlan(catDiagnostics);
  const catRequirementStatuses = resolveMascotReferenceRequirementStatuses("cat");
  assert.equal(catDiagnostics.status, "species_ready", "cat bank should be species_ready");
  assert.equal(catDiagnostics.familyId, "feline_compact_doodle_v1", "cat bank should resolve feline family");
  assert.equal(catDiagnostics.canonStage, "species_ready", "cat bank should be fully promoted");
  assert.equal(catDiagnostics.qualityStatus, "approved", "cat bank should be quality-approved");
  assert.equal(catDiagnostics.declaredStatus, "species_ready", "cat bank should declare species_ready");
  assert.equal(catDiagnostics.statusMismatch, false, "cat bank should not have a readiness mismatch");
  assert.equal(catDiagnostics.variant, "canonical", "cat bank should resolve canonical variant");
  assert.ok(catDiagnostics.styleCount >= 2, "cat bank should include both style and body canon refs");
  assert.ok(catDiagnostics.heroCount > 0, "cat bank should include hero refs");
  assert.equal(catDiagnostics.requiredAssetCount, 0, "cat bank should not declare missing required assets");
  assert.equal(catRequirementStatuses.length, 0, "cat bank should not expose pending requirement statuses");
  assert.deepEqual(catDiagnostics.missingRoles, [], "cat bank should not miss required roles");
  assert.equal(catReviewPlan.reviewOnly, false, "cat bank should not require review-only proposal mode");
  assert.deepEqual(catReviewPlan.requiredManualSlots, [], "cat bank should not require manual pack slots");
  assert.ok(resolveMascotStyleReferenceAsset("cat"), "cat style reference should resolve");
  expectCompositionAcrossViews("cat");
  const catManifest = resolveMascotReferenceBankManifest("cat");
  assert.equal(catManifest?.variant, "canonical", "cat manifest should declare canonical variant");
  assert.equal(catManifest?.style?.[1]?.path?.endsWith("body_proportion_sheet.png"), true, "cat bank should normalize the body proportion support ref");
  assert.equal(catManifest?.familyByView?.front?.[0]?.path?.endsWith("front_composition.png"), true, "cat bank should own front family composition");
  assert.equal(
    catManifest?.familyByView?.threeQuarter?.[0]?.path?.endsWith("threeQuarter_composition.png"),
    true,
    "cat bank should own three-quarter family composition"
  );
  assert.equal(catManifest?.familyByView?.profile?.[0]?.path?.endsWith("profile_composition.png"), true, "cat bank should own profile family composition");
  assert.equal(catManifest?.heroByView?.front?.[0]?.path?.endsWith("hero_face_detail.png"), true, "cat bank should normalize hero ref path");

  for (const speciesId of ["dog", "wolf"] as const) {
    const expectedLegacyTemporary = false;
    const diagnostics = resolveMascotReferenceBankDiagnostics(speciesId);
    const reviewPlan = buildMascotReferenceBankReviewPlan(diagnostics);
    const requirementStatuses = resolveMascotReferenceRequirementStatuses(speciesId);
    assert.equal(diagnostics.status, "species_ready", `${speciesId} bank should now resolve species_ready`);
    assert.equal(diagnostics.familyId, "canine_compact_doodle_v1", `${speciesId} should resolve canine family`);
    assert.equal(diagnostics.canonStage, "species_ready", `${speciesId} canonical bank should remain species_ready`);
    assert.equal(diagnostics.declaredStatus, "species_ready", `${speciesId} bank should declare species_ready`);
    assert.equal(diagnostics.statusMismatch, false, `${speciesId} should not have a readiness mismatch while species_ready`);
    assert.equal(diagnostics.variant, "canonical", `${speciesId} smoke should default to canonical bank`);
    assert.equal(
      diagnostics.qualityStatus,
      speciesId === "dog" ? "review_needed" : "approved",
      `${speciesId} canonical quality status should reflect current side-view approval state`
    );
    assert.equal(
      diagnostics.legacyTemporary,
      expectedLegacyTemporary,
      `${speciesId} canonical legacy-temporary state should match promotion status`
    );
    assert.ok(diagnostics.styleCount > 0, `${speciesId} bank should now include style refs`);
    assert.ok(diagnostics.heroCount > 0, `${speciesId} bank should now include hero refs`);
    assert.ok(diagnostics.requiredAssetCount >= 5, `${speciesId} bank should still declare required intake assets`);
    assert.equal(
      diagnostics.unsatisfiedRequiredAssetCount,
      0,
      `${speciesId} should satisfy all required intake slots now`
    );
    assert.ok(diagnostics.requiredAssetSlots.includes("style.front.primary"), `${speciesId} should require style front asset`);
    assert.ok(
      diagnostics.requiredAssetSlots.includes("family.threeQuarter.primary"),
      `${speciesId} should require three-quarter family composition asset`
    );
    assert.ok(diagnostics.requiredAssetSlots.includes("hero.front.primary"), `${speciesId} should require hero front asset`);
    assert.ok(requirementStatuses.every((entry) => entry.satisfied === true), `${speciesId} requirement statuses should now be satisfied`);
    assert.deepEqual(diagnostics.missingRoles, [], `${speciesId} bank should not report missing roles now`);
    assert.equal(reviewPlan.reviewOnly, false, `${speciesId} bank should no longer force review-only proposal mode`);
    assert.deepEqual(reviewPlan.requiredManualSlots, [], `${speciesId} bank should not require manual pack slots now`);
    assert.ok(
      diagnostics.notes.some((entry) => entry.includes(expectedLegacyTemporary ? "temporary" : "promoted")),
      `${speciesId} bank notes should reflect canonical provenance`
    );
    assert.ok(resolveMascotStyleReferenceAsset(speciesId), `${speciesId} style reference should resolve`);
    expectCompositionAcrossViews(speciesId);

    const manifest = resolveMascotReferenceBankManifest(speciesId);
    assert.equal(manifest?.extends?.endsWith("../shared/bank.json"), true, `${speciesId} should inherit shared bank`);
    assert.equal(
      manifest?.legacyTemporary,
      expectedLegacyTemporary,
      `${speciesId} manifest legacy-temporary state should match promotion status`
    );
    if (speciesId === "dog") {
      assert.equal(
        canUseApprovedMascotSideCanonAnchors(manifest),
        false,
        "dog canonical manifest should keep side canon anchors disabled until family visual QC passes again"
      );
    }
  }

  const previousCandidateEnv = process.env.MASCOT_REFERENCE_BANK_CANDIDATES;
  const previousAllowReviewEnv = process.env.MASCOT_REFERENCE_BANK_ALLOW_REVIEW_CANDIDATES;
  try {
    process.env.MASCOT_REFERENCE_BANK_CANDIDATES = "dog";
    delete process.env.MASCOT_REFERENCE_BANK_ALLOW_REVIEW_CANDIDATES;
    const dogCandidateDiagnostics = resolveMascotReferenceBankDiagnostics("dog");
    assert.equal(dogCandidateDiagnostics.variant, "candidate", "dog diagnostics should switch to candidate variant when candidate env is active");
    assert.equal(dogCandidateDiagnostics.frontApproved, true, "approved dog candidate should continue to report front approval");
    assert.equal(dogCandidateDiagnostics.productionLocked, true, "dog candidate should stay production-locked while family side QC is pending");
    const dogResolvedStyle = resolveMascotStyleReferenceAsset("dog");
    const dogResolvedFront = resolveMascotCompositionReferenceAsset("dog", "front");
    assert.ok(
      dogResolvedStyle?.filePath.includes(`${path.sep}refs${path.sep}mascots${path.sep}dog${path.sep}style_front_primary.png`),
      "production style resolution should fall back to canonical dog assets while candidate family QC is pending"
    );
    assert.ok(
      dogResolvedFront?.filePath.includes(`${path.sep}refs${path.sep}mascots${path.sep}dog${path.sep}family_front_primary.png`),
      "production front composition should fall back to canonical dog assets while candidate family QC is pending"
    );
    assert.equal(
      canUseMascotReferenceBankForProduction({
        variant: dogCandidateDiagnostics.variant,
        status: dogCandidateDiagnostics.status,
        canonStage: dogCandidateDiagnostics.canonStage,
        qualityStatus: dogCandidateDiagnostics.qualityStatus
      }),
      false,
      "dog candidate bank should not be production-eligible until family visual QC passes"
    );
    const dogCandidateManifest = resolveMascotReferenceBankManifest("dog");
    assert.equal(dogCandidateManifest?.familyViewApproval ?? null, null, "dog candidate should clear family-view approval metadata while side QC is pending");
  } finally {
    if (previousCandidateEnv === undefined) {
      delete process.env.MASCOT_REFERENCE_BANK_CANDIDATES;
    } else {
      process.env.MASCOT_REFERENCE_BANK_CANDIDATES = previousCandidateEnv;
    }
    if (previousAllowReviewEnv === undefined) {
      delete process.env.MASCOT_REFERENCE_BANK_ALLOW_REVIEW_CANDIDATES;
    } else {
      process.env.MASCOT_REFERENCE_BANK_ALLOW_REVIEW_CANDIDATES = previousAllowReviewEnv;
    }
  }

  assert.equal(
    resolveEffectiveMascotReferenceBankStatus({
      declaredStatus: "species_ready",
      styleCount: 1,
      unsatisfiedRequiredAssetCount: 2
    }),
    "scaffold_only",
    "premature species_ready should downgrade to scaffold_only until requirements are satisfied"
  );

  console.log("[mascot-reference-bank.smoke] PASS");
}

run();
