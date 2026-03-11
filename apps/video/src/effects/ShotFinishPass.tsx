import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { ScreenFx } from "./ScreenFx";

export type ShotFinishPassProps = {
  grainOpacity: number;
  scanlineOpacity: number;
  vignetteOpacity: number;
  tintOpacity: number;
  bloomOpacity: number;
  sharpenOpacity: number;
  toneOverlayOpacity: number;
  toneOverlayColor: string;
  textureMatchOpacity: number;
  paletteContinuityOpacity: number;
  linePreserveOpacity: number;
  renderPathCompensation: "deterministic" | "sidecar_wan" | "sidecar_hunyuan";
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const ShotFinishPass = ({
  grainOpacity,
  scanlineOpacity,
  vignetteOpacity,
  tintOpacity,
  bloomOpacity,
  sharpenOpacity,
  toneOverlayOpacity,
  toneOverlayColor,
  textureMatchOpacity,
  paletteContinuityOpacity,
  linePreserveOpacity,
  renderPathCompensation
}: ShotFinishPassProps) => {
  const frame = useCurrentFrame();
  const shimmer = interpolate(Math.sin(frame * 0.06 + 0.7), [-1, 1], [0.92, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const bloom = clamp(bloomOpacity * shimmer, 0, 1);
  const sharpen = clamp(sharpenOpacity * (0.94 + Math.sin(frame * 0.04 + 1.1) * 0.04), 0, 1);
  const texturePulse = clamp(textureMatchOpacity * (0.95 + Math.sin(frame * 0.035 + 0.4) * 0.08), 0, 1);
  const palettePulse = clamp(paletteContinuityOpacity * (0.96 + Math.sin(frame * 0.025 + 1.7) * 0.06), 0, 1);
  const linePreserve = clamp(linePreserveOpacity * (0.96 + Math.sin(frame * 0.05 + 0.25) * 0.05), 0, 1);
  const pathHighlight =
    renderPathCompensation === "sidecar_wan"
      ? "rgba(255,244,222,0.42)"
      : renderPathCompensation === "sidecar_hunyuan"
        ? "rgba(226,240,255,0.38)"
        : "rgba(255,255,255,0.26)";

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <ScreenFx
        grainOpacity={grainOpacity}
        scanlineOpacity={scanlineOpacity}
        vignetteOpacity={vignetteOpacity}
        tintOpacity={tintOpacity}
      />

      <AbsoluteFill
        style={{
          opacity: toneOverlayOpacity,
          background: `linear-gradient(180deg, ${toneOverlayColor}, transparent 52%, ${toneOverlayColor})`,
          mixBlendMode: "soft-light"
        }}
      />

      <AbsoluteFill
        style={{
          opacity: palettePulse,
          background: `radial-gradient(circle at 50% 18%, ${toneOverlayColor} 0%, transparent 58%), linear-gradient(180deg, transparent, ${toneOverlayColor})`,
          mixBlendMode: "color"
        }}
      />

      <AbsoluteFill
        style={{
          opacity: texturePulse,
          background:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.02) 2px, rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.01) 6px)",
          mixBlendMode: "overlay"
        }}
      />

      <AbsoluteFill
        style={{
          opacity: bloom,
          background:
            "radial-gradient(circle at 50% 22%, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.12) 18%, rgba(255,255,255,0.02) 38%, rgba(255,255,255,0) 62%)",
          mixBlendMode: "screen"
        }}
      />

      <AbsoluteFill
        style={{
          opacity: sharpen,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 18%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.08) 100%)",
          mixBlendMode: "overlay"
        }}
      />

      <AbsoluteFill
        style={{
          opacity: linePreserve,
          background: `linear-gradient(180deg, ${pathHighlight}, rgba(255,255,255,0.02) 22%, rgba(0,0,0,0) 48%, rgba(0,0,0,0.16) 100%)`,
          mixBlendMode: "hard-light"
        }}
      />
    </AbsoluteFill>
  );
};
