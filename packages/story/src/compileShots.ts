import type { Beat, EpisodeInput } from "./generateBeats";

export type ShotTransition = "cut" | "fade";

type VisualIntent = "intro" | "data" | "bridge" | "close" | "narrative";
type CameraPreset = "static" | "slow_push" | "whip_pan" | "shake_emphasis";

type BeatSegment = {
  intent: VisualIntent;
  beats: Beat[];
};

export type Shot = {
  shot_id: string;
  beat_ids: string[];
  start_frame: number;
  duration_frames: number;
  set: {
    set_id: string;
    variant: string;
    layers: {
      bg_far: string;
      bg_mid: string;
      bg_near: string;
      fg_mask: string;
    };
  };
  camera: {
    preset: string;
    keyframes: Array<{
      f: number;
      x: number;
      y: number;
      zoom: number;
      rotate_deg: number;
    }>;
  };
  chart?: {
    chart_id: string;
    type: string;
    dataset_id: string;
    time_range: string;
    layout_preset: string;
    highlights?: Array<{
      f: number;
      target_id: string;
      style_token: string;
    }>;
    callouts?: Array<{
      f: number;
      text: string;
      attach_to_target_id?: string;
    }>;
  };
  character: {
    pack_id: string;
    layer: "behind_fg_mask" | "between_bg_mid_and_near" | "in_front_of_all";
    transform: {
      x: number;
      y: number;
      scale: number;
      flip_x: boolean;
    };
    tracks: {
      pos_path: Array<{
        f: number;
        x: number;
        y: number;
        interp: "linear" | "ease" | "spring";
      }>;
      action_track: Array<{
        f: number;
        clip: string;
        weight: number;
      }>;
      expression_track: Array<{
        f: number;
        expression: string;
      }>;
      look_track: Array<{
        f: number;
        target: string;
      }>;
      point_track?: Array<{
        f: number;
        target_id: string;
        hand: "left" | "right";
      }>;
    };
  };
  audio?: {
    sfx: Array<{
      f: number;
      src: string;
    }>;
  };
  qc_expectations: {
    must_keep_character_in_frame: boolean;
    allow_pointing_fail_fallback: boolean;
  };
};

export type ShotsDocument = {
  schema_version: "1.0";
  episode: {
    episode_id: string;
    bible_ref: string;
  };
  render: {
    fps: number;
    width: number;
    height: number;
    safe_area: {
      x: number;
      y: number;
      w: number;
      h: number;
    };
    coord_space: "normalized";
  };
  shots: Shot[];
};

export type CompileShotsOptions = {
  fps?: number;
  speakingRateWpm?: number;
  speechCompression?: number;
  minShotFrames?: number;
  maxShotFrames?: number;
  minShots?: number;
  maxShots?: number;
};

const DEFAULTS: Required<CompileShotsOptions> = {
  fps: 30,
  speakingRateWpm: 165,
  speechCompression: 0.42,
  minShotFrames: 72,
  maxShotFrames: 300,
  minShots: 25,
  maxShots: 40
};

const HIGHLIGHT_TOKENS: readonly ["scribble", "glow", "coin_burst"] = [
  "scribble",
  "glow",
  "coin_burst"
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function countWords(text: string): number {
  const cleaned = text.trim();
  if (cleaned.length === 0) {
    return 1;
  }
  return cleaned.split(/\s+/).length;
}

function visualIntentFromBeat(beat: Beat): VisualIntent {
  if (beat.type === "hook" || beat.type === "setup" || beat.type === "context") {
    return "intro";
  }
  if (
    beat.type === "analysis" ||
    beat.type === "contrast" ||
    beat.type === "evidence" ||
    beat.type === "insight"
  ) {
    return "data";
  }
  if (beat.type === "transition" || beat.type === "payoff") {
    return "bridge";
  }
  if (beat.type === "cta") {
    return "close";
  }
  return "narrative";
}

function estimateBeatFrames(beat: Beat, options: Required<CompileShotsOptions>): number {
  const words = countWords(beat.narration);
  const wordsPerSecond = options.speakingRateWpm / 60;
  const seconds = (words / wordsPerSecond) * options.speechCompression;
  const frames = Math.round(seconds * options.fps);
  return clamp(frames, 24, 130);
}

function mergeAdjacentByIntent(beats: Beat[]): BeatSegment[] {
  const segments: BeatSegment[] = [];
  for (const beat of beats) {
    const intent = visualIntentFromBeat(beat);
    const current = segments[segments.length - 1];
    if (current && current.intent === intent) {
      current.beats.push(beat);
    } else {
      segments.push({ intent, beats: [beat] });
    }
  }
  return segments;
}

function totalSegmentFrames(segment: BeatSegment, beatFrames: Map<string, number>): number {
  return segment.beats.reduce((sum, beat) => sum + (beatFrames.get(beat.id) ?? 24), 0);
}

function splitLongestSegment(segments: BeatSegment[], beatFrames: Map<string, number>): boolean {
  let targetIndex = -1;
  let targetScore = -1;

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment.beats.length < 2) {
      continue;
    }
    const score = totalSegmentFrames(segment, beatFrames);
    if (score > targetScore) {
      targetScore = score;
      targetIndex = i;
    }
  }

  if (targetIndex < 0) {
    return false;
  }

  const segment = segments[targetIndex];
  const midpoint = Math.ceil(segment.beats.length / 2);
  const left: BeatSegment = { intent: segment.intent, beats: segment.beats.slice(0, midpoint) };
  const right: BeatSegment = { intent: segment.intent, beats: segment.beats.slice(midpoint) };
  segments.splice(targetIndex, 1, left, right);
  return true;
}

function mergeShortestAdjacentPair(segments: BeatSegment[], beatFrames: Map<string, number>): boolean {
  if (segments.length < 2) {
    return false;
  }

  let bestIndex = 0;
  let bestSame = 2;
  let bestFrames = Number.POSITIVE_INFINITY;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const left = segments[i];
    const right = segments[i + 1];
    const sameIntent = left.intent === right.intent ? 0 : 1;
    const frames = totalSegmentFrames(left, beatFrames) + totalSegmentFrames(right, beatFrames);

    if (sameIntent < bestSame || (sameIntent === bestSame && frames < bestFrames)) {
      bestSame = sameIntent;
      bestFrames = frames;
      bestIndex = i;
    }
  }

  const left = segments[bestIndex];
  const right = segments[bestIndex + 1];
  const merged: BeatSegment = {
    intent: left.intent,
    beats: [...left.beats, ...right.beats]
  };
  segments.splice(bestIndex, 2, merged);
  return true;
}

function rebalanceSegments(
  initial: BeatSegment[],
  targetShots: number,
  beatFrames: Map<string, number>
): BeatSegment[] {
  const segments = initial.map((segment) => ({ intent: segment.intent, beats: [...segment.beats] }));

  while (segments.length < targetShots) {
    if (!splitLongestSegment(segments, beatFrames)) {
      break;
    }
  }

  while (segments.length > targetShots) {
    if (!mergeShortestAdjacentPair(segments, beatFrames)) {
      break;
    }
  }

  return segments;
}

function resolveTargetShotCount(beatCount: number, options: Required<CompileShotsOptions>): number {
  const derived = Math.round(beatCount / 3);
  const bounded = clamp(derived, options.minShots, options.maxShots);
  return Math.max(1, Math.min(bounded, beatCount));
}

function transitionForShot(index: number, intent: VisualIntent): ShotTransition {
  if (index === 0) {
    return "fade";
  }
  if (intent === "bridge" || intent === "close") {
    return "fade";
  }
  return "cut";
}

function actionClipFromIntent(intent: VisualIntent): string {
  if (intent === "intro") {
    return "greet";
  }
  if (intent === "data") {
    return "explain";
  }
  if (intent === "bridge") {
    return "move";
  }
  if (intent === "close") {
    return "conclude";
  }
  return "idle_talk";
}

function expressionFromSegment(segment: BeatSegment): string {
  if (segment.beats.some((beat) => beat.emphasis === "high")) {
    return "excited";
  }
  if (segment.beats.some((beat) => beat.emphasis === "medium")) {
    return "focused";
  }
  return "neutral";
}

function shotDurationFrames(
  segment: BeatSegment,
  transition: ShotTransition,
  beatFrames: Map<string, number>,
  options: Required<CompileShotsOptions>
): number {
  const base = totalSegmentFrames(segment, beatFrames);
  const transitionPad = transition === "fade" ? 10 : 2;
  return clamp(base + transitionPad, options.minShotFrames, options.maxShotFrames);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seedText: string): () => number {
  let state = hashString(seedText);
  if (state === 0) {
    state = 0x9e3779b9;
  }

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function signedJitter(rng: () => number, amount: number): number {
  return (rng() * 2 - 1) * amount;
}

function pickWeighted<T>(rng: () => number, entries: Array<{ value: T; weight: number }>): T {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) {
    return entries[0].value;
  }

  const threshold = rng() * total;
  let cursor = 0;
  for (const entry of entries) {
    cursor += Math.max(0, entry.weight);
    if (threshold <= cursor) {
      return entry.value;
    }
  }

  return entries[entries.length - 1].value;
}

function presetForIntent(intent: VisualIntent, rng: () => number): CameraPreset {
  if (intent === "intro" || intent === "close") {
    return pickWeighted(rng, [
      { value: "whip_pan", weight: 0.42 },
      { value: "slow_push", weight: 0.30 },
      { value: "shake_emphasis", weight: 0.22 },
      { value: "static", weight: 0.06 }
    ]);
  }

  if (intent === "data") {
    return pickWeighted(rng, [
      { value: "slow_push", weight: 0.46 },
      { value: "shake_emphasis", weight: 0.20 },
      { value: "static", weight: 0.28 },
      { value: "whip_pan", weight: 0.06 }
    ]);
  }

  if (intent === "bridge") {
    return pickWeighted(rng, [
      { value: "slow_push", weight: 0.36 },
      { value: "whip_pan", weight: 0.34 },
      { value: "shake_emphasis", weight: 0.20 },
      { value: "static", weight: 0.10 }
    ]);
  }

  return pickWeighted(rng, [
    { value: "static", weight: 0.62 },
    { value: "slow_push", weight: 0.30 },
    { value: "shake_emphasis", weight: 0.06 },
    { value: "whip_pan", weight: 0.02 }
  ]);
}

function clampCoordX(value: number): number {
  return clamp(value, 0.08, 0.92);
}

function clampCoordY(value: number): number {
  return clamp(value, 0.18, 0.86);
}

function clampZoom(value: number): number {
  return clamp(value, 0.82, 1.30);
}

function normalizeCameraKeyframes(
  duration: number,
  keyframes: Array<{ f: number; x: number; y: number; zoom: number; rotate_deg: number }>
): Array<{ f: number; x: number; y: number; zoom: number; rotate_deg: number }> {
  const sorted = [...keyframes]
    .map((keyframe) => ({
      ...keyframe,
      f: clamp(Math.round(keyframe.f), 0, Math.max(0, duration - 1)),
      x: clampCoordX(keyframe.x),
      y: clampCoordY(keyframe.y),
      zoom: clampZoom(keyframe.zoom),
      rotate_deg: clamp(keyframe.rotate_deg, -8, 8)
    }))
    .sort((left, right) => left.f - right.f);

  const deduped: Array<{ f: number; x: number; y: number; zoom: number; rotate_deg: number }> = [];
  for (const keyframe of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.f === keyframe.f) {
      deduped[deduped.length - 1] = keyframe;
    } else {
      deduped.push(keyframe);
    }
  }

  if (deduped.length === 0) {
    deduped.push({
      f: 0,
      x: 0.5,
      y: 0.5,
      zoom: 1,
      rotate_deg: 0
    });
  }

  if (deduped.length === 1) {
    deduped.push({
      ...deduped[0],
      f: Math.max(1, duration - 1)
    });
  }

  return deduped;
}

function buildCameraKeyframes(input: {
  intent: VisualIntent;
  preset: CameraPreset;
  duration: number;
  baseX: number;
  baseY: number;
  baseZoom: number;
  rng: () => number;
}): Array<{ f: number; x: number; y: number; zoom: number; rotate_deg: number }> {
  const { intent, preset, duration, baseX, baseY, baseZoom, rng } = input;

  const motionStrength =
    intent === "intro" || intent === "close"
      ? 0.10
      : intent === "data"
        ? 0.055
        : intent === "bridge"
          ? 0.075
          : 0.03;

  const zoomStrength =
    intent === "intro" || intent === "close"
      ? 0.13
      : intent === "data"
        ? 0.08
        : intent === "bridge"
          ? 0.09
          : 0.04;

  if (preset === "static") {
    return normalizeCameraKeyframes(duration, [
      {
        f: 0,
        x: baseX + signedJitter(rng, motionStrength * 0.15),
        y: baseY + signedJitter(rng, motionStrength * 0.12),
        zoom: baseZoom + signedJitter(rng, 0.01),
        rotate_deg: signedJitter(rng, 0.2)
      },
      {
        f: duration - 1,
        x: baseX + signedJitter(rng, motionStrength * 0.25),
        y: baseY + signedJitter(rng, motionStrength * 0.18),
        zoom: baseZoom + signedJitter(rng, 0.015),
        rotate_deg: signedJitter(rng, 0.28)
      }
    ]);
  }

  if (preset === "slow_push") {
    const directionX = rng() > 0.5 ? 1 : -1;
    const driftX = directionX * (motionStrength * (0.45 + rng() * 0.35));
    const driftY = signedJitter(rng, motionStrength * 0.28);
    const pushZoom = zoomStrength * (0.45 + rng() * 0.45);
    return normalizeCameraKeyframes(duration, [
      {
        f: 0,
        x: baseX - driftX * 0.45,
        y: baseY - driftY * 0.35,
        zoom: baseZoom,
        rotate_deg: signedJitter(rng, 0.35)
      },
      {
        f: Math.floor(duration * 0.52),
        x: baseX + driftX * 0.3,
        y: baseY + driftY * 0.35,
        zoom: baseZoom + pushZoom * 0.55,
        rotate_deg: signedJitter(rng, 0.45)
      },
      {
        f: duration - 1,
        x: baseX + driftX,
        y: baseY + driftY,
        zoom: baseZoom + pushZoom,
        rotate_deg: signedJitter(rng, 0.55)
      }
    ]);
  }

  if (preset === "whip_pan") {
    const directionX = rng() > 0.5 ? 1 : -1;
    const whipSpan = motionStrength * (0.95 + rng() * 0.55);
    const whipY = signedJitter(rng, motionStrength * 0.4);
    const whipZoom = zoomStrength * (0.32 + rng() * 0.3);

    return normalizeCameraKeyframes(duration, [
      {
        f: 0,
        x: baseX - directionX * whipSpan * 0.62,
        y: baseY - whipY * 0.4,
        zoom: baseZoom - whipZoom * 0.35,
        rotate_deg: -directionX * (1.2 + rng() * 1.1)
      },
      {
        f: Math.floor(duration * 0.16),
        x: baseX + directionX * whipSpan,
        y: baseY + whipY,
        zoom: baseZoom + whipZoom,
        rotate_deg: directionX * (2.2 + rng() * 1.8)
      },
      {
        f: Math.floor(duration * 0.42),
        x: baseX + directionX * whipSpan * 0.24,
        y: baseY + whipY * 0.25,
        zoom: baseZoom + whipZoom * 0.52,
        rotate_deg: directionX * 0.9
      },
      {
        f: duration - 1,
        x: baseX + directionX * whipSpan * 0.08,
        y: baseY,
        zoom: baseZoom + whipZoom * 0.24,
        rotate_deg: 0
      }
    ]);
  }

  const shakeMagnitude = motionStrength * (0.5 + rng() * 0.35);
  const settleZoom = zoomStrength * (0.18 + rng() * 0.2);
  return normalizeCameraKeyframes(duration, [
    {
      f: 0,
      x: baseX,
      y: baseY,
      zoom: baseZoom,
      rotate_deg: 0
    },
    {
      f: Math.floor(duration * 0.28),
      x: baseX + shakeMagnitude,
      y: baseY - shakeMagnitude * 0.45,
      zoom: baseZoom + settleZoom,
      rotate_deg: 1.8 + rng() * 1.5
    },
    {
      f: Math.floor(duration * 0.56),
      x: baseX - shakeMagnitude * 0.9,
      y: baseY + shakeMagnitude * 0.55,
      zoom: baseZoom + settleZoom * 0.65,
      rotate_deg: -(1.8 + rng() * 1.5)
    },
    {
      f: duration - 1,
      x: baseX + signedJitter(rng, motionStrength * 0.18),
      y: baseY + signedJitter(rng, motionStrength * 0.12),
      zoom: baseZoom + settleZoom * 0.25,
      rotate_deg: signedJitter(rng, 0.4)
    }
  ]);
}

function resolveTargetIndex(raw: string | undefined, fallbackOneBased: number): number {
  if (!raw || raw.trim().length === 0) {
    return fallbackOneBased;
  }

  const match = raw.match(/(\d+)(?!.*\d)/);
  if (!match) {
    return fallbackOneBased;
  }

  const parsed = Number.parseInt(match[1], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackOneBased;
  }

  return parsed;
}

function toTargetId(oneBasedIndex: number): string {
  return `target_${String(oneBasedIndex).padStart(3, "0")}`;
}

function makeHighlightFrames(duration: number, count: number, rng: () => number): number[] {
  const anchors =
    count <= 1
      ? [0.45]
      : count === 2
        ? [0.30, 0.66]
        : [0.22, 0.50, 0.78];

  const frames = anchors.slice(0, count).map((anchor, index) => {
    const jitter = signedJitter(rng, 0.06);
    const normalized = clamp(anchor + jitter + index * 0.01, 0.08, 0.92);
    return clamp(Math.round(duration * normalized), 0, Math.max(0, duration - 1));
  });

  return frames.sort((a, b) => a - b);
}

function buildChartHighlights(input: {
  duration: number;
  intent: VisualIntent;
  primaryTargetId: string;
  secondaryTargetId: string;
  tertiaryTargetId: string;
  rng: () => number;
}): Array<{ f: number; target_id: string; style_token: string }> {
  const { duration, intent, primaryTargetId, secondaryTargetId, tertiaryTargetId, rng } = input;

  const highlightCount =
    intent === "data"
      ? 2 + (rng() > 0.45 ? 1 : 0)
      : intent === "intro" || intent === "close"
        ? 2 + (rng() > 0.72 ? 1 : 0)
        : intent === "bridge"
          ? 2
          : 1;

  const count = clamp(highlightCount, 1, 3);
  const frames = makeHighlightFrames(duration, count, rng);
  const targets = [primaryTargetId, secondaryTargetId, tertiaryTargetId];
  const tokenOffset = Math.floor(rng() * HIGHLIGHT_TOKENS.length);

  return frames.map((f, index) => ({
    f,
    target_id: targets[index % targets.length],
    style_token: HIGHLIGHT_TOKENS[(tokenOffset + index) % HIGHLIGHT_TOKENS.length]
  }));
}

function chooseCharacterLayer(intent: VisualIntent, rng: () => number): Shot["character"]["layer"] {
  if (intent === "data") {
    return "between_bg_mid_and_near";
  }

  if (intent === "intro" || intent === "close") {
    return rng() < 0.36 ? "behind_fg_mask" : "between_bg_mid_and_near";
  }

  if (intent === "bridge") {
    return rng() < 0.28 ? "behind_fg_mask" : "between_bg_mid_and_near";
  }

  return rng() < 0.12 ? "behind_fg_mask" : "between_bg_mid_and_near";
}

function buildCharacterPosPath(input: {
  intent: VisualIntent;
  duration: number;
  baseX: number;
  baseY: number;
  layer: Shot["character"]["layer"];
  rng: () => number;
}): Shot["character"]["tracks"]["pos_path"] {
  const { intent, duration, baseX, baseY, layer, rng } = input;

  const moveStrength =
    intent === "intro" || intent === "close"
      ? 0.05
      : intent === "data"
        ? 0.035
        : intent === "bridge"
          ? 0.04
          : 0.018;

  const startX = clamp(baseX + signedJitter(rng, moveStrength * 0.25), 0.12, 0.88);
  const startY = clamp(baseY + signedJitter(rng, 0.01), 0.68, 0.9);

  const midpointX =
    layer === "behind_fg_mask"
      ? clamp(0.44 + signedJitter(rng, 0.018), 0.38, 0.5)
      : clamp(baseX + signedJitter(rng, moveStrength), 0.12, 0.88);
  const midpointY = clamp(baseY + signedJitter(rng, 0.012), 0.68, 0.9);

  const endX = clamp(baseX + signedJitter(rng, moveStrength * 0.5), 0.12, 0.88);
  const endY = clamp(baseY + signedJitter(rng, 0.01), 0.68, 0.9);

  return [
    {
      f: 0,
      x: startX,
      y: startY,
      interp: "spring"
    },
    {
      f: Math.floor(duration * 0.52),
      x: midpointX,
      y: midpointY,
      interp: "ease"
    },
    {
      f: duration - 1,
      x: endX,
      y: endY,
      interp: "ease"
    }
  ];
}

function buildPointTrack(input: {
  duration: number;
  intent: VisualIntent;
  primaryTargetId: string;
  secondaryTargetId: string;
  rng: () => number;
}): Shot["character"]["tracks"]["point_track"] {
  const { duration, intent, primaryTargetId, secondaryTargetId, rng } = input;

  const baseHand: "left" | "right" = rng() < 0.18 ? "left" : "right";

  if (intent === "data") {
    return [
      {
        f: Math.floor(duration * 0.22),
        target_id: primaryTargetId,
        hand: baseHand
      },
      {
        f: Math.floor(duration * 0.44),
        target_id: secondaryTargetId,
        hand: baseHand
      },
      {
        f: Math.floor(duration * 0.66),
        target_id: primaryTargetId,
        hand: baseHand
      }
    ];
  }

  return [
    {
      f: Math.floor(duration * 0.36),
      target_id: primaryTargetId,
      hand: baseHand
    },
    {
      f: Math.floor(duration * 0.58),
      target_id: primaryTargetId,
      hand: baseHand
    }
  ];
}

export function compileShots(beats: Beat[], rawOptions: CompileShotsOptions = {}): Shot[] {
  if (beats.length === 0) {
    return [];
  }

  const options: Required<CompileShotsOptions> = { ...DEFAULTS, ...rawOptions };
  const beatFrames = new Map<string, number>();
  for (const beat of beats) {
    beatFrames.set(beat.id, estimateBeatFrames(beat, options));
  }

  const merged = mergeAdjacentByIntent(beats);
  const targetShotCount = resolveTargetShotCount(beats.length, options);
  const segments = rebalanceSegments(merged, targetShotCount, beatFrames);

  const shots: Shot[] = [];
  let startFrame = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const intent = segment.intent;
    const transition = transitionForShot(i, intent);
    const duration = shotDurationFrames(segment, transition, beatFrames, options);
    const shotId = `shot_${String(i + 1).padStart(3, "0")}`;
    const rng = createRng(shotId);

    const hasReference = segment.beats.some((beat) => (beat.references?.length ?? 0) > 0);
    const firstRef = segment.beats.flatMap((beat) => beat.references ?? [])[0];

    const fallbackTargetIndex = ((i % 4) + 1);
    const primaryIndex = resolveTargetIndex(firstRef?.refId, fallbackTargetIndex);
    const secondaryIndex = ((primaryIndex % 4) + 1);
    const tertiaryIndex = (((primaryIndex + 1) % 4) + 1);

    const primaryTargetId = firstRef?.refId?.trim() ? firstRef.refId : toTargetId(primaryIndex);
    const secondaryTargetId = toTargetId(secondaryIndex);
    const tertiaryTargetId = toTargetId(tertiaryIndex);

    const baseX = intent === "data" ? 0.24 : intent === "close" ? 0.52 : 0.48;
    const baseY = 0.82;

    const cameraAnchorX =
      intent === "data"
        ? 0.58
        : intent === "close"
          ? 0.5
          : intent === "intro"
            ? 0.47
            : 0.5;
    const cameraAnchorY = intent === "data" ? 0.5 : 0.52;
    const cameraAnchorZoom = intent === "data" ? 1.06 : intent === "close" ? 1.08 : 1.0;

    const cameraPreset = presetForIntent(intent, rng);
    const cameraKeyframes = buildCameraKeyframes({
      intent,
      preset: cameraPreset,
      duration,
      baseX: cameraAnchorX,
      baseY: cameraAnchorY,
      baseZoom: cameraAnchorZoom,
      rng
    });

    const hasChart = hasReference || intent === "data";
    const characterLayer = chooseCharacterLayer(intent, rng);
    const posPath = buildCharacterPosPath({
      intent,
      duration,
      baseX,
      baseY,
      layer: characterLayer,
      rng
    });

    const enablePointTrack = hasChart && (intent === "data" || hasReference);
    const pointTrack = enablePointTrack
      ? buildPointTrack({
          duration,
          intent,
          primaryTargetId,
          secondaryTargetId,
          rng
        })
      : undefined;

    const highlights = hasChart
      ? buildChartHighlights({
          duration,
          intent,
          primaryTargetId,
          secondaryTargetId,
          tertiaryTargetId,
          rng
        })
      : undefined;

    const shot: Shot = {
      shot_id: shotId,
      beat_ids: segment.beats.map((beat) => beat.id),
      start_frame: startFrame,
      duration_frames: duration,
      set: {
        set_id: intent === "data" ? "studio_chart" : "studio_host",
        variant: transition,
        layers: {
          bg_far: intent === "data" ? "bg/data_far" : "bg/host_far",
          bg_mid: intent === "data" ? "bg/data_mid" : "bg/host_mid",
          bg_near: "bg/default_near",
          fg_mask: "fg/default_mask"
        }
      },
      camera: {
        preset: cameraPreset,
        keyframes: cameraKeyframes
      },
      chart: hasChart
        ? {
            chart_id: `chart_${String(i + 1).padStart(3, "0")}`,
            type: "bar",
            dataset_id: firstRef?.datasetId ?? "dataset_main",
            time_range: "full",
            layout_preset: "main_left",
            highlights,
            callouts: [
              {
                f: Math.max(0, Math.floor(duration * 0.35)),
                text: segment.beats[0].onScreen[0] ?? segment.beats[0].intent,
                attach_to_target_id: primaryTargetId
              }
            ]
          }
        : undefined,
      character: {
        pack_id: "eraser-cat-minimal",
        layer: characterLayer,
        transform: {
          x: posPath[0].x,
          y: posPath[0].y,
          scale: intent === "close" ? 1.06 : intent === "intro" ? 1.02 : 0.98,
          flip_x: intent === "data"
        },
        tracks: {
          pos_path: posPath,
          action_track: [
            {
              f: 0,
              clip: actionClipFromIntent(intent),
              weight: 1
            }
          ],
          expression_track: [
            {
              f: 0,
              expression: expressionFromSegment(segment)
            }
          ],
          look_track: [
            {
              f: 0,
              target: enablePointTrack ? "chart" : "viewer"
            }
          ],
          point_track: pointTrack
        }
      },
      audio:
        transition === "fade"
          ? {
              sfx: [
                {
                  f: 0,
                  src: "sfx://transition/fade"
                }
              ]
            }
          : {
              sfx: [
                {
                  f: 0,
                  src: "sfx://transition/cut"
                }
              ]
            },
      qc_expectations: {
        must_keep_character_in_frame: true,
        allow_pointing_fail_fallback: true
      }
    };

    shots.push(shot);
    startFrame += duration;
  }

  return shots;
}

export function toShotsDocument(episode: EpisodeInput, shots: Shot[], fps: number = 30): ShotsDocument {
  return {
    schema_version: "1.0",
    episode: {
      episode_id: episode.episode_id,
      bible_ref: episode.bible_ref
    },
    render: {
      fps,
      width: 1920,
      height: 1080,
      safe_area: {
        x: 0.05,
        y: 0.05,
        w: 0.9,
        h: 0.9
      },
      coord_space: "normalized"
    },
    shots
  };
}








