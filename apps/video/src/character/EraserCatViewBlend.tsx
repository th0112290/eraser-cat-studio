import { DirectionalBlend } from "../effects/DirectionalBlend";
import type { MascotProfile } from "@ec/profiles";
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
  mouthOpen?: number;
  viseme?: string;
  forceBlink?: boolean;
  blinkDensity?: MascotProfile["blink_density"];
  mouthIntensity?: MascotProfile["mouth_intensity"];
  idleMotionAmount?: MascotProfile["idle_motion_amount"];
  headBobEnergy?: MascotProfile["head_bob_energy"];
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
  talkText,
  mouthOpen,
  viseme,
  forceBlink,
  blinkDensity,
  mouthIntensity,
  idleMotionAmount,
  headBobEnergy
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
        mouthOpen={mouthOpen}
        viseme={viseme}
        forceBlink={forceBlink}
        blinkDensity={blinkDensity}
        mouthIntensity={mouthIntensity}
        idleMotionAmount={idleMotionAmount}
        headBobEnergy={headBobEnergy}
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
        mouthOpen={mouthOpen}
        viseme={viseme}
        forceBlink={forceBlink}
        blinkDensity={blinkDensity}
        mouthIntensity={mouthIntensity}
        idleMotionAmount={idleMotionAmount}
        headBobEnergy={headBobEnergy}
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
        mouthOpen={mouthOpen}
        viseme={viseme}
        forceBlink={forceBlink}
        blinkDensity={blinkDensity}
        mouthIntensity={mouthIntensity}
        idleMotionAmount={idleMotionAmount}
        headBobEnergy={headBobEnergy}
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
        mouthOpen={mouthOpen}
        viseme={viseme}
        forceBlink={forceBlink}
        blinkDensity={blinkDensity}
        mouthIntensity={mouthIntensity}
        idleMotionAmount={idleMotionAmount}
        headBobEnergy={headBobEnergy}
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
        mouthOpen={mouthOpen}
        viseme={viseme}
        forceBlink={forceBlink}
        blinkDensity={blinkDensity}
        mouthIntensity={mouthIntensity}
        idleMotionAmount={idleMotionAmount}
        headBobEnergy={headBobEnergy}
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
              mouthOpen={mouthOpen}
              viseme={viseme}
              forceBlink={forceBlink}
              blinkDensity={blinkDensity}
              mouthIntensity={mouthIntensity}
              idleMotionAmount={idleMotionAmount}
              headBobEnergy={headBobEnergy}
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
              mouthOpen={mouthOpen}
              viseme={viseme}
              forceBlink={forceBlink}
              blinkDensity={blinkDensity}
              mouthIntensity={mouthIntensity}
              idleMotionAmount={idleMotionAmount}
              headBobEnergy={headBobEnergy}
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
