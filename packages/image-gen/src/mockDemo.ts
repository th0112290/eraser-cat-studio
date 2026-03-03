import fs from "node:fs";
import path from "node:path";
import {
  buildCharacterPrompt,
  createCharacterProvider,
  resolveProviderName,
  type CharacterProviderGenerateInput
} from "./index";

const providerName = resolveProviderName({
  requestedProvider: process.env.IMAGE_GEN_PROVIDER,
  comfyUiUrl: process.env.COMFYUI_URL
});

const provider = createCharacterProvider({
  provider: providerName,
  comfyUiUrl: process.env.COMFYUI_URL
});

const promptBundle = buildCharacterPrompt({
  mode: "new",
  presetId: "eraser-cat-flat",
  positivePrompt: "orange cat mascot, clean animation rig"
});

const input: CharacterProviderGenerateInput = {
  mode: "new",
  views: ["front", "threeQuarter", "profile"],
  candidateCount: 2,
  baseSeed: 42,
  positivePrompt: promptBundle.positivePrompt,
  negativePrompt: promptBundle.negativePrompt
};

const outDir = path.resolve(process.cwd(), "out", "image-gen-demo");
fs.mkdirSync(outDir, { recursive: true });

const result = await provider.generate(input);
for (const candidate of result.candidates) {
  const ext = candidate.mimeType.includes("svg") ? "svg" : "png";
  const outputPath = path.join(outDir, `${candidate.view}_${candidate.candidateIndex}.${ext}`);
  fs.writeFileSync(outputPath, candidate.data);
}

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  `${JSON.stringify({
    provider: result.provider,
    workflowHash: result.workflowHash,
    generatedAt: result.generatedAt,
    candidates: result.candidates.map((candidate) => ({
      id: candidate.id,
      view: candidate.view,
      candidateIndex: candidate.candidateIndex,
      seed: candidate.seed,
      mimeType: candidate.mimeType
    }))
  }, null, 2)}\n`,
  "utf8"
);

console.log(`[image-gen] demo completed provider=${result.provider} out=${outDir}`);
