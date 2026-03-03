import fs from "node:fs";
import path from "node:path";
import type { LicenseInfo, MusicLibrary, PickedTrack, TrackRules } from "./types";
import { generateToneSamples, writeMonoWav } from "./wav";

type LibraryAssetConfig = {
  id: string;
  kind: "bgm" | "sfx";
  frequency: number;
  durationSec: number;
  volume: number;
  modulationHz: number;
  filename: string;
};

const LICENSE_BASE: LicenseInfo = {
  licenseId: "CC0-1.0",
  attribution: "Eraser Cat Studio Mock Audio Library",
  source: "local://mock-audio-library",
  usage: "Allowed for local development and tests"
};

const ASSETS: Record<string, LibraryAssetConfig> = {
  bgm_calm: {
    id: "bgm_calm",
    kind: "bgm",
    frequency: 196,
    durationSec: 30,
    volume: 0.22,
    modulationHz: 0.15,
    filename: "bgm_calm_mock.wav"
  },
  bgm_drive: {
    id: "bgm_drive",
    kind: "bgm",
    frequency: 284,
    durationSec: 30,
    volume: 0.2,
    modulationHz: 0.25,
    filename: "bgm_drive_mock.wav"
  },
  sfx_hit: {
    id: "sfx_hit",
    kind: "sfx",
    frequency: 880,
    durationSec: 0.28,
    volume: 0.55,
    modulationHz: 6.5,
    filename: "sfx_hit_mock.wav"
  },
  sfx_tick: {
    id: "sfx_tick",
    kind: "sfx",
    frequency: 660,
    durationSec: 0.2,
    volume: 0.45,
    modulationHz: 4.1,
    filename: "sfx_tick_mock.wav"
  }
};

function selectAssetKey(rules: TrackRules): keyof typeof ASSETS {
  if (rules.kind === "bgm") {
    const mood = rules.mood ?? "neutral";
    const intensity = rules.intensity ?? "medium";
    if (mood === "drive" || intensity === "high") {
      return "bgm_drive";
    }
    return "bgm_calm";
  }

  const tags = rules.tags ?? [];
  if (rules.intensity === "high" || tags.some((tag) => /emphasis:high|impact/i.test(tag))) {
    return "sfx_hit";
  }
  return "sfx_tick";
}

function ensureAssetFile(assetDir: string, config: LibraryAssetConfig): string {
  const outPath = path.join(assetDir, config.filename);
  if (fs.existsSync(outPath)) {
    return outPath;
  }

  const samples = generateToneSamples(
    config.durationSec,
    44100,
    config.frequency,
    config.volume,
    config.modulationHz
  );

  writeMonoWav(outPath, {
    sampleRate: 44100,
    samples
  });

  return outPath;
}

export class LocalMockMusicLibrary implements MusicLibrary {
  private readonly assetDir: string;

  constructor(assetDir: string) {
    this.assetDir = assetDir;
    fs.mkdirSync(this.assetDir, { recursive: true });
  }

  async pick(trackRules: TrackRules): Promise<PickedTrack> {
    const key = selectAssetKey(trackRules);
    const config = ASSETS[key];
    const trackPath = ensureAssetFile(this.assetDir, config);

    return {
      id: config.id,
      kind: config.kind,
      path: trackPath,
      license: LICENSE_BASE
    };
  }
}
