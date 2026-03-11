import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export type ScreenFxProps = {
  grainOpacity?: number;
  scanlineOpacity?: number;
  vignetteOpacity?: number;
  tintOpacity?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const ScreenFx = ({
  grainOpacity = 0.12,
  scanlineOpacity = 0.2,
  vignetteOpacity = 0.42,
  tintOpacity = 0.08
}: ScreenFxProps) => {
  const frame = useCurrentFrame();

  const flicker = 0.85 + Math.sin(frame * 0.37) * 0.06 + Math.sin(frame * 0.12 + 2.1) * 0.04;
  const grain = clamp(grainOpacity * flicker, 0, 1);

  const scanlineShift = (frame * 1.6) % 4;
  const scanlineAlpha = clamp(scanlineOpacity * (0.9 + Math.sin(frame * 0.23) * 0.08), 0, 1);

  const pulse = interpolate(Math.sin(frame * 0.08), [-1, 1], [0.96, 1.04], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          opacity: grain,
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.14) 0.5px, transparent 1px), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.08) 0.5px, transparent 1px)",
          backgroundSize: "3px 3px, 4px 4px",
          mixBlendMode: "overlay"
        }}
      />

      <AbsoluteFill
        style={{
          opacity: scanlineAlpha,
          transform: `translateY(${scanlineShift.toFixed(2)}px)`,
          backgroundImage:
            "repeating-linear-gradient(180deg, rgba(0,0,0,0.32) 0px, rgba(0,0,0,0.32) 1px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 3px)",
          mixBlendMode: "multiply"
        }}
      />

      <AbsoluteFill
        style={{
          opacity: tintOpacity,
          background: "linear-gradient(160deg, rgba(0, 216, 255, 0.4), rgba(255, 76, 0, 0.34) 60%, rgba(255, 220, 96, 0.3))",
          mixBlendMode: "soft-light"
        }}
      />

      <AbsoluteFill
        style={{
          opacity: vignetteOpacity,
          transform: `scale(${pulse.toFixed(4)})`,
          background:
            "radial-gradient(circle at 50% 46%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.2) 63%, rgba(0,0,0,0.58) 100%)",
          mixBlendMode: "multiply"
        }}
      />
    </AbsoluteFill>
  );
};
