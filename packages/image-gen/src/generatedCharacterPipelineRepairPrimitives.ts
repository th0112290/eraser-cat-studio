import path from "node:path";
import { ComfyUiCharacterGenerationProvider } from "./comfyuiProvider";
import {
  resolveMascotCompositionReferenceAsset,
  resolveMascotStyleReferenceAsset
} from "./mascotReferenceBank";
import type {
  CharacterStillAsset,
  GeneratedCharacterExpression,
  GeneratedCharacterManifest,
  GeneratedCharacterViseme,
  GeneratedCharacterView,
  StillWorkflowKind
} from "./generatedCharacterPipeline";
import type {
  CharacterCandidateProviderMeta,
  CharacterReferenceBankEntry,
  CharacterReferenceRole,
  CharacterStructureControlImage,
  CharacterStructureControlKind,
  MascotSpeciesId,
  PromptQualityProfile
} from "./types";

type LocalImageReference = {
  filePath: string;
  mimeType: string;
  imageBase64: string;
};

export type StageRepairKind = "view" | "expression" | "viseme";

type RepairPrimitiveDeps = {
  resolveMascotSpeciesProfile: (speciesId?: MascotSpeciesId) => {
    id: MascotSpeciesId;
    viewHints: Partial<Record<GeneratedCharacterView, string>>;
    identityTokens: string[];
    guardrails: string[];
    anchorTokens?: string[];
  };
  legacySpeciesRepairHint: (speciesId: MascotSpeciesId, mode: "view" | "expression" | "viseme") => string;
  expressionPrompt: (expression: GeneratedCharacterExpression, speciesId?: MascotSpeciesId) => string;
  visemePrompt: (viseme: GeneratedCharacterViseme, speciesId?: MascotSpeciesId) => string;
  mergePromptWithSuffixes: (basePrompt: string, suffixes: readonly string[]) => string;
  buildAnimationSafeGeneratePrompt: (basePrompt: string) => string;
  buildAnimationSafeEditPrompt: (basePrompt: string) => string;
  buildAnimationSafeNegativePrompt: (basePrompt: string | undefined) => string;
  clamp: (value: number, min: number, max: number) => number;
  workflowTemplatePath: (kind: StillWorkflowKind) => string;
  stillOutputPath: (input: { characterId: string; stage: "view"; view: Exclude<GeneratedCharacterView, "front"> }) => string;
  defaultOutputPrefix: (characterId: string, label: string) => string;
  viewLabel: (view: GeneratedCharacterView) => string;
  resolveManifestSpeciesId: (manifest: GeneratedCharacterManifest, fallbackSpeciesId?: MascotSpeciesId) => MascotSpeciesId;
  loadManifest: (characterId: string) => GeneratedCharacterManifest;
  poseGuidePathForView: (view: Exclude<GeneratedCharacterView, "front">) => string;
  readRequiredLocalImageReference: (filePath: string, label: string) => LocalImageReference;
  readLocalImageReference: (filePath: string) => LocalImageReference;
  buildStructureControlsFromReference: (
    source: LocalImageReference,
    kinds: CharacterStructureControlKind[],
    meta: { sourceRole: CharacterReferenceRole; sourceRefId: string; sourceView: GeneratedCharacterView }
  ) => Promise<Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>>>;
  buildRequestHash: (value: unknown) => string;
  hashFileContents: (filePath: string) => string;
  maybeReturnCachedAsset: (input: { outputPath: string; requestHash: string }) => Promise<CharacterStillAsset | null>;
  normalizeStillToCanvas: (buffer: Buffer, width: number, height: number) => Promise<Buffer>;
  persistStillAsset: (outputPath: string, metadata: CharacterStillAsset, data: Buffer) => Promise<CharacterStillAsset>;
  buildAssetMetadata: (input: {
    characterId: string;
    stage: "view";
    workflow: "view_only_adapter";
    workflowTemplatePath: string;
    outputPath: string;
    outputPrefix: string;
    prompt: string;
    negativePrompt: string;
    seed: number;
    width: number;
    height: number;
    requestHash: string;
    approved: boolean;
    view: Exclude<GeneratedCharacterView, "front">;
    parentAsset: CharacterStillAsset;
    repairHistory?: string[];
    modelStackOverride?: string[];
  }) => CharacterStillAsset;
  updateManifestWithAsset: (manifest: GeneratedCharacterManifest, asset: CharacterStillAsset) => GeneratedCharacterManifest;
  saveManifest: (manifest: GeneratedCharacterManifest) => GeneratedCharacterManifest;
  repoRoot: string;
  comfyAdapterUrl: string;
  viewOnlyQualityProfile: PromptQualityProfile;
};

function pickEscalationPrompt(round: number, prompts: readonly string[]): string {
  return prompts[Math.min(Math.max(0, round - 1), prompts.length - 1)] ?? prompts[prompts.length - 1] ?? "";
}

export function viewRepairPrompt(
  view: GeneratedCharacterView,
  round: number,
  speciesId: MascotSpeciesId | undefined,
  deps: RepairPrimitiveDeps
): string {
  const speciesProfile = deps.resolveMascotSpeciesProfile(speciesId);
  const frontViewHint = speciesProfile.viewHints.front ?? "";
  const threeQuarterViewHint = speciesProfile.viewHints.threeQuarter ?? "";
  const profileViewHint = speciesProfile.viewHints.profile ?? "";
  if (view === "threeQuarter") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, strict right three-quarter turnaround frame, neutral expression, rotate head and torso away from camera, show asymmetrical face, keep one eye partially occluded, preserve approved front identity and silhouette, do not keep a front view",
        "same character, right three-quarter mascot turnaround, head turned about 35 degrees, torso also turned, near cheek and near ear larger than far side, preserve mascot identity, avoid frontal symmetry entirely",
        "same character, right three-quarter orthographic turnaround view, visible depth on head and body, near eye dominant and far eye reduced, preserve approved front identity, absolutely not front-facing"
      ]),
      [
        threeQuarterViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        deps.legacySpeciesRepairHint(speciesProfile.id, "view"),
        "clear torso yaw, far paw still present, absolutely not straight-on"
      ]
    );
  }
  if (view === "profile") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, strict right profile turnaround frame, neutral expression, full side silhouette, only one visible eye, nose and mouth shifted into side view, preserve approved front identity and silhouette, do not keep a front view",
        "same character, exact right side profile mascot sheet frame, head and torso rotated to a side silhouette, far eye hidden, preserve approved front identity, avoid frontal symmetry entirely",
        "same character, right profile orthographic turnaround view, face and torso fully side-facing, one visible eye only, preserve mascot silhouette and identity, absolutely not front-facing"
      ]),
      [
        profileViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        deps.legacySpeciesRepairHint(speciesProfile.id, "view"),
        "one visible eye only, one readable near paw, absolutely not straight-on"
      ]
    );
  }
  return deps.mergePromptWithSuffixes("same character, front view, neutral expression, preserve approved front identity and silhouette", [
    frontViewHint,
    ...speciesProfile.identityTokens.slice(0, 2),
    deps.legacySpeciesRepairHint(speciesProfile.id, "view")
  ]);
}

export function expressionRepairPrompt(
  expression: GeneratedCharacterExpression,
  round: number,
  speciesId: MascotSpeciesId | undefined,
  deps: RepairPrimitiveDeps
): string {
  const speciesProfile = deps.resolveMascotSpeciesProfile(speciesId);
  const frontViewHint = speciesProfile.viewHints.front ?? "";
  if (expression === "happy") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, clearly happy expression, visible smiling mouth, cheerful eye shape, keep body pose stable, face must be clearly different from neutral",
        "same character, front view, exaggerated happy mascot face, obvious smile and uplifted expression, preserve identity and body pose, make facial change unmistakable",
        "same character, front view, broad happy smile with visibly changed eyes, preserve identity and body pose, the face must read as happy at thumbnail size"
      ]),
      [frontViewHint, ...speciesProfile.identityTokens.slice(0, 2), deps.legacySpeciesRepairHint(speciesProfile.id, "expression")]
    );
  }
  if (expression === "surprised") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, clearly surprised expression, visible rounded open mouth and widened eyes, keep body pose stable, face must be clearly different from neutral",
        "same character, front view, exaggerated surprised mascot face, obvious O mouth and startled eyes, preserve identity and body pose, make facial change unmistakable",
        "same character, front view, strong surprise reaction, very clear round mouth and widened eyes, preserve identity and body pose, the face must read as surprised at thumbnail size"
      ]),
      [frontViewHint, ...speciesProfile.identityTokens.slice(0, 2), deps.legacySpeciesRepairHint(speciesProfile.id, "expression")]
    );
  }
  if (expression === "blink") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, blink expression, both eyes fully closed into visible lines, neutral mouth, keep body pose stable, face must be clearly different from neutral",
        "same character, front view, exaggerated blink mascot face, eyes visibly shut closed, preserve identity and body pose, make facial change unmistakable",
        "same character, front view, strong blink frame, both eyes closed with clear eyelid lines, preserve identity and body pose, the face must read as blinking at thumbnail size"
      ]),
      [frontViewHint, ...speciesProfile.identityTokens.slice(0, 2), deps.legacySpeciesRepairHint(speciesProfile.id, "expression")]
    );
  }
  if (expression === "angry") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, clearly angry expression, lowered brows, narrowed eyes, tight frowning mouth, keep body pose stable, face must be clearly different from neutral",
        "same character, front view, exaggerated angry mascot face, obvious glare and tense frown, preserve identity and body pose, make facial change unmistakable",
        "same character, front view, strong angry reaction, very clear scowl and compressed mouth, preserve identity and body pose, the face must read as angry at thumbnail size"
      ]),
      [frontViewHint, ...speciesProfile.identityTokens.slice(0, 2), deps.legacySpeciesRepairHint(speciesProfile.id, "expression")]
    );
  }
  if (expression === "sad") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, clearly sad expression, drooping brows, softened eyes, small downturned mouth, keep body pose stable, face must be clearly different from neutral",
        "same character, front view, exaggerated sad mascot face, obvious downturned mouth and sorrowful eyes, preserve identity and body pose, make facial change unmistakable",
        "same character, front view, strong sad reaction, very clear downturned mouth and melancholy eyes, preserve identity and body pose, the face must read as sad at thumbnail size"
      ]),
      [frontViewHint, ...speciesProfile.identityTokens.slice(0, 2), deps.legacySpeciesRepairHint(speciesProfile.id, "expression")]
    );
  }
  if (expression === "thinking") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, clearly thinking expression, one brow raised, focused eyes, small pondering mouth, keep body pose stable, face must be clearly different from neutral",
        "same character, front view, exaggerated thinking mascot face, obvious pondering look with raised brow, preserve identity and body pose, make facial change unmistakable",
        "same character, front view, strong thinking reaction, very clear pondering brow and mouth shape, preserve identity and body pose, the face must read as thoughtful at thumbnail size"
      ]),
      [frontViewHint, ...speciesProfile.identityTokens.slice(0, 2), deps.legacySpeciesRepairHint(speciesProfile.id, "expression")]
    );
  }
  return deps.expressionPrompt(expression, speciesId);
}

export function visemeRepairPrompt(
  viseme: GeneratedCharacterViseme,
  round: number,
  speciesId: MascotSpeciesId | undefined,
  deps: RepairPrimitiveDeps
): string {
  const speciesProfile = deps.resolveMascotSpeciesProfile(speciesId);
  const frontViewHint = speciesProfile.viewHints.front ?? "";
  if (viseme === "mouth_open_small") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, neutral eyes, mouth slightly open for speech with a clearly visible opening below the nose, preserve identity and body pose, visibly change only the lower mouth",
        "same character, front view, speech viseme A-small, neutral eyes, obvious small lower-mouth opening, preserve identity and body pose, mouth change must be unmistakable",
        "same character, front view, front talking viseme with a clear small open lower mouth below the nose, neutral eyes, preserve identity and body pose, mouth must read as open at thumbnail size"
      ]),
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        deps.legacySpeciesRepairHint(speciesProfile.id, "viseme"),
        "do not leave the lower mouth loop closed",
        "do not change only the nose"
      ]
    );
  }
  if (viseme === "mouth_open_wide") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, neutral eyes, mouth wide open for speech with a clearly visible opening below the nose, preserve identity and body pose, visibly change only the lower mouth",
        "same character, front view, speech viseme A-wide, neutral eyes, obvious wide open lower mouth, preserve identity and body pose, mouth change must be unmistakable",
        "same character, front view, front talking viseme with a very clear wide open lower mouth below the nose, neutral eyes, preserve identity and body pose, mouth must read as wide open at thumbnail size"
      ]),
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        deps.legacySpeciesRepairHint(speciesProfile.id, "viseme"),
        "do not leave the lower mouth loop closed",
        "do not change only the nose"
      ]
    );
  }
  if (viseme === "mouth_round_o") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, neutral eyes, rounded O mouth shape with a clearly visible opening below the nose, preserve identity and body pose, visibly change only the lower mouth",
        "same character, front view, speech viseme O, neutral eyes, obvious rounded O lower mouth, preserve identity and body pose, mouth change must be unmistakable",
        "same character, front view, front talking viseme with a very clear rounded O lower mouth opening below the nose, neutral eyes, preserve identity and body pose, mouth must read as O-shaped at thumbnail size"
      ]),
      [
        frontViewHint,
        ...speciesProfile.identityTokens.slice(0, 2),
        deps.legacySpeciesRepairHint(speciesProfile.id, "viseme"),
        "do not leave the lower mouth loop closed",
        "do not change only the nose"
      ]
    );
  }
  if (viseme === "mouth_smile_open") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, smiling open mouth for speech with a clearly visible opening, preserve identity and body pose, visibly change only the mouth",
        "same character, front view, speech viseme smile-open, obvious smiling mouth opening, preserve identity and body pose, mouth change must be unmistakable",
        "same character, front view, front talking viseme with a very clear smiling open mouth, preserve identity and body pose, mouth must read as smiling and open at thumbnail size"
      ]),
      [frontViewHint, ...speciesProfile.identityTokens.slice(0, 2), deps.legacySpeciesRepairHint(speciesProfile.id, "viseme")]
    );
  }
  if (viseme === "mouth_fv") {
    return deps.mergePromptWithSuffixes(
      pickEscalationPrompt(round, [
        "same character, front view, mouth shape for F or V phoneme with upper teeth touching the lower lip, preserve identity and body pose, visibly change only the mouth",
        "same character, front view, speech viseme FV, obvious teeth-on-lip mouth shape, preserve identity and body pose, mouth change must be unmistakable",
        "same character, front view, front talking viseme with a very clear FV mouth shape, preserve identity and body pose, mouth must read as F or V at thumbnail size"
      ]),
      [frontViewHint, ...speciesProfile.identityTokens.slice(0, 2), deps.legacySpeciesRepairHint(speciesProfile.id, "viseme")]
    );
  }
  return deps.visemePrompt(viseme, speciesId);
}

export function viewRepairNegativePrompt(basePrompt: string | undefined, view: GeneratedCharacterView, deps: RepairPrimitiveDeps): string {
  return deps.mergePromptWithSuffixes(basePrompt ?? "", [
    "front view",
    "frontal pose",
    "straight-on face",
    "symmetrical front face",
    ...(view === "profile" ? ["two visible eyes", "frontal muzzle"] : ["perfect bilateral symmetry"])
  ]);
}

export function expressionGenerationNegativePrompt(basePrompt: string | undefined, deps: RepairPrimitiveDeps): string {
  return deps.mergePromptWithSuffixes(basePrompt ?? "", [
    "neutral expression",
    "expressionless face",
    "unchanged face",
    "subtle expression",
    "barely changed face",
    "same face as neutral"
  ]);
}

export function expressionRepairNegativePrompt(basePrompt: string | undefined, deps: RepairPrimitiveDeps): string {
  return deps.mergePromptWithSuffixes(expressionGenerationNegativePrompt(basePrompt, deps), [
    "neutral expression",
    "expressionless face",
    "unchanged face",
    "subtle expression",
    "barely changed face"
  ]);
}

export function visemeGenerationNegativePrompt(basePrompt: string | undefined, deps: RepairPrimitiveDeps): string {
  return deps.mergePromptWithSuffixes(basePrompt ?? "", [
    "closed mouth",
    "neutral mouth",
    "unchanged mouth",
    "tiny mouth slit",
    "barely open mouth",
    "mouth barely changed",
    "same mouth as mouth closed",
    "closed lower mouth loop",
    "nose-only edit",
    "unchanged nose"
  ]);
}

export function visemeRepairNegativePrompt(basePrompt: string | undefined, deps: RepairPrimitiveDeps): string {
  return deps.mergePromptWithSuffixes(visemeGenerationNegativePrompt(basePrompt, deps), [
    "closed mouth",
    "neutral mouth",
    "unchanged mouth",
    "tiny mouth slit",
    "barely open mouth",
    "mouth barely changed"
  ]);
}

export function resolveInitialEditDenoise(kind: StageRepairKind, baseDenoise: number | undefined, deps: RepairPrimitiveDeps): number {
  const baseline = baseDenoise ?? 0.22;
  const floor = kind === "viseme" ? 0.48 : kind === "expression" ? 0.38 : 0.22;
  return Number(deps.clamp(Math.max(baseline, floor), 0.32, 0.72).toFixed(3));
}

function buildAdapterViewPositivePrompt(frontMasterPrompt: string, speciesId: MascotSpeciesId, deps: RepairPrimitiveDeps): string {
  const speciesProfile = deps.resolveMascotSpeciesProfile(speciesId);
  return deps.buildAnimationSafeGeneratePrompt(
    deps.mergePromptWithSuffixes(frontMasterPrompt, [
      "single mascot only",
      "transparent background",
      ...speciesProfile.identityTokens.slice(0, 3),
      ...speciesProfile.guardrails.slice(0, 2)
    ])
  );
}

function buildAdapterViewPrompt(
  view: Exclude<GeneratedCharacterView, "front">,
  round: number,
  speciesId: MascotSpeciesId,
  deps: RepairPrimitiveDeps
): string {
  const speciesProfile = deps.resolveMascotSpeciesProfile(speciesId);
  const viewHint = speciesProfile.viewHints[view] ?? "";
  const anchorTokens = speciesProfile.anchorTokens?.slice(0, 3) ?? [];
  return deps.buildAnimationSafeEditPrompt(
    deps.mergePromptWithSuffixes(viewRepairPrompt(view, round, speciesId, deps), [
      viewHint,
      ...speciesProfile.identityTokens.slice(0, 3),
      ...anchorTokens,
      "approved front master continuity",
      "single mascot only",
      "transparent background"
    ])
  );
}

function buildAdapterViewModelStack(
  providerMeta: CharacterCandidateProviderMeta | undefined,
  view: Exclude<GeneratedCharacterView, "front">,
  deps: RepairPrimitiveDeps
): string[] {
  const entries = [
    "provider:comfyui",
    "workflow_stage:view_only",
    "workflow_template:ultra_view_only_v1",
    `quality_profile:${providerMeta?.qualityProfileId ?? deps.viewOnlyQualityProfile.id}`,
    `target_view:${view}`,
    providerMeta?.checkpointName ? `checkpoint:${providerMeta.checkpointName}` : null,
    providerMeta?.loraName ? `lora:${providerMeta.loraName}` : null,
    providerMeta?.poseControlNetName ? `pose_controlnet:${providerMeta.poseControlNetName}` : null,
    providerMeta?.runSettings?.sampler ? `sampler:${providerMeta.runSettings.sampler}` : null,
    providerMeta?.runSettings?.scheduler ? `scheduler:${providerMeta.runSettings.scheduler}` : null
  ];
  return entries.filter((entry, index): entry is string => Boolean(entry) && entries.indexOf(entry) === index);
}

export async function runAdapterViewOnlyRepairStillWithDeps(
  input: {
    characterId: string;
    frontMaster: CharacterStillAsset;
    view: Exclude<GeneratedCharacterView, "front">;
    negativePrompt?: string;
    speciesId?: MascotSpeciesId;
    baseSeed: number;
    round: number;
    repairHistory?: string[];
  },
  deps: RepairPrimitiveDeps
): Promise<CharacterStillAsset> {
  const workflowPath = deps.workflowTemplatePath("view_only_adapter");
  const outputPath = deps.stillOutputPath({
    characterId: input.characterId,
    stage: "view",
    view: input.view
  });
  const outputPrefix = deps.defaultOutputPrefix(input.characterId, `${deps.viewLabel(input.view)}_neutral_adapter_round_${input.round}`);
  const speciesId = deps.resolveManifestSpeciesId(deps.loadManifest(input.characterId), input.speciesId);
  const positivePrompt = buildAdapterViewPositivePrompt(input.frontMaster.prompt, speciesId, deps);
  const viewPrompt = buildAdapterViewPrompt(input.view, input.round, speciesId, deps);
  const negativePrompt = deps.buildAnimationSafeNegativePrompt(viewRepairNegativePrompt(input.negativePrompt, input.view, deps));
  const compositionAsset = resolveMascotCompositionReferenceAsset(speciesId, input.view);
  if (!compositionAsset) {
    throw new Error(`Missing mascot composition reference for species=${speciesId} view=${input.view}`);
  }
  const posePath = deps.poseGuidePathForView(input.view);
  const frontReference = deps.readRequiredLocalImageReference(input.frontMaster.file_path, "approved front master");
  const compositionReference = deps.readRequiredLocalImageReference(compositionAsset.filePath, `${input.view} composition reference`);
  const poseReference = deps.readRequiredLocalImageReference(posePath, `${input.view} pose guide`);
  const styleAsset = resolveMascotStyleReferenceAsset(speciesId);
  const styleReference = styleAsset ? deps.readLocalImageReference(styleAsset.filePath) : null;
  const compositionRefId = `${input.view}_family_composition`;
  const structureControls = await deps.buildStructureControlsFromReference(compositionReference, ["lineart", "canny"], {
    sourceRole: "composition",
    sourceRefId: compositionRefId,
    sourceView: input.view
  });
  const stagePlan = {
    stage: "view_only" as const,
    templateVersion: "ultra_view_only_v1",
    templateSpecPath: path.relative(deps.repoRoot, workflowPath).replace(/\\/g, "/"),
    views: [input.view],
    candidateCount: 1,
    acceptedScoreThreshold: 0.58,
    structureControlKinds: ["lineart", "canny"] as CharacterStructureControlKind[],
    origin: "repair_pass" as const,
    passLabel: `adapter_view_only_round_${input.round}`,
    reasonCodes: [`repair_view_${input.view}`],
    triggerViews: [input.view]
  };
  const requestHash = deps.buildRequestHash({
    workflow: "view_only_adapter",
    workflowPath,
    characterId: input.characterId,
    targetView: input.view,
    positivePrompt,
    viewPrompt,
    negativePrompt,
    baseSeed: input.baseSeed,
    qualityProfile: deps.viewOnlyQualityProfile,
    stagePlan,
    targetCanvas: {
      width: input.frontMaster.width,
      height: input.frontMaster.height
    },
    frontAssetId: input.frontMaster.asset_id,
    frontAssetHash: deps.hashFileContents(input.frontMaster.file_path),
    compositionHash: deps.hashFileContents(compositionAsset.filePath),
    poseHash: deps.hashFileContents(posePath),
    ...(styleAsset ? { styleHash: deps.hashFileContents(styleAsset.filePath) } : {}),
    repairHistory: input.repairHistory ?? []
  });
  const cached = await deps.maybeReturnCachedAsset({
    outputPath,
    requestHash
  });
  if (cached) {
    return cached;
  }

  const provider = new ComfyUiCharacterGenerationProvider(deps.comfyAdapterUrl);
  const referenceBank: CharacterReferenceBankEntry[] = [
    {
      id: "approved_front_master",
      role: "front_master",
      view: "front",
      weight: 0.98,
      note: "approved front continuity anchor",
      imageBase64: frontReference.imageBase64,
      mimeType: frontReference.mimeType
    },
    {
      id: compositionRefId,
      role: "composition",
      view: input.view,
      weight: 0.4,
      note: compositionAsset.note ?? compositionReference.filePath,
      imageBase64: compositionReference.imageBase64,
      mimeType: compositionReference.mimeType
    }
  ];
  if (styleReference && styleAsset) {
    referenceBank.push({
      id: "family_style_anchor",
      role: "style",
      view: "front",
      weight: 0.28,
      note: styleAsset.note ?? styleAsset.filePath,
      imageBase64: styleReference.imageBase64,
      mimeType: styleReference.mimeType
    });
  }

  const result = await provider.generate({
    mode: "reference",
    views: [input.view],
    candidateCount: 1,
    baseSeed: input.baseSeed,
    speciesId,
    positivePrompt,
    negativePrompt,
    referenceMode: "img2img",
    referenceImageBase64: frontReference.imageBase64,
    referenceMimeType: frontReference.mimeType,
    poseImageBase64ByView: {
      [input.view]: poseReference.imageBase64
    },
    poseMimeTypeByView: {
      [input.view]: poseReference.mimeType
    },
    structureControlsByView: {
      [input.view]: structureControls
    },
    workflowStage: "view_only",
    workflowTemplateVersion: "ultra_view_only_v1",
    stagePlan,
    qualityProfile: deps.viewOnlyQualityProfile,
    guardrails: deps.resolveMascotSpeciesProfile(speciesId).guardrails,
    viewPrompts: {
      [input.view]: viewPrompt
    },
    referenceBankByView: {
      [input.view]: referenceBank
    }
  });
  const candidate = result.candidates.find((entry) => entry.view === input.view);
  if (!candidate) {
    throw new Error(`adapter view-only repair returned no candidate for ${input.view}`);
  }

  const metadata = deps.buildAssetMetadata({
    characterId: input.characterId,
    stage: "view",
    workflow: "view_only_adapter",
    workflowTemplatePath: workflowPath,
    outputPath,
    outputPrefix,
    prompt: viewPrompt,
    negativePrompt,
    seed: input.baseSeed,
    width: input.frontMaster.width,
    height: input.frontMaster.height,
    requestHash,
    approved: false,
    view: input.view,
    parentAsset: input.frontMaster,
    repairHistory: input.repairHistory,
    modelStackOverride: buildAdapterViewModelStack(candidate.providerMeta, input.view, deps)
  });
  const normalizedBuffer = await deps.normalizeStillToCanvas(candidate.data, input.frontMaster.width, input.frontMaster.height);
  const asset = await deps.persistStillAsset(outputPath, metadata, normalizedBuffer);
  const manifest = deps.loadManifest(input.characterId);
  deps.updateManifestWithAsset(manifest, asset);
  deps.saveManifest(manifest);
  return asset;
}
