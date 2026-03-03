import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { delayedSpring, overshootSpring } from "../anim/secondaryMotion";
import { EraserCatViewBlend } from "../character/EraserCatViewBlend";
import { lookAt, move, pointAt } from "../character/EraserCatRig";
import type { RigPose, Vec2 } from "../character/types";
import { turningCharacterPack } from "../character/pack";
import { CameraRig } from "../effects/CameraRig";
import { BarChart, createBarChartLayout, getBarAnchor } from "../templates/BarChart";
import { barDemoData } from "../templates/fixtures/barDemoData";

const WIDTH = 1920;
const HEIGHT = 1080;
const TARGET_BAR_INDEX = 2;
const BLINK_INTERVALS_SEC = [3.2, 4.6, 3.8, 4.9];
const BLINK_DURATION_FRAMES = 7;

const chartLayout = createBarChartLayout({
  width: WIDTH,
  height: HEIGHT,
  data: barDemoData,
  safeArea: {
    top: 56,
    right: 120,
    bottom: 64,
    left: 110
  },
  barGap: 34
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ease(frame: number, range: [number, number], output: [number, number]): number {
  return interpolate(frame, range, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
}

function buildPose(position: Vec2, lookTarget?: Vec2, pointTarget?: Vec2): RigPose {
  let pose = move(position.x, position.y);
  if (lookTarget) {
    pose = lookAt(lookTarget, pose);
  }
  if (pointTarget) {
    pose = pointAt(pointTarget, pose);
  }
  return pose;
}

function getBlink(frame: number, fps: number): number {
  const intervals = BLINK_INTERVALS_SEC.map((seconds) => Math.round(seconds * fps));
  const cycleFrames = intervals.reduce((sum, interval) => sum + interval, 0);
  const localFrame = ((frame % cycleFrames) + cycleFrames) % cycleFrames;

  let cursor = 0;
  for (const interval of intervals) {
    const start = cursor + Math.max(1, interval - BLINK_DURATION_FRAMES - 2);
    const end = start + BLINK_DURATION_FRAMES;

    if (localFrame >= start && localFrame < end) {
      const t = (localFrame - start) / Math.max(1, BLINK_DURATION_FRAMES - 1);
      return clamp(1 - Math.abs(t * 2 - 1), 0, 1);
    }

    cursor += interval;
  }

  return 0;
}

export const CinematicTurnDemoComposition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const introEnd = Math.round(3 * fps);
  const turnEnd = Math.round(7 * fps);
  const walkEnd = Math.round(12 * fps);
  const endFrame = Math.round(20 * fps);
  const emphasisStart = Math.round(18 * fps);

  const barTarget = getBarAnchor(chartLayout, TARGET_BAR_INDEX, "top");
  const lookCenter: Vec2 = {
    x: WIDTH * 0.58,
    y: HEIGHT * 0.42
  };

  const turnStart = introEnd + 8;
  const turnOvershootYaw = overshootSpring(-0.18, 1, {
    frame: frame - turnStart,
    fps,
    overshoot: 0.14,
    settleAt: 0.7
  });

  let yaw = 0;
  if (frame < introEnd) {
    yaw = 0;
  } else if (frame < turnStart) {
    yaw = ease(frame, [introEnd, turnStart], [0, -0.18]);
  } else if (frame < turnEnd) {
    yaw = turnOvershootYaw;
  } else if (frame < walkEnd) {
    yaw = 0.92 + Math.sin((frame - turnEnd) * 0.09) * 0.04;
  } else {
    const settleProgress = delayedSpring(
      {
        frame: frame - walkEnd,
        fps,
        config: {
          damping: 18,
          stiffness: 100,
          mass: 0.8,
          overshootClamping: false
        }
      },
      0
    );
    yaw = interpolate(settleProgress, [0, 1], [0.92, 0.74], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    });
  }
  yaw = clamp(yaw, -1, 1);

  const baseX = chartLayout.plot.x - 246;
  const baseY = chartLayout.plot.baselineY + 116;

  let catX = baseX + Math.sin(frame * 0.07) * 2;
  let catY = baseY;

  if (frame >= turnEnd && frame < walkEnd) {
    const walkProgress = ease(frame, [turnEnd, walkEnd], [0, 1]);
    const step = Math.sin((frame - turnEnd) * 0.5);
    catX = baseX + walkProgress * 120 + step * 6;
    catY = baseY + Math.abs(step) * 8;
  } else if (frame >= walkEnd) {
    catX = baseX + 120 + Math.sin((frame - walkEnd) * 0.03) * 3;
    catY = baseY;
  }

  const breathWave = Math.sin((frame / fps) * Math.PI * 2 / 2.6);
  const breathOffsetY = breathWave * 3;
  const breathScaleY = 1 + breathWave * 0.014;
  const breathScaleX = 1 - breathWave * 0.006;

  const torsoPosition: Vec2 = {
    x: catX,
    y: catY + breathOffsetY
  };

  const walkSwingTarget: Vec2 = {
    x: torsoPosition.x + 170 + Math.sin((frame - turnEnd) * 0.5) * 20,
    y: torsoPosition.y - 70 + Math.cos((frame - turnEnd) * 0.45) * 16
  };

  const pointTarget: Vec2 = {
    x: barTarget.x,
    y: barTarget.y - 14
  };

  const headFollow = delayedSpring(
    {
      frame: frame - turnStart,
      fps,
      config: {
        damping: 22,
        stiffness: 84,
        mass: 0.95,
        overshootClamping: false
      }
    },
    6
  );

  const headLagYaw = interpolate(headFollow, [0, 1], [0, yaw], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const headLagOffset: Vec2 = {
    x: Math.sin(headLagYaw * Math.PI * 0.5) * 42,
    y: -Math.abs(headLagYaw) * 6
  };

  const lookTargetBase = frame >= walkEnd ? pointTarget : lookCenter;
  const lookTarget = {
    x: lookTargetBase.x + (frame >= walkEnd ? headLagOffset.x * 0.32 : headLagOffset.x),
    y: lookTargetBase.y + headLagOffset.y
  };

  const pawFollowDelayed = delayedSpring(
    {
      frame: frame - walkEnd,
      fps,
      config: {
        damping: 20,
        stiffness: 96,
        mass: 0.9,
        overshootClamping: false
      }
    },
    5
  );

  const pawFollowT = frame >= walkEnd + Math.round(2 * fps) ? 1 : clamp(pawFollowDelayed, 0, 1);
  const delayedPointTarget: Vec2 = {
    x: interpolate(pawFollowT, [0, 1], [walkSwingTarget.x, pointTarget.x], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    }),
    y: interpolate(pawFollowT, [0, 1], [walkSwingTarget.y, pointTarget.y], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp"
    })
  };

  const activePointTarget =
    frame >= walkEnd ? delayedPointTarget : frame >= turnEnd ? walkSwingTarget : undefined;

  const mainPose = buildPose(torsoPosition, lookTarget, activePointTarget);

  const shakeStrength = ease(frame, [emphasisStart, endFrame], [0, 1]);

  const cameraPanX = frame < introEnd ? ease(frame, [0, introEnd], [0, -26]) : ease(frame, [introEnd, endFrame], [-26, -34]);
  const cameraPanY = frame < introEnd ? ease(frame, [0, introEnd], [0, -12]) : ease(frame, [introEnd, endFrame], [-12, -18]);
  const cameraScale =
    frame < introEnd ? ease(frame, [0, introEnd], [1, 1.08]) : ease(frame, [introEnd, endFrame], [1.08, 1.04]);
  const cameraRotate = Math.sin(frame * 0.03) * 0.22;

  const blink = getBlink(frame, fps);
  const eyeY = torsoPosition.y - 152;

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 22% 18%, #26344E 0%, #151C30 56%, #0A101D 100%)",
        overflow: "hidden",
        color: "#EFF3FF",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <CameraRig
        width={WIDTH}
        height={HEIGHT}
        pan={{ x: cameraPanX, y: cameraPanY }}
        zoom={cameraScale}
        rotateDeg={cameraRotate}
        shake={{
          intensity: 0.55 + shakeStrength * 1.1,
          speed: 0.8,
          rotationIntensityDeg: 0.12 + shakeStrength * 0.2
        }}
      >
        <AbsoluteFill>
          <BarChart
            width={WIDTH}
            height={HEIGHT}
            data={barDemoData}
            highlightIndex={TARGET_BAR_INDEX}
            title="Cinematic Turn Demo"
            subtitle="front -> turn -> walk -> point"
          />

          <div
            style={{
              position: "absolute",
              left: chartLayout.safeArea.left,
              top: 150,
              fontSize: 28,
              letterSpacing: 0.6,
              color: "#B8C6E9"
            }}
          >
            Directional mask blend + pose-space shifts + deterministic camera
          </div>

          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `scale(${breathScaleX}, ${breathScaleY})`,
              transformOrigin: `${torsoPosition.x}px ${torsoPosition.y + 28}px`
            }}
          >
            <EraserCatViewBlend
              pose={mainPose}
              yaw={yaw}
              pack={turningCharacterPack}
              targetPoint={activePointTarget}
              useOpacityBlend={false}
              featherPx={92}
            />
          </div>

          <div
            style={{
              position: "absolute",
              left: torsoPosition.x - 34,
              top: eyeY,
              width: 24,
              height: 2,
              borderRadius: 10,
              background: "#281E1A",
              opacity: blink
            }}
          />
          <div
            style={{
              position: "absolute",
              left: torsoPosition.x + 6,
              top: eyeY,
              width: 24,
              height: 2,
              borderRadius: 10,
              background: "#281E1A",
              opacity: blink
            }}
          />

          {frame >= walkEnd ? (
            <svg
              width={WIDTH}
              height={HEIGHT}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                pointerEvents: "none"
              }}
            >
              <line
                x1={torsoPosition.x + 170}
                y1={torsoPosition.y - 54}
                x2={pointTarget.x}
                y2={pointTarget.y}
                stroke="rgba(255, 255, 255, 0.68)"
                strokeWidth={3}
                strokeDasharray="7 7"
              />
              <circle cx={pointTarget.x} cy={pointTarget.y} r={8} fill="#FFFFFF" fillOpacity={0.9} />
            </svg>
          ) : null}
        </AbsoluteFill>
      </CameraRig>
    </AbsoluteFill>
  );
};