import assert from "node:assert/strict";
import { buildPostRepairAcceptanceGate } from "./characterGeneration";

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
    targetStyleScore?: number;
    providerMeta?: Record<string, unknown>;
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
    styleScore: overrides.targetStyleScore ?? 0.64,
    referenceSimilarity: null,
    consistencyScore: overrides.consistencyScore ?? (view === "front" ? null : 0.66),
    warnings: overrides.warnings ?? [],
    rejections: overrides.rejections ?? [],
    breakdown: {
      frontSymmetryScore: overrides.frontSymmetryScore ?? 0.76,
      headSquarenessScore: overrides.headSquarenessScore ?? 0.43,
      speciesScore: overrides.speciesScore ?? 0.56,
      targetStyleScore: overrides.targetStyleScore ?? 0.66
    }
  };
}

const promoteRepair = buildPostRepairAcceptanceGate({
  targetViews: ["profile"],
  preRepairByView: {
    profile: makeCandidate("profile", "identity_lock_refine", {
      id: "pre_profile",
      score: 0.63,
      consistencyScore: 0.47,
      warnings: ["consistency_style_drift"]
    })
  },
  repairByView: {
    profile: makeCandidate("profile", "repair_refine", {
      id: "repair_profile",
      score: 0.69,
      consistencyScore: 0.58,
      warnings: []
    })
  },
  acceptedScoreThreshold: 0.58,
  promotionThresholdByView: { profile: 0.61 },
  targetStyle: "mascot"
});

assert.equal(promoteRepair.selectedByView.profile?.candidate.id, "repair_profile");
assert.equal(promoteRepair.repairAcceptanceByView.profile?.decision, "promote_repair");
assert.equal(promoteRepair.repairAcceptanceByView.profile?.chosenStage, "repair_refine");
assert.equal(promoteRepair.repairAcceptanceByView.profile?.scoreDeltaVsPreRepair, 0.06);
assert.equal(promoteRepair.repairAcceptanceByView.profile?.consistencyDeltaVsPreRepair, 0.11);
assert.ok(promoteRepair.repairAcceptanceByView.profile?.reasonCodes.includes("repair:better_by_rank"));
assert.ok(promoteRepair.repairAcceptanceByView.profile?.reasonCodes.includes("repair:clear_quality_gain"));

const rejectConsistencyRegression = buildPostRepairAcceptanceGate({
  targetViews: ["profile"],
  preRepairByView: {
    profile: makeCandidate("profile", "identity_lock_refine", {
      id: "pre_profile_consistent",
      score: 0.74,
      consistencyScore: 0.64,
      warnings: []
    })
  },
  repairByView: {
    profile: makeCandidate("profile", "repair_refine", {
      id: "repair_profile_regressed",
      score: 0.78,
      consistencyScore: 0.57,
      warnings: ["consistency_style_drift"]
    })
  },
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(rejectConsistencyRegression.selectedByView.profile?.candidate.id, "pre_profile_consistent");
assert.equal(rejectConsistencyRegression.repairAcceptanceByView.profile?.decision, "reject_repair");
assert.equal(rejectConsistencyRegression.repairAcceptanceByView.profile?.chosenStage, "identity_lock_refine");
assert.equal(rejectConsistencyRegression.repairAcceptanceByView.profile?.scoreDeltaVsPreRepair, 0);
assert.equal(rejectConsistencyRegression.repairAcceptanceByView.profile?.consistencyDeltaVsPreRepair, 0);
assert.ok(
  rejectConsistencyRegression.repairAcceptanceByView.profile?.reasonCodes.includes(
    "repair_rejected:consistency_regressed"
  )
);

const rejectRepairedRegression = buildPostRepairAcceptanceGate({
  targetViews: ["threeQuarter"],
  preRepairByView: {
    threeQuarter: makeCandidate("threeQuarter", "side_view_refine", {
      id: "pre_threequarter_clean",
      score: 0.75,
      consistencyScore: 0.63,
      warnings: []
    })
  },
  repairByView: {
    threeQuarter: makeCandidate("threeQuarter", "repair_refine", {
      id: "repair_threequarter_rejected",
      score: 0.81,
      consistencyScore: 0.66,
      warnings: [],
      rejections: ["subject_isolation_low"]
    })
  },
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(rejectRepairedRegression.selectedByView.threeQuarter?.candidate.id, "pre_threequarter_clean");
assert.equal(rejectRepairedRegression.repairAcceptanceByView.threeQuarter?.decision, "reject_repair");
assert.ok(
  rejectRepairedRegression.repairAcceptanceByView.threeQuarter?.reasonCodes.includes(
    "repair_rejected:more_rejections"
  )
);

const keepPreRepair = buildPostRepairAcceptanceGate({
  targetViews: ["profile"],
  preRepairByView: {
    profile: makeCandidate("profile", "identity_lock_refine", {
      id: "pre_profile_stable",
      score: 0.8,
      consistencyScore: 0.65,
      warnings: []
    })
  },
  repairByView: {
    profile: makeCandidate("profile", "repair_refine", {
      id: "repair_profile_small_gain",
      score: 0.808,
      consistencyScore: 0.66,
      warnings: []
    })
  },
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(keepPreRepair.selectedByView.profile?.candidate.id, "pre_profile_stable");
assert.equal(keepPreRepair.repairAcceptanceByView.profile?.decision, "keep_pre_repair");
assert.ok(keepPreRepair.repairAcceptanceByView.profile?.reasonCodes.includes("repair_not_promoted:better_by_rank"));
assert.ok(
  !keepPreRepair.repairAcceptanceByView.profile?.reasonCodes.includes("repair_not_promoted:clear_quality_gain")
);

const holdRepair = buildPostRepairAcceptanceGate({
  targetViews: ["front"],
  preRepairByView: {},
  repairByView: {
    front: makeCandidate("front", "repair_refine", {
      id: "repair_front_hold",
      score: 0.72,
      consistencyScore: null,
      warnings: []
    })
  },
  acceptedScoreThreshold: 0.58,
  promotionThresholdByView: { front: 0.64 },
  targetStyle: "mascot"
});

assert.equal(holdRepair.selectedByView.front?.candidate.id, "repair_front_hold");
assert.equal(holdRepair.repairAcceptanceByView.front?.decision, "hold_repair");
assert.deepEqual(holdRepair.repairAcceptanceByView.front?.reasonCodes, ["no_pre_repair_candidate"]);
assert.equal(holdRepair.repairAcceptanceByView.front?.preRepairCandidateId, undefined);

const missingRepair = buildPostRepairAcceptanceGate({
  targetViews: ["front"],
  preRepairByView: {
    front: makeCandidate("front", "front_master", {
      id: "pre_front_only",
      score: 0.73,
      consistencyScore: null
    })
  },
  repairByView: {},
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(missingRepair.selectedByView.front?.candidate.id, "pre_front_only");
assert.equal(missingRepair.repairAcceptanceByView.front?.decision, "missing_repair_candidate");
assert.deepEqual(missingRepair.repairAcceptanceByView.front?.reasonCodes, ["repair_candidate_missing"]);
assert.equal(missingRepair.repairAcceptanceByView.front?.chosenStage, "front_master");
assert.equal(missingRepair.repairAcceptanceByView.front?.repairCandidateId, undefined);

const mixedOutcomes = buildPostRepairAcceptanceGate({
  targetViews: ["profile", "threeQuarter", "front", "profile"],
  preRepairByView: {
    profile: makeCandidate("profile", "identity_lock_refine", {
      id: "mixed_pre_profile",
      score: 0.64,
      consistencyScore: 0.45,
      warnings: ["consistency_style_drift"]
    }),
    threeQuarter: makeCandidate("threeQuarter", "side_view_refine", {
      id: "mixed_pre_threequarter",
      score: 0.76,
      consistencyScore: 0.64
    }),
    front: makeCandidate("front", "front_master", {
      id: "mixed_pre_front",
      score: 0.75,
      consistencyScore: null
    })
  },
  repairByView: {
    profile: makeCandidate("profile", "repair_refine", {
      id: "mixed_repair_profile",
      score: 0.7,
      consistencyScore: 0.58
    }),
    threeQuarter: makeCandidate("threeQuarter", "repair_refine", {
      id: "mixed_repair_threequarter",
      score: 0.8,
      consistencyScore: 0.66,
      rejections: ["subject_isolation_low"]
    })
  },
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(mixedOutcomes.selectedByView.profile?.candidate.id, "mixed_repair_profile");
assert.equal(mixedOutcomes.repairAcceptanceByView.profile?.decision, "promote_repair");
assert.equal(mixedOutcomes.selectedByView.threeQuarter?.candidate.id, "mixed_pre_threequarter");
assert.equal(mixedOutcomes.repairAcceptanceByView.threeQuarter?.decision, "reject_repair");
assert.equal(mixedOutcomes.selectedByView.front?.candidate.id, "mixed_pre_front");
assert.equal(mixedOutcomes.repairAcceptanceByView.front?.decision, "missing_repair_candidate");

const rejectRuntimeRegressedRepair = buildPostRepairAcceptanceGate({
  targetViews: ["profile"],
  preRepairByView: {
    profile: makeCandidate("profile", "identity_lock_refine", {
      id: "pre_profile_runtime_stable",
      score: 0.74,
      consistencyScore: 0.63,
      warnings: [],
      providerMeta: {
        routeDecision: {
          selectedMode: "checkpoint-ultra-lock",
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
      }
    })
  },
  repairByView: {
    profile: makeCandidate("profile", "repair_refine", {
      id: "repair_profile_runtime_regressed",
      score: 0.82,
      consistencyScore: 0.69,
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
          appliedKinds: ["lineart"],
          missingRequiredKinds: ["canny"]
        }
      }
    })
  },
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(rejectRuntimeRegressedRepair.selectedByView.profile?.candidate.id, "pre_profile_runtime_stable");
assert.equal(rejectRuntimeRegressedRepair.repairAcceptanceByView.profile?.decision, "reject_repair");
assert.ok(
  rejectRuntimeRegressedRepair.repairAcceptanceByView.profile?.reasonCodes.includes(
    "repair_rejected:runtime_fallback_regressed"
  )
);
assert.ok(
  rejectRuntimeRegressedRepair.repairAcceptanceByView.profile?.reasonCodes.includes(
    "repair_rejected:runtime_required_structure_missing"
  )
);

const rejectUnsafeOnlyRepair = buildPostRepairAcceptanceGate({
  targetViews: ["front"],
  preRepairByView: {},
  repairByView: {
    front: makeCandidate("front", "repair_refine", {
      id: "repair_front_only_unsafe",
      score: 0.77,
      consistencyScore: null,
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
          requiredKinds: ["lineart"],
          appliedKinds: ["lineart"],
          missingRequiredKinds: []
        }
      }
    })
  },
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(rejectUnsafeOnlyRepair.selectedByView.front, undefined);
assert.equal(rejectUnsafeOnlyRepair.repairAcceptanceByView.front?.decision, "reject_repair");
assert.ok(
  rejectUnsafeOnlyRepair.repairAcceptanceByView.front?.reasonCodes.includes(
    "repair_rejected:runtime_only_candidate_unsafe"
  )
);

console.log("[characterGenerationPostRepairAcceptanceGate.smoke] PASS");
process.exit(0);
