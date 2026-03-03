import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EraserCatRig, lookAt, move, pointAt } from "../character/EraserCatRig";
import { EraserCatViewBlend } from "../character/EraserCatViewBlend";
import { turningCharacterPack } from "../character/pack";
import type { CharacterPack } from "../character/types";
import { beatPunch, holdThenSnap } from "../anim/timeRemap";
import { CameraRig, type CameraPreset } from "../effects/CameraRig";
import { ShotTransition, type ShotTransitionType } from "../effects/ShotTransition";
import { ScribbleHighlight } from "../effects/ScribbleHighlight";
import { FlashCut } from "../effects/Transitions";

export type ShotChartRow = {
  label: string;
  value: number;
  unit?: string;
};

export type ShotCameraKeyframe = {
  f: number;
  x: number;
  y: number;
  zoom: number;
  rotateDeg: number;
};

export type ShotChartHighlight = {
  f: number;
  targetId: string;
  styleToken: string;
};

export type ShotCharacterTracks = {
  posPath: Array<{
    f: number;
    x: number;
    y: number;
    interp: "linear" | "ease" | "spring";
  }>;
  actionTrack: Array<{
    f: number;
    clip: string;
    weight: number;
  }>;
  expressionTrack: Array<{
    f: number;
    expression: string;
  }>;
  lookTrack: Array<{
    f: number;
    target: string;
  }>;
  pointTrack?: Array<{
    f: number;
    targetId: string;
    hand: "left" | "right";
  }>;
};

export type ShotRenderSequence = {
  shotId: string;
  from: number;
  duration: number;
  setId: string;
  cameraPreset: string;
  narration: string;
  emphasisWords: string[];
  chartData: ShotChartRow[];
  visualMode: "chart" | "table";
  annotationsEnabled: boolean;
  pointerTargetIndex: number;
  pointerEnabled: boolean;
  freezePose: boolean;
  expectOcclusion: boolean;
  pointerTip?: {
    x: number;
    y: number;
  };
  unit?: string;
  hasChart: boolean;
  chartCallout?: string;
  characterX: number;
  characterY: number;
  characterYawFrom?: number;
  characterYawTo?: number;
  characterYawEase?: "linear" | "spring";
  cameraKeyframes?: ShotCameraKeyframe[];
  talkText?: string;
  chartHighlights?: ShotChartHighlight[];
  characterTracks?: ShotCharacterTracks;
  macroCutaway?: boolean;
  transitionType?: ShotTransitionType;
  transitionHint?: string;
  emphasisAtFrame?: number;
};

export type ShotSubtitleCue = {
  index: number;
  startFrame: number;
  endFrame: number;
  text: string;
};

export type ShotEpisodeRenderProps = {
  episodeId: string;
  safeArea: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  freezeCharacterPose: boolean;
  sequences: ShotRenderSequence[];
  subtitles: ShotSubtitleCue[];
};

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;

const CHART_BOX = {
  x: 1030,
  y: 168,
  width: 760,
  height: 510
};

const OCCLUDER_BOX = {
  x: 760,
  y: 0,
  width: 180,
  height: FRAME_HEIGHT
};

const TRANSITION_OVERLAP_FRAMES = 10;

const SHOT_VIEW_BLEND_PACK: CharacterPack = {
  ...turningCharacterPack,
  expressions: {
    ...turningCharacterPack.expressions,
    front: turningCharacterPack.expressions.view_front,
    right_3q: turningCharacterPack.expressions.view_right_3q,
    right_profile: turningCharacterPack.expressions.view_right_profile,
    left_3q: turningCharacterPack.expressions.view_left_3q,
    left_profile: turningCharacterPack.expressions.view_left_profile
  }
};

type BarGeometry = ShotChartRow & {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: {
    x: number;
    y: number;
  };
};

type CameraPose = {
  x: number;
  y: number;
  zoom: number;
  rotateDeg: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashColorSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 131 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function backgroundForShot(shotId: string, setId: string): string {
  const seed = hashColorSeed(`${shotId}:${setId}`);
  const hue = seed % 360;
  const hueSecondary = (hue + 32) % 360;
  return `linear-gradient(160deg, hsl(${hue} 48% 18%) 0%, hsl(${hueSecondary} 58% 12%) 100%)`;
}

function cleanMarkers(text: string): string {
  return text.replace(/<<([^>]+)>>/g, "$1").replace(/\s+/g, " ").trim();
}

function resolveTargetIndex(targetId: string | undefined, rowCount: number, fallbackIndex: number): number {
  if (rowCount <= 0) {
    return 0;
  }

  if (!targetId) {
    return clamp(fallbackIndex, 0, rowCount - 1);
  }

  const digitMatch = targetId.match(/(\d+)(?!.*\d)/);
  if (digitMatch) {
    const parsed = Number.parseInt(digitMatch[1], 10);
    if (Number.isFinite(parsed)) {
      return clamp((parsed - 1 + rowCount) % rowCount, 0, rowCount - 1);
    }
  }

  return clamp(hashString(targetId) % rowCount, 0, rowCount - 1);
}

function findLatestEntry<T extends { f: number }>(entries: T[] | undefined, frame: number): T | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  let candidate: T | undefined;
  for (const entry of entries) {
    if (entry.f <= frame) {
      if (!candidate || entry.f >= candidate.f) {
        candidate = entry;
      }
    }
  }

  return candidate;
}

function toEaseInOut(t: number): number {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function resolveInterpolation(
  mode: "linear" | "ease" | "spring",
  frameOffset: number,
  frameSpan: number,
  fps: number
): number {
  const t = clamp(frameSpan <= 0 ? 1 : frameOffset / frameSpan, 0, 1);

  if (mode === "ease") {
    return toEaseInOut(t);
  }

  if (mode === "spring") {
    const raw = spring({
      fps,
      frame: frameOffset,
      config: {
        damping: 14,
        stiffness: 120,
        mass: 0.75
      }
    });
    return clamp(raw, 0, 1);
  }

  return t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function resolveCharacterPosition(
  sequence: ShotRenderSequence,
  localFrame: number,
  fps: number
): { x: number; y: number } {
  const fallback = {
    x: clamp(sequence.characterX, 0, 1),
    y: clamp(sequence.characterY, 0, 1)
  };

  const track = sequence.characterTracks?.posPath;
  if (!track || track.length === 0) {
    return fallback;
  }

  const sorted = [...track].sort((a, b) => a.f - b.f);
  if (localFrame <= sorted[0].f) {
    return { x: clamp(sorted[0].x, 0, 1), y: clamp(sorted[0].y, 0, 1) };
  }

  const last = sorted[sorted.length - 1];
  if (localFrame >= last.f) {
    return { x: clamp(last.x, 0, 1), y: clamp(last.y, 0, 1) };
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (localFrame >= start.f && localFrame <= end.f) {
      const frameSpan = Math.max(1, end.f - start.f);
      const frameOffset = clamp(localFrame - start.f, 0, frameSpan);
      const t = resolveInterpolation(end.interp, frameOffset, frameSpan, fps);
      return {
        x: clamp(lerp(start.x, end.x, t), 0, 1),
        y: clamp(lerp(start.y, end.y, t), 0, 1)
      };
    }
  }

  return fallback;
}

type ResolvedYawPlan = {
  from: number;
  to: number;
  ease: "linear" | "spring";
};

function deriveDefaultYawPlan(sequence: ShotRenderSequence): ResolvedYawPlan | null {
  const source = `${sequence.cameraPreset} ${sequence.narration} ${sequence.talkText ?? ""}`.toLowerCase();
  const hasLeft = /\bleft\b/.test(source);
  const hasRight = /\bright\b/.test(source);
  const direction = hasLeft ? -1 : hasRight ? 1 : 1;

  let magnitude = 0;
  if (source.includes("profile")) {
    magnitude = 0.95;
  } else if (
    source.includes("3q") ||
    source.includes("3/4") ||
    source.includes("three quarter") ||
    source.includes("three-quarter")
  ) {
    magnitude = 0.68;
  } else if (source.includes("turn") || source.includes("rotate") || source.includes("yaw")) {
    magnitude = 0.82;
  } else if (source.includes("whip")) {
    magnitude = 0.38;
  }

  if (magnitude <= 0.001) {
    return null;
  }

  return {
    from: 0,
    to: clamp(direction * magnitude, -1, 1),
    ease: magnitude >= 0.7 ? "spring" : "linear"
  };
}

function resolveYawPlan(sequence: ShotRenderSequence): ResolvedYawPlan | null {
  const derived = deriveDefaultYawPlan(sequence);
  const fromRaw = sequence.characterYawFrom ?? derived?.from;
  const toRaw = sequence.characterYawTo ?? derived?.to;

  if (typeof fromRaw !== "number" && typeof toRaw !== "number") {
    return null;
  }

  const from = clamp(fromRaw ?? toRaw ?? 0, -1, 1);
  const to = clamp(toRaw ?? fromRaw ?? from, -1, 1);
  const ease = sequence.characterYawEase ?? derived?.ease ?? "linear";

  return { from, to, ease };
}

function hasCharacterYawPlan(sequence: ShotRenderSequence): boolean {
  const plan = resolveYawPlan(sequence);
  return plan != null && Math.abs(plan.to - plan.from) > 0.01;
}

function resolveCharacterYaw(sequence: ShotRenderSequence, localFrame: number, fps: number): number {
  const plan = resolveYawPlan(sequence);
  if (!plan) {
    return 0;
  }

  if (Math.abs(plan.to - plan.from) < 0.0001) {
    return plan.from;
  }

  if (plan.ease === "spring") {
    const raw = spring({
      fps,
      frame: localFrame,
      config: {
        damping: 14,
        stiffness: 110,
        mass: 0.8
      }
    });
    const t = clamp(raw, 0, 1);
    return clamp(lerp(plan.from, plan.to, t), -1, 1);
  }

  const t = clamp(localFrame / Math.max(1, sequence.duration - 1), 0, 1);
  return clamp(lerp(plan.from, plan.to, t), -1, 1);
}

function computeBarGeometry(rows?: ShotChartRow[]): BarGeometry[] {
  const safeRows = rows ?? [];
  const normalizedRows = safeRows.length > 0 ? safeRows : [{ label: "-", value: 1 }];
  const left = CHART_BOX.x + 56;
  const top = CHART_BOX.y + 86;
  const plotWidth = CHART_BOX.width - 112;
  const plotHeight = CHART_BOX.height - 156;
  const gap = 20;
  const count = normalizedRows.length;
  const barWidth = (plotWidth - gap * (count - 1)) / count;
  const maxValue = Math.max(1, ...normalizedRows.map((row) => row.value));

  return normalizedRows.map((row, index) => {
    const ratio = clamp(row.value / maxValue, 0, 1);
    const barHeight = Math.max(6, plotHeight * ratio);
    const x = left + index * (barWidth + gap);
    const y = top + plotHeight - barHeight;
    return {
      ...row,
      x,
      y,
      width: barWidth,
      height: barHeight,
      anchor: {
        x: x + barWidth * 0.5,
        y
      }
    };
  });
}

function fallbackCameraPoseFromPreset(cameraPreset: string): CameraPose {
  const lower = cameraPreset.toLowerCase();

  if (lower.includes("chart")) {
    return {
      x: 0.57,
      y: 0.5,
      zoom: 1.06,
      rotateDeg: 0
    };
  }

  if (lower.includes("close")) {
    return {
      x: 0.5,
      y: 0.5,
      zoom: 1.12,
      rotateDeg: 0
    };
  }

  if (lower.includes("wide")) {
    return {
      x: 0.5,
      y: 0.5,
      zoom: 0.96,
      rotateDeg: 0
    };
  }

  return {
    x: 0.5,
    y: 0.5,
    zoom: 1,
    rotateDeg: 0
  };
}

function deriveDefaultCameraKeyframes(sequence: ShotRenderSequence): ShotCameraKeyframe[] {
  const end = Math.max(1, sequence.duration - 1);
  const lower = sequence.cameraPreset.toLowerCase();
  const cue = `${lower} ${sequence.narration.toLowerCase()}`;
  const base = fallbackCameraPoseFromPreset(sequence.cameraPreset);

  if (cue.includes("whip")) {
    const direction = cue.includes("left") ? -1 : 1;
    return [
      { f: 0, x: clamp(0.5 - direction * 0.04, 0, 1), y: 0.5, zoom: 1.03, rotateDeg: direction * 0.2 },
      {
        f: Math.max(1, Math.floor(end * 0.22)),
        x: clamp(0.5 + direction * 0.32, 0, 1),
        y: 0.49,
        zoom: 1.09,
        rotateDeg: direction * 7.6
      },
      {
        f: Math.max(2, Math.floor(end * 0.46)),
        x: clamp(0.5 - direction * 0.12, 0, 1),
        y: 0.51,
        zoom: 1.03,
        rotateDeg: -direction * 1.5
      },
      { f: end, x: 0.5, y: 0.5, zoom: 1.01, rotateDeg: 0 }
    ];
  }

  if (cue.includes("close") || cue.includes("zoom")) {
    return [
      { f: 0, x: 0.5, y: 0.52, zoom: 1.04, rotateDeg: 0.2 },
      { f: Math.max(1, Math.floor(end * 0.5)), x: 0.5, y: 0.5, zoom: 1.1, rotateDeg: 0.12 },
      { f: end, x: 0.5, y: 0.48, zoom: 1.14, rotateDeg: 0 }
    ];
  }

  if (lower.includes("wide")) {
    return [
      { f: 0, x: 0.48, y: 0.53, zoom: 0.94, rotateDeg: 0 },
      { f: Math.max(1, Math.floor(end * 0.62)), x: 0.5, y: 0.51, zoom: 0.97, rotateDeg: -0.08 },
      { f: end, x: 0.5, y: 0.5, zoom: 0.99, rotateDeg: 0 }
    ];
  }

  if (cue.includes("chart")) {
    return [
      { f: 0, x: 0.54, y: 0.52, zoom: 1.01, rotateDeg: 0 },
      { f: Math.max(1, Math.floor(end * 0.55)), x: 0.57, y: 0.5, zoom: 1.06, rotateDeg: -0.12 },
      { f: end, x: 0.58, y: 0.49, zoom: 1.08, rotateDeg: 0 }
    ];
  }

  return [
    { f: 0, x: base.x, y: clamp(base.y + 0.01, 0, 1), zoom: base.zoom, rotateDeg: 0 },
    {
      f: Math.max(1, Math.floor(end * 0.55)),
      x: clamp(base.x + 0.01, 0, 1),
      y: base.y,
      zoom: base.zoom + 0.03,
      rotateDeg: -0.06
    },
    { f: end, x: clamp(base.x + 0.015, 0, 1), y: clamp(base.y - 0.01, 0, 1), zoom: base.zoom + 0.05, rotateDeg: 0 }
  ];
}

function resolveCameraKeyframes(sequence: ShotRenderSequence): ShotCameraKeyframe[] {
  if (sequence.cameraKeyframes && sequence.cameraKeyframes.length > 0) {
    return sequence.cameraKeyframes;
  }
  return deriveDefaultCameraKeyframes(sequence);
}

function resolveCameraPose(sequence: ShotRenderSequence, localFrame: number, fps: number): CameraPose {
  const keyframes = resolveCameraKeyframes(sequence);

  const sorted = [...keyframes].sort((a, b) => a.f - b.f);
  if (localFrame <= sorted[0].f) {
    return {
      x: clamp(sorted[0].x, 0, 1),
      y: clamp(sorted[0].y, 0, 1),
      zoom: Math.max(0.2, sorted[0].zoom),
      rotateDeg: sorted[0].rotateDeg
    };
  }

  const last = sorted[sorted.length - 1];
  if (localFrame >= last.f) {
    return {
      x: clamp(last.x, 0, 1),
      y: clamp(last.y, 0, 1),
      zoom: Math.max(0.2, last.zoom),
      rotateDeg: last.rotateDeg
    };
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (localFrame >= start.f && localFrame <= end.f) {
      const frameSpan = Math.max(1, end.f - start.f);
      const frameOffset = clamp(localFrame - start.f, 0, frameSpan);
      const t = resolveInterpolation("ease", frameOffset, frameSpan, fps);
      return {
        x: clamp(lerp(start.x, end.x, t), 0, 1),
        y: clamp(lerp(start.y, end.y, t), 0, 1),
        zoom: Math.max(0.2, lerp(start.zoom, end.zoom, t)),
        rotateDeg: lerp(start.rotateDeg, end.rotateDeg, t)
      };
    }
  }

  return fallbackCameraPoseFromPreset(sequence.cameraPreset);
}

function resolveCameraRigPreset(cameraPreset: string): CameraPreset {
  const lower = cameraPreset.toLowerCase();
  if (lower.includes("whip")) {
    return lower.includes("left") ? "whip-pan-left" : "whip-pan-right";
  }
  if (lower.includes("shake")) {
    return "shake";
  }
  return "none";
}

function styleTokenToColor(styleToken: string): string {
  const lower = styleToken.toLowerCase();
  if (lower.includes("warn")) {
    return "#FFD166";
  }
  if (lower.includes("hot") || lower.includes("danger")) {
    return "#FF6B6B";
  }
  return "#FFF27A";
}

function resolveTalkText(sequence: ShotRenderSequence): string | undefined {
  if (typeof sequence.talkText === "string" && sequence.talkText.trim().length > 0) {
    return cleanMarkers(sequence.talkText);
  }

  const normalizedNarration = cleanMarkers(sequence.narration);
  if (normalizedNarration.length > 0) {
    return normalizedNarration;
  }

  return undefined;
}

function resolveTransitionType(sequence: ShotRenderSequence): ShotTransitionType {
  if (sequence.transitionType) {
    return sequence.transitionType;
  }

  const hint = (sequence.transitionHint ?? "").toLowerCase();
  if (hint.includes("whip")) {
    return "whipPan";
  }
  if (hint.includes("flash")) {
    return "flashCut";
  }
  if (hint.includes("cross")) {
    return "crossfade";
  }

  const preset = sequence.cameraPreset.toLowerCase();
  if (preset.includes("whip")) {
    return "whipPan";
  }
  if (preset.includes("flash")) {
    return "flashCut";
  }

  const narration = sequence.narration.toLowerCase();
  if (narration.includes("whip")) {
    return "whipPan";
  }
  if (narration.includes("flash")) {
    return "flashCut";
  }

  return "crossfade";
}

function resolveEmphasisAtFrame(sequence: ShotRenderSequence): number {
  const fallback = Math.round(sequence.duration * 0.4);
  return clamp(sequence.emphasisAtFrame ?? fallback, 0, Math.max(0, sequence.duration - 1));
}

function resolveNumberPopFrame(sequence: ShotRenderSequence): number {
  const fallback = Math.round(sequence.duration * 0.16);
  return clamp(fallback, 0, Math.max(0, sequence.duration - 1));
}

function resolvePunchlineFrame(sequence: ShotRenderSequence): number {
  const fallback = Math.round(sequence.duration * 0.72);
  return clamp(fallback, 0, Math.max(0, sequence.duration - 1));
}

function resolveTimeRemappedFrame(sequence: ShotRenderSequence, localFrame: number): number {
  const maxFrame = Math.max(0, sequence.duration - 1);
  const numberPopFrame = resolveNumberPopFrame(sequence);
  const emphasisAtFrame = resolveEmphasisAtFrame(sequence);
  const punchlineFrame = resolvePunchlineFrame(sequence);

  let remapped = localFrame;
  remapped = holdThenSnap(remapped, numberPopFrame, sequence.hasChart ? 2 : 1, 1.15);
  remapped = holdThenSnap(remapped, emphasisAtFrame, sequence.hasChart ? 4 : 2, 1.55);
  remapped = holdThenSnap(remapped, punchlineFrame, 2, 1.1);
  remapped += beatPunch(localFrame, emphasisAtFrame, 1.1);
  remapped += beatPunch(localFrame, punchlineFrame, 0.6);

  return clamp(remapped, 0, maxFrame);
}

function resolveMacroCutawayWeight(localFrame: number, emphasisAtFrame: number): number {
  const start = emphasisAtFrame - 10;
  const zoomInEnd = emphasisAtFrame + 2;
  const holdEnd = emphasisAtFrame + 10;
  const end = emphasisAtFrame + 24;

  if (localFrame <= start || localFrame >= end) {
    return 0;
  }

  if (localFrame < zoomInEnd) {
    return toEaseInOut((localFrame - start) / Math.max(1, zoomInEnd - start));
  }

  if (localFrame <= holdEnd) {
    return 1;
  }

  return 1 - toEaseInOut((localFrame - holdEnd) / Math.max(1, end - holdEnd));
}

type ChartViewProps = {
  sequence: ShotRenderSequence;
  pointerIndex: number;
  highlightIndices: number[];
  localFrame: number;
  fps: number;
  emphasisAtFrame: number;
};

type AnimatedBarState = {
  top: number;
  height: number;
  growProgress: number;
  countProgress: number;
  countValue: number;
};

const ChartView = ({
  sequence,
  pointerIndex,
  highlightIndices,
  localFrame,
  fps,
  emphasisAtFrame
}: ChartViewProps) => {
  const bars = computeBarGeometry(sequence.chartData ?? []);
  const highlightSet = new Set(highlightIndices);

  const countUpFrames = Math.max(14, Math.floor(sequence.duration * 0.35));

  const animateBar = (bar: BarGeometry, index: number): AnimatedBarState => {
    const introDelay = index * 2;

    const rawGrow = spring({
      fps,
      frame: localFrame - introDelay,
      config: {
        damping: 11,
        stiffness: 120,
        mass: 0.7
      }
    });

    const growProgress = clamp(rawGrow, 0, 1.16);
    const animatedHeight = Math.max(2, bar.height * Math.max(0, growProgress));
    const baseline = bar.y + bar.height;
    const animatedTop = baseline - animatedHeight;

    const countProgress = clamp(
      interpolate(localFrame - introDelay, [0, countUpFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      }),
      0,
      1
    );

    return {
      top: animatedTop,
      height: animatedHeight,
      growProgress,
      countProgress,
      countValue: Math.round(bar.value * countProgress)
    };
  };

  const targetIndex = clamp(pointerIndex, 0, Math.max(0, bars.length - 1));
  const targetBar = bars[targetIndex];
  const targetAnimated = targetBar ? animateBar(targetBar, targetIndex) : undefined;

  const emphasisEnvelope = clamp(1 - Math.abs(localFrame - emphasisAtFrame) / 20, 0, 1);
  const emphasisSpring =
    localFrame >= emphasisAtFrame
      ? spring({
          fps,
          frame: localFrame - emphasisAtFrame,
          config: {
            damping: 14,
            stiffness: 180,
            mass: 0.5
          }
        })
      : 0;
  const pulseScale = 1 + emphasisEnvelope * (0.04 + clamp(emphasisSpring, 0, 1.2) * 0.06);

  const emphasisRect =
    targetBar && targetAnimated
      ? {
          x: clamp(targetBar.x - CHART_BOX.x - 12, 0, CHART_BOX.width - 8),
          y: clamp(targetAnimated.top - CHART_BOX.y - 12, 0, CHART_BOX.height - 8),
          width: clamp(targetBar.width + 24, 16, CHART_BOX.width),
          height: clamp(targetAnimated.height + 24, 24, CHART_BOX.height)
        }
      : undefined;

  return (
    <div
      style={{
        position: "absolute",
        left: CHART_BOX.x,
        top: CHART_BOX.y,
        width: CHART_BOX.width,
        height: CHART_BOX.height,
        borderRadius: 20,
        border: "2px solid rgba(255, 255, 255, 0.28)",
        background: "linear-gradient(180deg, rgba(12, 19, 34, 0.84) 0%, rgba(6, 10, 20, 0.92) 100%)",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 22,
          color: "#e9f2ff",
          fontSize: 32,
          fontWeight: 700
        }}
      >
        Chart View
      </div>

      {bars.map((bar, index) => {
        const isPointer = index === targetIndex;
        const isHighlighted = highlightSet.has(index);
        const animated = animateBar(bar, index);
        const barLeft = bar.x - CHART_BOX.x;
        const barTop = animated.top - CHART_BOX.y;

        return (
          <div key={`${bar.label}:${index}`}>
            <div
              style={{
                position: "absolute",
                left: barLeft,
                top: barTop,
                width: bar.width,
                height: animated.height,
                borderRadius: 10,
                background: isPointer
                  ? "linear-gradient(180deg, #87e3cc 0%, #d9fff4 180%)"
                  : "linear-gradient(180deg, #5f9ff2 0%, #294569 180%)",
                boxShadow:
                  isHighlighted || (isPointer && emphasisEnvelope > 0)
                    ? "0 0 0 2px rgba(255, 242, 122, 0.7), 0 0 18px rgba(255, 242, 122, 0.45)"
                    : undefined,
                transform: isPointer ? `scale(${pulseScale}, ${1 + emphasisEnvelope * 0.08})` : undefined,
                transformOrigin: "50% 100%"
              }}
            />

            <div
              style={{
                position: "absolute",
                left: barLeft + bar.width * 0.5,
                top: barTop - 30,
                transform: "translateX(-50%)",
                color: "#edf4ff",
                fontSize: 22,
                fontWeight: 700
              }}
            >
              {animated.countValue}
              {sequence.unit ? ` ${sequence.unit}` : ""}
            </div>

            <div
              style={{
                position: "absolute",
                left: barLeft + bar.width * 0.5,
                top: CHART_BOX.height - 52,
                transform: "translateX(-50%)",
                color: "#c7d6f0",
                fontSize: 22
              }}
            >
              {bar.label}
            </div>
          </div>
        );
      })}

      {emphasisRect ? (
        <>
          <div
            style={{
              position: "absolute",
              left: emphasisRect.x - 8,
              top: emphasisRect.y - 8,
              width: emphasisRect.width + 16,
              height: emphasisRect.height + 16,
              borderRadius: 14,
              boxShadow: "0 0 0 2px rgba(255, 242, 122, 0.8), 0 0 20px rgba(255, 242, 122, 0.5)",
              opacity: emphasisEnvelope * 0.55,
              transform: `scale(${1 + emphasisEnvelope * 0.08})`,
              transformOrigin: "50% 50%"
            }}
          />
          <ScribbleHighlight
            width={CHART_BOX.width}
            height={CHART_BOX.height}
            rect={emphasisRect}
            startFrame={emphasisAtFrame}
            durationInFrames={18}
            color="#FFF27A"
            strokeWidth={6}
          />
        </>
      ) : null}

      {sequence.annotationsEnabled && sequence.chartCallout ? (
        <div
          style={{
            position: "absolute",
            left: 26,
            right: 26,
            bottom: 18,
            color: "#eff6ff",
            fontSize: 24,
            fontWeight: 600,
            background: "rgba(6, 11, 20, 0.66)",
            borderRadius: 12,
            padding: "10px 12px"
          }}
        >
          {sequence.chartCallout}
        </div>
      ) : null}
    </div>
  );
};

type TableViewProps = {
  sequence: ShotRenderSequence;
};

const TableView = ({ sequence }: TableViewProps) => {
  const sourceRows = sequence.chartData ?? [];
  const rows = sourceRows.length > 0 ? sourceRows : [{ label: "-", value: 0 }];
  return (
    <div
      style={{
        position: "absolute",
        left: CHART_BOX.x,
        top: CHART_BOX.y,
        width: CHART_BOX.width,
        height: CHART_BOX.height,
        borderRadius: 20,
        border: "2px solid rgba(255, 255, 255, 0.28)",
        background: "linear-gradient(180deg, rgba(12, 19, 34, 0.84) 0%, rgba(6, 10, 20, 0.92) 100%)",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 22,
          color: "#e9f2ff",
          fontSize: 32,
          fontWeight: 700
        }}
      >
        Table View
      </div>

      <div
        style={{
          position: "absolute",
          left: 26,
          right: 26,
          top: 86,
          bottom: 24,
          borderRadius: 12,
          border: "1px solid rgba(255, 255, 255, 0.2)",
          overflow: "hidden"
        }}
      >
        {rows.map((row, index) => (
          <div
            key={`${row.label}:${index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom:
                index === rows.length - 1 ? "none" : "1px solid rgba(255, 255, 255, 0.12)",
              background: index % 2 === 0 ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.02)"
            }}
          >
            <span
              style={{
                color: "#dbe6fa",
                fontSize: 24
              }}
            >
              {row.label}
            </span>
            <span
              style={{
                color: "#f5f9ff",
                fontSize: 24,
                fontWeight: 700
              }}
            >
              {row.value}
              {sequence.unit ? ` ${sequence.unit}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

type ShotLayerProps = {
  sequence: ShotRenderSequence;
  freezeCharacterPose: boolean;
  frameOffset?: number;
};

const ShotLayer = ({ sequence, freezeCharacterPose, frameOffset = 0 }: ShotLayerProps) => {
  const localFrame = useCurrentFrame() + frameOffset;
  const { fps } = useVideoConfig();
  const animationFrame = resolveTimeRemappedFrame(sequence, localFrame);
  const emphasisAtFrame = resolveEmphasisAtFrame(sequence);
  const punchlineFrame = resolvePunchlineFrame(sequence);

  const bars = computeBarGeometry(sequence.chartData ?? []);
  const rowCount = bars.length;

  const latestPointTrack = findLatestEntry(sequence.characterTracks?.pointTrack, animationFrame);
  const pointTrackIndex = resolveTargetIndex(latestPointTrack?.targetId, rowCount, sequence.pointerTargetIndex);

  const activeHighlightEntries = (sequence.chartHighlights ?? [])
    .filter((highlight) => animationFrame >= highlight.f && animationFrame <= highlight.f + 24)
    .slice(0, 2);

  const highlightIndices = activeHighlightEntries.map((highlight) =>
    resolveTargetIndex(highlight.targetId, rowCount, pointTrackIndex)
  );

  const effectivePointerIndex =
    highlightIndices.length > 0 ? highlightIndices[highlightIndices.length - 1] : pointTrackIndex;

  const targetBar = bars[clamp(effectivePointerIndex, 0, Math.max(0, bars.length - 1))];
  const pointerTarget = targetBar?.anchor ?? {
    x: CHART_BOX.x + CHART_BOX.width * 0.65,
    y: CHART_BOX.y + CHART_BOX.height * 0.45
  };

  const trackedPosition = resolveCharacterPosition(sequence, animationFrame, fps);
  const characterX = trackedPosition.x * FRAME_WIDTH;
  const characterY = trackedPosition.y * FRAME_HEIGHT;

  const shouldFreeze = freezeCharacterPose || sequence.freezePose;
  const usePointer =
    !shouldFreeze && sequence.hasChart && sequence.visualMode === "chart" && sequence.pointerEnabled;

  const useYawBlend = hasCharacterYawPlan(sequence);
  const characterYaw = useYawBlend ? resolveCharacterYaw(sequence, animationFrame, fps) : 0;
  const rigTalkText = resolveTalkText(sequence);
  const rigSeed = `shot-episode:${sequence.shotId}`;

  const pose = shouldFreeze
    ? move(characterX, characterY)
    : usePointer
      ? pointAt(pointerTarget, lookAt(pointerTarget, move(characterX, characterY)))
      : lookAt({ x: FRAME_WIDTH * 0.55, y: FRAME_HEIGHT * 0.34 }, move(characterX, characterY));

  const cameraPoseBase = resolveCameraPose(sequence, animationFrame, fps);
  const macroCutawayEnabled =
    (sequence.macroCutaway ?? (sequence.hasChart && sequence.visualMode === "chart")) &&
    sequence.hasChart &&
    sequence.visualMode === "chart";
  const macroCutawayWeight = macroCutawayEnabled ? resolveMacroCutawayWeight(localFrame, emphasisAtFrame) : 0;
  const macroTargetPose: CameraPose = {
    x: clamp(pointerTarget.x / FRAME_WIDTH, 0, 1),
    y: clamp((pointerTarget.y - 38) / FRAME_HEIGHT, 0, 1),
    zoom: Math.max(cameraPoseBase.zoom, 1.26),
    rotateDeg: cameraPoseBase.rotateDeg
  };
  const cameraPose: CameraPose =
    macroCutawayWeight > 0
      ? {
          x: lerp(cameraPoseBase.x, macroTargetPose.x, macroCutawayWeight),
          y: lerp(cameraPoseBase.y, macroTargetPose.y, macroCutawayWeight),
          zoom: lerp(cameraPoseBase.zoom, macroTargetPose.zoom, macroCutawayWeight),
          rotateDeg: lerp(cameraPoseBase.rotateDeg, macroTargetPose.rotateDeg, macroCutawayWeight)
        }
      : cameraPoseBase;
  const pan = {
    x: (0.5 - cameraPose.x) * FRAME_WIDTH,
    y: (0.5 - cameraPose.y) * FRAME_HEIGHT
  };

  const rigPreset = resolveCameraRigPreset(sequence.cameraPreset);
  const presetProgress =
    rigPreset === "whip-pan-left" || rigPreset === "whip-pan-right"
      ? clamp(animationFrame / Math.max(1, Math.min(16, Math.floor(sequence.duration * 0.3))), 0, 1)
      : 0;

  const emphasisShakeEnvelope = clamp(1 - Math.abs(localFrame - emphasisAtFrame) / 18, 0, 1);
  const baseShakeIntensity = rigPreset === "shake" ? 4 : 0;
  const shakeIntensity = baseShakeIntensity + emphasisShakeEnvelope * 1.2;
  const shakeConfig =
    shakeIntensity > 0.01
      ? {
          intensity: shakeIntensity,
          speed: rigPreset === "shake" ? 1.05 : 1.2,
          rotationIntensityDeg: (rigPreset === "shake" ? 0.6 : 0.18) + emphasisShakeEnvelope * 0.16
        }
      : undefined;

  const punchlineEnvelope = clamp(1 - Math.abs(localFrame - punchlineFrame) / 12, 0, 1);
  const narrationScale = 1 + punchlineEnvelope * 0.045;
  const narrationGlow = punchlineEnvelope * 0.35;

  const fadeEdgeFrames = Math.min(8, Math.max(2, Math.floor(sequence.duration * 0.15)));
  const fadeInOpacity = 1 - clamp(localFrame / fadeEdgeFrames, 0, 1);
  const fadeOutOpacity = 1 - clamp((sequence.duration - 1 - localFrame) / fadeEdgeFrames, 0, 1);
  const transitionShadeOpacity = Math.max(fadeInOpacity, fadeOutOpacity) * 0.35;

  const resolvedTransition = resolveTransitionType(sequence);
  const flashAtStart = resolvedTransition === "flashCut";
  const flashAtEnd = resolvedTransition === "flashCut";
  const endFlashStart = Math.max(0, sequence.duration - 5);

  return (
    <AbsoluteFill
      style={{
        background: backgroundForShot(sequence.shotId, sequence.setId),
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <CameraRig
        pan={pan}
        zoom={cameraPose.zoom}
        rotateDeg={cameraPose.rotateDeg}
        shake={shakeConfig}
        preset={rigPreset}
        presetProgress={presetProgress}
      >
        <AbsoluteFill>
          <div
            style={{
              position: "absolute",
              left: 72,
              top: 62,
              padding: "12px 16px",
              borderRadius: 12,
              background: "rgba(12, 19, 34, 0.65)",
              color: "#e6efff",
              border: "1px solid rgba(255, 255, 255, 0.22)",
              fontSize: 24,
              fontWeight: 600
            }}
          >
            {sequence.shotId} | {sequence.setId} | {sequence.cameraPreset} | {sequence.visualMode}
          </div>

          {sequence.hasChart && sequence.visualMode === "chart" ? (
            <ChartView
              sequence={sequence}
              pointerIndex={effectivePointerIndex}
              highlightIndices={highlightIndices}
              localFrame={animationFrame}
              fps={fps}
              emphasisAtFrame={emphasisAtFrame}
            />
          ) : null}

          {sequence.hasChart && sequence.visualMode === "table" ? <TableView sequence={sequence} /> : null}

          {macroCutawayWeight > 0.01 && targetBar ? (
            <div
              style={{
                position: "absolute",
                left: targetBar.x - 18,
                top: targetBar.y - 18,
                width: targetBar.width + 36,
                height: targetBar.height + 36,
                borderRadius: 16,
                border: `2px solid rgba(255, 242, 122, ${0.35 + macroCutawayWeight * 0.45})`,
                boxShadow: "0 0 20px rgba(255, 242, 122, 0.45)",
                opacity: macroCutawayWeight,
                transform: `scale(${1 + macroCutawayWeight * 0.06})`,
                transformOrigin: "50% 50%"
              }}
            />
          ) : null}

          <div
            style={{
              position: "absolute",
              left: 88,
              top: 760,
              width: 840,
              borderRadius: 16,
              border: "2px solid rgba(255, 255, 255, 0.2)",
              background: "rgba(9, 14, 24, 0.72)",
              color: "#f6fbff",
              fontSize: 32,
              fontWeight: 500,
              lineHeight: 1.3,
              padding: "20px 24px",
              transform: `scale(${narrationScale})`,
              transformOrigin: "50% 50%",
              boxShadow: `0 0 0 1px rgba(255, 255, 255, 0.04), 0 0 ${Math.round(
                24 * narrationGlow
              )}px rgba(255, 222, 140, 0.35)`
            }}
          >
            {cleanMarkers(sequence.narration)}
          </div>

          {useYawBlend ? (
            <EraserCatViewBlend
              pose={pose}
              yaw={characterYaw}
              targetPoint={usePointer ? pointerTarget : undefined}
              pack={SHOT_VIEW_BLEND_PACK}
              animationMode="alive"
              seed={rigSeed}
              talkText={rigTalkText}
            />
          ) : (
            <EraserCatRig
              pose={pose}
              targetPoint={usePointer ? pointerTarget : undefined}
              animationMode="alive"
              seed={rigSeed}
              talkText={rigTalkText}
            />
          )}

          {activeHighlightEntries.map((highlight, index) => {
            const barIndex = resolveTargetIndex(highlight.targetId, rowCount, effectivePointerIndex);
            const bar = bars[barIndex];
            if (!bar) {
              return null;
            }

            const color = styleTokenToColor(highlight.styleToken);
            const rect = {
              x: bar.x - 14,
              y: bar.y - 14,
              width: bar.width + 28,
              height: bar.height + 28
            };

            return (
              <div key={`highlight-${highlight.targetId}-${highlight.f}-${index}`}>
                <div
                  style={{
                    position: "absolute",
                    left: rect.x - 8,
                    top: rect.y - 8,
                    width: rect.width + 16,
                    height: rect.height + 16,
                    borderRadius: 14,
                    boxShadow: `0 0 0 2px ${color}, 0 0 22px ${color}`,
                    opacity: 0.36
                  }}
                />
                <ScribbleHighlight
                  width={FRAME_WIDTH}
                  height={FRAME_HEIGHT}
                  rect={rect}
                  startFrame={highlight.f}
                  durationInFrames={18}
                  color={color}
                  strokeWidth={6}
                />
              </div>
            );
          })}

          {sequence.expectOcclusion ? (
            <div
              style={{
                position: "absolute",
                left: OCCLUDER_BOX.x,
                top: OCCLUDER_BOX.y,
                width: OCCLUDER_BOX.width,
                height: OCCLUDER_BOX.height,
                background: "linear-gradient(180deg, #412e22 0%, #2b1f17 100%)",
                boxShadow: "8px 0 18px rgba(0, 0, 0, 0.3)"
              }}
            />
          ) : null}

          {flashAtStart ? <FlashCut startFrame={0} durationInFrames={4} maxOpacity={0.5} /> : null}
          {flashAtEnd ? <FlashCut startFrame={endFlashStart} durationInFrames={4} maxOpacity={0.45} /> : null}

          {transitionShadeOpacity > 0 ? (
            <AbsoluteFill
              style={{
                backgroundColor: "rgba(0, 0, 0, 1)",
                opacity: transitionShadeOpacity,
                pointerEvents: "none"
              }}
            />
          ) : null}
        </AbsoluteFill>
      </CameraRig>
    </AbsoluteFill>
  );
};

export const ShotEpisodeComposition = ({
  episodeId,
  safeArea,
  freezeCharacterPose,
  sequences,
  subtitles
}: ShotEpisodeRenderProps) => {
  const frame = useCurrentFrame();
  const activeSubtitle = subtitles.find((cue) => frame >= cue.startFrame && frame <= cue.endFrame);
  const overlapFrames = TRANSITION_OVERLAP_FRAMES;
  const regularTracks = sequences.map((sequence, index) => {
    const hasNext = index < sequences.length - 1;
    const trimmed = hasNext ? Math.min(overlapFrames, Math.max(0, sequence.duration - 1)) : 0;
    return {
      sequence,
      duration: Math.max(1, sequence.duration - trimmed)
    };
  });

  return (
    <AbsoluteFill
      style={{
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        background: "#0f1526"
      }}
    >
      {regularTracks.map(({ sequence, duration }) => (
        <Sequence key={`base-${sequence.shotId}`} from={sequence.from} durationInFrames={duration}>
          <ShotLayer sequence={sequence} freezeCharacterPose={freezeCharacterPose} />
        </Sequence>
      ))}

      {sequences.slice(0, -1).map((sequence, index) => {
        const next = sequences[index + 1];
        const transitionFrames = Math.min(
          overlapFrames,
          Math.max(1, sequence.duration),
          Math.max(1, next.duration)
        );
        const transitionFrom = Math.max(0, next.from - transitionFrames);
        const transitionType = resolveTransitionType(next);

        return (
          <Sequence
            key={`transition-${sequence.shotId}-${next.shotId}`}
            from={transitionFrom}
            durationInFrames={transitionFrames}
          >
            <ShotTransition
              fromFrame={0}
              durationFrames={transitionFrames}
              type={transitionType}
              prev={
                <ShotLayer
                  sequence={sequence}
                  freezeCharacterPose={freezeCharacterPose}
                  frameOffset={Math.max(0, sequence.duration - transitionFrames)}
                />
              }
              next={<ShotLayer sequence={next} freezeCharacterPose={freezeCharacterPose} frameOffset={0} />}
              direction={next.cameraPreset.toLowerCase().includes("left") ? "left" : "right"}
            />
          </Sequence>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: safeArea.left,
          top: safeArea.top,
          right: safeArea.right,
          bottom: safeArea.bottom,
          border: "2px dashed rgba(255, 255, 255, 0.25)",
          borderRadius: 12,
          pointerEvents: "none"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 52,
          textAlign: "center",
          color: "#f9fcff",
          fontSize: 42,
          fontWeight: 700,
          textShadow: "0 4px 12px rgba(0, 0, 0, 0.75)"
        }}
      >
        {activeSubtitle ? cleanMarkers(activeSubtitle.text) : ""}
      </div>

      <div
        style={{
          position: "absolute",
          right: 30,
          top: 28,
          color: "#c4d6f8",
          fontSize: 20,
          padding: "8px 12px",
          background: "rgba(6, 10, 16, 0.58)",
          borderRadius: 10
        }}
      >
        Episode: {episodeId}
      </div>
    </AbsoluteFill>
  );
};


