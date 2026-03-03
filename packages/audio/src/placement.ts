import { buildAutoSfxPlacements } from "./sfx/autoPlace";
import type { BeatCue, PlacementPlan, ShotCue, TrackRules } from "./types";

function hasAnyTag(tags: string[], patterns: RegExp[]): boolean {
  return tags.some((tag) => patterns.some((pattern) => pattern.test(tag)));
}

function buildBgmRules(shots: ShotCue[]): TrackRules {
  const shotTags = shots.flatMap((shot) => shot.tags);
  const highEnergy = hasAnyTag(shotTags, [/energy:high/i, /mood:intense/i, /pace:fast/i, /impact/i]);

  return {
    kind: "bgm",
    mood: highEnergy ? "drive" : "calm",
    intensity: highEnergy ? "high" : "low",
    tags: highEnergy ? ["energy:high"] : ["energy:low"]
  };
}

export function buildPlacementPlan(beats: BeatCue[], shots: ShotCue[]): PlacementPlan {
  return {
    bgmRules: buildBgmRules(shots),
    sfxEvents: buildAutoSfxPlacements(beats, shots)
  };
}
