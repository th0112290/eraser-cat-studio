import type {
  DeterministicSequence,
  EpisodeFinishProfile,
  EpisodeRegressionCheck,
  EpisodeRegressionIssue,
  EpisodeRegressionReport
} from "./types";

function round(value: number): number {
  return Number(value.toFixed(3));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function countBy(values: Array<string | undefined | null>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (typeof value !== "string" || value.trim().length === 0) {
      continue;
    }
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function computeRectDelta(
  left: { x: number; y: number; width: number; height: number } | undefined,
  right: { x: number; y: number; width: number; height: number } | undefined
): number | null {
  if (!left || !right) {
    return null;
  }
  return round(
    Math.abs(left.x - right.x) +
      Math.abs(left.y - right.y) +
      Math.abs(left.width - right.width) +
      Math.abs(left.height - right.height)
  );
}

function computePositionDelta(left: DeterministicSequence, right: DeterministicSequence): number {
  const dx = left.characterX - right.characterX;
  const dy = left.characterY - right.characterY;
  return round(Math.hypot(dx, dy));
}

function computeFinishDriftScore(left: DeterministicSequence, right: DeterministicSequence): number | null {
  const leftFinish = left.finishProfile;
  const rightFinish = right.finishProfile;
  if (!leftFinish || !rightFinish) {
    return null;
  }

  const score =
    Math.abs(leftFinish.grainOpacity - rightFinish.grainOpacity) * 1.1 +
    Math.abs(leftFinish.scanlineOpacity - rightFinish.scanlineOpacity) * 0.8 +
    Math.abs(leftFinish.vignetteOpacity - rightFinish.vignetteOpacity) * 0.7 +
    Math.abs(leftFinish.tintOpacity - rightFinish.tintOpacity) * 0.9 +
    Math.abs(leftFinish.bloomOpacity - rightFinish.bloomOpacity) * 0.8 +
    Math.abs(leftFinish.sharpenOpacity - rightFinish.sharpenOpacity) * 0.9 +
    Math.abs(leftFinish.toneOverlayOpacity - rightFinish.toneOverlayOpacity) * 0.7 +
    Math.abs(leftFinish.textureMatchOpacity - rightFinish.textureMatchOpacity) * 0.6 +
    Math.abs(leftFinish.paletteContinuityOpacity - rightFinish.paletteContinuityOpacity) * 0.6 +
    Math.abs(leftFinish.linePreserveOpacity - rightFinish.linePreserveOpacity) * 0.6 +
    (leftFinish.toneOverlayColor !== rightFinish.toneOverlayColor ? 0.12 : 0);
  return round(score);
}

function pushIssue(
  issues: EpisodeRegressionIssue[],
  code: string,
  severity: "INFO" | "WARN" | "ERROR",
  message: string,
  shotIds?: string[],
  details?: Record<string, unknown>
) {
  issues.push({
    code,
    severity,
    message,
    ...(shotIds && shotIds.length > 0 ? { shotIds } : {}),
    ...(details ? { details } : {})
  });
}

function pushCheck(
  checks: EpisodeRegressionCheck[],
  name: string,
  passed: boolean,
  severity: "WARN" | "ERROR",
  details: string
) {
  checks.push({
    name,
    passed,
    severity,
    details
  });
}

function isTalkLike(sequence: DeterministicSequence): boolean {
  return sequence.shotType === "talk" || sequence.shotType === "reaction";
}

function classifyIntentFamily(family: string | undefined): "summary" | "data" | "diagram" | "risk" | "generic" {
  switch (family) {
    case "summary_focus":
      return "summary";
    case "chart_primary":
    case "timeline_metric":
    case "comparison_focus":
      return "data";
    case "diagram_primary":
      return "diagram";
    case "risk_focus":
      return "risk";
    default:
      return "generic";
  }
}

function resolveNarrationBoxDeltaThreshold(left: DeterministicSequence, right: DeterministicSequence): number {
  const leftFamily = left.visualPlan?.selected_intent_family;
  const rightFamily = right.visualPlan?.selected_intent_family;
  if (!leftFamily || !rightFamily) {
    return 240;
  }
  if (leftFamily === rightFamily) {
    return leftFamily === "diagram_primary" ? 760 : 280;
  }
  const leftClass = classifyIntentFamily(leftFamily);
  const rightClass = classifyIntentFamily(rightFamily);
  if (
    (leftClass === "summary" && (rightClass === "data" || rightClass === "diagram")) ||
    (rightClass === "summary" && (leftClass === "data" || leftClass === "diagram"))
  ) {
    return 760;
  }
  if (
    (leftClass === "diagram" && rightClass === "risk") ||
    (leftClass === "risk" && rightClass === "diagram")
  ) {
    return 760;
  }
  return 240;
}

function resolvePrimaryVisualBoxDeltaThreshold(left: DeterministicSequence, right: DeterministicSequence): number {
  const leftFamily = left.visualPlan?.selected_intent_family;
  const rightFamily = right.visualPlan?.selected_intent_family;
  if (!leftFamily || !rightFamily) {
    return 360;
  }
  if (leftFamily === rightFamily) {
    return leftFamily === "diagram_primary" ? 920 : 420;
  }
  const leftClass = classifyIntentFamily(leftFamily);
  const rightClass = classifyIntentFamily(rightFamily);
  if (leftClass === "data" && rightClass === "data") {
    return 420;
  }
  if (
    (leftClass === "summary" && rightClass === "diagram") ||
    (leftClass === "diagram" && rightClass === "summary")
  ) {
    return 420;
  }
  if (
    (leftClass === "diagram" && rightClass === "risk") ||
    (leftClass === "risk" && rightClass === "diagram")
  ) {
    return 760;
  }
  return 360;
}

export function buildEpisodeRegressionReport(input: {
  episodeId: string;
  sequences: DeterministicSequence[];
  episodeFinishProfile?: EpisodeFinishProfile;
}): EpisodeRegressionReport {
  const checks: EpisodeRegressionCheck[] = [];
  const issues: EpisodeRegressionIssue[] = [];
  const sequences = [...input.sequences].sort((left, right) => left.from - right.from);
  const adjacentPairs = sequences.slice(1).map((right, index) => ({
    left: sequences[index],
    right
  }));

  const finishProfileIds = [...new Set(sequences.map((sequence) => sequence.finishProfile?.id).filter(Boolean))] as string[];
  const mascotPackCounts = countBy(sequences.map((sequence) => sequence.characterPackId));
  const renderModeCounts = countBy(sequences.map((sequence) => sequence.renderMode));
  const primaryVisualKindCounts = countBy(
    sequences.map(
      (sequence) =>
        sequence.primaryVisualKind ?? sequence.visualObjects?.[0]?.kind ?? sequence.visualPlan?.selected_primary_kind
    )
  );
  const visualPlanShotCount = sequences.filter((sequence) => sequence.visualPlan).length;
  const visualPlanExpectedCount = sequences.filter(
    (sequence) =>
      sequence.visualPlan ||
      Boolean(sequence.primaryVisualKind) ||
      Boolean(sequence.insertAsset) ||
      (sequence.visualObjects?.length ?? 0) > 0
  ).length;
  const visualPlanMissingCount = Math.max(0, visualPlanExpectedCount - visualPlanShotCount);
  const visualPlannerResolverCounts = countBy(sequences.map((sequence) => sequence.visualPlan?.resolver_id));
  const visualIntentFamilyCounts = countBy(sequences.map((sequence) => sequence.visualPlan?.selected_intent_family));
  const visualInsertTypeCounts = countBy(sequences.map((sequence) => sequence.visualPlan?.selected_insert_type));
  const visualChannelDomainCounts = countBy(sequences.map((sequence) => sequence.visualPlan?.channel_domain));
  const visualPairCounts = countBy(
    sequences.map((sequence) => {
      if (!sequence.visualPlan) {
        return undefined;
      }
      return [
        sequence.visualPlan.selected_intent_family,
        sequence.visualPlan.selected_primary_kind ?? "none",
        sequence.visualPlan.selected_supporting_kind ?? "none",
        sequence.visualPlan.selected_insert_type ?? "none"
      ].join("::");
    })
  );
  const visualIntentTransitionCounts = countBy(
    adjacentPairs.map((pair) => {
      if (!pair.left.visualPlan || !pair.right.visualPlan) {
        return undefined;
      }
      return `${pair.left.visualPlan.selected_intent_family}->${pair.right.visualPlan.selected_intent_family}`;
    })
  );
  const alignedShotCount = sequences.filter((sequence) => sequence.alignment).length;

  let maxCharacterPositionDelta: number | null = null;
  let maxNarrationBoxDelta: number | null = null;
  let maxPrimaryVisualBoxDelta: number | null = null;
  let maxFinishDriftScore: number | null = null;
  let maxRenderPathTransitionDriftScore: number | null = null;

  for (const pair of adjacentPairs) {
    const positionDelta = computePositionDelta(pair.left, pair.right);
    maxCharacterPositionDelta =
      maxCharacterPositionDelta === null ? positionDelta : Math.max(maxCharacterPositionDelta, positionDelta);

    const narrationBoxDelta = computeRectDelta(pair.left.layoutPlan?.narrationBox, pair.right.layoutPlan?.narrationBox);
    const narrationBoxDeltaThreshold = resolveNarrationBoxDeltaThreshold(pair.left, pair.right);
    if (narrationBoxDelta !== null) {
      maxNarrationBoxDelta =
        maxNarrationBoxDelta === null ? narrationBoxDelta : Math.max(maxNarrationBoxDelta, narrationBoxDelta);
    }

    const primaryVisualBoxDelta = computeRectDelta(
      pair.left.layoutPlan?.primaryVisualBox,
      pair.right.layoutPlan?.primaryVisualBox
    );
    const primaryVisualBoxDeltaThreshold = resolvePrimaryVisualBoxDeltaThreshold(pair.left, pair.right);
    if (primaryVisualBoxDelta !== null) {
      maxPrimaryVisualBoxDelta =
        maxPrimaryVisualBoxDelta === null
          ? primaryVisualBoxDelta
          : Math.max(maxPrimaryVisualBoxDelta, primaryVisualBoxDelta);
    }

    const finishDriftScore = computeFinishDriftScore(pair.left, pair.right);
    if (finishDriftScore !== null) {
      maxFinishDriftScore =
        maxFinishDriftScore === null ? finishDriftScore : Math.max(maxFinishDriftScore, finishDriftScore);
      if (
        pair.left.finishProfile?.renderPathCompensation !== pair.right.finishProfile?.renderPathCompensation
      ) {
        maxRenderPathTransitionDriftScore =
          maxRenderPathTransitionDriftScore === null
            ? finishDriftScore
            : Math.max(maxRenderPathTransitionDriftScore, finishDriftScore);
      }
    }

    if (
      isTalkLike(pair.left) &&
      isTalkLike(pair.right) &&
      pair.left.characterPackId !== pair.right.characterPackId
    ) {
      pushIssue(
        issues,
        "mascot_pack_continuity_break",
        "ERROR",
        "Adjacent presenter shots switched character packs.",
        [pair.left.shotId, pair.right.shotId],
        {
          leftCharacterPackId: pair.left.characterPackId,
          rightCharacterPackId: pair.right.characterPackId
        }
      );
    }

    if (positionDelta > 0.24 && isTalkLike(pair.left) && isTalkLike(pair.right)) {
      pushIssue(
        issues,
        "blocking_position_jump",
        "WARN",
        "Adjacent presenter shots move the mascot blocking anchor too far.",
        [pair.left.shotId, pair.right.shotId],
        {
          positionDelta
        }
      );
    }

    if (narrationBoxDelta !== null && narrationBoxDelta > narrationBoxDeltaThreshold) {
      pushIssue(
        issues,
        "narration_box_continuity_jump",
        "WARN",
        "Narration box shifts too aggressively between adjacent shots.",
        [pair.left.shotId, pair.right.shotId],
        {
          narrationBoxDelta,
          allowedThreshold: narrationBoxDeltaThreshold,
          leftIntentFamily: pair.left.visualPlan?.selected_intent_family,
          rightIntentFamily: pair.right.visualPlan?.selected_intent_family
        }
      );
    }

    if (primaryVisualBoxDelta !== null && primaryVisualBoxDelta > primaryVisualBoxDeltaThreshold) {
      pushIssue(
        issues,
        "primary_visual_box_continuity_jump",
        "WARN",
        "Primary visual allocation changes too aggressively between adjacent shots.",
        [pair.left.shotId, pair.right.shotId],
        {
          primaryVisualBoxDelta,
          allowedThreshold: primaryVisualBoxDeltaThreshold,
          leftIntentFamily: pair.left.visualPlan?.selected_intent_family,
          rightIntentFamily: pair.right.visualPlan?.selected_intent_family
        }
      );
    }

    if (finishDriftScore !== null && finishDriftScore > 0.22) {
      pushIssue(
        issues,
        "finish_drift_spike",
        finishDriftScore > 0.34 ? "ERROR" : "WARN",
        "Adjacent shots diverge too much in finish normalization.",
        [pair.left.shotId, pair.right.shotId],
        {
          finishDriftScore,
          leftRenderPath: pair.left.finishProfile?.renderPathCompensation,
          rightRenderPath: pair.right.finishProfile?.renderPathCompensation
        }
      );
    }

    if (
      finishDriftScore !== null &&
      pair.left.finishProfile?.renderPathCompensation !== pair.right.finishProfile?.renderPathCompensation &&
      finishDriftScore > 0.18
    ) {
      pushIssue(
        issues,
        "render_path_transition_drift",
        "WARN",
        "Deterministic and sidecar shots are not normalized closely enough across a transition.",
        [pair.left.shotId, pair.right.shotId],
        {
          finishDriftScore,
          leftRenderPath: pair.left.finishProfile?.renderPathCompensation,
          rightRenderPath: pair.right.finishProfile?.renderPathCompensation
        }
      );
    }

    if (pair.left.alignment && !pair.right.alignment && isTalkLike(pair.right)) {
      pushIssue(
        issues,
        "alignment_coverage_gap",
        "WARN",
        "Alignment coverage drops between adjacent presenter shots.",
        [pair.left.shotId, pair.right.shotId]
      );
    }
  }

  if (visualPlanMissingCount > 0) {
    pushIssue(
      issues,
      "visual_plan_coverage_gap",
      "WARN",
      "Some visually planned shots are missing visual planner metadata.",
      sequences
        .filter(
          (sequence) =>
            !sequence.visualPlan &&
            (Boolean(sequence.primaryVisualKind) || Boolean(sequence.insertAsset) || (sequence.visualObjects?.length ?? 0) > 0)
        )
        .map((sequence) => sequence.shotId),
      {
        visualPlanMissingCount,
        visualPlanExpectedCount
      }
    );
  }

  const finishProfileMismatchCount = sequences.filter((sequence) => {
    const finishProfile = sequence.finishProfile;
    if (!finishProfile || !input.episodeFinishProfile) {
      return false;
    }
    return finishProfile.episodeFinishProfileId !== input.episodeFinishProfile.id;
  }).length;

  pushCheck(
    checks,
    "visual_plan_coverage",
    visualPlanMissingCount === 0,
    "WARN",
    visualPlanMissingCount === 0
      ? "All visually planned shots carry visual planner metadata."
      : `${visualPlanMissingCount} visually planned shots are missing visual_plan metadata.`
  );

  pushCheck(
    checks,
    "episode_finish_profile_consistency",
    finishProfileMismatchCount === 0,
    "ERROR",
    finishProfileMismatchCount === 0
      ? "All shots reference the resolved episode finish profile."
      : `${finishProfileMismatchCount} shots are missing the resolved episode finish profile id.`
  );

  pushCheck(
    checks,
    "mascot_pack_continuity",
    !issues.some((issue) => issue.code === "mascot_pack_continuity_break"),
    "ERROR",
    "Adjacent presenter shots should stay on the same mascot pack unless explicitly staging a character handoff."
  );

  pushCheck(
    checks,
    "finish_drift_regression",
    !issues.some((issue) => issue.code === "finish_drift_spike"),
    "WARN",
    "Adjacent finish profiles should remain within the continuity drift threshold."
  );

  pushCheck(
    checks,
    "layout_continuity",
    !issues.some(
      (issue) =>
        issue.code === "blocking_position_jump" ||
        issue.code === "narration_box_continuity_jump" ||
        issue.code === "primary_visual_box_continuity_jump"
    ),
    "WARN",
    "Mascot blocking, narration box, and primary visual boxes should stay stable across adjacent shots."
  );

  pushCheck(
    checks,
    "alignment_coverage",
    !issues.some((issue) => issue.code === "alignment_coverage_gap"),
    "WARN",
    "Talk-like shots should keep alignment coverage stable across the episode."
  );

  const errorCount = issues.filter((issue) => issue.severity === "ERROR").length;
  const warningCount = issues.filter((issue) => issue.severity === "WARN").length;

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    episode_id: input.episodeId,
    final_passed: errorCount === 0,
    error_count: errorCount,
    warning_count: warningCount,
    checks,
    issues,
    continuity_summary: {
      shot_count: sequences.length,
      adjacent_pair_count: adjacentPairs.length,
      visual_plan_shot_count: visualPlanShotCount,
      visual_plan_missing_count: visualPlanMissingCount,
      finish_profile_ids: finishProfileIds,
      episode_finish_profile_id: input.episodeFinishProfile?.id ?? null,
      mascot_pack_counts: mascotPackCounts,
      render_mode_counts: renderModeCounts,
      primary_visual_kind_counts: primaryVisualKindCounts,
      visual_planner_resolver_counts: visualPlannerResolverCounts,
      visual_intent_family_counts: visualIntentFamilyCounts,
      visual_insert_type_counts: visualInsertTypeCounts,
      visual_channel_domain_counts: visualChannelDomainCounts,
      visual_pair_counts: visualPairCounts,
      visual_intent_transition_counts: visualIntentTransitionCounts,
      max_character_position_delta: maxCharacterPositionDelta,
      max_narration_box_delta: maxNarrationBoxDelta,
      max_primary_visual_box_delta: maxPrimaryVisualBoxDelta,
      max_finish_drift_score: maxFinishDriftScore,
      max_render_path_transition_drift_score: maxRenderPathTransitionDriftScore,
      aligned_shot_count: alignedShotCount
    }
  };
}

export function summarizeEpisodeRegressionReport(report: EpisodeRegressionReport) {
  return {
    final_passed: report.final_passed,
    error_count: report.error_count,
    warning_count: report.warning_count,
    episode_finish_profile_id: report.continuity_summary.episode_finish_profile_id,
    max_finish_drift_score: report.continuity_summary.max_finish_drift_score,
    max_render_path_transition_drift_score: report.continuity_summary.max_render_path_transition_drift_score,
    visual_plan_shot_count: report.continuity_summary.visual_plan_shot_count,
    visual_plan_missing_count: report.continuity_summary.visual_plan_missing_count,
    visual_intent_family_counts: report.continuity_summary.visual_intent_family_counts,
    aligned_shot_count: report.continuity_summary.aligned_shot_count,
    shot_count: report.continuity_summary.shot_count
  };
}
