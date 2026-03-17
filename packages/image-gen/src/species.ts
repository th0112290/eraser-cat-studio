import type { CharacterView, MascotSpeciesId, MascotSpeciesProfile } from "./types";

const DEFAULT_SPECIES_ID: MascotSpeciesId = "cat";
const BASE_FAMILY_ID = "compact_doodle_mascot_v2";

const FAMILY_POSITIVE_BASE = [
  "cute mascot character",
  "compact oversized head",
  "small rounded body",
  "stubby tube arms and legs",
  "paw or mitten hands only",
  "clean black outline on a light plain background",
  "very simple readable face",
  "single sticker-like silhouette"
];

const FAMILY_NEGATIVE_BASE = [
  "photorealistic",
  "3d render",
  "anime shading",
  "realistic fur",
  "realistic eyebrows",
  "realistic nose bridge",
  "realistic mouth",
  "human fingers",
  "five fingers",
  "knuckles",
  "nails",
  "long torso",
  "small head",
  "multiple characters",
  "sticker sheet",
  "character lineup",
  "turnaround sheet",
  "icon grid",
  "logo",
  "text",
  "symbol only",
  "double face parts",
  "detached ear",
  "rough sketch shading",
  "double outline"
];

const FAMILY_IDENTITY_BASE = [
  "same mascot across all angles",
  "same compact head-to-body ratio",
  "same stubby arm and leg proportions",
  "same paw hand design",
  "same simplified doodle family style"
];

const FAMILY_ANCHOR_BASE = ["same head width and height", "same eye spacing", "same body scale"];

const FAMILY_GUARDRAILS_BASE = [
  "keep the head large and compact",
  "keep the body much smaller than the head",
  "keep arms and legs short and simple",
  "keep the face minimal and readable",
  "keep the result inside the same mascot family"
];

const BASE_HERO_MODE: MascotSpeciesProfile["heroMode"] = {
  allowOptionalHeroRef: true,
  enabledByDefault: false,
  stages: ["identity_lock_refine", "repair_refine"],
  maxReferenceWeight: 0.58,
  minFrontScore: 0.7
};

const BASE_CONTROL_NET_HINT_POLICY: MascotSpeciesProfile["controlNetHintPolicy"] = {
  frontMasterPresetId: "mascot_front_style_v1",
  baseStagePresetId: "mascot_side_base_v1",
  advancedStagePresetId: "mascot_advanced_controlnet_v1",
  repairStagePresetId: "mascot_repair_impact_v1",
  defaultKindsByStage: {
    front_master: ["lineart", "canny"],
    side_view_base: ["lineart", "canny"],
    side_view_refine: ["lineart", "canny", "depth"],
    identity_lock_refine: ["lineart", "canny", "depth"],
    view_only: ["lineart", "canny"],
    repair_refine: ["lineart", "canny", "depth"]
  }
};

const BASE_ANIMATION_QC: MascotSpeciesProfile["animationQc"] = {
  minExpressionFaceVariation: 0.008,
  minVisemeFaceVariation: 0.007,
  maxExpressionBodyCenterDrift: 0.03,
  maxExpressionBodySizeDelta: 0.08,
  maxVisemeBodyCenterDrift: 0.03,
  maxEyeAnchorDrift: 0.035,
  maxMouthAnchorDrift: 0.03
};

const BASE_QC_THRESHOLDS: MascotSpeciesProfile["qcThresholds"] = {
  frontMasterMinScore: 0.62,
  frontMasterMinStyleScore: 0.38,
  frontMasterMinSpeciesScore: 0.26,
  frontMasterMinHeadSquarenessScore: 0.26,
  repairScoreFloor: 0.41,
  minConsistencyByView: {
    threeQuarter: 0.48,
    profile: 0.4
  },
  minHeadRatioByView: {
    front: 0.34,
    threeQuarter: 0.22,
    profile: 0.18
  },
  minGeometryCueByView: {
    threeQuarter: 0.4,
    profile: 0.34
  },
  minFrontSymmetryScore: 0.54,
  minSubjectIsolationFront: 0.46,
  maxSpeciesSpread: 0.18,
  maxStyleSpread: 0.16,
  maxHeadRatioSpread: 0.14,
  maxMonochromeSpread: 0.18,
  maxEarCueSpread: 0.24,
  maxMuzzleCueSpread: 0.22,
  maxHeadShapeCueSpread: 0.22,
  maxSilhouetteCueSpread: 0.24
};

const BASE_COMPONENT_CONFIDENCE_BOOST = Object.freeze({
  mouth: 0,
  eyeNear: 0,
  eyeFar: 0,
  earNear: 0,
  earFar: 0,
  paw: 0,
  tail: 0
});

const BASE_FALLBACK_CONFIDENCE = Object.freeze({
  mouth: 0.24,
  eyeNear: 0.22,
  eyeFar: 0.24,
  earNear: 0.24,
  earFar: 0.24,
  paw: 0.22,
  tail: 0.28
});

const BASE_ANCHOR_EXTRACTOR_HEURISTICS: MascotSpeciesAnchorHeuristics = Object.freeze({
  byView: {
    front: {
      mouthBiasX: 0,
      eyeNearBiasX: 0,
      eyeFarBiasX: 0,
      earNearBiasX: 0,
      earFarBiasX: 0,
      earBiasY: 0,
      pawBiasX: 0,
      pawBiasY: 0,
      tailBiasX: 0,
      tailBiasY: 0,
      mouthWidthScale: 1,
      mouthHeightScale: 1,
      earWidthScale: 1,
      earHeightScale: 1,
      pawWidthScale: 1,
      pawHeightScale: 1,
      tailWidthScale: 1,
      tailHeightScale: 1,
      componentConfidenceBoost: { ...BASE_COMPONENT_CONFIDENCE_BOOST },
      fallbackConfidence: { ...BASE_FALLBACK_CONFIDENCE, mouth: 0.22, eyeFar: 0.28, earFar: 0.3 },
      expectedVisibility: {
        eyeFar: "present",
        earFar: "present",
        pawAnchor: "present",
        tailRoot: "present"
      },
      qc: {}
    },
    threeQuarter: {
      mouthBiasX: 0,
      eyeNearBiasX: 0,
      eyeFarBiasX: 0,
      earNearBiasX: 0,
      earFarBiasX: 0,
      earBiasY: 0,
      pawBiasX: 0,
      pawBiasY: 0,
      tailBiasX: 0,
      tailBiasY: 0,
      mouthWidthScale: 1,
      mouthHeightScale: 1,
      earWidthScale: 1,
      earHeightScale: 1,
      pawWidthScale: 1,
      pawHeightScale: 1,
      tailWidthScale: 1,
      tailHeightScale: 1,
      componentConfidenceBoost: { ...BASE_COMPONENT_CONFIDENCE_BOOST },
      fallbackConfidence: { ...BASE_FALLBACK_CONFIDENCE, eyeFar: 0.32, earFar: 0.32, tail: 0.3 },
      expectedVisibility: {
        eyeFar: "present",
        earFar: "present",
        pawAnchor: "present",
        tailRoot: "occluded"
      },
      qc: {
        muzzleProjection: { min: 0.08, max: 0.26 },
        earHeight: { min: 0.1, max: 0.36 }
      }
    },
    profile: {
      mouthBiasX: 0,
      eyeNearBiasX: 0,
      eyeFarBiasX: 0,
      earNearBiasX: 0,
      earFarBiasX: 0,
      earBiasY: 0,
      pawBiasX: 0,
      pawBiasY: 0,
      tailBiasX: 0,
      tailBiasY: 0,
      mouthWidthScale: 1,
      mouthHeightScale: 1,
      earWidthScale: 1,
      earHeightScale: 1,
      pawWidthScale: 1,
      pawHeightScale: 1,
      tailWidthScale: 1,
      tailHeightScale: 1,
      componentConfidenceBoost: { ...BASE_COMPONENT_CONFIDENCE_BOOST },
      fallbackConfidence: { ...BASE_FALLBACK_CONFIDENCE, eyeFar: 0.18, earFar: 0.18, tail: 0.26 },
      expectedVisibility: {
        eyeFar: "not_applicable",
        earFar: "not_applicable",
        pawAnchor: "present",
        tailRoot: "occluded"
      },
      qc: {
        muzzleProjection: { min: 0.12, max: 0.3 },
        earHeight: { min: 0.12, max: 0.4 }
      }
    }
  }
});

type SpeciesOverride = {
  label: string;
  referenceBankId: string;
  positiveTokens: string[];
  negativeTokens: string[];
  identityTokens: string[];
  anchorTokens: string[];
  guardrails: string[];
  viewHints: Partial<Record<"front" | "threeQuarter" | "profile", string>>;
  keepTraits: string[];
  rejectTraits: string[];
  animationQc?: Partial<MascotSpeciesProfile["animationQc"]>;
  qcThresholds?: Partial<MascotSpeciesProfile["qcThresholds"]>;
};

export type MascotAnchorExpectation = "present" | "occluded" | "not_applicable";

export type MascotAnchorQcWindow = {
  min: number;
  max: number;
};

export type MascotSpeciesAnchorExtractorViewProfile = {
  mouthBiasX: number;
  eyeNearBiasX: number;
  eyeFarBiasX: number;
  earNearBiasX: number;
  earFarBiasX: number;
  earBiasY: number;
  pawBiasX: number;
  pawBiasY: number;
  tailBiasX: number;
  tailBiasY: number;
  mouthWidthScale: number;
  mouthHeightScale: number;
  earWidthScale: number;
  earHeightScale: number;
  pawWidthScale: number;
  pawHeightScale: number;
  tailWidthScale: number;
  tailHeightScale: number;
  componentConfidenceBoost: {
    mouth: number;
    eyeNear: number;
    eyeFar: number;
    earNear: number;
    earFar: number;
    paw: number;
    tail: number;
  };
  fallbackConfidence: {
    mouth: number;
    eyeNear: number;
    eyeFar: number;
    earNear: number;
    earFar: number;
    paw: number;
    tail: number;
  };
  expectedVisibility: {
    eyeFar: MascotAnchorExpectation;
    earFar: MascotAnchorExpectation;
    pawAnchor: MascotAnchorExpectation;
    tailRoot: MascotAnchorExpectation;
  };
  qc: {
    muzzleProjection?: MascotAnchorQcWindow;
    earHeight?: MascotAnchorQcWindow;
    requirePawReadable?: boolean;
    requireTailVisible?: boolean;
  };
};

export type MascotSpeciesAnchorHeuristics = {
  byView: Record<CharacterView, MascotSpeciesAnchorExtractorViewProfile>;
};

type SpeciesAnchorHeuristicOverride = {
  byView?: Partial<Record<CharacterView, Partial<MascotSpeciesAnchorExtractorViewProfile>>>;
};

const SPECIES_OVERRIDES: Record<MascotSpeciesId, SpeciesOverride> = Object.freeze({
  cat: {
    label: "Cat",
    referenceBankId: "cat_mascot_bank_v1",
    positiveTokens: [
      "rounded-square cat head",
      "slightly flat head top",
      "pointed triangular cat ears",
      "almost no muzzle projection",
      "tiny dash mouth",
      "two short whisker strokes on each cheek",
      "cat-first silhouette"
    ],
    negativeTokens: ["dog muzzle", "wolf wedge snout", "button nose", "floppy dog ears", "canine face"],
    identityTokens: [
      "pointed cat ears",
      "two whisker strokes per cheek",
      "almost no muzzle projection",
      "single connected cat silhouette"
    ],
    anchorTokens: ["same cat ear spacing", "same cat cheek width", "same whisker rhythm", "same centered upper face placement"],
    guardrails: [
      "do not add a realistic cat nose",
      "do not turn the face into a canine muzzle",
      "keep whiskers simple and sparse",
      "do not split the cat into detached ear, whisker, or foreground fragments"
    ],
    viewHints: {
      front:
        "front view should read as cat first, with pointed ears, minimal muzzle, a compact blocky head, exactly two short whisker strokes per side, full body visible, a single centered subject, a face sitting high in the upper head, and no duplicate foreground fragments",
      threeQuarter:
        "three-quarter cat should stay compact and cute, show both ears attached, keep both eyes visible, and avoid extra muzzle projection",
      profile:
        "profile cat should keep a very short feline muzzle, one eye only, a clear compact head silhouette, and short cheek whisker strokes"
    },
    keepTraits: [
      "compact blocky cat head",
      "slightly flat head top",
      "pointed cat ears",
      "minimal feline muzzle",
      "two short whisker strokes per cheek",
      "tiny body and short limbs"
    ],
    rejectTraits: [
      "dog muzzle",
      "wolf wedge snout",
      "button nose",
      "human fingers",
      "long realistic tail",
      "multiple characters"
    ],
    animationQc: {
      minExpressionFaceVariation: 0.0085,
      minVisemeFaceVariation: 0.0075
    }
  },
  dog: {
    label: "Dog",
    referenceBankId: "dog_mascot_bank_v1",
    positiveTokens: [
      "compact dog head silhouette",
      "soft rounded dog ears",
      "short rounded puppy muzzle",
      "tiny button nose",
      "friendly domestic dog silhouette",
      "stubby front arms with mitten paws"
    ],
    negativeTokens: [
      "cat whiskers",
      "sharp wolf snout",
      "tall wolf ears",
      "flat cat face with no muzzle",
      "fox face",
      "rabbit ears",
      "bunny ears",
      "rabbit face",
      "missing arm",
      "detached limb"
    ],
    identityTokens: ["soft dog ears", "short puppy muzzle", "tiny button nose", "visible short front arms"],
    anchorTokens: [
      "same dog ear placement",
      "same puppy muzzle width",
      "same button nose position",
      "same front arm placement"
    ],
    guardrails: [
      "do not drift back to a cat whisker-face",
      "do not lengthen the muzzle into wolf territory",
      "keep the dog muzzle rounded and short",
      "keep both front arms and both paws readable when the pose shows them",
      "do not turn the dog into a rabbit with tall narrow ears"
    ],
    viewHints: {
      front:
        "front view should read as dog first while staying in the same mascot family, with rounded-base dog ears, a short rounded muzzle, a tiny button nose, a simple tiny mouth, and both short arms visible with attached paws",
      threeQuarter:
        "three-quarter dog should preserve the same compact head and body while clearly turning about 35 to 45 degrees, showing a soft rounded puppy muzzle, lower rounded ears, a larger near cheek, and a smaller but still present far paw",
      profile:
        "profile dog should show a short rounded muzzle and one soft ear, domestic and cute, not cat-flat and not wolf-sharp, with one readable near paw and no detached far-limb fragments"
    },
    keepTraits: [
      "compact dog head",
      "soft dog ears",
      "short rounded puppy muzzle",
      "tiny button nose",
      "tiny body and short limbs",
      "stubby front arms"
    ],
    rejectTraits: [
      "cat whiskers",
      "sharp wolf snout",
      "tall wolf ears",
      "fox face",
      "rabbit ears",
      "bunny ears",
      "human fingers",
      "missing arm",
      "detached limb",
      "multiple characters"
    ],
    animationQc: {
      minExpressionFaceVariation: 0.009,
      minVisemeFaceVariation: 0.008,
      maxMouthAnchorDrift: 0.028
    },
    qcThresholds: {
      frontMasterMinStyleScore: 0.4,
      frontMasterMinSpeciesScore: 0.34,
      frontMasterMinHeadSquarenessScore: 0.18,
      minHeadRatioByView: {
        front: 0.32,
        threeQuarter: 0.2,
        profile: 0.16
      },
      minGeometryCueByView: {
        threeQuarter: 0.4,
        profile: 0.34
      },
      minFrontSymmetryScore: 0.52,
      maxSpeciesSpread: 0.16,
      maxHeadRatioSpread: 0.16,
      maxMuzzleCueSpread: 0.24,
      maxSilhouetteCueSpread: 0.26
    }
  },
  wolf: {
    label: "Wolf",
    referenceBankId: "wolf_mascot_bank_v1",
    positiveTokens: [
      "compact wolf head silhouette",
      "taller sharp upright ears",
      "short angular wedge muzzle",
      "alert cute wolf silhouette",
      "broad wolf cheek ruff"
    ],
    negativeTokens: [
      "floppy dog ears",
      "round puppy muzzle",
      "cat whiskers",
      "cat-flat no-muzzle face",
      "fox face",
      "fox muzzle",
      "fox ears",
      "puppy face"
    ],
    identityTokens: ["tall wolf ears", "short angular wedge muzzle", "alert wolf silhouette", "broad wolf cheek ruff"],
    anchorTokens: ["same wolf ear angle", "same wedge muzzle width", "same wolf face direction"],
    guardrails: [
      "keep the muzzle only slightly longer, not realistic",
      "do not round the wolf into a puppy face",
      "do not add cat whisker-face cues",
      "do not turn the wolf into a fox with a narrow sly face",
      "keep the wolf cheeks broad and the face short, not sly or narrow"
    ],
    viewHints: {
      front:
        "front view should read as wolf first in the same mascot family, with taller upright ears, a short angular muzzle that stays cute and simplified, a broader wolf head than a fox, and no puppy softness or fox narrowing",
      threeQuarter:
        "three-quarter wolf should keep the same compact body and head while clearly turning about 35 to 45 degrees, showing a slightly longer wedge muzzle, alert ears, a larger near eye than far eye, and a broad wolf head that does not read as fox-like or front-facing",
      profile:
        "profile wolf should have a short angular wedge muzzle, one tall ear, a simple eye, and the same small-body mascot proportions, with a broader wolf contour and not a slim fox profile"
    },
    keepTraits: [
      "compact wolf head",
      "tall upright ears",
      "short angular wedge muzzle",
      "alert silhouette",
      "tiny body and short limbs",
      "broad wolf cheek ruff"
    ],
    rejectTraits: [
      "floppy dog ears",
      "round puppy muzzle",
      "cat whiskers",
      "fox face",
      "fox muzzle",
      "fox ears",
      "human fingers",
      "multiple characters"
    ],
    animationQc: {
      minExpressionFaceVariation: 0.0095,
      minVisemeFaceVariation: 0.0085,
      maxExpressionBodyCenterDrift: 0.028,
      maxVisemeBodyCenterDrift: 0.028,
      maxEyeAnchorDrift: 0.032,
      maxMouthAnchorDrift: 0.028
    },
    qcThresholds: {
      frontMasterMinStyleScore: 0.37,
      frontMasterMinSpeciesScore: 0.28,
      frontMasterMinHeadSquarenessScore: 0.24,
      minConsistencyByView: {
        threeQuarter: 0.48,
        profile: 0.38
      },
      minGeometryCueByView: {
        threeQuarter: 0.42,
        profile: 0.35
      },
      minFrontSymmetryScore: 0.5,
      maxSpeciesSpread: 0.18,
      maxEarCueSpread: 0.26,
      maxMuzzleCueSpread: 0.24,
      maxHeadShapeCueSpread: 0.24,
      maxSilhouetteCueSpread: 0.26
    }
  }
});

const SPECIES_ANCHOR_HEURISTIC_OVERRIDES: Record<MascotSpeciesId, SpeciesAnchorHeuristicOverride> = Object.freeze({
  cat: {
    byView: {
      front: {
        componentConfidenceBoost: {
          ...BASE_COMPONENT_CONFIDENCE_BOOST,
          mouth: -0.02,
          earNear: 0.02,
          earFar: 0.01
        }
      },
      threeQuarter: {
        mouthBiasX: -0.035,
        earBiasY: -0.018,
        earWidthScale: 0.96,
        earHeightScale: 1.08,
        componentConfidenceBoost: {
          ...BASE_COMPONENT_CONFIDENCE_BOOST,
          mouth: -0.02,
          earNear: 0.04,
          earFar: 0.02
        },
        qc: {
          muzzleProjection: { min: 0.06, max: 0.2 },
          earHeight: { min: 0.16, max: 0.42 }
        }
      },
      profile: {
        mouthBiasX: -0.075,
        earBiasY: -0.02,
        earWidthScale: 0.92,
        earHeightScale: 1.1,
        componentConfidenceBoost: {
          ...BASE_COMPONENT_CONFIDENCE_BOOST,
          mouth: -0.03,
          earNear: 0.05
        },
        expectedVisibility: {
          eyeFar: "not_applicable",
          earFar: "not_applicable",
          pawAnchor: "occluded",
          tailRoot: "occluded"
        },
        qc: {
          muzzleProjection: { min: 0.08, max: 0.22 },
          earHeight: { min: 0.18, max: 0.46 }
        }
      }
    }
  },
  dog: {
    byView: {
      front: {
        componentConfidenceBoost: {
          ...BASE_COMPONENT_CONFIDENCE_BOOST,
          mouth: 0.03,
          paw: 0.04
        }
      },
      threeQuarter: {
        mouthBiasX: 0.02,
        earBiasY: 0.018,
        earWidthScale: 1.08,
        earHeightScale: 0.9,
        pawBiasX: 0.04,
        pawWidthScale: 1.08,
        pawHeightScale: 1.04,
        componentConfidenceBoost: {
          ...BASE_COMPONENT_CONFIDENCE_BOOST,
          mouth: 0.03,
          paw: 0.08
        },
        qc: {
          muzzleProjection: { min: 0.1, max: 0.28 },
          earHeight: { min: 0.08, max: 0.26 },
          requirePawReadable: true
        }
      },
      profile: {
        mouthBiasX: 0.045,
        earBiasY: 0.024,
        earWidthScale: 1.12,
        earHeightScale: 0.84,
        pawBiasX: 0.06,
        pawWidthScale: 1.12,
        pawHeightScale: 1.06,
        componentConfidenceBoost: {
          ...BASE_COMPONENT_CONFIDENCE_BOOST,
          mouth: 0.04,
          paw: 0.1
        },
        expectedVisibility: {
          eyeFar: "not_applicable",
          earFar: "not_applicable",
          pawAnchor: "present",
          tailRoot: "occluded"
        },
        qc: {
          muzzleProjection: { min: 0.14, max: 0.3 },
          earHeight: { min: 0.06, max: 0.22 },
          requirePawReadable: true
        }
      }
    }
  },
  wolf: {
    byView: {
      front: {
        componentConfidenceBoost: {
          ...BASE_COMPONENT_CONFIDENCE_BOOST,
          mouth: 0.02,
          earNear: 0.05,
          earFar: 0.04
        }
      },
      threeQuarter: {
        mouthBiasX: 0.04,
        earBiasY: -0.026,
        earWidthScale: 0.94,
        earHeightScale: 1.14,
        tailBiasX: -0.02,
        componentConfidenceBoost: {
          ...BASE_COMPONENT_CONFIDENCE_BOOST,
          mouth: 0.03,
          earNear: 0.08,
          earFar: 0.06
        },
        qc: {
          muzzleProjection: { min: 0.13, max: 0.32 },
          earHeight: { min: 0.18, max: 0.42 },
          requireTailVisible: true
        }
      },
      profile: {
        mouthBiasX: 0.07,
        earBiasY: -0.03,
        earWidthScale: 0.9,
        earHeightScale: 1.18,
        tailBiasX: -0.02,
        componentConfidenceBoost: {
          ...BASE_COMPONENT_CONFIDENCE_BOOST,
          mouth: 0.04,
          earNear: 0.1
        },
        expectedVisibility: {
          eyeFar: "not_applicable",
          earFar: "not_applicable",
          pawAnchor: "occluded",
          tailRoot: "occluded"
        },
        qc: {
          muzzleProjection: { min: 0.16, max: 0.34 },
          earHeight: { min: 0.2, max: 0.48 },
          requireTailVisible: true
        }
      }
    }
  }
});

function mergeQcThresholds(
  overrides: Partial<MascotSpeciesProfile["qcThresholds"]> | undefined
): MascotSpeciesProfile["qcThresholds"] {
  return {
    ...BASE_QC_THRESHOLDS,
    ...overrides,
    minConsistencyByView: {
      ...BASE_QC_THRESHOLDS.minConsistencyByView,
      ...(overrides?.minConsistencyByView ?? {})
    },
    minHeadRatioByView: {
      ...BASE_QC_THRESHOLDS.minHeadRatioByView,
      ...(overrides?.minHeadRatioByView ?? {})
    },
    minGeometryCueByView: {
      ...BASE_QC_THRESHOLDS.minGeometryCueByView,
      ...(overrides?.minGeometryCueByView ?? {})
    }
  };
}

function mergeAnimationQc(
  overrides: Partial<MascotSpeciesProfile["animationQc"]> | undefined
): MascotSpeciesProfile["animationQc"] {
  return {
    ...BASE_ANIMATION_QC,
    ...(overrides ?? {})
  };
}

function mergeAnchorExtractorViewProfile(
  base: MascotSpeciesAnchorExtractorViewProfile,
  overrides: Partial<MascotSpeciesAnchorExtractorViewProfile> | undefined
): MascotSpeciesAnchorExtractorViewProfile {
  return {
    ...base,
    ...(overrides ?? {}),
    componentConfidenceBoost: {
      ...base.componentConfidenceBoost,
      ...(overrides?.componentConfidenceBoost ?? {})
    },
    fallbackConfidence: {
      ...base.fallbackConfidence,
      ...(overrides?.fallbackConfidence ?? {})
    },
    expectedVisibility: {
      ...base.expectedVisibility,
      ...(overrides?.expectedVisibility ?? {})
    },
    qc: {
      ...base.qc,
      ...(overrides?.qc ?? {})
    }
  };
}

function composeSpeciesProfile(id: MascotSpeciesId): MascotSpeciesProfile {
  const override = SPECIES_OVERRIDES[id];
  return {
    id,
    label: override.label,
    familyId: BASE_FAMILY_ID,
    referenceBankId: override.referenceBankId,
    positiveTokens: [...FAMILY_POSITIVE_BASE, ...override.positiveTokens],
    negativeTokens: [...FAMILY_NEGATIVE_BASE, ...override.negativeTokens],
    identityTokens: [...FAMILY_IDENTITY_BASE, ...override.identityTokens],
    anchorTokens: [...FAMILY_ANCHOR_BASE, ...override.anchorTokens],
    guardrails: [...FAMILY_GUARDRAILS_BASE, ...override.guardrails],
    viewHints: {
      ...override.viewHints
    },
    keepTraits: [...override.keepTraits],
    rejectTraits: [...override.rejectTraits],
    heroMode: {
      ...BASE_HERO_MODE
    },
    controlNetHintPolicy: {
      ...BASE_CONTROL_NET_HINT_POLICY,
      defaultKindsByStage: {
        ...BASE_CONTROL_NET_HINT_POLICY.defaultKindsByStage
      }
    },
    animationQc: mergeAnimationQc(override.animationQc),
    qcThresholds: mergeQcThresholds(override.qcThresholds)
  };
}

export function listMascotSpeciesProfiles(): MascotSpeciesProfile[] {
  return (["cat", "dog", "wolf"] as const).map((id) => composeSpeciesProfile(id));
}

export function resolveMascotSpeciesProfile(id?: string): MascotSpeciesProfile {
  const normalized = typeof id === "string" ? id.trim().toLowerCase() : "";
  if (normalized === "dog" || normalized === "wolf" || normalized === "cat") {
    return composeSpeciesProfile(normalized);
  }
  return composeSpeciesProfile(DEFAULT_SPECIES_ID);
}

export function resolveMascotAnchorHeuristics(id?: string): MascotSpeciesAnchorHeuristics {
  const normalizedSpeciesId = resolveMascotSpeciesProfile(id).id;
  const override = SPECIES_ANCHOR_HEURISTIC_OVERRIDES[normalizedSpeciesId];
  return {
    byView: {
      front: mergeAnchorExtractorViewProfile(BASE_ANCHOR_EXTRACTOR_HEURISTICS.byView.front, override?.byView?.front),
      threeQuarter: mergeAnchorExtractorViewProfile(
        BASE_ANCHOR_EXTRACTOR_HEURISTICS.byView.threeQuarter,
        override?.byView?.threeQuarter
      ),
      profile: mergeAnchorExtractorViewProfile(BASE_ANCHOR_EXTRACTOR_HEURISTICS.byView.profile, override?.byView?.profile)
    }
  };
}
