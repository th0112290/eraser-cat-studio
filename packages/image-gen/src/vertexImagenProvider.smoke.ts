import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;

try {
  const { VertexImagenCharacterGenerationProvider } = await import("./vertexImagenProvider");

  const requests: Array<{
    url: string;
    method: string;
    jsonBody?: Record<string, unknown>;
  }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const jsonBody =
      typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    requests.push({ url, method, jsonBody });

    const instances = Array.isArray(jsonBody?.instances) ? (jsonBody.instances as Array<Record<string, unknown>>) : [];
    const firstInstance = instances[0] ?? {};

    if (Array.isArray(firstInstance.referenceImages)) {
      return new Response(
        JSON.stringify({
          predictions: [
            {
              bytesBase64Encoded: Buffer.from("vertex-edit-0").toString("base64"),
              mimeType: "image/png",
              prompt: "edited prompt"
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (String(firstInstance.prompt).includes("broken vertex response")) {
      return new Response(JSON.stringify({ predictions: [{}] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(
      JSON.stringify({
        predictions: [
          {
            bytesBase64Encoded: Buffer.from("vertex-gen-0").toString("base64"),
            mimeType: "image/png",
            prompt: "generated prompt 0"
          },
          {
            bytesBase64Encoded: Buffer.from("vertex-gen-1").toString("base64"),
            mimeType: "image/png",
            prompt: "generated prompt 1"
          }
        ]
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const provider = new VertexImagenCharacterGenerationProvider({
    projectId: "demo-project",
    location: "us-central1",
    model: "imagen-3.0-capability-001",
    accessToken: "ya29.test"
  });

  const generationResult = await provider.generate({
    mode: "new",
    views: ["front"],
    candidateCount: 2,
    baseSeed: 404,
    speciesId: "cat",
    positivePrompt: "vertex rescue cat front",
    negativePrompt: "blurry, extra limbs",
    qualityProfile: {
      id: "vertex_generate",
      label: "Vertex Generate",
      targetStyle: "2d mascot",
      qualityTier: "production",
      width: 1024,
      height: 1024
    }
  });

  assert.equal(generationResult.provider, "vertexImagen");
  assert.equal(generationResult.candidates.length, 2);
  assert.equal(generationResult.callLogs.length, 2);
  assert.match(
    requests[0]?.url ?? "",
    /https:\/\/us-central1-aiplatform\.googleapis\.com\/v1\/projects\/demo-project\/locations\/us-central1\/publishers\/google\/models\/imagen-3\.0-capability-001:predict/
  );
  assert.equal(
    (requests[0]?.jsonBody?.parameters as Record<string, unknown> | undefined)?.sampleCount,
    2
  );
  assert.equal(
    (requests[0]?.jsonBody?.parameters as Record<string, unknown> | undefined)?.aspectRatio,
    "1:1"
  );

  const editResult = await provider.generate({
    mode: "reference",
    views: ["front"],
    candidateCount: 1,
    baseSeed: 505,
    speciesId: "dog",
    positivePrompt: "vertex rescue dog front",
    negativePrompt: "text, watermark",
    referenceImageBase64: Buffer.from("vertex-reference").toString("base64"),
    repairMaskImageBase64: Buffer.from("vertex-mask").toString("base64"),
    qualityProfile: {
      id: "vertex_edit",
      label: "Vertex Edit",
      targetStyle: "2d mascot",
      qualityTier: "quality",
      width: 1024,
      height: 1024
    }
  });

  assert.equal(editResult.provider, "vertexImagen");
  assert.equal(editResult.candidates.length, 1);
  assert.equal(editResult.callLogs.length, 1);
  const editParameters = requests[1]?.jsonBody?.parameters as Record<string, unknown> | undefined;
  const editInstance = Array.isArray(requests[1]?.jsonBody?.instances)
    ? ((requests[1]?.jsonBody?.instances as Array<Record<string, unknown>>)[0] ?? {})
    : {};
  assert.equal(editParameters?.editMode, "EDIT_MODE_INPAINT_INSERTION");
  assert.equal(editParameters?.sampleCount, 1);
  assert.ok(Array.isArray(editInstance.referenceImages));
  assert.equal((editInstance.referenceImages as Array<unknown>).length, 2);

  await assert.rejects(
    () =>
      provider.generate({
        mode: "new",
        views: ["front"],
        candidateCount: 1,
        baseSeed: 606,
        speciesId: "cat",
        positivePrompt: "broken vertex response",
        negativePrompt: "artifact",
        qualityProfile: {
          id: "vertex_broken",
          label: "Vertex Broken",
          targetStyle: "2d mascot",
          qualityTier: "quality",
          width: 1024,
          height: 1024
        }
      }),
    /missing bytesBase64Encoded/i
  );

  console.log("vertexImagenProvider.smoke: ok");
} finally {
  globalThis.fetch = originalFetch;
}
