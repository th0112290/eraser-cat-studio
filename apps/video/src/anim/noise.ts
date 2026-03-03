import { easeInOut } from "./easing";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash(seed: number, x: number, y: number = 0): number {
  let h = seed >>> 0;
  h ^= Math.imul(x, 374761393);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 15;
  return h >>> 0;
}

function hashToSignedUnit(value: number): number {
  return (value / 4294967295) * 2 - 1;
}

export function noise1D(seed: number, t: number): number {
  const x0 = Math.floor(t);
  const x1 = x0 + 1;
  const frac = t - x0;
  const u = easeInOut(frac);

  const n0 = hashToSignedUnit(hash(seed, x0));
  const n1 = hashToSignedUnit(hash(seed, x1));

  return clamp(lerp(n0, n1, u), -1, 1);
}

export function noise2D(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  const fx = x - x0;
  const fy = y - y0;
  const ux = easeInOut(fx);
  const uy = easeInOut(fy);

  const n00 = hashToSignedUnit(hash(seed, x0, y0));
  const n10 = hashToSignedUnit(hash(seed, x1, y0));
  const n01 = hashToSignedUnit(hash(seed, x0, y1));
  const n11 = hashToSignedUnit(hash(seed, x1, y1));

  const nx0 = lerp(n00, n10, ux);
  const nx1 = lerp(n01, n11, ux);

  return clamp(lerp(nx0, nx1, uy), -1, 1);
}
