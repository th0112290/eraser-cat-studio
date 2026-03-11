import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { lookAt, move, pointAt } from "../character/EraserCatRig";
import { MascotRenderer } from "../character/MascotRenderer";
import { beatPunch, holdThenSnap } from "../anim/timeRemap";
import { CameraRig, type CameraPreset } from "../effects/CameraRig";
import { ScreenFx } from "../effects/ScreenFx";
import { ShotTransition, type ShotTransitionType } from "../effects/ShotTransition";
import { ScribbleHighlight } from "../effects/ScribbleHighlight";
import { FlashCut } from "../effects/Transitions";
import {
  resolveDeterministicFinishProfile,
  resolveDeterministicProfileSeam
} from "../../../../packages/render-orchestrator/src/profileSeam";

export type ShotChartRow = {
  label: string;
  value: number;
  unit?: string;
};

export type ShotCameraKeyframe = {
  f: number;
  x: number;
  y: number;
  zoom: number;
  rotateDeg: number;
};

export type ShotChartHighlight = {
  f: number;
  targetId: string;
  styleToken: string;
};

export type ShotCharacterTracks = {
  posPath: Array<{
    f: number;
    x: number;
    y: number;
    interp: "linear" | "ease" | "spring";
  }>;
  actionTrack: Array<{
    f: number;
    clip: string;
    weight: number;
  }>;
  expressionTrack: Array<{
    f: number;
    expression: string;
  }>;
  lookTrack: Array<{
    f: number;
    target: string;
  }>;
  pointTrack?: Array<{
    f: number;
    targetId: string;
    hand: "left" | "right";
  }>;
};

export type ShotCanonicalVisualObjectKind =
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

export type ShotVisualObject = {
  objectId: string;
  kind: ShotCanonicalVisualObjectKind | "icon_grid" | "anatomy_diagram";
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

export type ShotVisualPlan = {
  resolverId: "legacy_chart_backbone_v1";
  channelDomain: "economy" | "medical" | "generic";
  educationalMode: "data_explainer" | "summary_explainer" | "generic";
  selectedPrimaryKind: ShotCanonicalVisualObjectKind;
  selectionReason: string;
};

export type ShotGrammar =
  | "host_intro"
  | "metric_focus"
  | "comparison_explainer"
  | "process_walkthrough"
  | "timeline_bridge"
  | "diagram_explainer"
  | "checklist_recap"
  | "summary_recap";

export type ShotRouteReason =
  | "chart_reference"
  | "metric_focus"
  | "comparison_language"
  | "process_language"
  | "timeline_language"
  | "medical_diagram_language"
  | "checklist_density"
  | "summary_fallback";

export type ShotEducationalIntent =
  | "introduce_topic"
  | "explain_metric"
  | "compare_tradeoffs"
  | "walkthrough_steps"
  | "sequence_events"
  | "explain_structure"
  | "summarize_takeaways";

export type ShotInsertNeed =
  | "none"
  | "summary_support"
  | "checklist_support"
  | "comparison_support"
  | "process_support"
  | "timeline_support"
  | "diagram_support";

export type ShotLayoutBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ShotFinishTone = "studio_balanced" | "economy_crisp" | "medical_soft";

export type ShotTextureMatch = "deterministic_clean" | "balanced_soft" | "sidecar_matched";

export type ShotFinishProfile = {
  tone: ShotFinishTone;
  textureMatch: ShotTextureMatch;
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

export type ShotLayoutBias = "balanced" | "data_dense" | "guided_soft";

export type ShotActingBias = "analytic_presenter" | "warm_guide" | "neutral_presenter";

export type ShotPointerBias = "chart_precise" | "soft_visual" | "guided_callout";

export type ShotProfileBundle = {
  resolverId: string;
  resolverSource: "local_seam" | "injected" | "profiles_package";
  studioProfileId: string;
  channelProfileId: string;
  mascotProfileId: string;
  layoutBias: ShotLayoutBias;
  actingBias: ShotActingBias;
  pointerBias: ShotPointerBias;
  finishBias: ShotFinishTone;
};

export type ShotRenderSequence = {
  shotId: string;
  from: number;
  duration: number;
  setId: string;
  cameraPreset: string;
  shotGrammar?: ShotGrammar;
  routeReason?: ShotRouteReason;
  educationalIntent?: ShotEducationalIntent;
  insertNeed?: ShotInsertNeed;
  narration: string;
  emphasisWords: string[];
  chartData: ShotChartRow[];
  visualMode: "chart" | "table";
  primaryVisualKind?: ShotCanonicalVisualObjectKind;
  visualObjects?: ShotVisualObject[];
  visualPlan?: ShotVisualPlan;
  profileBundle?: ShotProfileBundle;
  finishProfile?: ShotFinishProfile;
  visualBox?: ShotLayoutBox;
  narrationBox?: ShotLayoutBox;
  mascotBlockingBox?: ShotLayoutBox;
  pointerReachableZone?: ShotLayoutBox;
  annotationsEnabled: boolean;
  pointerTargetIndex: number;
  pointerEnabled: boolean;
  freezePose: boolean;
  expectOcclusion: boolean;
  pointerTip?: {
    x: number;
    y: number;
  };
  unit?: string;
  hasChart: boolean;
  chartCallout?: string;
  characterPackId: string;
  mascotId?: string;
  characterX: number;
  characterY: number;
  characterYawFrom?: number;
  characterYawTo?: number;
  characterYawEase?: "linear" | "spring";
  cameraKeyframes?: ShotCameraKeyframe[];
  talkText?: string;
  chartHighlights?: ShotChartHighlight[];
  characterTracks?: ShotCharacterTracks;
  macroCutaway?: boolean;
  transitionType?: ShotTransitionType;
  transitionHint?: string;
  emphasisAtFrame?: number;
};

export type ShotSubtitleCue = {
  index: number;
  startFrame: number;
  endFrame: number;
  text: string;
};

export type ShotBenchmarkSignal = {
  scope: string;
  target?: string;
  status: string;
  score?: number;
  verdict?: string;
  reason?: string;
  sourceLabel?: string;
  generatedAt?: string;
  artifactPath?: string;
};

export type ShotQcSummary = {
  status: "passed" | "warn" | "failed";
  errorCount: number;
  warningCount: number;
  fallbackStepsApplied: string[];
  finalIssues: Array<{
    code: string;
    severity: "INFO" | "WARN" | "ERROR";
    message: string;
    shotId?: string;
  }>;
};

export type ShotProfileResolverSummary = {
  resolverIds: string[];
  resolverSources: Array<ShotProfileBundle["resolverSource"]>;
  resolverModulePaths: string[];
  studioProfileIds: string[];
  channelProfileIds: string[];
  mascotProfileIds: string[];
};

export type ShotDebugOverlay = {
  enabled: boolean;
  sourceLabel?: string;
  qc: ShotQcSummary;
  profileResolver?: ShotProfileResolverSummary;
  benchmarks: ShotBenchmarkSignal[];
};

export type ShotEpisodeRenderProps = {
  episodeId: string;
  safeArea: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  freezeCharacterPose: boolean;
  sequences: ShotRenderSequence[];
  subtitles: ShotSubtitleCue[];
  debugOverlay?: ShotDebugOverlay;
};

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;

const CHART_BOX = {
  x: 1030,
  y: 168,
  width: 760,
  height: 510
};

const NARRATION_BOX = {
  x: 104,
  y: 748,
  width: 820,
  height: 176
};

const OCCLUDER_BOX = {
  x: 760,
  y: 0,
  width: 180,
  height: FRAME_HEIGHT
};

const TRANSITION_OVERLAP_FRAMES = 10;

type BarGeometry = ShotChartRow & {
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: {
    x: number;
    y: number;
  };
};

type CameraPose = {
  x: number;
  y: number;
  zoom: number;
  rotateDeg: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashColorSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 131 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function backgroundForShot(shotId: string, setId: string): string {
  const seed = hashColorSeed(`${shotId}:${setId}`);
  const hue = seed % 360;
  const hueSecondary = (hue + 32) % 360;
  return `linear-gradient(160deg, hsl(${hue} 48% 18%) 0%, hsl(${hueSecondary} 58% 12%) 100%)`;
}

function cleanMarkers(text: string): string {
  return text.replace(/<<([^>]+)>>/g, "$1").replace(/\s+/g, " ").trim();
}

function normalizeVisualObjectKindLocal(
  kind: ShotVisualObject["kind"] | undefined
): ShotCanonicalVisualObjectKind | undefined {
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

function resolvePrimaryVisualObjectLocal(sequence: ShotRenderSequence): ShotVisualObject | undefined {
  return sequence.visualObjects?.find((visualObject) => visualObject.semanticRole === "primary_explainer") ?? sequence.visualObjects?.[0];
}

function resolvePrimaryVisualKindLocal(sequence: ShotRenderSequence): ShotCanonicalVisualObjectKind | undefined {
  return normalizeVisualObjectKindLocal(resolvePrimaryVisualObjectLocal(sequence)?.kind ?? sequence.primaryVisualKind);
}

function resolvePrimaryVisualKindLabel(sequence: ShotRenderSequence): string {
  const normalizedKind = resolvePrimaryVisualKindLocal(sequence);
  return normalizedKind ? normalizedKind.replaceAll("_", " ") : "legacy";
}

function resolveVisualBox(sequence: ShotRenderSequence): ShotLayoutBox {
  return sequence.visualBox ?? CHART_BOX;
}

function resolveNarrationBox(sequence: ShotRenderSequence): ShotLayoutBox {
  return sequence.narrationBox ?? NARRATION_BOX;
}

function humanizeDebugToken(value: string | undefined): string {
  return value ? value.replaceAll("_", " ") : "-";
}

function formatResolverModulePath(modulePath: string): string {
  const normalized = modulePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized;
}

function startCaseLabel(value: string): string {
  return value
    .split("_")
    .map((part) => (part.length > 0 ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function clipText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function uniqueNonEmptyStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => value?.trim() ?? "").filter((value) => value.length > 0))
  );
}

function splitNarrationFragments(text: string): string[] {
  const normalized = cleanMarkers(text);
  if (!normalized) {
    return [];
  }
  const fragments = normalized
    .split(/(?<=[.!?])\s+|[;:]/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0);
  return uniqueNonEmptyStrings(fragments);
}

function resolveSupportingVisualObjectsLocal(sequence: ShotRenderSequence): ShotVisualObject[] {
  return sequence.visualObjects?.filter((visualObject) => visualObject.semanticRole !== "primary_explainer") ?? [];
}

function resolveVisualTitleLocal(
  sequence: ShotRenderSequence,
  primaryObject: ShotVisualObject | undefined,
  primaryKind: ShotCanonicalVisualObjectKind | undefined
): string {
  if (primaryObject?.title?.trim()) {
    return clipText(primaryObject.title, 40);
  }

  if (sequence.visualPlan?.selectionReason?.trim()) {
    return clipText(sequence.visualPlan.selectionReason.replaceAll("_", " "), 40);
  }

  return primaryKind ? startCaseLabel(primaryKind) : "Explainer Panel";
}

function resolveVisualBodyLocal(sequence: ShotRenderSequence, primaryObject: ShotVisualObject | undefined): string {
  const body = cleanMarkers(primaryObject?.body ?? resolveTalkText(sequence) ?? sequence.narration);
  return body ? clipText(body, 220) : "Narration details are not available for this shot.";
}

function resolveVisualItemsLocal(
  sequence: ShotRenderSequence,
  primaryObject: ShotVisualObject | undefined
): string[] {
  const supportingObjects = resolveSupportingVisualObjectsLocal(sequence);
  const cueItems = uniqueNonEmptyStrings([
    ...(primaryObject?.items ?? []),
    ...supportingObjects.flatMap((visualObject) => visualObject.items ?? []),
    ...sequence.chartData.map((row) => row.label),
    ...splitNarrationFragments(primaryObject?.body ?? sequence.narration)
  ]);

  return cueItems.slice(0, 6);
}

type ResolvedVisualMetric = {
  value: string;
  label: string;
  detail?: string;
};

function resolveVisualMetricLocal(
  sequence: ShotRenderSequence,
  primaryObject: ShotVisualObject | undefined,
  items: string[]
): ResolvedVisualMetric | undefined {
  const targetRow =
    sequence.chartData[clamp(sequence.pointerTargetIndex, 0, Math.max(0, sequence.chartData.length - 1))] ??
    sequence.chartData[0];
  if (targetRow) {
    return {
      value: `${targetRow.value}${sequence.unit ? ` ${sequence.unit}` : ""}`,
      label: targetRow.label,
      detail: primaryObject?.selectionReason ? startCaseLabel(primaryObject.selectionReason) : undefined
    };
  }

  if (items.length > 0) {
    return {
      value: String(items.length),
      label: "Key points",
      detail: "explainer beats"
    };
  }

  return undefined;
}

function resolveVisualTheme(kind: ShotCanonicalVisualObjectKind | undefined): {
  background: string;
  border: string;
  accent: string;
  accentSoft: string;
  surface: string;
  chipBackground: string;
  chipBorder: string;
  chipText: string;
} {
  if (kind === "summary_card" || kind === "kpi_card") {
    return {
      background: "linear-gradient(160deg, rgba(10, 18, 34, 0.96) 0%, rgba(13, 41, 66, 0.94) 100%)",
      border: "rgba(133, 214, 255, 0.30)",
      accent: "#8AD6FF",
      accentSoft: "rgba(138, 214, 255, 0.22)",
      surface: "rgba(255, 255, 255, 0.05)",
      chipBackground: "rgba(138, 214, 255, 0.14)",
      chipBorder: "rgba(138, 214, 255, 0.32)",
      chipText: "#E7F9FF"
    };
  }

  if (kind === "checklist_card" || kind === "process_flow" || kind === "icon_array") {
    return {
      background: "linear-gradient(160deg, rgba(8, 23, 28, 0.96) 0%, rgba(13, 52, 58, 0.94) 100%)",
      border: "rgba(126, 231, 200, 0.30)",
      accent: "#7EE7C8",
      accentSoft: "rgba(126, 231, 200, 0.22)",
      surface: "rgba(255, 255, 255, 0.05)",
      chipBackground: "rgba(126, 231, 200, 0.14)",
      chipBorder: "rgba(126, 231, 200, 0.30)",
      chipText: "#E8FFF7"
    };
  }

  if (kind === "comparison_board" || kind === "timeline") {
    return {
      background: "linear-gradient(160deg, rgba(28, 18, 9, 0.96) 0%, rgba(66, 39, 18, 0.94) 100%)",
      border: "rgba(255, 205, 124, 0.30)",
      accent: "#FFCD7C",
      accentSoft: "rgba(255, 205, 124, 0.22)",
      surface: "rgba(255, 255, 255, 0.05)",
      chipBackground: "rgba(255, 205, 124, 0.14)",
      chipBorder: "rgba(255, 205, 124, 0.30)",
      chipText: "#FFF4DE"
    };
  }

  if (kind === "labeled_diagram") {
    return {
      background: "linear-gradient(160deg, rgba(24, 12, 30, 0.96) 0%, rgba(57, 26, 65, 0.94) 100%)",
      border: "rgba(224, 174, 255, 0.28)",
      accent: "#E0AEFF",
      accentSoft: "rgba(224, 174, 255, 0.22)",
      surface: "rgba(255, 255, 255, 0.05)",
      chipBackground: "rgba(224, 174, 255, 0.14)",
      chipBorder: "rgba(224, 174, 255, 0.30)",
      chipText: "#F8ECFF"
    };
  }

  return {
    background: "linear-gradient(160deg, rgba(12, 19, 34, 0.96) 0%, rgba(20, 28, 46, 0.94) 100%)",
    border: "rgba(255, 255, 255, 0.22)",
    accent: "#D7E6FF",
    accentSoft: "rgba(215, 230, 255, 0.16)",
    surface: "rgba(255, 255, 255, 0.05)",
    chipBackground: "rgba(215, 230, 255, 0.10)",
    chipBorder: "rgba(215, 230, 255, 0.22)",
    chipText: "#F2F7FF"
  };
}

function resolveIconToken(label: string): string {
  const letters = label
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
  return letters || "IO";
}

function normalizeDebugStatus(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "diverged") {
    return "divergence";
  }
  if (!normalized) {
    return "unknown";
  }
  return normalized;
}

function statusChipColors(status: string): { background: string; border: string; color: string } {
  const normalized = normalizeDebugStatus(status);
  if (normalized === "passed" || normalized === "ready") {
    return {
      background: "rgba(22, 101, 52, 0.18)",
      border: "rgba(134, 239, 172, 0.38)",
      color: "#d9ffe3"
    };
  }
  if (normalized === "warn" || normalized === "divergence") {
    return {
      background: "rgba(180, 83, 9, 0.18)",
      border: "rgba(253, 186, 116, 0.38)",
      color: "#ffefc7"
    };
  }
  if (normalized === "blocked" || normalized === "failed" || normalized === "below_min_score") {
    return {
      background: "rgba(185, 28, 28, 0.18)",
      border: "rgba(252, 165, 165, 0.38)",
      color: "#ffe2e2"
    };
  }
  return {
    background: "rgba(148, 163, 184, 0.16)",
    border: "rgba(226, 232, 240, 0.28)",
    color: "#e2e8f0"
  };
}

function statusLabel(status: string): string {
  return normalizeDebugStatus(status).replaceAll("_", " ");
}

function formatScore(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatDebugTimestamp(value: string | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("ko-KR", { hour12: false });
}

function resolveTargetIndex(targetId: string | undefined, rowCount: number, fallbackIndex: number): number {
  if (rowCount <= 0) {
    return 0;
  }

  if (!targetId) {
    return clamp(fallbackIndex, 0, rowCount - 1);
  }

  const digitMatch = targetId.match(/(\d+)(?!.*\d)/);
  if (digitMatch) {
    const parsed = Number.parseInt(digitMatch[1], 10);
    if (Number.isFinite(parsed)) {
      return clamp((parsed - 1 + rowCount) % rowCount, 0, rowCount - 1);
    }
  }

  return clamp(hashString(targetId) % rowCount, 0, rowCount - 1);
}

function findLatestEntry<T extends { f: number }>(entries: T[] | undefined, frame: number): T | undefined {
  if (!entries || entries.length === 0) {
    return undefined;
  }

  let candidate: T | undefined;
  for (const entry of entries) {
    if (entry.f <= frame) {
      if (!candidate || entry.f >= candidate.f) {
        candidate = entry;
      }
    }
  }

  return candidate;
}

function toEaseInOut(t: number): number {
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function resolveInterpolation(
  mode: "linear" | "ease" | "spring",
  frameOffset: number,
  frameSpan: number,
  fps: number
): number {
  const t = clamp(frameSpan <= 0 ? 1 : frameOffset / frameSpan, 0, 1);

  if (mode === "ease") {
    return toEaseInOut(t);
  }

  if (mode === "spring") {
    const raw = spring({
      fps,
      frame: frameOffset,
      config: {
        damping: 14,
        stiffness: 120,
        mass: 0.75
      }
    });
    return clamp(raw, 0, 1);
  }

  return t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function resolveCharacterPosition(
  sequence: ShotRenderSequence,
  localFrame: number,
  fps: number
): { x: number; y: number } {
  const fallback = {
    x: clamp(sequence.characterX, 0, 1),
    y: clamp(sequence.characterY, 0, 1)
  };

  const track = sequence.characterTracks?.posPath;
  if (!track || track.length === 0) {
    return fallback;
  }

  const sorted = [...track].sort((a, b) => a.f - b.f);
  if (localFrame <= sorted[0].f) {
    return { x: clamp(sorted[0].x, 0, 1), y: clamp(sorted[0].y, 0, 1) };
  }

  const last = sorted[sorted.length - 1];
  if (localFrame >= last.f) {
    return { x: clamp(last.x, 0, 1), y: clamp(last.y, 0, 1) };
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (localFrame >= start.f && localFrame <= end.f) {
      const frameSpan = Math.max(1, end.f - start.f);
      const frameOffset = clamp(localFrame - start.f, 0, frameSpan);
      const t = resolveInterpolation(end.interp, frameOffset, frameSpan, fps);
      return {
        x: clamp(lerp(start.x, end.x, t), 0, 1),
        y: clamp(lerp(start.y, end.y, t), 0, 1)
      };
    }
  }

  return fallback;
}

type ResolvedYawPlan = {
  from: number;
  to: number;
  ease: "linear" | "spring";
};

function deriveDefaultYawPlan(sequence: ShotRenderSequence): ResolvedYawPlan | null {
  const source = `${sequence.cameraPreset} ${sequence.narration} ${sequence.talkText ?? ""}`.toLowerCase();
  const hasLeft = /\bleft\b/.test(source);
  const hasRight = /\bright\b/.test(source);
  const direction = hasLeft ? -1 : hasRight ? 1 : 1;

  let magnitude = 0;
  if (source.includes("profile")) {
    magnitude = 0.95;
  } else if (
    source.includes("3q") ||
    source.includes("3/4") ||
    source.includes("three quarter") ||
    source.includes("three-quarter")
  ) {
    magnitude = 0.68;
  } else if (source.includes("turn") || source.includes("rotate") || source.includes("yaw")) {
    magnitude = 0.82;
  } else if (source.includes("whip")) {
    magnitude = 0.38;
  }

  if (magnitude <= 0.001) {
    return null;
  }

  return {
    from: 0,
    to: clamp(direction * magnitude, -1, 1),
    ease: magnitude >= 0.7 ? "spring" : "linear"
  };
}

function resolveYawPlan(sequence: ShotRenderSequence): ResolvedYawPlan | null {
  const derived = deriveDefaultYawPlan(sequence);
  const fromRaw = sequence.characterYawFrom ?? derived?.from;
  const toRaw = sequence.characterYawTo ?? derived?.to;

  if (typeof fromRaw !== "number" && typeof toRaw !== "number") {
    return null;
  }

  const from = clamp(fromRaw ?? toRaw ?? 0, -1, 1);
  const to = clamp(toRaw ?? fromRaw ?? from, -1, 1);
  const ease = sequence.characterYawEase ?? derived?.ease ?? "linear";

  return { from, to, ease };
}

function hasCharacterYawPlan(sequence: ShotRenderSequence): boolean {
  const plan = resolveYawPlan(sequence);
  return plan != null && Math.abs(plan.to - plan.from) > 0.01;
}

function resolveCharacterYaw(sequence: ShotRenderSequence, localFrame: number, fps: number): number {
  const plan = resolveYawPlan(sequence);
  if (!plan) {
    return 0;
  }

  if (Math.abs(plan.to - plan.from) < 0.0001) {
    return plan.from;
  }

  if (plan.ease === "spring") {
    const raw = spring({
      fps,
      frame: localFrame,
      config: {
        damping: 14,
        stiffness: 110,
        mass: 0.8
      }
    });
    const t = clamp(raw, 0, 1);
    return clamp(lerp(plan.from, plan.to, t), -1, 1);
  }

  const t = clamp(localFrame / Math.max(1, sequence.duration - 1), 0, 1);
  return clamp(lerp(plan.from, plan.to, t), -1, 1);
}

function computeBarGeometry(rows: ShotChartRow[] | undefined, box: ShotLayoutBox): BarGeometry[] {
  const safeRows = rows ?? [];
  const normalizedRows = safeRows.length > 0 ? safeRows : [{ label: "-", value: 1 }];
  const left = box.x + 56;
  const top = box.y + 86;
  const plotWidth = box.width - 112;
  const plotHeight = box.height - 156;
  const gap = 20;
  const count = normalizedRows.length;
  const barWidth = (plotWidth - gap * (count - 1)) / count;
  const maxValue = Math.max(1, ...normalizedRows.map((row) => row.value));

  return normalizedRows.map((row, index) => {
    const ratio = clamp(row.value / maxValue, 0, 1);
    const barHeight = Math.max(6, plotHeight * ratio);
    const x = left + index * (barWidth + gap);
    const y = top + plotHeight - barHeight;
    return {
      ...row,
      x,
      y,
      width: barWidth,
      height: barHeight,
      anchor: {
        x: x + barWidth * 0.5,
        y
      }
    };
  });
}

function fallbackCameraPoseFromPreset(cameraPreset: string): CameraPose {
  const lower = cameraPreset.toLowerCase();

  if (lower.includes("chart")) {
    return {
      x: 0.57,
      y: 0.5,
      zoom: 1.06,
      rotateDeg: 0
    };
  }

  if (lower.includes("close")) {
    return {
      x: 0.5,
      y: 0.5,
      zoom: 1.12,
      rotateDeg: 0
    };
  }

  if (lower.includes("wide")) {
    return {
      x: 0.5,
      y: 0.5,
      zoom: 0.96,
      rotateDeg: 0
    };
  }

  return {
    x: 0.5,
    y: 0.5,
    zoom: 1,
    rotateDeg: 0
  };
}

function deriveDefaultCameraKeyframes(sequence: ShotRenderSequence): ShotCameraKeyframe[] {
  const end = Math.max(1, sequence.duration - 1);
  const lower = sequence.cameraPreset.toLowerCase();
  const cue = `${lower} ${sequence.narration.toLowerCase()}`;
  const base = fallbackCameraPoseFromPreset(sequence.cameraPreset);

  if (cue.includes("whip")) {
    const direction = cue.includes("left") ? -1 : 1;
    return [
      { f: 0, x: clamp(0.5 - direction * 0.04, 0, 1), y: 0.5, zoom: 1.03, rotateDeg: direction * 0.2 },
      {
        f: Math.max(1, Math.floor(end * 0.22)),
        x: clamp(0.5 + direction * 0.32, 0, 1),
        y: 0.49,
        zoom: 1.09,
        rotateDeg: direction * 7.6
      },
      {
        f: Math.max(2, Math.floor(end * 0.46)),
        x: clamp(0.5 - direction * 0.12, 0, 1),
        y: 0.51,
        zoom: 1.03,
        rotateDeg: -direction * 1.5
      },
      { f: end, x: 0.5, y: 0.5, zoom: 1.01, rotateDeg: 0 }
    ];
  }

  if (cue.includes("close") || cue.includes("zoom")) {
    return [
      { f: 0, x: 0.5, y: 0.52, zoom: 1.04, rotateDeg: 0.2 },
      { f: Math.max(1, Math.floor(end * 0.5)), x: 0.5, y: 0.5, zoom: 1.1, rotateDeg: 0.12 },
      { f: end, x: 0.5, y: 0.48, zoom: 1.14, rotateDeg: 0 }
    ];
  }

  if (lower.includes("wide")) {
    return [
      { f: 0, x: 0.48, y: 0.53, zoom: 0.94, rotateDeg: 0 },
      { f: Math.max(1, Math.floor(end * 0.62)), x: 0.5, y: 0.51, zoom: 0.97, rotateDeg: -0.08 },
      { f: end, x: 0.5, y: 0.5, zoom: 0.99, rotateDeg: 0 }
    ];
  }

  if (cue.includes("chart")) {
    return [
      { f: 0, x: 0.54, y: 0.52, zoom: 1.01, rotateDeg: 0 },
      { f: Math.max(1, Math.floor(end * 0.55)), x: 0.57, y: 0.5, zoom: 1.06, rotateDeg: -0.12 },
      { f: end, x: 0.58, y: 0.49, zoom: 1.08, rotateDeg: 0 }
    ];
  }

  return [
    { f: 0, x: base.x, y: clamp(base.y + 0.01, 0, 1), zoom: base.zoom, rotateDeg: 0 },
    {
      f: Math.max(1, Math.floor(end * 0.55)),
      x: clamp(base.x + 0.01, 0, 1),
      y: base.y,
      zoom: base.zoom + 0.03,
      rotateDeg: -0.06
    },
    { f: end, x: clamp(base.x + 0.015, 0, 1), y: clamp(base.y - 0.01, 0, 1), zoom: base.zoom + 0.05, rotateDeg: 0 }
  ];
}

function resolveCameraKeyframes(sequence: ShotRenderSequence): ShotCameraKeyframe[] {
  if (sequence.cameraKeyframes && sequence.cameraKeyframes.length > 0) {
    return sequence.cameraKeyframes;
  }
  return deriveDefaultCameraKeyframes(sequence);
}

function resolveCameraPose(sequence: ShotRenderSequence, localFrame: number, fps: number): CameraPose {
  const keyframes = resolveCameraKeyframes(sequence);

  const sorted = [...keyframes].sort((a, b) => a.f - b.f);
  if (localFrame <= sorted[0].f) {
    return {
      x: clamp(sorted[0].x, 0, 1),
      y: clamp(sorted[0].y, 0, 1),
      zoom: Math.max(0.2, sorted[0].zoom),
      rotateDeg: sorted[0].rotateDeg
    };
  }

  const last = sorted[sorted.length - 1];
  if (localFrame >= last.f) {
    return {
      x: clamp(last.x, 0, 1),
      y: clamp(last.y, 0, 1),
      zoom: Math.max(0.2, last.zoom),
      rotateDeg: last.rotateDeg
    };
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (localFrame >= start.f && localFrame <= end.f) {
      const frameSpan = Math.max(1, end.f - start.f);
      const frameOffset = clamp(localFrame - start.f, 0, frameSpan);
      const t = resolveInterpolation("ease", frameOffset, frameSpan, fps);
      return {
        x: clamp(lerp(start.x, end.x, t), 0, 1),
        y: clamp(lerp(start.y, end.y, t), 0, 1),
        zoom: Math.max(0.2, lerp(start.zoom, end.zoom, t)),
        rotateDeg: lerp(start.rotateDeg, end.rotateDeg, t)
      };
    }
  }

  return fallbackCameraPoseFromPreset(sequence.cameraPreset);
}

function resolveCameraRigPreset(cameraPreset: string): CameraPreset {
  const lower = cameraPreset.toLowerCase();
  if (lower.includes("whip")) {
    return lower.includes("left") ? "whip-pan-left" : "whip-pan-right";
  }
  if (lower.includes("shake")) {
    return "shake";
  }
  return "none";
}

function styleTokenToColor(styleToken: string): string {
  const lower = styleToken.toLowerCase();
  if (lower.includes("warn")) {
    return "#FFD166";
  }
  if (lower.includes("hot") || lower.includes("danger")) {
    return "#FF6B6B";
  }
  return "#FFF27A";
}

function resolveTalkText(sequence: ShotRenderSequence): string | undefined {
  if (typeof sequence.talkText === "string" && sequence.talkText.trim().length > 0) {
    return cleanMarkers(sequence.talkText);
  }

  const normalizedNarration = cleanMarkers(sequence.narration);
  if (normalizedNarration.length > 0) {
    return normalizedNarration;
  }

  return undefined;
}

function resolveFinishProfileLocal(sequence: ShotRenderSequence): ShotFinishProfile {
  if (sequence.finishProfile) {
    return sequence.finishProfile;
  }

  const profileInput = {
    channelDomain: sequence.visualPlan?.channelDomain,
    mascotId: sequence.mascotId,
    hasChart: sequence.hasChart || sequence.visualMode === "chart",
    primaryVisualKind: sequence.primaryVisualKind,
    insertNeed: sequence.insertNeed ?? "none"
  } as const;

  if (sequence.profileBundle) {
    return resolveDeterministicFinishProfile({
      ...profileInput,
      profileBundle: sequence.profileBundle
    });
  }

  return resolveDeterministicProfileSeam(profileInput).finishProfile;
}

function buildSceneFinishFilter(profile: ShotFinishProfile): string {
  const sharpenRadius = 0.24 + profile.lineSharpenStrength * 0.9;
  const sharpenAlpha = 0.06 + profile.lineSharpenStrength * 0.14;
  return [
    `brightness(${profile.brightness.toFixed(3)})`,
    `contrast(${profile.contrast.toFixed(3)})`,
    `saturate(${profile.saturation.toFixed(3)})`,
    `drop-shadow(0 0 ${sharpenRadius.toFixed(2)}px rgba(255,255,255,${sharpenAlpha.toFixed(3)}))`
  ].join(" ");
}

function resolveBoxCenter(box: ShotLayoutBox | undefined, fallback: { x: number; y: number }) {
  if (!box) {
    return fallback;
  }

  return {
    x: box.x + box.width * 0.5,
    y: box.y + box.height * 0.5
  };
}

function resolveLookTarget(
  lookTargetToken: string | undefined,
  pointerTarget: { x: number; y: number },
  visualBox: ShotLayoutBox,
  narrationBox: ShotLayoutBox,
  pointerReachableZone: ShotLayoutBox | undefined,
  profileBundle?: ShotProfileBundle
): { x: number; y: number } {
  const pointerBias = profileBundle?.pointerBias ?? "soft_visual";
  if (lookTargetToken === "chart") {
    return pointerBias === "guided_callout"
      ? resolveBoxCenter(pointerReachableZone, pointerTarget)
      : pointerTarget;
  }
  if (lookTargetToken === "visual") {
    return pointerBias === "chart_precise"
      ? pointerTarget
      : resolveBoxCenter(pointerReachableZone, resolveBoxCenter(visualBox, pointerTarget));
  }
  if (lookTargetToken === "narration") {
    return resolveBoxCenter(narrationBox, { x: FRAME_WIDTH * 0.56, y: FRAME_HEIGHT * 0.78 });
  }
  if (pointerBias === "guided_callout") {
    return resolveBoxCenter(pointerReachableZone, resolveBoxCenter(visualBox, pointerTarget));
  }
  return { x: FRAME_WIDTH * 0.55, y: FRAME_HEIGHT * 0.34 };
}

function resolvePerformanceOffset(
  actionClip: string | undefined,
  expression: string | undefined,
  frame: number,
  profileBundle?: ShotProfileBundle
): { x: number; y: number } {
  const wave = Math.sin(frame * 0.11);
  const drift = Math.cos(frame * 0.07);
  let x = 0;
  let y = 0;

  if (actionClip === "greet") {
    x += wave * 10;
    y += drift * 4 - 2;
  } else if (actionClip === "move") {
    x += wave * 14;
    y += Math.sin(frame * 0.18) * 3;
  } else if (actionClip === "conclude") {
    y -= 6 + drift * 2;
  } else if (actionClip === "explain") {
    x += wave * 6;
    y += drift * 2;
  }

  if (expression === "focused") {
    y -= 4;
  } else if (expression === "excited") {
    x += wave * 4;
    y -= 6;
  }

  if (profileBundle?.actingBias === "analytic_presenter") {
    x *= 0.78;
    y *= 0.74;
  } else if (profileBundle?.actingBias === "warm_guide") {
    x *= 1.06;
    y *= 1.04;
    if (actionClip === "greet" || actionClip === "explain") {
      x += wave * 2.5;
      y += Math.sin(frame * 0.09) * 1.8;
    }
  }

  return { x, y };
}

function resolveTransitionType(sequence: ShotRenderSequence): ShotTransitionType {
  if (sequence.transitionType) {
    return sequence.transitionType;
  }

  const hint = (sequence.transitionHint ?? "").toLowerCase();
  if (hint.includes("whip")) {
    return "whipPan";
  }
  if (hint.includes("flash")) {
    return "flashCut";
  }
  if (hint.includes("cross")) {
    return "crossfade";
  }

  const preset = sequence.cameraPreset.toLowerCase();
  if (preset.includes("whip")) {
    return "whipPan";
  }
  if (preset.includes("flash")) {
    return "flashCut";
  }

  const narration = sequence.narration.toLowerCase();
  if (narration.includes("whip")) {
    return "whipPan";
  }
  if (narration.includes("flash")) {
    return "flashCut";
  }

  return "crossfade";
}

function resolveEmphasisAtFrame(sequence: ShotRenderSequence): number {
  const fallback = Math.round(sequence.duration * 0.4);
  return clamp(sequence.emphasisAtFrame ?? fallback, 0, Math.max(0, sequence.duration - 1));
}

function resolveNumberPopFrame(sequence: ShotRenderSequence): number {
  const fallback = Math.round(sequence.duration * 0.16);
  return clamp(fallback, 0, Math.max(0, sequence.duration - 1));
}

function resolvePunchlineFrame(sequence: ShotRenderSequence): number {
  const fallback = Math.round(sequence.duration * 0.72);
  return clamp(fallback, 0, Math.max(0, sequence.duration - 1));
}

function resolveTimeRemappedFrame(sequence: ShotRenderSequence, localFrame: number): number {
  const maxFrame = Math.max(0, sequence.duration - 1);
  const numberPopFrame = resolveNumberPopFrame(sequence);
  const emphasisAtFrame = resolveEmphasisAtFrame(sequence);
  const punchlineFrame = resolvePunchlineFrame(sequence);

  let remapped = localFrame;
  remapped = holdThenSnap(remapped, numberPopFrame, sequence.hasChart ? 2 : 1, 1.15);
  remapped = holdThenSnap(remapped, emphasisAtFrame, sequence.hasChart ? 4 : 2, 1.55);
  remapped = holdThenSnap(remapped, punchlineFrame, 2, 1.1);
  remapped += beatPunch(localFrame, emphasisAtFrame, 1.1);
  remapped += beatPunch(localFrame, punchlineFrame, 0.6);

  return clamp(remapped, 0, maxFrame);
}

function resolveMacroCutawayWeight(localFrame: number, emphasisAtFrame: number): number {
  const start = emphasisAtFrame - 10;
  const zoomInEnd = emphasisAtFrame + 2;
  const holdEnd = emphasisAtFrame + 10;
  const end = emphasisAtFrame + 24;

  if (localFrame <= start || localFrame >= end) {
    return 0;
  }

  if (localFrame < zoomInEnd) {
    return toEaseInOut((localFrame - start) / Math.max(1, zoomInEnd - start));
  }

  if (localFrame <= holdEnd) {
    return 1;
  }

  return 1 - toEaseInOut((localFrame - holdEnd) / Math.max(1, end - holdEnd));
}

type ChartViewProps = {
  sequence: ShotRenderSequence;
  pointerIndex: number;
  highlightIndices: number[];
  localFrame: number;
  fps: number;
  emphasisAtFrame: number;
};

type AnimatedBarState = {
  top: number;
  height: number;
  growProgress: number;
  countProgress: number;
  countValue: number;
};

const ChartView = ({
  sequence,
  pointerIndex,
  highlightIndices,
  localFrame,
  fps,
  emphasisAtFrame
}: ChartViewProps) => {
  const visualBox = resolveVisualBox(sequence);
  const bars = computeBarGeometry(sequence.chartData ?? [], visualBox);
  const highlightSet = new Set(highlightIndices);

  const countUpFrames = Math.max(14, Math.floor(sequence.duration * 0.35));

  const animateBar = (bar: BarGeometry, index: number): AnimatedBarState => {
    const introDelay = index * 2;

    const rawGrow = spring({
      fps,
      frame: localFrame - introDelay,
      config: {
        damping: 11,
        stiffness: 120,
        mass: 0.7
      }
    });

    const growProgress = clamp(rawGrow, 0, 1.16);
    const animatedHeight = Math.max(2, bar.height * Math.max(0, growProgress));
    const baseline = bar.y + bar.height;
    const animatedTop = baseline - animatedHeight;

    const countProgress = clamp(
      interpolate(localFrame - introDelay, [0, countUpFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp"
      }),
      0,
      1
    );

    return {
      top: animatedTop,
      height: animatedHeight,
      growProgress,
      countProgress,
      countValue: Math.round(bar.value * countProgress)
    };
  };

  const targetIndex = clamp(pointerIndex, 0, Math.max(0, bars.length - 1));
  const targetBar = bars[targetIndex];
  const targetAnimated = targetBar ? animateBar(targetBar, targetIndex) : undefined;

  const emphasisEnvelope = clamp(1 - Math.abs(localFrame - emphasisAtFrame) / 20, 0, 1);
  const emphasisSpring =
    localFrame >= emphasisAtFrame
      ? spring({
          fps,
          frame: localFrame - emphasisAtFrame,
          config: {
            damping: 14,
            stiffness: 180,
            mass: 0.5
          }
        })
      : 0;
  const pulseScale = 1 + emphasisEnvelope * (0.04 + clamp(emphasisSpring, 0, 1.2) * 0.06);

  const emphasisRect =
    targetBar && targetAnimated
      ? {
          x: clamp(targetBar.x - visualBox.x - 12, 0, visualBox.width - 8),
          y: clamp(targetAnimated.top - visualBox.y - 12, 0, visualBox.height - 8),
          width: clamp(targetBar.width + 24, 16, visualBox.width),
          height: clamp(targetAnimated.height + 24, 24, visualBox.height)
        }
      : undefined;

  return (
    <div
      style={{
        position: "absolute",
        left: visualBox.x,
        top: visualBox.y,
        width: visualBox.width,
        height: visualBox.height,
        borderRadius: 20,
        border: "2px solid rgba(255, 255, 255, 0.28)",
        background: "linear-gradient(180deg, rgba(12, 19, 34, 0.84) 0%, rgba(6, 10, 20, 0.92) 100%)",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 22,
          color: "#e9f2ff",
          fontSize: 32,
          fontWeight: 700
        }}
      >
        Chart View
      </div>

      {bars.map((bar, index) => {
        const isPointer = index === targetIndex;
        const isHighlighted = highlightSet.has(index);
        const animated = animateBar(bar, index);
        const barLeft = bar.x - visualBox.x;
        const barTop = animated.top - visualBox.y;

        return (
          <div key={`${bar.label}:${index}`}>
            <div
              style={{
                position: "absolute",
                left: barLeft,
                top: barTop,
                width: bar.width,
                height: animated.height,
                borderRadius: 10,
                background: isPointer
                  ? "linear-gradient(180deg, #87e3cc 0%, #d9fff4 180%)"
                  : "linear-gradient(180deg, #5f9ff2 0%, #294569 180%)",
                boxShadow:
                  isHighlighted || (isPointer && emphasisEnvelope > 0)
                    ? "0 0 0 2px rgba(255, 242, 122, 0.7), 0 0 18px rgba(255, 242, 122, 0.45)"
                    : undefined,
                transform: isPointer ? `scale(${pulseScale}, ${1 + emphasisEnvelope * 0.08})` : undefined,
                transformOrigin: "50% 100%"
              }}
            />

            <div
              style={{
                position: "absolute",
                left: barLeft + bar.width * 0.5,
                top: barTop - 30,
                transform: "translateX(-50%)",
                color: "#edf4ff",
                fontSize: 22,
                fontWeight: 700
              }}
            >
              {animated.countValue}
              {sequence.unit ? ` ${sequence.unit}` : ""}
            </div>

            <div
              style={{
                position: "absolute",
                left: barLeft + bar.width * 0.5,
                top: visualBox.height - 52,
                transform: "translateX(-50%)",
                color: "#c7d6f0",
                fontSize: 22
              }}
            >
              {bar.label}
            </div>
          </div>
        );
      })}

      {emphasisRect ? (
        <>
          <div
            style={{
              position: "absolute",
              left: emphasisRect.x - 8,
              top: emphasisRect.y - 8,
              width: emphasisRect.width + 16,
              height: emphasisRect.height + 16,
              borderRadius: 14,
              boxShadow: "0 0 0 2px rgba(255, 242, 122, 0.8), 0 0 20px rgba(255, 242, 122, 0.5)",
              opacity: emphasisEnvelope * 0.55,
              transform: `scale(${1 + emphasisEnvelope * 0.08})`,
              transformOrigin: "50% 50%"
            }}
          />
          <ScribbleHighlight
            width={visualBox.width}
            height={visualBox.height}
            rect={emphasisRect}
            startFrame={emphasisAtFrame}
            durationInFrames={18}
            color="#FFF27A"
            strokeWidth={6}
          />
        </>
      ) : null}

      {sequence.annotationsEnabled && sequence.chartCallout ? (
        <div
          style={{
            position: "absolute",
            left: 26,
            right: 26,
            bottom: 18,
            color: "#eff6ff",
            fontSize: 24,
            fontWeight: 600,
            background: "rgba(6, 11, 20, 0.66)",
            borderRadius: 12,
            padding: "10px 12px"
          }}
        >
          {sequence.chartCallout}
        </div>
      ) : null}
    </div>
  );
};

type TableViewProps = {
  sequence: ShotRenderSequence;
};

const TableView = ({ sequence }: TableViewProps) => {
  const visualBox = resolveVisualBox(sequence);
  const sourceRows = sequence.chartData ?? [];
  const rows = sourceRows.length > 0 ? sourceRows : [{ label: "-", value: 0 }];
  return (
    <div
      style={{
        position: "absolute",
        left: visualBox.x,
        top: visualBox.y,
        width: visualBox.width,
        height: visualBox.height,
        borderRadius: 20,
        border: "2px solid rgba(255, 255, 255, 0.28)",
        background: "linear-gradient(180deg, rgba(12, 19, 34, 0.84) 0%, rgba(6, 10, 20, 0.92) 100%)",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 28,
          top: 22,
          color: "#e9f2ff",
          fontSize: 32,
          fontWeight: 700
        }}
      >
        Table View
      </div>

      <div
        style={{
          position: "absolute",
          left: 26,
          right: 26,
          top: 86,
          bottom: 24,
          borderRadius: 12,
          border: "1px solid rgba(255, 255, 255, 0.2)",
          overflow: "hidden"
        }}
      >
        {rows.map((row, index) => (
          <div
            key={`${row.label}:${index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom:
                index === rows.length - 1 ? "none" : "1px solid rgba(255, 255, 255, 0.12)",
              background: index % 2 === 0 ? "rgba(255, 255, 255, 0.04)" : "rgba(255, 255, 255, 0.02)"
            }}
          >
            <span
              style={{
                color: "#dbe6fa",
                fontSize: 24
              }}
            >
              {row.label}
            </span>
            <span
              style={{
                color: "#f5f9ff",
                fontSize: 24,
                fontWeight: 700
              }}
            >
              {row.value}
              {sequence.unit ? ` ${sequence.unit}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

type ExplainerVisualViewProps = {
  sequence: ShotRenderSequence;
  localFrame: number;
  fps: number;
  emphasisAtFrame: number;
};

const ExplainerVisualView = ({
  sequence,
  localFrame,
  fps,
  emphasisAtFrame
}: ExplainerVisualViewProps) => {
  const visualBox = resolveVisualBox(sequence);
  const primaryKind = resolvePrimaryVisualKindLocal(sequence);
  const primaryObject = resolvePrimaryVisualObjectLocal(sequence);
  const supportingObjects = resolveSupportingVisualObjectsLocal(sequence);
  const items = resolveVisualItemsLocal(sequence, primaryObject);
  const title = resolveVisualTitleLocal(sequence, primaryObject, primaryKind);
  const body = resolveVisualBodyLocal(sequence, primaryObject);
  const metric = resolveVisualMetricLocal(sequence, primaryObject, items);
  const theme = resolveVisualTheme(primaryKind);
  const finishProfile = resolveFinishProfileLocal(sequence);
  const badges = uniqueNonEmptyStrings([
    sequence.visualPlan?.channelDomain ? startCaseLabel(sequence.visualPlan.channelDomain) : undefined,
    sequence.visualPlan?.educationalMode ? startCaseLabel(sequence.visualPlan.educationalMode) : undefined,
    startCaseLabel(finishProfile.tone),
    startCaseLabel(finishProfile.textureMatch)
  ]).slice(0, 3);

  const introProgress = clamp(
    spring({
      fps,
      frame: localFrame,
      config: {
        damping: 16,
        stiffness: 118,
        mass: 0.78
      }
    }),
    0,
    1
  );
  const emphasisEnvelope = clamp(1 - Math.abs(localFrame - emphasisAtFrame) / 20, 0, 1);
  const scale = 1 + emphasisEnvelope * 0.02;
  const highlightOpacity = 0.16 + emphasisEnvelope * 0.16;

  const renderChecklistRows = () => {
    const checklistItems = items.length > 0 ? items : splitNarrationFragments(body).slice(0, 4);
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {checklistItems.slice(0, 4).map((item, index) => {
          const rowProgress = clamp(
            spring({
              fps,
              frame: localFrame - 3 - index * 2,
              config: {
                damping: 14,
                stiffness: 124,
                mass: 0.7
              }
            }),
            0,
            1
          );
          return (
            <div
              key={`${item}:${index}`}
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr",
                alignItems: "center",
                gap: 14,
                padding: "14px 18px",
                borderRadius: 18,
                border: `1px solid ${theme.chipBorder}`,
                background: theme.surface,
                opacity: rowProgress,
                transform: `translateX(${interpolate(rowProgress, [0, 1], [18, 0])}px)`
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  background: theme.accentSoft,
                  border: `1px solid ${theme.chipBorder}`,
                  color: theme.chipText,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  fontWeight: 800
                }}
              >
                {String(index + 1).padStart(2, "0")}
              </div>
              <div style={{ color: "#F4F8FF", fontSize: 24, lineHeight: 1.35 }}>{clipText(item, 72)}</div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderStepRail = (mode: "timeline" | "process_flow") => {
    const stepItems = items.length > 0 ? items : splitNarrationFragments(body).slice(0, 4);
    const steps = stepItems.slice(0, 4);
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div
          style={{
            position: "relative",
            height: 8,
            borderRadius: 999,
            background: "rgba(255, 255, 255, 0.08)",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${Math.max(18, introProgress * 100)}%`,
              background: `linear-gradient(90deg, ${theme.accentSoft} 0%, ${theme.accent} 100%)`
            }}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, steps.length)}, 1fr)`, gap: 14 }}>
          {steps.map((step, index) => {
            const stepProgress = clamp(
              spring({
                fps,
                frame: localFrame - 5 - index * 3,
                config: {
                  damping: 14,
                  stiffness: 120,
                  mass: 0.72
                }
              }),
              0,
              1
            );
            return (
              <div
                key={`${step}:${index}`}
                style={{
                  minHeight: 138,
                  padding: "18px 16px",
                  borderRadius: 20,
                  border: `1px solid ${theme.chipBorder}`,
                  background: theme.surface,
                  display: "grid",
                  gap: 10,
                  opacity: stepProgress,
                  transform: `translateY(${interpolate(stepProgress, [0, 1], [18, 0])}px)`
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: theme.accentSoft,
                    color: theme.chipText,
                    fontSize: 16,
                    fontWeight: 800
                  }}
                >
                  {mode === "timeline" ? `T${index + 1}` : `P${index + 1}`}
                </div>
                <div style={{ color: "#F6FAFF", fontSize: 25, lineHeight: 1.3, fontWeight: 650 }}>
                  {clipText(step, 54)}
                </div>
                <div style={{ color: "#C9D7EE", fontSize: 15, lineHeight: 1.4 }}>
                  {mode === "timeline" ? "sequence checkpoint" : "process stage"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderComparisonBoard = () => {
    const pairedRows = sequence.chartData.slice(0, 4).map((row) => ({
      label: row.label,
      value: `${row.value}${sequence.unit ? ` ${sequence.unit}` : ""}`
    }));
    const fallbackRows = items.slice(0, 4).map((item, index) => ({
      label: index % 2 === 0 ? "Current" : "Shift",
      value: clipText(item, 36)
    }));
    const rows = pairedRows.length > 0 ? pairedRows : fallbackRows;
    const leftRows = rows.filter((_, index) => index % 2 === 0).slice(0, 2);
    const rightRows = rows.filter((_, index) => index % 2 === 1).slice(0, 2);

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {[leftRows, rightRows].map((columnRows, columnIndex) => (
          <div
            key={columnIndex === 0 ? "left" : "right"}
            style={{
              minHeight: 250,
              padding: "18px 18px 20px",
              borderRadius: 24,
              border: `1px solid ${theme.chipBorder}`,
              background: theme.surface,
              display: "grid",
              gap: 14
            }}
          >
            <div style={{ color: theme.chipText, fontSize: 14, fontWeight: 800, letterSpacing: "0.1em" }}>
              {columnIndex === 0 ? "BOARD A" : "BOARD B"}
            </div>
            {columnRows.length > 0 ? (
              columnRows.map((row) => (
                <div
                  key={`${row.label}:${row.value}`}
                  style={{
                    padding: "14px 14px 16px",
                    borderRadius: 18,
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    display: "grid",
                    gap: 8
                  }}
                >
                  <div style={{ color: "#C5D3E9", fontSize: 15, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {row.label}
                  </div>
                  <div style={{ color: "#F7FBFF", fontSize: 32, fontWeight: 750 }}>{row.value}</div>
                </div>
              ))
            ) : (
              <div style={{ color: "#D7E3F7", fontSize: 20 }}>No paired comparison data.</div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderKpiCard = () => (
    <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 18, alignItems: "stretch" }}>
      <div
        style={{
          padding: "22px 22px 24px",
          borderRadius: 24,
          border: `1px solid ${theme.chipBorder}`,
          background: theme.surface,
          display: "grid",
          alignContent: "center",
          gap: 10
        }}
      >
        <div style={{ color: "#C7D7EF", fontSize: 15, textTransform: "uppercase", letterSpacing: "0.12em" }}>
          {metric?.label ?? "Primary metric"}
        </div>
        <div style={{ color: "#F7FBFF", fontSize: 70, fontWeight: 780, lineHeight: 0.95 }}>
          {metric?.value ?? "--"}
        </div>
        <div style={{ color: theme.chipText, fontSize: 16 }}>{metric?.detail ?? "deterministic summary card"}</div>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ color: "#F5FAFF", fontSize: 30, fontWeight: 700, lineHeight: 1.2 }}>{clipText(body, 120)}</div>
        <div style={{ display: "grid", gap: 10 }}>
          {items.slice(0, 3).map((item, index) => (
            <div
              key={`${item}:${index}`}
              style={{
                padding: "12px 14px",
                borderRadius: 16,
                border: `1px solid ${theme.chipBorder}`,
                background: theme.surface,
                color: "#EAF2FF",
                fontSize: 20
              }}
            >
              {clipText(item, 60)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderLabeledDiagram = () => {
    const diagramLabels = items.length > 0 ? items : splitNarrationFragments(body).slice(0, 4);
    const leftLabels = diagramLabels.filter((_, index) => index % 2 === 0).slice(0, 2);
    const rightLabels = diagramLabels.filter((_, index) => index % 2 === 1).slice(0, 2);

    const renderDiagramLabel = (label: string, index: number, side: "left" | "right") => (
      <div
        key={`${side}:${label}:${index}`}
        style={{
          display: "grid",
          gap: 8,
          justifyItems: side === "left" ? "end" : "start",
          textAlign: side === "left" ? "right" : "left"
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            background: theme.accent,
            boxShadow: `0 0 0 6px ${theme.accentSoft}`
          }}
        />
        <div style={{ color: "#F6F0FF", fontSize: 21, lineHeight: 1.3, maxWidth: 190 }}>{clipText(label, 44)}</div>
      </div>
    );

    return (
      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 0.8fr", gap: 16, alignItems: "center" }}>
        <div style={{ display: "grid", gap: 34, justifyItems: "end" }}>
          {leftLabels.map((label, index) => renderDiagramLabel(label, index, "left"))}
        </div>
        <div
          style={{
            height: 280,
            borderRadius: 999,
            border: `1px solid ${theme.chipBorder}`,
            background: `radial-gradient(circle at 50% 40%, ${theme.accentSoft} 0%, rgba(255, 255, 255, 0.05) 55%, rgba(255, 255, 255, 0.02) 100%)`,
            display: "grid",
            alignItems: "center",
            justifyItems: "center",
            boxShadow: `inset 0 0 0 1px ${theme.chipBorder}, 0 0 34px ${theme.accentSoft}`
          }}
        >
          <div style={{ display: "grid", gap: 10, justifyItems: "center", padding: "0 34px", textAlign: "center" }}>
            <div style={{ color: theme.chipText, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              labeled diagram
            </div>
            <div style={{ color: "#FBF6FF", fontSize: 34, fontWeight: 760, lineHeight: 1.12 }}>{title}</div>
            <div style={{ color: "#E5D6F2", fontSize: 18, lineHeight: 1.4 }}>{clipText(body, 90)}</div>
          </div>
        </div>
        <div style={{ display: "grid", gap: 34, justifyItems: "start" }}>
          {rightLabels.map((label, index) => renderDiagramLabel(label, index, "right"))}
        </div>
      </div>
    );
  };

  const renderIconArray = () => {
    const iconItems = items.length > 0 ? items : splitNarrationFragments(body).slice(0, 4);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {iconItems.slice(0, 4).map((item, index) => (
          <div
            key={`${item}:${index}`}
            style={{
              minHeight: 148,
              padding: "18px 18px 16px",
              borderRadius: 22,
              border: `1px solid ${theme.chipBorder}`,
              background: theme.surface,
              display: "grid",
              gap: 12
            }}
          >
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: 18,
                background: theme.accentSoft,
                border: `1px solid ${theme.chipBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: theme.chipText,
                fontSize: 20,
                fontWeight: 780
              }}
            >
              {resolveIconToken(item)}
            </div>
            <div style={{ color: "#F5FAFF", fontSize: 24, lineHeight: 1.32 }}>{clipText(item, 42)}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderFallbackDataRows = () => {
    const rows =
      sequence.chartData.length > 0
        ? sequence.chartData.slice(0, 4).map((row) => ({
            label: row.label,
            value: `${row.value}${sequence.unit ? ` ${sequence.unit}` : ""}`
          }))
        : items.slice(0, 4).map((item, index) => ({
            label: `Point ${index + 1}`,
            value: clipText(item, 34)
          }));
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {rows.map((row) => (
          <div
            key={`${row.label}:${row.value}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              alignItems: "center",
              padding: "14px 16px",
              borderRadius: 18,
              border: `1px solid ${theme.chipBorder}`,
              background: theme.surface
            }}
          >
            <div style={{ color: "#D5E2F8", fontSize: 21 }}>{row.label}</div>
            <div style={{ color: "#F7FBFF", fontSize: 24, fontWeight: 720 }}>{row.value}</div>
          </div>
        ))}
      </div>
    );
  };

  let content: React.JSX.Element;
  switch (primaryKind) {
    case "checklist_card":
      content = renderChecklistRows();
      break;
    case "timeline":
      content = renderStepRail("timeline");
      break;
    case "process_flow":
      content = renderStepRail("process_flow");
      break;
    case "comparison_board":
      content = renderComparisonBoard();
      break;
    case "kpi_card":
      content = renderKpiCard();
      break;
    case "labeled_diagram":
      content = renderLabeledDiagram();
      break;
    case "icon_array":
      content = renderIconArray();
      break;
    case "summary_card":
      content = (
        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ color: "#F5FAFF", fontSize: 34, lineHeight: 1.22, fontWeight: 700 }}>{clipText(body, 140)}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {items.slice(0, 4).map((item, index) => (
              <div
                key={`${item}:${index}`}
                style={{
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: `1px solid ${theme.chipBorder}`,
                  background: theme.chipBackground,
                  color: theme.chipText,
                  fontSize: 18,
                  fontWeight: 600
                }}
              >
                {clipText(item, 28)}
              </div>
            ))}
          </div>
          {supportingObjects.length > 0 ? (
            <div style={{ color: "#C8D7F0", fontSize: 16 }}>
              support: {clipText((supportingObjects[0].title ?? supportingObjects[0].body ?? "").replaceAll("_", " "), 72)}
            </div>
          ) : null}
        </div>
      );
      break;
    default:
      content = renderFallbackDataRows();
      break;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: visualBox.x,
        top: visualBox.y,
        width: visualBox.width,
        height: visualBox.height,
        borderRadius: 24,
        border: `1px solid ${theme.border}`,
        background: theme.background,
        overflow: "hidden",
        opacity: introProgress,
        transform: `translateY(${interpolate(introProgress, [0, 1], [28, 0])}px) scale(${scale})`,
        transformOrigin: "50% 50%",
        boxShadow: `0 26px 48px rgba(0, 0, 0, 0.30), 0 0 ${Math.round(
          28 + finishProfile.bloomOpacity * 120
        )}px rgba(255, 255, 255, ${Math.min(0.18, finishProfile.bloomOpacity * 0.55).toFixed(3)}), 0 0 0 1px rgba(255, 255, 255, 0.03)`
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 86% 18%, ${theme.accentSoft} 0%, rgba(255, 255, 255, 0) 36%)`,
          opacity: highlightOpacity
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: finishProfile.tintGradient,
          opacity: Math.min(0.16, finishProfile.tintOpacity * 1.7),
          mixBlendMode: "soft-light"
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 22,
          borderRadius: 20,
          border: "1px solid rgba(255, 255, 255, 0.08)",
          background: "rgba(255, 255, 255, 0.02)"
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "grid",
          gridTemplateRows: "auto auto 1fr",
          gap: 18,
          height: "100%",
          padding: "26px 28px 28px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ color: theme.chipText, fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              explainer visual
            </div>
            <div style={{ color: "#F7FBFF", fontSize: 36, fontWeight: 760, lineHeight: 1.08 }}>{title}</div>
          </div>
          <div
            style={{
              padding: "9px 12px",
              borderRadius: 999,
              border: `1px solid ${theme.chipBorder}`,
              background: theme.chipBackground,
              color: theme.chipText,
              fontSize: 14,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em"
            }}
          >
            {primaryKind ? startCaseLabel(primaryKind) : "explainer"}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {badges.map((badge) => (
            <div
              key={badge}
              style={{
                padding: "7px 12px",
                borderRadius: 999,
                border: `1px solid ${theme.chipBorder}`,
                background: theme.chipBackground,
                color: theme.chipText,
                fontSize: 13,
                fontWeight: 650
              }}
            >
              {badge}
            </div>
          ))}
          {sequence.visualPlan?.selectionReason ? (
            <div
              style={{
                padding: "7px 12px",
                borderRadius: 999,
                border: "1px solid rgba(255, 255, 255, 0.14)",
                background: "rgba(255, 255, 255, 0.04)",
                color: "#D6E2F6",
                fontSize: 13
              }}
            >
              {clipText(sequence.visualPlan.selectionReason.replaceAll("_", " "), 38)}
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gridTemplateRows: metric ? "auto 1fr" : "1fr", gap: 18 }}>
          {metric ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 16,
                alignItems: "end",
                padding: "16px 18px",
                borderRadius: 20,
                border: `1px solid ${theme.chipBorder}`,
                background: theme.surface
              }}
            >
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ color: "#C7D7EE", fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  spotlight
                </div>
                <div style={{ color: "#F8FBFF", fontSize: 22, fontWeight: 680 }}>{metric.label}</div>
              </div>
              <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                <div style={{ color: theme.chipText, fontSize: 36, fontWeight: 780, lineHeight: 1 }}>{metric.value}</div>
                {metric.detail ? <div style={{ color: "#C0D2EA", fontSize: 14 }}>{metric.detail}</div> : null}
              </div>
            </div>
          ) : null}
          {content}
        </div>
      </div>
    </div>
  );
};

type DebugOverlayProps = {
  episodeId: string;
  activeSequence?: ShotRenderSequence;
  overlay?: ShotDebugOverlay;
};

const DebugOverlay = ({ episodeId, activeSequence, overlay }: DebugOverlayProps) => {
  if (!overlay?.enabled) {
    return (
      <div
        style={{
          position: "absolute",
          right: 30,
          top: 28,
          color: "#c4d6f8",
          fontSize: 20,
          padding: "8px 12px",
          background: "rgba(6, 10, 16, 0.58)",
          borderRadius: 10
        }}
      >
        Episode: {episodeId}
      </div>
    );
  }

  const qcColors = statusChipColors(overlay.qc.status);
  const fallbackSummary =
    overlay.qc.fallbackStepsApplied.length > 0 ? overlay.qc.fallbackStepsApplied.join(", ") : "none";
  const activeFinish = activeSequence ? resolveFinishProfileLocal(activeSequence) : undefined;

  return (
    <div
      style={{
        position: "absolute",
        right: 28,
        top: 26,
        width: 430,
        display: "grid",
        gap: 10,
        padding: "14px 16px",
        borderRadius: 16,
        background: "rgba(5, 9, 18, 0.76)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        boxShadow: "0 18px 40px rgba(0, 0, 0, 0.32)",
        color: "#f3f7ff"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#98a8c7" }}>
            Debug Overlay
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Episode {episodeId}</div>
          <div style={{ fontSize: 13, color: "#d5def0" }}>
            Active shot: {activeSequence ? `${activeSequence.shotId} / ${activeSequence.setId}` : "n/a"}
          </div>
          {activeSequence ? (
            <div style={{ fontSize: 12, color: "#9eb2d0", lineHeight: 1.35 }}>
              {humanizeDebugToken(activeSequence.shotGrammar)} / {humanizeDebugToken(activeSequence.educationalIntent)} / {humanizeDebugToken(activeSequence.routeReason)} / {humanizeDebugToken(activeSequence.insertNeed)}
            </div>
          ) : null}
          {activeSequence && activeFinish ? (
            <div style={{ fontSize: 12, color: "#9eb2d0", lineHeight: 1.35 }}>
              {activeSequence.characterPackId} / {humanizeDebugToken(activeFinish.tone)} / {humanizeDebugToken(activeFinish.textureMatch)}
            </div>
          ) : null}
          {activeSequence?.profileBundle ? (
            <div style={{ fontSize: 12, color: "#8ea7d6", lineHeight: 1.35 }}>
              {activeSequence.profileBundle.resolverId} / {activeSequence.profileBundle.channelProfileId} / {activeSequence.profileBundle.mascotProfileId} / {humanizeDebugToken(activeSequence.profileBundle.layoutBias)} / {humanizeDebugToken(activeSequence.profileBundle.actingBias)}
            </div>
          ) : null}
          {overlay.profileResolver ? (
            <div style={{ fontSize: 12, color: "#7f98c8", lineHeight: 1.35 }}>
              resolver {overlay.profileResolver.resolverSources.join(", ")} / {overlay.profileResolver.resolverIds.join(", ")}
            </div>
          ) : null}
          {overlay.profileResolver?.resolverModulePaths.length ? (
            <div style={{ fontSize: 12, color: "#6f89bb", lineHeight: 1.35 }}>
              module {overlay.profileResolver.resolverModulePaths.map((modulePath) => formatResolverModulePath(modulePath)).join(", ")}
            </div>
          ) : null}
        </div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: `1px solid ${qcColors.border}`,
            background: qcColors.background,
            color: qcColors.color,
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase"
          }}
        >
          QC {statusLabel(overlay.qc.status)}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 6,
          padding: "10px 12px",
          borderRadius: 12,
          background: "rgba(255, 255, 255, 0.04)"
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, color: "#dbe6fb" }}>
          <span>errors {overlay.qc.errorCount}</span>
          <span>warnings {overlay.qc.warningCount}</span>
          <span>fallback {fallbackSummary}</span>
        </div>
        <div style={{ fontSize: 12, color: "#96a7c4" }}>
          Source: {overlay.sourceLabel ?? "render-orchestrator"}
        </div>
        {overlay.profileResolver ? (
          <div style={{ fontSize: 12, color: "#96a7c4", lineHeight: 1.35 }}>
            profiles: {overlay.profileResolver.channelProfileIds.join(", ")} / {overlay.profileResolver.mascotProfileIds.join(", ")}
          </div>
        ) : null}
        {overlay.qc.finalIssues.length > 0 ? (
          <div style={{ display: "grid", gap: 4 }}>
            {overlay.qc.finalIssues.slice(0, 2).map((issue) => (
              <div
                key={`${issue.code}:${issue.shotId ?? "global"}`}
                style={{
                  fontSize: 13,
                  color: issue.severity === "ERROR" ? "#ffd8d8" : "#ffefc7"
                }}
              >
                {issue.code}
                {issue.shotId ? ` @ ${issue.shotId}` : ""}: {issue.message}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#d9ffe3" }}>No final QC issues.</div>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#98a8c7" }}>
          Benchmarks
        </div>
        {overlay.benchmarks.length > 0 ? (
          overlay.benchmarks.slice(0, 2).map((benchmark, index) => {
            const colors = statusChipColors(benchmark.status);
            return (
              <div
                key={`${benchmark.scope}:${benchmark.target ?? index}`}
                style={{
                  display: "grid",
                  gap: 5,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(255, 255, 255, 0.04)"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    {benchmark.scope}
                    {benchmark.target ? ` / ${benchmark.target}` : ""}
                  </div>
                  <div
                    style={{
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: `1px solid ${colors.border}`,
                      background: colors.background,
                      color: colors.color,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase"
                    }}
                  >
                    {statusLabel(benchmark.status)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, color: "#dbe6fb" }}>
                  <span>score {formatScore(benchmark.score)}</span>
                  <span>verdict {benchmark.verdict ?? "-"}</span>
                  <span>source {benchmark.sourceLabel ?? "-"}</span>
                </div>
                <div style={{ fontSize: 13, color: "#d5def0", lineHeight: 1.4 }}>
                  {benchmark.reason ?? "no benchmark note"}
                </div>
                <div style={{ fontSize: 12, color: "#96a7c4" }}>
                  generated {formatDebugTimestamp(benchmark.generatedAt)}
                </div>
              </div>
            );
          })
        ) : (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(255, 255, 255, 0.04)",
              fontSize: 13,
              color: "#d5def0"
            }}
          >
            No benchmark signals attached.
          </div>
        )}
      </div>
    </div>
  );
};

type ShotLayerProps = {
  sequence: ShotRenderSequence;
  freezeCharacterPose: boolean;
  frameOffset?: number;
};

const ShotLayer = ({ sequence, freezeCharacterPose, frameOffset = 0 }: ShotLayerProps) => {
  const localFrame = useCurrentFrame() + frameOffset;
  const { fps } = useVideoConfig();
  const animationFrame = resolveTimeRemappedFrame(sequence, localFrame);
  const emphasisAtFrame = resolveEmphasisAtFrame(sequence);
  const punchlineFrame = resolvePunchlineFrame(sequence);
  const primaryVisualKind = resolvePrimaryVisualKindLocal(sequence);
  const renderChartView = sequence.hasChart && sequence.visualMode === "chart";
  const renderTableView = sequence.hasChart && sequence.visualMode === "table";
  const renderExplainerView = !sequence.hasChart && Boolean(primaryVisualKind);

  const visualBox = resolveVisualBox(sequence);
  const narrationBox = resolveNarrationBox(sequence);
  const bars = computeBarGeometry(sequence.chartData ?? [], visualBox);
  const rowCount = bars.length;

  const latestActionTrack = findLatestEntry(sequence.characterTracks?.actionTrack, animationFrame);
  const latestExpressionTrack = findLatestEntry(sequence.characterTracks?.expressionTrack, animationFrame);
  const latestLookTrack = findLatestEntry(sequence.characterTracks?.lookTrack, animationFrame);
  const latestPointTrack = findLatestEntry(sequence.characterTracks?.pointTrack, animationFrame);
  const pointTrackIndex = resolveTargetIndex(latestPointTrack?.targetId, rowCount, sequence.pointerTargetIndex);

  const activeHighlightEntries = (sequence.chartHighlights ?? [])
    .filter((highlight) => animationFrame >= highlight.f && animationFrame <= highlight.f + 24)
    .slice(0, 2);

  const highlightIndices = activeHighlightEntries.map((highlight) =>
    resolveTargetIndex(highlight.targetId, rowCount, pointTrackIndex)
  );

  const effectivePointerIndex =
    highlightIndices.length > 0 ? highlightIndices[highlightIndices.length - 1] : pointTrackIndex;

  const targetBar = bars[clamp(effectivePointerIndex, 0, Math.max(0, bars.length - 1))];
  const pointerReachableZone = sequence.pointerReachableZone;
  const pointerTarget = targetBar?.anchor ?? {
    x: pointerReachableZone
      ? pointerReachableZone.x + pointerReachableZone.width * 0.5
      : visualBox.x + visualBox.width * 0.65,
    y: pointerReachableZone
      ? pointerReachableZone.y + pointerReachableZone.height * 0.5
      : visualBox.y + visualBox.height * 0.45
  };

  const trackedPosition = resolveCharacterPosition(sequence, animationFrame, fps);
  const performanceOffset = resolvePerformanceOffset(
    latestActionTrack?.clip,
    latestExpressionTrack?.expression,
    animationFrame,
    sequence.profileBundle
  );
  const characterX = trackedPosition.x * FRAME_WIDTH + performanceOffset.x;
  const characterY = trackedPosition.y * FRAME_HEIGHT + performanceOffset.y;

  const shouldFreeze = freezeCharacterPose || sequence.freezePose;
  const usePointer =
    !shouldFreeze &&
    sequence.pointerEnabled &&
    (renderChartView || renderExplainerView) &&
    (Boolean(latestPointTrack) || renderChartView || renderExplainerView);
  const lookTarget = resolveLookTarget(
    latestLookTrack?.target,
    pointerTarget,
    visualBox,
    narrationBox,
    pointerReachableZone,
    sequence.profileBundle
  );

  const useYawBlend = hasCharacterYawPlan(sequence);
  const characterYaw = useYawBlend ? resolveCharacterYaw(sequence, animationFrame, fps) : 0;
  const rigTalkText = resolveTalkText(sequence);
  const activeExpression = latestExpressionTrack?.expression;
  const rigSeed = `shot-episode:${sequence.shotId}:${activeExpression ?? "default"}`;
  const finishProfile = resolveFinishProfileLocal(sequence);
  const sceneFinishFilter = buildSceneFinishFilter(finishProfile);
  const finishScanlineOpacity =
    finishProfile.textureMatch === "deterministic_clean"
      ? 0.07
      : finishProfile.textureMatch === "sidecar_matched"
        ? 0.04
        : 0.05;

  const pose = shouldFreeze
    ? move(characterX, characterY)
    : usePointer
      ? pointAt(pointerTarget, lookAt(pointerTarget, move(characterX, characterY)))
      : lookAt(lookTarget, move(characterX, characterY));

  const cameraPoseBase = resolveCameraPose(sequence, animationFrame, fps);
  const macroCutawayEnabled =
    (sequence.macroCutaway ?? (sequence.hasChart && sequence.visualMode === "chart")) &&
    sequence.hasChart &&
    sequence.visualMode === "chart";
  const macroCutawayWeight = macroCutawayEnabled ? resolveMacroCutawayWeight(localFrame, emphasisAtFrame) : 0;
  const macroTargetPose: CameraPose = {
    x: clamp(pointerTarget.x / FRAME_WIDTH, 0, 1),
    y: clamp((pointerTarget.y - 38) / FRAME_HEIGHT, 0, 1),
    zoom: Math.max(cameraPoseBase.zoom, 1.26),
    rotateDeg: cameraPoseBase.rotateDeg
  };
  const cameraPose: CameraPose =
    macroCutawayWeight > 0
      ? {
          x: lerp(cameraPoseBase.x, macroTargetPose.x, macroCutawayWeight),
          y: lerp(cameraPoseBase.y, macroTargetPose.y, macroCutawayWeight),
          zoom: lerp(cameraPoseBase.zoom, macroTargetPose.zoom, macroCutawayWeight),
          rotateDeg: lerp(cameraPoseBase.rotateDeg, macroTargetPose.rotateDeg, macroCutawayWeight)
        }
      : cameraPoseBase;
  const pan = {
    x: (0.5 - cameraPose.x) * FRAME_WIDTH,
    y: (0.5 - cameraPose.y) * FRAME_HEIGHT
  };

  const rigPreset = resolveCameraRigPreset(sequence.cameraPreset);
  const presetProgress =
    rigPreset === "whip-pan-left" || rigPreset === "whip-pan-right"
      ? clamp(animationFrame / Math.max(1, Math.min(16, Math.floor(sequence.duration * 0.3))), 0, 1)
      : 0;

  const emphasisShakeEnvelope = clamp(1 - Math.abs(localFrame - emphasisAtFrame) / 18, 0, 1);
  const baseShakeIntensity = rigPreset === "shake" ? 4 : 0;
  const shakeIntensity = baseShakeIntensity + emphasisShakeEnvelope * 1.2;
  const shakeConfig =
    shakeIntensity > 0.01
      ? {
          intensity: shakeIntensity,
          speed: rigPreset === "shake" ? 1.05 : 1.2,
          rotationIntensityDeg: (rigPreset === "shake" ? 0.6 : 0.18) + emphasisShakeEnvelope * 0.16
        }
      : undefined;

  const punchlineEnvelope = clamp(1 - Math.abs(localFrame - punchlineFrame) / 12, 0, 1);
  const narrationScale = 1 + punchlineEnvelope * 0.045;
  const narrationGlow = punchlineEnvelope * 0.35;

  const fadeEdgeFrames = Math.min(8, Math.max(2, Math.floor(sequence.duration * 0.15)));
  const fadeInOpacity = 1 - clamp(localFrame / fadeEdgeFrames, 0, 1);
  const fadeOutOpacity = 1 - clamp((sequence.duration - 1 - localFrame) / fadeEdgeFrames, 0, 1);
  const transitionShadeOpacity = Math.max(fadeInOpacity, fadeOutOpacity) * 0.35;

  const resolvedTransition = resolveTransitionType(sequence);
  const flashAtStart = resolvedTransition === "flashCut";
  const flashAtEnd = resolvedTransition === "flashCut";
  const endFlashStart = Math.max(0, sequence.duration - 5);

  return (
    <AbsoluteFill
      style={{
        background: backgroundForShot(sequence.shotId, sequence.setId),
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
      }}
    >
      <CameraRig
        pan={pan}
        zoom={cameraPose.zoom}
        rotateDeg={cameraPose.rotateDeg}
        shake={shakeConfig}
        preset={rigPreset}
        presetProgress={presetProgress}
      >
        <AbsoluteFill style={{ filter: sceneFinishFilter }}>
          <div
            style={{
              position: "absolute",
              left: 72,
              top: 62,
              padding: "12px 16px",
              borderRadius: 12,
              background: "rgba(12, 19, 34, 0.65)",
              color: "#e6efff",
              border: "1px solid rgba(255, 255, 255, 0.22)",
              fontSize: 24,
              fontWeight: 600
            }}
          >
            {sequence.shotId} | {sequence.setId} | {sequence.cameraPreset} | {sequence.visualMode} | {resolvePrimaryVisualKindLabel(sequence)} | {humanizeDebugToken(sequence.shotGrammar)} | {sequence.mascotId ?? "unknown_mascot"} | {humanizeDebugToken(finishProfile.tone)}
            {sequence.profileBundle
              ? ` | ${sequence.profileBundle.resolverSource} | ${humanizeDebugToken(sequence.profileBundle.layoutBias)} | ${humanizeDebugToken(sequence.profileBundle.pointerBias)}`
              : ""}
          </div>

          {renderChartView ? (
            <ChartView
              sequence={sequence}
              pointerIndex={effectivePointerIndex}
              highlightIndices={highlightIndices}
              localFrame={animationFrame}
              fps={fps}
              emphasisAtFrame={emphasisAtFrame}
            />
          ) : null}

          {renderTableView ? <TableView sequence={sequence} /> : null}

          {renderExplainerView ? (
            <ExplainerVisualView
              sequence={sequence}
              localFrame={animationFrame}
              fps={fps}
              emphasisAtFrame={emphasisAtFrame}
            />
          ) : null}

          {macroCutawayWeight > 0.01 && targetBar ? (
            <div
              style={{
                position: "absolute",
                left: targetBar.x - 18,
                top: targetBar.y - 18,
                width: targetBar.width + 36,
                height: targetBar.height + 36,
                borderRadius: 16,
                border: `2px solid rgba(255, 242, 122, ${0.35 + macroCutawayWeight * 0.45})`,
                boxShadow: "0 0 20px rgba(255, 242, 122, 0.45)",
                opacity: macroCutawayWeight,
                transform: `scale(${1 + macroCutawayWeight * 0.06})`,
                transformOrigin: "50% 50%"
              }}
            />
          ) : null}

          <div
            style={{
              position: "absolute",
              left: narrationBox.x,
              top: narrationBox.y,
              width: narrationBox.width,
              borderRadius: 16,
              border: "2px solid rgba(255, 255, 255, 0.2)",
              background: "rgba(9, 14, 24, 0.72)",
              color: "#f6fbff",
              fontSize: 32,
              fontWeight: 500,
              lineHeight: 1.3,
              padding: "20px 24px",
              transform: `scale(${narrationScale})`,
              transformOrigin: "50% 50%",
              boxShadow: `0 0 0 1px rgba(255, 255, 255, 0.04), 0 0 ${Math.round(
                24 * narrationGlow
              )}px rgba(255, 222, 140, 0.35)`
            }}
          >
            {cleanMarkers(sequence.narration)}
          </div>

          <MascotRenderer
            mascotId={sequence.mascotId}
            characterPackId={sequence.characterPackId}
            pose={pose}
            targetPoint={usePointer ? pointerTarget : undefined}
            expression={activeExpression}
            yaw={characterYaw}
            useYawBlend={useYawBlend}
            animationMode="alive"
            seed={rigSeed}
            talkText={rigTalkText}
          />

          {activeHighlightEntries.map((highlight, index) => {
            const barIndex = resolveTargetIndex(highlight.targetId, rowCount, effectivePointerIndex);
            const bar = bars[barIndex];
            if (!bar) {
              return null;
            }

            const color = styleTokenToColor(highlight.styleToken);
            const rect = {
              x: bar.x - 14,
              y: bar.y - 14,
              width: bar.width + 28,
              height: bar.height + 28
            };

            return (
              <div key={`highlight-${highlight.targetId}-${highlight.f}-${index}`}>
                <div
                  style={{
                    position: "absolute",
                    left: rect.x - 8,
                    top: rect.y - 8,
                    width: rect.width + 16,
                    height: rect.height + 16,
                    borderRadius: 14,
                    boxShadow: `0 0 0 2px ${color}, 0 0 22px ${color}`,
                    opacity: 0.36
                  }}
                />
                <ScribbleHighlight
                  width={FRAME_WIDTH}
                  height={FRAME_HEIGHT}
                  rect={rect}
                  startFrame={highlight.f}
                  durationInFrames={18}
                  color={color}
                  strokeWidth={6}
                />
              </div>
            );
          })}

          {sequence.expectOcclusion ? (
            <div
              style={{
                position: "absolute",
                left: OCCLUDER_BOX.x,
                top: OCCLUDER_BOX.y,
                width: OCCLUDER_BOX.width,
                height: OCCLUDER_BOX.height,
                background: "linear-gradient(180deg, #412e22 0%, #2b1f17 100%)",
                boxShadow: "8px 0 18px rgba(0, 0, 0, 0.3)"
              }}
            />
          ) : null}

          {flashAtStart ? <FlashCut startFrame={0} durationInFrames={4} maxOpacity={0.5} /> : null}
          {flashAtEnd ? <FlashCut startFrame={endFlashStart} durationInFrames={4} maxOpacity={0.45} /> : null}

          {transitionShadeOpacity > 0 ? (
            <AbsoluteFill
              style={{
                backgroundColor: "rgba(0, 0, 0, 1)",
                opacity: transitionShadeOpacity,
                pointerEvents: "none"
              }}
            />
          ) : null}
        </AbsoluteFill>
      </CameraRig>
      <ScreenFx
        bloomOpacity={finishProfile.bloomOpacity}
        grainOpacity={finishProfile.grainOpacity}
        scanlineOpacity={finishScanlineOpacity}
        vignetteOpacity={finishProfile.vignetteOpacity}
        tintOpacity={finishProfile.tintOpacity}
        tintGradient={finishProfile.tintGradient}
      />
    </AbsoluteFill>
  );
};

export const ShotEpisodeComposition = ({
  episodeId,
  safeArea,
  freezeCharacterPose,
  sequences,
  subtitles,
  debugOverlay
}: ShotEpisodeRenderProps) => {
  const frame = useCurrentFrame();
  const activeSubtitle = subtitles.find((cue) => frame >= cue.startFrame && frame <= cue.endFrame);
  const activeSequence =
    sequences.find((sequence) => frame >= sequence.from && frame < sequence.from + sequence.duration) ??
    sequences[sequences.length - 1];
  const overlapFrames = TRANSITION_OVERLAP_FRAMES;
  const regularTracks = sequences.map((sequence, index) => {
    const hasNext = index < sequences.length - 1;
    const trimmed = hasNext ? Math.min(overlapFrames, Math.max(0, sequence.duration - 1)) : 0;
    return {
      sequence,
      duration: Math.max(1, sequence.duration - trimmed)
    };
  });

  return (
    <AbsoluteFill
      style={{
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        background: "#0f1526"
      }}
    >
      {regularTracks.map(({ sequence, duration }) => (
        <Sequence key={`base-${sequence.shotId}`} from={sequence.from} durationInFrames={duration}>
          <ShotLayer sequence={sequence} freezeCharacterPose={freezeCharacterPose} />
        </Sequence>
      ))}

      {sequences.slice(0, -1).map((sequence, index) => {
        const next = sequences[index + 1];
        const transitionFrames = Math.min(
          overlapFrames,
          Math.max(1, sequence.duration),
          Math.max(1, next.duration)
        );
        const transitionFrom = Math.max(0, next.from - transitionFrames);
        const transitionType = resolveTransitionType(next);

        return (
          <Sequence
            key={`transition-${sequence.shotId}-${next.shotId}`}
            from={transitionFrom}
            durationInFrames={transitionFrames}
          >
            <ShotTransition
              fromFrame={0}
              durationFrames={transitionFrames}
              type={transitionType}
              prev={
                <ShotLayer
                  sequence={sequence}
                  freezeCharacterPose={freezeCharacterPose}
                  frameOffset={Math.max(0, sequence.duration - transitionFrames)}
                />
              }
              next={<ShotLayer sequence={next} freezeCharacterPose={freezeCharacterPose} frameOffset={0} />}
              direction={next.cameraPreset.toLowerCase().includes("left") ? "left" : "right"}
            />
          </Sequence>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: safeArea.left,
          top: safeArea.top,
          right: safeArea.right,
          bottom: safeArea.bottom,
          border: "2px dashed rgba(255, 255, 255, 0.25)",
          borderRadius: 12,
          pointerEvents: "none"
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 52,
          textAlign: "center",
          color: "#f9fcff",
          fontSize: 42,
          fontWeight: 700,
          textShadow: "0 4px 12px rgba(0, 0, 0, 0.75)"
        }}
      >
        {activeSubtitle ? cleanMarkers(activeSubtitle.text) : ""}
      </div>

      <DebugOverlay episodeId={episodeId} activeSequence={activeSequence} overlay={debugOverlay} />
    </AbsoluteFill>
  );
};


