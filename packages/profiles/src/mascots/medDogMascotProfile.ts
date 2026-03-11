import type { MascotProfile } from "../types";

export const medDogMascotProfile: MascotProfile = {
  id: "med_dog",
  label: "Medical Dog",
  species: "dog",
  morph: {
    ear_type: "drop",
    snout_length: "medium",
    eye_placement: "balanced",
    nose_placement: "balanced",
    mouth_placement: "balanced",
    tail_type: "soft_arc",
    profile_silhouette_rule: "soft_muzzle"
  },
  acting: {
    blink_density: 0.86,
    mouth_energy: 0.9,
    idle_motion: 0.74,
    head_bob_energy: 0.72,
    speaking_rhythm_bias: 0.9,
    gesture_vocabulary: ["idle_shift", "emphasis_beat", "point_right"],
    pointing_style: "soft_present"
  },
  brand: {
    line_feel: "soft_clean",
    finish_style: "soft_clarity",
    expression_intensity: "warm",
    channel_tone: "reassuring"
  },
  preferred_view: "threeQuarter",
  blink_density: 0.86,
  mouth_intensity: 0.9,
  idle_motion_amount: 0.74,
  head_bob_energy: 0.72,
  speaking_rhythm_bias: 0.9,
  default_emotional_tone: "warm",
  gesture_vocabulary: ["idle_shift", "emphasis_beat", "point_right"],
  sidecar_controlnet_preset: "pose_canny_balance_v1",
  sidecar_controlnet_preset_profile_view: "profile_lineart_depth_v1"
};
