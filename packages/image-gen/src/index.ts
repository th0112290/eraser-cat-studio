import { ComfyUiCharacterGenerationProvider } from "./comfyuiProvider";
import {
  assertCharacterPipelineAccepted,
  buildGeneratedCharacterPack,
  generateCharacterExpressionPack,
  generateCharacterViewSet,
  generateCharacterVisemePack,
  loadGeneratedCharacterPack,
  resolveCharacterPipelineAcceptance,
  resolveGeneratedCharacterPackPath,
  runCharacterAnimationSafeQc,
  runCharacterPipelineEditRepairLoop,
  runDeterministicCharacterPipeline,
  runEditCharacterStill,
  runGenerateCharacterStill,
  approveFrontMaster
} from "./generatedCharacterPipeline";
import { MockCharacterGenerationProvider } from "./mockProvider";
import { RemoteApiCharacterGenerationProvider } from "./remoteApiProvider";
import {
  buildMascotReferenceBankReviewPlan,
  resolveEffectiveMascotReferenceBankStatus,
  resolveMascotCompositionReferenceAsset,
  resolveMascotReferenceBankDiagnostics,
  resolveMascotReferenceBankManifest,
  resolveMascotReferenceRequirementStatuses,
  resolveMascotStyleReferenceAsset
} from "./mascotReferenceBank";
import { STYLE_PROMPT_PRESETS, buildPromptBundle } from "./prompt";
import { listMascotSpeciesProfiles, resolveMascotSpeciesProfile } from "./species";
import type {
  BuildPromptBundleInput,
  CharacterGenerationMode,
  CharacterGenerationProvider,
  CharacterProviderName,
  ChannelBibleStyleHints,
  PromptBundle,
  StylePromptPreset
} from "./types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export type CreateCharacterProviderInput = {
  provider?: CharacterProviderName;
  comfyUiUrl?: string;
  remoteApi?: {
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
};

export function createCharacterProvider(input: CreateCharacterProviderInput): CharacterGenerationProvider {
  if (input.provider === "comfyui") {
    return new ComfyUiCharacterGenerationProvider(input.comfyUiUrl);
  }

  if (input.provider === "remoteApi") {
    return new RemoteApiCharacterGenerationProvider(input.remoteApi ?? {});
  }

  if (!input.provider && input.comfyUiUrl && input.comfyUiUrl.trim().length > 0) {
    return new ComfyUiCharacterGenerationProvider(input.comfyUiUrl);
  }

  if (!input.provider && input.remoteApi?.baseUrl && input.remoteApi.baseUrl.trim().length > 0) {
    return new RemoteApiCharacterGenerationProvider(input.remoteApi);
  }

  return new MockCharacterGenerationProvider();
}

export function resolveProviderName(input: {
  requestedProvider?: string;
  comfyUiUrl?: string;
  remoteApiBaseUrl?: string;
}): CharacterProviderName {
  const requested = input.requestedProvider?.trim().toLowerCase();
  if (requested === "mock") {
    return "mock";
  }
  if (requested === "comfyui") {
    return "comfyui";
  }
  if (requested === "remoteapi" || requested === "remote_api" || requested === "remote") {
    return "remoteApi";
  }

  if (input.comfyUiUrl && input.comfyUiUrl.trim().length > 0) {
    return "comfyui";
  }

  if (input.remoteApiBaseUrl && input.remoteApiBaseUrl.trim().length > 0) {
    return "remoteApi";
  }

  return "mock";
}

export function listStylePromptPresets(): StylePromptPreset[] {
  return [...STYLE_PROMPT_PRESETS];
}

export function listMascotSpecies() {
  return listMascotSpeciesProfiles();
}

export { resolveMascotSpeciesProfile };
export {
  buildMascotReferenceBankReviewPlan,
  resolveEffectiveMascotReferenceBankStatus,
  resolveMascotCompositionReferenceAsset,
  resolveMascotReferenceBankDiagnostics,
  resolveMascotReferenceBankManifest,
  resolveMascotReferenceRequirementStatuses,
  resolveMascotStyleReferenceAsset
};
export {
  approveFrontMaster,
  assertCharacterPipelineAccepted,
  buildGeneratedCharacterPack,
  generateCharacterExpressionPack,
  generateCharacterViewSet,
  generateCharacterVisemePack,
  loadGeneratedCharacterPack,
  resolveCharacterPipelineAcceptance,
  resolveGeneratedCharacterPackPath,
  runCharacterAnimationSafeQc,
  runCharacterPipelineEditRepairLoop,
  runDeterministicCharacterPipeline,
  runEditCharacterStill,
  runGenerateCharacterStill
};

export function deriveStyleHintsFromChannelBible(channelBibleJson: unknown): ChannelBibleStyleHints {
  const root = asRecord(channelBibleJson);
  if (!root) {
    return {};
  }

  const channel = asRecord(root.channel);
  const character = asRecord(root.character);
  const styleTokens = asRecord(root.style_tokens);
  const speechStyle = asRecord(character?.speech_style);
  const motion = asRecord(styleTokens?.motion);
  const typography = asRecord(styleTokens?.typography);

  return {
    channelName: asString(channel?.name),
    characterPersona: asString(character?.persona),
    tone: asString(speechStyle?.tone),
    motion: asString(motion?.camera_motion),
    typography: asString(typography?.font_family)
  };
}

export type BuildCharacterPromptInput = {
  mode: CharacterGenerationMode;
  presetId?: string;
  speciesId?: "cat" | "dog" | "wolf";
  positivePrompt?: string;
  negativePrompt?: string;
  styleHints?: ChannelBibleStyleHints;
};

export function buildCharacterPrompt(input: BuildCharacterPromptInput): PromptBundle {
  const bundleInput: BuildPromptBundleInput = {
    presetId: input.presetId,
    speciesId: input.speciesId,
    positivePrompt:
      input.mode === "reference"
        ? `${input.positivePrompt ?? ""}, keep identity consistency, preserve exact costume colors, same character across all angles`
        : input.positivePrompt,
    negativePrompt: input.negativePrompt,
    styleHints: input.styleHints
  };

  return buildPromptBundle(bundleInput);
}

export type {
  CharacterCandidateProviderMeta,
  CharacterGenerationCandidate,
  CharacterGenerationMode,
  CharacterGenerationProvider,
  CharacterGenerationProviderResult,
  CharacterProviderCallLog,
  CharacterProviderGenerateInput,
  CharacterRepairLineage,
  CharacterProviderName,
  CharacterReferenceBankEntry,
  CharacterStructureControlAsset,
  CharacterStructureControlType,
  CharacterReferenceRole,
  CharacterStructureControlImage,
  CharacterStructureControlKind,
  CharacterView,
  CharacterWorkflowStage,
  CharacterWorkflowStageOrigin,
  CharacterWorkflowStagePlan,
  ChannelBibleStyleHints,
  PromptBundle,
  PromptQualityProfile,
  PromptSelectionHints,
  QualityTier,
  StylePromptPreset,
  MascotSpeciesId,
  MascotSpeciesProfile,
  MascotReferenceAssetEntry,
  MascotReferenceAssetRequirement,
  MascotReferenceBankManifest
} from "./types";
export type {
  MascotReferenceAssetRequirementStatus,
  MascotReferenceBankDiagnostics,
  MascotReferenceBankReviewPlan,
  ResolvedMascotReferenceAsset
} from "./mascotReferenceBank";
export type {
  CharacterPipelineAcceptance,
  CharacterPipelineAcceptanceStatus,
  CharacterPipelineQcCheck,
  CharacterPipelineQcReport,
  CharacterPipelineReferenceBankStatus,
  CharacterPipelineRepairAction,
  CharacterPipelineRepairTask,
  CharacterStillAsset,
  GeneratedCharacterExpression,
  GeneratedCharacterManifest,
  GeneratedCharacterView,
  GeneratedCharacterViseme,
  RunCharacterPipelineEditRepairLoopInput,
  RunDeterministicCharacterPipelineInput,
  RunEditCharacterStillInput,
  RunGenerateCharacterStillInput
} from "./generatedCharacterPipeline";
