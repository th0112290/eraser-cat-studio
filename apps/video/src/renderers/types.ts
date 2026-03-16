export type RendererVisualObjectKind =
  | "bar_chart"
  | "line_chart"
  | "table"
  | "kpi_card"
  | "summary_card"
  | "checklist_card"
  | "process_flow"
  | "comparison_board"
  | "timeline"
  | "labeled_diagram"
  | "icon_array";

export type RendererVisualObject = {
  objectId: string;
  kind: RendererVisualObjectKind | "icon_grid" | "anatomy_diagram";
  semanticRole: "primary_explainer" | "supporting_explainer" | "accent";
  title?: string;
  body?: string;
  items?: string[];
  dataRef?: {
    chartId?: string;
    datasetId?: string;
    timeRange?: string;
  };
  selectionReason?: string;
};

export type RendererVisualPlan = {
  channelDomain?: "economy" | "medical" | "generic";
  educationalMode?: "data_explainer" | "summary_explainer" | "generic";
  selectionReason?: string;
};

export type RendererChartRow = {
  label: string;
  value: number;
  unit?: string;
};

export type RendererFinishProfile = {
  tone: "studio_balanced" | "economy_crisp" | "medical_soft";
  textureMatch: "deterministic_clean" | "balanced_soft" | "sidecar_matched";
  brightness: number;
  contrast: number;
  saturation: number;
  lineSharpenStrength: number;
  bloomOpacity: number;
  grainOpacity: number;
  vignetteOpacity: number;
  tintOpacity: number;
  tintGradient: string;
};
