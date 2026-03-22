import assert from "node:assert/strict";
import { buildMascotBankPromptBundle } from "./prompt";

function countOccurrences(text: string, needle: string): number {
  const match = text.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"));
  return match?.length ?? 0;
}

function run(): void {
  const dogFront = buildMascotBankPromptBundle({
    presetId: "mascot-bank-canon-premium",
    speciesId: "dog",
    view: "front",
    stage: "front_master",
    positiveTokens: ["approved front master bank seed", "strict front view"]
  });
  const dogProfile = buildMascotBankPromptBundle({
    presetId: "mascot-bank-canon-premium",
    speciesId: "dog",
    view: "profile",
    stage: "reference_derivation",
    positiveTokens: ["profile composition anchor", "one-eye side profile only"]
  });
  const wolfFront = buildMascotBankPromptBundle({
    presetId: "mascot-bank-canon-premium",
    speciesId: "wolf",
    view: "front",
    stage: "front_master",
    positiveTokens: ["approved front master bank seed", "strict front view"]
  });

  assert.ok(dogFront.viewPrompts.front.length < 2200, "dog front bank prompt should stay lean enough for premium generation");
  assert.ok(dogProfile.viewPrompts.profile.length < 2200, "dog profile derivation prompt should stay lean enough for premium edits");
  assert.ok(dogFront.negativePrompt.length < 1600, "dog bank negative prompt should stay lean");
  assert.equal(
    countOccurrences(dogFront.viewPrompts.front, "same mascot across all angles"),
    0,
    "bank front prompt should not duplicate global identity phrases"
  );
  assert.match(dogFront.viewPrompts.front, /short blunt muzzle/i, "dog front prompt should prefer blunt muzzle language");
  assert.doesNotMatch(dogProfile.viewPrompts.profile, /domestic and cute/i, "dog profile prompt should avoid cute drift wording");
  assert.doesNotMatch(wolfFront.viewPrompts.front, /alert cute wolf silhouette/i, "wolf front prompt should avoid cute drift wording");
  assert.match(dogFront.negativePrompt, /3d render/i, "bank negative prompt should explicitly reject 3d drift");

  console.log("[mascot-bank-prompt.smoke] PASS");
}

run();
