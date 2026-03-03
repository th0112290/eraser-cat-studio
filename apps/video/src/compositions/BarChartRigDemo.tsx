import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EraserCatRig, lookAt, move, pointAt } from "../character/EraserCatRig";
import { BarChart, createBarChartLayout, getBarAnchor } from "../templates/BarChart";
import { barDemoData } from "../templates/fixtures/barDemoData";

const WIDTH = 1920;
const HEIGHT = 1080;

const layout = createBarChartLayout({
  width: WIDTH,
  height: HEIGHT,
  data: barDemoData
});

export const BarChartRigDemoComposition = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const targetAnchor = getBarAnchor(layout, 2, "top");
  const handTarget = {
    x: targetAnchor.x + Math.sin(frame / 18) * 3,
    y: targetAnchor.y - 16 + Math.cos(frame / 24) * 2
  };

  const catPose = pointAt(
    handTarget,
    lookAt(
      handTarget,
      move(
        layout.plot.x - 220 + Math.sin(frame / 32) * 8,
        layout.plot.baselineY + 112 + Math.cos(frame / 36) * 4
      )
    )
  );

  const captionSpring = spring({
    frame: frame - 70,
    fps,
    config: {
      damping: 140
    }
  });
  const captionOpacity = interpolate(frame, [60, 110, 390, 430], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "radial-gradient(circle at 22% 20%, #253756 0%, #131b2f 50%, #0c1120 100%)",
        overflow: "hidden",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <BarChart
        width={WIDTH}
        height={HEIGHT}
        data={barDemoData}
        highlightIndex={2}
        title="Engagement by Day"
        subtitle="EraserCat points to the top performer"
      />

      <EraserCatRig pose={catPose} targetPoint={handTarget} />

      <div
        style={{
          position: "absolute",
          left: layout.plot.x + layout.plot.width * 0.56,
          top: layout.plot.y - 8,
          transform: `translateY(${(1 - captionSpring) * 16}px)`,
          opacity: captionOpacity,
          background: "rgba(9, 16, 28, 0.88)",
          color: "#F3F6FF",
          border: "2px solid rgba(255, 255, 255, 0.18)",
          borderRadius: 16,
          padding: "16px 22px",
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: 0.2
        }}
      >
        Peak at bar #3 (Wed): 91
      </div>
    </div>
  );
};

