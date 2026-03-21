import fs from "node:fs";
import path from "node:path";
import { buildMascotReferenceBankReviewPlan, resolveMascotReferenceBankDiagnostics } from "./mascotReferenceBank";
import { materializeGeneratedCharacterPack } from "./generatedCharacterPackBuild";
import { collectCharacterPipelineAnimationChecks } from "./generatedCharacterPipelineAnimationChecks";
import { collectCharacterPipelinePackQcChecks } from "./generatedCharacterPipelinePackQc";
import { materializeCharacterPipelineQcArtifacts } from "./generatedCharacterPipelineQcMaterialize";
import type {
  CharacterPackAnchorId,
  CharacterCropBoxes,
  CharacterPackAnchor,
  CharacterPackAnchorManifest,
  CharacterPackAnchorStatus,
  CharacterPipelineAcceptance,
  CharacterPipelineAcceptanceStatus,
  CharacterPipelineReferenceBankStatus,
  CropBox,
  GeneratedCharacterManifest,
  GeneratedCharacterView
} from "./generatedCharacterPipeline";
import type { MascotSpeciesId } from "./types";

type CharacterPackAnchorReviewSummary = {
  missingAnchorIds: string[];
  lowConfidenceAnchorIds: string[];
  overallConfidence?: number;
};

type GeneratedCharacterPackRuntimeBuildDeps = {
  synchronizeManifestCanvasToApprovedFront: (characterId: string) => Promise<GeneratedCharacterManifest>;
  loadManifest: (characterId: string) => GeneratedCharacterManifest;
  requireApprovedFrontMaster: (characterId: string) => unknown;
  resolveManifestReferenceBankStatus: (
    manifest: GeneratedCharacterManifest
  ) => CharacterPipelineReferenceBankStatus;
  deriveAutoCropBoxes: (manifest: GeneratedCharacterManifest) => Promise<CharacterCropBoxes>;
  applyCropBoxOverrides: (characterId: string, baseCropBoxes: CharacterCropBoxes) => CharacterCropBoxes;
  deriveAutoAnchorManifest: (
    manifest: GeneratedCharacterManifest,
    cropBoxes: CharacterCropBoxes
  ) => Promise<CharacterPackAnchorManifest>;
  applyAnchorOverrides: (
    characterId: string,
    baseAnchorManifest: CharacterPackAnchorManifest
  ) => CharacterPackAnchorManifest;
  collectAnchorReviewSummary: (anchorManifest: CharacterPackAnchorManifest) => CharacterPackAnchorReviewSummary;
  characterRootDir: (characterId: string) => string;
  manifestPathForCharacter: (characterId: string) => string;
  resolveManifestSpeciesId: (manifest: GeneratedCharacterManifest) => MascotSpeciesId;
  cropNormalizedRegion: Parameters<typeof materializeGeneratedCharacterPack>[0]["deps"]["cropNormalizedRegion"];
  recenterPackedEyeAsset: Parameters<typeof materializeGeneratedCharacterPack>[0]["deps"]["recenterPackedEyeAsset"];
  ensurePackedEyeSlotContent: Parameters<typeof materializeGeneratedCharacterPack>[0]["deps"]["ensurePackedEyeSlotContent"];
  validatePack: (pack: unknown) => void;
  invalidateDerivedState: (
    manifest: GeneratedCharacterManifest,
    scope: "front_master" | "acceptance_only" | "derived_assets"
  ) => GeneratedCharacterManifest;
  saveManifest: (manifest: GeneratedCharacterManifest) => GeneratedCharacterManifest;
};

type GeneratedCharacterPipelineQcDeps = {
  synchronizeManifestCanvasToApprovedFront: (characterId: string) => Promise<GeneratedCharacterManifest>;
  loadManifest: (characterId: string) => GeneratedCharacterManifest;
  applyCropBoxOverrides: (characterId: string, baseCropBoxes: CharacterCropBoxes) => CharacterCropBoxes;
  deriveAutoCropBoxes: (manifest: GeneratedCharacterManifest) => Promise<CharacterCropBoxes>;
  resolveManifestReferenceBankStatus: (
    manifest: GeneratedCharacterManifest
  ) => CharacterPipelineReferenceBankStatus;
  resolveManifestSpeciesId: (manifest: GeneratedCharacterManifest) => MascotSpeciesId;
  isSyntheticSmokeManifest: (manifest: GeneratedCharacterManifest) => boolean;
  collectManifestAssets: (...args: any[]) => any;
  loadImageRaster: (...args: any[]) => any;
  measureForegroundBounds: (...args: any[]) => any;
  deriveHeadCropFromBodyBounds: (...args: any[]) => any;
  detectFrontFaceFeatureCrops: (...args: any[]) => any;
  inspectBackgroundSafety: (...args: any[]) => any;
  measureDarkFeatureCenter: (...args: any[]) => any;
  meanRegionDifference: (...args: any[]) => any;
  readJson: <T>(filePath: string) => T;
  asRecord: (value: unknown) => Record<string, unknown> | null;
  coerceCharacterPackAnchorManifest: (value: unknown) => CharacterPackAnchorManifest | null;
  validatePackSchema: (pack: unknown) => any;
  resolveAnchorHeuristics: (...args: any[]) => any;
  anchorStatusMatchesExpectation: (...args: any[]) => boolean;
  normalizeAnchorWithinBounds: (...args: any[]) => { x: number; y: number } | null;
  resolvePackImageFilePath: (...args: any[]) => any;
  detectInteriorDarkComponents: (...args: any[]) => any;
  averageNumbers: (...args: any[]) => any;
  normalizedHorizontalDelta: (...args: any[]) => any;
  normalizedEarHeight: (...args: any[]) => any;
  expandCropBox: (...args: any[]) => any;
  boundsFromCropBox: (...args: any[]) => any;
  characterRootDir: (characterId: string) => string;
  writeJson: (filePath: string, value: unknown) => void;
  saveManifest: (manifest: GeneratedCharacterManifest) => GeneratedCharacterManifest;
  resolveAcceptanceFromChecks: Parameters<typeof materializeCharacterPipelineQcArtifacts>[0]["deps"]["resolveAcceptanceFromChecks"];
  repairActionForCode: Parameters<typeof materializeCharacterPipelineQcArtifacts>[0]["deps"]["repairActionForCode"];
  constants: {
    defaultCropBoxes: CharacterCropBoxes;
    fullImageCrop: CropBox;
    minFrontEyeDensity: number;
    minFrontMouthDensity: number;
    minViewVariation: number;
    minPackAnchorConfidence: number;
    minPackAnchorViewConfidence: number;
    minPackAnchorOverallConfidence: number;
    maxViewLandmarkVerticalDelta: number;
    maxViewLandmarkHorizontalDelta: number;
    characterPackAnchorViews: readonly GeneratedCharacterView[];
    characterPackAnchorIds: readonly CharacterPackAnchorId[];
  };
  resolveAnimationQcThresholds: (...args: any[]) => any;
};

type CharacterPipelineAcceptanceDeps = {
  loadManifest: (characterId: string) => GeneratedCharacterManifest;
  resolveManifestReferenceBankStatus: (
    manifest: GeneratedCharacterManifest
  ) => CharacterPipelineReferenceBankStatus;
};

type GeneratedCharacterPackPathDeps = {
  generatedRootDir: string;
};

export async function buildGeneratedCharacterPackWithDeps(input: {
  characterId: string;
  deps: GeneratedCharacterPackRuntimeBuildDeps;
}): Promise<{ packId: string; packPath: string; proposalPath: string; metaPath: string }> {
  await input.deps.synchronizeManifestCanvasToApprovedFront(input.characterId);
  const manifest = input.deps.loadManifest(input.characterId);
  input.deps.requireApprovedFrontMaster(input.characterId);
  const referenceBank = input.deps.resolveManifestReferenceBankStatus(manifest);
  const referenceBankReview = buildMascotReferenceBankReviewPlan(
    resolveMascotReferenceBankDiagnostics(referenceBank.species_id)
  );
  const autoCropBoxes = await input.deps.deriveAutoCropBoxes(manifest);
  const cropBoxes = input.deps.applyCropBoxOverrides(input.characterId, autoCropBoxes);
  const autoAnchorManifest = await input.deps.deriveAutoAnchorManifest(manifest, cropBoxes);
  const anchorManifest = input.deps.applyAnchorOverrides(input.characterId, autoAnchorManifest);
  const anchorReview = input.deps.collectAnchorReviewSummary(anchorManifest);
  const { packPath, proposalPath, metaPath, builtAt } = await materializeGeneratedCharacterPack({
    characterId: input.characterId,
    rootDir: input.deps.characterRootDir(input.characterId),
    sourceManifestPath: input.deps.manifestPathForCharacter(input.characterId),
    manifest,
    cropBoxes,
    anchorManifest,
    anchorReview,
    referenceBank,
    referenceBankReview,
    speciesId: input.deps.resolveManifestSpeciesId(manifest),
    deps: {
      cropNormalizedRegion: input.deps.cropNormalizedRegion,
      recenterPackedEyeAsset: input.deps.recenterPackedEyeAsset,
      ensurePackedEyeSlotContent: input.deps.ensurePackedEyeSlotContent,
      validatePack: input.deps.validatePack
    }
  });

  manifest.pack = {
    pack_id: input.characterId,
    pack_path: packPath,
    proposal_path: proposalPath,
    meta_path: metaPath,
    built_at: builtAt
  };
  input.deps.invalidateDerivedState(manifest, "acceptance_only");
  input.deps.saveManifest(manifest);

  return { packId: input.characterId, packPath, proposalPath, metaPath };
}

export async function runCharacterAnimationSafeQcWithDeps(input: {
  characterId: string;
  deps: GeneratedCharacterPipelineQcDeps;
}): Promise<{
  reportPath: string;
  repairTasksPath: string;
  passed: boolean;
  acceptanceStatus: CharacterPipelineAcceptanceStatus;
}> {
  await input.deps.synchronizeManifestCanvasToApprovedFront(input.characterId);
  const manifest = input.deps.loadManifest(input.characterId);
  const cropBoxes = input.deps.applyCropBoxOverrides(
    input.characterId,
    await input.deps.deriveAutoCropBoxes(manifest)
  );
  const referenceBank = input.deps.resolveManifestReferenceBankStatus(manifest);
  const animationQc = input.deps.resolveAnimationQcThresholds(input.deps.resolveManifestSpeciesId(manifest));
  const requiredExpressions = ["neutral", "happy", "blink"] as const;
  const requiredVisemes = ["mouth_closed", "mouth_open_small", "mouth_open_wide", "mouth_round_o"] as const;
  const eyeRegion = { cx: 0.5, cy: 0.22, w: 0.28, h: 0.09 };
  const strictGeneratedChecks = !input.deps.isSyntheticSmokeManifest(manifest);
  const { checks, rasterMap, referenceFrontRaster, mouthCrop } = await collectCharacterPipelineAnimationChecks({
    manifest,
    referenceBank,
    animationQc,
    requiredExpressions,
    requiredVisemes,
    strictGeneratedChecks,
    eyeRegion,
    constants: {
      defaultCropBoxes: input.deps.constants.defaultCropBoxes,
      fullImageCrop: input.deps.constants.fullImageCrop,
      minFrontEyeDensity: input.deps.constants.minFrontEyeDensity,
      minFrontMouthDensity: input.deps.constants.minFrontMouthDensity,
      minViewVariation: input.deps.constants.minViewVariation
    },
    deps: {
      collectManifestAssets: input.deps.collectManifestAssets,
      isSyntheticSmokeManifest: input.deps.isSyntheticSmokeManifest,
      loadImageRaster: input.deps.loadImageRaster,
      measureForegroundBounds: input.deps.measureForegroundBounds,
      deriveHeadCropFromBodyBounds: input.deps.deriveHeadCropFromBodyBounds,
      detectFrontFaceFeatureCrops: input.deps.detectFrontFaceFeatureCrops,
      inspectBackgroundSafety: input.deps.inspectBackgroundSafety,
      measureDarkFeatureCenter: input.deps.measureDarkFeatureCenter,
      meanRegionDifference: input.deps.meanRegionDifference
    }
  });

  checks.push(
    ...(await collectCharacterPipelinePackQcChecks({
      manifest,
      cropBoxes,
      referenceFrontRaster,
      rasterMap,
      mouthCrop,
      strictGeneratedChecks,
      requiredVisemes,
      animationQc,
      constants: {
        fullImageCrop: input.deps.constants.fullImageCrop,
        minPackAnchorConfidence: input.deps.constants.minPackAnchorConfidence,
        minPackAnchorViewConfidence: input.deps.constants.minPackAnchorViewConfidence,
        minPackAnchorOverallConfidence: input.deps.constants.minPackAnchorOverallConfidence,
        maxViewLandmarkVerticalDelta: input.deps.constants.maxViewLandmarkVerticalDelta,
        maxViewLandmarkHorizontalDelta: input.deps.constants.maxViewLandmarkHorizontalDelta,
        characterPackAnchorViews: input.deps.constants.characterPackAnchorViews,
        characterPackAnchorIds: input.deps.constants.characterPackAnchorIds
      },
      deps: {
        readJson: input.deps.readJson,
        asRecord: input.deps.asRecord,
        coerceCharacterPackAnchorManifest: input.deps.coerceCharacterPackAnchorManifest,
        validatePackSchema: input.deps.validatePackSchema,
        resolveSpeciesId: input.deps.resolveManifestSpeciesId,
        resolveAnchorHeuristics: input.deps.resolveAnchorHeuristics,
        anchorStatusMatchesExpectation: input.deps.anchorStatusMatchesExpectation,
        normalizeAnchorWithinBounds: input.deps.normalizeAnchorWithinBounds,
        resolvePackImageFilePath: input.deps.resolvePackImageFilePath,
        detectInteriorDarkComponents: input.deps.detectInteriorDarkComponents,
        measureForegroundBounds: input.deps.measureForegroundBounds,
        loadImageRaster: input.deps.loadImageRaster,
        measureDarkFeatureCenter: input.deps.measureDarkFeatureCenter,
        averageNumbers: input.deps.averageNumbers,
        normalizedHorizontalDelta: input.deps.normalizedHorizontalDelta,
        normalizedEarHeight: input.deps.normalizedEarHeight,
        expandCropBox: input.deps.expandCropBox,
        boundsFromCropBox: input.deps.boundsFromCropBox
      }
    }))
  );

  return materializeCharacterPipelineQcArtifacts({
    characterId: input.characterId,
    manifest,
    checks,
    referenceBank,
    deps: {
      characterRootDir: input.deps.characterRootDir,
      writeJson: input.deps.writeJson,
      saveManifest: input.deps.saveManifest,
      resolveAcceptanceFromChecks: input.deps.resolveAcceptanceFromChecks,
      repairActionForCode: input.deps.repairActionForCode
    }
  });
}

export function resolveCharacterPipelineAcceptanceWithDeps(
  characterId: string,
  deps: CharacterPipelineAcceptanceDeps
): CharacterPipelineAcceptance {
  const manifest = deps.loadManifest(characterId);
  const referenceBank = deps.resolveManifestReferenceBankStatus(manifest);
  if (manifest.acceptance) {
    return {
      ...manifest.acceptance,
      reference_bank: manifest.acceptance.reference_bank ?? referenceBank
    };
  }
  if (manifest.qc) {
    return {
      status: manifest.qc.acceptance_status,
      accepted: manifest.qc.acceptance_status === "accepted",
      updated_at: manifest.qc.generated_at,
      report_path: manifest.qc.report_path,
      repair_tasks_path: manifest.qc.repair_tasks_path,
      blocking_check_codes: [],
      repair_task_count: 0,
      reference_bank: manifest.qc.reference_bank ?? referenceBank
    };
  }
  return {
    status: "blocked",
    accepted: false,
    updated_at: new Date(0).toISOString(),
    blocking_check_codes: ["QC_NOT_RUN"],
    repair_task_count: 0,
    reference_bank: referenceBank
  };
}

export function assertCharacterPipelineAcceptedWithDeps(
  characterId: string,
  deps: CharacterPipelineAcceptanceDeps
): CharacterPipelineAcceptance {
  const acceptance = resolveCharacterPipelineAcceptanceWithDeps(characterId, deps);
  if (acceptance.status !== "accepted") {
    const reportHint = acceptance.report_path ? ` See ${acceptance.report_path}` : "";
    throw new Error(
      `Generated character pack ${characterId} is not accepted for render (status=${acceptance.status}).${reportHint}`
    );
  }
  return acceptance;
}

export function resolveGeneratedCharacterPackPathWithDeps(packId: string, deps: GeneratedCharacterPackPathDeps): string {
  return path.join(deps.generatedRootDir, packId, "pack", "character.pack.json");
}

export function loadGeneratedCharacterPackWithDeps(
  packId: string,
  deps: GeneratedCharacterPackPathDeps & { readJson: <T>(filePath: string) => T }
): unknown | null {
  const packPath = resolveGeneratedCharacterPackPathWithDeps(packId, deps);
  if (!fs.existsSync(packPath)) {
    return null;
  }
  return deps.readJson<unknown>(packPath);
}
