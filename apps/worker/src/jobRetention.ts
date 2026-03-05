type KeepJobs = {
  age: number;
  count: number;
};

const COMPLETE_AGE_SEC = Number.parseInt(process.env.WORKER_QUEUE_RETAIN_COMPLETE_AGE_SEC ?? "86400", 10);
const COMPLETE_COUNT = Number.parseInt(process.env.WORKER_QUEUE_RETAIN_COMPLETE_COUNT ?? "1000", 10);
const FAIL_AGE_SEC = Number.parseInt(process.env.WORKER_QUEUE_RETAIN_FAIL_AGE_SEC ?? "604800", 10);
const FAIL_COUNT = Number.parseInt(process.env.WORKER_QUEUE_RETAIN_FAIL_COUNT ?? "5000", 10);

function clamp(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

export function workerQueueRetentionOptions(): {
  removeOnComplete: KeepJobs;
  removeOnFail: KeepJobs;
} {
  return {
    removeOnComplete: {
      age: clamp(COMPLETE_AGE_SEC, 86400),
      count: clamp(COMPLETE_COUNT, 1000)
    },
    removeOnFail: {
      age: clamp(FAIL_AGE_SEC, 604800),
      count: clamp(FAIL_COUNT, 5000)
    }
  };
}
