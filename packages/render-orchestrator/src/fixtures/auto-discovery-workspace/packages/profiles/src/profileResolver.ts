import type { DeterministicProfileResolverInput } from "../../../../../types";

export function resolveProfilesPackageResolution(input: DeterministicProfileResolverInput) {
  return {
    resolverId: "profiles_package_auto_discovery_stub_v1",
    profileBundle: {
      studioProfileId: "profiles_package_auto_discovery_studio_v1",
      channelProfileId:
        input.channelDomain === "medical"
          ? "profiles_auto_discovery_medical_channel_v1"
          : input.channelDomain === "economy"
            ? "profiles_auto_discovery_economy_channel_v1"
            : "profiles_auto_discovery_generic_channel_v1",
      mascotProfileId: input.mascotId === "med_dog" ? "profiles_auto_discovery_med_dog_v1" : "profiles_auto_discovery_eraser_cat_v1",
      layoutBias: input.primaryVisualKind === "comparison_board" ? "data_dense" : "guided_soft",
      actingBias: input.channelDomain === "medical" ? "warm_guide" : "analytic_presenter",
      pointerBias: input.hasChart ? "chart_precise" : "guided_callout",
      finishBias: input.channelDomain === "medical" ? "medical_soft" : "economy_crisp"
    }
  };
}
