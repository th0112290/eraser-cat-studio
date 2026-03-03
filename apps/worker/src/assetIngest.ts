import sharp from "sharp";
import type { PrismaClient } from "@prisma/client";
import { getAssetObject, makeStorageKey, putAssetObject, putJsonObject } from "./assetStorage";

const MIN_DIMENSION_PX = 512;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const MAX_PIXEL_COUNT = 40_000_000;
const ALPHA_THRESHOLD = 8;
const LOW_CONTRAST_THRESHOLD = 35;

export type AssetIngestJobPayload = {
  assetId: string;
  assetType: "character_reference" | "character_view" | "background" | "chart_source";
  originalKey: string;
  mime: string;
};

class AssetIngestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}...` : message;
}

function toWarning(code: string, message: string): { code: string; message: string } {
  return { code, message };
}

function assertAssetId(payload: AssetIngestJobPayload): string {
  if (typeof payload.assetId !== "string" || payload.assetId.trim() === "") {
    throw new AssetIngestError("invalid_payload", "assetId is required for ASSET_INGEST");
  }
  return payload.assetId.trim();
}

function summarizeAnalysis(input: {
  width: number;
  height: number;
  alphaCoverage: number;
  contrast: number;
  bbox: { x: number; y: number; width: number; height: number } | null;
  warnings: Array<{ code: string; message: string }>;
  hardFails: Array<{ code: string; message: string }>;
}) {
  return {
    ok: input.hardFails.length === 0,
    dimensions: {
      width: input.width,
      height: input.height
    },
    alphaCoverage: Number(input.alphaCoverage.toFixed(4)),
    contrast: Number(input.contrast.toFixed(2)),
    bbox: input.bbox,
    warnings: input.warnings,
    hardFails: input.hardFails
  };
}

export async function handleAssetIngestJob(input: {
  prisma: PrismaClient;
  payload: AssetIngestJobPayload;
  bullmqJobId: string;
}): Promise<{ ok: true; assetId: string; warnings: number }> {
  const assetId = assertAssetId(input.payload);

  const asset = await input.prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      originalKey: true,
      storageKey: true,
      sizeBytes: true,
      mime: true,
      status: true,
      normalizedKey1024: true,
      normalizedKey2048: true
    }
  });

  if (!asset) {
    throw new AssetIngestError("asset_not_found", `Asset not found: ${assetId}`);
  }

  if (asset.status === "READY" && asset.normalizedKey1024 && asset.normalizedKey2048) {
    return {
      ok: true,
      assetId,
      warnings: 0
    };
  }

  await input.prisma.asset.update({
    where: { id: assetId },
    data: {
      status: "PROCESSING",
      qcJson: {
        ok: false,
        stage: "processing",
        message: "ASSET_INGEST started",
        bullmqJobId: input.bullmqJobId
      }
    }
  });

  const originalKey = asset.originalKey ?? asset.storageKey;

  try {
    const originalBuffer = await getAssetObject(originalKey);
    if (originalBuffer.byteLength > MAX_INPUT_BYTES) {
      throw new AssetIngestError(
        "file_too_large",
        `File too large: ${originalBuffer.byteLength} bytes (max ${MAX_INPUT_BYTES})`
      );
    }

    const normalizedSource = await sharp(originalBuffer, { failOn: "warning" }).rotate().ensureAlpha().png().toBuffer();
    const metadata = await sharp(normalizedSource).metadata();

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width <= 0 || height <= 0) {
      throw new AssetIngestError("unreadable_image", "Image metadata is unreadable");
    }

    if (Math.min(width, height) < MIN_DIMENSION_PX) {
      throw new AssetIngestError(
        "image_too_small",
        `Image too small: ${width}x${height}. Minimum side is ${MIN_DIMENSION_PX}px`
      );
    }

    if (width * height > MAX_PIXEL_COUNT) {
      throw new AssetIngestError(
        "decompression_bomb_risk",
        `Pixel count too large: ${width * height}. Max allowed is ${MAX_PIXEL_COUNT}`
      );
    }

    const raw = await sharp(normalizedSource).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const data = raw.data;
    const pxCount = raw.info.width * raw.info.height;

    let minX = raw.info.width;
    let minY = raw.info.height;
    let maxX = -1;
    let maxY = -1;
    let alphaPixels = 0;
    let lumaMin = 255;
    let lumaMax = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a > ALPHA_THRESHOLD) {
        const pixelIndex = i / 4;
        const x = pixelIndex % raw.info.width;
        const y = Math.floor(pixelIndex / raw.info.width);

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;

        alphaPixels += 1;

        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma < lumaMin) lumaMin = luma;
        if (luma > lumaMax) lumaMax = luma;
      }
    }

    const alphaCoverage = pxCount > 0 ? alphaPixels / pxCount : 0;
    const contrast = alphaPixels > 0 ? lumaMax - lumaMin : 0;
    const bbox =
      maxX >= minX && maxY >= minY
        ? {
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1
          }
        : null;

    const warnings: Array<{ code: string; message: string }> = [];
    const hardFails: Array<{ code: string; message: string }> = [];

    if (alphaCoverage > 0.995) {
      warnings.push(toWarning("no_alpha", "Image has almost no transparent pixels"));
    }

    if (contrast < LOW_CONTRAST_THRESHOLD) {
      warnings.push(toWarning("low_contrast", `Contrast is low (${contrast.toFixed(1)})`));
    }

    if (bbox && (bbox.x === 0 || bbox.y === 0 || bbox.x + bbox.width >= width || bbox.y + bbox.height >= height)) {
      warnings.push(toWarning("possibly_cropped", "Visible pixels touch image edge; possible crop issue"));
    }

    const qcSummary = summarizeAnalysis({
      width,
      height,
      alphaCoverage,
      contrast,
      bbox,
      warnings,
      hardFails
    });

    if (!qcSummary.ok) {
      throw new AssetIngestError("qc_hard_fail", "Asset quality gates failed");
    }

    const normalized1024 = await sharp(normalizedSource)
      .resize({
        height: 1024,
        fit: "inside",
        withoutEnlargement: true
      })
      .png()
      .toBuffer();

    const normalized2048 = await sharp(normalizedSource)
      .resize({
        height: 2048,
        fit: "inside",
        withoutEnlargement: true
      })
      .png()
      .toBuffer();

    const normalizedKey1024 = makeStorageKey(`assets/${assetId}/normalized`, "asset_1024.png");
    const normalizedKey2048 = makeStorageKey(`assets/${assetId}/normalized`, "asset_2048.png");
    const qcReportKey = makeStorageKey(`assets/${assetId}`, "qc_report.json");

    await putAssetObject(normalizedKey1024, normalized1024, "image/png");
    await putAssetObject(normalizedKey2048, normalized2048, "image/png");
    const qcWrite = await putJsonObject(qcReportKey, {
      ...qcSummary,
      generatedAt: new Date().toISOString(),
      bullmqJobId: input.bullmqJobId
    });

    await input.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: "READY",
        mime: "image/png",
        sizeBytes: BigInt(normalizedSource.byteLength),
        normalizedKey1024,
        normalizedKey2048,
        contentType: "image/png",
        bytes: BigInt(normalizedSource.byteLength),
        qcJson: {
          ...qcSummary,
          qcReportKey,
          qcReportBackend: qcWrite.backend,
          minioWarning: qcWrite.minioError ?? null
        }
      }
    });

    return {
      ok: true,
      assetId,
      warnings: warnings.length
    };
  } catch (error) {
    const safeMessage = safeErrorMessage(error);
    const code = error instanceof AssetIngestError ? error.code : "asset_ingest_failed";

    await input.prisma.asset.update({
      where: { id: assetId },
      data: {
        status: "FAILED",
        qcJson: {
          ok: false,
          code,
          error: safeMessage,
          failedAt: new Date().toISOString(),
          bullmqJobId: input.bullmqJobId
        }
      }
    });

    throw new AssetIngestError(code, safeMessage);
  }
}
