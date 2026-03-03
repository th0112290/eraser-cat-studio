export type AudioDataLike = {
  sampleRate: number;
  channelWaveforms: ArrayLike<ArrayLike<number>>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getRmsFromAudio(frame: number, fps: number, audioData: AudioDataLike): number {
  const sampleRate = audioData.sampleRate;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || fps <= 0) {
    return 0;
  }

  const channels = Array.from(audioData.channelWaveforms ?? []);
  if (channels.length === 0) {
    return 0;
  }

  const first = channels[0];
  const totalSamples = typeof first?.length === "number" ? first.length : 0;
  if (totalSamples <= 0) {
    return 0;
  }

  const startSample = clamp(Math.floor((frame / fps) * sampleRate), 0, totalSamples - 1);
  const frameWindow = Math.max(1, Math.ceil(sampleRate / fps));
  const endSample = clamp(startSample + frameWindow, startSample + 1, totalSamples);

  let sumSquares = 0;
  let count = 0;

  for (const channel of channels) {
    const channelLength = typeof channel?.length === "number" ? channel.length : 0;
    if (channelLength <= 0) {
      continue;
    }

    const localEnd = Math.min(endSample, channelLength);
    for (let i = startSample; i < localEnd; i += 1) {
      const sample = Number(channel[i] ?? 0);
      sumSquares += sample * sample;
      count += 1;
    }
  }

  if (count === 0) {
    return 0;
  }

  return Math.sqrt(sumSquares / count);
}

function getFallbackRhythm(frame: number, fps: number, seed: string, text?: string): number {
  const normalizedText = (text ?? "").trim();
  const tokenCount = normalizedText.length === 0 ? 6 : normalizedText.split(/\s+/u).length;
  const seedNum = hashStringToSeed(`${seed}:${normalizedText.length}:${tokenCount}`);

  const phaseOffset = ((seedNum % 3600) / 3600) * Math.PI * 2;
  const baseRateHz = 2.6 + (tokenCount % 6) * 0.3;
  const accentRateHz = 4.8 + (tokenCount % 4) * 0.5;

  const t = frame / Math.max(1, fps);
  const basePulse = Math.max(0, Math.sin(t * Math.PI * 2 * baseRateHz + phaseOffset));
  const accentPulse = Math.max(0, Math.sin(t * Math.PI * 2 * accentRateHz + phaseOffset * 1.7));
  const microPulse = (Math.sin(t * Math.PI * 2 * 9.3 + phaseOffset * 0.33) + 1) * 0.5;

  const phraseFrames = Math.max(18, Math.round(fps * (1 + tokenCount * 0.04)));
  const local = (frame + (seedNum % phraseFrames)) % phraseFrames;
  const endPause = local > phraseFrames - 3 ? 0.22 : 1;

  const open = (basePulse * 0.68 + accentPulse * 0.22 + microPulse * 0.1) * endPause;
  return clamp(open, 0, 1);
}

export function getMouthOpen(
  frame: number,
  fps: number,
  seed: string,
  text?: string,
  audioData?: AudioDataLike
): number {
  if (audioData) {
    const rms = getRmsFromAudio(frame, fps, audioData);
    const normalized = clamp((rms - 0.015) / 0.17, 0, 1);
    return Math.pow(normalized, 0.85);
  }

  return getFallbackRhythm(frame, fps, seed, text);
}
