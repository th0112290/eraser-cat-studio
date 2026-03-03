export type PoseSpaceSlotId = "eye_near" | "eye_far" | "nose" | "mouth" | "ear_near" | "ear_far";

export type PoseSpaceSlotTransform = {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  zBias: number;
};

export type PoseSpaceResult = {
  yaw: number;
  slots: Record<PoseSpaceSlotId, PoseSpaceSlotTransform>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function makeSlot(partial: Partial<PoseSpaceSlotTransform>): PoseSpaceSlotTransform {
  return {
    offsetX: round3(partial.offsetX ?? 0),
    offsetY: round3(partial.offsetY ?? 0),
    scaleX: round3(partial.scaleX ?? 1),
    scaleY: round3(partial.scaleY ?? 1),
    opacity: round3(partial.opacity ?? 1),
    zBias: round3(partial.zBias ?? 0)
  };
}

export function getPoseSpace(yaw: number): PoseSpaceResult {
  const clampedYaw = clamp(yaw, -1, 1);
  const absYaw = Math.abs(clampedYaw);
  const turnSign = clampedYaw < 0 ? -1 : 1;

  const q = smoothstep(0.12, 0.62, absYaw);
  const p = smoothstep(0.48, 0.98, absYaw);

  const eyeFarScale = lerp(1, 0.12, p);
  const eyeFarOpacity = absYaw > 0.94 ? 0 : lerp(1, 0.08, p);

  return {
    yaw: round3(clampedYaw),
    slots: {
      eye_near: makeSlot({
        offsetX: turnSign * lerp(0, 7, q),
        offsetY: lerp(0, -1.5, q),
        scaleX: lerp(1, 1.08, q),
        scaleY: lerp(1, 1.02, q),
        opacity: 1,
        zBias: 1
      }),
      eye_far: makeSlot({
        offsetX: turnSign * lerp(0, -8, q),
        offsetY: lerp(0, -1, q),
        scaleX: eyeFarScale,
        scaleY: lerp(1, 0.75, p),
        opacity: eyeFarOpacity,
        zBias: -2
      }),
      nose: makeSlot({
        offsetX: turnSign * lerp(0, 12, q),
        offsetY: lerp(0, -0.6, q),
        scaleX: lerp(1, 0.9, p),
        scaleY: lerp(1, 0.94, p),
        opacity: 1,
        zBias: 3
      }),
      mouth: makeSlot({
        offsetX: turnSign * lerp(0, 8, q),
        offsetY: lerp(0, 1.2, q),
        scaleX: lerp(1, 0.9, p),
        scaleY: lerp(1, 0.95, p),
        opacity: lerp(1, 0.92, p),
        zBias: 2
      }),
      ear_near: makeSlot({
        offsetX: turnSign * lerp(0, 9, q),
        offsetY: lerp(0, -1.5, q),
        scaleX: lerp(1, 1.06, q),
        scaleY: lerp(1, 1.02, q),
        opacity: 1,
        zBias: 3
      }),
      ear_far: makeSlot({
        offsetX: turnSign * lerp(0, -14, q),
        offsetY: lerp(0, 2.4, q),
        scaleX: lerp(1, 0.62, p),
        scaleY: lerp(1, 0.76, p),
        opacity: lerp(1, 0.72, p),
        zBias: absYaw > 0.58 ? -5 : -1
      })
    }
  };
}
