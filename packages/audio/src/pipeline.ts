import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  applyPronunciationDictionary,
  loadPronunciationDictionary,
  type PronunciationDictionary
} from "./pronunciation";
import { buildPlacementPlan } from "./placement";
import { makeBeep, makeClick, makePop, makeWhoosh } from "./sfx/procedural";
import { resolveProceduralSfxSpec } from "./sfx/select";
import { normalizeFloatSamples, overlaySamples, readMonoWav, type MonoWav, writeMonoWav } from "./wav";
import type {
  AudioBuildInput,
  AudioBuildResult,
  LicenseInfo,
  LicenseLogEntry,
  MusicLibrary,
  NarrationLicenseInfo,
  PickedTrack,
  SfxPlacement,
  SfxTrackEvent,
  TTSProvider
} from "./types";

type PipelineDeps = {
  ttsProvider: TTSProvider;
  musicLibrary: MusicLibrary;
};

type ResolvedSfxEvent = SfxTrackEvent & {
  gain: number;
};

const PROCEDURAL_LICENSE: LicenseInfo = {
  licenseId: "PROCEDURAL-GENERATED",
  attribution: "procedurally generated",
  source: "local://procedural-sfx",
  usage: "procedurally generated assets for local render and tests"
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readText(pathLike: string): string {
  return fs.readFileSync(pathLike, "utf8");
}

function writeJson(pathLike: string, value: unknown): void {
  fs.writeFileSync(pathLike, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ffmpegExists(): boolean {
  const check = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return check.status === 0;
}

function maybeApplyFfmpegLoudnorm(sourcePath: string, targetPath: string): boolean {
  if (!ffmpegExists()) {
    return false;
  }

  const run = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      sourcePath,
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      targetPath
    ],
    { stdio: "pipe" }
  );

  return run.status === 0 && fs.existsSync(targetPath);
}

function buildNarrationLicense(): NarrationLicenseInfo {
  return {
    licenseId: "GENERATED-LOCAL",
    attribution: "Mock TTS provider",
    source: "local://mock-tts-provider",
    usage: "Allowed for local development and tests",
    generated: true
  };
}

function dedupeTracks(events: SfxTrackEvent[]): PickedTrack[] {
  const byId = new Map<string, PickedTrack>();
  for (const event of events) {
    byId.set(event.track.id, event.track);
  }
  return Array.from(byId.values());
}

function mapSfxTimesByTrack(events: SfxTrackEvent[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const event of events) {
    const list = map.get(event.track.id) ?? [];
    list.push(event.timeSec);
    map.set(event.track.id, list);
  }
  return map;
}

function proceduralTrackId(placement: SfxPlacement): string {
  const spec = resolveProceduralSfxSpec(placement);
  const freqPart = spec.beepFreqHz ? `_f${Math.round(spec.beepFreqHz)}` : "";
  return `procedural_${spec.kind}_${Math.round(spec.durationMs)}ms${freqPart}`;
}

function buildProceduralWave(placement: SfxPlacement): MonoWav {
  const spec = resolveProceduralSfxSpec(placement);

  if (spec.kind === "whoosh") {
    return makeWhoosh(spec.durationMs);
  }

  if (spec.kind === "pop") {
    return makePop(spec.durationMs);
  }

  if (spec.kind === "click") {
    return makeClick(spec.durationMs);
  }

  return makeBeep(spec.beepFreqHz ?? 780, spec.durationMs);
}

function buildProceduralSfxEvents(placements: SfxPlacement[]): {
  events: ResolvedSfxEvent[];
  trackWavs: Map<string, MonoWav>;
} {
  const trackWavs = new Map<string, MonoWav>();
  const events: ResolvedSfxEvent[] = [];

  for (const placement of placements) {
    const id = proceduralTrackId(placement);

    if (!trackWavs.has(id)) {
      trackWavs.set(id, buildProceduralWave(placement));
    }

    const spec = resolveProceduralSfxSpec(placement);
    events.push({
      beatId: placement.beatId,
      timeSec: placement.timeSec,
      reason: placement.reason,
      gain: spec.gain,
      track: {
        id,
        kind: "sfx",
        path: `procedural://sfx/${id}.wav`,
        license: PROCEDURAL_LICENSE
      }
    });
  }

  return { events, trackWavs };
}

function mixAudio(
  narration: MonoWav,
  bgm: MonoWav,
  sfxTracks: Map<string, MonoWav>,
  sfxEvents: ResolvedSfxEvent[]
): Int16Array {
  const sampleRate = narration.sampleRate;
  const out = new Float32Array(narration.samples.length);

  const sfxBus = new Float32Array(out.length);
  for (const event of sfxEvents) {
    const track = sfxTracks.get(event.track.id);
    if (!track) {
      continue;
    }

    const startIndex = Math.floor(event.timeSec * sampleRate);
    overlaySamples(sfxBus, track.samples, startIndex, event.gain);
  }

  for (let i = 0; i < out.length; i += 1) {
    const narrationSample = (narration.samples[i] ?? 0) / 32768;
    const sfxSample = sfxBus[i] ?? 0;
    const bgmSample = (bgm.samples[i % bgm.samples.length] ?? 0) / 32768;

    const sfxDuck = 1 - Math.min(0.42, Math.abs(narrationSample) * 0.75);
    const bgmDuck = 1 - Math.min(0.88, Math.abs(narrationSample) * 1.45 + Math.abs(sfxSample) * 0.55);

    const mixed = narrationSample + sfxSample * sfxDuck + bgmSample * 0.3 * bgmDuck;
    out[i] = mixed;
  }

  return normalizeFloatSamples(out, 0.92);
}

function toLicenseLogEntries(
  narrationPath: string,
  bgmTrack: PickedTrack,
  sfxEvents: SfxTrackEvent[]
): LicenseLogEntry[] {
  const entries: LicenseLogEntry[] = [
    {
      assetType: "narration",
      id: "narration_generated",
      path: narrationPath,
      license: buildNarrationLicense()
    },
    {
      assetType: "bgm",
      id: bgmTrack.id,
      path: bgmTrack.path,
      license: bgmTrack.license
    }
  ];

  const sfxTracks = dedupeTracks(sfxEvents);
  const sfxTimes = mapSfxTimesByTrack(sfxEvents);

  for (const track of sfxTracks) {
    entries.push({
      assetType: "sfx",
      id: track.id,
      path: track.path,
      usedAtSec: sfxTimes.get(track.id) ?? [],
      reason: "auto placement from beat/shot tags",
      license: track.license
    });
  }

  return entries;
}

function resolveLicenseSourceInfo(dictionary: PronunciationDictionary): LicenseInfo {
  return {
    licenseId: "LOCAL-DICTIONARY",
    attribution: `${Object.keys(dictionary).length} pronunciation entries`,
    source: "local://pronunciation-dictionary",
    usage: "Applied as text replacement prior to synthesis"
  };
}

export async function runAudioPipeline(
  deps: PipelineDeps,
  input: AudioBuildInput
): Promise<AudioBuildResult> {
  ensureDir(input.outDir);

  const dictionary = loadPronunciationDictionary(input.pronunciationDictionaryPath);
  const appliedScriptText = applyPronunciationDictionary(input.scriptText, dictionary);
  const placementPlan = buildPlacementPlan(input.beats, input.shots);

  const narrationPath = await deps.ttsProvider.synthesize(appliedScriptText, input.voice, input.speed);
  const bgmTrack = await deps.musicLibrary.pick(placementPlan.bgmRules);

  const { events: sfxEvents, trackWavs: sfxTrackMap } = buildProceduralSfxEvents(placementPlan.sfxEvents);

  const narration = readMonoWav(narrationPath);
  const bgm = readMonoWav(bgmTrack.path);

  const mixedSamples = mixAudio(narration, bgm, sfxTrackMap, sfxEvents);
  const rawMixPath = path.join(input.outDir, "mix.raw.wav");
  const mixPath = path.join(input.outDir, "mix.wav");

  writeMonoWav(rawMixPath, {
    sampleRate: narration.sampleRate,
    samples: mixedSamples
  });

  const loudnormApplied = maybeApplyFfmpegLoudnorm(rawMixPath, mixPath);
  if (!loudnormApplied) {
    fs.copyFileSync(rawMixPath, mixPath);
  }
  fs.rmSync(rawMixPath, { force: true });

  const licenseEntries = toLicenseLogEntries(narrationPath, bgmTrack, sfxEvents);
  const licenseLogPath = path.join(input.outDir, "license_log.json");
  writeJson(licenseLogPath, {
    generatedAt: new Date().toISOString(),
    mode: loudnormApplied ? "ffmpeg-loudnorm" : "internal-normalization",
    sfxGeneration: "procedurally generated",
    pronunciationDictionary: {
      path: input.pronunciationDictionaryPath,
      license: resolveLicenseSourceInfo(dictionary)
    },
    entries: licenseEntries
  });

  return {
    narrationPath,
    mixPath,
    licenseLogPath,
    appliedScriptText,
    placementPlan
  };
}

export function loadFixtureJson<T>(filePath: string): T {
  const raw = readText(filePath);
  return JSON.parse(raw) as T;
}
