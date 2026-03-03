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
