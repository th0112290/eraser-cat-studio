import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EraserCatViewBlend } from "../character/EraserCatViewBlend";
import { lookAt, move, pointAt } from "../character/EraserCatRig";
import { turningCharacterPack } from "../character/pack";
import type { CharacterPack, RigPose, Vec2 } from "../character/types";
import { CameraRig } from "../effects/CameraRig";
import { BarChart, createBarChartLayout, getBarAnchor } from "../templates/BarChart";
import { barDemoData } from "../templates/fixtures/barDemoData";

const WIDTH = 1920;
const HEIGHT = 1080;
const TARGET_BAR_INDEX = 2;

export type CharacterPackPreviewProps = {
  characterPackId?: string;
  pack?: CharacterPack;
  title?: string;
};

const layout = createBarChartLayout({
  width: WIDTH,
  height: HEIGHT,
  data: barDemoData,
  safeArea: {
    top: 60,
    right: 110,
    bottom: 60,
    left: 110
  },
  barGap: 36
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
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

export const CharacterPackPreviewComposition = ({
  characterPackId = "character-pack-preview",
  pack = turningCharacterPack,
  title = "Character Pack Preview"
}: CharacterPackPreviewProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const idleEnd = Math.round(3 * fps);
  const moveEnd = Math.round(7 * fps);
  const pointEnd = Math.round(12 * fps);
  const turnEnd = Math.round(18 * fps);

  const barTarget = getBarAnchor(layout, TARGET_BAR_INDEX, "top");

  const baseX = layout.plot.x - 236;
  const baseY = layout.plot.baselineY + 116;

  const breath = Math.sin(frame * 0.08) * 3.2;

  let x = baseX;
  let y = baseY + breath;

  if (frame > idleEnd) {
    const moveT = clamp((frame - idleEnd) / Math.max(1, moveEnd - idleEnd), 0, 1);
    const easedMove = spring({
      frame: Math.round(moveT * 60),
      fps,
      config: {
        damping: 16,
        stiffness: 90,
        mass: 0.9
      }
    });

    x = lerp(baseX, baseX + 150, easedMove);
    y = baseY + breath + Math.abs(Math.sin((frame - idleEnd) * 0.36)) * 6;
  }

  const pointTarget: Vec2 = {
    x: barTarget.x,
    y: barTarget.y - 12
  };

  const lookTarget: Vec2 =
    frame < pointEnd
      ? {
          x: WIDTH * 0.56,
          y: HEIGHT * 0.4
        }
      : pointTarget;

  const activePointTarget = frame >= Math.round(7.5 * fps) ? pointTarget : undefined;

  const yawSpring = spring({
    frame: Math.max(0, frame - pointEnd),
    fps,
    config: {
      damping: 18,
      stiffness: 78,
      mass: 0.9
    }
  });

  const yaw =
    frame < pointEnd
      ? 0
      : frame < turnEnd
        ? interpolate(yawSpring, [0, 1], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          })
        : 1;

  const pose = buildPose(
    {
      x,
      y
    },
    lookTarget,
    activePointTarget
  );

  const cameraZoom = interpolate(frame, [0, turnEnd], [1.0, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const cameraPanX = interpolate(frame, [0, turnEnd], [0, -24], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const cameraPanY = interpolate(frame, [0, turnEnd], [0, -10], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 20% 16%, #2A3550 0%, #141C31 58%, #0A101C 100%)",
        color: "#EEF3FF",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <CameraRig
        width={WIDTH}
        height={HEIGHT}
        pan={{ x: cameraPanX, y: cameraPanY }}
        zoom={cameraZoom}
        rotateDeg={Math.sin(frame * 0.025) * 0.18}
        shake={{
          intensity: frame > pointEnd ? 0.55 : 0.2,
          speed: 0.75,
          rotationIntensityDeg: frame > pointEnd ? 0.11 : 0.04
        }}
      >
        <AbsoluteFill>
          <BarChart
            width={WIDTH}
            height={HEIGHT}
            data={barDemoData}
            highlightIndex={TARGET_BAR_INDEX}
            title={title}
            subtitle="idle -> move -> point -> turn(front->3q->profile)"
          />

          <div
            style={{
              position: "absolute",
              left: layout.safeArea.left,
              top: 164,
              fontSize: 24,
              color: "#B9C7E8",
              letterSpacing: 0.4
            }}
          >
            pack: {characterPackId}
          </div>

          <EraserCatViewBlend
            pose={pose}
            yaw={yaw}
            pack={pack}
            targetPoint={activePointTarget}
            featherPx={86}
            animationMode="alive"
            seed={`character-pack-preview:${characterPackId}`}
            talkText="Hi, this preview was generated from your uploaded multi-view assets."
          />
        </AbsoluteFill>
      </CameraRig>
    </AbsoluteFill>
  );
};
