-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'ASSET_INGEST';

-- CreateEnum
CREATE TYPE "AssetIngestType" AS ENUM ('CHARACTER_REFERENCE', 'CHARACTER_VIEW', 'BACKGROUND', 'CHART_SOURCE');

-- CreateEnum
CREATE TYPE "AssetIngestStatus" AS ENUM ('UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Asset"
  ADD COLUMN "assetType" "AssetIngestType",
  ADD COLUMN "status" "AssetIngestStatus" NOT NULL DEFAULT 'READY',
  ADD COLUMN "mime" TEXT,
  ADD COLUMN "sizeBytes" BIGINT,
  ADD COLUMN "originalKey" TEXT,
  ADD COLUMN "normalizedKey1024" TEXT,
  ADD COLUMN "normalizedKey2048" TEXT,
  ADD COLUMN "qcJson" JSONB,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE INDEX "Asset_assetType_status_idx" ON "Asset"("assetType", "status");