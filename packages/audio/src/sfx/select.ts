import type { ProceduralSfxKind, SfxPlacement, TrackIntensity } from "../types";

export type ProceduralSfxSpec = {
  kind: ProceduralSfxKind;
  durationMs: number;
  beepFreqHz?: number;
  gain: number;
};

function hasTag(tags: string[], pattern: RegExp): boolean {
  return tags.some((tag) => pattern.test(tag));
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function durationFromIntensity(base: number, intensity: TrackIntensity | undefined): number {
  if (intensity === "high") {
    return Math.round(base * 1.25);
  }
  if (intensity === "low") {
    return Math.round(base * 0.85);
  }
  return base;
}

export function resolveProceduralSfxSpec(event: SfxPlacement): ProceduralSfxSpec {
  const tags = normalizeTags(event.rules.tags);
  const intensity = event.rules.intensity;

  if (hasTag(tags, /sfx:whoosh/) || hasTag(tags, /transition|whip|fade|cut/)) {
    return {
      kind: "whoosh",
      durationMs: durationFromIntensity(280, intensity),
      gain: 0.9
    };
  }

  if (hasTag(tags, /sfx:pop/) || hasTag(tags, /highlight/)) {
    return {
      kind: "pop",
      durationMs: durationFromIntensity(130, intensity),
      gain: 0.95
    };
  }

  if (hasTag(tags, /sfx:click/) || hasTag(tags, /countup|count_up|number|chart/)) {
    return {
      kind: "click",
      durationMs: durationFromIntensity(70, intensity),
      gain: 0.72
    };
  }

  const isWarning =
    hasTag(tags, /warning|risk|emphasis:high/) ||
    /warning|emphasis/i.test(event.reason);
  const freq = isWarning ? 980 : 720;

  return {
    kind: "beep",
    durationMs: clamp(durationFromIntensity(180, intensity), 110, 360),
    beepFreqHz: freq,
    gain: isWarning ? 0.92 : 0.78
  };
}
