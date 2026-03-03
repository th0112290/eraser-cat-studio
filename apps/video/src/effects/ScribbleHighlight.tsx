import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export type ScribbleRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScribbleHighlightProps = {
  width: number;
  height: number;
  rect: ScribbleRect;
  startFrame: number;
  durationInFrames?: number;
  color?: string;
  strokeWidth?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pseudo(value: number): number {
  const raw = Math.sin(value * 18.211 + 41.77) * 10000.314;
  return raw - Math.floor(raw);
}

function createScribblePath(rect: ScribbleRect, seed: number): string {
  const pad = 16;
  const jitter = 9;

  const x0 = rect.x - pad;
  const y0 = rect.y - pad;
  const x1 = rect.x + rect.width + pad;
  const y1 = rect.y + rect.height + pad;

  const j = (index: number) => (pseudo(seed + index) - 0.5) * jitter;

  const p0 = `${x0 + j(1)} ${y0 + j(2)}`;
  const p1 = `${x1 + j(3)} ${y0 + j(4)}`;
  const p2 = `${x1 + j(5)} ${y1 + j(6)}`;
  const p3 = `${x0 + j(7)} ${y1 + j(8)}`;

  return `M ${p0} L ${p1} L ${p2} L ${p3} Z`;
}

export const ScribbleHighlight = ({
  width,
  height,
  rect,
  startFrame,
  durationInFrames = 26,
  color = "#FFF27A",
  strokeWidth = 8
}: ScribbleHighlightProps) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  if (local < 0) {
    return null;
  }

  const draw = clamp(local / Math.max(1, durationInFrames), 0, 1);
  const opacity = interpolate(draw, [0, 0.2, 1], [0, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const fadeTail = local > durationInFrames ? interpolate(local, [durationInFrames, durationInFrames + 24], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  }) : 1;

  const totalOpacity = opacity * fadeTail;

  const pathA = createScribblePath(rect, 11);
  const pathB = createScribblePath(
    {
      x: rect.x + 4,
      y: rect.y + 3,
      width: rect.width - 2,
      height: rect.height - 2
    },
    27
  );

  const perimeter = (rect.width + rect.height) * 2 + 160;
  const dashOffset = (1 - draw) * perimeter;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: totalOpacity }}>
      <svg width={width} height={height}>
        <path
          d={pathA}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={perimeter}
          strokeDashoffset={dashOffset}
          style={{ filter: "drop-shadow(0 0 12px rgba(255, 242, 122, 0.55))" }}
        />
        <path
          d={pathB}
          fill="none"
          stroke={color}
          strokeWidth={Math.max(2, strokeWidth - 3)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={perimeter}
          strokeDashoffset={dashOffset * 1.08}
          opacity={0.8}
        />
      </svg>
    </AbsoluteFill>
  );
};
