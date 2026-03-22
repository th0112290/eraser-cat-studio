export function assessRigStabilityWithDeps(input: any, deps: any) {
  const {
    CHARACTER_VIEWS,
    isMascotTargetStyle,
    resolveRigStabilityThresholds,
    summarizeCandidateRigStability,
    averageFiniteNumbers,
    createRigRepairRecommendation,
    summarizeRigRepairability,
    dedupeStrings,
    stableStringify
  } = deps;

  if (!isMascotTargetStyle(input.targetStyle)) {
    return {
      severity: "none",
      summary: "rig stability clear",
      reasonCodes: [],
      fallbackReasonCodes: [],
      warningViews: [],
      blockingViews: [],
      reviewOnly: false,
      safeFrontExpression: false,
      suppressAggressiveYaw: false,
      lockMouthPreset: false,
      anchorConfidenceOverall: null,
      anchorConfidenceByView: {},
      landmarkConsistencyByView: {},
      reasonFamilies: [],
      repairability: "none",
      repairRecommendations: [],
      repairPlanByView: {}
    };
  }

  const thresholds = resolveRigStabilityThresholds(input.speciesId);
  const warningViews = new Set<string>();
  const blockingViews = new Set<string>();
  const reasonCodes = new Set<string>();
  const fallbackReasonCodes = new Set<string>();
  const reasonFamilies = new Set<string>();
  const anchorConfidenceByView: Record<string, number | null> = {};
  const landmarkConsistencyByView: Record<string, number | null> = {};
  const repairRecommendations: Array<Record<string, any>> = [];
  const repairPlanByView: Record<string, unknown> = {};
  let safeFrontExpression = false;
  let suppressAggressiveYaw = false;
  let lockMouthPreset = false;

  for (const view of CHARACTER_VIEWS) {
    const candidate = input.selectedByView[view];
    if (!candidate) {
      continue;
    }
    const snapshot = summarizeCandidateRigStability({
      candidate,
      speciesId: input.speciesId
    });
    const anchorConfidence =
      snapshot.anchorConfidence ??
      (view === "front"
        ? input.packCoherence?.metrics.frontAnchorScore ?? null
        : view === "threeQuarter"
          ? input.packCoherence?.metrics.threeQuarterGeometryCue ?? null
          : input.packCoherence?.metrics.profileGeometryCue ?? null);
    const landmarkConsistency =
      snapshot.landmarkConsistency ??
      (view === "threeQuarter"
        ? input.packCoherence?.metrics.threeQuarterConsistency ?? null
        : view === "profile"
          ? input.packCoherence?.metrics.profileConsistency ?? null
          : null);
    anchorConfidenceByView[view] = anchorConfidence;
    landmarkConsistencyByView[view] = landmarkConsistency;
    if (snapshot.lowAnchorConfidence || snapshot.lowLandmarkConsistency) {
      warningViews.add(view);
    }
    if (snapshot.hardLowAnchorConfidence || snapshot.hardLowLandmarkConsistency) {
      blockingViews.add(view);
    }
    if (snapshot.lowAnchorConfidence) {
      reasonCodes.add(`rig-anchor-review:${view}`);
    }
    if (snapshot.hardLowAnchorConfidence) {
      reasonCodes.add(`rig-anchor-block:${view}`);
    }
    if (snapshot.lowLandmarkConsistency) {
      reasonCodes.add(`rig-landmark-review:${view}`);
    }
    if (snapshot.hardLowLandmarkConsistency) {
      reasonCodes.add(`rig-landmark-block:${view}`);
    }
    for (const family of snapshot.reasonFamilies ?? []) {
      reasonFamilies.add(family);
    }
    if ((snapshot.repairRecommendations?.length ?? 0) > 0) {
      repairRecommendations.push(...(snapshot.repairRecommendations ?? []));
      const familyCodes = dedupeStrings((snapshot.reasonFamilies ?? []).map((family: any) => family));
      const anchorTargets = dedupeStrings(
        (snapshot.repairRecommendations ?? []).flatMap((entry: any) => entry.anchorTargets ?? [])
      );
      const viewStatus =
        snapshot.hardLowAnchorConfidence || snapshot.hardLowLandmarkConsistency
          ? "block"
          : snapshot.lowAnchorConfidence || snapshot.lowLandmarkConsistency
            ? "review"
            : "ok";
      const preferredAction =
        snapshot.preferredAction ??
        snapshot.repairRecommendations?.find((entry: any) => entry.action === "manual-compare")?.action ??
        snapshot.repairRecommendations?.find((entry: any) => entry.action === "regenerate-view")?.action ??
        snapshot.repairRecommendations?.find((entry: any) => entry.action === "protective-fallback")?.action;
      repairPlanByView[view] = {
        status: viewStatus,
        familyCodes,
        anchorTargets,
        ...(preferredAction ? { preferredAction } : {}),
        recommendations: snapshot.repairRecommendations ?? []
      };
    }
    safeFrontExpression = safeFrontExpression || snapshot.safeFrontExpression;
    suppressAggressiveYaw = suppressAggressiveYaw || snapshot.suppressAggressiveYaw;
    lockMouthPreset = lockMouthPreset || snapshot.lockMouthPreset;
  }

  const anchorConfidenceOverall =
    averageFiniteNumbers(CHARACTER_VIEWS.map((view: any) => anchorConfidenceByView[view] ?? null)) ?? null;
  if (typeof anchorConfidenceOverall === "number") {
    if (anchorConfidenceOverall < thresholds.overallAnchorSoftFloor) {
      reasonCodes.add("rig-anchor-overall-review");
    }
    if (anchorConfidenceOverall < thresholds.overallAnchorHardFloor) {
      reasonCodes.add("rig-anchor-overall-block");
    }
  }

  const reviewOnly = warningViews.size > 0 || blockingViews.size > 0;
  if (reviewOnly) {
    fallbackReasonCodes.add("review_only");
  }
  if (safeFrontExpression) {
    fallbackReasonCodes.add("safe_front_expression");
  }
  if (suppressAggressiveYaw) {
    fallbackReasonCodes.add("suppress_aggressive_yaw");
  }
  if (lockMouthPreset) {
    fallbackReasonCodes.add("lock_mouth_preset");
  }

  const autoRerouteFailed = input.autoReroute?.attempted === true && input.autoReroute.recovered === false;
  const compoundedFrontRisk =
    blockingViews.has("front") &&
    (autoRerouteFailed ||
      input.packCoherence?.severity === "block" ||
      (input.selectedByView.front?.warnings.includes("runtime_fallback_used") ?? false) ||
      (input.selectedByView.front?.warnings.includes("runtime_route_degraded") ?? false));
  const compoundedPackRisk =
    blockingViews.size >= 2 ||
    (blockingViews.size >= 1 && warningViews.size >= 2) ||
    (typeof anchorConfidenceOverall === "number" && anchorConfidenceOverall < thresholds.overallAnchorHardFloor);
  const severity = compoundedFrontRisk || compoundedPackRisk ? "block" : reviewOnly ? "review" : "none";
  if (severity !== "none") {
    reasonCodes.add(severity === "block" ? "rig-compounded" : "rig-review-only");
  }
  if (severity === "block") {
    fallbackReasonCodes.add("manual_compare");
    fallbackReasonCodes.add("recreate");
    reasonFamilies.add("recreate_required");
  } else if (reviewOnly) {
    fallbackReasonCodes.add("manual_compare");
  }
  if (severity === "block") {
    for (const view of [...blockingViews]) {
      repairRecommendations.push(
        createRigRepairRecommendation({
          view,
          family: "recreate_required",
          reasonCode: `recreate_required:${view}`,
          priority: "high",
          action: "recreate-pack",
          summary:
            view === "front" || blockingViews.size >= 2
              ? "Rig failures are compounded enough that recreating the pack is safer than approving the current selection."
              : `${view} is still too unstable and should stay in compare until the pack is recreated or fully repaired.`
        })
      );
    }
  }
  for (const view of [...warningViews].filter((entry: string) => !blockingViews.has(entry))) {
    if (!repairPlanByView[view] && reviewOnly) {
      repairPlanByView[view] = {
        status: "review",
        familyCodes: [],
        anchorTargets: [],
        preferredAction: "manual-compare",
        recommendations: []
      };
    }
  }
  const repairability = summarizeRigRepairability({
    severity,
    blockingViews: [...blockingViews],
    warningViews: [...warningViews].filter((view) => !blockingViews.has(view)),
    repairRecommendations,
    anchorConfidenceOverall,
    overallAnchorHardFloor: thresholds.overallAnchorHardFloor
  });

  return {
    severity,
    summary:
      severity === "none"
        ? "rig stability clear"
        : `${severity}:anchors=${[...warningViews].join(",") || "none"}; fallbacks=${[...fallbackReasonCodes].join(",")}`,
    reasonCodes: [...reasonCodes],
    fallbackReasonCodes: [...fallbackReasonCodes],
    warningViews: [...warningViews].filter((view) => !blockingViews.has(view)),
    blockingViews: [...blockingViews],
    reviewOnly,
    safeFrontExpression,
    suppressAggressiveYaw,
    lockMouthPreset,
    anchorConfidenceOverall:
      typeof anchorConfidenceOverall === "number" ? Number(anchorConfidenceOverall.toFixed(4)) : null,
    anchorConfidenceByView,
    landmarkConsistencyByView,
    reasonFamilies: [...reasonFamilies],
    repairability,
    repairRecommendations: dedupeStrings(
      repairRecommendations.map((entry: Record<string, any>) =>
        stableStringify({
          view: entry.view,
          family: entry.family,
          action: entry.action,
          priority: entry.priority,
          reasonCode: entry.reasonCode,
          summary: entry.summary,
          repairable: entry.repairable,
          anchorTargets: entry.anchorTargets ?? []
        })
      )
    ).map((entry: string) => JSON.parse(entry)),
    repairPlanByView,
    ...(severity === "block"
      ? { suggestedAction: "recreate" }
      : reviewOnly
        ? { suggestedAction: "pick-manually" }
        : {})
  };
}

function resolveMascotSelectionRiskThresholds(speciesId: any, deps: any) {
  const { resolveMascotSpeciesProfile, clamp01 } = deps;
  const profile = resolveMascotSpeciesProfile(speciesId);
  const qc = profile.qcThresholds;
  const frontStyleSoftFloor = profile.id === "wolf" ? 0.44 : profile.id === "dog" ? 0.45 : 0.46;
  const frontSpeciesSoftFloor = profile.id === "wolf" ? 0.3 : profile.id === "dog" ? 0.32 : 0.34;
  return {
    frontAnchorScoreSoftFloor: clamp01(Math.max(0.64, qc.frontMasterMinScore + 0.08)),
    frontSymmetrySoftFloor: clamp01(Math.max(0.42, qc.minFrontSymmetryScore - 0.02)),
    frontHeadSquarenessSoftFloor: clamp01(Math.max(0.18, qc.frontMasterMinHeadSquarenessScore + 0.04)),
    frontStyleSoftFloor: clamp01(Math.max(frontStyleSoftFloor, qc.frontMasterMinStyleScore + 0.08)),
    frontSpeciesSoftFloor: clamp01(Math.max(frontSpeciesSoftFloor, qc.frontMasterMinSpeciesScore + 0.08)),
    threeQuarterGeometrySoftFloor: clamp01(Math.max(0.3, (qc.minGeometryCueByView.threeQuarter ?? 0.4) - 0.02)),
    profileGeometrySoftFloor: clamp01(Math.max(0.26, (qc.minGeometryCueByView.profile ?? 0.34) - 0.02)),
    threeQuarterConsistencySoftFloor: clamp01(Math.max(0.44, (qc.minConsistencyByView.threeQuarter ?? 0.48) + 0.04)),
    profileConsistencySoftFloor: clamp01(Math.max(0.4, (qc.minConsistencyByView.profile ?? 0.4) + 0.05)),
    speciesSpreadSoftCeiling: clamp01(Math.max(0.12, qc.maxSpeciesSpread - 0.04)),
    styleSpreadSoftCeiling: clamp01(Math.max(0.1, qc.maxStyleSpread - 0.04)),
    headRatioSpreadSoftCeiling: clamp01(Math.max(0.08, qc.maxHeadRatioSpread - 0.04)),
    monochromeSpreadSoftCeiling: clamp01(Math.max(0.1, qc.maxMonochromeSpread - 0.06)),
    earCueSpreadSoftCeiling: clamp01(Math.max(0.16, qc.maxEarCueSpread - 0.06)),
    muzzleCueSpreadSoftCeiling: clamp01(Math.max(0.16, qc.maxMuzzleCueSpread - 0.05)),
    headShapeCueSpreadSoftCeiling: clamp01(Math.max(0.16, qc.maxHeadShapeCueSpread - 0.05)),
    silhouetteCueSpreadSoftCeiling: clamp01(Math.max(0.16, qc.maxSilhouetteCueSpread - 0.06))
  };
}

export function isStrongFrontMasterCandidateWithDeps(input: any, deps: any) {
  const { candidate, targetStyle, acceptedScoreThreshold, speciesId } = input;
  const {
    deriveSparseFrontAnchorScoreFallback,
    normalizeGenerationSpecies,
    resolveMascotQcThresholds,
    isMascotTargetStyle
  } = deps;

  if (!candidate || candidate.candidate.view !== "front") {
    return false;
  }
  if (
    deriveSparseFrontAnchorScoreFallback({
      candidate,
      acceptedScoreThreshold,
      speciesId
    }) !== null
  ) {
    return true;
  }
  const mascotSpecies = normalizeGenerationSpecies(speciesId);
  const profileThresholds = resolveMascotQcThresholds(speciesId);
  const minimumFrontScore = Math.max(acceptedScoreThreshold, profileThresholds.frontMasterMinScore);
  if (candidate.rejections.length > 0 || candidate.score < minimumFrontScore) {
    return false;
  }
  if (!isMascotTargetStyle(targetStyle)) {
    return true;
  }

  const dogFrontSupportStrong =
    mascotSpecies !== "dog" ||
    ((candidate.breakdown.speciesEarScore ?? 0) >= 0.12 && (candidate.breakdown.handRegionDensityScore ?? 0) >= 0.12);
  const wolfFrontSupportStrong =
    mascotSpecies !== "wolf" ||
    ((candidate.breakdown.speciesEarScore ?? 0) >= 0.1 &&
      (
        (candidate.breakdown.speciesHeadShapeScore ?? 0) >= 0.18 ||
        (
          (candidate.breakdown.speciesScore ?? 0) >= 0.5 &&
          (candidate.breakdown.targetStyleScore ?? 0) >= 0.82 &&
          Math.max(candidate.breakdown.speciesMuzzleScore ?? 0, candidate.breakdown.speciesSilhouetteScore ?? 0) >= 0.34
        )
      ));
  const catSparseOutlineFrontStrong =
    mascotSpecies === "cat" &&
    (candidate.breakdown.frontSymmetryScore ?? 0) >= 0.99 &&
    (candidate.breakdown.speciesScore ?? 0) >= 0.5 &&
    (candidate.breakdown.targetStyleScore ?? 0) >= 0.59 &&
    Math.max(candidate.breakdown.speciesMuzzleScore ?? 0, candidate.breakdown.speciesSilhouetteScore ?? 0) >= 0.66 &&
    (candidate.breakdown.headSquarenessScore ?? 0) >= 0.2 &&
    (candidate.breakdown.handRegionDensityScore ?? 0) >= 0.45 &&
    (candidate.breakdown.subjectFillRatio ?? 0) >= 0.09 &&
    (candidate.breakdown.subjectIsolationScore ?? 0) >= 0.14 &&
    (candidate.breakdown.largestComponentShare ?? 0) >= 0.18 &&
    (candidate.breakdown.significantComponentCount ?? Number.POSITIVE_INFINITY) <= 8;
  const catFrontHeadSquarenessFloor =
    mascotSpecies === "cat" &&
    (candidate.breakdown.frontSymmetryScore ?? 0) >= 0.98 &&
    (candidate.breakdown.speciesScore ?? 0) >= Math.max(0.5, profileThresholds.frontMasterMinSpeciesScore + 0.24) &&
    (candidate.breakdown.targetStyleScore ?? 0) >= Math.max(0.6, profileThresholds.frontMasterMinStyleScore + 0.2) &&
    (candidate.breakdown.speciesEarScore ?? 0) >= 0.24 &&
    (candidate.breakdown.speciesMuzzleScore ?? 0) >= 0.68 &&
    (candidate.breakdown.speciesSilhouetteScore ?? 0) >= 0.72
      ? Math.max(0.25, profileThresholds.frontMasterMinHeadSquarenessScore - 0.01)
      : catSparseOutlineFrontStrong
        ? Math.max(0.2, profileThresholds.frontMasterMinHeadSquarenessScore - 0.06)
        : profileThresholds.frontMasterMinHeadSquarenessScore;

  return (
    (candidate.breakdown.frontSymmetryScore ?? 0) >= profileThresholds.minFrontSymmetryScore &&
    (candidate.breakdown.headSquarenessScore ?? 0) >= catFrontHeadSquarenessFloor &&
    (candidate.breakdown.speciesScore ?? 0) >= profileThresholds.frontMasterMinSpeciesScore &&
    (candidate.breakdown.targetStyleScore ?? 0) >= profileThresholds.frontMasterMinStyleScore &&
    dogFrontSupportStrong &&
    wolfFrontSupportStrong
  );
}

export function assessAutoSelectionRiskWithDeps(input: any, deps: any) {
  const {
    isMascotTargetStyle,
    summarizeMascotReferenceBankDiagnostics,
    computeMascotGeometryCue,
    computeMetricSpread,
    CHARACTER_VIEWS
  } = deps;

  if (!isMascotTargetStyle(input.targetStyle) || input.packCoherence.severity === "none") {
    return {
      level: "none",
      reasonCodes: [],
      summary: "selection risk clear"
    };
  }

  const reasons = new Set();
  const selectionThresholds = resolveMascotSelectionRiskThresholds(input.speciesId, deps);
  const referenceBankDiagnostics = summarizeMascotReferenceBankDiagnostics(input.speciesId);
  const front = input.selectedByView.front;
  const threeQuarter = input.selectedByView.threeQuarter;
  const profile = input.selectedByView.profile;
  const metrics = input.packCoherence.metrics;
  const frontSymmetryScore = metrics.frontSymmetryScore ?? front?.breakdown.frontSymmetryScore ?? 1;
  const frontHeadSquarenessScore = metrics.frontHeadSquarenessScore ?? front?.breakdown.headSquarenessScore ?? 1;
  const frontStyleScore = metrics.frontStyleScore ?? front?.breakdown.targetStyleScore ?? 1;
  const frontSpeciesScore = metrics.frontSpeciesScore ?? front?.breakdown.speciesScore ?? 1;
  const threeQuarterGeometryCue = metrics.threeQuarterGeometryCue ?? computeMascotGeometryCue(threeQuarter) ?? 1;
  const profileGeometryCue = metrics.profileGeometryCue ?? computeMascotGeometryCue(profile) ?? 1;
  const threeQuarterConsistency = metrics.threeQuarterConsistency ?? threeQuarter?.consistencyScore ?? 1;
  const profileConsistency = metrics.profileConsistency ?? profile?.consistencyScore ?? 1;
  const speciesSpread =
    metrics.speciesSpread ??
    computeMetricSpread([
      front?.breakdown.speciesScore,
      threeQuarter?.breakdown.speciesScore,
      profile?.breakdown.speciesScore
    ]);
  const styleSpread =
    metrics.styleSpread ??
    computeMetricSpread([
      front?.breakdown.targetStyleScore,
      threeQuarter?.breakdown.targetStyleScore,
      profile?.breakdown.targetStyleScore
    ]);
  const headRatioSpread =
    metrics.headRatioSpread ??
    computeMetricSpread([
      front?.breakdown.headRatioScore,
      threeQuarter?.breakdown.headRatioScore,
      profile?.breakdown.headRatioScore
    ]);
  const monochromeSpread =
    metrics.monochromeSpread ??
    computeMetricSpread([
      front?.breakdown.monochromeScore,
      threeQuarter?.breakdown.monochromeScore,
      profile?.breakdown.monochromeScore
    ]);
  const earCueSpread =
    metrics.earCueSpread ??
    computeMetricSpread([
      front?.breakdown.speciesEarScore,
      threeQuarter?.breakdown.speciesEarScore,
      profile?.breakdown.speciesEarScore
    ]);
  const muzzleCueSpread =
    metrics.muzzleCueSpread ??
    computeMetricSpread([
      front?.breakdown.speciesMuzzleScore,
      threeQuarter?.breakdown.speciesMuzzleScore,
      profile?.breakdown.speciesMuzzleScore
    ]);
  const headShapeCueSpread =
    metrics.headShapeCueSpread ??
    computeMetricSpread([
      front?.breakdown.speciesHeadShapeScore,
      threeQuarter?.breakdown.speciesHeadShapeScore,
      profile?.breakdown.speciesHeadShapeScore
    ]);
  const silhouetteCueSpread =
    metrics.silhouetteCueSpread ??
    computeMetricSpread([
      front?.breakdown.speciesSilhouetteScore,
      threeQuarter?.breakdown.speciesSilhouetteScore,
      profile?.breakdown.speciesSilhouetteScore
    ]);
  const totalWarnings = Object.values(input.selectedByView).reduce(
    (sum: number, candidate: any) => sum + (candidate?.warnings.length ?? 0),
    0
  );
  const totalRejections = Object.values(input.selectedByView).reduce(
    (sum: number, candidate: any) => sum + (candidate?.rejections.length ?? 0),
    0
  );
  const runtimeCriticalViews = CHARACTER_VIEWS.filter((view: any) => {
    const candidate = input.selectedByView[view];
    return (
      candidate?.rejections.includes("runtime_preflight_failed") ||
      candidate?.rejections.includes("runtime_structure_missing")
    );
  });
  const runtimeWarningViews = CHARACTER_VIEWS.filter((view: any) => {
    const candidate = input.selectedByView[view];
    return candidate?.warnings.some((reason: string) => reason.startsWith("runtime_")) ?? false;
  });
  const runtimeFallbackViews = CHARACTER_VIEWS.filter((view: any) => {
    const candidate = input.selectedByView[view];
    return (
      candidate?.warnings.includes("runtime_fallback_used") ||
      candidate?.warnings.includes("runtime_route_degraded")
    );
  });
  const totalRuntimeWarnings = Object.values(input.selectedByView).reduce(
    (sum: number, candidate: any) => sum + (candidate?.warnings.filter((reason: string) => reason.startsWith("runtime_")).length ?? 0),
    0
  );

  if (
    !isStrongFrontMasterCandidateWithDeps(
      {
        candidate: front,
        targetStyle: input.targetStyle,
        acceptedScoreThreshold: input.acceptedScoreThreshold,
        speciesId: input.speciesId
      },
      deps
    )
  ) {
    reasons.add("front_anchor_soft");
  }
  if ((metrics.frontAnchorScore ?? 1) < selectionThresholds.frontAnchorScoreSoftFloor) {
    reasons.add("front_anchor_soft");
  }
  if (
    frontSymmetryScore < selectionThresholds.frontSymmetrySoftFloor ||
    frontHeadSquarenessScore < selectionThresholds.frontHeadSquarenessSoftFloor
  ) {
    reasons.add("front_geometry_soft");
  }
  if (frontStyleScore < selectionThresholds.frontStyleSoftFloor) {
    reasons.add("front_style_soft");
  }
  if (frontSpeciesScore < selectionThresholds.frontSpeciesSoftFloor) {
    reasons.add("front_species_soft");
  }
  if (threeQuarterGeometryCue < selectionThresholds.threeQuarterGeometrySoftFloor) {
    reasons.add("three_quarter_geometry_soft");
  }
  if (
    (threeQuarter?.consistencyScore ?? 1) < selectionThresholds.threeQuarterConsistencySoftFloor ||
    threeQuarterConsistency < selectionThresholds.threeQuarterConsistencySoftFloor
  ) {
    reasons.add("three_quarter_consistency_soft");
  }
  if (profileGeometryCue < selectionThresholds.profileGeometrySoftFloor) {
    reasons.add("profile_geometry_soft");
  }
  if (
    (profile?.consistencyScore ?? 1) < selectionThresholds.profileConsistencySoftFloor ||
    profileConsistency < selectionThresholds.profileConsistencySoftFloor
  ) {
    reasons.add("profile_consistency_soft");
  }
  if (typeof speciesSpread === "number" && speciesSpread > selectionThresholds.speciesSpreadSoftCeiling) {
    reasons.add("species_spread_soft");
  }
  if (typeof styleSpread === "number" && styleSpread > selectionThresholds.styleSpreadSoftCeiling) {
    reasons.add("style_spread_soft");
  }
  if (typeof headRatioSpread === "number" && headRatioSpread > selectionThresholds.headRatioSpreadSoftCeiling) {
    reasons.add("head_ratio_spread_soft");
  }
  if (typeof monochromeSpread === "number" && monochromeSpread > selectionThresholds.monochromeSpreadSoftCeiling) {
    reasons.add("monochrome_spread_soft");
  }
  if (typeof earCueSpread === "number" && earCueSpread > selectionThresholds.earCueSpreadSoftCeiling) {
    reasons.add("ear_cue_spread_soft");
  }
  if (typeof muzzleCueSpread === "number" && muzzleCueSpread > selectionThresholds.muzzleCueSpreadSoftCeiling) {
    reasons.add("muzzle_cue_spread_soft");
  }
  if (typeof headShapeCueSpread === "number" && headShapeCueSpread > selectionThresholds.headShapeCueSpreadSoftCeiling) {
    reasons.add("head_shape_cue_spread_soft");
  }
  if (typeof silhouetteCueSpread === "number" && silhouetteCueSpread > selectionThresholds.silhouetteCueSpreadSoftCeiling) {
    reasons.add("silhouette_cue_spread_soft");
  }
  if (referenceBankDiagnostics.status === "scaffold_only") {
    reasons.add("reference_bank_scaffold_only");
  }
  if (
    totalWarnings >= 4 ||
    Object.values(input.selectedByView).filter((candidate: any) => (candidate?.warnings.length ?? 0) > 0).length >= 2
  ) {
    reasons.add("selected_warning_density_high");
  }
  if (totalRejections > 0) {
    reasons.add("selected_rejections_present");
  }
  if (input.autoReroute?.attempted && input.autoReroute.recovered === false) {
    reasons.add("auto_reroute_failed");
  }
  if (input.rigStability?.reviewOnly) {
    reasons.add("rig_review_only");
  }
  if (input.rigStability?.reasonCodes.some((reason: string) => reason.startsWith("rig-anchor-"))) {
    reasons.add("rig_anchor_confidence_soft");
  }
  if (input.rigStability?.reasonCodes.some((reason: string) => reason.startsWith("rig-landmark-"))) {
    reasons.add("rig_landmark_consistency_soft");
  }
  if (runtimeCriticalViews.length > 0 || runtimeWarningViews.length >= 2 || totalRuntimeWarnings >= 3) {
    reasons.add("runtime_quality_compounded");
  }
  if (runtimeFallbackViews.length > 0) {
    reasons.add("runtime_fallback_selected");
  }

  const reasonCodes = [...reasons] as string[];
  if (reasonCodes.length === 0) {
    return {
      level: "none",
      reasonCodes,
      summary: "selection risk clear"
    };
  }

  const frontRiskCount = reasonCodes.filter((reason: string) =>
    reason === "front_anchor_soft" ||
    reason === "front_geometry_soft" ||
    reason === "front_style_soft" ||
    reason === "front_species_soft"
  ).length;
  const spreadRiskCount = reasonCodes.filter((reason: string) => reason.endsWith("_spread_soft")).length;
  const runtimeCompoundedHard =
    runtimeCriticalViews.includes("front") || runtimeCriticalViews.length >= 2 || totalRuntimeWarnings >= 4;
  const block =
    input.rigStability?.severity === "block" ||
    reasonCodes.includes("selected_rejections_present") ||
    reasonCodes.includes("auto_reroute_failed") ||
    (reasonCodes.includes("runtime_quality_compounded") && runtimeCompoundedHard) ||
    (reasonCodes.includes("reference_bank_scaffold_only") &&
      (frontRiskCount >= 1 ||
        reasonCodes.includes("front_style_soft") ||
        reasonCodes.includes("front_species_soft") ||
        spreadRiskCount >= 1)) ||
    spreadRiskCount >= 3 ||
    (frontRiskCount >= 2 && spreadRiskCount >= 1) ||
    frontRiskCount >= 2 ||
    reasonCodes.length >= 4;

  const rigRequiresRecreate =
    input.rigStability?.repairability === "recreate" ||
    (input.rigStability?.reasonFamilies ?? []).includes("recreate_required");

  return {
    level: block ? "block" : "review",
    reasonCodes,
    suggestedAction:
      block ||
      reasonCodes.includes("front_anchor_soft") ||
      reasonCodes.includes("auto_reroute_failed") ||
      rigRequiresRecreate ||
      input.rigStability?.severity === "block" ||
      (reasonCodes.includes("runtime_quality_compounded") &&
        (runtimeCriticalViews.includes("front") || runtimeFallbackViews.includes("front")))
        ? "recreate"
        : "pick-manually",
    summary: `${block ? "block" : "review"}:${reasonCodes.join(",")}`
  };
}

export function assessQualityEmbargoWithDeps(input: any, deps: any) {
  const {
    isMascotTargetStyle,
    shouldDowngradeCatSelectedThreeQuarterRepairBlock,
    shouldDowngradeSelectedCanineSoftHeadBlock,
    summarizeObservedDefectFamilies,
    isCriticalObservedDefectFamily,
    extractCandidateRuntimeQualityDiagnostics
  } = deps;

  if (!isMascotTargetStyle(input.targetStyle)) {
    return {
      level: "none",
      reasonCodes: [],
      summary: "quality embargo clear"
    };
  }

  const hardReasonPattern =
    /fragmented_or_multi_object_front|text_or_watermark_high_risk|mascot_identity_too_weak|head_shape_breakdown|subject_isolation_low|species_breakdown|face_or_eyes_region_unstable/i;
  const blockingViews = new Set();
  const warningViews = new Set();
  const reasons = new Set();
  const defectFamiliesByView: Record<string, unknown> = {};
  const identityViews: any[] = [];
  const styleViews: any[] = [];
  const silhouetteViews: any[] = [];
  const pawsViews: any[] = [];
  const runtimeCriticalViews: any[] = [];
  const runtimeSoftViews: any[] = [];

  for (const view of ["front", "threeQuarter", "profile"] as const) {
    const candidate = input.selectedByView[view];
    if (!candidate) {
      blockingViews.add(view);
      reasons.add(`missing:${view}`);
      continue;
    }

    const downgradeSelectedRepairBlock = shouldDowngradeCatSelectedThreeQuarterRepairBlock({
      candidate,
      speciesId: input.speciesId
    });
    const downgradeCanineSoftHeadBlock = shouldDowngradeSelectedCanineSoftHeadBlock({
      candidate,
      speciesId: input.speciesId
    });
    const families = summarizeObservedDefectFamilies(candidate).filter(
      (family: string) =>
        (!downgradeSelectedRepairBlock || !isCriticalObservedDefectFamily(family)) &&
        (!downgradeCanineSoftHeadBlock || family !== "head")
    );
    if (families.length > 0) {
      defectFamiliesByView[view] = families;
    }
    if (families.includes("identity")) {
      identityViews.push(view);
    }
    if (families.includes("style")) {
      styleViews.push(view);
    }
    if (families.includes("silhouette")) {
      silhouetteViews.push(view);
    }
    if (families.includes("paws")) {
      pawsViews.push(view);
    }

    const filteredRejections = downgradeSelectedRepairBlock
      ? candidate.rejections.filter(
          (reason: string) => reason !== "threequarter_front_collapse" && reason !== "inconsistent_with_front_baseline"
        )
      : candidate.rejections;
    const filteredWarnings = downgradeSelectedRepairBlock
      ? candidate.warnings.filter((reason: string) => reason !== "text_or_watermark_high_risk")
      : candidate.warnings;
    const candidateReasons = [...filteredRejections, ...filteredWarnings];
    const hasHardReason = candidateReasons.some((reason: string) => hardReasonPattern.test(reason));
    const runtimeDiagnostics = extractCandidateRuntimeQualityDiagnostics({
      candidate: candidate.candidate,
      targetStyle: input.targetStyle
    });
    const runtimeCritical =
      candidate.rejections.includes("runtime_preflight_failed") ||
      candidate.rejections.includes("runtime_structure_missing");
    const runtimeSoftReasons = candidate.warnings.filter((reason: string) => reason.startsWith("runtime_"));
    const runtimeFallbackOrRoute =
      candidate.warnings.includes("runtime_fallback_used") || candidate.warnings.includes("runtime_route_degraded");
    if (hasHardReason) {
      blockingViews.add(view);
      reasons.add(`hard-defect:${view}`);
    }
    if (runtimeCritical) {
      runtimeCriticalViews.push(view);
      blockingViews.add(view);
      reasons.add(`runtime-hard:${view}`);
    } else if (runtimeSoftReasons.length > 0) {
      runtimeSoftViews.push(view);
      warningViews.add(view);
      reasons.add(runtimeFallbackOrRoute ? `runtime-fallback:${view}` : `runtime-review:${view}`);
    }

    if (
      filteredRejections.length > 0 &&
      families.some((family: string) => family === "identity" || family === "head" || family === "silhouette" || family === "style")
    ) {
      blockingViews.add(view);
      reasons.add(`rejections:${view}`);
    }

    if (view === "front") {
      if (
        families.includes("identity") &&
        (candidate.score < input.acceptedScoreThreshold + 0.03 ||
          candidate.rejections.length > 0 ||
          input.autoReroute?.recovered === false)
      ) {
        blockingViews.add(view);
        reasons.add("front_identity_embargo");
      }
      if (families.includes("silhouette")) {
        blockingViews.add(view);
        reasons.add("front_silhouette_embargo");
      }
      if (runtimeCritical || (runtimeFallbackOrRoute && input.autoReroute?.attempted && input.autoReroute.recovered === false)) {
        blockingViews.add(view);
        reasons.add("front_runtime_embargo");
      }
    } else if (
      families.includes("identity") &&
      (candidate.consistencyScore ?? 1) < (view === "profile" ? 0.47 : 0.52)
    ) {
      warningViews.add(view);
      reasons.add(`identity_review:${view}`);
    }

    if (input.rigStability?.blockingViews.includes(view)) {
      blockingViews.add(view);
      reasons.add(view === "front" ? "rig_front_anchor_embargo" : `rig_landmark_embargo:${view}`);
    } else if (input.rigStability?.warningViews.includes(view)) {
      warningViews.add(view);
      reasons.add(view === "front" ? "rig_front_anchor_review" : `rig_landmark_review:${view}`);
    }

    if (
      runtimeDiagnostics.workflowStage === "repair_refine" &&
      (runtimeCritical || runtimeFallbackOrRoute || runtimeSoftReasons.length >= 2)
    ) {
      blockingViews.add(view);
      reasons.add("runtime_repair_structure_embargo");
    }
    if (
      runtimeDiagnostics.workflowStage === "identity_lock_refine" &&
      (runtimeCritical || runtimeFallbackOrRoute || runtimeSoftReasons.length > 0)
    ) {
      if (view === "front") {
        blockingViews.add(view);
      } else {
        warningViews.add(view);
      }
      reasons.add("runtime_lock_structure_embargo");
    }

    if (families.includes("style") || families.includes("paws") || families.includes("body")) {
      warningViews.add(view);
    }
  }

  if (identityViews.length >= 2) {
    for (const view of identityViews) {
      blockingViews.add(view);
    }
    reasons.add("pack_identity_drift_embargo");
  }
  if (styleViews.length >= 2 && input.autoReroute?.attempted) {
    for (const view of styleViews) {
      warningViews.add(view);
    }
    reasons.add(input.autoReroute.recovered === false ? "pack_style_drift_after_reroute" : "pack_style_drift_review");
  }
  if (silhouetteViews.includes("front")) {
    reasons.add("front_shape_readability_embargo");
  }
  if (pawsViews.length >= 2) {
    reasons.add("pack_paw_cleanup_review");
  }
  if (runtimeCriticalViews.length >= 2) {
    reasons.add("pack_runtime_embargo");
  } else if (runtimeSoftViews.length >= 2) {
    reasons.add("pack_runtime_review");
  }
  if (input.rigStability?.reviewOnly) {
    reasons.add("rig_review_only");
  }

  const level = blockingViews.size > 0 ? "block" : warningViews.size > 0 || reasons.size > 0 ? "review" : "none";
  const rigRequiresRecreate =
    input.rigStability?.repairability === "recreate" ||
    (input.rigStability?.reasonFamilies ?? []).includes("recreate_required");
  const suggestedAction =
    level === "block"
      ? blockingViews.has("front") || blockingViews.size >= 2 || rigRequiresRecreate
        ? "recreate"
        : "pick-manually"
      : level === "review"
        ? "pick-manually"
        : undefined;
  const summary =
    level === "block"
      ? `quality embargo blocked pack: ${[...reasons].join(", ")}`
      : level === "review"
        ? `quality embargo requires review: ${[...reasons].join(", ")}`
        : "quality embargo clear";

  return {
    level,
    reasonCodes: [...reasons],
    summary,
    ...(suggestedAction ? { suggestedAction } : {}),
    ...(blockingViews.size > 0 ? { blockingViews: [...blockingViews] } : {}),
    ...(warningViews.size > 0 ? { warningViews: [...warningViews] } : {}),
    ...(Object.keys(defectFamiliesByView).length > 0 ? { defectFamiliesByView } : {})
  };
}

export function assessFinalQualityFirewallWithDeps(input: any, deps: any) {
  const {
    CHARACTER_VIEWS,
    isMascotTargetStyle,
    shouldDowngradeCatSelectedThreeQuarterRepairBlock,
    shouldDowngradeSelectedCanineSoftHeadBlock,
    isCriticalObservedDefectFamily,
    isReviewObservedDefectFamily,
    extractCandidateRuntimeQualityDiagnostics
  } = deps;

  if (!isMascotTargetStyle(input.targetStyle)) {
    return {
      level: "none",
      reasonCodes: [],
      summary: "final quality firewall clear"
    };
  }

  const blockingViews = new Set();
  const warningViews = new Set();
  const reasons = new Set();
  const persistentFamiliesByView = input.packDefectSummary.persistentFamiliesByView ?? {};
  const defectFamiliesByView = input.packDefectSummary.defectFamiliesByView ?? {};
  const runtimeCriticalViews: any[] = [];
  const runtimeSoftViews: any[] = [];
  const runtimeFallbackViews: any[] = [];

  for (const view of CHARACTER_VIEWS) {
    const candidate = input.selectedByView[view];
    if (!candidate) {
      blockingViews.add(view);
      reasons.add(`missing:${view}`);
      continue;
    }
    const downgradeSelectedRepairBlock = shouldDowngradeCatSelectedThreeQuarterRepairBlock({
      candidate,
      speciesId: input.speciesId
    });
    const downgradeCanineSoftHeadBlock = shouldDowngradeSelectedCanineSoftHeadBlock({
      candidate,
      speciesId: input.speciesId
    });
    const families = (defectFamiliesByView[view] ?? []).filter(
      (family: string) =>
        (!downgradeSelectedRepairBlock || !isCriticalObservedDefectFamily(family)) &&
        (!downgradeCanineSoftHeadBlock || family !== "head")
    );
    const persistentFamilies = (persistentFamiliesByView[view] ?? []).filter(
      (family: string) =>
        (!downgradeSelectedRepairBlock || !isCriticalObservedDefectFamily(family)) &&
        (!downgradeCanineSoftHeadBlock || family !== "head")
    );
    const filteredRejections = downgradeSelectedRepairBlock
      ? candidate.rejections.filter(
          (reason: string) => reason !== "threequarter_front_collapse" && reason !== "inconsistent_with_front_baseline"
        )
      : candidate.rejections;

    const runtimeCritical =
      candidate.rejections.includes("runtime_preflight_failed") ||
      candidate.rejections.includes("runtime_structure_missing");
    const runtimeDiagnostics = extractCandidateRuntimeQualityDiagnostics({
      candidate: candidate.candidate,
      targetStyle: input.targetStyle
    });
    const runtimeSoft = candidate.warnings.filter((reason: string) => reason.startsWith("runtime_"));
    const runtimeFallbackOrRoute =
      candidate.warnings.includes("runtime_fallback_used") || candidate.warnings.includes("runtime_route_degraded");
    if (runtimeCritical) {
      runtimeCriticalViews.push(view);
      blockingViews.add(view);
      reasons.add(`runtime-critical:${view}`);
    } else if (runtimeSoft.length > 0) {
      runtimeSoftViews.push(view);
      warningViews.add(view);
      reasons.add(`runtime-soft:${view}`);
    }
    if (runtimeFallbackOrRoute) {
      runtimeFallbackViews.push(view);
      warningViews.add(view);
      reasons.add(`runtime-fallback:${view}`);
    }
    if (
      runtimeDiagnostics.workflowStage === "repair_refine" &&
      (runtimeCritical || runtimeFallbackOrRoute || runtimeSoft.length >= 2)
    ) {
      blockingViews.add(view);
      reasons.add(`runtime-repair-stage:${view}`);
    }
    if (
      runtimeDiagnostics.workflowStage === "identity_lock_refine" &&
      (runtimeCritical || runtimeFallbackOrRoute || runtimeSoft.length > 0)
    ) {
      if (view === "front") {
        blockingViews.add(view);
      } else {
        warningViews.add(view);
      }
      reasons.add(`runtime-lock-stage:${view}`);
    }

    if (input.rigStability?.blockingViews.includes(view)) {
      blockingViews.add(view);
      reasons.add(`rig-firewall:${view}`);
    } else if (input.rigStability?.warningViews.includes(view)) {
      warningViews.add(view);
      reasons.add(`rig-review:${view}`);
    }

    if (
      filteredRejections.length > 0 &&
      families.some((family: string) => isCriticalObservedDefectFamily(family) || family === "style")
    ) {
      blockingViews.add(view);
      reasons.add(`rejected-critical:${view}`);
    }

    if (view === "front") {
      const frontCritical = families.filter((family: string) => isCriticalObservedDefectFamily(family));
      const frontPersistentCritical = persistentFamilies.filter((family: string) => isCriticalObservedDefectFamily(family));
      if (
        frontCritical.length > 0 &&
        (frontPersistentCritical.length > 0 ||
          candidate.score < input.acceptedScoreThreshold + 0.04 ||
          input.autoReroute?.recovered === false)
      ) {
        blockingViews.add("front");
        reasons.add(
          frontPersistentCritical.length > 0 ? "front_persistent_critical_defect" : "front_critical_defect_firewall"
        );
      }
      if (
        runtimeCritical ||
        (runtimeFallbackOrRoute &&
          (input.selectionRisk?.level === "block" ||
            input.autoReroute?.recovered === false ||
            input.packCoherence?.severity === "block"))
      ) {
        blockingViews.add("front");
        reasons.add(runtimeCritical ? "front_runtime_firewall" : "front_runtime_compounded");
      }
    } else if (
      persistentFamilies.some((family: string) => isCriticalObservedDefectFamily(family)) &&
      (candidate.consistencyScore ?? 1) < (view === "profile" ? 0.49 : 0.54)
    ) {
      blockingViews.add(view);
      reasons.add(`persistent_side_critical:${view}`);
    }

    if (
      persistentFamilies.some((family: string) => isReviewObservedDefectFamily(family)) ||
      (families.some((family: string) => family === "style" || family === "paws" || family === "body") &&
        candidate.warnings.length >= 2)
    ) {
      warningViews.add(view);
      reasons.add(`persistent_soft:${view}`);
    }
    if (
      (runtimeCritical || runtimeSoft.length > 0) &&
      persistentFamilies.some((family: string) => isCriticalObservedDefectFamily(family))
    ) {
      blockingViews.add(view);
      reasons.add(view === "front" ? "runtime_front_with_persistent_critical" : `runtime_with_persistent_critical:${view}`);
    }
  }

  for (const family of input.packDefectSummary.blockingFamilies) {
    reasons.add(`repeated-critical:${family}`);
    for (const view of CHARACTER_VIEWS) {
      if (defectFamiliesByView[view]?.includes(family)) {
        blockingViews.add(view);
      }
    }
  }
  for (const family of input.packDefectSummary.warningFamilies) {
    reasons.add(`repeated-soft:${family}`);
    for (const view of CHARACTER_VIEWS) {
      if (defectFamiliesByView[view]?.includes(family) && !blockingViews.has(view)) {
        warningViews.add(view);
      }
    }
  }

  if (
    input.packCoherence?.severity === "block" &&
    (input.packDefectSummary.repeatedFamilies.length > 0 || Object.keys(persistentFamiliesByView).length > 0)
  ) {
    reasons.add("coherence_with_repeated_defects");
    for (const view of input.packCoherence.blockingViews) {
      blockingViews.add(view);
    }
  } else if (
    input.packCoherence?.severity === "review" &&
    (input.packDefectSummary.repeatedFamilies.length > 0 || Object.keys(persistentFamiliesByView).length > 0)
  ) {
    reasons.add("coherence_review_with_defects");
    for (const view of input.packCoherence.warningViews) {
      if (!blockingViews.has(view)) {
        warningViews.add(view);
      }
    }
  }

  if (
    input.selectionRisk?.level === "block" &&
    (input.packDefectSummary.repeatedFamilies.includes("identity") ||
      (persistentFamiliesByView.front?.some((family: string) => isCriticalObservedDefectFamily(family)) ?? false))
  ) {
    blockingViews.add("front");
    reasons.add("selection_risk_compounded_front");
  }

  if (
    input.qualityEmbargo?.level === "review" &&
    input.packDefectSummary.repeatedFamilies.some((family: string) => family === "style" || family === "body" || family === "paws")
  ) {
    reasons.add("embargo_review_compounded");
  }
  if (runtimeCriticalViews.length >= 2) {
    reasons.add("pack_runtime_failure");
    for (const view of runtimeCriticalViews) {
      blockingViews.add(view);
    }
  } else if (runtimeSoftViews.length >= 2 || runtimeFallbackViews.length >= 2) {
    reasons.add("pack_runtime_degradation");
    for (const view of [...runtimeSoftViews, ...runtimeFallbackViews]) {
      if (!blockingViews.has(view)) {
        warningViews.add(view);
      }
    }
  }
  if (
    input.selectionRisk?.reasonCodes.includes("runtime_quality_compounded") &&
    (runtimeCriticalViews.includes("front") || runtimeFallbackViews.includes("front"))
  ) {
    blockingViews.add("front");
    reasons.add("selection_risk_compounded_runtime");
  }
  if (
    input.rigStability?.severity === "block" &&
    (input.rigStability.blockingViews.includes("front") || input.rigStability.blockingViews.length >= 2)
  ) {
    reasons.add("rig_stability_compounded");
  } else if (input.rigStability?.reviewOnly) {
    reasons.add("rig_review_only");
  }

  const level = blockingViews.size > 0 ? "block" : warningViews.size > 0 || reasons.size > 0 ? "review" : "none";
  const rigRequiresRecreate =
    input.rigStability?.repairability === "recreate" ||
    (input.rigStability?.reasonFamilies ?? []).includes("recreate_required");
  const suggestedAction =
    level === "block"
      ? blockingViews.has("front") || blockingViews.size >= 2 || rigRequiresRecreate
        ? "recreate"
        : "pick-manually"
      : level === "review"
        ? warningViews.has("front") || input.packDefectSummary.repeatedFamilies.length >= 2 || rigRequiresRecreate
          ? "recreate"
          : "pick-manually"
        : undefined;
  const summary =
    level === "block"
      ? `final quality firewall blocked pack: ${[...reasons].join(", ")}`
      : level === "review"
        ? `final quality firewall requires review: ${[...reasons].join(", ")}`
        : "final quality firewall clear";

  return {
    level,
    reasonCodes: [...reasons],
    summary,
    ...(suggestedAction ? { suggestedAction } : {}),
    ...(blockingViews.size > 0 ? { blockingViews: [...blockingViews] } : {}),
    ...(warningViews.size > 0 ? { warningViews: [...warningViews] } : {}),
    ...(input.packDefectSummary.repeatedFamilies.length > 0
      ? { repeatedFamilies: input.packDefectSummary.repeatedFamilies }
      : {}),
    ...(Object.keys(persistentFamiliesByView).length > 0 ? { persistentFamiliesByView } : {})
  };
}
