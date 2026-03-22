import { coerceProfileSelection, resolveProfiles, type ResolvedProfiles } from "@ec/profiles";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createValidator } from "@ec/shared";
import type {
  AlignmentHook,
  ChartDataRow,
  DeterministicSequence,
  DeterministicVisualPlanSummary,
  DeterministicVisualObject,
  EpisodeRegressionReport,
  EpisodeRenderProps,
  OrchestrateRenderInput,
  OrchestrateRenderResult,
  RenderPreset,
  RenderQcInput,
  RenderSafeArea,
  RenderableShot,
  RenderableShotsDocument,
  ShotSidecarPlan,
  SubtitleAlignmentProvider,
  VisualQcIssue,
  VisualQcReport
} from "./types";
import {
  applyNarrationAlignmentToSequences,
  buildNarrationAlignmentHook,
  createFailoverSubtitleAlignmentProvider,
  normalizeNarrationAlignmentDocument,
  resolveAlignmentHook
} from "./alignment";
import { applyAlignmentAwareActingTimeline } from "./actingTimeline";
import {
  applyEpisodeFinishConsistency,
  buildFinishConsistencySummary,
  resolveEpisodeFinishProfile
} from "./episodeFinish";
import {
  buildEpisodeRegressionReport,
  summarizeEpisodeRegressionReport
} from "./episodeRegression";
import { resolveShotFinishProfile } from "./finishProfiles";
import {
  computePrimaryVisualAnchorInRect,
  resolvePrimaryVisualPointerTargetCount,
  resolveSequenceLayoutPlan
} from "./layoutPlan";
import { buildSubtitleCues, toSrt } from "./srt";
import { runVisualQcWithFallback } from "./visualQc";

const DEFAULT_COMPOSITION_ID = "SHOT-EPISODE";
const DEFAULT_PRESET: RenderPreset = {
  width: 1920,
  height: 1080,
  fps: 30,
  videoBitrate: "8M",
  codec: "h264",
  x264Preset: "veryfast",
  safeArea: {
    top: 54,
    right: 96,
    bottom: 54,
    left: 96
  }
};

type RenderLog = {
  schema_version: "1.0";
  status: "SUCCEEDED" | "FAILED";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  attempt: number;
  max_attempts: number;
  shots_path: string;
  output_path: string;
  srt_path: string;
  narration_alignment_path: string;
  qc_report_path: string;
  episode_regression_report_path: string;
  sidecar_plan_path: string;
  props_path: string;
  composition_id: string;
  command: string[];
  preset: RenderPreset;
  sequence_count: number;
  sidecar_plan_count: number;
  subtitle_count: number;
  total_frames: number;
  qc_passed: boolean;
  fallback_steps_applied: string[];
  qc_error_count: number;
  qc_warning_count: number;
  finish_profile_ids?: string[];
  finish_consistency_summary?: ReturnType<typeof buildFinishConsistencySummary>;
  episode_regression_summary?: ReturnType<typeof summarizeEpisodeRegressionReport>;
  sidecar_judge_summary?: {
    accepted_count: number;
    fallback_count: number;
    rejected_count: number;
    planned_count: number;
    not_applicable_count: number;
    total_retake_count: number;
    actual_backend_counts: Record<string, number>;
    renderer_counts: Record<string, number>;
  };
  sidecar_preset_summary?: {
    controlnet_preset_counts: Record<string, number>;
    impact_preset_counts: Record<string, number>;
    qc_preset_counts: Record<string, number>;
    preset_source_counts: Record<string, number>;
  };
  sidecar_rollout_summary?: {
    applied_count: number;
    source_counts: Record<string, number>;
    source_kind_counts: Record<string, number>;
    channel_domain_counts: Record<string, number>;
    scenario_counts: Record<string, number>;
    verdict_counts: Record<string, number>;
    target_counts: Record<string, number>;
    min_score: number | null;
    max_score: number | null;
    avg_score: number | null;
    min_artifact_age_hours: number | null;
    max_artifact_age_hours: number | null;
    avg_artifact_age_hours: number | null;
  };
  visual_plan_summary?: DeterministicVisualPlanSummary;
  profiles?: import("@ec/profiles").ResolvedProfiles;
  stdout?: string;
  stderr?: string;
  error?: {
    message: string;
    stack?: string;
  };
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath: string, value: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, "utf8");
}

function limitLogText(value: string, maxChars: number = 12000): string | undefined {
  if (value.length === 0) {
    return undefined;
  }
  if (value.length <= maxChars) {
    return value;
  }
  const half = Math.floor(maxChars / 2);
  const head = value.slice(0, half);
  const tail = value.slice(-half);
  return `${head}\n...[truncated ${value.length - maxChars} chars]...\n${tail}`;
}

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function coerceStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter((entry) => entry.length > 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function fallbackNarration(shot: RenderableShot, index: number): string {
  if (typeof shot.narration === "string" && shot.narration.trim().length > 0) {
    return shot.narration.trim();
  }

  const explicitTalkText =
    typeof shot.talkText === "string" && shot.talkText.trim().length > 0
      ? shot.talkText.trim()
      : typeof shot.talk_text === "string" && shot.talk_text.trim().length > 0
        ? shot.talk_text.trim()
        : "";
  if (explicitTalkText.length > 0) {
    return explicitTalkText;
  }

  const calloutText = shot.chart?.callouts?.find((callout) => callout.text.trim().length > 0)?.text;
  if (calloutText) {
    return calloutText;
  }

  const beatLabel = shot.beat_ids.slice(0, 3).join(", ");
  if (beatLabel) {
    return `Narration for ${beatLabel}`;
  }

  return `Narration for shot ${index + 1}`;
}

function toSafeAreaPixels(doc: RenderableShotsDocument, preset: RenderPreset) {
  const normalized = doc.render.safe_area;
  const left = Math.round(normalized.x * preset.width);
  const top = Math.round(normalized.y * preset.height);
  const right = Math.round((1 - (normalized.x + normalized.w)) * preset.width);
  const bottom = Math.round((1 - (normalized.y + normalized.h)) * preset.height);

  return {
    top: Math.max(0, top),
    right: Math.max(0, right),
    bottom: Math.max(0, bottom),
    left: Math.max(0, left)
  };
}

function defaultChartRows(seedSource: string): ChartDataRow[] {
  const seed = hashSeed(seedSource);
  const a = 58 + (seed % 31);
  const b = 64 + ((seed >>> 3) % 27);
  const c = 70 + ((seed >>> 6) % 23);
  const d = 52 + ((seed >>> 9) % 21);
  return [
    { label: "A", value: a, unit: "pts" },
    { label: "B", value: b, unit: "pts" },
    { label: "C", value: c, unit: "pts" },
    { label: "D", value: d, unit: "pts" }
  ];
}

function normalizeDatasetRows(
  rows: Array<{ label: string; value: number; unit?: string }>,
  fallbackUnit?: string
): ChartDataRow[] {
  return rows.map((row) => ({
    label: normalizeText(row.label),
    value: row.value,
    unit: row.unit ?? fallbackUnit
  }));
}

function resolveShotDatasetIds(shot: RenderableShot): string[] {
  const ids = new Set<string>();

  if (typeof shot.chart?.dataset_id === "string" && shot.chart.dataset_id.trim().length > 0) {
    ids.add(shot.chart.dataset_id.trim());
  }

  for (const visualObject of shot.visual_objects ?? []) {
    if (typeof visualObject.data_ref?.dataset_id === "string" && visualObject.data_ref.dataset_id.trim().length > 0) {
      ids.add(visualObject.data_ref.dataset_id.trim());
    }
  }

  return [...ids];
}

function resolveEpisodeDatasetRows(
  doc: RenderableShotsDocument,
  datasetIds: string[]
): { rows: ChartDataRow[]; datasetId: string } | null {
  if (datasetIds.length === 0) {
    return null;
  }

  const inputs = Array.isArray(doc.episode.data_inputs) ? doc.episode.data_inputs : [];
  for (const datasetId of datasetIds) {
    const match = inputs.find((entry) => entry.dataset_id === datasetId);
    if (match && Array.isArray(match.rows) && match.rows.length > 0) {
      return {
        datasetId,
        rows: normalizeDatasetRows(match.rows, match.unit)
      };
    }
  }

  return null;
}

function buildChartRowsForShot(
  doc: RenderableShotsDocument,
  shot: RenderableShot,
  qcInput: RenderQcInput | undefined,
  allowSyntheticChartData: boolean
): ChartDataRow[] {
  const datasetIds = resolveShotDatasetIds(shot);
  const requiresTabularData =
    Boolean(shot.chart) ||
    datasetIds.length > 0 ||
    (shot.visual_objects ?? []).some((visualObject) => visualObject.kind === "table");

  if (!requiresTabularData) {
    return [];
  }

  const boundEpisodeDataset = resolveEpisodeDatasetRows(doc, datasetIds);
  if (boundEpisodeDataset) {
    return boundEpisodeDataset.rows;
  }

  const datasetRows = qcInput?.dataset?.rows;
  if (datasetRows && datasetRows.length > 0) {
    return normalizeDatasetRows(datasetRows, qcInput?.dataset?.unit);
  }

  if (datasetIds.length > 0 && !allowSyntheticChartData) {
    throw new Error(
      `Shot ${shot.shot_id} declares dataset binding (${datasetIds.join(", ")}) but no render data rows were provided.`
    );
  }

  return defaultChartRows(shot.shot_id);
}

function resolveTargetIndexFromId(targetId: string | undefined, rowCount: number, fallbackIndex: number): number {
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

  return clamp(hashSeed(targetId) % rowCount, 0, rowCount - 1);
}

function resolveVisualFocusTargetId(
  primaryVisualObject: DeterministicVisualObject | undefined
): string | undefined {
  const lookTargetId = primaryVisualObject?.anchors?.find(
    (anchor) => anchor.type === "look_target" && isNonEmptyString(anchor.target_id)
  )?.target_id;
  if (isNonEmptyString(lookTargetId)) {
    return lookTargetId;
  }

  const pointerAnchorTargetId = primaryVisualObject?.anchors?.find(
    (anchor) => anchor.type === "pointer_anchor" && isNonEmptyString(anchor.target_id)
  )?.target_id;
  if (isNonEmptyString(pointerAnchorTargetId)) {
    return pointerAnchorTargetId;
  }

  const pointerTargetId = primaryVisualObject?.pointerTargetIds?.find((targetId) => isNonEmptyString(targetId));
  if (isNonEmptyString(pointerTargetId)) {
    return pointerTargetId;
  }

  return undefined;
}

function resolvePreferredPointerTargetId(input: {
  pointTargetId?: string;
  highlightTargetId?: string;
  primaryVisualObject?: DeterministicVisualObject;
  preferVisualFocus?: boolean;
}): string | undefined {
  if (isNonEmptyString(input.pointTargetId)) {
    return input.pointTargetId;
  }

  if (isNonEmptyString(input.highlightTargetId)) {
    return input.highlightTargetId;
  }

  if (input.preferVisualFocus) {
    const visualFocusTargetId = resolveVisualFocusTargetId(input.primaryVisualObject);
    if (visualFocusTargetId) {
      return visualFocusTargetId;
    }
  }

  return undefined;
}

function resolvePointerTargetIndexFromVisualObject(input: {
  primaryVisualObject?: DeterministicVisualObject;
  preferredTargetId?: string;
  pointerTargetCount: number;
  fallbackIndex: number;
}): number {
  const targetId = input.preferredTargetId?.trim();
  if (targetId) {
    const pointerAnchors = input.primaryVisualObject?.anchors?.filter((anchor) => anchor.type === "pointer_anchor") ?? [];
    const pointerAnchorIndex = pointerAnchors.findIndex((anchor) => anchor.target_id === targetId);
    if (pointerAnchorIndex >= 0) {
      return pointerAnchorIndex;
    }

    const pointerTargetIds = input.primaryVisualObject?.pointerTargetIds ?? [];
    const pointerTargetIndex = pointerTargetIds.findIndex((candidate) => candidate === targetId);
    if (pointerTargetIndex >= 0) {
      return pointerTargetIndex;
    }
  }

  return resolveTargetIndexFromId(targetId, input.pointerTargetCount, input.fallbackIndex);
}

function applySequenceLayoutFields(
  sequence: DeterministicSequence,
  layoutPlan: NonNullable<DeterministicSequence["layoutPlan"]>,
  pointerTip: DeterministicSequence["pointerTip"]
): DeterministicSequence {
  return {
    ...sequence,
    layoutPlan,
    visualBox: layoutPlan.primaryVisualBox,
    narrationBox: layoutPlan.narrationBox,
    pointerReachableZone: layoutPlan.pointerReachability,
    pointerTip
  };
}

function resolvePrimaryVisualObject(
  visualObjects: DeterministicVisualObject[] | undefined
): DeterministicVisualObject | undefined {
  return visualObjects?.find((object) => object.semanticRole === "primary_explainer") ?? visualObjects?.[0];
}

function resolveTransitionHint(shot: RenderableShot): string {
  const directTransition = (shot as RenderableShot & { transition?: unknown }).transition;
  if (typeof directTransition === "string" && directTransition.trim().length > 0) {
    return directTransition.trim();
  }

  const preset = shot.camera.preset.toLowerCase();
  if (preset.includes("fade")) {
    return "fade";
  }
  if (preset.includes("flash") || preset.includes("whip")) {
    return "flash";
  }
  return "cut";
}

function buildDeterministicSequences(
  doc: RenderableShotsDocument,
  width: number,
  height: number,
  safeArea: RenderSafeArea,
  presetFps: number,
  qcInput?: RenderQcInput,
  profiles?: ResolvedProfiles,
  allowSyntheticChartData: boolean = false
): DeterministicSequence[] {
  const sourceFps = doc.render.fps;
  const frameScale = sourceFps > 0 ? presetFps / sourceFps : 1;
  const sortedShots = [...doc.shots].sort((left, right) => {
    if (left.start_frame !== right.start_frame) {
      return left.start_frame - right.start_frame;
    }
    return left.shot_id.localeCompare(right.shot_id);
  });

  return sortedShots.map((shot, index) => {
    const from = Math.max(0, Math.round(shot.start_frame * frameScale));
    const duration = Math.max(1, Math.round(shot.duration_frames * frameScale));
    const emphasisWords = coerceStringList(shot.emphasisWords ?? shot.emphasis_words ?? []);
    const narration = fallbackNarration(shot, index);
    const talkText =
      typeof shot.talkText === "string" && shot.talkText.trim().length > 0
        ? shot.talkText.trim()
        : typeof shot.talk_text === "string" && shot.talk_text.trim().length > 0
          ? shot.talk_text.trim()
          : undefined;
    const chartData = buildChartRowsForShot(doc, shot, qcInput, allowSyntheticChartData);
    const chartUnit = chartData.find((row) => typeof row.unit === "string" && row.unit.length > 0)?.unit ?? qcInput?.dataset?.unit;
    const insertAsset = shot.insert_asset
      ? {
          assetId: shot.insert_asset.asset_id,
          type: shot.insert_asset.type,
          layout: shot.insert_asset.layout,
          title: shot.insert_asset.title,
          body: shot.insert_asset.body,
          accentToken: shot.insert_asset.accent_token,
          items: shot.insert_asset.items,
          selection: shot.insert_asset.selection
            ? {
                resolver_id: shot.insert_asset.selection.resolver_id,
                selected_insert_type: shot.insert_asset.selection.selected_insert_type,
                candidate_insert_types: [...shot.insert_asset.selection.candidate_insert_types],
                supporting_kind: shot.insert_asset.selection.supporting_kind,
                educational_mode: shot.insert_asset.selection.educational_mode,
                channel_domain: shot.insert_asset.selection.channel_domain,
                selection_reason: shot.insert_asset.selection.selection_reason
              }
            : undefined
        }
      : undefined;
    const visualPlan = shot.visual_plan
      ? {
          resolver_id: shot.visual_plan.resolver_id,
          educational_mode: shot.visual_plan.educational_mode,
          channel_domain: shot.visual_plan.channel_domain,
          insert_need_candidates: [...shot.visual_plan.insert_need_candidates],
          candidate_intents: shot.visual_plan.candidate_intents.map((intent) => ({
            intent_id: intent.intent_id,
            intent_family: intent.intent_family,
            score: intent.score,
            candidate_insert_types: [...intent.candidate_insert_types],
            candidate_primary_kinds: [...intent.candidate_primary_kinds],
            candidate_supporting_kinds: [...intent.candidate_supporting_kinds],
            selection_reason: intent.selection_reason
          })),
          selected_intent_id: shot.visual_plan.selected_intent_id,
          selected_intent_family: shot.visual_plan.selected_intent_family,
          selected_primary_kind: shot.visual_plan.selected_primary_kind,
          selected_supporting_kind: shot.visual_plan.selected_supporting_kind,
          selected_insert_type: shot.visual_plan.selected_insert_type,
          selection_reason: shot.visual_plan.selection_reason
        }
      : undefined;
    const visualObjects = shot.visual_objects?.map((visualObject) => ({
      objectId: visualObject.object_id,
      kind: visualObject.kind,
      source: visualObject.source,
      semanticRole: visualObject.semantic_role,
      preferredRegion: visualObject.preferred_region,
      safeZoneTags: [...visualObject.safe_zone_tags],
      animationPolicy: visualObject.animation_policy,
      motionPreset: visualObject.motion_preset,
      motionProfileId: visualObject.motion_profile_id,
      fallbackPolicy: visualObject.fallback_policy,
      title: visualObject.title,
      body: visualObject.body,
      accentToken: visualObject.accent_token,
      items: visualObject.items,
      pointerTargetIds: visualObject.pointer_target_ids,
      anchors: visualObject.anchors?.map((anchor) => ({
        anchor_id: anchor.anchor_id,
        type: anchor.type,
        x: anchor.x,
        y: anchor.y,
        width: anchor.width,
        height: anchor.height,
        target_id: anchor.target_id,
        weight: anchor.weight
      })),
      safeArea: visualObject.safe_area
        ? {
            x: visualObject.safe_area.x,
            y: visualObject.safe_area.y,
            width: visualObject.safe_area.width,
            height: visualObject.safe_area.height,
            subtitle_avoid: visualObject.safe_area.subtitle_avoid,
            mascot_avoid: visualObject.safe_area.mascot_avoid,
            pointer_reachable: visualObject.safe_area.pointer_reachable
          }
        : undefined,
      selection: visualObject.selection
        ? {
            resolver_id: visualObject.selection.resolver_id,
            data_shape: visualObject.selection.data_shape,
            educational_mode: visualObject.selection.educational_mode,
            channel_domain: visualObject.selection.channel_domain,
            selected_kind: visualObject.selection.selected_kind,
            candidate_kinds: [...visualObject.selection.candidate_kinds],
            selection_reason: visualObject.selection.selection_reason
          }
        : undefined,
      dataRef: visualObject.data_ref
        ? {
            chartId: visualObject.data_ref.chart_id,
            datasetId: visualObject.data_ref.dataset_id,
            timeRange: visualObject.data_ref.time_range,
            layoutHint: visualObject.data_ref.layout_hint
          }
        : undefined
    }));
    const primaryVisualObject = resolvePrimaryVisualObject(visualObjects);

    const highlightTargetId = shot.chart?.highlights?.[0]?.target_id;
    const pointTargetId = shot.character.tracks.point_track?.[0]?.target_id;
    const preferredPointerTargetId = resolvePreferredPointerTargetId({
      pointTargetId,
      highlightTargetId,
      primaryVisualObject,
      preferVisualFocus: !shot.chart
    });
    const pointerTargetCount = resolvePrimaryVisualPointerTargetCount({
      kind: primaryVisualObject?.kind,
      chartData,
      pointerTargetIds: primaryVisualObject?.pointerTargetIds,
      anchors: primaryVisualObject?.anchors
    });
    const fallbackPointerIndex = Math.min(2, Math.max(0, pointerTargetCount - 1));
    const pointerTargetIndex = resolvePointerTargetIndexFromVisualObject({
      primaryVisualObject,
      preferredTargetId: preferredPointerTargetId,
      pointerTargetCount,
      fallbackIndex: fallbackPointerIndex
    });
    const pointerEnabled =
      pointerTargetCount > 0 &&
      (Boolean(shot.chart) ||
        (shot.character.tracks.point_track?.length ?? 0) > 0 ||
        (primaryVisualObject?.pointerTargetIds?.length ?? 0) > 0);

    const expectOcclusion =
      qcInput?.expectOcclusion ?? Boolean(shot.set.layers?.fg_mask && shot.set.layers.fg_mask.length > 0);
    const layoutPlan = resolveSequenceLayoutPlan({
      width,
      height,
      safeArea,
      chartData,
      hasChart: Boolean(shot.chart),
      visualMode: shot.chart ? "chart" : "table",
      primaryVisualKind: visualObjects?.[0]?.kind,
      visualObjects,
      insertAsset,
      characterX: shot.character.transform.x,
      characterY: shot.character.transform.y,
      pointerEnabled,
      pointerTargetIndex,
      expectOcclusion
    });
    const pointerAnchor = pointerEnabled
      ? layoutPlan.pointerReachability.targetPoint ??
        computePrimaryVisualAnchorInRect({
          kind: primaryVisualObject?.kind,
          chartData,
          pointerTargetIds: primaryVisualObject?.pointerTargetIds,
          anchors: primaryVisualObject?.anchors,
          targetIndex: pointerTargetIndex,
          rect: layoutPlan.primaryVisualBox
        })
      : undefined;

    return applySequenceLayoutFields({
      shotId: shot.shot_id,
      shotType: shot.shot_type ?? "talk",
      renderMode: shot.render_mode ?? "deterministic",
      characterPackId: shot.character.pack_id,
      from,
      duration,
      setId: shot.set.set_id,
      cameraPreset: shot.camera.preset,
      narration,
      emphasisWords,
      talkText,
      chartData,
      visualMode: shot.chart ? "chart" : "table",
      primaryVisualKind: visualObjects?.[0]?.kind,
      visualObjects,
      layoutPlan,
      annotationsEnabled: true,
      pointerTargetIndex,
      pointerEnabled,
      freezePose: false,
      expectOcclusion,
      pointerTip: pointerAnchor,
      unit: chartUnit,
      hasChart: Boolean(shot.chart),
      chartCallout: shot.chart?.callouts?.[0]?.text,
      insertAsset,
      visualPlan,
      characterX: shot.character.transform.x,
      characterY: shot.character.transform.y,
      cameraKeyframes: shot.camera.keyframes.map((keyframe) => ({
        f: Math.max(0, Math.round(keyframe.f * frameScale)),
        x: keyframe.x,
        y: keyframe.y,
        zoom: keyframe.zoom,
        rotateDeg: keyframe.rotate_deg
      })),
      chartHighlights: (shot.chart?.highlights ?? []).map((highlight) => ({
        f: Math.max(0, Math.round(highlight.f * frameScale)),
        targetId: highlight.target_id,
        styleToken: highlight.style_token
      })),
      finishProfile: resolveShotFinishProfile({
        shot,
        profiles
      }),
      characterTracks: {
        posPath: shot.character.tracks.pos_path.map((pathPoint) => ({
          f: Math.max(0, Math.round(pathPoint.f * frameScale)),
          x: pathPoint.x,
          y: pathPoint.y,
          interp: pathPoint.interp
        })),
        actionTrack: shot.character.tracks.action_track.map((action) => ({
          f: Math.max(0, Math.round(action.f * frameScale)),
          clip: action.clip,
          weight: action.weight
        })),
        expressionTrack: shot.character.tracks.expression_track.map((expression) => ({
          f: Math.max(0, Math.round(expression.f * frameScale)),
          expression: expression.expression
        })),
        lookTrack: shot.character.tracks.look_track.map((look) => ({
          f: Math.max(0, Math.round(look.f * frameScale)),
          target: look.target
        })),
        viewTrack: shot.character.tracks.view_track?.map((view) => ({
          f: Math.max(0, Math.round(view.f * frameScale)),
          view: view.view
        })),
        visemeTrack: shot.character.tracks.viseme_track?.map((viseme) => ({
          f: Math.max(0, Math.round(viseme.f * frameScale)),
          viseme: viseme.viseme,
          intensity: viseme.intensity
        })),
        pointTrack: shot.character.tracks.point_track?.map((point) => ({
          f: Math.max(0, Math.round(point.f * frameScale)),
          targetId: point.target_id,
          hand: point.hand
        }))
      },
      transitionHint: resolveTransitionHint(shot)
    }, layoutPlan, pointerAnchor);
  });
}

function resolveSidecarVideoSrcMap(plans: ShotSidecarPlan[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const plan of plans) {
    if (
      plan.status !== "resolved" ||
      (plan.renderMode !== "generative_broll" &&
        plan.renderMode !== "generative_i2v" &&
        plan.renderMode !== "generative_s2v" &&
        plan.renderMode !== "generative_overlay")
    ) {
      continue;
    }
    const metadata = isRecord(plan.metadata) ? plan.metadata : null;
    const publicVideoSrc =
      metadata && typeof metadata.publicVideoSrc === "string" && metadata.publicVideoSrc.trim().length > 0
        ? metadata.publicVideoSrc.trim()
        : null;
    if (!publicVideoSrc) {
      continue;
    }
    map.set(plan.shotId, publicVideoSrc);
  }
  return map;
}

function incrementCounter(target: Record<string, number>, key: string | null | undefined): void {
  if (typeof key !== "string" || key.trim().length === 0) {
    return;
  }
  target[key] = (target[key] ?? 0) + 1;
}

function readSidecarMetadataString(
  metadata: ShotSidecarPlan["metadata"] | undefined,
  camelKey: string,
  snakeKey: string
): string | null {
  if (!metadata) {
    return null;
  }
  const camelValue = metadata[camelKey];
  if (typeof camelValue === "string" && camelValue.trim().length > 0) {
    return camelValue.trim();
  }
  const snakeValue = metadata[snakeKey];
  if (typeof snakeValue === "string" && snakeValue.trim().length > 0) {
    return snakeValue.trim();
  }
  return null;
}

function readSidecarMetadataNumber(
  metadata: ShotSidecarPlan["metadata"] | undefined,
  camelKey: string,
  snakeKey: string
): number | null {
  if (!metadata) {
    return null;
  }
  const camelValue = metadata[camelKey];
  if (typeof camelValue === "number" && Number.isFinite(camelValue)) {
    return camelValue;
  }
  const snakeValue = metadata[snakeKey];
  if (typeof snakeValue === "number" && Number.isFinite(snakeValue)) {
    return snakeValue;
  }
  return null;
}

function summarizeNumericValues(values: number[]): { min: number | null; max: number | null; avg: number | null } {
  if (values.length === 0) {
    return {
      min: null,
      max: null,
      avg: null
    };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: Number(Math.min(...values).toFixed(2)),
    max: Number(Math.max(...values).toFixed(2)),
    avg: Number((total / values.length).toFixed(2))
  };
}

function buildSidecarJudgeSummary(plans: ShotSidecarPlan[]) {
  const summary = {
    accepted_count: 0,
    fallback_count: 0,
    rejected_count: 0,
    planned_count: 0,
    not_applicable_count: 0,
    total_retake_count: 0,
    actual_backend_counts: {} as Record<string, number>,
    renderer_counts: {} as Record<string, number>
  };

  for (const plan of plans) {
    incrementCounter(summary.renderer_counts, plan.renderer);
    summary.total_retake_count += Array.isArray(plan.retakes) ? plan.retakes.length : 0;

    const decision = plan.judge?.decision ?? null;
    if (decision === "accepted") {
      summary.accepted_count += 1;
    } else if (decision === "fallback") {
      summary.fallback_count += 1;
    } else if (decision === "rejected") {
      summary.rejected_count += 1;
    } else if (decision === "not_applicable") {
      summary.not_applicable_count += 1;
    } else if (decision === "planned") {
      summary.planned_count += 1;
    }

    const actualBackend =
      typeof plan.judge?.actualBackendCapability === "string"
        ? plan.judge.actualBackendCapability
        : typeof plan.metadata?.actualBackendCapability === "string"
          ? plan.metadata.actualBackendCapability
          : typeof plan.metadata?.backendCapability === "string"
            ? plan.metadata.backendCapability
            : null;
    incrementCounter(summary.actual_backend_counts, actualBackend);
  }

  return summary;
}

function buildSidecarPresetSummary(plans: ShotSidecarPlan[]) {
  const summary = {
    controlnet_preset_counts: {} as Record<string, number>,
    impact_preset_counts: {} as Record<string, number>,
    qc_preset_counts: {} as Record<string, number>,
    preset_source_counts: {} as Record<string, number>
  };

  for (const plan of plans) {
    incrementCounter(
      summary.controlnet_preset_counts,
      readSidecarMetadataString(plan.metadata, "controlnetPreset", "controlnet_preset")
    );
    incrementCounter(
      summary.impact_preset_counts,
      readSidecarMetadataString(plan.metadata, "impactPreset", "impact_preset")
    );
    incrementCounter(summary.qc_preset_counts, readSidecarMetadataString(plan.metadata, "qcPreset", "qc_preset"));
    incrementCounter(summary.preset_source_counts, readSidecarMetadataString(plan.metadata, "presetSource", "preset_source"));
  }

  return summary;
}

function buildSidecarRolloutSummary(plans: ShotSidecarPlan[]) {
  const summary = {
    applied_count: 0,
    source_counts: {} as Record<string, number>,
    source_kind_counts: {} as Record<string, number>,
    channel_domain_counts: {} as Record<string, number>,
    scenario_counts: {} as Record<string, number>,
    verdict_counts: {} as Record<string, number>,
    target_counts: {} as Record<string, number>,
    min_score: null as number | null,
    max_score: null as number | null,
    avg_score: null as number | null,
    min_artifact_age_hours: null as number | null,
    max_artifact_age_hours: null as number | null,
    avg_artifact_age_hours: null as number | null
  };
  const scores: number[] = [];
  const artifactAges: number[] = [];

  for (const plan of plans) {
    const source = readSidecarMetadataString(plan.metadata, "presetRolloutSource", "preset_rollout_source");
    if (!source) {
      continue;
    }
    summary.applied_count += 1;
    incrementCounter(summary.source_counts, source);
    incrementCounter(
      summary.source_kind_counts,
      readSidecarMetadataString(plan.metadata, "presetRolloutSourceKind", "preset_rollout_source_kind")
    );
    incrementCounter(
      summary.channel_domain_counts,
      readSidecarMetadataString(plan.metadata, "presetRolloutChannelDomain", "preset_rollout_channel_domain")
    );
    incrementCounter(
      summary.scenario_counts,
      readSidecarMetadataString(plan.metadata, "presetRolloutScenario", "preset_rollout_scenario")
    );
    incrementCounter(
      summary.verdict_counts,
      readSidecarMetadataString(plan.metadata, "presetRolloutVerdict", "preset_rollout_verdict")
    );
    incrementCounter(
      summary.target_counts,
      readSidecarMetadataString(plan.metadata, "presetRolloutTarget", "preset_rollout_target")
    );
    const score = readSidecarMetadataNumber(plan.metadata, "presetRolloutScore", "preset_rollout_score");
    if (score !== null) {
      scores.push(score);
    }
    const artifactAgeHours = readSidecarMetadataNumber(
      plan.metadata,
      "presetRolloutArtifactAgeHours",
      "preset_rollout_artifact_age_hours"
    );
    if (artifactAgeHours !== null) {
      artifactAges.push(artifactAgeHours);
    }
  }

  const scoreStats = summarizeNumericValues(scores);
  summary.min_score = scoreStats.min;
  summary.max_score = scoreStats.max;
  summary.avg_score = scoreStats.avg;
  const artifactAgeStats = summarizeNumericValues(artifactAges);
  summary.min_artifact_age_hours = artifactAgeStats.min;
  summary.max_artifact_age_hours = artifactAgeStats.max;
  summary.avg_artifact_age_hours = artifactAgeStats.avg;
  return summary;
}

function buildVisualPlanSummary(sequences: DeterministicSequence[]): DeterministicVisualPlanSummary {
  const summary: DeterministicVisualPlanSummary = {
    shot_count: 0,
    planner_resolver_counts: {},
    intent_family_counts: {},
    primary_kind_counts: {},
    supporting_kind_counts: {},
    insert_type_counts: {},
    channel_domain_counts: {},
    pair_counts: {}
  };

  for (const sequence of sequences) {
    const visualPlan = sequence.visualPlan;
    if (!visualPlan) {
      continue;
    }
    summary.shot_count += 1;
    incrementCounter(summary.planner_resolver_counts, visualPlan.resolver_id);
    incrementCounter(summary.intent_family_counts, visualPlan.selected_intent_family);
    incrementCounter(summary.primary_kind_counts, visualPlan.selected_primary_kind);
    incrementCounter(summary.supporting_kind_counts, visualPlan.selected_supporting_kind);
    incrementCounter(summary.insert_type_counts, visualPlan.selected_insert_type);
    incrementCounter(summary.channel_domain_counts, visualPlan.channel_domain);

    const pairKey = [
      visualPlan.selected_intent_family,
      visualPlan.selected_primary_kind ?? "none",
      visualPlan.selected_supporting_kind ?? "none",
      visualPlan.selected_insert_type ?? "none"
    ].join("::");
    incrementCounter(summary.pair_counts, pairKey);
  }

  return summary;
}

async function buildShotSidecarPlans(
  doc: RenderableShotsDocument,
  outputRootDir: string,
  renderer?: OrchestrateRenderInput["shotSidecarRenderer"],
  renderContext?: {
    fps: number;
    width: number;
    height: number;
    attempt: number;
    maxAttempts: number;
  }
): Promise<ShotSidecarPlan[]> {
  const plans: ShotSidecarPlan[] = [];

  for (let index = 0; index < doc.shots.length; index += 1) {
    const shot = doc.shots[index];
    const shotType = shot.shot_type ?? "talk";
    const renderMode = shot.render_mode ?? "deterministic";
    if (renderMode === "deterministic") {
      continue;
    }
    const shotSidecarPreset = shot.sidecar_preset;

    const fallbackPlan: ShotSidecarPlan = {
      shotId: shot.shot_id,
      shotType,
      renderMode,
      status: "planned",
      renderer: "unconfigured",
      notes: "No shot sidecar renderer configured. Deterministic main render remains active.",
      judge: {
        candidateId: `${shot.shot_id}:unconfigured`,
        attemptIndex: renderContext?.attempt ?? 1,
        decision: "planned",
        accepted: false,
        judgeSource: "renderer_default",
        requestedRenderer: "unconfigured",
        requestedBackend: null,
        actualRenderer: "unconfigured",
        actualBackendCapability: null,
        reason: "No shot sidecar renderer configured."
      },
      retakes: [],
      metadata: {
        controlnetPreset:
          typeof shotSidecarPreset?.controlnet_preset === "string" ? shotSidecarPreset.controlnet_preset : null,
        impactPreset: typeof shotSidecarPreset?.impact_preset === "string" ? shotSidecarPreset.impact_preset : null,
        qcPreset: typeof shotSidecarPreset?.qc_preset === "string" ? shotSidecarPreset.qc_preset : null,
        presetSource: typeof shotSidecarPreset?.preset_source === "string" ? shotSidecarPreset.preset_source : null,
        presetRolloutSource:
          typeof (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_source === "string"
            ? ((shotSidecarPreset as Record<string, unknown>).preset_rollout_source as string)
            : null,
        presetRolloutSourceKind:
          (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_source_kind === "file" ||
          (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_source_kind === "matrix"
            ? ((shotSidecarPreset as Record<string, unknown>).preset_rollout_source_kind as "file" | "matrix")
            : null,
        presetRolloutScenario:
          typeof (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_scenario === "string"
            ? ((shotSidecarPreset as Record<string, unknown>).preset_rollout_scenario as string)
            : null,
        presetRolloutScore:
          typeof (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_score === "number"
            ? ((shotSidecarPreset as Record<string, unknown>).preset_rollout_score as number)
            : null,
        presetRolloutVerdict:
          typeof (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_verdict === "string"
            ? ((shotSidecarPreset as Record<string, unknown>).preset_rollout_verdict as string)
            : null,
        presetRolloutTarget:
          (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_target === "overall" ||
          (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_target === "balanced" ||
          (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_target === "strict"
            ? ((shotSidecarPreset as Record<string, unknown>).preset_rollout_target as "overall" | "balanced" | "strict")
            : null,
        presetRolloutArtifactAgeHours:
          typeof (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_artifact_age_hours ===
          "number"
            ? ((shotSidecarPreset as Record<string, unknown>).preset_rollout_artifact_age_hours as number)
            : null,
        presetRolloutChannelDomain:
          (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_channel_domain === "economy" ||
          (shotSidecarPreset as Record<string, unknown> | undefined)?.preset_rollout_channel_domain === "medical"
            ? ((shotSidecarPreset as Record<string, unknown>).preset_rollout_channel_domain as "economy" | "medical")
            : null,
        policyTags: Array.isArray(shotSidecarPreset?.policy_tags)
          ? shotSidecarPreset.policy_tags.filter((entry): entry is string => typeof entry === "string")
          : []
      }
    };

    if (!renderer) {
      plans.push(fallbackPlan);
      continue;
    }

    try {
      const resolved =
        (await renderer({
          episodeId: doc.episode.episode_id,
          shot,
          shotType,
          renderMode,
          narration: fallbackNarration(shot, index),
          outputRootDir,
          fps: renderContext?.fps ?? DEFAULT_PRESET.fps,
          width: renderContext?.width ?? DEFAULT_PRESET.width,
          height: renderContext?.height ?? DEFAULT_PRESET.height,
          attempt: renderContext?.attempt ?? 1,
          maxAttempts: renderContext?.maxAttempts ?? 1
        })) ?? fallbackPlan;
      plans.push(resolved);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
        plans.push({
          ...fallbackPlan,
          status: "failed",
          renderer: "sidecar_error",
          notes: `Sidecar planning failed: ${message}`,
          judge: {
            candidateId: `${shot.shot_id}:sidecar_error`,
            attemptIndex: renderContext?.attempt ?? 1,
            decision: "rejected",
            accepted: false,
            judgeSource: "renderer_default",
            requestedRenderer: "sidecar_error",
            requestedBackend: null,
            actualRenderer: "sidecar_error",
            actualBackendCapability: null,
            reason: message
          },
          retakes: []
        });
      }
    }

  return plans;
}

function readShotsDocument(filePath: string): RenderableShotsDocument {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as RenderableShotsDocument;
  const validator = createValidator();
  const validated = validator.validate("shots.schema.json", parsed);

  if (!validated.ok) {
    const details = validated.errors.map((entry) => `${entry.path} ${entry.message}`).join("; ");
    throw new Error(`Invalid shots document: ${details}`);
  }

  if (!Array.isArray(parsed.shots) || parsed.shots.length === 0) {
    throw new Error("shots.json has no shots");
  }

  return parsed;
}

function resolveCharacterPackCandidatePaths(repoRoot: string, packId: string): string[] {
  return [
    path.join(repoRoot, "assets", "generated", "characters", packId, "pack", "character.pack.json"),
    path.join(repoRoot, "out", "characters", packId, "pack.json")
  ];
}

function readGeneratedPackAcceptance(repoRoot: string, packId: string): {
  manifestPath: string;
  status: string;
  reportPath?: string;
} | null {
  const manifestPath = path.join(repoRoot, "assets", "generated", "characters", packId, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    acceptance?: {
      status?: string;
      report_path?: string;
    };
    qc?: {
      acceptance_status?: string;
      report_path?: string;
    };
  };
  const status = parsed.acceptance?.status ?? parsed.qc?.acceptance_status ?? "blocked";
  return {
    manifestPath,
    status,
    reportPath: parsed.acceptance?.report_path ?? parsed.qc?.report_path
  };
}

function readResolvedCharacterPacks(
  repoRoot: string,
  doc: RenderableShotsDocument,
  allowUnacceptedGeneratedPacks: boolean = false
): Record<string, unknown> {
  const validator = createValidator();
  const packIds = [...new Set(doc.shots.map((shot) => shot.character.pack_id).filter((value) => value.trim().length > 0))];
  const packs: Record<string, unknown> = {};

  for (const packId of packIds) {
    if (packId === "eraser-cat-minimal" || packId === "eraser-cat-turning") {
      continue;
    }

    const candidatePath = resolveCharacterPackCandidatePaths(repoRoot, packId).find((entry) => fs.existsSync(entry));
    if (!candidatePath) {
      continue;
    }

    const generatedPackPath = path.join(repoRoot, "assets", "generated", "characters", packId, "pack", "character.pack.json");
    if (candidatePath === generatedPackPath && !allowUnacceptedGeneratedPacks) {
      const acceptance = readGeneratedPackAcceptance(repoRoot, packId);
      if (!acceptance) {
        throw new Error(`Generated character pack ${packId} is missing manifest.json and cannot be rendered safely.`);
      }
      if (acceptance.status !== "accepted") {
        const reportHint = acceptance.reportPath ? ` See ${acceptance.reportPath}` : "";
        throw new Error(
          `Generated character pack ${packId} is not accepted for render (status=${acceptance.status}).${reportHint}`
        );
      }
    }

    const parsed = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as unknown;
    const validation = validator.validate("character_pack.schema.json", parsed);
    if (!validation.ok) {
      const details = validation.errors.map((entry) => `${entry.path} ${entry.message}`).join("; ");
      throw new Error(`Invalid character pack for ${packId}: ${details}`);
    }
    packs[packId] = parsed;
  }

  return packs;
}

function resolvePaths(input: OrchestrateRenderInput) {
  const repoRoot = resolveRepoRoot();
  const shotsPath = path.resolve(input.shotsPath ?? path.join(repoRoot, "out", "shots.json"));
  const outputPath = path.resolve(input.outputPath ?? path.join(repoRoot, "out", "render_episode.mp4"));
  const narrationAlignmentArtifactPath = path.resolve(
    path.join(path.dirname(outputPath), "narration_alignment.json")
  );
  const srtPath = path.resolve(
    input.srtPath ??
      path.join(path.dirname(outputPath), `${path.basename(outputPath, path.extname(outputPath))}.srt`)
  );
  const qcReportPath = path.resolve(
    input.qcReportPath ?? path.join(path.dirname(outputPath), "qc_report.json")
  );
  const episodeRegressionReportPath = path.resolve(
    input.episodeRegressionReportPath ?? path.join(path.dirname(outputPath), "episode_regression_report.json")
  );
  const renderLogPath = path.resolve(
    input.renderLogPath ??
      path.join(path.dirname(outputPath), `${path.basename(outputPath, path.extname(outputPath))}.render_log.json`)
  );
  const sidecarPlanPath = path.resolve(
    input.sidecarPlanPath ?? path.join(path.dirname(outputPath), "shot_sidecar_plan.json")
  );
  const propsPath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, path.extname(outputPath))}.props.json`
  );
  const videoDir = path.join(repoRoot, "apps", "video");
  const remotionCliPath = path.join(videoDir, "node_modules", "@remotion", "cli", "remotion-cli.js");
  return {
    shotsPath,
    outputPath,
    narrationAlignmentArtifactPath,
    srtPath,
    qcReportPath,
    episodeRegressionReportPath,
    renderLogPath,
    sidecarPlanPath,
    propsPath,
    videoDir,
    remotionCliPath
  };
}

function tokenizeNarrationWords(text: string): string[] {
  return text
    .match(/[A-Za-z0-9']+/g)
    ?.map((token) => token.trim())
    .filter((token) => token.length > 0) ?? [];
}

function countNarrationVowelGroups(text: string): number {
  return text.toLowerCase().match(/[aeiouy]+/g)?.length ?? 0;
}

function resolveNarrationViseme(word: string): "mouth_closed" | "mouth_open_small" | "mouth_open_wide" | "mouth_round_o" {
  const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.length === 0) {
    return "mouth_closed";
  }
  if (/(oo|oh|ou|ow|o|u)/.test(normalized)) {
    return "mouth_round_o";
  }
  if (/(aa|ee|ai|ay|ei)|[ae]/.test(normalized)) {
    return normalized.length >= 4 ? "mouth_open_wide" : "mouth_open_small";
  }
  return "mouth_open_small";
}

function resolveNarrationVisemeIntensity(
  viseme: ReturnType<typeof resolveNarrationViseme>,
  word: string
): number {
  const syllableWeight = Math.max(1, countNarrationVowelGroups(word));
  if (viseme === "mouth_open_wide") {
    return Math.min(1, 0.72 + syllableWeight * 0.1);
  }
  if (viseme === "mouth_round_o") {
    return Math.min(0.92, 0.62 + syllableWeight * 0.08);
  }
  if (viseme === "mouth_open_small") {
    return Math.min(0.8, 0.48 + syllableWeight * 0.06);
  }
  return 0;
}

function resolveNarrationWordWeight(word: string): number {
  return Math.max(1, Math.min(6, word.length * 0.18 + countNarrationVowelGroups(word) * 0.85));
}

function buildFallbackNarrationAlignmentArtifact(
  sequences: DeterministicSequence[],
  fps: number
): {
  schema_version: "1.0";
  generated_at: string;
  strategy: string;
  provider: string;
  sourceKind: "heuristic" | "provider";
  audio_duration_sec: number;
  planned_duration_sec: number;
  shots: Array<Record<string, unknown>>;
} {
  const totalDurationSec = sequences.reduce((maxSec, sequence) => {
    return Math.max(maxSec, (sequence.from + sequence.duration) / Math.max(1, fps));
  }, 0);

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    strategy: "render_orchestrator_fallback_v1",
    provider: sequences.some((sequence) => sequence.alignment?.sourceKind === "provider")
      ? "render_orchestrator_provider_passthrough"
      : "render_orchestrator_fallback",
    sourceKind: sequences.some((sequence) => sequence.alignment?.sourceKind === "provider") ? "provider" : "heuristic",
    audio_duration_sec: totalDurationSec,
    planned_duration_sec: totalDurationSec,
    shots: sequences.map((sequence) => {
      const startSec = sequence.from / Math.max(1, fps);
      const durationSec = Math.max(1, sequence.duration) / Math.max(1, fps);
      const endSec = startSec + durationSec;

      if (sequence.alignment) {
        return {
          shotId: sequence.shotId,
          startSec,
          endSec,
          durationSec,
          text: sequence.narration,
          provider: sequence.alignment.provider,
          ...(sequence.alignment.version ? { version: sequence.alignment.version } : {}),
          sourceKind: sequence.alignment.sourceKind,
          words: sequence.alignment.words,
          visemeCues: sequence.alignment.visemeCues,
          pauseMap: sequence.alignment.pauseMap,
          emphasisWords: sequence.alignment.emphasisWords
        };
      }

      const narrationWords = tokenizeNarrationWords(sequence.narration);
      if (narrationWords.length === 0) {
        return {
          shotId: sequence.shotId,
          startSec,
          endSec,
          durationSec,
          text: sequence.narration,
          words: [],
          visemeCues: [
            {
              timeSec: startSec,
              localTimeSec: 0,
              viseme: "mouth_closed",
              intensity: 0
            },
            {
              timeSec: endSec,
              localTimeSec: durationSec,
              viseme: "mouth_closed",
              intensity: 0
            }
          ]
        };
      }

      const leadInSec = Math.min(0.12, durationSec * 0.08);
      const tailOutSec = Math.min(0.14, durationSec * 0.1);
      const speechStartSec = startSec + leadInSec;
      const speechEndSec = Math.max(speechStartSec + 0.1, endSec - tailOutSec);
      const speakingDurationSec = Math.max(0.1, speechEndSec - speechStartSec);
      const totalWeight = narrationWords.reduce((sum, word) => sum + resolveNarrationWordWeight(word), 0);
      let cursor = speechStartSec;

      const words = narrationWords.map((word, index) => {
        const ratio = resolveNarrationWordWeight(word) / Math.max(1, totalWeight);
        const rawDuration = speakingDurationSec * ratio;
        const gapSec = Math.min(0.05, rawDuration * 0.18);
        const wordStartSec = cursor;
        const isLast = index === narrationWords.length - 1;
        const wordEndSec = isLast
          ? speechEndSec
          : Math.min(speechEndSec, wordStartSec + Math.max(0.06, rawDuration - gapSec));
        cursor = isLast ? speechEndSec : Math.min(speechEndSec, wordEndSec + gapSec);
        const viseme = resolveNarrationViseme(word);
        return {
          text: word,
          startSec: wordStartSec,
          endSec: wordEndSec,
          localStartSec: Math.max(0, wordStartSec - startSec),
          localEndSec: Math.max(0, wordEndSec - startSec),
          viseme,
          intensity: resolveNarrationVisemeIntensity(viseme, word),
          emphasis: false
        };
      });

      return {
        shotId: sequence.shotId,
        startSec,
        endSec,
        durationSec,
        text: sequence.narration,
        words,
        visemeCues: [
          {
            timeSec: startSec,
            localTimeSec: 0,
            viseme: "mouth_closed",
            intensity: 0
          },
          ...words.flatMap((word) => [
            {
              timeSec: word.startSec,
              localTimeSec: word.localStartSec,
              viseme: word.viseme,
              intensity: word.intensity
            },
            {
              timeSec: word.endSec,
              localTimeSec: word.localEndSec,
              viseme: "mouth_closed" as const,
              intensity: 0
            }
          ]),
          {
            timeSec: endSec,
            localTimeSec: durationSec,
            viseme: "mouth_closed",
            intensity: 0
          }
        ]
      };
    })
  };
}

function persistNarrationAlignmentArtifact(
  sourcePath: string | undefined,
  targetPath: string,
  sequences: DeterministicSequence[],
  fps: number
): void {
  ensureDir(path.dirname(targetPath));
  if (sourcePath && fs.existsSync(sourcePath)) {
    const resolvedSourcePath = path.resolve(sourcePath);
    const resolvedTargetPath = path.resolve(targetPath);
    if (resolvedSourcePath !== resolvedTargetPath) {
      fs.copyFileSync(resolvedSourcePath, resolvedTargetPath);
    }
    return;
  }

  writeJson(targetPath, buildFallbackNarrationAlignmentArtifact(sequences, fps));
}

function getFinalQcIssues(report: VisualQcReport): VisualQcIssue[] {
  const finalRun = report.runs[report.runs.length - 1];
  return finalRun?.issues ?? [];
}

function getQcCounts(report: VisualQcReport): { errors: number; warnings: number } {
  const finalRun = report.runs[report.runs.length - 1];
  if (!finalRun) {
    return { errors: 0, warnings: 0 };
  }
  return {
    errors: finalRun.errorCount,
    warnings: finalRun.warnCount
  };
}

function createStaticAlignmentProvider(hook?: AlignmentHook): SubtitleAlignmentProvider | undefined {
  if (!hook) {
    return undefined;
  }
  return async () => hook;
}

export async function orchestrateRenderEpisode(input: OrchestrateRenderInput = {}): Promise<OrchestrateRenderResult> {
  const preset: RenderPreset = {
    ...DEFAULT_PRESET,
    ...input.preset,
    safeArea: {
      ...DEFAULT_PRESET.safeArea,
      ...(input.preset?.safeArea ?? {})
    }
  };
  const attempt = Math.max(1, input.attempt ?? 1);
  const maxAttempts = Math.max(attempt, input.maxAttempts ?? attempt);
  const compositionId = input.compositionId ?? DEFAULT_COMPOSITION_ID;
  const dryRun = input.dryRun ?? false;

  const paths = resolvePaths(input);
  const startedAt = new Date();
  let qcReport: VisualQcReport | null = null;
  let episodeRegressionReport: EpisodeRegressionReport | null = null;
  let qcPassed = false;
  let fallbackStepsApplied: string[] = [];
  let finalQcIssues: VisualQcIssue[] = [];
  let finalQcCounts = { errors: 0, warnings: 0 };
  let episodeFinishProfile: EpisodeRenderProps["episodeFinishProfile"];

  let sequences: DeterministicSequence[] = [];
  let freezeCharacterPose = false;
  let subtitles = [] as ReturnType<typeof buildSubtitleCues>;
  let totalFrames = 0;
  let safeArea = preset.safeArea;
  let sidecarPlans: ShotSidecarPlan[] = [];
  let characterPacks: Record<string, unknown> = {};
  let resolvedProfiles = resolveProfiles();

  const command = [
    paths.remotionCliPath,
    "render",
    "src/index.ts",
    compositionId,
    paths.outputPath,
    "--overwrite",
    `--width=${preset.width}`,
    `--height=${preset.height}`,
    `--fps=${preset.fps}`,
    `--codec=${preset.codec}`,
    `--video-bitrate=${preset.videoBitrate}`,
    `--x264-preset=${preset.x264Preset}`
  ];

  let stdout = "";
  let stderr = "";

  try {
    const shotsDoc = readShotsDocument(paths.shotsPath);
    resolvedProfiles = resolveProfiles(coerceProfileSelection(shotsDoc.episode.profiles));
    characterPacks = readResolvedCharacterPacks(
      resolveRepoRoot(),
      shotsDoc,
      input.allowUnacceptedGeneratedPacks ?? false
    );
    safeArea = toSafeAreaPixels(shotsDoc, preset);
    sidecarPlans = await buildShotSidecarPlans(
      shotsDoc,
      path.dirname(paths.outputPath),
      input.shotSidecarRenderer,
      {
        fps: preset.fps,
        width: preset.width,
        height: preset.height,
        attempt,
        maxAttempts
      }
    );
    writeJson(paths.sidecarPlanPath, {
      schema_version: "1.0",
      generated_at: new Date().toISOString(),
      episode_id: shotsDoc.episode.episode_id,
      shots_path: paths.shotsPath,
      plans: sidecarPlans
    });

    const narrationAlignmentByShot = normalizeNarrationAlignmentDocument(input.narrationAlignmentPath);
    const rawSequences = buildDeterministicSequences(
      shotsDoc,
      preset.width,
      preset.height,
      safeArea,
      preset.fps,
      input.qc,
      resolvedProfiles,
      input.allowSyntheticChartData ?? false
    );
    episodeFinishProfile = resolveEpisodeFinishProfile({
      profiles: resolvedProfiles,
      sequences: rawSequences
    });
    const baseSequences = applyEpisodeFinishConsistency(
      applyAlignmentAwareActingTimeline(
        applyNarrationAlignmentToSequences(rawSequences, preset.fps, narrationAlignmentByShot),
        preset.fps,
        resolvedProfiles
      ),
      episodeFinishProfile
    );
    const qcEvaluation = runVisualQcWithFallback({
      width: preset.width,
      height: preset.height,
      safeArea,
      sequences: baseSequences,
      qcInput: input.qc
    });

    qcReport = qcEvaluation.report;
    writeJson(paths.qcReportPath, qcReport);

    qcPassed = qcReport.final_passed;
    fallbackStepsApplied = [...qcReport.fallback_steps_applied];
    finalQcIssues = getFinalQcIssues(qcReport);
    finalQcCounts = getQcCounts(qcReport);

    if (!qcPassed) {
      throw new Error(`Visual QC failed. See report: ${paths.qcReportPath}`);
    }

    const sidecarVideoSrcMap = resolveSidecarVideoSrcMap(sidecarPlans);
    sequences = qcEvaluation.sequences.map((sequence) => ({
      ...sequence,
      sidecarVideoSrc: sidecarVideoSrcMap.get(sequence.shotId)
    }));
    freezeCharacterPose = qcEvaluation.freezeCharacterPose;

    const baseSubtitles = buildSubtitleCues(sequences, preset.fps);
    const fallbackAlignmentHook = buildNarrationAlignmentHook(preset.fps, narrationAlignmentByShot, input.alignmentHook);
    const resolvedAlignmentHook = await resolveAlignmentHook({
      sequences,
      cues: baseSubtitles,
      fps: preset.fps,
      provider: createFailoverSubtitleAlignmentProvider(
        input.subtitleAlignmentProvider,
        createStaticAlignmentProvider(fallbackAlignmentHook)
      )
    });
    subtitles = resolvedAlignmentHook ? buildSubtitleCues(sequences, preset.fps, resolvedAlignmentHook) : baseSubtitles;
    totalFrames = sequences.reduce((maxFrame, sequence) => {
      return Math.max(maxFrame, sequence.from + sequence.duration);
    }, 0);

    const props: EpisodeRenderProps = {
      episodeId: shotsDoc.episode.episode_id,
      safeArea,
      freezeCharacterPose,
      sequences,
      subtitles,
      episodeFinishProfile,
      characterPacks,
      profiles: resolvedProfiles
    };

    writeJson(paths.propsPath, props);
    persistNarrationAlignmentArtifact(
      input.narrationAlignmentPath,
      paths.narrationAlignmentArtifactPath,
      sequences,
      preset.fps
    );
    writeText(paths.srtPath, toSrt(subtitles, preset.fps));
    episodeRegressionReport = buildEpisodeRegressionReport({
      episodeId: shotsDoc.episode.episode_id,
      sequences,
      episodeFinishProfile
    });
    writeJson(paths.episodeRegressionReportPath, episodeRegressionReport);

    command.push(`--frames=0-${Math.max(0, totalFrames - 1)}`);
    command.push(`--props=${paths.propsPath}`);

    if (!dryRun) {
      if (!fs.existsSync(paths.remotionCliPath)) {
        throw new Error(`Remotion CLI not found: ${paths.remotionCliPath}`);
      }

      ensureDir(path.dirname(paths.outputPath));

      const result = spawnSync(process.execPath, command, {
        cwd: paths.videoDir,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024
      });

      stdout = result.stdout ?? "";
      stderr = result.stderr ?? "";

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error(`Remotion render failed with exit code ${result.status ?? 1}`);
      }
    }

    const finishedAt = new Date();
    const log: RenderLog = {
      schema_version: "1.0",
      status: "SUCCEEDED",
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      attempt,
      max_attempts: maxAttempts,
      shots_path: paths.shotsPath,
      output_path: paths.outputPath,
      srt_path: paths.srtPath,
      narration_alignment_path: paths.narrationAlignmentArtifactPath,
      qc_report_path: paths.qcReportPath,
      episode_regression_report_path: paths.episodeRegressionReportPath,
      sidecar_plan_path: paths.sidecarPlanPath,
      props_path: paths.propsPath,
      composition_id: compositionId,
      command,
      preset,
      sequence_count: sequences.length,
      sidecar_plan_count: sidecarPlans.length,
      subtitle_count: subtitles.length,
      total_frames: totalFrames,
      qc_passed: qcPassed,
      fallback_steps_applied: fallbackStepsApplied,
      qc_error_count: finalQcCounts.errors,
      qc_warning_count: finalQcCounts.warnings,
      finish_profile_ids: [...new Set(sequences.map((sequence) => sequence.finishProfile?.id).filter(isNonEmptyString))],
      finish_consistency_summary: buildFinishConsistencySummary(sequences, episodeFinishProfile),
      episode_regression_summary: episodeRegressionReport
        ? summarizeEpisodeRegressionReport(episodeRegressionReport)
        : undefined,
      visual_plan_summary: buildVisualPlanSummary(sequences),
      sidecar_judge_summary: buildSidecarJudgeSummary(sidecarPlans),
      sidecar_preset_summary: buildSidecarPresetSummary(sidecarPlans),
      sidecar_rollout_summary: buildSidecarRolloutSummary(sidecarPlans),
      profiles: resolvedProfiles,
      stdout: limitLogText(stdout),
      stderr: limitLogText(stderr)
    };
    writeJson(paths.renderLogPath, log);

    return {
      outputPath: paths.outputPath,
      srtPath: paths.srtPath,
      narrationAlignmentPath: paths.narrationAlignmentArtifactPath,
      qcReportPath: paths.qcReportPath,
      episodeRegressionReportPath: paths.episodeRegressionReportPath,
      renderLogPath: paths.renderLogPath,
      sidecarPlanPath: paths.sidecarPlanPath,
      propsPath: paths.propsPath,
      sequenceCount: sequences.length,
      sidecarPlanCount: sidecarPlans.length,
      subtitleCount: subtitles.length,
      totalFrames,
      qcPassed,
      fallbackStepsApplied,
      qcErrorCount: finalQcCounts.errors,
      qcWarningCount: finalQcCounts.warnings,
      qcFinalIssues: finalQcIssues,
      status: "SUCCEEDED"
    };
  } catch (error) {
    const finishedAt = new Date();
    const err = error instanceof Error ? error : new Error(String(error));

    if (!qcReport) {
      const failReport: VisualQcReport = {
        schema_version: "1.0",
        generated_at: new Date().toISOString(),
        final_passed: false,
        final_stage: "pre_qc_failure",
        fallback_steps_applied: [],
        runs: []
      };
      writeJson(paths.qcReportPath, failReport);
      qcReport = failReport;
      finalQcIssues = [];
      finalQcCounts = { errors: 1, warnings: 0 };
      qcPassed = false;
      fallbackStepsApplied = [];
    }
    if (!episodeRegressionReport) {
      const failRegressionReport: EpisodeRegressionReport = {
        schema_version: "1.0",
        generated_at: new Date().toISOString(),
        episode_id: "unknown",
        final_passed: false,
        error_count: 1,
        warning_count: 0,
        checks: [],
        issues: [
          {
            code: "episode_regression_preflight_failure",
            severity: "ERROR",
            message: "Episode regression could not run because render orchestration failed before final sequence assembly."
          }
        ],
        continuity_summary: {
          shot_count: sequences.length,
          adjacent_pair_count: Math.max(0, sequences.length - 1),
          visual_plan_shot_count: sequences.filter((sequence) => sequence.visualPlan).length,
          visual_plan_missing_count: Math.max(
            0,
            sequences.filter(
              (sequence) =>
                sequence.visualPlan ||
                Boolean(sequence.primaryVisualKind) ||
                Boolean(sequence.insertAsset) ||
                (sequence.visualObjects?.length ?? 0) > 0
            ).length - sequences.filter((sequence) => sequence.visualPlan).length
          ),
          finish_profile_ids: [...new Set(sequences.map((sequence) => sequence.finishProfile?.id).filter(isNonEmptyString))],
          episode_finish_profile_id: episodeFinishProfile?.id ?? null,
          mascot_pack_counts: {},
          render_mode_counts: {},
          primary_visual_kind_counts: {},
          visual_planner_resolver_counts: {},
          visual_intent_family_counts: {},
          visual_insert_type_counts: {},
          visual_channel_domain_counts: {},
          visual_pair_counts: {},
          visual_intent_transition_counts: {},
          max_character_position_delta: null,
          max_narration_box_delta: null,
          max_primary_visual_box_delta: null,
          max_finish_drift_score: null,
          max_render_path_transition_drift_score: null,
          aligned_shot_count: sequences.filter((sequence) => sequence.alignment).length
        }
      };
      episodeRegressionReport = failRegressionReport;
      writeJson(paths.episodeRegressionReportPath, failRegressionReport);
    }

    const log: RenderLog = {
      schema_version: "1.0",
      status: "FAILED",
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      attempt,
      max_attempts: maxAttempts,
      shots_path: paths.shotsPath,
      output_path: paths.outputPath,
      srt_path: paths.srtPath,
      narration_alignment_path: paths.narrationAlignmentArtifactPath,
      qc_report_path: paths.qcReportPath,
      episode_regression_report_path: paths.episodeRegressionReportPath,
      sidecar_plan_path: paths.sidecarPlanPath,
      props_path: paths.propsPath,
      composition_id: compositionId,
      command,
      preset,
      sequence_count: sequences.length,
      sidecar_plan_count: sidecarPlans.length,
      subtitle_count: subtitles.length,
      total_frames: totalFrames,
      qc_passed: qcPassed,
      fallback_steps_applied: fallbackStepsApplied,
      qc_error_count: finalQcCounts.errors,
      qc_warning_count: finalQcCounts.warnings,
      finish_profile_ids: [...new Set(sequences.map((sequence) => sequence.finishProfile?.id).filter(isNonEmptyString))],
      finish_consistency_summary: buildFinishConsistencySummary(sequences, episodeFinishProfile),
      episode_regression_summary: summarizeEpisodeRegressionReport(episodeRegressionReport),
      visual_plan_summary: buildVisualPlanSummary(sequences),
      sidecar_judge_summary: buildSidecarJudgeSummary(sidecarPlans),
      sidecar_preset_summary: buildSidecarPresetSummary(sidecarPlans),
      sidecar_rollout_summary: buildSidecarRolloutSummary(sidecarPlans),
      profiles: resolvedProfiles,
      stdout: limitLogText(stdout),
      stderr: limitLogText(stderr),
      error: {
        message: err.message,
        stack: err.stack
      }
    };
    writeJson(paths.renderLogPath, log);
    throw err;
  }
}



