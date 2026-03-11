import {
  coerceBenchmarkedMotionPreset,
  resolveMotionBenchmarkThresholds,
  resolveMotionProfile
} from "@ec/profiles";
import type {
  ChannelVisualMotionProfileId,
  ChannelVisualMotionPresetId,
  MotionBenchmarkThresholds
} from "@ec/profiles";
import { interpolate, spring } from "remotion";

export type VisualMotionAnimationPolicy = "hold" | "emphasis_pulse" | "presenter_guided";

export type VisualMotionBenchmarkConfig = {
  motionPreset: ChannelVisualMotionPresetId;
  motionProfileId: ChannelVisualMotionProfileId;
  introFrames: number;
  detailFrames: number;
  itemStaggerFrames: number;
  itemRevealFrames: number;
  slideX: number;
  slideY: number;
  scaleFrom: number;
  emphasisBoostCap: number;
  thresholds: MotionBenchmarkThresholds;
};

export type VisualMotionState = {
  motionPreset: ChannelVisualMotionPresetId;
  motionProfileId: ChannelVisualMotionProfileId;
  localFrame: number;
  panelProgress: number;
  detailProgress: number;
  sweepProgress: number;
  itemStaggerFrames: number;
  itemRevealFrames: number;
  panelOpacity: number;
  panelTranslateX: number;
  panelTranslateY: number;
  panelScale: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampMagnitude(value: number, maxMagnitude: number): number {
  return clamp(value, -Math.abs(maxMagnitude), Math.abs(maxMagnitude));
}

function fallbackCandidatesForPreset(candidatePreset: ChannelVisualMotionPresetId): ChannelVisualMotionPresetId[] {
  switch (candidatePreset) {
    case "trace_reveal":
      return ["data_sweep", "panel_hold"];
    case "radial_reveal":
      return ["metric_pop", "panel_hold"];
    case "comparison_split":
      return ["step_stagger", "panel_hold"];
    case "grid_stagger":
      return ["step_stagger", "panel_hold"];
    case "diagram_callout":
      return ["step_stagger", "panel_hold"];
    case "risk_sweep":
      return ["diagram_callout", "panel_hold"];
    default:
      return ["panel_hold"];
  }
}

function resolvePresetBaseTiming(motionPreset: ChannelVisualMotionPresetId) {
  switch (motionPreset) {
    case "trace_reveal":
      return { introFrames: 22, detailFrames: 20, itemStaggerFrames: 3, itemRevealFrames: 10, scaleFrom: 0.94, slideX: 0, slideY: 12 };
    case "radial_reveal":
      return { introFrames: 20, detailFrames: 18, itemStaggerFrames: 4, itemRevealFrames: 10, scaleFrom: 0.92, slideX: 0, slideY: 14 };
    case "metric_pop":
      return { introFrames: 16, detailFrames: 16, itemStaggerFrames: 4, itemRevealFrames: 8, scaleFrom: 0.88, slideX: 0, slideY: 16 };
    case "step_stagger":
      return { introFrames: 18, detailFrames: 22, itemStaggerFrames: 6, itemRevealFrames: 10, scaleFrom: 0.92, slideX: 0, slideY: 18 };
    case "comparison_split":
      return { introFrames: 18, detailFrames: 18, itemStaggerFrames: 8, itemRevealFrames: 10, scaleFrom: 0.93, slideX: 14, slideY: 12 };
    case "grid_stagger":
      return { introFrames: 18, detailFrames: 18, itemStaggerFrames: 4, itemRevealFrames: 8, scaleFrom: 0.9, slideX: 0, slideY: 14 };
    case "diagram_callout":
      return { introFrames: 20, detailFrames: 24, itemStaggerFrames: 6, itemRevealFrames: 12, scaleFrom: 0.92, slideX: 0, slideY: 18 };
    case "risk_sweep":
      return { introFrames: 18, detailFrames: 20, itemStaggerFrames: 5, itemRevealFrames: 10, scaleFrom: 0.9, slideX: 0, slideY: 14 };
    case "data_sweep":
      return { introFrames: 18, detailFrames: 16, itemStaggerFrames: 3, itemRevealFrames: 9, scaleFrom: 0.93, slideX: 0, slideY: 12 };
    case "panel_hold":
    default:
      return { introFrames: 14, detailFrames: 14, itemStaggerFrames: 3, itemRevealFrames: 8, scaleFrom: 0.94, slideX: 0, slideY: 12 };
  }
}

export function resolveDefaultMotionPreset(kind?: string): ChannelVisualMotionPresetId {
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

export function resolveVisualMotionProgress(localFrame: number, startFrame: number, durationFrames: number): number {
  return clamp(
    interpolate(localFrame, [startFrame, startFrame + Math.max(4, durationFrames)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }),
    0,
    1
  );
}

export function resolveVisualMotionBenchmarkConfig(input: {
  motionPreset: ChannelVisualMotionPresetId;
  motionProfileId: ChannelVisualMotionProfileId;
}): VisualMotionBenchmarkConfig {
  const motionProfile = resolveMotionProfile(input.motionProfileId);
  const motionPreset = coerceBenchmarkedMotionPreset({
    motionProfileId: input.motionProfileId,
    candidatePreset: input.motionPreset,
    fallbackCandidates: fallbackCandidatesForPreset(input.motionPreset)
  });
  const base = resolvePresetBaseTiming(motionPreset);
  const thresholds = resolveMotionBenchmarkThresholds(input.motionProfileId, motionPreset);
  const introFrames = clamp(
    Math.round(base.introFrames * motionProfile.tuning.timing_scale),
    thresholds.min_intro_frames,
    thresholds.max_intro_frames
  );
  const detailFrames = clamp(
    Math.round(base.detailFrames * motionProfile.tuning.timing_scale),
    thresholds.min_detail_frames,
    thresholds.max_detail_frames
  );
  const itemStaggerFrames = clamp(
    Math.round(base.itemStaggerFrames * motionProfile.tuning.stagger_scale),
    thresholds.min_item_stagger_frames,
    thresholds.max_item_stagger_frames
  );
  const itemRevealFrames = clamp(
    Math.round(base.itemRevealFrames * motionProfile.tuning.reveal_scale),
    thresholds.min_item_reveal_frames,
    thresholds.max_item_reveal_frames
  );
  const slideX = clampMagnitude(base.slideX * motionProfile.tuning.translate_scale, thresholds.max_translate_px);
  const slideY = clampMagnitude(base.slideY * motionProfile.tuning.translate_scale, thresholds.max_translate_px);
  const rawScaleFrom = 1 - (1 - base.scaleFrom) * motionProfile.tuning.scale_delta_scale;
  const scaleFrom = clamp(rawScaleFrom, 0.82, 1);
  const emphasisBoostCap = clamp(
    0.04 * motionProfile.tuning.emphasis_scale,
    0,
    Math.min(thresholds.max_emphasis_boost, thresholds.max_panel_scale - 1)
  );

  return {
    motionPreset,
    motionProfileId: motionProfile.id,
    introFrames,
    detailFrames,
    itemStaggerFrames,
    itemRevealFrames,
    slideX,
    slideY,
    scaleFrom,
    emphasisBoostCap,
    thresholds
  };
}

export function resolveVisualMotionState(input: {
  motionPreset: ChannelVisualMotionPresetId;
  motionProfileId: ChannelVisualMotionProfileId;
  animationPolicy: VisualMotionAnimationPolicy;
  localFrame: number;
  fps: number;
  emphasisAtFrame: number;
}): VisualMotionState {
  const config = resolveVisualMotionBenchmarkConfig({
    motionPreset: input.motionPreset,
    motionProfileId: input.motionProfileId
  });
  const panelProgress = resolveVisualMotionProgress(input.localFrame, 0, config.introFrames);
  const detailProgress = resolveVisualMotionProgress(
    input.localFrame,
    Math.max(0, Math.floor(config.introFrames * 0.22)),
    config.detailFrames
  );
  const sweepProgress = resolveVisualMotionProgress(
    input.localFrame,
    Math.max(0, Math.floor(config.introFrames * 0.12)),
    Math.max(config.detailFrames, config.introFrames + 6)
  );
  const emphasisEnvelope = clamp(1 - Math.abs(input.localFrame - input.emphasisAtFrame) / 20, 0, 1);
  const pulseSpring =
    input.animationPolicy === "emphasis_pulse" && input.localFrame >= input.emphasisAtFrame
      ? spring({
          fps: input.fps,
          frame: input.localFrame - input.emphasisAtFrame,
          config: {
            damping: 13,
            stiffness: 170,
            mass: 0.55
          }
        })
      : 0;
  const emphasisBoost = Math.min(emphasisEnvelope * clamp(pulseSpring, 0, 1) * config.emphasisBoostCap, config.emphasisBoostCap);

  return {
    motionPreset: config.motionPreset,
    motionProfileId: config.motionProfileId,
    localFrame: input.localFrame,
    panelProgress,
    detailProgress,
    sweepProgress,
    itemStaggerFrames: config.itemStaggerFrames,
    itemRevealFrames: config.itemRevealFrames,
    panelOpacity: clamp(0.32 + panelProgress * 0.68, config.thresholds.min_panel_opacity, 1),
    panelTranslateX: (1 - panelProgress) * config.slideX,
    panelTranslateY: (1 - panelProgress) * config.slideY,
    panelScale: clamp(
      config.scaleFrom + (1 - config.scaleFrom) * panelProgress + emphasisBoost,
      config.scaleFrom,
      config.thresholds.max_panel_scale
    )
  };
}
