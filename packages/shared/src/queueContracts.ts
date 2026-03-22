export type RenderDatasetRow = {
  label: string;
  value: number;
  unit?: string;
};

export type RenderDatasetInput = {
  rows: RenderDatasetRow[];
  expectedSum?: number;
  unit?: string;
  sumTolerance?: number;
};

export type RenderQcPayload = {
  dataset?: RenderDatasetInput;
  minFontSizePx?: number;
  pointerTolerancePx?: number;
  expectOcclusion?: boolean;
};

export type RenderJobPayload = {
  shotsPath?: string;
  outputPath?: string;
  srtPath?: string;
  qcReportPath?: string;
  renderLogPath?: string;
  narrationAlignmentPath?: string;
  compositionId?: string;
  dryRun?: boolean;
  rerenderFailedShotsOnly?: boolean;
  failedShotIds?: string[];
  qc?: RenderQcPayload;
  preset?: Record<string, unknown>;
};

export type PipelineStoryOptions = {
  bibleRef?: string;
  outline?: string[];
  paragraphs?: string[];
  targetBeatCount?: number;
  studioProfileId?: string;
  channelProfileId?: string;
  mascotProfileId?: string;
  stylePresetId?: string;
  styleSeed?: string;
  hookBoost?: number;
  episodeTopic?: string;
  episodeTitle?: string;
  tone?: string;
  speed?: "slow" | "medium" | "fast";
  kpiFocus?: string[];
  abVariant?: "A" | "B";
};

export type PipelineOptions = {
  autoRenderFinal?: boolean;
  stopAfterPreview?: boolean;
  finalPreset?: Record<string, unknown>;
  story?: PipelineStoryOptions;
  publish?: {
    plannedPublishAt?: string;
  };
};

export type CharacterAssetSelection = {
  front: string;
  threeQuarter: string;
  profile: string;
};

export type CharacterGenerationMode = "reference" | "new";
export type CharacterGenerationProvider = "mock" | "comfyui" | "remoteApi" | "vertexImagen";
export type CharacterGenerationView = "front" | "threeQuarter" | "profile";
export type CharacterGenerationSpecies = "cat" | "dog" | "wolf";
export type CharacterGenerationSelection = {
  front: string;
  threeQuarter: string;
  profile: string;
};

export type AssetIngestQueuePayload = {
  assetId: string;
  assetType: "character_reference" | "character_view" | "background" | "chart_source";
  originalKey: string;
  mime: string;
};

export type CharacterGenerationPayload = {
  sessionId?: string;
  mode: CharacterGenerationMode;
  provider?: CharacterGenerationProvider;
  promptPreset?: string;
  species?: CharacterGenerationSpecies;
  positivePrompt?: string;
  negativePrompt?: string;
  boostNegativePrompt?: boolean;
  referenceAssetId?: string;
  viewToGenerate?: CharacterGenerationView;
  regenerateSameSeed?: boolean;
  candidateCount?: number;
  autoPick?: boolean;
  requireHitlPick?: boolean;
  seed?: number;
  manifestPath?: string;
  sourceManifestPath?: string;
  selectedCandidateIds?: CharacterGenerationSelection;
};

export type CharacterPackJobPayload = {
  characterPackId: string;
  version: number;
  buildJobDbId?: string;
  previewJobDbId?: string;
  assetIds?: CharacterAssetSelection;
  generation?: CharacterGenerationPayload;
};

export type EpisodeJobPayload = {
  jobDbId: string;
  episodeId: string;
  schemaChecks?: Array<{ schemaId: string; data: unknown }>;
  render?: RenderJobPayload;
  pipeline?: PipelineOptions;
  character?: CharacterPackJobPayload;
};
