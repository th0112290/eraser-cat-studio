import fs from "node:fs";
import sharp from "sharp";
import { resolveMascotSpeciesProfile } from "./species";
import type {
  MascotReferenceVisualQcCheck,
  MascotReferenceVisualQcReport,
  MascotSpeciesId
} from "./types";

type LoadedRaster = {
  buffer: Buffer;
  data: Buffer<ArrayBufferLike>;
  width: number;
  height: number;
  channels: number;
  background: { r: number; g: number; b: number };
};

type SubjectBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

async function loadRaster(filePath: string): Promise<LoadedRaster> {
  const buffer = fs.readFileSync(filePath);
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    buffer,
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
    background: estimateBackgroundColor(data, info.width, info.height, info.channels)
  };
}

function estimateBackgroundColor(
  data: Buffer<ArrayBufferLike>,
  width: number,
  height: number,
  channels: number
): { r: number; g: number; b: number } {
  const points: Array<[number, number]> = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), Math.max(0, height - 1)]
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of points) {
    const idx = (y * width + x) * channels;
    r += data[idx] ?? 255;
    g += data[idx + 1] ?? 255;
    b += data[idx + 2] ?? 255;
  }
  return {
    r: Math.round(r / points.length),
    g: Math.round(g / points.length),
    b: Math.round(b / points.length)
  };
}

function foregroundDistance(raster: LoadedRaster, pixelIndex: number): number {
  return (
    Math.abs((raster.data[pixelIndex] ?? 255) - raster.background.r) +
    Math.abs((raster.data[pixelIndex + 1] ?? 255) - raster.background.g) +
    Math.abs((raster.data[pixelIndex + 2] ?? 255) - raster.background.b)
  );
}

function detectSubjectBounds(raster: LoadedRaster, threshold = 18): SubjectBounds | null {
  let minX = raster.width;
  let minY = raster.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const idx = (y * raster.width + x) * raster.channels;
      const alpha = raster.data[idx + 3] ?? 255;
      if (alpha < 16 || foregroundDistance(raster, idx) < threshold) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) {
    return null;
  }
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

function scoreCoverage(bounds: SubjectBounds | null, width: number, height: number): number {
  if (!bounds) {
    return 0;
  }
  const ratio = (bounds.width * bounds.height) / (width * height);
  if (ratio < 0.08 || ratio > 0.82) {
    return 0;
  }
  if (ratio >= 0.18 && ratio <= 0.55) {
    return 1;
  }
  return ratio < 0.18 ? clamp01((ratio - 0.08) / 0.1) : clamp01((0.82 - ratio) / 0.27);
}

function scoreSquareness(bounds: SubjectBounds | null): number {
  if (!bounds) {
    return 0;
  }
  const ratio = bounds.width / Math.max(bounds.height, 1);
  const delta = Math.abs(ratio - 1);
  return clamp01(1 - delta / 0.45);
}

function scoreMonochrome(raster: LoadedRaster): number {
  let sampleCount = 0;
  let totalDelta = 0;
  for (let y = 0; y < raster.height; y += 8) {
    for (let x = 0; x < raster.width; x += 8) {
      const idx = (y * raster.width + x) * raster.channels;
      const alpha = raster.data[idx + 3] ?? 255;
      if (alpha < 16) {
        continue;
      }
      const r = raster.data[idx] ?? 255;
      const g = raster.data[idx + 1] ?? 255;
      const b = raster.data[idx + 2] ?? 255;
      totalDelta += Math.abs(r - g) + Math.abs(g - b) + Math.abs(r - b);
      sampleCount += 1;
    }
  }
  if (sampleCount === 0) {
    return 0;
  }
  const averageDelta = totalDelta / sampleCount;
  return clamp01(1 - averageDelta / 45);
}

function scoreBackgroundFlatness(raster: LoadedRaster): number {
  const points: Array<[number, number]> = [];
  for (let x = 0; x < raster.width; x += Math.max(1, Math.floor(raster.width / 16))) {
    points.push([x, 0], [x, Math.max(0, raster.height - 1)]);
  }
  for (let y = 0; y < raster.height; y += Math.max(1, Math.floor(raster.height / 16))) {
    points.push([0, y], [Math.max(0, raster.width - 1), y]);
  }
  let variance = 0;
  for (const [x, y] of points) {
    const idx = (y * raster.width + x) * raster.channels;
    variance +=
      Math.abs((raster.data[idx] ?? 255) - raster.background.r) +
      Math.abs((raster.data[idx + 1] ?? 255) - raster.background.g) +
      Math.abs((raster.data[idx + 2] ?? 255) - raster.background.b);
  }
  const averageVariance = variance / Math.max(points.length, 1);
  return clamp01(1 - averageVariance / 24);
}

function scoreHeroFocus(bounds: SubjectBounds | null, width: number, height: number): number {
  if (!bounds) {
    return 0;
  }
  const ratio = (bounds.width * bounds.height) / (width * height);
  if (ratio <= 0.14) {
    return 0;
  }
  if (ratio >= 0.28 && ratio <= 0.7) {
    return 1;
  }
  return ratio < 0.28 ? clamp01((ratio - 0.14) / 0.14) : clamp01((0.82 - ratio) / 0.12);
}

function scoreFrontFamilyConsistency(frontBuffer: Buffer, familyFrontBuffer: Buffer): number {
  return frontBuffer.equals(familyFrontBuffer) ? 1 : 0;
}

function buildCheck(input: {
  id: string;
  label: string;
  score: number;
  threshold: number;
  blocking?: boolean;
  note: string;
}): MascotReferenceVisualQcCheck {
  return {
    ...input,
    score: Number(input.score.toFixed(3)),
    passed: input.score >= input.threshold
  };
}

export async function evaluateMascotFrontCanon(input: {
  speciesId: MascotSpeciesId;
  frontAssetPath: string;
  familyFrontAssetPath: string;
  heroAssetPath?: string;
}): Promise<MascotReferenceVisualQcReport> {
  const speciesProfile = resolveMascotSpeciesProfile(input.speciesId);
  const frontHeadBoxinessThreshold =
    input.speciesId === "wolf" ? 0.5 : input.speciesId === "dog" ? 0.56 : 0.58;
  const front = await loadRaster(input.frontAssetPath);
  const familyFront = await loadRaster(input.familyFrontAssetPath);
  const hero = input.heroAssetPath && fs.existsSync(input.heroAssetPath) ? await loadRaster(input.heroAssetPath) : null;

  const frontBounds = detectSubjectBounds(front);
  const heroBounds = hero ? detectSubjectBounds(hero) : null;

  const checks = [
    buildCheck({
      id: "front_subject_coverage",
      label: "Front subject coverage",
      score: scoreCoverage(frontBounds, front.width, front.height),
      threshold: 0.55,
      blocking: true,
      note: "front master should occupy a stable central area without becoming tiny or overwhelming the frame"
    }),
    buildCheck({
      id: "front_head_boxiness",
      label: "Front head boxiness",
      score: scoreSquareness(frontBounds),
      threshold: frontHeadBoxinessThreshold,
      blocking: true,
      note:
        input.speciesId === "wolf"
          ? "wolf front master should keep a broad boxy head silhouette even with a short wedge muzzle"
          : "front master should keep a near-square boxy head silhouette"
    }),
    buildCheck({
      id: "front_monochrome_finish",
      label: "Monochrome finish",
      score: scoreMonochrome(front),
      threshold: 0.82,
      note: "front master should stay in the monochrome doodle finish"
    }),
    buildCheck({
      id: "background_flatness",
      label: "Flat background",
      score: scoreBackgroundFlatness(front),
      threshold: 0.8,
      note: "background should stay plain and low-noise"
    }),
    buildCheck({
      id: "family_front_consistency",
      label: "Family-front consistency",
      score: scoreFrontFamilyConsistency(front.buffer, familyFront.buffer),
      threshold: 1,
      blocking: true,
      note: "family.front should be an exact copy of the approved front master during front-discovery"
    }),
    buildCheck({
      id: "hero_focus",
      label: "Hero focus",
      score: hero ? scoreHeroFocus(heroBounds, hero.width, hero.height) : 0,
      threshold: 0.62,
      note: "hero crop should keep the face dominant and readable"
    })
  ];

  const overallScore = Number(
    (
      checks.reduce((sum, entry) => sum + entry.score, 0) /
      Math.max(checks.length, 1)
    ).toFixed(3)
  );
  const passed = checks.every((entry) => !entry.blocking || entry.passed) && overallScore >= 0.78;

  return {
    generatedAt: new Date().toISOString(),
    speciesId: input.speciesId,
    familyId: speciesProfile.familyId,
    frontAssetPath: input.frontAssetPath,
    familyFrontAssetPath: input.familyFrontAssetPath,
    heroAssetPath: hero ? input.heroAssetPath : undefined,
    overallScore,
    passed,
    checks
  };
}
