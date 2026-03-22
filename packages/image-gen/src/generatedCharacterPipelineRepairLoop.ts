import fs from "node:fs";
import path from "node:path";
import type {
  CharacterPipelineAcceptance,
  CharacterPipelineAcceptanceStatus,
  CharacterPipelineRepairTask,
  CharacterStillAsset,
  GeneratedCharacterExpression,
  GeneratedCharacterManifest,
  GeneratedCharacterViseme,
  GeneratedCharacterView,
  RunCharacterPipelineEditRepairLoopInput
} from "./generatedCharacterPipeline";
import type { MascotSpeciesId } from "./types";

type CharacterPipelineRepairDocument = {
  schema_version: "1.0";
  generated_at: string;
  character_id: string;
  acceptance_status: CharacterPipelineAcceptanceStatus;
  tasks: CharacterPipelineRepairTask[];
};

type StageRepairKind = "view" | "expression" | "viseme";

type RepairSelection = {
  views: GeneratedCharacterView[];
  expressions: GeneratedCharacterExpression[];
  visemes: GeneratedCharacterViseme[];
  shouldRebuildPack: boolean;
  hasRepairSourceTask: boolean;
  requiresApprovedFrontMaster: boolean;
};

type RepairRoundInput = {
  characterId: string;
  negativePrompt?: string;
  threeQuarterSeed: number;
  profileSeed: number;
  expressionBaseSeed: number;
  visemeBaseSeed: number;
  denoise?: number;
  round: number;
};

type RepairLoopDeps = {
  characterRootDir: (characterId: string) => string;
  readJson: <T>(filePath: string) => T;
  loadManifest: (characterId: string) => GeneratedCharacterManifest;
  saveManifest: (manifest: GeneratedCharacterManifest) => void;
  assignManifestSpecies: (manifest: GeneratedCharacterManifest) => GeneratedCharacterManifest;
  resolveManifestSpeciesId: (manifest: GeneratedCharacterManifest) => MascotSpeciesId;
  requireApprovedFrontMaster: (characterId: string) => CharacterStillAsset;
  stillOutputPath: (input: {
    characterId: string;
    stage: "view";
    view: "front";
  }) => string;
  aliasAssetWithNewContract: (input: {
    parentAsset: CharacterStillAsset;
    stage: "view";
    outputPath: string;
    view: "front";
  }) => CharacterStillAsset;
  updateManifestWithAsset: (manifest: GeneratedCharacterManifest, asset: CharacterStillAsset) => GeneratedCharacterManifest;
  runAdapterViewOnlyRepairStill: (input: {
    characterId: string;
    frontMaster: CharacterStillAsset;
    view: Exclude<GeneratedCharacterView, "front">;
    negativePrompt?: string;
    speciesId?: MascotSpeciesId;
    baseSeed: number;
    round: number;
    repairHistory?: string[];
  }) => Promise<CharacterStillAsset>;
  runEditCharacterStill: (input: {
    characterId: string;
    inputImagePath: string;
    editPrompt: string;
    negativePrompt?: string;
    seed: number;
    denoise?: number;
    stage: "view";
    view: GeneratedCharacterView;
    parentAssetId?: string;
    repairHistory?: string[];
  }) => Promise<CharacterStillAsset>;
  runLocalFaceRepairStill: (input: {
    characterId: string;
    baseAsset: CharacterStillAsset;
    stage: "expression" | "viseme";
    expression?: GeneratedCharacterExpression;
    viseme?: GeneratedCharacterViseme;
    editPrompt: string;
    negativePrompt?: string;
    seed: number;
    denoise?: number;
    round: number;
    repairHistory?: string[];
    speciesId?: MascotSpeciesId;
  }) => Promise<CharacterStillAsset>;
  buildGeneratedCharacterPack: (input: { characterId: string }) => Promise<unknown>;
  viewRepairPrompt: (view: GeneratedCharacterView, round: number, speciesId?: MascotSpeciesId) => string;
  viewRepairNegativePrompt: (basePrompt: string | undefined, view: GeneratedCharacterView) => string;
  expressionRepairPrompt: (expression: GeneratedCharacterExpression, round: number, speciesId?: MascotSpeciesId) => string;
  expressionRepairNegativePrompt: (basePrompt: string | undefined) => string;
  visemeRepairPrompt: (viseme: GeneratedCharacterViseme, round: number, speciesId?: MascotSpeciesId) => string;
  visemeRepairNegativePrompt: (basePrompt: string | undefined) => string;
  resolveCharacterPipelineAcceptance: (characterId: string) => CharacterPipelineAcceptance;
  resolveInitialEditDenoise: (kind: StageRepairKind, baseDenoise: number | undefined) => number;
  defaultAutoRepairRounds: number;
  enableAdapterViewRepair: boolean;
  runCharacterAnimationSafeQc: (input: { characterId: string }) => Promise<{
    reportPath: string;
    repairTasksPath: string;
    passed: boolean;
    acceptanceStatus: CharacterPipelineAcceptanceStatus;
  }>;
};

function loadRepairDocument(characterId: string, deps: RepairLoopDeps): CharacterPipelineRepairDocument | null {
  const filePath = path.join(deps.characterRootDir(characterId), "qc", "repair_tasks.json");
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return deps.readJson<CharacterPipelineRepairDocument>(filePath);
}

function pushUnique<T>(target: T[], value: T): void {
  if (!target.includes(value)) {
    target.push(value);
  }
}

function parseViewFromRepairCode(code: string): GeneratedCharacterView | null {
  if (code.includes("THREEQUARTER")) {
    return "threeQuarter";
  }
  if (code.includes("PROFILE")) {
    return "profile";
  }
  if (code.includes("FRONT")) {
    return "front";
  }
  return null;
}

function parseExpressionFromRepairCode(code: string): GeneratedCharacterExpression | null {
  if (code.includes("HAPPY")) {
    return "happy";
  }
  if (code.includes("SURPRISED")) {
    return "surprised";
  }
  if (code.includes("BLINK")) {
    return "blink";
  }
  if (code.includes("NEUTRAL")) {
    return "neutral";
  }
  return null;
}

function parseVisemeFromRepairCode(code: string): GeneratedCharacterViseme | null {
  if (code.includes("MOUTH_OPEN_SMALL")) {
    return "mouth_open_small";
  }
  if (code.includes("MOUTH_OPEN_WIDE")) {
    return "mouth_open_wide";
  }
  if (code.includes("MOUTH_ROUND_O")) {
    return "mouth_round_o";
  }
  if (code.includes("MOUTH_CLOSED")) {
    return "mouth_closed";
  }
  return null;
}

function resolveRepairSelection(tasks: CharacterPipelineRepairTask[]): RepairSelection {
  const selection: RepairSelection = {
    views: [],
    expressions: [],
    visemes: [],
    shouldRebuildPack: false,
    hasRepairSourceTask: false,
    requiresApprovedFrontMaster: false
  };

  for (const task of tasks) {
    if (task.action === "rerun_view_generation") {
      const parsed = parseViewFromRepairCode(task.code);
      if (parsed) {
        pushUnique(selection.views, parsed);
      } else if (task.code.startsWith("PACK_")) {
        pushUnique(selection.views, "front");
        pushUnique(selection.views, "threeQuarter");
        pushUnique(selection.views, "profile");
      } else {
        pushUnique(selection.views, "threeQuarter");
        pushUnique(selection.views, "profile");
      }
      continue;
    }
    if (task.action === "rerun_expression_generation") {
      const parsed = parseExpressionFromRepairCode(task.code);
      if (parsed && parsed !== "neutral") {
        pushUnique(selection.expressions, parsed);
      } else {
        for (const expression of ["happy", "surprised", "blink"] as const) {
          pushUnique(selection.expressions, expression);
        }
      }
      continue;
    }
    if (task.action === "rerun_viseme_generation") {
      const parsed = parseVisemeFromRepairCode(task.code);
      if (parsed && parsed !== "mouth_closed") {
        pushUnique(selection.visemes, parsed);
      } else {
        for (const viseme of ["mouth_open_small", "mouth_open_wide", "mouth_round_o"] as const) {
          pushUnique(selection.visemes, viseme);
        }
      }
      continue;
    }
    if (task.action === "rebuild_pack") {
      selection.shouldRebuildPack = true;
      continue;
    }
    if (task.action === "approve_front_master") {
      selection.requiresApprovedFrontMaster = true;
      pushUnique(selection.views, "front");
      continue;
    }
    if (task.action === "repair_source_asset") {
      selection.hasRepairSourceTask = true;
      const parsed = parseViewFromRepairCode(task.code);
      if (parsed) {
        pushUnique(selection.views, parsed);
      } else {
        pushUnique(selection.views, "front");
        pushUnique(selection.views, "threeQuarter");
        pushUnique(selection.views, "profile");
      }
    }
  }

  return selection;
}

function resolveRepairDenoise(
  kind: StageRepairKind,
  baseDenoise: number | undefined,
  round: number,
  deps: RepairLoopDeps
): number {
  const baseline = deps.resolveInitialEditDenoise(kind, baseDenoise);
  const initialBoost = kind === "view" ? 0.14 : kind === "viseme" ? 0.16 : 0.1;
  const roundBoost = (round - 1) * (kind === "view" ? 0.08 : kind === "viseme" ? 0.09 : 0.07);
  return Number(Math.min(0.72, Math.max(0.32, baseline + initialBoost + roundBoost)).toFixed(3));
}

function repairSeed(baseSeed: number, round: number, salt: number): number {
  return baseSeed + round * 1009 + salt;
}

function expressionSeed(baseSeed: number, expression: GeneratedCharacterExpression, round: number): number {
  const order = ["happy", "surprised", "blink", "angry", "sad", "thinking"] as const;
  const index = Math.max(0, order.indexOf(expression as (typeof order)[number]));
  return repairSeed(baseSeed + index * 97 + 11, round, 37);
}

function visemeSeed(baseSeed: number, viseme: GeneratedCharacterViseme, round: number): number {
  const order = ["mouth_open_small", "mouth_open_wide", "mouth_round_o", "mouth_smile_open", "mouth_fv"] as const;
  const index = Math.max(0, order.indexOf(viseme as (typeof order)[number]));
  return repairSeed(baseSeed + index * 89 + 17, round, 71);
}

async function runCharacterPipelineEditRepairRound(input: RepairRoundInput, deps: RepairLoopDeps): Promise<boolean> {
  const repairDocument = loadRepairDocument(input.characterId, deps);
  if (!repairDocument || repairDocument.tasks.length === 0) {
    return false;
  }

  const selection = resolveRepairSelection(repairDocument.tasks);
  const frontMaster = deps.requireApprovedFrontMaster(input.characterId);
  const manifestBefore = deps.loadManifest(input.characterId);
  const manifestSpeciesBefore = manifestBefore.species;
  const manifest = deps.assignManifestSpecies(manifestBefore);
  if (manifest.species !== manifestSpeciesBefore) {
    deps.saveManifest(manifest);
  }
  const speciesId = deps.resolveManifestSpeciesId(manifest);
  const neutralFrontAsset = manifest.expressions.front?.neutral ?? manifest.views.front ?? frontMaster;
  let changed = false;

  for (const view of selection.views) {
    if (view === "front") {
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
      const latestManifest = deps.loadManifest(input.characterId);
      deps.updateManifestWithAsset(latestManifest, frontViewAsset);
      deps.saveManifest(latestManifest);
      changed = true;
      continue;
    }

    const repairHistoryBase = [`repair_round:${input.round}`, "repair_stage:view", `repair_target:${view}`];
    const baseSeed = repairSeed(
      view === "threeQuarter" ? input.threeQuarterSeed : input.profileSeed,
      input.round,
      view === "threeQuarter" ? 13 : 29
    );

    if (deps.enableAdapterViewRepair) {
      try {
        await deps.runAdapterViewOnlyRepairStill({
          characterId: input.characterId,
          frontMaster,
          view,
          negativePrompt: input.negativePrompt,
          speciesId,
          baseSeed,
          round: input.round,
          repairHistory: [...repairHistoryBase, "repair_strategy:adapter_view_only"]
        });
        changed = true;
        continue;
      } catch (error) {
        const summary = error instanceof Error ? error.message : String(error);
        console.warn(`[generatedCharacterPipeline] adapter view repair failed for ${input.characterId}:${view}: ${summary}`);
      }
    }

    await deps.runEditCharacterStill({
      characterId: input.characterId,
      inputImagePath: frontMaster.file_path,
      editPrompt: deps.viewRepairPrompt(view, input.round, speciesId),
      negativePrompt: deps.viewRepairNegativePrompt(input.negativePrompt, view),
      seed: baseSeed,
      denoise: resolveRepairDenoise("view", input.denoise, input.round, deps),
      stage: "view",
      view,
      parentAssetId: frontMaster.asset_id,
      repairHistory: [...repairHistoryBase, "repair_strategy:prompt_denoise_escalation"]
    });
    changed = true;
  }

  for (const expression of selection.expressions) {
    if (expression === "neutral") {
      continue;
    }
    await deps.runLocalFaceRepairStill({
      characterId: input.characterId,
      baseAsset: neutralFrontAsset,
      stage: "expression",
      expression,
      editPrompt: deps.expressionRepairPrompt(expression, input.round, speciesId),
      negativePrompt: deps.expressionRepairNegativePrompt(input.negativePrompt),
      seed: expressionSeed(input.expressionBaseSeed, expression, input.round),
      denoise: resolveRepairDenoise("expression", input.denoise, input.round, deps),
      round: input.round,
      repairHistory: [`repair_round:${input.round}`, "repair_stage:expression", `repair_target:${expression}`],
      speciesId
    });
    changed = true;
  }

  const mouthClosedBase = manifest.visemes.front?.mouth_closed ?? neutralFrontAsset;
  for (const viseme of selection.visemes) {
    if (viseme === "mouth_closed") {
      continue;
    }
    await deps.runLocalFaceRepairStill({
      characterId: input.characterId,
      baseAsset: mouthClosedBase,
      stage: "viseme",
      viseme,
      editPrompt: deps.visemeRepairPrompt(viseme, input.round, speciesId),
      negativePrompt: deps.visemeRepairNegativePrompt(input.negativePrompt),
      seed: visemeSeed(input.visemeBaseSeed, viseme, input.round),
      denoise: resolveRepairDenoise("viseme", input.denoise, input.round, deps),
      round: input.round,
      repairHistory: [`repair_round:${input.round}`, "repair_stage:viseme", `repair_target:${viseme}`],
      speciesId
    });
    changed = true;
  }

  if (changed || selection.shouldRebuildPack) {
    await deps.buildGeneratedCharacterPack({ characterId: input.characterId });
  }

  return changed || selection.shouldRebuildPack;
}

export async function runCharacterPipelineEditRepairLoopWithDeps(
  input: RunCharacterPipelineEditRepairLoopInput,
  deps: RepairLoopDeps
): Promise<{
  roundsAttempted: number;
  acceptanceStatus: CharacterPipelineAcceptanceStatus;
  reportPath?: string;
  repairTasksPath?: string;
}> {
  const maxRounds = Math.max(0, input.maxRounds ?? deps.defaultAutoRepairRounds);
  let roundsAttempted = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    const acceptanceBefore = deps.resolveCharacterPipelineAcceptance(input.characterId);
    if (acceptanceBefore.status === "accepted") {
      break;
    }
    const changed = await runCharacterPipelineEditRepairRound(
      {
        characterId: input.characterId,
        negativePrompt: input.negativePrompt,
        threeQuarterSeed: input.threeQuarterSeed,
        profileSeed: input.profileSeed,
        expressionBaseSeed: input.expressionBaseSeed,
        visemeBaseSeed: input.visemeBaseSeed,
        denoise: input.denoise,
        round
      },
      deps
    );
    if (!changed) {
      break;
    }
    roundsAttempted = round;
    await deps.runCharacterAnimationSafeQc({ characterId: input.characterId });
  }

  const acceptance = deps.resolveCharacterPipelineAcceptance(input.characterId);
  return {
    roundsAttempted,
    acceptanceStatus: acceptance.status,
    reportPath: acceptance.report_path,
    repairTasksPath: acceptance.repair_tasks_path
  };
}
