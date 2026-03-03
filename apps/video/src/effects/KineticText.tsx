import { useMemo } from "react";
import type { CSSProperties } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export type KineticTextProps = {
  text: string;
  fromFrame: number;
  wordStaggerInFrames?: number;
  emphasisWords?: string[];
  baseColor?: string;
  emphasisColor?: string;
  fontSize?: number;
  style?: CSSProperties;
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gi, "");
}

export const KineticText = ({
  text,
  fromFrame,
  wordStaggerInFrames = 3,
  emphasisWords,
  baseColor = "#F8FAFF",
  emphasisColor = "#FFD95A",
  fontSize = 74,
  style
}: KineticTextProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = useMemo(() => text.split(/\s+/).filter((token) => token.trim() !== ""), [text]);
  const emphasisSet = useMemo(
    () => new Set((emphasisWords ?? []).map((token) => normalizeToken(token))),
    [emphasisWords]
  );

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: 16,
        rowGap: 10,
        alignItems: "center",
        ...style
      }}
    >
      {words.map((word, index) => {
        const token = normalizeToken(word);
        const isEmphasis = emphasisSet.has(token);

        const reveal = spring({
          fps,
          frame: frame - (fromFrame + index * wordStaggerInFrames),
          config: {
            damping: 11,
            stiffness: 170,
            mass: 0.6
          }
        });

        const opacity = interpolate(reveal, [0, 0.2, 1], [0, 0.45, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });

        const translateY = interpolate(reveal, [0, 1], [34, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });

        const baseScale = interpolate(reveal, [0, 1], [0.76, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });

        const pulseEnvelope = Math.max(0, 1 - Math.abs((frame - (fromFrame + index * wordStaggerInFrames)) / 26));
        const pulse = isEmphasis ? 1 + Math.sin(frame * 0.3 + index) * 0.06 * pulseEnvelope : 1;

        return (
          <span
            key={`${word}-${index}`}
            style={{
              display: "inline-block",
              opacity,
              transform: `translateY(${translateY.toFixed(2)}px) scale(${(baseScale * pulse).toFixed(4)})`,
              color: isEmphasis ? emphasisColor : baseColor,
              textShadow: isEmphasis ? "0 0 18px rgba(255, 209, 77, 0.6)" : "0 0 8px rgba(0, 0, 0, 0.28)",
              fontSize,
              fontWeight: 900,
              letterSpacing: 1.2,
              lineHeight: 1.05,
              textTransform: "uppercase"
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};
