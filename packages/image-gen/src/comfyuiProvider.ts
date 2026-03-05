import { hashWorkflowIdentity } from "./prompt";
import type {
  CharacterGenerationCandidate,
  CharacterGenerationProvider,
  CharacterGenerationProviderResult,
  CharacterProviderGenerateInput,
  CharacterView
} from "./types";

type ComfyUiResponse = {
  imageBase64?: string;
  mimeType?: string;
  seed?: number;
  workflowHash?: string;
  meta?: Record<string, unknown>;
};

function assertComfyUrl(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error("COMFYUI_URL is required for comfyui provider");
  }

  return value.trim().replace(/\/+$/, "");
}

function toIntSeed(baseSeed: number, view: CharacterView, candidateIndex: number): number {
  const text = `${baseSeed}:${view}:${candidateIndex}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash >>> 0);
}

async function postComfyRequest(url: string, payload: Record<string, unknown>): Promise<ComfyUiResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ComfyUI request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  return (await response.json()) as ComfyUiResponse;
}

export class ComfyUiCharacterGenerationProvider implements CharacterGenerationProvider {
  readonly name = "comfyui" as const;
  readonly #baseUrl: string;

  constructor(baseUrl: string | undefined) {
    this.#baseUrl = assertComfyUrl(baseUrl);
  }

  async generate(input: CharacterProviderGenerateInput): Promise<CharacterGenerationProviderResult> {
    const endpoint = `${this.#baseUrl}/api/generate-character-view`;
    const views = input.views.length > 0 ? input.views : (["front", "threeQuarter", "profile"] as const);
    const candidates: CharacterGenerationCandidate[] = [];
    let workflowHash: string | undefined;

    for (const view of views) {
      for (let index = 0; index < input.candidateCount; index += 1) {
        const seed = toIntSeed(input.baseSeed, view, index);
        const response = await postComfyRequest(endpoint, {
          mode: input.mode,
          view,
          seed,
          prompt: input.positivePrompt,
          negativePrompt: input.negativePrompt,
          referenceImageBase64: input.referenceImageBase64,
          referenceMimeType: input.referenceMimeType
        });

        if (!response.imageBase64) {
          throw new Error("ComfyUI response missing imageBase64");
        }

        const mimeType = response.mimeType?.trim() || "image/png";
        const buffer = Buffer.from(response.imageBase64, "base64");
        if (buffer.byteLength === 0) {
          throw new Error("ComfyUI returned empty image buffer");
        }

        workflowHash = response.workflowHash ?? workflowHash;

        candidates.push({
          id: `comfyui_${view}_${index}_${response.seed ?? seed}`,
          view,
          candidateIndex: index,
          seed: response.seed ?? seed,
          provider: "comfyui",
          prompt: input.positivePrompt,
          negativePrompt: input.negativePrompt,
          mimeType,
          data: buffer,
          providerMeta: response.meta
        });
      }
    }

    return {
      provider: "comfyui",
      workflowHash:
        workflowHash ??
        hashWorkflowIdentity({
          provider: "comfyui",
          presetId: "comfyui",
          positivePrompt: input.positivePrompt,
          negativePrompt: input.negativePrompt
        }),
      generatedAt: new Date().toISOString(),
      callLogs: [],
      candidates
    };
  }
}
