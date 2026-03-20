import assert from "node:assert/strict";
import {
  assessQualityEmbargo,
  assessAutoSelectionRisk,
  buildPackCoherenceDiagnostics,
  classifyCandidateRuntimeBucket,
  decideAutoReroute,
  isRuntimeBucketLowQuality,
  readAutoRerouteConfig
} from "./characterGeneration";

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function makeCandidate(
  view: "front" | "threeQuarter" | "profile",
  overrides: {
    score?: number;
    consistencyScore?: number | null;
    warnings?: string[];
    rejections?: string[];
    frontSymmetryScore?: number;
    headSquarenessScore?: number;
    speciesScore?: number;
    targetStyleScore?: number;
    speciesEarScore?: number;
    speciesMuzzleScore?: number;
    speciesHeadShapeScore?: number;
    speciesSilhouetteScore?: number;
    providerMeta?: Record<string, unknown>;
  } = {}
): any {
  return {
    candidate: {
      id: `${view}_candidate`,
      view,
      ...(overrides.providerMeta ? { providerMeta: overrides.providerMeta } : {})
    },
    analysis: {},
    score: overrides.score ?? 0.82,
    styleScore: overrides.targetStyleScore ?? 0.62,
    referenceSimilarity: null,
    consistencyScore: overrides.consistencyScore ?? (view === "front" ? null : 0.7),
    warnings: overrides.warnings ?? [],
    rejections: overrides.rejections ?? [],
    breakdown: {
      frontSymmetryScore: overrides.frontSymmetryScore ?? 0.74,
      headSquarenessScore: overrides.headSquarenessScore ?? 0.41,
      speciesScore: overrides.speciesScore ?? 0.52,
      targetStyleScore: overrides.targetStyleScore ?? 0.63,
      speciesEarScore: overrides.speciesEarScore ?? 0.66,
      speciesMuzzleScore: overrides.speciesMuzzleScore ?? 0.7,
      speciesHeadShapeScore: overrides.speciesHeadShapeScore ?? 0.56,
      speciesSilhouetteScore: overrides.speciesSilhouetteScore ?? 0.68
    }
  };
}

const defaultConfig = withEnv(
  {
    CHARACTER_AUTO_REROUTE_ENABLED: undefined,
    CHARACTER_AUTO_REROUTE_TARGETED_BOOST: undefined,
    CHARACTER_AUTO_REROUTE_FULLPACK_BOOST: undefined,
    CHARACTER_AUTO_REROUTE_TARGETED_THRESHOLD_BOOST: undefined,
    CHARACTER_AUTO_REROUTE_FULLPACK_THRESHOLD_BOOST: undefined,
    CHARACTER_AUTO_REROUTE_SEED_OFFSET: undefined
  },
  () => readAutoRerouteConfig()
);

const overriddenConfig = withEnv(
  {
    CHARACTER_AUTO_REROUTE_ENABLED: "false",
    CHARACTER_AUTO_REROUTE_TARGETED_BOOST: "2",
    CHARACTER_AUTO_REROUTE_FULLPACK_BOOST: "5",
    CHARACTER_AUTO_REROUTE_TARGETED_THRESHOLD_BOOST: "0.05",
    CHARACTER_AUTO_REROUTE_FULLPACK_THRESHOLD_BOOST: "0.07",
    CHARACTER_AUTO_REROUTE_SEED_OFFSET: "31000"
  },
  () => readAutoRerouteConfig()
);

assert.equal(overriddenConfig.enabled, false);
assert.equal(overriddenConfig.targetedCandidateBoost, 2);
assert.equal(overriddenConfig.fullPackCandidateBoost, 4);
assert.equal(overriddenConfig.targetedThresholdBoost, 0.05);
assert.equal(overriddenConfig.fullPackThresholdBoost, 0.07);
assert.equal(overriddenConfig.seedOffset, 31000);

const targeted = decideAutoReroute({
  config: defaultConfig,
  generationViewToGenerate: undefined,
  providerName: "comfyui",
  requestedViews: ["front", "threeQuarter", "profile"],
  packCoherence: {
    issues: ["threeQuarter_consistency_floor_low"],
    severity: "block",
    score: 0.61,
    blockingViews: ["threeQuarter"],
    warningViews: ["profile"],
    metrics: {
      frontAnchorScore: 0.78,
      frontStyleScore: 0.62,
      frontSpeciesScore: 0.58,
      threeQuarterConsistency: 0.39,
      profileConsistency: 0.51,
      speciesSpread: 0.08,
      styleSpread: 0.05,
      headRatioSpread: 0.04,
      monochromeSpread: 0.03
    }
  },
  missingGeneratedViews: [],
  lowQualityGeneratedViews: [],
  frontStrong: true,
  continuity: {
    enabled: true,
    attempted: true,
    applied: true,
    reason: "reused"
  }
});

assert.ok(targeted);
assert.equal(targeted?.strategy, "targeted_view_retry");
assert.deepEqual(targeted?.targetViews, ["threeQuarter", "profile"]);
assert.equal(targeted?.seedOffset, defaultConfig.seedOffset + 2 * 173);

const fullPack = decideAutoReroute({
  config: defaultConfig,
  generationViewToGenerate: undefined,
  providerName: "comfyui",
  requestedViews: ["front", "threeQuarter", "profile"],
  packCoherence: {
    issues: ["front_master_not_strong_enough"],
    severity: "block",
    score: 0.48,
    blockingViews: ["front"],
    warningViews: [],
    metrics: {
      frontAnchorScore: 0.52,
      frontStyleScore: 0.44,
      frontSpeciesScore: 0.28,
      threeQuarterConsistency: 0.59,
      profileConsistency: 0.55,
      speciesSpread: 0.12,
      styleSpread: 0.11,
      headRatioSpread: 0.09,
      monochromeSpread: 0.04
    }
  },
  missingGeneratedViews: [],
  lowQualityGeneratedViews: ["front"],
  frontStrong: false,
  continuity: {
    enabled: true,
    attempted: true,
    applied: false,
    reason: "no_viable_session"
  }
});

assert.ok(fullPack);
assert.equal(fullPack?.strategy, "full_pack_rebuild");
assert.deepEqual(fullPack?.targetViews, ["front", "threeQuarter", "profile"]);
assert.equal(fullPack?.seedOffset, defaultConfig.seedOffset + 7000 + 3 * 173);

const reviewTriggered = decideAutoReroute({
  config: defaultConfig,
  generationViewToGenerate: undefined,
  providerName: "comfyui",
  requestedViews: ["front", "threeQuarter", "profile"],
  packCoherence: {
    issues: ["profile_style_drift"],
    severity: "review",
    score: 0.8,
    blockingViews: [],
    warningViews: ["profile"],
    metrics: {
      frontAnchorScore: 0.81,
      frontStyleScore: 0.61,
      frontSpeciesScore: 0.53,
      threeQuarterConsistency: 0.59,
      profileConsistency: 0.48,
      speciesSpread: 0.07,
      styleSpread: 0.08,
      headRatioSpread: 0.05,
      monochromeSpread: 0.03
    }
  },
  missingGeneratedViews: [],
  lowQualityGeneratedViews: ["profile"],
  frontStrong: true,
  continuity: {
    enabled: true,
    attempted: true,
    applied: true,
    reason: "reused"
  }
});

assert.ok(reviewTriggered);
assert.equal(reviewTriggered?.strategy, "targeted_view_retry");
assert.deepEqual(reviewTriggered?.targetViews, ["profile"]);

const localizedCatSpreadPackCoherence = buildPackCoherenceDiagnostics({
  selectedByView: {
    front: makeCandidate("front", {
      score: 0.9,
      frontSymmetryScore: 0.9932,
      headSquarenessScore: 0.3668,
      speciesScore: 0.6332,
      targetStyleScore: 0.7956,
      speciesEarScore: 0.75,
      speciesMuzzleScore: 0.7874,
      speciesHeadShapeScore: 0.58,
      speciesSilhouetteScore: 0.6072
    }),
    threeQuarter: makeCandidate("threeQuarter", {
      score: 0.8147,
      consistencyScore: 0.6621,
      warnings: ["consistency_shape_drift"],
      speciesScore: 0.57,
      targetStyleScore: 0.75,
      speciesEarScore: 0.2994,
      speciesMuzzleScore: 0.18,
      speciesHeadShapeScore: 0.5365,
      speciesSilhouetteScore: 0.15
    }),
    profile: makeCandidate("profile", {
      score: 0.8609,
      consistencyScore: 0.5863,
      warnings: [],
      speciesScore: 0.58,
      targetStyleScore: 0.71,
      speciesEarScore: 0.75,
      speciesMuzzleScore: 0.7874,
      speciesHeadShapeScore: 0.58,
      speciesSilhouetteScore: 0.6072
    })
  },
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58,
  speciesId: "cat"
});

assert.equal(localizedCatSpreadPackCoherence.severity, "block");
assert.deepEqual(localizedCatSpreadPackCoherence.blockingViews, ["threeQuarter"]);
assert.deepEqual(localizedCatSpreadPackCoherence.warningViews, []);

const localizedCatSpreadReroute = decideAutoReroute({
  config: defaultConfig,
  generationViewToGenerate: undefined,
  providerName: "comfyui",
  requestedViews: ["front", "threeQuarter", "profile"],
  packCoherence: localizedCatSpreadPackCoherence,
  missingGeneratedViews: [],
  lowQualityGeneratedViews: ["threeQuarter"],
  frontStrong: true,
  continuity: {
    enabled: true,
    attempted: true,
    applied: false,
    reason: "no_recent_ready_session"
  }
});

assert.ok(localizedCatSpreadReroute);
assert.equal(localizedCatSpreadReroute?.strategy, "targeted_view_retry");
assert.deepEqual(localizedCatSpreadReroute?.targetViews, ["threeQuarter"]);

const reviewSkipped = decideAutoReroute({
  config: defaultConfig,
  generationViewToGenerate: undefined,
  providerName: "comfyui",
  requestedViews: ["front", "threeQuarter", "profile"],
  packCoherence: {
    issues: ["style_score_spread_too_wide"],
    severity: "review",
    score: 0.78,
    blockingViews: [],
    warningViews: ["front"],
    metrics: {
      frontAnchorScore: 0.8,
      frontStyleScore: 0.51,
      frontSpeciesScore: 0.54,
      threeQuarterConsistency: 0.58,
      profileConsistency: 0.49,
      speciesSpread: 0.06,
      styleSpread: 0.08,
      headRatioSpread: 0.04,
      monochromeSpread: 0.04
    }
  },
  missingGeneratedViews: [],
  lowQualityGeneratedViews: [],
  frontStrong: true,
  continuity: {
    enabled: true,
    attempted: true,
    applied: true,
    reason: "reused"
  }
});

assert.equal(reviewSkipped, undefined);

const runtimeFrontRebuild = decideAutoReroute({
  config: defaultConfig,
  generationViewToGenerate: undefined,
  providerName: "comfyui",
  requestedViews: ["front", "threeQuarter", "profile"],
  packCoherence: undefined,
  missingGeneratedViews: [],
  lowQualityGeneratedViews: [],
  runtimeLowQualityViews: ["front"],
  frontStrong: true,
  continuity: {
    enabled: true,
    attempted: true,
    applied: true,
    reason: "reused"
  }
});

assert.ok(runtimeFrontRebuild);
assert.equal(runtimeFrontRebuild?.strategy, "full_pack_rebuild");
assert.ok(runtimeFrontRebuild?.triggers.includes("runtime_degraded_views"));
assert.deepEqual(runtimeFrontRebuild?.targetViews, ["front", "threeQuarter", "profile"]);

const rigReviewReroute = decideAutoReroute({
  config: defaultConfig,
  generationViewToGenerate: undefined,
  providerName: "comfyui",
  requestedViews: ["front", "threeQuarter", "profile"],
  packCoherence: undefined,
  rigStability: {
    severity: "review",
    summary: "review:profile landmark drift",
    reasonCodes: ["rig-landmark-review:profile"],
    fallbackReasonCodes: ["review_only", "suppress_aggressive_yaw", "manual_compare"],
    warningViews: ["profile"],
    blockingViews: [],
    reviewOnly: true,
    safeFrontExpression: false,
    suppressAggressiveYaw: true,
    lockMouthPreset: false,
    anchorConfidenceOverall: 0.64,
    anchorConfidenceByView: {
      front: 0.73,
      threeQuarter: 0.66,
      profile: 0.57
    },
    landmarkConsistencyByView: {
      profile: 0.45
    },
    suggestedAction: "pick-manually"
  },
  missingGeneratedViews: [],
  lowQualityGeneratedViews: [],
  frontStrong: true,
  continuity: {
    enabled: true,
    attempted: true,
    applied: true,
    reason: "reused"
  }
});

assert.ok(rigReviewReroute);
assert.equal(rigReviewReroute?.strategy, "targeted_view_retry");
assert.ok(rigReviewReroute?.triggers.includes("rig_instability_review"));
assert.deepEqual(rigReviewReroute?.targetViews, ["profile"]);

const reviewRisk = assessAutoSelectionRisk({
  selectedByView: {
    front: makeCandidate("front"),
    threeQuarter: makeCandidate("threeQuarter", {
      consistencyScore: 0.47,
      warnings: ["consistency_style_drift"]
    }),
    profile: makeCandidate("profile")
  },
  packCoherence: {
    issues: ["threeQuarter_style_drift"],
    severity: "review",
    score: 0.79,
    blockingViews: [],
    warningViews: ["threeQuarter"],
    metrics: {
      frontAnchorScore: 0.78,
      frontStyleScore: 0.57,
      frontSpeciesScore: 0.51,
      threeQuarterConsistency: 0.47,
      profileConsistency: 0.58,
      speciesSpread: 0.08,
      styleSpread: 0.09,
      headRatioSpread: 0.05,
      monochromeSpread: 0.03
    }
  },
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58
});

assert.equal(reviewRisk.level, "review");
assert.equal(reviewRisk.suggestedAction, "pick-manually");
assert.ok(reviewRisk.reasonCodes.includes("three_quarter_consistency_soft"));

const blockedRisk = assessAutoSelectionRisk({
  selectedByView: {
    front: makeCandidate("front", {
      score: 0.61,
      frontSymmetryScore: 0.45,
      headSquarenessScore: 0.21,
      speciesScore: 0.29,
      targetStyleScore: 0.43,
      warnings: ["front_style_floor_low"]
    }),
    threeQuarter: makeCandidate("threeQuarter", {
      consistencyScore: 0.44,
      warnings: ["consistency_shape_drift", "consistency_style_drift"]
    }),
    profile: makeCandidate("profile", {
      consistencyScore: 0.43,
      warnings: ["consistency_style_drift"]
    })
  },
  packCoherence: {
    issues: ["front_master_not_strong_enough", "profile_style_drift"],
    severity: "review",
    score: 0.71,
    blockingViews: [],
    warningViews: ["front", "profile"],
    metrics: {
      frontAnchorScore: 0.63,
      frontStyleScore: 0.43,
      frontSpeciesScore: 0.31,
      threeQuarterConsistency: 0.44,
      profileConsistency: 0.43,
      speciesSpread: 0.11,
      styleSpread: 0.14,
      headRatioSpread: 0.08,
      monochromeSpread: 0.05
    }
  },
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58,
  autoReroute: {
    attempted: true,
    recovered: false,
    triggers: ["pack_coherence_block"],
    targetViews: ["front", "threeQuarter", "profile"],
    notes: ["front anchor remained weak after rescue"],
    initialMissingViews: [],
    initialLowQualityViews: []
  }
});

assert.equal(blockedRisk.level, "block");
assert.equal(blockedRisk.suggestedAction, "recreate");
assert.ok(blockedRisk.reasonCodes.includes("auto_reroute_failed"));
assert.ok(blockedRisk.reasonCodes.includes("front_anchor_soft"));

const runtimeBlockedRisk = assessAutoSelectionRisk({
  selectedByView: {
    front: makeCandidate("front", {
      rejections: ["runtime_preflight_failed"],
      warnings: ["runtime_adapter_warning_present"]
    }),
    threeQuarter: makeCandidate("threeQuarter", {
      consistencyScore: 0.53,
      warnings: ["runtime_fallback_used"]
    }),
    profile: makeCandidate("profile", {
      consistencyScore: 0.5,
      warnings: ["runtime_route_degraded"]
    })
  },
  packCoherence: {
    issues: ["profile_style_drift"],
    severity: "review",
    score: 0.76,
    blockingViews: [],
    warningViews: ["front", "profile"],
    metrics: {
      frontAnchorScore: 0.77,
      frontStyleScore: 0.56,
      frontSpeciesScore: 0.51,
      threeQuarterConsistency: 0.53,
      profileConsistency: 0.5,
      speciesSpread: 0.08,
      styleSpread: 0.09,
      headRatioSpread: 0.05,
      monochromeSpread: 0.03
    }
  },
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58
});

assert.equal(runtimeBlockedRisk.level, "block");
assert.equal(runtimeBlockedRisk.suggestedAction, "recreate");
assert.ok(runtimeBlockedRisk.reasonCodes.includes("runtime_quality_compounded"));
assert.ok(runtimeBlockedRisk.reasonCodes.includes("runtime_fallback_selected"));

const rigBlockedRisk = assessAutoSelectionRisk({
  selectedByView: {
    front: makeCandidate("front", {
      score: 0.64,
      frontSymmetryScore: 0.49,
      headSquarenessScore: 0.2,
      speciesScore: 0.33,
      targetStyleScore: 0.45
    }),
    threeQuarter: makeCandidate("threeQuarter", {
      consistencyScore: 0.46
    }),
    profile: makeCandidate("profile", {
      consistencyScore: 0.44
    })
  },
  packCoherence: {
    issues: ["profile_consistency_floor_low"],
    severity: "review",
    score: 0.74,
    blockingViews: [],
    warningViews: ["profile"],
    metrics: {
      frontAnchorScore: 0.68,
      frontStyleScore: 0.45,
      frontSpeciesScore: 0.34,
      threeQuarterConsistency: 0.46,
      profileConsistency: 0.44,
      speciesSpread: 0.08,
      styleSpread: 0.08,
      headRatioSpread: 0.05,
      monochromeSpread: 0.03
    }
  },
  rigStability: {
    severity: "block",
    summary: "block:front anchor and side landmarks unstable",
    reasonCodes: ["rig-anchor-block:front", "rig-landmark-block:profile"],
    fallbackReasonCodes: ["review_only", "safe_front_expression", "lock_mouth_preset", "recreate"],
    warningViews: ["threeQuarter"],
    blockingViews: ["front", "profile"],
    reviewOnly: true,
    safeFrontExpression: true,
    suppressAggressiveYaw: true,
    lockMouthPreset: true,
    anchorConfidenceOverall: 0.55,
    anchorConfidenceByView: {
      front: 0.49,
      threeQuarter: 0.61,
      profile: 0.54
    },
    landmarkConsistencyByView: {
      threeQuarter: 0.46,
      profile: 0.41
    },
    suggestedAction: "recreate"
  },
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58
});

assert.equal(rigBlockedRisk.level, "block");
assert.equal(rigBlockedRisk.suggestedAction, "recreate");
assert.ok(rigBlockedRisk.reasonCodes.includes("rig_review_only"));
assert.ok(rigBlockedRisk.reasonCodes.includes("rig_anchor_confidence_soft"));
assert.ok(rigBlockedRisk.reasonCodes.includes("rig_landmark_consistency_soft"));

const reviewEmbargo = assessQualityEmbargo({
  selectedByView: {
    front: makeCandidate("front"),
    threeQuarter: makeCandidate("threeQuarter"),
    profile: makeCandidate("profile", {
      warnings: ["consistency_style_drift", "paw_shape_cleanup_needed"],
      consistencyScore: 0.5
    })
  },
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58,
  autoReroute: {
    attempted: true,
    recovered: true,
    triggers: ["pack_coherence_review"],
    targetViews: ["profile"],
    notes: ["profile drift improved but still soft"],
    initialMissingViews: [],
    initialLowQualityViews: []
  }
});

assert.equal(reviewEmbargo.level, "review");
assert.equal(reviewEmbargo.suggestedAction, "pick-manually");
assert.ok(reviewEmbargo.warningViews?.includes("profile"));
assert.ok(reviewEmbargo.defectFamiliesByView?.profile?.includes("style"));

const blockedEmbargo = assessQualityEmbargo({
  selectedByView: {
    front: makeCandidate("front", {
      score: 0.57,
      warnings: ["mascot_identity_too_weak", "fragmented_or_multi_object_front"],
      rejections: ["subject_isolation_low"]
    }),
    threeQuarter: makeCandidate("threeQuarter", {
      warnings: ["consistency_shape_drift"]
    }),
    profile: makeCandidate("profile")
  },
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58,
  autoReroute: {
    attempted: true,
    recovered: false,
    triggers: ["pack_coherence_block"],
    targetViews: ["front", "threeQuarter", "profile"],
    notes: ["front anchor remained weak after reroute"],
    initialMissingViews: [],
    initialLowQualityViews: ["front"]
  }
});

assert.equal(blockedEmbargo.level, "block");
assert.equal(blockedEmbargo.suggestedAction, "recreate");
assert.ok(blockedEmbargo.blockingViews?.includes("front"));
assert.ok(blockedEmbargo.reasonCodes.includes("front_identity_embargo"));

const runtimeBlockedEmbargo = assessQualityEmbargo({
  selectedByView: {
    front: makeCandidate("front", {
      rejections: ["runtime_structure_missing"],
      warnings: ["runtime_fallback_used"],
      providerMeta: {
        workflowStage: "repair_refine",
        routeDecision: {
          selectedMode: "checkpoint-ultra-repair",
          fallbackUsed: true
        },
        preflightDiagnostics: {
          ok: false,
          warnings: ["route_soft"]
        },
        structureControlDiagnostics: {
          requiredKinds: ["lineart", "canny"],
          appliedKinds: ["lineart"],
          missingRequiredKinds: ["canny"]
        }
      }
    }),
    threeQuarter: makeCandidate("threeQuarter", {
      warnings: ["runtime_route_degraded"],
      providerMeta: {
        workflowStage: "identity_lock_refine",
        routeDecision: {
          selectedMode: "checkpoint",
          fallbackUsed: true
        },
        preflightDiagnostics: {
          ok: true,
          warnings: ["route_soft"]
        },
        structureControlDiagnostics: {
          requiredKinds: ["lineart"],
          appliedKinds: ["lineart"],
          missingRequiredKinds: []
        }
      }
    }),
    profile: makeCandidate("profile")
  },
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58,
  autoReroute: {
    attempted: true,
    recovered: false,
    triggers: ["pack_coherence_block"],
    targetViews: ["front", "threeQuarter", "profile"],
    notes: ["runtime degraded after reroute"],
    initialMissingViews: [],
    initialLowQualityViews: ["front"]
  }
});

assert.equal(runtimeBlockedEmbargo.level, "block");
assert.equal(runtimeBlockedEmbargo.suggestedAction, "recreate");
assert.ok(runtimeBlockedEmbargo.blockingViews?.includes("front"));
assert.ok(runtimeBlockedEmbargo.reasonCodes.includes("runtime-hard:front"));
assert.ok(runtimeBlockedEmbargo.reasonCodes.includes("front_runtime_embargo"));
assert.ok(runtimeBlockedEmbargo.reasonCodes.includes("runtime_repair_structure_embargo"));
assert.ok(runtimeBlockedEmbargo.reasonCodes.includes("runtime_lock_structure_embargo"));

const runtimeCleanCandidate = makeCandidate("front", {
  providerMeta: {
    workflowStage: "front_master",
    routeDecision: {
      selectedMode: "checkpoint-ultra",
      fallbackUsed: false
    },
    preflightDiagnostics: {
      ok: true,
      warnings: []
    },
    structureControlDiagnostics: {
      requiredKinds: [],
      appliedKinds: [],
      missingRequiredKinds: []
    }
  }
});

assert.equal(
  classifyCandidateRuntimeBucket({
    candidate: runtimeCleanCandidate,
    targetStyle: "mascot"
  }).level,
  "clean"
);
assert.equal(
  isRuntimeBucketLowQuality({
    candidate: runtimeCleanCandidate,
    targetStyle: "mascot",
    acceptedScoreThreshold: 0.58
  }),
  false
);

const runtimeCompoundCandidate = makeCandidate("front", {
  providerMeta: {
    workflowStage: "identity_lock_refine",
    routeDecision: {
      selectedMode: "checkpoint",
      fallbackUsed: true
    },
    preflightDiagnostics: {
      ok: true,
      warnings: ["route_soft"]
    },
    structureControlDiagnostics: {
      requiredKinds: ["lineart", "canny"],
      appliedKinds: ["lineart", "canny"],
      missingRequiredKinds: []
    }
  }
});

assert.equal(
  classifyCandidateRuntimeBucket({
    candidate: runtimeCompoundCandidate,
    targetStyle: "mascot"
  }).level,
  "compound"
);
assert.equal(
  isRuntimeBucketLowQuality({
    candidate: runtimeCompoundCandidate,
    targetStyle: "mascot",
    acceptedScoreThreshold: 0.58
  }),
  true
);

const selectedRepairThreeQuarterEmbargo = assessQualityEmbargo({
  selectedByView: {
    front: makeCandidate("front"),
    threeQuarter: {
      candidate: {
        id: "selected_like_threequarter",
        view: "threeQuarter",
        providerMeta: {
          workflowStage: "repair_refine"
        }
      },
      analysis: {},
      score: 0.7243,
      styleScore: 1,
      referenceSimilarity: null,
      consistencyScore: 0.7555,
      warnings: [
        "text_or_watermark_suspected",
        "text_or_watermark_high_risk",
        "palette_too_complex_for_mascot",
        "species_readability_low"
      ],
      rejections: ["threequarter_front_collapse"],
      breakdown: {
        alphaScore: 0.7725,
        occupancyScore: 0.5493,
        qualityScore: 0.548,
        referenceScore: 0.8379,
        styleScore: 1
      }
    } as any,
    profile: makeCandidate("profile")
  },
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58,
  speciesId: "cat",
  autoReroute: {
    attempted: true,
    recovered: true,
    triggers: ["pack_coherence_review"],
    targetViews: ["threeQuarter"],
    notes: ["selected three-quarter repair candidate remains soft but viable"],
    initialMissingViews: [],
    initialLowQualityViews: []
  }
});

assert.equal(selectedRepairThreeQuarterEmbargo.level, "review");
assert.ok(selectedRepairThreeQuarterEmbargo.warningViews?.includes("threeQuarter"));
assert.ok(!selectedRepairThreeQuarterEmbargo.blockingViews?.includes("threeQuarter"));

console.log("[characterGenerationAutoReroute.smoke] PASS");
process.exit(0);
