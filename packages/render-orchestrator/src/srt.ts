import type { AlignmentHook, DeterministicSequence, SubtitleAlignmentContext, SubtitleCue } from "./types";

const EMPHASIS_MARKER = /[*]{1,2}([^*]+)[*]{1,2}/g;
const SUBTITLE_BREAK_WORDS = new Set(["and", "but", "so", "because", "while", "then", "with", "when", "if"]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function countWords(text: string): number {
  const tokens = text.match(/[A-Za-z0-9']+/g);
  return tokens && tokens.length > 0 ? tokens.length : 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBreakToken(token: string): string {
  return token.toLowerCase().replace(/<<|>>/g, "").replace(/[^a-z0-9']/g, "").trim();
}

function splitPhraseLine(line: string, maxWords: number = 8): string[] {
  const words = line.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length <= maxWords) {
    return [line.trim()];
  }

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < words.length) {
    const remaining = words.length - cursor;
    if (remaining <= maxWords) {
      chunks.push(words.slice(cursor).join(" "));
      break;
    }

    const maxEnd = Math.min(words.length, cursor + maxWords);
    let splitIndex = maxEnd;

    for (let i = maxEnd; i > cursor + 3; i -= 1) {
      const previous = words[i - 1] ?? "";
      const next = words[i] ?? "";
      const nextNormalized = normalizeBreakToken(next);
      if (/[,:;!?]$/.test(previous) || /^<</.test(next) || SUBTITLE_BREAK_WORDS.has(nextNormalized)) {
        splitIndex = i;
        break;
      }
    }

    chunks.push(words.slice(cursor, splitIndex).join(" "));
    cursor = splitIndex;
  }

  return chunks;
}

function splitNarration(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return ["..."];
  }

  const sentenceParts = trimmed
    .split(/(?<=[.!?,;:])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const baseParts = sentenceParts.length > 0 ? sentenceParts : [trimmed];
  const lines: string[] = [];
  for (const part of baseParts) {
    lines.push(...splitPhraseLine(part, 8));
  }
  return lines.filter((line) => line.length > 0);
}

export function applyEmphasis(rawText: string, emphasisWords: string[]): string {
  let text = rawText.replace(EMPHASIS_MARKER, (_, token: string) => {
    const normalized = token.trim().toUpperCase();
    return `<<${normalized}>>`;
  });

  const uniqueWords = new Set<string>([
    ...emphasisWords.map((word) => word.trim()).filter((word) => word.length > 0)
  ]);

  for (const word of uniqueWords) {
    const matcher = new RegExp(`(?<!<)\\b${escapeRegExp(word)}\\b(?!>)`, "gi");
    text = text.replace(matcher, (token) => `<<${token.toUpperCase()}>>`);
  }

  return text;
}

function formatSrtTimestamp(milliseconds: number): string {
  const ms = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const mmm = String(millis).padStart(3, "0");
  return `${hh}:${mm}:${ss},${mmm}`;
}

function frameToMs(frame: number, fps: number): number {
  return (frame / fps) * 1000;
}

export function buildSubtitleCues(
  sequences: DeterministicSequence[],
  fps: number,
  alignmentHook?: AlignmentHook
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let runningIndex = 1;

  for (const sequence of sequences) {
    const narration = applyEmphasis(sequence.narration, sequence.emphasisWords);
    const lines = splitNarration(narration);
    const lineWords = lines.map((line) => countWords(line));
    const totalWords = lineWords.reduce((sum, count) => sum + count, 0);
    const sequenceStart = sequence.from;
    const sequenceEnd = sequence.from + sequence.duration;

    let localCursor = sequenceStart;
    let consumedWords = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const words = lineWords[i];
      const ratio = words / totalWords;
      const rawDuration = Math.round(sequence.duration * ratio);
      const maxRemaining = sequenceEnd - localCursor;
      const isLast = i === lines.length - 1;
      const duration = isLast ? maxRemaining : clamp(rawDuration, 1, Math.max(1, maxRemaining - 1));

      const cue: SubtitleCue = {
        index: runningIndex,
        startFrame: localCursor,
        endFrame: Math.max(localCursor, localCursor + duration - 1),
        text: lines[i]
      };

      const context: SubtitleAlignmentContext = {
        sequence,
        cueIndexInSequence: i,
        cueCountInSequence: lines.length,
        wordStartIndex: consumedWords,
        wordEndIndexExclusive: consumedWords + words,
        lines
      };

      const aligned = alignmentHook?.(cue, context) ?? null;
      if (aligned) {
        cue.startFrame = Math.max(0, aligned.startFrame);
        cue.endFrame = Math.max(cue.startFrame, aligned.endFrame);
      }

      cues.push(cue);
      runningIndex += 1;
      consumedWords += words;
      localCursor = cue.endFrame + 1;
      if (localCursor >= sequenceEnd) {
        break;
      }
    }
  }

  return cues;
}

export function toSrt(cues: SubtitleCue[], fps: number): string {
  const blocks = cues.map((cue) => {
    const start = formatSrtTimestamp(frameToMs(cue.startFrame, fps));
    const end = formatSrtTimestamp(frameToMs(cue.endFrame + 1, fps));
    return `${cue.index}\n${start} --> ${end}\n${cue.text}`;
  });
  return `${blocks.join("\n\n")}\n`;
}
