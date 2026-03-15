import { hashWorkflowIdentity } from "./prompt";
import type {
  CharacterGenerationCandidate,
  CharacterGenerationProvider,
  CharacterGenerationProviderResult,
  CharacterProviderCallLog,
  CharacterCandidateProviderMeta,
  CharacterProviderGenerateInput,
  CharacterView,
  CharacterReferenceBankEntry,
  CharacterStructureControlImage,
  CharacterStructureControlKind,
  PromptQualityProfile
} from "./types";

type ComfyUiResponse = {
  imageBase64?: string;
  mimeType?: string;
  seed?: number;
  workflowHash?: string;
  meta?: CharacterCandidateProviderMeta;
};

const DEFAULT_COMFY_ADAPTER_TIMEOUT_MS = Number.parseInt(
  process.env.COMFY_ADAPTER_TIMEOUT_MS ?? "360000",
  10
);

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
      ...(typeof entry.controlNetName === "string" && entry.controlNetName.trim().length > 0
        ? { controlNetName: entry.controlNetName.trim() }
        : {}),
      ...(typeof entry.note === "string" && entry.note.trim().length > 0 ? { note: entry.note.trim() } : {}),
      ...(typeof entry.sourceRole === "string" && entry.sourceRole.trim().length > 0
        ? { sourceRole: entry.sourceRole }
        : {}),
      ...(typeof entry.sourceRefId === "string" && entry.sourceRefId.trim().length > 0
        ? { sourceRefId: entry.sourceRefId.trim() }
        : {}),
      ...(typeof entry.sourceView === "string" && entry.sourceView.trim().length > 0
        ? { sourceView: entry.sourceView }
        : {})
    }];
  });
}

async function postComfyRequest(url: string, payload: Record<string, unknown>): Promise<ComfyUiResponse> {
  const timeoutMs =
    Number.isInteger(DEFAULT_COMFY_ADAPTER_TIMEOUT_MS) && DEFAULT_COMFY_ADAPTER_TIMEOUT_MS > 0
      ? DEFAULT_COMFY_ADAPTER_TIMEOUT_MS
      : 360000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ComfyUI request failed (${response.status}): ${body.slice(0, 300)}`);
    }

    return (await response.json()) as ComfyUiResponse;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`ComfyUI request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
    const callLogs: CharacterProviderCallLog[] = [];
    const warnings = new Set<string>();
    let workflowHash: string | undefined;
    let providerMeta:
      | {
        qualityProfileId?: string;
        runSettings?: Partial<PromptQualityProfile>;
        workflowStage?: CharacterProviderGenerateInput["workflowStage"];
        workflowTemplateVersion?: string;
        stagePlan?: CharacterProviderGenerateInput["stagePlan"];
        capabilitySnapshot?: Record<string, unknown>;
        templateManifestPath?: string | null;
        templateManifest?: Record<string, unknown> | null;
        warnings?: string[];
      }
      | undefined;

    for (const view of views) {
      for (let index = 0; index < input.candidateCount; index += 1) {
        const seed = toIntSeed(input.baseSeed, view, index);
        const startedAt = Date.now();
        let response: ComfyUiResponse;
        const structureControls = input.structureControlsByView?.[view];
        const stagePlanForView = input.stagePlan
          ? {
              ...input.stagePlan,
              ...(input.repairLineageByView?.[view] ?? {})
            }
          : undefined;
        try {
          const referenceBank = input.referenceBankByView?.[view] ?? input.referenceBank;
          response = await postComfyRequest(endpoint, {
            mode: input.mode,
            view,
            seed,
            speciesId: input.speciesId,
            prompt: input.positivePrompt,
            viewPrompt: input.viewPrompts?.[view] ?? input.positivePrompt,
            negativePrompt: input.negativePrompt,
            presetId: input.presetId,
            guardrails: input.guardrails,
            qualityProfile: input.qualityProfile,
            selectionHints: input.selectionHints,
            workflowStage: input.workflowStage,
            workflowTemplateVersion: input.workflowTemplateVersion,
            stagePlan: stagePlanForView,
            referenceMode: input.referenceMode,
            referenceImageBase64: input.referenceImageBase64ByView?.[view] ?? input.referenceImageBase64,
            referenceMimeType: input.referenceMimeTypeByView?.[view] ?? input.referenceMimeType,
            repairMaskImageBase64: input.repairMaskImageBase64ByView?.[view] ?? input.repairMaskImageBase64,
            repairMaskMimeType: input.repairMaskMimeTypeByView?.[view] ?? input.repairMaskMimeType,
            referenceBank,
            poseImageBase64: input.poseImageBase64ByView?.[view],
            poseMimeType: input.poseMimeTypeByView?.[view],
            structureControls
          });
          callLogs.push({
            provider: "comfyui",
            view,
            candidateIndex: index,
            attempt: 1,
            durationMs: Date.now() - startedAt,
            estimatedCostUsd: 0,
            result: "succeeded"
          });
        } catch (error) {
          callLogs.push({
            provider: "comfyui",
            view,
            candidateIndex: index,
            attempt: 1,
            durationMs: Date.now() - startedAt,
            estimatedCostUsd: 0,
            result: "failed",
            errorSummary: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }

        if (!response.imageBase64) {
          throw new Error("ComfyUI response missing imageBase64");
        }

        const mimeType = response.mimeType?.trim() || "image/png";
        const buffer = Buffer.from(response.imageBase64, "base64");
        if (buffer.byteLength === 0) {
          throw new Error("ComfyUI returned empty image buffer");
        }

        workflowHash = response.workflowHash ?? workflowHash;
        const responseMeta = response.meta ?? {};
        const warning = typeof responseMeta.warning === "string" ? responseMeta.warning : null;
        if (warning) {
          warnings.add(warning);
        }
        if (!providerMeta) {
          providerMeta = {
            qualityProfileId:
              typeof responseMeta.qualityProfileId === "string" ? responseMeta.qualityProfileId : input.qualityProfile?.id,
            runSettings:
              typeof responseMeta.runSettings === "object" && responseMeta.runSettings !== null
                ? (responseMeta.runSettings as Partial<PromptQualityProfile>)
                : input.qualityProfile,
            workflowStage:
              typeof responseMeta.workflowStage === "string" ? responseMeta.workflowStage : input.workflowStage,
            workflowTemplateVersion:
              typeof responseMeta.workflowTemplateVersion === "string"
                ? responseMeta.workflowTemplateVersion
                : input.workflowTemplateVersion,
            stagePlan: stagePlanForView,
            capabilitySnapshot:
              typeof responseMeta.capabilitySnapshot === "object" && responseMeta.capabilitySnapshot !== null
                ? (responseMeta.capabilitySnapshot as Record<string, unknown>)
                : undefined,
            templateManifestPath:
              typeof responseMeta.templateManifestPath === "string" ? responseMeta.templateManifestPath : null,
            templateManifest:
              typeof responseMeta.templateManifest === "object" && responseMeta.templateManifest !== null
                ? (responseMeta.templateManifest as Record<string, unknown>)
                : null,
            warnings: []
          };
        }

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
          providerMeta: {
            ...responseMeta,
            qualityProfileId:
              typeof responseMeta.qualityProfileId === "string" ? responseMeta.qualityProfileId : input.qualityProfile?.id,
            runSettings:
              typeof responseMeta.runSettings === "object" && responseMeta.runSettings !== null
                ? (responseMeta.runSettings as Partial<PromptQualityProfile>)
                : input.qualityProfile,
            workflowStage:
              typeof responseMeta.workflowStage === "string" ? responseMeta.workflowStage : input.workflowStage,
            workflowTemplateVersion:
              typeof responseMeta.workflowTemplateVersion === "string"
                ? responseMeta.workflowTemplateVersion
                : input.workflowTemplateVersion,
            stagePlan: stagePlanForView,
            capabilitySnapshot:
              typeof responseMeta.capabilitySnapshot === "object" && responseMeta.capabilitySnapshot !== null
                ? (responseMeta.capabilitySnapshot as Record<string, unknown>)
                : undefined,
            templateManifestPath:
              typeof responseMeta.templateManifestPath === "string" ? responseMeta.templateManifestPath : null,
            templateManifest:
              typeof responseMeta.templateManifest === "object" && responseMeta.templateManifest !== null
                ? (responseMeta.templateManifest as Record<string, unknown>)
                : null,
            referenceBankSummary:
              Array.isArray(responseMeta.referenceBankSummary) && responseMeta.referenceBankSummary.length > 0
                ? responseMeta.referenceBankSummary
                : summarizeReferenceBank(input.referenceBankByView?.[view] ?? input.referenceBank),
            structureControlsSummary:
              Array.isArray(responseMeta.structureControlsSummary) && responseMeta.structureControlsSummary.length > 0
                ? responseMeta.structureControlsSummary
                : summarizeStructureControls(structureControls),
            structureControlApplied:
              typeof responseMeta.structureControlApplied === "boolean"
                ? responseMeta.structureControlApplied
                : Boolean(structureControls && Object.keys(structureControls).length > 0),
            viewPrompt:
              typeof responseMeta.viewPrompt === "string"
                ? responseMeta.viewPrompt
                : input.viewPrompts?.[view] ?? input.positivePrompt
          }
        });
      }
    }

    if (providerMeta) {
      providerMeta.warnings = [...warnings];
    }

    return {
      provider: "comfyui",
      workflowHash:
        workflowHash ??
        hashWorkflowIdentity({
          provider: "comfyui",
          presetId: input.presetId ?? "comfyui",
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
      ...(providerMeta ? { providerMeta } : {})
    };
  }
}
