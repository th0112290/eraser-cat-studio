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
  warningCount?: number;
  rejectionCount?: number;
  runtimeBucket?: "clean" | "warn" | "degraded" | "compound" | "block";
};

type GenerationManifestSelectionDiagnostics = {
  finalSelectionSource?: string;
  coherenceIssues?: string[];
  packCoherence?: GenerationManifestPackCoherence;
  autoReroute?: GenerationManifestAutoReroute;
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
  const selectionRisk = manifest.providerMeta?.selectionDiagnostics?.selectionRisk;
  const qualityEmbargo = manifest.providerMeta?.selectionDiagnostics?.qualityEmbargo;
  const packDefectSummary = manifest.providerMeta?.selectionDiagnostics?.packDefectSummary;
  const finalQualityFirewall = manifest.providerMeta?.selectionDiagnostics?.finalQualityFirewall;
  const workflowStages = manifest.workflowStages ?? manifest.providerMeta?.selectionDiagnostics?.workflowStages ?? [];
  const continuity = manifest.reference?.continuity;
  const finalSelectionSource = manifest.providerMeta?.selectionDiagnostics?.finalSelectionSource;
  const autoRerouteFailed = autoReroute?.attempted === true && autoReroute.recovered === false;
  const autoRerouteRecovered = autoReroute?.attempted === true && autoReroute.recovered === true;
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
      label: `Regenerate ${view}`,
      description: `${repairAcceptanceLead}${mode === "blocking" ? "Coherence is blocked on this view." : "This view is weakening the pack."} Re-run ${view} with ${candidateCount} candidates using ${regenerateSameSeed ? "the same seed" : "a new seed"}.${directiveSummary}${triageSummary}${repairAcceptanceSummary}${rerouteSummary}`,
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
      label: "Recreate full pack",
      description: `Run a fresh full-pack pass with ${recreateCandidateCount} candidates${regenerateSameSeed ? " on the same seed" : " on a new seed"} to rebuild the front anchor and all linked angles.${autoRerouteFailed ? " Auto-reroute already failed once, so this is the safest reset." : ""}${selectionRisk?.suggestedAction === "recreate" ? ` Selection gate marked this pack as ${selectionRisk.level}.` : ""}${qualityEmbargo?.suggestedAction === "recreate" ? ` Quality embargo marked this pack as ${qualityEmbargo.level}.` : ""}${finalQualityFirewall?.suggestedAction === "recreate" ? ` Final quality firewall marked this pack as ${finalQualityFirewall.level}.` : ""}${packDefectSummary?.repeatedFamilies.length ? ` Repeated defects=${packDefectSummary.repeatedFamilies.slice(0, 3).join("+")}.` : ""}`,
      priority:
        frontBlocked ||
        multiBlock ||
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
      label: "Review candidates manually",
      description:
        manifest.status === "PENDING_HITL"
          ? `Open the HITL picker and choose a tighter front/threeQuarter/profile combination.${autoReroute?.attempted ? ` Auto-reroute ${autoReroute.recovered ? "already recovered the pack once" : "already tried a recovery pass"} first.` : ""}${highRiskAutoSelection ? ` Selection gate marked this pack as ${selectionRisk?.level}.` : ""}${qualityEmbargo?.level && qualityEmbargo.level !== "none" ? ` Quality embargo marked this pack as ${qualityEmbargo.level}.` : ""}${finalQualityFirewall?.level && finalQualityFirewall.level !== "none" ? ` Final quality firewall marked this pack as ${finalQualityFirewall.level}.` : ""}${packDefectSummary?.repeatedFamilies.length ? ` Repeated defects=${packDefectSummary.repeatedFamilies.slice(0, 3).join("+")}.` : ""}`
          : `Manual review is recommended before building the pack.${autoRerouteRecovered ? " Auto-reroute recovered the pack, but a human pass is still useful." : ""}${highRiskAutoSelection ? ` Selection gate marked this pack as ${selectionRisk?.level}.` : ""}${qualityEmbargo?.level && qualityEmbargo.level !== "none" ? ` Quality embargo marked this pack as ${qualityEmbargo.level}.` : ""}${finalQualityFirewall?.level && finalQualityFirewall.level !== "none" ? ` Final quality firewall marked this pack as ${finalQualityFirewall.level}.` : ""}${packDefectSummary?.repeatedFamilies.length ? ` Repeated defects=${packDefectSummary.repeatedFamilies.slice(0, 3).join("+")}.` : ""}`,
      priority: manifest.status === "PENDING_HITL" ? "high" : "medium",
      anchorId: "pick-candidates",
      reasonCodes: [
        `manifest:${manifest.status}`,
        ...(packCoherence ? [`coherence:${packCoherence.severity}`] : []),
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

function readCharacterPackLineage(characterPackId: string): CharacterPackLineage | null {
  const resolvedRoot = resolveGeneratedCharacterRoot(characterPackId);
  if (!resolvedRoot) {
    return null;
  }

  const manifestPath = path.join(resolvedRoot.characterRoot, "manifest.json");
  const packMetaPath = path.join(resolvedRoot.characterRoot, "pack", "character.pack.meta.json");
  const packJsonPath = path.join(resolvedRoot.characterRoot, "pack", "character.pack.json");
  const proposalPath = path.join(resolvedRoot.characterRoot, "pack", "proposal.json");
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
    viewEntries
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

  return `<section class="card"><h2>Local Workflow Samples</h2><div class="notice">DB가 없어도 여기서 직접 생성된 ComfyUI workflow JSON을 열 수 있습니다. <strong>workflow_gui.json</strong>을 다운로드해서 ComfyUI 캔버스에 드래그하면 노드 그래프가 보입니다.</div>${
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
    ...(parseOptionalNumber(value.warningCount) !== undefined ? { warningCount: parseOptionalNumber(value.warningCount) } : {}),
    ...(parseOptionalNumber(value.rejectionCount) !== undefined
      ? { rejectionCount: parseOptionalNumber(value.rejectionCount) }
      : {}),
    ...(parseRuntimeBucketLevel(value.runtimeBucket) ? { runtimeBucket: parseRuntimeBucketLevel(value.runtimeBucket) } : {})
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
    return `<section class="card"><h3>Generated Pack Lineage</h3><div class="error">No generated character artifact root was found for <strong>${escHtml(
      input.selectedPackId
    )}</strong>. This page only reads existing generated pack artifacts; it does not rerun generation.</div>${renderLineageLinks([
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

  return `<section class="card"><h3>Generated Pack Lineage</h3><p>Reads the generated character artifact tree directly so operators can inspect source image lineage, pack build inputs, and open repair tasks without rerunning generation.</p>${actionLinks}${summaryCards}<section class="card" style="margin-top:16px"><h4>View Lineage</h4><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">${viewCards || '<div class="notice">No view lineage entries.</div>'}</div></section><section class="card" style="margin-top:16px"><h4>Repair Tasks</h4>${
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

  const manifestPath = getGenerationManifestPath(sourceGenerateJob.id);
  const manifest = readGenerationManifest(manifestPath);
  if (!manifest) {
    throw createHttpError(404, `generation manifest not found: ${manifestPath}`);
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
      : path.resolve(path.dirname(manifestPath), candidate.filePath);
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
            manifestPath,
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
        manifestPath,
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
          manifestPath,
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
    manifestPath
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
    const manifest = readGenerationManifest(manifestPath);
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
    const compareHref =
      approvedPacks.length >= 2
        ? `/ui/character-generator/compare?leftPackId=${encodeURIComponent(approvedPacks[0].id)}&rightPackId=${encodeURIComponent(approvedPacks[1].id)}`
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
      charactersHref: "/ui/characters",
      generatorHref: "/ui/character-generator"
    };
    return reply
      .type("text/html; charset=utf-8")
      .send(uiPage("Studio", buildStudioBody({ message, error, styleOptions, speciesOptions, channelProfile, packState })));
  });

  app.get("/ui/character-generator", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
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
    const selectedSelectionRisk = selectedSelectionDiagnostics?.selectionRisk;
    const selectedQualityEmbargo = selectedSelectionDiagnostics?.qualityEmbargo;
    const selectedPackDefectSummary = selectedSelectionDiagnostics?.packDefectSummary;
    const selectedFinalQualityFirewall = selectedSelectionDiagnostics?.finalQualityFirewall;
    const selectedDecisionOutcome = selectedSelectionDiagnostics?.decisionOutcome;
    const selectedWorkflowStages =
      selectedManifest?.workflowStages ?? selectedSelectionDiagnostics?.workflowStages ?? [];
    const selectedContinuity = selectedManifest?.reference?.continuity;
    const selectedWorkflowRuntimeDiagnostics = resolveSelectedWorkflowRuntimeDiagnostics(selectedManifest);
    const selectedRecommendedActions = buildRecommendedActions(selectedManifest);
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
    const selectedCandidateSummarySection =
      selectedManifest && selectedSelectionDiagnostics?.selectedCandidateSummaryByView
        ? `<details class="card" style="margin-top:10px"><summary><strong>Selected Candidate Summary</strong></summary><div class="asset-table-wrap" style="margin-top:10px"><table><thead><tr><th>View</th><th>Candidate</th><th>RT</th><th>Score</th><th>Consistency</th><th>Warnings</th><th>Rejections</th></tr></thead><tbody>${(["front", "threeQuarter", "profile"] as const)
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
                  )}</td><td>${escHtml(summary.warningCount ?? "-")}</td><td>${escHtml(
                    summary.rejectionCount ?? "-"
                  )}</td></tr>`
                : `<tr><td>${escHtml(view)}</td><td colspan="6">-</td></tr>`;
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
        ? `<div class="asset-table-wrap" style="margin-top:10px"><table><thead><tr><th>View</th><th>Before</th><th>After</th><th>Score Δ</th><th>Consistency Δ</th><th>Warnings Δ</th><th>Rejections Δ</th></tr></thead><tbody>${(["front", "threeQuarter", "profile"] as const)
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
        ? `<details class="card" style="margin-top:10px"><summary><strong>${escHtml(view)}</strong> candidate details</summary><div class="asset-table-wrap" style="margin-top:10px"><table><thead><tr><th>Candidate</th><th>Score</th><th>Consistency</th><th>Profile</th><th>Run</th><th>Post</th><th>Adapter</th><th>Workflow</th></tr></thead><tbody>${cards}</tbody></table></div></details>`
        : "";
    };

    const selectedSection = selectedJob
      ? `<section class="card"><h2>Selected Generation Job</h2><p>jobId: <strong>${escHtml(selectedJob.id)}</strong></p><p>status: <span class="badge ${uiBadge(
          selectedJob.status
        )}">${escHtml(selectedJob.status)}</span> / progress: ${escHtml(selectedJob.progress)}%</p><p>episode: ${
          selectedJob.episode
            ? `<a href="/ui/episodes/${escHtml(selectedJob.episode.id)}">${escHtml(selectedJob.episode.id)}</a> (${escHtml(
                selectedJob.episode.topic ?? "-"
              )})`
            : "-"
        }</p>${
          selectedManifest
            ? `<div class="notice">preset=${escHtml(selectedManifest.promptPreset)} / qualityProfile=${escHtml(
                selectedManifest.qualityProfileId ?? selectedManifest.qualityProfile?.id ?? "-"
              )} / provider=${escHtml(selectedManifest.provider)}</div><div class="grid two"><div><p>workflowHash: <code>${escHtml(
              selectedManifest.workflowHash
              )}</code></p><p>generatedAt: ${escHtml(selectedManifest.generatedAt || "-")}</p><p>templateVersion=${escHtml(
                selectedManifest.templateVersion ?? selectedManifest.providerMeta?.workflowTemplateVersion ?? "-"
              )} / workflowStage=${escHtml(selectedManifest.providerMeta?.workflowStage ?? "-")}</p><p>selection: minScore=${escHtml(
                typeof selectedManifest.selectionHints?.minAcceptedScore === "number"
                  ? selectedManifest.selectionHints.minAcceptedScore.toFixed(2)
                  : "-"
              )} / frontMinScore=${escHtml(
                typeof selectedManifest.selectionHints?.frontMasterMinAcceptedScore === "number"
                  ? selectedManifest.selectionHints.frontMasterMinAcceptedScore.toFixed(2)
                  : "-"
              )} / retries=${escHtml(
                selectedManifest.selectionHints?.autoRetryRounds ?? "-"
              )} / frontCandidates=${escHtml(
                selectedManifest.selectionHints?.frontMasterCandidateCount ?? "-"
              )} / repairCandidates=${escHtml(
                selectedManifest.selectionHints?.repairCandidateCount ?? "-"
              )} / repairFloor=${escHtml(
                typeof selectedManifest.selectionHints?.repairScoreFloor === "number"
                  ? selectedManifest.selectionHints.repairScoreFloor.toFixed(2)
                  : "-"
              )} / sequentialReference=${escHtml(
                selectedManifest.selectionHints?.sequentialReference ?? "-"
              )} / preferMultiReference=${escHtml(
                selectedManifest.selectionHints?.preferMultiReference ?? "-"
              )}</p></div><div><p>run: sampler=${escHtml(runSettings?.sampler ?? "-")} / scheduler=${escHtml(
                runSettings?.scheduler ?? "-"
              )} / steps=${escHtml(runSettings?.steps ?? "-")} / cfg=${escHtml(
                runSettings?.cfg ?? "-"
              )}</p><p>resolution=${escHtml(runSettings?.width ?? "-")}x${escHtml(
                runSettings?.height ?? "-"
              )}</p><p>postprocess=${escHtml(
                Array.isArray(selectedManifest.qualityProfile?.postprocessPlan) &&
                  selectedManifest.qualityProfile.postprocessPlan.length > 0
                  ? selectedManifest.qualityProfile.postprocessPlan.join(", ")
                  : "none"
              )}</p><p>selectionSource=${escHtml(
                selectedSelectionDiagnostics?.finalSelectionSource ?? "-"
              )} / stageCount=${escHtml(selectedWorkflowStages.length)} / runtime=${escHtml(
                summarizeSelectedWorkflowRuntimeDiagnostics(selectedWorkflowRuntimeDiagnostics)
              )}</p></div></div>${selectedReferenceSection}${selectedWorkflowRuntimeSection}${selectedPackCoherenceSection}${selectedDecisionOutcomeSection}${selectedFinalQualityFirewallSection}${selectedQualityEmbargoSection}${selectedPackDefectSummarySection}${selectedSelectionRiskSection}${selectedAutoRerouteSection}${selectedCandidateSummarySection}${selectedViewDecisionMatrixSection}${selectedWorkflowStageSection}${
                workflowArtifactRows.length > 0
                  ? `<div class="asset-table-wrap"><table><thead><tr><th>View</th><th>Candidate</th><th>Workflow Exports</th></tr></thead><tbody>${workflowArtifactRows
                      .map(
                        ({ candidate, workflowFiles }) =>
                          `<tr><td>${escHtml(candidate.view)}</td><td>${escHtml(candidate.id)}</td><td>${renderArtifactLink(
                            "api",
                            workflowFiles?.apiPromptPath
                          )} | ${renderArtifactLink("summary", workflowFiles?.summaryPath)}${
                            workflowFiles?.guiWorkflowPath
                              ? ` | ${renderArtifactLink("gui", workflowFiles.guiWorkflowPath)}`
                              : ""
                          }</td></tr>`
                      )
                      .join("")}</tbody></table></div>`
                  : `<div class="notice">No workflow export files were found in this manifest yet.</div>`
              }`
            : `<div class="notice">Manifest not available yet for this job.</div>`
        }<div id="generation-status" class="notice" data-job-id="${escHtml(selectedJob.id)}">Polling latest status...</div><div class="actions"><button id="generation-retry" type="button" class="secondary" style="display:none">Retry now</button></div></section>`
      : `<section class="card"><h2>Selected Generation Job</h2><div class="notice">Select a job from the list below.</div></section>`;

    const recommendedActionsSection =
      selectedJob && selectedManifest
        ? `<section class="card" id="recommended-actions"><h2>Recommended Next Actions</h2>${
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
          }${
            selectedRecommendedActions.length > 0
              ? `<div class="grid">${
                  selectedRecommendedActions
                    .map((action) => {
                      const reasonSummary = action.reasonCodes.length > 0 ? action.reasonCodes.join(", ") : "-";
                      const controls =
                        action.action === "regenerate-view" && action.view
                          ? `<form method="post" action="/ui/character-generator/regenerate-view" class="inline"><input type="hidden" name="generateJobId" value="${escHtml(
                              selectedJob.id
                            )}"/><input type="hidden" name="viewToGenerate" value="${escHtml(
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
                              )}"/><input type="hidden" name="candidateCount" value="${escHtml(
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
                      return `<div class="card"><p><span class="badge ${recommendedPriorityBadge(
                        action.priority
                      )}">${escHtml(action.priority)}</span> ${escHtml(action.label)}</p><p>${escHtml(
                        action.description
                      )}</p><p>reasons: ${escHtml(reasonSummary)}</p><div class="actions">${controls}</div></div>`;
                    })
                    .join("")
                }</div>`
              : `<div class="notice">No immediate follow-up action is recommended for this job.</div>`
          }</section>`
        : `<section class="card"><h2>Recommended Next Actions</h2><div class="notice">Select a generation job to see targeted regenerate/recreate suggestions.</div></section>`;

    const regenerateSection = selectedJob
      ? `<section class="card" id="regenerate-view"><h2>Regenerate View</h2><form method="post" action="/ui/character-generator/regenerate-view" class="grid two"><input type="hidden" name="generateJobId" value="${escHtml(
          selectedJob.id
        )}"/><label>View<select name="viewToGenerate"><option value="front">front</option><option value="threeQuarter">threeQuarter</option><option value="profile">profile</option></select></label><label>Candidate Count<input name="candidateCount" value="4"/></label><label>Seed<input name="seed" value="${DEFAULT_GENERATION_SEED}"/></label><label><input type="checkbox" name="regenerateSameSeed" value="true" checked/> Regenerate with same seed</label><label><input type="checkbox" name="boostNegativePrompt" value="true"/> Strengthen negative prompt</label><div class="actions" style="grid-column:1/-1"><button type="submit">Run View Regeneration</button></div></form></section>`
      : "";

    const recreateSection = selectedJob
      ? `<section class="card" id="recreate-pack"><h2>Recreate Full Pack</h2><form method="post" action="/ui/character-generator/recreate" class="grid two"><input type="hidden" name="generateJobId" value="${escHtml(
          selectedJob.id
        )}"/><label>Candidate Count<input name="candidateCount" value="6"/></label><label>Seed<input name="seed" value="${DEFAULT_GENERATION_SEED}"/></label><label><input type="checkbox" name="regenerateSameSeed" value="true"/> Recreate with same seed</label><label><input type="checkbox" name="boostNegativePrompt" value="true"/> Strengthen negative prompt</label><div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">Run Full Pack Recreation</button></div></form></section>`
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
            return `<section class="card" id="pick-candidates"><h2>Pick Candidates (HITL)</h2>${
              pickBlocked
                ? `<div class="notice">Direct pick is blocked because the selected pack still fails the final gate. Use regenerate/recreate first, or replace blocked views.</div>`
                : ""
            }<form method="post" action="/ui/character-generator/pick" class="grid two"><input type="hidden" name="generateJobId" value="${escHtml(
            selectedJob.id
          )}"/><label>Front Candidate<select name="frontCandidateId">${candidateOptions("front")}</select></label><label>ThreeQuarter Candidate<select name="threeQuarterCandidateId">${candidateOptions(
            "threeQuarter"
          )}</select></label><label>Profile Candidate<select name="profileCandidateId">${candidateOptions(
            "profile"
          )}</select></label><div class="actions" style="grid-column:1/-1"><button type="submit"${pickBlocked ? " disabled" : ""}>Apply HITL Selection + Build Pack</button></div></form>${candidateCardsForView(
            "front"
          )}${candidateCardsForView("threeQuarter")}${candidateCardsForView("profile")}</section>`;
          })()
        : `<section class="card"><h2>Pick Candidates (HITL)</h2><div class="notice">A selected generation job is required.</div></section>`;

    const previewSection =
      selectedManifest && selectedManifest.characterPackId
        ? (() => {
            const artifacts = getCharacterArtifacts(selectedManifest.characterPackId);
            const previewExists = fs.existsSync(artifacts.previewPath);
            const qcExists = fs.existsSync(artifacts.qcReportPath);
            return `<section class="card"><h2>Selected Pack Preview</h2><p>characterPackId: <a href="/ui/characters?characterPackId=${encodeURIComponent(
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
            }<form method="post" action="/ui/character-generator/set-active" class="inline"><input type="hidden" name="characterPackId" value="${escHtml(
              selectedManifest.characterPackId
            )}"/><button type="submit" class="secondary">Set Pack Active</button></form></section>`;
          })()
        : "";

    const rollbackSection =
      approvedPacks.length > 0
        ? `<section class="card"><h2>Rollback Active Pack</h2><form method="post" action="/ui/character-generator/rollback-active" class="grid two"><label>Target Pack<select name="targetCharacterPackId">${approvedPacks
            .map(
              (pack) =>
                `<option value="${escHtml(pack.id)}">${escHtml(pack.id)} (v${escHtml(pack.version)}, ${escHtml(pack.status)})</option>`
            )
            .join("")}</select></label><div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">Rollback Active Pack</button></div></form></section>`
        : `<section class="card"><h2>Rollback Active Pack</h2><div class="notice">No approved packs available.</div></section>`;

    const compareSection =
      approvedPacks.length >= 2
        ? `<section class="card"><h2>Compare Approved Packs</h2><form method="get" action="/ui/character-generator/compare" class="grid two"><label>Left Pack<select name="leftPackId">${approvedPacks
            .map((pack) => `<option value="${escHtml(pack.id)}">${escHtml(pack.id)} (v${escHtml(pack.version)})</option>`)
            .join("")}</select></label><label>Right Pack<select name="rightPackId">${approvedPacks
            .map((pack, index) => `<option value="${escHtml(pack.id)}"${index === 1 ? " selected" : ""}>${escHtml(
              pack.id
            )} (v${escHtml(pack.version)})</option>`)
            .join("")}</select></label><div class="actions" style="grid-column:1/-1"><button type="submit" class="secondary">Open A/B Compare</button></div></form></section>`
        : `<section class="card"><h2>Compare Approved Packs</h2><div class="notice">At least two approved packs are required.</div></section>`;

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
      recommendedActionsSection,
      regenerateSection,
      recreateSection,
      pickSection,
      previewSection,
      rollbackSection,
      compareSection,
      rows,
      statusScript: selectedJob ? buildCharacterGeneratorStatusScript() : ""
    });

    return reply.type("text/html; charset=utf-8").send(uiPage("Character Generator", body));
  });

  app.post("/ui/character-generator/create", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};

    try {
      const generation = parseCharacterGenerationInput(body);
      const channelId = optionalString(body, "channelId");
      const created = await createCharacterGeneration(prisma, queue, queueName, {
        ...(channelId ? { channelId } : {}),
        generation
      });

      return reply.redirect(
        `/ui/character-generator?jobId=${encodeURIComponent(created.generateJobId)}&message=${encodeURIComponent(
          created.reusedExisting
            ? `Reused active generation job: ${created.generateJobId} (episode ${created.episodeId})`
            : `${GENERATE_CHARACTER_ASSETS_JOB_NAME} queued successfully (episode ${created.episodeId})`
        )}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.post("/ui/character-generator/pick", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
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
        `/ui/character-generator?jobId=${encodeURIComponent(created.generateJobId)}&message=${encodeURIComponent(
          "HITL selection applied. BUILD_CHARACTER_PACK has been queued."
        )}`
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.post("/ui/character-generator/regenerate-view", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
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
        `/ui/character-generator?jobId=${encodeURIComponent(created.generateJobId)}&message=${encodeURIComponent(
          `View regeneration queued: ${created.view} (${regenerateSameSeed ? "same seed" : "new seed"})`
        )}`
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.post("/ui/character-generator/recreate", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
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
        `/ui/character-generator?jobId=${encodeURIComponent(created.generateJobId)}&message=${encodeURIComponent(
          `Full pack recreation queued (${regenerateSameSeed ? "same seed" : "new seed"}, seed=${created.seed})`
        )}`
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.post("/ui/character-generator/set-active", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
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
        `/ui/character-generator?message=${encodeURIComponent(`Character pack ${characterPackId} is now active with APPROVED status.`)}`
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.post("/ui/character-generator/rollback-active", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};
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
        `/ui/character-generator?message=${encodeURIComponent(`Active pack rollback complete: ${targetCharacterPackId}`)}`
      );
    } catch (routeError) {
      const message = routeError instanceof Error ? routeError.message : String(routeError);
      return reply.redirect(`/ui/character-generator?error=${encodeURIComponent(message)}`);
    }
  });

  app.get("/ui/character-generator/compare", async (request, reply) => {
    const query = isRecord(request.query) ? request.query : {};
    const leftPackId = optionalString(query, "leftPackId");
    const rightPackId = optionalString(query, "rightPackId");
    if (!leftPackId || !rightPackId) {
      throw createHttpError(400, "leftPackId and rightPackId are required");
    }

    const [leftPack, rightPack] = await Promise.all([
      prisma.characterPack.findUnique({
        where: { id: leftPackId },
        select: {
          id: true,
          version: true,
          status: true
        }
      }),
      prisma.characterPack.findUnique({
        where: { id: rightPackId },
        select: {
          id: true,
          version: true,
          status: true
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

    const panel = (
      side: "A" | "B",
      pack: { id: string; version: number; status: string },
      previewExists: boolean,
      qcExists: boolean
    ) => `<section class="card"><h2>${escHtml(side)}: ${escHtml(pack.id)}</h2><p>version: <strong>${escHtml(
      pack.version
    )}</strong></p><p>status: <span class="badge ${uiBadge(pack.status)}">${escHtml(pack.status)}</span></p>${
      previewExists
        ? `<video controls preload="metadata" style="width:100%;max-width:560px;background:#000;border-radius:8px"><source src="/artifacts/characters/${encodeURIComponent(
            pack.id
          )}/preview.mp4" type="video/mp4"/></video>`
        : `<div class="error">preview.mp4 missing</div>`
    }<p><a href="/artifacts/characters/${encodeURIComponent(pack.id)}/pack.json">pack.json</a></p><p><a href="/artifacts/characters/${encodeURIComponent(
      pack.id
    )}/preview.mp4">preview.mp4</a></p><p><a href="/artifacts/characters/${encodeURIComponent(
      pack.id
    )}/qc_report.json">qc_report.json</a> ${qcExists ? "(exists)" : "(missing)"}</p></section>`;

    const html = `<section class="card"><h1>Character Pack A/B Compare</h1><p><a href="/ui/character-generator">Back to Character Generator</a></p><div class="grid two">${panel(
      "A",
      leftPack,
      leftPreviewExists,
      leftQcExists
    )}${panel("B", rightPack, rightPreviewExists, rightQcExists)}</div></section>`;
    return reply.type("text/html; charset=utf-8").send(uiPage("\uCE90\uB9AD\uD130 \uD329 \uBE44\uAD50", html));
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
        return `<tr><td><a href="/ui/characters?characterPackId=${encodeURIComponent(pack.id)}">${escHtml(
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
        ? `/ui/character-generator/compare?leftPackId=${encodeURIComponent(selectedPack.id)}&rightPackId=${encodeURIComponent(
            activePack.id
          )}`
        : null;
    const selectedLineageSection = selectedPack
      ? buildCharacterPackLineageSection({
          lineage: selectedGeneratedLineage,
          selectedPackId: selectedPack.id,
          activePackId: activePack?.id ?? null,
          compareHref
        })
      : "";

    const selectedSection = selectedPack
      ? `<section class="card"><h2>Selected Pack</h2><p>id: <strong>${escHtml(selectedPack.id)}</strong></p><p>version: <strong>${escHtml(
          selectedPack.version
        )}</strong></p><p>status: <span class="badge ${uiBadge(selectedPack.status)}">${escHtml(
          selectedPack.status
        )}</span></p><div class="grid two"><div><p><a href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/pack.json">pack.json</a> ${
          selectedArtifacts && fs.existsSync(selectedArtifacts.packJsonPath) ? "(exists)" : "(missing)"
        }</p><p><a href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/preview.mp4">preview.mp4</a> ${
          selectedArtifacts && fs.existsSync(selectedArtifacts.previewPath) ? "(exists)" : "(missing)"
        }</p><p><a href="/artifacts/characters/${encodeURIComponent(
          selectedPack.id
        )}/qc_report.json">qc_report.json</a> ${
          selectedArtifacts && fs.existsSync(selectedArtifacts.qcReportPath) ? "(exists)" : "(missing)"
        }</p></div><div><p>episode: ${
          selectedPack.episodes[0]
            ? `<a href="/ui/episodes/${escHtml(selectedPack.episodes[0].id)}">${escHtml(selectedPack.episodes[0].id)}</a>`
            : "-"
        }</p></div></div>${
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
        }${selectedLineageSection}<details><summary>View pack.json</summary><pre>${escHtml(
          JSON.stringify(selectedPack.json, null, 2)
        )}</pre></details></section><section class="card"><h2>Selected Pack Jobs</h2><table><thead><tr><th>Job</th><th>Type</th><th>Status</th><th>Progress</th><th>Created At</th></tr></thead><tbody>${
          selectedJobs || '<tr><td colspan="5">No jobs</td></tr>'
        }</tbody></table></section>`
      : "";

    const html = `<section class="card"><h1>\uCE90\uB9AD\uD130 \uD329 (\uC0C1\uC138 \uBAA8\uB4DC)</h1><div class="notice">For fast flow, use <a href="/ui/studio">Studio</a>. This page is for manual pack inspection and creation.</div>${
      message ? `<div class="notice">${escHtml(message)}</div>` : ""
    }${error ? `<div class="error">${escHtml(error)}</div>` : ""}<form method="post" action="/ui/characters/create" class="grid"><div class="grid two"><label>Front Asset<select name="front" required>${
      assetOptions || '<option value="">No READY assets available</option>'
    }</select></label><label>ThreeQuarter Asset<select name="threeQuarter" required>${
      assetOptions || '<option value="">No READY assets available</option>'
    }</select></label><label>Profile Asset<select name="profile" required>${
      assetOptions || '<option value="">No READY assets available</option>'
    }</select></label><label>Topic (optional)<input name="topic" placeholder="character preview"/></label></div><button type="submit">Create character pack + enqueue preview</button></form></section>${selectedSection}<section class="card"><h2>\uCD5C\uADFC \uCE90\uB9AD\uD130 \uD329</h2><table><thead><tr><th>ID</th><th>Version</th><th>Status</th><th>Episode</th><th>Preview</th><th>Created At</th></tr></thead><tbody>${
      packRows || '<tr><td colspan="6">No character packs</td></tr>'
    }</tbody></table></section>`;
    return reply.type("text/html; charset=utf-8").send(uiPage("\uCE90\uB9AD\uD130 \uD329", html));
  });

  app.post("/ui/characters/create", async (request, reply) => {
    const body = isRecord(request.body) ? request.body : {};

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
        `/ui/characters?characterPackId=${encodeURIComponent(created.characterPackId)}&message=${encodeURIComponent(
          `Character pack created: ${created.characterPackId} / ${BUILD_CHARACTER_PACK_JOB_NAME} queued`
        )}`
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

      return reply.redirect(`/ui/characters?error=${encodeURIComponent(message)}`);
    }
  });
}
