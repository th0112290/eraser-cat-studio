export { orchestrateRenderEpisode } from "./orchestrateRender";
export {
  createGeneratedPackSidecarPlaceholderRenderer,
  createGeneratedPackSidecarStillVideoRenderer
} from "./generatedSidecar";
export {
  applyNarrationAlignmentToSequences,
  buildNarrationAlignmentHook,
  createFailoverSubtitleAlignmentProvider,
  resolveAlignmentHook,
  normalizeNarrationAlignmentDocument
} from "./alignment";
export { applyAlignmentAwareActingTimeline } from "./actingTimeline";
export {
  applyEpisodeFinishConsistency,
  buildFinishConsistencySummary,
  resolveEpisodeFinishProfile
} from "./episodeFinish";
export {
  buildEpisodeRegressionReport,
  summarizeEpisodeRegressionReport
} from "./episodeRegression";
export { applyEmphasis, buildSubtitleCues, toSrt } from "./srt";
export { resolveShotFinishProfile } from "./finishProfiles";
export {
  applyLayoutContinuityToSequences,
  computePrimaryVisualAnchorInRect,
  resolvePrimaryVisualPointerTargetCount,
  resolveSequenceLayoutPlan
} from "./layoutPlan";
export { runVisualQcWithFallback } from "./visualQc";

export type {
  AlignmentHook,
  ChartDataRow,
  DeterministicFinishProfile,
  EpisodeFinishProfile,
  DeterministicSequenceAlignment,
  DeterministicSequenceAlignmentPause,
  DeterministicSequenceAlignmentPauseStrength,
  DeterministicSequenceAlignmentViseme,
  DeterministicSequenceAlignmentVisemeCue,
  DeterministicSequenceAlignmentWord,
  EpisodeRegressionCheck,
  EpisodeRegressionIssue,
  EpisodeRegressionReport,
  EpisodeRegressionSeverity,
  DeterministicLayoutPlan,
  DeterministicLayoutRect,
  DeterministicPointerReachability,
  DeterministicSequence,
  DeterministicVisualObject,
  EpisodeRenderProps,
  OrchestrateRenderInput,
  OrchestrateRenderResult,
  RenderPreset,
  RenderQcDataset,
  RenderQcInput,
  RenderSafeArea,
  RenderableShot,
  RenderableShotsDocument,
  ShotSidecarArtifact,
  ShotSidecarJudge,
  ShotSidecarJudgeDecision,
  ShotSidecarPlan,
  ShotSidecarPlanStatus,
  ShotSidecarPresetMetadata,
  ShotSidecarRenderRequest,
  ShotSidecarRenderer,
  ShotSidecarRetakeOutcome,
  ShotSidecarRetakeStep,
  SubtitleAlignmentProvider,
  SubtitleAlignmentProviderContext,
  SubtitleCue,
  VisualQcCheck,
  VisualQcIssue,
  VisualQcReport,
  VisualQcRun,
  VisualQcSeverity
} from "./types";
export type { ShotFinishProfile } from "./finishProfiles";
export type {
  CreateGeneratedPackSidecarStillVideoRendererInput,
  CreateGeneratedPackSidecarPlaceholderRendererInput,
  GeneratedPackSidecarReference,
  GeneratedPackSidecarRequestPack
} from "./generatedSidecar";
