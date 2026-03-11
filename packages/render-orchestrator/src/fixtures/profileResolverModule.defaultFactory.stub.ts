import type { DeterministicProfileResolverInput } from "../types";

export default async function createProfilesPackageResolver() {
  return (input: DeterministicProfileResolverInput) => ({
    resolverId: "profiles_package_default_factory_stub_v1",
    profileBundle: {
      studioProfileId: "profiles_package_default_factory_studio_v1",
      channelProfileId:
        input.channelDomain === "medical"
          ? "profiles_default_factory_medical_channel_v1"
          : "profiles_default_factory_economy_channel_v1",
      mascotProfileId: input.mascotId === "med_dog" ? "profiles_default_factory_med_dog_v1" : "profiles_default_factory_eraser_cat_v1",
      layoutBias: input.primaryVisualKind === "labeled_diagram" ? "guided_soft" : "balanced",
      actingBias: input.channelDomain === "medical" ? "warm_guide" : "analytic_presenter",
      pointerBias: input.insertNeed !== "none" ? "guided_callout" : input.hasChart ? "chart_precise" : "soft_visual",
      finishBias: input.channelDomain === "medical" ? "medical_soft" : "economy_crisp"
    }
  });
}
