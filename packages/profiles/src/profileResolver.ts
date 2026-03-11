import { resolveProfiles } from "./resolveProfiles";

type DeterministicLikeInput = {
  channelDomain?: string;
  mascotId?: string;
  hasChart: boolean;
  primaryVisualKind?: string;
  insertNeed?: string;
};

type ProfilesPackageResolutionSeed = {
  resolverId: string;
  profileBundle: {
    studioProfileId: string;
    channelProfileId: string;
    mascotProfileId: string;
    layoutBias: "balanced" | "data_dense" | "guided_soft";
    actingBias: "analytic_presenter" | "warm_guide" | "neutral_presenter";
    pointerBias: "chart_precise" | "soft_visual" | "guided_callout";
    finishBias: "studio_balanced" | "economy_crisp" | "medical_soft";
  };
  finishProfile?: {
    tone?: "studio_balanced" | "economy_crisp" | "medical_soft";
    textureMatch?: "deterministic_clean" | "balanced_soft" | "sidecar_matched";
  };
};

function normalizePrimaryVisualKind(kind: string | undefined): string | undefined {
  if (kind === "icon_grid") {
    return "icon_array";
  }
  if (kind === "anatomy_diagram") {
    return "labeled_diagram";
  }
  return kind;
}

function resolveChannelProfileId(input: DeterministicLikeInput) {
  return input.channelDomain === "medical" ? "medical_channel" : "economy_channel";
}

function resolveMascotProfileId(input: DeterministicLikeInput) {
  return input.mascotId === "med_dog" ? "med_dog" : "eraser_cat";
}

function resolveLayoutBias(input: DeterministicLikeInput, layoutMode: string) {
  const normalizedKind = normalizePrimaryVisualKind(input.primaryVisualKind);
  if (input.hasChart || normalizedKind === "comparison_board" || normalizedKind === "kpi_card") {
    return "data_dense" as const;
  }
  if (normalizedKind === "labeled_diagram" || normalizedKind === "summary_card" || input.insertNeed !== "none") {
    return "guided_soft" as const;
  }
  if (layoutMode === "data_focus") {
    return "data_dense" as const;
  }
  if (layoutMode === "diagram_focus") {
    return "guided_soft" as const;
  }
  return "balanced" as const;
}

function resolveActingBias(channelDomain: string, annotationStyle: string, mascotTone: string) {
  if (channelDomain === "medical" || mascotTone === "reassuring") {
    return "warm_guide" as const;
  }
  if (annotationStyle === "analytic" || mascotTone === "analytic") {
    return "analytic_presenter" as const;
  }
  return "neutral_presenter" as const;
}

function resolvePointerBias(input: DeterministicLikeInput, pointerDensity: string) {
  const normalizedKind = normalizePrimaryVisualKind(input.primaryVisualKind);
  if (input.hasChart || pointerDensity === "high") {
    return "chart_precise" as const;
  }
  if (normalizedKind === "labeled_diagram" || input.insertNeed !== "none" || pointerDensity === "medium") {
    return "guided_callout" as const;
  }
  return "soft_visual" as const;
}

function resolveFinishBias(channelFinishProfileId: string, studioFinishProfileId: string) {
  if (channelFinishProfileId === "medical_soft_clarity_v1") {
    return "medical_soft" as const;
  }
  if (channelFinishProfileId === "economy_clean_analytic_v1") {
    return "economy_crisp" as const;
  }
  if (studioFinishProfileId === "studio_clean_broadcast_v1") {
    return "studio_balanced" as const;
  }
  return "studio_balanced" as const;
}

function resolveTextureMatch(input: DeterministicLikeInput) {
  if (input.hasChart) {
    return "deterministic_clean" as const;
  }
  if (input.insertNeed && input.insertNeed !== "none") {
    return "sidecar_matched" as const;
  }
  return "balanced_soft" as const;
}

export function resolveProfilesPackageResolution(input: DeterministicLikeInput): ProfilesPackageResolutionSeed {
  const profiles = resolveProfiles({
    channel_profile_id: resolveChannelProfileId(input),
    mascot_profile_id: resolveMascotProfileId(input)
  });
  const layoutBias = resolveLayoutBias(input, profiles.channel.visual_grammar.default_layout_mode);
  const actingBias = resolveActingBias(
    profiles.channel.domain,
    profiles.channel.visual_grammar.annotation_style,
    profiles.mascot_brand.channel_tone
  );
  const pointerBias = resolvePointerBias(input, profiles.channel.visual_grammar.pointer_density);
  const finishBias = resolveFinishBias(profiles.channel.finish_profile_id, profiles.studio.finish_profile_id);

  return {
    resolverId: "profiles_package_live_v1",
    profileBundle: {
      studioProfileId: profiles.studio.id,
      channelProfileId: profiles.channel.id,
      mascotProfileId: profiles.mascot.id,
      layoutBias,
      actingBias,
      pointerBias,
      finishBias
    },
    finishProfile: {
      tone: finishBias,
      textureMatch: resolveTextureMatch(input)
    }
  };
}

export function createProfilesPackageResolver() {
  return resolveProfilesPackageResolution;
}
