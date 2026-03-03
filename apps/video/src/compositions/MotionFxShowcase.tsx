import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { MotionBlurGhost } from "../effects/MotionBlurGhost";
import { Smear } from "../effects/Smear";

const WIDTH = 1920;
const HEIGHT = 1080;
const SPLIT_FRAME = 180;
const CYCLE_FRAMES = 48;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

type Position = {
  x: number;
  y: number;
};

function getRectPosition(localFrame: number): Position {
  const cycleFrame = ((localFrame % CYCLE_FRAMES) + CYCLE_FRAMES) % CYCLE_FRAMES;
  const half = CYCLE_FRAMES / 2;
  const forward = cycleFrame < half;
  const t = forward ? cycleFrame / half : (cycleFrame - half) / half;
  const eased = smoothStep(t);

  const x = forward
    ? interpolate(eased, [0, 1], [220, 1560], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      })
    : interpolate(eased, [0, 1], [1560, 220], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      });

  const y = 560 + Math.sin(localFrame * 0.22) * 14;

  return { x, y };
}

type SpeedVector = {
  dx: number;
  dy: number;
  speed: number;
};

function getVelocity(localFrame: number): SpeedVector {
  const now = getRectPosition(localFrame);
  const prev = getRectPosition(localFrame - 1);
  const dx = now.x - prev.x;
  const dy = now.y - prev.y;

  return {
    dx,
    dy,
    speed: Math.hypot(dx, dy)
  };
}

export const MotionFxShowcaseComposition = () => {
  const frame = useCurrentFrame();
  const inFxScene = frame >= SPLIT_FRAME;
  const sceneFrame = inFxScene ? frame - SPLIT_FRAME : frame;

  const pos = getRectPosition(sceneFrame);
  const velocity = getVelocity(sceneFrame);

  const effectStrength = clamp(velocity.speed / 56, 0, 1);
  const smearAmount = clamp(velocity.speed * 2.2, 0, 110);
  const smearActive = inFxScene && velocity.speed > 2.2;

  const sceneFade = inFxScene
    ? interpolate(frame, [SPLIT_FRAME - 12, SPLIT_FRAME + 10], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      })
    : 0;

  const badge = (
    <div
      style={{
        position: "absolute",
        left: 88,
        top: 82,
        padding: "12px 18px",
        borderRadius: 12,
        border: "1px solid rgba(255, 255, 255, 0.22)",
        background: "rgba(10, 17, 30, 0.58)",
        color: "#EAF2FF",
        fontSize: 34,
        fontWeight: 700,
        letterSpacing: 0.6
      }}
    >
      {inFxScene ? "WITH SMEAR + GHOST BLUR" : "NO SMEAR / NO BLUR"}
    </div>
  );

  const laneGuide = (
    <div
      style={{
        position: "absolute",
        left: 140,
        top: 525,
        width: WIDTH - 280,
        height: 94,
        borderRadius: 22,
        border: "2px dashed rgba(255, 255, 255, 0.2)",
        background: "rgba(255, 255, 255, 0.02)"
      }}
    />
  );

  const movingRect = (
    <div
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: 220,
        height: 92,
        borderRadius: 16,
        background: "linear-gradient(135deg, #FFB259 0%, #FF6B52 100%)",
        boxShadow: "0 18px 30px rgba(0, 0, 0, 0.28)"
      }}
    />
  );

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 18% 20%, rgba(127, 183, 255, 0.16), transparent 40%), linear-gradient(160deg, #0A1020 0%, #121E38 58%, #081223 100%)",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        color: "#F5F9FF"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 88,
          top: 24,
          fontSize: 56,
          fontWeight: 800,
          letterSpacing: 1
        }}
      >
        MOTION FX SHOWCASE
      </div>

      {badge}
      {laneGuide}

      {inFxScene ? (
        <MotionBlurGhost strength={effectStrength} samples={4} dx={velocity.dx} dy={velocity.dy}>
          <Smear active={smearActive} amount={smearAmount} direction={{ x: velocity.dx, y: velocity.dy }}>
            {movingRect}
          </Smear>
        </MotionBlurGhost>
      ) : (
        movingRect
      )}

      <div
        style={{
          position: "absolute",
          left: 88,
          bottom: 72,
          color: "#A9BEE3",
          fontSize: 26,
          lineHeight: 1.5
        }}
      >
        fast pass rectangle | speed={velocity.speed.toFixed(2)} | blurStrength={effectStrength.toFixed(2)}
      </div>

      <div
        style={{
          position: "absolute",
          right: 56,
          top: 92,
          width: 460,
          borderRadius: 14,
          padding: "14px 16px",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          background: "rgba(9, 14, 25, 0.54)",
          color: "#D8E6FF",
          fontSize: 22,
          opacity: 0.86 + sceneFade * 0.14
        }}
      >
        Low-cost implementation: layered copies + offset + opacity falloff.
      </div>
    </AbsoluteFill>
  );
};