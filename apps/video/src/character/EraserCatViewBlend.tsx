import { DirectionalBlend } from "../effects/DirectionalBlend";
import { EraserCatRig } from "./EraserCatRig";
import { turningCharacterPack } from "./pack";
import type { CharacterPack, RigPose, Vec2 } from "./types";

type AnimationMode = "static" | "alive";

type ViewBlendProps = {
  pose: RigPose;
  yaw: number;
  pack?: CharacterPack;
  targetPoint?: Vec2;
  useOpacityBlend?: boolean;
  featherPx?: number;
  animationMode?: AnimationMode;
  seed?: string;
  talkText?: string;
};

type BlendSelection = {
  fromExpression: string;
  toExpression: string;
  progress: number;
  sign: -1 | 1;
};

const FRONT_EXPRESSION = "view_front";
const RIGHT_3Q_EXPRESSION = "view_right_3q";
const RIGHT_PROFILE_EXPRESSION = "view_right_profile";
const LEFT_3Q_EXPRESSION = "view_left_3q";
const LEFT_PROFILE_EXPRESSION = "view_left_profile";

const FRONT_SAFE_YAW_FOR_POINTING = 0.18;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveBlend(yaw: number): BlendSelection {
  const clampedYaw = clamp(yaw, -1, 1);
  const sign: -1 | 1 = clampedYaw < 0 ? -1 : 1;
  const abs = Math.abs(clampedYaw);

  if (abs <= 0.05) {
    return {
      fromExpression: FRONT_EXPRESSION,
      toExpression: FRONT_EXPRESSION,
      progress: 0,
      sign
    };
  }

  if (abs <= 0.5) {
    return {
      fromExpression: FRONT_EXPRESSION,
      toExpression: sign > 0 ? RIGHT_3Q_EXPRESSION : LEFT_3Q_EXPRESSION,
      progress: abs / 0.5,
      sign
    };
  }

  return {
    fromExpression: sign > 0 ? RIGHT_3Q_EXPRESSION : LEFT_3Q_EXPRESSION,
    toExpression: sign > 0 ? RIGHT_PROFILE_EXPRESSION : LEFT_PROFILE_EXPRESSION,
    progress: (abs - 0.5) / 0.5,
    sign
  };
}

function createLayerStyle(transform: string) {
  return {
    position: "absolute" as const,
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    transform,
    transformOrigin: "50% 50%",
    willChange: "transform"
  };
}

export const EraserCatViewBlend = ({
  pose,
  yaw,
  pack = turningCharacterPack,
  targetPoint,
  useOpacityBlend = false,
  featherPx = 84,
  animationMode = "static",
  seed,
  talkText
}: ViewBlendProps) => {
  const clampedYaw = clamp(yaw, -1, 1);

  if (targetPoint && Math.abs(clampedYaw) <= FRONT_SAFE_YAW_FOR_POINTING) {
    return (
      <EraserCatRig
        pose={pose}
        targetPoint={targetPoint}
        pack={pack}
        expression={FRONT_EXPRESSION}
        opacity={1}
        yaw={clampedYaw}
        animationMode={animationMode}
        seed={seed}
        talkText={talkText}
      />
    );
  }

  const blend = resolveBlend(clampedYaw);
  const progress = clamp(blend.progress, 0, 1);

  if (blend.fromExpression === blend.toExpression || progress <= 0) {
    return (
      <EraserCatRig
        pose={pose}
        targetPoint={targetPoint}
        pack={pack}
        expression={blend.fromExpression}
        opacity={1}
        yaw={clampedYaw}
        animationMode={animationMode}
        seed={seed}
        talkText={talkText}
      />
    );
  }

  if (progress >= 1) {
    return (
      <EraserCatRig
        pose={pose}
        targetPoint={targetPoint}
        pack={pack}
        expression={blend.toExpression}
        opacity={1}
        yaw={clampedYaw}
        animationMode={animationMode}
        seed={seed}
        talkText={talkText}
      />
    );
  }

  const lateralShift = targetPoint ? 0 : blend.sign * 4;
  const fromTransform = `translateX(${(-lateralShift * progress).toFixed(2)}px) scale(${(1 - 0.02 * progress).toFixed(4)})`;
  const toTransform = `translateX(${(lateralShift * (1 - progress)).toFixed(2)}px) scale(${(0.98 + 0.02 * progress).toFixed(
    4
  )})`;

  const fromRig = (
    <div style={createLayerStyle(fromTransform)}>
      <EraserCatRig
        pose={pose}
        targetPoint={targetPoint}
        pack={pack}
        expression={blend.fromExpression}
        opacity={1}
        yaw={clampedYaw}
        animationMode={animationMode}
        seed={seed}
        talkText={talkText}
      />
    </div>
  );

  const toRig = (
    <div style={createLayerStyle(toTransform)}>
      <EraserCatRig
        pose={pose}
        targetPoint={targetPoint}
        pack={pack}
        expression={blend.toExpression}
        opacity={1}
        yaw={clampedYaw}
        animationMode={animationMode}
        seed={seed}
        talkText={talkText}
      />
    </div>
  );

  const direction = blend.sign > 0 ? "left" : "right";

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: pack.canvas.base_width,
        height: pack.canvas.base_height,
        pointerEvents: "none"
      }}
    >
      {useOpacityBlend ? (
        <>
          <div style={createLayerStyle(fromTransform)}>
            <EraserCatRig
              pose={pose}
              targetPoint={targetPoint}
              pack={pack}
              expression={blend.fromExpression}
              opacity={1 - progress}
              yaw={clampedYaw}
              animationMode={animationMode}
              seed={seed}
              talkText={talkText}
            />
          </div>
          <div style={createLayerStyle(toTransform)}>
            <EraserCatRig
              pose={pose}
              targetPoint={targetPoint}
              pack={pack}
              expression={blend.toExpression}
              opacity={progress}
              yaw={clampedYaw}
              animationMode={animationMode}
              seed={seed}
              talkText={talkText}
            />
          </div>
        </>
      ) : (
        <DirectionalBlend t={progress} direction={direction} featherPx={featherPx}>
          <DirectionalBlend.From>{fromRig}</DirectionalBlend.From>
          <DirectionalBlend.To>{toRig}</DirectionalBlend.To>
        </DirectionalBlend>
      )}
    </div>
  );
};
