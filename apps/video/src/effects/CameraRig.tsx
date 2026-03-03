import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { noise1D, noise2D } from "../anim/noise";
import { hashStringToSeed } from "../anim/seed";

export type LegacyCameraPreset = "none" | "shake" | "whip-pan-left" | "whip-pan-right";
export type CinematicCameraPreset = "static" | "slow_push" | "handheld" | "whip_pan" | "snap_zoom";
export type CameraPreset = LegacyCameraPreset | CinematicCameraPreset;

export type ShakeConfig = {
  intensity?: number;
  speed?: number;
  rotationIntensityDeg?: number;
};

export type CameraRigKeyframe = {
  f: number;
  x: number;
  y: number;
  zoom: number;
  rot: number;
  shake: number;
};

export type CameraRigProps = {
  children: ReactNode;
  width?: number;
  height?: number;
  t?: number;
  keyframes?: CameraRigKeyframe[];
  preset?: CameraPreset;
  seed?: string;
  pan?: { x: number; y: number };
  zoom?: number;
  rotateDeg?: number;
  shake?: ShakeConfig;
  presetProgress?: number;
};

const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothStep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function wave(frame: number, speed: number, phase: number): number {
  return Math.sin(frame * speed + phase);
}

function asDuration(durationFrames: number): number {
  return Math.max(2, Math.floor(durationFrames));
}

function seedToNumber(seed: string | undefined, preset: CameraPreset | undefined): number {
  return hashStringToSeed(seed ?? preset ?? "camera-rig");
}

function toCinematicPreset(preset: CameraPreset | undefined): CinematicCameraPreset {
  if (preset === "slow_push" || preset === "handheld" || preset === "whip_pan" || preset === "snap_zoom") {
    return preset;
  }

  if (preset === "shake") {
    return "handheld";
  }

  if (preset === "whip-pan-left" || preset === "whip-pan-right") {
    return "whip_pan";
  }

  return "static";
}

function isLegacyPreset(preset: CameraPreset | undefined): preset is LegacyCameraPreset {
  return preset === "none" || preset === "shake" || preset === "whip-pan-left" || preset === "whip-pan-right";
}

function isCinematicPreset(preset: CameraPreset | undefined): preset is CinematicCameraPreset {
  return (
    preset === "static" ||
    preset === "slow_push" ||
    preset === "handheld" ||
    preset === "whip_pan" ||
    preset === "snap_zoom"
  );
}

function getSignedSeed(seedNum: number): number {
  return seedNum % 2 === 0 ? 1 : -1;
}

export function getPresetKeyframes(
  preset: CameraPreset | undefined,
  durationFrames: number,
  seed?: string
): CameraRigKeyframe[] {
  const safeDuration = asDuration(durationFrames);
  const end = safeDuration - 1;
  const seedNum = seedToNumber(seed, preset);
  const dir = getSignedSeed(seedNum);
  const cinematicPreset = toCinematicPreset(preset);

  if (cinematicPreset === "slow_push") {
    const startX = ((seedNum >>> 3) % 90) - 45;
    const startY = ((seedNum >>> 9) % 70) - 35;
    return [
      { f: 0, x: startX, y: startY, zoom: 1.01, rot: dir * 0.35, shake: 0.08 },
      { f: Math.floor(end * 0.6), x: startX + dir * 26, y: startY - 12, zoom: 1.07, rot: dir * 0.18, shake: 0.09 },
      { f: end, x: startX + dir * 34, y: startY - 18, zoom: 1.12, rot: dir * 0.08, shake: 0.1 }
    ];
  }

  if (cinematicPreset === "handheld") {
    return [
      { f: 0, x: 0, y: 0, zoom: 1.02, rot: 0, shake: 0.85 },
      { f: Math.floor(end * 0.5), x: dir * 8, y: -6, zoom: 1.03, rot: dir * 0.6, shake: 0.95 },
      { f: end, x: dir * 4, y: 2, zoom: 1.01, rot: dir * 0.25, shake: 0.88 }
    ];
  }

  if (cinematicPreset === "whip_pan") {
    const centerX = dir * 140;
    const peakX = dir * 860;
    const overshootX = -dir * 190;
    return [
      { f: 0, x: centerX, y: 0, zoom: 1.03, rot: dir * 0.9, shake: 0.18 },
      { f: Math.max(1, Math.floor(end * 0.22)), x: peakX, y: -18, zoom: 1.07, rot: dir * 9.8, shake: 1.25 },
      {
        f: Math.max(2, Math.floor(end * 0.42)),
        x: overshootX,
        y: 14,
        zoom: 1.02,
        rot: -dir * 2.1,
        shake: 0.44
      },
      { f: end, x: 0, y: 0, zoom: 1, rot: 0, shake: 0.1 }
    ];
  }

  if (cinematicPreset === "snap_zoom") {
    return [
      { f: 0, x: 0, y: 0, zoom: 1, rot: 0, shake: 0.12 },
      { f: Math.max(1, Math.floor(end * 0.16)), x: dir * 24, y: -10, zoom: 1.3, rot: dir * 1.3, shake: 0.9 },
      { f: Math.max(2, Math.floor(end * 0.35)), x: dir * 8, y: 0, zoom: 0.98, rot: -dir * 0.45, shake: 0.34 },
      { f: end, x: 0, y: 0, zoom: 1.08, rot: 0, shake: 0.12 }
    ];
  }

  return [
    { f: 0, x: 0, y: 0, zoom: 1, rot: 0, shake: 0.06 },
    { f: end, x: 0, y: 0, zoom: 1, rot: 0, shake: 0.06 }
  ];
}

function evaluateKeyframes(keyframes: CameraRigKeyframe[], frame: number): CameraRigKeyframe {
  if (keyframes.length === 0) {
    return {
      f: 0,
      x: 0,
      y: 0,
      zoom: 1,
      rot: 0,
      shake: 0
    };
  }

  const sorted = [...keyframes].sort((a, b) => a.f - b.f);

  if (frame <= sorted[0].f) {
    return sorted[0];
  }

  const last = sorted[sorted.length - 1];
  if (frame >= last.f) {
    return last;
  }

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];

    if (frame >= a.f && frame <= b.f) {
      const rawT = (frame - a.f) / Math.max(1, b.f - a.f);
      const t = smoothStep(rawT);

      return {
        f: frame,
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        zoom: lerp(a.zoom, b.zoom, t),
        rot: lerp(a.rot, b.rot, t),
        shake: lerp(a.shake, b.shake, t)
      };
    }
  }

  return last;
}

export const CameraRig = ({
  children,
  width,
  height,
  t,
  keyframes,
  preset = "none",
  seed,
  pan,
  zoom = 1,
  rotateDeg = 0,
  shake,
  presetProgress = 0
}: CameraRigProps) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const durationFrames = asDuration(durationInFrames);
  const safeWidth = width ?? BASE_WIDTH;
  const safeHeight = height ?? BASE_HEIGHT;

  const isNewFlow = Boolean(keyframes && keyframes.length > 0) || isCinematicPreset(preset) || typeof t === "number";

  if (isNewFlow) {
    const effectiveFrame =
      typeof t === "number"
        ? clamp(t, 0, 1) * (durationFrames - 1)
        : clamp(frame, 0, durationFrames - 1);

    const baseKeyframes =
      keyframes && keyframes.length > 0 ? keyframes : getPresetKeyframes(preset, durationFrames, seed);

    const sampled = evaluateKeyframes(baseKeyframes, effectiveFrame);
    const seedNum = seedToNumber(seed, preset);

    const xScale = safeWidth / BASE_WIDTH;
    const yScale = safeHeight / BASE_HEIGHT;

    const shakePower = Math.max(0, sampled.shake);
    const microX = noise1D(seedNum + 11, effectiveFrame * 0.06) * shakePower * 18;
    const microY = noise2D(seedNum + 29, effectiveFrame * 0.05, 1.37) * shakePower * 14;
    const microRot = noise1D(seedNum + 47, effectiveFrame * 0.08) * shakePower * 1.6;
    const microZoom = noise1D(seedNum + 73, effectiveFrame * 0.04) * shakePower * 0.006;

    const finalX = sampled.x * xScale + microX;
    const finalY = sampled.y * yScale + microY;
    const finalZoom = Math.max(0.2, sampled.zoom + microZoom);
    const finalRot = sampled.rot + microRot;

    const blurAmount =
      toCinematicPreset(preset) === "whip_pan"
        ? interpolate(shakePower, [0, 0.6, 1.25], [0, 2.2, 8.2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp"
          })
        : 0;

    const transform = [
      `translate3d(${finalX.toFixed(2)}px, ${finalY.toFixed(2)}px, 0)`,
      `scale(${finalZoom.toFixed(4)})`,
      `rotate(${finalRot.toFixed(3)}deg)`
    ].join(" ");

    return (
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <AbsoluteFill
          style={{
            transform,
            transformOrigin: "50% 50%",
            filter: blurAmount > 0.01 ? `blur(${blurAmount.toFixed(2)}px)` : undefined,
            willChange: "transform, filter"
          }}
        >
          {children}
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const basePanX = pan?.x ?? 0;
  const basePanY = pan?.y ?? 0;

  const effectiveShake =
    preset === "shake"
      ? {
          intensity: shake?.intensity ?? 10,
          speed: shake?.speed ?? 0.95,
          rotationIntensityDeg: shake?.rotationIntensityDeg ?? 1.1
        }
      : shake;

  const shakeIntensity = effectiveShake?.intensity ?? 0;
  const shakeSpeed = effectiveShake?.speed ?? 1;
  const shakeRotationIntensity = effectiveShake?.rotationIntensityDeg ?? 0;

  const shakeX =
    shakeIntensity === 0
      ? 0
      :
          shakeIntensity *
          (wave(frame, shakeSpeed * 0.21, 0.4) * 0.6 + wave(frame, shakeSpeed * 0.49, 1.7) * 0.4);
  const shakeY =
    shakeIntensity === 0
      ? 0
      :
          shakeIntensity *
          (wave(frame, shakeSpeed * 0.27, 2.4) * 0.6 + wave(frame, shakeSpeed * 0.53, 0.1) * 0.4);
  const shakeRotation =
    shakeRotationIntensity === 0 ? 0 : wave(frame, shakeSpeed * 0.3, 0.9) * shakeRotationIntensity;

  const whipProgress = clamp(presetProgress, 0, 1);
  const isWhip = preset === "whip-pan-left" || preset === "whip-pan-right";
  const whipDirection = preset === "whip-pan-left" ? -1 : 1;

  const whipOffsetX =
    isWhip
      ? whipDirection *
        interpolate(whipProgress, [0, 0.7, 1], [0, 560, 2260], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })
      : 0;

  const whipOffsetY =
    isWhip
      ? interpolate(whipProgress, [0, 0.6, 1], [0, -40, 20], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })
      : 0;

  const whipRotate =
    isWhip
      ? whipDirection *
        interpolate(whipProgress, [0, 0.5, 1], [0, 10, 1.8], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })
      : 0;

  const whipBlur =
    isWhip
      ? interpolate(whipProgress, [0, 0.5, 1], [0, 8, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        })
      : 0;

  const transform = [
    `translate3d(${(basePanX + shakeX + whipOffsetX).toFixed(2)}px, ${(basePanY + shakeY + whipOffsetY).toFixed(2)}px, 0)`,
    `scale(${zoom.toFixed(4)})`,
    `rotate(${(rotateDeg + shakeRotation + whipRotate).toFixed(3)}deg)`
  ].join(" ");

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform,
          transformOrigin: "50% 50%",
          filter: whipBlur > 0 ? `blur(${whipBlur.toFixed(2)}px)` : undefined,
          willChange: "transform, filter"
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};