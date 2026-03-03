import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTemplate, type FactInput, type SourceMetadata } from "./applyTemplate";
import { fitToDuration } from "./fitToDuration";
import { qaScript } from "./qaScript";

type DemoInput = {
  topic: string;
  wpm?: number;
  facts: FactInput[];
};

function resolvePaths() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");
  const defaultInput = path.resolve(__dirname, "../fixtures/demo-input.json");
  const outDir = path.join(repoRoot, "out");

  return {
    defaultInput,
    scriptOut: path.join(outDir, "script.md"),
    qaOut: path.join(outDir, "qa_report.json")
  };
}

function readInput(filePath: string): DemoInput {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as DemoInput;
}

function writeText(filePath: string, value: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${value}\n`, "utf8");
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function splitToBreathLines(text: string, maxWordsPerLine: number = 16): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/g)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const lines: string[] = [];

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/g).filter((item) => item.length > 0);
    if (words.length <= maxWordsPerLine) {
      lines.push(sentence);
      continue;
    }

    for (let index = 0; index < words.length; index += maxWordsPerLine) {
      const chunk = words.slice(index, index + maxWordsPerLine).join(" ");
      lines.push(chunk);
    }
  }

  return lines;
}

function renderScriptMarkdown(inputPath: string, topic: string, sources: SourceMetadata[] | undefined, scriptLines: string[]): string {
  const sourceLines = (sources ?? [])
    .filter((item): item is SourceMetadata => Boolean(item && item.sourceId))
    .map((source) => {
      const title = source.title ?? source.sourceId;
      const urlSuffix = source.url ? ` (${source.url})` : "";
      return `- [${source.sourceId}] ${title}${urlSuffix}`;
    });

  return [
    "# Script Draft",
    "",
    `- input: ${inputPath}`,
    `- topic: ${topic}`,
    "",
    "## Sources",
    ...(sourceLines.length > 0 ? sourceLines : ["- (none)"]),
    "",
    "## Narration",
    ...scriptLines.map((line) => `- ${line}`)
  ].join("\n");
}

function main() {
  const { defaultInput, scriptOut, qaOut } = resolvePaths();
  const inputPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultInput;
  const input = readInput(inputPath);
  const wpm = typeof input.wpm === "number" ? input.wpm : 140;

  const outline = applyTemplate(input.topic, input.facts);
  const baseScript = outline.sections
    .flatMap((section) => section.points.map((point) => point.text))
    .join(" ");

  const fitted = fitToDuration(baseScript, wpm);
  const scriptLines = splitToBreathLines(fitted.fittedText);
  const scriptText = scriptLines.join("\n");
  const issues = qaScript(scriptText);
  const policyFlags = Array.from(
    new Set(issues.flatMap((issue) => issue.policyFlags ?? []).sort((a, b) => a.localeCompare(b)))
  );

  const scriptMd = renderScriptMarkdown(inputPath, outline.topic, outline.sources, scriptLines);

  writeText(scriptOut, scriptMd);
  writeJson(qaOut, {
    generatedAt: new Date().toISOString(),
    inputPath,
    topic: outline.topic,
    wpm: fitted.wpm,
    targetMinutes: fitted.targetMinutes,
    duration: {
      strategy: fitted.strategy,
      targetWords: fitted.targetWords,
      originalWords: fitted.originalWords,
      actualWords: fitted.actualWords
    },
    structure: outline.sections.map((section) => section.name),
    sources: outline.sources,
    policyFlags,
    issues
  });

  console.log(`script:demo input=${inputPath}`);
  console.log(`script:demo script=${scriptOut}`);
  console.log(`script:demo qa=${qaOut}`);
  console.log(`script:demo issues=${issues.length}`);
}

main();
