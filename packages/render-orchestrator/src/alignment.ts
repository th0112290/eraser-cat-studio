import fs from "node:fs";
import type {
  AlignmentHook,
  DeterministicSequence,
  DeterministicSequenceAlignment,
  DeterministicSequenceAlignmentPause,
  DeterministicSequenceAlignmentPauseStrength,
  DeterministicSequenceAlignmentViseme,
  DeterministicSequenceAlignmentVisemeCue,
  DeterministicSequenceAlignmentWord
} from "./types";

type NarrationAlignmentWordLike = {
  text?: unknown;
  token?: unknown;
  word?: unknown;
  startSec?: unknown;
  endSec?: unknown;
  localStartSec?: unknown;
  localEndSec?: unknown;
  start?: unknown;
  end?: unknown;
  startMs?: unknown;
  endMs?: unknown;
  localStartMs?: unknown;
  localEndMs?: unknown;
  viseme?: unknown;
  phoneme?: unknown;
  mouthShape?: unknown;
  intensity?: unknown;
  confidence?: unknown;
  score?: unknown;
  emphasis?: unknown;
  emphasized?: unknown;
  isEmphasis?: unknown;
};

type NarrationAlignmentVisemeCueLike = {
  localTimeSec?: unknown;
  timeSec?: unknown;
  localTimeMs?: unknown;
  timeMs?: unknown;
  startSec?: unknown;
  endSec?: unknown;
  localStartSec?: unknown;
  localEndSec?: unknown;
  viseme?: unknown;
  phoneme?: unknown;
  mouthShape?: unknown;
  label?: unknown;
  intensity?: unknown;
  confidence?: unknown;
  score?: unknown;
};

type NarrationAlignmentPauseLike = {
  startSec?: unknown;
  endSec?: unknown;
  localStartSec?: unknown;
  localEndSec?: unknown;
  startMs?: unknown;
  endMs?: unknown;
  localStartMs?: unknown;
  localEndMs?: unknown;
  durationSec?: unknown;
  durationMs?: unknown;
  strength?: unknown;
  kind?: unknown;
  type?: unknown;
};

type NarrationAlignmentShotLike = {
  shotId?: unknown;
  id?: unknown;
  provider?: unknown;
  version?: unknown;
  sourceKind?: unknown;
  words?: unknown;
  wordTimings?: unknown;
  wordAlignment?: unknown;
  visemeCues?: unknown;
  visemes?: unknown;
  phonemeVisemes?: unknown;
  phonemes?: unknown;
  pauses?: unknown;
  pauseMap?: unknown;
  emphasisWords?: unknown;
  emphasis_words?: unknown;
};

type NarrationAlignmentDocumentLike = {
  provider?: unknown;
  version?: unknown;
  sourceKind?: unknown;
  shots?: unknown;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "no" || normalized === "n" || normalized === "0") {
      return false;
    }
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

function readTimeSec(record: Record<string, unknown>, secKeys: string[], msKeys: string[], fallbackSec: number | null = null): number {
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
  return Math.max(0, fallbackSec ?? 0);
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeViseme(value: unknown): DeterministicSequenceAlignmentViseme | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  if (
    normalized === "mouth_closed" ||
    normalized === "closed" ||
    normalized === "m" ||
    normalized === "sil" ||
    normalized === "silence" ||
    normalized === "rest"
  ) {
    return "mouth_closed";
  }
  if (
    normalized === "mouth_open_small" ||
    normalized === "open_small" ||
    normalized === "small" ||
    normalized === "ee" ||
    normalized === "ih" ||
    normalized === "iy" ||
    normalized === "eh"
  ) {
    return "mouth_open_small";
  }
  if (
    normalized === "mouth_open_wide" ||
    normalized === "open_wide" ||
    normalized === "wide" ||
    normalized === "aa" ||
    normalized === "ae" ||
    normalized === "ah" ||
    normalized === "a"
  ) {
    return "mouth_open_wide";
  }
  if (
    normalized === "mouth_round_o" ||
    normalized === "round" ||
    normalized === "o" ||
    normalized === "oh" ||
    normalized === "ow" ||
    normalized === "uw" ||
    normalized === "uh" ||
    normalized === "w"
  ) {
    return "mouth_round_o";
  }

  return null;
}

function resolvePauseStrength(
  durationSec: number,
  rawStrength: unknown
): DeterministicSequenceAlignmentPauseStrength {
  if (typeof rawStrength === "string") {
    const normalized = rawStrength.trim().toLowerCase();
    if (normalized === "micro" || normalized === "phrase" || normalized === "sentence") {
      return normalized;
    }
  }

  if (durationSec >= 0.48) {
    return "sentence";
  }
  if (durationSec >= 0.22) {
    return "phrase";
  }
  return "micro";
}

function coerceStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeAlignmentWord(entry: unknown): DeterministicSequenceAlignmentWord | null {
  if (!isRecord(entry)) {
    return null;
  }

  const text = pickString(entry, ["text", "token", "word"]);
  if (!text) {
    return null;
  }

  const localStartSec = readTimeSec(
    entry,
    ["localStartSec", "local_start_sec", "localStart", "local_start", "startSec", "start"],
    ["localStartMs", "local_start_ms", "startMs", "start_ms"]
  );
  const localEndSecRaw = readTimeSec(
    entry,
    ["localEndSec", "local_end_sec", "localEnd", "local_end", "endSec", "end"],
    ["localEndMs", "local_end_ms", "endMs", "end_ms"],
    localStartSec
  );
  const localEndSec = Math.max(localStartSec, localEndSecRaw);
  const startSec = readTimeSec(
    entry,
    ["startSec", "start_sec", "start"],
    ["startMs", "start_ms"],
    localStartSec
  );
  const endSec = Math.max(
    startSec,
    readTimeSec(entry, ["endSec", "end_sec", "end"], ["endMs", "end_ms"], localEndSec)
  );
  const emphasis =
    parseBoolean(entry.emphasis) ??
    parseBoolean(entry.emphasized) ??
    parseBoolean(entry.isEmphasis) ??
    false;
  const intensity =
    parseNumber(entry.intensity) ??
    parseNumber(entry.confidence) ??
    parseNumber(entry.score) ??
    (emphasis ? 0.92 : 0.62);
  const viseme =
    normalizeViseme(entry.viseme) ??
    normalizeViseme(entry.phoneme) ??
    normalizeViseme(entry.mouthShape) ??
    "mouth_closed";

  return {
    text,
    startSec,
    endSec,
    localStartSec,
    localEndSec,
    viseme,
    intensity: clamp(intensity, 0, 1),
    emphasis
  };
}

function normalizeAlignmentVisemeCue(entry: unknown): DeterministicSequenceAlignmentVisemeCue | null {
  if (!isRecord(entry)) {
    return null;
  }

  const viseme =
    normalizeViseme(entry.viseme) ??
    normalizeViseme(entry.phoneme) ??
    normalizeViseme(entry.mouthShape) ??
    normalizeViseme(entry.label);
  if (!viseme) {
    return null;
  }

  const startSec = readTimeSec(
    entry,
    ["localTimeSec", "local_time_sec", "timeSec", "time_sec", "localStartSec", "local_start_sec", "startSec"],
    ["localTimeMs", "local_time_ms", "timeMs", "time_ms", "localStartMs", "local_start_ms", "startMs"]
  );
  const endSec = readTimeSec(
    entry,
    ["localEndSec", "local_end_sec", "endSec", "end_sec"],
    ["localEndMs", "local_end_ms", "endMs", "end_ms"],
    startSec
  );
  const localTimeSec = endSec > startSec ? (startSec + endSec) * 0.5 : startSec;
  const intensity =
    parseNumber(entry.intensity) ??
    parseNumber(entry.confidence) ??
    parseNumber(entry.score) ??
    0.72;

  return {
    localTimeSec,
    viseme,
    intensity: clamp(intensity, 0, 1)
  };
}

function normalizeAlignmentPause(entry: unknown): DeterministicSequenceAlignmentPause | null {
  if (!isRecord(entry)) {
    return null;
  }

  const localStartSec = readTimeSec(
    entry,
    ["localStartSec", "local_start_sec", "localStart", "local_start", "startSec", "start"],
    ["localStartMs", "local_start_ms", "startMs", "start_ms"]
  );
  const explicitDurationSec =
    parseNumber(entry.durationSec) ??
    (parseNumber(entry.durationMs) !== null ? (parseNumber(entry.durationMs) as number) / 1000 : null);
  const localEndSecRaw = readTimeSec(
    entry,
    ["localEndSec", "local_end_sec", "localEnd", "local_end", "endSec", "end"],
    ["localEndMs", "local_end_ms", "endMs", "end_ms"],
    localStartSec + Math.max(0, explicitDurationSec ?? 0)
  );
  const localEndSec = Math.max(localStartSec, localEndSecRaw);
  const startSec = readTimeSec(
    entry,
    ["startSec", "start_sec", "start"],
    ["startMs", "start_ms"],
    localStartSec
  );
  const endSec = Math.max(
    startSec,
    readTimeSec(entry, ["endSec", "end_sec", "end"], ["endMs", "end_ms"], localEndSec)
  );
  const durationSec = Math.max(0, localEndSec - localStartSec);
  if (durationSec <= 0.01) {
    return null;
  }

  return {
    startSec,
    endSec,
    localStartSec,
    localEndSec,
    durationSec,
    strength: resolvePauseStrength(durationSec, entry.strength ?? entry.kind ?? entry.type)
  };
}

function deriveVisemeCuesFromWords(
  words: DeterministicSequenceAlignmentWord[]
): DeterministicSequenceAlignmentVisemeCue[] {
  return words
    .map((word) => ({
      localTimeSec: clamp((word.localStartSec + word.localEndSec) * 0.5, 0, Math.max(0, word.localEndSec)),
      viseme: word.viseme,
      intensity: word.intensity
    }))
    .sort((left, right) => left.localTimeSec - right.localTimeSec)
    .filter((entry, index, all) => {
      const previous = all[index - 1];
      if (!previous) {
        return true;
      }
      return !(previous.localTimeSec === entry.localTimeSec && previous.viseme === entry.viseme);
    });
}

function derivePauseMapFromWords(
  words: DeterministicSequenceAlignmentWord[]
): DeterministicSequenceAlignmentPause[] {
  const pauses: DeterministicSequenceAlignmentPause[] = [];
  for (let index = 1; index < words.length; index += 1) {
    const previous = words[index - 1];
    const current = words[index];
    const localGap = Math.max(0, current.localStartSec - previous.localEndSec);
    if (localGap < 0.12) {
      continue;
    }
    const gapStartSec = Math.max(previous.endSec, previous.startSec);
    const gapEndSec = Math.max(gapStartSec, current.startSec);
    pauses.push({
      startSec: gapStartSec,
      endSec: gapEndSec,
      localStartSec: previous.localEndSec,
      localEndSec: current.localStartSec,
      durationSec: localGap,
      strength: resolvePauseStrength(localGap, null)
    });
  }
  return pauses;
}

function normalizeShotAlignment(
  shotRow: NarrationAlignmentShotLike,
  topLevelProvider: string,
  topLevelVersion: string | undefined,
  topLevelSourceKind: DeterministicSequenceAlignment["sourceKind"]
): DeterministicSequenceAlignment | null {
  const shotRecord = shotRow as Record<string, unknown>;
  const shotId = pickString(shotRecord, ["shotId", "id"]);
  if (!shotId) {
    return null;
  }

  const rawWords = Array.isArray(shotRecord.words)
    ? shotRecord.words
    : Array.isArray(shotRecord.wordTimings)
      ? shotRecord.wordTimings
      : Array.isArray(shotRecord.wordAlignment)
        ? shotRecord.wordAlignment
        : [];
  const rawVisemes = Array.isArray(shotRecord.visemeCues)
    ? shotRecord.visemeCues
    : Array.isArray(shotRecord.visemes)
      ? shotRecord.visemes
      : Array.isArray(shotRecord.phonemeVisemes)
        ? shotRecord.phonemeVisemes
        : Array.isArray(shotRecord.phonemes)
          ? shotRecord.phonemes
          : [];
  const rawPauses = Array.isArray(shotRecord.pauseMap)
    ? shotRecord.pauseMap
    : Array.isArray(shotRecord.pauses)
      ? shotRecord.pauses
      : [];

  const words = rawWords
    .map((entry) => normalizeAlignmentWord(entry))
    .filter((entry): entry is DeterministicSequenceAlignmentWord => entry !== null)
    .sort((left, right) => left.localStartSec - right.localStartSec);
  const visemeCuesBase = rawVisemes
    .map((entry) => normalizeAlignmentVisemeCue(entry))
    .filter((entry): entry is DeterministicSequenceAlignmentVisemeCue => entry !== null)
    .sort((left, right) => left.localTimeSec - right.localTimeSec)
    .filter((entry, index, all) => {
      const previous = all[index - 1];
      if (!previous) {
        return true;
      }
      return !(
        previous.localTimeSec === entry.localTimeSec &&
        previous.viseme === entry.viseme &&
        previous.intensity === entry.intensity
      );
    });
  const pauseMapBase = rawPauses
    .map((entry) => normalizeAlignmentPause(entry))
    .filter((entry): entry is DeterministicSequenceAlignmentPause => entry !== null)
    .sort((left, right) => left.localStartSec - right.localStartSec);

  const topLevelEmphasisWords = [
    ...coerceStringList(shotRecord.emphasisWords),
    ...coerceStringList(shotRecord.emphasis_words)
  ];
  const derivedEmphasisWords = words
    .filter((word) => word.emphasis || word.intensity >= 0.9)
    .map((word) => word.text.trim())
    .filter((word) => word.length > 0);
  const emphasisWords = Array.from(new Set([...topLevelEmphasisWords, ...derivedEmphasisWords]));
  const provider = pickString(shotRecord, ["provider"]) ?? topLevelProvider;
  const version = pickString(shotRecord, ["version"]) ?? topLevelVersion;
  const sourceKindRaw = pickString(shotRecord, ["sourceKind"]);
  const sourceKind =
    sourceKindRaw === "heuristic" || sourceKindRaw === "provider"
      ? sourceKindRaw
      : provider === "heuristic"
        ? "heuristic"
        : topLevelSourceKind;

  if (words.length === 0 && visemeCuesBase.length === 0 && pauseMapBase.length === 0 && emphasisWords.length === 0) {
    return null;
  }

  return {
    shotId,
    provider,
    version,
    sourceKind,
    words,
    visemeCues: visemeCuesBase.length > 0 ? visemeCuesBase : deriveVisemeCuesFromWords(words),
    pauseMap: pauseMapBase.length > 0 ? pauseMapBase : derivePauseMapFromWords(words),
    emphasisWords
  };
}

export function normalizeNarrationAlignmentDocument(
  filePath: string | undefined
): Map<string, DeterministicSequenceAlignment> | null {
  if (!filePath) {
    return null;
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Narration alignment file not found: ${filePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as NarrationAlignmentDocumentLike;
  const shotRows = Array.isArray(parsed.shots) ? parsed.shots : [];
  const provider =
    typeof parsed.provider === "string" && parsed.provider.trim().length > 0
      ? parsed.provider.trim()
      : "heuristic";
  const version =
    typeof parsed.version === "string" && parsed.version.trim().length > 0
      ? parsed.version.trim()
      : undefined;
  const sourceKind =
    typeof parsed.sourceKind === "string" && (parsed.sourceKind === "heuristic" || parsed.sourceKind === "provider")
      ? parsed.sourceKind
      : provider === "heuristic"
        ? "heuristic"
        : "provider";
  const byShot = new Map<string, DeterministicSequenceAlignment>();

  for (const shotRow of shotRows) {
    if (!isRecord(shotRow)) {
      continue;
    }
    const normalized = normalizeShotAlignment(
      shotRow as NarrationAlignmentShotLike,
      provider,
      version,
      sourceKind
    );
    if (!normalized) {
      continue;
    }
    byShot.set(normalized.shotId, normalized);
  }

  return byShot;
}

function mergeEmphasisWords(left: string[], right: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const candidate of [...left, ...right]) {
    const trimmed = candidate.trim();
    const token = normalizeToken(trimmed);
    if (trimmed.length === 0 || token.length === 0 || seen.has(token)) {
      continue;
    }
    seen.add(token);
    merged.push(trimmed);
  }
  return merged;
}

export function applyNarrationAlignmentToSequences(
  sequences: DeterministicSequence[],
  fps: number,
  alignmentByShot: Map<string, DeterministicSequenceAlignment> | null
): DeterministicSequence[] {
  if (!alignmentByShot || alignmentByShot.size === 0) {
    return sequences;
  }

  return sequences.map((sequence) => {
    const aligned = alignmentByShot.get(sequence.shotId);
    if (!aligned) {
      return sequence;
    }

    const visemeTrack = aligned.visemeCues
      .map((cue) => ({
        f: clamp(Math.round(cue.localTimeSec * fps), 0, Math.max(0, sequence.duration - 1)),
        viseme: cue.viseme,
        intensity: cue.intensity
      }))
      .sort((left, right) => left.f - right.f)
      .filter((entry, index, all) => {
        const previous = all[index - 1];
        if (!previous) {
          return true;
        }
        return !(previous.f === entry.f && previous.viseme === entry.viseme && previous.intensity === entry.intensity);
      });

    const mergedEmphasisWords = mergeEmphasisWords(sequence.emphasisWords, aligned.emphasisWords);
    const emphasisWordSet = new Set(
      mergedEmphasisWords
        .map((value) => normalizeToken(value))
        .filter((value) => value.length > 0)
    );
    const emphasisCandidate = aligned.words.reduce<DeterministicSequenceAlignmentWord | null>((best, word) => {
      const normalized = normalizeToken(word.text);
      const positionRatio = sequence.duration <= 1 ? 0 : clamp((word.localStartSec * fps) / sequence.duration, 0, 1);
      const positionScore = 1 - Math.abs(positionRatio - 0.42);
      const explicitBonus = word.emphasis || emphasisWordSet.has(normalized) ? 1.25 : 0;
      const score = word.intensity * 0.75 + positionScore * 0.5 + explicitBonus;
      if (!best) {
        return word;
      }
      const bestNormalized = normalizeToken(best.text);
      const bestRatio = sequence.duration <= 1 ? 0 : clamp((best.localStartSec * fps) / sequence.duration, 0, 1);
      const bestScore =
        best.intensity * 0.75 +
        (1 - Math.abs(bestRatio - 0.42)) * 0.5 +
        (best.emphasis || emphasisWordSet.has(bestNormalized) ? 1.25 : 0);
      return score > bestScore ? word : best;
    }, null);

    const emphasisAtFrame =
      emphasisCandidate != null
        ? clamp(
            Math.round(((emphasisCandidate.localStartSec + emphasisCandidate.localEndSec) * 0.5) * fps),
            0,
            Math.max(0, sequence.duration - 1)
          )
        : sequence.emphasisAtFrame;

    const existingExpressionTrack = sequence.characterTracks.expressionTrack ?? [];
    const latestBaseExpression =
      [...existingExpressionTrack]
        .sort((left, right) => left.f - right.f)
        .filter((entry) => (typeof emphasisAtFrame === "number" ? entry.f <= emphasisAtFrame : true))
        .at(-1)?.expression ?? "neutral";
    const hasNearbyExpressionChange =
      typeof emphasisAtFrame === "number"
        ? existingExpressionTrack.some((entry) => Math.abs(entry.f - emphasisAtFrame) <= 8)
        : false;
    const emphasisExpression =
      emphasisCandidate && (emphasisCandidate.emphasis || emphasisCandidate.intensity >= 0.92)
        ? "surprised"
        : emphasisCandidate && emphasisCandidate.intensity >= 0.72
          ? "happy"
          : null;
    const expressionTrack =
      typeof emphasisAtFrame === "number" && emphasisExpression && !hasNearbyExpressionChange
        ? [
            ...existingExpressionTrack,
            { f: emphasisAtFrame, expression: emphasisExpression },
            { f: Math.min(sequence.duration - 1, emphasisAtFrame + 10), expression: latestBaseExpression }
          ].sort((left, right) => left.f - right.f)
        : existingExpressionTrack;

    return {
      ...sequence,
      emphasisWords: mergedEmphasisWords,
      emphasisAtFrame,
      alignment: aligned,
      characterTracks: {
        ...sequence.characterTracks,
        ...(visemeTrack.length > 0 ? { visemeTrack } : {}),
        expressionTrack
      }
    };
  });
}

export function buildNarrationAlignmentHook(
  fps: number,
  alignmentByShot: Map<string, DeterministicSequenceAlignment> | null,
  fallbackHook?: AlignmentHook
): AlignmentHook | undefined {
  if ((!alignmentByShot || alignmentByShot.size === 0) && !fallbackHook) {
    return undefined;
  }

  return (cue, context) => {
    const alignedShot = alignmentByShot?.get(context.sequence.shotId);
    if (alignedShot && alignedShot.words.length > 0) {
      const startIndex = clamp(context.wordStartIndex, 0, Math.max(0, alignedShot.words.length - 1));
      const endIndex = clamp(context.wordEndIndexExclusive - 1, 0, Math.max(0, alignedShot.words.length - 1));
      const startWord = alignedShot.words[startIndex];
      const endWord = alignedShot.words[Math.max(startIndex, endIndex)];
      if (startWord && endWord) {
        let startFrame = Math.max(context.sequence.from, Math.round(startWord.startSec * fps));
        let endFrame = Math.min(
          context.sequence.from + context.sequence.duration - 1,
          Math.max(startFrame, Math.round(endWord.endSec * fps) - 1)
        );

        const interruptingPause = alignedShot.pauseMap.find(
          (pause) =>
            pause.durationSec >= 0.12 &&
            pause.localStartSec > startWord.localStartSec + 0.02 &&
            pause.localStartSec < endWord.localEndSec
        );
        if (interruptingPause && context.cueIndexInSequence < context.cueCountInSequence - 1) {
          endFrame = Math.min(endFrame, Math.max(startFrame, Math.round(interruptingPause.startSec * fps) - 1));
        }

        const leadingPause = [...alignedShot.pauseMap]
          .reverse()
          .find(
            (pause) =>
              pause.durationSec >= 0.18 &&
              pause.localEndSec <= startWord.localStartSec + 0.04 &&
              pause.localEndSec >= Math.max(0, startWord.localStartSec - 0.32)
          );
        if (leadingPause && context.cueIndexInSequence > 0) {
          startFrame = Math.max(startFrame, Math.round(leadingPause.endSec * fps));
        }

        return {
          startFrame,
          endFrame: Math.max(startFrame, endFrame)
        };
      }
    }

    return fallbackHook?.(cue, context) ?? null;
  };
}
