import { EraserCatRig } from "./EraserCatRig";
import { EraserCatViewBlend } from "./EraserCatViewBlend";
import {
  inferMascotIdFromPackId,
  resolveCharacterPack,
  resolveViewBlendPack,
  type MascotId
} from "./pack";
import type { RigPose, Vec2 } from "./types";

type AnimationMode = "static" | "alive";

type MascotRendererProps = {
  mascotId?: MascotId | string;
  characterPackId?: string;
  pose: RigPose;
  targetPoint?: Vec2;
  expression?: string;
  yaw?: number;
  useYawBlend: boolean;
  animationMode?: AnimationMode;
  seed?: string;
  talkText?: string;
};

function normalizeMascotId(mascotId: MascotRendererProps["mascotId"], characterPackId: string | undefined): MascotId {
  if (mascotId === "eraser_cat" || mascotId === "med_dog" || mascotId === "unknown") {
    return mascotId;
  }
  return inferMascotIdFromPackId(characterPackId);
}

export const MascotRenderer = ({
  mascotId,
  characterPackId,
  pose,
  targetPoint,
  expression,
  yaw = 0,
  useYawBlend,
  animationMode = "static",
  seed,
  talkText
}: MascotRendererProps) => {
  const resolvedMascotId = normalizeMascotId(mascotId, characterPackId);

  // Runtime stays mascot-aware even while eraser_cat is the only implemented renderer.
  if (useYawBlend) {
    return (
      <EraserCatViewBlend
        pose={pose}
        yaw={yaw}
        targetPoint={targetPoint}
        pack={resolveViewBlendPack(characterPackId)}
        animationMode={animationMode}
        seed={seed}
        talkText={talkText}
      />
    );
  }

  return (
    <EraserCatRig
      pose={pose}
      targetPoint={targetPoint}
      pack={resolveCharacterPack(characterPackId, resolvedMascotId !== "unknown")}
      expression={expression}
      animationMode={animationMode}
      seed={seed}
      talkText={talkText}
    />
  );
};
