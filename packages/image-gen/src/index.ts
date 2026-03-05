import { ComfyUiCharacterGenerationProvider } from "./comfyuiProvider";
import { MockCharacterGenerationProvider } from "./mockProvider";
import { STYLE_PROMPT_PRESETS, buildPromptBundle } from "./prompt";
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
  };
};

export function createCharacterProvider(input: CreateCharacterProviderInput): CharacterGenerationProvider {
  if (input.provider === "comfyui") {
    return new ComfyUiCharacterGenerationProvider(input.comfyUiUrl);
  }

  if (!input.provider && input.comfyUiUrl && input.comfyUiUrl.trim().length > 0) {
    return new ComfyUiCharacterGenerationProvider(input.comfyUiUrl);
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
  positivePrompt?: string;
  negativePrompt?: string;
  styleHints?: ChannelBibleStyleHints;
};

export function buildCharacterPrompt(input: BuildCharacterPromptInput): PromptBundle {
  const bundleInput: BuildPromptBundleInput = {
    presetId: input.presetId,
    positivePrompt: input.mode === "reference" ? `${input.positivePrompt ?? ""}, keep identity consistency` : input.positivePrompt,
    negativePrompt: input.negativePrompt,
    styleHints: input.styleHints
  };

  return buildPromptBundle(bundleInput);
}

export type {
  CharacterGenerationCandidate,
  CharacterGenerationMode,
  CharacterGenerationProvider,
  CharacterGenerationProviderResult,
  CharacterProviderCallLog,
  CharacterProviderGenerateInput,
  CharacterProviderName,
  CharacterView,
  ChannelBibleStyleHints,
  PromptBundle,
  StylePromptPreset
} from "./types";
