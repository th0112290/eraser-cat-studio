import fs from "node:fs";
import path from "node:path";
import type { Queue } from "bullmq";
import { JobStatus, JobType, type Prisma, type PrismaClient } from "@prisma/client";
import { REPO_ROOT } from "./queue";

type QueueState =
  | "active"
  | "waiting"
  | "delayed"
  | "prioritized"
  | "paused"
  | "waiting-children"
  | "completed"
  | "failed"
  | "unknown"
  | "missing"
  | "lookup_failed";

type ReconciliationTarget = {
  id: string;
  episodeId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  attemptsMade: number;
  bullmqJobId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type StaleCharacterJobReconciliationAction = {
  jobId: string;
  episodeId: string;
  previousStatus: JobStatus;
  nextStatus: JobStatus;
  queueState: QueueState;
  reasonCode: string;
  ageHours: number;
  updatedAt: string;
  bullmqJobId: string;
  manifestStatus: string | null;
};

export type StaleCharacterJobReconciliationSummary = {
  dryRun: boolean;
  staleAgeMinutes: number;
  scanned: number;
  changed: number;
  skippedActive: number;
  actions: StaleCharacterJobReconciliationAction[];
};

export type ReconcileStaleCharacterGenerationJobsInput = {
  prisma: PrismaClient;
  queue: Queue;
  staleAgeMs: number;
  dryRun?: boolean;
  maxRows?: number;
  log?: (message: string) => void;
  now?: Date;
};

type ReconciliationDecision = {
  nextStatus: JobStatus;
  reasonCode: string;
  progress: number;
  finishedAt: Date | null;
  lastError: string | null;
};

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => toPrismaJsonValue(item)) as Prisma.InputJsonValue;
  }
  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== undefined) {
        out[key] = toPrismaJsonValue(entry);
      }
    }
    return out;
  }
  return String(value);
}

function generationManifestPath(jobId: string): string {
  return path.join(REPO_ROOT, "out", "characters", "generations", jobId, "generation_manifest.json");
}

function readGenerationManifestStatus(jobId: string): string | null {
  const manifestPath = generationManifestPath(jobId);
  try {
    if (!fs.existsSync(manifestPath)) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return typeof parsed?.status === "string" && parsed.status.trim().length > 0 ? parsed.status.trim() : null;
  } catch {
    return null;
  }
}

function isSuccessfulGenerationManifestStatus(status: string | null): boolean {
  return status === "PENDING_HITL" || status === "AUTO_SELECTED" || status === "HITL_SELECTED";
}

function buildReconciledLastError(input: {
  existingLastError: string | null;
  queueState: QueueState;
  ageHours: number;
  reasonCode: string;
}): string {
  const note =
    `[reconciliation] Reclassified stale character generation job after ${input.ageHours.toFixed(1)}h ` +
    `with queueState=${input.queueState} reason=${input.reasonCode}.`;
  const existing = typeof input.existingLastError === "string" ? input.existingLastError.trim() : "";
  if (!existing) {
    return note;
  }
  if (existing.includes("[reconciliation]")) {
    return existing;
  }
  return `${existing}\n\n${note}`;
}

function resolveDecision(input: {
  queueState: QueueState;
  manifestStatus: string | null;
  existingLastError: string | null;
  ageHours: number;
  now: Date;
}): ReconciliationDecision | null {
  if (
    input.queueState === "active"
  ) {
    return null;
  }

  if (isSuccessfulGenerationManifestStatus(input.manifestStatus)) {
    return {
      nextStatus: JobStatus.SUCCEEDED,
      reasonCode: "manifest_ready",
      progress: 100,
      finishedAt: input.now,
      lastError: null
    };
  }

  if (
    input.queueState === "waiting" ||
    input.queueState === "delayed" ||
    input.queueState === "prioritized" ||
    input.queueState === "paused" ||
    input.queueState === "waiting-children"
  ) {
    return {
      nextStatus: JobStatus.QUEUED,
      reasonCode: `bullmq_${input.queueState}`,
      progress: 0,
      finishedAt: null,
      lastError: input.existingLastError
    };
  }

  if (input.queueState === "completed") {
    return {
      nextStatus: JobStatus.SUCCEEDED,
      reasonCode: "bullmq_completed",
      progress: 100,
      finishedAt: input.now,
      lastError: null
    };
  }

  if (
    input.queueState === "failed" ||
    input.queueState === "unknown" ||
    input.queueState === "missing" ||
    input.queueState === "lookup_failed"
  ) {
    const reasonCode =
      input.queueState === "failed"
        ? "bullmq_failed"
        : input.queueState === "lookup_failed"
          ? "bullmq_lookup_failed"
          : "bullmq_missing";
    return {
      nextStatus: JobStatus.FAILED,
      reasonCode,
      progress: 100,
      finishedAt: input.now,
      lastError: buildReconciledLastError({
        existingLastError: input.existingLastError,
        queueState: input.queueState,
        ageHours: input.ageHours,
        reasonCode
      })
    };
  }

  return null;
}

async function logReconciliation(
  prisma: PrismaClient,
  jobId: string,
  level: "info" | "warn",
  details: Record<string, unknown>
): Promise<void> {
  await prisma.jobLog.create({
    data: {
      jobId,
      level,
      message: "Reconciled stale character generation job",
      details: (toPrismaJsonValue(details) ?? {}) as Prisma.InputJsonValue
    }
  });
}

export async function reconcileStaleCharacterGenerationJobs(
  input: ReconcileStaleCharacterGenerationJobsInput
): Promise<StaleCharacterJobReconciliationSummary> {
  const now = input.now ?? new Date();
  const staleCutoff = new Date(now.getTime() - input.staleAgeMs);
  const staleAgeMinutes = Math.round(input.staleAgeMs / 60000);
  const dryRun = input.dryRun === true;
  const maxRows = Math.max(1, input.maxRows ?? 250);
  const log = input.log ?? (() => undefined);

  const rows = await input.prisma.job.findMany({
    where: {
      type: JobType.GENERATE_CHARACTER_ASSETS,
      status: JobStatus.RUNNING,
      updatedAt: { lt: staleCutoff }
    },
    orderBy: { updatedAt: "asc" },
    take: maxRows,
    select: {
      id: true,
      episodeId: true,
      type: true,
      status: true,
      progress: true,
      attemptsMade: true,
      bullmqJobId: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      finishedAt: true
    }
  });

  const summary: StaleCharacterJobReconciliationSummary = {
    dryRun,
    staleAgeMinutes,
    scanned: rows.length,
    changed: 0,
    skippedActive: 0,
    actions: []
  };

  for (const row of rows as ReconciliationTarget[]) {
    const bullmqJobId = typeof row.bullmqJobId === "string" && row.bullmqJobId.trim().length > 0 ? row.bullmqJobId : row.id;
    const ageHours = Math.max(0, (now.getTime() - row.updatedAt.getTime()) / (60 * 60 * 1000));
    const manifestStatus = readGenerationManifestStatus(row.id);

    let queueState: QueueState = "missing";
    let queueAttemptsMade = row.attemptsMade;

    try {
      const bullJob = await input.queue.getJob(bullmqJobId);
      if (bullJob) {
        const rawState = String(await bullJob.getState());
        queueState =
          rawState === "active" ||
          rawState === "waiting" ||
          rawState === "delayed" ||
          rawState === "prioritized" ||
          rawState === "paused" ||
          rawState === "waiting-children" ||
          rawState === "completed" ||
          rawState === "failed" ||
          rawState === "unknown"
            ? rawState
            : "unknown";
        if (typeof bullJob.attemptsMade === "number" && Number.isFinite(bullJob.attemptsMade)) {
          queueAttemptsMade = Math.max(queueAttemptsMade, bullJob.attemptsMade);
        }
      }
    } catch {
      queueState = "lookup_failed";
    }

    const decision = resolveDecision({
      queueState,
      manifestStatus,
      existingLastError: row.lastError,
      ageHours,
      now
    });

    if (!decision) {
      summary.skippedActive += 1;
      continue;
    }

    const action: StaleCharacterJobReconciliationAction = {
      jobId: row.id,
      episodeId: row.episodeId,
      previousStatus: row.status,
      nextStatus: decision.nextStatus,
      queueState,
      reasonCode: decision.reasonCode,
      ageHours,
      updatedAt: row.updatedAt.toISOString(),
      bullmqJobId,
      manifestStatus
    };
    summary.actions.push(action);

    if (!dryRun) {
      await input.prisma.job.update({
        where: { id: row.id },
        data: {
          status: decision.nextStatus,
          progress: decision.progress,
          attemptsMade: queueAttemptsMade,
          lastError: decision.lastError,
          finishedAt: decision.finishedAt
        }
      });

      await logReconciliation(
        input.prisma,
        row.id,
        decision.nextStatus === JobStatus.FAILED ? "warn" : "info",
        {
          source: "worker:stale-character-job-reconciliation",
          previousStatus: row.status,
          nextStatus: decision.nextStatus,
          queueState,
          bullmqJobId,
          updatedAt: row.updatedAt.toISOString(),
          ageHours: Number(ageHours.toFixed(2)),
          manifestStatus,
          reasonCode: decision.reasonCode
        }
      );
    }

    summary.changed += 1;
    log(
      `[worker] reconciled stale character job id=${row.id} next=${decision.nextStatus} ` +
        `queue=${queueState} reason=${decision.reasonCode} ageHours=${ageHours.toFixed(1)}`
    );
  }

  if (summary.scanned > 0 || summary.changed > 0) {
    log(
      `[worker] stale character job reconciliation scanned=${summary.scanned} changed=${summary.changed} ` +
        `skippedActive=${summary.skippedActive} dryRun=${summary.dryRun ? "1" : "0"} cutoffMinutes=${summary.staleAgeMinutes}`
    );
  }

  return summary;
}
