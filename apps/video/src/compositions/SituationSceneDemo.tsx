import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { EraserCatRig, lookAt, move, pointAt } from "../character/EraserCatRig";
import { BarChart, createBarChartLayout, getBarAnchor } from "../templates/BarChart";
import { barDemoData } from "../templates/fixtures/barDemoData";
import { SituationScene, situationSceneLayout } from "../templates/SituationScene";

type SituationSceneDemoProps = {
  simpleLayout?: boolean;
  hideNonCriticalOverlays?: boolean;
  reduceElements?: boolean;
};

const simpleSceneLayout = {
  chart: {
    x: 1110,
    y: 166,
    width: 690,
    height: 486
  }
};

export const SituationSceneDemoComposition = ({
  simpleLayout = false,
  hideNonCriticalOverlays = false,
  reduceElements = false
}: SituationSceneDemoProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const activeLayout = simpleLayout ? simpleSceneLayout : situationSceneLayout;
  const chartData = reduceElements ? barDemoData.slice(0, 3) : barDemoData;
  const pointerIndex = Math.min(2, chartData.length - 1);
  const chartSafeArea = simpleLayout
    ? { top: 18, right: 18, bottom: 18, left: 20 }
    : { top: 24, right: 28, bottom: 26, left: 32 };
  const chartLayout = createBarChartLayout({
    width: activeLayout.chart.width,
    height: activeLayout.chart.height,
    data: chartData,
    safeArea: chartSafeArea
  });
  const localAnchor = getBarAnchor(chartLayout, pointerIndex, "top");
  const chartPointAnchor = {
    x: activeLayout.chart.x + localAnchor.x,
    y: activeLayout.chart.y + localAnchor.y
  };

  const walkProgress = interpolate(frame, [0, 190], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const x = 170 + walkProgress * (simpleLayout ? 720 : 770);
  const y = 780 + Math.sin(frame / 18) * 3;

  const hasStartedPointing = frame >= 220;
  const pointingTarget = {
    x: chartPointAnchor.x + Math.sin(frame / 30) * 6,
    y: chartPointAnchor.y - 18 + Math.cos(frame / 26) * 4
  };
  const forwardLookTarget = { x: x + 220, y: y - 130 };

  const pose = hasStartedPointing
    ? pointAt(pointingTarget, lookAt(pointingTarget, move(x, y)))
    : lookAt(forwardLookTarget, move(x, y));

  const captionLift = spring({
    frame: frame - 246,
    fps,
    config: {
      damping: 180
    }
  });
  const captionOpacity = interpolate(frame, [240, 280, 360], [0, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <SituationScene
      width={1920}
      height={1080}
      layout={activeLayout}
      simpleMode={simpleLayout}
      chartLayer={
        <BarChart
          width={activeLayout.chart.width}
          height={activeLayout.chart.height}
          data={chartData}
          highlightIndex={pointerIndex}
          title={simpleLayout ? "Conversion Focus" : "Conversion by Segment"}
          subtitle={hideNonCriticalOverlays ? "" : "Cat walks in, then points at Segment C"}
          safeArea={chartSafeArea}
        />
      }
      characterLayer={<EraserCatRig pose={pose} targetPoint={hasStartedPointing ? pointingTarget : undefined} />}
      captionLayer={hideNonCriticalOverlays ? undefined : (
        <div
          style={{
            transform: `translateY(${(1 - captionLift) * 18}px)`,
            opacity: captionOpacity,
            background: "rgba(11, 18, 30, 0.9)",
            color: "#f7fbff",
            borderRadius: 14,
            border: "2px solid rgba(255, 255, 255, 0.2)",
            padding: "16px 18px",
            fontSize: 30,
            fontWeight: 600
          }}
        >
          Segment C is the highest. Focus here.
        </div>
      )}
    />
  );
};
