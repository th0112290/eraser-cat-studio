import type { BeatCue, SfxPlacement, ShotCue } from "../types";

function hasTag(tags: string[], pattern: RegExp): boolean {
  return tags.some((tag) => pattern.test(tag));
}

function normalizedTags(tags: string[]): string[] {
  return tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
}

function buildTransitionEvents(shots: ShotCue[]): SfxPlacement[] {
  const out: SfxPlacement[] = [];

  for (const shot of shots) {
    const tags = normalizedTags(shot.tags);
    const isTransition =
      hasTag(tags, /transition/) ||
      hasTag(tags, /whip/) ||
      hasTag(tags, /fade/) ||
      hasTag(tags, /cut/);

    if (!isTransition) {
      continue;
    }

    out.push({
      beatId: shot.id,
      timeSec: Math.max(0, shot.startSec),
      reason: "shot transition tag",
      rules: {
        kind: "sfx",
        intensity: "medium",
        tags: ["sfx:whoosh", ...tags]
      }
    });
  }

  return out;
}

function buildHighlightEvents(shots: ShotCue[]): SfxPlacement[] {
  const out: SfxPlacement[] = [];

  for (const shot of shots) {
    const tags = normalizedTags(shot.tags);
    if (!hasTag(tags, /highlight|chart/)) {
      continue;
    }

    const timeSec = Math.max(0, shot.startSec + Math.min(0.45, shot.durationSec * 0.3));
    out.push({
      beatId: shot.id,
      timeSec,
      reason: "chart highlight",
      rules: {
        kind: "sfx",
        intensity: "high",
        tags: ["sfx:pop", ...tags]
      }
    });
  }

  return out;
}

function buildCountupEvents(shots: ShotCue[]): SfxPlacement[] {
  const out: SfxPlacement[] = [];

  for (const shot of shots) {
    const tags = normalizedTags(shot.tags);
    const hasCountup = hasTag(tags, /countup|count_up|number/) || hasTag(tags, /chart/);
    if (!hasCountup) {
      continue;
    }

    out.push({
      beatId: shot.id,
      timeSec: Math.max(0, shot.startSec + 0.08),
      reason: "number countup start",
      rules: {
        kind: "sfx",
        intensity: "low",
        tags: ["sfx:click", ...tags]
      }
    });
  }

  return out;
}

function buildWarningEvents(beats: BeatCue[]): SfxPlacement[] {
  const out: SfxPlacement[] = [];

  for (const beat of beats) {
    const tags = normalizedTags(beat.tags);
    const isWarning =
      hasTag(tags, /warning/) ||
      hasTag(tags, /emphasis:high/) ||
      hasTag(tags, /emphasis/) ||
      hasTag(tags, /risk/);

    if (!isWarning) {
      continue;
    }

    out.push({
      beatId: beat.id,
      timeSec: Math.max(0, beat.startSec),
      reason: "warning/emphasis beat",
      rules: {
        kind: "sfx",
        intensity: "medium",
        tags: ["sfx:beep", ...tags]
      }
    });
  }

  return out;
}

function dedupeAndSort(events: SfxPlacement[]): SfxPlacement[] {
  const map = new Map<string, SfxPlacement>();

  for (const event of events) {
    const tags = (event.rules.tags ?? []).slice().sort().join("|");
    const key = `${event.beatId}:${event.timeSec.toFixed(3)}:${event.reason}:${tags}`;
    map.set(key, event);
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.timeSec !== b.timeSec) {
      return a.timeSec - b.timeSec;
    }
    return a.beatId.localeCompare(b.beatId);
  });
}

export function buildAutoSfxPlacements(beats: BeatCue[], shots: ShotCue[]): SfxPlacement[] {
  return dedupeAndSort([
    ...buildTransitionEvents(shots),
    ...buildHighlightEvents(shots),
    ...buildCountupEvents(shots),
    ...buildWarningEvents(beats)
  ]);
}
