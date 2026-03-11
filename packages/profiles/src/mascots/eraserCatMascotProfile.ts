import type { MascotProfile } from "../types";

export const eraserCatMascotProfile: MascotProfile = {
  id: "eraser_cat",
  label: "Eraser Cat",
  species: "cat",
  morph: {
    ear_type: "upright",
    snout_length: "short",
    eye_placement: "wide",
    nose_placement: "compact",
    mouth_placement: "compact",
    tail_type: "plush_curve",
    profile_silhouette_rule: "round_compact"
  },
  acting: {
    blink_density: 1,
    mouth_energy: 1,
    idle_motion: 1,
    head_bob_energy: 1,
    speaking_rhythm_bias: 1,
    gesture_vocabulary: ["idle_shift", "emphasis_beat", "point_left", "point_right"],
    pointing_style: "direct_paw"
  },
  brand: {
    line_feel: "clean_broadcast",
    finish_style: "analytic_polish",
    expression_intensity: "focused",
    channel_tone: "analytic"
  },
  preferred_view: "front",
  blink_density: 1,
  mouth_intensity: 1,
  idle_motion_amount: 1,
  head_bob_energy: 1,
  speaking_rhythm_bias: 1,
  default_emotional_tone: "focused",
  gesture_vocabulary: ["idle_shift", "emphasis_beat", "point_left", "point_right"],
  sidecar_controlnet_preset: "pose_depth_balance_v1",
  sidecar_controlnet_preset_profile_view: "profile_lineart_depth_v1"
};
