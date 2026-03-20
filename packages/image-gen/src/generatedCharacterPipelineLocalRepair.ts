import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type {
  CharacterCropBoxes,
  CharacterStillAsset,
  CropBox,
  GeneratedCharacterExpression,
  GeneratedCharacterManifest,
  GeneratedCharacterViseme,
  LoadedImageRaster
} from "./generatedCharacterPipeline";
import type { MascotSpeciesId } from "./types";

type RgbaColor = {
  r: number;
  g: number;
  b: number;
  alpha: number;
};

type SyntheticVisemeGeometry = {
  kind: "ellipse" | "roundRect";
  mouthWidthRatio: number;
  mouthHeightRatio: number;
  eraseWidthRatio: number;
  eraseHeightRatio: number;
  verticalOffsetRatio: number;
  cornerRatio: number;
};

type LocalRepairDeps = {
  clamp: (value: number, min: number, max: number) => number;
  normalizeCropBox: (crop: CropBox) => CropBox;
  characterRootDir: (characterId: string) => string;
  readJson: <T>(filePath: string) => T;
  writeJson: (filePath: string, value: unknown) => void;
  ensureDir: (dirPath: string) => void;
  loadManifest: (characterId: string) => GeneratedCharacterManifest;
  saveManifest: (manifest: GeneratedCharacterManifest) => GeneratedCharacterManifest;
  updateManifestWithAsset: (manifest: GeneratedCharacterManifest, asset: CharacterStillAsset) => GeneratedCharacterManifest;
  resolveManifestSpeciesId: (manifest: GeneratedCharacterManifest, fallbackSpeciesId?: MascotSpeciesId) => MascotSpeciesId;
  resolveAnimationQcThresholds: (speciesId?: MascotSpeciesId) => {
    minVisemeFaceVariation: number;
  };
  resolveRepairCropBoxes: (characterId: string) => Promise<CharacterCropBoxes>;
  loadImageRaster: (filePath: string) => Promise<LoadedImageRaster>;
  loadImageRasterFromBuffer: (buffer: Buffer, filePath?: string) => Promise<LoadedImageRaster>;
  normalizeStillToCanvas: (rawBuffer: Buffer, width: number, height: number) => Promise<Buffer>;
  measureForegroundBounds: (image: LoadedImageRaster, crop?: CropBox) => {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    coverage: number;
    centerX: number;
    centerY: number;
  } | null;
  deriveHeadCropFromBodyBounds: (bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    coverage: number;
    centerX: number;
    centerY: number;
  }, view: "front") => CropBox;
  detectFrontFaceFeatureCrops: (
    image: LoadedImageRaster,
    headCrop: CropBox
  ) => {
    mouth?: CropBox;
  };
  fullImageCrop: CropBox;
  measureDarkFeatureCenter: (
    image: LoadedImageRaster,
    crop: CropBox
  ) => { x: number; y: number; density: number } | null;
  meanVisibleRegionColor: (
    image: LoadedImageRaster,
    crop: CropBox,
    options?: { skipDarkFeatures?: boolean; minLuma?: number }
  ) => RgbaColor | null;
  meanRegionDifference: (base: LoadedImageRaster, candidate: LoadedImageRaster, crop: CropBox) => number;
  expandCropBox: (crop: CropBox, widthMultiplier: number, heightMultiplier: number, offsetY?: number) => CropBox;
  buildVisemeRepairCrop: (cropBoxes: CharacterCropBoxes) => CropBox;
  cropNormalizedRegion: (input: {
    sourcePath: string;
    crop: CropBox;
    targetPath: string;
    targetWidth: number;
    targetHeight: number;
  }) => Promise<string>;
  runEditCharacterStill: (input: {
    characterId: string;
    inputImagePath: string;
    editPrompt: string;
    negativePrompt?: string;
    seed: number;
    denoise?: number;
    stage: "expression" | "viseme";
    view: "front";
    expression?: GeneratedCharacterExpression;
    viseme?: GeneratedCharacterViseme;
    parentAssetId?: string;
    repairHistory?: string[];
  }) => Promise<CharacterStillAsset>;
  defaultImageWidth: number;
  defaultImageHeight: number;
};

async function computeCropPixelRegion(
  sourcePath: string,
  crop: CropBox,
  deps: LocalRepairDeps
): Promise<{ left: number; top: number; width: number; height: number; sourceWidth: number; sourceHeight: number }> {
  const metadata = await sharp(sourcePath, { failOn: "none" }).metadata();
  const sourceWidth = metadata.width ?? deps.defaultImageWidth;
  const sourceHeight = metadata.height ?? deps.defaultImageHeight;
  const width = deps.clamp(Math.round(sourceWidth * crop.w), 1, sourceWidth);
  const height = deps.clamp(Math.round(sourceHeight * crop.h), 1, sourceHeight);
  const left = deps.clamp(Math.round(sourceWidth * crop.cx - width / 2), 0, Math.max(0, sourceWidth - width));
  const top = deps.clamp(Math.round(sourceHeight * crop.cy - height / 2), 0, Math.max(0, sourceHeight - height));
  return { left, top, width, height, sourceWidth, sourceHeight };
}

function repairCropTargetSize(width: number, height: number, deps: LocalRepairDeps): { width: number; height: number } {
  const longestSide = Math.max(width, height, 1);
  const scale = deps.clamp(1024 / longestSide, 1, 4);
  return {
    width: Math.max(192, Math.round(width * scale)),
    height: Math.max(192, Math.round(height * scale))
  };
}

async function compositeEditedCropOntoBase(input: {
  basePath: string;
  overlayPath: string;
  crop: CropBox;
  outputPath: string;
}, deps: LocalRepairDeps): Promise<void> {
  const region = await computeCropPixelRegion(input.basePath, input.crop, deps);
  const overlayBuffer = await sharp(input.overlayPath, { failOn: "none" })
    .resize({ width: region.width, height: region.height, fit: "fill" })
    .png()
    .toBuffer();

  deps.ensureDir(path.dirname(input.outputPath));
  await sharp(input.basePath, { failOn: "none" })
    .ensureAlpha()
    .composite([{ input: overlayBuffer, left: region.left, top: region.top, blend: "over" }])
    .png()
    .toFile(input.outputPath);
}

function darkenColor(color: RgbaColor, amount: number): RgbaColor {
  const factor = Math.max(0, 1 - amount);
  return {
    r: Math.max(0, Math.round(color.r * factor)),
    g: Math.max(0, Math.round(color.g * factor)),
    b: Math.max(0, Math.round(color.b * factor)),
    alpha: color.alpha
  };
}

function rgbaToCss(color: RgbaColor): string {
  return `rgba(${color.r},${color.g},${color.b},${(color.alpha / 255).toFixed(3)})`;
}

function resolveSyntheticVisemeGeometry(
  viseme: GeneratedCharacterViseme,
  speciesId: MascotSpeciesId,
  scaleBoost: number
): SyntheticVisemeGeometry | null {
  const scale = scaleBoost;
  if (viseme === "mouth_open_small") {
    return { kind: "roundRect", mouthWidthRatio: 1.34 * scale, mouthHeightRatio: 1.08 * scale, eraseWidthRatio: 2.1 * scale, eraseHeightRatio: 1.94 * scale, verticalOffsetRatio: 0.08, cornerRatio: 0.42 };
  }
  if (viseme === "mouth_open_wide") {
    return { kind: "roundRect", mouthWidthRatio: 1.68 * scale, mouthHeightRatio: 1.42 * scale, eraseWidthRatio: 2.42 * scale, eraseHeightRatio: 2.14 * scale, verticalOffsetRatio: 0.12, cornerRatio: 0.36 };
  }
  if (viseme === "mouth_round_o") {
    return { kind: "ellipse", mouthWidthRatio: (speciesId === "wolf" ? 1.18 : 1.04) * scale, mouthHeightRatio: (speciesId === "wolf" ? 1.54 : 1.72) * scale, eraseWidthRatio: 1.92 * scale, eraseHeightRatio: 2.26 * scale, verticalOffsetRatio: 0.11, cornerRatio: 0.5 };
  }
  if (viseme === "mouth_smile_open") {
    return { kind: "roundRect", mouthWidthRatio: 1.58 * scale, mouthHeightRatio: 1.26 * scale, eraseWidthRatio: 2.28 * scale, eraseHeightRatio: 2.02 * scale, verticalOffsetRatio: 0.08, cornerRatio: 0.48 };
  }
  if (viseme === "mouth_fv") {
    return { kind: "roundRect", mouthWidthRatio: 1.46 * scale, mouthHeightRatio: 1.08 * scale, eraseWidthRatio: 2.18 * scale, eraseHeightRatio: 1.96 * scale, verticalOffsetRatio: 0.12, cornerRatio: 0.5 };
  }
  return null;
}

function resolveFrontMouthCrop(image: LoadedImageRaster, cropBoxes: CharacterCropBoxes, deps: LocalRepairDeps): CropBox {
  const bounds = deps.measureForegroundBounds(image, deps.fullImageCrop);
  const headCrop = bounds ? deps.deriveHeadCropFromBodyBounds(bounds, "front") : cropBoxes.head.front;
  return deps.detectFrontFaceFeatureCrops(image, headCrop).mouth ?? cropBoxes.mouth;
}

export async function strengthenVisemeAssetIfNeededWithDeps(input: {
  characterId: string;
  baseAsset: CharacterStillAsset;
  visemeAsset: CharacterStillAsset;
  viseme: GeneratedCharacterViseme;
  speciesId?: MascotSpeciesId;
}, deps: LocalRepairDeps): Promise<CharacterStillAsset> {
  if (input.viseme === "mouth_closed") {
    return input.visemeAsset;
  }
  const speciesId = deps.resolveManifestSpeciesId(deps.loadManifest(input.characterId), input.speciesId);
  const geometryAttempts = [1, 1.16, 1.32];
  const cropBoxes = await deps.resolveRepairCropBoxes(input.characterId);
  const baseRaster = await deps.loadImageRaster(input.baseAsset.file_path);
  let workingVisemeBuffer: Buffer = fs.readFileSync(input.visemeAsset.file_path);
  let visemeRaster = await deps.loadImageRasterFromBuffer(workingVisemeBuffer, input.visemeAsset.file_path);
  if (visemeRaster.width !== baseRaster.width || visemeRaster.height !== baseRaster.height) {
    workingVisemeBuffer = Buffer.from(await deps.normalizeStillToCanvas(workingVisemeBuffer, baseRaster.width, baseRaster.height));
    visemeRaster = await deps.loadImageRasterFromBuffer(workingVisemeBuffer, input.visemeAsset.file_path);
  }
  const mouthCrop = resolveFrontMouthCrop(baseRaster, cropBoxes, deps);
  const currentDelta = deps.meanRegionDifference(baseRaster, visemeRaster, mouthCrop);
  const targetDelta = Math.max(deps.resolveAnimationQcThresholds(speciesId).minVisemeFaceVariation * 1.3, 0.01);
  if (currentDelta >= targetDelta) {
    return input.visemeAsset;
  }

  const overlayCrop = deps.expandCropBox(mouthCrop, 1.9, 2.35, 0.03);
  const overlayRegion = await computeCropPixelRegion(input.baseAsset.file_path, overlayCrop, deps);
  const mouthRegion = await computeCropPixelRegion(input.baseAsset.file_path, mouthCrop, deps);
  const overlayWidth = Math.max(1, overlayRegion.width);
  const overlayHeight = Math.max(1, overlayRegion.height);
  const mouthWidthPx = Math.max(1, mouthRegion.width);
  const mouthHeightPx = Math.max(1, mouthRegion.height);
  const mouthCenter = deps.measureDarkFeatureCenter(baseRaster, mouthCrop) ?? { x: mouthCrop.cx, y: mouthCrop.cy, density: 0 };
  const muzzleColor =
    deps.meanVisibleRegionColor(baseRaster, deps.expandCropBox(mouthCrop, 1.6, 1.85, 0), { skipDarkFeatures: true, minLuma: 72 }) ??
    deps.meanVisibleRegionColor(baseRaster, deps.expandCropBox(mouthCrop, 1.4, 1.6, 0), { skipDarkFeatures: true }) ??
    { r: 224, g: 214, b: 198, alpha: 255 };
  const mouthFill = darkenColor({ r: 28, g: 20, b: 18, alpha: 245 }, speciesId === "wolf" ? 0.08 : 0);
  const lipStroke = darkenColor(muzzleColor, speciesId === "wolf" ? 0.5 : 0.42);

  for (const scaleBoost of geometryAttempts) {
    const geometry = resolveSyntheticVisemeGeometry(input.viseme, speciesId, scaleBoost);
    if (!geometry) {
      break;
    }
    const mouthWidth = deps.clamp(Math.round(mouthWidthPx * geometry.mouthWidthRatio), Math.max(10, Math.round(overlayWidth * 0.22)), Math.max(12, Math.round(overlayWidth * 0.94)));
    const mouthHeight = deps.clamp(Math.round(mouthHeightPx * geometry.mouthHeightRatio), Math.max(8, Math.round(overlayHeight * 0.18)), Math.max(10, Math.round(overlayHeight * 0.9)));
    const eraseWidth = deps.clamp(Math.round(mouthWidthPx * geometry.eraseWidthRatio), mouthWidth + 4, Math.max(14, Math.round(overlayWidth * 0.98)));
    const eraseHeight = deps.clamp(Math.round(mouthHeightPx * geometry.eraseHeightRatio), mouthHeight + 4, Math.max(14, Math.round(overlayHeight * 0.98)));
    const anchorX = deps.clamp(Math.round(mouthCenter.x * baseRaster.width) - overlayRegion.left, Math.floor(overlayWidth * 0.2), Math.ceil(overlayWidth * 0.8));
    const anchorY = deps.clamp(Math.round((mouthCenter.y + mouthCrop.h * geometry.verticalOffsetRatio) * baseRaster.height) - overlayRegion.top, Math.floor(overlayHeight * 0.24), Math.ceil(overlayHeight * 0.82));
    const mouthX = Math.round(anchorX - mouthWidth / 2);
    const mouthY = Math.round(anchorY - mouthHeight / 2);
    const strokeWidth = Math.max(2, Math.round(Math.min(mouthWidth, mouthHeight) * 0.09));
    const lipY = Math.round(mouthY + mouthHeight * 0.1);
    const lipStartX = Math.round(mouthX + mouthWidth * 0.14);
    const lipEndX = Math.round(mouthX + mouthWidth * 0.86);
    const lipControlY = Math.round(lipY - Math.max(2, mouthHeight * 0.16));
    const mouthNode =
      geometry.kind === "roundRect"
        ? `<rect x="${mouthX}" y="${mouthY}" width="${mouthWidth}" height="${mouthHeight}" rx="${Math.max(4, Math.round(mouthHeight * geometry.cornerRatio))}" ry="${Math.max(4, Math.round(mouthHeight * geometry.cornerRatio))}" fill="${rgbaToCss(mouthFill)}" />`
        : `<ellipse cx="${anchorX}" cy="${anchorY}" rx="${Math.max(4, Math.round(mouthWidth / 2))}" ry="${Math.max(4, Math.round(mouthHeight / 2))}" fill="${rgbaToCss(mouthFill)}" />`;
    const overlaySvg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${overlayWidth}" height="${overlayHeight}" viewBox="0 0 ${overlayWidth} ${overlayHeight}">
  <ellipse cx="${anchorX}" cy="${anchorY}" rx="${Math.max(6, Math.round(eraseWidth / 2))}" ry="${Math.max(6, Math.round(eraseHeight / 2))}" fill="${rgbaToCss(muzzleColor)}" />
  ${mouthNode}
  <path d="M ${lipStartX} ${lipY} Q ${anchorX} ${lipControlY} ${lipEndX} ${lipY}" fill="none" stroke="${rgbaToCss(lipStroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="0.9" />
</svg>`
    );
    const overlayBuffer = await sharp(overlaySvg, { limitInputPixels: false }).resize({ width: overlayWidth, height: overlayHeight, fit: "fill" }).png().toBuffer();
    const candidateBuffer = await sharp(workingVisemeBuffer, { limitInputPixels: false })
      .ensureAlpha()
      .composite([{ input: overlayBuffer, left: overlayRegion.left, top: overlayRegion.top, blend: "over" }])
      .png()
      .toBuffer();
    const candidateRaster = await deps.loadImageRasterFromBuffer(candidateBuffer, input.visemeAsset.file_path);
    const candidateDelta = deps.meanRegionDifference(baseRaster, candidateRaster, mouthCrop);
    if (candidateDelta < targetDelta && scaleBoost !== geometryAttempts[geometryAttempts.length - 1]) {
      continue;
    }
    fs.writeFileSync(input.visemeAsset.file_path, candidateBuffer);
    const metadata = deps.readJson<CharacterStillAsset>(input.visemeAsset.metadata_path);
    metadata.postprocess = [...new Set([...(metadata.postprocess ?? []), "viseme_local_strengthen", "viseme_local_composite"])];
    deps.writeJson(metadata.metadata_path, metadata);
    return metadata;
  }

  return input.visemeAsset;
}

export async function runLocalFaceRepairStillWithDeps(input: {
  characterId: string;
  baseAsset: CharacterStillAsset;
  stage: "expression" | "viseme";
  expression?: GeneratedCharacterExpression;
  viseme?: GeneratedCharacterViseme;
  editPrompt: string;
  negativePrompt?: string;
  seed: number;
  denoise?: number;
  round: number;
  speciesId?: MascotSpeciesId;
  repairHistory?: string[];
}, deps: LocalRepairDeps): Promise<CharacterStillAsset> {
  const cropBoxes = await deps.resolveRepairCropBoxes(input.characterId);
  const crop = input.stage === "expression" ? deps.expandCropBox(cropBoxes.head.front, 1.08, 1.1, 0.01) : deps.buildVisemeRepairCrop(cropBoxes);
  const cropRegion = await computeCropPixelRegion(input.baseAsset.file_path, crop, deps);
  const targetSize = repairCropTargetSize(cropRegion.width, cropRegion.height, deps);
  const targetLabel = input.stage === "expression" ? input.expression ?? "neutral" : input.viseme ?? "mouth_closed";
  const tempInputPath = path.join(deps.characterRootDir(input.characterId), "repair", `${input.stage}_${targetLabel}_round_${input.round}_local_input.png`);

  await deps.cropNormalizedRegion({
    sourcePath: input.baseAsset.file_path,
    crop,
    targetPath: tempInputPath,
    targetWidth: targetSize.width,
    targetHeight: targetSize.height
  });

  const asset = await deps.runEditCharacterStill({
    characterId: input.characterId,
    inputImagePath: tempInputPath,
    editPrompt: input.editPrompt,
    negativePrompt: input.negativePrompt,
    seed: input.seed,
    denoise: input.denoise,
    stage: input.stage,
    view: "front",
    expression: input.expression,
    viseme: input.viseme,
    parentAssetId: input.baseAsset.asset_id,
    repairHistory: [...(input.repairHistory ?? []), "repair_strategy:face_local_crop_edit"]
  });

  await compositeEditedCropOntoBase(
    {
      basePath: input.baseAsset.file_path,
      overlayPath: asset.file_path,
      crop,
      outputPath: asset.file_path
    },
    deps
  );

  const metadata = deps.readJson<CharacterStillAsset>(asset.metadata_path);
  metadata.width = input.baseAsset.width;
  metadata.height = input.baseAsset.height;
  metadata.postprocess = [...new Set([...(metadata.postprocess ?? []), "face_local_crop_edit", "face_local_composite"])];
  deps.writeJson(metadata.metadata_path, metadata);
  const finalAsset =
    input.stage === "viseme" && input.viseme && input.viseme !== "mouth_closed"
      ? await strengthenVisemeAssetIfNeededWithDeps(
          {
            characterId: input.characterId,
            baseAsset: input.baseAsset,
            visemeAsset: metadata,
            viseme: input.viseme,
            speciesId: input.speciesId
          },
          deps
        )
      : metadata;

  const manifest = deps.loadManifest(input.characterId);
  deps.updateManifestWithAsset(manifest, finalAsset);
  deps.saveManifest(manifest);
  return finalAsset;
}
