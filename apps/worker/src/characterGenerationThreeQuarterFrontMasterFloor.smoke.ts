import assert from "node:assert/strict";
import {
  assessStageInputPreflight,
  deriveRetryAdjustmentForCandidate,
  rebalanceReferenceBankForRetry,
  resolveAdaptiveReferenceWeight,
  resolveStageInputMinimumReferenceWeights
} from "./characterGeneration";

type CharacterView = "front" | "threeQuarter" | "profile";

function makeReferenceEntry(role: string, weight: number, view: CharacterView): any {
  return {
    id: `${role}_${view}`,
    role,
    view,
    weight,
    imageBase64: "stub",
    mimeType: "image/png"
  };
}

function makeStructureMetric(kind: "lineart" | "canny" | "depth"): any {
  return {
    kind,
    signalCoverage: kind === "depth" ? 0.86 : 0.11,
    dynamicRange: kind === "depth" ? 0.19 : 0.31,
    meanLuma: 0.22,
    stdDev: kind === "depth" ? 0.08 : 0.12,
    score: 0.88,
    status: "ok",
    reasonCodes: []
  };
}

function makeStructureControlImage(sourceRole: string, sourceRefId: string, sourceView: CharacterView): any {
  return {
    imageBase64: "stub",
    mimeType: "image/png",
    sourceRole,
    sourceRefId,
    sourceView
  };
}

for (const stage of ["refine", "lock"] as const) {
  const adjustment = deriveRetryAdjustmentForCandidate({
    stage,
    view: "threeQuarter",
    speciesId: "cat",
    candidate: {
      candidate: {
        id: `cat-threequarter-${stage}-front-master-floor`,
        view: "threeQuarter"
      },
      analysis: {},
      score: 0.68,
      styleScore: 0.74,
      referenceSimilarity: null,
      consistencyScore: 0.31,
      warnings: ["consistency_shape_drift", "consistency_style_drift", "head_shape_not_square_enough"],
      rejections: ["threequarter_front_collapse", "inconsistent_with_front_baseline"],
      breakdown: {}
    } as any
  });

  const frontMasterMinimum = resolveStageInputMinimumReferenceWeights(stage, "threeQuarter").front_master ?? 0;
  const adaptiveFrontMasterWeight = resolveAdaptiveReferenceWeight({
    stage,
    role: "front_master",
    targetView: "threeQuarter",
    hasStarter: true
  });
  assert.ok(
    adaptiveFrontMasterWeight >= frontMasterMinimum,
    `${stage} threeQuarter adaptive front_master weight ${adaptiveFrontMasterWeight} should meet minimum ${frontMasterMinimum}`
  );

  const rebalanced = rebalanceReferenceBankForRetry({
    entries: [
      makeReferenceEntry("front_master", 0.95, "front"),
      makeReferenceEntry("composition", 0.62, "threeQuarter"),
      makeReferenceEntry("view_starter", 0.46, "threeQuarter"),
      makeReferenceEntry("subject", 0.88, "front"),
      makeReferenceEntry("hero", 0.72, "front")
    ],
    stage,
    view: "threeQuarter",
    adjustment
  });

  const frontMasterWeight = rebalanced?.find((entry) => entry.role === "front_master")?.weight ?? 0;
  assert.ok(
    frontMasterWeight >= frontMasterMinimum,
    `${stage} threeQuarter front_master weight ${frontMasterWeight} should meet minimum ${frontMasterMinimum}`
  );

  const preflight = assessStageInputPreflight({
    stage,
    views: ["threeQuarter"],
    targetStyle: "eraser cat mascot",
    referenceBankByView: {
      threeQuarter: rebalanced
    },
    referenceAnalysisByView: {
      threeQuarter: {
        alphaCoverage: 0.18,
        monochromeScore: 0.76
      }
    } as any,
    structureGuideMetricsByView: {
      threeQuarter: {
        lineart: makeStructureMetric("lineart"),
        canny: makeStructureMetric("canny"),
        depth: makeStructureMetric("depth")
      }
    },
    structureControlsByView: {
      threeQuarter: {
        lineart: makeStructureControlImage("composition", "composition_threeQuarter", "threeQuarter"),
        canny: makeStructureControlImage("composition", "composition_threeQuarter", "threeQuarter"),
        depth: makeStructureControlImage("composition", "composition_threeQuarter", "threeQuarter")
      }
    }
  });

  assert.ok(
    !preflight.diagnosticsByView.threeQuarter?.reasonCodes.includes("weak_reference_role:front_master"),
    `${stage} threeQuarter preflight should not block on weak front_master after rebalance`
  );
}

console.log("[characterGenerationThreeQuarterFrontMasterFloor.smoke] PASS");
process.exit(0);
