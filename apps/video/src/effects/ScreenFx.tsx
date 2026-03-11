import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export type ScreenFxProps = {
  bloomOpacity?: number;
  grainOpacity?: number;
  scanlineOpacity?: number;
  vignetteOpacity?: number;
  tintOpacity?: number;
  tintGradient?: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const ScreenFx = ({
  bloomOpacity = 0,
  grainOpacity = 0.12,
  scanlineOpacity = 0.2,
  vignetteOpacity = 0.42,
  tintOpacity = 0.08,
  tintGradient = "linear-gradient(160deg, rgba(0, 216, 255, 0.4), rgba(255, 76, 0, 0.34) 60%, rgba(255, 220, 96, 0.3))"
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
          opacity: bloomOpacity,
          background:
            "radial-gradient(circle at 50% 36%, rgba(255,255,255,0.28) 0%, rgba(255,242,214,0.16) 18%, rgba(255,255,255,0) 56%)",
          mixBlendMode: "screen",
          filter: "blur(18px)"
        }}
      />

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
          background: tintGradient,
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
