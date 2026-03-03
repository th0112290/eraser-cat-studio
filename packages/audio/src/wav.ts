import fs from "node:fs";

export type MonoWav = {
  sampleRate: number;
  samples: Int16Array;
};

const PCM_16_BIT = 16;
const MONO_CHANNEL = 1;

function clampToI16(value: number): number {
  if (value > 32767) {
    return 32767;
  }
  if (value < -32768) {
    return -32768;
  }
  return Math.round(value);
}

function writeString(buffer: Buffer, offset: number, value: string): void {
  buffer.write(value, offset, value.length, "ascii");
}

export function writeMonoWav(filePath: string, wav: MonoWav): void {
  const dataSize = wav.samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  writeString(buffer, 0, "RIFF");
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeString(buffer, 8, "WAVE");
  writeString(buffer, 12, "fmt ");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(MONO_CHANNEL, 22);
  buffer.writeUInt32LE(wav.sampleRate, 24);
  buffer.writeUInt32LE((wav.sampleRate * MONO_CHANNEL * PCM_16_BIT) / 8, 28);
  buffer.writeUInt16LE((MONO_CHANNEL * PCM_16_BIT) / 8, 32);
  buffer.writeUInt16LE(PCM_16_BIT, 34);
  writeString(buffer, 36, "data");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < wav.samples.length; i += 1) {
    buffer.writeInt16LE(wav.samples[i] ?? 0, 44 + i * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

export function readMonoWav(filePath: string): MonoWav {
  const buffer = fs.readFileSync(filePath);

  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Unsupported WAV file: ${filePath}`);
  }

  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  const dataLabel = buffer.toString("ascii", 36, 40);
  const dataSize = buffer.readUInt32LE(40);

  if (channels !== MONO_CHANNEL || bitsPerSample !== PCM_16_BIT || dataLabel !== "data") {
    throw new Error(`Expected PCM16 mono WAV: ${filePath}`);
  }

  const sampleCount = dataSize / 2;
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] = buffer.readInt16LE(44 + i * 2);
  }

  return {
    sampleRate,
    samples
  };
}

export function generateToneSamples(
  durationSec: number,
  sampleRate: number,
  frequencyHz: number,
  volume: number,
  modulationHz: number = 0
): Int16Array {
  const clampedDuration = Math.max(0.05, durationSec);
  const frameCount = Math.max(1, Math.floor(clampedDuration * sampleRate));
  const out = new Int16Array(frameCount);

  for (let i = 0; i < frameCount; i += 1) {
    const time = i / sampleRate;
    const base = Math.sin(2 * Math.PI * frequencyHz * time);
    const mod = modulationHz > 0 ? 0.5 + 0.5 * Math.sin(2 * Math.PI * modulationHz * time) : 1;
    out[i] = clampToI16(base * mod * volume * 32767);
  }

  return out;
}

export function overlaySamples(base: Float32Array, overlay: Int16Array, startIndex: number, gain: number): void {
  const safeStart = Math.max(0, startIndex);
  for (let i = 0; i < overlay.length; i += 1) {
    const target = safeStart + i;
    if (target >= base.length) {
      break;
    }
    base[target] += (overlay[i] / 32768) * gain;
  }
}

export function normalizeFloatSamples(samples: Float32Array, targetPeak: number = 0.92): Int16Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const abs = Math.abs(samples[i] ?? 0);
    if (abs > peak) {
      peak = abs;
    }
  }

  const scale = peak > 0 ? targetPeak / peak : 1;
  const out = new Int16Array(samples.length);

  for (let i = 0; i < samples.length; i += 1) {
    out[i] = clampToI16((samples[i] ?? 0) * scale * 32767);
  }

  return out;
}
