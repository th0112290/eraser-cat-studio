import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { crossfade, flashCut, glitchOverlay, whipPan, zoomTransition, type WhipPanDirection } from "./Transitions";

export type ShotTransitionType = "crossfade" | "flashCut" | "whipPan" | "glitchCut" | "zoomCut";

export type ShotTransitionProps = {
  fromFrame: number;
  durationFrames: number;
  type?: ShotTransitionType;
  prev: ReactNode;
  next: ReactNode;
  direction?: WhipPanDirection;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const ShotTransition = ({
  fromFrame,
  durationFrames,
  type = "crossfade",
  prev,
  next,
  direction = "right"
}: ShotTransitionProps) => {
  const frame = useCurrentFrame();
  const safeDuration = Math.max(1, durationFrames);
  const local = frame - fromFrame;

  if (local <= 0) {
    return <>{prev}</>;
  }

  if (local >= safeDuration) {
    return <>{next}</>;
  }

  const t = clamp(local / safeDuration, 0, 1);

  if (type === "whipPan") {
    const motion = whipPan(t, direction);
    const dir = direction === "left" ? -1 : 1;

    return (
      <AbsoluteFill>
        <AbsoluteFill
          style={{
            transform: `translateX(${motion.x.toFixed(2)}px) rotate(${motion.rotDeg.toFixed(2)}deg)`,
            filter: motion.blurPx > 0 ? `blur(${motion.blurPx.toFixed(2)}px)` : undefined,
            opacity: 1 - t * 0.35
          }}
        >
          {prev}
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            transform: `translateX(${(motion.x - dir * 420).toFixed(2)}px) rotate(${(motion.rotDeg * 0.45).toFixed(
              2
            )}deg)`,
            filter: motion.blurPx > 0 ? `blur(${(motion.blurPx * 0.6).toFixed(2)}px)` : undefined,
            opacity: clamp(t * 1.15, 0, 1)
          }}
        >
          {next}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (type === "glitchCut") {
    const mix = crossfade(t);
    const glitch = glitchOverlay(t);

    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ opacity: mix.from }}>{prev}</AbsoluteFill>
        <AbsoluteFill style={{ opacity: mix.to }}>{next}</AbsoluteFill>
        <AbsoluteFill
          style={{
            pointerEvents: "none",
            opacity: glitch.opacity,
            mixBlendMode: "screen"
          }}
        >
          <AbsoluteFill
            style={{
              background: "rgba(255, 72, 72, 0.14)",
              transform: `translateX(${glitch.splitPx.toFixed(1)}px)`
            }}
          />
          <AbsoluteFill
            style={{
              background: "rgba(72, 210, 255, 0.14)",
              transform: `translateX(${(-glitch.splitPx).toFixed(1)}px)`
            }}
          />
          <AbsoluteFill
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, rgba(255,255,255,0.0) 0px, rgba(255,255,255,0.0) 3px, rgba(255,255,255,0.16) 4px, rgba(255,255,255,0.0) 6px)",
              transform: `translateX(${(glitch.jitterPx * 0.35).toFixed(1)}px)`
            }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (type === "zoomCut") {
    const zoom = zoomTransition(t, 0.24);

    return (
      <AbsoluteFill>
        <AbsoluteFill
          style={{
            opacity: zoom.fromOpacity,
            transform: `scale(${zoom.fromScale.toFixed(4)})`,
            transformOrigin: "50% 50%",
            filter: zoom.blurPx > 0.01 ? `blur(${zoom.blurPx.toFixed(2)}px)` : undefined
          }}
        >
          {prev}
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            opacity: zoom.toOpacity,
            transform: `scale(${zoom.toScale.toFixed(4)})`,
            transformOrigin: "50% 50%",
            filter: zoom.blurPx > 0.01 ? `blur(${(zoom.blurPx * 0.55).toFixed(2)}px)` : undefined
          }}
        >
          {next}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const mix = crossfade(t);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: mix.from }}>{prev}</AbsoluteFill>
      <AbsoluteFill style={{ opacity: mix.to }}>{next}</AbsoluteFill>
      {type === "flashCut" ? (
        <AbsoluteFill
          style={{
            backgroundColor: "#FFFFFF",
            opacity: flashCut(t) * 0.68,
            mixBlendMode: "screen",
            pointerEvents: "none"
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
