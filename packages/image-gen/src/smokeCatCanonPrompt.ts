import assert from "node:assert/strict";
import { buildCharacterPrompt, listStylePromptPresets, resolveMascotReferenceBankManifest } from "./index";

function run(): void {
  const presets = listStylePromptPresets();
  const preset = presets.find((entry) => entry.id === "eraser-cat-canon-premium");
  assert.ok(preset, "eraser-cat-canon-premium preset should be listed");
  assert.equal(preset?.qualityProfile.id, "eraser_cat_canon_premium_v1", "cat canon preset should expose the premium quality profile");

  const bundle = buildCharacterPrompt({
    mode: "new",
    presetId: "eraser-cat-canon-premium",
    speciesId: "cat"
  });

  assert.equal(bundle.presetId, "eraser-cat-canon-premium", "bundle should preserve the cat canon preset id");
  assert.equal(bundle.referenceBankId, "cat_mascot_bank_v1", "bundle should target the cat mascot reference bank");
  assert.equal(bundle.qualityProfile.id, "eraser_cat_canon_premium_v1", "bundle should use the premium cat quality profile");
  assert.equal(bundle.selectionHints.frontMasterCandidateCount, 8, "premium cat canon should widen front master candidate search");
  assert.equal(bundle.selectionHints.autoRetryRounds, 3, "premium cat canon should allow one extra retry round");
  assert.ok(
    (bundle.selectionHints.frontMasterMinAcceptedScore ?? 0) >= 0.68,
    "premium cat canon should demand a higher front acceptance floor"
  );
  assert.match(bundle.positivePrompt, /rounded-square cat head/i, "positive prompt should reinforce the boxy cat head");
  assert.match(bundle.positivePrompt, /eraser-crumb tail silhouette/i, "positive prompt should reinforce the eraser tail cue");
  assert.match(bundle.positivePrompt, /tiny dot eyes|line-eye/i, "positive prompt should preserve the minimal eye treatment");
  assert.match(bundle.negativePrompt, /human fingers/i, "negative prompt should reject human hands");
  assert.match(bundle.negativePrompt, /detailed pupils/i, "negative prompt should reject detailed pupils");

  const manifest = resolveMascotReferenceBankManifest("cat");
  assert.equal(manifest?.variant, "canonical", "cat mascot bank should resolve as canonical");
  assert.equal(
    manifest?.heroByView?.front?.[0]?.path?.endsWith("hero_face_detail.png"),
    true,
    "cat mascot bank should use the normalized hero face detail path"
  );

  console.log("[cat-canon-prompt.smoke] PASS");
}

run();
