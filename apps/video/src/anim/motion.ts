import { delayed, easeInOut, overshoot } from "./easing";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function followThrough(value: number, delayFrames: number): number {
  if (value >= 0 && value <= 1) {
    const shifted = delayed(value, delayFrames);
    return clamp(overshoot(easeInOut(shifted), 0.18), 0, 1.2);
  }

  return delayed(value, delayFrames);
}

export function anticipation(from: number, to: number, t: number): number {
  const x = clamp(t, 0, 1);
  const delta = to - from;

  if (x < 0.22) {
    const a = easeInOut(x / 0.22);
    return from - delta * 0.12 * (1 - a);
  }

  const forwardT = (x - 0.22) / 0.78;
  return lerp(from, to, clamp(overshoot(forwardT, 0.28), 0, 1.2));
}

export function settle(from: number, to: number, t: number): number {
  const x = clamp(t, 0, 1);
  return lerp(from, to, easeInOut(x));
}
