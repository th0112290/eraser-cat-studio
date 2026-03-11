import assert from "node:assert/strict";
import {
  assessFinalQualityFirewall,
  buildPackDefectSummary,
  groupBestByViewForSelection,
  mergePreferredSelectionByViewForSelection
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
    frontSymmetryScore?: number;
    headSquarenessScore?: number;
    speciesScore?: number;
    targetStyleScore?: number;
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
    styleScore: overrides.targetStyleScore ?? 0.62,
    referenceSimilarity: null,
    consistencyScore: overrides.consistencyScore ?? (view === "front" ? null : 0.7),
    warnings: overrides.warnings ?? [],
    rejections: overrides.rejections ?? [],
    breakdown: {
      frontSymmetryScore: overrides.frontSymmetryScore ?? 0.74,
      headSquarenessScore: overrides.headSquarenessScore ?? 0.41,
      speciesScore: overrides.speciesScore ?? 0.52,
      targetStyleScore: overrides.targetStyleScore ?? 0.63
    }
  };
}

const persistentFrontSelectedByView = {
  front: makeCandidate("front", {
    score: 0.6,
    warnings: ["mascot_identity_too_weak", "fragmented_or_multi_object_front"],
    rejections: ["subject_isolation_low"],
    frontSymmetryScore: 0.46,
    headSquarenessScore: 0.23,
    speciesScore: 0.3,
    targetStyleScore: 0.42
  }),
  threeQuarter: makeCandidate("threeQuarter"),
  profile: makeCandidate("profile")
};

const persistentFrontPackDefectSummary = buildPackDefectSummary({
  selectedByView: persistentFrontSelectedByView,
  workflowStages: [
    {
      stage: "front_master",
      templateVersion: "ultra_front_master_v1",
      views: ["front"],
      candidateCount: 6,
      acceptedScoreThreshold: 0.58,
      roundsAttempted: 2,
      observedDefectFamiliesByView: {
        front: ["identity", "head", "silhouette"]
      }
    },
    {
      stage: "repair_refine",
      templateVersion: "ultra_repair_refine_v1",
      views: ["front"],
      candidateCount: 4,
      acceptedScoreThreshold: 0.61,
      roundsAttempted: 1,
      observedDefectFamiliesByView: {
        front: ["identity", "head"]
      }
    }
  ] as any
});

assert.ok(persistentFrontPackDefectSummary.persistentFamiliesByView?.front?.includes("identity"));
assert.ok(persistentFrontPackDefectSummary.persistentFamiliesByView?.front?.includes("head"));

const persistentFrontFirewall = assessFinalQualityFirewall({
  selectedByView: persistentFrontSelectedByView,
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58,
  autoReroute: {
    attempted: true,
    recovered: false,
    triggers: ["pack_coherence_block"],
    targetViews: ["front", "threeQuarter", "profile"],
    notes: ["front anchor stayed weak after reroute"],
    initialMissingViews: [],
    initialLowQualityViews: ["front"]
  },
  selectionRisk: {
    level: "block",
    reasonCodes: ["front_anchor_soft", "auto_reroute_failed"],
    suggestedAction: "recreate",
    summary: "block:front_anchor_soft,auto_reroute_failed"
  },
  qualityEmbargo: {
    level: "block",
    reasonCodes: ["front_identity_embargo"],
    suggestedAction: "recreate",
    summary: "quality embargo blocked pack: front_identity_embargo",
    blockingViews: ["front"]
  },
  packDefectSummary: persistentFrontPackDefectSummary
});

assert.equal(persistentFrontFirewall.level, "block");
assert.equal(persistentFrontFirewall.suggestedAction, "recreate");
assert.ok(persistentFrontFirewall.blockingViews?.includes("front"));
assert.ok(persistentFrontFirewall.reasonCodes.includes("front_persistent_critical_defect"));

const repeatedSoftSelectedByView = {
  front: makeCandidate("front"),
  threeQuarter: makeCandidate("threeQuarter", {
    warnings: ["consistency_style_drift", "paw_shape_cleanup_needed"],
    consistencyScore: 0.51
  }),
  profile: makeCandidate("profile", {
    warnings: ["consistency_style_drift", "paw_shape_cleanup_needed"],
    consistencyScore: 0.49
  })
};

const repeatedSoftPackDefectSummary = buildPackDefectSummary({
  selectedByView: repeatedSoftSelectedByView,
  workflowStages: [
    {
      stage: "side_view_base",
      templateVersion: "ultra_side_view_base_v1",
      views: ["threeQuarter", "profile"],
      candidateCount: 5,
      acceptedScoreThreshold: 0.58,
      roundsAttempted: 1,
      observedDefectFamiliesByView: {
        threeQuarter: ["style", "paws"],
        profile: ["style", "paws"]
      }
    }
  ] as any
});

assert.ok(repeatedSoftPackDefectSummary.repeatedFamilies.includes("style"));
assert.ok(repeatedSoftPackDefectSummary.repeatedFamilies.includes("paws"));

const repeatedSoftFirewall = assessFinalQualityFirewall({
  selectedByView: repeatedSoftSelectedByView,
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58,
  packDefectSummary: repeatedSoftPackDefectSummary
});

assert.equal(repeatedSoftFirewall.level, "review");
assert.ok(repeatedSoftFirewall.warningViews?.includes("threeQuarter"));
assert.ok(repeatedSoftFirewall.warningViews?.includes("profile"));
assert.ok(repeatedSoftFirewall.reasonCodes.includes("repeated-soft:style"));
assert.ok(repeatedSoftFirewall.reasonCodes.includes("repeated-soft:paws"));

const runtimeFrontSelectedByView = {
  front: makeCandidate("front", {
    rejections: ["runtime_preflight_failed"],
    warnings: ["runtime_adapter_warning_present"],
    providerMeta: {
      workflowStage: "repair_refine",
      routeDecision: {
        selectedMode: "checkpoint-ultra-repair",
        fallbackUsed: false
      },
      preflightDiagnostics: {
        ok: false,
        warnings: []
      },
      structureControlDiagnostics: {
        requiredKinds: ["lineart", "canny"],
        appliedKinds: ["lineart"],
        missingRequiredKinds: ["canny"]
      }
    }
  }),
  threeQuarter: makeCandidate("threeQuarter", {
    warnings: ["runtime_fallback_used"],
    consistencyScore: 0.54,
    providerMeta: {
      workflowStage: "identity_lock_refine",
      routeDecision: {
        selectedMode: "checkpoint-ultra-lock",
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
};

const runtimeFrontPackDefectSummary = buildPackDefectSummary({
  selectedByView: runtimeFrontSelectedByView,
  workflowStages: [
    {
      stage: "side_view_refine",
      templateVersion: "ultra_side_view_refine_v1",
      views: ["threeQuarter"],
      candidateCount: 4,
      acceptedScoreThreshold: 0.6,
      roundsAttempted: 1,
      observedDefectFamiliesByView: {
        threeQuarter: ["runtime"]
      }
    },
    {
      stage: "repair_refine",
      templateVersion: "ultra_repair_refine_v1",
      views: ["front"],
      candidateCount: 3,
      acceptedScoreThreshold: 0.61,
      roundsAttempted: 1,
      observedDefectFamiliesByView: {
        front: ["runtime"]
      }
    }
  ] as any
});

const runtimeFrontFirewall = assessFinalQualityFirewall({
  selectedByView: runtimeFrontSelectedByView,
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
  },
  selectionRisk: {
    level: "block",
    reasonCodes: ["runtime_quality_compounded", "runtime_fallback_selected"],
    suggestedAction: "recreate",
    summary: "block:runtime_quality_compounded,runtime_fallback_selected"
  },
  packDefectSummary: runtimeFrontPackDefectSummary
});

assert.equal(runtimeFrontFirewall.level, "block");
assert.equal(runtimeFrontFirewall.suggestedAction, "recreate");
assert.ok(runtimeFrontFirewall.blockingViews?.includes("front"));
assert.ok(runtimeFrontFirewall.reasonCodes.includes("runtime-critical:front"));
assert.ok(runtimeFrontFirewall.reasonCodes.includes("front_runtime_firewall"));
assert.ok(runtimeFrontFirewall.reasonCodes.includes("runtime-repair-stage:front"));

const runtimeSoftSelectedByView = {
  front: makeCandidate("front"),
  threeQuarter: makeCandidate("threeQuarter", {
    warnings: ["runtime_fallback_used"],
    consistencyScore: 0.55,
    providerMeta: {
      workflowStage: "identity_lock_refine",
      routeDecision: {
        selectedMode: "checkpoint-ultra-lock",
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
  profile: makeCandidate("profile", {
    warnings: ["runtime_route_degraded"],
    consistencyScore: 0.5,
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
        appliedKinds: ["lineart"],
        missingRequiredKinds: ["canny"]
      }
    }
  })
};

const runtimeSoftPackDefectSummary = buildPackDefectSummary({
  selectedByView: runtimeSoftSelectedByView,
  workflowStages: [
    {
      stage: "side_view_base",
      templateVersion: "ultra_side_view_base_v1",
      views: ["threeQuarter", "profile"],
      candidateCount: 5,
      acceptedScoreThreshold: 0.58,
      roundsAttempted: 1,
      observedDefectFamiliesByView: {
        threeQuarter: ["runtime"],
        profile: ["runtime"]
      }
    }
  ] as any
});

const runtimeSoftFirewall = assessFinalQualityFirewall({
  selectedByView: runtimeSoftSelectedByView,
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58,
  packDefectSummary: runtimeSoftPackDefectSummary
});

assert.equal(runtimeSoftFirewall.level, "review");
assert.ok(runtimeSoftFirewall.warningViews?.includes("threeQuarter"));
assert.ok(runtimeSoftFirewall.warningViews?.includes("profile"));
assert.ok(runtimeSoftFirewall.reasonCodes.includes("pack_runtime_degradation"));
assert.ok(runtimeSoftFirewall.reasonCodes.includes("repeated-soft:runtime"));
assert.ok(runtimeSoftFirewall.reasonCodes.includes("runtime-lock-stage:threeQuarter"));
assert.ok(runtimeSoftFirewall.reasonCodes.includes("runtime-lock-stage:profile"));

const cleanSelectedByView = {
  front: makeCandidate("front"),
  threeQuarter: makeCandidate("threeQuarter", {
    consistencyScore: 0.71
  }),
  profile: makeCandidate("profile", {
    consistencyScore: 0.68
  })
};

const cleanPackDefectSummary = buildPackDefectSummary({
  selectedByView: cleanSelectedByView,
  workflowStages: []
});

const cleanFirewall = assessFinalQualityFirewall({
  selectedByView: cleanSelectedByView,
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58,
  packDefectSummary: cleanPackDefectSummary
});

assert.equal(cleanFirewall.level, "none");
assert.deepEqual(cleanPackDefectSummary.repeatedFamilies, []);

const cleanSelectionCandidate = makeCandidate("threeQuarter", {
  candidateId: "threeQuarter_clean_selection",
  score: 0.76,
  consistencyScore: 0.64,
  providerMeta: {
    workflowStage: "side_view_refine",
    routeDecision: {
      selectedMode: "checkpoint-ultra-refine",
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
});

const compoundSelectionCandidate = makeCandidate("threeQuarter", {
  candidateId: "threeQuarter_compound_selection",
  score: 0.89,
  consistencyScore: 0.71,
  warnings: ["runtime_fallback_used", "runtime_route_degraded"],
  providerMeta: {
    workflowStage: "identity_lock_refine",
    routeDecision: {
      selectedMode: "checkpoint",
      fallbackUsed: true
    },
    preflightDiagnostics: {
      ok: true,
      warnings: ["route_soft", "contract_soft"]
    },
    structureControlDiagnostics: {
      requiredKinds: ["lineart", "canny"],
      appliedKinds: ["lineart"],
      missingRequiredKinds: ["canny"]
    }
  }
});

const selectionOrdered = groupBestByViewForSelection({
  scored: [compoundSelectionCandidate, cleanSelectionCandidate],
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58
});

assert.equal(selectionOrdered.threeQuarter?.candidate.id, "threeQuarter_clean_selection");

const preferredMerged = mergePreferredSelectionByViewForSelection({
  baseSelectedByView: {
    threeQuarter: cleanSelectionCandidate
  },
  preferredSelectionByView: {
    threeQuarter: compoundSelectionCandidate
  },
  targetStyle: "mascot",
  acceptedScoreThreshold: 0.58
});

assert.equal(preferredMerged.threeQuarter?.candidate.id, "threeQuarter_clean_selection");

console.log("[characterGenerationSelectionFirewall.smoke] PASS");
process.exit(0);
