import type { ChannelProfile } from "../types";

export const medicalChannelProfile: ChannelProfile = {
  id: "medical_channel",
  label: "Medical Channel",
  domain: "medical",
  pacing: "measured",
  preferred_dialogue_camera_size: "cu",
  preferred_data_camera_size: "mcu",
  preferred_intro_camera_size: "mcu",
  preferred_insert_types: ["diagram", "caution_card", "caption_card", "callout_card"],
  chart_density: "light",
  diagram_density: "heavy",
  board_density: "light",
  premium_sidecar_frequency: "low",
  information_priority: "empathy",
  finish_profile_id: "medical_soft_clarity_v1",
  background_tone: "clinical_soft",
  sidecar_impact_preset: "soft_clarity_cleanup_v1",
  sidecar_impact_preset_premium: "soft_clarity_repair_v1",
  visual_grammar: {
    preferred_primary_kinds: ["anatomy_diagram", "process_flow", "icon_grid", "comparison_board", "summary_card"],
    preferred_supporting_kinds: ["callout_card", "risk_meter", "summary_card", "table"],
    discouraged_kinds: ["scatter", "boxplot", "heatmap"],
    default_layout_mode: "diagram_focus",
    pointer_density: "medium",
    annotation_style: "clinical_soft",
    motion_profile_id: "medical_guided_v1"
  }
};
