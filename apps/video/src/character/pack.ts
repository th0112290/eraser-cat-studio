import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import characterPackSchema from "../../../../packages/schemas/character_pack.schema.json";
import minimalPackJson from "./packs/minimal.json";
import turningPackJson from "./packs/turning.json";
import type { CharacterPack } from "./types";

export type MascotId = "eraser_cat" | "med_dog" | "unknown";

export type CharacterPackValidationIssue = {
  path: string;
  message: string;
};

function toIssues(errors: ErrorObject[] | null | undefined): CharacterPackValidationIssue[] {
  if (!errors) {
    return [];
  }

  return errors.map((error) => ({
    path: error.instancePath || "/",
    message: error.message ?? "validation error"
  }));
}

export function validateCharacterPack(payload: unknown): CharacterPackValidationIssue[] {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false
  });
  const validate = ajv.compile<CharacterPack>(characterPackSchema as object);
  const ok = validate(payload);

  if (ok) {
    return [];
  }

  return toIssues(validate.errors);
}

export function assertCharacterPack(payload: unknown, label: string = "character-pack"): CharacterPack {
  const issues = validateCharacterPack(payload);
  if (issues.length === 0) {
    return payload as CharacterPack;
  }

  const details = issues.map((issue) => `${issue.path} ${issue.message}`).join("; ");
  throw new Error(`Invalid ${label}: ${details}`);
}

function remapImageId(imageId: string, remap: Record<string, string>): string {
  return remap[imageId] ?? imageId;
}

function deriveCharacterPack(input: {
  basePack: CharacterPack;
  packId: string;
  name: string;
  notes: string;
  imageRemap: Record<string, string>;
  attachmentOffsetPatches?: Record<string, { x?: number; y?: number }>;
  boneRestPatches?: Record<string, { x?: number; y?: number; rotation_deg?: number }>;
}): CharacterPack {
  const { basePack, packId, name, notes, imageRemap, attachmentOffsetPatches = {}, boneRestPatches = {} } = input;
  const derived: CharacterPack = {
    ...basePack,
    pack_id: packId,
    meta: {
      ...basePack.meta,
      name,
      created_at: "2026-03-10T00:00:00.000Z",
      notes
    },
    assets: {
      images: Object.fromEntries(
        Object.entries(basePack.assets.images).map(([imageId, source]) => {
          const remappedImageId = remapImageId(imageId, imageRemap);
          const remappedSource =
            typeof source === "string" && source.startsWith("shape://")
              ? `shape://${remapImageId(source.slice("shape://".length), imageRemap)}`
              : source;
          return [remappedImageId, remappedSource];
        })
      )
    },
    skeleton: {
      bones: basePack.skeleton.bones.map((bone) => {
        const patch = boneRestPatches[bone.bone_id];
        return patch
          ? {
              ...bone,
              rest: {
                ...bone.rest,
                x: patch.x ?? bone.rest.x,
                y: patch.y ?? bone.rest.y,
                rotation_deg: patch.rotation_deg ?? bone.rest.rotation_deg
              }
            }
          : { ...bone, rest: { ...bone.rest } };
      }),
      attachments: basePack.skeleton.attachments.map((attachment) => {
        const patch = attachmentOffsetPatches[attachment.slot_id];
        return {
          ...attachment,
          image_id: remapImageId(attachment.image_id, imageRemap),
          offset:
            patch || attachment.offset
              ? {
                  x: patch?.x ?? attachment.offset?.x,
                  y: patch?.y ?? attachment.offset?.y
                }
              : undefined,
          pivot: { ...attachment.pivot },
          scale: attachment.scale ? { ...attachment.scale } : undefined
        };
      })
    },
    slots: basePack.slots.map((slot) => ({
      ...slot,
      default_image_id: remapImageId(slot.default_image_id, imageRemap)
    })),
    visemes: Object.fromEntries(
      Object.entries(basePack.visemes).map(([visemeId, viseme]) => [
        visemeId,
        {
          ...viseme,
          image_id: remapImageId(viseme.image_id, imageRemap)
        }
      ])
    ),
    expressions: Object.fromEntries(
      Object.entries(basePack.expressions).map(([expressionId, expression]) => [
        expressionId,
        {
          ...expression,
          slot_overrides: expression.slot_overrides?.map((entry) => ({
            ...entry,
            image_id: remapImageId(entry.image_id, imageRemap)
          })),
          bone_overrides: expression.bone_overrides?.map((entry) => ({ ...entry }))
        }
      ])
    ),
    clips: basePack.clips.map((clip) => ({ ...clip, tracks: { ...clip.tracks } })),
    ik_chains: basePack.ik_chains.map((chain) => ({ ...chain, bones: [...chain.bones] as [string, string] }))
  };

  return assertCharacterPack(derived, packId);
}

export const minimalCharacterPack = assertCharacterPack(minimalPackJson, "minimal character pack");
export const turningCharacterPack = assertCharacterPack(turningPackJson, "turning character pack");

export const turningViewBlendPack: CharacterPack = {
  ...turningCharacterPack,
  expressions: {
    ...turningCharacterPack.expressions,
    front: turningCharacterPack.expressions.view_front,
    right_3q: turningCharacterPack.expressions.view_right_3q,
    right_profile: turningCharacterPack.expressions.view_right_profile,
    left_3q: turningCharacterPack.expressions.view_left_3q,
    left_profile: turningCharacterPack.expressions.view_left_profile
  }
};

const MED_DOG_MINIMAL_IMAGE_REMAP: Record<string, string> = {
  torso: "torso_med_dog",
  head: "head_med_dog",
  upper_arm: "upper_arm_med_dog",
  lower_arm: "lower_arm_med_dog",
  paw: "paw_med_dog",
  eye_left: "eye_left_med_dog",
  eye_right: "eye_right_med_dog",
  mouth: "mouth_med_dog",
  eyelid: "eyelid_med_dog"
};

const MED_DOG_TURNING_IMAGE_REMAP: Record<string, string> = {
  torso_front: "torso_front_med_dog",
  torso_3q: "torso_3q_med_dog",
  torso_profile: "torso_profile_med_dog",
  head_front: "head_front_med_dog",
  head_3q: "head_3q_med_dog",
  head_profile: "head_profile_med_dog",
  ear_front_near: "ear_front_near_med_dog",
  ear_front_far: "ear_front_far_med_dog",
  ear_3q_near: "ear_3q_near_med_dog",
  ear_3q_far: "ear_3q_far_med_dog",
  ear_profile: "ear_profile_med_dog",
  eye_front_near: "eye_front_near_med_dog",
  eye_front_far: "eye_front_far_med_dog",
  eye_3q_near: "eye_3q_near_med_dog",
  eye_3q_far: "eye_3q_far_med_dog",
  eye_profile: "eye_profile_med_dog",
  nose_front: "nose_front_med_dog",
  nose_3q: "nose_3q_med_dog",
  nose_profile: "nose_profile_med_dog",
  mouth_front: "mouth_front_med_dog",
  mouth_3q: "mouth_3q_med_dog",
  mouth_profile: "mouth_profile_med_dog",
  upper_arm: "upper_arm_med_dog",
  upper_arm_profile: "upper_arm_profile_med_dog",
  lower_arm: "lower_arm_med_dog",
  lower_arm_profile: "lower_arm_profile_med_dog",
  paw: "paw_med_dog",
  paw_profile: "paw_profile_med_dog",
  tail: "tail_med_dog",
  tail_profile: "tail_profile_med_dog"
};

export const medDogMinimalPack = deriveCharacterPack({
  basePack: minimalCharacterPack,
  packId: "med-dog-minimal",
  name: "Med Dog Minimal Pack",
  notes: "Medical mascot variant derived from the minimal presenter rig.",
  imageRemap: MED_DOG_MINIMAL_IMAGE_REMAP,
  boneRestPatches: {
    head: { x: 4, y: -116, rotation_deg: 0 }
  }
});

export const medDogTurningPack = deriveCharacterPack({
  basePack: turningCharacterPack,
  packId: "med-dog-turning",
  name: "Med Dog Turning Pack",
  notes: "Medical mascot turning pack with softer muzzle and floppy ear offsets.",
  imageRemap: MED_DOG_TURNING_IMAGE_REMAP,
  attachmentOffsetPatches: {
    ear_far: { x: -28, y: -56 },
    ear_near: { x: 24, y: -60 },
    nose: { x: 10, y: -2 },
    mouth: { x: 12, y: 18 }
  },
  boneRestPatches: {
    head: { x: 10, y: -118, rotation_deg: 0 },
    tail: { x: -84, y: 22, rotation_deg: -10 }
  }
});

export const medDogViewBlendPack: CharacterPack = {
  ...medDogTurningPack,
  expressions: {
    ...medDogTurningPack.expressions,
    front: medDogTurningPack.expressions.view_front,
    right_3q: medDogTurningPack.expressions.view_right_3q,
    right_profile: medDogTurningPack.expressions.view_right_profile,
    left_3q: medDogTurningPack.expressions.view_left_3q,
    left_profile: medDogTurningPack.expressions.view_left_profile
  }
};

const KNOWN_CHARACTER_PACKS: CharacterPack[] = [
  medDogViewBlendPack,
  medDogTurningPack,
  medDogMinimalPack,
  turningViewBlendPack,
  turningCharacterPack,
  minimalCharacterPack
];

export function inferMascotIdFromPackId(packId: string | undefined): MascotId {
  const normalized = (packId ?? "").trim().toLowerCase();
  if (normalized.includes("med-dog") || normalized.includes("med_dog")) {
    return "med_dog";
  }
  if (normalized.includes("eraser-cat") || normalized.includes("eraser_cat")) {
    return "eraser_cat";
  }
  return "unknown";
}

export function resolveCharacterPack(packId: string | undefined, preferTurning: boolean = false): CharacterPack {
  if (packId) {
    const direct = KNOWN_CHARACTER_PACKS.find((pack) => pack.pack_id === packId);
    if (direct) {
      return direct;
    }
  }

  const mascotId = inferMascotIdFromPackId(packId);
  if (preferTurning) {
    if (mascotId === "med_dog") {
      return medDogViewBlendPack;
    }
    return turningViewBlendPack;
  }

  if (mascotId === "med_dog") {
    return medDogMinimalPack;
  }
  if (mascotId === "eraser_cat") {
    return minimalCharacterPack;
  }
  return minimalCharacterPack;
}

export function resolveViewBlendPack(packId: string | undefined): CharacterPack {
  if (packId === medDogTurningPack.pack_id || packId === medDogViewBlendPack.pack_id) {
    return medDogViewBlendPack;
  }
  if (packId === turningCharacterPack.pack_id || packId === turningViewBlendPack.pack_id) {
    return turningViewBlendPack;
  }
  const mascotId = inferMascotIdFromPackId(packId);
  if (mascotId === "med_dog") {
    return medDogViewBlendPack;
  }
  if (mascotId === "eraser_cat") {
    return turningViewBlendPack;
  }
  return turningViewBlendPack;
}
