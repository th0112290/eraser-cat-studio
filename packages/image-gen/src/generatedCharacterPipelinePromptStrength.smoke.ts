import assert from "node:assert/strict";
import {
  expressionGenerationNegativePrompt,
  expressionPrompt,
  resolveInitialEditDenoise,
  visemeGenerationNegativePrompt,
  visemePrompt
} from "./generatedCharacterPipeline";

const happyPrompt = expressionPrompt("happy", "dog");
assert.match(happyPrompt, /broad visible smile/i, "happy prompt should require a broad visible smile");
assert.match(happyPrompt, /thumbnail size/i, "happy prompt should preserve thumbnail readability pressure");
assert.match(
  happyPrompt,
  /unmistakably different from neutral/i,
  "happy prompt should force stronger separation from neutral"
);

const blinkPrompt = expressionPrompt("blink", "wolf");
assert.match(blinkPrompt, /thick visible lid lines/i, "blink prompt should force clearly readable closed eyes");

const smallOpenPrompt = visemePrompt("mouth_open_small", "dog");
assert.match(smallOpenPrompt, /clearly visible dark opening/i, "small-open viseme should force a visible mouth opening");
assert.match(smallOpenPrompt, /must not read as closed/i, "small-open viseme should forbid closed-mouth drift");
assert.match(smallOpenPrompt, /thumbnail size/i, "small-open viseme should preserve thumbnail readability pressure");

const roundOPrompt = visemePrompt("mouth_round_o", "wolf");
assert.match(roundOPrompt, /strong O shape/i, "round-O viseme should force a stronger O read");

const expressionNegative = expressionGenerationNegativePrompt("busy background");
assert.match(expressionNegative, /same face as neutral/i, "expression generation negative prompt should reject neutral drift");

const visemeNegative = visemeGenerationNegativePrompt("busy background");
assert.match(visemeNegative, /same mouth as mouth closed/i, "viseme generation negative prompt should reject closed-mouth drift");

assert.equal(resolveInitialEditDenoise("view", undefined), 0.32, "view edits should keep the baseline edit denoise");
assert.equal(resolveInitialEditDenoise("expression", undefined), 0.38, "expression edits should start with a stronger denoise floor");
assert.equal(resolveInitialEditDenoise("viseme", undefined), 0.48, "viseme edits should start with the strongest denoise floor");
assert.equal(resolveInitialEditDenoise("expression", 0.46), 0.46, "explicit higher expression denoise should be preserved");
assert.equal(resolveInitialEditDenoise("viseme", 0.35), 0.48, "viseme edits should clamp weak denoise requests upward");

console.log("generatedCharacterPipelinePromptStrength.smoke: ok");
