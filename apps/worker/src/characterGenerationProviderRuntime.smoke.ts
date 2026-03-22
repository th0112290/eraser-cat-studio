import assert from "node:assert/strict";
import type { CharacterProviderGenerateInput } from "@ec/image-gen";
import { runProviderGenerateWithFallback } from "./characterGenerationProviderRuntime";

const providerInput: CharacterProviderGenerateInput = {
  mode: "new",
  baseSeed: 1,
  positivePrompt: "smoke",
  negativePrompt: "",
  views: ["front"],
  candidateCount: 1
};

async function main() {
  let threw = false;
  try {
    await runProviderGenerateWithFallback({
      provider: {
        async generate() {
          throw new Error("vertex unavailable");
        }
      },
      providerName: "vertexImagen",
      providerWarning: null,
      strictRealProvider: true,
      providerInput,
      isTransientProviderFailure: () => false,
      errorMessage: (error) => (error instanceof Error ? error.message : String(error))
    });
  } catch (error) {
    threw = true;
    assert.match(String(error), /vertex unavailable/);
  }
  assert.equal(threw, true, "strict real provider should not fall back to mock");

  const fallback = await runProviderGenerateWithFallback({
    provider: {
      async generate() {
        throw new Error("remote unavailable");
      }
    },
    providerName: "remoteApi",
    providerWarning: null,
    strictRealProvider: false,
    providerInput,
    isTransientProviderFailure: () => false,
    errorMessage: (error) => (error instanceof Error ? error.message : String(error))
  });
  assert.equal(fallback.providerName, "mock");
  assert.match(String(fallback.providerWarning), /Falling back to mock provider/);

  console.log("[character-generation-provider-runtime-smoke] PASS");
}

void main();
