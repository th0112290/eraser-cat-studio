import { createBarChartLayout } from "../templates/BarChart";
import type { BarDatum, SafeArea } from "../templates/chartTypes";
import type { SituationSceneLayout } from "../templates/SituationScene";

export type QcCheckName =
  | "text_overflow"
  | "chart_labels_collision"
  | "pointer_target_missing"
  | "minimum_contrast";

export type QcSeverity = "warning" | "error";

export type QcIssue = {
  code: QcCheckName;
  severity: QcSeverity;
  message: string;
};

export type QcCheckResult = {
  name: QcCheckName;
  passed: boolean;
  details: string;
};

export type PreviewQcInput = {
  layout: SituationSceneLayout;
  chartData: BarDatum[];
  chartSafeArea: Partial<SafeArea>;
  pointerBarIndex: number;
  caption?: {
    text: string;
    containerWidth: number;
    fontSize: number;
    foreground: string;
    background: string;
  };
  chartLabelColor: string;
  chartBackgroundColor: string;
};

export type PreviewQcResult = {
  passed: boolean;
  checks: QcCheckResult[];
  issues: QcIssue[];
};

function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56;
}

function parseColor(value: string): { r: number; g: number; b: number } | null {
  const hex = value.trim().toLowerCase();

  if (hex.startsWith("#")) {
    const body = hex.slice(1);
    if (body.length === 3) {
      const r = Number.parseInt(`${body[0]}${body[0]}`, 16);
      const g = Number.parseInt(`${body[1]}${body[1]}`, 16);
      const b = Number.parseInt(`${body[2]}${body[2]}`, 16);
      return { r, g, b };
    }
    if (body.length === 6) {
      const r = Number.parseInt(body.slice(0, 2), 16);
      const g = Number.parseInt(body.slice(2, 4), 16);
      const b = Number.parseInt(body.slice(4, 6), 16);
      return { r, g, b };
    }
  }

  const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((item) => item.trim());
    if (parts.length >= 3) {
      const r = Number.parseFloat(parts[0]);
      const g = Number.parseFloat(parts[1]);
      const b = Number.parseFloat(parts[2]);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return { r, g, b };
      }
    }
  }

  return null;
}

function relativeLuminance(color: { r: number; g: number; b: number }): number {
  const convert = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  const r = convert(color.r);
  const g = convert(color.g);
  const b = convert(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg: string, bg: string): number | null {
  const fgColor = parseColor(fg);
  const bgColor = parseColor(bg);
  if (!fgColor || !bgColor) {
    return null;
  }

  const l1 = relativeLuminance(fgColor);
  const l2 = relativeLuminance(bgColor);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function runPreviewQc(input: PreviewQcInput): PreviewQcResult {
  const checks: QcCheckResult[] = [];
  const issues: QcIssue[] = [];
  const chartLayout = createBarChartLayout({
    width: input.layout.chart.width,
    height: input.layout.chart.height,
    data: input.chartData,
    safeArea: input.chartSafeArea
  });

  const caption = input.caption;
  if (!caption || caption.text.trim().length === 0) {
    checks.push({
      name: "text_overflow",
      passed: true,
      details: "Skipped (caption disabled)."
    });
  } else {
    const estimatedWidth = estimateTextWidth(caption.text, caption.fontSize);
    const availableWidth = Math.max(1, caption.containerWidth - 34);
    const passed = estimatedWidth <= availableWidth;
    checks.push({
      name: "text_overflow",
      passed,
      details: `estimated=${Math.round(estimatedWidth)} available=${Math.round(availableWidth)}`
    });
    if (!passed) {
      issues.push({
        code: "text_overflow",
        severity: "warning",
        message: "Caption text may overflow its container."
      });
    }
  }

  let collisionCount = 0;
  for (let i = 0; i < chartLayout.bars.length - 1; i += 1) {
    const left = chartLayout.bars[i];
    const right = chartLayout.bars[i + 1];
    const leftWidth = left.label.length * 13;
    const rightWidth = right.label.length * 13;
    const leftRightX = left.x + left.width * 0.5 + leftWidth * 0.5;
    const rightLeftX = right.x + right.width * 0.5 - rightWidth * 0.5;
    if (leftRightX + 8 > rightLeftX) {
      collisionCount += 1;
    }
  }
  const labelsPassed = collisionCount === 0;
  checks.push({
    name: "chart_labels_collision",
    passed: labelsPassed,
    details: `collision_count=${collisionCount}`
  });
  if (!labelsPassed) {
    issues.push({
      code: "chart_labels_collision",
      severity: "warning",
      message: "Chart labels may collide."
    });
  }

  const pointerPassed =
    input.pointerBarIndex >= 0 &&
    input.pointerBarIndex < chartLayout.bars.length &&
    chartLayout.bars.length > 0;
  checks.push({
    name: "pointer_target_missing",
    passed: pointerPassed,
    details: `target_index=${input.pointerBarIndex} bars=${chartLayout.bars.length}`
  });
  if (!pointerPassed) {
    issues.push({
      code: "pointer_target_missing",
      severity: "error",
      message: "Pointer target index is missing from chart data."
    });
  }

  const chartContrast = contrastRatio(input.chartLabelColor, input.chartBackgroundColor);
  const captionContrast =
    caption && caption.text.trim().length > 0
      ? contrastRatio(caption.foreground, caption.background)
      : null;
  const minimumContrast = 3;
  const contrastPassed =
    (chartContrast === null || chartContrast >= minimumContrast) &&
    (captionContrast === null || captionContrast >= minimumContrast);
  checks.push({
    name: "minimum_contrast",
    passed: contrastPassed,
    details: `chart=${chartContrast?.toFixed(2) ?? "n/a"} caption=${captionContrast?.toFixed(2) ?? "n/a"}`
  });
  if (!contrastPassed) {
    issues.push({
      code: "minimum_contrast",
      severity: "warning",
      message: "Minimum contrast heuristic failed."
    });
  }

  return {
    passed: issues.every((issue) => issue.severity !== "error") && checks.every((check) => check.passed),
    checks,
    issues
  };
}

