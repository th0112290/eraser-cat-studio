import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createGeneratedPackSidecarPlaceholderRenderer,
  orchestrateRenderEpisode
} from "@ec/render-orchestrator";
import {
  assertCharacterPipelineAccepted,
  resolveCharacterPipelineAcceptance,
  resolveGeneratedCharacterPackPath
} from "./generatedCharacterPipeline";

type CliArgs = {
  characterId: string;
  outputPath?: string;
  episodeId?: string;
  dryRun: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const OUTPUT_ROOT = path.join(REPO_ROOT, "out");

function parseArgs(argv: string[]): CliArgs {
  const map = new Map<string, string>();
  let dryRun = false;

  for (const entry of argv) {
    if (entry === "--dry-run") {
      dryRun = true;
      continue;
    }
    const match = entry.match(/^--([^=]+)=(.*)$/);
    if (!match) {
      continue;
    }
    map.set(match[1], match[2]);
  }

  const characterId = map.get("character-id")?.trim() || "";
  if (!characterId) {
    throw new Error(
      "usage: pnpm -C packages/image-gen exec tsx src/renderAcceptedCharacterSidecarPlaceholder.ts -- --character-id=<id> [--output=out/<id>.sidecar.mp4] [--episode-id=<episode>] [--dry-run]"
    );
  }

  return {
    characterId,
    outputPath: map.get("output")?.trim() || undefined,
    episodeId: map.get("episode-id")?.trim() || undefined,
    dryRun
  };
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function buildSidecarShotsDoc(characterId: string, episodeId: string) {
  return {
    schema_version: "1.0",
    episode: {
      episode_id: episodeId,
      bible_ref: "channel_bible:generated-sidecar-validation"
    },
    render: {
      fps: 30,
      width: 1920,
      height: 1080,
      safe_area: {
        x: 0.05,
        y: 0.05,
        w: 0.9,
        h: 0.9
      },
      coord_space: "normalized"
    },
    shots: [
      {
        shot_id: "sidecar_shot_001",
        shot_type: "broll",
        render_mode: "generative_broll",
        beat_ids: ["sidecar_beat_001"],
        narration: "Character-focused b-roll insert request.",
        start_frame: 0,
        duration_frames: 48,
        set: {
          set_id: "sidecar_broll",
          variant: "default",
          layers: {
            bg_far: "none",
            bg_mid: "none",
            bg_near: "none",
            fg_mask: "none"
          }
        },
        camera: {
          preset: "slow_push",
          keyframes: [
            { f: 0, x: 0, y: 0, zoom: 1, rotate_deg: 0 },
            { f: 47, x: 0.01, y: -0.01, zoom: 1.05, rotate_deg: 0 }
          ]
        },
        character: {
          pack_id: characterId,
          layer: "between_bg_mid_and_near",
          transform: { x: 0.38, y: 0.8, scale: 0.98, flip_x: false },
          tracks: {
            pos_path: [{ f: 0, x: 0.38, y: 0.8, interp: "ease" }],
            action_track: [{ f: 0, clip: "idle_talk", weight: 1 }],
            expression_track: [{ f: 0, expression: "neutral" }],
            look_track: [{ f: 0, target: "camera" }],
            view_track: [{ f: 0, view: "threeQuarter" }]
          }
        },
        qc_expectations: {
          must_keep_character_in_frame: true,
          allow_pointing_fail_fallback: true
        }
      },
      {
        shot_id: "sidecar_shot_002",
        shot_type: "reaction",
        render_mode: "generative_i2v",
        beat_ids: ["sidecar_beat_002"],
        narration: "Front still to video contract validation.",
        start_frame: 48,
        duration_frames: 42,
        set: {
          set_id: "sidecar_i2v",
          variant: "default",
          layers: {
            bg_far: "none",
            bg_mid: "none",
            bg_near: "none",
            fg_mask: "none"
          }
        },
        camera: {
          preset: "static",
          keyframes: [{ f: 0, x: 0, y: 0, zoom: 1, rotate_deg: 0 }]
        },
        character: {
          pack_id: characterId,
          layer: "between_bg_mid_and_near",
          transform: { x: 0.36, y: 0.8, scale: 0.98, flip_x: false },
          tracks: {
            pos_path: [{ f: 0, x: 0.36, y: 0.8, interp: "ease" }],
            action_track: [{ f: 0, clip: "idle_talk", weight: 1 }],
            expression_track: [{ f: 0, expression: "happy" }],
            look_track: [{ f: 0, target: "camera" }],
            view_track: [{ f: 0, view: "front" }]
          }
        },
        qc_expectations: {
          must_keep_character_in_frame: true,
          allow_pointing_fail_fallback: true
        }
      },
      {
        shot_id: "sidecar_shot_003",
        shot_type: "transition",
        render_mode: "generative_s2v",
        beat_ids: ["sidecar_beat_003"],
        narration: "Profile style to video contract validation.",
        start_frame: 90,
        duration_frames: 42,
        set: {
          set_id: "sidecar_s2v",
          variant: "default",
          layers: {
            bg_far: "none",
            bg_mid: "none",
            bg_near: "none",
            fg_mask: "none"
          }
        },
        camera: {
          preset: "static",
          keyframes: [{ f: 0, x: 0, y: 0, zoom: 1, rotate_deg: 0 }]
        },
        character: {
          pack_id: characterId,
          layer: "between_bg_mid_and_near",
          transform: { x: 0.42, y: 0.8, scale: 0.95, flip_x: false },
          tracks: {
            pos_path: [{ f: 0, x: 0.42, y: 0.8, interp: "ease" }],
            action_track: [{ f: 0, clip: "move", weight: 1 }],
            expression_track: [{ f: 0, expression: "neutral" }],
            look_track: [{ f: 0, target: "camera" }],
            view_track: [{ f: 0, view: "profile" }]
          }
        },
        qc_expectations: {
          must_keep_character_in_frame: true,
          allow_pointing_fail_fallback: true
        }
      }
    ]
  };
}

function buildSidecarShotsPath(characterId: string, episodeId: string): string {
  const shotsPath = path.join(OUTPUT_ROOT, `${characterId}.${episodeId}.sidecar-shots.json`);
  writeJson(shotsPath, buildSidecarShotsDoc(characterId, episodeId));
  return shotsPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const episodeId = args.episodeId ?? `${args.characterId}-sidecar-placeholder`;

  assertCharacterPipelineAccepted(args.characterId);
  const acceptance = resolveCharacterPipelineAcceptance(args.characterId);
  const packPath = resolveGeneratedCharacterPackPath(args.characterId);
  const shotsPath = buildSidecarShotsPath(args.characterId, episodeId);
  const outputPath = args.outputPath?.trim()
    ? resolveCliPath(args.outputPath)
    : path.join(OUTPUT_ROOT, `${args.characterId}.sidecar-placeholder${args.dryRun ? ".dryrun" : ""}.mp4`);

  const render = await orchestrateRenderEpisode({
    shotsPath,
    outputPath,
    dryRun: args.dryRun,
    shotSidecarRenderer: createGeneratedPackSidecarPlaceholderRenderer()
  });

  console.log(
    JSON.stringify(
      {
        characterId: args.characterId,
        episodeId,
        packPath,
        acceptanceStatus: acceptance.status,
        shotsPath,
        render
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
