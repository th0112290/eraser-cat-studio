import { hashWorkflowIdentity } from "./prompt";
import type {
  CharacterCandidateProviderMeta,
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

const DEFAULT_REMOTE_TIMEOUT_MS = 120_000;
const DEFAULT_REMOTE_MODEL = process.env.IMAGEGEN_REMOTE_MODEL?.trim() || "gpt-image-1";

type RemoteApiProviderConfig = {
  baseUrl?: string;
  apiKey?: string;
  headerName?: string;
  headerValuePrefix?: string;
  timeoutMs?: number;
  maxRetries?: number;
  estimatedCostUsdPerImage?: number;
  model?: string;
  imageSize?: string;
  quality?: string;
  outputFormat?: string;
};

type RemoteApiResponse = {
  created?: number;
  data?: Array<{
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }>;
  usage?: Record<string, unknown>;
};

type RemoteApiRequestContext = {
  view: CharacterView;
  candidateCount: number;
  prompt: string;
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

function assertBaseUrl(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error("IMAGEGEN_REMOTE_BASE_URL is required for remoteApi provider");
  }
  return value.trim().replace(/\/+$/, "");
}

function assertApiKey(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error("IMAGEGEN_REMOTE_API_KEY is required for remoteApi provider");
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

function decodeBase64Payload(value: string): Buffer {
  const trimmed = value.trim();
  const payload = trimmed.startsWith("data:")
    ? (trimmed.match(/^data:[^;,]+(?:;base64)?,(.*)$/)?.[1] ?? "")
    : trimmed;
  return Buffer.from(payload, "base64");
}

function detectMimeType(value: string | undefined, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

function fileExtensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "png";
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

function buildSize(profile: PromptQualityProfile | undefined): string | undefined {
  if (!profile?.width || !profile?.height || profile.width <= 0 || profile.height <= 0) {
    return undefined;
  }
  return `${Math.round(profile.width)}x${Math.round(profile.height)}`;
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
): RemoteApiRequestContext["referenceImage"] | undefined {
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
): RemoteApiRequestContext["repairMask"] | undefined {
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
): RemoteApiRequestContext {
  return {
    view,
    candidateCount: input.candidateCount,
    prompt: combinePrompt(input.viewPrompts?.[view] ?? input.positivePrompt, input.negativePrompt),
    referenceImage: resolvePrimaryReference(input, view),
    repairMask: resolveRepairMask(input, view)
  };
}

async function buildImageBlob(base64: string, mimeType: string, fileStem: string): Promise<File> {
  const buffer = decodeBase64Payload(base64);
  if (buffer.byteLength === 0) {
    throw new Error(`Remote API upload source ${fileStem} was empty`);
  }
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
  return new File([blob], `${fileStem}.${fileExtensionForMimeType(mimeType)}`, { type: mimeType });
}

function shouldRetry(error: { statusCode?: number } | null | undefined): boolean {
  const statusCode = error?.statusCode;
  if (statusCode === undefined) {
    return true;
  }
  return statusCode === 408 || statusCode === 429 || statusCode >= 500;
}

async function parseJsonResponse(response: Response): Promise<RemoteApiResponse> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text) as RemoteApiResponse;
}

type RemoteApiRequestError = Error & { statusCode?: number };

function makeRequestError(message: string, statusCode?: number): RemoteApiRequestError {
  const error = new Error(message) as RemoteApiRequestError;
  if (statusCode !== undefined) {
    error.statusCode = statusCode;
  }
  return error;
}

export class RemoteApiCharacterGenerationProvider implements CharacterGenerationProvider {
  readonly name = "remoteApi" as const;
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #headerName: string;
  readonly #headerValuePrefix: string;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #estimatedCostUsdPerImage: number;
  readonly #model: string;
  readonly #imageSize?: string;
  readonly #quality?: string;
  readonly #outputFormat: string;

  constructor(config: RemoteApiProviderConfig | undefined) {
    this.#baseUrl = assertBaseUrl(config?.baseUrl);
    this.#apiKey = assertApiKey(config?.apiKey);
    this.#headerName = config?.headerName?.trim() || "Authorization";
    this.#headerValuePrefix = config?.headerValuePrefix ?? "Bearer ";
    this.#timeoutMs =
      Number.isInteger(config?.timeoutMs) && (config?.timeoutMs ?? 0) > 0
        ? (config?.timeoutMs as number)
        : DEFAULT_REMOTE_TIMEOUT_MS;
    this.#maxRetries =
      Number.isInteger(config?.maxRetries) && (config?.maxRetries ?? 0) >= 0
        ? (config?.maxRetries as number)
        : 0;
    this.#estimatedCostUsdPerImage =
      typeof config?.estimatedCostUsdPerImage === "number" && Number.isFinite(config.estimatedCostUsdPerImage)
        ? config.estimatedCostUsdPerImage
        : 0;
    this.#model = config?.model?.trim() || DEFAULT_REMOTE_MODEL;
    this.#imageSize = config?.imageSize?.trim() || undefined;
    this.#quality = config?.quality?.trim() || undefined;
    this.#outputFormat = config?.outputFormat?.trim() || "png";
  }

  async generate(input: CharacterProviderGenerateInput): Promise<CharacterGenerationProviderResult> {
    const views = input.views.length > 0 ? input.views : (["front", "threeQuarter", "profile"] as const);
    const candidates: CharacterGenerationCandidate[] = [];
    const callLogs: CharacterProviderCallLog[] = [];
    const warnings = new Set<string>();
    const size = this.#imageSize ?? buildSize(input.qualityProfile);

    for (const view of views) {
      const context = buildRequestContext(input, view);
      const usesEdits = Boolean(context.referenceImage);
      if ((input.referenceBankByView?.[view] ?? input.referenceBank)?.length && context.referenceImage?.source === "reference_bank") {
        warnings.add(`remoteApi used first reference bank asset only for ${view} edits`);
      }
      if (input.structureControlsByView?.[view] && Object.keys(input.structureControlsByView[view] ?? {}).length > 0) {
        warnings.add(`remoteApi ignored structure controls for ${view}`);
      }

      let response: RemoteApiResponse | null = null;
      const startedAt = Date.now();
      let lastError: RemoteApiRequestError | null = null;

      for (let attempt = 1; attempt <= this.#maxRetries + 1; attempt += 1) {
        try {
          response = await this.#requestImages({
            context,
            size,
            signalTimeoutMs: this.#timeoutMs
          });
          for (let candidateIndex = 0; candidateIndex < input.candidateCount; candidateIndex += 1) {
            callLogs.push({
              provider: "remoteApi",
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
            error instanceof Error ? (error as RemoteApiRequestError) : makeRequestError(String(error));
          lastError = requestError;
          for (let candidateIndex = 0; candidateIndex < input.candidateCount; candidateIndex += 1) {
            callLogs.push({
              provider: "remoteApi",
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
        throw lastError ?? new Error(`Remote API request failed for ${view}`);
      }

      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error(`Remote API response for ${view} did not include image data`);
      }

      for (const [candidateIndex, item] of response.data.entries()) {
        if (typeof item.b64_json !== "string" || item.b64_json.trim().length === 0) {
          throw new Error(`Remote API candidate ${view}:${candidateIndex} missing b64_json`);
        }
        const buffer = Buffer.from(item.b64_json, "base64");
        if (buffer.byteLength === 0) {
          throw new Error(`Remote API candidate ${view}:${candidateIndex} returned empty image data`);
        }
        const seed = toIntSeed(input.baseSeed, view, candidateIndex);
        const referenceBank = input.referenceBankByView?.[view] ?? input.referenceBank;
        const structureControls = input.structureControlsByView?.[view];
        candidates.push({
          id: `remoteApi_${view}_${candidateIndex}_${seed}`,
          view,
          candidateIndex,
          seed,
          provider: "remoteApi",
          prompt: input.positivePrompt,
          negativePrompt: input.negativePrompt,
          mimeType: mimeTypeForOutputFormat(this.#outputFormat),
          data: buffer,
          providerMeta: {
            model: this.#model,
            endpoint: usesEdits ? "/images/edits" : "/images/generations",
            requestMode: usesEdits ? "edit" : "generate",
            requestedSeed: seed,
            seedControlled: false,
            revisedPrompt: item.revised_prompt,
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
            usage: response.usage
          }
        });
      }
    }

    return {
      provider: "remoteApi",
      workflowHash: hashWorkflowIdentity({
        provider: "remoteApi",
        presetId: input.presetId ?? "remoteApi",
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
            ...(this.#quality ? { quality: this.#quality } : {})
          },
          warnings: [...warnings]
      }
    };
  }

  async #requestImages(input: {
    context: RemoteApiRequestContext;
    size?: string;
    signalTimeoutMs: number;
  }): Promise<RemoteApiResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.signalTimeoutMs);
    const headers = new Headers();
    headers.set(this.#headerName, `${this.#headerValuePrefix}${this.#apiKey}`);

    try {
      const endpoint = input.context.referenceImage ? "/images/edits" : "/images/generations";
      const url = `${this.#baseUrl}${endpoint}`;
      let response: Response;

      if (input.context.referenceImage) {
        const form = new FormData();
        form.set("model", this.#model);
        form.set("prompt", input.context.prompt);
        form.set("n", String(input.context.candidateCount));
        form.set("response_format", "b64_json");
        if (input.size) {
          form.set("size", input.size);
        }
        if (this.#quality) {
          form.set("quality", this.#quality);
        }
        if (this.#outputFormat) {
          form.set("output_format", this.#outputFormat);
        }
        const referenceMimeType = detectMimeType(input.context.referenceImage.mimeType, "image/png");
        form.set(
          "image",
          await buildImageBlob(input.context.referenceImage.base64, referenceMimeType, `reference_${input.context.view}`)
        );
        if (input.context.repairMask) {
          const maskMimeType = detectMimeType(input.context.repairMask.mimeType, "image/png");
          form.set(
            "mask",
            await buildImageBlob(input.context.repairMask.base64, maskMimeType, `mask_${input.context.view}`)
          );
        }
        response = await fetch(url, {
          method: "POST",
          headers,
          body: form,
          signal: controller.signal
        });
      } else {
        headers.set("content-type", "application/json");
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: this.#model,
            prompt: input.context.prompt,
            n: input.context.candidateCount,
            ...(input.size ? { size: input.size } : {}),
            ...(this.#quality ? { quality: this.#quality } : {}),
            ...(this.#outputFormat ? { output_format: this.#outputFormat } : {}),
            response_format: "b64_json"
          }),
          signal: controller.signal
        });
      }

      if (!response.ok) {
        const body = await response.text();
        throw makeRequestError(
          `Remote API request failed (${response.status}): ${body.slice(0, 300)}`,
          response.status
        );
      }

      return await parseJsonResponse(response);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw makeRequestError(`Remote API request timed out after ${input.signalTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
