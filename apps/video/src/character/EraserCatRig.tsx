import type { CSSProperties } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { SvgPathMorph } from "../effects/SvgPathMorph";
import { minimalCharacterPack } from "./pack";
import { getPoseSpace, type PoseSpaceResult, type PoseSpaceSlotId, type PoseSpaceSlotTransform } from "./poseSpace";
import { getMouthOpen, type AudioDataLike } from "./talk";
import type { CharacterPack, RigPose, Vec2 } from "./types";

type AnimationMode = "static" | "alive";

type RigProps = {
  pose?: RigPose;
  targetPoint?: Vec2;
  pack?: CharacterPack;
  expression?: string;
  opacity?: number;
  yaw?: number;
  animationMode?: AnimationMode;
  seed?: string;
  talkText?: string;
  mouthOpen?: number;
  talkAudioData?: AudioDataLike;
};

type Bone = CharacterPack["skeleton"]["bones"][number];
type Attachment = CharacterPack["skeleton"]["attachments"][number];

type BoneOverride = {
  x?: number;
  y?: number;
  rotationDeg?: number;
};

type BoneWorld = {
  x: number;
  y: number;
  rotationDeg: number;
};

type ShapeSpec = {
  width: number;
  height: number;
  color: string;
  borderRadius: number | string;
};

type MorphTarget = "head" | "torso";

type MorphSegment = {
  fromPath: string;
  toPath: string;
  t: number;
};

const DEFAULT_POSE: RigPose = {
  position: { x: 0, y: 0 }
};

const SHAPES: Record<string, ShapeSpec> = {
  body_front: { width: 420, height: 560, color: "#f2c94c", borderRadius: 26 },
  body_3q: { width: 380, height: 560, color: "#f2c94c", borderRadius: 26 },
  body_profile: { width: 290, height: 560, color: "#f2c94c", borderRadius: 24 },
  torso_med_dog: { width: 176, height: 198, color: "#68c5c0", borderRadius: 30 },
  torso_front_med_dog: { width: 180, height: 198, color: "#68c5c0", borderRadius: 30 },
  torso_3q_med_dog: { width: 164, height: 198, color: "#61bdb9", borderRadius: 30 },
  torso_profile_med_dog: { width: 122, height: 196, color: "#56b3ae", borderRadius: 28 },
  torso: { width: 170, height: 190, color: "#f2c94c", borderRadius: 28 },
  torso_front: { width: 172, height: 192, color: "#f2c94c", borderRadius: 28 },
  torso_3q: { width: 154, height: 192, color: "#f2c94c", borderRadius: 28 },
  torso_profile: { width: 112, height: 192, color: "#f2c94c", borderRadius: 26 },
  head_med_dog: { width: 154, height: 132, color: "#dcb98f", borderRadius: "48% 48% 44% 44%" },
  head_front_med_dog: { width: 156, height: 132, color: "#dcb98f", borderRadius: "48% 48% 44% 44%" },
  head_3q_med_dog: { width: 146, height: 130, color: "#d2ae83", borderRadius: "48% 48% 42% 42%" },
  head_profile_med_dog: { width: 114, height: 126, color: "#c79f72", borderRadius: "46% 50% 42% 42%" },
  head: { width: 128, height: 124, color: "#ffd68a", borderRadius: "50%" },
  head_front: { width: 132, height: 126, color: "#ffd68a", borderRadius: "50%" },
  head_3q: { width: 116, height: 124, color: "#ffd68a", borderRadius: "48%" },
  head_profile: { width: 82, height: 124, color: "#ffd68a", borderRadius: "46%" },
  ear_front_near_med_dog: { width: 34, height: 56, color: "#ab855e", borderRadius: "42% 42% 64% 64%" },
  ear_front_far_med_dog: { width: 30, height: 52, color: "#987151", borderRadius: "42% 42% 64% 64%" },
  ear_3q_near_med_dog: { width: 30, height: 52, color: "#ae8760", borderRadius: "40% 40% 64% 64%" },
  ear_3q_far_med_dog: { width: 24, height: 44, color: "#916a49", borderRadius: "40% 40% 60% 60%" },
  ear_profile_med_dog: { width: 20, height: 42, color: "#936c4b", borderRadius: "38% 38% 58% 58%" },
  ear_front_near: { width: 36, height: 40, color: "#f5b87a", borderRadius: 14 },
  ear_front_far: { width: 32, height: 36, color: "#ebb173", borderRadius: 14 },
  ear_3q_near: { width: 30, height: 38, color: "#f5b87a", borderRadius: 13 },
  ear_3q_far: { width: 22, height: 30, color: "#e0a66a", borderRadius: 11 },
  ear_profile: { width: 18, height: 34, color: "#e0a66a", borderRadius: 10 },
  eye_left_med_dog: { width: 22, height: 12, color: "#27384a", borderRadius: "50%" },
  eye_right_med_dog: { width: 22, height: 12, color: "#27384a", borderRadius: "50%" },
  eye_front_near_med_dog: { width: 22, height: 12, color: "#27384a", borderRadius: "50%" },
  eye_front_far_med_dog: { width: 20, height: 11, color: "#27384a", borderRadius: "50%" },
  eye_3q_near_med_dog: { width: 20, height: 11, color: "#27384a", borderRadius: "50%" },
  eye_3q_far_med_dog: { width: 13, height: 8, color: "#27384a", borderRadius: "50%" },
  eye_profile_med_dog: { width: 11, height: 7, color: "#27384a", borderRadius: "50%" },
  eye_left: { width: 20, height: 14, color: "#2b2b2b", borderRadius: "50%" },
  eye_right: { width: 20, height: 14, color: "#2b2b2b", borderRadius: "50%" },
  eye_front_near: { width: 20, height: 14, color: "#2b2b2b", borderRadius: "50%" },
  eye_front_far: { width: 20, height: 14, color: "#2b2b2b", borderRadius: "50%" },
  eye_3q_near: { width: 18, height: 13, color: "#2b2b2b", borderRadius: "50%" },
  eye_3q_far: { width: 12, height: 9, color: "#2b2b2b", borderRadius: "50%" },
  eye_profile: { width: 10, height: 8, color: "#2b2b2b", borderRadius: "50%" },
  eyelid_med_dog: { width: 84, height: 24, color: "#dcb98f", borderRadius: 16 },
  eyelid: { width: 78, height: 24, color: "#ffd68a", borderRadius: 16 },
  mouth_med_dog: { width: 32, height: 10, color: "#7a5444", borderRadius: 10 },
  nose_front_med_dog: { width: 22, height: 12, color: "#4e4e58", borderRadius: "50%" },
  nose_3q_med_dog: { width: 18, height: 11, color: "#4e4e58", borderRadius: "50%" },
  nose_profile_med_dog: { width: 13, height: 9, color: "#4e4e58", borderRadius: "50%" },
  mouth_front_med_dog: { width: 32, height: 10, color: "#7a5444", borderRadius: 10 },
  mouth_3q_med_dog: { width: 28, height: 9, color: "#724d3d", borderRadius: 10 },
  mouth_profile_med_dog: { width: 18, height: 8, color: "#684535", borderRadius: 10 },
  mouth: { width: 28, height: 10, color: "#8a4d42", borderRadius: 10 },
  nose_front: { width: 16, height: 10, color: "#c17253", borderRadius: "50%" },
  nose_3q: { width: 14, height: 10, color: "#c17253", borderRadius: "50%" },
  nose_profile: { width: 10, height: 8, color: "#b3684d", borderRadius: "50%" },
  mouth_front: { width: 28, height: 10, color: "#8a4d42", borderRadius: 10 },
  mouth_3q: { width: 24, height: 9, color: "#8a4d42", borderRadius: 10 },
  mouth_profile: { width: 16, height: 8, color: "#7a443b", borderRadius: 10 },
  upper_arm_med_dog: { width: 104, height: 26, color: "#7bd1ca", borderRadius: 18 },
  upper_arm_profile_med_dog: { width: 82, height: 22, color: "#71c7c0", borderRadius: 16 },
  lower_arm_med_dog: { width: 98, height: 22, color: "#68c0b8", borderRadius: 16 },
  lower_arm_profile_med_dog: { width: 76, height: 18, color: "#63b9b2", borderRadius: 14 },
  paw_med_dog: { width: 32, height: 28, color: "#f2e4cf", borderRadius: "50%" },
  paw_profile_med_dog: { width: 26, height: 22, color: "#f2e4cf", borderRadius: "50%" },
  upper_arm: { width: 104, height: 26, color: "#ffb17a", borderRadius: 18 },
  upper_arm_profile: { width: 82, height: 22, color: "#ffb17a", borderRadius: 16 },
  lower_arm: { width: 98, height: 22, color: "#ff9f66", borderRadius: 16 },
  lower_arm_profile: { width: 76, height: 18, color: "#ff9f66", borderRadius: 14 },
  paw: { width: 30, height: 30, color: "#fff3cf", borderRadius: "50%" },
  paw_profile: { width: 24, height: 24, color: "#fff3cf", borderRadius: "50%" },
  tail_med_dog: { width: 112, height: 22, color: "#b58f68", borderRadius: 18 },
  tail_profile_med_dog: { width: 86, height: 18, color: "#a78059", borderRadius: 16 },
  tail: { width: 126, height: 20, color: "#f2c94c", borderRadius: 18 },
  tail_profile: { width: 94, height: 16, color: "#f2c94c", borderRadius: 16 }
};

const HEAD_PATHS = {
  front: "M50 4 C76 4 96 25 96 50 C96 77 76 98 50 98 C24 98 4 77 4 50 C4 25 24 4 50 4 Z",
  threeQuarter: "M48 4 C70 4 90 24 90 50 C90 78 70 98 44 98 C20 98 8 78 8 54 C8 30 24 8 48 4 Z",
  profile: "M44 4 C62 4 82 22 82 50 C82 78 62 98 36 98 C16 98 8 80 8 58 C8 34 18 12 44 4 Z"
};

const TORSO_PATHS = {
  front: "M50 2 C72 2 92 20 92 46 C92 72 74 98 50 98 C26 98 8 72 8 46 C8 20 28 2 50 2 Z",
  threeQuarter: "M48 2 C68 2 86 20 86 46 C86 74 66 98 42 98 C24 98 10 74 10 50 C10 24 24 4 48 2 Z",
  profile: "M42 2 C58 2 74 18 74 46 C74 74 56 98 34 98 C18 98 10 80 10 58 C10 30 20 10 42 2 Z"
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothStep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function rotate(point: Vec2, rotationDeg: number): Vec2 {
  const rad = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: point.x * c - point.y * s,
    y: point.x * s + point.y * c
  };
}

function distance(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

function getShape(imageId: string): ShapeSpec {
  return SHAPES[imageId] ?? { width: 40, height: 40, color: "#cccccc", borderRadius: 8 };
}

function resolveAssetImageRef(pack: CharacterPack, imageId: string): string | null {
  const source = pack.assets.images[imageId];
  if (typeof source !== "string" || source.trim().length === 0) {
    return null;
  }

  if (source.startsWith("shape://")) {
    return null;
  }

  return source;
}

function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashToUnit(seed: number): number {
  const mixed = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return mixed - Math.floor(mixed);
}

function hashToSigned(seed: number): number {
  return hashToUnit(seed) * 2 - 1;
}

function getBlinkAmount(frame: number, seed: number): number {
  const baseInterval = 95 + (seed % 55);
  const offset = (seed >>> 8) % baseInterval;
  const shifted = frame + offset;
  const cycleIndex = Math.floor(shifted / baseInterval);
  const localFrame = shifted - cycleIndex * baseInterval;

  const duration = 2 + Math.floor(hashToUnit(seed + cycleIndex * 97 + 11) * 3);
  const centerOffset = 6 + Math.floor(hashToUnit(seed + cycleIndex * 131 + 23) * 12);
  const center = baseInterval - centerOffset;
  const start = center - duration;
  const end = center + duration;

  if (localFrame < start || localFrame > end) {
    return 0;
  }

  const t = (localFrame - start) / Math.max(1, end - start);
  return 1 - Math.abs(t * 2 - 1);
}

function getSaccadeOffset(frame: number, seed: number): Vec2 {
  const segmentLength = 16;
  const offset = (seed >>> 5) % segmentLength;
  const shifted = frame + offset;
  const segment = Math.floor(shifted / segmentLength);
  const local = shifted - segment * segmentLength;
  const blend = smoothStep(clamp(local / 4, 0, 1));

  const fromX = hashToSigned(seed + segment * 17 + 3) * 2.8;
  const fromY = hashToSigned(seed + segment * 29 + 7) * 1.8;
  const toX = hashToSigned(seed + (segment + 1) * 17 + 3) * 2.8;
  const toY = hashToSigned(seed + (segment + 1) * 29 + 7) * 1.8;

  return {
    x: fromX + (toX - fromX) * blend,
    y: fromY + (toY - fromY) * blend
  };
}

function applyBoneLimits(bone: Bone, rotationDeg: number): number {
  const min = bone.limits?.min_rotation_deg;
  const max = bone.limits?.max_rotation_deg;
  if (typeof min === "number" && typeof max === "number") {
    return clamp(rotationDeg, min, max);
  }
  if (typeof min === "number") {
    return Math.max(min, rotationDeg);
  }
  if (typeof max === "number") {
    return Math.min(max, rotationDeg);
  }
  return rotationDeg;
}

function inferYawFromExpression(expression: string | undefined): number {
  if (!expression) {
    return 0;
  }

  const lower = expression.toLowerCase();
  const sign = lower.includes("left") ? -1 : 1;

  if (lower.includes("profile")) {
    return sign * 1;
  }
  if (lower.includes("3q")) {
    return sign * 0.55;
  }
  if (lower.includes("front")) {
    return 0;
  }
  return 0;
}

function resolveSignedYaw(yaw: number | undefined, expression: string | undefined): number {
  if (typeof yaw === "number" && Number.isFinite(yaw)) {
    return clamp(yaw, -1, 1);
  }

  return clamp(inferYawFromExpression(expression), -1, 1);
}

function resolveMorphYaw(signedYaw: number): number {
  return clamp(Math.abs(signedYaw), 0, 1);
}

function resolveMorphTarget(imageId: string): MorphTarget | null {
  if (imageId === "head" || imageId.startsWith("head_")) {
    return "head";
  }

  if (imageId === "torso" || imageId.startsWith("torso_")) {
    return "torso";
  }

  return null;
}

function resolveMorphSegment(target: MorphTarget, yaw: number): MorphSegment {
  const paths = target === "head" ? HEAD_PATHS : TORSO_PATHS;
  const clampedYaw = clamp(yaw, 0, 1);

  if (clampedYaw <= 0.5) {
    return {
      fromPath: paths.front,
      toPath: paths.threeQuarter,
      t: clamp(clampedYaw / 0.5, 0, 1)
    };
  }

  return {
    fromPath: paths.threeQuarter,
    toPath: paths.profile,
    t: clamp((clampedYaw - 0.5) / 0.5, 0, 1)
  };
}

function getPoseSlot(slotId: string, poseSpace: PoseSpaceResult): PoseSpaceSlotTransform | undefined {
  return (poseSpace.slots as Record<string, PoseSpaceSlotTransform | undefined>)[slotId];
}

function buildBoneWorld(
  pack: CharacterPack,
  pose: RigPose,
  overrides: Map<string, BoneOverride>
): Map<string, BoneWorld> {
  const map = new Map<string, BoneWorld>();
  const bonesById = new Map(pack.skeleton.bones.map((bone) => [bone.bone_id, bone]));

  const visit = (boneId: string): BoneWorld => {
    const cached = map.get(boneId);
    if (cached) {
      return cached;
    }

    const bone = bonesById.get(boneId);
    if (!bone) {
      throw new Error(`Unknown bone: ${boneId}`);
    }

    const override = overrides.get(boneId);
    const localPos = {
      x: bone.rest.x + (override?.x ?? 0),
      y: bone.rest.y + (override?.y ?? 0)
    };
    const localRot = bone.rest.rotation_deg + (override?.rotationDeg ?? 0);

    const hasParent = bone.parent_id.length > 0;
    if (!hasParent) {
      const root: BoneWorld = {
        x: pose.position.x + localPos.x,
        y: pose.position.y + localPos.y,
        rotationDeg: localRot
      };
      map.set(boneId, root);
      return root;
    }

    const parent = visit(bone.parent_id);
    const translated = rotate(localPos, parent.rotationDeg);
    const world: BoneWorld = {
      x: parent.x + translated.x,
      y: parent.y + translated.y,
      rotationDeg: parent.rotationDeg + localRot
    };
    map.set(boneId, world);
    return world;
  };

  for (const bone of pack.skeleton.bones) {
    visit(bone.bone_id);
  }

  return map;
}

function getBoneLength(pack: CharacterPack, boneId: string): number {
  const attachment = pack.skeleton.attachments.find((item) => item.bone_id === boneId);
  if (attachment) {
    const shape = getShape(attachment.image_id);
    const sx = attachment.scale?.x ?? 1;
    return Math.max(1, shape.width * sx);
  }

  const bone = pack.skeleton.bones.find((item) => item.bone_id === boneId);
  if (!bone) {
    return 80;
  }

  const child = pack.skeleton.bones.find((item) => item.parent_id === bone.bone_id);
  if (!child) {
    return 80;
  }

  return Math.max(1, Math.hypot(child.rest.x, child.rest.y));
}

function solveTwoBoneIk(
  shoulder: Vec2,
  target: Vec2,
  upperLen: number,
  lowerLen: number,
  elbowHint: "up" | "down",
  maxStretch: number
): {
  upperWorldDeg: number;
  lowerWorldDeg: number;
  effector: Vec2;
} {
  const rawDist = distance(shoulder, target);
  const safeDist = rawDist === 0 ? 0.0001 : rawDist;
  const minReach = Math.max(0.0001, Math.abs(upperLen - lowerLen));
  const maxReach = (upperLen + lowerLen) * maxStretch;
  const clampedDist = clamp(safeDist, minReach, maxReach);

  const dir = {
    x: (target.x - shoulder.x) / safeDist,
    y: (target.y - shoulder.y) / safeDist
  };
  const clampedTarget = {
    x: shoulder.x + dir.x * clampedDist,
    y: shoulder.y + dir.y * clampedDist
  };

  const along = (upperLen * upperLen - lowerLen * lowerLen + clampedDist * clampedDist) / (2 * clampedDist);
  const heightSq = Math.max(0, upperLen * upperLen - along * along);
  const height = Math.sqrt(heightSq);

  const basePoint = {
    x: shoulder.x + dir.x * along,
    y: shoulder.y + dir.y * along
  };
  const perp = elbowHint === "up" ? { x: -dir.y, y: dir.x } : { x: dir.y, y: -dir.x };

  const elbow = {
    x: basePoint.x + perp.x * height,
    y: basePoint.y + perp.y * height
  };

  const upperWorldDeg = (Math.atan2(elbow.y - shoulder.y, elbow.x - shoulder.x) * 180) / Math.PI;
  const lowerWorldDeg = (Math.atan2(clampedTarget.y - elbow.y, clampedTarget.x - elbow.x) * 180) / Math.PI;

  return {
    upperWorldDeg,
    lowerWorldDeg,
    effector: clampedTarget
  };
}

function getAttachmentAnchor(
  attachment: Attachment,
  boneWorld: BoneWorld,
  extraOffset?: {
    x?: number;
    y?: number;
  }
): Vec2 {
  const offset = {
    x: (attachment.offset?.x ?? 0) + (extraOffset?.x ?? 0),
    y: (attachment.offset?.y ?? 0) + (extraOffset?.y ?? 0)
  };
  return add({ x: boneWorld.x, y: boneWorld.y }, rotate(offset, boneWorld.rotationDeg));
}

export function move(x: number, y: number, pose: RigPose = DEFAULT_POSE): RigPose {
  return {
    ...pose,
    position: { x, y }
  };
}

export function lookAt(point: Vec2, pose: RigPose = DEFAULT_POSE): RigPose {
  return {
    ...pose,
    lookTarget: point
  };
}

export function pointAt(point: Vec2, pose: RigPose = DEFAULT_POSE): RigPose {
  return {
    ...pose,
    pointTarget: point
  };
}

export const EraserCatRig = ({
  pose = DEFAULT_POSE,
  targetPoint,
  pack = minimalCharacterPack,
  expression,
  opacity = 1,
  yaw,
  animationMode = "static",
  seed,
  talkText,
  mouthOpen,
  talkAudioData
}: RigProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const resolvedPose = targetPoint == null ? pose : pointAt(targetPoint, lookAt(targetPoint, pose));
  const isAlive = animationMode === "alive";

  const animationSeed = hashStringToSeed(seed ?? `${pack.pack_id}:${expression ?? "default"}`);
  const breathPhase = (frame + (animationSeed % 180)) * 0.1;
  const breathWave = isAlive ? Math.sin(breathPhase) : 0;
  const breathYOffset = breathWave * 2.4;
  const breathScaleX = 1 - breathWave * 0.006;
  const breathScaleY = 1 + breathWave * 0.012;
  const blinkAmount = isAlive ? getBlinkAmount(frame, animationSeed) : 0;
  const saccadeOffset = isAlive ? getSaccadeOffset(frame, animationSeed) : { x: 0, y: 0 };

  const speakingEnabled =
    typeof mouthOpen === "number" || Boolean(talkAudioData) || Boolean(talkText && talkText.trim().length > 0);
  const resolvedMouthOpen = speakingEnabled
    ? clamp(
        typeof mouthOpen === "number"
          ? mouthOpen
          : getMouthOpen(frame, fps, seed ?? `${pack.pack_id}:${expression ?? "default"}`, talkText, talkAudioData),
        0,
        1
      )
    : 0;

  const headLagDeg = isAlive ? Math.sin((frame - 4 + (animationSeed % 19)) * 0.12) * 1.8 : 0;
  const armLagUpperDeg = isAlive ? Math.sin((frame - 5 + (animationSeed % 23)) * 0.09) * 4.2 : 0;
  const armLagLowerDeg = isAlive ? Math.sin((frame - 8 + (animationSeed % 29)) * 0.11) * 5.4 : 0;

  const bonesById = new Map(pack.skeleton.bones.map((bone) => [bone.bone_id, bone]));
  const expressionConfig = expression ? pack.expressions[expression] : undefined;
  const slotImageOverrides = new Map<string, string>(
    (expressionConfig?.slot_overrides ?? []).map((entry) => [entry.slot_id, entry.image_id])
  );

  const overrides = new Map<string, BoneOverride>();
  for (const boneOverride of expressionConfig?.bone_overrides ?? []) {
    const existing = overrides.get(boneOverride.bone_id) ?? {};
    overrides.set(boneOverride.bone_id, {
      x: boneOverride.x ?? existing.x,
      y: boneOverride.y ?? existing.y,
      rotationDeg: boneOverride.rotation_deg ?? existing.rotationDeg
    });
  }

  if (isAlive) {
    const rootExisting = overrides.get("root") ?? {};
    overrides.set("root", {
      ...rootExisting,
      y: (rootExisting.y ?? 0) + breathYOffset
    });
  }

  let world = buildBoneWorld(pack, resolvedPose, overrides);

  const headBone = pack.skeleton.bones.find((bone) => bone.bone_id === "head");
  if (headBone && resolvedPose.lookTarget) {
    const headWorld = world.get(headBone.bone_id);
    const parentWorld = headBone.parent_id ? world.get(headBone.parent_id) : undefined;
    if (headWorld && parentWorld) {
      const lookDeg =
        (Math.atan2(resolvedPose.lookTarget.y - headWorld.y, resolvedPose.lookTarget.x - headWorld.x) * 180) /
        Math.PI;
      const localRotation = applyBoneLimits(headBone, lookDeg - parentWorld.rotationDeg - headBone.rest.rotation_deg);
      const existing = overrides.get(headBone.bone_id) ?? {};
      overrides.set(headBone.bone_id, {
        ...existing,
        rotationDeg: applyBoneLimits(headBone, localRotation + headLagDeg)
      });
      world = buildBoneWorld(pack, resolvedPose, overrides);
    }
  } else if (headBone && isAlive) {
    const existing = overrides.get(headBone.bone_id) ?? {};
    overrides.set(headBone.bone_id, {
      ...existing,
      rotationDeg: applyBoneLimits(headBone, (existing.rotationDeg ?? 0) + headLagDeg * 0.55)
    });
    world = buildBoneWorld(pack, resolvedPose, overrides);
  }

  if (isAlive && !resolvedPose.pointTarget) {
    const upperExisting = overrides.get("upper_arm") ?? {};
    const lowerExisting = overrides.get("lower_arm") ?? {};

    overrides.set("upper_arm", {
      ...upperExisting,
      rotationDeg: (upperExisting.rotationDeg ?? 0) + armLagUpperDeg
    });
    overrides.set("lower_arm", {
      ...lowerExisting,
      rotationDeg: (lowerExisting.rotationDeg ?? 0) + armLagLowerDeg
    });

    world = buildBoneWorld(pack, resolvedPose, overrides);
  }

  let effectorPoint: Vec2 | undefined;
  const chain = pack.ik_chains[0];
  if (chain && resolvedPose.pointTarget) {
    const upperBone = bonesById.get(chain.bones[0]);
    const lowerBone = bonesById.get(chain.bones[1]);
    if (upperBone && lowerBone) {
      const parentWorld = upperBone.parent_id ? world.get(upperBone.parent_id) : undefined;
      if (parentWorld) {
        const shoulder = add(
          { x: parentWorld.x, y: parentWorld.y },
          rotate({ x: upperBone.rest.x, y: upperBone.rest.y }, parentWorld.rotationDeg)
        );

        const upperLen = getBoneLength(pack, upperBone.bone_id);
        const lowerLen = getBoneLength(pack, lowerBone.bone_id);
        const ik = solveTwoBoneIk(
          shoulder,
          resolvedPose.pointTarget,
          upperLen,
          lowerLen,
          chain.elbow_hint ?? "down",
          chain.max_stretch ?? 1.05
        );

        const upperLocal = applyBoneLimits(
          upperBone,
          ik.upperWorldDeg - parentWorld.rotationDeg - upperBone.rest.rotation_deg
        );

        const upperWorldDeg = parentWorld.rotationDeg + upperBone.rest.rotation_deg + upperLocal;
        const lowerLocal = applyBoneLimits(lowerBone, ik.lowerWorldDeg - upperWorldDeg - lowerBone.rest.rotation_deg);

        const upperExisting = overrides.get(upperBone.bone_id) ?? {};
        const lowerExisting = overrides.get(lowerBone.bone_id) ?? {};
        overrides.set(upperBone.bone_id, { ...upperExisting, rotationDeg: upperLocal });
        overrides.set(lowerBone.bone_id, { ...lowerExisting, rotationDeg: lowerLocal });
        effectorPoint = ik.effector;
        world = buildBoneWorld(pack, resolvedPose, overrides);
      }
    }
  }

  const signedYaw = resolveSignedYaw(yaw, expression);
  const morphYaw = resolveMorphYaw(signedYaw);
  const poseSpace = getPoseSpace(signedYaw);

  const headWorld = world.get("head");
  const lookEyeOffset =
    isAlive && resolvedPose.lookTarget && headWorld
      ? (() => {
          const dx = resolvedPose.lookTarget.x - headWorld.x;
          const dy = resolvedPose.lookTarget.y - headWorld.y;
          const len = Math.max(1, Math.hypot(dx, dy));
          return {
            x: clamp((dx / len) * 2.2, -2.2, 2.2),
            y: clamp((dy / len) * 1.6, -1.6, 1.6)
          };
        })()
      : { x: 0, y: 0 };

  const slotZ = new Map(pack.slots.map((slot) => [slot.slot_id, slot.z_index ?? 0]));
  const attachments = [...pack.skeleton.attachments]
    .map((attachment) => {
      const imageId = slotImageOverrides.get(attachment.slot_id);
      if (!imageId) {
        return attachment;
      }

      return {
        ...attachment,
        image_id: imageId
      };
    })
    .sort((a, b) => {
      const aPose = getPoseSlot(a.slot_id, poseSpace);
      const bPose = getPoseSlot(b.slot_id, poseSpace);
      const az = (slotZ.get(a.slot_id) ?? 0) + (aPose?.zBias ?? 0);
      const bz = (slotZ.get(b.slot_id) ?? 0) + (bPose?.zBias ?? 0);
      return az - bz;
    });

  const pawAttachment = attachments.find((attachment) => attachment.slot_id === "paw");
  const pawAnchor =
    pawAttachment && world.get(pawAttachment.bone_id)
      ? getAttachmentAnchor(pawAttachment, world.get(pawAttachment.bone_id) as BoneWorld)
      : undefined;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: pack.canvas.base_width,
        height: pack.canvas.base_height,
        opacity
      }}
    >
      {attachments.map((attachment) => {
        const boneWorld = world.get(attachment.bone_id);
        if (!boneWorld) {
          return null;
        }

        const shape = getShape(attachment.image_id);
        const slotPose = getPoseSlot(attachment.slot_id as PoseSpaceSlotId, poseSpace);

        let dynamicOffsetX = slotPose?.offsetX ?? 0;
        let dynamicOffsetY = slotPose?.offsetY ?? 0;
        let localScaleX = 1;
        let localScaleY = 1;
        let localOpacity = slotPose?.opacity ?? 1;

        if (isAlive) {
          if (attachment.slot_id === "torso" || attachment.slot_id === "head") {
            localScaleX *= breathScaleX;
            localScaleY *= breathScaleY;
          }

          if (attachment.slot_id.includes("eye")) {
            dynamicOffsetX += lookEyeOffset.x + saccadeOffset.x;
            dynamicOffsetY += lookEyeOffset.y + saccadeOffset.y;
            localOpacity *= 1 - blinkAmount * 0.92;
          }

          if (attachment.slot_id === "eyelid") {
            localOpacity *= blinkAmount;
            localScaleY *= 0.35 + blinkAmount * 0.95;
            dynamicOffsetY += blinkAmount * 8;
          }

          if (attachment.slot_id === "mouth") {
            dynamicOffsetY += breathWave * 0.8;
          }
        } else if (attachment.slot_id === "eyelid") {
          localOpacity = 0;
        }

        const isMouthSlot = attachment.slot_id === "mouth" || attachment.slot_id.includes("mouth");
        if (isMouthSlot && resolvedMouthOpen > 0) {
          localScaleX *= 1 - resolvedMouthOpen * 0.16;
          localScaleY *= 1 + resolvedMouthOpen * 1.45;
          dynamicOffsetY += resolvedMouthOpen * 2.2;
        }

        const sx = (attachment.scale?.x ?? 1) * (slotPose?.scaleX ?? 1) * localScaleX;
        const sy = (attachment.scale?.y ?? 1) * (slotPose?.scaleY ?? 1) * localScaleY;
        const width = shape.width * sx;
        const height = shape.height * sy;
        const slotOpacity = localOpacity;

        if (slotOpacity <= 0.01 || width <= 0.1 || height <= 0.1) {
          return null;
        }

        const anchor = getAttachmentAnchor(attachment, boneWorld, {
          x: dynamicOffsetX,
          y: dynamicOffsetY
        });

        const left = anchor.x - attachment.pivot.px * width;
        const top = anchor.y - attachment.pivot.py * height;
        const transform = `rotate(${boneWorld.rotationDeg + (attachment.rotation_deg ?? 0)}deg)`;

        const baseStyle: CSSProperties = {
          position: "absolute",
          left,
          top,
          width,
          height,
          transform,
          transformOrigin: `${attachment.pivot.px * width}px ${attachment.pivot.py * height}px`,
          opacity: slotOpacity
        };

        const assetImageRef = resolveAssetImageRef(pack, attachment.image_id);
        if (assetImageRef) {
          return (
            <div
              key={`${attachment.slot_id}:${attachment.image_id}`}
              style={{
                ...baseStyle,
                borderRadius: shape.borderRadius,
                background: shape.color,
                boxShadow: "0 8px 20px rgba(0, 0, 0, 0.22)",
                overflow: "hidden"
              }}
            >
              <img
                src={assetImageRef}
                alt={attachment.slot_id}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block"
                }}
              />
            </div>
          );
        }

        const morphTarget = resolveMorphTarget(attachment.image_id);
        if (morphTarget) {
          const segment = resolveMorphSegment(morphTarget, morphYaw);
          return (
            <div
              key={`${attachment.slot_id}:${attachment.image_id}`}
              style={{
                ...baseStyle,
                background: "transparent",
                borderRadius: 0,
                boxShadow: "none",
                overflow: "visible"
              }}
            >
              <SvgPathMorph
                fromPath={segment.fromPath}
                toPath={segment.toPath}
                t={segment.t}
                width={width}
                height={height}
                fill={shape.color}
                style={{
                  filter: "drop-shadow(0 8px 20px rgba(0, 0, 0, 0.22))"
                }}
              />
            </div>
          );
        }

        const style: CSSProperties = {
          ...baseStyle,
          borderRadius: shape.borderRadius,
          background: shape.color,
          boxShadow: "0 8px 20px rgba(0, 0, 0, 0.22)"
        };

        return <div key={`${attachment.slot_id}:${attachment.image_id}`} style={style} />;
      })}

      {resolvedPose.pointTarget && pawAnchor && effectorPoint ? (
        <svg
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none"
          }}
        >
          <line
            x1={pawAnchor.x}
            y1={pawAnchor.y}
            x2={effectorPoint.x}
            y2={effectorPoint.y}
            stroke="#ffffff"
            strokeOpacity={0.65}
            strokeDasharray="8 8"
            strokeWidth={3}
          />
          <circle cx={effectorPoint.x} cy={effectorPoint.y} r={9} fill="#ffffff" fillOpacity={0.9} />
        </svg>
      ) : null}
    </div>
  );
};
