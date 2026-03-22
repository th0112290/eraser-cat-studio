import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;

try {
  const { RemoteApiCharacterGenerationProvider } = await import("./remoteApiProvider");

  const requests: Array<{
    url: string;
    method: string;
    contentType?: string | null;
    jsonBody?: Record<string, unknown>;
    formData?: FormData;
  }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const contentType = init?.headers instanceof Headers
      ? init.headers.get("content-type")
      : Array.isArray(init?.headers)
        ? (init?.headers.find(([key]) => key.toLowerCase() === "content-type")?.[1] ?? null)
        : typeof init?.headers === "object" && init?.headers !== null
          ? (init.headers as Record<string, string>)["content-type"] ?? null
          : null;

    const requestRecord: {
      url: string;
      method: string;
      contentType?: string | null;
      jsonBody?: Record<string, unknown>;
      formData?: FormData;
    } = { url, method, contentType };

    if (init?.body instanceof FormData) {
      requestRecord.formData = init.body;
    } else if (typeof init?.body === "string") {
      requestRecord.jsonBody = JSON.parse(init.body) as Record<string, unknown>;
    }

    requests.push(requestRecord);

    if (url.endsWith("/images/generations")) {
      if (String(requestRecord.jsonBody?.prompt).includes("broken remote response")) {
        return new Response(
          JSON.stringify({
            created: 12347,
            data: [{}]
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        );
      }

      return new Response(
        JSON.stringify({
          created: 12345,
          data: [
            { b64_json: Buffer.from("gen-0").toString("base64"), revised_prompt: "gen prompt 0" },
            { b64_json: Buffer.from("gen-1").toString("base64"), revised_prompt: "gen prompt 1" }
          ],
          usage: { input_tokens: 10, output_tokens: 20 }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    if (url.endsWith("/images/edits")) {
      return new Response(
        JSON.stringify({
          created: 12346,
          data: [{ b64_json: Buffer.from("edit-0").toString("base64"), revised_prompt: "edit prompt 0" }],
          usage: { input_tokens: 30, output_tokens: 40 }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;

  const provider = new RemoteApiCharacterGenerationProvider({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "test-key",
    estimatedCostUsdPerImage: 0.12
  });

  const generationResult = await provider.generate({
    mode: "new",
    views: ["front"],
    candidateCount: 2,
    baseSeed: 101,
    speciesId: "cat",
    positivePrompt: "premium rescue cat front",
    negativePrompt: "blurry, extra limbs",
    qualityProfile: {
      id: "premium_remote",
      label: "Premium Remote",
      targetStyle: "2d mascot",
      qualityTier: "production",
      width: 1024,
      height: 1024
    }
  });

  assert.equal(generationResult.provider, "remoteApi");
  assert.equal(generationResult.candidates.length, 2);
  assert.equal(generationResult.callLogs.length, 2);
  assert.equal(generationResult.candidates[0]?.providerMeta?.requestMode, "generate");
  assert.equal(requests[0]?.url, "https://api.openai.com/v1/images/generations");
  assert.equal(requests[0]?.jsonBody?.model, process.env.IMAGEGEN_REMOTE_MODEL?.trim() || "gpt-image-1");
  assert.equal(requests[0]?.jsonBody?.n, 2);
  assert.match(String(requests[0]?.jsonBody?.prompt), /Avoid: blurry, extra limbs/);

  const editResult = await provider.generate({
    mode: "reference",
    views: ["front"],
    candidateCount: 1,
    baseSeed: 202,
    speciesId: "dog",
    positivePrompt: "premium rescue dog front",
    negativePrompt: "text, watermark",
    referenceImageBase64: Buffer.from("reference-image").toString("base64"),
    repairMaskImageBase64: Buffer.from("mask-image").toString("base64"),
    qualityProfile: {
      id: "premium_remote_edit",
      label: "Premium Remote Edit",
      targetStyle: "2d mascot",
      qualityTier: "quality",
      width: 1024,
      height: 1024
    }
  });

  assert.equal(editResult.provider, "remoteApi");
  assert.equal(editResult.candidates.length, 1);
  assert.equal(editResult.callLogs.length, 1);
  assert.equal(editResult.candidates[0]?.providerMeta?.requestMode, "edit");
  assert.equal(requests[1]?.url, "https://api.openai.com/v1/images/edits");
  assert.ok(requests[1]?.formData instanceof FormData);
  assert.equal(requests[1]?.formData?.get("model"), process.env.IMAGEGEN_REMOTE_MODEL?.trim() || "gpt-image-1");
  assert.equal(requests[1]?.formData?.get("n"), "1");
  assert.equal(requests[1]?.formData?.get("response_format"), "b64_json");
  assert.ok(requests[1]?.formData?.get("image") instanceof File);
  assert.ok(requests[1]?.formData?.get("mask") instanceof File);

  await assert.rejects(
    () =>
      provider.generate({
        mode: "new",
        views: ["front"],
        candidateCount: 1,
        baseSeed: 303,
        speciesId: "cat",
        positivePrompt: "broken remote response",
        negativePrompt: "artifact",
        qualityProfile: {
          id: "premium_remote_broken",
          label: "Premium Remote Broken",
          targetStyle: "2d mascot",
          qualityTier: "quality",
          width: 1024,
          height: 1024
        }
      }),
    /missing b64_json/i
  );

  console.log("remoteApiProvider.smoke: ok");
} finally {
  globalThis.fetch = originalFetch;
}
