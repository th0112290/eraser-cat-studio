import { AbsoluteFill, useCurrentFrame } from "remotion";
import { VisualObjectRendererAdapter } from "../renderers/VisualObjectRendererAdapter";
import type { RendererFinishProfile, RendererVisualObject } from "../renderers/types";

const WIDTH = 1920;
const HEIGHT = 1080;

const finishProfile: RendererFinishProfile = {
  tone: "medical_soft",
  textureMatch: "sidecar_matched",
  brightness: 1,
  contrast: 1.02,
  saturation: 0.96,
  lineSharpenStrength: 0.72,
  bloomOpacity: 0.05,
  grainOpacity: 0.04,
  vignetteOpacity: 0.08,
  tintOpacity: 0.07,
  tintGradient: "radial-gradient(circle at 78% 18%, rgba(126, 231, 200, 0.2), rgba(0, 0, 0, 0) 44%)"
};

const primaryObject: RendererVisualObject = {
  objectId: "triage-flow",
  kind: "process_flow",
  semanticRole: "primary_explainer",
  title: "Rapid Triage Flow",
  body: "Escalate from intake to imaging only when the preflight signs stay red across the first pass.",
  items: ["Intake", "Vitals", "Lab review", "Imaging"],
  selectionReason: "ordered decision path with one escalation branch"
};

const supportingObjects: RendererVisualObject[] = [
  {
    objectId: "fallback-summary",
    kind: "summary_card",
    semanticRole: "supporting_explainer",
    title: "Guardrail",
    body: "Return to bedside review when the signal is ambiguous."
  },
  {
    objectId: "aftercare-diagram",
    kind: "anatomy_diagram",
    semanticRole: "accent",
    title: "Recovery Watch",
    body: "Observe breathing stability and fluid response over the next hour."
  }
];

export const RendererAdapterDiagramSmokeComposition = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        background: "radial-gradient(circle at 82% 18%, #214840 0%, #0f1d24 44%, #070c10 100%)",
        fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 56,
          borderRadius: 30,
          padding: 20,
          background: "linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
          boxShadow: "0 28px 80px rgba(0, 0, 0, 0.34)"
        }}
      >
        <VisualObjectRendererAdapter
          width={WIDTH - 152}
          height={HEIGHT - 152}
          visualMode="table"
          hasChart={false}
          chartData={[]}
          primaryKind="process_flow"
          primaryObject={primaryObject}
          supportingObjects={supportingObjects}
          visualPlan={{
            channelDomain: "medical",
            educationalMode: "summary_explainer",
            selectionReason: "clinical escalation path with explicit checkpoints"
          }}
          finishProfile={finishProfile}
          annotationsEnabled={true}
          chartCallout=""
          localFrame={frame}
          fps={30}
          emphasisAtFrame={68}
          pointerIndex={0}
          highlightIndices={[]}
        />
      </div>
    </AbsoluteFill>
  );
};
