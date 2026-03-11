export { defaultStudioProfile } from "./defaultStudioProfile";
export { economyChannelProfile } from "./channels/economyChannelProfile";
export { medicalChannelProfile } from "./channels/medicalChannelProfile";
export { eraserCatMascotProfile } from "./mascots/eraserCatMascotProfile";
export { medDogMascotProfile } from "./mascots/medDogMascotProfile";
export { createProfilesPackageResolver, resolveProfilesPackageResolution } from "./profileResolver";
export {
  ALL_MOTION_PROFILE_IDS,
  coerceBenchmarkedMotionPreset,
  economyAnalyticMotionProfile,
  isBenchmarkedMotionPreset,
  medicalGuidedMotionProfile,
  resolveMotionBenchmarkThresholds,
  resolveMotionProfile,
  studioBalancedMotionProfile
} from "./motionProfiles";
export {
  coerceProfileSelection,
  DEFAULT_CHANNEL_PROFILE_ID,
  DEFAULT_MASCOT_PROFILE_ID,
  DEFAULT_STUDIO_PROFILE_ID,
  normalizeProfileSelection,
  resolveProfiles
} from "./resolveProfiles";
export type {
  ChannelAnnotationStyle,
  ChannelProfile,
  ChannelProfileId,
  ChannelVisualMotionProfileId,
  ChannelVisualMotionPresetId,
  ChannelPointerDensity,
  ChannelVisualLayoutMode,
  ChannelVisualObjectKind,
  FinishProfileId,
  InsertAssetType,
  MotionBenchmarkProfile,
  MotionBenchmarkThresholds,
  MotionProfileTuning,
  MascotActingProfile,
  MascotBrandProfile,
  MascotChannelTone,
  MascotEarType,
  MascotExpressionIntensity,
  MascotFeaturePlacement,
  MascotFinishStyle,
  MascotGestureCue,
  MascotLineFeel,
  MascotMorphProfile,
  MascotPointingStyle,
  MascotProfile,
  MascotProfileBundle,
  MascotProfileId,
  MascotSilhouetteRule,
  MascotSnoutLength,
  MascotTailType,
  PremiumSidecarFrequency,
  ProfileCameraSize,
  ProfilePacing,
  ProfileSelection,
  ProfileView,
  ResolvedProfiles,
  SidecarControlNetPresetId,
  SidecarImpactPresetId,
  SidecarQcPresetId,
  StudioProfile,
  StudioProfileId
} from "./types";
