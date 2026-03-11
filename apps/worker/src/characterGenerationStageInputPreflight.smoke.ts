import assert from "node:assert/strict";
import { assessStageInputPreflight } from "./characterGeneration";

type CharacterView = "front" | "threeQuarter" | "profile";

function makeStructureMetric(
  kind: "lineart" | "canny" | "depth",
  overrides: Partial<{
    signalCoverage: number;
    dynamicRange: number;
    meanLuma: number;
    stdDev: number;
    score: number;
    status: "ok" | "review" | "block";
    reasonCodes: string[];
  }> = {}
): any {
  return {
    kind,
    signalCoverage: overrides.signalCoverage ?? (kind === "depth" ? 0.86 : 0.11),
    dynamicRange: overrides.dynamicRange ?? (kind === "depth" ? 0.19 : 0.31),
    meanLuma: overrides.meanLuma ?? 0.22,
    stdDev: overrides.stdDev ?? (kind === "depth" ? 0.08 : 0.12),
    score: overrides.score ?? 0.88,
    status: overrides.status ?? "ok",
    reasonCodes: overrides.reasonCodes ?? []
  };
}

function makeReferenceEntry(
  role: string,
  weight: number,
  view: CharacterView
): any {
  return {
    id: `${role}_${view}`,
    role,
    view,
    weight,
    imageBase64: "stub",
    mimeType: "image/png"
  };
}

function makeStructureControlImage(
  sourceRole: string,
  sourceRefId: string,
  sourceView: CharacterView
): any {
  return {
    imageBase64: "stub",
    mimeType: "image/png",
    sourceRole,
    sourceRefId,
    sourceView
  };
}

const healthySideBase = assessStageInputPreflight({
  stage: "angles",
  views: ["threeQuarter"],
  targetStyle: "eraser cat mascot",
  referenceBankByView: {
    threeQuarter: [
      makeReferenceEntry("front_master", 0.94, "front"),
      makeReferenceEntry("composition", 0.32, "threeQuarter"),
      makeReferenceEntry("style", 0.24, "front")
    ]
  },
  referenceAnalysisByView: {
    threeQuarter: {
      alphaCoverage: 0.19,
      monochromeScore: 0.74
    }
  } as any,
  structureGuideMetricsByView: {
    threeQuarter: {
      lineart: makeStructureMetric("lineart"),
      canny: makeStructureMetric("canny")
    }
  },
  structureControlsByView: {
    threeQuarter: {
      lineart: makeStructureControlImage("composition", "composition_threeQuarter", "threeQuarter"),
      canny: makeStructureControlImage("composition", "composition_threeQuarter", "threeQuarter")
    }
  }
});

assert.equal(healthySideBase.status, "ok");
assert.deepEqual(healthySideBase.blockedViews, []);
assert.deepEqual(healthySideBase.executionViews, ["threeQuarter"]);

const frontStructured = assessStageInputPreflight({
  stage: "front",
  views: ["front"],
  targetStyle: "eraser cat mascot",
  referenceBankByView: {
    front: [
      makeReferenceEntry("style", 0.42, "front"),
      makeReferenceEntry("composition", 0.36, "front")
    ]
  },
  referenceAnalysisByView: {
    front: {
      alphaCoverage: 0.18,
      monochromeScore: 0.76
    }
  } as any,
  structureGuideMetricsByView: {
    front: {
      lineart: makeStructureMetric("lineart"),
      canny: makeStructureMetric("canny")
    }
  },
  structureControlsByView: {
    front: {
      lineart: makeStructureControlImage("composition", "composition_front", "front"),
      canny: makeStructureControlImage("composition", "composition_front", "front")
    }
  }
});

assert.equal(frontStructured.status, "ok");
assert.deepEqual(frontStructured.executionViews, ["front"]);

const missingStructure = assessStageInputPreflight({
  stage: "angles",
  views: ["profile"],
  targetStyle: "eraser cat mascot",
  referenceBankByView: {
    profile: [
      makeReferenceEntry("front_master", 0.92, "front"),
      makeReferenceEntry("composition", 0.28, "profile")
    ]
  },
  referenceAnalysisByView: {
    profile: {
      alphaCoverage: 0.16,
      monochromeScore: 0.71
    }
  } as any,
  structureGuideMetricsByView: {
    profile: {
      lineart: makeStructureMetric("lineart")
    }
  },
  structureControlsByView: {
    profile: {
      lineart: makeStructureControlImage("composition", "composition_profile", "profile")
    }
  }
});

assert.equal(missingStructure.status, "block");
assert.deepEqual(missingStructure.blockedViews, ["profile"]);
assert.ok(missingStructure.diagnosticsByView.profile?.reasonCodes.includes("missing_structure_kind:canny"));

const weakFrontAnchor = assessStageInputPreflight({
  stage: "lock",
  views: ["threeQuarter"],
  targetStyle: "eraser cat mascot",
  referenceBankByView: {
    threeQuarter: [
      makeReferenceEntry("front_master", 0.54, "front"),
      makeReferenceEntry("composition", 0.22, "threeQuarter")
    ]
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

assert.equal(weakFrontAnchor.status, "block");
assert.ok(weakFrontAnchor.diagnosticsByView.threeQuarter?.reasonCodes.includes("weak_reference_role:front_master"));

const softGuideReview = assessStageInputPreflight({
  stage: "view_only",
  views: ["profile"],
  targetStyle: "eraser cat mascot",
  referenceBankByView: {
    profile: [
      makeReferenceEntry("front_master", 0.9, "front"),
      makeReferenceEntry("composition", 0.28, "profile")
    ]
  },
  referenceAnalysisByView: {
    profile: {
      alphaCoverage: 0.12,
      monochromeScore: 0.61
    }
  } as any,
  structureGuideMetricsByView: {
    profile: {
      lineart: makeStructureMetric("lineart", {
        status: "review",
        score: 0.61,
        reasonCodes: ["guide_sparse"]
      }),
      canny: makeStructureMetric("canny")
    }
  },
  structureControlsByView: {
    profile: {
      lineart: makeStructureControlImage("composition", "composition_profile", "profile"),
      canny: makeStructureControlImage("composition", "composition_profile", "profile")
    }
  }
});

assert.equal(softGuideReview.status, "review");
assert.deepEqual(softGuideReview.warningViews, ["profile"]);
assert.ok(softGuideReview.executionViews.includes("profile"));

const repairMissingBase = assessStageInputPreflight({
  stage: "repair",
  views: ["threeQuarter"],
  targetStyle: "eraser cat mascot",
  referenceBankByView: {
    threeQuarter: [
      makeReferenceEntry("front_master", 0.9, "front"),
      makeReferenceEntry("composition", 0.3, "threeQuarter")
    ]
  },
  referenceAnalysisByView: {
    threeQuarter: {
      alphaCoverage: 0.14,
      monochromeScore: 0.7
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
      depth: makeStructureControlImage("repair_base", "repair_base_threeQuarter", "threeQuarter")
    }
  }
});

assert.equal(repairMissingBase.status, "block");
assert.ok(repairMissingBase.diagnosticsByView.threeQuarter?.reasonCodes.includes("missing_reference_role:repair_base"));

const wrongSideSourceRole = assessStageInputPreflight({
  stage: "angles",
  views: ["threeQuarter"],
  targetStyle: "eraser cat mascot",
  referenceBankByView: {
    threeQuarter: [
      makeReferenceEntry("front_master", 0.94, "front"),
      makeReferenceEntry("composition", 0.32, "threeQuarter")
    ]
  },
  referenceAnalysisByView: {
    threeQuarter: {
      alphaCoverage: 0.19,
      monochromeScore: 0.74
    }
  } as any,
  structureGuideMetricsByView: {
    threeQuarter: {
      lineart: makeStructureMetric("lineart"),
      canny: makeStructureMetric("canny")
    }
  },
  structureControlsByView: {
    threeQuarter: {
      lineart: makeStructureControlImage("front_master", "front_master_front", "front"),
      canny: makeStructureControlImage("composition", "composition_threeQuarter", "threeQuarter")
    }
  }
});

assert.equal(wrongSideSourceRole.status, "block");
assert.ok(
  wrongSideSourceRole.diagnosticsByView.threeQuarter?.reasonCodes.includes(
    "invalid_structure_source_role:lineart:front_master"
  )
);

const frontViewOnlyWithoutStructure = assessStageInputPreflight({
  stage: "view_only",
  views: ["front"],
  targetStyle: "eraser cat mascot",
  referenceBankByView: {
    front: [makeReferenceEntry("front_master", 0.9, "front")]
  },
  referenceAnalysisByView: {
    front: {
      alphaCoverage: 0.18,
      monochromeScore: 0.76
    }
  } as any
});

assert.equal(frontViewOnlyWithoutStructure.status, "ok");
assert.deepEqual(frontViewOnlyWithoutStructure.executionViews, ["front"]);

const repairWrongDepthSource = assessStageInputPreflight({
  stage: "repair",
  views: ["profile"],
  targetStyle: "eraser cat mascot",
  referenceBankByView: {
    profile: [
      makeReferenceEntry("front_master", 0.9, "front"),
      makeReferenceEntry("repair_base", 0.84, "profile"),
      makeReferenceEntry("composition", 0.3, "profile")
    ]
  },
  referenceAnalysisByView: {
    profile: {
      alphaCoverage: 0.14,
      monochromeScore: 0.7
    }
  } as any,
  structureGuideMetricsByView: {
    profile: {
      lineart: makeStructureMetric("lineart"),
      canny: makeStructureMetric("canny"),
      depth: makeStructureMetric("depth")
    }
  },
  structureControlsByView: {
    profile: {
      lineart: makeStructureControlImage("composition", "composition_profile", "profile"),
      canny: makeStructureControlImage("composition", "composition_profile", "profile"),
      depth: makeStructureControlImage("composition", "composition_profile", "profile")
    }
  }
});

assert.equal(repairWrongDepthSource.status, "block");
assert.ok(
  repairWrongDepthSource.diagnosticsByView.profile?.reasonCodes.includes(
    "non_primary_structure_source_role:depth:composition"
  )
);

console.log("[characterGenerationStageInputPreflight.smoke] PASS");
process.exit(0);
