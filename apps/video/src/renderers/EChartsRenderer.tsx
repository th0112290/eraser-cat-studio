import { interpolate, spring } from "remotion";
import { createBarChartLayout } from "../templates/BarChart";
import type {
  RendererChartRow,
  RendererFinishProfile,
  RendererVisualObjectKind
} from "./types";

type EChartsRendererProps = {
  width: number;
  height: number;
  kind?: RendererVisualObjectKind;
  title: string;
  subtitle?: string;
  badges: string[];
  chartData: RendererChartRow[];
  callout?: string;
  annotationsEnabled: boolean;
  localFrame: number;
  fps: number;
  emphasisAtFrame: number;
  pointerIndex: number;
  highlightIndices: number[];
  finishProfile: RendererFinishProfile;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function buildLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return "";
  }
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function approximatePathLength(points: Array<{ x: number; y: number }>): number {
  if (points.length <= 1) {
    return 0;
  }
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index].x - points[index - 1].x;
    const dy = points[index].y - points[index - 1].y;
    length += Math.hypot(dx, dy);
  }
  return length;
}

function resolvePalette(kind: RendererVisualObjectKind | undefined, tone: RendererFinishProfile["tone"]) {
  if (kind === "line_chart") {
    return {
      primary: tone === "economy_crisp" ? "#45d0ff" : "#7ee7c8",
      secondary: "#ffd166",
      grid: "rgba(255, 255, 255, 0.12)",
      label: "#e9f4ff"
    };
  }
  return {
    primary: tone === "medical_soft" ? "#7ee7c8" : "#66a3ff",
    secondary: tone === "economy_crisp" ? "#ffd166" : "#8ad6ff",
    grid: "rgba(255, 255, 255, 0.12)",
    label: "#eef6ff"
  };
}

export const EChartsRenderer = ({
  width,
  height,
  kind,
  title,
  subtitle,
  badges,
  chartData,
  callout,
  annotationsEnabled,
  localFrame,
  fps,
  emphasisAtFrame,
  pointerIndex,
  highlightIndices,
  finishProfile
}: EChartsRendererProps) => {
  const rows = chartData.length > 0 ? chartData : [{ label: "Signal", value: 1 }];
  const layout = createBarChartLayout({
    width,
    height,
    data: rows.map((row, index) => ({
      label: row.label,
      value: row.value,
      color: index % 2 === 0 ? "#66A3FF" : "#53D1B6"
    })),
    safeArea: {
      top: 18,
      right: 28,
      bottom: 18,
      left: 30
    },
    barGap: rows.length >= 5 ? 18 : 24
  });
  const palette = resolvePalette(kind, finishProfile.tone);
  const highlightSet = new Set(highlightIndices);
  const targetIndex = clamp(pointerIndex, 0, Math.max(0, rows.length - 1));
  const lineReveal = clamp(
    interpolate(localFrame, [0, Math.max(18, Math.floor(fps * 0.7))], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }),
    0,
    1
  );
  const pulseEnvelope = clamp(1 - Math.abs(localFrame - emphasisAtFrame) / 22, 0, 1);
  const linePoints = layout.bars.map((bar, index) => {
    const reveal = clamp(
      spring({
        fps,
        frame: localFrame - index * 2,
        config: {
          damping: 12,
          stiffness: 116,
          mass: 0.72
        }
      }),
      0,
      1.08
    );
    const resolvedHeight = Math.max(4, bar.height * reveal);
    const resolvedTop = bar.y + bar.height - resolvedHeight;
    return {
      x: bar.x + bar.width * 0.5,
      y: resolvedTop,
      top: resolvedTop,
      height: resolvedHeight
    };
  });
  const linePath = buildLinePath(linePoints);
  const lineLength = approximatePathLength(linePoints);
  const lineAreaPath =
    linePoints.length > 0
      ? `${linePath} L ${linePoints[linePoints.length - 1].x.toFixed(2)} ${layout.plot.baselineY.toFixed(2)} L ${linePoints[0].x.toFixed(2)} ${layout.plot.baselineY.toFixed(2)} Z`
      : "";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 22,
        border: "1px solid rgba(255, 255, 255, 0.18)",
        background: "linear-gradient(180deg, rgba(8, 14, 27, 0.96) 0%, rgba(5, 9, 18, 0.94) 100%)",
        overflow: "hidden",
        boxShadow: "0 18px 40px rgba(0, 0, 0, 0.32)"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: finishProfile.tintGradient,
          opacity: Math.min(0.18, finishProfile.tintOpacity * 1.6)
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 24,
          right: 24,
          top: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16
        }}
      >
        <div style={{ maxWidth: width * 0.56 }}>
          <div
            style={{
              color: "#eff7ff",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 0.2
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                marginTop: 8,
                color: "rgba(232, 241, 255, 0.76)",
                fontSize: 20,
                lineHeight: 1.35
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, maxWidth: width * 0.34 }}>
          {badges.map((badge) => (
            <div
              key={badge}
              style={{
                padding: "7px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255, 255, 255, 0.16)",
                background: "rgba(255, 255, 255, 0.06)",
                color: "#deebff",
                fontSize: 14,
                fontWeight: 600
              }}
            >
              {badge}
            </div>
          ))}
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
          rx={18}
          fill="rgba(255, 255, 255, 0.02)"
          stroke="rgba(255, 255, 255, 0.08)"
        />
        {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
          <line
            key={ratio}
            x1={layout.plot.x}
            y1={layout.plot.y + layout.plot.height * ratio}
            x2={layout.plot.x + layout.plot.width}
            y2={layout.plot.y + layout.plot.height * ratio}
            stroke={palette.grid}
            strokeWidth={1.5}
            strokeDasharray="5 10"
          />
        ))}
        <line
          x1={layout.plot.x}
          y1={layout.plot.baselineY}
          x2={layout.plot.x + layout.plot.width}
          y2={layout.plot.baselineY}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth={2}
        />

        {kind === "line_chart" && lineAreaPath ? (
          <path d={lineAreaPath} fill={`${palette.primary}22`} stroke="none" />
        ) : null}

        {kind === "line_chart" && linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke={palette.primary}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={lineLength}
            strokeDashoffset={lineLength * (1 - lineReveal)}
            style={{
              filter: `drop-shadow(0 0 ${8 + pulseEnvelope * 10}px ${palette.primary}66)`
            }}
          />
        ) : null}
      </svg>

      {layout.bars.map((bar, index) => {
        const reveal = linePoints[index];
        const growProgress = clamp(reveal.height / Math.max(1, bar.height), 0, 1.18);
        const isFocused = index === targetIndex;
        const isHighlighted = highlightSet.has(index);
        const pulseScale =
          isFocused && kind !== "line_chart"
            ? 1 + pulseEnvelope * (0.04 + clamp(
                spring({
                  fps,
                  frame: localFrame - emphasisAtFrame,
                  config: {
                    damping: 14,
                    stiffness: 180,
                    mass: 0.5
                  }
                }),
                0,
                1.2
              ) * 0.04)
            : 1;
        const valueText = Math.round(lerp(0, rows[index]?.value ?? 0, clamp(growProgress, 0, 1)));
        const unit = rows[index]?.unit;

        return (
          <div key={`${bar.label}:${index}`}>
            {kind === "line_chart" ? (
              <div
                style={{
                  position: "absolute",
                  left: reveal.x - 8,
                  top: reveal.y - 8,
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  background: isFocused ? palette.secondary : palette.primary,
                  border: "2px solid rgba(5, 9, 18, 0.9)",
                  boxShadow:
                    isHighlighted || isFocused ? `0 0 0 6px ${palette.secondary}22, 0 0 18px ${palette.secondary}55` : undefined,
                  opacity: clamp((lineReveal - index * 0.08) * 1.3, 0, 1)
                }}
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  left: bar.x,
                  top: reveal.top,
                  width: bar.width,
                  height: reveal.height,
                  borderRadius: 12,
                  background: isFocused
                    ? `linear-gradient(180deg, ${palette.secondary} 0%, ${palette.primary} 150%)`
                    : `linear-gradient(180deg, ${palette.primary} 0%, rgba(32, 59, 104, 0.52) 160%)`,
                  boxShadow:
                    isHighlighted || isFocused ? `0 0 0 2px ${palette.secondary}88, 0 0 18px ${palette.secondary}44` : undefined,
                  transform: `scale(${pulseScale}, ${1 + pulseEnvelope * 0.06})`,
                  transformOrigin: "50% 100%"
                }}
              />
            )}

            <div
              style={{
                position: "absolute",
                left: bar.x + bar.width * 0.5,
                top: reveal.y - 34,
                transform: "translateX(-50%)",
                color: palette.label,
                fontSize: 18,
                fontWeight: 700
              }}
            >
              {valueText}
              {unit ? ` ${unit}` : ""}
            </div>

            <div
              style={{
                position: "absolute",
                left: bar.x + bar.width * 0.5,
                top: height - 54,
                transform: "translateX(-50%)",
                color: "rgba(226, 237, 255, 0.8)",
                fontSize: 18,
                fontWeight: isFocused ? 700 : 500
              }}
            >
              {bar.label}
            </div>
          </div>
        );
      })}

      {annotationsEnabled && callout ? (
        <div
          style={{
            position: "absolute",
            left: 24,
            right: 24,
            bottom: 18,
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: 12,
            alignItems: "center",
            padding: "12px 14px",
            borderRadius: 16,
            border: "1px solid rgba(255, 255, 255, 0.14)",
            background: "rgba(6, 12, 22, 0.72)",
            color: "#eff6ff"
          }}
        >
          <div
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.08)",
              color: "#cfe2ff",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.4
            }}
          >
            ECHARTS
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 1.35
            }}
          >
            {callout}
          </div>
        </div>
      ) : null}
    </div>
  );
};
