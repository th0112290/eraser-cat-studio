export { MockTTSProvider } from "./mockProvider";
export { LocalMockMusicLibrary } from "./mockMusicLibrary";
export { buildPlacementPlan } from "./placement";
export { runAudioPipeline, loadFixtureJson } from "./pipeline";
export { applyPronunciationDictionary, loadPronunciationDictionary } from "./pronunciation";
export { buildAutoSfxPlacements } from "./sfx/autoPlace";
export { makeBeep, makeClick, makePop, makeWhoosh } from "./sfx/procedural";
export { resolveProceduralSfxSpec } from "./sfx/select";

export type {
  AudioBuildInput,
  AudioBuildResult,
  BeatCue,
  LicenseInfo,
  LicenseLogEntry,
  MusicLibrary,
  PickedTrack,
  PlacementPlan,
  ProceduralSfxKind,
  SfxPlacement,
  ShotCue,
  TTSProvider,
  TrackRules
} from "./types";
