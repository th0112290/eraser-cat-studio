import { sha256Hex } from "@ec/shared";
import type { BuildPromptBundleInput, PromptBundle, StylePromptPreset } from "./types";

const BASE_NEGATIVE_TEMPLATE = [
  "watermark",
  "text",
  "logo",
  "signature",
  "busy background",
  "cluttered background",
  "photorealistic"
].join(", ");

export const STYLE_PROMPT_PRESETS: StylePromptPreset[] = [
  {
    id: "eraser-cat-flat",
    label: "Eraser Cat Flat",
    positive: "2d mascot character, clean vector look, thick outline, simple cel shading, transparent background",
    negative: "3d render, photoreal skin, cinematic grain"
  },
  {
    id: "playful-cartoon",
    label: "Playful Cartoon",
    positive: "cute cartoon mascot, rounded proportions, expressive eyes, animation-ready sprite, transparent background",
    negative: "realistic anatomy, noisy texture"
  },
  {
    id: "minimal-rig",
    label: "Minimal Rig",
    positive: "front and side consistent character sheet, clean silhouette, large readable shapes, transparent background",
    negative: "detailed background, complex lighting"
  }
];

function findPreset(id?: string): StylePromptPreset {
  if (!id) {
    return STYLE_PROMPT_PRESETS[0];
  }

  return STYLE_PROMPT_PRESETS.find((preset) => preset.id === id) ?? STYLE_PROMPT_PRESETS[0];
}

function joinPromptParts(parts: Array<string | undefined>): string {
  const out: string[] = [];
  for (const part of parts) {
    if (!part) {
      continue;
    }

    const trimmed = part.trim();
    if (trimmed.length === 0) {
      continue;
    }

    out.push(trimmed);
  }

  return out.join(", ");
}

export function buildPromptBundle(input: BuildPromptBundleInput): PromptBundle {
  const preset = findPreset(input.presetId);

  const styleHints = input.styleHints;
  const hintText = joinPromptParts([
    styleHints?.channelName ? `channel style: ${styleHints.channelName}` : undefined,
    styleHints?.characterPersona ? `persona: ${styleHints.characterPersona}` : undefined,
    styleHints?.tone ? `tone: ${styleHints.tone}` : undefined,
    styleHints?.motion ? `motion style: ${styleHints.motion}` : undefined,
    styleHints?.typography ? `typography hint: ${styleHints.typography}` : undefined
  ]);

  const positivePrompt = joinPromptParts([preset.positive, input.positivePrompt, hintText]);
  const negativePrompt = joinPromptParts([BASE_NEGATIVE_TEMPLATE, preset.negative, input.negativePrompt]);

  const guardrails = [
    "enforce transparent background",
    "reject text/watermark/logo artifacts",
    "maintain consistent head/torso proportions across views"
  ];

  return {
    presetId: preset.id,
    positivePrompt,
    negativePrompt,
    guardrails
  };
}

export function hashWorkflowIdentity(input: {
  provider: string;
  presetId: string;
  positivePrompt: string;
  negativePrompt: string;
}): string {
  return sha256Hex(
    JSON.stringify({
      provider: input.provider,
      presetId: input.presetId,
      positivePrompt: input.positivePrompt,
      negativePrompt: input.negativePrompt
    })
  );
}
