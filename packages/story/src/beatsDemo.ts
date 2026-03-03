import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createValidator } from "@ec/shared";
import { generateBeats, toBeatsDocument, type StoryInput } from "./generateBeats";

function resolvePaths() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");
  const defaultInput = path.resolve(__dirname, "../fixtures/demo-outline.json");
  const outFile = path.join(repoRoot, "out", "beats.json");
  return { repoRoot, defaultInput, outFile };
}

function readInput(filePath: string): StoryInput {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as StoryInput;
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
  const doc = toBeatsDocument(input, beats);

  const validator = createValidator();
  const result = validator.validate("beats.schema.json", doc);
  if (!result.ok) {
    for (const issue of result.errors) {
      console.error(`schema error: path=${issue.path} message=${issue.message}`);
    }
    throw new Error("Generated beats failed schema validation.");
  }

  writeJson(outFile, doc);

  console.log(`beats:demo input=${inputPath}`);
  console.log(`beats:demo count=${doc.beats.length}`);
  console.log(`beats:demo wrote=${outFile}`);
}

main();

