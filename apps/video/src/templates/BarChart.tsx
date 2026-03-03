import type { CSSProperties } from "react";
import type { BarAnchorKind, BarDatum, BarRect, ChartLayout, SafeArea, Vec2 } from "./chartTypes";

export type BarChartProps = {
  width: number;
  height: number;
  data: BarDatum[];
  maxValue?: number;
  safeArea?: Partial<SafeArea>;
  title?: string;
  subtitle?: string;
  highlightIndex?: number;
  barGap?: number;
};

const DEFAULT_SAFE_AREA: SafeArea = {
  top: 54,
  right: 96,
  bottom: 54,
  left: 96
};

const DEFAULT_COLORS = ["#53D1B6", "#66A3FF", "#FFD166", "#FF7B72", "#B892FF", "#7AD3FF"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveSafeArea(safeArea?: Partial<SafeArea>): SafeArea {
  return {
    top: safeArea?.top ?? DEFAULT_SAFE_AREA.top,
    right: safeArea?.right ?? DEFAULT_SAFE_AREA.right,
    bottom: safeArea?.bottom ?? DEFAULT_SAFE_AREA.bottom,
    left: safeArea?.left ?? DEFAULT_SAFE_AREA.left
  };
}

export function createBarChartLayout(input: {
  width: number;
  height: number;
  data: BarDatum[];
  maxValue?: number;
  safeArea?: Partial<SafeArea>;
  barGap?: number;
}): ChartLayout {
  const safeArea = resolveSafeArea(input.safeArea);
  const chartTopPadding = 116;
  const labelsAreaHeight = 96;
  const plotX = safeArea.left;
  const plotY = safeArea.top + chartTopPadding;
  const plotWidth = input.width - safeArea.left - safeArea.right;
  const plotHeight = input.height - plotY - safeArea.bottom - labelsAreaHeight;
  const baselineY = plotY + plotHeight;

  const dataLength = Math.max(1, input.data.length);
  const gap = input.barGap ?? 28;
  const availableWidth = plotWidth - gap * (dataLength - 1);
  const barWidth = Math.max(14, availableWidth / dataLength);

  const values = input.data.map((item) => item.value);
  const maxValue = input.maxValue ?? Math.max(...values, 1);

  const bars: BarRect[] = input.data.map((item, index) => {
    const normalized = clamp(item.value / maxValue, 0, 1);
    const barHeight = Math.max(6, normalized * plotHeight);
    const x = plotX + index * (barWidth + gap);
    const y = baselineY - barHeight;
    return {
      x,
      y,
      width: barWidth,
      height: barHeight,
      value: item.value,
      label: item.label,
      color: item.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length]
    };
  });

  const getBarAnchor = (index: number, kind: BarAnchorKind = "top"): Vec2 => {
    const bar = bars[index];
    if (!bar) {
      throw new Error(`Bar index out of range: ${index}`);
    }

    if (kind === "center") {
      return {
        x: bar.x + bar.width * 0.5,
        y: bar.y + bar.height * 0.5
      };
    }

    if (kind === "label") {
      return {
        x: bar.x + bar.width * 0.5,
        y: baselineY + 38
      };
    }

    return {
      x: bar.x + bar.width * 0.5,
      y: bar.y
    };
  };

  return {
    safeArea,
    plot: {
      x: plotX,
      y: plotY,
      width: plotWidth,
      height: plotHeight,
      baselineY
    },
    bars,
    getBarAnchor
  };
}

export function getBarAnchor(layout: ChartLayout, index: number, kind: BarAnchorKind = "top"): Vec2 {
  return layout.getBarAnchor(index, kind);
}

export const BarChart = ({
  width,
  height,
  data,
  maxValue,
  safeArea,
  title = "Weekly Performance",
  subtitle = "Values in points",
  highlightIndex = -1,
  barGap
}: BarChartProps) => {
  const layout = createBarChartLayout({
    width,
    height,
    data,
    maxValue,
    safeArea,
    barGap
  });

  const titleStyle: CSSProperties = {
    position: "absolute",
    left: layout.safeArea.left,
    top: layout.safeArea.top - 4,
    color: "#E8ECF8"
  };

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height
      }}
    >
      <div style={titleStyle}>
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: 0.4
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 26,
            color: "#AEB8D1"
          }}
        >
          {subtitle}
        </div>
      </div>

      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          overflow: "visible"
        }}
      >
        <rect
          x={layout.plot.x}
          y={layout.plot.y}
          width={layout.plot.width}
          height={layout.plot.height}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.08}
          strokeWidth={2}
          rx={16}
        />
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={layout.plot.x}
            x2={layout.plot.x + layout.plot.width}
            y1={layout.plot.y + layout.plot.height * ratio}
            y2={layout.plot.y + layout.plot.height * ratio}
            stroke="#FFFFFF"
            strokeOpacity={0.1}
            strokeWidth={2}
          />
        ))}
      </svg>

      {layout.bars.map((bar, index) => {
        const isHighlight = index === highlightIndex;
        return (
          <div key={`${bar.label}:${index}`}>
            <div
              style={{
                position: "absolute",
                left: bar.x,
                top: bar.y,
                width: bar.width,
                height: bar.height,
                borderRadius: 12,
                background: isHighlight
                  ? `linear-gradient(180deg, ${bar.color} 0%, #FFFFFF 160%)`
                  : `linear-gradient(180deg, ${bar.color} 0%, rgba(20, 30, 48, 0.55) 160%)`,
                boxShadow: isHighlight ? "0 0 0 3px rgba(255, 255, 255, 0.55)" : "none"
              }}
            />
            <div
              style={{
                position: "absolute",
                left: bar.x + bar.width * 0.5,
                top: bar.y - 34,
                transform: "translateX(-50%)",
                color: "#F8FAFF",
                fontSize: 26,
                fontWeight: 700
              }}
            >
              {bar.value}
            </div>
            <div
              style={{
                position: "absolute",
                left: bar.x + bar.width * 0.5,
                top: layout.plot.baselineY + 20,
                transform: "translateX(-50%)",
                color: "#BFC8DE",
                fontSize: 24
              }}
            >
              {bar.label}
            </div>
          </div>
        );
      })}
    </div>
  );
};

