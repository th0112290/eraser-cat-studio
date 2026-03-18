import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import type { Queue } from "bullmq";
import type { Prisma, PrismaClient } from "@prisma/client";
import { sha256Hex, stableStringify } from "@ec/shared";
import type { EpisodeJobPayload } from "../services/scheduleService";
import { enqueueWithResilience } from "../services/enqueueWithResilience";
import { isDbUnavailableError, renderDbUnavailableCard } from "./ui/dbFallback";
import {
  buildCharacterGeneratorPageBody,
  buildCharacterGeneratorStatusScript,
  buildCharacterGeneratorTopSection
} from "./ui/pages/characterGeneratorPage";
import { renderUiPage as uiPage } from "./ui/uiPage";
import { buildStudioBody } from "./ui/pages/studioPage";

type JsonRecord = Record<string, unknown>;
type HttpError = Error & { statusCode: number; details?: unknown };

type CharacterAssetIds = {
  front: string;
  threeQuarter: string;
  profile: string;
};

type CharacterGenerationSelection = {
  front: string;
  threeQuarter: string;
  profile: string;
};

type CharacterGenerationMode = "reference" | "new";
type CharacterGenerationProvider = "mock" | "comfyui" | "remoteApi";
type CharacterGenerationView = "front" | "threeQuarter" | "profile";
type CharacterGenerationSpecies = "cat" | "dog" | "wolf";
type CharacterGeneratorStatus = "PENDING_HITL" | "AUTO_SELECTED";

type CharacterGenerationInput = {
  mode: CharacterGenerationMode;
  provider: CharacterGenerationProvider;
  promptPreset: string;
  species: CharacterGenerationSpecies;
  positivePrompt?: string;
  negativePrompt?: string;
  boostNegativePrompt: boolean;
  referenceAssetId?: string;
  candidateCount: number;
  autoPick: boolean;
  requireHitlPick: boolean;
  seed: number;
  topic?: string;
  maxAttempts: number;
  retryBackoffMs: number;
};

type ChannelStylePreset = {
  id: string;
  label: string;
  positivePrompt?: string;
  negativePrompt?: string;
};

type GenerationManifestCandidate = {
  id: string;
  view: "front" | "threeQuarter" | "profile";
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
  providerMeta?: {
    mode?: string;
    qualityProfileId?: string;
    qualityTier?: string;
    targetStyle?: string;
    viewPrompt?: string;
    workflowStage?: string;
    workflowTemplateVersion?: string;
    warnings?: string[];
    referenceMode?: string;
    referenceApplied?: boolean;
    poseApplied?: boolean;
    repairMaskApplied?: boolean;
    repairMaskSource?: string;
    structureControlApplied?: boolean;
    structureControlsApplied?: string[];
    structureControlDiagnostics?: GenerationManifestWorkflowStructureControlDiagnostics;
    preflightDiagnostics?: GenerationManifestWorkflowPreflightDiagnostics;
    routeDecision?: GenerationManifestWorkflowRouteDecision;
    workflowFiles?: {
      apiPromptPath?: string;
      guiWorkflowPath?: string;
      summaryPath?: string;
    };
    runSettings?: {
      sampler?: string;
      scheduler?: string;
      steps?: number;
      cfg?: number;
      width?: number;
      height?: number;
    };
    postprocess?: {
      applied?: boolean;
      outputWidth?: number;
      outputHeight?: number;
      upscaleLongSide?: number;
      sharpen?: number;
      saturationBoost?: number;
    };
  };
  breakdown?: {
    alphaScore?: number;
    occupancyScore?: number;
    sharpnessScore?: number;
    noiseScore?: number;
    watermarkScore?: number;
    resolutionScore?: number;
    referenceScore?: number;
    styleScore?: number;
    qualityScore?: number;
    consistencyScore?: number | null;
    generationRound?: number;
    consistencyParts?: {
      phash?: number;
      palette?: number;
      bboxCenter?: number;
      bboxScale?: number;
    };
  };
};

type GenerationManifestWorkflowStructureControlDiagnostics = {
  requiredKinds?: string[];
  suppliedKinds?: string[];
  appliedKinds?: string[];
  appliedSuppliedKinds?: string[];
  appliedAutoKinds?: string[];
  missingRequiredKinds?: string[];
  sourceRolesByKind?: Record<string, string[]>;
  sourceRefsByKind?: Record<string, string[]>;
};

type GenerationManifestWorkflowPreflightDiagnostics = {
  ok: boolean;
  warnings: string[];
  requiredReferenceRoles?: string[];
  requiredStructureControlKinds?: string[];
  approvedViews?: CharacterGenerationView[];
  provenancePolicy?: {
    requireTraceFields?: boolean;
    requireSourceRefInReferenceBank?: boolean;
    requireSourceRoleMatchReferenceRole?: boolean;
    requireSourceViewMatchReferenceView?: boolean;
  };
};

type GenerationManifestWorkflowRouteDecision = {
  preferUltraCheckpoint?: boolean;
  preferCheckpoint?: boolean;
  canUseCheckpoint?: boolean;
  ultraReady?: boolean;
  fluxReady?: boolean;
  selectedMode?: string;
  fallbackUsed?: boolean;
};

type GenerationManifestPackCoherence = {
  issues: string[];
  severity: "none" | "review" | "block";
  score: number;
  blockingViews: CharacterGenerationView[];
  warningViews: CharacterGenerationView[];
  metrics?: {
    frontAnchorScore?: number | null;
    frontStyleScore?: number | null;
    frontSpeciesScore?: number | null;
    threeQuarterConsistency?: number | null;
    profileConsistency?: number | null;
    speciesSpread?: number | null;
    styleSpread?: number | null;
    headRatioSpread?: number | null;
    monochromeSpread?: number | null;
  };
};

type GenerationManifestAutoReroute = {
  attempted: boolean;
  strategy?: string;
  triggers: string[];
  targetViews: CharacterGenerationView[];
  candidateCountBoost?: number;
  acceptedScoreThresholdBoost?: number;
  seedOffset?: number;
  notes: string[];
  initialMissingViews: CharacterGenerationView[];
  finalMissingViews?: CharacterGenerationView[];
  initialLowQualityViews: CharacterGenerationView[];
  finalLowQualityViews?: CharacterGenerationView[];
  initialPackCoherence?: GenerationManifestPackCoherence;
  finalPackCoherence?: GenerationManifestPackCoherence;
  viewDeltaByView?: Partial<Record<CharacterGenerationView, GenerationManifestAutoRerouteViewDelta>>;
  recovered?: boolean;
  skippedReason?: string;
};

type GenerationManifestAutoRerouteViewDelta = {
  beforeCandidateId?: string;
  afterCandidateId?: string;
  scoreDelta?: number;
  consistencyDelta?: number | null;
  warningDelta?: number;
  rejectionDelta?: number;
};

type GenerationManifestSelectionRisk = {
  level: "none" | "review" | "block";
  reasonCodes: string[];
  suggestedAction?: "pick-manually" | "recreate";
  summary: string;
};

type GenerationManifestQualityEmbargo = {
  level: "none" | "review" | "block";
  reasonCodes: string[];
  suggestedAction?: "pick-manually" | "recreate";
  summary: string;
  blockingViews?: CharacterGenerationView[];
  warningViews?: CharacterGenerationView[];
  defectFamiliesByView?: Partial<Record<CharacterGenerationView, string[]>>;
};

type GenerationManifestPackDefectSummary = {
  defectFamiliesByView?: Partial<Record<CharacterGenerationView, string[]>>;
  repeatedFamilies: string[];
  blockingFamilies: string[];
  warningFamilies: string[];
  persistentFamiliesByView?: Partial<Record<CharacterGenerationView, string[]>>;
};

type GenerationManifestFinalQualityFirewall = {
  level: "none" | "review" | "block";
  reasonCodes: string[];
  suggestedAction?: "pick-manually" | "recreate";
  summary: string;
  blockingViews?: CharacterGenerationView[];
  warningViews?: CharacterGenerationView[];
  repeatedFamilies?: string[];
  persistentFamiliesByView?: Partial<Record<CharacterGenerationView, string[]>>;
};

type GenerationManifestDecisionOutcome = {
  kind: "auto_selected" | "hitl_review" | "hitl_selected";
  status: "ok" | "review" | "blocked";
  sourceStage?: string;
  summary: string;
  reasonCodes: string[];
  recoveryAttempted: boolean;
  recoveredViews?: CharacterGenerationView[];
  escalatedAction?: "pick-manually" | "recreate";
  worstRuntimeBucket?: "clean" | "warn" | "degraded" | "compound" | "block";
};

type GenerationManifestRepairDirectiveProfileSummary = {
  families: string[];
  severity: string;
  candidateCountBoost: number;
  acceptedScoreThresholdBoost: number;
  disablePose: boolean;
  notes: string[];
};

type GenerationManifestStageCandidateSummary = {
  candidateId?: string;
  score?: number;
  consistencyScore?: number | null;
  warningCount: number;
  rejectionCount: number;
  passed: boolean;
  failureReasons: string[];
  runtimeBucket?: "clean" | "warn" | "degraded" | "compound" | "block";
};

type GenerationManifestStageGateDecision = {
  decision: string;
  chosenCandidateId?: string;
  chosenStage?: string;
  baseCandidateId?: string;
  refineCandidateId?: string;
  lockCandidateId?: string;
  scoreDeltaVsBase?: number;
  consistencyDeltaVsBase?: number | null;
  reasons: string[];
};

type GenerationManifestStageRepairTriageDecision = {
  decision: string;
  priority?: string;
  sourceCandidateId?: string;
  sourceStage?: string;
  sourcePassLabel?: string;
  targetStage?: string;
  acceptedByGate?: boolean;
  gateDecision?: string;
  repairFamilies?: string[];
  score?: number;
  consistencyScore?: number | null;
  reasonCodes: string[];
};

type GenerationManifestStageRepairAcceptanceDecision = {
  decision: string;
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
  introducedCriticalFamilies?: string[];
  reasonCodes: string[];
};

type GenerationManifestStageReferenceRoleMixSummary = {
  count: number;
  weightSum: number;
};

type GenerationManifestStageReferenceMixSummary = {
  totalEntries: number;
  totalWeight: number;
  roles: Record<string, GenerationManifestStageReferenceRoleMixSummary>;
};

type GenerationManifestStructureGuideQualityMetrics = {
  kind: string;
  signalCoverage?: number;
  dynamicRange?: number;
  meanLuma?: number;
  stdDev?: number;
  score?: number;
  status: "ok" | "review" | "block";
  reasonCodes: string[];
};

type GenerationManifestStructureGuideSourceDiagnostics = {
  sourceRole?: string;
  sourceRefId?: string;
  sourceView?: CharacterGenerationView;
  allowedRoles?: string[];
  requiredPrimaryRole?: string;
  status: "ok" | "review" | "block";
  reasonCodes: string[];
};

type GenerationManifestStageInputPreflightViewDiagnostics = {
  status: "ok" | "review" | "block";
  reasonCodes: string[];
  requiredReferenceRoles?: string[];
  missingReferenceRoles?: string[];
  weakReferenceRoles?: string[];
  requiredStructureKinds?: string[];
  missingStructureKinds?: string[];
  weakStructureKinds?: string[];
  invalidStructureSourceKinds?: string[];
  missingPrimaryStructureSourceKinds?: string[];
  referenceRoleWeights?: Record<string, number>;
  referenceAlphaCoverage?: number;
  referenceMonochromeScore?: number;
  structureGuideMetrics?: Record<string, GenerationManifestStructureGuideQualityMetrics>;
  structureGuideSources?: Record<string, GenerationManifestStructureGuideSourceDiagnostics>;
};

type GenerationManifestWorkflowStage = {
  stage: string;
  templateVersion: string;
  templateSpecPath?: string;
  origin?: string;
  passLabel?: string;
  reasonCodes?: string[];
  triggerViews?: CharacterGenerationView[];
  seedOffset?: number;
  views: CharacterGenerationView[];
  candidateCount: number;
  acceptedScoreThreshold: number;
  roundsAttempted: number;
  referenceBankSizeByView?: Partial<Record<CharacterGenerationView, number>>;
  referenceMixByView?: Partial<Record<CharacterGenerationView, GenerationManifestStageReferenceMixSummary>>;
  preflightByView?: Partial<Record<CharacterGenerationView, GenerationManifestStageInputPreflightViewDiagnostics>>;
  executionViews?: CharacterGenerationView[];
  blockedViewsByPreflight?: CharacterGenerationView[];
  warningViewsByPreflight?: CharacterGenerationView[];
  adjustmentNotesByView?: Partial<Record<CharacterGenerationView, string[]>>;
  directiveProfilesByView?: Partial<Record<CharacterGenerationView, GenerationManifestRepairDirectiveProfileSummary>>;
  repairFromCandidateIds?: Partial<Record<CharacterGenerationView, string>>;
  observedDefectFamiliesByView?: Partial<Record<CharacterGenerationView, string[]>>;
  passedViews?: CharacterGenerationView[];
  failedViews?: CharacterGenerationView[];
  failureReasonsByView?: Partial<Record<CharacterGenerationView, string[]>>;
  runtimeVariantTags?: string[];
  bestCandidateSummaryByView?: Partial<Record<CharacterGenerationView, GenerationManifestStageCandidateSummary>>;
  gateDecisionsByView?: Partial<Record<CharacterGenerationView, GenerationManifestStageGateDecision>>;
  repairTriageByView?: Partial<Record<CharacterGenerationView, GenerationManifestStageRepairTriageDecision>>;
  repairAcceptanceByView?: Partial<Record<CharacterGenerationView, GenerationManifestStageRepairAcceptanceDecision>>;
};

type GenerationManifestSelectedWorkflowRuntime = {
  view: CharacterGenerationView;
  candidateId: string;
  mode?: string;
  workflowStage?: string;
  workflowTemplateVersion?: string;
  referenceMode?: string;
  referenceApplied?: boolean;
  poseApplied?: boolean;
  repairMaskApplied?: boolean;
  repairMaskSource?: string;
  structureControlApplied?: boolean;
  structureControlsApplied?: string[];
  warnings?: string[];
  structureControlDiagnostics?: GenerationManifestWorkflowStructureControlDiagnostics;
  preflightDiagnostics?: GenerationManifestWorkflowPreflightDiagnostics;
  routeDecision?: GenerationManifestWorkflowRouteDecision;
  compact: string;
};

type GenerationManifestSelectionCandidateSummary = {
  candidateId: string;
  score?: number;
  consistencyScore?: number | null;
  anchorConfidence?: number | null;
  landmarkConsistency?: number | null;
  warningCount?: number;
  rejectionCount?: number;
  runtimeBucket?: "clean" | "warn" | "degraded" | "compound" | "block";
  rigFallbackReasonCodes?: string[];
};

type GenerationManifestRigStability = {
  severity: "none" | "review" | "block";
  summary: string;
  reasonCodes: string[];
  fallbackReasonCodes: string[];
  warningViews?: CharacterGenerationView[];
  blockingViews?: CharacterGenerationView[];
  reviewOnly?: boolean;
  safeFrontExpression?: boolean;
  suppressAggressiveYaw?: boolean;
  lockMouthPreset?: boolean;
  anchorConfidenceOverall?: number | null;
  anchorConfidenceByView?: Partial<Record<CharacterGenerationView, number | null>>;
  landmarkConsistencyByView?: Partial<Record<CharacterGenerationView, number | null>>;
  suggestedAction?: "pick-manually" | "recreate";
};

type GenerationManifestSelectionDiagnostics = {
  finalSelectionSource?: string;
  coherenceIssues?: string[];
  packCoherence?: GenerationManifestPackCoherence;
  autoReroute?: GenerationManifestAutoReroute;
  rigStability?: GenerationManifestRigStability;
  selectionRisk?: GenerationManifestSelectionRisk;
  qualityEmbargo?: GenerationManifestQualityEmbargo;
  packDefectSummary?: GenerationManifestPackDefectSummary;
  finalQualityFirewall?: GenerationManifestFinalQualityFirewall;
  decisionOutcome?: GenerationManifestDecisionOutcome;
  workflowStages?: GenerationManifestWorkflowStage[];
  selectedCandidateSummaryByView?: Partial<Record<CharacterGenerationView, GenerationManifestSelectionCandidateSummary>>;
  [key: string]: unknown;
};

type GenerationManifestReferenceContinuity = {
  enabled: boolean;
  attempted: boolean;
  applied: boolean;
  reason: string;
  attemptedSourceSessionId?: string;
  queuedSessionCount?: number;
  uniqueQueuedSessionCount?: number;
  duplicateSessionCount?: number;
  searchedSessionCount?: number;
  preferredPoolCount?: number;
  fallbackPoolCount?: number;
  sourcePool?: "preferred" | "fallback";
  candidatePicked?: boolean;
  candidateScore?: number | null;
  candidateRejectionCount?: number | null;
  candidateUpdatedAt?: string | null;
};

type GenerationManifestReference = {
  assetId: string | null;
  sourceSessionId?: string | null;
  starterPath?: string | null;
  starterPathsByView?: Partial<Record<CharacterGenerationView, string>>;
  phash: string | null;
  continuity?: GenerationManifestReferenceContinuity;
};

type GenerationManifest = {
  schemaVersion: string;
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
  qualityProfile?: {
    id: string;
    label?: string;
    targetStyle?: string;
    qualityTier?: string;
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
  packCoherence?: GenerationManifestPackCoherence;
  autoReroute?: GenerationManifestAutoReroute;
  reference?: GenerationManifestReference;
  providerMeta?: {
    qualityProfileId?: string;
    runSettings?: {
      sampler?: string;
      scheduler?: string;
      steps?: number;
      cfg?: number;
      width?: number;
      height?: number;
    };
    workflowStage?: string;
    workflowTemplateVersion?: string;
    workflowExports?: {
      apiPromptPath?: string;
      guiWorkflowPath?: string;
      summaryPath?: string;
    };
    warnings?: string[];
    selectionDiagnostics?: GenerationManifestSelectionDiagnostics;
  };
  workflowStages?: GenerationManifestWorkflowStage[];
  candidates: GenerationManifestCandidate[];
  selectedByView: Partial<Record<"front" | "threeQuarter" | "profile", { candidateId: string; assetId?: string; assetIngestJobId?: string }>>;
};

type CharacterArtifactSource = {
  label: string;
  root: string;
};

type CharacterLineageTask = {
  code: string;
  severity: string;
  status: string;
  action: string;
  reason: string;
  assetPaths: string[];
};

type CharacterViewLineage = {
  view: CharacterGenerationView;
  assetId: string | null;
  approved: boolean | null;
  workflow: string | null;
  workflowVersion: string | null;
  createdAt: string | null;
  filePath: string | null;
  fileUrl: string | null;
  metadataPath: string | null;
  metadataUrl: string | null;
  parentAssetId: string | null;
  parentAssetPath: string | null;
  parentAssetUrl: string | null;
  repairHistory: string[];
};

type CharacterPackLineageAnchorViewSummary = {
  presentAnchorIds: string[];
  missingAnchorIds: string[];
  notes: string | null;
};

type CharacterPackLineageRigSummary = {
  reviewOnly: boolean | null;
  reviewNotes: string[];
  anchorConfidenceOverall: number | null;
  anchorConfidenceByView: Partial<Record<CharacterGenerationView, number | null>>;
  confidenceNotes: string | null;
  coveredViews: CharacterGenerationView[];
  missingViews: CharacterGenerationView[];
  byView: Partial<Record<CharacterGenerationView, CharacterPackLineageAnchorViewSummary>>;
  lowConfidenceAnchorIds: string[];
  missingAnchorIds: string[];
};

type CharacterPackLineageOverrideSummary = {
  anchorsPath: string | null;
  anchorsUrl: string | null;
  anchorsText: string | null;
  cropBoxesPath: string | null;
  cropBoxesUrl: string | null;
  cropBoxesText: string | null;
};

type CharacterOverrideKind = "anchors" | "cropBoxes";

type CharacterGenerationOverrideTarget = {
  generateJobId: string;
  manifest: GenerationManifest;
  manifestPath: string;
  characterPackId: string;
  lineage: CharacterPackLineage;
  anchorsOverridePath: string;
  cropBoxesOverridePath: string;
  selectedByView: CharacterGenerationSelection | null;
};

type CharacterPackLineage = {
  sourceLabel: string;
  characterRoot: string;
  manifestPath: string;
  manifestUrl: string | null;
  packMetaPath: string | null;
  packMetaUrl: string | null;
  packJsonPath: string | null;
  packJsonUrl: string | null;
  proposalPath: string | null;
  proposalUrl: string | null;
  qcReportPath: string | null;
  qcReportUrl: string | null;
  repairTasksPath: string | null;
  repairTasksUrl: string | null;
  builtAt: string | null;
  sourceManifestPath: string | null;
  sourceManifestUrl: string | null;
  sourceImageRef: string | null;
  sourceImageUrl: string | null;
  acceptanceStatus: string | null;
  approvedFrontMasterPresent: boolean | null;
  qcFailedCount: number;
  qcTotalCount: number;
  repairOpenCount: number;
  repairTasks: CharacterLineageTask[];
  viewEntries: CharacterViewLineage[];
  rigSummary: CharacterPackLineageRigSummary | null;
  overrides: CharacterPackLineageOverrideSummary;
};

function computeManifestHashes(input: {
  episodeId: string;
  characterPackId: string;
  mode: string;
  promptPreset: string;
  species?: string;
  positivePrompt: string;
  negativePrompt: string;
  workflowHash: string;
  provider: string;
  candidates: GenerationManifestCandidate[];
}): { inputHash: string; manifestHash: string } {
  const candidateFingerprint = input.candidates
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
      episodeId: input.episodeId,
      characterPackId: input.characterPackId,
      mode: input.mode,
      promptPreset: input.promptPreset,
      species: input.species ?? null,
      positivePrompt: input.positivePrompt,
      negativePrompt: input.negativePrompt,
      workflowHash: input.workflowHash,
      provider: input.provider,
      candidateFingerprint
    })
  );
  const manifestHash = sha256Hex(
    stableStringify({
      ...input,
      inputHash
    })
  );
  return { inputHash, manifestHash };
}

type CharacterGenerationCreateResult = {
  sessionId: string;
  characterPackId: string;
  version: number;
  episodeId: string;
  generateJobId: string;
  buildJobId: string;
  previewJobId: string;
  bullmqJobId: string;
  manifestPath: string;
  generatorStatus: CharacterGeneratorStatus;
  reusedExisting: boolean;
};

type RegisterCharacterRoutesInput = {
  app: FastifyInstance;
  prisma: PrismaClient;
  queue: Queue<EpisodeJobPayload>;
  queueName: string;
};

type CharacterCreateResult = {
  characterPackId: string;
  version: number;
  previewJobId: string;
  buildJobId: string;
  episodeId: string;
  bullmqJobId: string;
};

type CharacterGenerationRegenerateResult = {
  sessionId: string;
  view: CharacterGenerationView;
  generateJobId: string;
  bullmqJobId: string;
  manifestPath: string;
};

type CharacterGenerationRecreateResult = {
  sessionId: string;
  generateJobId: string;
  bullmqJobId: string;
  manifestPath: string;
  seed: number;
};

type CharacterGenerationRecommendedAction = {
  id: string;
  action: "regenerate-view" | "recreate" | "pick-manually";
  label: string;
  description: string;
  priority: "high" | "medium" | "low";
  reasonCodes: string[];
  view?: CharacterGenerationView;
  candidateCount?: number;
  seed?: number;
  regenerateSameSeed?: boolean;
  boostNegativePrompt?: boolean;
  anchorId?: string;
};

const BUILD_CHARACTER_PACK_JOB_NAME = "BUILD_CHARACTER_PACK";
const RENDER_CHARACTER_PREVIEW_JOB_NAME = "RENDER_CHARACTER_PREVIEW";
const GENERATE_CHARACTER_ASSETS_JOB_NAME = "GENERATE_CHARACTER_ASSETS";
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_BACKOFF_MS = 1000;
const MAX_LIST = 100;
const DEFAULT_GENERATION_SEED = 101;
const GENERATION_DEDUPE_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_PROMPT_PRESET = "eraser-cat-mascot-production";
const DEMO_USER_EMAIL = "demo.extreme@example.com";
const DEMO_USER_NAME = "demo-extreme";
const DEMO_CHANNEL_NAME = "Extreme Demo Channel";
const CHARACTER_STYLE_PRESETS = [
  { id: "eraser-cat-mascot-production", label: "Eraser Cat Mascot Production" },
  { id: "anime-production-2d", label: "Anime Production 2D" },
  { id: "anime-sheet-balanced", label: "Anime Sheet Balanced" },
  { id: "eraser-cat-flat", label: "Eraser Cat Flat" },
  { id: "playful-cartoon", label: "Playful Cartoon" },
  { id: "minimal-rig", label: "Minimal Rig" }
] as const;
const CHARACTER_SPECIES_PRESETS = [
  { id: "cat", label: "Cat" },
  { id: "dog", label: "Dog" },
  { id: "wolf", label: "Wolf" }
] as const;

type CharacterGenerationSessionDelegate = {
  findFirst: (args: unknown) => Promise<any>;
  create: (args: unknown) => Promise<any>;
  update: (args: unknown) => Promise<any>;
};

function getCharacterGenerationSessionDelegate(client: unknown): CharacterGenerationSessionDelegate | null {
  if (!client || typeof client !== "object") {
    return null;
  }
  const delegate = (client as Record<string, unknown>).characterGenerationSession;
  if (!delegate || typeof delegate !== "object") {
    return null;
  }
  const candidate = delegate as CharacterGenerationSessionDelegate;
  if (
    typeof candidate.findFirst !== "function" ||
    typeof candidate.create !== "function" ||
    typeof candidate.update !== "function"
  ) {
    return null;
  }
  return candidate;
}

function isLiveJobStatus(status: string): boolean {
  return status === "QUEUED" || status === "RUNNING";
}

function createHttpError(statusCode: number, message: string, details?: unknown): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireBodyObject(body: unknown): JsonRecord {
  if (!isRecord(body)) {
    throw createHttpError(400, "Request body must be a JSON object");
  }
  return body;
}

function requireRouteParam(params: unknown, field: string): string {
  if (!isRecord(params)) {
    throw createHttpError(400, "Route params are invalid");
  }

  const value = params[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw createHttpError(400, `${field} path param must be a non-empty string`);
  }

  return value.trim();
}

function optionalString(obj: JsonRecord, field: string): string | undefined {
  const value = obj[field];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `${field} must be a string`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInt(value: unknown, field: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) {
      throw createHttpError(400, `${field} must be a positive integer`);
    }
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw createHttpError(400, `${field} must be a positive integer`);
    }
    return parsed;
  }

  throw createHttpError(400, `${field} must be a positive integer`);
}

function parseBoolean(value: unknown, field: string, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  throw createHttpError(400, `${field} must be a boolean`);
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function parseRuntimeBucketLevel(
  value: unknown
): "clean" | "warn" | "degraded" | "compound" | "block" | undefined {
  return value === "clean" ||
    value === "warn" ||
    value === "degraded" ||
    value === "compound" ||
    value === "block"
    ? value
    : undefined;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function parseStringArrayAtPath(root: JsonRecord, keys: string[]): string[] {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) {
      return [];
    }
    current = current[key];
  }
  return parseStringArray(current);
}

function getRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../../");
}

function pathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readJsonFileSafe(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function readTextFileSafe(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const CHARACTER_OVERRIDE_VIEWS = ["front", "threeQuarter", "profile"] as const satisfies readonly CharacterGenerationView[];
const CHARACTER_ANCHOR_OVERRIDE_IDS = [
  "head_center",
  "mouth_center",
  "eye_near",
  "eye_far",
  "ear_near",
  "ear_far",
  "paw_anchor",
  "tail_root"
] as const;
const CHARACTER_ANCHOR_OVERRIDE_STATUSES = ["present", "occluded", "missing", "not_applicable"] as const;

function defaultAnchorOverrideText(): string {
  return `${JSON.stringify(
    {
      views: {
        front: {},
        threeQuarter: {},
        profile: {}
      }
    },
    null,
    2
  )}\n`;
}

function defaultCropBoxOverrideText(): string {
  return `${JSON.stringify(
    {
      torso: {},
      head: {},
      eyes: {},
      mouth: {}
    },
    null,
    2
  )}\n`;
}

function sanitizeAnchorOverridePayload(raw: unknown): JsonRecord {
  if (!isRecord(raw)) {
    throw createHttpError(400, "anchors override must be a JSON object");
  }
  const viewRoot = isRecord(raw.views) ? raw.views : raw;
  const sanitizedViews: JsonRecord = {};

  for (const view of CHARACTER_OVERRIDE_VIEWS) {
    const rawView = isRecord(viewRoot[view]) ? viewRoot[view] : null;
    if (!rawView) {
      continue;
    }
    const sanitizedView: JsonRecord = {};
    for (const anchorId of CHARACTER_ANCHOR_OVERRIDE_IDS) {
      const rawEntry = rawView[anchorId];
      if (!isRecord(rawEntry)) {
        continue;
      }
      const sanitizedEntry: JsonRecord = {};
      const x = readFiniteNumber(rawEntry.x);
      const y = readFiniteNumber(rawEntry.y);
      const confidence = readFiniteNumber(rawEntry.confidence);
      const status = typeof rawEntry.status === "string" ? rawEntry.status.trim() : "";
      const notes = typeof rawEntry.notes === "string" ? rawEntry.notes.trim() : "";
      if (x !== undefined) {
        sanitizedEntry.x = x;
      }
      if (y !== undefined) {
        sanitizedEntry.y = y;
      }
      if (confidence !== undefined) {
        sanitizedEntry.confidence = confidence;
      }
      if ((CHARACTER_ANCHOR_OVERRIDE_STATUSES as readonly string[]).includes(status)) {
        sanitizedEntry.status = status;
      }
      if (notes.length > 0) {
        sanitizedEntry.notes = notes;
      }
      if (Object.keys(sanitizedEntry).length > 0) {
        sanitizedView[anchorId] = sanitizedEntry;
      }
    }
    if (Object.keys(sanitizedView).length > 0) {
      sanitizedViews[view] = sanitizedView;
    }
  }

  if (Object.keys(sanitizedViews).length === 0) {
    throw createHttpError(400, "anchors override did not include any valid anchor entries");
  }

  return { views: sanitizedViews };
}

function sanitizeCropBoxPayload(rawBox: unknown): JsonRecord | null {
  if (!isRecord(rawBox)) {
    return null;
  }
  const sanitized: JsonRecord = {};
  const cx = readFiniteNumber(rawBox.cx);
  const cy = readFiniteNumber(rawBox.cy);
  const w = readFiniteNumber(rawBox.w);
  const h = readFiniteNumber(rawBox.h);
  if (cx !== undefined) {
    sanitized.cx = cx;
  }
  if (cy !== undefined) {
    sanitized.cy = cy;
  }
  if (w !== undefined) {
    sanitized.w = w;
  }
  if (h !== undefined) {
    sanitized.h = h;
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeCropBoxOverridePayload(raw: unknown): JsonRecord {
  if (!isRecord(raw)) {
    throw createHttpError(400, "crop-boxes override must be a JSON object");
  }

  const sanitized: JsonRecord = {};
  const torsoRoot = isRecord(raw.torso) ? raw.torso : null;
  const headRoot = isRecord(raw.head) ? raw.head : null;
  const eyesRoot = isRecord(raw.eyes) ? raw.eyes : null;

  const torso: JsonRecord = {};
  const head: JsonRecord = {};
  for (const view of CHARACTER_OVERRIDE_VIEWS) {
    const torsoBox = sanitizeCropBoxPayload(torsoRoot?.[view]);
    const headBox = sanitizeCropBoxPayload(headRoot?.[view]);
    if (torsoBox) {
      torso[view] = torsoBox;
    }
    if (headBox) {
      head[view] = headBox;
    }
  }
  if (Object.keys(torso).length > 0) {
    sanitized.torso = torso;
  }
  if (Object.keys(head).length > 0) {
    sanitized.head = head;
  }

  const eyes: JsonRecord = {};
  const leftEye = sanitizeCropBoxPayload(eyesRoot?.left);
  const rightEye = sanitizeCropBoxPayload(eyesRoot?.right);
  if (leftEye) {
    eyes.left = leftEye;
  }
  if (rightEye) {
    eyes.right = rightEye;
  }
  if (Object.keys(eyes).length > 0) {
    sanitized.eyes = eyes;
  }

  const mouth = sanitizeCropBoxPayload(raw.mouth);
  if (mouth) {
    sanitized.mouth = mouth;
  }

  if (Object.keys(sanitized).length === 0) {
    throw createHttpError(400, "crop-boxes override did not include any valid crop boxes");
  }

  return sanitized;
}

function getGeneratedCharacterArtifactSources(): CharacterArtifactSource[] {
  const repoRoot = getRepoRoot();
  const candidates: CharacterArtifactSource[] = [
    { label: "local worktree", root: path.join(repoRoot, "assets", "generated", "characters") },
    { label: "main repo", root: path.resolve(repoRoot, "../eraser-cat-studio/assets/generated/characters") }
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = path.resolve(candidate.root).toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function resolveGeneratedCharacterRoot(
  characterPackId: string
): { source: CharacterArtifactSource; characterRoot: string } | null {
  for (const source of getGeneratedCharacterArtifactSources()) {
    const characterRoot = path.join(source.root, characterPackId);
    if (fs.existsSync(characterRoot) && fs.statSync(characterRoot).isDirectory()) {
      return { source, characterRoot };
    }
  }
  return null;
}

function resolveGeneratedCharacterFile(
  requestedPath: string,
  allowedExtensions = [".json", ".png", ".jpg", ".jpeg", ".webp", ".mp4"]
): { resolvedPath: string; source: CharacterArtifactSource } | null {
  const resolvedPath = path.resolve(requestedPath);
  const source = getGeneratedCharacterArtifactSources().find((candidate) => pathInside(candidate.root, resolvedPath));
  if (!source) {
    return null;
  }
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    return null;
  }
  const ext = path.extname(resolvedPath).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return null;
  }
  return {
    resolvedPath,
    source
  };
}

function mimeTypeForGeneratedCharacterFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp4") return "video/mp4";
  return "application/octet-stream";
}

function toGeneratedCharacterFileUrl(filePath: string | null | undefined): string | null {
  if (!filePath) {
    return null;
  }
  const resolved = resolveGeneratedCharacterFile(filePath);
  if (!resolved) {
    return null;
  }
  return `/ui/characters/generated-file?path=${encodeURIComponent(resolved.resolvedPath)}`;
}

function getCharacterArtifacts(characterPackId: string): {
  outDir: string;
  packJsonPath: string;
  previewPath: string;
  qcReportPath: string;
} {
  const outDir = path.join(getRepoRoot(), "out", "characters", characterPackId);
  return {
    outDir,
    packJsonPath: path.join(outDir, "pack.json"),
    previewPath: path.join(outDir, "preview.mp4"),
    qcReportPath: path.join(outDir, "qc_report.json")
  };
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function ensureDefaultChannel(prisma: PrismaClient): Promise<{ id: string }> {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: { name: DEMO_USER_NAME },
    create: { email: DEMO_USER_EMAIL, name: DEMO_USER_NAME }
  });

  const existing = await prisma.channel.findFirst({
    where: {
      userId: user.id,
      name: DEMO_CHANNEL_NAME
    },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return { id: existing.id };
  }

  const created = await prisma.channel.create({
    data: {
      userId: user.id,
      name: DEMO_CHANNEL_NAME
    }
  });

  return { id: created.id };
}

function escHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

type CreationNavState = {
  returnTo?: string;
  currentObject?: string;
  focus?: string;
  assetId?: string;
  referenceAssetId?: string;
  jobId?: string;
  characterPackId?: string;
  packId?: string;
  episodeId?: string;
};

function readCreationNavState(root: JsonRecord): CreationNavState {
  return {
    returnTo: optionalString(root, "returnTo"),
    currentObject: optionalString(root, "currentObject"),
    focus: optionalString(root, "focus"),
    assetId: optionalString(root, "assetId"),
    referenceAssetId: optionalString(root, "referenceAssetId"),
    jobId: optionalString(root, "jobId"),
    characterPackId: optionalString(root, "characterPackId"),
    packId: optionalString(root, "packId"),
    episodeId: optionalString(root, "episodeId")
  };
}

function buildUiHref(pathname: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text.length === 0) {
      continue;
    }
    search.set(key, text);
  }
  const query = search.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

function hrefWithCreationNav(
  pathname: string,
  params: Record<string, string | number | boolean | undefined | null>,
  nav: CreationNavState
): string {
  return buildUiHref(pathname, {
    ...params,
    ...(nav.returnTo ? { returnTo: nav.returnTo } : {}),
    ...(nav.currentObject ? { currentObject: nav.currentObject } : {}),
    ...(nav.focus ? { focus: nav.focus } : {})
  });
}

function renderCreationNavHiddenFields(nav: CreationNavState): string {
  return [
    ["returnTo", nav.returnTo],
    ["currentObject", nav.currentObject],
    ["focus", nav.focus],
    ["assetId", nav.assetId],
    ["referenceAssetId", nav.referenceAssetId]
  ]
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([name, value]) => `<input type="hidden" name="${escHtml(name)}" value="${escHtml(value)}"/>`)
    .join("");
}

function requestUiHref(request: { raw?: { url?: string } }): string {
  return typeof request.raw?.url === "string" && request.raw.url.trim().length > 0 ? request.raw.url : "/";
}

function uiBadge(status: string): string {
  const normalized = status.toUpperCase();
  if (["READY", "SUCCEEDED", "APPROVED", "PREVIEW_READY", "COMPLETED"].includes(normalized)) {
    return "ok";
  }
  if (["FAILED"].includes(normalized)) {
    return "bad";
  }
  if (["RUNNING", "PROCESSING", "QUEUED", "DRAFT", "GENERATING"].includes(normalized)) {
    return "warn";
  }
  return "muted";
}

function coherenceBadge(severity: GenerationManifestPackCoherence["severity"] | undefined): string {
  if (severity === "none") {
    return "ok";
  }
  if (severity === "review") {
    return "warn";
  }
  if (severity === "block") {
    return "bad";
  }
  return "muted";
}

function recommendedPriorityBadge(priority: CharacterGenerationRecommendedAction["priority"]): string {
  if (priority === "high") {
    return "bad";
  }
  if (priority === "medium") {
    return "warn";
  }
  return "ok";
}

function formatMetric(value: number | null | undefined): string {
  if (typeof value === "number") {
    return value.toFixed(2);
  }
  if (value === null) {
    return "null";
  }
  return "-";
}

function summarizePackCoherence(packCoherence: GenerationManifestPackCoherence | undefined): string {
  if (!packCoherence) {
    return "-";
  }
  return `${packCoherence.severity}:${packCoherence.score.toFixed(2)}`;
}

function summarizePackDefectSummary(packDefectSummary: GenerationManifestPackDefectSummary | undefined): string {
  if (!packDefectSummary) {
    return "-";
  }
  const repeated = packDefectSummary.repeatedFamilies.slice(0, 3).join("+") || "none";
  const persistentCount = packDefectSummary.persistentFamiliesByView
    ? Object.values(packDefectSummary.persistentFamiliesByView).filter((families) => (families?.length ?? 0) > 0).length
    : 0;
  return `repeat=${repeated} / persistent=${persistentCount}`;
}

function humanizeToken(value: string): string {
  return value
    .split(/[_:-]+/)
    .filter((entry) => entry.length > 0)
    .map((entry) => entry[0]?.toUpperCase() + entry.slice(1))
    .join(" ");
}

function describeRigFallbackReason(
  reasonCode: string
): { label: string; copy: string; tone: "ok" | "warn" | "bad" | "muted" } {
  switch (reasonCode) {
    case "review_only":
      return {
        label: "Review Only",
        copy: "Keep this run in human review mode before approval or pack promotion.",
        tone: "warn"
      };
    case "safe_front_expression":
      return {
        label: "Safe Front Expression",
        copy: "Front expression stayed on a safer pose because front anchors were weak.",
        tone: "warn"
      };
    case "suppress_aggressive_yaw":
      return {
        label: "Suppress Aggressive Yaw",
        copy: "Side-view yaw was softened to protect landmark stability.",
        tone: "warn"
      };
    case "lock_mouth_preset":
      return {
        label: "Lock Mouth Preset",
        copy: "The mouth preset was locked because lip or muzzle anchors were unstable.",
        tone: "warn"
      };
    case "manual_compare":
      return {
        label: "Manual Compare",
        copy: "A person should compare candidates before building or approving the pack.",
        tone: "warn"
      };
    case "recreate":
      return {
        label: "Recreate Pack",
        copy: "A full pack recreate is safer than approving the current selection.",
        tone: "bad"
      };
    default:
      return {
        label: humanizeToken(reasonCode),
        copy: `Runtime fallback flag: ${reasonCode}`,
        tone: "muted"
      };
  }
}

function summarizeRigFallbackReasonCodes(reasonCodes: string[] | undefined): string {
  const labels = dedupeStrings((reasonCodes ?? []).map((reasonCode) => describeRigFallbackReason(reasonCode).label));
  return labels.length > 0 ? labels.join(" / ") : "none";
}

function summarizeRigSeverity(
  rigStability: GenerationManifestRigStability | null | undefined
): { title: string; copy: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (!rigStability || rigStability.severity === "none") {
    return {
      title: "Rig clear",
      copy: "No rig block or review-only pressure was recorded for the current run.",
      tone: "ok"
    };
  }
  if (rigStability.severity === "block") {
    return {
      title: "Rig block",
      copy:
        "One or more views are unstable enough that regenerate or recreate should happen before approval.",
      tone: "bad"
    };
  }
  if (rigStability.reviewOnly) {
    return {
      title: "Rig review only",
      copy: "Manual compare is required, but the run is not yet forcing a full recreate.",
      tone: "warn"
    };
  }
  return {
    title: "Rig warning",
    copy: "Rig signals are present and should be reviewed before approval.",
    tone: "warn"
  };
}

function summarizeRigViewState(
  view: CharacterGenerationView,
  rigStability: GenerationManifestRigStability | null | undefined
): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  if (rigStability?.blockingViews?.includes(view)) {
    return { label: "block", tone: "bad" };
  }
  if (rigStability?.warningViews?.includes(view)) {
    return { label: "review", tone: "warn" };
  }
  if (!rigStability || rigStability.severity === "none") {
    return { label: "clear", tone: "ok" };
  }
  return { label: "observe", tone: "muted" };
}

function formatSignedMetric(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    if (value === null) {
      return "null";
    }
    return "-";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function summarizeRigReasonFamilies(reasonCodes: string[] | undefined): string {
  const families = dedupeStrings(
    (reasonCodes ?? [])
      .map((reasonCode) => {
        const normalized = String(reasonCode || "").trim().toLowerCase();
        if (!normalized) {
          return "";
        }
        if (normalized.includes("anchor")) {
          return "anchor";
        }
        if (normalized.includes("landmark")) {
          return "landmark";
        }
        if (normalized.includes("yaw")) {
          return "yaw";
        }
        if (normalized.includes("review")) {
          return "review";
        }
        if (normalized.includes("recreate")) {
          return "recreate";
        }
        if (normalized.includes("compare")) {
          return "compare";
        }
        if (normalized.includes("front")) {
          return "front";
        }
        return normalized.includes(":") ? normalized.slice(0, normalized.indexOf(":")) : normalized;
      })
      .filter((value) => value.length > 0)
      .map((value) => humanizeToken(value))
  );
  return families.length > 0 ? families.join(" / ") : "none";
}

function summarizeAnchorDiagnosisForView(
  rigSummary: CharacterPackLineageRigSummary | null | undefined,
  view: CharacterGenerationView
): string {
  const byView = rigSummary?.byView?.[view];
  if (!rigSummary || !byView) {
    return "pack anchor evidence not materialized";
  }
  const present = byView.presentAnchorIds.length > 0 ? `${byView.presentAnchorIds.length} present` : "0 present";
  const missing = byView.missingAnchorIds.length > 0 ? `${byView.missingAnchorIds.length} missing` : "0 missing";
  const note = byView.notes ? ` / ${byView.notes}` : "";
  return `${present} / ${missing}${note}`;
}

function summarizeRepairTriageDecision(
  triage: GenerationManifestStageRepairTriageDecision | undefined
): string {
  if (!triage) {
    return "-";
  }
  const familySummary = triage.repairFamilies?.length ? `{${triage.repairFamilies.join("+")}}` : "";
  const scoreSummary = typeof triage.score === "number" ? ` score=${triage.score.toFixed(2)}` : "";
  const consistencySummary =
    typeof triage.consistencyScore === "number"
      ? ` consistency=${triage.consistencyScore.toFixed(2)}`
      : triage.consistencyScore === null
        ? " consistency=null"
        : "";
  const sourceSummary = triage.sourceCandidateId ? ` from ${triage.sourceCandidateId}` : "";
  return `${triage.decision}${triage.priority ? `:${triage.priority}` : ""}${sourceSummary}${scoreSummary}${consistencySummary}${familySummary}`.trim();
}

function summarizeRepairAcceptanceDecision(
  acceptance: GenerationManifestStageRepairAcceptanceDecision | undefined
): string {
  if (!acceptance) {
    return "-";
  }
  const chosen = acceptance.chosenCandidateId ? ` chosen=${acceptance.chosenCandidateId}` : "";
  const scoreDelta = typeof acceptance.scoreDeltaVsPreRepair === "number" ? ` score${formatSignedMetric(acceptance.scoreDeltaVsPreRepair)}` : "";
  const consistencyDelta =
    typeof acceptance.consistencyDeltaVsPreRepair === "number"
      ? ` consistency${formatSignedMetric(acceptance.consistencyDeltaVsPreRepair)}`
      : acceptance.consistencyDeltaVsPreRepair === null
        ? " consistency=null"
        : "";
  const familySummary =
    acceptance.introducedCriticalFamilies?.length ? ` critical={${acceptance.introducedCriticalFamilies.join("+")}}` : "";
  return `${acceptance.decision}${chosen}${scoreDelta}${consistencyDelta}${familySummary}`.trim();
}

function summarizeWorkflowStages(stages: GenerationManifestWorkflowStage[] | undefined): string {
  if (!Array.isArray(stages) || stages.length === 0) {
    return "-";
  }
  return stages
    .map((stage) => {
      const variant = [stage.origin, stage.passLabel].filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
      const exitSummary =
        (stage.passedViews?.length ?? 0) > 0 || (stage.failedViews?.length ?? 0) > 0
          ? ` p${stage.passedViews?.length ?? 0}/f${stage.failedViews?.length ?? 0}`
          : "";
      return `${stage.stage}${variant.length > 0 ? `@${variant.join("/")}` : ""}[${stage.views.join("+") || "-"}]x${stage.roundsAttempted}${exitSummary}`;
    })
    .join(" -> ");
}

function shortView(view: CharacterGenerationView): string {
  return view === "front" ? "f" : view === "threeQuarter" ? "t" : "p";
}

function compactModeToken(mode: string | undefined): string {
  if (!mode) {
    return "-";
  }
  if (mode === "checkpoint-ultra-pose") {
    return "up";
  }
  if (mode === "checkpoint-ultra-repair") {
    return "ur";
  }
  if (mode === "checkpoint-ultra") {
    return "u";
  }
  if (mode === "checkpoint-ipadapter-openpose") {
    return "cp";
  }
  if (mode === "checkpoint") {
    return "c";
  }
  if (mode === "flux2") {
    return "f";
  }
  return mode;
}

function compactStructureKind(kind: string): string {
  if (kind === "lineart") {
    return "l";
  }
  if (kind === "canny") {
    return "c";
  }
  if (kind === "depth") {
    return "d";
  }
  return kind;
}

function summarizeStagePreflightByView(
  preflightByView: Partial<Record<CharacterGenerationView, GenerationManifestStageInputPreflightViewDiagnostics>> | undefined
): string {
  if (!preflightByView) {
    return "-";
  }

  const entries = (["front", "threeQuarter", "profile"] as const)
    .filter((view) => preflightByView[view])
    .map((view) => {
      const diagnostics = preflightByView[view];
      const detail =
        diagnostics?.missingStructureKinds?.slice(0, 2).map((entry) => compactStructureKind(entry)).join("+") ||
        diagnostics?.missingReferenceRoles?.slice(0, 1).join("+") ||
        diagnostics?.invalidStructureSourceKinds?.slice(0, 2).map((entry) => compactStructureKind(entry)).join("+") ||
        diagnostics?.reasonCodes?.[0] ||
        "";
      return `${shortView(view)}=${diagnostics?.status ?? "unknown"}${detail ? `:${detail}` : ""}`;
    });
  return entries.length > 0 ? entries.join(" / ") : "-";
}

function extractWorkflowRuntimeSnapshot(
  value: unknown
): Omit<GenerationManifestSelectedWorkflowRuntime, "view" | "candidateId" | "compact"> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const structureControlDiagnostics = parseWorkflowStructureControlDiagnostics(value.structureControlDiagnostics);
  const preflightDiagnostics = parseWorkflowPreflightDiagnostics(value.preflightDiagnostics);
  const routeDecision = parseWorkflowRouteDecision(value.routeDecision);
  const warnings = parseStringArray(value.warnings);

  const out: Omit<GenerationManifestSelectedWorkflowRuntime, "view" | "candidateId" | "compact"> = {
    ...(typeof value.mode === "string" && value.mode.trim().length > 0 ? { mode: value.mode.trim() } : {}),
    ...(typeof value.workflowStage === "string" && value.workflowStage.trim().length > 0
      ? { workflowStage: value.workflowStage.trim() }
      : {}),
    ...(typeof value.workflowTemplateVersion === "string" && value.workflowTemplateVersion.trim().length > 0
      ? { workflowTemplateVersion: value.workflowTemplateVersion.trim() }
      : {}),
    ...(typeof value.referenceMode === "string" && value.referenceMode.trim().length > 0
      ? { referenceMode: value.referenceMode.trim() }
      : {}),
    ...(typeof value.referenceApplied === "boolean" ? { referenceApplied: value.referenceApplied } : {}),
    ...(typeof value.poseApplied === "boolean" ? { poseApplied: value.poseApplied } : {}),
    ...(typeof value.repairMaskApplied === "boolean" ? { repairMaskApplied: value.repairMaskApplied } : {}),
    ...(typeof value.repairMaskSource === "string" && value.repairMaskSource.trim().length > 0
      ? { repairMaskSource: value.repairMaskSource.trim() }
      : {}),
    ...(typeof value.structureControlApplied === "boolean"
      ? { structureControlApplied: value.structureControlApplied }
      : {}),
    ...(Array.isArray(value.structureControlsApplied)
      ? {
          structureControlsApplied: value.structureControlsApplied.filter(
            (item): item is string => typeof item === "string"
          )
        }
      : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(structureControlDiagnostics ? { structureControlDiagnostics } : {}),
    ...(preflightDiagnostics ? { preflightDiagnostics } : {}),
    ...(routeDecision ? { routeDecision } : {})
  };

  return Object.keys(out).length > 0 ? out : undefined;
}

function readWorkflowRuntimeSummary(
  summaryPath: string | undefined
): Omit<GenerationManifestSelectedWorkflowRuntime, "view" | "candidateId" | "compact"> | undefined {
  if (!summaryPath || !fs.existsSync(summaryPath)) {
    return undefined;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as unknown;
    return extractWorkflowRuntimeSnapshot(raw);
  } catch {
    return undefined;
  }
}

function summarizeWorkflowRuntimeCompact(
  snapshot: Omit<GenerationManifestSelectedWorkflowRuntime, "view" | "candidateId" | "compact">
): string {
  const selectedMode = snapshot.routeDecision?.selectedMode ?? snapshot.mode;
  const preflightState = snapshot.preflightDiagnostics
    ? snapshot.preflightDiagnostics.ok
      ? snapshot.preflightDiagnostics.warnings.length > 0
        ? `warn${snapshot.preflightDiagnostics.warnings.length}`
        : "ok"
      : `warn${Math.max(1, snapshot.preflightDiagnostics.warnings.length)}`
    : "-";
  const appliedKinds =
    snapshot.structureControlDiagnostics?.appliedKinds ?? snapshot.structureControlsApplied ?? [];
  const missingKinds = snapshot.structureControlDiagnostics?.missingRequiredKinds ?? [];
  const structureToken =
    appliedKinds.length > 0
      ? appliedKinds.map((entry) => compactStructureKind(entry)).join("+")
      : snapshot.structureControlApplied
        ? "on"
        : "-";
  const structureSummary =
    missingKinds.length > 0
      ? `${structureToken}!${missingKinds.map((entry) => compactStructureKind(entry)).join("+")}`
      : structureToken;
  const repairMask = snapshot.repairMaskApplied ? snapshot.repairMaskSource ?? "mask" : "-";
  const warningCount = snapshot.warnings?.length ?? 0;
  return `${compactModeToken(selectedMode)} / pf=${preflightState} / sc=${structureSummary} / rm=${repairMask} / fb=${snapshot.routeDecision?.fallbackUsed ? "yes" : "no"} / w=${warningCount}`;
}

function summarizeWorkflowRuntimeInputs(
  snapshot: Omit<GenerationManifestSelectedWorkflowRuntime, "view" | "candidateId" | "compact">
): string {
  return `ref=${snapshot.referenceMode ?? "-"}:${snapshot.referenceApplied === true ? "on" : snapshot.referenceApplied === false ? "off" : "-"} / pose=${snapshot.poseApplied === true ? "on" : snapshot.poseApplied === false ? "off" : "-"} / repair=${snapshot.repairMaskApplied === true ? snapshot.repairMaskSource ?? "mask" : "-"}`;
}

function summarizeWorkflowRuntimeStructure(
  snapshot: Omit<GenerationManifestSelectedWorkflowRuntime, "view" | "candidateId" | "compact">
): string {
  const diagnostics = snapshot.structureControlDiagnostics;
  const applied = diagnostics?.appliedKinds ?? snapshot.structureControlsApplied ?? [];
  const missing = diagnostics?.missingRequiredKinds ?? [];
  const roles = diagnostics?.sourceRolesByKind
    ? Object.entries(diagnostics.sourceRolesByKind)
        .map(([kind, roleList]) => `${compactStructureKind(kind)}:${roleList.slice(0, 2).join("+")}`)
        .join(" / ")
    : "";
  return `applied=${applied.map((entry) => compactStructureKind(entry)).join("+") || "none"} / missing=${missing.map((entry) => compactStructureKind(entry)).join("+") || "none"} / src=${roles || "-"}`;
}

function summarizeWorkflowRuntimePreflight(
  snapshot: Omit<GenerationManifestSelectedWorkflowRuntime, "view" | "candidateId" | "compact">
): string {
  const diagnostics = snapshot.preflightDiagnostics;
  if (!diagnostics) {
    return "-";
  }
  return `${diagnostics.ok ? "ok" : "warn"} / refs=${diagnostics.requiredReferenceRoles?.join("+") || "none"} / struct=${diagnostics.requiredStructureControlKinds?.map((entry) => compactStructureKind(entry)).join("+") || "none"} / approved=${diagnostics.approvedViews?.map((entry) => shortView(entry)).join(",") || "all"} / warnings=${diagnostics.warnings.length}`;
}

function resolveSelectedWorkflowRuntimeDiagnostics(
  manifest: GenerationManifest | null
): GenerationManifestSelectedWorkflowRuntime[] {
  if (!manifest) {
    return [];
  }

  const out: GenerationManifestSelectedWorkflowRuntime[] = [];
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const selected = manifest.selectedByView?.[view];
    if (!selected?.candidateId) {
      continue;
    }
    const candidate = manifest.candidates.find((entry) => entry.id === selected.candidateId && entry.view === view);
    if (!candidate) {
      continue;
    }
    const inline = extractWorkflowRuntimeSnapshot(candidate.providerMeta);
    const summary = readWorkflowRuntimeSummary(candidate.providerMeta?.workflowFiles?.summaryPath);
    const merged = {
      ...(summary ?? {}),
      ...(inline ?? {})
    };
    if (Object.keys(merged).length === 0) {
      continue;
    }
    out.push({
      view,
      candidateId: candidate.id,
      ...merged,
      compact: summarizeWorkflowRuntimeCompact(merged)
    });
  }
  return out;
}

function summarizeSelectedWorkflowRuntimeDiagnostics(
  entries: GenerationManifestSelectedWorkflowRuntime[]
): string {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "-";
  }
  return entries.map((entry) => `${shortView(entry.view)}:${compactModeToken(entry.routeDecision?.selectedMode ?? entry.mode)}`).join(" / ");
}

function recommendedActionPriorityRank(priority: CharacterGenerationRecommendedAction["priority"]): number {
  if (priority === "high") {
    return 3;
  }
  if (priority === "medium") {
    return 2;
  }
  return 1;
}

function findLatestDirectiveProfileForView(
  stages: GenerationManifestWorkflowStage[],
  view: CharacterGenerationView
): {
  stage?: GenerationManifestWorkflowStage;
  directive?: GenerationManifestRepairDirectiveProfileSummary;
} {
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    const stage = stages[index];
    const directive = stage.directiveProfilesByView?.[view];
    if (directive) {
      return { stage, directive };
    }
  }
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    const stage = stages[index];
    if (stage.views.includes(view)) {
      return { stage };
    }
  }
  return {};
}

function findLatestRepairTriageForView(
  stages: GenerationManifestWorkflowStage[],
  view: CharacterGenerationView
): {
  stage?: GenerationManifestWorkflowStage;
  triage?: GenerationManifestStageRepairTriageDecision;
} {
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    const stage = stages[index];
    const triage = stage.repairTriageByView?.[view];
    if (triage) {
      return { stage, triage };
    }
  }
  return {};
}

function findLatestGateDecisionForView(
  stages: GenerationManifestWorkflowStage[],
  view: CharacterGenerationView
): {
  stage?: GenerationManifestWorkflowStage;
  gate?: GenerationManifestStageGateDecision;
} {
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    const stage = stages[index];
    const gate = stage.gateDecisionsByView?.[view];
    if (gate) {
      return { stage, gate };
    }
  }
  return {};
}

function findLatestRepairAcceptanceForView(
  stages: GenerationManifestWorkflowStage[],
  view: CharacterGenerationView
): {
  stage?: GenerationManifestWorkflowStage;
  acceptance?: GenerationManifestStageRepairAcceptanceDecision;
} {
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    const stage = stages[index];
    const acceptance = stage.repairAcceptanceByView?.[view];
    if (acceptance) {
      return { stage, acceptance };
    }
  }
  return {};
}

function summarizeRuntimeDecisionReasons(reasonCodes: string[] | undefined): string {
  if (!Array.isArray(reasonCodes) || reasonCodes.length === 0) {
    return "";
  }

  const runtimeTokens = dedupeStrings(
    reasonCodes
      .map((reason) => {
        const normalized = String(reason || "").trim();
        if (!normalized.includes("runtime")) {
          return "";
        }
        const suffix = normalized.includes(":")
          ? normalized.slice(normalized.lastIndexOf(":") + 1)
          : normalized;
        switch (suffix) {
          case "runtime_preflight_block":
            return "pf";
          case "runtime_required_structure_missing":
            return "st";
          case "runtime_only_candidate_unsafe":
            return "unsafe";
          case "runtime_fallback_regressed":
            return "fb";
          case "runtime_route_regressed":
            return "rt";
          case "runtime_structure_regressed":
            return "ss";
          case "runtime_penalty_regressed":
            return "pen";
          case "runtime_preflight_regressed":
            return "pw";
          case "runtime_warning_regressed":
            return "aw";
          default:
            return suffix.startsWith("runtime_") ? suffix.replace(/^runtime_/, "") : "";
        }
      })
      .filter((entry) => entry.length > 0)
  );

  return runtimeTokens.length > 0 ? `rt=${runtimeTokens.join("+")}` : "";
}

function buildRecommendedActions(manifest: GenerationManifest | null): CharacterGenerationRecommendedAction[] {
  if (!manifest) {
    return [];
  }

  const packCoherence = manifest.packCoherence ?? manifest.providerMeta?.selectionDiagnostics?.packCoherence;
  const autoReroute = manifest.autoReroute ?? manifest.providerMeta?.selectionDiagnostics?.autoReroute;
  const rigStability = manifest.providerMeta?.selectionDiagnostics?.rigStability;
  const selectionRisk = manifest.providerMeta?.selectionDiagnostics?.selectionRisk;
  const qualityEmbargo = manifest.providerMeta?.selectionDiagnostics?.qualityEmbargo;
  const packDefectSummary = manifest.providerMeta?.selectionDiagnostics?.packDefectSummary;
  const finalQualityFirewall = manifest.providerMeta?.selectionDiagnostics?.finalQualityFirewall;
  const workflowStages = manifest.workflowStages ?? manifest.providerMeta?.selectionDiagnostics?.workflowStages ?? [];
  const continuity = manifest.reference?.continuity;
  const finalSelectionSource = manifest.providerMeta?.selectionDiagnostics?.finalSelectionSource;
  const autoRerouteFailed = autoReroute?.attempted === true && autoReroute.recovered === false;
  const autoRerouteRecovered = autoReroute?.attempted === true && autoReroute.recovered === true;
  const rigReviewOnly = rigStability?.reviewOnly === true;
  const rigBlocked = rigStability?.severity === "block";
  const highRiskAutoSelection = selectionRisk?.level === "review" || selectionRisk?.level === "block";
  const embargoedSelection = qualityEmbargo?.level === "review" || qualityEmbargo?.level === "block";
  const firewalledSelection = finalQualityFirewall?.level === "review" || finalQualityFirewall?.level === "block";
  const seen = new Set<string>();
  const actions: CharacterGenerationRecommendedAction[] = [];
  const addAction = (action: CharacterGenerationRecommendedAction): void => {
    if (seen.has(action.id)) {
      return;
    }
    seen.add(action.id);
    actions.push(action);
  };
  const pushRegenerateAction = (
    view: CharacterGenerationView,
    priority: CharacterGenerationRecommendedAction["priority"],
    mode: "blocking" | "warning"
  ): void => {
    const latestDirective = findLatestDirectiveProfileForView(workflowStages, view);
    const latestTriage = findLatestRepairTriageForView(workflowStages, view);
    const latestRepairAcceptance = findLatestRepairAcceptanceForView(workflowStages, view);
    const directive = latestDirective.directive;
    const directiveFamilies = directive?.families ?? [];
    const triageFamilies = latestTriage.triage?.repairFamilies ?? [];
    const candidateBase = manifest.selectionHints?.repairCandidateCount ?? (mode === "blocking" ? 4 : 3);
    const candidateCount = Math.min(
      8,
      Math.max(
        mode === "blocking" ? 4 : 3,
        candidateBase +
          (directive?.candidateCountBoost ?? 0) +
          (latestTriage.triage?.priority === "high" ? 1 : 0)
      )
    );
    const boostNegativePrompt = directiveFamilies.some(
      (family) => family === "style_cleanup" || family === "paw_cleanup"
    ) || triageFamilies.some((family) => family === "style_cleanup" || family === "paw_cleanup");
    const regenerateSameSeed = !(
      directive?.severity === "high" ||
      latestTriage.triage?.priority === "high" ||
      latestTriage.triage?.decision === "reject_view"
    ) && !(view === "front" && mode === "blocking");
    const priorSeed = manifest.candidates.find((candidate) => candidate.view === view)?.seed ?? DEFAULT_GENERATION_SEED;
    const directiveSummary =
      directive && directiveFamilies.length > 0
        ? ` Directive=${directive.severity}:${directiveFamilies.join("+")}.`
        : latestDirective.stage
          ? ` Last stage=${latestDirective.stage.stage}.`
          : "";
    const triageSummary =
      latestTriage.triage
        ? ` Triage=${latestTriage.triage.decision}${
            latestTriage.triage.priority ? `:${latestTriage.triage.priority}` : ""
          }${
            triageFamilies.length > 0 ? `(${triageFamilies.join("+")})` : ""
          }${latestTriage.stage ? ` from ${latestTriage.stage.stage}` : ""}.`
        : "";
    const repairAcceptanceSummary =
      latestRepairAcceptance.acceptance
        ? ` RepairAccept=${latestRepairAcceptance.acceptance.decision}${
            latestRepairAcceptance.acceptance.chosenStage
              ? `:${latestRepairAcceptance.acceptance.chosenStage}`
              : ""
          }${latestRepairAcceptance.stage ? ` from ${latestRepairAcceptance.stage.stage}` : ""}.`
        : "";
    const repairAcceptanceLead =
      latestRepairAcceptance.acceptance?.decision === "reject_repair"
        ? `Repair pass regressed ${view} and was rejected. `
        : latestRepairAcceptance.acceptance?.decision === "keep_pre_repair"
          ? `Repair pass failed to beat the pre-repair ${view} candidate. `
          : latestRepairAcceptance.acceptance?.decision === "missing_repair_candidate"
            ? `Repair pass produced no usable ${view} candidate. `
            : "";
    const rerouteSummary = autoReroute?.attempted
      ? ` Auto-reroute ${autoRerouteRecovered ? "already recovered part of the pack" : "already tried a recovery pass"}${autoReroute.strategy ? ` via ${autoReroute.strategy}` : ""}.`
      : "";
    addAction({
      id: `regenerate-${view}`,
      action: "regenerate-view",
      label: `Candidate set / regenerate ${view}`,
      description: `${repairAcceptanceLead}${mode === "blocking" ? "Coherence is blocked on this view." : "This view is weakening the pack."} Re-run the ${view} candidate set with ${candidateCount} candidates using ${regenerateSameSeed ? "the same seed" : "a new seed"}.${directiveSummary}${triageSummary}${repairAcceptanceSummary}${rerouteSummary}`,
      priority,
      view,
      candidateCount,
      seed: regenerateSameSeed ? priorSeed : priorSeed + 1,
      regenerateSameSeed,
      boostNegativePrompt,
      reasonCodes: [
        `coherence:${packCoherence?.severity ?? "none"}`,
        mode === "blocking" ? "blocking-view" : "warning-view",
        ...(autoReroute?.attempted ? [`auto-reroute:${autoReroute.recovered ? "recovered" : "failed"}`] : []),
        ...(selectionRisk?.level && selectionRisk.level !== "none" ? [`selection-risk:${selectionRisk.level}`] : []),
        ...(qualityEmbargo?.level && qualityEmbargo.level !== "none" ? [`quality-embargo:${qualityEmbargo.level}`] : []),
        ...(directive ? [`directive:${directive.severity}`] : []),
        ...(latestTriage.triage ? [`triage:${latestTriage.triage.decision}`] : []),
        ...(latestTriage.triage?.priority ? [`triage-priority:${latestTriage.triage.priority}`] : []),
        ...(latestRepairAcceptance.acceptance
          ? [`repair-accept:${latestRepairAcceptance.acceptance.decision}`]
          : []),
        ...directiveFamilies.map((family) => `family:${family}`),
        ...triageFamilies.map((family) => `triage-family:${family}`)
      ]
    });
  };

  for (const view of packCoherence?.blockingViews ?? []) {
    pushRegenerateAction(view, "high", "blocking");
  }
  for (const view of packCoherence?.warningViews ?? []) {
    pushRegenerateAction(view, packCoherence?.severity === "block" ? "high" : "medium", "warning");
  }
  for (const view of finalQualityFirewall?.blockingViews ?? []) {
    pushRegenerateAction(view, "high", "blocking");
  }
  for (const view of finalQualityFirewall?.warningViews ?? []) {
    pushRegenerateAction(view, finalQualityFirewall?.level === "block" ? "high" : "medium", "warning");
  }
  for (const view of rigStability?.blockingViews ?? []) {
    pushRegenerateAction(view, "high", "blocking");
  }
  for (const view of rigStability?.warningViews ?? []) {
    pushRegenerateAction(view, rigBlocked ? "high" : "medium", "warning");
  }
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const triage = findLatestRepairTriageForView(workflowStages, view).triage;
    if (!triage) {
      continue;
    }
    if (triage.decision === "reject_view") {
      pushRegenerateAction(view, "high", "blocking");
      continue;
    }
    if (triage.decision === "full_repair") {
      pushRegenerateAction(view, "medium", "warning");
    }
  }
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const acceptance = findLatestRepairAcceptanceForView(workflowStages, view).acceptance;
    if (!acceptance) {
      continue;
    }
    if (acceptance.decision === "reject_repair") {
      pushRegenerateAction(view, "high", "blocking");
      continue;
    }
    if (acceptance.decision === "keep_pre_repair") {
      pushRegenerateAction(view, "medium", "warning");
    }
  }

  const frontBlocked = packCoherence?.blockingViews.includes("front") ?? false;
  const frontFirewalled = finalQualityFirewall?.blockingViews?.includes("front") ?? false;
  const multiBlock = (packCoherence?.blockingViews.length ?? 0) >= 2;
  const multiFirewallBlock = (finalQualityFirewall?.blockingViews?.length ?? 0) >= 2;
  const packBlocked = packCoherence?.severity === "block";
  const firewallBlocked = finalQualityFirewall?.level === "block";
  const triageDecisionByView = Object.fromEntries(
    (["front", "threeQuarter", "profile"] as const).map((view) => [view, findLatestRepairTriageForView(workflowStages, view).triage])
  ) as Partial<Record<CharacterGenerationView, GenerationManifestStageRepairTriageDecision>>;
  const repairAcceptanceByView = Object.fromEntries(
    (["front", "threeQuarter", "profile"] as const).map((view) => [view, findLatestRepairAcceptanceForView(workflowStages, view).acceptance])
  ) as Partial<Record<CharacterGenerationView, GenerationManifestStageRepairAcceptanceDecision>>;
  const triageFullRepairCount = Object.values(triageDecisionByView).filter((triage) => triage?.decision === "full_repair").length;
  const triageRejectCount = Object.values(triageDecisionByView).filter((triage) => triage?.decision === "reject_view").length;
  const repairRejectCount = Object.values(repairAcceptanceByView).filter((acceptance) => acceptance?.decision === "reject_repair").length;
  const frontRepairKeptPre = repairAcceptanceByView.front?.decision === "keep_pre_repair";
  const weakContinuity = continuity ? continuity.attempted && !continuity.applied : false;
  const shouldRecreate =
    packBlocked ||
    multiBlock ||
    frontBlocked ||
    rigBlocked ||
    firewallBlocked ||
    multiFirewallBlock ||
    frontFirewalled ||
    weakContinuity ||
    autoRerouteFailed ||
    triageFullRepairCount >= 2 ||
    triageRejectCount >= 2 ||
    repairRejectCount >= 2 ||
    (frontRepairKeptPre &&
      (frontBlocked ||
        frontFirewalled ||
        packBlocked ||
        firewallBlocked)) ||
    selectionRisk?.suggestedAction === "recreate" ||
    rigStability?.suggestedAction === "recreate" ||
    qualityEmbargo?.suggestedAction === "recreate" ||
    qualityEmbargo?.level === "block" ||
    finalQualityFirewall?.suggestedAction === "recreate";
  if (shouldRecreate) {
    const previousSeed = manifest.candidates[0]?.seed ?? DEFAULT_GENERATION_SEED;
    const recreateCandidateCount = Math.min(
      8,
      Math.max(
        manifest.selectionHints?.frontMasterCandidateCount ?? 4,
        manifest.selectionHints?.repairCandidateCount ?? 4,
        multiBlock || frontBlocked ? 6 : 5
      )
    );
    const boostNegativePrompt = workflowStages.some((stage) =>
      (["front", "threeQuarter", "profile"] as const).some((view) =>
        stage.directiveProfilesByView?.[view]?.families.some(
          (family: string) => family === "style_cleanup" || family === "paw_cleanup"
        ) ?? false
      )
    );
    const regenerateSameSeed = !frontBlocked && !weakContinuity;
    const reasons = [
      ...(packCoherence ? [`coherence:${packCoherence.severity}`] : []),
      ...(rigStability ? [`rig-stability:${rigStability.severity}`] : []),
      ...(multiBlock ? ["multi-block"] : []),
      ...(frontBlocked ? ["front-anchor-blocked"] : []),
      ...(finalQualityFirewall ? [`final-firewall:${finalQualityFirewall.level}`] : []),
      ...(multiFirewallBlock ? ["multi-firewall-block"] : []),
      ...(frontFirewalled ? ["front-firewall-blocked"] : []),
      ...(weakContinuity ? ["continuity-not-applied"] : [])
        .concat(frontRepairKeptPre ? ["front-repair-kept-pre"] : [])
    ];
    addAction({
      id: "recreate-pack",
      action: "recreate",
      label: "Character Pack / recreate",
      description: `Run a fresh Character Pack recreate pass with ${recreateCandidateCount} candidates${regenerateSameSeed ? " on the same seed" : " on a new seed"} to rebuild the front anchor and all linked angles.${autoRerouteFailed ? " Auto-reroute already failed once, so this is the safest reset." : ""}${rigStability?.suggestedAction === "recreate" ? ` Rig stability marked this pack as ${rigStability.severity}.` : ""}${selectionRisk?.suggestedAction === "recreate" ? ` Selection gate marked this pack as ${selectionRisk.level}.` : ""}${qualityEmbargo?.suggestedAction === "recreate" ? ` Quality embargo marked this pack as ${qualityEmbargo.level}.` : ""}${finalQualityFirewall?.suggestedAction === "recreate" ? ` Final quality firewall marked this pack as ${finalQualityFirewall.level}.` : ""}${packDefectSummary?.repeatedFamilies.length ? ` Repeated defects=${packDefectSummary.repeatedFamilies.slice(0, 3).join("+")}.` : ""}`,
      priority:
        frontBlocked ||
        multiBlock ||
        rigBlocked ||
        frontFirewalled ||
        multiFirewallBlock ||
        autoRerouteFailed ||
        selectionRisk?.level === "block" ||
        qualityEmbargo?.level === "block" ||
        finalQualityFirewall?.level === "block"
          ? "high"
          : "medium",
      candidateCount: recreateCandidateCount,
      seed: regenerateSameSeed ? previousSeed : previousSeed + 1,
      regenerateSameSeed,
      boostNegativePrompt,
      reasonCodes: reasons
        .concat(autoReroute?.attempted ? [`auto-reroute:${autoReroute.recovered ? "recovered" : "failed"}`] : [])
        .concat(triageFullRepairCount >= 2 ? [`triage:full_repair_x${triageFullRepairCount}`] : [])
        .concat(triageRejectCount >= 2 ? [`triage:reject_view_x${triageRejectCount}`] : [])
        .concat(repairRejectCount >= 2 ? [`repair-accept:reject_repair_x${repairRejectCount}`] : [])
        .concat(rigStability?.severity && rigStability.severity !== "none" ? [`rig-stability:${rigStability.severity}`] : [])
        .concat(selectionRisk?.level && selectionRisk.level !== "none" ? [`selection-risk:${selectionRisk.level}`] : [])
        .concat(qualityEmbargo?.level && qualityEmbargo.level !== "none" ? [`quality-embargo:${qualityEmbargo.level}`] : [])
        .concat(finalQualityFirewall?.level && finalQualityFirewall.level !== "none" ? [`final-firewall:${finalQualityFirewall.level}`] : [])
    });
  }

  const hasCandidateCoverage = (["front", "threeQuarter", "profile"] as const).every((view) =>
    manifest.candidates.some((candidate) => candidate.view === view)
  );
  if (
    hasCandidateCoverage &&
    (
      manifest.status === "PENDING_HITL" ||
      rigReviewOnly ||
      packCoherence?.severity === "review" ||
      highRiskAutoSelection ||
      embargoedSelection ||
      firewalledSelection ||
      finalSelectionSource !== "hitl"
    )
  ) {
    addAction({
      id: "pick-manually",
      action: "pick-manually",
      label: "Candidate set / manual compare",
      description:
        manifest.status === "PENDING_HITL"
          ? `Open the HITL compare surface and choose a tighter front/threeQuarter/profile combination for the Character Pack handoff.${autoReroute?.attempted ? ` Auto-reroute ${autoReroute.recovered ? "already recovered the pack once" : "already tried a recovery pass"} first.` : ""}${rigReviewOnly ? ` Rig stability requests review-only handling (${rigStability?.summary}).` : ""}${highRiskAutoSelection ? ` Selection gate marked this pack as ${selectionRisk?.level}.` : ""}${qualityEmbargo?.level && qualityEmbargo.level !== "none" ? ` Quality embargo marked this pack as ${qualityEmbargo.level}.` : ""}${finalQualityFirewall?.level && finalQualityFirewall.level !== "none" ? ` Final quality firewall marked this pack as ${finalQualityFirewall.level}.` : ""}${packDefectSummary?.repeatedFamilies.length ? ` Repeated defects=${packDefectSummary.repeatedFamilies.slice(0, 3).join("+")}.` : ""}`
          : `Manual compare is recommended before building the Character Pack.${autoRerouteRecovered ? " Auto-reroute recovered the pack, but a human pass is still useful." : ""}${rigReviewOnly ? ` Rig stability requests review-only handling (${rigStability?.summary}).` : ""}${highRiskAutoSelection ? ` Selection gate marked this pack as ${selectionRisk?.level}.` : ""}${qualityEmbargo?.level && qualityEmbargo.level !== "none" ? ` Quality embargo marked this pack as ${qualityEmbargo.level}.` : ""}${finalQualityFirewall?.level && finalQualityFirewall.level !== "none" ? ` Final quality firewall marked this pack as ${finalQualityFirewall.level}.` : ""}${packDefectSummary?.repeatedFamilies.length ? ` Repeated defects=${packDefectSummary.repeatedFamilies.slice(0, 3).join("+")}.` : ""}`,
      priority: manifest.status === "PENDING_HITL" ? "high" : "medium",
      anchorId: "pick-candidates",
      reasonCodes: [
        `manifest:${manifest.status}`,
        ...(packCoherence ? [`coherence:${packCoherence.severity}`] : []),
        ...(rigStability ? [`rig-stability:${rigStability.severity}`] : []),
        ...(finalSelectionSource ? [`selection:${finalSelectionSource}`] : []),
        ...(autoReroute?.attempted ? [`auto-reroute:${autoReroute.recovered ? "recovered" : "failed"}`] : []),
        ...(selectionRisk?.level && selectionRisk.level !== "none" ? [`selection-risk:${selectionRisk.level}`] : []),
        ...(qualityEmbargo?.level && qualityEmbargo.level !== "none" ? [`quality-embargo:${qualityEmbargo.level}`] : []),
        ...(finalQualityFirewall?.level && finalQualityFirewall.level !== "none" ? [`final-firewall:${finalQualityFirewall.level}`] : []),
        ...((packDefectSummary?.repeatedFamilies ?? []).slice(0, 3).map((family) => `repeated-defect:${family}`))
      ]
    });
  }

  return actions.sort((left, right) => {
    const priorityDelta = recommendedActionPriorityRank(right.priority) - recommendedActionPriorityRank(left.priority);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return left.label.localeCompare(right.label);
  });
}


function parseAssetIdsFromBody(body: JsonRecord): CharacterAssetIds {
  const nested = isRecord(body.assetIds) ? body.assetIds : undefined;

  const front =
    optionalString(body, "front") ??
    optionalString(body, "frontAssetId") ??
    (nested ? optionalString(nested, "front") : undefined);

  const threeQuarter =
    optionalString(body, "threeQuarter") ??
    optionalString(body, "threeQuarterAssetId") ??
    optionalString(body, "three_quarter") ??
    (nested ? optionalString(nested, "threeQuarter") : undefined);

  const profile =
    optionalString(body, "profile") ??
    optionalString(body, "profileAssetId") ??
    (nested ? optionalString(nested, "profile") : undefined);

  if (!front || !threeQuarter || !profile) {
    throw createHttpError(400, "assetIds.front, assetIds.threeQuarter, assetIds.profile are required");
  }

  return {
    front,
    threeQuarter,
    profile
  };
}

function buildPlaceholderPack(input: {
  packId: string;
  name: string;
  sourceImageRef: string;
}): Prisma.InputJsonValue {
  const pack = {
    schema_version: "1.0",
    pack_id: input.packId,
    meta: {
      name: input.name,
      created_at: new Date().toISOString(),
      source_image_ref: input.sourceImageRef,
      notes: "Placeholder before BUILD_CHARACTER_PACK completes"
    },
    canvas: {
      base_width: 1024,
      base_height: 1024,
      coord_space: "pixels"
    },
    assets: {
      images: {
        body_front: "shape://torso_front",
        upper_arm: "shape://upper_arm",
        lower_arm: "shape://lower_arm",
        paw: "shape://paw"
      }
    },
    slots: [
      { slot_id: "body", default_image_id: "body_front", z_index: 1 },
      { slot_id: "upper_arm", default_image_id: "upper_arm", z_index: 2 },
      { slot_id: "lower_arm", default_image_id: "lower_arm", z_index: 3 },
      { slot_id: "paw", default_image_id: "paw", z_index: 4 }
    ],
    skeleton: {
      bones: [
        { bone_id: "root", parent_id: "", rest: { x: 512, y: 736, rotation_deg: 0 } },
        { bone_id: "torso", parent_id: "root", rest: { x: 0, y: 0, rotation_deg: 0 } },
        {
          bone_id: "upper_arm",
          parent_id: "torso",
          rest: { x: 140, y: -108, rotation_deg: 16 },
          limits: { min_rotation_deg: -75, max_rotation_deg: 85 }
        },
        {
          bone_id: "lower_arm",
          parent_id: "upper_arm",
          rest: { x: 98, y: 0, rotation_deg: 14 },
          limits: { min_rotation_deg: -125, max_rotation_deg: 125 }
        }
      ],
      attachments: [
        {
          slot_id: "body",
          image_id: "body_front",
          bone_id: "torso",
          pivot: { px: 0.5, py: 0.8 },
          offset: { x: 0, y: -188 },
          scale: { x: 2.8, y: 3.2 },
          rotation_deg: 0
        },
        {
          slot_id: "upper_arm",
          image_id: "upper_arm",
          bone_id: "upper_arm",
          pivot: { px: 0.12, py: 0.5 },
          offset: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation_deg: 0
        },
        {
          slot_id: "lower_arm",
          image_id: "lower_arm",
          bone_id: "lower_arm",
          pivot: { px: 0.1, py: 0.5 },
          offset: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation_deg: 0
        },
        {
          slot_id: "paw",
          image_id: "paw",
          bone_id: "lower_arm",
          pivot: { px: 0.5, py: 0.5 },
          offset: { x: 82, y: 0 },
          scale: { x: 1, y: 1 },
          rotation_deg: 0
        }
      ]
    },
    visemes: {},
    expressions: {},
    clips: [],
    ik_chains: [
      {
        chain_id: "arm_point",
        bones: ["upper_arm", "lower_arm"],
        effector_bone_id: "lower_arm",
        elbow_hint: "down",
        max_stretch: 1.12
      }
    ]
  };

  return toPrismaJson(pack);
}

function parseGenerationMode(value: unknown): CharacterGenerationMode {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "reference") {
      return "reference";
    }
    if (normalized === "new") {
      return "new";
    }
  }

  return "new";
}

function resolveComfyUiBaseUrl(): string | undefined {
  const preferred = process.env.COMFYUI_BASE_URL?.trim();
  if (preferred && preferred.length > 0) {
    return preferred;
  }

  const legacy = process.env.COMFYUI_URL?.trim();
  if (legacy && legacy.length > 0) {
    return legacy;
  }

  return undefined;
}

function resolveRemoteApiBaseUrl(): string | undefined {
  const configured = process.env.IMAGEGEN_REMOTE_BASE_URL?.trim();
  if (configured && configured.length > 0) {
    return configured;
  }
  return undefined;
}

function parseGenerationProvider(value: unknown): CharacterGenerationProvider {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "comfyui") {
      return "comfyui";
    }
    if (normalized === "remoteapi" || normalized === "remote_api" || normalized === "remote-api") {
      return "remoteApi";
    }
    if (normalized === "mock") {
      return "mock";
    }
  }

  if (resolveComfyUiBaseUrl()) {
    return "comfyui";
  }
  if (resolveRemoteApiBaseUrl()) {
    return "remoteApi";
  }
  return "mock";
}

function parseGenerationView(value: unknown, field: string): CharacterGenerationView {
  if (typeof value !== "string") {
    throw createHttpError(400, `${field} must be one of front|threeQuarter|profile`);
  }

  const normalized = value.trim();
  if (normalized === "front" || normalized === "threeQuarter" || normalized === "profile") {
    return normalized;
  }

  throw createHttpError(400, `${field} must be one of front|threeQuarter|profile`);
}

function toDbGenerationMode(mode: CharacterGenerationMode): "NEW" | "REFERENCE" {
  return mode === "reference" ? "REFERENCE" : "NEW";
}

function toDbGenerationProvider(provider: CharacterGenerationProvider): "MOCK" | "COMFYUI" | "REMOTEAPI" {
  if (provider === "comfyui") {
    return "COMFYUI";
  }
  if (provider === "remoteApi") {
    return "REMOTEAPI";
  }
  return "MOCK";
}

function parsePromptPreset(value: unknown): string {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return DEFAULT_PROMPT_PRESET;
}

function parseGenerationSpecies(value: unknown): CharacterGenerationSpecies {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "cat" || normalized === "dog" || normalized === "wolf") {
      return normalized;
    }
  }
  return "cat";
}

function pickFirstLine(value: string | null | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const line = value.split(/\r?\n/, 1)[0]?.trim() ?? "";
  return line.length > 0 ? line : null;
}

function getGenerationManifestPath(generateJobId: string): string {
  return path.join(getRepoRoot(), "out", "characters", "generations", generateJobId, "generation_manifest.json");
}

function getGenerationProgressPath(generateJobId: string): string {
  return path.join(getRepoRoot(), "out", "characters", "generations", generateJobId, "generation_progress.json");
}

function toArtifactUrlFromAbsolutePath(filePath: string): string | null {
  const outRoot = path.join(getRepoRoot(), "out");
  const resolved = path.resolve(filePath);
  const relative = path.relative(outRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  const encoded = relative
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `/artifacts/${encoded}`;
}

function readLineageTasks(repairTasksRaw: unknown): CharacterLineageTask[] {
  if (!isRecord(repairTasksRaw) || !Array.isArray(repairTasksRaw.tasks)) {
    return [];
  }

  return repairTasksRaw.tasks
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }
      return {
        code: typeof entry.code === "string" ? entry.code : "UNKNOWN",
        severity: typeof entry.severity === "string" ? entry.severity : "WARN",
        status: typeof entry.status === "string" ? entry.status : "open",
        action: typeof entry.action === "string" ? entry.action : "-",
        reason: typeof entry.reason === "string" ? entry.reason : "-",
        assetPaths: parseStringArray(entry.asset_paths)
      };
    })
    .filter((entry): entry is CharacterLineageTask => Boolean(entry));
}

function parseCharacterPackLineageAnchorViewSummary(
  value: unknown
): CharacterPackLineageAnchorViewSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const presentAnchorIds = parseStringArray(value.present_anchor_ids);
  const missingAnchorIds = parseStringArray(value.missing_anchor_ids);
  const notes = typeof value.notes === "string" && value.notes.trim().length > 0 ? value.notes.trim() : null;
  if (presentAnchorIds.length === 0 && missingAnchorIds.length === 0 && !notes) {
    return undefined;
  }
  return {
    presentAnchorIds,
    missingAnchorIds,
    notes
  };
}

function parseCharacterPackLineageRigSummary(
  manifestRaw: unknown,
  packMetaRaw: unknown,
  packJsonRaw: unknown
): CharacterPackLineageRigSummary | null {
  const manifest = isRecord(manifestRaw) ? manifestRaw : {};
  const packMeta = isRecord(packMetaRaw) ? packMetaRaw : {};
  const packJson = isRecord(packJsonRaw) ? packJsonRaw : {};
  const packAnchors = isRecord(packJson.anchors) ? packJson.anchors : {};
  const anchorSummary = isRecord(packAnchors.summary) ? packAnchors.summary : {};
  const confidenceSummary =
    (isRecord(packAnchors.confidence_summary) ? packAnchors.confidence_summary : null) ??
    (isRecord(packMeta.anchor_confidence_summary) ? packMeta.anchor_confidence_summary : {});
  const anchorReview = isRecord(packMeta.anchor_review) ? packMeta.anchor_review : {};
  const byViewRoot = isRecord(anchorSummary.by_view) ? anchorSummary.by_view : {};
  const byView: Partial<Record<CharacterGenerationView, CharacterPackLineageAnchorViewSummary>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseCharacterPackLineageAnchorViewSummary(byViewRoot[view]);
    if (parsed) {
      byView[view] = parsed;
    }
  }

  const reviewOnly = typeof packMeta.review_only === "boolean" ? packMeta.review_only : null;
  const reviewNotes = parseStringArray(packMeta.review_notes);
  const anchorConfidenceOverall = parseOptionalNullableNumber(confidenceSummary.overall) ?? null;
  const anchorConfidenceByView = parseViewNullableNumberMap(confidenceSummary.by_view) ?? {};
  const confidenceNotes =
    typeof confidenceSummary.notes === "string" && confidenceSummary.notes.trim().length > 0
      ? confidenceSummary.notes.trim()
      : null;
  const coveredViews = parseCharacterGenerationViewArray(anchorSummary.covered_views);
  const missingViews = parseCharacterGenerationViewArray(anchorSummary.missing_views);
  const lowConfidenceAnchorIds = parseStringArray(anchorReview.low_confidence_anchor_ids);
  const missingAnchorIds = parseStringArray(anchorReview.missing_anchor_ids);

  if (
    reviewOnly === null &&
    reviewNotes.length === 0 &&
    anchorConfidenceOverall === null &&
    Object.keys(anchorConfidenceByView).length === 0 &&
    !confidenceNotes &&
    coveredViews.length === 0 &&
    missingViews.length === 0 &&
    Object.keys(byView).length === 0 &&
    lowConfidenceAnchorIds.length === 0 &&
    missingAnchorIds.length === 0 &&
    !isRecord(manifest.pack)
  ) {
    return null;
  }

  return {
    reviewOnly,
    reviewNotes,
    anchorConfidenceOverall,
    anchorConfidenceByView,
    confidenceNotes,
    coveredViews,
    missingViews,
    byView,
    lowConfidenceAnchorIds,
    missingAnchorIds
  };
}

function readCharacterPackLineage(characterPackId: string): CharacterPackLineage | null {
  const resolvedRoot = resolveGeneratedCharacterRoot(characterPackId);
  if (!resolvedRoot) {
    return null;
  }

  const manifestPath = path.join(resolvedRoot.characterRoot, "manifest.json");
  const packMetaPath = path.join(resolvedRoot.characterRoot, "pack", "character.pack.meta.json");
  const packJsonPath = path.join(resolvedRoot.characterRoot, "pack", "character.pack.json");
  const proposalPath = path.join(resolvedRoot.characterRoot, "pack", "proposal.json");
  const anchorsOverridePath = path.join(resolvedRoot.characterRoot, "pack", "overrides", "anchors.json");
  const cropBoxesOverridePath = path.join(resolvedRoot.characterRoot, "pack", "overrides", "crop-boxes.json");
  const qcReportPath = path.join(resolvedRoot.characterRoot, "qc", "qc_report.json");
  const repairTasksPath = path.join(resolvedRoot.characterRoot, "qc", "repair_tasks.json");

  const manifestRaw = readJsonFileSafe(manifestPath);
  const packMetaRaw = readJsonFileSafe(packMetaPath);
  const packJsonRaw = readJsonFileSafe(packJsonPath);
  const qcReportRaw = readJsonFileSafe(qcReportPath);
  const repairTasksRaw = readJsonFileSafe(repairTasksPath);
  const manifest = isRecord(manifestRaw) ? manifestRaw : {};
  const packMeta = isRecord(packMetaRaw) ? packMetaRaw : {};
  const packJson = isRecord(packJsonRaw) ? packJsonRaw : {};
  const qcReport = isRecord(qcReportRaw) ? qcReportRaw : {};
  const repairTasks = readLineageTasks(repairTasksRaw);
  const rigSummary = parseCharacterPackLineageRigSummary(manifestRaw, packMetaRaw, packJsonRaw);
  const viewRoot = isRecord(manifest.views) ? manifest.views : {};
  const viewEntries = (["front", "threeQuarter", "profile"] as CharacterGenerationView[]).map((view) => {
    const item = isRecord(viewRoot[view]) ? viewRoot[view] : {};
    const filePath = typeof item.file_path === "string" ? item.file_path : null;
    const metadataPath = typeof item.metadata_path === "string" ? item.metadata_path : null;
    const parentAssetPath = typeof item.parent_asset_path === "string" ? item.parent_asset_path : null;
    return {
      view,
      assetId: typeof item.asset_id === "string" ? item.asset_id : null,
      approved: typeof item.approved === "boolean" ? item.approved : null,
      workflow: typeof item.workflow === "string" ? item.workflow : null,
      workflowVersion: typeof item.workflow_version === "string" ? item.workflow_version : null,
      createdAt: typeof item.created_at === "string" ? item.created_at : null,
      filePath,
      fileUrl: toGeneratedCharacterFileUrl(filePath),
      metadataPath,
      metadataUrl: toGeneratedCharacterFileUrl(metadataPath),
      parentAssetId: typeof item.parent_asset_id === "string" ? item.parent_asset_id : null,
      parentAssetPath,
      parentAssetUrl: toGeneratedCharacterFileUrl(parentAssetPath),
      repairHistory: parseStringArray(item.repair_history)
    };
  });

  const qcChecks = Array.isArray(qcReport.checks) ? qcReport.checks.filter((entry) => isRecord(entry)) : [];
  const qcFailedCount = qcChecks.filter((entry) => entry.passed !== true).length;
  const approvalStatus =
    typeof (repairTasksRaw as { acceptance_status?: unknown } | null)?.acceptance_status === "string"
      ? ((repairTasksRaw as { acceptance_status: string }).acceptance_status ?? null)
      : typeof qcReport.acceptance_status === "string"
        ? qcReport.acceptance_status
        : typeof manifest.acceptance_status === "string"
          ? manifest.acceptance_status
          : readStringAtPath(manifest, ["acceptance", "status"]);

  return {
    sourceLabel: resolvedRoot.source.label,
    characterRoot: resolvedRoot.characterRoot,
    manifestPath,
    manifestUrl: toGeneratedCharacterFileUrl(manifestPath),
    packMetaPath: fs.existsSync(packMetaPath) ? packMetaPath : null,
    packMetaUrl: toGeneratedCharacterFileUrl(packMetaPath),
    packJsonPath: fs.existsSync(packJsonPath) ? packJsonPath : null,
    packJsonUrl: toGeneratedCharacterFileUrl(packJsonPath),
    proposalPath: fs.existsSync(proposalPath) ? proposalPath : null,
    proposalUrl: toGeneratedCharacterFileUrl(proposalPath),
    qcReportPath: fs.existsSync(qcReportPath) ? qcReportPath : null,
    qcReportUrl: toGeneratedCharacterFileUrl(qcReportPath),
    repairTasksPath: fs.existsSync(repairTasksPath) ? repairTasksPath : null,
    repairTasksUrl: toGeneratedCharacterFileUrl(repairTasksPath),
    builtAt:
      typeof packMeta.built_at === "string"
        ? packMeta.built_at
        : typeof manifest.updated_at === "string"
          ? manifest.updated_at
          : typeof manifest.created_at === "string"
            ? manifest.created_at
            : null,
    sourceManifestPath:
      typeof packMeta.source_manifest_path === "string" ? packMeta.source_manifest_path : fs.existsSync(manifestPath) ? manifestPath : null,
    sourceManifestUrl: toGeneratedCharacterFileUrl(
      typeof packMeta.source_manifest_path === "string" ? packMeta.source_manifest_path : manifestPath
    ),
    sourceImageRef:
      readStringAtPath(packJson, ["meta", "source_image_ref"]) ??
      readStringAtPath(manifest, ["views", "front", "parent_asset_path"]),
    sourceImageUrl: toGeneratedCharacterFileUrl(
      readStringAtPath(packJson, ["meta", "source_image_ref"]) ??
        readStringAtPath(manifest, ["views", "front", "parent_asset_path"])
    ),
    acceptanceStatus: approvalStatus,
    approvedFrontMasterPresent:
      typeof qcReport.approved_front_master_present === "boolean" ? qcReport.approved_front_master_present : null,
    qcFailedCount,
    qcTotalCount: qcChecks.length,
    repairOpenCount: repairTasks.filter((task) => task.status.toLowerCase() === "open").length,
    repairTasks,
    viewEntries,
    rigSummary,
    overrides: {
      anchorsPath: fs.existsSync(anchorsOverridePath) ? anchorsOverridePath : null,
      anchorsUrl: toGeneratedCharacterFileUrl(anchorsOverridePath),
      anchorsText: readTextFileSafe(anchorsOverridePath),
      cropBoxesPath: fs.existsSync(cropBoxesOverridePath) ? cropBoxesOverridePath : null,
      cropBoxesUrl: toGeneratedCharacterFileUrl(cropBoxesOverridePath),
      cropBoxesText: readTextFileSafe(cropBoxesOverridePath)
    }
  };
}

function buildProvisionalCharacterPackLineage(
  characterPackId: string,
  sourceManifestPath: string | null = null
): CharacterPackLineage {
  const source = getGeneratedCharacterArtifactSources()[0] ?? {
    label: "local worktree",
    root: path.join(getRepoRoot(), "assets", "generated", "characters")
  };
  const characterRoot = path.join(source.root, characterPackId);
  const manifestPath = path.join(characterRoot, "manifest.json");
  const packMetaPath = path.join(characterRoot, "pack", "character.pack.meta.json");
  const packJsonPath = path.join(characterRoot, "pack", "character.pack.json");
  const proposalPath = path.join(characterRoot, "pack", "proposal.json");
  const anchorsOverridePath = path.join(characterRoot, "pack", "overrides", "anchors.json");
  const cropBoxesOverridePath = path.join(characterRoot, "pack", "overrides", "crop-boxes.json");
  const qcReportPath = path.join(characterRoot, "qc", "qc_report.json");
  const repairTasksPath = path.join(characterRoot, "qc", "repair_tasks.json");

  return {
    sourceLabel: `${source.label} (predicted)`,
    characterRoot,
    manifestPath,
    manifestUrl: toGeneratedCharacterFileUrl(manifestPath),
    packMetaPath: fs.existsSync(packMetaPath) ? packMetaPath : null,
    packMetaUrl: toGeneratedCharacterFileUrl(packMetaPath),
    packJsonPath: fs.existsSync(packJsonPath) ? packJsonPath : null,
    packJsonUrl: toGeneratedCharacterFileUrl(packJsonPath),
    proposalPath: fs.existsSync(proposalPath) ? proposalPath : null,
    proposalUrl: toGeneratedCharacterFileUrl(proposalPath),
    qcReportPath: fs.existsSync(qcReportPath) ? qcReportPath : null,
    qcReportUrl: toGeneratedCharacterFileUrl(qcReportPath),
    repairTasksPath: fs.existsSync(repairTasksPath) ? repairTasksPath : null,
    repairTasksUrl: toGeneratedCharacterFileUrl(repairTasksPath),
    builtAt: null,
    sourceManifestPath,
    sourceManifestUrl: toGeneratedCharacterFileUrl(sourceManifestPath),
    sourceImageRef: null,
    sourceImageUrl: null,
    acceptanceStatus: null,
    approvedFrontMasterPresent: null,
    qcFailedCount: 0,
    qcTotalCount: 0,
    repairOpenCount: 0,
    repairTasks: [],
    viewEntries: (["front", "threeQuarter", "profile"] as CharacterGenerationView[]).map((view) => ({
      view,
      assetId: null,
      approved: null,
      workflow: null,
      workflowVersion: null,
      createdAt: null,
      filePath: null,
      fileUrl: null,
      metadataPath: null,
      metadataUrl: null,
      parentAssetId: null,
      parentAssetPath: null,
      parentAssetUrl: null,
      repairHistory: []
    })),
    rigSummary: null,
    overrides: {
      anchorsPath: fs.existsSync(anchorsOverridePath) ? anchorsOverridePath : null,
      anchorsUrl: toGeneratedCharacterFileUrl(anchorsOverridePath),
      anchorsText: readTextFileSafe(anchorsOverridePath),
      cropBoxesPath: fs.existsSync(cropBoxesOverridePath) ? cropBoxesOverridePath : null,
      cropBoxesUrl: toGeneratedCharacterFileUrl(cropBoxesOverridePath),
      cropBoxesText: readTextFileSafe(cropBoxesOverridePath)
    }
  };
}

function readSelectedByViewSelection(manifest: GenerationManifest): CharacterGenerationSelection | null {
  const front = manifest.selectedByView?.front?.candidateId;
  const threeQuarter = manifest.selectedByView?.threeQuarter?.candidateId;
  const profile = manifest.selectedByView?.profile?.candidateId;
  if (
    typeof front === "string" &&
    front.trim().length > 0 &&
    typeof threeQuarter === "string" &&
    threeQuarter.trim().length > 0 &&
    typeof profile === "string" &&
    profile.trim().length > 0
  ) {
    return {
      front: front.trim(),
      threeQuarter: threeQuarter.trim(),
      profile: profile.trim()
    };
  }
  return null;
}

function normalizePrettyJsonDocument(value: unknown): string {
  const normalized = JSON.parse(stableStringify(value));
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

function persistSelectedByViewToManifest(
  manifestPath: string,
  manifest: GenerationManifest,
  selection: CharacterGenerationSelection
): void {
  const nextManifest: GenerationManifest = {
    ...manifest,
    status: "HITL_SELECTED",
    selectedByView: {
      ...manifest.selectedByView,
      front: {
        ...(manifest.selectedByView.front ?? {}),
        candidateId: selection.front
      },
      threeQuarter: {
        ...(manifest.selectedByView.threeQuarter ?? {}),
        candidateId: selection.threeQuarter
      },
      profile: {
        ...(manifest.selectedByView.profile ?? {}),
        candidateId: selection.profile
      }
    }
  };
  const hashes = computeManifestHashes({
    episodeId: nextManifest.episodeId,
    characterPackId: nextManifest.characterPackId,
    mode: nextManifest.mode,
    promptPreset: nextManifest.promptPreset,
    ...(nextManifest.species ? { species: nextManifest.species } : {}),
    positivePrompt: nextManifest.positivePrompt,
    negativePrompt: nextManifest.negativePrompt,
    workflowHash: nextManifest.workflowHash,
    provider: nextManifest.provider,
    candidates: nextManifest.candidates
  });
  fs.writeFileSync(
    manifestPath,
    normalizePrettyJsonDocument({
      ...nextManifest,
      inputHash: hashes.inputHash,
      manifestHash: hashes.manifestHash
    }),
    "utf8"
  );
}

function buildEmptyManualOverrideDocument(kind: CharacterOverrideKind): JsonRecord {
  if (kind === "anchors") {
    return {
      views: {
        front: {},
        threeQuarter: {},
        profile: {}
      }
    };
  }
  return {
    torso: {},
    head: {},
    eyes: {},
    mouth: {}
  };
}

function readManualOverrideSeed(input: {
  overridePath: string | null;
  proposalPath: string | null;
  kind: CharacterOverrideKind;
}): { text: string; source: "override" | "proposal" | "empty" } {
  const overrideRaw =
    input.overridePath && fs.existsSync(input.overridePath) ? readJsonFileSafe(input.overridePath) : null;
  if (overrideRaw !== null) {
    return {
      text: normalizePrettyJsonDocument(overrideRaw),
      source: "override"
    };
  }

  const proposalRaw =
    input.proposalPath && fs.existsSync(input.proposalPath) ? readJsonFileSafe(input.proposalPath) : null;
  const proposal = isRecord(proposalRaw) ? proposalRaw : null;
  const autoProposal = proposal && isRecord(proposal.auto_proposal) ? proposal.auto_proposal : null;
  const proposalSeed =
    input.kind === "anchors"
      ? autoProposal && isRecord(autoProposal.anchors)
        ? autoProposal.anchors
        : null
      : autoProposal && isRecord(autoProposal.crop_boxes)
        ? autoProposal.crop_boxes
        : null;
  if (proposalSeed) {
    return {
      text: normalizePrettyJsonDocument(proposalSeed),
      source: "proposal"
    };
  }

  return {
    text: normalizePrettyJsonDocument(buildEmptyManualOverrideDocument(input.kind)),
    source: "empty"
  };
}

function normalizeManualOverrideText(rawText: string, kind: CharacterOverrideKind): string {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) {
    throw createHttpError(400, `${kind === "anchors" ? "anchors" : "crop boxes"} override JSON is required`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createHttpError(400, `Invalid ${kind === "anchors" ? "anchors" : "crop boxes"} override JSON: ${message}`);
  }
  if (!isRecord(parsed)) {
    throw createHttpError(400, `${kind === "anchors" ? "anchors" : "crop boxes"} override must be a JSON object`);
  }
  return normalizePrettyJsonDocument(
    kind === "anchors" ? sanitizeAnchorOverridePayload(parsed) : sanitizeCropBoxOverridePayload(parsed)
  );
}

function resolveManualOverrideFilePath(characterRoot: string, kind: CharacterOverrideKind): string {
  return path.join(characterRoot, "pack", "overrides", kind === "anchors" ? "anchors.json" : "crop-boxes.json");
}

async function resolveCharacterGenerationOverrideContext(
  prisma: PrismaClient,
  generateJobId: string
): Promise<CharacterGenerationOverrideTarget> {
  const sourceGenerateJob = await prisma.job.findUnique({
    where: { id: generateJobId },
    include: {
      episode: {
        select: {
          id: true,
          characterPackId: true,
          characterPackVersion: true
        }
      }
    }
  });

  if (!sourceGenerateJob) {
    throw createHttpError(404, "generate job not found");
  }
  if (sourceGenerateJob.type !== GENERATE_CHARACTER_ASSETS_JOB_NAME) {
    throw createHttpError(400, "job is not GENERATE_CHARACTER_ASSETS");
  }

  const sourceManifestPath = getGenerationManifestPath(sourceGenerateJob.id);
  const manifest = readGenerationManifest(sourceManifestPath);
  if (!manifest) {
    throw createHttpError(404, `generation manifest not found: ${sourceManifestPath}`);
  }

  const characterPackId =
    typeof manifest.characterPackId === "string" && manifest.characterPackId.trim().length > 0
      ? manifest.characterPackId.trim()
      : sourceGenerateJob.episode.characterPackId;
  if (!characterPackId) {
    throw createHttpError(400, "generation run does not have a character pack yet");
  }

  const lineage =
    readCharacterPackLineage(characterPackId) ?? buildProvisionalCharacterPackLineage(characterPackId, sourceManifestPath);

  return {
    generateJobId,
    manifest,
    manifestPath: sourceManifestPath,
    characterPackId,
    lineage,
    anchorsOverridePath: resolveManualOverrideFilePath(lineage.characterRoot, "anchors"),
    cropBoxesOverridePath: resolveManualOverrideFilePath(lineage.characterRoot, "cropBoxes"),
    selectedByView: readSelectedByViewSelection(manifest)
  };
}

function readSelectedCandidateSelectionFromManifest(manifest: GenerationManifest): CharacterGenerationSelection {
  const selection = readSelectedByViewSelection(manifest);
  if (!selection) {
    throw createHttpError(400, "current run does not record a full selected candidate set yet");
  }
  return selection;
}

async function createCharacterGenerationRebuildSelected(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    generateJobId: string;
  }
): Promise<{
  sessionId: string;
  episodeId: string;
  generateJobId: string;
  buildJobId: string;
  previewJobId: string;
  bullmqJobId: string;
  manifestPath: string;
  selection: CharacterGenerationSelection;
}> {
  const context = await resolveCharacterGenerationOverrideContext(prisma, input.generateJobId);
  const selection = readSelectedCandidateSelectionFromManifest(context.manifest);
  const rebuilt = await createCharacterGenerationPick(prisma, queue, queueName, {
    generateJobId: input.generateJobId,
    selection
  });
  return {
    ...rebuilt,
    selection
  };
}

function renderWorkflowSampleArtifactsFallback(): string {
  const repoRoot = getRepoRoot();
  const samples = [
    {
      label: "Front Sample",
      imagePath: path.join(repoRoot, "out", "comfy_test", "front.png"),
      guiPath: path.join(repoRoot, "out", "comfy_test", "front_workflow_gui.json"),
      apiPath: path.join(repoRoot, "out", "comfy_test", "front_workflow_api.json"),
      summaryPath: path.join(repoRoot, "out", "comfy_test", "front_workflow_summary.json")
    },
    {
      label: "3-View Front",
      imagePath: path.join(repoRoot, "out", "comfy_test_3view", "front.png"),
      guiPath: path.join(repoRoot, "out", "comfy_test_3view", "front_workflow_gui.json"),
      apiPath: path.join(repoRoot, "out", "comfy_test_3view", "front_workflow_api.json"),
      summaryPath: path.join(repoRoot, "out", "comfy_test_3view", "front_workflow_summary.json")
    },
    {
      label: "3-View ThreeQuarter",
      imagePath: path.join(repoRoot, "out", "comfy_test_3view", "threeQuarter.png"),
      guiPath: path.join(repoRoot, "out", "comfy_test_3view", "threeQuarter_workflow_gui.json"),
      apiPath: path.join(repoRoot, "out", "comfy_test_3view", "threeQuarter_workflow_api.json"),
      summaryPath: path.join(repoRoot, "out", "comfy_test_3view", "threeQuarter_workflow_summary.json")
    },
    {
      label: "3-View Profile",
      imagePath: path.join(repoRoot, "out", "comfy_test_3view", "profile.png"),
      guiPath: path.join(repoRoot, "out", "comfy_test_3view", "profile_workflow_gui.json"),
      apiPath: path.join(repoRoot, "out", "comfy_test_3view", "profile_workflow_api.json"),
      summaryPath: path.join(repoRoot, "out", "comfy_test_3view", "profile_workflow_summary.json")
    },
    {
      label: "Pose-Guided Front",
      imagePath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "front.png"),
      guiPath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "front_workflow_gui.json"),
      apiPath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "front_workflow_api.json"),
      summaryPath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "front_workflow_summary.json")
    },
    {
      label: "Pose-Guided ThreeQuarter",
      imagePath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "threeQuarter.png"),
      guiPath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "threeQuarter_workflow_gui.json"),
      apiPath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "threeQuarter_workflow_api.json"),
      summaryPath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "threeQuarter_workflow_summary.json")
    },
    {
      label: "Pose-Guided Profile",
      imagePath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "profile.png"),
      guiPath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "profile_workflow_gui.json"),
      apiPath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "profile_workflow_api.json"),
      summaryPath: path.join(repoRoot, "out", "comfy_test_poseguided_3view", "profile_workflow_summary.json")
    },
    {
      label: "Pose-Guided V3 ThreeQuarter",
      imagePath: path.join(repoRoot, "out", "comfy_test_poseguided_split_v3_3view", "threeQuarter.png"),
      guiPath: path.join(repoRoot, "out", "comfy_test_poseguided_split_v3_3view", "threeQuarter_workflow_gui.json"),
      apiPath: path.join(repoRoot, "out", "comfy_test_poseguided_split_v3_3view", "threeQuarter_workflow_api.json"),
      summaryPath: path.join(repoRoot, "out", "comfy_test_poseguided_split_v3_3view", "threeQuarter_workflow_summary.json")
    },
    {
      label: "Pose-Guided V3 Profile",
      imagePath: path.join(repoRoot, "out", "comfy_test_poseguided_split_v3_3view", "profile.png"),
      guiPath: path.join(repoRoot, "out", "comfy_test_poseguided_split_v3_3view", "profile_workflow_gui.json"),
      apiPath: path.join(repoRoot, "out", "comfy_test_poseguided_split_v3_3view", "profile_workflow_api.json"),
      summaryPath: path.join(repoRoot, "out", "comfy_test_poseguided_split_v3_3view", "profile_workflow_summary.json")
    }
  ];

  const rows = samples
    .filter((sample) => fs.existsSync(sample.guiPath))
    .map((sample) => {
      const imageUrl = fs.existsSync(sample.imagePath) ? toArtifactUrlFromAbsolutePath(sample.imagePath) : null;
      const guiUrl = toArtifactUrlFromAbsolutePath(sample.guiPath);
      const apiUrl = fs.existsSync(sample.apiPath) ? toArtifactUrlFromAbsolutePath(sample.apiPath) : null;
      const summaryUrl = fs.existsSync(sample.summaryPath) ? toArtifactUrlFromAbsolutePath(sample.summaryPath) : null;
      return `<tr><td>${escHtml(sample.label)}</td><td>${
        imageUrl ? `<a href="${imageUrl}">image</a>` : "-"
      }</td><td>${guiUrl ? `<a href="${guiUrl}">workflow_gui.json</a>` : "-"}</td><td>${
        apiUrl ? `<a href="${apiUrl}">workflow_api.json</a>` : "-"
      }</td><td>${summaryUrl ? `<a href="${summaryUrl}">workflow_summary.json</a>` : "-"}</td></tr>`;
    })
    .join("");

  if (rows.length === 0) {
    return `<section class="card"><h2>Local Workflow Samples</h2><div class="notice">No local ComfyUI workflow exports were found yet under <code>/out</code>.</div></section>`;
  }

  const compareReportPath = path.join(repoRoot, "out", "comfy_compare_poseguided", "report.html");
  const compareReportUrl = fs.existsSync(compareReportPath) ? toArtifactUrlFromAbsolutePath(compareReportPath) : null;
  const tunedCompareReportPath = path.join(repoRoot, "out", "comfy_compare_poseguided_frontref_default_vs_v3", "report.html");
  const tunedCompareReportUrl = fs.existsSync(tunedCompareReportPath)
    ? toArtifactUrlFromAbsolutePath(tunedCompareReportPath)
    : null;

  return `<section class="card"><h2>Local Workflow Samples</h2><div class="notice">DB-backed compare가 비어 있어도, 로컬에 남아 있는 ComfyUI workflow JSON은 여기서 바로 열 수 있게 둡니다. <strong>workflow_gui.json</strong>까지 함께 보여서 compare lane을 다시 열기 전에 정확한 workflow export를 먼저 검토할 수 있게 유지합니다.</div>${
    compareReportUrl
      ? `<p><a href="${compareReportUrl}">Open pose-guided compare report</a></p>`
      : ""
  }${
    tunedCompareReportUrl
      ? `<p><a href="${tunedCompareReportUrl}">Open front-ref tuned compare report</a></p>`
      : ""
  }<div class="asset-table-wrap"><table><thead><tr><th>Sample</th><th>Image</th><th>GUI</th><th>API</th><th>Summary</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseOptionalNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  return parseOptionalNumber(value);
}

function parseWorkflowFilePaths(value: unknown): NonNullable<GenerationManifestCandidate["providerMeta"]>["workflowFiles"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const apiPromptPath = typeof value.apiPromptPath === "string" ? value.apiPromptPath : undefined;
  const guiWorkflowPath = typeof value.guiWorkflowPath === "string" ? value.guiWorkflowPath : undefined;
  const summaryPath = typeof value.summaryPath === "string" ? value.summaryPath : undefined;
  if (!apiPromptPath && !guiWorkflowPath && !summaryPath) {
    return undefined;
  }

  return {
    ...(apiPromptPath ? { apiPromptPath } : {}),
    ...(guiWorkflowPath ? { guiWorkflowPath } : {}),
    ...(summaryPath ? { summaryPath } : {})
  };
}

function parseCandidateProviderMeta(value: unknown): GenerationManifestCandidate["providerMeta"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const workflowFiles = parseWorkflowFilePaths(value.workflowFiles);
  const structureControlDiagnostics = parseWorkflowStructureControlDiagnostics(value.structureControlDiagnostics);
  const preflightDiagnostics = parseWorkflowPreflightDiagnostics(value.preflightDiagnostics);
  const routeDecision = parseWorkflowRouteDecision(value.routeDecision);
  const runSettings = isRecord(value.runSettings)
    ? {
        ...(parseOptionalNumber(value.runSettings.steps) !== undefined
          ? { steps: parseOptionalNumber(value.runSettings.steps) }
          : {}),
        ...(parseOptionalNumber(value.runSettings.cfg) !== undefined
          ? { cfg: parseOptionalNumber(value.runSettings.cfg) }
          : {}),
        ...(parseOptionalNumber(value.runSettings.width) !== undefined
          ? { width: parseOptionalNumber(value.runSettings.width) }
          : {}),
        ...(parseOptionalNumber(value.runSettings.height) !== undefined
          ? { height: parseOptionalNumber(value.runSettings.height) }
          : {}),
        ...(typeof value.runSettings.sampler === "string" ? { sampler: value.runSettings.sampler } : {}),
        ...(typeof value.runSettings.scheduler === "string" ? { scheduler: value.runSettings.scheduler } : {})
      }
    : undefined;
  const postprocess = isRecord(value.postprocess)
    ? {
        ...(typeof value.postprocess.applied === "boolean" ? { applied: value.postprocess.applied } : {}),
        ...(parseOptionalNumber(value.postprocess.outputWidth) !== undefined
          ? { outputWidth: parseOptionalNumber(value.postprocess.outputWidth) }
          : {}),
        ...(parseOptionalNumber(value.postprocess.outputHeight) !== undefined
          ? { outputHeight: parseOptionalNumber(value.postprocess.outputHeight) }
          : {}),
        ...(parseOptionalNumber(value.postprocess.upscaleLongSide) !== undefined
          ? { upscaleLongSide: parseOptionalNumber(value.postprocess.upscaleLongSide) }
          : {}),
        ...(parseOptionalNumber(value.postprocess.sharpen) !== undefined
          ? { sharpen: parseOptionalNumber(value.postprocess.sharpen) }
          : {}),
        ...(parseOptionalNumber(value.postprocess.saturationBoost) !== undefined
          ? { saturationBoost: parseOptionalNumber(value.postprocess.saturationBoost) }
          : {})
      }
    : undefined;

  return {
    ...(typeof value.mode === "string" ? { mode: value.mode } : {}),
    ...(typeof value.qualityProfileId === "string" ? { qualityProfileId: value.qualityProfileId } : {}),
    ...(typeof value.qualityTier === "string" ? { qualityTier: value.qualityTier } : {}),
    ...(typeof value.targetStyle === "string" ? { targetStyle: value.targetStyle } : {}),
    ...(typeof value.viewPrompt === "string" ? { viewPrompt: value.viewPrompt } : {}),
    ...(typeof value.workflowStage === "string" ? { workflowStage: value.workflowStage } : {}),
    ...(typeof value.workflowTemplateVersion === "string"
      ? { workflowTemplateVersion: value.workflowTemplateVersion }
      : {}),
    ...(Array.isArray(value.warnings)
      ? {
          warnings: value.warnings.filter((item): item is string => typeof item === "string")
        }
      : {}),
    ...(typeof value.referenceMode === "string" ? { referenceMode: value.referenceMode } : {}),
    ...(typeof value.referenceApplied === "boolean" ? { referenceApplied: value.referenceApplied } : {}),
    ...(typeof value.poseApplied === "boolean" ? { poseApplied: value.poseApplied } : {}),
    ...(typeof value.repairMaskApplied === "boolean" ? { repairMaskApplied: value.repairMaskApplied } : {}),
    ...(typeof value.repairMaskSource === "string" ? { repairMaskSource: value.repairMaskSource } : {}),
    ...(typeof value.structureControlApplied === "boolean"
      ? { structureControlApplied: value.structureControlApplied }
      : {}),
    ...(Array.isArray(value.structureControlsApplied)
      ? {
          structureControlsApplied: value.structureControlsApplied.filter(
            (item): item is string => typeof item === "string"
          )
        }
      : {}),
    ...(structureControlDiagnostics ? { structureControlDiagnostics } : {}),
    ...(preflightDiagnostics ? { preflightDiagnostics } : {}),
    ...(routeDecision ? { routeDecision } : {}),
    ...(workflowFiles ? { workflowFiles } : {}),
    ...(runSettings && Object.keys(runSettings).length > 0 ? { runSettings } : {}),
    ...(postprocess && Object.keys(postprocess).length > 0 ? { postprocess } : {})
  };
}

function parseCharacterGenerationViewArray(value: unknown): CharacterGenerationView[] {
  return parseStringArray(value).filter(
    (entry): entry is CharacterGenerationView => entry === "front" || entry === "threeQuarter" || entry === "profile"
  );
}

function parsePackCoherenceMetrics(
  value: unknown
): GenerationManifestPackCoherence["metrics"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const metrics = {
    ...(parseOptionalNullableNumber(value.frontAnchorScore) !== undefined
      ? { frontAnchorScore: parseOptionalNullableNumber(value.frontAnchorScore) }
      : {}),
    ...(parseOptionalNullableNumber(value.frontStyleScore) !== undefined
      ? { frontStyleScore: parseOptionalNullableNumber(value.frontStyleScore) }
      : {}),
    ...(parseOptionalNullableNumber(value.frontSpeciesScore) !== undefined
      ? { frontSpeciesScore: parseOptionalNullableNumber(value.frontSpeciesScore) }
      : {}),
    ...(parseOptionalNullableNumber(value.threeQuarterConsistency) !== undefined
      ? { threeQuarterConsistency: parseOptionalNullableNumber(value.threeQuarterConsistency) }
      : {}),
    ...(parseOptionalNullableNumber(value.profileConsistency) !== undefined
      ? { profileConsistency: parseOptionalNullableNumber(value.profileConsistency) }
      : {}),
    ...(parseOptionalNullableNumber(value.speciesSpread) !== undefined
      ? { speciesSpread: parseOptionalNullableNumber(value.speciesSpread) }
      : {}),
    ...(parseOptionalNullableNumber(value.styleSpread) !== undefined
      ? { styleSpread: parseOptionalNullableNumber(value.styleSpread) }
      : {}),
    ...(parseOptionalNullableNumber(value.headRatioSpread) !== undefined
      ? { headRatioSpread: parseOptionalNullableNumber(value.headRatioSpread) }
      : {}),
    ...(parseOptionalNullableNumber(value.monochromeSpread) !== undefined
      ? { monochromeSpread: parseOptionalNullableNumber(value.monochromeSpread) }
      : {})
  };

  return Object.keys(metrics).length > 0 ? metrics : undefined;
}

function parsePackCoherence(value: unknown): GenerationManifestPackCoherence | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const severityRaw = typeof value.severity === "string" ? value.severity : "none";
  const severity =
    severityRaw === "none" || severityRaw === "review" || severityRaw === "block" ? severityRaw : "none";
  const metrics = parsePackCoherenceMetrics(value.metrics);

  return {
    issues: parseStringArray(value.issues),
    severity,
    score: parseOptionalNumber(value.score) ?? 0,
    blockingViews: parseCharacterGenerationViewArray(value.blockingViews),
    warningViews: parseCharacterGenerationViewArray(value.warningViews),
    ...(metrics ? { metrics } : {})
  };
}

function parseViewNumberMap(value: unknown): Partial<Record<CharacterGenerationView, number>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, number>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseOptionalNumber(value[view]);
    if (parsed !== undefined) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseViewStringArrayMap(value: unknown): Partial<Record<CharacterGenerationView, string[]>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, string[]>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseStringArray(value[view]);
    if (parsed.length > 0) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseViewStringMap(value: unknown): Partial<Record<CharacterGenerationView, string>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, string>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    if (typeof value[view] === "string" && value[view].trim().length > 0) {
      out[view] = value[view].trim();
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseStringArrayMap(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = parseStringArray(raw);
    if (parsed.length > 0) {
      out[key] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseStringNumberMap(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = parseOptionalNumber(raw);
    if (parsed !== undefined) {
      out[key] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseWorkflowStructureControlDiagnostics(
  value: unknown
): GenerationManifestWorkflowStructureControlDiagnostics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const requiredKinds = parseStringArray(value.requiredKinds);
  const suppliedKinds = parseStringArray(value.suppliedKinds);
  const appliedKinds = parseStringArray(value.appliedKinds);
  const appliedSuppliedKinds = parseStringArray(value.appliedSuppliedKinds);
  const appliedAutoKinds = parseStringArray(value.appliedAutoKinds);
  const missingRequiredKinds = parseStringArray(value.missingRequiredKinds);
  const sourceRolesByKind = parseStringArrayMap(value.sourceRolesByKind);
  const sourceRefsByKind = parseStringArrayMap(value.sourceRefsByKind);

  if (
    requiredKinds.length === 0 &&
    suppliedKinds.length === 0 &&
    appliedKinds.length === 0 &&
    appliedSuppliedKinds.length === 0 &&
    appliedAutoKinds.length === 0 &&
    missingRequiredKinds.length === 0 &&
    !sourceRolesByKind &&
    !sourceRefsByKind
  ) {
    return undefined;
  }

  return {
    ...(requiredKinds.length > 0 ? { requiredKinds } : {}),
    ...(suppliedKinds.length > 0 ? { suppliedKinds } : {}),
    ...(appliedKinds.length > 0 ? { appliedKinds } : {}),
    ...(appliedSuppliedKinds.length > 0 ? { appliedSuppliedKinds } : {}),
    ...(appliedAutoKinds.length > 0 ? { appliedAutoKinds } : {}),
    ...(missingRequiredKinds.length > 0 ? { missingRequiredKinds } : {}),
    ...(sourceRolesByKind ? { sourceRolesByKind } : {}),
    ...(sourceRefsByKind ? { sourceRefsByKind } : {})
  };
}

function parseWorkflowPreflightDiagnostics(value: unknown): GenerationManifestWorkflowPreflightDiagnostics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const warnings = parseStringArray(value.warnings);
  const requiredReferenceRoles = parseStringArray(value.requiredReferenceRoles);
  const requiredStructureControlKinds = parseStringArray(value.requiredStructureControlKinds);
  const approvedViews = parseCharacterGenerationViewArray(value.approvedViews);
  const provenancePolicy = isRecord(value.provenancePolicy)
    ? {
        ...(typeof value.provenancePolicy.requireTraceFields === "boolean"
          ? { requireTraceFields: value.provenancePolicy.requireTraceFields }
          : {}),
        ...(typeof value.provenancePolicy.requireSourceRefInReferenceBank === "boolean"
          ? { requireSourceRefInReferenceBank: value.provenancePolicy.requireSourceRefInReferenceBank }
          : {}),
        ...(typeof value.provenancePolicy.requireSourceRoleMatchReferenceRole === "boolean"
          ? { requireSourceRoleMatchReferenceRole: value.provenancePolicy.requireSourceRoleMatchReferenceRole }
          : {}),
        ...(typeof value.provenancePolicy.requireSourceViewMatchReferenceView === "boolean"
          ? { requireSourceViewMatchReferenceView: value.provenancePolicy.requireSourceViewMatchReferenceView }
          : {})
      }
    : undefined;

  if (
    typeof value.ok !== "boolean" &&
    warnings.length === 0 &&
    requiredReferenceRoles.length === 0 &&
    requiredStructureControlKinds.length === 0 &&
    approvedViews.length === 0 &&
    (!provenancePolicy || Object.keys(provenancePolicy).length === 0)
  ) {
    return undefined;
  }

  return {
    ok: typeof value.ok === "boolean" ? value.ok : true,
    warnings,
    ...(requiredReferenceRoles.length > 0 ? { requiredReferenceRoles } : {}),
    ...(requiredStructureControlKinds.length > 0 ? { requiredStructureControlKinds } : {}),
    ...(approvedViews.length > 0 ? { approvedViews } : {}),
    ...(provenancePolicy && Object.keys(provenancePolicy).length > 0 ? { provenancePolicy } : {})
  };
}

function parseWorkflowRouteDecision(value: unknown): GenerationManifestWorkflowRouteDecision | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: GenerationManifestWorkflowRouteDecision = {
    ...(typeof value.preferUltraCheckpoint === "boolean"
      ? { preferUltraCheckpoint: value.preferUltraCheckpoint }
      : {}),
    ...(typeof value.preferCheckpoint === "boolean" ? { preferCheckpoint: value.preferCheckpoint } : {}),
    ...(typeof value.canUseCheckpoint === "boolean" ? { canUseCheckpoint: value.canUseCheckpoint } : {}),
    ...(typeof value.ultraReady === "boolean" ? { ultraReady: value.ultraReady } : {}),
    ...(typeof value.fluxReady === "boolean" ? { fluxReady: value.fluxReady } : {}),
    ...(typeof value.selectedMode === "string" && value.selectedMode.trim().length > 0
      ? { selectedMode: value.selectedMode.trim() }
      : {}),
    ...(typeof value.fallbackUsed === "boolean" ? { fallbackUsed: value.fallbackUsed } : {})
  };

  return Object.keys(out).length > 0 ? out : undefined;
}

function parseStructureGuideQualityMetrics(
  value: unknown
): GenerationManifestStructureGuideQualityMetrics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const status =
    value.status === "ok" || value.status === "review" || value.status === "block" ? value.status : undefined;
  const reasonCodes = parseStringArray(value.reasonCodes);
  if (!status) {
    return undefined;
  }

  return {
    kind: typeof value.kind === "string" ? value.kind : "unknown",
    ...(parseOptionalNumber(value.signalCoverage) !== undefined
      ? { signalCoverage: parseOptionalNumber(value.signalCoverage) }
      : {}),
    ...(parseOptionalNumber(value.dynamicRange) !== undefined
      ? { dynamicRange: parseOptionalNumber(value.dynamicRange) }
      : {}),
    ...(parseOptionalNumber(value.meanLuma) !== undefined ? { meanLuma: parseOptionalNumber(value.meanLuma) } : {}),
    ...(parseOptionalNumber(value.stdDev) !== undefined ? { stdDev: parseOptionalNumber(value.stdDev) } : {}),
    ...(parseOptionalNumber(value.score) !== undefined ? { score: parseOptionalNumber(value.score) } : {}),
    status,
    reasonCodes
  };
}

function parseStructureGuideQualityMetricsMap(
  value: unknown
): Record<string, GenerationManifestStructureGuideQualityMetrics> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Record<string, GenerationManifestStructureGuideQualityMetrics> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = parseStructureGuideQualityMetrics(raw);
    if (parsed) {
      out[key] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseStructureGuideSourceDiagnostics(
  value: unknown
): GenerationManifestStructureGuideSourceDiagnostics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const status =
    value.status === "ok" || value.status === "review" || value.status === "block" ? value.status : undefined;
  const reasonCodes = parseStringArray(value.reasonCodes);
  if (!status) {
    return undefined;
  }

  return {
    ...(typeof value.sourceRole === "string" && value.sourceRole.trim().length > 0
      ? { sourceRole: value.sourceRole.trim() }
      : {}),
    ...(typeof value.sourceRefId === "string" && value.sourceRefId.trim().length > 0
      ? { sourceRefId: value.sourceRefId.trim() }
      : {}),
    ...(value.sourceView === "front" || value.sourceView === "threeQuarter" || value.sourceView === "profile"
      ? { sourceView: value.sourceView }
      : {}),
    ...(parseStringArray(value.allowedRoles).length > 0 ? { allowedRoles: parseStringArray(value.allowedRoles) } : {}),
    ...(typeof value.requiredPrimaryRole === "string" && value.requiredPrimaryRole.trim().length > 0
      ? { requiredPrimaryRole: value.requiredPrimaryRole.trim() }
      : {}),
    status,
    reasonCodes
  };
}

function parseStructureGuideSourceDiagnosticsMap(
  value: unknown
): Record<string, GenerationManifestStructureGuideSourceDiagnostics> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Record<string, GenerationManifestStructureGuideSourceDiagnostics> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = parseStructureGuideSourceDiagnostics(raw);
    if (parsed) {
      out[key] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseStageInputPreflightViewDiagnostics(
  value: unknown
): GenerationManifestStageInputPreflightViewDiagnostics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const status =
    value.status === "ok" || value.status === "review" || value.status === "block" ? value.status : undefined;
  const reasonCodes = parseStringArray(value.reasonCodes);
  if (!status) {
    return undefined;
  }

  const referenceRoleWeights = parseStringNumberMap(value.referenceRoleWeights);
  const structureGuideMetrics = parseStructureGuideQualityMetricsMap(value.structureGuideMetrics);
  const structureGuideSources = parseStructureGuideSourceDiagnosticsMap(value.structureGuideSources);

  return {
    status,
    reasonCodes,
    ...(parseStringArray(value.requiredReferenceRoles).length > 0
      ? { requiredReferenceRoles: parseStringArray(value.requiredReferenceRoles) }
      : {}),
    ...(parseStringArray(value.missingReferenceRoles).length > 0
      ? { missingReferenceRoles: parseStringArray(value.missingReferenceRoles) }
      : {}),
    ...(parseStringArray(value.weakReferenceRoles).length > 0
      ? { weakReferenceRoles: parseStringArray(value.weakReferenceRoles) }
      : {}),
    ...(parseStringArray(value.requiredStructureKinds).length > 0
      ? { requiredStructureKinds: parseStringArray(value.requiredStructureKinds) }
      : {}),
    ...(parseStringArray(value.missingStructureKinds).length > 0
      ? { missingStructureKinds: parseStringArray(value.missingStructureKinds) }
      : {}),
    ...(parseStringArray(value.weakStructureKinds).length > 0
      ? { weakStructureKinds: parseStringArray(value.weakStructureKinds) }
      : {}),
    ...(parseStringArray(value.invalidStructureSourceKinds).length > 0
      ? { invalidStructureSourceKinds: parseStringArray(value.invalidStructureSourceKinds) }
      : {}),
    ...(parseStringArray(value.missingPrimaryStructureSourceKinds).length > 0
      ? { missingPrimaryStructureSourceKinds: parseStringArray(value.missingPrimaryStructureSourceKinds) }
      : {}),
    ...(referenceRoleWeights ? { referenceRoleWeights } : {}),
    ...(parseOptionalNumber(value.referenceAlphaCoverage) !== undefined
      ? { referenceAlphaCoverage: parseOptionalNumber(value.referenceAlphaCoverage) }
      : {}),
    ...(parseOptionalNumber(value.referenceMonochromeScore) !== undefined
      ? { referenceMonochromeScore: parseOptionalNumber(value.referenceMonochromeScore) }
      : {}),
    ...(structureGuideMetrics ? { structureGuideMetrics } : {}),
    ...(structureGuideSources ? { structureGuideSources } : {})
  };
}

function parseStageInputPreflightByView(
  value: unknown
): Partial<Record<CharacterGenerationView, GenerationManifestStageInputPreflightViewDiagnostics>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, GenerationManifestStageInputPreflightViewDiagnostics>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseStageInputPreflightViewDiagnostics(value[view]);
    if (parsed) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseRepairDirectiveProfileSummary(
  value: unknown
): GenerationManifestRepairDirectiveProfileSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    families: parseStringArray(value.families),
    severity: typeof value.severity === "string" ? value.severity : "none",
    candidateCountBoost: parseOptionalNumber(value.candidateCountBoost) ?? 0,
    acceptedScoreThresholdBoost: parseOptionalNumber(value.acceptedScoreThresholdBoost) ?? 0,
    disablePose: typeof value.disablePose === "boolean" ? value.disablePose : false,
    notes: parseStringArray(value.notes)
  };
}

function parseDirectiveProfilesByView(
  value: unknown
): Partial<Record<CharacterGenerationView, GenerationManifestRepairDirectiveProfileSummary>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, GenerationManifestRepairDirectiveProfileSummary>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseRepairDirectiveProfileSummary(value[view]);
    if (parsed) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseStageCandidateSummary(value: unknown): GenerationManifestStageCandidateSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    ...(typeof value.candidateId === "string" && value.candidateId.trim().length > 0
      ? { candidateId: value.candidateId.trim() }
      : {}),
    ...(parseOptionalNumber(value.score) !== undefined ? { score: parseOptionalNumber(value.score) } : {}),
    ...(parseOptionalNullableNumber(value.consistencyScore) !== undefined
      ? { consistencyScore: parseOptionalNullableNumber(value.consistencyScore) }
      : {}),
    warningCount: parseOptionalNumber(value.warningCount) ?? 0,
    rejectionCount: parseOptionalNumber(value.rejectionCount) ?? 0,
    passed: typeof value.passed === "boolean" ? value.passed : false,
    failureReasons: parseStringArray(value.failureReasons),
    ...(parseRuntimeBucketLevel(value.runtimeBucket) ? { runtimeBucket: parseRuntimeBucketLevel(value.runtimeBucket) } : {})
  };
}

function parseStageCandidateSummaryByView(
  value: unknown
): Partial<Record<CharacterGenerationView, GenerationManifestStageCandidateSummary>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, GenerationManifestStageCandidateSummary>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseStageCandidateSummary(value[view]);
    if (parsed) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseStageGateDecision(value: unknown): GenerationManifestStageGateDecision | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const decision = typeof value.decision === "string" ? value.decision.trim() : "";
  const reasons = parseStringArray(value.reasons);
  if (!decision && reasons.length === 0) {
    return undefined;
  }

  return {
    decision: decision || "unknown",
    ...(typeof value.chosenCandidateId === "string" && value.chosenCandidateId.trim().length > 0
      ? { chosenCandidateId: value.chosenCandidateId.trim() }
      : {}),
    ...(typeof value.chosenStage === "string" && value.chosenStage.trim().length > 0
      ? { chosenStage: value.chosenStage.trim() }
      : {}),
    ...(typeof value.baseCandidateId === "string" && value.baseCandidateId.trim().length > 0
      ? { baseCandidateId: value.baseCandidateId.trim() }
      : {}),
    ...(typeof value.refineCandidateId === "string" && value.refineCandidateId.trim().length > 0
      ? { refineCandidateId: value.refineCandidateId.trim() }
      : {}),
    ...(typeof value.lockCandidateId === "string" && value.lockCandidateId.trim().length > 0
      ? { lockCandidateId: value.lockCandidateId.trim() }
      : {}),
    ...(parseOptionalNumber(value.scoreDeltaVsBase) !== undefined
      ? { scoreDeltaVsBase: parseOptionalNumber(value.scoreDeltaVsBase) }
      : {}),
    ...(parseOptionalNullableNumber(value.consistencyDeltaVsBase) !== undefined
      ? { consistencyDeltaVsBase: parseOptionalNullableNumber(value.consistencyDeltaVsBase) }
      : {}),
    reasons
  };
}

function parseStageGateDecisionsByView(
  value: unknown
): Partial<Record<CharacterGenerationView, GenerationManifestStageGateDecision>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, GenerationManifestStageGateDecision>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseStageGateDecision(value[view]);
    if (parsed) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseStageRepairTriageDecision(
  value: unknown
): GenerationManifestStageRepairTriageDecision | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const decision = typeof value.decision === "string" ? value.decision.trim() : "";
  const reasonCodes = parseStringArray(value.reasonCodes ?? value.reasons);
  if (!decision && reasonCodes.length === 0) {
    return undefined;
  }

  return {
    decision: decision || "unknown",
    ...(typeof value.priority === "string" && value.priority.trim().length > 0
      ? { priority: value.priority.trim() }
      : {}),
    ...(typeof value.sourceCandidateId === "string" && value.sourceCandidateId.trim().length > 0
      ? { sourceCandidateId: value.sourceCandidateId.trim() }
      : {}),
    ...(typeof value.sourceStage === "string" && value.sourceStage.trim().length > 0
      ? { sourceStage: value.sourceStage.trim() }
      : {}),
    ...(typeof value.sourcePassLabel === "string" && value.sourcePassLabel.trim().length > 0
      ? { sourcePassLabel: value.sourcePassLabel.trim() }
      : {}),
    ...(typeof value.targetStage === "string" && value.targetStage.trim().length > 0
      ? { targetStage: value.targetStage.trim() }
      : {}),
    ...(typeof value.acceptedByGate === "boolean" ? { acceptedByGate: value.acceptedByGate } : {}),
    ...(typeof value.gateDecision === "string" && value.gateDecision.trim().length > 0
      ? { gateDecision: value.gateDecision.trim() }
      : {}),
    ...(parseStringArray(value.repairFamilies).length > 0 ? { repairFamilies: parseStringArray(value.repairFamilies) } : {}),
    ...(parseOptionalNumber(value.score) !== undefined ? { score: parseOptionalNumber(value.score) } : {}),
    ...(parseOptionalNullableNumber(value.consistencyScore) !== undefined
      ? { consistencyScore: parseOptionalNullableNumber(value.consistencyScore) }
      : {}),
    reasonCodes
  };
}

function parseStageRepairTriageByView(
  value: unknown
): Partial<Record<CharacterGenerationView, GenerationManifestStageRepairTriageDecision>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, GenerationManifestStageRepairTriageDecision>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseStageRepairTriageDecision(value[view]);
    if (parsed) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseStageRepairAcceptanceDecision(
  value: unknown
): GenerationManifestStageRepairAcceptanceDecision | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const decision = typeof value.decision === "string" ? value.decision.trim() : "";
  const reasonCodes = parseStringArray(value.reasonCodes ?? value.reasons);
  if (!decision && reasonCodes.length === 0) {
    return undefined;
  }

  return {
    decision: decision || "unknown",
    ...(typeof value.chosenCandidateId === "string" && value.chosenCandidateId.trim().length > 0
      ? { chosenCandidateId: value.chosenCandidateId.trim() }
      : {}),
    ...(typeof value.chosenStage === "string" && value.chosenStage.trim().length > 0
      ? { chosenStage: value.chosenStage.trim() }
      : {}),
    ...(typeof value.preRepairCandidateId === "string" && value.preRepairCandidateId.trim().length > 0
      ? { preRepairCandidateId: value.preRepairCandidateId.trim() }
      : {}),
    ...(typeof value.preRepairStage === "string" && value.preRepairStage.trim().length > 0
      ? { preRepairStage: value.preRepairStage.trim() }
      : {}),
    ...(typeof value.repairCandidateId === "string" && value.repairCandidateId.trim().length > 0
      ? { repairCandidateId: value.repairCandidateId.trim() }
      : {}),
    ...(typeof value.repairStage === "string" && value.repairStage.trim().length > 0
      ? { repairStage: value.repairStage.trim() }
      : {}),
    ...(parseOptionalNumber(value.scoreDeltaVsPreRepair) !== undefined
      ? { scoreDeltaVsPreRepair: parseOptionalNumber(value.scoreDeltaVsPreRepair) }
      : {}),
    ...(parseOptionalNullableNumber(value.consistencyDeltaVsPreRepair) !== undefined
      ? { consistencyDeltaVsPreRepair: parseOptionalNullableNumber(value.consistencyDeltaVsPreRepair) }
      : {}),
    ...(parseOptionalNumber(value.rejectionDeltaVsPreRepair) !== undefined
      ? { rejectionDeltaVsPreRepair: parseOptionalNumber(value.rejectionDeltaVsPreRepair) }
      : {}),
    ...(parseOptionalNumber(value.warningDeltaVsPreRepair) !== undefined
      ? { warningDeltaVsPreRepair: parseOptionalNumber(value.warningDeltaVsPreRepair) }
      : {}),
    ...(parseOptionalNumber(value.defectDeltaVsPreRepair) !== undefined
      ? { defectDeltaVsPreRepair: parseOptionalNumber(value.defectDeltaVsPreRepair) }
      : {}),
    ...(parseStringArray(value.introducedCriticalFamilies).length > 0
      ? { introducedCriticalFamilies: parseStringArray(value.introducedCriticalFamilies) }
      : {}),
    reasonCodes
  };
}

function parseStageRepairAcceptanceByView(
  value: unknown
): Partial<Record<CharacterGenerationView, GenerationManifestStageRepairAcceptanceDecision>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, GenerationManifestStageRepairAcceptanceDecision>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseStageRepairAcceptanceDecision(value[view]);
    if (parsed) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseStageReferenceRoleMixSummary(
  value: unknown
): GenerationManifestStageReferenceRoleMixSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const count = parseOptionalNumber(value.count);
  const weightSum = parseOptionalNumber(value.weightSum);
  if (count === undefined && weightSum === undefined) {
    return undefined;
  }

  return {
    count: count ?? 0,
    weightSum: weightSum ?? 0
  };
}

function parseStageReferenceMixSummary(
  value: unknown
): GenerationManifestStageReferenceMixSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const roles: Record<string, GenerationManifestStageReferenceRoleMixSummary> = {};
  if (isRecord(value.roles)) {
    for (const [role, roleValue] of Object.entries(value.roles)) {
      const parsed = parseStageReferenceRoleMixSummary(roleValue);
      if (parsed) {
        roles[role] = parsed;
      }
    }
  }

  const totalEntries = parseOptionalNumber(value.totalEntries);
  const totalWeight = parseOptionalNumber(value.totalWeight);
  if (totalEntries === undefined && totalWeight === undefined && Object.keys(roles).length === 0) {
    return undefined;
  }

  return {
    totalEntries: totalEntries ?? 0,
    totalWeight: totalWeight ?? 0,
    roles
  };
}

function parseStageReferenceMixByView(
  value: unknown
): Partial<Record<CharacterGenerationView, GenerationManifestStageReferenceMixSummary>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, GenerationManifestStageReferenceMixSummary>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseStageReferenceMixSummary(value[view]);
    if (parsed) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseSelectionCandidateSummary(
  value: unknown
): GenerationManifestSelectionCandidateSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const candidateId = typeof value.candidateId === "string" ? value.candidateId.trim() : "";
  if (!candidateId) {
    return undefined;
  }

  return {
    candidateId,
    ...(parseOptionalNumber(value.score) !== undefined ? { score: parseOptionalNumber(value.score) } : {}),
    ...(parseOptionalNullableNumber(value.consistencyScore) !== undefined
      ? { consistencyScore: parseOptionalNullableNumber(value.consistencyScore) }
      : {}),
    ...(parseOptionalNullableNumber(value.anchorConfidence) !== undefined
      ? { anchorConfidence: parseOptionalNullableNumber(value.anchorConfidence) }
      : {}),
    ...(parseOptionalNullableNumber(value.landmarkConsistency) !== undefined
      ? { landmarkConsistency: parseOptionalNullableNumber(value.landmarkConsistency) }
      : {}),
    ...(parseOptionalNumber(value.warningCount) !== undefined ? { warningCount: parseOptionalNumber(value.warningCount) } : {}),
    ...(parseOptionalNumber(value.rejectionCount) !== undefined
      ? { rejectionCount: parseOptionalNumber(value.rejectionCount) }
      : {}),
    ...(parseRuntimeBucketLevel(value.runtimeBucket) ? { runtimeBucket: parseRuntimeBucketLevel(value.runtimeBucket) } : {}),
    ...(parseStringArray(value.rigFallbackReasonCodes).length > 0
      ? { rigFallbackReasonCodes: parseStringArray(value.rigFallbackReasonCodes) }
      : {})
  };
}

function parseSelectionCandidateSummaryByView(
  value: unknown
): GenerationManifestSelectionDiagnostics["selectedCandidateSummaryByView"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, GenerationManifestSelectionCandidateSummary>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseSelectionCandidateSummary(value[view]);
    if (parsed) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseViewNullableNumberMap(
  value: unknown
): Partial<Record<CharacterGenerationView, number | null>> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, number | null>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseOptionalNullableNumber(value[view]);
    if (parsed !== undefined) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseRigStability(value: unknown): GenerationManifestRigStability | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const severity =
    value.severity === "none" || value.severity === "review" || value.severity === "block"
      ? value.severity
      : undefined;
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  const reasonCodes = parseStringArray(value.reasonCodes);
  const fallbackReasonCodes = parseStringArray(value.fallbackReasonCodes);
  const warningViews = parseCharacterGenerationViewArray(value.warningViews);
  const blockingViews = parseCharacterGenerationViewArray(value.blockingViews);
  const anchorConfidenceByView = parseViewNullableNumberMap(value.anchorConfidenceByView);
  const landmarkConsistencyByView = parseViewNullableNumberMap(value.landmarkConsistencyByView);
  const anchorConfidenceOverall = parseOptionalNullableNumber(value.anchorConfidenceOverall);
  const suggestedAction =
    value.suggestedAction === "pick-manually" || value.suggestedAction === "recreate"
      ? value.suggestedAction
      : undefined;

  if (
    !severity &&
    !summary &&
    reasonCodes.length === 0 &&
    fallbackReasonCodes.length === 0 &&
    warningViews.length === 0 &&
    blockingViews.length === 0 &&
    anchorConfidenceByView === undefined &&
    landmarkConsistencyByView === undefined &&
    anchorConfidenceOverall === undefined
  ) {
    return undefined;
  }

  return {
    severity: severity ?? "none",
    summary: summary || `${severity ?? "none"}:${reasonCodes.join(",")}`,
    reasonCodes,
    fallbackReasonCodes,
    ...(warningViews.length > 0 ? { warningViews } : {}),
    ...(blockingViews.length > 0 ? { blockingViews } : {}),
    ...(typeof value.reviewOnly === "boolean" ? { reviewOnly: value.reviewOnly } : {}),
    ...(typeof value.safeFrontExpression === "boolean" ? { safeFrontExpression: value.safeFrontExpression } : {}),
    ...(typeof value.suppressAggressiveYaw === "boolean"
      ? { suppressAggressiveYaw: value.suppressAggressiveYaw }
      : {}),
    ...(typeof value.lockMouthPreset === "boolean" ? { lockMouthPreset: value.lockMouthPreset } : {}),
    ...(anchorConfidenceOverall !== undefined ? { anchorConfidenceOverall } : {}),
    ...(anchorConfidenceByView ? { anchorConfidenceByView } : {}),
    ...(landmarkConsistencyByView ? { landmarkConsistencyByView } : {}),
    ...(suggestedAction ? { suggestedAction } : {})
  };
}

function parseAutoRerouteViewDelta(value: unknown): GenerationManifestAutoRerouteViewDelta | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    ...(typeof value.beforeCandidateId === "string" && value.beforeCandidateId.trim().length > 0
      ? { beforeCandidateId: value.beforeCandidateId.trim() }
      : {}),
    ...(typeof value.afterCandidateId === "string" && value.afterCandidateId.trim().length > 0
      ? { afterCandidateId: value.afterCandidateId.trim() }
      : {}),
    ...(parseOptionalNumber(value.scoreDelta) !== undefined ? { scoreDelta: parseOptionalNumber(value.scoreDelta) } : {}),
    ...(parseOptionalNullableNumber(value.consistencyDelta) !== undefined
      ? { consistencyDelta: parseOptionalNullableNumber(value.consistencyDelta) }
      : {}),
    ...(parseOptionalNumber(value.warningDelta) !== undefined
      ? { warningDelta: parseOptionalNumber(value.warningDelta) }
      : {}),
    ...(parseOptionalNumber(value.rejectionDelta) !== undefined
      ? { rejectionDelta: parseOptionalNumber(value.rejectionDelta) }
      : {})
  };
}

function parseAutoRerouteViewDeltaByView(
  value: unknown
): GenerationManifestAutoReroute["viewDeltaByView"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: Partial<Record<CharacterGenerationView, GenerationManifestAutoRerouteViewDelta>> = {};
  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const parsed = parseAutoRerouteViewDelta(value[view]);
    if (parsed) {
      out[view] = parsed;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseAutoReroute(value: unknown): GenerationManifestAutoReroute | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const triggers = parseStringArray(value.triggers);
  const targetViews = parseCharacterGenerationViewArray(value.targetViews);
  const notes = parseStringArray(value.notes);
  const initialMissingViews = parseCharacterGenerationViewArray(value.initialMissingViews);
  const finalMissingViews = parseCharacterGenerationViewArray(value.finalMissingViews);
  const initialLowQualityViews = parseCharacterGenerationViewArray(value.initialLowQualityViews);
  const finalLowQualityViews = parseCharacterGenerationViewArray(value.finalLowQualityViews);
  const initialPackCoherence = parsePackCoherence(value.initialPackCoherence);
  const finalPackCoherence = parsePackCoherence(value.finalPackCoherence);
  const viewDeltaByView = parseAutoRerouteViewDeltaByView(value.viewDeltaByView);

  return {
    attempted: typeof value.attempted === "boolean" ? value.attempted : false,
    ...(typeof value.strategy === "string" && value.strategy.trim().length > 0 ? { strategy: value.strategy.trim() } : {}),
    triggers,
    targetViews,
    ...(parseOptionalNumber(value.candidateCountBoost) !== undefined
      ? { candidateCountBoost: parseOptionalNumber(value.candidateCountBoost) }
      : {}),
    ...(parseOptionalNumber(value.acceptedScoreThresholdBoost) !== undefined
      ? { acceptedScoreThresholdBoost: parseOptionalNumber(value.acceptedScoreThresholdBoost) }
      : {}),
    ...(parseOptionalNumber(value.seedOffset) !== undefined ? { seedOffset: parseOptionalNumber(value.seedOffset) } : {}),
    notes,
    initialMissingViews,
    ...(Array.isArray(value.finalMissingViews) ? { finalMissingViews } : {}),
    initialLowQualityViews,
    ...(Array.isArray(value.finalLowQualityViews) ? { finalLowQualityViews } : {}),
    ...(initialPackCoherence ? { initialPackCoherence } : {}),
    ...(finalPackCoherence ? { finalPackCoherence } : {}),
    ...(viewDeltaByView ? { viewDeltaByView } : {}),
    ...(typeof value.recovered === "boolean" ? { recovered: value.recovered } : {}),
    ...(typeof value.skippedReason === "string" && value.skippedReason.trim().length > 0
      ? { skippedReason: value.skippedReason.trim() }
      : {})
  };
}

function parseSelectionRisk(value: unknown): GenerationManifestSelectionRisk | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const level =
    value.level === "none" || value.level === "review" || value.level === "block" ? value.level : undefined;
  const reasonCodes = parseStringArray(value.reasonCodes);
  const suggestedAction =
    value.suggestedAction === "pick-manually" || value.suggestedAction === "recreate"
      ? value.suggestedAction
      : undefined;
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";

  if (!level && reasonCodes.length === 0 && !suggestedAction && !summary) {
    return undefined;
  }

  return {
    level: level ?? "none",
    reasonCodes,
    ...(suggestedAction ? { suggestedAction } : {}),
    summary: summary || `${level ?? "none"}:${reasonCodes.join(",")}`
  };
}

function parseQualityEmbargo(value: unknown): GenerationManifestQualityEmbargo | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const level =
    value.level === "none" || value.level === "review" || value.level === "block" ? value.level : undefined;
  const reasonCodes = parseStringArray(value.reasonCodes);
  const suggestedAction =
    value.suggestedAction === "pick-manually" || value.suggestedAction === "recreate"
      ? value.suggestedAction
      : undefined;
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  const blockingViews = parseCharacterGenerationViewArray(value.blockingViews);
  const warningViews = parseCharacterGenerationViewArray(value.warningViews);
  const defectFamiliesByView = parseViewStringArrayMap(value.defectFamiliesByView);

  if (!level && reasonCodes.length === 0 && !suggestedAction && !summary && blockingViews.length === 0 && warningViews.length === 0 && !defectFamiliesByView) {
    return undefined;
  }

  return {
    level: level ?? "none",
    reasonCodes,
    ...(suggestedAction ? { suggestedAction } : {}),
    summary: summary || `${level ?? "none"}:${reasonCodes.join(",")}`,
    ...(blockingViews.length > 0 ? { blockingViews } : {}),
    ...(warningViews.length > 0 ? { warningViews } : {}),
    ...(defectFamiliesByView ? { defectFamiliesByView } : {})
  };
}

function parsePackDefectSummary(value: unknown): GenerationManifestPackDefectSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const defectFamiliesByView = parseViewStringArrayMap(value.defectFamiliesByView);
  const persistentFamiliesByView = parseViewStringArrayMap(value.persistentFamiliesByView);
  const repeatedFamilies = parseStringArray(value.repeatedFamilies);
  const blockingFamilies = parseStringArray(value.blockingFamilies);
  const warningFamilies = parseStringArray(value.warningFamilies);

  if (
    !defectFamiliesByView &&
    !persistentFamiliesByView &&
    repeatedFamilies.length === 0 &&
    blockingFamilies.length === 0 &&
    warningFamilies.length === 0
  ) {
    return undefined;
  }

  return {
    repeatedFamilies,
    blockingFamilies,
    warningFamilies,
    ...(defectFamiliesByView ? { defectFamiliesByView } : {}),
    ...(persistentFamiliesByView ? { persistentFamiliesByView } : {})
  };
}

function parseFinalQualityFirewall(value: unknown): GenerationManifestFinalQualityFirewall | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const level =
    value.level === "none" || value.level === "review" || value.level === "block" ? value.level : undefined;
  const summary = typeof value.summary === "string" ? value.summary : undefined;
  if (!level || !summary) {
    return undefined;
  }

  const reasonCodes = parseStringArray(value.reasonCodes);
  const blockingViews = parseCharacterGenerationViewArray(value.blockingViews);
  const warningViews = parseCharacterGenerationViewArray(value.warningViews);
  const repeatedFamilies = parseStringArray(value.repeatedFamilies);
  const persistentFamiliesByView = parseViewStringArrayMap(value.persistentFamiliesByView);

  return {
    level,
    reasonCodes,
    ...(value.suggestedAction === "pick-manually" || value.suggestedAction === "recreate"
      ? { suggestedAction: value.suggestedAction }
      : {}),
    summary,
    ...(blockingViews.length > 0 ? { blockingViews } : {}),
    ...(warningViews.length > 0 ? { warningViews } : {}),
    ...(repeatedFamilies.length > 0 ? { repeatedFamilies } : {}),
    ...(persistentFamiliesByView ? { persistentFamiliesByView } : {})
  };
}

function parseDecisionOutcome(value: unknown): GenerationManifestDecisionOutcome | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const kind =
    value.kind === "auto_selected" || value.kind === "hitl_review" || value.kind === "hitl_selected"
      ? value.kind
      : undefined;
  const status =
    value.status === "ok" || value.status === "review" || value.status === "blocked" ? value.status : undefined;
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  const reasonCodes = parseStringArray(value.reasonCodes);
  const recoveredViews = parseCharacterGenerationViewArray(value.recoveredViews);
  const escalatedAction =
    value.escalatedAction === "pick-manually" || value.escalatedAction === "recreate"
      ? value.escalatedAction
      : undefined;

  if (!kind && !status && !summary && reasonCodes.length === 0) {
    return undefined;
  }

  return {
    kind: kind ?? "hitl_review",
    status: status ?? "review",
    ...(typeof value.sourceStage === "string" && value.sourceStage.trim().length > 0
      ? { sourceStage: value.sourceStage.trim() }
      : {}),
    summary: summary || `${status ?? "review"}:${kind ?? "hitl_review"}`,
    reasonCodes,
    recoveryAttempted: typeof value.recoveryAttempted === "boolean" ? value.recoveryAttempted : false,
    ...(recoveredViews.length > 0 ? { recoveredViews } : {}),
    ...(parseRuntimeBucketLevel(value.worstRuntimeBucket)
      ? { worstRuntimeBucket: parseRuntimeBucketLevel(value.worstRuntimeBucket) }
      : {}),
    ...(escalatedAction ? { escalatedAction } : {})
  };
}

function parseWorkflowStage(value: unknown): GenerationManifestWorkflowStage | null {
  if (!isRecord(value)) {
    return null;
  }

  const stage = typeof value.stage === "string" ? value.stage.trim() : "";
  const templateVersion = typeof value.templateVersion === "string" ? value.templateVersion.trim() : "";
  if (!stage || !templateVersion) {
    return null;
  }

  const views = parseCharacterGenerationViewArray(value.views);
  const referenceBankSizeByView = parseViewNumberMap(value.referenceBankSizeByView);
  const referenceMixByView = parseStageReferenceMixByView(value.referenceMixByView);
  const preflightByView = parseStageInputPreflightByView(value.preflightByView);
  const executionViews = parseCharacterGenerationViewArray(value.executionViews);
  const blockedViewsByPreflight = parseCharacterGenerationViewArray(value.blockedViewsByPreflight);
  const warningViewsByPreflight = parseCharacterGenerationViewArray(value.warningViewsByPreflight);
  const adjustmentNotesByView = parseViewStringArrayMap(value.adjustmentNotesByView);
  const directiveProfilesByView = parseDirectiveProfilesByView(value.directiveProfilesByView);
  const repairFromCandidateIds = parseViewStringMap(value.repairFromCandidateIds);
  const observedDefectFamiliesByView = parseViewStringArrayMap(value.observedDefectFamiliesByView);
  const bestCandidateSummaryByView = parseStageCandidateSummaryByView(value.bestCandidateSummaryByView);
  const gateDecisionsByView = parseStageGateDecisionsByView(value.gateDecisionsByView);
  const repairTriageByView = parseStageRepairTriageByView(value.repairTriageByView);
  const repairAcceptanceByView = parseStageRepairAcceptanceByView(value.repairAcceptanceByView);
  const reasonCodes = parseStringArray(value.reasonCodes);
  const triggerViews = parseCharacterGenerationViewArray(value.triggerViews);
  const passedViews = parseCharacterGenerationViewArray(value.passedViews);
  const failedViews = parseCharacterGenerationViewArray(value.failedViews);
  const failureReasonsByView = parseViewStringArrayMap(value.failureReasonsByView);
  const runtimeVariantTags = parseStringArray(value.runtimeVariantTags);

  return {
    stage,
    templateVersion,
    ...(typeof value.templateSpecPath === "string" && value.templateSpecPath.trim().length > 0
      ? { templateSpecPath: value.templateSpecPath.trim() }
      : {}),
    ...(typeof value.origin === "string" && value.origin.trim().length > 0
      ? { origin: value.origin.trim() }
      : {}),
    ...(typeof value.passLabel === "string" && value.passLabel.trim().length > 0
      ? { passLabel: value.passLabel.trim() }
      : {}),
    ...(reasonCodes.length > 0 ? { reasonCodes } : {}),
    ...(triggerViews.length > 0 ? { triggerViews } : {}),
    ...(parseOptionalNumber(value.seedOffset) !== undefined ? { seedOffset: parseOptionalNumber(value.seedOffset) } : {}),
    views,
    candidateCount: parseOptionalNumber(value.candidateCount) ?? 0,
    acceptedScoreThreshold: parseOptionalNumber(value.acceptedScoreThreshold) ?? 0,
    roundsAttempted: parseOptionalNumber(value.roundsAttempted) ?? 0,
    ...(referenceBankSizeByView ? { referenceBankSizeByView } : {}),
    ...(referenceMixByView ? { referenceMixByView } : {}),
    ...(preflightByView ? { preflightByView } : {}),
    ...(executionViews.length > 0 ? { executionViews } : {}),
    ...(blockedViewsByPreflight.length > 0 ? { blockedViewsByPreflight } : {}),
    ...(warningViewsByPreflight.length > 0 ? { warningViewsByPreflight } : {}),
    ...(adjustmentNotesByView ? { adjustmentNotesByView } : {}),
    ...(directiveProfilesByView ? { directiveProfilesByView } : {}),
    ...(repairFromCandidateIds ? { repairFromCandidateIds } : {}),
    ...(observedDefectFamiliesByView ? { observedDefectFamiliesByView } : {}),
    ...(passedViews.length > 0 ? { passedViews } : {}),
    ...(failedViews.length > 0 ? { failedViews } : {}),
    ...(failureReasonsByView ? { failureReasonsByView } : {}),
    ...(runtimeVariantTags.length > 0 ? { runtimeVariantTags } : {}),
    ...(bestCandidateSummaryByView ? { bestCandidateSummaryByView } : {}),
    ...(gateDecisionsByView ? { gateDecisionsByView } : {}),
    ...(repairTriageByView ? { repairTriageByView } : {}),
    ...(repairAcceptanceByView ? { repairAcceptanceByView } : {})
  };
}

function parseWorkflowStages(value: unknown): GenerationManifestWorkflowStage[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const stages = value.map((entry) => parseWorkflowStage(entry)).filter((entry): entry is GenerationManifestWorkflowStage => entry !== null);
  return stages.length > 0 ? stages : undefined;
}

function parseSelectionDiagnostics(value: unknown): GenerationManifestSelectionDiagnostics | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const out: GenerationManifestSelectionDiagnostics = {};
  const packCoherence = parsePackCoherence(value.packCoherence);
  const autoReroute = parseAutoReroute(value.autoReroute);
  const rigStability = parseRigStability(value.rigStability);
  const selectionRisk = parseSelectionRisk(value.selectionRisk);
  const qualityEmbargo = parseQualityEmbargo(value.qualityEmbargo);
  const packDefectSummary = parsePackDefectSummary(value.packDefectSummary);
  const finalQualityFirewall = parseFinalQualityFirewall(value.finalQualityFirewall);
  const decisionOutcome = parseDecisionOutcome(value.decisionOutcome);
  const workflowStages = parseWorkflowStages(value.workflowStages);
  const selectedCandidateSummaryByView = parseSelectionCandidateSummaryByView(value.selectedCandidateSummaryByView);
  if (typeof value.finalSelectionSource === "string" && value.finalSelectionSource.trim().length > 0) {
    out.finalSelectionSource = value.finalSelectionSource.trim();
  }
  const coherenceIssues = parseStringArray(value.coherenceIssues);
  if (coherenceIssues.length > 0) {
    out.coherenceIssues = coherenceIssues;
  }
  if (packCoherence) {
    out.packCoherence = packCoherence;
  }
  if (autoReroute) {
    out.autoReroute = autoReroute;
  }
  if (rigStability) {
    out.rigStability = rigStability;
  }
  if (selectionRisk) {
    out.selectionRisk = selectionRisk;
  }
  if (qualityEmbargo) {
    out.qualityEmbargo = qualityEmbargo;
  }
  if (packDefectSummary) {
    out.packDefectSummary = packDefectSummary;
  }
  if (finalQualityFirewall) {
    out.finalQualityFirewall = finalQualityFirewall;
  }
  if (decisionOutcome) {
    out.decisionOutcome = decisionOutcome;
  }
  if (workflowStages) {
    out.workflowStages = workflowStages;
  }
  if (selectedCandidateSummaryByView) {
    out.selectedCandidateSummaryByView = selectedCandidateSummaryByView;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function parseReferenceContinuity(value: unknown): GenerationManifestReferenceContinuity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    attempted: typeof value.attempted === "boolean" ? value.attempted : false,
    applied: typeof value.applied === "boolean" ? value.applied : false,
    reason: typeof value.reason === "string" ? value.reason : "-",
    ...(typeof value.attemptedSourceSessionId === "string"
      ? { attemptedSourceSessionId: value.attemptedSourceSessionId }
      : {}),
    ...(parseOptionalNumber(value.queuedSessionCount) !== undefined
      ? { queuedSessionCount: parseOptionalNumber(value.queuedSessionCount) }
      : {}),
    ...(parseOptionalNumber(value.uniqueQueuedSessionCount) !== undefined
      ? { uniqueQueuedSessionCount: parseOptionalNumber(value.uniqueQueuedSessionCount) }
      : {}),
    ...(parseOptionalNumber(value.duplicateSessionCount) !== undefined
      ? { duplicateSessionCount: parseOptionalNumber(value.duplicateSessionCount) }
      : {}),
    ...(parseOptionalNumber(value.searchedSessionCount) !== undefined
      ? { searchedSessionCount: parseOptionalNumber(value.searchedSessionCount) }
      : {}),
    ...(parseOptionalNumber(value.preferredPoolCount) !== undefined
      ? { preferredPoolCount: parseOptionalNumber(value.preferredPoolCount) }
      : {}),
    ...(parseOptionalNumber(value.fallbackPoolCount) !== undefined
      ? { fallbackPoolCount: parseOptionalNumber(value.fallbackPoolCount) }
      : {}),
    ...(value.sourcePool === "preferred" || value.sourcePool === "fallback" ? { sourcePool: value.sourcePool } : {}),
    ...(typeof value.candidatePicked === "boolean" ? { candidatePicked: value.candidatePicked } : {}),
    ...(parseOptionalNullableNumber(value.candidateScore) !== undefined
      ? { candidateScore: parseOptionalNullableNumber(value.candidateScore) }
      : {}),
    ...(parseOptionalNullableNumber(value.candidateRejectionCount) !== undefined
      ? { candidateRejectionCount: parseOptionalNullableNumber(value.candidateRejectionCount) }
      : {}),
    ...(typeof value.candidateUpdatedAt === "string" || value.candidateUpdatedAt === null
      ? { candidateUpdatedAt: value.candidateUpdatedAt as string | null }
      : {})
  };
}

function parseReference(value: unknown): GenerationManifestReference | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const continuity = parseReferenceContinuity(value.continuity);
  const starterPathsByView = parseViewStringMap(value.starterPathsByView);
  return {
    assetId: typeof value.assetId === "string" ? value.assetId : value.assetId === null ? null : null,
    ...(typeof value.sourceSessionId === "string" || value.sourceSessionId === null
      ? { sourceSessionId: value.sourceSessionId as string | null }
      : {}),
    ...(typeof value.starterPath === "string" || value.starterPath === null
      ? { starterPath: value.starterPath as string | null }
      : {}),
    ...(starterPathsByView ? { starterPathsByView } : {}),
    phash: typeof value.phash === "string" ? value.phash : value.phash === null ? null : null,
    ...(continuity ? { continuity } : {})
  };
}

function parseManifestQualityProfile(value: unknown): GenerationManifest["qualityProfile"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const postprocessPlan = Array.isArray(value.postprocessPlan)
    ? value.postprocessPlan.filter((item): item is string => typeof item === "string")
    : undefined;

  return {
    id: typeof value.id === "string" ? value.id : "",
    ...(typeof value.label === "string" ? { label: value.label } : {}),
    ...(typeof value.targetStyle === "string" ? { targetStyle: value.targetStyle } : {}),
    ...(typeof value.qualityTier === "string" ? { qualityTier: value.qualityTier } : {}),
    ...(typeof value.sampler === "string" ? { sampler: value.sampler } : {}),
    ...(typeof value.scheduler === "string" ? { scheduler: value.scheduler } : {}),
    ...(parseOptionalNumber(value.steps) !== undefined ? { steps: parseOptionalNumber(value.steps) } : {}),
    ...(parseOptionalNumber(value.cfg) !== undefined ? { cfg: parseOptionalNumber(value.cfg) } : {}),
    ...(parseOptionalNumber(value.width) !== undefined ? { width: parseOptionalNumber(value.width) } : {}),
    ...(parseOptionalNumber(value.height) !== undefined ? { height: parseOptionalNumber(value.height) } : {}),
    ...(parseOptionalNumber(value.maxShift) !== undefined ? { maxShift: parseOptionalNumber(value.maxShift) } : {}),
    ...(parseOptionalNumber(value.baseShift) !== undefined ? { baseShift: parseOptionalNumber(value.baseShift) } : {}),
    ...(postprocessPlan ? { postprocessPlan } : {}),
    ...(parseOptionalNumber(value.upscaleLongSide) !== undefined
      ? { upscaleLongSide: parseOptionalNumber(value.upscaleLongSide) }
      : {}),
    ...(parseOptionalNumber(value.sharpen) !== undefined ? { sharpen: parseOptionalNumber(value.sharpen) } : {}),
    ...(parseOptionalNumber(value.saturationBoost) !== undefined
      ? { saturationBoost: parseOptionalNumber(value.saturationBoost) }
      : {})
  };
}

function parseManifestCandidate(entry: unknown): GenerationManifestCandidate | null {
  if (!isRecord(entry)) {
    return null;
  }

  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  const viewRaw = typeof entry.view === "string" ? entry.view.trim() : "";
  const view = viewRaw === "front" || viewRaw === "threeQuarter" || viewRaw === "profile" ? viewRaw : null;
  const candidateIndex = typeof entry.candidateIndex === "number" ? entry.candidateIndex : 0;
  const seed = typeof entry.seed === "number" ? entry.seed : 0;
  const mimeType = typeof entry.mimeType === "string" && entry.mimeType.trim().length > 0 ? entry.mimeType : "image/png";
  const filePath = typeof entry.filePath === "string" ? entry.filePath.trim() : "";

  if (!id || !view || !filePath) {
    return null;
  }

  const score = typeof entry.score === "number" ? entry.score : 0;
  const styleScore = typeof entry.styleScore === "number" ? entry.styleScore : 0;
  const referenceSimilarity = typeof entry.referenceSimilarity === "number" ? entry.referenceSimilarity : null;
  const consistencyScore = typeof entry.consistencyScore === "number" ? entry.consistencyScore : null;
  const warnings = parseStringArray(entry.warnings);
  const rejections = parseStringArray(entry.rejections);
  const providerMeta = parseCandidateProviderMeta(entry.providerMeta);
  const breakdown = isRecord(entry.breakdown)
    ? {
        ...(typeof entry.breakdown.alphaScore === "number" ? { alphaScore: entry.breakdown.alphaScore } : {}),
        ...(typeof entry.breakdown.occupancyScore === "number"
          ? { occupancyScore: entry.breakdown.occupancyScore }
          : {}),
        ...(typeof entry.breakdown.sharpnessScore === "number"
          ? { sharpnessScore: entry.breakdown.sharpnessScore }
          : {}),
        ...(typeof entry.breakdown.noiseScore === "number" ? { noiseScore: entry.breakdown.noiseScore } : {}),
        ...(typeof entry.breakdown.watermarkScore === "number"
          ? { watermarkScore: entry.breakdown.watermarkScore }
          : {}),
        ...(typeof entry.breakdown.resolutionScore === "number"
          ? { resolutionScore: entry.breakdown.resolutionScore }
          : {}),
        ...(typeof entry.breakdown.referenceScore === "number"
          ? { referenceScore: entry.breakdown.referenceScore }
          : {}),
        ...(typeof entry.breakdown.styleScore === "number" ? { styleScore: entry.breakdown.styleScore } : {}),
        ...(typeof entry.breakdown.qualityScore === "number"
          ? { qualityScore: entry.breakdown.qualityScore }
          : {}),
        ...(typeof entry.breakdown.consistencyScore === "number" || entry.breakdown.consistencyScore === null
          ? { consistencyScore: entry.breakdown.consistencyScore as number | null }
          : {}),
        ...(typeof entry.breakdown.generationRound === "number"
          ? { generationRound: entry.breakdown.generationRound }
          : {}),
        ...(isRecord(entry.breakdown.consistencyParts)
          ? {
              consistencyParts: {
                ...(typeof entry.breakdown.consistencyParts.phash === "number"
                  ? { phash: entry.breakdown.consistencyParts.phash }
                  : {}),
                ...(typeof entry.breakdown.consistencyParts.palette === "number"
                  ? { palette: entry.breakdown.consistencyParts.palette }
                  : {}),
                ...(typeof entry.breakdown.consistencyParts.bboxCenter === "number"
                  ? { bboxCenter: entry.breakdown.consistencyParts.bboxCenter }
                  : {}),
                ...(typeof entry.breakdown.consistencyParts.bboxScale === "number"
                  ? { bboxScale: entry.breakdown.consistencyParts.bboxScale }
                  : {})
              }
            }
          : {})
      }
    : undefined;

  return {
    id,
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
    ...(providerMeta ? { providerMeta } : {}),
    ...(breakdown ? { breakdown } : {})
  };
}

function readGenerationManifest(manifestPath: string): GenerationManifest | null {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(raw)) {
    return null;
  }

  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.map((entry) => parseManifestCandidate(entry)).filter((entry): entry is GenerationManifestCandidate => entry !== null)
    : [];
  const statusRaw = typeof raw.status === "string" ? raw.status : "PENDING_HITL";
  const status =
    statusRaw === "PENDING_HITL" || statusRaw === "AUTO_SELECTED" || statusRaw === "HITL_SELECTED"
      ? statusRaw
      : "PENDING_HITL";

  const episodeId = typeof raw.episodeId === "string" ? raw.episodeId : "";
  const characterPackId = typeof raw.characterPackId === "string" ? raw.characterPackId : "";
  const provider = typeof raw.provider === "string" ? raw.provider : "mock";
  const workflowHash = typeof raw.workflowHash === "string" ? raw.workflowHash : "";
  const mode = typeof raw.mode === "string" ? raw.mode : "new";
  const promptPreset = typeof raw.promptPreset === "string" ? raw.promptPreset : DEFAULT_PROMPT_PRESET;
  const species = typeof raw.species === "string" ? raw.species : undefined;
  const qualityProfileId = typeof raw.qualityProfileId === "string" ? raw.qualityProfileId : undefined;
  const qualityProfile = parseManifestQualityProfile(raw.qualityProfile);
  const positivePrompt = typeof raw.positivePrompt === "string" ? raw.positivePrompt : "";
  const negativePrompt = typeof raw.negativePrompt === "string" ? raw.negativePrompt : "";
  const selectionHints = isRecord(raw.selectionHints)
    ? {
        ...(typeof raw.selectionHints.minAcceptedScore === "number"
          ? { minAcceptedScore: raw.selectionHints.minAcceptedScore }
          : {}),
        ...(typeof raw.selectionHints.frontMasterMinAcceptedScore === "number"
          ? { frontMasterMinAcceptedScore: raw.selectionHints.frontMasterMinAcceptedScore }
          : {}),
        ...(typeof raw.selectionHints.autoRetryRounds === "number"
          ? { autoRetryRounds: raw.selectionHints.autoRetryRounds }
          : {}),
        ...(typeof raw.selectionHints.frontMasterCandidateCount === "number"
          ? { frontMasterCandidateCount: raw.selectionHints.frontMasterCandidateCount }
          : {}),
        ...(typeof raw.selectionHints.repairCandidateCount === "number"
          ? { repairCandidateCount: raw.selectionHints.repairCandidateCount }
          : {}),
        ...(typeof raw.selectionHints.repairScoreFloor === "number"
          ? { repairScoreFloor: raw.selectionHints.repairScoreFloor }
          : {}),
        ...(typeof raw.selectionHints.sequentialReference === "boolean"
          ? { sequentialReference: raw.selectionHints.sequentialReference }
          : {}),
        ...(typeof raw.selectionHints.prioritizeConsistency === "boolean"
          ? { prioritizeConsistency: raw.selectionHints.prioritizeConsistency }
          : {}),
        ...(typeof raw.selectionHints.preferMultiReference === "boolean"
          ? { preferMultiReference: raw.selectionHints.preferMultiReference }
          : {})
      }
    : undefined;
  const packCoherence = parsePackCoherence(raw.packCoherence);
  const autoReroute = parseAutoReroute(raw.autoReroute);
  const reference = parseReference(raw.reference);
  const workflowStages = parseWorkflowStages(raw.workflowStages);
  const providerWorkflowExports = isRecord(raw.providerMeta) ? parseWorkflowFilePaths(raw.providerMeta.workflowExports) : undefined;
  const providerSelectionDiagnostics = isRecord(raw.providerMeta)
    ? parseSelectionDiagnostics(raw.providerMeta.selectionDiagnostics)
    : undefined;
  const providerMeta = isRecord(raw.providerMeta)
    ? {
        ...(typeof raw.providerMeta.qualityProfileId === "string"
          ? { qualityProfileId: raw.providerMeta.qualityProfileId }
          : {}),
        ...(isRecord(raw.providerMeta.runSettings)
          ? {
              runSettings: {
                ...(typeof raw.providerMeta.runSettings.sampler === "string"
                  ? { sampler: raw.providerMeta.runSettings.sampler }
                  : {}),
                ...(typeof raw.providerMeta.runSettings.scheduler === "string"
                  ? { scheduler: raw.providerMeta.runSettings.scheduler }
                  : {}),
                ...(parseOptionalNumber(raw.providerMeta.runSettings.steps) !== undefined
                  ? { steps: parseOptionalNumber(raw.providerMeta.runSettings.steps) }
                  : {}),
                ...(parseOptionalNumber(raw.providerMeta.runSettings.cfg) !== undefined
                  ? { cfg: parseOptionalNumber(raw.providerMeta.runSettings.cfg) }
                  : {}),
                ...(parseOptionalNumber(raw.providerMeta.runSettings.width) !== undefined
                  ? { width: parseOptionalNumber(raw.providerMeta.runSettings.width) }
                  : {}),
                ...(parseOptionalNumber(raw.providerMeta.runSettings.height) !== undefined
                  ? { height: parseOptionalNumber(raw.providerMeta.runSettings.height) }
                  : {})
              }
            }
          : {}),
        ...(typeof raw.providerMeta.workflowStage === "string"
          ? { workflowStage: raw.providerMeta.workflowStage }
          : {}),
        ...(typeof raw.providerMeta.workflowTemplateVersion === "string"
          ? { workflowTemplateVersion: raw.providerMeta.workflowTemplateVersion }
          : {}),
        ...(providerWorkflowExports ? { workflowExports: providerWorkflowExports } : {}),
        ...(Array.isArray(raw.providerMeta.warnings)
          ? {
              warnings: raw.providerMeta.warnings.filter((item): item is string => typeof item === "string")
            }
          : {}),
        ...(providerSelectionDiagnostics ? { selectionDiagnostics: providerSelectionDiagnostics } : {})
      }
    : undefined;
  const fallbackHashes = computeManifestHashes({
    episodeId,
    characterPackId,
    mode,
    promptPreset,
    ...(species ? { species } : {}),
    positivePrompt,
    negativePrompt,
    workflowHash,
    provider,
    candidates
  });

  return {
    schemaVersion: typeof raw.schemaVersion === "string" ? raw.schemaVersion : "1.0",
    ...(typeof raw.templateVersion === "string" ? { templateVersion: raw.templateVersion } : {}),
    inputHash:
      typeof raw.inputHash === "string" && raw.inputHash.trim().length > 0
        ? raw.inputHash
        : fallbackHashes.inputHash,
    manifestHash:
      typeof raw.manifestHash === "string" && raw.manifestHash.trim().length > 0
        ? raw.manifestHash
        : fallbackHashes.manifestHash,
    status,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : undefined,
    episodeId,
    characterPackId,
    provider,
    providerRequested: typeof raw.providerRequested === "string" ? raw.providerRequested : null,
    providerWarning: typeof raw.providerWarning === "string" ? raw.providerWarning : null,
    workflowHash,
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : "",
    mode,
    promptPreset,
    ...(species ? { species } : {}),
    ...(qualityProfileId ? { qualityProfileId } : {}),
    ...(qualityProfile ? { qualityProfile } : {}),
    positivePrompt,
    negativePrompt,
    guardrails: parseStringArray(raw.guardrails),
    ...(selectionHints ? { selectionHints } : {}),
    ...(packCoherence ? { packCoherence } : {}),
    ...(autoReroute ? { autoReroute } : {}),
    ...(reference ? { reference } : {}),
    ...(providerMeta ? { providerMeta } : {}),
    ...(workflowStages ? { workflowStages } : {}),
    candidates,
    selectedByView: isRecord(raw.selectedByView)
      ? (raw.selectedByView as GenerationManifest["selectedByView"])
      : {}
  };
}

function readGenerationProgress(progressPath: string): {
  schemaVersion: string;
  updatedAt: string;
  jobId: string;
  episodeId: string;
  characterPackId: string;
  sessionId: string | null;
  stage: string;
  progress: number;
  details: Record<string, unknown>;
} | null {
  if (!fs.existsSync(progressPath)) {
    return null;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(progressPath, "utf8")) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(raw)) {
    return null;
  }

  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : "";
  const stage = typeof raw.stage === "string" ? raw.stage : "";
  const jobId = typeof raw.jobId === "string" ? raw.jobId : "";
  const episodeId = typeof raw.episodeId === "string" ? raw.episodeId : "";
  const characterPackId = typeof raw.characterPackId === "string" ? raw.characterPackId : "";
  const progress = typeof raw.progress === "number" && Number.isFinite(raw.progress) ? raw.progress : -1;
  if (!updatedAt || !stage || !jobId || !episodeId || !characterPackId || progress < 0) {
    return null;
  }

  return {
    schemaVersion: typeof raw.schemaVersion === "string" ? raw.schemaVersion : "1.0",
    updatedAt,
    jobId,
    episodeId,
    characterPackId,
    sessionId: typeof raw.sessionId === "string" && raw.sessionId.length > 0 ? raw.sessionId : null,
    stage,
    progress,
    details: isRecord(raw.details) ? raw.details : {}
  };
}

function extractChannelStylePresets(channelBibleJson: unknown): ChannelStylePreset[] {
  if (!isRecord(channelBibleJson)) {
    return [];
  }

  const candidates: unknown[] = [];
  if (Array.isArray(channelBibleJson.character_generator_style_presets)) {
    candidates.push(...channelBibleJson.character_generator_style_presets);
  }
  if (isRecord(channelBibleJson.character_generator) && Array.isArray(channelBibleJson.character_generator.style_presets)) {
    candidates.push(...channelBibleJson.character_generator.style_presets);
  }
  if (isRecord(channelBibleJson.character) && Array.isArray(channelBibleJson.character.style_presets)) {
    candidates.push(...channelBibleJson.character.style_presets);
  }

  const out: ChannelStylePreset[] = [];
  const seen = new Set<string>();
  for (const item of candidates) {
    if (!isRecord(item)) {
      continue;
    }
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const label = typeof item.label === "string" && item.label.trim().length > 0 ? item.label.trim() : id;
    const positivePrompt =
      typeof item.positivePrompt === "string"
        ? item.positivePrompt.trim()
        : typeof item.positive === "string"
          ? item.positive.trim()
          : undefined;
    const negativePrompt =
      typeof item.negativePrompt === "string"
        ? item.negativePrompt.trim()
        : typeof item.negative === "string"
          ? item.negative.trim()
          : undefined;

    out.push({
      id,
      label,
      ...(positivePrompt && positivePrompt.length > 0 ? { positivePrompt } : {}),
      ...(negativePrompt && negativePrompt.length > 0 ? { negativePrompt } : {})
    });
  }

  return out;
}

function extractChannelPromptRules(channelBibleJson: unknown): {
  forbiddenTerms: string[];
  negativePromptTerms: string[];
} {
  if (!isRecord(channelBibleJson)) {
    return {
      forbiddenTerms: [],
      negativePromptTerms: []
    };
  }

  const forbiddenTerms = Array.from(
    new Set([
      ...parseStringArrayAtPath(channelBibleJson, ["policy", "forbidden_words"]),
      ...parseStringArrayAtPath(channelBibleJson, ["policy", "banned_phrases"]),
      ...parseStringArrayAtPath(channelBibleJson, ["character_generator", "forbidden_terms"])
    ])
  );

  const negativePromptTerms = Array.from(
    new Set([
      ...parseStringArrayAtPath(channelBibleJson, ["character_generator", "negative_prompt_terms"]),
      ...parseStringArrayAtPath(channelBibleJson, ["policy", "negative_prompt_terms"])
    ])
  );

  return {
    forbiddenTerms,
    negativePromptTerms
  };
}

function readStringAtPath(root: unknown, keys: string[]): string | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return typeof current === "string" && current.trim().length > 0 ? current.trim() : null;
}

function formatStudioDateTime(value: Date | null | undefined): string {
  return value ? value.toLocaleString("ko-KR", { hour12: false }) : "-";
}

function basenameOrDash(filePath: string | null | undefined): string {
  return filePath ? path.basename(filePath) : "-";
}

function formatLineageTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const time = new Date(value);
  if (!Number.isNaN(time.getTime())) {
    return time.toLocaleString("ko-KR", { hour12: false });
  }
  return value;
}

function renderLineageLinks(links: Array<{ label: string; href: string | null }>): string {
  const items = links
    .filter((link) => link.href)
    .map((link) => `<a href="${escHtml(link.href)}">${escHtml(link.label)}</a>`)
    .join("");
  return items ? `<div class="quick-links">${items}</div>` : "";
}

function buildCharacterPackLineageSection(input: {
  lineage: CharacterPackLineage | null;
  selectedPackId: string;
  activePackId: string | null;
  compareHref: string | null;
}): string {
  if (!input.lineage) {
    return `<section class="card"><h3>Pack Lineage / Provenance</h3><div class="error">No generated character artifact root was found for <strong>${escHtml(
      input.selectedPackId
    )}</strong>. This review surface only reads existing generated pack artifacts. It does not rerun generation, and it exists to explain how preview, QC, repair tasks, and compare context connect.</div>${renderLineageLinks([
      input.compareHref ? { label: "Compare vs active pack", href: input.compareHref } : null
    ].filter((item): item is { label: string; href: string } => Boolean(item)))}</section>`;
  }

  const lineage = input.lineage;
  const acceptanceTone = uiBadge(lineage.acceptanceStatus ?? "UNKNOWN");
  const qcTone = lineage.qcFailedCount > 0 ? "bad" : lineage.qcTotalCount > 0 ? "ok" : "muted";
  const repairTone = lineage.repairOpenCount > 0 ? "warn" : "ok";
  const actionLinks = renderLineageLinks(
    [
      { label: "Manifest", href: lineage.manifestUrl },
      { label: "Pack Meta", href: lineage.packMetaUrl },
      { label: "Pack JSON", href: lineage.packJsonUrl },
      { label: "Proposal", href: lineage.proposalUrl },
      { label: "Pack QC", href: lineage.qcReportUrl },
      { label: "Repair Tasks", href: lineage.repairTasksUrl },
      input.compareHref ? { label: "Compare vs active pack", href: input.compareHref } : null
    ].filter((item): item is { label: string; href: string | null } => Boolean(item))
  );

  const summaryCards = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:12px"><div style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#f8fbff"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5f7288">Pack Build</div><p style="margin:8px 0 0"><strong>${escHtml(
    formatLineageTimestamp(lineage.builtAt)
  )}</strong></p><p style="margin:6px 0 0;color:#516175">source: ${escHtml(lineage.sourceLabel)}</p><p style="margin:6px 0 0;color:#516175">manifest: ${escHtml(
    basenameOrDash(lineage.sourceManifestPath)
  )}</p></div><div style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#f8fbff"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5f7288">Acceptance Gate</div><p style="margin:8px 0 0"><span class="badge ${acceptanceTone}">${escHtml(
    lineage.acceptanceStatus ?? "unknown"
  )}</span></p><p style="margin:6px 0 0;color:#516175">QC: <span class="badge ${qcTone}">${escHtml(
    lineage.qcFailedCount > 0 ? `${lineage.qcFailedCount} flagged` : lineage.qcTotalCount > 0 ? "clear" : "missing"
  )}</span></p><p style="margin:6px 0 0;color:#516175">front master: ${escHtml(
    lineage.approvedFrontMasterPresent === null ? "-" : lineage.approvedFrontMasterPresent ? "approved" : "missing"
  )}</p></div><div style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#f8fbff"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5f7288">Repair Queue</div><p style="margin:8px 0 0"><span class="badge ${repairTone}">${escHtml(
    lineage.repairOpenCount > 0 ? `${lineage.repairOpenCount} open` : "clear"
  )}</span></p><p style="margin:6px 0 0;color:#516175">active pack: ${escHtml(input.activePackId ?? "-")}</p><p style="margin:6px 0 0;color:#516175">source image: ${escHtml(
    basenameOrDash(lineage.sourceImageRef)
  )}</p></div></div>`;
  const rigSummary = lineage.rigSummary;
  const rigReviewTone =
    rigSummary?.reviewOnly === true
      ? "warn"
      : rigSummary
        ? "ok"
        : "muted";
  const rigReviewLabel =
    rigSummary?.reviewOnly === true
      ? "review-only"
      : rigSummary
        ? "clear"
        : "not recorded";
  const rigViewRows = (["front", "threeQuarter", "profile"] as const)
    .map((view) => {
      const confidence = rigSummary?.anchorConfidenceByView?.[view];
      const byView = rigSummary?.byView?.[view];
      return `<tr><td>${escHtml(view)}</td><td>${escHtml(
        formatMetric(confidence)
      )}</td><td>${escHtml(byView?.presentAnchorIds.join(", ") || "none")}</td><td>${escHtml(
        byView?.missingAnchorIds.join(", ") || "none"
      )}</td><td>${escHtml(byView?.notes ?? "-")}</td></tr>`;
    })
    .join("");
  const rigSection = rigSummary
    ? `<section class="card" style="margin-top:16px"><h4>Rig / Anchor Surface</h4><p>Pack-level rig evidence stays above raw artifacts so a reviewer can decide whether this pack is clear, review-only, or should return to compare.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px"><div style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#f8fbff"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5f7288">Fallback State</div><p style="margin:8px 0 0"><span class="badge ${rigReviewTone}">${escHtml(
        rigReviewLabel
      )}</span></p><p style="margin:6px 0 0;color:#516175">notes: ${escHtml(
        rigSummary.reviewNotes.join(" / ") || "none"
      )}</p></div><div style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#f8fbff"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5f7288">Anchor Confidence</div><p style="margin:8px 0 0"><strong>${escHtml(
        formatMetric(rigSummary.anchorConfidenceOverall)
      )}</strong></p><p style="margin:6px 0 0;color:#516175">covered=${escHtml(
        rigSummary.coveredViews.join(", ") || "none"
      )} / missing=${escHtml(rigSummary.missingViews.join(", ") || "none")}</p><p style="margin:6px 0 0;color:#516175">${escHtml(
        rigSummary.confidenceNotes ?? "confidence summary not recorded"
      )}</p></div><div style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#f8fbff"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5f7288">Anchor Review</div><p style="margin:8px 0 0;color:#516175">low confidence: ${escHtml(
        rigSummary.lowConfidenceAnchorIds.slice(0, 4).join(", ") || "none"
      )}</p><p style="margin:6px 0 0;color:#516175">missing anchors: ${escHtml(
        rigSummary.missingAnchorIds.slice(0, 4).join(", ") || "none"
      )}</p><p style="margin:6px 0 0;color:#516175">${
        input.compareHref ? `Linked compare is available for this pack.` : "No linked compare route is active."
      }</p></div></div><div class="asset-table-wrap" style="margin-top:12px"><table><thead><tr><th>View</th><th>Confidence</th><th>Present Anchors</th><th>Missing Anchors</th><th>Notes</th></tr></thead><tbody>${rigViewRows}</tbody></table></div></section>`
    : `<section class="card" style="margin-top:16px"><h4>Rig / Anchor Surface</h4><div class="notice">No pack-level rig summary was recorded in manifest or pack metadata yet.</div></section>`;

  const viewCards = lineage.viewEntries
    .map((entry) => {
      const tone = entry.approved === true ? "ok" : entry.approved === false ? "warn" : "muted";
      const preview = entry.fileUrl
        ? `<div style="border:1px solid #d8e1ec;border-radius:10px;background:#eef3f8;padding:8px;margin-bottom:10px"><img src="${escHtml(
            entry.fileUrl
          )}" alt="${escHtml(entry.view)} lineage asset" loading="lazy" style="display:block;width:100%;max-height:200px;object-fit:contain;border-radius:8px"/></div>`
        : "";
      const history =
        entry.repairHistory.length > 0
          ? `<ul style="margin:8px 0 0 18px;padding:0">${entry.repairHistory
              .slice(0, 3)
              .map((item) => `<li>${escHtml(item)}</li>`)
              .join("")}${entry.repairHistory.length > 3 ? `<li>+${entry.repairHistory.length - 3} more</li>` : ""}</ul>`
          : `<p style="margin:8px 0 0;color:#516175">repair history: none</p>`;
      return `<article style="padding:14px;border:1px solid #d8e1ec;border-radius:12px;background:#fff"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><h4 style="margin:0">${escHtml(
        entry.view
      )}</h4><p style="margin:6px 0 0;color:#516175">workflow: ${escHtml(entry.workflow ?? "-")}</p><p style="margin:6px 0 0;color:#516175">created: ${escHtml(
        formatLineageTimestamp(entry.createdAt)
      )}</p></div><span class="badge ${tone}">${escHtml(
        entry.approved === null ? "unknown" : entry.approved ? "approved" : "review"
      )}</span></div>${preview}<p style="margin:0;color:#516175">asset: ${escHtml(entry.assetId ?? "-")}</p><p style="margin:6px 0 0;color:#516175">parent: ${escHtml(
        basenameOrDash(entry.parentAssetPath)
      )}</p><p style="margin:6px 0 0;color:#516175">version: ${escHtml(entry.workflowVersion ?? "-")}</p>${renderLineageLinks(
        [
          { label: "View Image", href: entry.fileUrl },
          { label: "Metadata", href: entry.metadataUrl },
          { label: "Parent Asset", href: entry.parentAssetUrl }
        ].filter((item) => item.href)
      )}${history}</article>`;
    })
    .join("");

  const repairRows = lineage.repairTasks
    .map(
      (task, index) =>
        `<tr><td>${index + 1}</td><td>${escHtml(task.code)}</td><td><span class="badge ${uiBadge(task.severity)}">${escHtml(
          task.severity
        )}</span></td><td>${escHtml(task.action)}</td><td>${escHtml(task.reason)}</td><td>${escHtml(
          task.assetPaths.map((assetPath) => path.basename(assetPath)).join(", ") || "-"
        )}</td></tr>`
    )
    .join("");

  return `<section class="card"><h3>Pack Lineage / Provenance</h3><p>Lineage is the provenance layer behind preview, QC, compare, and repair decisions. Read it here to see which source image, manifest, and repair tasks produced the current pack without rerunning generation.</p>${actionLinks}${summaryCards}${rigSection}<section class="card" style="margin-top:16px"><h4>View Lineage</h4><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${viewCards || '<div class="notice">No view lineage entries.</div>'}</div></section><section class="card" style="margin-top:16px"><h4>Repair Tasks</h4>${
    repairRows
      ? `<table><thead><tr><th>#</th><th>Code</th><th>Severity</th><th>Action</th><th>Reason</th><th>Assets</th></tr></thead><tbody>${repairRows}</tbody></table>`
      : `<div class="notice">No open repair tasks were recorded for this pack.</div>`
  }</section></section>`;
}

function readQcIssues(qcReportRaw: unknown): Array<{ severity: string; check: string; message: string; details: unknown }> {
  if (!isRecord(qcReportRaw)) {
    return [];
  }

  const groups: unknown[] = [];
  if (Array.isArray(qcReportRaw.issues)) groups.push(qcReportRaw.issues);
  if (Array.isArray(qcReportRaw.findings)) groups.push(qcReportRaw.findings);
  if (Array.isArray(qcReportRaw.checks)) groups.push(qcReportRaw.checks);
  if (Array.isArray(qcReportRaw.results)) groups.push(qcReportRaw.results);

  const out: Array<{ severity: string; check: string; message: string; details: unknown }> = [];
  for (const group of groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const item of group) {
      if (!isRecord(item)) {
        continue;
      }
      const passed = item.passed;
      if (passed === true) {
        continue;
      }
      const severity =
        typeof item.severity === "string"
          ? item.severity
          : typeof item.level === "string"
            ? item.level
            : "WARN";
      const check =
        typeof item.check === "string"
          ? item.check
          : typeof item.rule === "string"
            ? item.rule
            : "unknown";
      const message =
        typeof item.message === "string"
          ? item.message
          : typeof item.reason === "string"
            ? item.reason
            : "issue detected";
      out.push({
        severity,
        check,
        message,
        details: "details" in item ? item.details : item
      });
    }
  }

  return out;
}

function parseCharacterGenerationInput(body: JsonRecord): CharacterGenerationInput {
  const mode = parseGenerationMode(body.mode);
  const provider = parseGenerationProvider(body.provider);
  const promptPreset = parsePromptPreset(body.promptPreset);
  const species = parseGenerationSpecies(body.species);
  const positivePrompt = optionalString(body, "positivePrompt");
  const negativePrompt = optionalString(body, "negativePrompt");
  const boostNegativePrompt = parseBoolean(body.boostNegativePrompt, "boostNegativePrompt", false);
  const referenceAssetId = optionalString(body, "referenceAssetId");
  const candidateCount = Math.min(parsePositiveInt(body.candidateCount, "candidateCount", 4), 8);
  const autoPick = parseBoolean(body.autoPick, "autoPick", true);
  const requireHitlPick = parseBoolean(body.requireHitlPick, "requireHitlPick", false);
  const seed = parsePositiveInt(body.seed, "seed", DEFAULT_GENERATION_SEED);
  const topic = optionalString(body, "topic");
  const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
  const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);

  if (mode === "reference" && !referenceAssetId) {
    throw createHttpError(400, "reference mode requires referenceAssetId");
  }

  return {
    mode,
    provider,
    promptPreset,
    species,
    ...(positivePrompt ? { positivePrompt } : {}),
    ...(negativePrompt ? { negativePrompt } : {}),
    boostNegativePrompt,
    ...(referenceAssetId ? { referenceAssetId } : {}),
    candidateCount,
    autoPick,
    requireHitlPick,
    seed,
    ...(topic ? { topic } : {}),
    maxAttempts,
    retryBackoffMs
  };
}

async function createCharacterGeneration(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    channelId?: string;
    generation: CharacterGenerationInput;
  }
): Promise<CharacterGenerationCreateResult> {
  const generation = input.generation;
  const fallbackChannel = input.channelId ? { id: input.channelId } : await ensureDefaultChannel(prisma);
  let channelId = fallbackChannel.id;

  if (generation.referenceAssetId) {
    const referenceAsset = await prisma.asset.findUnique({
      where: { id: generation.referenceAssetId },
      select: {
        id: true,
        channelId: true,
        status: true
      }
    });

    if (!referenceAsset) {
      throw createHttpError(404, `reference asset not found: ${generation.referenceAssetId}`);
    }

    if (referenceAsset.status !== "READY") {
      throw createHttpError(400, `reference asset is not READY: ${generation.referenceAssetId}`);
    }

    channelId = referenceAsset.channelId;
  }

  const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
  const duplicateSession = sessionDelegate && generation.species === "cat"
    ? await sessionDelegate.findFirst({
        where: {
          mode: toDbGenerationMode(generation.mode),
          provider: toDbGenerationProvider(generation.provider),
          promptPresetId: generation.promptPreset,
          positivePrompt: generation.positivePrompt ?? "",
          negativePrompt: generation.negativePrompt ?? "",
          seed: generation.seed,
          candidateCount: generation.candidateCount,
          referenceAssetId: generation.referenceAssetId ?? null,
          createdAt: {
            gte: new Date(Date.now() - GENERATION_DEDUPE_WINDOW_MS)
          },
          episode: {
            is: {
              channelId
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          episodeId: true,
          characterPackId: true,
          manifestPath: true,
          characterPack: {
            select: {
              id: true,
              version: true
            }
          }
        }
      })
    : null;

  if (duplicateSession?.episodeId && duplicateSession.characterPack?.id) {
    const relatedJobs = await prisma.job.findMany({
      where: {
        episodeId: duplicateSession.episodeId,
        type: {
          in: [GENERATE_CHARACTER_ASSETS_JOB_NAME, BUILD_CHARACTER_PACK_JOB_NAME, RENDER_CHARACTER_PREVIEW_JOB_NAME]
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        type: true,
        status: true,
        bullmqJobId: true
      }
    });

    const byType = new Map<string, (typeof relatedJobs)[number]>();
    for (const job of relatedJobs) {
      if (!byType.has(job.type)) {
        byType.set(job.type, job);
      }
    }

    const liveGenerateJob = byType.get(GENERATE_CHARACTER_ASSETS_JOB_NAME);
    const buildJob = byType.get(BUILD_CHARACTER_PACK_JOB_NAME);
    const previewJob = byType.get(RENDER_CHARACTER_PREVIEW_JOB_NAME);
    if (liveGenerateJob && isLiveJobStatus(liveGenerateJob.status) && buildJob && previewJob) {
      const manifestPath = duplicateSession.manifestPath ?? getGenerationManifestPath(liveGenerateJob.id);
      return {
        sessionId: duplicateSession.id,
        characterPackId: duplicateSession.characterPack.id,
        version: duplicateSession.characterPack.version,
        episodeId: duplicateSession.episodeId,
        generateJobId: liveGenerateJob.id,
        buildJobId: buildJob.id,
        previewJobId: previewJob.id,
        bullmqJobId: liveGenerateJob.bullmqJobId ?? "",
        manifestPath,
        generatorStatus: "PENDING_HITL",
        reusedExisting: true
      };
    }
  }

  const latestVersion = await prisma.characterPack.findFirst({
    where: { channelId },
    orderBy: { version: "desc" },
    select: { version: true }
  });

  const version = (latestVersion?.version ?? 0) + 1;

  const txResult = await prisma.$transaction(async (tx) => {
    const tempPackId = `character_pack_${channelId}_${version}_${Date.now()}`;
    const placeholderPack = buildPlaceholderPack({
      packId: tempPackId,
      name: `Character Pack v${version}`,
      sourceImageRef:
        generation.mode === "reference" ? `reference:${generation.referenceAssetId}` : `preset:${generation.promptPreset}`
    });

    const placeholderHash = sha256Hex(
      stableStringify({
        tempPackId,
        version,
        createdAt: new Date().toISOString(),
        generation: {
          mode: generation.mode,
          provider: generation.provider,
          promptPreset: generation.promptPreset,
          species: generation.species
        }
      })
    );

    const characterPack = await tx.characterPack.create({
      data: {
        channelId,
        version,
        status: "DRAFT",
        schemaId: "character_pack.schema.json",
        hash: placeholderHash,
        json: placeholderPack
      }
    });

    const episode = await tx.episode.create({
      data: {
        channelId,
        topic: generation.topic ?? `Character Generated Preview v${version}`,
        status: "GENERATING",
        targetDurationSec: 120,
        characterPackId: characterPack.id,
        characterPackVersion: version
      }
    });

    const txSessionDelegate = getCharacterGenerationSessionDelegate(tx);
    const generationSession = txSessionDelegate
      ? await txSessionDelegate.create({
          data: {
            episodeId: episode.id,
            characterPackId: characterPack.id,
            mode: toDbGenerationMode(generation.mode),
            provider: toDbGenerationProvider(generation.provider),
            promptPresetId: generation.promptPreset,
            positivePrompt: generation.positivePrompt ?? "",
            negativePrompt: generation.negativePrompt ?? "",
            seed: generation.seed,
            candidateCount: generation.candidateCount,
            referenceAssetId: generation.referenceAssetId ?? null,
            status: "DRAFT",
            statusMessage: "Queued"
          }
        })
      : null;

    const previewJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: RENDER_CHARACTER_PREVIEW_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: generation.maxAttempts,
        retryBackoffMs: generation.retryBackoffMs
      }
    });

    const buildJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: BUILD_CHARACTER_PACK_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: generation.maxAttempts,
        retryBackoffMs: generation.retryBackoffMs
      }
    });

    const generateJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: GENERATE_CHARACTER_ASSETS_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: generation.maxAttempts,
        retryBackoffMs: generation.retryBackoffMs
      }
    });

    await tx.jobLog.createMany({
      data: [
        {
          jobId: generateJob.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: toPrismaJson({
            source: "api:character-generator:create",
            queueName,
            characterPackId: characterPack.id,
            version,
            generation
          })
        },
        {
          jobId: buildJob.id,
          level: "info",
          message: "Awaiting GENERATE_CHARACTER_ASSETS completion",
          details: toPrismaJson({
            source: "api:character-generator:create",
            parentJobType: GENERATE_CHARACTER_ASSETS_JOB_NAME,
            characterPackId: characterPack.id
          })
        },
        {
          jobId: previewJob.id,
          level: "info",
          message: "Awaiting BUILD_CHARACTER_PACK completion",
          details: toPrismaJson({
            source: "api:character-generator:create",
            parentJobType: BUILD_CHARACTER_PACK_JOB_NAME,
            characterPackId: characterPack.id
          })
        }
      ]
    });

    return {
      characterPack,
      episode,
      generationSessionId: generationSession?.id ?? `legacy-${generateJob.id}`,
      buildJob,
      previewJob,
      generateJob,
      version
    };
  });

  const manifestPath = getGenerationManifestPath(txResult.generateJob.id);
  const payload = {
    jobDbId: txResult.generateJob.id,
    episodeId: txResult.episode.id,
    schemaChecks: [],
    character: {
      characterPackId: txResult.characterPack.id,
      version: txResult.version,
      buildJobDbId: txResult.buildJob.id,
      previewJobDbId: txResult.previewJob.id,
      generation: {
        sessionId: txResult.generationSessionId,
        mode: generation.mode,
        provider: generation.provider,
        promptPreset: generation.promptPreset,
        species: generation.species,
        positivePrompt: generation.positivePrompt,
        negativePrompt: generation.negativePrompt,
        boostNegativePrompt: generation.boostNegativePrompt,
        referenceAssetId: generation.referenceAssetId,
        candidateCount: generation.candidateCount,
        autoPick: generation.autoPick,
        requireHitlPick: generation.requireHitlPick,
        seed: generation.seed,
        manifestPath
      }
    }
  } as unknown as EpisodeJobPayload;

  const enqueueResult = await enqueueWithResilience({
    queue,
    name: GENERATE_CHARACTER_ASSETS_JOB_NAME,
    payload,
    maxAttempts: txResult.generateJob.maxAttempts,
    backoffMs: txResult.generateJob.retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: txResult.generateJob.id },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await tx.jobLog.create({
      data: {
        jobId: txResult.generateJob.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:character-generator:create",
          queueName,
          bullmqJobId,
          manifestPath,
          characterPackId: txResult.characterPack.id,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });
  });

  return {
    sessionId: txResult.generationSessionId,
    characterPackId: txResult.characterPack.id,
    version: txResult.version,
    episodeId: txResult.episode.id,
    generateJobId: txResult.generateJob.id,
    buildJobId: txResult.buildJob.id,
    previewJobId: txResult.previewJob.id,
    bullmqJobId,
    manifestPath,
    generatorStatus: generation.requireHitlPick || !generation.autoPick ? "PENDING_HITL" : "AUTO_SELECTED",
    reusedExisting: false
  };
}

async function createCharacterGenerationPick(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    generateJobId: string;
    selection: CharacterGenerationSelection;
  }
): Promise<{
  sessionId: string;
  episodeId: string;
  generateJobId: string;
  buildJobId: string;
  previewJobId: string;
  bullmqJobId: string;
  manifestPath: string;
}> {
  const sourceGenerateJob = await prisma.job.findUnique({
    where: { id: input.generateJobId },
    include: {
      episode: {
        select: {
          id: true,
          channelId: true,
          topic: true,
          characterPackId: true,
          characterPackVersion: true
        }
      }
    }
  });

  if (!sourceGenerateJob) {
    throw createHttpError(404, "generate job not found");
  }

  if (sourceGenerateJob.type !== GENERATE_CHARACTER_ASSETS_JOB_NAME) {
    throw createHttpError(400, "job is not GENERATE_CHARACTER_ASSETS");
  }

  const episode = sourceGenerateJob.episode;
  if (!episode.characterPackId || !episode.characterPackVersion) {
    throw createHttpError(400, "episode does not have characterPack metadata");
  }

  const sourceManifestPath = getGenerationManifestPath(sourceGenerateJob.id);
  const manifest = readGenerationManifest(sourceManifestPath);
  if (!manifest) {
    throw createHttpError(404, `generation manifest not found: ${sourceManifestPath}`);
  }

  const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
  const fallbackSession = sessionDelegate
    ? await sessionDelegate.findFirst({
        where: {
          episodeId: episode.id,
          characterPackId: episode.characterPackId
        },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      })
    : null;
  const sessionId = manifest.sessionId ?? fallbackSession?.id;
  if (!sessionId) {
    throw createHttpError(400, "generation session not found for this job");
  }

  const byId = new Map(manifest.candidates.map((candidate) => [candidate.id, candidate]));
  const front = byId.get(input.selection.front);
  const threeQuarter = byId.get(input.selection.threeQuarter);
  const profile = byId.get(input.selection.profile);
  if (!front || front.view !== "front") {
    throw createHttpError(400, "front candidate is invalid");
  }
  if (!threeQuarter || threeQuarter.view !== "threeQuarter") {
    throw createHttpError(400, "threeQuarter candidate is invalid");
  }
  if (!profile || profile.view !== "profile") {
    throw createHttpError(400, "profile candidate is invalid");
  }

  for (const candidate of [front, threeQuarter, profile]) {
    const absPath = path.isAbsolute(candidate.filePath)
      ? candidate.filePath
      : path.resolve(path.dirname(sourceManifestPath), candidate.filePath);
    if (!fs.existsSync(absPath)) {
      throw createHttpError(400, `selected candidate file not found: ${absPath}`);
    }
  }

  const maxAttempts = sourceGenerateJob.maxAttempts;
  const retryBackoffMs = sourceGenerateJob.retryBackoffMs;

  const tx = await prisma.$transaction(async (trx) => {
    const previewJob = await trx.job.create({
      data: {
        episodeId: episode.id,
        type: RENDER_CHARACTER_PREVIEW_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs
      }
    });

    const buildJob = await trx.job.create({
      data: {
        episodeId: episode.id,
        type: BUILD_CHARACTER_PACK_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs
      }
    });

    const generateJob = await trx.job.create({
      data: {
        episodeId: episode.id,
        type: GENERATE_CHARACTER_ASSETS_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts,
        retryBackoffMs
      }
    });

    await trx.jobLog.createMany({
      data: [
        {
          jobId: generateJob.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: toPrismaJson({
            source: "api:character-generator:pick",
            queueName,
            manifestPath: sourceManifestPath,
            selection: input.selection
          })
        },
        {
          jobId: buildJob.id,
          level: "info",
          message: "Awaiting GENERATE_CHARACTER_ASSETS completion (HITL pick)",
          details: toPrismaJson({
            source: "api:character-generator:pick",
            parentJobType: GENERATE_CHARACTER_ASSETS_JOB_NAME,
            characterPackId: episode.characterPackId
          })
        },
        {
          jobId: previewJob.id,
          level: "info",
          message: "Awaiting BUILD_CHARACTER_PACK completion (HITL pick)",
          details: toPrismaJson({
            source: "api:character-generator:pick",
            parentJobType: BUILD_CHARACTER_PACK_JOB_NAME,
            characterPackId: episode.characterPackId
          })
        }
      ]
    });

    return {
      buildJobId: buildJob.id,
      previewJobId: previewJob.id,
      generateJobId: generateJob.id
    };
  });

  const payload = {
    jobDbId: tx.generateJobId,
    episodeId: episode.id,
    schemaChecks: [],
    character: {
      characterPackId: episode.characterPackId,
      version: episode.characterPackVersion,
      buildJobDbId: tx.buildJobId,
      previewJobDbId: tx.previewJobId,
      generation: {
        sessionId,
        mode: manifest.mode === "reference" ? "reference" : "new",
        provider: manifest.provider === "comfyui" ? "comfyui" : "mock",
        promptPreset: manifest.promptPreset,
        species: parseGenerationSpecies(manifest.species),
        positivePrompt: manifest.positivePrompt,
        negativePrompt: manifest.negativePrompt,
        autoPick: false,
        requireHitlPick: false,
        seed: front.seed,
        candidateCount: 3,
        manifestPath: getGenerationManifestPath(tx.generateJobId),
        sourceManifestPath,
        selectedCandidateIds: input.selection
      }
    }
  } as unknown as EpisodeJobPayload;

  const enqueueResult = await enqueueWithResilience({
    queue,
    name: GENERATE_CHARACTER_ASSETS_JOB_NAME,
    payload,
    maxAttempts,
    backoffMs: retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);
  persistSelectedByViewToManifest(sourceManifestPath, manifest, input.selection);

  await prisma.$transaction(async (trx) => {
    await trx.job.update({
      where: { id: tx.generateJobId },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await trx.jobLog.create({
      data: {
        jobId: tx.generateJobId,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:character-generator:pick",
          queueName,
          bullmqJobId,
          manifestPath: getGenerationManifestPath(tx.generateJobId),
          sourceManifestPath,
          selection: input.selection,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });

    await trx.agentSuggestion.updateMany({
      where: {
        episodeId: episode.id,
        type: "HITL_REVIEW",
        status: "PENDING"
      },
      data: {
        status: "APPLIED"
      }
    });
  });

  return {
    sessionId,
    episodeId: episode.id,
    generateJobId: tx.generateJobId,
    buildJobId: tx.buildJobId,
    previewJobId: tx.previewJobId,
    bullmqJobId,
    manifestPath: getGenerationManifestPath(tx.generateJobId)
  };
}

async function createCharacterGenerationRegenerateView(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    generateJobId: string;
    viewToGenerate: CharacterGenerationView;
    candidateCount: number;
    seed?: number;
    regenerateSameSeed: boolean;
    boostNegativePrompt: boolean;
  }
): Promise<CharacterGenerationRegenerateResult> {
  const sourceGenerateJob = await prisma.job.findUnique({
    where: { id: input.generateJobId },
    include: {
      episode: {
        select: {
          id: true,
          characterPackId: true,
          characterPackVersion: true
        }
      }
    }
  });

  if (!sourceGenerateJob) {
    throw createHttpError(404, "generate job not found");
  }
  if (sourceGenerateJob.type !== GENERATE_CHARACTER_ASSETS_JOB_NAME) {
    throw createHttpError(400, "job is not GENERATE_CHARACTER_ASSETS");
  }

  const episode = sourceGenerateJob.episode;
  if (!episode.characterPackId || !episode.characterPackVersion) {
    throw createHttpError(400, "episode does not have characterPack metadata");
  }

  const sourceManifestPath = getGenerationManifestPath(sourceGenerateJob.id);
  const manifest = readGenerationManifest(sourceManifestPath);
  if (!manifest) {
    throw createHttpError(404, `generation manifest not found: ${sourceManifestPath}`);
  }

  const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
  const fallbackSession = sessionDelegate
    ? await sessionDelegate.findFirst({
        where: {
          episodeId: episode.id,
          characterPackId: episode.characterPackId
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          referenceAssetId: true
        }
      })
    : null;
  const sessionId = manifest.sessionId ?? fallbackSession?.id;
  if (!sessionId) {
    throw createHttpError(400, "generation session not found for this job");
  }

  const firstCandidateForView = manifest.candidates.find((candidate) => candidate.view === input.viewToGenerate);
  const seed = input.regenerateSameSeed
    ? (firstCandidateForView?.seed ?? Number.parseInt(String(sourceGenerateJob.attemptsMade + 1), 10) + DEFAULT_GENERATION_SEED)
    : (input.seed ?? (firstCandidateForView?.seed ?? DEFAULT_GENERATION_SEED) + 1);

  const generateJob = await prisma.job.create({
    data: {
      episodeId: episode.id,
      type: GENERATE_CHARACTER_ASSETS_JOB_NAME,
      status: "QUEUED",
      progress: 0,
      maxAttempts: sourceGenerateJob.maxAttempts,
      retryBackoffMs: sourceGenerateJob.retryBackoffMs
    }
  });

  const manifestPath = getGenerationManifestPath(generateJob.id);
  const payload = {
    jobDbId: generateJob.id,
    episodeId: episode.id,
    schemaChecks: [],
    character: {
      characterPackId: episode.characterPackId,
      version: episode.characterPackVersion,
      generation: {
        sessionId,
        mode: manifest.mode === "reference" ? "reference" : "new",
        provider: manifest.provider === "comfyui" ? "comfyui" : "mock",
        promptPreset: manifest.promptPreset,
        species: parseGenerationSpecies(manifest.species),
        positivePrompt: manifest.positivePrompt,
        negativePrompt: manifest.negativePrompt,
        boostNegativePrompt: input.boostNegativePrompt,
        referenceAssetId: fallbackSession?.referenceAssetId ?? undefined,
        candidateCount: input.candidateCount,
        autoPick: false,
        requireHitlPick: true,
        seed,
        viewToGenerate: input.viewToGenerate,
        regenerateSameSeed: input.regenerateSameSeed,
        manifestPath
      }
    }
  } as unknown as EpisodeJobPayload;

  const enqueueResult = await enqueueWithResilience({
    queue,
    name: GENERATE_CHARACTER_ASSETS_JOB_NAME,
    payload,
    maxAttempts: generateJob.maxAttempts,
    backoffMs: generateJob.retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);

  await prisma.$transaction(async (trx) => {
    await trx.job.update({
      where: { id: generateJob.id },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await trx.jobLog.create({
      data: {
        jobId: generateJob.id,
        level: "info",
        message: "Transition -> ENQUEUED (view regenerate)",
        details: toPrismaJson({
          source: "api:character-generator:regenerate-view",
          queueName,
          bullmqJobId,
          sessionId,
          viewToGenerate: input.viewToGenerate,
          regenerateSameSeed: input.regenerateSameSeed,
          seed,
          manifestPath,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });

    const txSessionDelegate = getCharacterGenerationSessionDelegate(trx);
    if (txSessionDelegate) {
      await txSessionDelegate.update({
        where: { id: sessionId },
        data: {
          status: "GENERATING",
          viewToGenerate:
            input.viewToGenerate === "front"
              ? "FRONT"
              : input.viewToGenerate === "threeQuarter"
                ? "THREE_QUARTER"
                : "PROFILE",
          statusMessage: `Regenerating ${input.viewToGenerate} candidates`
        }
      });
    }
  });

  return {
    sessionId,
    view: input.viewToGenerate,
    generateJobId: generateJob.id,
    bullmqJobId,
    manifestPath
  };
}

async function createCharacterGenerationRecreate(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    generateJobId: string;
    candidateCount: number;
    seed?: number;
    regenerateSameSeed: boolean;
    boostNegativePrompt: boolean;
  }
): Promise<CharacterGenerationRecreateResult> {
  const sourceGenerateJob = await prisma.job.findUnique({
    where: { id: input.generateJobId },
    include: {
      episode: {
        select: {
          id: true,
          characterPackId: true,
          characterPackVersion: true
        }
      }
    }
  });

  if (!sourceGenerateJob) {
    throw createHttpError(404, "generate job not found");
  }
  if (sourceGenerateJob.type !== GENERATE_CHARACTER_ASSETS_JOB_NAME) {
    throw createHttpError(400, "job is not GENERATE_CHARACTER_ASSETS");
  }

  const episode = sourceGenerateJob.episode;
  if (!episode.characterPackId || !episode.characterPackVersion) {
    throw createHttpError(400, "episode does not have characterPack metadata");
  }

  const sourceManifestPath = getGenerationManifestPath(sourceGenerateJob.id);
  const manifest = readGenerationManifest(sourceManifestPath);
  if (!manifest) {
    throw createHttpError(404, `generation manifest not found: ${sourceManifestPath}`);
  }

  if (!manifest.inputHash || !manifest.manifestHash) {
    throw createHttpError(400, "manifest hash fields are missing");
  }

  const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
  const fallbackSession = sessionDelegate
    ? await sessionDelegate.findFirst({
        where: {
          episodeId: episode.id,
          characterPackId: episode.characterPackId
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          referenceAssetId: true
        }
      })
    : null;
  const sessionId = manifest.sessionId ?? fallbackSession?.id;
  if (!sessionId) {
    throw createHttpError(400, "generation session not found for this job");
  }

  const previousSeed = manifest.candidates[0]?.seed ?? DEFAULT_GENERATION_SEED;
  const seed = input.regenerateSameSeed ? previousSeed : (input.seed ?? previousSeed + 1);

  const generateJob = await prisma.job.create({
    data: {
      episodeId: episode.id,
      type: GENERATE_CHARACTER_ASSETS_JOB_NAME,
      status: "QUEUED",
      progress: 0,
      maxAttempts: sourceGenerateJob.maxAttempts,
      retryBackoffMs: sourceGenerateJob.retryBackoffMs
    }
  });

  const manifestPath = getGenerationManifestPath(generateJob.id);
  const provider =
    manifest.provider === "comfyui" ? "comfyui" : "mock";
  const payload = {
    jobDbId: generateJob.id,
    episodeId: episode.id,
    schemaChecks: [],
    character: {
      characterPackId: episode.characterPackId,
      version: episode.characterPackVersion,
      generation: {
        sessionId,
        mode: manifest.mode === "reference" ? "reference" : "new",
        provider,
        promptPreset: manifest.promptPreset,
        species: parseGenerationSpecies(manifest.species),
        positivePrompt: manifest.positivePrompt,
        negativePrompt: manifest.negativePrompt,
        boostNegativePrompt: input.boostNegativePrompt,
        referenceAssetId: fallbackSession?.referenceAssetId ?? undefined,
        candidateCount: input.candidateCount,
        autoPick: false,
        requireHitlPick: true,
        seed,
        regenerateSameSeed: input.regenerateSameSeed,
        manifestPath
      }
    }
  } as unknown as EpisodeJobPayload;

  const enqueueResult = await enqueueWithResilience({
    queue,
    name: GENERATE_CHARACTER_ASSETS_JOB_NAME,
    payload,
    maxAttempts: generateJob.maxAttempts,
    backoffMs: generateJob.retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);

  await prisma.$transaction(async (trx) => {
    await trx.job.update({
      where: { id: generateJob.id },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await trx.jobLog.create({
      data: {
        jobId: generateJob.id,
        level: "info",
        message: "Transition -> ENQUEUED (recreate)",
        details: toPrismaJson({
          source: "api:character-generator:recreate",
          queueName,
          bullmqJobId,
          sessionId,
          sourceGenerateJobId: input.generateJobId,
          sourceManifestPath,
          sourceManifestHash: manifest.manifestHash,
          sourceInputHash: manifest.inputHash,
          regenerateSameSeed: input.regenerateSameSeed,
          seed,
          manifestPath,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });
  });

  return {
    sessionId,
    generateJobId: generateJob.id,
    bullmqJobId,
    manifestPath,
    seed
  };
}

async function createCharacterPack(
  prisma: PrismaClient,
  queue: Queue<EpisodeJobPayload>,
  queueName: string,
  input: {
    assetIds: CharacterAssetIds;
    topic?: string;
    maxAttempts: number;
    retryBackoffMs: number;
  }
): Promise<CharacterCreateResult> {
  const assetIds = input.assetIds;
  const requestedIds = [assetIds.front, assetIds.threeQuarter, assetIds.profile];

  const assets = await prisma.asset.findMany({
    where: {
      id: { in: requestedIds }
    },
    select: {
      id: true,
      channelId: true,
      status: true,
      normalizedKey1024: true,
      originalKey: true,
      createdAt: true
    }
  });

  if (assets.length !== 3) {
    throw createHttpError(404, "One or more assets were not found");
  }

  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const id of requestedIds) {
    const asset = byId.get(id);
    if (!asset) {
      throw createHttpError(404, `Asset not found: ${id}`);
    }

    if (asset.status !== "READY") {
      throw createHttpError(400, `Asset is not READY: ${id}`);
    }
  }

  const channelId = assets[0].channelId;
  const sameChannel = assets.every((asset) => asset.channelId === channelId);
  if (!sameChannel) {
    throw createHttpError(400, "All assets must belong to the same channel");
  }

  const latestVersion = await prisma.characterPack.findFirst({
    where: { channelId },
    orderBy: { version: "desc" },
    select: { version: true }
  });

  const version = (latestVersion?.version ?? 0) + 1;

  const txResult = await prisma.$transaction(async (tx) => {
    const tempPackId = `character_pack_${channelId}_${version}_${Date.now()}`;
    const placeholderPack = buildPlaceholderPack({
      packId: tempPackId,
      name: `Character Pack v${version}`,
      sourceImageRef: `${assetIds.front},${assetIds.threeQuarter},${assetIds.profile}`
    });

    const placeholderHash = sha256Hex(
      stableStringify({
        tempPackId,
        version,
        createdAt: new Date().toISOString(),
        assets: assetIds
      })
    );

    const characterPack = await tx.characterPack.create({
      data: {
        channelId,
        version,
        status: "DRAFT",
        schemaId: "character_pack.schema.json",
        hash: placeholderHash,
        json: placeholderPack
      }
    });

    const episode = await tx.episode.create({
      data: {
        channelId,
        topic: input.topic ?? `Character Preview v${version}`,
        status: "GENERATING",
        targetDurationSec: 120,
        characterPackId: characterPack.id,
        characterPackVersion: version
      }
    });

    const previewJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: RENDER_CHARACTER_PREVIEW_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: input.maxAttempts,
        retryBackoffMs: input.retryBackoffMs
      }
    });

    const buildJob = await tx.job.create({
      data: {
        episodeId: episode.id,
        type: BUILD_CHARACTER_PACK_JOB_NAME,
        status: "QUEUED",
        progress: 0,
        maxAttempts: input.maxAttempts,
        retryBackoffMs: input.retryBackoffMs
      }
    });

    await tx.jobLog.createMany({
      data: [
        {
          jobId: buildJob.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: toPrismaJson({
            source: "api:character-packs:create",
            queueName,
            characterPackId: characterPack.id,
            version,
            assetIds
          })
        },
        {
          jobId: previewJob.id,
          level: "info",
          message: "Awaiting BUILD_CHARACTER_PACK completion",
          details: toPrismaJson({
            source: "api:character-packs:create",
            parentJobType: BUILD_CHARACTER_PACK_JOB_NAME,
            characterPackId: characterPack.id,
            version
          })
        }
      ]
    });

    return {
      characterPack,
      episode,
      buildJob,
      previewJob,
      version
    };
  });

  const payload = {
    jobDbId: txResult.buildJob.id,
    episodeId: txResult.episode.id,
    schemaChecks: [],
    character: {
      characterPackId: txResult.characterPack.id,
      version: txResult.version,
      previewJobDbId: txResult.previewJob.id,
      assetIds
    }
  } as unknown as EpisodeJobPayload;

  const enqueueResult = await enqueueWithResilience({
    queue,
    name: BUILD_CHARACTER_PACK_JOB_NAME,
    payload,
    maxAttempts: txResult.buildJob.maxAttempts,
    backoffMs: txResult.buildJob.retryBackoffMs,
    maxEnqueueRetries: 2,
    retryDelayMs: 200,
    redisUnavailableAsHttp503: true
  });

  const bullmqJobId = String(enqueueResult.job.id);

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: txResult.buildJob.id },
      data: {
        bullmqJobId,
        status: "QUEUED",
        lastError: null,
        finishedAt: null
      }
    });

    await tx.jobLog.create({
      data: {
        jobId: txResult.buildJob.id,
        level: "info",
        message: "Transition -> ENQUEUED",
        details: toPrismaJson({
          source: "api:character-packs:create",
          queueName,
          bullmqJobId,
          characterPackId: txResult.characterPack.id,
          previewJobId: txResult.previewJob.id,
          enqueueMode: enqueueResult.mode,
          enqueueAttemptCount: enqueueResult.attemptCount,
          enqueueErrorSummary: enqueueResult.errorSummary
        })
      }
    });
  });

  return {
    characterPackId: txResult.characterPack.id,
    version: txResult.version,
    previewJobId: txResult.previewJob.id,
    buildJobId: txResult.buildJob.id,
    episodeId: txResult.episode.id,
    bullmqJobId
  };
}

function toCharacterPackResponse(pack: {
  id: string;
  channelId: string;
  version: number;
  status: string;
  schemaId: string;
  hash: string;
  json: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  const artifacts = getCharacterArtifacts(pack.id);

  return {
    id: pack.id,
    channelId: pack.channelId,
    version: pack.version,
    status: pack.status,
    schemaId: pack.schemaId,
    hash: pack.hash,
    json: pack.json,
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
    artifacts: {
      outDir: artifacts.outDir,
      packJsonPath: artifacts.packJsonPath,
      previewPath: artifacts.previewPath,
      qcReportPath: artifacts.qcReportPath,
      packJsonExists: fs.existsSync(artifacts.packJsonPath),
      previewExists: fs.existsSync(artifacts.previewPath),
      qcReportExists: fs.existsSync(artifacts.qcReportPath),
      packJsonUrl: `/artifacts/characters/${encodeURIComponent(pack.id)}/pack.json`,
      previewUrl: `/artifacts/characters/${encodeURIComponent(pack.id)}/preview.mp4`,
      qcReportUrl: `/artifacts/characters/${encodeURIComponent(pack.id)}/qc_report.json`
    }
  };
}

export function registerCharacterRoutes(input: RegisterCharacterRoutesInput): void {
  const { app, prisma, queue, queueName } = input;

  app.get("/api/character-packs", async (request) => {
    const query = isRecord(request.query) ? request.query : {};
    const limit = Math.min(parsePositiveInt(query.limit, "limit", 30), MAX_LIST);

    const packs = await prisma.characterPack.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        episodes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            topic: true,
            status: true,
            createdAt: true
          }
        }
      }
    });

    return {
      data: packs.map((pack) => ({
        ...toCharacterPackResponse(pack),
        latestEpisode: pack.episodes[0] ?? null
      }))
    };
  });

  app.get("/api/character-packs/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");

    const pack = await prisma.characterPack.findUnique({
      where: { id },
      include: {
        episodes: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            jobs: {
              orderBy: { createdAt: "desc" },
              take: 20,
              include: {
                logs: {
                  orderBy: { createdAt: "asc" },
                  take: 50
                }
              }
            }
          }
        }
      }
    });

    if (!pack) {
      throw createHttpError(404, "character pack not found");
    }

    return {
      data: {
        ...toCharacterPackResponse(pack),
        episodes: pack.episodes
      }
    };
  });

  app.post("/api/character-packs/create", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const assetIds = parseAssetIdsFromBody(body);
    const topic = optionalString(body, "topic");
    const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
    const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);

    const created = await createCharacterPack(prisma, queue, queueName, {
      assetIds,
      topic,
      maxAttempts,
      retryBackoffMs
    });

    return reply.code(201).send({
      data: {
        characterPackId: created.characterPackId,
        version: created.version,
        previewJobId: created.previewJobId,
        buildJobId: created.buildJobId,
        episodeId: created.episodeId,
        bullmqJobId: created.bullmqJobId
      }
    });
  });

  app.post("/api/character-generator/generate", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const channelId = optionalString(body, "channelId");
    const generation = parseCharacterGenerationInput(body);

    const created = await createCharacterGeneration(prisma, queue, queueName, {
      ...(channelId ? { channelId } : {}),
      generation
    });

    return reply.code(201).send({
      data: created
    });
  });

  app.get("/api/character-generator/jobs/:id", async (request) => {
    const id = requireRouteParam(request.params, "id");
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        episode: {
          select: {
            id: true,
            topic: true,
            status: true,
            characterPackId: true
          }
        },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 20
        }
      }
    });

    if (!job) {
      throw createHttpError(404, "generation job not found");
    }

    if (job.type !== GENERATE_CHARACTER_ASSETS_JOB_NAME) {
      throw createHttpError(400, "job is not GENERATE_CHARACTER_ASSETS");
    }

    const manifestPath = getGenerationManifestPath(job.id);
    const progressPath = getGenerationProgressPath(job.id);
    const manifest = readGenerationManifest(manifestPath);
    const progressSnapshot = readGenerationProgress(progressPath);
    const packCoherence = manifest?.packCoherence ?? manifest?.providerMeta?.selectionDiagnostics?.packCoherence ?? null;
    const autoReroute = manifest?.autoReroute ?? manifest?.providerMeta?.selectionDiagnostics?.autoReroute ?? null;
    const selectionRisk = manifest?.providerMeta?.selectionDiagnostics?.selectionRisk ?? null;
    const qualityEmbargo = manifest?.providerMeta?.selectionDiagnostics?.qualityEmbargo ?? null;
    const packDefectSummary = manifest?.providerMeta?.selectionDiagnostics?.packDefectSummary ?? null;
    const finalQualityFirewall = manifest?.providerMeta?.selectionDiagnostics?.finalQualityFirewall ?? null;
    const decisionOutcome = manifest?.providerMeta?.selectionDiagnostics?.decisionOutcome ?? null;
    const workflowStages = manifest?.workflowStages ?? manifest?.providerMeta?.selectionDiagnostics?.workflowStages ?? [];
    const finalSelectionSource = manifest?.providerMeta?.selectionDiagnostics?.finalSelectionSource ?? null;
    const selectionDiagnostics = manifest?.providerMeta?.selectionDiagnostics ?? null;
    const selectedWorkflowRuntimeDiagnostics = resolveSelectedWorkflowRuntimeDiagnostics(manifest);
    const recommendedActions = buildRecommendedActions(manifest);
    const failureSummary = pickFirstLine(job.lastError);
    const latestLog = job.logs[0]
      ? {
          level: job.logs[0].level,
          message: job.logs[0].message,
          createdAt: job.logs[0].createdAt,
          details: job.logs[0].details
        }
      : null;
    const liveProgressSummary = progressSnapshot
      ? [
          `stage=${progressSnapshot.stage}`,
          `progress=${progressSnapshot.progress}%`,
          typeof progressSnapshot.details.workflowStage === "string"
            ? `workflow=${progressSnapshot.details.workflowStage}`
            : "",
          typeof progressSnapshot.details.passLabel === "string"
            ? `pass=${progressSnapshot.details.passLabel}`
            : "",
          Array.isArray(progressSnapshot.details.executionViews) && progressSnapshot.details.executionViews.length > 0
            ? `views=${progressSnapshot.details.executionViews.join(",")}`
            : ""
        ]
          .filter((entry) => entry.length > 0)
          .join(" / ")
      : null;

    return {
      data: {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.maxAttempts,
        retryBackoffMs: job.retryBackoffMs,
        bullmqJobId: job.bullmqJobId,
        lastError: job.lastError,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        episode: job.episode,
        manifestPath,
        progressPath,
        progressSnapshot,
        liveProgressSummary,
        manifestExists: manifest !== null,
        manifest,
        packCoherence,
        autoReroute,
        selectionRisk,
        qualityEmbargo,
        packDefectSummary,
        finalQualityFirewall,
        decisionOutcome,
        workflowStages,
        finalSelectionSource,
        selectionDiagnostics,
        selectedWorkflowRuntimeDiagnostics,
        selectedWorkflowRuntimeSummary: summarizeSelectedWorkflowRuntimeDiagnostics(selectedWorkflowRuntimeDiagnostics),
        recommendedActions,
        sessionId: manifest?.sessionId ?? null,
        failureSummary,
        latestLog,
        logs: job.logs
      }
    };
  });

  app.post("/api/character-generator/pick", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const generateJobId = optionalString(body, "generateJobId");
    if (!generateJobId) {
      throw createHttpError(400, "generateJobId is required");
    }

    const selection: CharacterGenerationSelection = {
      front: optionalString(body, "frontCandidateId") ?? "",
      threeQuarter: optionalString(body, "threeQuarterCandidateId") ?? "",
      profile: optionalString(body, "profileCandidateId") ?? ""
    };

    if (!selection.front || !selection.threeQuarter || !selection.profile) {
      throw createHttpError(400, "frontCandidateId/threeQuarterCandidateId/profileCandidateId are required");
    }

    const created = await createCharacterGenerationPick(prisma, queue, queueName, {
      generateJobId,
      selection
    });

    return reply.code(201).send({
      data: created
    });
  });

  app.post("/api/character-generator/regenerate-view", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const generateJobId = optionalString(body, "generateJobId");
    if (!generateJobId) {
      throw createHttpError(400, "generateJobId is required");
    }

    const viewToGenerate = parseGenerationView(body.viewToGenerate, "viewToGenerate");
    const candidateCount = Math.min(parsePositiveInt(body.candidateCount, "candidateCount", 4), 8);
    const regenerateSameSeed = parseBoolean(body.regenerateSameSeed, "regenerateSameSeed", true);
    const seed = parsePositiveInt(body.seed, "seed", DEFAULT_GENERATION_SEED);
    const boostNegativePrompt = parseBoolean(body.boostNegativePrompt, "boostNegativePrompt", false);

    const created = await createCharacterGenerationRegenerateView(prisma, queue, queueName, {
      generateJobId,
      viewToGenerate,
      candidateCount,
      seed,
      regenerateSameSeed,
      boostNegativePrompt
    });

    return reply.code(201).send({
      data: created
    });
  });

  app.post("/api/character-generator/recreate", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const generateJobId = optionalString(body, "generateJobId");
    if (!generateJobId) {
      throw createHttpError(400, "generateJobId is required");
    }

    const candidateCount = Math.min(parsePositiveInt(body.candidateCount, "candidateCount", 4), 8);
    const regenerateSameSeed = parseBoolean(body.regenerateSameSeed, "regenerateSameSeed", true);
    const seed = parsePositiveInt(body.seed, "seed", DEFAULT_GENERATION_SEED);
    const boostNegativePrompt = parseBoolean(body.boostNegativePrompt, "boostNegativePrompt", false);

    const created = await createCharacterGenerationRecreate(prisma, queue, queueName, {
      generateJobId,
      candidateCount,
      seed,
      regenerateSameSeed,
      boostNegativePrompt
    });

    return reply.code(201).send({
      data: created
    });
  });

  app.post("/api/character-generator/rebuild-selected", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const generateJobId = optionalString(body, "generateJobId");
    if (!generateJobId) {
      throw createHttpError(400, "generateJobId is required");
    }

    const created = await createCharacterGenerationRebuildSelected(prisma, queue, queueName, {
      generateJobId
    });

    return reply.code(201).send({
      data: created
    });
  });

  app.post("/api/character-generator/overrides/save", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const generateJobId = optionalString(body, "generateJobId");
    const kindRaw = optionalString(body, "kind");
    const rawJson = optionalString(body, "overrideJson");
    if (!generateJobId) {
      throw createHttpError(400, "generateJobId is required");
    }
    if (kindRaw !== "anchors" && kindRaw !== "cropBoxes") {
      throw createHttpError(400, "kind must be anchors or cropBoxes");
    }
    if (!rawJson) {
      throw createHttpError(400, "overrideJson is required");
    }

    const normalized = normalizeManualOverrideText(rawJson, kindRaw);
    const context = await resolveCharacterGenerationOverrideContext(prisma, generateJobId);
    const overridePath = resolveManualOverrideFilePath(context.lineage.characterRoot, kindRaw);
    fs.mkdirSync(path.dirname(overridePath), { recursive: true });
    fs.writeFileSync(overridePath, normalized, "utf8");

    return reply.code(201).send({
      data: {
        kind: kindRaw,
        characterPackId: context.characterPackId,
        overridePath
      }
    });
  });

  app.post("/api/character-generator/overrides/clear", async (request, reply) => {
    const body = requireBodyObject(request.body);
    const generateJobId = optionalString(body, "generateJobId");
    const kindRaw = optionalString(body, "kind");
    if (!generateJobId) {
      throw createHttpError(400, "generateJobId is required");
    }
    if (kindRaw !== "anchors" && kindRaw !== "cropBoxes") {
      throw createHttpError(400, "kind must be anchors or cropBoxes");
    }

    const context = await resolveCharacterGenerationOverrideContext(prisma, generateJobId);
    const overridePath = resolveManualOverrideFilePath(context.lineage.characterRoot, kindRaw);
    const removed = fs.existsSync(overridePath);
    if (removed) {
      fs.unlinkSync(overridePath);
    }

    return reply.send({
      data: {
        kind: kindRaw,
        characterPackId: context.characterPackId,
        removed,
        overridePath
      }
    });
  });

  app.get("/ui/studio", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const message = optionalString(query, "message");
    const error = optionalString(query, "error");
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (routeError) {
      if (isDbUnavailableError(routeError)) {
        request.log.warn(
          {
            error_code: "database_unavailable",
            dependency: "postgresql",
            hint: "Start PostgreSQL and retry.",
            route: "/ui/studio"
          },
          "UI fallback: database unavailable"
        );
        const body = renderDbUnavailableCard({
          title: "Studio (DB Fallback)",
          route: "/ui/studio",
          requestId: request.id
        });
        return reply.code(503).type("text/html; charset=utf-8").send(uiPage("Studio", body));
      }
      throw routeError;
    }
    const [activeChannelBible, recentPacks] = await Promise.all([
      prisma.channelBible.findFirst({
        where: { isActive: true },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          channelId: true,
          version: true,
          updatedAt: true,
          json: true
        }
      }),
      prisma.characterPack.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          version: true,
          status: true,
          createdAt: true
        }
      })
    ]);
    const promptRules = extractChannelPromptRules(activeChannelBible?.json);
    const stylePresets = extractChannelStylePresets(activeChannelBible?.json);
    const activePack = recentPacks.find((pack) => pack.status === "APPROVED") ?? null;
    const latestPack = recentPacks[0] ?? null;
    const approvedPacks = recentPacks.filter((pack) => pack.status === "APPROVED");
    const archivedCount = recentPacks.filter((pack) => pack.status === "ARCHIVED").length;
    const pendingCount = recentPacks.filter((pack) => !["APPROVED", "ARCHIVED"].includes(pack.status)).length;
    const styleOptions = CHARACTER_STYLE_PRESETS
      .map((preset) => `<option value="${escHtml(preset.id)}">${escHtml(preset.label)}</option>`)
      .join("");
    const speciesOptions = CHARACTER_SPECIES_PRESETS
      .map((species) => `<option value="${escHtml(species.id)}">${escHtml(species.label)}</option>`)
      .join("");
    const channelProfile = {
      source: activeChannelBible ? `DB v${activeChannelBible.version}` : "Snapshot",
      channelName: readStringAtPath(activeChannelBible?.json, ["channel", "name"]) ?? "Eraser Cat",
      channelId: activeChannelBible?.channelId ?? "",
      language: readStringAtPath(activeChannelBible?.json, ["channel", "language"]) ?? "ko-KR",
      tone: readStringAtPath(activeChannelBible?.json, ["style", "tone"]) ?? "default",
      pacing: readStringAtPath(activeChannelBible?.json, ["style", "pacing"]) ?? "default",
      stylePresetCount: stylePresets.length,
      forbiddenTermsSummary: promptRules.forbiddenTerms.length > 0 ? promptRules.forbiddenTerms.slice(0, 3).join(", ") : "(none)",
      negativeTermsSummary:
        promptRules.negativePromptTerms.length > 0 ? promptRules.negativePromptTerms.slice(0, 3).join(", ") : "(none)",
      updatedAt: formatStudioDateTime(activeChannelBible?.updatedAt),
      editorHref: "/ui/channel-bible"
    };
    const studioReturnTo = requestUiHref(request);
    const compareHref =
      approvedPacks.length >= 2
        ? buildUiHref("/ui/character-generator/compare", {
            leftPackId: approvedPacks[0].id,
            rightPackId: approvedPacks[1].id,
            returnTo: studioReturnTo,
            currentObject: `pack:${approvedPacks[0].id}`,
            focus: "pack-compare-hero"
          })
        : "";
    const packState = {
      activePackId: activePack?.id ?? "",
      activePackVersion: activePack ? String(activePack.version) : "-",
      activePackStatus: activePack?.status ?? "inactive",
      latestPackId: latestPack?.id ?? "",
      latestPackCreatedAt: formatStudioDateTime(latestPack?.createdAt),
      approvedCount: approvedPacks.length,
      archivedCount,
      pendingCount,
      compareHref,
      charactersHref: buildUiHref("/ui/characters", {
        returnTo: studioReturnTo,
        focus: "pack-review-current"
      }),
      generatorHref: buildUiHref("/ui/character-generator", {
        returnTo: studioReturnTo,
        focus: "cg-stage-context"
      })
    };
    return reply
      .type("text/html; charset=utf-8")
      .send(uiPage("Studio", buildStudioBody({ message, error, styleOptions, speciesOptions, channelProfile, packState })));
  });

  app.get("/ui/character-generator", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const creationNav = readCreationNavState(query);
    const currentPageReturnTo = requestUiHref(request);
    const message = optionalString(query, "message");
    const error = optionalString(query, "error");
    const selectedJobId = optionalString(query, "jobId");

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (routeError) {
      if (isDbUnavailableError(routeError)) {
        request.log.warn(
          {
            error_code: "database_unavailable",
            dependency: "postgresql",
            hint: "Start PostgreSQL and retry.",
            route: "/ui/character-generator"
          },
          "UI fallback: database unavailable"
        );
        const body = renderDbUnavailableCard({
          title: "Character Generator (DB Fallback)",
          route: "/ui/character-generator",
          requestId: request.id
        }) + renderWorkflowSampleArtifactsFallback();
        return reply.code(503).type("text/html; charset=utf-8").send(uiPage("Character Generator", body));
      }
      throw routeError;
    }

    const [readyAssets, recentJobs, approvedPacks, activeChannelBible] = await Promise.all([
      prisma.asset.findMany({
        where: {
          status: "READY",
          assetType: { in: ["CHARACTER_REFERENCE", "CHARACTER_VIEW"] }
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          assetType: true,
          channelId: true
        }
      }),
      prisma.job.findMany({
        where: { type: GENERATE_CHARACTER_ASSETS_JOB_NAME },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          episode: {
            select: {
              id: true,
              topic: true
            }
          }
        }
      }),
      prisma.characterPack.findMany({
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          version: true,
          status: true
        }
      }),
      prisma.channelBible.findFirst({
        where: { isActive: true },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: { json: true }
      })
    ]);

    const stylePresetMap = new Map<string, { id: string; label: string }>();
    for (const preset of CHARACTER_STYLE_PRESETS) {
      stylePresetMap.set(preset.id, { id: preset.id, label: preset.label });
    }
    for (const preset of extractChannelStylePresets(activeChannelBible?.json)) {
      stylePresetMap.set(preset.id, { id: preset.id, label: preset.label });
    }
    const styleOptions = Array.from(stylePresetMap.values())
      .map((preset) => `<option value="${escHtml(preset.id)}">${escHtml(preset.label)}</option>`)
      .join("");
    const speciesOptions = CHARACTER_SPECIES_PRESETS
      .map((species) => `<option value="${escHtml(species.id)}">${escHtml(species.label)}</option>`)
      .join("");
    const referenceOptions = readyAssets
      .map(
        (asset) =>
          `<option value="${escHtml(asset.id)}">${escHtml(asset.id)} (${escHtml(asset.assetType)}, channel=${escHtml(
            asset.channelId
          )})</option>`
      )
      .join("");

    const promptRules = extractChannelPromptRules(activeChannelBible?.json);
    const topSection = buildCharacterGeneratorTopSection({
      message,
      error,
      styleOptions,
      speciesOptions,
      referenceOptions,
      defaultSeed: DEFAULT_GENERATION_SEED,
      forbiddenTermsSummary: promptRules.forbiddenTerms.length > 0 ? promptRules.forbiddenTerms.join(", ") : "(none)",
      negativeTermsSummary:
        promptRules.negativePromptTerms.length > 0 ? promptRules.negativePromptTerms.join(", ") : "(none)"
    });

    const selectedJob = selectedJobId ? recentJobs.find((job) => job.id === selectedJobId) ?? null : null;
    const selectedManifest = selectedJob ? readGenerationManifest(getGenerationManifestPath(selectedJob.id)) : null;
    const renderArtifactLink = (label: string, filePath?: string): string => {
      if (!filePath) {
        return `<span>${escHtml(label)}: -</span>`;
      }
      const url = toArtifactUrlFromAbsolutePath(filePath);
      return url
        ? `<a href="${url}">${escHtml(label)}</a>`
        : `<span>${escHtml(label)}: outside /out</span>`;
    };
    const runSettings = selectedManifest?.providerMeta?.runSettings ?? selectedManifest?.qualityProfile;
    const workflowArtifactRows = selectedManifest
      ? selectedManifest.candidates
          .filter((candidate) => candidate.providerMeta?.workflowFiles)
          .map((candidate) => ({
            candidate,
            workflowFiles: candidate.providerMeta?.workflowFiles
          }))
      : [];
    const selectedSelectionDiagnostics = selectedManifest?.providerMeta?.selectionDiagnostics;
    const selectedPackCoherence =
      selectedManifest?.packCoherence ?? selectedSelectionDiagnostics?.packCoherence;
    const selectedAutoReroute =
      selectedManifest?.autoReroute ?? selectedSelectionDiagnostics?.autoReroute;
    const selectedRigStability = selectedSelectionDiagnostics?.rigStability;
    const selectedSelectionRisk = selectedSelectionDiagnostics?.selectionRisk;
    const selectedQualityEmbargo = selectedSelectionDiagnostics?.qualityEmbargo;
    const selectedPackDefectSummary = selectedSelectionDiagnostics?.packDefectSummary;
    const selectedFinalQualityFirewall = selectedSelectionDiagnostics?.finalQualityFirewall;
    const selectedDecisionOutcome = selectedSelectionDiagnostics?.decisionOutcome;
    const selectedWorkflowStages =
      selectedManifest?.workflowStages ?? selectedSelectionDiagnostics?.workflowStages ?? [];
    const selectedContinuity = selectedManifest?.reference?.continuity;
    const selectedGeneratedLineage =
      selectedManifest?.characterPackId ? readCharacterPackLineage(selectedManifest.characterPackId) : null;
    const selectedPackRigSummary = selectedGeneratedLineage?.rigSummary ?? null;
    const selectedAnchorsOverrideSeed = selectedGeneratedLineage
      ? readManualOverrideSeed({
          overridePath: selectedGeneratedLineage.overrides.anchorsPath,
          proposalPath: selectedGeneratedLineage.proposalPath,
          kind: "anchors"
        })
      : null;
    const selectedCropBoxesOverrideSeed = selectedGeneratedLineage
      ? readManualOverrideSeed({
          overridePath: selectedGeneratedLineage.overrides.cropBoxesPath,
          proposalPath: selectedGeneratedLineage.proposalPath,
          kind: "cropBoxes"
        })
      : null;
    const selectedHasRebuildSelection = Boolean(
      selectedManifest?.selectedByView?.front?.candidateId &&
        selectedManifest?.selectedByView?.threeQuarter?.candidateId &&
        selectedManifest?.selectedByView?.profile?.candidateId
    );
    const selectedRebuildSelectionSummary = selectedHasRebuildSelection
      ? `front=${selectedManifest?.selectedByView?.front?.candidateId ?? "-"} / threeQuarter=${
          selectedManifest?.selectedByView?.threeQuarter?.candidateId ?? "-"
        } / profile=${selectedManifest?.selectedByView?.profile?.candidateId ?? "-"}`
      : "Current run has not materialized a full selected candidate set yet.";
    const selectedWorkflowRuntimeDiagnostics = resolveSelectedWorkflowRuntimeDiagnostics(selectedManifest);
    const selectedRecommendedActions = buildRecommendedActions(selectedManifest);
    const selectedRigState = summarizeRigSeverity(selectedRigStability);
    const selectedRigReasonFamilies = summarizeRigReasonFamilies(selectedRigStability?.reasonCodes);
    const selectedRigFallbackCards = dedupeStrings(selectedRigStability?.fallbackReasonCodes ?? [])
      .map((reasonCode) => {
        const detail = describeRigFallbackReason(reasonCode);
        return `<article class="cg-signal-flag ${detail.tone}"><div class="cg-rig-kicker">${escHtml(
          detail.label
        )}</div><h4>${escHtml(detail.copy)}</h4><p>flag=${escHtml(reasonCode)}</p></article>`;
      })
      .join("");
    const selectedRigOverrideLinks = [
      selectedGeneratedLineage?.overrides.anchorsUrl
        ? `<a href="${escHtml(selectedGeneratedLineage.overrides.anchorsUrl)}">anchors.json</a>`
        : "",
      selectedGeneratedLineage?.overrides.cropBoxesUrl
        ? `<a href="${escHtml(selectedGeneratedLineage.overrides.cropBoxesUrl)}">crop-boxes.json</a>`
        : "",
      selectedGeneratedLineage?.repairTasksUrl
        ? `<a href="${escHtml(selectedGeneratedLineage.repairTasksUrl)}">repair_tasks.json</a>`
        : ""
    ]
      .filter((value) => value.length > 0)
      .join("");
    const selectedRigViewRows = (["front", "threeQuarter", "profile"] as const)
      .map((view) => {
        const viewState = summarizeRigViewState(view, selectedRigStability);
        const selectedSummary = selectedSelectionDiagnostics?.selectedCandidateSummaryByView?.[view];
        return `<tr><td>${escHtml(view)}</td><td><span class="badge ${viewState.tone}">${escHtml(
          viewState.label
        )}</span></td><td>${escHtml(selectedSummary?.candidateId ?? "-")}</td><td>${escHtml(
          formatMetric(selectedRigStability?.anchorConfidenceByView?.[view] ?? selectedSummary?.anchorConfidence)
        )}</td><td>${escHtml(
          formatMetric(selectedRigStability?.landmarkConsistencyByView?.[view] ?? selectedSummary?.landmarkConsistency)
        )}</td><td>${escHtml(
          summarizeRigFallbackReasonCodes(selectedSummary?.rigFallbackReasonCodes)
          )}</td><td>${escHtml(selectedSummary?.warningCount ?? "-")}</td><td>${escHtml(
            selectedSummary?.rejectionCount ?? "-"
          )}</td></tr>`;
      })
      .join("");
    const selectedRigRepairRows = (["front", "threeQuarter", "profile"] as const)
      .map((view) => {
        const viewState = summarizeRigViewState(view, selectedRigStability);
        const selectedSummary = selectedSelectionDiagnostics?.selectedCandidateSummaryByView?.[view];
        const latestDirective = findLatestDirectiveProfileForView(selectedWorkflowStages, view);
        const latestTriage = findLatestRepairTriageForView(selectedWorkflowStages, view);
        const latestRepairAcceptance = findLatestRepairAcceptanceForView(selectedWorkflowStages, view);
        const defects =
          selectedPackDefectSummary?.persistentFamiliesByView?.[view] ??
          selectedPackDefectSummary?.defectFamiliesByView?.[view] ??
          [];
        const action = selectedRecommendedActions.find((entry) => entry.view === view);
        const overrideSummary =
          selectedGeneratedLineage?.overrides.anchorsUrl || selectedGeneratedLineage?.overrides.cropBoxesUrl
            ? selectedRigOverrideLinks || "available"
            : "none";
        const directiveSummary = latestDirective.directive
          ? `${latestDirective.directive.severity}:${latestDirective.directive.families.join("+") || "none"}`
          : "-";
        const evidenceSummary = [
          selectedGeneratedLineage?.viewEntries.find((entry) => entry.view === view)?.metadataUrl
            ? `<a href="${escHtml(
                selectedGeneratedLineage.viewEntries.find((entry) => entry.view === view)?.metadataUrl ?? ""
              )}">metadata</a>`
            : "",
          selectedGeneratedLineage?.viewEntries.find((entry) => entry.view === view)?.parentAssetUrl
            ? `<a href="${escHtml(
                selectedGeneratedLineage.viewEntries.find((entry) => entry.view === view)?.parentAssetUrl ?? ""
              )}">source</a>`
            : ""
        ]
          .filter((value) => value.length > 0)
          .join(" / ");
        return `<tr><td>${escHtml(view)}</td><td><span class="badge ${viewState.tone}">${escHtml(
          viewState.label
        )}</span></td><td>${escHtml(
          summarizeAnchorDiagnosisForView(selectedPackRigSummary, view)
        )}</td><td>${escHtml(
          formatMetric(selectedRigStability?.anchorConfidenceByView?.[view] ?? selectedSummary?.anchorConfidence)
        )} / ${escHtml(
          formatMetric(selectedRigStability?.landmarkConsistencyByView?.[view] ?? selectedSummary?.landmarkConsistency)
        )}</td><td>${escHtml(
          summarizeRepairTriageDecision(latestTriage.triage)
        )}</td><td>${escHtml(
          summarizeRepairAcceptanceDecision(latestRepairAcceptance.acceptance)
        )}</td><td>${escHtml(directiveSummary)}</td><td>${escHtml(
          defects.join(", ") || "none"
        )}</td><td>${escHtml(action?.label ?? (viewState.label === "block" ? "Regenerate / recreate" : "Observe"))}</td><td>${
          evidenceSummary || "-"
        }</td></tr>`;
      })
      .join("");
    const selectedRigRepairConsoleSection =
      selectedManifest && selectedRigStability
        ? `<div class="cg-diagnostic-grid"><article class="cg-diagnostic-card"><div class="cg-rig-kicker">Reason Families</div><h4>${escHtml(
            selectedRigReasonFamilies
          )}</h4><p>Use these families to decide whether this is anchor repair, landmark repair, compare-only review, or full recreate pressure.</p></article><article class="cg-diagnostic-card"><div class="cg-rig-kicker">Override Availability</div><h4>${escHtml(
            selectedRigOverrideLinks ? "override files present" : "no override files recorded"
          )}</h4><p>${
            selectedRigOverrideLinks
              ? `Read-only override evidence: ${selectedRigOverrideLinks}`
              : "anchors.json and crop-boxes.json are not recorded for this run yet."
          }</p></article><article class="cg-diagnostic-card"><div class="cg-rig-kicker">Repair Queue</div><h4>${escHtml(
            selectedGeneratedLineage ? `${selectedGeneratedLineage.repairOpenCount} open tasks` : "repair queue not materialized"
          )}</h4><p>${escHtml(
            selectedGeneratedLineage
              ? `${selectedGeneratedLineage.qcFailedCount}/${selectedGeneratedLineage.qcTotalCount} QC checks failed. Approval status=${selectedGeneratedLineage.acceptanceStatus ?? "-"}`
              : "Repair tasks and pack-level QC appear only after pack artifacts are materialized."
          )}</p></article></div><div class="cg-signal-table" style="margin-top:12px"><table><thead><tr><th>View</th><th>State</th><th>Anchor diagnosis</th><th>Metrics</th><th>Repair triage</th><th>Repair acceptance</th><th>Directive</th><th>Defects</th><th>Suggested path</th><th>Evidence</th></tr></thead><tbody>${selectedRigRepairRows}</tbody></table></div>${
            selectedJob && selectedGeneratedLineage && selectedAnchorsOverrideSeed && selectedCropBoxesOverrideSeed
              ? `<section class="cg-override-console" id="cg-manual-overrides"><div class="cg-section-head"><div><div class="cg-section-kicker">Manual Repair / Override</div><h3>Save override files and rebuild the current pack without a full recreate</h3></div><p>Use this lane only after the repair console has narrowed the fault to anchors or crop boxes. Save the override file, then rebuild the current selected candidates to refresh pack evidence, preview, and compare.</p></div><div class="cg-override-grid"><article class="cg-override-editor"><div class="cg-rig-kicker">anchors.json</div><h4>Per-view anchor override</h4><p>Seeded from ${escHtml(
                  selectedAnchorsOverrideSeed.source === "override"
                    ? "the current override file"
                    : selectedAnchorsOverrideSeed.source === "proposal"
                      ? "the current proposal anchor manifest"
                      : "an empty anchor scaffold"
                )}. Edit only the anchors that need manual correction. Valid status values are present, occluded, missing, and not_applicable.</p><p class="cg-override-meta">${
                  selectedGeneratedLineage.overrides.anchorsUrl
                    ? `raw file: <a href="${escHtml(selectedGeneratedLineage.overrides.anchorsUrl)}">anchors.json</a>`
                    : "No anchors.json override file has been saved yet."
                }</p><form method="post" action="/ui/character-generator/overrides/save">${renderCreationNavHiddenFields(
                  creationNav
                )}<input type="hidden" name="generateJobId" value="${escHtml(selectedJob.id)}"/><input type="hidden" name="overrideKind" value="anchors"/><textarea name="overrideJson" rows="16">${escHtml(
                  selectedAnchorsOverrideSeed.text
                )}</textarea><div class="cg-override-actions"><button type="submit" name="afterSave" value="save">Save anchors.json</button><button type="submit" name="afterSave" value="rebuild" class="secondary"${
                  selectedHasRebuildSelection ? "" : " disabled"
                }>Save + rebuild current selection</button></div></form><div class="cg-override-actions"><form method="post" action="/ui/character-generator/overrides/clear">${renderCreationNavHiddenFields(
                  creationNav
                )}<input type="hidden" name="generateJobId" value="${escHtml(selectedJob.id)}"/><input type="hidden" name="overrideKind" value="anchors"/><button type="submit" name="afterClear" value="clear" class="secondary">Clear anchors.json</button><button type="submit" name="afterClear" value="rebuild" class="secondary"${
                  selectedHasRebuildSelection ? "" : " disabled"
                }>Clear + rebuild</button></form></div></article><article class="cg-override-editor"><div class="cg-rig-kicker">crop-boxes.json</div><h4>Crop box override</h4><p>Seeded from ${escHtml(
                  selectedCropBoxesOverrideSeed.source === "override"
                    ? "the current override file"
                    : selectedCropBoxesOverrideSeed.source === "proposal"
                      ? "the current proposal crop boxes"
                      : "an empty crop-box scaffold"
                )}. Use this when head, torso, eye, or mouth crop regions are stable but need a narrower manual frame before the next pack rebuild.</p><p class="cg-override-meta">${
                  selectedGeneratedLineage.overrides.cropBoxesUrl
                    ? `raw file: <a href="${escHtml(selectedGeneratedLineage.overrides.cropBoxesUrl)}">crop-boxes.json</a>`
                    : "No crop-boxes.json override file has been saved yet."
                }</p><form method="post" action="/ui/character-generator/overrides/save">${renderCreationNavHiddenFields(
                  creationNav
                )}<input type="hidden" name="generateJobId" value="${escHtml(selectedJob.id)}"/><input type="hidden" name="overrideKind" value="cropBoxes"/><textarea name="overrideJson" rows="16">${escHtml(
                  selectedCropBoxesOverrideSeed.text
                )}</textarea><div class="cg-override-actions"><button type="submit" name="afterSave" value="save">Save crop-boxes.json</button><button type="submit" name="afterSave" value="rebuild" class="secondary"${
                  selectedHasRebuildSelection ? "" : " disabled"
                }>Save + rebuild current selection</button></div></form><div class="cg-override-actions"><form method="post" action="/ui/character-generator/overrides/clear">${renderCreationNavHiddenFields(
                  creationNav
                )}<input type="hidden" name="generateJobId" value="${escHtml(selectedJob.id)}"/><input type="hidden" name="overrideKind" value="cropBoxes"/><button type="submit" name="afterClear" value="clear" class="secondary">Clear crop-boxes.json</button><button type="submit" name="afterClear" value="rebuild" class="secondary"${
                  selectedHasRebuildSelection ? "" : " disabled"
                }>Clear + rebuild</button></form></div></article><article class="cg-override-editor"><div class="cg-rig-kicker">Current Selection Rebuild</div><h4>Rebuild the Character Pack with current selected candidates</h4><p>This path keeps the current selected candidate ids and reruns pack assembly / preview. Use it after saving anchors.json or crop-boxes.json so compare reads the updated rig evidence without a fresh full recreate.</p><p class="cg-override-meta">${escHtml(
                  selectedRebuildSelectionSummary
                )}</p><div class="notice">${
                  selectedHasRebuildSelection
                    ? "The current run has a complete selected candidate set. Rebuild is available now."
                    : "Current run does not yet record front, threeQuarter, and profile selections. Save overrides first, then rebuild after compare or pick has materialized the selected set."
                }</div><div class="cg-override-actions"><form method="post" action="/ui/character-generator/rebuild-selected">${renderCreationNavHiddenFields(
                  creationNav
                )}<input type="hidden" name="generateJobId" value="${escHtml(selectedJob.id)}"/><button type="submit"${
                  selectedHasRebuildSelection ? "" : ' class="secondary" disabled'
                }>Rebuild current selection</button></form></div><p class="cg-override-meta">Prefer this narrow rebuild before view regenerate or full pack recreate whenever the current images are good and only rig/crop interpretation needs manual correction.</p></article></div></section>`
              : ""
          }`
        : "";
    const selectedPackCoherenceSection = selectedManifest
      ? selectedPackCoherence
        ? `<div class="notice">pack coherence: <span class="badge ${coherenceBadge(
            selectedPackCoherence.severity
          )}">${escHtml(selectedPackCoherence.severity)}</span> / score=${escHtml(
            selectedPackCoherence.score.toFixed(2)
          )} / source=${escHtml(selectedSelectionDiagnostics?.finalSelectionSource ?? "-")} / blocking=${escHtml(
            selectedPackCoherence.blockingViews.join(", ") || "none"
          )} / warnings=${escHtml(selectedPackCoherence.warningViews.join(", ") || "none")}</div><p>issues: ${escHtml(
            selectedPackCoherence.issues.join(", ") || "none"
          )}</p><p>metrics: anchor=${escHtml(
            formatMetric(selectedPackCoherence.metrics?.frontAnchorScore)
          )} / frontStyle=${escHtml(
            formatMetric(selectedPackCoherence.metrics?.frontStyleScore)
          )} / frontSpecies=${escHtml(
            formatMetric(selectedPackCoherence.metrics?.frontSpeciesScore)
          )} / threeQuarter=${escHtml(
            formatMetric(selectedPackCoherence.metrics?.threeQuarterConsistency)
          )} / profile=${escHtml(
            formatMetric(selectedPackCoherence.metrics?.profileConsistency)
          )} / speciesSpread=${escHtml(
            formatMetric(selectedPackCoherence.metrics?.speciesSpread)
          )} / styleSpread=${escHtml(
            formatMetric(selectedPackCoherence.metrics?.styleSpread)
          )} / headSpread=${escHtml(
            formatMetric(selectedPackCoherence.metrics?.headRatioSpread)
          )} / monoSpread=${escHtml(
            formatMetric(selectedPackCoherence.metrics?.monochromeSpread)
          )}</p>`
        : `<div class="notice">pack coherence diagnostics not recorded yet.</div>`
      : "";
    const selectedRigStabilitySection =
      selectedManifest && selectedRigStability
        ? `<div class="notice">rig stability: <span class="badge ${coherenceBadge(
            selectedRigStability.severity
          )}">${escHtml(selectedRigState.title)}</span> / action=${escHtml(
            selectedRigStability.suggestedAction ?? "observe"
          )} / overallAnchor=${escHtml(
            formatMetric(selectedRigStability.anchorConfidenceOverall)
          )}</div><p>summary: ${escHtml(selectedRigStability.summary)}</p><p>blocking=${escHtml(
            selectedRigStability.blockingViews?.join(", ") || "none"
          )} / warnings=${escHtml(selectedRigStability.warningViews?.join(", ") || "none")} / fallbacks=${escHtml(
            summarizeRigFallbackReasonCodes(selectedRigStability.fallbackReasonCodes)
          )}</p><div class="cg-signal-table" style="margin-top:10px"><table><thead><tr><th>View</th><th>State</th><th>Selected Candidate</th><th>Anchor</th><th>Landmark</th><th>Fallbacks</th><th>Warnings</th><th>Rejections</th></tr></thead><tbody>${selectedRigViewRows}</tbody></table></div>${
            selectedRigFallbackCards ? `<div class="cg-signal-flag-grid" style="margin-top:10px">${selectedRigFallbackCards}</div>` : ""
          }`
        : "";
    const selectedCandidateSummarySection =
      selectedManifest && selectedSelectionDiagnostics?.selectedCandidateSummaryByView
        ? `<details class="card" style="margin-top:10px"><summary><strong>Selected Candidate Summary</strong></summary><div class="asset-table-wrap" style="margin-top:10px"><table><thead><tr><th>View</th><th>Candidate</th><th>RT</th><th>Score</th><th>Consistency</th><th>Anchor</th><th>Rig</th><th>Warnings</th><th>Rejections</th></tr></thead><tbody>${(["front", "threeQuarter", "profile"] as const)
            .map((view) => {
              const summary = selectedSelectionDiagnostics.selectedCandidateSummaryByView?.[view];
              return summary
                ? `<tr><td>${escHtml(view)}</td><td>${escHtml(summary.candidateId)}</td><td>${escHtml(
                    summary.runtimeBucket ?? "-"
                  )}</td><td>${escHtml(
                    typeof summary.score === "number" ? summary.score.toFixed(4) : "-"
                  )}</td><td>${escHtml(
                    typeof summary.consistencyScore === "number"
                      ? summary.consistencyScore.toFixed(4)
                      : summary.consistencyScore === null
                        ? "null"
                        : "-"
                  )}</td><td>${escHtml(
                    typeof summary.anchorConfidence === "number"
                      ? summary.anchorConfidence.toFixed(4)
                      : summary.anchorConfidence === null
                        ? "null"
                        : "-"
                  )}</td><td>${escHtml(
                    summary.rigFallbackReasonCodes?.join(", ") || "-"
                  )}</td><td>${escHtml(summary.warningCount ?? "-")}</td><td>${escHtml(
                    summary.rejectionCount ?? "-"
                  )}</td></tr>`
                : `<tr><td>${escHtml(view)}</td><td colspan="8">-</td></tr>`;
            })
            .join("")}</tbody></table></div></details>`
        : "";
    const selectedViewDecisionMatrixSection = selectedManifest
      ? `<details class="card" style="margin-top:10px"><summary><strong>View Decision Matrix</strong></summary><div class="asset-table-wrap" style="margin-top:10px"><table><thead><tr><th>View</th><th>Selected</th><th>Last Gate</th><th>Repair Triage</th><th>Repair Accept</th><th>Defects</th><th>Recommended</th></tr></thead><tbody>${(["front", "threeQuarter", "profile"] as const)
          .map((view) => {
            const selectedSummary = selectedSelectionDiagnostics?.selectedCandidateSummaryByView?.[view];
            const latestGate = findLatestGateDecisionForView(selectedWorkflowStages, view);
            const latestTriage = findLatestRepairTriageForView(selectedWorkflowStages, view);
            const latestRepairAcceptance = findLatestRepairAcceptanceForView(selectedWorkflowStages, view);
            const defects =
              selectedPackDefectSummary?.persistentFamiliesByView?.[view] ??
              selectedPackDefectSummary?.defectFamiliesByView?.[view] ??
              [];
            const action = selectedRecommendedActions.find((entry) => entry.view === view);
            const gateSummary = latestGate.gate
              ? `${latestGate.gate.decision}${latestGate.gate.chosenStage ? `:${latestGate.gate.chosenStage}` : ""}${
                  summarizeRuntimeDecisionReasons(latestGate.gate.reasons)
                    ? ` [${summarizeRuntimeDecisionReasons(latestGate.gate.reasons)}]`
                    : ""
                }`
              : "-";
            const triageSummary = latestTriage.triage
              ? `${latestTriage.triage.decision}${latestTriage.triage.priority ? `:${latestTriage.triage.priority}` : ""}${
                  latestTriage.triage.repairFamilies?.length ? `(${latestTriage.triage.repairFamilies.join("+")})` : ""
                }`
              : "-";
            const repairAcceptanceSummary = latestRepairAcceptance.acceptance
              ? `${latestRepairAcceptance.acceptance.decision}${
                  latestRepairAcceptance.acceptance.chosenStage
                    ? `:${latestRepairAcceptance.acceptance.chosenStage}`
                    : ""
                }${
                  summarizeRuntimeDecisionReasons(latestRepairAcceptance.acceptance.reasonCodes)
                    ? ` [${summarizeRuntimeDecisionReasons(latestRepairAcceptance.acceptance.reasonCodes)}]`
                    : ""
                }`
              : "-";
            return `<tr><td>${escHtml(view)}</td><td>${escHtml(
              selectedSummary?.candidateId
                ? `${selectedSummary.candidateId}${selectedSummary.runtimeBucket ? ` [rt=${selectedSummary.runtimeBucket}]` : ""}`
                : "-"
            )}</td><td>${escHtml(
              gateSummary
            )}</td><td>${escHtml(triageSummary)}</td><td>${escHtml(repairAcceptanceSummary)}</td><td>${escHtml(defects.join(", ") || "none")}</td><td>${escHtml(
              action?.label ?? "-"
            )}</td></tr>`;
          })
          .join("")}</tbody></table></div></details>`
      : "";
    const selectedAutoRerouteDeltaSection =
      selectedAutoReroute?.viewDeltaByView && Object.keys(selectedAutoReroute.viewDeltaByView).length > 0
        ? `<div class="asset-table-wrap" style="margin-top:10px"><table><thead><tr><th>View</th><th>Before</th><th>After</th><th>Score ?</th><th>Consistency ?</th><th>Warnings ?</th><th>Rejections ?</th></tr></thead><tbody>${(["front", "threeQuarter", "profile"] as const)
            .map((view) => {
              const delta = selectedAutoReroute.viewDeltaByView?.[view];
              return delta
                ? `<tr><td>${escHtml(view)}</td><td>${escHtml(delta.beforeCandidateId ?? "-")}</td><td>${escHtml(
                    delta.afterCandidateId ?? "-"
                  )}</td><td>${escHtml(
                    typeof delta.scoreDelta === "number" ? delta.scoreDelta.toFixed(4) : "-"
                  )}</td><td>${escHtml(
                    typeof delta.consistencyDelta === "number"
                      ? delta.consistencyDelta.toFixed(4)
                      : delta.consistencyDelta === null
                        ? "null"
                        : "-"
                  )}</td><td>${escHtml(delta.warningDelta ?? "-")}</td><td>${escHtml(
                    delta.rejectionDelta ?? "-"
                  )}</td></tr>`
                : `<tr><td>${escHtml(view)}</td><td colspan="6">-</td></tr>`;
            })
            .join("")}</tbody></table></div>`
        : "";
    const selectedAutoRerouteSection = selectedManifest
      ? selectedAutoReroute?.attempted
        ? `<div class="notice">auto reroute: <span class="badge ${uiBadge(
            selectedAutoReroute.recovered ? "READY" : "FAILED"
          )}">${escHtml(selectedAutoReroute.recovered ? "recovered" : "not recovered")}</span> / strategy=${escHtml(
            selectedAutoReroute.strategy ?? "-"
          )} / targets=${escHtml(selectedAutoReroute.targetViews.join(", ") || "none")} / triggers=${escHtml(
            selectedAutoReroute.triggers.join(", ") || "none"
          )}</div><p>initial missing=${escHtml(
            selectedAutoReroute.initialMissingViews.join(", ") || "none"
          )} / initial lowQuality=${escHtml(
            selectedAutoReroute.initialLowQualityViews.join(", ") || "none"
          )} / final missing=${escHtml(
            selectedAutoReroute.finalMissingViews?.join(", ") || "none"
          )} / final lowQuality=${escHtml(
            selectedAutoReroute.finalLowQualityViews?.join(", ") || "none"
          )}</p><p>coherence before=${escHtml(
            selectedAutoReroute.initialPackCoherence
              ? summarizePackCoherence(selectedAutoReroute.initialPackCoherence)
              : "-"
          )} / after=${escHtml(
            selectedAutoReroute.finalPackCoherence
              ? summarizePackCoherence(selectedAutoReroute.finalPackCoherence)
              : "-"
          )} / notes=${escHtml(selectedAutoReroute.notes.join(" | ") || "none")}</p>${selectedAutoRerouteDeltaSection}`
        : `<div class="notice">auto reroute did not run for this manifest.</div>`
      : "";
    const selectedSelectionRiskSection = selectedManifest
      ? selectedSelectionRisk
        ? `<div class="notice">selection risk: <span class="badge ${uiBadge(
            selectedSelectionRisk.level === "block"
              ? "FAILED"
              : selectedSelectionRisk.level === "review"
                ? "RUNNING"
                : "READY"
          )}">${escHtml(selectedSelectionRisk.level)}</span> / action=${escHtml(
            selectedSelectionRisk.suggestedAction ?? "-"
          )} / summary=${escHtml(selectedSelectionRisk.summary)}</div><p>reasons: ${escHtml(
            selectedSelectionRisk.reasonCodes.join(", ") || "none"
          )}</p>`
        : `<div class="notice">selection risk diagnostics not recorded yet.</div>`
      : "";
    const selectedQualityEmbargoSection = selectedManifest
      ? selectedQualityEmbargo
        ? `<div class="notice">quality embargo: <span class="badge ${uiBadge(
            selectedQualityEmbargo.level === "block"
              ? "FAILED"
              : selectedQualityEmbargo.level === "review"
                ? "RUNNING"
                : "READY"
          )}">${escHtml(selectedQualityEmbargo.level)}</span> / action=${escHtml(
            selectedQualityEmbargo.suggestedAction ?? "-"
          )} / summary=${escHtml(selectedQualityEmbargo.summary)}</div><p>blocking=${escHtml(
            selectedQualityEmbargo.blockingViews?.join(", ") || "none"
          )} / warnings=${escHtml(selectedQualityEmbargo.warningViews?.join(", ") || "none")} / reasons=${escHtml(
            selectedQualityEmbargo.reasonCodes.join(", ") || "none"
          )}</p><p>defects=${escHtml(
            selectedQualityEmbargo.defectFamiliesByView
              ? (["front", "threeQuarter", "profile"] as const)
                  .filter((view) => Array.isArray(selectedQualityEmbargo.defectFamiliesByView?.[view]) && (selectedQualityEmbargo.defectFamiliesByView?.[view]?.length ?? 0) > 0)
                  .map((view) => `${view}:${selectedQualityEmbargo.defectFamiliesByView?.[view]?.join("+")}`)
                  .join(" / ")
              : "none"
          )}</p>`
        : `<div class="notice">quality embargo diagnostics not recorded yet.</div>`
      : "";
    const selectedPackDefectSummarySection = selectedManifest
      ? selectedPackDefectSummary
        ? `<div class="notice">pack defects: repeated=${escHtml(
            selectedPackDefectSummary.repeatedFamilies.join(", ") || "none"
          )} / blocking=${escHtml(
            selectedPackDefectSummary.blockingFamilies.join(", ") || "none"
          )} / warning=${escHtml(selectedPackDefectSummary.warningFamilies.join(", ") || "none")}</div><p>current=${escHtml(
            selectedPackDefectSummary.defectFamiliesByView
              ? (["front", "threeQuarter", "profile"] as const)
                  .filter((view) => Array.isArray(selectedPackDefectSummary.defectFamiliesByView?.[view]) && (selectedPackDefectSummary.defectFamiliesByView?.[view]?.length ?? 0) > 0)
                  .map((view) => `${view}:${selectedPackDefectSummary.defectFamiliesByView?.[view]?.join("+")}`)
                  .join(" / ")
              : "none"
          )}</p><p>persistent=${escHtml(
            selectedPackDefectSummary.persistentFamiliesByView
              ? (["front", "threeQuarter", "profile"] as const)
                  .filter((view) => Array.isArray(selectedPackDefectSummary.persistentFamiliesByView?.[view]) && (selectedPackDefectSummary.persistentFamiliesByView?.[view]?.length ?? 0) > 0)
                  .map((view) => `${view}:${selectedPackDefectSummary.persistentFamiliesByView?.[view]?.join("+")}`)
                  .join(" / ")
              : "none"
          )}</p>`
        : `<div class="notice">pack defect summary not recorded yet.</div>`
      : "";
    const selectedFinalQualityFirewallSection = selectedManifest
      ? selectedFinalQualityFirewall
        ? `<div class="notice">final quality firewall: <span class="badge ${uiBadge(
            selectedFinalQualityFirewall.level === "block"
              ? "FAILED"
              : selectedFinalQualityFirewall.level === "review"
                ? "RUNNING"
                : "READY"
          )}">${escHtml(selectedFinalQualityFirewall.level)}</span> / action=${escHtml(
            selectedFinalQualityFirewall.suggestedAction ?? "-"
          )} / summary=${escHtml(selectedFinalQualityFirewall.summary)}</div><p>blocking=${escHtml(
            selectedFinalQualityFirewall.blockingViews?.join(", ") || "none"
          )} / warnings=${escHtml(
            selectedFinalQualityFirewall.warningViews?.join(", ") || "none"
          )} / repeated=${escHtml(
            selectedFinalQualityFirewall.repeatedFamilies?.join(", ") || "none"
          )} / reasons=${escHtml(selectedFinalQualityFirewall.reasonCodes.join(", ") || "none")}</p><p>persistent=${escHtml(
            selectedFinalQualityFirewall.persistentFamiliesByView
              ? (["front", "threeQuarter", "profile"] as const)
                  .filter((view) => Array.isArray(selectedFinalQualityFirewall.persistentFamiliesByView?.[view]) && (selectedFinalQualityFirewall.persistentFamiliesByView?.[view]?.length ?? 0) > 0)
                  .map((view) => `${view}:${selectedFinalQualityFirewall.persistentFamiliesByView?.[view]?.join("+")}`)
                  .join(" / ")
              : "none"
          )}</p>`
        : `<div class="notice">final quality firewall diagnostics not recorded yet.</div>`
      : "";
    const selectedDecisionOutcomeSection = selectedManifest
      ? selectedDecisionOutcome
        ? `<div class="notice">decision outcome: <span class="badge ${uiBadge(
            selectedDecisionOutcome.status === "blocked"
              ? "FAILED"
              : selectedDecisionOutcome.status === "review"
                ? "RUNNING"
                : "READY"
          )}">${escHtml(selectedDecisionOutcome.status)}</span> / kind=${escHtml(
            selectedDecisionOutcome.kind
          )} / stage=${escHtml(selectedDecisionOutcome.sourceStage ?? "-")} / escalated=${escHtml(
            selectedDecisionOutcome.escalatedAction ?? "-"
          )} / runtime=${escHtml(selectedDecisionOutcome.worstRuntimeBucket ?? "-")}</div><p>summary=${escHtml(selectedDecisionOutcome.summary)} / reasons=${escHtml(
            selectedDecisionOutcome.reasonCodes.join(", ") || "none"
          )} / recoveredViews=${escHtml(selectedDecisionOutcome.recoveredViews?.join(", ") || "none")}</p>`
        : `<div class="notice">decision outcome not recorded yet.</div>`
      : "";
    const selectedReferenceSection = selectedManifest
      ? `<div class="notice">reference: asset=${escHtml(
          selectedManifest.reference?.assetId ?? "-"
        )} / sourceSession=${escHtml(selectedManifest.reference?.sourceSessionId ?? "-")} / starter=${escHtml(
          selectedManifest.reference?.starterPath ?? "-"
        )} / continuity=${selectedContinuity ? `<span class="badge ${uiBadge(
          selectedContinuity.applied ? "READY" : selectedContinuity.attempted ? "RUNNING" : "DRAFT"
        )}">${escHtml(selectedContinuity.applied ? "applied" : selectedContinuity.attempted ? "attempted" : "idle")}</span>` : "-"}</div>${
          selectedContinuity
            ? `<p>continuity reason=${escHtml(selectedContinuity.reason)} / pool=${escHtml(
                selectedContinuity.sourcePool ?? "-"
              )} / candidatePicked=${escHtml(
                selectedContinuity.candidatePicked ?? "-"
              )} / candidateScore=${escHtml(
                formatMetric(selectedContinuity.candidateScore)
              )} / queued=${escHtml(
                selectedContinuity.queuedSessionCount ?? "-"
              )} / uniqueQueued=${escHtml(
                selectedContinuity.uniqueQueuedSessionCount ?? "-"
              )} / searched=${escHtml(selectedContinuity.searchedSessionCount ?? "-")}</p>`
            : `<p>continuity snapshot not recorded yet.</p>`
        }`
      : "";
    const selectedWorkflowRuntimeSection = selectedManifest
      ? selectedWorkflowRuntimeDiagnostics.length > 0
        ? `<details class="card" style="margin-top:10px"><summary><strong>Selected Workflow Runtime</strong> ${escHtml(
            summarizeSelectedWorkflowRuntimeDiagnostics(selectedWorkflowRuntimeDiagnostics)
          )}</summary><div class="asset-table-wrap" style="margin-top:10px"><table><thead><tr><th>View</th><th>Candidate</th><th>Route</th><th>Inputs</th><th>Structure</th><th>Preflight</th><th>Warnings</th></tr></thead><tbody>${selectedWorkflowRuntimeDiagnostics
            .map(
              (entry) =>
                `<tr><td>${escHtml(entry.view)}</td><td>${escHtml(entry.candidateId)}</td><td>${escHtml(
                  `${entry.compact} / stage=${entry.workflowStage ?? "-"} / template=${entry.workflowTemplateVersion ?? "-"}`
                )}</td><td>${escHtml(summarizeWorkflowRuntimeInputs(entry))}</td><td>${escHtml(
                  summarizeWorkflowRuntimeStructure(entry)
                )}</td><td>${escHtml(summarizeWorkflowRuntimePreflight(entry))}</td><td>${escHtml(
                  entry.warnings?.slice(0, 3).join(" | ") || "none"
                )}</td></tr>`
            )
            .join("")}</tbody></table></div></details>`
        : `<div class="notice">selected workflow runtime diagnostics not recorded yet.</div>`
      : "";
    const selectedWorkflowStageSection =
      selectedManifest && selectedWorkflowStages.length > 0
        ? `<details class="card" style="margin-top:10px"><summary><strong>Workflow Stages</strong> (${escHtml(
            selectedWorkflowStages.length
          )}) ${escHtml(summarizeWorkflowStages(selectedWorkflowStages))}</summary><div class="asset-table-wrap" style="margin-top:10px"><table><thead><tr><th>Stage</th><th>Variant</th><th>Template</th><th>Views</th><th>Rounds</th><th>Count</th><th>Threshold</th><th>Refs</th><th>Preflight</th><th>Repair</th><th>Directive</th><th>Outcome</th></tr></thead><tbody>${selectedWorkflowStages
            .map((stage) => {
              const variantSummary = [
                stage.origin ? `origin=${stage.origin}` : "",
                stage.passLabel ? `pass=${stage.passLabel}` : "",
                typeof stage.seedOffset === "number" ? `seed=${stage.seedOffset}` : "",
                Array.isArray(stage.triggerViews) && stage.triggerViews.length > 0
                  ? `trigger=${stage.triggerViews.join(",")}`
                  : "",
                Array.isArray(stage.reasonCodes) && stage.reasonCodes.length > 0
                  ? `reasons=${stage.reasonCodes.join("+")}`
                  : "",
                Array.isArray(stage.runtimeVariantTags) && stage.runtimeVariantTags.length > 0
                  ? `runtime=${stage.runtimeVariantTags.join("+")}`
                  : ""
              ]
                .filter((entry) => entry.length > 0)
                .join(" / ");
              const preflightSummary = [
                stage.executionViews && stage.executionViews.length > 0
                  ? `exec=${stage.executionViews.map((view) => shortView(view)).join(",")}`
                  : "",
                stage.blockedViewsByPreflight && stage.blockedViewsByPreflight.length > 0
                  ? `block=${stage.blockedViewsByPreflight.map((view) => shortView(view)).join(",")}`
                  : "",
                stage.warningViewsByPreflight && stage.warningViewsByPreflight.length > 0
                  ? `warn=${stage.warningViewsByPreflight.map((view) => shortView(view)).join(",")}`
                  : "",
                stage.preflightByView ? summarizeStagePreflightByView(stage.preflightByView) : ""
              ]
                .filter((entry) => entry.length > 0)
                .join(" / ");
              const referenceSummary = stage.referenceBankSizeByView
                ? (["front", "threeQuarter", "profile"] as const)
                    .filter((view) => typeof stage.referenceBankSizeByView?.[view] === "number")
                    .map((view) => {
                      const size = stage.referenceBankSizeByView?.[view];
                      const mix = stage.referenceMixByView?.[view];
                      const roles =
                        mix && Object.keys(mix.roles).length > 0
                          ? Object.entries(mix.roles)
                              .map(([role, summary]) => `${role}:${summary.count}@${summary.weightSum.toFixed(2)}`)
                              .join(",")
                          : "";
                      return `${view}=${size}${roles ? `[${roles}]` : ""}`;
                    })
                    .join(" / ")
                : "-";
              const repairSummary = stage.repairFromCandidateIds
                ? (["front", "threeQuarter", "profile"] as const)
                    .filter((view) => typeof stage.repairFromCandidateIds?.[view] === "string")
                    .map((view) => `${view}=${stage.repairFromCandidateIds?.[view]}`)
                    .join(" / ")
                : "-";
              const directiveSummary = stage.directiveProfilesByView
                ? (["front", "threeQuarter", "profile"] as const)
                    .filter((view) => stage.directiveProfilesByView?.[view])
                    .map((view) => {
                      const directive = stage.directiveProfilesByView?.[view];
                      return `${view}=${directive?.severity}:${directive?.families.join("+") || "none"}${directive?.disablePose ? "/no-pose" : ""}`;
                    })
                    .join(" / ")
                : "-";
              const outcomeSummary = stage.bestCandidateSummaryByView
                ? (["front", "threeQuarter", "profile"] as const)
                    .filter((view) => stage.bestCandidateSummaryByView?.[view])
                    .map((view) => {
                      const summary = stage.bestCandidateSummaryByView?.[view];
                      const status = summary?.passed ? "ok" : "fail";
                      const score = typeof summary?.score === "number" ? summary.score.toFixed(2) : "-";
                      const reasons =
                        Array.isArray(summary?.failureReasons) && summary.failureReasons.length > 0
                          ? `(${summary.failureReasons.slice(0, 2).join("+")})`
                          : "";
                      const runtimeBucket = summary?.runtimeBucket ? `[rt=${summary.runtimeBucket}]` : "";
                      const defects =
                        Array.isArray(stage.observedDefectFamiliesByView?.[view]) && (stage.observedDefectFamiliesByView?.[view]?.length ?? 0) > 0
                          ? `{${stage.observedDefectFamiliesByView?.[view]?.slice(0, 3).join("+")}}`
                          : "";
                      return `${view}=${status}@${score}${runtimeBucket}${reasons}${defects}`;
                    })
                    .join(" / ")
                : "-";
              const gateSummary = stage.gateDecisionsByView
                ? (["front", "threeQuarter", "profile"] as const)
                    .filter((view) => stage.gateDecisionsByView?.[view])
                    .map((view) => {
                      const gate = stage.gateDecisionsByView?.[view];
                      const scoreDelta =
                        typeof gate?.scoreDeltaVsBase === "number" ? gate.scoreDeltaVsBase.toFixed(2) : "-";
                      const consistencyDelta =
                        typeof gate?.consistencyDeltaVsBase === "number"
                          ? gate.consistencyDeltaVsBase.toFixed(2)
                          : gate?.consistencyDeltaVsBase === null
                            ? "null"
                            : "-";
                      const runtimeSummary = summarizeRuntimeDecisionReasons(gate?.reasons);
                      return `${view}=${gate?.decision}:${gate?.chosenStage ?? "-"}@${gate?.chosenCandidateId ?? "-"}(s=${scoreDelta},c=${consistencyDelta})${
                        runtimeSummary ? `{${runtimeSummary}}` : ""
                      }`;
                    })
                    .join(" / ")
                : "";
              const repairTriageSummary = stage.repairTriageByView
                ? (["front", "threeQuarter", "profile"] as const)
                    .filter((view) => stage.repairTriageByView?.[view])
                    .map((view) => {
                      const triage = stage.repairTriageByView?.[view];
                      const score = typeof triage?.score === "number" ? triage.score.toFixed(2) : "-";
                      const consistency =
                        typeof triage?.consistencyScore === "number"
                          ? triage.consistencyScore.toFixed(2)
                          : triage?.consistencyScore === null
                            ? "null"
                            : "-";
                      const familySummary =
                        Array.isArray(triage?.repairFamilies) && triage.repairFamilies.length > 0
                          ? `{${triage.repairFamilies.join("+")}}`
                          : "";
                      return `${view}=${triage?.decision}:${triage?.sourceStage ?? "-"}@${triage?.sourceCandidateId ?? "-"}(p=${triage?.priority ?? "-"},s=${score},c=${consistency})${familySummary}`;
                    })
                    .join(" / ")
                : "";
              const repairAcceptanceSummary = stage.repairAcceptanceByView
                ? (["front", "threeQuarter", "profile"] as const)
                    .filter((view) => stage.repairAcceptanceByView?.[view])
                    .map((view) => {
                      const acceptance = stage.repairAcceptanceByView?.[view];
                      const shortView = view === "front" ? "f" : view === "threeQuarter" ? "t" : "p";
                      const scoreDelta =
                        typeof acceptance?.scoreDeltaVsPreRepair === "number"
                          ? `${acceptance.scoreDeltaVsPreRepair >= 0 ? "+" : ""}${acceptance.scoreDeltaVsPreRepair.toFixed(2)}`
                          : "";
                      const consistencyDelta =
                        typeof acceptance?.consistencyDeltaVsPreRepair === "number"
                          ? `${acceptance.consistencyDeltaVsPreRepair >= 0 ? "+" : ""}${acceptance.consistencyDeltaVsPreRepair.toFixed(2)}`
                          : acceptance?.consistencyDeltaVsPreRepair === null
                            ? "null"
                            : "";
                      const deltaSummary = [scoreDelta ? `s${scoreDelta}` : "", consistencyDelta ? `c${consistencyDelta}` : ""]
                        .filter((entry) => entry.length > 0)
                        .join("|");
                      const runtimeSummary = summarizeRuntimeDecisionReasons(acceptance?.reasonCodes);
                      return `${shortView}:${acceptance?.decision}${deltaSummary ? `(${deltaSummary})` : ""}${
                        runtimeSummary ? `{${runtimeSummary}}` : ""
                      }`;
                    })
                    .join(" / ")
                : "";
              const exitSummary = [
                Array.isArray(stage.passedViews) && stage.passedViews.length > 0
                  ? `pass=${stage.passedViews.join(",")}`
                  : "",
                Array.isArray(stage.failedViews) && stage.failedViews.length > 0
                  ? `fail=${stage.failedViews.join(",")}`
                  : "",
                stage.failureReasonsByView
                  ? (["front", "threeQuarter", "profile"] as const)
                      .filter((view) => Array.isArray(stage.failureReasonsByView?.[view]) && (stage.failureReasonsByView?.[view]?.length ?? 0) > 0)
                      .map((view) => `${view}:${stage.failureReasonsByView?.[view]?.slice(0, 2).join("+")}`)
                      .join(" / ")
                  : ""
              ]
                .filter((entry) => entry.length > 0)
                .join(" / ");
              return `<tr><td>${escHtml(stage.stage)}</td><td>${escHtml(variantSummary || "-")}</td><td>${escHtml(stage.templateVersion)}</td><td>${escHtml(
                stage.views.join(", ") || "-"
              )}</td><td>${escHtml(stage.roundsAttempted)}</td><td>${escHtml(stage.candidateCount)}</td><td>${escHtml(
                stage.acceptedScoreThreshold.toFixed(2)
              )}</td><td>${escHtml(referenceSummary || "-")}</td><td>${escHtml(
                preflightSummary || "-"
              )}</td><td>${escHtml(
                repairSummary || "-"
              )}</td><td>${escHtml(directiveSummary || "-")}</td><td>${escHtml(
                [exitSummary, outcomeSummary, gateSummary, repairTriageSummary, repairAcceptanceSummary].filter((entry) => entry.length > 0).join(" // ") || "-"
              )}</td></tr>`;
            })
            .join("")}</tbody></table></div></details>`
        : selectedManifest
          ? `<div class="notice">workflow stage history not recorded yet.</div>`
          : "";
    const candidateCardsForView = (view: CharacterGenerationView): string => {
      if (!selectedManifest) {
        return "";
      }
      const selectedSummary = selectedSelectionDiagnostics?.selectedCandidateSummaryByView?.[view];
      const viewState = summarizeRigViewState(view, selectedRigStability);
      const cards = selectedManifest.candidates
        .filter((candidate) => candidate.view === view)
        .sort((left, right) => right.score - left.score)
        .map((candidate) => {
          const workflowFiles = candidate.providerMeta?.workflowFiles;
          const isPicked = selectedManifest.selectedByView?.[view]?.candidateId === candidate.id;
          const runtimeSnapshot =
            extractWorkflowRuntimeSnapshot(candidate.providerMeta) ??
            readWorkflowRuntimeSummary(candidate.providerMeta?.workflowFiles?.summaryPath);
          const runSummary = candidate.providerMeta?.runSettings
            ? `sampler=${candidate.providerMeta.runSettings.sampler ?? "-"} / steps=${candidate.providerMeta.runSettings.steps ?? "-"} / cfg=${candidate.providerMeta.runSettings.cfg ?? "-"}`
            : "";
          const postprocess = candidate.providerMeta?.postprocess?.applied
            ? `postprocess=${candidate.providerMeta.postprocess.outputWidth ?? "-"}x${candidate.providerMeta.postprocess.outputHeight ?? "-"}`
            : "postprocess=none";
          const adapterSummary = runtimeSnapshot
            ? `${summarizeWorkflowRuntimeCompact(runtimeSnapshot)} / ${summarizeWorkflowRuntimePreflight(runtimeSnapshot)}`
            : "-";
          return `<tr><td>${escHtml(candidate.id)}${isPicked ? ' <span class="badge ok">picked</span>' : ""}</td><td>${escHtml(
            candidate.score.toFixed(3)
          )}</td><td>${escHtml(candidate.consistencyScore === null ? "-" : candidate.consistencyScore.toFixed(3))}</td><td>${escHtml(
            candidate.providerMeta?.qualityProfileId ?? selectedManifest.qualityProfileId ?? "-"
          )}</td><td>${escHtml(runSummary || "-")}</td><td>${escHtml(postprocess)}</td><td>${escHtml(
            adapterSummary
          )}</td><td>${renderArtifactLink(
            "api",
            workflowFiles?.apiPromptPath
          )} | ${renderArtifactLink("summary", workflowFiles?.summaryPath)}${
            workflowFiles?.guiWorkflowPath ? ` | ${renderArtifactLink("gui", workflowFiles.guiWorkflowPath)}` : ""
          }</td></tr>`;
        })
        .join("");
      return cards.length > 0
        ? `<details class="card" style="margin-top:10px"><summary><strong>${escHtml(
            view
          )}</strong> candidate details / rig=${escHtml(viewState.label)} / anchor=${escHtml(
            formatMetric(selectedRigStability?.anchorConfidenceByView?.[view] ?? selectedSummary?.anchorConfidence)
          )}</summary><p style="margin:10px 0 0;color:#4f6270">Selected candidate=${escHtml(
            selectedSummary?.candidateId ?? "-"
          )} / landmark=${escHtml(
            formatMetric(selectedRigStability?.landmarkConsistencyByView?.[view] ?? selectedSummary?.landmarkConsistency)
          )} / fallbacks=${escHtml(
            summarizeRigFallbackReasonCodes(selectedSummary?.rigFallbackReasonCodes)
          )}</p><div class="asset-table-wrap" style="margin-top:10px"><table><thead><tr><th>Candidate</th><th>Score</th><th>Consistency</th><th>Profile</th><th>Run</th><th>Post</th><th>Adapter</th><th>Workflow</th></tr></thead><tbody>${cards}</tbody></table></div></details>`
        : "";
    };

    const renderGeneratorObjectCard = (title: string, value: string, detail: string): string =>
      `<article class="cg-context-card"><h3>${escHtml(title)}</h3><p><strong>${escHtml(value)}</strong></p><p>${escHtml(
        detail
      )}</p></article>`;
    const selectedWorkflowArtifactsSection =
      workflowArtifactRows.length > 0
        ? `<div class="asset-table-wrap"><table><thead><tr><th>View</th><th>Candidate</th><th>Workflow Exports</th></tr></thead><tbody>${workflowArtifactRows
            .map(
              ({ candidate, workflowFiles }) =>
                `<tr><td>${escHtml(candidate.view)}</td><td>${escHtml(candidate.id)}</td><td>${renderArtifactLink(
                  "api",
                  workflowFiles?.apiPromptPath
                )} | ${renderArtifactLink("summary", workflowFiles?.summaryPath)}${
                  workflowFiles?.guiWorkflowPath ? ` | ${renderArtifactLink("gui", workflowFiles.guiWorkflowPath)}` : ""
                }</td></tr>`
            )
            .join("")}</tbody></table></div>`
        : `<div class="notice">No workflow export files were found in this manifest yet.</div>`;
    const selectedPrimaryAction = selectedRecommendedActions[0] ?? null;
    const selectedPrimaryActionTitle = selectedPrimaryAction
      ? selectedPrimaryAction.action === "regenerate-view"
        ? "Candidate set / regenerate one view"
        : selectedPrimaryAction.action === "recreate"
          ? "Character Pack / recreate from current run"
          : "Candidate set / manual compare"
      : selectedManifest?.characterPackId
        ? "Character Pack object / handoff"
        : "Candidate set / compare";
    const selectedPrimaryActionScope = selectedPrimaryAction
      ? selectedPrimaryAction.action === "recreate"
        ? "Character Pack object"
        : selectedPrimaryAction.action === "regenerate-view"
          ? `Candidate set / ${selectedPrimaryAction.view ?? "view"}`
          : "Candidate set / compare"
      : selectedManifest?.characterPackId
        ? "Character Pack object"
        : "Generation Run object";
    const selectedPrimaryActionDetail = selectedPrimaryAction
      ? selectedPrimaryAction.description
      : selectedManifest?.characterPackId
        ? "Candidate compare is already closed. Move this Character Pack into review or active-baseline approval."
        : "Read the candidate set first, then close the Compare stage before opening approval or rollback actions.";
    const selectedPrimaryActionSurfaceHref = selectedPrimaryAction
      ? selectedPrimaryAction.action === "regenerate-view"
        ? "#regenerate-view"
        : selectedPrimaryAction.action === "recreate"
          ? "#recreate-pack"
          : `#${selectedPrimaryAction.anchorId ?? "pick-candidates"}`
      : selectedManifest?.characterPackId
        ? "#pack-preview-handoff"
        : "#pick-candidates";
    const selectedPrimaryActionSurfaceLabel = selectedPrimaryAction
      ? selectedPrimaryAction.action === "regenerate-view"
        ? "Regenerate surface"
        : selectedPrimaryAction.action === "recreate"
          ? "Recreate surface"
          : "Compare surface"
      : selectedManifest?.characterPackId
        ? "Pack handoff"
        : "Candidate compare";
    const selectedReferenceAssetId = creationNav.referenceAssetId ?? creationNav.assetId;
    const generatorSelfNav: CreationNavState = {
      returnTo: creationNav.returnTo,
      currentObject: selectedJob ? `run:${selectedJob.id}` : creationNav.currentObject,
      focus: "cg-active-job",
      assetId: creationNav.assetId,
      referenceAssetId: selectedReferenceAssetId,
      jobId: selectedJob?.id ?? creationNav.jobId
    };
    const hiddenGeneratorSelfNavFields = renderCreationNavHiddenFields(generatorSelfNav);
    const selectedCharactersHref = selectedManifest?.characterPackId
      ? hrefWithCreationNav(
          "/ui/characters",
          { characterPackId: selectedManifest.characterPackId },
          {
            returnTo: currentPageReturnTo,
            currentObject: `pack:${selectedManifest.characterPackId}`,
            focus: "pack-review-current"
          }
        )
      : null;
    const selectedPackGeneratorNavFields = renderCreationNavHiddenFields({
      ...generatorSelfNav,
      currentObject: selectedManifest?.characterPackId
        ? `pack:${selectedManifest.characterPackId}`
        : generatorSelfNav.currentObject
    });
    const studioFastFlowHref = hrefWithCreationNav(
      "/ui/studio",
      { ...(selectedReferenceAssetId ? { assetId: selectedReferenceAssetId } : {}) },
      {
        returnTo: currentPageReturnTo,
        currentObject: selectedManifest?.characterPackId
          ? `pack:${selectedManifest.characterPackId}`
          : selectedJob
            ? `run:${selectedJob.id}`
            : creationNav.currentObject,
        focus: "studio-selection"
      }
    );
    const selectedPrimaryActionControl =
      selectedJob && selectedPrimaryAction?.action === "regenerate-view" && selectedPrimaryAction.view
        ? `<div class="cg-inline-links"><a href="${escHtml(selectedPrimaryActionSurfaceHref)}">${escHtml(
            selectedPrimaryActionSurfaceLabel
          )}</a></div><div class="actions"><form method="post" action="/ui/character-generator/regenerate-view" class="inline"><input type="hidden" name="generateJobId" value="${escHtml(
            selectedJob.id
          )}"/>${hiddenGeneratorSelfNavFields}<input type="hidden" name="viewToGenerate" value="${escHtml(
            selectedPrimaryAction.view
          )}"/><input type="hidden" name="candidateCount" value="${escHtml(
            selectedPrimaryAction.candidateCount ?? 4
          )}"/><input type="hidden" name="seed" value="${escHtml(
            selectedPrimaryAction.seed ?? DEFAULT_GENERATION_SEED
          )}"/><input type="hidden" name="regenerateSameSeed" value="${escHtml(
            selectedPrimaryAction.regenerateSameSeed ?? true
          )}"/><input type="hidden" name="boostNegativePrompt" value="${escHtml(
            selectedPrimaryAction.boostNegativePrompt ?? false
          )}"/><button type="submit"${
            selectedPrimaryAction.priority === "high" ? "" : ' class="secondary"'
          }>${escHtml(selectedPrimaryAction.label)}</button></form></div>`
        : selectedJob && selectedPrimaryAction?.action === "recreate"
          ? `<div class="cg-inline-links"><a href="${escHtml(selectedPrimaryActionSurfaceHref)}">${escHtml(
              selectedPrimaryActionSurfaceLabel
            )}</a></div><div class="actions"><form method="post" action="/ui/character-generator/recreate" class="inline"><input type="hidden" name="generateJobId" value="${escHtml(
              selectedJob.id
            )}"/>${hiddenGeneratorSelfNavFields}<input type="hidden" name="candidateCount" value="${escHtml(
              selectedPrimaryAction.candidateCount ?? 6
            )}"/><input type="hidden" name="seed" value="${escHtml(
              selectedPrimaryAction.seed ?? DEFAULT_GENERATION_SEED
            )}"/><input type="hidden" name="regenerateSameSeed" value="${escHtml(
              selectedPrimaryAction.regenerateSameSeed ?? false
            )}"/><input type="hidden" name="boostNegativePrompt" value="${escHtml(
              selectedPrimaryAction.boostNegativePrompt ?? false
            )}"/><button type="submit"${
              selectedPrimaryAction.priority === "high" ? "" : ' class="secondary"'
            }>${escHtml(selectedPrimaryAction.label)}</button></form></div>`
          : `<div class="cg-inline-links"><a href="${escHtml(selectedPrimaryActionSurfaceHref)}">${escHtml(
              selectedPrimaryActionSurfaceLabel
            )}</a>${
              selectedManifest?.characterPackId
                ? `<a href="/ui/characters?characterPackId=${encodeURIComponent(selectedManifest.characterPackId)}">Characters</a>`
                : ""
            }</div>`;
    const selectedPrimaryActionReasonSummary =
      selectedPrimaryAction?.reasonCodes.length ? selectedPrimaryAction.reasonCodes.join(", ") : "No escalation signals recorded.";
    const selectedLinkedRoutes: Array<{ href: string; label: string }> = [
      { href: "#pick-candidates", label: "Candidate compare" },
      { href: "#recommended-actions", label: "Next safe actions" },
      { href: "#cg-manual-overrides", label: "Manual overrides" },
      { href: "#regenerate-view", label: "Candidate regenerate" },
      { href: "#recreate-pack", label: "Pack recreate" },
      { href: "#compare-approved-packs", label: "Approved compare" },
      { href: studioFastFlowHref, label: "Studio" }
    ];
    if (selectedManifest?.characterPackId) {
      selectedLinkedRoutes.push(
        { href: "#pack-preview-handoff", label: "Pack handoff" },
        {
          href: selectedCharactersHref ?? `/ui/characters?characterPackId=${encodeURIComponent(selectedManifest.characterPackId)}`,
          label: "Characters"
        }
      );
    }
    if (selectedJob?.episode) {
      selectedLinkedRoutes.push({
        href: `/ui/episodes/${encodeURIComponent(selectedJob.episode.id)}`,
        label: "Episode detail"
      });
    }
    const selectedArtifactLinks: Array<{ href: string; label: string }> = [];
    if (selectedManifest?.characterPackId) {
      selectedArtifactLinks.push(
        {
          href: `/artifacts/characters/${encodeURIComponent(selectedManifest.characterPackId)}/pack.json`,
          label: "pack.json"
        },
        {
          href: `/artifacts/characters/${encodeURIComponent(selectedManifest.characterPackId)}/preview.mp4`,
          label: "preview.mp4"
        },
        {
          href: `/artifacts/characters/${encodeURIComponent(selectedManifest.characterPackId)}/qc_report.json`,
          label: "qc_report.json"
        }
      );
    }
    const selectedRigOverviewSection =
      selectedManifest && selectedRigStability
        ? `<section class="card cg-rig-surface" id="cg-rig-surface"><div class="cg-section-head"><div><div class="cg-section-kicker">Rig Repair Console</div><h3>Rig stability, repair posture, and anchor evidence</h3></div><p>Read this block before compare, approval, or rollback. Per-view repair posture and override evidence stay above raw manifest JSON, which remains secondary evidence.</p></div><div class="cg-rig-grid"><article class="cg-rig-card ${selectedRigState.tone}"><div class="cg-rig-kicker">Current State</div><h3>${escHtml(
            selectedRigState.title
          )}</h3><p class="cg-rig-copy">${escHtml(selectedRigState.copy)}</p><div class="cg-rig-meta"><span class="badge ${coherenceBadge(
            selectedRigStability.severity
          )}">${escHtml(selectedRigStability.severity)}</span><span class="badge ${uiBadge(
            selectedRigStability.suggestedAction === "recreate"
              ? "FAILED"
              : selectedRigStability.suggestedAction === "pick-manually"
                ? "RUNNING"
                : "READY"
          )}">${escHtml(selectedRigStability.suggestedAction ?? "observe")}</span></div><p class="cg-rig-copy">blocking=${escHtml(
            selectedRigStability.blockingViews?.join(", ") || "none"
          )} / warnings=${escHtml(selectedRigStability.warningViews?.join(", ") || "none")}</p><p class="cg-rig-copy">reason families=${escHtml(
            selectedRigReasonFamilies
          )}</p></article><article class="cg-rig-card ${selectedRigState.tone}"><div class="cg-rig-kicker">Anchor Confidence</div><h3>${escHtml(
            formatMetric(selectedRigStability.anchorConfidenceOverall)
          )}</h3><p class="cg-rig-copy">front=${escHtml(
            formatMetric(selectedRigStability.anchorConfidenceByView?.front)
          )} / threeQuarter=${escHtml(
            formatMetric(selectedRigStability.anchorConfidenceByView?.threeQuarter)
          )} / profile=${escHtml(formatMetric(selectedRigStability.anchorConfidenceByView?.profile))}</p><p class="cg-rig-copy">front landmarks=${escHtml(
            formatMetric(selectedRigStability.landmarkConsistencyByView?.front)
          )} / threeQuarter=${escHtml(
            formatMetric(selectedRigStability.landmarkConsistencyByView?.threeQuarter)
          )} / profile=${escHtml(formatMetric(selectedRigStability.landmarkConsistencyByView?.profile))}</p></article><article class="cg-rig-card muted"><div class="cg-rig-kicker">Fallback State</div><h3>${escHtml(
            summarizeRigFallbackReasonCodes(selectedRigStability.fallbackReasonCodes)
          )}</h3><p class="cg-rig-copy">${escHtml(selectedRigStability.summary)}</p><p class="cg-rig-copy">override files=${escHtml(
            selectedRigOverrideLinks ? "present" : "not recorded"
          )} / pack anchor evidence=${escHtml(selectedPackRigSummary ? "present" : "not materialized")}</p><div class="cg-inline-links"><a href="#recommended-actions">Next safe actions</a><a href="#cg-manual-overrides">Manual overrides</a><a href="#pick-candidates">Candidate compare</a>${
            selectedCharactersHref ? `<a href="${escHtml(selectedCharactersHref)}">Characters</a>` : ""
          }</div></article></div><div class="cg-signal-table"><table><thead><tr><th>View</th><th>State</th><th>Selected Candidate</th><th>Anchor</th><th>Landmark</th><th>Fallbacks</th><th>Warnings</th><th>Rejections</th></tr></thead><tbody>${selectedRigViewRows}</tbody></table></div>${
            selectedRigFallbackCards ? `<div class="cg-signal-flag-grid">${selectedRigFallbackCards}</div>` : ""
          }${selectedRigRepairConsoleSection}</section>`
        : selectedManifest
          ? `<section class="card cg-rig-surface" id="cg-rig-surface"><div class="cg-section-head"><div><div class="cg-section-kicker">Rig Repair Console</div><h3>Rig stability, repair posture, and anchor evidence</h3></div><p>No rig summary was recorded for this run yet. Continue with the route and decision evidence below.</p></div></section>`
          : "";
    const selectedRigActionBanner =
      selectedManifest && selectedRigStability
        ? `<div class="cg-action-banner ${selectedRigState.tone}"><strong>${escHtml(
            selectedRigState.title
          )}</strong><p>${escHtml(selectedRigState.copy)}</p><p>fallbacks=${escHtml(
            summarizeRigFallbackReasonCodes(selectedRigStability.fallbackReasonCodes)
          )} / blocking=${escHtml(
            selectedRigStability.blockingViews?.join(", ") || "none"
          )} / warnings=${escHtml(
            selectedRigStability.warningViews?.join(", ") || "none"
          )}</p><p>Use regenerate when the fault is isolated to one view. Escalate to recreate only when the same reason family keeps hitting multiple views or pack-level gates.</p><div class="cg-inline-links"><a href="#cg-rig-surface">Rig console</a><a href="#cg-manual-overrides">Manual overrides</a><a href="#regenerate-view">Regenerate one view</a><a href="#pick-candidates">Manual compare</a><a href="#recreate-pack">Recreate pack</a></div></div>`
        : "";
    const selectedRigCompareNotice =
      selectedManifest && selectedRigStability
        ? `<div class="notice">${
            selectedRigStability.severity === "block"
              ? `Rig block is active. Compare is evidence gathering only until the blocked views are repaired, replaced, or the pack is recreated.`
              : selectedRigStability.reviewOnly
                ? `Rig review-only is active. Manual compare is required before approval, with special attention on the warning views listed in the repair console.`
                : `Rig signals are clear enough for compare. Use compare to verify repaired views before you promote the pack.`
          } front=${escHtml(
            formatMetric(selectedRigStability.anchorConfidenceByView?.front)
          )} / threeQuarter=${escHtml(
            formatMetric(selectedRigStability.anchorConfidenceByView?.threeQuarter)
          )} / profile=${escHtml(formatMetric(selectedRigStability.anchorConfidenceByView?.profile))}</div>`
        : "";
    const selectedRollbackNotice =
      selectedManifest && selectedRigStability
        ? `<div class="notice">${
            selectedRigStability.severity === "block"
              ? "Rollback does not clear the current rig block. Use it only to restore the active baseline while this run goes back through recreate or regenerate."
              : selectedRigStability.reviewOnly
                ? "Rollback is optional. The current run still needs a human rig review before approval."
                : "Rollback is available if the current pack should not replace the active baseline."
          }</div>`
        : "";
    const selectedApprovedCompareNotice =
      selectedManifest && selectedRigStability
        ? `<div class="notice">${
            selectedRigStability.severity === "block"
              ? "Use baseline compare to understand the gap, not to bypass the current rig block."
              : selectedRigStability.reviewOnly
                ? "Use baseline compare after reading the rig review-only state above."
                : "Baseline compare is ready when you want a slower A/B review."
          }</div>`
        : "";
    const selectedDecisionEvidenceSection = selectedManifest
      ? `${selectedPackCoherenceSection}${selectedRigStabilitySection}${selectedDecisionOutcomeSection}${selectedFinalQualityFirewallSection}${selectedQualityEmbargoSection}${selectedPackDefectSummarySection}${selectedSelectionRiskSection}${selectedAutoRerouteSection}${selectedCandidateSummarySection}${selectedViewDecisionMatrixSection}`
      : `<div class="notice">Manifest not available yet for this job.</div>`;
    const selectedRouteEvidenceSection = selectedManifest
      ? `${selectedReferenceSection}${selectedWorkflowRuntimeSection}${selectedWorkflowArtifactsSection}${selectedWorkflowStageSection}`
      : `<div class="notice">Workflow route evidence is not available yet.</div>`;
    const selectedSection = selectedJob
      ? `<section class="card" id="cg-active-job"><div id="cg-active-job-meta" hidden data-current-run-id="${escHtml(
          selectedJob.id
        )}" data-current-pack-id="${escHtml(selectedManifest?.characterPackId ?? "")}"></div><h2>Generation Run object</h2><p>Stage 04부터는 Generation Run object를 기준으로 읽습니다. 현재 상태, next safe action, linked routes, Compare, Approve/Rollback를 한 표면에 묶고 원시 evidence는 아래로 내립니다.</p><div class="cg-context-grid">${renderGeneratorObjectCard(
          "Generation Run",
          `${selectedJob.status} / ${selectedJob.progress}%`,
          `jobId=${selectedJob.id} / episode=${
            selectedJob.episode ? `${selectedJob.episode.id} / ${selectedJob.episode.topic ?? "-"}` : "not linked"
          }`
        )}${renderGeneratorObjectCard(
          "Character Pack",
          selectedManifest?.characterPackId ?? "pending handoff",
          `manifest=${selectedManifest?.status ?? "missing"} / selectionSource=${
            selectedSelectionDiagnostics?.finalSelectionSource ?? "-"
          } / qualityProfile=${selectedManifest?.qualityProfileId ?? selectedManifest?.qualityProfile?.id ?? "-"}`
        )}${renderGeneratorObjectCard(
          "Workflow Policy",
          `${selectedManifest?.promptPreset ?? "-"} / ${selectedManifest?.provider ?? "-"}`,
          `minScore=${
            typeof selectedManifest?.selectionHints?.minAcceptedScore === "number"
              ? selectedManifest.selectionHints.minAcceptedScore.toFixed(2)
              : "-"
          } / frontCandidates=${selectedManifest?.selectionHints?.frontMasterCandidateCount ?? "-"} / repairCandidates=${
            selectedManifest?.selectionHints?.repairCandidateCount ?? "-"
          } / multiReference=${selectedManifest?.selectionHints?.preferMultiReference ?? "-"}`
        )}${renderGeneratorObjectCard(
          "Runtime Route",
          `${runSettings?.sampler ?? "-"} / ${runSettings?.scheduler ?? "-"} / ${selectedManifest?.providerMeta?.workflowStage ?? "-"}`,
          `template=${selectedManifest?.templateVersion ?? selectedManifest?.providerMeta?.workflowTemplateVersion ?? "-"} / runtime=${summarizeSelectedWorkflowRuntimeDiagnostics(
            selectedWorkflowRuntimeDiagnostics
          )} / stages=${selectedWorkflowStages.length}`
        )}</div><div class="cg-guardrail-grid" style="margin-top:12px"><div class="cg-guardrail"><strong>Pack Coherence</strong><span>${escHtml(
          summarizePackCoherence(selectedPackCoherence)
        )}</span></div><div class="cg-guardrail"><strong>Rig Status</strong><span>${escHtml(
          selectedRigStability
            ? `${selectedRigState.title} / ${selectedRigStability.suggestedAction ?? "observe"} / anchor=${formatMetric(selectedRigStability.anchorConfidenceOverall)}`
            : "not recorded"
        )}</span></div><div class="cg-guardrail"><strong>Decision Gate</strong><span>${escHtml(
          selectedDecisionOutcome
            ? `${selectedDecisionOutcome.status} / ${selectedDecisionOutcome.kind} / ${selectedDecisionOutcome.escalatedAction ?? "observe"}`
            : selectedSelectionRisk
              ? `${selectedSelectionRisk.level} / ${selectedSelectionRisk.suggestedAction ?? "observe"}`
              : "not recorded"
        )}</span></div><div class="cg-guardrail"><strong>Final Guardrails</strong><span>${escHtml(
          `firewall=${selectedFinalQualityFirewall?.level ?? "none"} / embargo=${selectedQualityEmbargo?.level ?? "none"} / defects=${summarizePackDefectSummary(
            selectedPackDefectSummary
          )}`
        )}</span></div><div class="cg-guardrail"><strong>Reference Continuity</strong><span>${escHtml(
          selectedContinuity
            ? `${selectedContinuity.applied ? "applied" : selectedContinuity.attempted ? "attempted" : "idle"} / ${
                selectedContinuity.reason
              }`
            : "not recorded"
        )}</span></div></div>${selectedRigOverviewSection}<div class="cg-context-grid" style="margin-top:12px"><article class="cg-context-card"><h3>Next safe action</h3><p><strong>${escHtml(
          selectedPrimaryActionTitle
        )}</strong></p><p>${escHtml(selectedPrimaryActionScope)}</p><p>${escHtml(selectedPrimaryActionDetail)}</p><p>reasons: ${escHtml(
          selectedPrimaryActionReasonSummary
        )}</p>${selectedPrimaryActionControl}</article><article class="cg-context-card"><h3>Linked routes</h3><p><strong>Follow the object, not the page.</strong></p><p>Studio는 dispatch hub이고, compare/approve/rollback은 Generator와 Characters surface에서 이어집니다.</p><div class="cg-link-list">${selectedLinkedRoutes
          .map((link) => `<a href="${escHtml(link.href)}">${escHtml(link.label)}</a>`)
          .join("")}</div></article><article class="cg-context-card"><h3>Artifact handoff</h3><p><strong>${escHtml(
          selectedManifest?.characterPackId ?? "Generation Run only"
        )}</strong></p><p>${
          selectedManifest?.characterPackId
            ? "Character Pack object is ready for review handoff. Use the linked artifacts first, then move to Characters or baseline approval."
            : "Character Pack object has not been materialized yet. Stay on Candidate compare and keep the evidence chain attached to this run."
        }</p>${
          selectedArtifactLinks.length > 0
            ? `<div class="cg-inline-links">${selectedArtifactLinks
                .map((link) => `<a href="${escHtml(link.href)}">${escHtml(link.label)}</a>`)
                .join("")}</div>`
            : `<div class="notice">No Character Pack artifacts are linked yet.</div>`
        }<p>${escHtml(
          workflowArtifactRows.length > 0
            ? `${workflowArtifactRows.length} workflow export groups are attached to this run.`
            : "Workflow export files are not attached yet."
        )}</p></article></div><details class="card" style="margin-top:12px"><summary><strong>Decision evidence</strong></summary><div style="margin-top:10px">${selectedDecisionEvidenceSection}</div></details><details class="card" style="margin-top:10px"><summary><strong>Input / route evidence</strong></summary><div style="margin-top:10px">${selectedRouteEvidenceSection}</div></details><div id="generation-status" class="notice" data-job-id="${escHtml(
          selectedJob.id
        )}">Polling latest status...</div><div class="actions"><button id="generation-retry" type="button" class="secondary" style="display:none">Retry now</button></div></section>`
      : `<section class="card" id="cg-active-job"><h2>Generation Run object</h2><div class="notice">Select a generation run from the list below.</div></section>`;

    const recommendedActionsSection =
      selectedJob && selectedManifest
        ? `<section class="card" id="recommended-actions"><h2>Next Safe Actions</h2><p>이 레일은 compare 결과와 final gate를 먼저 읽고, 그다음 Candidate set 또는 Character Pack object로 안전하게 이동시키는 역할을 합니다. regenerate, recreate, preview/QC/lineage handoff를 한곳에서 유지합니다.</p>${
            selectedDecisionOutcome || selectedSelectionRisk || selectedAutoReroute || selectedFinalQualityFirewall
              ? `<div class="notice">decision: outcome=${escHtml(
                  selectedDecisionOutcome?.status ?? "unknown"
                )}/${escHtml(
                  selectedDecisionOutcome?.kind ?? "-"
                )} / suggested=${escHtml(
                  selectedDecisionOutcome?.escalatedAction ??
                    selectedFinalQualityFirewall?.suggestedAction ??
                    selectedSelectionRisk?.suggestedAction ??
                    "-"
                )} / reroute=${escHtml(
                  selectedAutoReroute?.attempted
                    ? `${selectedAutoReroute.recovered ? "recovered" : "failed"}${selectedAutoReroute.strategy ? `@${selectedAutoReroute.strategy}` : ""}`
                    : "not-run"
                )} / firewall=${escHtml(selectedFinalQualityFirewall?.level ?? "none")} / defects=${escHtml(
                  summarizePackDefectSummary(selectedPackDefectSummary)
                )}</div>`
              : ""
          }${selectedRigActionBanner}${
            selectedRecommendedActions.length > 0
              ? `<div class="cg-action-cards">${
                  selectedRecommendedActions
                    .map((action) => {
                      const reasonSummary =
                        dedupeStrings(action.reasonCodes.map((reasonCode) => describeRigFallbackReason(reasonCode).label)).join(", ") ||
                        "-";
                      const actionTone = action.priority === "high" ? "bad" : action.priority === "medium" ? "warn" : "ok";
                      const objectScope =
                        action.action === "recreate"
                          ? "Character Pack object"
                          : action.action === "regenerate-view"
                            ? `Candidate set / ${action.view ?? "view"}`
                            : "Candidate set / compare";
                      const routeHref =
                        action.action === "recreate"
                          ? "#recreate-pack"
                          : action.action === "regenerate-view"
                            ? "#regenerate-view"
                            : `#${action.anchorId ?? "pick-candidates"}`;
                      const routeLabel =
                        action.action === "recreate"
                          ? "Recreate surface"
                          : action.action === "regenerate-view"
                            ? "Regenerate surface"
                            : "Compare surface";
                      const controls =
                        action.action === "regenerate-view" && action.view
                          ? `<form method="post" action="/ui/character-generator/regenerate-view" class="inline"><input type="hidden" name="generateJobId" value="${escHtml(
                              selectedJob.id
                            )}"/>${hiddenGeneratorSelfNavFields}<input type="hidden" name="viewToGenerate" value="${escHtml(
                              action.view
                            )}"/><input type="hidden" name="candidateCount" value="${escHtml(
                              action.candidateCount ?? 4
                            )}"/><input type="hidden" name="seed" value="${escHtml(
                              action.seed ?? DEFAULT_GENERATION_SEED
                            )}"/><input type="hidden" name="regenerateSameSeed" value="${escHtml(
                              action.regenerateSameSeed ?? true
                            )}"/><input type="hidden" name="boostNegativePrompt" value="${escHtml(
                              action.boostNegativePrompt ?? false
                            )}"/><button type="submit"${action.priority === "high" ? "" : ' class="secondary"'}>${escHtml(
                              action.label
                            )}</button></form>`
                          : action.action === "recreate"
                            ? `<form method="post" action="/ui/character-generator/recreate" class="inline"><input type="hidden" name="generateJobId" value="${escHtml(
                                selectedJob.id
                              )}"/>${hiddenGeneratorSelfNavFields}<input type="hidden" name="candidateCount" value="${escHtml(
                                action.candidateCount ?? 6
                              )}"/><input type="hidden" name="seed" value="${escHtml(
                                action.seed ?? DEFAULT_GENERATION_SEED
                              )}"/><input type="hidden" name="regenerateSameSeed" value="${escHtml(
                                action.regenerateSameSeed ?? false
                              )}"/><input type="hidden" name="boostNegativePrompt" value="${escHtml(
                                action.boostNegativePrompt ?? false
                              )}"/><button type="submit"${action.priority === "high" ? "" : ' class="secondary"'}>${escHtml(
                                action.label
                              )}</button></form>`
                            : `<a href="#${escHtml(action.anchorId ?? "pick-candidates")}">${escHtml(action.label)}</a>`;
                      return `<article class="cg-context-card cg-action-card ${actionTone}"><p><span class="badge ${recommendedPriorityBadge(
                        action.priority
                      )}">${escHtml(action.priority)}</span> ${escHtml(action.label)}</p><p><strong>${escHtml(
                        objectScope
                      )}</strong></p><p>${escHtml(
                        action.description
                      )}</p><p>reasons: ${escHtml(reasonSummary)}</p><p>${
                        action.action === "regenerate-view"
                          ? `Repair only the ${escHtml(action.view ?? "target")} lane first and re-enter compare before touching the rest of the pack.`
                          : action.action === "recreate"
                            ? "Use this only when view-level repair is no longer enough or the same rig family keeps reappearing across the pack."
                            : "Use compare to validate repaired views and to decide whether the current pack is safe to approve."
                      }</p><div class="cg-inline-links"><a href="${escHtml(
                        routeHref
                      )}">${escHtml(routeLabel)}</a></div><div class="actions">${controls}</div></article>`;
                    })
                    .join("")
                }</div>`
              : `<div class="notice">No immediate follow-up action is recommended for this run.</div>`
          }</section>`
        : `<section class="card" id="recommended-actions"><h2>Next Safe Actions</h2><div class="notice">Select a generation run to see targeted candidate-regenerate, pack-recreate, or compare actions.</div></section>`;

    const regenerateSection = selectedJob
      ? `<section class="card" id="regenerate-view"><h2>Candidate Set / regenerate one view</h2><p>현재 candidate set에서 한 view만 다시 생성해 compare lane을 유지합니다. pack 전체를 다시 만들 필요가 없을 때 가장 좁은 복구 경로입니다.</p><form method="post" action="/ui/character-generator/regenerate-view" class="grid two"><input type="hidden" name="generateJobId" value="${escHtml(
          selectedJob.id
        )}"/>${hiddenGeneratorSelfNavFields}<label>View<select name="viewToGenerate"><option value="front">front</option><option value="threeQuarter">threeQuarter</option><option value="profile">profile</option></select></label><label>Candidate Count<input name="candidateCount" value="4"/></label><label>Seed<input name="seed" value="${DEFAULT_GENERATION_SEED}"/></label><label><input type="checkbox" name="regenerateSameSeed" value="true" checked/> Same seed 유지</label><label><input type="checkbox" name="boostNegativePrompt" value="true"/> Negative prompt 강화</label><div class="actions" style="grid-column:1/-1"><button type="submit">Candidate set 다시 생성</button></div></form></section>`
      : "";

    const recreateSection = selectedJob
      ? `<section class="card" id="recreate-pack"><h2>Character Pack / recreate from current run</h2><p>현재 Generation Run의 policy와 reference를 유지한 채 Character Pack object를 다시 만듭니다. compare와 approval을 다시 시작해야 할 때 사용하는 넓은 복구 경로입니다.</p><form method="post" action="/ui/character-generator/recreate" class="grid two"><input type="hidden" name="generateJobId" value="${escHtml(
          selectedJob.id
        )}"/>${hiddenGeneratorSelfNavFields}<label>Candidate Count<input name="candidateCount" value="6"/></label><label>Seed<input name="seed" value="${DEFAULT_GENERATION_SEED}"/></label><label><input type="checkbox" name="regenerateSameSeed" value="true"/> Same seed 유지</label><label><input type="checkbox" name="boostNegativePrompt" value="true"/> Negative prompt 강화</label><div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">Character Pack 다시 만들기</button></div></form></section>`
      : "";

    const candidateOptions = (view: CharacterGenerationView): string => {
      if (!selectedManifest) return "";
      return selectedManifest.candidates
        .filter((candidate) => candidate.view === view)
        .map(
          (candidate) =>
            `<option value="${escHtml(candidate.id)}">${escHtml(candidate.id)} (score=${escHtml(
              candidate.score.toFixed(3)
            )}, consistency=${escHtml(
              candidate.consistencyScore === null ? "-" : candidate.consistencyScore.toFixed(3)
            )}, profile=${escHtml(candidate.providerMeta?.qualityProfileId ?? selectedManifest.qualityProfileId ?? "-")})</option>`
        )
        .join("");
    };
    const pickSection =
      selectedJob && selectedManifest
        ? (() => {
            const pickBlocked =
              selectedFinalQualityFirewall?.level === "block" || selectedDecisionOutcome?.status === "blocked";
            return `<section class="card" id="pick-candidates"><h2>Candidate Set / HITL compare</h2><p>candidate set을 직접 비교해서 Character Pack build 전에 수동으로 고릅니다. Compare 결과와 approval lane을 분리하지 않고 같은 surface 안에서 유지합니다.</p>${
              pickBlocked
                ? `${selectedRigCompareNotice}<div class="notice">Direct pick is blocked because the selected pack still fails the final gate. Use regenerate/recreate first, or replace blocked views.</div>`
                : selectedRigCompareNotice
            }<form method="post" action="/ui/character-generator/pick" class="grid two"><input type="hidden" name="generateJobId" value="${escHtml(
            selectedJob.id
          )}"/>${hiddenGeneratorSelfNavFields}<label>Front Candidate<select name="frontCandidateId">${candidateOptions("front")}</select></label><label>ThreeQuarter Candidate<select name="threeQuarterCandidateId">${candidateOptions(
            "threeQuarter"
          )}</select></label><label>Profile Candidate<select name="profileCandidateId">${candidateOptions(
            "profile"
          )}</select></label><div class="actions" style="grid-column:1/-1"><button type="submit"${
            pickBlocked ? " disabled" : ""
          }>선택 후보로 Character Pack 만들기</button></div></form>${candidateCardsForView(
            "front"
          )}${candidateCardsForView("threeQuarter")}${candidateCardsForView("profile")}</section>`;
          })()
        : `<section class="card" id="pick-candidates"><h2>Candidate Set / HITL compare</h2><div class="notice">A selected generation run is required.</div></section>`;

    const previewSection =
      selectedManifest && selectedManifest.characterPackId
        ? (() => {
            const artifacts = getCharacterArtifacts(selectedManifest.characterPackId);
            const previewExists = fs.existsSync(artifacts.previewPath);
            const qcExists = fs.existsSync(artifacts.qcReportPath);
            return `<section class="card" id="pack-preview-handoff"><h2>Character Pack object / handoff</h2><p>compare가 끝나면 Character Pack object를 review와 active-baseline approval으로 넘깁니다. preview, QC, lineage, jobs inspection은 Characters surface에서 계속 확인합니다.</p><p>characterPackId: <a href="/ui/characters?characterPackId=${encodeURIComponent(
              selectedManifest.characterPackId
            )}">${escHtml(selectedManifest.characterPackId)}</a></p><p><a href="/artifacts/characters/${encodeURIComponent(
              selectedManifest.characterPackId
            )}/pack.json">pack.json</a> | <a href="/artifacts/characters/${encodeURIComponent(
              selectedManifest.characterPackId
            )}/preview.mp4">preview.mp4</a> | <a href="/artifacts/characters/${encodeURIComponent(
              selectedManifest.characterPackId
            )}/qc_report.json">qc_report.json</a></p><p>preview: <span class="badge ${
              previewExists ? "ok" : "bad"
            }">${previewExists ? "exists" : "missing"}</span> / qc: <span class="badge ${
              qcExists ? "ok" : "bad"
            }">${qcExists ? "exists" : "missing"}</span></p>${
              workflowArtifactRows.length > 0
                ? `<p>${workflowArtifactRows
                    .map(
                      ({ candidate, workflowFiles }) =>
                        `${escHtml(candidate.view)}: ${renderArtifactLink("api", workflowFiles?.apiPromptPath)} | ${renderArtifactLink(
                          "summary",
                          workflowFiles?.summaryPath
                        )}${workflowFiles?.guiWorkflowPath ? ` | ${renderArtifactLink("gui", workflowFiles.guiWorkflowPath)}` : ""}`
                    )
                    .join(" / ")}</p>`
                : ""
            }<div class="quick-links"><a href="/ui/characters?characterPackId=${encodeURIComponent(
              selectedManifest.characterPackId
            )}">Characters review</a><a href="#compare-approved-packs">Approved compare</a><a href="${escHtml(studioFastFlowHref)}">Studio fast flow</a></div><form method="post" action="/ui/character-generator/set-active" class="inline"><input type="hidden" name="characterPackId" value="${escHtml(
              selectedManifest.characterPackId
            )}"/>${selectedPackGeneratorNavFields}<button type="submit" class="secondary">현재 Pack을 active baseline으로 승격</button></form></section>`;
          })()
        : "";

    const rollbackSection =
      approvedPacks.length > 0
        ? `<section class="card" id="rollback-active-pack"><h2>Character Pack / rollback active baseline</h2><p>approved Character Pack 중 하나를 현재 active baseline으로 되돌립니다. compare와 review를 끝낸 뒤, 기존 baseline보다 더 안전한 pack으로 즉시 롤백할 때 사용합니다.</p><form method="post" action="/ui/character-generator/rollback-active" class="grid two">${selectedPackGeneratorNavFields}<label>Target Pack<select name="targetCharacterPackId">${approvedPacks
            .map(
              (pack) =>
                `<option value="${escHtml(pack.id)}">${escHtml(pack.id)} (v${escHtml(pack.version)}, ${escHtml(pack.status)})</option>`
            )
            .join("")}</select></label><div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">Active baseline 롤백</button></div></form></section>`
        : `<section class="card" id="rollback-active-pack"><h2>Character Pack / rollback active baseline</h2><div class="notice">No approved packs available.</div></section>`;

    const compareSection =
      approvedPacks.length >= 2
        ? `<section class="card" id="compare-approved-packs"><h2>Character Pack / compare approved baselines</h2><p>approved Character Pack baseline 두 개를 선택해 preview, QC, lineage, jobs를 전용 compare surface에서 읽습니다.</p><form method="get" action="/ui/character-generator/compare" class="grid two"><input type="hidden" name="returnTo" value="${escHtml(currentPageReturnTo)}"/><input type="hidden" name="currentObject" value="${escHtml(selectedManifest?.characterPackId ? `pack:${selectedManifest.characterPackId}` : generatorSelfNav.currentObject ?? "")}"/><input type="hidden" name="focus" value="pack-compare-hero"/><label>Left Pack<select name="leftPackId">${approvedPacks
            .map((pack) => `<option value="${escHtml(pack.id)}">${escHtml(pack.id)} (v${escHtml(pack.version)})</option>`)
            .join("")}</select></label><label>Right Pack<select name="rightPackId">${approvedPacks
            .map((pack, index) => `<option value="${escHtml(pack.id)}"${index === 1 ? " selected" : ""}>${escHtml(
              pack.id
            )} (v${escHtml(pack.version)})</option>`)
            .join("")}</select></label><div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">Approved Pack A/B compare 열기</button></div></form></section>`
        : `<section class="card" id="compare-approved-packs"><h2>Character Pack / compare approved baselines</h2><div class="notice">At least two approved packs are required.</div></section>`;

    const rollbackSurfaceSection =
      selectedRollbackNotice && rollbackSection
        ? rollbackSection.replace(
            '<form method="post" action="/ui/character-generator/rollback-active" class="grid two">',
            `${selectedRollbackNotice}<form method="post" action="/ui/character-generator/rollback-active" class="grid two">`
          )
        : rollbackSection;
    const compareSurfaceSection =
      selectedApprovedCompareNotice && compareSection
        ? compareSection.replace(
            '<form method="get" action="/ui/character-generator/compare" class="grid two">',
            `${selectedApprovedCompareNotice}<form method="get" action="/ui/character-generator/compare" class="grid two">`
          )
        : compareSection;
    const recommendedActionsSurfaceSection = recommendedActionsSection.replace(
      /(<h2>Next Safe Actions<\/h2>)<p>[\s\S]*?<\/p>/,
      "$1<p>Start from the rig repair console, then choose the smallest safe recovery path. Prefer per-view regenerate for isolated failures, use manual compare to validate the repaired lane, and escalate to recreate only when pack-wide blockers remain.</p>"
    );
    const regenerateSurfaceSection = regenerateSection
      .replace(
        /(<h2>Candidate Set \/ regenerate one view<\/h2>)<p>[\s\S]*?<\/p>/,
        "$1<p>Use this lane when the repair console shows a blocked or warning state isolated to one view. It keeps the rest of the pack stable while you regenerate a narrower candidate set and return to compare.</p>"
      )
      .replace(
        /<label><input type="checkbox" name="regenerateSameSeed" value="true" checked\/>[\s\S]*?<\/label>/,
        '<label><input type="checkbox" name="regenerateSameSeed" value="true" checked/> Keep same seed</label>'
      )
      .replace(
        /<label><input type="checkbox" name="boostNegativePrompt" value="true"\/>[\s\S]*?<\/label>/,
        '<label><input type="checkbox" name="boostNegativePrompt" value="true"/> Boost negative prompt</label>'
      )
      .replace(/<button type="submit">[\s\S]*?<\/button>/, "<button type=\"submit\">Regenerate selected view</button>");
    const recreateSurfaceSection = recreateSection
      .replace(
        /(<h2>Character Pack \/ recreate from current run<\/h2>)<p>[\s\S]*?<\/p>/,
        "$1<p>Use recreate only when the repair console shows pack-wide instability, repeated blocked views, or fallback families that keep returning after targeted regenerate attempts. This is the full reset path before compare and approval reopen.</p>"
      )
      .replace(
        /<label><input type="checkbox" name="regenerateSameSeed" value="true"\/>[\s\S]*?<\/label>/,
        '<label><input type="checkbox" name="regenerateSameSeed" value="true"/> Keep same seed</label>'
      )
      .replace(
        /<label><input type="checkbox" name="boostNegativePrompt" value="true"\/>[\s\S]*?<\/label>/,
        '<label><input type="checkbox" name="boostNegativePrompt" value="true"/> Boost negative prompt</label>'
      )
      .replace(
        /<button type="submit" class="secondary">[\s\S]*?<\/button>/,
        '<button type="submit" class="secondary">Recreate character pack</button>'
      );
    const pickSurfaceSection = pickSection
      .replace(
        /(<h2>Candidate Set \/ HITL compare<\/h2>)<p>[\s\S]*?<\/p>/,
        "$1<p>Use compare as the repair validation lane. Confirm that the repaired view is now safe, keep the untouched views stable, and only then rebuild the Character Pack candidate for approval.</p>"
      )
      .replace(
        /<button type="submit"( disabled)?>[\s\S]*?<\/button>/,
        (_match, disabled = "") => `<button type="submit"${disabled}>Build pack from selected candidates</button>`
      );
    const previewSurfaceSection = previewSection.replace(
      /(<h2>Character Pack object \/ handoff<\/h2>)<p>[\s\S]*?<\/p>/,
      "$1<p>Once compare settles, hand the Character Pack object into preview, QC, lineage, and jobs review. Characters remains the slower inspection surface after this handoff.</p>"
    );
    const rollbackSurfaceCopySection = rollbackSurfaceSection.replace(
      /(<h2>Character Pack \/ rollback active baseline<\/h2>)<p>[\s\S]*?<\/p>/,
      "$1<p>Rollback restores one approved Character Pack as the active baseline. Use it when the current run should not replace the baseline, not as a way to bypass rig blockers on the new run.</p>"
    );
    const compareSurfaceCopySection = compareSurfaceSection.replace(
      /(<h2>Character Pack \/ compare approved baselines<\/h2>)<p>[\s\S]*?<\/p>/,
      "$1<p>Compare two approved Character Pack baselines when you need a slower A/B read across preview, QC, lineage, and jobs.</p>"
    );

    const rows = recentJobs
      .map((job) => {
        const manifest = readGenerationManifest(getGenerationManifestPath(job.id));
        const packCoherence = manifest?.packCoherence ?? manifest?.providerMeta?.selectionDiagnostics?.packCoherence;
        const autoReroute = manifest?.autoReroute ?? manifest?.providerMeta?.selectionDiagnostics?.autoReroute;
        const packDefectSummary = manifest?.providerMeta?.selectionDiagnostics?.packDefectSummary;
        const finalQualityFirewall = manifest?.providerMeta?.selectionDiagnostics?.finalQualityFirewall;
        const workflowStages = manifest?.workflowStages ?? manifest?.providerMeta?.selectionDiagnostics?.workflowStages;
        const finalSelectionSource = manifest?.providerMeta?.selectionDiagnostics?.finalSelectionSource;
        return `<tr><td><a href="/ui/character-generator?jobId=${encodeURIComponent(job.id)}">${escHtml(
          job.id
        )}</a></td><td>${job.episode ? `<a href="/ui/episodes/${escHtml(job.episode.id)}">${escHtml(job.episode.id)}</a>` : "-"}</td><td>${escHtml(
          job.episode?.topic ?? "-"
        )}</td><td><span class="badge ${uiBadge(job.status)}">${escHtml(job.status)}</span></td><td>${escHtml(
          job.progress
        )}%</td><td>${
          manifest
            ? `${escHtml(manifest.status)} / ${escHtml(manifest.qualityProfileId ?? manifest.qualityProfile?.id ?? "-")} / coh=<span class="badge ${coherenceBadge(
                packCoherence?.severity
              )}">${escHtml(summarizePackCoherence(packCoherence))}</span> / src=${escHtml(
                finalSelectionSource ?? "-"
              )} / firewall=${escHtml(finalQualityFirewall?.level ?? "-")} / defects=${escHtml(
                summarizePackDefectSummary(packDefectSummary)
              )} / reroute=${escHtml(
                autoReroute?.attempted
                  ? `${autoReroute.recovered ? "recovered" : "failed"}${autoReroute.strategy ? `@${autoReroute.strategy}` : ""}`
                  : "-"
              )} / stages=${escHtml(String(workflowStages?.length ?? 0))}${
                manifest.candidates.some((candidate) => candidate.providerMeta?.workflowFiles)
                  ? ' / <span class="badge ok">wf</span>'
                  : ""
              }`
            : '<span class="badge bad">missing</span>'
        }</td><td>${escHtml(
          job.createdAt.toLocaleString("en-US", { hour12: false })
        )}</td></tr>`;
      })
      .join("");

    const body = buildCharacterGeneratorPageBody({
      topSection,
      selectedSection,
      recommendedActionsSection: recommendedActionsSurfaceSection,
      regenerateSection: regenerateSurfaceSection,
      recreateSection: recreateSurfaceSection,
      pickSection: pickSurfaceSection,
      previewSection: previewSurfaceSection,
      rollbackSection: rollbackSurfaceCopySection,
      compareSection: compareSurfaceCopySection,
      rows,
      statusScript: selectedJob ? buildCharacterGeneratorStatusScript() : ""
    });

    return reply.type("text/html; charset=utf-8").send(uiPage("Character Generator", body));
  });

  app.post("/ui/character-generator/create", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const creationNav = readCreationNavState(body);

    try {
      const generation = parseCharacterGenerationInput(body);
      const channelId = optionalString(body, "channelId");
      const created = await createCharacterGeneration(prisma, queue, queueName, {
        ...(channelId ? { channelId } : {}),
        generation
      });

      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          {
            jobId: created.generateJobId,
            message: created.reusedExisting
              ? `Reused active generation job: ${created.generateJobId} (episode ${created.episodeId})`
              : `${GENERATE_CHARACTER_ASSETS_JOB_NAME} queued successfully (episode ${created.episodeId})`
          },
          {
            ...creationNav,
            currentObject: `run:${created.generateJobId}`,
            focus: "cg-active-job",
            referenceAssetId: generation.referenceAssetId ?? creationNav.referenceAssetId
          }
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { error: message },
          {
            ...creationNav,
            focus: creationNav.focus ?? "cg-stage-context"
          }
        )
      );
    }
  });

  app.post("/ui/character-generator/pick", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const creationNav = readCreationNavState(body);
    try {
      const generateJobId = optionalString(body, "generateJobId");
      if (!generateJobId) {
        throw createHttpError(400, "generateJobId is required");
      }

      const selection: CharacterGenerationSelection = {
        front: optionalString(body, "frontCandidateId") ?? "",
        threeQuarter: optionalString(body, "threeQuarterCandidateId") ?? "",
        profile: optionalString(body, "profileCandidateId") ?? ""
      };
      if (!selection.front || !selection.threeQuarter || !selection.profile) {
        throw createHttpError(400, "front/threeQuarter/profile candidate must be selected");
      }

      const created = await createCharacterGenerationPick(prisma, queue, queueName, {
        generateJobId,
        selection
      });

      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          {
            jobId: created.generateJobId,
            message: "Candidate set selection applied. Character Pack build has been queued."
          },
          {
            ...creationNav,
            currentObject: `run:${created.generateJobId}`,
            focus: "cg-active-job"
          }
        )
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { error: message, ...(creationNav.jobId ? { jobId: creationNav.jobId } : {}) },
          {
            ...creationNav,
            focus: creationNav.focus ?? "pick-candidates"
          }
        )
      );
    }
  });

  app.post("/ui/character-generator/regenerate-view", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const creationNav = readCreationNavState(body);
    try {
      const generateJobId = optionalString(body, "generateJobId");
      if (!generateJobId) {
        throw createHttpError(400, "generateJobId is required");
      }
      const viewToGenerate = parseGenerationView(body.viewToGenerate, "viewToGenerate");
      const candidateCount = Math.min(parsePositiveInt(body.candidateCount, "candidateCount", 4), 8);
      const seed = parsePositiveInt(body.seed, "seed", DEFAULT_GENERATION_SEED);
      const regenerateSameSeed = parseBoolean(body.regenerateSameSeed, "regenerateSameSeed", true);
      const boostNegativePrompt = parseBoolean(body.boostNegativePrompt, "boostNegativePrompt", false);

      const created = await createCharacterGenerationRegenerateView(prisma, queue, queueName, {
        generateJobId,
        viewToGenerate,
        candidateCount,
        seed,
        regenerateSameSeed,
        boostNegativePrompt
      });

      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          {
            jobId: created.generateJobId,
            message: `Candidate set regenerate queued: ${created.view} (${regenerateSameSeed ? "same seed" : "new seed"})`
          },
          {
            ...creationNav,
            currentObject: `run:${created.generateJobId}`,
            focus: "cg-active-job"
          }
        )
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { error: message, ...(creationNav.jobId ? { jobId: creationNav.jobId } : {}) },
          {
            ...creationNav,
            focus: creationNav.focus ?? "regenerate-view"
          }
        )
      );
    }
  });

  app.post("/ui/character-generator/recreate", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const creationNav = readCreationNavState(body);
    try {
      const generateJobId = optionalString(body, "generateJobId");
      if (!generateJobId) {
        throw createHttpError(400, "generateJobId is required");
      }
      const candidateCount = Math.min(parsePositiveInt(body.candidateCount, "candidateCount", 4), 8);
      const seed = parsePositiveInt(body.seed, "seed", DEFAULT_GENERATION_SEED);
      const regenerateSameSeed = parseBoolean(body.regenerateSameSeed, "regenerateSameSeed", true);
      const boostNegativePrompt = parseBoolean(body.boostNegativePrompt, "boostNegativePrompt", false);

      const created = await createCharacterGenerationRecreate(prisma, queue, queueName, {
        generateJobId,
        candidateCount,
        seed,
        regenerateSameSeed,
        boostNegativePrompt
      });

      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          {
            jobId: created.generateJobId,
            message: `Character Pack recreate queued from current run (${regenerateSameSeed ? "same seed" : "new seed"}, seed=${created.seed})`
          },
          {
            ...creationNav,
            currentObject: `run:${created.generateJobId}`,
            focus: "cg-active-job"
          }
        )
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { error: message, ...(creationNav.jobId ? { jobId: creationNav.jobId } : {}) },
          {
            ...creationNav,
            focus: creationNav.focus ?? "recreate-pack"
          }
        )
      );
    }
  });

  app.post("/ui/character-generator/overrides/save", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const creationNav = readCreationNavState(body);
    const fallbackJobId = optionalString(body, "generateJobId") ?? creationNav.jobId;
    try {
      const generateJobId = optionalString(body, "generateJobId");
      if (!generateJobId) {
        throw createHttpError(400, "generateJobId is required");
      }
      const overrideKind = optionalString(body, "overrideKind");
      if (overrideKind !== "anchors" && overrideKind !== "cropBoxes") {
        throw createHttpError(400, "overrideKind must be anchors or cropBoxes");
      }
      const overrideJson = optionalString(body, "overrideJson");
      const afterSave = optionalString(body, "afterSave");
      const normalized = normalizeManualOverrideText(overrideJson ?? "", overrideKind);
      const context = await resolveCharacterGenerationOverrideContext(prisma, generateJobId);
      const targetPath = resolveManualOverrideFilePath(context.lineage.characterRoot, overrideKind);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, normalized, "utf8");

      if (afterSave === "rebuild") {
        const rebuilt = await createCharacterGenerationRebuildSelected(prisma, queue, queueName, {
          generateJobId
        });
        return reply.redirect(
          hrefWithCreationNav(
            "/ui/character-generator",
            {
              jobId: rebuilt.generateJobId,
              message: `Saved ${overrideKind === "anchors" ? "anchors.json" : "crop-boxes.json"} override and queued current-selection rebuild.`
            },
            {
              ...creationNav,
              currentObject: `run:${rebuilt.generateJobId}`,
              focus: "cg-manual-overrides"
            }
          )
        );
      }

      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          {
            jobId: generateJobId,
            message: `Saved ${overrideKind === "anchors" ? "anchors.json" : "crop-boxes.json"} override. Rebuild current selection when you want the new pack evidence.`
          },
          {
            ...creationNav,
            currentObject: creationNav.currentObject ?? `run:${generateJobId}`,
            focus: "cg-manual-overrides"
          }
        )
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { error: message, ...(fallbackJobId ? { jobId: fallbackJobId } : {}) },
          {
            ...creationNav,
            focus: "cg-manual-overrides"
          }
        )
      );
    }
  });

  app.post("/ui/character-generator/overrides/clear", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const creationNav = readCreationNavState(body);
    const fallbackJobId = optionalString(body, "generateJobId") ?? creationNav.jobId;
    try {
      const generateJobId = optionalString(body, "generateJobId");
      if (!generateJobId) {
        throw createHttpError(400, "generateJobId is required");
      }
      const overrideKind = optionalString(body, "overrideKind");
      if (overrideKind !== "anchors" && overrideKind !== "cropBoxes") {
        throw createHttpError(400, "overrideKind must be anchors or cropBoxes");
      }
      const afterClear = optionalString(body, "afterClear");
      const context = await resolveCharacterGenerationOverrideContext(prisma, generateJobId);
      const targetPath = resolveManualOverrideFilePath(context.lineage.characterRoot, overrideKind);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }

      if (afterClear === "rebuild") {
        const rebuilt = await createCharacterGenerationRebuildSelected(prisma, queue, queueName, {
          generateJobId
        });
        return reply.redirect(
          hrefWithCreationNav(
            "/ui/character-generator",
            {
              jobId: rebuilt.generateJobId,
              message: `Cleared ${overrideKind === "anchors" ? "anchors.json" : "crop-boxes.json"} override and queued current-selection rebuild.`
            },
            {
              ...creationNav,
              currentObject: `run:${rebuilt.generateJobId}`,
              focus: "cg-manual-overrides"
            }
          )
        );
      }

      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          {
            jobId: generateJobId,
            message: `Cleared ${overrideKind === "anchors" ? "anchors.json" : "crop-boxes.json"} override. Proposal defaults will be used on the next rebuild.`
          },
          {
            ...creationNav,
            currentObject: creationNav.currentObject ?? `run:${generateJobId}`,
            focus: "cg-manual-overrides"
          }
        )
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { error: message, ...(fallbackJobId ? { jobId: fallbackJobId } : {}) },
          {
            ...creationNav,
            focus: "cg-manual-overrides"
          }
        )
      );
    }
  });

  app.post("/ui/character-generator/rebuild-selected", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const creationNav = readCreationNavState(body);
    const fallbackJobId = optionalString(body, "generateJobId") ?? creationNav.jobId;
    try {
      const generateJobId = optionalString(body, "generateJobId");
      if (!generateJobId) {
        throw createHttpError(400, "generateJobId is required");
      }
      const rebuilt = await createCharacterGenerationRebuildSelected(prisma, queue, queueName, {
        generateJobId
      });
      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          {
            jobId: rebuilt.generateJobId,
            message: "Current selection rebuild queued. The same selected candidates will rebuild the Character Pack with your latest override files."
          },
          {
            ...creationNav,
            currentObject: `run:${rebuilt.generateJobId}`,
            focus: "cg-manual-overrides"
          }
        )
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { error: message, ...(fallbackJobId ? { jobId: fallbackJobId } : {}) },
          {
            ...creationNav,
            focus: "cg-manual-overrides"
          }
        )
      );
    }
  });

  app.post("/ui/character-generator/set-active", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const creationNav = readCreationNavState(body);
    try {
      const characterPackId = optionalString(body, "characterPackId");
      if (!characterPackId) {
        throw createHttpError(400, "characterPackId is required");
      }

      const targetPack = await prisma.characterPack.findUnique({
        where: { id: characterPackId },
        select: { id: true, channelId: true }
      });
      if (!targetPack) {
        throw createHttpError(404, `character pack not found: ${characterPackId}`);
      }

      await prisma.$transaction(async (tx) => {
        await tx.characterPack.updateMany({
          where: {
            status: "APPROVED",
            channelId: targetPack.channelId,
            id: {
              not: characterPackId
            }
          },
          data: {
            status: "ARCHIVED"
          }
        });

        await tx.characterPack.update({
          where: { id: characterPackId },
          data: {
            status: "APPROVED"
          }
        });
      });

      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { message: `Character Pack ${characterPackId} approved as the active baseline.` },
          {
            ...creationNav,
            currentObject: `pack:${characterPackId}`,
            focus: "pack-preview-handoff"
          }
        )
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { error: message, ...(creationNav.jobId ? { jobId: creationNav.jobId } : {}) },
          {
            ...creationNav,
            focus: creationNav.focus ?? "pack-preview-handoff"
          }
        )
      );
    }
  });

  app.post("/ui/character-generator/rollback-active", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const creationNav = readCreationNavState(body);
    try {
      const targetCharacterPackId = optionalString(body, "targetCharacterPackId");
      if (!targetCharacterPackId) {
        throw createHttpError(400, "targetCharacterPackId is required");
      }

      const targetPack = await prisma.characterPack.findUnique({
        where: { id: targetCharacterPackId },
        select: { id: true, channelId: true }
      });
      if (!targetPack) {
        throw createHttpError(404, `character pack not found: ${targetCharacterPackId}`);
      }

      await prisma.$transaction(async (tx) => {
        await tx.characterPack.updateMany({
          where: {
            status: "APPROVED",
            channelId: targetPack.channelId,
            id: {
              not: targetCharacterPackId
            }
          },
          data: {
            status: "ARCHIVED"
          }
        });
        await tx.characterPack.update({
          where: { id: targetCharacterPackId },
          data: {
            status: "APPROVED"
          }
        });
      });

      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { message: `Character Pack rollback complete. Active baseline -> ${targetCharacterPackId}` },
          {
            ...creationNav,
            currentObject: `pack:${targetCharacterPackId}`,
            focus: "rollback-active-pack"
          }
        )
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(
        hrefWithCreationNav(
          "/ui/character-generator",
          { error: message, ...(creationNav.jobId ? { jobId: creationNav.jobId } : {}) },
          {
            ...creationNav,
            focus: creationNav.focus ?? "rollback-active-pack"
          }
        )
      );
    }
  });

  app.get("/ui/character-generator/compare", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const creationNav = readCreationNavState(query);
    const currentPageReturnTo = requestUiHref(request);
    const leftPackId = optionalString(query, "leftPackId");
    const rightPackId = optionalString(query, "rightPackId");
    if (!leftPackId || !rightPackId) {
      throw createHttpError(400, "leftPackId and rightPackId are required");
    }

    const [leftPack, rightPack] = await Promise.all([
      prisma.characterPack.findUnique({
        where: { id: leftPackId },
        include: {
          episodes: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              jobs: {
                orderBy: { createdAt: "desc" },
                take: 3
              }
            }
          }
        }
      }),
      prisma.characterPack.findUnique({
        where: { id: rightPackId },
        include: {
          episodes: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              jobs: {
                orderBy: { createdAt: "desc" },
                take: 3
              }
            }
          }
        }
      })
    ]);

    if (!leftPack || !rightPack) {
      throw createHttpError(404, "one or more character packs were not found");
    }

    const leftArtifacts = getCharacterArtifacts(leftPack.id);
    const rightArtifacts = getCharacterArtifacts(rightPack.id);
    const leftPreviewExists = fs.existsSync(leftArtifacts.previewPath);
    const rightPreviewExists = fs.existsSync(rightArtifacts.previewPath);
    const leftQcExists = fs.existsSync(leftArtifacts.qcReportPath);
    const rightQcExists = fs.existsSync(rightArtifacts.qcReportPath);
    const leftLineage = readCharacterPackLineage(leftPack.id);
    const rightLineage = readCharacterPackLineage(rightPack.id);
    const compareGeneratorHref = hrefWithCreationNav(
      "/ui/character-generator",
      { ...(creationNav.referenceAssetId ? { referenceAssetId: creationNav.referenceAssetId } : {}) },
      {
        returnTo: currentPageReturnTo,
        currentObject: `pack:${leftPack.id}`,
        focus: "cg-stage-context"
      }
    );
    const leftReviewHref = hrefWithCreationNav(
      "/ui/characters",
      { characterPackId: leftPack.id },
      {
        returnTo: currentPageReturnTo,
        currentObject: `pack:${leftPack.id}`,
        focus: "pack-review-current"
      }
    );
    const rightReviewHref = hrefWithCreationNav(
      "/ui/characters",
      { characterPackId: rightPack.id },
      {
        returnTo: currentPageReturnTo,
        currentObject: `pack:${rightPack.id}`,
        focus: "pack-review-current"
      }
    );
    const compareStyle = `<style>
      .pack-compare-shell{display:grid;gap:14px}
      .pack-compare-hero,.pack-compare-panel,.pack-compare-next{position:relative;overflow:hidden;border:1px solid #d6e0ef;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 16px 40px rgba(15,23,42,.06)}
      .pack-compare-hero,.pack-compare-panel,.pack-compare-next{padding:18px}
      .pack-compare-hero::before,.pack-compare-panel::before,.pack-compare-next::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#1257c7,rgba(18,87,199,.15))}
      .pack-compare-hero h1,.pack-compare-panel h2,.pack-compare-next h2{margin:0}
      .pack-compare-hero p,.pack-compare-panel p,.pack-compare-next p{color:#5b6b82;line-height:1.55}
      .pack-compare-flow{display:grid;gap:10px;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:14px}
      .pack-compare-step{display:grid;gap:6px;padding:12px;border:1px solid #d6e0ef;border-radius:14px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
      .pack-compare-step strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#245372}
      .pack-compare-grid{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}
      .pack-compare-stats{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr));margin:14px 0}
      .pack-compare-stat{padding:12px;border:1px solid #d6e0ef;border-radius:14px;background:linear-gradient(180deg,#fff,#f8fbff)}
      .pack-compare-stat span{display:block;margin-bottom:6px;color:#5b6b82;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .pack-compare-stat strong{display:block;font-size:14px;line-height:1.45}
      .pack-compare-links,.pack-compare-next-links{display:flex;gap:8px;flex-wrap:wrap}
      .pack-compare-link{appearance:none;cursor:pointer;display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;border:1px solid #d6e0ef;background:#fff;color:#142033;font-size:12px;font-weight:700;text-decoration:none}
      .pack-compare-link:hover{text-decoration:none;box-shadow:0 8px 20px rgba(18,87,199,.08)}
      .pack-compare-jobs{margin:12px 0 0;padding-left:18px;display:grid;gap:6px}
      .pack-compare-player{margin-top:14px}
      .pack-compare-player video{width:100%;max-width:640px;background:#000;border-radius:12px}
      @media (max-width:960px){.pack-compare-grid,.pack-compare-flow,.pack-compare-stats{grid-template-columns:1fr}}
    </style>`;
    const panel = (
      side: "A" | "B",
      pack: typeof leftPack,
      previewExists: boolean,
      qcExists: boolean,
      lineage: CharacterPackLineage | null
    ) => {
      const latestEpisode = pack.episodes[0];
      const latestJobs = latestEpisode?.jobs ?? [];
      const latestJobSummary =
        latestJobs.length > 0 ? latestJobs.map((job) => `${job.type} / ${job.status} / ${job.progress}%`).join(" | ") : "No jobs yet";
      return `<section class="pack-compare-panel"><h2>${escHtml(side)}: ${escHtml(
        pack.id
      )}</h2><p>Use this panel to compare pack evidence before approval or rollback. Keep preview, QC, lineage, and jobs readable without leaving the compare surface.</p><div class="pack-compare-stats"><div class="pack-compare-stat"><span>Version / Status</span><strong>v${escHtml(
        pack.version
      )} / <span class="badge ${uiBadge(pack.status)}">${escHtml(pack.status)}</span></strong></div><div class="pack-compare-stat"><span>Preview / QC</span><strong>preview=${escHtml(
        previewExists ? "exists" : "missing"
      )} / qc=${escHtml(qcExists ? "exists" : "missing")}</strong></div><div class="pack-compare-stat"><span>Lineage Gate</span><strong>${escHtml(
        lineage?.acceptanceStatus ?? "unknown"
      )} / repair=${escHtml(lineage ? String(lineage.repairOpenCount) : "-")}</strong></div><div class="pack-compare-stat"><span>Latest Episode</span><strong>${escHtml(
        latestEpisode ? `${latestEpisode.id} / ${latestEpisode.topic ?? "-"}` : "No episode yet"
      )}</strong></div></div>${
        previewExists
          ? `<div class="pack-compare-player"><video controls preload="metadata"><source src="/artifacts/characters/${encodeURIComponent(
              pack.id
            )}/preview.mp4" type="video/mp4"/></video></div>`
          : `<div class="error">preview.mp4 missing</div>`
      }<div class="pack-compare-links"><a class="pack-compare-link" href="${escHtml(
        side === "A" ? leftReviewHref : rightReviewHref
      )}">Pack Review</a><a class="pack-compare-link" href="/artifacts/characters/${encodeURIComponent(
        pack.id
      )}/pack.json">pack.json</a><a class="pack-compare-link" href="/artifacts/characters/${encodeURIComponent(
        pack.id
      )}/preview.mp4">preview.mp4</a><a class="pack-compare-link" href="/artifacts/characters/${encodeURIComponent(
        pack.id
      )}/qc_report.json">qc_report.json</a>${
        lineage?.manifestUrl ? `<a class="pack-compare-link" href="${escHtml(lineage.manifestUrl)}">manifest</a>` : ""
      }${lineage?.repairTasksUrl ? `<a class="pack-compare-link" href="${escHtml(lineage.repairTasksUrl)}">repair tasks</a>` : ""}</div><p>jobs: ${escHtml(
        latestJobSummary
      )}</p>${
        latestJobs.length > 0
          ? `<ul class="pack-compare-jobs">${latestJobs
              .map(
                (job) =>
                  `<li><a href="/ui/jobs/${encodeURIComponent(job.id)}">${escHtml(job.id)}</a> / ${escHtml(
                    job.type
                  )} / <span class="badge ${uiBadge(job.status)}">${escHtml(job.status)}</span> / ${escHtml(job.progress)}%</li>`
              )
              .join("")}</ul>`
          : ""
      }</section>`;
    };
    const compareNavScript = `<script>(function(){const ns="ecs.ui.creation.nav.v1";const parse=(value,fallback)=>{try{const parsed=JSON.parse(String(value||""));return parsed==null?fallback:parsed;}catch{return fallback;}};const readList=(kind)=>{if(typeof window==="undefined"||!window.localStorage){return [];}const parsed=parse(window.localStorage.getItem(ns+".recent."+kind),[]);return Array.isArray(parsed)?parsed:[];};const writeList=(kind,items)=>{try{window.localStorage.setItem(ns+".recent."+kind,JSON.stringify(items.slice(0,6)));}catch{}};const pushRecent=(kind,item)=>{if(!item||!item.id){return;}const next=[item].concat(readList(kind).filter((entry)=>entry&&entry.id!==item.id));writeList(kind,next);};pushRecent("packs",{id:${JSON.stringify(
      leftPack.id
    )},label:${JSON.stringify(`Pack ${leftPack.id}`)},href:${JSON.stringify(leftReviewHref)}});pushRecent("packs",{id:${JSON.stringify(
      rightPack.id
    )},label:${JSON.stringify(`Pack ${rightPack.id}`)},href:${JSON.stringify(rightReviewHref)}});document.getElementById("pack-compare-copy")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(window.location.href);}catch{}});})();</script>`;
    const html = `${compareStyle}<div class="pack-compare-shell"><section class="pack-compare-hero" id="pack-compare-hero"><p class="eyebrow">Pack Compare Surface</p><h1>Character Pack Compare</h1><p>Use this compare surface to choose the pack that should move forward. Read preview, QC, lineage, and jobs here first, then reopen Character Generator for approval or Characters for deeper inspection.</p><div class="pack-compare-next-links"><a class="pack-compare-link" href="${escHtml(compareGeneratorHref)}">Character Generator</a><a class="pack-compare-link" href="${escHtml(leftReviewHref)}">A pack review</a><a class="pack-compare-link" href="${escHtml(rightReviewHref)}">B pack review</a>${
      creationNav.returnTo ? `<a class="pack-compare-link" href="${escHtml(creationNav.returnTo)}">Return</a>` : ""
    }<button type="button" class="pack-compare-link" id="pack-compare-copy">Copy deep link</button></div><div class="pack-compare-flow"><div class="pack-compare-step"><strong>01 Preview</strong><span>Check visual handoff quality before deciding which pack should survive compare.</span></div><div class="pack-compare-step"><strong>02 QC</strong><span>Read QC evidence without leaving the compare shell.</span></div><div class="pack-compare-step"><strong>03 Lineage</strong><span>Confirm acceptance state, provenance, and repair pressure before approval.</span></div><div class="pack-compare-step"><strong>04 Jobs</strong><span>Keep the latest episode and job history visible while you compare.</span></div></div></section><section class="pack-compare-next"><h2>Next step</h2><p>Once a winner is clear, reopen Character Generator for approval or rollback. If the pack still needs slower evidence reading, continue in Characters review.</p><div class="pack-compare-next-links"><a class="pack-compare-link" href="${escHtml(compareGeneratorHref)}">Open approval lane</a><a class="pack-compare-link" href="${escHtml(leftReviewHref)}">A pack review</a><a class="pack-compare-link" href="${escHtml(rightReviewHref)}">B pack review</a></div></section><div class="pack-compare-grid">${panel(
      "A",
      leftPack,
      leftPreviewExists,
      leftQcExists,
      leftLineage
    )}${panel("B", rightPack, rightPreviewExists, rightQcExists, rightLineage)}</div></div>${compareNavScript}`;    return reply.type("text/html; charset=utf-8").send(uiPage("\uCE90\uB9AD\uD130 \uD329 \uBE44\uAD50", html));
  });

  app.get("/ui/characters/generated-file", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const requestedPath = optionalString(query, "path");
    if (!requestedPath) {
      throw createHttpError(400, "path is required");
    }

    const resolved = resolveGeneratedCharacterFile(requestedPath);
    if (!resolved) {
      return reply.code(404).type("text/plain; charset=utf-8").send("generated character artifact not found");
    }

    return reply.type(mimeTypeForGeneratedCharacterFile(resolved.resolvedPath)).send(fs.createReadStream(resolved.resolvedPath));
  });

  app.get("/ui/characters", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const creationNav = readCreationNavState(query);
    const currentPageReturnTo = requestUiHref(request);
    const selectedPackId = optionalString(query, "characterPackId");
    const message = optionalString(query, "message");
    const error = optionalString(query, "error");

    const [readyAssets, packs] = await Promise.all([
      prisma.asset.findMany({
        where: {
          status: "READY",
          assetType: { in: ["CHARACTER_REFERENCE", "CHARACTER_VIEW"] }
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          assetType: true,
          channelId: true,
          createdAt: true
        }
      }),
      prisma.characterPack.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          episodes: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              topic: true,
              status: true,
              createdAt: true
            }
          }
        }
      })
    ]);

    const selectedPackLookupId = selectedPackId ?? packs[0]?.id;
    const selectedPack = selectedPackLookupId
      ? await prisma.characterPack.findUnique({
          where: { id: selectedPackLookupId },
          include: {
            episodes: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: {
                jobs: {
                  orderBy: { createdAt: "desc" },
                  take: 20
                }
              }
            }
          }
        })
      : null;

    const selectedArtifacts = selectedPack ? getCharacterArtifacts(selectedPack.id) : null;
    const selectedPreviewExists = selectedArtifacts ? fs.existsSync(selectedArtifacts.previewPath) : false;
    const selectedQcExists = selectedArtifacts ? fs.existsSync(selectedArtifacts.qcReportPath) : false;
    const selectedPreviewUrl = selectedPack
      ? `/artifacts/characters/${encodeURIComponent(selectedPack.id)}/preview.mp4`
      : null;
    const selectedQcUrl = selectedPack
      ? `/artifacts/characters/${encodeURIComponent(selectedPack.id)}/qc_report.json`
      : null;
    const selectedQcReport =
      selectedArtifacts && selectedQcExists
        ? (() => {
            try {
              return JSON.parse(fs.readFileSync(selectedArtifacts.qcReportPath, "utf8")) as unknown;
            } catch {
              return null;
            }
          })()
        : null;

    const assetOptions = readyAssets
      .map(
        (asset) =>
          `<option value="${escHtml(asset.id)}">${escHtml(asset.id)} (${escHtml(
            asset.assetType ?? "-"
          )}, channel=${escHtml(asset.channelId)})</option>`
      )
      .join("");

    const packRows = packs
      .map((pack) => {
        const episode = pack.episodes[0];
        const artifacts = getCharacterArtifacts(pack.id);
        return `<tr><td><a href="${escHtml(
          hrefWithCreationNav(
            "/ui/characters",
            { characterPackId: pack.id },
            {
              returnTo: creationNav.returnTo,
              currentObject: `pack:${pack.id}`,
              focus: "pack-review-current"
            }
          )
        )}">${escHtml(
          pack.id
        )}</a></td><td>${escHtml(pack.version)}</td><td><span class="badge ${uiBadge(pack.status)}">${escHtml(
          pack.status
        )}</span></td><td>${episode ? `<a href="/ui/episodes/${escHtml(episode.id)}">${escHtml(episode.topic)}</a>` : "-"}</td><td>${
          fs.existsSync(artifacts.previewPath)
            ? `<a href="/artifacts/characters/${encodeURIComponent(pack.id)}/preview.mp4">preview.mp4</a>`
            : "-"
        }</td><td>${escHtml(pack.createdAt.toLocaleString("ko-KR", { hour12: false }))}</td></tr>`;
      })
      .join("");

    const selectedJobs =
      selectedPack && selectedPack.episodes[0]
        ? selectedPack.episodes[0].jobs
            .map(
              (job) =>
                `<tr><td><a href="/ui/jobs/${escHtml(job.id)}">${escHtml(job.id)}</a></td><td>${escHtml(job.type)}</td><td><span class="badge ${uiBadge(
                  job.status
                )}">${escHtml(job.status)}</span></td><td>${escHtml(job.progress)}%</td><td>${escHtml(
                  job.createdAt.toLocaleString("ko-KR", { hour12: false })
                )}</td></tr>`
            )
            .join("")
        : "";
    const selectedQcIssues = readQcIssues(selectedQcReport);
    const selectedQcIssueRows = selectedQcIssues
      .map(
        (issue, index) =>
          `<tr><td>${index + 1}</td><td>${escHtml(issue.check)}</td><td><span class="badge ${uiBadge(
            issue.severity
          )}">${escHtml(issue.severity)}</span></td><td>${escHtml(issue.message)}</td><td><pre>${escHtml(
            JSON.stringify(issue.details, null, 2)
          )}</pre></td></tr>`
      )
      .join("");
    const selectedGeneratedLineage = selectedPack ? readCharacterPackLineage(selectedPack.id) : null;
    const activePack =
      selectedPack && selectedPack.channelId
        ? packs.find((pack) => pack.channelId === selectedPack.channelId && pack.status === "APPROVED") ?? null
        : null;
    const compareHref =
      selectedPack && activePack && activePack.id !== selectedPack.id
        ? buildUiHref("/ui/character-generator/compare", {
            leftPackId: selectedPack.id,
            rightPackId: activePack.id,
            returnTo: currentPageReturnTo,
            currentObject: `pack:${selectedPack.id}`,
            focus: "pack-compare-hero"
          })
        : null;
    const selectedPackRigSummary = selectedGeneratedLineage?.rigSummary ?? null;
    const selectedPackRigTone: "ok" | "warn" | "bad" | "muted" =
      selectedPackRigSummary?.reviewOnly === true ? "warn" : selectedPackRigSummary ? "ok" : "muted";
    const selectedPackRigStateTitle =
      selectedPackRigSummary?.reviewOnly === true
        ? "Rig review only"
        : selectedPackRigSummary
          ? "Rig clear"
          : "Rig not recorded";
    const selectedPackRigStateCopy =
      selectedPackRigSummary?.reviewOnly === true
        ? "Pack metadata kept this pack in review-only mode. Reopen compare before approval or promotion."
        : selectedPackRigSummary
          ? "Pack metadata recorded anchor confidence and fallback state for this review."
          : "Pack metadata did not record anchor confidence or fallback state yet.";
    const selectedPackRigFlags = dedupeStrings([
      ...(selectedPackRigSummary?.reviewNotes ?? []).map((note) => `Review note: ${note}`),
      ...(selectedPackRigSummary?.lowConfidenceAnchorIds ?? []).slice(0, 6).map((anchorId) => `Low confidence anchor: ${anchorId}`),
      ...(selectedPackRigSummary?.missingAnchorIds ?? []).slice(0, 6).map((anchorId) => `Missing anchor: ${anchorId}`)
    ])
      .map((flag) => {
        const tone = flag.startsWith("Missing anchor") ? "bad" : flag.startsWith("Low confidence anchor") ? "warn" : selectedPackRigTone;
        return `<span class="pack-review-flag ${tone}">${escHtml(flag)}</span>`;
      })
      .join("");
    const selectedPackRigViewRows = (["front", "threeQuarter", "profile"] as const)
      .map((view) => {
        const byView = selectedPackRigSummary?.byView?.[view];
        const covered = selectedPackRigSummary?.coveredViews.includes(view) ?? false;
        const missing = selectedPackRigSummary?.missingViews.includes(view) ?? false;
        const stateLabel = missing ? "missing" : covered ? "covered" : "not recorded";
        const stateTone = missing ? "bad" : covered ? "ok" : "muted";
        return `<tr><td>${escHtml(view)}</td><td><span class="badge ${stateTone}">${escHtml(
          stateLabel
        )}</span></td><td>${escHtml(
          formatMetric(selectedPackRigSummary?.anchorConfidenceByView?.[view])
        )}</td><td>${escHtml(byView?.presentAnchorIds.join(", ") || "-")}</td><td>${escHtml(
          byView?.missingAnchorIds.join(", ") || "-"
        )}</td><td>${escHtml(byView?.notes ?? "-")}</td></tr>`;
      })
      .join("");
    const selectedLineageSection = selectedPack
      ? buildCharacterPackLineageSection({
          lineage: selectedGeneratedLineage,
          selectedPackId: selectedPack.id,
          activePackId: activePack?.id ?? null,
          compareHref
        })
      : "";
    const selectedLatestJob = selectedPack?.episodes[0]?.jobs[0] ?? null;
    const charactersStudioHref = hrefWithCreationNav(
      "/ui/studio",
      { ...(creationNav.assetId ? { assetId: creationNav.assetId } : {}) },
      {
        returnTo: currentPageReturnTo,
        currentObject: selectedPack ? `pack:${selectedPack.id}` : creationNav.currentObject,
        focus: "studio-selection"
      }
    );
    const charactersGeneratorHref = hrefWithCreationNav(
      "/ui/character-generator",
      { ...(creationNav.referenceAssetId ? { referenceAssetId: creationNav.referenceAssetId } : {}) },
      {
        returnTo: currentPageReturnTo,
        currentObject: selectedPack ? `pack:${selectedPack.id}` : creationNav.currentObject,
        focus: "cg-stage-context"
      }
    );
    const selectedPackSelfHref = selectedPack
      ? hrefWithCreationNav(
          "/ui/characters",
          { characterPackId: selectedPack.id },
          {
            returnTo: creationNav.returnTo,
            currentObject: `pack:${selectedPack.id}`,
            focus: "pack-review-current"
          }
        )
      : null;
    const selectedPackRigSection = selectedPack
      ? selectedPackRigSummary
        ? `<section class="card"><h3>Rig / Anchor review</h3><p>Current pack rig state is pulled from manifest and pack metadata so review can happen here before raw JSON.</p><div class="pack-review-rig-grid"><article class="pack-review-rig-card ${selectedPackRigTone}"><span>Fallback State</span><strong>${escHtml(
            selectedPackRigStateTitle
          )}</strong><p>${escHtml(selectedPackRigStateCopy)}</p></article><article class="pack-review-rig-card ${selectedPackRigTone}"><span>Anchor Confidence</span><strong>${escHtml(
            formatMetric(selectedPackRigSummary.anchorConfidenceOverall)
          )}</strong><p>front=${escHtml(
            formatMetric(selectedPackRigSummary.anchorConfidenceByView.front)
          )} / threeQuarter=${escHtml(
            formatMetric(selectedPackRigSummary.anchorConfidenceByView.threeQuarter)
          )} / profile=${escHtml(formatMetric(selectedPackRigSummary.anchorConfidenceByView.profile))}</p></article><article class="pack-review-rig-card ${selectedPackRigTone}"><span>View Coverage</span><strong>${escHtml(
            selectedPackRigSummary.coveredViews.join(", ") || "none"
          )}</strong><p>missing=${escHtml(selectedPackRigSummary.missingViews.join(", ") || "none")}</p></article></div><div class="pack-review-actions"><a class="pack-review-link" href="${escHtml(
            charactersGeneratorHref
          )}">generator approval lane</a>${compareHref ? `<a class="pack-review-link" href="${escHtml(compareHref)}">linked compare</a>` : ""}<a class="pack-review-link" href="#pack-review-lineage">lineage evidence</a></div><div class="pack-review-signal-table"><table><thead><tr><th>View</th><th>State</th><th>Anchor confidence</th><th>Present anchors</th><th>Missing anchors</th><th>Notes</th></tr></thead><tbody>${selectedPackRigViewRows}</tbody></table></div>${
            selectedPackRigFlags ? `<div class="pack-review-flag-list">${selectedPackRigFlags}</div>` : ""
          }</section>`
        : `<section class="card"><h3>Rig / Anchor review</h3><div class="notice">This pack does not record a pack-level anchor confidence or fallback summary yet. Raw JSON remains available below as secondary evidence.</div></section>`
      : "";
    const charactersCreateNavFields = renderCreationNavHiddenFields({
      returnTo: currentPageReturnTo,
      currentObject: selectedPack ? `pack:${selectedPack.id}` : creationNav.currentObject,
      focus: "pack-review-current",
      assetId: creationNav.assetId,
      referenceAssetId: creationNav.referenceAssetId
    });
    const charactersNavSection = `<section class="pack-review-rail" id="pack-review-creation-nav" data-current-pack-id="${escHtml(
      selectedPack?.id ?? ""
    )}"><p class="eyebrow">Creation Handoff</p><h2>Return / current pack / reopen</h2><p>Characters는 pack detail surface입니다. compare, lineage, generator approval lane, studio dispatch hub로 다시 들어갈 때 현재 pack deep link를 먼저 고정합니다.</p><div class="pack-review-actions"><a class="pack-review-link" href="${escHtml(
      charactersStudioHref
    )}">Studio</a><a class="pack-review-link" href="${escHtml(
      charactersGeneratorHref
    )}">Character Generator</a>${
      compareHref ? `<a class="pack-review-link" href="${escHtml(compareHref)}">Compare</a>` : ""
    }${
      selectedPack ? '<a class="pack-review-link" href="#pack-review-lineage">Lineage</a>' : ""
    }${
      creationNav.returnTo ? `<a class="pack-review-link" href="${escHtml(creationNav.returnTo)}">Return</a>` : ""
    }<button type="button" class="pack-review-link" id="pack-review-copy-link">Copy deep link</button>${
      selectedPack ? '<button type="button" class="pack-review-link" id="pack-review-pin-pack">Pin current pack</button>' : ""
    }</div><div class="pack-review-flow"><article class="pack-review-flow-item"><strong>Current Object</strong><span id="pack-review-current-object">${escHtml(
      selectedPack ? `Pack ${selectedPack.id}` : creationNav.currentObject ?? "none"
    )}</span></article><article class="pack-review-flow-item"><strong>Pinned Reopen</strong><span id="pack-review-nav-pins">Pinned reopen links will appear here.</span></article><article class="pack-review-flow-item"><strong>Recent Reopen</strong><span id="pack-review-nav-recents">Recent reopen links will appear here.</span></article><article class="pack-review-flow-item"><strong>Focus</strong><span>Use compare, lineage, and review anchors before leaving this surface.</span></article></div></section>`;
    const charactersNavScript = `<script>(function(){const ns="ecs.ui.creation.nav.v1";const parse=(value,fallback)=>{try{const parsed=JSON.parse(String(value||""));return parsed==null?fallback:parsed;}catch{return fallback;}};const readList=(kind)=>{if(typeof window==="undefined"||!window.localStorage){return [];}const parsed=parse(window.localStorage.getItem(ns+".recent."+kind),[]);return Array.isArray(parsed)?parsed:[];};const writeList=(kind,items)=>{try{window.localStorage.setItem(ns+".recent."+kind,JSON.stringify(items.slice(0,6)));}catch{}};const readPin=(kind)=>{if(typeof window==="undefined"||!window.localStorage){return null;}const parsed=parse(window.localStorage.getItem(ns+".pin."+kind),null);return parsed&&typeof parsed==="object"?parsed:null;};const writePin=(kind,item)=>{try{window.localStorage.setItem(ns+".pin."+kind,JSON.stringify(item));}catch{}};const pushRecent=(kind,item)=>{if(!item||!item.id){return;}const next=[item].concat(readList(kind).filter((entry)=>entry&&entry.id!==item.id));writeList(kind,next);};const esc=(value)=>String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");const render=(id,items,empty)=>{const root=document.getElementById(id);if(!(root instanceof HTMLElement)){return;}const valid=Array.isArray(items)?items.filter((entry)=>entry&&entry.href&&entry.label):[];root.innerHTML=valid.length?valid.map((entry)=>'<a class="pack-review-link" href="'+esc(entry.href)+'">'+esc(entry.label)+'</a>').join(""):esc(empty);};const currentPackId=${JSON.stringify(
      selectedPack?.id ?? ""
    )};const currentPackHref=${JSON.stringify(selectedPackSelfHref ?? "")};if(currentPackId&&currentPackHref){pushRecent("packs",{id:currentPackId,label:"Pack "+currentPackId,href:currentPackHref});}document.getElementById("pack-review-copy-link")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(window.location.href);}catch{}});document.getElementById("pack-review-pin-pack")?.addEventListener("click",()=>{if(!currentPackId||!currentPackHref){return;}writePin("pack",{id:currentPackId,label:"Pack "+currentPackId,href:currentPackHref});render("pack-review-nav-pins",[readPin("pack"),readPin("run"),readPin("asset")].filter(Boolean),"Pinned reopen links will appear here.");});render("pack-review-nav-pins",[readPin("pack"),readPin("run"),readPin("asset")].filter(Boolean),"Pinned reopen links will appear here.");render("pack-review-nav-recents",readList("packs").slice(0,4).concat(readList("runs").slice(0,2)),"Recent reopen links will appear here.");})();</script>`;
    const reviewStyle = `<style>
      .pack-review-shell{display:grid;gap:14px}
      .pack-review-hero,.pack-review-panel,.pack-review-rail{position:relative;overflow:hidden;border:1px solid #d6e0ef;border-radius:18px;background:linear-gradient(180deg,#fff,#f8fbff);box-shadow:0 16px 40px rgba(15,23,42,.06)}
      .pack-review-hero,.pack-review-panel,.pack-review-rail{padding:18px}
      .pack-review-hero::before,.pack-review-panel::before,.pack-review-rail::before{content:"";position:absolute;inset:0 auto auto 0;height:3px;width:100%;background:linear-gradient(90deg,#1257c7,rgba(18,87,199,.15))}
      .pack-review-hero h1,.pack-review-panel h2,.pack-review-rail h2{margin:0}
      .pack-review-hero p,.pack-review-panel p,.pack-review-rail p{color:#5b6b82;line-height:1.55}
      .pack-review-grid{display:grid;gap:14px;grid-template-columns:minmax(0,1.18fr) minmax(320px,.82fr)}
      .pack-review-actions{display:flex;gap:8px;flex-wrap:wrap}
      .pack-review-link{appearance:none;cursor:pointer;display:inline-flex;align-items:center;padding:7px 10px;border-radius:999px;border:1px solid #d6e0ef;background:#fff;color:#142033;font-size:12px;font-weight:700;text-decoration:none}
      .pack-review-link:hover{text-decoration:none;box-shadow:0 8px 20px rgba(18,87,199,.08)}
      .pack-review-summary{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:14px}
      .pack-review-card{padding:12px;border:1px solid #d6e0ef;border-radius:14px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
      .pack-review-card span{display:block;margin-bottom:6px;color:#5b6b82;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .pack-review-card strong{display:block;font-size:14px;line-height:1.45}
      .pack-review-rig-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin:14px 0}
      .pack-review-rig-card{padding:12px;border:1px solid #d6e0ef;border-radius:14px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
      .pack-review-rig-card.ok{border-color:#b8e2c7;background:linear-gradient(180deg,#fbfffc,#f3fbf5)}
      .pack-review-rig-card.warn{border-color:#f1d39b;background:linear-gradient(180deg,#fffdf8,#fff7e6)}
      .pack-review-rig-card.bad{border-color:#e4b1b5;background:linear-gradient(180deg,#fffafb,#fff1f2)}
      .pack-review-rig-card.muted{border-color:#d6e0ef;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
      .pack-review-rig-card span{display:block;margin-bottom:6px;color:#5b6b82;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .pack-review-rig-card strong{display:block;font-size:14px;line-height:1.45}
      .pack-review-signal-table{overflow:auto;margin-top:14px}
      .pack-review-signal-table table{margin:0}
      .pack-review-flag-list{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .pack-review-flag{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid #d6e0ef;background:#fff;color:#142033;font-size:12px;font-weight:700}
      .pack-review-flag.ok{border-color:#b8e2c7;background:#f3fbf5}
      .pack-review-flag.warn{border-color:#f1d39b;background:#fff7e6}
      .pack-review-flag.bad{border-color:#e4b1b5;background:#fff1f2}
      .pack-review-flag.muted{border-color:#d6e0ef;background:#f7fafe}
      .pack-review-flow{display:grid;gap:10px;grid-template-columns:repeat(4,minmax(0,1fr));margin:14px 0}
      .pack-review-flow-item{display:grid;gap:6px;padding:12px;border:1px solid #d6e0ef;border-radius:14px;background:linear-gradient(180deg,#fcfdff,#f7fafe)}
      .pack-review-flow-item strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#245372}
      .pack-review-stage{display:grid;gap:14px}
      .pack-review-manual summary{cursor:pointer;font-weight:700}
      @media (max-width:1080px){.pack-review-grid,.pack-review-summary,.pack-review-flow{grid-template-columns:1fr}}
    </style>`;
    const manualCreateSection = `<details class="pack-review-panel pack-review-manual"><summary>Manual create exception path</summary><p>Use this only when you need to assemble a new pack directly from ready assets without going through the main Generator lane first. After creation, reopen the resulting pack here for preview, QC, lineage, and jobs review.</p><form method="post" action="/ui/characters/create" class="grid">${charactersCreateNavFields}<div class="grid two"><label>Front Asset<select name="front" required>${
      assetOptions || '<option value="">No READY assets available</option>'
    }</select></label><label>ThreeQuarter Asset<select name="threeQuarter" required>${
      assetOptions || '<option value="">No READY assets available</option>'
    }</select></label><label>Profile Asset<select name="profile" required>${
      assetOptions || '<option value="">No READY assets available</option>'
    }</select></label><label>Topic (optional)<input name="topic" placeholder="character preview"/></label></div><button type="submit">Create character pack + enqueue preview</button></form></details>`;
    const roleSplitRail = `<section class="pack-review-rail"><p class="eyebrow">Role Split</p><h2>Studio routes, Generator approves, Characters reviews</h2><p>Use <a href="${escHtml(charactersStudioHref)}">Studio</a> for dispatch, <a href="${escHtml(charactersGeneratorHref)}">Character Generator</a> for compare and approval, and this surface for the slower read of preview, QC, lineage, and jobs.</p><div class="pack-review-actions"><a class="pack-review-link" href="${escHtml(charactersStudioHref)}">Studio</a><a class="pack-review-link" href="${escHtml(charactersGeneratorHref)}">Character Generator</a>${
      compareHref ? `<a class="pack-review-link" href="${escHtml(compareHref)}">Active Pack Compare</a>` : ""
    }</div><div class="pack-review-flow"><article class="pack-review-flow-item"><strong>01 Preview</strong><span>Check the visual output before leaving this surface.</span></article><article class="pack-review-flow-item"><strong>02 QC</strong><span>Read qc_report.json evidence with severity still visible.</span></article><article class="pack-review-flow-item"><strong>03 Lineage</strong><span>Confirm source, manifest, and repair provenance.</span></article><article class="pack-review-flow-item"><strong>04 Jobs</strong><span>Keep the latest episode and job history close while reviewing.</span></article></div></section>`;

    const selectedSection = selectedPack
      ? `<section class="pack-review-panel" id="pack-review-current"><p class="eyebrow">Pack Review Surface</p><h2>Current pack</h2><p>This is the deep inspection surface for the current Character Pack object. Keep preview, QC, lineage, and jobs visible before reopening compare or the approval lane.</p><div class="pack-review-actions"><a class="pack-review-link" href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/pack.json">pack.json</a><a class="pack-review-link" href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/preview.mp4">preview.mp4</a><a class="pack-review-link" href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/qc_report.json">qc_report.json</a>${
          compareHref ? `<a class="pack-review-link" href="${escHtml(compareHref)}">active pack compare</a>` : ""
        }${
          selectedPackSelfHref ? `<a class="pack-review-link" href="${escHtml(selectedPackSelfHref)}">review reopen</a>` : ""
        }<a class="pack-review-link" href="${escHtml(charactersGeneratorHref)}">approval / rollback</a></div><div class="pack-review-summary"><article class="pack-review-card"><span>Pack</span><strong>${escHtml(
          selectedPack.id
        )}</strong><p>v${escHtml(selectedPack.version)} / <span class="badge ${uiBadge(selectedPack.status)}">${escHtml(
          selectedPack.status
        )}</span></p></article><article class="pack-review-card"><span>Latest Episode</span><strong>${escHtml(
          selectedPack.episodes[0] ? `${selectedPack.episodes[0].id} / ${selectedPack.episodes[0].topic ?? "-"}` : "No episode yet"
        )}</strong><p>active compare: ${escHtml(compareHref ? "available" : "none")}</p></article><article class="pack-review-card"><span>Preview / QC</span><strong>preview=${escHtml(
          selectedPreviewExists ? "exists" : "missing"
        )} / qc=${escHtml(selectedQcExists ? "exists" : "missing")}</strong><p>issues=${escHtml(String(selectedQcIssues.length))}</p></article><article class="pack-review-card"><span>Rig / Anchor</span><strong>${escHtml(
          selectedPackRigStateTitle
        )}</strong><p>anchor=${escHtml(
          formatMetric(selectedPackRigSummary?.anchorConfidenceOverall)
        )} / compare=${escHtml(compareHref ? "available" : "none")}</p></article><article class="pack-review-card"><span>Lineage / Jobs</span><strong>${escHtml(
          selectedGeneratedLineage?.acceptanceStatus ?? "unknown"
        )} / jobs=${escHtml(String(selectedPack.episodes[0]?.jobs.length ?? 0))}</strong><p>repair=${escHtml(
          selectedGeneratedLineage ? String(selectedGeneratedLineage.repairOpenCount) : "-"
        )}</p></article></div><div class="pack-review-flow"><article class="pack-review-flow-item"><strong>Preview</strong><span>Confirm the visual handoff before you leave for compare or approval.</span></article><article class="pack-review-flow-item"><strong>QC</strong><span>Read severity and details before a pack moves forward.</span></article><article class="pack-review-flow-item"><strong>Lineage</strong><span>Use provenance to understand where this pack came from and what repair pressure remains.</span></article><article class="pack-review-flow-item"><strong>Jobs</strong><span>Keep the latest episode and jobs visible while the review stays open.</span></article></div>${
          selectedPackRigSection
        }${
          selectedPreviewExists && selectedPreviewUrl
            ? `<section class="card"><h3>Preview Player</h3><video controls preload="metadata" style="width:100%;max-width:960px;background:#000;border-radius:8px" src="${escHtml(
                selectedPreviewUrl
              )}"></video><p><a href="${escHtml(selectedPreviewUrl)}">Open preview.mp4</a></p></section>`
            : `<section class="card"><h3>Preview Player</h3><div class="error">preview.mp4 is not generated yet.</div></section>`
        }${
          selectedQcExists
            ? selectedQcIssues.length > 0
              ? `<section class="card"><h3>QC Issues</h3><table><thead><tr><th>#</th><th>Check</th><th>Severity</th><th>Message</th><th>Details</th></tr></thead><tbody>${selectedQcIssueRows}</tbody></table><p><a href="${escHtml(
                  selectedQcUrl ?? ""
                )}">Open qc_report.json</a></p></section>`
              : `<section class="card"><h3>QC Report</h3><div class="notice">No issues</div><pre>${escHtml(
                  JSON.stringify(selectedQcReport, null, 2)
                )}</pre></section>`
            : `<section class="card"><h3>QC Report</h3><div class="error">qc_report.json is not generated yet.</div></section>`
        }<div id="pack-review-lineage">${selectedLineageSection}</div><section class="card"><h3>Jobs Behind This Pack</h3><p>Keep the jobs that produced this pack readable beside preview, QC, and lineage.</p><table><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Created At</th></tr></thead><tbody>${
          selectedJobs || '<tr><td colspan="5">No jobs</td></tr>'
        }</tbody></table></section><details><summary>View pack.json</summary><pre>${escHtml(
          JSON.stringify(selectedPack.json, null, 2)
        )}</pre></details></section>`
      : `<section class="pack-review-panel" id="pack-review-current"><p class="eyebrow">Pack Review Surface</p><h2>No pack selected</h2><p>Select one pack from the review queue to open preview, QC, lineage, and jobs in this inspection surface.</p></section>`;
    const html = `${reviewStyle}<div class="pack-review-shell"><section class="pack-review-hero"><p class="eyebrow">Deep Manual Review</p><h1>Character Pack Review</h1><p>Use this surface for the slower inspection pass across preview, QC, lineage, and jobs. Reopen Studio for dispatch and Character Generator for compare, approval, or rollback.</p><div class="pack-review-actions"><a class="pack-review-link" href="${escHtml(charactersStudioHref)}">Studio</a><a class="pack-review-link" href="${escHtml(charactersGeneratorHref)}">Character Generator</a>${
      selectedPack ? `<a class="pack-review-link" href="${escHtml(selectedPackSelfHref ?? "")}">review reopen</a>` : ""
    }${
      selectedLatestJob ? `<a class="pack-review-link" href="/ui/jobs/${encodeURIComponent(selectedLatestJob.id)}">Latest Job</a>` : ""
    }</div><div class="pack-review-summary"><article class="pack-review-card"><span>Review Queue</span><strong>${escHtml(String(packs.length))}</strong><p>pack inspection candidates</p></article><article class="pack-review-card"><span>Ready Assets</span><strong>${escHtml(String(readyAssets.length))}</strong><p>manual create exception path</p></article><article class="pack-review-card"><span>Current Pack</span><strong>${escHtml(selectedPack?.id ?? "None")}</strong><p>${escHtml(selectedPack ? String(selectedPack.status) : "choose one from the list")}</p></article><article class="pack-review-card"><span>Active Compare</span><strong>${escHtml(compareHref ? "available" : "none")}</strong><p>approval surface = Character Generator</p></article></div>${
      message ? `<div class="notice">${escHtml(message)}</div>` : ""
    }${error ? `<div class="error">${escHtml(error)}</div>` : ""}</section>${selectedSection}<div class="pack-review-grid"><section class="pack-review-stage"><section class="pack-review-panel"><h2>Review Queue</h2><p>Select one pack to pin it into the inspection surface. This queue is for reopening review, not for deep evidence reading inside the table itself.</p><table><thead><tr><th>ID</th><th>Version</th><th>Status</th><th>Episode</th><th>Preview</th><th>Created At</th></tr></thead><tbody>${
      packRows || '<tr><td colspan="6">No character packs</td></tr>'
    }</tbody></table></section></section><aside class="pack-review-stage">${charactersNavSection}${roleSplitRail}${manualCreateSection}</aside></div></div>${charactersNavScript}`;    return reply.type("text/html; charset=utf-8").send(uiPage("\uCE90\uB9AD\uD130 \uD329", html));
  });

  app.post("/ui/characters/create", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
    const creationNav = readCreationNavState(body);

    try {
      const assetIds = parseAssetIdsFromBody(body);
      const topic = optionalString(body, "topic");
      const maxAttempts = parsePositiveInt(body.maxAttempts, "maxAttempts", DEFAULT_MAX_ATTEMPTS);
      const retryBackoffMs = parsePositiveInt(body.retryBackoffMs, "retryBackoffMs", DEFAULT_RETRY_BACKOFF_MS);

      const created = await createCharacterPack(prisma, queue, queueName, {
        assetIds,
        topic,
        maxAttempts,
        retryBackoffMs
      });

      return reply.redirect(
        hrefWithCreationNav(
          "/ui/characters",
          {
            characterPackId: created.characterPackId,
            message: `Character pack created: ${created.characterPackId} / ${BUILD_CHARACTER_PACK_JOB_NAME} queued`
          },
          {
            ...creationNav,
            currentObject: `pack:${created.characterPackId}`,
            focus: "pack-review-current"
          }
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode =
        error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
          ? error.statusCode
          : 500;

      if (statusCode >= 500) {
        app.log.error(error);
      }

      return reply.redirect(
        hrefWithCreationNav(
          "/ui/characters",
          { error: message },
          {
            ...creationNav,
            focus: creationNav.focus ?? "pack-review-current"
          }
        )
      );
    }
  });
}




