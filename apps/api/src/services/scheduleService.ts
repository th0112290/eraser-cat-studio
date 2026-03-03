import { BacklogStatus, JobType, SlotStatus } from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { JobsOptions, Queue } from "bullmq";
import { estimateJobCost } from "../../../../packages/ops/src/index";

const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_WEEKLY_TARGET = 3;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_BACKOFF_MS = 1000;
const MAX_RETRY_ATTEMPTS = 5;
const TARGET_WEEKDAYS = new Set<number>([1, 3, 5]);

type JsonRecord = Record<string, unknown>;

export type EpisodeJobPayload = {
  jobDbId: string;
  episodeId: string;
  schemaChecks?: Array<{ schemaId: string; data: Prisma.InputJsonValue }>;
};

export type BuildScheduleDatesInput = {
  startDate: Date;
  days: number;
  episodesPerWeek: number;
};

export type AutoScheduleOptions = {
  seasonId: string;
  startDate?: Date;
  days?: number;
  episodesPerWeek?: number;
  maxAttempts?: number;
  backoffMs?: number;
  jobType?: JobType;
  targetDurationSec?: number;
};

export type AutoScheduleResult = {
  seasonId: string;
  channelId: string;
  windowStart: string;
  windowEnd: string;
  plannedDates: string[];
  slotsCreated: number;
  episodesCreated: number;
  jobsEnqueued: number;
  skippedFilledSlots: number;
  skippedNoBacklog: number;
  items: Array<{
    slotId: string;
    backlogItemId: string;
    episodeId: string;
    jobId: string;
    bullmqJobId: string;
    scheduledDate: string;
    topic: string;
  }>;
};

export type AutoScheduleDeps = {
  prisma: PrismaClient;
  queue: Queue<EpisodeJobPayload>;
  queueName: string;
};

export class ScheduleServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function toStartOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(base: Date, days: number): Date {
  const shifted = new Date(base);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toPositiveInt(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ScheduleServiceError(400, `${field} must be a positive integer`);
  }
  return value;
}

function serializeDetails(details: JsonRecord): Prisma.InputJsonValue {
  return details as Prisma.InputJsonValue;
}

export function buildScheduleDates(input: BuildScheduleDatesInput): Date[] {
  const days = toPositiveInt(input.days, "days");
  const episodesPerWeek = toPositiveInt(input.episodesPerWeek, "episodesPerWeek");
  const normalizedStart = toStartOfUtcDay(input.startDate);

  const primary: Date[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const candidate = addUtcDays(normalizedStart, offset);
    if (TARGET_WEEKDAYS.has(candidate.getUTCDay())) {
      primary.push(candidate);
    }
  }

  if (primary.length >= episodesPerWeek) {
    return primary.slice(0, episodesPerWeek);
  }

  const fallback = [...primary];
  const known = new Set(fallback.map((item) => dateKey(item)));

  for (let offset = 0; offset < days && fallback.length < episodesPerWeek; offset += 1) {
    const candidate = addUtcDays(normalizedStart, offset);
    const key = dateKey(candidate);
    if (!known.has(key)) {
      known.add(key);
      fallback.push(candidate);
    }
  }

  return fallback;
}

async function enqueueWithIdempotency(
  queue: Queue<EpisodeJobPayload>,
  name: string,
  payload: EpisodeJobPayload,
  maxAttempts: number,
  backoffMs: number
) {
  const options: JobsOptions = {
    jobId: payload.jobDbId,
    attempts: maxAttempts,
    backoff: {
      type: "exponential",
      delay: backoffMs
    },
    removeOnComplete: false,
    removeOnFail: false
  };

  try {
    return await queue.add(name, payload, options);
  } catch (error) {
    const existingJob = await queue.getJob(payload.jobDbId);
    if (existingJob) {
      return existingJob;
    }
    throw error;
  }
}

export async function autoScheduleSeason(deps: AutoScheduleDeps, options: AutoScheduleOptions): Promise<AutoScheduleResult> {
  const days = toPositiveInt(options.days ?? DEFAULT_WINDOW_DAYS, "days");
  const maxAttempts = Math.min(
    toPositiveInt(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, "maxAttempts"),
    MAX_RETRY_ATTEMPTS
  );
  const backoffMs = toPositiveInt(options.backoffMs ?? DEFAULT_BACKOFF_MS, "backoffMs");
  const targetDurationSec = toPositiveInt(options.targetDurationSec ?? 600, "targetDurationSec");
  const startDate = toStartOfUtcDay(options.startDate ?? new Date());

  const season = await deps.prisma.season.findUnique({
    where: { id: options.seasonId }
  });

  if (!season) {
    throw new ScheduleServiceError(404, "Season not found");
  }

  if (season.endDate < season.startDate) {
    throw new ScheduleServiceError(400, "Season date range is invalid");
  }

  const episodesPerWeek = toPositiveInt(options.episodesPerWeek ?? season.episodesPerWeek ?? DEFAULT_WEEKLY_TARGET, "episodesPerWeek");
  const plannedDates = buildScheduleDates({
    startDate,
    days,
    episodesPerWeek
  });
  const plannedKeys = plannedDates.map((item) => dateKey(item));

  const existingSlots = await deps.prisma.calendarSlot.findMany({
    where: {
      seasonId: season.id,
      scheduledDate: {
        in: plannedDates
      }
    },
    select: {
      id: true,
      scheduledDate: true
    }
  });

  const existingSlotKeys = new Set(existingSlots.map((slot) => dateKey(slot.scheduledDate)));

  let slotsCreated = 0;

  for (const scheduledDate of plannedDates) {
    const key = dateKey(scheduledDate);
    if (existingSlotKeys.has(key)) {
      continue;
    }

    await deps.prisma.calendarSlot.create({
      data: {
        seasonId: season.id,
        scheduledDate,
        status: SlotStatus.OPEN
      }
    });

    slotsCreated += 1;
  }

  const slots = await deps.prisma.calendarSlot.findMany({
    where: {
      seasonId: season.id,
      scheduledDate: {
        in: plannedDates
      }
    },
    orderBy: {
      scheduledDate: "asc"
    }
  });

  const [seasonBacklog, generalBacklog] = await Promise.all([
    deps.prisma.backlogItem.findMany({
      where: {
        channelId: season.channelId,
        seasonId: season.id,
        status: BacklogStatus.PENDING,
        episode: null
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
    }),
    deps.prisma.backlogItem.findMany({
      where: {
        channelId: season.channelId,
        seasonId: null,
        status: BacklogStatus.PENDING,
        episode: null
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
    })
  ]);

  const backlogPool = [...seasonBacklog, ...generalBacklog];
  const backlogById = new Map(backlogPool.map((item) => [item.id, item] as const));
  const usedBacklog = new Set<string>();

  let backlogCursor = 0;
  let episodesCreated = 0;
  let jobsEnqueued = 0;
  let skippedFilledSlots = 0;
  let skippedNoBacklog = 0;

  const items: AutoScheduleResult["items"] = [];

  for (const slot of slots) {
    if (slot.episodeId) {
      skippedFilledSlots += 1;
      continue;
    }

    let backlog = slot.backlogItemId ? backlogById.get(slot.backlogItemId) : undefined;
    if (backlog && usedBacklog.has(backlog.id)) {
      backlog = undefined;
    }

    while (!backlog && backlogCursor < backlogPool.length) {
      const candidate = backlogPool[backlogCursor];
      backlogCursor += 1;
      if (usedBacklog.has(candidate.id)) {
        continue;
      }
      backlog = candidate;
      break;
    }

    if (!backlog) {
      skippedNoBacklog += 1;
      continue;
    }

    usedBacklog.add(backlog.id);

    const scheduledDate = toStartOfUtcDay(slot.scheduledDate);

    const created = await deps.prisma.$transaction(async (tx) => {
      const existingEpisode = await tx.episode.findUnique({
        where: { backlogItemId: backlog!.id }
      });

      if (existingEpisode) {
        await tx.calendarSlot.update({
          where: { id: slot.id },
          data: {
            status: SlotStatus.SCHEDULED,
            backlogItemId: backlog!.id,
            episodeId: existingEpisode.id
          }
        });

        return {
          reused: true as const,
          episodeId: existingEpisode.id,
          jobId: null,
          topic: existingEpisode.topic,
          scheduledDate
        };
      }

      const episode = await tx.episode.create({
        data: {
          channelId: season.channelId,
          seasonId: season.id,
          backlogItemId: backlog!.id,
          topic: backlog!.title,
          scheduledFor: scheduledDate,
          targetDurationSec
        }
      });

      const job = await tx.job.create({
        data: {
          episodeId: episode.id,
          type: options.jobType ?? JobType.GENERATE_BEATS,
          status: "QUEUED",
          progress: 0,
          maxAttempts,
          retryBackoffMs: backoffMs,
          ...estimateJobCost({
            estimatedApiCalls: 3,
            estimatedRenderSeconds: 0,
            estimatedAudioSeconds: 0
          })
        }
      });

      await tx.jobLog.create({
        data: {
          jobId: job.id,
          level: "info",
          message: "Transition -> QUEUED",
          details: serializeDetails({
            source: "schedule:auto",
            maxAttempts,
            backoffMs
          })
        }
      });

      await tx.backlogItem.update({
        where: { id: backlog!.id },
        data: {
          status: BacklogStatus.SCHEDULED,
          seasonId: season.id
        }
      });

      await tx.calendarSlot.update({
        where: { id: slot.id },
        data: {
          status: SlotStatus.SCHEDULED,
          backlogItemId: backlog!.id,
          episodeId: episode.id
        }
      });

      return {
        reused: false as const,
        episodeId: episode.id,
        jobId: job.id,
        topic: episode.topic,
        scheduledDate
      };
    });

    if (created.reused || !created.jobId) {
      skippedFilledSlots += 1;
      continue;
    }

    episodesCreated += 1;

    try {
      const queuedJob = await enqueueWithIdempotency(
        deps.queue,
        options.jobType ?? JobType.GENERATE_BEATS,
        {
          jobDbId: created.jobId,
          episodeId: created.episodeId,
          schemaChecks: []
        },
        maxAttempts,
        backoffMs
      );

      const bullmqJobId = String(queuedJob.id);

      await deps.prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: created.jobId! },
          data: {
            status: "QUEUED",
            bullmqJobId,
            lastError: null,
            finishedAt: null
          }
        });

        await tx.jobLog.create({
          data: {
            jobId: created.jobId!,
            level: "info",
            message: "Transition -> ENQUEUED",
            details: serializeDetails({
              source: "schedule:auto",
              queueName: deps.queueName,
              bullmqJobId,
              maxAttempts,
              backoffMs,
              strategy: "exponential"
            })
          }
        });
      });

      jobsEnqueued += 1;

      items.push({
        slotId: slot.id,
        backlogItemId: backlog.id,
        episodeId: created.episodeId,
        jobId: created.jobId,
        bullmqJobId,
        scheduledDate: dateKey(created.scheduledDate),
        topic: created.topic
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      await deps.prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: created.jobId! },
          data: {
            status: "FAILED",
            lastError: stack ?? message,
            finishedAt: new Date()
          }
        });

        await tx.jobLog.create({
          data: {
            jobId: created.jobId!,
            level: "error",
            message: "Transition -> FAILED",
            details: serializeDetails({ source: "schedule:auto", error: message, stack: stack ?? null })
          }
        });
      });

      throw new ScheduleServiceError(500, `Failed to enqueue scheduled job: ${message}`);
    }
  }

  const windowEnd = addUtcDays(startDate, days - 1);

  return {
    seasonId: season.id,
    channelId: season.channelId,
    windowStart: dateKey(startDate),
    windowEnd: dateKey(windowEnd),
    plannedDates: plannedKeys,
    slotsCreated,
    episodesCreated,
    jobsEnqueued,
    skippedFilledSlots,
    skippedNoBacklog,
    items
  };
}



