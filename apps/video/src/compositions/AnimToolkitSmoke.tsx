import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { dampedSpring, delayed, easeInOut, overshoot } from "../anim/easing";
import { anticipation, followThrough, settle } from "../anim/motion";
import { noise1D, noise2D } from "../anim/noise";
import { hashStringToSeed, mulberry32 } from "../anim/seed";

const WIDTH = 1920;
const HEIGHT = 1080;
const BASE_SEED_STR = "anim-toolkit-smoke-v1";

type Dot = {
  x: number;
  y: number;
  r: number;
  hue: number;
  phase: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildDots(seed: number, count: number): Dot[] {
  const rng = mulberry32(seed);
  const dots: Dot[] = [];

  for (let i = 0; i < count; i += 1) {
    dots.push({
      x: 180 + rng() * (WIDTH - 360),
      y: 180 + rng() * (HEIGHT - 360),
      r: 8 + rng() * 26,
      hue: Math.floor(180 + rng() * 120),
      phase: rng() * Math.PI * 2
    });
  }

  return dots;
}

export const AnimToolkitSmokeComposition = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const seed = hashStringToSeed(BASE_SEED_STR);
  const time = frame / fps;
  const progress = clamp(frame / Math.max(1, durationInFrames - 1), 0, 1);

  const dots = buildDots(seed, 16);

  const primaryX = anticipation(180, WIDTH - 220, progress);
  const primaryY = settle(220, HEIGHT - 260, easeInOut(progress));

  const followProgress = clamp(followThrough(progress, 9), 0, 1);
  const followerX = settle(180, WIDTH - 220, followProgress);
  const followerY = settle(220, HEIGHT - 260, clamp(followThrough(progress, 14), 0, 1));

  const springT = clamp(
    dampedSpring(delayed(frame, 8), fps, {
      damping: 14,
      stiffness: 110,
      mass: 0.8,
      overshootClamping: false
    }),
    0,
    1.2
  );

  const pulse = 0.85 + overshoot(clamp(springT, 0, 1), 0.2) * 0.18;
  const jitterX = noise1D(seed + 17, time * 2.2) * 18;
  const jitterY = noise1D(seed + 23, time * 1.9) * 14;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 18% 20%, rgba(93, 161, 255, 0.20), transparent 42%), linear-gradient(160deg, #0a101d 0%, #111a30 60%, #081122 100%)",
        overflow: "hidden",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 70,
          color: "#dbe9ff",
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: 0.8
        }}
      >
        ANIM TOOLKIT SMOKE (seeded)
      </div>

      <div
        style={{
          position: "absolute",
          left: 82,
          top: 128,
          color: "#8ea5cc",
          fontSize: 24
        }}
      >
        seed: {BASE_SEED_STR}
      </div>

      {dots.map((dot, index) => {
        const nx = noise2D(seed + index * 13, index * 0.41, time * 0.95);
        const ny = noise2D(seed + index * 19, time * 0.85, index * 0.53);
        const driftX = nx * (12 + index * 0.6);
        const driftY = ny * (10 + index * 0.5);
        const glow = 0.22 + (noise1D(seed + index * 29, time * 1.4 + dot.phase) + 1) * 0.12;

        return (
          <div
            key={`dot-${index}`}
            style={{
              position: "absolute",
              left: dot.x + driftX,
              top: dot.y + driftY,
              width: dot.r,
              height: dot.r,
              borderRadius: "50%",
              background: `hsla(${dot.hue} 88% 68% / ${glow})`,
              boxShadow: `0 0 ${dot.r * 1.8}px hsla(${dot.hue} 88% 68% / ${glow})`
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          left: followerX - 52,
          top: followerY - 52,
          width: 104,
          height: 104,
          borderRadius: 26,
          border: "3px solid rgba(120, 214, 255, 0.7)",
          background: "rgba(58, 170, 220, 0.14)",
          transform: `rotate(${noise1D(seed + 77, time * 2.4) * 12}deg)`
        }}
      />

      <div
        style={{
          position: "absolute",
          left: primaryX - 66 + jitterX,
          top: primaryY - 66 + jitterY,
          width: 132,
          height: 132,
          borderRadius: 36,
          background: "linear-gradient(160deg, #8df4d8 0%, #2aa7d8 100%)",
          transform: `scale(${pulse}) rotate(${noise1D(seed + 31, time * 1.6) * 14}deg)`,
          boxShadow: "0 20px 44px rgba(42, 167, 216, 0.35)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 80,
          bottom: 76,
          color: "#9eb6de",
          fontSize: 22,
          lineHeight: 1.5
        }}
      >
        easeInOut / anticipation / settle / followThrough / dampedSpring / noise1D / noise2D
      </div>
    </AbsoluteFill>
  );
};
