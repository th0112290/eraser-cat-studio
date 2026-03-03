import fs from "node:fs";
import path from "node:path";
import type { TTSProvider } from "./types";
import { writeMonoWav, type MonoWav } from "./wav";

function countWords(text: string): number {
  const tokens = text.match(/[A-Za-z0-9'_-]+/g);
  return tokens ? tokens.length : 0;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) {
    return 1;
  }
  return Math.max(0.6, Math.min(1.8, speed));
}

function buildNarrationWav(text: string, voice: string, speed: number): MonoWav {
  const sampleRate = 44100;
  const safeSpeed = clampSpeed(speed);
  const wordCount = Math.max(1, countWords(text));
  const effectiveWpm = 145 * safeSpeed;
  const durationSec = Math.max(2, Math.ceil((wordCount / effectiveWpm) * 60));
  const totalFrames = durationSec * sampleRate;

  const voiceHash = hashText(voice);
  const baseFrequency = 150 + (voiceHash % 120);
  const samples = new Int16Array(totalFrames);

  for (let i = 0; i < totalFrames; i += 1) {
    const time = i / sampleRate;
    const syllablePulse = 0.42 + 0.35 * Math.sin(2 * Math.PI * 3.6 * time);
    const contour = 1 + 0.18 * Math.sin(2 * Math.PI * 0.8 * time);
    const tone =
      0.65 * Math.sin(2 * Math.PI * baseFrequency * contour * time) +
      0.35 * Math.sin(2 * Math.PI * (baseFrequency * 1.9) * time);

    const value = tone * syllablePulse * 0.26;
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
  }

  return {
    sampleRate,
    samples
  };
}

export class MockTTSProvider implements TTSProvider {
  private readonly outDir: string;

  constructor(outDir: string) {
    this.outDir = outDir;
  }

  async synthesize(text: string, voice: string, speed: number): Promise<string> {
    fs.mkdirSync(this.outDir, { recursive: true });
    const wav = buildNarrationWav(text, voice, speed);
    const outPath = path.join(this.outDir, "narration.wav");
    writeMonoWav(outPath, wav);
    return outPath;
  }
}
