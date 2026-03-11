import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  buildCharacterPrompt,
  type CharacterReferenceBankEntry,
  type CharacterReferenceRole,
  type CharacterStructureControlImage,
  type CharacterStructureControlKind,
  type CharacterView,
  type PromptQualityProfile
} from "@ec/image-gen";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ADAPTER_URL = (process.env.COMFY_ADAPTER_URL?.trim() || "http://127.0.0.1:8013").replace(/\/+$/, "");
const OUT_DIR = path.join(REPO_ROOT, "out", "comfy_direct_3view_smoke");
type LocalImageReference = {
  filePath: string;
  mimeType: string;
  imageBase64: string;
};

const QUALITY_PROFILE: PromptQualityProfile = {
  id: "eraser_cat_mascot_production_v1",
  label: "Eraser Cat Mascot Production",
  qualityTier: "production",
  targetStyle: "eraser cat mascot",
  width: 1152,
  height: 1152,
  steps: 36,
  cfg: 4.6,
  sampler: "dpmpp_2m_sde",
  scheduler: "karras"
};
const FRONT_STAGE_WEIGHTS = {
  style: 0.42,
  composition: 0.36
};
const SIDE_STAGE_WEIGHTS = {
  base: {
    frontMaster: 0.74,
    composition: 0.66,
    style: 0.12
  },
  refine: {
    frontMaster: 0.7,
    familyComposition: 0.56,
    draftComposition: 0.32,
    style: 0.1
  },
  lock: {
    frontMaster: 0.66,
    familyComposition: 0.62,
    draftComposition: 0.28,
    style: 0.08
  }
};

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") {
    return "image/jpeg";
  }
  if (ext === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readImageReference(filePath: string): LocalImageReference {
  const buffer = fs.readFileSync(filePath);
  return {
    filePath,
    mimeType: mimeFromPath(filePath),
    imageBase64: buffer.toString("base64")
  };
}

async function buildStructureControls(
  reference: LocalImageReference,
  kinds: CharacterStructureControlKind[],
  source: {
    sourceRole: CharacterReferenceRole;
    sourceRefId: string;
    sourceView: CharacterView;
  }
): Promise<Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>>> {
  const sourceBuffer = Buffer.from(reference.imageBase64, "base64");
  const alphaMaskBuffer = await sharp(sourceBuffer, { limitInputPixels: false })
    .ensureAlpha()
    .extractChannel("alpha")
    .threshold(12)
    .png()
    .toBuffer();

  const controls: Partial<Record<CharacterStructureControlKind, CharacterStructureControlImage>> = {};

  if (kinds.includes("lineart")) {
    const lineart = await sharp(alphaMaskBuffer, { limitInputPixels: false })
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
      })
      .normalise()
      .threshold(8)
      .png()
      .toBuffer();
    controls.lineart = {
      imageBase64: lineart.toString("base64"),
      mimeType: "image/png",
      strength: 0.52,
      sourceRole: source.sourceRole,
      sourceRefId: source.sourceRefId,
      sourceView: source.sourceView
    };
  }

  if (kinds.includes("canny")) {
    const canny = await sharp(alphaMaskBuffer, { limitInputPixels: false })
      .blur(0.6)
      .convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
      })
      .normalise()
      .threshold(14)
      .png()
      .toBuffer();
    controls.canny = {
      imageBase64: canny.toString("base64"),
      mimeType: "image/png",
      strength: 0.42,
      sourceRole: source.sourceRole,
      sourceRefId: source.sourceRefId,
      sourceView: source.sourceView
    };
  }

  if (kinds.includes("depth")) {
    const depth = await sharp(alphaMaskBuffer, { limitInputPixels: false })
      .blur(18)
      .normalise()
      .png()
      .toBuffer();
    controls.depth = {
      imageBase64: depth.toString("base64"),
      mimeType: "image/png",
      strength: 0.32,
      sourceRole: source.sourceRole,
      sourceRefId: source.sourceRefId,
      sourceView: source.sourceView
    };
  }

  return controls;
}

async function postGenerate(payload: Record<string, unknown>): Promise<Record<string, any>> {
  const response = await fetch(`${ADAPTER_URL}/api/generate-character-view`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let json = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${json?.error ?? text}`);
  }

  return json;
}

async function runStage({
  stageKey,
  payload,
  outName
}: {
  stageKey: string;
  payload: Record<string, unknown>;
  outName: string;
}) {
  const startedAt = Date.now();
  const result = await postGenerate(payload);
  const imageBase64 = result?.imageBase64;
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    throw new Error(`${stageKey}: missing imageBase64`);
  }
  const imageBuffer = Buffer.from(imageBase64, "base64");
  const pngPath = path.join(OUT_DIR, `${outName}.png`);
  const jsonPath = path.join(OUT_DIR, `${outName}.json`);
  fs.writeFileSync(pngPath, imageBuffer);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        stageKey,
        durationMs: Date.now() - startedAt,
        payloadSummary: {
          view: payload.view,
          workflowStage: payload.workflowStage,
          workflowTemplateVersion: payload.workflowTemplateVersion
        },
        result
      },
      null,
      2
    )
  );

  return {
    pngPath,
    jsonPath,
    imageBase64,
    mimeType: result?.mimeType || "image/png",
    meta: result?.meta ?? null
  };
}

function referenceBankEntry(
  id: string,
  role: CharacterReferenceRole,
  view: CharacterView,
  weight: number,
  note: string,
  reference: LocalImageReference
): CharacterReferenceBankEntry {
  return {
    id,
    role,
    view,
    weight,
    note,
    imageBase64: reference.imageBase64,
    mimeType: reference.mimeType
  };
}

async function main() {
  ensureDir(OUT_DIR);

  const mainStyle = readImageReference(path.join(REPO_ROOT, "refs", "cat_quality_input", "derived", "front_style_clean.png"));
  const frontComposition = readImageReference(
    path.join(REPO_ROOT, "refs", "cat_quality_input", "derived", "front_composition.png")
  );
  const threeQuarterComposition = readImageReference(
    path.join(REPO_ROOT, "refs", "cat_quality_input", "derived", "threeQuarter_composition.png")
  );
  const profileComposition = readImageReference(
    path.join(REPO_ROOT, "refs", "cat_quality_input", "derived", "profile_composition.png")
  );
  const poseThreeQuarter = readImageReference(path.join(REPO_ROOT, "workflows", "comfy", "pose_guides", "threeQuarter.png"));
  const poseProfile = readImageReference(path.join(REPO_ROOT, "workflows", "comfy", "pose_guides", "profile.png"));

  const promptBundle = buildCharacterPrompt({
    mode: "new",
    presetId: "eraser-cat-mascot-production",
    speciesId: "cat",
    positivePrompt: "single mascot only, transparent background, preserve house style without copying a sample character",
    negativePrompt:
      "front view, near-front cheat, straight-on face, centered nose, centered mouth, second eye visible in profile, both ears equally visible in profile"
  });
  const prompt = promptBundle.positivePrompt;
  const negativePrompt = promptBundle.negativePrompt;
  const frontViewPrompt = `${promptBundle.viewPrompts.front}, preserve house style without copying a sample character, no floating accessories, no hair tuft`;
  const threeQuarterViewPrompt = `${promptBundle.viewPrompts.threeQuarter}, keep visible turn, keep off-center face placement, far eye smaller than near eye, no front collapse`;
  const profileViewPrompt = `${promptBundle.viewPrompts.profile}, nose and mouth on outer contour, no second eye, no frontal symmetry`;

  const frontControls = await buildStructureControls(frontComposition, ["lineart", "canny"], {
    sourceRole: "composition",
    sourceRefId: "front_family_composition",
    sourceView: "front"
  });

  const front = await runStage({
    stageKey: "front_master",
    outName: "front_master",
    payload: {
      mode: "new",
      view: "front",
      seed: 4242,
      prompt,
      viewPrompt: frontViewPrompt,
      negativePrompt,
      presetId: promptBundle.presetId,
      workflowStage: "front_master",
      workflowTemplateVersion: "ultra_front_master_v1",
      referenceMode: "off",
      qualityProfile: QUALITY_PROFILE,
      guardrails: promptBundle.guardrails,
      stagePlan: {
        stage: "front_master",
        templateVersion: "ultra_front_master_v1",
        templateSpecPath: "workflows/comfy/character/front_master/ultra_front_master_v1.stage.json",
        views: ["front"],
        candidateCount: 1,
        acceptedScoreThreshold: 0.62
      },
      structureControls: frontControls,
      referenceBank: [
        referenceBankEntry(
          "front_family_style_main",
          "style",
          "front",
          FRONT_STAGE_WEIGHTS.style,
          "cat_quality_input main style canon",
          mainStyle
        ),
        referenceBankEntry(
          "front_family_composition",
          "composition",
          "front",
          FRONT_STAGE_WEIGHTS.composition,
          frontComposition.filePath,
          frontComposition
        )
      ]
    }
  });

  const frontReference = {
    imageBase64: front.imageBase64,
    mimeType: front.mimeType
  };

  const sideViews: Array<{ view: CharacterView; composition: LocalImageReference; pose: LocalImageReference }> = [
    {
      view: "threeQuarter",
      composition: threeQuarterComposition,
      pose: poseThreeQuarter
    },
    {
      view: "profile",
      composition: profileComposition,
      pose: poseProfile
    }
  ];

  const report: {
    adapterUrl: string;
    outDir: string;
    front: {
      pngPath: string;
      jsonPath: string;
      meta: unknown;
    };
    stages: Record<string, unknown>;
  } = {
    adapterUrl: ADAPTER_URL,
    outDir: OUT_DIR,
    front: {
      pngPath: front.pngPath,
      jsonPath: front.jsonPath,
      meta: front.meta
    },
    stages: {}
  };

  for (const side of sideViews) {
    const compositionRefId = `${side.view}_family_composition`;
    const sideControls = await buildStructureControls(side.composition, ["lineart", "canny"], {
      sourceRole: "composition",
      sourceRefId: compositionRefId,
      sourceView: side.view
    });

    const sideBase = await runStage({
      stageKey: `side_view_base:${side.view}`,
      outName: `${side.view}_side_view_base`,
      payload: {
        mode: "reference",
        view: side.view,
        seed: side.view === "threeQuarter" ? 4343 : 4444,
        prompt,
        viewPrompt: side.view === "threeQuarter" ? threeQuarterViewPrompt : profileViewPrompt,
        negativePrompt,
        presetId: promptBundle.presetId,
        workflowStage: "side_view_base",
        workflowTemplateVersion: "ultra_side_view_base_v1",
        referenceMode: "img2img",
        referenceImageBase64: side.composition.imageBase64,
        referenceMimeType: side.composition.mimeType,
        qualityProfile: QUALITY_PROFILE,
        guardrails: promptBundle.guardrails,
        stagePlan: {
          stage: "side_view_base",
          templateVersion: "ultra_side_view_base_v1",
          templateSpecPath: "workflows/comfy/character/side_view_base/ultra_side_view_base_v1.stage.json",
          views: [side.view],
          candidateCount: 1,
          acceptedScoreThreshold: 0.58
        },
        referenceBank: [
          {
            id: "approved_front_master",
            role: "front_master",
            view: "front",
            weight: SIDE_STAGE_WEIGHTS.base.frontMaster,
            note: "approved front anchor",
            imageBase64: frontReference.imageBase64,
            mimeType: frontReference.mimeType
          },
          {
            id: "family_style_anchor",
            role: "style",
            view: "front",
            weight: SIDE_STAGE_WEIGHTS.base.style,
            note: "cat_quality_input house style canon",
            imageBase64: mainStyle.imageBase64,
            mimeType: mainStyle.mimeType
          },
          {
            id: compositionRefId,
            role: "composition",
            view: side.view,
            weight: SIDE_STAGE_WEIGHTS.base.composition,
            note: side.composition.filePath,
            imageBase64: side.composition.imageBase64,
            mimeType: side.composition.mimeType
          }
        ],
        structureControls: sideControls,
        poseImageBase64: side.pose.imageBase64,
        poseMimeType: side.pose.mimeType
      }
    });

    const baseReference = {
      imageBase64: sideBase.imageBase64,
      mimeType: sideBase.mimeType
    };
    const familyCompositionRefId = `${side.view}_family_composition`;
    const refineCompositionRefId = `${side.view}_draft_composition`;
    const refineControls = await buildStructureControls(side.composition, ["lineart", "canny", "depth"], {
      sourceRole: "composition",
      sourceRefId: familyCompositionRefId,
      sourceView: side.view
    });

    const sideRefine = await runStage({
      stageKey: `side_view_refine:${side.view}`,
      outName: `${side.view}_side_view_refine`,
      payload: {
        mode: "reference",
        view: side.view,
        seed: side.view === "threeQuarter" ? 4545 : 4646,
        prompt,
        viewPrompt:
          side.view === "threeQuarter"
            ? `${threeQuarterViewPrompt}, cleanup pass, maintain visible asymmetry, tighten head silhouette and paw readability`
            : `${profileViewPrompt}, cleanup pass, tighten silhouette and keep one-eye-only side read`,
        negativePrompt,
        presetId: promptBundle.presetId,
        workflowStage: "side_view_refine",
        workflowTemplateVersion: "ultra_side_view_refine_v1",
        referenceMode: "img2img",
        referenceImageBase64: baseReference.imageBase64,
        referenceMimeType: baseReference.mimeType,
        qualityProfile: QUALITY_PROFILE,
        guardrails: promptBundle.guardrails,
        stagePlan: {
          stage: "side_view_refine",
          templateVersion: "ultra_side_view_refine_v1",
          templateSpecPath: "workflows/comfy/character/side_view_refine/ultra_side_view_refine_v1.stage.json",
          views: [side.view],
          candidateCount: 1,
          acceptedScoreThreshold: 0.61
        },
        referenceBank: [
          {
            id: "approved_front_master",
            role: "front_master",
            view: "front",
            weight: SIDE_STAGE_WEIGHTS.refine.frontMaster,
            note: "approved front anchor",
            imageBase64: frontReference.imageBase64,
            mimeType: frontReference.mimeType
          },
          {
            id: familyCompositionRefId,
            role: "composition",
            view: side.view,
            weight: SIDE_STAGE_WEIGHTS.refine.familyComposition,
            note: `${side.composition.filePath} (target family composition anchor)`,
            imageBase64: side.composition.imageBase64,
            mimeType: side.composition.mimeType
          },
          {
            id: refineCompositionRefId,
            role: "composition",
            view: side.view,
            weight: SIDE_STAGE_WEIGHTS.refine.draftComposition,
            note: "pre-refine side-view draft img2img seed",
            imageBase64: baseReference.imageBase64,
            mimeType: baseReference.mimeType
          },
          {
            id: "family_style_anchor",
            role: "style",
            view: "front",
            weight: SIDE_STAGE_WEIGHTS.refine.style,
            note: "cat_quality_input house style canon",
            imageBase64: mainStyle.imageBase64,
            mimeType: mainStyle.mimeType
          }
        ],
        structureControls: refineControls,
        poseImageBase64: side.pose.imageBase64,
        poseMimeType: side.pose.mimeType
      }
    });

    const refineReference = {
      imageBase64: sideRefine.imageBase64,
      mimeType: sideRefine.mimeType
    };
    const lockCompositionRefId = `${side.view}_identity_lock_composition`;
    const lockControls = await buildStructureControls(side.composition, ["lineart", "canny", "depth"], {
      sourceRole: "composition",
      sourceRefId: familyCompositionRefId,
      sourceView: side.view
    });

    const sideLock = await runStage({
      stageKey: `identity_lock_refine:${side.view}`,
      outName: `${side.view}_identity_lock_refine`,
      payload: {
        mode: "reference",
        view: side.view,
        seed: side.view === "threeQuarter" ? 4747 : 4848,
        prompt,
        viewPrompt:
          side.view === "threeQuarter"
            ? `${threeQuarterViewPrompt}, identity lock pass, keep the same face grammar while the head stays turned and asymmetrical`
            : `${profileViewPrompt}, identity lock pass, same cat-ear rhythm and same eraser-dust tail puff`,
        negativePrompt,
        presetId: promptBundle.presetId,
        workflowStage: "identity_lock_refine",
        workflowTemplateVersion: "ultra_identity_lock_refine_v1",
        referenceMode: "img2img",
        referenceImageBase64: refineReference.imageBase64,
        referenceMimeType: refineReference.mimeType,
        qualityProfile: QUALITY_PROFILE,
        guardrails: promptBundle.guardrails,
        stagePlan: {
          stage: "identity_lock_refine",
          templateVersion: "ultra_identity_lock_refine_v1",
          templateSpecPath: "workflows/comfy/character/identity_lock_refine/ultra_identity_lock_refine_v1.stage.json",
          views: [side.view],
          candidateCount: 1,
          acceptedScoreThreshold: 0.64
        },
        referenceBank: [
          {
            id: "approved_front_master",
            role: "front_master",
            view: "front",
            weight: SIDE_STAGE_WEIGHTS.lock.frontMaster,
            note: "approved front anchor",
            imageBase64: frontReference.imageBase64,
            mimeType: frontReference.mimeType
          },
          {
            id: familyCompositionRefId,
            role: "composition",
            view: side.view,
            weight: SIDE_STAGE_WEIGHTS.lock.familyComposition,
            note: `${side.composition.filePath} (target family composition anchor)`,
            imageBase64: side.composition.imageBase64,
            mimeType: side.composition.mimeType
          },
          {
            id: lockCompositionRefId,
            role: "composition",
            view: side.view,
            weight: SIDE_STAGE_WEIGHTS.lock.draftComposition,
            note: "current refined draft img2img seed",
            imageBase64: refineReference.imageBase64,
            mimeType: refineReference.mimeType
          },
          {
            id: "family_style_anchor",
            role: "style",
            view: "front",
            weight: SIDE_STAGE_WEIGHTS.lock.style,
            note: "cat_quality_input house style canon",
            imageBase64: mainStyle.imageBase64,
            mimeType: mainStyle.mimeType
          }
        ],
        structureControls: lockControls,
        poseImageBase64: side.pose.imageBase64,
        poseMimeType: side.pose.mimeType
      }
    });

    report.stages[side.view] = {
      sideViewBase: {
        pngPath: sideBase.pngPath,
        jsonPath: sideBase.jsonPath,
        meta: sideBase.meta
      },
      sideViewRefine: {
        pngPath: sideRefine.pngPath,
        jsonPath: sideRefine.jsonPath,
        meta: sideRefine.meta
      },
      identityLockRefine: {
        pngPath: sideLock.pngPath,
        jsonPath: sideLock.jsonPath,
        meta: sideLock.meta
      }
    };
  }

  const reportPath = path.join(OUT_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: true, outDir: OUT_DIR, reportPath }, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
