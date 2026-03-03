-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'SCHEDULED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "BacklogStatus" AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "backlogItemId" TEXT,
ADD COLUMN     "characterPackVersion" INTEGER,
ADD COLUMN     "datasetVersionSnapshot" JSONB,
ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "seasonId" TEXT,
ADD COLUMN     "templateVersion" TEXT NOT NULL DEFAULT 'mvp1';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "estimatedApiCalls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "estimatedAudioSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "estimatedRenderSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retryBackoffMs" INTEGER NOT NULL DEFAULT 1000;

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "episodesPerWeek" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarSlot" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "backlogItemId" TEXT,
    "episodeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacklogItem" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "seasonId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "BacklogStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT,
    "unit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentVariant" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperimentVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeMetric" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "ingestionId" TEXT NOT NULL,
    "experimentId" TEXT,
    "variantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpisodeMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "actorApiKeyHash" TEXT,
    "clientIp" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Season_channelId_isActive_idx" ON "Season"("channelId", "isActive");

-- CreateIndex
CREATE INDEX "Season_channelId_startDate_endDate_idx" ON "Season"("channelId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSlot_episodeId_key" ON "CalendarSlot"("episodeId");

-- CreateIndex
CREATE INDEX "CalendarSlot_seasonId_status_idx" ON "CalendarSlot"("seasonId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSlot_seasonId_scheduledDate_key" ON "CalendarSlot"("seasonId", "scheduledDate");

-- CreateIndex
CREATE INDEX "BacklogItem_channelId_status_priority_idx" ON "BacklogItem"("channelId", "status", "priority");

-- CreateIndex
CREATE INDEX "BacklogItem_seasonId_status_idx" ON "BacklogItem"("seasonId", "status");

-- CreateIndex
CREATE INDEX "Metric_channelId_idx" ON "Metric"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "Metric_channelId_key_key" ON "Metric"("channelId", "key");

-- CreateIndex
CREATE INDEX "Experiment_channelId_status_idx" ON "Experiment"("channelId", "status");

-- CreateIndex
CREATE INDEX "Experiment_channelId_startDate_endDate_idx" ON "Experiment"("channelId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "ExperimentVariant_experimentId_idx" ON "ExperimentVariant"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentVariant_experimentId_key_key" ON "ExperimentVariant"("experimentId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeMetric_ingestionId_key" ON "EpisodeMetric"("ingestionId");

-- CreateIndex
CREATE INDEX "EpisodeMetric_episodeId_observedAt_idx" ON "EpisodeMetric"("episodeId", "observedAt");

-- CreateIndex
CREATE INDEX "EpisodeMetric_metricId_observedAt_idx" ON "EpisodeMetric"("metricId", "observedAt");

-- CreateIndex
CREATE INDEX "EpisodeMetric_experimentId_variantId_idx" ON "EpisodeMetric"("experimentId", "variantId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_path_createdAt_idx" ON "AuditLog"("path", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_statusCode_createdAt_idx" ON "AuditLog"("statusCode", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_backlogItemId_key" ON "Episode"("backlogItemId");

-- CreateIndex
CREATE INDEX "Episode_seasonId_idx" ON "Episode"("seasonId");

-- CreateIndex
CREATE INDEX "Episode_scheduledFor_idx" ON "Episode"("scheduledFor");

-- CreateIndex
CREATE INDEX "Episode_templateVersion_idx" ON "Episode"("templateVersion");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSlot" ADD CONSTRAINT "CalendarSlot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSlot" ADD CONSTRAINT "CalendarSlot_backlogItemId_fkey" FOREIGN KEY ("backlogItemId") REFERENCES "BacklogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarSlot" ADD CONSTRAINT "CalendarSlot_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklogItem" ADD CONSTRAINT "BacklogItem_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklogItem" ADD CONSTRAINT "BacklogItem_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metric" ADD CONSTRAINT "Metric_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperimentVariant" ADD CONSTRAINT "ExperimentVariant_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_backlogItemId_fkey" FOREIGN KEY ("backlogItemId") REFERENCES "BacklogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeMetric" ADD CONSTRAINT "EpisodeMetric_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeMetric" ADD CONSTRAINT "EpisodeMetric_metricId_fkey" FOREIGN KEY ("metricId") REFERENCES "Metric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeMetric" ADD CONSTRAINT "EpisodeMetric_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeMetric" ADD CONSTRAINT "EpisodeMetric_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ExperimentVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
