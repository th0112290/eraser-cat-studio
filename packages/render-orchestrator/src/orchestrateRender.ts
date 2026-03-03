import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createValidator } from "@ec/shared";
import type {
  ChartDataRow,
  DeterministicSequence,
  EpisodeRenderProps,
  OrchestrateRenderInput,
  OrchestrateRenderResult,
  RenderPreset,
  RenderQcInput,
  RenderableShot,
  RenderableShotsDocument,
  VisualQcIssue,
  VisualQcReport
} from "./types";
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

function computeChartAnchor(rows: ChartDataRow[], targetIndex: number): { x: number; y: number } {
  const count = Math.max(1, rows.length);
  const clampedIndex = clamp(targetIndex, 0, Math.max(0, count - 1));
  const left = CHART_BOX.x + 56;
  const top = CHART_BOX.y + 86;
  const plotWidth = CHART_BOX.width - 112;
  const plotHeight = CHART_BOX.height - 156;
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

function buildDeterministicSequences(
  doc: RenderableShotsDocument,
  presetFps: number,
  qcInput?: RenderQcInput
): DeterministicSequence[] {
  const sourceFps = doc.render.fps;
  const frameScale = sourceFps > 0 ? presetFps / sourceFps : 1;
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
    const chartData = buildChartRowsForShot(shot, qcInput);

    const highlightTargetId = shot.chart?.highlights?.[0]?.target_id;
    const pointTargetId = shot.character.tracks.point_track?.[0]?.target_id;
    const fallbackPointerIndex = Math.min(2, Math.max(0, chartData.length - 1));
    const pointerTargetIndex = resolveTargetIndexFromId(
      pointTargetId ?? highlightTargetId,
      chartData.length,
      fallbackPointerIndex
    );

    const pointerAnchor = computeChartAnchor(chartData, pointerTargetIndex);
    const expectOcclusion =
      qcInput?.expectOcclusion ?? Boolean(shot.set.layers?.fg_mask && shot.set.layers.fg_mask.length > 0);

    return {
      shotId: shot.shot_id,
      from,
      duration,
      setId: shot.set.set_id,
      cameraPreset: shot.camera.preset,
      narration,
      emphasisWords,
      chartData,
      visualMode: shot.chart ? "chart" : "table",
      annotationsEnabled: true,
      pointerTargetIndex,
      pointerEnabled: Boolean(shot.chart),
      freezePose: false,
      expectOcclusion,
      pointerTip: shot.chart ? pointerAnchor : undefined,
      unit: qcInput?.dataset?.unit,
      hasChart: Boolean(shot.chart),
      chartCallout: shot.chart?.callouts?.[0]?.text,
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

    const baseSequences = buildDeterministicSequences(shotsDoc, preset.fps, input.qc);
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
    totalFrames = sequences.reduce((maxFrame, sequence) => {
      return Math.max(maxFrame, sequence.from + sequence.duration);
    }, 0);

    const props: EpisodeRenderProps = {
      episodeId: shotsDoc.episode.episode_id,
      safeArea,
      freezeCharacterPose,
      sequences,
      subtitles
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



