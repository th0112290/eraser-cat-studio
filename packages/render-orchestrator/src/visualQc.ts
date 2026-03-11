import type {
  DeterministicVisualObject,
  DeterministicSequence,
  RenderLayoutBox,
  RenderQcInput,
  RenderSafeArea,
  VisualQcCheck,
  VisualQcIssue,
  VisualQcReport,
  VisualQcRun,
  VisualQcSeverity
} from "./types";

const CHART_BOX = {
  x: 1030,
  y: 168,
  width: 760,
  height: 510
};

const NARRATION_BOX = {
  x: 104,
  y: 748,
  width: 820,
  height: 176
};

const OCCLUDER_BOX = {
  x: 760,
  y: 0,
  width: 180,
  height: 1080
};

const CHARACTER_BLOCKING_BOX = {
  offsetX: -220,
  offsetY: -320,
  width: 460,
  height: 720
};

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

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normalizeVisualObjectKind(
  kind: DeterministicSequence["primaryVisualKind"] | DeterministicVisualObject["kind"] | undefined
): DeterministicSequence["primaryVisualKind"] | undefined {
  if (!kind) {
    return undefined;
  }
  return kind;
}

function resolvePrimaryVisualObject(sequence: DeterministicSequence) {
  return sequence.visualObjects?.find((visualObject) => visualObject.semanticRole === "primary_explainer") ?? sequence.visualObjects?.[0];
}

function resolvePrimaryVisualKind(sequence: DeterministicSequence): DeterministicSequence["primaryVisualKind"] | undefined {
  return normalizeVisualObjectKind(resolvePrimaryVisualObject(sequence)?.kind ?? sequence.primaryVisualKind);
}

function isChartLikeVisualKind(kind: DeterministicSequence["primaryVisualKind"] | undefined): boolean {
  return kind === "bar_chart" || kind === "line_chart" || kind === "table";
}

function resolveVisualRect(sequence: DeterministicSequence):
  | {
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | undefined {
  if (sequence.hasChart || resolvePrimaryVisualKind(sequence)) {
    return sequence.visualBox ?? {
      x: CHART_BOX.x,
      y: CHART_BOX.y,
      width: CHART_BOX.width,
      height: CHART_BOX.height
    };
  }
  return undefined;
}

function resolveNarrationRect(sequence: DeterministicSequence): RenderLayoutBox {
  return sequence.narrationBox ?? NARRATION_BOX;
}

function resolvePointerReachableRect(sequence: DeterministicSequence): RenderLayoutBox | undefined {
  if (sequence.pointerReachableZone) {
    return sequence.pointerReachableZone;
  }
  const visualRect = resolveVisualRect(sequence);
  if (!visualRect || !sequence.hasChart) {
    return undefined;
  }
  return {
    x: visualRect.x + 56,
    y: visualRect.y + 86,
    width: Math.max(40, visualRect.width - 112),
    height: Math.max(40, visualRect.height - 202)
  };
}

function resolveDeclaredPointerAnchor(sequence: DeterministicSequence): { x: number; y: number } | undefined {
  if (sequence.hasChart && sequence.visualMode === "chart") {
    if (sequence.chartData.length === 0) {
      return undefined;
    }
    return computeBarAnchor(sequence, clamp(sequence.pointerTargetIndex, 0, Math.max(0, sequence.chartData.length - 1)));
  }

  const reachableRect = resolvePointerReachableRect(sequence);
  if (reachableRect) {
    return {
      x: reachableRect.x + reachableRect.width * 0.5,
      y: reachableRect.y + reachableRect.height * 0.5
    };
  }

  const visualRect = resolveVisualRect(sequence);
  if (!visualRect) {
    return undefined;
  }

  return {
    x: visualRect.x + visualRect.width * 0.5,
    y: visualRect.y + visualRect.height * 0.5
  };
}

function rectIntersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) {
    return 0;
  }
  return (right - left) * (bottom - top);
}

function expandRect(
  rect: { x: number; y: number; width: number; height: number },
  padding: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };
}

function resolveCharacterBlockingRect(
  sequence: DeterministicSequence,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  if (sequence.mascotBlockingBox) {
    return sequence.mascotBlockingBox;
  }
  const centerX = toPxX(sequence.characterX, width);
  const centerY = toPxY(sequence.characterY, height);
  return {
    x: centerX + CHARACTER_BLOCKING_BOX.offsetX,
    y: centerY + CHARACTER_BLOCKING_BOX.offsetY,
    width: CHARACTER_BLOCKING_BOX.width,
    height: CHARACTER_BLOCKING_BOX.height
  };
}

function resolveVisualTextItems(sequence: DeterministicSequence): string[] {
  return unique(
    [
      ...(resolvePrimaryVisualObject(sequence)?.items ?? []),
      ...(sequence.visualObjects?.flatMap((visualObject) => visualObject.items ?? []) ?? []),
      ...sequence.chartData.map((row) => row.label),
      normalizeText(resolvePrimaryVisualObject(sequence)?.body ?? "")
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
}

function computeBarAnchor(sequence: DeterministicSequence, targetIndex: number): { x: number; y: number } {
  const rows = sequence.chartData;
  const visualRect = resolveVisualRect(sequence) ?? CHART_BOX;
  const clampedIndex = clamp(targetIndex, 0, Math.max(0, rows.length - 1));
  const left = visualRect.x + 56;
  const top = visualRect.y + 86;
  const plotWidth = visualRect.width - 112;
  const plotHeight = visualRect.height - 156;
  const count = Math.max(1, rows.length);
  const gap = 20;
  const barWidth = (plotWidth - gap * (count - 1)) / count;
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  const value = rows[clampedIndex]?.value ?? 0;
  const heightRatio = clamp(value / maxValue, 0, 1);
  const barHeight = Math.max(6, plotHeight * heightRatio);
  const x = left + clampedIndex * (barWidth + gap) + barWidth * 0.5;
  const y = top + plotHeight - barHeight;
  return { x, y };
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
    pointerTip: sequence.pointerTip ? { ...sequence.pointerTip } : undefined,
    visualObjects: sequence.visualObjects?.map((visualObject) => ({
      ...visualObject,
      items: visualObject.items ? [...visualObject.items] : undefined,
      dataRef: visualObject.dataRef ? { ...visualObject.dataRef } : undefined
    })),
    visualPlan: sequence.visualPlan ? { ...sequence.visualPlan } : undefined,
    profileBundle: sequence.profileBundle ? { ...sequence.profileBundle } : undefined,
    finishProfile: sequence.finishProfile ? { ...sequence.finishProfile } : undefined,
    visualBox: sequence.visualBox ? { ...sequence.visualBox } : undefined,
    narrationBox: sequence.narrationBox ? { ...sequence.narrationBox } : undefined,
    mascotBlockingBox: sequence.mascotBlockingBox ? { ...sequence.mascotBlockingBox } : undefined,
    pointerReachableZone: sequence.pointerReachableZone ? { ...sequence.pointerReachableZone } : undefined
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

function pushIssue(
  issues: VisualQcIssue[],
  code: string,
  severity: VisualQcSeverity,
  message: string,
  shotRef?: string | DeterministicSequence,
  details?: Record<string, unknown>
): void {
  const sequence = typeof shotRef === "object" ? shotRef : undefined;
  const shotId = typeof shotRef === "string" ? shotRef : sequence?.shotId;
  const contextLabel = sequence
    ? [sequence.shotGrammar, sequence.educationalIntent, sequence.routeReason]
        .filter((value): value is Exclude<typeof value, undefined> => typeof value === "string" && value.length > 0)
        .map((value) => value.replaceAll("_", " "))
        .join(" / ")
    : undefined;
  issues.push({
    code,
    severity,
    message: contextLabel && contextLabel.length > 0 ? `${message} [${contextLabel}]` : message,
    shotId,
    details: sequence
        ? {
            shotGrammar: sequence.shotGrammar,
            educationalIntent: sequence.educationalIntent,
            routeReason: sequence.routeReason,
            insertNeed: sequence.insertNeed,
            primaryVisualKind: resolvePrimaryVisualKind(sequence),
            studioProfileId: sequence.profileBundle?.studioProfileId,
            channelProfileId: sequence.profileBundle?.channelProfileId,
            mascotProfileId: sequence.profileBundle?.mascotProfileId,
            resolverId: sequence.profileBundle?.resolverId,
            resolverSource: sequence.profileBundle?.resolverSource,
            layoutBias: sequence.profileBundle?.layoutBias,
            actingBias: sequence.profileBundle?.actingBias,
            pointerBias: sequence.profileBundle?.pointerBias,
            ...details
          }
        : details
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
      pushIssue(issues, "chart_data_empty", "ERROR", "Chart data rows are empty.", sequence);
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
        sequence,
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
        sequence
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
        sequence,
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
        sequence,
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
          sequence,
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

  for (const sequence of context.sequences) {
    let readabilityScore = 100;
    const primaryVisualKind = resolvePrimaryVisualKind(sequence);
    const visualRect = resolveVisualRect(sequence);
    const narrationRect = resolveNarrationRect(sequence);
    const primaryVisualObject = resolvePrimaryVisualObject(sequence);
    const visualItems = resolveVisualTextItems(sequence);
    const nonChartVisual = Boolean(primaryVisualKind) && !isChartLikeVisualKind(primaryVisualKind);

    const candidateFontSizes = nonChartVisual ? [36, 24, 20] : sequence.visualMode === "table" ? [24, 22] : [34, 26, 24];
    const usedMinFont = Math.min(...candidateFontSizes);
    if (usedMinFont < minFontSizePx) {
      readabilityErrors += 1;
      readabilityScore -= 30;
      pushIssue(
        issues,
        "readability_min_font_size",
        "ERROR",
        "Minimum font size check failed.",
        sequence,
        { usedMinFont, minFontSizePx }
      );
    }

    const narrationText = normalizeText(sequence.narration);
    const narrationEstimate = estimateTextWidth(narrationText, 32);
    const narrationAvailable = narrationRect.width - 48;
    if (narrationEstimate > narrationAvailable * 2) {
      readabilityWarnings += 1;
      readabilityScore -= 14;
      pushIssue(
        issues,
        "readability_overflow_narration",
        "WARN",
        "Narration text is likely to overflow.",
        sequence,
        { narrationEstimate, narrationAvailable }
      );
    }

    if (sequence.visualMode === "chart" && sequence.chartData.length > 0) {
      const barCount = sequence.chartData.length;
      const plotWidth = (visualRect?.width ?? CHART_BOX.width) - 112;
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
            sequence,
            { label: row.label, labelEstimate, barWidth }
          );
        }
      }
    }

    if (visualRect && !isRectInsideSafeArea(context.safeArea, context.width, context.height, visualRect)) {
      readabilityErrors += 1;
      readabilityScore -= 30;
      pushIssue(
        issues,
        sequence.hasChart ? "readability_safe_area_chart" : "readability_safe_area_visual_object",
        "ERROR",
        sequence.hasChart
          ? "Chart area violates the safe area constraints."
          : "Primary visual object area violates the safe area constraints.",
        sequence,
        primaryVisualKind ? { primaryVisualKind } : undefined
      );
    }

    if (nonChartVisual) {
      const visualTitle = normalizeText(primaryVisualObject?.title ?? "");
      const visualBody = normalizeText(primaryVisualObject?.body ?? sequence.narration);
      const titleEstimate = visualTitle ? estimateTextWidth(visualTitle, 36) : 0;
      const bodyEstimate = visualBody ? estimateTextWidth(visualBody, 24) : 0;
      const titleAvailable = ((visualRect?.width ?? CHART_BOX.width) - 96) * 1.8;
      const bodyAvailable = ((visualRect?.width ?? CHART_BOX.width) - 96) * 4.8;

      if (!visualTitle && visualBody.length === 0 && visualItems.length === 0) {
        readabilityErrors += 1;
        readabilityScore -= 32;
        pushIssue(
          issues,
          "visual_object_content_missing",
          "ERROR",
          "Primary visual object has no usable title, body, or items.",
          sequence,
          { primaryVisualKind }
        );
      }

      if (titleEstimate > titleAvailable) {
        readabilityWarnings += 1;
        readabilityScore -= 8;
        pushIssue(
          issues,
          "visual_object_title_overflow",
          "WARN",
          "Primary visual title is likely to overflow the visual box.",
          sequence,
          { primaryVisualKind, titleEstimate, titleAvailable }
        );
      }

      if (bodyEstimate > bodyAvailable) {
        readabilityWarnings += 1;
        readabilityScore -= 10;
        pushIssue(
          issues,
          "visual_object_body_overflow",
          "WARN",
          "Primary visual body is likely to overflow the explainer layout.",
          sequence,
          { primaryVisualKind, bodyEstimate, bodyAvailable }
        );
      }

      const densityLimit =
        primaryVisualKind === "checklist_card" ||
        primaryVisualKind === "timeline" ||
        primaryVisualKind === "process_flow" ||
        primaryVisualKind === "comparison_board" ||
        primaryVisualKind === "icon_array"
          ? 4
          : 3;
      if (visualItems.length > densityLimit) {
        readabilityWarnings += 1;
        readabilityScore -= 12;
        pushIssue(
          issues,
          "visual_object_density_high",
          "WARN",
          "Primary visual object contains more items than the recommended density budget.",
          sequence,
          { primaryVisualKind, itemCount: visualItems.length, densityLimit }
        );
      }
    }

    if (!isRectInsideSafeArea(context.safeArea, context.width, context.height, narrationRect)) {
      readabilityWarnings += 1;
      readabilityScore -= 10;
      pushIssue(
        issues,
        "readability_safe_area_narration",
        "WARN",
        "Narration area violates the safe area constraints.",
        sequence
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
        sequence,
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
        ? `score=${readabilityScoreAverage.toFixed(1)} warnings=${readabilityWarnings}`
        : `score=${readabilityScoreAverage.toFixed(1)} readability_errors=${readabilityErrors} warnings=${readabilityWarnings}`
  });

  let pointerErrors = 0;
  for (const sequence of context.sequences) {
    if (!sequence.pointerEnabled) {
      continue;
    }

    if (sequence.hasChart && sequence.visualMode === "chart" && sequence.chartData.length === 0) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_target_missing",
        "ERROR",
        "Pointer target cannot be resolved because chart data is empty.",
        sequence
      );
      continue;
    }

    if (
      sequence.hasChart &&
      sequence.visualMode === "chart" &&
      (sequence.pointerTargetIndex < 0 || sequence.pointerTargetIndex >= sequence.chartData.length)
    ) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_target_missing",
        "ERROR",
        "Pointer target index is outside chart data range.",
        sequence,
        {
          pointerTargetIndex: sequence.pointerTargetIndex,
          rowCount: sequence.chartData.length
        }
      );
      continue;
    }

    const anchor = resolveDeclaredPointerAnchor(sequence);
    if (!anchor) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_target_missing",
        "ERROR",
        "Pointer target cannot be resolved for the declared visual layout.",
        sequence
      );
      continue;
    }
    const tip = sequence.pointerTip ?? anchor;
    const reachableRect = resolvePointerReachableRect(sequence);
    const distance = Math.hypot(tip.x - anchor.x, tip.y - anchor.y);
    if (distance > pointerTolerancePx) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_tip_tolerance",
        "ERROR",
        "Pointer tip is outside tolerance from the target anchor.",
        sequence,
        { distance, pointerTolerancePx }
      );
    }

    if (reachableRect && !isPointInsideRect(anchor, reachableRect)) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_reachable_zone_miss",
        "ERROR",
        "Pointer anchor falls outside the declared reachable zone.",
        sequence,
        { pointerAnchor: anchor, reachableRect }
      );
    }
  }

  checks.push({
    name: "pointer_validity",
    passed: pointerErrors === 0,
    severity: "ERROR",
    details: pointerErrors === 0 ? "Pointer checks passed." : `pointer_errors=${pointerErrors}`
  });

  let blockingErrors = 0;
  let blockingWarnings = 0;
  for (const sequence of context.sequences) {
    const characterRect = resolveCharacterBlockingRect(sequence, context.width, context.height);
    const visualRect = resolveVisualRect(sequence);
    const narrationRect = resolveNarrationRect(sequence);

    if (visualRect) {
      const visualOverlap = rectIntersectionArea(expandRect(visualRect, 14), characterRect);
      if (visualOverlap > 0) {
        blockingErrors += 1;
        pushIssue(
          issues,
          "blocking_visual_mascot_collision",
          "ERROR",
          "Mascot blocking zone overlaps the primary visual area.",
          sequence,
          { overlapArea: visualOverlap, primaryVisualKind: resolvePrimaryVisualKind(sequence) }
        );
      }
    }

    const narrationOverlap = rectIntersectionArea(expandRect(narrationRect, 10), characterRect);
    if (narrationOverlap > 0) {
      blockingWarnings += 1;
      pushIssue(
        issues,
        "blocking_narration_mascot_collision",
        "WARN",
        "Mascot blocking zone overlaps the narration safe box.",
        sequence,
        { overlapArea: narrationOverlap }
      );
    }

    if (sequence.pointerEnabled) {
      const pointerAnchor = resolveDeclaredPointerAnchor(sequence);
      if (!pointerAnchor) {
        continue;
      }
      if (isPointInsideRect(pointerAnchor, expandRect(characterRect, 6))) {
        blockingErrors += 1;
        pushIssue(
          issues,
          "pointer_reachable_zone_blocked",
          "ERROR",
          "Pointer target anchor lands inside the mascot blocking zone.",
          sequence,
          { pointerAnchor }
        );
      }
    }
  }

  checks.push({
    name: "blocking_layout",
    passed: blockingErrors === 0,
    severity: "ERROR",
    details:
      blockingErrors === 0
        ? `blocking_warnings=${blockingWarnings}`
        : `blocking_errors=${blockingErrors} warnings=${blockingWarnings}`
  });

  let occlusionErrors = 0;
  const occluderRect = {
    ...OCCLUDER_BOX,
    height: context.height
  };

  for (const sequence of context.sequences) {
    if (!sequence.expectOcclusion) {
      continue;
    }
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
        sequence,
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
  width: number
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
        next.talkText = next.talkText ? normalizeText(next.talkText).slice(0, 120) : next.talkText;
        next.visualObjects =
          next.visualObjects?.map((visualObject) => ({
            ...visualObject,
            title: visualObject.title ? normalizeText(visualObject.title).slice(0, 56) : visualObject.title,
            body: visualObject.body ? normalizeText(visualObject.body).slice(0, 140) : visualObject.body,
            items: visualObject.items?.slice(0, 4).map((item) => normalizeText(item).slice(0, 36))
          })) ?? next.visualObjects;
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

  const occluderCenterX = (OCCLUDER_BOX.x + OCCLUDER_BOX.width * 0.5) / Math.max(1, width);
  return {
    freezeCharacterPose: true,
    sequences: sequences.map((sequence) => {
      const next = cloneSequence(sequence);
      next.freezePose = true;
      next.pointerEnabled = false;
      next.pointerTip = undefined;
      if (next.expectOcclusion) {
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
  let workingSequences = cloneSequences(input.sequences);
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

    const fallback = applyFallbackStep(step, workingSequences, input.width);
    workingSequences = fallback.sequences;
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

  return {
    sequences: workingSequences,
    freezeCharacterPose,
    report
  };
}

