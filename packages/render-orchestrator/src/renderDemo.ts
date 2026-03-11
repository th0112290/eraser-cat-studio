import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orchestrateRenderEpisode } from "./orchestrateRender";

function readFlagValue(flagName: string): string | undefined {
  const exactMatch = process.argv.find((arg) => arg.startsWith(`${flagName}=`));
  if (exactMatch) {
    return exactMatch.slice(flagName.length + 1);
  }
  const index = process.argv.indexOf(flagName);
  if (index >= 0 && typeof process.argv[index + 1] === "string") {
    return process.argv[index + 1];
  }
  return undefined;
}

function resolveDemoFixturePath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../fixtures/demo-shots.json");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const profileResolverModuleArg = readFlagValue("--profile-resolver-module");
  const profileResolverAuto = process.argv.includes("--profile-resolver-auto");
  const profileResolverWorkspaceRootArg = readFlagValue("--profile-resolver-workspace-root");
  const profileResolverModulePath = profileResolverModuleArg
    ? profileResolverModuleArg === "auto"
      ? "auto"
      : path.resolve(process.cwd(), profileResolverModuleArg)
    : profileResolverAuto
      ? "auto"
      : undefined;
  const profileResolverWorkspaceRoot = profileResolverWorkspaceRootArg
    ? path.resolve(process.cwd(), profileResolverWorkspaceRootArg)
    : undefined;
  const fixturePath = resolveDemoFixturePath();
  const repoShotsPath = path.resolve(process.cwd(), "../../out/shots.json");
  const shotsPath = dryRun && !fs.existsSync(repoShotsPath) ? fixturePath : undefined;

  const result = await orchestrateRenderEpisode({
    dryRun,
    shotsPath,
    profileResolverModulePath,
    profileResolverWorkspaceRoot,
    debugOverlay: {
      enabled: true,
      sourceLabel: "render-demo"
    }
  });

  console.log(`render:status ${result.status}`);
  console.log(`render:sequenceCount ${result.sequenceCount}`);
  console.log(`render:subtitleCount ${result.subtitleCount}`);
  console.log(`render:totalFrames ${result.totalFrames}`);
  console.log(`render:qcPassed ${result.qcPassed ? "yes" : "no"}`);
  console.log(`render:qcErrors ${result.qcErrorCount}`);
  console.log(`render:qcWarnings ${result.qcWarningCount}`);
  console.log(`render:fallbackSteps ${result.fallbackStepsApplied.join(",") || "none"}`);
  console.log(`render:profileResolverSources ${result.profileResolver?.resolverSources.join(",") || "none"}`);
  console.log(`render:profileResolverIds ${result.profileResolver?.resolverIds.join(",") || "none"}`);
  console.log(`render:profileResolverModule ${result.profileResolver?.resolverModulePaths.join(",") || "none"}`);
  console.log(`render:profileResolverWorkspaceRoot ${profileResolverWorkspaceRoot ?? "none"}`);
  console.log(`render:output ${result.outputPath}`);
  console.log(`render:srt ${result.srtPath}`);
  console.log(`render:qc ${result.qcReportPath}`);
  console.log(`render:log ${result.renderLogPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
