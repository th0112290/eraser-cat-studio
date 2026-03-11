import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createValidator } from "@ec/shared";
import { compileShots, normalizeShotVisualObjectKind, toShotsDocument } from "./compileShots";
import { generateBeats, type Beat, type StoryInput } from "./generateBeats";

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function run() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const fixtureDir = path.resolve(__dirname, "../fixtures");

  const storyInput = readJson<StoryInput>(path.join(fixtureDir, "demo-outline.json"));
  const beatsForRange = generateBeats(storyInput);
  const shotsForRange = compileShots(beatsForRange);
  const rangeOk = shotsForRange.length >= 25 && shotsForRange.length <= 40;
  console.log(`[${rangeOk ? "PASS" : "FAIL"}] shots range count=${shotsForRange.length}`);
  if (!rangeOk) {
    throw new Error("shots:smoke expected 25..40 shots for demo outline");
  }

  const mergeFixtureBeats = readJson<Beat[]>(path.join(fixtureDir, "shots-beats.json"));
  const mergedShots = compileShots(mergeFixtureBeats, { minShots: 1, maxShots: 40 });
  const mergeOk = mergedShots.length < mergeFixtureBeats.length;
  console.log(`[${mergeOk ? "PASS" : "FAIL"}] merge adjacent beats fixture`);
  if (!mergeOk) {
    throw new Error("shots:smoke expected adjacent-beat merge to reduce shot count");
  }

  const runA = compileShots(beatsForRange);
  const runB = compileShots(beatsForRange);
  const deterministicOk = JSON.stringify(runA) === JSON.stringify(runB);
  console.log(`[${deterministicOk ? "PASS" : "FAIL"}] deterministic output`);
  if (!deterministicOk) {
    throw new Error("shots:smoke output is not deterministic");
  }

  const visualContractOk = shotsForRange.every((shot) => {
    const primaryVisual = shot.visual_objects?.find((object) => object.semantic_role === "primary_explainer");
    const normalizedKind = normalizeShotVisualObjectKind(primaryVisual?.kind);
    return Boolean(
      shot.visual_plan &&
      primaryVisual &&
      normalizedKind &&
      shot.visual_plan.selected_primary_kind === normalizedKind
    );
  });
  console.log(`[${visualContractOk ? "PASS" : "FAIL"}] canonical visual contract`);
  if (!visualContractOk) {
    throw new Error("shots:smoke expected canonical visual contract metadata on every shot");
  }

  const directingMetadataOk = shotsForRange.every((shot) => {
    if (!shot.route_reason || !shot.educational_intent || !shot.insert_need || !shot.shot_grammar) {
      return false;
    }

    const primaryKind = shot.visual_plan?.selected_primary_kind;
    if (primaryKind === "comparison_board" && shot.educational_intent !== "compare_tradeoffs") {
      return false;
    }
    if (primaryKind === "process_flow" && shot.educational_intent !== "walkthrough_steps") {
      return false;
    }
    if (primaryKind === "timeline" && shot.educational_intent !== "sequence_events") {
      return false;
    }
    if (primaryKind === "labeled_diagram" && shot.educational_intent !== "explain_structure") {
      return false;
    }
    return true;
  });
  console.log(`[${directingMetadataOk ? "PASS" : "FAIL"}] directing metadata contract`);
  if (!directingMetadataOk) {
    throw new Error("shots:smoke expected directing metadata to align with primary visual kind");
  }

  const medicalStoryInput: StoryInput = {
    episode: {
      episode_id: "episode_medical_smoke",
      bible_ref: "medical_demo",
      topic: "Clinical treatment timeline",
      target_duration_sec: 40,
      data_inputs: [
        {
          dataset_id: "medical_outcomes"
        }
      ]
    },
    outline: [
      "Clinical symptoms improve after treatment.",
      "The timeline shows diagnosis, treatment, and recovery."
    ],
    target_beat_count: 4
  };
  const medicalShots = compileShots(generateBeats(medicalStoryInput));
  const medicalMascotOk =
    medicalShots.some((shot) => shot.visual_plan?.channel_domain === "medical") &&
    medicalShots
      .filter((shot) => shot.visual_plan?.channel_domain === "medical")
      .every((shot) => shot.character.pack_id === "med-dog-minimal");
  console.log(`[${medicalMascotOk ? "PASS" : "FAIL"}] medical mascot routing`);
  if (!medicalMascotOk) {
    throw new Error("shots:smoke expected medical shots to route to med-dog pack ids");
  }

  const economyStoryInput: StoryInput = {
    episode: {
      episode_id: "episode_economy_smoke",
      bible_ref: "economy_demo",
      topic: "Inflation versus wage growth comparison",
      target_duration_sec: 40,
      data_inputs: [
        {
          dataset_id: "economy_comparison"
        }
      ]
    },
    outline: [
      "Inflation rose faster than wages.",
      "Compare household pressure against income recovery.",
      "Summarize the tradeoffs and next steps."
    ],
    target_beat_count: 4
  };
  const economyShots = compileShots(generateBeats(economyStoryInput));
  const economyDomainContinuityOk =
    economyShots.length > 0 &&
    economyShots.every((shot) => shot.visual_plan?.channel_domain === "economy") &&
    economyShots.every((shot) => shot.character.pack_id === "eraser-cat-minimal");
  console.log(`[${economyDomainContinuityOk ? "PASS" : "FAIL"}] economy domain continuity`);
  if (!economyDomainContinuityOk) {
    throw new Error("shots:smoke expected economy shots to preserve economy domain continuity");
  }

  const actingTracksOk = shotsForRange.some((shot) => shot.character.tracks.look_track.length > 1) &&
    shotsForRange.every((shot) => {
      if (shot.character.tracks.action_track.length === 0 || shot.character.tracks.expression_track.length === 0) {
        return false;
      }
      if (shot.insert_need !== "none") {
        const lookTargets = shot.character.tracks.look_track.map((entry) => entry.target);
        if (!lookTargets.includes("visual") && !lookTargets.includes("chart")) {
          return false;
        }
        if (!shot.character.tracks.point_track || shot.character.tracks.point_track.length === 0) {
          return false;
        }
      }
      return true;
    });
  console.log(`[${actingTracksOk ? "PASS" : "FAIL"}] acting track contract`);
  if (!actingTracksOk) {
    throw new Error("shots:smoke expected directing metadata to expand into acting tracks");
  }

  const validator = createValidator();
  const doc = toShotsDocument(storyInput.episode, shotsForRange);
  const validation = validator.validate("shots.schema.json", doc);
  const schemaOk = validation.ok;
  console.log(`[${schemaOk ? "PASS" : "FAIL"}] shots schema validation`);
  if (!schemaOk) {
    for (const issue of validation.errors) {
      console.log(`  - path=${issue.path} message=${issue.message}`);
    }
    throw new Error("shots:smoke generated document failed schema validation");
  }

  console.log("shots:smoke passed");
}

run();
