import { AbsoluteFill, useCurrentFrame } from "remotion";
import { VisualObjectRendererAdapter } from "../renderers/VisualObjectRendererAdapter";
import type { RendererFinishProfile, RendererVisualObject } from "../renderers/types";

const WIDTH = 1920;
const HEIGHT = 1080;

const finishProfile: RendererFinishProfile = {
  tone: "economy_crisp",
  textureMatch: "balanced_soft",
  brightness: 1,
  contrast: 1.06,
  saturation: 1.04,
  lineSharpenStrength: 0.8,
  bloomOpacity: 0.08,
  grainOpacity: 0.06,
  vignetteOpacity: 0.1,
  tintOpacity: 0.08,
  tintGradient: "radial-gradient(circle at 20% 20%, rgba(69, 208, 255, 0.22), rgba(0, 0, 0, 0) 48%)"
};

const primaryObject: RendererVisualObject = {
  objectId: "ridership-trend",
  kind: "line_chart",
  semanticRole: "primary_explainer",
  title: "Ridership Stabilizes After Fare Reform",
  body: "Weekday ridership recovered across the quarter while churn eased after the policy rollout.",
  items: ["Fare simplification", "Peak-hour retention", "Transfer friction down"],
  dataRef: {
    datasetId: "transit_ridership",
    timeRange: "Q1-Q3"
  },
  selectionReason: "time_series with a single primary recovery curve"
};

const supportingObjects: RendererVisualObject[] = [
  {
    objectId: "risk-card",
    kind: "summary_card",
    semanticRole: "supporting_explainer",
    title: "Operating Risk",
    body: "Weekend demand remains soft despite the weekday recovery."
  }
];

export const RendererAdapterChartSmokeComposition = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 18% 18%, #1d3d58 0%, #0d1624 46%, #060b12 100%)",
        fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 48,
          borderRadius: 28,
          padding: 18,
          background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
          boxShadow: "0 28px 80px rgba(0, 0, 0, 0.34)"
        }}
      >
        <VisualObjectRendererAdapter
          width={WIDTH - 132}
          height={HEIGHT - 132}
          visualMode="chart"
          hasChart={true}
          chartData={[
            { label: "Jan", value: 41, unit: "M" },
            { label: "Feb", value: 49, unit: "M" },
            { label: "Mar", value: 58, unit: "M" },
            { label: "Apr", value: 63, unit: "M" },
            { label: "May", value: 69, unit: "M" }
          ]}
          primaryKind="line_chart"
          primaryObject={primaryObject}
          supportingObjects={supportingObjects}
          visualPlan={{
            channelDomain: "economy",
            educationalMode: "data_explainer",
            selectionReason: "trend + retention story with one dominant curve"
          }}
          finishProfile={finishProfile}
          annotationsEnabled={true}
          chartCallout="Momentum stays positive after the March fare reset."
          localFrame={frame}
          fps={30}
          emphasisAtFrame={72}
          pointerIndex={3}
          highlightIndices={[2, 3, 4]}
        />
      </div>
    </AbsoluteFill>
  );
};
