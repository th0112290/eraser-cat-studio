import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EraserCatRig, lookAt, move, pointAt } from "../character/EraserCatRig";

type Mvp1Props = {
  title: string;
  subtitle: string;
};

export const Mvp1Composition = ({ title, subtitle }: Mvp1Props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: {
      damping: 200
    }
  });

  const subtitleOpacity = interpolate(frame, [20, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  const targetPoint = {
    x: 1240 + Math.cos(frame / 22) * 230,
    y: 420 + Math.sin(frame / 36) * 140
  };
  const baseX = 560 + Math.sin(frame / 40) * 30;
  const baseY = 700 + Math.cos(frame / 55) * 14;
  const pose = pointAt(targetPoint, lookAt(targetPoint, move(baseX, baseY)));

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #101623 0%, #22324d 45%, #384f7b 100%)",
        color: "white",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <EraserCatRig pose={pose} targetPoint={targetPoint} />

      <div
        style={{
          position: "absolute",
          right: 120,
          top: 180,
          textAlign: "right",
          transform: `scale(${0.85 + entrance * 0.15})`,
          opacity: entrance
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 96,
            letterSpacing: 1
          }}
        >
          {title}
        </h1>
        <p
          style={{
            marginTop: 24,
            marginBottom: 0,
            fontSize: 44,
            opacity: subtitleOpacity
          }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
};
