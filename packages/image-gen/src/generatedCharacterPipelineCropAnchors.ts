import fs from "node:fs";
import path from "node:path";
import type {
  CharacterCropBoxes,
  CharacterPackAnchor,
  CharacterPackAnchorId,
  CharacterPackAnchorManifest,
  CharacterPackAnchorStatus,
  CharacterPackAnchorView,
  CharacterPackAnchorViewManifest,
  CharacterPackAnchorViewSummary,
  CropBox,
  DarkFeatureComponent,
  ForegroundBounds,
  GeneratedCharacterManifest,
  GeneratedCharacterView,
  LoadedImageRaster
} from "./generatedCharacterPipeline";
import type {
  MascotAnchorExpectation,
  MascotSpeciesAnchorExtractorViewProfile
} from "./species";
import type { MascotSpeciesId } from "./types";

type JsonRecord = Record<string, unknown>;

type CropAnchorDeps = {
  characterRootDir: (characterId: string) => string;
  readJson: <T>(filePath: string) => T;
  roundNumber: (value: number, digits?: number) => number;
  clamp: (value: number, min: number, max: number) => number;
  averageNumbers: (values: number[]) => number | null;
  joinNotes: (notes: Array<string | undefined>) => string | undefined;
  asRecord: (value: unknown) => JsonRecord | null;
  asString: (value: unknown) => string;
  asNumber: (value: unknown) => number | undefined;
  normalizeCropBox: (crop: CropBox) => CropBox;
  loadManifest: (characterId: string) => GeneratedCharacterManifest;
  resolveManifestSpeciesId: (manifest: GeneratedCharacterManifest, fallbackSpeciesId?: MascotSpeciesId) => MascotSpeciesId;
  resolveMascotSpeciesProfile: (speciesId?: MascotSpeciesId) => { label: string };
  resolveMascotAnchorHeuristics: (speciesId: MascotSpeciesId) => {
    byView: Record<GeneratedCharacterView, MascotSpeciesAnchorExtractorViewProfile>;
  };
  loadImageRaster: (filePath: string) => Promise<LoadedImageRaster>;
  measureForegroundBounds: (image: LoadedImageRaster, crop?: CropBox) => ForegroundBounds | null;
  deriveTorsoCropFromBodyBounds: (bounds: ForegroundBounds, view: GeneratedCharacterView) => CropBox;
  deriveHeadCropFromBodyBounds: (bounds: ForegroundBounds, view: GeneratedCharacterView) => CropBox;
  detectFrontFaceFeatureCrops: (
    image: LoadedImageRaster,
    headCrop: CropBox
  ) => {
    leftEye?: CropBox;
    rightEye?: CropBox;
    mouth?: CropBox;
    components: DarkFeatureComponent[];
  };
  boundsFromCropBox: (crop: CropBox, coverage?: number) => ForegroundBounds;
  cropBoxWithinCrop: (parentCrop: CropBox, relativeCrop: CropBox) => CropBox;
  cropBoxWithinBounds: (bounds: ForegroundBounds, relativeCrop: CropBox) => CropBox;
  detectInteriorDarkComponents: (image: LoadedImageRaster, crop: CropBox) => DarkFeatureComponent[];
  measureDarkFeatureCenter: (
    image: LoadedImageRaster,
    crop: CropBox
  ) => { x: number; y: number; density: number } | null;
  measureTopForegroundAnchor: (
    image: LoadedImageRaster,
    crop: CropBox
  ) => { x: number; y: number; density: number } | null;
  pickBestDarkComponentForSearch: (
    candidates: DarkFeatureComponent[],
    searchCrop: CropBox,
    options?: {
      verticalWeight?: number;
      widthMultiplier?: number;
      heightMultiplier?: number;
    }
  ) => DarkFeatureComponent | undefined;
  componentToCropBox: (component: DarkFeatureComponent, padX: number, padY: number) => CropBox;
  componentDetectionConfidence: (component: DarkFeatureComponent, searchCrop: CropBox) => number;
  boundsDetectionConfidence: (bounds: ForegroundBounds, searchCrop: CropBox) => number;
  constants: {
    defaultCropBoxes: CharacterCropBoxes;
    fullImageCrop: CropBox;
    minPackAnchorConfidence: number;
    minFrontEyeDensity: number;
    maxFrontEyeDensity: number;
    minFrontMouthDensity: number;
    maxFrontMouthDensity: number;
    characterPackAnchorViews: readonly CharacterPackAnchorView[];
    characterPackAnchorIds: readonly CharacterPackAnchorId[];
  };
};

function buildAnchorEntry(
  input: {
    x?: number;
    y?: number;
    confidence?: number;
    status: CharacterPackAnchorStatus;
    notes?: string;
  },
  deps: CropAnchorDeps
): CharacterPackAnchor {
  const entry: CharacterPackAnchor = {
    status: input.status,
    ...(typeof input.confidence === "number" ? { confidence: deps.roundNumber(deps.clamp(input.confidence, 0, 1), 3) } : {}),
    ...(input.notes ? { notes: input.notes } : {})
  };
  if (typeof input.x === "number" && typeof input.y === "number") {
    entry.x = deps.roundNumber(deps.clamp(input.x, 0, 1), 4);
    entry.y = deps.roundNumber(deps.clamp(input.y, 0, 1), 4);
  }
  return entry;
}

function anchorLabel(
  view: CharacterPackAnchorView,
  anchorId: CharacterPackAnchorId,
  confidence?: number,
  status?: CharacterPackAnchorStatus
): string {
  const suffix: string[] = [];
  if (typeof confidence === "number") {
    suffix.push(confidence.toFixed(2));
  }
  if (status && status !== "present") {
    suffix.push(status);
  }
  return suffix.length > 0 ? `${view}.${anchorId} (${suffix.join(", ")})` : `${view}.${anchorId}`;
}

function finalizeCharacterPackAnchorManifest(
  views: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>>,
  deps: CropAnchorDeps,
  notes?: string[]
): CharacterPackAnchorManifest {
  const normalizedViews: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>> = {};
  const summaryByView: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewSummary>> = {};
  const coveredViews: CharacterPackAnchorView[] = [];
  const missingViews: CharacterPackAnchorView[] = [];
  const confidenceByView: Partial<Record<CharacterPackAnchorView, number>> = {};
  const confidenceValues: number[] = [];

  for (const view of deps.constants.characterPackAnchorViews) {
    const sourceView = views[view] ?? {};
    const normalizedView: CharacterPackAnchorViewManifest = {};
    const presentAnchorIds: CharacterPackAnchorId[] = [];
    const missingAnchorIds: CharacterPackAnchorId[] = [];
    const occludedAnchorIds: CharacterPackAnchorId[] = [];
    const viewConfidences: number[] = [];

    for (const anchorId of deps.constants.characterPackAnchorIds) {
      const entry = sourceView[anchorId] ?? buildAnchorEntry({ status: "missing", confidence: 0, notes: "anchor not derived" }, deps);
      normalizedView[anchorId] = entry;
      if (entry.status === "present") {
        presentAnchorIds.push(anchorId);
      } else if (entry.status === "missing") {
        missingAnchorIds.push(anchorId);
      } else if (entry.status === "occluded") {
        occludedAnchorIds.push(anchorId);
      }
      if (typeof entry.confidence === "number") {
        viewConfidences.push(entry.confidence);
        confidenceValues.push(entry.confidence);
      }
    }

    const viewConfidence = deps.averageNumbers(viewConfidences);
    if (viewConfidence !== null) {
      confidenceByView[view] = deps.roundNumber(viewConfidence, 3);
    }
    if (presentAnchorIds.length > 0 || occludedAnchorIds.length > 0) {
      coveredViews.push(view);
    } else {
      missingViews.push(view);
    }
    normalizedViews[view] = normalizedView;
    summaryByView[view] = {
      present_anchor_ids: presentAnchorIds,
      missing_anchor_ids: missingAnchorIds,
      notes: deps.joinNotes([
        occludedAnchorIds.length > 0 ? `occluded anchors: ${occludedAnchorIds.join(", ")}` : undefined,
        viewConfidence !== null ? `mean confidence=${viewConfidence.toFixed(2)}` : undefined
      ])
    };
  }

  const manifestNotes = [
    "Coordinates are normalized to source view rasters",
    "Occluded anchors can carry inferred coordinates",
    ...(notes ?? [])
  ];
  const overallConfidence = deps.averageNumbers(confidenceValues);
  return {
    views: normalizedViews,
    summary: {
      covered_views: coveredViews,
      missing_views: missingViews,
      by_view: summaryByView,
      notes: deps.joinNotes(manifestNotes)
    },
    confidence_summary: {
      ...(overallConfidence !== null ? { overall: deps.roundNumber(overallConfidence, 3) } : {}),
      by_view: confidenceByView,
      notes: deps.joinNotes(manifestNotes)
    }
  };
}

function applyAnchorOverrideEntry(baseEntry: CharacterPackAnchor, overrideEntry: JsonRecord, deps: CropAnchorDeps): CharacterPackAnchor {
  const status = deps.asString(overrideEntry.status).trim();
  return buildAnchorEntry(
    {
      x: deps.asNumber(overrideEntry.x) ?? baseEntry.x,
      y: deps.asNumber(overrideEntry.y) ?? baseEntry.y,
      confidence: deps.asNumber(overrideEntry.confidence) ?? baseEntry.confidence,
      status:
        status === "present" || status === "occluded" || status === "missing" || status === "not_applicable"
          ? status
          : (baseEntry.status ?? "missing"),
      notes: deps.asString(overrideEntry.notes).trim() || baseEntry.notes
    },
    deps
  );
}

function directionalAnchorX(
  view: GeneratedCharacterView,
  facingSign: number,
  input: {
    defaultPositiveX: number;
    defaultNegativeX: number;
    profilePositiveX?: number;
    profileNegativeX?: number;
    biasX?: number;
  },
  deps: CropAnchorDeps
): number {
  const positiveX = view === "profile" ? (input.profilePositiveX ?? input.defaultPositiveX) : input.defaultPositiveX;
  const negativeX = view === "profile" ? (input.profileNegativeX ?? input.defaultNegativeX) : input.defaultNegativeX;
  const biasX = input.biasX ?? 0;
  return deps.clamp((facingSign >= 0 ? positiveX : negativeX) + (facingSign >= 0 ? biasX : -biasX), 0.08, 0.92);
}

function applyConfidenceBoost(baseConfidence: number, boost: number | undefined, deps: CropAnchorDeps, floor = 0.12, ceiling = 0.98): number {
  return deps.clamp(baseConfidence + (boost ?? 0), floor, ceiling);
}

function buildFallbackAnchorByExpectation(
  input: {
    x: number;
    y: number;
    confidence: number;
    expectation: MascotAnchorExpectation;
    notes: string;
  },
  deps: CropAnchorDeps
): CharacterPackAnchor {
  if (input.expectation === "not_applicable") {
    return buildAnchorEntry({ confidence: input.confidence, status: "not_applicable", notes: input.notes }, deps);
  }
  return buildAnchorEntry(
    {
      x: input.x,
      y: input.y,
      confidence: input.confidence,
      status: input.expectation,
      notes: input.notes
    },
    deps
  );
}

export async function deriveAutoCropBoxesWithDeps(
  manifest: GeneratedCharacterManifest,
  deps: CropAnchorDeps
): Promise<CharacterCropBoxes> {
  const cropBoxes: CharacterCropBoxes = {
    torso: {
      front: { ...deps.constants.defaultCropBoxes.torso.front },
      threeQuarter: { ...deps.constants.defaultCropBoxes.torso.threeQuarter },
      profile: { ...deps.constants.defaultCropBoxes.torso.profile }
    },
    head: {
      front: { ...deps.constants.defaultCropBoxes.head.front },
      threeQuarter: { ...deps.constants.defaultCropBoxes.head.threeQuarter },
      profile: { ...deps.constants.defaultCropBoxes.head.profile }
    },
    eyes: {
      left: { ...deps.constants.defaultCropBoxes.eyes.left },
      right: { ...deps.constants.defaultCropBoxes.eyes.right }
    },
    mouth: { ...deps.constants.defaultCropBoxes.mouth }
  };

  const viewEntries = await Promise.all(
    (["front", "threeQuarter", "profile"] as const).map(async (view) => {
      const asset = manifest.views[view];
      if (!asset?.file_path || !fs.existsSync(asset.file_path)) {
        return null;
      }
      const raster = await deps.loadImageRaster(asset.file_path);
      const bounds = deps.measureForegroundBounds(raster);
      return bounds ? { view, raster, bounds } : null;
    })
  );

  for (const entry of viewEntries) {
    if (!entry) {
      continue;
    }
    cropBoxes.torso[entry.view] = deps.deriveTorsoCropFromBodyBounds(entry.bounds, entry.view);
    cropBoxes.head[entry.view] = deps.deriveHeadCropFromBodyBounds(entry.bounds, entry.view);
    if (entry.view === "front") {
      const frontFace = deps.detectFrontFaceFeatureCrops(entry.raster, cropBoxes.head.front);
      if (frontFace.leftEye) {
        cropBoxes.eyes.left = frontFace.leftEye;
      }
      if (frontFace.rightEye) {
        cropBoxes.eyes.right = frontFace.rightEye;
      }
      if (frontFace.mouth) {
        cropBoxes.mouth = frontFace.mouth;
      }
    }
  }

  return cropBoxes;
}

export function applyCropBoxOverridesWithDeps(
  characterId: string,
  baseCropBoxes: CharacterCropBoxes,
  deps: CropAnchorDeps
): CharacterCropBoxes {
  const overridesPath = path.join(deps.characterRootDir(characterId), "pack", "overrides", "crop-boxes.json");
  if (!fs.existsSync(overridesPath)) {
    return baseCropBoxes;
  }
  const overrides = deps.readJson<Partial<CharacterCropBoxes>>(overridesPath);
  return {
    torso: {
      front: overrides.torso?.front ?? baseCropBoxes.torso.front,
      threeQuarter: overrides.torso?.threeQuarter ?? baseCropBoxes.torso.threeQuarter,
      profile: overrides.torso?.profile ?? baseCropBoxes.torso.profile
    },
    head: {
      front: overrides.head?.front ?? baseCropBoxes.head.front,
      threeQuarter: overrides.head?.threeQuarter ?? baseCropBoxes.head.threeQuarter,
      profile: overrides.head?.profile ?? baseCropBoxes.head.profile
    },
    eyes: {
      left: overrides.eyes?.left ?? baseCropBoxes.eyes.left,
      right: overrides.eyes?.right ?? baseCropBoxes.eyes.right
    },
    mouth: overrides.mouth ?? baseCropBoxes.mouth
  };
}

export function collectAnchorReviewSummary(
  anchorManifest: CharacterPackAnchorManifest,
  deps: CropAnchorDeps
): {
  missingAnchorIds: string[];
  lowConfidenceAnchorIds: string[];
  overallConfidence?: number;
} {
  const missingAnchorIds: string[] = [];
  const lowConfidenceAnchorIds: string[] = [];
  for (const view of deps.constants.characterPackAnchorViews) {
    const viewManifest = anchorManifest.views?.[view];
    for (const anchorId of deps.constants.characterPackAnchorIds) {
      const entry = viewManifest?.[anchorId];
      if (!entry || entry.status === "missing") {
        missingAnchorIds.push(anchorLabel(view, anchorId));
        continue;
      }
      if (
        entry.status !== "not_applicable" &&
        typeof entry.confidence === "number" &&
        entry.confidence < deps.constants.minPackAnchorConfidence
      ) {
        lowConfidenceAnchorIds.push(anchorLabel(view, anchorId, entry.confidence, entry.status));
      }
    }
  }
  return {
    missingAnchorIds,
    lowConfidenceAnchorIds,
    ...(typeof anchorManifest.confidence_summary?.overall === "number"
      ? { overallConfidence: anchorManifest.confidence_summary.overall }
      : {})
  };
}

export function applyAnchorOverridesWithDeps(
  characterId: string,
  baseAnchorManifest: CharacterPackAnchorManifest,
  deps: CropAnchorDeps
): CharacterPackAnchorManifest {
  const overridesPath = path.join(deps.characterRootDir(characterId), "pack", "overrides", "anchors.json");
  if (!fs.existsSync(overridesPath)) {
    return baseAnchorManifest;
  }
  const rawOverrides = deps.readJson<unknown>(overridesPath);
  const overrideRoot = deps.asRecord(rawOverrides);
  const overrideViews = deps.asRecord(overrideRoot?.views) ?? overrideRoot;
  const mergedViews: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>> = {};
  for (const view of deps.constants.characterPackAnchorViews) {
    const baseView = { ...(baseAnchorManifest.views?.[view] ?? {}) };
    const overrideView = deps.asRecord(overrideViews?.[view]);
    if (overrideView) {
      for (const anchorId of deps.constants.characterPackAnchorIds) {
        const overrideEntry = deps.asRecord(overrideView[anchorId]);
        if (!overrideEntry) {
          continue;
        }
        baseView[anchorId] = applyAnchorOverrideEntry(
          baseView[anchorId] ?? buildAnchorEntry({ status: "missing", confidence: 0 }, deps),
          overrideEntry,
          deps
        );
      }
    }
    mergedViews[view] = baseView;
  }
  return finalizeCharacterPackAnchorManifest(mergedViews, deps, ["anchors.json override applied"]);
}

export function anchorStatusMatchesExpectation(
  actualStatus: CharacterPackAnchorStatus | undefined,
  expectation: MascotAnchorExpectation
): boolean {
  const actual = actualStatus ?? "missing";
  if (expectation === "present") {
    return actual === "present";
  }
  if (expectation === "occluded") {
    return actual === "occluded" || actual === "present";
  }
  return actual === "not_applicable" || actual === "occluded";
}

export function normalizedHorizontalDelta(
  head: CharacterPackAnchor | undefined,
  anchor: CharacterPackAnchor | undefined,
  bounds: ForegroundBounds,
  facingSign: number,
  deps: CropAnchorDeps
): number | null {
  if (typeof head?.x !== "number" || typeof anchor?.x !== "number") {
    return null;
  }
  return deps.clamp(((anchor.x - head.x) * facingSign) / Math.max(bounds.width, 0.0001), 0, 1);
}

export function normalizedEarHeight(
  head: CharacterPackAnchor | undefined,
  ear: CharacterPackAnchor | undefined,
  bounds: ForegroundBounds,
  deps: CropAnchorDeps
): number | null {
  if (typeof head?.y !== "number" || typeof ear?.y !== "number") {
    return null;
  }
  return deps.clamp((head.y - ear.y) / Math.max(bounds.height, 0.0001), 0, 1);
}

export async function deriveAutoAnchorManifestWithDeps(
  manifest: GeneratedCharacterManifest,
  cropBoxes: CharacterCropBoxes,
  deps: CropAnchorDeps
): Promise<CharacterPackAnchorManifest> {
  const views: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>> = {};
  const speciesId = deps.resolveManifestSpeciesId(manifest);
  const speciesProfile = deps.resolveMascotSpeciesProfile(speciesId);
  const speciesAnchorHeuristics = deps.resolveMascotAnchorHeuristics(speciesId);

  for (const view of deps.constants.characterPackAnchorViews) {
    const asset = manifest.views[view];
    if (!asset?.file_path || !fs.existsSync(asset.file_path)) {
      views[view] = Object.fromEntries(
        deps.constants.characterPackAnchorIds.map((anchorId) => [
          anchorId,
          buildAnchorEntry({ status: "missing", confidence: 0, notes: "view asset missing" }, deps)
        ])
      ) as CharacterPackAnchorViewManifest;
      continue;
    }

    const raster = await deps.loadImageRaster(asset.file_path);
    const viewHeuristics = speciesAnchorHeuristics.byView[view];
    const bodyBounds = deps.measureForegroundBounds(raster) ?? deps.boundsFromCropBox(deps.constants.fullImageCrop, 0);
    const torsoCrop = cropBoxes.torso[view];
    const headCrop = cropBoxes.head[view];
    const headSearch = expandCropBox(headCrop, 1.06, 1.1, 0, deps);
    const headBounds = deps.measureForegroundBounds(raster, headSearch) ?? deps.boundsFromCropBox(headCrop, 0);
    const headComponents = deps.detectInteriorDarkComponents(raster, headSearch);

    const provisionalEyeCandidates = headComponents.filter(
      (component) => component.relativeCenterY >= 0.1 && component.relativeCenterY <= 0.52
    );
    const provisionalMouthCandidates = headComponents.filter((component) => component.relativeCenterY >= 0.36);
    const directionSource =
      provisionalMouthCandidates.sort((a, b) => b.centerY - a.centerY || b.pixelCount - a.pixelCount)[0] ??
      provisionalEyeCandidates.sort((a, b) => b.pixelCount - a.pixelCount)[0];
    const facingSign = view === "front" ? 1 : directionSource ? (directionSource.centerX >= headBounds.centerX ? 1 : -1) : 1;
    const nearRelativeX = directionalAnchorX(
      view,
      facingSign,
      {
        defaultPositiveX: 0.64,
        defaultNegativeX: 0.36,
        profilePositiveX: 0.7,
        profileNegativeX: 0.3,
        biasX: viewHeuristics.eyeNearBiasX
      },
      deps
    );
    const farRelativeX = directionalAnchorX(
      view,
      facingSign,
      {
        defaultPositiveX: 0.36,
        defaultNegativeX: 0.64,
        profilePositiveX: 0.3,
        profileNegativeX: 0.7,
        biasX: viewHeuristics.eyeFarBiasX
      },
      deps
    );
    const earNearRelativeX = directionalAnchorX(
      view,
      facingSign,
      {
        defaultPositiveX: 0.8,
        defaultNegativeX: 0.2,
        profilePositiveX: 0.82,
        profileNegativeX: 0.18,
        biasX: viewHeuristics.earNearBiasX
      },
      deps
    );
    const earFarRelativeX = directionalAnchorX(
      view,
      facingSign,
      {
        defaultPositiveX: 0.2,
        defaultNegativeX: 0.8,
        profilePositiveX: 0.18,
        profileNegativeX: 0.82,
        biasX: viewHeuristics.earFarBiasX
      },
      deps
    );

    const frontEyeFarCenter = view === "front" ? deps.measureDarkFeatureCenter(raster, cropBoxes.eyes.left) : null;
    const frontEyeNearCenter = view === "front" ? deps.measureDarkFeatureCenter(raster, cropBoxes.eyes.right) : null;
    const frontMouthCenter = view === "front" ? deps.measureDarkFeatureCenter(raster, cropBoxes.mouth) : null;

    const eyeNearSearch =
      view === "front"
        ? cropBoxes.eyes.right
        : deps.cropBoxWithinCrop(headCrop, {
            cx: nearRelativeX,
            cy: view === "profile" ? 0.38 : 0.36,
            w: view === "profile" ? 0.18 : 0.2,
            h: 0.18
          });
    const eyeFarSearch =
      view === "front"
        ? cropBoxes.eyes.left
        : deps.cropBoxWithinCrop(headCrop, {
            cx: farRelativeX,
            cy: 0.35,
            w: view === "profile" ? 0.14 : 0.18,
            h: 0.18
          });
    const mouthSearch =
      view === "front"
        ? cropBoxes.mouth
        : deps.cropBoxWithinCrop(headCrop, {
            cx: directionalAnchorX(
              view,
              facingSign,
              {
                defaultPositiveX: 0.62,
                defaultNegativeX: 0.38,
                profilePositiveX: 0.68,
                profileNegativeX: 0.32,
                biasX: viewHeuristics.mouthBiasX
              },
              deps
            ),
            cy: 0.72,
            w: (view === "profile" ? 0.24 : 0.28) * viewHeuristics.mouthWidthScale,
            h: 0.18 * viewHeuristics.mouthHeightScale
          });
    const earNearSearch = deps.cropBoxWithinCrop(headCrop, {
      cx: earNearRelativeX,
      cy: deps.clamp((view === "profile" ? 0.14 : 0.18) + viewHeuristics.earBiasY, 0.08, 0.28),
      w: (view === "profile" ? 0.22 : 0.24) * viewHeuristics.earWidthScale,
      h: (view === "profile" ? 0.28 : 0.3) * viewHeuristics.earHeightScale
    });
    const earFarSearch = deps.cropBoxWithinCrop(headCrop, {
      cx: earFarRelativeX,
      cy: deps.clamp(0.18 + viewHeuristics.earBiasY, 0.08, 0.28),
      w: (view === "profile" ? 0.18 : 0.22) * viewHeuristics.earWidthScale,
      h: (view === "profile" ? 0.24 : 0.28) * viewHeuristics.earHeightScale
    });
    const pawSearch = deps.cropBoxWithinBounds(bodyBounds, {
      cx: directionalAnchorX(
        view,
        facingSign,
        {
          defaultPositiveX: 0.68,
          defaultNegativeX: 0.32,
          profilePositiveX: 0.76,
          profileNegativeX: 0.24,
          biasX: viewHeuristics.pawBiasX
        },
        deps
      ),
      cy: deps.clamp(0.77 + viewHeuristics.pawBiasY, 0.64, 0.86),
      w: (view === "profile" ? 0.18 : 0.24) * viewHeuristics.pawWidthScale,
      h: 0.24 * viewHeuristics.pawHeightScale
    });
    const tailSearch = deps.cropBoxWithinBounds(bodyBounds, {
      cx: directionalAnchorX(
        view,
        facingSign,
        {
          defaultPositiveX: 0.22,
          defaultNegativeX: 0.78,
          profilePositiveX: 0.22,
          profileNegativeX: 0.78,
          biasX: viewHeuristics.tailBiasX
        },
        deps
      ),
      cy: deps.clamp(0.61 + viewHeuristics.tailBiasY, 0.46, 0.76),
      w: 0.22 * viewHeuristics.tailWidthScale,
      h: 0.24 * viewHeuristics.tailHeightScale
    });

    const eyeCandidates = headComponents.filter((component) => component.relativeCenterY >= 0.08 && component.relativeCenterY <= 0.52);
    const mouthCandidates = headComponents.filter((component) => component.relativeCenterY >= 0.36);
    const eyeNearComponent = view === "front" ? null : deps.pickBestDarkComponentForSearch(eyeCandidates, eyeNearSearch, { verticalWeight: 1.1 });
    const eyeFarComponent =
      view === "front"
        ? null
        : deps.pickBestDarkComponentForSearch(
            eyeCandidates.filter((component) => component !== eyeNearComponent),
            eyeFarSearch,
            { verticalWeight: 1.1 }
          );
    const mouthComponent =
      view === "front"
        ? null
        : deps.pickBestDarkComponentForSearch(mouthCandidates, mouthSearch, {
            verticalWeight: 1.35,
            widthMultiplier: 1.24,
            heightMultiplier: 1.22
          }) ??
          [...mouthCandidates].sort((a, b) => b.centerY - a.centerY || b.pixelCount - a.pixelCount)[0];

    const mouthCenter =
      frontMouthCenter ??
      (mouthComponent
        ? deps.measureDarkFeatureCenter(raster, deps.componentToCropBox(mouthComponent, 0.4, 0.5))
        : deps.measureDarkFeatureCenter(raster, mouthSearch));
    const earNearTip = deps.measureTopForegroundAnchor(raster, earNearSearch);
    const earFarTip = deps.measureTopForegroundAnchor(raster, earFarSearch);
    const pawBounds = deps.measureForegroundBounds(raster, pawSearch);
    const tailBounds = deps.measureForegroundBounds(raster, tailSearch);

    const headCenter = buildAnchorEntry(
      {
        x: headBounds.centerX,
        y: headBounds.centerY,
        confidence: deps.boundsDetectionConfidence(headBounds, headSearch),
        status: "present",
        notes: `${speciesId} ${view} head silhouette centroid`
      },
      deps
    );
    const mouthCenterEntry = mouthCenter
      ? buildAnchorEntry(
          {
            x: mouthCenter.x,
            y: mouthCenter.y,
            confidence: applyConfidenceBoost(
              view === "front"
                ? deps.clamp(
                    0.5 +
                      deps.clamp(
                        (mouthCenter.density - deps.constants.minFrontMouthDensity) /
                          (deps.constants.maxFrontMouthDensity - deps.constants.minFrontMouthDensity),
                        0,
                        1
                      ) *
                        0.3,
                    0.38,
                    0.96
                  )
                : mouthComponent
                  ? deps.componentDetectionConfidence(mouthComponent, mouthSearch)
                  : 0.44,
              viewHeuristics.componentConfidenceBoost.mouth,
              deps,
              0.18,
              0.96
            ),
            status: "present",
            notes: view === "front" ? `${speciesId} front mouth crop dark-feature center` : `${speciesId} side muzzle dark-feature center`
          },
          deps
        )
      : buildFallbackAnchorByExpectation(
          {
            x: mouthSearch.cx,
            y: mouthSearch.cy,
            confidence: viewHeuristics.fallbackConfidence.mouth,
            expectation: "present",
            notes: `${speciesId} fallback to current-view mouth search center`
          },
          deps
        );

    const eyeFarEntry =
      view === "front" && frontEyeFarCenter
        ? buildAnchorEntry(
            {
              x: frontEyeFarCenter.x,
              y: frontEyeFarCenter.y,
              confidence: applyConfidenceBoost(
                deps.clamp(
                  0.5 +
                    deps.clamp(
                      (frontEyeFarCenter.density - deps.constants.minFrontEyeDensity) /
                        (deps.constants.maxFrontEyeDensity - deps.constants.minFrontEyeDensity),
                      0,
                      1
                    ) *
                      0.28,
                  0.4,
                  0.96
                ),
                viewHeuristics.componentConfidenceBoost.eyeFar,
                deps,
                0.18,
                0.96
              ),
              status: "present",
              notes: `${speciesId} front far-eye crop dark-feature center`
            },
            deps
          )
        : eyeFarComponent
          ? buildAnchorEntry(
              {
                x: eyeFarComponent.centerX,
                y: eyeFarComponent.centerY,
                confidence: applyConfidenceBoost(
                  deps.componentDetectionConfidence(eyeFarComponent, eyeFarSearch),
                  viewHeuristics.componentConfidenceBoost.eyeFar,
                  deps
                ),
                status: "present",
                notes: `${speciesId} far-eye component localized in current view`
              },
              deps
            )
          : buildFallbackAnchorByExpectation(
              {
                x: eyeFarSearch.cx,
                y: eyeFarSearch.cy,
                confidence: viewHeuristics.fallbackConfidence.eyeFar,
                expectation: view === "front" ? "present" : viewHeuristics.expectedVisibility.eyeFar,
                notes:
                  view === "front"
                    ? `${speciesId} fallback to front far-eye crop center`
                    : `${speciesId} far eye inferred from current-view head geometry`
              },
              deps
            );
    const eyeNearEntry =
      view === "front" && frontEyeNearCenter
        ? buildAnchorEntry(
            {
              x: frontEyeNearCenter.x,
              y: frontEyeNearCenter.y,
              confidence: applyConfidenceBoost(
                deps.clamp(
                  0.5 +
                    deps.clamp(
                      (frontEyeNearCenter.density - deps.constants.minFrontEyeDensity) /
                        (deps.constants.maxFrontEyeDensity - deps.constants.minFrontEyeDensity),
                      0,
                      1
                    ) *
                      0.28,
                  0.4,
                  0.96
                ),
                viewHeuristics.componentConfidenceBoost.eyeNear,
                deps,
                0.18,
                0.96
              ),
              status: "present",
              notes: `${speciesId} front near-eye crop dark-feature center`
            },
            deps
          )
        : eyeNearComponent
          ? buildAnchorEntry(
              {
                x: eyeNearComponent.centerX,
                y: eyeNearComponent.centerY,
                confidence: applyConfidenceBoost(
                  deps.componentDetectionConfidence(eyeNearComponent, eyeNearSearch),
                  viewHeuristics.componentConfidenceBoost.eyeNear,
                  deps
                ),
                status: "present",
                notes: `${speciesId} near-eye component localized in current view`
              },
              deps
            )
          : buildFallbackAnchorByExpectation(
              {
                x: eyeNearSearch.cx,
                y: eyeNearSearch.cy,
                confidence: viewHeuristics.fallbackConfidence.eyeNear,
                expectation: "present",
                notes: `${speciesId} fallback to near-eye search center`
              },
              deps
            );

    const earNearEntry = earNearTip
      ? buildAnchorEntry(
          {
            x: earNearTip.x,
            y: earNearTip.y,
            confidence: applyConfidenceBoost(
              deps.clamp(0.4 + deps.clamp(earNearTip.density / 0.03, 0, 1) * 0.28, 0.28, 0.9),
              viewHeuristics.componentConfidenceBoost.earNear,
              deps,
              0.18,
              0.92
            ),
            status: "present",
            notes: `${speciesId} near-ear top silhouette anchor`
          },
          deps
        )
      : buildFallbackAnchorByExpectation(
          {
            x: earNearSearch.cx,
            y: earNearSearch.cy - earNearSearch.h * 0.22,
            confidence: viewHeuristics.fallbackConfidence.earNear,
            expectation: "present",
            notes: `${speciesId} fallback to near-ear search apex`
          },
          deps
        );
    const earFarEntry = earFarTip
      ? buildAnchorEntry(
          {
            x: earFarTip.x,
            y: earFarTip.y,
            confidence: applyConfidenceBoost(
              deps.clamp(0.38 + deps.clamp(earFarTip.density / 0.025, 0, 1) * 0.26, 0.26, 0.86),
              viewHeuristics.componentConfidenceBoost.earFar,
              deps,
              0.18,
              0.9
            ),
            status: "present",
            notes: `${speciesId} far-ear top silhouette anchor`
          },
          deps
        )
      : buildFallbackAnchorByExpectation(
          {
            x: earFarSearch.cx,
            y: earFarSearch.cy - earFarSearch.h * 0.2,
            confidence: viewHeuristics.fallbackConfidence.earFar,
            expectation: view === "front" ? "present" : viewHeuristics.expectedVisibility.earFar,
            notes:
              view === "front"
                ? `${speciesId} fallback to front far-ear search apex`
                : `${speciesId} far ear inferred from current-view head silhouette`
          },
          deps
        );

    const pawAnchor = pawBounds
      ? buildAnchorEntry(
          {
            x: facingSign >= 0 ? pawBounds.right - pawBounds.width * 0.12 : pawBounds.left + pawBounds.width * 0.12,
            y: pawBounds.bottom - pawBounds.height * 0.16,
            confidence: applyConfidenceBoost(
              deps.clamp(0.36 + deps.clamp(pawBounds.coverage / 0.18, 0, 1) * 0.28, 0.24, 0.86),
              viewHeuristics.componentConfidenceBoost.paw,
              deps,
              0.16,
              0.9
            ),
            status: "present",
            notes: `${speciesId} near-paw foreground cluster anchor`
          },
          deps
        )
      : buildFallbackAnchorByExpectation(
          {
            x: torsoCrop.cx + facingSign * torsoCrop.w * 0.46,
            y: torsoCrop.cy + torsoCrop.h * 0.34,
            confidence: viewHeuristics.fallbackConfidence.paw,
            expectation: viewHeuristics.expectedVisibility.pawAnchor,
            notes: `${speciesId} fallback to near-paw torso anchor`
          },
          deps
        );

    const tailRoot = tailBounds
      ? buildAnchorEntry(
          {
            x: facingSign >= 0 ? tailBounds.right - tailBounds.width * 0.08 : tailBounds.left + tailBounds.width * 0.08,
            y: deps.clamp((tailBounds.top + tailBounds.bottom) / 2, bodyBounds.top, bodyBounds.bottom),
            confidence: applyConfidenceBoost(
              deps.clamp(0.34 + deps.clamp(tailBounds.coverage / 0.16, 0, 1) * 0.26, 0.24, 0.82),
              viewHeuristics.componentConfidenceBoost.tail,
              deps,
              0.16,
              0.88
            ),
            status: "present",
            notes: `${speciesId} tail-root back-body cluster anchor`
          },
          deps
        )
      : buildFallbackAnchorByExpectation(
          {
            x: torsoCrop.cx - facingSign * torsoCrop.w * 0.46,
            y: torsoCrop.cy + torsoCrop.h * 0.06,
            confidence: viewHeuristics.fallbackConfidence.tail,
            expectation: viewHeuristics.expectedVisibility.tailRoot,
            notes: `${speciesId} tail root inferred from back torso edge`
          },
          deps
        );

    views[view] = {
      head_center: headCenter,
      mouth_center: mouthCenterEntry,
      eye_near: eyeNearEntry,
      eye_far: eyeFarEntry,
      ear_near: earNearEntry,
      ear_far: earFarEntry,
      paw_anchor: pawAnchor,
      tail_root: tailRoot
    };
  }

  return finalizeCharacterPackAnchorManifest(views, deps, [
    `Species-aware heuristic anchors derived for ${speciesProfile.label.toLowerCase()}`,
    "Foreground bounds, crop boxes, and view-local feature detection remain the primary signals"
  ]);
}

export function coerceCharacterPackAnchorManifest(value: unknown, deps: CropAnchorDeps): CharacterPackAnchorManifest | null {
  const record = deps.asRecord(value);
  const viewRecord = deps.asRecord(record?.views);
  if (!viewRecord) {
    return null;
  }
  const views: Partial<Record<CharacterPackAnchorView, CharacterPackAnchorViewManifest>> = {};
  for (const view of deps.constants.characterPackAnchorViews) {
    const rawView = deps.asRecord(viewRecord[view]);
    if (!rawView) {
      continue;
    }
    const parsedView: CharacterPackAnchorViewManifest = {};
    for (const anchorId of deps.constants.characterPackAnchorIds) {
      const rawEntry = deps.asRecord(rawView[anchorId]);
      if (!rawEntry) {
        continue;
      }
      const status = deps.asString(rawEntry.status).trim();
      parsedView[anchorId] = buildAnchorEntry(
        {
          x: deps.asNumber(rawEntry.x),
          y: deps.asNumber(rawEntry.y),
          confidence: deps.asNumber(rawEntry.confidence),
          status:
            status === "present" || status === "occluded" || status === "missing" || status === "not_applicable"
              ? status
              : "missing",
          notes: deps.asString(rawEntry.notes).trim() || undefined
        },
        deps
      );
    }
    views[view] = parsedView;
  }
  return Object.keys(views).length > 0 ? finalizeCharacterPackAnchorManifest(views, deps) : null;
}

export function normalizeAnchorWithinBounds(
  entry: CharacterPackAnchor | undefined,
  bounds: ForegroundBounds,
  deps: CropAnchorDeps
): { x: number; y: number } | null {
  if (!entry || typeof entry.x !== "number" || typeof entry.y !== "number") {
    return null;
  }
  return {
    x: deps.clamp((entry.x - bounds.left) / Math.max(bounds.width, 0.0001), 0, 1),
    y: deps.clamp((entry.y - bounds.top) / Math.max(bounds.height, 0.0001), 0, 1)
  };
}

export function expandCropBox(
  crop: CropBox,
  widthMultiplier: number,
  heightMultiplier: number,
  offsetY: number,
  deps: CropAnchorDeps
): CropBox {
  return deps.normalizeCropBox({
    cx: crop.cx,
    cy: crop.cy + offsetY,
    w: crop.w * widthMultiplier,
    h: crop.h * heightMultiplier
  });
}

export function buildVisemeRepairCrop(cropBoxes: CharacterCropBoxes, deps: CropAnchorDeps): CropBox {
  const head = cropBoxes.head.front;
  const mouth = cropBoxes.mouth;
  return deps.normalizeCropBox({
    cx: mouth.cx,
    cy: mouth.cy - 0.01,
    w: Math.max(mouth.w * 4.4, head.w * 0.56),
    h: Math.max(mouth.h * 4.2, head.h * 0.44)
  });
}

export async function resolveRepairCropBoxesWithDeps(characterId: string, deps: CropAnchorDeps): Promise<CharacterCropBoxes> {
  const manifest = deps.loadManifest(characterId);
  const autoCropBoxes = await deriveAutoCropBoxesWithDeps(manifest, deps);
  return applyCropBoxOverridesWithDeps(characterId, autoCropBoxes, deps);
}
