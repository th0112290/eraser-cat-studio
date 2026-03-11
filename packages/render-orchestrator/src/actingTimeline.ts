import type { ResolvedProfiles } from "@ec/profiles";
import { resolvePrimaryVisualPointerTargetCount } from "./layoutPlan";
import type {
  DeterministicCharacterTracks,
  DeterministicSequence,
  DeterministicSequenceAlignmentPause,
  DeterministicSequenceAlignmentWord,
  DeterministicVisualObject
} from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/<<|>>/g, "").replace(/[^a-z0-9']/g, "").trim();
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function resolvePrimaryVisualObject(sequence: DeterministicSequence): DeterministicVisualObject | undefined {
  return sequence.visualObjects?.find((object) => object.semanticRole === "primary_explainer") ?? sequence.visualObjects?.[0];
}

function dedupeSortedEntries<T>(
  entries: T[],
  compare: (left: T, right: T) => boolean
): T[] {
  return entries.filter((entry, index, all) => {
    const previous = all[index - 1];
    return previous ? !compare(previous, entry) : true;
  });
}

function normalizePosPath(
  entries: DeterministicCharacterTracks["posPath"],
  duration: number
): DeterministicCharacterTracks["posPath"] {
  return dedupeSortedEntries(
    [...entries]
      .map((entry) => ({
        f: clamp(Math.round(entry.f), 0, Math.max(0, duration - 1)),
        x: clamp(entry.x, 0, 1),
        y: clamp(entry.y, 0, 1),
        interp: entry.interp
      }))
      .sort((left, right) => left.f - right.f),
    (left, right) =>
      left.f === right.f &&
      left.x === right.x &&
      left.y === right.y &&
      left.interp === right.interp
  );
}

function normalizeActionTrack(
  entries: DeterministicCharacterTracks["actionTrack"],
  duration: number
): DeterministicCharacterTracks["actionTrack"] {
  return dedupeSortedEntries(
    [...entries]
      .map((entry) => ({
        f: clamp(Math.round(entry.f), 0, Math.max(0, duration - 1)),
        clip: entry.clip,
        weight: clamp(entry.weight, 0, 1)
      }))
      .sort((left, right) => left.f - right.f),
    (left, right) => left.f === right.f && left.clip === right.clip && left.weight === right.weight
  );
}

function normalizeExpressionTrack(
  entries: DeterministicCharacterTracks["expressionTrack"],
  duration: number
): DeterministicCharacterTracks["expressionTrack"] {
  return dedupeSortedEntries(
    [...entries]
      .map((entry) => ({
        f: clamp(Math.round(entry.f), 0, Math.max(0, duration - 1)),
        expression: entry.expression
      }))
      .sort((left, right) => left.f - right.f),
    (left, right) => left.f === right.f && left.expression === right.expression
  );
}

function normalizeLookTrack(
  entries: DeterministicCharacterTracks["lookTrack"],
  duration: number
): DeterministicCharacterTracks["lookTrack"] {
  return dedupeSortedEntries(
    [...entries]
      .map((entry) => ({
        f: clamp(Math.round(entry.f), 0, Math.max(0, duration - 1)),
        target: entry.target
      }))
      .sort((left, right) => left.f - right.f),
    (left, right) => left.f === right.f && left.target === right.target
  );
}

function normalizeVisemeTrack(
  entries: NonNullable<DeterministicCharacterTracks["visemeTrack"]>,
  duration: number
): NonNullable<DeterministicCharacterTracks["visemeTrack"]> {
  return dedupeSortedEntries(
    [...entries]
      .map((entry) => ({
        f: clamp(Math.round(entry.f), 0, Math.max(0, duration - 1)),
        viseme: entry.viseme,
        intensity: clamp(entry.intensity, 0, 1)
      }))
      .sort((left, right) => left.f - right.f),
    (left, right) =>
      left.f === right.f &&
      left.viseme === right.viseme &&
      left.intensity === right.intensity
  );
}

function normalizePointTrack(
  entries: NonNullable<DeterministicCharacterTracks["pointTrack"]>,
  duration: number
): NonNullable<DeterministicCharacterTracks["pointTrack"]> {
  return dedupeSortedEntries(
    [...entries]
      .map((entry) => ({
        f: clamp(Math.round(entry.f), 0, Math.max(0, duration - 1)),
        targetId: entry.targetId,
        hand: entry.hand
      }))
      .sort((left, right) => left.f - right.f),
    (left, right) => left.f === right.f && left.targetId === right.targetId && left.hand === right.hand
  );
}

function resolveBaseExpressionAtFrame(
  track: DeterministicCharacterTracks["expressionTrack"],
  frame: number
): string {
  let latest = "neutral";
  for (const entry of [...track].sort((left, right) => left.f - right.f)) {
    if (entry.f > frame) {
      break;
    }
    if (entry.expression !== "blink") {
      latest = entry.expression;
    }
  }
  return latest;
}

function hasExpressionNear(
  track: DeterministicCharacterTracks["expressionTrack"],
  frame: number,
  maxDistance: number,
  expression?: string
): boolean {
  return track.some(
    (entry) =>
      Math.abs(entry.f - frame) <= maxDistance &&
      (expression ? entry.expression === expression : true)
  );
}

function hasLookNear(
  track: DeterministicCharacterTracks["lookTrack"],
  frame: number,
  maxDistance: number,
  target?: string
): boolean {
  return track.some(
    (entry) =>
      Math.abs(entry.f - frame) <= maxDistance &&
      (target ? entry.target === target : true)
  );
}

function hasPointNear(
  track: NonNullable<DeterministicCharacterTracks["pointTrack"]>,
  frame: number,
  maxDistance: number
): boolean {
  return track.some((entry) => Math.abs(entry.f - frame) <= maxDistance);
}

function resolvePositionAtFrame(
  track: DeterministicCharacterTracks["posPath"],
  fallback: { x: number; y: number },
  frame: number
): { x: number; y: number } {
  const sorted = [...track].sort((left, right) => left.f - right.f);
  if (sorted.length === 0) {
    return fallback;
  }
  if (frame <= sorted[0].f) {
    return {
      x: clamp(sorted[0].x, 0, 1),
      y: clamp(sorted[0].y, 0, 1)
    };
  }
  const last = sorted[sorted.length - 1];
  if (frame >= last.f) {
    return {
      x: clamp(last.x, 0, 1),
      y: clamp(last.y, 0, 1)
    };
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (frame >= start.f && frame <= end.f) {
      const span = Math.max(1, end.f - start.f);
      const t = clamp((frame - start.f) / span, 0, 1);
      return {
        x: clamp(start.x + (end.x - start.x) * t, 0, 1),
        y: clamp(start.y + (end.y - start.y) * t, 0, 1)
      };
    }
  }

  return fallback;
}

function resolveEmphasisWords(sequence: DeterministicSequence): Set<string> {
  return new Set(
    sequence.emphasisWords
      .map((value) => normalizeToken(value))
      .filter((value) => value.length > 0)
  );
}

function resolveEmphasisWordsWithScores(
  sequence: DeterministicSequence,
  fps: number
): Array<{ frame: number; intensity: number }> {
  const alignedWords = sequence.alignment?.words ?? [];
  const explicitWordSet = resolveEmphasisWords(sequence);
  const emphasisFrames = alignedWords
    .map((word) => {
      const normalized = normalizeToken(word.text);
      const explicit = word.emphasis || explicitWordSet.has(normalized);
      if (!explicit && word.intensity < 0.8) {
        return null;
      }
      const frame = clamp(
        Math.round(((word.localStartSec + word.localEndSec) * 0.5) * fps),
        0,
        Math.max(0, sequence.duration - 1)
      );
      return {
        frame,
        intensity: clamp(word.intensity + (explicit ? 0.22 : 0), 0, 1)
      };
    })
    .filter((entry): entry is { frame: number; intensity: number } => entry !== null)
    .sort((left, right) => left.frame - right.frame);

  if (
    typeof sequence.emphasisAtFrame === "number" &&
    !emphasisFrames.some((entry) => Math.abs(entry.frame - sequence.emphasisAtFrame!) <= 4)
  ) {
    emphasisFrames.push({
      frame: clamp(sequence.emphasisAtFrame, 0, Math.max(0, sequence.duration - 1)),
      intensity: 0.86
    });
  }

  return dedupeSortedEntries(
    emphasisFrames.sort((left, right) => left.frame - right.frame),
    (left, right) => Math.abs(left.frame - right.frame) <= 3
  );
}

function resolveCandidatePauses(
  sequence: DeterministicSequence
): DeterministicSequenceAlignmentPause[] {
  return (sequence.alignment?.pauseMap ?? [])
    .filter((pause) => pause.durationSec >= 0.14)
    .sort((left, right) => left.localStartSec - right.localStartSec);
}

function resolvePauseFrame(pause: DeterministicSequenceAlignmentPause, fps: number, duration: number): number {
  const localFrame = (pause.localStartSec + Math.min(pause.durationSec * 0.38, 0.1)) * fps;
  return clamp(Math.round(localFrame), 0, Math.max(0, duration - 1));
}

function resolvePauseResumeFrame(pause: DeterministicSequenceAlignmentPause, fps: number, duration: number): number {
  return clamp(Math.round(pause.localEndSec * fps), 0, Math.max(0, duration - 1));
}

function resolveGestureHand(pointingStyle: string, index: number): "left" | "right" {
  if (pointingStyle === "direct_paw") {
    return index % 2 === 0 ? "right" : "left";
  }
  if (pointingStyle === "open_present") {
    return "left";
  }
  return "right";
}

function resolvePointTargetIds(
  sequence: DeterministicSequence,
  pointerTargetCount: number
): string[] {
  const primaryVisualObject = resolvePrimaryVisualObject(sequence);
  const explicitIds = primaryVisualObject?.pointerTargetIds?.filter((value) => value.trim().length > 0) ?? [];
  if (explicitIds.length >= pointerTargetCount) {
    return explicitIds.slice(0, pointerTargetCount);
  }

  const fallbackPrefix = sequence.hasChart ? "chart_target" : "visual_target";
  return Array.from({ length: pointerTargetCount }, (_, index) => explicitIds[index] ?? `${fallbackPrefix}_${index + 1}`);
}

function resolvePointerTargetCount(sequence: DeterministicSequence): number {
  const primaryVisualObject = resolvePrimaryVisualObject(sequence);
  return resolvePrimaryVisualPointerTargetCount({
    kind: primaryVisualObject?.kind ?? sequence.primaryVisualKind,
    chartData: sequence.chartData,
    pointerTargetIds: primaryVisualObject?.pointerTargetIds,
    anchors: primaryVisualObject?.anchors
  });
}

function findNextWordAfterPause(
  words: DeterministicSequenceAlignmentWord[],
  pause: DeterministicSequenceAlignmentPause
): DeterministicSequenceAlignmentWord | undefined {
  return words.find((word) => word.localStartSec >= pause.localEndSec - 0.02);
}

function pickEmphasisExpression(
  intensity: number,
  profiles?: ResolvedProfiles
): string {
  const brandIntensity = profiles?.mascot_brand.expression_intensity ?? "measured";
  if (intensity >= 0.94 || brandIntensity === "focused") {
    return "surprised";
  }
  return brandIntensity === "warm" ? "happy" : intensity >= 0.82 ? "happy" : "neutral";
}

function enrichVisemeTrack(
  sequence: DeterministicSequence,
  fps: number,
  profiles?: ResolvedProfiles
): NonNullable<DeterministicCharacterTracks["visemeTrack"]> | undefined {
  const mouthEnergy = profiles?.mascot_acting.mouth_energy ?? profiles?.mascot.mouth_intensity ?? 1;
  const scale = 0.78 + clamp(mouthEnergy, 0.6, 1.35) * 0.26;
  const sourceTrack = sequence.characterTracks.visemeTrack ?? [];
  const words = sequence.alignment?.words ?? [];
  if (sourceTrack.length === 0 && words.length === 0) {
    return undefined;
  }

  const entries = sourceTrack.map((entry) => ({
    ...entry,
    intensity: entry.viseme === "mouth_closed" ? 0 : clamp(entry.intensity * scale, 0, 1)
  }));

  for (const pause of resolveCandidatePauses(sequence)) {
    const pauseStartFrame = resolvePauseFrame(pause, fps, sequence.duration);
    entries.push({
      f: pauseStartFrame,
      viseme: "mouth_closed",
      intensity: 0
    });

    const nextWord = findNextWordAfterPause(words, pause);
    const resumeFrame = resolvePauseResumeFrame(pause, fps, sequence.duration);
    if (nextWord && resumeFrame < sequence.duration - 1) {
      entries.push({
        f: resumeFrame,
        viseme: nextWord.viseme,
        intensity: nextWord.viseme === "mouth_closed" ? 0 : clamp(nextWord.intensity * scale, 0, 1)
      });
    }
  }

  return normalizeVisemeTrack(entries, sequence.duration);
}

function enrichExpressionTrack(
  sequence: DeterministicSequence,
  fps: number,
  profiles?: ResolvedProfiles
): DeterministicCharacterTracks["expressionTrack"] {
  const track = [...(sequence.characterTracks.expressionTrack ?? [])];
  const emphasisFrames = resolveEmphasisWordsWithScores(sequence, fps);
  const pauses = resolveCandidatePauses(sequence);

  for (const pause of pauses) {
    const blinkFrame = resolvePauseFrame(pause, fps, sequence.duration);
    if (blinkFrame < 2 || blinkFrame >= sequence.duration - 2 || hasExpressionNear(track, blinkFrame, 6, "blink")) {
      continue;
    }
    const baseExpression = resolveBaseExpressionAtFrame(track, blinkFrame);
    track.push({ f: blinkFrame, expression: "blink" });
    track.push({
      f: Math.min(sequence.duration - 1, blinkFrame + 3),
      expression: baseExpression
    });
  }

  for (const emphasis of emphasisFrames) {
    if (hasExpressionNear(track, emphasis.frame, 8)) {
      continue;
    }
    const baseExpression = resolveBaseExpressionAtFrame(track, emphasis.frame);
    track.push({
      f: emphasis.frame,
      expression: pickEmphasisExpression(emphasis.intensity, profiles)
    });
    track.push({
      f: Math.min(sequence.duration - 1, emphasis.frame + 10),
      expression: baseExpression
    });
  }

  return normalizeExpressionTrack(track, sequence.duration);
}

function enrichLookTrack(
  sequence: DeterministicSequence,
  fps: number
): DeterministicCharacterTracks["lookTrack"] {
  const track = [...(sequence.characterTracks.lookTrack ?? [{ f: 0, target: "viewer" }])];
  const emphasisFrames = resolveEmphasisWordsWithScores(sequence, fps);
  const pauses = resolveCandidatePauses(sequence);
  const hasPrimaryVisual = resolvePointerTargetCount(sequence) > 0 || sequence.hasChart || !!resolvePrimaryVisualObject(sequence);
  const fallbackDirections = ["left", "right"] as const;

  emphasisFrames.forEach((emphasis, index) => {
    const target = hasPrimaryVisual ? "chart" : fallbackDirections[index % fallbackDirections.length];
    if (!hasLookNear(track, emphasis.frame, 8, target)) {
      track.push({ f: emphasis.frame, target });
    }
    const settleFrame = Math.min(sequence.duration - 1, emphasis.frame + (hasPrimaryVisual ? 10 : 8));
    if (!hasLookNear(track, settleFrame, 4, "viewer")) {
      track.push({ f: settleFrame, target: "viewer" });
    }
  });

  pauses.forEach((pause, index) => {
    const holdFrame = resolvePauseFrame(pause, fps, sequence.duration);
    const resumeFrame = resolvePauseResumeFrame(pause, fps, sequence.duration);
    const target =
      hasPrimaryVisual && pause.strength !== "micro"
        ? "chart"
        : fallbackDirections[(index + 1) % fallbackDirections.length];
    if (!hasLookNear(track, holdFrame, 6, target)) {
      track.push({ f: holdFrame, target });
    }
    if (!hasLookNear(track, resumeFrame, 4, "viewer")) {
      track.push({ f: resumeFrame, target: "viewer" });
    }
  });

  return normalizeLookTrack(track, sequence.duration);
}

function enrichPointTrack(
  sequence: DeterministicSequence,
  fps: number,
  profiles?: ResolvedProfiles
): NonNullable<DeterministicCharacterTracks["pointTrack"]> | undefined {
  const pointerTargetCount = resolvePointerTargetCount(sequence);
  if (pointerTargetCount <= 0) {
    return sequence.characterTracks.pointTrack;
  }

  const pointTrack = [...(sequence.characterTracks.pointTrack ?? [])];
  const emphasisFrames = resolveEmphasisWordsWithScores(sequence, fps);
  if (emphasisFrames.length === 0) {
    return pointTrack.length > 0 ? normalizePointTrack(pointTrack, sequence.duration) : undefined;
  }

  const targetIds = resolvePointTargetIds(sequence, pointerTargetCount);
  const pointingStyle = profiles?.mascot_acting.pointing_style ?? "direct_paw";
  emphasisFrames.slice(0, Math.min(pointerTargetCount + 1, 3)).forEach((entry, index) => {
    if (hasPointNear(pointTrack, entry.frame, 12)) {
      return;
    }
    pointTrack.push({
      f: entry.frame,
      targetId: targetIds[index % targetIds.length],
      hand: resolveGestureHand(pointingStyle, index)
    });
  });

  return normalizePointTrack(pointTrack, sequence.duration);
}

function enrichActionTrack(
  sequence: DeterministicSequence,
  fps: number
): DeterministicCharacterTracks["actionTrack"] {
  const track = [...(sequence.characterTracks.actionTrack ?? [{ f: 0, clip: "idle_talk", weight: 1 }])];
  const emphasisFrames = resolveEmphasisWordsWithScores(sequence, fps);
  const pointFrames = sequence.characterTracks.pointTrack ?? [];

  emphasisFrames.forEach((entry) => {
    track.push({
      f: entry.frame,
      clip: "idle_talk",
      weight: clamp(0.55 + entry.intensity * 0.35, 0, 1)
    });
  });

  pointFrames.forEach((entry) => {
    track.push({
      f: entry.f,
      clip: "explain",
      weight: 0.88
    });
  });

  return normalizeActionTrack(track, sequence.duration);
}

function enrichPosPath(
  sequence: DeterministicSequence,
  fps: number,
  profiles?: ResolvedProfiles
): DeterministicCharacterTracks["posPath"] {
  const idleMotion = profiles?.mascot_acting.idle_motion ?? profiles?.mascot.idle_motion_amount ?? 1;
  const amplitudeX = 0.0035 + clamp(idleMotion, 0.5, 1.4) * 0.0032;
  const amplitudeY = 0.002 + clamp(idleMotion, 0.5, 1.4) * 0.0026;
  const fallback = {
    x: clamp(sequence.characterX, 0, 1),
    y: clamp(sequence.characterY, 0, 1)
  };
  const entries = [...(sequence.characterTracks.posPath ?? [{ f: 0, ...fallback, interp: "ease" as const }])];
  const pauses = resolveCandidatePauses(sequence)
    .filter((pause) => pause.strength !== "micro")
    .slice(0, 2);
  const emphasisFrames = resolveEmphasisWordsWithScores(sequence, fps).slice(0, 2);
  const cues = [
    ...emphasisFrames.map((entry) => ({ frame: entry.frame, emphasis: true })),
    ...pauses.map((pause) => ({ frame: resolvePauseResumeFrame(pause, fps, sequence.duration), emphasis: false }))
  ].sort((left, right) => left.frame - right.frame);
  const seed = hashString(sequence.shotId);

  cues.forEach((cue, index) => {
    if (cue.frame < 6 || cue.frame >= sequence.duration - 8) {
      return;
    }
    const base = resolvePositionAtFrame(entries, fallback, cue.frame);
    const direction = ((seed + index) & 1) === 0 ? 1 : -1;
    const targetX = clamp(base.x + direction * amplitudeX, 0.1, 0.9);
    const targetY = clamp(base.y - amplitudeY * (cue.emphasis ? 1 : 0.65), 0.12, 0.9);
    entries.push({
      f: Math.max(0, cue.frame - 2),
      x: base.x,
      y: base.y,
      interp: "ease"
    });
    entries.push({
      f: cue.frame,
      x: targetX,
      y: targetY,
      interp: "ease"
    });
    entries.push({
      f: Math.min(sequence.duration - 1, cue.frame + 8),
      x: base.x,
      y: base.y,
      interp: "spring"
    });
  });

  return normalizePosPath(entries, sequence.duration);
}

export function applyAlignmentAwareActingTimeline(
  sequences: DeterministicSequence[],
  fps: number,
  profiles?: ResolvedProfiles
): DeterministicSequence[] {
  return sequences.map((sequence) => {
    if (!sequence.alignment) {
      return sequence;
    }

    const visemeTrack = enrichVisemeTrack(sequence, fps, profiles);
    const expressionTrack = enrichExpressionTrack(sequence, fps, profiles);
    const lookTrack = enrichLookTrack(sequence, fps);
    const pointTrack = enrichPointTrack(sequence, fps, profiles);
    const enrichedSequence: DeterministicSequence = {
      ...sequence,
      characterTracks: {
        ...sequence.characterTracks,
        posPath: enrichPosPath(sequence, fps, profiles),
        actionTrack: enrichActionTrack(
          {
            ...sequence,
            characterTracks: {
              ...sequence.characterTracks,
              pointTrack
            }
          },
          fps
        ),
        expressionTrack,
        lookTrack,
        ...(visemeTrack ? { visemeTrack } : {}),
        ...(pointTrack ? { pointTrack } : {})
      }
    };
    return enrichedSequence;
  });
}
