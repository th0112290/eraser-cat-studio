import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createValidator } from "@ec/shared";
import { isChartLikeShotVisualObjectKind, normalizeShotVisualObjectKind } from "@ec/story";
import type {
  ChartDataRow,
  DeterministicProfileResolver,
  RenderLayoutBox,
  DeterministicSequence,
  DeterministicVisualObject,
  DeterministicVisualPlan,
  EpisodeRenderProps,
  OrchestrateRenderInput,
  OrchestrateRenderResult,
  RenderProfileResolverSummary,
  RenderBenchmarkSignal,
  RenderDebugOverlay,
  RenderPreset,
  RenderQcInput,
  RenderableShot,
  RenderableShotsDocument,
  VisualQcIssue,
  VisualQcReport
} from "./types";
import {
  describeDeterministicProfileResolverDiscoveryFailure,
  discoverDeterministicProfileResolverModule,
  loadDeterministicProfileResolverModule,
  resolveDeterministicProfileSeam
} from "./profileSeam";
import { buildSubtitleCues, toSrt } from "./srt";
import { runVisualQcWithFallback } from "./visualQc";

const DEFAULT_COMPOSITION_ID = "SHOT-EPISODE";
const DEFAULT_PRESET: RenderPreset = {
  width: 1920,
  height: 1080,
  fps: 30,
  videoBitrate: "8M",
  codec: "h264",
  x264Preset: "veryfast",
  safeArea: {
    top: 54,
    right: 96,
    bottom: 54,
    left: 96
  }
};

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

type MascotBlockingSpec = {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

type RenderLog = {
  schema_version: "1.0";
  status: "SUCCEEDED" | "FAILED";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  attempt: number;
  max_attempts: number;
  shots_path: string;
  output_path: string;
  srt_path: string;
  qc_report_path: string;
  props_path: string;
  composition_id: string;
  command: string[];
  preset: RenderPreset;
  sequence_count: number;
  subtitle_count: number;
  total_frames: number;
  qc_passed: boolean;
  fallback_steps_applied: string[];
  qc_error_count: number;
  qc_warning_count: number;
  profile_resolver?: RenderProfileResolverSummary;
  stdout?: string;
  stderr?: string;
  error?: {
    message: string;
    stack?: string;
  };
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath: string, value: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, "utf8");
}

function readJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function compact(parts: Array<string | undefined>, separator = " | "): string | undefined {
  const items = parts.map((part) => part?.trim() ?? "").filter((part) => part.length > 0);
  return items.length > 0 ? items.join(separator) : undefined;
}

function previewIssueList(value: unknown, limit = 2): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const entries = value
    .map((entry) => str(entry))
    .filter((entry): entry is string => Boolean(entry));
  if (entries.length === 0) {
    return undefined;
  }
  const preview = entries.slice(0, limit).map((entry) => humanizeBenchmarkReason(entry)).join(", ");
  return entries.length > limit ? `${preview} (+${entries.length - limit})` : preview;
}

function humanizeBenchmarkReason(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("score_below_min:")) {
    return trimmed.replace("score_below_min:", "score below min ");
  }
  if (trimmed.startsWith("below_min_score:")) {
    return trimmed.replace("below_min_score:", "below min score ");
  }
  if (trimmed.startsWith("verdict_blocked:")) {
    return trimmed.replace("verdict_blocked:", "verdict blocked ");
  }
  return trimmed.replaceAll("_", " ");
}

function normalizeBenchmarkStatus(value: string | undefined, ready?: boolean): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (ready === true && ["", "ready", "ok", "passed", "no_change", "completed", "recommended"].includes(normalized)) {
    return "ready";
  }
  if (normalized === "diverged" || normalized === "divergence") {
    return "divergence";
  }
  if (normalized.includes("below_min_score") || normalized.includes("score_below_min")) {
    return "below_min_score";
  }
  if (["ready", "ok", "passed", "no_change", "completed", "up"].includes(normalized)) {
    return "ready";
  }
  if (["blocked", "failed", "reject", "rejected", "error", "down"].includes(normalized)) {
    return "blocked";
  }
  if (["warn", "warning", "stale", "missing"].includes(normalized)) {
    return "warn";
  }
  if (!normalized && ready === false) {
    return "blocked";
  }
  return normalized || "unknown";
}

function limitLogText(value: string, maxChars: number = 12000): string | undefined {
  if (value.length === 0) {
    return undefined;
  }
  if (value.length <= maxChars) {
    return value;
  }
  const half = Math.floor(maxChars / 2);
  const head = value.slice(0, half);
  const tail = value.slice(-half);
  return `${head}\n...[truncated ${value.length - maxChars} chars]...\n${tail}`;
}

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function candidateBenchmarkRoots(repoRoot: string): Array<{ label: string; outRoot: string }> {
  const roots = [
    { label: "local out", outRoot: path.join(repoRoot, "out") },
    { label: "sidecar worktree", outRoot: path.resolve(repoRoot, "../ecs-sidecar-rollout/out") },
    { label: "main repo", outRoot: path.resolve(repoRoot, "../eraser-cat-studio/out") }
  ];
  const seen = new Set<string>();
  return roots.filter((entry) => {
    const key = path.resolve(entry.outRoot).toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readPresetRolloutSignal(sourceLabel: string, outRoot: string): RenderBenchmarkSignal | null {
  const reportPath = path.join(
    outRoot,
    "preset_benchmarks",
    "video_i2v",
    "runtime_sidecar_preset_rollout.validation_report.json"
  );
  const doc = readJson(reportPath);
  if (!isRecord(doc)) {
    return null;
  }
  const inspection = isRecord(doc.inspection) ? doc.inspection : {};
  const candidate = isRecord(inspection.candidate) ? inspection.candidate : {};
  return {
    scope: "preset rollout",
    target: str(inspection.resolvedTarget) ?? str(doc.default_target),
    status: normalizeBenchmarkStatus(str(inspection.status) ?? str(doc.status), doc.ready === true),
    score: num(candidate.score),
    verdict: str(candidate.verdict),
    reason: compact([
      str(candidate.scenario),
      str(inspection.reason) ?? str(doc.reason),
      previewIssueList(doc.issues)
    ]),
    sourceLabel,
    generatedAt: str(doc.generated_at) ?? str(doc.benchmark_generated_at),
    artifactPath: reportPath
  };
}

function readCrossChannelSignal(sourceLabel: string, outRoot: string): RenderBenchmarkSignal | null {
  const alertPath = path.join(
    outRoot,
    "multi_channel_benchmarks",
    "video_i2v",
    "multi_channel_benchmark_alert.json"
  );
  const alertDoc = readJson(alertPath);
  if (isRecord(alertDoc)) {
    return {
      scope: "multi-channel",
      target: str(alertDoc.divergence_level) ? `cross-channel (${str(alertDoc.divergence_level)})` : "cross-channel",
      status: normalizeBenchmarkStatus(str(alertDoc.status), alertDoc.ready === true),
      score: num(alertDoc.score_gap),
      verdict: str(alertDoc.severity),
      reason: compact([str(alertDoc.recommendation), str(alertDoc.message)]),
      sourceLabel,
      generatedAt: str(alertDoc.generated_at),
      artifactPath: alertPath
    };
  }

  const validationPath = path.join(
    outRoot,
    "multi_channel_benchmarks",
    "video_i2v",
    "multi_channel_benchmark_validation.json"
  );
  const validationDoc = readJson(validationPath);
  if (!isRecord(validationDoc)) {
    return null;
  }
  const crossChannel = isRecord(validationDoc.cross_channel) ? validationDoc.cross_channel : {};
  if (Object.keys(crossChannel).length === 0) {
    return null;
  }
  return {
    scope: "multi-channel",
    target: str(crossChannel.divergence_level) ? `cross-channel (${str(crossChannel.divergence_level)})` : "cross-channel",
    status: normalizeBenchmarkStatus(str(crossChannel.status), validationDoc.ready === true),
    score: num(crossChannel.score_gap),
    verdict: undefined,
    reason: compact([previewIssueList(crossChannel.differing_axes), str(crossChannel.recommendation)]),
    sourceLabel,
    generatedAt: str(validationDoc.generated_at),
    artifactPath: validationPath
  };
}

function discoverBenchmarkSignals(repoRoot: string): RenderBenchmarkSignal[] {
  for (const source of candidateBenchmarkRoots(repoRoot)) {
    if (!fs.existsSync(source.outRoot)) {
      continue;
    }
    const signals = [readPresetRolloutSignal(source.label, source.outRoot), readCrossChannelSignal(source.label, source.outRoot)]
      .filter((entry): entry is RenderBenchmarkSignal => Boolean(entry));
    if (signals.length > 0) {
      return signals;
    }
  }
  return [];
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function summarizeProfileResolvers(sequences: DeterministicSequence[], resolverModulePath?: string) {
  const bundles = sequences
    .map((sequence) => sequence.profileBundle)
    .filter((bundle): bundle is NonNullable<DeterministicSequence["profileBundle"]> => Boolean(bundle));
  if (bundles.length === 0) {
    return undefined;
  }
  return {
    resolverIds: uniqueNonEmpty(bundles.map((bundle) => bundle.resolverId)),
    resolverSources: Array.from(new Set(bundles.map((bundle) => bundle.resolverSource))),
    resolverModulePaths: resolverModulePath ? [resolverModulePath] : [],
    studioProfileIds: uniqueNonEmpty(bundles.map((bundle) => bundle.studioProfileId)),
    channelProfileIds: uniqueNonEmpty(bundles.map((bundle) => bundle.channelProfileId)),
    mascotProfileIds: uniqueNonEmpty(bundles.map((bundle) => bundle.mascotProfileId))
  };
}

function buildDebugOverlay(
  input: OrchestrateRenderInput,
  repoRoot: string,
  sequences: DeterministicSequence[],
  resolverModulePath: string | undefined,
  counts: { errors: number; warnings: number },
  fallbackStepsApplied: string[],
  finalIssues: VisualQcIssue[]
): RenderDebugOverlay {
  const enabled = input.debugOverlay?.enabled ?? process.env.RENDER_DEBUG_OVERLAY === "1";
  const status = counts.errors > 0 ? "failed" : counts.warnings > 0 ? "warn" : "passed";
  const benchmarks = input.debugOverlay?.benchmarks?.length
    ? input.debugOverlay.benchmarks
    : discoverBenchmarkSignals(repoRoot);
  return {
    enabled,
    sourceLabel: input.debugOverlay?.sourceLabel ?? "render-orchestrator",
    qc: {
      status,
      errorCount: counts.errors,
      warningCount: counts.warnings,
      fallbackStepsApplied,
      finalIssues: finalIssues.slice(0, 3).map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        ...(issue.shotId ? { shotId: issue.shotId } : {})
      }))
    },
    profileResolver: summarizeProfileResolvers(sequences, resolverModulePath),
    benchmarks
  };
}

function coerceStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter((entry) => entry.length > 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function fallbackNarration(shot: RenderableShot, index: number): string {
  if (typeof shot.narration === "string" && shot.narration.trim().length > 0) {
    return shot.narration.trim();
  }

  const calloutText = shot.chart?.callouts?.find((callout) => callout.text.trim().length > 0)?.text;
  if (calloutText) {
    return calloutText;
  }

  const beatLabel = shot.beat_ids.slice(0, 3).join(", ");
  if (beatLabel) {
    return `Narration for ${beatLabel}`;
  }

  return `Narration for shot ${index + 1}`;
}

function toSafeAreaPixels(doc: RenderableShotsDocument, preset: RenderPreset) {
  const normalized = doc.render.safe_area;
  const left = Math.round(normalized.x * preset.width);
  const top = Math.round(normalized.y * preset.height);
  const right = Math.round((1 - (normalized.x + normalized.w)) * preset.width);
  const bottom = Math.round((1 - (normalized.y + normalized.h)) * preset.height);

  return {
    top: Math.max(0, top),
    right: Math.max(0, right),
    bottom: Math.max(0, bottom),
    left: Math.max(0, left)
  };
}

function withBoxOffset(
  box: RenderLayoutBox,
  patch: Partial<RenderLayoutBox>
): RenderLayoutBox {
  return {
    x: patch.x ?? box.x,
    y: patch.y ?? box.y,
    width: patch.width ?? box.width,
    height: patch.height ?? box.height
  };
}

function resolveMascotBlockingSpec(shot: RenderableShot): MascotBlockingSpec {
  if (shot.shot_grammar === "host_intro") {
    return { offsetX: -248, offsetY: -304, width: 330, height: 640 };
  }
  if (shot.shot_grammar === "comparison_explainer" || shot.insert_need === "comparison_support") {
    return { offsetX: -268, offsetY: -292, width: 320, height: 584 };
  }
  if (shot.shot_grammar === "process_walkthrough" || shot.insert_need === "process_support") {
    return { offsetX: -262, offsetY: -286, width: 308, height: 572 };
  }
  if (shot.shot_grammar === "timeline_bridge" || shot.insert_need === "timeline_support") {
    return { offsetX: -266, offsetY: -288, width: 314, height: 578 };
  }
  if (shot.shot_grammar === "diagram_explainer" || shot.insert_need === "diagram_support") {
    return { offsetX: -252, offsetY: -280, width: 300, height: 560 };
  }
  if (shot.shot_grammar === "checklist_recap" || shot.insert_need === "checklist_support") {
    return { offsetX: -270, offsetY: -292, width: 326, height: 590 };
  }
  if (shot.shot_grammar === "summary_recap" || shot.insert_need === "summary_support") {
    return { offsetX: -280, offsetY: -296, width: 334, height: 604 };
  }
  return { offsetX: -272, offsetY: -292, width: 322, height: 592 };
}

function resolveMascotBlockingBox(
  shot: RenderableShot,
  frameWidth: number,
  frameHeight: number
): RenderLayoutBox {
  const spec = resolveMascotBlockingSpec(shot);
  const centerX = clamp(shot.character.transform.x, 0, 1) * frameWidth;
  const centerY = clamp(shot.character.transform.y, 0, 1) * frameHeight;
  const scale = clamp(shot.character.transform.scale, 0.86, 1.14);
  const facingBiasX = shot.character.transform.flip_x ? -12 : -28;
  return {
    x: centerX + spec.offsetX * scale + facingBiasX,
    y: centerY + spec.offsetY * scale,
    width: spec.width * scale,
    height: spec.height * scale
  };
}

function resolvePointerReachableZone(
  shot: RenderableShot,
  visualBox: RenderLayoutBox
): RenderLayoutBox | undefined {
  if (!shot.chart) {
    return undefined;
  }

  let left = 56;
  let right = 56;
  let top = 86;
  let bottom = 116;

  if (shot.shot_grammar === "comparison_explainer" || shot.insert_need === "comparison_support") {
    left = 82;
    right = 82;
    top = 92;
    bottom = 114;
  } else if (shot.shot_grammar === "process_walkthrough" || shot.insert_need === "process_support") {
    left = 88;
    right = 84;
    top = 96;
    bottom = 116;
  } else if (shot.shot_grammar === "timeline_bridge" || shot.insert_need === "timeline_support") {
    left = 76;
    right = 76;
    top = 94;
    bottom = 120;
  } else if (shot.shot_grammar === "summary_recap" || shot.insert_need === "summary_support") {
    left = 62;
    right = 62;
    top = 88;
    bottom = 124;
  }

  return {
    x: visualBox.x + left,
    y: visualBox.y + top,
    width: Math.max(40, visualBox.width - left - right),
    height: Math.max(40, visualBox.height - top - bottom)
  };
}

function resolveSequenceLayout(
  shot: RenderableShot,
  primaryVisualKind: DeterministicSequence["primaryVisualKind"]
): { visualBox: RenderLayoutBox; narrationBox: RenderLayoutBox } {
  let visualBox: RenderLayoutBox = { ...CHART_BOX };
  let narrationBox: RenderLayoutBox = { ...NARRATION_BOX };

  if (
    shot.shot_grammar === "comparison_explainer" ||
    shot.insert_need === "comparison_support"
  ) {
    visualBox = withBoxOffset(visualBox, { x: 980, y: 152, width: 812, height: 536 });
    narrationBox = withBoxOffset(narrationBox, { y: 744, width: 812 });
  } else if (
    shot.shot_grammar === "process_walkthrough" ||
    shot.insert_need === "process_support"
  ) {
    visualBox = withBoxOffset(visualBox, { x: 998, y: 156, width: 794, height: 532 });
    narrationBox = withBoxOffset(narrationBox, { y: 742, width: 836, height: 182 });
  } else if (
    shot.shot_grammar === "timeline_bridge" ||
    shot.insert_need === "timeline_support"
  ) {
    visualBox = withBoxOffset(visualBox, { x: 992, y: 150, width: 800, height: 540 });
    narrationBox = withBoxOffset(narrationBox, { y: 740, width: 848, height: 184 });
  } else if (
    shot.shot_grammar === "diagram_explainer" ||
    primaryVisualKind === "labeled_diagram" ||
    shot.insert_need === "diagram_support"
  ) {
    visualBox = withBoxOffset(visualBox, { x: 960, y: 146, width: 840, height: 548 });
    narrationBox = withBoxOffset(narrationBox, { width: 804, height: 182 });
  } else if (
    shot.shot_grammar === "checklist_recap" ||
    shot.insert_need === "checklist_support"
  ) {
    visualBox = withBoxOffset(visualBox, { x: 1010, y: 164, width: 780, height: 520 });
    narrationBox = withBoxOffset(narrationBox, { y: 740, width: 860, height: 184 });
  } else if (
    shot.shot_grammar === "summary_recap" ||
    primaryVisualKind === "summary_card" ||
    primaryVisualKind === "kpi_card" ||
    shot.insert_need === "summary_support"
  ) {
    visualBox = withBoxOffset(visualBox, { x: 1016, y: 170, width: 774, height: 500 });
    narrationBox = withBoxOffset(narrationBox, { y: 738, width: 876, height: 188 });
  }

  return { visualBox, narrationBox };
}

function computeChartAnchor(
  rows: ChartDataRow[],
  targetIndex: number,
  visualBox: RenderLayoutBox
): { x: number; y: number } {
  const count = Math.max(1, rows.length);
  const clampedIndex = clamp(targetIndex, 0, Math.max(0, count - 1));
  const left = visualBox.x + 56;
  const top = visualBox.y + 86;
  const plotWidth = visualBox.width - 112;
  const plotHeight = visualBox.height - 156;
  const gap = 20;
  const barWidth = (plotWidth - gap * (count - 1)) / count;
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  const value = rows[clampedIndex]?.value ?? 0;
  const normalized = clamp(value / maxValue, 0, 1);
  const barHeight = Math.max(6, plotHeight * normalized);
  return {
    x: left + clampedIndex * (barWidth + gap) + barWidth * 0.5,
    y: top + plotHeight - barHeight
  };
}

function defaultChartRows(seedSource: string): ChartDataRow[] {
  const seed = hashSeed(seedSource);
  const a = 58 + (seed % 31);
  const b = 64 + ((seed >>> 3) % 27);
  const c = 70 + ((seed >>> 6) % 23);
  const d = 52 + ((seed >>> 9) % 21);
  return [
    { label: "A", value: a, unit: "pts" },
    { label: "B", value: b, unit: "pts" },
    { label: "C", value: c, unit: "pts" },
    { label: "D", value: d, unit: "pts" }
  ];
}

function buildChartRowsForShot(shot: RenderableShot, qcInput?: RenderQcInput): ChartDataRow[] {
  if (!shot.chart) {
    return [];
  }

  const datasetRows = qcInput?.dataset?.rows;
  if (datasetRows && datasetRows.length > 0) {
    return datasetRows.map((row) => ({
      label: normalizeText(row.label),
      value: row.value,
      unit: row.unit ?? qcInput?.dataset?.unit
    }));
  }

  return defaultChartRows(shot.shot_id);
}

function resolveTargetIndexFromId(targetId: string | undefined, rowCount: number, fallbackIndex: number): number {
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

  return clamp(hashSeed(targetId) % rowCount, 0, rowCount - 1);
}

function resolveTransitionHint(shot: RenderableShot): string {
  const directTransition = (shot as RenderableShot & { transition?: unknown }).transition;
  if (typeof directTransition === "string" && directTransition.trim().length > 0) {
    return directTransition.trim();
  }

  const preset = shot.camera.preset.toLowerCase();
  if (preset.includes("fade")) {
    return "fade";
  }
  if (preset.includes("flash") || preset.includes("whip")) {
    return "flash";
  }
  return "cut";
}

function inferMascotIdFromPackId(packId: string | undefined): string | undefined {
  const normalized = (packId ?? "").trim().toLowerCase();
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.includes("med-dog") || normalized.includes("med_dog")) {
    return "med_dog";
  }
  if (normalized.includes("eraser-cat") || normalized.includes("eraser_cat")) {
    return "eraser_cat";
  }
  return "unknown";
}

function inferLegacyPrimaryVisualKind(shot: RenderableShot): DeterministicSequence["primaryVisualKind"] {
  const chartType = shot.chart?.type?.trim().toLowerCase() ?? "";
  if (chartType.includes("line") || chartType.includes("trend")) {
    return "line_chart";
  }
  if (shot.chart) {
    return "bar_chart";
  }
  return undefined;
}

function mapVisualObjects(shot: RenderableShot): DeterministicVisualObject[] | undefined {
  if (!Array.isArray(shot.visual_objects) || shot.visual_objects.length === 0) {
    return undefined;
  }

  const mapped: DeterministicVisualObject[] = [];
  for (const visualObject of shot.visual_objects) {
    const normalizedKind = normalizeShotVisualObjectKind(visualObject.kind);
    if (!normalizedKind) {
      continue;
    }
    mapped.push({
      objectId: visualObject.object_id,
      kind: normalizedKind,
      semanticRole: visualObject.semantic_role,
      title: visualObject.title,
      body: visualObject.body,
      items: Array.isArray(visualObject.items) ? [...visualObject.items] : undefined,
      dataRef: visualObject.data_ref
        ? {
            chartId: visualObject.data_ref.chart_id,
            datasetId: visualObject.data_ref.dataset_id,
            timeRange: visualObject.data_ref.time_range
          }
        : undefined,
      selectionReason: visualObject.selection_reason
    });
  }

  return mapped.length > 0 ? mapped : undefined;
}

function mapVisualPlan(shot: RenderableShot): DeterministicVisualPlan | undefined {
  if (!shot.visual_plan) {
    return undefined;
  }
  const normalizedKind = normalizeShotVisualObjectKind(shot.visual_plan.selected_primary_kind);
  if (!normalizedKind) {
    return undefined;
  }
  return {
    resolverId: shot.visual_plan.resolver_id,
    channelDomain: shot.visual_plan.channel_domain,
    educationalMode: shot.visual_plan.educational_mode,
    selectedPrimaryKind: normalizedKind,
    selectionReason: shot.visual_plan.selection_reason
  };
}

function buildDeterministicSequences(
  doc: RenderableShotsDocument,
  presetFps: number,
  qcInput?: RenderQcInput,
  profileResolver?: DeterministicProfileResolver
): DeterministicSequence[] {
  const sourceFps = doc.render.fps;
  const frameScale = sourceFps > 0 ? presetFps / sourceFps : 1;
  const frameWidth = doc.render.width > 0 ? doc.render.width : DEFAULT_PRESET.width;
  const frameHeight = doc.render.height > 0 ? doc.render.height : DEFAULT_PRESET.height;
  const sortedShots = [...doc.shots].sort((left, right) => {
    if (left.start_frame !== right.start_frame) {
      return left.start_frame - right.start_frame;
    }
    return left.shot_id.localeCompare(right.shot_id);
  });

  return sortedShots.map((shot, index) => {
    const from = Math.max(0, Math.round(shot.start_frame * frameScale));
    const duration = Math.max(1, Math.round(shot.duration_frames * frameScale));
    const emphasisWords = coerceStringList(shot.emphasisWords ?? shot.emphasis_words ?? []);
    const narration = fallbackNarration(shot, index);
    const talkText =
      typeof shot.talk_text === "string" && shot.talk_text.trim().length > 0 ? shot.talk_text.trim() : undefined;
    const chartData = buildChartRowsForShot(shot, qcInput);
    const visualObjects = mapVisualObjects(shot);
    const visualPlan = mapVisualPlan(shot);
    const primaryVisualKind =
      visualObjects?.find((visualObject) => visualObject.semanticRole === "primary_explainer")?.kind ??
      visualObjects?.[0]?.kind ??
      visualPlan?.selectedPrimaryKind ??
      inferLegacyPrimaryVisualKind(shot);
    const mascotId = inferMascotIdFromPackId(shot.character.pack_id);
    const profileInput = {
      channelDomain: visualPlan?.channelDomain,
      mascotId,
      hasChart: Boolean(shot.chart),
      primaryVisualKind,
      insertNeed: shot.insert_need
    } as const;
    const resolvedProfile = profileResolver ? profileResolver(profileInput) : resolveDeterministicProfileSeam(profileInput);
    const { profileBundle, finishProfile } = resolvedProfile;
    const { visualBox, narrationBox } = resolveSequenceLayout(shot, primaryVisualKind);
    const mascotBlockingBox = resolveMascotBlockingBox(shot, frameWidth, frameHeight);
    const pointerReachableZone = resolvePointerReachableZone(shot, visualBox);

    const highlightTargetId = shot.chart?.highlights?.[0]?.target_id;
    const pointTargetId = shot.character.tracks.point_track?.[0]?.target_id;
    const fallbackPointerIndex = Math.min(2, Math.max(0, chartData.length - 1));
    const pointerTargetIndex = resolveTargetIndexFromId(
      pointTargetId ?? highlightTargetId,
      chartData.length,
      fallbackPointerIndex
    );

    const pointerAnchor = computeChartAnchor(chartData, pointerTargetIndex, visualBox);
    const expectOcclusion =
      qcInput?.expectOcclusion ??
      (shot.character.layer === "behind_fg_mask" &&
        Boolean(shot.set.layers?.fg_mask && shot.set.layers.fg_mask.length > 0));

    return {
      shotId: shot.shot_id,
      from,
      duration,
      setId: shot.set.set_id,
      cameraPreset: shot.camera.preset,
      shotGrammar: shot.shot_grammar,
      routeReason: shot.route_reason,
      educationalIntent: shot.educational_intent,
      insertNeed: shot.insert_need,
      narration,
      emphasisWords,
      talkText,
      chartData,
      visualMode: shot.chart && (!primaryVisualKind || isChartLikeShotVisualObjectKind(primaryVisualKind)) ? "chart" : "table",
      primaryVisualKind,
      visualObjects,
      visualPlan,
      profileBundle,
      finishProfile,
      visualBox,
      narrationBox,
      mascotBlockingBox,
      pointerReachableZone,
      annotationsEnabled: true,
      pointerTargetIndex,
      pointerEnabled: Boolean(shot.character.tracks.point_track?.length),
      freezePose: false,
      expectOcclusion,
      pointerTip: shot.chart ? pointerAnchor : undefined,
      unit: qcInput?.dataset?.unit,
      hasChart: Boolean(shot.chart),
      chartCallout: shot.chart?.callouts?.[0]?.text,
      characterPackId: shot.character.pack_id,
      mascotId,
      characterX: shot.character.transform.x,
      characterY: shot.character.transform.y,
      cameraKeyframes: shot.camera.keyframes.map((keyframe) => ({
        f: Math.max(0, Math.round(keyframe.f * frameScale)),
        x: keyframe.x,
        y: keyframe.y,
        zoom: keyframe.zoom,
        rotateDeg: keyframe.rotate_deg
      })),
      chartHighlights: (shot.chart?.highlights ?? []).map((highlight) => ({
        f: Math.max(0, Math.round(highlight.f * frameScale)),
        targetId: highlight.target_id,
        styleToken: highlight.style_token
      })),
      characterTracks: {
        posPath: shot.character.tracks.pos_path.map((pathPoint) => ({
          f: Math.max(0, Math.round(pathPoint.f * frameScale)),
          x: pathPoint.x,
          y: pathPoint.y,
          interp: pathPoint.interp
        })),
        actionTrack: shot.character.tracks.action_track.map((action) => ({
          f: Math.max(0, Math.round(action.f * frameScale)),
          clip: action.clip,
          weight: action.weight
        })),
        expressionTrack: shot.character.tracks.expression_track.map((expression) => ({
          f: Math.max(0, Math.round(expression.f * frameScale)),
          expression: expression.expression
        })),
        lookTrack: shot.character.tracks.look_track.map((look) => ({
          f: Math.max(0, Math.round(look.f * frameScale)),
          target: look.target
        })),
        pointTrack: shot.character.tracks.point_track?.map((point) => ({
          f: Math.max(0, Math.round(point.f * frameScale)),
          targetId: point.target_id,
          hand: point.hand
        }))
      },
      transitionHint: resolveTransitionHint(shot)
    };
  });
}

function readShotsDocument(filePath: string): RenderableShotsDocument {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as RenderableShotsDocument;
  const validator = createValidator();
  const validated = validator.validate("shots.schema.json", parsed);

  if (!validated.ok) {
    const details = validated.errors.map((entry) => `${entry.path} ${entry.message}`).join("; ");
    throw new Error(`Invalid shots document: ${details}`);
  }

  if (!Array.isArray(parsed.shots) || parsed.shots.length === 0) {
    throw new Error("shots.json has no shots");
  }

  return parsed;
}

function resolvePaths(input: OrchestrateRenderInput) {
  const repoRoot = resolveRepoRoot();
  const shotsPath = path.resolve(input.shotsPath ?? path.join(repoRoot, "out", "shots.json"));
  const outputPath = path.resolve(input.outputPath ?? path.join(repoRoot, "out", "render_episode.mp4"));
  const srtPath = path.resolve(input.srtPath ?? path.join(repoRoot, "out", "render_episode.srt"));
  const qcReportPath = path.resolve(
    input.qcReportPath ?? path.join(path.dirname(outputPath), "qc_report.json")
  );
  const renderLogPath = path.resolve(input.renderLogPath ?? path.join(repoRoot, "out", "render_log.json"));
  const propsPath = path.join(
    path.dirname(outputPath),
    `${path.basename(outputPath, path.extname(outputPath))}.props.json`
  );
  const videoDir = path.join(repoRoot, "apps", "video");
  const remotionCliPath = path.join(videoDir, "node_modules", "@remotion", "cli", "remotion-cli.js");
  return {
    shotsPath,
    outputPath,
    srtPath,
    qcReportPath,
    renderLogPath,
    propsPath,
    videoDir,
    remotionCliPath
  };
}

function getFinalQcIssues(report: VisualQcReport): VisualQcIssue[] {
  const finalRun = report.runs[report.runs.length - 1];
  return finalRun?.issues ?? [];
}

function getQcCounts(report: VisualQcReport): { errors: number; warnings: number } {
  const finalRun = report.runs[report.runs.length - 1];
  if (!finalRun) {
    return { errors: 0, warnings: 0 };
  }
  return {
    errors: finalRun.errorCount,
    warnings: finalRun.warnCount
  };
}

export async function orchestrateRenderEpisode(input: OrchestrateRenderInput = {}): Promise<OrchestrateRenderResult> {
  const preset: RenderPreset = {
    ...DEFAULT_PRESET,
    ...input.preset,
    safeArea: {
      ...DEFAULT_PRESET.safeArea,
      ...(input.preset?.safeArea ?? {})
    }
  };
  const attempt = Math.max(1, input.attempt ?? 1);
  const maxAttempts = Math.max(attempt, input.maxAttempts ?? attempt);
  const compositionId = input.compositionId ?? DEFAULT_COMPOSITION_ID;
  const dryRun = input.dryRun ?? false;
  const repoRoot = resolveRepoRoot();
  const profileResolverWorkspaceRoot =
    input.profileResolverWorkspaceRoot ??
    process.env.RENDER_PROFILE_RESOLVER_WORKSPACE_ROOT ??
    repoRoot;
  const discoveredProfileResolverModulePath = discoverDeterministicProfileResolverModule(
    path.resolve(process.cwd(), profileResolverWorkspaceRoot)
  );
  const configuredProfileResolverModulePath = input.profileResolverModulePath ?? process.env.RENDER_PROFILE_RESOLVER_MODULE;
  const autoDiscoverProfileResolver =
    configuredProfileResolverModulePath === "auto" || process.env.RENDER_PROFILE_RESOLVER_AUTO === "1";
  const runtimeProfileResolverModulePath =
    configuredProfileResolverModulePath && configuredProfileResolverModulePath !== "auto"
      ? path.resolve(process.cwd(), configuredProfileResolverModulePath)
      : autoDiscoverProfileResolver
        ? discoveredProfileResolverModulePath
        : discoveredProfileResolverModulePath;
  if (autoDiscoverProfileResolver && !runtimeProfileResolverModulePath) {
    throw new Error(
      describeDeterministicProfileResolverDiscoveryFailure(path.resolve(process.cwd(), profileResolverWorkspaceRoot))
    );
  }
  const runtimeProfileResolver =
    input.profileResolver ??
    (runtimeProfileResolverModulePath
      ? await loadDeterministicProfileResolverModule(runtimeProfileResolverModulePath)
      : undefined);

  const paths = resolvePaths(input);
  const startedAt = new Date();
  let qcReport: VisualQcReport | null = null;
  let qcPassed = false;
  let fallbackStepsApplied: string[] = [];
  let finalQcIssues: VisualQcIssue[] = [];
  let finalQcCounts = { errors: 0, warnings: 0 };

  let sequences: DeterministicSequence[] = [];
  let freezeCharacterPose = false;
  let subtitles = [] as ReturnType<typeof buildSubtitleCues>;
  let totalFrames = 0;
  let safeArea = preset.safeArea;
  let profileResolverSummary: RenderProfileResolverSummary | undefined;

  const command = [
    paths.remotionCliPath,
    "render",
    "src/index.ts",
    compositionId,
    paths.outputPath,
    "--overwrite",
    `--width=${preset.width}`,
    `--height=${preset.height}`,
    `--fps=${preset.fps}`,
    `--codec=${preset.codec}`,
    `--video-bitrate=${preset.videoBitrate}`,
    `--x264-preset=${preset.x264Preset}`
  ];

  let stdout = "";
  let stderr = "";

  try {
    const shotsDoc = readShotsDocument(paths.shotsPath);
    safeArea = toSafeAreaPixels(shotsDoc, preset);

    const baseSequences = buildDeterministicSequences(shotsDoc, preset.fps, input.qc, runtimeProfileResolver);
    const qcEvaluation = runVisualQcWithFallback({
      width: preset.width,
      height: preset.height,
      safeArea,
      sequences: baseSequences,
      qcInput: input.qc
    });

    qcReport = qcEvaluation.report;
    writeJson(paths.qcReportPath, qcReport);

    qcPassed = qcReport.final_passed;
    fallbackStepsApplied = [...qcReport.fallback_steps_applied];
    finalQcIssues = getFinalQcIssues(qcReport);
    finalQcCounts = getQcCounts(qcReport);

    if (!qcPassed) {
      throw new Error(`Visual QC failed. See report: ${paths.qcReportPath}`);
    }

    sequences = qcEvaluation.sequences;
    freezeCharacterPose = qcEvaluation.freezeCharacterPose;

    subtitles = buildSubtitleCues(sequences, preset.fps, input.alignmentHook);
    profileResolverSummary = summarizeProfileResolvers(sequences, runtimeProfileResolverModulePath);
    totalFrames = sequences.reduce((maxFrame, sequence) => {
      return Math.max(maxFrame, sequence.from + sequence.duration);
    }, 0);

    const props: EpisodeRenderProps = {
      episodeId: shotsDoc.episode.episode_id,
      safeArea,
      freezeCharacterPose,
      sequences,
      subtitles,
      debugOverlay: buildDebugOverlay(
        input,
        repoRoot,
        sequences,
        runtimeProfileResolverModulePath,
        finalQcCounts,
        fallbackStepsApplied,
        finalQcIssues
      )
    };

    writeJson(paths.propsPath, props);
    writeText(paths.srtPath, toSrt(subtitles, preset.fps));

    command.push(`--frames=0-${Math.max(0, totalFrames - 1)}`);
    command.push(`--props=${paths.propsPath}`);

    if (!dryRun) {
      if (!fs.existsSync(paths.remotionCliPath)) {
        throw new Error(`Remotion CLI not found: ${paths.remotionCliPath}`);
      }

      ensureDir(path.dirname(paths.outputPath));

      const result = spawnSync(process.execPath, command, {
        cwd: paths.videoDir,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024
      });

      stdout = result.stdout ?? "";
      stderr = result.stderr ?? "";

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        throw new Error(`Remotion render failed with exit code ${result.status ?? 1}`);
      }
    }

    const finishedAt = new Date();
    const log: RenderLog = {
      schema_version: "1.0",
      status: "SUCCEEDED",
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      attempt,
      max_attempts: maxAttempts,
      shots_path: paths.shotsPath,
      output_path: paths.outputPath,
      srt_path: paths.srtPath,
      qc_report_path: paths.qcReportPath,
      props_path: paths.propsPath,
      composition_id: compositionId,
      command,
      preset,
      sequence_count: sequences.length,
      subtitle_count: subtitles.length,
      total_frames: totalFrames,
      qc_passed: qcPassed,
      fallback_steps_applied: fallbackStepsApplied,
      qc_error_count: finalQcCounts.errors,
      qc_warning_count: finalQcCounts.warnings,
      profile_resolver: profileResolverSummary,
      stdout: limitLogText(stdout),
      stderr: limitLogText(stderr)
    };
    writeJson(paths.renderLogPath, log);

    return {
      outputPath: paths.outputPath,
      srtPath: paths.srtPath,
      qcReportPath: paths.qcReportPath,
      renderLogPath: paths.renderLogPath,
      propsPath: paths.propsPath,
      profileResolver: profileResolverSummary,
      sequenceCount: sequences.length,
      subtitleCount: subtitles.length,
      totalFrames,
      qcPassed,
      fallbackStepsApplied,
      qcErrorCount: finalQcCounts.errors,
      qcWarningCount: finalQcCounts.warnings,
      qcFinalIssues: finalQcIssues,
      status: "SUCCEEDED"
    };
  } catch (error) {
    const finishedAt = new Date();
    const err = error instanceof Error ? error : new Error(String(error));

    if (!qcReport) {
      const failReport: VisualQcReport = {
        schema_version: "1.0",
        generated_at: new Date().toISOString(),
        final_passed: false,
        final_stage: "pre_qc_failure",
        fallback_steps_applied: [],
        runs: []
      };
      writeJson(paths.qcReportPath, failReport);
      qcReport = failReport;
      finalQcIssues = [];
      finalQcCounts = { errors: 1, warnings: 0 };
      qcPassed = false;
      fallbackStepsApplied = [];
    }

    const log: RenderLog = {
      schema_version: "1.0",
      status: "FAILED",
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      duration_ms: finishedAt.getTime() - startedAt.getTime(),
      attempt,
      max_attempts: maxAttempts,
      shots_path: paths.shotsPath,
      output_path: paths.outputPath,
      srt_path: paths.srtPath,
      qc_report_path: paths.qcReportPath,
      props_path: paths.propsPath,
      composition_id: compositionId,
      command,
      preset,
      sequence_count: sequences.length,
      subtitle_count: subtitles.length,
      total_frames: totalFrames,
      qc_passed: qcPassed,
      fallback_steps_applied: fallbackStepsApplied,
      qc_error_count: finalQcCounts.errors,
      qc_warning_count: finalQcCounts.warnings,
      profile_resolver: profileResolverSummary,
      stdout: limitLogText(stdout),
      stderr: limitLogText(stderr),
      error: {
        message: err.message,
        stack: err.stack
      }
    };
    writeJson(paths.renderLogPath, log);
    throw err;
  }
}



