import type { DropoffAnalysis, DropoffSegment, RetentionCurve, ShotTiming } from "./types";

type JsonRecord = Record<string, unknown>;

type RawDropoffSegment = {
  startSec: number;
  endSec: number;
  dropPct: number;
  slopePerSec: number;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function overlapSec(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): number {
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
}

export function parseShotTimingsFromDocument(shotDocumentJson: unknown): ShotTiming[] {
  if (!isRecord(shotDocumentJson)) {
    return [];
  }

  const render = isRecord(shotDocumentJson.render) ? shotDocumentJson.render : undefined;
  const fps = typeof render?.fps === "number" && render.fps > 0 ? render.fps : 30;

  const shotsValue = shotDocumentJson.shots;
  if (!Array.isArray(shotsValue)) {
    return [];
  }

  const timings: ShotTiming[] = [];

  for (const shot of shotsValue) {
    if (!isRecord(shot)) {
      continue;
    }

    const shotId = typeof shot.shot_id === "string" ? shot.shot_id : undefined;
    const startFrame = typeof shot.start_frame === "number" ? shot.start_frame : undefined;
    const durationFrames = typeof shot.duration_frames === "number" ? shot.duration_frames : undefined;

    if (!shotId || startFrame === undefined || durationFrames === undefined) {
      continue;
    }

    if (startFrame < 0 || durationFrames <= 0) {
      continue;
    }

    const beatIds = Array.isArray(shot.beat_ids)
      ? shot.beat_ids.filter((value): value is string => typeof value === "string")
      : [];

    const startSec = round(startFrame / fps, 3);
    const endSec = round((startFrame + durationFrames) / fps, 3);

    timings.push({
      shotId,
      startSec,
      endSec,
      beatIds
    });
  }

  return timings.sort((left, right) => left.startSec - right.startSec);
}

export function detectDropoffSegments(
  curve: RetentionCurve,
  options?: Partial<{ minDropPct: number; mergeGapSec: number }>
): RawDropoffSegment[] {
  const minDropPct = options?.minDropPct ?? 6;
  const mergeGapSec = options?.mergeGapSec ?? 8;

  const provisional: RawDropoffSegment[] = [];

  for (let index = 1; index < curve.points.length; index += 1) {
    const prev = curve.points[index - 1];
    const next = curve.points[index];

    const deltaTime = next.timeSec - prev.timeSec;
    if (deltaTime <= 0) {
      continue;
    }

    const dropPct = prev.retentionPct - next.retentionPct;
    if (dropPct < minDropPct) {
      continue;
    }

    provisional.push({
      startSec: prev.timeSec,
      endSec: next.timeSec,
      dropPct: round(dropPct, 3),
      slopePerSec: round(dropPct / deltaTime, 4)
    });
  }

  if (provisional.length <= 1) {
    return provisional;
  }

  const merged: RawDropoffSegment[] = [];
  let current = provisional[0];

  for (let index = 1; index < provisional.length; index += 1) {
    const next = provisional[index];
    if (next.startSec - current.endSec <= mergeGapSec) {
      const startSec = current.startSec;
      const endSec = next.endSec;
      const dropPct = round(current.dropPct + next.dropPct, 3);
      const duration = Math.max(endSec - startSec, 1);

      current = {
        startSec,
        endSec,
        dropPct,
        slopePerSec: round(dropPct / duration, 4)
      };
      continue;
    }

    merged.push(current);
    current = next;
  }

  merged.push(current);
  return merged;
}

function mapDropoffToShots(segment: RawDropoffSegment, shots: ShotTiming[]): {
  primaryShotId: string | null;
  overlappingShotIds: string[];
} {
  if (shots.length === 0) {
    return {
      primaryShotId: null,
      overlappingShotIds: []
    };
  }

  const overlaps = shots
    .map((shot) => ({
      shot,
      overlap: overlapSec(segment.startSec, segment.endSec, shot.startSec, shot.endSec)
    }))
    .filter((item) => item.overlap > 0)
    .sort((left, right) => {
      if (right.overlap !== left.overlap) {
        return right.overlap - left.overlap;
      }
      return left.shot.startSec - right.shot.startSec;
    });

  if (overlaps.length > 0) {
    return {
      primaryShotId: overlaps[0].shot.shotId,
      overlappingShotIds: overlaps.map((item) => item.shot.shotId)
    };
  }

  const midpoint = (segment.startSec + segment.endSec) / 2;
  const nearest = shots
    .map((shot) => ({ shot, distance: Math.abs((shot.startSec + shot.endSec) / 2 - midpoint) }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      return left.shot.startSec - right.shot.startSec;
    })[0];

  return {
    primaryShotId: nearest?.shot.shotId ?? null,
    overlappingShotIds: nearest ? [nearest.shot.shotId] : []
  };
}

export function analyzeDropoffs(
  curve: RetentionCurve,
  shots: ShotTiming[],
  options?: Partial<{ minDropPct: number; mergeGapSec: number }>
): DropoffAnalysis {
  const minDropPct = options?.minDropPct ?? 6;
  const mergeGapSec = options?.mergeGapSec ?? 8;

  const baseSegments = detectDropoffSegments(curve, { minDropPct, mergeGapSec });

  const segments: DropoffSegment[] = baseSegments.map((segment, index) => {
    const mappedShots = mapDropoffToShots(segment, shots);
    const segmentKey = `${Math.round(segment.startSec)}_${Math.round(segment.endSec)}`;

    return {
      id: `drop_${index + 1}_${segmentKey}`,
      segmentKey,
      startSec: segment.startSec,
      endSec: segment.endSec,
      dropPct: segment.dropPct,
      slopePerSec: segment.slopePerSec,
      reason: `Retention dropped ${segment.dropPct.toFixed(1)}% between ${segment.startSec.toFixed(1)}s and ${segment.endSec.toFixed(1)}s`,
      primaryShotId: mappedShots.primaryShotId,
      overlappingShotIds: mappedShots.overlappingShotIds
    };
  });

  return {
    episodeId: curve.episodeId,
    generatedAt: new Date().toISOString(),
    durationSec: curve.durationSec,
    threshold: {
      minDropPct,
      mergeGapSec
    },
    shotTimings: shots,
    segments
  };
}
