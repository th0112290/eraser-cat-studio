import type {
  DeterministicSequence,
  RenderQcInput,
  RenderSafeArea,
  VisualQcCheck,
  VisualQcIssue,
  VisualQcReport,
  VisualQcRun,
  VisualQcSeverity
} from "./types";
import { isBenchmarkedMotionPreset } from "@ec/profiles";
import {
  DEFAULT_OCCLUDER_BOX,
  applyLayoutContinuityToSequences,
  computePrimaryVisualAnchorInRect,
  resolvePrimaryVisualPointerTargetCount,
  resolveSequenceLayoutPlan
} from "./layoutPlan";

const FALLBACK_STEPS = [
  "simplify_chart",
  "remove_annotations",
  "switch_to_table",
  "freeze_character_pose"
] as const;

type FallbackStep = (typeof FALLBACK_STEPS)[number];

type VisualQcContext = {
  width: number;
  height: number;
  safeArea: RenderSafeArea;
  sequences: DeterministicSequence[];
  stage: string;
  qcInput?: RenderQcInput;
};

type VisualQcFallbackResult = {
  sequences: DeterministicSequence[];
  freezeCharacterPose: boolean;
  report: VisualQcReport;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toPxX(xNormalized: number, width: number): number {
  return clamp(xNormalized, 0, 1) * width;
}

function toPxY(yNormalized: number, height: number): number {
  return clamp(yNormalized, 0, 1) * height;
}

function estimateTextWidth(text: string, fontSize: number): number {
  return text.trim().length * fontSize * 0.56;
}

function normalizeText(text: string): string {
  return text.replace(/<<([^>]+)>>/g, "$1").replace(/\s+/g, " ").trim();
}

function resolveMotionProfileIdForQc(
  visualObject: NonNullable<DeterministicSequence["visualObjects"]>[number]
): "studio_balanced_v1" | "economy_analytic_v1" | "medical_guided_v1" {
  if (visualObject.motionProfileId) {
    return visualObject.motionProfileId;
  }
  if (visualObject.selection?.channel_domain === "medical" || visualObject.accentToken === "medical") {
    return "medical_guided_v1";
  }
  if (visualObject.selection?.channel_domain === "economy" || visualObject.accentToken === "economy") {
    return "economy_analytic_v1";
  }
  return "studio_balanced_v1";
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function rectIntersects(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

function resolveLayoutPlanForSequence(
  context: Pick<VisualQcContext, "width" | "height" | "safeArea">,
  sequence: DeterministicSequence
) {
  if (sequence.layoutPlan) {
    return sequence.layoutPlan;
  }
  return resolveSequenceLayoutPlan({
    width: context.width,
    height: context.height,
    safeArea: context.safeArea,
    chartData: sequence.chartData,
    hasChart: sequence.hasChart,
    visualMode: sequence.visualMode,
    primaryVisualKind: sequence.primaryVisualKind,
    visualObjects: sequence.visualObjects,
    insertAsset: sequence.insertAsset,
    characterX: sequence.characterX,
    characterY: sequence.characterY,
    pointerEnabled: sequence.pointerEnabled,
    pointerTargetIndex: sequence.pointerTargetIndex,
    expectOcclusion: sequence.expectOcclusion,
    visualIntentFamily: sequence.visualPlan?.selected_intent_family
  });
}

function resolveLayoutAwareSequences(
  context: Pick<VisualQcContext, "width" | "height" | "safeArea">,
  sequences: DeterministicSequence[]
): DeterministicSequence[] {
  return applyLayoutContinuityToSequences({
    width: context.width,
    height: context.height,
    safeArea: context.safeArea,
    sequences
  });
}

function isRectInsideSafeArea(
  safeArea: RenderSafeArea,
  width: number,
  height: number,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  const safeLeft = safeArea.left;
  const safeTop = safeArea.top;
  const safeRight = width - safeArea.right;
  const safeBottom = height - safeArea.bottom;
  return (
    rect.x >= safeLeft &&
    rect.y >= safeTop &&
    rect.x + rect.width <= safeRight &&
    rect.y + rect.height <= safeBottom
  );
}

function isPointInsideRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function cloneSequence(sequence: DeterministicSequence): DeterministicSequence {
  return {
    ...sequence,
    chartData: sequence.chartData.map((row) => ({ ...row })),
    finishProfile: sequence.finishProfile ? { ...sequence.finishProfile } : undefined,
    pointerTip: sequence.pointerTip ? { ...sequence.pointerTip } : undefined,
    layoutPlan: sequence.layoutPlan
      ? {
          ...sequence.layoutPlan,
          subtitleSafeZone: { ...sequence.layoutPlan.subtitleSafeZone },
          narrationBox: { ...sequence.layoutPlan.narrationBox },
          primaryVisualBox: { ...sequence.layoutPlan.primaryVisualBox },
          chartSafeZone: sequence.layoutPlan.chartSafeZone ? { ...sequence.layoutPlan.chartSafeZone } : undefined,
          mascotBlockingZone: { ...sequence.layoutPlan.mascotBlockingZone },
          insertBox: sequence.layoutPlan.insertBox ? { ...sequence.layoutPlan.insertBox } : undefined,
          negativeSpaceBox: sequence.layoutPlan.negativeSpaceBox ? { ...sequence.layoutPlan.negativeSpaceBox } : undefined,
          occluderBox: sequence.layoutPlan.occluderBox ? { ...sequence.layoutPlan.occluderBox } : undefined,
          pointerReachability: {
            ...sequence.layoutPlan.pointerReachability,
            targetPoint: sequence.layoutPlan.pointerReachability.targetPoint
              ? { ...sequence.layoutPlan.pointerReachability.targetPoint }
              : undefined
          }
        }
      : undefined
  };
}

function cloneSequences(sequences: DeterministicSequence[]): DeterministicSequence[] {
  return sequences.map((sequence) => cloneSequence(sequence));
}

function countIssues(issues: VisualQcIssue[]) {
  let errorCount = 0;
  let warnCount = 0;
  for (const issue of issues) {
    if (issue.severity === "ERROR") {
      errorCount += 1;
    } else if (issue.severity === "WARN") {
      warnCount += 1;
    }
  }
  return { errorCount, warnCount };
}

function countAnchorsByType(
  visualObject: NonNullable<DeterministicSequence["visualObjects"]>[number],
  type: "pointer_anchor" | "look_target" | "camera_cutaway_target" | "callout_anchor" | "safe_area_box"
): number {
  return visualObject.anchors?.filter((anchor) => anchor.type === type).length ?? 0;
}

function resolveVisualObjectItemsForQc(
  sequence: DeterministicSequence,
  visualObject: NonNullable<DeterministicSequence["visualObjects"]>[number]
): string[] {
  if (visualObject.items && visualObject.items.length > 0) {
    return visualObject.items.slice(0, 6).map((item) => normalizeText(item));
  }

  if (sequence.chartData.length > 0) {
    return sequence.chartData.slice(0, 6).map((row) => normalizeText(row.label));
  }

  const body = normalizeText(visualObject.body ?? sequence.chartCallout ?? sequence.narration);
  if (body.length === 0) {
    return [];
  }

  return body
    .split(/[,.]/)
    .map((entry) => normalizeText(entry))
    .filter((entry) => entry.length > 0)
    .slice(0, 4);
}

function resolveVisualObjectRectForQc(
  layoutPlan: ReturnType<typeof resolveLayoutPlanForSequence>,
  visualObject: NonNullable<DeterministicSequence["visualObjects"]>[number],
  primaryVisualObject: NonNullable<DeterministicSequence["visualObjects"]>[number] | undefined
) {
  if (visualObject.objectId === primaryVisualObject?.objectId || visualObject.semanticRole === "primary_explainer") {
    return layoutPlan.primaryVisualBox;
  }
  if (visualObject.preferredRegion === "sidebar" || visualObject.preferredRegion === "lower_third") {
    return layoutPlan.insertBox;
  }
  return layoutPlan.primaryVisualBox;
}

function pushIssue(
  issues: VisualQcIssue[],
  code: string,
  severity: VisualQcSeverity,
  message: string,
  shotId?: string,
  details?: Record<string, unknown>
): void {
  issues.push({
    code,
    severity,
    message,
    shotId,
    details
  });
}

function evaluateVisualQcStage(context: VisualQcContext): VisualQcRun {
  const checks: VisualQcCheck[] = [];
  const issues: VisualQcIssue[] = [];

  const pointerTolerancePx = Math.max(4, context.qcInput?.pointerTolerancePx ?? 26);
  const minFontSizePx = Math.max(8, context.qcInput?.minFontSizePx ?? 22);
  const qcDataset = context.qcInput?.dataset;

  let chartDataErrors = 0;
  for (const sequence of context.sequences) {
    if (!sequence.hasChart) {
      continue;
    }

    const rows = sequence.chartData;
    if (rows.length === 0) {
      chartDataErrors += 1;
      pushIssue(issues, "chart_data_empty", "ERROR", "Chart data rows are empty.", sequence.shotId);
      continue;
    }

    const labels = rows.map((row) => row.label.trim());
    const invalidLabels = labels.filter((label) => label.length === 0).length;
    if (invalidLabels > 0) {
      chartDataErrors += 1;
      pushIssue(
        issues,
        "chart_label_invalid",
        "ERROR",
        "Chart labels must be non-empty.",
        sequence.shotId,
        { invalidLabels }
      );
    }

    const uniqueLabels = unique(labels);
    if (uniqueLabels.length !== labels.length) {
      chartDataErrors += 1;
      pushIssue(
        issues,
        "chart_label_duplicate",
        "ERROR",
        "Chart labels must be unique for deterministic pointer resolution.",
        sequence.shotId
      );
    }

    const declaredUnit = qcDataset?.unit ?? sequence.unit;
    const rowUnits = rows.map((row) => (row.unit ?? "").trim()).filter((unit) => unit.length > 0);
    const uniqueUnits = unique(rowUnits);
    if (uniqueUnits.length > 1) {
      chartDataErrors += 1;
      pushIssue(
        issues,
        "chart_unit_inconsistent",
        "ERROR",
        "Chart units are inconsistent across rows.",
        sequence.shotId,
        { units: uniqueUnits }
      );
    }

    if (declaredUnit && rowUnits.some((unit) => unit !== declaredUnit)) {
      chartDataErrors += 1;
      pushIssue(
        issues,
        "chart_unit_mismatch",
        "ERROR",
        "Chart unit does not match the input dataset unit.",
        sequence.shotId,
        { declaredUnit, rowUnits }
      );
    }

    const expectedSum = qcDataset?.expectedSum;
    if (typeof expectedSum === "number") {
      const actualSum = rows.reduce((sum, row) => sum + row.value, 0);
      const tolerance = Math.max(0.01, qcDataset?.sumTolerance ?? Math.abs(expectedSum) * 0.01);
      if (Math.abs(actualSum - expectedSum) > tolerance) {
        chartDataErrors += 1;
        pushIssue(
          issues,
          "chart_data_sum_mismatch",
          "ERROR",
          "Chart sum does not match the expected dataset sum.",
          sequence.shotId,
          { expectedSum, actualSum, tolerance }
        );
      }
    }
  }

  checks.push({
    name: "chart_data_integrity",
    passed: chartDataErrors === 0,
    severity: "ERROR",
    details: chartDataErrors === 0 ? "Chart data checks passed." : `chart_data_errors=${chartDataErrors}`
  });

  let readabilityErrors = 0;
  let readabilityWarnings = 0;
  let readabilityScoreTotal = 0;
  let readabilityScoreCount = 0;
  let blockingErrors = 0;
  let negativeSpaceWarnings = 0;

  for (const sequence of context.sequences) {
    let readabilityScore = 100;
    const layoutPlan = resolveLayoutPlanForSequence(context, sequence);

    const candidateFontSizes = sequence.visualMode === "table" ? [24, 22] : [34, 26, 24];
    const usedMinFont = Math.min(...candidateFontSizes);
    if (usedMinFont < minFontSizePx) {
      readabilityErrors += 1;
      readabilityScore -= 30;
      pushIssue(
        issues,
        "readability_min_font_size",
        "ERROR",
        "Minimum font size check failed.",
        sequence.shotId,
        { usedMinFont, minFontSizePx }
      );
    }

    const narrationText = normalizeText(sequence.narration);
    const narrationEstimate = estimateTextWidth(narrationText, 32);
    const narrationAvailable = layoutPlan.narrationBox.width - 48;
    if (narrationEstimate > narrationAvailable * 2) {
      readabilityWarnings += 1;
      readabilityScore -= 14;
      pushIssue(
        issues,
        "readability_overflow_narration",
        "WARN",
        "Narration text is likely to overflow.",
        sequence.shotId,
        { narrationEstimate, narrationAvailable }
      );
    }

    if (sequence.visualMode === "chart" && sequence.chartData.length > 0) {
      const barCount = sequence.chartData.length;
      const plotWidth = layoutPlan.primaryVisualBox.width - 112;
      const barWidth = (plotWidth - 20 * (barCount - 1)) / barCount;
      for (const row of sequence.chartData) {
        const labelEstimate = estimateTextWidth(row.label, 22);
        if (labelEstimate > barWidth + 10) {
          readabilityWarnings += 1;
          readabilityScore -= 6;
          pushIssue(
            issues,
            "readability_overflow_label",
            "WARN",
            "A chart label is likely to overflow its bar slot.",
            sequence.shotId,
            { label: row.label, labelEstimate, barWidth }
          );
        }
      }
    }

    const hasPrimaryVisual = sequence.hasChart || !!sequence.primaryVisualKind || (sequence.visualObjects?.length ?? 0) > 0;
    const chartRect = layoutPlan.primaryVisualBox;
    if (hasPrimaryVisual && !isRectInsideSafeArea(context.safeArea, context.width, context.height, chartRect)) {
      readabilityErrors += 1;
      readabilityScore -= 30;
      pushIssue(
        issues,
        "readability_safe_area_primary_visual",
        "ERROR",
        "Primary visual area violates the safe area constraints.",
        sequence.shotId
      );
    }

    if (!isRectInsideSafeArea(context.safeArea, context.width, context.height, layoutPlan.narrationBox)) {
      readabilityWarnings += 1;
      readabilityScore -= 10;
      pushIssue(
        issues,
        "readability_safe_area_narration",
        "WARN",
        "Narration area violates the safe area constraints.",
        sequence.shotId
      );
    }

    if (layoutPlan.insertBox && rectIntersects(layoutPlan.insertBox, layoutPlan.primaryVisualBox)) {
      blockingErrors += 1;
      readabilityScore -= 20;
      pushIssue(
        issues,
        "layout_insert_collision",
        "ERROR",
        "Insert box overlaps the primary visual box.",
        sequence.shotId,
        {
          insertBox: layoutPlan.insertBox,
          primaryVisualBox: layoutPlan.primaryVisualBox
        }
      );
    }

    const primaryVisualObject =
      sequence.visualObjects?.find((object) => object.semanticRole === "primary_explainer") ??
      sequence.visualObjects?.[0];
    const supportingInsetObjects =
      sequence.visualObjects?.filter(
        (object) =>
          object.objectId !== primaryVisualObject?.objectId &&
          (object.preferredRegion === "sidebar" || object.preferredRegion === "lower_third")
      ) ?? [];
    if (supportingInsetObjects.length > 0 && !layoutPlan.insertBox) {
      blockingErrors += 1;
      readabilityScore -= 18;
      pushIssue(
        issues,
        "layout_supporting_visual_unplaced",
        "ERROR",
        "Supporting visual object requires an inset box but none was allocated.",
        sequence.shotId,
        {
          visualObjects: supportingInsetObjects.map((object) => ({
            objectId: object.objectId,
            kind: object.kind,
            preferredRegion: object.preferredRegion
          }))
        }
      );
    }

    if (rectIntersects(layoutPlan.narrationBox, layoutPlan.mascotBlockingZone)) {
      blockingErrors += 1;
      readabilityScore -= 16;
      pushIssue(
        issues,
        "layout_mascot_collision",
        "ERROR",
        "Narration box overlaps the mascot blocking zone.",
        sequence.shotId,
        {
          narrationBox: layoutPlan.narrationBox,
          mascotBlockingZone: layoutPlan.mascotBlockingZone
        }
      );
    }

    if (!layoutPlan.negativeSpaceBox || layoutPlan.negativeSpaceBox.width * layoutPlan.negativeSpaceBox.height < 18000) {
      negativeSpaceWarnings += 1;
      readabilityScore -= 4;
      pushIssue(
        issues,
        "layout_negative_space_low",
        "WARN",
        "Negative space reserve is below the recommended threshold.",
        sequence.shotId,
        { negativeSpaceBox: layoutPlan.negativeSpaceBox }
      );
    }

    const finalScore = clamp(readabilityScore, 0, 100);
    readabilityScoreTotal += finalScore;
    readabilityScoreCount += 1;

    if (finalScore < 70) {
      readabilityWarnings += 1;
      pushIssue(
        issues,
        "readability_score_low",
        "WARN",
        "Readability score is below the recommended threshold.",
        sequence.shotId,
        { score: finalScore }
      );
    }
  }

  const readabilityScoreAverage =
    readabilityScoreCount > 0 ? readabilityScoreTotal / readabilityScoreCount : 100;

  checks.push({
    name: "readability",
    passed: readabilityErrors === 0,
    severity: "ERROR",
    details:
      readabilityErrors === 0
        ? `score=${readabilityScoreAverage.toFixed(1)} warnings=${readabilityWarnings} blocking=${blockingErrors} negative_space=${negativeSpaceWarnings}`
        : `score=${readabilityScoreAverage.toFixed(1)} readability_errors=${readabilityErrors} warnings=${readabilityWarnings} blocking=${blockingErrors} negative_space=${negativeSpaceWarnings}`
  });

  let objectSpecificErrors = 0;
  let objectSpecificWarnings = 0;

  for (const sequence of context.sequences) {
    const primaryVisualObject =
      sequence.visualObjects?.find((object) => object.semanticRole === "primary_explainer") ??
      sequence.visualObjects?.[0];
    const visualObjects = sequence.visualObjects ?? [];
    const layoutPlan = resolveLayoutPlanForSequence(context, sequence);

    for (const visualObject of visualObjects) {
      if (!visualObject.motionPreset) {
        objectSpecificWarnings += 1;
        pushIssue(
          issues,
          "visual_object_motion_preset_missing",
          "WARN",
          "Visual object is missing an explicit motion preset and may bypass benchmark coverage.",
          sequence.shotId,
          {
            objectId: visualObject.objectId,
            kind: visualObject.kind,
            motionProfileId: visualObject.motionProfileId ?? null
          }
        );
      } else if (!isBenchmarkedMotionPreset(resolveMotionProfileIdForQc(visualObject), visualObject.motionPreset)) {
        objectSpecificErrors += 1;
        pushIssue(
          issues,
          "visual_object_motion_preset_unbenchmarked",
          "ERROR",
          "Visual object motion preset is not benchmarked for the resolved motion profile.",
          sequence.shotId,
          {
            objectId: visualObject.objectId,
            kind: visualObject.kind,
            motionPreset: visualObject.motionPreset,
            motionProfileId: resolveMotionProfileIdForQc(visualObject)
          }
        );
      }

      if (
        visualObject.kind !== "timeline" &&
        visualObject.kind !== "process_flow" &&
        visualObject.kind !== "anatomy_diagram" &&
        visualObject.kind !== "risk_meter"
      ) {
        continue;
      }

      const rect = resolveVisualObjectRectForQc(layoutPlan, visualObject, primaryVisualObject);
      if (!rect) {
        objectSpecificErrors += 1;
        pushIssue(
          issues,
          "visual_object_rect_missing",
          "ERROR",
          "Visual object specific QC could not resolve a layout rect.",
          sequence.shotId,
          {
            objectId: visualObject.objectId,
            kind: visualObject.kind
          }
        );
        continue;
      }

      const items = resolveVisualObjectItemsForQc(sequence, visualObject);
      const pointerAnchorCount = countAnchorsByType(visualObject, "pointer_anchor");
      const calloutAnchorCount = countAnchorsByType(visualObject, "callout_anchor");

      if (visualObject.kind === "timeline" || visualObject.kind === "process_flow") {
        const steps = Math.max(2, Math.min(visualObject.semanticRole === "primary_explainer" ? 4 : 3, items.length || 3));
        const slotWidth = Math.max(0, (rect.width - 144) / Math.max(1, steps));
        const longestStepLabel = items.reduce((max, item) => Math.max(max, estimateTextWidth(item, 18)), 0);

        if (rect.height < (visualObject.semanticRole === "primary_explainer" ? 240 : 210) || rect.width < 480) {
          objectSpecificErrors += 1;
          pushIssue(
            issues,
            "visual_object_stepflow_footprint_small",
            "ERROR",
            "Timeline or process flow footprint is too small for readable step staging.",
            sequence.shotId,
            {
              objectId: visualObject.objectId,
              kind: visualObject.kind,
              width: rect.width,
              height: rect.height
            }
          );
        }

        if (slotWidth < 118 || longestStepLabel > Math.max(180, slotWidth * 1.4)) {
          objectSpecificWarnings += 1;
          pushIssue(
            issues,
            "visual_object_stepflow_density_high",
            "WARN",
            "Timeline or process flow steps are too dense for the allocated footprint.",
            sequence.shotId,
            {
              objectId: visualObject.objectId,
              kind: visualObject.kind,
              stepCount: steps,
              slotWidth,
              longestStepLabel
            }
          );
        }

        if (pointerAnchorCount < 1) {
          objectSpecificWarnings += 1;
          pushIssue(
            issues,
            "visual_object_stepflow_anchor_sparse",
            "WARN",
            "Timeline or process flow should expose at least one pointer anchor.",
            sequence.shotId,
            {
              objectId: visualObject.objectId,
              kind: visualObject.kind
            }
          );
        }
      }

      if (visualObject.kind === "anatomy_diagram") {
        const longestCallout = items.slice(0, 4).reduce((max, item) => Math.max(max, estimateTextWidth(item, 17)), 0);
        if (rect.width < 560 || rect.height < 520) {
          objectSpecificErrors += 1;
          pushIssue(
            issues,
            "visual_object_anatomy_footprint_small",
            "ERROR",
            "Anatomy diagram footprint is too small to preserve labeled structure readability.",
            sequence.shotId,
            {
              objectId: visualObject.objectId,
              width: rect.width,
              height: rect.height
            }
          );
        }

        if (items.length < 2 || calloutAnchorCount < 1 || longestCallout > 220) {
          objectSpecificWarnings += 1;
          pushIssue(
            issues,
            "visual_object_anatomy_annotation_sparse",
            "WARN",
            "Anatomy diagram annotations are too sparse or too long for clean label reading.",
            sequence.shotId,
            {
              objectId: visualObject.objectId,
              itemCount: items.length,
              calloutAnchorCount,
              longestCallout
            }
          );
        }
      }

      if (visualObject.kind === "risk_meter") {
        const riskLabelWidth = ["Low", "Watch", "High"].reduce((max, item) => Math.max(max, estimateTextWidth(item, 16)), 0);
        const zoneWidth = Math.max(0, (rect.width - 40) / 3);

        if (rect.width < 640 || rect.height < 220) {
          objectSpecificErrors += 1;
          pushIssue(
            issues,
            "visual_object_risk_meter_footprint_small",
            "ERROR",
            "Risk meter footprint is too small to preserve threshold readability.",
            sequence.shotId,
            {
              objectId: visualObject.objectId,
              width: rect.width,
              height: rect.height
            }
          );
        }

        if (riskLabelWidth > zoneWidth * 0.9 || pointerAnchorCount < 1) {
          objectSpecificWarnings += 1;
          pushIssue(
            issues,
            "visual_object_risk_meter_scale_sparse",
            "WARN",
            "Risk meter scale labels or pointer anchor coverage are too weak for reliable reading.",
            sequence.shotId,
            {
              objectId: visualObject.objectId,
              zoneWidth,
              riskLabelWidth,
              pointerAnchorCount
            }
          );
        }
      }
    }
  }

  checks.push({
    name: "object_specific",
    passed: objectSpecificErrors === 0,
    severity: "ERROR",
    details:
      objectSpecificErrors === 0
        ? `object_specific_warnings=${objectSpecificWarnings}`
        : `object_specific_errors=${objectSpecificErrors} warnings=${objectSpecificWarnings}`
  });

  let pointerErrors = 0;
  for (const sequence of context.sequences) {
    if (!sequence.pointerEnabled) {
      continue;
    }

    const primaryVisualObject =
      sequence.visualObjects?.find((object) => object.semanticRole === "primary_explainer") ??
      sequence.visualObjects?.[0];
    const pointerTargetCount = resolvePrimaryVisualPointerTargetCount({
      kind: primaryVisualObject?.kind ?? sequence.primaryVisualKind,
      chartData: sequence.chartData,
      pointerTargetIds: primaryVisualObject?.pointerTargetIds,
      anchors: primaryVisualObject?.anchors
    });

    if (pointerTargetCount <= 0) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_target_missing",
        "ERROR",
        "Pointer target cannot be resolved because no pointer slots are available.",
        sequence.shotId
      );
      continue;
    }

    if (sequence.pointerTargetIndex < 0 || sequence.pointerTargetIndex >= pointerTargetCount) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_target_missing",
        "ERROR",
        "Pointer target index is outside the available target range.",
        sequence.shotId,
        {
          pointerTargetIndex: sequence.pointerTargetIndex,
          targetCount: pointerTargetCount
        }
      );
      continue;
    }

    const layoutPlan = resolveLayoutPlanForSequence(context, sequence);
    if (!layoutPlan.pointerReachability.reachable) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_target_missing",
        "ERROR",
        "Pointer target is not reachable from the mascot blocking plan.",
        sequence.shotId,
        {
          reason: layoutPlan.pointerReachability.reason,
          mascotToTargetDistancePx: layoutPlan.pointerReachability.mascotToTargetDistancePx
        }
      );
      continue;
    }

    const anchor = computePrimaryVisualAnchorInRect({
      kind: primaryVisualObject?.kind ?? sequence.primaryVisualKind,
      chartData: sequence.chartData,
      pointerTargetIds: primaryVisualObject?.pointerTargetIds,
      anchors: primaryVisualObject?.anchors,
      targetIndex: sequence.pointerTargetIndex,
      rect: layoutPlan.primaryVisualBox
    });
    const tip = sequence.pointerTip ?? anchor;
    const distance = Math.hypot(tip.x - anchor.x, tip.y - anchor.y);
    if (distance > pointerTolerancePx) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_tip_tolerance",
        "ERROR",
        "Pointer tip is outside tolerance from the target anchor.",
        sequence.shotId,
        { distance, pointerTolerancePx }
      );
    }
  }

  checks.push({
    name: "pointer_validity",
    passed: pointerErrors === 0,
    severity: "ERROR",
    details: pointerErrors === 0 ? "Pointer checks passed." : `pointer_errors=${pointerErrors}`
  });

  let occlusionErrors = 0;

  for (const sequence of context.sequences) {
    if (!sequence.expectOcclusion) {
      continue;
    }
    const occluderRect = resolveLayoutPlanForSequence(context, sequence).occluderBox ?? {
      ...DEFAULT_OCCLUDER_BOX,
      height: context.height
    };
    const point = {
      x: toPxX(sequence.characterX, context.width),
      y: toPxY(sequence.characterY, context.height)
    };
    if (!isPointInsideRect(point, occluderRect)) {
      occlusionErrors += 1;
      pushIssue(
        issues,
        "layering_occlusion_missing",
        "ERROR",
        "Character is not occluded as expected.",
        sequence.shotId,
        { character: point, occluder: occluderRect }
      );
    }
  }

  checks.push({
    name: "layering_occlusion",
    passed: occlusionErrors === 0,
    severity: "ERROR",
    details: occlusionErrors === 0 ? "Occlusion checks passed." : `occlusion_errors=${occlusionErrors}`
  });

  const { errorCount, warnCount } = countIssues(issues);
  return {
    stage: context.stage,
    checks,
    issues,
    passed: errorCount === 0,
    errorCount,
    warnCount
  };
}

function simplifyChartRows(rows: DeterministicSequence["chartData"]): DeterministicSequence["chartData"] {
  if (rows.length <= 5) {
    return rows.map((row) => ({ ...row }));
  }
  return rows.slice(0, 5).map((row) => ({ ...row }));
}

function applyFallbackStep(
  step: FallbackStep,
  sequences: DeterministicSequence[],
  width: number,
  height: number,
  safeArea: RenderSafeArea
): {
  sequences: DeterministicSequence[];
  freezeCharacterPose: boolean;
} {
  if (step === "simplify_chart") {
    return {
      freezeCharacterPose: false,
      sequences: sequences.map((sequence) => {
        if (!sequence.hasChart) {
          return cloneSequence(sequence);
        }

        const simplifiedRows = simplifyChartRows(sequence.chartData);
        const pointerTargetIndex = clamp(
          sequence.pointerTargetIndex,
          0,
          Math.max(0, simplifiedRows.length - 1)
        );
        const next = cloneSequence(sequence);
        next.chartData = simplifiedRows;
        next.pointerTargetIndex = pointerTargetIndex;
        return next;
      })
    };
  }

  if (step === "remove_annotations") {
    return {
      freezeCharacterPose: false,
      sequences: sequences.map((sequence) => {
        const next = cloneSequence(sequence);
        next.annotationsEnabled = false;
        next.chartCallout = undefined;
        next.narration = normalizeText(next.narration).slice(0, 160);
        return next;
      })
    };
  }

  if (step === "switch_to_table") {
    return {
      freezeCharacterPose: false,
      sequences: sequences.map((sequence) => {
        const next = cloneSequence(sequence);
        if (next.hasChart) {
          next.visualMode = "table";
          next.pointerEnabled = false;
          next.pointerTip = undefined;
          next.chartCallout = undefined;
        }
        return next;
      })
    };
  }

  return {
    freezeCharacterPose: true,
    sequences: sequences.map((sequence) => {
      const next = cloneSequence(sequence);
      next.freezePose = true;
      next.pointerEnabled = false;
      next.pointerTip = undefined;
      if (next.expectOcclusion) {
        const occluderBox =
          resolveLayoutPlanForSequence(
            {
              width,
              height,
              safeArea
            },
            next
          ).occluderBox ?? {
            ...DEFAULT_OCCLUDER_BOX,
            height
          };
        const occluderCenterX = (occluderBox.x + occluderBox.width * 0.5) / Math.max(1, width);
        next.characterX = clamp(occluderCenterX, 0, 1);
      }
      return next;
    })
  };
}

export function runVisualQcWithFallback(input: {
  width: number;
  height: number;
  safeArea: RenderSafeArea;
  sequences: DeterministicSequence[];
  qcInput?: RenderQcInput;
}): VisualQcFallbackResult {
  const runs: VisualQcRun[] = [];
  let workingSequences = resolveLayoutAwareSequences(
    {
      width: input.width,
      height: input.height,
      safeArea: input.safeArea
    },
    cloneSequences(input.sequences)
  );
  let freezeCharacterPose = false;
  const appliedSteps: string[] = [];

  const initialRun = evaluateVisualQcStage({
    width: input.width,
    height: input.height,
    safeArea: input.safeArea,
    sequences: workingSequences,
    stage: "initial",
    qcInput: input.qcInput
  });
  runs.push(initialRun);

  let finalRun = initialRun;
  for (const step of FALLBACK_STEPS) {
    if (finalRun.passed) {
      break;
    }

    const fallback = applyFallbackStep(step, workingSequences, input.width, input.height, input.safeArea);
    workingSequences = resolveLayoutAwareSequences(
      {
        width: input.width,
        height: input.height,
        safeArea: input.safeArea
      },
      fallback.sequences
    );
    freezeCharacterPose = freezeCharacterPose || fallback.freezeCharacterPose;
    appliedSteps.push(step);

    finalRun = evaluateVisualQcStage({
      width: input.width,
      height: input.height,
      safeArea: input.safeArea,
      sequences: workingSequences,
      stage: `fallback:${step}`,
      qcInput: input.qcInput
    });
    runs.push(finalRun);
  }

  const report: VisualQcReport = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    final_passed: finalRun.passed,
    final_stage: finalRun.stage,
    fallback_steps_applied: appliedSteps,
    runs
  };

  const resolvedSequences = resolveLayoutAwareSequences(
    {
      width: input.width,
      height: input.height,
      safeArea: input.safeArea
    },
    workingSequences
  ).map((sequence) => {
    const layoutPlan = resolveLayoutPlanForSequence(
      {
        width: input.width,
        height: input.height,
        safeArea: input.safeArea
      },
      sequence
    );
    return {
      ...sequence,
      layoutPlan,
      pointerTip: (() => {
        if (!sequence.pointerEnabled) {
          return sequence.pointerTip;
        }
        const primaryVisualObject =
          sequence.visualObjects?.find((object) => object.semanticRole === "primary_explainer") ??
          sequence.visualObjects?.[0];
        return computePrimaryVisualAnchorInRect({
          kind: primaryVisualObject?.kind ?? sequence.primaryVisualKind,
          chartData: sequence.chartData,
          pointerTargetIds: primaryVisualObject?.pointerTargetIds,
          anchors: primaryVisualObject?.anchors,
          targetIndex: sequence.pointerTargetIndex,
          rect: layoutPlan.primaryVisualBox
        });
      })()
    };
  });

  return {
    sequences: resolvedSequences,
    freezeCharacterPose,
    report
  };
}

