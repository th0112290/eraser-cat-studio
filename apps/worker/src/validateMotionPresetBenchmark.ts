import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateMotionPresetBenchmark } from "./motionPresetBenchmarkValidation";

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function resolveArgValue(name: string): string | null {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!entry) {
    return null;
  }
  const value = entry.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}

function parseTruthy(value: string | undefined): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function resolveLocalPath(repoRoot: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const benchmarkPath = resolveArgValue("benchmark-file")
    ? resolveLocalPath(repoRoot, resolveArgValue("benchmark-file") as string)
    : undefined;
  const fallbackOutPath = path.join(
    path.dirname(benchmarkPath ?? path.join(repoRoot, "out", "motion_preset_benchmark.json")),
    `${path.basename(benchmarkPath ?? path.join(repoRoot, "out", "motion_preset_benchmark.json"), ".json")}.validation_report.json`
  );
  const outPath = resolveLocalPath(repoRoot, resolveArgValue("out") ?? fallbackOutPath);
  const requireReady =
    hasFlag("require-ready") || parseTruthy(process.env.VIDEO_MOTION_PRESET_BENCHMARK_REQUIRE_READY);

  const report = validateMotionPresetBenchmark({
    repoRoot,
    benchmarkPath
  });

  writeJson(outPath, report);

  console.log(`MOTION PRESET BENCHMARK VALIDATION: ${report.ready ? "ready" : "not_ready"}`);
  console.log(`MOTION PRESET BENCHMARK STATUS: ${report.status}`);
  console.log(`MOTION PRESET BENCHMARK PATH: ${report.benchmark_path}`);
  console.log(`MOTION PRESET BENCHMARK RECORDS: ${report.observed_record_count}/${report.expected_record_count}`);
  console.log(`MOTION PRESET BENCHMARK FAILED RECORDS: ${report.failed_records.length}`);
  console.log(`MOTION PRESET BENCHMARK AGE HOURS: ${report.benchmark_age_hours ?? "n/a"}`);
  console.log(`MOTION PRESET BENCHMARK REPORT: ${outPath}`);

  if (requireReady && !report.ready) {
    throw new Error(`motion preset benchmark not ready: status=${report.status} reason=${report.reason}`);
  }
}

main().catch((error) => {
  console.error(`validateMotionPresetBenchmark FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
