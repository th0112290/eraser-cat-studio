import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { EraserCatRig, lookAt, move, pointAt } from "../character/EraserCatRig";

const WIDTH = 1920;
const HEIGHT = 1080;

function panelTarget(centerX: number, frame: number, phase: number): { x: number; y: number } {
  return {
    x: centerX + 130 + Math.sin(frame * 0.055 + phase) * 72,
    y: 360 + Math.cos(frame * 0.07 + phase * 0.4) * 48
  };
}

export const CharacterLifeDemoComposition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftCenterX = WIDTH * 0.25;
  const rightCenterX = WIDTH * 0.75;

  const leftTarget = panelTarget(leftCenterX, frame, 0.3);
  const rightTarget = panelTarget(rightCenterX, frame, 1.1);

  const baseY = 814;
  const leftPose = pointAt(
    leftTarget,
    lookAt(
      leftTarget,
      move(
        leftCenterX - 118 + Math.sin(frame * 0.04) * 8,
        baseY + Math.cos(frame * 0.05) * 4
      )
    )
  );

  const rightPose = pointAt(
    rightTarget,
    lookAt(
      rightTarget,
      move(
        rightCenterX - 118 + Math.sin(frame * 0.04 + 0.8) * 8,
        baseY + Math.cos(frame * 0.05 + 0.5) * 4
      )
    )
  );

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0B1222 0%, #111D35 60%, #081224 100%)",
        color: "#F2F7FF",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: WIDTH,
          height: HEIGHT,
          background:
            "radial-gradient(circle at 20% 20%, rgba(134, 184, 255, 0.16), transparent 44%), radial-gradient(circle at 78% 20%, rgba(255, 215, 128, 0.11), transparent 42%)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: WIDTH / 2 - 1,
          top: 90,
          width: 2,
          height: HEIGHT - 180,
          background: "rgba(255, 255, 255, 0.18)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 88,
          top: 36,
          fontSize: 56,
          fontWeight: 800,
          letterSpacing: 1
        }}
      >
        CHARACTER LIFE DEMO
      </div>

      <div
        style={{
          position: "absolute",
          left: 130,
          top: 128,
          fontSize: 34,
          fontWeight: 700,
          color: "#B6CAE8"
        }}
      >
        STATIC
      </div>

      <div
        style={{
          position: "absolute",
          left: WIDTH / 2 + 90,
          top: 128,
          fontSize: 34,
          fontWeight: 700,
          color: "#B6CAE8"
        }}
      >
        ALIVE (breath / blink / saccade / follow-through)
      </div>

      <div
        style={{
          position: "absolute",
          left: 120,
          top: 186,
          width: WIDTH / 2 - 140,
          height: HEIGHT - 250,
          borderRadius: 22,
          border: "1px solid rgba(255, 255, 255, 0.2)",
          background: "rgba(9, 14, 25, 0.46)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: WIDTH / 2 + 20,
          top: 186,
          width: WIDTH / 2 - 140,
          height: HEIGHT - 250,
          borderRadius: 22,
          border: "1px solid rgba(255, 255, 255, 0.2)",
          background: "rgba(9, 14, 25, 0.46)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: leftTarget.x - 12,
          top: leftTarget.y - 12,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#8ED8FF",
          boxShadow: "0 0 0 3px rgba(142, 216, 255, 0.38)"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: rightTarget.x - 12,
          top: rightTarget.y - 12,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#FFD28C",
          boxShadow: "0 0 0 3px rgba(255, 210, 140, 0.34)"
        }}
      />

      <EraserCatRig pose={leftPose} targetPoint={leftTarget} animationMode="static" seed="character-life-static" />
      <EraserCatRig pose={rightPose} targetPoint={rightTarget} animationMode="alive" seed="character-life-alive" />

      <div
        style={{
          position: "absolute",
          left: 92,
          bottom: 36,
          fontSize: 24,
          color: "#A8BEE0"
        }}
      >
        duration {(300 / fps).toFixed(1)}s | frame {frame + 1}
      </div>
    </AbsoluteFill>
  );
};