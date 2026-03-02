import "dotenv/config";
import { Queue } from "bullmq";

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
export const QUEUE_NAME = "episode-jobs";

export type EpisodeJobPayload = {
  jobDbId: string;
  episodeId: string;
  schemaChecks?: Array<{ schemaId: string; data: unknown }>;
};

export const queue = new Queue<EpisodeJobPayload>(QUEUE_NAME, {
  connection: { url: REDIS_URL }
});
