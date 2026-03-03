import { spring, type SpringConfig } from "remotion";

const DEFAULT_SPRING_CONFIG: SpringConfig = {
  damping: 18,
  stiffness: 90,
  mass: 0.85,
  overshootClamping: false
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function overshoot(t: number, amount: number = 0.25): number {
  const x = clamp(t, 0, 1);
  const s = 1 + Math.max(0, amount) * 2.2;
  const y = 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
  return y;
}

export function dampedSpring(frame: number, fps: number, config?: Partial<SpringConfig>): number {
  return spring({
    frame,
    fps,
    config: {
      ...DEFAULT_SPRING_CONFIG,
      ...(config ?? {})
    }
  });
}

export function delayed(t: number, delayFrames: number): number {
  if (t >= 0 && t <= 1) {
    const normalizedDelay = clamp(delayFrames / 120, 0, 0.9);
    return clamp((t - normalizedDelay) / (1 - normalizedDelay), 0, 1);
  }

  return Math.max(0, t - delayFrames);
}
