import fs from "node:fs";
import type {
  CharacterPipelineQcCheck,
  CharacterPipelineReferenceBankStatus,
  CharacterStillAsset,
  CropBox,
  DarkFeatureComponent,
  ForegroundBounds,
  GeneratedCharacterExpression,
  GeneratedCharacterManifest,
  GeneratedCharacterViseme,
  GeneratedCharacterView,
  LoadedImageRaster
} from "./generatedCharacterPipeline";

type AnimationQcThresholds = {
  minExpressionFaceVariation: number;
  minVisemeFaceVariation: number;
  maxExpressionBodyCenterDrift: number;
  maxExpressionBodySizeDelta: number;
  maxVisemeBodyCenterDrift: number;
  maxEyeAnchorDrift: number;
  maxMouthAnchorDrift: number;
};

type AnimationCheckDeps = {
  collectManifestAssets: (manifest: GeneratedCharacterManifest) => CharacterStillAsset[];
  isSyntheticSmokeManifest: (manifest: GeneratedCharacterManifest) => boolean;
  loadImageRaster: (filePath: string) => Promise<LoadedImageRaster>;
  measureForegroundBounds: (image: LoadedImageRaster, crop?: CropBox) => ForegroundBounds | null;
  deriveHeadCropFromBodyBounds: (bounds: ForegroundBounds, view: GeneratedCharacterView) => CropBox;
  detectFrontFaceFeatureCrops: (
    image: LoadedImageRaster,
    headCrop: CropBox
  ) => { leftEye?: CropBox; rightEye?: CropBox; mouth?: CropBox; components: DarkFeatureComponent[] };
  inspectBackgroundSafety: (
    image: LoadedImageRaster
  ) => { safe: boolean; mode: "alpha" | "solid_light" | "unsafe"; meanLuma: number; meanVariance: number };
  measureDarkFeatureCenter: (
    image: LoadedImageRaster,
    crop: CropBox
  ) => { x: number; y: number; density: number } | null;
  meanRegionDifference: (a: LoadedImageRaster, b: LoadedImageRaster, crop: CropBox) => number;
};

type AnimationCheckConstants = {
  defaultCropBoxes: {
    head: Record<GeneratedCharacterView, CropBox>;
    eyes: { left: CropBox; right: CropBox };
    mouth: CropBox;
  };
  fullImageCrop: CropBox;
  minFrontEyeDensity: number;
  minFrontMouthDensity: number;
  minViewVariation: number;
};

export async function collectCharacterPipelineAnimationChecks(input: {
  manifest: GeneratedCharacterManifest;
  referenceBank: CharacterPipelineReferenceBankStatus;
  animationQc: AnimationQcThresholds;
  requiredExpressions: readonly GeneratedCharacterExpression[];
  requiredVisemes: readonly GeneratedCharacterViseme[];
  strictGeneratedChecks: boolean;
  eyeRegion: CropBox;
  constants: AnimationCheckConstants;
  deps: AnimationCheckDeps;
}): Promise<{
  checks: CharacterPipelineQcCheck[];
  rasterMap: Map<string, LoadedImageRaster>;
  referenceFrontRaster: LoadedImageRaster | null;
  mouthCrop: CropBox;
}> {
  const checks: CharacterPipelineQcCheck[] = [];
  const pushCheck = (
    code: string,
    passed: boolean,
    message: string,
    severity: "INFO" | "WARN" | "ERROR",
    extras: Omit<CharacterPipelineQcCheck, "code" | "passed" | "message" | "severity"> = {}
  ) => {
    checks.push({ code, passed, message, severity, ...extras });
  };

  const allAssets = input.deps.collectManifestAssets(input.manifest);
  const assetById = new Map(allAssets.map((asset) => [asset.asset_id, asset] as const));
  const manifestIntegrityIssues: string[] = [];

  for (const asset of allAssets) {
    if (!fs.existsSync(asset.file_path)) {
      manifestIntegrityIssues.push(`missing_file:${asset.asset_id}`);
    }
    if (asset.metadata_path && !fs.existsSync(asset.metadata_path)) {
      manifestIntegrityIssues.push(`missing_meta:${asset.asset_id}`);
    }
    if (asset.parent_asset_id && !assetById.has(asset.parent_asset_id)) {
      manifestIntegrityIssues.push(`missing_parent:${asset.asset_id}->${asset.parent_asset_id}`);
    }
  }
  if (
    input.manifest.approved_front_master &&
    input.manifest.front_master &&
    input.manifest.approved_front_master.asset_id !== input.manifest.front_master.asset_id
  ) {
    manifestIntegrityIssues.push("approved_front_master_pointer_mismatch");
  }

  pushCheck(
    "MANIFEST_INTEGRITY",
    manifestIntegrityIssues.length === 0,
    manifestIntegrityIssues.length === 0
      ? "Manifest references are internally consistent."
      : `Manifest issues: ${manifestIntegrityIssues.join(", ")}`,
    manifestIntegrityIssues.length === 0 ? "INFO" : "ERROR"
  );
  pushCheck(
    "REFERENCE_BANK_READINESS",
    input.referenceBank.status === "species_ready",
    input.referenceBank.status === "species_ready"
      ? `Reference bank is species_ready for ${input.referenceBank.species_id}.`
      : `Reference bank is scaffold_only for ${input.referenceBank.species_id}; missing roles: ${input.referenceBank.missing_roles.join(", ") || "none"}.`,
    input.referenceBank.status === "species_ready" ? "INFO" : "WARN"
  );
  pushCheck(
    "APPROVED_FRONT_MASTER",
    Boolean(input.manifest.approved_front_master?.file_path && input.manifest.front_master?.approved),
    input.manifest.approved_front_master?.file_path ? "Approved front master present." : "Approved front master missing.",
    "ERROR",
    {
      asset_paths: input.manifest.front_master?.file_path ? [input.manifest.front_master.file_path] : undefined
    }
  );

  for (const view of ["front", "threeQuarter", "profile"] as const) {
    pushCheck(
      `VIEW_${view.toUpperCase()}`,
      Boolean(input.manifest.views[view]?.file_path && fs.existsSync(input.manifest.views[view]!.file_path)),
      input.manifest.views[view]?.file_path ? `${view} view present.` : `${view} view missing.`,
      "ERROR",
      {
        asset_paths: input.manifest.views[view]?.file_path ? [input.manifest.views[view]!.file_path] : undefined
      }
    );
  }
  for (const expression of input.requiredExpressions) {
    pushCheck(
      `EXPRESSION_FRONT_${expression.toUpperCase()}`,
      Boolean(input.manifest.expressions.front?.[expression]?.file_path),
      input.manifest.expressions.front?.[expression]?.file_path
        ? `front/${expression} expression present.`
        : `front/${expression} expression missing.`,
      "ERROR",
      {
        asset_paths: input.manifest.expressions.front?.[expression]?.file_path
          ? [input.manifest.expressions.front[expression]!.file_path]
          : undefined
      }
    );
  }
  for (const viseme of input.requiredVisemes) {
    pushCheck(
      `VISEME_FRONT_${viseme.toUpperCase()}`,
      Boolean(input.manifest.visemes.front?.[viseme]?.file_path),
      input.manifest.visemes.front?.[viseme]?.file_path ? `front/${viseme} viseme present.` : `front/${viseme} viseme missing.`,
      "ERROR",
      {
        asset_paths: input.manifest.visemes.front?.[viseme]?.file_path
          ? [input.manifest.visemes.front[viseme]!.file_path]
          : undefined
      }
    );
  }

  const rasterAssets = [
    input.manifest.front_master,
    input.manifest.views.front,
    input.manifest.views.threeQuarter,
    input.manifest.views.profile,
    input.manifest.expressions.front?.neutral,
    input.manifest.expressions.front?.happy,
    input.manifest.expressions.front?.blink,
    input.manifest.expressions.front?.surprised,
    input.manifest.visemes.front?.mouth_closed,
    input.manifest.visemes.front?.mouth_open_small,
    input.manifest.visemes.front?.mouth_open_wide,
    input.manifest.visemes.front?.mouth_round_o
  ].filter((asset): asset is CharacterStillAsset => Boolean(asset?.file_path && fs.existsSync(asset.file_path)));

  const rasterMap = new Map<string, LoadedImageRaster>();
  await Promise.all(
    rasterAssets.map(async (asset) => {
      rasterMap.set(asset.asset_id, await input.deps.loadImageRaster(asset.file_path));
    })
  );

  const referenceFrontAsset = input.manifest.views.front ?? input.manifest.front_master;
  const referenceFrontRaster = referenceFrontAsset ? rasterMap.get(referenceFrontAsset.asset_id) ?? null : null;
  const frontMasterRaster =
    input.manifest.front_master ? rasterMap.get(input.manifest.front_master.asset_id) ?? null : referenceFrontRaster;
  const referenceBodyBounds = referenceFrontRaster ? input.deps.measureForegroundBounds(referenceFrontRaster) : null;
  const referenceHeadCrop = referenceBodyBounds
    ? input.deps.deriveHeadCropFromBodyBounds(referenceBodyBounds, "front")
    : input.constants.defaultCropBoxes.head.front;
  const referenceFaceFeatures = referenceFrontRaster
    ? input.deps.detectFrontFaceFeatureCrops(referenceFrontRaster, referenceHeadCrop)
    : { components: [] as DarkFeatureComponent[] };
  const leftEyeCrop = referenceFaceFeatures.leftEye ?? input.constants.defaultCropBoxes.eyes.left;
  const rightEyeCrop = referenceFaceFeatures.rightEye ?? input.constants.defaultCropBoxes.eyes.right;
  const mouthCrop = referenceFaceFeatures.mouth ?? input.constants.defaultCropBoxes.mouth;

  if (frontMasterRaster) {
    const background = input.deps.inspectBackgroundSafety(frontMasterRaster);
    pushCheck(
      "FRONT_MASTER_BACKGROUND_SAFE",
      background.safe,
      background.safe
        ? `Front master background is animation-safe (${background.mode}).`
        : `Front master background looks unsafe (${background.mode}, luma=${background.meanLuma.toFixed(1)}, variance=${background.meanVariance.toFixed(1)}).`,
      background.safe ? "INFO" : "WARN",
      {
        asset_paths: [frontMasterRaster.filePath],
        metric: Number(background.meanVariance.toFixed(3)),
        threshold: 160
      }
    );
  }

  if (referenceFrontRaster) {
    const leftEye = referenceFaceFeatures.leftEye ? input.deps.measureDarkFeatureCenter(referenceFrontRaster, leftEyeCrop) : null;
    const rightEye = referenceFaceFeatures.rightEye ? input.deps.measureDarkFeatureCenter(referenceFrontRaster, rightEyeCrop) : null;
    const mouth = referenceFaceFeatures.mouth ? input.deps.measureDarkFeatureCenter(referenceFrontRaster, mouthCrop) : null;
    const eyeSpacing =
      referenceFaceFeatures.leftEye && referenceFaceFeatures.rightEye
        ? referenceFaceFeatures.rightEye.cx - referenceFaceFeatures.leftEye.cx
        : 0;
    const eyesPresent = Boolean(referenceFaceFeatures.leftEye && referenceFaceFeatures.rightEye);
    const mouthPresent = Boolean(referenceFaceFeatures.mouth);

    pushCheck(
      "FRONT_FACE_EYES_PRESENT",
      input.strictGeneratedChecks ? eyesPresent : true,
      input.strictGeneratedChecks
        ? eyesPresent
          ? "Front face contains plausible left/right eye features."
          : `Front face does not expose two interior eye components (components=${referenceFaceFeatures.components.length}, spacing=${eyeSpacing.toFixed(3)}).`
        : "Synthetic smoke fixture: front eye feature check skipped.",
      input.strictGeneratedChecks ? "ERROR" : "INFO",
      {
        asset_paths: [referenceFrontRaster.filePath],
        metric: leftEye && rightEye ? Number((((leftEye.density + rightEye.density) / 2) * 1000).toFixed(3)) : undefined,
        threshold: Number((input.constants.minFrontEyeDensity * 1000).toFixed(3))
      }
    );
    pushCheck(
      "FRONT_FACE_MOUTH_PRESENT",
      input.strictGeneratedChecks ? mouthPresent : true,
      input.strictGeneratedChecks
        ? mouthPresent
          ? "Front face contains a readable mouth feature."
          : `Front face mouth feature is missing inside the derived head crop (components=${referenceFaceFeatures.components.length}).`
        : "Synthetic smoke fixture: front mouth feature check skipped.",
      input.strictGeneratedChecks ? "ERROR" : "INFO",
      {
        asset_paths: [referenceFrontRaster.filePath],
        metric: mouth ? Number((mouth.density * 1000).toFixed(3)) : undefined,
        threshold: Number((input.constants.minFrontMouthDensity * 1000).toFixed(3))
      }
    );
  }

  const viewRasters = (["front", "threeQuarter", "profile"] as const)
    .map((view) => {
      const asset = input.manifest.views[view];
      return asset ? { view, asset, raster: rasterMap.get(asset.asset_id) ?? null } : null;
    })
    .filter(
      (
        entry
      ): entry is {
        view: GeneratedCharacterView;
        asset: CharacterStillAsset;
        raster: LoadedImageRaster;
      } => Boolean(entry?.raster)
    );
  if (viewRasters.length > 0) {
    const baseline = viewRasters[0]!.raster;
    const mismatched = viewRasters.filter(({ raster }) => raster.width !== baseline.width || raster.height !== baseline.height);
    pushCheck(
      "VIEW_CANVAS_UNIFORM",
      mismatched.length === 0,
      mismatched.length === 0
        ? `All view canvases match ${baseline.width}x${baseline.height}.`
        : `View canvas mismatch: ${mismatched.map(({ view, raster }) => `${view}=${raster.width}x${raster.height}`).join(", ")}`,
      mismatched.length === 0 ? "INFO" : "ERROR",
      { asset_paths: mismatched.map(({ raster }) => raster.filePath) }
    );
  }
  if (referenceFrontRaster) {
    for (const view of ["threeQuarter", "profile"] as const) {
      const asset = input.manifest.views[view];
      const raster = asset ? rasterMap.get(asset.asset_id) ?? null : null;
      if (!asset || !raster) {
        continue;
      }
      const variation = input.deps.meanRegionDifference(referenceFrontRaster, raster, input.constants.fullImageCrop);
      const passed = variation >= input.constants.minViewVariation;
      pushCheck(
        `VIEW_VARIATION_${view.toUpperCase()}`,
        input.strictGeneratedChecks ? passed : true,
        input.strictGeneratedChecks
          ? passed
            ? `${view} view has enough silhouette difference from the front view.`
            : `${view} view is too similar to the front view (variation=${variation.toFixed(4)}).`
          : `Synthetic smoke fixture: ${view} variation check skipped.`,
        input.strictGeneratedChecks ? "ERROR" : "INFO",
        {
          asset_paths: [asset.file_path],
          metric: Number(variation.toFixed(4)),
          threshold: input.constants.minViewVariation
        }
      );
    }
  }

  const expressionAssets = input.requiredExpressions
    .map((expression) => input.manifest.expressions.front?.[expression])
    .filter((asset): asset is CharacterStillAsset => Boolean(asset?.file_path && fs.existsSync(asset.file_path)));
  const expressionRasters = expressionAssets
    .map((asset) => ({ asset, raster: rasterMap.get(asset.asset_id) ?? null }))
    .filter((entry): entry is { asset: CharacterStillAsset; raster: LoadedImageRaster } => Boolean(entry.raster));
  if (referenceFrontRaster && expressionRasters.length > 0) {
    const mismatched = expressionRasters.filter(
      ({ raster }) => raster.width !== referenceFrontRaster.width || raster.height !== referenceFrontRaster.height
    );
    pushCheck(
      "EXPRESSION_CANVAS_UNIFORM",
      mismatched.length === 0,
      mismatched.length === 0
        ? "Expression canvases match the approved front view."
        : `Expression canvas mismatch: ${mismatched.map(({ asset, raster }) => `${asset.expression}=${raster.width}x${raster.height}`).join(", ")}`,
      mismatched.length === 0 ? "INFO" : "ERROR",
      { asset_paths: mismatched.map(({ raster }) => raster.filePath) }
    );
  }
  const neutralExpressionAsset = input.manifest.expressions.front?.neutral ?? referenceFrontAsset ?? input.manifest.front_master;
  const neutralExpressionRaster = neutralExpressionAsset ? rasterMap.get(neutralExpressionAsset.asset_id) ?? null : null;
  if (neutralExpressionRaster) {
    for (const expression of ["happy", "blink", "surprised"] as const) {
      const asset = input.manifest.expressions.front?.[expression];
      const raster = asset ? rasterMap.get(asset.asset_id) ?? null : null;
      if (!asset || !raster) {
        continue;
      }
      const eyeDelta =
        (input.deps.meanRegionDifference(neutralExpressionRaster, raster, leftEyeCrop) +
          input.deps.meanRegionDifference(neutralExpressionRaster, raster, rightEyeCrop)) /
        2;
      const mouthDelta = input.deps.meanRegionDifference(neutralExpressionRaster, raster, mouthCrop);
      const faceDelta = expression === "blink" ? eyeDelta : Math.max(eyeDelta, mouthDelta);
      const passed = faceDelta >= input.animationQc.minExpressionFaceVariation;
      pushCheck(
        `EXPRESSION_FACE_VARIATION_${expression.toUpperCase()}`,
        input.strictGeneratedChecks ? passed : true,
        input.strictGeneratedChecks
          ? passed
            ? `Expression ${expression} changes the face enough for deterministic playback.`
            : `Expression ${expression} is too close to neutral (eye=${eyeDelta.toFixed(4)}, mouth=${mouthDelta.toFixed(4)}).`
          : `Synthetic smoke fixture: expression ${expression} variation check skipped.`,
        input.strictGeneratedChecks ? "ERROR" : "INFO",
        {
          asset_paths: [asset.file_path],
          metric: Number(faceDelta.toFixed(4)),
          threshold: input.animationQc.minExpressionFaceVariation
        }
      );
    }
  }

  const visemeAssets = input.requiredVisemes
    .map((viseme) => input.manifest.visemes.front?.[viseme])
    .filter((asset): asset is CharacterStillAsset => Boolean(asset?.file_path && fs.existsSync(asset.file_path)));
  const visemeRasters = visemeAssets
    .map((asset) => ({ asset, raster: rasterMap.get(asset.asset_id) ?? null }))
    .filter((entry): entry is { asset: CharacterStillAsset; raster: LoadedImageRaster } => Boolean(entry.raster));
  if (referenceFrontRaster && visemeRasters.length > 0) {
    const mismatched = visemeRasters.filter(
      ({ raster }) => raster.width !== referenceFrontRaster.width || raster.height !== referenceFrontRaster.height
    );
    pushCheck(
      "VISEME_CANVAS_UNIFORM",
      mismatched.length === 0,
      mismatched.length === 0
        ? "Viseme canvases match the approved front view."
        : `Viseme canvas mismatch: ${mismatched.map(({ asset, raster }) => `${asset.viseme}=${raster.width}x${raster.height}`).join(", ")}`,
      mismatched.length === 0 ? "INFO" : "ERROR",
      { asset_paths: mismatched.map(({ raster }) => raster.filePath) }
    );
  }
  const mouthClosedAsset = input.manifest.visemes.front?.mouth_closed;
  const mouthClosedRaster = mouthClosedAsset ? rasterMap.get(mouthClosedAsset.asset_id) ?? null : null;
  if (mouthClosedRaster) {
    for (const viseme of ["mouth_open_small", "mouth_open_wide", "mouth_round_o"] as const) {
      const asset = input.manifest.visemes.front?.[viseme];
      const raster = asset ? rasterMap.get(asset.asset_id) ?? null : null;
      if (!asset || !raster) {
        continue;
      }
      const mouthDelta = input.deps.meanRegionDifference(mouthClosedRaster, raster, mouthCrop);
      const passed = mouthDelta >= input.animationQc.minVisemeFaceVariation;
      pushCheck(
        `VISEME_FACE_VARIATION_${viseme.toUpperCase()}`,
        input.strictGeneratedChecks ? passed : true,
        input.strictGeneratedChecks
          ? passed
            ? `Viseme ${viseme} changes the mouth region enough for deterministic lip sync.`
            : `Viseme ${viseme} is too close to mouth_closed (mouth=${mouthDelta.toFixed(4)}).`
          : `Synthetic smoke fixture: viseme ${viseme} variation check skipped.`,
        input.strictGeneratedChecks ? "ERROR" : "INFO",
        {
          asset_paths: [asset.file_path],
          metric: Number(mouthDelta.toFixed(4)),
          threshold: input.animationQc.minVisemeFaceVariation
        }
      );
    }
  }

  if (referenceBodyBounds) {
    for (const expression of ["happy", "blink", "surprised"] as const) {
      const asset = input.manifest.expressions.front?.[expression];
      const raster = asset ? rasterMap.get(asset.asset_id) ?? null : null;
      if (!asset || !raster) {
        continue;
      }
      const bounds = input.deps.measureForegroundBounds(raster);
      if (!bounds) {
        pushCheck(`EXPRESSION_BODY_DRIFT_${expression.toUpperCase()}`, false, `Could not detect body silhouette for expression ${expression}.`, "ERROR", {
          asset_paths: [asset.file_path]
        });
        continue;
      }
      const centerDistance = Math.hypot(bounds.centerX - referenceBodyBounds.centerX, bounds.centerY - referenceBodyBounds.centerY);
      const heightDelta = Math.abs(bounds.height - referenceBodyBounds.height);
      const widthDelta = Math.abs(bounds.width - referenceBodyBounds.width);
      const passed =
        centerDistance <= input.animationQc.maxExpressionBodyCenterDrift &&
        heightDelta <= input.animationQc.maxExpressionBodySizeDelta &&
        widthDelta <= input.animationQc.maxExpressionBodySizeDelta;
      pushCheck(
        `EXPRESSION_BODY_DRIFT_${expression.toUpperCase()}`,
        passed,
        passed
          ? `Expression ${expression} silhouette stays anchored to the front neutral body.`
          : `Expression ${expression} drifts too far (center=${centerDistance.toFixed(3)}, width=${widthDelta.toFixed(3)}, height=${heightDelta.toFixed(3)}).`,
        passed ? "INFO" : "ERROR",
        {
          asset_paths: [asset.file_path],
          metric: Number(centerDistance.toFixed(3)),
          threshold: input.animationQc.maxExpressionBodyCenterDrift
        }
      );
    }
    for (const viseme of input.requiredVisemes) {
      const asset = input.manifest.visemes.front?.[viseme];
      const raster = asset ? rasterMap.get(asset.asset_id) ?? null : null;
      if (!asset || !raster) {
        continue;
      }
      const bounds = input.deps.measureForegroundBounds(raster);
      if (!bounds) {
        pushCheck(`VISEME_BODY_DRIFT_${viseme.toUpperCase()}`, false, `Could not detect body silhouette for viseme ${viseme}.`, "ERROR", {
          asset_paths: [asset.file_path]
        });
        continue;
      }
      const centerDistance = Math.hypot(bounds.centerX - referenceBodyBounds.centerX, bounds.centerY - referenceBodyBounds.centerY);
      const passed = centerDistance <= input.animationQc.maxVisemeBodyCenterDrift;
      pushCheck(
        `VISEME_BODY_DRIFT_${viseme.toUpperCase()}`,
        passed,
        passed
          ? `Viseme ${viseme} keeps the body silhouette anchored.`
          : `Viseme ${viseme} drifts too far from the front neutral body (center=${centerDistance.toFixed(3)}).`,
        passed ? "INFO" : "ERROR",
        {
          asset_paths: [asset.file_path],
          metric: Number(centerDistance.toFixed(3)),
          threshold: input.animationQc.maxVisemeBodyCenterDrift
        }
      );
    }
  }

  if (referenceFrontRaster) {
    const referenceHeadBounds = input.deps.measureForegroundBounds(referenceFrontRaster, referenceHeadCrop);
    if (referenceHeadBounds) {
      for (const view of ["threeQuarter", "profile"] as const) {
        const asset = input.manifest.views[view];
        const raster = asset ? rasterMap.get(asset.asset_id) ?? null : null;
        if (!asset || !raster) {
          continue;
        }
        const bounds = input.deps.measureForegroundBounds(raster, input.constants.defaultCropBoxes.head[view]);
        if (!bounds) {
          pushCheck(`VIEW_HEAD_SCALE_${view.toUpperCase()}`, false, `Could not detect head region for ${view}.`, "WARN", {
            asset_paths: [asset.file_path]
          });
          continue;
        }
        const scaleDelta = Math.abs(bounds.height - referenceHeadBounds.height);
        const centerDistance = Math.hypot(bounds.centerX - referenceHeadBounds.centerX, bounds.centerY - referenceHeadBounds.centerY);
        const passed = scaleDelta <= 0.09 && centerDistance <= 0.05;
        pushCheck(
          `VIEW_HEAD_SCALE_${view.toUpperCase()}`,
          passed,
          passed
            ? `${view} head scale stays within tolerance.`
            : `${view} head scale/anchor drift detected (scale=${scaleDelta.toFixed(3)}, center=${centerDistance.toFixed(3)}).`,
          passed ? "INFO" : "WARN",
          {
            asset_paths: [asset.file_path],
            metric: Number(scaleDelta.toFixed(3)),
            threshold: 0.09
          }
        );
      }
    }

    const referenceEyeCenter = input.deps.measureDarkFeatureCenter(referenceFrontRaster, input.eyeRegion);
    if (referenceEyeCenter) {
      for (const expression of ["happy", "blink", "surprised"] as const) {
        const asset = input.manifest.expressions.front?.[expression];
        const raster = asset ? rasterMap.get(asset.asset_id) ?? null : null;
        if (!asset || !raster) {
          continue;
        }
        const center = input.deps.measureDarkFeatureCenter(raster, input.eyeRegion);
        if (!center) {
          pushCheck(`EYE_ANCHOR_${expression.toUpperCase()}`, false, `Could not detect eye anchor for ${expression}.`, "WARN", {
            asset_paths: [asset.file_path]
          });
          continue;
        }
        const drift = Math.hypot(center.x - referenceEyeCenter.x, center.y - referenceEyeCenter.y);
        const passed = drift <= input.animationQc.maxEyeAnchorDrift;
        pushCheck(
          `EYE_ANCHOR_${expression.toUpperCase()}`,
          passed,
          passed
            ? `Eye anchor for ${expression} stays within tolerance.`
            : `Eye anchor drift for ${expression} is too high (${drift.toFixed(3)}).`,
          passed ? "INFO" : "WARN",
          {
            asset_paths: [asset.file_path],
            metric: Number(drift.toFixed(3)),
            threshold: input.animationQc.maxEyeAnchorDrift
          }
        );
      }
    }

    const referenceMouthCenter = input.deps.measureDarkFeatureCenter(referenceFrontRaster, mouthCrop);
    if (referenceMouthCenter) {
      for (const viseme of input.requiredVisemes) {
        const asset = input.manifest.visemes.front?.[viseme];
        const raster = asset ? rasterMap.get(asset.asset_id) ?? null : null;
        if (!asset || !raster) {
          continue;
        }
        const center = input.deps.measureDarkFeatureCenter(raster, mouthCrop);
        if (!center) {
          pushCheck(`MOUTH_ANCHOR_${viseme.toUpperCase()}`, false, `Could not detect mouth anchor for ${viseme}.`, "WARN", {
            asset_paths: [asset.file_path]
          });
          continue;
        }
        const drift = Math.hypot(center.x - referenceMouthCenter.x, center.y - referenceMouthCenter.y);
        const passed = drift <= input.animationQc.maxMouthAnchorDrift;
        pushCheck(
          `MOUTH_ANCHOR_${viseme.toUpperCase()}`,
          passed,
          passed
            ? `Mouth anchor for ${viseme} stays within tolerance.`
            : `Mouth anchor drift for ${viseme} is too high (${drift.toFixed(3)}).`,
          passed ? "INFO" : "WARN",
          {
            asset_paths: [asset.file_path],
            metric: Number(drift.toFixed(3)),
            threshold: input.animationQc.maxMouthAnchorDrift
          }
        );
      }
    }
  }

  return { checks, rasterMap, referenceFrontRaster, mouthCrop };
}
