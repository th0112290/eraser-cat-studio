import fs from "node:fs";
import path from "node:path";
import { generateSeoMetadata } from "./seo";
import { generateThumbnailFromFrame } from "./thumbnail";
import { MockYouTubeUploader, type YouTubeUploader } from "./uploader";
import type { PublishPipelineInput, PublishPipelineResult, UploadManifest } from "./types";

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readUploadManifest(manifestPath: string): UploadManifest {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as UploadManifest;
}

export async function createPublishManifest(
  input: PublishPipelineInput,
  uploader: YouTubeUploader = new MockYouTubeUploader()
): Promise<PublishPipelineResult> {
  const episodeDir = path.join(path.resolve(input.outputRootDir), input.episodeId);
  ensureDir(episodeDir);

  const seo = generateSeoMetadata({
    episodeId: input.episodeId,
    topic: input.topic,
    plannedPublishAt: input.plannedPublishAt
  });

  const thumbnail = generateThumbnailFromFrame({
    episodeId: input.episodeId,
    topic: input.topic,
    outputDir: episodeDir,
    sourceFramePath: input.sourceFramePath,
    templateName: input.thumbnailTemplateName
  });

  const manifestPath = path.join(episodeDir, "upload_manifest.json");

  const upload = await uploader.upload({
    episodeId: input.episodeId,
    plannedPublishAt: input.plannedPublishAt,
    seo,
    manifestPath,
    thumbnailPath: thumbnail.outputPath,
    renderOutputPath: input.renderOutputPath
  });

  const manifest: UploadManifest = {
    schemaVersion: "1.0",
    episodeId: input.episodeId,
    generatedAt: new Date().toISOString(),
    plannedPublishAt: input.plannedPublishAt.toISOString(),
    status: upload.status,
    seo,
    thumbnail,
    upload,
    artifacts: {
      renderOutputPath: input.renderOutputPath ? path.resolve(input.renderOutputPath) : null
    }
  };

  writeJson(manifestPath, manifest);

  return {
    manifestPath,
    manifest
  };
}
