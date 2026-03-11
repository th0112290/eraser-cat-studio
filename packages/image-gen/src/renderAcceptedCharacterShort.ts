import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { orchestrateRenderEpisode } from "@ec/render-orchestrator";
import {
  assertCharacterPipelineAccepted,
  resolveCharacterPipelineAcceptance,
  resolveGeneratedCharacterPackPath
} from "./generatedCharacterPipeline";

type CliArgs = {
  characterId: string;
  shotsPath?: string;
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
      "usage: pnpm -C packages/image-gen exec tsx src/renderAcceptedCharacterShort.ts -- --character-id=<id> [--shots=out/shots.json] [--output=out/<id>.accepted.mp4] [--episode-id=<episode>] [--dry-run]"
    );
  }

  return {
    characterId,
    shotsPath: map.get("shots")?.trim() || undefined,
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

function defaultViewForShotType(shotType: string): "front" | "threeQuarter" | "profile" {
  if (shotType === "transition") {
    return "profile";
  }
  if (shotType === "reaction" || shotType === "broll") {
    return "threeQuarter";
  }
  return "front";
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
  const rewrittenPath = path.join(parsed.dir, `${parsed.name}.${characterId}.accepted.json`);
  writeJson(rewrittenPath, doc);
  return rewrittenPath;
}

function buildAcceptedValidationShots(characterId: string, episodeId: string) {
  return {
    schema_version: "1.0",
    episode: {
      episode_id: episodeId,
      bible_ref: "channel_bible:generated-character-validation"
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
        shot_id: "accepted_shot_001",
        shot_type: "talk",
        render_mode: "deterministic",
        beat_ids: ["accepted_beat_001"],
        narration: "Generated character accepted front talking validation.",
        start_frame: 0,
        duration_frames: 48,
        set: {
          set_id: "accepted_front",
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
          transform: { x: 0.36, y: 0.79, scale: 0.98, flip_x: false },
          tracks: {
            pos_path: [{ f: 0, x: 0.36, y: 0.79, interp: "ease" }],
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
        shot_id: "accepted_shot_002",
        shot_type: "reaction",
        render_mode: "deterministic",
        beat_ids: ["accepted_beat_002"],
        narration: "Three quarter reaction validation.",
        start_frame: 48,
        duration_frames: 42,
        set: {
          set_id: "accepted_three_quarter",
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
            { f: 41, x: 0.01, y: -0.01, zoom: 1.04, rotate_deg: 0 }
          ]
        },
        character: {
          pack_id: characterId,
          layer: "between_bg_mid_and_near",
          transform: { x: 0.39, y: 0.79, scale: 0.98, flip_x: false },
          tracks: {
            pos_path: [
              { f: 0, x: 0.39, y: 0.79, interp: "ease" },
              { f: 41, x: 0.4, y: 0.79, interp: "ease" }
            ],
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
        shot_id: "accepted_shot_003",
        shot_type: "transition",
        render_mode: "deterministic",
        beat_ids: ["accepted_beat_003"],
        narration: "Profile turn validation.",
        start_frame: 90,
        duration_frames: 42,
        set: {
          set_id: "accepted_profile",
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

function buildAcceptedValidationShotsPath(characterId: string, episodeId: string): string {
  const shotsPath = path.join(OUTPUT_ROOT, `${characterId}.${episodeId}.accepted-shots.json`);
  writeJson(shotsPath, buildAcceptedValidationShots(characterId, episodeId));
  return shotsPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const episodeId = args.episodeId ?? `${args.characterId}-accepted-render`;

  assertCharacterPipelineAccepted(args.characterId);
  const acceptance = resolveCharacterPipelineAcceptance(args.characterId);
  const packPath = resolveGeneratedCharacterPackPath(args.characterId);
  const shotsPath = args.shotsPath
    ? rewriteShotsWithCharacterPack(args.shotsPath, args.characterId)
    : buildAcceptedValidationShotsPath(args.characterId, episodeId);
  const outputPath = args.outputPath?.trim()
    ? resolveCliPath(args.outputPath)
    : path.join(OUTPUT_ROOT, `${args.characterId}.accepted${args.dryRun ? ".dryrun" : ""}.mp4`);

  const render = await orchestrateRenderEpisode({
    shotsPath,
    outputPath,
    dryRun: args.dryRun
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
