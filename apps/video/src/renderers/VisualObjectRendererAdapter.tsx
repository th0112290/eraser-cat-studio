import { EChartsRenderer } from "./EChartsRenderer";
import { MermaidRenderer } from "./MermaidRenderer";
import type {
  RendererChartRow,
  RendererFinishProfile,
  RendererVisualObject,
  RendererVisualObjectKind,
  RendererVisualPlan
} from "./types";

export type VisualObjectRendererAdapterProps = {
  width: number;
  height: number;
  visualMode: "chart" | "table";
  hasChart: boolean;
  chartData: RendererChartRow[];
  primaryKind?: RendererVisualObjectKind;
  primaryObject?: RendererVisualObject;
  supportingObjects: RendererVisualObject[];
  visualPlan?: RendererVisualPlan;
  finishProfile: RendererFinishProfile;
  annotationsEnabled: boolean;
  chartCallout?: string;
  localFrame: number;
  fps: number;
  emphasisAtFrame: number;
  pointerIndex: number;
  highlightIndices: number[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clipText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function startCaseLabel(value: string | undefined): string {
  if (!value) {
    return "";
  }
  return value
    .split("_")
    .map((part) => (part.length > 0 ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/<<([^>]+)>>/g, "$1").replace(/\s+/g, " ").trim();
}

function uniqueNonEmptyStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim() ?? "").filter((value) => value.length > 0))
  );
}

function splitNarrationFragments(text: string): string[] {
  const normalized = cleanText(text);
  if (!normalized) {
    return [];
  }
  return uniqueNonEmptyStrings(
    normalized
      .split(/(?<=[.!?])\s+|[;:]/)
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length > 0)
  );
}

function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 131 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function normalizeVisualKind(
  kind: RendererVisualObject["kind"] | RendererVisualObjectKind | undefined
): RendererVisualObjectKind | undefined {
  if (!kind) {
    return undefined;
  }
  if (kind === "icon_grid") {
    return "icon_array";
  }
  if (kind === "anatomy_diagram") {
    return "labeled_diagram";
  }
  return kind;
}

function resolveTitle(
  primaryObject: RendererVisualObject | undefined,
  primaryKind: RendererVisualObjectKind | undefined,
  visualPlan: RendererVisualPlan | undefined
): string {
  if (primaryObject?.title?.trim()) {
    return clipText(primaryObject.title, 44);
  }
  if (visualPlan?.selectionReason?.trim()) {
    return clipText(visualPlan.selectionReason.replaceAll("_", " "), 44);
  }
  return primaryKind ? startCaseLabel(primaryKind) : "Visual Explainer";
}

function resolveSubtitle(
  primaryObject: RendererVisualObject | undefined,
  supportingObjects: RendererVisualObject[],
  visualPlan: RendererVisualPlan | undefined
): string | undefined {
  const primaryDataRef = primaryObject?.dataRef;
  const segments = uniqueNonEmptyStrings([
    primaryDataRef?.datasetId ? startCaseLabel(primaryDataRef.datasetId) : undefined,
    primaryDataRef?.timeRange ? `Window ${primaryDataRef.timeRange}` : undefined,
    supportingObjects.length > 0 ? `${supportingObjects.length} support object${supportingObjects.length === 1 ? "" : "s"}` : undefined,
    visualPlan?.selectionReason ? clipText(visualPlan.selectionReason.replaceAll("_", " "), 42) : undefined
  ]);
  return segments.length > 0 ? segments.join(" | ") : undefined;
}

function resolveBody(primaryObject: RendererVisualObject | undefined): string {
  const body = cleanText(primaryObject?.body);
  return body || "Visual-object schema is present, but narrative detail is still pending.";
}

function resolveItems(
  primaryObject: RendererVisualObject | undefined,
  supportingObjects: RendererVisualObject[],
  chartData: RendererChartRow[],
  body: string
): string[] {
  return uniqueNonEmptyStrings([
    ...(primaryObject?.items ?? []),
    ...supportingObjects.flatMap((object) => object.items ?? []),
    ...chartData.map((row) => row.label),
    ...splitNarrationFragments(body)
  ]).slice(0, 6);
}

function buildFallbackChartData(
  items: string[],
  body: string,
  chartData: RendererChartRow[]
): RendererChartRow[] {
  if (chartData.length > 0) {
    return chartData;
  }
  const source = (items.length > 0 ? items : splitNarrationFragments(body)).slice(0, 4);
  return source.map((item, index) => ({
    label: clipText(item, 12) || `Signal ${index + 1}`,
    value: 36 + (hashString(`${item}:${index}`) % 52)
  }));
}

function resolveBadges(
  visualPlan: RendererVisualPlan | undefined,
  finishProfile: RendererFinishProfile,
  primaryKind: RendererVisualObjectKind | undefined
): string[] {
  return uniqueNonEmptyStrings([
    visualPlan?.channelDomain ? startCaseLabel(visualPlan.channelDomain) : undefined,
    visualPlan?.educationalMode ? startCaseLabel(visualPlan.educationalMode) : undefined,
    primaryKind ? startCaseLabel(primaryKind) : undefined,
    startCaseLabel(finishProfile.tone)
  ]).slice(0, 4);
}

export const VisualObjectRendererAdapter = ({
  width,
  height,
  visualMode,
  hasChart,
  chartData,
  primaryKind,
  primaryObject,
  supportingObjects,
  visualPlan,
  finishProfile,
  annotationsEnabled,
  chartCallout,
  localFrame,
  fps,
  emphasisAtFrame,
  pointerIndex,
  highlightIndices
}: VisualObjectRendererAdapterProps) => {
  const normalizedKind = normalizeVisualKind(primaryObject?.kind ?? primaryKind);
  const title = resolveTitle(primaryObject, normalizedKind, visualPlan);
  const body = resolveBody(primaryObject);
  const items = resolveItems(primaryObject, supportingObjects, chartData, body);
  const subtitle = resolveSubtitle(primaryObject, supportingObjects, visualPlan);
  const badges = resolveBadges(visualPlan, finishProfile, normalizedKind);
  const resolvedChartData = buildFallbackChartData(items, body, chartData);
  const safePointerIndex = clamp(pointerIndex, 0, Math.max(0, resolvedChartData.length - 1));

  if (hasChart && visualMode === "chart") {
    return (
      <EChartsRenderer
        width={width}
        height={height}
        kind={normalizedKind}
        title={title}
        subtitle={subtitle}
        badges={badges}
        chartData={resolvedChartData}
        callout={chartCallout}
        annotationsEnabled={annotationsEnabled}
        localFrame={localFrame}
        fps={fps}
        emphasisAtFrame={emphasisAtFrame}
        pointerIndex={safePointerIndex}
        highlightIndices={highlightIndices}
        finishProfile={finishProfile}
      />
    );
  }

  return (
    <MermaidRenderer
      width={width}
      height={height}
      kind={normalizedKind}
      title={title}
      subtitle={subtitle}
      body={body}
      items={items}
      badges={badges}
      supportingObjects={supportingObjects}
      localFrame={localFrame}
      fps={fps}
      emphasisAtFrame={emphasisAtFrame}
      finishProfile={finishProfile}
    />
  );
};
