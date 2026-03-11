import assert from "node:assert/strict";
import {
  buildMascotReferenceBankReviewPlan,
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
  assert.equal(catDiagnostics.declaredStatus, "species_ready", "cat bank should declare species_ready");
  assert.equal(catDiagnostics.statusMismatch, false, "cat bank should not have a readiness mismatch");
  assert.ok(catDiagnostics.styleCount > 0, "cat bank should include style refs");
  assert.ok(catDiagnostics.heroCount > 0, "cat bank should include hero refs");
  assert.equal(catDiagnostics.requiredAssetCount, 0, "cat bank should not declare missing required assets");
  assert.equal(catRequirementStatuses.length, 0, "cat bank should not expose pending requirement statuses");
  assert.deepEqual(catDiagnostics.missingRoles, [], "cat bank should not miss required roles");
  assert.equal(catReviewPlan.reviewOnly, false, "cat bank should not require review-only proposal mode");
  assert.deepEqual(catReviewPlan.requiredManualSlots, [], "cat bank should not require manual pack slots");
  assert.ok(resolveMascotStyleReferenceAsset("cat"), "cat style reference should resolve");
  expectCompositionAcrossViews("cat");

  for (const speciesId of ["dog", "wolf"] as const) {
    const diagnostics = resolveMascotReferenceBankDiagnostics(speciesId);
    const reviewPlan = buildMascotReferenceBankReviewPlan(diagnostics);
    const requirementStatuses = resolveMascotReferenceRequirementStatuses(speciesId);
    assert.equal(diagnostics.status, "scaffold_only", `${speciesId} bank should stay scaffold_only`);
    assert.equal(diagnostics.declaredStatus, "scaffold_only", `${speciesId} bank should declare scaffold_only`);
    assert.equal(diagnostics.statusMismatch, false, `${speciesId} should not have a readiness mismatch while scaffold_only`);
    assert.equal(diagnostics.styleCount, 0, `${speciesId} bank should not have style refs yet`);
    assert.equal(diagnostics.heroCount, 0, `${speciesId} bank should not have hero refs yet`);
    assert.ok(diagnostics.requiredAssetCount >= 5, `${speciesId} bank should declare required intake assets`);
    assert.equal(
      diagnostics.unsatisfiedRequiredAssetCount,
      diagnostics.requiredAssetCount,
      `${speciesId} should have all intake slots unsatisfied before assets land`
    );
    assert.ok(diagnostics.requiredAssetSlots.includes("style.front.primary"), `${speciesId} should require style front asset`);
    assert.ok(
      diagnostics.requiredAssetSlots.includes("family.threeQuarter.primary"),
      `${speciesId} should require three-quarter family composition asset`
    );
    assert.ok(diagnostics.requiredAssetSlots.includes("hero.front.primary"), `${speciesId} should require hero front asset`);
    assert.ok(requirementStatuses.every((entry) => entry.satisfied === false), `${speciesId} requirement statuses should start unsatisfied`);
    assert.ok(diagnostics.missingRoles.includes("style"), `${speciesId} bank should report missing style role`);
    assert.ok(diagnostics.missingRoles.includes("hero"), `${speciesId} bank should report missing hero role`);
    assert.equal(reviewPlan.reviewOnly, true, `${speciesId} bank should force review-only proposal mode`);
    assert.ok(reviewPlan.requiredManualSlots.includes("head_front_neutral"), `${speciesId} should review front head slot`);
    assert.ok(reviewPlan.requiredManualSlots.includes("torso_profile_neutral"), `${speciesId} should review profile torso slot`);
    assert.ok(reviewPlan.requiredManualSlots.includes("mouth_round_o"), `${speciesId} should review viseme slots`);
    assert.equal(resolveMascotStyleReferenceAsset(speciesId), null, `${speciesId} style reference should not resolve`);
    expectCompositionAcrossViews(speciesId);

    const manifest = resolveMascotReferenceBankManifest(speciesId);
    assert.equal(manifest?.extends?.endsWith("../shared/bank.json"), true, `${speciesId} should inherit shared bank`);
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
