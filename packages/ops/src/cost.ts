export type JobCostEstimateInput = {
  estimatedRenderSeconds?: number;
  estimatedAudioSeconds?: number;
  estimatedApiCalls?: number;
};

export type JobCostEstimate = {
  estimatedRenderSeconds: number;
  estimatedAudioSeconds: number;
  estimatedApiCalls: number;
  estimatedCostUsd: number;
};

const RENDER_COST_PER_SECOND_USD = 0.0025;
const AUDIO_COST_PER_SECOND_USD = 0.0007;
const API_CALL_COST_USD = 0.001;

function roundUsd(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function toNonNegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  return Math.round(value);
}

export function estimateJobCost(input: JobCostEstimateInput): JobCostEstimate {
  const estimatedRenderSeconds = toNonNegativeInteger(input.estimatedRenderSeconds);
  const estimatedAudioSeconds = toNonNegativeInteger(input.estimatedAudioSeconds);
  const estimatedApiCalls = toNonNegativeInteger(input.estimatedApiCalls);

  const estimatedCostUsd = roundUsd(
    estimatedRenderSeconds * RENDER_COST_PER_SECOND_USD +
      estimatedAudioSeconds * AUDIO_COST_PER_SECOND_USD +
      estimatedApiCalls * API_CALL_COST_USD
  );

  return {
    estimatedRenderSeconds,
    estimatedAudioSeconds,
    estimatedApiCalls,
    estimatedCostUsd
  };
}
