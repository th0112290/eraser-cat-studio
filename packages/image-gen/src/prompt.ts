import { sha256Hex } from "@ec/shared";
import { resolveMascotSpeciesProfile } from "./species";
import type {
  BuildPromptBundleInput,
  CharacterView,
  PromptBundle,
  PromptQualityProfile,
  StylePromptPreset
} from "./types";

const BASE_NEGATIVE_TEMPLATE = [
  "watermark",
  "text",
  "logo",
  "signature",
  "busy background",
  "cluttered background",
  "photorealistic",
  "3d render",
  "realistic skin"
].join(", ");

const ANIME_PRODUCTION_QUALITY_PROFILE: PromptQualityProfile = {
  id: "anime_2d_production_24gb_v1",
  label: "Anime 2D Production 24GB",
  targetStyle: "2d anime",
  qualityTier: "production",
  sampler: "dpmpp_2m_sde",
  scheduler: "karras",
  steps: 42,
  cfg: 4.1,
  width: 1024,
  height: 1536,
  maxShift: 1.05,
  baseShift: 0.42,
  postprocessPlan: [
    "upscale-long-side-2048",
    "alpha-safe-lanczos-resize",
    "mild-line-sharpen",
    "subtle-saturation-boost"
  ],
  upscaleLongSide: 2048,
  sharpen: 1.15,
  saturationBoost: 1.03
};

const ANIME_BALANCED_QUALITY_PROFILE: PromptQualityProfile = {
  id: "anime_2d_balanced_24gb_v1",
  label: "Anime 2D Balanced 24GB",
  targetStyle: "2d anime",
  qualityTier: "quality",
  sampler: "dpmpp_2m",
  scheduler: "karras",
  steps: 30,
  cfg: 3.7,
  width: 896,
  height: 1344,
  maxShift: 1.1,
  baseShift: 0.46,
  postprocessPlan: ["upscale-long-side-1792", "alpha-safe-lanczos-resize", "mild-line-sharpen"],
  upscaleLongSide: 1792,
  sharpen: 0.95,
  saturationBoost: 1.01
};

const MASCOT_FLAT_QUALITY_PROFILE: PromptQualityProfile = {
  id: "mascot_flat_fast_v1",
  label: "Mascot Flat Fast",
  targetStyle: "2d mascot",
  qualityTier: "balanced",
  sampler: "euler",
  scheduler: "normal",
  steps: 20,
  cfg: 7,
  width: 1024,
  height: 1024,
  maxShift: 1.15,
  baseShift: 0.5,
  postprocessPlan: ["none"]
};

const COMPACT_MASCOT_PRODUCTION_QUALITY_PROFILE: PromptQualityProfile = {
  id: "compact_mascot_production_v1",
  label: "Compact Mascot Production",
  targetStyle: "compact monochrome mascot",
  qualityTier: "production",
  sampler: "dpmpp_2m",
  scheduler: "karras",
  steps: 30,
  cfg: 5.4,
  width: 1024,
  height: 1024,
  maxShift: 1,
  baseShift: 0.5,
  postprocessPlan: [],
  upscaleLongSide: 0,
  sharpen: 0,
  saturationBoost: 1
};

const DEFAULT_VIEW_MODIFIERS: Record<CharacterView, string> = {
  front:
    "front view, camera facing subject directly, symmetric facial alignment, shoulders square, neutral standing pose",
  threeQuarter:
    "three-quarter view, head and torso rotated about 45 degrees, readable far-side features, preserve silhouette landmarks",
  profile:
    "true side profile, 90-degree rotation, one eye visible, clean nose and jaw contour, ear overlap physically plausible"
};

const MASCOT_VIEW_MODIFIERS: Record<CharacterView, string> = {
  front:
    "front view, symmetric face, compact oversized mascot head, tiny body, minimal mascot expression, preserve species-specific ear shape and muzzle length, full body visible, generous empty margin around head and paws, no crop-tight framing, no extra props",
  threeQuarter:
    "strict three-quarter view around 35 to 45 degrees, head and torso clearly turned, both eyes visible but far-side features smaller, far ear slightly occluded, asymmetric cheek read, preserve compact mascot head silhouette, tiny body, same family proportions, no near-front cheat, no near-profile collapse, no duplicate face parts, no human facial structure, no straight-on symmetry",
  profile:
    "strict true side profile, 90-degree rotation, one eye only, far eye hidden, only one cheek plane visible, nose and mouth placed on the outer contour, far ear mostly hidden, compact mascot head silhouette, tiny body, minimal mouth, preserve species-specific muzzle length, no realistic jawline, no realistic snout, no straight-on symmetry"
};

const DEFAULT_PRESET_ID = "compact-mascot-production";
const LEGACY_PRESET_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  "eraser-cat-mascot-production": "compact-mascot-production",
  "eraser-cat-flat": "compact-mascot-flat"
});

function normalizePresetId(presetId: string | undefined): string | undefined {
  if (!presetId) {
    return undefined;
  }

  return LEGACY_PRESET_ID_ALIASES[presetId] ?? presetId;
}

function isMascotPreset(presetId: string): boolean {
  const normalizedPresetId = normalizePresetId(presetId) ?? presetId;
  return (
    normalizedPresetId === "compact-mascot-production" ||
    normalizedPresetId === "compact-mascot-flat" ||
    normalizedPresetId === "playful-cartoon"
  );
}

export const STYLE_PROMPT_PRESETS: StylePromptPreset[] = [
  {
    id: "compact-mascot-production",
    label: "Mascot Production",
    positive: [
      "cute monochrome doodle mascot",
      "oversized rounded geometric head",
      "tiny rounded mascot body",
      "stubby tube limbs",
      "black line art",
      "plain light background",
      "sticker-ready silhouette",
      "paw hands",
      "simple tail silhouette",
      "very simple face only"
    ].join(", "),
    negative: [
      "realistic fingers",
      "human hands",
      "knuckles",
      "nails",
      "realistic fur",
      "3d render",
      "glossy anime shading",
      "commercial anime detail",
      "small head",
      "long body",
      "human anatomy",
      "realistic nose",
      "realistic mouth",
      "realistic muzzle",
      "teeth",
      "tongue",
      "thick eyebrows",
      "eyelashes",
      "hair strands",
      "sticker sheet",
      "character lineup",
      "logo mark",
      "blue artifact"
    ].join(", "),
    qualityProfile: COMPACT_MASCOT_PRODUCTION_QUALITY_PROFILE
  },
  {
    id: "anime-production-2d",
    label: "Anime Production 2D",
    positive: [
      "2d anime character design",
      "production-ready model sheet",
      "clean cel shading",
      "crisp line art",
      "full body",
      "plain or transparent background"
    ].join(", "),
    negative: [
      "photoreal skin",
      "3d render",
      "textured painterly noise",
      "cinematic grain",
      "busy background",
      "props",
      "realistic fur"
    ].join(", "),
    qualityProfile: ANIME_PRODUCTION_QUALITY_PROFILE
  },
  {
    id: "anime-sheet-balanced",
    label: "Anime Sheet Balanced",
    positive: [
      "2d anime turnaround sheet",
      "clean silhouette readability",
      "flat color blocking",
      "full body",
      "plain background"
    ].join(", "),
    negative: [
      "photorealistic",
      "3d render",
      "heavy texture noise",
      "complex lighting",
      "background clutter"
    ].join(", "),
    qualityProfile: ANIME_BALANCED_QUALITY_PROFILE
  },
  {
    id: "compact-mascot-flat",
    label: "Compact Mascot Flat",
    positive: "2d mascot character, clean vector look, thick outline, simple cel shading, transparent background",
    negative: "3d render, photoreal skin, cinematic grain",
    qualityProfile: MASCOT_FLAT_QUALITY_PROFILE
  },
  {
    id: "playful-cartoon",
    label: "Playful Cartoon",
    positive: "cute cartoon mascot, rounded proportions, expressive eyes, animation-ready sprite, transparent background",
    negative: "realistic anatomy, noisy texture",
    qualityProfile: MASCOT_FLAT_QUALITY_PROFILE
  },
  {
    id: "minimal-rig",
    label: "Minimal Rig",
    positive: "front and side consistent character sheet, clean silhouette, large readable shapes, transparent background",
    negative: "detailed background, complex lighting",
    qualityProfile: ANIME_BALANCED_QUALITY_PROFILE
  }
];

function findPreset(id?: string): StylePromptPreset {
  const normalizedId = normalizePresetId(id);

  if (!id) {
    return STYLE_PROMPT_PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID) ?? STYLE_PROMPT_PRESETS[0];
  }

  return (
    STYLE_PROMPT_PRESETS.find((preset) => preset.id === normalizedId) ??
    STYLE_PROMPT_PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID) ??
    STYLE_PROMPT_PRESETS[0]
  );
}

function joinPromptParts(parts: Array<string | undefined>): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) {
      continue;
    }

    const trimmed = part.trim();
    if (trimmed.length === 0) {
      continue;
    }

    out.push(trimmed);
  }

  return out.join(", ");
}

export function buildPromptBundle(input: BuildPromptBundleInput): PromptBundle {
  const preset = findPreset(input.presetId);
  const mascotPreset = isMascotPreset(preset.id);
  const speciesProfile = mascotPreset ? resolveMascotSpeciesProfile(input.speciesId) : null;

  const styleHints = input.styleHints;
  const styleCore = preset.positive;
  const keepTraitTokens = speciesProfile?.keepTraits ?? [];
  const rejectTraitTokens = speciesProfile?.rejectTraits ?? [];
  const identityAnchors = mascotPreset
    ? [
        "same mascot across all angles",
        ...(speciesProfile ? speciesProfile.identityTokens : []),
        ...(speciesProfile?.anchorTokens ?? ["same ear spacing"]),
        ...keepTraitTokens.slice(0, 4),
        "same simple eye style",
        "same tiny mouth vocabulary",
        "no redesign"
      ].join(", ")
    : [
        "same character across all angles",
        "same face shape",
        "same hairstyle and bangs",
        "same eye shape",
        "same outfit trim and emblem placement",
        "same body proportions",
        "same palette accents",
        "no redesign"
      ].join(", ");
  const speciesPositive = speciesProfile ? speciesProfile.positiveTokens.join(", ") : undefined;
  const speciesNegative = speciesProfile
    ? [...speciesProfile.negativeTokens, ...rejectTraitTokens].join(", ")
    : undefined;
  const renderDirectives = mascotPreset
    ? [
        "single mascot illustration",
        "exactly one character",
        "one pose only",
        "centered composition",
        "full body",
        "simple readable expression from eye and mouth geometry only",
        "large head small body ratio",
        "clean sticker silhouette",
        "flat black line-art on light plain background",
        "clear empty margin around the character",
        ...keepTraitTokens.slice(4)
      ].join(", ")
    : [
        "character turnaround sheet",
        "single subject",
        "centered composition",
        "full body",
        "neutral standing pose",
        "clean silhouette readability",
        "production-ready animation model sheet source"
      ].join(", ");
  const negativeCore = mascotPreset
    ? [
        "photorealistic",
        "realistic skin",
        "3d render",
        "detailed realistic fur",
        "text",
        "logo",
        "watermark",
        "signature",
        "multiple characters",
        "character lineup",
        "turnaround sheet",
        "reference sheet",
        "sticker sheet",
        "icon grid",
        "multi pose sheet",
        "repeated character",
        "busy background",
        "scene props",
        "extra limbs",
        "missing limbs",
        "extra fingers",
        "deformed hands",
        "five fingers",
        "human hands",
        "human anatomy",
        "teeth",
        "tongue",
        "nose bridge",
        "thick eyebrows",
        "glossy highlights",
        "complex shading",
        "small head",
        "long torso",
        "realistic jawline",
        "realistic snout",
        "palette drift",
        "costume redesign",
        "extreme foreshortening",
        "dutch angle",
        "motion blur",
        "jpeg artifacts",
        "painterly texture",
        "intricate details",
        "dramatic lighting",
        "crosshatching",
        "style mashup",
        "rough sketch shading",
        "scribble hatching",
        "double outline",
        "messy ink texture"
      ].join(", ")
    : [
        "photorealistic",
        "realistic skin",
        "3d render",
        "detailed realistic fur",
        "text",
        "logo",
        "watermark",
        "signature",
        "busy background",
        "scene props",
        "extra limbs",
        "missing limbs",
        "extra fingers",
        "deformed hands",
        "asymmetric eyes",
        "palette drift",
        "costume redesign",
        "extreme foreshortening",
        "dutch angle",
        "motion blur",
        "jpeg artifacts"
      ].join(", ");
  const hintText = joinPromptParts([
    styleHints?.channelName ? `channel style: ${styleHints.channelName}` : undefined,
    styleHints?.characterPersona ? `persona: ${styleHints.characterPersona}` : undefined,
    !mascotPreset && styleHints?.tone ? `tone: ${styleHints.tone}` : undefined,
    !mascotPreset && styleHints?.motion ? `motion style: ${styleHints.motion}` : undefined,
    !mascotPreset && styleHints?.typography ? `typography hint: ${styleHints.typography}` : undefined
  ]);

  const positivePrompt = joinPromptParts([
    styleCore,
    speciesPositive,
    input.positivePrompt,
    identityAnchors,
    renderDirectives,
    hintText
  ]);
  const negativePrompt = joinPromptParts([
    BASE_NEGATIVE_TEMPLATE,
    negativeCore,
    preset.negative,
    speciesNegative,
    input.negativePrompt
  ]);

  const guardrails = [
    "enforce transparent background",
    "reject text/watermark/logo artifacts",
    "maintain consistent head/torso proportions across views",
    "lock character identity across front, threeQuarter, profile views",
    "prefer plain background for clean alpha extraction",
    ...(mascotPreset
      ? [
          ...keepTraitTokens,
          "keep paw-like hands and avoid realistic fingers",
          "keep facial features minimal and centered",
          ...(speciesProfile ? speciesProfile.guardrails : []),
          ...rejectTraitTokens.map((trait) => `reject ${trait}`)
        ]
      : [])
  ];
  const viewModifiers = mascotPreset ? MASCOT_VIEW_MODIFIERS : DEFAULT_VIEW_MODIFIERS;

  const viewPrompts: Record<CharacterView, string> = {
    front: joinPromptParts([positivePrompt, viewModifiers.front, speciesProfile?.viewHints.front]),
    threeQuarter: joinPromptParts([positivePrompt, viewModifiers.threeQuarter, speciesProfile?.viewHints.threeQuarter]),
    profile: joinPromptParts([positivePrompt, viewModifiers.profile, speciesProfile?.viewHints.profile])
  };

  return {
    presetId: preset.id,
    ...(speciesProfile ? { speciesId: speciesProfile.id } : {}),
    ...(speciesProfile ? { mascotProfileId: speciesProfile.id } : {}),
    positivePrompt,
    negativePrompt,
    guardrails,
    qualityProfile: preset.qualityProfile,
    viewPrompts,
    ...(keepTraitTokens.length > 0 ? { keepTraits: keepTraitTokens } : {}),
    ...(rejectTraitTokens.length > 0 ? { rejectTraits: rejectTraitTokens } : {}),
    ...(speciesProfile ? { referenceBankId: speciesProfile.referenceBankId } : {}),
    ...(speciesProfile ? { heroMode: speciesProfile.heroMode } : {}),
    ...(speciesProfile ? { controlNetHintPolicy: speciesProfile.controlNetHintPolicy } : {}),
    ...(speciesProfile ? { qcThresholds: speciesProfile.qcThresholds } : {}),
    promptTokens: {
      styleCore,
      identityAnchors,
      renderDirectives,
      negativeCore
    },
    selectionHints: {
      minAcceptedScore: mascotPreset ? 0.58 : preset.qualityProfile.qualityTier === "production" ? 0.74 : 0.67,
      frontMasterMinAcceptedScore: mascotPreset ? speciesProfile?.qcThresholds.frontMasterMinScore ?? 0.62 : undefined,
      autoRetryRounds: mascotPreset ? 2 : preset.qualityProfile.qualityTier === "production" ? 3 : 2,
      frontMasterCandidateCount: mascotPreset ? 6 : undefined,
      repairCandidateCount: mascotPreset ? 2 : undefined,
      repairScoreFloor: mascotPreset ? speciesProfile?.qcThresholds.repairScoreFloor ?? 0.41 : undefined,
      sequentialReference: true,
      prioritizeConsistency: true,
      preferMultiReference: mascotPreset ? true : undefined,
      allowHeroMode: mascotPreset ? speciesProfile?.heroMode.allowOptionalHeroRef : undefined,
      heroModeReferenceWeightCap: mascotPreset ? speciesProfile?.heroMode.maxReferenceWeight : undefined
    }
  };
}

export function hashWorkflowIdentity(input: {
  provider: string;
  presetId: string;
  speciesId?: string;
  positivePrompt: string;
  negativePrompt: string;
  qualityProfileId?: string;
  sampler?: string;
  scheduler?: string;
  steps?: number;
  cfg?: number;
  width?: number;
  height?: number;
  postprocessPlan?: string[];
  workflowStage?: string;
  workflowTemplateVersion?: string;
  referenceBankSummary?: Array<Record<string, unknown>>;
  structureControlsSummary?: Array<Record<string, unknown>>;
}): string {
  return sha256Hex(
    JSON.stringify({
      provider: input.provider,
      presetId: input.presetId,
      speciesId: input.speciesId ?? null,
      positivePrompt: input.positivePrompt,
      negativePrompt: input.negativePrompt,
      qualityProfileId: input.qualityProfileId ?? null,
      sampler: input.sampler ?? null,
      scheduler: input.scheduler ?? null,
      steps: input.steps ?? null,
      cfg: input.cfg ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      postprocessPlan: input.postprocessPlan ?? [],
      workflowStage: input.workflowStage ?? null,
      workflowTemplateVersion: input.workflowTemplateVersion ?? null,
      referenceBankSummary: input.referenceBankSummary ?? [],
      structureControlsSummary: input.structureControlsSummary ?? []
    })
  );
}
