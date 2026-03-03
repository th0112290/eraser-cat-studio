export type SeoChapter = {
  startSec: number;
  title: string;
};

export type SeoMetadata = {
  title: string;
  description: string;
  tags: string[];
  chapters: SeoChapter[];
  pinnedComment: string;
};

export type ThumbnailCropTemplate = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ThumbnailArtifact = {
  sourceFramePath: string | null;
  outputPath: string;
  template: ThumbnailCropTemplate;
};

export type UploadStatus = "PLANNED" | "UPLOADED" | "FAILED";

export type UploadResult = {
  provider: "youtube-mock";
  externalVideoId: string;
  watchUrl: string;
  uploadedAt: string;
  status: UploadStatus;
};

export type UploadManifest = {
  schemaVersion: "1.0";
  episodeId: string;
  generatedAt: string;
  plannedPublishAt: string;
  status: UploadStatus;
  seo: SeoMetadata;
  thumbnail: ThumbnailArtifact;
  upload: UploadResult;
  artifacts: {
    renderOutputPath: string | null;
  };
};

export type PublishPipelineInput = {
  episodeId: string;
  topic: string;
  plannedPublishAt: Date;
  outputRootDir: string;
  sourceFramePath?: string;
  renderOutputPath?: string;
  thumbnailTemplateName?: string;
};

export type PublishPipelineResult = {
  manifestPath: string;
  manifest: UploadManifest;
};
