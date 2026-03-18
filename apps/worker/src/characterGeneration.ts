import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Prisma, PrismaClient } from "@prisma/client";
import { sha256Hex, stableStringify } from "@ec/shared";
import {
  buildMascotReferenceBankReviewPlan,
  buildCharacterPrompt,
  createCharacterProvider,
  deriveStyleHintsFromChannelBible,
  resolveEffectiveMascotReferenceBankStatus,
  resolveMascotSpeciesProfile,
  resolveProviderName,
  type CharacterCandidateProviderMeta,
  type CharacterGenerationCandidate,
  type CharacterReferenceBankEntry,
  type CharacterProviderCallLog,
  type CharacterProviderName,
  type CharacterProviderGenerateInput,
  type CharacterRepairLineage,
  type CharacterReferenceRole,
  type CharacterStructureControlImage,
  type CharacterStructureControlKind,
  type CharacterView,
  type CharacterWorkflowStage,
  type CharacterWorkflowStageOrigin,
  type MascotReferenceAssetEntry,
  type MascotReferenceBankManifest,
  type PromptQualityProfile
} from "@ec/image-gen";
import {
  BUILD_CHARACTER_PACK_JOB_NAME,
  REPO_ROOT,
  type CharacterAssetSelection,
  type CharacterGenerationPayload,
  type CharacterGenerationSelection,
  type CharacterGenerationView,
  type CharacterPackJobPayload,
  type EpisodeJobPayload
} from "./queue";
import { getAssetObject, makeStorageKey, putAssetObject } from "./assetStorage";
import { handleAssetIngestJob, type AssetIngestJobPayload } from "./assetIngest";

type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

type JobLogger = (jobId: string, level: string, message: string, details?: unknown) => Promise<void>;

type AddEpisodeJob = (
  name: string,
  payload: EpisodeJobPayload,
  maxAttempts: number,
  retryBackoffMs: number
) => Promise<{ id?: string | number }>;

type SetJobStatus = (
  jobId: string,
  status: JobStatus,
  patch?: Partial<{
    progress: number;
    attemptsMade: number;
    lastError: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
  }>
) => Promise<void>;

type SetEpisodeStatus = (
  episodeId: string,
  status: "GENERATING" | "PREVIEW_READY" | "COMPLETED" | "FAILED"
) => Promise<void>;

type GenerationHelpers = {
  logJob: JobLogger;
  setJobStatus: SetJobStatus;
  setEpisodeStatus: SetEpisodeStatus;
  addEpisodeJob: AddEpisodeJob;
};

type CharacterGenerationSessionDelegate = {
  findUnique: (args: unknown) => Promise<any>;
  findFirst: (args: unknown) => Promise<any>;
  findMany: (args: unknown) => Promise<any[]>;
  create: (args: unknown) => Promise<any>;
  update: (args: unknown) => Promise<any>;
};

type CharacterGenerationCandidateDelegate = {
  findMany: (args: unknown) => Promise<any[]>;
  deleteMany: (args: unknown) => Promise<any>;
  createMany: (args: unknown) => Promise<any>;
  updateMany: (args: unknown) => Promise<any>;
};

function getCharacterGenerationSessionDelegate(prisma: PrismaClient): CharacterGenerationSessionDelegate | null {
  const delegate = (prisma as unknown as Record<string, unknown>).characterGenerationSession;
  if (!delegate || typeof delegate !== "object") {
    return null;
  }
  const candidate = delegate as CharacterGenerationSessionDelegate;
  if (
    typeof candidate.findUnique !== "function" ||
    typeof candidate.findFirst !== "function" ||
    typeof candidate.findMany !== "function" ||
    typeof candidate.create !== "function" ||
    typeof candidate.update !== "function"
  ) {
    return null;
  }
  return candidate;
}

function getCharacterGenerationCandidateDelegate(prisma: PrismaClient): CharacterGenerationCandidateDelegate | null {
  const delegate = (prisma as unknown as Record<string, unknown>).characterGenerationCandidate;
  if (!delegate || typeof delegate !== "object") {
    return null;
  }
  const candidate = delegate as CharacterGenerationCandidateDelegate;
  if (
    typeof candidate.findMany !== "function" ||
    typeof candidate.deleteMany !== "function" ||
    typeof candidate.createMany !== "function" ||
    typeof candidate.updateMany !== "function"
  ) {
    return null;
  }
  return candidate;
}

type ImageAnalysis = {
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  alphaCoverage: number;
  bboxOccupancy: number;
  bboxCenterX: number;
  bboxCenterY: number;
  bboxScale: number;
  bboxAspectRatio: number;
  contrast: number;
  blurScore: number;
  noiseScore: number;
  watermarkTextRisk: number;
  edgeDensityBottomRight: number;
  upperFaceCoverage: number;
  upperAlphaRatio: number;
  headBoxAspectRatio: number;
  monochromeScore: number;
  paletteComplexity: number;
  symmetryScore: number;
  handRegionEdgeDensity: number;
  pawRoundnessScore: number;
  pawSymmetryScore: number;
  fingerSpikeScore: number;
  largestComponentShare: number;
  significantComponentCount: number;
  phash: string;
  palette: Array<[number, number, number]>;
};

type MascotSpecies = NonNullable<CharacterGenerationPayload["species"]>;

type CandidateScoreBreakdown = {
  alphaScore: number;
  occupancyScore: number;
  sharpnessScore: number;
  noiseScore: number;
  watermarkScore: number;
  resolutionScore: number;
  referenceScore: number;
  styleScore: number;
  qualityScore: number;
  targetStyleScore?: number;
  speciesScore?: number;
  speciesEarScore?: number;
  speciesMuzzleScore?: number;
  speciesHeadShapeScore?: number;
  speciesSilhouetteScore?: number;
  monochromeScore?: number;
  paletteSimplicityScore?: number;
  headRatioScore?: number;
  headSquarenessScore?: number;
  silhouetteScore?: number;
  frontSymmetryScore?: number;
  contrastScore?: number;
  pawStabilityScore?: number;
  pawRoundnessScore?: number;
  pawSymmetryScore?: number;
  fingerSafetyScore?: number;
  handRegionDensityScore?: number;
  subjectFillRatio?: number;
  subjectIsolationScore?: number;
  largestComponentShare?: number;
  significantComponentCount?: number;
  dogFrontReadabilityScore?: number;
  runtimeQualityScore?: number;
  runtimePenalty?: number;
  structureCoverageScore?: number;
  routeQualityScore?: number;
  runtimeWarningCount?: number;
  runtimeRejectionCount?: number;
  consistencyScore: number | null;
  consistencyParts?: {
    phash: number;
    palette: number;
    bboxCenter: number;
    bboxScale: number;
    upperAlpha: number;
    headAspect: number;
    upperFace: number;
    monochrome: number;
    paletteComplexity: number;
  };
  generationRound: number;
};

type ScoredCandidate = {
  candidate: CharacterGenerationCandidate;
  analysis: ImageAnalysis;
  score: number;
  styleScore: number;
  referenceSimilarity: number | null;
  consistencyScore: number | null;
  warnings: string[];
  rejections: string[];
  breakdown: CandidateScoreBreakdown;
};

type CandidateRuntimeQualityDiagnostics = {
  workflowStage?: string;
  selectedMode?: string;
  stageRequiresStrongStructure: boolean;
  structureControlApplied: boolean;
  requiredStructureKinds: CharacterStructureControlKind[];
  appliedStructureKinds: CharacterStructureControlKind[];
  missingStructureKinds: CharacterStructureControlKind[];
  preflightOk?: boolean;
  preflightWarnings: string[];
  adapterWarnings: string[];
  fallbackUsed: boolean;
  routeDegraded: boolean;
  warningReasons: string[];
  rejectionReasons: string[];
  qualityScore: number;
  penalty: number;
  structureCoverageScore: number;
  routeQualityScore: number;
};

type CandidateRuntimeBucketLevel = "clean" | "warn" | "degraded" | "compound" | "block";

type CandidateRuntimeBucketSummary = {
  level: CandidateRuntimeBucketLevel;
  tokens: string[];
  diagnostics: CandidateRuntimeQualityDiagnostics;
  summary: string;
};

type RepairDirectiveSeverity = "low" | "medium" | "high";
type RepairDirectiveFamily =
  | "identity_lock"
  | "face_symmetry"
  | "species_silhouette"
  | "paw_cleanup"
  | "body_silhouette"
  | "style_cleanup";

type RepairDirectiveProfileSummary = {
  families: RepairDirectiveFamily[];
  severity: RepairDirectiveSeverity;
  candidateCountBoost: number;
  acceptedScoreThresholdBoost: number;
  disablePose: boolean;
  notes: string[];
};

type PackCoherenceDiagnostics = {
  issues: string[];
  severity: "none" | "review" | "block";
  score: number;
  blockingViews: CharacterView[];
  warningViews: CharacterView[];
  metrics: {
    frontAnchorScore: number | null;
    frontSymmetryScore?: number | null;
    frontHeadSquarenessScore?: number | null;
    frontStyleScore: number | null;
    frontSpeciesScore: number | null;
    threeQuarterGeometryCue?: number | null;
    profileGeometryCue?: number | null;
    threeQuarterConsistency: number | null;
    profileConsistency: number | null;
    speciesSpread: number | null;
    styleSpread: number | null;
    headRatioSpread: number | null;
    monochromeSpread: number | null;
    earCueSpread?: number | null;
    muzzleCueSpread?: number | null;
    headShapeCueSpread?: number | null;
    silhouetteCueSpread?: number | null;
  };
};

type AutoRerouteStrategy = "targeted_view_retry" | "full_pack_rebuild";
type AutoRerouteTrigger =
  | "pack_coherence_block"
  | "pack_coherence_review"
  | "rig_instability_block"
  | "rig_instability_review"
  | "weak_front_anchor"
  | "continuity_miss"
  | "low_quality_views"
  | "runtime_degraded_views"
  | "missing_views";

type AutoRerouteDecision = {
  strategy: AutoRerouteStrategy;
  triggers: AutoRerouteTrigger[];
  targetViews: CharacterView[];
  candidateCountBoost: number;
  acceptedScoreThresholdBoost: number;
  seedOffset: number;
  notes: string[];
};

type AutoRerouteViewDelta = {
  beforeCandidateId?: string;
  afterCandidateId?: string;
  scoreDelta?: number;
  consistencyDelta?: number | null;
  warningDelta?: number;
  rejectionDelta?: number;
};

type AutoRerouteDiagnostics = {
  attempted: boolean;
  strategy?: AutoRerouteStrategy;
  triggers: AutoRerouteTrigger[];
  targetViews: CharacterView[];
  candidateCountBoost?: number;
  acceptedScoreThresholdBoost?: number;
  seedOffset?: number;
  notes: string[];
  initialMissingViews: CharacterView[];
  finalMissingViews?: CharacterView[];
  initialLowQualityViews: CharacterView[];
  finalLowQualityViews?: CharacterView[];
  initialPackCoherence?: PackCoherenceDiagnostics;
  finalPackCoherence?: PackCoherenceDiagnostics;
  viewDeltaByView?: Partial<Record<CharacterView, AutoRerouteViewDelta>>;
  recovered?: boolean;
  skippedReason?: string;
};

type SelectionRiskReason =
  | "front_anchor_soft"
  | "front_geometry_soft"
  | "front_style_soft"
  | "front_species_soft"
  | "three_quarter_geometry_soft"
  | "three_quarter_consistency_soft"
  | "profile_geometry_soft"
  | "profile_consistency_soft"
  | "species_spread_soft"
  | "style_spread_soft"
  | "head_ratio_spread_soft"
  | "monochrome_spread_soft"
  | "ear_cue_spread_soft"
  | "muzzle_cue_spread_soft"
  | "head_shape_cue_spread_soft"
  | "silhouette_cue_spread_soft"
  | "reference_bank_scaffold_only"
  | "selected_warning_density_high"
  | "selected_rejections_present"
  | "auto_reroute_failed"
  | "rig_anchor_confidence_soft"
  | "rig_landmark_consistency_soft"
  | "rig_review_only"
  | "runtime_quality_compounded"
  | "runtime_fallback_selected";

type SelectionRiskAssessment = {
  level: "none" | "review" | "block";
  reasonCodes: SelectionRiskReason[];
  suggestedAction?: "pick-manually" | "recreate";
  summary: string;
};

type ObservedDefectFamily =
  | "identity"
  | "consistency"
  | "head"
  | "face"
  | "ears"
  | "muzzle"
  | "paws"
  | "silhouette"
  | "style"
  | "body"
  | "rig"
  | "runtime";

type CandidateRigStabilitySnapshot = {
  anchorConfidence: number | null;
  landmarkConsistency: number | null;
  lowAnchorConfidence: boolean;
  hardLowAnchorConfidence: boolean;
  lowLandmarkConsistency: boolean;
  hardLowLandmarkConsistency: boolean;
  safeFrontExpression: boolean;
  suppressAggressiveYaw: boolean;
  lockMouthPreset: boolean;
  reasonCodes: string[];
  reasonFamilies?: RigRepairReasonFamily[];
  repairRecommendations?: RigRepairRecommendation[];
  preferredAction?: RigRepairAction;
};

type RigAnchorTarget =
  | "head_center"
  | "mouth_center"
  | "eye_near"
  | "eye_far"
  | "ear_near"
  | "ear_far"
  | "paw_anchor"
  | "tail_root";

type RigRepairReasonFamily =
  | "repairable_anchor"
  | "repairable_landmark"
  | "species_misread"
  | "protective_fallback"
  | "recreate_required";

type RigRepairAction =
  | "monitor"
  | "regenerate-view"
  | "manual-compare"
  | "protective-fallback"
  | "recreate-pack";

type RigRepairRecommendation = {
  view: CharacterView;
  family: RigRepairReasonFamily;
  action: RigRepairAction;
  priority: "low" | "medium" | "high";
  reasonCode: string;
  summary: string;
  repairable: boolean;
  anchorTargets?: RigAnchorTarget[];
};

type RigViewRepairPlan = {
  status: "ok" | "review" | "block";
  familyCodes: RigRepairReasonFamily[];
  anchorTargets: RigAnchorTarget[];
  preferredAction?: RigRepairAction;
  recommendations: RigRepairRecommendation[];
};

type RigStabilityDiagnostics = {
  severity: "none" | "review" | "block";
  summary: string;
  reasonCodes: string[];
  fallbackReasonCodes: string[];
  warningViews: CharacterView[];
  blockingViews: CharacterView[];
  reviewOnly: boolean;
  safeFrontExpression: boolean;
  suppressAggressiveYaw: boolean;
  lockMouthPreset: boolean;
  anchorConfidenceOverall: number | null;
  anchorConfidenceByView: Partial<Record<CharacterView, number | null>>;
  landmarkConsistencyByView: Partial<Record<CharacterView, number | null>>;
  suggestedAction?: "pick-manually" | "recreate";
  reasonFamilies?: RigRepairReasonFamily[];
  repairability?: "none" | "surgical" | "manual" | "recreate";
  repairRecommendations?: RigRepairRecommendation[];
  repairPlanByView?: Partial<Record<CharacterView, RigViewRepairPlan>>;
};

type QualityEmbargoAssessment = {
  level: "none" | "review" | "block";
  reasonCodes: string[];
  summary: string;
  suggestedAction?: "pick-manually" | "recreate";
  blockingViews?: CharacterView[];
  warningViews?: CharacterView[];
  defectFamiliesByView?: Partial<Record<CharacterView, ObservedDefectFamily[]>>;
};

type PackDefectSummary = {
  defectFamiliesByView?: Partial<Record<CharacterView, ObservedDefectFamily[]>>;
  repeatedFamilies: ObservedDefectFamily[];
  blockingFamilies: ObservedDefectFamily[];
  warningFamilies: ObservedDefectFamily[];
  persistentFamiliesByView?: Partial<Record<CharacterView, ObservedDefectFamily[]>>;
};

type FinalQualityFirewallAssessment = {
  level: "none" | "review" | "block";
  reasonCodes: string[];
  summary: string;
  suggestedAction?: "pick-manually" | "recreate";
  blockingViews?: CharacterView[];
  warningViews?: CharacterView[];
  repeatedFamilies?: ObservedDefectFamily[];
  persistentFamiliesByView?: Partial<Record<CharacterView, ObservedDefectFamily[]>>;
};

type SelectionDecisionOutcome = {
  kind: "auto_selected" | "hitl_review" | "hitl_selected";
  status: "ok" | "review" | "blocked";
  sourceStage?: string;
  summary: string;
  reasonCodes: string[];
  recoveryAttempted: boolean;
  recoveredViews?: CharacterView[];
  escalatedAction?: "pick-manually" | "recreate";
  worstRuntimeBucket?: CandidateRuntimeBucketLevel;
};

type StageRunViewOutcomeSummary = {
  candidateId?: string;
  score?: number;
  consistencyScore?: number | null;
  warningCount: number;
  rejectionCount: number;
  passed: boolean;
  failureReasons: string[];
  runtimeBucket?: CandidateRuntimeBucketLevel;
};

type SelectionCandidateSummary = {
  candidateId: string;
  score?: number;
  consistencyScore?: number | null;
  anchorConfidence?: number | null;
  landmarkConsistency?: number | null;
  warningCount?: number;
  rejectionCount?: number;
  runtimeBucket?: CandidateRuntimeBucketLevel;
  rigFallbackReasonCodes?: string[];
  rigReasonFamilies?: RigRepairReasonFamily[];
  rigRepairability?: "none" | "surgical" | "manual" | "recreate";
  rigPreferredAction?: RigRepairAction;
};

type SideViewAcceptanceGateDecision =
  | "missing_candidate"
  | "keep_base"
  | "hold_refine"
  | "hold_lock"
  | "promote_refine"
  | "promote_lock"
  | "reject_refine"
  | "reject_lock";

type SideViewAcceptanceGateDecisionSummary = {
  decision: SideViewAcceptanceGateDecision;
  chosenCandidateId?: string;
  chosenStage?: string;
  baseCandidateId?: string;
  refineCandidateId?: string;
  lockCandidateId?: string;
  scoreDeltaVsBase?: number;
  consistencyDeltaVsBase?: number | null;
  reasons: string[];
};

type RepairTriageDecision =
  | "missing_candidate"
  | "skip_repair"
  | "targeted_repair"
  | "full_repair"
  | "reject_view";

type RepairTriageDecisionSummary = {
  decision: RepairTriageDecision;
  priority: "low" | "medium" | "high";
  sourceCandidateId?: string;
  sourceStage?: string;
  sourcePassLabel?: string;
  targetStage?: string;
  acceptedByGate?: boolean;
  gateDecision?: SideViewAcceptanceGateDecision;
  repairFamilies?: RepairDirectiveFamily[];
  score?: number;
  consistencyScore?: number | null;
  reasonCodes: string[];
};

type PostRepairAcceptanceDecision =
  | "missing_repair_candidate"
  | "keep_pre_repair"
  | "reject_repair"
  | "promote_repair"
  | "hold_repair";

type PostRepairAcceptanceDecisionSummary = {
  decision: PostRepairAcceptanceDecision;
  chosenCandidateId?: string;
  chosenStage?: string;
  preRepairCandidateId?: string;
  preRepairStage?: string;
  repairCandidateId?: string;
  repairStage?: string;
  scoreDeltaVsPreRepair?: number;
  consistencyDeltaVsPreRepair?: number | null;
  rejectionDeltaVsPreRepair?: number;
  warningDeltaVsPreRepair?: number;
  defectDeltaVsPreRepair?: number;
  introducedCriticalFamilies?: ObservedDefectFamily[];
  reasonCodes: string[];
};

type StageRunReferenceRoleMixSummary = {
  count: number;
  weightSum: number;
};

type StageRunReferenceMixSummary = {
  totalEntries: number;
  totalWeight: number;
  roles: Partial<Record<CharacterReferenceBankEntry["role"], StageRunReferenceRoleMixSummary>>;
};

type StructureGuideQualityMetrics = {
  kind: CharacterStructureControlKind;
  signalCoverage: number;
  dynamicRange: number;
  meanLuma: number;
  stdDev: number;
  score: number;
  status: "ok" | "review" | "block";
  reasonCodes: string[];
};

type StructureGuideSourceDiagnostics = {
  sourceRole?: CharacterReferenceRole;
  sourceRefId?: string;
  sourceView?: CharacterView;
  allowedRoles?: CharacterReferenceRole[];
  requiredPrimaryRole?: CharacterReferenceRole;
  status: "ok" | "review" | "block";
  reasonCodes: string[];
};

type StageInputPreflightViewDiagnostics = {
  status: "ok" | "review" | "block";
  reasonCodes: string[];
  requiredReferenceRoles?: CharacterReferenceBankEntry["role"][];
  missingReferenceRoles?: CharacterReferenceBankEntry["role"][];
  weakReferenceRoles?: CharacterReferenceBankEntry["role"][];
  requiredStructureKinds?: CharacterStructureControlKind[];
  missingStructureKinds?: CharacterStructureControlKind[];
  weakStructureKinds?: CharacterStructureControlKind[];
  invalidStructureSourceKinds?: CharacterStructureControlKind[];
  missingPrimaryStructureSourceKinds?: CharacterStructureControlKind[];
  referenceRoleWeights?: Partial<Record<CharacterReferenceBankEntry["role"], number>>;
  referenceAlphaCoverage?: number;
  referenceMonochromeScore?: number;
  structureGuideMetrics?: Partial<Record<CharacterStructureControlKind, StructureGuideQualityMetrics>>;
  structureGuideSources?: Partial<Record<CharacterStructureControlKind, StructureGuideSourceDiagnostics>>;
};

type StageInputPreflightAssessment = {
  status: "ok" | "review" | "block";
  executionViews: CharacterView[];
  blockedViews: CharacterView[];
  warningViews: CharacterView[];
  diagnosticsByView: Partial<Record<CharacterView, StageInputPreflightViewDiagnostics>>;
  summary: string;
};

type GenerationManifest = {
  schemaVersion: "1.0";
  templateVersion?: string;
  inputHash: string;
  manifestHash: string;
  status: "PENDING_HITL" | "AUTO_SELECTED" | "HITL_SELECTED";
  sessionId?: string;
  episodeId: string;
  characterPackId: string;
  provider: string;
  providerRequested?: string | null;
  providerWarning?: string | null;
  workflowHash: string;
  generatedAt: string;
  mode: string;
  promptPreset: string;
  species?: string;
  qualityProfileId?: string;
  qualityProfile?: PromptQualityProfile;
  positivePrompt: string;
  negativePrompt: string;
  guardrails: string[];
  selectionHints?: {
    minAcceptedScore?: number;
    frontMasterMinAcceptedScore?: number;
    autoRetryRounds?: number;
    frontMasterCandidateCount?: number;
    repairCandidateCount?: number;
    repairScoreFloor?: number;
    sequentialReference?: boolean;
    prioritizeConsistency?: boolean;
    preferMultiReference?: boolean;
  };
  packCoherence?: PackCoherenceDiagnostics;
  autoReroute?: AutoRerouteDiagnostics;
  providerMeta?: {
    qualityProfileId?: string;
    runSettings?: Partial<PromptQualityProfile>;
    workflowStage?: string;
    workflowTemplateVersion?: string;
    stagePlan?: {
      stage: string;
      templateVersion: string;
      templateSpecPath?: string;
      views?: CharacterView[];
      candidateCount?: number;
      acceptedScoreThreshold?: number;
      referenceBankSize?: number;
      repairFromCandidateId?: string;
      repairFromStage?: string;
      acceptedByGate?: boolean;
      gateDecision?: string;
      sourcePassLabel?: string;
      referenceLineage?: string[];
      origin?: CharacterWorkflowStageOrigin;
      passLabel?: string;
      reasonCodes?: string[];
      triggerViews?: CharacterView[];
      seedOffset?: number;
    };
    capabilitySnapshot?: Record<string, unknown>;
    workflowExports?: {
      apiPromptPath?: string;
      guiWorkflowPath?: string;
      summaryPath?: string;
    };
    warnings?: string[];
    selectionDiagnostics?: Record<string, unknown>;
  };
  workflowStages?: Array<{
    stage: string;
    templateVersion: string;
    templateSpecPath?: string;
    origin?: CharacterWorkflowStageOrigin;
    passLabel?: string;
    reasonCodes?: string[];
    triggerViews?: CharacterView[];
    seedOffset?: number;
    views: CharacterView[];
    candidateCount: number;
    acceptedScoreThreshold: number;
    roundsAttempted: number;
    referenceBankSizeByView?: Partial<Record<CharacterView, number>>;
    referenceMixByView?: Partial<Record<CharacterView, StageRunReferenceMixSummary>>;
    preflightByView?: Partial<Record<CharacterView, StageInputPreflightViewDiagnostics>>;
    executionViews?: CharacterView[];
    blockedViewsByPreflight?: CharacterView[];
    warningViewsByPreflight?: CharacterView[];
    adjustmentNotesByView?: Partial<Record<CharacterView, string[]>>;
    directiveProfilesByView?: Partial<Record<CharacterView, RepairDirectiveProfileSummary>>;
    repairFromCandidateIds?: Partial<Record<CharacterView, string>>;
    observedDefectFamiliesByView?: Partial<Record<CharacterView, ObservedDefectFamily[]>>;
    passedViews?: CharacterView[];
    failedViews?: CharacterView[];
    failureReasonsByView?: Partial<Record<CharacterView, string[]>>;
    runtimeVariantTags?: string[];
    bestCandidateSummaryByView?: Partial<Record<CharacterView, StageRunViewOutcomeSummary>>;
    gateDecisionsByView?: Partial<Record<CharacterView, SideViewAcceptanceGateDecisionSummary>>;
    repairTriageByView?: Partial<Record<CharacterView, RepairTriageDecisionSummary>>;
    repairAcceptanceByView?: Partial<Record<CharacterView, PostRepairAcceptanceDecisionSummary>>;
  }>;
  reference: {
    assetId: string | null;
    sourceSessionId?: string | null;
    starterPath?: string | null;
    starterPathsByView?: Partial<Record<CharacterView, string>>;
    phash: string | null;
    palette: Array<[number, number, number]> | null;
    continuity?: {
      enabled: boolean;
      attempted: boolean;
      applied: boolean;
      reason: string;
      attemptedSourceSessionId?: string;
      cutoffUpdatedAt?: string;
      queuedSessionCount?: number;
      uniqueQueuedSessionCount?: number;
      duplicateSessionCount?: number;
      searchedSessionCount?: number;
      searchedSessionIdsPreview?: string[];
      preferredPoolCount?: number;
      fallbackPoolCount?: number;
      sourcePool?: "preferred" | "fallback";
      candidatePicked?: boolean;
      candidateScore?: number | null;
      candidateRejectionCount?: number | null;
      candidateUpdatedAt?: string | null;
      policy?: {
        maxSessionAgeHours: number;
        minScore: number;
        maxRejections: number;
        requirePicked: boolean;
        requireScore: boolean;
        candidateTake: number;
        preferredSessionTake: number;
        fallbackSessionTake: number;
        requestOverride: boolean | null;
      };
    };
  };
  candidates: Array<{
    id: string;
    provider?: string;
    view: CharacterView;
    candidateIndex: number;
    seed: number;
    mimeType: string;
    filePath: string;
    score: number;
    styleScore: number;
    referenceSimilarity: number | null;
    consistencyScore: number | null;
    warnings: string[];
    rejections: string[];
    breakdown?: CandidateScoreBreakdown;
    providerMeta?: CharacterCandidateProviderMeta;
  }>;
  selectedByView: Partial<Record<CharacterView, { candidateId: string; assetId?: string; assetIngestJobId?: string }>>;
};

function withManifestHashes(
  manifest: Omit<GenerationManifest, "inputHash" | "manifestHash">
): GenerationManifest {
  const candidateFingerprint = manifest.candidates
    .map((candidate) => ({
      id: candidate.id,
      view: candidate.view,
      candidateIndex: candidate.candidateIndex,
      seed: candidate.seed,
      filePath: candidate.filePath
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const inputHash = sha256Hex(
    stableStringify({
      episodeId: manifest.episodeId,
      characterPackId: manifest.characterPackId,
      templateVersion: manifest.templateVersion ?? null,
      mode: manifest.mode,
      promptPreset: manifest.promptPreset,
      species: manifest.species ?? null,
      qualityProfileId: manifest.qualityProfileId ?? null,
      positivePrompt: manifest.positivePrompt,
      negativePrompt: manifest.negativePrompt,
      workflowHash: manifest.workflowHash,
      provider: manifest.provider,
      workflowStages: manifest.workflowStages ?? [],
      candidateFingerprint
    })
  );
  const manifestWithInput = {
    ...manifest,
    inputHash
  };
  const manifestHash = sha256Hex(stableStringify(manifestWithInput));
  return {
    ...manifestWithInput,
    manifestHash
  };
}

const CHARACTER_VIEWS: CharacterView[] = ["front", "threeQuarter", "profile"];

const ULTRA_WORKFLOW_TEMPLATE_VERSION = "ultra_mascot_v1";
const ULTRA_STAGE_TEMPLATE_VERSIONS: Record<
  Exclude<CharacterWorkflowStage, "video_broll">,
  string
> = {
  front_master: "ultra_front_master_v1",
  side_view_base: "ultra_side_view_base_v1",
  side_view_refine: "ultra_side_view_refine_v1",
  identity_lock_refine: "ultra_identity_lock_refine_v1",
  view_only: "ultra_view_only_v1",
  repair_refine: "ultra_repair_refine_v1"
};
const ULTRA_STAGE_TEMPLATE_SPEC_PATHS: Record<
  Exclude<CharacterWorkflowStage, "video_broll">,
  string
> = {
  front_master: path.join(REPO_ROOT, "workflows", "comfy", "character", "front_master", "ultra_front_master_v1.stage.json"),
  side_view_base: path.join(REPO_ROOT, "workflows", "comfy", "character", "side_view_base", "ultra_side_view_base_v1.stage.json"),
  side_view_refine: path.join(REPO_ROOT, "workflows", "comfy", "character", "side_view_refine", "ultra_side_view_refine_v1.stage.json"),
  identity_lock_refine: path.join(
    REPO_ROOT,
    "workflows",
    "comfy",
    "character",
    "identity_lock_refine",
    "ultra_identity_lock_refine_v1.stage.json"
  ),
  view_only: path.join(REPO_ROOT, "workflows", "comfy", "character", "view_only", "ultra_view_only_v1.stage.json"),
  repair_refine: path.join(REPO_ROOT, "workflows", "comfy", "character", "repair_refine", "ultra_repair_refine_v1.stage.json")
};

type InlineImageReference = {
  referenceImageBase64: string;
  referenceMimeType?: string;
};

type StageRunSummary = {
  stage: string;
  templateVersion: string;
  templateSpecPath?: string;
  origin?: CharacterWorkflowStageOrigin;
  passLabel?: string;
  reasonCodes?: string[];
  triggerViews?: CharacterView[];
  seedOffset?: number;
  views: CharacterView[];
  candidateCount: number;
  acceptedScoreThreshold: number;
  roundsAttempted: number;
  referenceBankSizeByView?: Partial<Record<CharacterView, number>>;
  referenceMixByView?: Partial<Record<CharacterView, StageRunReferenceMixSummary>>;
  adjustmentNotesByView?: Partial<Record<CharacterView, string[]>>;
  directiveProfilesByView?: Partial<Record<CharacterView, RepairDirectiveProfileSummary>>;
  repairFromCandidateIds?: Partial<Record<CharacterView, string>>;
  observedDefectFamiliesByView?: Partial<Record<CharacterView, ObservedDefectFamily[]>>;
  passedViews?: CharacterView[];
  failedViews?: CharacterView[];
  failureReasonsByView?: Partial<Record<CharacterView, string[]>>;
  runtimeVariantTags?: string[];
  bestCandidateSummaryByView?: Partial<Record<CharacterView, StageRunViewOutcomeSummary>>;
  gateDecisionsByView?: Partial<Record<CharacterView, SideViewAcceptanceGateDecisionSummary>>;
  repairTriageByView?: Partial<Record<CharacterView, RepairTriageDecisionSummary>>;
  repairAcceptanceByView?: Partial<Record<CharacterView, PostRepairAcceptanceDecisionSummary>>;
};

type GenerationStageKey = "front" | "view_only" | "angles" | "refine" | "lock" | "repair";

function inlineReferenceFromCandidate(candidate: CharacterGenerationCandidate): InlineImageReference {
  return {
    referenceImageBase64: candidate.data.toString("base64"),
    referenceMimeType: candidate.mimeType
  };
}

function summarizeStageBestCandidateByView(input: {
  views: CharacterView[];
  bestByView: Partial<Record<CharacterView, ScoredCandidate>>;
  acceptedScoreThreshold: number;
  targetStyle: string;
  speciesId?: string;
}): Partial<Record<CharacterView, StageRunViewOutcomeSummary>> | undefined {
  const out: Partial<Record<CharacterView, StageRunViewOutcomeSummary>> = {};
  for (const view of input.views) {
    const candidate = input.bestByView[view];
    if (!candidate) {
      out[view] = {
        warningCount: 0,
        rejectionCount: 0,
        passed: false,
        failureReasons: ["missing_candidate"]
      };
      continue;
    }

    const runtimeBucket = classifyCandidateRuntimeBucket({
      candidate,
      targetStyle: input.targetStyle
    });
    const failureReasons: string[] = [];
    if (
      view === "front" &&
      !isStrongFrontMasterCandidate(candidate, input.targetStyle, input.acceptedScoreThreshold, input.speciesId)
    ) {
      failureReasons.push("front_anchor_weak");
    }
    if (candidate.rejections.length > 0) {
      failureReasons.push(...candidate.rejections);
    }
    if (hasBlockingConsistencyRecoveryIssue(candidate, input.speciesId)) {
      failureReasons.push("consistency_recovery_needed");
    }
    if (candidate.score < input.acceptedScoreThreshold) {
      failureReasons.push("below_stage_threshold");
    }

    out[view] = {
      candidateId: candidate.candidate.id,
      score: Number(candidate.score.toFixed(4)),
      ...(typeof candidate.consistencyScore === "number"
        ? { consistencyScore: Number(candidate.consistencyScore.toFixed(4)) }
        : candidate.consistencyScore === null
          ? { consistencyScore: null }
          : {}),
      warningCount: candidate.warnings.length,
      rejectionCount: candidate.rejections.length,
      passed: failureReasons.length === 0,
      failureReasons: dedupeStrings(failureReasons),
      runtimeBucket: runtimeBucket.level
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function summarizeSelectionCandidate(input: {
  candidate: ScoredCandidate;
  targetStyle?: string;
  acceptedScoreThreshold: number;
}): SelectionCandidateSummary {
  const runtimeBucket = classifyCandidateRuntimeBucket({
    candidate: input.candidate,
    targetStyle: input.targetStyle
  });
  const rig = summarizeCandidateRigStability({
    candidate: input.candidate
  });
  const rigFallbackReasonCodes = dedupeStrings(
    [
      rig.safeFrontExpression ? "safe_front_expression" : "",
      rig.suppressAggressiveYaw ? "suppress_aggressive_yaw" : "",
      rig.lockMouthPreset ? "lock_mouth_preset" : ""
    ].filter((reason) => reason.length > 0)
  );
  const rigRepairability: SelectionCandidateSummary["rigRepairability"] =
    rig.hardLowAnchorConfidence || rig.hardLowLandmarkConsistency
      ? "manual"
      : (rig.repairRecommendations?.some((entry) => entry.action === "regenerate-view") ?? false)
        ? "surgical"
        : rig.repairRecommendations && rig.repairRecommendations.length > 0
          ? "manual"
          : "none";
  return {
    candidateId: input.candidate.candidate.id,
    score: Number(input.candidate.score.toFixed(4)),
    consistencyScore:
      typeof input.candidate.consistencyScore === "number"
        ? Number(input.candidate.consistencyScore.toFixed(4))
        : null,
    anchorConfidence: rig.anchorConfidence,
    landmarkConsistency: rig.landmarkConsistency,
    warningCount: input.candidate.warnings.length,
    rejectionCount: input.candidate.rejections.length,
    runtimeBucket: runtimeBucket.level,
    ...(rigFallbackReasonCodes.length > 0 ? { rigFallbackReasonCodes } : {}),
    ...(rig.reasonFamilies && rig.reasonFamilies.length > 0 ? { rigReasonFamilies: rig.reasonFamilies } : {}),
    ...(rigRepairability !== "none" ? { rigRepairability } : {}),
    ...(rig.preferredAction ? { rigPreferredAction: rig.preferredAction } : {})
  };
}

function summarizeSelectionCandidateSummaryByView(input: {
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  targetStyle?: string;
  acceptedScoreThreshold: number;
}): Partial<Record<CharacterView, SelectionCandidateSummary>> | undefined {
  const out = Object.fromEntries(
    (Object.entries(input.selectedByView) as Array<[CharacterView, ScoredCandidate]>).map(([view, candidate]) => [
      view,
      summarizeSelectionCandidate({
        candidate,
        targetStyle: input.targetStyle,
        acceptedScoreThreshold: input.acceptedScoreThreshold
      })
    ])
  ) as Partial<Record<CharacterView, SelectionCandidateSummary>>;
  return Object.keys(out).length > 0 ? out : undefined;
}

function summarizeReferenceMix(entries: CharacterReferenceBankEntry[] | undefined): StageRunReferenceMixSummary | undefined {
  if (!Array.isArray(entries) || entries.length === 0) {
    return undefined;
  }

  const roles = entries.reduce<StageRunReferenceMixSummary["roles"]>((acc, entry) => {
    const current = acc[entry.role] ?? { count: 0, weightSum: 0 };
    acc[entry.role] = {
      count: current.count + 1,
      weightSum: Number((current.weightSum + (typeof entry.weight === "number" ? entry.weight : 0)).toFixed(3))
    };
    return acc;
  }, {});
  const totalWeight = entries.reduce(
    (sum, entry) => Number((sum + (typeof entry.weight === "number" ? entry.weight : 0)).toFixed(3)),
    0
  );

  return {
    totalEntries: entries.length,
    totalWeight,
    roles
  };
}

function summarizeReferenceMixByView(input: {
  views: CharacterView[];
  sharedReferenceBank?: CharacterReferenceBankEntry[];
  referenceBankByView?: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
}): Partial<Record<CharacterView, StageRunReferenceMixSummary>> | undefined {
  const out: Partial<Record<CharacterView, StageRunReferenceMixSummary>> = {};
  for (const view of input.views) {
    const bank = input.referenceBankByView?.[view] ?? input.sharedReferenceBank;
    const summary = summarizeReferenceMix(bank);
    if (summary) {
      out[view] = summary;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function roundPreflightMetric(value: number): number {
  return Number(value.toFixed(4));
}

function resolveStageInputRequiredReferenceRoles(
  stage: GenerationStageKey,
  view?: CharacterView
): CharacterReferenceBankEntry["role"][] {
  if (stage === "front") {
    return ["style"];
  }
  if (stage === "repair") {
    return ["repair_base", "front_master", "composition"];
  }
  if (stage === "lock") {
    return ["front_master", "composition"];
  }
  if (stage === "view_only" && view === "front") {
    return ["front_master"];
  }
  if (stage === "refine" || stage === "view_only") {
    return ["front_master", "composition"];
  }
  return ["front_master", "composition"];
}

export function resolveStageInputMinimumReferenceWeights(
  stage: GenerationStageKey,
  view?: CharacterView
): Partial<Record<CharacterReferenceBankEntry["role"], number>> {
  if (stage === "front") {
    return {
      style: 0.28
    };
  }
  if (stage === "repair") {
    return {
      repair_base: 0.72,
      front_master: 0.82,
      composition: 0.24
    };
  }
  if (stage === "angles") {
    return {
      front_master: view === "profile" ? 0.48 : 0.54,
      composition: 0.48,
      view_starter: 0.42
    };
  }
  if (stage === "lock") {
    return {
      front_master: view === "profile" ? 0.64 : 0.66,
      composition: 0.16
    };
  }
  if (stage === "refine") {
    return {
      front_master: view === "profile" ? 0.68 : 0.7,
      composition: 0.18
    };
  }
  if (stage === "view_only") {
    if (view === "front") {
      return {
        front_master: 0.84
      };
    }
    return {
      front_master: view === "profile" ? 0.68 : 0.7,
      composition: 0.24
    };
  }
  return {
    front_master: 0.86,
    composition: 0.26
  };
}

async function analyzeStructureGuideImage(input: {
  kind: CharacterStructureControlKind;
  image: CharacterStructureControlImage;
}): Promise<StructureGuideQualityMetrics> {
  const buffer = Buffer.from(input.image.imageBase64, "base64");
  const { data } = await sharp(buffer, { limitInputPixels: false })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = data.byteLength;
  if (pixelCount === 0) {
    return {
      kind: input.kind,
      signalCoverage: 0,
      dynamicRange: 0,
      meanLuma: 0,
      stdDev: 0,
      score: 0,
      status: "block",
      reasonCodes: ["guide_empty"]
    };
  }

  let min = 255;
  let max = 0;
  let sum = 0;
  let sumSquares = 0;
  let signalPixels = 0;
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index];
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
    sumSquares += value * value;
    if (value >= 12) {
      signalPixels += 1;
    }
  }
  const mean = sum / pixelCount / 255;
  const variance = Math.max(0, sumSquares / pixelCount - (sum / pixelCount) ** 2);
  const stdDev = Math.sqrt(variance) / 255;
  const signalCoverage = signalPixels / pixelCount;
  const dynamicRange = (max - min) / 255;
  const reasonCodes: string[] = [];
  let score = 1;

  if (input.kind === "depth") {
    if (dynamicRange < 0.08) {
      score -= 0.62;
      reasonCodes.push("depth_range_too_flat");
    } else if (dynamicRange < 0.14) {
      score -= 0.3;
      reasonCodes.push("depth_range_soft");
    }
    if (stdDev < 0.04) {
      score -= 0.48;
      reasonCodes.push("depth_signal_too_flat");
    } else if (stdDev < 0.06) {
      score -= 0.18;
      reasonCodes.push("depth_signal_soft");
    }
  } else {
    if (signalCoverage < 0.006) {
      score -= 0.7;
      reasonCodes.push("guide_too_sparse");
    } else if (signalCoverage < 0.015) {
      score -= 0.28;
      reasonCodes.push("guide_sparse");
    }
    if (signalCoverage > 0.58) {
      score -= 0.22;
      reasonCodes.push("guide_too_dense");
    }
    if (dynamicRange < 0.14) {
      score -= 0.54;
      reasonCodes.push("guide_range_too_flat");
    } else if (dynamicRange < 0.24) {
      score -= 0.22;
      reasonCodes.push("guide_range_soft");
    }
    if (stdDev < 0.055) {
      score -= 0.36;
      reasonCodes.push("guide_signal_too_flat");
    } else if (stdDev < 0.085) {
      score -= 0.14;
      reasonCodes.push("guide_signal_soft");
    }
  }

  score = clamp01(score);
  const status = score < 0.42 ? "block" : score < 0.7 ? "review" : "ok";
  return {
    kind: input.kind,
    signalCoverage: roundPreflightMetric(signalCoverage),
    dynamicRange: roundPreflightMetric(dynamicRange),
    meanLuma: roundPreflightMetric(mean),
    stdDev: roundPreflightMetric(stdDev),
    score: roundPreflightMetric(score),
    status,
    reasonCodes
  };
}

function normalizeStructureGuideMetricsForPreflight(input: {
  stage: GenerationStageKey;
  view: CharacterView;
  metrics: Partial<Record<CharacterStructureControlKind, StructureGuideQualityMetrics>>;
}): Partial<Record<CharacterStructureControlKind, StructureGuideQualityMetrics>> {
  if (input.stage !== "repair" || input.view === "front") {
    return input.metrics;
  }

  const depth = input.metrics.depth;
  const depthStrong =
    depth?.status === "ok" &&
    (depth.score ?? 0) >= 0.9 &&
    (depth.signalCoverage ?? 0) >= 0.2 &&
    (depth.dynamicRange ?? 0) >= 0.14;
  if (!depthStrong) {
    return input.metrics;
  }

  const softSparseReasons = new Set(["guide_too_sparse", "guide_sparse", "guide_signal_soft"]);
  const next: Partial<Record<CharacterStructureControlKind, StructureGuideQualityMetrics>> = {
    ...input.metrics
  };
  for (const kind of ["lineart", "canny"] as const) {
    const metric = input.metrics[kind];
    if (!metric || metric.status === "ok") {
      continue;
    }
    const reasonCodes = Array.isArray(metric.reasonCodes) ? metric.reasonCodes : [];
    if (reasonCodes.length === 0 || !reasonCodes.every((reason) => softSparseReasons.has(reason))) {
      continue;
    }
    next[kind] = {
      ...metric,
      score: roundPreflightMetric(Math.max(metric.score, 0.58)),
      status: "review",
      reasonCodes: dedupeStrings([...reasonCodes, "repair_sparse_guide_softened"])
    };
  }
  return next;
}

export function assessStageInputPreflight(input: {
  stage: GenerationStageKey;
  views: CharacterView[];
  targetStyle?: string;
  referenceBank?: CharacterReferenceBankEntry[];
  referenceBankByView?: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
  referenceAnalysisByView?: Partial<Record<CharacterView, Pick<ImageAnalysis, "alphaCoverage" | "monochromeScore">>>;
  structureControlsByView?: Partial<Record<CharacterView, Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>>>>;
  structureGuideMetricsByView?: Partial<
    Record<CharacterView, Partial<Record<CharacterStructureControlKind, StructureGuideQualityMetrics>>>
  >;
}): StageInputPreflightAssessment {
  if (!isMascotTargetStyle(input.targetStyle)) {
    return {
      status: "ok",
      executionViews: [...input.views],
      blockedViews: [],
      warningViews: [],
      diagnosticsByView: {},
      summary: "preflight skipped"
    };
  }

  const diagnosticsByView: Partial<Record<CharacterView, StageInputPreflightViewDiagnostics>> = {};
  const blockedViews: CharacterView[] = [];
  const warningViews: CharacterView[] = [];

  for (const view of input.views) {
    const requiredReferenceRoles = resolveStageInputRequiredReferenceRoles(input.stage, view);
    const minimumRoleWeights = resolveStageInputMinimumReferenceWeights(input.stage, view);
    const requiredStructureKinds = resolveStructureControlKindsForStage(input.stage, view);
    const bank = input.referenceBankByView?.[view] ?? input.referenceBank ?? [];
    const referenceRoleWeights = bank.reduce<Partial<Record<CharacterReferenceBankEntry["role"], number>>>((acc, entry) => {
      const current = acc[entry.role] ?? 0;
      acc[entry.role] = Number((current + (typeof entry.weight === "number" ? entry.weight : 0)).toFixed(3));
      return acc;
    }, {});
    const missingReferenceRoles = requiredReferenceRoles.filter((role) => !bank.some((entry) => entry.role === role));
    const weakReferenceRoles = requiredReferenceRoles.filter((role) => {
      const minimum = minimumRoleWeights[role];
      if (typeof minimum !== "number") {
        return false;
      }
      return (referenceRoleWeights[role] ?? 0) < minimum;
    });
    const viewStructureControls = input.structureControlsByView?.[view] ?? {};
    const viewStructureMetrics = normalizeStructureGuideMetricsForPreflight({
      stage: input.stage,
      view,
      metrics: input.structureGuideMetricsByView?.[view] ?? {}
    });
    const suppliedStructureKinds = Object.keys(viewStructureMetrics) as CharacterStructureControlKind[];
    const missingStructureKinds = requiredStructureKinds.filter((kind) => !suppliedStructureKinds.includes(kind));
    const weakStructureKinds = requiredStructureKinds.filter((kind) => {
      const metric = viewStructureMetrics[kind];
      return metric?.status === "block" || metric?.status === "review";
    });
    const structureSourceDiagnostics = requiredStructureKinds.reduce<
      Partial<Record<CharacterStructureControlKind, StructureGuideSourceDiagnostics>>
    >((acc, kind) => {
      const diagnostics = buildStructureGuideSourceDiagnostics({
        stage: input.stage,
        targetView: view,
        kind,
        image: viewStructureControls[kind],
        referenceBank: bank
      });
      if (diagnostics) {
        acc[kind] = diagnostics;
      }
      return acc;
    }, {});
    const invalidStructureSourceKinds = requiredStructureKinds.filter((kind) => {
      const diagnostics = structureSourceDiagnostics[kind];
      return diagnostics?.status === "block";
    });
    const missingPrimaryStructureSourceKinds = requiredStructureKinds.filter((kind) =>
      (structureSourceDiagnostics[kind]?.reasonCodes ?? []).some((reason) => reason.startsWith("non_primary_structure_source_role:"))
    );
    const reasonCodes: string[] = [];
    for (const role of missingReferenceRoles) {
      reasonCodes.push(`missing_reference_role:${role}`);
    }
    for (const role of weakReferenceRoles) {
      reasonCodes.push(`weak_reference_role:${role}`);
    }
    for (const kind of missingStructureKinds) {
      reasonCodes.push(`missing_structure_kind:${kind}`);
    }
    for (const kind of requiredStructureKinds) {
      const metric = viewStructureMetrics[kind];
      if (metric?.status === "block") {
        reasonCodes.push(`weak_structure:${kind}`);
      } else if (metric?.status === "review") {
        reasonCodes.push(`soft_structure:${kind}`);
      }
      const sourceDiagnostics = structureSourceDiagnostics[kind];
      if (sourceDiagnostics?.reasonCodes?.length) {
        reasonCodes.push(...sourceDiagnostics.reasonCodes);
      }
    }

    const referenceAnalysis = input.referenceAnalysisByView?.[view];
    if (referenceAnalysis) {
      if (referenceAnalysis.alphaCoverage < 0.015) {
        reasonCodes.push("reference_alpha_too_low");
      } else if (referenceAnalysis.alphaCoverage < 0.03) {
        reasonCodes.push("reference_alpha_soft");
      }
      if (referenceAnalysis.monochromeScore < 0.22) {
        reasonCodes.push("reference_style_too_noisy");
      } else if (referenceAnalysis.monochromeScore < 0.34) {
        reasonCodes.push("reference_style_soft");
      }
    }

    const hasHardFailure = reasonCodes.some((reason) =>
      reason.startsWith("missing_") ||
      reason.startsWith("weak_reference_role:") ||
      reason === "reference_alpha_too_low" ||
      reason === "reference_style_too_noisy" ||
      reason.startsWith("weak_structure:") ||
      reason.startsWith("missing_structure_source_") ||
      reason.startsWith("invalid_structure_source_role:") ||
      reason.startsWith("non_primary_structure_source_role:") ||
      reason.startsWith("structure_source_")
    );
    const hasSoftFailure = !hasHardFailure && reasonCodes.length > 0;
    const status: StageInputPreflightViewDiagnostics["status"] = hasHardFailure
      ? "block"
      : hasSoftFailure
        ? "review"
        : "ok";
    diagnosticsByView[view] = {
      status,
      reasonCodes,
      ...(requiredReferenceRoles.length > 0 ? { requiredReferenceRoles } : {}),
      ...(missingReferenceRoles.length > 0 ? { missingReferenceRoles } : {}),
      ...(weakReferenceRoles.length > 0 ? { weakReferenceRoles } : {}),
      ...(requiredStructureKinds.length > 0 ? { requiredStructureKinds } : {}),
      ...(missingStructureKinds.length > 0 ? { missingStructureKinds } : {}),
      ...(weakStructureKinds.length > 0 ? { weakStructureKinds } : {}),
      ...(invalidStructureSourceKinds.length > 0 ? { invalidStructureSourceKinds } : {}),
      ...(missingPrimaryStructureSourceKinds.length > 0 ? { missingPrimaryStructureSourceKinds } : {}),
      ...(Object.keys(referenceRoleWeights).length > 0 ? { referenceRoleWeights } : {}),
      ...(referenceAnalysis
        ? {
            referenceAlphaCoverage: roundPreflightMetric(referenceAnalysis.alphaCoverage),
            referenceMonochromeScore: roundPreflightMetric(referenceAnalysis.monochromeScore)
          }
        : {}),
      ...(Object.keys(viewStructureMetrics).length > 0 ? { structureGuideMetrics: viewStructureMetrics } : {}),
      ...(Object.keys(structureSourceDiagnostics).length > 0 ? { structureGuideSources: structureSourceDiagnostics } : {})
    };
    if (status === "block") {
      blockedViews.push(view);
    } else if (status === "review") {
      warningViews.push(view);
    }
  }

  const executionViews = input.views.filter((view) => !blockedViews.includes(view));
  const status: StageInputPreflightAssessment["status"] =
    blockedViews.length > 0 ? "block" : warningViews.length > 0 ? "review" : "ok";
  const summary =
    status === "ok"
      ? "preflight clear"
      : status === "review"
        ? `preflight review:${warningViews.join(",")}`
        : `preflight blocked:${blockedViews.join(",")}`;

  return {
    status,
    executionViews,
    blockedViews,
    warningViews,
    diagnosticsByView,
    summary
  };
}

async function buildStageInputPreflightAssessment(input: {
  stage: GenerationStageKey;
  views: CharacterView[];
  targetStyle?: string;
  referenceBank?: CharacterReferenceBankEntry[];
  referenceBankByView?: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
  referenceAnalysisByView?: Partial<Record<CharacterView, ImageAnalysis>>;
  structureControlsByView?: Partial<Record<CharacterView, Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>>>>;
}): Promise<StageInputPreflightAssessment> {
  const structureGuideMetricsByView: Partial<
    Record<CharacterView, Partial<Record<CharacterStructureControlKind, StructureGuideQualityMetrics>>>
  > = {};
  for (const view of input.views) {
    const controls = input.structureControlsByView?.[view];
    if (!controls) {
      continue;
    }
    const entries = Object.entries(controls) as Array<[CharacterStructureControlKind, CharacterStructureControlImage]>;
    const metricsEntries = await Promise.all(
      entries.map(async ([kind, image]) => [kind, await analyzeStructureGuideImage({ kind, image })] as const)
    );
    if (metricsEntries.length > 0) {
      structureGuideMetricsByView[view] = Object.fromEntries(metricsEntries);
    }
  }
  return assessStageInputPreflight({
    stage: input.stage,
    views: input.views,
    targetStyle: input.targetStyle,
    referenceBank: input.referenceBank,
    referenceBankByView: input.referenceBankByView,
    referenceAnalysisByView: input.referenceAnalysisByView,
    structureControlsByView: input.structureControlsByView,
    structureGuideMetricsByView
  });
}

function buildPreflightBlockedStageOutcomeSummaries(
  assessment: StageInputPreflightAssessment
): Partial<Record<CharacterView, StageRunViewOutcomeSummary>> | undefined {
  const out: Partial<Record<CharacterView, StageRunViewOutcomeSummary>> = {};
  for (const view of assessment.blockedViews) {
    const diagnostics = assessment.diagnosticsByView[view];
    out[view] = {
      warningCount: 0,
      rejectionCount: 0,
      passed: false,
      failureReasons: diagnostics?.reasonCodes ?? ["preflight_blocked"]
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function mergeStageViewOutcomeSummaries(
  base: Partial<Record<CharacterView, StageRunViewOutcomeSummary>> | undefined,
  extra: Partial<Record<CharacterView, StageRunViewOutcomeSummary>> | undefined
): Partial<Record<CharacterView, StageRunViewOutcomeSummary>> | undefined {
  if (!base && !extra) {
    return undefined;
  }
  return {
    ...(base ?? {}),
    ...(extra ?? {})
  };
}

function summarizeStageExitByView(
  summaries: Partial<Record<CharacterView, StageRunViewOutcomeSummary>> | undefined
): {
  passedViews?: CharacterView[];
  failedViews?: CharacterView[];
  failureReasonsByView?: Partial<Record<CharacterView, string[]>>;
} {
  if (!summaries) {
    return {};
  }

  const passedViews: CharacterView[] = [];
  const failedViews: CharacterView[] = [];
  const failureReasonsByView: Partial<Record<CharacterView, string[]>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const summary = summaries[view];
    if (!summary) {
      continue;
    }
    if (summary.passed) {
      passedViews.push(view);
    } else {
      failedViews.push(view);
      if (summary.failureReasons.length > 0) {
        failureReasonsByView[view] = summary.failureReasons;
      }
    }
  }

  return {
    ...(passedViews.length > 0 ? { passedViews } : {}),
    ...(failedViews.length > 0 ? { failedViews } : {}),
    ...(Object.keys(failureReasonsByView).length > 0 ? { failureReasonsByView } : {})
  };
}

function resolveCandidateWorkflowStage(candidate: ScoredCandidate | undefined): string | undefined {
  const providerMeta = candidate?.candidate.providerMeta;
  if (!providerMeta) {
    return undefined;
  }
  if (typeof providerMeta.workflowStage === "string" && providerMeta.workflowStage.trim().length > 0) {
    return providerMeta.workflowStage.trim();
  }
  const stagePlan = providerMeta.stagePlan;
  if (stagePlan && typeof stagePlan.stage === "string" && stagePlan.stage.trim().length > 0) {
    return stagePlan.stage.trim();
  }
  return undefined;
}

function resolveCandidatePassLabel(candidate: ScoredCandidate | undefined): string | undefined {
  const stagePlan = candidate?.candidate.providerMeta?.stagePlan;
  if (stagePlan && typeof stagePlan.passLabel === "string" && stagePlan.passLabel.trim().length > 0) {
    return stagePlan.passLabel.trim();
  }
  return undefined;
}

function selectBestCandidateForViewByStages(input: {
  scored: ScoredCandidate[];
  view: CharacterView;
  stages: string[];
}): ScoredCandidate | undefined {
  const stageSet = new Set(input.stages);
  const pool = input.scored
    .filter((candidate) => candidate.candidate.view === input.view)
    .filter((candidate) => {
      const stage = resolveCandidateWorkflowStage(candidate);
      return typeof stage === "string" && stageSet.has(stage);
    });
  if (pool.length === 0) {
    return undefined;
  }
  return [...pool].sort(compareScoredCandidates)[0];
}

function assessCandidatePromotion(input: {
  current: ScoredCandidate | undefined;
  contender: ScoredCandidate | undefined;
  acceptedScoreThreshold: number;
}): {
  promote: boolean;
  reasons: string[];
  scoreDeltaVsCurrent?: number;
  consistencyDeltaVsCurrent?: number | null;
} {
  if (!input.contender) {
    return {
      promote: false,
      reasons: ["candidate_missing"]
    };
  }
  if (!input.current) {
    return {
      promote: true,
      reasons: ["no_current_candidate"]
    };
  }

  const current = input.current;
  const contender = input.contender;
  const currentDefects = summarizeObservedDefectFamilies(current);
  const contenderDefects = summarizeObservedDefectFamilies(contender);
  const currentConsistency = typeof current.consistencyScore === "number" ? current.consistencyScore : null;
  const contenderConsistency = typeof contender.consistencyScore === "number" ? contender.consistencyScore : null;
  const consistencyDelta =
    currentConsistency === null || contenderConsistency === null
      ? null
      : Number((contenderConsistency - currentConsistency).toFixed(4));
  const scoreDelta = Number((contender.score - current.score).toFixed(4));
  const rejectionDelta = contender.rejections.length - current.rejections.length;
  const warningDelta = contender.warnings.length - current.warnings.length;
  const defectDelta = contenderDefects.length - currentDefects.length;
  const contenderIntroducedCriticalDefect = contenderDefects.some(
    (family) => isCriticalObservedDefectFamily(family) && !currentDefects.includes(family)
  );
  const contenderRegressedConsistency =
    typeof consistencyDelta === "number" && consistencyDelta <= -0.035;
  const contenderRecoveryRegression =
    hasConsistencyRecoveryIssue(contender) && !hasConsistencyRecoveryIssue(current);
  const contenderClearlyWorse =
    rejectionDelta > 0 ||
    contenderIntroducedCriticalDefect ||
    contenderRegressedConsistency ||
    contenderRecoveryRegression ||
    defectDelta >= 2 ||
    warningDelta >= 2;
  if (contenderClearlyWorse) {
    return {
      promote: false,
      reasons: dedupeStrings(
        [
          rejectionDelta > 0 ? "more_rejections" : "",
          contenderIntroducedCriticalDefect ? "critical_defect_introduced" : "",
          contenderRegressedConsistency ? "consistency_regressed" : "",
          contenderRecoveryRegression ? "consistency_recovery_regressed" : "",
          defectDelta >= 2 ? "defect_count_regressed" : "",
          warningDelta >= 2 ? "warning_count_regressed" : ""
        ].filter((entry) => entry.length > 0)
      ),
      scoreDeltaVsCurrent: scoreDelta,
      consistencyDeltaVsCurrent: consistencyDelta
    };
  }

  const betterByComparator = compareScoredCandidates(contender, current) < 0;
  const currentBelowThreshold =
    current.rejections.length > 0 ||
    current.score < input.acceptedScoreThreshold ||
    hasConsistencyRecoveryIssue(current);
  const clearGain =
    scoreDelta >= 0.018 ||
    (typeof consistencyDelta === "number" && consistencyDelta >= 0.025) ||
    warningDelta <= -1 ||
    defectDelta <= -1;

  return {
    promote: betterByComparator && (clearGain || currentBelowThreshold),
    reasons: dedupeStrings(
      [
        betterByComparator ? "better_by_rank" : "not_better_by_rank",
        currentBelowThreshold ? "current_below_threshold" : "",
        clearGain ? "clear_quality_gain" : ""
      ].filter((entry) => entry.length > 0)
    ),
    scoreDeltaVsCurrent: scoreDelta,
    consistencyDeltaVsCurrent: consistencyDelta
  };
}

function assessRuntimePromotionGuard(input: {
  current: ScoredCandidate | undefined;
  contender: ScoredCandidate | undefined;
  targetStyle?: string;
  stage: "refine" | "lock" | "repair";
}): {
  allow: boolean;
  reasons: string[];
} {
  if (!input.contender) {
    return {
      allow: true,
      reasons: []
    };
  }

  const contenderDiagnostics = extractCandidateRuntimeQualityDiagnostics({
    candidate: input.contender.candidate,
    targetStyle: input.targetStyle
  });
  const currentDiagnostics = input.current
    ? extractCandidateRuntimeQualityDiagnostics({
        candidate: input.current.candidate,
        targetStyle: input.targetStyle
      })
    : undefined;
  const reasons: string[] = [];

  if (contenderDiagnostics.preflightOk === false) {
    reasons.push("runtime_preflight_block");
  }
  if (
    contenderDiagnostics.rejectionReasons.includes("runtime_structure_missing") ||
    contenderDiagnostics.missingStructureKinds.length > 0
  ) {
    reasons.push("runtime_required_structure_missing");
  }

  if (!currentDiagnostics) {
    if (
      input.stage !== "refine" &&
      (contenderDiagnostics.fallbackUsed ||
        contenderDiagnostics.routeDegraded ||
        contenderDiagnostics.preflightWarnings.length > 0)
    ) {
      reasons.push("runtime_only_candidate_unsafe");
    }
  } else {
    if (contenderDiagnostics.fallbackUsed && !currentDiagnostics.fallbackUsed) {
      reasons.push("runtime_fallback_regressed");
    }
    if (contenderDiagnostics.routeDegraded && !currentDiagnostics.routeDegraded) {
      reasons.push("runtime_route_regressed");
    }
    if (
      contenderDiagnostics.structureCoverageScore + 0.12 <
      currentDiagnostics.structureCoverageScore
    ) {
      reasons.push("runtime_structure_regressed");
    }
    if (contenderDiagnostics.penalty - currentDiagnostics.penalty >= 0.08) {
      reasons.push("runtime_penalty_regressed");
    }
    if (
      contenderDiagnostics.preflightWarnings.length >
      currentDiagnostics.preflightWarnings.length
    ) {
      reasons.push("runtime_preflight_regressed");
    }
    if (
      contenderDiagnostics.warningReasons.length >=
      currentDiagnostics.warningReasons.length + 2
    ) {
      reasons.push("runtime_warning_regressed");
    }
  }

  return {
    allow: reasons.length === 0,
    reasons: dedupeStrings(reasons)
  };
}

export function buildSideViewAcceptanceGate(input: {
  targetViews: CharacterView[];
  baseByView: Partial<Record<CharacterView, ScoredCandidate>>;
  refineByView: Partial<Record<CharacterView, ScoredCandidate>>;
  lockByView: Partial<Record<CharacterView, ScoredCandidate>>;
  acceptedScoreThreshold: number;
  targetStyle?: string;
}): {
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  gateDecisionsByView: Partial<Record<CharacterView, SideViewAcceptanceGateDecisionSummary>>;
} {
  const selectedByView: Partial<Record<CharacterView, ScoredCandidate>> = {};
  const gateDecisionsByView: Partial<Record<CharacterView, SideViewAcceptanceGateDecisionSummary>> = {};

  for (const view of dedupeCharacterViews(input.targetViews.filter((entry) => entry !== "front"))) {
    const base = input.baseByView[view];
    const refine = input.refineByView[view];
    const lock = input.lockByView[view];
    let chosen = base;
    let decision: SideViewAcceptanceGateDecision = base ? "keep_base" : "missing_candidate";
    const reasons: string[] = [];

    if (refine) {
      const refineRuntimeGuard = assessRuntimePromotionGuard({
        current: chosen,
        contender: refine,
        targetStyle: input.targetStyle,
        stage: "refine"
      });
      if (!chosen) {
        if (refineRuntimeGuard.allow) {
          chosen = refine;
          decision = "hold_refine";
          reasons.push("refine:no_base_candidate");
        } else {
          decision = "reject_refine";
          reasons.push(...refineRuntimeGuard.reasons.map((reason) => `refine_rejected:${reason}`));
        }
      } else {
        const refinePromotion = assessCandidatePromotion({
          current: chosen,
          contender: refine,
          acceptedScoreThreshold: input.acceptedScoreThreshold
        });
        if (refineRuntimeGuard.allow && refinePromotion.promote) {
          chosen = refine;
          decision = base ? "promote_refine" : "hold_refine";
          reasons.push(...refinePromotion.reasons.map((reason) => `refine:${reason}`));
        } else {
          reasons.push(...refinePromotion.reasons.map((reason) => `refine_rejected:${reason}`));
          if (!refineRuntimeGuard.allow) {
            reasons.push(...refineRuntimeGuard.reasons.map((reason) => `refine_rejected:${reason}`));
          }
        }
      }
    }

    if (lock) {
      const lockRuntimeGuard = assessRuntimePromotionGuard({
        current: chosen,
        contender: lock,
        targetStyle: input.targetStyle,
        stage: "lock"
      });
      if (!chosen) {
        if (lockRuntimeGuard.allow) {
          chosen = lock;
          decision = "hold_lock";
          reasons.push("lock:no_base_candidate");
        } else {
          decision = "reject_lock";
          reasons.push(...lockRuntimeGuard.reasons.map((reason) => `lock_rejected:${reason}`));
        }
      } else {
        const previousChosen = chosen;
        const lockPromotion = assessCandidatePromotion({
          current: chosen,
          contender: lock,
          acceptedScoreThreshold: input.acceptedScoreThreshold
        });
        if (lockRuntimeGuard.allow && lockPromotion.promote) {
          chosen = lock;
          decision =
            previousChosen === base
              ? "promote_lock"
              : previousChosen === refine
                ? "promote_lock"
                : "hold_lock";
          reasons.push(...lockPromotion.reasons.map((reason) => `lock:${reason}`));
        } else {
          reasons.push(...lockPromotion.reasons.map((reason) => `lock_rejected:${reason}`));
          if (!lockRuntimeGuard.allow) {
            reasons.push(...lockRuntimeGuard.reasons.map((reason) => `lock_rejected:${reason}`));
          }
        }
      }
    }

    if (chosen) {
      selectedByView[view] = chosen;
    }

    const scoreDeltaVsBase =
      base && chosen ? Number((chosen.score - base.score).toFixed(4)) : undefined;
    const consistencyDeltaVsBase =
      base && chosen && typeof base.consistencyScore === "number" && typeof chosen.consistencyScore === "number"
        ? Number((chosen.consistencyScore - base.consistencyScore).toFixed(4))
        : base && chosen && base.consistencyScore === null && chosen.consistencyScore === null
          ? null
          : undefined;

    gateDecisionsByView[view] = {
      decision,
      ...(chosen ? { chosenCandidateId: chosen.candidate.id } : {}),
      ...(chosen ? { chosenStage: resolveCandidateWorkflowStage(chosen) } : {}),
      ...(base ? { baseCandidateId: base.candidate.id } : {}),
      ...(refine ? { refineCandidateId: refine.candidate.id } : {}),
      ...(lock ? { lockCandidateId: lock.candidate.id } : {}),
      ...(typeof scoreDeltaVsBase === "number" ? { scoreDeltaVsBase } : {}),
      ...(consistencyDeltaVsBase !== undefined ? { consistencyDeltaVsBase } : {}),
      reasons: dedupeStrings(reasons.length > 0 ? reasons : ["accepted_current"])
    };
  }

  return {
    selectedByView,
    gateDecisionsByView
  };
}

export function buildRepairTriageGate(input: {
  targetViews: CharacterView[];
  candidateByView: Partial<Record<CharacterView, ScoredCandidate>>;
  acceptedScoreThreshold: number;
  repairScoreFloor: number;
  frontAnchorAcceptedScoreThreshold: number;
  targetStyle?: string;
  packCoherence?: PackCoherenceDiagnostics;
  rigStability?: RigStabilityDiagnostics;
  speciesId?: string;
  gateDecisionsByView?: Partial<Record<CharacterView, SideViewAcceptanceGateDecisionSummary>>;
}): {
  repairViews: CharacterView[];
  acceptedViews: CharacterView[];
  blockedViews: CharacterView[];
  repairBaseByView: Partial<Record<CharacterView, ScoredCandidate>>;
  directiveProfilesByView: Partial<Record<CharacterView, RepairDirectiveProfileSummary>>;
  repairLineageByView: Partial<Record<CharacterView, CharacterRepairLineage>>;
  repairTriageByView: Partial<Record<CharacterView, RepairTriageDecisionSummary>>;
} {
  const repairViews: CharacterView[] = [];
  const acceptedViews: CharacterView[] = [];
  const blockedViews: CharacterView[] = [];
  const repairBaseByView: Partial<Record<CharacterView, ScoredCandidate>> = {};
  const directiveProfilesByView: Partial<Record<CharacterView, RepairDirectiveProfileSummary>> = {};
  const repairLineageByView: Partial<Record<CharacterView, CharacterRepairLineage>> = {};
  const repairTriageByView: Partial<Record<CharacterView, RepairTriageDecisionSummary>> = {};

  for (const view of dedupeCharacterViews(input.targetViews)) {
    const candidate = input.candidateByView[view];
    if (!candidate) {
      repairTriageByView[view] = {
        decision: "missing_candidate",
        priority: "high",
        acceptedByGate: view === "front" ? undefined : false,
        targetStage: "repair_refine",
        reasonCodes: ["missing_candidate"]
      };
      continue;
    }

    const reasonCodes: string[] = [];
    const gateDecision = input.gateDecisionsByView?.[view]?.decision;
    const gateReasons = input.gateDecisionsByView?.[view]?.reasons ?? [];
    const acceptedByGate = view === "front" ? undefined : Boolean(input.gateDecisionsByView?.[view]?.chosenCandidateId);
    const runtimeBucket = classifyCandidateRuntimeBucket({
      candidate,
      targetStyle: input.targetStyle
    });
    const rigSnapshot = summarizeCandidateRigStability({
      candidate,
      speciesId: input.speciesId
    });
    const runtimeDiagnostics = runtimeBucket.diagnostics;
    const runtimeHardReject = runtimeBucket.level === "block";
    const gateRuntimeReasons = gateReasons.filter((reason) => reason.includes("runtime_"));
    const runtimeSoftRepairSignal =
      gateRuntimeReasons.length > 0 ||
      runtimeBucket.level === "degraded" ||
      runtimeBucket.level === "compound" ||
      candidate.warnings.some((reason) => reason.startsWith("runtime_"));
    const rigRepairSignal =
      input.rigStability?.blockingViews.includes(view) ||
      input.rigStability?.warningViews.includes(view) ||
      rigSnapshot.lowAnchorConfidence ||
      rigSnapshot.lowLandmarkConsistency;
    const directive = buildRepairDirectiveProfile({
      stage: "repair",
      view,
      candidate,
      speciesId: input.speciesId
    });
    let decision: RepairTriageDecision;
    let priority: RepairTriageDecisionSummary["priority"];

    if (view !== "front" && acceptedByGate !== true) {
      decision = "reject_view";
      priority = "high";
      reasonCodes.push("repair_base_not_gate_accepted");
      blockedViews.push(view);
    } else if (runtimeHardReject) {
      decision = "reject_view";
      priority = "high";
      reasonCodes.push("runtime_contract_reject");
      reasonCodes.push(...runtimeDiagnostics.rejectionReasons);
      reasonCodes.push(`runtime_bucket:${runtimeBucket.level}`);
      blockedViews.push(view);
    } else if (isUnrecoverableRepairCandidate(candidate)) {
      decision = "reject_view";
      priority = "high";
      reasonCodes.push("unrecoverable_candidate");
      reasonCodes.push(...candidate.rejections.filter((reason) => reason.length > 0));
      blockedViews.push(view);
    } else if (candidate.score < input.repairScoreFloor && candidate.rejections.length > 0) {
      decision = "reject_view";
      priority = "high";
      reasonCodes.push("score_below_repair_floor");
      blockedViews.push(view);
    } else if (input.rigStability?.blockingViews.includes(view) || rigSnapshot.hardLowAnchorConfidence || rigSnapshot.hardLowLandmarkConsistency) {
      decision = view === "front" ? "full_repair" : "targeted_repair";
      priority = "high";
      reasonCodes.push("rig_instability_block");
      reasonCodes.push(...(input.rigStability?.reasonCodes.filter((reason) => reason.includes(view)) ?? []));
      repairViews.push(view);
      repairBaseByView[view] = candidate;
    } else if (runtimeSoftRepairSignal) {
      decision =
        view === "front" || gateDecision === "hold_lock" || runtimeBucket.level === "compound"
          ? "full_repair"
          : "targeted_repair";
      priority =
        view === "front" ||
        gateDecision === "hold_lock" ||
        runtimeBucket.level === "compound" ||
        runtimeDiagnostics.fallbackUsed ||
        runtimeDiagnostics.routeDegraded
          ? "high"
          : "medium";
      reasonCodes.push(
        gateRuntimeReasons.length > 0 ? "gate_runtime_regressed" : "runtime_soft_repair_required"
      );
      reasonCodes.push(`runtime_bucket:${runtimeBucket.level}`);
      if (runtimeDiagnostics.fallbackUsed || runtimeDiagnostics.routeDegraded) {
        reasonCodes.push("runtime_route_soft");
      }
      if (runtimeDiagnostics.preflightWarnings.length > 0) {
        reasonCodes.push("runtime_preflight_soft");
      }
      if (runtimeDiagnostics.adapterWarnings.length > 0) {
        reasonCodes.push("runtime_adapter_soft");
      }
      repairViews.push(view);
      repairBaseByView[view] = candidate;
    } else if (rigRepairSignal) {
      decision = view === "front" ? "full_repair" : "targeted_repair";
      priority = view === "front" ? "high" : "medium";
      reasonCodes.push("rig_instability_review");
      if (rigSnapshot.safeFrontExpression) {
        reasonCodes.push("rig_safe_front_expression");
      }
      if (rigSnapshot.suppressAggressiveYaw) {
        reasonCodes.push("rig_yaw_suppressed");
      }
      if (rigSnapshot.lockMouthPreset) {
        reasonCodes.push("rig_mouth_lock");
      }
      repairViews.push(view);
      repairBaseByView[view] = candidate;
    } else if (
      view === "front" &&
      !isStrongFrontMasterCandidate(
        candidate,
        input.targetStyle,
        input.frontAnchorAcceptedScoreThreshold,
        input.speciesId
      )
    ) {
      decision = "full_repair";
      priority = "high";
      reasonCodes.push("front_anchor_weak");
      repairViews.push(view);
      repairBaseByView[view] = candidate;
    } else if (candidate.rejections.length > 0 || hasConsistencyRecoveryIssue(candidate)) {
      decision = directive?.severity === "high" ? "full_repair" : "targeted_repair";
      priority = directive?.severity === "high" ? "high" : "medium";
      reasonCodes.push(
        ...dedupeStrings(
          candidate.rejections.concat(hasConsistencyRecoveryIssue(candidate) ? ["consistency_recovery_issue"] : [])
        )
      );
      repairViews.push(view);
      repairBaseByView[view] = candidate;
    } else {
      const profileThresholds = resolveMascotQcThresholds(input.speciesId);
      const repairConsistencyFloor =
        profileThresholds.minConsistencyByView[view] ?? (view === "profile" ? 0.4 : view === "front" ? 0.52 : 0.48);
      const consistencyNeedsRepair =
        typeof candidate.consistencyScore === "number" && candidate.consistencyScore < repairConsistencyFloor;
      const packCoherenceTriggered =
        (input.packCoherence?.blockingViews?.includes(view) ?? false) ||
        (input.packCoherence?.warningViews?.includes(view) ?? false);
      if (consistencyNeedsRepair) {
        decision = directive?.severity === "high" ? "full_repair" : "targeted_repair";
        priority = "medium";
        reasonCodes.push("consistency_below_floor");
        repairViews.push(view);
        repairBaseByView[view] = candidate;
      } else if (candidate.score < input.acceptedScoreThreshold) {
        decision = "targeted_repair";
        priority = "medium";
        reasonCodes.push("score_below_accept_threshold");
        repairViews.push(view);
        repairBaseByView[view] = candidate;
      } else if (packCoherenceTriggered) {
        decision = "targeted_repair";
        priority = input.packCoherence?.blockingViews?.includes(view) ? "high" : "medium";
        reasonCodes.push("pack_coherence_signal");
        repairViews.push(view);
        repairBaseByView[view] = candidate;
      } else {
        decision = "skip_repair";
        priority = "low";
        reasonCodes.push("accepted_without_repair");
        acceptedViews.push(view);
      }
    }

    if (repairBaseByView[view] && directive) {
      directiveProfilesByView[view] = summarizeRepairDirectiveProfile(directive);
    }
    if (repairBaseByView[view]) {
      repairLineageByView[view] = {
        repairFromCandidateId: candidate.candidate.id,
        ...(resolveCandidateWorkflowStage(candidate) ? { repairFromStage: resolveCandidateWorkflowStage(candidate) } : {}),
        ...(acceptedByGate !== undefined ? { acceptedByGate } : {}),
        ...(gateDecision ? { gateDecision } : {}),
        ...(resolveCandidatePassLabel(candidate) ? { sourcePassLabel: resolveCandidatePassLabel(candidate) } : {}),
        referenceLineage: dedupeStrings(
          [
            resolveCandidateWorkflowStage(candidate),
            directive?.severity ? `directive:${directive.severity}` : "",
            ...(directive?.families ?? []).map((family) => `family:${family}`)
          ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        )
      };
    }

    repairTriageByView[view] = {
      decision,
      priority,
      sourceCandidateId: candidate.candidate.id,
      sourceStage: resolveCandidateWorkflowStage(candidate),
      sourcePassLabel: resolveCandidatePassLabel(candidate),
      targetStage: decision === "skip_repair" || decision === "reject_view" ? undefined : "repair_refine",
      ...(acceptedByGate !== undefined ? { acceptedByGate } : {}),
      ...(gateDecision ? { gateDecision } : {}),
      ...(directive?.families && directive.families.length > 0 ? { repairFamilies: directive.families } : {}),
      score: Number(candidate.score.toFixed(4)),
      consistencyScore:
        typeof candidate.consistencyScore === "number" ? Number(candidate.consistencyScore.toFixed(4)) : candidate.consistencyScore,
      reasonCodes: dedupeStrings(reasonCodes.length > 0 ? reasonCodes : ["no_reason_recorded"])
    };
  }

  return {
    repairViews: dedupeCharacterViews(repairViews),
    acceptedViews: dedupeCharacterViews(acceptedViews),
    blockedViews: dedupeCharacterViews(blockedViews),
    repairBaseByView,
    directiveProfilesByView,
    repairLineageByView,
    repairTriageByView
  };
}

export function buildPostRepairAcceptanceGate(input: {
  targetViews: CharacterView[];
  preRepairByView: Partial<Record<CharacterView, ScoredCandidate>>;
  repairByView: Partial<Record<CharacterView, ScoredCandidate>>;
  acceptedScoreThreshold: number;
  promotionThresholdByView?: Partial<Record<CharacterView, number>>;
  targetStyle?: string;
}): {
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  repairAcceptanceByView: Partial<Record<CharacterView, PostRepairAcceptanceDecisionSummary>>;
} {
  const summarizeCompositeRepairIssues = (candidate: ScoredCandidate | undefined): string[] => {
    const reasons = new Set<string>([...(candidate?.warnings ?? []), ...(candidate?.rejections ?? [])]);
    const providerMeta = candidate?.candidate.providerMeta;
    const compositeDiagnostics = isRecord(providerMeta?.compositeDiagnostics) ? providerMeta.compositeDiagnostics : undefined;
    const compositeIssues = Array.isArray(compositeDiagnostics?.issues)
      ? compositeDiagnostics.issues
          .filter((issue): issue is string => typeof issue === "string" && issue.trim().length > 0)
          .map((issue) => issue.trim())
      : [];
    for (const issue of compositeIssues) {
      reasons.add(issue);
    }
    return dedupeStrings(
      [
        "seam_alpha_jump",
        "contour_break",
        "local_blur_mismatch",
        "mask_leakage",
        "feature_displacement"
      ].filter((token) => [...reasons].some((reason) => reason.toLowerCase().includes(token)))
    );
  };
  const summarizeRigRepairIssues = (candidate: ScoredCandidate | undefined): string[] => {
    const rig = summarizeCandidateRigStability({ candidate });
    return dedupeStrings(
      [
        rig.hardLowAnchorConfidence ? "rig_instability_block" : "",
        rig.hardLowLandmarkConsistency ? "rig_instability_block" : ""
      ].filter((reason) => reason.length > 0)
    );
  };

  const selectedByView: Partial<Record<CharacterView, ScoredCandidate>> = {};
  const repairAcceptanceByView: Partial<Record<CharacterView, PostRepairAcceptanceDecisionSummary>> = {};

  const isHardRepairRejection = (reason: string): boolean =>
    [
      "repair_below_threshold",
      "unrecoverable_repair_candidate",
      "more_rejections",
      "critical_defect_introduced",
      "consistency_regressed",
      "consistency_recovery_regressed",
      "defect_count_regressed",
      "warning_count_regressed",
      "runtime_preflight_block",
      "runtime_required_structure_missing",
      "runtime_only_candidate_unsafe",
      "runtime_fallback_regressed",
      "runtime_route_regressed",
      "runtime_structure_regressed",
      "runtime_penalty_regressed",
      "runtime_preflight_regressed",
      "runtime_warning_regressed",
      "rig_instability_block",
      "seam_alpha_jump",
      "contour_break",
      "local_blur_mismatch",
      "mask_leakage",
      "feature_displacement"
    ].includes(reason);

  for (const view of dedupeCharacterViews(input.targetViews)) {
    const preRepair = input.preRepairByView[view];
    const repaired = input.repairByView[view];
    const promotionThreshold = input.promotionThresholdByView?.[view] ?? input.acceptedScoreThreshold;
    let chosen = preRepair ?? repaired;
    let decision: PostRepairAcceptanceDecision =
      preRepair && !repaired
        ? "missing_repair_candidate"
        : !preRepair && repaired
          ? "hold_repair"
          : !preRepair && !repaired
            ? "missing_repair_candidate"
            : "keep_pre_repair";
    const reasonCodes: string[] = [];

    if (!preRepair && !repaired) {
      repairAcceptanceByView[view] = {
        decision,
        reasonCodes: ["missing_pre_repair_candidate", "missing_repair_candidate"]
      };
      continue;
    }

    if (!preRepair && repaired) {
      const runtimeGuard = assessRuntimePromotionGuard({
        current: undefined,
        contender: repaired,
        targetStyle: input.targetStyle,
        stage: "repair"
      });
      const repairedDefects = summarizeObservedDefectFamilies(repaired);
      const repairedIntroducedCriticalFamilies = repairedDefects.filter((family) => isCriticalObservedDefectFamily(family));
      const hardRejected = dedupeStrings(
        [
          isUnrecoverableRepairCandidate(repaired) ? "unrecoverable_repair_candidate" : "",
          repaired.score < promotionThreshold ? "repair_below_threshold" : "",
          repaired.rejections.length > 0 ? "more_rejections" : "",
          repairedIntroducedCriticalFamilies.length > 0 ? "critical_defect_introduced" : "",
          hasConsistencyRecoveryIssue(repaired) ? "consistency_recovery_regressed" : "",
          ...summarizeCompositeRepairIssues(repaired),
          ...summarizeRigRepairIssues(repaired),
          ...runtimeGuard.reasons
        ].filter((reason) => reason.length > 0)
      );
      if (hardRejected.length > 0) {
        chosen = undefined;
        decision = "reject_repair";
        reasonCodes.push(...hardRejected.map((reason) => `repair_rejected:${reason}`));
      } else {
        chosen = repaired;
        decision = "hold_repair";
        reasonCodes.push("no_pre_repair_candidate");
      }
    } else if (preRepair && !repaired) {
      chosen = preRepair;
      reasonCodes.push("repair_candidate_missing");
    } else if (preRepair && repaired) {
      const preRepairDefects = summarizeObservedDefectFamilies(preRepair);
      const repairedDefects = summarizeObservedDefectFamilies(repaired);
      const scoreDeltaVsRepair = Number((repaired.score - preRepair.score).toFixed(4));
      const consistencyDeltaVsRepair =
        typeof preRepair.consistencyScore === "number" && typeof repaired.consistencyScore === "number"
          ? Number((repaired.consistencyScore - preRepair.consistencyScore).toFixed(4))
          : preRepair.consistencyScore === null && repaired.consistencyScore === null
            ? null
            : undefined;
      const rejectionDeltaVsRepair = repaired.rejections.length - preRepair.rejections.length;
      const warningDeltaVsRepair = repaired.warnings.length - preRepair.warnings.length;
      const defectDeltaVsRepair = repairedDefects.length - preRepairDefects.length;
      const introducedCriticalFamilies = repairedDefects.filter(
        (family) => isCriticalObservedDefectFamily(family) && !preRepairDefects.includes(family)
      );
      const preRepairRig = summarizeCandidateRigStability({ candidate: preRepair });
      const repairedRig = summarizeCandidateRigStability({ candidate: repaired });
      const contenderBelowThreshold = repaired.score < promotionThreshold;
      const hardRejectedReasons = dedupeStrings(
        [
          isUnrecoverableRepairCandidate(repaired) ? "unrecoverable_repair_candidate" : "",
          contenderBelowThreshold ? "repair_below_threshold" : "",
          rejectionDeltaVsRepair > 0 ? "more_rejections" : "",
          introducedCriticalFamilies.length > 0 ? "critical_defect_introduced" : "",
          typeof consistencyDeltaVsRepair === "number" && consistencyDeltaVsRepair <= -0.035 ? "consistency_regressed" : "",
          hasConsistencyRecoveryIssue(repaired) && !hasConsistencyRecoveryIssue(preRepair)
            ? "consistency_recovery_regressed"
            : "",
          (!preRepairRig.hardLowAnchorConfidence && repairedRig.hardLowAnchorConfidence) ||
          (!preRepairRig.hardLowLandmarkConsistency && repairedRig.hardLowLandmarkConsistency)
            ? "rig_instability_block"
            : "",
          (!preRepairRig.safeFrontExpression && repairedRig.safeFrontExpression) ? "rig_safe_front_expression" : "",
          (!preRepairRig.suppressAggressiveYaw && repairedRig.suppressAggressiveYaw) ? "rig_yaw_suppressed" : "",
          (!preRepairRig.lockMouthPreset && repairedRig.lockMouthPreset) ? "rig_mouth_lock" : "",
          defectDeltaVsRepair >= 2 ? "defect_count_regressed" : "",
          warningDeltaVsRepair >= 2 ? "warning_count_regressed" : "",
          ...summarizeCompositeRepairIssues(repaired)
        ].filter((reason) => reason.length > 0)
      );
      const runtimeGuard = assessRuntimePromotionGuard({
        current: preRepair,
        contender: repaired,
        targetStyle: input.targetStyle,
        stage: "repair"
      });
      const promotion = assessCandidatePromotion({
        current: preRepair,
        contender: repaired,
        acceptedScoreThreshold: promotionThreshold
      });
      const hardRejected = dedupeStrings([...hardRejectedReasons, ...runtimeGuard.reasons]).some((reason) =>
        isHardRepairRejection(reason)
      );
      if (runtimeGuard.allow && promotion.promote) {
        chosen = repaired;
        decision = "promote_repair";
        reasonCodes.push(...promotion.reasons.map((reason) => `repair:${reason}`));
      } else if (hardRejected) {
        chosen = preRepair;
        decision = "reject_repair";
        reasonCodes.push(...dedupeStrings([...hardRejectedReasons, ...runtimeGuard.reasons]).map((reason) => `repair_rejected:${reason}`));
      } else {
        chosen = preRepair;
        decision = "keep_pre_repair";
        reasonCodes.push(...promotion.reasons.map((reason) => `repair_not_promoted:${reason}`));
        if (!runtimeGuard.allow) {
          reasonCodes.push(...runtimeGuard.reasons.map((reason) => `repair_not_promoted:${reason}`));
        }
      }
    }

    if (chosen) {
      selectedByView[view] = chosen;
    }

    const scoreDeltaVsPreRepair =
      preRepair && chosen ? Number((chosen.score - preRepair.score).toFixed(4)) : undefined;
    const consistencyDeltaVsPreRepair =
      preRepair &&
      chosen &&
      typeof preRepair.consistencyScore === "number" &&
      typeof chosen.consistencyScore === "number"
        ? Number((chosen.consistencyScore - preRepair.consistencyScore).toFixed(4))
        : preRepair && chosen && preRepair.consistencyScore === null && chosen.consistencyScore === null
          ? null
          : undefined;

    repairAcceptanceByView[view] = {
      decision,
      ...(chosen ? { chosenCandidateId: chosen.candidate.id } : {}),
      ...(chosen ? { chosenStage: resolveCandidateWorkflowStage(chosen) } : {}),
      ...(preRepair ? { preRepairCandidateId: preRepair.candidate.id } : {}),
      ...(preRepair ? { preRepairStage: resolveCandidateWorkflowStage(preRepair) } : {}),
      ...(repaired ? { repairCandidateId: repaired.candidate.id } : {}),
      ...(repaired ? { repairStage: resolveCandidateWorkflowStage(repaired) } : {}),
      ...(typeof scoreDeltaVsPreRepair === "number" ? { scoreDeltaVsPreRepair } : {}),
      ...(consistencyDeltaVsPreRepair !== undefined ? { consistencyDeltaVsPreRepair } : {}),
      ...(preRepair && repaired
        ? {
            rejectionDeltaVsPreRepair: chosen === repaired ? repaired.rejections.length - preRepair.rejections.length : 0,
            warningDeltaVsPreRepair: chosen === repaired ? repaired.warnings.length - preRepair.warnings.length : 0,
            defectDeltaVsPreRepair:
              chosen === repaired
                ? summarizeObservedDefectFamilies(repaired).length - summarizeObservedDefectFamilies(preRepair).length
                : 0
          }
        : {}),
      ...(preRepair && repaired && chosen === repaired
        ? {
            introducedCriticalFamilies: summarizeObservedDefectFamilies(repaired).filter(
              (family) =>
                isCriticalObservedDefectFamily(family) &&
                !summarizeObservedDefectFamilies(preRepair).includes(family)
            )
          }
        : {}),
      reasonCodes: dedupeStrings(reasonCodes.length > 0 ? reasonCodes : ["accepted_current"])
    };
  }

  return {
    selectedByView,
    repairAcceptanceByView
  };
}

function collectRuntimeVariantTags(input: {
  current: Set<string>;
  provider: CharacterProviderName;
  providerMeta?: CharacterCandidateProviderMeta;
}): void {
  input.current.add(`provider:${input.provider}`);
  const meta = input.providerMeta;
  if (!meta) {
    return;
  }
  if (typeof meta.mode === "string" && meta.mode.trim().length > 0) {
    input.current.add(`mode:${meta.mode.trim()}`);
  }
  if (typeof meta.referenceMode === "string" && meta.referenceMode.trim().length > 0) {
    input.current.add(`reference_mode:${meta.referenceMode.trim()}`);
  }
  if (meta.referenceApplied === true) {
    input.current.add("reference:applied");
  }
  if (meta.poseApplied === true) {
    input.current.add("pose:applied");
  }
  if (meta.repairMaskApplied === true) {
    input.current.add(`repair_mask:${typeof meta.repairMaskSource === "string" ? meta.repairMaskSource : "applied"}`);
  } else {
    input.current.add("repair_mask:off");
  }
  if (meta.postprocess?.applied === true) {
    input.current.add("postprocess:applied");
  }
  if (Array.isArray(meta.structureControlsApplied) && meta.structureControlsApplied.length > 0) {
    for (const kind of meta.structureControlsApplied) {
      input.current.add(`structure:${kind}`);
    }
  }
}

function classifyRepairDefectFamilies(candidate: ScoredCandidate | undefined): {
  reasons: Set<string>;
  consistency: boolean;
  identity: boolean;
  head: boolean;
  face: boolean;
  ears: boolean;
  muzzle: boolean;
  paws: boolean;
  body: boolean;
  silhouette: boolean;
  style: boolean;
  rig: boolean;
  runtime: boolean;
} {
  const reasons = new Set<string>([...(candidate?.rejections ?? []), ...(candidate?.warnings ?? [])]);
  const rig = summarizeCandidateRigStability({ candidate });
  const hasReason = (pattern: RegExp) => [...reasons].some((reason) => pattern.test(reason));
  const consistency =
    reasons.has("inconsistent_with_front_baseline") ||
    reasons.has("consistency_low") ||
    reasons.has("consistency_shape_drift") ||
    reasons.has("front_anchor_weak");
  const face =
    hasReason(/front_symmetry|face|eyes|head_body_ratio|contour_break|feature_displacement|frontality|front_collapse/i) ||
    reasons.has("face_or_eyes_region_unstable");
  const ears = hasReason(/cat_ear|dog_ears|wolf_head|species_/i);
  const muzzle = hasReason(/muzzle|cat_muzzle|dog_muzzle|wolf_muzzle|species_/i);
  const head = face || ears || muzzle || hasReason(/head_|mascot_identity/i) || consistency;
  const paws = hasReason(/paw_|finger|hand|arm/i);
  const silhouette =
    reasons.has("fragmented_or_multi_object_front") ||
    reasons.has("subject_isolation_low") ||
    reasons.has("subject_fill_too_sparse") ||
    reasons.has("head_shape_breakdown") ||
    hasReason(/bbox_|multi_object|seam_alpha_jump|mask_leakage/i);
  const style =
    reasons.has("consistency_style_drift") ||
    reasons.has("background_not_transparent") ||
    reasons.has("text_or_watermark_high_risk") ||
    hasReason(/style_drift|palette|monochrome|local_blur_mismatch/i);
  const rigIssue =
    rig.lowAnchorConfidence ||
    rig.hardLowAnchorConfidence ||
    rig.lowLandmarkConsistency ||
    rig.hardLowLandmarkConsistency;
  const runtime =
    hasReason(/^runtime_/) ||
    reasons.has("runtime_adapter_warning_present") ||
    reasons.has("runtime_preflight_warnings");
  const identity = consistency || reasons.has("mascot_identity_too_weak") || hasReason(/species_breakdown/i);
  const body = silhouette || style;

  return {
    reasons,
    consistency,
    identity,
    head,
    face,
    ears,
    muzzle,
    paws,
    body,
    silhouette,
    style,
    rig: rigIssue,
    runtime
  };
}

function summarizeObservedDefectFamilies(candidate: ScoredCandidate | undefined): ObservedDefectFamily[] {
  const defect = classifyRepairDefectFamilies(candidate);
  const families: ObservedDefectFamily[] = [];
  if (defect.identity) {
    families.push("identity");
  }
  if (defect.consistency) {
    families.push("consistency");
  }
  if (defect.head) {
    families.push("head");
  }
  if (defect.face) {
    families.push("face");
  }
  if (defect.ears) {
    families.push("ears");
  }
  if (defect.muzzle) {
    families.push("muzzle");
  }
  if (defect.paws) {
    families.push("paws");
  }
  if (defect.silhouette) {
    families.push("silhouette");
  }
  if (defect.style) {
    families.push("style");
  }
  if (defect.body) {
    families.push("body");
  }
  if (defect.rig) {
    families.push("rig");
  }
  if (defect.runtime) {
    families.push("runtime");
  }
  return families;
}

function summarizeObservedDefectFamiliesByView(input: {
  views: CharacterView[];
  bestByView: Partial<Record<CharacterView, ScoredCandidate>>;
}): Partial<Record<CharacterView, ObservedDefectFamily[]>> | undefined {
  const out: Partial<Record<CharacterView, ObservedDefectFamily[]>> = {};
  for (const view of input.views) {
    const families = summarizeObservedDefectFamilies(input.bestByView[view]);
    if (families.length > 0) {
      out[view] = families;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function isCriticalObservedDefectFamily(family: ObservedDefectFamily): boolean {
  return family === "identity" || family === "head" || family === "silhouette";
}

function isReviewObservedDefectFamily(family: ObservedDefectFamily): boolean {
  return (
    family === "style" ||
    family === "paws" ||
    family === "body" ||
    family === "rig" ||
    family === "runtime" ||
    family === "consistency" ||
    family === "face" ||
    family === "ears" ||
    family === "muzzle"
  );
}

export function buildPackDefectSummary(input: {
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  workflowStages?: StageRunSummary[];
}): PackDefectSummary {
  const defectFamiliesByView: Partial<Record<CharacterView, ObservedDefectFamily[]>> = {};
  const familyViews = new Map<ObservedDefectFamily, Set<CharacterView>>();
  const stageCountsByViewFamily = new Map<string, number>();

  for (const stage of input.workflowStages ?? []) {
    for (const view of CHARACTER_VIEWS) {
      const families = stage.observedDefectFamiliesByView?.[view] ?? [];
      for (const family of families) {
        const key = `${view}:${family}`;
        stageCountsByViewFamily.set(key, (stageCountsByViewFamily.get(key) ?? 0) + 1);
      }
    }
  }

  for (const view of CHARACTER_VIEWS) {
    const families = summarizeObservedDefectFamilies(input.selectedByView[view]);
    if (families.length === 0) {
      continue;
    }
    defectFamiliesByView[view] = families;
    for (const family of families) {
      const views = familyViews.get(family) ?? new Set<CharacterView>();
      views.add(view);
      familyViews.set(family, views);
    }
  }

  const repeatedFamilies: ObservedDefectFamily[] = [];
  const blockingFamilies: ObservedDefectFamily[] = [];
  const warningFamilies: ObservedDefectFamily[] = [];
  for (const [family, views] of familyViews.entries()) {
    if (views.size >= 2) {
      repeatedFamilies.push(family);
      if (isCriticalObservedDefectFamily(family)) {
        blockingFamilies.push(family);
      } else if (isReviewObservedDefectFamily(family)) {
        warningFamilies.push(family);
      }
    }
  }

  const persistentFamiliesByView: Partial<Record<CharacterView, ObservedDefectFamily[]>> = {};
  for (const view of CHARACTER_VIEWS) {
    const families = defectFamiliesByView[view] ?? [];
    const persistentFamilies = families.filter((family) => (stageCountsByViewFamily.get(`${view}:${family}`) ?? 0) >= 2);
    if (persistentFamilies.length > 0) {
      persistentFamiliesByView[view] = persistentFamilies;
    }
  }

  return {
    ...(Object.keys(defectFamiliesByView).length > 0 ? { defectFamiliesByView } : {}),
    repeatedFamilies: repeatedFamilies.sort((left, right) => left.localeCompare(right)),
    blockingFamilies: blockingFamilies.sort((left, right) => left.localeCompare(right)),
    warningFamilies: warningFamilies.sort((left, right) => left.localeCompare(right)),
    ...(Object.keys(persistentFamiliesByView).length > 0 ? { persistentFamiliesByView } : {})
  };
}

function buildRepairMaskFocusFlags(candidate: ScoredCandidate): {
  head: boolean;
  face: boolean;
  ears: boolean;
  muzzle: boolean;
  paws: boolean;
  body: boolean;
  silhouette: boolean;
  styleCleanup: boolean;
} {
  const defect = classifyRepairDefectFamilies(candidate);
  return {
    head: defect.head,
    face: defect.face,
    ears: defect.ears,
    muzzle: defect.muzzle,
    paws: defect.paws,
    body: defect.body,
    silhouette: defect.silhouette,
    styleCleanup: defect.style
  };
}

async function buildRepairMaskReferenceForCandidate(candidate: ScoredCandidate): Promise<InlineImageReference> {
  const width = Math.max(256, candidate.analysis.originalWidth || 1024);
  const height = Math.max(256, candidate.analysis.originalHeight || 1024);
  const focus = buildRepairMaskFocusFlags(candidate);
  const bboxCenterX = clamp01(candidate.analysis.bboxCenterX || 0.5);
  const headCenterX =
    candidate.candidate.view === "profile"
      ? clamp01(bboxCenterX - 0.04)
      : candidate.candidate.view === "threeQuarter"
        ? clamp01(bboxCenterX)
        : 0.5;
  const bodyCenterX = clamp01(bboxCenterX);
  const shapes: string[] = [];
  const addEllipse = (cx: number, cy: number, rx: number, ry: number, opacity = 1) => {
    shapes.push(
      `<ellipse cx="${Math.round(cx * width)}" cy="${Math.round(cy * height)}" rx="${Math.round(rx * width)}" ry="${Math.round(ry * height)}" fill="white" fill-opacity="${opacity.toFixed(2)}"/>`
    );
  };
  const addRect = (x: number, y: number, w: number, h: number, radius: number, opacity = 1) => {
    shapes.push(
      `<rect x="${Math.round(x * width)}" y="${Math.round(y * height)}" width="${Math.round(w * width)}" height="${Math.round(h * height)}" rx="${Math.round(radius * Math.min(width, height))}" fill="white" fill-opacity="${opacity.toFixed(2)}"/>`
    );
  };

  if (focus.head || (!focus.paws && !focus.body)) {
    addEllipse(headCenterX, candidate.candidate.view === "profile" ? 0.24 : 0.22, 0.28, 0.18, 1);
    addRect(headCenterX - 0.2, 0.08, 0.4, 0.22, 0.05, 0.86);
    if (candidate.candidate.view !== "profile") {
      addEllipse(0.5, 0.28, 0.16, 0.08, 0.78);
    }
  }

  if (focus.ears) {
    if (candidate.candidate.view === "profile") {
      addEllipse(clamp01(headCenterX - 0.08), 0.11, 0.1, 0.11, 0.94);
    } else {
      addEllipse(clamp01(headCenterX - 0.12), 0.11, 0.08, 0.11, 0.94);
      addEllipse(clamp01(headCenterX + 0.12), 0.11, 0.08, 0.11, 0.94);
    }
  }

  if (focus.face) {
    addEllipse(headCenterX, candidate.candidate.view === "profile" ? 0.26 : 0.27, 0.14, 0.09, 0.88);
    addRect(headCenterX - 0.11, 0.2, 0.22, 0.12, 0.03, 0.74);
  }

  if (focus.muzzle) {
    if (candidate.candidate.view === "profile") {
      addRect(Math.max(0, headCenterX - 0.01), 0.24, 0.2, 0.12, 0.03, 0.92);
      addEllipse(clamp01(headCenterX + 0.09), 0.3, 0.11, 0.07, 0.82);
    } else {
      addEllipse(headCenterX, 0.33, 0.12, 0.07, 0.9);
    }
  }

  if (focus.paws) {
    addEllipse(0.24, 0.73, 0.11, 0.13, 0.92);
    addEllipse(0.76, 0.73, 0.11, 0.13, 0.92);
    addRect(0.16, 0.62, 0.68, 0.2, 0.04, 0.52);
  }

  if (focus.body) {
    addRect(bodyCenterX - 0.2, 0.34, 0.4, 0.42, 0.06, focus.head ? 0.56 : 0.84);
    addEllipse(bodyCenterX, 0.58, 0.26, 0.24, focus.silhouette ? 0.82 : 0.68);
    if (focus.silhouette) {
      addRect(bodyCenterX - 0.23, 0.3, 0.46, 0.5, 0.06, 0.34);
    } else if (focus.styleCleanup) {
      addRect(bodyCenterX - 0.17, 0.34, 0.34, 0.42, 0.05, 0.28);
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="black" fill-opacity="0"/>`,
    ...shapes,
    `</svg>`
  ].join("");
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();

  return {
    referenceImageBase64: buffer.toString("base64"),
    referenceMimeType: "image/png"
  };
}

function resolveStructureControlKindsForStage(
  stage: GenerationStageKey,
  view?: CharacterView
): CharacterStructureControlKind[] {
  if (stage === "front") {
    return ["lineart", "canny"];
  }
  if (stage === "view_only" && view === "front") {
    return [];
  }
  if (stage === "angles" || stage === "view_only") {
    return ["lineart", "canny"];
  }
  return ["lineart", "canny", "depth"];
}

type CachedStructureControlImage = Omit<
  CharacterStructureControlImage,
  "sourceRole" | "sourceRefId" | "sourceView"
>;

type StructureControlSourceTrace = {
  sourceRole?: CharacterReferenceRole;
  sourceRefId?: string;
  sourceView?: CharacterView;
};

type StructureGuideSourcePolicy = {
  allowedRoles: CharacterReferenceRole[];
  primaryRole?: CharacterReferenceRole;
  requireTargetViewMatch?: boolean;
};

const structureControlCache = new Map<
  string,
  Partial<Record<CharacterStructureControlKind, CachedStructureControlImage>>
>();

export function defaultStructureControlStrength(kind: CharacterStructureControlKind): number {
  if (kind === "lineart") {
    return 0.44;
  }
  if (kind === "canny") {
    return 0.36;
  }
  return 0.28;
}

async function resolveStructureGuideSourceBuffers(sourceBuffer: Buffer): Promise<{
  edgeSourceBuffer: Buffer;
  maskSourceBuffer: Buffer;
}> {
  const prepared = sharp(sourceBuffer, { limitInputPixels: false }).rotate().ensureAlpha();
  const { data, info } = await prepared.raw().toBuffer({ resolveWithObject: true });
  const pixelCount = Math.max(1, info.width * info.height);
  let transparentPixels = 0;
  let alphaSignalPixels = 0;
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index] ?? 255;
    if (alpha < 12) {
      transparentPixels += 1;
    }
    if (alpha >= 12) {
      alphaSignalPixels += 1;
    }
  }

  const alphaTransparentCoverage = transparentPixels / pixelCount;
  const alphaSignalCoverage = alphaSignalPixels / pixelCount;
  const alphaUsable = alphaTransparentCoverage >= 0.01 && alphaSignalCoverage >= 0.015 && alphaSignalCoverage <= 0.985;

  const edgeSourceBuffer = await sharp(sourceBuffer, { limitInputPixels: false })
    .rotate()
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .grayscale()
    .normalise()
    .png()
    .toBuffer();

  const inkMaskBuffer = await sharp(edgeSourceBuffer, { limitInputPixels: false })
    .negate()
    .threshold(24)
    .png()
    .toBuffer();

  if (!alphaUsable) {
    return {
      edgeSourceBuffer,
      maskSourceBuffer: inkMaskBuffer
    };
  }

  const alphaMaskBuffer = await sharp(sourceBuffer, { limitInputPixels: false })
    .rotate()
    .ensureAlpha()
    .extractChannel("alpha")
    .threshold(12)
    .png()
    .toBuffer();
  const alphaMask = await sharp(alphaMaskBuffer, { limitInputPixels: false }).raw().toBuffer({ resolveWithObject: true });
  const inkMask = await sharp(inkMaskBuffer, { limitInputPixels: false }).raw().toBuffer({ resolveWithObject: true });
  const mergedMask = Buffer.alloc(alphaMask.data.length);
  for (let index = 0; index < mergedMask.length; index += 1) {
    mergedMask[index] = Math.max(alphaMask.data[index] ?? 0, inkMask.data[index] ?? 0);
  }

  const maskSourceBuffer = await sharp(mergedMask, {
    raw: {
      width: alphaMask.info.width,
      height: alphaMask.info.height,
      channels: alphaMask.info.channels
    }
  })
    .png()
    .toBuffer();

  return {
    edgeSourceBuffer,
    maskSourceBuffer
  };
}

function withStructureControlSourceTrace(
  controls: Partial<Record<CharacterStructureControlKind, CachedStructureControlImage>>,
  source?: StructureControlSourceTrace
): Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>> {
  const out: Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>> = {};
  for (const [kind, entry] of Object.entries(controls) as [
    CharacterStructureControlKind,
    CachedStructureControlImage
  ][]) {
    out[kind] = {
      ...entry,
      ...(typeof source?.sourceRole === "string" ? { sourceRole: source.sourceRole } : {}),
      ...(typeof source?.sourceRefId === "string" && source.sourceRefId.trim().length > 0
        ? { sourceRefId: source.sourceRefId.trim() }
        : {}),
      ...(typeof source?.sourceView === "string" ? { sourceView: source.sourceView } : {})
    };
  }
  return out;
}

async function buildStructureControlImagesFromReference(input: {
  reference: InlineImageReference;
  kinds: CharacterStructureControlKind[];
  source?: StructureControlSourceTrace;
}): Promise<Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>>> {
  const kinds = [...new Set(input.kinds)];
  if (kinds.length === 0 || !input.reference.referenceImageBase64) {
    return {};
  }

  const sourceBuffer = Buffer.from(input.reference.referenceImageBase64, "base64");
  const cacheKey = `${sha256Hex(sourceBuffer.toString("base64"))}:${kinds.sort().join("+")}`;
  const cached = structureControlCache.get(cacheKey);
  if (cached) {
    return withStructureControlSourceTrace(cached, input.source);
  }

  const { edgeSourceBuffer, maskSourceBuffer } = await resolveStructureGuideSourceBuffers(sourceBuffer);

  const controls: Partial<Record<CharacterStructureControlKind, CachedStructureControlImage>> = {};
  if (kinds.includes("lineart")) {
    const lineart = await sharp(edgeSourceBuffer, { limitInputPixels: false })
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
      })
      .normalise()
      .threshold(8)
      .png()
      .toBuffer();
    controls.lineart = {
      imageBase64: lineart.toString("base64"),
      mimeType: "image/png",
      strength: defaultStructureControlStrength("lineart"),
      note: "alpha-derived lineart control"
    };
  }
  if (kinds.includes("canny")) {
    const canny = await sharp(edgeSourceBuffer, { limitInputPixels: false })
      .blur(0.6)
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
      })
      .normalise()
      .threshold(14)
      .png()
      .toBuffer();
    controls.canny = {
      imageBase64: canny.toString("base64"),
      mimeType: "image/png",
      strength: defaultStructureControlStrength("canny"),
      note: "alpha-derived canny-like edge control"
    };
  }
  if (kinds.includes("depth")) {
    const depth = await sharp(maskSourceBuffer, { limitInputPixels: false })
      .blur(18)
      .normalise()
      .png()
      .toBuffer();
    controls.depth = {
      imageBase64: depth.toString("base64"),
      mimeType: "image/png",
      strength: defaultStructureControlStrength("depth"),
      note: "alpha-derived soft depth control"
    };
  }

  structureControlCache.set(cacheKey, controls);
  return withStructureControlSourceTrace(controls, input.source);
}

function structureControlSourceRequiresTargetViewMatch(role: CharacterReferenceRole): boolean {
  return role === "view_starter" || role === "composition" || role === "repair_base";
}

function resolveStructureGuideSourcePolicy(
  stage: GenerationStageKey,
  targetView: CharacterView,
  kind: CharacterStructureControlKind
): StructureGuideSourcePolicy {
  if (stage === "front") {
    return {
      allowedRoles: ["composition"],
      primaryRole: "composition",
      requireTargetViewMatch: true
    };
  }

  if (stage === "repair") {
    if (kind === "depth") {
      return {
        allowedRoles: ["repair_base"],
        primaryRole: "repair_base",
        requireTargetViewMatch: true
      };
    }
    if (kind === "canny") {
      return {
        allowedRoles: ["composition", "repair_base"],
        primaryRole: "composition",
        requireTargetViewMatch: true
      };
    }
    return {
      allowedRoles: ["composition", "repair_base"],
      primaryRole: "composition",
      requireTargetViewMatch: true
    };
  }

  if (stage === "lock") {
    return {
      allowedRoles: ["composition"],
      primaryRole: "composition",
      requireTargetViewMatch: true
    };
  }

  if (stage === "refine") {
    return {
      allowedRoles: ["composition"],
      primaryRole: "composition",
      requireTargetViewMatch: true
    };
  }

  if (stage === "view_only" && targetView === "front") {
    return {
      allowedRoles: ["front_master", "hero", "subject", "starter", "composition"],
      primaryRole: "front_master",
      requireTargetViewMatch: false
    };
  }

  return {
    allowedRoles: ["composition"],
    primaryRole: "composition",
    requireTargetViewMatch: true
  };
}

function selectStructureControlSourceEntry(input: {
  stage: GenerationStageKey;
  targetView: CharacterView;
  kind: CharacterStructureControlKind;
  referenceBank?: CharacterReferenceBankEntry[];
  referenceBankByView?: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
}): CharacterReferenceBankEntry | null {
  const bank = input.referenceBankByView?.[input.targetView] ?? input.referenceBank ?? [];
  if (!Array.isArray(bank) || bank.length === 0) {
    return null;
  }

  const policy = resolveStructureGuideSourcePolicy(input.stage, input.targetView, input.kind);
  for (const role of policy.allowedRoles) {
    const match = bank.find((entry) => {
      if (!entry || entry.role !== role) {
        return false;
      }
      if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
        return false;
      }
      if (typeof entry.imageBase64 !== "string" || entry.imageBase64.trim().length === 0) {
        return false;
      }
      if (role === "front_master" && typeof entry.view === "string" && entry.view !== "front") {
        return false;
      }
      if (
        structureControlSourceRequiresTargetViewMatch(role) &&
        typeof entry.view === "string" &&
        entry.view !== input.targetView
      ) {
        return false;
      }
      if (
        input.targetView === "front" &&
        (role === "hero" || role === "subject" || role === "starter") &&
        typeof entry.view === "string" &&
        entry.view !== "front"
      ) {
        return false;
      }
      return true;
    });
    if (match) {
      return match;
    }
  }

  return null;
}

function buildStructureGuideSourceDiagnostics(input: {
  stage: GenerationStageKey;
  targetView: CharacterView;
  kind: CharacterStructureControlKind;
  image?: CharacterStructureControlImage;
  referenceBank?: CharacterReferenceBankEntry[];
}): StructureGuideSourceDiagnostics | undefined {
  const image = input.image;
  if (!image) {
    return undefined;
  }

  const sourceRole = image.sourceRole;
  const sourceRefId = typeof image.sourceRefId === "string" && image.sourceRefId.trim().length > 0 ? image.sourceRefId : undefined;
  const sourceView = image.sourceView;
  const policy = resolveStructureGuideSourcePolicy(input.stage, input.targetView, input.kind);
  const reasonCodes: string[] = [];
  const bank = Array.isArray(input.referenceBank) ? input.referenceBank : [];
  const matchedRef = sourceRefId ? bank.find((entry) => entry.id === sourceRefId) : undefined;

  if (!sourceRole) {
    reasonCodes.push(`missing_structure_source_role:${input.kind}`);
  }
  if (!sourceRefId) {
    reasonCodes.push(`missing_structure_source_ref:${input.kind}`);
  }
  if (policy.allowedRoles.length > 0 && sourceRole && !policy.allowedRoles.includes(sourceRole)) {
    reasonCodes.push(`invalid_structure_source_role:${input.kind}:${sourceRole}`);
  }
  if (policy.primaryRole && sourceRole && sourceRole !== policy.primaryRole) {
    reasonCodes.push(`non_primary_structure_source_role:${input.kind}:${sourceRole}`);
  }
  if (policy.requireTargetViewMatch && sourceView !== input.targetView) {
    reasonCodes.push(`structure_source_view_mismatch:${input.kind}:${sourceView ?? "missing"}`);
  }
  if (sourceRefId && !matchedRef) {
    reasonCodes.push(`structure_source_ref_missing:${input.kind}:${sourceRefId}`);
  }
  if (matchedRef) {
    if (sourceRole && matchedRef.role !== sourceRole) {
      reasonCodes.push(`structure_source_ref_role_mismatch:${input.kind}:${sourceRefId}`);
    }
    if (sourceView && matchedRef.view && matchedRef.view !== sourceView) {
      reasonCodes.push(`structure_source_ref_view_mismatch:${input.kind}:${sourceRefId}`);
    }
    if (policy.requireTargetViewMatch && matchedRef.view && matchedRef.view !== input.targetView) {
      reasonCodes.push(`structure_source_ref_target_view_mismatch:${input.kind}:${sourceRefId}`);
    }
  }

  const status: StructureGuideSourceDiagnostics["status"] = reasonCodes.length > 0 ? "block" : "ok";
  return {
    ...(sourceRole ? { sourceRole } : {}),
    ...(sourceRefId ? { sourceRefId } : {}),
    ...(sourceView ? { sourceView } : {}),
    ...(policy.allowedRoles.length > 0 ? { allowedRoles: policy.allowedRoles } : {}),
    ...(policy.primaryRole ? { requiredPrimaryRole: policy.primaryRole } : {}),
    status,
    reasonCodes
  };
}

async function buildStructureControlsByViewForStage(input: {
  stage: GenerationStageKey;
  views: CharacterView[];
  referenceBank?: CharacterReferenceBankEntry[];
  referenceBankByView?: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
}): Promise<Partial<Record<CharacterView, Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>>>>>
{
  const out: Partial<Record<CharacterView, Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>>>> = {};
  for (const view of input.views) {
    const kinds = resolveStructureControlKindsForStage(input.stage, view);
    if (kinds.length === 0) {
      continue;
    }
    const controls: Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>> = {};
    for (const kind of kinds) {
      const sourceEntry = selectStructureControlSourceEntry({
        stage: input.stage,
        targetView: view,
        kind,
        referenceBank: input.referenceBank,
        referenceBankByView: input.referenceBankByView
      });
      if (!sourceEntry?.imageBase64) {
        continue;
      }
      const built = await buildStructureControlImagesFromReference({
        reference: {
          referenceImageBase64: sourceEntry.imageBase64,
          referenceMimeType: sourceEntry.mimeType ?? "image/png"
        },
        kinds: [kind],
        source: {
          sourceRole: sourceEntry.role,
          sourceRefId: sourceEntry.id,
          sourceView: sourceEntry.view
        }
      });
      if (built[kind]) {
        controls[kind] = built[kind];
      }
    }
    if (Object.keys(controls).length > 0) {
      out[view] = controls;
    }
  }
  return out;
}

function createReferenceBankEntry(input: {
  role: CharacterReferenceBankEntry["role"];
  image: InlineImageReference;
  view?: CharacterView;
  weight?: number;
  id?: string;
  note?: string;
}): CharacterReferenceBankEntry {
  return {
    id: input.id,
    role: input.role,
    ...(input.view ? { view: input.view } : {}),
    ...(typeof input.weight === "number" ? { weight: input.weight } : {}),
    ...(input.note ? { note: input.note } : {}),
    imageBase64: input.image.referenceImageBase64,
    mimeType: input.image.referenceMimeType ?? "image/png"
  };
}

function dedupeReferenceBank(entries: CharacterReferenceBankEntry[]): CharacterReferenceBankEntry[] {
  const seen = new Set<string>();
  const out: CharacterReferenceBankEntry[] = [];

  for (const entry of entries) {
    const imageBase64 = typeof entry.imageBase64 === "string" ? entry.imageBase64.trim() : "";
    if (!imageBase64) {
      continue;
    }

    const key = `${entry.role}|${entry.view ?? ""}|${imageBase64.slice(0, 48)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(entry);
  }

  return out;
}

function resolveStageConfig(
  stage: GenerationStageKey
): { workflowStage: CharacterWorkflowStage; templateVersion: string; templateSpecPath: string } {
  if (stage === "front") {
    return {
      workflowStage: "front_master",
      templateVersion: ULTRA_STAGE_TEMPLATE_VERSIONS.front_master,
      templateSpecPath: ULTRA_STAGE_TEMPLATE_SPEC_PATHS.front_master
    };
  }

  if (stage === "repair") {
    return {
      workflowStage: "repair_refine",
      templateVersion: ULTRA_STAGE_TEMPLATE_VERSIONS.repair_refine,
      templateSpecPath: ULTRA_STAGE_TEMPLATE_SPEC_PATHS.repair_refine
    };
  }

  if (stage === "view_only") {
    return {
      workflowStage: "view_only",
      templateVersion: ULTRA_STAGE_TEMPLATE_VERSIONS.view_only,
      templateSpecPath: ULTRA_STAGE_TEMPLATE_SPEC_PATHS.view_only
    };
  }

  if (stage === "refine") {
    return {
      workflowStage: "side_view_refine",
      templateVersion: ULTRA_STAGE_TEMPLATE_VERSIONS.side_view_refine,
      templateSpecPath: ULTRA_STAGE_TEMPLATE_SPEC_PATHS.side_view_refine
    };
  }

  if (stage === "lock") {
    return {
      workflowStage: "identity_lock_refine",
      templateVersion: ULTRA_STAGE_TEMPLATE_VERSIONS.identity_lock_refine,
      templateSpecPath: ULTRA_STAGE_TEMPLATE_SPEC_PATHS.identity_lock_refine
    };
  }

  return {
    workflowStage: "side_view_base",
    templateVersion: ULTRA_STAGE_TEMPLATE_VERSIONS.side_view_base,
    templateSpecPath: ULTRA_STAGE_TEMPLATE_SPEC_PATHS.side_view_base
  };
}

export function stageRequiresPoseGuide(stage: GenerationStageKey): boolean {
  return stage === "angles" || stage === "view_only" || stage === "refine" || stage === "lock";
}

function isSupportedMascotSpeciesId(speciesId?: string): speciesId is MascotSpecies {
  return speciesId === "cat" || speciesId === "dog" || speciesId === "wolf";
}

function resolveStageControlPresetId(stage: GenerationStageKey, views: CharacterView[]): string {
  if (stage === "front") {
    return "front_style_generate_v1";
  }
  if (stage === "repair") {
    return "repair_local_impact_v1";
  }
  if (stage === "lock") {
    return "identity_lock_hero_v1";
  }
  if (stage === "refine") {
    return "side_advanced_control_v1";
  }
  if (stage === "view_only") {
    return views.every((view) => view === "front") ? "view_only_front_regen_v1" : "view_only_side_regen_v1";
  }
  return "side_base_control_v1";
}

function referenceBankHasHeroRole(input: {
  sharedReferenceBank?: CharacterReferenceBankEntry[];
  referenceBankByView?: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
}): boolean {
  if (Array.isArray(input.sharedReferenceBank) && input.sharedReferenceBank.some((entry) => entry.role === "hero")) {
    return true;
  }
  return Object.values(input.referenceBankByView ?? {}).some(
    (bank) => Array.isArray(bank) && bank.some((entry) => entry.role === "hero")
  );
}

const PRODUCTION_POSE_GUIDE_PATHS: Record<CharacterView, string> = {
  front: path.join(REPO_ROOT, "workflows", "comfy", "pose_guides", "front.png"),
  threeQuarter: path.join(REPO_ROOT, "workflows", "comfy", "pose_guides", "threeQuarter.png"),
  profile: path.join(REPO_ROOT, "workflows", "comfy", "pose_guides", "profile.png")
};

function resolveFirstImagePath(dirPath: string): string | undefined {
  if (!fs.existsSync(dirPath)) {
    return undefined;
  }

  const imageNames = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        [".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(entry.name).toLowerCase())
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));

  if (imageNames.length === 0) {
    return undefined;
  }

  return path.join(dirPath, imageNames[0]);
}

const MASCOT_REFERENCE_BANK_ROOT = path.join(REPO_ROOT, "refs", "mascots");

type BankedInlineImageReference = InlineImageReference & {
  sourcePath: string;
  note?: string;
  declaredWeight?: number;
};

type MascotReferenceBankDiagnostics = {
  speciesId: MascotSpecies;
  status: "species_ready" | "scaffold_only";
  declaredStatus: "species_ready" | "scaffold_only";
  statusMismatch: boolean;
  styleCount: number;
  heroCount: number;
  requiredAssetCount: number;
  requiredAssetSlots: string[];
  unsatisfiedRequiredAssetCount: number;
  unsatisfiedRequiredAssetSlots: string[];
  missingRoles: CharacterReferenceRole[];
  notes: string[];
};

export type ReferenceBankReviewChecklist = {
  summary: string;
  items: string[];
  handoff: string;
};

export function buildReferenceBankReviewChecklist(input: {
  diagnostics: MascotReferenceBankDiagnostics;
  reviewPlan: ReturnType<typeof buildMascotReferenceBankReviewPlan>;
}): ReferenceBankReviewChecklist {
  const { diagnostics, reviewPlan } = input;
  if (!reviewPlan.reviewOnly) {
    return {
      summary: `${diagnostics.speciesId} reference bank is species-ready; no manual pack review slots are required.`,
      items: ["No scaffold-only reference bank review is required for this species."],
      handoff: `reference_bank_ready:${diagnostics.speciesId}`
    };
  }

  const items = [
    diagnostics.statusMismatch
      ? "Keep the pack review-only because bankStatus is ahead of actual asset readiness."
      : `Keep the pack review-only until species-specific ${diagnostics.missingRoles.join("/")} refs are supplied.`
  ];
  const headSlots = reviewPlan.requiredManualSlots.filter((slot) => slot.startsWith("head_"));
  const torsoSlots = reviewPlan.requiredManualSlots.filter((slot) => slot.startsWith("torso_"));
  const facialSlots = reviewPlan.requiredManualSlots.filter(
    (slot) => slot.startsWith("eye_") || slot.startsWith("mouth_")
  );

  if (headSlots.length > 0) {
    items.push(`Check head silhouette and species read: ${headSlots.join(", ")}.`);
  }
  if (torsoSlots.length > 0) {
    items.push(`Check torso/body style consistency: ${torsoSlots.join(", ")}.`);
  }
  if (facialSlots.length > 0) {
    items.push(`Check face identity and viseme stability: ${facialSlots.join(", ")}.`);
  }
  if (diagnostics.requiredAssetSlots.length > 0) {
    items.push(`Asset intake targets before species-ready rollout: ${diagnostics.requiredAssetSlots.join(", ")}.`);
  }
  if (diagnostics.notes.length > 0) {
    items.push(`Reference bank notes: ${diagnostics.notes.join(" | ")}.`);
  }

  return {
    summary:
      `${diagnostics.speciesId} reference bank is scaffold-only; pack should stay review-only ` +
      `with ${reviewPlan.requiredManualSlots.length} manual slot checks.`,
    items,
    handoff:
      `review_only:${diagnostics.speciesId}; missing_roles=${diagnostics.missingRoles.join(",") || "none"}; ` +
      `manual_slots=${reviewPlan.requiredManualSlots.join(",") || "none"}; ` +
      `required_assets=${diagnostics.requiredAssetSlots.join(",") || "none"}`
  };
}

const mascotReferenceBankManifestCache = new Map<string, MascotReferenceBankManifest | null>();
const mascotReferenceAssetCache = new Map<string, BankedInlineImageReference | null>();
const mascotReferenceBankDiagnosticsCache = new Map<string, MascotReferenceBankDiagnostics>();

function loadProductionPoseGuides(views: CharacterView[]): Partial<Record<CharacterView, InlineImageReference>> {
  const loaded: Partial<Record<CharacterView, InlineImageReference>> = {};
  const uniqueViews = new Set(views);
  for (const view of uniqueViews) {
    const guidePath = PRODUCTION_POSE_GUIDE_PATHS[view];
    if (!guidePath || !fs.existsSync(guidePath)) {
      continue;
    }

    const data = fs.readFileSync(guidePath);
    if (data.byteLength === 0) {
      continue;
    }

    loaded[view] = {
      referenceImageBase64: data.toString("base64"),
      referenceMimeType: "image/png"
    };
  }

  return loaded;
}

export function loadStagePoseGuides(input: {
  speciesId?: string;
  views: CharacterView[];
}): Partial<Record<CharacterView, InlineImageReference>> {
  const uniqueViews = [...new Set(input.views)];
  const productionPoseGuides = loadProductionPoseGuides(uniqueViews);
  const loaded: Partial<Record<CharacterView, InlineImageReference>> = {};
  const sideViews = uniqueViews.filter((view) => view !== "front");
  const useMascotPoseReferences = isSupportedMascotSpeciesId(input.speciesId);
  const familyPoseReferencesByView = useMascotPoseReferences
    ? loadMascotFamilyReferencesByView(input.speciesId, sideViews)
    : {};
  const starterPoseReferencesByView = useMascotPoseReferences
    ? loadMascotStarterReferencesByView(input.speciesId, sideViews)
    : {};

  for (const view of uniqueViews) {
    if (view === "front") {
      if (productionPoseGuides.front) {
        loaded.front = productionPoseGuides.front;
      }
      continue;
    }

    const mascotPoseReference = familyPoseReferencesByView[view] ?? starterPoseReferencesByView[view];
    if (mascotPoseReference) {
      loaded[view] = {
        referenceImageBase64: mascotPoseReference.referenceImageBase64,
        referenceMimeType: mascotPoseReference.referenceMimeType
      };
      continue;
    }

    const productionPoseGuide = productionPoseGuides[view];
    if (productionPoseGuide) {
      loaded[view] = productionPoseGuide;
    }
  }

  return loaded;
}

export function buildPreferredSideReferenceInputByView(input: {
  views: CharacterView[];
  familyReferencesByView?: Partial<Record<CharacterView, InlineImageReference>>;
  starterReferenceByView?: Partial<Record<CharacterView, InlineImageReference>>;
}): Partial<Record<CharacterView, InlineImageReference>> {
  const loaded: Partial<Record<CharacterView, InlineImageReference>> = {};
  for (const view of new Set(input.views)) {
    if (view === "front") {
      continue;
    }
    const preferredReference =
      input.starterReferenceByView?.[view] ?? input.familyReferencesByView?.[view];
    if (!preferredReference?.referenceImageBase64) {
      continue;
    }
    loaded[view] = {
      referenceImageBase64: preferredReference.referenceImageBase64,
      referenceMimeType: preferredReference.referenceMimeType
    };
  }
  return loaded;
}

function normalizeMascotReferenceSpeciesId(speciesId?: string): "cat" | "dog" | "wolf" {
  if (speciesId === "dog" || speciesId === "wolf" || speciesId === "cat") {
    return speciesId;
  }
  return "cat";
}

function readRawMascotReferenceBankManifest(speciesId?: string): MascotReferenceBankManifest | null {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const manifestPath = path.join(MASCOT_REFERENCE_BANK_ROOT, normalizedSpecies, "bank.json");
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MascotReferenceBankManifest;
  } catch {
    return null;
  }
}

function mergeMascotReferenceByView(
  base:
    | Partial<Record<CharacterView, MascotReferenceAssetEntry[]>>
    | undefined,
  override:
    | Partial<Record<CharacterView, MascotReferenceAssetEntry[]>>
    | undefined
): Partial<Record<CharacterView, MascotReferenceAssetEntry[]>> | undefined {
  const merged: Partial<Record<CharacterView, MascotReferenceAssetEntry[]>> = {
    ...(base ?? {})
  };
  for (const [view, entries] of Object.entries(override ?? {}) as [CharacterView, MascotReferenceAssetEntry[]][]) {
    merged[view] = entries;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeMascotReferenceBankManifest(
  base: MascotReferenceBankManifest,
  override: MascotReferenceBankManifest
): MascotReferenceBankManifest {
  return {
    ...base,
    ...override,
    profileId: override.profileId ?? base.profileId,
    speciesId: override.speciesId ?? base.speciesId,
    familyId: override.familyId ?? base.familyId,
    bankStatus: override.bankStatus ?? base.bankStatus,
    notes: dedupeStrings([...(base.notes ?? []), ...(override.notes ?? [])]),
    requiredAssets: override.requiredAssets ?? base.requiredAssets,
    style: override.style ?? base.style,
    starterByView: mergeMascotReferenceByView(base.starterByView, override.starterByView),
    familyByView: mergeMascotReferenceByView(base.familyByView, override.familyByView),
    heroByView: mergeMascotReferenceByView(base.heroByView, override.heroByView)
  };
}

function resolveMascotRequiredAssetIndex(slotId: string): number {
  if (slotId.endsWith(".secondary")) {
    return 1;
  }
  if (slotId.endsWith(".tertiary")) {
    return 2;
  }
  return 0;
}

function resolveMascotRequiredAssetEntry(
  manifest: MascotReferenceBankManifest | null,
  requirement: NonNullable<MascotReferenceBankManifest["requiredAssets"]>[number]
): MascotReferenceAssetEntry | undefined {
  const index = resolveMascotRequiredAssetIndex(requirement.slotId);
  if (requirement.role === "style") {
    return manifest?.style?.[index];
  }
  if (requirement.role === "hero") {
    return requirement.view ? manifest?.heroByView?.[requirement.view]?.[index] : undefined;
  }
  if (requirement.role === "composition") {
    return requirement.view ? manifest?.familyByView?.[requirement.view]?.[index] : undefined;
  }
  return undefined;
}

function readMascotReferenceBankManifestAtPath(
  manifestPath: string,
  lineage: Set<string> = new Set<string>()
): MascotReferenceBankManifest | null {
  const resolvedManifestPath = path.resolve(manifestPath);
  if (lineage.has(resolvedManifestPath) || !fs.existsSync(resolvedManifestPath)) {
    return null;
  }

  lineage.add(resolvedManifestPath);
  try {
    const parsed = JSON.parse(fs.readFileSync(resolvedManifestPath, "utf8")) as MascotReferenceBankManifest;
    const baseReference =
      typeof parsed.extends === "string" && parsed.extends.trim().length > 0 ? parsed.extends.trim() : undefined;
    if (!baseReference) {
      return parsed;
    }
    const baseManifest = readMascotReferenceBankManifestAtPath(
      path.resolve(path.dirname(resolvedManifestPath), baseReference),
      lineage
    );
    return baseManifest ? mergeMascotReferenceBankManifest(baseManifest, parsed) : parsed;
  } catch {
    return null;
  } finally {
    lineage.delete(resolvedManifestPath);
  }
}

function readMascotReferenceBankManifest(speciesId?: string): MascotReferenceBankManifest | null {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  if (mascotReferenceBankManifestCache.has(normalizedSpecies)) {
    return mascotReferenceBankManifestCache.get(normalizedSpecies) ?? null;
  }

  const manifestPath = path.join(MASCOT_REFERENCE_BANK_ROOT, normalizedSpecies, "bank.json");
  if (!fs.existsSync(manifestPath)) {
    mascotReferenceBankManifestCache.set(normalizedSpecies, null);
    return null;
  }

  try {
    const parsed = readMascotReferenceBankManifestAtPath(manifestPath);
    mascotReferenceBankManifestCache.set(normalizedSpecies, parsed);
    return parsed;
  } catch {
    mascotReferenceBankManifestCache.set(normalizedSpecies, null);
    return null;
  }
}

function summarizeMascotReferenceBankDiagnostics(speciesId?: string): MascotReferenceBankDiagnostics {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const cached = mascotReferenceBankDiagnosticsCache.get(normalizedSpecies);
  if (cached) {
    return cached;
  }
  const manifest = readMascotReferenceBankManifest(normalizedSpecies);
  const styleCount = Array.isArray(manifest?.style) ? manifest.style.length : 0;
  const heroCount = Object.values(manifest?.heroByView ?? {}).reduce(
    (sum, entries) => sum + (Array.isArray(entries) ? entries.length : 0),
    0
  );
  const requiredAssetSlots = (manifest?.requiredAssets ?? [])
    .map((entry) => (typeof entry?.slotId === "string" ? entry.slotId.trim() : ""))
    .filter((entry) => entry.length > 0);
  const rawManifest = readRawMascotReferenceBankManifest(normalizedSpecies);
  const manifestPath = path.join(MASCOT_REFERENCE_BANK_ROOT, normalizedSpecies, "bank.json");
  const manifestDir = path.dirname(manifestPath);
  const unsatisfiedRequiredAssetSlots = (manifest?.requiredAssets ?? [])
    .filter((requirement) => {
      const entry = resolveMascotRequiredAssetEntry(rawManifest, requirement);
      const resolvedPath =
        entry?.path && entry.path.trim().length > 0 ? path.resolve(manifestDir, entry.path.trim()) : undefined;
      return !resolvedPath || !fs.existsSync(resolvedPath);
    })
    .map((entry) => (typeof entry?.slotId === "string" ? entry.slotId.trim() : ""))
    .filter((entry) => entry.length > 0);
  const declaredStatus = manifest?.bankStatus ?? (styleCount > 0 ? "species_ready" : "scaffold_only");
  const status = resolveEffectiveMascotReferenceBankStatus({
    declaredStatus,
    styleCount,
    unsatisfiedRequiredAssetCount: unsatisfiedRequiredAssetSlots.length
  });
  const missingRoles: CharacterReferenceRole[] = [];
  if (styleCount === 0) {
    missingRoles.push("style");
  }
  if (heroCount === 0) {
    missingRoles.push("hero");
  }
  const diagnostics: MascotReferenceBankDiagnostics = {
    speciesId: normalizedSpecies,
    status,
    declaredStatus,
    statusMismatch: declaredStatus !== status,
    styleCount,
    heroCount,
    requiredAssetCount: requiredAssetSlots.length,
    requiredAssetSlots,
    unsatisfiedRequiredAssetCount: unsatisfiedRequiredAssetSlots.length,
    unsatisfiedRequiredAssetSlots,
    missingRoles,
    notes: [...(manifest?.notes ?? [])]
  };
  mascotReferenceBankDiagnosticsCache.set(normalizedSpecies, diagnostics);
  return diagnostics;
}

function readBankedInlineImageReference(
  manifestDir: string,
  entry: MascotReferenceAssetEntry | undefined
): BankedInlineImageReference | undefined {
  if (!entry?.path) {
    return undefined;
  }

  const resolvedPath = path.resolve(manifestDir, entry.path);
  if (mascotReferenceAssetCache.has(resolvedPath)) {
    return mascotReferenceAssetCache.get(resolvedPath) ?? undefined;
  }
  if (!fs.existsSync(resolvedPath)) {
    mascotReferenceAssetCache.set(resolvedPath, null);
    return undefined;
  }

  const data = fs.readFileSync(resolvedPath);
  if (data.byteLength === 0) {
    mascotReferenceAssetCache.set(resolvedPath, null);
    return undefined;
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const mimeType =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : "image/png";

  const loaded: BankedInlineImageReference = {
    sourcePath: resolvedPath,
    referenceImageBase64: data.toString("base64"),
    referenceMimeType: mimeType,
    ...(entry.note ? { note: entry.note } : {}),
    ...(typeof entry.weight === "number" ? { declaredWeight: entry.weight } : {})
  };
  mascotReferenceAssetCache.set(resolvedPath, loaded);
  return loaded;
}

function loadMascotStyleReferenceEntries(speciesId?: string): BankedInlineImageReference[] {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const manifestPath = path.join(MASCOT_REFERENCE_BANK_ROOT, normalizedSpecies, "bank.json");
  const manifest = readMascotReferenceBankManifest(normalizedSpecies);
  const manifestDir = path.dirname(manifestPath);
  return (manifest?.style ?? [])
    .map((entry) => readBankedInlineImageReference(manifestDir, entry))
    .filter((entry): entry is BankedInlineImageReference => Boolean(entry));
}

function loadMascotReferenceEntriesByView(
  speciesId: string | undefined,
  section: "starterByView" | "familyByView" | "heroByView",
  view: CharacterView
): BankedInlineImageReference[] {
  const normalizedSpecies = normalizeMascotReferenceSpeciesId(speciesId);
  const manifestPath = path.join(MASCOT_REFERENCE_BANK_ROOT, normalizedSpecies, "bank.json");
  const manifest = readMascotReferenceBankManifest(normalizedSpecies);
  const manifestDir = path.dirname(manifestPath);
  const scopedEntries =
    section === "starterByView"
      ? manifest?.starterByView?.[view]
      : section === "familyByView"
        ? manifest?.familyByView?.[view]
        : manifest?.heroByView?.[view];

  return (scopedEntries ?? [])
    .map((entry) => readBankedInlineImageReference(manifestDir, entry))
    .filter((entry): entry is BankedInlineImageReference => Boolean(entry));
}

function loadMascotStarterReference(
  speciesId?: string,
  view: CharacterView = "front"
): BankedInlineImageReference | undefined {
  return loadMascotReferenceEntriesByView(speciesId, "starterByView", view)[0];
}

function loadMascotStarterReferencesByView(
  speciesId: string | undefined,
  views: CharacterView[]
): Partial<Record<CharacterView, BankedInlineImageReference>> {
  const loaded: Partial<Record<CharacterView, BankedInlineImageReference>> = {};
  for (const view of new Set(views)) {
    const starter = loadMascotStarterReference(speciesId, view);
    if (starter) {
      loaded[view] = starter;
    }
  }
  return loaded;
}

function loadMascotFamilyReference(
  speciesId: string | undefined,
  view: CharacterView
): BankedInlineImageReference | undefined {
  return loadMascotReferenceEntriesByView(speciesId, "familyByView", view)[0];
}

function loadMascotFamilyReferenceCached(
  speciesId: string | undefined,
  view: CharacterView
): BankedInlineImageReference | undefined {
  return loadMascotFamilyReference(speciesId, view);
}

function loadMascotHeroReference(
  speciesId: string | undefined,
  view: CharacterView = "front"
): BankedInlineImageReference | undefined {
  return loadMascotReferenceEntriesByView(speciesId, "heroByView", view)[0];
}

function loadMascotFrontBootstrapReference(
  speciesId?: string
): BankedInlineImageReference | undefined {
  const normalizedSpecies = normalizeGenerationSpecies(speciesId);
  if (normalizedSpecies !== "dog" && normalizedSpecies !== "wolf") {
    return undefined;
  }
  return (
    loadMascotStarterReference(speciesId, "front") ??
    loadMascotHeroReference(speciesId, "front") ??
    loadMascotFamilyReferenceCached(speciesId, "front")
  );
}

function loadMascotFamilyStyleReferenceCached(speciesId?: string): BankedInlineImageReference | undefined {
  return loadMascotStyleReferenceEntries(speciesId)[0];
}

function loadMascotFamilyReferencesByView(
  speciesId: string | undefined,
  views: CharacterView[]
): Partial<Record<CharacterView, BankedInlineImageReference>> {
  const loaded: Partial<Record<CharacterView, BankedInlineImageReference>> = {};
  for (const view of new Set(views)) {
    const reference = loadMascotFamilyReferenceCached(speciesId, view);
    if (reference) {
      loaded[view] = reference;
    }
  }
  return loaded;
}

export function resolveAdaptiveReferenceWeight(input: {
  stage: GenerationStageKey;
  role: CharacterReferenceBankEntry["role"];
  targetView: CharacterView;
  hasStarter?: boolean;
  directiveFamilies?: RepairDirectiveFamily[];
  directiveSeverity?: RepairDirectiveSeverity;
  echoView?: CharacterView;
}): number {
  let weight =
    input.role === "front_master"
      ? input.stage === "lock"
        ? 0.97
        : input.stage === "refine"
          ? 0.95
          : input.targetView === "front"
            ? 0.98
            : 0.92
      : input.role === "hero"
        ? input.stage === "lock"
          ? 0.78
          : input.stage === "repair"
            ? 0.74
            : input.stage === "refine"
              ? 0.7
              : 0.62
      : input.role === "subject"
        ? input.stage === "front"
          ? 0.96
          : input.stage === "lock"
            ? 0.9
          : input.stage === "refine"
            ? 0.88
            : 0.84
        : input.role === "starter"
          ? input.stage === "lock"
            ? 0.48
            : input.stage === "refine"
              ? 0.44
              : 0.4
          : input.role === "view_starter"
            ? input.stage === "lock"
              ? 0.46
              : input.stage === "refine"
                ? 0.42
                : input.stage === "angles" && input.targetView !== "front"
                  ? 0.48
                  : 0.38
            : input.role === "repair_base"
              ? 0.84
              : input.role === "style"
                ? input.stage === "front"
                  ? 0.36
                  : input.stage === "repair"
                    ? 0.18
                    : input.stage === "lock"
                      ? 0.14
                    : input.stage === "refine"
                      ? 0.16
                    : 0.18
                : input.stage === "front"
                  ? 0.2
                  : input.stage === "repair"
                    ? 0.36
                    : input.stage === "lock"
                      ? 0.3
                    : input.stage === "refine"
                      ? 0.38
                    : 0.56;

  if (input.stage === "lock") {
    if (input.role === "front_master" || input.role === "subject" || input.role === "hero") {
      weight += 0.01;
    }
    if (input.role === "composition") {
      weight += 0.08;
    }
  } else if (input.stage === "refine") {
    if (input.role === "front_master") {
      weight += 0.01;
    }
    if (input.role === "composition") {
      weight += 0.04;
    }
  }

  if (input.targetView === "profile") {
    if (input.role === "front_master" || input.role === "subject" || input.role === "hero") {
      weight -= 0.05;
    }
    if (input.role === "composition") {
      weight += 0.08;
    }
    if (input.role === "view_starter") {
      weight += 0.08;
    }
    if (input.role === "style") {
      weight += 0.02;
    }
  } else if (input.targetView === "threeQuarter") {
    if (input.role === "front_master" || input.role === "subject" || input.role === "hero") {
      weight -= 0.03;
    }
    if (input.role === "composition") {
      weight += 0.05;
    }
    if (input.role === "view_starter") {
      weight += 0.06;
    }
  } else if (input.targetView === "front") {
    if (input.role === "style") {
      weight += 0.04;
    }
    if (input.role === "composition") {
      weight -= 0.06;
    }
  }

  if (input.hasStarter === false) {
    if (input.role === "composition") {
      weight += input.stage === "front" ? 0 : 0.04;
    }
    if (input.role === "style") {
      weight += 0.02;
    }
  }

  const families = new Set(input.directiveFamilies ?? []);
  if (families.has("identity_lock")) {
    if (input.role === "front_master" || input.role === "subject" || input.role === "hero") {
      weight += 0.05;
    }
    if (input.role === "composition") {
      weight -= 0.04;
    }
  }
  if (families.has("face_symmetry")) {
    if (input.role === "style") {
      weight += 0.05;
    }
    if (input.role === "front_master") {
      weight += 0.03;
    }
  }
  if (families.has("species_silhouette")) {
    if (input.role === "front_master" || input.role === "style" || input.role === "hero") {
      weight += 0.04;
    }
    if (input.role === "starter" || input.role === "view_starter") {
      weight += 0.06;
    }
    if (input.role === "composition") {
      weight -= 0.02;
    }
  }
  if (families.has("paw_cleanup")) {
    if (input.role === "starter" || input.role === "view_starter") {
      weight += 0.08;
    }
    if (input.role === "composition") {
      weight -= 0.04;
    }
  }
  if (families.has("body_silhouette")) {
    if (input.role === "composition") {
      weight += 0.08;
    }
    if (input.targetView === "threeQuarter") {
      if (input.role === "view_starter") {
        weight += 0.08;
      }
      if (input.role === "front_master" || input.role === "subject" || input.role === "hero") {
        weight -= 0.05;
      }
    }
    if (input.role === "repair_base") {
      weight += 0.03;
    }
  }
  if (families.has("style_cleanup")) {
    if (input.role === "style") {
      weight += 0.08;
    }
    if (input.role === "front_master") {
      weight += 0.02;
    }
    if (input.role === "composition") {
      weight -= 0.03;
    }
  }

  if (input.directiveSeverity === "high") {
    if (input.role === "front_master" || input.role === "repair_base" || input.role === "hero") {
      weight += 0.02;
    }
    if (input.role === "composition") {
      weight -= 0.02;
    }
  }

  if (input.targetView !== "front") {
    const sideStage =
      input.stage === "angles" || input.stage === "view_only" || input.stage === "refine" || input.stage === "lock";
    if (sideStage) {
      if (input.stage === "angles") {
        if (input.role === "front_master") {
          weight -= input.hasStarter === true ? 0.14 : 0.08;
        } else if (input.role === "subject") {
          weight -= input.hasStarter === true ? 0.1 : 0.05;
        } else if (input.role === "hero") {
          weight -= input.hasStarter === true ? 0.08 : 0.04;
        } else if (input.role === "composition") {
          weight += input.hasStarter === true ? 0.1 : 0.06;
        } else if (input.role === "view_starter") {
          weight += input.hasStarter === true ? 0.06 : 0.02;
        }
      }
      if (input.role === "front_master") {
        const baseCap =
          input.stage === "angles"
            ? input.hasStarter === true
              ? input.targetView === "profile"
                ? 0.5
                : 0.54
              : input.targetView === "profile"
                ? 0.64
                : 0.68
            : input.hasStarter === true
              ? input.stage === "lock"
                ? input.targetView === "profile"
                  ? 0.58
                  : 0.6
                : input.stage === "refine"
                  ? input.targetView === "profile"
                    ? 0.62
                    : 0.64
                  : input.targetView === "profile"
                    ? 0.62
                    : 0.64
              : input.stage === "lock"
                ? input.targetView === "profile"
                  ? 0.64
                  : 0.66
                : input.stage === "refine"
                  ? input.targetView === "profile"
                    ? 0.68
                    : 0.7
                : input.targetView === "profile"
                    ? 0.72
                    : 0.74;
        const minimumFrontMasterWeight =
          resolveStageInputMinimumReferenceWeights(input.stage, input.targetView).front_master ?? 0;
        const cap =
          input.stage === "angles"
            ? baseCap
            : Math.max(baseCap, Number((minimumFrontMasterWeight + 0.04).toFixed(3)));
        weight = Math.min(weight, cap);
      } else if (input.role === "hero") {
        const cap =
          input.stage === "angles"
            ? input.hasStarter === true
              ? input.targetView === "profile"
                ? 0.38
                : 0.42
              : input.targetView === "profile"
                ? 0.42
                : 0.46
            : input.stage === "lock"
              ? input.targetView === "profile"
                ? 0.54
                : 0.58
              : input.stage === "refine"
                ? input.targetView === "profile"
                  ? 0.5
                  : 0.54
                : input.targetView === "profile"
                  ? 0.46
                  : 0.5;
        weight = Math.min(weight, cap);
      } else if (input.role === "subject") {
        const cap =
          input.stage === "angles"
            ? input.hasStarter === true
              ? input.targetView === "profile"
                ? 0.54
                : 0.58
              : input.targetView === "profile"
                ? 0.62
                : 0.66
            : input.stage === "lock"
              ? input.targetView === "profile"
                ? 0.6
                : 0.62
              : input.stage === "refine"
                ? input.targetView === "profile"
                  ? 0.64
                  : 0.66
                : input.targetView === "profile"
                  ? 0.68
                  : 0.7;
        weight = Math.min(weight, cap);
      } else if (input.role === "composition") {
        const floor =
          input.stage === "angles"
            ? input.hasStarter === true
              ? input.targetView === "profile"
                ? 0.86
                : 0.82
              : input.targetView === "profile"
                ? 0.76
                : 0.72
            : input.hasStarter === true
              ? input.stage === "lock"
                ? input.targetView === "profile"
                  ? 0.72
                  : 0.7
                : input.stage === "refine"
                  ? input.targetView === "profile"
                    ? 0.66
                    : 0.64
                  : input.targetView === "profile"
                    ? 0.76
                    : 0.74
              : input.stage === "lock"
                ? input.targetView === "profile"
                  ? 0.64
                  : 0.62
                : input.stage === "refine"
                  ? input.targetView === "profile"
                    ? 0.58
                    : 0.56
                  : input.targetView === "profile"
                    ? 0.68
                    : 0.66;
        weight = Math.max(weight, floor);
      } else if (input.role === "view_starter") {
        const floor =
          input.stage === "angles"
            ? input.hasStarter === true
              ? input.targetView === "profile"
                ? 0.56
                : 0.52
              : input.targetView === "profile"
                ? 0.44
                : 0.42
            : input.stage === "lock"
              ? input.targetView === "profile"
                ? 0.36
                : 0.34
              : input.stage === "refine"
                ? input.targetView === "profile"
                  ? 0.32
                  : 0.3
                : input.targetView === "profile"
                  ? 0.34
                  : 0.32;
        weight = Math.max(weight, floor);
      } else if (input.role === "style") {
        const cap = input.stage === "lock" ? 0.08 : input.stage === "refine" ? 0.1 : 0.12;
        weight = Math.min(weight, cap);
      }
    }
  }

  if (input.stage === "front" && input.targetView === "front" && input.role === "composition") {
    weight = Math.max(weight, input.hasStarter === false ? 0.34 : 0.3);
  }

  if (input.role === "style" && input.echoView) {
    weight *= input.echoView === "threeQuarter" ? 0.64 : 0.52;
  }

  return Number(clamp01(weight).toFixed(3));
}

function resolveWorkflowStageForGenerationStage(stage: GenerationStageKey): CharacterWorkflowStage {
  if (stage === "front") {
    return "front_master";
  }
  if (stage === "refine") {
    return "side_view_refine";
  }
  if (stage === "lock") {
    return "identity_lock_refine";
  }
  if (stage === "view_only") {
    return "view_only";
  }
  if (stage === "repair") {
    return "repair_refine";
  }
  return "side_view_base";
}

export function shouldEnableMascotHeroMode(input: {
  stage: GenerationStageKey;
  heroMode:
    | {
        allowOptionalHeroRef?: boolean;
        stages?: CharacterWorkflowStage[];
        minFrontScore?: number;
      }
    | undefined;
  frontAnchorScore?: number;
}): boolean {
  if (!input.heroMode?.allowOptionalHeroRef) {
    return false;
  }
  const workflowStage = resolveWorkflowStageForGenerationStage(input.stage);
  if (Array.isArray(input.heroMode.stages) && !input.heroMode.stages.includes(workflowStage)) {
    return false;
  }
  if (typeof input.heroMode.minFrontScore === "number" && typeof input.frontAnchorScore === "number") {
    return input.frontAnchorScore >= input.heroMode.minFrontScore;
  }
  return true;
}

export function buildMascotFamilyReferenceEntries(input: {
  speciesId?: string;
  targetView: CharacterView;
  stage: GenerationStageKey;
  familyReferencesByView: Partial<Record<CharacterView, BankedInlineImageReference>>;
  hasStarter: boolean;
  directiveFamilies?: RepairDirectiveFamily[];
  directiveSeverity?: RepairDirectiveSeverity;
  preferMultiReference?: boolean;
  heroModeEnabled?: boolean;
}): CharacterReferenceBankEntry[] {
  const entries: CharacterReferenceBankEntry[] = [];
  const targetReference = input.familyReferencesByView[input.targetView];
  const styleReferences = loadMascotStyleReferenceEntries(input.speciesId);
  const declaredCompositionReferences = loadMascotReferenceEntriesByView(input.speciesId, "familyByView", input.targetView);
  const compositionReferences = (declaredCompositionReferences.length > 0 ? declaredCompositionReferences : targetReference ? [targetReference] : [])
    .filter((entry, index) => input.preferMultiReference === true || index === 0);
  const heroReferences =
    input.heroModeEnabled === true
      ? loadMascotReferenceEntriesByView(input.speciesId, "heroByView", "front")
      : [];
  const heroReferenceWeightCap = resolveMascotSpeciesProfile(input.speciesId).heroMode.maxReferenceWeight;

  for (const [index, styleReference] of styleReferences.entries()) {
    entries.push(
      createReferenceBankEntry({
        id: `${input.stage}_${input.targetView}_family_style_${index}`,
        role: "style",
        view: "front",
        weight: Number(
          clamp01(
            Math.min(
              styleReference.declaredWeight ?? 1,
              resolveAdaptiveReferenceWeight({
                stage: input.stage,
                role: "style",
                targetView: input.targetView,
                hasStarter: input.hasStarter,
                directiveFamilies: input.directiveFamilies,
                directiveSeverity: input.directiveSeverity,
                ...(index > 0 ? { echoView: input.targetView } : {})
              })
            )
          ).toFixed(3)
        ),
        note:
          input.targetView === "front"
            ? `${styleReference.note ?? styleReference.sourcePath} (house style canon)`
            : `${styleReference.note ?? styleReference.sourcePath} (front house style anchor)`,
        image: styleReference
      })
    );
  }

  if (
    compositionReferences.length > 0 &&
    (input.targetView !== "front"
      ? input.stage === "angles" ||
        input.stage === "view_only" ||
        input.stage === "refine" ||
        input.stage === "lock"
      : input.stage === "front" || input.stage === "view_only" || input.stage === "repair")
  ) {
    for (const [index, compositionReference] of compositionReferences.entries()) {
      entries.push(
        createReferenceBankEntry({
          id: `${input.stage}_${input.targetView}_family_composition_${index}`,
          role: "composition",
          view: input.targetView,
          weight: Number(
            clamp01(
              Math.min(
                compositionReference.declaredWeight ?? 1,
                resolveAdaptiveReferenceWeight({
                  stage: input.stage,
                  role: "composition",
                  targetView: input.targetView,
                  hasStarter: input.hasStarter,
                  directiveFamilies: input.directiveFamilies,
                  directiveSeverity: input.directiveSeverity
                })
              )
            ).toFixed(3)
          ),
          note: `${compositionReference.note ?? compositionReference.sourcePath} (target view composition anchor)`,
          image: compositionReference
        })
      );
    }
  }

  for (const [index, heroReference] of heroReferences.entries()) {
    entries.push(
      createReferenceBankEntry({
        id: `${input.stage}_${input.targetView}_hero_${index}`,
        role: "hero",
        view: "front",
        weight: Number(
          clamp01(
            Math.min(
              heroReference.declaredWeight ?? 1,
              heroReferenceWeightCap,
              resolveAdaptiveReferenceWeight({
                stage: input.stage,
                role: "hero",
                targetView: input.targetView,
                hasStarter: input.hasStarter,
                directiveFamilies: input.directiveFamilies,
                directiveSeverity: input.directiveSeverity
              })
            )
          ).toFixed(3)
        ),
        note: `${heroReference.note ?? heroReference.sourcePath} (hero identity anchor)`,
        image: heroReference
      })
    );
  }

  return dedupeReferenceBank(entries);
}

function excludePoseGuidesCoveredByStarter(
  stage: GenerationStageKey,
  poseGuidesByView: Partial<Record<CharacterView, InlineImageReference>>,
  starterReferenceByView: Partial<Record<CharacterView, InlineImageReference & { sourcePath: string }>>
): Partial<Record<CharacterView, InlineImageReference>> {
  if (stage === "angles" || stage === "view_only" || stage === "refine" || stage === "lock") {
    return { ...poseGuidesByView };
  }
  const filtered: Partial<Record<CharacterView, InlineImageReference>> = {};
  for (const [view, guide] of Object.entries(poseGuidesByView) as [CharacterView, InlineImageReference][]) {
    if (starterReferenceByView[view]) {
      continue;
    }
    filtered[view] = guide;
  }
  return filtered;
}

type GenerationLimits = {
  maxCandidatesPerView: number;
  maxTotalImages: number;
  maxRetries: number;
  monthlyBudgetUsd: number;
  costPerImageUsd: number;
  budgetFallbackToMock: boolean;
};

type GenerationBudgetState = {
  monthSpentUsd: number;
  monthBudgetUsd: number;
  estimatedCostThisRunUsd: number;
  wouldExceed: boolean;
};

type GenerationQualityConfig = {
  minAcceptedScore: number;
  autoRetryRounds: number;
  sequentialReference: boolean;
  lowQualityFallbackToMock: boolean;
};

type AutoRerouteConfig = {
  enabled: boolean;
  targetedCandidateBoost: number;
  fullPackCandidateBoost: number;
  targetedThresholdBoost: number;
  fullPackThresholdBoost: number;
  seedOffset: number;
};

type ContinuityReferenceConfig = {
  maxSessionAgeHours: number;
  minScore: number;
  maxRejections: number;
  requirePicked: boolean;
  requireScore: boolean;
  candidateTake: number;
  preferredSessionTake: number;
  fallbackSessionTake: number;
};

function toFiniteNonNegative(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toNonNegativeInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function clampInt(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function readGenerationLimits(): GenerationLimits {
  const budgetFallbackFlag = (process.env.IMAGEGEN_BUDGET_FALLBACK_TO_MOCK ?? "true").trim().toLowerCase();
  return {
    maxCandidatesPerView: toPositiveInt(process.env.IMAGEGEN_MAX_CANDIDATES_PER_VIEW, 6),
    maxTotalImages: toPositiveInt(process.env.IMAGEGEN_MAX_TOTAL_IMAGES, 24),
    maxRetries: toPositiveInt(process.env.IMAGEGEN_MAX_RETRIES, 2),
    monthlyBudgetUsd: toFiniteNonNegative(process.env.IMAGEGEN_MONTHLY_BUDGET_USD, 30),
    costPerImageUsd: toFiniteNonNegative(process.env.IMAGEGEN_COST_PER_IMAGE_USD, 0),
    budgetFallbackToMock: !["false", "0", "no", "off"].includes(budgetFallbackFlag)
  };
}

function readGenerationQualityConfig(): GenerationQualityConfig {
  const sequentialFlag = (process.env.IMAGEGEN_SEQUENTIAL_REFERENCE ?? "true").trim().toLowerCase();
  const fallbackFlag = (process.env.IMAGEGEN_LOW_QUALITY_FALLBACK_TO_MOCK ?? "true").trim().toLowerCase();
  return {
    minAcceptedScore: toFiniteNonNegative(process.env.IMAGEGEN_MIN_ACCEPTED_SCORE, 0.5),
    autoRetryRounds: Math.max(0, toPositiveInt(process.env.IMAGEGEN_AUTO_RETRY_ROUNDS, 2)),
    sequentialReference: !["false", "0", "no", "off"].includes(sequentialFlag),
    lowQualityFallbackToMock: !["false", "0", "no", "off"].includes(fallbackFlag)
  };
}

export function readAutoRerouteConfig(): AutoRerouteConfig {
  const enabledFlag = (process.env.CHARACTER_AUTO_REROUTE_ENABLED ?? "true").trim().toLowerCase();
  return {
    enabled: !["false", "0", "no", "off"].includes(enabledFlag),
    targetedCandidateBoost: clampInt(toNonNegativeInt(process.env.CHARACTER_AUTO_REROUTE_TARGETED_BOOST, 1), 0, 4),
    fullPackCandidateBoost: clampInt(toNonNegativeInt(process.env.CHARACTER_AUTO_REROUTE_FULLPACK_BOOST, 2), 0, 4),
    targetedThresholdBoost: clamp01(toFiniteNonNegative(process.env.CHARACTER_AUTO_REROUTE_TARGETED_THRESHOLD_BOOST, 0.02)),
    fullPackThresholdBoost: clamp01(toFiniteNonNegative(process.env.CHARACTER_AUTO_REROUTE_FULLPACK_THRESHOLD_BOOST, 0.03)),
    seedOffset: clampInt(toPositiveInt(process.env.CHARACTER_AUTO_REROUTE_SEED_OFFSET, 20000), 1000, 500000)
  };
}

function shouldAutoContinuityReference(): boolean {
  const raw = (process.env.CHARACTER_AUTO_CONTINUITY_REFERENCE ?? "true").trim().toLowerCase();
  return !["false", "0", "no", "off"].includes(raw);
}

function readContinuityReferenceConfig(): ContinuityReferenceConfig {
  const requirePickedFlag = (process.env.CHARACTER_AUTO_CONTINUITY_REQUIRE_PICKED ?? "true").trim().toLowerCase();
  const requireScoreFlag = (process.env.CHARACTER_AUTO_CONTINUITY_REQUIRE_SCORE ?? "true").trim().toLowerCase();
  const maxSessionAgeHours = clampInt(toPositiveInt(process.env.CHARACTER_AUTO_CONTINUITY_MAX_SESSION_AGE_HOURS, 168), 1, 24 * 365);
  const candidateTake = clampInt(toPositiveInt(process.env.CHARACTER_AUTO_CONTINUITY_CANDIDATE_TAKE, 10), 1, 50);
  const preferredSessionTake = clampInt(
    toPositiveInt(process.env.CHARACTER_AUTO_CONTINUITY_PREFERRED_TAKE, 8),
    1,
    100
  );
  const fallbackSessionTake = clampInt(
    toPositiveInt(process.env.CHARACTER_AUTO_CONTINUITY_FALLBACK_TAKE, 12),
    1,
    150
  );
  return {
    maxSessionAgeHours,
    minScore: clamp01(toFiniteNonNegative(process.env.CHARACTER_AUTO_CONTINUITY_MIN_SCORE, 0.62)),
    maxRejections: toNonNegativeInt(process.env.CHARACTER_AUTO_CONTINUITY_MAX_REJECTIONS, 1),
    requirePicked: !["false", "0", "no", "off"].includes(requirePickedFlag),
    requireScore: !["false", "0", "no", "off"].includes(requireScoreFlag),
    candidateTake,
    preferredSessionTake,
    fallbackSessionTake
  };
}

function clampGenerationRequest(
  input: CharacterGenerationPayload,
  viewCount: number,
  limits: GenerationLimits
): {
  candidateCount: number;
  totalImages: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let candidateCount = Math.max(1, input.candidateCount ?? 4);
  if (candidateCount > limits.maxCandidatesPerView) {
    warnings.push(`candidateCount clamped ${candidateCount} -> ${limits.maxCandidatesPerView}`);
    candidateCount = limits.maxCandidatesPerView;
  }

  const maxByTotal = Math.max(1, Math.floor(limits.maxTotalImages / Math.max(1, viewCount)));
  if (candidateCount > maxByTotal) {
    warnings.push(`candidateCount clamped by maxTotalImages ${candidateCount} -> ${maxByTotal}`);
    candidateCount = maxByTotal;
  }

  const totalImages = candidateCount * Math.max(1, viewCount);
  return {
    candidateCount,
    totalImages,
    warnings
  };
}

function clampStageCandidateCount(
  requestedCandidateCount: number,
  budgetViewCount: number,
  limits: GenerationLimits
): {
  candidateCount: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  let candidateCount = Math.max(1, requestedCandidateCount);
  if (candidateCount > limits.maxCandidatesPerView) {
    warnings.push(`candidateCount clamped ${candidateCount} -> ${limits.maxCandidatesPerView}`);
    candidateCount = limits.maxCandidatesPerView;
  }

  const maxByTotal = Math.max(1, Math.floor(limits.maxTotalImages / Math.max(1, budgetViewCount)));
  if (candidateCount > maxByTotal) {
    warnings.push(`candidateCount clamped by maxTotalImages ${candidateCount} -> ${maxByTotal}`);
    candidateCount = maxByTotal;
  }

  return {
    candidateCount,
    warnings
  };
}

function getRemoteApiConfig(): {
  baseUrl?: string;
  apiKey?: string;
  headerName: string;
  headerValuePrefix: string;
  timeoutMs: number;
} {
  const baseUrl = process.env.IMAGEGEN_REMOTE_BASE_URL?.trim();
  const apiKey = process.env.IMAGEGEN_REMOTE_API_KEY?.trim();
  const headerName = process.env.IMAGEGEN_REMOTE_HEADER_NAME?.trim() || "Authorization";
  const headerValuePrefix = process.env.IMAGEGEN_REMOTE_HEADER_VALUE_PREFIX ?? "Bearer ";
  const timeoutMs = toPositiveInt(process.env.IMAGEGEN_REMOTE_TIMEOUT_MS, 60_000);

  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
    headerName,
    headerValuePrefix,
    timeoutMs
  };
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number.parseFloat(String(value));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

async function readMonthlySpentUsd(prisma: PrismaClient): Promise<number> {
  let rows: Array<{ total: unknown }> = [];
  try {
    rows = await prisma.$queryRaw<Array<{ total: unknown }>>`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total
      FROM provider_call_logs
      WHERE created_at >= DATE_TRUNC('month', NOW())
    `;
  } catch {
    return 0;
  }
  if (rows.length === 0) {
    return 0;
  }
  return Math.max(0, asNumber(rows[0].total));
}

async function evaluateBudget(
  prisma: PrismaClient,
  estimatedImageCount: number,
  limits: GenerationLimits
): Promise<GenerationBudgetState> {
  const monthSpentUsd = await readMonthlySpentUsd(prisma);
  const estimatedCostThisRunUsd = Math.max(0, estimatedImageCount * limits.costPerImageUsd);
  const wouldExceed = monthSpentUsd + estimatedCostThisRunUsd > limits.monthlyBudgetUsd;
  return {
    monthSpentUsd,
    monthBudgetUsd: limits.monthlyBudgetUsd,
    estimatedCostThisRunUsd,
    wouldExceed
  };
}

async function insertProviderCallLogs(input: {
  prisma: PrismaClient;
  sessionId?: string;
  episodeId: string;
  callLogs: CharacterProviderCallLog[];
}): Promise<void> {
  const { prisma, sessionId, episodeId, callLogs } = input;
  if (callLogs.length === 0) {
    return;
  }

  try {
    for (const log of callLogs) {
      await prisma.$executeRaw`
        INSERT INTO provider_call_logs (
          id,
          session_id,
          episode_id,
          provider,
          view,
          candidate_index,
          attempt,
          duration_ms,
          estimated_cost_usd,
          result,
          error_summary,
          status_code
        ) VALUES (
          ${randomUUID()},
          ${sessionId ?? null},
          ${episodeId},
          ${log.provider},
          ${log.view},
          ${log.candidateIndex},
          ${log.attempt},
          ${Math.max(0, Math.floor(log.durationMs))},
          ${Math.max(0, log.estimatedCostUsd)},
          ${log.result},
          ${log.errorSummary ?? null},
          ${log.statusCode ?? null}
        )
      `;
    }
  } catch {
    // Do not fail generation if provider_call_logs table is not migrated yet.
    return;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

const STRUCTURE_SENSITIVE_WORKFLOW_STAGES = new Set<string>([
  "side_view_base",
  "side_view_refine",
  "identity_lock_refine",
  "view_only",
  "repair_refine"
]);

function normalizeRuntimeStructureKinds(value: unknown): CharacterStructureControlKind[] {
  return asStringArray(value).filter(
    (entry): entry is CharacterStructureControlKind =>
      entry === "lineart" || entry === "canny" || entry === "depth"
  );
}

function extractCandidateRuntimeQualityDiagnostics(input: {
  candidate: CharacterGenerationCandidate;
  targetStyle?: string;
}): CandidateRuntimeQualityDiagnostics {
  const providerMeta = isRecord(input.candidate.providerMeta) ? input.candidate.providerMeta : null;
  const workflowSummary = providerMeta && isRecord(providerMeta.workflowSummary) ? providerMeta.workflowSummary : null;
  const structureControlDiagnostics =
    providerMeta && isRecord(providerMeta.structureControlDiagnostics)
      ? providerMeta.structureControlDiagnostics
      : workflowSummary && isRecord(workflowSummary.structureControlDiagnostics)
        ? workflowSummary.structureControlDiagnostics
        : null;
  const preflightDiagnostics =
    providerMeta && isRecord(providerMeta.preflightDiagnostics)
      ? providerMeta.preflightDiagnostics
      : workflowSummary && isRecord(workflowSummary.preflightDiagnostics)
        ? workflowSummary.preflightDiagnostics
        : null;
  const routeDecision =
    providerMeta && isRecord(providerMeta.routeDecision)
      ? providerMeta.routeDecision
      : workflowSummary && isRecord(workflowSummary.routeDecision)
        ? workflowSummary.routeDecision
        : null;
  const stagePlan = providerMeta && isRecord(providerMeta.stagePlan) ? providerMeta.stagePlan : null;
  const workflowStage =
    (providerMeta && asString(providerMeta.workflowStage).trim()) ||
    (stagePlan && asString(stagePlan.stage).trim()) ||
    "";
  const selectedMode =
    (routeDecision && asString(routeDecision.selectedMode).trim()) ||
    (providerMeta && asString(providerMeta.mode).trim()) ||
    (workflowSummary && asString(workflowSummary.mode).trim()) ||
    "";
  const preflightWarnings = dedupeStrings(preflightDiagnostics ? asStringArray(preflightDiagnostics.warnings) : []);
  const adapterWarnings = dedupeStrings([
    ...(providerMeta ? asStringArray(providerMeta.warnings) : []),
    ...(workflowSummary ? asStringArray(workflowSummary.warnings) : []),
    ...(providerMeta ? [asString(providerMeta.warning).trim()] : [])
  ].filter((entry) => entry.length > 0));
  const requiredStructureKinds = dedupeStrings([
    ...(preflightDiagnostics ? asStringArray(preflightDiagnostics.requiredStructureControlKinds) : []),
    ...(structureControlDiagnostics ? asStringArray(structureControlDiagnostics.requiredKinds) : [])
  ]).filter(
    (entry): entry is CharacterStructureControlKind =>
      entry === "lineart" || entry === "canny" || entry === "depth"
  );
  const appliedStructureKinds = dedupeStrings([
    ...(structureControlDiagnostics ? asStringArray(structureControlDiagnostics.appliedKinds) : []),
    ...(providerMeta ? normalizeRuntimeStructureKinds(providerMeta.structureControlsApplied) : []),
    ...(workflowSummary ? normalizeRuntimeStructureKinds(workflowSummary.structureControlsApplied) : [])
  ]).filter(
    (entry): entry is CharacterStructureControlKind =>
      entry === "lineart" || entry === "canny" || entry === "depth"
  );
  const missingStructureKinds = dedupeStrings([
    ...(structureControlDiagnostics ? asStringArray(structureControlDiagnostics.missingRequiredKinds) : [])
  ]).filter(
    (entry): entry is CharacterStructureControlKind =>
      entry === "lineart" || entry === "canny" || entry === "depth"
  );
  const structureControlApplied =
    (providerMeta && typeof providerMeta.structureControlApplied === "boolean"
      ? providerMeta.structureControlApplied
      : undefined) ??
    (workflowSummary && typeof workflowSummary.structureControlApplied === "boolean"
      ? workflowSummary.structureControlApplied
      : undefined) ??
    appliedStructureKinds.length > 0;
  const preflightOk =
    preflightDiagnostics && typeof preflightDiagnostics.ok === "boolean" ? preflightDiagnostics.ok : undefined;
  const stageRequiresStrongStructure =
    requiredStructureKinds.length > 0 ||
    (isMascotTargetStyle(input.targetStyle) &&
      input.candidate.view !== "front" &&
      STRUCTURE_SENSITIVE_WORKFLOW_STAGES.has(workflowStage));
  const structureGap =
    stageRequiresStrongStructure &&
    (missingStructureKinds.length > 0 || (!structureControlApplied && appliedStructureKinds.length === 0));
  const fallbackUsed = routeDecision ? routeDecision.fallbackUsed === true : false;
  const routeDegraded =
    stageRequiresStrongStructure && selectedMode.length > 0 && !selectedMode.startsWith("checkpoint-ultra");

  const rejectionReasons: string[] = [];
  const warningReasons: string[] = [];
  if (preflightOk === false) {
    rejectionReasons.push("runtime_preflight_failed");
  }
  if (structureGap) {
    rejectionReasons.push("runtime_structure_missing");
  } else if (stageRequiresStrongStructure && appliedStructureKinds.length === 0 && !structureControlApplied) {
    warningReasons.push("runtime_structure_soft");
  }
  if (routeDegraded) {
    warningReasons.push("runtime_route_degraded");
  }
  if (fallbackUsed) {
    warningReasons.push("runtime_fallback_used");
  }
  if (preflightWarnings.length > 0) {
    warningReasons.push("runtime_preflight_warnings");
  }
  if (adapterWarnings.length > 0) {
    warningReasons.push("runtime_adapter_warning_present");
  }

  const requiredCoverageBase = requiredStructureKinds.length > 0 ? requiredStructureKinds.length : 0;
  const missingCoverageCount =
    missingStructureKinds.length > 0
      ? missingStructureKinds.length
      : requiredCoverageBase > 0
        ? requiredStructureKinds.filter((kind) => !appliedStructureKinds.includes(kind)).length
        : 0;
  const structureCoverageScore =
    requiredCoverageBase > 0
      ? clamp01(1 - missingCoverageCount / requiredCoverageBase)
      : structureControlApplied
        ? 1
        : routeDegraded
          ? 0.72
          : 1;
  let penalty = 0;
  if (preflightOk === false) {
    penalty += 0.34;
  }
  if (structureGap) {
    penalty += 0.26;
  }
  if (routeDegraded) {
    penalty += 0.1;
  }
  if (fallbackUsed) {
    penalty += 0.08;
  }
  penalty += Math.min(0.1, preflightWarnings.length * 0.025);
  penalty += Math.min(0.08, adapterWarnings.length * 0.018);
  const routeQualityScore = clamp01(
    1 -
      (routeDegraded ? 0.45 : 0) -
      (fallbackUsed ? 0.18 : 0) -
      (preflightWarnings.length > 0 ? 0.08 : 0) -
      (adapterWarnings.length > 0 ? 0.06 : 0)
  );

  return {
    ...(workflowStage ? { workflowStage } : {}),
    ...(selectedMode ? { selectedMode } : {}),
    stageRequiresStrongStructure,
    structureControlApplied,
    requiredStructureKinds,
    appliedStructureKinds,
    missingStructureKinds,
    ...(preflightOk !== undefined ? { preflightOk } : {}),
    preflightWarnings,
    adapterWarnings,
    fallbackUsed,
    routeDegraded,
    warningReasons: dedupeStrings(warningReasons),
    rejectionReasons: dedupeStrings(rejectionReasons),
    qualityScore: clamp01(1 - penalty),
    penalty: Number(penalty.toFixed(4)),
    structureCoverageScore: Number(structureCoverageScore.toFixed(4)),
    routeQualityScore: Number(routeQualityScore.toFixed(4))
  };
}

function classifyRuntimeDiagnosticsBucket(
  diagnostics: CandidateRuntimeQualityDiagnostics
): CandidateRuntimeBucketSummary {
  const blockTokens = dedupeStrings([
    diagnostics.rejectionReasons.includes("runtime_preflight_failed") ? "pf" : "",
    diagnostics.rejectionReasons.includes("runtime_structure_missing") ? "st" : ""
  ].filter((token) => token.length > 0));
  const degradedTokens = dedupeStrings([
    diagnostics.warningReasons.includes("runtime_structure_soft") ||
    (diagnostics.stageRequiresStrongStructure &&
      diagnostics.structureCoverageScore < 0.999 &&
      diagnostics.missingStructureKinds.length === 0)
      ? "ss"
      : "",
    diagnostics.routeDegraded ? "rt" : "",
    diagnostics.fallbackUsed ? "fb" : ""
  ].filter((token) => token.length > 0));
  const warnTokens = dedupeStrings([
    diagnostics.preflightWarnings.length > 0 ? "pw" : "",
    diagnostics.adapterWarnings.length > 0 ? "aw" : ""
  ].filter((token) => token.length > 0));
  const tokens = [...blockTokens, ...degradedTokens, ...warnTokens];
  const level: CandidateRuntimeBucketLevel =
    blockTokens.length > 0
      ? "block"
      : degradedTokens.length >= 2 || (degradedTokens.length >= 1 && warnTokens.length >= 1)
        ? "compound"
        : degradedTokens.length >= 1
          ? "degraded"
          : warnTokens.length >= 1
            ? "warn"
            : "clean";

  return {
    level,
    tokens,
    diagnostics,
    summary: tokens.length > 0 ? `${level}:${tokens.join("+")}` : level
  };
}

export function classifyCandidateRuntimeBucket(input: {
  candidate: ScoredCandidate;
  targetStyle?: string;
}): CandidateRuntimeBucketSummary {
  return classifyRuntimeDiagnosticsBucket(
    extractCandidateRuntimeQualityDiagnostics({
      candidate: input.candidate.candidate,
      targetStyle: input.targetStyle
    })
  );
}

export function isRuntimeBucketLowQuality(input: {
  candidate: ScoredCandidate;
  targetStyle?: string;
  acceptedScoreThreshold: number;
}): boolean {
  if (!isMascotTargetStyle(input.targetStyle)) {
    return false;
  }

  const runtimeBucket = classifyCandidateRuntimeBucket({
    candidate: input.candidate,
    targetStyle: input.targetStyle
  });
  if (runtimeBucket.level === "block" || runtimeBucket.level === "compound") {
    return true;
  }
  if (runtimeBucket.level !== "degraded") {
    return false;
  }

  const view = input.candidate.candidate.view;
  const stage = runtimeBucket.diagnostics.workflowStage;
  if (view === "front") {
    return true;
  }
  if (stage === "repair_refine" || stage === "identity_lock_refine") {
    return true;
  }
  if (input.candidate.score < input.acceptedScoreThreshold + 0.03) {
    return true;
  }
  if (
    typeof input.candidate.consistencyScore === "number" &&
    input.candidate.consistencyScore < (view === "profile" ? 0.52 : 0.56)
  ) {
    return true;
  }
  return false;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withAsyncOperationTimeout<T>(
  label: string,
  timeoutMs: number,
  run: () => Promise<T>
): Promise<T> {
  const boundedTimeoutMs = Math.max(1_000, timeoutMs);
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${boundedTimeoutMs}ms`));
        }, boundedTimeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function strengthenNegativePrompt(base: string, boost: boolean, round: number): string {
  const defaultGuardrails = [
    "text",
    "watermark",
    "logo",
    "signature",
    "extra fingers",
    "deformed hands",
    "blurry face",
    "cropped head",
    "busy background"
  ];

  const existing = base
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const merged = new Set(existing);

  if (boost) {
    for (const token of defaultGuardrails) {
      merged.add(token);
    }
  }

  if (round > 0) {
    merged.add("low quality");
    merged.add("jpeg artifacts");
  }
  if (round > 1) {
    merged.add("multiple characters");
    merged.add("background text");
  }

  return [...merged].join(", ");
}

type RetryAdjustment = {
  extraNegativeTokens: string[];
  viewPromptHints: string[];
  disablePose: boolean;
  enforceSideTurnBalance: boolean;
  referenceWeightDeltas: Partial<Record<CharacterReferenceBankEntry["role"], number>>;
  notes: string[];
};

type RepairDirectiveProfile = {
  families: RepairDirectiveFamily[];
  severity: RepairDirectiveSeverity;
  candidateCountBoost: number;
  acceptedScoreThresholdBoost: number;
  adjustment: RetryAdjustment;
  notes: string[];
};

function hasRetryAdjustmentContent(adjustment: RetryAdjustment | undefined): boolean {
  if (!adjustment) {
    return false;
  }
  return (
    adjustment.extraNegativeTokens.length > 0 ||
    adjustment.viewPromptHints.length > 0 ||
    adjustment.disablePose ||
    adjustment.enforceSideTurnBalance ||
    adjustment.notes.length > 0 ||
    Object.keys(adjustment.referenceWeightDeltas).length > 0
  );
}

function mergeRetryAdjustments(
  ...adjustments: Array<RetryAdjustment | undefined>
): RetryAdjustment | undefined {
  const extraNegativeTokens = new Set<string>();
  const viewPromptHints = new Set<string>();
  const referenceWeightDeltas: Partial<Record<CharacterReferenceBankEntry["role"], number>> = {};
  const notes = new Set<string>();
  let disablePose = false;
  let enforceSideTurnBalance = false;

  for (const adjustment of adjustments) {
    if (!adjustment) {
      continue;
    }
    for (const token of adjustment.extraNegativeTokens) {
      extraNegativeTokens.add(token);
    }
    for (const hint of adjustment.viewPromptHints) {
      viewPromptHints.add(hint);
    }
    for (const [role, delta] of Object.entries(adjustment.referenceWeightDeltas) as Array<
      [CharacterReferenceBankEntry["role"], number]
    >) {
      referenceWeightDeltas[role] = Number(((referenceWeightDeltas[role] ?? 0) + delta).toFixed(3));
    }
    for (const note of adjustment.notes) {
      notes.add(note);
    }
    disablePose = disablePose || adjustment.disablePose;
    enforceSideTurnBalance = enforceSideTurnBalance || adjustment.enforceSideTurnBalance;
  }

  const merged: RetryAdjustment = {
    extraNegativeTokens: [...extraNegativeTokens],
    viewPromptHints: [...viewPromptHints],
    disablePose,
    enforceSideTurnBalance,
    referenceWeightDeltas,
    notes: [...notes]
  };

  return hasRetryAdjustmentContent(merged) ? merged : undefined;
}

function summarizeRepairDirectiveProfile(
  profile: RepairDirectiveProfile | undefined
): RepairDirectiveProfileSummary | undefined {
  if (!profile) {
    return undefined;
  }
  return {
    families: profile.families,
    severity: profile.severity,
    candidateCountBoost: profile.candidateCountBoost,
    acceptedScoreThresholdBoost: profile.acceptedScoreThresholdBoost,
    disablePose: profile.adjustment.disablePose,
    notes: profile.notes
  };
}

function appendPromptHints(base: string, hints: string[]): string {
  const trimmed = base.trim();
  const extra = hints.map((hint) => hint.trim()).filter((hint) => hint.length > 0);
  if (extra.length === 0) {
    return trimmed;
  }
  if (trimmed.length === 0) {
    return extra.join(", ");
  }
  return `${trimmed}, ${extra.join(", ")}`;
}

function adjustReferenceBankWeights(
  entries: CharacterReferenceBankEntry[] | undefined,
  deltas: Partial<Record<CharacterReferenceBankEntry["role"], number>>
): CharacterReferenceBankEntry[] | undefined {
  if (!Array.isArray(entries) || entries.length === 0) {
    return entries;
  }
  if (Object.keys(deltas).length === 0) {
    return entries;
  }

  return entries.map((entry) => {
    const delta = deltas[entry.role];
    if (typeof delta !== "number" || delta === 0) {
      return entry;
    }
    const nextWeight = clamp01((typeof entry.weight === "number" ? entry.weight : 0.58) + delta);
    return {
      ...entry,
      weight: Number(nextWeight.toFixed(3))
    };
  });
}

export function rebalanceReferenceBankForRetry(input: {
  entries: CharacterReferenceBankEntry[] | undefined;
  stage: GenerationStageKey;
  view: CharacterView;
  adjustment: RetryAdjustment | undefined;
}): CharacterReferenceBankEntry[] | undefined {
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    return input.entries;
  }
  if (!input.adjustment?.enforceSideTurnBalance || input.view === "front") {
    return input.entries;
  }

  const frontMasterMinimum = resolveStageInputMinimumReferenceWeights(input.stage, input.view).front_master ?? 0;
  const baseFrontMasterCap =
    input.stage === "lock"
      ? input.view === "profile"
        ? 0.56
        : 0.58
      : input.stage === "refine"
        ? input.view === "profile"
          ? 0.58
          : 0.6
        : input.view === "profile"
        ? 0.58
        : 0.6;
  const frontMasterCap =
    input.stage === "lock"
      ? Math.max(baseFrontMasterCap, Number((frontMasterMinimum + 0.04).toFixed(3)))
      : input.stage === "refine"
        ? Math.max(baseFrontMasterCap, Number((frontMasterMinimum + 0.04).toFixed(3)))
        : baseFrontMasterCap;
  const subjectCap =
    input.stage === "lock"
      ? input.view === "profile"
        ? 0.5
        : 0.52
      : input.stage === "refine"
        ? input.view === "profile"
          ? 0.54
          : 0.56
        : input.view === "profile"
          ? 0.54
          : 0.56;
  const heroCap =
    input.stage === "lock"
      ? input.view === "profile"
        ? 0.4
        : 0.42
      : input.stage === "refine"
        ? input.view === "profile"
          ? 0.38
          : 0.4
        : input.view === "profile"
          ? 0.34
          : 0.36;
  const compositionFloor =
    input.stage === "lock"
      ? input.view === "profile"
        ? 0.82
        : 0.8
      : input.stage === "refine"
        ? input.view === "profile"
          ? 0.8
          : 0.78
      : input.view === "profile"
        ? 0.84
        : 0.82;
  const viewStarterFloor =
    input.view === "profile"
      ? input.stage === "lock"
        ? 0.58
        : input.stage === "refine"
          ? 0.6
          : 0.62
      : input.stage === "lock"
        ? 0.62
        : input.stage === "refine"
          ? 0.64
          : 0.66;
  const styleCap = input.stage === "lock" ? 0.12 : input.stage === "refine" ? 0.14 : 0.16;

  return input.entries.map((entry) => {
    let weight = typeof entry.weight === "number" ? entry.weight : 0.58;
    if (entry.role === "front_master") {
      weight = Math.min(weight, frontMasterCap);
    } else if (entry.role === "subject") {
      weight = Math.min(weight, subjectCap);
    } else if (entry.role === "hero") {
      weight = Math.min(weight, heroCap);
    } else if (entry.role === "composition") {
      weight = Math.max(weight, compositionFloor);
    } else if (entry.role === "style") {
      weight = Math.min(weight, styleCap);
    } else if (entry.role === "view_starter") {
      weight = Math.max(weight, viewStarterFloor);
    }
    return {
      ...entry,
      weight: Number(clamp01(weight).toFixed(3))
    };
  });
}

function pickReferenceImageFromBankRole(
  entries: CharacterReferenceBankEntry[] | undefined,
  role: CharacterReferenceBankEntry["role"]
): InlineImageReference | undefined {
  if (!Array.isArray(entries) || entries.length === 0) {
    return undefined;
  }
  const match = entries.find(
    (entry) =>
      entry.role === role &&
      typeof entry.imageBase64 === "string" &&
      entry.imageBase64.length > 0
  );
  if (!match?.imageBase64) {
    return undefined;
  }
  return {
    referenceImageBase64: match.imageBase64,
    referenceMimeType: match.mimeType ?? "image/png"
  };
}

export function deriveRetryAdjustmentForCandidate(input: {
  stage: GenerationStageKey;
  view: CharacterView;
  candidate: ScoredCandidate | undefined;
  speciesId?: string;
}): RetryAdjustment {
  const candidate = input.candidate;
  const defect = classifyRepairDefectFamilies(candidate);
  const reasons = defect.reasons;
  const extraNegativeTokens = new Set<string>();
  const viewPromptHints = new Set<string>();
  const referenceWeightDeltas: Partial<Record<CharacterReferenceBankEntry["role"], number>> = {};
  const notes: string[] = [];
  let disablePose = false;
  let enforceSideTurnBalance = false;
  const rig = summarizeCandidateRigStability({
    candidate,
    speciesId: input.speciesId
  });

  const addDelta = (role: CharacterReferenceBankEntry["role"], amount: number) => {
    referenceWeightDeltas[role] = Number(((referenceWeightDeltas[role] ?? 0) + amount).toFixed(3));
  };

  const addViewPromptHint = (frontHint: string, threeQuarterHint: string, profileHint: string) => {
    viewPromptHints.add(
      input.view === "front" ? frontHint : input.view === "threeQuarter" ? threeQuarterHint : profileHint
    );
  };

  if (rig.safeFrontExpression) {
    extraNegativeTokens.add("open mouth grin");
    extraNegativeTokens.add("off-center smile");
    extraNegativeTokens.add("asymmetric mouth");
    viewPromptHints.add("front expression must stay neutral and centered, with a small closed mouth and stable muzzle placement");
    addDelta("front_master", 0.06);
    addDelta("subject", 0.04);
    notes.push("safer front expression fallback");
  }

  if (rig.lockMouthPreset) {
    extraNegativeTokens.add("wide open mouth");
    extraNegativeTokens.add("teeth grin");
    viewPromptHints.add("lock the mouth to a neutral closed preset, compact lip line, and stable centered muzzle");
    addDelta("front_master", 0.04);
    notes.push("mouth preset lock fallback");
  }

  if (rig.suppressAggressiveYaw) {
    extraNegativeTokens.add("extreme turn");
    extraNegativeTokens.add("dramatic yaw");
    extraNegativeTokens.add("camera-facing cheat");
    viewPromptHints.add(
      input.view === "threeQuarter"
        ? "hold a moderate three-quarter turn, readable near/far eye balance, and avoid aggressive torso yaw"
        : "hold a calm true profile turn, no over-rotated torso, and keep the head/body turn simple and stable"
    );
    addDelta("composition", 0.05);
    addDelta("view_starter", 0.05);
    addDelta("front_master", -0.04);
    enforceSideTurnBalance = input.view !== "front" || enforceSideTurnBalance;
    notes.push("suppressed aggressive yaw fallback");
  }

  if (defect.identity || defect.consistency) {
    extraNegativeTokens.add("identity drift");
    extraNegativeTokens.add("different character");
    extraNegativeTokens.add("wrong head silhouette");
    addViewPromptHint(
      "match the approved front identity, preserve head ratio, preserve mascot silhouette",
      "match the approved front identity, preserve head ratio, preserve mascot silhouette, keep a strict turned three-quarter angle",
      "match the approved front identity, preserve head ratio, preserve mascot silhouette, keep a strict true profile angle"
    );
    if (input.view === "front") {
      addDelta("front_master", 0.08);
      addDelta("subject", 0.06);
      addDelta("composition", -0.05);
      notes.push("boosted front identity anchor");
    } else {
      addDelta("front_master", 0.02);
      addDelta("subject", 0.02);
      addDelta("view_starter", 0.08);
      addDelta("composition", 0.03);
      notes.push("boosted side identity anchor");
    }
  }

  if (defect.paws) {
    extraNegativeTokens.add("human fingers");
    extraNegativeTokens.add("sharp claws");
    extraNegativeTokens.add("separated fingers");
    extraNegativeTokens.add("missing arm");
    extraNegativeTokens.add("missing paw");
    extraNegativeTokens.add("detached limb");
    addViewPromptHint(
      "rounded mitten-like paws, both short arms visible and attached, no individual fingers, clean paw silhouette",
      "rounded mitten-like paws, clear three-quarter body turn, near paw dominant, far paw still present, no missing arm",
      "strict side silhouette with one readable near paw, no detached limb fragments, no missing arm stump"
    );
    addDelta("view_starter", 0.08);
    addDelta("starter", 0.08);
    if (!stageRequiresPoseGuide(input.stage)) {
      disablePose = true;
      notes.push("disabled pose guide for paw recovery");
    }
    if (input.view === "front" && input.speciesId === "dog") {
      extraNegativeTokens.add("arms fused into torso");
      extraNegativeTokens.add("hidden paw");
      viewPromptHints.add(
        "both short dog arms must sit outside the torso silhouette, one on each side, with two readable mitten paws and a clear gap from the body"
      );
      notes.push("reinforced dog front paw separation");
    } else if (input.view === "front" && input.speciesId === "wolf") {
      extraNegativeTokens.add("hidden paw");
      viewPromptHints.add(
        "both short wolf arms must stay attached and readable at the body sides with compact mitten paws, no detached limb stubs"
      );
      notes.push("reinforced wolf front paw visibility");
    }
  }

  if (defect.face) {
    extraNegativeTokens.add("uneven eyes");
    extraNegativeTokens.add("crooked face");
    if (input.view === "front") {
      extraNegativeTokens.add("asymmetrical face");
      viewPromptHints.add("symmetrical face, stable eyes, centered facial features");
    } else if (input.view === "threeQuarter") {
      extraNegativeTokens.add("front view");
      extraNegativeTokens.add("straight-on face");
      extraNegativeTokens.add("perfect bilateral symmetry");
      extraNegativeTokens.add("near-front cheat");
      extraNegativeTokens.add("front collapse");
      enforceSideTurnBalance = true;
      viewPromptHints.add(
        "strict three-quarter face, near eye slightly larger than far eye, muzzle rotated off center, keep asymmetry and do not drift back to front symmetry"
      );
      addDelta("composition", 0.08);
      addDelta("front_master", -0.05);
    } else {
      extraNegativeTokens.add("front view");
      extraNegativeTokens.add("two visible eyes");
      extraNegativeTokens.add("frontal muzzle");
      extraNegativeTokens.add("near-front cheat");
      extraNegativeTokens.add("front collapse");
      enforceSideTurnBalance = true;
      viewPromptHints.add(
        "strict side face, one visible eye only, nose and mouth placed on the outer contour, avoid any front-facing symmetry"
      );
      addDelta("composition", 0.08);
      addDelta("front_master", -0.06);
    }
    addDelta("style", 0.04);
    notes.push(input.view === "front" ? "reinforced facial symmetry" : "reinforced facial turn readability");
    if (input.view !== "front") {
      notes.push("reinforced side-view turn");
    } else if (input.speciesId === "dog") {
      extraNegativeTokens.add("tiny face");
      extraNegativeTokens.add("face too low");
      viewPromptHints.add(
        "dog face should occupy the upper middle of the head, with eyes above the muzzle, a centered button nose, and a readable mouth"
      );
      notes.push("reinforced dog front face placement");
    } else if (input.speciesId === "wolf") {
      extraNegativeTokens.add("tiny face");
      extraNegativeTokens.add("fox sly face");
      viewPromptHints.add(
        "wolf face should stay broad and upright in the upper head, with taller ears, a centered wedge muzzle, and no narrow fox grin"
      );
      notes.push("reinforced wolf front face placement");
    }
  }

  if (
    input.view === "threeQuarter" &&
    (reasons.has("threequarter_front_collapse") || reasons.has("inconsistent_with_front_baseline"))
  ) {
    extraNegativeTokens.add("front torso");
    extraNegativeTokens.add("square shoulders");
    extraNegativeTokens.add("flat front chest");
    extraNegativeTokens.add("straight-on body");
    viewPromptHints.add(
      "torso and hips must rotate with the head, near shoulder and near hip forward, far shoulder and far hip pulled back, chest opening angled away from camera, near body contour visibly wider than the far side"
    );
    addDelta("composition", 0.17);
    addDelta("view_starter", 0.12);
    addDelta(
      "front_master",
      input.stage === "angles" ? -0.18 : input.stage === "refine" ? -0.08 : 0.02
    );
    addDelta("subject", -0.1);
    addDelta("hero", -0.08);
    enforceSideTurnBalance = true;
    notes.push("reinforced three-quarter torso yaw");
  }

  if (
    input.view === "threeQuarter" &&
    normalizeGenerationSpecies(input.speciesId) === "cat" &&
    (reasons.has("threequarter_front_collapse") ||
      reasons.has("inconsistent_with_front_baseline") ||
      reasons.has("consistency_shape_drift"))
  ) {
    extraNegativeTokens.add("front-facing cat chest");
    extraNegativeTokens.add("level frontal cat ears");
    extraNegativeTokens.add("centered cat muzzle");
    extraNegativeTokens.add("flat cat cheek silhouette");
    extraNegativeTokens.add("same-size cat ears");
    extraNegativeTokens.add("same-size cat eyes");
    viewPromptHints.add(
      "strict cat three-quarter turn around 35 to 45 degrees, near ear visibly larger than the far ear, far ear still peeking behind the head, near eye slightly larger than the far eye, short cat muzzle rotated off center with slight forward projection, near cheek broader than the far cheek, and torso and hips following the same turn as the head"
    );
    addDelta("composition", 0.08);
    addDelta("view_starter", 0.12);
    addDelta("style", 0.04);
    addDelta("subject", 0.14);
    addDelta(
      "front_master",
      input.stage === "angles" ? -0.08 : input.stage === "refine" ? 0.04 : 0.08
    );
    addDelta("hero", 0.12);
    enforceSideTurnBalance = true;
    notes.push("reinforced cat three-quarter yaw silhouette");
  }

  if (defect.head || reasons.has("head_shape_not_square_enough")) {
    extraNegativeTokens.add("small head");
    extraNegativeTokens.add("narrow head");
    viewPromptHints.add("large compact mascot head, simple square-rounded head shape, compact body proportion");
    addDelta("style", 0.03);
    addDelta("composition", 0.03);
    notes.push("reinforced mascot head proportion");
  }

  if (defect.style) {
    extraNegativeTokens.add("rendered shading");
    extraNegativeTokens.add("palette drift");
    extraNegativeTokens.add("style mismatch");
    viewPromptHints.add("match the approved monochrome line weight, flat sticker-like shading, and simple mascot palette");
    addDelta("style", 0.08);
    addDelta("front_master", 0.03);
    addDelta("composition", -0.02);
    notes.push("reinforced style lock");
  }

  const speciesBreakdown = [...reasons].some((reason) => reason.includes("species_breakdown"));
  if (speciesBreakdown || defect.identity || defect.ears || defect.muzzle) {
    extraNegativeTokens.add("wrong animal silhouette");
    extraNegativeTokens.add("species drift");
    if (input.speciesId === "wolf") {
      extraNegativeTokens.add("fox face");
      extraNegativeTokens.add("fox muzzle");
      extraNegativeTokens.add("fox ears");
    }
    const speciesHint =
      input.speciesId === "dog"
        ? input.view === "front"
          ? "preserve dog muzzle and rounded dog ear silhouette, keep both short front arms visible, keep the dog cute and domestic, keep the face large enough to read, and keep each paw outside the torso edge"
          : "preserve dog muzzle and rounded dog ear silhouette, keep the body clearly turned, no fox face and no front-facing symmetry"
        : input.speciesId === "wolf"
          ? input.view === "front"
            ? "preserve wolf muzzle length and wolf ear silhouette, wolf first not fox, keep the head broad and upright, keep the face high and readable, and keep both short arms attached"
            : "preserve wolf muzzle length and wolf ear silhouette, wolf first not fox, keep a turned wolf wedge muzzle and no front-facing symmetry"
        : input.view === "threeQuarter"
          ? "preserve cat ear silhouette and short feline muzzle, keep the near ear larger than the far ear, keep both ears attached, keep the near cheek broader than the far cheek, and avoid a front-facing cat chest or centered muzzle"
          : input.view === "profile"
            ? "preserve cat ear silhouette and short feline muzzle, keep a clear side-turn contour, one dominant near eye, and no front-facing cat chest"
            : "preserve cat ear silhouette and short feline muzzle";
    viewPromptHints.add(speciesHint);
    addDelta("front_master", 0.06);
    addDelta("style", 0.04);
    notes.push("reinforced species identity");
  }

  if (defect.silhouette) {
    extraNegativeTokens.add("multiple subjects");
    extraNegativeTokens.add("duplicate limbs");
    extraNegativeTokens.add("floating props");
    viewPromptHints.add("single centered mascot subject, isolated silhouette, no duplicate limbs");
    addDelta("composition", 0.04);
    notes.push("reinforced single-subject composition");
  }

  if (
    input.view === "front" &&
    normalizeGenerationSpecies(input.speciesId) === "cat" &&
    (reasons.has("fragmented_or_multi_object_front") ||
      reasons.has("subject_isolation_low") ||
      reasons.has("cat_ear_silhouette_too_flat") ||
      reasons.has("face_or_eyes_region_unstable"))
  ) {
    extraNegativeTokens.add("detached ear fragment");
    extraNegativeTokens.add("detached whisker fragment");
    extraNegativeTokens.add("split silhouette");
    extraNegativeTokens.add("multiple foreground fragments");
    extraNegativeTokens.add("low face placement");
    viewPromptHints.add(
      "single centered full-body cat mascot, one connected silhouette, face placed high and centered in the upper head, both pointed ears cleanly attached, minimal muzzle, and no detached whisker or ear fragments"
    );
    addDelta("front_master", 0.08);
    addDelta("subject", 0.06);
    addDelta("composition", 0.06);
    notes.push("reinforced cat front anchor and silhouette");
  }

  if (candidate?.consistencyScore !== null && typeof candidate?.consistencyScore === "number" && candidate.consistencyScore < 0.34) {
    addDelta("front_master", 0.04);
    addDelta("repair_base", 0.04);
  }

  return {
    extraNegativeTokens: [...extraNegativeTokens],
    viewPromptHints: [...viewPromptHints],
    disablePose,
    enforceSideTurnBalance,
    referenceWeightDeltas,
    notes
  };
}

function buildRepairDirectiveProfile(input: {
  stage: GenerationStageKey;
  view: CharacterView;
  candidate: ScoredCandidate | undefined;
  speciesId?: string;
}): RepairDirectiveProfile | undefined {
  const candidate = input.candidate;
  if (!candidate) {
    return undefined;
  }

  const adjustment = deriveRetryAdjustmentForCandidate(input);
  const defect = classifyRepairDefectFamilies(candidate);
  const reasons = defect.reasons;
  const rig = summarizeCandidateRigStability({
    candidate,
    speciesId: input.speciesId
  });
  const families = new Set<RepairDirectiveFamily>();
  const notes = new Set<string>(adjustment.notes);
  const sideCollapse =
    input.view !== "front" &&
    (reasons.has("threequarter_front_collapse") ||
      reasons.has("inconsistent_with_front_baseline") ||
      reasons.has("consistency_shape_drift"));

  if ((defect.identity || defect.consistency) && !sideCollapse) {
    families.add("identity_lock");
    notes.add("identity lock rescue");
  }

  if (defect.face) {
    families.add("face_symmetry");
    notes.add("face symmetry rescue");
  }

  if (rig.safeFrontExpression) {
    families.add("face_symmetry");
    notes.add("rig-safe front expression");
  }

  if (defect.ears || defect.muzzle || [...reasons].some((reason) => reason.includes("species_breakdown"))) {
    families.add("species_silhouette");
    notes.add("species silhouette rescue");
  }

  if (defect.paws) {
    families.add("paw_cleanup");
    notes.add("paw cleanup rescue");
  }

  if (input.view === "threeQuarter" && reasons.has("threequarter_front_collapse")) {
    families.add("body_silhouette");
    notes.add("three-quarter yaw rescue");
  }

  if (rig.suppressAggressiveYaw && input.view !== "front") {
    families.add("body_silhouette");
    notes.add("rig yaw suppression");
  }

  if (defect.silhouette) {
    families.add("body_silhouette");
    notes.add("body silhouette rescue");
  }

  if (defect.style) {
    families.add("style_cleanup");
    notes.add("style cleanup rescue");
  }

  if (families.size === 0 && !hasRetryAdjustmentContent(adjustment)) {
    return undefined;
  }

  let candidateCountBoost = 0;
  let acceptedScoreThresholdBoost = 0;
  if (families.has("species_silhouette") || families.has("body_silhouette")) {
    candidateCountBoost = Math.max(candidateCountBoost, 1);
    acceptedScoreThresholdBoost = Math.max(acceptedScoreThresholdBoost, 0.02);
  }
  if (families.has("face_symmetry") && input.view === "front") {
    candidateCountBoost = Math.max(candidateCountBoost, 1);
  }
  if (families.has("paw_cleanup") || families.has("style_cleanup")) {
    acceptedScoreThresholdBoost = Math.max(acceptedScoreThresholdBoost, 0.01);
  }
  if (
    candidate.rejections.length > 0 ||
    families.size >= 3 ||
    (input.view === "front" && (families.has("species_silhouette") || families.has("identity_lock")))
  ) {
    candidateCountBoost = Math.max(candidateCountBoost, families.size >= 3 ? 2 : 1);
    acceptedScoreThresholdBoost = Math.max(acceptedScoreThresholdBoost, 0.03);
  }

  const severity: RepairDirectiveSeverity =
    candidate.rejections.length > 0 || candidateCountBoost >= 2 || families.size >= 3
      ? "high"
      : families.size >= 2 || candidate.warnings.length >= 2
        ? "medium"
        : "low";

  return {
    families: [...families],
    severity,
    candidateCountBoost,
    acceptedScoreThresholdBoost: Number(acceptedScoreThresholdBoost.toFixed(3)),
    adjustment,
    notes: [...notes]
  };
}

export function shouldRunSideRefineForCandidate(input: {
  candidate: ScoredCandidate | undefined;
  view: CharacterView;
  acceptedScoreThreshold: number;
}): boolean {
  const candidate = input.candidate;
  if (!candidate || input.view === "front") {
    return false;
  }
  if (isUnrecoverableRepairCandidate(candidate)) {
    return false;
  }

  const defect = classifyRepairDefectFamilies(candidate);
  const consistencyFloor = input.view === "profile" ? 0.5 : 0.55;
  const consistencyNeedsHelp =
    typeof candidate.consistencyScore === "number" && candidate.consistencyScore < consistencyFloor;
  const recoverableRejectionsPresent = candidate.rejections.length > 0;
  const nearThreshold = candidate.score < input.acceptedScoreThreshold + 0.05;
  const softDefect =
    recoverableRejectionsPresent ||
    consistencyNeedsHelp ||
    defect.consistency ||
    defect.style ||
    defect.face ||
    defect.paws ||
    defect.body ||
    candidate.warnings.length > 0;
  const minimumRefineScore = Math.max(input.acceptedScoreThreshold - 0.14, 0.18);

  if (!softDefect) {
    return false;
  }

  return candidate.score >= minimumRefineScore && (nearThreshold || recoverableRejectionsPresent);
}

export function shouldRunIdentityLockForCandidate(input: {
  candidate: ScoredCandidate | undefined;
  view: CharacterView;
  acceptedScoreThreshold: number;
}): boolean {
  const candidate = input.candidate;
  if (!candidate || input.view === "front") {
    return false;
  }
  if (isUnrecoverableRepairCandidate(candidate)) {
    return false;
  }

  const defect = classifyRepairDefectFamilies(candidate);
  const consistencyFloor = input.view === "profile" ? 0.58 : 0.62;
  const consistencyWeak =
    typeof candidate.consistencyScore === "number" && candidate.consistencyScore < consistencyFloor;
  const recoverableRejectionsPresent = candidate.rejections.length > 0;
  const identityNeedsHelp =
    recoverableRejectionsPresent ||
    consistencyWeak ||
    defect.identity ||
    defect.consistency ||
    defect.head ||
    defect.face ||
    defect.ears ||
    defect.muzzle ||
    defect.style;
  const alreadyStable =
    candidate.score >= input.acceptedScoreThreshold + 0.08 &&
    candidate.rejections.length === 0 &&
    !consistencyWeak &&
    candidate.warnings.length === 0 &&
    !defect.identity &&
    !defect.style;
  const minimumLockScore = Math.max(input.acceptedScoreThreshold - 0.1, 0.22);

  if (!identityNeedsHelp || alreadyStable) {
    return false;
  }

  return candidate.score >= minimumLockScore;
}

function resolveEffectiveStageTriggerThreshold(
  acceptedScoreThreshold: number,
  boost?: number
): number {
  return Math.min(0.98, Math.max(0, acceptedScoreThreshold + (boost ?? 0)));
}

async function postprocessCandidateForProduction(input: {
  candidate: CharacterGenerationCandidate;
  qualityProfile: PromptQualityProfile;
}): Promise<CharacterGenerationCandidate> {
  const { candidate, qualityProfile } = input;
  if (
    candidate.provider !== "comfyui" ||
    candidate.mimeType.includes("svg") ||
    !Array.isArray(qualityProfile.postprocessPlan) ||
    qualityProfile.postprocessPlan.length === 0
  ) {
    return candidate;
  }

  const source = sharp(candidate.data, { limitInputPixels: false });
  const metadata = await source.metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return candidate;
  }

  const longSide = Math.max(sourceWidth, sourceHeight);
  const targetLongSide =
    typeof qualityProfile.upscaleLongSide === "number" && qualityProfile.upscaleLongSide > longSide
      ? Math.floor(qualityProfile.upscaleLongSide)
      : longSide;
  const scale = targetLongSide > longSide ? targetLongSide / longSide : 1;
  const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
  const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
  const sharpen = typeof qualityProfile.sharpen === "number" ? qualityProfile.sharpen : 0;
  const saturationBoost =
    typeof qualityProfile.saturationBoost === "number" && qualityProfile.saturationBoost > 0
      ? qualityProfile.saturationBoost
      : 1;

  let pipeline = sharp(candidate.data, { limitInputPixels: false }).ensureAlpha();
  if (scale > 1) {
    pipeline = pipeline.resize(outputWidth, outputHeight, {
      fit: "fill",
      kernel: sharp.kernel.lanczos3
    });
  }
  if (sharpen > 0) {
    pipeline = pipeline.sharpen(sharpen);
  }
  if (Math.abs(saturationBoost - 1) > 0.001) {
    pipeline = pipeline.modulate({ saturation: saturationBoost });
  }

  const buffer = await pipeline.png({ compressionLevel: 6 }).toBuffer();
  return {
    ...candidate,
    mimeType: "image/png",
    data: buffer,
    providerMeta: {
      ...(candidate.providerMeta ?? {}),
      postprocess: {
        applied: true,
        outputWidth,
        outputHeight,
        upscaleLongSide: targetLongSide,
        sharpen: sharpen > 0 ? sharpen : undefined,
        saturationBoost
      }
    }
  };
}

function materializeCandidateProviderArtifacts(input: {
  candidate: CharacterGenerationCandidate;
  candidatesDir: string;
  fileStem: string;
}): CharacterCandidateProviderMeta | undefined {
  const providerMeta = input.candidate.providerMeta;
  if (!providerMeta) {
    return undefined;
  }

  const workflowFiles = {
    ...(providerMeta.workflowFiles ?? {})
  };

  const writeArtifact = (suffix: string, payload: unknown): string | undefined => {
    if (!isRecord(payload)) {
      return undefined;
    }
    const artifactPath = path.join(input.candidatesDir, `${input.fileStem}_${suffix}.json`);
    fs.writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    return artifactPath;
  };

  const apiPromptPath = writeArtifact("workflow_api", providerMeta.workflowApi);
  const guiWorkflowPath = writeArtifact("workflow_gui", providerMeta.workflowGui);
  const summaryPath = writeArtifact("workflow_summary", providerMeta.workflowSummary);

  if (apiPromptPath) {
    workflowFiles.apiPromptPath = apiPromptPath;
  }
  if (guiWorkflowPath) {
    workflowFiles.guiWorkflowPath = guiWorkflowPath;
  }
  if (summaryPath) {
    workflowFiles.summaryPath = summaryPath;
  }

  return {
    ...providerMeta,
    workflowFiles
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function normalizeReferenceAssetStorageKey(asset: {
  normalizedKey1024: string | null;
  normalizedKey2048: string | null;
  originalKey: string | null;
  storageKey: string;
}): string {
  return asset.normalizedKey1024 ?? asset.normalizedKey2048 ?? asset.originalKey ?? asset.storageKey;
}

function hammingSimilarity(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length || hashA.length === 0) {
    return 0;
  }

  let same = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    if (hashA[i] === hashB[i]) {
      same += 1;
    }
  }

  return same / hashA.length;
}

function paletteSimilarity(a: Array<[number, number, number]>, b: Array<[number, number, number]>): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const size = Math.min(a.length, b.length);
  let total = 0;

  for (let i = 0; i < size; i += 1) {
    const colorA = a[i];
    const colorB = b[i];
    const distance = Math.sqrt(
      Math.pow(colorA[0] - colorB[0], 2) + Math.pow(colorA[1] - colorB[1], 2) + Math.pow(colorA[2] - colorB[2], 2)
    );
    total += 1 - distance / 441.6729559300637;
  }

  return clamp01(total / size);
}

async function computePHash(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== 9 || info.height !== 8) {
    return "";
  }

  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x];
      const right = data[y * 9 + x + 1];
      bits += left > right ? "1" : "0";
    }
  }

  return bits;
}

function estimateCornerBackground(input: {
  data: Buffer;
  width: number;
  height: number;
}): {
  r: number;
  g: number;
  b: number;
  flatness: number;
} {
  const { data, width, height } = input;
  const patchWidth = Math.max(6, Math.min(16, Math.floor(width * 0.1)));
  const patchHeight = Math.max(6, Math.min(16, Math.floor(height * 0.1)));
  const corners = [
    [0, 0],
    [Math.max(0, width - patchWidth), 0],
    [0, Math.max(0, height - patchHeight)],
    [Math.max(0, width - patchWidth), Math.max(0, height - patchHeight)]
  ] as const;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sampleCount = 0;

  for (const [startX, startY] of corners) {
    for (let y = startY; y < Math.min(height, startY + patchHeight); y += 1) {
      for (let x = startX; x < Math.min(width, startX + patchWidth); x += 1) {
        const idx = (y * width + x) * 4;
        sumR += data[idx];
        sumG += data[idx + 1];
        sumB += data[idx + 2];
        sampleCount += 1;
      }
    }
  }

  if (sampleCount === 0) {
    return {
      r: 255,
      g: 255,
      b: 255,
      flatness: 0
    };
  }

  const r = sumR / sampleCount;
  const g = sumG / sampleCount;
  const b = sumB / sampleCount;

  let flatnessAccum = 0;
  for (const [startX, startY] of corners) {
    for (let y = startY; y < Math.min(height, startY + patchHeight); y += 1) {
      for (let x = startX; x < Math.min(width, startX + patchWidth); x += 1) {
        const idx = (y * width + x) * 4;
        flatnessAccum +=
          (Math.abs(data[idx] - r) + Math.abs(data[idx + 1] - g) + Math.abs(data[idx + 2] - b)) / 3;
      }
    }
  }

  return {
    r,
    g,
    b,
    flatness: flatnessAccum / sampleCount
  };
}

type ComponentMetrics = {
  area: number;
  perimeter: number;
  centerX: number;
  centerY: number;
};

function extractLargestAlphaComponent(input: {
  alphaMask: Uint8Array;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}): ComponentMetrics | null {
  const { alphaMask, width, height } = input;
  const minX = Math.max(0, Math.min(width - 1, input.minX));
  const maxX = Math.max(minX, Math.min(width - 1, input.maxX));
  const minY = Math.max(0, Math.min(height - 1, input.minY));
  const maxY = Math.max(minY, Math.min(height - 1, input.maxY));
  const visited = new Uint8Array(width * height);
  let best: ComponentMetrics | null = null;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const startIndex = y * width + x;
      if (visited[startIndex] === 1 || alphaMask[startIndex] === 0) {
        continue;
      }

      const queue = [startIndex];
      visited[startIndex] = 1;
      let cursor = 0;
      let area = 0;
      let perimeter = 0;
      let centerXAccum = 0;
      let centerYAccum = 0;

      while (cursor < queue.length) {
        const index = queue[cursor];
        cursor += 1;
        const px = index % width;
        const py = Math.floor(index / width);
        area += 1;
        centerXAccum += px;
        centerYAccum += py;

        const neighbors = [
          [px - 1, py],
          [px + 1, py],
          [px, py - 1],
          [px, py + 1]
        ] as const;

        for (const [nx, ny] of neighbors) {
          if (nx < minX || nx > maxX || ny < minY || ny > maxY) {
            perimeter += 1;
            continue;
          }
          const neighborIndex = ny * width + nx;
          if (alphaMask[neighborIndex] === 0) {
            perimeter += 1;
            continue;
          }
          if (visited[neighborIndex] === 1) {
            continue;
          }
          visited[neighborIndex] = 1;
          queue.push(neighborIndex);
        }
      }

      const component: ComponentMetrics = {
        area,
        perimeter,
        centerX: area > 0 ? centerXAccum / area : (minX + maxX) / 2,
        centerY: area > 0 ? centerYAccum / area : (minY + maxY) / 2
      };

      if (!best || component.area > best.area) {
        best = component;
      }
    }
  }

  return best;
}

function summarizeAlphaComponents(input: {
  alphaMask: Uint8Array;
  width: number;
  height: number;
  minArea: number;
}): {
  largestArea: number;
  significantCount: number;
} {
  const { alphaMask, width, height, minArea } = input;
  const visited = new Uint8Array(width * height);
  let largestArea = 0;
  let significantCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = y * width + x;
      if (visited[startIndex] === 1 || alphaMask[startIndex] === 0) {
        continue;
      }

      const queue = [startIndex];
      visited[startIndex] = 1;
      let cursor = 0;
      let area = 0;

      while (cursor < queue.length) {
        const index = queue[cursor];
        cursor += 1;
        const px = index % width;
        const py = Math.floor(index / width);
        area += 1;

        const neighbors = [
          [px - 1, py],
          [px + 1, py],
          [px, py - 1],
          [px, py + 1]
        ] as const;

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            continue;
          }
          const neighborIndex = ny * width + nx;
          if (alphaMask[neighborIndex] === 0 || visited[neighborIndex] === 1) {
            continue;
          }
          visited[neighborIndex] = 1;
          queue.push(neighborIndex);
        }
      }

      if (area > largestArea) {
        largestArea = area;
      }
      if (area >= minArea) {
        significantCount += 1;
      }
    }
  }

  return {
    largestArea,
    significantCount
  };
}

function scorePawMetrics(input: {
  alphaMask: Uint8Array;
  width: number;
  height: number;
  handRegionEdgeDensity: number;
}): {
  pawRoundnessScore: number;
  pawSymmetryScore: number;
  fingerSpikeScore: number;
} {
  const { alphaMask, width, height, handRegionEdgeDensity } = input;
  const minY = Math.floor(height * 0.44);
  const maxY = Math.floor(height * 0.86);
  const left = extractLargestAlphaComponent({
    alphaMask,
    width,
    height,
    minX: Math.floor(width * 0.04),
    maxX: Math.floor(width * 0.36),
    minY,
    maxY
  });
  const right = extractLargestAlphaComponent({
    alphaMask,
    width,
    height,
    minX: Math.floor(width * 0.64),
    maxX: Math.floor(width * 0.96),
    minY,
    maxY
  });

  const componentRoundness = (component: ComponentMetrics | null): number => {
    if (!component || component.area <= 0 || component.perimeter <= 0) {
      return 0;
    }
    return clamp01((4 * Math.PI * component.area) / Math.max(1, component.perimeter * component.perimeter) / 0.45);
  };

  const leftRoundness = componentRoundness(left);
  const rightRoundness = componentRoundness(right);
  const pawRoundnessScore = clamp01((leftRoundness + rightRoundness) / 2);

  let pawSymmetryScore = 0.5;
  if (left && right) {
    const areaDiff = Math.abs(left.area - right.area) / Math.max(1, Math.max(left.area, right.area));
    const yDiff = Math.abs(left.centerY - right.centerY) / Math.max(1, height * 0.24);
    const perimeterDiff = Math.abs(left.perimeter - right.perimeter) / Math.max(1, Math.max(left.perimeter, right.perimeter));
    pawSymmetryScore = clamp01(1 - (areaDiff * 0.5 + yDiff * 0.25 + perimeterDiff * 0.25));
  } else if (left || right) {
    pawSymmetryScore = 0.2;
  }

  const fingerSpikeScore = clamp01(
    (1 - pawRoundnessScore) * 0.72 + clamp01((handRegionEdgeDensity - 0.18) / 0.36) * 0.28
  );

  return {
    pawRoundnessScore,
    pawSymmetryScore,
    fingerSpikeScore
  };
}

async function analyzeImage(buffer: Buffer): Promise<ImageAnalysis> {
  const metadata = await sharp(buffer).metadata();
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .resize(128, 128, { fit: "inside", withoutEnlargement: false })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const originalWidth = metadata.width ?? width;
  const originalHeight = metadata.height ?? height;
  const pixelCount = width * height;
  const background = estimateCornerBackground({ data, width, height });
  const backgroundLuma = 0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b;
  let opaquePixelCount = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) {
      opaquePixelCount += 1;
    }
  }
  const opaqueCoverage = pixelCount > 0 ? opaquePixelCount / pixelCount : 0;
  const useBackgroundDifferenceMask = opaqueCoverage > 0.96 && background.flatness < 14;

  let alphaPixels = 0;
  let minLuma = 255;
  let maxLuma = 0;
  let edgeCount = 0;
  let edgeTotal = 0;
  let upperAlphaPixels = 0;
  let upperPixels = 0;
  let chromaAccum = 0;
  let handRegionAlphaPixels = 0;
  let handRegionEdgeCount = 0;
  let handRegionEdgeSamples = 0;
  let bboxMinX = width;
  let bboxMinY = height;
  let bboxMaxX = -1;
  let bboxMaxY = -1;

  const lumaMap = new Float64Array(pixelCount);
  const alphaMask = new Uint8Array(pixelCount);
  let noiseAccum = 0;
  let noiseCount = 0;

  const paletteBucket = new Map<string, number>();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      const pixelIndex = y * width + x;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumaMap[pixelIndex] = luma;

      const backgroundDistance = (Math.abs(r - background.r) + Math.abs(g - background.g) + Math.abs(b - background.b)) / 3;
      const inferredForeground =
        a > 8 &&
        (!useBackgroundDifferenceMask || backgroundDistance > 18 || Math.abs(luma - backgroundLuma) > 14);

      if (inferredForeground) {
        alphaMask[pixelIndex] = 1;
        alphaPixels += 1;
        if (x < bboxMinX) {
          bboxMinX = x;
        }
        if (x > bboxMaxX) {
          bboxMaxX = x;
        }
        if (y < bboxMinY) {
          bboxMinY = y;
        }
        if (y > bboxMaxY) {
          bboxMaxY = y;
        }
        if (y < height * 0.45) {
          upperAlphaPixels += 1;
        }
        if (luma < minLuma) {
          minLuma = luma;
        }
        if (luma > maxLuma) {
          maxLuma = luma;
        }
        chromaAccum += (Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r)) / 3;

        const qr = Math.round(r / 32) * 32;
        const qg = Math.round(g / 32) * 32;
        const qb = Math.round(b / 32) * 32;
        const key = `${qr}:${qg}:${qb}`;
        paletteBucket.set(key, (paletteBucket.get(key) ?? 0) + 1);
      }

      const inHandRegion =
        y >= height * 0.44 &&
        y <= height * 0.86 &&
        ((x >= width * 0.04 && x <= width * 0.36) || (x >= width * 0.64 && x <= width * 0.96));
      if (inHandRegion && inferredForeground) {
        handRegionAlphaPixels += 1;
      }

      if (x > width * 0.65 && y > height * 0.65 && x < width - 1 && y < height - 1) {
        const idxRight = idx + 4;
        const idxDown = idx + width * 4;
        const dr = Math.abs(data[idx] - data[idxRight]);
        const dg = Math.abs(data[idx + 1] - data[idxRight + 1]);
        const db = Math.abs(data[idx + 2] - data[idxRight + 2]);
        const vr = Math.abs(data[idx] - data[idxDown]);
        const vg = Math.abs(data[idx + 1] - data[idxDown + 1]);
        const vb = Math.abs(data[idx + 2] - data[idxDown + 2]);
        const diff = (dr + dg + db + vr + vg + vb) / 6;
        if (diff > 26) {
          edgeCount += 1;
        }
        edgeTotal += 1;
      }

      if (inHandRegion && x < width - 1 && y < height - 1) {
        const rightIdx = idx + 4;
        const downIdx = idx + width * 4;
        const rightForeground =
          data[rightIdx + 3] > 8 &&
          (!useBackgroundDifferenceMask ||
            (Math.abs(data[rightIdx] - background.r) +
              Math.abs(data[rightIdx + 1] - background.g) +
              Math.abs(data[rightIdx + 2] - background.b)) /
              3 >
              18 ||
            Math.abs(
              0.2126 * data[rightIdx] + 0.7152 * data[rightIdx + 1] + 0.0722 * data[rightIdx + 2] - backgroundLuma
            ) > 14);
        const downForeground =
          data[downIdx + 3] > 8 &&
          (!useBackgroundDifferenceMask ||
            (Math.abs(data[downIdx] - background.r) +
              Math.abs(data[downIdx + 1] - background.g) +
              Math.abs(data[downIdx + 2] - background.b)) /
              3 >
              18 ||
            Math.abs(
              0.2126 * data[downIdx] + 0.7152 * data[downIdx + 1] + 0.0722 * data[downIdx + 2] - backgroundLuma
            ) > 14);
        if (inferredForeground !== rightForeground) {
          handRegionEdgeCount += 1;
        }
        if (inferredForeground !== downForeground) {
          handRegionEdgeCount += 1;
        }
        handRegionEdgeSamples += 2;
      }

      if (x < width - 1 && y < height - 1) {
        const idxRight = idx + 4;
        const idxDown = idx + width * 4;
        const lumaRight = 0.2126 * data[idxRight] + 0.7152 * data[idxRight + 1] + 0.0722 * data[idxRight + 2];
        const lumaDown = 0.2126 * data[idxDown] + 0.7152 * data[idxDown + 1] + 0.0722 * data[idxDown + 2];
        noiseAccum += Math.abs(luma - lumaRight) + Math.abs(luma - lumaDown);
        noiseCount += 2;
      }

      if (y < height * 0.45) {
        upperPixels += 1;
      }
    }
  }

  let symmetryDiffAccum = 0;
  let symmetrySamples = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < Math.floor(width / 2); x += 1) {
      const mirrorX = width - 1 - x;
      const leftIdx = (y * width + x) * 4;
      const rightIdx = (y * width + mirrorX) * 4;
      const leftAlpha = data[leftIdx + 3];
      const rightAlpha = data[rightIdx + 3];
      if (leftAlpha <= 8 && rightAlpha <= 8) {
        continue;
      }

      const leftLuma = 0.2126 * data[leftIdx] + 0.7152 * data[leftIdx + 1] + 0.0722 * data[leftIdx + 2];
      const rightLuma = 0.2126 * data[rightIdx] + 0.7152 * data[rightIdx + 1] + 0.0722 * data[rightIdx + 2];
      const alphaDiff = Math.abs(leftAlpha - rightAlpha) / 255;
      const lumaDiff = Math.abs(leftLuma - rightLuma) / 255;
      symmetryDiffAccum += alphaDiff * 0.7 + lumaDiff * 0.3;
      symmetrySamples += 1;
    }
  }

  const palette = [...paletteBucket.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => {
      const [r, g, b] = key.split(":").map((part) => Number.parseInt(part, 10));
      return [r, g, b] as [number, number, number];
    });

  let blurMean = 0;
  let blurSqMean = 0;
  let blurCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap =
        4 * lumaMap[i] -
        lumaMap[i - 1] -
        lumaMap[i + 1] -
        lumaMap[i - width] -
        lumaMap[i + width];
      blurMean += lap;
      blurSqMean += lap * lap;
      blurCount += 1;
    }
  }
  const blurAvg = blurCount > 0 ? blurMean / blurCount : 0;
  const blurVariance = blurCount > 0 ? Math.max(0, blurSqMean / blurCount - blurAvg * blurAvg) : 0;

  const bboxWidth = bboxMaxX >= bboxMinX ? bboxMaxX - bboxMinX + 1 : 0;
  const bboxHeight = bboxMaxY >= bboxMinY ? bboxMaxY - bboxMinY + 1 : 0;
  const bboxArea = bboxWidth * bboxHeight;
  const bboxOccupancy = pixelCount > 0 ? bboxArea / pixelCount : 0;
  const bboxCenterX = bboxWidth > 0 ? (bboxMinX + bboxWidth / 2) / width : 0.5;
  const bboxCenterY = bboxHeight > 0 ? (bboxMinY + bboxHeight / 2) / height : 0.5;
  const bboxScale = pixelCount > 0 ? Math.sqrt(Math.max(0, bboxArea / pixelCount)) : 0;
  const bboxAspectRatio = bboxHeight > 0 ? bboxWidth / bboxHeight : 1;
  let headBoxAspectRatio = 1;
  {
    let headMinX = width;
    let headMinY = height;
    let headMaxX = -1;
    let headMaxY = -1;
    const headMaxBandY = Math.max(1, Math.floor(height * 0.58));
    for (let y = 0; y < headMaxBandY; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        if (alphaMask[index] === 0) {
          continue;
        }
        if (x < headMinX) {
          headMinX = x;
        }
        if (x > headMaxX) {
          headMaxX = x;
        }
        if (y < headMinY) {
          headMinY = y;
        }
        if (y > headMaxY) {
          headMaxY = y;
        }
      }
    }
    if (headMaxX >= headMinX && headMaxY >= headMinY) {
      const headWidth = headMaxX - headMinX + 1;
      const headHeight = Math.max(1, headMaxY - headMinY + 1);
      headBoxAspectRatio = headWidth / headHeight;
    }
  }

  const alphaCoverage = pixelCount > 0 ? alphaPixels / pixelCount : 0;
  const contrast = maxLuma - minLuma;
  const edgeDensityBottomRight = edgeTotal > 0 ? edgeCount / edgeTotal : 0;
  const upperFaceCoverage = upperPixels > 0 ? upperAlphaPixels / upperPixels : 0;
  const upperAlphaRatio = alphaPixels > 0 ? upperAlphaPixels / alphaPixels : 0;
  const blurScore = blurVariance;
  const noiseScore = noiseCount > 0 ? noiseAccum / noiseCount : 0;
  const watermarkTextRisk = clamp01(edgeDensityBottomRight * 1.6 + Math.max(0, contrast - 55) / 220);
  const avgChroma = alphaPixels > 0 ? chromaAccum / alphaPixels : 0;
  const monochromeScore = clamp01(1 - avgChroma / 44);
  const paletteComplexity = clamp01(Math.max(0, paletteBucket.size - 2) / 18);
  const symmetryScore = symmetrySamples > 0 ? clamp01(1 - symmetryDiffAccum / symmetrySamples) : 0.5;
  const handRegionEdgeDensity =
    handRegionAlphaPixels > 0
      ? clamp01((handRegionEdgeCount / Math.max(1, handRegionEdgeSamples)) * 2.2)
      : 0;
  const pawMetrics = scorePawMetrics({
    alphaMask,
    width,
    height,
    handRegionEdgeDensity
  });
  const componentSummary = summarizeAlphaComponents({
    alphaMask,
    width,
    height,
    minArea: Math.max(28, Math.round(pixelCount * 0.002))
  });
  const phash = await computePHash(buffer);

  return {
    originalWidth,
    originalHeight,
    width,
    height,
    alphaCoverage,
    bboxOccupancy,
    bboxCenterX,
    bboxCenterY,
    bboxScale,
    bboxAspectRatio,
    contrast,
    blurScore,
    noiseScore,
    watermarkTextRisk,
    edgeDensityBottomRight,
    upperFaceCoverage,
    upperAlphaRatio,
    headBoxAspectRatio,
    monochromeScore,
    paletteComplexity,
    symmetryScore,
    handRegionEdgeDensity,
    pawRoundnessScore: pawMetrics.pawRoundnessScore,
    pawSymmetryScore: pawMetrics.pawSymmetryScore,
    fingerSpikeScore: pawMetrics.fingerSpikeScore,
    largestComponentShare: alphaPixels > 0 ? componentSummary.largestArea / alphaPixels : 0,
    significantComponentCount: componentSummary.significantCount,
    phash,
    palette
  };
}

function isMascotTargetStyle(targetStyle: string | undefined): boolean {
  if (!targetStyle) {
    return false;
  }

  const normalized = targetStyle.trim().toLowerCase();
  return normalized.includes("mascot");
}

function scoreStyleMatch(prompt: string, targetStyle?: string): number {
  const normalized = prompt.toLowerCase();
  const groups = isMascotTargetStyle(targetStyle)
    ? [
        ["2d", "mascot", "doodle"],
        ["monochrome", "black line art", "line-art", "plain light background"],
        ["oversized head", "rounded geometric head", "square-rounded head", "compact head"],
        ["tiny body", "stubby", "paw", "mitten paws", "simple tail silhouette", "short curved tail"]
      ]
    : [
        ["2d", "anime", "mascot", "cartoon"],
        ["character", "model sheet", "turnaround"],
        ["cel shading", "line art", "vector", "clean silhouette"],
        ["plain background", "transparent background"]
      ];

  let matched = 0;
  for (const group of groups) {
    if (group.some((token) => normalized.includes(token))) {
      matched += 1;
    }
  }

  return clamp01(matched / groups.length);
}

function scoreResolutionQuality(analysis: ImageAnalysis): number {
  const minDimension = Math.min(analysis.originalWidth, analysis.originalHeight);
  if (minDimension >= 1024) {
    return 1;
  }
  if (minDimension <= 256) {
    return 0;
  }
  return clamp01((minDimension - 256) / 768);
}

function scoreBBoxOccupancy(analysis: ImageAnalysis): number {
  const target = 0.48;
  const distance = Math.abs(analysis.bboxOccupancy - target);
  return clamp01(1 - distance / 0.45);
}

function scoreAlphaCoverage(analysis: ImageAnalysis): number {
  const target = 0.42;
  const distance = Math.abs(analysis.alphaCoverage - target);
  return clamp01(1 - distance / 0.5);
}

function scoreSharpness(analysis: ImageAnalysis): number {
  return clamp01(analysis.blurScore / 2600);
}

function scoreNoise(analysis: ImageAnalysis): number {
  return clamp01(1 - analysis.noiseScore / 70);
}

function scoreWatermarkSafety(analysis: ImageAnalysis): number {
  return clamp01(1 - analysis.watermarkTextRisk);
}

function scoreMascotMonochrome(analysis: ImageAnalysis): number {
  return analysis.monochromeScore;
}

function scoreMascotPaletteSimplicity(analysis: ImageAnalysis): number {
  const strictScore = clamp01(1 - analysis.paletteComplexity);
  if (analysis.monochromeScore >= 0.84) {
    return Math.max(strictScore, clamp01(0.42 + analysis.monochromeScore * 0.5));
  }
  return strictScore;
}

function scoreMascotHeadRatio(analysis: ImageAnalysis): number {
  const target = 0.62;
  return clamp01(1 - Math.abs(analysis.upperAlphaRatio - target) / 0.28);
}

function scoreMascotHeadSquareness(analysis: ImageAnalysis): number {
  const target = 1.02;
  return clamp01(1 - Math.abs(analysis.headBoxAspectRatio - target) / 0.34);
}

function scoreMascotSilhouette(analysis: ImageAnalysis): number {
  const target = 0.72;
  return clamp01(1 - Math.abs(analysis.bboxAspectRatio - target) / 0.5);
}

function scoreMascotFrontSymmetry(analysis: ImageAnalysis, view: CharacterView): number {
  return view === "front" ? analysis.symmetryScore : 0.9;
}

function scoreMascotContrast(analysis: ImageAnalysis): number {
  return clamp01((analysis.contrast - 24) / 96);
}

function scoreMascotSubjectIsolation(analysis: ImageAnalysis): number {
  const countPenalty = Math.max(0, analysis.significantComponentCount - 2);
  const countScore = clamp01(1 - countPenalty / 5);
  return clamp01(analysis.largestComponentShare * 0.78 + countScore * 0.22);
}

function scoreMascotPawStability(
  analysis: ImageAnalysis,
  view: CharacterView
): {
  score: number;
  parts: {
    pawRoundness: number;
    pawSymmetry: number;
    fingerSafety: number;
    handRegionDensity: number;
  };
} {
  const fingerSafety = clamp01(1 - analysis.fingerSpikeScore);
  const handRegionDensity = clamp01(1 - Math.abs(analysis.handRegionEdgeDensity - 0.22) / 0.22);
  const pawRoundnessWeight = view === "profile" ? 0.28 : 0.36;
  const pawSymmetryWeight = view === "profile" ? 0.12 : 0.28;
  const fingerSafetyWeight = 0.24;
  const densityWeight = clamp01(1 - pawRoundnessWeight - pawSymmetryWeight - fingerSafetyWeight);

  return {
    score: clamp01(
      analysis.pawRoundnessScore * pawRoundnessWeight +
        analysis.pawSymmetryScore * pawSymmetryWeight +
        fingerSafety * fingerSafetyWeight +
        handRegionDensity * densityWeight
    ),
    parts: {
      pawRoundness: analysis.pawRoundnessScore,
      pawSymmetry: analysis.pawSymmetryScore,
      fingerSafety,
      handRegionDensity
    }
  };
}

function scoreTargetMetric(value: number, target: number, tolerance: number): number {
  return clamp01(1 - Math.abs(value - target) / Math.max(0.001, tolerance));
}

function mascotSpeciesAspectTarget(speciesId: MascotSpecies, view: CharacterView): number {
  if (speciesId === "cat") {
    if (view === "profile") {
      return 0.78;
    }
    if (view === "threeQuarter") {
      return 0.75;
    }
    return 0.72;
  }
  if (speciesId === "dog") {
    if (view === "profile") {
      return 0.88;
    }
    if (view === "threeQuarter") {
      return 0.82;
    }
    return 0.76;
  }
  if (view === "profile") {
    return 0.96;
  }
  if (view === "threeQuarter") {
    return 0.88;
  }
  return 0.8;
}

function scoreMascotSpeciesIdentity(
  analysis: ImageAnalysis,
  speciesId: MascotSpecies,
  view: CharacterView
): {
  score: number;
  parts: {
    earCue: number;
    muzzleCue: number;
    headShapeCue: number;
    silhouetteCue: number;
  };
} {
  if (speciesId === "dog" && view === "front") {
    const earCue = scoreTargetMetric(analysis.upperFaceCoverage, 0.18, 0.1);
    const muzzleCue = scoreTargetMetric(analysis.bboxAspectRatio, 1.02, 0.34);
    const headShapeCue = scoreTargetMetric(analysis.upperAlphaRatio, 0.46, 0.16);
    const silhouetteCue = scoreTargetMetric(analysis.bboxAspectRatio, 0.98, 0.38);
    const weightedScore = clamp01(earCue * 0.26 + muzzleCue * 0.36 + headShapeCue * 0.24 + silhouetteCue * 0.14);
    const supportScore = clamp01(
      earCue * 0.42 + headShapeCue * 0.34 + Math.min(muzzleCue, silhouetteCue) * 0.24
    );

    return {
      score: Math.min(weightedScore, supportScore),
      parts: {
        earCue,
        muzzleCue,
        headShapeCue,
        silhouetteCue
      }
    };
  }

  const upperFaceTarget =
    speciesId === "dog"
      ? view === "front"
        ? 0.18
        : 0.14
      : speciesId === "wolf"
        ? view === "front"
          ? 0.2
          : 0.18
        : 0.16;
  const upperAlphaTarget =
    speciesId === "cat" ? 0.63 : speciesId === "dog" ? (view === "front" ? 0.64 : 0.6) : view === "front" ? 0.6 : 0.57;
  const silhouetteTarget =
    speciesId === "cat" ? 0.72 : speciesId === "dog" ? (view === "front" ? 0.72 : 0.78) : view === "front" ? 0.78 : 0.84;
  const aspectTarget = mascotSpeciesAspectTarget(speciesId, view);

  const earCue = scoreTargetMetric(analysis.upperFaceCoverage, upperFaceTarget, view === "front" ? 0.15 : 0.11);
  const muzzleCue = scoreTargetMetric(analysis.bboxAspectRatio, aspectTarget, view === "front" ? 0.24 : 0.22);
  const headShapeCue = scoreTargetMetric(analysis.upperAlphaRatio, upperAlphaTarget, view === "front" ? 0.2 : 0.15);
  const silhouetteCue = scoreTargetMetric(analysis.bboxAspectRatio, silhouetteTarget, view === "front" ? 0.28 : 0.24);

  return {
    score: clamp01(earCue * 0.2 + muzzleCue * 0.42 + headShapeCue * 0.22 + silhouetteCue * 0.16),
    parts: {
      earCue,
      muzzleCue,
      headShapeCue,
      silhouetteCue
    }
  };
}

function applyMascotSpeciesWarnings(input: {
  speciesId: MascotSpecies;
  view: CharacterView;
  analysis: ImageAnalysis;
  speciesScore: number;
  warnings: string[];
  rejections: string[];
}): void {
  const { speciesId, view, analysis, speciesScore, warnings, rejections } = input;

  if (speciesScore < 0.18) {
    warnings.push("species_identity_too_weak");
  } else if (speciesScore < 0.3) {
    warnings.push("species_readability_low");
  }

  if (speciesId === "cat") {
    if (analysis.upperFaceCoverage < 0.1) {
      warnings.push("cat_ear_silhouette_too_flat");
    }
    if (
      ((view === "profile" && analysis.bboxAspectRatio > 0.92) ||
        (view === "threeQuarter" && analysis.bboxAspectRatio > 0.92 && speciesScore < 0.28))
    ) {
      warnings.push("cat_muzzle_too_long");
    }
    if (view === "profile" && speciesScore < 0.08) {
      rejections.push("cat_profile_species_breakdown");
    } else if (view === "threeQuarter" && speciesScore < 0.1) {
      rejections.push("cat_threequarter_species_breakdown");
    } else if (view === "threeQuarter" && speciesScore < 0.16) {
      warnings.push("cat_threequarter_species_readability_low");
    }
  } else if (speciesId === "dog") {
    if (analysis.upperFaceCoverage > (view === "front" ? 0.26 : 0.24)) {
      warnings.push("dog_ears_too_pointed");
    }
    if (view === "front" && analysis.upperFaceCoverage < 0.055) {
      rejections.push("dog_front_face_too_small");
    } else if (view === "front" && analysis.upperFaceCoverage < 0.085) {
      warnings.push("dog_front_face_readability_low");
    }
    if (view === "front" && analysis.upperFaceCoverage > 0.3) {
      rejections.push("dog_front_rabbit_ear_risk");
    }
    if (view === "profile" && analysis.bboxAspectRatio < 0.7) {
      warnings.push("dog_muzzle_too_short");
    }
    if (view === "front" && speciesScore < 0.28) {
      rejections.push("dog_front_species_breakdown");
    } else if (view === "front" && speciesScore < 0.36) {
      warnings.push("dog_front_species_readability_low");
    }
  } else {
    if (view !== "front" && analysis.bboxAspectRatio < 0.78) {
      warnings.push("wolf_muzzle_too_short");
    }
    if (analysis.upperAlphaRatio > 0.7) {
      warnings.push("wolf_head_too_round");
    }
  }
}

function compareScoredCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  const identityDriftSignals = (candidate: ScoredCandidate): number =>
    [...candidate.rejections, ...candidate.warnings].filter(
      (reason) =>
        reason === "inconsistent_with_front_baseline" ||
        reason === "consistency_low" ||
        reason === "consistency_shape_drift" ||
        reason === "consistency_style_drift"
    ).length;
  const rigSignals = (candidate: ScoredCandidate): number => {
    const rig = summarizeCandidateRigStability({ candidate });
    return [
      rig.lowAnchorConfidence,
      rig.hardLowAnchorConfidence,
      rig.lowLandmarkConsistency,
      rig.hardLowLandmarkConsistency
    ].filter(Boolean).length;
  };
  const runtimeInstabilitySignals = (candidate: ScoredCandidate): number =>
    [...candidate.rejections, ...candidate.warnings].filter((reason) => reason.startsWith("runtime_")).length;
  const rejectionWeightA = a.rejections.length > 0 ? 1 : 0;
  const rejectionWeightB = b.rejections.length > 0 ? 1 : 0;
  if (rejectionWeightA !== rejectionWeightB) {
    return rejectionWeightA - rejectionWeightB;
  }

  const runtimePenaltyA = runtimeInstabilitySignals(a);
  const runtimePenaltyB = runtimeInstabilitySignals(b);
  if (runtimePenaltyA !== runtimePenaltyB) {
    return runtimePenaltyA - runtimePenaltyB;
  }

  if (Math.abs(a.score - b.score) >= 0.08) {
    return b.score - a.score;
  }

  if (Math.abs(a.score - b.score) < 0.05) {
    const consistencyA = typeof a.consistencyScore === "number" ? a.consistencyScore : -1;
    const consistencyB = typeof b.consistencyScore === "number" ? b.consistencyScore : -1;
    if (Math.abs(consistencyA - consistencyB) >= 0.035) {
      return consistencyB - consistencyA;
    }
  }

  const identityPenaltyA = identityDriftSignals(a);
  const identityPenaltyB = identityDriftSignals(b);
  if (identityPenaltyA !== identityPenaltyB) {
    return identityPenaltyA - identityPenaltyB;
  }

  const rigPenaltyA = rigSignals(a);
  const rigPenaltyB = rigSignals(b);
  if (rigPenaltyA !== rigPenaltyB) {
    return rigPenaltyA - rigPenaltyB;
  }

  if (a.warnings.length !== b.warnings.length) {
    return a.warnings.length - b.warnings.length;
  }

  return b.score - a.score;
}

function getRuntimeBucketPriority(level: CandidateRuntimeBucketLevel): number {
  switch (level) {
    case "clean":
      return 0;
    case "warn":
      return 1;
    case "degraded":
      return 2;
    case "compound":
      return 3;
    case "block":
      return 4;
    default:
      return 5;
  }
}

function resolveWorstRuntimeBucketLevel(levels: CandidateRuntimeBucketLevel[]): CandidateRuntimeBucketLevel | undefined {
  if (levels.length === 0) {
    return undefined;
  }
  return levels.reduce((worst, current) =>
    getRuntimeBucketPriority(current) > getRuntimeBucketPriority(worst) ? current : worst
  );
}

export function compareScoredCandidatesForSelection(input: {
  a: ScoredCandidate;
  b: ScoredCandidate;
  targetStyle?: string;
  acceptedScoreThreshold: number;
}): number {
  const bucketA = classifyCandidateRuntimeBucket({
    candidate: input.a,
    targetStyle: input.targetStyle
  });
  const bucketB = classifyCandidateRuntimeBucket({
    candidate: input.b,
    targetStyle: input.targetStyle
  });
  const bucketPriorityDelta = getRuntimeBucketPriority(bucketA.level) - getRuntimeBucketPriority(bucketB.level);
  if (bucketPriorityDelta !== 0) {
    return bucketPriorityDelta;
  }
  return compareScoredCandidates(input.a, input.b);
}

export function groupBestByViewForSelection(input: {
  scored: ScoredCandidate[];
  targetStyle?: string;
  acceptedScoreThreshold: number;
}): Partial<Record<CharacterView, ScoredCandidate>> {
  const out: Partial<Record<CharacterView, ScoredCandidate>> = {};

  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const pool = input.scored
      .filter((entry) => entry.candidate.view === view)
      .sort((left, right) =>
        compareScoredCandidatesForSelection({
          a: left,
          b: right,
          targetStyle: input.targetStyle,
          acceptedScoreThreshold: input.acceptedScoreThreshold
        })
      );

    if (pool.length > 0) {
      out[view] = pool[0];
    }
  }

  return out;
}

export function mergePreferredSelectionByViewForSelection(input: {
  baseSelectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  preferredSelectionByView: Partial<Record<CharacterView, ScoredCandidate>>;
  targetStyle?: string;
  acceptedScoreThreshold: number;
}): Partial<Record<CharacterView, ScoredCandidate>> {
  const selectedByView: Partial<Record<CharacterView, ScoredCandidate>> = {
    ...input.baseSelectedByView
  };

  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const contender = input.preferredSelectionByView[view];
    if (!contender) {
      continue;
    }
    const current = selectedByView[view];
    if (
      !current ||
      compareScoredCandidatesForSelection({
        a: contender,
        b: current,
        targetStyle: input.targetStyle,
        acceptedScoreThreshold: input.acceptedScoreThreshold
      }) < 0
    ) {
      selectedByView[view] = contender;
    }
  }

  return selectedByView;
}

function resolveMascotQcThresholds(speciesId?: string) {
  const profile = resolveMascotSpeciesProfile(speciesId).qcThresholds;
  if (normalizeGenerationSpecies(speciesId) === "dog") {
    return {
      ...profile,
      frontMasterMinHeadSquarenessScore: Math.min(profile.frontMasterMinHeadSquarenessScore, 0.18)
    };
  }
  return profile;
}

function removeReason(reasons: string[], target: string): void {
  let index = reasons.indexOf(target);
  while (index >= 0) {
    reasons.splice(index, 1);
    index = reasons.indexOf(target);
  }
}

export function shouldDowngradeCanineFrontFragmentationRisk(input: {
  speciesId?: string;
  view: CharacterView;
  subjectFillRatio?: number;
  subjectIsolationScore?: number;
  largestComponentShare?: number;
  significantComponentCount?: number;
  speciesScore?: number;
  speciesMuzzleScore?: number;
  speciesSilhouetteScore?: number;
  targetStyleScore?: number;
  frontSymmetryScore?: number;
  headSquarenessScore?: number;
  handRegionDensityScore?: number;
}): boolean {
  const species = normalizeGenerationSpecies(input.speciesId);
  if ((species !== "dog" && species !== "wolf") || input.view !== "front") {
    return false;
  }

  const profileThresholds = resolveMascotQcThresholds(species);
  const speciesFloor = species === "wolf" ? 0.48 : 0.42;
  const handDensityFloor = species === "wolf" ? 0.16 : 0.12;
  const fillFloor = species === "wolf" ? 0.22 : 0.2;
  const isolationFloor = Math.max(0.32, profileThresholds.minSubjectIsolationFront - 0.18);
  const geometryCue = Math.max(input.speciesMuzzleScore ?? 0, input.speciesSilhouetteScore ?? 0);

  return (
    (input.subjectFillRatio ?? 0) >= fillFloor &&
    (input.subjectIsolationScore ?? 0) >= isolationFloor &&
    (input.largestComponentShare ?? 0) >= 0.66 &&
    (input.significantComponentCount ?? Number.POSITIVE_INFINITY) <= 6 &&
    (input.speciesScore ?? 0) >= speciesFloor &&
    geometryCue >= 0.24 &&
    (input.targetStyleScore ?? 0) >= 0.76 &&
    (input.frontSymmetryScore ?? 0) >= profileThresholds.minFrontSymmetryScore &&
    (input.headSquarenessScore ?? 0) >= Math.max(0.18, profileThresholds.frontMasterMinHeadSquarenessScore - 0.08) &&
    (input.handRegionDensityScore ?? 0) >= handDensityFloor
  );
}

export function shouldDowngradeCatFrontFragmentationRisk(input: {
  speciesId?: string;
  view: CharacterView;
  subjectFillRatio?: number;
  subjectIsolationScore?: number;
  largestComponentShare?: number;
  significantComponentCount?: number;
  speciesScore?: number;
  speciesEarScore?: number;
  speciesMuzzleScore?: number;
  targetStyleScore?: number;
  frontSymmetryScore?: number;
  headSquarenessScore?: number;
  handRegionDensityScore?: number;
}): boolean {
  const species = normalizeGenerationSpecies(input.speciesId);
  if (species !== "cat" || input.view !== "front") {
    return false;
  }

  const profileThresholds = resolveMascotQcThresholds(species);
  const subjectIsolationScore = input.subjectIsolationScore ?? 0;
  const largestComponentShare = input.largestComponentShare ?? 0;
  const significantComponentCount = input.significantComponentCount ?? Number.POSITIVE_INFINITY;
  const sparseSingleSubjectCat =
    subjectIsolationScore >= 0.4 && largestComponentShare >= 0.35 && significantComponentCount <= 6;
  return (
    (input.subjectFillRatio ?? 0) >= 0.05 &&
    subjectIsolationScore >= Math.max(0.28, profileThresholds.minSubjectIsolationFront - 0.18) &&
    largestComponentShare >= 0.14 &&
    significantComponentCount <= (sparseSingleSubjectCat ? 6 : 3) &&
    (input.speciesScore ?? 0) >= 0.42 &&
    (input.speciesEarScore ?? 0) >= 0.16 &&
    (input.speciesMuzzleScore ?? 0) >= 0.48 &&
    (input.targetStyleScore ?? 0) >= 0.6 &&
    (input.frontSymmetryScore ?? 0) >= Math.max(0.7, profileThresholds.minFrontSymmetryScore) &&
    (input.headSquarenessScore ?? 0) >= Math.max(0.22, profileThresholds.frontMasterMinHeadSquarenessScore - 0.04) &&
    (input.handRegionDensityScore ?? 0) >= 0.18
  );
}

export function shouldDowngradeCatFrontHeadShapeBreakdownRisk(input: {
  speciesId?: string;
  view: CharacterView;
  subjectFillRatio?: number;
  subjectIsolationScore?: number;
  largestComponentShare?: number;
  significantComponentCount?: number;
  speciesScore?: number;
  speciesEarScore?: number;
  speciesMuzzleScore?: number;
  speciesHeadShapeScore?: number;
  speciesSilhouetteScore?: number;
  targetStyleScore?: number;
  frontSymmetryScore?: number;
  headSquarenessScore?: number;
  handRegionDensityScore?: number;
}): boolean {
  const species = normalizeGenerationSpecies(input.speciesId);
  if (species !== "cat" || input.view !== "front") {
    return false;
  }

  const profileThresholds = resolveMascotQcThresholds(species);
  return (
    (input.subjectFillRatio ?? 0) >= 0.14 &&
    (input.subjectIsolationScore ?? 0) >= Math.max(0.58, profileThresholds.minSubjectIsolationFront + 0.08) &&
    (input.largestComponentShare ?? 0) >= 0.72 &&
    (input.significantComponentCount ?? Number.POSITIVE_INFINITY) <= 6 &&
    (input.speciesScore ?? 0) >= 0.56 &&
    (input.speciesEarScore ?? 0) >= 0.42 &&
    (input.speciesMuzzleScore ?? 0) >= 0.42 &&
    (input.speciesHeadShapeScore ?? 0) >= 0.72 &&
    (input.speciesSilhouetteScore ?? 0) >= 0.46 &&
    (input.targetStyleScore ?? 0) >= 0.62 &&
    (input.frontSymmetryScore ?? 0) >= 0.92 &&
    (input.headSquarenessScore ?? 0) >= Math.max(0.1, profileThresholds.frontMasterMinHeadSquarenessScore - 0.16) &&
    (input.handRegionDensityScore ?? 0) >= 0.18
  );
}

function computeMascotGeometryCue(candidate: ScoredCandidate | undefined): number | null {
  if (!candidate) {
    return null;
  }
  const parts = [
    candidate.breakdown.speciesEarScore,
    candidate.breakdown.speciesMuzzleScore,
    candidate.breakdown.speciesHeadShapeScore,
    candidate.breakdown.speciesSilhouetteScore
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (parts.length === 0) {
    return null;
  }
  return clamp01(parts.reduce((sum, value) => sum + value, 0) / parts.length);
}

function computeMetricSpread(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (finite.length < 2) {
    return null;
  }
  return Math.max(...finite) - Math.min(...finite);
}

function asOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function averageFiniteNumbers(values: Array<number | null | undefined>): number | null {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (finite.length === 0) {
    return null;
  }
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function getNestedRecordValue(record: Record<string, unknown> | null, path: string[]): unknown {
  let current: unknown = record;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function getNestedNumber(record: Record<string, unknown> | null, path: string[]): number | undefined {
  return asOptionalFiniteNumber(getNestedRecordValue(record, path));
}

function resolveRigStabilityThresholds(speciesId?: string): {
  frontAnchorSoftFloor: number;
  frontAnchorHardFloor: number;
  sideAnchorSoftFloorByView: Record<"threeQuarter" | "profile", number>;
  sideAnchorHardFloorByView: Record<"threeQuarter" | "profile", number>;
  landmarkSoftFloorByView: Record<"threeQuarter" | "profile", number>;
  landmarkHardFloorByView: Record<"threeQuarter" | "profile", number>;
  overallAnchorSoftFloor: number;
  overallAnchorHardFloor: number;
} {
  const qc = resolveMascotQcThresholds(speciesId);
  const selection = resolveMascotSelectionRiskThresholds(speciesId);
  const threeQuarterAnchorSoft = clamp01(
    Math.max(0.4, selection.threeQuarterGeometrySoftFloor + 0.05)
  );
  const profileAnchorSoft = clamp01(Math.max(0.36, selection.profileGeometrySoftFloor + 0.04));
  const threeQuarterLandmarkSoft = clamp01(
    Math.max(0.5, selection.threeQuarterConsistencySoftFloor + 0.03)
  );
  const profileLandmarkSoft = clamp01(Math.max(0.46, selection.profileConsistencySoftFloor + 0.03));
  return {
    frontAnchorSoftFloor: selection.frontAnchorScoreSoftFloor,
    frontAnchorHardFloor: clamp01(Math.max(0.48, selection.frontAnchorScoreSoftFloor - 0.12)),
    sideAnchorSoftFloorByView: {
      threeQuarter: threeQuarterAnchorSoft,
      profile: profileAnchorSoft
    },
    sideAnchorHardFloorByView: {
      threeQuarter: clamp01(Math.max(0.3, threeQuarterAnchorSoft - 0.12)),
      profile: clamp01(Math.max(0.28, profileAnchorSoft - 0.12))
    },
    landmarkSoftFloorByView: {
      threeQuarter: threeQuarterLandmarkSoft,
      profile: profileLandmarkSoft
    },
    landmarkHardFloorByView: {
      threeQuarter: clamp01(Math.max(0.36, (qc.minConsistencyByView.threeQuarter ?? 0.48) - 0.04)),
      profile: clamp01(Math.max(0.32, (qc.minConsistencyByView.profile ?? 0.4) - 0.05))
    },
    overallAnchorSoftFloor: clamp01(Math.max(0.66, selection.frontAnchorScoreSoftFloor - 0.02)),
    overallAnchorHardFloor: clamp01(Math.max(0.56, selection.frontAnchorScoreSoftFloor - 0.12))
  };
}

function resolveCandidateAnchorConfidenceFromMeta(
  candidate: ScoredCandidate | undefined
): { value: number; source: "provider" | "workflow" } | null {
  if (!candidate?.candidate.providerMeta || !isRecord(candidate.candidate.providerMeta)) {
    return null;
  }
  const providerMeta = candidate.candidate.providerMeta;
  const workflowSummary = isRecord(providerMeta.workflowSummary) ? providerMeta.workflowSummary : null;
  const view = candidate.candidate.view;
  const providerPaths: string[][] = [
    ["anchorConfidence"],
    ["anchor_confidence"],
    ["anchorConfidenceScore"],
    ["anchor_confidence_score"],
    ["anchorConfidenceByView", view],
    ["anchor_confidence_by_view", view],
    ["anchorConfidenceSummary", "byView", view],
    ["anchor_confidence_summary", "by_view", view],
    ["anchorDiagnostics", "byView", view, "confidence"],
    ["anchor_diagnostics", "by_view", view, "confidence"],
    ["anchorDiagnostics", view, "confidence"],
    ["anchor_diagnostics", view, "confidence"],
    ["anchors", "confidence_summary", "by_view", view]
  ];
  for (const path of providerPaths) {
    const value = getNestedNumber(providerMeta, path);
    if (value !== undefined) {
      return {
        value: clamp01(value),
        source: "provider"
      };
    }
  }
  for (const path of providerPaths) {
    const value = getNestedNumber(workflowSummary, path);
    if (value !== undefined) {
      return {
        value: clamp01(value),
        source: "workflow"
      };
    }
  }
  return null;
}

function resolveCandidateLandmarkConsistencyFromMeta(
  candidate: ScoredCandidate | undefined
): { value: number; source: "provider" | "workflow" } | null {
  if (!candidate?.candidate.providerMeta || !isRecord(candidate.candidate.providerMeta)) {
    return null;
  }
  const providerMeta = candidate.candidate.providerMeta;
  const workflowSummary = isRecord(providerMeta.workflowSummary) ? providerMeta.workflowSummary : null;
  const view = candidate.candidate.view;
  const providerPaths: string[][] = [
    ["landmarkConsistency"],
    ["landmark_consistency"],
    ["landmarkConsistencyScore"],
    ["landmark_consistency_score"],
    ["landmarkConsistencyByView", view],
    ["landmark_consistency_by_view", view],
    ["landmarkConsistencySummary", "byView", view],
    ["landmark_consistency_summary", "by_view", view],
    ["rigDiagnostics", "landmarkConsistencyByView", view],
    ["rig_diagnostics", "landmark_consistency_by_view", view]
  ];
  for (const path of providerPaths) {
    const value = getNestedNumber(providerMeta, path);
    if (value !== undefined) {
      return {
        value: clamp01(value),
        source: "provider"
      };
    }
  }
  for (const path of providerPaths) {
    const value = getNestedNumber(workflowSummary, path);
    if (value !== undefined) {
      return {
        value: clamp01(value),
        source: "workflow"
      };
    }
  }
  return null;
}

function inferRigAnchorTargets(input: {
  view: CharacterView;
  family: RigRepairReasonFamily;
  reasonCode: string;
}): RigAnchorTarget[] {
  const { view, family, reasonCode } = input;
  const targets = new Set<RigAnchorTarget>();
  if (family === "repairable_anchor") {
    targets.add("head_center");
    targets.add("mouth_center");
    if (view === "front") {
      targets.add("eye_near");
      targets.add("eye_far");
    } else {
      targets.add("eye_near");
      targets.add("ear_near");
      if (view === "threeQuarter") {
        targets.add("eye_far");
        targets.add("ear_far");
      }
    }
  }
  if (family === "repairable_landmark") {
    targets.add("head_center");
    targets.add("mouth_center");
    if (view !== "front") {
      targets.add("paw_anchor");
      targets.add("tail_root");
    }
  }
  if (family === "species_misread") {
    targets.add("head_center");
    targets.add("mouth_center");
    targets.add("ear_near");
    if (view === "threeQuarter") {
      targets.add("ear_far");
    }
  }
  if (family === "protective_fallback") {
    targets.add("mouth_center");
    if (reasonCode.includes("yaw")) {
      targets.add("head_center");
      targets.add("eye_near");
    }
  }
  if (family === "recreate_required") {
    targets.add("head_center");
    targets.add("mouth_center");
    targets.add("paw_anchor");
    targets.add("tail_root");
  }
  return [...targets];
}

function createRigRepairRecommendation(input: {
  view: CharacterView;
  family: RigRepairReasonFamily;
  reasonCode: string;
  priority: "low" | "medium" | "high";
  action: RigRepairAction;
  summary: string;
}): RigRepairRecommendation {
  return {
    view: input.view,
    family: input.family,
    action: input.action,
    priority: input.priority,
    reasonCode: input.reasonCode,
    summary: input.summary,
    repairable: input.action !== "recreate-pack",
    anchorTargets: inferRigAnchorTargets({
      view: input.view,
      family: input.family,
      reasonCode: input.reasonCode
    })
  };
}

function detectRigSpeciesMisread(candidate: ScoredCandidate | undefined): boolean {
  if (!candidate) {
    return false;
  }
  const combined = dedupeStrings([...candidate.warnings, ...candidate.rejections]).join(" ").toLowerCase();
  return (
    combined.includes("species") ||
    combined.includes("muzzle") ||
    combined.includes("ear") ||
    combined.includes("canine") ||
    combined.includes("feline")
  );
}

function summarizeRigRepairability(input: {
  severity: RigStabilityDiagnostics["severity"];
  blockingViews: CharacterView[];
  warningViews: CharacterView[];
  repairRecommendations: RigRepairRecommendation[];
  anchorConfidenceOverall: number | null;
  overallAnchorHardFloor: number;
}): "none" | "surgical" | "manual" | "recreate" {
  if (input.repairRecommendations.length === 0) {
    return "none";
  }
  const hasRecreate = input.repairRecommendations.some((entry) => entry.action === "recreate-pack");
  if (
    hasRecreate ||
    (input.severity === "block" &&
      (input.blockingViews.includes("front") ||
        input.blockingViews.length >= 2 ||
        (typeof input.anchorConfidenceOverall === "number" &&
          input.anchorConfidenceOverall < input.overallAnchorHardFloor)))
  ) {
    return "recreate";
  }
  const hasManual = input.repairRecommendations.some((entry) => entry.action === "manual-compare");
  return hasManual ? "manual" : "surgical";
}

function summarizeCandidateRigStability(input: {
  candidate: ScoredCandidate | undefined;
  speciesId?: string;
}): CandidateRigStabilitySnapshot {
  const candidate = input.candidate;
  if (!candidate) {
    return {
      anchorConfidence: null,
      landmarkConsistency: null,
      lowAnchorConfidence: false,
      hardLowAnchorConfidence: false,
      lowLandmarkConsistency: false,
      hardLowLandmarkConsistency: false,
      safeFrontExpression: false,
      suppressAggressiveYaw: false,
      lockMouthPreset: false,
      reasonCodes: [],
      reasonFamilies: [],
      repairRecommendations: [],
      preferredAction: undefined
    };
  }

  const thresholds = resolveRigStabilityThresholds(input.speciesId);
  const view = candidate.candidate.view;
  const geometryCue = computeMascotGeometryCue(candidate);
  const anchorFromMeta = resolveCandidateAnchorConfidenceFromMeta(candidate);
  const landmarkFromMeta = resolveCandidateLandmarkConsistencyFromMeta(candidate);
  const anchorConfidence =
    anchorFromMeta?.value ??
    (view === "front"
      ? clamp01(
          (candidate.score ?? 0) * 0.28 +
            (candidate.breakdown.frontSymmetryScore ?? 0) * 0.24 +
            (candidate.breakdown.headSquarenessScore ?? 0) * 0.16 +
            (candidate.breakdown.speciesScore ?? 0) * 0.16 +
            (candidate.breakdown.targetStyleScore ?? 0) * 0.16
        )
      : geometryCue !== null || typeof candidate.consistencyScore === "number"
        ? clamp01(((geometryCue ?? 0.46) * 0.56) + (((candidate.consistencyScore ?? geometryCue ?? 0.46)) * 0.44))
        : null);
  const landmarkConsistency =
    view === "front"
      ? null
      : landmarkFromMeta?.value ??
        (typeof candidate.consistencyScore === "number" ? clamp01(candidate.consistencyScore) : null);
  const sideAnchorSoftFloor =
    view === "threeQuarter" ? thresholds.sideAnchorSoftFloorByView.threeQuarter : thresholds.sideAnchorSoftFloorByView.profile;
  const sideAnchorHardFloor =
    view === "threeQuarter" ? thresholds.sideAnchorHardFloorByView.threeQuarter : thresholds.sideAnchorHardFloorByView.profile;
  const sideLandmarkSoftFloor =
    view === "threeQuarter" ? thresholds.landmarkSoftFloorByView.threeQuarter : thresholds.landmarkSoftFloorByView.profile;
  const sideLandmarkHardFloor =
    view === "threeQuarter" ? thresholds.landmarkHardFloorByView.threeQuarter : thresholds.landmarkHardFloorByView.profile;
  const lowAnchorConfidence =
    typeof anchorConfidence === "number" &&
    (view === "front"
      ? anchorConfidence < thresholds.frontAnchorSoftFloor
      : anchorConfidence < sideAnchorSoftFloor);
  const hardLowAnchorConfidence =
    typeof anchorConfidence === "number" &&
    (view === "front"
      ? anchorConfidence < thresholds.frontAnchorHardFloor
      : anchorConfidence < sideAnchorHardFloor);
  const lowLandmarkConsistency =
    view !== "front" &&
    typeof landmarkConsistency === "number" &&
    landmarkConsistency < sideLandmarkSoftFloor;
  const hardLowLandmarkConsistency =
    view !== "front" &&
    typeof landmarkConsistency === "number" &&
    landmarkConsistency < sideLandmarkHardFloor;
  const suppressAggressiveYaw =
    view !== "front" &&
    (lowAnchorConfidence ||
      lowLandmarkConsistency ||
      candidate.warnings.includes("consistency_shape_drift") ||
      candidate.rejections.includes("inconsistent_with_front_baseline") ||
      candidate.rejections.includes("threequarter_front_collapse"));
  const safeFrontExpression = view === "front" && lowAnchorConfidence;
  const lockMouthPreset = view === "front" && (lowAnchorConfidence || hardLowAnchorConfidence);
  const reasonCodes = dedupeStrings(
    [
      lowAnchorConfidence ? `anchor_low:${view}` : "",
      hardLowAnchorConfidence ? `anchor_hard:${view}` : "",
      lowLandmarkConsistency ? `landmark_low:${view}` : "",
      hardLowLandmarkConsistency ? `landmark_hard:${view}` : "",
      safeFrontExpression ? "safe_front_expression" : "",
      suppressAggressiveYaw ? `yaw_suppressed:${view}` : "",
      lockMouthPreset ? "mouth_lock" : ""
    ].filter((reason) => reason.length > 0)
  );
  const reasonFamilies = new Set<RigRepairReasonFamily>();
  const repairRecommendations: RigRepairRecommendation[] = [];
  if (lowAnchorConfidence || hardLowAnchorConfidence) {
    reasonFamilies.add("repairable_anchor");
    repairRecommendations.push(
      createRigRepairRecommendation({
        view,
        family: "repairable_anchor",
        reasonCode: hardLowAnchorConfidence ? `anchor_hard:${view}` : `anchor_low:${view}`,
        priority: hardLowAnchorConfidence ? "high" : "medium",
        action: view === "front" && hardLowAnchorConfidence ? "manual-compare" : "regenerate-view",
        summary:
          view === "front"
            ? "Front anchor confidence is weak enough that the face anchor should be regenerated or manually compared before approval."
            : `${view} anchor confidence is weak enough that this angle should be regenerated before approving the pack.`
      })
    );
  }
  if (lowLandmarkConsistency || hardLowLandmarkConsistency) {
    reasonFamilies.add("repairable_landmark");
    repairRecommendations.push(
      createRigRepairRecommendation({
        view,
        family: "repairable_landmark",
        reasonCode: hardLowLandmarkConsistency ? `landmark_hard:${view}` : `landmark_low:${view}`,
        priority: hardLowLandmarkConsistency ? "high" : "medium",
        action: hardLowLandmarkConsistency ? "manual-compare" : "regenerate-view",
        summary: `${view} landmark geometry is drifting against the front anchor layout and should be repaired before promotion.`
      })
    );
  }
  if (detectRigSpeciesMisread(candidate)) {
    reasonFamilies.add("species_misread");
    repairRecommendations.push(
      createRigRepairRecommendation({
        view,
        family: "species_misread",
        reasonCode: `species_misread:${view}`,
        priority: view === "front" ? "high" : "medium",
        action: view === "front" ? "manual-compare" : "regenerate-view",
        summary: `${view} candidate is showing species-shape drift, so compare or regenerate this view before approval.`
      })
    );
  }
  if (safeFrontExpression || suppressAggressiveYaw || lockMouthPreset) {
    reasonFamilies.add("protective_fallback");
  }
  if (safeFrontExpression) {
    repairRecommendations.push(
      createRigRepairRecommendation({
        view,
        family: "protective_fallback",
        reasonCode: "safe_front_expression",
        priority: "medium",
        action: "protective-fallback",
        summary: "Keep a safer front expression until the front anchor is repaired."
      })
    );
  }
  if (suppressAggressiveYaw) {
    repairRecommendations.push(
      createRigRepairRecommendation({
        view,
        family: "protective_fallback",
        reasonCode: `yaw_suppressed:${view}`,
        priority: "medium",
        action: "protective-fallback",
        summary: `${view} yaw should stay conservative until anchor and landmark stability improves.`
      })
    );
  }
  if (lockMouthPreset) {
    repairRecommendations.push(
      createRigRepairRecommendation({
        view,
        family: "protective_fallback",
        reasonCode: "mouth_lock",
        priority: "medium",
        action: "protective-fallback",
        summary: "Keep the safer mouth preset locked until front-mouth stability improves."
      })
    );
  }
  const preferredAction: RigRepairAction | undefined =
    repairRecommendations.find((entry) => entry.action === "manual-compare")?.action ??
    repairRecommendations.find((entry) => entry.action === "regenerate-view")?.action ??
    repairRecommendations.find((entry) => entry.action === "protective-fallback")?.action;

  return {
    anchorConfidence: typeof anchorConfidence === "number" ? Number(anchorConfidence.toFixed(4)) : null,
    landmarkConsistency:
      typeof landmarkConsistency === "number" ? Number(landmarkConsistency.toFixed(4)) : null,
    lowAnchorConfidence,
    hardLowAnchorConfidence,
    lowLandmarkConsistency,
    hardLowLandmarkConsistency,
    safeFrontExpression,
    suppressAggressiveYaw,
    lockMouthPreset,
    reasonCodes,
    reasonFamilies: [...reasonFamilies],
    repairRecommendations,
    ...(preferredAction ? { preferredAction } : {})
  };
}

function assessRigStability(input: {
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  packCoherence?: PackCoherenceDiagnostics;
  targetStyle?: string;
  speciesId?: string;
  autoReroute?: AutoRerouteDiagnostics;
}): RigStabilityDiagnostics {
  if (!isMascotTargetStyle(input.targetStyle)) {
    return {
      severity: "none",
      summary: "rig stability clear",
      reasonCodes: [],
      fallbackReasonCodes: [],
      warningViews: [],
      blockingViews: [],
      reviewOnly: false,
      safeFrontExpression: false,
      suppressAggressiveYaw: false,
      lockMouthPreset: false,
      anchorConfidenceOverall: null,
      anchorConfidenceByView: {},
      landmarkConsistencyByView: {},
      reasonFamilies: [],
      repairability: "none",
      repairRecommendations: [],
      repairPlanByView: {}
    };
  }

  const thresholds = resolveRigStabilityThresholds(input.speciesId);
  const warningViews = new Set<CharacterView>();
  const blockingViews = new Set<CharacterView>();
  const reasonCodes = new Set<string>();
  const fallbackReasonCodes = new Set<string>();
  const reasonFamilies = new Set<RigRepairReasonFamily>();
  const anchorConfidenceByView: Partial<Record<CharacterView, number | null>> = {};
  const landmarkConsistencyByView: Partial<Record<CharacterView, number | null>> = {};
  const repairRecommendations: RigRepairRecommendation[] = [];
  const repairPlanByView: Partial<Record<CharacterView, RigViewRepairPlan>> = {};
  let safeFrontExpression = false;
  let suppressAggressiveYaw = false;
  let lockMouthPreset = false;

  for (const view of CHARACTER_VIEWS) {
    const candidate = input.selectedByView[view];
    if (!candidate) {
      continue;
    }
    const snapshot = summarizeCandidateRigStability({
      candidate,
      speciesId: input.speciesId
    });
    const anchorConfidence =
      snapshot.anchorConfidence ??
      (view === "front"
        ? input.packCoherence?.metrics.frontAnchorScore ?? null
        : view === "threeQuarter"
          ? input.packCoherence?.metrics.threeQuarterGeometryCue ?? null
          : input.packCoherence?.metrics.profileGeometryCue ?? null);
    const landmarkConsistency =
      snapshot.landmarkConsistency ??
      (view === "threeQuarter"
        ? input.packCoherence?.metrics.threeQuarterConsistency ?? null
        : view === "profile"
          ? input.packCoherence?.metrics.profileConsistency ?? null
          : null);
    anchorConfidenceByView[view] = anchorConfidence;
    landmarkConsistencyByView[view] = landmarkConsistency;
    if (snapshot.lowAnchorConfidence || snapshot.lowLandmarkConsistency) {
      warningViews.add(view);
    }
    if (snapshot.hardLowAnchorConfidence || snapshot.hardLowLandmarkConsistency) {
      blockingViews.add(view);
    }
    if (snapshot.lowAnchorConfidence) {
      reasonCodes.add(`rig-anchor-review:${view}`);
    }
    if (snapshot.hardLowAnchorConfidence) {
      reasonCodes.add(`rig-anchor-block:${view}`);
    }
    if (snapshot.lowLandmarkConsistency) {
      reasonCodes.add(`rig-landmark-review:${view}`);
    }
    if (snapshot.hardLowLandmarkConsistency) {
      reasonCodes.add(`rig-landmark-block:${view}`);
    }
    for (const family of snapshot.reasonFamilies ?? []) {
      reasonFamilies.add(family);
    }
    if ((snapshot.repairRecommendations?.length ?? 0) > 0) {
      repairRecommendations.push(...(snapshot.repairRecommendations ?? []));
      const familyCodes = dedupeStrings((snapshot.reasonFamilies ?? []).map((family) => family));
      const anchorTargets = dedupeStrings(
        (snapshot.repairRecommendations ?? []).flatMap((entry) => entry.anchorTargets ?? [])
      ) as RigAnchorTarget[];
      const viewStatus: RigViewRepairPlan["status"] =
        snapshot.hardLowAnchorConfidence || snapshot.hardLowLandmarkConsistency
          ? "block"
          : snapshot.lowAnchorConfidence || snapshot.lowLandmarkConsistency
            ? "review"
            : "ok";
      const preferredAction =
        snapshot.preferredAction ??
        snapshot.repairRecommendations?.find((entry) => entry.action === "manual-compare")?.action ??
        snapshot.repairRecommendations?.find((entry) => entry.action === "regenerate-view")?.action ??
        snapshot.repairRecommendations?.find((entry) => entry.action === "protective-fallback")?.action;
      repairPlanByView[view] = {
        status: viewStatus,
        familyCodes: familyCodes as RigRepairReasonFamily[],
        anchorTargets,
        ...(preferredAction ? { preferredAction } : {}),
        recommendations: snapshot.repairRecommendations ?? []
      };
    }
    safeFrontExpression = safeFrontExpression || snapshot.safeFrontExpression;
    suppressAggressiveYaw = suppressAggressiveYaw || snapshot.suppressAggressiveYaw;
    lockMouthPreset = lockMouthPreset || snapshot.lockMouthPreset;
  }

  const anchorConfidenceOverall =
    averageFiniteNumbers(
      CHARACTER_VIEWS.map((view) => anchorConfidenceByView[view] ?? null)
    ) ?? null;
  if (typeof anchorConfidenceOverall === "number") {
    if (anchorConfidenceOverall < thresholds.overallAnchorSoftFloor) {
      reasonCodes.add("rig-anchor-overall-review");
    }
    if (anchorConfidenceOverall < thresholds.overallAnchorHardFloor) {
      reasonCodes.add("rig-anchor-overall-block");
    }
  }

  const reviewOnly = warningViews.size > 0 || blockingViews.size > 0;
  if (reviewOnly) {
    fallbackReasonCodes.add("review_only");
  }
  if (safeFrontExpression) {
    fallbackReasonCodes.add("safe_front_expression");
  }
  if (suppressAggressiveYaw) {
    fallbackReasonCodes.add("suppress_aggressive_yaw");
  }
  if (lockMouthPreset) {
    fallbackReasonCodes.add("lock_mouth_preset");
  }

  const autoRerouteFailed = input.autoReroute?.attempted === true && input.autoReroute.recovered === false;
  const compoundedFrontRisk =
    blockingViews.has("front") &&
    (autoRerouteFailed ||
      input.packCoherence?.severity === "block" ||
      (input.selectedByView.front?.warnings.includes("runtime_fallback_used") ?? false) ||
      (input.selectedByView.front?.warnings.includes("runtime_route_degraded") ?? false));
  const compoundedPackRisk =
    blockingViews.size >= 2 ||
    (blockingViews.size >= 1 && warningViews.size >= 2) ||
    (typeof anchorConfidenceOverall === "number" && anchorConfidenceOverall < thresholds.overallAnchorHardFloor);
  const severity: RigStabilityDiagnostics["severity"] =
    compoundedFrontRisk || compoundedPackRisk ? "block" : reviewOnly ? "review" : "none";
  if (severity !== "none") {
    reasonCodes.add(severity === "block" ? "rig-compounded" : "rig-review-only");
  }
  if (severity === "block") {
    fallbackReasonCodes.add("manual_compare");
    fallbackReasonCodes.add("recreate");
    reasonFamilies.add("recreate_required");
  } else if (reviewOnly) {
    fallbackReasonCodes.add("manual_compare");
  }
  if (severity === "block") {
    for (const view of [...blockingViews]) {
      repairRecommendations.push(
        createRigRepairRecommendation({
          view,
          family: "recreate_required",
          reasonCode: `recreate_required:${view}`,
          priority: "high",
          action: "recreate-pack",
          summary:
            view === "front" || blockingViews.size >= 2
              ? "Rig failures are compounded enough that recreating the pack is safer than approving the current selection."
              : `${view} is still too unstable and should stay in compare until the pack is recreated or fully repaired.`
        })
      );
    }
  }
  for (const view of [...warningViews].filter((entry) => !blockingViews.has(entry))) {
    if (!repairPlanByView[view] && reviewOnly) {
      repairPlanByView[view] = {
        status: "review",
        familyCodes: [],
        anchorTargets: [],
        preferredAction: "manual-compare",
        recommendations: []
      };
    }
  }
  const repairability = summarizeRigRepairability({
    severity,
    blockingViews: [...blockingViews],
    warningViews: [...warningViews].filter((view) => !blockingViews.has(view)),
    repairRecommendations,
    anchorConfidenceOverall,
    overallAnchorHardFloor: thresholds.overallAnchorHardFloor
  });

  return {
    severity,
    summary:
      severity === "none"
        ? "rig stability clear"
        : `${severity}:anchors=${[...warningViews].join(",") || "none"}; fallbacks=${[...fallbackReasonCodes].join(",")}`,
    reasonCodes: [...reasonCodes],
    fallbackReasonCodes: [...fallbackReasonCodes],
    warningViews: [...warningViews].filter((view) => !blockingViews.has(view)),
    blockingViews: [...blockingViews],
    reviewOnly,
    safeFrontExpression,
    suppressAggressiveYaw,
    lockMouthPreset,
    anchorConfidenceOverall:
      typeof anchorConfidenceOverall === "number" ? Number(anchorConfidenceOverall.toFixed(4)) : null,
    anchorConfidenceByView,
    landmarkConsistencyByView,
    reasonFamilies: [...reasonFamilies],
    repairability,
    repairRecommendations: dedupeStrings(
      repairRecommendations.map((entry) =>
        stableStringify({
          view: entry.view,
          family: entry.family,
          action: entry.action,
          priority: entry.priority,
          reasonCode: entry.reasonCode,
          summary: entry.summary,
          repairable: entry.repairable,
          anchorTargets: entry.anchorTargets ?? []
        })
      )
    ).map((entry) => JSON.parse(entry) as RigRepairRecommendation),
    repairPlanByView,
    ...(severity === "block"
      ? { suggestedAction: "recreate" as const }
      : reviewOnly
        ? { suggestedAction: "pick-manually" as const }
        : {})
  };
}

function resolveMascotSelectionRiskThresholds(speciesId?: string) {
  const profile = resolveMascotSpeciesProfile(speciesId);
  const qc = profile.qcThresholds;
  const frontStyleSoftFloor = profile.id === "wolf" ? 0.44 : profile.id === "dog" ? 0.45 : 0.46;
  const frontSpeciesSoftFloor = profile.id === "wolf" ? 0.3 : profile.id === "dog" ? 0.32 : 0.34;
  return {
    frontAnchorScoreSoftFloor: clamp01(Math.max(0.64, qc.frontMasterMinScore + 0.08)),
    frontSymmetrySoftFloor: clamp01(Math.max(0.42, qc.minFrontSymmetryScore - 0.02)),
    frontHeadSquarenessSoftFloor: clamp01(Math.max(0.18, qc.frontMasterMinHeadSquarenessScore + 0.04)),
    frontStyleSoftFloor: clamp01(Math.max(frontStyleSoftFloor, qc.frontMasterMinStyleScore + 0.08)),
    frontSpeciesSoftFloor: clamp01(Math.max(frontSpeciesSoftFloor, qc.frontMasterMinSpeciesScore + 0.08)),
    threeQuarterGeometrySoftFloor: clamp01(Math.max(0.3, (qc.minGeometryCueByView.threeQuarter ?? 0.4) - 0.02)),
    profileGeometrySoftFloor: clamp01(Math.max(0.26, (qc.minGeometryCueByView.profile ?? 0.34) - 0.02)),
    threeQuarterConsistencySoftFloor: clamp01(Math.max(0.44, (qc.minConsistencyByView.threeQuarter ?? 0.48) + 0.04)),
    profileConsistencySoftFloor: clamp01(Math.max(0.4, (qc.minConsistencyByView.profile ?? 0.4) + 0.05)),
    speciesSpreadSoftCeiling: clamp01(Math.max(0.12, qc.maxSpeciesSpread - 0.04)),
    styleSpreadSoftCeiling: clamp01(Math.max(0.1, qc.maxStyleSpread - 0.04)),
    headRatioSpreadSoftCeiling: clamp01(Math.max(0.08, qc.maxHeadRatioSpread - 0.04)),
    monochromeSpreadSoftCeiling: clamp01(Math.max(0.1, qc.maxMonochromeSpread - 0.06)),
    earCueSpreadSoftCeiling: clamp01(Math.max(0.16, qc.maxEarCueSpread - 0.06)),
    muzzleCueSpreadSoftCeiling: clamp01(Math.max(0.16, qc.maxMuzzleCueSpread - 0.05)),
    headShapeCueSpreadSoftCeiling: clamp01(Math.max(0.16, qc.maxHeadShapeCueSpread - 0.05)),
    silhouetteCueSpreadSoftCeiling: clamp01(Math.max(0.16, qc.maxSilhouetteCueSpread - 0.06))
  };
}

export function isStrongFrontMasterCandidate(
  candidate: ScoredCandidate | undefined,
  targetStyle: string | undefined,
  acceptedScoreThreshold: number,
  speciesId?: string
): boolean {
  if (!candidate || candidate.candidate.view !== "front") {
    return false;
  }
  const mascotSpecies = normalizeGenerationSpecies(speciesId);
  const profileThresholds = resolveMascotQcThresholds(speciesId);
  const minimumFrontScore = Math.max(acceptedScoreThreshold, profileThresholds.frontMasterMinScore);
  if (candidate.rejections.length > 0 || candidate.score < minimumFrontScore) {
    return false;
  }
  if (!isMascotTargetStyle(targetStyle)) {
    return true;
  }

  const dogFrontSupportStrong =
    mascotSpecies !== "dog" ||
    ((candidate.breakdown.speciesEarScore ?? 0) >= 0.12 && (candidate.breakdown.handRegionDensityScore ?? 0) >= 0.12);
  const wolfFrontSupportStrong =
    mascotSpecies !== "wolf" ||
    ((candidate.breakdown.speciesEarScore ?? 0) >= 0.1 &&
      (
        (candidate.breakdown.speciesHeadShapeScore ?? 0) >= 0.18 ||
        (
          (candidate.breakdown.speciesScore ?? 0) >= 0.5 &&
          (candidate.breakdown.targetStyleScore ?? 0) >= 0.82 &&
          Math.max(candidate.breakdown.speciesMuzzleScore ?? 0, candidate.breakdown.speciesSilhouetteScore ?? 0) >= 0.34
        )
      ));

  return (
    (candidate.breakdown.frontSymmetryScore ?? 0) >= profileThresholds.minFrontSymmetryScore &&
    (candidate.breakdown.headSquarenessScore ?? 0) >= profileThresholds.frontMasterMinHeadSquarenessScore &&
    (candidate.breakdown.speciesScore ?? 0) >= profileThresholds.frontMasterMinSpeciesScore &&
    (candidate.breakdown.targetStyleScore ?? 0) >= profileThresholds.frontMasterMinStyleScore &&
    dogFrontSupportStrong &&
    wolfFrontSupportStrong
  );
}

function summarizeRetryGateDiagnosticsByView(input: {
  views: CharacterView[];
  bestByView: Partial<Record<CharacterView, ScoredCandidate>>;
  targetStyle?: string;
  acceptedScoreThreshold: number;
  speciesId?: string;
}): Partial<Record<CharacterView, Record<string, unknown>>> {
  const round = (value: number | null | undefined): number | null =>
    typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(4)) : null;
  return Object.fromEntries(
    input.views.map((view) => {
      const candidate = input.bestByView[view];
      if (!candidate) {
        return [view, { missingCandidate: true }];
      }
      const strongFrontGate =
        view !== "front"
          ? true
          : isStrongFrontMasterCandidate(
              candidate,
              input.targetStyle,
              input.acceptedScoreThreshold,
              input.speciesId
            );
      return [
        view,
        {
          candidateId: candidate.candidate.id,
          score: round(candidate.score),
          warnings: [...candidate.warnings],
          rejections: [...candidate.rejections],
          strongFrontGate,
          consistencyRecoveryIssue: hasBlockingConsistencyRecoveryIssue(candidate, input.speciesId),
          breakdown: {
            frontSymmetryScore: round(candidate.breakdown.frontSymmetryScore),
            headSquarenessScore: round(candidate.breakdown.headSquarenessScore),
            speciesScore: round(candidate.breakdown.speciesScore),
            targetStyleScore: round(candidate.breakdown.targetStyleScore),
            speciesEarScore: round(candidate.breakdown.speciesEarScore),
            speciesMuzzleScore: round(candidate.breakdown.speciesMuzzleScore),
            speciesHeadShapeScore: round(candidate.breakdown.speciesHeadShapeScore),
            speciesSilhouetteScore: round(candidate.breakdown.speciesSilhouetteScore),
            handRegionDensityScore: round(candidate.breakdown.handRegionDensityScore),
            subjectFillRatio: round(candidate.breakdown.subjectFillRatio),
            subjectIsolationScore: round(candidate.breakdown.subjectIsolationScore),
            largestComponentShare: round(candidate.breakdown.largestComponentShare),
            significantComponentCount:
              typeof candidate.breakdown.significantComponentCount === "number"
                ? candidate.breakdown.significantComponentCount
                : null,
            dogFrontReadabilityScore: round(candidate.breakdown.dogFrontReadabilityScore)
          }
        }
      ];
    })
  ) as Partial<Record<CharacterView, Record<string, unknown>>>;
}

function evaluatePackCoherenceIssues(input: {
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  targetStyle?: string;
  acceptedScoreThreshold: number;
  speciesId?: string;
}): string[] {
  return buildPackCoherenceDiagnostics(input).issues;
}

function buildPackCoherenceDiagnostics(input: {
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  targetStyle?: string;
  acceptedScoreThreshold: number;
  speciesId?: string;
}): PackCoherenceDiagnostics {
  if (!isMascotTargetStyle(input.targetStyle)) {
    return {
      issues: [],
      severity: "none",
      score: 1,
      blockingViews: [],
      warningViews: [],
      metrics: {
        frontAnchorScore: null,
        frontSymmetryScore: null,
        frontHeadSquarenessScore: null,
        frontStyleScore: null,
        frontSpeciesScore: null,
        threeQuarterGeometryCue: null,
        profileGeometryCue: null,
        threeQuarterConsistency: null,
        profileConsistency: null,
        speciesSpread: null,
        styleSpread: null,
        headRatioSpread: null,
        monochromeSpread: null,
        earCueSpread: null,
        muzzleCueSpread: null,
        headShapeCueSpread: null,
        silhouetteCueSpread: null
      }
    };
  }

  const issues: string[] = [];
  const profileThresholds = resolveMascotQcThresholds(input.speciesId);
  const blockingViews = new Set<CharacterView>();
  const warningViews = new Set<CharacterView>();
  const front = input.selectedByView.front;
  const threeQuarter = input.selectedByView.threeQuarter;
  const profile = input.selectedByView.profile;
  const addIssue = (issue: string, options?: { blockView?: CharacterView; warnView?: CharacterView }) => {
    issues.push(issue);
    if (options?.blockView) {
      blockingViews.add(options.blockView);
    }
    if (options?.warnView) {
      warningViews.add(options.warnView);
    }
  };
  const roundMetric = (value: number | null | undefined): number | null =>
    typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(4)) : null;
  const addIssueForViews = (
    issue: string,
    views: CharacterView[],
    severity: "warn" | "block"
  ) => {
    const uniqueViews = dedupeCharacterViews(views);
    if (uniqueViews.length === 0) {
      addIssue(issue);
      return;
    }
    for (const [index, view] of uniqueViews.entries()) {
      addIssue(issue, index === 0 ? (severity === "block" ? { blockView: view } : { warnView: view }) : severity === "block" ? { blockView: view } : { warnView: view });
    }
  };

  const frontAnchorScore =
    front
      ? clamp01(
          (front.score ?? 0) * 0.28 +
            (front.breakdown.frontSymmetryScore ?? 0) * 0.24 +
            (front.breakdown.headSquarenessScore ?? 0) * 0.16 +
            (front.breakdown.speciesScore ?? 0) * 0.16 +
            (front.breakdown.targetStyleScore ?? 0) * 0.16
        )
      : null;
  const frontSymmetryScore = typeof front?.breakdown.frontSymmetryScore === "number" ? front.breakdown.frontSymmetryScore : null;
  const frontHeadSquarenessScore =
    typeof front?.breakdown.headSquarenessScore === "number" ? front.breakdown.headSquarenessScore : null;
  const threeQuarterGeometryCue = computeMascotGeometryCue(threeQuarter);
  const profileGeometryCue = computeMascotGeometryCue(profile);
  const speciesSpread = computeMetricSpread([
    front?.breakdown.speciesScore,
    threeQuarter?.breakdown.speciesScore,
    profile?.breakdown.speciesScore
  ]);
  const styleSpread = computeMetricSpread([
    front?.breakdown.targetStyleScore,
    threeQuarter?.breakdown.targetStyleScore,
    profile?.breakdown.targetStyleScore
  ]);
  const headRatioSpread = computeMetricSpread([
    front?.breakdown.headRatioScore,
    threeQuarter?.breakdown.headRatioScore,
    profile?.breakdown.headRatioScore
  ]);
  const monochromeSpread = computeMetricSpread([
    front?.breakdown.monochromeScore,
    threeQuarter?.breakdown.monochromeScore,
    profile?.breakdown.monochromeScore
  ]);
  const earCueSpread = computeMetricSpread([
    front?.breakdown.speciesEarScore,
    threeQuarter?.breakdown.speciesEarScore,
    profile?.breakdown.speciesEarScore
  ]);
  const muzzleCueSpread = computeMetricSpread([
    front?.breakdown.speciesMuzzleScore,
    threeQuarter?.breakdown.speciesMuzzleScore,
    profile?.breakdown.speciesMuzzleScore
  ]);
  const headShapeCueSpread = computeMetricSpread([
    front?.breakdown.speciesHeadShapeScore,
    threeQuarter?.breakdown.speciesHeadShapeScore,
    profile?.breakdown.speciesHeadShapeScore
  ]);
  const silhouetteCueSpread = computeMetricSpread([
    front?.breakdown.speciesSilhouetteScore,
    threeQuarter?.breakdown.speciesSilhouetteScore,
    profile?.breakdown.speciesSilhouetteScore
  ]);

  if (!isStrongFrontMasterCandidate(front, input.targetStyle, input.acceptedScoreThreshold, input.speciesId)) {
    addIssue("front_master_not_strong_enough", { blockView: "front" });
  }

  if (frontSymmetryScore !== null && frontSymmetryScore < profileThresholds.minFrontSymmetryScore) {
    addIssue("front_symmetry_floor_low", {
      ...(frontSymmetryScore < profileThresholds.minFrontSymmetryScore - 0.08 ? { blockView: "front" } : { warnView: "front" })
    });
  }

  if (
    frontHeadSquarenessScore !== null &&
    frontHeadSquarenessScore < profileThresholds.frontMasterMinHeadSquarenessScore
  ) {
    addIssue("front_head_shape_floor_low", {
      ...(frontHeadSquarenessScore < profileThresholds.frontMasterMinHeadSquarenessScore - 0.08
        ? { blockView: "front" }
        : { warnView: "front" })
    });
  }

  if (
    typeof front?.breakdown.targetStyleScore === "number" &&
    front.breakdown.targetStyleScore < profileThresholds.frontMasterMinStyleScore + 0.04
  ) {
    addIssue("front_style_floor_low", { warnView: "front" });
  }

  if (
    typeof front?.breakdown.speciesScore === "number" &&
    front.breakdown.speciesScore < profileThresholds.frontMasterMinSpeciesScore + 0.04
  ) {
    addIssue("front_species_floor_low", { blockView: "front" });
  }

  for (const [view, candidate] of [
    ["threeQuarter", threeQuarter],
    ["profile", profile]
  ] as Array<[CharacterView, ScoredCandidate | undefined]>) {
    if (!candidate) {
      continue;
    }
    const consistencyFloor = profileThresholds.minConsistencyByView[view] ?? (view === "profile" ? 0.4 : 0.48);
    const geometryFloor = profileThresholds.minGeometryCueByView[view] ?? (view === "profile" ? 0.34 : 0.4);
    const geometryCue = view === "profile" ? profileGeometryCue : threeQuarterGeometryCue;
    if ((candidate.consistencyScore ?? 0) < consistencyFloor) {
      addIssue(`${view}_consistency_floor_low`, {
        ...(candidate.consistencyScore !== null && candidate.consistencyScore < consistencyFloor - 0.08
          ? { blockView: view }
          : { warnView: view })
      });
    }
    if (typeof geometryCue === "number" && geometryCue < geometryFloor) {
      addIssue(`${view}_geometry_floor_low`, {
        ...(geometryCue < geometryFloor - 0.08 ? { blockView: view } : { warnView: view })
      });
    }
    if (candidate.warnings.includes("consistency_shape_drift")) {
      addIssue(`${view}_shape_drift`, { warnView: view });
    }
    if (candidate.warnings.includes("consistency_style_drift")) {
      addIssue(`${view}_style_drift`, { warnView: view });
    }
  }

  if (speciesSpread !== null && speciesSpread > profileThresholds.maxSpeciesSpread) {
    addIssue("species_score_spread_too_wide", {
      ...(speciesSpread > profileThresholds.maxSpeciesSpread + 0.06 ? { blockView: "front" } : { warnView: "front" })
    });
  }

  if (styleSpread !== null && styleSpread > profileThresholds.maxStyleSpread) {
    addIssue("style_score_spread_too_wide", {
      ...(styleSpread > profileThresholds.maxStyleSpread + 0.06 ? { blockView: "front" } : { warnView: "front" })
    });
  }

  if (headRatioSpread !== null && headRatioSpread > profileThresholds.maxHeadRatioSpread) {
    addIssue("head_ratio_spread_too_wide", {
      ...(headRatioSpread > profileThresholds.maxHeadRatioSpread + 0.05 ? { blockView: "front" } : { warnView: "front" })
    });
  }

  if (monochromeSpread !== null && monochromeSpread > profileThresholds.maxMonochromeSpread) {
    addIssue("monochrome_spread_too_wide", {
      ...(monochromeSpread > profileThresholds.maxMonochromeSpread + 0.06 ? { blockView: "front" } : { warnView: "front" })
    });
  }
  const presentSideViews = (["threeQuarter", "profile"] as const).filter((view) => Boolean(input.selectedByView[view]));

  if (earCueSpread !== null && earCueSpread > profileThresholds.maxEarCueSpread) {
    addIssueForViews(
      "ear_cue_spread_too_wide",
      [...presentSideViews],
      earCueSpread > profileThresholds.maxEarCueSpread + 0.06 ? "block" : "warn"
    );
  }

  if (muzzleCueSpread !== null && muzzleCueSpread > profileThresholds.maxMuzzleCueSpread) {
    addIssueForViews(
      "muzzle_cue_spread_too_wide",
      [...presentSideViews],
      muzzleCueSpread > profileThresholds.maxMuzzleCueSpread + 0.06 ? "block" : "warn"
    );
  }

  if (headShapeCueSpread !== null && headShapeCueSpread > profileThresholds.maxHeadShapeCueSpread) {
    addIssueForViews(
      "head_shape_cue_spread_too_wide",
      [...presentSideViews],
      headShapeCueSpread > profileThresholds.maxHeadShapeCueSpread + 0.06 ? "block" : "warn"
    );
  }

  if (silhouetteCueSpread !== null && silhouetteCueSpread > profileThresholds.maxSilhouetteCueSpread) {
    addIssueForViews(
      "silhouette_cue_spread_too_wide",
      [...presentSideViews],
      silhouetteCueSpread > profileThresholds.maxSilhouetteCueSpread + 0.06 ? "block" : "warn"
    );
  }

  const uniqueIssues = [...new Set(issues)];
  let score = 1;
  if (!front || !isStrongFrontMasterCandidate(front, input.targetStyle, input.acceptedScoreThreshold, input.speciesId)) {
    score -= 0.28;
  }
  const threeQuarterConsistencyFloor = profileThresholds.minConsistencyByView.threeQuarter ?? 0.48;
  const profileConsistencyFloor = profileThresholds.minConsistencyByView.profile ?? 0.4;
  if (
    typeof threeQuarter?.consistencyScore === "number" &&
    threeQuarter.consistencyScore < threeQuarterConsistencyFloor
  ) {
    score -= threeQuarter.consistencyScore < threeQuarterConsistencyFloor - 0.08 ? 0.16 : 0.1;
  }
  if (typeof profile?.consistencyScore === "number" && profile.consistencyScore < profileConsistencyFloor) {
    score -= profile.consistencyScore < profileConsistencyFloor - 0.08 ? 0.18 : 0.12;
  }
  if (frontSymmetryScore !== null && frontSymmetryScore < profileThresholds.minFrontSymmetryScore) {
    score -= frontSymmetryScore < profileThresholds.minFrontSymmetryScore - 0.08 ? 0.14 : 0.08;
  }
  if (
    frontHeadSquarenessScore !== null &&
    frontHeadSquarenessScore < profileThresholds.frontMasterMinHeadSquarenessScore
  ) {
    score -=
      frontHeadSquarenessScore < profileThresholds.frontMasterMinHeadSquarenessScore - 0.08 ? 0.12 : 0.07;
  }
  const threeQuarterGeometryFloor = profileThresholds.minGeometryCueByView.threeQuarter ?? 0.4;
  const profileGeometryFloor = profileThresholds.minGeometryCueByView.profile ?? 0.34;
  if (typeof threeQuarterGeometryCue === "number" && threeQuarterGeometryCue < threeQuarterGeometryFloor) {
    score -= threeQuarterGeometryCue < threeQuarterGeometryFloor - 0.08 ? 0.12 : 0.08;
  }
  if (typeof profileGeometryCue === "number" && profileGeometryCue < profileGeometryFloor) {
    score -= profileGeometryCue < profileGeometryFloor - 0.08 ? 0.14 : 0.09;
  }
  score -= Math.min(0.18, Math.max(0, (speciesSpread ?? 0) - profileThresholds.maxSpeciesSpread) * 2.6);
  score -= Math.min(0.16, Math.max(0, (styleSpread ?? 0) - profileThresholds.maxStyleSpread) * 2.8);
  score -= Math.min(0.1, Math.max(0, (headRatioSpread ?? 0) - profileThresholds.maxHeadRatioSpread) * 2.4);
  score -= Math.min(0.08, Math.max(0, (monochromeSpread ?? 0) - profileThresholds.maxMonochromeSpread) * 2.2);
  score -= Math.min(0.08, Math.max(0, (earCueSpread ?? 0) - profileThresholds.maxEarCueSpread) * 1.8);
  score -= Math.min(0.1, Math.max(0, (muzzleCueSpread ?? 0) - profileThresholds.maxMuzzleCueSpread) * 2.1);
  score -= Math.min(0.08, Math.max(0, (headShapeCueSpread ?? 0) - profileThresholds.maxHeadShapeCueSpread) * 1.9);
  score -= Math.min(0.08, Math.max(0, (silhouetteCueSpread ?? 0) - profileThresholds.maxSilhouetteCueSpread) * 1.8);
  const normalizedScore = clamp01(score);
  const severity =
    blockingViews.size > 0 || normalizedScore < 0.62
      ? "block"
      : uniqueIssues.length > 0
        ? "review"
        : "none";

  return {
    issues: uniqueIssues,
    severity,
    score: Number(normalizedScore.toFixed(4)),
    blockingViews: [...blockingViews],
    warningViews: [...warningViews].filter((view) => !blockingViews.has(view)),
    metrics: {
      frontAnchorScore: roundMetric(frontAnchorScore),
      frontSymmetryScore: roundMetric(frontSymmetryScore),
      frontHeadSquarenessScore: roundMetric(frontHeadSquarenessScore),
      frontStyleScore: roundMetric(front?.breakdown.targetStyleScore),
      frontSpeciesScore: roundMetric(front?.breakdown.speciesScore),
      threeQuarterGeometryCue: roundMetric(threeQuarterGeometryCue),
      profileGeometryCue: roundMetric(profileGeometryCue),
      threeQuarterConsistency: roundMetric(threeQuarter?.consistencyScore),
      profileConsistency: roundMetric(profile?.consistencyScore),
      speciesSpread: roundMetric(speciesSpread),
      styleSpread: roundMetric(styleSpread),
      headRatioSpread: roundMetric(headRatioSpread),
      monochromeSpread: roundMetric(monochromeSpread),
      earCueSpread: roundMetric(earCueSpread),
      muzzleCueSpread: roundMetric(muzzleCueSpread),
      headShapeCueSpread: roundMetric(headShapeCueSpread),
      silhouetteCueSpread: roundMetric(silhouetteCueSpread)
    }
  };
}

function dedupeCharacterViews(views: CharacterView[]): CharacterView[] {
  return [...new Set(views)];
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function summarizeSelectionRisk(assessment: SelectionRiskAssessment): string {
  if (assessment.level === "none" || assessment.reasonCodes.length === 0) {
    return "selection risk clear";
  }
  return `${assessment.level}:${assessment.reasonCodes.join(",")}`;
}

function summarizeQualityEmbargo(assessment: QualityEmbargoAssessment): string {
  if (assessment.level === "none" || assessment.reasonCodes.length === 0) {
    return "quality embargo clear";
  }
  return `${assessment.level}:${assessment.reasonCodes.join(",")}`;
}

function summarizeFinalQualityFirewall(assessment: FinalQualityFirewallAssessment): string {
  if (assessment.level === "none" || assessment.reasonCodes.length === 0) {
    return "final quality firewall clear";
  }
  return `${assessment.level}:${assessment.reasonCodes.join(",")}`;
}

function deriveRecoveredViews(autoReroute: AutoRerouteDiagnostics | undefined): CharacterView[] {
  if (!autoReroute?.viewDeltaByView) {
    return [];
  }
  return (Object.entries(autoReroute.viewDeltaByView) as Array<[CharacterView, AutoRerouteViewDelta]>)
    .filter(([, delta]) => {
      if (typeof delta.scoreDelta === "number" && delta.scoreDelta > 0.015) {
        return true;
      }
      if (typeof delta.warningDelta === "number" && delta.warningDelta < 0) {
        return true;
      }
      if (typeof delta.rejectionDelta === "number" && delta.rejectionDelta < 0) {
        return true;
      }
      if (typeof delta.consistencyDelta === "number" && delta.consistencyDelta > 0.02) {
        return true;
      }
      return Boolean(delta.beforeCandidateId && delta.afterCandidateId && delta.beforeCandidateId !== delta.afterCandidateId);
    })
    .map(([view]) => view);
}

function buildSelectionDecisionOutcome(input: {
  kind: SelectionDecisionOutcome["kind"];
  sourceStage: string | undefined;
  missingGeneratedViews: CharacterView[];
  lowQualityGeneratedViews: CharacterView[];
  selectedByView?: Partial<Record<CharacterView, ScoredCandidate>>;
  packCoherence: PackCoherenceDiagnostics | undefined;
  autoReroute: AutoRerouteDiagnostics | undefined;
  targetStyle?: string;
  acceptedScoreThreshold: number;
  rigStability?: RigStabilityDiagnostics;
  selectionRisk?: SelectionRiskAssessment;
  qualityEmbargo?: QualityEmbargoAssessment;
  finalQualityFirewall?: FinalQualityFirewallAssessment;
  referenceBankReviewOnly?: boolean;
  referenceBankHandoff?: string;
}): SelectionDecisionOutcome {
  const reasonCodes: string[] = [];
  if (input.missingGeneratedViews.length > 0) {
    reasonCodes.push(...input.missingGeneratedViews.map((view) => `missing:${view}`));
  }
  if (input.lowQualityGeneratedViews.length > 0) {
    reasonCodes.push(...input.lowQualityGeneratedViews.map((view) => `low-quality:${view}`));
  }
  if (input.packCoherence?.severity === "block") {
    reasonCodes.push("coherence:block");
  } else if (input.packCoherence?.severity === "review") {
    reasonCodes.push("coherence:review");
  }
  if (input.selectionRisk?.level && input.selectionRisk.level !== "none") {
    reasonCodes.push(`selection-risk:${input.selectionRisk.level}`);
    reasonCodes.push(...input.selectionRisk.reasonCodes.map((reason) => `risk:${reason}`));
  }
  if (input.rigStability?.severity && input.rigStability.severity !== "none") {
    reasonCodes.push(`rig-stability:${input.rigStability.severity}`);
    reasonCodes.push(...input.rigStability.reasonCodes.map((reason) => `rig:${reason}`));
    reasonCodes.push(...input.rigStability.fallbackReasonCodes.map((reason) => `rig-fallback:${reason}`));
    reasonCodes.push(...(input.rigStability.reasonFamilies ?? []).map((family) => `rig-family:${family}`));
    if (input.rigStability.repairability && input.rigStability.repairability !== "none") {
      reasonCodes.push(`rig-repairability:${input.rigStability.repairability}`);
    }
  }
  if (input.qualityEmbargo?.level && input.qualityEmbargo.level !== "none") {
    reasonCodes.push(`quality-embargo:${input.qualityEmbargo.level}`);
    reasonCodes.push(...input.qualityEmbargo.reasonCodes.map((reason) => `embargo:${reason}`));
  }
  if (input.finalQualityFirewall?.level && input.finalQualityFirewall.level !== "none") {
    reasonCodes.push(`final-firewall:${input.finalQualityFirewall.level}`);
    reasonCodes.push(...input.finalQualityFirewall.reasonCodes.map((reason) => `firewall:${reason}`));
  }
  if (input.autoReroute?.attempted) {
    reasonCodes.push(`auto-reroute:${input.autoReroute.recovered ? "recovered" : "failed"}`);
  }
  if (input.referenceBankReviewOnly) {
    reasonCodes.push("reference-bank:review-only");
    if (input.referenceBankHandoff) {
      reasonCodes.push(`reference-bank-handoff:${input.referenceBankHandoff}`);
    }
  }

  const blocked =
    input.rigStability?.severity === "block" ||
    input.packCoherence?.severity === "block" ||
    input.selectionRisk?.level === "block" ||
    input.qualityEmbargo?.level === "block" ||
    input.finalQualityFirewall?.level === "block";
  const review =
    blocked ||
    input.referenceBankReviewOnly === true ||
    input.rigStability?.reviewOnly === true ||
    input.missingGeneratedViews.length > 0 ||
    input.lowQualityGeneratedViews.length > 0 ||
    input.packCoherence?.severity === "review" ||
    input.selectionRisk?.level === "review" ||
    input.qualityEmbargo?.level === "review" ||
    input.finalQualityFirewall?.level === "review";
  const status: SelectionDecisionOutcome["status"] = blocked ? "blocked" : review ? "review" : "ok";
  const recoveredViews = deriveRecoveredViews(input.autoReroute);
  const worstRuntimeBucket = resolveWorstRuntimeBucketLevel(
    Object.values(input.selectedByView ?? {}).map(
      (candidate) =>
        classifyCandidateRuntimeBucket({
          candidate,
          targetStyle: input.targetStyle
        }).level
    )
  );

  let summary = "pack auto-selected";
  if (input.kind === "hitl_selected") {
    summary = "pack accepted after manual selection";
  } else if (blocked) {
    summary =
      input.finalQualityFirewall?.level === "block"
        ? `blocked by final quality firewall: ${summarizeFinalQualityFirewall(input.finalQualityFirewall)}`
        : input.qualityEmbargo?.level === "block"
        ? `blocked by quality embargo: ${summarizeQualityEmbargo(input.qualityEmbargo)}`
        : input.rigStability?.severity === "block"
        ? `blocked by rig stability: ${input.rigStability.summary}`
        : input.selectionRisk?.level === "block"
        ? `blocked by selection risk: ${summarizeSelectionRisk(input.selectionRisk)}`
        : `blocked by pack coherence: ${input.packCoherence?.issues.join(", ") || "unknown"}`;
  } else if (review) {
    summary =
      input.referenceBankReviewOnly
        ? "manual review required: mascot reference bank is scaffold-only"
        : input.rigStability?.reviewOnly
        ? `manual review required: ${input.rigStability.summary}`
        : input.finalQualityFirewall?.level === "review"
        ? `manual review required: ${summarizeFinalQualityFirewall(input.finalQualityFirewall)}`
        : input.qualityEmbargo?.level === "review"
        ? `manual review required: ${summarizeQualityEmbargo(input.qualityEmbargo)}`
        : input.selectionRisk?.level === "review"
        ? `manual review required: ${summarizeSelectionRisk(input.selectionRisk)}`
        : input.packCoherence?.severity === "review"
          ? `manual review required: ${input.packCoherence.issues.join(", ") || "review"}`
          : "manual review required";
  }

  return {
    kind: input.kind,
    status,
    ...(input.sourceStage ? { sourceStage: input.sourceStage } : {}),
    summary,
    reasonCodes: dedupeStrings(reasonCodes),
    recoveryAttempted: input.autoReroute?.attempted === true,
    ...(recoveredViews.length > 0 ? { recoveredViews } : {}),
    ...(worstRuntimeBucket ? { worstRuntimeBucket } : {}),
    ...(input.finalQualityFirewall?.suggestedAction
      ? { escalatedAction: input.finalQualityFirewall.suggestedAction }
      : input.qualityEmbargo?.suggestedAction
        ? { escalatedAction: input.qualityEmbargo.suggestedAction }
      : input.rigStability?.suggestedAction
        ? { escalatedAction: input.rigStability.suggestedAction }
      : input.selectionRisk?.suggestedAction
        ? { escalatedAction: input.selectionRisk.suggestedAction }
        : {})
  };
}

export function assessAutoSelectionRisk(input: {
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  packCoherence: PackCoherenceDiagnostics;
  rigStability?: RigStabilityDiagnostics;
  targetStyle?: string;
  acceptedScoreThreshold: number;
  speciesId?: string;
  autoReroute?: AutoRerouteDiagnostics;
}): SelectionRiskAssessment {
  if (!isMascotTargetStyle(input.targetStyle) || input.packCoherence.severity === "none") {
    return {
      level: "none",
      reasonCodes: [],
      summary: "selection risk clear"
    };
  }

  const reasons = new Set<SelectionRiskReason>();
  const selectionThresholds = resolveMascotSelectionRiskThresholds(input.speciesId);
  const referenceBankDiagnostics = summarizeMascotReferenceBankDiagnostics(input.speciesId);
  const front = input.selectedByView.front;
  const threeQuarter = input.selectedByView.threeQuarter;
  const profile = input.selectedByView.profile;
  const metrics = input.packCoherence.metrics;
  const frontSymmetryScore = metrics.frontSymmetryScore ?? front?.breakdown.frontSymmetryScore ?? 1;
  const frontHeadSquarenessScore = metrics.frontHeadSquarenessScore ?? front?.breakdown.headSquarenessScore ?? 1;
  const frontStyleScore = metrics.frontStyleScore ?? front?.breakdown.targetStyleScore ?? 1;
  const frontSpeciesScore = metrics.frontSpeciesScore ?? front?.breakdown.speciesScore ?? 1;
  const threeQuarterGeometryCue = metrics.threeQuarterGeometryCue ?? computeMascotGeometryCue(threeQuarter) ?? 1;
  const profileGeometryCue = metrics.profileGeometryCue ?? computeMascotGeometryCue(profile) ?? 1;
  const threeQuarterConsistency = metrics.threeQuarterConsistency ?? threeQuarter?.consistencyScore ?? 1;
  const profileConsistency = metrics.profileConsistency ?? profile?.consistencyScore ?? 1;
  const speciesSpread =
    metrics.speciesSpread ??
    computeMetricSpread([
      front?.breakdown.speciesScore,
      threeQuarter?.breakdown.speciesScore,
      profile?.breakdown.speciesScore
    ]);
  const styleSpread =
    metrics.styleSpread ??
    computeMetricSpread([
      front?.breakdown.targetStyleScore,
      threeQuarter?.breakdown.targetStyleScore,
      profile?.breakdown.targetStyleScore
    ]);
  const headRatioSpread =
    metrics.headRatioSpread ??
    computeMetricSpread([
      front?.breakdown.headRatioScore,
      threeQuarter?.breakdown.headRatioScore,
      profile?.breakdown.headRatioScore
    ]);
  const monochromeSpread =
    metrics.monochromeSpread ??
    computeMetricSpread([
      front?.breakdown.monochromeScore,
      threeQuarter?.breakdown.monochromeScore,
      profile?.breakdown.monochromeScore
    ]);
  const earCueSpread =
    metrics.earCueSpread ??
    computeMetricSpread([
      front?.breakdown.speciesEarScore,
      threeQuarter?.breakdown.speciesEarScore,
      profile?.breakdown.speciesEarScore
    ]);
  const muzzleCueSpread =
    metrics.muzzleCueSpread ??
    computeMetricSpread([
      front?.breakdown.speciesMuzzleScore,
      threeQuarter?.breakdown.speciesMuzzleScore,
      profile?.breakdown.speciesMuzzleScore
    ]);
  const headShapeCueSpread =
    metrics.headShapeCueSpread ??
    computeMetricSpread([
      front?.breakdown.speciesHeadShapeScore,
      threeQuarter?.breakdown.speciesHeadShapeScore,
      profile?.breakdown.speciesHeadShapeScore
    ]);
  const silhouetteCueSpread =
    metrics.silhouetteCueSpread ??
    computeMetricSpread([
      front?.breakdown.speciesSilhouetteScore,
      threeQuarter?.breakdown.speciesSilhouetteScore,
      profile?.breakdown.speciesSilhouetteScore
    ]);
  const totalWarnings = Object.values(input.selectedByView).reduce(
    (sum, candidate) => sum + (candidate?.warnings.length ?? 0),
    0
  );
  const totalRejections = Object.values(input.selectedByView).reduce(
    (sum, candidate) => sum + (candidate?.rejections.length ?? 0),
    0
  );
  const runtimeCriticalViews = CHARACTER_VIEWS.filter((view) => {
    const candidate = input.selectedByView[view];
    return (
      candidate?.rejections.includes("runtime_preflight_failed") ||
      candidate?.rejections.includes("runtime_structure_missing")
    );
  });
  const runtimeWarningViews = CHARACTER_VIEWS.filter((view) => {
    const candidate = input.selectedByView[view];
    return (candidate?.warnings.some((reason) => reason.startsWith("runtime_")) ?? false);
  });
  const runtimeFallbackViews = CHARACTER_VIEWS.filter((view) => {
    const candidate = input.selectedByView[view];
    return (
      candidate?.warnings.includes("runtime_fallback_used") ||
      candidate?.warnings.includes("runtime_route_degraded")
    );
  });
  const totalRuntimeWarnings = Object.values(input.selectedByView).reduce(
    (sum, candidate) => sum + (candidate?.warnings.filter((reason) => reason.startsWith("runtime_")).length ?? 0),
    0
  );

  if (!isStrongFrontMasterCandidate(front, input.targetStyle, input.acceptedScoreThreshold, input.speciesId)) {
    reasons.add("front_anchor_soft");
  }
  if ((metrics.frontAnchorScore ?? 1) < selectionThresholds.frontAnchorScoreSoftFloor) {
    reasons.add("front_anchor_soft");
  }
  if (
    frontSymmetryScore < selectionThresholds.frontSymmetrySoftFloor ||
    frontHeadSquarenessScore < selectionThresholds.frontHeadSquarenessSoftFloor
  ) {
    reasons.add("front_geometry_soft");
  }
  if (frontStyleScore < selectionThresholds.frontStyleSoftFloor) {
    reasons.add("front_style_soft");
  }
  if (frontSpeciesScore < selectionThresholds.frontSpeciesSoftFloor) {
    reasons.add("front_species_soft");
  }
  if (threeQuarterGeometryCue < selectionThresholds.threeQuarterGeometrySoftFloor) {
    reasons.add("three_quarter_geometry_soft");
  }
  if ((threeQuarter?.consistencyScore ?? 1) < selectionThresholds.threeQuarterConsistencySoftFloor || threeQuarterConsistency < selectionThresholds.threeQuarterConsistencySoftFloor) {
    reasons.add("three_quarter_consistency_soft");
  }
  if (profileGeometryCue < selectionThresholds.profileGeometrySoftFloor) {
    reasons.add("profile_geometry_soft");
  }
  if ((profile?.consistencyScore ?? 1) < selectionThresholds.profileConsistencySoftFloor || profileConsistency < selectionThresholds.profileConsistencySoftFloor) {
    reasons.add("profile_consistency_soft");
  }
  if (typeof speciesSpread === "number" && speciesSpread > selectionThresholds.speciesSpreadSoftCeiling) {
    reasons.add("species_spread_soft");
  }
  if (typeof styleSpread === "number" && styleSpread > selectionThresholds.styleSpreadSoftCeiling) {
    reasons.add("style_spread_soft");
  }
  if (typeof headRatioSpread === "number" && headRatioSpread > selectionThresholds.headRatioSpreadSoftCeiling) {
    reasons.add("head_ratio_spread_soft");
  }
  if (typeof monochromeSpread === "number" && monochromeSpread > selectionThresholds.monochromeSpreadSoftCeiling) {
    reasons.add("monochrome_spread_soft");
  }
  if (typeof earCueSpread === "number" && earCueSpread > selectionThresholds.earCueSpreadSoftCeiling) {
    reasons.add("ear_cue_spread_soft");
  }
  if (typeof muzzleCueSpread === "number" && muzzleCueSpread > selectionThresholds.muzzleCueSpreadSoftCeiling) {
    reasons.add("muzzle_cue_spread_soft");
  }
  if (typeof headShapeCueSpread === "number" && headShapeCueSpread > selectionThresholds.headShapeCueSpreadSoftCeiling) {
    reasons.add("head_shape_cue_spread_soft");
  }
  if (typeof silhouetteCueSpread === "number" && silhouetteCueSpread > selectionThresholds.silhouetteCueSpreadSoftCeiling) {
    reasons.add("silhouette_cue_spread_soft");
  }
  if (referenceBankDiagnostics.status === "scaffold_only") {
    reasons.add("reference_bank_scaffold_only");
  }
  if (totalWarnings >= 4 || Object.values(input.selectedByView).filter((candidate) => (candidate?.warnings.length ?? 0) > 0).length >= 2) {
    reasons.add("selected_warning_density_high");
  }
  if (totalRejections > 0) {
    reasons.add("selected_rejections_present");
  }
  if (input.autoReroute?.attempted && input.autoReroute.recovered === false) {
    reasons.add("auto_reroute_failed");
  }
  if (input.rigStability?.reviewOnly) {
    reasons.add("rig_review_only");
  }
  if (input.rigStability?.reasonCodes.some((reason) => reason.startsWith("rig-anchor-"))) {
    reasons.add("rig_anchor_confidence_soft");
  }
  if (input.rigStability?.reasonCodes.some((reason) => reason.startsWith("rig-landmark-"))) {
    reasons.add("rig_landmark_consistency_soft");
  }
  if (runtimeCriticalViews.length > 0 || runtimeWarningViews.length >= 2 || totalRuntimeWarnings >= 3) {
    reasons.add("runtime_quality_compounded");
  }
  if (runtimeFallbackViews.length > 0) {
    reasons.add("runtime_fallback_selected");
  }

  const reasonCodes = [...reasons];
  if (reasonCodes.length === 0) {
    return {
      level: "none",
      reasonCodes,
      summary: "selection risk clear"
    };
  }

  const frontRiskCount = reasonCodes.filter((reason) =>
    reason === "front_anchor_soft" ||
    reason === "front_geometry_soft" ||
    reason === "front_style_soft" ||
    reason === "front_species_soft"
  ).length;
  const spreadRiskCount = reasonCodes.filter((reason) => reason.endsWith("_spread_soft")).length;
  const runtimeCompoundedHard =
    runtimeCriticalViews.includes("front") || runtimeCriticalViews.length >= 2 || totalRuntimeWarnings >= 4;
  const block =
    input.rigStability?.severity === "block" ||
    reasonCodes.includes("selected_rejections_present") ||
    reasonCodes.includes("auto_reroute_failed") ||
    (reasonCodes.includes("runtime_quality_compounded") && runtimeCompoundedHard) ||
    (reasonCodes.includes("reference_bank_scaffold_only") &&
      (frontRiskCount >= 1 ||
        reasonCodes.includes("front_style_soft") ||
        reasonCodes.includes("front_species_soft") ||
        spreadRiskCount >= 1)) ||
    spreadRiskCount >= 3 ||
    (frontRiskCount >= 2 && spreadRiskCount >= 1) ||
    frontRiskCount >= 2 ||
    reasonCodes.length >= 4;

  const rigRequiresRecreate =
    input.rigStability?.repairability === "recreate" ||
    (input.rigStability?.reasonFamilies ?? []).includes("recreate_required");

  return {
    level: block ? "block" : "review",
    reasonCodes,
    suggestedAction:
      block ||
      reasonCodes.includes("front_anchor_soft") ||
      reasonCodes.includes("auto_reroute_failed") ||
      rigRequiresRecreate ||
      input.rigStability?.severity === "block" ||
      (reasonCodes.includes("runtime_quality_compounded") &&
        (runtimeCriticalViews.includes("front") || runtimeFallbackViews.includes("front")))
        ? "recreate"
        : "pick-manually",
    summary: `${block ? "block" : "review"}:${reasonCodes.join(",")}`
  };
}

export function assessQualityEmbargo(input: {
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  rigStability?: RigStabilityDiagnostics;
  targetStyle?: string;
  acceptedScoreThreshold: number;
  autoReroute?: AutoRerouteDiagnostics;
}): QualityEmbargoAssessment {
  if (!isMascotTargetStyle(input.targetStyle)) {
    return {
      level: "none",
      reasonCodes: [],
      summary: "quality embargo clear"
    };
  }

  const hardReasonPattern =
    /fragmented_or_multi_object_front|text_or_watermark_high_risk|mascot_identity_too_weak|head_shape_breakdown|subject_isolation_low|species_breakdown|face_or_eyes_region_unstable/i;
  const blockingViews = new Set<CharacterView>();
  const warningViews = new Set<CharacterView>();
  const reasons = new Set<string>();
  const defectFamiliesByView: Partial<Record<CharacterView, ObservedDefectFamily[]>> = {};
  const identityViews: CharacterView[] = [];
  const styleViews: CharacterView[] = [];
  const silhouetteViews: CharacterView[] = [];
  const pawsViews: CharacterView[] = [];
  const runtimeCriticalViews: CharacterView[] = [];
  const runtimeSoftViews: CharacterView[] = [];

  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const candidate = input.selectedByView[view];
    if (!candidate) {
      blockingViews.add(view);
      reasons.add(`missing:${view}`);
      continue;
    }

    const families = summarizeObservedDefectFamilies(candidate);
    if (families.length > 0) {
      defectFamiliesByView[view] = families;
    }
    if (families.includes("identity")) {
      identityViews.push(view);
    }
    if (families.includes("style")) {
      styleViews.push(view);
    }
    if (families.includes("silhouette")) {
      silhouetteViews.push(view);
    }
    if (families.includes("paws")) {
      pawsViews.push(view);
    }

    const candidateReasons = [...candidate.rejections, ...candidate.warnings];
    const hasHardReason = candidateReasons.some((reason) => hardReasonPattern.test(reason));
    const runtimeDiagnostics = extractCandidateRuntimeQualityDiagnostics({
      candidate: candidate.candidate,
      targetStyle: input.targetStyle
    });
    const runtimeCritical =
      candidate.rejections.includes("runtime_preflight_failed") ||
      candidate.rejections.includes("runtime_structure_missing");
    const runtimeSoftReasons = candidate.warnings.filter((reason) => reason.startsWith("runtime_"));
    const runtimeFallbackOrRoute =
      candidate.warnings.includes("runtime_fallback_used") || candidate.warnings.includes("runtime_route_degraded");
    if (hasHardReason) {
      blockingViews.add(view);
      reasons.add(`hard-defect:${view}`);
    }
    if (runtimeCritical) {
      runtimeCriticalViews.push(view);
      blockingViews.add(view);
      reasons.add(`runtime-hard:${view}`);
    } else if (runtimeSoftReasons.length > 0) {
      runtimeSoftViews.push(view);
      warningViews.add(view);
      reasons.add(runtimeFallbackOrRoute ? `runtime-fallback:${view}` : `runtime-review:${view}`);
    }

    if (
      candidate.rejections.length > 0 &&
      families.some((family) => family === "identity" || family === "head" || family === "silhouette" || family === "style")
    ) {
      blockingViews.add(view);
      reasons.add(`rejections:${view}`);
    }

    if (view === "front") {
      if (
        families.includes("identity") &&
        (candidate.score < input.acceptedScoreThreshold + 0.03 ||
          candidate.rejections.length > 0 ||
          input.autoReroute?.recovered === false)
      ) {
        blockingViews.add(view);
        reasons.add("front_identity_embargo");
      }
      if (families.includes("silhouette")) {
        blockingViews.add(view);
        reasons.add("front_silhouette_embargo");
      }
      if (runtimeCritical || (runtimeFallbackOrRoute && input.autoReroute?.attempted && input.autoReroute.recovered === false)) {
        blockingViews.add(view);
        reasons.add("front_runtime_embargo");
      }
    } else if (
      families.includes("identity") &&
      (candidate.consistencyScore ?? 1) < (view === "profile" ? 0.47 : 0.52)
    ) {
      warningViews.add(view);
      reasons.add(`identity_review:${view}`);
    }

    if (input.rigStability?.blockingViews.includes(view)) {
      blockingViews.add(view);
      reasons.add(view === "front" ? "rig_front_anchor_embargo" : `rig_landmark_embargo:${view}`);
    } else if (input.rigStability?.warningViews.includes(view)) {
      warningViews.add(view);
      reasons.add(view === "front" ? "rig_front_anchor_review" : `rig_landmark_review:${view}`);
    }

    if (
      runtimeDiagnostics.workflowStage === "repair_refine" &&
      (runtimeCritical || runtimeFallbackOrRoute || runtimeSoftReasons.length >= 2)
    ) {
      blockingViews.add(view);
      reasons.add("runtime_repair_structure_embargo");
    }
    if (
      runtimeDiagnostics.workflowStage === "identity_lock_refine" &&
      (runtimeCritical || runtimeFallbackOrRoute || runtimeSoftReasons.length > 0)
    ) {
      if (view === "front") {
        blockingViews.add(view);
      } else {
        warningViews.add(view);
      }
      reasons.add("runtime_lock_structure_embargo");
    }

    if (families.includes("style") || families.includes("paws") || families.includes("body")) {
      warningViews.add(view);
    }
  }

  if (identityViews.length >= 2) {
    for (const view of identityViews) {
      blockingViews.add(view);
    }
    reasons.add("pack_identity_drift_embargo");
  }
  if (styleViews.length >= 2 && input.autoReroute?.attempted) {
    for (const view of styleViews) {
      warningViews.add(view);
    }
    reasons.add(input.autoReroute.recovered === false ? "pack_style_drift_after_reroute" : "pack_style_drift_review");
  }
  if (silhouetteViews.includes("front")) {
    reasons.add("front_shape_readability_embargo");
  }
  if (pawsViews.length >= 2) {
    reasons.add("pack_paw_cleanup_review");
  }
  if (runtimeCriticalViews.length >= 2) {
    reasons.add("pack_runtime_embargo");
  } else if (runtimeSoftViews.length >= 2) {
    reasons.add("pack_runtime_review");
  }
  if (input.rigStability?.reviewOnly) {
    reasons.add("rig_review_only");
  }

  const level: QualityEmbargoAssessment["level"] =
    blockingViews.size > 0 ? "block" : warningViews.size > 0 || reasons.size > 0 ? "review" : "none";
  const rigRequiresRecreate =
    input.rigStability?.repairability === "recreate" ||
    (input.rigStability?.reasonFamilies ?? []).includes("recreate_required");
  const suggestedAction =
    level === "block"
      ? blockingViews.has("front") || blockingViews.size >= 2 || rigRequiresRecreate
        ? "recreate"
        : "pick-manually"
      : level === "review"
        ? "pick-manually"
        : undefined;
  const summary =
    level === "block"
      ? `quality embargo blocked pack: ${[...reasons].join(", ")}`
      : level === "review"
        ? `quality embargo requires review: ${[...reasons].join(", ")}`
        : "quality embargo clear";

  return {
    level,
    reasonCodes: [...reasons],
    summary,
    ...(suggestedAction ? { suggestedAction } : {}),
    ...(blockingViews.size > 0 ? { blockingViews: [...blockingViews] } : {}),
    ...(warningViews.size > 0 ? { warningViews: [...warningViews] } : {}),
    ...(Object.keys(defectFamiliesByView).length > 0 ? { defectFamiliesByView } : {})
  };
}

export function assessFinalQualityFirewall(input: {
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  targetStyle?: string;
  acceptedScoreThreshold: number;
  autoReroute?: AutoRerouteDiagnostics;
  packCoherence?: PackCoherenceDiagnostics;
  rigStability?: RigStabilityDiagnostics;
  selectionRisk?: SelectionRiskAssessment;
  qualityEmbargo?: QualityEmbargoAssessment;
  packDefectSummary: PackDefectSummary;
}): FinalQualityFirewallAssessment {
  if (!isMascotTargetStyle(input.targetStyle)) {
    return {
      level: "none",
      reasonCodes: [],
      summary: "final quality firewall clear"
    };
  }

  const blockingViews = new Set<CharacterView>();
  const warningViews = new Set<CharacterView>();
  const reasons = new Set<string>();
  const persistentFamiliesByView = input.packDefectSummary.persistentFamiliesByView ?? {};
  const defectFamiliesByView = input.packDefectSummary.defectFamiliesByView ?? {};
  const runtimeCriticalViews: CharacterView[] = [];
  const runtimeSoftViews: CharacterView[] = [];
  const runtimeFallbackViews: CharacterView[] = [];

  for (const view of CHARACTER_VIEWS) {
    const candidate = input.selectedByView[view];
    const families = defectFamiliesByView[view] ?? [];
    const persistentFamilies = persistentFamiliesByView[view] ?? [];
    if (!candidate) {
      blockingViews.add(view);
      reasons.add(`missing:${view}`);
      continue;
    }

    const runtimeCritical =
      candidate.rejections.includes("runtime_preflight_failed") ||
      candidate.rejections.includes("runtime_structure_missing");
    const runtimeDiagnostics = extractCandidateRuntimeQualityDiagnostics({
      candidate: candidate.candidate,
      targetStyle: input.targetStyle
    });
    const runtimeSoft = candidate.warnings.filter((reason) => reason.startsWith("runtime_"));
    const runtimeFallbackOrRoute =
      candidate.warnings.includes("runtime_fallback_used") || candidate.warnings.includes("runtime_route_degraded");
    if (runtimeCritical) {
      runtimeCriticalViews.push(view);
      blockingViews.add(view);
      reasons.add(`runtime-critical:${view}`);
    } else if (runtimeSoft.length > 0) {
      runtimeSoftViews.push(view);
      warningViews.add(view);
      reasons.add(`runtime-soft:${view}`);
    }
    if (runtimeFallbackOrRoute) {
      runtimeFallbackViews.push(view);
      warningViews.add(view);
      reasons.add(`runtime-fallback:${view}`);
    }
    if (
      runtimeDiagnostics.workflowStage === "repair_refine" &&
      (runtimeCritical || runtimeFallbackOrRoute || runtimeSoft.length >= 2)
    ) {
      blockingViews.add(view);
      reasons.add(`runtime-repair-stage:${view}`);
    }
    if (
      runtimeDiagnostics.workflowStage === "identity_lock_refine" &&
      (runtimeCritical || runtimeFallbackOrRoute || runtimeSoft.length > 0)
    ) {
      if (view === "front") {
        blockingViews.add(view);
      } else {
        warningViews.add(view);
      }
      reasons.add(`runtime-lock-stage:${view}`);
    }

    if (input.rigStability?.blockingViews.includes(view)) {
      blockingViews.add(view);
      reasons.add(`rig-firewall:${view}`);
    } else if (input.rigStability?.warningViews.includes(view)) {
      warningViews.add(view);
      reasons.add(`rig-review:${view}`);
    }

    if (
      candidate.rejections.length > 0 &&
      families.some((family) => isCriticalObservedDefectFamily(family) || family === "style")
    ) {
      blockingViews.add(view);
      reasons.add(`rejected-critical:${view}`);
    }

    if (view === "front") {
      const frontCritical = families.filter((family) => isCriticalObservedDefectFamily(family));
      const frontPersistentCritical = persistentFamilies.filter((family) => isCriticalObservedDefectFamily(family));
      if (
        frontCritical.length > 0 &&
        (frontPersistentCritical.length > 0 ||
          candidate.score < input.acceptedScoreThreshold + 0.04 ||
          input.autoReroute?.recovered === false)
      ) {
        blockingViews.add("front");
        reasons.add(
          frontPersistentCritical.length > 0 ? "front_persistent_critical_defect" : "front_critical_defect_firewall"
        );
      }
      if (
        runtimeCritical ||
        (runtimeFallbackOrRoute &&
          (input.selectionRisk?.level === "block" ||
            input.autoReroute?.recovered === false ||
            input.packCoherence?.severity === "block"))
      ) {
        blockingViews.add("front");
        reasons.add(runtimeCritical ? "front_runtime_firewall" : "front_runtime_compounded");
      }
    } else if (
      persistentFamilies.some((family) => isCriticalObservedDefectFamily(family)) &&
      (candidate.consistencyScore ?? 1) < (view === "profile" ? 0.49 : 0.54)
    ) {
      blockingViews.add(view);
      reasons.add(`persistent_side_critical:${view}`);
    }

    if (
      persistentFamilies.some((family) => isReviewObservedDefectFamily(family)) ||
      (families.some((family) => family === "style" || family === "paws" || family === "body") &&
        candidate.warnings.length >= 2)
    ) {
      warningViews.add(view);
      reasons.add(`persistent_soft:${view}`);
    }
    if (
      (runtimeCritical || runtimeSoft.length > 0) &&
      persistentFamilies.some((family) => isCriticalObservedDefectFamily(family))
    ) {
      blockingViews.add(view);
      reasons.add(view === "front" ? "runtime_front_with_persistent_critical" : `runtime_with_persistent_critical:${view}`);
    }
  }

  for (const family of input.packDefectSummary.blockingFamilies) {
    reasons.add(`repeated-critical:${family}`);
    for (const view of CHARACTER_VIEWS) {
      if (defectFamiliesByView[view]?.includes(family)) {
        blockingViews.add(view);
      }
    }
  }
  for (const family of input.packDefectSummary.warningFamilies) {
    reasons.add(`repeated-soft:${family}`);
    for (const view of CHARACTER_VIEWS) {
      if (defectFamiliesByView[view]?.includes(family) && !blockingViews.has(view)) {
        warningViews.add(view);
      }
    }
  }

  if (
    input.packCoherence?.severity === "block" &&
    (input.packDefectSummary.repeatedFamilies.length > 0 || Object.keys(persistentFamiliesByView).length > 0)
  ) {
    reasons.add("coherence_with_repeated_defects");
    for (const view of input.packCoherence.blockingViews) {
      blockingViews.add(view);
    }
  } else if (
    input.packCoherence?.severity === "review" &&
    (input.packDefectSummary.repeatedFamilies.length > 0 || Object.keys(persistentFamiliesByView).length > 0)
  ) {
    reasons.add("coherence_review_with_defects");
    for (const view of input.packCoherence.warningViews) {
      if (!blockingViews.has(view)) {
        warningViews.add(view);
      }
    }
  }

  if (
    input.selectionRisk?.level === "block" &&
    (input.packDefectSummary.repeatedFamilies.includes("identity") ||
      (persistentFamiliesByView.front?.some((family) => isCriticalObservedDefectFamily(family)) ?? false))
  ) {
    blockingViews.add("front");
    reasons.add("selection_risk_compounded_front");
  }

  if (
    input.qualityEmbargo?.level === "review" &&
    input.packDefectSummary.repeatedFamilies.some((family) => family === "style" || family === "body" || family === "paws")
  ) {
    reasons.add("embargo_review_compounded");
  }
  if (runtimeCriticalViews.length >= 2) {
    reasons.add("pack_runtime_failure");
    for (const view of runtimeCriticalViews) {
      blockingViews.add(view);
    }
  } else if (runtimeSoftViews.length >= 2 || runtimeFallbackViews.length >= 2) {
    reasons.add("pack_runtime_degradation");
    for (const view of [...runtimeSoftViews, ...runtimeFallbackViews]) {
      if (!blockingViews.has(view)) {
        warningViews.add(view);
      }
    }
  }
  if (
    input.selectionRisk?.reasonCodes.includes("runtime_quality_compounded") &&
    (runtimeCriticalViews.includes("front") || runtimeFallbackViews.includes("front"))
  ) {
    blockingViews.add("front");
    reasons.add("selection_risk_compounded_runtime");
  }
  if (
    input.rigStability?.severity === "block" &&
    (input.rigStability.blockingViews.includes("front") || input.rigStability.blockingViews.length >= 2)
  ) {
    reasons.add("rig_stability_compounded");
  } else if (input.rigStability?.reviewOnly) {
    reasons.add("rig_review_only");
  }

  const level: FinalQualityFirewallAssessment["level"] =
    blockingViews.size > 0 ? "block" : warningViews.size > 0 || reasons.size > 0 ? "review" : "none";
  const rigRequiresRecreate =
    input.rigStability?.repairability === "recreate" ||
    (input.rigStability?.reasonFamilies ?? []).includes("recreate_required");
  const suggestedAction =
    level === "block"
      ? blockingViews.has("front") || blockingViews.size >= 2 || rigRequiresRecreate
        ? "recreate"
        : "pick-manually"
      : level === "review"
        ? warningViews.has("front") || input.packDefectSummary.repeatedFamilies.length >= 2 || rigRequiresRecreate
          ? "recreate"
          : "pick-manually"
        : undefined;
  const summary =
    level === "block"
      ? `final quality firewall blocked pack: ${[...reasons].join(", ")}`
      : level === "review"
        ? `final quality firewall requires review: ${[...reasons].join(", ")}`
        : "final quality firewall clear";

  return {
    level,
    reasonCodes: [...reasons],
    summary,
    ...(suggestedAction ? { suggestedAction } : {}),
    ...(blockingViews.size > 0 ? { blockingViews: [...blockingViews] } : {}),
    ...(warningViews.size > 0 ? { warningViews: [...warningViews] } : {}),
    ...(input.packDefectSummary.repeatedFamilies.length > 0
      ? { repeatedFamilies: input.packDefectSummary.repeatedFamilies }
      : {}),
    ...(Object.keys(persistentFamiliesByView).length > 0 ? { persistentFamiliesByView } : {})
  };
}

function buildAutoRerouteViewDelta(input: {
  before: Partial<Record<CharacterView, ScoredCandidate>>;
  after: Partial<Record<CharacterView, ScoredCandidate>>;
  views: CharacterView[];
}): Partial<Record<CharacterView, AutoRerouteViewDelta>> | undefined {
  const out: Partial<Record<CharacterView, AutoRerouteViewDelta>> = {};
  for (const view of dedupeCharacterViews(input.views)) {
    const before = input.before[view];
    const after = input.after[view];
    if (!before && !after) {
      continue;
    }

    out[view] = {
      ...(before ? { beforeCandidateId: before.candidate.id } : {}),
      ...(after ? { afterCandidateId: after.candidate.id } : {}),
      ...(before || after
        ? {
            scoreDelta: Number(
              (((after?.score ?? 0) - (before?.score ?? 0))).toFixed(4)
            )
          }
        : {}),
      ...((before?.consistencyScore ?? after?.consistencyScore) !== undefined
        ? {
            consistencyDelta:
              before?.consistencyScore === null || after?.consistencyScore === null
                ? null
                : Number((((after?.consistencyScore ?? 0) - (before?.consistencyScore ?? 0))).toFixed(4))
          }
        : {}),
      ...(before || after
        ? {
            warningDelta: (after?.warnings.length ?? 0) - (before?.warnings.length ?? 0),
            rejectionDelta: (after?.rejections.length ?? 0) - (before?.rejections.length ?? 0)
          }
        : {})
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function decideAutoReroute(input: {
  config: AutoRerouteConfig;
  generationViewToGenerate: CharacterView | undefined;
  providerName: CharacterProviderName;
  requestedViews: CharacterView[];
  packCoherence: PackCoherenceDiagnostics | undefined;
  rigStability?: RigStabilityDiagnostics;
  missingGeneratedViews: CharacterView[];
  lowQualityGeneratedViews: CharacterView[];
  runtimeLowQualityViews?: CharacterView[];
  frontStrong: boolean;
  continuity: GenerationManifest["reference"]["continuity"] | undefined;
}): AutoRerouteDecision | undefined {
  if (!input.config.enabled) {
    return undefined;
  }
  if (input.generationViewToGenerate !== undefined) {
    return undefined;
  }
  if (input.providerName === "mock") {
    return undefined;
  }

  const triggers = new Set<AutoRerouteTrigger>();
  const targetViews = new Set<CharacterView>();
  const notes = new Set<string>();
  let strategy: AutoRerouteStrategy = "targeted_view_retry";
  const reviewIssues = input.packCoherence?.issues ?? [];
  const reviewIssueSet = new Set(reviewIssues);
  const shouldReviewReroute =
    input.packCoherence?.severity === "review" &&
    (
      (
        input.packCoherence.warningViews.includes("threeQuarter") &&
        (
          (reviewIssueSet.has("threeQuarter_consistency_floor_low") &&
            (input.packCoherence.metrics.threeQuarterConsistency ?? 1) < 0.48) ||
          (reviewIssueSet.has("threeQuarter_geometry_floor_low") &&
            (input.packCoherence.metrics.threeQuarterGeometryCue ?? 1) < 0.38) ||
          reviewIssueSet.has("threeQuarter_shape_drift") ||
          reviewIssueSet.has("threeQuarter_style_drift") ||
          reviewIssueSet.has("ear_cue_spread_too_wide") ||
          reviewIssueSet.has("muzzle_cue_spread_too_wide") ||
          reviewIssueSet.has("head_shape_cue_spread_too_wide") ||
          reviewIssueSet.has("silhouette_cue_spread_too_wide") ||
          input.lowQualityGeneratedViews.includes("threeQuarter") ||
          input.missingGeneratedViews.includes("threeQuarter")
        )
      ) ||
      (
        input.packCoherence.warningViews.includes("profile") &&
        (
          (reviewIssueSet.has("profile_consistency_floor_low") &&
            (input.packCoherence.metrics.profileConsistency ?? 1) < 0.4) ||
          (reviewIssueSet.has("profile_geometry_floor_low") &&
            (input.packCoherence.metrics.profileGeometryCue ?? 1) < 0.32) ||
          reviewIssueSet.has("profile_shape_drift") ||
          reviewIssueSet.has("profile_style_drift") ||
          reviewIssueSet.has("ear_cue_spread_too_wide") ||
          reviewIssueSet.has("muzzle_cue_spread_too_wide") ||
          reviewIssueSet.has("head_shape_cue_spread_too_wide") ||
          reviewIssueSet.has("silhouette_cue_spread_too_wide") ||
          input.lowQualityGeneratedViews.includes("profile") ||
          input.missingGeneratedViews.includes("profile")
        )
      ) ||
      (
        input.packCoherence.warningViews.includes("front") &&
        (
          (reviewIssueSet.has("front_style_floor_low") &&
            (input.packCoherence.metrics.frontStyleScore ?? 1) < 0.42) ||
          (reviewIssueSet.has("front_symmetry_floor_low") &&
            (input.packCoherence.metrics.frontSymmetryScore ?? 1) < 0.52) ||
          input.lowQualityGeneratedViews.includes("front") ||
          input.missingGeneratedViews.includes("front")
        )
      )
    );
  if (input.packCoherence?.severity === "review" && !shouldReviewReroute) {
    const rigOnlyReviewViews = input.rigStability?.warningViews.filter((view) => view !== "front") ?? [];
    if (rigOnlyReviewViews.length === 0 || input.rigStability?.reviewOnly !== true) {
      return undefined;
    }
  }

  if (!input.frontStrong) {
    triggers.add("weak_front_anchor");
    targetViews.add("front");
    strategy = "full_pack_rebuild";
    notes.add("front anchor remained weak after rescue");
  }

  if (input.continuity?.attempted && !input.continuity.applied && !input.frontStrong) {
    triggers.add("continuity_miss");
    targetViews.add("front");
    strategy = "full_pack_rebuild";
    notes.add(`continuity reference was not applied (${input.continuity.reason})`);
  }

  if (input.packCoherence?.severity === "block") {
    triggers.add("pack_coherence_block");
    for (const view of input.packCoherence.blockingViews) {
      targetViews.add(view);
    }
    for (const view of input.packCoherence.warningViews) {
      if (!input.packCoherence.blockingViews.includes(view)) {
        targetViews.add(view);
      }
    }
    if (
      input.packCoherence.blockingViews.includes("front") ||
      input.packCoherence.blockingViews.length >= 2 ||
      !input.frontStrong
    ) {
      strategy = "full_pack_rebuild";
    }
    notes.add(
      `pack coherence blocked (${input.packCoherence.blockingViews.join(", ") || "unknown"}) score=${input.packCoherence.score.toFixed(2)}`
    );
  }

  if (input.rigStability?.severity === "block") {
    triggers.add("rig_instability_block");
    for (const view of dedupeCharacterViews([
      ...input.rigStability.blockingViews,
      ...input.rigStability.warningViews
    ])) {
      targetViews.add(view);
    }
    if (
      input.rigStability.blockingViews.includes("front") ||
      input.rigStability.blockingViews.length >= 2 ||
      !input.frontStrong
    ) {
      strategy = "full_pack_rebuild";
    }
    notes.add(
      `rig instability block (${[
        ...new Set([...input.rigStability.blockingViews, ...input.rigStability.warningViews])
      ].join(", ") || "unknown"}) fallbacks=${input.rigStability.fallbackReasonCodes.join(",") || "none"}`
    );
  } else if (input.rigStability?.reviewOnly) {
    const rigReviewViews = dedupeCharacterViews(input.rigStability.warningViews.filter((view) => view !== "front"));
    if (rigReviewViews.length > 0) {
      triggers.add("rig_instability_review");
      for (const view of rigReviewViews) {
        targetViews.add(view);
      }
      notes.add(
        `rig instability review (${rigReviewViews.join(", ")}) fallbacks=${input.rigStability.fallbackReasonCodes.join(",") || "none"}`
      );
    }
  }

  if (shouldReviewReroute && input.packCoherence) {
    triggers.add("pack_coherence_review");
    if (
      input.packCoherence.warningViews.includes("threeQuarter") &&
      (
        (reviewIssueSet.has("threeQuarter_consistency_floor_low") &&
          (input.packCoherence.metrics.threeQuarterConsistency ?? 1) < 0.48) ||
        (reviewIssueSet.has("threeQuarter_geometry_floor_low") &&
          (input.packCoherence.metrics.threeQuarterGeometryCue ?? 1) < 0.38) ||
        reviewIssueSet.has("threeQuarter_shape_drift") ||
        reviewIssueSet.has("threeQuarter_style_drift") ||
        reviewIssueSet.has("ear_cue_spread_too_wide") ||
        reviewIssueSet.has("muzzle_cue_spread_too_wide") ||
        reviewIssueSet.has("head_shape_cue_spread_too_wide") ||
        reviewIssueSet.has("silhouette_cue_spread_too_wide") ||
        input.lowQualityGeneratedViews.includes("threeQuarter") ||
        input.missingGeneratedViews.includes("threeQuarter")
      )
    ) {
      targetViews.add("threeQuarter");
    }
    if (
      input.packCoherence.warningViews.includes("profile") &&
      (
        (reviewIssueSet.has("profile_consistency_floor_low") &&
          (input.packCoherence.metrics.profileConsistency ?? 1) < 0.4) ||
        (reviewIssueSet.has("profile_geometry_floor_low") &&
          (input.packCoherence.metrics.profileGeometryCue ?? 1) < 0.32) ||
        reviewIssueSet.has("profile_shape_drift") ||
        reviewIssueSet.has("profile_style_drift") ||
        reviewIssueSet.has("ear_cue_spread_too_wide") ||
        reviewIssueSet.has("muzzle_cue_spread_too_wide") ||
        reviewIssueSet.has("head_shape_cue_spread_too_wide") ||
        reviewIssueSet.has("silhouette_cue_spread_too_wide") ||
        input.lowQualityGeneratedViews.includes("profile") ||
        input.missingGeneratedViews.includes("profile")
      )
    ) {
      targetViews.add("profile");
    }
    if (
      input.packCoherence.warningViews.includes("front") &&
      (
        (reviewIssueSet.has("front_style_floor_low") &&
          (input.packCoherence.metrics.frontStyleScore ?? 1) < 0.42) ||
        (reviewIssueSet.has("front_symmetry_floor_low") &&
          (input.packCoherence.metrics.frontSymmetryScore ?? 1) < 0.52) ||
        input.lowQualityGeneratedViews.includes("front") ||
        input.missingGeneratedViews.includes("front")
      )
    ) {
      targetViews.add("front");
    }
    notes.add(
      `pack coherence review reroute (${input.packCoherence.warningViews.join(", ") || "warning"}) score=${input.packCoherence.score.toFixed(2)}`
    );
  }

  if (input.missingGeneratedViews.length > 0) {
    triggers.add("missing_views");
    for (const view of input.missingGeneratedViews) {
      targetViews.add(view);
    }
    if (input.missingGeneratedViews.includes("front")) {
      strategy = "full_pack_rebuild";
    }
    notes.add(`missing generated views: ${input.missingGeneratedViews.join(", ")}`);
  }

  if ((input.runtimeLowQualityViews?.length ?? 0) > 0) {
    triggers.add("runtime_degraded_views");
    for (const view of input.runtimeLowQualityViews ?? []) {
      targetViews.add(view);
    }
    if ((input.runtimeLowQualityViews ?? []).includes("front")) {
      strategy = "full_pack_rebuild";
    }
    notes.add(`runtime degraded views after base pass: ${(input.runtimeLowQualityViews ?? []).join(", ")}`);
  }

  if (input.lowQualityGeneratedViews.length > 0) {
    triggers.add("low_quality_views");
    for (const view of input.lowQualityGeneratedViews) {
      targetViews.add(view);
    }
    if (input.lowQualityGeneratedViews.includes("front") && !input.frontStrong) {
      strategy = "full_pack_rebuild";
    }
    notes.add(`low quality views after base pass: ${input.lowQualityGeneratedViews.join(", ")}`);
  }

  if (targetViews.size === 0) {
    return undefined;
  }

  const resolvedViews =
    strategy === "full_pack_rebuild"
      ? dedupeCharacterViews(input.requestedViews)
      : dedupeCharacterViews([...targetViews].filter((view) => input.requestedViews.includes(view)));
  if (resolvedViews.length === 0) {
    return undefined;
  }

  const candidateCountBoost =
    strategy === "full_pack_rebuild" ? input.config.fullPackCandidateBoost : input.config.targetedCandidateBoost;
  const acceptedScoreThresholdBoost =
    strategy === "full_pack_rebuild" ? input.config.fullPackThresholdBoost : input.config.targetedThresholdBoost;

  return {
    strategy,
    triggers: [...triggers],
    targetViews: resolvedViews,
    candidateCountBoost,
    acceptedScoreThresholdBoost: Number(acceptedScoreThresholdBoost.toFixed(3)),
    seedOffset:
      input.config.seedOffset + (strategy === "full_pack_rebuild" ? 7000 : 0) + resolvedViews.length * 173,
    notes: [...notes]
  };
}

function isUnrecoverableRepairCandidate(candidate: ScoredCandidate | undefined): boolean {
  if (!candidate) {
    return true;
  }
  return (
    candidate.rejections.includes("mascot_identity_too_weak") ||
    candidate.rejections.includes("head_shape_breakdown") ||
    candidate.rejections.includes("fragmented_or_multi_object_front") ||
    candidate.rejections.includes("runtime_preflight_failed") ||
    candidate.rejections.includes("runtime_structure_missing") ||
    candidate.rejections.some((reason) => reason.includes("species_breakdown"))
  );
}

function scoreRepairBaseCandidate(input: {
  candidate: ScoredCandidate;
  view: CharacterView;
  targetStyle?: string;
  acceptedScoreThreshold: number;
}): number {
  const candidate = input.candidate;
  if (isUnrecoverableRepairCandidate(candidate)) {
    return Number.NEGATIVE_INFINITY;
  }

  const mascotTarget = isMascotTargetStyle(input.targetStyle);
  let score = candidate.score;
  score += candidate.rejections.length === 0 ? 0.18 : -0.16;
  score += candidate.warnings.length === 0 ? 0.06 : 0;
  score += (typeof candidate.consistencyScore === "number" ? candidate.consistencyScore : input.view === "front" ? 0.42 : 0.34) * 0.24;
  score += (candidate.breakdown.speciesScore ?? 0) * 0.12;
  score += (candidate.breakdown.targetStyleScore ?? 0) * 0.1;
  score += (candidate.breakdown.runtimeQualityScore ?? 1) * 0.1;
  score += (candidate.breakdown.structureCoverageScore ?? 1) * 0.08;
  if (candidate.score >= input.acceptedScoreThreshold) {
    score += 0.08;
  }

  if (input.view === "front") {
    score += (candidate.breakdown.frontSymmetryScore ?? 0) * 0.14;
    score += (candidate.breakdown.headSquarenessScore ?? 0) * 0.14;
    score += (candidate.breakdown.headRatioScore ?? 0) * 0.08;
  } else {
    score += (candidate.breakdown.pawStabilityScore ?? 0) * 0.05;
    score += (candidate.breakdown.pawRoundnessScore ?? 0) * 0.04;
  }

  if (candidate.warnings.includes("consistency_shape_drift")) {
    score -= mascotTarget ? 0.18 : 0.1;
  }
  if (candidate.warnings.includes("consistency_style_drift")) {
    score -= 0.08;
  }
  if (candidate.warnings.includes("consistency_low")) {
    score -= 0.06;
  }
  if (candidate.warnings.includes("front_anchor_weak")) {
    score -= 0.06;
  }
  if (candidate.warnings.includes("runtime_route_degraded")) {
    score -= 0.1;
  }
  if (candidate.warnings.includes("runtime_fallback_used")) {
    score -= 0.08;
  }
  if (candidate.warnings.includes("runtime_preflight_warnings")) {
    score -= 0.06;
  }
  if (candidate.warnings.includes("runtime_adapter_warning_present")) {
    score -= 0.04;
  }
  if (candidate.warnings.includes("front_symmetry_low")) {
    score -= 0.08;
  }
  if (candidate.warnings.includes("head_body_ratio_off")) {
    score -= 0.06;
  }
  if (candidate.warnings.includes("paw_shape_failure") || candidate.warnings.includes("finger_spikes_detected")) {
    score -= 0.08;
  }
  score -= (candidate.breakdown.runtimePenalty ?? 0) * 0.16;

  return score;
}

function selectBestRepairBaseCandidate(input: {
  scored: ScoredCandidate[];
  view: CharacterView;
  targetStyle?: string;
  acceptedScoreThreshold: number;
}): ScoredCandidate | undefined {
  const pool = input.scored
    .filter((candidate) => candidate.candidate.view === input.view)
    .filter((candidate) => !isUnrecoverableRepairCandidate(candidate));

  if (pool.length === 0) {
    return undefined;
  }

  return [...pool].sort((left, right) => {
    const scoreDelta =
      scoreRepairBaseCandidate({
        candidate: right,
        view: input.view,
        targetStyle: input.targetStyle,
        acceptedScoreThreshold: input.acceptedScoreThreshold
      }) -
      scoreRepairBaseCandidate({
        candidate: left,
        view: input.view,
        targetStyle: input.targetStyle,
        acceptedScoreThreshold: input.acceptedScoreThreshold
      });
    if (Math.abs(scoreDelta) >= 0.015) {
      return scoreDelta;
    }
    return compareScoredCandidates(left, right);
  })[0];
}

function isTransientProviderFailure(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("network")
  );
}

export function isThreeQuarterFrontCollapseRisk(input: {
  rawSymmetryScore: number;
  frontSymmetryScore?: number;
  headSquarenessScore?: number;
  pawSymmetryScore?: number;
}): boolean {
  if (input.rawSymmetryScore <= 0.94) {
    return false;
  }
  if (input.rawSymmetryScore >= 0.975) {
    return true;
  }

  const frontCueScore = clamp01(
    (input.frontSymmetryScore ?? input.rawSymmetryScore) * 0.52 +
      (input.headSquarenessScore ?? 0.5) * 0.28 +
      (input.pawSymmetryScore ?? 0.5) * 0.2
  );
  return frontCueScore >= 0.74;
}

export function isConsistencyCriticalShapeDrift(input: {
  speciesId?: string;
  view?: CharacterView;
  upperAlpha: number;
  headAspect: number;
  upperFace: number;
}): boolean {
  const normalizedSpecies = normalizeGenerationSpecies(input.speciesId);
  const canineSideView =
    (input.view === "threeQuarter" || input.view === "profile") &&
    (normalizedSpecies === "dog" || normalizedSpecies === "wolf");
  const canineThreeQuarter = input.view === "threeQuarter" && canineSideView;
  const minUpperAlpha =
    input.view === "profile" ? 0.28 : canineThreeQuarter ? 0.24 : input.view === "threeQuarter" ? 0.28 : 0.28;
  const minHeadAspect =
    input.view === "profile" ? 0.24 : canineThreeQuarter ? 0.22 : input.view === "threeQuarter" ? 0.3 : 0.3;
  const minUpperFace =
    input.view === "profile" ? null : canineThreeQuarter ? 0.18 : input.view === "threeQuarter" ? 0.24 : 0.24;
  const severeMargin = input.view === "profile" ? 0.08 : canineThreeQuarter ? 0.06 : 0;
  let failedMetricCount = 0;
  let severeFailure = false;
  if (input.upperAlpha < minUpperAlpha) {
    failedMetricCount += 1;
    if (canineSideView && input.upperAlpha < minUpperAlpha - severeMargin) {
      severeFailure = true;
    }
  }
  if (input.headAspect < minHeadAspect) {
    failedMetricCount += 1;
    if (canineSideView && input.headAspect < minHeadAspect - severeMargin) {
      severeFailure = true;
    }
  }
  if (typeof minUpperFace === "number" && input.upperFace < minUpperFace) {
    failedMetricCount += 1;
    if (canineSideView && input.upperFace < minUpperFace - severeMargin) {
      severeFailure = true;
    }
  }
  if (canineSideView) {
    if (severeFailure) {
      return true;
    }
    return failedMetricCount >= 2;
  }
  return failedMetricCount >= 1;
}

export function shouldDowngradeCanineSideCriticalShapeDrift(input: {
  speciesId?: string;
  view?: CharacterView;
  consistencyScore: number | null | undefined;
  warningThreshold: number;
  speciesScore?: number | null;
  frontSymmetryScore?: number | null;
  hasFrontCollapse?: boolean;
  hasSpeciesReadabilityWarning?: boolean;
}): boolean {
  const normalizedSpecies = normalizeGenerationSpecies(input.speciesId);
  const canineSideView =
    (input.view === "threeQuarter" || input.view === "profile") &&
    (normalizedSpecies === "dog" || normalizedSpecies === "wolf");
  if (!canineSideView) {
    return false;
  }
  if (typeof input.consistencyScore !== "number" || !Number.isFinite(input.consistencyScore)) {
    return false;
  }
  if (input.consistencyScore < input.warningThreshold) {
    return false;
  }
  if (input.hasFrontCollapse) {
    return false;
  }
  if (typeof input.frontSymmetryScore === "number" && input.frontSymmetryScore > 0.93) {
    return false;
  }
  if (input.hasSpeciesReadabilityWarning) {
    return false;
  }
  const speciesFloor = normalizedSpecies === "wolf" ? 0.32 : 0.29;
  return (
    typeof input.speciesScore === "number" &&
    Number.isFinite(input.speciesScore) &&
    input.speciesScore >= speciesFloor
  );
}

export function scoreCandidate(input: {
  candidate: CharacterGenerationCandidate;
  analysis: ImageAnalysis;
  mode: string;
  styleScore: number;
  targetStyle?: string;
  speciesId?: string;
  referenceAnalysis?: ImageAnalysis;
  generationRound: number;
}): ScoredCandidate {
  const warnings: string[] = [];
  const rejections: string[] = [];
  const mascotTarget = isMascotTargetStyle(input.targetStyle);
  const mascotQcThresholds = resolveMascotQcThresholds(input.speciesId);
  const runtimeDiagnostics = extractCandidateRuntimeQualityDiagnostics({
    candidate: input.candidate,
    targetStyle: input.targetStyle
  });

  warnings.push(...runtimeDiagnostics.warningReasons);
  rejections.push(...runtimeDiagnostics.rejectionReasons);

  if (!mascotTarget && (input.analysis.alphaCoverage > 0.995 || input.analysis.alphaCoverage < 0.04)) {
    warnings.push("background_not_transparent");
  } else if (mascotTarget && input.analysis.alphaCoverage < 0.02) {
    warnings.push("background_not_transparent");
  }

  if (input.analysis.contrast < 20) {
    warnings.push("low_contrast");
  }

  if (!mascotTarget && input.analysis.edgeDensityBottomRight > 0.4) {
    rejections.push("watermark_or_text_artifact");
  }

  const watermarkWarningThreshold = mascotTarget ? 0.84 : 0.72;
  const watermarkRejectionThreshold = mascotTarget ? 0.96 : 0.88;
  if (input.analysis.watermarkTextRisk > watermarkWarningThreshold) {
    warnings.push("text_or_watermark_suspected");
  }
  if (!mascotTarget && input.analysis.watermarkTextRisk > watermarkRejectionThreshold) {
    rejections.push("text_or_watermark_high_risk");
  } else if (mascotTarget && input.analysis.watermarkTextRisk > watermarkRejectionThreshold) {
    warnings.push("text_or_watermark_high_risk");
  }

  const frontDogMascot = mascotTarget && normalizeGenerationSpecies(input.speciesId) === "dog" && input.candidate.view === "front";
  const mascotFrontView = mascotTarget && input.candidate.view === "front";
  const subjectFillRatio = input.analysis.bboxOccupancy > 0 ? input.analysis.alphaCoverage / input.analysis.bboxOccupancy : 0;
  if (
    input.analysis.upperFaceCoverage < (frontDogMascot ? 0.02 : 0.04) ||
    input.analysis.upperFaceCoverage > (frontDogMascot ? 0.97 : 0.9)
  ) {
    warnings.push("face_or_eyes_region_unstable");
  }

  if (mascotFrontView && subjectFillRatio < 0.3) {
    rejections.push("fragmented_or_multi_object_front");
  } else if (mascotFrontView && subjectFillRatio < 0.42) {
    warnings.push("subject_fill_too_sparse");
  }

  if (Math.min(input.analysis.originalWidth, input.analysis.originalHeight) < 512) {
    warnings.push("low_resolution");
  }

  if (input.analysis.bboxOccupancy < 0.12 || input.analysis.bboxOccupancy > 0.92) {
    warnings.push("bbox_occupancy_outlier");
  }

  if (input.analysis.blurScore < 180) {
    warnings.push("blurry");
  }

  if (input.analysis.noiseScore > 48) {
    warnings.push("noisy");
  }

  let referenceSimilarity: number | null = null;
  if (input.referenceAnalysis) {
    const hashSimilarity = hammingSimilarity(input.analysis.phash, input.referenceAnalysis.phash);
    const paletteScore = paletteSimilarity(input.analysis.palette, input.referenceAnalysis.palette);
    if (mascotTarget) {
      const shapeSimilarity = clamp01(
        scoreTargetMetric(input.analysis.upperAlphaRatio, input.referenceAnalysis.upperAlphaRatio, 0.18) * 0.24 +
          scoreTargetMetric(input.analysis.headBoxAspectRatio, input.referenceAnalysis.headBoxAspectRatio, 0.22) * 0.3 +
          scoreTargetMetric(input.analysis.bboxAspectRatio, input.referenceAnalysis.bboxAspectRatio, 0.26) * 0.18 +
          scoreTargetMetric(input.analysis.monochromeScore, input.referenceAnalysis.monochromeScore, 0.18) * 0.14 +
          scoreTargetMetric(input.analysis.paletteComplexity, input.referenceAnalysis.paletteComplexity, 0.16) * 0.14
      );
      referenceSimilarity = clamp01(hashSimilarity * 0.28 + paletteScore * 0.12 + shapeSimilarity * 0.6);
    } else {
      referenceSimilarity = clamp01(hashSimilarity * 0.7 + paletteScore * 0.3);
    }
    if (input.mode === "reference" && referenceSimilarity < 0.28) {
      rejections.push("reference_similarity_too_low");
    }
  }

  const alphaScore = scoreAlphaCoverage(input.analysis);
  const occupancyScore = scoreBBoxOccupancy(input.analysis);
  const sharpnessScore = scoreSharpness(input.analysis);
  const noiseScore = scoreNoise(input.analysis);
  const watermarkScore = scoreWatermarkSafety(input.analysis);
  const resolutionScore = scoreResolutionQuality(input.analysis);
  const referenceScore = referenceSimilarity ?? 0.5;
  const postprocessBonus =
    input.candidate.providerMeta?.postprocess && input.candidate.providerMeta.postprocess.applied ? 0.02 : 0;

  const qualityScore = clamp01(
    alphaScore * 0.16 +
      occupancyScore * 0.18 +
      sharpnessScore * 0.2 +
      noiseScore * 0.12 +
      watermarkScore * 0.2 +
      resolutionScore * 0.14
  );

  let targetStyleScore: number | undefined;
  let speciesScore: number | undefined;
  let speciesEarScore: number | undefined;
  let speciesMuzzleScore: number | undefined;
  let speciesHeadShapeScore: number | undefined;
  let speciesSilhouetteScore: number | undefined;
  let monochromeScore: number | undefined;
  let paletteSimplicityScore: number | undefined;
  let headRatioScore: number | undefined;
  let headSquarenessScore: number | undefined;
  let silhouetteScore: number | undefined;
  let frontSymmetryScore: number | undefined;
  let contrastScore: number | undefined;
  let pawStabilityScore: number | undefined;
  let pawRoundnessScore: number | undefined;
  let pawSymmetryScore: number | undefined;
  let fingerSafetyScore: number | undefined;
  let handRegionDensityScore: number | undefined;
  let subjectIsolationScore: number | undefined;
  let dogFrontReadabilityScore: number | undefined;
  let score = 0.48;

  if (mascotTarget) {
    const headRatioFloor = mascotQcThresholds.minHeadRatioByView[input.candidate.view] ?? 0.22;
    const criticalHeadRatioFloor =
      input.candidate.view === "front"
        ? Math.max(0.18, headRatioFloor - 0.12)
        : Math.max(0.12, headRatioFloor - 0.08);
    monochromeScore = scoreMascotMonochrome(input.analysis);
    paletteSimplicityScore = scoreMascotPaletteSimplicity(input.analysis);
    headRatioScore = scoreMascotHeadRatio(input.analysis);
    headSquarenessScore = scoreMascotHeadSquareness(input.analysis);
    silhouetteScore = scoreMascotSilhouette(input.analysis);
    frontSymmetryScore = scoreMascotFrontSymmetry(input.analysis, input.candidate.view);
    contrastScore = scoreMascotContrast(input.analysis);
    subjectIsolationScore = scoreMascotSubjectIsolation(input.analysis);
    const pawStability = scoreMascotPawStability(input.analysis, input.candidate.view);
    pawStabilityScore = pawStability.score;
    pawRoundnessScore = pawStability.parts.pawRoundness;
    pawSymmetryScore = pawStability.parts.pawSymmetry;
    fingerSafetyScore = pawStability.parts.fingerSafety;
    handRegionDensityScore = pawStability.parts.handRegionDensity;
    const speciesIdentity = scoreMascotSpeciesIdentity(
      input.analysis,
      normalizeGenerationSpecies(input.speciesId),
      input.candidate.view
    );
    speciesScore = speciesIdentity.score;
    speciesEarScore = speciesIdentity.parts.earCue;
    speciesMuzzleScore = speciesIdentity.parts.muzzleCue;
    speciesHeadShapeScore = speciesIdentity.parts.headShapeCue;
    speciesSilhouetteScore = speciesIdentity.parts.silhouetteCue;
    targetStyleScore = clamp01(
      monochromeScore * 0.18 +
        paletteSimplicityScore * 0.12 +
        headRatioScore * 0.16 +
        headSquarenessScore * 0.16 +
        silhouetteScore * 0.08 +
        frontSymmetryScore * 0.1 +
        contrastScore * 0.1 +
        pawStabilityScore * 0.2
    );
    if (
      normalizeGenerationSpecies(input.speciesId) === "cat" &&
      referenceScore >= 0.58 &&
      monochromeScore >= 0.9 &&
      paletteSimplicityScore >= 0.8
    ) {
      const catReferenceSpeciesFloor = clamp01(
        referenceScore * 0.52 +
          monochromeScore * 0.18 +
          paletteSimplicityScore * 0.12 +
          headRatioScore * 0.18 -
          0.24
      );
      if (catReferenceSpeciesFloor > speciesScore) {
        speciesScore = catReferenceSpeciesFloor;
        speciesSilhouetteScore = Math.max(speciesSilhouetteScore, clamp01(catReferenceSpeciesFloor * 0.82));
      }
    }

    if (monochromeScore < 0.5) {
      warnings.push("too_colorful_for_mascot");
    }
    if (paletteSimplicityScore < 0.18) {
      warnings.push("palette_too_complex_for_mascot");
    }
    if (headRatioScore < headRatioFloor) {
      warnings.push("head_body_ratio_off");
    }
    if (headSquarenessScore < 0.34) {
      warnings.push("head_shape_not_square_enough");
    }
    if (input.candidate.view !== "profile" && headSquarenessScore < 0.18) {
      rejections.push("head_shape_breakdown");
    }
    if (input.candidate.view !== "profile" && headRatioScore < criticalHeadRatioFloor) {
      rejections.push(
        input.candidate.view === "threeQuarter" ? "threequarter_head_ratio_failure" : "head_ratio_breakdown"
      );
    }
    if (input.candidate.view === "front" && frontSymmetryScore < 0.56) {
      warnings.push("front_symmetry_low");
    }
    if (input.candidate.view === "threeQuarter") {
      if (
        isThreeQuarterFrontCollapseRisk({
          rawSymmetryScore: input.analysis.symmetryScore,
          frontSymmetryScore,
          headSquarenessScore,
          pawSymmetryScore
        })
      ) {
        rejections.push("threequarter_front_collapse");
      } else if (input.analysis.symmetryScore > 0.88) {
        warnings.push("threequarter_frontality_risk");
      }
    }
    if (pawRoundnessScore < 0.28) {
      warnings.push("paw_shape_unstable");
    }
    if (pawSymmetryScore < 0.38 && input.candidate.view !== "profile") {
      warnings.push("paw_symmetry_low");
    }
    const armVisibilityWarningFloor =
      normalizeGenerationSpecies(input.speciesId) === "dog" && input.candidate.view === "front" ? 0.3 : 0.24;
    const frontArmMissingRiskFloor = normalizeGenerationSpecies(input.speciesId) === "dog" ? 0.26 : 0.18;
    if (input.candidate.view !== "profile" && pawSymmetryScore < armVisibilityWarningFloor) {
      warnings.push("arm_visibility_low");
    }
    if (fingerSafetyScore < 0.54) {
      warnings.push("finger_spikes_detected");
    }
    if (handRegionDensityScore < (input.candidate.view === "front" ? 0.1 : 0.18)) {
      warnings.push("hand_region_structure_noisy");
    }
    if (normalizeGenerationSpecies(input.speciesId) === "dog" && input.candidate.view === "front") {
      if (handRegionDensityScore < 0.12) {
        rejections.push("dog_front_arm_zone_empty");
      } else if (handRegionDensityScore < 0.18) {
        warnings.push("dog_front_arm_zone_weak");
      }
    }
    if (input.candidate.view === "front" && pawSymmetryScore < frontArmMissingRiskFloor) {
      rejections.push("front_arm_missing_risk");
    }
    if (pawStabilityScore < 0.22) {
      rejections.push("paw_shape_failure");
    } else if (pawStabilityScore < 0.36) {
      warnings.push("paw_readability_low");
    }
    if (
      normalizeGenerationSpecies(input.speciesId) === "cat" &&
      input.candidate.view === "threeQuarter" &&
      pawStabilityScore < 0.32
    ) {
      rejections.push("cat_threequarter_paw_failure");
    }
    applyMascotSpeciesWarnings({
      speciesId: normalizeGenerationSpecies(input.speciesId),
      view: input.candidate.view,
      analysis: input.analysis,
      speciesScore,
      warnings,
      rejections
    });
    if (targetStyleScore < 0.28) {
      rejections.push("mascot_identity_too_weak");
    } else if (targetStyleScore < 0.4) {
      warnings.push("mascot_readability_low");
    }

    if (
      mascotFrontView &&
      (subjectIsolationScore < Math.max(0.28, mascotQcThresholds.minSubjectIsolationFront - 0.18) ||
        input.analysis.significantComponentCount > 5)
    ) {
      rejections.push("fragmented_or_multi_object_front");
    } else if (mascotFrontView && subjectIsolationScore < mascotQcThresholds.minSubjectIsolationFront) {
      warnings.push("subject_isolation_low");
    }

    if (
      mascotFrontView &&
      rejections.includes("fragmented_or_multi_object_front") &&
      shouldDowngradeCanineFrontFragmentationRisk({
        speciesId: input.speciesId,
        view: input.candidate.view,
        subjectFillRatio,
        subjectIsolationScore,
        largestComponentShare: input.analysis.largestComponentShare,
        significantComponentCount: input.analysis.significantComponentCount,
        speciesScore,
        speciesMuzzleScore,
        speciesSilhouetteScore,
        targetStyleScore,
        frontSymmetryScore,
        headSquarenessScore,
        handRegionDensityScore
      })
    ) {
      removeReason(rejections, "fragmented_or_multi_object_front");
      if (!warnings.includes("subject_isolation_low")) {
        warnings.push("subject_isolation_low");
      }
    }

    if (
      mascotFrontView &&
      rejections.includes("fragmented_or_multi_object_front") &&
      shouldDowngradeCatFrontFragmentationRisk({
        speciesId: input.speciesId,
        view: input.candidate.view,
        subjectFillRatio,
        subjectIsolationScore,
        largestComponentShare: input.analysis.largestComponentShare,
        significantComponentCount: input.analysis.significantComponentCount,
        speciesScore,
        speciesEarScore,
        speciesMuzzleScore,
        targetStyleScore,
        frontSymmetryScore,
        headSquarenessScore,
        handRegionDensityScore
      })
    ) {
      removeReason(rejections, "fragmented_or_multi_object_front");
      if (!warnings.includes("subject_isolation_low")) {
        warnings.push("subject_isolation_low");
      }
    }

    if (
      mascotFrontView &&
      rejections.includes("head_shape_breakdown") &&
      shouldDowngradeCatFrontHeadShapeBreakdownRisk({
        speciesId: input.speciesId,
        view: input.candidate.view,
        subjectFillRatio,
        subjectIsolationScore,
        largestComponentShare: input.analysis.largestComponentShare,
        significantComponentCount: input.analysis.significantComponentCount,
        speciesScore,
        speciesEarScore,
        speciesMuzzleScore,
        speciesHeadShapeScore,
        speciesSilhouetteScore,
        targetStyleScore,
        frontSymmetryScore,
        headSquarenessScore,
        handRegionDensityScore
      })
    ) {
      removeReason(rejections, "head_shape_breakdown");
      if (!warnings.includes("head_shape_not_square_enough")) {
        warnings.push("head_shape_not_square_enough");
      }
    }

    if (normalizeGenerationSpecies(input.speciesId) === "dog" && input.candidate.view === "front") {
      dogFrontReadabilityScore = clamp01(
        (frontSymmetryScore ?? 0.5) * 0.22 +
          (speciesScore ?? 0.2) * 0.36 +
          (paletteSimplicityScore ?? 0.3) * 0.16 +
          (monochromeScore ?? 0.5) * 0.14 +
          (headRatioScore ?? 0.35) * 0.12
      );
      if (dogFrontReadabilityScore < 0.38) {
        rejections.push("dog_front_readability_breakdown");
      } else if (dogFrontReadabilityScore < 0.48) {
        warnings.push("dog_front_readability_low");
      }
    }

    score = 0.32;
    score += input.styleScore * 0.06;
    score += qualityScore * 0.18;
    score += referenceScore * 0.11;
    score += targetStyleScore * 0.23;
    score += speciesScore * 0.16;
    score += runtimeDiagnostics.qualityScore * 0.08;
    score += runtimeDiagnostics.structureCoverageScore * 0.05;
    score += runtimeDiagnostics.routeQualityScore * 0.04;
    if (typeof dogFrontReadabilityScore === "number") {
      score += dogFrontReadabilityScore * 0.07;
    }
    score += postprocessBonus * 0.5;
    score -= runtimeDiagnostics.penalty * 0.12;
    score -= dedupeStrings(warnings).length * 0.028;
    score -= dedupeStrings(rejections).length * 0.18;
  } else {
    score += input.styleScore * 0.14;
    score += qualityScore * 0.24;
    score += referenceScore * 0.14;
    score += runtimeDiagnostics.qualityScore * 0.05;
    score += runtimeDiagnostics.routeQualityScore * 0.03;
    score += postprocessBonus;
    score -= runtimeDiagnostics.penalty * 0.08;
    score -= dedupeStrings(warnings).length * 0.05;
    score -= dedupeStrings(rejections).length * 0.25;
  }

  const normalizedWarnings = dedupeStrings(warnings);
  const normalizedRejections = dedupeStrings(rejections);

  return {
    candidate: input.candidate,
    analysis: input.analysis,
    score: clamp01(score),
    styleScore: input.styleScore,
    referenceSimilarity,
    consistencyScore: null,
    warnings: normalizedWarnings,
    rejections: normalizedRejections,
    breakdown: {
      alphaScore,
      occupancyScore,
      sharpnessScore,
      noiseScore,
      watermarkScore,
      resolutionScore,
      referenceScore,
      styleScore: input.styleScore,
      qualityScore,
      ...(typeof targetStyleScore === "number" ? { targetStyleScore } : {}),
      ...(typeof speciesScore === "number" ? { speciesScore } : {}),
      ...(typeof speciesEarScore === "number" ? { speciesEarScore } : {}),
      ...(typeof speciesMuzzleScore === "number" ? { speciesMuzzleScore } : {}),
      ...(typeof speciesHeadShapeScore === "number" ? { speciesHeadShapeScore } : {}),
      ...(typeof speciesSilhouetteScore === "number" ? { speciesSilhouetteScore } : {}),
      ...(typeof monochromeScore === "number" ? { monochromeScore } : {}),
      ...(typeof paletteSimplicityScore === "number" ? { paletteSimplicityScore } : {}),
      ...(typeof headRatioScore === "number" ? { headRatioScore } : {}),
      ...(typeof headSquarenessScore === "number" ? { headSquarenessScore } : {}),
      ...(typeof silhouetteScore === "number" ? { silhouetteScore } : {}),
      ...(typeof frontSymmetryScore === "number" ? { frontSymmetryScore } : {}),
      ...(typeof contrastScore === "number" ? { contrastScore } : {}),
      ...(typeof pawStabilityScore === "number" ? { pawStabilityScore } : {}),
      ...(typeof pawRoundnessScore === "number" ? { pawRoundnessScore } : {}),
      ...(typeof pawSymmetryScore === "number" ? { pawSymmetryScore } : {}),
      ...(typeof fingerSafetyScore === "number" ? { fingerSafetyScore } : {}),
      ...(typeof handRegionDensityScore === "number" ? { handRegionDensityScore } : {}),
      ...(mascotFrontView ? { subjectFillRatio } : {}),
      ...(typeof subjectIsolationScore === "number" ? { subjectIsolationScore } : {}),
      ...(mascotFrontView ? { largestComponentShare: input.analysis.largestComponentShare } : {}),
      ...(mascotFrontView ? { significantComponentCount: input.analysis.significantComponentCount } : {}),
      ...(typeof dogFrontReadabilityScore === "number" ? { dogFrontReadabilityScore } : {}),
      runtimeQualityScore: runtimeDiagnostics.qualityScore,
      runtimePenalty: runtimeDiagnostics.penalty,
      structureCoverageScore: runtimeDiagnostics.structureCoverageScore,
      routeQualityScore: runtimeDiagnostics.routeQualityScore,
      runtimeWarningCount: runtimeDiagnostics.warningReasons.length,
      runtimeRejectionCount: runtimeDiagnostics.rejectionReasons.length,
      consistencyScore: null,
      generationRound: input.generationRound
    }
  };
}

function scoreConsistencyAgainstFront(
  analysis: ImageAnalysis,
  frontAnalysis: ImageAnalysis,
  targetStyle?: string,
  speciesId?: string,
  view?: CharacterView
): {
  score: number;
  parts: {
    phash: number;
    palette: number;
    bboxCenter: number;
    bboxScale: number;
    upperAlpha: number;
    headAspect: number;
    upperFace: number;
    monochrome: number;
    paletteComplexity: number;
  };
} {
  const phash = hammingSimilarity(analysis.phash, frontAnalysis.phash);
  const palette = paletteSimilarity(analysis.palette, frontAnalysis.palette);
  const centerDistance = Math.sqrt(
    Math.pow(analysis.bboxCenterX - frontAnalysis.bboxCenterX, 2) +
      Math.pow(analysis.bboxCenterY - frontAnalysis.bboxCenterY, 2)
  );
  const bboxCenter = clamp01(1 - centerDistance / 0.5);
  const bboxScale = clamp01(1 - Math.abs(analysis.bboxScale - frontAnalysis.bboxScale) / 0.45);
  const upperAlpha = scoreTargetMetric(
    analysis.upperAlphaRatio,
    frontAnalysis.upperAlphaRatio,
    view === "profile" ? 0.24 : view === "threeQuarter" ? 0.2 : 0.16
  );
  const headAspect = scoreTargetMetric(
    analysis.headBoxAspectRatio,
    frontAnalysis.headBoxAspectRatio,
    view === "profile" ? 0.3 : view === "threeQuarter" ? 0.24 : 0.2
  );
  const upperFace = scoreTargetMetric(
    analysis.upperFaceCoverage,
    frontAnalysis.upperFaceCoverage,
    view === "profile" ? 0.24 : 0.18
  );
  const monochrome = scoreTargetMetric(analysis.monochromeScore, frontAnalysis.monochromeScore, 0.2);
  const paletteComplexity = scoreTargetMetric(analysis.paletteComplexity, frontAnalysis.paletteComplexity, 0.18);
  const mascotTarget = isMascotTargetStyle(targetStyle);
  const normalizedSpecies = normalizeGenerationSpecies(speciesId);
  const score = mascotTarget
    ? (() => {
        const isProfile = view === "profile";
        const isThreeQuarter = view === "threeQuarter";
        const phashWeight = isProfile ? (normalizedSpecies === "wolf" ? 0.08 : 0.1) : isThreeQuarter ? 0.12 : 0.2;
        const paletteWeight = 0.16;
        const upperAlphaWeight = isProfile ? 0.18 : 0.16;
        const headAspectWeight = isProfile ? 0.16 : 0.14;
        const upperFaceWeight = isProfile ? 0.12 : 0.1;
        const bboxCenterWeight = 0.1;
        const bboxScaleWeight = 0.08;
        const monochromeWeight = 0.06;
        const paletteComplexityWeight = clamp01(
          1 -
            phashWeight -
            paletteWeight -
            upperAlphaWeight -
            headAspectWeight -
            upperFaceWeight -
            bboxCenterWeight -
            bboxScaleWeight -
            monochromeWeight
        );
        return clamp01(
          phash * phashWeight +
            palette * paletteWeight +
            upperAlpha * upperAlphaWeight +
            headAspect * headAspectWeight +
            upperFace * upperFaceWeight +
            bboxCenter * bboxCenterWeight +
            bboxScale * bboxScaleWeight +
            monochrome * monochromeWeight +
            paletteComplexity * paletteComplexityWeight
        );
      })()
    : clamp01(
        phash * 0.28 +
          palette * 0.16 +
          upperAlpha * 0.12 +
          headAspect * 0.12 +
          upperFace * 0.1 +
          bboxCenter * 0.1 +
          bboxScale * 0.08 +
          monochrome * 0.02 +
          paletteComplexity * 0.02
      );
  return {
    score,
    parts: {
      phash,
      palette,
      bboxCenter,
      bboxScale,
      upperAlpha,
      headAspect,
      upperFace,
      monochrome,
      paletteComplexity
    }
  };
}

function hasConsistencyRecoveryIssue(candidate: ScoredCandidate | undefined): boolean {
  if (!candidate) {
    return false;
  }
  return [...candidate.rejections, ...candidate.warnings].some(
    (reason) =>
      reason === "inconsistent_with_front_baseline" ||
      reason === "consistency_low" ||
      reason === "consistency_shape_drift" ||
      reason === "consistency_style_drift"
  );
}

export function hasBlockingConsistencyRecoveryIssue(
  candidate: ScoredCandidate | undefined,
  speciesId?: string
): boolean {
  if (!candidate || !hasConsistencyRecoveryIssue(candidate)) {
    return false;
  }
  const reasons = new Set<string>([...candidate.rejections, ...candidate.warnings]);
  const onlyShapeDriftRecoveryIssue =
    !reasons.has("inconsistent_with_front_baseline") &&
    !reasons.has("consistency_low") &&
    !reasons.has("consistency_style_drift") &&
    reasons.has("consistency_shape_drift");
  if (!onlyShapeDriftRecoveryIssue) {
    return true;
  }
  const warningThreshold =
    resolveMascotQcThresholds(speciesId).minConsistencyByView[candidate.candidate.view] ?? 0.48;
  return !shouldDowngradeCanineSideCriticalShapeDrift({
    speciesId,
    view: candidate.candidate.view,
    consistencyScore: candidate.consistencyScore,
    warningThreshold,
    speciesScore: candidate.breakdown.speciesScore,
    frontSymmetryScore: candidate.breakdown.frontSymmetryScore,
    hasFrontCollapse: candidate.rejections.includes("threequarter_front_collapse"),
    hasSpeciesReadabilityWarning: candidate.warnings.some(
      (warning) => warning === "species_readability_low" || warning === "species_identity_too_weak"
    )
  });
}

function applyConsistencyScoring(
  scored: ScoredCandidate[],
  targetStyle?: string,
  speciesId?: string,
  acceptedScoreThreshold = 0.56
): void {
  const mascotTarget = isMascotTargetStyle(targetStyle);
  const profileThresholds = resolveMascotQcThresholds(speciesId);
  const frontCandidates = scored
    .filter((entry) => entry.candidate.view === "front")
    .sort(compareScoredCandidates);

  for (const entry of frontCandidates) {
    entry.consistencyScore = 1;
    entry.breakdown.consistencyScore = 1;
  }

  const frontBaseline = mascotTarget
    ? frontCandidates.find((entry) =>
        isStrongFrontMasterCandidate(entry, targetStyle, acceptedScoreThreshold, speciesId)
      )
    : frontCandidates[0];
  if (!frontBaseline) {
    if (mascotTarget) {
      for (const entry of scored) {
        if (entry.candidate.view === "front") {
          continue;
        }
        entry.consistencyScore = null;
        entry.breakdown.consistencyScore = null;
        delete entry.breakdown.consistencyParts;
        if (!entry.warnings.includes("front_anchor_weak")) {
          entry.warnings.push("front_anchor_weak");
        }
      }
    }
    return;
  }

  for (const entry of scored) {
    if (entry.candidate.view === "front") {
      continue;
    }

    entry.warnings = entry.warnings.filter((warning) => warning !== "front_anchor_weak");
    const consistency = scoreConsistencyAgainstFront(
      entry.analysis,
      frontBaseline.analysis,
      targetStyle,
      speciesId,
      entry.candidate.view
    );
    entry.consistencyScore = consistency.score;
    entry.breakdown.consistencyScore = consistency.score;
    entry.breakdown.consistencyParts = consistency.parts;
    entry.score = mascotTarget
      ? clamp01(entry.score * 0.66 + consistency.score * 0.34)
      : clamp01(entry.score * 0.72 + consistency.score * 0.28);

    const profileConsistencyFloor = profileThresholds.minConsistencyByView[entry.candidate.view] ?? 0.48;
    const rejectThreshold = mascotTarget
      ? Math.max(0.22, profileConsistencyFloor - (entry.candidate.view === "profile" ? 0.14 : 0.14))
      : 0.34;
    const warningThreshold = mascotTarget ? profileConsistencyFloor : 0.48;
    const criticalShapeDrift =
      mascotTarget &&
      isConsistencyCriticalShapeDrift({
        speciesId,
        view: entry.candidate.view,
        upperAlpha: consistency.parts.upperAlpha,
        headAspect: consistency.parts.headAspect,
        upperFace: consistency.parts.upperFace
      });
    const downgradeCanineSideCriticalShapeDrift =
      criticalShapeDrift &&
      shouldDowngradeCanineSideCriticalShapeDrift({
        speciesId,
        view: entry.candidate.view,
        consistencyScore: consistency.score,
        warningThreshold,
        speciesScore: entry.breakdown.speciesScore,
        frontSymmetryScore: entry.breakdown.frontSymmetryScore,
        hasFrontCollapse: entry.rejections.includes("threequarter_front_collapse"),
        hasSpeciesReadabilityWarning: entry.warnings.some(
          (warning) => warning === "species_readability_low" || warning === "species_identity_too_weak"
        )
      });
    const styleDrift =
      mascotTarget &&
      (consistency.parts.palette < 0.34 ||
        consistency.parts.monochrome < 0.38 ||
        consistency.parts.paletteComplexity < 0.34);

    if (consistency.score < rejectThreshold || (criticalShapeDrift && !downgradeCanineSideCriticalShapeDrift)) {
      if (!entry.rejections.includes("inconsistent_with_front_baseline")) {
        entry.rejections.push("inconsistent_with_front_baseline");
      }
      if (criticalShapeDrift && !entry.warnings.includes("consistency_shape_drift")) {
        entry.warnings.push("consistency_shape_drift");
      }
    } else if (consistency.score < warningThreshold) {
      if (!entry.warnings.includes("consistency_low")) {
        entry.warnings.push("consistency_low");
      }
    }

    if (criticalShapeDrift && !entry.warnings.includes("consistency_shape_drift")) {
      entry.warnings.push("consistency_shape_drift");
    }
    if (styleDrift && !entry.warnings.includes("consistency_style_drift")) {
      entry.warnings.push("consistency_style_drift");
    }
  }
}

function groupBestByView(scored: ScoredCandidate[]): Partial<Record<CharacterView, ScoredCandidate>> {
  const out: Partial<Record<CharacterView, ScoredCandidate>> = {};

  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const pool = scored.filter((entry) => entry.candidate.view === view).sort(compareScoredCandidates);

    if (pool.length > 0) {
      out[view] = pool[0];
    }
  }

  return out;
}

async function waitForAssetsReady(prisma: PrismaClient, assetIds: string[]): Promise<void> {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const rows = await prisma.asset.findMany({
      where: {
        id: {
          in: assetIds
        }
      },
      select: {
        id: true,
        status: true,
        qcJson: true
      }
    });

    if (rows.length !== assetIds.length) {
      throw new Error("Asset rows disappeared during ASSET_INGEST wait");
    }

    const failed = rows.find((row) => row.status === "FAILED");
    if (failed) {
      throw new Error(`ASSET_INGEST failed for asset ${failed.id}`);
    }

    if (rows.every((row) => row.status === "READY")) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 1000);
    });
  }

  throw new Error("Timed out waiting for ASSET_INGEST completion");
}

function requireCharacter(payload: EpisodeJobPayload): CharacterPackJobPayload {
  if (!payload.character) {
    throw new Error("Missing payload.character");
  }

  const character = payload.character;
  if (typeof character.characterPackId !== "string" || character.characterPackId.trim().length === 0) {
    throw new Error("payload.character.characterPackId is required");
  }

  if (typeof character.version !== "number" || !Number.isInteger(character.version) || character.version <= 0) {
    throw new Error("payload.character.version must be a positive integer");
  }

  return character;
}

function normalizeGenerationView(value: unknown): CharacterGenerationView | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "front") {
    return "front";
  }
  if (
    normalized === "threequarter" ||
    normalized === "three_quarter" ||
    normalized === "three-quarter" ||
    normalized === "threequarterview"
  ) {
    return "threeQuarter";
  }
  if (normalized === "profile") {
    return "profile";
  }
  return undefined;
}

function normalizeGenerationSpecies(value: unknown): NonNullable<CharacterGenerationPayload["species"]> {
  if (typeof value !== "string") {
    return "cat";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "cat" || normalized === "dog" || normalized === "wolf") {
    return normalized;
  }
  return "cat";
}

function normalizeGenerationConfig(generation: CharacterGenerationPayload | undefined): CharacterGenerationPayload {
  const selectedCandidateIds = generation?.selectedCandidateIds;
  const normalizedSelection =
    selectedCandidateIds &&
    typeof selectedCandidateIds.front === "string" &&
    typeof selectedCandidateIds.threeQuarter === "string" &&
    typeof selectedCandidateIds.profile === "string"
      ? {
          front: selectedCandidateIds.front.trim(),
          threeQuarter: selectedCandidateIds.threeQuarter.trim(),
          profile: selectedCandidateIds.profile.trim()
        }
      : undefined;
  const viewToGenerate = normalizeGenerationView(generation?.viewToGenerate);

  return {
    sessionId:
      typeof generation?.sessionId === "string" && generation.sessionId.trim().length > 0
        ? generation.sessionId.trim()
        : undefined,
    mode: generation?.mode === "reference" ? "reference" : "new",
    provider: generation?.provider,
    promptPreset: generation?.promptPreset ?? "compact-mascot-production",
    species: normalizeGenerationSpecies(generation?.species),
    positivePrompt: generation?.positivePrompt,
    negativePrompt: generation?.negativePrompt,
    boostNegativePrompt: generation?.boostNegativePrompt === true,
    referenceAssetId: generation?.referenceAssetId,
    viewToGenerate,
    regenerateSameSeed: generation?.regenerateSameSeed !== false,
    candidateCount: Math.max(1, Math.min(8, generation?.candidateCount ?? 4)),
    autoPick: generation?.autoPick !== false,
    requireHitlPick: generation?.requireHitlPick === true,
    seed: generation?.seed ?? 101,
    manifestPath: generation?.manifestPath,
    sourceManifestPath:
      typeof generation?.sourceManifestPath === "string" && generation.sourceManifestPath.trim().length > 0
        ? generation.sourceManifestPath.trim()
        : undefined,
    ...(normalizedSelection &&
    normalizedSelection.front.length > 0 &&
    normalizedSelection.threeQuarter.length > 0 &&
    normalizedSelection.profile.length > 0
      ? {
          selectedCandidateIds: normalizedSelection
        }
      : {})
  };
}

function resolveAutoContinuityOverride(generation: CharacterGenerationPayload | undefined): boolean | undefined {
  if (!isRecord(generation)) {
    return undefined;
  }
  const record = generation as Record<string, unknown>;
  const value = record.autoContinuityReference;
  return typeof value === "boolean" ? value : undefined;
}

function toDbGenerationMode(mode: CharacterGenerationPayload["mode"]): "NEW" | "REFERENCE" {
  return mode === "reference" ? "REFERENCE" : "NEW";
}

function toDbGenerationProvider(
  provider: CharacterGenerationPayload["provider"]
): "MOCK" | "COMFYUI" | "REMOTEAPI" {
  if (provider === "comfyui") {
    return "COMFYUI";
  }
  if (provider === "remoteApi") {
    return "REMOTEAPI";
  }
  if (provider === "mock") {
    return "MOCK";
  }
  return "MOCK";
}

function toDbGenerationView(
  view: CharacterGenerationPayload["viewToGenerate"]
): "FRONT" | "THREE_QUARTER" | "PROFILE" | undefined {
  if (view === "front") {
    return "FRONT";
  }
  if (view === "threeQuarter") {
    return "THREE_QUARTER";
  }
  if (view === "profile") {
    return "PROFILE";
  }
  return undefined;
}

function toDbCandidateView(view: CharacterView): "FRONT" | "THREE_QUARTER" | "PROFILE" {
  if (view === "front") {
    return "FRONT";
  }
  if (view === "threeQuarter") {
    return "THREE_QUARTER";
  }
  return "PROFILE";
}

function normalizeSeedForDb(seed: number): number {
  const MAX_INT4 = 2_147_483_647;
  const MIN_INT4 = -2_147_483_648;
  if (!Number.isFinite(seed)) {
    return 0;
  }
  const rounded = Math.trunc(seed);
  if (rounded > MAX_INT4) {
    return rounded % MAX_INT4;
  }
  if (rounded < MIN_INT4) {
    return MIN_INT4;
  }
  return rounded;
}

async function upsertGenerationSession(input: {
  prisma: PrismaClient;
  generation: CharacterGenerationPayload;
  episodeId: string;
  characterPackId: string;
  promptPresetId: string;
  positivePrompt: string;
  negativePrompt: string;
  seed: number;
  candidateCount: number;
  manifestPath: string;
  statusMessage: string;
}): Promise<{ id: string }> {
  const sessionDelegate = getCharacterGenerationSessionDelegate(input.prisma);
  if (!sessionDelegate) {
    return { id: input.generation.sessionId ?? `legacy-${input.episodeId}` };
  }

  const data = {
    episodeId: input.episodeId,
    characterPackId: input.characterPackId,
    mode: toDbGenerationMode(input.generation.mode),
    provider: toDbGenerationProvider(input.generation.provider),
    promptPresetId: input.promptPresetId,
    positivePrompt: input.positivePrompt,
    negativePrompt: input.negativePrompt,
    seed: normalizeSeedForDb(input.seed),
    candidateCount: input.candidateCount,
    referenceAssetId: input.generation.referenceAssetId ?? null,
    viewToGenerate: toDbGenerationView(input.generation.viewToGenerate) ?? null,
    status: "GENERATING" as const,
    statusMessage: input.statusMessage,
    manifestPath: input.manifestPath
  };

  if (input.generation.sessionId) {
    const existing = await sessionDelegate.findUnique({
      where: { id: input.generation.sessionId },
      select: { id: true, episodeId: true }
    });
    if (existing && existing.episodeId === input.episodeId) {
      await sessionDelegate.update({
        where: { id: existing.id },
        data
      });
      return { id: existing.id };
    }
  }

  const latest = await sessionDelegate.findFirst({
    where: {
      episodeId: input.episodeId,
      characterPackId: input.characterPackId
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true }
  });

  if (latest) {
    await sessionDelegate.update({
      where: { id: latest.id },
      data
    });
    return { id: latest.id };
  }

  const created = await sessionDelegate.create({
    data
  });

  return { id: created.id };
}

async function upsertSessionCandidates(input: {
  prisma: PrismaClient;
  sessionId: string;
  scored: ScoredCandidate[];
  viewToGenerate?: CharacterView;
}): Promise<void> {
  if (input.scored.length === 0) {
    return;
  }
  const candidateDelegate = getCharacterGenerationCandidateDelegate(input.prisma);
  if (!candidateDelegate) {
    return;
  }

  if (input.viewToGenerate) {
    await candidateDelegate.deleteMany({
      where: {
        sessionId: input.sessionId,
        view: toDbCandidateView(input.viewToGenerate)
      }
    });
  } else {
    await candidateDelegate.deleteMany({
      where: {
        sessionId: input.sessionId
      }
    });
  }

  await candidateDelegate.createMany({
    data: input.scored.map((entry) => ({
      sessionId: input.sessionId,
      view: toDbCandidateView(entry.candidate.view),
      candidateId: entry.candidate.id,
      candidateIndex: entry.candidate.candidateIndex,
      seed: normalizeSeedForDb(entry.candidate.seed),
      scoreJson: toPrismaJson({
        score: entry.score,
        styleScore: entry.styleScore,
        referenceSimilarity: entry.referenceSimilarity,
        consistencyScore: entry.consistencyScore,
        breakdown: entry.breakdown
      }),
      qcJson: toPrismaJson({
        mime: entry.candidate.mimeType,
        warnings: entry.warnings,
        rejections: entry.rejections,
        analysis: entry.analysis
      }),
      localPath: asString(entry.candidate.providerMeta?.localCandidatePath)
    }))
  });
}

async function markSessionCandidatesPicked(input: {
  prisma: PrismaClient;
  sessionId: string;
  selectedByView: Record<CharacterView, { candidateId: string; assetId: string }>;
}): Promise<void> {
  const candidateDelegate = getCharacterGenerationCandidateDelegate(input.prisma);
  if (!candidateDelegate) {
    return;
  }

  await candidateDelegate.updateMany({
    where: { sessionId: input.sessionId },
    data: { picked: false }
  });

  for (const selected of Object.values(input.selectedByView)) {
    if (!selected || typeof selected.candidateId !== "string" || typeof selected.assetId !== "string") {
      throw new Error("Invalid selectedByView payload for markSessionCandidatesPicked");
    }
    await candidateDelegate.updateMany({
      where: {
        sessionId: input.sessionId,
        candidateId: selected.candidateId
      },
      data: {
        picked: true,
        assetId: selected.assetId
      }
    });
  }
}

function manifestBasePath(jobDbId: string, manifestPath?: string): string {
  if (manifestPath && manifestPath.trim().length > 0) {
    return path.resolve(manifestPath);
  }

  return path.join(REPO_ROOT, "out", "characters", "generations", jobDbId, "generation_manifest.json");
}

export function resolveManifestReadPath(
  jobDbId: string,
  paths: {
    manifestPath?: string;
    sourceManifestPath?: string;
  }
): string {
  if (typeof paths.sourceManifestPath === "string" && paths.sourceManifestPath.trim().length > 0) {
    return path.resolve(paths.sourceManifestPath);
  }

  return manifestBasePath(jobDbId, paths.manifestPath);
}

function getComfyUiUrl(): string | undefined {
  const adapter = process.env.COMFY_ADAPTER_URL?.trim();
  if (adapter && adapter.length > 0) {
    return adapter;
  }

  const base = process.env.COMFYUI_BASE_URL?.trim();
  if (base && base.length > 0) {
    return base;
  }

  const legacy = process.env.COMFYUI_URL?.trim();
  if (legacy && legacy.length > 0) {
    return legacy;
  }

  return undefined;
}

function hasCandidateSelection(
  value: CharacterGenerationPayload["selectedCandidateIds"]
): value is CharacterGenerationSelection {
  if (!value) {
    return false;
  }

  return (
    typeof value.front === "string" &&
    value.front.trim().length > 0 &&
    typeof value.threeQuarter === "string" &&
    value.threeQuarter.trim().length > 0 &&
    typeof value.profile === "string" &&
    value.profile.trim().length > 0
  );
}

function normalizeSelectedCandidateIds(value: CharacterGenerationSelection): CharacterGenerationSelection {
  return {
    front: value.front.trim(),
    threeQuarter: value.threeQuarter.trim(),
    profile: value.profile.trim()
  };
}

function parseManifestCandidate(manifestPath: string, candidate: unknown): {
  id: string;
  provider?: string;
  view: CharacterView;
  candidateIndex: number;
  seed: number;
  mimeType: string;
  filePath: string;
  score: number;
  styleScore: number;
  referenceSimilarity: number | null;
  consistencyScore: number | null;
  warnings: string[];
  rejections: string[];
  breakdown?: CandidateScoreBreakdown;
  providerMeta?: CharacterCandidateProviderMeta;
} | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const id = asString(candidate.id).trim();
  const viewRaw = asString(candidate.view).trim();
  const provider = asString(candidate.provider).trim();
  const candidateIndex = typeof candidate.candidateIndex === "number" ? candidate.candidateIndex : 0;
  const seed = typeof candidate.seed === "number" ? candidate.seed : 0;
  const mimeType = asString(candidate.mimeType).trim() || "image/png";
  const filePathRaw = asString(candidate.filePath).trim();
  if (!id || !filePathRaw) {
    return null;
  }

  let view: CharacterView;
  if (viewRaw === "front" || viewRaw === "threeQuarter" || viewRaw === "profile") {
    view = viewRaw;
  } else {
    return null;
  }

  const filePath = path.resolve(path.dirname(manifestPath), filePathRaw);
  const score = typeof candidate.score === "number" ? candidate.score : 0.5;
  const styleScore = typeof candidate.styleScore === "number" ? candidate.styleScore : 0.5;
  const referenceSimilarity = typeof candidate.referenceSimilarity === "number" ? candidate.referenceSimilarity : null;
  const consistencyScore = typeof candidate.consistencyScore === "number" ? candidate.consistencyScore : null;
  const warnings = Array.isArray(candidate.warnings)
    ? candidate.warnings.filter((item): item is string => typeof item === "string")
    : [];
  const rejections = Array.isArray(candidate.rejections)
    ? candidate.rejections.filter((item): item is string => typeof item === "string")
    : [];
  const breakdown = isRecord(candidate.breakdown) ? (candidate.breakdown as CandidateScoreBreakdown) : undefined;
  const providerMeta = isRecord(candidate.providerMeta)
    ? (candidate.providerMeta as CharacterCandidateProviderMeta)
    : undefined;

  return {
    id,
    ...(provider ? { provider } : {}),
    view,
    candidateIndex,
    seed,
    mimeType,
    filePath,
    score,
    styleScore,
    referenceSimilarity,
    consistencyScore,
    warnings,
    rejections,
    ...(breakdown ? { breakdown } : {}),
    ...(providerMeta ? { providerMeta } : {})
  };
}

async function resolveFrontReferenceFromManifest(manifestPath: string): Promise<{
  referenceImageBase64: string;
  referenceMimeType: string;
} | undefined> {
  if (!fs.existsSync(manifestPath)) {
    return undefined;
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    return undefined;
  }

  if (!isRecord(parsedRaw)) {
    return undefined;
  }

  const manifestCandidates = Array.isArray(parsedRaw.candidates) ? parsedRaw.candidates : [];
  const parsedCandidates = manifestCandidates
    .map((candidate) => parseManifestCandidate(manifestPath, candidate))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .filter((candidate) => candidate.view === "front")
    .sort((a, b) => b.score - a.score);

  const selectedByView = isRecord(parsedRaw.selectedByView) ? parsedRaw.selectedByView : null;
  const selectedFrontCandidateId =
    selectedByView &&
    isRecord(selectedByView.front) &&
    typeof selectedByView.front.candidateId === "string" &&
    selectedByView.front.candidateId.trim().length > 0
      ? selectedByView.front.candidateId.trim()
      : null;

  const selected = selectedFrontCandidateId
    ? parsedCandidates.find((candidate) => candidate.id === selectedFrontCandidateId)
    : null;
  const chosen = selected ?? parsedCandidates[0];
  if (!chosen) {
    return undefined;
  }

  if (!fs.existsSync(chosen.filePath)) {
    return undefined;
  }

  const data = fs.readFileSync(chosen.filePath);
  return {
    referenceImageBase64: data.toString("base64"),
    referenceMimeType: chosen.mimeType
  };
}

async function resolveFrontReferenceFromSession(
  prisma: PrismaClient,
  sessionId: string,
  config: ContinuityReferenceConfig
): Promise<{
  referenceImageBase64: string;
  referenceMimeType: string;
  picked: boolean;
  score: number | null;
  rejectionCount: number;
  updatedAtMs: number;
} | undefined> {
  const candidateDelegate = getCharacterGenerationCandidateDelegate(prisma);
  if (!candidateDelegate) {
    return undefined;
  }

  const rows = await candidateDelegate.findMany({
    where: {
      sessionId,
      view: "FRONT",
      ...(config.requirePicked ? { picked: true } : {})
    },
    orderBy: [{ picked: "desc" }, { updatedAt: "desc" }],
    take: config.candidateTake,
    select: {
      localPath: true,
      picked: true,
      updatedAt: true,
      scoreJson: true,
      qcJson: true
    }
  });

  type RankedReference = {
    referenceImageBase64: string;
    referenceMimeType: string;
    picked: boolean;
    score: number | null;
    rankScore: number;
    rejectionCount: number;
    updatedAtMs: number;
  };
  let best: RankedReference | null = null;

  for (const row of rows) {
    const localPath = typeof row.localPath === "string" ? row.localPath.trim() : "";
    if (!localPath || !fs.existsSync(localPath)) {
      continue;
    }

    const score = extractCandidateScore(row.scoreJson);
    if (score === null && config.requireScore) {
      continue;
    }
    if (score !== null && score < config.minScore) {
      continue;
    }

    const qc = isRecord(row.qcJson) ? row.qcJson : null;
    const rejectionCount = extractCandidateRejectionCount(qc);
    if (rejectionCount > config.maxRejections) {
      continue;
    }

    const mimeType =
      qc && typeof qc.mime === "string" && qc.mime.trim().length > 0
        ? qc.mime.trim()
        : "image/png";
    let data: Buffer;
    try {
      data = fs.readFileSync(localPath);
    } catch {
      continue;
    }
    const candidate: RankedReference = {
      referenceImageBase64: data.toString("base64"),
      referenceMimeType: mimeType,
      picked: row.picked,
      score,
      rankScore: score ?? -1,
      rejectionCount,
      updatedAtMs: row.updatedAt.getTime()
    };
    if (!best) {
      best = candidate;
      continue;
    }
    if (isBetterContinuityCandidate(candidate, best)) {
      best = candidate;
    }
  }

  if (!best) {
    return undefined;
  }
  return {
    referenceImageBase64: best.referenceImageBase64,
    referenceMimeType: best.referenceMimeType,
    picked: best.picked,
    score: best.score,
    rejectionCount: best.rejectionCount,
    updatedAtMs: best.updatedAtMs
  };
}

function isBetterContinuityCandidate(
  next: { picked: boolean; rankScore: number; rejectionCount: number; updatedAtMs: number },
  current: { picked: boolean; rankScore: number; rejectionCount: number; updatedAtMs: number }
): boolean {
  if (next.picked !== current.picked) {
    return next.picked;
  }
  if (next.rankScore !== current.rankScore) {
    return next.rankScore > current.rankScore;
  }
  if (next.rejectionCount !== current.rejectionCount) {
    return next.rejectionCount < current.rejectionCount;
  }
  return next.updatedAtMs > current.updatedAtMs;
}

async function resolveAutoContinuityReference(input: {
  prisma: PrismaClient;
  episodeId: string;
  channelId: string;
  characterPackId: string;
  currentSessionId?: string;
  config: ContinuityReferenceConfig;
}): Promise<{
  match?:
    | {
        sessionId: string;
        referenceImageBase64: string;
        referenceMimeType: string;
        sourcePool: "preferred" | "fallback";
        candidatePicked: boolean;
        candidateScore: number | null;
        candidateRejectionCount: number;
        candidateUpdatedAt: string;
      }
    | undefined;
  diagnostics: {
    cutoffUpdatedAt: string;
    queuedSessionCount: number;
    uniqueQueuedSessionCount: number;
    duplicateSessionCount: number;
    searchedSessionCount: number;
    searchedSessionIdsPreview: string[];
    preferredPoolCount: number;
    fallbackPoolCount: number;
    reason?: "matched" | "no_recent_ready_session" | "no_eligible_front_candidate";
  };
}> {
  const sessionDelegate = getCharacterGenerationSessionDelegate(input.prisma);
  if (!sessionDelegate) {
    return {
      diagnostics: {
        cutoffUpdatedAt: new Date(Date.now() - input.config.maxSessionAgeHours * 60 * 60 * 1000).toISOString(),
        queuedSessionCount: 0,
        uniqueQueuedSessionCount: 0,
        duplicateSessionCount: 0,
        searchedSessionCount: 0,
        searchedSessionIdsPreview: [],
        preferredPoolCount: 0,
        fallbackPoolCount: 0,
        reason: "no_recent_ready_session"
      }
    };
  }

  const cutoffDate = new Date(Date.now() - input.config.maxSessionAgeHours * 60 * 60 * 1000);
  const whereBase: Record<string, unknown> = {
    status: "READY",
    NOT: {
      episodeId: input.episodeId
    },
    updatedAt: {
      gte: cutoffDate
    },
    ...(input.currentSessionId ? { id: { not: input.currentSessionId } } : {})
  };

  const preferred = await sessionDelegate.findMany({
    where: {
      ...whereBase,
      characterPackId: input.characterPackId
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true
    },
    take: input.config.preferredSessionTake
  });

  const fallback = await sessionDelegate.findMany({
    where: {
      ...whereBase,
      episode: {
        is: {
          channelId: input.channelId
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true
    },
    take: input.config.fallbackSessionTake
  });

  const queue = [...preferred.map((row) => row.id), ...fallback.map((row) => row.id)];
  const uniqueQueuedSessionIds = new Set(queue);
  const uniqueQueuedSessionCount = uniqueQueuedSessionIds.size;
  const duplicateSessionCount = Math.max(0, queue.length - uniqueQueuedSessionCount);
  const preferredSet = new Set(preferred.map((row) => row.id));
  const visited = new Set<string>();
  const visitedOrder: string[] = [];
  for (const sessionId of queue) {
    if (visited.has(sessionId)) {
      continue;
    }
    visited.add(sessionId);
    visitedOrder.push(sessionId);
    const resolved = await resolveFrontReferenceFromSession(input.prisma, sessionId, input.config);
    if (resolved) {
      return {
        match: {
          sessionId,
          referenceImageBase64: resolved.referenceImageBase64,
          referenceMimeType: resolved.referenceMimeType,
          sourcePool: preferredSet.has(sessionId) ? "preferred" : "fallback",
          candidatePicked: resolved.picked,
          candidateScore: resolved.score,
          candidateRejectionCount: resolved.rejectionCount,
          candidateUpdatedAt: new Date(resolved.updatedAtMs).toISOString()
        },
        diagnostics: {
          cutoffUpdatedAt: cutoffDate.toISOString(),
          queuedSessionCount: queue.length,
          uniqueQueuedSessionCount,
          duplicateSessionCount,
          searchedSessionCount: visited.size,
          searchedSessionIdsPreview: visitedOrder.slice(0, 5),
          preferredPoolCount: preferred.length,
          fallbackPoolCount: fallback.length,
          reason: "matched"
        }
      };
    }
  }

  const reason =
    queue.length === 0
      ? ("no_recent_ready_session" as const)
      : ("no_eligible_front_candidate" as const);
  return {
    diagnostics: {
      cutoffUpdatedAt: cutoffDate.toISOString(),
      queuedSessionCount: queue.length,
      uniqueQueuedSessionCount,
      duplicateSessionCount,
      searchedSessionCount: visited.size,
      searchedSessionIdsPreview: visitedOrder.slice(0, 5),
      preferredPoolCount: preferred.length,
      fallbackPoolCount: fallback.length,
      reason
    }
  };
}

function extractCandidateScore(value: unknown): number | null {
  if (!isRecord(value)) {
    return null;
  }
  const raw = value.score;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return null;
  }
  return clamp01(raw);
}

function extractCandidateRejectionCount(value: unknown): number {
  if (!isRecord(value)) {
    return 0;
  }
  const raw = value.rejections;
  if (!Array.isArray(raw)) {
    return 0;
  }
  return raw.filter((item) => typeof item === "string" && item.trim().length > 0).length;
}

function parseManifestContinuity(value: unknown): GenerationManifest["reference"]["continuity"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const enabled = typeof value.enabled === "boolean" ? value.enabled : undefined;
  const attempted = typeof value.attempted === "boolean" ? value.attempted : undefined;
  const applied = typeof value.applied === "boolean" ? value.applied : undefined;
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (enabled === undefined || attempted === undefined || applied === undefined || reason.length === 0) {
    return undefined;
  }
  const asOptionalNumber = (input: unknown): number | undefined =>
    typeof input === "number" && Number.isFinite(input) ? input : undefined;
  const asOptionalNullableNumber = (input: unknown): number | null | undefined =>
    input === null ? null : typeof input === "number" && Number.isFinite(input) ? input : undefined;
  const asOptionalNullableString = (input: unknown): string | null | undefined =>
    input === null ? null : typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
  const asOptionalString = (input: unknown): string | undefined =>
    typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
  const asOptionalStringArray = (input: unknown): string[] | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }
    const out = input
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    return out.length > 0 ? out : undefined;
  };

  const policyRaw = isRecord(value.policy) ? value.policy : undefined;
  const parsedPolicy =
    policyRaw &&
    typeof policyRaw.maxSessionAgeHours === "number" &&
    Number.isFinite(policyRaw.maxSessionAgeHours) &&
    typeof policyRaw.minScore === "number" &&
    Number.isFinite(policyRaw.minScore) &&
    typeof policyRaw.maxRejections === "number" &&
    Number.isFinite(policyRaw.maxRejections) &&
    typeof policyRaw.requirePicked === "boolean" &&
    typeof policyRaw.requireScore === "boolean" &&
    typeof policyRaw.candidateTake === "number" &&
    Number.isFinite(policyRaw.candidateTake) &&
    typeof policyRaw.preferredSessionTake === "number" &&
    Number.isFinite(policyRaw.preferredSessionTake) &&
    typeof policyRaw.fallbackSessionTake === "number" &&
    Number.isFinite(policyRaw.fallbackSessionTake)
      ? {
          maxSessionAgeHours: policyRaw.maxSessionAgeHours,
          minScore: policyRaw.minScore,
          maxRejections: policyRaw.maxRejections,
          requirePicked: policyRaw.requirePicked,
          requireScore: policyRaw.requireScore,
          candidateTake: policyRaw.candidateTake,
          preferredSessionTake: policyRaw.preferredSessionTake,
          fallbackSessionTake: policyRaw.fallbackSessionTake,
          requestOverride:
            typeof policyRaw.requestOverride === "boolean" || policyRaw.requestOverride === null
              ? policyRaw.requestOverride
              : null
        }
      : undefined;

  return {
    enabled,
    attempted,
    applied,
    reason,
    ...(asOptionalString(value.attemptedSourceSessionId)
      ? { attemptedSourceSessionId: asOptionalString(value.attemptedSourceSessionId) }
      : {}),
    ...(asOptionalString(value.cutoffUpdatedAt) ? { cutoffUpdatedAt: asOptionalString(value.cutoffUpdatedAt) } : {}),
    ...(asOptionalNumber(value.queuedSessionCount) !== undefined
      ? { queuedSessionCount: asOptionalNumber(value.queuedSessionCount) }
      : {}),
    ...(asOptionalNumber(value.uniqueQueuedSessionCount) !== undefined
      ? { uniqueQueuedSessionCount: asOptionalNumber(value.uniqueQueuedSessionCount) }
      : {}),
    ...(asOptionalNumber(value.duplicateSessionCount) !== undefined
      ? { duplicateSessionCount: asOptionalNumber(value.duplicateSessionCount) }
      : {}),
    ...(asOptionalNumber(value.searchedSessionCount) !== undefined
      ? { searchedSessionCount: asOptionalNumber(value.searchedSessionCount) }
      : {}),
    ...(asOptionalStringArray(value.searchedSessionIdsPreview)
      ? { searchedSessionIdsPreview: asOptionalStringArray(value.searchedSessionIdsPreview) }
      : {}),
    ...(asOptionalNumber(value.preferredPoolCount) !== undefined
      ? { preferredPoolCount: asOptionalNumber(value.preferredPoolCount) }
      : {}),
    ...(asOptionalNumber(value.fallbackPoolCount) !== undefined
      ? { fallbackPoolCount: asOptionalNumber(value.fallbackPoolCount) }
      : {}),
    ...(value.sourcePool === "preferred" || value.sourcePool === "fallback" ? { sourcePool: value.sourcePool } : {}),
    ...(typeof value.candidatePicked === "boolean" ? { candidatePicked: value.candidatePicked } : {}),
    ...(asOptionalNullableNumber(value.candidateScore) !== undefined
      ? { candidateScore: asOptionalNullableNumber(value.candidateScore) }
      : {}),
    ...(asOptionalNullableNumber(value.candidateRejectionCount) !== undefined
      ? { candidateRejectionCount: asOptionalNullableNumber(value.candidateRejectionCount) }
      : {}),
    ...(asOptionalNullableString(value.candidateUpdatedAt) !== undefined
      ? { candidateUpdatedAt: asOptionalNullableString(value.candidateUpdatedAt) }
      : {}),
    ...(parsedPolicy ? { policy: parsedPolicy } : {})
  };
}

function formatContinuityDescriptor(
  continuity: GenerationManifest["reference"]["continuity"] | undefined,
  options?: {
    includeQueueStats?: boolean;
  }
): string | null {
  if (!continuity?.reason) {
    return null;
  }
  const parts = [`Continuity=${continuity.reason}`];
  if (continuity.attemptedSourceSessionId) {
    parts.push(`source=${continuity.attemptedSourceSessionId}`);
  }
  if (continuity.sourcePool) {
    parts.push(`pool=${continuity.sourcePool}`);
  }
  if (options?.includeQueueStats) {
    const queueStats = formatContinuityQueueStats(continuity);
    if (queueStats) {
      parts.push(queueStats);
    }
  }
  return parts.join(" ");
}

function formatContinuitySentence(
  continuity: GenerationManifest["reference"]["continuity"] | undefined
): string {
  const descriptor = formatContinuityDescriptor(continuity);
  if (!descriptor) {
    return "";
  }
  return ` ${descriptor}.`;
}

function formatContinuityQueueStats(
  continuity: GenerationManifest["reference"]["continuity"] | undefined
): string | null {
  if (!continuity?.attempted) {
    return null;
  }
  const queued = continuity.queuedSessionCount;
  const unique = continuity.uniqueQueuedSessionCount;
  const duplicates = continuity.duplicateSessionCount;
  const searched = continuity.searchedSessionCount;
  if (
    typeof queued !== "number" ||
    !Number.isFinite(queued) ||
    typeof unique !== "number" ||
    !Number.isFinite(unique) ||
    typeof duplicates !== "number" ||
    !Number.isFinite(duplicates)
  ) {
    return null;
  }
  const parts = [`queue=${queued}`, `unique=${unique}`, `dup=${duplicates}`];
  if (typeof searched === "number" && Number.isFinite(searched)) {
    parts.push(`searched=${searched}`);
  }
  return parts.join(" ");
}

function toFlatContinuityFields(continuity: GenerationManifest["reference"]["continuity"] | undefined): {
  continuitySummary: GenerationManifest["reference"]["continuity"] | null;
  continuityDescriptor: string | null;
  continuityDescriptorWithQueue: string | null;
  continuityReason: string | null;
  continuityApplied: boolean | null;
  continuityAttempted: boolean | null;
  continuitySourceSessionId: string | null;
  continuitySourcePool: "preferred" | "fallback" | null;
  continuityQueuedSessionCount: number | null;
  continuityUniqueQueuedSessionCount: number | null;
  continuityDuplicateSessionCount: number | null;
  continuitySearchedSessionCount: number | null;
  continuityQueueStats: string | null;
} {
  const descriptor = formatContinuityDescriptor(continuity);
  const descriptorWithQueue = formatContinuityDescriptor(continuity, { includeQueueStats: true });
  const queueStats = formatContinuityQueueStats(continuity);
  return {
    continuitySummary: continuity ?? null,
    continuityDescriptor: descriptor,
    continuityDescriptorWithQueue: descriptorWithQueue,
    continuityReason: continuity?.reason ?? null,
    continuityApplied: continuity?.applied ?? null,
    continuityAttempted: continuity?.attempted ?? null,
    continuitySourceSessionId: continuity?.attemptedSourceSessionId ?? null,
    continuitySourcePool: continuity?.sourcePool ?? null,
    continuityQueuedSessionCount: continuity?.queuedSessionCount ?? null,
    continuityUniqueQueuedSessionCount: continuity?.uniqueQueuedSessionCount ?? null,
    continuityDuplicateSessionCount: continuity?.duplicateSessionCount ?? null,
    continuitySearchedSessionCount: continuity?.searchedSessionCount ?? null,
    continuityQueueStats: queueStats
  };
}

function resolveManifestAcceptedScoreThreshold(manifest: GenerationManifest): number {
  if (typeof manifest.selectionHints?.minAcceptedScore === "number") {
    return manifest.selectionHints.minAcceptedScore;
  }
  if (isMascotTargetStyle(manifest.qualityProfile?.targetStyle)) {
    return 0.58;
  }
  return manifest.qualityProfile?.qualityTier === "production" ? 0.74 : 0.67;
}

function buildHitlSessionStatusMessage(input: {
  viewToGenerate: CharacterGenerationView | undefined;
  missingGeneratedViews: CharacterView[];
  lowQualityGeneratedViews: CharacterView[];
  coherenceIssues?: string[];
  packCoherence?: PackCoherenceDiagnostics;
  autoReroute?: AutoRerouteDiagnostics;
  rigStability?: RigStabilityDiagnostics;
  selectionRisk?: SelectionRiskAssessment;
  qualityEmbargo?: QualityEmbargoAssessment;
  finalQualityFirewall?: FinalQualityFirewallAssessment;
  continuity: GenerationManifest["reference"]["continuity"] | undefined;
}): string {
  const continuitySentence = formatContinuitySentence(input.continuity);
  const continuityDescriptor = formatContinuityDescriptor(input.continuity);
  const continuityQueueStats = formatContinuityQueueStats(input.continuity);
  const continuityQueueStatusSuffix = continuityQueueStats ? ` Queue: ${continuityQueueStats}.` : "";
  const continuityQueuePipeSuffix = continuityQueueStats ? ` | ${continuityQueueStats}` : "";
  const continuityDescriptorPipeSuffix = continuityDescriptor ? ` | ${continuityDescriptor}` : "";
  const autoRerouteSentence = input.autoReroute?.attempted
    ? input.autoReroute.recovered
      ? " Auto-reroute recovered the pack once before review."
      : " Auto-reroute already ran and still needs review."
    : "";
  const selectionRiskSentence =
    input.selectionRisk && input.selectionRisk.level !== "none"
      ? ` Selection risk=${summarizeSelectionRisk(input.selectionRisk)}.`
      : "";
  const rigStabilitySentence =
    input.rigStability && input.rigStability.severity !== "none"
      ? ` Rig stability=${input.rigStability.summary}.`
      : "";
  const qualityEmbargoSentence =
    input.qualityEmbargo && input.qualityEmbargo.level !== "none"
      ? ` Quality embargo=${summarizeQualityEmbargo(input.qualityEmbargo)}.`
      : "";
  const finalQualityFirewallSentence =
    input.finalQualityFirewall && input.finalQualityFirewall.level !== "none"
      ? ` Final quality firewall=${summarizeFinalQualityFirewall(input.finalQualityFirewall)}.`
      : "";

  if (input.viewToGenerate) {
    return `Candidates ready for view ${input.viewToGenerate}. Pick to continue.${autoRerouteSentence}${rigStabilitySentence}${selectionRiskSentence}${qualityEmbargoSentence}${finalQualityFirewallSentence}${continuitySentence}${continuityQueueStatusSuffix}`;
  }
  if (input.missingGeneratedViews.length > 0) {
    return `Partial generation complete. Missing: ${input.missingGeneratedViews.join(", ")}${autoRerouteSentence}${rigStabilitySentence}${selectionRiskSentence}${qualityEmbargoSentence}${finalQualityFirewallSentence}${continuityDescriptorPipeSuffix}${continuityQueuePipeSuffix}`;
  }
  if (input.lowQualityGeneratedViews.length > 0) {
    return `Candidates generated but quality below threshold for: ${input.lowQualityGeneratedViews.join(", ")}${autoRerouteSentence}${rigStabilitySentence}${selectionRiskSentence}${qualityEmbargoSentence}${finalQualityFirewallSentence}${continuityDescriptorPipeSuffix}${continuityQueuePipeSuffix}`;
  }
  if (Array.isArray(input.coherenceIssues) && input.coherenceIssues.length > 0) {
    const packSummary = input.packCoherence
      ? ` severity=${input.packCoherence.severity} score=${input.packCoherence.score.toFixed(2)}`
      : "";
    return `Candidates generated but pack coherence needs review:${packSummary} ${input.coherenceIssues.join(", ")}${autoRerouteSentence}${rigStabilitySentence}${selectionRiskSentence}${qualityEmbargoSentence}${finalQualityFirewallSentence}${continuityDescriptorPipeSuffix}${continuityQueuePipeSuffix}`;
  }
  return `Candidates ready. Waiting for pick.${autoRerouteSentence}${rigStabilitySentence}${selectionRiskSentence}${qualityEmbargoSentence}${finalQualityFirewallSentence}${continuitySentence}${continuityQueueStatusSuffix}`;
}

async function persistSelectedCandidates(input: {
  prisma: PrismaClient;
  sessionId?: string;
  episodeId: string;
  episodeChannelId: string;
  jobDbId: string;
  character: CharacterPackJobPayload;
  selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
  manifest: GenerationManifest;
  manifestPath: string;
  maxAttempts: number;
  retryBackoffMs: number;
  helpers: GenerationHelpers;
  source: "auto" | "hitl";
  providerName: string;
  workflowHash: string;
}): Promise<void> {
  const {
    prisma,
    sessionId,
    episodeId,
    episodeChannelId,
    jobDbId,
    character,
    selectedByView,
    manifest,
    manifestPath,
    maxAttempts,
    retryBackoffMs,
    helpers,
  source,
  providerName,
  workflowHash
  } = input;

  const acceptedScoreThreshold = resolveManifestAcceptedScoreThreshold(manifest);
  const packCoherence = buildPackCoherenceDiagnostics({
    selectedByView,
    targetStyle: manifest.qualityProfile?.targetStyle,
    acceptedScoreThreshold,
    speciesId: manifest.species
  });
  const attemptedSelectionSummary = summarizeSelectionCandidateSummaryByView({
    selectedByView,
    targetStyle: manifest.qualityProfile?.targetStyle,
    acceptedScoreThreshold
  });
  const rigStability = assessRigStability({
    selectedByView,
    packCoherence,
    targetStyle: manifest.qualityProfile?.targetStyle,
    speciesId: manifest.species,
    autoReroute: manifest.autoReroute
  });
  const selectionRisk = assessAutoSelectionRisk({
    selectedByView,
    packCoherence,
    rigStability,
    targetStyle: manifest.qualityProfile?.targetStyle,
    acceptedScoreThreshold,
    autoReroute: manifest.autoReroute,
    speciesId: manifest.species
  });
  const qualityEmbargo = assessQualityEmbargo({
    selectedByView,
    rigStability,
    targetStyle: manifest.qualityProfile?.targetStyle,
    acceptedScoreThreshold,
    autoReroute: manifest.autoReroute
  });
  const packDefectSummary = buildPackDefectSummary({
    selectedByView,
    workflowStages: manifest.workflowStages
  });
  const finalQualityFirewall = assessFinalQualityFirewall({
    selectedByView,
      targetStyle: manifest.qualityProfile?.targetStyle,
      acceptedScoreThreshold,
      autoReroute: manifest.autoReroute,
      packCoherence,
      rigStability,
      selectionRisk,
      qualityEmbargo,
      packDefectSummary
    });
  const requiresSelectionReview =
    rigStability.severity === "block" ||
    packCoherence.severity === "block" ||
    qualityEmbargo.level === "block" ||
    finalQualityFirewall.level === "block" ||
    (source === "auto" &&
      (rigStability.reviewOnly ||
        selectionRisk.level !== "none" ||
        qualityEmbargo.level === "review" ||
        finalQualityFirewall.level === "review"));
  const decisionOutcome = buildSelectionDecisionOutcome({
    kind: source === "hitl" ? "hitl_selected" : requiresSelectionReview ? "hitl_review" : "auto_selected",
    sourceStage:
      (Array.isArray(manifest.workflowStages) && manifest.workflowStages.length > 0
        ? manifest.workflowStages.at(-1)?.stage
        : undefined) ?? manifest.providerMeta?.workflowStage,
    missingGeneratedViews: [],
    lowQualityGeneratedViews: [],
    selectedByView,
    packCoherence,
    autoReroute: manifest.autoReroute,
    targetStyle: manifest.qualityProfile?.targetStyle,
    acceptedScoreThreshold,
    rigStability,
    selectionRisk,
    qualityEmbargo,
    finalQualityFirewall
  });
  manifest.packCoherence = packCoherence;
  manifest.providerMeta = {
    ...(manifest.providerMeta ?? {}),
    selectionDiagnostics: {
      ...(isRecord(manifest.providerMeta?.selectionDiagnostics)
        ? manifest.providerMeta?.selectionDiagnostics
        : {}),
      finalSelectionSource: source,
      selectedCandidateSummaryByView: attemptedSelectionSummary,
      packCoherence,
      rigStability,
      selectionRisk,
      qualityEmbargo,
      packDefectSummary,
      finalQualityFirewall,
      decisionOutcome
    }
  };

  if (requiresSelectionReview) {
    manifest.status = "PENDING_HITL";
    manifest.selectedByView = {};
    const blockedManifest = withManifestHashes({
      ...manifest,
      schemaVersion: "1.0"
    });
    fs.writeFileSync(manifestPath, `${JSON.stringify(blockedManifest, null, 2)}\n`, "utf8");

    const coherenceSummary = `${packCoherence.issues.join(", ")} (score=${packCoherence.score.toFixed(2)})`;
    const rigStabilitySummary = rigStability.summary;
    const selectionRiskSummary = summarizeSelectionRisk(selectionRisk);
    const qualityEmbargoSummary = summarizeQualityEmbargo(qualityEmbargo);
    const finalQualityFirewallSummary = summarizeFinalQualityFirewall(finalQualityFirewall);
    const blockedMessage =
      rigStability.severity === "block"
        ? `Selected candidate pack failed rig stability guard: ${rigStabilitySummary}`
        : packCoherence.severity === "block"
        ? `Selected candidate pack failed coherence gate: ${coherenceSummary}`
        : finalQualityFirewall.level === "block"
          ? `Selected candidate pack failed final quality firewall: ${finalQualityFirewallSummary}`
        : qualityEmbargo.level === "block"
          ? `Selected candidate pack failed quality embargo: ${qualityEmbargoSummary}`
        : finalQualityFirewall.level === "review"
          ? `Auto-selected pack failed final quality firewall review gate: ${finalQualityFirewallSummary}`
        : `Auto-selected pack failed high-risk review gate: ${selectionRiskSummary}`;

    await helpers.logJob(jobDbId, "warn", "Selected candidate pack blocked by selection gate", {
      source,
      provider: providerName,
      manifestPath,
      rigStability,
      packCoherence,
      selectionRisk,
      qualityEmbargo,
      packDefectSummary,
      finalQualityFirewall,
      selectedCandidateSummaryByView: attemptedSelectionSummary
    });

    if (character.buildJobDbId) {
      await helpers.setJobStatus(character.buildJobDbId, "CANCELLED", {
        lastError: blockedMessage,
        finishedAt: new Date()
      });
      await helpers.logJob(character.buildJobDbId, "warn", "Cancelled after selection gate blocked selected pack", {
        source: `worker:generate-character-assets:${source}`,
        manifestPath,
        rigStability,
        packCoherence,
        selectionRisk,
        qualityEmbargo,
        finalQualityFirewall
      });
    }

    if (character.previewJobDbId) {
      await helpers.setJobStatus(character.previewJobDbId, "CANCELLED", {
        lastError: blockedMessage,
        finishedAt: new Date()
      });
      await helpers.logJob(character.previewJobDbId, "warn", "Cancelled after selection gate blocked selected pack", {
        source: `worker:generate-character-assets:${source}`,
        manifestPath,
        packCoherence,
        selectionRisk,
        qualityEmbargo
      });
    }

    await prisma.agentSuggestion.create({
      data: {
        episodeId,
        jobId: jobDbId,
        type: "HITL_REVIEW",
        status: "PENDING",
        title: "Selected pack needs re-pick",
        summary:
          rigStability.severity === "block"
            ? `Selected candidates still fail the rig stability guard: ${rigStabilitySummary}. Manual compare or full-pack recreate is recommended.`
            : packCoherence.severity === "block"
            ? `Selected candidates still fail the pack coherence gate: ${coherenceSummary}. Pick a different combination or regenerate weak views.`
            : finalQualityFirewall.level === "block"
              ? `Selected candidates still fail the final quality firewall: ${finalQualityFirewallSummary}. Recreate the pack or replace persistent weak views.`
            : qualityEmbargo.level === "block"
              ? `Selected candidates still fail the quality embargo: ${qualityEmbargoSummary}. Recreate the pack or replace blocked views.`
            : finalQualityFirewall.level === "review"
              ? `Auto-selected candidates tripped the final quality firewall: ${finalQualityFirewallSummary}. Manual pick or full-pack recreate is recommended.`
            : `Auto-selected candidates tripped the high-risk review gate: ${selectionRiskSummary}. Manual pick or full-pack recreate is recommended.`,
        payload: toPrismaJson({
          manifestPath,
          provider: providerName,
          source,
          rigStability,
          packCoherence,
          selectionRisk,
          qualityEmbargo,
          packDefectSummary,
          finalQualityFirewall,
          selectedCandidateSummaryByView: attemptedSelectionSummary,
          ...toFlatContinuityFields(blockedManifest.reference.continuity)
        })
      }
    });

    if (sessionId) {
      const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
      if (sessionDelegate) {
        await sessionDelegate.update({
          where: { id: sessionId },
          data: {
            status: "READY",
            statusMessage: buildHitlSessionStatusMessage({
              viewToGenerate: undefined,
              missingGeneratedViews: [],
              lowQualityGeneratedViews: [],
              coherenceIssues: packCoherence.issues,
              packCoherence,
              rigStability,
              selectionRisk,
              qualityEmbargo,
              finalQualityFirewall,
              continuity: blockedManifest.reference.continuity
            })
          }
        });
      }
    }

    throw new Error(blockedMessage);
  }

  const selectedAssets = new Map<CharacterView, { assetId: string; originalKey: string; ingestJobId: string }>();
  const allViews: CharacterView[] = ["front", "threeQuarter", "profile"];

  for (const [view, scoredCandidate] of Object.entries(selectedByView) as Array<[CharacterView, ScoredCandidate]>) {
    const candidate = scoredCandidate.candidate;
    const extension = candidate.mimeType.includes("svg") ? "svg" : "png";
    const originalKey = makeStorageKey(
      `characters/generated/${episodeId}/${jobDbId}`,
      `${view}_candidate_${candidate.candidateIndex}.${extension}`
    );

    const putResult = await putAssetObject(originalKey, candidate.data, candidate.mimeType);

    const assetData = {
      channelId: episodeChannelId,
      type: "IMAGE" as const,
      assetType: "CHARACTER_VIEW" as const,
      status: "QUEUED" as const,
      mime: candidate.mimeType,
      sizeBytes: BigInt(candidate.data.byteLength),
      storageKey: originalKey,
      originalKey,
      contentType: candidate.mimeType,
      bytes: BigInt(candidate.data.byteLength),
      sha256: null,
      qcJson: toPrismaJson({
        ok: true,
        stage: source === "hitl" ? "generated_selected" : "generated",
        provider: candidate.provider,
        candidateId: candidate.id,
        qualityProfileId: manifest.qualityProfileId ?? null,
        score: scoredCandidate.score,
        scoreBreakdown: scoredCandidate.breakdown,
        warnings: scoredCandidate.warnings,
        rejections: scoredCandidate.rejections,
        providerMeta: candidate.providerMeta ?? null,
        minioWarning: putResult.minioError ?? null
      })
    };

    let asset = await prisma.asset.findFirst({
      where: {
        storageKey: originalKey
      }
    });
    if (!asset) {
      asset = await prisma.asset.create({
        data: assetData
      });
    }

    const ingestPayload: AssetIngestJobPayload = {
      assetId: asset.id,
      assetType: "character_view",
      originalKey,
      mime: candidate.mimeType
    };

    await handleAssetIngestJob({
      prisma,
      payload: ingestPayload,
      bullmqJobId: `inline-asset-ingest-${asset.id}`
    });
    const ingestJobId = `inline-asset-ingest-${asset.id}`;

    selectedAssets.set(view, {
      assetId: asset.id,
      originalKey,
      ingestJobId
    });

    manifest.selectedByView[view] = {
      candidateId: candidate.id,
      assetId: asset.id,
      assetIngestJobId: ingestJobId
    };
  }

  const existingAssetIds = character.assetIds;
  const resolvedAssetIds: Partial<Record<CharacterView, string>> = {};
  for (const view of allViews) {
    const fromSelected = selectedAssets.get(view)?.assetId;
    const fromExisting = existingAssetIds?.[view];
    const resolved = fromSelected ?? fromExisting;
    if (!resolved) {
      throw new Error(`Missing assetId for required view=${view}`);
    }
    resolvedAssetIds[view] = resolved;
  }
  const assetIds: CharacterAssetSelection = {
    front: resolvedAssetIds.front!,
    threeQuarter: resolvedAssetIds.threeQuarter!,
    profile: resolvedAssetIds.profile!
  };

  const existingSelectedIds = character.generation?.selectedCandidateIds;
  const manifestSelectedByView = manifest.selectedByView ?? {};
  const resolvedSelectedCandidateIds: Partial<Record<CharacterView, string>> = {};
  for (const view of allViews) {
    const fromSelected = selectedByView[view]?.candidate.id;
    const fromManifest = manifestSelectedByView[view]?.candidateId;
    const fromExisting = existingSelectedIds?.[view];
    const resolved = fromSelected ?? fromManifest ?? fromExisting;
    if (!resolved) {
      throw new Error(`Missing selectedCandidateId for required view=${view}`);
    }
    resolvedSelectedCandidateIds[view] = resolved;
  }

  const frontSeedFromSelected = selectedByView.front?.candidate.seed;
  const frontCandidateId = resolvedSelectedCandidateIds.front!;
  const frontSeedFromManifest = manifest.candidates.find((row) => row.id === frontCandidateId)?.seed;
  const resolvedSeed = frontSeedFromSelected ?? frontSeedFromManifest ?? character.generation?.seed ?? 101;

  const buildJobId = character.buildJobDbId;
  if (!buildJobId) {
    throw new Error("payload.character.buildJobDbId is required for generation pipeline");
  }

  const buildPayload: EpisodeJobPayload = {
    jobDbId: buildJobId,
    episodeId,
    schemaChecks: [],
    character: {
      characterPackId: character.characterPackId,
      version: character.version,
      buildJobDbId: buildJobId,
      previewJobDbId: character.previewJobDbId,
      assetIds,
      generation: {
        ...(sessionId ? { sessionId } : {}),
        mode: manifest.mode === "reference" ? "reference" : "new",
        provider:
          providerName === "comfyui" ? "comfyui" : providerName === "remoteApi" ? "remoteApi" : "mock",
        promptPreset: manifest.promptPreset,
        species: normalizeGenerationSpecies(manifest.species),
        positivePrompt: manifest.positivePrompt,
        negativePrompt: manifest.negativePrompt,
        seed: resolvedSeed,
        candidateCount: manifest.candidates.length,
        manifestPath,
        selectedCandidateIds: {
          front: resolvedSelectedCandidateIds.front!,
          threeQuarter: resolvedSelectedCandidateIds.threeQuarter!,
          profile: resolvedSelectedCandidateIds.profile!
        }
      }
    }
  };

  await helpers.logJob(buildJobId, "info", "Transition -> QUEUED", {
    source: "worker:generate-character-assets",
    parentJobDbId: jobDbId,
    assetIds
  });

  const buildBull = await helpers.addEpisodeJob(
    BUILD_CHARACTER_PACK_JOB_NAME,
    buildPayload,
    maxAttempts,
    retryBackoffMs
  );
  const buildBullmqJobId = buildBull.id === undefined ? buildJobId : String(buildBull.id);

  await prisma.job.update({
    where: {
      id: buildJobId
    },
    data: {
      status: "QUEUED",
      bullmqJobId: buildBullmqJobId,
      lastError: null,
      finishedAt: null
    }
  });

  await helpers.logJob(buildJobId, "info", "Transition -> ENQUEUED", {
    source: "worker:generate-character-assets",
    bullmqJobId: buildBullmqJobId,
    assetIds
  });

  const hashedManifest = withManifestHashes({
    ...manifest,
    schemaVersion: "1.0"
  });
  fs.writeFileSync(manifestPath, `${JSON.stringify(hashedManifest, null, 2)}\n`, "utf8");

  await helpers.logJob(
    jobDbId,
    "info",
    source === "hitl" ? "Character assets selected from HITL and queued" : "Character assets generated and auto-selected",
    {
      provider: providerName,
      workflowHash,
      inputHash: hashedManifest.inputHash,
      manifestHash: hashedManifest.manifestHash,
      ...toFlatContinuityFields(hashedManifest.reference.continuity),
      manifestPath,
      selectedAssetIds: assetIds,
      buildJobDbId: buildJobId,
      buildBullmqJobId
    }
  );

  if (sessionId) {
    await markSessionCandidatesPicked({
      prisma,
      sessionId,
      selectedByView: {
        front: {
          candidateId: resolvedSelectedCandidateIds.front!,
          assetId: assetIds.front
        },
        threeQuarter: {
          candidateId: resolvedSelectedCandidateIds.threeQuarter!,
          assetId: assetIds.threeQuarter
        },
        profile: {
          candidateId: resolvedSelectedCandidateIds.profile!,
          assetId: assetIds.profile
        }
      }
    });

    const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
    if (sessionDelegate) {
      await sessionDelegate.update({
        where: { id: sessionId },
        data: {
          status: "READY",
          statusMessage:
            source === "hitl"
              ? `HITL selection applied and build queued.${formatContinuitySentence(manifest.reference.continuity)}`
              : `Auto-selected and build queued.${formatContinuitySentence(manifest.reference.continuity)}`
        }
      });
    }
  }
}

export async function handleGenerateCharacterAssetsJob(input: {
  prisma: PrismaClient;
  payload: EpisodeJobPayload;
  jobDbId: string;
  maxAttempts: number;
  retryBackoffMs: number;
  helpers: GenerationHelpers;
}): Promise<void> {
  const { prisma, payload, jobDbId, maxAttempts, retryBackoffMs, helpers } = input;
  const character = requireCharacter(payload);
  const continuityAutoOverride = resolveAutoContinuityOverride(character.generation);
  const generation = normalizeGenerationConfig(character.generation);
  let sessionId: string | undefined;

  try {

  await helpers.setEpisodeStatus(payload.episodeId, "GENERATING");

  const episode = await prisma.episode.findUnique({
    where: { id: payload.episodeId },
    select: {
      id: true,
      topic: true,
      channelId: true
    }
  });

  if (!episode) {
    throw new Error(`Episode not found: ${payload.episodeId}`);
  }

  const channelBible = await prisma.channelBible.findFirst({
    where: {
      channelId: episode.channelId,
      isActive: true
    },
    orderBy: {
      version: "desc"
    },
    select: {
      id: true,
      json: true
    }
  });

  const styleHints = deriveStyleHintsFromChannelBible(channelBible?.json);
  const promptBundle = buildCharacterPrompt({
    mode: generation.mode,
    presetId: generation.promptPreset,
    speciesId: generation.species,
    positivePrompt: generation.positivePrompt ?? episode.topic,
    negativePrompt: generation.negativePrompt,
    styleHints
  });
  const mascotReferenceBankDiagnostics = summarizeMascotReferenceBankDiagnostics(promptBundle.speciesId);
  const mascotReferenceBankReviewPlan = buildMascotReferenceBankReviewPlan(mascotReferenceBankDiagnostics);
  const mascotReferenceBankReviewChecklist = buildReferenceBankReviewChecklist({
    diagnostics: mascotReferenceBankDiagnostics,
    reviewPlan: mascotReferenceBankReviewPlan
  });
  const continuityConfig = readContinuityReferenceConfig();
  const continuityAutoEnabled = continuityAutoOverride ?? shouldAutoContinuityReference();
  const continuityPolicy = {
    ...continuityConfig,
    requestOverride: continuityAutoOverride ?? null
  };

  let referenceAnalysis: ImageAnalysis | undefined;
  let referenceImageBase64: string | undefined;
  let referenceMimeType: string | undefined;
  let continuityReferenceSessionId: string | null = null;
  let starterReferencePath: string | null = null;
  let starterReferencePathsByView: Partial<Record<CharacterView, string>> | undefined;
  let continuitySnapshot: GenerationManifest["reference"]["continuity"] | undefined;
  if (generation.mode === "reference") {
    continuitySnapshot = {
      enabled: false,
      attempted: false,
      applied: false,
      reason: "reference_mode"
    };
    if (!generation.referenceAssetId) {
      throw new Error("reference mode requires generation.referenceAssetId");
    }

    const referenceAsset = await prisma.asset.findUnique({
      where: { id: generation.referenceAssetId },
      select: {
        id: true,
        channelId: true,
        status: true,
        normalizedKey1024: true,
        normalizedKey2048: true,
        originalKey: true,
        storageKey: true,
        mime: true
      }
    });

    if (!referenceAsset) {
      throw new Error(`reference asset not found: ${generation.referenceAssetId}`);
    }

    if (referenceAsset.channelId !== episode.channelId) {
      throw new Error("reference asset channel mismatch");
    }

    if (referenceAsset.status !== "READY") {
      throw new Error("reference asset must be READY");
    }

    const referenceBuffer = await getAssetObject(normalizeReferenceAssetStorageKey(referenceAsset));
    referenceAnalysis = await analyzeImage(referenceBuffer);
    referenceImageBase64 = referenceBuffer.toString("base64");
    referenceMimeType = referenceAsset.mime ?? "image/png";
  }

  const earlyLimits = readGenerationLimits();
  const earlyViews = generation.viewToGenerate ? [generation.viewToGenerate] : CHARACTER_VIEWS;
  const earlyClamped = clampGenerationRequest(generation, earlyViews.length, earlyLimits);
  const manifestPath = manifestBasePath(jobDbId, generation.manifestPath);
  const referenceSourceManifestPath = resolveManifestReadPath(jobDbId, {
    manifestPath: generation.manifestPath,
    sourceManifestPath: generation.sourceManifestPath
  });
  const progressPath = path.join(path.dirname(manifestPath), "generation_progress.json");
  const writeGenerationProgress = async (progress: number, stage: string, details?: Record<string, unknown>) => {
    const progressPayload = {
      schemaVersion: "1.0",
      updatedAt: new Date().toISOString(),
      jobId: jobDbId,
      episodeId: payload.episodeId,
      characterPackId: character.characterPackId,
      sessionId: sessionId ?? null,
      stage,
      progress,
      details: details ?? {}
    };
    fs.mkdirSync(path.dirname(progressPath), { recursive: true });
    fs.writeFileSync(progressPath, `${JSON.stringify(progressPayload, null, 2)}\n`, "utf8");
    await helpers.setJobStatus(jobDbId, "RUNNING", { progress, lastError: null });
  };
  const session = await upsertGenerationSession({
    prisma,
    generation,
    episodeId: payload.episodeId,
    characterPackId: character.characterPackId,
    promptPresetId: promptBundle.presetId,
    positivePrompt: promptBundle.positivePrompt,
    negativePrompt: promptBundle.negativePrompt,
    seed: generation.seed ?? 101,
    candidateCount: earlyClamped.candidateCount,
    manifestPath,
    statusMessage: generation.viewToGenerate
      ? `Generating candidates for view: ${generation.viewToGenerate}`
      : "Generating candidates for all views."
  });
  sessionId = session.id;
  await writeGenerationProgress(4, "session_ready", {
    sessionId,
    providerRequested: generation.provider ?? null,
    requestedViews: earlyViews,
    candidateCount: earlyClamped.candidateCount
  });
  const selectedCandidateIds = hasCandidateSelection(generation.selectedCandidateIds)
    ? normalizeSelectedCandidateIds(generation.selectedCandidateIds)
    : undefined;

  if (
    !selectedCandidateIds &&
    generation.mode === "new" &&
    !referenceImageBase64 &&
    continuityAutoEnabled
  ) {
    const continuity = await resolveAutoContinuityReference({
      prisma,
      episodeId: payload.episodeId,
      channelId: episode.channelId,
      characterPackId: character.characterPackId,
      currentSessionId: sessionId,
      config: continuityConfig
    });
    if (continuity.match) {
      try {
        referenceImageBase64 = continuity.match.referenceImageBase64;
        referenceMimeType = continuity.match.referenceMimeType;
        continuityReferenceSessionId = continuity.match.sessionId;
        const continuityBuffer = Buffer.from(continuity.match.referenceImageBase64, "base64");
        referenceAnalysis = await analyzeImage(continuityBuffer);
        await helpers.logJob(jobDbId, "info", "Auto continuity reference applied", {
          sourceSessionId: continuity.match.sessionId,
          characterPackId: character.characterPackId,
          policy: continuityPolicy,
          diagnostics: {
            ...continuity.diagnostics,
            sourcePool: continuity.match.sourcePool,
            candidatePicked: continuity.match.candidatePicked,
            candidateScore: continuity.match.candidateScore,
            candidateRejectionCount: continuity.match.candidateRejectionCount,
            candidateUpdatedAt: continuity.match.candidateUpdatedAt
          }
        });
        continuitySnapshot = {
          enabled: true,
          attempted: true,
          applied: true,
          reason: "matched",
          attemptedSourceSessionId: continuity.match.sessionId,
          cutoffUpdatedAt: continuity.diagnostics.cutoffUpdatedAt,
          queuedSessionCount: continuity.diagnostics.queuedSessionCount,
          uniqueQueuedSessionCount: continuity.diagnostics.uniqueQueuedSessionCount,
          duplicateSessionCount: continuity.diagnostics.duplicateSessionCount,
          searchedSessionCount: continuity.diagnostics.searchedSessionCount,
          searchedSessionIdsPreview: continuity.diagnostics.searchedSessionIdsPreview,
          preferredPoolCount: continuity.diagnostics.preferredPoolCount,
          fallbackPoolCount: continuity.diagnostics.fallbackPoolCount,
          sourcePool: continuity.match.sourcePool,
          candidatePicked: continuity.match.candidatePicked,
          candidateScore: continuity.match.candidateScore,
          candidateRejectionCount: continuity.match.candidateRejectionCount,
          candidateUpdatedAt: continuity.match.candidateUpdatedAt,
          policy: continuityPolicy
        };
      } catch (error) {
        referenceImageBase64 = undefined;
        referenceMimeType = undefined;
        continuityReferenceSessionId = null;
        referenceAnalysis = undefined;
        await helpers.logJob(jobDbId, "warn", "Auto continuity reference ignored due to invalid source", {
          characterPackId: character.characterPackId,
          sourceSessionId: continuity.match.sessionId,
          policy: continuityPolicy,
          diagnostics: continuity.diagnostics,
          error: errorMessage(error)
        });
        continuitySnapshot = {
          enabled: true,
          attempted: true,
          applied: false,
          reason: "invalid_source",
          attemptedSourceSessionId: continuity.match.sessionId,
          cutoffUpdatedAt: continuity.diagnostics.cutoffUpdatedAt,
          queuedSessionCount: continuity.diagnostics.queuedSessionCount,
          uniqueQueuedSessionCount: continuity.diagnostics.uniqueQueuedSessionCount,
          duplicateSessionCount: continuity.diagnostics.duplicateSessionCount,
          searchedSessionCount: continuity.diagnostics.searchedSessionCount,
          searchedSessionIdsPreview: continuity.diagnostics.searchedSessionIdsPreview,
          preferredPoolCount: continuity.diagnostics.preferredPoolCount,
          fallbackPoolCount: continuity.diagnostics.fallbackPoolCount,
          policy: continuityPolicy
        };
      }
    } else {
      await helpers.logJob(jobDbId, "info", "Auto continuity reference skipped", {
        characterPackId: character.characterPackId,
        policy: continuityPolicy,
        diagnostics: continuity.diagnostics
      });
      continuitySnapshot = {
        enabled: true,
        attempted: true,
        applied: false,
        reason: continuity.diagnostics.reason ?? "skipped",
        cutoffUpdatedAt: continuity.diagnostics.cutoffUpdatedAt,
        queuedSessionCount: continuity.diagnostics.queuedSessionCount,
        uniqueQueuedSessionCount: continuity.diagnostics.uniqueQueuedSessionCount,
        duplicateSessionCount: continuity.diagnostics.duplicateSessionCount,
        searchedSessionCount: continuity.diagnostics.searchedSessionCount,
        searchedSessionIdsPreview: continuity.diagnostics.searchedSessionIdsPreview,
        preferredPoolCount: continuity.diagnostics.preferredPoolCount,
        fallbackPoolCount: continuity.diagnostics.fallbackPoolCount,
        policy: continuityPolicy
      };
    }
  } else if (generation.mode === "new") {
    const hasHitlSelection = Boolean(selectedCandidateIds);
    const hasReferenceAlready = Boolean(referenceImageBase64);
    let reason = "not_attempted";
    if (!continuityAutoEnabled) {
      reason = continuityAutoOverride === false ? "disabled_by_request" : "disabled_by_env";
    } else if (hasHitlSelection) {
      reason = "hitl_selection_present";
    } else if (hasReferenceAlready) {
      reason = "reference_already_present";
    }
    continuitySnapshot = {
      enabled: continuityAutoEnabled,
      attempted: false,
      applied: false,
      reason,
      policy: continuityPolicy
    };
    await helpers.logJob(jobDbId, "info", "Auto continuity reference not attempted", {
      characterPackId: character.characterPackId,
      reason,
      policy: continuityPolicy
      });
  }

  if (
    generation.mode === "new" &&
    !referenceImageBase64 &&
    isMascotTargetStyle(promptBundle.qualityProfile.targetStyle) &&
    (generation.viewToGenerate !== undefined || earlyViews.length === 1)
  ) {
    const mascotSeedReference =
      loadMascotStarterReference(promptBundle.speciesId, "front") ??
      loadMascotFamilyReferenceCached(promptBundle.speciesId, "front");
    if (mascotSeedReference) {
      referenceImageBase64 = mascotSeedReference.referenceImageBase64;
      referenceMimeType = mascotSeedReference.referenceMimeType;
      starterReferencePath = mascotSeedReference.sourcePath;
      starterReferencePathsByView = {
        ...(starterReferencePathsByView ?? {}),
        front: mascotSeedReference.sourcePath
      };
      const starterBuffer = Buffer.from(mascotSeedReference.referenceImageBase64, "base64");
      referenceAnalysis = await analyzeImage(starterBuffer);
      await helpers.logJob(jobDbId, "info", "Mascot seed reference applied", {
        speciesId: promptBundle.speciesId,
        starterReferencePath
      });
    }
  }

  if (selectedCandidateIds) {
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`HITL manifest not found: ${manifestPath}`);
    }

    const parsedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
    if (!isRecord(parsedManifest)) {
      throw new Error("Invalid generation manifest format");
    }

    const manifestCandidates = Array.isArray(parsedManifest.candidates) ? parsedManifest.candidates : [];
    const parsedCandidates = manifestCandidates
      .map((candidate) => parseManifestCandidate(manifestPath, candidate))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

    const byId = new Map(parsedCandidates.map((candidate) => [candidate.id, candidate]));
    const selectedEntries = {
      front: byId.get(selectedCandidateIds.front),
      threeQuarter: byId.get(selectedCandidateIds.threeQuarter),
      profile: byId.get(selectedCandidateIds.profile)
    };

    if (!selectedEntries.front || selectedEntries.front.view !== "front") {
      throw new Error(`Invalid HITL selection for front: ${selectedCandidateIds.front}`);
    }
    if (!selectedEntries.threeQuarter || selectedEntries.threeQuarter.view !== "threeQuarter") {
      throw new Error(`Invalid HITL selection for threeQuarter: ${selectedCandidateIds.threeQuarter}`);
    }
    if (!selectedEntries.profile || selectedEntries.profile.view !== "profile") {
      throw new Error(`Invalid HITL selection for profile: ${selectedCandidateIds.profile}`);
    }

    const toScored = async (entry: (typeof selectedEntries)[keyof typeof selectedEntries]): Promise<ScoredCandidate> => {
      if (!entry) {
        throw new Error("Missing selected candidate");
      }

      if (!fs.existsSync(entry.filePath)) {
        throw new Error(`Selected candidate file missing: ${entry.filePath}`);
      }

      const data = fs.readFileSync(entry.filePath);
      const analysis = await analyzeImage(data);
      const manifestProvider = asString(parsedManifest.provider).trim();
      const candidate: CharacterGenerationCandidate = {
        id: entry.id,
        ...(entry.provider ? { provider: entry.provider } : {}),
        view: entry.view,
        candidateIndex: entry.candidateIndex,
        seed: entry.seed,
        provider:
          manifestProvider === "comfyui"
            ? "comfyui"
            : manifestProvider === "remoteApi"
              ? "remoteApi"
              : "mock",
        prompt: asString(parsedManifest.positivePrompt),
        negativePrompt: asString(parsedManifest.negativePrompt),
        mimeType: entry.mimeType,
        data,
        providerMeta: {
          localCandidatePath: entry.filePath
        }
      };

      return {
        candidate,
        analysis,
        score: clamp01(entry.score),
        styleScore: clamp01(entry.styleScore),
        referenceSimilarity: entry.referenceSimilarity,
        consistencyScore: entry.consistencyScore,
        warnings: entry.warnings,
        rejections: entry.rejections,
        breakdown:
          entry.breakdown ??
          {
            alphaScore: scoreAlphaCoverage(analysis),
            occupancyScore: scoreBBoxOccupancy(analysis),
            sharpnessScore: scoreSharpness(analysis),
            noiseScore: scoreNoise(analysis),
            watermarkScore: scoreWatermarkSafety(analysis),
            resolutionScore: scoreResolutionQuality(analysis),
            referenceScore: entry.referenceSimilarity ?? 0.5,
            styleScore: clamp01(entry.styleScore),
            qualityScore: clamp01(
              scoreAlphaCoverage(analysis) * 0.16 +
                scoreBBoxOccupancy(analysis) * 0.18 +
                scoreSharpness(analysis) * 0.2 +
                scoreNoise(analysis) * 0.12 +
                scoreWatermarkSafety(analysis) * 0.2 +
                scoreResolutionQuality(analysis) * 0.14
            ),
            consistencyScore: entry.consistencyScore,
            generationRound: 0
          }
      };
    };

    const scoredFront = await toScored(selectedEntries.front);
    const scoredThreeQuarter = await toScored(selectedEntries.threeQuarter);
    const scoredProfile = await toScored(selectedEntries.profile);
    const selectedByView: Record<CharacterView, ScoredCandidate> = {
      front: scoredFront,
      threeQuarter: scoredThreeQuarter,
      profile: scoredProfile
    };

    const guardrails = Array.isArray(parsedManifest.guardrails)
      ? parsedManifest.guardrails.filter((item): item is string => typeof item === "string")
      : promptBundle.guardrails;
    const parsedQualityProfile =
      isRecord(parsedManifest.qualityProfile) ? (parsedManifest.qualityProfile as PromptQualityProfile) : undefined;
    const parsedSelectionHints = isRecord(parsedManifest.selectionHints)
      ? {
          ...(typeof parsedManifest.selectionHints.minAcceptedScore === "number"
            ? { minAcceptedScore: parsedManifest.selectionHints.minAcceptedScore }
            : {}),
          ...(typeof parsedManifest.selectionHints.frontMasterMinAcceptedScore === "number"
            ? { frontMasterMinAcceptedScore: parsedManifest.selectionHints.frontMasterMinAcceptedScore }
            : {}),
          ...(typeof parsedManifest.selectionHints.autoRetryRounds === "number"
            ? { autoRetryRounds: parsedManifest.selectionHints.autoRetryRounds }
            : {}),
          ...(typeof parsedManifest.selectionHints.frontMasterCandidateCount === "number"
            ? { frontMasterCandidateCount: parsedManifest.selectionHints.frontMasterCandidateCount }
            : {}),
          ...(typeof parsedManifest.selectionHints.sequentialReference === "boolean"
            ? { sequentialReference: parsedManifest.selectionHints.sequentialReference }
            : {}),
          ...(typeof parsedManifest.selectionHints.prioritizeConsistency === "boolean"
            ? { prioritizeConsistency: parsedManifest.selectionHints.prioritizeConsistency }
            : {})
        }
      : undefined;
    const parsedProviderMeta =
      isRecord(parsedManifest.providerMeta)
        ? (parsedManifest.providerMeta as NonNullable<GenerationManifest["providerMeta"]>)
        : undefined;
    const providerRequestedRaw = asString(parsedManifest.providerRequested).trim();
    const providerWarningRaw = asString(parsedManifest.providerWarning).trim();
    const parsedReference = isRecord(parsedManifest.reference) ? parsedManifest.reference : {};
    const parsedContinuity = parseManifestContinuity(parsedReference.continuity);

    const manifest = withManifestHashes({
      schemaVersion: "1.0",
      status: "HITL_SELECTED",
      sessionId,
      episodeId: payload.episodeId,
      characterPackId: character.characterPackId,
      provider: asString(parsedManifest.provider).trim() || "mock",
      providerRequested: providerRequestedRaw.length > 0 ? providerRequestedRaw : null,
      providerWarning: providerWarningRaw.length > 0 ? providerWarningRaw : null,
      workflowHash: asString(parsedManifest.workflowHash).trim() || "hitl-selection",
      generatedAt: asString(parsedManifest.generatedAt).trim() || new Date().toISOString(),
      mode: asString(parsedManifest.mode).trim() || generation.mode,
      promptPreset: asString(parsedManifest.promptPreset).trim() || promptBundle.presetId,
      species:
        asString(parsedManifest.species).trim() ||
        promptBundle.speciesId ||
        normalizeGenerationSpecies(generation.species),
      qualityProfileId:
        asString(parsedManifest.qualityProfileId).trim() ||
        parsedQualityProfile?.id ||
        promptBundle.qualityProfile.id,
      qualityProfile: parsedQualityProfile ?? promptBundle.qualityProfile,
      positivePrompt: asString(parsedManifest.positivePrompt).trim() || promptBundle.positivePrompt,
      negativePrompt: asString(parsedManifest.negativePrompt).trim() || promptBundle.negativePrompt,
      guardrails,
      selectionHints: parsedSelectionHints ?? promptBundle.selectionHints,
      ...(parsedProviderMeta ? { providerMeta: parsedProviderMeta } : {}),
      reference: {
        assetId:
          typeof parsedReference.assetId === "string"
            ? parsedReference.assetId
            : generation.referenceAssetId ?? null,
        sourceSessionId:
          typeof parsedReference.sourceSessionId === "string" && parsedReference.sourceSessionId.trim().length > 0
            ? parsedReference.sourceSessionId
            : continuityReferenceSessionId,
        starterPath:
          typeof parsedReference.starterPath === "string" && parsedReference.starterPath.trim().length > 0
            ? parsedReference.starterPath
            : starterReferencePath,
        starterPathsByView:
          parsedReference.starterPathsByView &&
          typeof parsedReference.starterPathsByView === "object" &&
          !Array.isArray(parsedReference.starterPathsByView)
            ? (parsedReference.starterPathsByView as Partial<Record<CharacterView, string>>)
            : starterReferencePathsByView,
        phash: typeof parsedReference.phash === "string" ? parsedReference.phash : null,
        palette: Array.isArray(parsedReference.palette)
          ? (parsedReference.palette.filter(
              (item): item is [number, number, number] =>
                Array.isArray(item) &&
                item.length === 3 &&
                item.every((value) => typeof value === "number")
            ) as Array<[number, number, number]>)
          : null,
        continuity: parsedContinuity ?? continuitySnapshot
      },
      candidates: parsedCandidates.map((entry) => ({
        id: entry.id,
        view: entry.view,
        candidateIndex: entry.candidateIndex,
        seed: entry.seed,
        mimeType: entry.mimeType,
        filePath: entry.filePath,
        score: Number(entry.score.toFixed(4)),
        styleScore: Number(entry.styleScore.toFixed(4)),
        referenceSimilarity: entry.referenceSimilarity === null ? null : Number(entry.referenceSimilarity.toFixed(4)),
        consistencyScore: entry.consistencyScore === null ? null : Number(entry.consistencyScore.toFixed(4)),
        warnings: entry.warnings,
        rejections: entry.rejections,
        ...(entry.breakdown ? { breakdown: entry.breakdown } : {}),
        ...(entry.providerMeta ? { providerMeta: entry.providerMeta } : {})
      })),
      selectedByView: {}
    });

    await persistSelectedCandidates({
      prisma,
      sessionId,
      episodeId: payload.episodeId,
      episodeChannelId: episode.channelId,
      jobDbId,
      character,
      selectedByView,
      manifest,
      manifestPath,
      maxAttempts,
      retryBackoffMs,
      helpers,
      source: "hitl",
      providerName: manifest.provider,
      workflowHash: manifest.workflowHash
    });
    return;
  }

  const comfyUiUrl = getComfyUiUrl();
  const remoteApiConfig = getRemoteApiConfig();
  const limits = earlyLimits;
  const requestedViews = earlyViews;
  const clamped = earlyClamped;

  const requestedProvider =
    generation.provider ??
    (comfyUiUrl ? "comfyui" : remoteApiConfig.baseUrl ? "remoteApi" : "mock");

  let providerName = resolveProviderName({
    requestedProvider,
    comfyUiUrl,
    remoteApiBaseUrl: remoteApiConfig.baseUrl
  });
  let providerWarning: string | null = null;
  if (mascotReferenceBankDiagnostics.status === "scaffold_only") {
    const reviewSlotsSummary =
      mascotReferenceBankReviewPlan.requiredManualSlots.length > 4
        ? `${mascotReferenceBankReviewPlan.requiredManualSlots.slice(0, 4).join(", ")} +${mascotReferenceBankReviewPlan.requiredManualSlots.length - 4} more`
        : mascotReferenceBankReviewPlan.requiredManualSlots.join(", ");
    const requiredAssetsSummary =
      mascotReferenceBankDiagnostics.requiredAssetSlots.length > 3
        ? `${mascotReferenceBankDiagnostics.requiredAssetSlots.slice(0, 3).join(", ")} +${mascotReferenceBankDiagnostics.requiredAssetSlots.length - 3} more`
        : mascotReferenceBankDiagnostics.requiredAssetSlots.join(", ");
    providerWarning =
      `${promptBundle.speciesId} reference bank is scaffold-only (missing roles: ${mascotReferenceBankDiagnostics.missingRoles.join(", ") || "none"}). ` +
      `${mascotReferenceBankDiagnostics.statusMismatch ? `Declared status ${mascotReferenceBankDiagnostics.declaredStatus} is being downgraded. ` : ""}` +
      `Review-only pack guidance applies${reviewSlotsSummary.length > 0 ? `; manual slots: ${reviewSlotsSummary}` : ""}` +
      `${requiredAssetsSummary.length > 0 ? `; required assets: ${requiredAssetsSummary}` : ""}.`;
  }

  if (requestedProvider === "comfyui" && !comfyUiUrl && remoteApiConfig.baseUrl) {
    providerWarning = [
      providerWarning,
      "COMFY_ADAPTER_URL/COMFYUI_BASE_URL is not configured. Falling back to remoteApi provider."
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" | ");
  } else if (requestedProvider === "comfyui" && !comfyUiUrl) {
    providerName = "mock";
    providerWarning = [
      providerWarning,
      "COMFY_ADAPTER_URL/COMFYUI_BASE_URL is not configured. Falling back to mock provider."
    ]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" | ");
  } else if (requestedProvider === "remoteApi" && !remoteApiConfig.baseUrl) {
    providerName = "mock";
    providerWarning = [providerWarning, "IMAGEGEN_REMOTE_BASE_URL is not configured. Falling back to mock provider."]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" | ");
  }

  const budget = await evaluateBudget(prisma, clamped.totalImages, limits);
  if (budget.wouldExceed) {
    if (limits.budgetFallbackToMock && providerName !== "mock") {
      providerWarning = `Budget exceeded (${budget.monthSpentUsd.toFixed(2)} / ${budget.monthBudgetUsd.toFixed(
        2
      )} USD). Falling back to mock provider.`;
      providerName = "mock";
    } else if (budget.wouldExceed) {
      throw new Error(
        `Image generation rejected by budget limit (monthSpent=${budget.monthSpentUsd.toFixed(
          2
        )}, estimatedRun=${budget.estimatedCostThisRunUsd.toFixed(2)}, budget=${budget.monthBudgetUsd.toFixed(2)})`
      );
    }
  }

  let provider = createCharacterProvider({
    provider: providerName,
    comfyUiUrl,
    remoteApi: {
      ...remoteApiConfig,
      maxRetries: limits.maxRetries,
      estimatedCostUsdPerImage: limits.costPerImageUsd
    }
  });

  const qualityConfig = readGenerationQualityConfig();
  const autoRerouteConfig = readAutoRerouteConfig();
  const acceptedScoreThreshold = Math.max(
    qualityConfig.minAcceptedScore,
    promptBundle.selectionHints.minAcceptedScore ?? 0
  );
  const frontAnchorAcceptedScoreThreshold =
    typeof promptBundle.selectionHints.frontMasterMinAcceptedScore === "number"
      ? promptBundle.selectionHints.frontMasterMinAcceptedScore
      : acceptedScoreThreshold;
  const allowLowQualityMockFallback =
    qualityConfig.lowQualityFallbackToMock && !isMascotTargetStyle(promptBundle.qualityProfile.targetStyle);
  const strictRealProvider =
    isMascotTargetStyle(promptBundle.qualityProfile.targetStyle) && requestedProvider === "comfyui";
  const providerRequestTimeoutMs = toPositiveInt(process.env.COMFY_ADAPTER_TIMEOUT_MS, 360_000);
  const providerStageTimeoutOverrideMs = toPositiveInt(process.env.CHARACTER_PROVIDER_STAGE_TIMEOUT_MS, 0);
  const candidatePostprocessTimeoutMs = toPositiveInt(
    process.env.CHARACTER_CANDIDATE_POSTPROCESS_TIMEOUT_MS,
    120_000
  );
  const candidateAnalysisTimeoutMs = toPositiveInt(
    process.env.CHARACTER_CANDIDATE_ANALYSIS_TIMEOUT_MS,
    120_000
  );
  const speciesRetryBonus = promptBundle.speciesId === "wolf" ? 1 : 0;
  const autoRetryRounds =
    Math.max(qualityConfig.autoRetryRounds, promptBundle.selectionHints.autoRetryRounds ?? 0) + speciesRetryBonus;
  const sequentialReferenceEnabled =
    (promptBundle.selectionHints.sequentialReference ?? qualityConfig.sequentialReference) === true;
  const candidatesDir = path.join(path.dirname(manifestPath), "candidates");
  fs.mkdirSync(candidatesDir, { recursive: true });

  const scored: ScoredCandidate[] = [];
  let autoRerouteDiagnostics: AutoRerouteDiagnostics | undefined;
  const workflowStageRuns: NonNullable<GenerationManifest["workflowStages"]> = [];
  let preferredSelectionByView: Partial<Record<CharacterView, ScoredCandidate>> = {};
  const requestedBaseStage: GenerationStageKey = generation.viewToGenerate === "front" ? "front" : "angles";
  const requestedBasePassPrefix = generation.viewToGenerate === "front" ? "front" : "angles";
  const repairEmbargoedCandidateIdsByView: Partial<Record<CharacterView, Set<string>>> = {};
  const repairEmbargoedFallbackViews = new Set<CharacterView>();
  const isRepairEmbargoedSelection = (view: CharacterView, candidate: ScoredCandidate): boolean => {
    if (repairEmbargoedCandidateIdsByView[view]?.has(candidate.candidate.id)) {
      return true;
    }
    return repairEmbargoedFallbackViews.has(view);
  };
  const summarizeBestScores = (views: CharacterView[]) => {
    const bestByView = groupBestByView(scored);
    return Object.fromEntries(
      views.map((view) => [
        view,
        bestByView[view]
          ? {
              score: Number(bestByView[view]!.score.toFixed(4)),
              warnings: bestByView[view]!.warnings.length,
              rejections: bestByView[view]!.rejections.length
            }
          : null
      ])
    );
  };
  const recordSideViewAcceptanceGateStage = (input: {
    views: CharacterView[];
    selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
    gateDecisionsByView: Partial<Record<CharacterView, SideViewAcceptanceGateDecisionSummary>>;
    origin?: CharacterWorkflowStageOrigin;
    passLabel?: string;
    reasonCodes?: string[];
    triggerViews?: CharacterView[];
    seedOffset?: number;
  }) => {
    const stageBestCandidateSummaryByView = summarizeStageBestCandidateByView({
      views: input.views,
      bestByView: input.selectedByView,
      acceptedScoreThreshold,
      targetStyle: promptBundle.qualityProfile.targetStyle,
      speciesId: promptBundle.speciesId
    });
    const stageObservedDefectFamiliesByView = summarizeObservedDefectFamiliesByView({
      views: input.views,
      bestByView: input.selectedByView
    });
    const stageExitSummary = summarizeStageExitByView(stageBestCandidateSummaryByView);
    const runtimeVariantTags = dedupeStrings(
      Object.values(input.gateDecisionsByView)
        .flatMap((summary) => (summary.chosenStage ? [`chosen:${summary.chosenStage}`] : []))
        .filter((entry) => entry.length > 0)
    );
    workflowStageRuns.push({
      stage: "side_view_acceptance_gate",
      templateVersion: "synthetic_side_view_acceptance_gate_v1",
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.passLabel ? { passLabel: input.passLabel } : {}),
      ...(Array.isArray(input.reasonCodes) && input.reasonCodes.length > 0 ? { reasonCodes: input.reasonCodes } : {}),
      ...(Array.isArray(input.triggerViews) && input.triggerViews.length > 0 ? { triggerViews: input.triggerViews } : {}),
      ...(typeof input.seedOffset === "number" ? { seedOffset: input.seedOffset } : {}),
      views: input.views,
      candidateCount: 3,
      acceptedScoreThreshold: Number(acceptedScoreThreshold.toFixed(4)),
      roundsAttempted: 1,
      ...(stageObservedDefectFamiliesByView ? { observedDefectFamiliesByView: stageObservedDefectFamiliesByView } : {}),
      ...stageExitSummary,
      ...(runtimeVariantTags.length > 0 ? { runtimeVariantTags } : {}),
      ...(stageBestCandidateSummaryByView ? { bestCandidateSummaryByView: stageBestCandidateSummaryByView } : {}),
      ...(Object.keys(input.gateDecisionsByView).length > 0 ? { gateDecisionsByView: input.gateDecisionsByView } : {})
    });
  };
  const applyRepairEmbargoDecisions = (
    views: CharacterView[],
    repairTriageByView: Partial<Record<CharacterView, RepairTriageDecisionSummary>>
  ) => {
    for (const view of dedupeCharacterViews(views)) {
      const triage = repairTriageByView[view];
      if (!triage) {
        continue;
      }
      if (triage.decision === "reject_view") {
        const sourceCandidateId =
          typeof triage.sourceCandidateId === "string" && triage.sourceCandidateId.trim().length > 0
            ? triage.sourceCandidateId.trim()
            : undefined;
        if (sourceCandidateId) {
          const existing = repairEmbargoedCandidateIdsByView[view] ?? new Set<string>();
          existing.add(sourceCandidateId);
          repairEmbargoedCandidateIdsByView[view] = existing;
          repairEmbargoedFallbackViews.delete(view);
        } else {
          repairEmbargoedFallbackViews.add(view);
        }
      } else {
        repairEmbargoedFallbackViews.delete(view);
      }
    }
  };
  const recordRepairTriageGateStage = (input: {
    views: CharacterView[];
    selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
    repairTriageByView: Partial<Record<CharacterView, RepairTriageDecisionSummary>>;
    origin?: CharacterWorkflowStageOrigin;
    passLabel?: string;
    reasonCodes?: string[];
    triggerViews?: CharacterView[];
    seedOffset?: number;
  }) => {
    const stageBestCandidateSummaryByView = summarizeStageBestCandidateByView({
      views: input.views,
      bestByView: input.selectedByView,
      acceptedScoreThreshold,
      targetStyle: promptBundle.qualityProfile.targetStyle,
      speciesId: promptBundle.speciesId
    });
    const stageObservedDefectFamiliesByView = summarizeObservedDefectFamiliesByView({
      views: input.views,
      bestByView: input.selectedByView
    });
    const stageExitSummary = summarizeStageExitByView(stageBestCandidateSummaryByView);
    const runtimeVariantTags = dedupeStrings(
      Object.values(input.repairTriageByView)
        .map((summary) => `triage:${summary.decision}`)
        .filter((entry) => entry.length > 0)
    );
    workflowStageRuns.push({
      stage: "repair_triage_gate",
      templateVersion: "synthetic_repair_triage_gate_v1",
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.passLabel ? { passLabel: input.passLabel } : {}),
      ...(Array.isArray(input.reasonCodes) && input.reasonCodes.length > 0 ? { reasonCodes: input.reasonCodes } : {}),
      ...(Array.isArray(input.triggerViews) && input.triggerViews.length > 0 ? { triggerViews: input.triggerViews } : {}),
      ...(typeof input.seedOffset === "number" ? { seedOffset: input.seedOffset } : {}),
      views: input.views,
      candidateCount: 1,
      acceptedScoreThreshold: Number(acceptedScoreThreshold.toFixed(4)),
      roundsAttempted: 1,
      ...(stageObservedDefectFamiliesByView ? { observedDefectFamiliesByView: stageObservedDefectFamiliesByView } : {}),
      ...stageExitSummary,
      ...(runtimeVariantTags.length > 0 ? { runtimeVariantTags } : {}),
      ...(stageBestCandidateSummaryByView ? { bestCandidateSummaryByView: stageBestCandidateSummaryByView } : {}),
      ...(Object.keys(input.repairTriageByView).length > 0 ? { repairTriageByView: input.repairTriageByView } : {})
    });
  };
  const recordPostRepairAcceptanceGateStage = (input: {
    views: CharacterView[];
    selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
    repairAcceptanceByView: Partial<Record<CharacterView, PostRepairAcceptanceDecisionSummary>>;
    acceptedScoreThresholdOverride?: number;
    origin?: CharacterWorkflowStageOrigin;
    passLabel?: string;
    reasonCodes?: string[];
    triggerViews?: CharacterView[];
    seedOffset?: number;
  }) => {
    const stageBestCandidateSummaryByView = summarizeStageBestCandidateByView({
      views: input.views,
      bestByView: input.selectedByView,
      acceptedScoreThreshold,
      targetStyle: promptBundle.qualityProfile.targetStyle,
      speciesId: promptBundle.speciesId
    });
    const stageObservedDefectFamiliesByView = summarizeObservedDefectFamiliesByView({
      views: input.views,
      bestByView: input.selectedByView
    });
    const stageExitSummary = summarizeStageExitByView(stageBestCandidateSummaryByView);
    const runtimeVariantTags = dedupeStrings(
      Object.values(input.repairAcceptanceByView)
        .flatMap((summary) => (summary.chosenStage ? [`chosen:${summary.chosenStage}`, `repair_accept:${summary.decision}`] : [`repair_accept:${summary.decision}`]))
        .filter((entry) => entry.length > 0)
    );
    workflowStageRuns.push({
      stage: "post_repair_acceptance_gate",
      templateVersion: "synthetic_post_repair_acceptance_gate_v1",
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.passLabel ? { passLabel: input.passLabel } : {}),
      ...(Array.isArray(input.reasonCodes) && input.reasonCodes.length > 0 ? { reasonCodes: input.reasonCodes } : {}),
      ...(Array.isArray(input.triggerViews) && input.triggerViews.length > 0 ? { triggerViews: input.triggerViews } : {}),
      ...(typeof input.seedOffset === "number" ? { seedOffset: input.seedOffset } : {}),
      views: input.views,
      candidateCount: 1,
      acceptedScoreThreshold: Number(
        (typeof input.acceptedScoreThresholdOverride === "number"
          ? input.acceptedScoreThresholdOverride
          : acceptedScoreThreshold
        ).toFixed(4)
      ),
      roundsAttempted: 1,
      ...(stageObservedDefectFamiliesByView ? { observedDefectFamiliesByView: stageObservedDefectFamiliesByView } : {}),
      ...stageExitSummary,
      ...(runtimeVariantTags.length > 0 ? { runtimeVariantTags } : {}),
      ...(stageBestCandidateSummaryByView ? { bestCandidateSummaryByView: stageBestCandidateSummaryByView } : {}),
      ...(Object.keys(input.repairAcceptanceByView).length > 0
        ? { repairAcceptanceByView: input.repairAcceptanceByView }
        : {})
    });
  };
  const maybePromotePreferredSelection = (view: CharacterView, contender: ScoredCandidate | undefined) => {
    if (!contender) {
      return;
    }
    const current = preferredSelectionByView[view];
    const runtimeGuard = assessRuntimePromotionGuard({
      current,
      contender,
      targetStyle: promptBundle.qualityProfile.targetStyle,
      stage:
        resolveCandidateWorkflowStage(contender) === "repair_refine"
          ? "repair"
          : resolveCandidateWorkflowStage(contender) === "identity_lock_refine"
            ? "lock"
            : "refine"
    });
    const runtimeBucket = classifyCandidateRuntimeBucket({
      candidate: contender,
      targetStyle: promptBundle.qualityProfile.targetStyle
    });
    const promotion = assessCandidatePromotion({
      current,
      contender,
      acceptedScoreThreshold
    });
    const runtimeSelectable =
      runtimeGuard.allow &&
      runtimeBucket.level !== "block" &&
      runtimeBucket.level !== "compound" &&
      !(view === "front" && runtimeBucket.level === "degraded");
    if ((!current || promotion.promote) && runtimeSelectable) {
      preferredSelectionByView = {
        ...preferredSelectionByView,
        [view]: contender
      };
    }
  };
  const styleScore = scoreStyleMatch(promptBundle.positivePrompt, promptBundle.qualityProfile.targetStyle);
  const ultraWorkflowEnabled =
    providerName === "comfyui" && isMascotTargetStyle(promptBundle.qualityProfile.targetStyle);
  const mascotFamilyReferencesByView = ultraWorkflowEnabled
    ? loadMascotFamilyReferencesByView(promptBundle.speciesId, ["front", "threeQuarter", "profile"])
    : {};
  const providerCallLogs: CharacterProviderCallLog[] = [];
  let providerWorkflowHash = "unknown_workflow";
  let providerGeneratedAt = new Date().toISOString();
  let providerRunMeta:
    | {
        qualityProfileId?: string;
        runSettings?: Partial<PromptQualityProfile>;
        workflowStage?: CharacterWorkflowStage;
        workflowTemplateVersion?: string;
        capabilitySnapshot?: Record<string, unknown>;
        workflowExports?: {
          apiPromptPath?: string;
          guiWorkflowPath?: string;
          summaryPath?: string;
        };
        warnings?: string[];
        selectionDiagnostics?: Record<string, unknown>;
      }
    | undefined;

  const runProviderGenerate = async (
    providerInput: CharacterProviderGenerateInput
  ): Promise<CharacterGenerationCandidate[]> => {
    try {
      const result = await provider.generate(providerInput);
      if (Array.isArray((result as { callLogs?: unknown }).callLogs)) {
        providerCallLogs.push(...((result as { callLogs?: CharacterProviderCallLog[] }).callLogs ?? []));
      }
      providerWorkflowHash = result.workflowHash;
      providerGeneratedAt = result.generatedAt;
      if (result.providerMeta) {
        providerRunMeta = result.providerMeta;
      }
      return result.candidates;
    } catch (error) {
      if (providerName === "mock") {
        throw error;
      }

      const firstErrorSummary = errorMessage(error);
      if (isTransientProviderFailure(error)) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        try {
          const retryResult = await provider.generate(providerInput);
          if (Array.isArray((retryResult as { callLogs?: unknown }).callLogs)) {
            providerCallLogs.push(...((retryResult as { callLogs?: CharacterProviderCallLog[] }).callLogs ?? []));
          }
          providerWorkflowHash = retryResult.workflowHash;
          providerGeneratedAt = retryResult.generatedAt;
          if (retryResult.providerMeta) {
            providerRunMeta = retryResult.providerMeta;
          }
          providerWarning = providerWarning
            ? `${providerWarning} | ${providerName} transient failure recovered after retry (${firstErrorSummary}).`
            : `${providerName} transient failure recovered after retry (${firstErrorSummary}).`;
          return retryResult.candidates;
        } catch (retryError) {
          if (strictRealProvider) {
            throw new Error(
              `${providerName} unavailable after retry (${firstErrorSummary}; retry=${errorMessage(retryError)})`
            );
          }
          error = retryError;
        }
      } else if (strictRealProvider) {
        throw error;
      }

      providerWarning = `${providerName} unavailable (${errorMessage(error)}). Falling back to mock provider.`;
      providerName = "mock";
      provider = createCharacterProvider({
        provider: "mock"
      });
      const fallbackResult = await provider.generate(providerInput);
      if (Array.isArray((fallbackResult as { callLogs?: unknown }).callLogs)) {
        providerCallLogs.push(
          ...((fallbackResult as { callLogs?: CharacterProviderCallLog[] }).callLogs ?? [])
        );
      }
      providerWorkflowHash = fallbackResult.workflowHash;
      providerGeneratedAt = fallbackResult.generatedAt;
      if (fallbackResult.providerMeta) {
        providerRunMeta = fallbackResult.providerMeta;
      }
      return fallbackResult.candidates;
    }
  };

  const runViewGeneration = async (input: {
    views: CharacterView[];
    stage: GenerationStageKey;
    origin?: CharacterWorkflowStageOrigin;
    passLabel?: string;
    reasonCodes?: string[];
    triggerViews?: CharacterView[];
    referenceInput?: InlineImageReference;
    referenceInputByView?: Partial<Record<CharacterView, InlineImageReference>>;
    repairMaskByView?: Partial<Record<CharacterView, InlineImageReference>>;
    referenceBank?: CharacterReferenceBankEntry[];
    referenceBankByView?: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
    poseGuidesByView?: Partial<Record<CharacterView, InlineImageReference>>;
    baseAdjustmentsByView?: Partial<Record<CharacterView, RetryAdjustment>>;
    directiveProfilesByView?: Partial<Record<CharacterView, RepairDirectiveProfileSummary>>;
    candidateCountOverride?: number;
    acceptedScoreThresholdOverride?: number;
    budgetViewCount?: number;
    repairFromCandidateIds?: Partial<Record<CharacterView, string>>;
    repairLineageByView?: Partial<Record<CharacterView, CharacterRepairLineage>>;
    seedOffset?: number;
  }): Promise<void> => {
    const stageConfig = resolveStageConfig(input.stage);
    const stageProgress =
      input.stage === "front"
        ? { start: 12, end: 36 }
        : input.stage === "refine"
          ? { start: 68, end: 79 }
        : input.stage === "lock"
          ? { start: 79, end: 84 }
        : input.stage === "repair"
          ? { start: 84, end: 92 }
        : input.stage === "angles"
          ? { start: 44, end: 78 }
          : { start: 44, end: 78 };
    const inFlightStageProgressCeiling = Math.max(stageProgress.start, stageProgress.end - 1);
    const resolveInFlightStageProgress = (completedRounds: number): number => {
      const totalRounds = Math.max(1, autoRetryRounds + 1);
      const span = Math.max(1, inFlightStageProgressCeiling - stageProgress.start);
      const normalizedCompletedRounds = Math.min(totalRounds, Math.max(0, completedRounds));
      if (normalizedCompletedRounds <= 0) {
        return stageProgress.start;
      }
      const stepped = stageProgress.start + Math.floor((span * normalizedCompletedRounds) / totalRounds);
      return Math.max(stageProgress.start, Math.min(inFlightStageProgressCeiling, stepped));
    };
    const stageCandidatePlan = clampStageCandidateCount(
      input.candidateCountOverride ?? clamped.candidateCount,
      input.budgetViewCount ?? input.views.length,
      limits
    );
    if (stageCandidatePlan.warnings.length > 0) {
      const stageWarning = `${input.stage} candidate plan: ${stageCandidatePlan.warnings.join(" / ")}`;
      providerWarning = providerWarning ? `${providerWarning} | ${stageWarning}` : stageWarning;
    }

    const stageAcceptedScoreThreshold = Math.max(0, input.acceptedScoreThresholdOverride ?? acceptedScoreThreshold);
    const referenceAnalysisByView: Partial<Record<CharacterView, ImageAnalysis>> = {};
    for (const view of input.views) {
      const perViewReference = input.referenceInputByView?.[view];
      if (perViewReference?.referenceImageBase64) {
        try {
          referenceAnalysisByView[view] = await analyzeImage(
            Buffer.from(perViewReference.referenceImageBase64, "base64")
          );
          continue;
        } catch {
          // Ignore bad per-view references and continue with fallback analysis.
        }
      }

      if (isMascotTargetStyle(promptBundle.qualityProfile.targetStyle)) {
        const familyReference = loadMascotFamilyReferenceCached(promptBundle.speciesId, view);
        if (familyReference) {
          try {
            referenceAnalysisByView[view] = await analyzeImage(
              Buffer.from(familyReference.referenceImageBase64, "base64")
            );
          } catch {
            // Ignore unreadable family references.
          }
        }
      }
    }
    const structureControlsByView = ultraWorkflowEnabled
      ? await buildStructureControlsByViewForStage({
          stage: input.stage,
          views: input.views,
          referenceBank: input.referenceBank,
          referenceBankByView: input.referenceBankByView
        })
      : {};
    const structureControlKindsByView =
      Object.keys(structureControlsByView).length > 0
        ? Object.fromEntries(
            Object.entries(structureControlsByView).map(([view, controls]) => [view, Object.keys(controls ?? {}).sort()])
          )
        : undefined;
    const preflightAssessment = ultraWorkflowEnabled
      ? await buildStageInputPreflightAssessment({
          stage: input.stage,
          views: input.views,
          targetStyle: promptBundle.qualityProfile.targetStyle,
          referenceBank: input.referenceBank,
          referenceBankByView: input.referenceBankByView,
          referenceAnalysisByView,
          structureControlsByView
        })
      : {
          status: "ok" as const,
          executionViews: [...input.views],
          blockedViews: [],
          warningViews: [],
          diagnosticsByView: {},
          summary: "preflight skipped"
        };
    const executionViews = preflightAssessment.executionViews;
    const stageRuntimeVariantTags = new Set<string>();
    if (preflightAssessment.status === "review") {
      stageRuntimeVariantTags.add("preflight:review");
    } else if (preflightAssessment.status === "block") {
      stageRuntimeVariantTags.add("preflight:block");
    }
    for (const view of preflightAssessment.blockedViews) {
      stageRuntimeVariantTags.add(`preflight:block:${view}`);
      const diagnostics = preflightAssessment.diagnosticsByView[view];
      if ((diagnostics?.reasonCodes ?? []).some((reason) => reason.includes("structure_source"))) {
        stageRuntimeVariantTags.add(`preflight:source:block:${view}`);
      }
    }
    for (const view of preflightAssessment.warningViews) {
      stageRuntimeVariantTags.add(`preflight:review:${view}`);
      const diagnostics = preflightAssessment.diagnosticsByView[view];
      if ((diagnostics?.reasonCodes ?? []).some((reason) => reason.includes("structure_source"))) {
        stageRuntimeVariantTags.add(`preflight:source:review:${view}`);
      }
    }
    const writeStageRetryProgress = async (inputProgress: {
      completedRounds: number;
      phase: string;
      belowThresholdViews?: CharacterView[];
      retryAdjustments?: Partial<Record<CharacterView, string[]>>;
      gateDiagnosticsByView?: ReturnType<typeof summarizeRetryGateDiagnosticsByView>;
      bestScores?: ReturnType<typeof summarizeBestScores>;
    }): Promise<void> => {
      await writeGenerationProgress(resolveInFlightStageProgress(inputProgress.completedRounds), `${input.stage}_${inputProgress.phase}`, {
        views: input.views,
        executionViews,
        workflowStage: stageConfig.workflowStage,
        workflowTemplateVersion: stageConfig.templateVersion,
        origin: input.origin,
        passLabel: input.passLabel,
        reasonCodes: input.reasonCodes,
        triggerViews: input.triggerViews,
        roundsCompleted: inputProgress.completedRounds,
        totalRounds: Math.max(1, autoRetryRounds + 1),
        acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
        candidateCount: stageCandidatePlan.candidateCount,
        ...(inputProgress.belowThresholdViews && inputProgress.belowThresholdViews.length > 0
          ? { belowThresholdViews: inputProgress.belowThresholdViews }
          : {}),
        ...(inputProgress.retryAdjustments && Object.keys(inputProgress.retryAdjustments).length > 0
          ? { retryAdjustments: inputProgress.retryAdjustments }
          : {}),
        ...(inputProgress.gateDiagnosticsByView && Object.keys(inputProgress.gateDiagnosticsByView).length > 0
          ? { gateDiagnosticsByView: inputProgress.gateDiagnosticsByView }
          : {}),
        ...(inputProgress.bestScores && Object.keys(inputProgress.bestScores).length > 0
          ? { bestScores: inputProgress.bestScores }
          : {})
      });
    };
    if (preflightAssessment.status !== "ok") {
      const stageWarning = `${input.stage} preflight: ${preflightAssessment.summary}`;
      providerWarning = providerWarning ? `${providerWarning} | ${stageWarning}` : stageWarning;
    }
    await helpers.logJob(jobDbId, "info", "Character generation stage started", {
      stage: input.stage,
      workflowStage: stageConfig.workflowStage,
      workflowTemplateVersion: stageConfig.templateVersion,
      templateSpecPath: stageConfig.templateSpecPath,
      origin: input.origin,
      passLabel: input.passLabel,
      reasonCodes: input.reasonCodes,
      triggerViews: input.triggerViews,
      views: input.views,
      executionViews,
      candidateCount: stageCandidatePlan.candidateCount,
      acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
      budgetViewCount: input.budgetViewCount ?? input.views.length,
      hasReference: Boolean(input.referenceInput),
      referenceBankSize:
        Array.isArray(input.referenceBank) ? input.referenceBank.length : undefined,
      referenceBankSizeByView:
        input.referenceBankByView && Object.keys(input.referenceBankByView).length > 0
          ? Object.fromEntries(
              Object.entries(input.referenceBankByView).map(([view, bank]) => [view, bank?.length ?? 0])
            )
          : undefined,
      baseAdjustmentNotes:
        input.baseAdjustmentsByView && Object.keys(input.baseAdjustmentsByView).length > 0
          ? Object.fromEntries(
              Object.entries(input.baseAdjustmentsByView)
                .filter(([, adjustment]) => hasRetryAdjustmentContent(adjustment))
                .map(([view, adjustment]) => [view, adjustment?.notes ?? []])
            )
          : undefined,
      directiveProfilesByView:
        input.directiveProfilesByView && Object.keys(input.directiveProfilesByView).length > 0
          ? input.directiveProfilesByView
          : undefined,
      repairLineageByView:
        input.repairLineageByView && Object.keys(input.repairLineageByView).length > 0
          ? input.repairLineageByView
          : undefined,
      poseViews: Object.keys(input.poseGuidesByView ?? {}),
      structureControlKindsByView,
      preflightByView:
        Object.keys(preflightAssessment.diagnosticsByView).length > 0 ? preflightAssessment.diagnosticsByView : undefined,
      blockedViewsByPreflight:
        preflightAssessment.blockedViews.length > 0 ? preflightAssessment.blockedViews : undefined,
      warningViewsByPreflight:
        preflightAssessment.warningViews.length > 0 ? preflightAssessment.warningViews : undefined,
      seedOffset: input.seedOffset ?? 0
    });
    await writeGenerationProgress(stageProgress.start, `${input.stage}_started`, {
      views: input.views,
      candidateCount: stageCandidatePlan.candidateCount,
      acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
      hasReference: Boolean(input.referenceInput),
      workflowStage: stageConfig.workflowStage,
      workflowTemplateVersion: stageConfig.templateVersion,
      templateSpecPath: stageConfig.templateSpecPath,
      origin: input.origin,
      passLabel: input.passLabel,
      reasonCodes: input.reasonCodes,
      triggerViews: input.triggerViews,
      repairLineageByView:
        input.repairLineageByView && Object.keys(input.repairLineageByView).length > 0
          ? input.repairLineageByView
          : undefined,
      poseViews: Object.keys(input.poseGuidesByView ?? {}),
      structureControlKindsByView,
      executionViews,
      preflightByView:
        Object.keys(preflightAssessment.diagnosticsByView).length > 0 ? preflightAssessment.diagnosticsByView : undefined,
      blockedViewsByPreflight:
        preflightAssessment.blockedViews.length > 0 ? preflightAssessment.blockedViews : undefined,
      warningViewsByPreflight:
        preflightAssessment.warningViews.length > 0 ? preflightAssessment.warningViews : undefined,
      seedOffset: input.seedOffset ?? 0
    });
    if (executionViews.length === 0) {
      const preflightStageSummaries = buildPreflightBlockedStageOutcomeSummaries(preflightAssessment);
      const stageExitSummary = summarizeStageExitByView(preflightStageSummaries);
      await helpers.logJob(jobDbId, "warn", "Character generation stage skipped by preflight", {
        stage: input.stage,
        views: input.views,
        executionViews,
        candidateCount: stageCandidatePlan.candidateCount,
        acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
        preflightByView: preflightAssessment.diagnosticsByView,
        runtimeVariantTags: [...stageRuntimeVariantTags].sort((left, right) => left.localeCompare(right)),
        ...stageExitSummary
      });
      workflowStageRuns.push({
        stage: stageConfig.workflowStage,
        templateVersion: stageConfig.templateVersion,
        templateSpecPath: stageConfig.templateSpecPath,
        ...(input.origin ? { origin: input.origin } : {}),
        ...(input.passLabel ? { passLabel: input.passLabel } : {}),
        ...(Array.isArray(input.reasonCodes) && input.reasonCodes.length > 0 ? { reasonCodes: input.reasonCodes } : {}),
        ...(Array.isArray(input.triggerViews) && input.triggerViews.length > 0 ? { triggerViews: input.triggerViews } : {}),
        ...(typeof input.seedOffset === "number" ? { seedOffset: input.seedOffset } : {}),
        views: input.views,
        executionViews,
        candidateCount: stageCandidatePlan.candidateCount,
        acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
        roundsAttempted: 0,
        ...(Object.keys(preflightAssessment.diagnosticsByView).length > 0
          ? { preflightByView: preflightAssessment.diagnosticsByView }
          : {}),
        ...(preflightAssessment.blockedViews.length > 0
          ? { blockedViewsByPreflight: preflightAssessment.blockedViews }
          : {}),
        ...(preflightAssessment.warningViews.length > 0
          ? { warningViewsByPreflight: preflightAssessment.warningViews }
          : {}),
        ...stageExitSummary,
        ...(stageRuntimeVariantTags.size > 0
          ? {
              runtimeVariantTags: [...stageRuntimeVariantTags].sort((left, right) => left.localeCompare(right))
            }
          : {}),
        ...(preflightStageSummaries ? { bestCandidateSummaryByView: preflightStageSummaries } : {})
      });
      return;
    }
    const baseSeed = generation.seed ?? 101;
    const stageSeedOffset =
      input.stage === "front"
        ? 113
        : input.stage === "angles"
          ? 271
          : input.stage === "refine"
            ? 433
            : input.stage === "lock"
              ? 491
            : input.stage === "repair"
              ? 557
              : 419;
    let roundsAttempted = 0;
    let retryAdjustmentsByView: Partial<Record<CharacterView, RetryAdjustment>> = {};
    let latestReferenceMixByView: Partial<Record<CharacterView, StageRunReferenceMixSummary>> | undefined;
    for (let round = 0; round <= autoRetryRounds; round += 1) {
      roundsAttempted = round + 1;
      const roundSeed = baseSeed + stageSeedOffset + (input.seedOffset ?? 0) + round * 1009 + executionViews.length * 41;
      const activeRetryAdjustments = Object.fromEntries(
        executionViews.flatMap((view) => {
          const mergedAdjustment = mergeRetryAdjustments(
            input.baseAdjustmentsByView?.[view],
            round > 0 ? retryAdjustmentsByView[view] : undefined
          );
          return mergedAdjustment ? [[view, mergedAdjustment]] : [];
        })
      ) as Partial<Record<CharacterView, RetryAdjustment>>;
      const retryNegativeTokens = [
        ...new Set(
          Object.values(activeRetryAdjustments).flatMap((adjustment) => adjustment?.extraNegativeTokens ?? [])
        )
      ];
      const roundNegativePrompt = appendPromptHints(
        promptBundle.negativePrompt,
        retryNegativeTokens
      );
      const strengthenedNegativePrompt = strengthenNegativePrompt(
        roundNegativePrompt,
        generation.boostNegativePrompt === true,
        round
      );
      const adjustedViewPrompts = Object.fromEntries(
        executionViews.map((view) => [
          view,
          appendPromptHints(
            promptBundle.viewPrompts[view],
            activeRetryAdjustments[view]?.viewPromptHints ?? []
          )
        ])
      ) as Record<CharacterView, string>;
      const poseRequiredForStage = stageRequiresPoseGuide(input.stage);
      const poseGuideBase64ByView = Object.fromEntries(
        Object.entries(input.poseGuidesByView ?? {})
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .filter(
            ([view]) =>
              poseRequiredForStage || activeRetryAdjustments[view as CharacterView]?.disablePose !== true
          )
          .map(([view, guide]) => [view, guide.referenceImageBase64])
      ) as Partial<Record<CharacterView, string>>;
      const repairMaskBase64ByView = Object.fromEntries(
        Object.entries(input.repairMaskByView ?? {})
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .map(([view, guide]) => [view, guide.referenceImageBase64])
      ) as Partial<Record<CharacterView, string>>;
      const repairMaskMimeTypeByView = Object.fromEntries(
        Object.entries(input.repairMaskByView ?? {})
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .map(([view, guide]) => [view, guide.referenceMimeType ?? "image/png"])
      ) as Partial<Record<CharacterView, string>>;
      const referenceBankByView = Object.fromEntries(
        Object.entries(input.referenceBankByView ?? {})
          .filter(([, bank]) => Array.isArray(bank) && bank.length > 0)
          .map(([view, bank]) => [
            view,
            dedupeReferenceBank(
              rebalanceReferenceBankForRetry({
                entries: adjustReferenceBankWeights(
                  bank ?? [],
                  activeRetryAdjustments[view as CharacterView]?.referenceWeightDeltas ?? {}
                ) ?? [],
                stage: input.stage,
                view: view as CharacterView,
                adjustment: activeRetryAdjustments[view as CharacterView]
              }) ?? []
            )
          ])
      ) as Partial<Record<CharacterView, CharacterReferenceBankEntry[]>>;
      const adjustedReferenceBank = Array.isArray(input.referenceBank)
        ? dedupeReferenceBank(
            adjustReferenceBankWeights(
              input.referenceBank,
              Object.values(activeRetryAdjustments).reduce<Partial<Record<CharacterReferenceBankEntry["role"], number>>>(
                (acc, adjustment) => {
                  if (!adjustment) {
                    return acc;
                  }
                  for (const [role, delta] of Object.entries(adjustment.referenceWeightDeltas) as Array<
                    [CharacterReferenceBankEntry["role"], number]
                  >) {
                    acc[role] = Number(((acc[role] ?? 0) + delta).toFixed(3));
                  }
                  return acc;
                },
                {}
              )
            ) ?? []
          )
        : undefined;
      const effectiveReferenceInputByView = Object.fromEntries(
        executionViews.flatMap((view) => {
          const explicitReference = input.referenceInputByView?.[view];
          if (
            typeof explicitReference?.referenceImageBase64 === "string" &&
            explicitReference.referenceImageBase64.length > 0
          ) {
            return [[view, explicitReference]];
          }
          if (activeRetryAdjustments[view]?.enforceSideTurnBalance) {
            const sideStarterReference =
              pickReferenceImageFromBankRole(referenceBankByView[view], "view_starter") ??
              pickReferenceImageFromBankRole(adjustedReferenceBank, "view_starter");
            const compositionReference =
              pickReferenceImageFromBankRole(referenceBankByView[view], "composition") ??
              pickReferenceImageFromBankRole(adjustedReferenceBank, "composition");
            if (sideStarterReference || compositionReference) {
              return [[view, sideStarterReference ?? compositionReference]];
            }
          }
          if (
            Object.keys(activeRetryAdjustments).length > 0 &&
            typeof input.referenceInput?.referenceImageBase64 === "string" &&
            input.referenceInput.referenceImageBase64.length > 0
          ) {
            return [[view, input.referenceInput]];
          }
          return [];
        })
      ) as Partial<Record<CharacterView, InlineImageReference>>;
      const referenceBase64ByView = Object.fromEntries(
        Object.entries(effectiveReferenceInputByView)
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .map(([view, guide]) => [view, guide.referenceImageBase64])
      ) as Partial<Record<CharacterView, string>>;
      const referenceMimeTypeByView = Object.fromEntries(
        Object.entries(effectiveReferenceInputByView)
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .map(([view, guide]) => [view, guide.referenceMimeType ?? "image/png"])
      ) as Partial<Record<CharacterView, string>>;
      const useSharedReferenceInput =
        Object.keys(activeRetryAdjustments).length === 0 || Object.keys(referenceBase64ByView).length === 0;
      latestReferenceMixByView = summarizeReferenceMixByView({
        views: executionViews,
        sharedReferenceBank: adjustedReferenceBank,
        referenceBankByView
      });
      const providerStageTimeoutMs =
        providerStageTimeoutOverrideMs > 0
          ? providerStageTimeoutOverrideMs
          : providerRequestTimeoutMs * Math.max(1, executionViews.length) + 120_000;
      const poseGuideMimeTypeByView = Object.fromEntries(
        Object.entries(input.poseGuidesByView ?? {})
          .filter(([, guide]) => typeof guide?.referenceImageBase64 === "string" && guide.referenceImageBase64.length > 0)
          .filter(
            ([view]) =>
              poseRequiredForStage || activeRetryAdjustments[view as CharacterView]?.disablePose !== true
          )
          .map(([view, guide]) => [view, guide.referenceMimeType ?? "image/png"])
      ) as Partial<Record<CharacterView, string>>;
      const generatedCandidates = await withAsyncOperationTimeout(
        `character provider.generate stage=${input.stage} round=${round + 1} pass=${input.passLabel ?? input.origin ?? "direct"} views=${executionViews.join(",")}`,
        providerStageTimeoutMs,
        () => runProviderGenerate({
        mode: generation.mode,
        views: executionViews,
        candidateCount: stageCandidatePlan.candidateCount,
        baseSeed: roundSeed,
        speciesId: promptBundle.speciesId,
        presetId: promptBundle.presetId,
        positivePrompt: promptBundle.positivePrompt,
        negativePrompt: strengthenedNegativePrompt,
        guardrails: promptBundle.guardrails,
        qualityProfile: promptBundle.qualityProfile,
        viewPrompts: adjustedViewPrompts,
        selectionHints: promptBundle.selectionHints,
        ...(ultraWorkflowEnabled
          ? {
              workflowStage: stageConfig.workflowStage,
              workflowTemplateVersion: stageConfig.templateVersion,
              ...(input.repairLineageByView && Object.keys(input.repairLineageByView).length > 0
                ? {
                    repairLineageByView: input.repairLineageByView
                  }
                : {}),
              stagePlan: {
                stage: stageConfig.workflowStage,
                templateVersion: stageConfig.templateVersion,
                templateSpecPath: stageConfig.templateSpecPath,
                controlPresetId: resolveStageControlPresetId(input.stage, executionViews),
                ...(promptBundle.referenceBankId ? { referenceBankId: promptBundle.referenceBankId } : {}),
                referenceBankStatus: mascotReferenceBankDiagnostics.status,
                ...(mascotReferenceBankDiagnostics.missingRoles.length > 0
                  ? { referenceBankMissingRoles: mascotReferenceBankDiagnostics.missingRoles }
                  : {}),
                ...((promptBundle.mascotProfileId ?? promptBundle.speciesId)
                  ? { mascotProfileId: promptBundle.mascotProfileId ?? promptBundle.speciesId }
                  : {}),
                heroModeEnabled: referenceBankHasHeroRole({
                  sharedReferenceBank: adjustedReferenceBank,
                  referenceBankByView
                }),
                views: executionViews,
                candidateCount: stageCandidatePlan.candidateCount,
                acceptedScoreThreshold: stageAcceptedScoreThreshold,
                ...(input.origin ? { origin: input.origin } : {}),
                ...(input.passLabel ? { passLabel: input.passLabel } : {}),
                ...(Array.isArray(input.reasonCodes) && input.reasonCodes.length > 0
                  ? { reasonCodes: input.reasonCodes }
                  : {}),
                ...(Array.isArray(input.triggerViews) && input.triggerViews.length > 0
                  ? { triggerViews: input.triggerViews }
                  : {}),
                ...(typeof input.seedOffset === "number" ? { seedOffset: input.seedOffset } : {}),
                ...(structureControlKindsByView
                  ? {
                      structureControlKinds: [
                        ...new Set(
                          Object.values(structureControlKindsByView).flatMap((kinds) => kinds ?? [])
                        )
                      ] as CharacterStructureControlKind[]
                    }
                  : {}),
                ...(input.repairFromCandidateIds && Object.keys(input.repairFromCandidateIds).length > 0
                  ? {
                      repairFromCandidateId: Object.values(input.repairFromCandidateIds)[0]
                    }
                  : {}),
                ...(input.repairLineageByView && Object.keys(input.repairLineageByView).length > 0
                  ? Object.values(input.repairLineageByView)[0] ?? {}
                  : {}),
                referenceBankSize:
                  Array.isArray(input.referenceBank) && input.referenceBank.length > 0
                    ? input.referenceBank.length
                    : input.referenceBankByView && Object.keys(input.referenceBankByView).length > 0
                      ? Object.values(input.referenceBankByView).reduce(
                          (sum, bank) => sum + (Array.isArray(bank) ? bank.length : 0),
                          0
                        )
                    : undefined
              }
            }
          : {}),
        ...(useSharedReferenceInput || Object.keys(referenceBase64ByView).length > 0
          ? { referenceMode: "img2img" as const }
          : {}),
        ...(useSharedReferenceInput && input.referenceInput
          ? {
              referenceImageBase64: input.referenceInput.referenceImageBase64,
              referenceMimeType: input.referenceInput.referenceMimeType ?? "image/png"
            }
          : {}),
        ...(Array.isArray(adjustedReferenceBank) && adjustedReferenceBank.length > 0
          ? {
              referenceBank: adjustedReferenceBank
            }
          : {}),
        ...(Object.keys(referenceBase64ByView).length > 0
          ? {
              referenceImageBase64ByView: referenceBase64ByView,
              referenceMimeTypeByView
            }
          : {}),
        ...(Object.keys(repairMaskBase64ByView).length > 0
          ? {
              repairMaskImageBase64ByView: repairMaskBase64ByView,
              repairMaskMimeTypeByView
            }
          : {}),
        ...(Object.keys(referenceBankByView).length > 0
          ? {
              referenceBankByView
            }
          : {}),
        ...(Object.keys(poseGuideBase64ByView).length > 0
          ? {
              poseImageBase64ByView: poseGuideBase64ByView,
              poseMimeTypeByView: poseGuideMimeTypeByView
            }
          : {}),
        ...(Object.keys(structureControlsByView).length > 0
          ? {
              structureControlsByView
            }
          : {})
        })
      );

      for (const candidate of generatedCandidates) {
        if (!executionViews.includes(candidate.view)) {
          continue;
        }

        const postprocessedCandidate = await withAsyncOperationTimeout(
          `character postprocess stage=${input.stage} round=${round + 1} view=${candidate.view} candidate=${candidate.id}`,
          candidatePostprocessTimeoutMs,
          () =>
            postprocessCandidateForProduction({
              candidate,
              qualityProfile: promptBundle.qualityProfile
            })
        );
        const analysis = await withAsyncOperationTimeout(
          `character analyze stage=${input.stage} round=${round + 1} view=${postprocessedCandidate.view} candidate=${postprocessedCandidate.id}`,
          candidateAnalysisTimeoutMs,
          () => analyzeImage(postprocessedCandidate.data)
        );
        const scoredCandidate = scoreCandidate({
          candidate: postprocessedCandidate,
          analysis,
          mode: generation.mode,
          styleScore,
          targetStyle: promptBundle.qualityProfile.targetStyle,
          speciesId: promptBundle.speciesId,
          generationRound: round,
          ...(referenceAnalysisByView[postprocessedCandidate.view] || referenceAnalysis
            ? {
                referenceAnalysis:
                  referenceAnalysisByView[postprocessedCandidate.view] ?? referenceAnalysis
              }
            : {})
        });

        const extension = postprocessedCandidate.mimeType.includes("svg") ? "svg" : "png";
        const fileStem = `${input.stage}_${postprocessedCandidate.view}_r${round}_${safeFileName(postprocessedCandidate.id)}_${postprocessedCandidate.candidateIndex}`;
        const outputPath = path.join(
          candidatesDir,
          `${fileStem}.${extension}`
        );
        fs.writeFileSync(outputPath, postprocessedCandidate.data);

        (scoredCandidate.candidate.providerMeta ??= {}).localCandidatePath = outputPath;
        const providerMetaWithArtifacts = materializeCandidateProviderArtifacts({
          candidate: scoredCandidate.candidate,
          candidatesDir,
          fileStem
        });
        if (providerMetaWithArtifacts) {
          scoredCandidate.candidate.providerMeta = providerMetaWithArtifacts;
        }
        collectRuntimeVariantTags({
          current: stageRuntimeVariantTags,
          provider: scoredCandidate.candidate.provider,
          providerMeta: scoredCandidate.candidate.providerMeta
        });
        scored.push(scoredCandidate);
      }

      applyConsistencyScoring(
        scored,
        promptBundle.qualityProfile.targetStyle,
        promptBundle.speciesId,
        stageAcceptedScoreThreshold
      );
      const bestByViewNow = groupBestByView(scored);
      const belowThresholdViews = executionViews.filter((view) => {
        const candidate = bestByViewNow[view];
        if (!candidate) {
          return true;
        }
        if (
          view === "front" &&
          !isStrongFrontMasterCandidate(
            candidate,
            promptBundle.qualityProfile.targetStyle,
            stageAcceptedScoreThreshold,
            promptBundle.speciesId
          )
        ) {
          return true;
        }
        if (candidate.rejections.length > 0) {
          return true;
        }
        if (hasBlockingConsistencyRecoveryIssue(candidate, promptBundle.speciesId)) {
          return true;
        }
        return candidate.score < stageAcceptedScoreThreshold;
      });

      if (belowThresholdViews.length === 0) {
        break;
      }

      retryAdjustmentsByView = Object.fromEntries(
        belowThresholdViews.flatMap((view) => {
          const adjustment = deriveRetryAdjustmentForCandidate({
            stage: input.stage,
            view,
            candidate: bestByViewNow[view],
            speciesId: promptBundle.speciesId
          });
          return hasRetryAdjustmentContent(adjustment) ? [[view, adjustment]] : [];
        })
      ) as Partial<Record<CharacterView, RetryAdjustment>>;
      const nextRetryAdjustmentNotes = Object.fromEntries(
        Object.entries(retryAdjustmentsByView)
          .filter(([, adjustment]) => adjustment && adjustment.notes.length > 0)
          .map(([view, adjustment]) => [view, adjustment?.notes ?? []])
      );
      const gateDiagnosticsByView = summarizeRetryGateDiagnosticsByView({
        views: belowThresholdViews,
        bestByView: bestByViewNow,
        targetStyle: promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold: stageAcceptedScoreThreshold,
        speciesId: promptBundle.speciesId
      });

      if (round < autoRetryRounds) {
        const retryMessage = `Auto-regenerate round ${round + 1} for ${belowThresholdViews.join(", ")}`;
        providerWarning = providerWarning ? `${providerWarning} | ${retryMessage}` : retryMessage;
        await helpers.logJob(jobDbId, "info", "Character generation retry queued", {
          stage: input.stage,
          round: round + 1,
          belowThresholdViews,
          acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
          retryAdjustments: nextRetryAdjustmentNotes,
          gateDiagnosticsByView,
          bestScores: summarizeBestScores(executionViews)
        });
        await writeStageRetryProgress({
          completedRounds: round + 1,
          phase: "retry_queued",
          belowThresholdViews,
          retryAdjustments: nextRetryAdjustmentNotes,
          gateDiagnosticsByView,
          bestScores: summarizeBestScores(executionViews)
        });
      }
    }

    const stageBestCandidateSummaryByView = mergeStageViewOutcomeSummaries(
      summarizeStageBestCandidateByView({
        views: executionViews,
        bestByView: groupBestByView(scored),
        acceptedScoreThreshold: stageAcceptedScoreThreshold,
        targetStyle: promptBundle.qualityProfile.targetStyle,
        speciesId: promptBundle.speciesId
      }),
      buildPreflightBlockedStageOutcomeSummaries(preflightAssessment)
    );
    const stageObservedDefectFamiliesByView = summarizeObservedDefectFamiliesByView({
      views: executionViews,
      bestByView: groupBestByView(scored)
    });
    const stageExitSummary = summarizeStageExitByView(stageBestCandidateSummaryByView);
    await helpers.logJob(jobDbId, "info", "Character generation stage completed", {
      stage: input.stage,
      views: input.views,
      executionViews,
      candidateCount: stageCandidatePlan.candidateCount,
      acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
      totalScored: scored.length,
      bestScores: summarizeBestScores(input.views),
      seedOffset: input.seedOffset ?? 0,
      origin: input.origin,
      passLabel: input.passLabel,
      referenceMixByView: latestReferenceMixByView,
      preflightByView:
        Object.keys(preflightAssessment.diagnosticsByView).length > 0 ? preflightAssessment.diagnosticsByView : undefined,
      blockedViewsByPreflight:
        preflightAssessment.blockedViews.length > 0 ? preflightAssessment.blockedViews : undefined,
      warningViewsByPreflight:
        preflightAssessment.warningViews.length > 0 ? preflightAssessment.warningViews : undefined,
      runtimeVariantTags: stageRuntimeVariantTags.size > 0 ? [...stageRuntimeVariantTags].sort((left, right) => left.localeCompare(right)) : [],
      ...stageExitSummary
    });
    await writeGenerationProgress(stageProgress.end, `${input.stage}_completed`, {
      views: input.views,
      candidateCount: stageCandidatePlan.candidateCount,
      acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
      totalScored: scored.length,
      bestScores: summarizeBestScores(input.views),
      seedOffset: input.seedOffset ?? 0,
      origin: input.origin,
      passLabel: input.passLabel,
      referenceMixByView: latestReferenceMixByView,
      executionViews,
      preflightByView:
        Object.keys(preflightAssessment.diagnosticsByView).length > 0 ? preflightAssessment.diagnosticsByView : undefined,
      blockedViewsByPreflight:
        preflightAssessment.blockedViews.length > 0 ? preflightAssessment.blockedViews : undefined,
      warningViewsByPreflight:
        preflightAssessment.warningViews.length > 0 ? preflightAssessment.warningViews : undefined,
      runtimeVariantTags: stageRuntimeVariantTags.size > 0 ? [...stageRuntimeVariantTags].sort((left, right) => left.localeCompare(right)) : [],
      ...stageExitSummary
    });
    workflowStageRuns.push({
      stage: stageConfig.workflowStage,
      templateVersion: stageConfig.templateVersion,
      templateSpecPath: stageConfig.templateSpecPath,
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.passLabel ? { passLabel: input.passLabel } : {}),
      ...(Array.isArray(input.reasonCodes) && input.reasonCodes.length > 0
        ? { reasonCodes: input.reasonCodes }
        : {}),
      ...(Array.isArray(input.triggerViews) && input.triggerViews.length > 0
        ? { triggerViews: input.triggerViews }
        : {}),
      ...(typeof input.seedOffset === "number" ? { seedOffset: input.seedOffset } : {}),
      views: input.views,
      candidateCount: stageCandidatePlan.candidateCount,
      acceptedScoreThreshold: Number(stageAcceptedScoreThreshold.toFixed(4)),
      roundsAttempted,
      ...(input.referenceBankByView && Object.keys(input.referenceBankByView).length > 0
        ? {
            referenceBankSizeByView: Object.fromEntries(
              Object.entries(input.referenceBankByView).map(([view, bank]) => [view, bank?.length ?? 0])
            ) as Partial<Record<CharacterView, number>>
          }
        : Array.isArray(input.referenceBank) && input.referenceBank.length > 0
          ? {
              referenceBankSizeByView: Object.fromEntries(
                input.views.map((view) => [view, input.referenceBank?.length ?? 0])
              ) as Partial<Record<CharacterView, number>>
            }
        : {}),
      ...(latestReferenceMixByView
        ? {
            referenceMixByView: latestReferenceMixByView
          }
        : {}),
      ...(Object.keys(preflightAssessment.diagnosticsByView).length > 0
        ? {
            preflightByView: preflightAssessment.diagnosticsByView
          }
        : {}),
      ...(preflightAssessment.executionViews.length !== input.views.length
        ? {
            executionViews
          }
        : {}),
      ...(preflightAssessment.blockedViews.length > 0
        ? {
            blockedViewsByPreflight: preflightAssessment.blockedViews
          }
        : {}),
      ...(preflightAssessment.warningViews.length > 0
        ? {
            warningViewsByPreflight: preflightAssessment.warningViews
          }
        : {}),
      ...(input.baseAdjustmentsByView && Object.keys(input.baseAdjustmentsByView).length > 0
        ? {
            adjustmentNotesByView: Object.fromEntries(
              Object.entries(input.baseAdjustmentsByView)
                .filter(([, adjustment]) => hasRetryAdjustmentContent(adjustment))
                .map(([view, adjustment]) => [view, adjustment?.notes ?? []])
            ) as Partial<Record<CharacterView, string[]>>
          }
        : {}),
      ...(input.directiveProfilesByView && Object.keys(input.directiveProfilesByView).length > 0
        ? {
            directiveProfilesByView: input.directiveProfilesByView
          }
        : {}),
      ...(input.repairFromCandidateIds && Object.keys(input.repairFromCandidateIds).length > 0
        ? {
            repairFromCandidateIds: input.repairFromCandidateIds
          }
        : {}),
      ...(stageObservedDefectFamiliesByView
        ? {
            observedDefectFamiliesByView: stageObservedDefectFamiliesByView
          }
        : {}),
      ...stageExitSummary,
      ...(stageRuntimeVariantTags.size > 0
        ? {
            runtimeVariantTags: [...stageRuntimeVariantTags].sort((left, right) => left.localeCompare(right))
          }
        : {}),
      ...(stageBestCandidateSummaryByView
        ? {
            bestCandidateSummaryByView: stageBestCandidateSummaryByView
          }
        : {})
    });
  };

  const maybeRunUltraSideRefineStage = async (input: {
    targetViews: CharacterView[];
    bestByView: Partial<Record<CharacterView, ScoredCandidate>>;
    frontReferenceInput?: InlineImageReference;
    origin: CharacterWorkflowStageOrigin;
    passLabel: string;
    reasonCodes: string[];
    triggerViews: CharacterView[];
    seedOffset?: number;
    acceptedScoreThresholdBoost?: number;
    candidateCountBoost?: number;
  }): Promise<CharacterView[]> => {
    const refineTriggerThreshold = resolveEffectiveStageTriggerThreshold(
      acceptedScoreThreshold,
      input.acceptedScoreThresholdBoost
    );
    const candidateViews = dedupeCharacterViews(
      input.targetViews.filter((view) =>
        shouldRunSideRefineForCandidate({
          candidate: input.bestByView[view],
          view,
          acceptedScoreThreshold: refineTriggerThreshold
        })
      )
    );
    if (candidateViews.length === 0) {
      return [];
    }

    let frontReferenceInput = input.frontReferenceInput;
    if (!frontReferenceInput) {
      frontReferenceInput = await resolveFrontReferenceFromManifest(referenceSourceManifestPath);
    }
    if (!frontReferenceInput && sessionId) {
      frontReferenceInput = await resolveFrontReferenceFromSession(prisma, sessionId, continuityConfig);
    }
    if (!frontReferenceInput && referenceImageBase64) {
      frontReferenceInput = {
        referenceImageBase64,
        referenceMimeType
      };
    }
    if (!frontReferenceInput) {
      return [];
    }

    const refineViews = candidateViews;
    if (refineViews.length === 0) {
      return [];
    }
    const refineFrontAnchorScore = input.bestByView.front?.score;

    const filteredPoseGuidesByView = loadStagePoseGuides({
      speciesId: promptBundle.speciesId,
      views: refineViews
    });

    const refineReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
    const refineReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
    const refineBaseAdjustmentsByView: Partial<Record<CharacterView, RetryAdjustment>> = {};
    const refineDirectiveProfilesByView: Partial<Record<CharacterView, RepairDirectiveProfileSummary>> = {};

    for (const view of refineViews) {
      const candidate = input.bestByView[view];
      if (!candidate) {
        continue;
      }

      const starterReference = loadMascotStarterReference(promptBundle.speciesId, view);
      refineReferenceInputByView[view] = inlineReferenceFromCandidate(candidate.candidate);
      const refineDirective = buildRepairDirectiveProfile({
        stage: "refine",
        view,
        candidate,
        speciesId: promptBundle.speciesId
      });
      if (refineDirective?.adjustment && hasRetryAdjustmentContent(refineDirective.adjustment)) {
        refineBaseAdjustmentsByView[view] = refineDirective.adjustment;
      }
      if (refineDirective) {
        refineDirectiveProfilesByView[view] = summarizeRepairDirectiveProfile(refineDirective);
      }

      const familyReferenceEntries = buildMascotFamilyReferenceEntries({
        speciesId: promptBundle.speciesId,
        stage: "refine",
        targetView: view,
        familyReferencesByView: mascotFamilyReferencesByView,
        hasStarter: Boolean(starterReference),
        directiveFamilies: refineDirective?.families,
        directiveSeverity: refineDirective?.severity,
        preferMultiReference: promptBundle.selectionHints.preferMultiReference,
        heroModeEnabled: shouldEnableMascotHeroMode({
          stage: "refine",
          heroMode: promptBundle.heroMode,
          frontAnchorScore: refineFrontAnchorScore
        })
      });
      const hasFamilyCompositionEntry = familyReferenceEntries.some((entry) => entry.role === "composition");
      const draftCompositionWeight = Number(
        Math.max(
          0.24,
          resolveAdaptiveReferenceWeight({
            stage: "refine",
            role: "composition",
            targetView: view,
            hasStarter: Boolean(starterReference),
            directiveFamilies: refineDirective?.families,
            directiveSeverity: refineDirective?.severity
          }) - (hasFamilyCompositionEntry ? 0.24 : 0)
        ).toFixed(3)
      );
      const bank: CharacterReferenceBankEntry[] = [
        createReferenceBankEntry({
          id: `${view}_refine_front_master`,
          role: "front_master",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "refine",
            role: "front_master",
            targetView: view,
            hasStarter: Boolean(starterReference),
            directiveFamilies: refineDirective?.families,
            directiveSeverity: refineDirective?.severity
          }),
          note: "side refine front anchor",
          image: frontReferenceInput
        })
      ];
      if (starterReference) {
        bank.push(
          createReferenceBankEntry({
            id: `${view}_refine_view_starter`,
            role: "view_starter",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: "refine",
              role: "view_starter",
              targetView: view,
              hasStarter: true,
              directiveFamilies: refineDirective?.families,
              directiveSeverity: refineDirective?.severity
            }),
            note: starterReference.sourcePath,
            image: starterReference
          })
        );
      }
      bank.push(...familyReferenceEntries);
      bank.push(
        createReferenceBankEntry({
          id: `${candidate.candidate.id}_refine_composition`,
          role: "composition",
          view,
          weight: draftCompositionWeight,
          note: "current side draft img2img seed",
          image: inlineReferenceFromCandidate(candidate.candidate)
        })
      );
      refineReferenceBankByView[view] = dedupeReferenceBank(bank);
    }

    const resolvedRefineViews = Object.keys(refineReferenceInputByView) as CharacterView[];
    if (resolvedRefineViews.length === 0) {
      return [];
    }

    const refineCandidateCount = Math.max(
      2,
      Math.min(
        6,
        Math.floor(Math.max(2, clamped.candidateCount - 1) + (input.candidateCountBoost ?? 0)) +
          Math.max(
            0,
            ...resolvedRefineViews.map((view) => refineDirectiveProfilesByView[view]?.candidateCountBoost ?? 0)
          )
      )
    );
    const refineAcceptedScoreThreshold = Math.min(
      0.98,
      acceptedScoreThreshold +
        0.015 +
        (input.acceptedScoreThresholdBoost ?? 0) +
        Math.max(
          0,
          ...resolvedRefineViews.map(
            (view) => (refineDirectiveProfilesByView[view]?.acceptedScoreThresholdBoost ?? 0) * 0.5
          )
        )
    );
    await helpers.logJob(jobDbId, "info", "Running ultra side refine stage", {
      refineViews: resolvedRefineViews,
      acceptedScoreThreshold: Number(acceptedScoreThreshold.toFixed(4)),
      refineTriggerThreshold: Number(refineTriggerThreshold.toFixed(4)),
      refineAcceptedScoreThreshold: Number(refineAcceptedScoreThreshold.toFixed(4)),
      refineCandidateCount,
      origin: input.origin,
      passLabel: input.passLabel,
      directives: refineDirectiveProfilesByView
    });
    await runViewGeneration({
      views: resolvedRefineViews,
      stage: "refine",
      origin: input.origin,
      passLabel: input.passLabel,
      reasonCodes: input.reasonCodes,
      triggerViews: input.triggerViews,
      referenceInput: frontReferenceInput,
      referenceInputByView: refineReferenceInputByView,
      referenceBankByView: refineReferenceBankByView,
      ...(Object.keys(filteredPoseGuidesByView).length > 0 ? { poseGuidesByView: filteredPoseGuidesByView } : {}),
      ...(Object.keys(refineBaseAdjustmentsByView).length > 0
        ? { baseAdjustmentsByView: refineBaseAdjustmentsByView }
        : {}),
      ...(Object.keys(refineDirectiveProfilesByView).length > 0
        ? { directiveProfilesByView: refineDirectiveProfilesByView }
        : {}),
      candidateCountOverride: refineCandidateCount,
      acceptedScoreThresholdOverride: refineAcceptedScoreThreshold,
      seedOffset: input.seedOffset
    });
    applyConsistencyScoring(
      scored,
      promptBundle.qualityProfile.targetStyle,
      promptBundle.speciesId,
      acceptedScoreThreshold
    );
    return resolvedRefineViews;
  };

  const maybeRunUltraIdentityLockStage = async (input: {
    targetViews: CharacterView[];
    bestByView: Partial<Record<CharacterView, ScoredCandidate>>;
    frontReferenceInput?: InlineImageReference;
    origin: CharacterWorkflowStageOrigin;
    passLabel: string;
    reasonCodes: string[];
    triggerViews: CharacterView[];
    seedOffset?: number;
    acceptedScoreThresholdBoost?: number;
    candidateCountBoost?: number;
  }): Promise<CharacterView[]> => {
    const lockTriggerThreshold = resolveEffectiveStageTriggerThreshold(
      acceptedScoreThreshold,
      input.acceptedScoreThresholdBoost
    );
    const candidateViews = dedupeCharacterViews(
      input.targetViews.filter((view) =>
        shouldRunIdentityLockForCandidate({
          candidate: input.bestByView[view],
          view,
          acceptedScoreThreshold: lockTriggerThreshold
        })
      )
    );
    if (candidateViews.length === 0) {
      return [];
    }

    let frontReferenceInput = input.frontReferenceInput;
    if (!frontReferenceInput) {
      frontReferenceInput = await resolveFrontReferenceFromManifest(referenceSourceManifestPath);
    }
    if (!frontReferenceInput && sessionId) {
      frontReferenceInput = await resolveFrontReferenceFromSession(prisma, sessionId, continuityConfig);
    }
    if (!frontReferenceInput && referenceImageBase64) {
      frontReferenceInput = {
        referenceImageBase64,
        referenceMimeType
      };
    }
    if (!frontReferenceInput) {
      return [];
    }

    const lockViews = candidateViews;
    if (lockViews.length === 0) {
      return [];
    }
    const lockFrontAnchorScore = input.bestByView.front?.score;

    const filteredPoseGuidesByView = loadStagePoseGuides({
      speciesId: promptBundle.speciesId,
      views: lockViews
    });

    const lockReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
    const lockReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
    const lockBaseAdjustmentsByView: Partial<Record<CharacterView, RetryAdjustment>> = {};
    const lockDirectiveProfilesByView: Partial<Record<CharacterView, RepairDirectiveProfileSummary>> = {};

    for (const view of lockViews) {
      const candidate = input.bestByView[view];
      if (!candidate) {
        continue;
      }

      const starterReference = loadMascotStarterReference(promptBundle.speciesId, view);
      lockReferenceInputByView[view] = inlineReferenceFromCandidate(candidate.candidate);
      const lockDirective = buildRepairDirectiveProfile({
        stage: "lock",
        view,
        candidate,
        speciesId: promptBundle.speciesId
      });
      if (lockDirective?.adjustment && hasRetryAdjustmentContent(lockDirective.adjustment)) {
        lockBaseAdjustmentsByView[view] = lockDirective.adjustment;
      }
      if (lockDirective) {
        lockDirectiveProfilesByView[view] = summarizeRepairDirectiveProfile(lockDirective);
      }

      const familyReferenceEntries = buildMascotFamilyReferenceEntries({
        speciesId: promptBundle.speciesId,
        stage: "lock",
        targetView: view,
        familyReferencesByView: mascotFamilyReferencesByView,
        hasStarter: Boolean(starterReference),
        directiveFamilies: lockDirective?.families,
        directiveSeverity: lockDirective?.severity,
        preferMultiReference: promptBundle.selectionHints.preferMultiReference,
        heroModeEnabled: shouldEnableMascotHeroMode({
          stage: "lock",
          heroMode: promptBundle.heroMode,
          frontAnchorScore: lockFrontAnchorScore
        })
      });
      const hasFamilyCompositionEntry = familyReferenceEntries.some((entry) => entry.role === "composition");
      const draftCompositionWeight = Number(
        Math.max(
          0.24,
          resolveAdaptiveReferenceWeight({
            stage: "lock",
            role: "composition",
            targetView: view,
            hasStarter: Boolean(starterReference),
            directiveFamilies: lockDirective?.families,
            directiveSeverity: lockDirective?.severity
          }) - (hasFamilyCompositionEntry ? 0.28 : 0)
        ).toFixed(3)
      );
      const bank: CharacterReferenceBankEntry[] = [
        createReferenceBankEntry({
          id: `${view}_identity_lock_front_master`,
          role: "front_master",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "lock",
            role: "front_master",
            targetView: view,
            hasStarter: Boolean(starterReference),
            directiveFamilies: lockDirective?.families,
            directiveSeverity: lockDirective?.severity
          }),
          note: "identity lock front anchor",
          image: frontReferenceInput
        })
      ];
      if (starterReference) {
        bank.push(
          createReferenceBankEntry({
            id: `${view}_identity_lock_view_starter`,
            role: "view_starter",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: "lock",
              role: "view_starter",
              targetView: view,
              hasStarter: true,
              directiveFamilies: lockDirective?.families,
              directiveSeverity: lockDirective?.severity
            }),
            note: starterReference.sourcePath,
            image: starterReference
          })
        );
      }
      bank.push(...familyReferenceEntries);
      bank.push(
        createReferenceBankEntry({
          id: `${candidate.candidate.id}_identity_lock_composition`,
          role: "composition",
          view,
          weight: draftCompositionWeight,
          note: "identity lock current draft img2img seed",
          image: inlineReferenceFromCandidate(candidate.candidate)
        })
      );
      lockReferenceBankByView[view] = dedupeReferenceBank(bank);
    }

    const resolvedLockViews = Object.keys(lockReferenceInputByView) as CharacterView[];
    if (resolvedLockViews.length === 0) {
      return [];
    }

    const lockCandidateCount = Math.max(
      2,
      Math.min(
        5,
        Math.floor(Math.max(2, clamped.candidateCount - 1) + (input.candidateCountBoost ?? 0)) +
          Math.max(
            0,
            ...resolvedLockViews.map((view) => lockDirectiveProfilesByView[view]?.candidateCountBoost ?? 0)
          )
      )
    );
    const lockAcceptedScoreThreshold = Math.min(
      0.985,
      acceptedScoreThreshold +
        0.025 +
        (input.acceptedScoreThresholdBoost ?? 0) +
        Math.max(
          0,
          ...resolvedLockViews.map(
            (view) => (lockDirectiveProfilesByView[view]?.acceptedScoreThresholdBoost ?? 0) * 0.6
          )
        )
    );
    await helpers.logJob(jobDbId, "info", "Running ultra identity lock stage", {
      lockViews: resolvedLockViews,
      acceptedScoreThreshold: Number(acceptedScoreThreshold.toFixed(4)),
      lockTriggerThreshold: Number(lockTriggerThreshold.toFixed(4)),
      lockAcceptedScoreThreshold: Number(lockAcceptedScoreThreshold.toFixed(4)),
      lockCandidateCount,
      origin: input.origin,
      passLabel: input.passLabel,
      directives: lockDirectiveProfilesByView
    });
    await runViewGeneration({
      views: resolvedLockViews,
      stage: "lock",
      origin: input.origin,
      passLabel: input.passLabel,
      reasonCodes: input.reasonCodes,
      triggerViews: input.triggerViews,
      referenceInput: frontReferenceInput,
      referenceInputByView: lockReferenceInputByView,
      referenceBankByView: lockReferenceBankByView,
      ...(Object.keys(filteredPoseGuidesByView).length > 0 ? { poseGuidesByView: filteredPoseGuidesByView } : {}),
      ...(Object.keys(lockBaseAdjustmentsByView).length > 0
        ? { baseAdjustmentsByView: lockBaseAdjustmentsByView }
        : {}),
      ...(Object.keys(lockDirectiveProfilesByView).length > 0
        ? { directiveProfilesByView: lockDirectiveProfilesByView }
        : {}),
      candidateCountOverride: lockCandidateCount,
      acceptedScoreThresholdOverride: lockAcceptedScoreThreshold,
      seedOffset: input.seedOffset
    });
    applyConsistencyScoring(
      scored,
      promptBundle.qualityProfile.targetStyle,
      promptBundle.speciesId,
      acceptedScoreThreshold
    );
    return resolvedLockViews;
  };

  const supportsReferenceSequential =
    sequentialReferenceEnabled &&
    providerName !== "mock" &&
    generation.viewToGenerate === undefined &&
    requestedViews.length > 1;

  if (supportsReferenceSequential && requestedViews.includes("front")) {
    const frontMasterCandidateCount = Math.max(
      clamped.candidateCount,
      Math.floor(promptBundle.selectionHints.frontMasterCandidateCount ?? clamped.candidateCount)
    );
    const frontReferenceBank: CharacterReferenceBankEntry[] = [];
    // Dog and wolf still need a stronger front bootstrap to keep species identity readable
    // while staying on the worker's actual front_master -> side_view_* -> repair chain.
    const frontStarterReference = referenceImageBase64
      ? loadMascotStarterReference(promptBundle.speciesId, "front")
      : loadMascotFrontBootstrapReference(promptBundle.speciesId);
    const frontReferenceInput =
      typeof referenceImageBase64 === "string" && referenceImageBase64.length > 0
        ? {
            referenceImageBase64,
            referenceMimeType
          }
        : frontStarterReference
          ? {
              referenceImageBase64: frontStarterReference.referenceImageBase64,
              referenceMimeType: frontStarterReference.referenceMimeType
            }
          : undefined;
    if (referenceImageBase64) {
      frontReferenceBank.push(
        createReferenceBankEntry({
          id: "external_subject_reference",
          role: "subject",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "front",
            role: "subject",
            targetView: "front",
            hasStarter: Boolean(frontStarterReference)
          }),
          note: "user or continuity reference",
          image: {
            referenceImageBase64,
            referenceMimeType
          }
        })
      );
    }
    if (frontStarterReference) {
      frontReferenceBank.push(
        createReferenceBankEntry({
          id: "front_starter_reference",
          role: "starter",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "front",
            role: "starter",
            targetView: "front",
            hasStarter: true
          }),
          note: frontStarterReference.sourcePath,
          image: frontStarterReference
        })
      );
    }
    frontReferenceBank.push(
      ...buildMascotFamilyReferenceEntries({
        speciesId: promptBundle.speciesId,
        stage: "front",
        targetView: "front",
        familyReferencesByView: mascotFamilyReferencesByView,
        hasStarter: Boolean(frontStarterReference),
        preferMultiReference: promptBundle.selectionHints.preferMultiReference,
        heroModeEnabled: shouldEnableMascotHeroMode({
          stage: "front",
          heroMode: promptBundle.heroMode
        })
      })
    );
    await runViewGeneration({
      views: ["front"],
      stage: "front",
      origin: "initial",
      passLabel: "front.initial",
      reasonCodes: ["sequential_front_anchor"],
      triggerViews: ["front"],
      candidateCountOverride: frontMasterCandidateCount,
      acceptedScoreThresholdOverride:
        typeof promptBundle.selectionHints.frontMasterMinAcceptedScore === "number"
          ? promptBundle.selectionHints.frontMasterMinAcceptedScore
          : acceptedScoreThreshold,
      budgetViewCount: requestedViews.length,
      ...(frontReferenceInput ? { referenceInput: frontReferenceInput } : {}),
      ...(frontReferenceBank.length > 0 ? { referenceBank: dedupeReferenceBank(frontReferenceBank) } : {})
    });

    applyConsistencyScoring(
      scored,
      promptBundle.qualityProfile.targetStyle,
      promptBundle.speciesId,
      acceptedScoreThreshold
    );
    const bestAfterFront = groupBestByView(scored);
    let frontBaselineCandidate = bestAfterFront.front;
    const frontAnchorMinScore =
      typeof promptBundle.selectionHints.frontMasterMinAcceptedScore === "number"
        ? promptBundle.selectionHints.frontMasterMinAcceptedScore
        : acceptedScoreThreshold;
    let frontBaseline = isStrongFrontMasterCandidate(
      frontBaselineCandidate,
      promptBundle.qualityProfile.targetStyle,
      frontAnchorMinScore,
      promptBundle.speciesId
    )
      ? frontBaselineCandidate
      : undefined;
    const frontRescueCandidate =
      ultraWorkflowEnabled && frontBaselineCandidate && !frontBaseline
        ? selectBestRepairBaseCandidate({
            scored,
            view: "front",
            targetStyle: promptBundle.qualityProfile.targetStyle,
            acceptedScoreThreshold: frontAnchorMinScore
          })
        : undefined;
    if (frontRescueCandidate && !frontBaseline) {
      const frontRescueBank: CharacterReferenceBankEntry[] = [
        createReferenceBankEntry({
          id: `${frontRescueCandidate.candidate.id}_front_rescue_base`,
          role: "repair_base",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "repair",
            role: "repair_base",
            targetView: "front",
            hasStarter: Boolean(frontStarterReference)
          }),
          note: "front rescue repair base",
          image: inlineReferenceFromCandidate(frontRescueCandidate.candidate)
        }),
        createReferenceBankEntry({
          id: `${frontRescueCandidate.candidate.id}_front_rescue_front_master`,
          role: "front_master",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "repair",
            role: "front_master",
            targetView: "front",
            hasStarter: Boolean(frontStarterReference)
          }),
          note: "front rescue provisional identity anchor",
          image: inlineReferenceFromCandidate(frontRescueCandidate.candidate)
        }),
        createReferenceBankEntry({
          id: `${frontRescueCandidate.candidate.id}_front_rescue_composition`,
          role: "composition",
          view: "front",
          weight: resolveAdaptiveReferenceWeight({
            stage: "repair",
            role: "composition",
            targetView: "front",
            hasStarter: Boolean(frontStarterReference)
          }),
          note: "front rescue current draft composition",
          image: inlineReferenceFromCandidate(frontRescueCandidate.candidate)
        })
      ];
      if (referenceImageBase64) {
        frontRescueBank.push(
          createReferenceBankEntry({
            id: "front_rescue_subject_reference",
            role: "subject",
            view: "front",
            weight: resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "subject",
              targetView: "front",
              hasStarter: Boolean(frontStarterReference)
            }),
            note: "shared rescue identity reference",
            image: {
              referenceImageBase64,
              referenceMimeType
            }
          })
        );
      }
      if (frontStarterReference) {
        frontRescueBank.push(
          createReferenceBankEntry({
            id: "front_rescue_starter_reference",
            role: "starter",
            view: "front",
            weight: resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "starter",
              targetView: "front",
              hasStarter: true
            }),
            note: frontStarterReference.sourcePath,
            image: frontStarterReference
          })
        );
      }
      frontRescueBank.push(
        ...buildMascotFamilyReferenceEntries({
          speciesId: promptBundle.speciesId,
          stage: "repair",
          targetView: "front",
          familyReferencesByView: mascotFamilyReferencesByView,
          hasStarter: Boolean(frontStarterReference),
          preferMultiReference: promptBundle.selectionHints.preferMultiReference,
          heroModeEnabled: shouldEnableMascotHeroMode({
            stage: "repair",
            heroMode: promptBundle.heroMode,
            frontAnchorScore: frontBaselineCandidate?.score
          })
        })
      );
      const frontRescueMask = await buildRepairMaskReferenceForCandidate(frontRescueCandidate);
      const frontRescueDirective = buildRepairDirectiveProfile({
        stage: "repair",
        view: "front",
        candidate: frontRescueCandidate,
        speciesId: promptBundle.speciesId
      });
      const frontRescueAdjustment = frontRescueDirective?.adjustment;
      const frontRescueCandidateCount = Math.max(
        1,
        Math.floor(
          (promptBundle.selectionHints.repairCandidateCount ?? 2) + (frontRescueDirective?.candidateCountBoost ?? 0)
        )
      );
      const frontRescueAcceptedThreshold = Math.min(
        0.98,
        frontAnchorMinScore + (frontRescueDirective?.acceptedScoreThresholdBoost ?? 0)
      );
      await helpers.logJob(jobDbId, "info", "Running front rescue before angle generation", {
        frontCandidateId: frontRescueCandidate.candidate.id,
        frontCandidateScore: Number(frontRescueCandidate.score.toFixed(4)),
        frontAnchorMinScore: Number(frontAnchorMinScore.toFixed(4)),
        rescueDirective: frontRescueDirective ? summarizeRepairDirectiveProfile(frontRescueDirective) : null
      });
      await runViewGeneration({
        views: ["front"],
        stage: "repair",
        origin: "front_rescue",
        passLabel: "front.rescue",
        reasonCodes: ["weak_front_anchor", "repair_refine"],
        triggerViews: ["front"],
        candidateCountOverride: frontRescueCandidateCount,
        acceptedScoreThresholdOverride: frontRescueAcceptedThreshold,
        referenceInputByView: {
          front: inlineReferenceFromCandidate(frontRescueCandidate.candidate)
        },
        repairMaskByView: {
          front: frontRescueMask
        },
        referenceBankByView: {
          front: dedupeReferenceBank(frontRescueBank)
        },
        ...(hasRetryAdjustmentContent(frontRescueAdjustment)
          ? {
              baseAdjustmentsByView: {
                front: frontRescueAdjustment
              }
            }
          : {}),
        ...(frontRescueDirective
          ? {
              directiveProfilesByView: {
                front: summarizeRepairDirectiveProfile(frontRescueDirective)
              }
            }
          : {}),
        repairFromCandidateIds: {
          front: frontRescueCandidate.candidate.id
        }
      });
      applyConsistencyScoring(
        scored,
        promptBundle.qualityProfile.targetStyle,
        promptBundle.speciesId,
        acceptedScoreThreshold
      );
      const bestAfterFrontRescue = groupBestByView(scored);
      frontBaselineCandidate = bestAfterFrontRescue.front;
      frontBaseline = isStrongFrontMasterCandidate(
        frontBaselineCandidate,
        promptBundle.qualityProfile.targetStyle,
        frontAnchorMinScore,
        promptBundle.speciesId
      )
        ? frontBaselineCandidate
        : undefined;
      await helpers.logJob(jobDbId, "info", "Front rescue completed", {
        frontCandidateId: frontBaselineCandidate?.candidate.id ?? null,
        frontCandidateScore: frontBaselineCandidate ? Number(frontBaselineCandidate.score.toFixed(4)) : null,
        frontRecovered: Boolean(frontBaseline)
      });
    }
    if (frontBaselineCandidate && !frontBaseline) {
      const weakFrontMessage = "Front master candidate was too weak to use as the identity anchor.";
      providerWarning = providerWarning ? `${providerWarning} | ${weakFrontMessage}` : weakFrontMessage;
    }
    const remainingViews = requestedViews.filter((view) => view !== "front");
    const canProceedToAnglesWithoutStrongFront = generation.mode === "reference" || continuityReferenceSessionId !== null;
    const allowAngleGeneration = Boolean(frontBaseline) || canProceedToAnglesWithoutStrongFront;
    if (remainingViews.length > 0 && !allowAngleGeneration) {
      const stopMessage = "Angles skipped because front rescue did not produce a strong front anchor.";
      providerWarning = providerWarning ? `${providerWarning} | ${stopMessage}` : stopMessage;
      await helpers.logJob(jobDbId, "warn", "Skipping angle generation due to weak front anchor", {
        remainingViews,
        frontCandidateId: frontBaselineCandidate?.candidate.id ?? null,
        frontCandidateScore: frontBaselineCandidate ? Number(frontBaselineCandidate.score.toFixed(4)) : null,
        continuityReferenceSessionId
      });
    }
    const anglePoseGuides = loadStagePoseGuides({
      speciesId: promptBundle.speciesId,
      views: remainingViews
    });

    let sideReference: InlineImageReference | undefined;

    if (frontBaseline) {
      sideReference = {
        referenceImageBase64: frontBaseline.candidate.data.toString("base64"),
        referenceMimeType: frontBaseline.candidate.mimeType
      };
    } else if (referenceImageBase64) {
      sideReference = {
        referenceImageBase64,
        referenceMimeType
      };
    }

    if (remainingViews.length > 0 && allowAngleGeneration) {
      const starterReferenceByView = loadMascotStarterReferencesByView(promptBundle.speciesId, remainingViews);
      const preferredAngleReferenceInputByView = buildPreferredSideReferenceInputByView({
        views: remainingViews,
        familyReferencesByView: mascotFamilyReferencesByView,
        starterReferenceByView
      });
      const filteredAnglePoseGuides = excludePoseGuidesCoveredByStarter(
        "angles",
        anglePoseGuides,
        starterReferenceByView
      );
      const angleReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
      const angleReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
      for (const view of remainingViews) {
        const bank: CharacterReferenceBankEntry[] = [];
        const starterReference = starterReferenceByView[view];
        const preferredSideReference = preferredAngleReferenceInputByView[view];
        const sideStarterLikeReference = starterReference ?? preferredSideReference;
        if (preferredSideReference) {
          angleReferenceInputByView[view] = preferredSideReference;
        }
        if (frontBaseline) {
          bank.push(
            createReferenceBankEntry({
              id: `${frontBaseline.candidate.id}_front_master`,
              role: "front_master",
              view: "front",
              weight: resolveAdaptiveReferenceWeight({
                stage: "angles",
                role: "front_master",
                targetView: view,
                hasStarter: Boolean(sideStarterLikeReference)
              }),
              note: "approved front master anchor",
              image: inlineReferenceFromCandidate(frontBaseline.candidate)
            })
          );
        } else if (sideReference) {
          bank.push(
            createReferenceBankEntry({
              id: `${view}_external_subject_anchor`,
              role: "subject",
              view: "front",
              weight: resolveAdaptiveReferenceWeight({
                stage: "angles",
                role: "subject",
                targetView: view,
                hasStarter: Boolean(sideStarterLikeReference)
              }),
              note: "external fallback identity anchor",
              image: sideReference
            })
          );
        }
        if (sideStarterLikeReference) {
          bank.push(
            createReferenceBankEntry({
              id: starterReference ? `${view}_starter` : `${view}_preferred_side_starter`,
              role: "view_starter",
              view,
              weight: resolveAdaptiveReferenceWeight({
                stage: "angles",
                role: "view_starter",
                targetView: view,
                hasStarter: true
              }),
              note:
                starterReference && "sourcePath" in starterReference
                  ? starterReference.sourcePath
                  : "preferred side reference starter anchor",
              image: sideStarterLikeReference
            })
          );
        }
        bank.push(
          ...buildMascotFamilyReferenceEntries({
            speciesId: promptBundle.speciesId,
            stage: "angles",
            targetView: view,
            familyReferencesByView: mascotFamilyReferencesByView,
            hasStarter: Boolean(sideStarterLikeReference),
            preferMultiReference: promptBundle.selectionHints.preferMultiReference,
            heroModeEnabled: shouldEnableMascotHeroMode({
              stage: "angles",
              heroMode: promptBundle.heroMode,
              frontAnchorScore: frontBaseline?.score
            })
          })
        );
        if (bank.length > 0) {
          angleReferenceBankByView[view] = dedupeReferenceBank(bank);
        }
      }
      if (Object.keys(starterReferenceByView).length > 0) {
        starterReferencePathsByView = {
          ...(starterReferencePathsByView ?? {}),
          ...Object.fromEntries(
            Object.entries(starterReferenceByView).map(([view, guide]) => [view, guide.sourcePath])
          )
        };
      }
      await runViewGeneration({
        views: remainingViews,
        stage: "angles",
        origin: "initial",
        passLabel: "angles.initial",
        reasonCodes: [
          frontBaseline
            ? "approved_front_anchor"
            : continuityReferenceSessionId
              ? "continuity_anchor"
              : "external_anchor_fallback"
        ],
        triggerViews: remainingViews,
        ...(sideReference ? { referenceInput: sideReference } : {}),
        ...(Object.keys(angleReferenceInputByView).length > 0 ? { referenceInputByView: angleReferenceInputByView } : {}),
        ...(Object.keys(angleReferenceBankByView).length > 0 ? { referenceBankByView: angleReferenceBankByView } : {}),
        ...(Object.keys(filteredAnglePoseGuides).length > 0 ? { poseGuidesByView: filteredAnglePoseGuides } : {})
      });
    }
  } else {
    let perViewReference: InlineImageReference | undefined;
    if (generation.viewToGenerate && generation.viewToGenerate !== "front") {
      perViewReference = await resolveFrontReferenceFromManifest(referenceSourceManifestPath);
      if (!perViewReference && sessionId) {
        perViewReference = await resolveFrontReferenceFromSession(prisma, sessionId, continuityConfig);
      }
    } else if (referenceImageBase64) {
      perViewReference = {
        referenceImageBase64,
        referenceMimeType
      };
    }
    const requestedPoseViews = requestedViews.filter((view) => view !== "front");
    const poseGuidesByView = loadStagePoseGuides({
      speciesId: promptBundle.speciesId,
      views: requestedPoseViews
    });
    const starterReferenceByView = loadMascotStarterReferencesByView(promptBundle.speciesId, requestedViews);
    const filteredPoseGuidesByView = excludePoseGuidesCoveredByStarter(
      requestedBaseStage,
      poseGuidesByView,
      starterReferenceByView
    );
    const preferredSideReferenceInputByView = buildPreferredSideReferenceInputByView({
      views: requestedViews,
      familyReferencesByView: mascotFamilyReferencesByView,
      starterReferenceByView
    });
    const perViewReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
    const perViewReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
    for (const view of requestedViews) {
      const bank: CharacterReferenceBankEntry[] = [];
      const starterReference = starterReferenceByView[view];
      const preferredSideReference = preferredSideReferenceInputByView[view];
      const sideStarterLikeReference = starterReference ?? preferredSideReference;
      if (preferredSideReference) {
        perViewReferenceInputByView[view] = preferredSideReference;
      }
      if (perViewReference) {
        bank.push(
          createReferenceBankEntry({
            id: `${view}_reference_anchor`,
            role: generation.viewToGenerate ? "front_master" : "subject",
            view: generation.viewToGenerate && generation.viewToGenerate !== "front" ? "front" : view,
            weight: resolveAdaptiveReferenceWeight({
              stage: requestedBaseStage,
              role: generation.viewToGenerate ? "front_master" : "subject",
              targetView: view,
              hasStarter: Boolean(sideStarterLikeReference)
            }),
            note: generation.viewToGenerate ? "front continuity reference" : "shared external reference",
            image: perViewReference
          })
        );
      }
      if (sideStarterLikeReference) {
        bank.push(
          createReferenceBankEntry({
            id: starterReference ? `${view}_starter` : `${view}_preferred_side_starter`,
            role: "view_starter",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: requestedBaseStage,
              role: "view_starter",
              targetView: view,
              hasStarter: true
            }),
            note:
              starterReference && "sourcePath" in starterReference
                ? starterReference.sourcePath
                : "preferred side reference starter anchor",
            image: sideStarterLikeReference
          })
        );
      }
      bank.push(
        ...buildMascotFamilyReferenceEntries({
          speciesId: promptBundle.speciesId,
          stage: requestedBaseStage,
          targetView: view,
          familyReferencesByView: mascotFamilyReferencesByView,
          hasStarter: Boolean(sideStarterLikeReference),
          preferMultiReference: promptBundle.selectionHints.preferMultiReference,
          heroModeEnabled: shouldEnableMascotHeroMode({
            stage: requestedBaseStage,
            heroMode: promptBundle.heroMode
          })
        })
      );
      if (bank.length > 0) {
        perViewReferenceBankByView[view] = dedupeReferenceBank(bank);
      }
    }
    if (Object.keys(starterReferenceByView).length > 0) {
      starterReferencePathsByView = {
        ...(starterReferencePathsByView ?? {}),
        ...Object.fromEntries(
          Object.entries(starterReferenceByView).map(([view, guide]) => [view, guide.sourcePath])
        )
      };
    }

    await runViewGeneration({
      views: requestedViews,
      stage: requestedBaseStage,
      origin: generation.viewToGenerate ? "view_regen" : "initial",
      passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.regen` : "angles.initial_nonseq",
      reasonCodes: [generation.viewToGenerate ? "manual_view_request" : "non_sequential_base_pass"],
        triggerViews: requestedViews,
        ...(perViewReference ? { referenceInput: perViewReference } : {}),
        ...(Object.keys(perViewReferenceInputByView).length > 0 ? { referenceInputByView: perViewReferenceInputByView } : {}),
        ...(Object.keys(perViewReferenceBankByView).length > 0 ? { referenceBankByView: perViewReferenceBankByView } : {}),
        ...(Object.keys(filteredPoseGuidesByView).length > 0 ? { poseGuidesByView: filteredPoseGuidesByView } : {})
      });
  }

  applyConsistencyScoring(
    scored,
    promptBundle.qualityProfile.targetStyle,
    promptBundle.speciesId,
    acceptedScoreThreshold
  );
  const repairScoreFloor = Math.max(
    0.18,
    Math.min(
      acceptedScoreThreshold - 0.02,
      promptBundle.selectionHints.repairScoreFloor ?? acceptedScoreThreshold * 0.72
    )
  );

  if (ultraWorkflowEnabled) {
    const bestAfterBase = groupBestByView(scored);
    const frontBaseline = isStrongFrontMasterCandidate(
      bestAfterBase.front,
      promptBundle.qualityProfile.targetStyle,
      acceptedScoreThreshold,
      promptBundle.speciesId
    )
      ? bestAfterBase.front
      : undefined;
    const frontReferenceForRefine = frontBaseline
      ? inlineReferenceFromCandidate(frontBaseline.candidate)
      : undefined;
    await maybeRunUltraSideRefineStage({
      targetViews: requestedViews.filter((view) => view !== "front"),
      bestByView: bestAfterBase,
      frontReferenceInput: frontReferenceForRefine,
      origin: "refine_pass",
      passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.refine` : "angles.refine",
      reasonCodes: [generation.viewToGenerate ? "single_view_soft_refine" : "angle_soft_refine"],
      triggerViews: requestedViews.filter((view) => view !== "front"),
      seedOffset: generation.viewToGenerate ? 3200 : 2200
    });
    const bestAfterRefine = groupBestByView(scored);
    const refinedFrontBaseline = isStrongFrontMasterCandidate(
      bestAfterRefine.front,
      promptBundle.qualityProfile.targetStyle,
      acceptedScoreThreshold,
      promptBundle.speciesId
    )
      ? bestAfterRefine.front
      : frontBaseline;
    const frontReferenceForLock = refinedFrontBaseline
      ? inlineReferenceFromCandidate(refinedFrontBaseline.candidate)
      : frontReferenceForRefine;
    await maybeRunUltraIdentityLockStage({
      targetViews: requestedViews.filter((view) => view !== "front"),
      bestByView: bestAfterRefine,
      frontReferenceInput: frontReferenceForLock,
      origin: "lock_pass",
      passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.identity_lock` : "angles.identity_lock",
      reasonCodes: [generation.viewToGenerate ? "single_view_identity_lock" : "angle_identity_lock"],
      triggerViews: requestedViews.filter((view) => view !== "front"),
      seedOffset: generation.viewToGenerate ? 4100 : 3100
    });
    const bestAfterLock = groupBestByView(scored);
    const lockedFrontBaseline = isStrongFrontMasterCandidate(
      bestAfterLock.front,
      promptBundle.qualityProfile.targetStyle,
      acceptedScoreThreshold,
      promptBundle.speciesId
    )
      ? bestAfterLock.front
      : refinedFrontBaseline;
    const sideViewAcceptanceGate = buildSideViewAcceptanceGate({
      targetViews: requestedViews.filter((view) => view !== "front"),
      baseByView: bestAfterBase,
      refineByView: bestAfterRefine,
      lockByView: bestAfterLock,
      acceptedScoreThreshold,
      targetStyle: promptBundle.qualityProfile.targetStyle
    });
    if (Object.keys(sideViewAcceptanceGate.selectedByView).length > 0) {
      preferredSelectionByView = {
        ...preferredSelectionByView,
        ...sideViewAcceptanceGate.selectedByView
      };
      recordSideViewAcceptanceGateStage({
        views: requestedViews.filter((view) => view !== "front"),
        selectedByView: sideViewAcceptanceGate.selectedByView,
        gateDecisionsByView: sideViewAcceptanceGate.gateDecisionsByView,
        origin: "lock_pass",
        passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.acceptance_gate` : "angles.acceptance_gate",
        reasonCodes: ["side_view_acceptance_gate"],
        triggerViews: requestedViews.filter((view) => view !== "front"),
        seedOffset: generation.viewToGenerate ? 4700 : 3700
      });
    }
    const bestAfterAcceptanceGate = {
      ...bestAfterLock,
      ...sideViewAcceptanceGate.selectedByView
    };
    const repairTriageCandidateByView: Partial<Record<CharacterView, ScoredCandidate>> = {};
    for (const view of requestedViews) {
      const candidate =
        preferredSelectionByView[view] ??
        selectBestRepairBaseCandidate({
          scored,
          view,
          targetStyle: promptBundle.qualityProfile.targetStyle,
          acceptedScoreThreshold
        }) ??
        bestAfterAcceptanceGate[view];
      if (candidate) {
        repairTriageCandidateByView[view] = candidate;
      }
    }
    const repairTriagePackCoherence =
      generation.viewToGenerate === undefined
        ? buildPackCoherenceDiagnostics({
            selectedByView: repairTriageCandidateByView,
            targetStyle: promptBundle.qualityProfile.targetStyle,
            acceptedScoreThreshold,
            speciesId: promptBundle.speciesId
          })
        : undefined;
    const repairTriageGate = buildRepairTriageGate({
      targetViews: requestedViews,
      candidateByView: repairTriageCandidateByView,
      acceptedScoreThreshold,
      repairScoreFloor,
      frontAnchorAcceptedScoreThreshold,
      targetStyle: promptBundle.qualityProfile.targetStyle,
      packCoherence: repairTriagePackCoherence,
      rigStability:
        generation.viewToGenerate === undefined
          ? assessRigStability({
              selectedByView: repairTriageCandidateByView,
              packCoherence: repairTriagePackCoherence,
              targetStyle: promptBundle.qualityProfile.targetStyle,
              speciesId: promptBundle.speciesId,
              autoReroute: autoRerouteDiagnostics
            })
          : undefined,
      speciesId: promptBundle.speciesId,
      gateDecisionsByView: sideViewAcceptanceGate.gateDecisionsByView
    });
    applyRepairEmbargoDecisions(requestedViews, repairTriageGate.repairTriageByView);
    if (Object.keys(repairTriageGate.repairTriageByView).length > 0) {
      recordRepairTriageGateStage({
        views: requestedViews,
        selectedByView: repairTriageCandidateByView,
        repairTriageByView: repairTriageGate.repairTriageByView,
        origin: "repair_pass",
        passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.repair_triage` : "angles.repair_triage",
        reasonCodes: ["repair_triage_gate"],
        triggerViews: requestedViews,
        seedOffset: generation.viewToGenerate ? 5000 : 4000
      });
    }

    if (repairTriageGate.repairViews.length > 0) {
      const repairReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
      const repairMaskByView: Partial<Record<CharacterView, InlineImageReference>> = {};
      const repairReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
      const repairBaseAdjustmentsByView: Partial<Record<CharacterView, RetryAdjustment>> = {};
      const repairDirectiveProfilesByView: Partial<Record<CharacterView, RepairDirectiveProfileSummary>> = {
        ...repairTriageGate.directiveProfilesByView
      };
      const repairFromCandidateIds: Partial<Record<CharacterView, string>> = {};

      for (const view of repairTriageGate.repairViews) {
        const candidate = repairTriageGate.repairBaseByView[view];
        if (!candidate) {
          continue;
        }

        repairReferenceInputByView[view] = inlineReferenceFromCandidate(candidate.candidate);
        repairMaskByView[view] = await buildRepairMaskReferenceForCandidate(candidate);
        repairFromCandidateIds[view] = candidate.candidate.id;
        const repairDirective = buildRepairDirectiveProfile({
          stage: "repair",
          view,
          candidate,
          speciesId: promptBundle.speciesId
        });
        const repairBaseAdjustment = repairDirective?.adjustment;
        if (hasRetryAdjustmentContent(repairBaseAdjustment)) {
          repairBaseAdjustmentsByView[view] = repairBaseAdjustment;
        }
        if (repairDirective && !repairDirectiveProfilesByView[view]) {
          repairDirectiveProfilesByView[view] = summarizeRepairDirectiveProfile(repairDirective);
        }
        const starterReference = loadMascotStarterReference(promptBundle.speciesId, view);

        const bank: CharacterReferenceBankEntry[] = [
          createReferenceBankEntry({
            id: `${candidate.candidate.id}_repair`,
            role: "repair_base",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "repair_base",
              targetView: view,
              hasStarter: Boolean(starterReference),
              directiveFamilies: repairDirective?.families,
              directiveSeverity: repairDirective?.severity
            }),
            note: "best candidate before repair",
            image: inlineReferenceFromCandidate(candidate.candidate)
          }),
          createReferenceBankEntry({
            id: `${candidate.candidate.id}_repair_composition`,
            role: "composition",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "composition",
              targetView: view,
              hasStarter: Boolean(starterReference),
              directiveFamilies: repairDirective?.families,
              directiveSeverity: repairDirective?.severity
            }),
            note: "repair current draft composition",
            image: inlineReferenceFromCandidate(candidate.candidate)
          })
        ];

        if (lockedFrontBaseline) {
          bank.push(
            createReferenceBankEntry({
              id: `${lockedFrontBaseline.candidate.id}_front_master`,
              role: "front_master",
              view: "front",
              weight: resolveAdaptiveReferenceWeight({
                stage: "repair",
                role: "front_master",
                targetView: view,
                hasStarter: Boolean(starterReference),
                directiveFamilies: repairDirective?.families,
                directiveSeverity: repairDirective?.severity
              }),
              note: "approved front master anchor",
              image: inlineReferenceFromCandidate(lockedFrontBaseline.candidate)
            })
          );
        }
        bank.push(
          ...buildMascotFamilyReferenceEntries({
            speciesId: promptBundle.speciesId,
            stage: "repair",
            targetView: view,
            familyReferencesByView: mascotFamilyReferencesByView,
            hasStarter: Boolean(starterReference),
            directiveFamilies: repairDirective?.families,
            directiveSeverity: repairDirective?.severity,
            preferMultiReference: promptBundle.selectionHints.preferMultiReference,
            heroModeEnabled: shouldEnableMascotHeroMode({
              stage: "repair",
              heroMode: promptBundle.heroMode,
              frontAnchorScore: lockedFrontBaseline?.score ?? frontBaseline?.score
            })
          })
        );

        repairReferenceBankByView[view] = dedupeReferenceBank(bank);
      }

      const repairViews = Object.keys(repairReferenceInputByView) as CharacterView[];
      if (repairViews.length > 0) {
        const repairCandidateCount = Math.max(
          1,
          Math.floor(
            (promptBundle.selectionHints.repairCandidateCount ?? 2) +
              Math.max(
                0,
                ...repairViews.map((view) => repairDirectiveProfilesByView[view]?.candidateCountBoost ?? 0)
              )
          )
        );
        const repairAcceptedScoreThreshold = Math.min(
          0.98,
          acceptedScoreThreshold +
            Math.max(
              0,
              ...repairViews.map((view) => repairDirectiveProfilesByView[view]?.acceptedScoreThresholdBoost ?? 0)
            )
        );
        await helpers.logJob(jobDbId, "info", "Running ultra repair/refine stage", {
          repairViews,
          repairMaskViews: Object.keys(repairMaskByView),
          repairScoreFloor: Number(repairScoreFloor.toFixed(4)),
          acceptedScoreThreshold: Number(acceptedScoreThreshold.toFixed(4)),
          repairAcceptedScoreThreshold: Number(repairAcceptedScoreThreshold.toFixed(4)),
          repairCandidateCount,
          repairSourceCandidateIds: repairFromCandidateIds,
          repairDirectives: repairDirectiveProfilesByView
        });
        await runViewGeneration({
          views: repairViews,
          stage: "repair",
          origin: "repair_pass",
          passLabel: "repair.base",
          reasonCodes: ["repair_score_floor"],
          triggerViews: repairViews,
          candidateCountOverride: repairCandidateCount,
          acceptedScoreThresholdOverride: repairAcceptedScoreThreshold,
          referenceInput: refinedFrontBaseline ? inlineReferenceFromCandidate(refinedFrontBaseline.candidate) : undefined,
          referenceInputByView: repairReferenceInputByView,
          repairMaskByView,
          referenceBankByView: repairReferenceBankByView,
          ...(Object.keys(repairBaseAdjustmentsByView).length > 0
            ? {
                baseAdjustmentsByView: repairBaseAdjustmentsByView
              }
            : {}),
          ...(Object.keys(repairDirectiveProfilesByView).length > 0
            ? {
                directiveProfilesByView: repairDirectiveProfilesByView
              }
            : {}),
          repairFromCandidateIds,
          ...(Object.keys(repairTriageGate.repairLineageByView).length > 0
            ? {
                repairLineageByView: repairTriageGate.repairLineageByView
              }
            : {})
        });
        applyConsistencyScoring(
          scored,
          promptBundle.qualityProfile.targetStyle,
          promptBundle.speciesId,
          acceptedScoreThreshold
        );
        const postRepairAcceptanceGate = buildPostRepairAcceptanceGate({
          targetViews: repairViews,
          preRepairByView: repairTriageGate.repairBaseByView,
          repairByView: Object.fromEntries(
            repairViews
              .map((view) => [
                view,
                selectBestCandidateForViewByStages({
                  scored,
                  view,
                  stages: ["repair_refine"]
                })
              ])
              .filter((entry): entry is [CharacterView, ScoredCandidate] => Boolean(entry[1]))
          ) as Partial<Record<CharacterView, ScoredCandidate>>,
          acceptedScoreThreshold,
          promotionThresholdByView: Object.fromEntries(
            repairViews.map((view) => [view, repairAcceptedScoreThreshold])
          ) as Partial<Record<CharacterView, number>>,
          targetStyle: promptBundle.qualityProfile.targetStyle
        });
        if (Object.keys(postRepairAcceptanceGate.selectedByView).length > 0) {
          preferredSelectionByView = {
            ...preferredSelectionByView,
            ...postRepairAcceptanceGate.selectedByView
          };
          recordPostRepairAcceptanceGateStage({
            views: repairViews,
            selectedByView: postRepairAcceptanceGate.selectedByView,
            repairAcceptanceByView: postRepairAcceptanceGate.repairAcceptanceByView,
            acceptedScoreThresholdOverride: repairAcceptedScoreThreshold,
            origin: "repair_pass",
            passLabel: "repair.acceptance_gate",
            reasonCodes: ["post_repair_acceptance_gate"],
            triggerViews: repairViews,
            seedOffset: generation.viewToGenerate ? 5600 : 4600
          });
        }
      }
    }
  }

  const preFallbackBest = mergePreferredSelectionByViewForSelection({
    baseSelectedByView: groupBestByViewForSelection({
      scored,
      targetStyle: promptBundle.qualityProfile.targetStyle,
      acceptedScoreThreshold
    }),
    preferredSelectionByView,
    targetStyle: promptBundle.qualityProfile.targetStyle,
    acceptedScoreThreshold
  });
  const preFallbackLowQuality = requestedViews.filter((view) => {
    const candidate = preFallbackBest[view];
    if (!candidate) {
      return true;
    }
    if (candidate.rejections.length > 0) {
      return true;
    }
    if (
      isRuntimeBucketLowQuality({
        candidate,
        targetStyle: promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold
      })
    ) {
      return true;
    }
    return candidate.score < acceptedScoreThreshold;
  });

  if (
    preFallbackLowQuality.length > 0 &&
    providerName !== "mock" &&
    allowLowQualityMockFallback
  ) {
    const fallbackMsg = `Low-quality views (${preFallbackLowQuality.join(
      ", "
    )}) detected. Running mock fallback candidates.`;
    providerWarning = providerWarning ? `${providerWarning} | ${fallbackMsg}` : fallbackMsg;
    providerName = "mock";
    provider = createCharacterProvider({ provider: "mock" });

    await runViewGeneration({
      views: preFallbackLowQuality,
      stage: requestedBaseStage,
      origin: "mock_fallback",
      passLabel: generation.viewToGenerate ? `${requestedBasePassPrefix}.mock_fallback` : "angles.mock_fallback",
      reasonCodes: ["low_quality_fallback", "provider_mock"],
      triggerViews: preFallbackLowQuality,
      ...(referenceImageBase64
        ? {
            referenceInput: {
              referenceImageBase64,
              referenceMimeType
            }
          }
        : {})
    });
    applyConsistencyScoring(
      scored,
      promptBundle.qualityProfile.targetStyle,
      promptBundle.speciesId,
      acceptedScoreThreshold
    );
  }

  const computeSelectionOutcome = (): {
    selectedByView: Partial<Record<CharacterView, ScoredCandidate>>;
    missingGeneratedViews: CharacterView[];
    lowQualityGeneratedViews: CharacterView[];
    runtimeLowQualityViews: CharacterView[];
    packCoherence: PackCoherenceDiagnostics | undefined;
    rigStability: RigStabilityDiagnostics | undefined;
    coherenceIssues: string[];
    frontStrong: boolean;
  } => {
    const selectedByView = mergePreferredSelectionByViewForSelection({
      baseSelectedByView: groupBestByViewForSelection({
        scored,
        targetStyle: promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold
      }),
      preferredSelectionByView,
      targetStyle: promptBundle.qualityProfile.targetStyle,
      acceptedScoreThreshold
    });
    const missingGeneratedViews = requestedViews.filter((view) => !selectedByView[view]);
    const runtimeLowQualityViews = requestedViews.filter((view) => {
      const candidate = selectedByView[view];
      if (!candidate) {
        return false;
      }
      return isRuntimeBucketLowQuality({
        candidate,
        targetStyle: promptBundle.qualityProfile.targetStyle,
        acceptedScoreThreshold
      });
    });
    const lowQualityGeneratedViews = requestedViews.filter((view) => {
      const candidate = selectedByView[view];
      if (!candidate) {
        return true;
      }
      if (isRepairEmbargoedSelection(view, candidate)) {
        return true;
      }
      if (candidate.rejections.length > 0) {
        return true;
      }
      if (runtimeLowQualityViews.includes(view)) {
        return true;
      }
      return candidate.score < acceptedScoreThreshold;
    });
    const packCoherence =
      generation.viewToGenerate === undefined
        ? buildPackCoherenceDiagnostics({
            selectedByView,
            targetStyle: promptBundle.qualityProfile.targetStyle,
            acceptedScoreThreshold,
            speciesId: promptBundle.speciesId
          })
        : undefined;
    const rigStability =
      generation.viewToGenerate === undefined
        ? assessRigStability({
            selectedByView,
            packCoherence,
            targetStyle: promptBundle.qualityProfile.targetStyle,
            speciesId: promptBundle.speciesId,
            autoReroute: autoRerouteDiagnostics
          })
        : undefined;
    return {
      selectedByView,
      missingGeneratedViews,
      lowQualityGeneratedViews,
      runtimeLowQualityViews,
      packCoherence,
      rigStability,
      coherenceIssues: packCoherence?.issues ?? [],
      frontStrong: isStrongFrontMasterCandidate(
        selectedByView.front,
        promptBundle.qualityProfile.targetStyle,
        frontAnchorAcceptedScoreThreshold,
        promptBundle.speciesId
      )
    };
  };

  let selectionOutcome = computeSelectionOutcome();
  const autoRerouteDecision = decideAutoReroute({
    config: autoRerouteConfig,
    generationViewToGenerate: generation.viewToGenerate,
    providerName,
    requestedViews,
    packCoherence: selectionOutcome.packCoherence,
    rigStability: selectionOutcome.rigStability,
    missingGeneratedViews: selectionOutcome.missingGeneratedViews,
    lowQualityGeneratedViews: selectionOutcome.lowQualityGeneratedViews,
    runtimeLowQualityViews: selectionOutcome.runtimeLowQualityViews,
    frontStrong: selectionOutcome.frontStrong,
    continuity: continuitySnapshot
  });

  if (autoRerouteDecision) {
    const autoRerouteSelectionBefore = { ...selectionOutcome.selectedByView };
    autoRerouteDiagnostics = {
      attempted: true,
      strategy: autoRerouteDecision.strategy,
      triggers: autoRerouteDecision.triggers,
      targetViews: autoRerouteDecision.targetViews,
      candidateCountBoost: autoRerouteDecision.candidateCountBoost,
      acceptedScoreThresholdBoost: autoRerouteDecision.acceptedScoreThresholdBoost,
      seedOffset: autoRerouteDecision.seedOffset,
      notes: autoRerouteDecision.notes,
      initialMissingViews: selectionOutcome.missingGeneratedViews,
      initialLowQualityViews: selectionOutcome.lowQualityGeneratedViews,
      ...(selectionOutcome.packCoherence ? { initialPackCoherence: selectionOutcome.packCoherence } : {})
    };
    providerWarning = [
      providerWarning,
      `auto reroute ${autoRerouteDecision.strategy} for ${autoRerouteDecision.targetViews.join(", ")}`
    ]
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      .join(" | ");
    await helpers.logJob(jobDbId, "info", "Running auto reroute after pack diagnostics", {
      strategy: autoRerouteDecision.strategy,
      triggers: autoRerouteDecision.triggers,
      targetViews: autoRerouteDecision.targetViews,
      candidateCountBoost: autoRerouteDecision.candidateCountBoost,
      acceptedScoreThresholdBoost: autoRerouteDecision.acceptedScoreThresholdBoost,
      seedOffset: autoRerouteDecision.seedOffset,
      initialPackCoherence: selectionOutcome.packCoherence,
      initialMissingViews: selectionOutcome.missingGeneratedViews,
      initialLowQualityViews: selectionOutcome.lowQualityGeneratedViews,
      ...toFlatContinuityFields(continuitySnapshot)
    });

    if (autoRerouteDecision.targetViews.includes("front")) {
      const rerouteFrontStarterReference = loadMascotStarterReference(promptBundle.speciesId, "front");
      const rerouteFrontReferenceBank: CharacterReferenceBankEntry[] = [];
      if (referenceImageBase64) {
        rerouteFrontReferenceBank.push(
          createReferenceBankEntry({
            id: "auto_reroute_front_subject_reference",
            role: "subject",
            view: "front",
            weight: resolveAdaptiveReferenceWeight({
              stage: "front",
              role: "subject",
              targetView: "front",
              hasStarter: Boolean(rerouteFrontStarterReference)
            }),
            note: "auto reroute subject anchor",
            image: {
              referenceImageBase64,
              referenceMimeType
            }
          })
        );
      }
      if (rerouteFrontStarterReference) {
        rerouteFrontReferenceBank.push(
          createReferenceBankEntry({
            id: "auto_reroute_front_starter",
            role: "starter",
            view: "front",
            weight: resolveAdaptiveReferenceWeight({
              stage: "front",
              role: "starter",
              targetView: "front",
              hasStarter: true
            }),
            note: rerouteFrontStarterReference.sourcePath,
            image: rerouteFrontStarterReference
          })
        );
      }
      rerouteFrontReferenceBank.push(
        ...buildMascotFamilyReferenceEntries({
          speciesId: promptBundle.speciesId,
          stage: "front",
          targetView: "front",
          familyReferencesByView: mascotFamilyReferencesByView,
          hasStarter: Boolean(rerouteFrontStarterReference),
          preferMultiReference: promptBundle.selectionHints.preferMultiReference,
          heroModeEnabled: shouldEnableMascotHeroMode({
            stage: "front",
            heroMode: promptBundle.heroMode,
            frontAnchorScore: selectionOutcome.selectedByView.front?.score
          })
        })
      );
      await runViewGeneration({
        views: ["front"],
        stage: "front",
        origin: "auto_reroute",
        passLabel: "front.auto_reroute",
        reasonCodes: autoRerouteDecision.triggers,
        triggerViews: autoRerouteDecision.targetViews,
        candidateCountOverride: Math.max(
          clamped.candidateCount,
          Math.floor(promptBundle.selectionHints.frontMasterCandidateCount ?? clamped.candidateCount) +
            autoRerouteDecision.candidateCountBoost
        ),
        acceptedScoreThresholdOverride: Math.min(
          0.98,
          frontAnchorAcceptedScoreThreshold + autoRerouteDecision.acceptedScoreThresholdBoost
        ),
        ...(rerouteFrontReferenceBank.length > 0
          ? { referenceBank: dedupeReferenceBank(rerouteFrontReferenceBank) }
          : {}),
        budgetViewCount: requestedViews.length,
        seedOffset: autoRerouteDecision.seedOffset
      });
      applyConsistencyScoring(
        scored,
        promptBundle.qualityProfile.targetStyle,
        promptBundle.speciesId,
        acceptedScoreThreshold
      );
      selectionOutcome = computeSelectionOutcome();
    }

    const autoRerouteFrontBaseline = selectionOutcome.frontStrong ? selectionOutcome.selectedByView.front : undefined;
    const autoRerouteSideViews = autoRerouteDecision.targetViews.filter((view) => view !== "front");
    let autoRerouteAcceptanceGate:
      | ReturnType<typeof buildSideViewAcceptanceGate>
      | undefined;
    if (autoRerouteSideViews.length > 0) {
      let autoRerouteSideReference: InlineImageReference | undefined;
      if (autoRerouteFrontBaseline) {
        autoRerouteSideReference = inlineReferenceFromCandidate(autoRerouteFrontBaseline.candidate);
      } else if (referenceImageBase64) {
        autoRerouteSideReference = {
          referenceImageBase64,
          referenceMimeType
        };
      }

      if (autoRerouteSideReference) {
        const autoRerouteStarterReferenceByView = loadMascotStarterReferencesByView(
          promptBundle.speciesId,
          autoRerouteSideViews
        );
        const autoRerouteReferenceInputByView = buildPreferredSideReferenceInputByView({
          views: autoRerouteSideViews,
          familyReferencesByView: mascotFamilyReferencesByView,
          starterReferenceByView: autoRerouteStarterReferenceByView
        });
        const autoReroutePoseGuidesByView = excludePoseGuidesCoveredByStarter(
          "angles",
          loadStagePoseGuides({
            speciesId: promptBundle.speciesId,
            views: autoRerouteSideViews
          }),
          autoRerouteStarterReferenceByView
        );
        if (Object.keys(autoRerouteStarterReferenceByView).length > 0) {
          starterReferencePathsByView = {
            ...(starterReferencePathsByView ?? {}),
            ...Object.fromEntries(
              Object.entries(autoRerouteStarterReferenceByView).map(([view, guide]) => [view, guide.sourcePath])
            )
          };
        }
        const autoRerouteReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
        for (const view of autoRerouteSideViews) {
          const starterReference = autoRerouteStarterReferenceByView[view];
          const preferredSideReference = autoRerouteReferenceInputByView[view];
          const sideStarterLikeReference = starterReference ?? preferredSideReference;
          const bank: CharacterReferenceBankEntry[] = [];
          if (autoRerouteFrontBaseline) {
            bank.push(
              createReferenceBankEntry({
                id: `${autoRerouteFrontBaseline.candidate.id}_auto_reroute_front_master`,
                role: "front_master",
                view: "front",
                weight: resolveAdaptiveReferenceWeight({
                  stage: "angles",
                  role: "front_master",
                  targetView: view,
                  hasStarter: Boolean(sideStarterLikeReference)
                }),
                note: "auto reroute front anchor",
                image: inlineReferenceFromCandidate(autoRerouteFrontBaseline.candidate)
              })
            );
          } else {
            bank.push(
              createReferenceBankEntry({
                id: `${view}_auto_reroute_subject_anchor`,
                role: "subject",
                view: "front",
                weight: resolveAdaptiveReferenceWeight({
                  stage: "angles",
                  role: "subject",
                  targetView: view,
                  hasStarter: Boolean(sideStarterLikeReference)
                }),
                note: "auto reroute external subject anchor",
                image: autoRerouteSideReference
              })
            );
          }
          if (sideStarterLikeReference) {
            bank.push(
              createReferenceBankEntry({
                id: starterReference
                  ? `${view}_auto_reroute_starter`
                  : `${view}_auto_reroute_preferred_side_starter`,
                role: "view_starter",
                view,
                weight: resolveAdaptiveReferenceWeight({
                  stage: "angles",
                  role: "view_starter",
                  targetView: view,
                  hasStarter: true
                }),
                note:
                  starterReference && "sourcePath" in starterReference
                    ? starterReference.sourcePath
                    : "auto reroute preferred side reference starter anchor",
                image: sideStarterLikeReference
              })
            );
          }
          bank.push(
            ...buildMascotFamilyReferenceEntries({
              speciesId: promptBundle.speciesId,
              stage: "angles",
              targetView: view,
              familyReferencesByView: mascotFamilyReferencesByView,
              hasStarter: Boolean(sideStarterLikeReference),
              preferMultiReference: promptBundle.selectionHints.preferMultiReference,
              heroModeEnabled: shouldEnableMascotHeroMode({
                stage: "angles",
                heroMode: promptBundle.heroMode,
                frontAnchorScore: autoRerouteFrontBaseline?.score
              })
            })
          );
          if (bank.length > 0) {
            autoRerouteReferenceBankByView[view] = dedupeReferenceBank(bank);
          }
        }
        await runViewGeneration({
          views: autoRerouteSideViews,
          stage: "angles",
          origin: "auto_reroute",
          passLabel: "angles.auto_reroute",
          reasonCodes: autoRerouteDecision.triggers,
          triggerViews: autoRerouteDecision.targetViews,
          referenceInput: autoRerouteSideReference,
          ...(Object.keys(autoRerouteReferenceInputByView).length > 0
            ? { referenceInputByView: autoRerouteReferenceInputByView }
            : {}),
          ...(Object.keys(autoRerouteReferenceBankByView).length > 0
            ? { referenceBankByView: autoRerouteReferenceBankByView }
            : {}),
          ...(Object.keys(autoReroutePoseGuidesByView).length > 0
            ? { poseGuidesByView: autoReroutePoseGuidesByView }
            : {}),
          candidateCountOverride: Math.max(
            clamped.candidateCount,
            clamped.candidateCount + autoRerouteDecision.candidateCountBoost
          ),
          acceptedScoreThresholdOverride: Math.min(
            0.98,
            acceptedScoreThreshold + autoRerouteDecision.acceptedScoreThresholdBoost
          ),
          seedOffset: autoRerouteDecision.seedOffset + 5000
        });
        applyConsistencyScoring(
          scored,
          promptBundle.qualityProfile.targetStyle,
          promptBundle.speciesId,
          acceptedScoreThreshold
        );
        const autoRerouteBestAfterBase = groupBestByView(scored);
        await maybeRunUltraSideRefineStage({
          targetViews: autoRerouteSideViews,
          bestByView: autoRerouteBestAfterBase,
          frontReferenceInput: autoRerouteSideReference,
          origin: "auto_reroute",
          passLabel: "angles.refine_auto_reroute",
          reasonCodes: [...autoRerouteDecision.triggers, "side_view_refine"],
          triggerViews: autoRerouteSideViews,
          seedOffset: autoRerouteDecision.seedOffset + 7000,
          acceptedScoreThresholdBoost: autoRerouteDecision.acceptedScoreThresholdBoost * 0.35,
          candidateCountBoost: Math.max(0, autoRerouteDecision.candidateCountBoost - 1)
        });
        const autoRerouteBestAfterRefine = groupBestByView(scored);
        await maybeRunUltraIdentityLockStage({
          targetViews: autoRerouteSideViews,
          bestByView: autoRerouteBestAfterRefine,
          frontReferenceInput: autoRerouteSideReference,
          origin: "auto_reroute",
          passLabel: "angles.identity_lock_auto_reroute",
          reasonCodes: [...autoRerouteDecision.triggers, "identity_lock_refine"],
          triggerViews: autoRerouteSideViews,
          seedOffset: autoRerouteDecision.seedOffset + 8200,
          acceptedScoreThresholdBoost: autoRerouteDecision.acceptedScoreThresholdBoost * 0.45,
          candidateCountBoost: Math.max(0, autoRerouteDecision.candidateCountBoost - 1)
        });
        const autoRerouteBestAfterLock = groupBestByView(scored);
        autoRerouteAcceptanceGate = buildSideViewAcceptanceGate({
          targetViews: autoRerouteSideViews,
          baseByView: autoRerouteBestAfterBase,
          refineByView: autoRerouteBestAfterRefine,
          lockByView: autoRerouteBestAfterLock,
          acceptedScoreThreshold,
          targetStyle: promptBundle.qualityProfile.targetStyle
        });
        if (Object.keys(autoRerouteAcceptanceGate.selectedByView).length > 0) {
          preferredSelectionByView = {
            ...preferredSelectionByView,
            ...autoRerouteAcceptanceGate.selectedByView
          };
          recordSideViewAcceptanceGateStage({
            views: autoRerouteSideViews,
            selectedByView: autoRerouteAcceptanceGate.selectedByView,
            gateDecisionsByView: autoRerouteAcceptanceGate.gateDecisionsByView,
            origin: "auto_reroute",
            passLabel: "angles.acceptance_gate_auto_reroute",
            reasonCodes: [...autoRerouteDecision.triggers, "side_view_acceptance_gate"],
            triggerViews: autoRerouteSideViews,
            seedOffset: autoRerouteDecision.seedOffset + 8600
          });
        }
        selectionOutcome = computeSelectionOutcome();
      }
    }

    const autoRerouteRepairFrontBaseline = selectionOutcome.frontStrong ? selectionOutcome.selectedByView.front : undefined;
    const autoRerouteRepairCandidates = selectionOutcome.selectedByView;
    const autoRerouteRepairCandidateByView: Partial<Record<CharacterView, ScoredCandidate>> = {};
    for (const view of dedupeCharacterViews(autoRerouteDecision.targetViews)) {
      const candidate =
        preferredSelectionByView[view] ??
        selectBestRepairBaseCandidate({
          scored,
          view,
          targetStyle: promptBundle.qualityProfile.targetStyle,
          acceptedScoreThreshold
        }) ??
        autoRerouteRepairCandidates[view];
      if (candidate) {
        autoRerouteRepairCandidateByView[view] = candidate;
      }
    }
    const autoRerouteRepairTriage = buildRepairTriageGate({
      targetViews: autoRerouteDecision.targetViews,
      candidateByView: autoRerouteRepairCandidateByView,
      acceptedScoreThreshold: Math.min(0.98, acceptedScoreThreshold + autoRerouteDecision.acceptedScoreThresholdBoost * 0.5),
      repairScoreFloor,
      frontAnchorAcceptedScoreThreshold,
      targetStyle: promptBundle.qualityProfile.targetStyle,
      packCoherence: selectionOutcome.packCoherence,
      rigStability: selectionOutcome.rigStability,
      speciesId: promptBundle.speciesId,
      gateDecisionsByView: autoRerouteAcceptanceGate?.gateDecisionsByView
    });
    applyRepairEmbargoDecisions(autoRerouteDecision.targetViews, autoRerouteRepairTriage.repairTriageByView);
    if (Object.keys(autoRerouteRepairTriage.repairTriageByView).length > 0) {
      recordRepairTriageGateStage({
        views: dedupeCharacterViews(autoRerouteDecision.targetViews),
        selectedByView: autoRerouteRepairCandidateByView,
        repairTriageByView: autoRerouteRepairTriage.repairTriageByView,
        origin: "auto_reroute",
        passLabel: "angles.repair_triage_auto_reroute",
        reasonCodes: [...autoRerouteDecision.triggers, "repair_triage_gate"],
        triggerViews: autoRerouteDecision.targetViews,
        seedOffset: autoRerouteDecision.seedOffset + 8800
      });
    }
    selectionOutcome = computeSelectionOutcome();
    if (autoRerouteRepairTriage.repairViews.length > 0) {
      const autoRerouteRepairReferenceInputByView: Partial<Record<CharacterView, InlineImageReference>> = {};
      const autoRerouteRepairMaskByView: Partial<Record<CharacterView, InlineImageReference>> = {};
      const autoRerouteRepairReferenceBankByView: Partial<Record<CharacterView, CharacterReferenceBankEntry[]>> = {};
      const autoRerouteRepairBaseAdjustmentsByView: Partial<Record<CharacterView, RetryAdjustment>> = {};
      const autoRerouteRepairDirectiveProfilesByView: Partial<Record<CharacterView, RepairDirectiveProfileSummary>> = {
        ...autoRerouteRepairTriage.directiveProfilesByView
      };
      const autoRerouteRepairFromCandidateIds: Partial<Record<CharacterView, string>> = {};
      for (const view of autoRerouteRepairTriage.repairViews) {
        const candidate = autoRerouteRepairTriage.repairBaseByView[view];
        if (!candidate) {
          continue;
        }
        autoRerouteRepairReferenceInputByView[view] = inlineReferenceFromCandidate(candidate.candidate);
        autoRerouteRepairMaskByView[view] = await buildRepairMaskReferenceForCandidate(candidate);
        autoRerouteRepairFromCandidateIds[view] = candidate.candidate.id;
        const repairDirective = buildRepairDirectiveProfile({
          stage: "repair",
          view,
          candidate,
          speciesId: promptBundle.speciesId
        });
        if (repairDirective?.adjustment && hasRetryAdjustmentContent(repairDirective.adjustment)) {
          autoRerouteRepairBaseAdjustmentsByView[view] = repairDirective.adjustment;
        }
        if (repairDirective && !autoRerouteRepairDirectiveProfilesByView[view]) {
          autoRerouteRepairDirectiveProfilesByView[view] = summarizeRepairDirectiveProfile(repairDirective);
        }
        const starterReference = loadMascotStarterReference(promptBundle.speciesId, view);
        const bank: CharacterReferenceBankEntry[] = [
          createReferenceBankEntry({
            id: `${candidate.candidate.id}_auto_reroute_repair_base`,
            role: "repair_base",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "repair_base",
              targetView: view,
              hasStarter: Boolean(starterReference),
              directiveFamilies: repairDirective?.families,
              directiveSeverity: repairDirective?.severity
            }),
            note: "auto reroute repair base",
            image: inlineReferenceFromCandidate(candidate.candidate)
          }),
          createReferenceBankEntry({
            id: `${candidate.candidate.id}_auto_reroute_repair_composition`,
            role: "composition",
            view,
            weight: resolveAdaptiveReferenceWeight({
              stage: "repair",
              role: "composition",
              targetView: view,
              hasStarter: Boolean(starterReference),
              directiveFamilies: repairDirective?.families,
              directiveSeverity: repairDirective?.severity
            }),
            note: "auto reroute repair composition",
            image: inlineReferenceFromCandidate(candidate.candidate)
          })
        ];
        if (autoRerouteRepairFrontBaseline) {
          bank.push(
            createReferenceBankEntry({
              id: `${autoRerouteRepairFrontBaseline.candidate.id}_auto_reroute_front_master`,
              role: "front_master",
              view: "front",
              weight: resolveAdaptiveReferenceWeight({
                stage: "repair",
                role: "front_master",
                targetView: view,
                hasStarter: Boolean(starterReference),
                directiveFamilies: repairDirective?.families,
                directiveSeverity: repairDirective?.severity
              }),
              note: "auto reroute approved front master",
              image: inlineReferenceFromCandidate(autoRerouteRepairFrontBaseline.candidate)
            })
          );
        }
        bank.push(
          ...buildMascotFamilyReferenceEntries({
            speciesId: promptBundle.speciesId,
            stage: "repair",
            targetView: view,
            familyReferencesByView: mascotFamilyReferencesByView,
            hasStarter: Boolean(starterReference),
            directiveFamilies: repairDirective?.families,
            directiveSeverity: repairDirective?.severity,
            preferMultiReference: promptBundle.selectionHints.preferMultiReference,
            heroModeEnabled: shouldEnableMascotHeroMode({
              stage: "repair",
              heroMode: promptBundle.heroMode,
              frontAnchorScore: autoRerouteRepairFrontBaseline?.score ?? autoRerouteFrontBaseline?.score
            })
          })
        );
        autoRerouteRepairReferenceBankByView[view] = dedupeReferenceBank(bank);
      }
      const resolvedAutoRerouteRepairViews = Object.keys(
        autoRerouteRepairReferenceInputByView
      ) as CharacterView[];
      if (resolvedAutoRerouteRepairViews.length > 0) {
        const rerouteRepairCandidateCount = Math.max(
          1,
          Math.floor(
            (promptBundle.selectionHints.repairCandidateCount ?? 2) +
              autoRerouteDecision.candidateCountBoost +
              Math.max(
                0,
                ...resolvedAutoRerouteRepairViews.map(
                  (view) => autoRerouteRepairDirectiveProfilesByView[view]?.candidateCountBoost ?? 0
                )
              )
          )
        );
        const rerouteRepairAcceptedScoreThreshold = Math.min(
          0.98,
          acceptedScoreThreshold +
            autoRerouteDecision.acceptedScoreThresholdBoost +
            Math.max(
              0,
              ...resolvedAutoRerouteRepairViews.map(
                (view) => autoRerouteRepairDirectiveProfilesByView[view]?.acceptedScoreThresholdBoost ?? 0
              )
            )
        );
        await runViewGeneration({
          views: resolvedAutoRerouteRepairViews,
          stage: "repair",
          origin: "auto_reroute",
          passLabel: "repair.auto_reroute",
          reasonCodes: [...autoRerouteDecision.triggers, "repair_refine"],
          triggerViews: resolvedAutoRerouteRepairViews,
          candidateCountOverride: rerouteRepairCandidateCount,
          acceptedScoreThresholdOverride: rerouteRepairAcceptedScoreThreshold,
          referenceInput: autoRerouteRepairFrontBaseline
            ? inlineReferenceFromCandidate(autoRerouteRepairFrontBaseline.candidate)
            : undefined,
          referenceInputByView: autoRerouteRepairReferenceInputByView,
          repairMaskByView: autoRerouteRepairMaskByView,
          referenceBankByView: autoRerouteRepairReferenceBankByView,
          ...(Object.keys(autoRerouteRepairBaseAdjustmentsByView).length > 0
            ? { baseAdjustmentsByView: autoRerouteRepairBaseAdjustmentsByView }
            : {}),
          ...(Object.keys(autoRerouteRepairDirectiveProfilesByView).length > 0
            ? { directiveProfilesByView: autoRerouteRepairDirectiveProfilesByView }
            : {}),
          repairFromCandidateIds: autoRerouteRepairFromCandidateIds,
          ...(Object.keys(autoRerouteRepairTriage.repairLineageByView).length > 0
            ? {
                repairLineageByView: autoRerouteRepairTriage.repairLineageByView
              }
            : {}),
          seedOffset: autoRerouteDecision.seedOffset + 9000
        });
        applyConsistencyScoring(
          scored,
          promptBundle.qualityProfile.targetStyle,
          promptBundle.speciesId,
          acceptedScoreThreshold
        );
        const postRepairAcceptanceGate = buildPostRepairAcceptanceGate({
          targetViews: resolvedAutoRerouteRepairViews,
          preRepairByView: autoRerouteRepairTriage.repairBaseByView,
          repairByView: Object.fromEntries(
            resolvedAutoRerouteRepairViews
              .map((view) => [
                view,
                selectBestCandidateForViewByStages({
                  scored,
                  view,
                  stages: ["repair_refine"]
                })
              ])
              .filter((entry): entry is [CharacterView, ScoredCandidate] => Boolean(entry[1]))
          ) as Partial<Record<CharacterView, ScoredCandidate>>,
          acceptedScoreThreshold,
          promotionThresholdByView: Object.fromEntries(
            resolvedAutoRerouteRepairViews.map((view) => [view, rerouteRepairAcceptedScoreThreshold])
          ) as Partial<Record<CharacterView, number>>,
          targetStyle: promptBundle.qualityProfile.targetStyle
        });
        if (Object.keys(postRepairAcceptanceGate.selectedByView).length > 0) {
          preferredSelectionByView = {
            ...preferredSelectionByView,
            ...postRepairAcceptanceGate.selectedByView
          };
          recordPostRepairAcceptanceGateStage({
            views: resolvedAutoRerouteRepairViews,
            selectedByView: postRepairAcceptanceGate.selectedByView,
            repairAcceptanceByView: postRepairAcceptanceGate.repairAcceptanceByView,
            acceptedScoreThresholdOverride: rerouteRepairAcceptedScoreThreshold,
            origin: "auto_reroute",
            passLabel: "repair.acceptance_gate_auto_reroute",
            reasonCodes: [...autoRerouteDecision.triggers, "post_repair_acceptance_gate"],
            triggerViews: resolvedAutoRerouteRepairViews,
            seedOffset: autoRerouteDecision.seedOffset + 9400
          });
        }
        selectionOutcome = computeSelectionOutcome();
      }
    }

    const autoRerouteViewDelta = buildAutoRerouteViewDelta({
      before: autoRerouteSelectionBefore,
      after: selectionOutcome.selectedByView,
      views: autoRerouteDecision.targetViews
    });
    autoRerouteDiagnostics = {
      ...autoRerouteDiagnostics,
      finalMissingViews: selectionOutcome.missingGeneratedViews,
      finalLowQualityViews: selectionOutcome.lowQualityGeneratedViews,
      ...(selectionOutcome.packCoherence ? { finalPackCoherence: selectionOutcome.packCoherence } : {}),
      ...(autoRerouteViewDelta ? { viewDeltaByView: autoRerouteViewDelta } : {}),
      recovered:
        selectionOutcome.missingGeneratedViews.length === 0 &&
        selectionOutcome.lowQualityGeneratedViews.length === 0 &&
        (selectionOutcome.packCoherence?.severity ?? "none") !== "block"
    };
    await helpers.logJob(
      jobDbId,
      autoRerouteDiagnostics.recovered ? "info" : "warn",
      autoRerouteDiagnostics.recovered ? "Auto reroute recovered blocked pack" : "Auto reroute did not fully recover blocked pack",
      {
        strategy: autoRerouteDecision.strategy,
        triggers: autoRerouteDecision.triggers,
        targetViews: autoRerouteDecision.targetViews,
        initialPackCoherence: autoRerouteDiagnostics.initialPackCoherence,
        finalPackCoherence: autoRerouteDiagnostics.finalPackCoherence,
        finalMissingViews: autoRerouteDiagnostics.finalMissingViews,
        finalLowQualityViews: autoRerouteDiagnostics.finalLowQualityViews
      }
    );
  }

  await insertProviderCallLogs({
    prisma,
    sessionId,
    episodeId: payload.episodeId,
    callLogs: providerCallLogs
  });
  await writeGenerationProgress(84, "provider_logs_persisted", {
    callLogCount: providerCallLogs.length,
    provider: providerName
  });

  await upsertSessionCandidates({
    prisma,
    sessionId,
    scored,
    ...(generation.viewToGenerate ? { viewToGenerate: generation.viewToGenerate } : {})
  });
  await writeGenerationProgress(88, "session_candidates_persisted", {
    totalScored: scored.length,
    bestScores: summarizeBestScores(requestedViews)
  });

  let retainedManifestCandidates: GenerationManifest["candidates"] = [];
  let retainedSelectedByView: GenerationManifest["selectedByView"] = {};
  if (generation.viewToGenerate && fs.existsSync(referenceSourceManifestPath)) {
    const previousRaw = JSON.parse(fs.readFileSync(referenceSourceManifestPath, "utf8")) as unknown;
    if (isRecord(previousRaw)) {
      const previousCandidates = Array.isArray(previousRaw.candidates)
        ? previousRaw.candidates
            .map((candidate) => parseManifestCandidate(referenceSourceManifestPath, candidate))
            .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
        : [];

      retainedManifestCandidates = previousCandidates
        .filter((candidate) => candidate.view !== generation.viewToGenerate)
        .map((entry) => ({
          id: entry.id,
          view: entry.view,
          candidateIndex: entry.candidateIndex,
          seed: entry.seed,
          mimeType: entry.mimeType,
          filePath: entry.filePath,
        score: Number(entry.score.toFixed(4)),
        styleScore: Number(entry.styleScore.toFixed(4)),
        referenceSimilarity:
          entry.referenceSimilarity === null ? null : Number(entry.referenceSimilarity.toFixed(4)),
        consistencyScore: entry.consistencyScore === null ? null : Number(entry.consistencyScore.toFixed(4)),
        warnings: entry.warnings,
        rejections: entry.rejections,
        ...(entry.breakdown ? { breakdown: entry.breakdown } : {}),
        ...(entry.providerMeta ? { providerMeta: entry.providerMeta } : {})
      }));

      if (isRecord(previousRaw.selectedByView)) {
        retainedSelectedByView = { ...previousRaw.selectedByView } as GenerationManifest["selectedByView"];
        delete retainedSelectedByView[generation.viewToGenerate];
      }
    }
  }

  const selectedByView = selectionOutcome.selectedByView;
  const missingGeneratedViews = selectionOutcome.missingGeneratedViews;
  const lowQualityGeneratedViews = selectionOutcome.lowQualityGeneratedViews;
  const packCoherence = selectionOutcome.packCoherence;
  const initialRigStability = selectionOutcome.rigStability;
  const coherenceIssues = selectionOutcome.coherenceIssues;
  const initialSelectionRisk =
    packCoherence && selectionOutcome.selectedByView && Object.keys(selectionOutcome.selectedByView).length > 0
      ? assessAutoSelectionRisk({
          selectedByView: selectionOutcome.selectedByView,
          packCoherence,
          rigStability: initialRigStability,
          targetStyle: promptBundle.qualityProfile.targetStyle,
          acceptedScoreThreshold,
          autoReroute: autoRerouteDiagnostics,
          speciesId: promptBundle.speciesId
        })
      : undefined;
  const initialQualityEmbargo =
    selectionOutcome.selectedByView && Object.keys(selectionOutcome.selectedByView).length > 0
      ? assessQualityEmbargo({
          selectedByView: selectionOutcome.selectedByView,
          rigStability: initialRigStability,
          targetStyle: promptBundle.qualityProfile.targetStyle,
          acceptedScoreThreshold,
          autoReroute: autoRerouteDiagnostics
        })
      : undefined;
  const initialPackDefectSummary =
    selectionOutcome.selectedByView && Object.keys(selectionOutcome.selectedByView).length > 0
      ? buildPackDefectSummary({
          selectedByView: selectionOutcome.selectedByView,
          workflowStages: workflowStageRuns
        })
      : undefined;
  const initialFinalQualityFirewall =
    initialPackDefectSummary && selectionOutcome.selectedByView && Object.keys(selectionOutcome.selectedByView).length > 0
      ? assessFinalQualityFirewall({
          selectedByView: selectionOutcome.selectedByView,
          targetStyle: promptBundle.qualityProfile.targetStyle,
          acceptedScoreThreshold,
          autoReroute: autoRerouteDiagnostics,
          packCoherence,
          rigStability: initialRigStability,
          selectionRisk: initialSelectionRisk,
          qualityEmbargo: initialQualityEmbargo,
          packDefectSummary: initialPackDefectSummary
        })
      : undefined;
  const initialSelectedCandidateSummaryByView = summarizeSelectionCandidateSummaryByView({
    selectedByView: selectionOutcome.selectedByView,
    targetStyle: promptBundle.qualityProfile.targetStyle,
    acceptedScoreThreshold
  });
  const requiresHitl =
    mascotReferenceBankReviewPlan.reviewOnly ||
    generation.viewToGenerate !== undefined ||
    generation.requireHitlPick === true ||
    generation.autoPick === false ||
    missingGeneratedViews.length > 0 ||
    lowQualityGeneratedViews.length > 0 ||
    initialRigStability?.reviewOnly === true ||
    coherenceIssues.length > 0 ||
    packCoherence?.severity === "block" ||
    initialRigStability?.severity === "block" ||
    initialFinalQualityFirewall?.level === "block";
  const decisionOutcome = buildSelectionDecisionOutcome({
    kind: requiresHitl ? "hitl_review" : "auto_selected",
    sourceStage: workflowStageRuns.at(-1)?.stage,
    missingGeneratedViews,
    lowQualityGeneratedViews,
    selectedByView: selectionOutcome.selectedByView,
    packCoherence,
    autoReroute: autoRerouteDiagnostics,
    targetStyle: promptBundle.qualityProfile.targetStyle,
    acceptedScoreThreshold,
    rigStability: initialRigStability,
    selectionRisk: initialSelectionRisk,
    qualityEmbargo: initialQualityEmbargo,
    finalQualityFirewall: initialFinalQualityFirewall,
    referenceBankReviewOnly: mascotReferenceBankReviewPlan.reviewOnly,
    referenceBankHandoff: mascotReferenceBankReviewChecklist.handoff
  });

  const manifest = withManifestHashes({
    schemaVersion: "1.0",
    ...(ultraWorkflowEnabled ? { templateVersion: ULTRA_WORKFLOW_TEMPLATE_VERSION } : {}),
    status: requiresHitl ? "PENDING_HITL" : "AUTO_SELECTED",
    sessionId,
    episodeId: payload.episodeId,
    characterPackId: character.characterPackId,
    provider: providerName,
    providerRequested: requestedProvider,
    providerWarning:
      [providerWarning, ...clamped.warnings]
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .join(" | ") || null,
    workflowHash: providerWorkflowHash,
    generatedAt: providerGeneratedAt,
    mode: generation.mode,
    promptPreset: promptBundle.presetId,
    species: promptBundle.speciesId,
    qualityProfileId: promptBundle.qualityProfile.id,
    qualityProfile: promptBundle.qualityProfile,
    positivePrompt: promptBundle.positivePrompt,
    negativePrompt: promptBundle.negativePrompt,
    guardrails: promptBundle.guardrails,
    selectionHints: promptBundle.selectionHints,
    ...(packCoherence ? { packCoherence } : {}),
    ...(autoRerouteDiagnostics ? { autoReroute: autoRerouteDiagnostics } : {}),
    ...(providerRunMeta
      ? {
          providerMeta: {
            ...providerRunMeta,
            selectionDiagnostics: {
              ...(providerRunMeta.selectionDiagnostics ?? {}),
              workflowStages: workflowStageRuns,
              coherenceIssues,
              packCoherence,
              ...(initialRigStability ? { rigStability: initialRigStability } : {}),
              ...(initialSelectionRisk ? { selectionRisk: initialSelectionRisk } : {}),
              ...(initialQualityEmbargo ? { qualityEmbargo: initialQualityEmbargo } : {}),
              ...(initialPackDefectSummary ? { packDefectSummary: initialPackDefectSummary } : {}),
              ...(initialFinalQualityFirewall ? { finalQualityFirewall: initialFinalQualityFirewall } : {}),
              ...(initialSelectedCandidateSummaryByView
                ? { selectedCandidateSummaryByView: initialSelectedCandidateSummaryByView }
                : {}),
              referenceBankDiagnostics: mascotReferenceBankDiagnostics,
              referenceBankReviewPlan: mascotReferenceBankReviewPlan,
              referenceBankReviewChecklist: mascotReferenceBankReviewChecklist,
              decisionOutcome,
              ...(autoRerouteDiagnostics ? { autoReroute: autoRerouteDiagnostics } : {})
            }
          }
        }
      : workflowStageRuns.length > 0
        ? {
            providerMeta: {
              workflowStage: workflowStageRuns.at(-1)?.stage,
              workflowTemplateVersion: ULTRA_WORKFLOW_TEMPLATE_VERSION,
              selectionDiagnostics: {
                workflowStages: workflowStageRuns,
                coherenceIssues,
                packCoherence,
                ...(initialRigStability ? { rigStability: initialRigStability } : {}),
                ...(initialSelectionRisk ? { selectionRisk: initialSelectionRisk } : {}),
                ...(initialQualityEmbargo ? { qualityEmbargo: initialQualityEmbargo } : {}),
                ...(initialPackDefectSummary ? { packDefectSummary: initialPackDefectSummary } : {}),
                ...(initialFinalQualityFirewall ? { finalQualityFirewall: initialFinalQualityFirewall } : {}),
                ...(initialSelectedCandidateSummaryByView
                  ? { selectedCandidateSummaryByView: initialSelectedCandidateSummaryByView }
                  : {}),
                referenceBankDiagnostics: mascotReferenceBankDiagnostics,
                referenceBankReviewPlan: mascotReferenceBankReviewPlan,
                referenceBankReviewChecklist: mascotReferenceBankReviewChecklist,
                decisionOutcome,
                ...(autoRerouteDiagnostics ? { autoReroute: autoRerouteDiagnostics } : {})
              }
            }
          }
        : {
            providerMeta: {
              selectionDiagnostics: {
                coherenceIssues,
                packCoherence,
                ...(initialRigStability ? { rigStability: initialRigStability } : {}),
                ...(initialSelectionRisk ? { selectionRisk: initialSelectionRisk } : {}),
                ...(initialQualityEmbargo ? { qualityEmbargo: initialQualityEmbargo } : {}),
                ...(initialPackDefectSummary ? { packDefectSummary: initialPackDefectSummary } : {}),
                ...(initialFinalQualityFirewall ? { finalQualityFirewall: initialFinalQualityFirewall } : {}),
                ...(initialSelectedCandidateSummaryByView
                  ? { selectedCandidateSummaryByView: initialSelectedCandidateSummaryByView }
                  : {}),
                referenceBankDiagnostics: mascotReferenceBankDiagnostics,
                referenceBankReviewPlan: mascotReferenceBankReviewPlan,
                referenceBankReviewChecklist: mascotReferenceBankReviewChecklist,
                decisionOutcome,
                ...(autoRerouteDiagnostics ? { autoReroute: autoRerouteDiagnostics } : {})
              }
            }
          }),
    ...(workflowStageRuns.length > 0 ? { workflowStages: workflowStageRuns } : {}),
    reference: {
      assetId: generation.referenceAssetId ?? null,
      sourceSessionId: continuityReferenceSessionId,
      starterPath: starterReferencePath,
      ...(starterReferencePathsByView ? { starterPathsByView: starterReferencePathsByView } : {}),
      phash: referenceAnalysis?.phash ?? null,
      palette: referenceAnalysis?.palette ?? null,
      continuity: continuitySnapshot
    },
    candidates: [
      ...retainedManifestCandidates,
      ...scored.map((entry) => ({
        id: entry.candidate.id,
        provider: entry.candidate.provider,
        view: entry.candidate.view,
        candidateIndex: entry.candidate.candidateIndex,
        seed: entry.candidate.seed,
        mimeType: entry.candidate.mimeType,
        filePath: asString(entry.candidate.providerMeta?.localCandidatePath),
        score: Number(entry.score.toFixed(4)),
        styleScore: Number(entry.styleScore.toFixed(4)),
        referenceSimilarity: entry.referenceSimilarity === null ? null : Number(entry.referenceSimilarity.toFixed(4)),
        consistencyScore: entry.consistencyScore === null ? null : Number(entry.consistencyScore.toFixed(4)),
        warnings: entry.warnings,
        rejections: entry.rejections,
        breakdown: entry.breakdown,
        ...(entry.candidate.providerMeta ? { providerMeta: entry.candidate.providerMeta } : {})
      }))
    ],
    selectedByView: retainedSelectedByView
  });
  await writeGenerationProgress(94, "manifest_built", {
    requiresHitl,
    missingGeneratedViews,
    lowQualityGeneratedViews,
    coherenceIssues,
    packCoherence,
    ...(autoRerouteDiagnostics
      ? {
          autoReroute: {
            attempted: autoRerouteDiagnostics.attempted,
            recovered: autoRerouteDiagnostics.recovered ?? null,
            strategy: autoRerouteDiagnostics.strategy ?? null,
            targetViews: autoRerouteDiagnostics.targetViews
          }
        }
      : {}),
    bestScores: summarizeBestScores(requestedViews)
  });

  if (requiresHitl) {
    const missingText = missingGeneratedViews.length > 0 ? ` Missing views: ${missingGeneratedViews.join(", ")}.` : "";
    const lowQualityText =
      lowQualityGeneratedViews.length > 0
        ? ` Low-quality views: ${lowQualityGeneratedViews.join(", ")} (threshold=${acceptedScoreThreshold.toFixed(
            2
          )}).`
        : "";
    const coherenceText =
      coherenceIssues.length > 0
        ? ` Pack coherence issues: ${coherenceIssues.join(", ")}${
            packCoherence ? ` (severity=${packCoherence.severity}, score=${packCoherence.score.toFixed(2)})` : ""
          }.`
        : "";
    const rigStabilityText =
      initialRigStability?.severity && initialRigStability.severity !== "none"
        ? ` Rig stability: ${initialRigStability.summary}.`
        : "";
    const continuityDescriptor = formatContinuityDescriptor(continuitySnapshot);
    const continuityQueueStats = formatContinuityQueueStats(continuitySnapshot);
    const continuityText = continuityDescriptor
      ? ` Continuity: ${continuityDescriptor}${continuitySnapshot?.applied ? " (applied)." : "."}`
      : "";
    const continuityQueueText = continuityQueueStats ? ` Queue: ${continuityQueueStats}.` : "";
    const continuityQueueStatusSuffix = continuityQueueStats ? ` Queue: ${continuityQueueStats}.` : "";
    const continuityQueuePipeSuffix = continuityQueueStats ? ` | ${continuityQueueStats}` : "";
    await prisma.agentSuggestion.create({
      data: {
        episodeId: payload.episodeId,
        jobId: jobDbId,
        type: "HITL_REVIEW",
        status: "PENDING",
        title: generation.viewToGenerate
          ? `Regenerate ${generation.viewToGenerate} candidates`
          : "Choose best character view candidates",
        summary: generation.viewToGenerate
          ? `View-only regenerate completed for ${generation.viewToGenerate}. Pick candidates to continue.${continuityText}${continuityQueueText}`
          : `Auto-pick disabled or partial provider failure.${missingText}${lowQualityText}${coherenceText}${rigStabilityText}${continuityText}${continuityQueueText} Select one candidate per view from generation manifest.`,
        payload: toPrismaJson({
          manifestPath,
          provider: providerName,
          providerWarning,
          mode: generation.mode,
          promptPreset: promptBundle.presetId,
          sessionId,
          viewToGenerate: generation.viewToGenerate ?? null,
          packCoherence,
          ...(initialRigStability ? { rigStability: initialRigStability } : {}),
          ...(autoRerouteDiagnostics ? { autoReroute: autoRerouteDiagnostics } : {}),
          ...toFlatContinuityFields(manifest.reference.continuity)
        })
      }
    });

    if (character.buildJobDbId) {
      await helpers.setJobStatus(character.buildJobDbId, "CANCELLED", { finishedAt: new Date() });
      await helpers.logJob(character.buildJobDbId, "warn", "Cancelled awaiting HITL pick", {
        source: "worker:generate-character-assets",
        manifestPath
      });
    }

    if (character.previewJobDbId) {
      await helpers.setJobStatus(character.previewJobDbId, "CANCELLED", { finishedAt: new Date() });
      await helpers.logJob(character.previewJobDbId, "warn", "Cancelled awaiting HITL pick", {
        source: "worker:generate-character-assets",
        manifestPath
      });
    }

    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await writeGenerationProgress(97, "manifest_written_hitl", {
      manifestPath,
      requiresHitl: true,
      provider: providerName
    });
    const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
    if (sessionDelegate) {
      await sessionDelegate.update({
        where: { id: sessionId },
        data: {
          status: "READY",
          statusMessage: buildHitlSessionStatusMessage({
            viewToGenerate: generation.viewToGenerate,
            missingGeneratedViews,
            lowQualityGeneratedViews,
            coherenceIssues,
            packCoherence,
            autoReroute: autoRerouteDiagnostics,
            rigStability: initialRigStability,
            selectionRisk: initialSelectionRisk,
            qualityEmbargo: initialQualityEmbargo,
            finalQualityFirewall: initialFinalQualityFirewall,
            continuity: continuitySnapshot
          })
        }
      });
    }

    await helpers.logJob(jobDbId, "info", "Character generation completed (HITL required)", {
      manifestPath,
      provider: providerName,
      providerWarning,
      candidateCount: scored.length,
      inputHash: manifest.inputHash,
      manifestHash: manifest.manifestHash,
      ...toFlatContinuityFields(manifest.reference.continuity),
      sessionId,
      viewToGenerate: generation.viewToGenerate ?? null,
      lowQualityViews: lowQualityGeneratedViews,
      coherenceIssues,
      ...(autoRerouteDiagnostics ? { autoReroute: autoRerouteDiagnostics } : {}),
      qualityThreshold: acceptedScoreThreshold,
      limits: {
        maxCandidatesPerView: limits.maxCandidatesPerView,
        maxTotalImages: limits.maxTotalImages,
        maxRetries: limits.maxRetries
      },
      budget
    });

    return;
  }

  const selected = {
    front: selectedByView.front,
    threeQuarter: selectedByView.threeQuarter,
    profile: selectedByView.profile
  };
  if (!selected.front || !selected.threeQuarter || !selected.profile) {
    throw new Error("Failed to select candidates for all required views");
  }

  await persistSelectedCandidates({
    prisma,
    sessionId,
    episodeId: payload.episodeId,
    episodeChannelId: episode.channelId,
    jobDbId,
    character,
    selectedByView: {
      front: selected.front,
      threeQuarter: selected.threeQuarter,
      profile: selected.profile
    },
    manifest,
    manifestPath,
    maxAttempts,
    retryBackoffMs,
    helpers,
    source: "auto",
    providerName,
    workflowHash: providerWorkflowHash
  });
  await writeGenerationProgress(97, "persist_selected_candidates_auto", {
    manifestPath,
    requiresHitl: false,
    provider: providerName,
    bestScores: summarizeBestScores(requestedViews)
  });
  } catch (error) {
    if (sessionId) {
      const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
      if (sessionDelegate) {
        await sessionDelegate
          .update({
            where: { id: sessionId },
            data: {
              status: "FAILED",
              statusMessage: errorMessage(error)
            }
          })
          .catch(() => undefined);
      }
    }
    throw error;
  }
}
