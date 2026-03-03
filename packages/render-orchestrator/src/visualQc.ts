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

const CHART_BOX = {
  x: 1030,
  y: 168,
  width: 760,
  height: 510
};

const NARRATION_BOX = {
  x: 88,
  y: 760,
  width: 840,
  height: 160
};

const OCCLUDER_BOX = {
  x: 760,
  y: 0,
  width: 180,
  height: 1080
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

function computeBarAnchor(sequence: DeterministicSequence, targetIndex: number): { x: number; y: number } {
  const rows = sequence.chartData;
  const clampedIndex = clamp(targetIndex, 0, Math.max(0, rows.length - 1));
  const left = CHART_BOX.x + 56;
  const top = CHART_BOX.y + 86;
  const plotWidth = CHART_BOX.width - 112;
  const plotHeight = CHART_BOX.height - 156;
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
    pointerTip: sequence.pointerTip ? { ...sequence.pointerTip } : undefined
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

  for (const sequence of context.sequences) {
    let readabilityScore = 100;

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
    const narrationAvailable = NARRATION_BOX.width - 48;
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
      const plotWidth = CHART_BOX.width - 112;
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

    const chartRect = {
      x: CHART_BOX.x,
      y: CHART_BOX.y,
      width: CHART_BOX.width,
      height: CHART_BOX.height
    };
    if (
      sequence.hasChart &&
      !isRectInsideSafeArea(context.safeArea, context.width, context.height, chartRect)
    ) {
      readabilityErrors += 1;
      readabilityScore -= 30;
      pushIssue(
        issues,
        "readability_safe_area_chart",
        "ERROR",
        "Chart area violates the safe area constraints.",
        sequence.shotId
      );
    }

    if (!isRectInsideSafeArea(context.safeArea, context.width, context.height, NARRATION_BOX)) {
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
        ? `score=${readabilityScoreAverage.toFixed(1)} warnings=${readabilityWarnings}`
        : `score=${readabilityScoreAverage.toFixed(1)} readability_errors=${readabilityErrors} warnings=${readabilityWarnings}`
  });

  let pointerErrors = 0;
  for (const sequence of context.sequences) {
    if (!sequence.hasChart || sequence.visualMode !== "chart" || !sequence.pointerEnabled) {
      continue;
    }

    if (sequence.chartData.length === 0) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_target_missing",
        "ERROR",
        "Pointer target cannot be resolved because chart data is empty.",
        sequence.shotId
      );
      continue;
    }

    if (sequence.pointerTargetIndex < 0 || sequence.pointerTargetIndex >= sequence.chartData.length) {
      pointerErrors += 1;
      pushIssue(
        issues,
        "pointer_target_missing",
        "ERROR",
        "Pointer target index is outside chart data range.",
        sequence.shotId,
        {
          pointerTargetIndex: sequence.pointerTargetIndex,
          rowCount: sequence.chartData.length
        }
      );
      continue;
    }

    const anchor = computeBarAnchor(sequence, sequence.pointerTargetIndex);
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

