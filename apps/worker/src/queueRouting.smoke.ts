import assert from "node:assert/strict";
import {
  BUILD_CHARACTER_PACK_JOB_NAME,
  closeEpisodeQueues,
  COMPILE_SHOTS_JOB_NAME,
  EPISODE_JOB_NAME,
  GENERATE_CHARACTER_ASSETS_JOB_NAME,
  getEpisodeQueueNameForJobName,
  HEAVY_QUEUE_NAME,
  QUEUE_NAME,
  RENDER_CHARACTER_PREVIEW_JOB_NAME,
  RENDER_EPISODE_JOB_NAME,
  RENDER_FINAL_JOB_NAME,
  RENDER_PREVIEW_JOB_NAME
} from "./queue";

assert.equal(getEpisodeQueueNameForJobName(EPISODE_JOB_NAME), QUEUE_NAME);
assert.equal(getEpisodeQueueNameForJobName(COMPILE_SHOTS_JOB_NAME), QUEUE_NAME);
assert.equal(getEpisodeQueueNameForJobName(GENERATE_CHARACTER_ASSETS_JOB_NAME), HEAVY_QUEUE_NAME);
assert.equal(getEpisodeQueueNameForJobName(BUILD_CHARACTER_PACK_JOB_NAME), HEAVY_QUEUE_NAME);
assert.equal(getEpisodeQueueNameForJobName(RENDER_CHARACTER_PREVIEW_JOB_NAME), HEAVY_QUEUE_NAME);
assert.equal(getEpisodeQueueNameForJobName(RENDER_PREVIEW_JOB_NAME), HEAVY_QUEUE_NAME);
assert.equal(getEpisodeQueueNameForJobName(RENDER_FINAL_JOB_NAME), HEAVY_QUEUE_NAME);
assert.equal(getEpisodeQueueNameForJobName(RENDER_EPISODE_JOB_NAME), HEAVY_QUEUE_NAME);

console.log("[worker-queue-routing-smoke] PASS");
await closeEpisodeQueues();
