import { interpolate, spring, type SpringConfig } from "remotion";

type MotionFrame = {
  frame: number;
  fps: number;
  config?: SpringConfig;
};

type OvershootMotion = MotionFrame & {
  overshoot?: number;
  settleAt?: number;
};

const DEFAULT_DELAY_SPRING: SpringConfig = {
  damping: 16,
  stiffness: 120,
  mass: 0.8,
  overshootClamping: false
};

const DEFAULT_OVERSHOOT_SPRING: SpringConfig = {
  damping: 11,
  stiffness: 96,
  mass: 0.78,
  overshootClamping: false
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function delayedSpring(value: MotionFrame, delayFrames: number): number {
  return spring({
    frame: value.frame - delayFrames,
    fps: value.fps,
    config: value.config ?? DEFAULT_DELAY_SPRING
  });
}

export function overshootSpring(from: number, to: number, motion: OvershootMotion): number {
  const progress = spring({
    frame: motion.frame,
    fps: motion.fps,
    config: motion.config ?? DEFAULT_OVERSHOOT_SPRING
  });

  const settleAt = clamp(motion.settleAt ?? 0.72, 0.1, 0.95);
  const overshootRatio = motion.overshoot ?? 0.14;
  const delta = to - from;
  const overshootTarget = to + delta * overshootRatio;

  return interpolate(progress, [0, settleAt, 1], [from, overshootTarget, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
}
