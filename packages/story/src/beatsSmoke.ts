import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createValidator } from "@ec/shared";
import { generateBeats, toBeatsDocument, type StoryInput } from "./generateBeats";

type SmokeCase = {
  name: string;
  file: string;
};

function readJson(filePath: string): StoryInput {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as StoryInput;
}

function run() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const fixtureDir = path.resolve(__dirname, "../fixtures");

  const cases: SmokeCase[] = [
    { name: "outline", file: path.join(fixtureDir, "demo-outline.json") },
    { name: "paragraphs", file: path.join(fixtureDir, "demo-paragraphs.json") }
  ];

  const validator = createValidator();
  let failed = 0;

  for (const item of cases) {
    const input = readJson(item.file);
    const beats = generateBeats(input);
    const doc = toBeatsDocument(input, beats);
    const result = validator.validate("beats.schema.json", doc);
    const countOk = doc.beats.length >= 60 && doc.beats.length <= 120;
    const pass = result.ok && countOk;
    const tag = pass ? "PASS" : "FAIL";

    console.log(`[${tag}] beats:${item.name} count=${doc.beats.length}`);

    if (!countOk) {
      console.log("  - expected beat count to be within 60..120");
    }

    if (!result.ok) {
      for (const issue of result.errors) {
        console.log(`  - schema path=${issue.path} message=${issue.message}`);
      }
    }

    if (!pass) {
      failed += 1;
    }
  }

  if (failed > 0) {
    throw new Error(`beats:smoke failed (${failed} case${failed > 1 ? "s" : ""})`);
  }

  console.log("beats:smoke passed");
}

run();

