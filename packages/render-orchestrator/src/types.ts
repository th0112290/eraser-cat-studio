import type { Shot, ShotsDocument } from "@ec/story";

import type {
  ShotCanonicalVisualObjectKind,
  ShotChannelDomain,
  ShotEducationalIntent,
  ShotEducationalMode,
  ShotGrammar,
  ShotInsertNeed,
  ShotRouteReason,
  ShotVisualObject,
  ShotVisualPlan
} from "@ec/story";

export type RenderSafeArea = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type RenderPreset = {
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
  codec: "h264";
  x264Preset:
    | "ultrafast"
    | "superfast"
    | "veryfast"
    | "faster"
    | "fast"
    | "medium"
    | "slow"
    | "slower"
    | "veryslow"
    | "placebo";
  safeArea: RenderSafeArea;
};

export type ChartDataRow = {
  label: string;
  value: number;
  unit?: string;
};

export type RenderQcDataset = {
  rows: ChartDataRow[];
  expectedSum?: number;
  unit?: string;
  sumTolerance?: number;
};

export type RenderQcInput = {
  dataset?: RenderQcDataset;
  minFontSizePx?: number;
  pointerTolerancePx?: number;
  expectOcclusion?: boolean;
};

export type RenderableShot = Shot & {
  narration?: string;
  emphasisWords?: string[];
  emphasis_words?: string[];
  transition?: string;
};

export type RenderableShotsDocument = Omit<ShotsDocument, "shots"> & {
  shots: RenderableShot[];
};

export type DeterministicCameraKeyframe = {
  f: number;
  x: number;
  y: number;
  zoom: number;
  rotateDeg: number;
};

export type DeterministicChartHighlight = {
  f: number;
  targetId: string;
  styleToken: string;
};

export type DeterministicVisualObjectKind = ShotCanonicalVisualObjectKind;

export type DeterministicVisualObject = {
  objectId: string;
  kind: DeterministicVisualObjectKind;
  semanticRole: ShotVisualObject["semantic_role"];
  title?: string;
  body?: string;
  items?: string[];
  dataRef?: {
    chartId?: string;
    datasetId?: string;
    timeRange?: string;
  };
  selectionReason?: string;
};

export type DeterministicVisualPlan = {
  resolverId: ShotVisualPlan["resolver_id"];
  channelDomain: ShotChannelDomain;
  educationalMode: ShotEducationalMode;
  selectedPrimaryKind: DeterministicVisualObjectKind;
  selectionReason: string;
};

export type RenderLayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DeterministicFinishTone = "studio_balanced" | "economy_crisp" | "medical_soft";

export type DeterministicTextureMatch = "deterministic_clean" | "balanced_soft" | "sidecar_matched";

export type DeterministicFinishProfile = {
  tone: DeterministicFinishTone;
  textureMatch: DeterministicTextureMatch;
  brightness: number;
  contrast: number;
  saturation: number;
  lineSharpenStrength: number;
  bloomOpacity: number;
  grainOpacity: number;
  vignetteOpacity: number;
  tintOpacity: number;
  tintGradient: string;
};

export type DeterministicLayoutBias = "balanced" | "data_dense" | "guided_soft";

export type DeterministicActingBias = "analytic_presenter" | "warm_guide" | "neutral_presenter";

export type DeterministicPointerBias = "chart_precise" | "soft_visual" | "guided_callout";

export type DeterministicProfileBundle = {
  resolverId: string;
  resolverSource: "local_seam" | "injected" | "profiles_package";
  studioProfileId: string;
  channelProfileId: string;
  mascotProfileId: string;
  layoutBias: DeterministicLayoutBias;
  actingBias: DeterministicActingBias;
  pointerBias: DeterministicPointerBias;
  finishBias: DeterministicFinishTone;
};

export type DeterministicProfileResolverInput = {
  channelDomain: string | undefined;
  mascotId: string | undefined;
  hasChart: boolean;
  primaryVisualKind: DeterministicVisualObjectKind | undefined;
  insertNeed: ShotInsertNeed;
};

export type DeterministicProfileResolution = {
  profileBundle: DeterministicProfileBundle;
  finishProfile: DeterministicFinishProfile;
};

export type DeterministicProfileResolver = (
  input: DeterministicProfileResolverInput
) => DeterministicProfileResolution;

export type DeterministicCharacterTracks = {
  posPath: Array<{
    f: number;
    x: number;
    y: number;
    interp: "linear" | "ease" | "spring";
  }>;
  actionTrack: Array<{
    f: number;
    clip: string;
    weight: number;
  }>;
  expressionTrack: Array<{
    f: number;
    expression: string;
  }>;
  lookTrack: Array<{
    f: number;
    target: string;
  }>;
  pointTrack?: Array<{
    f: number;
    targetId: string;
    hand: "left" | "right";
  }>;
};

export type DeterministicSequence = {
  shotId: string;
  from: number;
  duration: number;
  setId: string;
  cameraPreset: string;
  shotGrammar: ShotGrammar;
  routeReason: ShotRouteReason;
  educationalIntent: ShotEducationalIntent;
  insertNeed: ShotInsertNeed;
  narration: string;
  emphasisWords: string[];
  talkText?: string;
  chartData: ChartDataRow[];
  visualMode: "chart" | "table";
  primaryVisualKind?: DeterministicVisualObjectKind;
  visualObjects?: DeterministicVisualObject[];
  visualPlan?: DeterministicVisualPlan;
  profileBundle?: DeterministicProfileBundle;
  finishProfile?: DeterministicFinishProfile;
  visualBox?: RenderLayoutBox;
  narrationBox?: RenderLayoutBox;
  mascotBlockingBox?: RenderLayoutBox;
  pointerReachableZone?: RenderLayoutBox;
  annotationsEnabled: boolean;
  pointerTargetIndex: number;
  pointerEnabled: boolean;
  freezePose: boolean;
  expectOcclusion: boolean;
  pointerTip?: {
    x: number;
    y: number;
  };
  unit?: string;
  hasChart: boolean;
  chartCallout?: string;
  characterPackId: string;
  mascotId?: string;
  characterX: number;
  characterY: number;
  cameraKeyframes: DeterministicCameraKeyframe[];
  chartHighlights: DeterministicChartHighlight[];
  characterTracks: DeterministicCharacterTracks;
  transitionHint?: string;
};

export type SubtitleCue = {
  index: number;
  startFrame: number;
  endFrame: number;
  text: string;
};

export type AlignmentHook = (cue: SubtitleCue) => { startFrame: number; endFrame: number } | null;

export type EpisodeRenderProps = {
  episodeId: string;
  safeArea: RenderSafeArea;
  freezeCharacterPose: boolean;
  sequences: DeterministicSequence[];
  subtitles: SubtitleCue[];
  debugOverlay?: RenderDebugOverlay;
};

export type VisualQcSeverity = "INFO" | "WARN" | "ERROR";

export type VisualQcCheck = {
  name: string;
  passed: boolean;
  severity: "WARN" | "ERROR";
  details: string;
};

export type VisualQcIssue = {
  code: string;
  severity: VisualQcSeverity;
  message: string;
  shotId?: string;
  details?: Record<string, unknown>;
};

export type VisualQcRun = {
  stage: string;
  checks: VisualQcCheck[];
  issues: VisualQcIssue[];
  passed: boolean;
  errorCount: number;
  warnCount: number;
};

export type VisualQcReport = {
  schema_version: "1.0";
  generated_at: string;
  final_passed: boolean;
  final_stage: string;
  fallback_steps_applied: string[];
  runs: VisualQcRun[];
};

export type RenderBenchmarkSignal = {
  scope: string;
  target?: string;
  status: string;
  score?: number;
  verdict?: string;
  reason?: string;
  sourceLabel?: string;
  generatedAt?: string;
  artifactPath?: string;
};

export type RenderQcSummary = {
  status: "passed" | "warn" | "failed";
  errorCount: number;
  warningCount: number;
  fallbackStepsApplied: string[];
  finalIssues: Array<{
    code: string;
    severity: VisualQcSeverity;
    message: string;
    shotId?: string;
  }>;
};

export type RenderProfileResolverSummary = {
  resolverIds: string[];
  resolverSources: Array<DeterministicProfileBundle["resolverSource"]>;
  resolverModulePaths: string[];
  studioProfileIds: string[];
  channelProfileIds: string[];
  mascotProfileIds: string[];
};

export type RenderDebugOverlay = {
  enabled: boolean;
  sourceLabel?: string;
  qc: RenderQcSummary;
  profileResolver?: RenderProfileResolverSummary;
  benchmarks: RenderBenchmarkSignal[];
};

export type RenderDebugOverlayInput = {
  enabled?: boolean;
  sourceLabel?: string;
  benchmarks?: RenderBenchmarkSignal[];
};

export type OrchestrateRenderInput = {
  shotsPath?: string;
  outputPath?: string;
  srtPath?: string;
  qcReportPath?: string;
  renderLogPath?: string;
  compositionId?: string;
  preset?: Partial<RenderPreset>;
  attempt?: number;
  maxAttempts?: number;
  dryRun?: boolean;
  qc?: RenderQcInput;
  debugOverlay?: RenderDebugOverlayInput;
  alignmentHook?: AlignmentHook;
  profileResolver?: DeterministicProfileResolver;
  profileResolverModulePath?: string;
  profileResolverWorkspaceRoot?: string;
};

export type OrchestrateRenderResult = {
  outputPath: string;
  srtPath: string;
  qcReportPath: string;
  renderLogPath: string;
  propsPath: string;
  profileResolver?: RenderProfileResolverSummary;
  sequenceCount: number;
  subtitleCount: number;
  totalFrames: number;
  qcPassed: boolean;
  fallbackStepsApplied: string[];
  qcErrorCount: number;
  qcWarningCount: number;
  qcFinalIssues: VisualQcIssue[];
  status: "SUCCEEDED";
};
