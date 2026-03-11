export type LicenseInfo = {
  licenseId: string;
  attribution: string;
  source: string;
  usage: string;
};

export type NarrationLicenseInfo = LicenseInfo & {
  generated: true;
};

export type ProceduralSfxKind = "whoosh" | "pop" | "click" | "beep";

export type TrackKind = "bgm" | "sfx";
export type TrackMood = "calm" | "drive" | "neutral";
export type TrackIntensity = "low" | "medium" | "high";

export type TrackRules = {
  kind: TrackKind;
  mood?: TrackMood;
  intensity?: TrackIntensity;
  tags?: string[];
};

export type PickedTrack = {
  id: string;
  kind: TrackKind;
  path: string;
  license: LicenseInfo;
};

export type BeatCue = {
  id: string;
  startSec: number;
  tags: string[];
  text?: string;
};

export type ShotCue = {
  id: string;
  startSec: number;
  durationSec: number;
  tags: string[];
  text?: string;
};

export type AudioViseme =
  | "mouth_closed"
  | "mouth_open_small"
  | "mouth_open_wide"
  | "mouth_round_o";

export type NarrationAlignmentWord = {
  shotId: string;
  index: number;
  text: string;
  startSec: number;
  endSec: number;
  localStartSec: number;
  localEndSec: number;
  viseme: AudioViseme;
  intensity: number;
};

export type NarrationAlignmentVisemeCue = {
  shotId: string;
  f?: number;
  timeSec: number;
  localTimeSec: number;
  viseme: AudioViseme;
  intensity: number;
  sourceWord?: string;
};

export type NarrationAlignmentShot = {
  shotId: string;
  startSec: number;
  endSec: number;
  durationSec: number;
  text: string;
  words: NarrationAlignmentWord[];
  visemeCues: NarrationAlignmentVisemeCue[];
};

export type NarrationAlignmentDocument = {
  schema_version: "1.0";
  generated_at: string;
  strategy: "heuristic_shot_timing_v1";
  voice: string;
  speed: number;
  provider: string;
  narration_path?: string;
  audio_duration_sec: number;
  planned_duration_sec: number;
  shots: NarrationAlignmentShot[];
};

export type SfxPlacement = {
  beatId: string;
  timeSec: number;
  rules: TrackRules;
  reason: string;
};

export type PlacementPlan = {
  bgmRules: TrackRules;
  sfxEvents: SfxPlacement[];
};

export type SfxTrackEvent = {
  beatId: string;
  timeSec: number;
  reason: string;
  track: PickedTrack;
};

export type AudioBuildInput = {
  scriptText: string;
  voice: string;
  speed: number;
  beats: BeatCue[];
  shots: ShotCue[];
  pronunciationDictionaryPath: string;
  outDir: string;
};

export type AudioBuildResult = {
  narrationPath: string;
  mixPath: string;
  licenseLogPath: string;
  alignmentPath: string;
  alignment: NarrationAlignmentDocument;
  appliedScriptText: string;
  placementPlan: PlacementPlan;
};

export type LicenseLogEntry = {
  assetType: "narration" | "bgm" | "sfx";
  id: string;
  path: string;
  usedAtSec?: number[];
  reason?: string;
  license: LicenseInfo | NarrationLicenseInfo;
};

export interface TTSProvider {
  synthesize(text: string, voice: string, speed: number): Promise<string>;
}

export interface MusicLibrary {
  pick(trackRules: TrackRules): Promise<PickedTrack>;
}
