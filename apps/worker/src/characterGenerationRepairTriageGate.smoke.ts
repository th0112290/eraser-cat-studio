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
    styleScore: overrides.targetStyleScore ?? 0.66,
    referenceSimilarity: null,
    consistencyScore: overrides.consistencyScore ?? (view === "front" ? null : 0.66),
    warnings: overrides.warnings ?? [],
    rejections: overrides.rejections ?? [],
    breakdown: {
      frontSymmetryScore: overrides.frontSymmetryScore ?? 0.78,
      headSquarenessScore: overrides.headSquarenessScore ?? 0.62,
      speciesScore: overrides.speciesScore ?? 0.66,
      targetStyleScore: overrides.targetStyleScore ?? 0.7
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

console.log("[characterGenerationRepairTriageGate.smoke] PASS");
process.exit(0);
