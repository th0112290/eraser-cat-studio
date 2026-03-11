import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export type SidecarStillVideoProps = {
  stillSrc: string;
  durationInFrames: number;
  motionPreset: "slow_push" | "gentle_rise" | "profile_slide";
  backgroundTop: string;
  backgroundBottom: string;
};

const clampDuration = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 90;
  }
  return Math.max(1, Math.round(value));
};

export const SidecarStillVideoComposition: React.FC<SidecarStillVideoProps> = ({
  stillSrc,
  durationInFrames,
  motionPreset,
  backgroundTop,
  backgroundBottom
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = clampDuration(durationInFrames);
  const enter = spring({
    frame,
    fps,
    durationInFrames: Math.min(22, totalFrames),
    config: { damping: 200 }
  });
  const progress = interpolate(frame, [0, Math.max(1, totalFrames - 1)], [0, 1], {
    easing: Easing.inOut(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const translateX =
    motionPreset === "profile_slide"
      ? interpolate(progress, [0, 1], [-54, 36])
      : motionPreset === "gentle_rise"
        ? interpolate(progress, [0, 1], [-12, 14])
        : interpolate(progress, [0, 1], [-24, 20]);
  const translateY =
    motionPreset === "profile_slide"
      ? interpolate(progress, [0, 1], [10, -16])
      : motionPreset === "gentle_rise"
        ? interpolate(progress, [0, 1], [24, -18])
        : interpolate(progress, [0, 1], [12, -10]);
  const scale =
    motionPreset === "profile_slide"
      ? interpolate(progress, [0, 1], [0.96, 1.08])
      : motionPreset === "gentle_rise"
        ? interpolate(progress, [0, 1], [0.98, 1.05])
        : interpolate(progress, [0, 1], [1.01, 1.09]);
  const rotateDeg =
    motionPreset === "profile_slide"
      ? interpolate(progress, [0, 1], [-1.2, 1.1])
      : motionPreset === "gentle_rise"
        ? interpolate(progress, [0, 1], [-0.4, 0.6])
        : interpolate(progress, [0, 1], [-0.8, 0.7]);
  const opacity = interpolate(enter, [0, 1], [0.35, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${backgroundTop} 0%, ${backgroundBottom} 100%)`
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 18% 20%, rgba(255,255,255,0.65), transparent 42%), radial-gradient(circle at 78% 30%, rgba(54,76,110,0.12), transparent 32%), radial-gradient(circle at 50% 80%, rgba(255,244,214,0.18), transparent 28%)"
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center"
        }}
      >
        <div
          style={{
            width: "72%",
            height: "72%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            opacity,
            transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale}) rotate(${rotateDeg}deg)`
          }}
        >
          <Img
            src={staticFile(stillSrc)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              filter: "drop-shadow(0 24px 40px rgba(18, 28, 44, 0.2))"
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
