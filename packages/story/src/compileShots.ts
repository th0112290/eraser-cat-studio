import type {
  ChannelVisualMotionPresetId,
  ChannelVisualObjectKind,
  InsertAssetType,
  MascotGestureCue,
  ProfileSelection,
  ResolvedProfiles,
  SidecarControlNetPresetId,
  SidecarImpactPresetId,
  SidecarQcPresetId
} from "@ec/profiles";
import { coerceBenchmarkedMotionPreset } from "@ec/profiles";
import type { Beat, EpisodeDataInput, EpisodeInput } from "./generateBeats";

export type ShotTransition = "cut" | "fade";
export type ShotType = "talk" | "reaction" | "broll" | "transition" | "fx";
export type ShotRenderMode =
  | "deterministic"
  | "generative_broll"
  | "generative_i2v"
  | "generative_s2v"
  | "generative_overlay";
export type ShotView = "front" | "threeQuarter" | "profile";
export type ShotViseme = "mouth_closed" | "mouth_open_small" | "mouth_open_wide" | "mouth_round_o";
export type ShotLookTarget = "viewer" | "chart" | "left" | "right" | "up" | "down";
export type ShotCameraSize = "ecu" | "cu" | "mcu" | "ms" | "ws";
export type ShotCameraMotion = "hold" | "push" | "pan" | "tilt";
export type ShotEmotionCurve = "flat" | "rise" | "fall" | "accent";

type VisualIntent = "intro" | "data" | "bridge" | "close" | "narrative";
type CameraPreset = "static" | "slow_push" | "whip_pan" | "shake_emphasis";

type BeatSegment = {
  intent: VisualIntent;
  beats: Beat[];
};

export type ShotGrammar = {
  camera_size: ShotCameraSize;
  camera_motion: ShotCameraMotion;
  acting_intent: string;
  emotion_curve: ShotEmotionCurve;
  primary_speaking_character: string;
  required_view: ShotView;
  educational_intent: string;
  insert_need: InsertAssetType[];
  route_reason: string;
};

export type ShotActingPlan = {
  blink_cues: Array<{
    f: number;
    duration_frames: number;
    intensity: number;
  }>;
  gesture_cues: Array<{
    f: number;
    cue: string;
    intensity: number;
  }>;
  look_cues: Array<{
    f: number;
    target: ShotLookTarget;
    intensity: number;
  }>;
  expression_cues: Array<{
    f: number;
    expression: string;
    intensity: number;
  }>;
  mouth_cues: Array<{
    f: number;
    viseme: ShotViseme;
    intensity: number;
  }>;
};

export type ShotInsertAsset = {
  asset_id: string;
  type: InsertAssetType;
  layout: "lower_third" | "sidebar";
  title: string;
  body: string;
  accent_token: "economy" | "medical" | "neutral";
  items?: string[];
  selection?: {
    resolver_id: ShotVisualResolverId;
    selected_insert_type: InsertAssetType;
    candidate_insert_types: InsertAssetType[];
    supporting_kind: ShotVisualObjectKind;
    educational_mode: string;
    channel_domain: "economy" | "medical";
    selection_reason: string;
  };
};

export type ShotVisualObjectKind =
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
export type ShotVisualObjectRole = "primary_explainer" | "supporting_explainer" | "accent";
export type ShotVisualObjectRegion = "main_left" | "main_right" | "center_stage" | "sidebar" | "lower_third";
export type ShotVisualSafeZoneTag =
  | "subtitle_safe"
  | "chart_safe"
  | "mascot_blocking"
  | "pointer_reachable"
  | "negative_space_preserve";
export type ShotVisualAnimationPolicy = "hold" | "emphasis_pulse" | "presenter_guided";
export type ShotVisualMotionPreset = ChannelVisualMotionPresetId;
export type ShotVisualMotionProfileId = ResolvedProfiles["channel"]["visual_grammar"]["motion_profile_id"];
export type ShotVisualFallbackPolicy = "fallback_to_table" | "fallback_to_summary_card" | "hide_optional";
export type ShotVisualAnchorType =
  | "pointer_anchor"
  | "look_target"
  | "camera_cutaway_target"
  | "callout_anchor"
  | "safe_area_box";
export type ShotVisualAnchor = {
  anchor_id: string;
  type: ShotVisualAnchorType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  target_id?: string;
  weight?: number;
};
export type ShotVisualSafeArea = {
  x: number;
  y: number;
  width: number;
  height: number;
  subtitle_avoid: boolean;
  mascot_avoid: boolean;
  pointer_reachable: boolean;
};
export type ShotVisualSelectionDataShape =
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
export type ShotVisualResolverId = "visual_object_resolver_v1" | "visual_object_planner_v2";
export type ShotVisualSelection = {
  resolver_id: ShotVisualResolverId;
  data_shape: ShotVisualSelectionDataShape;
  educational_mode: string;
  channel_domain: "economy" | "medical";
  selected_kind: ShotVisualObjectKind;
  candidate_kinds: ShotVisualObjectKind[];
  selection_reason: string;
};
export type ShotVisualIntentFamily =
  | "chart_primary"
  | "timeline_metric"
  | "comparison_focus"
  | "diagram_primary"
  | "risk_focus"
  | "summary_focus";
export type ShotVisualIntentCandidate = {
  intent_id: string;
  intent_family: ShotVisualIntentFamily;
  score: number;
  candidate_insert_types: InsertAssetType[];
  candidate_primary_kinds: ShotVisualObjectKind[];
  candidate_supporting_kinds: ShotVisualObjectKind[];
  selection_reason: string;
};
export type ShotVisualPlan = {
  resolver_id: "visual_pair_planner_v1";
  educational_mode: string;
  channel_domain: "economy" | "medical";
  insert_need_candidates: InsertAssetType[];
  candidate_intents: ShotVisualIntentCandidate[];
  selected_intent_id: string;
  selected_intent_family: ShotVisualIntentFamily;
  selected_primary_kind?: ShotVisualObjectKind;
  selected_supporting_kind?: ShotVisualObjectKind;
  selected_insert_type?: InsertAssetType;
  selection_reason: string;
};
export type ShotVisualObject = {
  object_id: string;
  kind: ShotVisualObjectKind;
  source: "legacy_chart_v1" | "legacy_insert_v1" | "planner_v2";
  semantic_role: ShotVisualObjectRole;
  preferred_region: ShotVisualObjectRegion;
  safe_zone_tags: ShotVisualSafeZoneTag[];
  animation_policy: ShotVisualAnimationPolicy;
  motion_preset?: ShotVisualMotionPreset;
  motion_profile_id?: ShotVisualMotionProfileId;
  fallback_policy: ShotVisualFallbackPolicy;
  title?: string;
  body?: string;
  accent_token?: "economy" | "medical" | "neutral";
  items?: string[];
  pointer_target_ids?: string[];
  anchors?: ShotVisualAnchor[];
  safe_area?: ShotVisualSafeArea;
  selection?: ShotVisualSelection;
  data_ref?: {
    chart_id?: string;
    dataset_id?: string;
    time_range?: string;
    layout_hint?: string;
  };
};

export type ShotSidecarPreset = {
  controlnet_preset: SidecarControlNetPresetId;
  impact_preset: SidecarImpactPresetId;
  qc_preset: SidecarQcPresetId;
  preset_source: "profile_rules_v1";
  policy_tags?: string[];
};

export type Shot = {
  shot_id: string;
  shot_type: ShotType;
  render_mode: ShotRenderMode;
  sidecar_renderer?: string;
  sidecar_backend?: string;
  sidecar_preset?: ShotSidecarPreset;
  emphasis_words?: string[];
  talk_text?: string;
  insert_asset?: ShotInsertAsset;
  visual_plan?: ShotVisualPlan;
  visual_objects?: ShotVisualObject[];
  shot_grammar: ShotGrammar;
  acting: ShotActingPlan;
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
    dataset_id?: string;
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
      view_track?: Array<{
        f: number;
        view: ShotView;
      }>;
      viseme_track?: Array<{
        f: number;
        viseme: ShotViseme;
        intensity: number;
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

const GENERATIVE_BROLL_MAX_FRAMES = 72;
const GENERATIVE_BROLL_INSERT_MIN_SOURCE_FRAMES = 96;
const GENERATIVE_BROLL_INSERT_MIN_CHART_SOURCE_FRAMES = 180;
const GENERATIVE_BROLL_INSERT_MIN_FRAMES = 36;
const GENERATIVE_BROLL_INSERT_PREFERRED_FRAMES = 48;
const GENERATIVE_BROLL_ALLOWED_SOURCE_TYPES = new Set<ShotType>(["talk", "transition"]);
const GENERATIVE_BROLL_MAX_CHART_CUTAWAYS = 2;
const GENERATIVE_BROLL_ALLOWED_CAMERA_PRESETS = new Set<string>(["static", "slow_push"]);

export type ShotsDocument = {
  schema_version: "1.0";
  episode: {
    episode_id: string;
    bible_ref: string;
    profiles?: ProfileSelection;
    data_inputs?: EpisodeDataInput[];
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
  characterPackId?: string;
  profiles?: ResolvedProfiles;
};

type ResolvedCompileShotsOptions = Required<Omit<CompileShotsOptions, "characterPackId" | "profiles">>;

const DEFAULTS: ResolvedCompileShotsOptions = {
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

const EMPHASIS_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "up",
  "with",
  "you",
  "your"
]);

const TALK_TEXT_STOPWORDS = new Set([
  ...EMPHASIS_STOPWORDS,
  "begin",
  "detail",
  "final",
  "keep",
  "main",
  "next",
  "point",
  "sharpens",
  "takeaway",
  "view"
]);

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

function estimateBeatFrames(beat: Beat, options: ResolvedCompileShotsOptions): number {
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

function segmentCueSource(segment: BeatSegment): string {
  return segment.beats
    .map((beat) => `${beat.narration} ${beat.onScreen.join(" ")} ${beat.intent}`)
    .join(" ")
    .toLowerCase();
}

function segmentHasEmphasis(segment: BeatSegment, level: "medium" | "high"): boolean {
  if (level === "high") {
    return segment.beats.some((beat) => beat.emphasis === "high");
  }
  return segment.beats.some((beat) => beat.emphasis === "medium" || beat.emphasis === "high");
}

function segmentHasCue(segment: BeatSegment, patterns: string[]): boolean {
  const source = segmentCueSource(segment);
  return patterns.some((pattern) => source.includes(pattern));
}

function countCueMatches(source: string, patterns: string[]): number {
  let total = 0;
  for (const pattern of patterns) {
    if (source.includes(pattern)) {
      total += 1;
    }
  }
  return total;
}

function shotTypeForSegment(segment: BeatSegment, hasChart: boolean, transition: ShotTransition): ShotType {
  const intent = segment.intent;
  const highEmphasis = segmentHasEmphasis(segment, "high");
  const mediumEmphasis = segmentHasEmphasis(segment, "medium");
  const brollCue = segmentHasCue(segment, [
    "picture this",
    "imagine",
    "scene",
    "meanwhile",
    "outside",
    "background",
    "montage",
    "show"
  ]);
  const reactionCue = segmentHasCue(segment, [
    "however",
    "but",
    "surprise",
    "suddenly",
    "turning point",
    "instead",
    "why"
  ]);

  if (intent === "bridge" && transition === "fade") {
    return "transition";
  }
  if (intent === "data") {
    return "talk";
  }
  if (intent === "intro" || intent === "close") {
    return highEmphasis ? "reaction" : "talk";
  }
  if (intent === "bridge") {
    return hasChart ? "talk" : reactionCue || highEmphasis ? "reaction" : "broll";
  }
  if (hasChart) {
    return "talk";
  }
  if (reactionCue || highEmphasis) {
    return "reaction";
  }
  if (brollCue || segment.beats.length > 1 || !mediumEmphasis) {
    return "broll";
  }
  return "talk";
}

function renderModeForShot(input: {
  shotType: ShotType;
  hasChart: boolean;
  durationFrames: number;
  cameraPreset: string;
}): ShotRenderMode {
  if (
    input.shotType === "broll" &&
    !input.hasChart &&
    input.durationFrames <= GENERATIVE_BROLL_MAX_FRAMES &&
    GENERATIVE_BROLL_ALLOWED_CAMERA_PRESETS.has(input.cameraPreset)
  ) {
    return "generative_broll";
  }
  return "deterministic";
}

function retimeFrame(frame: number, sourceDuration: number, targetDuration: number): number {
  if (targetDuration <= 1 || sourceDuration <= 1) {
    return 0;
  }
  return clamp(Math.round((frame / Math.max(1, sourceDuration - 1)) * Math.max(0, targetDuration - 1)), 0, targetDuration - 1);
}

function retimeKeyframes(
  keyframes: Shot["camera"]["keyframes"],
  sourceDuration: number,
  targetDuration: number
): Shot["camera"]["keyframes"] {
  const mapped = keyframes
    .map((keyframe) => ({
      ...keyframe,
      f: retimeFrame(keyframe.f, sourceDuration, targetDuration)
    }))
    .sort((left, right) => left.f - right.f);

  const deduped: Shot["camera"]["keyframes"] = [];
  for (const keyframe of mapped) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.f === keyframe.f) {
      deduped[deduped.length - 1] = keyframe;
    } else {
      deduped.push(keyframe);
    }
  }

  if (deduped.length === 0) {
    return [
      { f: 0, x: 0.5, y: 0.5, zoom: 1, rotate_deg: 0 },
      { f: Math.max(0, targetDuration - 1), x: 0.5, y: 0.5, zoom: 1, rotate_deg: 0 }
    ];
  }

  if (deduped.length === 1 && targetDuration > 1) {
    deduped.push({
      ...deduped[0],
      f: targetDuration - 1
    });
  }

  return deduped;
}

function retimePosPath(
  entries: Shot["character"]["tracks"]["pos_path"],
  sourceDuration: number,
  targetDuration: number
): Shot["character"]["tracks"]["pos_path"] {
  return entries
    .map((entry) => ({
      ...entry,
      f: retimeFrame(entry.f, sourceDuration, targetDuration)
    }))
    .sort((left, right) => left.f - right.f);
}

function retimeSimpleTrack<T extends { f: number }>(
  entries: T[] | undefined,
  sourceDuration: number,
  targetDuration: number
): T[] | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }
  return entries
    .map((entry) => ({
      ...entry,
      f: retimeFrame(entry.f, sourceDuration, targetDuration)
    }))
    .sort((left, right) => left.f - right.f);
}

function retimeActingPlan(
  acting: ShotActingPlan | undefined,
  sourceDuration: number,
  targetDuration: number
): ShotActingPlan | undefined {
  if (!acting) {
    return undefined;
  }
  return {
    blink_cues:
      retimeSimpleTrack(acting.blink_cues, sourceDuration, targetDuration)?.map((cue) => ({
        ...cue,
        duration_frames: Math.max(1, Math.round((cue.duration_frames / Math.max(1, sourceDuration)) * targetDuration))
      })) ?? [],
    gesture_cues: retimeSimpleTrack(acting.gesture_cues, sourceDuration, targetDuration) ?? [],
    look_cues: retimeSimpleTrack(acting.look_cues, sourceDuration, targetDuration) ?? [],
    expression_cues: retimeSimpleTrack(acting.expression_cues, sourceDuration, targetDuration) ?? [],
    mouth_cues: retimeSimpleTrack(acting.mouth_cues, sourceDuration, targetDuration) ?? []
  };
}

function mapChartTypeToVisualObjectKind(rawType: string | undefined): ShotVisualObjectKind {
  const normalized = rawType?.trim().toLowerCase();
  switch (normalized) {
    case "line":
      return "line_chart";
    case "area":
      return "area_chart";
    case "pie":
    case "donut":
    case "pie_or_donut":
      return "pie_or_donut";
    case "heatmap":
      return "heatmap";
    case "scatter":
      return "scatter";
    case "boxplot":
      return "boxplot";
    case "map":
      return "map";
    case "table":
      return "table";
    default:
      return "bar_chart";
  }
}

function chartVisualObjectKindToLegacyType(kind: ShotVisualObjectKind): string {
  switch (kind) {
    case "line_chart":
      return "line";
    case "area_chart":
      return "area";
    case "pie_or_donut":
      return "pie";
    case "heatmap":
      return "heatmap";
    case "scatter":
      return "scatter";
    case "boxplot":
      return "boxplot";
    case "map":
      return "map";
    case "table":
      return "table";
    case "bar_chart":
    default:
      return "bar";
  }
}

function layoutPresetForChartKind(kind: ShotVisualObjectKind): string {
  switch (kind) {
    case "pie_or_donut":
    case "heatmap":
    case "boxplot":
    case "map":
      return "center_stage";
    case "scatter":
      return "main_right";
    default:
      return "main_left";
  }
}

function buildVisualSelectionCueText(segment: BeatSegment, educationalIntent: string): string {
  return [
    educationalIntent,
    ...segment.beats.flatMap((beat) => [beat.intent, beat.narration, ...(beat.onScreen ?? []), ...(beat.references ?? []).map((ref) => ref.datasetId ?? "")])
  ]
    .join(" ")
    .toLowerCase();
}

type ChartSelectionCandidate = {
  kind: ShotVisualObjectKind;
  score: number;
  reasons: string[];
};

type VisualIntentSelectionCandidate = {
  intent_id: string;
  intent_family: ShotVisualIntentFamily;
  score: number;
  reasons: string[];
  candidate_insert_types: InsertAssetType[];
  candidate_primary_kinds: ShotVisualObjectKind[];
  candidate_supporting_kinds: ShotVisualObjectKind[];
};

const CHART_FAMILY_KINDS: ShotVisualObjectKind[] = [
  "bar_chart",
  "line_chart",
  "area_chart",
  "pie_or_donut",
  "heatmap",
  "scatter",
  "boxplot",
  "map",
  "table"
];

const CHART_FAMILY_KIND_SET = new Set<ShotVisualObjectKind>(CHART_FAMILY_KINDS);
const PRIMARY_PLANNER_KIND_ORDER: ShotVisualObjectKind[] = [
  ...CHART_FAMILY_KINDS,
  "kpi_card",
  "timeline",
  "comparison_board",
  "icon_grid",
  "callout_card",
  "process_flow",
  "anatomy_diagram",
  "risk_meter",
  "summary_card"
];

function inferChartDataShape(input: {
  cueText: string;
  educationalIntent: string;
  referenceCount: number;
}): ShotVisualSelectionDataShape {
  if (
    /(trend|over time|timeline|rise|fall|growth|decline|forecast|history|q1|q2|q3|q4|quarter|month|year|weekly|daily)/.test(
      input.cueText
    ) ||
    input.educationalIntent === "trend_emphasis"
  ) {
    return "time_series";
  }

  if (/(share|mix|portion|composition|percent|ratio|allocation|split)/.test(input.cueText)) {
    return "proportion";
  }

  if (/(region|country|state|city|province|market map|geograph|location|nation)/.test(input.cueText)) {
    return "geo";
  }

  if (/(outlier|distribution|variance|spread|quartile|median|range|dispersion)/.test(input.cueText)) {
    return "distribution";
  }

  if (/(correlation|cluster|relationship|versus|vs\\.|tradeoff|trade-off|scatter)/.test(input.cueText)) {
    return "correlation";
  }

  if (/(heat|intensity|matrix|grid|cross-tab|cross tab)/.test(input.cueText)) {
    return "matrix";
  }

  if (/(table|rank|ranking|breakdown|list|top\\s+\\d+)/.test(input.cueText)) {
    return "tabular";
  }

  if (input.referenceCount >= 5) {
    return "tabular";
  }

  return "categorical_comparison";
}

function inferSupportingVisualDataShape(input: {
  cueText: string;
  educationalIntent: string;
  insertAssetType: InsertAssetType;
  primarySelection?: ShotVisualSelection;
}): ShotVisualSelectionDataShape {
  if (input.insertAssetType === "diagram") {
    if (/(flow|step|sequence|journey|pathway|first|next|then|finally)/.test(input.cueText)) {
      return "process_steps";
    }
    return "structure";
  }

  if (input.insertAssetType === "caution_card") {
    return "risk_signal";
  }

  if (input.insertAssetType === "chart") {
    if (input.primarySelection?.data_shape === "time_series") {
      return "time_series";
    }
    if (/(kpi|metric|key number|snapshot|headline number|topline)/.test(input.cueText)) {
      return "metric_snapshot";
    }
    return input.primarySelection?.data_shape ?? "metric_snapshot";
  }

  if (input.insertAssetType === "board") {
    if (input.primarySelection?.data_shape === "tabular") {
      return "tabular";
    }
    return "categorical_comparison";
  }

  if (input.insertAssetType === "icon_explainer") {
    return /(step|sequence|workflow)/.test(input.cueText) ? "process_steps" : "structure";
  }

  if (input.insertAssetType === "caption_card" || input.insertAssetType === "callout_card") {
    return "summary";
  }

  if (/summary|takeaway|key point|recap|bottom line/.test(input.cueText) || /summary/.test(input.educationalIntent)) {
    return "summary";
  }

  return input.primarySelection?.data_shape ?? "generic";
}

function inferSupportingVisualCandidates(input: {
  insertAssetType: InsertAssetType;
  dataShape: ShotVisualSelectionDataShape;
  channelDomain: "economy" | "medical";
}): ShotVisualObjectKind[] {
  switch (input.insertAssetType) {
    case "chart":
      if (input.dataShape === "time_series") {
        return ["timeline", "kpi_card", "table", "comparison_board", "summary_card"];
      }
      if (input.dataShape === "tabular") {
        return ["table", "kpi_card", "comparison_board", "summary_card"];
      }
      return ["kpi_card", "table", "summary_card", "comparison_board", "timeline"];
    case "board":
      return ["comparison_board", "table", "summary_card", "timeline"];
    case "diagram":
      return input.channelDomain === "medical"
        ? ["anatomy_diagram", "process_flow", "icon_grid", "comparison_board", "summary_card"]
        : ["process_flow", "comparison_board", "timeline", "summary_card"];
    case "icon_explainer":
      return ["icon_grid", "process_flow", "comparison_board", "summary_card"];
    case "caution_card":
      return ["risk_meter", "callout_card", "summary_card", "comparison_board"];
    case "caption_card":
      return ["summary_card", "callout_card", "kpi_card"];
    case "callout_card":
    default:
      return ["callout_card", "summary_card", "kpi_card", "comparison_board"];
  }
}

function dedupeVisualKinds(kinds: ShotVisualObjectKind[]): ShotVisualObjectKind[] {
  const seen = new Set<ShotVisualObjectKind>();
  const ordered: ShotVisualObjectKind[] = [];
  for (const kind of kinds) {
    if (seen.has(kind)) {
      continue;
    }
    seen.add(kind);
    ordered.push(kind);
  }
  return ordered;
}

function prioritizeInsertTypes(
  preferred: InsertAssetType[],
  fallback: InsertAssetType[]
): InsertAssetType[] {
  return dedupeInsertNeeds([...preferred, ...fallback]);
}

function buildVisualIntentCandidate(input: {
  intentId: string;
  family: ShotVisualIntentFamily;
  score: number;
  reasons: string[];
  candidateInsertTypes: InsertAssetType[];
  candidatePrimaryKinds: ShotVisualObjectKind[];
  candidateSupportingKinds: ShotVisualObjectKind[];
}): VisualIntentSelectionCandidate {
  return {
    intent_id: input.intentId,
    intent_family: input.family,
    score: input.score,
    reasons: input.reasons,
    candidate_insert_types: dedupeInsertNeeds(input.candidateInsertTypes),
    candidate_primary_kinds: dedupeVisualKinds(input.candidatePrimaryKinds),
    candidate_supporting_kinds: dedupeVisualKinds(input.candidateSupportingKinds)
  };
}

function educationalIntentBias(
  educationalIntent: string,
  dataShape: ShotVisualSelectionDataShape,
  kind: ShotVisualObjectKind
): number {
  if (educationalIntent === "trend_emphasis") {
    if (kind === "area_chart") {
      return 14;
    }
    if (kind === "line_chart") {
      return 12;
    }
    if (kind === "bar_chart") {
      return 5;
    }
  }

  if (educationalIntent === "number_explainer") {
    if (dataShape === "time_series") {
      if (kind === "area_chart") {
        return 8;
      }
      if (kind === "line_chart") {
        return 7;
      }
      if (kind === "bar_chart") {
        return 3;
      }
    }
    if (dataShape === "proportion") {
      if (kind === "pie_or_donut") {
        return 8;
      }
      if (kind === "bar_chart") {
        return 2;
      }
    }
    if (dataShape === "geo") {
      if (kind === "map") {
        return 8;
      }
      if (kind === "table") {
        return 3;
      }
    }
    if (dataShape === "distribution") {
      if (kind === "boxplot") {
        return 8;
      }
      if (kind === "table") {
        return 2;
      }
    }
    if (dataShape === "correlation") {
      if (kind === "scatter") {
        return 8;
      }
      if (kind === "heatmap") {
        return 4;
      }
    }
    if (dataShape === "matrix") {
      if (kind === "heatmap") {
        return 7;
      }
      if (kind === "table") {
        return 4;
      }
    }
    if (dataShape === "tabular") {
      if (kind === "table") {
        return 8;
      }
      if (kind === "bar_chart") {
        return 3;
      }
    }
    if (dataShape === "categorical_comparison" || dataShape === "generic") {
      if (kind === "bar_chart") {
        return 10;
      }
      if (kind === "table") {
        return 8;
      }
      if (kind === "line_chart" || kind === "area_chart") {
        return 3;
      }
    }
  }

  if (educationalIntent === "diagram_explainer" || educationalIntent === "caution_diagram_explainer") {
    if (kind === "table") {
      return 12;
    }
    if (kind === "heatmap") {
      return 6;
    }
    if (kind === "bar_chart") {
      return -3;
    }
  }

  if (educationalIntent === "takeaway_summary" || educationalIntent === "reassuring_summary") {
    if (kind === "table") {
      return 5;
    }
    if (kind === "pie_or_donut") {
      return 4;
    }
  }

  return 0;
}

function scoreChartCandidate(input: {
  kind: ShotVisualObjectKind;
  dataShape: ShotVisualSelectionDataShape;
  cueText: string;
  educationalIntent: string;
  channelDomain: "economy" | "medical";
  referenceCount: number;
  preferredPrimaryKinds: ChannelVisualObjectKind[] | undefined;
  preferredSupportingKinds: ChannelVisualObjectKind[] | undefined;
  discouragedKinds: ChannelVisualObjectKind[] | undefined;
  layoutMode: ResolvedProfiles["channel"]["visual_grammar"]["default_layout_mode"] | undefined;
  pointerDensity: ResolvedProfiles["channel"]["visual_grammar"]["pointer_density"] | undefined;
}): ChartSelectionCandidate {
  let score = 0;
  const reasons: string[] = [];

  if (input.preferredPrimaryKinds?.includes(input.kind as ChannelVisualObjectKind)) {
    score += 10;
    reasons.push("channel_primary_preference");
  } else if (input.preferredSupportingKinds?.includes(input.kind as ChannelVisualObjectKind)) {
    score += 4;
    reasons.push("channel_support_preference");
  }

  if (input.discouragedKinds?.includes(input.kind as ChannelVisualObjectKind)) {
    score -= 12;
    reasons.push("channel_discouraged_kind");
  }

  switch (input.dataShape) {
    case "time_series":
      if (input.kind === "area_chart") {
        score += 26;
        reasons.push("time_series_best_fit");
      } else if (input.kind === "line_chart") {
        score += 24;
        reasons.push("time_series_fit");
      } else if (input.kind === "bar_chart") {
        score += 8;
      } else if (input.kind === "table") {
        score += 6;
      } else {
        score -= 8;
      }
      break;
    case "proportion":
      if (input.kind === "pie_or_donut") {
        score += 24;
        reasons.push("proportion_best_fit");
      } else if (input.kind === "bar_chart") {
        score += 10;
      } else if (input.kind === "table") {
        score += 8;
      } else {
        score -= 8;
      }
      break;
    case "correlation":
      if (input.kind === "scatter") {
        score += 24;
        reasons.push("correlation_best_fit");
      } else if (input.kind === "heatmap") {
        score += 14;
      } else if (input.kind === "table") {
        score += 8;
      } else if (input.kind === "boxplot") {
        score += 6;
      } else {
        score -= 8;
      }
      break;
    case "distribution":
      if (input.kind === "boxplot") {
        score += 24;
        reasons.push("distribution_best_fit");
      } else if (input.kind === "heatmap") {
        score += 13;
      } else if (input.kind === "table") {
        score += 8;
      } else if (input.kind === "bar_chart") {
        score += 4;
      } else {
        score -= 7;
      }
      break;
    case "geo":
      if (input.kind === "map") {
        score += 26;
        reasons.push("geo_best_fit");
      } else if (input.kind === "bar_chart" || input.kind === "table") {
        score += 8;
      } else {
        score -= 8;
      }
      break;
    case "matrix":
      if (input.kind === "heatmap") {
        score += 24;
        reasons.push("matrix_best_fit");
      } else if (input.kind === "table") {
        score += 10;
      } else {
        score -= 8;
      }
      break;
    case "tabular":
      if (input.kind === "table") {
        score += 22;
        reasons.push("tabular_best_fit");
      } else if (input.kind === "bar_chart") {
        score += 8;
      } else if (input.kind === "heatmap") {
        score += 4;
      } else {
        score -= 6;
      }
      break;
    case "generic":
    case "categorical_comparison":
    default:
      if (input.kind === "bar_chart") {
        score += 20;
        reasons.push("comparison_default_fit");
      } else if (input.kind === "table") {
        score += 10;
      } else if (input.kind === "heatmap") {
        score += 6;
      } else if (input.kind === "line_chart") {
        score += 5;
      }
      break;
  }

  score += educationalIntentBias(input.educationalIntent, input.dataShape, input.kind);

  if (input.channelDomain === "medical") {
    if (input.kind === "table") {
      score += 8;
      reasons.push("medical_readability_bias");
    }
    if (input.kind === "heatmap") {
      score += 4;
    }
    if (input.kind === "pie_or_donut") {
      score -= 4;
    }
  } else {
    if (input.kind === "line_chart" || input.kind === "area_chart" || input.kind === "map") {
      score += 4;
    }
  }

  if (input.layoutMode === "data_focus") {
    if (input.kind === "line_chart" || input.kind === "area_chart" || input.kind === "bar_chart" || input.kind === "table") {
      score += 3;
    }
  } else if (input.layoutMode === "diagram_focus") {
    if (input.kind === "table" || input.kind === "heatmap") {
      score += 3;
    }
    if (input.kind === "pie_or_donut") {
      score -= 3;
    }
  }

  if (input.pointerDensity === "high") {
    if (input.kind === "bar_chart" || input.kind === "line_chart" || input.kind === "area_chart" || input.kind === "table") {
      score += 3;
    }
  }

  if (input.referenceCount >= 5) {
    if (input.kind === "table" || input.kind === "heatmap") {
      score += 5;
      reasons.push("dense_reference_fit");
    }
    if (input.kind === "pie_or_donut") {
      score -= 8;
    }
  } else if (input.referenceCount <= 2) {
    if (input.kind === "pie_or_donut" || input.kind === "map") {
      score += 4;
    }
    if (input.kind === "heatmap") {
      score -= 5;
    }
  }

  if (/(rank|ranking|top\\s+\\d+|leader|laggard)/.test(input.cueText)) {
    if (input.kind === "bar_chart") {
      score += 6;
      reasons.push("ranking_cue");
    }
    if (input.kind === "table") {
      score += 4;
    }
  }

  return { kind: input.kind, score, reasons };
}

function scoreSupportingVisualCandidate(input: {
  kind: ShotVisualObjectKind;
  dataShape: ShotVisualSelectionDataShape;
  cueText: string;
  educationalIntent: string;
  channelDomain: "economy" | "medical";
  referenceCount: number;
  preferredSupportingKinds: ChannelVisualObjectKind[] | undefined;
  preferredPrimaryKinds: ChannelVisualObjectKind[] | undefined;
  discouragedKinds: ChannelVisualObjectKind[] | undefined;
  primarySelection?: ShotVisualSelection;
}): ChartSelectionCandidate {
  let score = 0;
  const reasons: string[] = [];

  if (input.preferredSupportingKinds?.includes(input.kind as ChannelVisualObjectKind)) {
    score += 12;
    reasons.push("channel_support_preference");
  } else if (input.preferredPrimaryKinds?.includes(input.kind as ChannelVisualObjectKind)) {
    score += 4;
  }

  if (input.discouragedKinds?.includes(input.kind as ChannelVisualObjectKind)) {
    score -= 12;
    reasons.push("channel_discouraged_kind");
  }

  switch (input.dataShape) {
    case "time_series":
      if (input.kind === "timeline") {
        score += 24;
        reasons.push("time_series_support_fit");
      } else if (input.kind === "kpi_card") {
        score += 13;
      } else if (input.kind === "table") {
        score += 11;
      } else if (input.kind === "comparison_board") {
        score += 8;
      } else {
        score -= 6;
      }
      break;
    case "metric_snapshot":
      if (input.kind === "kpi_card") {
        score += 24;
        reasons.push("metric_snapshot_best_fit");
      } else if (input.kind === "table") {
        score += 14;
      } else if (input.kind === "summary_card") {
        score += 10;
      } else {
        score -= 6;
      }
      break;
    case "tabular":
      if (input.kind === "table") {
        score += 24;
        reasons.push("tabular_support_fit");
      } else if (input.kind === "comparison_board") {
        score += 15;
      } else if (input.kind === "kpi_card") {
        score += 10;
      } else {
        score -= 6;
      }
      break;
    case "categorical_comparison":
      if (input.kind === "comparison_board") {
        score += 24;
        reasons.push("comparison_support_fit");
      } else if (input.kind === "table") {
        score += 12;
      } else if (input.kind === "summary_card") {
        score += 8;
      } else {
        score -= 5;
      }
      break;
    case "process_steps":
      if (input.kind === "process_flow") {
        score += 24;
        reasons.push("process_steps_best_fit");
      } else if (input.kind === "timeline") {
        score += 14;
      } else if (input.kind === "icon_grid") {
        score += 10;
      } else {
        score -= 5;
      }
      break;
    case "structure":
      if (input.kind === "anatomy_diagram") {
        score += 24;
        reasons.push("structure_best_fit");
      } else if (input.kind === "icon_grid") {
        score += 15;
      } else if (input.kind === "comparison_board") {
        score += 9;
      } else if (input.kind === "summary_card") {
        score += 7;
      } else {
        score -= 5;
      }
      break;
    case "risk_signal":
      if (input.kind === "risk_meter") {
        score += 24;
        reasons.push("risk_signal_best_fit");
      } else if (input.kind === "callout_card") {
        score += 14;
      } else if (input.kind === "summary_card") {
        score += 10;
      } else {
        score -= 6;
      }
      break;
    case "summary":
      if (input.kind === "summary_card") {
        score += 22;
        reasons.push("summary_best_fit");
      } else if (input.kind === "callout_card") {
        score += 16;
      } else if (input.kind === "kpi_card") {
        score += 8;
      } else {
        score -= 5;
      }
      break;
    default:
      if (input.kind === "summary_card") {
        score += 10;
      } else if (input.kind === "callout_card") {
        score += 8;
      }
      break;
  }

  if (input.channelDomain === "economy") {
    if (input.kind === "kpi_card" || input.kind === "timeline" || input.kind === "comparison_board" || input.kind === "table") {
      score += 4;
    }
  } else {
    if (input.kind === "anatomy_diagram" || input.kind === "process_flow" || input.kind === "icon_grid" || input.kind === "risk_meter") {
      score += 5;
      reasons.push("medical_domain_bias");
    }
  }

  if (input.primarySelection?.data_shape === "time_series" && input.kind === "timeline") {
    score += 6;
    reasons.push("primary_time_series_alignment");
  }
  if (input.primarySelection?.data_shape === "distribution" && input.kind === "table") {
    score += 3;
  }
  if (input.referenceCount >= 4 && input.kind === "table") {
    score += 4;
  }
  if (/(step|sequence|workflow|pathway|first|next|then|finally)/.test(input.cueText) && input.kind === "process_flow") {
    score += 6;
    reasons.push("step_cue");
  }
  if (/(organ|body|tissue|symptom|anatom|label|part)/.test(input.cueText) && input.kind === "anatomy_diagram") {
    score += 6;
    reasons.push("structure_cue");
  }
  if (/(warning|risk|caution|urgent|avoid|side effect|danger)/.test(input.cueText) && input.kind === "risk_meter") {
    score += 6;
    reasons.push("risk_cue");
  }

  return { kind: input.kind, score, reasons };
}

function resolveLegacyChartVisualSelection(input: {
  segment: BeatSegment;
  educationalIntent: string;
  profiles?: ResolvedProfiles;
}): ShotVisualSelection {
  const cueText = buildVisualSelectionCueText(input.segment, input.educationalIntent);
  const referenceCount = input.segment.beats.reduce((sum, beat) => sum + (beat.references?.length ?? 0), 0);
  const dataShape = inferChartDataShape({
    cueText,
    educationalIntent: input.educationalIntent,
    referenceCount
  });
  const channelDomain = input.profiles?.channel.domain ?? "economy";
  const visualGrammar = input.profiles?.channel.visual_grammar;
  const candidates = CHART_FAMILY_KINDS.map((kind) =>
    scoreChartCandidate({
      kind,
      dataShape,
      cueText,
      educationalIntent: input.educationalIntent,
      channelDomain,
      referenceCount,
      preferredPrimaryKinds: visualGrammar?.preferred_primary_kinds,
      preferredSupportingKinds: visualGrammar?.preferred_supporting_kinds,
      discouragedKinds: visualGrammar?.discouraged_kinds,
      layoutMode: visualGrammar?.default_layout_mode,
      pointerDensity: visualGrammar?.pointer_density
    })
  ).sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return CHART_FAMILY_KINDS.indexOf(left.kind) - CHART_FAMILY_KINDS.indexOf(right.kind);
  });
  const selected = candidates[0] ?? { kind: "bar_chart", score: 0, reasons: ["default_fallback"] };
  const candidateKinds = candidates.slice(0, 3).map((candidate) => candidate.kind);
  return {
    resolver_id: "visual_object_resolver_v1",
    data_shape: dataShape,
    educational_mode: input.educationalIntent,
    channel_domain: channelDomain,
    selected_kind: selected.kind,
    candidate_kinds: candidateKinds,
    selection_reason: selected.reasons.length > 0 ? selected.reasons.join(",") : `score:${selected.score}`
  };
}

function resolveSupportingVisualSelection(input: {
  segment: BeatSegment;
  educationalIntent: string;
  insertAssetType: InsertAssetType;
  primarySelection?: ShotVisualSelection;
  candidateKinds?: ShotVisualObjectKind[];
  profiles?: ResolvedProfiles;
}): ShotVisualSelection {
  const cueText = buildVisualSelectionCueText(input.segment, input.educationalIntent);
  const referenceCount = input.segment.beats.reduce((sum, beat) => sum + (beat.references?.length ?? 0), 0);
  const channelDomain = input.profiles?.channel.domain ?? "economy";
  const visualGrammar = input.profiles?.channel.visual_grammar;
  const dataShape = inferSupportingVisualDataShape({
    cueText,
    educationalIntent: input.educationalIntent,
    insertAssetType: input.insertAssetType,
    primarySelection: input.primarySelection
  });
  const candidates = (input.candidateKinds ??
    inferSupportingVisualCandidates({
      insertAssetType: input.insertAssetType,
      dataShape,
      channelDomain
    }))
    .map((kind) =>
      scoreSupportingVisualCandidate({
        kind,
        dataShape,
        cueText,
        educationalIntent: input.educationalIntent,
        channelDomain,
        referenceCount,
        preferredSupportingKinds: visualGrammar?.preferred_supporting_kinds,
        preferredPrimaryKinds: visualGrammar?.preferred_primary_kinds,
        discouragedKinds: visualGrammar?.discouraged_kinds,
        primarySelection: input.primarySelection
      })
    )
    .sort((left, right) => right.score - left.score);
  const selected = candidates[0] ?? { kind: "summary_card", score: 0, reasons: ["default_fallback"] };
  return {
    resolver_id: "visual_object_resolver_v1",
    data_shape: dataShape,
    educational_mode: input.educationalIntent,
    channel_domain: channelDomain,
    selected_kind: selected.kind,
    candidate_kinds: candidates.slice(0, 3).map((candidate) => candidate.kind),
    selection_reason: selected.reasons.length > 0 ? selected.reasons.join(",") : `score:${selected.score}`
  };
}

function isChartFamilyKind(kind: ShotVisualObjectKind | undefined): kind is ShotVisualObjectKind {
  return kind !== undefined && CHART_FAMILY_KIND_SET.has(kind);
}

function inferPrimaryPlannerDataShape(input: {
  cueText: string;
  educationalIntent: string;
  insertNeeds: InsertAssetType[];
  hasChart: boolean;
  chartBackboneSelection?: ShotVisualSelection;
}): ShotVisualSelectionDataShape {
  if (input.hasChart && input.chartBackboneSelection) {
    if (
      input.insertNeeds.includes("diagram") &&
      (input.educationalIntent === "diagram_explainer" || input.educationalIntent === "caution_diagram_explainer")
    ) {
      return /(flow|step|sequence|journey|pathway|first|next|then|finally)/.test(input.cueText)
        ? "process_steps"
        : "structure";
    }
    return input.chartBackboneSelection.data_shape;
  }

  if (input.insertNeeds.includes("diagram")) {
    return /(flow|step|sequence|journey|pathway|first|next|then|finally)/.test(input.cueText)
      ? "process_steps"
      : "structure";
  }
  if (input.insertNeeds.includes("caution_card")) {
    return "risk_signal";
  }
  if (input.insertNeeds.includes("chart")) {
    return /(kpi|metric|headline|snapshot|key number|topline)/.test(input.cueText)
      ? "metric_snapshot"
      : "tabular";
  }
  if (input.insertNeeds.includes("board")) {
    return "categorical_comparison";
  }
  if (/(summary|takeaway|recap|bottom line|what matters)/.test(input.cueText) || /summary/.test(input.educationalIntent)) {
    return "summary";
  }
  return "generic";
}

function inferPrimaryPlannerCandidates(input: {
  insertNeeds: InsertAssetType[];
  channelDomain: "economy" | "medical";
  plannerDataShape: ShotVisualSelectionDataShape;
  chartBackboneSelection?: ShotVisualSelection;
  preferredPrimaryKinds: ChannelVisualObjectKind[] | undefined;
}): ShotVisualObjectKind[] {
  const candidates = new Set<ShotVisualObjectKind>();

  for (const kind of input.preferredPrimaryKinds ?? []) {
    candidates.add(kind as ShotVisualObjectKind);
  }

  for (const kind of input.chartBackboneSelection?.candidate_kinds ?? []) {
    candidates.add(kind);
  }
  if (input.chartBackboneSelection?.selected_kind) {
    candidates.add(input.chartBackboneSelection.selected_kind);
  }

  for (const insertNeed of input.insertNeeds) {
    const supportingCandidates = inferSupportingVisualCandidates({
      insertAssetType: insertNeed,
      dataShape: input.plannerDataShape,
      channelDomain: input.channelDomain
    });
    for (const kind of supportingCandidates) {
      candidates.add(kind);
    }
  }

  if (input.channelDomain === "medical") {
    candidates.add("anatomy_diagram");
    candidates.add("process_flow");
    candidates.add("icon_grid");
  } else {
    candidates.add("line_chart");
    candidates.add("bar_chart");
    candidates.add("timeline");
    candidates.add("kpi_card");
  }

  if (input.plannerDataShape === "summary") {
    candidates.add("summary_card");
    candidates.add("callout_card");
  }

  return PRIMARY_PLANNER_KIND_ORDER.filter((kind) => candidates.has(kind));
}

function resolveVisualIntentPlan(input: {
  segment: BeatSegment;
  educationalIntent: string;
  hasChart: boolean;
  insertNeeds: InsertAssetType[];
  chartBackboneSelection?: ShotVisualSelection;
  profiles?: ResolvedProfiles;
}): {
  selectedIntent: ShotVisualIntentCandidate;
  candidateIntents: ShotVisualIntentCandidate[];
} {
  const cueText = buildVisualSelectionCueText(input.segment, input.educationalIntent);
  const referenceCount = input.segment.beats.reduce((sum, beat) => sum + (beat.references?.length ?? 0), 0);
  const channelDomain = input.profiles?.channel.domain ?? "economy";
  const plannerDataShape = inferPrimaryPlannerDataShape({
    cueText,
    educationalIntent: input.educationalIntent,
    insertNeeds: input.insertNeeds,
    hasChart: input.hasChart,
    chartBackboneSelection: input.chartBackboneSelection
  });
  const visualGrammar = input.profiles?.channel.visual_grammar;
  const candidates: VisualIntentSelectionCandidate[] = [];

  if (input.hasChart || input.chartBackboneSelection) {
    let score = 22;
    const reasons = ["chart_backbone_present"];
    if (channelDomain === "economy") {
      score += 18;
      reasons.push("economy_chart_domain");
    }
    if (input.educationalIntent === "number_explainer" || input.educationalIntent === "trend_emphasis") {
      score += 12;
      reasons.push("data_story_fit");
    }
    if (plannerDataShape === "time_series" || plannerDataShape === "geo" || plannerDataShape === "distribution") {
      score += 6;
      reasons.push("structured_data_fit");
    }
    candidates.push(
      buildVisualIntentCandidate({
        intentId: "chart_primary_v1",
        family: "chart_primary",
        score,
        reasons,
        candidateInsertTypes: prioritizeInsertTypes(
          input.insertNeeds.includes("chart") ? ["chart"] : [],
          input.insertNeeds
        ),
        candidatePrimaryKinds:
          input.chartBackboneSelection?.candidate_kinds.length
            ? input.chartBackboneSelection.candidate_kinds
            : inferPrimaryPlannerCandidates({
                insertNeeds: input.insertNeeds,
                channelDomain,
                plannerDataShape,
                chartBackboneSelection: input.chartBackboneSelection,
                preferredPrimaryKinds: visualGrammar?.preferred_primary_kinds
              }).filter((kind) => isChartFamilyKind(kind)),
        candidateSupportingKinds: inferSupportingVisualCandidates({
          insertAssetType: "chart",
          dataShape: input.chartBackboneSelection?.data_shape ?? plannerDataShape,
          channelDomain
        })
      })
    );
  }

  if (plannerDataShape === "time_series" || input.educationalIntent === "trend_emphasis") {
    let score = 14;
    const reasons = ["time_series_support"];
    if (channelDomain === "economy") {
      score += 6;
      reasons.push("economy_timeline_bias");
    }
    candidates.push(
      buildVisualIntentCandidate({
        intentId: "timeline_metric_support_v1",
        family: "timeline_metric",
        score,
        reasons,
        candidateInsertTypes: prioritizeInsertTypes(["chart"], input.insertNeeds),
        candidatePrimaryKinds: ["line_chart", "area_chart", "timeline", "kpi_card"],
        candidateSupportingKinds: ["timeline", "kpi_card", "table", "summary_card"]
      })
    );
  }

  if (input.insertNeeds.includes("board") || plannerDataShape === "categorical_comparison" || plannerDataShape === "tabular") {
    let score = 10;
    const reasons = ["comparison_candidate"];
    if (channelDomain === "economy") {
      score += 7;
      reasons.push("economy_comparison_bias");
    }
    if (referenceCount >= 4) {
      score += 4;
      reasons.push("dense_reference_board_fit");
    }
    candidates.push(
      buildVisualIntentCandidate({
        intentId: "comparison_focus_v1",
        family: "comparison_focus",
        score,
        reasons,
        candidateInsertTypes: prioritizeInsertTypes(["board"], input.insertNeeds),
        candidatePrimaryKinds: ["comparison_board", "table", "bar_chart", "heatmap"],
        candidateSupportingKinds: ["comparison_board", "table", "summary_card", "callout_card"]
      })
    );
  }

  if (input.insertNeeds.includes("diagram")) {
    let score = 16;
    const reasons = ["diagram_candidate"];
    if (channelDomain === "medical") {
      score += 16;
      reasons.push("medical_diagram_bias");
    }
    if (
      input.educationalIntent === "diagram_explainer" ||
      input.educationalIntent === "caution_diagram_explainer"
    ) {
      score += 10;
      reasons.push("diagram_intent_match");
    }
    candidates.push(
      buildVisualIntentCandidate({
        intentId: "diagram_primary_v1",
        family: "diagram_primary",
        score,
        reasons,
        candidateInsertTypes: prioritizeInsertTypes(["diagram"], input.insertNeeds),
        candidatePrimaryKinds:
          channelDomain === "medical"
            ? ["anatomy_diagram", "process_flow", "icon_grid", "summary_card"]
            : ["process_flow", "timeline", "comparison_board", "summary_card"],
        candidateSupportingKinds:
          channelDomain === "medical"
            ? (
                input.insertNeeds.includes("caution_card") ||
                input.educationalIntent === "caution_diagram_explainer"
                  ? ["callout_card", "risk_meter", "summary_card", "comparison_board"]
                  : ["callout_card", "summary_card", "comparison_board"]
              )
            : ["callout_card", "summary_card", "comparison_board"]
      })
    );
  }

  if (input.insertNeeds.includes("caution_card") || /warning|risk|caution|avoid|urgent|side effect/.test(cueText)) {
    let score = 10;
    const reasons = ["risk_candidate"];
    if (channelDomain === "medical") {
      score += 10;
      reasons.push("medical_risk_bias");
    }
    if (input.educationalIntent === "caution_diagram_explainer" || input.educationalIntent === "caution_context") {
      score += 8;
      reasons.push("caution_intent_match");
    }
    candidates.push(
      buildVisualIntentCandidate({
        intentId: "risk_focus_v1",
        family: "risk_focus",
        score,
        reasons,
        candidateInsertTypes: prioritizeInsertTypes(["caution_card", "callout_card"], input.insertNeeds),
        candidatePrimaryKinds: ["risk_meter", "callout_card", "summary_card", "comparison_board"],
        candidateSupportingKinds: ["callout_card", "summary_card", "risk_meter"]
      })
    );
  }

  if (
    input.insertNeeds.includes("caption_card") ||
    input.insertNeeds.includes("callout_card") ||
    input.educationalIntent === "takeaway_summary" ||
    input.educationalIntent === "reassuring_summary" ||
    input.educationalIntent === "key_point_reinforcement"
  ) {
    let score = 8;
    const reasons = ["summary_candidate"];
    if (
      input.educationalIntent === "takeaway_summary" ||
      input.educationalIntent === "reassuring_summary"
    ) {
      score += 12;
      reasons.push("summary_intent_match");
    }
    if (segmentHasEmphasis(input.segment, "high")) {
      score += 5;
      reasons.push("high_emphasis_summary");
    }
    candidates.push(
      buildVisualIntentCandidate({
        intentId: "summary_focus_v1",
        family: "summary_focus",
        score,
        reasons,
        candidateInsertTypes: prioritizeInsertTypes(["caption_card", "callout_card"], input.insertNeeds),
        candidatePrimaryKinds: ["summary_card", "callout_card", "kpi_card"],
        candidateSupportingKinds: ["callout_card", "summary_card", "kpi_card"]
      })
    );
  }

  const ranked = candidates
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.candidate_primary_kinds.length - left.candidate_primary_kinds.length;
    })
    .map((candidate) => ({
      intent_id: candidate.intent_id,
      intent_family: candidate.intent_family,
      score: candidate.score,
      candidate_insert_types: candidate.candidate_insert_types,
      candidate_primary_kinds: candidate.candidate_primary_kinds,
      candidate_supporting_kinds: candidate.candidate_supporting_kinds,
      selection_reason: candidate.reasons.join(",")
    }));

  const selected =
    ranked[0] ??
    {
      intent_id: "summary_focus_fallback_v1",
      intent_family: "summary_focus" as const,
      score: 0,
      candidate_insert_types: input.insertNeeds,
      candidate_primary_kinds: ["summary_card"],
      candidate_supporting_kinds: ["callout_card", "summary_card"],
      selection_reason: "default_fallback"
    };

  return {
    selectedIntent: selected,
    candidateIntents: ranked.slice(0, 5)
  };
}

function scorePrimaryPlannerCandidate(input: {
  kind: ShotVisualObjectKind;
  cueText: string;
  educationalIntent: string;
  channelDomain: "economy" | "medical";
  referenceCount: number;
  hasChart: boolean;
  insertNeeds: InsertAssetType[];
  chartBackboneSelection?: ShotVisualSelection;
  plannerDataShape: ShotVisualSelectionDataShape;
  preferredPrimaryKinds: ChannelVisualObjectKind[] | undefined;
  preferredSupportingKinds: ChannelVisualObjectKind[] | undefined;
  discouragedKinds: ChannelVisualObjectKind[] | undefined;
  layoutMode: ResolvedProfiles["channel"]["visual_grammar"]["default_layout_mode"] | undefined;
  pointerDensity: ResolvedProfiles["channel"]["visual_grammar"]["pointer_density"] | undefined;
}): ChartSelectionCandidate {
  if (isChartFamilyKind(input.kind)) {
    const chartShape = input.chartBackboneSelection?.data_shape ?? input.plannerDataShape;
    const scored = scoreChartCandidate({
      kind: input.kind,
      dataShape: chartShape,
      cueText: input.cueText,
      educationalIntent: input.educationalIntent,
      channelDomain: input.channelDomain,
      referenceCount: input.referenceCount,
      preferredPrimaryKinds: input.preferredPrimaryKinds,
      preferredSupportingKinds: input.preferredSupportingKinds,
      discouragedKinds: input.discouragedKinds,
      layoutMode: input.layoutMode,
      pointerDensity: input.pointerDensity
    });
    if (input.hasChart && input.channelDomain === "economy") {
      scored.score += 10;
      scored.reasons.push("economy_chart_primary_bias");
    }
    if (
      input.insertNeeds.includes("diagram") &&
      (input.educationalIntent === "diagram_explainer" || input.educationalIntent === "caution_diagram_explainer")
    ) {
      scored.score -= 10;
      scored.reasons.push("diagram_primary_penalty");
    }
    return scored;
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestReasons: string[] = ["planner_primary_fallback"];
  for (const insertNeed of input.insertNeeds.length > 0 ? input.insertNeeds : (["callout_card"] as InsertAssetType[])) {
    const dataShape = inferSupportingVisualDataShape({
      cueText: input.cueText,
      educationalIntent: input.educationalIntent,
      insertAssetType: insertNeed,
      primarySelection: input.chartBackboneSelection
    });
    const scored = scoreSupportingVisualCandidate({
      kind: input.kind,
      dataShape,
      cueText: input.cueText,
      educationalIntent: input.educationalIntent,
      channelDomain: input.channelDomain,
      referenceCount: input.referenceCount,
      preferredSupportingKinds: input.preferredSupportingKinds,
      preferredPrimaryKinds: input.preferredPrimaryKinds,
      discouragedKinds: input.discouragedKinds,
      primarySelection: input.chartBackboneSelection
    });
    if (scored.score > bestScore) {
      bestScore = scored.score;
      bestReasons = [`primary_from_${insertNeed}`, ...scored.reasons];
    }
  }

  let score = Number.isFinite(bestScore) ? bestScore : 0;
  const reasons = [...bestReasons];

  if (input.hasChart) {
    if (input.kind === "timeline" || input.kind === "kpi_card" || input.kind === "comparison_board") {
      score += 3;
      reasons.push("data_support_primary_fit");
    } else {
      score -= 6;
      reasons.push("non_chart_primary_penalty");
    }
  }

  if (
    input.channelDomain === "medical" &&
    input.insertNeeds.includes("diagram") &&
    (input.kind === "anatomy_diagram" || input.kind === "process_flow" || input.kind === "icon_grid")
  ) {
    score += 16;
    reasons.push("medical_diagram_primary_bias");
  }

  if (
    input.educationalIntent === "takeaway_summary" ||
    input.educationalIntent === "reassuring_summary"
  ) {
    if (input.kind === "summary_card" || input.kind === "callout_card" || input.kind === "kpi_card") {
      score += 10;
      reasons.push("summary_primary_bias");
    }
  }

  if (
    input.educationalIntent === "diagram_explainer" ||
    input.educationalIntent === "caution_diagram_explainer"
  ) {
    if (input.kind === "anatomy_diagram" || input.kind === "process_flow" || input.kind === "icon_grid") {
      score += 12;
      reasons.push("diagram_intent_primary_fit");
    }
  }

  if (input.educationalIntent === "trend_emphasis" && input.kind === "timeline") {
    score += 8;
    reasons.push("timeline_trend_bridge");
  }

  if (input.insertNeeds.includes("caution_card") && input.kind === "risk_meter") {
    score += 10;
    reasons.push("risk_primary_fit");
  }

  if (input.chartBackboneSelection?.selected_kind === input.kind) {
    score += 4;
    reasons.push("chart_backbone_alignment");
  }

  return {
    kind: input.kind,
    score,
    reasons
  };
}

function resolvePrimaryVisualSelection(input: {
  segment: BeatSegment;
  educationalIntent: string;
  hasChart: boolean;
  insertNeeds: InsertAssetType[];
  chartBackboneSelection?: ShotVisualSelection;
  plannerCandidateKinds?: ShotVisualObjectKind[];
  profiles?: ResolvedProfiles;
}): ShotVisualSelection | undefined {
  if (!input.hasChart && input.insertNeeds.length === 0) {
    return undefined;
  }

  const cueText = buildVisualSelectionCueText(input.segment, input.educationalIntent);
  const referenceCount = input.segment.beats.reduce((sum, beat) => sum + (beat.references?.length ?? 0), 0);
  const channelDomain = input.profiles?.channel.domain ?? "economy";
  const visualGrammar = input.profiles?.channel.visual_grammar;
  const plannerDataShape = inferPrimaryPlannerDataShape({
    cueText,
    educationalIntent: input.educationalIntent,
    insertNeeds: input.insertNeeds,
    hasChart: input.hasChart,
    chartBackboneSelection: input.chartBackboneSelection
  });
  if (input.hasChart && channelDomain === "economy" && input.chartBackboneSelection) {
    return {
      ...input.chartBackboneSelection,
      resolver_id: "visual_object_planner_v2",
      selection_reason: `${input.chartBackboneSelection.selection_reason},economy_chart_primary_lock`
    };
  }
  const candidates = inferPrimaryPlannerCandidates({
    insertNeeds: input.insertNeeds,
    channelDomain,
    plannerDataShape,
    chartBackboneSelection: input.chartBackboneSelection,
    preferredPrimaryKinds: visualGrammar?.preferred_primary_kinds
  })
    .filter((kind) => !input.plannerCandidateKinds || input.plannerCandidateKinds.includes(kind))
    .map((kind) =>
      scorePrimaryPlannerCandidate({
        kind,
        cueText,
        educationalIntent: input.educationalIntent,
        channelDomain,
        referenceCount,
        hasChart: input.hasChart,
        insertNeeds: input.insertNeeds,
        chartBackboneSelection: input.chartBackboneSelection,
        plannerDataShape,
        preferredPrimaryKinds: visualGrammar?.preferred_primary_kinds,
        preferredSupportingKinds: visualGrammar?.preferred_supporting_kinds,
        discouragedKinds: visualGrammar?.discouraged_kinds,
        layoutMode: visualGrammar?.default_layout_mode,
        pointerDensity: visualGrammar?.pointer_density
      })
    )
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return PRIMARY_PLANNER_KIND_ORDER.indexOf(left.kind) - PRIMARY_PLANNER_KIND_ORDER.indexOf(right.kind);
    });

  const selected =
    candidates[0] ??
    (input.chartBackboneSelection
      ? {
          kind: input.chartBackboneSelection.selected_kind,
          score: 0,
          reasons: ["fallback_chart_backbone"]
        }
      : {
          kind: "summary_card" as const,
          score: 0,
          reasons: ["default_fallback"]
        });

  return {
    resolver_id: "visual_object_planner_v2",
    data_shape: isChartFamilyKind(selected.kind)
      ? (input.chartBackboneSelection?.data_shape ?? plannerDataShape)
      : plannerDataShape,
    educational_mode: input.educationalIntent,
    channel_domain: channelDomain,
    selected_kind: selected.kind,
    candidate_kinds: candidates.slice(0, 4).map((candidate) => candidate.kind),
    selection_reason: selected.reasons.length > 0 ? selected.reasons.join(",") : `score:${selected.score}`
  };
}

function regionFromChartLayoutPreset(layoutPreset: string | undefined): ShotVisualObjectRegion {
  const normalized = layoutPreset?.trim().toLowerCase() ?? "";
  if (normalized.includes("right")) {
    return "main_right";
  }
  if (normalized.includes("center")) {
    return "center_stage";
  }
  return "main_left";
}

function regionFromInsertLayout(layout: ShotInsertAsset["layout"]): ShotVisualObjectRegion {
  return layout === "lower_third" ? "lower_third" : "sidebar";
}

function collectPointerTargetIds(chart: NonNullable<Shot["chart"]>): string[] {
  const values = [
    ...(chart.highlights?.map((entry) => entry.target_id) ?? []),
    ...(chart.callouts?.map((entry) => entry.attach_to_target_id).filter((entry): entry is string => Boolean(entry)) ?? [])
  ];
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function normalizeLocalAnchor(value: number): number {
  return clamp(Number.isFinite(value) ? value : 0.5, 0, 1);
}

function resolveSafeAreaForRegion(region: ShotVisualObjectRegion): ShotVisualSafeArea {
  switch (region) {
    case "main_right":
      return {
        x: 0.08,
        y: 0.12,
        width: 0.4,
        height: 0.54,
        subtitle_avoid: true,
        mascot_avoid: true,
        pointer_reachable: true
      };
    case "center_stage":
      return {
        x: 0.22,
        y: 0.12,
        width: 0.56,
        height: 0.58,
        subtitle_avoid: true,
        mascot_avoid: true,
        pointer_reachable: true
      };
    case "sidebar":
      return {
        x: 0.68,
        y: 0.16,
        width: 0.24,
        height: 0.52,
        subtitle_avoid: true,
        mascot_avoid: true,
        pointer_reachable: false
      };
    case "lower_third":
      return {
        x: 0.14,
        y: 0.7,
        width: 0.72,
        height: 0.2,
        subtitle_avoid: true,
        mascot_avoid: true,
        pointer_reachable: false
      };
    case "main_left":
    default:
      return {
        x: 0.54,
        y: 0.12,
        width: 0.38,
        height: 0.56,
        subtitle_avoid: true,
        mascot_avoid: true,
        pointer_reachable: true
      };
  }
}

function buildLocalPointerAnchor(kind: ShotVisualObjectKind, index: number, count: number): { x: number; y: number } {
  const clampedCount = Math.max(1, count);
  const t = clampedCount === 1 ? 0.5 : index / Math.max(1, clampedCount - 1);
  switch (kind) {
    case "line_chart":
    case "area_chart":
      return { x: 0.14 + t * 0.72, y: 0.68 - Math.sin(t * Math.PI) * 0.22 - (index % 2 === 0 ? 0.04 : 0) };
    case "pie_or_donut": {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / clampedCount;
      return {
        x: 0.5 + Math.cos(angle) * 0.24,
        y: 0.54 + Math.sin(angle) * 0.24
      };
    }
    case "heatmap": {
      const columns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(clampedCount))));
      const rows = Math.max(1, Math.ceil(clampedCount / columns));
      return {
        x: 0.18 + ((index % columns) + 0.5) * (0.64 / columns),
        y: 0.22 + (Math.floor(index / columns) + 0.5) * (0.54 / rows)
      };
    }
    case "scatter":
      return {
        x: 0.18 + t * 0.64,
        y: 0.72 - ((index * 37) % 100) / 100 * 0.44
      };
    case "boxplot":
      return {
        x: 0.18 + t * 0.64,
        y: 0.5
      };
    case "map": {
      const presets = [
        { x: 0.3, y: 0.28 },
        { x: 0.64, y: 0.34 },
        { x: 0.48, y: 0.48 },
        { x: 0.34, y: 0.64 },
        { x: 0.66, y: 0.62 },
        { x: 0.52, y: 0.76 }
      ];
      return presets[index % presets.length] ?? { x: 0.5, y: 0.52 };
    }
    case "table":
      return { x: 0.72, y: 0.24 + t * 0.52 };
    case "kpi_card": {
      const columns = Math.min(3, clampedCount);
      const rows = Math.max(1, Math.ceil(clampedCount / Math.max(1, columns)));
      return {
        x: 0.18 + ((index % columns) + 0.5) * (0.64 / Math.max(1, columns)),
        y: 0.28 + (Math.floor(index / Math.max(1, columns)) + 0.5) * (0.42 / rows)
      };
    }
    case "timeline":
    case "process_flow":
      return { x: 0.14 + t * 0.72, y: 0.56 };
    case "comparison_board":
      return { x: index % 2 === 0 ? 0.3 : 0.7, y: 0.28 + Math.floor(index / 2) * 0.24 };
    case "icon_grid":
      return {
        x: 0.2 + ((index % 3) + 0.5) * 0.2,
        y: 0.26 + Math.floor(index / 3) * 0.24
      };
    case "anatomy_diagram": {
      const anchors = [
        { x: 0.28, y: 0.34 },
        { x: 0.72, y: 0.29 },
        { x: 0.36, y: 0.7 },
        { x: 0.7, y: 0.76 }
      ];
      return anchors[index % anchors.length] ?? { x: 0.5, y: 0.52 };
    }
    case "risk_meter": {
      const markerPositions = [0.2, 0.5, 0.82];
      return { x: markerPositions[index % markerPositions.length] ?? 0.5, y: 0.52 };
    }
    case "summary_card":
    case "callout_card":
      return { x: 0.5, y: 0.32 + t * 0.3 };
    case "bar_chart":
    default:
      return { x: 0.18 + ((index + 0.5) * 0.64) / clampedCount, y: 0.48 - (index % 3) * 0.06 };
  }
}

function buildChartVisualAnchors(input: {
  objectId: string;
  kind: ShotVisualObjectKind;
  pointerTargetIds: string[];
  callouts?: Array<{
    text: string;
    attach_to_target_id?: string;
  }>;
}): ShotVisualAnchor[] {
  const pointerAnchors = input.pointerTargetIds.map((targetId, index, values) => {
    const point = buildLocalPointerAnchor(input.kind, index, values.length);
    return {
      anchor_id: `${input.objectId}_pointer_${index + 1}`,
      type: "pointer_anchor" as const,
      x: normalizeLocalAnchor(point.x),
      y: normalizeLocalAnchor(point.y),
      target_id: targetId,
      weight: 1
    };
  });
  const primaryPointer = pointerAnchors[0];
  const calloutAnchors =
    input.callouts?.slice(0, 3).map((callout, index) => {
      const attachedPointer = pointerAnchors.find((anchor) => anchor.target_id === callout.attach_to_target_id);
      return {
        anchor_id: `${input.objectId}_callout_${index + 1}`,
        type: "callout_anchor" as const,
        x: normalizeLocalAnchor(attachedPointer?.x ?? 0.2 + index * 0.24),
        y: normalizeLocalAnchor(attachedPointer ? attachedPointer.y - 0.12 : 0.18 + index * 0.08),
        target_id: callout.attach_to_target_id,
        weight: 0.7
      };
    }) ?? [];
  return [
    ...pointerAnchors,
    {
      anchor_id: `${input.objectId}_look`,
      type: "look_target",
      x: normalizeLocalAnchor(primaryPointer?.x ?? 0.5),
      y: normalizeLocalAnchor(primaryPointer?.y ?? 0.42),
      target_id: primaryPointer?.target_id,
      weight: 0.8
    },
    {
      anchor_id: `${input.objectId}_cutaway`,
      type: "camera_cutaway_target",
      x: 0.5,
      y: 0.48,
      weight: 0.65
    },
    ...calloutAnchors,
    {
      anchor_id: `${input.objectId}_safe`,
      type: "safe_area_box",
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      weight: 1
    }
  ];
}

function buildInsertVisualAnchors(input: { objectId: string; kind: ShotVisualObjectKind }): ShotVisualAnchor[] {
  const pointerCapable = input.kind === "comparison_board" || input.kind === "timeline" || input.kind === "process_flow";
  return [
    ...(pointerCapable
      ? [
          {
            anchor_id: `${input.objectId}_pointer_1`,
            type: "pointer_anchor" as const,
            x: 0.5,
            y: input.kind === "comparison_board" ? 0.38 : 0.56,
            weight: 0.7
          }
        ]
      : []),
    {
      anchor_id: `${input.objectId}_look`,
      type: "look_target",
      x: 0.5,
      y: 0.42,
      weight: 0.7
    },
    {
      anchor_id: `${input.objectId}_cutaway`,
      type: "camera_cutaway_target",
      x: 0.5,
      y: 0.5,
      weight: 0.55
    },
    {
      anchor_id: `${input.objectId}_callout`,
      type: "callout_anchor",
      x: 0.5,
      y: 0.26,
      weight: 0.65
    },
    {
      anchor_id: `${input.objectId}_safe`,
      type: "safe_area_box",
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      weight: 1
    }
  ];
}

function resolvePrimaryRegionForVisualKind(
  kind: ShotVisualObjectKind,
  profiles?: ResolvedProfiles
): ShotVisualObjectRegion {
  switch (kind) {
    case "anatomy_diagram":
    case "process_flow":
    case "icon_grid":
    case "risk_meter":
    case "comparison_board":
    case "pie_or_donut":
    case "heatmap":
    case "map":
      return "center_stage";
    case "timeline":
    case "kpi_card":
    case "summary_card":
    case "callout_card":
      return profiles?.channel.domain === "medical" ? "center_stage" : "main_left";
    default:
      return regionFromChartLayoutPreset(layoutPresetForChartKind(kind));
  }
}

function resolvePrimaryVisualFallbackPolicy(kind: ShotVisualObjectKind): ShotVisualFallbackPolicy {
  if (isChartFamilyKind(kind)) {
    return "fallback_to_table";
  }
  if (kind === "anatomy_diagram" || kind === "process_flow" || kind === "comparison_board" || kind === "risk_meter") {
    return "fallback_to_summary_card";
  }
  return "hide_optional";
}

function resolvePrimaryVisualAnimationPolicy(kind: ShotVisualObjectKind): ShotVisualAnimationPolicy {
  if (kind === "summary_card" || kind === "callout_card" || kind === "risk_meter") {
    return "emphasis_pulse";
  }
  return "presenter_guided";
}

function resolveVisualMotionProfileId(profiles?: ResolvedProfiles): ShotVisualMotionProfileId {
  return profiles?.channel.visual_grammar.motion_profile_id ?? "studio_balanced_v1";
}

function resolveVisualMotionPreset(input: {
  kind: ShotVisualObjectKind;
  semanticRole: ShotVisualObjectRole;
  animationPolicy: ShotVisualAnimationPolicy;
  profiles?: ResolvedProfiles;
}): ShotVisualMotionPreset {
  const channelDomain = input.profiles?.channel.domain;
  let candidatePreset: ShotVisualMotionPreset;

  if (channelDomain === "economy") {
    if (input.kind === "timeline") {
      candidatePreset = "trace_reveal";
      return coerceBenchmarkedVisualMotionPreset(input, candidatePreset);
    }
    if (input.kind === "table") {
      candidatePreset = "data_sweep";
      return coerceBenchmarkedVisualMotionPreset(input, candidatePreset);
    }
  }

  if (channelDomain === "medical") {
    if (input.kind === "callout_card") {
      candidatePreset = "diagram_callout";
      return coerceBenchmarkedVisualMotionPreset(input, candidatePreset);
    }
    if (input.kind === "summary_card" && input.semanticRole !== "primary_explainer") {
      candidatePreset = "diagram_callout";
      return coerceBenchmarkedVisualMotionPreset(input, candidatePreset);
    }
  }

  switch (input.kind) {
    case "bar_chart":
    case "heatmap":
    case "scatter":
    case "boxplot":
    case "map":
      candidatePreset = "data_sweep";
      break;
    case "line_chart":
    case "area_chart":
      candidatePreset = "trace_reveal";
      break;
    case "pie_or_donut":
      candidatePreset = "radial_reveal";
      break;
    case "kpi_card":
      candidatePreset = "metric_pop";
      break;
    case "timeline":
    case "process_flow":
      candidatePreset = "step_stagger";
      break;
    case "comparison_board":
      candidatePreset = "comparison_split";
      break;
    case "icon_grid":
      candidatePreset = "grid_stagger";
      break;
    case "anatomy_diagram":
      candidatePreset = "diagram_callout";
      break;
    case "risk_meter":
      candidatePreset = "risk_sweep";
      break;
    case "table":
    case "summary_card":
    case "callout_card":
    default:
      candidatePreset =
        input.semanticRole === "accent" && input.animationPolicy === "emphasis_pulse"
        ? "metric_pop"
        : "panel_hold";
      break;
  }

  return coerceBenchmarkedVisualMotionPreset(input, candidatePreset);
}

function benchmarkFallbackCandidatesForMotionPreset(
  kind: ShotVisualObjectKind,
  semanticRole: ShotVisualObjectRole,
  animationPolicy: ShotVisualAnimationPolicy
): ShotVisualMotionPreset[] {
  switch (kind) {
    case "line_chart":
    case "area_chart":
      return ["data_sweep", "panel_hold"];
    case "pie_or_donut":
      return ["metric_pop", "panel_hold"];
    case "comparison_board":
      return ["step_stagger", "panel_hold"];
    case "icon_grid":
      return ["step_stagger", "panel_hold"];
    case "anatomy_diagram":
      return ["step_stagger", "panel_hold"];
    case "risk_meter":
      return ["diagram_callout", "panel_hold"];
    case "callout_card":
    case "summary_card":
      return semanticRole === "accent" && animationPolicy === "emphasis_pulse"
        ? ["metric_pop", "panel_hold"]
        : ["panel_hold"];
    default:
      return ["panel_hold"];
  }
}

function coerceBenchmarkedVisualMotionPreset(
  input: {
    kind: ShotVisualObjectKind;
    semanticRole: ShotVisualObjectRole;
    animationPolicy: ShotVisualAnimationPolicy;
    profiles?: ResolvedProfiles;
  },
  candidatePreset: ShotVisualMotionPreset
): ShotVisualMotionPreset {
  return coerceBenchmarkedMotionPreset({
    motionProfileId: resolveVisualMotionProfileId(input.profiles),
    candidatePreset,
    fallbackCandidates: benchmarkFallbackCandidatesForMotionPreset(
      input.kind,
      input.semanticRole,
      input.animationPolicy
    )
  });
}

function buildPlannedVisualObjectsForShot(input: {
  shotId: string;
  chart?: Shot["chart"];
  primarySelection?: ShotVisualSelection;
  insertAsset?: ShotInsertAsset;
  supportingSelection?: ShotVisualSelection;
  profiles?: ResolvedProfiles;
}): ShotVisualObject[] | undefined {
  const objects: ShotVisualObject[] = [];

  if (input.primarySelection) {
    const pointerTargetIds = input.chart ? collectPointerTargetIds(input.chart) : [];
    const kind = input.primarySelection.selected_kind;
    const animationPolicy = resolvePrimaryVisualAnimationPolicy(kind);
    const preferredRegion = isChartFamilyKind(kind)
      ? regionFromChartLayoutPreset(input.chart?.layout_preset ?? layoutPresetForChartKind(kind))
      : resolvePrimaryRegionForVisualKind(kind, input.profiles);
    const objectId = `${input.shotId}_visual_primary`;
    objects.push({
      object_id: objectId,
      kind,
      source: "planner_v2",
      semantic_role: "primary_explainer",
      preferred_region: preferredRegion,
      safe_zone_tags: [
        "subtitle_safe",
        "chart_safe",
        "mascot_blocking",
        "pointer_reachable",
        "negative_space_preserve"
      ],
      animation_policy: animationPolicy,
      motion_preset: resolveVisualMotionPreset({
        kind,
        semanticRole: "primary_explainer",
        animationPolicy,
        profiles: input.profiles
      }),
      motion_profile_id: resolveVisualMotionProfileId(input.profiles),
      fallback_policy: resolvePrimaryVisualFallbackPolicy(kind),
      title: input.chart?.callouts?.[0]?.text ?? input.insertAsset?.title,
      body: !isChartFamilyKind(kind) ? input.insertAsset?.body : undefined,
      accent_token: !isChartFamilyKind(kind) ? input.insertAsset?.accent_token : undefined,
      items: !isChartFamilyKind(kind) ? input.insertAsset?.items : undefined,
      ...(pointerTargetIds.length > 0 ? { pointer_target_ids: pointerTargetIds } : {}),
      anchors: buildChartVisualAnchors({
        objectId,
        kind,
        pointerTargetIds,
        callouts: input.chart?.callouts?.map((callout) => ({
          text: callout.text,
          attach_to_target_id: callout.attach_to_target_id
        }))
      }),
      safe_area: resolveSafeAreaForRegion(preferredRegion),
      selection: input.primarySelection,
      data_ref:
        input.chart || !isChartFamilyKind(kind)
          ? {
              chart_id: input.chart?.chart_id,
              dataset_id: input.chart?.dataset_id,
              time_range: input.chart?.time_range,
              layout_hint: input.chart?.layout_preset ?? layoutPresetForChartKind(kind)
            }
          : undefined
    });
  }

  if (input.insertAsset && input.supportingSelection) {
    const kind = input.supportingSelection.selected_kind;
    const preferredRegion = regionFromInsertLayout(input.insertAsset.layout);
    const objectId = `${input.shotId}_visual_${input.insertAsset.type}`;
    const semanticRole = input.insertAsset.layout === "sidebar" ? "supporting_explainer" : "accent";
    const animationPolicy = input.insertAsset.layout === "lower_third" ? "emphasis_pulse" : "hold";
    objects.push({
      object_id: objectId,
      kind,
      source: "planner_v2",
      semantic_role: semanticRole,
      preferred_region: preferredRegion,
      safe_zone_tags: ["subtitle_safe", "mascot_blocking", "negative_space_preserve"],
      animation_policy: animationPolicy,
      motion_preset: resolveVisualMotionPreset({
        kind,
        semanticRole,
        animationPolicy,
        profiles: input.profiles
      }),
      motion_profile_id: resolveVisualMotionProfileId(input.profiles),
      fallback_policy:
        input.insertAsset.type === "board" || input.insertAsset.type === "diagram"
          ? "fallback_to_summary_card"
          : "hide_optional",
      title: input.insertAsset.title,
      body: input.insertAsset.body,
      accent_token: input.insertAsset.accent_token,
      items: input.insertAsset.items,
      anchors: buildInsertVisualAnchors({ objectId, kind }),
      safe_area: resolveSafeAreaForRegion(preferredRegion),
      selection: input.supportingSelection
    });
  }

  return objects.length > 0 ? objects : undefined;
}

function resolvePrimarySelectionFromVisualObjects(
  visualObjects: Shot["visual_objects"]
): ShotVisualSelection | undefined {
  return visualObjects?.find((object) => object.semantic_role === "primary_explainer")?.selection ?? visualObjects?.[0]?.selection;
}

function resolveSupportingSelectionFromVisualObjects(
  visualObjects: Shot["visual_objects"]
): ShotVisualSelection | undefined {
  return (
    visualObjects?.find(
      (object) => object.semantic_role === "supporting_explainer" || object.semantic_role === "accent"
    )?.selection ??
    visualObjects?.find((object) => object.source === "legacy_insert_v1")?.selection
  );
}

function resolveInsertedBrollFrames(sourceDuration: number): number {
  const maxAllowed = Math.min(GENERATIVE_BROLL_MAX_FRAMES, Math.max(0, sourceDuration - 48));
  if (maxAllowed < GENERATIVE_BROLL_INSERT_MIN_FRAMES) {
    return 0;
  }
  return clamp(
    Math.round(sourceDuration * 0.34),
    GENERATIVE_BROLL_INSERT_MIN_FRAMES,
    Math.min(maxAllowed, GENERATIVE_BROLL_INSERT_PREFERRED_FRAMES)
  );
}

function cutawayCueScore(source: string): number {
  return countCueMatches(source, [
    "show",
    "introduce",
    "from this angle",
    "picture this",
    "imagine",
    "meanwhile",
    "outside",
    "watch",
    "next quarter",
    "keep this detail"
  ]);
}

function shouldInsertGenerativeBrollCutaway(input: {
  shot: Shot;
  cueSource: string;
  insertedChartCutawayCount: number;
}): boolean {
  const { shot, cueSource, insertedChartCutawayCount } = input;

  if (!GENERATIVE_BROLL_ALLOWED_SOURCE_TYPES.has(shot.shot_type)) {
    return false;
  }

  const cueScore = cutawayCueScore(cueSource);
  const safeCamera = GENERATIVE_BROLL_ALLOWED_CAMERA_PRESETS.has(shot.camera.preset);

  if (shot.chart) {
    if (shot.shot_type !== "talk") {
      return false;
    }
    if (!safeCamera) {
      return false;
    }
    if (insertedChartCutawayCount >= GENERATIVE_BROLL_MAX_CHART_CUTAWAYS) {
      return false;
    }
    if (shot.duration_frames < GENERATIVE_BROLL_INSERT_MIN_CHART_SOURCE_FRAMES) {
      return false;
    }
    return cueScore >= 2 && resolveInsertedBrollFrames(shot.duration_frames) >= GENERATIVE_BROLL_INSERT_MIN_FRAMES;
  }

  if (shot.duration_frames < GENERATIVE_BROLL_INSERT_MIN_SOURCE_FRAMES) {
    return false;
  }

  return cueScore >= 1 && resolveInsertedBrollFrames(shot.duration_frames) >= GENERATIVE_BROLL_INSERT_MIN_FRAMES;
}

function buildInsertedBrollCameraKeyframes(shot: Shot, duration: number): Shot["camera"]["keyframes"] {
  const source = shot.camera.keyframes;
  const first = source[0] ?? { f: 0, x: 0.5, y: 0.5, zoom: 1, rotate_deg: 0 };
  const last = source[source.length - 1] ?? first;
  const baseX = clamp((first.x + last.x) / 2, 0.12, 0.88);
  const baseY = clamp((first.y + last.y) / 2, 0.2, 0.84);
  const baseZoom = clamp((first.zoom + last.zoom) / 2, 0.92, 1.14);

  return normalizeCameraKeyframes(duration, [
    {
      f: 0,
      x: baseX + (shot.character.transform.flip_x ? 0.02 : -0.02),
      y: baseY,
      zoom: baseZoom,
      rotate_deg: clamp(first.rotate_deg * 0.15, -0.8, 0.8)
    },
    {
      f: duration - 1,
      x: baseX + (shot.character.transform.flip_x ? -0.015 : 0.015),
      y: baseY - 0.008,
      zoom: clamp(baseZoom + 0.05, 0.92, 1.18),
      rotate_deg: clamp(last.rotate_deg * 0.1, -0.6, 0.6)
    }
  ]);
}

function buildInsertedBrollPosPath(shot: Shot, duration: number): Shot["character"]["tracks"]["pos_path"] {
  const baseX = shot.character.transform.x;
  const baseY = shot.character.transform.y;
  const driftX = shot.character.transform.flip_x ? -0.012 : 0.012;

  return [
    {
      f: 0,
      x: clamp(baseX - driftX * 0.5, 0.12, 0.88),
      y: clamp(baseY + 0.004, 0.68, 0.9),
      interp: "spring"
    },
    {
      f: duration - 1,
      x: clamp(baseX + driftX, 0.12, 0.88),
      y: clamp(baseY - 0.004, 0.68, 0.9),
      interp: "ease"
    }
  ];
}

function expandShotsForGenerativeBroll(
  shots: Shot[],
  beatById: Map<string, Beat>,
  profiles?: ResolvedProfiles
): Shot[] {
  const expanded: Shot[] = [];
  let insertedChartCutawayCount = 0;

  for (const shot of shots) {
    const cueSource = shot.beat_ids
      .map((beatId) => {
        const beat = beatById.get(beatId);
        if (!beat) {
          return "";
        }
        return `${beat.narration} ${beat.onScreen.join(" ")} ${beat.intent}`.toLowerCase();
      })
      .join(" ");

    if (
      !shouldInsertGenerativeBrollCutaway({
        shot,
        cueSource,
        insertedChartCutawayCount
      })
    ) {
      expanded.push(shot);
      continue;
    }

    const brollDuration = resolveInsertedBrollFrames(shot.duration_frames);
    const remainingDuration = shot.duration_frames - brollDuration;
    if (
      brollDuration < GENERATIVE_BROLL_INSERT_MIN_FRAMES ||
      remainingDuration < Math.max(24, Math.floor(GENERATIVE_BROLL_INSERT_MIN_FRAMES * 0.75))
    ) {
      expanded.push(shot);
      continue;
    }

    if (shot.chart) {
      insertedChartCutawayCount += 1;
    }

    const brollPreset = shot.camera.preset === "static" ? "static" : "slow_push";
    const brollRequiredView = defaultViewForShot({
      shotType: "broll",
      intent: shot.shot_grammar.required_view === "profile" ? "bridge" : "narrative",
      profiles
    });
    const brollRenderMode = renderModeForShot({
      shotType: "broll",
      hasChart: false,
      durationFrames: brollDuration,
      cameraPreset: brollPreset
    });
    const brollInsertNeeds = dedupeInsertNeeds([...shot.shot_grammar.insert_need, "caption_card"]);
    const brollSegment: BeatSegment = {
      intent: "narrative",
      beats: shot.beat_ids
        .map((beatId) => beatById.get(beatId))
        .filter((beat): beat is Beat => Boolean(beat))
    };
    const brollSidecarPreset = resolveShotSidecarPreset({
      renderMode: brollRenderMode,
      shotType: "broll",
      requiredView: brollRequiredView,
      cameraPreset: brollPreset,
      profiles
    });
    const originalPrimarySelection = resolvePrimarySelectionFromVisualObjects(shot.visual_objects);
    const brollInsertSelection = resolveInsertAssetSelection({
      insertNeeds: brollInsertNeeds,
      hasChart: false,
      segment: brollSegment,
      educationalIntent: "supporting_insert_cutaway",
      primarySelection: originalPrimarySelection,
      profiles
    });
    const brollInsertAsset = buildInsertAsset({
      shotId: `${shot.shot_id}_broll`,
      segment: brollSegment,
      talkText:
        shot.talk_text ??
        shot.chart?.callouts?.[0]?.text ??
        shot.emphasis_words?.join(" ") ??
        "Supporting insert.",
      emphasisWords: shot.emphasis_words ?? [],
      insertSelection: brollInsertSelection,
      profiles
    });
    const brollIntent: ShotVisualIntentCandidate = {
      intent_id: "supporting_insert_cutaway_v1",
      intent_family: intentFamilyForInsertType(brollInsertSelection?.selectedType),
      score: 0,
      candidate_insert_types: brollInsertNeeds,
      candidate_primary_kinds: brollInsertSelection ? [brollInsertSelection.supportingSelection.selected_kind] : [],
      candidate_supporting_kinds: brollInsertSelection ? [brollInsertSelection.supportingSelection.selected_kind] : [],
      selection_reason: "broll_insert_cutaway"
    };
    const brollVisualPlan = buildShotVisualPlan({
      educationalIntent: "supporting_insert_cutaway",
      channelDomain: profiles?.channel.domain ?? "economy",
      insertNeedCandidates: brollInsertNeeds,
      selectedIntent: brollIntent,
      candidateIntents: [brollIntent],
      primarySelection: brollInsertSelection?.supportingSelection,
      insertSelection: brollInsertSelection
    });
    const brollVisualObjects = buildPlannedVisualObjectsForShot({
      shotId: `${shot.shot_id}_broll`,
      primarySelection: brollInsertSelection?.supportingSelection,
      insertAsset: brollInsertAsset,
      profiles
    });
    const brollShot: Shot = {
      ...shot,
      shot_id: `${shot.shot_id}_broll`,
      shot_type: "broll",
      render_mode: brollRenderMode,
      ...(brollSidecarPreset ? { sidecar_preset: brollSidecarPreset } : {}),
      start_frame: 0,
      duration_frames: brollDuration,
      set: {
        ...shot.set,
        variant: shot.set.variant
      },
      camera: {
        preset: brollPreset,
        keyframes: buildInsertedBrollCameraKeyframes(shot, brollDuration)
      },
      insert_asset: brollInsertAsset,
      visual_plan: brollVisualPlan,
      visual_objects: brollVisualObjects,
      shot_grammar: {
        ...shot.shot_grammar,
        camera_motion: cameraMotionFromPreset(brollPreset),
        required_view: brollRequiredView,
        educational_intent:
          shot.shot_grammar.insert_need.includes("chart") || shot.shot_grammar.insert_need.includes("diagram")
            ? "supporting_insert_cutaway"
            : shot.shot_grammar.educational_intent,
        insert_need: brollInsertNeeds,
        route_reason: routeReasonForShot({
          shotType: "broll",
          renderMode: brollRenderMode,
          hasChart: false,
          intent: "narrative",
          insertNeeds: brollInsertNeeds,
          profiles
        })
      },
      acting: retimeActingPlan(shot.acting, shot.duration_frames, brollDuration) ?? shot.acting,
      chart: undefined,
      character: {
        ...shot.character,
        tracks: {
          ...shot.character.tracks,
          pos_path: buildInsertedBrollPosPath(shot, brollDuration),
          action_track: [
            {
              f: 0,
              clip: shot.shot_type === "transition" ? "move" : shot.character.tracks.action_track[0]?.clip ?? "idle_talk",
              weight: 1
            }
          ],
          expression_track: [
            {
              f: 0,
              expression: shot.character.tracks.expression_track[0]?.expression ?? "neutral"
            }
          ],
          look_track: [
            {
              f: 0,
              target: "viewer"
            }
          ],
          viseme_track: [
            {
              f: 0,
              viseme: "mouth_closed",
              intensity: 0
            }
          ],
          point_track: undefined
        }
      },
      audio: shot.audio
    };

    const mainChart = shot.chart
      ? {
          ...shot.chart,
          highlights: retimeSimpleTrack(shot.chart.highlights, shot.duration_frames, remainingDuration),
          callouts: retimeSimpleTrack(shot.chart.callouts, shot.duration_frames, remainingDuration)
        }
      : undefined;
    const mainPrimarySelection = resolvePrimarySelectionFromVisualObjects(shot.visual_objects);
    const mainSupportingSelection = shot.insert_asset
      ? resolveSupportingSelectionFromVisualObjects(shot.visual_objects)
      : undefined;
    const mainVisualObjects = buildPlannedVisualObjectsForShot({
      shotId: `${shot.shot_id}_main`,
      chart: mainChart,
      primarySelection: mainPrimarySelection,
      insertAsset: shot.insert_asset,
      supportingSelection: mainSupportingSelection,
      profiles
    });

    const mainShot: Shot = {
      ...shot,
      shot_id: `${shot.shot_id}_main`,
      start_frame: 0,
      duration_frames: remainingDuration,
      set: {
        ...shot.set,
        variant: "cut"
      },
      camera: {
        ...shot.camera,
        keyframes: retimeKeyframes(shot.camera.keyframes, shot.duration_frames, remainingDuration)
      },
      acting: retimeActingPlan(shot.acting, shot.duration_frames, remainingDuration) ?? shot.acting,
      character: {
        ...shot.character,
        tracks: {
          ...shot.character.tracks,
          pos_path: retimePosPath(shot.character.tracks.pos_path, shot.duration_frames, remainingDuration),
          action_track:
            retimeSimpleTrack(shot.character.tracks.action_track, shot.duration_frames, remainingDuration) ??
            shot.character.tracks.action_track,
          expression_track:
            retimeSimpleTrack(shot.character.tracks.expression_track, shot.duration_frames, remainingDuration) ??
            shot.character.tracks.expression_track,
          look_track:
            retimeSimpleTrack(shot.character.tracks.look_track, shot.duration_frames, remainingDuration) ??
            shot.character.tracks.look_track,
          view_track:
            retimeSimpleTrack(shot.character.tracks.view_track, shot.duration_frames, remainingDuration) ??
            shot.character.tracks.view_track,
          viseme_track:
            retimeSimpleTrack(shot.character.tracks.viseme_track, shot.duration_frames, remainingDuration) ??
            shot.character.tracks.viseme_track,
          point_track: retimeSimpleTrack(shot.character.tracks.point_track, shot.duration_frames, remainingDuration)
        }
      },
      visual_plan: shot.visual_plan,
      chart: mainChart,
      visual_objects: mainVisualObjects,
      audio:
        shot.shot_type === "transition"
          ? {
              sfx: [
                {
                  f: 0,
                  src: "sfx://transition/cut"
                }
              ]
            }
          : undefined
    };

    expanded.push(brollShot, mainShot);
  }

  let startFrame = 0;
  return expanded.map((shot, index) => {
    const normalizedShotId = `shot_${String(index + 1).padStart(3, "0")}`;
    const normalized = {
      ...shot,
      shot_id: normalizedShotId,
      start_frame: startFrame
    };
    startFrame += normalized.duration_frames;
    return normalized;
  });
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

function resolveTargetShotCount(beatCount: number, options: ResolvedCompileShotsOptions): number {
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

function normalizeTrackEntries<T extends { f: number }>(entries: T[]): T[] {
  const sorted = [...entries].sort((left, right) => left.f - right.f);
  const deduped: T[] = [];
  for (const entry of sorted) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.f === entry.f) {
      deduped[deduped.length - 1] = entry;
      continue;
    }
    deduped.push(entry);
  }
  return deduped;
}

function segmentNarrationText(segment: BeatSegment): string {
  return segment.beats
    .map((beat) => beat.narration.trim())
    .filter((value) => value.length > 0)
    .join(" ");
}

function normalizeEmphasisToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9']/g, "").trim();
}

function countMeaningfulTokens(text: string, stopwords: Set<string>): number {
  return text
    .split(/\s+/)
    .map((token) => normalizeEmphasisToken(token))
    .filter((token) => token.length >= 3 && !stopwords.has(token)).length;
}

function stripTalkTextBoilerplate(text: string): string {
  return text
    .replace(/^let's begin with[^.?!]*[.?!]\s*/i, "")
    .replace(/^final takeaway:\s*/i, "")
    .replace(/^from this angle,\s*/i, "")
    .replace(/^next,\s*/i, "")
    .replace(/\bthis sharpens the main point\.?\s*$/i, "")
    .replace(/\bkeep this detail in view\.?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectEmphasisCandidates(text: string): string[] {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, "").trim())
    .map((token) => ({ raw: token, normalized: normalizeEmphasisToken(token) }))
    .filter(
      (entry) =>
        entry.normalized.length >= 3 &&
        !EMPHASIS_STOPWORDS.has(entry.normalized) &&
        /[a-z0-9]/i.test(entry.raw)
    )
    .map((entry) => entry.raw);
}

function finalizeTalkTextPhrases(phrases: string[]): string {
  const cleaned = phrases
    .map((phrase) => phrase.trim().replace(/\s+/g, " "))
    .filter((phrase) => phrase.length > 0);
  if (cleaned.length === 0) {
    return "";
  }

  let output = cleaned[0];
  for (let index = 1; index < cleaned.length; index += 1) {
    const phrase = cleaned[index].replace(/^[,;:]\s*/, "");
    const startsLower = /^[a-z]/.test(phrase);
    const endsSentence = /[.?!]$/.test(output);
    const endsJoiner = /[,;:]$/.test(output);

    if (endsSentence) {
      output += ` ${phrase}`;
      continue;
    }
    if (endsJoiner || startsLower) {
      output += ` ${phrase}`;
      continue;
    }
    output += `. ${phrase}`;
  }

  output = output
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/,([.?!])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (!/[.?!]$/.test(output)) {
    output = `${output}.`;
  }

  return output;
}

function deriveTalkText(segment: BeatSegment, durationFrames: number): string {
  const phrasePool = segment.beats.flatMap((beat) => {
    const cleaned = stripTalkTextBoilerplate(beat.narration);
    return splitNarrationPhrases(cleaned);
  });
  const uniquePhrases: Array<{ text: string; normalized: string; score: number; order: number }> = [];
  const seen = new Set<string>();

  phrasePool.forEach((phrase, phraseIndex) => {
    const cleaned = phrase.replace(/\s+/g, " ").trim();
    if (cleaned.length === 0) {
      return;
    }
    const normalized = normalizeEmphasisToken(cleaned);
    if (normalized.length === 0 || seen.has(normalized)) {
      return;
    }

    const meaningfulCount = countMeaningfulTokens(cleaned, TALK_TEXT_STOPWORDS);
    const looksLikeFiller =
      /^this sharpens the main point\b/i.test(cleaned) ||
      /^keep this detail in view\b/i.test(cleaned) ||
      /^let's begin with\b/i.test(cleaned) ||
      /^from this angle\b/i.test(cleaned) ||
      /^next\b/i.test(cleaned);
    const score = meaningfulCount * 12 + Math.min(18, cleaned.length) - (looksLikeFiller ? 18 : 0);
    seen.add(normalized);
    uniquePhrases.push({
      text: cleaned,
      normalized,
      score,
      order: phraseIndex
    });
  });

  const sortedPhrases = uniquePhrases.sort((left, right) => right.score - left.score || left.text.localeCompare(right.text));
  const maxWords = clamp(Math.round((durationFrames / 30) * 3.1), 10, 24);
  const maxPhrases = durationFrames >= 180 ? 3 : 2;
  const selected: string[] = [];
  let usedWords = 0;

  for (const phrase of sortedPhrases) {
    const wordCount = phrase.text.split(/\s+/).filter((value) => value.length > 0).length;
    if (selected.length >= maxPhrases) {
      break;
    }
    if (selected.length > 0 && usedWords + wordCount > maxWords && usedWords >= Math.floor(maxWords * 0.65)) {
      break;
    }
    selected.push(phrase.text);
    usedWords += wordCount;
  }

  if (selected.length === 0) {
    const fallback = stripTalkTextBoilerplate(segmentNarrationText(segment));
    if (fallback.length > 0) {
      const fallbackWords = fallback.split(/\s+/).filter((value) => value.length > 0);
      return finalizeTalkTextPhrases([fallbackWords.slice(0, maxWords).join(" ")]);
    }
    return "";
  }

  const orderedSelected = uniquePhrases
    .filter((entry) => selected.includes(entry.text))
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.text);

  return finalizeTalkTextPhrases(orderedSelected);
}

function deriveEmphasisWords(segment: BeatSegment, talkText: string): string[] {
  const weightedSources = segment.beats.flatMap((beat) => {
    const emphasisWeight = beat.emphasis === "high" ? 3 : beat.emphasis === "medium" ? 2 : 1;
    const parts = [beat.narration, ...beat.onScreen];
    return parts.flatMap((part) => collectEmphasisCandidates(part).map((token) => ({ token, emphasisWeight })));
  });
  const talkCandidates = collectEmphasisCandidates(talkText).map((token) => ({
    token,
    emphasisWeight: 4
  }));

  const byToken = new Map<string, { token: string; score: number; length: number }>();
  for (const entry of [...weightedSources, ...talkCandidates]) {
    const normalized = normalizeEmphasisToken(entry.token);
    if (normalized.length === 0) {
      continue;
    }
    const current = byToken.get(normalized) ?? { token: entry.token, score: 0, length: entry.token.length };
    const hasDigit = /\d/.test(entry.token);
    current.score += entry.emphasisWeight * 10 + Math.min(8, entry.token.length) + (hasDigit ? 6 : 0);
    if (entry.token.length > current.length) {
      current.token = entry.token;
      current.length = entry.token.length;
    }
    byToken.set(normalized, current);
  }

  return [...byToken.values()]
    .sort((left, right) => right.score - left.score || right.length - left.length || left.token.localeCompare(right.token))
    .slice(0, 4)
    .map((entry) => entry.token);
}

function splitNarrationPhrases(text: string): string[] {
  const phrases = text
    .split(/(?<=[,.;!?])\s+/)
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => value.length > 0);
  if (phrases.length > 0) {
    return phrases;
  }
  const words = text.split(/\s+/).filter((value) => value.length > 0);
  if (words.length === 0) {
    return [];
  }
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += 4) {
    chunks.push(words.slice(index, index + 4).join(" "));
  }
  return chunks;
}

type PhraseCueAnchor = {
  text: string;
  f: number;
  emphasis: boolean;
  question: boolean;
  exclamation: boolean;
};

function hasPhraseEmphasis(phrase: string, emphasisWords: string[]): boolean {
  const normalizedPhrase = normalizeEmphasisToken(phrase);
  if (/[!?]/.test(phrase)) {
    return true;
  }
  return emphasisWords.some((word) => {
    const normalizedWord = normalizeEmphasisToken(word);
    return normalizedWord.length > 0 && normalizedPhrase.includes(normalizedWord);
  });
}

function buildPhraseCueAnchors(input: {
  duration: number;
  talkText: string;
  emphasisWords: string[];
}): PhraseCueAnchor[] {
  const phrases = splitNarrationPhrases(input.talkText);
  if (phrases.length === 0) {
    return [];
  }

  const firstFrame = clamp(Math.floor(input.duration * 0.16), 4, Math.max(4, input.duration - 8));
  const lastFrame = clamp(Math.floor(input.duration * 0.78), firstFrame, Math.max(firstFrame, input.duration - 4));
  const span = Math.max(1, lastFrame - firstFrame);

  return phrases.map((phrase, index) => {
    const t = phrases.length === 1 ? 0.35 : index / Math.max(1, phrases.length - 1);
    const f = clamp(Math.round(firstFrame + span * t), 2, Math.max(2, input.duration - 3));
    return {
      text: phrase,
      f,
      emphasis: hasPhraseEmphasis(phrase, input.emphasisWords),
      question: /\?/.test(phrase),
      exclamation: /!/.test(phrase)
    };
  });
}

function cameraSizeForShot(input: {
  shotType: ShotType;
  intent: VisualIntent;
  hasChart: boolean;
  profiles?: ResolvedProfiles;
}): ShotCameraSize {
  const dialogueSize = input.profiles?.channel.preferred_dialogue_camera_size;
  const dataSize = input.profiles?.channel.preferred_data_camera_size;
  const introSize = input.profiles?.channel.preferred_intro_camera_size;

  if (input.shotType === "transition") {
    return "cu";
  }
  if (input.shotType === "reaction") {
    return "cu";
  }
  if (input.shotType === "broll") {
    return input.hasChart ? dataSize ?? "mcu" : "ms";
  }
  if (input.intent === "close") {
    return "cu";
  }
  if (input.intent === "data") {
    return dataSize ?? "mcu";
  }
  if (input.intent === "intro") {
    return introSize ?? "ms";
  }
  return dialogueSize ?? "mcu";
}

function cameraMotionFromPreset(preset: CameraPreset): ShotCameraMotion {
  if (preset === "slow_push") {
    return "push";
  }
  if (preset === "whip_pan") {
    return "pan";
  }
  if (preset === "shake_emphasis") {
    return "tilt";
  }
  return "hold";
}

function emotionCurveFromSegment(segment: BeatSegment): ShotEmotionCurve {
  const emphasisValues = segment.beats.map((beat) => beat.emphasis);
  if (emphasisValues.some((value) => value === "high")) {
    return "accent";
  }
  if (emphasisValues.length >= 2) {
    const first = emphasisValues[0];
    const last = emphasisValues[emphasisValues.length - 1];
    if (first === "low" && (last === "medium" || last === "high")) {
      return "rise";
    }
    if ((first === "medium" || first === "high") && last === "low") {
      return "fall";
    }
  }
  return "flat";
}

function actingIntentFromSegment(
  segment: BeatSegment,
  intent: VisualIntent,
  profiles?: ResolvedProfiles
): string {
  const cueSource = segmentCueSource(segment);
  if (intent === "data") {
    return profiles?.channel.domain === "medical" ? "calm_explanation" : "explain_chart";
  }
  if (intent === "close") {
    return "land_takeaway";
  }
  if (cueSource.includes("?")) {
    return "questioning";
  }
  if (cueSource.includes("show") || cueSource.includes("look") || cueSource.includes("notice")) {
    return "direct_attention";
  }
  if (segmentHasEmphasis(segment, "high")) {
    return "emphasize_point";
  }
  return "steady_delivery";
}

function educationalIntentFromSegment(input: {
  segment: BeatSegment;
  intent: VisualIntent;
  hasChart: boolean;
  profiles?: ResolvedProfiles;
}): string {
  const channelDomain = input.profiles?.channel.domain ?? "economy";
  const cueSource = segmentCueSource(input.segment);
  const cautionLike = /(risk|warning|caution|avoid|side effect|symptom|urgent)/i.test(cueSource);

  if (input.intent === "intro") {
    return channelDomain === "medical" ? "calm_hook_context" : "hook_context";
  }
  if (input.intent === "close") {
    return channelDomain === "medical" ? "reassuring_summary" : "takeaway_summary";
  }
  if (input.hasChart || input.intent === "data") {
    if (channelDomain === "medical") {
      return cautionLike ? "caution_diagram_explainer" : "diagram_explainer";
    }
    return segmentHasEmphasis(input.segment, "high") ? "trend_emphasis" : "number_explainer";
  }
  if (cautionLike) {
    return "caution_context";
  }
  if (segmentHasEmphasis(input.segment, "high")) {
    return "key_point_reinforcement";
  }
  return "concept_breakdown";
}

function dedupeInsertNeeds(needs: InsertAssetType[]): InsertAssetType[] {
  const seen = new Set<InsertAssetType>();
  const ordered: InsertAssetType[] = [];
  for (const need of needs) {
    if (seen.has(need)) {
      continue;
    }
    seen.add(need);
    ordered.push(need);
  }
  return ordered;
}

type InsertAssetSelection = {
  resolverId: ShotVisualResolverId;
  selectedType: InsertAssetType;
  candidateTypes: InsertAssetType[];
  supportingSelection: ShotVisualSelection;
  selectionReason: string;
};

function scoreInsertAssetCandidate(input: {
  type: InsertAssetType;
  supportingSelection: ShotVisualSelection;
  cueText: string;
  hasChart: boolean;
  primarySelection?: ShotVisualSelection;
  profiles?: ResolvedProfiles;
  emphasisHigh: boolean;
  preferredInsertTypes: InsertAssetType[] | undefined;
}): { type: InsertAssetType; score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const channelDomain = input.profiles?.channel.domain ?? "economy";

  if (input.preferredInsertTypes?.includes(input.type)) {
    score += 10;
    reasons.push("channel_insert_preference");
  }

  if (input.type === "diagram") {
    if (input.supportingSelection.selected_kind === "anatomy_diagram") {
      score += 18;
      reasons.push("diagram_structure_fit");
    }
    if (input.supportingSelection.selected_kind === "process_flow") {
      score += 20;
      reasons.push("diagram_process_fit");
    }
  }

  if (input.type === "chart") {
    if (
      input.supportingSelection.selected_kind === "timeline" ||
      input.supportingSelection.selected_kind === "kpi_card" ||
      input.supportingSelection.selected_kind === "table"
    ) {
      score += 18;
      reasons.push("chart_metric_fit");
    }
    if (input.hasChart) {
      score += 5;
    }
  }

  if (input.type === "board" && input.supportingSelection.selected_kind === "comparison_board") {
    score += 18;
    reasons.push("board_comparison_fit");
  }

  if (input.type === "callout_card" && input.supportingSelection.selected_kind === "callout_card") {
    score += 18;
    reasons.push("callout_fit");
  }

  if (input.type === "caption_card" && input.supportingSelection.selected_kind === "summary_card") {
    score += 16;
    reasons.push("caption_summary_fit");
  }

  if (input.type === "icon_explainer" && input.supportingSelection.selected_kind === "icon_grid") {
    score += 16;
    reasons.push("icon_grid_fit");
  }

  if (input.type === "caution_card" && input.supportingSelection.selected_kind === "risk_meter") {
    score += 22;
    reasons.push("risk_signal_fit");
  }

  if (/(warning|risk|caution|urgent|side effect|danger|avoid)/.test(input.cueText) && input.type === "caution_card") {
    score += 12;
    reasons.push("risk_cue");
  }

  if (/(summary|takeaway|recap|bottom line)/.test(input.cueText) && input.type === "caption_card") {
    score += 10;
    reasons.push("summary_cue");
  }

  if (input.emphasisHigh && input.type === "callout_card") {
    score += 6;
    reasons.push("high_emphasis_callout");
  }

  if (channelDomain === "medical") {
    if (input.type === "diagram" || input.type === "caution_card") {
      score += 6;
    }
    if (input.type === "chart" && input.supportingSelection.selected_kind === "table") {
      score += 4;
    }
  } else {
    if (input.type === "chart" || input.type === "board") {
      score += 4;
    }
  }

  if (
    input.primarySelection?.data_shape === "time_series" &&
    input.type === "chart" &&
    input.supportingSelection.selected_kind === "timeline"
  ) {
    score += 7;
    reasons.push("time_series_support_alignment");
  }

  if (input.primarySelection && input.supportingSelection.selected_kind === input.primarySelection.selected_kind) {
    score -= 6;
    reasons.push("avoid_duplicate_primary_kind");
  }

  return { type: input.type, score, reasons };
}

function resolveInsertAssetSelection(input: {
  insertNeeds: InsertAssetType[];
  hasChart: boolean;
  segment: BeatSegment;
  educationalIntent: string;
  primarySelection?: ShotVisualSelection;
  supportingCandidateKinds?: ShotVisualObjectKind[];
  profiles?: ResolvedProfiles;
}): InsertAssetSelection | undefined {
  if (input.insertNeeds.length === 0) {
    return undefined;
  }

  const cueText = buildVisualSelectionCueText(input.segment, input.educationalIntent);
  const candidates = input.insertNeeds.map((type) => {
    const supportingSelection = resolveSupportingVisualSelection({
      segment: input.segment,
      educationalIntent: input.educationalIntent,
      insertAssetType: type,
      primarySelection: input.primarySelection,
      candidateKinds: input.supportingCandidateKinds,
      profiles: input.profiles
    });
    const scored = scoreInsertAssetCandidate({
      type,
      supportingSelection,
      cueText,
      hasChart: input.hasChart,
      primarySelection: input.primarySelection,
      profiles: input.profiles,
      emphasisHigh: segmentHasEmphasis(input.segment, "high"),
      preferredInsertTypes: input.profiles?.channel.preferred_insert_types
    });
    return {
      ...scored,
      supportingSelection
    };
  });

  const ranked = candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return input.insertNeeds.indexOf(left.type) - input.insertNeeds.indexOf(right.type);
  });
  const selected = ranked[0];
  if (!selected) {
    return undefined;
  }
  return {
    resolverId: input.primarySelection?.resolver_id ?? "visual_object_resolver_v1",
    selectedType: selected.type,
    candidateTypes: ranked.map((candidate) => candidate.type),
    supportingSelection: selected.supportingSelection,
    selectionReason: selected.reasons.length > 0 ? selected.reasons.join(",") : `score:${selected.score}`
  };
}

function buildShotVisualPlan(input: {
  educationalIntent: string;
  channelDomain: "economy" | "medical";
  insertNeedCandidates: InsertAssetType[];
  selectedIntent: ShotVisualIntentCandidate;
  candidateIntents: ShotVisualIntentCandidate[];
  primarySelection?: ShotVisualSelection;
  insertSelection?: InsertAssetSelection;
}): ShotVisualPlan {
  return {
    resolver_id: "visual_pair_planner_v1",
    educational_mode: input.educationalIntent,
    channel_domain: input.channelDomain,
    insert_need_candidates: input.insertNeedCandidates,
    candidate_intents: input.candidateIntents,
    selected_intent_id: input.selectedIntent.intent_id,
    selected_intent_family: input.selectedIntent.intent_family,
    selected_primary_kind: input.primarySelection?.selected_kind,
    selected_supporting_kind: input.insertSelection?.supportingSelection.selected_kind,
    selected_insert_type: input.insertSelection?.selectedType,
    selection_reason: [
      input.selectedIntent.selection_reason,
      input.primarySelection?.selection_reason,
      input.insertSelection?.selectionReason
    ]
      .filter((value): value is string => Boolean(value))
      .join(" | ")
  };
}

function intentFamilyForInsertType(type: InsertAssetType | undefined): ShotVisualIntentFamily {
  switch (type) {
    case "diagram":
      return "diagram_primary";
    case "board":
      return "comparison_focus";
    case "caution_card":
      return "risk_focus";
    case "chart":
      return "timeline_metric";
    case "caption_card":
    case "callout_card":
    case "icon_explainer":
    default:
      return "summary_focus";
  }
}

function resolveRouteInsertNeeds(input: {
  visualPlan?: ShotVisualPlan;
  insertSelection?: InsertAssetSelection;
  insertNeedCandidates: InsertAssetType[];
}): InsertAssetType[] {
  if (!input.visualPlan) {
    return input.insertSelection ? [input.insertSelection.selectedType] : input.insertNeedCandidates;
  }

  switch (input.visualPlan.selected_intent_family) {
    case "diagram_primary":
      return ["diagram"];
    case "chart_primary":
    case "timeline_metric":
      return ["chart"];
    case "comparison_focus":
      return input.insertSelection ? [input.insertSelection.selectedType] : ["board"];
    case "risk_focus":
      return input.insertSelection ? [input.insertSelection.selectedType] : ["caution_card"];
    case "summary_focus":
    default:
      return input.insertSelection ? [input.insertSelection.selectedType] : input.insertNeedCandidates;
  }
}

function compactInsertBody(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter((value) => value.length > 0);
  if (words.length <= maxWords) {
    return text;
  }
  return `${words.slice(0, maxWords).join(" ")}...`;
}

function buildInsertAsset(input: {
  shotId: string;
  segment: BeatSegment;
  talkText: string;
  emphasisWords: string[];
  insertSelection?: InsertAssetSelection;
  profiles?: ResolvedProfiles;
}): ShotInsertAsset | undefined {
  const type = input.insertSelection?.selectedType;
  if (!type) {
    return undefined;
  }

  const channelDomain = input.profiles?.channel.domain ?? "economy";
  const accentToken = channelDomain === "medical" ? "medical" : "economy";
  const titleSource =
    input.segment.beats.flatMap((beat) => beat.onScreen).find((value) => value.trim().length > 0) ??
    input.emphasisWords[0] ??
    input.talkText;
  const cleanedTitle = titleSource.replace(/\s+/g, " ").trim();
  const safeTitle = cleanedTitle.length > 0 ? cleanedTitle : "Explainer Note";
  const body = compactInsertBody(input.talkText.trim(), type === "chart" ? 14 : 20);
  const items = input.emphasisWords.slice(0, 3);

  if (type === "caption_card") {
    return {
      asset_id: `${input.shotId}_caption_card`,
      type,
      layout: "lower_third",
      title: safeTitle,
      body,
      accent_token: accentToken,
      ...(items.length > 0 ? { items } : {}),
      selection: input.insertSelection
        ? {
            resolver_id: input.insertSelection.resolverId,
            selected_insert_type: input.insertSelection.selectedType,
            candidate_insert_types: input.insertSelection.candidateTypes,
            supporting_kind: input.insertSelection.supportingSelection.selected_kind,
            educational_mode: input.insertSelection.supportingSelection.educational_mode,
            channel_domain: input.insertSelection.supportingSelection.channel_domain,
            selection_reason: input.insertSelection.selectionReason
          }
        : undefined
    };
  }

  if (type === "callout_card") {
    return {
      asset_id: `${input.shotId}_callout_card`,
      type,
      layout: "lower_third",
      title: safeTitle,
      body,
      accent_token: accentToken,
      ...(items.length > 0 ? { items } : {}),
      selection: input.insertSelection
        ? {
            resolver_id: input.insertSelection.resolverId,
            selected_insert_type: input.insertSelection.selectedType,
            candidate_insert_types: input.insertSelection.candidateTypes,
            supporting_kind: input.insertSelection.supportingSelection.selected_kind,
            educational_mode: input.insertSelection.supportingSelection.educational_mode,
            channel_domain: input.insertSelection.supportingSelection.channel_domain,
            selection_reason: input.insertSelection.selectionReason
          }
        : undefined
    };
  }

  if (type === "caution_card") {
    return {
      asset_id: `${input.shotId}_caution_card`,
      type,
      layout: "lower_third",
      title: channelDomain === "medical" ? "Caution" : safeTitle,
      body,
      accent_token: "medical",
      ...(items.length > 0 ? { items } : {}),
      selection: input.insertSelection
        ? {
            resolver_id: input.insertSelection.resolverId,
            selected_insert_type: input.insertSelection.selectedType,
            candidate_insert_types: input.insertSelection.candidateTypes,
            supporting_kind: input.insertSelection.supportingSelection.selected_kind,
            educational_mode: input.insertSelection.supportingSelection.educational_mode,
            channel_domain: input.insertSelection.supportingSelection.channel_domain,
            selection_reason: input.insertSelection.selectionReason
          }
        : undefined
    };
  }

  return {
    asset_id: `${input.shotId}_${type}`,
    type,
    layout: "sidebar",
    title: safeTitle,
    body,
    accent_token: accentToken,
    ...(items.length > 0 ? { items } : {}),
    selection: input.insertSelection
      ? {
          resolver_id: input.insertSelection.resolverId,
          selected_insert_type: input.insertSelection.selectedType,
          candidate_insert_types: input.insertSelection.candidateTypes,
          supporting_kind: input.insertSelection.supportingSelection.selected_kind,
          educational_mode: input.insertSelection.supportingSelection.educational_mode,
          channel_domain: input.insertSelection.supportingSelection.channel_domain,
          selection_reason: input.insertSelection.selectionReason
        }
      : undefined
  };
}

function insertNeedsForShot(input: {
  segment: BeatSegment;
  shotType: ShotType;
  renderMode: ShotRenderMode;
  intent: VisualIntent;
  hasChart: boolean;
  profiles?: ResolvedProfiles;
}): InsertAssetType[] {
  const channel = input.profiles?.channel;
  const cueSource = segmentCueSource(input.segment);
  const cautionLike = /(risk|warning|caution|avoid|side effect|symptom|urgent)/i.test(cueSource);
  const needs: InsertAssetType[] = [];

  if (input.hasChart || (input.intent === "data" && channel?.domain === "economy")) {
    needs.push("chart");
  }

  if (channel?.domain === "economy") {
    if (input.intent === "data" && channel.board_density !== "light") {
      needs.push("board");
    }
    if (segmentHasEmphasis(input.segment, "high")) {
      needs.push("callout_card");
    }
  }

  if (channel?.domain === "medical") {
    if (input.intent === "data") {
      needs.push("diagram");
    }
    if (cautionLike || segmentHasEmphasis(input.segment, "high")) {
      needs.push("caution_card");
    }
  }

  if (input.shotType === "broll" || input.renderMode === "generative_broll") {
    needs.push("caption_card");
  }

  return dedupeInsertNeeds(needs);
}

function routeReasonForShot(input: {
  shotType: ShotType;
  renderMode: ShotRenderMode;
  hasChart: boolean;
  intent: VisualIntent;
  insertNeeds?: InsertAssetType[];
  profiles?: ResolvedProfiles;
}): string {
  const insertNeeds = input.insertNeeds ?? [];
  const channelDomain = input.profiles?.channel.domain;
  if (input.renderMode === "deterministic") {
    if (insertNeeds.includes("diagram")) {
      return "diagram_explainer_dialogue";
    }
    if (insertNeeds.includes("chart")) {
      return channelDomain === "economy" ? "chart_explainer_dialogue" : "data_explainer_dialogue";
    }
    if (input.shotType === "talk" || input.shotType === "reaction") {
      return "character_focused_dialogue";
    }
    return "default_backbone";
  }
  if (input.renderMode === "generative_i2v") {
    return "premium_insert_candidate";
  }
  if (input.renderMode === "generative_s2v") {
    return "style_motion_sidecar";
  }
  if (insertNeeds.length > 0) {
    return `insert_driven_${insertNeeds[0]}`;
  }
  if (input.hasChart || input.intent === "data") {
    return "chart_or_explainer_cutaway";
  }
  return "generative_broll_insert";
}

function resolveShotSidecarPreset(input: {
  renderMode: ShotRenderMode;
  shotType: ShotType;
  requiredView: ShotView;
  cameraPreset: string;
  profiles?: ResolvedProfiles;
}): ShotSidecarPreset | undefined {
  if (input.renderMode === "deterministic") {
    return undefined;
  }

  const policyTags = [
    `render:${input.renderMode}`,
    `shot:${input.shotType}`,
    `view:${input.requiredView}`,
    `camera:${input.cameraPreset}`
  ];

  let controlnetPreset =
    input.requiredView === "profile" || input.renderMode === "generative_s2v"
      ? (input.profiles?.mascot.sidecar_controlnet_preset_profile_view ?? "profile_lineart_depth_v1")
      : (input.profiles?.mascot.sidecar_controlnet_preset ?? "pose_depth_balance_v1");

  if (input.requiredView !== "profile" && /whip|shake/i.test(input.cameraPreset)) {
    controlnetPreset = "pose_canny_balance_v1";
    policyTags.push("controlnet:motion_override");
  }

  const impactPreset =
    input.renderMode === "generative_i2v" || input.shotType === "reaction"
      ? (input.profiles?.channel.sidecar_impact_preset_premium ?? "identity_repair_detail_v1")
      : (input.profiles?.channel.sidecar_impact_preset ?? "broadcast_cleanup_v1");

  const qcPreset =
    input.renderMode === "generative_i2v" || input.requiredView === "profile"
      ? (input.profiles?.studio.sidecar_qc_preset_strict ?? "broadcast_identity_strict_v1")
      : (input.profiles?.studio.sidecar_qc_preset ?? "broadcast_balanced_v1");

  return {
    controlnet_preset: controlnetPreset,
    impact_preset: impactPreset,
    qc_preset: qcPreset,
    preset_source: "profile_rules_v1",
    policy_tags: policyTags
  };
}

function visemeForToken(token: string, emphasis: "low" | "medium" | "high"): ShotViseme {
  const clean = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean.length === 0) {
    return "mouth_closed";
  }
  if (/(oo|oh|ou|ow|o|u)/.test(clean)) {
    return "mouth_round_o";
  }
  if (emphasis === "high" || /[ae]{2,}|[!]/.test(token)) {
    return "mouth_open_wide";
  }
  return clean.length <= 2 ? "mouth_open_small" : "mouth_open_small";
}

function intensityForEmphasis(emphasis: "low" | "medium" | "high"): number {
  if (emphasis === "high") {
    return 1;
  }
  if (emphasis === "medium") {
    return 0.75;
  }
  return 0.5;
}

function applyMouthIntensityProfile(baseIntensity: number, profiles?: ResolvedProfiles): number {
  const scale = profiles?.mascot_acting.mouth_energy ?? profiles?.mascot.mouth_intensity ?? 1;
  return clamp(baseIntensity * scale, 0, 1);
}

function buildVisemeTrack(input: {
  duration: number;
  segment: BeatSegment;
  talkText: string;
  emphasisWords: string[];
  baseExpression: string;
  profiles?: ResolvedProfiles;
}): NonNullable<Shot["character"]["tracks"]["viseme_track"]> {
  const narration = input.talkText.trim() || segmentNarrationText(input.segment);
  const words = narration.split(/\s+/).filter((value) => value.length > 0);
  if (words.length === 0) {
    return [
      { f: 0, viseme: "mouth_closed", intensity: 0 },
      { f: Math.max(0, input.duration - 1), viseme: "mouth_closed", intensity: 0 }
    ];
  }

  const framesStart = Math.min(Math.max(2, Math.floor(input.duration * 0.08)), Math.max(2, input.duration - 2));
  const usableSpan = Math.max(1, input.duration - framesStart - 4);
  const emphasisSet = new Set(input.emphasisWords.map((value) => normalizeEmphasisToken(value)).filter((value) => value.length > 0));
  const entries: NonNullable<Shot["character"]["tracks"]["viseme_track"]> = [
    { f: 0, viseme: "mouth_closed", intensity: 0 }
  ];

  words.forEach((word, index) => {
    const t = words.length === 1 ? 0.2 : index / Math.max(1, words.length - 1);
    const peakFrame = clamp(Math.round(framesStart + usableSpan * t), 0, Math.max(0, input.duration - 2));
    const beat = input.segment.beats[Math.min(index, input.segment.beats.length - 1)] ?? input.segment.beats[0];
    const emphasized =
      emphasisSet.has(normalizeEmphasisToken(word)) || /[!?]/.test(word) || word === word.toUpperCase();
    const wordEmphasis = emphasized ? "high" : beat?.emphasis ?? "low";
    const baseIntensity = applyMouthIntensityProfile(intensityForEmphasis(wordEmphasis), input.profiles);
    const viseme = visemeForToken(word, wordEmphasis);

    entries.push({
      f: Math.max(0, peakFrame - 1),
      viseme: index === 0 ? "mouth_open_small" : "mouth_closed",
      intensity: Math.max(0.15, baseIntensity * 0.3)
    });
    entries.push({
      f: peakFrame,
      viseme,
      intensity: viseme === "mouth_open_wide" ? Math.max(baseIntensity, 0.85) : baseIntensity
    });
  });

  const finalHold = clamp(Math.max(0, input.duration - 1), 0, Math.max(0, input.duration - 1));
  entries.push({
    f: finalHold,
    viseme: input.baseExpression === "blink" ? "mouth_closed" : "mouth_closed",
    intensity: 0
  });

  return normalizeTrackEntries(entries);
}

function buildBlinkCues(input: {
  duration: number;
  segment: BeatSegment;
  phraseAnchors: PhraseCueAnchor[];
  profiles?: ResolvedProfiles;
}): ShotActingPlan["blink_cues"] {
  const blinkFrames = [Math.floor(input.duration * 0.14)];
  for (let index = 1; index < input.phraseAnchors.length; index += 1) {
    const prev = input.phraseAnchors[index - 1];
    const next = input.phraseAnchors[index];
    blinkFrames.push(Math.round((prev.f + next.f) / 2));
  }
  if (input.phraseAnchors.length <= 1) {
    blinkFrames.push(Math.floor(input.duration * 0.56));
  }
  if (segmentHasEmphasis(input.segment, "high") || input.phraseAnchors.some((anchor) => anchor.emphasis)) {
    blinkFrames.push(Math.floor(input.duration * 0.82));
  }
  if ((input.profiles?.mascot_acting.blink_density ?? input.profiles?.mascot.blink_density ?? 1) > 1.12) {
    blinkFrames.push(Math.floor(input.duration * 0.68));
  }
  if ((input.profiles?.mascot_acting.blink_density ?? input.profiles?.mascot.blink_density ?? 1) < 0.88 && blinkFrames.length > 1) {
    blinkFrames.pop();
  }
  return normalizeTrackEntries(
    blinkFrames.map((frame, index) => ({
      f: clamp(frame + index, 2, Math.max(2, input.duration - 4)),
      duration_frames: 3,
      intensity: segmentHasEmphasis(input.segment, "high") ? 1 : 0.7
    }))
  );
}

function buildLookCueTrack(input: {
  duration: number;
  hasChart: boolean;
  pointTrack: Shot["character"]["tracks"]["point_track"];
  phraseAnchors: PhraseCueAnchor[];
}): ShotActingPlan["look_cues"] {
  const entries: ShotActingPlan["look_cues"] = [{ f: 0, target: "viewer", intensity: 0.8 }];
  if (input.hasChart) {
    entries.push({ f: Math.floor(input.duration * 0.28), target: "chart", intensity: 1 });
  } else {
    input.phraseAnchors.forEach((anchor, index) => {
      const sideTarget: ShotLookTarget = index % 2 === 0 ? "left" : "right";
      entries.push({
        f: anchor.f,
        target: anchor.emphasis || index === input.phraseAnchors.length - 1 ? "viewer" : sideTarget,
        intensity: anchor.emphasis ? 0.82 : 0.45
      });
    });
    entries.push({ f: Math.floor(input.duration * 0.62), target: "viewer", intensity: 0.7 });
  }
  for (const point of input.pointTrack ?? []) {
    entries.push({ f: point.f, target: "chart", intensity: 1 });
  }
  return normalizeTrackEntries(entries);
}

function buildGestureCues(input: {
  duration: number;
  segment: BeatSegment;
  pointTrack: Shot["character"]["tracks"]["point_track"];
  phraseAnchors: PhraseCueAnchor[];
  profiles?: ResolvedProfiles;
}): ShotActingPlan["gesture_cues"] {
  const entries: ShotActingPlan["gesture_cues"] = [];
  const vocabulary = new Set<MascotGestureCue>(
    input.profiles?.mascot_acting.gesture_vocabulary ??
      input.profiles?.mascot.gesture_vocabulary ?? [
      "idle_shift",
      "emphasis_beat",
      "point_left",
      "point_right"
    ]
  );
  const resolveCue = (cue: MascotGestureCue): MascotGestureCue => {
    if (vocabulary.has(cue)) {
      return cue;
    }
    if (cue.startsWith("point") && vocabulary.has("emphasis_beat")) {
      return "emphasis_beat";
    }
    if (vocabulary.has("idle_shift")) {
      return "idle_shift";
    }
    return [...vocabulary][0] ?? "idle_shift";
  };
  for (const point of input.pointTrack ?? []) {
    entries.push({
      f: point.f,
      cue: resolveCue(point.hand === "left" ? "point_left" : "point_right"),
      intensity: 0.9
    });
  }
  if (entries.length === 0) {
    const phraseGestures = input.phraseAnchors
      .filter((anchor) => anchor.emphasis || anchor.question)
      .map((anchor) => ({
        f: anchor.f,
        cue: resolveCue("emphasis_beat"),
        intensity: anchor.question ? 0.7 : 0.9
      }));
    entries.push(...phraseGestures);
  }
  if (entries.length === 0) {
    entries.push({
      f: Math.floor(input.duration * 0.4),
      cue: resolveCue(segmentHasEmphasis(input.segment, "high") ? "emphasis_beat" : "idle_shift"),
      intensity: segmentHasEmphasis(input.segment, "high") ? 0.85 : 0.4
    });
  }
  return normalizeTrackEntries(entries);
}

function buildExpressionCues(input: {
  duration: number;
  segment: BeatSegment;
  baseExpression: string;
  blinkCues: ShotActingPlan["blink_cues"];
  phraseAnchors: PhraseCueAnchor[];
  profiles?: ResolvedProfiles;
}): {
  cues: ShotActingPlan["expression_cues"];
  track: Shot["character"]["tracks"]["expression_track"];
} {
  const fallbackTone = input.profiles?.mascot.default_emotional_tone ?? "neutral";
  const baseExpression =
    input.baseExpression === "excited"
      ? "happy"
      : input.baseExpression === "focused"
        ? fallbackTone === "warm"
          ? "happy"
          : "neutral"
        : input.baseExpression;
  const cues: ShotActingPlan["expression_cues"] = [
    {
      f: 0,
      expression: baseExpression,
      intensity: intensityForEmphasis(input.segment.beats[0]?.emphasis ?? "low")
    }
  ];

  if (segmentHasEmphasis(input.segment, "high")) {
    cues.push({
      f: Math.floor(input.duration * 0.32),
      expression: "surprised",
      intensity: 1
    });
    cues.push({
      f: Math.floor(input.duration * 0.48),
      expression: "happy",
      intensity: 0.9
    });
  } else if (segmentHasEmphasis(input.segment, "medium")) {
    cues.push({
      f: Math.floor(input.duration * 0.4),
      expression: "happy",
      intensity: 0.7
    });
  }

  for (const anchor of input.phraseAnchors) {
    if (!anchor.emphasis && !anchor.question && !anchor.exclamation) {
      continue;
    }
    const expression = anchor.question ? "surprised" : anchor.exclamation ? "happy" : "surprised";
    cues.push({
      f: anchor.f,
      expression,
      intensity: anchor.question ? 0.82 : 0.9
    });
    cues.push({
      f: Math.min(input.duration - 1, anchor.f + 10),
      expression: baseExpression,
      intensity: 0.6
    });
  }

  for (const blink of input.blinkCues) {
    cues.push({
      f: blink.f,
      expression: "blink",
      intensity: blink.intensity
    });
    cues.push({
      f: Math.min(input.duration - 1, blink.f + blink.duration_frames),
      expression: baseExpression,
      intensity: 0.6
    });
  }

  const normalized = normalizeTrackEntries(cues);
  return {
    cues: normalized,
    track: normalized.map((cue) => ({
      f: cue.f,
      expression: cue.expression
    }))
  };
}

function buildActionTrack(input: {
  duration: number;
  intent: VisualIntent;
  gestureCues: ShotActingPlan["gesture_cues"];
}): Shot["character"]["tracks"]["action_track"] {
  const entries: Shot["character"]["tracks"]["action_track"] = [
    {
      f: 0,
      clip: actionClipFromIntent(input.intent),
      weight: 1
    }
  ];
  for (const cue of input.gestureCues) {
    entries.push({
      f: cue.f,
      clip: cue.cue.includes("point") ? "explain" : cue.cue.includes("emphasis") ? "idle_talk" : actionClipFromIntent(input.intent),
      weight: cue.intensity
    });
  }
  return normalizeTrackEntries(entries);
}

function buildLookTrack(cues: ShotActingPlan["look_cues"]): Shot["character"]["tracks"]["look_track"] {
  return normalizeTrackEntries(
    cues.map((cue) => ({
      f: cue.f,
      target: cue.target
    }))
  );
}

function buildShotActing(input: {
  duration: number;
  segment: BeatSegment;
  intent: VisualIntent;
  hasChart: boolean;
  pointTrack: Shot["character"]["tracks"]["point_track"];
  baseExpression: string;
  talkText: string;
  emphasisWords: string[];
  profiles?: ResolvedProfiles;
}): {
  acting: ShotActingPlan;
  actionTrack: Shot["character"]["tracks"]["action_track"];
  expressionTrack: Shot["character"]["tracks"]["expression_track"];
  lookTrack: Shot["character"]["tracks"]["look_track"];
  visemeTrack: NonNullable<Shot["character"]["tracks"]["viseme_track"]>;
} {
  const phraseAnchors = buildPhraseCueAnchors({
    duration: input.duration,
    talkText: input.talkText,
    emphasisWords: input.emphasisWords
  });
  const blinkCues = buildBlinkCues({
    duration: input.duration,
    segment: input.segment,
    phraseAnchors,
    profiles: input.profiles
  });
  const lookCues = buildLookCueTrack({
    duration: input.duration,
    hasChart: input.hasChart,
    pointTrack: input.pointTrack,
    phraseAnchors
  });
  const gestureCues = buildGestureCues({
    duration: input.duration,
    segment: input.segment,
    pointTrack: input.pointTrack,
    phraseAnchors,
    profiles: input.profiles
  });
  const expressionPlan = buildExpressionCues({
    duration: input.duration,
    segment: input.segment,
    baseExpression: input.baseExpression,
    blinkCues,
    phraseAnchors,
    profiles: input.profiles
  });
  const visemeTrack = buildVisemeTrack({
    duration: input.duration,
    segment: input.segment,
    talkText: input.talkText,
    emphasisWords: input.emphasisWords,
    baseExpression: input.baseExpression,
    profiles: input.profiles
  });

  return {
    acting: {
      blink_cues: blinkCues,
      gesture_cues: gestureCues,
      look_cues: lookCues,
      expression_cues: expressionPlan.cues,
      mouth_cues: visemeTrack.map((entry) => ({
        f: entry.f,
        viseme: entry.viseme,
        intensity: entry.intensity
      }))
    },
    actionTrack: buildActionTrack({
      duration: input.duration,
      intent: input.intent,
      gestureCues
    }),
    expressionTrack: expressionPlan.track,
    lookTrack: buildLookTrack(lookCues),
    visemeTrack
  };
}

function defaultViewForShot(input: {
  shotType: ShotType;
  intent: VisualIntent;
  profiles?: ResolvedProfiles;
}): ShotView {
  const preferredView = input.profiles?.mascot.preferred_view;
  if (input.shotType === "transition") {
    return "profile";
  }
  if (input.shotType === "reaction" || input.shotType === "broll") {
    return "threeQuarter";
  }
  if (input.intent === "bridge") {
    return "threeQuarter";
  }
  return preferredView ?? "front";
}

function shotDurationFrames(
  segment: BeatSegment,
  transition: ShotTransition,
  beatFrames: Map<string, number>,
  options: ResolvedCompileShotsOptions
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

  const options: ResolvedCompileShotsOptions = { ...DEFAULTS, ...rawOptions };
  const beatFrames = new Map<string, number>();
  for (const beat of beats) {
    beatFrames.set(beat.id, estimateBeatFrames(beat, options));
  }
  const beatById = new Map(beats.map((beat) => [beat.id, beat] as const));

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
    const shotType = shotTypeForSegment(segment, hasChart, transition);
    const renderMode = renderModeForShot({
      shotType,
      hasChart,
      durationFrames: duration,
      cameraPreset
    });
    const talkText = deriveTalkText(segment, duration);
    const emphasisWords = deriveEmphasisWords(segment, talkText);
    const requiredView = defaultViewForShot({
      shotType,
      intent,
      profiles: rawOptions.profiles
    });
    const sidecarPreset = resolveShotSidecarPreset({
      renderMode,
      shotType,
      requiredView,
      cameraPreset,
      profiles: rawOptions.profiles
    });
    const baseExpression = expressionFromSegment(segment);
    const actingPlan = buildShotActing({
      duration,
      segment,
      intent,
      hasChart,
      pointTrack,
      baseExpression,
      talkText,
      emphasisWords,
      profiles: rawOptions.profiles
    });
    const educationalIntent = educationalIntentFromSegment({
      segment,
      intent,
      hasChart,
      profiles: rawOptions.profiles
    });
    const chartBackboneSelection = hasChart
      ? resolveLegacyChartVisualSelection({
          segment,
          educationalIntent,
          profiles: rawOptions.profiles
        })
      : undefined;
    const insertNeedCandidates = insertNeedsForShot({
      segment,
      shotType,
      renderMode,
      intent,
      hasChart,
      profiles: rawOptions.profiles
    });
    const visualIntentPlan = resolveVisualIntentPlan({
      segment,
      educationalIntent,
      hasChart,
      insertNeeds: insertNeedCandidates,
      chartBackboneSelection,
      profiles: rawOptions.profiles
    });
    const primaryVisualSelection = resolvePrimaryVisualSelection({
      segment,
      educationalIntent,
      hasChart,
      insertNeeds:
        visualIntentPlan.selectedIntent.candidate_insert_types.length > 0
          ? visualIntentPlan.selectedIntent.candidate_insert_types
          : insertNeedCandidates,
      chartBackboneSelection,
      plannerCandidateKinds: visualIntentPlan.selectedIntent.candidate_primary_kinds,
      profiles: rawOptions.profiles
    });
    const insertSelection = resolveInsertAssetSelection({
      insertNeeds:
        visualIntentPlan.selectedIntent.candidate_insert_types.length > 0
          ? visualIntentPlan.selectedIntent.candidate_insert_types
          : insertNeedCandidates,
      hasChart,
      segment,
      educationalIntent,
      primarySelection: primaryVisualSelection,
      supportingCandidateKinds: visualIntentPlan.selectedIntent.candidate_supporting_kinds,
      profiles: rawOptions.profiles
    });
    const visualPlan = buildShotVisualPlan({
      educationalIntent,
      channelDomain: rawOptions.profiles?.channel.domain ?? "economy",
      insertNeedCandidates,
      selectedIntent: visualIntentPlan.selectedIntent,
      candidateIntents: visualIntentPlan.candidateIntents,
      primarySelection: primaryVisualSelection,
      insertSelection
    });
    const routeInsertNeeds = resolveRouteInsertNeeds({
      visualPlan,
      insertSelection,
      insertNeedCandidates
    });
    const insertAsset = buildInsertAsset({
      shotId,
      segment,
      talkText,
      emphasisWords,
      insertSelection,
      profiles: rawOptions.profiles
    });
    const chart = hasChart
      ? {
          chart_id: `chart_${String(i + 1).padStart(3, "0")}`,
          type: chartVisualObjectKindToLegacyType(
            isChartFamilyKind(primaryVisualSelection?.selected_kind)
              ? primaryVisualSelection?.selected_kind
              : chartBackboneSelection?.selected_kind ?? "bar_chart"
          ),
          ...(firstRef?.datasetId ? { dataset_id: firstRef.datasetId } : {}),
          time_range: "full",
          layout_preset: layoutPresetForChartKind(
            isChartFamilyKind(primaryVisualSelection?.selected_kind)
              ? primaryVisualSelection?.selected_kind
              : chartBackboneSelection?.selected_kind ?? "bar_chart"
          ),
          highlights,
          callouts: [
            {
              f: Math.max(0, Math.floor(duration * 0.35)),
              text: segment.beats[0].onScreen[0] ?? segment.beats[0].intent,
              attach_to_target_id: primaryTargetId
            }
          ]
        }
      : undefined;
    const visualObjects = buildPlannedVisualObjectsForShot({
      shotId,
      chart,
      primarySelection: primaryVisualSelection,
      insertAsset,
      supportingSelection: insertSelection?.supportingSelection,
      profiles: rawOptions.profiles
    });
    const shotGrammar: ShotGrammar = {
      camera_size: cameraSizeForShot({
        shotType,
        intent,
        hasChart,
        profiles: rawOptions.profiles
      }),
      camera_motion: cameraMotionFromPreset(cameraPreset),
      acting_intent: actingIntentFromSegment(segment, intent, rawOptions.profiles),
      emotion_curve: emotionCurveFromSegment(segment),
      primary_speaking_character: "host",
      required_view: requiredView,
      educational_intent: educationalIntent,
      insert_need: insertNeedCandidates,
      route_reason: routeReasonForShot({
        shotType,
        renderMode,
        hasChart,
        intent,
        insertNeeds: routeInsertNeeds,
        profiles: rawOptions.profiles
      })
    };

    const shot: Shot = {
      shot_id: shotId,
      shot_type: shotType,
      render_mode: renderMode,
      ...(sidecarPreset ? { sidecar_preset: sidecarPreset } : {}),
      emphasis_words: emphasisWords,
      talk_text: talkText,
      insert_asset: insertAsset,
      visual_plan: visualPlan,
      visual_objects: visualObjects,
      shot_grammar: shotGrammar,
      acting: actingPlan.acting,
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
      chart,
      character: {
        pack_id: rawOptions.characterPackId?.trim() || "eraser-cat-minimal",
        layer: characterLayer,
        transform: {
          x: posPath[0].x,
          y: posPath[0].y,
          scale: intent === "close" ? 1.06 : intent === "intro" ? 1.02 : 0.98,
          flip_x: intent === "data"
        },
        tracks: {
          pos_path: posPath,
          action_track: actingPlan.actionTrack,
          expression_track: actingPlan.expressionTrack,
          look_track: actingPlan.lookTrack,
          view_track: [
            {
              f: 0,
              view: requiredView
            }
          ],
          viseme_track: actingPlan.visemeTrack,
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

  return expandShotsForGenerativeBroll(shots, beatById, rawOptions.profiles);
}

export function toShotsDocument(episode: EpisodeInput, shots: Shot[], fps: number = 30): ShotsDocument {
  return {
    schema_version: "1.0",
    episode: {
      episode_id: episode.episode_id,
      bible_ref: episode.bible_ref,
      ...(episode.profiles ? { profiles: episode.profiles } : {}),
      ...(episode.data_inputs ? { data_inputs: episode.data_inputs } : {})
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








