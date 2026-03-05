import type { JobsOptions, Queue } from "bullmq";

type EnqueueWithResilienceInput<T> = {
  queue: Queue<T>;
  name: string;
  payload: T & { jobDbId: string };
  maxAttempts: number;
  backoffMs: number;
  maxEnqueueRetries?: number;
  retryDelayMs?: number;
  redisUnavailableAsHttp503?: boolean;
};

type EnqueueWithResilienceResult<T> = {
  job: Awaited<ReturnType<Queue<T>["add"]>>;
  mode: "added" | "reused";
  attemptCount: number;
  errorSummary: string[];
};

type HttpError = Error & { statusCode: number };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRedisUnavailableError(error: unknown): boolean {
  const message = toErrorMessage(error);
  return (
    message.includes("Redis unavailable") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("Connection is closed")
  );
}

function makeHttpError(statusCode: number, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enqueueWithResilience<T>(
  input: EnqueueWithResilienceInput<T>
): Promise<EnqueueWithResilienceResult<T>> {
  const maxEnqueueRetries = Math.max(0, input.maxEnqueueRetries ?? 0);
  const retryDelayMs = Math.max(0, input.retryDelayMs ?? 0);
  const errors: string[] = [];

  const options: JobsOptions = {
    jobId: input.payload.jobDbId,
    attempts: input.maxAttempts,
    backoff: {
      type: "exponential",
      delay: input.backoffMs
    },
    removeOnComplete: false,
    removeOnFail: false
  };

  for (let attempt = 0; attempt <= maxEnqueueRetries; attempt += 1) {
    try {
      const job = await input.queue.add(input.name, input.payload, options);
      return {
        job,
        mode: "added",
        attemptCount: attempt + 1,
        errorSummary: errors
      };
    } catch (error) {
      const existingJob = await input.queue.getJob(input.payload.jobDbId);
      if (existingJob) {
        return {
          job: existingJob,
          mode: "reused",
          attemptCount: attempt + 1,
          errorSummary: [...errors, toErrorMessage(error)]
        };
      }

      const message = toErrorMessage(error);
      errors.push(message);
      const shouldRetry = attempt < maxEnqueueRetries;

      if (shouldRetry) {
        if (retryDelayMs > 0) {
          await delay(retryDelayMs);
        }
        continue;
      }

      if (input.redisUnavailableAsHttp503 && isRedisUnavailableError(error)) {
        throw makeHttpError(503, `Redis unavailable while enqueueing ${input.name}`);
      }
      throw error;
    }
  }

  throw new Error("enqueueWithResilience exhausted retries unexpectedly");
}
