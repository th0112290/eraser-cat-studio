import assert from "node:assert/strict";
import { buildSideViewAcceptanceGate } from "./characterGeneration";

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

const promoteRefine = buildSideViewAcceptanceGate({
  targetViews: ["threeQuarter"],
  baseByView: {
    threeQuarter: makeCandidate("threeQuarter", "side_view_base", {
      id: "base_threequarter",
      score: 0.71,
      consistencyScore: 0.54,
      warnings: ["consistency_style_drift"]
    })
  },
  refineByView: {
    threeQuarter: makeCandidate("threeQuarter", "side_view_refine", {
      id: "refine_threequarter",
      score: 0.77,
      consistencyScore: 0.63,
      warnings: []
    })
  },
  lockByView: {},
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(promoteRefine.selectedByView.threeQuarter?.candidate.id, "refine_threequarter");
assert.equal(promoteRefine.gateDecisionsByView.threeQuarter?.decision, "promote_refine");

const promoteLock = buildSideViewAcceptanceGate({
  targetViews: ["profile"],
  baseByView: {
    profile: makeCandidate("profile", "side_view_base", {
      id: "base_profile",
      score: 0.72,
      consistencyScore: 0.57,
      warnings: ["consistency_shape_drift"]
    })
  },
  refineByView: {
    profile: makeCandidate("profile", "side_view_refine", {
      id: "refine_profile",
      score: 0.75,
      consistencyScore: 0.6,
      warnings: []
    })
  },
  lockByView: {
    profile: makeCandidate("profile", "identity_lock_refine", {
      id: "lock_profile",
      score: 0.79,
      consistencyScore: 0.66,
      warnings: []
    })
  },
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(promoteLock.selectedByView.profile?.candidate.id, "lock_profile");
assert.equal(promoteLock.gateDecisionsByView.profile?.decision, "promote_lock");

const keepBase = buildSideViewAcceptanceGate({
  targetViews: ["profile"],
  baseByView: {
    profile: makeCandidate("profile", "side_view_base", {
      id: "base_profile_stable",
      score: 0.8,
      consistencyScore: 0.67,
      warnings: []
    })
  },
  refineByView: {
    profile: makeCandidate("profile", "side_view_refine", {
      id: "refine_profile_worse",
      score: 0.79,
      consistencyScore: 0.58,
      warnings: ["consistency_style_drift", "consistency_shape_drift"]
    })
  },
  lockByView: {
    profile: makeCandidate("profile", "identity_lock_refine", {
      id: "lock_profile_worse",
      score: 0.78,
      consistencyScore: 0.56,
      warnings: ["consistency_style_drift", "consistency_shape_drift"],
      rejections: ["subject_isolation_low"]
    })
  },
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(keepBase.selectedByView.profile?.candidate.id, "base_profile_stable");
assert.equal(keepBase.gateDecisionsByView.profile?.decision, "keep_base");
assert.ok(
  keepBase.gateDecisionsByView.profile?.reasons.some(
    (reason) => reason.includes("refine_rejected:") || reason.includes("lock_rejected:")
  )
);

const rejectRuntimeRegressedRefine = buildSideViewAcceptanceGate({
  targetViews: ["threeQuarter"],
  baseByView: {
    threeQuarter: makeCandidate("threeQuarter", "side_view_base", {
      id: "base_threequarter_runtime_stable",
      score: 0.72,
      consistencyScore: 0.56,
      warnings: [],
      providerMeta: {
        routeDecision: {
          selectedMode: "checkpoint-ultra-pose",
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
  refineByView: {
    threeQuarter: makeCandidate("threeQuarter", "side_view_refine", {
      id: "refine_threequarter_runtime_regressed",
      score: 0.8,
      consistencyScore: 0.64,
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
  lockByView: {},
  acceptedScoreThreshold: 0.58,
  targetStyle: "mascot"
});

assert.equal(rejectRuntimeRegressedRefine.selectedByView.threeQuarter?.candidate.id, "base_threequarter_runtime_stable");
assert.equal(rejectRuntimeRegressedRefine.gateDecisionsByView.threeQuarter?.decision, "keep_base");
assert.ok(
  rejectRuntimeRegressedRefine.gateDecisionsByView.threeQuarter?.reasons.includes(
    "refine_rejected:runtime_fallback_regressed"
  )
);
assert.ok(
  rejectRuntimeRegressedRefine.gateDecisionsByView.threeQuarter?.reasons.includes(
    "refine_rejected:runtime_required_structure_missing"
  )
);

const rejectUnsafeOnlyLock = buildSideViewAcceptanceGate({
  targetViews: ["profile"],
  baseByView: {},
  refineByView: {},
  lockByView: {
    profile: makeCandidate("profile", "identity_lock_refine", {
      id: "lock_profile_only_unsafe",
      score: 0.82,
      consistencyScore: 0.67,
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

assert.equal(rejectUnsafeOnlyLock.selectedByView.profile, undefined);
assert.equal(rejectUnsafeOnlyLock.gateDecisionsByView.profile?.decision, "reject_lock");
assert.ok(
  rejectUnsafeOnlyLock.gateDecisionsByView.profile?.reasons.includes(
    "lock_rejected:runtime_only_candidate_unsafe"
  )
);

console.log("[characterGenerationSideViewGate.smoke] PASS");
process.exit(0);
