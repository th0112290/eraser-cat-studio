import { createHash } from "node:crypto";
import { hashWorkflowIdentity } from "./prompt";
import type {
  CharacterGenerationCandidate,
  CharacterGenerationProvider,
  CharacterGenerationProviderResult,
  CharacterProviderGenerateInput,
  CharacterView
} from "./types";

function hashToInt(seedText: string): number {
  const hash = createHash("sha256").update(seedText).digest("hex");
  return Number.parseInt(hash.slice(0, 8), 16) >>> 0;
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pickPalette(seed: number): {
  body: string;
  accent: string;
  ear: string;
  eye: string;
} {
  const rng = makeRng(seed);
  const hue = Math.floor(rng() * 360);
  const body = `hsl(${hue} 65% 62%)`;
  const accent = `hsl(${(hue + 40) % 360} 80% 58%)`;
  const ear = `hsl(${(hue + 20) % 360} 55% 52%)`;
  const eye = `hsl(${(hue + 200) % 360} 30% 12%)`;
  return { body, accent, ear, eye };
}

function viewTransform(view: CharacterView): {
  headScaleX: number;
  torsoScaleX: number;
  noseX: number;
  eyeNearX: number;
  eyeFarX: number;
} {
  if (view === "profile") {
    return {
      headScaleX: 0.72,
      torsoScaleX: 0.78,
      noseX: 28,
      eyeNearX: 12,
      eyeFarX: -6
    };
  }

  if (view === "threeQuarter") {
    return {
      headScaleX: 0.86,
      torsoScaleX: 0.9,
      noseX: 16,
      eyeNearX: 8,
      eyeFarX: -10
    };
  }

  return {
    headScaleX: 1,
    torsoScaleX: 1,
    noseX: 2,
    eyeNearX: 10,
    eyeFarX: -10
  };
}

function buildSvg(view: CharacterView, seed: number, candidateIndex: number): string {
  const palette = pickPalette(seed + candidateIndex * 13);
  const t = viewTransform(view);
  const sparkleX = 120 + (candidateIndex % 2) * 26;
  const sparkleY = 112 + (candidateIndex % 3) * 19;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <g transform="translate(512 620)">
    <ellipse cx="0" cy="220" rx="210" ry="36" fill="rgba(0,0,0,0.16)"/>
    <g transform="translate(0 -40) scale(${t.torsoScaleX} 1)">
      <rect x="-170" y="-200" width="340" height="360" rx="170" fill="${palette.body}"/>
      <rect x="-150" y="-70" width="300" height="210" rx="140" fill="${palette.accent}" opacity="0.28"/>
    </g>
    <g transform="translate(0 -255) scale(${t.headScaleX} 1)">
      <ellipse cx="0" cy="0" rx="170" ry="150" fill="${palette.body}"/>
      <polygon points="-122,-125 -72,-265 -22,-130" fill="${palette.ear}"/>
      <polygon points="122,-125 72,-265 22,-130" fill="${palette.ear}"/>
      <ellipse cx="${t.eyeFarX}" cy="-15" rx="14" ry="18" fill="${palette.eye}" opacity="${view === "profile" ? "0.35" : "0.9"}"/>
      <ellipse cx="${t.eyeNearX}" cy="-10" rx="16" ry="20" fill="${palette.eye}"/>
      <ellipse cx="${t.noseX}" cy="20" rx="16" ry="11" fill="#fca5a5"/>
      <path d="M -20 52 Q 0 66 20 52" stroke="#2b2b2b" stroke-width="8" fill="none" stroke-linecap="round"/>
    </g>
    <g transform="translate(144 -120) rotate(${8 + candidateIndex * 2})">
      <rect x="0" y="0" width="140" height="38" rx="19" fill="${palette.accent}"/>
      <circle cx="138" cy="19" r="24" fill="#fde68a"/>
    </g>
    <circle cx="${sparkleX}" cy="${sparkleY}" r="10" fill="#ffffff" opacity="0.8"/>
  </g>
</svg>`;
}

export class MockCharacterGenerationProvider implements CharacterGenerationProvider {
  readonly name = "mock" as const;

  async generate(input: CharacterProviderGenerateInput): Promise<CharacterGenerationProviderResult> {
    const views = input.views.length > 0 ? input.views : (["front", "threeQuarter", "profile"] as const);
    const candidates: CharacterGenerationCandidate[] = [];

    for (const view of views) {
      for (let index = 0; index < input.candidateCount; index += 1) {
        const seed = hashToInt(`${input.baseSeed}:${view}:${index}`);
        const svg = buildSvg(view, seed, index);

        candidates.push({
          id: `mock_${view}_${index}_${seed}`,
          view,
          candidateIndex: index,
          seed,
          provider: "mock",
          prompt: input.positivePrompt,
          negativePrompt: input.negativePrompt,
          mimeType: "image/svg+xml",
          data: Buffer.from(svg, "utf8"),
          providerMeta: {
            mock: true,
            seed,
            mode: input.mode
          }
        });
      }
    }

    return {
      provider: "mock",
      workflowHash: hashWorkflowIdentity({
        provider: "mock",
        presetId: "mock",
        positivePrompt: input.positivePrompt,
        negativePrompt: input.negativePrompt
      }),
      generatedAt: new Date().toISOString(),
      candidates
    };
  }
}
