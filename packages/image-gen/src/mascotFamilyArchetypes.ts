import type { MascotFamilyArchetype } from "./types";

const FAMILY_ARCHETYPES: Record<string, MascotFamilyArchetype> = {
  feline_compact_doodle_v1: {
    id: "feline_compact_doodle_v1",
    label: "Feline Compact Doodle",
    styleLockPositive: [
      "minimal offbeat monochrome mascot",
      "large boxy rounded-square head with a flatter top and straighter sides",
      "tiny simple body",
      "short stubby limbs",
      "deadpan face",
      "two tiny vertical oval eyes",
      "solid black dot eyes with no white eye rings",
      "short straight mouth",
      "rough slightly uneven black outline",
      "flat white fill",
      "plain light gray background",
      "naive doodle finish",
      "minimal anatomy only"
    ],
    styleLockNegative: [
      "sticker border",
      "white outline",
      "drop shadow",
      "glossy vector finish",
      "plush toy look",
      "polished mascot design",
      "commercial mascot look",
      "big sparkling eyes",
      "outlined eye sockets",
      "large white eye patches",
      "oversized eye ovals",
      "highly expressive face",
      "3d render",
      "realistic fur",
      "gradient shading",
      "detailed shading",
      "multiple characters",
      "comparison panels",
      "turnaround sheet",
      "text",
      "logo"
    ],
    frontMasterPositive: [
      "establish the canonical front master identity",
      "strict front view",
      "neutral standing pose",
      "single centered full-body mascot",
      "full body visible with both short arms attached",
      "clear empty margin around the character"
    ],
    derivationPositive: [
      "preserve the supplied front master identity",
      "same head shape",
      "same face scale",
      "same body proportion",
      "same line personality",
      "no redesign",
      "stay inside the same mascot family style"
    ],
    heroCrop: {
      topBias: 0.04,
      heightRatio: 0.62,
      sidePadRatio: 0.12,
      targetHeightRatio: 0.8
    }
  },
  canine_compact_doodle_v1: {
    id: "canine_compact_doodle_v1",
    label: "Canine Compact Doodle",
    styleLockPositive: [
      "minimal offbeat monochrome mascot",
      "large boxy rounded-square head with a flatter top and straighter sides",
      "tiny simple body",
      "short stubby limbs",
      "deadpan face",
      "two tiny vertical oval eyes",
      "solid black dot eyes with no white eye rings",
      "short straight mouth",
      "rough slightly uneven black outline",
      "flat white fill",
      "plain light gray background",
      "naive doodle finish",
      "minimal anatomy only",
      "simple readable muzzle",
      "compact dog-or-wolf family silhouette"
    ],
    styleLockNegative: [
      "sticker border",
      "white outline",
      "drop shadow",
      "glossy vector finish",
      "plush toy look",
      "polished mascot design",
      "commercial mascot look",
      "big sparkling eyes",
      "outlined eye sockets",
      "large white eye patches",
      "oversized eye ovals",
      "highly expressive face",
      "3d render",
      "realistic fur",
      "gradient shading",
      "detailed shading",
      "multiple characters",
      "comparison panels",
      "turnaround sheet",
      "text",
      "logo",
      "full plush toy body"
    ],
    frontMasterPositive: [
      "establish the canonical front master identity",
      "strict front view",
      "neutral standing pose",
      "single centered full-body mascot",
      "full body visible with both short arms attached",
      "clear empty margin around the character",
      "species should read immediately from ear shape and muzzle silhouette"
    ],
    derivationPositive: [
      "preserve the supplied front master identity",
      "same head shape",
      "same ear placement",
      "same muzzle scale",
      "same body proportion",
      "same line personality",
      "no redesign",
      "stay inside the same mascot family style"
    ],
    heroCrop: {
      topBias: 0.03,
      heightRatio: 0.64,
      sidePadRatio: 0.14,
      targetHeightRatio: 0.82
    }
  },
  avian_compact_doodle_v1: {
    id: "avian_compact_doodle_v1",
    label: "Avian Compact Doodle",
    styleLockPositive: [
      "minimal offbeat monochrome mascot",
      "compact blocky bird head",
      "tiny upright body",
      "wing-like stubby arms",
      "deadpan face",
      "tiny eyes",
      "rough slightly uneven black outline",
      "flat white fill",
      "plain light gray background",
      "naive doodle finish",
      "minimal anatomy only"
    ],
    styleLockNegative: [
      "sticker border",
      "white outline",
      "drop shadow",
      "glossy vector finish",
      "plush toy look",
      "3d render",
      "realistic feathers",
      "detailed feather texture",
      "multiple characters",
      "text",
      "logo"
    ],
    frontMasterPositive: [
      "establish the canonical front master identity",
      "strict front view",
      "single centered mascot",
      "clear bird silhouette"
    ],
    derivationPositive: [
      "preserve the supplied front master identity",
      "same beak shape",
      "same face scale",
      "same body proportion",
      "same line personality",
      "no redesign"
    ],
    heroCrop: {
      topBias: 0.05,
      heightRatio: 0.62,
      sidePadRatio: 0.15,
      targetHeightRatio: 0.82
    }
  },
  small_mammal_compact_doodle_v1: {
    id: "small_mammal_compact_doodle_v1",
    label: "Small Mammal Compact Doodle",
    styleLockPositive: [
      "minimal offbeat monochrome mascot",
      "large compact rounded-square head",
      "tiny simple body",
      "short stubby limbs",
      "deadpan face",
      "two tiny vertical oval eyes",
      "short straight mouth",
      "rough slightly uneven black outline",
      "flat white fill",
      "plain light gray background",
      "naive doodle finish",
      "minimal anatomy only"
    ],
    styleLockNegative: [
      "sticker border",
      "white outline",
      "drop shadow",
      "glossy vector finish",
      "plush toy look",
      "3d render",
      "realistic fur",
      "multiple characters",
      "text",
      "logo"
    ],
    frontMasterPositive: [
      "establish the canonical front master identity",
      "strict front view",
      "single centered mascot"
    ],
    derivationPositive: [
      "preserve the supplied front master identity",
      "same head shape",
      "same body proportion",
      "same line personality",
      "no redesign"
    ],
    heroCrop: {
      topBias: 0.04,
      heightRatio: 0.62,
      sidePadRatio: 0.13,
      targetHeightRatio: 0.8
    }
  }
};

const DEFAULT_FAMILY_ARCHETYPE = FAMILY_ARCHETYPES.feline_compact_doodle_v1;

export function listMascotFamilyArchetypes(): MascotFamilyArchetype[] {
  return Object.values(FAMILY_ARCHETYPES);
}

export function resolveMascotFamilyArchetype(id?: string): MascotFamilyArchetype {
  const normalizedId = typeof id === "string" ? id.trim() : "";
  return (normalizedId && FAMILY_ARCHETYPES[normalizedId]) || DEFAULT_FAMILY_ARCHETYPE;
}
