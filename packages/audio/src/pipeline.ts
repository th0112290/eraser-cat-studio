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
  AudioViseme,
  AudioBuildInput,
  AudioBuildResult,
  LicenseInfo,
  LicenseLogEntry,
  MusicLibrary,
  NarrationAlignmentDocument,
  NarrationAlignmentShot,
  NarrationAlignmentVisemeCue,
  NarrationAlignmentWord,
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

function countVowelGroups(text: string): number {
  const matches = text.toLowerCase().match(/[aeiouy]+/g);
  return matches ? matches.length : 0;
}

function tokenizeWords(text: string): string[] {
  return text
    .match(/[A-Za-z0-9']+/g)
    ?.map((token) => token.trim())
    .filter((token) => token.length > 0) ?? [];
}

function deriveShotTexts(input: AudioBuildInput): string[] {
  const explicitTexts = input.shots.map((shot) => (typeof shot.text === "string" ? shot.text.trim() : ""));
  if (explicitTexts.every((text) => text.length > 0)) {
    return explicitTexts;
  }

  const scriptWords = tokenizeWords(input.scriptText);
  if (scriptWords.length === 0) {
    return input.shots.map(() => "");
  }

  const totalDuration = Math.max(
    0.001,
    input.shots.reduce((max, shot) => Math.max(max, shot.startSec + shot.durationSec), 0)
  );
  let cursor = 0;

  return input.shots.map((shot, index) => {
    const explicit = explicitTexts[index];
    if (explicit.length > 0) {
      return explicit;
    }

    const ratio = Math.max(0.08, shot.durationSec / totalDuration);
    const remainingShots = input.shots.length - index;
    const remainingWords = Math.max(1, scriptWords.length - cursor);
    const estimatedCount = Math.max(1, Math.round(scriptWords.length * ratio));
    const count = index === input.shots.length - 1 ? remainingWords : Math.min(remainingWords, estimatedCount);
    const slice = scriptWords.slice(cursor, cursor + count);
    cursor += count;
    return slice.join(" ");
  });
}

function visemeForWord(word: string): AudioViseme {
  const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.length === 0) {
    return "mouth_closed";
  }
  if (/(oo|oh|ou|ow|o|u)/.test(normalized)) {
    return "mouth_round_o";
  }
  if (/(aa|ee|ai|ay|ei)|[ae]/.test(normalized)) {
    return normalized.length >= 4 ? "mouth_open_wide" : "mouth_open_small";
  }
  return normalized.length <= 2 ? "mouth_open_small" : "mouth_open_small";
}

function visemeIntensity(viseme: AudioViseme, word: string): number {
  const syllableWeight = Math.max(1, countVowelGroups(word));
  if (viseme === "mouth_open_wide") {
    return Math.min(1, 0.72 + syllableWeight * 0.1);
  }
  if (viseme === "mouth_round_o") {
    return Math.min(0.92, 0.62 + syllableWeight * 0.08);
  }
  if (viseme === "mouth_open_small") {
    return Math.min(0.8, 0.48 + syllableWeight * 0.06);
  }
  return 0;
}

function wordWeight(word: string): number {
  const vowelGroups = countVowelGroups(word);
  return Math.max(1, Math.min(6, word.length * 0.18 + vowelGroups * 0.85));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeVisemeCues(cues: NarrationAlignmentVisemeCue[]): NarrationAlignmentVisemeCue[] {
  const sorted = [...cues].sort((left, right) => left.timeSec - right.timeSec);
  const deduped: NarrationAlignmentVisemeCue[] = [];
  for (const cue of sorted) {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      Math.abs(previous.timeSec - cue.timeSec) < 0.0001 &&
      previous.viseme === cue.viseme &&
      Math.abs(previous.intensity - cue.intensity) < 0.001
    ) {
      continue;
    }
    deduped.push(cue);
  }
  return deduped;
}

function buildNarrationAlignment(
  input: AudioBuildInput,
  narrationPath: string,
  narration: MonoWav
): NarrationAlignmentDocument {
  const resolvedShotTexts = deriveShotTexts(input);
  const plannedDurationSec = Math.max(
    0.001,
    input.shots.reduce((max, shot) => Math.max(max, shot.startSec + shot.durationSec), 0)
  );
  const audioDurationSec = narration.samples.length / Math.max(1, narration.sampleRate);

  const shots: NarrationAlignmentShot[] = input.shots.map((shot, index) => {
    const startSec = Math.max(0, shot.startSec);
    const durationSec = Math.max(0.001, shot.durationSec);
    const endSec = startSec + durationSec;
    const text = resolvedShotTexts[index] ?? "";
    const words = tokenizeWords(text);

    if (words.length === 0) {
      return {
        shotId: shot.id,
        startSec,
        endSec,
        durationSec,
        text,
        words: [],
        visemeCues: [
          {
            shotId: shot.id,
            timeSec: startSec,
            localTimeSec: 0,
            viseme: "mouth_closed",
            intensity: 0
          },
          {
            shotId: shot.id,
            timeSec: endSec,
            localTimeSec: durationSec,
            viseme: "mouth_closed",
            intensity: 0
          }
        ]
      };
    }

    const leadInSec = Math.min(0.12, durationSec * 0.08);
    const tailOutSec = Math.min(0.14, durationSec * 0.1);
    const speechStartSec = startSec + leadInSec;
    const speechEndSec = Math.max(speechStartSec + 0.1, endSec - tailOutSec);
    const speakingDurationSec = Math.max(0.1, speechEndSec - speechStartSec);
    const totalWeight = words.reduce((sum, word) => sum + wordWeight(word), 0);

    let cursor = speechStartSec;
    const alignedWords: NarrationAlignmentWord[] = [];
    const visemeCues: NarrationAlignmentVisemeCue[] = [
      {
        shotId: shot.id,
        timeSec: startSec,
        localTimeSec: 0,
        viseme: "mouth_closed",
        intensity: 0
      }
    ];

    words.forEach((word, wordIndex) => {
      const ratio = wordWeight(word) / Math.max(1, totalWeight);
      const rawDuration = speakingDurationSec * ratio;
      const gapSec = Math.min(0.05, rawDuration * 0.18);
      const wordStartSec = cursor;
      const isLast = wordIndex === words.length - 1;
      const wordEndSec = isLast
        ? speechEndSec
        : Math.min(speechEndSec, wordStartSec + Math.max(0.06, rawDuration - gapSec));
      const viseme = visemeForWord(word);
      const intensity = visemeIntensity(viseme, word);

      alignedWords.push({
        shotId: shot.id,
        index: wordIndex,
        text: word,
        startSec: wordStartSec,
        endSec: wordEndSec,
        localStartSec: wordStartSec - startSec,
        localEndSec: wordEndSec - startSec,
        viseme,
        intensity
      });

      visemeCues.push({
        shotId: shot.id,
        timeSec: wordStartSec,
        localTimeSec: wordStartSec - startSec,
        viseme,
        intensity,
        sourceWord: word
      });
      visemeCues.push({
        shotId: shot.id,
        timeSec: wordEndSec,
        localTimeSec: wordEndSec - startSec,
        viseme: "mouth_closed",
        intensity: 0,
        sourceWord: word
      });

      cursor = isLast ? speechEndSec : Math.min(speechEndSec, wordEndSec + gapSec);
    });

    visemeCues.push({
      shotId: shot.id,
      timeSec: endSec,
      localTimeSec: durationSec,
      viseme: "mouth_closed",
      intensity: 0
    });

    return {
      shotId: shot.id,
      startSec,
      endSec,
      durationSec,
      text,
      words: alignedWords,
      visemeCues: normalizeVisemeCues(visemeCues)
    };
  });

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    strategy: "heuristic_shot_timing_v1",
    voice: input.voice,
    speed: input.speed,
    provider: "heuristic_from_shot_timing",
    narration_path: narrationPath,
    audio_duration_sec: audioDurationSec,
    planned_duration_sec: plannedDurationSec,
    shots
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
  const alignment = buildNarrationAlignment(input, narrationPath, narration);
  const alignmentPath = path.join(input.outDir, "narration_alignment.json");
  writeJson(alignmentPath, alignment);

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
    alignmentPath,
    alignment,
    appliedScriptText,
    placementPlan
  };
}

export function loadFixtureJson<T>(filePath: string): T {
  const raw = readText(filePath);
  return JSON.parse(raw) as T;
}
