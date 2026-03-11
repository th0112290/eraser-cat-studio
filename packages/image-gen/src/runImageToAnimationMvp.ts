import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orchestrateRenderEpisode } from "@ec/render-orchestrator";
import {
  assertCharacterPipelineAccepted,
  resolveCharacterPipelineAcceptance,
  runDeterministicCharacterPipeline
} from "./generatedCharacterPipeline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

type CliArgs = {
  characterId: string;
  positivePrompt: string;
  negativePrompt?: string;
  frontSeed: number;
  shotsPath?: string;
  outputPath?: string;
  noRender: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const map = new Map<string, string>();
  let noRender = false;

  for (const entry of argv) {
    if (entry === "--no-render") {
      noRender = true;
      continue;
    }
    const match = entry.match(/^--([^=]+)=(.*)$/);
    if (!match) {
      continue;
    }
    map.set(match[1], match[2]);
  }

  const characterId = map.get("character-id")?.trim() || "";
  const positivePrompt = map.get("positive-prompt")?.trim() || "";
  const frontSeed = Number.parseInt(map.get("front-seed") ?? "", 10);
  if (!characterId || !positivePrompt || !Number.isFinite(frontSeed)) {
    throw new Error(
      "usage: pnpm -C packages/image-gen run pipeline:mvp -- --character-id=<id> --positive-prompt=\"...\" --front-seed=<n> [--negative-prompt=\"...\"] [--shots=out/shots.json] [--output=out/generated-episode.mp4] [--no-render]"
    );
  }

  return {
    characterId,
    positivePrompt,
    negativePrompt: map.get("negative-prompt")?.trim() || undefined,
    frontSeed,
    shotsPath: map.get("shots")?.trim() || undefined,
    outputPath: map.get("output")?.trim() || undefined,
    noRender
  };
}

function defaultViewForShotType(shotType: string): "front" | "threeQuarter" | "profile" {
  if (shotType === "transition") {
    return "profile";
  }
  if (shotType === "reaction" || shotType === "broll") {
    return "threeQuarter";
  }
  return "front";
}

function resolveCliPath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  const cwdResolved = path.resolve(process.cwd(), inputPath);
  if (fs.existsSync(cwdResolved)) {
    return cwdResolved;
  }
  return path.resolve(REPO_ROOT, inputPath);
}

function rewriteShotsWithCharacterPack(shotsPath: string, characterId: string): string {
  const absolutePath = resolveCliPath(shotsPath);
  const doc = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as {
    shots?: Array<{
      shot_type?: string;
      character?: {
        pack_id?: string;
        tracks?: Record<string, unknown>;
      };
    }>;
  };

  if (!Array.isArray(doc.shots)) {
    throw new Error(`invalid shots file: ${absolutePath}`);
  }

  for (const shot of doc.shots) {
    if (!shot.character) {
      continue;
    }
    shot.character.pack_id = characterId;
    const tracks = typeof shot.character.tracks === "object" && shot.character.tracks !== null ? shot.character.tracks : {};
    if (!Array.isArray((tracks as { view_track?: unknown }).view_track)) {
      (tracks as { view_track: Array<{ f: number; view: "front" | "threeQuarter" | "profile" }> }).view_track = [
        {
          f: 0,
          view: defaultViewForShotType(shot.shot_type ?? "talk")
        }
      ];
    }
    shot.character.tracks = tracks;
  }

  const parsed = path.parse(absolutePath);
  const rewrittenPath = path.join(parsed.dir, `${parsed.name}.${characterId}.generated.json`);
  fs.writeFileSync(rewrittenPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return rewrittenPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await runDeterministicCharacterPipeline({
    characterId: args.characterId,
    positivePrompt: args.positivePrompt,
    negativePrompt: args.negativePrompt,
    frontSeed: args.frontSeed
  });
  const acceptance = resolveCharacterPipelineAcceptance(args.characterId);

  const shotsPath = args.shotsPath ? rewriteShotsWithCharacterPack(args.shotsPath, args.characterId) : null;
  if (args.noRender || !shotsPath) {
    console.log(
      JSON.stringify(
        {
          characterId: args.characterId,
          manifestPath: path.join(manifest.root_dir, "manifest.json"),
          packPath: manifest.pack?.pack_path ?? null,
          qcReportPath: manifest.qc?.report_path ?? null,
          acceptanceStatus: acceptance.status,
          routedShotsPath: shotsPath
        },
        null,
        2
      )
    );
    return;
  }

  assertCharacterPipelineAccepted(args.characterId);
  const outputPath =
    (args.outputPath?.trim() ? resolveCliPath(args.outputPath) : path.join(path.dirname(shotsPath), `${args.characterId}.episode.mp4`));
  const render = await orchestrateRenderEpisode({
    shotsPath,
    outputPath: outputPath
  });

  console.log(
    JSON.stringify(
      {
        characterId: args.characterId,
        manifestPath: path.join(manifest.root_dir, "manifest.json"),
        packPath: manifest.pack?.pack_path ?? null,
        qcReportPath: manifest.qc?.report_path ?? null,
        acceptanceStatus: acceptance.status,
        routedShotsPath: shotsPath,
        render
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
