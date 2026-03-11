export type CharacterGenerationMode = "reference" | "new";
export type CharacterView = "front" | "threeQuarter" | "profile";
export type CharacterProviderName = "mock" | "comfyui" | "remoteApi";
export type MascotSpeciesId = "cat" | "dog" | "wolf";
export type CharacterWorkflowStage =
  | "front_master"
  | "side_view_base"
  | "side_view_refine"
  | "identity_lock_refine"
  | "view_only"
  | "repair_refine"
  | "video_broll";
export type CharacterWorkflowStageOrigin =
  | "initial"
  | "front_rescue"
  | "refine_pass"
  | "lock_pass"
  | "repair_pass"
  | "auto_reroute"
  | "mock_fallback"
  | "view_regen";
export type CharacterReferenceRole =
  | "subject"
  | "hero"
  | "style"
  | "composition"
  | "starter"
  | "front_master"
  | "repair_base"
  | "view_starter"
  | "video_keyframe";
export type CharacterStructureControlKind = "lineart" | "canny" | "depth";

export type CharacterStructureControlImage = {
  imageBase64: string;
  mimeType?: string;
  strength?: number;
  startPercent?: number;
  endPercent?: number;
  controlNetName?: string;
  note?: string;
  sourceRole?: CharacterReferenceRole;
  sourceRefId?: string;
  sourceView?: CharacterView;
};

export type QualityTier = "fast" | "balanced" | "quality" | "production";

export type CharacterReferenceBankEntry = {
  id?: string;
  role: CharacterReferenceRole;
  view?: CharacterView;
  weight?: number;
  imageBase64: string;
  mimeType?: string;
  note?: string;
};

export type CharacterStructureControlType = "lineart" | "canny" | "depth" | "silhouette";

export type CharacterStructureControlAsset = {
  type: CharacterStructureControlType;
  imageBase64: string;
  mimeType?: string;
  weight?: number;
  startPercent?: number;
  endPercent?: number;
  note?: string;
  controlNetName?: string;
};

export type CharacterWorkflowStagePlan = {
  stage: CharacterWorkflowStage;
  templateVersion: string;
  templateSpecPath?: string;
  views?: CharacterView[];
  candidateCount?: number;
  acceptedScoreThreshold?: number;
  referenceBankSize?: number;
  repairFromCandidateId?: string;
  repairFromStage?: CharacterWorkflowStage | string;
  acceptedByGate?: boolean;
  gateDecision?: string;
  sourcePassLabel?: string;
  referenceLineage?: string[];
  origin?: CharacterWorkflowStageOrigin;
  passLabel?: string;
  reasonCodes?: string[];
  triggerViews?: CharacterView[];
  seedOffset?: number;
  structureControlKinds?: CharacterStructureControlKind[];
  controlPresetId?: string;
  referenceBankId?: string;
  referenceBankStatus?: "species_ready" | "scaffold_only";
  referenceBankMissingRoles?: CharacterReferenceRole[];
  mascotProfileId?: string;
  heroModeEnabled?: boolean;
};

export type CharacterRepairLineage = {
  repairFromCandidateId: string;
  repairFromStage?: CharacterWorkflowStage | string;
  acceptedByGate?: boolean;
  gateDecision?: string;
  sourcePassLabel?: string;
  referenceLineage?: string[];
};

export type MascotSpeciesProfile = {
  id: MascotSpeciesId;
  label: string;
  familyId: string;
  referenceBankId: string;
  positiveTokens: string[];
  negativeTokens: string[];
  identityTokens: string[];
  anchorTokens?: string[];
  guardrails: string[];
  viewHints: Partial<Record<CharacterView, string>>;
  keepTraits: string[];
  rejectTraits: string[];
  heroMode: {
    allowOptionalHeroRef: boolean;
    enabledByDefault: boolean;
    stages: CharacterWorkflowStage[];
    maxReferenceWeight: number;
    minFrontScore: number;
  };
  controlNetHintPolicy: {
    frontMasterPresetId: string;
    baseStagePresetId: string;
    advancedStagePresetId: string;
    repairStagePresetId: string;
    defaultKindsByStage: Partial<Record<CharacterWorkflowStage, CharacterStructureControlKind[]>>;
  };
  animationQc: {
    minExpressionFaceVariation: number;
    minVisemeFaceVariation: number;
    maxExpressionBodyCenterDrift: number;
    maxExpressionBodySizeDelta: number;
    maxVisemeBodyCenterDrift: number;
    maxEyeAnchorDrift: number;
    maxMouthAnchorDrift: number;
  };
  qcThresholds: {
    frontMasterMinScore: number;
    frontMasterMinStyleScore: number;
    frontMasterMinSpeciesScore: number;
    frontMasterMinHeadSquarenessScore: number;
    repairScoreFloor: number;
    minConsistencyByView: Partial<Record<CharacterView, number>>;
    minHeadRatioByView: Partial<Record<CharacterView, number>>;
    minGeometryCueByView: Partial<Record<CharacterView, number>>;
    minFrontSymmetryScore: number;
    minSubjectIsolationFront: number;
    maxSpeciesSpread: number;
    maxStyleSpread: number;
    maxHeadRatioSpread: number;
    maxMonochromeSpread: number;
    maxEarCueSpread: number;
    maxMuzzleCueSpread: number;
    maxHeadShapeCueSpread: number;
    maxSilhouetteCueSpread: number;
  };
};

export type MascotReferenceAssetEntry = {
  path: string;
  note?: string;
  weight?: number;
};

export type MascotReferenceAssetRequirement = {
  slotId: string;
  role: CharacterReferenceRole;
  view?: CharacterView;
  requiredForStatus: "species_ready";
  description: string;
};

export type MascotReferenceBankManifest = {
  extends?: string;
  profileId?: string;
  speciesId?: MascotSpeciesId;
  familyId?: string;
  bankStatus?: "species_ready" | "scaffold_only";
  notes?: string[];
  requiredAssets?: MascotReferenceAssetRequirement[];
  style?: MascotReferenceAssetEntry[];
  starterByView?: Partial<Record<CharacterView, MascotReferenceAssetEntry[]>>;
  familyByView?: Partial<Record<CharacterView, MascotReferenceAssetEntry[]>>;
  heroByView?: Partial<Record<CharacterView, MascotReferenceAssetEntry[]>>;
};

export type PromptQualityProfile = {
  id: string;
  label: string;
  targetStyle: string;
  qualityTier: QualityTier;
  sampler?: string;
  scheduler?: string;
  steps?: number;
  cfg?: number;
  width?: number;
  height?: number;
  maxShift?: number;
  baseShift?: number;
  postprocessPlan?: string[];
  upscaleLongSide?: number;
  sharpen?: number;
  saturationBoost?: number;
};

export type PromptSelectionHints = {
  minAcceptedScore?: number;
  frontMasterMinAcceptedScore?: number;
  autoRetryRounds?: number;
  frontMasterCandidateCount?: number;
  repairCandidateCount?: number;
  repairScoreFloor?: number;
  sequentialReference?: boolean;
  prioritizeConsistency?: boolean;
  preferMultiReference?: boolean;
  allowHeroMode?: boolean;
  heroModeReferenceWeightCap?: number;
};

export type StylePromptPreset = {
  id: string;
  label: string;
  positive: string;
  negative: string;
  qualityProfile: PromptQualityProfile;
};

export type PromptBundle = {
  presetId: string;
  speciesId?: MascotSpeciesId;
  mascotProfileId?: string;
  positivePrompt: string;
  negativePrompt: string;
  guardrails: string[];
  qualityProfile: PromptQualityProfile;
  viewPrompts: Record<CharacterView, string>;
  keepTraits?: string[];
  rejectTraits?: string[];
  referenceBankId?: string;
  heroMode?: MascotSpeciesProfile["heroMode"];
  controlNetHintPolicy?: MascotSpeciesProfile["controlNetHintPolicy"];
  qcThresholds?: MascotSpeciesProfile["qcThresholds"];
  promptTokens: {
    styleCore: string;
    identityAnchors: string;
    renderDirectives: string;
    negativeCore: string;
  };
  selectionHints: PromptSelectionHints;
};

export type CharacterProviderGenerateInput = {
  mode: CharacterGenerationMode;
  views: CharacterView[];
  candidateCount: number;
  baseSeed: number;
  speciesId?: MascotSpeciesId;
  positivePrompt: string;
  negativePrompt: string;
  referenceMode?: "off" | "img2img";
  referenceImageBase64?: string;
  referenceMimeType?: string;
  referenceImageBase64ByView?: Partial<Record<CharacterView, string>>;
  referenceMimeTypeByView?: Partial<Record<CharacterView, string>>;
  repairMaskImageBase64?: string;
  repairMaskMimeType?: string;
  repairMaskImageBase64ByView?: Partial<Record<CharacterView, string>>;
  repairMaskMimeTypeByView?: Partial<Record<CharacterView, string>>;
  poseImageBase64ByView?: Partial<Record<CharacterView, string>>;
  poseMimeTypeByView?: Partial<Record<CharacterView, string>>;
  structureControlsByView?: Partial<
    Record<CharacterView, Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>>>
  >;
  presetId?: string;
  guardrails?: string[];
  qualityProfile?: PromptQualityProfile;
  viewPrompts?: Partial<Record<CharacterView, string>>;
  selectionHints?: PromptSelectionHints;
  workflowStage?: CharacterWorkflowStage;
  workflowTemplateVersion?: string;
  stagePlan?: CharacterWorkflowStagePlan;
  repairLineageByView?: Partial<Record<CharacterView, CharacterRepairLineage>>;
  referenceBank?: CharacterReferenceBankEntry[];
  referenceBankByView?: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
};

export type CharacterCandidateProviderMeta = {
  localCandidatePath?: string;
  promptId?: string;
  fileName?: string;
  subfolder?: string;
  type?: string;
  mode?: string;
  checkpointName?: string | null;
  loraName?: string | null;
  loraStrengthModel?: number | null;
  loraStrengthClip?: number | null;
  fluxResolved?: Record<string, unknown> | null;
  warning?: string | null;
  qualityProfileId?: string;
  targetStyle?: string;
  qualityTier?: QualityTier;
  viewPrompt?: string;
  poseApplied?: boolean;
  poseFileName?: string | null;
  poseControlNetName?: string | null;
  posePreset?: string | null;
  workflowApi?: Record<string, unknown>;
  workflowGui?: Record<string, unknown>;
  workflowSummary?: Record<string, unknown>;
  workflowFiles?: {
    apiPromptPath?: string;
    guiWorkflowPath?: string;
    summaryPath?: string;
  };
  workflowStage?: CharacterWorkflowStage;
  workflowTemplateVersion?: string;
  stagePlan?: CharacterWorkflowStagePlan;
  templateManifestPath?: string | null;
  templateManifest?: Record<string, unknown> | null;
  referenceBankSummary?: Array<{
    id?: string;
    role: CharacterReferenceRole;
    view?: CharacterView;
    weight?: number;
    fileName?: string;
    note?: string;
  }>;
  structureControlsSummary?: Array<{
    type: CharacterStructureControlKind;
    strength?: number;
    startPercent?: number;
    endPercent?: number;
    controlNetName?: string | null;
    note?: string;
    source?: "supplied" | "reference_preprocessor";
    sourceRole?: CharacterReferenceRole;
    sourceRefId?: string;
    sourceView?: CharacterView;
  }>;
  structureControlApplied?: boolean;
  repairMaskApplied?: boolean;
  repairMaskSource?: "explicit" | "reference_alpha";
  repairMaskFileName?: string | null;
  structureControlsApplied?: CharacterStructureControlKind[];
  structureControlSummary?: Array<{
    type: CharacterStructureControlKind;
    strength?: number;
    startPercent?: number;
    endPercent?: number;
    controlNetName?: string | null;
    note?: string;
    source?: "supplied" | "reference_preprocessor";
    sourceRole?: CharacterReferenceRole;
    sourceRefId?: string;
    sourceView?: CharacterView;
  }>;
  capabilitySnapshot?: Record<string, unknown>;
  runSettings?: Partial<PromptQualityProfile>;
  postprocess?: {
    applied: boolean;
    outputWidth?: number;
    outputHeight?: number;
    upscaleLongSide?: number;
    sharpen?: number;
    saturationBoost?: number;
  };
  [key: string]: unknown;
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
  providerMeta?: CharacterCandidateProviderMeta;
};

export type CharacterGenerationProviderResult = {
  provider: CharacterProviderName;
  workflowHash: string;
  generatedAt: string;
  callLogs: CharacterProviderCallLog[];
  candidates: CharacterGenerationCandidate[];
  providerMeta?: {
    qualityProfileId?: string;
    runSettings?: Partial<PromptQualityProfile>;
    workflowStage?: CharacterWorkflowStage;
    workflowTemplateVersion?: string;
    stagePlan?: CharacterWorkflowStagePlan;
    capabilitySnapshot?: Record<string, unknown>;
    templateManifestPath?: string | null;
    templateManifest?: Record<string, unknown> | null;
    workflowExports?: {
      apiPromptPath?: string;
      guiWorkflowPath?: string;
      summaryPath?: string;
    };
    warnings?: string[];
    selectionDiagnostics?: Record<string, unknown>;
  };
};

export type CharacterProviderCallLog = {
  provider: CharacterProviderName;
  view: CharacterView;
  candidateIndex: number;
  attempt: number;
  durationMs: number;
  estimatedCostUsd: number;
  result: "succeeded" | "failed";
  errorSummary?: string;
  statusCode?: number;
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
  speciesId?: MascotSpeciesId;
  positivePrompt?: string;
  negativePrompt?: string;
  styleHints?: ChannelBibleStyleHints;
};
