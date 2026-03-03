import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { EraserCatRig, lookAt, move } from "../character/EraserCatRig";
import { getMouthOpen } from "../character/talk";
import type { Vec2 } from "../character/types";

const SCRIPT_TEXT =
  "Welcome to Eraser Cat Studio. This talking demo uses a deterministic text rhythm fallback when no audio waveform is provided.";

export const TalkDemoComposition = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const bobY = Math.sin(frame * 0.14) * 4.5;
  const swayX = Math.sin(frame * 0.03) * 16;

  const lookTarget: Vec2 = {
    x: 1020 + Math.sin(frame * 0.02) * 88,
    y: 430 + Math.cos(frame * 0.03) * 26
  };

  const pose = lookAt(lookTarget, move(920 + swayX, 804 + bobY));
  const mouthOpen = getMouthOpen(frame, fps, "talk-demo", SCRIPT_TEXT);

  const introOpacity = interpolate(frame, [0, 20, durationInFrames - 30, durationInFrames - 1], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 20% 20%, #2B3E63 0%, #16213A 56%, #0A1020 100%)",
        color: "#ECF2FF",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 84,
          width: 1200,
          fontSize: 58,
          lineHeight: 1.08,
          fontWeight: 800,
          letterSpacing: 0.4,
          opacity: introOpacity
        }}
      >
        TALK DEMO
      </div>

      <div
        style={{
          position: "absolute",
          left: 120,
          top: 174,
          width: 1320,
          fontSize: 30,
          color: "#C4D3EE",
          opacity: introOpacity
        }}
      >
        mouth follows deterministic rhythm (no required audio file)
      </div>

      <div
        style={{
          position: "absolute",
          left: 120,
          top: 250,
          width: 1160,
          padding: "24px 28px",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.24)",
          background: "rgba(8, 12, 23, 0.42)",
          fontSize: 36,
          lineHeight: 1.3,
          color: "#F4F8FF",
          boxShadow: "0 16px 36px rgba(0, 0, 0, 0.3)"
        }}
      >
        {SCRIPT_TEXT}
      </div>

      <div
        style={{
          position: "absolute",
          right: 148,
          top: 90,
          width: 280,
          padding: "16px 18px",
          borderRadius: 16,
          border: "1px solid rgba(255, 255, 255, 0.2)",
          background: "rgba(12, 19, 35, 0.56)",
          fontSize: 24,
          lineHeight: 1.25,
          color: "#D9E7FF"
        }}
      >
        mouthOpen: {mouthOpen.toFixed(2)}
      </div>

      <EraserCatRig
        pose={pose}
        animationMode="alive"
        seed="talk-demo-alive"
        talkText={SCRIPT_TEXT}
      />

      <div
        style={{
          position: "absolute",
          left: lookTarget.x - 10,
          top: lookTarget.y - 10,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#90D8FF",
          boxShadow: "0 0 0 4px rgba(144, 216, 255, 0.28)"
        }}
      />
    </AbsoluteFill>
  );
};
