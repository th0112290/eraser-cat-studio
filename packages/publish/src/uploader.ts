import { createHash } from "node:crypto";
import type { SeoMetadata, UploadResult } from "./types";

export type YouTubeUploadInput = {
  episodeId: string;
  plannedPublishAt: Date;
  seo: SeoMetadata;
  manifestPath: string;
  thumbnailPath: string;
  renderOutputPath?: string;
};

export interface YouTubeUploader {
  upload(input: YouTubeUploadInput): Promise<UploadResult>;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export class MockYouTubeUploader implements YouTubeUploader {
  async upload(input: YouTubeUploadInput): Promise<UploadResult> {
    const seed = [
      input.episodeId,
      input.plannedPublishAt.toISOString(),
      input.seo.title,
      input.manifestPath,
      input.thumbnailPath
    ].join("|");

    const externalVideoId = `mock_${shortHash(seed)}`;
    const uploadedAt = new Date().toISOString();

    return {
      provider: "youtube-mock",
      externalVideoId,
      watchUrl: `https://youtube.mock/watch?v=${externalVideoId}`,
      uploadedAt,
      status: "UPLOADED"
    };
  }
}
