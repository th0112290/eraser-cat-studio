import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { orchestrateRenderEpisode } from "@ec/render-orchestrator";
import { buildGeneratedCharacterPack, runCharacterAnimationSafeQc } from "./generatedCharacterPipeline";
import { resolveMascotCompositionReferenceAsset, resolveMascotStyleReferenceAsset } from "./mascotReferenceBank";
import type {
  CharacterStillAsset,
  GeneratedCharacterExpression,
  GeneratedCharacterManifest,
  GeneratedCharacterViseme
} from "./generatedCharacterPipeline";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const CHARACTER_ID = "smoke-generated-rig";
const CHARACTER_ROOT = path.join(REPO_ROOT, "assets", "generated", "characters", CHARACTER_ID);
const OUTPUT_ROOT = path.join(REPO_ROOT, "out");

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function copyFixtureImage(sourcePath: string, targetPath: string): void {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function createAsset(input: {
  filePath: string;
  stage: CharacterStillAsset["stage"];
  workflow: CharacterStillAsset["workflow"];
  prompt: string;
  negativePrompt: string;
  seed: number;
  width: number;
  height: number;
  view?: CharacterStillAsset["view"];
  expression?: GeneratedCharacterExpression;
  viseme?: GeneratedCharacterViseme;
  parentAssetId?: string;
  approved?: boolean;
}): CharacterStillAsset {
  const fileName = path.basename(input.filePath);
  const metadataPath = `${input.filePath}.meta.json`;
  const assetId = [
    CHARACTER_ID,
    input.stage,
    input.view ?? input.expression ?? input.viseme ?? path.parse(fileName).name
  ]
    .filter(Boolean)
    .join("_");

  const asset: CharacterStillAsset = {
    schema_version: "1.0",
    asset_id: assetId,
    character_id: CHARACTER_ID,
    stage: input.stage,
    workflow: input.workflow,
    workflow_template_path: path.join(
      REPO_ROOT,
      "workflows",
      "comfy",
      "payloads",
      input.workflow === "generate_zimage" ? "workflow_generate_zimage.json" : "workflow_edit_kontext.json"
    ),
    workflow_version: input.workflow === "generate_zimage" ? "workflow_generate_zimage" : "workflow_edit_kontext",
    workflow_hash: `smoke-${input.workflow}`,
    request_hash: `smoke-${assetId}`,
    file_path: input.filePath,
    file_url: pathToFileURL(input.filePath).href,
    metadata_path: metadataPath,
    output_prefix: path.parse(fileName).name,
    prompt: input.prompt,
    negative_prompt: input.negativePrompt,
    seed: input.seed,
    width: input.width,
    height: input.height,
    ...(input.view ? { view: input.view } : {}),
    ...(input.expression ? { expression: input.expression } : {}),
    ...(input.viseme ? { viseme: input.viseme } : {}),
    ...(input.parentAssetId ? { parent_asset_id: input.parentAssetId } : {}),
    approved: input.approved ?? false,
    created_at: new Date().toISOString(),
    model_stack: input.workflow === "generate_zimage" ? ["ZImageTurbo"] : ["FLUX.1 Kontext Dev"],
    postprocess: [],
    repair_history: []
  };

  writeJson(metadataPath, asset);
  return asset;
}

function buildFixtureManifest(): GeneratedCharacterManifest {
  const frontReferenceAsset = resolveMascotStyleReferenceAsset("cat");
  const threeQuarterReferenceAsset = resolveMascotCompositionReferenceAsset("cat", "threeQuarter");
  const profileReferenceAsset = resolveMascotCompositionReferenceAsset("cat", "profile");
  if (!frontReferenceAsset || !threeQuarterReferenceAsset || !profileReferenceAsset) {
    throw new Error("Smoke fixture references are missing from refs/mascots/cat/bank.json");
  }

  const frontSource = frontReferenceAsset.filePath;
  const threeQuarterSource = threeQuarterReferenceAsset.filePath;
  const profileSource = profileReferenceAsset.filePath;
  const frontPrompt = "smoke fixture front master";
  const editPrompt = "smoke fixture derived variant";
  const negativePrompt = "none";

  const frontMasterPath = path.join(CHARACTER_ROOT, "front_master", "front_neutral_master.png");
  const frontViewPath = path.join(CHARACTER_ROOT, "views", "front_neutral.png");
  const threeQuarterViewPath = path.join(CHARACTER_ROOT, "views", "threeQuarter_neutral.png");
  const profileViewPath = path.join(CHARACTER_ROOT, "views", "profile_neutral.png");

  copyFixtureImage(frontSource, frontMasterPath);
  copyFixtureImage(frontSource, frontViewPath);
  copyFixtureImage(threeQuarterSource, threeQuarterViewPath);
  copyFixtureImage(profileSource, profileViewPath);

  const frontMaster = createAsset({
    filePath: frontMasterPath,
    stage: "front_master",
    workflow: "generate_zimage",
    prompt: frontPrompt,
    negativePrompt,
    seed: 1001,
    width: 1024,
    height: 1024,
    view: "front",
    approved: true
  });

  const frontView = createAsset({
    filePath: frontViewPath,
    stage: "view",
    workflow: "edit_kontext",
    prompt: editPrompt,
    negativePrompt,
    seed: 1002,
    width: 1024,
    height: 1024,
    view: "front",
    parentAssetId: frontMaster.asset_id,
    approved: true
  });

  const threeQuarterView = createAsset({
    filePath: threeQuarterViewPath,
    stage: "view",
    workflow: "edit_kontext",
    prompt: editPrompt,
    negativePrompt,
    seed: 1003,
    width: 1024,
    height: 1024,
    view: "threeQuarter",
    parentAssetId: frontMaster.asset_id,
    approved: true
  });

  const profileView = createAsset({
    filePath: profileViewPath,
    stage: "view",
    workflow: "edit_kontext",
    prompt: editPrompt,
    negativePrompt,
    seed: 1004,
    width: 1024,
    height: 1024,
    view: "profile",
    parentAssetId: frontMaster.asset_id,
    approved: true
  });

  const expressionSourceMap: Record<GeneratedCharacterExpression, string> = {
    neutral: frontSource,
    happy: frontSource,
    surprised: frontSource,
    blink: frontSource,
    angry: frontSource,
    sad: frontSource,
    thinking: frontSource
  };

  const expressions = {} as GeneratedCharacterManifest["expressions"];
  expressions.front = {};
  for (const expression of ["neutral", "happy", "surprised", "blink"] as const) {
    const filePath = path.join(CHARACTER_ROOT, "expressions", "front", `${expression}.png`);
    copyFixtureImage(expressionSourceMap[expression], filePath);
    expressions.front[expression] = createAsset({
      filePath,
      stage: "expression",
      workflow: "edit_kontext",
      prompt: `${editPrompt}:${expression}`,
      negativePrompt,
      seed: 1100 + Object.keys(expressions.front).length,
      width: 1024,
      height: 1024,
      view: "front",
      expression,
      parentAssetId: frontMaster.asset_id,
      approved: true
    });
  }

  const visemes = {} as GeneratedCharacterManifest["visemes"];
  visemes.front = {};
  for (const viseme of ["mouth_closed", "mouth_open_small", "mouth_open_wide", "mouth_round_o"] as const) {
    const filePath = path.join(CHARACTER_ROOT, "visemes", "front", `${viseme}.png`);
    copyFixtureImage(frontSource, filePath);
    visemes.front[viseme] = createAsset({
      filePath,
      stage: "viseme",
      workflow: "edit_kontext",
      prompt: `${editPrompt}:${viseme}`,
      negativePrompt,
      seed: 1200 + Object.keys(visemes.front).length,
      width: 1024,
      height: 1024,
      view: "front",
      viseme,
      parentAssetId: frontMaster.asset_id,
      approved: true
    });
  }

  const now = new Date().toISOString();
  return {
    schema_version: "1.0",
    character_id: CHARACTER_ID,
    created_at: now,
    updated_at: now,
    root_dir: CHARACTER_ROOT,
    species: "cat",
    approved_front_master: {
      asset_id: frontMaster.asset_id,
      file_path: frontMaster.file_path,
      approved_at: now
    },
    front_master: frontMaster,
    views: {
      front: frontView,
      threeQuarter: threeQuarterView,
      profile: profileView
    },
    expressions,
    visemes
  };
}

function buildShotGrammar(input: {
  requiredView: "front" | "threeQuarter" | "profile";
  cameraSize: "ecu" | "cu" | "mcu" | "ms" | "ws";
  cameraMotion: "hold" | "push" | "pan" | "tilt";
  actingIntent: string;
  educationalIntent: string;
  routeReason: string;
}) {
  return {
    camera_size: input.cameraSize,
    camera_motion: input.cameraMotion,
    acting_intent: input.actingIntent,
    emotion_curve: "flat" as const,
    primary_speaking_character: "host",
    required_view: input.requiredView,
    educational_intent: input.educationalIntent,
    insert_need: [] as string[],
    route_reason: input.routeReason
  };
}

function buildActing(input: {
  expression: GeneratedCharacterExpression;
  viseme?: GeneratedCharacterViseme;
  blinkFrame?: number;
  gestureCue?: string;
  gestureFrame?: number;
}) {
  return {
    blink_cues: input.blinkFrame === undefined ? [] : [{ f: input.blinkFrame, duration_frames: 3, intensity: 0.7 }],
    gesture_cues:
      input.gestureCue === undefined || input.gestureFrame === undefined
        ? []
        : [{ f: input.gestureFrame, cue: input.gestureCue, intensity: 0.45 }],
    look_cues: [{ f: 0, target: "viewer" as const, intensity: 0.8 }],
    expression_cues: [{ f: 0, expression: input.expression, intensity: 0.7 }],
    mouth_cues: [{ f: 0, viseme: input.viseme ?? "mouth_closed", intensity: 0.6 }]
  };
}

function writeFixtureManifest(): string {
  const manifest = buildFixtureManifest();
  const manifestPath = path.join(CHARACTER_ROOT, "manifest.json");
  writeJson(manifestPath, manifest);
  return manifestPath;
}

function buildSmokeShotsPath(): string {
  const shotsPath = path.join(OUTPUT_ROOT, "smoke-generated-character-shots.json");
  const shotsDoc = {
    schema_version: "1.0",
    episode: {
      episode_id: "smoke-generated-character",
      bible_ref: "channel_bible:smoke"
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
        shot_id: "shot_001",
        shot_type: "talk",
        render_mode: "deterministic",
        shot_grammar: buildShotGrammar({
          requiredView: "front",
          cameraSize: "mcu",
          cameraMotion: "hold",
          actingIntent: "steady_delivery",
          educationalIntent: "hook_context",
          routeReason: "generated_character_pipeline_smoke_front"
        }),
        acting: buildActing({
          expression: "happy",
          viseme: "mouth_open_small",
          blinkFrame: 18,
          gestureCue: "idle_shift",
          gestureFrame: 24
        }),
        beat_ids: ["beat_smoke_001"],
        start_frame: 0,
        duration_frames: 45,
        set: {
          set_id: "smoke_front",
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
          pack_id: CHARACTER_ID,
          layer: "between_bg_mid_and_near",
          transform: { x: 0.36, y: 0.78, scale: 0.98, flip_x: false },
          tracks: {
            pos_path: [{ f: 0, x: 0.36, y: 0.78, interp: "ease" }],
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
        shot_id: "shot_002",
        shot_type: "reaction",
        render_mode: "deterministic",
        shot_grammar: buildShotGrammar({
          requiredView: "threeQuarter",
          cameraSize: "ms",
          cameraMotion: "push",
          actingIntent: "quiet_reaction",
          educationalIntent: "context_hold",
          routeReason: "generated_character_pipeline_smoke_three_quarter"
        }),
        acting: buildActing({
          expression: "neutral",
          viseme: "mouth_closed",
          blinkFrame: 20
        }),
        beat_ids: ["beat_smoke_002"],
        start_frame: 45,
        duration_frames: 45,
        set: {
          set_id: "smoke_three_quarter",
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
            { f: 44, x: 0.01, y: -0.01, zoom: 1.04, rotate_deg: 0 }
          ]
        },
        character: {
          pack_id: CHARACTER_ID,
          layer: "between_bg_mid_and_near",
          transform: { x: 0.38, y: 0.79, scale: 0.98, flip_x: false },
          tracks: {
            pos_path: [
              { f: 0, x: 0.38, y: 0.79, interp: "ease" },
              { f: 44, x: 0.39, y: 0.79, interp: "ease" }
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
        shot_id: "shot_003",
        shot_type: "transition",
        render_mode: "deterministic",
        shot_grammar: buildShotGrammar({
          requiredView: "profile",
          cameraSize: "ms",
          cameraMotion: "hold",
          actingIntent: "profile_transition",
          educationalIntent: "bridge_transition",
          routeReason: "generated_character_pipeline_smoke_profile"
        }),
        acting: buildActing({
          expression: "neutral",
          viseme: "mouth_closed"
        }),
        beat_ids: ["beat_smoke_003"],
        start_frame: 90,
        duration_frames: 45,
        set: {
          set_id: "smoke_profile",
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
          pack_id: CHARACTER_ID,
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

  writeJson(shotsPath, shotsDoc);
  return shotsPath;
}

async function main() {
  const shouldRender = process.argv.includes("--render");
  writeFixtureManifest();

  const pack = await buildGeneratedCharacterPack({ characterId: CHARACTER_ID });
  const qc = await runCharacterAnimationSafeQc({ characterId: CHARACTER_ID });
  const manifest = readJson<GeneratedCharacterManifest>(path.join(CHARACTER_ROOT, "manifest.json"));
  const report = readJson<{ reference_bank?: { status?: string }; checks?: Array<{ code?: string; passed?: boolean }> }>(
    qc.reportPath
  );
  const packMeta = readJson<{
    reference_bank?: { status?: string };
    review_only?: boolean;
    required_manual_slots?: string[];
    review_notes?: string[];
  }>(pack.metaPath);
  const proposal = readJson<{
    reference_bank?: { status?: string };
    auto_proposal?: {
      review_only?: boolean;
      required_manual_slots?: string[];
      notes?: string[];
      anchor_confidence_summary?: { overall?: number };
      anchor_review?: { missing_anchor_ids?: string[] };
      anchors?: { views?: { front?: { head_center?: { status?: string } } } };
    };
  }>(pack.proposalPath);
  const packDoc = readJson<{
    anchors?: {
      confidence_summary?: { overall?: number };
      views?: { front?: { head_center?: { status?: string } } };
    };
  }>(pack.packPath);
  assert.equal(report.reference_bank?.status, "species_ready", "qc report should include species_ready reference bank status");
  assert.equal(packMeta.reference_bank?.status, "species_ready", "pack meta should include species_ready reference bank status");
  assert.equal(proposal.reference_bank?.status, "species_ready", "proposal should include species_ready reference bank status");
  assert.equal(packMeta.review_only, false, "species_ready pack meta should not be review_only");
  assert.deepEqual(packMeta.required_manual_slots ?? [], [], "species_ready pack meta should not require manual slots");
  assert.equal(proposal.auto_proposal?.review_only, false, "species_ready proposal should not be review_only");
  assert.deepEqual(
    proposal.auto_proposal?.required_manual_slots ?? [],
    [],
    "species_ready proposal should not require manual slots"
  );
  assert.equal(
    manifest.acceptance?.reference_bank?.status,
    "species_ready",
    "manifest acceptance should include species_ready reference bank status"
  );
  assert.equal(
    report.checks?.some((entry) => entry.code === "REFERENCE_BANK_READINESS" && entry.passed === true),
    true,
    "qc report should record REFERENCE_BANK_READINESS"
  );
  assert.equal(
    report.checks?.some((entry) => entry.code === "PACK_ANCHOR_MANIFEST" && entry.passed === true),
    true,
    "qc report should record PACK_ANCHOR_MANIFEST"
  );
  assert.equal(typeof packDoc.anchors?.confidence_summary?.overall, "number", "pack should include anchor confidence summary");
  assert.equal(packDoc.anchors?.views?.front?.head_center?.status, "present", "pack should include front head anchor");
  assert.equal(
    typeof proposal.auto_proposal?.anchor_confidence_summary?.overall,
    "number",
    "proposal should include anchor confidence summary"
  );
  assert.deepEqual(
    proposal.auto_proposal?.anchor_review?.missing_anchor_ids ?? [],
    [],
    "smoke proposal should not report missing anchors"
  );
  assert.equal(
    proposal.auto_proposal?.anchors?.views?.front?.head_center?.status,
    "present",
    "proposal should embed anchor manifest"
  );
  const shotsPath = buildSmokeShotsPath();
  const outputPath = path.join(OUTPUT_ROOT, shouldRender ? "smoke-generated-character.mp4" : "smoke-generated-character.dryrun.mp4");
  const render = await orchestrateRenderEpisode({
    shotsPath,
    outputPath,
    dryRun: !shouldRender
  });

  console.log(
    JSON.stringify(
      {
        characterId: CHARACTER_ID,
        manifestPath: path.join(CHARACTER_ROOT, "manifest.json"),
        pack,
        qc,
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
