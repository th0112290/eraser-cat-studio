import type { DeterministicProfileResolverInput } from "../types";

export function resolveProfilesPackageResolution(input: DeterministicProfileResolverInput) {
  return {
    resolverId: "profiles_package_module_stub_v1",
    profileBundle: {
      studioProfileId: "profiles_package_studio_v1",
      channelProfileId:
        input.channelDomain === "medical" ? "profiles_medical_channel_v1" : "profiles_economy_channel_v1",
      mascotProfileId: input.mascotId === "med_dog" ? "profiles_med_dog_v1" : "profiles_eraser_cat_v1",
      layoutBias:
        input.hasChart || input.primaryVisualKind === "comparison_board" || input.primaryVisualKind === "kpi_card"
          ? "data_dense"
          : input.primaryVisualKind === "labeled_diagram" || input.insertNeed !== "none"
            ? "guided_soft"
            : "balanced",
      actingBias:
        input.channelDomain === "medical"
          ? "warm_guide"
          : input.channelDomain === "economy"
            ? "analytic_presenter"
            : "neutral_presenter",
      pointerBias:
        input.primaryVisualKind === "labeled_diagram" || input.insertNeed !== "none"
          ? "guided_callout"
          : input.hasChart
            ? "chart_precise"
            : "soft_visual",
      finishBias: input.channelDomain === "medical" ? "medical_soft" : "economy_crisp"
    }
  };
}
