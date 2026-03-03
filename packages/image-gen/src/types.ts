export type CharacterGenerationMode = "reference" | "new";
export type CharacterView = "front" | "threeQuarter" | "profile";
export type CharacterProviderName = "mock" | "comfyui";

export type StylePromptPreset = {
  id: string;
  label: string;
  positive: string;
  negative: string;
};

export type PromptBundle = {
  presetId: string;
  positivePrompt: string;
  negativePrompt: string;
  guardrails: string[];
};

export type CharacterProviderGenerateInput = {
  mode: CharacterGenerationMode;
  views: CharacterView[];
  candidateCount: number;
  baseSeed: number;
  positivePrompt: string;
  negativePrompt: string;
  referenceImageBase64?: string;
  referenceMimeType?: string;
};

export type CharacterGenerationCandidate = {
  id: string;
  view: CharacterView;
  candidateIndex: number;
  seed: number;
  provider: CharacterProviderName;
  prompt: string;
  negativePrompt: string;
  mimeType: string;
  data: Buffer;
  providerMeta?: Record<string, unknown>;
};

export type CharacterGenerationProviderResult = {
  provider: CharacterProviderName;
  workflowHash: string;
  generatedAt: string;
  candidates: CharacterGenerationCandidate[];
};

export interface CharacterGenerationProvider {
  readonly name: CharacterProviderName;
  generate(input: CharacterProviderGenerateInput): Promise<CharacterGenerationProviderResult>;
}

export type ChannelBibleStyleHints = {
  channelName?: string;
  characterPersona?: string;
  tone?: string;
  motion?: string;
  typography?: string;
};

export type BuildPromptBundleInput = {
  presetId?: string;
  positivePrompt?: string;
  negativePrompt?: string;
  styleHints?: ChannelBibleStyleHints;
};
