import assert from "node:assert/strict";
import {
  assessAutoSelectionRisk,
  assessFinalQualityFirewall,
  assessQualityEmbargo,
  assessRigStability,
  buildPackCoherenceDiagnostics,
  buildPackDefectSummary
} from "./characterGeneration";

type CharacterView = "front" | "threeQuarter" | "profile";

function makeCandidate(
  view: CharacterView,
  overrides: {
    candidateId?: string;
    score?: number;
    consistencyScore?: number | null;
    warnings?: string[];
    rejections?: string[];
    breakdown?: Record<string, unknown>;
    providerMeta?: Record<string, unknown>;
  } = {}
): any {
  return {
    candidate: {
      id: overrides.candidateId ?? `${view}_candidate`,
      view,
      ...(overrides.providerMeta ? { providerMeta: overrides.providerMeta } : {})
    },
    analysis: {},
    score: overrides.score ?? 0.82,
    styleScore: 1,
    referenceSimilarity: null,
    consistencyScore: overrides.consistencyScore ?? (view === "front" ? null : 0.72),
    warnings: overrides.warnings ?? [],
    rejections: overrides.rejections ?? [],
    breakdown: {
      styleScore: 1,
      qualityScore: 0.64,
      referenceScore: 0.7,
      alphaScore: 0.9,
      occupancyScore: 0.72,
      ...(overrides.breakdown ?? {})
    }
  };
}

function verifySpecies(speciesId: "dog" | "wolf", selectedByView: Record<CharacterView, any>) {
  const packCoherence = buildPackCoherenceDiagnostics({
    selectedByView,
    targetStyle: "compact mascot",
    acceptedScoreThreshold: 0.58,
    speciesId
  });
  const rigStability = assessRigStability({
    selectedByView,
    packCoherence,
    targetStyle: "compact mascot",
    speciesId
  });
  const selectionRisk = assessAutoSelectionRisk({
    selectedByView,
    packCoherence,
    rigStability,
    targetStyle: "compact mascot",
    acceptedScoreThreshold: 0.58,
    speciesId
  });
  const packDefectSummary = buildPackDefectSummary({
    selectedByView,
    speciesId
  });
  const embargo = assessQualityEmbargo({
    selectedByView,
    rigStability,
    targetStyle: "compact mascot",
    acceptedScoreThreshold: 0.58,
    speciesId
  });
  const firewall = assessFinalQualityFirewall({
    selectedByView,
    targetStyle: "compact mascot",
    acceptedScoreThreshold: 0.58,
    speciesId,
    packCoherence,
    rigStability,
    selectionRisk,
    qualityEmbargo: embargo,
    packDefectSummary
  });

  assert.ok((packCoherence.metrics.frontAnchorScore ?? 0) >= 0.7, `${speciesId} front anchor should be rescued above soft floor`);
  assert.ok(!packCoherence.issues.includes("front_master_not_strong_enough"), `${speciesId} front should no longer fail front master strength`);
  assert.notEqual(rigStability.severity, "block", `${speciesId} rig stability should not hard-block on rescued front`);
  assert.ok(!rigStability.blockingViews.includes("front"), `${speciesId} front should not remain a rig blocking view`);
  assert.ok(!packDefectSummary.blockingFamilies.includes("head"), `${speciesId} repeated soft head warnings should not remain blocking`);
  assert.notEqual(embargo.level, "block", `${speciesId} embargo should be review-or-clear after canine rescue`);
  assert.ok(!embargo.reasonCodes.includes("rig_front_anchor_embargo"), `${speciesId} embargo should not report front anchor embargo`);
  assert.notEqual(firewall.level, "block", `${speciesId} firewall should be review-or-clear after canine rescue`);
  assert.ok(!firewall.reasonCodes.includes("rig-firewall:front"), `${speciesId} firewall should not report rig-firewall:front`);
  assert.ok(!firewall.reasonCodes.includes("repeated-critical:head"), `${speciesId} firewall should not report repeated-critical:head`);
}

verifySpecies("dog", {
  front: makeCandidate("front", {
    candidateId: "dog_front_sparse_selected",
    score: 0.9542,
    consistencyScore: 1,
    warnings: ["text_or_watermark_suspected", "head_shape_not_square_enough", "dog_front_arm_zone_weak"],
    breakdown: {
      qualityScore: 0.6219,
      referenceScore: 0.7075,
      alphaScore: 0.4583,
      occupancyScore: 0.5301
    },
    providerMeta: {
      workflowStage: "front_master"
    }
  }),
  threeQuarter: makeCandidate("threeQuarter", {
    candidateId: "dog_three_quarter_selected",
    score: 0.78,
    consistencyScore: 0.69,
    warnings: ["text_or_watermark_suspected", "threequarter_frontality_risk", "paw_symmetry_low", "consistency_shape_drift"],
    breakdown: {
      styleScore: 0.94,
      targetStyleScore: 0.94,
      qualityScore: 0.66,
      referenceScore: 0.8,
      alphaScore: 0.88,
      occupancyScore: 0.72,
      speciesEarScore: 0.62,
      speciesMuzzleScore: 0.76,
      speciesHeadShapeScore: 0.64,
      speciesSilhouetteScore: 0.72
    },
    providerMeta: {
      workflowStage: "identity_lock_refine"
    }
  }),
  profile: makeCandidate("profile", {
    candidateId: "dog_profile_selected",
    score: 0.76,
    consistencyScore: 0.64,
    warnings: [
      "text_or_watermark_suspected",
      "bbox_occupancy_outlier",
      "palette_too_complex_for_mascot",
      "head_shape_not_square_enough",
      "paw_shape_unstable",
      "finger_spikes_detected",
      "paw_readability_low",
      "consistency_style_drift"
    ],
    breakdown: {
      styleScore: 0.92,
      targetStyleScore: 0.92,
      qualityScore: 0.62,
      referenceScore: 0.72,
      alphaScore: 0.84,
      occupancyScore: 0.7,
      speciesEarScore: 0.54,
      speciesMuzzleScore: 0.74,
      speciesHeadShapeScore: 0.6,
      speciesSilhouetteScore: 0.69
    },
    providerMeta: {
      workflowStage: "repair_refine"
    }
  })
});

verifySpecies("wolf", {
  front: makeCandidate("front", {
    candidateId: "wolf_front_sparse_selected",
    score: 0.9792,
    consistencyScore: 1,
    warnings: ["text_or_watermark_suspected", "palette_too_complex_for_mascot"],
    breakdown: {
      qualityScore: 0.7203,
      referenceScore: 0.6847,
      alphaScore: 0.9503,
      occupancyScore: 0.9946
    },
    providerMeta: {
      workflowStage: "repair_refine"
    }
  }),
  threeQuarter: makeCandidate("threeQuarter", {
    candidateId: "wolf_three_quarter_selected",
    score: 0.8,
    consistencyScore: 0.785,
    warnings: ["text_or_watermark_suspected", "threequarter_frontality_risk", "paw_symmetry_low", "wolf_muzzle_too_short"],
    breakdown: {
      styleScore: 0.95,
      targetStyleScore: 0.95,
      qualityScore: 0.69,
      referenceScore: 0.84,
      alphaScore: 0.9,
      occupancyScore: 0.78,
      speciesEarScore: 0.66,
      speciesMuzzleScore: 0.71,
      speciesHeadShapeScore: 0.68,
      speciesSilhouetteScore: 0.74
    },
    providerMeta: {
      workflowStage: "repair_refine"
    }
  }),
  profile: makeCandidate("profile", {
    candidateId: "wolf_profile_selected",
    score: 0.82,
    consistencyScore: 0.8,
    warnings: ["text_or_watermark_suspected", "wolf_muzzle_too_short"],
    breakdown: {
      styleScore: 0.94,
      targetStyleScore: 0.94,
      qualityScore: 0.68,
      referenceScore: 0.78,
      alphaScore: 0.89,
      occupancyScore: 0.76,
      speciesEarScore: 0.62,
      speciesMuzzleScore: 0.7,
      speciesHeadShapeScore: 0.66,
      speciesSilhouetteScore: 0.72
    },
    providerMeta: {
      workflowStage: "repair_refine"
    }
  })
});

console.log("[characterGenerationCanineHitlReview.smoke] PASS");
process.exit(0);
