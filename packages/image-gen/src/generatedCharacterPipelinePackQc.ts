import fs from "node:fs";
import type {
  CharacterCropBoxes,
  CharacterPackAnchorId,
  CharacterPackAnchorStatus,
  CharacterPackAnchorManifest,
  CharacterPipelineQcCheck,
  CropBox,
  ForegroundBounds,
  GeneratedCharacterManifest,
  GeneratedCharacterViseme,
  GeneratedCharacterView,
  LoadedImageRaster
} from "./generatedCharacterPipeline";
import type { MascotSpeciesId } from "./types";

type AnimationQcThresholds = {
  maxMouthAnchorDrift: number;
};

type PackAnchorHeuristics = {
  byView: Record<
    GeneratedCharacterView,
    {
      qc: {
        muzzleProjection?: { min: number; max: number };
        earHeight?: { min: number; max: number };
        requirePawReadable?: boolean;
        requireTailVisible?: boolean;
      };
      expectedVisibility: {
        eyeFar: "present" | "occluded" | "missing" | "not_applicable";
        earFar: "present" | "occluded" | "missing" | "not_applicable";
      };
    }
  >;
};

type PackQcConstants = {
  fullImageCrop: CropBox;
  minPackAnchorConfidence: number;
  minPackAnchorViewConfidence: number;
  minPackAnchorOverallConfidence: number;
  maxViewLandmarkVerticalDelta: number;
  maxViewLandmarkHorizontalDelta: number;
  characterPackAnchorViews: readonly GeneratedCharacterView[];
  characterPackAnchorIds: readonly CharacterPackAnchorId[];
};

type PackQcDeps = {
  readJson: <T>(filePath: string) => T;
  asRecord: (value: unknown) => Record<string, unknown> | null;
  coerceCharacterPackAnchorManifest: (value: unknown) => CharacterPackAnchorManifest | null;
  validatePackSchema: (pack: unknown) => { ok: boolean };
  resolveSpeciesId: (manifest: GeneratedCharacterManifest) => MascotSpeciesId;
  resolveAnchorHeuristics: (speciesId: MascotSpeciesId) => PackAnchorHeuristics;
  anchorStatusMatchesExpectation: (
    actual: CharacterPackAnchorStatus | undefined,
    expected: "present" | "occluded" | "missing" | "not_applicable"
  ) => boolean;
  normalizeAnchorWithinBounds: (
    anchor: { x?: number; y?: number } | undefined,
    bounds: ForegroundBounds
  ) => { x: number; y: number } | null;
  resolvePackImageFilePath: (value: unknown) => string | null;
  detectInteriorDarkComponents: (image: LoadedImageRaster, crop: CropBox) => unknown[];
  measureForegroundBounds: (image: LoadedImageRaster, crop?: CropBox) => ForegroundBounds | null;
  loadImageRaster: (filePath: string) => Promise<LoadedImageRaster>;
  measureDarkFeatureCenter: (
    image: LoadedImageRaster,
    crop: CropBox
  ) => { x: number; y: number; density: number } | null;
  averageNumbers: (values: number[]) => number | null;
  normalizedHorizontalDelta: (
    head: { x?: number } | undefined,
    anchor: { x?: number } | undefined,
    bounds: ForegroundBounds,
    facingSign: number
  ) => number | null;
  normalizedEarHeight: (
    head: { y?: number } | undefined,
    ear: { y?: number } | undefined,
    bounds: ForegroundBounds
  ) => number | null;
  expandCropBox: (crop: CropBox, widthMultiplier: number, heightMultiplier: number, offsetY?: number) => CropBox;
  boundsFromCropBox: (crop: CropBox, coverage?: number) => ForegroundBounds;
};

export async function collectCharacterPipelinePackQcChecks(input: {
  manifest: GeneratedCharacterManifest;
  cropBoxes: CharacterCropBoxes;
  referenceFrontRaster: LoadedImageRaster | null;
  rasterMap: Map<string, LoadedImageRaster>;
  mouthCrop: CropBox;
  strictGeneratedChecks: boolean;
  requiredVisemes: readonly GeneratedCharacterViseme[];
  animationQc: AnimationQcThresholds;
  constants: PackQcConstants;
  deps: PackQcDeps;
}): Promise<CharacterPipelineQcCheck[]> {
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

  if (!input.manifest.pack?.pack_path || !fs.existsSync(input.manifest.pack.pack_path)) {
    pushCheck("PACK_ANCHOR_MANIFEST", false, "CharacterPack not built yet.", "ERROR");
    pushCheck("PACK_ANCHOR_MISSING_FRONT", false, "CharacterPack not built yet.", "ERROR");
    pushCheck("PACK_ANCHOR_MISSING_THREEQUARTER", false, "CharacterPack not built yet.", "ERROR");
    pushCheck("PACK_ANCHOR_MISSING_PROFILE", false, "CharacterPack not built yet.", "ERROR");
    pushCheck("PACK_SCHEMA", false, "CharacterPack not built yet.", "ERROR");
    pushCheck("PACK_REQUIRED_SLOTS", false, "CharacterPack not built yet.", "ERROR");
    pushCheck("PACK_REQUIRED_VISEMES", false, "CharacterPack not built yet.", "ERROR");
    pushCheck("PACK_FACE_EYE_OPEN_CONTENT", false, "CharacterPack not built yet.", "ERROR");
    pushCheck("PACK_FACE_MOUTH_CLOSED_CONTENT", false, "CharacterPack not built yet.", "ERROR");
    return checks;
  }

  const pack = input.deps.readJson<unknown>(input.manifest.pack.pack_path);
  const packRecord = input.deps.asRecord(pack);
  const packAnchorManifest = input.deps.coerceCharacterPackAnchorManifest(packRecord?.anchors);
  const validation = input.deps.validatePackSchema(pack);

  pushCheck(
    "PACK_ANCHOR_MANIFEST",
    Boolean(packAnchorManifest),
    packAnchorManifest ? "CharacterPack includes a normalized anchor manifest." : "CharacterPack is missing anchors.views data.",
    packAnchorManifest ? "INFO" : "ERROR",
    { asset_paths: [input.manifest.pack.pack_path] }
  );
  pushCheck(
    "PACK_SCHEMA",
    validation.ok,
    validation.ok ? "CharacterPack schema valid." : "CharacterPack schema validation failed.",
    validation.ok ? "INFO" : "ERROR",
    { asset_paths: [input.manifest.pack.pack_path] }
  );

  if (!validation.ok) {
    return checks;
  }

  const slots = Array.isArray(packRecord?.slots) ? packRecord.slots : [];
  const slotIds = new Set(
    slots
      .map((entry) => (input.deps.asRecord(entry) ? String(input.deps.asRecord(entry)!.slot_id ?? "").trim() : ""))
      .filter((value) => value.length > 0)
  );
  const missingSlots = ["torso", "head", "upper_arm", "lower_arm", "paw", "tail", "eye_far", "eye_near", "mouth"].filter(
    (slotId) => !slotIds.has(slotId)
  );
  pushCheck(
    "PACK_REQUIRED_SLOTS",
    missingSlots.length === 0,
    missingSlots.length === 0 ? "CharacterPack includes all deterministic rig slots." : `CharacterPack is missing slots: ${missingSlots.join(", ")}`,
    missingSlots.length === 0 ? "INFO" : "ERROR",
    { asset_paths: [input.manifest.pack.pack_path] }
  );

  const visemeRecord = input.deps.asRecord(packRecord?.visemes);
  const missingPackVisemes = input.requiredVisemes.filter((viseme) => !visemeRecord || !input.deps.asRecord(visemeRecord[viseme]));
  pushCheck(
    "PACK_REQUIRED_VISEMES",
    missingPackVisemes.length === 0,
    missingPackVisemes.length === 0
      ? "CharacterPack includes required viseme mappings."
      : `CharacterPack is missing viseme mappings: ${missingPackVisemes.join(", ")}`,
    missingPackVisemes.length === 0 ? "INFO" : "ERROR",
    { asset_paths: [input.manifest.pack.pack_path] }
  );

  if (packAnchorManifest) {
    const packAnchorSpeciesId = input.deps.resolveSpeciesId(input.manifest);
    const packAnchorHeuristics = input.deps.resolveAnchorHeuristics(packAnchorSpeciesId);
    for (const view of input.constants.characterPackAnchorViews) {
      const viewManifest = packAnchorManifest.views?.[view];
      const missingAnchors = input.constants.characterPackAnchorIds.filter((anchorId) => {
        const entry = viewManifest?.[anchorId];
        return !entry || entry.status === "missing";
      });
      const viewConfidence =
        packAnchorManifest.confidence_summary?.by_view?.[view] ??
        input.deps.averageNumbers(
          input.constants.characterPackAnchorIds.flatMap((anchorId) => {
            const confidence = viewManifest?.[anchorId]?.confidence;
            return typeof confidence === "number" ? [confidence] : [];
          })
        ) ??
        0;
      const lowConfidenceAnchors = input.constants.characterPackAnchorIds.filter((anchorId) => {
        const confidence = viewManifest?.[anchorId]?.confidence;
        const status = viewManifest?.[anchorId]?.status;
        return status !== "missing" && status !== "not_applicable" && typeof confidence === "number" && confidence < input.constants.minPackAnchorConfidence;
      });
      const missingPassed = missingAnchors.length === 0;
      const confidencePassed = viewConfidence >= input.constants.minPackAnchorViewConfidence && lowConfidenceAnchors.length === 0;
      pushCheck(
        `PACK_ANCHOR_MISSING_${view.toUpperCase()}`,
        input.strictGeneratedChecks ? missingPassed : true,
        input.strictGeneratedChecks
          ? missingPassed
            ? `${view} anchor manifest covers all expected anchors.`
            : `${view} anchor manifest is missing: ${missingAnchors.join(", ")}.`
          : `Synthetic smoke fixture: ${view} anchor coverage check skipped.`,
        input.strictGeneratedChecks ? (missingPassed ? "INFO" : "ERROR") : "INFO",
        {
          asset_paths: [input.manifest.pack.pack_path],
          metric: missingAnchors.length,
          threshold: 0
        }
      );
      pushCheck(
        `PACK_ANCHOR_CONFIDENCE_${view.toUpperCase()}`,
        input.strictGeneratedChecks ? confidencePassed : true,
        input.strictGeneratedChecks
          ? confidencePassed
            ? `${view} anchor confidence stays above the review threshold.`
            : `${view} anchor confidence is low (mean=${viewConfidence.toFixed(2)}; low=${lowConfidenceAnchors.join(", ") || "n/a"}).`
          : `Synthetic smoke fixture: ${view} anchor confidence check skipped.`,
        input.strictGeneratedChecks ? (confidencePassed ? "INFO" : "WARN") : "INFO",
        {
          asset_paths: [input.manifest.pack.pack_path],
          metric: Number(viewConfidence.toFixed(3)),
          threshold: input.constants.minPackAnchorViewConfidence
        }
      );
    }

    for (const view of ["threeQuarter", "profile"] as const) {
      const asset = input.manifest.views[view];
      const raster = asset ? input.rasterMap.get(asset.asset_id) ?? null : null;
      const viewAnchors = packAnchorManifest.views?.[view];
      if (!asset || !raster || !viewAnchors) {
        continue;
      }

      const qcPolicy = packAnchorHeuristics.byView[view].qc;
      const headBoundsForQc =
        input.deps.measureForegroundBounds(raster, input.cropBoxes.head[view]) ??
        input.deps.measureForegroundBounds(raster) ??
        input.deps.boundsFromCropBox(input.cropBoxes.head[view], 0);
      const headCenter = viewAnchors.head_center;
      const mouthCenter = viewAnchors.mouth_center;
      const facingSign =
        typeof headCenter?.x === "number" && typeof mouthCenter?.x === "number"
          ? mouthCenter.x >= headCenter.x
            ? 1
            : -1
          : 1;

      if (qcPolicy.muzzleProjection) {
        const muzzleProjection = input.deps.normalizedHorizontalDelta(headCenter, mouthCenter, headBoundsForQc, facingSign);
        const passed =
          typeof muzzleProjection === "number" &&
          muzzleProjection >= qcPolicy.muzzleProjection.min &&
          muzzleProjection <= qcPolicy.muzzleProjection.max;
        pushCheck(
          `PACK_MUZZLE_PROJECTION_${view.toUpperCase()}`,
          input.strictGeneratedChecks ? passed : true,
          input.strictGeneratedChecks
            ? passed
              ? `${packAnchorSpeciesId} ${view} muzzle projection stays inside the species-aware window.`
              : `Expected ${packAnchorSpeciesId} ${view} muzzle projection inside ${qcPolicy.muzzleProjection.min.toFixed(2)}-${qcPolicy.muzzleProjection.max.toFixed(2)}, got ${typeof muzzleProjection === "number" ? muzzleProjection.toFixed(3) : "n/a"}.`
            : `Synthetic smoke fixture: ${view} muzzle projection check skipped.`,
          input.strictGeneratedChecks ? (passed ? "INFO" : "WARN") : "INFO",
          {
            asset_paths: [asset.file_path],
            metric: Number((muzzleProjection ?? 0).toFixed(3)),
            threshold: qcPolicy.muzzleProjection.max
          }
        );
      }

      if (qcPolicy.earHeight) {
        const earHeight = input.deps.normalizedEarHeight(headCenter, viewAnchors.ear_near, headBoundsForQc);
        const passed =
          typeof earHeight === "number" &&
          earHeight >= qcPolicy.earHeight.min &&
          earHeight <= qcPolicy.earHeight.max;
        pushCheck(
          `PACK_EAR_GEOMETRY_${view.toUpperCase()}`,
          input.strictGeneratedChecks ? passed : true,
          input.strictGeneratedChecks
            ? passed
              ? `${packAnchorSpeciesId} ${view} ear height stays inside the species-aware window.`
              : `Expected ${packAnchorSpeciesId} ${view} ear height inside ${qcPolicy.earHeight.min.toFixed(2)}-${qcPolicy.earHeight.max.toFixed(2)}, got ${typeof earHeight === "number" ? earHeight.toFixed(3) : "n/a"}.`
            : `Synthetic smoke fixture: ${view} ear geometry check skipped.`,
          input.strictGeneratedChecks ? (passed ? "INFO" : "WARN") : "INFO",
          {
            asset_paths: [asset.file_path],
            metric: Number((earHeight ?? 0).toFixed(3)),
            threshold: qcPolicy.earHeight.max
          }
        );
      }

      const expectedEyeFar = packAnchorHeuristics.byView[view].expectedVisibility.eyeFar;
      const expectedEarFar = packAnchorHeuristics.byView[view].expectedVisibility.earFar;
      const eyeFarMatches = input.deps.anchorStatusMatchesExpectation(viewAnchors.eye_far?.status, expectedEyeFar);
      const earFarMatches = input.deps.anchorStatusMatchesExpectation(viewAnchors.ear_far?.status, expectedEarFar);
      pushCheck(
        `PACK_EYE_OCCLUSION_POLICY_${view.toUpperCase()}`,
        input.strictGeneratedChecks ? eyeFarMatches : true,
        input.strictGeneratedChecks
          ? eyeFarMatches
            ? `${packAnchorSpeciesId} ${view} far-eye visibility follows the species-aware occlusion policy.`
            : `Expected ${packAnchorSpeciesId} ${view} far eye to read as ${expectedEyeFar}, got ${viewAnchors.eye_far?.status ?? "missing"}.`
          : `Synthetic smoke fixture: ${view} far-eye occlusion policy check skipped.`,
        input.strictGeneratedChecks ? (eyeFarMatches ? "INFO" : "WARN") : "INFO",
        { asset_paths: [asset.file_path] }
      );
      pushCheck(
        `PACK_EAR_OCCLUSION_POLICY_${view.toUpperCase()}`,
        input.strictGeneratedChecks ? earFarMatches : true,
        input.strictGeneratedChecks
          ? earFarMatches
            ? `${packAnchorSpeciesId} ${view} far-ear visibility follows the species-aware occlusion policy.`
            : `Expected ${packAnchorSpeciesId} ${view} far ear to read as ${expectedEarFar}, got ${viewAnchors.ear_far?.status ?? "missing"}.`
          : `Synthetic smoke fixture: ${view} far-ear occlusion policy check skipped.`,
        input.strictGeneratedChecks ? (earFarMatches ? "INFO" : "WARN") : "INFO",
        { asset_paths: [asset.file_path] }
      );

      if (qcPolicy.requirePawReadable) {
        const pawReadable =
          viewAnchors.paw_anchor?.status === "present" &&
          typeof viewAnchors.paw_anchor?.confidence === "number" &&
          viewAnchors.paw_anchor.confidence >= input.constants.minPackAnchorConfidence;
        pushCheck(
          `PACK_PAW_READABILITY_${view.toUpperCase()}`,
          input.strictGeneratedChecks ? pawReadable : true,
          input.strictGeneratedChecks
            ? pawReadable
              ? `${packAnchorSpeciesId} ${view} keeps the near paw readable.`
              : `${packAnchorSpeciesId} ${view} near paw is not readable enough for the current repair policy.`
            : `Synthetic smoke fixture: ${view} paw readability check skipped.`,
          input.strictGeneratedChecks ? (pawReadable ? "INFO" : "WARN") : "INFO",
          {
            asset_paths: [asset.file_path],
            metric: Number((viewAnchors.paw_anchor?.confidence ?? 0).toFixed(3)),
            threshold: input.constants.minPackAnchorConfidence
          }
        );
      }

      if (qcPolicy.requireTailVisible) {
        const tailVisible =
          viewAnchors.tail_root?.status === "present" &&
          typeof viewAnchors.tail_root?.confidence === "number" &&
          viewAnchors.tail_root.confidence >= input.constants.minPackAnchorConfidence - 0.08;
        pushCheck(
          `PACK_TAIL_VISIBILITY_${view.toUpperCase()}`,
          input.strictGeneratedChecks ? tailVisible : true,
          input.strictGeneratedChecks
            ? tailVisible
              ? `${packAnchorSpeciesId} ${view} keeps the tail root visible enough for the species silhouette.`
              : `${packAnchorSpeciesId} ${view} tail root is too weak for the expected species silhouette.`
            : `Synthetic smoke fixture: ${view} tail visibility check skipped.`,
          input.strictGeneratedChecks ? (tailVisible ? "INFO" : "WARN") : "INFO",
          {
            asset_paths: [asset.file_path],
            metric: Number((viewAnchors.tail_root?.confidence ?? 0).toFixed(3)),
            threshold: input.constants.minPackAnchorConfidence - 0.08
          }
        );
      }
    }

    const overallAnchorConfidence = packAnchorManifest.confidence_summary?.overall ?? 0;
    pushCheck(
      "PACK_ANCHOR_CONFIDENCE_OVERALL",
      input.strictGeneratedChecks ? overallAnchorConfidence >= input.constants.minPackAnchorOverallConfidence : true,
      input.strictGeneratedChecks
        ? overallAnchorConfidence >= input.constants.minPackAnchorOverallConfidence
          ? "Overall anchor confidence is within the automatic-accept range."
          : `Overall anchor confidence is low (${overallAnchorConfidence.toFixed(2)}).`
        : "Synthetic smoke fixture: overall anchor confidence check skipped.",
      input.strictGeneratedChecks
        ? overallAnchorConfidence >= input.constants.minPackAnchorOverallConfidence
          ? "INFO"
          : "WARN"
        : "INFO",
      {
        asset_paths: [input.manifest.pack.pack_path],
        metric: Number(overallAnchorConfidence.toFixed(3)),
        threshold: input.constants.minPackAnchorOverallConfidence
      }
    );

    const frontPackMouth = packAnchorManifest.views?.front?.mouth_center;
    if (frontPackMouth && typeof frontPackMouth.x === "number" && typeof frontPackMouth.y === "number") {
      const frontPackMouthX = frontPackMouth.x;
      const frontPackMouthY = frontPackMouth.y;
      const mouthAnchorSearch = input.deps.expandCropBox(
        { cx: frontPackMouthX, cy: frontPackMouthY, w: input.mouthCrop.w, h: input.mouthCrop.h },
        1.14,
        1.22
      );
      const drifts = input.requiredVisemes.flatMap((viseme) => {
        const asset = input.manifest.visemes.front?.[viseme];
        const raster = asset ? input.rasterMap.get(asset.asset_id) ?? null : null;
        if (!asset || !raster) {
          return [];
        }
        const center = input.deps.measureDarkFeatureCenter(raster, mouthAnchorSearch);
        if (!center) {
          return [];
        }
        return [Math.hypot(center.x - frontPackMouthX, center.y - frontPackMouthY)];
      });
      const maxDrift = drifts.length > 0 ? Math.max(...drifts) : Number.POSITIVE_INFINITY;
      const mouthStable = drifts.length > 0 && maxDrift <= input.animationQc.maxMouthAnchorDrift;
      pushCheck(
        "PACK_MOUTH_ANCHOR_INSTABILITY",
        input.strictGeneratedChecks ? mouthStable : true,
        input.strictGeneratedChecks
          ? mouthStable
            ? "Pack mouth anchor stays stable across viseme renders."
            : drifts.length === 0
              ? "Could not measure mouth anchor stability from pack visemes."
              : `Pack mouth anchor drifts too much across visemes (max=${maxDrift.toFixed(3)}).`
          : "Synthetic smoke fixture: pack mouth anchor stability check skipped.",
        input.strictGeneratedChecks ? (mouthStable ? "INFO" : "ERROR") : "INFO",
        {
          asset_paths: [input.manifest.pack.pack_path],
          metric: Number((Number.isFinite(maxDrift) ? maxDrift : 0).toFixed(3)),
          threshold: input.animationQc.maxMouthAnchorDrift
        }
      );
    } else {
      pushCheck(
        "PACK_MOUTH_ANCHOR_INSTABILITY",
        input.strictGeneratedChecks ? false : true,
        input.strictGeneratedChecks ? "Front mouth anchor missing from pack manifest." : "Synthetic smoke fixture: pack mouth anchor stability check skipped.",
        input.strictGeneratedChecks ? "ERROR" : "INFO",
        { asset_paths: [input.manifest.pack.pack_path] }
      );
    }

    const frontViewAnchors = packAnchorManifest.views?.front;
    const frontViewBounds = input.referenceFrontRaster ? input.deps.measureForegroundBounds(input.referenceFrontRaster) : null;
    for (const view of ["threeQuarter", "profile"] as const) {
      const asset = input.manifest.views[view];
      const raster = asset ? input.rasterMap.get(asset.asset_id) ?? null : null;
      const sideViewAnchors = packAnchorManifest.views?.[view];
      const sideViewBounds = raster ? input.deps.measureForegroundBounds(raster) : null;
      if (!asset || !raster || !frontViewBounds || !frontViewAnchors || !sideViewAnchors || !sideViewBounds) {
        pushCheck(
          `PACK_LANDMARK_CONSISTENCY_${view.toUpperCase()}`,
          input.strictGeneratedChecks ? false : true,
          input.strictGeneratedChecks
            ? `Could not compare front vs ${view} anchor geometry.`
            : `Synthetic smoke fixture: ${view} landmark consistency check skipped.`,
          input.strictGeneratedChecks ? "WARN" : "INFO",
          {
            asset_paths: asset?.file_path ? [asset.file_path] : input.manifest.pack.pack_path ? [input.manifest.pack.pack_path] : undefined
          }
        );
        continue;
      }

      const verticalAnchorIds = ["head_center", "mouth_center", "paw_anchor", "tail_root"] as const;
      const verticalDrifts = verticalAnchorIds.flatMap((anchorId) => {
        const frontRelative = input.deps.normalizeAnchorWithinBounds(frontViewAnchors[anchorId], frontViewBounds);
        const sideRelative = input.deps.normalizeAnchorWithinBounds(sideViewAnchors[anchorId], sideViewBounds);
        return frontRelative && sideRelative ? [Math.abs(sideRelative.y - frontRelative.y)] : [];
      });
      const frontPaw = input.deps.normalizeAnchorWithinBounds(frontViewAnchors.paw_anchor, frontViewBounds);
      const frontTail = input.deps.normalizeAnchorWithinBounds(frontViewAnchors.tail_root, frontViewBounds);
      const sidePaw = input.deps.normalizeAnchorWithinBounds(sideViewAnchors.paw_anchor, sideViewBounds);
      const sideTail = input.deps.normalizeAnchorWithinBounds(sideViewAnchors.tail_root, sideViewBounds);
      const spanDelta =
        frontPaw && frontTail && sidePaw && sideTail
          ? Math.abs(Math.abs(sidePaw.x - sideTail.x) - Math.abs(frontPaw.x - frontTail.x))
          : Number.POSITIVE_INFINITY;
      const maxVerticalDelta = verticalDrifts.length > 0 ? Math.max(...verticalDrifts) : Number.POSITIVE_INFINITY;
      const horizontalThreshold =
        view === "profile"
          ? input.constants.maxViewLandmarkHorizontalDelta * 1.25
          : input.constants.maxViewLandmarkHorizontalDelta;
      const consistencyPassed =
        verticalDrifts.length >= 3 &&
        maxVerticalDelta <= input.constants.maxViewLandmarkVerticalDelta &&
        spanDelta <= horizontalThreshold;
      pushCheck(
        `PACK_LANDMARK_CONSISTENCY_${view.toUpperCase()}`,
        input.strictGeneratedChecks ? consistencyPassed : true,
        input.strictGeneratedChecks
          ? consistencyPassed
            ? `${view} landmarks stay structurally consistent with the front anchor layout.`
            : `${view} landmark geometry drifts from front anchors (vertical=${maxVerticalDelta.toFixed(3)}, span=${spanDelta.toFixed(3)}).`
          : `Synthetic smoke fixture: ${view} landmark consistency check skipped.`,
        input.strictGeneratedChecks ? (consistencyPassed ? "INFO" : "WARN") : "INFO",
        {
          asset_paths: [asset.file_path],
          metric: Number((Number.isFinite(maxVerticalDelta) ? maxVerticalDelta : 0).toFixed(3)),
          threshold: input.constants.maxViewLandmarkVerticalDelta
        }
      );
    }
  }

  const imagesRecord = input.deps.asRecord(input.deps.asRecord(packRecord?.assets)?.images);
  const eyeOpenPath = input.deps.resolvePackImageFilePath(imagesRecord?.eye_open);
  const mouthClosedPath = input.deps.resolvePackImageFilePath(imagesRecord?.mouth_closed);

  if (eyeOpenPath && fs.existsSync(eyeOpenPath)) {
    const eyeOpenRaster = await input.deps.loadImageRaster(eyeOpenPath);
    const eyeContentPassed = input.deps.detectInteriorDarkComponents(eyeOpenRaster, input.constants.fullImageCrop).length > 0;
    pushCheck(
      "PACK_FACE_EYE_OPEN_CONTENT",
      input.strictGeneratedChecks ? eyeContentPassed : true,
      input.strictGeneratedChecks
        ? eyeContentPassed
          ? "Packed eye_open slot contains an isolated eye feature."
          : "Packed eye_open slot looks empty or clipped to outline fragments."
        : "Synthetic smoke fixture: pack eye slot content check skipped.",
      input.strictGeneratedChecks ? "ERROR" : "INFO",
      { asset_paths: [eyeOpenPath] }
    );
  } else {
    pushCheck(
      "PACK_FACE_EYE_OPEN_CONTENT",
      input.strictGeneratedChecks ? false : true,
      input.strictGeneratedChecks ? "Packed eye_open asset path is missing." : "Synthetic smoke fixture: pack eye slot content check skipped.",
      input.strictGeneratedChecks ? "ERROR" : "INFO",
      { asset_paths: input.manifest.pack.pack_path ? [input.manifest.pack.pack_path] : undefined }
    );
  }

  if (mouthClosedPath && fs.existsSync(mouthClosedPath)) {
    const mouthClosedRaster = await input.deps.loadImageRaster(mouthClosedPath);
    const mouthContentPassed = input.deps.detectInteriorDarkComponents(mouthClosedRaster, input.constants.fullImageCrop).length > 0;
    pushCheck(
      "PACK_FACE_MOUTH_CLOSED_CONTENT",
      input.strictGeneratedChecks ? mouthContentPassed : true,
      input.strictGeneratedChecks
        ? mouthContentPassed
          ? "Packed mouth_closed slot contains an isolated mouth feature."
          : "Packed mouth_closed slot looks empty or cropped away."
        : "Synthetic smoke fixture: pack mouth slot content check skipped.",
      input.strictGeneratedChecks ? "ERROR" : "INFO",
      { asset_paths: [mouthClosedPath] }
    );
  } else {
    pushCheck(
      "PACK_FACE_MOUTH_CLOSED_CONTENT",
      input.strictGeneratedChecks ? false : true,
      input.strictGeneratedChecks ? "Packed mouth_closed asset path is missing." : "Synthetic smoke fixture: pack mouth slot content check skipped.",
      input.strictGeneratedChecks ? "ERROR" : "INFO",
      { asset_paths: input.manifest.pack.pack_path ? [input.manifest.pack.pack_path] : undefined }
    );
  }

  return checks;
}
