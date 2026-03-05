import path from "node:path";
import { fileURLToPath } from "node:url";
import { Queue } from "bullmq";
import type { EpisodeJobPayload as SharedEpisodeJobPayload } from "@ec/shared";
import { bootstrapEnv } from "./bootstrapEnv";
import { workerQueueRetentionOptions } from "./jobRetention";

bootstrapEnv();

export const QUEUE_NAME = "episode-jobs";

export const GENERATE_BEATS_JOB_NAME = "GENERATE_BEATS";
export const COMPILE_SHOTS_JOB_NAME = "COMPILE_SHOTS";
export const RENDER_PREVIEW_JOB_NAME = "RENDER_PREVIEW";
export const RENDER_FINAL_JOB_NAME = "RENDER_FINAL";
export const PACKAGE_OUTPUTS_JOB_NAME = "PACKAGE_OUTPUTS";
export const BUILD_CHARACTER_PACK_JOB_NAME = "BUILD_CHARACTER_PACK";
export const RENDER_CHARACTER_PREVIEW_JOB_NAME = "RENDER_CHARACTER_PREVIEW";
export const ASSET_INGEST_JOB_NAME = "ASSET_INGEST";
export const ASSET_QUEUE_NAME = "asset-ingest-jobs";
export const GENERATE_CHARACTER_ASSETS_JOB_NAME = "GENERATE_CHARACTER_ASSETS";

export const EPISODE_JOB_NAME = GENERATE_BEATS_JOB_NAME;
export const RENDER_EPISODE_JOB_NAME = "RENDER_EPISODE";

export const PIPELINE_JOB_NAMES = [
  GENERATE_BEATS_JOB_NAME,
  COMPILE_SHOTS_JOB_NAME,
  RENDER_PREVIEW_JOB_NAME,
  RENDER_FINAL_JOB_NAME,
  PACKAGE_OUTPUTS_JOB_NAME
] as const;

export type PipelineJobName = (typeof PIPELINE_JOB_NAMES)[number];

export const MAX_JOB_ATTEMPTS = 5;
export const DEFAULT_RETRY_BACKOFF_MS = 1000;

export const RENDER_COMPAT_JOB_NAMES = new Set<string>([
  RENDER_EPISODE_JOB_NAME,
  RENDER_PREVIEW_JOB_NAME,
  RENDER_FINAL_JOB_NAME
]);

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  throw new Error("[worker] REDIS_URL is required. Check repo-root .env");
}

export const REDIS_URL = redisUrl;
export const REDIS_CONNECTION = { url: REDIS_URL };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, "../../..");

export type EpisodeOutputPaths = {
  outDir: string;
  beatsPath: string;
  shotsPath: string;
  previewOutputPath: string;
  finalOutputPath: string;
  previewSrtPath: string;
  finalSrtPath: string;
  qcReportPath: string;
  previewRenderLogPath: string;
  finalRenderLogPath: string;
  mixPath: string;
  narrationPath: string;
  licenseLogPath: string;
  uploadManifestPath: string;
};

export function getEpisodeOutputPaths(episodeId: string): EpisodeOutputPaths {
  const outDir = path.join(REPO_ROOT, "out", episodeId);
  return {
    outDir,
    beatsPath: path.join(outDir, "beats.json"),
    shotsPath: path.join(outDir, "shots.json"),
    previewOutputPath: path.join(outDir, "preview.mp4"),
    finalOutputPath: path.join(outDir, "final.mp4"),
    previewSrtPath: path.join(outDir, "preview.srt"),
    finalSrtPath: path.join(outDir, "final.srt"),
    qcReportPath: path.join(outDir, "qc_report.json"),
    previewRenderLogPath: path.join(outDir, "render_log_preview.json"),
    finalRenderLogPath: path.join(outDir, "render_log_final.json"),
    mixPath: path.join(outDir, "mix.wav"),
    narrationPath: path.join(outDir, "narration.wav"),
    licenseLogPath: path.join(outDir, "license_log.json"),
    uploadManifestPath: path.join(outDir, "upload_manifest.json")
  };
}

export type {
  AssetIngestQueuePayload,
  CharacterAssetSelection,
  CharacterGenerationMode,
  CharacterGenerationPayload,
  CharacterGenerationProvider,
  CharacterGenerationSelection,
  CharacterGenerationView,
  CharacterPackJobPayload,
  EpisodeJobPayload,
  PipelineOptions,
  PipelineStoryOptions,
  RenderJobPayload
} from "@ec/shared";

export const queue = new Queue<SharedEpisodeJobPayload>(QUEUE_NAME, {
  connection: REDIS_CONNECTION,
  defaultJobOptions: {
    attempts: MAX_JOB_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: DEFAULT_RETRY_BACKOFF_MS
    },
    ...workerQueueRetentionOptions()
  }
});
