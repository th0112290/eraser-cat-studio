import assert from "node:assert/strict";
import { buildRepairTriageGate } from "./characterGeneration";

type CharacterView = "front" | "threeQuarter" | "profile";

function makeCandidate(
  view: CharacterView,
  workflowStage: string,
  overrides: {
    id?: string;
    score?: number;
    consistencyScore?: number | null;
    warnings?: string[];
    rejections?: string[];
    frontSymmetryScore?: number;
    headSquarenessScore?: number;
    speciesScore?: number;
    speciesEarScore?: number;
    speciesMuzzleScore?: number;
    speciesHeadShapeScore?: number;
    speciesSilhouetteScore?: number;
    targetStyleScore?: number;
    providerMeta?: Record<string, unknown>;
    subjectFillRatio?: number;
    subjectIsolationScore?: number;
    largestComponentShare?: number;
    significantComponentCount?: number;
    handRegionDensityScore?: number;
  } = {}
): any {
  const defaultProviderMeta =
    workflowStage === "front_master"
      ? {
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
      : {
          routeDecision: {
            selectedMode: workflowStage === "repair_refine" ? "checkpoint-ultra-repair" : "checkpoint-ultra-pose",
            fallbackUsed: false
          },
          preflightDiagnostics: {
            ok: true,
            warnings: []
          },
          structureControlDiagnostics: {
            requiredKinds: ["lineart", "canny"],
            appliedKinds: ["lineart", "canny"],
            missingRequiredKinds: []
          }
        };
  return {
    candidate: {
      id: overrides.id ?? `${workflowStage}_${view}`,
      view,
      providerMeta: {
        workflowStage,
        ...defaultProviderMeta,
        ...(overrides.providerMeta ?? {})
      }
    },
    analysis: {},
    score: overrides.score ?? 0.78,
    styleScore: overrides.targetStyleScore ?? 0.66,
    referenceSimilarity: null,
    consistencyScore: overrides.consistencyScore ?? (view === "front" ? null : 0.66),
    warnings: overrides.warnings ?? [],
    rejections: overrides.rejections ?? [],
    breakdown: {
      frontSymmetryScore: overrides.frontSymmetryScore ?? 0.78,
      headSquarenessScore: overrides.headSquarenessScore ?? 0.62,
      speciesScore: overrides.speciesScore ?? 0.66,
      speciesEarScore: overrides.speciesEarScore ?? 0.54,
      speciesMuzzleScore: overrides.speciesMuzzleScore ?? 0.62,
      speciesHeadShapeScore: overrides.speciesHeadShapeScore ?? 0.58,
      speciesSilhouetteScore: overrides.speciesSilhouetteScore ?? 0.64,
      targetStyleScore: overrides.targetStyleScore ?? 0.7,
      subjectFillRatio: overrides.subjectFillRatio ?? 0.14,
      subjectIsolationScore: overrides.subjectIsolationScore ?? 0.5,
      largestComponentShare: overrides.largestComponentShare ?? 0.28,
      significantComponentCount: overrides.significantComponentCount ?? 4,
      handRegionDensityScore: overrides.handRegionDensityScore ?? 0.5
    }
  };
}

const acceptWithoutRepair = buildRepairTriageGate({
  targetViews: ["front"],
  candidateByView: {
    front: makeCandidate("front", "front_master", {
      id: "front_accept",
      score: 0.79,
      consistencyScore: null
    })
  },
  acceptedScoreThreshold: 0.58,
  repairScoreFloor: 0.42,
  frontAnchorAcceptedScoreThreshold: 0.64,
  targetStyle: "eraser cat mascot"
});

assert.deepEqual(acceptWithoutRepair.repairViews, []);
assert.equal(acceptWithoutRepair.repairTriageByView.front?.decision, "skip_repair");

const repairConsistency = buildRepairTriageGate({
  targetViews: ["profile"],
  candidateByView: {
    profile: makeCandidate("profile", "side_view_refine", {
      id: "profile_consistency_repair",
      score: 0.63,
      consistencyScore: 0.31,
      warnings: ["consistency_shape_drift"]
    })
  },
  gateDecisionsByView: {
    profile: {
      decision: "promote_refine",
      chosenCandidateId: "profile_consistency_repair",
      chosenStage: "side_view_refine",
      reasons: ["refine:better_by_rank"]
    }
  },
  acceptedScoreThreshold: 0.58,
  repairScoreFloor: 0.42,
  frontAnchorAcceptedScoreThreshold: 0.64,
  targetStyle: "eraser cat mascot"
});

assert.deepEqual(repairConsistency.repairViews, ["profile"]);
assert.equal(repairConsistency.repairTriageByView.profile?.decision, "targeted_repair");

const embargoUnrecoverable = buildRepairTriageGate({
  targetViews: ["front"],
  candidateByView: {
    front: makeCandidate("front", "front_master", {
      id: "front_unrecoverable",
      score: 0.55,
      consistencyScore: null,
      rejections: ["mascot_identity_too_weak"]
    })
  },
  acceptedScoreThreshold: 0.58,
  repairScoreFloor: 0.42,
  frontAnchorAcceptedScoreThreshold: 0.64,
  targetStyle: "eraser cat mascot"
});

assert.deepEqual(embargoUnrecoverable.blockedViews, ["front"]);
assert.equal(embargoUnrecoverable.repairTriageByView.front?.decision, "reject_view");

const embargoBelowFloor = buildRepairTriageGate({
  targetViews: ["profile"],
  candidateByView: {
    profile: makeCandidate("profile", "side_view_base", {
      id: "profile_too_weak",
      score: 0.33,
      consistencyScore: 0.29,
      rejections: ["subject_isolation_low"]
    })
  },
  gateDecisionsByView: {
    profile: {
      decision: "keep_base",
      chosenCandidateId: "profile_too_weak",
      chosenStage: "side_view_base",
      reasons: ["accepted_current"]
    }
  },
  acceptedScoreThreshold: 0.58,
  repairScoreFloor: 0.42,
  frontAnchorAcceptedScoreThreshold: 0.64,
  targetStyle: "eraser cat mascot"
});

assert.deepEqual(embargoBelowFloor.blockedViews, ["profile"]);
assert.equal(embargoBelowFloor.repairTriageByView.profile?.decision, "reject_view");

const runtimeSoftEscalatesRepair = buildRepairTriageGate({
  targetViews: ["profile"],
  candidateByView: {
    profile: makeCandidate("profile", "identity_lock_refine", {
      id: "profile_runtime_soft",
      score: 0.81,
      consistencyScore: 0.68,
      warnings: ["runtime_fallback_used"],
      providerMeta: {
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
    })
  },
  gateDecisionsByView: {
    profile: {
      decision: "hold_lock",
      chosenCandidateId: "profile_runtime_soft",
      chosenStage: "identity_lock_refine",
      reasons: ["lock_rejected:runtime_fallback_regressed"]
    }
  },
  acceptedScoreThreshold: 0.58,
  repairScoreFloor: 0.42,
  frontAnchorAcceptedScoreThreshold: 0.64,
  targetStyle: "eraser cat mascot"
});

assert.deepEqual(runtimeSoftEscalatesRepair.repairViews, ["profile"]);
assert.equal(runtimeSoftEscalatesRepair.repairTriageByView.profile?.decision, "full_repair");
assert.ok(runtimeSoftEscalatesRepair.repairTriageByView.profile?.reasonCodes.includes("gate_runtime_regressed"));
assert.ok(runtimeSoftEscalatesRepair.repairTriageByView.profile?.reasonCodes.includes("runtime_route_soft"));

const runtimeHardRejectsView = buildRepairTriageGate({
  targetViews: ["front"],
  candidateByView: {
    front: makeCandidate("front", "front_master", {
      id: "front_runtime_hard",
      score: 0.77,
      consistencyScore: null,
      rejections: ["runtime_structure_missing"],
      providerMeta: {
        preflightDiagnostics: {
          ok: false,
          warnings: ["structure_missing"]
        },
        structureControlDiagnostics: {
          requiredKinds: ["lineart"],
          appliedKinds: [],
          missingRequiredKinds: ["lineart"]
        }
      }
    })
  },
  acceptedScoreThreshold: 0.58,
  repairScoreFloor: 0.42,
  frontAnchorAcceptedScoreThreshold: 0.64,
  targetStyle: "eraser cat mascot"
});

assert.deepEqual(runtimeHardRejectsView.blockedViews, ["front"]);
assert.equal(runtimeHardRejectsView.repairTriageByView.front?.decision, "reject_view");
assert.ok(runtimeHardRejectsView.repairTriageByView.front?.reasonCodes.includes("runtime_contract_reject"));

const localizeSpreadOnlyRepair = buildRepairTriageGate({
  targetViews: ["front", "threeQuarter", "profile"],
  candidateByView: {
    front: makeCandidate("front", "front_master", {
      id: "front_strong_anchor",
      score: 0.87,
      consistencyScore: null,
      frontSymmetryScore: 0.995,
      headSquarenessScore: 0.61,
      speciesScore: 0.69,
      speciesEarScore: 0.6,
      speciesMuzzleScore: 0.78,
      speciesHeadShapeScore: 0.64,
      speciesSilhouetteScore: 0.76,
      targetStyleScore: 0.81,
      subjectFillRatio: 0.16,
      subjectIsolationScore: 0.61,
      largestComponentShare: 0.31,
      significantComponentCount: 3,
      handRegionDensityScore: 0.53
    }),
    threeQuarter: makeCandidate("threeQuarter", "identity_lock_refine", {
      id: "threequarter_weak_spread",
      score: 0.76,
      consistencyScore: 0.53,
      warnings: ["consistency_shape_drift"],
      speciesScore: 0.45,
      speciesEarScore: 0.08,
      speciesMuzzleScore: 0.12,
      speciesHeadShapeScore: 0.16,
      speciesSilhouetteScore: 0.14,
      targetStyleScore: 0.63
    }),
    profile: makeCandidate("profile", "identity_lock_refine", {
      id: "profile_strong_side",
      score: 0.84,
      consistencyScore: 0.68,
      speciesScore: 0.67,
      speciesEarScore: 0.58,
      speciesMuzzleScore: 0.56,
      speciesHeadShapeScore: 0.57,
      speciesSilhouetteScore: 0.59,
      targetStyleScore: 0.79
    })
  },
  gateDecisionsByView: {
    threeQuarter: {
      decision: "promote_lock",
      chosenCandidateId: "threequarter_weak_spread",
      chosenStage: "identity_lock_refine",
      reasons: ["lock:kept_after_identity_lock"]
    },
    profile: {
      decision: "promote_lock",
      chosenCandidateId: "profile_strong_side",
      chosenStage: "identity_lock_refine",
      reasons: ["lock:kept_after_identity_lock"]
    }
  },
  acceptedScoreThreshold: 0.58,
  repairScoreFloor: 0.42,
  frontAnchorAcceptedScoreThreshold: 0.64,
  targetStyle: "eraser cat mascot",
  speciesId: "cat",
  packCoherence: {
    issues: [
      "threeQuarter_geometry_floor_low",
      "threeQuarter_shape_drift",
      "species_score_spread_too_wide",
      "style_score_spread_too_wide",
      "muzzle_cue_spread_too_wide",
      "head_shape_cue_spread_too_wide",
      "silhouette_cue_spread_too_wide"
    ],
    severity: "block",
    score: 0.46,
    blockingViews: ["front", "threeQuarter", "profile"],
    warningViews: [],
    metrics: {
      frontAnchorScore: 0.84,
      frontSymmetryScore: 0.995,
      frontHeadSquarenessScore: 0.61,
      frontStyleScore: 0.81,
      frontSpeciesScore: 0.69,
      threeQuarterGeometryCue: 0.125,
      profileGeometryCue: 0.575,
      threeQuarterConsistency: 0.53,
      profileConsistency: 0.68,
      speciesSpread: 0.24,
      styleSpread: 0.18,
      headRatioSpread: 0.05,
      monochromeSpread: 0.22,
      earCueSpread: 0.12,
      muzzleCueSpread: 0.66,
      headShapeCueSpread: 0.48,
      silhouetteCueSpread: 0.62
    }
  }
});

assert.deepEqual(localizeSpreadOnlyRepair.repairViews, ["threeQuarter"]);
assert.equal(localizeSpreadOnlyRepair.repairTriageByView.front?.decision, "skip_repair");
assert.equal(localizeSpreadOnlyRepair.repairTriageByView.profile?.decision, "skip_repair");
assert.equal(localizeSpreadOnlyRepair.repairTriageByView.threeQuarter?.decision, "targeted_repair");
assert.ok(
  (localizeSpreadOnlyRepair.repairTriageByView.threeQuarter?.reasonCodes ?? []).some((reason) =>
    ["pack_coherence_signal", "rig_instability_block"].includes(reason)
  )
);

console.log("[characterGenerationRepairTriageGate.smoke] PASS");
process.exit(0);
