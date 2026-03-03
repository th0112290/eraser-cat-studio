import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createValidator } from "@ec/shared";
import { compileShots, toShotsDocument } from "./compileShots";
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
