-- CreateEnum
CREATE TYPE "AgentSuggestionType" AS ENUM ('DIRECTOR', 'QA_INSPECTOR', 'TEMPLATE_IMPROVER', 'HITL_REVIEW');

-- CreateEnum
CREATE TYPE "AgentSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

-- CreateTable
CREATE TABLE "AgentSuggestion" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT,
    "jobId" TEXT,
    "type" "AgentSuggestionType" NOT NULL,
    "status" "AgentSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSuggestion_episodeId_type_createdAt_idx" ON "AgentSuggestion"("episodeId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AgentSuggestion_status_createdAt_idx" ON "AgentSuggestion"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentSuggestion_jobId_idx" ON "AgentSuggestion"("jobId");

-- AddForeignKey
ALTER TABLE "AgentSuggestion" ADD CONSTRAINT "AgentSuggestion_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSuggestion" ADD CONSTRAINT "AgentSuggestion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
