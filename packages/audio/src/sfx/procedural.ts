import type { MonoWav } from "../wav";

const DEFAULT_SAMPLE_RATE = 44100;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createNoise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function msToSamples(durationMs: number, sampleRate: number): number {
  return Math.max(1, Math.floor((Math.max(10, durationMs) / 1000) * sampleRate));
}

function envelope(sampleIndex: number, sampleCount: number, attack: number, release: number): number {
  const a = Math.max(1, Math.floor(sampleCount * attack));
  const r = Math.max(1, Math.floor(sampleCount * release));

  if (sampleIndex < a) {
    return sampleIndex / a;
  }

  if (sampleIndex > sampleCount - r) {
    return (sampleCount - sampleIndex) / r;
  }

  return 1;
}

function toMonoWav(samples: Int16Array): MonoWav {
  return {
    sampleRate: DEFAULT_SAMPLE_RATE,
    samples
  };
}

function writeSample(value: number): number {
  return Math.round(clamp(value, -1, 1) * 32767);
}

export function makeWhoosh(durationMs: number): MonoWav {
  const sampleCount = msToSamples(durationMs, DEFAULT_SAMPLE_RATE);
  const samples = new Int16Array(sampleCount);
  const noise = createNoise(0x9e3779b9);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleCount;
    const env = envelope(i, sampleCount, 0.08, 0.28);
    const white = noise() * 2 - 1;
    const airy = Math.sin(2 * Math.PI * (220 + t * 980) * (i / DEFAULT_SAMPLE_RATE)) * 0.22;
    const value = (white * 0.78 + airy) * env * (0.25 + t * 0.75);
    samples[i] = writeSample(value * 0.8);
  }

  return toMonoWav(samples);
}

export function makePop(durationMs: number): MonoWav {
  const sampleCount = msToSamples(durationMs, DEFAULT_SAMPLE_RATE);
  const samples = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / DEFAULT_SAMPLE_RATE;
    const env = envelope(i, sampleCount, 0.02, 0.65);
    const toneA = Math.sin(2 * Math.PI * 340 * t);
    const toneB = Math.sin(2 * Math.PI * 620 * t) * 0.45;
    const value = (toneA + toneB) * env * 0.75;
    samples[i] = writeSample(value);
  }

  return toMonoWav(samples);
}

export function makeClick(durationMs: number): MonoWav {
  const sampleCount = msToSamples(durationMs, DEFAULT_SAMPLE_RATE);
  const samples = new Int16Array(sampleCount);
  const noise = createNoise(0x7f4a7c15);

  for (let i = 0; i < sampleCount; i += 1) {
    const env = envelope(i, sampleCount, 0.01, 0.9);
    const tick = Math.sin(2 * Math.PI * 2100 * (i / DEFAULT_SAMPLE_RATE)) * 0.35;
    const grit = (noise() * 2 - 1) * 0.65;
    samples[i] = writeSample((tick + grit) * env * 0.55);
  }

  return toMonoWav(samples);
}

export function makeBeep(freq: number, durationMs: number): MonoWav {
  const safeFreq = clamp(freq, 120, 3200);
  const sampleCount = msToSamples(durationMs, DEFAULT_SAMPLE_RATE);
  const samples = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / DEFAULT_SAMPLE_RATE;
    const env = envelope(i, sampleCount, 0.04, 0.38);
    const tone = Math.sin(2 * Math.PI * safeFreq * t);
    const harmonic = Math.sin(2 * Math.PI * safeFreq * 2.01 * t) * 0.18;
    samples[i] = writeSample((tone + harmonic) * env * 0.7);
  }

  return toMonoWav(samples);
}
