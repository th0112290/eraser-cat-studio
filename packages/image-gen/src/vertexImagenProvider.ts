import { hashWorkflowIdentity } from "./prompt";
import type {
  CharacterGenerationCandidate,
  CharacterGenerationProvider,
  CharacterGenerationProviderResult,
  CharacterProviderCallLog,
  CharacterProviderGenerateInput,
  CharacterReferenceBankEntry,
  CharacterStructureControlImage,
  CharacterStructureControlKind,
  CharacterView,
  PromptQualityProfile
} from "./types";

const DEFAULT_VERTEX_TIMEOUT_MS = 120_000;
const DEFAULT_VERTEX_LOCATION = process.env.IMAGEGEN_VERTEX_LOCATION?.trim() || "us-central1";
const DEFAULT_VERTEX_MODEL = process.env.IMAGEGEN_VERTEX_MODEL?.trim() || "imagen-3.0-capability-001";

type VertexImagenProviderConfig = {
  projectId?: string;
  location?: string;
  model?: string;
  accessToken?: string;
  timeoutMs?: number;
  maxRetries?: number;
  estimatedCostUsdPerImage?: number;
  outputFormat?: string;
  aspectRatio?: string;
};

type VertexImagenPrediction = {
  bytesBase64Encoded?: string;
  mimeType?: string;
  prompt?: string;
  raiFilteredReason?: string;
  safetyAttributes?: unknown;
};

type VertexImagenResponse = {
  predictions?: VertexImagenPrediction[];
};

type VertexImagenRequestContext = {
  view: CharacterView;
  prompt: string;
  candidateCount: number;
  referenceImage?: {
    base64: string;
    mimeType?: string;
    source: "input" | "reference_bank";
  };
  repairMask?: {
    base64: string;
    mimeType?: string;
  };
};

type VertexImagenRequestError = Error & { statusCode?: number };

function assertProjectId(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error("IMAGEGEN_VERTEX_PROJECT_ID is required for vertexImagen provider");
  }
  return value.trim();
}

function assertAccessToken(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error("IMAGEGEN_VERTEX_ACCESS_TOKEN is required for vertexImagen provider");
  }
  return value.trim();
}

function toIntSeed(baseSeed: number, view: CharacterView, candidateIndex: number): number {
  const text = `${baseSeed}:${view}:${candidateIndex}`;
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash >>> 0);
}

function mimeTypeForOutputFormat(format: string): string {
  const normalized = format.trim().toLowerCase();
  if (normalized === "jpg" || normalized === "jpeg") {
    return "image/jpeg";
  }
  if (normalized === "webp") {
    return "image/webp";
  }
  return "image/png";
}

function buildAspectRatio(profile: PromptQualityProfile | undefined): string | undefined {
  if (!profile?.width || !profile?.height || profile.width <= 0 || profile.height <= 0) {
    return undefined;
  }
  const width = profile.width;
  const height = profile.height;
  const ratio = width / height;
  const options = [
    { label: "1:1", ratio: 1 },
    { label: "3:4", ratio: 3 / 4 },
    { label: "4:3", ratio: 4 / 3 },
    { label: "16:9", ratio: 16 / 9 },
    { label: "9:16", ratio: 9 / 16 }
  ];
  options.sort((left, right) => Math.abs(left.ratio - ratio) - Math.abs(right.ratio - ratio));
  return options[0]?.label;
}

function combinePrompt(positivePrompt: string, negativePrompt: string): string {
  const negative = negativePrompt.trim();
  if (!negative) {
    return positivePrompt;
  }
  return `${positivePrompt}\n\nAvoid: ${negative}`;
}

function summarizeReferenceBank(entries: CharacterReferenceBankEntry[] | undefined) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  return entries.map((entry, index) => ({
    id: entry.id ?? `ref_${index}`,
    role: entry.role,
    ...(entry.view ? { view: entry.view } : {}),
    ...(typeof entry.weight === "number" ? { weight: entry.weight } : {}),
    ...(entry.note ? { note: entry.note } : {})
  }));
}

function summarizeStructureControls(
  entries:
    | Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>>
    | undefined
) {
  if (!entries || Object.keys(entries).length === 0) {
    return [];
  }

  return Object.entries(entries).flatMap(([kind, entry]) => {
    if (!entry || typeof entry.imageBase64 !== "string" || entry.imageBase64.trim().length === 0) {
      return [];
    }
    return [{
      type: kind as CharacterStructureControlKind,
      ...(typeof entry.strength === "number" ? { strength: entry.strength } : {}),
      ...(typeof entry.startPercent === "number" ? { startPercent: entry.startPercent } : {}),
      ...(typeof entry.endPercent === "number" ? { endPercent: entry.endPercent } : {}),
      ...(entry.sourceRole ? { sourceRole: entry.sourceRole } : {}),
      ...(entry.sourceRefId ? { sourceRefId: entry.sourceRefId } : {}),
      ...(entry.sourceView ? { sourceView: entry.sourceView } : {}),
      ...(entry.note ? { note: entry.note } : {})
    }];
  });
}

function resolvePrimaryReference(
  input: CharacterProviderGenerateInput,
  view: CharacterView
): VertexImagenRequestContext["referenceImage"] | undefined {
  const directBase64 = input.referenceImageBase64ByView?.[view] ?? input.referenceImageBase64;
  const directMimeType = input.referenceMimeTypeByView?.[view] ?? input.referenceMimeType;
  if (typeof directBase64 === "string" && directBase64.trim().length > 0) {
    return {
      base64: directBase64,
      mimeType: directMimeType,
      source: "input"
    };
  }

  const bankEntries = input.referenceBankByView?.[view] ?? input.referenceBank;
  if (Array.isArray(bankEntries) && bankEntries.length > 0) {
    const first = bankEntries[0];
    if (typeof first.imageBase64 === "string" && first.imageBase64.trim().length > 0) {
      return {
        base64: first.imageBase64,
        mimeType: first.mimeType,
        source: "reference_bank"
      };
    }
  }

  return undefined;
}

function resolveRepairMask(
  input: CharacterProviderGenerateInput,
  view: CharacterView
): VertexImagenRequestContext["repairMask"] | undefined {
  const base64 = input.repairMaskImageBase64ByView?.[view] ?? input.repairMaskImageBase64;
  if (typeof base64 !== "string" || base64.trim().length === 0) {
    return undefined;
  }

  return {
    base64,
    mimeType: input.repairMaskMimeTypeByView?.[view] ?? input.repairMaskMimeType
  };
}

function buildRequestContext(
  input: CharacterProviderGenerateInput,
  view: CharacterView
): VertexImagenRequestContext {
  return {
    view,
    candidateCount: input.candidateCount,
    prompt: combinePrompt(input.viewPrompts?.[view] ?? input.positivePrompt, input.negativePrompt),
    referenceImage: resolvePrimaryReference(input, view),
    repairMask: resolveRepairMask(input, view)
  };
}

function parseJsonResponse(text: string): VertexImagenResponse {
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text) as VertexImagenResponse;
}

function makeRequestError(message: string, statusCode?: number): VertexImagenRequestError {
  const error = new Error(message) as VertexImagenRequestError;
  if (statusCode !== undefined) {
    error.statusCode = statusCode;
  }
  return error;
}

function shouldRetry(error: { statusCode?: number } | null | undefined): boolean {
  const statusCode = error?.statusCode;
  if (statusCode === undefined) {
    return true;
  }
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

export class VertexImagenCharacterGenerationProvider implements CharacterGenerationProvider {
  readonly name = "vertexImagen" as const;
  readonly #projectId: string;
  readonly #location: string;
  readonly #model: string;
  readonly #accessToken: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #estimatedCostUsdPerImage: number;
  readonly #outputFormat: string;
  readonly #aspectRatio?: string;

  constructor(config: VertexImagenProviderConfig | undefined) {
    this.#projectId = assertProjectId(config?.projectId);
    this.#location = config?.location?.trim() || DEFAULT_VERTEX_LOCATION;
    this.#model = config?.model?.trim() || DEFAULT_VERTEX_MODEL;
    this.#accessToken = assertAccessToken(config?.accessToken);
    this.#timeoutMs =
      Number.isInteger(config?.timeoutMs) && (config?.timeoutMs ?? 0) > 0
        ? (config?.timeoutMs as number)
        : DEFAULT_VERTEX_TIMEOUT_MS;
    this.#maxRetries =
      Number.isInteger(config?.maxRetries) && (config?.maxRetries ?? 0) >= 0
        ? (config?.maxRetries as number)
        : 0;
    this.#estimatedCostUsdPerImage =
      typeof config?.estimatedCostUsdPerImage === "number" && Number.isFinite(config.estimatedCostUsdPerImage)
        ? config.estimatedCostUsdPerImage
        : 0;
    this.#outputFormat = config?.outputFormat?.trim() || "png";
    this.#aspectRatio = config?.aspectRatio?.trim() || undefined;
  }

  async generate(input: CharacterProviderGenerateInput): Promise<CharacterGenerationProviderResult> {
    const views = input.views.length > 0 ? input.views : (["front", "threeQuarter", "profile"] as const);
    const candidates: CharacterGenerationCandidate[] = [];
    const callLogs: CharacterProviderCallLog[] = [];
    const warnings = new Set<string>();
    const aspectRatio = this.#aspectRatio ?? buildAspectRatio(input.qualityProfile);

    for (const view of views) {
      const context = buildRequestContext(input, view);
      const usesEdits = Boolean(context.referenceImage);
      if ((input.referenceBankByView?.[view] ?? input.referenceBank)?.length && context.referenceImage?.source === "reference_bank") {
        warnings.add(`vertexImagen used first reference bank asset only for ${view} edits`);
      }
      if (input.structureControlsByView?.[view] && Object.keys(input.structureControlsByView[view] ?? {}).length > 0) {
        warnings.add(`vertexImagen ignored structure controls for ${view}`);
      }

      let response: VertexImagenResponse | null = null;
      const startedAt = Date.now();
      let lastError: VertexImagenRequestError | null = null;

      for (let attempt = 1; attempt <= this.#maxRetries + 1; attempt += 1) {
        try {
          response = await this.#requestImages({
            context,
            negativePrompt: input.negativePrompt,
            aspectRatio,
            seed: input.baseSeed,
            signalTimeoutMs: this.#timeoutMs
          });
          for (let candidateIndex = 0; candidateIndex < input.candidateCount; candidateIndex += 1) {
            callLogs.push({
              provider: "vertexImagen",
              view,
              candidateIndex,
              attempt,
              durationMs: Date.now() - startedAt,
              estimatedCostUsd: this.#estimatedCostUsdPerImage,
              result: "succeeded"
            });
          }
          break;
        } catch (error) {
          const requestError =
            error instanceof Error ? (error as VertexImagenRequestError) : makeRequestError(String(error));
          lastError = requestError;
          for (let candidateIndex = 0; candidateIndex < input.candidateCount; candidateIndex += 1) {
            callLogs.push({
              provider: "vertexImagen",
              view,
              candidateIndex,
              attempt,
              durationMs: Date.now() - startedAt,
              estimatedCostUsd: this.#estimatedCostUsdPerImage,
              result: "failed",
              errorSummary: requestError.message,
              ...(requestError.statusCode !== undefined ? { statusCode: requestError.statusCode } : {})
            });
          }
          if (attempt > this.#maxRetries || !shouldRetry(requestError)) {
            throw requestError;
          }
        }
      }

      if (!response) {
        throw lastError ?? new Error(`Vertex Imagen request failed for ${view}`);
      }
      if (!Array.isArray(response.predictions) || response.predictions.length === 0) {
        throw new Error(`Vertex Imagen response for ${view} did not include predictions`);
      }

      for (const [candidateIndex, item] of response.predictions.entries()) {
        if (typeof item.bytesBase64Encoded !== "string" || item.bytesBase64Encoded.trim().length === 0) {
          throw new Error(`Vertex Imagen candidate ${view}:${candidateIndex} missing bytesBase64Encoded`);
        }
        const buffer = Buffer.from(item.bytesBase64Encoded, "base64");
        if (buffer.byteLength === 0) {
          throw new Error(`Vertex Imagen candidate ${view}:${candidateIndex} returned empty image data`);
        }
        const seed = toIntSeed(input.baseSeed, view, candidateIndex);
        const referenceBank = input.referenceBankByView?.[view] ?? input.referenceBank;
        const structureControls = input.structureControlsByView?.[view];
        candidates.push({
          id: `vertexImagen_${view}_${candidateIndex}_${seed}`,
          view,
          candidateIndex,
          seed,
          provider: "vertexImagen",
          prompt: input.positivePrompt,
          negativePrompt: input.negativePrompt,
          mimeType: item.mimeType?.trim() || mimeTypeForOutputFormat(this.#outputFormat),
          data: buffer,
          providerMeta: {
            model: this.#model,
            endpoint: this.#endpoint,
            requestMode: usesEdits ? "edit" : "generate",
            requestedSeed: seed,
            seedControlled: true,
            revisedPrompt: item.prompt,
            qualityProfileId: input.qualityProfile?.id,
            runSettings: input.qualityProfile,
            workflowStage: input.workflowStage,
            workflowTemplateVersion: input.workflowTemplateVersion,
            stagePlan: input.stagePlan,
            referenceBankSummary: summarizeReferenceBank(referenceBank),
            structureControlsSummary: summarizeStructureControls(structureControls),
            structureControlApplied: false,
            referenceMode: context.referenceImage ? "img2img" : "off",
            viewPrompt: input.viewPrompts?.[view] ?? input.positivePrompt,
            raiFilteredReason: item.raiFilteredReason,
            safetyAttributes: item.safetyAttributes
          }
        });
      }
    }

    return {
      provider: "vertexImagen",
      workflowHash: hashWorkflowIdentity({
        provider: "vertexImagen",
        presetId: input.presetId ?? "vertexImagen",
        positivePrompt: input.positivePrompt,
        negativePrompt: input.negativePrompt,
        qualityProfileId: input.qualityProfile?.id,
        sampler: input.qualityProfile?.sampler,
        scheduler: input.qualityProfile?.scheduler,
        steps: input.qualityProfile?.steps,
        cfg: input.qualityProfile?.cfg,
        width: input.qualityProfile?.width,
        height: input.qualityProfile?.height,
        postprocessPlan: input.qualityProfile?.postprocessPlan,
        workflowStage: input.workflowStage,
        workflowTemplateVersion: input.workflowTemplateVersion,
        referenceBankSummary: summarizeReferenceBank(input.referenceBank),
        structureControlsSummary: Object.values(input.structureControlsByView ?? {}).flatMap((entries) =>
          summarizeStructureControls(entries)
        )
      }),
      generatedAt: new Date().toISOString(),
      callLogs,
      candidates,
      providerMeta: {
        qualityProfileId: input.qualityProfile?.id,
        runSettings: input.qualityProfile,
        workflowStage: input.workflowStage,
        workflowTemplateVersion: input.workflowTemplateVersion,
        stagePlan: input.stagePlan,
        capabilitySnapshot: {
          supportsEdits: true,
          supportsReferenceImage: true,
          supportsMask: true,
          supportsStructureControls: false,
          model: this.#model,
          outputFormat: this.#outputFormat,
          location: this.#location
        },
        warnings: [...warnings]
      }
    };
  }

  get #endpoint(): string {
    return `https://${this.#location}-aiplatform.googleapis.com/v1/projects/${this.#projectId}/locations/${this.#location}/publishers/google/models/${this.#model}:predict`;
  }

  async #requestImages(input: {
    context: VertexImagenRequestContext;
    negativePrompt: string;
    aspectRatio?: string;
    seed: number;
    signalTimeoutMs: number;
  }): Promise<VertexImagenResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.signalTimeoutMs);
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${this.#accessToken}`);
    headers.set("Content-Type", "application/json; charset=utf-8");

    const usesEdits = Boolean(input.context.referenceImage);
    const body = usesEdits
      ? {
          instances: [
            {
              prompt: input.context.prompt,
              referenceImages: [
                {
                  referenceType: "REFERENCE_TYPE_RAW",
                  referenceId: 1,
                  referenceImage: {
                    bytesBase64Encoded: input.context.referenceImage?.base64
                  }
                },
                ...(input.context.repairMask
                  ? [{
                      referenceType: "REFERENCE_TYPE_MASK",
                      referenceId: 2,
                      referenceImage: {
                        bytesBase64Encoded: input.context.repairMask.base64
                      },
                      maskImageConfig: {
                        maskMode: "MASK_MODE_USER_PROVIDED",
                        dilation: 0.01
                      }
                    }]
                  : [])
              ]
            }
          ],
          parameters: {
            editMode: "EDIT_MODE_INPAINT_INSERTION",
            sampleCount: input.context.candidateCount,
            seed: input.seed,
            addWatermark: false,
            ...(input.negativePrompt.trim() ? { negativePrompt: input.negativePrompt.trim() } : {}),
            outputOptions: {
              mimeType: mimeTypeForOutputFormat(this.#outputFormat)
            },
            editConfig: {
              baseSteps: 35
            }
          }
        }
      : {
          instances: [
            {
              prompt: input.context.prompt
            }
          ],
          parameters: {
            sampleCount: input.context.candidateCount,
            seed: input.seed,
            addWatermark: false,
            ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
            ...(input.negativePrompt.trim() ? { negativePrompt: input.negativePrompt.trim() } : {}),
            outputOptions: {
              mimeType: mimeTypeForOutputFormat(this.#outputFormat)
            }
          }
        };

    try {
      const response = await fetch(this.#endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!response.ok) {
        const text = await response.text();
        throw makeRequestError(
          `Vertex Imagen request failed (${response.status}): ${text.slice(0, 300)}`,
          response.status
        );
      }
      return parseJsonResponse(await response.text());
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw makeRequestError(`Vertex Imagen request timed out after ${input.signalTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
