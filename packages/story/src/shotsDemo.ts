import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createValidator } from "@ec/shared";
import { compileShots, toShotsDocument } from "./compileShots";
import { generateBeats, type StoryInput } from "./generateBeats";

function resolvePaths() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");
  const defaultInput = path.resolve(__dirname, "../fixtures/demo-outline.json");
  const outFile = path.join(repoRoot, "out", "shots.json");
  return { defaultInput, outFile };
}

function readInput(filePath: string): StoryInput {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as StoryInput;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const { defaultInput, outFile } = resolvePaths();
  const inputPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultInput;

  const input = readInput(inputPath);
  const beats = generateBeats(input);
  const shots = compileShots(beats);
  const doc = toShotsDocument(input.episode, shots);

  const validator = createValidator();
  const result = validator.validate("shots.schema.json", doc);
  if (!result.ok) {
    for (const issue of result.errors) {
      console.error(`schema error: path=${issue.path} message=${issue.message}`);
    }
    throw new Error("Generated shots failed schema validation.");
  }

  writeJson(outFile, doc);
  console.log(`shots:demo input=${inputPath}`);
  console.log(`shots:demo beats=${beats.length}`);
  console.log(`shots:demo shots=${shots.length}`);
  console.log(`shots:demo wrote=${outFile}`);
}

main();

