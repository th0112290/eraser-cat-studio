import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export type PremiumActualVisualSignalMode = "ffmpeg-sharp" | "metadata-only";

export type PremiumActualVisualSignalReport = {
  schema_version: "1.0";
  visual_judge_version: "premium_actual_visual_signal_v1";
  judge_version: string;
  mode: PremiumActualVisualSignalMode;
  reference_available: boolean;
  output_video_path: string | null;
  expected_duration_seconds: number;
  output_duration_seconds: number | null;
  extracted_frame_paths: string[];
  frame_count: number;
  overall_score: number;
  face_stability_score: number;
  motion_coherence_score: number;
  silhouette_readability_score: number;
  mascot_identity_preservation_score: number;
  subtitle_safe_score: number;
  chart_safe_score: number;
  warnings: string[];
};

type Region = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Raster = {
  width: number;
  height: number;
  pixels: Float32Array;
};

const FACE_REGION: Region = { x: 0.2, y: 0.08, width: 0.6, height: 0.5 };
const SUBTITLE_REGION: Region = { x: 0.08, y: 0.78, width: 0.84, height: 0.16 };
const LEFT_PRESENTATION_REGION: Region = { x: 0.04, y: 0.16, width: 0.26, height: 0.52 };
const RIGHT_PRESENTATION_REGION: Region = { x: 0.7, y: 0.16, width: 0.26, height: 0.52 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "segment";
}

function ffmpegAvailable(): boolean {
  const result = spawnSync("ffmpeg", ["-version"], {
    stdio: "ignore",
    windowsHide: true
  });
  return result.status === 0;
}

function computeCaptureTimes(durationSeconds: number | null): number[] {
  const duration = typeof durationSeconds === "number" && Number.isFinite(durationSeconds) ? durationSeconds : 1.4;
  const safeDuration = Math.max(0.2, duration);
  const first = Math.min(0.08, Math.max(0.01, safeDuration * 0.08));
  const middle = Math.max(first, safeDuration * 0.5);
  const last = Math.max(first, safeDuration - Math.max(0.08, safeDuration * 0.14));
  return Array.from(new Set([first, middle, last].map((value) => Number(value.toFixed(3)))));
}

function extractFrameAtTime(input: { videoPath: string; timeSeconds: number; outputPath: string }): boolean {
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-ss",
      input.timeSeconds.toFixed(3),
      "-i",
      input.videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      input.outputPath
    ],
    {
      windowsHide: true,
      stdio: "ignore"
    }
  );
  return result.status === 0 && fs.existsSync(input.outputPath);
}

async function readRaster(filePath: string, region: Region, targetWidth: number, targetHeight: number): Promise<Raster> {
  const metadata = await sharp(filePath, { failOn: "none", limitInputPixels: false }).metadata();
  const sourceWidth = Math.max(1, metadata.width ?? targetWidth);
  const sourceHeight = Math.max(1, metadata.height ?? targetHeight);
  const left = clamp(Math.round(region.x * sourceWidth), 0, Math.max(0, sourceWidth - 1));
  const top = clamp(Math.round(region.y * sourceHeight), 0, Math.max(0, sourceHeight - 1));
  const width = clamp(Math.round(region.width * sourceWidth), 1, sourceWidth - left);
  const height = clamp(Math.round(region.height * sourceHeight), 1, sourceHeight - top);
  const { data, info } = await sharp(filePath, { failOn: "none", limitInputPixels: false })
    .ensureAlpha()
    .extract({ left, top, width, height })
    .resize(targetWidth, targetHeight, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Float32Array(info.width * info.height);
  for (let index = 0; index < info.width * info.height; index += 1) {
    const offset = index * info.channels;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? r;
    const b = data[offset + 2] ?? r;
    const alpha = info.channels >= 4 ? (data[offset + 3] ?? 255) / 255 : 1;
    pixels[index] = ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * alpha;
  }

  return {
    width: info.width,
    height: info.height,
    pixels
  };
}

function computeSimilarity(left: Raster, right: Raster): number {
  const count = Math.min(left.pixels.length, right.pixels.length);
  if (count === 0) {
    return 0;
  }
  let diff = 0;
  for (let index = 0; index < count; index += 1) {
    diff += Math.abs(left.pixels[index]! - right.pixels[index]!);
  }
  return clamp(1 - diff / count, 0, 1);
}

function computeEdgeDensity(raster: Raster): number {
  if (raster.width <= 1 || raster.height <= 1) {
    return 0;
  }
  let total = 0;
  let count = 0;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const index = y * raster.width + x;
      const value = raster.pixels[index] ?? 0;
      if (x + 1 < raster.width) {
        total += Math.abs(value - (raster.pixels[index + 1] ?? 0));
        count += 1;
      }
      if (y + 1 < raster.height) {
        total += Math.abs(value - (raster.pixels[index + raster.width] ?? 0));
        count += 1;
      }
    }
  }
  return count > 0 ? total / count : 0;
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function scoreWindow(value: number, min: number, max: number, spread: number): number {
  if (value >= min && value <= max) {
    return 100;
  }
  const distance = value < min ? min - value : value - max;
  return clamp(100 - (distance / Math.max(0.0001, spread)) * 100, 0, 100);
}

function scoreOpenness(edgeDensity: number): number {
  return clamp(100 - edgeDensity * 260, 0, 100);
}

function buildMetadataOnlyReport(input: {
  judgeVersion: string;
  outputVideoPath: string | null;
  referenceAvailable: boolean;
  expectedDurationSeconds: number;
  outputDurationSeconds: number | null;
  hasChart: boolean;
  objective: string;
  warnings: string[];
}): PremiumActualVisualSignalReport {
  const faceStability = input.referenceAvailable ? 62 : 48;
  const motionCoherence = input.outputVideoPath ? 56 : 44;
  const silhouetteReadability = input.objective === "silhouette_safe" ? 70 : 58;
  const mascotIdentityPreservation = input.referenceAvailable ? 64 : 50;
  const subtitleSafe = input.hasChart ? 58 : 64;
  const chartSafe = input.hasChart ? 62 : 57;
  const overallScore = round(
    faceStability * 0.22 +
      motionCoherence * 0.16 +
      silhouetteReadability * 0.18 +
      mascotIdentityPreservation * 0.22 +
      subtitleSafe * 0.12 +
      chartSafe * 0.1
  );

  return {
    schema_version: "1.0",
    visual_judge_version: "premium_actual_visual_signal_v1",
    judge_version: input.judgeVersion,
    mode: "metadata-only",
    reference_available: input.referenceAvailable,
    output_video_path: input.outputVideoPath,
    expected_duration_seconds: round(input.expectedDurationSeconds),
    output_duration_seconds:
      typeof input.outputDurationSeconds === "number" ? round(input.outputDurationSeconds) : null,
    extracted_frame_paths: [],
    frame_count: 0,
    overall_score: overallScore,
    face_stability_score: faceStability,
    motion_coherence_score: motionCoherence,
    silhouette_readability_score: silhouetteReadability,
    mascot_identity_preservation_score: mascotIdentityPreservation,
    subtitle_safe_score: subtitleSafe,
    chart_safe_score: chartSafe,
    warnings: input.warnings
  };
}

export async function evaluatePremiumActualVisualSignals(input: {
  judgeVersion: string;
  sidecarDir: string;
  shotId: string;
  candidateId: string;
  objective: string;
  outputVideoPath: string | null;
  referenceImagePath: string | null;
  expectedDurationSeconds: number;
  outputDurationSeconds: number | null;
  hasChart: boolean;
}): Promise<PremiumActualVisualSignalReport> {
  const referenceAvailable =
    typeof input.referenceImagePath === "string" &&
    input.referenceImagePath.trim().length > 0 &&
    fs.existsSync(input.referenceImagePath);

  const metadataWarnings: string[] = [];
  if (!input.outputVideoPath || !fs.existsSync(input.outputVideoPath)) {
    metadataWarnings.push("output_video_missing");
    return buildMetadataOnlyReport({
      judgeVersion: input.judgeVersion,
      outputVideoPath: input.outputVideoPath,
      referenceAvailable,
      expectedDurationSeconds: input.expectedDurationSeconds,
      outputDurationSeconds: input.outputDurationSeconds,
      hasChart: input.hasChart,
      objective: input.objective,
      warnings: metadataWarnings
    });
  }

  if (!ffmpegAvailable()) {
    metadataWarnings.push("ffmpeg_unavailable");
    return buildMetadataOnlyReport({
      judgeVersion: input.judgeVersion,
      outputVideoPath: input.outputVideoPath,
      referenceAvailable,
      expectedDurationSeconds: input.expectedDurationSeconds,
      outputDurationSeconds: input.outputDurationSeconds,
      hasChart: input.hasChart,
      objective: input.objective,
      warnings: metadataWarnings
    });
  }

  const frameDir = path.join(
    input.sidecarDir,
    `${sanitizeSegment(input.shotId)}.${sanitizeSegment(input.candidateId)}.premium_visual_frames`
  );
  fs.mkdirSync(frameDir, { recursive: true });
  const outputVideoPath = input.outputVideoPath;
  const framePaths = computeCaptureTimes(input.outputDurationSeconds)
    .map((timeSeconds, index) => ({
      timeSeconds,
      outputPath: path.join(frameDir, `frame_${index + 1}.png`)
    }))
    .filter((entry) => extractFrameAtTime({ videoPath: outputVideoPath, timeSeconds: entry.timeSeconds, outputPath: entry.outputPath }))
    .map((entry) => entry.outputPath);

  if (framePaths.length < 2) {
    metadataWarnings.push("frame_extraction_failed");
    return buildMetadataOnlyReport({
      judgeVersion: input.judgeVersion,
      outputVideoPath: input.outputVideoPath,
      referenceAvailable,
      expectedDurationSeconds: input.expectedDurationSeconds,
      outputDurationSeconds: input.outputDurationSeconds,
      hasChart: input.hasChart,
      objective: input.objective,
      warnings: metadataWarnings
    });
  }

  const fullFrames = await Promise.all(framePaths.map((filePath) => readRaster(filePath, { x: 0, y: 0, width: 1, height: 1 }, 72, 72)));
  const faceFrames = await Promise.all(framePaths.map((filePath) => readRaster(filePath, FACE_REGION, 48, 48)));
  const subtitleFrames = await Promise.all(framePaths.map((filePath) => readRaster(filePath, SUBTITLE_REGION, 48, 16)));
  const leftFrames = await Promise.all(framePaths.map((filePath) => readRaster(filePath, LEFT_PRESENTATION_REGION, 24, 36)));
  const rightFrames = await Promise.all(framePaths.map((filePath) => readRaster(filePath, RIGHT_PRESENTATION_REGION, 24, 36)));

  const faceStability = round(
    average([
      computeSimilarity(faceFrames[0]!, faceFrames[1]!),
      computeSimilarity(faceFrames[1]!, faceFrames[framePaths.length - 1]!),
      computeSimilarity(faceFrames[0]!, faceFrames[framePaths.length - 1]!)
    ]) * 100
  );

  const motionDelta = average(fullFrames.slice(1).map((frame, index) => 1 - computeSimilarity(fullFrames[index]!, frame)));
  const motionCoherence = round(scoreWindow(motionDelta, 0.015, 0.12, 0.2));

  const fullEdgeDensity = average(fullFrames.map((frame) => computeEdgeDensity(frame)));
  const subtitleEdgeDensity = average(subtitleFrames.map((frame) => computeEdgeDensity(frame)));
  const leftEdgeDensity = average(leftFrames.map((frame) => computeEdgeDensity(frame)));
  const rightEdgeDensity = average(rightFrames.map((frame) => computeEdgeDensity(frame)));
  const silhouetteReadability = round(
    scoreWindow(fullEdgeDensity, 0.035, 0.16, 0.2) * 0.55 +
      Math.max(scoreOpenness(leftEdgeDensity), scoreOpenness(rightEdgeDensity)) * 0.25 +
      scoreOpenness(subtitleEdgeDensity) * 0.2
  );

  const subtitleSafe = round(scoreOpenness(subtitleEdgeDensity));
  const chartSafe = round(Math.max(scoreOpenness(leftEdgeDensity), scoreOpenness(rightEdgeDensity)));

  let mascotIdentityPreservation: number;
  const warnings: string[] = [];
  if (referenceAvailable) {
    const referenceFace = await readRaster(input.referenceImagePath!, FACE_REGION, 48, 48);
    mascotIdentityPreservation = round(average(faceFrames.map((frame) => computeSimilarity(frame, referenceFace))) * 100);
  } else {
    warnings.push("reference_image_unavailable_for_identity_signal");
    mascotIdentityPreservation = round(faceStability * 0.62 + silhouetteReadability * 0.38);
  }

  const overallScore = round(
    faceStability * 0.22 +
      motionCoherence * 0.16 +
      silhouetteReadability * 0.18 +
      mascotIdentityPreservation * 0.22 +
      subtitleSafe * 0.12 +
      chartSafe * 0.1
  );

  return {
    schema_version: "1.0",
    visual_judge_version: "premium_actual_visual_signal_v1",
    judge_version: input.judgeVersion,
    mode: "ffmpeg-sharp",
    reference_available: referenceAvailable,
    output_video_path: input.outputVideoPath,
    expected_duration_seconds: round(input.expectedDurationSeconds),
    output_duration_seconds: typeof input.outputDurationSeconds === "number" ? round(input.outputDurationSeconds) : null,
    extracted_frame_paths: framePaths,
    frame_count: framePaths.length,
    overall_score: overallScore,
    face_stability_score: faceStability,
    motion_coherence_score: motionCoherence,
    silhouette_readability_score: silhouetteReadability,
    mascot_identity_preservation_score: mascotIdentityPreservation,
    subtitle_safe_score: subtitleSafe,
    chart_safe_score: chartSafe,
    warnings
  };
}
