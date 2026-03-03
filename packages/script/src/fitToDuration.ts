export type DurationFitStrategy = "unchanged" | "trimmed" | "expanded";

export type DurationFitResult = {
  fittedText: string;
  targetMinutes: number;
  targetWords: number;
  originalWords: number;
  actualWords: number;
  wpm: number;
  strategy: DurationFitStrategy;
};

const TARGET_MINUTES = 10;

function clampWpm(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 140;
  }
  return Math.max(80, Math.min(220, Math.round(value)));
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function countWords(text: string): number {
  const tokens = text.match(/[A-Za-z0-9'_-]+/g);
  return tokens ? tokens.length : 0;
}

function splitSentences(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return [];
  }

  const chunks = normalized
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return chunks.length > 0 ? chunks : [normalized];
}

function ensureSentenceTerminal(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  if (/[.!?]$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}.`;
}

function sentenceStem(value: string): string {
  return value.replace(/[.!?]+$/g, "").trim();
}

export function fitToDuration(text: string, wpm: number = 140): DurationFitResult {
  const safeWpm = clampWpm(wpm);
  const targetWords = safeWpm * TARGET_MINUTES;
  const sentences = splitSentences(text);
  const originalWords = countWords(text);

  if (sentences.length === 0) {
    return {
      fittedText: "",
      targetMinutes: TARGET_MINUTES,
      targetWords,
      originalWords: 0,
      actualWords: 0,
      wpm: safeWpm,
      strategy: "unchanged"
    };
  }

  let selected = [...sentences];
  let strategy: DurationFitStrategy = "unchanged";
  let currentWords = countWords(selected.join(" "));

  if (currentWords > targetWords) {
    strategy = "trimmed";
    const reduced: string[] = [];
    let runningWords = 0;

    for (const sentence of selected) {
      const sentenceWords = countWords(sentence);
      if (reduced.length > 0 && runningWords + sentenceWords > targetWords) {
        break;
      }
      reduced.push(sentence);
      runningWords += sentenceWords;
    }

    selected = reduced.length > 0 ? reduced : [selected[0]];
    currentWords = countWords(selected.join(" "));
  } else if (currentWords < targetWords) {
    strategy = "expanded";
    const anchors = selected.slice(0, Math.min(8, selected.length)).map(sentenceStem);

    let index = 0;
    while (currentWords < targetWords) {
      const anchor = anchors[index % anchors.length] ?? "the core point";
      const checkpoint = index + 1;
      const next = `Checkpoint ${checkpoint}: ${anchor}. At step ${checkpoint}, we keep the pace steady and tie this point to an actionable decision.`;
      selected.push(next);
      index += 1;
      currentWords = countWords(selected.join(" "));
    }
  }

  const fittedText = selected.map(ensureSentenceTerminal).join(" ");

  return {
    fittedText,
    targetMinutes: TARGET_MINUTES,
    targetWords,
    originalWords,
    actualWords: countWords(fittedText),
    wpm: safeWpm,
    strategy
  };
}
