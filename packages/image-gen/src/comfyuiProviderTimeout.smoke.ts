import assert from "node:assert/strict";

const originalTimeout = process.env.COMFY_ADAPTER_TIMEOUT_MS;
process.env.COMFY_ADAPTER_TIMEOUT_MS = "25";

const originalFetch = globalThis.fetch;

try {
  const { ComfyUiCharacterGenerationProvider } = await import("./comfyuiProvider");

  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            const error = new Error("aborted");
            (error as Error & { name: string }).name = "AbortError";
            reject(error);
          },
          { once: true }
        );
      }
    })) as typeof fetch;

  const provider = new ComfyUiCharacterGenerationProvider("http://127.0.0.1:65535");
  await assert.rejects(
    () =>
      provider.generate({
        mode: "new",
        views: ["threeQuarter"],
        candidateCount: 1,
        baseSeed: 101,
        speciesId: "dog",
        positivePrompt: "timeout smoke prompt",
        negativePrompt: "text, watermark",
        qualityProfile: {
          id: "timeout_smoke",
          label: "Timeout Smoke",
          targetStyle: "2d mascot",
          qualityTier: "balanced",
          steps: 20,
          cfg: 4.5,
          width: 1024,
          height: 1024
        }
      }),
    /timed out after 25ms/i
  );

  console.log("comfyuiProviderTimeout.smoke: ok");
} finally {
  globalThis.fetch = originalFetch;
  if (originalTimeout === undefined) {
    delete process.env.COMFY_ADAPTER_TIMEOUT_MS;
  } else {
    process.env.COMFY_ADAPTER_TIMEOUT_MS = originalTimeout;
  }
}
