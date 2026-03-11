import type { Beat, EpisodeInput } from "./generateBeats";

export type ShotTransition = "cut" | "fade";

type VisualIntent = "intro" | "data" | "bridge" | "close" | "narrative";
type CameraPreset = "static" | "slow_push" | "whip_pan" | "shake_emphasis";

type BeatSegment = {
  intent: VisualIntent;
  beats: Beat[];
};

export const CANONICAL_VISUAL_OBJECT_KINDS = [
  "bar_chart",
  "line_chart",
  "table",
  "kpi_card",
  "summary_card",
  "checklist_card",
  "process_flow",
  "comparison_board",
  "timeline",
  "labeled_diagram",
  "icon_array"
] as const;

export type ShotCanonicalVisualObjectKind = (typeof CANONICAL_VISUAL_OBJECT_KINDS)[number];
export type ShotVisualObjectKind = ShotCanonicalVisualObjectKind | "icon_grid" | "anatomy_diagram";
export type ShotVisualObjectRole = "primary_explainer" | "supporting_explainer" | "accent";
export type ShotChannelDomain = "economy" | "medical" | "generic";
export type ShotEducationalMode = "data_explainer" | "summary_explainer" | "generic";
export type ShotGrammar =
  | "host_intro"
  | "metric_focus"
  | "comparison_explainer"
  | "process_walkthrough"
  | "timeline_bridge"
  | "diagram_explainer"
  | "checklist_recap"
  | "summary_recap";
export type ShotRouteReason =
  | "chart_reference"
  | "metric_focus"
  | "comparison_language"
  | "process_language"
  | "timeline_language"
  | "medical_diagram_language"
  | "checklist_density"
  | "summary_fallback";
export type ShotEducationalIntent =
  | "introduce_topic"
  | "explain_metric"
  | "compare_tradeoffs"
  | "walkthrough_steps"
  | "sequence_events"
  | "explain_structure"
  | "summarize_takeaways";
export type ShotInsertNeed =
  | "none"
  | "summary_support"
  | "checklist_support"
  | "comparison_support"
  | "process_support"
  | "timeline_support"
  | "diagram_support";

export type ShotVisualObject = {
  object_id: string;
  kind: ShotVisualObjectKind;
  semantic_role: ShotVisualObjectRole;
  title?: string;
  body?: string;
  items?: string[];
  data_ref?: {
    chart_id?: string;
    dataset_id?: string;
    time_range?: string;
  };
  selection_reason?: string;
};

export type ShotVisualPlan = {
  resolver_id: "legacy_chart_backbone_v1";
  channel_domain: ShotChannelDomain;
  educational_mode: ShotEducationalMode;
  selected_primary_kind: ShotCanonicalVisualObjectKind;
  selection_reason: string;
};

const VISUAL_OBJECT_KIND_ALIASES: Record<string, ShotCanonicalVisualObjectKind> = {
  icon_grid: "icon_array",
  anatomy_diagram: "labeled_diagram"
};

export function normalizeShotVisualObjectKind(
  kind: ShotVisualObjectKind | undefined
): ShotCanonicalVisualObjectKind | undefined {
  if (!kind) {
    return undefined;
  }
  if (kind in VISUAL_OBJECT_KIND_ALIASES) {
    return VISUAL_OBJECT_KIND_ALIASES[kind];
  }
  return (CANONICAL_VISUAL_OBJECT_KINDS as readonly string[]).includes(kind)
    ? (kind as ShotCanonicalVisualObjectKind)
    : undefined;
}

export function isChartLikeShotVisualObjectKind(kind: ShotVisualObjectKind | undefined): boolean {
  const normalized = normalizeShotVisualObjectKind(kind);
  return normalized === "bar_chart" || normalized === "line_chart";
}

export type Shot = {
  shot_id: string;
  talk_text?: string;
  visual_plan?: ShotVisualPlan;
  visual_objects?: ShotVisualObject[];
  shot_grammar: ShotGrammar;
  route_reason: ShotRouteReason;
  educational_intent: ShotEducationalIntent;
  insert_need: ShotInsertNeed;
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
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

const COMPARISON_KEYWORDS = [
  "compare",
  "versus",
  "vs",
  "higher",
  "lower",
  "better",
  "worse",
  "tradeoff",
  "difference",
  "option"
];

const PROCESS_KEYWORDS = [
  "step",
  "process",
  "workflow",
  "how",
  "first",
  "second",
  "third",
  "finally",
  "then"
];

const TIMELINE_KEYWORDS = [
  "timeline",
  "before",
  "after",
  "over time",
  "sequence",
  "phase",
  "stage",
  "history",
  "trend"
];

const MEDICAL_KEYWORDS = [
  "patient",
  "clinical",
  "diagnosis",
  "therapy",
  "treatment",
  "symptom",
  "disease",
  "dose",
  "hospital",
  "anatomy",
  "organ",
  "medic"
];

const ECONOMY_KEYWORDS = [
  "inflation",
  "market",
  "gdp",
  "rate",
  "price",
  "stock",
  "jobs",
  "salary",
  "tax",
  "economy",
  "budget",
  "debt"
];

type DirectedVisualDecision = {
  channelDomain: ShotChannelDomain;
  educationalIntent: ShotEducationalIntent;
  routeReason: ShotRouteReason;
  shotGrammar: ShotGrammar;
  insertNeed: ShotInsertNeed;
  primaryKind: ShotCanonicalVisualObjectKind;
  supportingKind?: ShotCanonicalVisualObjectKind;
};

function containsAnyKeyword(text: string, keywords: readonly string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function inferChannelDomain(input: { datasetId?: string; cueItems: string[]; narration: string }): ShotChannelDomain {
  const source = `${input.datasetId ?? ""} ${input.narration} ${input.cueItems.join(" ")}`.toLowerCase();
  if (containsAnyKeyword(source, MEDICAL_KEYWORDS)) {
    return "medical";
  }
  if (containsAnyKeyword(source, ECONOMY_KEYWORDS)) {
    return "economy";
  }
  return "generic";
}

function inferDominantChannelDomain(beats: Beat[]): ShotChannelDomain {
  const datasetIdSource = beats
    .flatMap((beat) => beat.references ?? [])
    .map((reference) => reference.datasetId?.trim() ?? "")
    .filter((datasetId) => datasetId.length > 0)
    .join(" ");
  const cueItems = uniqueStrings(beats.flatMap((beat) => beat.onScreen ?? []));
  const narration = beats
    .map((beat) => beat.narration.trim())
    .filter((entry) => entry.length > 0)
    .join(" ");

  return inferChannelDomain({
    datasetId: datasetIdSource,
    cueItems,
    narration
  });
}

function inferRouteReason(input: {
  intent: VisualIntent;
  hasChart: boolean;
  cueItems: string[];
  narration: string;
  channelDomain: ShotChannelDomain;
}): ShotRouteReason {
  const source = `${input.narration} ${input.cueItems.join(" ")}`.toLowerCase();
  if (input.hasChart) {
    if (containsAnyKeyword(source, COMPARISON_KEYWORDS)) {
      return "comparison_language";
    }
    return input.intent === "data" ? "metric_focus" : "chart_reference";
  }
  if (input.channelDomain === "medical" && containsAnyKeyword(source, MEDICAL_KEYWORDS)) {
    return "medical_diagram_language";
  }
  if (containsAnyKeyword(source, COMPARISON_KEYWORDS)) {
    return "comparison_language";
  }
  if (containsAnyKeyword(source, PROCESS_KEYWORDS)) {
    return "process_language";
  }
  if (input.intent === "bridge" || containsAnyKeyword(source, TIMELINE_KEYWORDS)) {
    return "timeline_language";
  }
  if (input.cueItems.length >= 3) {
    return "checklist_density";
  }
  return "summary_fallback";
}

function inferEducationalIntent(input: {
  intent: VisualIntent;
  routeReason: ShotRouteReason;
}): ShotEducationalIntent {
  if (input.routeReason === "comparison_language") {
    return "compare_tradeoffs";
  }
  if (input.routeReason === "chart_reference" || input.routeReason === "metric_focus") {
    return "explain_metric";
  }
  if (input.routeReason === "process_language") {
    return "walkthrough_steps";
  }
  if (input.routeReason === "timeline_language") {
    return "sequence_events";
  }
  if (input.routeReason === "medical_diagram_language") {
    return "explain_structure";
  }
  if (input.intent === "intro") {
    return "introduce_topic";
  }
  return "summarize_takeaways";
}

function inferShotGrammar(input: {
  intent: VisualIntent;
  routeReason: ShotRouteReason;
  educationalIntent: ShotEducationalIntent;
}): ShotGrammar {
  if (input.routeReason === "chart_reference" || input.routeReason === "metric_focus") {
    return "metric_focus";
  }
  if (input.routeReason === "comparison_language") {
    return "comparison_explainer";
  }
  if (input.routeReason === "process_language") {
    return "process_walkthrough";
  }
  if (input.routeReason === "timeline_language") {
    return "timeline_bridge";
  }
  if (input.routeReason === "medical_diagram_language") {
    return "diagram_explainer";
  }
  if (input.intent === "intro") {
    return "host_intro";
  }
  if (input.routeReason === "checklist_density") {
    return "checklist_recap";
  }
  return input.educationalIntent === "summarize_takeaways" ? "summary_recap" : "metric_focus";
}

function inferDirectedPrimaryVisualKind(input: {
  hasChart: boolean;
  chartType?: string;
  cueItems: string[];
  routeReason: ShotRouteReason;
  shotGrammar: ShotGrammar;
  channelDomain: ShotChannelDomain;
}): ShotCanonicalVisualObjectKind {
  if (input.hasChart) {
    const normalizedChartType = input.chartType?.trim().toLowerCase() ?? "";
    if (normalizedChartType.includes("line") || normalizedChartType.includes("trend")) {
      return "line_chart";
    }
    return "bar_chart";
  }
  if (input.routeReason === "medical_diagram_language" || input.shotGrammar === "diagram_explainer") {
    return "labeled_diagram";
  }
  if (input.routeReason === "comparison_language" || input.shotGrammar === "comparison_explainer") {
    return "comparison_board";
  }
  if (input.routeReason === "process_language" || input.shotGrammar === "process_walkthrough") {
    return "process_flow";
  }
  if (input.routeReason === "timeline_language" || input.shotGrammar === "timeline_bridge") {
    return "timeline";
  }
  if (input.cueItems.length >= 3) {
    return "checklist_card";
  }
  if (input.channelDomain === "economy" && input.cueItems.length <= 1) {
    return "kpi_card";
  }
  return "summary_card";
}

function inferInsertNeed(input: {
  hasChart: boolean;
  primaryKind: ShotCanonicalVisualObjectKind;
  routeReason: ShotRouteReason;
  cueItems: string[];
}): ShotInsertNeed {
  if (input.hasChart && input.routeReason === "comparison_language") {
    return "comparison_support";
  }
  if (input.hasChart && input.routeReason === "process_language") {
    return "process_support";
  }
  if (input.hasChart && input.routeReason === "timeline_language") {
    return "timeline_support";
  }
  if (input.routeReason === "medical_diagram_language") {
    return "diagram_support";
  }
  if (input.primaryKind === "checklist_card" || input.routeReason === "checklist_density") {
    return "checklist_support";
  }
  if (input.cueItems.length > 0 && (input.primaryKind === "bar_chart" || input.primaryKind === "line_chart")) {
    return "summary_support";
  }
  return "none";
}

function supportingKindForDecision(decision: DirectedVisualDecision): ShotCanonicalVisualObjectKind | undefined {
  if (decision.insertNeed === "comparison_support") {
    return "comparison_board";
  }
  if (decision.insertNeed === "process_support") {
    return "process_flow";
  }
  if (decision.insertNeed === "timeline_support") {
    return "timeline";
  }
  if (decision.insertNeed === "diagram_support") {
    return "labeled_diagram";
  }
  if (decision.insertNeed === "checklist_support") {
    return decision.primaryKind === "checklist_card" ? "summary_card" : "checklist_card";
  }
  if (decision.insertNeed === "summary_support") {
    return "summary_card";
  }
  return undefined;
}

function titleForVisualKind(kind: ShotCanonicalVisualObjectKind, channelDomain: ShotChannelDomain): string {
  if (kind === "line_chart") {
    return "Trend View";
  }
  if (kind === "bar_chart") {
    return "Metric Snapshot";
  }
  if (kind === "comparison_board") {
    return "Tradeoff Board";
  }
  if (kind === "process_flow") {
    return "Process Flow";
  }
  if (kind === "timeline") {
    return "Timeline";
  }
  if (kind === "labeled_diagram") {
    return channelDomain === "medical" ? "Clinical Diagram" : "Labeled Diagram";
  }
  if (kind === "kpi_card") {
    return "Key Metric";
  }
  if (kind === "checklist_card") {
    return "Key Checklist";
  }
  return "Summary";
}

function buildLegacyVisualContract(input: {
  shotId: string;
  intent: VisualIntent;
  hasChart: boolean;
  chartType?: string;
  chartId?: string;
  datasetId?: string;
  timeRange?: string;
  cueItems: string[];
  title?: string;
  narration: string;
  fallbackChannelDomain?: ShotChannelDomain;
}): {
  visualPlan: ShotVisualPlan;
  visualObjects: ShotVisualObject[];
  channelDomain: ShotChannelDomain;
  educationalIntent: ShotEducationalIntent;
  routeReason: ShotRouteReason;
  insertNeed: ShotInsertNeed;
  shotGrammar: ShotGrammar;
} {
  const channelDomain = inferChannelDomain({
    datasetId: input.datasetId,
    cueItems: input.cueItems,
    narration: input.narration
  });
  const resolvedChannelDomain = channelDomain === "generic" ? (input.fallbackChannelDomain ?? channelDomain) : channelDomain;
  const routeReason = inferRouteReason({
    intent: input.intent,
    hasChart: input.hasChart,
    cueItems: input.cueItems,
    narration: input.narration,
    channelDomain: resolvedChannelDomain
  });
  const educationalIntent = inferEducationalIntent({
    intent: input.intent,
    routeReason
  });
  const shotGrammar = inferShotGrammar({
    intent: input.intent,
    routeReason,
    educationalIntent
  });
  const primaryKind = inferDirectedPrimaryVisualKind({
    hasChart: input.hasChart,
    chartType: input.chartType,
    cueItems: input.cueItems,
    routeReason,
    shotGrammar,
    channelDomain: resolvedChannelDomain
  });
  const insertNeed = inferInsertNeed({
    hasChart: input.hasChart,
    primaryKind,
    routeReason,
    cueItems: input.cueItems
  });
  const supportingKind = supportingKindForDecision({
    channelDomain: resolvedChannelDomain,
    educationalIntent,
    routeReason,
    shotGrammar,
    insertNeed,
    primaryKind
  });
  const title =
    input.title?.trim() || titleForVisualKind(primaryKind, resolvedChannelDomain);
  const selectionReason = `route:${routeReason}|intent:${educationalIntent}|grammar:${shotGrammar}`;

  const visualObjects: ShotVisualObject[] = [
    {
      object_id: `${input.shotId}__primary`,
      kind: primaryKind,
      semantic_role: "primary_explainer",
      title,
      body: input.narration,
      items: input.cueItems.length > 0 ? input.cueItems.slice(0, 4) : undefined,
      data_ref: input.hasChart
        ? {
            chart_id: input.chartId,
            dataset_id: input.datasetId,
            time_range: input.timeRange
          }
        : undefined,
      selection_reason: selectionReason
    }
  ];

  if (supportingKind) {
    visualObjects.push({
      object_id: `${input.shotId}__supporting`,
      kind: supportingKind,
      semantic_role: "supporting_explainer",
      title: titleForVisualKind(supportingKind, resolvedChannelDomain),
      body: input.narration,
      items: input.cueItems.slice(0, 4),
      data_ref: input.hasChart
        ? {
            chart_id: input.chartId,
            dataset_id: input.datasetId,
            time_range: input.timeRange
          }
        : undefined,
      selection_reason: `support:${insertNeed}`
    });
  }

  return {
    visualPlan: {
      resolver_id: "legacy_chart_backbone_v1",
      channel_domain: resolvedChannelDomain,
      educational_mode:
        educationalIntent === "introduce_topic"
          ? "generic"
          : educationalIntent === "summarize_takeaways" || educationalIntent === "sequence_events"
            ? "summary_explainer"
            : "data_explainer",
      selected_primary_kind: primaryKind,
      selection_reason: selectionReason
    },
    visualObjects,
    channelDomain: resolvedChannelDomain,
    educationalIntent,
    routeReason,
    insertNeed,
    shotGrammar
  };
}

function actionClipForDirection(input: {
  intent: VisualIntent;
  shotGrammar: ShotGrammar;
  educationalIntent: ShotEducationalIntent;
}): string {
  if (input.shotGrammar === "host_intro") {
    return "greet";
  }
  if (input.shotGrammar === "timeline_bridge" || input.shotGrammar === "process_walkthrough") {
    return "move";
  }
  if (input.shotGrammar === "checklist_recap" || input.shotGrammar === "summary_recap") {
    return input.intent === "close" ? "conclude" : "explain";
  }
  if (input.educationalIntent === "compare_tradeoffs" || input.educationalIntent === "explain_structure") {
    return "explain";
  }
  return actionClipFromIntent(input.intent);
}

function expressionForDirection(
  segment: BeatSegment,
  educationalIntent: ShotEducationalIntent,
  routeReason: ShotRouteReason
): string {
  if (segment.beats.some((beat) => beat.emphasis === "high")) {
    return "excited";
  }
  if (
    educationalIntent === "compare_tradeoffs" ||
    educationalIntent === "explain_metric" ||
    educationalIntent === "explain_structure" ||
    routeReason === "chart_reference"
  ) {
    return "focused";
  }
  if (educationalIntent === "walkthrough_steps" || educationalIntent === "sequence_events") {
    return "neutral";
  }
  return expressionFromSegment(segment);
}

function appendTrackEntry<T extends { f: number }>(
  entries: T[],
  entry: T,
  isSame: (left: T, right: T) => boolean
) {
  const last = entries[entries.length - 1];
  if (!last || !isSame(last, entry)) {
    entries.push(entry);
  }
}

function buildActionTrack(input: {
  duration: number;
  intent: VisualIntent;
  shotGrammar: ShotGrammar;
  educationalIntent: ShotEducationalIntent;
  insertNeed: ShotInsertNeed;
}): Shot["character"]["tracks"]["action_track"] {
  const { duration, intent, shotGrammar, educationalIntent, insertNeed } = input;
  const entries: Shot["character"]["tracks"]["action_track"] = [];
  const startClip = actionClipForDirection({
    intent,
    shotGrammar,
    educationalIntent
  });
  appendTrackEntry(entries, { f: 0, clip: startClip, weight: 1 }, (left, right) => left.clip === right.clip);

  const supportClip =
    shotGrammar === "process_walkthrough" || shotGrammar === "timeline_bridge"
      ? "move"
      : shotGrammar === "summary_recap" || shotGrammar === "checklist_recap"
        ? "conclude"
        : shotGrammar === "comparison_explainer" || shotGrammar === "diagram_explainer" || insertNeed !== "none"
          ? "explain"
          : startClip;
  if (duration >= 36) {
    appendTrackEntry(
      entries,
      {
        f: Math.floor(duration * 0.34),
        clip: supportClip,
        weight: supportClip === startClip ? 0.96 : 0.92
      },
      (left, right) => left.clip === right.clip
    );
  }

  const closingClip =
    shotGrammar === "host_intro"
      ? "explain"
      : educationalIntent === "summarize_takeaways" || insertNeed !== "none"
        ? "conclude"
        : supportClip;
  if (duration >= 54) {
    appendTrackEntry(
      entries,
      {
        f: Math.floor(duration * 0.72),
        clip: closingClip,
        weight: closingClip === "conclude" ? 0.88 : 0.9
      },
      (left, right) => left.clip === right.clip
    );
  }

  return entries;
}

function buildExpressionTrack(input: {
  duration: number;
  segment: BeatSegment;
  educationalIntent: ShotEducationalIntent;
  routeReason: ShotRouteReason;
  shotGrammar: ShotGrammar;
  insertNeed: ShotInsertNeed;
}): Shot["character"]["tracks"]["expression_track"] {
  const { duration, segment, educationalIntent, routeReason, shotGrammar, insertNeed } = input;
  const entries: Shot["character"]["tracks"]["expression_track"] = [];
  const startExpression = expressionForDirection(segment, educationalIntent, routeReason);
  appendTrackEntry(
    entries,
    { f: 0, expression: startExpression },
    (left, right) => left.expression === right.expression
  );

  const supportExpression =
    routeReason === "chart_reference" ||
    routeReason === "metric_focus" ||
    routeReason === "comparison_language" ||
    routeReason === "medical_diagram_language" ||
    insertNeed !== "none"
      ? "focused"
      : educationalIntent === "walkthrough_steps" || educationalIntent === "sequence_events"
        ? "neutral"
        : startExpression;
  if (duration >= 32) {
    appendTrackEntry(
      entries,
      { f: Math.floor(duration * 0.28), expression: supportExpression },
      (left, right) => left.expression === right.expression
    );
  }

  const closingExpression =
    shotGrammar === "summary_recap" || shotGrammar === "checklist_recap" || educationalIntent === "summarize_takeaways"
      ? "neutral"
      : startExpression === "excited" && insertNeed === "none"
        ? "focused"
        : supportExpression;
  if (duration >= 52) {
    appendTrackEntry(
      entries,
      { f: Math.floor(duration * 0.7), expression: closingExpression },
      (left, right) => left.expression === right.expression
    );
  }

  return entries;
}

function buildLookTrack(input: {
  duration: number;
  hasChart: boolean;
  shotGrammar: ShotGrammar;
  educationalIntent: ShotEducationalIntent;
  insertNeed: ShotInsertNeed;
}): Shot["character"]["tracks"]["look_track"] {
  const { duration, hasChart, shotGrammar, educationalIntent, insertNeed } = input;
  const entries: Shot["character"]["tracks"]["look_track"] = [];
  const startTarget =
    hasChart ? "chart" : insertNeed !== "none" || shotGrammar !== "host_intro" ? "visual" : "viewer";
  appendTrackEntry(entries, { f: 0, target: startTarget }, (left, right) => left.target === right.target);

  if (hasChart) {
    appendTrackEntry(
      entries,
      { f: Math.floor(duration * 0.2), target: "chart" },
      (left, right) => left.target === right.target
    );
  } else if (insertNeed !== "none" || shotGrammar !== "host_intro") {
    appendTrackEntry(
      entries,
      { f: Math.floor(duration * 0.24), target: "visual" },
      (left, right) => left.target === right.target
    );
  }

  if (shotGrammar === "summary_recap" || shotGrammar === "checklist_recap") {
    appendTrackEntry(
      entries,
      { f: Math.floor(duration * 0.56), target: "narration" },
      (left, right) => left.target === right.target
    );
  } else if (educationalIntent === "compare_tradeoffs" && hasChart) {
    appendTrackEntry(
      entries,
      { f: Math.floor(duration * 0.54), target: "chart" },
      (left, right) => left.target === right.target
    );
  }

  const closingTarget =
    shotGrammar === "host_intro"
      ? "viewer"
      : educationalIntent === "summarize_takeaways"
        ? "narration"
        : insertNeed !== "none" || hasChart
          ? "viewer"
          : "visual";
  if (duration >= 44) {
    appendTrackEntry(
      entries,
      { f: Math.floor(duration * 0.82), target: closingTarget },
      (left, right) => left.target === right.target
    );
  }

  return entries;
}

function shouldEnablePointTrack(input: {
  hasChart: boolean;
  hasReference: boolean;
  educationalIntent: ShotEducationalIntent;
  shotGrammar: ShotGrammar;
  insertNeed: ShotInsertNeed;
}): boolean {
  if (
    input.hasChart &&
    (input.educationalIntent === "explain_metric" ||
      input.educationalIntent === "compare_tradeoffs" ||
      input.hasReference)
  ) {
    return true;
  }

  return (
    input.insertNeed !== "none" ||
    input.shotGrammar === "comparison_explainer" ||
    input.shotGrammar === "process_walkthrough" ||
    input.shotGrammar === "timeline_bridge" ||
    input.shotGrammar === "diagram_explainer"
  );
}

function tuneCameraPresetForDirection(
  preset: CameraPreset,
  shotGrammar: ShotGrammar,
  rng: () => number
): CameraPreset {
  if (shotGrammar === "comparison_explainer") {
    return preset === "whip_pan" ? (rng() < 0.65 ? "slow_push" : "static") : preset;
  }
  if (shotGrammar === "process_walkthrough" || shotGrammar === "timeline_bridge") {
    return preset === "static" ? "slow_push" : preset;
  }
  if (shotGrammar === "diagram_explainer" || shotGrammar === "summary_recap" || shotGrammar === "checklist_recap") {
    return preset === "shake_emphasis" || preset === "whip_pan" ? "slow_push" : preset;
  }
  return preset;
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
  hasChart: boolean;
  shotGrammar: ShotGrammar;
  insertNeed: ShotInsertNeed;
  primaryTargetId: string;
  secondaryTargetId: string;
  rng: () => number;
}): Shot["character"]["tracks"]["point_track"] {
  const { duration, intent, hasChart, shotGrammar, insertNeed, primaryTargetId, secondaryTargetId, rng } = input;

  const baseHand: "left" | "right" = rng() < 0.18 ? "left" : "right";

  if (hasChart && intent === "data") {
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

  if (!hasChart) {
    const primaryVisualTarget =
      shotGrammar === "comparison_explainer"
        ? "visual_compare"
        : shotGrammar === "process_walkthrough"
          ? "process_focus"
          : shotGrammar === "timeline_bridge"
            ? "timeline_focus"
            : shotGrammar === "diagram_explainer"
              ? "diagram_focus"
              : insertNeed === "checklist_support"
                ? "checklist_focus"
                : insertNeed === "summary_support"
                  ? "summary_focus"
                  : "visual_focus";
    const supportTarget = insertNeed !== "none" ? "support_insert" : primaryVisualTarget;
    return [
      {
        f: Math.floor(duration * 0.3),
        target_id: primaryVisualTarget,
        hand: baseHand
      },
      {
        f: Math.floor(duration * 0.58),
        target_id: supportTarget,
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

function resolveCharacterPackId(channelDomain: ShotChannelDomain): string {
  if (channelDomain === "medical") {
    return "med-dog-minimal";
  }
  return "eraser-cat-minimal";
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
  const dominantChannelDomain = inferDominantChannelDomain(beats);

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

    const baseCameraPreset = presetForIntent(intent, rng);

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
    const talkText = segment.beats
      .map((beat) => beat.narration.trim())
      .filter((entry) => entry.length > 0)
      .join(" ");
    const cueItems = uniqueStrings(segment.beats.flatMap((beat) => beat.onScreen ?? []));
    const chartId = `chart_${String(i + 1).padStart(3, "0")}`;
    const legacyVisualContract = buildLegacyVisualContract({
      shotId,
      intent,
      hasChart,
      chartType: hasChart ? "bar" : undefined,
      chartId,
      datasetId: firstRef?.datasetId ?? "dataset_main",
      timeRange: "full",
      cueItems,
      title: segment.beats[0]?.onScreen?.[0],
      narration: talkText,
      fallbackChannelDomain: dominantChannelDomain === "generic" ? undefined : dominantChannelDomain
    });
    const directedCameraPreset = tuneCameraPresetForDirection(
      baseCameraPreset,
      legacyVisualContract.shotGrammar,
      rng
    );
    const directedCameraKeyframes = buildCameraKeyframes({
      intent,
      preset: directedCameraPreset,
      duration,
      baseX: cameraAnchorX,
      baseY: cameraAnchorY,
      baseZoom: cameraAnchorZoom,
      rng
    });
    const enablePointTrack = shouldEnablePointTrack({
      hasChart,
      hasReference,
      educationalIntent: legacyVisualContract.educationalIntent,
      shotGrammar: legacyVisualContract.shotGrammar,
      insertNeed: legacyVisualContract.insertNeed
    });
    const directedPointTrack = enablePointTrack
      ? buildPointTrack({
          duration,
          intent,
          hasChart,
          shotGrammar: legacyVisualContract.shotGrammar,
          insertNeed: legacyVisualContract.insertNeed,
          primaryTargetId,
          secondaryTargetId,
          rng
        })
      : undefined;

    const shot: Shot = {
      shot_id: shotId,
      talk_text: talkText,
      visual_plan: legacyVisualContract.visualPlan,
      visual_objects: legacyVisualContract.visualObjects,
      shot_grammar: legacyVisualContract.shotGrammar,
      route_reason: legacyVisualContract.routeReason,
      educational_intent: legacyVisualContract.educationalIntent,
      insert_need: legacyVisualContract.insertNeed,
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
        preset: directedCameraPreset,
        keyframes: directedCameraKeyframes
      },
      chart: hasChart
        ? {
            chart_id: chartId,
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
        pack_id: resolveCharacterPackId(legacyVisualContract.channelDomain),
        layer: characterLayer,
        transform: {
          x: posPath[0].x,
          y: posPath[0].y,
          scale: intent === "close" ? 1.06 : intent === "intro" ? 1.02 : 0.98,
          flip_x: intent === "data"
        },
        tracks: {
          pos_path: posPath,
          action_track: buildActionTrack({
            duration,
            intent,
            shotGrammar: legacyVisualContract.shotGrammar,
            educationalIntent: legacyVisualContract.educationalIntent,
            insertNeed: legacyVisualContract.insertNeed
          }),
          expression_track: buildExpressionTrack({
            duration,
            segment,
            educationalIntent: legacyVisualContract.educationalIntent,
            routeReason: legacyVisualContract.routeReason,
            shotGrammar: legacyVisualContract.shotGrammar,
            insertNeed: legacyVisualContract.insertNeed
          }),
          look_track: buildLookTrack({
            duration,
            hasChart,
            shotGrammar: legacyVisualContract.shotGrammar,
            educationalIntent: legacyVisualContract.educationalIntent,
            insertNeed: legacyVisualContract.insertNeed
          }),
          point_track: directedPointTrack
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








