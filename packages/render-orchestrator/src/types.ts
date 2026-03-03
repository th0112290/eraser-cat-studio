import type { Shot, ShotsDocument } from "@ec/story";

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
  narration: string;
  emphasisWords: string[];
  chartData: ChartDataRow[];
  visualMode: "chart" | "table";
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
  alignmentHook?: AlignmentHook;
};

export type OrchestrateRenderResult = {
  outputPath: string;
  srtPath: string;
  qcReportPath: string;
  renderLogPath: string;
  propsPath: string;
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


