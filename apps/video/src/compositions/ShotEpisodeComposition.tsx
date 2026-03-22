import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ChannelVisualMotionProfileId, ChannelVisualMotionPresetId, ResolvedProfiles } from "@ec/profiles";
import type { CSSProperties } from "react";
import { EraserCatRig, lookAt, move, pointAt } from "../character/EraserCatRig";
import { EraserCatViewBlend } from "../character/EraserCatViewBlend";
import { turningCharacterPack } from "../character/pack";
import type { CharacterPack } from "../character/types";
import { beatPunch, holdThenSnap } from "../anim/timeRemap";
import {
  resolveDefaultMotionPreset,
  resolveVisualMotionProgress,
  resolveVisualMotionState
} from "./visualMotion";
import { CameraRig, type CameraPreset } from "../effects/CameraRig";
import { ShotFinishPass } from "../effects/ShotFinishPass";
import { ShotTransition, type ShotTransitionType } from "../effects/ShotTransition";
import { ScribbleHighlight } from "../effects/ScribbleHighlight";
import { FlashCut } from "../effects/Transitions";
import { VisualObjectRendererAdapter } from "../renderers/VisualObjectRendererAdapter";
import type { RendererFinishProfile, RendererVisualObject } from "../renderers/types";

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

export type ShotInsertAsset = {
  assetId: string;
  type: "chart" | "board" | "caption_card" | "callout_card" | "diagram" | "icon_explainer" | "caution_card";
  layout: "lower_third" | "sidebar";
  title: string;
  body: string;
  accentToken: "economy" | "medical" | "neutral";
  items?: string[];
  selection?: {
    resolver_id: "visual_object_resolver_v1" | "visual_object_planner_v2";
    selected_insert_type: ShotInsertAsset["type"];
    candidate_insert_types: ShotInsertAsset["type"][];
    supporting_kind: ShotVisualObject["kind"];
    educational_mode: string;
    channel_domain: "economy" | "medical";
    selection_reason: string;
  };
};

export type ShotVisualIntentFamily =
  | "chart_primary"
  | "timeline_metric"
  | "comparison_focus"
  | "diagram_primary"
  | "risk_focus"
  | "summary_focus";

export type ShotVisualPlan = {
  resolver_id: "visual_pair_planner_v1";
  educational_mode: string;
  channel_domain: "economy" | "medical";
  insert_need_candidates: ShotInsertAsset["type"][];
  candidate_intents: Array<{
    intent_id: string;
    intent_family: ShotVisualIntentFamily;
    score: number;
    candidate_insert_types: ShotInsertAsset["type"][];
    candidate_primary_kinds: ShotVisualObject["kind"][];
    candidate_supporting_kinds: ShotVisualObject["kind"][];
    selection_reason: string;
  }>;
  selected_intent_id: string;
  selected_intent_family: ShotVisualIntentFamily;
  selected_primary_kind?: ShotVisualObject["kind"];
  selected_supporting_kind?: ShotVisualObject["kind"];
  selected_insert_type?: ShotInsertAsset["type"];
  selection_reason: string;
};

export type ShotVisualObject = {
  objectId: string;
  kind:
    | "bar_chart"
    | "line_chart"
    | "area_chart"
    | "pie_or_donut"
    | "heatmap"
    | "scatter"
    | "boxplot"
    | "map"
    | "table"
    | "kpi_card"
    | "timeline"
    | "comparison_board"
    | "icon_grid"
    | "callout_card"
    | "process_flow"
    | "anatomy_diagram"
    | "risk_meter"
    | "summary_card";
  source: "legacy_chart_v1" | "legacy_insert_v1" | "planner_v2";
  semanticRole: "primary_explainer" | "supporting_explainer" | "accent";
  preferredRegion: "main_left" | "main_right" | "center_stage" | "sidebar" | "lower_third";
  safeZoneTags: Array<
    "subtitle_safe" | "chart_safe" | "mascot_blocking" | "pointer_reachable" | "negative_space_preserve"
  >;
  animationPolicy: "hold" | "emphasis_pulse" | "presenter_guided";
  motionPreset?: ChannelVisualMotionPresetId;
  motionProfileId?: ChannelVisualMotionProfileId;
  fallbackPolicy: "fallback_to_table" | "fallback_to_summary_card" | "hide_optional";
  title?: string;
  body?: string;
  accentToken?: "economy" | "medical" | "neutral";
  items?: string[];
  pointerTargetIds?: string[];
  anchors?: Array<{
    anchor_id: string;
    type: "pointer_anchor" | "look_target" | "camera_cutaway_target" | "callout_anchor" | "safe_area_box";
    x: number;
    y: number;
    width?: number;
    height?: number;
    target_id?: string;
    weight?: number;
  }>;
  safeArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
    subtitle_avoid: boolean;
    mascot_avoid: boolean;
    pointer_reachable: boolean;
  };
  selection?: {
    resolver_id: "visual_object_resolver_v1" | "visual_object_planner_v2";
    data_shape:
      | "categorical_comparison"
      | "time_series"
      | "proportion"
      | "correlation"
      | "distribution"
      | "geo"
      | "matrix"
      | "tabular"
      | "process_steps"
      | "structure"
      | "risk_signal"
      | "metric_snapshot"
      | "summary"
      | "generic";
    educational_mode: string;
    channel_domain: "economy" | "medical";
    selected_kind: ShotVisualObject["kind"];
    candidate_kinds: ShotVisualObject["kind"][];
    selection_reason: string;
  };
  dataRef?: {
    chartId?: string;
    datasetId?: string;
    timeRange?: string;
    layoutHint?: string;
  };
};

export type ShotLayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ShotLayoutPlan = {
  subtitleSafeZone: ShotLayoutRect;
  narrationBox: ShotLayoutRect;
  primaryVisualBox: ShotLayoutRect;
  chartSafeZone?: ShotLayoutRect;
  mascotBlockingZone: ShotLayoutRect;
  insertBox?: ShotLayoutRect;
  negativeSpaceBox?: ShotLayoutRect;
  occluderBox?: ShotLayoutRect;
  pointerReachability: {
    reachable: boolean;
    reason: string;
    mascotToTargetDistancePx: number | null;
    targetPoint?: {
      x: number;
      y: number;
    };
  };
};

export type ShotFinishProfile = {
  id: string;
  grainOpacity: number;
  scanlineOpacity: number;
  vignetteOpacity: number;
  tintOpacity: number;
  bloomOpacity: number;
  sharpenOpacity: number;
  toneOverlayOpacity: number;
  toneOverlayColor: string;
  textureMatchOpacity: number;
  paletteContinuityOpacity: number;
  linePreserveOpacity: number;
  renderPathCompensation: "deterministic" | "sidecar_wan" | "sidecar_hunyuan";
  episodeFinishProfileId?: string;
};

export type ShotEpisodeFinishProfile = {
  id: string;
  targetGrainOpacity: number;
  targetScanlineOpacity: number;
  targetVignetteOpacity: number;
  targetTintOpacity: number;
  targetBloomOpacity: number;
  targetSharpenOpacity: number;
  targetToneOverlayOpacity: number;
  targetToneOverlayColor: string;
  textureMatchOpacity: number;
  paletteContinuityOpacity: number;
  linePreserveOpacity: number;
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
  viewTrack?: Array<{
    f: number;
    view: "front" | "threeQuarter" | "profile";
  }>;
  visemeTrack?: Array<{
    f: number;
    viseme: "mouth_closed" | "mouth_open_small" | "mouth_open_wide" | "mouth_round_o";
    intensity: number;
  }>;
  pointTrack?: Array<{
    f: number;
    targetId: string;
    hand: "left" | "right";
  }>;
};

export type ShotSequenceAlignment = {
  shotId: string;
  provider: string;
  version?: string;
  sourceKind: "heuristic" | "provider";
  words: Array<{
    text: string;
    startSec: number;
    endSec: number;
    localStartSec: number;
    localEndSec: number;
    viseme: "mouth_closed" | "mouth_open_small" | "mouth_open_wide" | "mouth_round_o";
    intensity: number;
    emphasis: boolean;
  }>;
  visemeCues: Array<{
    localTimeSec: number;
    viseme: "mouth_closed" | "mouth_open_small" | "mouth_open_wide" | "mouth_round_o";
    intensity: number;
  }>;
  pauseMap: Array<{
    startSec: number;
    endSec: number;
    localStartSec: number;
    localEndSec: number;
    durationSec: number;
    strength: "micro" | "phrase" | "sentence";
  }>;
  emphasisWords: string[];
};

export type ShotRenderSequence = {
  shotId: string;
  shotType: "talk" | "reaction" | "broll" | "transition" | "fx";
  renderMode: "deterministic" | "generative_broll" | "generative_i2v" | "generative_s2v" | "generative_overlay";
  characterPackId: string;
  sidecarVideoSrc?: string;
  from: number;
  duration: number;
  setId: string;
  cameraPreset: string;
  narration: string;
  emphasisWords: string[];
  chartData: ShotChartRow[];
  visualMode: "chart" | "table";
  primaryVisualKind?:
    | "bar_chart"
    | "line_chart"
    | "area_chart"
    | "pie_or_donut"
    | "heatmap"
    | "scatter"
    | "boxplot"
    | "map"
    | "table"
    | "kpi_card"
    | "timeline"
    | "comparison_board"
    | "icon_grid"
    | "callout_card"
    | "process_flow"
    | "anatomy_diagram"
    | "risk_meter"
    | "summary_card";
  visualObjects?: ShotVisualObject[];
  layoutPlan?: ShotLayoutPlan;
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
  insertAsset?: ShotInsertAsset;
  visualPlan?: ShotVisualPlan;
  finishProfile?: ShotFinishProfile;
  characterTracks?: ShotCharacterTracks;
  alignment?: ShotSequenceAlignment;
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
  episodeFinishProfile?: ShotEpisodeFinishProfile;
  characterPacks?: Record<string, CharacterPack>;
  profiles?: ResolvedProfiles;
};

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;

const CHART_BOX = {
  x: 1030,
  y: 168,
  width: 760,
  height: 510
};

const NARRATION_BOX = {
  x: 88,
  y: 760,
  width: 840,
  height: 160
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

function isGeneratedPack(pack: CharacterPack | null | undefined): pack is CharacterPack {
  if (!pack) {
    return false;
  }
  return (
    typeof pack.expressions.front_neutral === "object" &&
    typeof pack.expressions.threeQuarter_neutral === "object" &&
    typeof pack.expressions.profile_neutral === "object"
  );
}

function normalizeTrackExpression(expression: string | undefined): string {
  const lower = (expression ?? "neutral").trim().toLowerCase();
  if (lower === "blink") {
    return "blink";
  }
  if (lower === "excited") {
    return "happy";
  }
  if (lower === "focused") {
    return "neutral";
  }
  return lower.length > 0 ? lower : "neutral";
}

function resolvePackForSequence(
  sequence: ShotRenderSequence,
  characterPacks?: Record<string, CharacterPack>
): CharacterPack | null {
  if (!characterPacks) {
    return null;
  }
  return characterPacks[sequence.characterPackId] ?? null;
}

function resolveTrackedExpressionState(
  sequence: ShotRenderSequence,
  frame: number
): { normalizedExpression: string; forceBlink: boolean } {
  const entries = sequence.characterTracks?.expressionTrack ?? [];
  let latestNonBlink: string | undefined;
  let latestExpression = "neutral";

  for (const entry of entries) {
    if (entry.f > frame) {
      break;
    }
    const normalized = normalizeTrackExpression(entry.expression);
    latestExpression = normalized;
    if (normalized !== "blink") {
      latestNonBlink = normalized;
    }
  }

  if (latestExpression === "blink") {
    return {
      normalizedExpression: latestNonBlink ?? "neutral",
      forceBlink: true
    };
  }

  return {
    normalizedExpression: latestExpression,
    forceBlink: false
  };
}

function resolveExplicitView(sequence: ShotRenderSequence, frame: number): "front" | "threeQuarter" | "profile" | null {
  const latest = findLatestEntry(sequence.characterTracks?.viewTrack, frame);
  return latest?.view ?? null;
}

function resolveTrackedViseme(
  sequence: ShotRenderSequence,
  frame: number
): { viseme?: "mouth_closed" | "mouth_open_small" | "mouth_open_wide" | "mouth_round_o"; mouthOpen?: number } {
  const latest = findLatestEntry(sequence.characterTracks?.visemeTrack, frame);
  if (!latest) {
    return {};
  }

  const intensity = clamp(latest.intensity ?? 0, 0, 1);
  if (latest.viseme === "mouth_open_wide") {
    return { viseme: latest.viseme, mouthOpen: 0.72 + intensity * 0.22 };
  }
  if (latest.viseme === "mouth_round_o") {
    return { viseme: latest.viseme, mouthOpen: 0.42 + intensity * 0.18 };
  }
  if (latest.viseme === "mouth_open_small") {
    return { viseme: latest.viseme, mouthOpen: 0.22 + intensity * 0.18 };
  }
  return { viseme: latest.viseme, mouthOpen: 0 };
}

function resolveGeneratedExpressionKey(
  pack: CharacterPack,
  explicitView: "front" | "threeQuarter" | "profile",
  normalizedExpression: string
): string {
  const candidates = [
    `${explicitView}_${normalizedExpression}`,
    explicitView === "front" ? normalizedExpression : "",
    explicitView === "front" ? "front_neutral" : `${explicitView}_neutral`,
    explicitView === "front"
      ? "view_front"
      : explicitView === "threeQuarter"
        ? "view_right_3q"
        : "view_right_profile",
    "neutral"
  ].filter((value) => value.length > 0);

  for (const candidate of candidates) {
    if (pack.expressions[candidate]) {
      return candidate;
    }
  }
  return "neutral";
}

function resolveTrackedLookTarget(
  sequence: ShotRenderSequence,
  frame: number,
  pointerTarget: { x: number; y: number }
): { x: number; y: number } {
  const latest = findLatestEntry(sequence.characterTracks?.lookTrack, frame);
  const target = (latest?.target ?? "viewer").toLowerCase();
  if (target === "chart") {
    return pointerTarget;
  }
  if (target === "left") {
    return { x: FRAME_WIDTH * 0.34, y: FRAME_HEIGHT * 0.34 };
  }
  if (target === "right") {
    return { x: FRAME_WIDTH * 0.74, y: FRAME_HEIGHT * 0.34 };
  }
  if (target === "up") {
    return { x: FRAME_WIDTH * 0.56, y: FRAME_HEIGHT * 0.18 };
  }
  if (target === "down") {
    return { x: FRAME_WIDTH * 0.54, y: FRAME_HEIGHT * 0.56 };
  }
  return { x: FRAME_WIDTH * 0.55, y: FRAME_HEIGHT * 0.34 };
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

function resolvePrimaryVisualBox(sequence: ShotRenderSequence): ShotLayoutRect {
  return sequence.layoutPlan?.primaryVisualBox ?? CHART_BOX;
}

function resolveNarrationBox(sequence: ShotRenderSequence): ShotLayoutRect {
  return sequence.layoutPlan?.narrationBox ?? NARRATION_BOX;
}

function resolveInsertBox(sequence: ShotRenderSequence): ShotLayoutRect | undefined {
  if (sequence.layoutPlan?.insertBox) {
    return sequence.layoutPlan.insertBox;
  }
  if (!sequence.insertAsset) {
    return undefined;
  }
  return sequence.insertAsset.layout === "sidebar"
    ? {
        x: 1110,
        y: 168,
        width: 640,
        height: 248
      }
    : {
        x: 970,
        y: 720,
        width: 800,
        height: 180
      };
}

function resolveOccluderBox(sequence: ShotRenderSequence): ShotLayoutRect {
  return sequence.layoutPlan?.occluderBox ?? OCCLUDER_BOX;
}

function computeBarGeometry(rows: ShotChartRow[] | undefined, box: ShotLayoutRect): BarGeometry[] {
  const safeRows = rows ?? [];
  const normalizedRows = safeRows.length > 0 ? safeRows : [{ label: "-", value: 1 }];
  const left = box.x + 56;
  const top = box.y + 86;
  const plotWidth = box.width - 112;
  const plotHeight = box.height - 156;
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
  visualObject?: ShotVisualObject;
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
  visualObject,
  pointerIndex,
  highlightIndices,
  localFrame,
  fps,
  emphasisAtFrame
}: ChartViewProps) => {
  const visualBox = resolvePrimaryVisualBox(sequence);
  const motionPreset = resolveVisualMotionPresetLocal(visualObject);
  const motionState = resolveVisualMotionState({
    motionPreset,
    motionProfileId: resolveVisualMotionProfileIdLocal(visualObject),
    animationPolicy: visualObject?.animationPolicy ?? "presenter_guided",
    localFrame,
    fps,
    emphasisAtFrame
  });
  const bars = computeBarGeometry(sequence.chartData ?? [], visualBox);
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
          x: clamp(targetBar.x - visualBox.x - 12, 0, visualBox.width - 8),
          y: clamp(targetAnimated.top - visualBox.y - 12, 0, visualBox.height - 8),
          width: clamp(targetBar.width + 24, 16, visualBox.width),
          height: clamp(targetAnimated.height + 24, 24, visualBox.height)
        }
      : undefined;

  return (
    <div
      style={{
        position: "absolute",
        left: visualBox.x,
        top: visualBox.y,
        width: visualBox.width,
        height: visualBox.height,
        borderRadius: 20,
        border: "2px solid rgba(255, 255, 255, 0.28)",
        background: "linear-gradient(180deg, rgba(12, 19, 34, 0.84) 0%, rgba(6, 10, 20, 0.92) 100%)",
        overflow: "hidden",
        opacity: motionState.panelOpacity,
        clipPath: resolveHorizontalRevealClip(motionState.sweepProgress),
        transform: `translate(${motionState.panelTranslateX.toFixed(1)}px, ${motionState.panelTranslateY.toFixed(1)}px) scale(${motionState.panelScale.toFixed(4)})`,
        transformOrigin: "50% 50%"
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
        const barLeft = bar.x - visualBox.x;
        const barTop = animated.top - visualBox.y;

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
                top: visualBox.height - 52,
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
            width={visualBox.width}
            height={visualBox.height}
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
  visualObject?: ShotVisualObject;
  localFrame: number;
  fps: number;
  emphasisAtFrame: number;
};

const TableView = ({ sequence, visualObject, localFrame, fps, emphasisAtFrame }: TableViewProps) => {
  const sourceRows = sequence.chartData ?? [];
  const rows = sourceRows.length > 0 ? sourceRows : [{ label: "-", value: 0 }];
  const visualBox = resolvePrimaryVisualBox(sequence);
  const motionPreset = resolveVisualMotionPresetLocal(visualObject);
  const motionState = resolveVisualMotionState({
    motionPreset,
    motionProfileId: resolveVisualMotionProfileIdLocal(visualObject),
    animationPolicy: visualObject?.animationPolicy ?? "hold",
    localFrame,
    fps,
    emphasisAtFrame
  });
  return (
    <div
      style={{
        position: "absolute",
        left: visualBox.x,
        top: visualBox.y,
        width: visualBox.width,
        height: visualBox.height,
        borderRadius: 20,
        border: "2px solid rgba(255, 255, 255, 0.28)",
        background: "linear-gradient(180deg, rgba(12, 19, 34, 0.84) 0%, rgba(6, 10, 20, 0.92) 100%)",
        overflow: "hidden",
        opacity: motionState.panelOpacity,
        transform: `translate(${motionState.panelTranslateX.toFixed(1)}px, ${motionState.panelTranslateY.toFixed(1)}px) scale(${motionState.panelScale.toFixed(4)})`,
        transformOrigin: "50% 50%"
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
        {rows.map((row, index) => {
          const rowProgress = resolveVisualMotionItemProgress(motionState, index, 4);
          return (
            <div
              key={`${row.label}:${index}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                padding: "10px 14px",
                borderBottom:
                  index === rows.length - 1 ? "none" : "1px solid rgba(255, 255, 255, 0.12)",
                background: index % 2 === 0 ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.02)",
                ...buildRevealStyle(rowProgress, {
                  opacityFloor: 0.14,
                  scaleFrom: 0.96,
                  translateY: 10
                })
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
          );
        })}
      </div>
    </div>
  );
};

type ShotLayerProps = {
  sequence: ShotRenderSequence;
  freezeCharacterPose: boolean;
  characterPacks?: Record<string, CharacterPack>;
  profiles?: ResolvedProfiles;
  frameOffset?: number;
};

type InsertAssetViewProps = {
  asset: ShotInsertAsset;
  box: ShotLayoutRect;
  emphasisAtFrame: number;
  localFrame: number;
};

type ExplainerObjectViewProps = {
  sequence: ShotRenderSequence;
  visualObject: ShotVisualObject;
  box: ShotLayoutRect;
  localFrame: number;
  fps: number;
  emphasisAtFrame: number;
  variant: "primary" | "secondary";
};

function accentColors(token: ShotInsertAsset["accentToken"] | ShotVisualObject["accentToken"] | undefined) {
  if (token === "medical") {
    return {
      border: "#6dd5c7",
      glow: "rgba(109, 213, 199, 0.35)",
      title: "#f3fffd",
      body: "#d9f6f0",
      chip: "rgba(109, 213, 199, 0.16)"
    };
  }
  if (token === "economy") {
    return {
      border: "#f0c76a",
      glow: "rgba(240, 199, 106, 0.35)",
      title: "#fff9ea",
      body: "#f7efd7",
      chip: "rgba(240, 199, 106, 0.16)"
    };
  }
  return {
    border: "#b7c7e7",
    glow: "rgba(183, 199, 231, 0.35)",
    title: "#f3f7ff",
    body: "#dce6f7",
    chip: "rgba(183, 199, 231, 0.16)"
  };
}

function resolveVisualObjectTitle(sequence: ShotRenderSequence, visualObject: ShotVisualObject): string {
  const raw =
    visualObject.title ??
    (visualObject.kind === "line_chart"
      ? "Trend View"
      : visualObject.kind === "area_chart"
        ? "Area Trend"
        : visualObject.kind === "pie_or_donut"
          ? "Composition View"
          : visualObject.kind === "heatmap"
            ? "Heatmap"
            : visualObject.kind === "scatter"
              ? "Scatter Plot"
              : visualObject.kind === "boxplot"
                ? "Distribution Plot"
                : visualObject.kind === "map"
                  ? "Regional Map"
      : visualObject.kind === "kpi_card"
        ? "Key Numbers"
        : visualObject.kind === "comparison_board"
          ? "Comparison Board"
          : visualObject.kind === "icon_grid"
            ? "Icon Grid"
            : visualObject.kind === "callout_card"
              ? "Callout"
              : visualObject.kind === "process_flow"
                ? "Process Flow"
                : visualObject.kind === "anatomy_diagram"
                  ? "Anatomy Diagram"
                  : visualObject.kind === "risk_meter"
                    ? "Risk Meter"
                    : visualObject.kind === "summary_card"
                      ? "Summary"
                      : visualObject.kind === "timeline"
                        ? "Timeline"
                        : "Explainer Object");
  return cleanMarkers(raw);
}

function resolveVisualObjectBody(sequence: ShotRenderSequence, visualObject: ShotVisualObject): string {
  const raw = visualObject.body ?? sequence.chartCallout ?? sequence.narration;
  return cleanMarkers(raw);
}

function resolveVisualObjectItems(sequence: ShotRenderSequence, visualObject: ShotVisualObject): string[] {
  if (visualObject.items && visualObject.items.length > 0) {
    return visualObject.items.slice(0, 6).map((item) => cleanMarkers(item));
  }

  if (sequence.chartData.length > 0) {
    return sequence.chartData.slice(0, 6).map((row) => cleanMarkers(row.label));
  }

  const body = resolveVisualObjectBody(sequence, visualObject);
  if (body.length === 0) {
    return [];
  }

  return body
    .split(/[,.]/)
    .map((entry) => cleanMarkers(entry))
    .filter((entry) => entry.length > 0)
    .slice(0, 4);
}

function resolvePrimaryVisualObject(sequence: ShotRenderSequence): ShotVisualObject | undefined {
  const objects = sequence.visualObjects ?? [];
  return objects.find((object) => object.semanticRole === "primary_explainer") ?? objects[0];
}

function resolveSecondaryVisualObject(
  sequence: ShotRenderSequence,
  primaryVisualObject: ShotVisualObject | undefined
): ShotVisualObject | undefined {
  const objects = (sequence.visualObjects ?? []).filter((object) => object.objectId !== primaryVisualObject?.objectId);
  if (objects.length === 0) {
    return undefined;
  }

  return [...objects].sort((left, right) => {
    const score = (object: ShotVisualObject) =>
      (object.preferredRegion === "sidebar" || object.preferredRegion === "lower_third" ? 4 : 0) +
      (object.semanticRole === "supporting_explainer" ? 2 : 0) +
      (object.semanticRole === "accent" ? 1 : 0);
    return score(right) - score(left);
  })[0];
}

function supportsRendererAdapterKind(kind: ShotVisualObject["kind"] | undefined): boolean {
  return (
    kind === "line_chart" ||
    kind === "kpi_card" ||
    kind === "summary_card" ||
    kind === "timeline" ||
    kind === "comparison_board" ||
    kind === "icon_grid" ||
    kind === "process_flow" ||
    kind === "anatomy_diagram"
  );
}

function toRendererFinishProfile(finishProfile: ShotFinishProfile | undefined): RendererFinishProfile {
  const profileId = finishProfile?.id?.toLowerCase() ?? "";
  const tone: RendererFinishProfile["tone"] = profileId.includes("medical")
    ? "medical_soft"
    : profileId.includes("economy")
      ? "economy_crisp"
      : "studio_balanced";
  const tintColor =
    finishProfile?.toneOverlayColor ??
    (tone === "medical_soft" ? "rgba(126, 231, 200, 0.42)" : tone === "economy_crisp" ? "rgba(255, 209, 102, 0.4)" : "rgba(138, 214, 255, 0.38)");

  return {
    tone,
    textureMatch:
      finishProfile?.renderPathCompensation === "deterministic"
        ? "deterministic_clean"
        : finishProfile?.renderPathCompensation
          ? "sidecar_matched"
          : "balanced_soft",
    brightness: 1,
    contrast: 1 + (finishProfile?.sharpenOpacity ?? 0) * 0.16,
    saturation: 1 + (finishProfile?.tintOpacity ?? 0) * 0.2,
    lineSharpenStrength: finishProfile?.sharpenOpacity ?? 0,
    bloomOpacity: finishProfile?.bloomOpacity ?? 0,
    grainOpacity: finishProfile?.grainOpacity ?? 0,
    vignetteOpacity: finishProfile?.vignetteOpacity ?? 0,
    tintOpacity: finishProfile?.tintOpacity ?? 0,
    tintGradient: `radial-gradient(circle at 18% 18%, ${tintColor} 0%, rgba(255,255,255,0) 62%)`
  };
}

function toRendererVisualObject(visualObject: ShotVisualObject): RendererVisualObject {
  return {
    objectId: visualObject.objectId,
    kind:
      visualObject.kind === "icon_grid" || visualObject.kind === "anatomy_diagram"
        ? visualObject.kind
        : (visualObject.kind as RendererVisualObject["kind"]),
    semanticRole: visualObject.semanticRole,
    title: visualObject.title,
    body: visualObject.body,
    items: visualObject.items,
    dataRef: visualObject.dataRef
      ? {
          chartId: visualObject.dataRef.chartId,
          datasetId: visualObject.dataRef.datasetId,
          timeRange: visualObject.dataRef.timeRange
        }
      : undefined,
    selectionReason: visualObject.selection?.selection_reason
  };
}

function formatMetricValue(value: number, unit?: string): string {
  return `${Math.round(value)}${unit ? ` ${unit}` : ""}`;
}

function buildLineChartPoints(rows: ShotChartRow[], box: ShotLayoutRect): Array<{ x: number; y: number }> {
  const safeRows = rows.length > 1 ? rows : [{ label: "-", value: 0 }, { label: "+", value: Math.max(1, rows[0]?.value ?? 1) }];
  const left = 58;
  const top = 78;
  const plotWidth = Math.max(120, box.width - 116);
  const plotHeight = Math.max(120, box.height - 174);
  const maxValue = Math.max(1, ...safeRows.map((row) => row.value));

  return safeRows.map((row, index) => ({
    x: left + (plotWidth * index) / Math.max(1, safeRows.length - 1),
    y: top + plotHeight - (plotHeight * clamp(row.value / maxValue, 0, 1))
  }));
}

function resolveDefaultMotionProfileIdLocal(
  visualObject?: Pick<ShotVisualObject, "motionProfileId" | "selection" | "accentToken">
): NonNullable<ShotVisualObject["motionProfileId"]> {
  if (visualObject?.motionProfileId) {
    return visualObject.motionProfileId;
  }
  if (visualObject?.selection?.channel_domain === "medical" || visualObject?.accentToken === "medical") {
    return "medical_guided_v1";
  }
  if (visualObject?.selection?.channel_domain === "economy" || visualObject?.accentToken === "economy") {
    return "economy_analytic_v1";
  }
  return "studio_balanced_v1";
}

function buildRevealStyle(
  progress: number,
  input?: {
    opacityFloor?: number;
    scaleFrom?: number;
    translateX?: number;
    translateY?: number;
    transformOrigin?: string;
  }
): CSSProperties {
  const opacityFloor = input?.opacityFloor ?? 0.22;
  const scaleFrom = input?.scaleFrom ?? 0.92;
  const translateX = (1 - progress) * (input?.translateX ?? 0);
  const translateY = (1 - progress) * (input?.translateY ?? 0);
  const scale = scaleFrom + (1 - scaleFrom) * progress;

  return {
    opacity: clamp(opacityFloor + progress * (1 - opacityFloor), 0, 1),
    transform: `translate(${translateX.toFixed(1)}px, ${translateY.toFixed(1)}px) scale(${scale.toFixed(4)})`,
    transformOrigin: input?.transformOrigin ?? "50% 50%"
  };
}

function resolveHorizontalRevealClip(progress: number): string {
  return `inset(0 ${Math.round((1 - progress) * 100)}% 0 0 round 18px)`;
}

function resolveRadialRevealClip(progress: number): string {
  return `circle(${(18 + progress * 62).toFixed(1)}% at 50% 56%)`;
}

function resolveVisualMotionPresetLocal(
  visualObject?: Pick<ShotVisualObject, "kind" | "motionPreset">
): NonNullable<ShotVisualObject["motionPreset"]> {
  return visualObject?.motionPreset ?? resolveDefaultMotionPreset(visualObject?.kind);
}

function resolveVisualMotionProfileIdLocal(
  visualObject?: Pick<ShotVisualObject, "motionProfileId" | "selection" | "accentToken">
): NonNullable<ShotVisualObject["motionProfileId"]> {
  return resolveDefaultMotionProfileIdLocal(visualObject);
}

function resolveVisualMotionItemProgress(
  motionState: ReturnType<typeof resolveVisualMotionState>,
  index: number,
  extraDelayFrames = 0
): number {
  return resolveVisualMotionProgress(
    motionState.localFrame,
    Math.round(index * motionState.itemStaggerFrames) + extraDelayFrames,
    motionState.itemRevealFrames
  );
}

function resolvePrimaryVisualObjectLocal(sequence: ShotRenderSequence): ShotVisualObject | undefined {
  return sequence.visualObjects?.find((object) => object.semanticRole === "primary_explainer") ?? sequence.visualObjects?.[0];
}

function resolveDefaultPointerTargetCountLocal(kind?: ShotVisualObject["kind"]): number {
  switch (kind) {
    case "pie_or_donut":
      return 5;
    case "heatmap":
      return 6;
    case "scatter":
    case "boxplot":
    case "map":
      return 4;
    case "comparison_board":
      return 2;
    case "anatomy_diagram":
      return 4;
    case "risk_meter":
      return 3;
    case "timeline":
    case "process_flow":
      return 4;
    case "icon_grid":
      return 6;
    case "kpi_card":
      return 4;
    case "summary_card":
    case "callout_card":
      return 2;
    case "table":
      return 4;
    case "area_chart":
    case "line_chart":
    case "bar_chart":
      return 4;
    default:
      return 1;
  }
}

function resolvePrimaryVisualPointerTargetCountLocal(sequence: ShotRenderSequence): number {
  const primaryVisualObject = resolvePrimaryVisualObjectLocal(sequence);
  const pointerAnchorCount =
    primaryVisualObject?.anchors?.filter((anchor) => anchor.type === "pointer_anchor").length ?? 0;
  const pointerTargetIdsCount = primaryVisualObject?.pointerTargetIds?.length ?? 0;
  const chartDataCount = sequence.chartData.length;
  const defaultCount = resolveDefaultPointerTargetCountLocal(primaryVisualObject?.kind ?? sequence.primaryVisualKind);
  return Math.max(pointerAnchorCount, pointerTargetIdsCount, chartDataCount, defaultCount);
}

function computePrimaryVisualPointerAnchor(
  sequence: ShotRenderSequence,
  box: ShotLayoutRect,
  targetIndex: number
): { x: number; y: number } {
  const primaryVisualObject = resolvePrimaryVisualObjectLocal(sequence);
  const kind = primaryVisualObject?.kind ?? sequence.primaryVisualKind;
  const pointerAnchors = primaryVisualObject?.anchors?.filter((anchor) => anchor.type === "pointer_anchor") ?? [];
  if (pointerAnchors.length > 0) {
    const anchor = pointerAnchors[clamp(targetIndex, 0, pointerAnchors.length - 1)];
    return {
      x: box.x + box.width * clamp(anchor.x, 0, 1),
      y: box.y + box.height * clamp(anchor.y, 0, 1)
    };
  }
  const count = Math.max(1, resolvePrimaryVisualPointerTargetCountLocal(sequence));
  const clampedIndex = clamp(targetIndex, 0, Math.max(0, count - 1));

  if (kind === "bar_chart") {
    const bars = computeBarGeometry(sequence.chartData ?? [], box);
    return bars[clampedIndex]?.anchor ?? { x: box.x + box.width * 0.65, y: box.y + box.height * 0.45 };
  }

  if (kind === "line_chart") {
    const points = buildLineChartPoints(sequence.chartData ?? [], box);
    return points[clampedIndex] ?? { x: box.x + box.width * 0.65, y: box.y + box.height * 0.42 };
  }

  if (kind === "area_chart") {
    const points = buildLineChartPoints(sequence.chartData ?? [], box);
    return points[clampedIndex] ?? { x: box.x + box.width * 0.64, y: box.y + box.height * 0.5 };
  }

  if (kind === "pie_or_donut") {
    const angle = -Math.PI / 2 + (Math.PI * 2 * clampedIndex) / Math.max(1, count);
    return {
      x: box.x + box.width * (0.5 + Math.cos(angle) * 0.24),
      y: box.y + box.height * (0.54 + Math.sin(angle) * 0.24)
    };
  }

  if (kind === "heatmap") {
    const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(count))));
    const rows = Math.max(1, Math.ceil(count / columns));
    const cellWidth = (box.width - 88) / columns;
    const cellHeight = (box.height - 132) / rows;
    return {
      x: box.x + 44 + cellWidth * ((clampedIndex % columns) + 0.5),
      y: box.y + 78 + cellHeight * (Math.floor(clampedIndex / columns) + 0.5)
    };
  }

  if (kind === "scatter") {
    return {
      x: box.x + box.width * (0.18 + (clampedIndex / Math.max(1, count - 1)) * 0.64),
      y: box.y + box.height * (0.72 - (((clampedIndex * 37) % 100) / 100) * 0.44)
    };
  }

  if (kind === "boxplot") {
    return {
      x: box.x + box.width * (0.18 + (clampedIndex / Math.max(1, count - 1)) * 0.64),
      y: box.y + box.height * 0.5
    };
  }

  if (kind === "map") {
    const anchors = [
      { x: 0.3, y: 0.28 },
      { x: 0.64, y: 0.34 },
      { x: 0.48, y: 0.48 },
      { x: 0.34, y: 0.64 },
      { x: 0.66, y: 0.62 },
      { x: 0.52, y: 0.76 }
    ];
    const anchor = anchors[clamp(clampedIndex, 0, anchors.length - 1)] ?? { x: 0.5, y: 0.52 };
    return {
      x: box.x + box.width * anchor.x,
      y: box.y + box.height * anchor.y
    };
  }

  if (kind === "table") {
    const rowHeight = Math.max(44, (box.height - 118) / Math.max(1, count));
    return {
      x: box.x + box.width * 0.72,
      y: box.y + 104 + rowHeight * clamp(clampedIndex + 0.5, 0.5, count - 0.5)
    };
  }

  if (kind === "kpi_card") {
    const columns = Math.min(3, Math.max(1, count));
    const rows = Math.ceil(count / columns);
    const cellWidth = (box.width - 88) / columns;
    const cellHeight = (box.height - 132) / rows;
    return {
      x: box.x + 44 + cellWidth * ((clampedIndex % columns) + 0.5),
      y: box.y + 96 + cellHeight * (Math.floor(clampedIndex / columns) + 0.5)
    };
  }

  if (kind === "timeline" || kind === "process_flow") {
    return {
      x: box.x + 72 + ((box.width - 144) * clampedIndex) / Math.max(1, count - 1),
      y: box.y + box.height * 0.52
    };
  }

  if (kind === "comparison_board") {
    const column = clampedIndex % 2;
    const row = Math.floor(clampedIndex / 2);
    const rowCount = Math.max(1, Math.ceil(count / 2));
    return {
      x: box.x + box.width * (column === 0 ? 0.28 : 0.72),
      y: box.y + 132 + ((box.height - 188) * row) / Math.max(1, rowCount - 1)
    };
  }

  if (kind === "icon_grid") {
    const columns = count >= 5 ? 3 : 2;
    const rows = Math.max(1, Math.ceil(count / columns));
    const cellWidth = (box.width - 72) / columns;
    const cellHeight = (box.height - 112) / rows;
    return {
      x: box.x + 36 + cellWidth * ((clampedIndex % columns) + 0.5),
      y: box.y + 86 + cellHeight * (Math.floor(clampedIndex / columns) + 0.5)
    };
  }

  if (kind === "anatomy_diagram") {
    const anchors = [
      { x: box.x + box.width * 0.28, y: box.y + box.height * 0.34 },
      { x: box.x + box.width * 0.72, y: box.y + box.height * 0.29 },
      { x: box.x + box.width * 0.36, y: box.y + box.height * 0.7 },
      { x: box.x + box.width * 0.7, y: box.y + box.height * 0.76 }
    ];
    return anchors[clamp(clampedIndex, 0, anchors.length - 1)];
  }

  if (kind === "risk_meter") {
    const markerPositions = [0.2, 0.5, 0.82];
    return {
      x: box.x + 20 + (box.width - 40) * markerPositions[clamp(clampedIndex, 0, markerPositions.length - 1)],
      y: box.y + box.height * 0.52
    };
  }

  if (kind === "summary_card" || kind === "callout_card") {
    const laneCount = Math.max(1, Math.min(3, count));
    return {
      x: box.x + box.width * 0.5,
      y: box.y + 132 + ((box.height - 184) * clampedIndex) / Math.max(1, laneCount - 1)
    };
  }

  return {
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.5
  };
}

const ExplainerObjectView = ({
  sequence,
  visualObject,
  box,
  localFrame,
  fps,
  emphasisAtFrame,
  variant
}: ExplainerObjectViewProps) => {
  const colors = accentColors(visualObject.accentToken ?? sequence.insertAsset?.accentToken);
  const title = resolveVisualObjectTitle(sequence, visualObject);
  const body = resolveVisualObjectBody(sequence, visualObject);
  const items = resolveVisualObjectItems(sequence, visualObject);
  const metricRows = sequence.chartData.slice(0, variant === "primary" ? 4 : 3);
  const isPrimary = variant === "primary";
  const headlineFontSize = isPrimary ? 30 : 28;
  const bodyFontSize = isPrimary ? 22 : 20;
  const emphasisEnvelope = clamp(1 - Math.abs(localFrame - emphasisAtFrame) / 20, 0, 1);
  const motionPreset = resolveVisualMotionPresetLocal(visualObject);
  const motionState = resolveVisualMotionState({
    motionPreset,
    motionProfileId: resolveVisualMotionProfileIdLocal(visualObject),
    animationPolicy: visualObject.animationPolicy,
    localFrame,
    fps,
    emphasisAtFrame
  });
  const panelInset = isPrimary ? 28 : 20;
  const innerWidth = Math.max(120, box.width - panelInset * 2);
  const innerHeight = Math.max(120, box.height - panelInset * 2);

  const renderSummaryCard = () => (
    <>
      <div
        style={{
          color: colors.title,
          fontSize: headlineFontSize,
          fontWeight: 800,
          marginBottom: 12
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: colors.body,
          fontSize: bodyFontSize,
          lineHeight: 1.35,
          marginBottom: items.length > 0 ? 16 : 0
        }}
      >
        {body}
      </div>
      {items.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10
          }}
        >
          {items.map((item, index) => (
            <div
              key={`${visualObject.objectId}-summary-${index}-${item}`}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                background: colors.chip,
                color: colors.title,
                fontSize: 18,
                fontWeight: 700
              }}
            >
              {item}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );

  const renderLineChart = () => {
    const points = buildLineChartPoints(sequence.chartData, box);
    const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
    const areaString = `${pointString} ${points[points.length - 1]?.x ?? 0},${box.height - 36} ${points[0]?.x ?? 0},${box.height - 36}`;
    const traceClip = resolveHorizontalRevealClip(motionState.sweepProgress);

    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 10
          }}
        >
          {title}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: box.width,
            height: box.height,
            clipPath: traceClip
          }}
        >
          <svg
            width={box.width}
            height={box.height}
            style={{
              position: "absolute",
              left: 0,
              top: 0
            }}
          >
            <defs>
              <linearGradient id={`line-fill-${visualObject.objectId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.border} stopOpacity={visualObject.kind === "area_chart" ? "0.46" : "0.34"} />
                <stop offset="100%" stopColor={colors.border} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <polyline
              fill={`url(#line-fill-${visualObject.objectId})`}
              points={areaString}
              style={{
                opacity: visualObject.kind === "area_chart" ? 0.92 : 0.8
              }}
            />
            <polyline
              fill="none"
              stroke={colors.border}
              strokeWidth={5}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={pointString}
            />
            {points.map((point, index) => {
              const pointProgress = resolveVisualMotionItemProgress(motionState, index, 6);
              return (
                <circle
                  key={`${visualObject.objectId}-point-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={(index === points.length - 1 ? 8 : 6) * (0.72 + pointProgress * 0.28) + (index === points.length - 1 ? emphasisEnvelope * 3 : 0)}
                  fill={index === points.length - 1 ? colors.title : colors.border}
                  opacity={clamp(0.25 + pointProgress * 0.75, 0, 1)}
                />
              );
            })}
          </svg>
        </div>
        <div
          style={{
            position: "absolute",
            left: panelInset,
            right: panelInset,
            bottom: 18,
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, sequence.chartData.length))}, minmax(0, 1fr))`,
            gap: 8,
            clipPath: traceClip
          }}
        >
          {sequence.chartData.slice(0, 4).map((row, index) => (
            <div
              key={`${visualObject.objectId}-label-${index}-${row.label}`}
              style={{
                color: colors.body,
                fontSize: 16,
                textAlign: "center"
              }}
            >
              {row.label}
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderPieOrDonut = () => {
    const segments = (metricRows.length > 0 ? metricRows : [{ label: "Focus", value: 1 }]).slice(0, 5);
    const total = Math.max(1, segments.reduce((sum, row) => sum + Math.max(0, row.value), 0));
    const centerX = box.width * 0.5;
    const centerY = box.height * 0.58;
    const radius = Math.min(innerWidth, innerHeight) * 0.24;
    const innerRadius = radius * 0.58;
    const palette = [
      colors.border,
      "#7fd9ff",
      "#f0c76a",
      "#6dd5c7",
      "#ff8f8f"
    ];
    let startAngle = -Math.PI / 2;

    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 12
          }}
        >
          {title}
        </div>
        <svg
          width={box.width}
          height={box.height}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            clipPath: resolveRadialRevealClip(motionState.sweepProgress)
          }}
        >
          {segments.map((segment, index) => {
            const sliceAngle = ((Math.max(0, segment.value) || 0) / total) * Math.PI * 2;
            const endAngle = startAngle + sliceAngle;
            const largeArcFlag = sliceAngle > Math.PI ? 1 : 0;
            const x1 = centerX + radius * Math.cos(startAngle);
            const y1 = centerY + radius * Math.sin(startAngle);
            const x2 = centerX + radius * Math.cos(endAngle);
            const y2 = centerY + radius * Math.sin(endAngle);
            const path = [
              `M ${centerX + innerRadius * Math.cos(startAngle)} ${centerY + innerRadius * Math.sin(startAngle)}`,
              `L ${x1} ${y1}`,
              `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
              `L ${centerX + innerRadius * Math.cos(endAngle)} ${centerY + innerRadius * Math.sin(endAngle)}`,
              `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${centerX + innerRadius * Math.cos(startAngle)} ${centerY + innerRadius * Math.sin(startAngle)}`
            ].join(" ");
            const midAngle = startAngle + sliceAngle / 2;
            const segmentProgress = resolveVisualMotionItemProgress(motionState, index, 6);
            startAngle = endAngle;
            return (
              <g
                key={`${visualObject.objectId}-donut-${index}-${segment.label}`}
                style={{
                  opacity: clamp(0.18 + segmentProgress * 0.82, 0, 1),
                  transform: `scale(${(0.88 + segmentProgress * 0.12).toFixed(4)})`,
                  transformOrigin: `${centerX}px ${centerY}px`
                }}
              >
                <path d={path} fill={palette[index % palette.length]} opacity={0.9} />
                <text
                  x={centerX + Math.cos(midAngle) * (radius + 28)}
                  y={centerY + Math.sin(midAngle) * (radius + 28)}
                  fill={colors.body}
                  fontSize={16}
                  textAnchor="middle"
                >
                  {segment.label}
                </text>
              </g>
            );
          })}
        </svg>
      </>
    );
  };

  const renderHeatmap = () => {
    const cells = (metricRows.length > 0 ? metricRows : [{ label: "Focus", value: 1 }]).slice(0, isPrimary ? 6 : 4);
    const columns = isPrimary ? 3 : 2;
    const rows = Math.max(1, Math.ceil(cells.length / columns));
    const maxValue = Math.max(1, ...cells.map((cell) => cell.value));
    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 16
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: 12
          }}
        >
          {cells.map((cell, index) => {
            const alpha = clamp(cell.value / maxValue, 0.2, 1);
            const cellProgress = resolveVisualMotionItemProgress(motionState, index, 4);
            return (
              <div
                key={`${visualObject.objectId}-heat-${index}-${cell.label}`}
                style={{
                  padding: "18px 14px",
                  borderRadius: 18,
                  minHeight: Math.max(88, Math.floor(innerHeight / rows) - 10),
                  background: `rgba(109, 213, 199, ${alpha * 0.34})`,
                  border: `1px solid ${colors.border}55`,
                  ...buildRevealStyle(cellProgress, {
                    opacityFloor: 0.12,
                    scaleFrom: 0.94,
                    translateY: 12
                  })
                }}
              >
                <div
                  style={{
                    color: colors.title,
                    fontSize: 18,
                    fontWeight: 700,
                    marginBottom: 8
                  }}
                >
                  {cell.label}
                </div>
                <div
                  style={{
                    color: colors.body,
                    fontSize: 24,
                    fontWeight: 800
                  }}
                >
                  {formatMetricValue(cell.value, sequence.unit)}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const renderScatter = () => {
    const points = (metricRows.length > 0 ? metricRows : [{ label: "Focus", value: 1 }]).slice(0, isPrimary ? 6 : 4);
    const maxValue = Math.max(1, ...points.map((point) => point.value));
    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 10
          }}
        >
          {title}
        </div>
        <svg
          width={box.width}
          height={box.height}
          style={{
            position: "absolute",
            left: 0,
            top: 0
          }}
        >
          <line x1={64} y1={box.height - 64} x2={box.width - 44} y2={box.height - 64} stroke={`${colors.body}88`} />
          <line x1={64} y1={84} x2={64} y2={box.height - 64} stroke={`${colors.body}88`} />
          {points.map((point, index) => {
            const x = 86 + (index / Math.max(1, points.length - 1)) * (box.width - 152);
            const y = box.height - 86 - (point.value / maxValue) * (box.height - 184);
            const pointProgress = resolveVisualMotionItemProgress(motionState, index, 4);
            return (
              <g
                key={`${visualObject.objectId}-scatter-${index}-${point.label}`}
                style={{
                  opacity: clamp(0.18 + pointProgress * 0.82, 0, 1),
                  transform: `translateY(${((1 - pointProgress) * 12).toFixed(1)}px) scale(${(0.8 + pointProgress * 0.2).toFixed(4)})`,
                  transformOrigin: `${x}px ${y}px`
                }}
              >
                <circle cx={x} cy={y} r={7 + (index === points.length - 1 ? emphasisEnvelope * 3 : 0)} fill={colors.border} />
                <text x={x} y={box.height - 38} fill={colors.body} fontSize={15} textAnchor="middle">
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </>
    );
  };

  const renderBoxplot = () => {
    const boxes = (metricRows.length > 0 ? metricRows : [{ label: "Focus", value: 1 }]).slice(0, isPrimary ? 4 : 3);
    const maxValue = Math.max(1, ...boxes.map((point) => point.value));
    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 10
          }}
        >
          {title}
        </div>
        <div
          style={{
            position: "relative",
            height: innerHeight - 30
          }}
        >
          {boxes.map((boxRow, index) => {
            const x = panelInset + 56 + (index / Math.max(1, boxes.length - 1)) * (innerWidth - 112);
            const medianY = panelInset + innerHeight * (0.7 - (boxRow.value / maxValue) * 0.36);
            const boxHeight = 74;
            const boxProgress = resolveVisualMotionItemProgress(motionState, index, 5);
            return (
              <div
                key={`${visualObject.objectId}-boxplot-${index}-${boxRow.label}`}
                style={buildRevealStyle(boxProgress, {
                  opacityFloor: 0.14,
                  scaleFrom: 0.9,
                  translateY: 14
                })}
              >
                <div
                  style={{
                    position: "absolute",
                    left: x - 1,
                    top: medianY - 78,
                    width: 2,
                    height: 156,
                    background: `${colors.body}66`
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: x - 42,
                    top: medianY - boxHeight / 2,
                    width: 84,
                    height: boxHeight,
                    borderRadius: 16,
                    border: `2px solid ${colors.border}`,
                    background: colors.chip
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: x - 42,
                    top: medianY - 1,
                    width: 84,
                    height: 2,
                    background: colors.title
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: x - 42,
                    top: innerHeight - 8,
                    width: 84,
                    color: colors.body,
                    fontSize: 16,
                    textAlign: "center"
                  }}
                >
                  {boxRow.label}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const renderMap = () => {
    const regions = (metricRows.length > 0 ? metricRows : [{ label: "Region", value: 1 }]).slice(0, 6);
    const maxValue = Math.max(1, ...regions.map((region) => region.value));
    const regionBoxes = [
      { left: 64, top: 118, width: 128, height: 82 },
      { left: 224, top: 92, width: 164, height: 96 },
      { left: 180, top: 216, width: 188, height: 104 },
      { left: 92, top: 306, width: 156, height: 92 },
      { left: 290, top: 336, width: 152, height: 88 },
      { left: 212, top: 430, width: 140, height: 76 }
    ];
    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 10
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: colors.body,
            fontSize: bodyFontSize,
            lineHeight: 1.35,
            marginBottom: 12
          }}
        >
          {body}
        </div>
        <div
          style={{
            position: "absolute",
            left: panelInset,
            top: panelInset + 54,
            width: innerWidth,
            height: innerHeight - 56
          }}
        >
          {regions.map((region, index) => {
            const boxPreset = regionBoxes[index % regionBoxes.length];
            const alpha = clamp(region.value / maxValue, 0.2, 1);
            const regionProgress = resolveVisualMotionItemProgress(motionState, index, 6);
            return (
              <div
                key={`${visualObject.objectId}-map-${index}-${region.label}`}
                style={{
                  position: "absolute",
                  left: boxPreset.left,
                  top: boxPreset.top,
                  width: boxPreset.width,
                  height: boxPreset.height,
                  borderRadius: 22,
                  background: `rgba(240, 199, 106, ${alpha * 0.34})`,
                  border: `1px solid ${colors.border}66`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: "12px 14px",
                  ...buildRevealStyle(regionProgress, {
                    opacityFloor: 0.12,
                    scaleFrom: 0.92,
                    translateY: 16
                  })
                }}
              >
                <div
                  style={{
                    color: colors.title,
                    fontSize: 16,
                    fontWeight: 700
                  }}
                >
                  {region.label}
                </div>
                <div
                  style={{
                    color: colors.body,
                    fontSize: 15,
                    marginTop: 4
                  }}
                >
                  {formatMetricValue(region.value, sequence.unit)}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const renderKpiCards = () => {
    const cards = metricRows.length > 0 ? metricRows : [{ label: "Focus", value: items.length || 1 }];
    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 16
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(cards.length, isPrimary ? 3 : 2)}, minmax(0, 1fr))`,
            gap: 14
          }}
        >
          {cards.map((row, index) => (
            <div
              key={`${visualObject.objectId}-kpi-${index}-${row.label}`}
              style={{
                padding: isPrimary ? "18px 16px" : "16px 14px",
                borderRadius: 18,
                background: "rgba(255, 255, 255, 0.05)",
                border: `1px solid ${colors.border}55`,
                ...buildRevealStyle(resolveVisualMotionItemProgress(motionState, index, 4), {
                  opacityFloor: 0.12,
                  scaleFrom: 0.86,
                  translateY: 16
                })
              }}
            >
              <div
                style={{
                  color: colors.body,
                  fontSize: 16,
                  marginBottom: 8
                }}
              >
                {row.label}
              </div>
              <div
                style={{
                  color: colors.title,
                  fontSize: isPrimary ? 34 : 28,
                  fontWeight: 800
                }}
              >
                {formatMetricValue(row.value, sequence.unit)}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderComparisonBoard = () => {
    const entries = items.length > 0 ? items : metricRows.map((row) => `${row.label}: ${formatMetricValue(row.value, sequence.unit)}`);
    const midpoint = Math.ceil(entries.length / 2);
    const leftItems = entries.slice(0, midpoint);
    const rightItems = entries.slice(midpoint);
    const columns = [leftItems, rightItems.length > 0 ? rightItems : ["No second lane"]];

    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 16
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 16
          }}
        >
          {columns.map((column, columnIndex) => (
            <div
              key={`${visualObject.objectId}-comparison-${columnIndex}`}
              style={{
                padding: "16px 16px 18px",
                borderRadius: 18,
                background: columnIndex === 0 ? "rgba(255, 255, 255, 0.05)" : colors.chip,
                border: `1px solid ${colors.border}44`,
                ...buildRevealStyle(resolveVisualMotionItemProgress(motionState, columnIndex, 4), {
                  opacityFloor: 0.12,
                  scaleFrom: 0.92,
                  translateX: columnIndex === 0 ? -28 : 28,
                  translateY: 10,
                  transformOrigin: columnIndex === 0 ? "0% 50%" : "100% 50%"
                })
              }}
            >
              <div
                style={{
                  color: colors.title,
                  fontSize: 18,
                  fontWeight: 700,
                  marginBottom: 10
                }}
              >
                {columnIndex === 0 ? "Track A" : "Track B"}
              </div>
              {column.map((entry, index) => (
                <div
                  key={`${visualObject.objectId}-comparison-item-${columnIndex}-${index}-${entry}`}
                  style={{
                    color: colors.body,
                    fontSize: 18,
                    lineHeight: 1.35,
                    marginBottom: index === column.length - 1 ? 0 : 10
                  }}
                >
                  {entry}
                </div>
              ))}
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderStepFlow = () => {
    const steps = (items.length > 0 ? items : ["Observe", "Explain", "Conclude"]).slice(0, isPrimary ? 4 : 3);
    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 18
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
            gap: 14,
            alignItems: "center"
          }}
        >
          {steps.map((step, index) => (
            <div
              key={`${visualObject.objectId}-step-${index}-${step}`}
              style={{
                position: "relative",
                minHeight: 92,
                ...buildRevealStyle(resolveVisualMotionItemProgress(motionState, index, 4), {
                  opacityFloor: 0.12,
                  scaleFrom: 0.92,
                  translateY: 18
                })
              }}
            >
              {index < steps.length - 1 ? (
                <div
                  style={{
                    position: "absolute",
                    left: "58%",
                    top: 24,
                    width: "84%",
                    height: 2,
                    background: `${colors.border}88`,
                    transform: `scaleX(${resolveVisualMotionItemProgress(motionState, index, 10).toFixed(4)})`,
                    transformOrigin: "0% 50%"
                  }}
                />
              ) : null}
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  background: colors.chip,
                  border: `2px solid ${colors.border}`,
                  color: colors.title,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                  fontWeight: 800,
                  marginBottom: 10
                }}
              >
                {index + 1}
              </div>
              <div
                style={{
                  color: colors.body,
                  fontSize: 18,
                  lineHeight: 1.3,
                  maxWidth: 180
                }}
              >
                {step}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderIconGrid = () => {
    const gridItems = (items.length > 0 ? items : ["Signal", "Input", "Filter", "Output"]).slice(0, isPrimary ? 6 : 4);
    const columns = isPrimary ? 3 : 2;
    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 16
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: 14
          }}
        >
          {gridItems.map((item, index) => (
            <div
              key={`${visualObject.objectId}-icon-${index}-${item}`}
              style={{
                padding: "16px 12px",
                borderRadius: 18,
                background: "rgba(255, 255, 255, 0.04)",
                border: `1px solid ${colors.border}44`,
                textAlign: "center",
                ...buildRevealStyle(resolveVisualMotionItemProgress(motionState, index, 3), {
                  opacityFloor: 0.1,
                  scaleFrom: 0.86,
                  translateY: 14
                })
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  margin: "0 auto 12px",
                  background: colors.chip,
                  border: `1px solid ${colors.border}`
                }}
              />
              <div
                style={{
                  color: colors.body,
                  fontSize: 17,
                  lineHeight: 1.25
                }}
              >
                {item}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderAnatomyDiagram = () => {
    const callouts = (items.length > 0 ? items : ["Core", "Signal", "Boundary"]).slice(0, 4);
    const calloutPositions = [
      { left: 20, top: 120 },
      { left: innerWidth - 220, top: 92 },
      { left: 30, top: innerHeight - 120 },
      { left: innerWidth - 230, top: innerHeight - 140 }
    ];

    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 6
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: colors.body,
            fontSize: bodyFontSize,
            lineHeight: 1.35,
            marginBottom: 10,
            maxWidth: Math.min(520, innerWidth * 0.66)
          }}
        >
          {body}
        </div>
        <div
          style={{
            position: "absolute",
            left: panelInset + innerWidth * 0.36,
            top: panelInset + 78,
            width: innerWidth * 0.24,
            height: innerHeight * 0.58,
            borderRadius: 999,
            background: "linear-gradient(180deg, rgba(109, 213, 199, 0.14) 0%, rgba(109, 213, 199, 0.04) 100%)",
            border: `2px solid ${colors.border}99`,
            opacity: clamp(0.24 + motionState.detailProgress * 0.76, 0, 1),
            transform: `scale(${(0.88 + motionState.detailProgress * 0.12).toFixed(4)})`,
            transformOrigin: "50% 50%"
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "18%",
              width: "34%",
              height: "18%",
              transform: "translateX(-50%)",
              borderRadius: 999,
              background: `${colors.border}55`
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "46%",
              width: 26 + emphasisEnvelope * 10,
              height: 26 + emphasisEnvelope * 10,
              transform: "translate(-50%, -50%)",
              borderRadius: 999,
              background: colors.border,
              boxShadow: `0 0 22px ${colors.glow}`
            }}
          />
        </div>
        {callouts.map((item, index) => {
          const position = calloutPositions[index % calloutPositions.length];
          const calloutProgress = resolveVisualMotionItemProgress(motionState, index, 10);
          return (
            <div
              key={`${visualObject.objectId}-callout-${index}-${item}`}
              style={{
                position: "absolute",
                left: panelInset + position.left,
                top: panelInset + position.top,
                maxWidth: 210,
                padding: "10px 12px",
                borderRadius: 16,
                border: `1px solid ${colors.border}77`,
                background: "rgba(7, 12, 22, 0.82)",
                color: colors.body,
                fontSize: 17,
                lineHeight: 1.25,
                ...buildRevealStyle(calloutProgress, {
                  opacityFloor: 0.08,
                  scaleFrom: 0.92,
                  translateY: 12
                })
              }}
            >
              {item}
            </div>
          );
        })}
      </>
    );
  };

  const renderRiskMeter = () => {
    const values = sequence.chartData.map((row) => row.value);
    const maxValue = Math.max(1, ...values, 1);
    const averageValue =
      values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length) : maxValue * 0.56;
    const normalizedRisk = clamp(averageValue / (maxValue * 1.15), 0.12, 0.92);
    const markerLeft = 20 + normalizedRisk * (innerWidth - 40);
    const animatedMarkerLeft = 20 + (markerLeft - 20) * motionState.sweepProgress;

    return (
      <>
        <div
          style={{
            color: colors.title,
            fontSize: headlineFontSize,
            fontWeight: 800,
            marginBottom: 10
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: colors.body,
            fontSize: bodyFontSize,
            lineHeight: 1.35,
            marginBottom: 18
          }}
        >
          {body}
        </div>
        <div
          style={{
            position: "relative",
            height: isPrimary ? 84 : 72,
            borderRadius: 999,
            background:
              "linear-gradient(90deg, rgba(109, 213, 199, 0.22) 0%, rgba(240, 199, 106, 0.25) 52%, rgba(255, 107, 107, 0.28) 100%)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            marginBottom: 14,
            clipPath: resolveHorizontalRevealClip(motionState.sweepProgress)
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: animatedMarkerLeft,
              borderRadius: 999,
              background: "linear-gradient(90deg, rgba(255, 255, 255, 0.08) 0%, rgba(255,255,255,0) 100%)"
            }}
          />
          <div
            style={{
              position: "absolute",
              left: animatedMarkerLeft - 18,
              top: 12,
              width: 36,
              height: 36,
              borderRadius: 999,
              background: colors.title,
              boxShadow: `0 0 ${Math.round(12 + emphasisEnvelope * 16)}px ${colors.glow}`
            }}
          />
          <div
            style={{
              position: "absolute",
              left: animatedMarkerLeft - 2,
              top: 42,
              width: 4,
              height: isPrimary ? 28 : 20,
              borderRadius: 999,
              background: colors.title
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: colors.body,
            fontSize: 16
          }}
        >
          <span>Low</span>
          <span>Watch</span>
          <span>High</span>
        </div>
      </>
    );
  };

  const renderContent = () => {
    switch (visualObject.kind) {
      case "line_chart":
      case "area_chart":
        return renderLineChart();
      case "pie_or_donut":
        return renderPieOrDonut();
      case "heatmap":
        return renderHeatmap();
      case "scatter":
        return renderScatter();
      case "boxplot":
        return renderBoxplot();
      case "map":
        return renderMap();
      case "kpi_card":
        return renderKpiCards();
      case "comparison_board":
        return renderComparisonBoard();
      case "timeline":
      case "process_flow":
        return renderStepFlow();
      case "icon_grid":
        return renderIconGrid();
      case "anatomy_diagram":
        return renderAnatomyDiagram();
      case "risk_meter":
        return renderRiskMeter();
      case "summary_card":
      case "callout_card":
      default:
        return renderSummaryCard();
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        minHeight: box.height,
        padding: panelInset,
        borderRadius: isPrimary ? 22 : 18,
        border: `2px solid ${colors.border}`,
        background: "linear-gradient(180deg, rgba(12, 19, 34, 0.86) 0%, rgba(6, 10, 20, 0.94) 100%)",
        boxShadow: `0 0 ${Math.round(18 + emphasisEnvelope * 16)}px ${colors.glow}`,
        overflow: "hidden",
        opacity: motionState.panelOpacity,
        transform: `translate(${motionState.panelTranslateX.toFixed(1)}px, ${motionState.panelTranslateY.toFixed(1)}px) scale(${motionState.panelScale.toFixed(4)})`,
        transformOrigin: "50% 50%"
      }}
    >
      {renderContent()}
    </div>
  );
};

const InsertAssetView = ({ asset, box, emphasisAtFrame, localFrame }: InsertAssetViewProps) => {
  const colors = accentColors(asset.accentToken);
  const emphasisEnvelope = clamp(1 - Math.abs(localFrame - emphasisAtFrame) / 18, 0, 1);

  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.width,
        minHeight: box.height,
        padding: "18px 22px",
        borderRadius: 18,
        border: `2px solid ${colors.border}`,
        background: "rgba(10, 16, 28, 0.82)",
        boxShadow: `0 0 ${Math.round(18 + emphasisEnvelope * 16)}px ${colors.glow}`,
        backdropFilter: "blur(2px)"
      }}
    >
      <div
        style={{
          color: colors.title,
          fontSize: asset.layout === "sidebar" ? 30 : 28,
          fontWeight: 800,
          marginBottom: 10
        }}
      >
        {asset.title}
      </div>
      <div
        style={{
          color: colors.body,
          fontSize: asset.layout === "sidebar" ? 24 : 22,
          lineHeight: 1.35,
          marginBottom: asset.items && asset.items.length > 0 ? 14 : 0
        }}
      >
        {asset.body}
      </div>
      {asset.items && asset.items.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap"
          }}
        >
          {asset.items.map((item, index) => (
            <div
              key={`${asset.assetId}-${index}-${item}`}
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                background: colors.chip,
                color: colors.title,
                fontSize: 18,
                fontWeight: 700
              }}
            >
              {item}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const ShotLayer = ({ sequence, freezeCharacterPose, characterPacks, profiles, frameOffset = 0 }: ShotLayerProps) => {
  const localFrame = useCurrentFrame() + frameOffset;
  const { fps } = useVideoConfig();
  const generativeBrollSrc =
    (sequence.renderMode === "generative_broll" ||
      sequence.renderMode === "generative_i2v" ||
      sequence.renderMode === "generative_s2v" ||
      sequence.renderMode === "generative_overlay") &&
    typeof sequence.sidecarVideoSrc === "string"
      ? sequence.sidecarVideoSrc.trim()
      : "";

  if (generativeBrollSrc.length > 0) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          filter: sequence.finishProfile
            ? `contrast(${(1 + sequence.finishProfile.sharpenOpacity * 0.18).toFixed(3)}) saturate(${(
                1 +
                sequence.finishProfile.tintOpacity * 0.2
              ).toFixed(3)})`
            : undefined
        }}
      >
        <OffthreadVideo
          src={staticFile(generativeBrollSrc)}
          muted
          trimBefore={Math.max(0, frameOffset)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover"
          }}
        />
        {sequence.finishProfile ? <ShotFinishPass {...sequence.finishProfile} /> : null}
      </AbsoluteFill>
    );
  }

  const animationFrame = resolveTimeRemappedFrame(sequence, localFrame);
  const emphasisAtFrame = resolveEmphasisAtFrame(sequence);
  const punchlineFrame = resolvePunchlineFrame(sequence);
  const visualBox = resolvePrimaryVisualBox(sequence);
  const narrationBox = resolveNarrationBox(sequence);
  const insertBox = resolveInsertBox(sequence);
  const occluderBox = resolveOccluderBox(sequence);
  const primaryVisualObject = resolvePrimaryVisualObject(sequence);
  const secondaryVisualObject = resolveSecondaryVisualObject(sequence, primaryVisualObject);
  const supportingVisualObjects = (sequence.visualObjects ?? []).filter(
    (object) => object.objectId !== primaryVisualObject?.objectId
  );
  const primaryVisualKind = primaryVisualObject?.kind ?? sequence.primaryVisualKind;
  const renderAdapterPrimaryView = !!primaryVisualObject && supportsRendererAdapterKind(primaryVisualObject.kind);
  const renderChartView = primaryVisualKind
    ? primaryVisualKind === "bar_chart"
    : sequence.hasChart && sequence.visualMode === "chart";
  const renderTableView = primaryVisualKind
    ? primaryVisualKind === "table"
    : sequence.hasChart && sequence.visualMode === "table";
  const renderObjectPrimaryView =
    !!primaryVisualObject &&
    !renderAdapterPrimaryView &&
    primaryVisualObject.kind !== "bar_chart" &&
    primaryVisualObject.kind !== "table";
  const renderSecondaryObjectView = !!secondaryVisualObject && !renderAdapterPrimaryView;
  const renderLegacyInsertAsset = !!sequence.insertAsset && !secondaryVisualObject;
  const rendererFinishProfile = toRendererFinishProfile(sequence.finishProfile);
  const pointerTargetCount = resolvePrimaryVisualPointerTargetCountLocal(sequence);

  const bars = computeBarGeometry(sequence.chartData ?? [], visualBox);
  const rowCount = bars.length;

  const latestPointTrack = findLatestEntry(sequence.characterTracks?.pointTrack, animationFrame);
  const pointTrackIndex = resolveTargetIndex(
    latestPointTrack?.targetId,
    pointerTargetCount,
    sequence.pointerTargetIndex
  );

  const activeHighlightEntries = (sequence.chartHighlights ?? [])
    .filter((highlight) => animationFrame >= highlight.f && animationFrame <= highlight.f + 24)
    .slice(0, 2);

  const highlightIndices = activeHighlightEntries.map((highlight) =>
    resolveTargetIndex(highlight.targetId, rowCount, pointTrackIndex)
  );

  const effectivePointerIndex =
    highlightIndices.length > 0 ? highlightIndices[highlightIndices.length - 1] : pointTrackIndex;

  const targetBar = bars[clamp(effectivePointerIndex, 0, Math.max(0, bars.length - 1))];
  const pointerTarget =
    sequence.layoutPlan?.pointerReachability.targetPoint && effectivePointerIndex === sequence.pointerTargetIndex
      ? sequence.layoutPlan.pointerReachability.targetPoint
      :
    computePrimaryVisualPointerAnchor(sequence, visualBox, effectivePointerIndex);

  const trackedPosition = resolveCharacterPosition(sequence, animationFrame, fps);
  const characterX = trackedPosition.x * FRAME_WIDTH;
  const characterY = trackedPosition.y * FRAME_HEIGHT;

  const shouldFreeze = freezeCharacterPose || sequence.freezePose;
  const usePointer =
    !shouldFreeze &&
    sequence.pointerEnabled &&
    (sequence.layoutPlan?.pointerReachability.reachable ?? true);

  const resolvedPack = resolvePackForSequence(sequence, characterPacks);
  const generatedPack = isGeneratedPack(resolvedPack) ? resolvedPack : null;
  const explicitView = resolveExplicitView(sequence, animationFrame);
  const trackedExpressionState = resolveTrackedExpressionState(sequence, animationFrame);
  const explicitBuiltInViewExpression =
    explicitView === "front"
      ? "view_front"
      : explicitView === "threeQuarter"
        ? "view_right_3q"
        : explicitView === "profile"
          ? "view_right_profile"
          : null;
  const explicitPackExpression =
    explicitBuiltInViewExpression &&
    (resolvedPack ? resolvedPack.expressions[explicitBuiltInViewExpression] : true)
      ? explicitBuiltInViewExpression
      : null;
  const generatedExpression = generatedPack
    ? resolveGeneratedExpressionKey(
        generatedPack,
        explicitView ?? "front",
        trackedExpressionState.normalizedExpression
      )
    : null;
  const useYawBlend = !generatedPack && explicitBuiltInViewExpression == null && hasCharacterYawPlan(sequence);
  const characterYaw = useYawBlend ? resolveCharacterYaw(sequence, animationFrame, fps) : 0;
  const rigTalkText = resolveTalkText(sequence);
  const trackedViseme = resolveTrackedViseme(sequence, animationFrame);
  const lookTarget = resolveTrackedLookTarget(sequence, animationFrame, pointerTarget);
  const rigSeed = `shot-episode:${sequence.shotId}`;
  const mascotProfile = profiles?.mascot;
  const mascotActingProfile = profiles?.mascot_acting ?? mascotProfile?.acting;

  const pose = shouldFreeze
    ? move(characterX, characterY)
    : usePointer
      ? pointAt(pointerTarget, lookAt(pointerTarget, move(characterX, characterY)))
      : lookAt(lookTarget, move(characterX, characterY));

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
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        filter: sequence.finishProfile
          ? `contrast(${(1 + sequence.finishProfile.sharpenOpacity * 0.18).toFixed(3)}) saturate(${(
              1 +
              sequence.finishProfile.tintOpacity * 0.16
            ).toFixed(3)})`
          : undefined
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
            {sequence.shotId} | {sequence.shotType} | {sequence.renderMode} | {sequence.setId} | {sequence.cameraPreset} | {sequence.visualMode}
          </div>

          {renderChartView ? (
            <ChartView
              sequence={sequence}
              visualObject={primaryVisualObject}
              pointerIndex={effectivePointerIndex}
              highlightIndices={highlightIndices}
              localFrame={animationFrame}
              fps={fps}
              emphasisAtFrame={emphasisAtFrame}
            />
          ) : null}

          {!renderChartView && renderTableView ? (
            <TableView
              sequence={sequence}
              visualObject={primaryVisualObject}
              localFrame={animationFrame}
              fps={fps}
              emphasisAtFrame={emphasisAtFrame}
            />
          ) : null}

          {renderAdapterPrimaryView && primaryVisualObject ? (
            <div
              style={{
                position: "absolute",
                left: visualBox.x,
                top: visualBox.y,
                width: visualBox.width,
                height: visualBox.height
              }}
            >
              <VisualObjectRendererAdapter
                width={visualBox.width}
                height={visualBox.height}
                visualMode={sequence.visualMode}
                hasChart={sequence.hasChart || primaryVisualObject.kind === "line_chart"}
                chartData={sequence.chartData}
                primaryKind={
                  primaryVisualKind === "icon_grid"
                    ? "icon_array"
                    : primaryVisualKind === "anatomy_diagram"
                      ? "labeled_diagram"
                      : (primaryVisualKind as never)
                }
                primaryObject={toRendererVisualObject(primaryVisualObject)}
                supportingObjects={supportingVisualObjects.map((object) => toRendererVisualObject(object))}
                visualPlan={
                  sequence.visualPlan
                    ? {
                        channelDomain: sequence.visualPlan.channel_domain,
                        educationalMode:
                          sequence.visualPlan.educational_mode === "data_explainer" ||
                          sequence.visualPlan.educational_mode === "summary_explainer"
                            ? sequence.visualPlan.educational_mode
                            : "generic",
                        selectionReason: sequence.visualPlan.selection_reason
                      }
                    : undefined
                }
                finishProfile={rendererFinishProfile}
                annotationsEnabled={sequence.annotationsEnabled}
                chartCallout={sequence.chartCallout}
                localFrame={animationFrame}
                fps={fps}
                emphasisAtFrame={emphasisAtFrame}
                pointerIndex={effectivePointerIndex}
                highlightIndices={highlightIndices}
              />
            </div>
          ) : null}

          {renderObjectPrimaryView && primaryVisualObject ? (
            <ExplainerObjectView
              sequence={sequence}
              visualObject={primaryVisualObject}
              box={visualBox}
              localFrame={animationFrame}
              fps={fps}
              emphasisAtFrame={emphasisAtFrame}
              variant="primary"
            />
          ) : null}

          {renderSecondaryObjectView && secondaryVisualObject && insertBox ? (
            <ExplainerObjectView
              sequence={sequence}
              visualObject={secondaryVisualObject}
              box={insertBox}
              localFrame={animationFrame}
              fps={fps}
              emphasisAtFrame={emphasisAtFrame}
              variant="secondary"
            />
          ) : null}

          {renderLegacyInsertAsset && sequence.insertAsset ? (
            <InsertAssetView
              asset={sequence.insertAsset}
              box={insertBox ?? resolveInsertBox(sequence) ?? { x: 970, y: 720, width: 800, height: 180 }}
              emphasisAtFrame={emphasisAtFrame}
              localFrame={localFrame}
            />
          ) : null}

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
              left: narrationBox.x,
              top: narrationBox.y,
              width: narrationBox.width,
              minHeight: narrationBox.height,
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

          {generatedPack ? (
            <EraserCatRig
              pose={pose}
              targetPoint={usePointer ? pointerTarget : undefined}
              pack={generatedPack}
              expression={generatedExpression ?? "neutral"}
              animationMode="alive"
              seed={rigSeed}
              talkText={rigTalkText}
              mouthOpen={trackedViseme.mouthOpen}
              viseme={trackedViseme.viseme}
              forceBlink={trackedExpressionState.forceBlink}
              blinkDensity={mascotActingProfile?.blink_density ?? mascotProfile?.blink_density}
              mouthIntensity={mascotActingProfile?.mouth_energy ?? mascotProfile?.mouth_intensity}
              idleMotionAmount={mascotActingProfile?.idle_motion ?? mascotProfile?.idle_motion_amount}
              headBobEnergy={mascotActingProfile?.head_bob_energy ?? mascotProfile?.head_bob_energy}
            />
          ) : explicitPackExpression ? (
            <EraserCatRig
              pose={pose}
              targetPoint={usePointer ? pointerTarget : undefined}
              pack={resolvedPack ?? SHOT_VIEW_BLEND_PACK}
              expression={explicitPackExpression}
              animationMode="alive"
              seed={rigSeed}
              talkText={rigTalkText}
              mouthOpen={trackedViseme.mouthOpen}
              viseme={trackedViseme.viseme}
              forceBlink={trackedExpressionState.forceBlink}
              blinkDensity={mascotActingProfile?.blink_density ?? mascotProfile?.blink_density}
              mouthIntensity={mascotActingProfile?.mouth_energy ?? mascotProfile?.mouth_intensity}
              idleMotionAmount={mascotActingProfile?.idle_motion ?? mascotProfile?.idle_motion_amount}
              headBobEnergy={mascotActingProfile?.head_bob_energy ?? mascotProfile?.head_bob_energy}
            />
          ) : useYawBlend ? (
            <EraserCatViewBlend
              pose={pose}
              yaw={characterYaw}
              targetPoint={usePointer ? pointerTarget : undefined}
              pack={resolvedPack ?? SHOT_VIEW_BLEND_PACK}
              animationMode="alive"
              seed={rigSeed}
              talkText={rigTalkText}
              mouthOpen={trackedViseme.mouthOpen}
              viseme={trackedViseme.viseme}
              forceBlink={trackedExpressionState.forceBlink}
              blinkDensity={mascotActingProfile?.blink_density ?? mascotProfile?.blink_density}
              mouthIntensity={mascotActingProfile?.mouth_energy ?? mascotProfile?.mouth_intensity}
              idleMotionAmount={mascotActingProfile?.idle_motion ?? mascotProfile?.idle_motion_amount}
              headBobEnergy={mascotActingProfile?.head_bob_energy ?? mascotProfile?.head_bob_energy}
            />
          ) : (
            <EraserCatRig
              pose={pose}
              targetPoint={usePointer ? pointerTarget : undefined}
              animationMode="alive"
              seed={rigSeed}
              talkText={rigTalkText}
              mouthOpen={trackedViseme.mouthOpen}
              viseme={trackedViseme.viseme}
              forceBlink={trackedExpressionState.forceBlink}
              blinkDensity={mascotActingProfile?.blink_density ?? mascotProfile?.blink_density}
              mouthIntensity={mascotActingProfile?.mouth_energy ?? mascotProfile?.mouth_intensity}
              idleMotionAmount={mascotActingProfile?.idle_motion ?? mascotProfile?.idle_motion_amount}
              headBobEnergy={mascotActingProfile?.head_bob_energy ?? mascotProfile?.head_bob_energy}
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
                left: occluderBox.x,
                top: occluderBox.y,
                width: occluderBox.width,
                height: occluderBox.height,
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

          {sequence.finishProfile ? <ShotFinishPass {...sequence.finishProfile} /> : null}
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
  subtitles,
  characterPacks,
  profiles
}: ShotEpisodeRenderProps) => {
  const frame = useCurrentFrame();
  const activeSubtitle = subtitles.find((cue) => frame >= cue.startFrame && frame <= cue.endFrame);
  const activeSequence = sequences.find((sequence) => frame >= sequence.from && frame < sequence.from + sequence.duration);
  const subtitleSafeZone = activeSequence?.layoutPlan?.subtitleSafeZone;
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
          <ShotLayer
            sequence={sequence}
            freezeCharacterPose={freezeCharacterPose}
            characterPacks={characterPacks}
            profiles={profiles}
          />
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
                  characterPacks={characterPacks}
                  profiles={profiles}
                  frameOffset={Math.max(0, sequence.duration - transitionFrames)}
                />
              }
              next={
                <ShotLayer
                  sequence={next}
                  freezeCharacterPose={freezeCharacterPose}
                  characterPacks={characterPacks}
                  profiles={profiles}
                  frameOffset={0}
                />
              }
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
          left: subtitleSafeZone?.x ?? safeArea.left,
          top: subtitleSafeZone?.y ?? FRAME_HEIGHT - safeArea.bottom - 84,
          width: subtitleSafeZone?.width ?? FRAME_WIDTH - safeArea.left - safeArea.right,
          height: subtitleSafeZone?.height ?? 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#f9fcff",
          fontSize: 42,
          fontWeight: 700,
          textShadow: "0 4px 12px rgba(0, 0, 0, 0.75)",
          textAlign: "center"
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



