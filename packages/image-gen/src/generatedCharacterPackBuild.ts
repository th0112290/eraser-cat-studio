import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import type {
  CharacterCropBoxes,
  CharacterPackAnchorManifest,
  CharacterPipelineReferenceBankStatus,
  CharacterStillAsset,
  GeneratedCharacterExpression,
  GeneratedCharacterManifest,
  GeneratedCharacterView,
  GeneratedCharacterViseme
} from "./generatedCharacterPipeline";
import type { MascotSpeciesId } from "./types";

type CharacterPackAnchorReviewSummary = {
  overallConfidence?: number;
  missingAnchorIds: string[];
  lowConfidenceAnchorIds: string[];
};

type GeneratedCharacterPackReviewPlan = {
  reviewOnly: boolean;
  requiredManualSlots: string[];
  reviewNotes: string[];
};

type CropRegionJob = (input: {
  sourcePath: string;
  crop: CharacterCropBoxes["mouth"];
  targetPath: string;
  targetWidth: number;
  targetHeight: number;
}) => Promise<string>;

type GeneratedCharacterPackBuildDependencies = {
  cropNormalizedRegion: CropRegionJob;
  recenterPackedEyeAsset: (slotPath: string) => Promise<void>;
  ensurePackedEyeSlotContent: (slotPath: string, mode: "open" | "closed", speciesId: MascotSpeciesId) => Promise<void>;
  validatePack: (pack: unknown) => void;
};

type GeneratedCharacterPackBuildInput = {
  characterId: string;
  rootDir: string;
  sourceManifestPath: string;
  manifest: GeneratedCharacterManifest;
  cropBoxes: CharacterCropBoxes;
  anchorManifest: CharacterPackAnchorManifest;
  anchorReview: CharacterPackAnchorReviewSummary;
  referenceBank: CharacterPipelineReferenceBankStatus;
  referenceBankReview: GeneratedCharacterPackReviewPlan;
  speciesId: MascotSpeciesId;
  deps: GeneratedCharacterPackBuildDependencies;
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTransparentPng(targetPath: string, width: number, height: number): Promise<void> {
  ensureDir(path.dirname(targetPath));
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .png()
    .toFile(targetPath);
}

function requireExpressionAsset(
  manifest: GeneratedCharacterManifest,
  view: GeneratedCharacterView,
  expression: GeneratedCharacterExpression
): CharacterStillAsset {
  const asset = manifest.expressions[view]?.[expression];
  if (!asset) {
    throw new Error(`Missing expression asset ${view}/${expression}`);
  }
  return asset;
}

function requireVisemeAsset(
  manifest: GeneratedCharacterManifest,
  view: GeneratedCharacterView,
  viseme: GeneratedCharacterViseme
): CharacterStillAsset {
  const asset = manifest.visemes[view]?.[viseme];
  if (!asset) {
    throw new Error(`Missing viseme asset ${view}/${viseme}`);
  }
  return asset;
}

function requireViewAsset(manifest: GeneratedCharacterManifest, view: GeneratedCharacterView): CharacterStillAsset {
  const asset = manifest.views[view];
  if (!asset) {
    throw new Error(`Missing view asset ${view}`);
  }
  return asset;
}

export async function materializeGeneratedCharacterPack(
  input: GeneratedCharacterPackBuildInput
): Promise<{ packPath: string; proposalPath: string; metaPath: string; builtAt: string }> {
  const packDir = path.join(input.rootDir, "pack");
  const assetsDir = path.join(packDir, "assets");
  const overrideDir = path.join(packDir, "overrides");
  const anchorOverridePath = path.join(overrideDir, "anchors.json");
  ensureDir(assetsDir);

  const frontView = requireViewAsset(input.manifest, "front");
  const threeQuarterView = requireViewAsset(input.manifest, "threeQuarter");
  const profileView = requireViewAsset(input.manifest, "profile");
  const frontHappy = requireExpressionAsset(input.manifest, "front", "happy");
  const frontBlink = requireExpressionAsset(input.manifest, "front", "blink");
  const frontSurprised = input.manifest.expressions.front?.surprised ?? frontHappy;
  const mouthClosed = requireVisemeAsset(input.manifest, "front", "mouth_closed");
  const mouthOpenSmall = requireVisemeAsset(input.manifest, "front", "mouth_open_small");
  const mouthOpenWide = requireVisemeAsset(input.manifest, "front", "mouth_open_wide");
  const mouthRoundO = requireVisemeAsset(input.manifest, "front", "mouth_round_o");

  const proposalPath = path.join(packDir, "proposal.json");
  const packPath = path.join(packDir, "character.pack.json");
  const metaPath = path.join(packDir, "character.pack.meta.json");
  const builtAt = new Date().toISOString();

  writeJson(proposalPath, {
    schema_version: "1.0",
    character_id: input.characterId,
    generated_at: builtAt,
    reference_bank: input.referenceBank,
    auto_proposal: {
      crop_boxes: input.cropBoxes,
      anchors: input.anchorManifest,
      override_dir: overrideDir,
      anchor_override_path: anchorOverridePath,
      review_only: input.referenceBankReview.reviewOnly,
      required_manual_slots: input.referenceBankReview.requiredManualSlots,
      anchor_confidence_summary: input.anchorManifest.confidence_summary,
      anchor_review: {
        overall_confidence: input.anchorReview.overallConfidence,
        missing_anchor_ids: input.anchorReview.missingAnchorIds,
        low_confidence_anchor_ids: input.anchorReview.lowConfidenceAnchorIds
      },
      notes: [
        "crop-boxes.json can override torso/head/eye/mouth crops",
        "anchors.json can override per-view anchor coordinates/status/confidence",
        "default proposal uses foreground bounds plus front-face feature detection",
        "anchor coordinates are normalized to each source view raster",
        "full auto segmentation is intentionally avoided; override assets can replace any generated crop",
        ...input.referenceBankReview.reviewNotes
      ]
    }
  });

  const blankPath = path.join(assetsDir, "blank.png");
  await writeTransparentPng(blankPath, 64, 64);

  await Promise.all([
    input.deps.cropNormalizedRegion({
      sourcePath: frontView.file_path,
      crop: input.cropBoxes.torso.front,
      targetPath: path.join(assetsDir, "torso_front_neutral.png"),
      targetWidth: 240,
      targetHeight: 280
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: threeQuarterView.file_path,
      crop: input.cropBoxes.torso.threeQuarter,
      targetPath: path.join(assetsDir, "torso_threeQuarter_neutral.png"),
      targetWidth: 220,
      targetHeight: 280
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: profileView.file_path,
      crop: input.cropBoxes.torso.profile,
      targetPath: path.join(assetsDir, "torso_profile_neutral.png"),
      targetWidth: 180,
      targetHeight: 280
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: frontView.file_path,
      crop: input.cropBoxes.head.front,
      targetPath: path.join(assetsDir, "head_front_neutral.png"),
      targetWidth: 180,
      targetHeight: 180
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: frontHappy.file_path,
      crop: input.cropBoxes.head.front,
      targetPath: path.join(assetsDir, "head_front_happy.png"),
      targetWidth: 180,
      targetHeight: 180
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: frontBlink.file_path,
      crop: input.cropBoxes.head.front,
      targetPath: path.join(assetsDir, "head_front_blink.png"),
      targetWidth: 180,
      targetHeight: 180
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: frontSurprised.file_path,
      crop: input.cropBoxes.head.front,
      targetPath: path.join(assetsDir, "head_front_surprised.png"),
      targetWidth: 180,
      targetHeight: 180
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: threeQuarterView.file_path,
      crop: input.cropBoxes.head.threeQuarter,
      targetPath: path.join(assetsDir, "head_threeQuarter_neutral.png"),
      targetWidth: 170,
      targetHeight: 180
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: profileView.file_path,
      crop: input.cropBoxes.head.profile,
      targetPath: path.join(assetsDir, "head_profile_neutral.png"),
      targetWidth: 140,
      targetHeight: 180
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: frontView.file_path,
      crop: input.cropBoxes.eyes.left,
      targetPath: path.join(assetsDir, "eye_open.png"),
      targetWidth: 60,
      targetHeight: 36
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: frontBlink.file_path,
      crop: input.cropBoxes.eyes.left,
      targetPath: path.join(assetsDir, "eye_closed.png"),
      targetWidth: 60,
      targetHeight: 36
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: mouthClosed.file_path,
      crop: input.cropBoxes.mouth,
      targetPath: path.join(assetsDir, "mouth_closed.png"),
      targetWidth: 88,
      targetHeight: 56
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: mouthOpenSmall.file_path,
      crop: input.cropBoxes.mouth,
      targetPath: path.join(assetsDir, "mouth_open_small.png"),
      targetWidth: 88,
      targetHeight: 56
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: mouthOpenWide.file_path,
      crop: input.cropBoxes.mouth,
      targetPath: path.join(assetsDir, "mouth_open_wide.png"),
      targetWidth: 88,
      targetHeight: 56
    }),
    input.deps.cropNormalizedRegion({
      sourcePath: mouthRoundO.file_path,
      crop: input.cropBoxes.mouth,
      targetPath: path.join(assetsDir, "mouth_round_o.png"),
      targetWidth: 88,
      targetHeight: 56
    })
  ]);

  const eyeOpenPath = path.join(assetsDir, "eye_open.png");
  const eyeClosedPath = path.join(assetsDir, "eye_closed.png");
  await input.deps.recenterPackedEyeAsset(eyeOpenPath);
  await input.deps.recenterPackedEyeAsset(eyeClosedPath);
  await input.deps.ensurePackedEyeSlotContent(eyeOpenPath, "open", input.speciesId);
  await input.deps.ensurePackedEyeSlotContent(eyeClosedPath, "closed", input.speciesId);

  const fileUrl = (name: string) => pathToFileURL(path.join(assetsDir, name)).href;
  const pack = {
    schema_version: "1.0" as const,
    pack_id: input.characterId,
    meta: {
      name: `Generated Character Pack ${input.characterId}`,
      created_at: builtAt,
      source_image_ref: input.manifest.approved_front_master?.file_path,
      notes: "Generated from ComfyUI still pipeline with manual override support"
    },
    canvas: {
      base_width: 1920,
      base_height: 1080,
      coord_space: "pixels" as const
    },
    assets: {
      images: {
        torso_front_neutral: fileUrl("torso_front_neutral.png"),
        torso_threeQuarter_neutral: fileUrl("torso_threeQuarter_neutral.png"),
        torso_profile_neutral: fileUrl("torso_profile_neutral.png"),
        head_front_neutral: fileUrl("head_front_neutral.png"),
        head_front_happy: fileUrl("head_front_happy.png"),
        head_front_blink: fileUrl("head_front_blink.png"),
        head_front_surprised: fileUrl("head_front_surprised.png"),
        head_threeQuarter_neutral: fileUrl("head_threeQuarter_neutral.png"),
        head_profile_neutral: fileUrl("head_profile_neutral.png"),
        eye_open: fileUrl("eye_open.png"),
        eye_closed: fileUrl("eye_closed.png"),
        mouth_closed: fileUrl("mouth_closed.png"),
        mouth_open_small: fileUrl("mouth_open_small.png"),
        mouth_open_wide: fileUrl("mouth_open_wide.png"),
        mouth_round_o: fileUrl("mouth_round_o.png"),
        blank: fileUrl("blank.png"),
        upper_arm: "shape://upper_arm",
        upper_arm_profile: "shape://upper_arm_profile",
        lower_arm: "shape://lower_arm",
        lower_arm_profile: "shape://lower_arm_profile",
        paw: "shape://paw",
        paw_profile: "shape://paw_profile",
        tail: "shape://tail",
        tail_profile: "shape://tail_profile"
      }
    },
    anchors: input.anchorManifest,
    slots: [
      { slot_id: "tail", default_image_id: "tail", z_index: 0 },
      { slot_id: "torso", default_image_id: "torso_front_neutral", z_index: 1 },
      { slot_id: "upper_arm", default_image_id: "upper_arm", z_index: 2 },
      { slot_id: "head", default_image_id: "head_front_neutral", z_index: 3 },
      { slot_id: "eye_far", default_image_id: "eye_open", z_index: 4 },
      { slot_id: "mouth", default_image_id: "mouth_closed", z_index: 5 },
      { slot_id: "eye_near", default_image_id: "eye_open", z_index: 6 },
      { slot_id: "lower_arm", default_image_id: "lower_arm", z_index: 7 },
      { slot_id: "paw", default_image_id: "paw", z_index: 8 }
    ],
    skeleton: {
      bones: [
        { bone_id: "root", parent_id: "", rest: { x: 0, y: 0, rotation_deg: 0 } },
        { bone_id: "torso", parent_id: "root", rest: { x: 0, y: 0, rotation_deg: 0 } },
        {
          bone_id: "head",
          parent_id: "torso",
          rest: { x: 8, y: -122, rotation_deg: 0 },
          limits: { min_rotation_deg: -40, max_rotation_deg: 40 }
        },
        {
          bone_id: "upper_arm",
          parent_id: "torso",
          rest: { x: 86, y: -44, rotation_deg: 10 },
          limits: { min_rotation_deg: -120, max_rotation_deg: 120 }
        },
        {
          bone_id: "lower_arm",
          parent_id: "upper_arm",
          rest: { x: 96, y: 0, rotation_deg: 12 },
          limits: { min_rotation_deg: -145, max_rotation_deg: 145 }
        },
        {
          bone_id: "tail",
          parent_id: "torso",
          rest: { x: -76, y: 18, rotation_deg: -16 },
          limits: { min_rotation_deg: -45, max_rotation_deg: 35 }
        }
      ],
      attachments: [
        { slot_id: "torso", image_id: "torso_front_neutral", bone_id: "torso", pivot: { px: 0.5, py: 0.1 } },
        { slot_id: "head", image_id: "head_front_neutral", bone_id: "head", pivot: { px: 0.5, py: 0.82 } },
        { slot_id: "eye_far", image_id: "eye_open", bone_id: "head", pivot: { px: 0.5, py: 0.5 }, offset: { x: -20, y: -30 } },
        { slot_id: "eye_near", image_id: "eye_open", bone_id: "head", pivot: { px: 0.5, py: 0.5 }, offset: { x: 18, y: -30 } },
        { slot_id: "mouth", image_id: "mouth_closed", bone_id: "head", pivot: { px: 0.5, py: 0.5 }, offset: { x: 4, y: 14 } },
        { slot_id: "upper_arm", image_id: "upper_arm", bone_id: "upper_arm", pivot: { px: 0.05, py: 0.5 } },
        { slot_id: "lower_arm", image_id: "lower_arm", bone_id: "lower_arm", pivot: { px: 0.05, py: 0.5 } },
        { slot_id: "paw", image_id: "paw", bone_id: "lower_arm", pivot: { px: 0.5, py: 0.5 }, offset: { x: 90, y: 0 } },
        { slot_id: "tail", image_id: "tail", bone_id: "tail", pivot: { px: 0.12, py: 0.5 } }
      ]
    },
    visemes: {
      mouth_closed: { slot_id: "mouth", image_id: "mouth_closed" },
      mouth_open_small: { slot_id: "mouth", image_id: "mouth_open_small" },
      mouth_open_wide: { slot_id: "mouth", image_id: "mouth_open_wide" },
      mouth_round_o: { slot_id: "mouth", image_id: "mouth_round_o" }
    },
    expressions: {
      front_neutral: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_neutral" }, { slot_id: "eye_far", image_id: "eye_open" }, { slot_id: "eye_near", image_id: "eye_open" }, { slot_id: "mouth", image_id: "mouth_closed" }] },
      front_happy: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_happy" }, { slot_id: "eye_far", image_id: "eye_open" }, { slot_id: "eye_near", image_id: "eye_open" }, { slot_id: "mouth", image_id: "mouth_closed" }] },
      front_blink: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_blink" }, { slot_id: "eye_far", image_id: "eye_closed" }, { slot_id: "eye_near", image_id: "eye_closed" }, { slot_id: "mouth", image_id: "mouth_closed" }] },
      front_surprised: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_surprised" }, { slot_id: "eye_far", image_id: "eye_open" }, { slot_id: "eye_near", image_id: "eye_open" }, { slot_id: "mouth", image_id: "mouth_round_o" }] },
      threeQuarter_neutral: { slot_overrides: [{ slot_id: "torso", image_id: "torso_threeQuarter_neutral" }, { slot_id: "head", image_id: "head_threeQuarter_neutral" }, { slot_id: "eye_far", image_id: "blank" }, { slot_id: "eye_near", image_id: "blank" }, { slot_id: "mouth", image_id: "blank" }], bone_overrides: [{ bone_id: "torso", rotation_deg: 6 }, { bone_id: "head", rotation_deg: 10, x: 8 }, { bone_id: "tail", rotation_deg: 8 }] },
      profile_neutral: { slot_overrides: [{ slot_id: "torso", image_id: "torso_profile_neutral" }, { slot_id: "head", image_id: "head_profile_neutral" }, { slot_id: "eye_far", image_id: "blank" }, { slot_id: "eye_near", image_id: "blank" }, { slot_id: "mouth", image_id: "blank" }, { slot_id: "upper_arm", image_id: "upper_arm_profile" }, { slot_id: "lower_arm", image_id: "lower_arm_profile" }, { slot_id: "paw", image_id: "paw_profile" }, { slot_id: "tail", image_id: "tail_profile" }], bone_overrides: [{ bone_id: "torso", rotation_deg: 12 }, { bone_id: "head", rotation_deg: 18, x: 14 }, { bone_id: "tail", rotation_deg: 14 }] },
      view_front: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_neutral" }, { slot_id: "eye_far", image_id: "eye_open" }, { slot_id: "eye_near", image_id: "eye_open" }, { slot_id: "mouth", image_id: "mouth_closed" }] },
      view_right_3q: { slot_overrides: [{ slot_id: "torso", image_id: "torso_threeQuarter_neutral" }, { slot_id: "head", image_id: "head_threeQuarter_neutral" }, { slot_id: "eye_far", image_id: "blank" }, { slot_id: "eye_near", image_id: "blank" }, { slot_id: "mouth", image_id: "blank" }] },
      view_right_profile: { slot_overrides: [{ slot_id: "torso", image_id: "torso_profile_neutral" }, { slot_id: "head", image_id: "head_profile_neutral" }, { slot_id: "eye_far", image_id: "blank" }, { slot_id: "eye_near", image_id: "blank" }, { slot_id: "mouth", image_id: "blank" }, { slot_id: "upper_arm", image_id: "upper_arm_profile" }, { slot_id: "lower_arm", image_id: "lower_arm_profile" }, { slot_id: "paw", image_id: "paw_profile" }, { slot_id: "tail", image_id: "tail_profile" }] },
      neutral: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_neutral" }, { slot_id: "eye_far", image_id: "eye_open" }, { slot_id: "eye_near", image_id: "eye_open" }, { slot_id: "mouth", image_id: "mouth_closed" }] },
      happy: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_happy" }, { slot_id: "eye_far", image_id: "eye_open" }, { slot_id: "eye_near", image_id: "eye_open" }, { slot_id: "mouth", image_id: "mouth_closed" }] },
      blink: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_blink" }, { slot_id: "eye_far", image_id: "eye_closed" }, { slot_id: "eye_near", image_id: "eye_closed" }, { slot_id: "mouth", image_id: "mouth_closed" }] },
      surprised: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_surprised" }, { slot_id: "eye_far", image_id: "eye_open" }, { slot_id: "eye_near", image_id: "eye_open" }, { slot_id: "mouth", image_id: "mouth_round_o" }] },
      excited: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_happy" }, { slot_id: "eye_far", image_id: "eye_open" }, { slot_id: "eye_near", image_id: "eye_open" }, { slot_id: "mouth", image_id: "mouth_open_small" }] },
      focused: { slot_overrides: [{ slot_id: "torso", image_id: "torso_front_neutral" }, { slot_id: "head", image_id: "head_front_neutral" }, { slot_id: "eye_far", image_id: "eye_open" }, { slot_id: "eye_near", image_id: "eye_open" }, { slot_id: "mouth", image_id: "mouth_closed" }] }
    },
    clips: [
      { clip_id: "idle_talk", duration_frames: 24, tracks: {} },
      { clip_id: "explain", duration_frames: 24, tracks: {} },
      { clip_id: "greet", duration_frames: 24, tracks: {} },
      { clip_id: "move", duration_frames: 24, tracks: {} },
      { clip_id: "conclude", duration_frames: 24, tracks: {} }
    ],
    ik_chains: [
      { chain_id: "right-arm", bones: ["upper_arm", "lower_arm"], effector_bone_id: "lower_arm", elbow_hint: "down", max_stretch: 1.05 }
    ]
  };

  input.deps.validatePack(pack);

  writeJson(packPath, pack);
  writeJson(metaPath, {
    schema_version: "1.0",
    character_id: input.characterId,
    built_at: builtAt,
    source_manifest_path: input.sourceManifestPath,
    proposal_path: proposalPath,
    pack_path: packPath,
    reference_bank: input.referenceBank,
    review_only: input.referenceBankReview.reviewOnly,
    required_manual_slots: input.referenceBankReview.requiredManualSlots,
    review_notes: input.referenceBankReview.reviewNotes,
    anchor_confidence_summary: input.anchorManifest.confidence_summary,
    anchor_review: {
      overall_confidence: input.anchorReview.overallConfidence,
      missing_anchor_ids: input.anchorReview.missingAnchorIds,
      low_confidence_anchor_ids: input.anchorReview.lowConfidenceAnchorIds
    },
    anchor_override_path: anchorOverridePath
  });

  return { packPath, proposalPath, metaPath, builtAt };
}
