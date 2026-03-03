import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

export type FlashCutProps = {
  startFrame: number;
  durationInFrames?: number;
  color?: string;
  maxOpacity?: number;
};

export type GlitchOverlayProps = {
  startFrame: number;
  durationInFrames?: number;
  intensity?: number;
  bars?: number;
};

export type CrossFadeProps = {
  from: ReactNode;
  to: ReactNode;
  startFrame: number;
  durationInFrames: number;
};

export type ZoomTransitionProps = {
  from: ReactNode;
  to: ReactNode;
  startFrame: number;
  durationInFrames: number;
  amount?: number;
};

export type WhipPanDirection = "left" | "right";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function pseudo(value: number): number {
  const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

export function flashCut(t: number): number {
  const x = clamp(t, 0, 1);
  if (x <= 0.5) {
    return 1 - x * 0.35;
  }
  return Math.max(0, 1 - (x - 0.5) * 2);
}

export function crossfade(t: number): { from: number; to: number } {
  const x = smoothStep(t);
  return {
    from: 1 - x,
    to: x
  };
}

export function whipPan(
  t: number,
  direction: WhipPanDirection = "right"
): { x: number; rotDeg: number; blurPx: number; opacity: number } {
  const x = clamp(t, 0, 1);
  const dir = direction === "left" ? -1 : 1;

  const move =
    x < 0.65
      ? dir * (120 + x * 1180)
      : dir * (880 - (x - 0.65) * 2200);

  const rotDeg = dir * (x < 0.7 ? 9 * (x / 0.7) : 9 - (x - 0.7) * 25);
  const blurPx = x < 0.55 ? 2 + x * 14 : Math.max(0, 10 - (x - 0.55) * 20);
  const opacity = x < 0.1 ? x / 0.1 : x > 0.95 ? (1 - x) / 0.05 : 1;

  return {
    x: Number.isFinite(move) ? move : 0,
    rotDeg: Number.isFinite(rotDeg) ? rotDeg : 0,
    blurPx: Number.isFinite(blurPx) ? Math.max(0, blurPx) : 0,
    opacity: clamp(opacity, 0, 1)
  };
}

export function glitchOverlay(t: number): { opacity: number; splitPx: number; jitterPx: number } {
  const x = clamp(t, 0, 1);
  const envelope = x < 0.2 ? x / 0.2 : x > 0.85 ? (1 - x) / 0.15 : 1;
  return {
    opacity: clamp(envelope * 0.75, 0, 1),
    splitPx: 2 + envelope * 10,
    jitterPx: 6 + envelope * 28
  };
}

export function zoomTransition(
  t: number,
  amount: number = 0.2
): {
  fromOpacity: number;
  toOpacity: number;
  fromScale: number;
  toScale: number;
  blurPx: number;
} {
  const x = clamp(t, 0, 1);
  const s = smoothStep(x);
  const safeAmount = clamp(amount, 0.05, 0.45);

  return {
    fromOpacity: 1 - s,
    toOpacity: s,
    fromScale: 1 + safeAmount * s,
    toScale: 1 + safeAmount * (1 - s) * 0.35,
    blurPx: clamp((1 - Math.abs(0.5 - s) * 2) * safeAmount * 14, 0, 7)
  };
}

export const FlashCut = ({
  startFrame,
  durationInFrames = 6,
  color = "#FFFFFF",
  maxOpacity = 1
}: FlashCutProps) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  if (local < 0 || local > durationInFrames) {
    return null;
  }

  const t = clamp(local / Math.max(1, durationInFrames), 0, 1);
  const opacity = flashCut(t) * clamp(maxOpacity, 0, 1);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color,
        opacity,
        mixBlendMode: "screen",
        pointerEvents: "none"
      }}
    />
  );
};

export const GlitchOverlay = ({
  startFrame,
  durationInFrames = 14,
  intensity = 1,
  bars = 12
}: GlitchOverlayProps) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;

  if (local < 0 || local > durationInFrames) {
    return null;
  }

  const t = clamp(local / Math.max(1, durationInFrames), 0, 1);
  const effect = glitchOverlay(t);
  const safeIntensity = Math.max(0, intensity);

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: effect.opacity }}>
      <AbsoluteFill
        style={{
          mixBlendMode: "screen",
          opacity: 0.45,
          transform: `translateX(${(effect.splitPx * safeIntensity).toFixed(1)}px)`
        }}
      >
        <AbsoluteFill style={{ background: "rgba(255, 64, 64, 0.09)" }} />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          mixBlendMode: "screen",
          opacity: 0.45,
          transform: `translateX(${(-effect.splitPx * safeIntensity).toFixed(1)}px)`
        }}
      >
        <AbsoluteFill style={{ background: "rgba(64, 220, 255, 0.09)" }} />
      </AbsoluteFill>

      {Array.from({ length: Math.max(1, bars) }).map((_, index) => {
        const jitterBase = (pseudo(index * 11 + frame * 1.7) - 0.5) * effect.jitterPx * safeIntensity;
        const hue = 170 + pseudo(index * 3.1) * 140;
        const top = ((index + pseudo(index * 0.8) * 0.7) / Math.max(1, bars)) * 100;
        const height = 2 + pseudo(index * 5.2) * 7;

        return (
          <div
            key={`glitch-${index}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${top}%`,
              height: `${height}%`,
              transform: `translateX(${jitterBase.toFixed(1)}px)`,
              background: `linear-gradient(90deg, hsla(${hue.toFixed(1)}, 95%, 62%, 0.0), hsla(${hue.toFixed(
                1
              )}, 95%, 62%, 0.45), hsla(${hue.toFixed(1)}, 95%, 62%, 0.0))`,
              mixBlendMode: "screen"
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const CrossFade = ({ from, to, startFrame, durationInFrames }: CrossFadeProps) => {
  const frame = useCurrentFrame();
  const t = clamp((frame - startFrame) / Math.max(1, durationInFrames), 0, 1);
  const mix = crossfade(t);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: mix.from }}>{from}</AbsoluteFill>
      <AbsoluteFill style={{ opacity: mix.to }}>{to}</AbsoluteFill>
    </AbsoluteFill>
  );
};

export const ZoomTransition = ({
  from,
  to,
  startFrame,
  durationInFrames,
  amount = 0.2
}: ZoomTransitionProps) => {
  const frame = useCurrentFrame();
  const t = clamp((frame - startFrame) / Math.max(1, durationInFrames), 0, 1);
  const z = zoomTransition(t, amount);

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: z.fromOpacity,
          transform: `scale(${z.fromScale.toFixed(4)})`,
          transformOrigin: "50% 50%",
          filter: z.blurPx > 0.01 ? `blur(${z.blurPx.toFixed(2)}px)` : undefined
        }}
      >
        {from}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          opacity: z.toOpacity,
          transform: `scale(${z.toScale.toFixed(4)})`,
          transformOrigin: "50% 50%",
          filter: z.blurPx > 0.01 ? `blur(${(z.blurPx * 0.55).toFixed(2)}px)` : undefined
        }}
      >
        {to}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
