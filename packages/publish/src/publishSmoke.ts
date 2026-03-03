import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublishManifest } from "./pipeline";
import { MockYouTubeUploader } from "./uploader";

function resolveDefaultOutputRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../out/publish");
}

async function main() {
  const episodeId = process.argv[2] ?? "episode_smoke";
  const topic = process.argv[3] ?? "Publish Pipeline Smoke Test";
  const publishAt = new Date("2026-03-09T09:00:00.000Z");

  const result = await createPublishManifest(
    {
      episodeId,
      topic,
      plannedPublishAt: publishAt,
      outputRootDir: resolveDefaultOutputRoot(),
      thumbnailTemplateName: "center_16_9"
    },
    new MockYouTubeUploader()
  );

  console.log(`publish:manifest ${result.manifestPath}`);
  console.log(`publish:status ${result.manifest.status}`);
  console.log(`publish:video ${result.manifest.upload.externalVideoId}`);
  console.log(`publish:url ${result.manifest.upload.watchUrl}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
