export type ProfileView = "front" | "threeQuarter" | "profile";
export type ProfileCameraSize = "ecu" | "cu" | "mcu" | "ms" | "ws";
export type ProfilePacing = "measured" | "balanced" | "dense";
export type PremiumSidecarFrequency = "low" | "medium" | "high";
export type ChannelVisualObjectKind =
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
export type ChannelVisualLayoutMode = "data_focus" | "diagram_focus" | "split_focus";
export type ChannelPointerDensity = "low" | "medium" | "high";
export type ChannelAnnotationStyle = "analytic" | "clinical_soft" | "neutral";
export type ChannelVisualMotionProfileId = "studio_balanced_v1" | "economy_analytic_v1" | "medical_guided_v1";
export type ChannelVisualMotionPresetId =
  | "panel_hold"
  | "data_sweep"
  | "trace_reveal"
  | "radial_reveal"
  | "metric_pop"
  | "step_stagger"
  | "comparison_split"
  | "grid_stagger"
  | "diagram_callout"
  | "risk_sweep";
export type MotionProfileTuning = {
  timing_scale: number;
  stagger_scale: number;
  reveal_scale: number;
  translate_scale: number;
  scale_delta_scale: number;
  emphasis_scale: number;
};
export type MotionBenchmarkThresholds = {
  min_intro_frames: number;
  max_intro_frames: number;
  min_detail_frames: number;
  max_detail_frames: number;
  min_item_stagger_frames: number;
  max_item_stagger_frames: number;
  min_item_reveal_frames: number;
  max_item_reveal_frames: number;
  max_translate_px: number;
  min_panel_opacity: number;
  max_panel_scale: number;
  max_emphasis_boost: number;
};
export type MotionBenchmarkProfile = {
  id: ChannelVisualMotionProfileId;
  label: string;
  benchmarked_motion_presets: ChannelVisualMotionPresetId[];
  tuning: MotionProfileTuning;
  thresholds: MotionBenchmarkThresholds;
  preset_threshold_overrides?: Partial<Record<ChannelVisualMotionPresetId, Partial<MotionBenchmarkThresholds>>>;
};
export type SidecarControlNetPresetId =
  | "pose_depth_balance_v1"
  | "pose_canny_balance_v1"
  | "profile_lineart_depth_v1";
export type SidecarImpactPresetId =
  | "broadcast_cleanup_v1"
  | "identity_repair_detail_v1"
  | "soft_clarity_cleanup_v1"
  | "soft_clarity_repair_v1";
export type SidecarQcPresetId = "broadcast_balanced_v1" | "broadcast_identity_strict_v1";
export type FinishProfileId =
  | "studio_clean_broadcast_v1"
  | "economy_clean_analytic_v1"
  | "medical_soft_clarity_v1"
  | "sidecar_match_wan_v1"
  | "sidecar_match_hunyuan_v1";
export type MascotEarType = "upright" | "drop" | "folded";
export type MascotSnoutLength = "short" | "medium" | "long";
export type MascotFeaturePlacement = "compact" | "balanced" | "wide";
export type MascotTailType = "plush_curve" | "soft_arc" | "short";
export type MascotSilhouetteRule = "round_compact" | "soft_muzzle" | "tall_upright";
export type MascotPointingStyle = "direct_paw" | "open_present" | "soft_present";
export type MascotLineFeel = "clean_broadcast" | "soft_clean";
export type MascotFinishStyle = "analytic_polish" | "soft_clarity";
export type MascotExpressionIntensity = "measured" | "focused" | "warm";
export type MascotChannelTone = "analytic" | "reassuring";
export type InsertAssetType =
  | "chart"
  | "board"
  | "caption_card"
  | "callout_card"
  | "diagram"
  | "icon_explainer"
  | "caution_card";
export type MascotGestureCue = "idle_shift" | "emphasis_beat" | "point_left" | "point_right";

export type StudioProfileId = "studio_default";
export type ChannelProfileId = "economy_channel" | "medical_channel";
export type MascotProfileId = "eraser_cat" | "med_dog";

export type ProfileSelection = {
  studio_profile_id: StudioProfileId;
  channel_profile_id: ChannelProfileId;
  mascot_profile_id: MascotProfileId;
};

export type StudioProfile = {
  id: StudioProfileId;
  label: string;
  tone: "family_friendly";
  subtitle_safe_margin_px: number;
  chart_safe_margin_px: number;
  deterministic_first: boolean;
  sidecar_secondary: boolean;
  finish_profile_id: string;
  broadcast_safe_finish: boolean;
  sidecar_qc_preset: SidecarQcPresetId;
  sidecar_qc_preset_strict: SidecarQcPresetId;
};

export type ChannelProfile = {
  id: ChannelProfileId;
  label: string;
  domain: "economy" | "medical";
  pacing: ProfilePacing;
  preferred_dialogue_camera_size: ProfileCameraSize;
  preferred_data_camera_size: ProfileCameraSize;
  preferred_intro_camera_size: ProfileCameraSize;
  preferred_insert_types: InsertAssetType[];
  chart_density: "light" | "medium" | "heavy";
  diagram_density: "light" | "medium" | "heavy";
  board_density: "light" | "medium" | "heavy";
  premium_sidecar_frequency: PremiumSidecarFrequency;
  information_priority: "clarity" | "empathy";
  finish_profile_id: string;
  background_tone: "studio_neutral" | "clinical_soft";
  sidecar_impact_preset: SidecarImpactPresetId;
  sidecar_impact_preset_premium: SidecarImpactPresetId;
  visual_grammar: {
    preferred_primary_kinds: ChannelVisualObjectKind[];
    preferred_supporting_kinds: ChannelVisualObjectKind[];
    discouraged_kinds?: ChannelVisualObjectKind[];
    default_layout_mode: ChannelVisualLayoutMode;
    pointer_density: ChannelPointerDensity;
    annotation_style: ChannelAnnotationStyle;
    motion_profile_id: ChannelVisualMotionProfileId;
  };
};

export type MascotMorphProfile = {
  ear_type: MascotEarType;
  snout_length: MascotSnoutLength;
  eye_placement: MascotFeaturePlacement;
  nose_placement: MascotFeaturePlacement;
  mouth_placement: MascotFeaturePlacement;
  tail_type: MascotTailType;
  profile_silhouette_rule: MascotSilhouetteRule;
};

export type MascotActingProfile = {
  blink_density: number;
  mouth_energy: number;
  idle_motion: number;
  head_bob_energy: number;
  speaking_rhythm_bias: number;
  gesture_vocabulary: MascotGestureCue[];
  pointing_style: MascotPointingStyle;
};

export type MascotBrandProfile = {
  line_feel: MascotLineFeel;
  finish_style: MascotFinishStyle;
  expression_intensity: MascotExpressionIntensity;
  channel_tone: MascotChannelTone;
};

export type MascotProfileBundle = {
  morph: MascotMorphProfile;
  acting: MascotActingProfile;
  brand: MascotBrandProfile;
};

export type MascotProfile = {
  id: MascotProfileId;
  label: string;
  species: "cat" | "dog";
  morph: MascotMorphProfile;
  acting: MascotActingProfile;
  brand: MascotBrandProfile;
  preferred_view: ProfileView;
  blink_density: number;
  mouth_intensity: number;
  idle_motion_amount: number;
  head_bob_energy: number;
  speaking_rhythm_bias: number;
  default_emotional_tone: "neutral" | "focused" | "warm";
  gesture_vocabulary: MascotGestureCue[];
  sidecar_controlnet_preset: SidecarControlNetPresetId;
  sidecar_controlnet_preset_profile_view: SidecarControlNetPresetId;
};

export type ResolvedProfiles = {
  selection: ProfileSelection;
  studio: StudioProfile;
  channel: ChannelProfile;
  mascot: MascotProfile;
  mascot_morph: MascotMorphProfile;
  mascot_acting: MascotActingProfile;
  mascot_brand: MascotBrandProfile;
};
