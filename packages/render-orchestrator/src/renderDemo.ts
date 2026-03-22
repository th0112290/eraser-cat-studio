import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orchestrateRenderEpisode } from "./orchestrateRender";

function resolveDemoFixturePath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../fixtures/demo-shots.json");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const fixturePath = resolveDemoFixturePath();
  const shotsPath = dryRun ? fixturePath : undefined;

  const result = await orchestrateRenderEpisode({
    dryRun,
    shotsPath,
    allowSyntheticChartData: true
  });

  console.log(`render:status ${result.status}`);
  console.log(`render:sequenceCount ${result.sequenceCount}`);
  console.log(`render:subtitleCount ${result.subtitleCount}`);
  console.log(`render:totalFrames ${result.totalFrames}`);
  console.log(`render:qcPassed ${result.qcPassed ? "yes" : "no"}`);
  console.log(`render:qcErrors ${result.qcErrorCount}`);
  console.log(`render:qcWarnings ${result.qcWarningCount}`);
  console.log(`render:fallbackSteps ${result.fallbackStepsApplied.join(",") || "none"}`);
  console.log(`render:output ${result.outputPath}`);
  console.log(`render:srt ${result.srtPath}`);
  console.log(`render:qc ${result.qcReportPath}`);
  console.log(`render:regression ${result.episodeRegressionReportPath}`);
  console.log(`render:log ${result.renderLogPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
