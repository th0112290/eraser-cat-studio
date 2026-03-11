import type {
  ResolvedProfiles,
  SidecarControlNetPresetId,
  SidecarImpactPresetId,
  SidecarQcPresetId
} from "@ec/profiles";
import type {
  Shot,
  ShotRenderMode,
  ShotType,
  ShotVisualAnchor,
  ShotVisualIntentFamily,
  ShotVisualMotionProfileId,
  ShotVisualMotionPreset,
  ShotVisualObjectKind,
  ShotVisualPlan,
  ShotVisualSelection,
  ShotVisualSafeArea,
  ShotsDocument
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
  talkText?: string;
  talk_text?: string;
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

export type DeterministicInsertAsset = {
  assetId: string;
  type: "chart" | "board" | "caption_card" | "callout_card" | "diagram" | "icon_explainer" | "caution_card";
  layout: "lower_third" | "sidebar";
  title: string;
  body: string;
  accentToken: "economy" | "medical" | "neutral";
  items?: string[];
  selection?: {
    resolver_id: "visual_object_resolver_v1" | "visual_object_planner_v2";
    selected_insert_type: "chart" | "board" | "caption_card" | "callout_card" | "diagram" | "icon_explainer" | "caution_card";
    candidate_insert_types: Array<
      "chart" | "board" | "caption_card" | "callout_card" | "diagram" | "icon_explainer" | "caution_card"
    >;
    supporting_kind: ShotVisualObjectKind;
    educational_mode: string;
    channel_domain: "economy" | "medical";
    selection_reason: string;
  };
};

export type DeterministicLayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DeterministicPointerReachability = {
  reachable: boolean;
  reason: string;
  mascotToTargetDistancePx: number | null;
  targetPoint?: {
    x: number;
    y: number;
  };
};

export type DeterministicVisualObject = {
  objectId: string;
  kind: ShotVisualObjectKind;
  source: "legacy_chart_v1" | "legacy_insert_v1" | "planner_v2";
  semanticRole: "primary_explainer" | "supporting_explainer" | "accent";
  preferredRegion: "main_left" | "main_right" | "center_stage" | "sidebar" | "lower_third";
  safeZoneTags: Array<
    "subtitle_safe" | "chart_safe" | "mascot_blocking" | "pointer_reachable" | "negative_space_preserve"
  >;
  animationPolicy: "hold" | "emphasis_pulse" | "presenter_guided";
  motionPreset?: ShotVisualMotionPreset;
  motionProfileId?: ShotVisualMotionProfileId;
  fallbackPolicy: "fallback_to_table" | "fallback_to_summary_card" | "hide_optional";
  title?: string;
  body?: string;
  accentToken?: "economy" | "medical" | "neutral";
  items?: string[];
  pointerTargetIds?: string[];
  anchors?: ShotVisualAnchor[];
  safeArea?: ShotVisualSafeArea;
  selection?: ShotVisualSelection;
  dataRef?: {
    chartId?: string;
    datasetId?: string;
    timeRange?: string;
    layoutHint?: string;
  };
};

export type DeterministicLayoutPlan = {
  subtitleSafeZone: DeterministicLayoutRect;
  narrationBox: DeterministicLayoutRect;
  primaryVisualBox: DeterministicLayoutRect;
  chartSafeZone?: DeterministicLayoutRect;
  mascotBlockingZone: DeterministicLayoutRect;
  insertBox?: DeterministicLayoutRect;
  negativeSpaceBox?: DeterministicLayoutRect;
  occluderBox?: DeterministicLayoutRect;
  pointerReachability: DeterministicPointerReachability;
};

export type DeterministicFinishProfile = {
  id: string;
  grainOpacity: number;
  scanlineOpacity: number;
  vignetteOpacity: number;
  tintOpacity: number;
  bloomOpacity: number;
  sharpenOpacity: number;
  toneOverlayOpacity: number;
  toneOverlayColor: string;
  textureMatchOpacity: number;
  paletteContinuityOpacity: number;
  linePreserveOpacity: number;
  renderPathCompensation: "deterministic" | "sidecar_wan" | "sidecar_hunyuan";
  episodeFinishProfileId?: string;
};

export type EpisodeFinishProfile = {
  id: string;
  targetGrainOpacity: number;
  targetScanlineOpacity: number;
  targetVignetteOpacity: number;
  targetTintOpacity: number;
  targetBloomOpacity: number;
  targetSharpenOpacity: number;
  targetToneOverlayOpacity: number;
  targetToneOverlayColor: string;
  textureMatchOpacity: number;
  paletteContinuityOpacity: number;
  linePreserveOpacity: number;
};

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
  viewTrack?: Array<{
    f: number;
    view: "front" | "threeQuarter" | "profile";
  }>;
  visemeTrack?: Array<{
    f: number;
    viseme: "mouth_closed" | "mouth_open_small" | "mouth_open_wide" | "mouth_round_o";
    intensity: number;
  }>;
  pointTrack?: Array<{
    f: number;
    targetId: string;
    hand: "left" | "right";
  }>;
};

export type DeterministicSequenceAlignmentViseme =
  | "mouth_closed"
  | "mouth_open_small"
  | "mouth_open_wide"
  | "mouth_round_o";

export type DeterministicSequenceAlignmentWord = {
  text: string;
  startSec: number;
  endSec: number;
  localStartSec: number;
  localEndSec: number;
  viseme: DeterministicSequenceAlignmentViseme;
  intensity: number;
  emphasis: boolean;
};

export type DeterministicSequenceAlignmentVisemeCue = {
  localTimeSec: number;
  viseme: DeterministicSequenceAlignmentViseme;
  intensity: number;
};

export type DeterministicSequenceAlignmentPauseStrength = "micro" | "phrase" | "sentence";

export type DeterministicSequenceAlignmentPause = {
  startSec: number;
  endSec: number;
  localStartSec: number;
  localEndSec: number;
  durationSec: number;
  strength: DeterministicSequenceAlignmentPauseStrength;
};

export type DeterministicSequenceAlignment = {
  shotId: string;
  provider: string;
  version?: string;
  sourceKind: "heuristic" | "provider";
  words: DeterministicSequenceAlignmentWord[];
  visemeCues: DeterministicSequenceAlignmentVisemeCue[];
  pauseMap: DeterministicSequenceAlignmentPause[];
  emphasisWords: string[];
};

export type DeterministicSequence = {
  shotId: string;
  shotType: ShotType;
  renderMode: ShotRenderMode;
  characterPackId: string;
  sidecarVideoSrc?: string;
  from: number;
  duration: number;
  setId: string;
  cameraPreset: string;
  narration: string;
  emphasisWords: string[];
  talkText?: string;
  chartData: ChartDataRow[];
  visualMode: "chart" | "table";
  primaryVisualKind?: ShotVisualObjectKind;
  visualObjects?: DeterministicVisualObject[];
  layoutPlan?: DeterministicLayoutPlan;
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
  characterX: number;
  characterY: number;
  cameraKeyframes: DeterministicCameraKeyframe[];
  chartHighlights: DeterministicChartHighlight[];
  insertAsset?: DeterministicInsertAsset;
  visualPlan?: ShotVisualPlan;
  finishProfile?: DeterministicFinishProfile;
  characterTracks: DeterministicCharacterTracks;
  alignment?: DeterministicSequenceAlignment;
  emphasisAtFrame?: number;
  transitionHint?: string;
};

export type DeterministicVisualPlanSummary = {
  shot_count: number;
  planner_resolver_counts: Record<string, number>;
  intent_family_counts: Record<ShotVisualIntentFamily | string, number>;
  primary_kind_counts: Record<string, number>;
  supporting_kind_counts: Record<string, number>;
  insert_type_counts: Record<string, number>;
  channel_domain_counts: Record<string, number>;
  pair_counts: Record<string, number>;
};

export type SubtitleCue = {
  index: number;
  startFrame: number;
  endFrame: number;
  text: string;
};

export type SubtitleAlignmentContext = {
  sequence: DeterministicSequence;
  cueIndexInSequence: number;
  cueCountInSequence: number;
  wordStartIndex: number;
  wordEndIndexExclusive: number;
  lines: string[];
};

export type AlignmentHook = (
  cue: SubtitleCue,
  context: SubtitleAlignmentContext
) => { startFrame: number; endFrame: number } | null;

export type EpisodeRenderProps = {
  episodeId: string;
  safeArea: RenderSafeArea;
  freezeCharacterPose: boolean;
  sequences: DeterministicSequence[];
  subtitles: SubtitleCue[];
  episodeFinishProfile?: EpisodeFinishProfile;
  characterPacks?: Record<string, unknown>;
  profiles?: ResolvedProfiles;
};

export type ShotSidecarPlanStatus = "planned" | "resolved" | "failed" | "skipped";

export type ShotSidecarArtifact = {
  kind: "plan" | "video" | "image" | "json";
  path: string;
  label: string;
};

export type ShotSidecarJudgeDecision = "accepted" | "rejected" | "fallback" | "not_applicable" | "planned";

export type ShotSidecarRetakeOutcome =
  | "accepted"
  | "rejected"
  | "failed"
  | "skipped"
  | "not_applicable"
  | "planned";

export type ShotSidecarRetakeStep = {
  candidateId: string;
  attemptIndex: number;
  renderer: string;
  backend: string | null;
  actualBackendCapability?: string | null;
  outcome: ShotSidecarRetakeOutcome;
  reason?: string;
  retryWithRenderer?: string | null;
  retryWithBackend?: string | null;
  retryWithProfile?: string | null;
  selectedForRender?: boolean;
};

export type ShotSidecarJudge = {
  candidateId: string;
  attemptIndex: number;
  decision: ShotSidecarJudgeDecision;
  accepted: boolean;
  judgeSource: "worker_rules_v1" | "renderer_default";
  requestedRenderer: string;
  requestedBackend: string | null;
  actualRenderer?: string | null;
  actualBackendCapability?: string | null;
  reason?: string;
  retryWithRenderer?: string | null;
  retryWithBackend?: string | null;
  retryWithProfile?: string | null;
};

export type ShotSidecarPresetMetadata = {
  controlnetPreset?: SidecarControlNetPresetId | null;
  impactPreset?: SidecarImpactPresetId | null;
  qcPreset?: SidecarQcPresetId | null;
  presetSource?: string | null;
  policyTags?: string[];
  presetRolloutSource?: string | null;
  presetRolloutSourceKind?: "file" | "matrix" | null;
  presetRolloutScenario?: string | null;
  presetRolloutScore?: number | null;
  presetRolloutVerdict?: string | null;
  presetRolloutTarget?: "overall" | "balanced" | "strict" | null;
  presetRolloutArtifactAgeHours?: number | null;
  presetRolloutChannelDomain?: "economy" | "medical" | null;
};

export type ShotSidecarPlan = {
  shotId: string;
  shotType: ShotType;
  renderMode: ShotRenderMode;
  status: ShotSidecarPlanStatus;
  renderer: string;
  notes?: string;
  artifacts?: ShotSidecarArtifact[];
  judge?: ShotSidecarJudge;
  retakes?: ShotSidecarRetakeStep[];
  metadata?: Record<string, unknown> & ShotSidecarPresetMetadata;
};

export type ShotSidecarRenderRequest = {
  episodeId: string;
  shot: RenderableShot;
  shotType: ShotType;
  renderMode: ShotRenderMode;
  narration: string;
  outputRootDir: string;
  fps: number;
  width: number;
  height: number;
  attempt: number;
  maxAttempts: number;
};

export type ShotSidecarRenderer = (
  input: ShotSidecarRenderRequest
) => Promise<ShotSidecarPlan | null> | ShotSidecarPlan | null;

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

export type EpisodeRegressionSeverity = "INFO" | "WARN" | "ERROR";

export type EpisodeRegressionCheck = {
  name: string;
  passed: boolean;
  severity: "WARN" | "ERROR";
  details: string;
};

export type EpisodeRegressionIssue = {
  code: string;
  severity: EpisodeRegressionSeverity;
  message: string;
  shotIds?: string[];
  details?: Record<string, unknown>;
};

export type EpisodeRegressionReport = {
  schema_version: "1.0";
  generated_at: string;
  episode_id: string;
  final_passed: boolean;
  error_count: number;
  warning_count: number;
  checks: EpisodeRegressionCheck[];
  issues: EpisodeRegressionIssue[];
  continuity_summary: {
    shot_count: number;
    adjacent_pair_count: number;
    visual_plan_shot_count: number;
    visual_plan_missing_count: number;
    finish_profile_ids: string[];
    episode_finish_profile_id: string | null;
    mascot_pack_counts: Record<string, number>;
    render_mode_counts: Record<string, number>;
    primary_visual_kind_counts: Record<string, number>;
    visual_planner_resolver_counts: Record<string, number>;
    visual_intent_family_counts: Record<ShotVisualIntentFamily | string, number>;
    visual_insert_type_counts: Record<string, number>;
    visual_channel_domain_counts: Record<string, number>;
    visual_pair_counts: Record<string, number>;
    visual_intent_transition_counts: Record<string, number>;
    max_character_position_delta: number | null;
    max_narration_box_delta: number | null;
    max_primary_visual_box_delta: number | null;
    max_finish_drift_score: number | null;
    max_render_path_transition_drift_score: number | null;
    aligned_shot_count: number;
  };
};

export type OrchestrateRenderInput = {
  shotsPath?: string;
  outputPath?: string;
  srtPath?: string;
  qcReportPath?: string;
  episodeRegressionReportPath?: string;
  renderLogPath?: string;
  sidecarPlanPath?: string;
  narrationAlignmentPath?: string;
  compositionId?: string;
  preset?: Partial<RenderPreset>;
  attempt?: number;
  maxAttempts?: number;
  dryRun?: boolean;
  allowUnacceptedGeneratedPacks?: boolean;
  qc?: RenderQcInput;
  alignmentHook?: AlignmentHook;
  shotSidecarRenderer?: ShotSidecarRenderer;
};

export type OrchestrateRenderResult = {
  outputPath: string;
  srtPath: string;
  qcReportPath: string;
  episodeRegressionReportPath: string;
  renderLogPath: string;
  sidecarPlanPath: string;
  propsPath: string;
  sequenceCount: number;
  sidecarPlanCount: number;
  subtitleCount: number;
  totalFrames: number;
  qcPassed: boolean;
  fallbackStepsApplied: string[];
  qcErrorCount: number;
  qcWarningCount: number;
  qcFinalIssues: VisualQcIssue[];
  status: "SUCCEEDED";
};



