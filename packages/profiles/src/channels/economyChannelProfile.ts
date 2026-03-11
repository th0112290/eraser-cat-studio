import type { ChannelProfile } from "../types";

export const economyChannelProfile: ChannelProfile = {
  id: "economy_channel",
  label: "Economy Channel",
  domain: "economy",
  pacing: "balanced",
  preferred_dialogue_camera_size: "mcu",
  preferred_data_camera_size: "mcu",
  preferred_intro_camera_size: "ms",
  preferred_insert_types: ["chart", "board", "callout_card", "caption_card"],
  chart_density: "heavy",
  diagram_density: "light",
  board_density: "medium",
  premium_sidecar_frequency: "medium",
  information_priority: "clarity",
  finish_profile_id: "economy_clean_analytic_v1",
  background_tone: "studio_neutral",
  sidecar_impact_preset: "broadcast_cleanup_v1",
  sidecar_impact_preset_premium: "identity_repair_detail_v1",
  visual_grammar: {
    preferred_primary_kinds: ["line_chart", "bar_chart", "area_chart", "table", "kpi_card", "timeline", "map"],
    preferred_supporting_kinds: ["summary_card", "callout_card", "comparison_board", "table"],
    discouraged_kinds: ["anatomy_diagram", "risk_meter"],
    default_layout_mode: "data_focus",
    pointer_density: "high",
    annotation_style: "analytic",
    motion_profile_id: "economy_analytic_v1"
  }
};
