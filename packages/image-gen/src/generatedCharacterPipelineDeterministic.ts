import type {
  CharacterStillAsset,
  GenerateCharacterViewSetInput,
  GenerateExpressionPackInput,
  GenerateVisemePackInput,
  GeneratedCharacterExpression,
  GeneratedCharacterManifest,
  GeneratedCharacterViseme,
  RunDeterministicCharacterPipelineInput
} from "./generatedCharacterPipeline";
import type { MascotSpeciesId } from "./types";

const DEFAULT_EXPRESSION_SET: GeneratedCharacterExpression[] = ["neutral", "happy", "surprised", "blink"];
const DEFAULT_VISEME_SET: GeneratedCharacterViseme[] = [
  "mouth_closed",
  "mouth_open_small",
  "mouth_open_wide",
  "mouth_round_o"
];

type DeterministicPipelineDeps = {
  loadManifest: (characterId: string) => GeneratedCharacterManifest;
  saveManifest: (manifest: GeneratedCharacterManifest) => GeneratedCharacterManifest;
  assignManifestSpecies: (
    manifest: GeneratedCharacterManifest,
    speciesId?: MascotSpeciesId
  ) => GeneratedCharacterManifest;
  resolveManifestSpeciesId: (manifest: GeneratedCharacterManifest, fallbackSpeciesId?: MascotSpeciesId) => MascotSpeciesId;
  resolveMascotSpeciesProfile: (speciesId?: MascotSpeciesId) => {
    id: MascotSpeciesId;
    viewHints: Partial<Record<"front" | "threeQuarter" | "profile", string>>;
    identityTokens: string[];
  };
  legacySpeciesRepairHint: (speciesId: MascotSpeciesId, mode: "view" | "expression" | "viseme") => string;
  mergePromptWithSuffixes: (basePrompt: string, suffixes: readonly string[]) => string;
  stillOutputPath: (input: {
    characterId: string;
    stage: "view" | "expression" | "viseme";
    view: "front" | "threeQuarter" | "profile";
    expression?: GeneratedCharacterExpression;
    viseme?: GeneratedCharacterViseme;
  }) => string;
  requireApprovedFrontMaster: (characterId: string) => CharacterStillAsset;
  aliasAssetWithNewContract: (input: {
    parentAsset: CharacterStillAsset;
    stage: "view" | "expression" | "viseme";
    outputPath: string;
    view: "front" | "threeQuarter" | "profile";
    expression?: GeneratedCharacterExpression;
    viseme?: GeneratedCharacterViseme;
  }) => CharacterStillAsset;
  updateManifestWithAsset: (manifest: GeneratedCharacterManifest, asset: CharacterStillAsset) => GeneratedCharacterManifest;
  runEditCharacterStill: (input: {
    characterId: string;
    inputImagePath: string;
    editPrompt: string;
    negativePrompt?: string;
    seed: number;
    denoise?: number;
    stage: "view" | "expression" | "viseme";
    view?: "front" | "threeQuarter" | "profile";
    expression?: GeneratedCharacterExpression;
    viseme?: GeneratedCharacterViseme;
    parentAssetId?: string;
    repairHistory?: string[];
  }) => Promise<CharacterStillAsset>;
  expressionPrompt: (expression: GeneratedCharacterExpression, speciesId?: MascotSpeciesId) => string;
  expressionGenerationNegativePrompt: (basePrompt: string | undefined) => string;
  visemePrompt: (viseme: GeneratedCharacterViseme, speciesId?: MascotSpeciesId) => string;
  visemeGenerationNegativePrompt: (basePrompt: string | undefined) => string;
  resolveInitialEditDenoise: (kind: "view" | "expression" | "viseme", baseDenoise: number | undefined) => number;
  strengthenVisemeAssetIfNeeded: (input: {
    characterId: string;
    baseAsset: CharacterStillAsset;
    visemeAsset: CharacterStillAsset;
    viseme: GeneratedCharacterViseme;
    speciesId?: MascotSpeciesId;
  }) => Promise<CharacterStillAsset>;
  runGenerateCharacterStill: (input: {
    characterId: string;
    positivePrompt: string;
    negativePrompt?: string;
    seed: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    loraStrength?: number;
    autoApprove?: boolean;
  }) => Promise<CharacterStillAsset>;
  approveFrontMaster: (input: { characterId: string }) => Promise<unknown>;
  buildGeneratedCharacterPack: (input: { characterId: string }) => Promise<unknown>;
  runCharacterAnimationSafeQc: (input: { characterId: string }) => Promise<unknown>;
  runCharacterPipelineEditRepairLoop: (input: {
    characterId: string;
    negativePrompt?: string;
    threeQuarterSeed: number;
    profileSeed: number;
    expressionBaseSeed: number;
    visemeBaseSeed: number;
    denoise?: number;
    maxRounds?: number;
  }) => Promise<unknown>;
  defaultAutoRepairRounds: number;
};

export async function generateCharacterViewSetWithDeps(
  input: GenerateCharacterViewSetInput,
  deps: DeterministicPipelineDeps
): Promise<GeneratedCharacterManifest> {
  const frontMaster = deps.requireApprovedFrontMaster(input.characterId);
  const manifest = deps.assignManifestSpecies(deps.loadManifest(input.characterId), input.speciesId);
  const speciesProfile = deps.resolveMascotSpeciesProfile(deps.resolveManifestSpeciesId(manifest, input.speciesId));
  const threeQuarterViewHint = speciesProfile.viewHints.threeQuarter ?? "";
  const profileViewHint = speciesProfile.viewHints.profile ?? "";
  const frontViewPath = deps.stillOutputPath({
    characterId: input.characterId,
    stage: "view",
    view: "front"
  });
  const frontViewAsset = deps.aliasAssetWithNewContract({
    parentAsset: frontMaster,
    stage: "view",
    outputPath: frontViewPath,
    view: "front"
  });
  deps.updateManifestWithAsset(manifest, frontViewAsset);

  const derivedViews: Array<{
    view: "threeQuarter" | "profile";
    seed: number;
    prompt: string;
  }> = [
    {
      view: "threeQuarter",
      seed: input.threeQuarterSeed,
      prompt: deps.mergePromptWithSuffixes(
        "same character, strict right three-quarter turnaround frame, neutral expression, rotate head and torso away from camera, keep one eye partially occluded, preserve approved front identity, preserve head ratio and mascot silhouette, do not keep a front view",
        [
          threeQuarterViewHint,
          ...speciesProfile.identityTokens.slice(0, 2),
          deps.legacySpeciesRepairHint(speciesProfile.id, "view"),
          "clear torso yaw, near eye larger than far eye, far paw still present, absolutely not front-facing"
        ]
      )
    },
    {
      view: "profile",
      seed: input.profileSeed,
      prompt: deps.mergePromptWithSuffixes(
        "same character, strict right profile turnaround frame, neutral expression, rotate head and torso to a full side silhouette, show only one visible eye, preserve approved front identity, preserve silhouette clarity and body proportions, do not keep a front view",
        [
          profileViewHint,
          ...speciesProfile.identityTokens.slice(0, 2),
          deps.legacySpeciesRepairHint(speciesProfile.id, "view"),
          "one visible eye only, one readable near paw, true side silhouette, absolutely not front-facing"
        ]
      )
    }
  ];

  for (const entry of derivedViews) {
    const asset = await deps.runEditCharacterStill({
      characterId: input.characterId,
      inputImagePath: frontMaster.file_path,
      editPrompt: entry.prompt,
      negativePrompt: input.negativePrompt,
      seed: entry.seed,
      denoise: input.denoise,
      stage: "view",
      view: entry.view,
      parentAssetId: frontMaster.asset_id
    });
    deps.updateManifestWithAsset(manifest, asset);
  }

  return deps.saveManifest(manifest);
}

export async function generateCharacterExpressionPackWithDeps(
  input: GenerateExpressionPackInput,
  deps: DeterministicPipelineDeps
): Promise<GeneratedCharacterManifest> {
  const frontMaster = deps.requireApprovedFrontMaster(input.characterId);
  const manifest = deps.assignManifestSpecies(deps.loadManifest(input.characterId), input.speciesId);
  const frontNeutralPath = deps.stillOutputPath({
    characterId: input.characterId,
    stage: "expression",
    view: "front",
    expression: "neutral"
  });
  const frontNeutralAsset = deps.aliasAssetWithNewContract({
    parentAsset: frontMaster,
    stage: "expression",
    outputPath: frontNeutralPath,
    view: "front",
    expression: "neutral"
  });
  deps.updateManifestWithAsset(manifest, frontNeutralAsset);

  const expressions = (input.expressions ?? DEFAULT_EXPRESSION_SET).filter((entry) => entry !== "neutral");
  for (let index = 0; index < expressions.length; index += 1) {
    const expression = expressions[index];
    const asset = await deps.runEditCharacterStill({
      characterId: input.characterId,
      inputImagePath: frontMaster.file_path,
      editPrompt: deps.expressionPrompt(expression, manifest.species),
      negativePrompt: deps.expressionGenerationNegativePrompt(input.negativePrompt),
      seed: input.baseSeed + index * 97 + 11,
      denoise: deps.resolveInitialEditDenoise("expression", input.denoise),
      stage: "expression",
      view: "front",
      expression,
      parentAssetId: frontMaster.asset_id
    });
    deps.updateManifestWithAsset(manifest, asset);
  }

  return deps.saveManifest(manifest);
}

export async function generateCharacterVisemePackWithDeps(
  input: GenerateVisemePackInput,
  deps: DeterministicPipelineDeps
): Promise<GeneratedCharacterManifest> {
  const frontMaster = deps.requireApprovedFrontMaster(input.characterId);
  const manifest = deps.assignManifestSpecies(deps.loadManifest(input.characterId), input.speciesId);
  const closedPath = deps.stillOutputPath({
    characterId: input.characterId,
    stage: "viseme",
    view: "front",
    viseme: "mouth_closed"
  });
  const closedAsset = deps.aliasAssetWithNewContract({
    parentAsset: frontMaster,
    stage: "viseme",
    outputPath: closedPath,
    view: "front",
    viseme: "mouth_closed"
  });
  deps.updateManifestWithAsset(manifest, closedAsset);

  const visemes = (input.visemes ?? DEFAULT_VISEME_SET).filter((entry) => entry !== "mouth_closed");
  for (let index = 0; index < visemes.length; index += 1) {
    const viseme = visemes[index];
    const asset = await deps.runEditCharacterStill({
      characterId: input.characterId,
      inputImagePath: frontMaster.file_path,
      editPrompt: deps.visemePrompt(viseme, manifest.species),
      negativePrompt: deps.visemeGenerationNegativePrompt(input.negativePrompt),
      seed: input.baseSeed + index * 89 + 17,
      denoise: deps.resolveInitialEditDenoise("viseme", input.denoise),
      stage: "viseme",
      view: "front",
      viseme,
      parentAssetId: frontMaster.asset_id
    });
    const strengthenedAsset = await deps.strengthenVisemeAssetIfNeeded({
      characterId: input.characterId,
      baseAsset: closedAsset,
      visemeAsset: asset,
      viseme,
      speciesId: manifest.species
    });
    deps.updateManifestWithAsset(manifest, strengthenedAsset);
  }

  return deps.saveManifest(manifest);
}

export async function runDeterministicCharacterPipelineWithDeps(
  input: RunDeterministicCharacterPipelineInput,
  deps: DeterministicPipelineDeps
): Promise<GeneratedCharacterManifest> {
  const autoApproveFrontMaster = input.autoApproveFrontMaster ?? true;
  const existingManifest = deps.loadManifest(input.characterId);
  const manifestSpeciesBefore = existingManifest.species;
  const seededManifest = deps.assignManifestSpecies(existingManifest, input.speciesId);
  if (seededManifest.species !== manifestSpeciesBefore) {
    deps.saveManifest(seededManifest);
  }
  if (!existingManifest.approved_front_master) {
    await deps.runGenerateCharacterStill({
      characterId: input.characterId,
      positivePrompt: input.positivePrompt,
      negativePrompt: input.negativePrompt,
      seed: input.frontSeed,
      width: input.width,
      height: input.height,
      steps: input.steps,
      cfg: input.cfg,
      loraStrength: input.loraStrength,
      autoApprove: autoApproveFrontMaster
    });
  }

  if (autoApproveFrontMaster && !deps.loadManifest(input.characterId).approved_front_master) {
    await deps.approveFrontMaster({ characterId: input.characterId });
  }

  const threeQuarterSeed = input.threeQuarterSeed ?? input.frontSeed + 23;
  const profileSeed = input.profileSeed ?? input.frontSeed + 37;
  const expressionBaseSeed = input.expressionBaseSeed ?? input.frontSeed + 101;
  const visemeBaseSeed = input.visemeBaseSeed ?? input.frontSeed + 211;

  await generateCharacterViewSetWithDeps(
    {
      characterId: input.characterId,
      speciesId: input.speciesId,
      negativePrompt: input.negativePrompt,
      threeQuarterSeed,
      profileSeed,
      denoise: input.denoise
    },
    deps
  );
  await generateCharacterExpressionPackWithDeps(
    {
      characterId: input.characterId,
      speciesId: input.speciesId,
      negativePrompt: input.negativePrompt,
      baseSeed: expressionBaseSeed,
      denoise: input.denoise
    },
    deps
  );
  await generateCharacterVisemePackWithDeps(
    {
      characterId: input.characterId,
      speciesId: input.speciesId,
      negativePrompt: input.negativePrompt,
      baseSeed: visemeBaseSeed,
      denoise: input.denoise
    },
    deps
  );
  await deps.buildGeneratedCharacterPack({ characterId: input.characterId });
  await deps.runCharacterAnimationSafeQc({ characterId: input.characterId });
  await deps.runCharacterPipelineEditRepairLoop({
    characterId: input.characterId,
    negativePrompt: input.negativePrompt,
    threeQuarterSeed,
    profileSeed,
    expressionBaseSeed,
    visemeBaseSeed,
    denoise: input.denoise,
    maxRounds: input.autoRepairRounds ?? deps.defaultAutoRepairRounds
  });
  return deps.loadManifest(input.characterId);
}
