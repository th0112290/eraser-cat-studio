import type { StudioProfile } from "./types";

export const defaultStudioProfile: StudioProfile = {
  id: "studio_default",
  label: "Eraser Cat Studio Default",
  tone: "family_friendly",
  subtitle_safe_margin_px: 54,
  chart_safe_margin_px: 64,
  deterministic_first: true,
  sidecar_secondary: true,
  finish_profile_id: "studio_clean_broadcast_v1",
  broadcast_safe_finish: true,
  sidecar_qc_preset: "broadcast_balanced_v1",
  sidecar_qc_preset_strict: "broadcast_identity_strict_v1"
};
