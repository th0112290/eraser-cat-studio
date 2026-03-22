import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMotionProfile } from "@ec/profiles";
import { orchestrateRenderEpisode } from "./orchestrateRender";
import type { EpisodeRegressionReport, RenderableShot, RenderableShotsDocument, VisualQcReport } from "./types";

type VisualObjectKind =
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

type VisualIntentFamily =
  | "chart_primary"
  | "timeline_metric"
  | "comparison_focus"
  | "diagram_primary"
  | "risk_focus"
  | "summary_focus";

type InsertType = "chart" | "board" | "caption_card" | "callout_card" | "diagram" | "icon_explainer" | "caution_card";
type ChannelDomain = "economy" | "medical";
type VisualRegion = "main_left" | "main_right" | "center_stage" | "sidebar" | "lower_third";
type DataShape =
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

type ScenarioExpectation = {
  shotCount: number;
  channelDomain: ChannelDomain;
  motionProfileId: "economy_analytic_v1" | "medical_guided_v1";
  intentFamilyCounts: Record<string, number>;
  transitionCounts: Record<string, number>;
  primaryKindCounts: Record<string, number>;
  warningCount: number;
  issueCodeCounts: Record<string, number>;
};

type RenderLogSummary = {
  status: string;
  visual_plan_summary?: {
    shot_count: number;
    intent_family_counts: Record<string, number>;
    primary_kind_counts: Record<string, number>;
    channel_domain_counts: Record<string, number>;
    pair_counts: Record<string, number>;
  };
  episode_regression_summary?: {
    final_passed: boolean;
    visual_plan_shot_count?: number;
    visual_plan_missing_count?: number;
    visual_intent_family_counts?: Record<string, number>;
    shot_count: number;
  };
};

type EpisodePropsSummary = {
  sequences?: Array<{
    visualObjects?: Array<{
      motionProfileId?: string;
      motionPreset?: string;
    }>;
  }>;
};

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function resolveDemoFixturePath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../fixtures/demo-shots.json");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveAccentToken(channelDomain: ChannelDomain): "economy" | "medical" {
  return channelDomain;
}

function resolveSafeArea(region: VisualRegion) {
  switch (region) {
    case "main_right":
      return { x: 0.54, y: 0.12, width: 0.38, height: 0.56, subtitle_avoid: true, mascot_avoid: true, pointer_reachable: true };
    case "center_stage":
      return { x: 0.22, y: 0.12, width: 0.56, height: 0.58, subtitle_avoid: true, mascot_avoid: true, pointer_reachable: true };
    case "sidebar":
      return { x: 0.68, y: 0.16, width: 0.24, height: 0.52, subtitle_avoid: true, mascot_avoid: true, pointer_reachable: false };
    case "lower_third":
      return { x: 0.14, y: 0.7, width: 0.72, height: 0.2, subtitle_avoid: true, mascot_avoid: true, pointer_reachable: false };
    case "main_left":
    default:
      return { x: 0.08, y: 0.12, width: 0.4, height: 0.54, subtitle_avoid: true, mascot_avoid: true, pointer_reachable: true };
  }
}

function resolvePointerAnchor(kind: VisualObjectKind) {
  switch (kind) {
    case "timeline":
    case "process_flow":
      return { x: 0.52, y: 0.56 };
    case "risk_meter":
      return { x: 0.5, y: 0.5 };
    case "anatomy_diagram":
      return { x: 0.34, y: 0.34 };
    case "comparison_board":
      return { x: 0.3, y: 0.34 };
    case "map":
      return { x: 0.48, y: 0.46 };
    case "line_chart":
    case "area_chart":
      return { x: 0.62, y: 0.34 };
    case "bar_chart":
      return { x: 0.46, y: 0.42 };
    case "summary_card":
    case "callout_card":
      return { x: 0.5, y: 0.38 };
    default:
      return { x: 0.5, y: 0.42 };
  }
}

function buildAnchors(
  objectId: string,
  kind: VisualObjectKind,
  pointerTargetId?: string
): NonNullable<RenderableShot["visual_objects"]>[number]["anchors"] {
  const pointer = resolvePointerAnchor(kind);
  return [
    {
      anchor_id: `${objectId}_pointer_1`,
      type: "pointer_anchor" as const,
      x: pointer.x,
      y: pointer.y,
      target_id: pointerTargetId,
      weight: 1
    },
    {
      anchor_id: `${objectId}_look`,
      type: "look_target" as const,
      x: pointer.x,
      y: Math.max(0.18, pointer.y - 0.08),
      target_id: pointerTargetId,
      weight: 0.8
    },
    {
      anchor_id: `${objectId}_cutaway`,
      type: "camera_cutaway_target" as const,
      x: 0.5,
      y: 0.48,
      weight: 0.65
    },
    {
      anchor_id: `${objectId}_callout`,
      type: "callout_anchor" as const,
      x: Math.min(0.84, pointer.x + 0.18),
      y: Math.max(0.16, pointer.y - 0.14),
      target_id: pointerTargetId,
      weight: 0.7
    },
    {
      anchor_id: `${objectId}_safe`,
      type: "safe_area_box" as const,
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      weight: 1
    }
  ];
}

function resolveFallbackPolicy(kind: VisualObjectKind): "fallback_to_table" | "fallback_to_summary_card" | "hide_optional" {
  if (
    kind === "bar_chart" ||
    kind === "line_chart" ||
    kind === "area_chart" ||
    kind === "heatmap" ||
    kind === "scatter" ||
    kind === "boxplot" ||
    kind === "map" ||
    kind === "table"
  ) {
    return "fallback_to_table";
  }
  if (kind === "summary_card" || kind === "callout_card" || kind === "kpi_card") {
    return "hide_optional";
  }
  return "fallback_to_summary_card";
}

function resolveMotionPreset(
  kind: VisualObjectKind,
  channelDomain: ChannelDomain,
  role: "primary_explainer" | "supporting_explainer"
): "panel_hold" | "data_sweep" | "trace_reveal" | "radial_reveal" | "metric_pop" | "step_stagger" | "comparison_split" | "grid_stagger" | "diagram_callout" | "risk_sweep" {
  if (channelDomain === "economy") {
    if (kind === "timeline") {
      return "trace_reveal";
    }
    if (kind === "table") {
      return "data_sweep";
    }
  }

  if (channelDomain === "medical") {
    if (kind === "callout_card") {
      return "diagram_callout";
    }
    if (kind === "summary_card" && role !== "primary_explainer") {
      return "diagram_callout";
    }
  }

  switch (kind) {
    case "bar_chart":
    case "heatmap":
    case "scatter":
    case "boxplot":
    case "map":
      return "data_sweep";
    case "line_chart":
    case "area_chart":
      return "trace_reveal";
    case "pie_or_donut":
      return "radial_reveal";
    case "kpi_card":
      return "metric_pop";
    case "timeline":
    case "process_flow":
      return "step_stagger";
    case "comparison_board":
      return "comparison_split";
    case "icon_grid":
      return "grid_stagger";
    case "anatomy_diagram":
      return "diagram_callout";
    case "risk_meter":
      return "risk_sweep";
    case "table":
    case "summary_card":
    case "callout_card":
    default:
      return "panel_hold";
  }
}

function resolveMotionProfileId(channelDomain: ChannelDomain): "economy_analytic_v1" | "medical_guided_v1" {
  return channelDomain === "medical" ? "medical_guided_v1" : "economy_analytic_v1";
}

function buildVisualObject(input: {
  shotId: string;
  kind: VisualObjectKind;
  role: "primary_explainer" | "supporting_explainer";
  region: VisualRegion;
  channelDomain: ChannelDomain;
  educationalMode: string;
  dataShape: DataShape;
  title: string;
  body: string;
  items?: string[];
  pointerTargetId?: string;
  selectionReason: string;
}): NonNullable<RenderableShot["visual_objects"]>[number] {
  const objectId = `${input.shotId}_${input.role === "primary_explainer" ? "primary" : "support"}_${input.kind}`;
  return {
    object_id: objectId,
    kind: input.kind,
    source: "planner_v2",
    semantic_role: input.role,
    preferred_region: input.region,
    safe_zone_tags: ["subtitle_safe", "chart_safe", "mascot_blocking", "pointer_reachable", "negative_space_preserve"],
    animation_policy: input.role === "primary_explainer" ? "presenter_guided" : "hold",
    motion_preset: resolveMotionPreset(input.kind, input.channelDomain, input.role),
    motion_profile_id: resolveMotionProfileId(input.channelDomain),
    fallback_policy: resolveFallbackPolicy(input.kind),
    title: input.title,
    body: input.body,
    accent_token: resolveAccentToken(input.channelDomain),
    items: input.items,
    pointer_target_ids: input.pointerTargetId ? [input.pointerTargetId] : undefined,
    anchors: buildAnchors(objectId, input.kind, input.pointerTargetId),
    safe_area: resolveSafeArea(input.region),
    selection: {
      resolver_id: "visual_object_planner_v2",
      data_shape: input.dataShape,
      educational_mode: input.educationalMode,
      channel_domain: input.channelDomain,
      selected_kind: input.kind,
      candidate_kinds: [input.kind],
      selection_reason: input.selectionReason
    },
    data_ref: {
      dataset_id: `${input.shotId}_dataset`,
      layout_hint: input.region
    }
  };
}

function buildVisualPlan(input: {
  family: VisualIntentFamily;
  channelDomain: ChannelDomain;
  educationalMode: string;
  insertNeedCandidates: InsertType[];
  selectedPrimaryKind: VisualObjectKind;
  selectedSupportingKind: VisualObjectKind;
  selectedInsertType: InsertType;
  selectionReason: string;
  candidatePrimaryKinds: VisualObjectKind[];
  candidateSupportingKinds: VisualObjectKind[];
  candidateInsertTypes: InsertType[];
}): NonNullable<RenderableShot["visual_plan"]> {
  return {
    resolver_id: "visual_pair_planner_v1",
    educational_mode: input.educationalMode,
    channel_domain: input.channelDomain,
    insert_need_candidates: input.insertNeedCandidates,
    candidate_intents: [
      {
        intent_id: `${input.family}_primary_v1`,
        intent_family: input.family,
        score: 14,
        candidate_insert_types: input.candidateInsertTypes,
        candidate_primary_kinds: input.candidatePrimaryKinds,
        candidate_supporting_kinds: input.candidateSupportingKinds,
        selection_reason: input.selectionReason
      },
      {
        intent_id: `${input.family}_fallback_v1`,
        intent_family: "summary_focus",
        score: 8,
        candidate_insert_types: ["caption_card", "callout_card"],
        candidate_primary_kinds: ["summary_card", "callout_card"],
        candidate_supporting_kinds: ["callout_card", "summary_card"],
        selection_reason: "fallback_summary_path"
      }
    ],
    selected_intent_id: `${input.family}_primary_v1`,
    selected_intent_family: input.family,
    selected_primary_kind: input.selectedPrimaryKind,
    selected_supporting_kind: input.selectedSupportingKind,
    selected_insert_type: input.selectedInsertType,
    selection_reason: input.selectionReason
  };
}

function buildInsertAsset(input: {
  shotId: string;
  type: InsertType;
  title: string;
  body: string;
  items?: string[];
  channelDomain: ChannelDomain;
  educationalMode: string;
  supportingKind: VisualObjectKind;
  selectionReason: string;
}): NonNullable<RenderableShot["insert_asset"]> {
  return {
    asset_id: `${input.shotId}_${input.type}`,
    type: input.type,
    layout: input.type === "caption_card" || input.type === "caution_card" ? "lower_third" : "sidebar",
    title: input.title,
    body: input.body,
    accent_token: resolveAccentToken(input.channelDomain),
    items: input.items,
    selection: {
      resolver_id: "visual_object_planner_v2",
      selected_insert_type: input.type,
      candidate_insert_types: [input.type],
      supporting_kind: input.supportingKind,
      educational_mode: input.educationalMode,
      channel_domain: input.channelDomain,
      selection_reason: input.selectionReason
    }
  };
}

function buildShot(
  templateShot: RenderableShot,
  input: {
    shotId: string;
    beatId: string;
    startFrame: number;
    durationFrames: number;
    narration: string;
    emphasisWords: string[];
    educationalMode: string;
    routeReason: string;
    insertNeed: InsertType[];
    channelDomain: ChannelDomain;
    visualPlan: NonNullable<RenderableShot["visual_plan"]>;
    insertAsset: NonNullable<RenderableShot["insert_asset"]>;
    visualObjects: NonNullable<RenderableShot["visual_objects"]>;
  }
): RenderableShot {
  const shot = clone(templateShot);
  shot.shot_id = input.shotId;
  shot.beat_ids = [input.beatId];
  shot.start_frame = input.startFrame;
  shot.duration_frames = input.durationFrames;
  shot.narration = input.narration;
  shot.emphasisWords = input.emphasisWords;
  shot.shot_grammar.educational_intent = input.educationalMode;
  shot.shot_grammar.insert_need = input.insertNeed;
  shot.shot_grammar.route_reason = input.routeReason;
  shot.insert_asset = input.insertAsset;
  shot.visual_plan = input.visualPlan;
  shot.visual_objects = input.visualObjects;
  shot.chart = undefined;
  shot.set.variant = input.channelDomain === "medical" ? "calm" : "fade";
  shot.camera.preset = input.channelDomain === "medical" ? "clinical_guided" : "host_wide_fade";
  shot.character.transform.x = 0.45;
  shot.character.transform.y = 0.82;
  shot.character.tracks.pos_path = [
    {
      f: 0,
      x: 0.45,
      y: 0.82,
      interp: "spring"
    }
  ];
  shot.character.tracks.look_track = [
    {
      f: 0,
      target: "viewer"
    }
  ];
  return shot;
}

function buildEconomyScenario(templateDoc: RenderableShotsDocument): RenderableShotsDocument {
  const doc = clone(templateDoc);
  const templateShot = clone(templateDoc.shots[0]);
  doc.episode.episode_id = "economy_visual_plan_regression";
  doc.episode.profiles = {
    studio_profile_id: "studio_default",
    channel_profile_id: "economy_channel",
    mascot_profile_id: "eraser_cat"
  };
  doc.shots = [
    buildShot(templateShot, {
      shotId: "eco_summary_001",
      beatId: "eco_beat_001",
      startFrame: 0,
      durationFrames: 150,
      narration: "A quick opening summary frames the market setup before the numbers land.",
      emphasisWords: ["summary", "market"],
      educationalMode: "hook_context",
      routeReason: "summary_focus_open",
      insertNeed: ["caption_card"],
      channelDomain: "economy",
      visualPlan: buildVisualPlan({
        family: "summary_focus",
        channelDomain: "economy",
        educationalMode: "hook_context",
        insertNeedCandidates: ["caption_card"],
        selectedPrimaryKind: "summary_card",
        selectedSupportingKind: "callout_card",
        selectedInsertType: "caption_card",
        selectionReason: "economy_summary_open",
        candidatePrimaryKinds: ["summary_card", "kpi_card"],
        candidateSupportingKinds: ["callout_card", "summary_card"],
        candidateInsertTypes: ["caption_card", "callout_card"]
      }),
      insertAsset: buildInsertAsset({
        shotId: "eco_summary_001",
        type: "caption_card",
        title: "Market Setup",
        body: "Demand is firm, but the explanation starts with a concise scene setter.",
        items: ["demand", "setup"],
        channelDomain: "economy",
        educationalMode: "hook_context",
        supportingKind: "callout_card",
        selectionReason: "economy_summary_open"
      }),
      visualObjects: [
        buildVisualObject({
          shotId: "eco_summary_001",
          kind: "summary_card",
          role: "primary_explainer",
          region: "main_right",
          channelDomain: "economy",
          educationalMode: "hook_context",
          dataShape: "summary",
          title: "Quarter Setup",
          body: "Revenue and margin move together when demand stays resilient.",
          items: ["Revenue resilient", "Margin stable"],
          pointerTargetId: "summary_focus",
          selectionReason: "economy_summary_open"
        }),
        buildVisualObject({
          shotId: "eco_summary_001",
          kind: "callout_card",
          role: "supporting_explainer",
          region: "lower_third",
          channelDomain: "economy",
          educationalMode: "hook_context",
          dataShape: "summary",
          title: "Why It Matters",
          body: "The presenter sets the frame before the chart appears.",
          items: ["Context first"],
          pointerTargetId: "summary_note",
          selectionReason: "economy_summary_support"
        })
      ]
    }),
    buildShot(templateShot, {
      shotId: "eco_timeline_002",
      beatId: "eco_beat_002",
      startFrame: 150,
      durationFrames: 180,
      narration: "Revenue climbs across the year, so a timeline-led chart makes the progression readable.",
      emphasisWords: ["revenue", "year"],
      educationalMode: "trend_emphasis",
      routeReason: "timeline_metric_explain",
      insertNeed: ["chart", "board"],
      channelDomain: "economy",
      visualPlan: buildVisualPlan({
        family: "timeline_metric",
        channelDomain: "economy",
        educationalMode: "trend_emphasis",
        insertNeedCandidates: ["chart", "board"],
        selectedPrimaryKind: "line_chart",
        selectedSupportingKind: "timeline",
        selectedInsertType: "chart",
        selectionReason: "economy_time_series_fit",
        candidatePrimaryKinds: ["line_chart", "area_chart", "timeline"],
        candidateSupportingKinds: ["timeline", "kpi_card", "summary_card"],
        candidateInsertTypes: ["chart", "board"]
      }),
      insertAsset: buildInsertAsset({
        shotId: "eco_timeline_002",
        type: "chart",
        title: "Yearly Trend",
        body: "Quarterly revenue accelerates into the back half.",
        items: ["Q1", "Q2", "Q3", "Q4"],
        channelDomain: "economy",
        educationalMode: "trend_emphasis",
        supportingKind: "timeline",
        selectionReason: "economy_time_series_fit"
      }),
      visualObjects: [
        buildVisualObject({
          shotId: "eco_timeline_002",
          kind: "line_chart",
          role: "primary_explainer",
          region: "main_right",
          channelDomain: "economy",
          educationalMode: "trend_emphasis",
          dataShape: "time_series",
          title: "Revenue by Quarter",
          body: "The slope and spacing show the change over time.",
          items: ["Q1", "Q2", "Q3", "Q4"],
          pointerTargetId: "quarter_growth",
          selectionReason: "economy_time_series_fit"
        }),
        buildVisualObject({
          shotId: "eco_timeline_002",
          kind: "timeline",
          role: "supporting_explainer",
          region: "sidebar",
          channelDomain: "economy",
          educationalMode: "trend_emphasis",
          dataShape: "time_series",
          title: "Milestones",
          body: "Promotion, pricing, and supply normalize in sequence.",
          items: ["Launch", "Price reset", "Supply recovery"],
          pointerTargetId: "milestone_track",
          selectionReason: "economy_timeline_support"
        })
      ]
    }),
    buildShot(templateShot, {
      shotId: "eco_map_003",
      beatId: "eco_beat_003",
      startFrame: 330,
      durationFrames: 180,
      narration: "Demand is not evenly distributed, so a market map works better than another generic bar cluster.",
      emphasisWords: ["demand", "map"],
      educationalMode: "regional_distribution",
      routeReason: "chart_primary_geo",
      insertNeed: ["chart", "callout_card"],
      channelDomain: "economy",
      visualPlan: buildVisualPlan({
        family: "chart_primary",
        channelDomain: "economy",
        educationalMode: "regional_distribution",
        insertNeedCandidates: ["chart", "callout_card"],
        selectedPrimaryKind: "map",
        selectedSupportingKind: "kpi_card",
        selectedInsertType: "chart",
        selectionReason: "economy_geo_fit",
        candidatePrimaryKinds: ["map", "heatmap", "bar_chart"],
        candidateSupportingKinds: ["kpi_card", "summary_card", "callout_card"],
        candidateInsertTypes: ["chart", "callout_card"]
      }),
      insertAsset: buildInsertAsset({
        shotId: "eco_map_003",
        type: "chart",
        title: "Regional Demand",
        body: "The strongest pockets are geographic, not just categorical.",
        items: ["US", "EU", "JP"],
        channelDomain: "economy",
        educationalMode: "regional_distribution",
        supportingKind: "kpi_card",
        selectionReason: "economy_geo_fit"
      }),
      visualObjects: [
        buildVisualObject({
          shotId: "eco_map_003",
          kind: "map",
          role: "primary_explainer",
          region: "main_right",
          channelDomain: "economy",
          educationalMode: "regional_distribution",
          dataShape: "geo",
          title: "Regional Demand Map",
          body: "Demand concentrates across a few markets.",
          items: ["North America", "Europe", "Japan"],
          pointerTargetId: "region_hotspot",
          selectionReason: "economy_geo_fit"
        }),
        buildVisualObject({
          shotId: "eco_map_003",
          kind: "kpi_card",
          role: "supporting_explainer",
          region: "lower_third",
          channelDomain: "economy",
          educationalMode: "regional_distribution",
          dataShape: "metric_snapshot",
          title: "Share Concentration",
          body: "Top 3 regions explain most of the move.",
          items: ["62% top 3", "Lead market stable"],
          pointerTargetId: "geo_kpi",
          selectionReason: "economy_geo_support"
        })
      ]
    }),
    buildShot(templateShot, {
      shotId: "eco_compare_004",
      beatId: "eco_beat_004",
      startFrame: 510,
      durationFrames: 180,
      narration: "Once the audience knows the trend and geography, a comparison board closes the argument cleanly.",
      emphasisWords: ["comparison", "argument"],
      educationalMode: "peer_comparison",
      routeReason: "comparison_focus_close",
      insertNeed: ["board", "callout_card"],
      channelDomain: "economy",
      visualPlan: buildVisualPlan({
        family: "comparison_focus",
        channelDomain: "economy",
        educationalMode: "peer_comparison",
        insertNeedCandidates: ["board", "callout_card"],
        selectedPrimaryKind: "bar_chart",
        selectedSupportingKind: "comparison_board",
        selectedInsertType: "board",
        selectionReason: "economy_comparison_fit",
        candidatePrimaryKinds: ["bar_chart", "table", "comparison_board"],
        candidateSupportingKinds: ["comparison_board", "table", "summary_card"],
        candidateInsertTypes: ["board", "callout_card"]
      }),
      insertAsset: buildInsertAsset({
        shotId: "eco_compare_004",
        type: "board",
        title: "Peer Snapshot",
        body: "The relative ranking is the final takeaway.",
        items: ["Leader", "Median", "Laggard"],
        channelDomain: "economy",
        educationalMode: "peer_comparison",
        supportingKind: "comparison_board",
        selectionReason: "economy_comparison_fit"
      }),
      visualObjects: [
        buildVisualObject({
          shotId: "eco_compare_004",
          kind: "bar_chart",
          role: "primary_explainer",
          region: "main_right",
          channelDomain: "economy",
          educationalMode: "peer_comparison",
          dataShape: "categorical_comparison",
          title: "Peer Revenue Comparison",
          body: "A clean rank order closes the segment.",
          items: ["Leader", "Peer A", "Peer B"],
          pointerTargetId: "peer_rank",
          selectionReason: "economy_comparison_fit"
        }),
        buildVisualObject({
          shotId: "eco_compare_004",
          kind: "comparison_board",
          role: "supporting_explainer",
          region: "sidebar",
          channelDomain: "economy",
          educationalMode: "peer_comparison",
          dataShape: "categorical_comparison",
          title: "Board Notes",
          body: "Margin and demand quality explain the spread.",
          items: ["Margin", "Inventory", "Demand mix"],
          pointerTargetId: "compare_board",
          selectionReason: "economy_board_support"
        })
      ]
    })
  ];
  return doc;
}

function buildMedicalScenario(templateDoc: RenderableShotsDocument): RenderableShotsDocument {
  const doc = clone(templateDoc);
  const templateShot = clone(templateDoc.shots[0]);
  doc.episode.episode_id = "medical_visual_plan_regression";
  doc.episode.profiles = {
    studio_profile_id: "studio_default",
    channel_profile_id: "medical_channel",
    mascot_profile_id: "eraser_cat"
  };
  doc.shots = [
    buildShot(templateShot, {
      shotId: "med_summary_001",
      beatId: "med_beat_001",
      startFrame: 0,
      durationFrames: 150,
      narration: "Start with the patient-facing summary before moving into the mechanism.",
      emphasisWords: ["patient", "summary"],
      educationalMode: "hook_context",
      routeReason: "medical_summary_open",
      insertNeed: ["caption_card", "callout_card"],
      channelDomain: "medical",
      visualPlan: buildVisualPlan({
        family: "summary_focus",
        channelDomain: "medical",
        educationalMode: "hook_context",
        insertNeedCandidates: ["caption_card", "callout_card"],
        selectedPrimaryKind: "summary_card",
        selectedSupportingKind: "callout_card",
        selectedInsertType: "caption_card",
        selectionReason: "medical_summary_open",
        candidatePrimaryKinds: ["summary_card", "callout_card"],
        candidateSupportingKinds: ["callout_card", "summary_card"],
        candidateInsertTypes: ["caption_card", "callout_card"]
      }),
      insertAsset: buildInsertAsset({
        shotId: "med_summary_001",
        type: "caption_card",
        title: "Clinical Context",
        body: "A calm summary frames the explanation before the anatomy arrives.",
        items: ["Symptoms", "Cause"],
        channelDomain: "medical",
        educationalMode: "hook_context",
        supportingKind: "callout_card",
        selectionReason: "medical_summary_open"
      }),
      visualObjects: [
        buildVisualObject({
          shotId: "med_summary_001",
          kind: "summary_card",
          role: "primary_explainer",
          region: "main_right",
          channelDomain: "medical",
          educationalMode: "hook_context",
          dataShape: "summary",
          title: "Patient Summary",
          body: "Explain the condition in plain language first.",
          items: ["What it is", "Why it matters"],
          pointerTargetId: "patient_summary",
          selectionReason: "medical_summary_open"
        }),
        buildVisualObject({
          shotId: "med_summary_001",
          kind: "callout_card",
          role: "supporting_explainer",
          region: "lower_third",
          channelDomain: "medical",
          educationalMode: "hook_context",
          dataShape: "summary",
          title: "Gentle Tone",
          body: "Lead with reassurance before detail.",
          items: ["Calm framing"],
          pointerTargetId: "gentle_tone",
          selectionReason: "medical_summary_support"
        })
      ]
    }),
    buildShot(templateShot, {
      shotId: "med_process_002",
      beatId: "med_beat_002",
      startFrame: 150,
      durationFrames: 180,
      narration: "A process flow explains the treatment steps more clearly than a chart ever could.",
      emphasisWords: ["treatment", "steps"],
      educationalMode: "step_by_step_walkthrough",
      routeReason: "diagram_primary_process",
      insertNeed: ["diagram", "callout_card"],
      channelDomain: "medical",
      visualPlan: buildVisualPlan({
        family: "diagram_primary",
        channelDomain: "medical",
        educationalMode: "step_by_step_walkthrough",
        insertNeedCandidates: ["diagram", "callout_card"],
        selectedPrimaryKind: "process_flow",
        selectedSupportingKind: "callout_card",
        selectedInsertType: "diagram",
        selectionReason: "medical_process_fit",
        candidatePrimaryKinds: ["process_flow", "timeline", "anatomy_diagram"],
        candidateSupportingKinds: ["callout_card", "summary_card", "comparison_board"],
        candidateInsertTypes: ["diagram", "callout_card"]
      }),
      insertAsset: buildInsertAsset({
        shotId: "med_process_002",
        type: "diagram",
        title: "Treatment Steps",
        body: "Sequence beats comparison when the goal is procedural clarity.",
        items: ["Screen", "Treat", "Follow-up"],
        channelDomain: "medical",
        educationalMode: "step_by_step_walkthrough",
        supportingKind: "callout_card",
        selectionReason: "medical_process_fit"
      }),
      visualObjects: [
        buildVisualObject({
          shotId: "med_process_002",
          kind: "process_flow",
          role: "primary_explainer",
          region: "center_stage",
          channelDomain: "medical",
          educationalMode: "step_by_step_walkthrough",
          dataShape: "process_steps",
          title: "Treatment Path",
          body: "Screen, confirm, then treat in order.",
          items: ["Screen", "Confirm", "Treat"],
          pointerTargetId: "process_step",
          selectionReason: "medical_process_fit"
        }),
        buildVisualObject({
          shotId: "med_process_002",
          kind: "callout_card",
          role: "supporting_explainer",
          region: "lower_third",
          channelDomain: "medical",
          educationalMode: "step_by_step_walkthrough",
          dataShape: "summary",
          title: "Key Reminder",
          body: "Order matters more than raw quantity here.",
          items: ["Sequence matters"],
          pointerTargetId: "process_note",
          selectionReason: "medical_process_support"
        })
      ]
    }),
    buildShot(templateShot, {
      shotId: "med_anatomy_003",
      beatId: "med_beat_003",
      startFrame: 330,
      durationFrames: 180,
      narration: "Once the steps are clear, the anatomy diagram can label the structure without fighting the presenter.",
      emphasisWords: ["anatomy", "structure"],
      educationalMode: "structure_explain",
      routeReason: "diagram_primary_structure",
      insertNeed: ["diagram", "callout_card"],
      channelDomain: "medical",
      visualPlan: buildVisualPlan({
        family: "diagram_primary",
        channelDomain: "medical",
        educationalMode: "structure_explain",
        insertNeedCandidates: ["diagram", "callout_card"],
        selectedPrimaryKind: "anatomy_diagram",
        selectedSupportingKind: "callout_card",
        selectedInsertType: "diagram",
        selectionReason: "medical_structure_fit",
        candidatePrimaryKinds: ["anatomy_diagram", "icon_grid", "process_flow"],
        candidateSupportingKinds: ["callout_card", "summary_card", "comparison_board"],
        candidateInsertTypes: ["diagram", "callout_card"]
      }),
      insertAsset: buildInsertAsset({
        shotId: "med_anatomy_003",
        type: "diagram",
        title: "Labeled Structure",
        body: "Names and position matter more than numerical comparison.",
        items: ["Location", "Function"],
        channelDomain: "medical",
        educationalMode: "structure_explain",
        supportingKind: "callout_card",
        selectionReason: "medical_structure_fit"
      }),
      visualObjects: [
        buildVisualObject({
          shotId: "med_anatomy_003",
          kind: "anatomy_diagram",
          role: "primary_explainer",
          region: "center_stage",
          channelDomain: "medical",
          educationalMode: "structure_explain",
          dataShape: "structure",
          title: "Anatomy Focus",
          body: "Labels stay readable when the object owns center stage.",
          items: ["Label A", "Label B"],
          pointerTargetId: "anatomy_label",
          selectionReason: "medical_structure_fit"
        }),
        buildVisualObject({
          shotId: "med_anatomy_003",
          kind: "callout_card",
          role: "supporting_explainer",
          region: "sidebar",
          channelDomain: "medical",
          educationalMode: "structure_explain",
          dataShape: "summary",
          title: "Label Notes",
          body: "The side panel carries definitions without crowding the diagram.",
          items: ["Definition", "Clinical note"],
          pointerTargetId: "label_note",
          selectionReason: "medical_structure_support"
        })
      ]
    }),
    buildShot(templateShot, {
      shotId: "med_risk_004",
      beatId: "med_beat_004",
      startFrame: 510,
      durationFrames: 180,
      narration: "A risk meter closes the segment because caution needs a clear threshold, not another procedure panel.",
      emphasisWords: ["risk", "threshold"],
      educationalMode: "caution_emphasis",
      routeReason: "risk_focus_close",
      insertNeed: ["caution_card", "callout_card"],
      channelDomain: "medical",
      visualPlan: buildVisualPlan({
        family: "risk_focus",
        channelDomain: "medical",
        educationalMode: "caution_emphasis",
        insertNeedCandidates: ["caution_card", "callout_card"],
        selectedPrimaryKind: "risk_meter",
        selectedSupportingKind: "callout_card",
        selectedInsertType: "caution_card",
        selectionReason: "medical_risk_fit",
        candidatePrimaryKinds: ["risk_meter", "callout_card", "summary_card"],
        candidateSupportingKinds: ["callout_card", "summary_card", "risk_meter"],
        candidateInsertTypes: ["caution_card", "callout_card"]
      }),
      insertAsset: buildInsertAsset({
        shotId: "med_risk_004",
        type: "caution_card",
        title: "When To Escalate",
        body: "Escalation triggers should be unmistakable.",
        items: ["Fever", "Pain spike", "Urgent consult"],
        channelDomain: "medical",
        educationalMode: "caution_emphasis",
        supportingKind: "callout_card",
        selectionReason: "medical_risk_fit"
      }),
      visualObjects: [
        buildVisualObject({
          shotId: "med_risk_004",
          kind: "risk_meter",
          role: "primary_explainer",
          region: "main_right",
          channelDomain: "medical",
          educationalMode: "caution_emphasis",
          dataShape: "risk_signal",
          title: "Escalation Threshold",
          body: "Use a threshold view when the audience needs a caution signal.",
          items: ["Monitor", "Call clinician", "Emergency"],
          pointerTargetId: "risk_threshold",
          selectionReason: "medical_risk_fit"
        }),
        buildVisualObject({
          shotId: "med_risk_004",
          kind: "callout_card",
          role: "supporting_explainer",
          region: "lower_third",
          channelDomain: "medical",
          educationalMode: "caution_emphasis",
          dataShape: "summary",
          title: "Callout",
          body: "Highlight only the safety-critical triggers.",
          items: ["Escalate if worsening"],
          pointerTargetId: "risk_note",
          selectionReason: "medical_risk_support"
        })
      ]
    })
  ];
  return doc;
}

function assertEqual(failures: string[], label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failures.push(`${label}: expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}

function assertMapIncludes(
  failures: string[],
  label: string,
  actual: Record<string, number> | undefined,
  expected: Record<string, number>
): void {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual?.[key] ?? 0;
    if (actualValue !== expectedValue) {
      failures.push(`${label}.${key}: expected=${expectedValue} actual=${actualValue}`);
    }
  }
}

function countIssueCodes(report: EpisodeRegressionReport): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const issue of report.issues) {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
  }
  return counts;
}

async function runScenario(
  repoRoot: string,
  scenarioName: string,
  document: RenderableShotsDocument,
  expectation: ScenarioExpectation
): Promise<void> {
  const scenarioDir = path.join(repoRoot, "out", "tmp", "visual_plan_regression_smoke", scenarioName);
  fs.rmSync(scenarioDir, { recursive: true, force: true });
  fs.mkdirSync(scenarioDir, { recursive: true });

  const shotsPath = path.join(scenarioDir, "shots.json");
  const outputPath = path.join(scenarioDir, "render_episode.mp4");
  const renderLogPath = path.join(scenarioDir, "render_log.json");
  writeJson(shotsPath, document);

  const result = await orchestrateRenderEpisode({
    dryRun: true,
    shotsPath,
    outputPath,
    renderLogPath,
    allowSyntheticChartData: true
  });

  const regressionReport = readJson<EpisodeRegressionReport>(path.join(scenarioDir, "episode_regression_report.json"));
  const qcReport = readJson<VisualQcReport>(path.join(scenarioDir, "qc_report.json"));
  const renderLog = readJson<RenderLogSummary>(renderLogPath);
  const episodeProps = readJson<EpisodePropsSummary>(path.join(scenarioDir, "render_episode.props.json"));
  const issueCodeCounts = countIssueCodes(regressionReport);
  const qcObjectSpecificCheck = qcReport.runs[qcReport.runs.length - 1]?.checks.find((check) => check.name === "object_specific");
  const qcObjectSpecificIssues =
    qcReport.runs[qcReport.runs.length - 1]?.issues.filter((issue) => issue.code.startsWith("visual_object_")) ?? [];
  const motionProfileIds = Array.from(
    new Set(
      (episodeProps.sequences ?? [])
        .flatMap((sequence) => sequence.visualObjects ?? [])
        .map((object) => object.motionProfileId)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const motionPresets = Array.from(
    new Set(
      (episodeProps.sequences ?? [])
        .flatMap((sequence) => sequence.visualObjects ?? [])
        .map((object) => object.motionPreset)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    )
  );
  const missingMotionProfileCount = (episodeProps.sequences ?? [])
    .flatMap((sequence) => sequence.visualObjects ?? [])
    .filter((object) => typeof object.motionProfileId !== "string" || object.motionProfileId.length === 0).length;
  const missingMotionPresetCount = (episodeProps.sequences ?? [])
    .flatMap((sequence) => sequence.visualObjects ?? [])
    .filter((object) => typeof object.motionPreset !== "string" || object.motionPreset.length === 0).length;
  const benchmarkedMotionPresets = resolveMotionProfile(expectation.motionProfileId).benchmarked_motion_presets;
  const unbenchmarkedMotionPresets = motionPresets.filter((preset) => !benchmarkedMotionPresets.includes(preset));
  const failures: string[] = [];

  assertEqual(failures, `${scenarioName}.result.status`, result.status, "SUCCEEDED");
  assertEqual(failures, `${scenarioName}.regression.final_passed`, regressionReport.final_passed, true);
  assertEqual(failures, `${scenarioName}.regression.shot_count`, regressionReport.continuity_summary.shot_count, expectation.shotCount);
  assertEqual(
    failures,
    `${scenarioName}.regression.visual_plan_shot_count`,
    regressionReport.continuity_summary.visual_plan_shot_count,
    expectation.shotCount
  );
  assertEqual(
    failures,
    `${scenarioName}.regression.visual_plan_missing_count`,
    regressionReport.continuity_summary.visual_plan_missing_count,
    0
  );
  assertEqual(failures, `${scenarioName}.regression.warning_count`, regressionReport.warning_count, expectation.warningCount);
  assertEqual(failures, `${scenarioName}.log.status`, renderLog.status, "SUCCEEDED");
  assertEqual(failures, `${scenarioName}.qc.final_passed`, qcReport.final_passed, true);
  assertEqual(failures, `${scenarioName}.qc.object_specific.passed`, qcObjectSpecificCheck?.passed, true);
  assertEqual(failures, `${scenarioName}.qc.object_specific.issue_count`, qcObjectSpecificIssues.length, 0);
  assertEqual(failures, `${scenarioName}.props.motion_profile_id.count`, motionProfileIds.length, 1);
  assertEqual(failures, `${scenarioName}.props.motion_profile_id.value`, motionProfileIds[0], expectation.motionProfileId);
  assertEqual(failures, `${scenarioName}.props.motion_profile_id.missing_count`, missingMotionProfileCount, 0);
  assertEqual(failures, `${scenarioName}.props.motion_preset.missing_count`, missingMotionPresetCount, 0);
  assertEqual(failures, `${scenarioName}.props.motion_preset.unbenchmarked_count`, unbenchmarkedMotionPresets.length, 0);
  assertEqual(
    failures,
    `${scenarioName}.log.visual_plan_summary.shot_count`,
    renderLog.visual_plan_summary?.shot_count,
    expectation.shotCount
  );
  assertEqual(
    failures,
    `${scenarioName}.log.episode_regression_summary.visual_plan_shot_count`,
    renderLog.episode_regression_summary?.visual_plan_shot_count,
    expectation.shotCount
  );
  assertEqual(
    failures,
    `${scenarioName}.log.episode_regression_summary.visual_plan_missing_count`,
    renderLog.episode_regression_summary?.visual_plan_missing_count,
    0
  );
  assertMapIncludes(
    failures,
    `${scenarioName}.regression.visual_intent_family_counts`,
    regressionReport.continuity_summary.visual_intent_family_counts,
    expectation.intentFamilyCounts
  );
  assertMapIncludes(
    failures,
    `${scenarioName}.regression.visual_intent_transition_counts`,
    regressionReport.continuity_summary.visual_intent_transition_counts,
    expectation.transitionCounts
  );
  assertMapIncludes(
    failures,
    `${scenarioName}.regression.primary_visual_kind_counts`,
    regressionReport.continuity_summary.primary_visual_kind_counts,
    expectation.primaryKindCounts
  );
  assertMapIncludes(
    failures,
    `${scenarioName}.log.visual_plan_summary.intent_family_counts`,
    renderLog.visual_plan_summary?.intent_family_counts,
    expectation.intentFamilyCounts
  );
  assertMapIncludes(
    failures,
    `${scenarioName}.log.visual_plan_summary.primary_kind_counts`,
    renderLog.visual_plan_summary?.primary_kind_counts,
    expectation.primaryKindCounts
  );
  assertMapIncludes(
    failures,
    `${scenarioName}.log.visual_plan_summary.channel_domain_counts`,
    renderLog.visual_plan_summary?.channel_domain_counts,
    { [expectation.channelDomain]: expectation.shotCount }
  );
  assertMapIncludes(failures, `${scenarioName}.regression.issue_code_counts`, issueCodeCounts, expectation.issueCodeCounts);

  if (failures.length > 0) {
    throw new Error(`${scenarioName} visual plan regression smoke failed:\n- ${failures.join("\n- ")}`);
  }

  console.log(`[PASS] ${scenarioName} visual plan regression`);
  console.log(`  shotCount=${expectation.shotCount}`);
  console.log(
    `  intentFamilies=${Object.entries(regressionReport.continuity_summary.visual_intent_family_counts)
      .map(([key, value]) => `${key}:${value}`)
      .join(", ")}`
  );
  console.log(
    `  transitions=${Object.entries(regressionReport.continuity_summary.visual_intent_transition_counts)
      .map(([key, value]) => `${key}:${value}`)
      .join(", ") || "none"}`
  );
  console.log(`  warnings=${regressionReport.warning_count}`);
  console.log(`  motionProfile=${motionProfileIds[0] ?? "missing"}`);
  console.log(`  motionPresets=${motionPresets.join(", ") || "missing"}`);
  console.log(`  objectSpecific=${qcObjectSpecificCheck?.details ?? "missing"}`);
  console.log(`  issueCodes=${Object.entries(issueCodeCounts).map(([key, value]) => `${key}:${value}`).join(", ") || "none"}`);
  console.log(`  artifactDir=${scenarioDir}`);
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const templateDoc = readJson<RenderableShotsDocument>(resolveDemoFixturePath());
  const scenarios: Array<{ name: string; document: RenderableShotsDocument; expectation: ScenarioExpectation }> = [
    {
      name: "economy",
      document: buildEconomyScenario(templateDoc),
      expectation: {
        shotCount: 4,
        channelDomain: "economy" as const,
        motionProfileId: "economy_analytic_v1",
        intentFamilyCounts: {
          summary_focus: 1,
          timeline_metric: 1,
          chart_primary: 1,
          comparison_focus: 1
        },
        transitionCounts: {
          "summary_focus->timeline_metric": 1,
          "timeline_metric->chart_primary": 1,
          "chart_primary->comparison_focus": 1
        },
        primaryKindCounts: {
          summary_card: 1,
          line_chart: 1,
          map: 1,
          bar_chart: 1
        },
        warningCount: 0,
        issueCodeCounts: {}
      }
    },
    {
      name: "medical",
      document: buildMedicalScenario(templateDoc),
      expectation: {
        shotCount: 4,
        channelDomain: "medical" as const,
        motionProfileId: "medical_guided_v1",
        intentFamilyCounts: {
          summary_focus: 1,
          diagram_primary: 2,
          risk_focus: 1
        },
        transitionCounts: {
          "summary_focus->diagram_primary": 1,
          "diagram_primary->diagram_primary": 1,
          "diagram_primary->risk_focus": 1
        },
        primaryKindCounts: {
          summary_card: 1,
          process_flow: 1,
          anatomy_diagram: 1,
          risk_meter: 1
        },
        warningCount: 0,
        issueCodeCounts: {}
      }
    }
  ];

  for (const scenario of scenarios) {
    await runScenario(repoRoot, scenario.name, scenario.document, scenario.expectation);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
