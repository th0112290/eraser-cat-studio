import type {
  CommunityPostDraft,
  DropoffAnalysis,
  RepurposePlan,
  ShortsCandidate,
  TranslationTaskStub
} from "./types";

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fitDurationWindow(input: {
  startSec: number;
  endSec: number;
  totalDurationSec: number;
  minDurationSec: number;
  maxDurationSec: number;
}): { startSec: number; endSec: number } {
  let startSec = clamp(input.startSec, 0, input.totalDurationSec);
  let endSec = clamp(input.endSec, startSec, input.totalDurationSec);

  let durationSec = endSec - startSec;

  if (durationSec < input.minDurationSec) {
    const target = input.minDurationSec;
    const midpoint = (startSec + endSec) / 2;
    startSec = clamp(midpoint - target / 2, 0, Math.max(0, input.totalDurationSec - target));
    endSec = clamp(startSec + target, startSec, input.totalDurationSec);
    durationSec = endSec - startSec;
  }

  if (durationSec > input.maxDurationSec) {
    const target = input.maxDurationSec;
    const midpoint = (startSec + endSec) / 2;
    startSec = clamp(midpoint - target / 2, 0, Math.max(0, input.totalDurationSec - target));
    endSec = clamp(startSec + target, startSec, input.totalDurationSec);
  }

  return {
    startSec: round(startSec, 3),
    endSec: round(endSec, 3)
  };
}

export function generateShortsCandidates(
  analysis: DropoffAnalysis,
  options?: Partial<{ maxCandidates: number; minDurationSec: number; maxDurationSec: number }>
): ShortsCandidate[] {
  const maxCandidates = options?.maxCandidates ?? 5;
  const minDurationSec = options?.minDurationSec ?? 15;
  const maxDurationSec = options?.maxDurationSec ?? 45;
  const totalDurationSec = Math.max(
    analysis.durationSec,
    analysis.shotTimings[analysis.shotTimings.length - 1]?.endSec ?? analysis.durationSec,
    minDurationSec
  );

  const built: ShortsCandidate[] = analysis.segments.map((segment, index) => {
    const targetWindow = fitDurationWindow({
      startSec: Math.max(0, segment.startSec - 4),
      endSec: Math.min(totalDurationSec, segment.endSec + 8),
      totalDurationSec,
      minDurationSec,
      maxDurationSec
    });

    const durationSec = round(targetWindow.endSec - targetWindow.startSec, 3);
    const score = round(
      segment.dropPct * 1.4 + segment.slopePerSec * 12 + segment.overlappingShotIds.length,
      3
    );

    return {
      id: `short_${index + 1}`,
      segmentKey: segment.segmentKey,
      startSec: targetWindow.startSec,
      endSec: targetWindow.endSec,
      durationSec,
      score,
      reason: segment.reason,
      title: `Retention recovery clip ${index + 1}`,
      shotIds: segment.overlappingShotIds
    };
  });

  const uniqueByWindow = new Map<string, ShortsCandidate>();
  for (const candidate of built) {
    const key = `${Math.round(candidate.startSec)}_${Math.round(candidate.endSec)}`;
    const existing = uniqueByWindow.get(key);
    if (!existing || candidate.score > existing.score) {
      uniqueByWindow.set(key, candidate);
    }
  }

  return Array.from(uniqueByWindow.values())
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.startSec - right.startSec;
    })
    .slice(0, maxCandidates)
    .map((candidate, index) => ({
      ...candidate,
      id: `short_${index + 1}`
    }));
}

function uniqueHashtags(topic: string): string[] {
  const tokens = topic
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
    .slice(0, 3);

  const base = ["erasercat", "shorts", ...tokens];
  return Array.from(new Set(base)).map((tag) => `#${tag}`);
}

export function generateCommunityPostDraft(topic: string, shorts: ShortsCandidate[]): CommunityPostDraft {
  const top = shorts.slice(0, 3);

  const bodyLines = [
    `We reviewed retention data for: ${topic}.`,
    "Top replay-focused clip candidates:",
    ...top.map(
      (candidate, index) =>
        `${index + 1}. ${candidate.startSec.toFixed(1)}s-${candidate.endSec.toFixed(1)}s (${candidate.durationSec.toFixed(1)}s)`
    ),
    "Tell us which segment should be expanded next."
  ];

  return {
    title: `Community feedback request: ${topic}`,
    body: bodyLines.join("\n"),
    hashtags: uniqueHashtags(topic)
  };
}

export function createTranslationTaskStubs(
  shorts: ShortsCandidate[],
  languages?: string[]
): TranslationTaskStub[] {
  const selectedLanguages = (languages && languages.length > 0 ? languages : ["en", "ja", "es"]).slice(0, 5);
  const selectedShorts = shorts.slice(0, 3);

  const tasks: TranslationTaskStub[] = [];

  for (const language of selectedLanguages) {
    for (const short of selectedShorts) {
      tasks.push({
        id: `tr_${language}_${short.id}`,
        targetLanguage: language,
        status: "PENDING",
        sourceStartSec: short.startSec,
        sourceEndSec: short.endSec,
        notes: `Stub only: translate narration and subtitles for ${short.id} (${short.startSec.toFixed(1)}s-${short.endSec.toFixed(1)}s)`
      });
    }
  }

  return tasks;
}

export function buildRepurposePlan(input: {
  episodeId: string;
  topic: string;
  analysis: DropoffAnalysis;
  maxShorts?: number;
  languages?: string[];
}): RepurposePlan {
  const shorts = generateShortsCandidates(input.analysis, {
    maxCandidates: input.maxShorts
  });

  return {
    episodeId: input.episodeId,
    generatedAt: new Date().toISOString(),
    shorts,
    communityPost: generateCommunityPostDraft(input.topic, shorts),
    translationTasks: createTranslationTaskStubs(shorts, input.languages)
  };
}
