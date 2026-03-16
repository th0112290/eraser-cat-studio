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
  NarrationAlignmentSourceKind,
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

type ResolvedShotText = {
  shot: AudioBuildInput["shots"][number];
  text: string;
};

type ExternalAlignmentProviderId = "mfa" | "faster-whisper" | "whisperx";

type ExternalAlignmentProviderSpec = {
  id: ExternalAlignmentProviderId;
  command: string;
};

type ExternalAlignmentWord = {
  text: string;
  startSec: number;
  endSec: number;
  confidence?: number;
};

type ExternalAlignmentResolution = {
  alignment: NarrationAlignmentDocument;
  provider: string;
  sourceKind: NarrationAlignmentSourceKind;
  fallbackUsed: boolean;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function readTimeSec(
  record: Record<string, unknown>,
  secKeys: string[],
  msKeys: string[],
  fallbackSec: number | null = null
): number | null {
  for (const key of secKeys) {
    const parsed = parseNumber(record[key]);
    if (parsed !== null) {
      return Math.max(0, parsed);
    }
  }
  for (const key of msKeys) {
    const parsed = parseNumber(record[key]);
    if (parsed !== null) {
      return Math.max(0, parsed / 1000);
    }
  }
  return fallbackSec === null ? null : Math.max(0, fallbackSec);
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

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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

function resolveShotTextEntries(input: AudioBuildInput): ResolvedShotText[] {
  const texts = deriveShotTexts(input);
  return input.shots.map((shot, index) => ({
    shot,
    text: texts[index] ?? ""
  }));
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

function buildClosedMouthVisemeCues(
  shotId: string,
  startSec: number,
  endSec: number
): NarrationAlignmentVisemeCue[] {
  const durationSec = Math.max(0, endSec - startSec);
  return [
    {
      shotId,
      timeSec: startSec,
      localTimeSec: 0,
      viseme: "mouth_closed",
      intensity: 0
    },
    {
      shotId,
      timeSec: endSec,
      localTimeSec: durationSec,
      viseme: "mouth_closed",
      intensity: 0
    }
  ];
}

function buildShotAlignmentFromWords(input: {
  shotId: string;
  startSec: number;
  durationSec: number;
  text: string;
  provider?: string;
  version?: string;
  sourceKind?: NarrationAlignmentSourceKind;
  words: ExternalAlignmentWord[];
}): NarrationAlignmentShot {
  const startSec = Math.max(0, input.startSec);
  const durationSec = Math.max(0.001, input.durationSec);
  const endSec = startSec + durationSec;
  const normalizedWords = input.words
    .map((word, index) => {
      const text = normalizeWhitespace(word.text);
      if (text.length === 0) {
        return null;
      }
      const clippedStartSec = clamp(word.startSec, startSec, endSec);
      const clippedEndSec = clamp(word.endSec, clippedStartSec, endSec);
      const endTimeSec =
        clippedEndSec > clippedStartSec
          ? clippedEndSec
          : Math.min(endSec, clippedStartSec + Math.min(0.08, Math.max(0.02, durationSec * 0.12)));
      const viseme = visemeForWord(text);
      const baseIntensity = visemeIntensity(viseme, text);
      const confidence =
        typeof word.confidence === "number" && Number.isFinite(word.confidence)
          ? clamp(word.confidence, 0, 1)
          : undefined;
      const intensity = clamp(baseIntensity * 0.82 + (confidence ?? 0.6) * 0.18, 0, 1);

      return {
        shotId: input.shotId,
        index,
        text,
        startSec: clippedStartSec,
        endSec: Math.max(clippedStartSec, endTimeSec),
        localStartSec: Math.max(0, clippedStartSec - startSec),
        localEndSec: Math.max(0, Math.max(clippedStartSec, endTimeSec) - startSec),
        viseme,
        intensity
      } satisfies NarrationAlignmentWord;
    })
    .filter((word): word is NarrationAlignmentWord => word !== null)
    .sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec);

  const visemeCues =
    normalizedWords.length === 0
      ? buildClosedMouthVisemeCues(input.shotId, startSec, endSec)
      : normalizeVisemeCues([
          {
            shotId: input.shotId,
            timeSec: startSec,
            localTimeSec: 0,
            viseme: "mouth_closed",
            intensity: 0
          },
          ...normalizedWords.flatMap((word) => [
            {
              shotId: input.shotId,
              timeSec: word.startSec,
              localTimeSec: word.localStartSec,
              viseme: word.viseme,
              intensity: word.intensity,
              sourceWord: word.text
            },
            {
              shotId: input.shotId,
              timeSec: word.endSec,
              localTimeSec: word.localEndSec,
              viseme: "mouth_closed" as const,
              intensity: 0,
              sourceWord: word.text
            }
          ]),
          {
            shotId: input.shotId,
            timeSec: endSec,
            localTimeSec: durationSec,
            viseme: "mouth_closed",
            intensity: 0
          }
        ]);

  return {
    shotId: input.shotId,
    startSec,
    endSec,
    durationSec,
    text: input.text,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.version ? { version: input.version } : {}),
    ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
    words: normalizedWords,
    visemeCues
  };
}

function buildHeuristicShotAlignment(entry: ResolvedShotText): NarrationAlignmentShot {
  const startSec = Math.max(0, entry.shot.startSec);
  const durationSec = Math.max(0.001, entry.shot.durationSec);
  const endSec = startSec + durationSec;
  const words = tokenizeWords(entry.text);

  if (words.length === 0) {
    return buildShotAlignmentFromWords({
      shotId: entry.shot.id,
      startSec,
      durationSec,
      text: entry.text,
      provider: "heuristic_from_shot_timing",
      sourceKind: "heuristic",
      words: []
    });
  }

  const leadInSec = Math.min(0.12, durationSec * 0.08);
  const tailOutSec = Math.min(0.14, durationSec * 0.1);
  const speechStartSec = startSec + leadInSec;
  const speechEndSec = Math.max(speechStartSec + 0.1, endSec - tailOutSec);
  const speakingDurationSec = Math.max(0.1, speechEndSec - speechStartSec);
  const totalWeight = words.reduce((sum, word) => sum + wordWeight(word), 0);

  let cursor = speechStartSec;
  const weightedWords: ExternalAlignmentWord[] = [];
  words.forEach((word, index) => {
    const ratio = wordWeight(word) / Math.max(1, totalWeight);
    const rawDuration = speakingDurationSec * ratio;
    const gapSec = Math.min(0.05, rawDuration * 0.18);
    const wordStartSec = cursor;
    const isLast = index === words.length - 1;
    const wordEndSec = isLast
      ? speechEndSec
      : Math.min(speechEndSec, wordStartSec + Math.max(0.06, rawDuration - gapSec));
    weightedWords.push({
      text: word,
      startSec: wordStartSec,
      endSec: wordEndSec
    });
    cursor = isLast ? speechEndSec : Math.min(speechEndSec, wordEndSec + gapSec);
  });

  return buildShotAlignmentFromWords({
    shotId: entry.shot.id,
    startSec,
    durationSec,
    text: entry.text,
    provider: "heuristic_from_shot_timing",
    sourceKind: "heuristic",
    words: weightedWords
  });
}

function buildHeuristicNarrationAlignment(
  input: AudioBuildInput,
  narrationPath: string,
  narration: MonoWav,
  shotEntries: ResolvedShotText[]
): NarrationAlignmentDocument {
  const plannedDurationSec = Math.max(
    0.001,
    input.shots.reduce((max, shot) => Math.max(max, shot.startSec + shot.durationSec), 0)
  );
  const audioDurationSec = narration.samples.length / Math.max(1, narration.sampleRate);

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    strategy: "heuristic_shot_timing_v1",
    voice: input.voice,
    speed: input.speed,
    provider: "heuristic_from_shot_timing",
    sourceKind: "heuristic",
    narration_path: narrationPath,
    audio_duration_sec: audioDurationSec,
    planned_duration_sec: plannedDurationSec,
    shots: shotEntries.map((entry) => buildHeuristicShotAlignment(entry))
  };
}

function normalizeExternalAlignmentProviderId(value: string): ExternalAlignmentProviderId | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "mfa") {
    return "mfa";
  }
  if (normalized === "faster-whisper" || normalized === "faster_whisper" || normalized === "fasterwhisper") {
    return "faster-whisper";
  }
  if (normalized === "whisperx" || normalized === "whisper-x") {
    return "whisperx";
  }
  return null;
}

function resolveProviderCommandEnvName(providerId: ExternalAlignmentProviderId): string {
  switch (providerId) {
    case "mfa":
      return "AUDIO_ALIGNMENT_MFA_COMMAND";
    case "faster-whisper":
      return "AUDIO_ALIGNMENT_FASTER_WHISPER_COMMAND";
    case "whisperx":
      return "AUDIO_ALIGNMENT_WHISPERX_COMMAND";
  }
}

function resolveConfiguredAlignmentProviders(): ExternalAlignmentProviderSpec[] {
  const preferredIds = (process.env.AUDIO_ALIGNMENT_PROVIDERS ?? process.env.AUDIO_ALIGNMENT_PROVIDER ?? "")
    .split(",")
    .map((entry) => normalizeExternalAlignmentProviderId(entry))
    .filter((entry): entry is ExternalAlignmentProviderId => entry !== null);
  const orderedIds =
    preferredIds.length > 0
      ? preferredIds
      : (["mfa", "faster-whisper", "whisperx"] as const).filter((providerId) => {
          const command = process.env[resolveProviderCommandEnvName(providerId)];
          return typeof command === "string" && command.trim().length > 0;
        });

  const deduped = Array.from(new Set(orderedIds));
  return deduped
    .map((id) => ({
      id,
      command: process.env[resolveProviderCommandEnvName(id)]?.trim() ?? ""
    }))
    .filter((provider) => provider.command.length > 0);
}

function resolveProviderOutputExtension(providerId: ExternalAlignmentProviderId): string {
  return providerId === "mfa" ? ".TextGrid" : ".json";
}

function approximateWordsFromSegment(text: string, startSec: number, endSec: number): ExternalAlignmentWord[] {
  const words = tokenizeWords(text);
  if (words.length === 0) {
    return [];
  }

  const safeStartSec = Math.max(0, startSec);
  const safeEndSec = Math.max(safeStartSec, endSec);
  const durationSec = Math.max(0.08, safeEndSec - safeStartSec);
  const stepSec = durationSec / words.length;

  return words.map((word, index) => {
    const wordStartSec = safeStartSec + stepSec * index;
    const isLast = index === words.length - 1;
    const wordEndSec = isLast ? safeEndSec : Math.max(wordStartSec + 0.04, safeStartSec + stepSec * (index + 1));
    return {
      text: word,
      startSec: wordStartSec,
      endSec: Math.min(safeEndSec, wordEndSec)
    };
  });
}

function normalizeExternalAlignmentWordRow(entry: unknown): ExternalAlignmentWord | null {
  if (!isRecord(entry)) {
    return null;
  }

  const text = pickString(entry, ["text", "word", "token"]);
  const startSec = readTimeSec(
    entry,
    ["startSec", "start", "start_time", "timeSec", "time_sec"],
    ["startMs", "start_ms", "timeMs", "time_ms"]
  );
  const endSec = readTimeSec(
    entry,
    ["endSec", "end", "end_time"],
    ["endMs", "end_ms"],
    startSec ?? 0
  );
  if (!text || startSec === null || endSec === null) {
    return null;
  }

  return {
    text,
    startSec,
    endSec: Math.max(startSec, endSec),
    confidence:
      parseNumber(entry.confidence) ??
      parseNumber(entry.score) ??
      parseNumber(entry.probability) ??
      undefined
  };
}

function parseTextGridWordTimings(rawText: string): ExternalAlignmentWord[] {
  const tierMatch =
    /item \[\d+\]:([\s\S]*?name = "(?:words|word)"[\s\S]*?)(?=item \[\d+\]:|$)/i.exec(rawText)?.[1] ?? rawText;
  const matches = tierMatch.matchAll(
    /intervals \[\d+\]:\s*xmin = ([0-9.]+)\s*xmax = ([0-9.]+)\s*text = "(.*?)"/gsi
  );
  const words: ExternalAlignmentWord[] = [];

  for (const match of matches) {
    const startSec = Number(match[1]);
    const endSec = Number(match[2]);
    const text = normalizeWhitespace(match[3].replace(/\\"/g, "\""));
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || text.length === 0) {
      continue;
    }
    words.push({
      text,
      startSec: Math.max(0, startSec),
      endSec: Math.max(Math.max(0, startSec), endSec)
    });
  }

  return words.sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec);
}

function extractExternalAlignmentWords(raw: unknown): ExternalAlignmentWord[] {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return [];
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return extractExternalAlignmentWords(JSON.parse(trimmed) as unknown);
      } catch {
        return [];
      }
    }
    if (trimmed.includes("TextGrid")) {
      return parseTextGridWordTimings(trimmed);
    }
    return [];
  }

  if (Array.isArray(raw)) {
    const direct = raw
      .map((entry) => normalizeExternalAlignmentWordRow(entry))
      .filter((entry): entry is ExternalAlignmentWord => entry !== null);
    if (direct.length > 0) {
      return direct.sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec);
    }
    return raw.flatMap((entry) => extractExternalAlignmentWords(entry));
  }

  if (!isRecord(raw)) {
    return [];
  }

  for (const key of ["words", "word_segments", "wordSegments", "word_timestamps", "wordTimestamps", "wordAlignment"]) {
    const candidate = raw[key];
    if (!Array.isArray(candidate)) {
      continue;
    }
    const words = candidate
      .map((entry) => normalizeExternalAlignmentWordRow(entry))
      .filter((entry): entry is ExternalAlignmentWord => entry !== null);
    if (words.length > 0) {
      return words.sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec);
    }
  }

  if (Array.isArray(raw.segments)) {
    const words: ExternalAlignmentWord[] = [];
    for (const segment of raw.segments) {
      if (!isRecord(segment)) {
        continue;
      }
      const nestedWords = extractExternalAlignmentWords(segment);
      if (nestedWords.length > 0) {
        words.push(...nestedWords);
        continue;
      }

      const text = pickString(segment, ["text", "transcript"]);
      const startSec = readTimeSec(segment, ["startSec", "start"], ["startMs", "start_ms"]);
      const endSec = readTimeSec(segment, ["endSec", "end"], ["endMs", "end_ms"], startSec ?? 0);
      if (text && startSec !== null && endSec !== null) {
        words.push(...approximateWordsFromSegment(text, startSec, endSec));
      }
    }
    return words.sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec);
  }

  const text = pickString(raw, ["text", "transcript"]);
  const startSec = readTimeSec(raw, ["startSec", "start"], ["startMs", "start_ms"]);
  const endSec = readTimeSec(raw, ["endSec", "end"], ["endMs", "end_ms"], startSec ?? 0);
  if (text && startSec !== null && endSec !== null) {
    return approximateWordsFromSegment(text, startSec, endSec);
  }

  return [];
}

function normalizeExternalAlignmentShotRow(input: {
  row: Record<string, unknown>;
  fallbackEntry?: ResolvedShotText;
  provider: string;
  version?: string;
}): NarrationAlignmentShot | null {
  const shotId = pickString(input.row, ["shotId", "id"]) ?? input.fallbackEntry?.shot.id;
  if (!shotId) {
    return null;
  }

  const fallbackStartSec = input.fallbackEntry?.shot.startSec ?? 0;
  const fallbackDurationSec = input.fallbackEntry?.shot.durationSec ?? 0.001;
  const startSec =
    readTimeSec(input.row, ["startSec", "start"], ["startMs", "start_ms"], fallbackStartSec) ?? fallbackStartSec;
  const durationSec =
    parseNumber(input.row.durationSec) ??
    parseNumber(input.row.duration_seconds) ??
    (() => {
      const endSec = readTimeSec(input.row, ["endSec", "end"], ["endMs", "end_ms"]);
      return endSec === null ? fallbackDurationSec : Math.max(0.001, endSec - startSec);
    })();
  const text = pickString(input.row, ["text", "narration", "transcript"]) ?? input.fallbackEntry?.text ?? "";

  return buildShotAlignmentFromWords({
    shotId,
    startSec,
    durationSec,
    text,
    provider: input.provider,
    version: input.version,
    sourceKind: "provider",
    words: extractExternalAlignmentWords(input.row)
  });
}

function normalizeExternalAlignmentDocument(input: {
  raw: unknown;
  provider: ExternalAlignmentProviderSpec;
  audioInput: AudioBuildInput;
  narrationPath: string;
  narration: MonoWav;
  shotEntries: ResolvedShotText[];
}): NarrationAlignmentDocument | null {
  const rawValue =
    typeof input.raw === "string" && (input.raw.trim().startsWith("{") || input.raw.trim().startsWith("["))
      ? (() => {
          try {
            return JSON.parse(input.raw) as unknown;
          } catch {
            return input.raw;
          }
        })()
      : input.raw;

  const plannedDurationSec = Math.max(
    0.001,
    input.audioInput.shots.reduce((max, shot) => Math.max(max, shot.startSec + shot.durationSec), 0)
  );
  const audioDurationSec = input.narration.samples.length / Math.max(1, input.narration.sampleRate);

  if (isRecord(rawValue) && Array.isArray(rawValue.shots)) {
    const provider = pickString(rawValue, ["provider"]) ?? input.provider.id;
    const version = pickString(rawValue, ["version"]) ?? undefined;
    const sourceKind =
      pickString(rawValue, ["sourceKind"]) === "heuristic" ? ("heuristic" as const) : ("provider" as const);
    const fallbackById = new Map(input.shotEntries.map((entry) => [entry.shot.id, entry]));
    const shots = rawValue.shots
      .map((row, index) => {
        if (!isRecord(row)) {
          return null;
        }
        const fallbackEntry =
          fallbackById.get(pickString(row, ["shotId", "id"]) ?? "") ?? input.shotEntries[index];
        return normalizeExternalAlignmentShotRow({
          row,
          fallbackEntry,
          provider,
          version
        });
      })
      .filter((shot): shot is NarrationAlignmentShot => shot !== null);

    if (shots.length > 0) {
      return {
        schema_version: "1.0",
        generated_at: new Date().toISOString(),
        strategy: pickString(rawValue, ["strategy"]) ?? `provider_${input.provider.id}_v1`,
        voice: input.audioInput.voice,
        speed: input.audioInput.speed,
        provider,
        ...(version ? { version } : {}),
        sourceKind,
        narration_path: input.narrationPath,
        audio_duration_sec: audioDurationSec,
        planned_duration_sec: plannedDurationSec,
        shots
      };
    }
  }

  const words = extractExternalAlignmentWords(rawValue);
  if (words.length === 0) {
    return null;
  }

  const shots = input.shotEntries.map((entry) => {
    const shotStartSec = Math.max(0, entry.shot.startSec);
    const shotEndSec = shotStartSec + Math.max(0.001, entry.shot.durationSec);
    const shotWords = words.filter((word) => {
      const midpointSec = (word.startSec + word.endSec) * 0.5;
      return midpointSec >= shotStartSec && midpointSec <= shotEndSec;
    });

    return buildShotAlignmentFromWords({
      shotId: entry.shot.id,
      startSec: shotStartSec,
      durationSec: entry.shot.durationSec,
      text: entry.text,
      provider: input.provider.id,
      sourceKind: "provider",
      words: shotWords
    });
  });

  if (!shots.some((shot) => shot.words.length > 0)) {
    return null;
  }

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    strategy: `provider_${input.provider.id}_v1`,
    voice: input.audioInput.voice,
    speed: input.audioInput.speed,
    provider: input.provider.id,
    sourceKind: "provider",
    narration_path: input.narrationPath,
    audio_duration_sec: audioDurationSec,
    planned_duration_sec: plannedDurationSec,
    shots
  };
}

function readExternalAlignmentPayload(
  provider: ExternalAlignmentProviderSpec,
  stdout: string,
  outputPath: string
): unknown {
  if (fs.existsSync(outputPath)) {
    const raw = readText(outputPath);
    if (outputPath.toLowerCase().endsWith(".json")) {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    }
    if (provider.id === "mfa") {
      return raw;
    }
    return raw;
  }

  const trimmedStdout = stdout.trim();
  if (trimmedStdout.length === 0) {
    return null;
  }
  try {
    return JSON.parse(trimmedStdout) as unknown;
  } catch {
    return trimmedStdout;
  }
}

function runExternalAlignmentProvider(input: {
  provider: ExternalAlignmentProviderSpec;
  audioInput: AudioBuildInput;
  narrationPath: string;
  narration: MonoWav;
  shotEntries: ResolvedShotText[];
}): NarrationAlignmentDocument | null {
  const requestPath = path.join(
    input.audioInput.outDir,
    `narration_alignment.${input.provider.id}.request.json`
  );
  const outputPath = path.join(
    input.audioInput.outDir,
    `narration_alignment.${input.provider.id}${resolveProviderOutputExtension(input.provider.id)}`
  );
  writeJson(requestPath, {
    schema_version: "1.0",
    provider: input.provider.id,
    narrationPath: input.narrationPath,
    scriptText: input.audioInput.scriptText,
    voice: input.audioInput.voice,
    speed: input.audioInput.speed,
    outDir: input.audioInput.outDir,
    shots: input.shotEntries.map((entry) => ({
      shotId: entry.shot.id,
      startSec: entry.shot.startSec,
      durationSec: entry.shot.durationSec,
      text: entry.text
    }))
  });

  const env = {
    ...process.env,
    AUDIO_ALIGNMENT_PROVIDER: input.provider.id,
    AUDIO_ALIGNMENT_REQUEST_PATH: requestPath,
    AUDIO_ALIGNMENT_OUTPUT_PATH: outputPath,
    EC_ALIGNMENT_PROVIDER: input.provider.id,
    EC_ALIGNMENT_REQUEST_PATH: requestPath,
    EC_ALIGNMENT_OUTPUT_PATH: outputPath
  };
  const result = spawnSync(input.provider.command, [], {
    shell: true,
    cwd: input.audioInput.outDir,
    env,
    encoding: "utf8",
    stdio: "pipe",
    maxBuffer: 20 * 1024 * 1024
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = normalizeWhitespace(result.stderr ?? "");
    const stdout = normalizeWhitespace(result.stdout ?? "");
    const detail = stderr || stdout || `exit_code=${result.status ?? 1}`;
    throw new Error(`${input.provider.id} alignment provider failed: ${detail}`);
  }

  const raw = readExternalAlignmentPayload(input.provider, result.stdout ?? "", outputPath);
  if (raw === null) {
    return null;
  }

  return normalizeExternalAlignmentDocument({
    raw,
    provider: input.provider,
    audioInput: input.audioInput,
    narrationPath: input.narrationPath,
    narration: input.narration,
    shotEntries: input.shotEntries
  });
}

function resolveNarrationAlignmentDocument(input: {
  audioInput: AudioBuildInput;
  narrationPath: string;
  narration: MonoWav;
  shotEntries: ResolvedShotText[];
}): ExternalAlignmentResolution {
  const heuristicAlignment = buildHeuristicNarrationAlignment(
    input.audioInput,
    input.narrationPath,
    input.narration,
    input.shotEntries
  );
  const providers = resolveConfiguredAlignmentProviders();
  if (providers.length === 0) {
    return {
      alignment: heuristicAlignment,
      provider: heuristicAlignment.provider,
      sourceKind: "heuristic",
      fallbackUsed: false
    };
  }

  for (const provider of providers) {
    try {
      const resolved = runExternalAlignmentProvider({
        provider,
        audioInput: input.audioInput,
        narrationPath: input.narrationPath,
        narration: input.narration,
        shotEntries: input.shotEntries
      });
      if (!resolved || !resolved.shots.some((shot) => shot.words.length > 0)) {
        continue;
      }
      return {
        alignment: resolved,
        provider: resolved.provider,
        sourceKind: resolved.sourceKind ?? "provider",
        fallbackUsed: false
      };
    } catch {
      continue;
    }
  }

  return {
    alignment: heuristicAlignment,
    provider: heuristicAlignment.provider,
    sourceKind: "heuristic",
    fallbackUsed: true
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
  const alignmentInput: AudioBuildInput = {
    ...input,
    scriptText: appliedScriptText
  };
  const shotEntries = resolveShotTextEntries(alignmentInput);
  const resolvedAlignment = resolveNarrationAlignmentDocument({
    audioInput: alignmentInput,
    narrationPath,
    narration,
    shotEntries
  });
  const alignment = resolvedAlignment.alignment;
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
    alignmentProvider: resolvedAlignment.provider,
    alignmentSourceKind: resolvedAlignment.sourceKind,
    alignmentFallbackUsed: resolvedAlignment.fallbackUsed,
    appliedScriptText,
    placementPlan
  };
}

export function loadFixtureJson<T>(filePath: string): T {
  const raw = readText(filePath);
  return JSON.parse(raw) as T;
}
