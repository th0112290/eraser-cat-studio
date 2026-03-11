import type {
  ChannelVisualMotionProfileId,
  ChannelVisualMotionPresetId,
  MotionBenchmarkProfile,
  MotionBenchmarkThresholds
} from "./types";

const DEFAULT_MOTION_PROFILE_ID: ChannelVisualMotionProfileId = "studio_balanced_v1";

export const studioBalancedMotionProfile: MotionBenchmarkProfile = {
  id: "studio_balanced_v1",
  label: "Studio Balanced v1",
  benchmarked_motion_presets: [
    "panel_hold",
    "data_sweep",
    "trace_reveal",
    "radial_reveal",
    "metric_pop",
    "step_stagger",
    "comparison_split",
    "grid_stagger",
    "diagram_callout",
    "risk_sweep"
  ],
  tuning: {
    timing_scale: 1,
    stagger_scale: 1,
    reveal_scale: 1,
    translate_scale: 1,
    scale_delta_scale: 1,
    emphasis_scale: 1
  },
  thresholds: {
    min_intro_frames: 12,
    max_intro_frames: 24,
    min_detail_frames: 12,
    max_detail_frames: 26,
    min_item_stagger_frames: 2,
    max_item_stagger_frames: 8,
    min_item_reveal_frames: 6,
    max_item_reveal_frames: 12,
    max_translate_px: 18,
    min_panel_opacity: 0.32,
    max_panel_scale: 1.04,
    max_emphasis_boost: 0.04
  },
  preset_threshold_overrides: {
    panel_hold: {
      max_intro_frames: 16,
      max_detail_frames: 16
    },
    comparison_split: {
      max_translate_px: 14
    },
    metric_pop: {
      max_panel_scale: 1.045
    }
  }
};

export const economyAnalyticMotionProfile: MotionBenchmarkProfile = {
  id: "economy_analytic_v1",
  label: "Economy Analytic v1",
  benchmarked_motion_presets: [
    "panel_hold",
    "data_sweep",
    "trace_reveal",
    "radial_reveal",
    "metric_pop",
    "step_stagger",
    "comparison_split"
  ],
  tuning: {
    timing_scale: 0.86,
    stagger_scale: 0.82,
    reveal_scale: 0.9,
    translate_scale: 0.72,
    scale_delta_scale: 0.78,
    emphasis_scale: 0.82
  },
  thresholds: {
    min_intro_frames: 10,
    max_intro_frames: 20,
    min_detail_frames: 10,
    max_detail_frames: 22,
    min_item_stagger_frames: 2,
    max_item_stagger_frames: 7,
    min_item_reveal_frames: 6,
    max_item_reveal_frames: 10,
    max_translate_px: 14,
    min_panel_opacity: 0.32,
    max_panel_scale: 1.033,
    max_emphasis_boost: 0.033
  },
  preset_threshold_overrides: {
    panel_hold: {
      max_intro_frames: 13,
      max_detail_frames: 13
    },
    trace_reveal: {
      min_intro_frames: 16
    },
    comparison_split: {
      max_item_stagger_frames: 7,
      max_translate_px: 12
    },
    metric_pop: {
      max_panel_scale: 1.034
    }
  }
};

export const medicalGuidedMotionProfile: MotionBenchmarkProfile = {
  id: "medical_guided_v1",
  label: "Medical Guided v1",
  benchmarked_motion_presets: [
    "panel_hold",
    "data_sweep",
    "metric_pop",
    "step_stagger",
    "comparison_split",
    "grid_stagger",
    "diagram_callout",
    "risk_sweep"
  ],
  tuning: {
    timing_scale: 1.16,
    stagger_scale: 1.24,
    reveal_scale: 1.08,
    translate_scale: 1.12,
    scale_delta_scale: 0.9,
    emphasis_scale: 0.94
  },
  thresholds: {
    min_intro_frames: 14,
    max_intro_frames: 26,
    min_detail_frames: 14,
    max_detail_frames: 28,
    min_item_stagger_frames: 3,
    max_item_stagger_frames: 10,
    min_item_reveal_frames: 7,
    max_item_reveal_frames: 13,
    max_translate_px: 21,
    min_panel_opacity: 0.32,
    max_panel_scale: 1.038,
    max_emphasis_boost: 0.038
  },
  preset_threshold_overrides: {
    step_stagger: {
      max_item_stagger_frames: 8
    },
    comparison_split: {
      max_translate_px: 16
    },
    risk_sweep: {
      min_detail_frames: 20
    },
    diagram_callout: {
      min_detail_frames: 22
    }
  }
};

const MOTION_PROFILES: Record<ChannelVisualMotionProfileId, MotionBenchmarkProfile> = {
  studio_balanced_v1: studioBalancedMotionProfile,
  economy_analytic_v1: economyAnalyticMotionProfile,
  medical_guided_v1: medicalGuidedMotionProfile
};

export const ALL_MOTION_PROFILE_IDS = Object.keys(MOTION_PROFILES) as ChannelVisualMotionProfileId[];

export function resolveMotionProfile(
  motionProfileId?: ChannelVisualMotionProfileId | null
): MotionBenchmarkProfile {
  if (motionProfileId && motionProfileId in MOTION_PROFILES) {
    return MOTION_PROFILES[motionProfileId];
  }
  return MOTION_PROFILES[DEFAULT_MOTION_PROFILE_ID];
}

export function isBenchmarkedMotionPreset(
  motionProfileId: ChannelVisualMotionProfileId | null | undefined,
  motionPreset: ChannelVisualMotionPresetId
): boolean {
  return resolveMotionProfile(motionProfileId).benchmarked_motion_presets.includes(motionPreset);
}

export function coerceBenchmarkedMotionPreset(input: {
  motionProfileId?: ChannelVisualMotionProfileId | null;
  candidatePreset: ChannelVisualMotionPresetId;
  fallbackCandidates?: ChannelVisualMotionPresetId[];
}): ChannelVisualMotionPresetId {
  const profile = resolveMotionProfile(input.motionProfileId);
  const candidates = [
    input.candidatePreset,
    ...(input.fallbackCandidates ?? []),
    "panel_hold"
  ] as ChannelVisualMotionPresetId[];

  for (const preset of candidates) {
    if (profile.benchmarked_motion_presets.includes(preset)) {
      return preset;
    }
  }

  return profile.benchmarked_motion_presets[0] ?? "panel_hold";
}

export function resolveMotionBenchmarkThresholds(
  motionProfileId: ChannelVisualMotionProfileId | null | undefined,
  motionPreset: ChannelVisualMotionPresetId
): MotionBenchmarkThresholds {
  const profile = resolveMotionProfile(motionProfileId);
  return {
    ...profile.thresholds,
    ...(profile.preset_threshold_overrides?.[motionPreset] ?? {})
  };
}
