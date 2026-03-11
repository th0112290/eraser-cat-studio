import { bootstrapEnv } from "./bootstrapEnv";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

bootstrapEnv();

type MultiChannelBundleName = "economy" | "medical";
type BenchmarkKind = "presets" | "backends";

type BundlePlan = {
  bundle: MultiChannelBundleName;
  fixturePath: string;
  outDir: string;
  characterPackId: string;
  commandArgs: string[];
};

type BundleExecutionResult = Record<string, unknown>;

function appendOptionalArg(args: string[], name: string, value: string | null): void {
  if (typeof value === "string" && value.trim().length > 0) {
    args.push(`--${name}=${value.trim()}`);
  }
}

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

function resolveLocalPath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolvePnpmExecutable(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function resolveBenchmarkKind(): BenchmarkKind {
  const raw = (resolveArgValue("benchmark-kind") ?? process.env.BENCHMARK_MULTICHANNEL_KIND ?? "presets").trim();
  return raw === "backends" ? "backends" : "presets";
}

function shouldValidate(): boolean {
  const raw = process.env.BENCHMARK_MULTICHANNEL_VALIDATE?.trim().toLowerCase();
  return hasFlag("validate") || raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function shouldRequireReady(): boolean {
  const raw = process.env.BENCHMARK_MULTICHANNEL_REQUIRE_READY?.trim().toLowerCase();
  return hasFlag("require-ready") || raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function shouldMaterializeRollout(): boolean {
  const raw = process.env.BENCHMARK_MULTICHANNEL_MATERIALIZE_ROLLOUT?.trim().toLowerCase();
  return hasFlag("materialize-rollout") || raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function resolveBundleTimeoutMs(): number | null {
  const raw =
    resolveArgValue("bundle-timeout-ms") ?? process.env.BENCHMARK_MULTICHANNEL_BUNDLE_TIMEOUT_MS ?? "";
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function resolveBundleFixturePath(repoRoot: string, bundle: MultiChannelBundleName): string {
  return resolveLocalPath(
    resolveArgValue(`${bundle}-fixture`) ??
      resolveArgValue("fixture") ??
      path.join(
        repoRoot,
        "scripts",
        "fixtures",
        bundle === "medical" ? "video_i2v_smoke_medical_shots.json" : "video_i2v_smoke_economy_shots.json"
      )
  );
}

function resolveBundleCharacterPackId(bundle: MultiChannelBundleName): string {
  const value =
    resolveArgValue(`${bundle}-character-pack-id`) ??
    resolveArgValue("character-pack-id") ??
    process.env[`SMOKE_${bundle.toUpperCase()}_CHARACTER_PACK_ID`] ??
    process.env.SMOKE_VIDEO_BROLL_CHARACTER_PACK_ID ??
    "";
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing character pack id for ${bundle}. Use --${bundle}-character-pack-id=... or --character-pack-id=...`);
  }
  return trimmed;
}

function buildBundlePlan(input: {
  repoRoot: string;
  outRoot: string;
  benchmarkKind: BenchmarkKind;
  bundle: MultiChannelBundleName;
}): BundlePlan {
  const fixturePath = resolveBundleFixturePath(input.repoRoot, input.bundle);
  const outDir = path.join(input.outRoot, input.bundle);
  const characterPackId = resolveBundleCharacterPackId(input.bundle);
  const workerScript =
    input.benchmarkKind === "backends" ? "src/benchmarkSidecarBackends.ts" : "src/benchmarkSidecarPresets.ts";
  const commandArgs = [
    "-C",
    path.join(input.repoRoot, "apps", "worker"),
    "exec",
    "tsx",
    workerScript,
    `--fixture=${fixturePath}`,
    `--out-dir=${outDir}`,
    `--character-pack-id=${characterPackId}`,
    `--profile-bundle=${input.bundle}`
  ];
  appendOptionalArg(commandArgs, "renderer", resolveArgValue("renderer"));
  appendOptionalArg(commandArgs, "scenario-file", resolveArgValue("scenario-file"));
  appendOptionalArg(commandArgs, "scenario-set", resolveArgValue("scenario-set"));
  appendOptionalArg(commandArgs, "scenario", resolveArgValue("scenario"));
  appendOptionalArg(commandArgs, "max-scenarios", resolveArgValue("max-scenarios"));
  appendOptionalArg(commandArgs, "expected-status", resolveArgValue("expected-status"));
  appendOptionalArg(commandArgs, "scenario-timeout-ms", resolveArgValue("scenario-timeout-ms"));
  if (hasFlag("fast-mode")) {
    commandArgs.push("--fast-mode");
  }
  return {
    bundle: input.bundle,
    fixturePath,
    outDir,
    characterPackId,
    commandArgs
  };
}

function readJson(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveBundleBestSummary(result: BundleExecutionResult): Record<string, unknown> | null {
  const summary = asRecord(result.summary);
  if (!summary) {
    return null;
  }
  return asRecord(
    summary.best_overall ??
      summary.default_backend ??
      summary.premium_local_backend ??
      summary.fallback_backend ??
      summary
  );
}

function resolveTriplet(summary: Record<string, unknown> | null) {
  if (!summary) {
    return null;
  }
  return {
    controlnet_preset: asString(summary.controlnet_preset),
    impact_preset: asString(summary.impact_preset),
    qc_preset: asString(summary.qc_preset)
  };
}

function buildCrossChannelComparison(results: BundleExecutionResult[]) {
  const byBundle = new Map(
    results
      .map((result) => {
        const bundle = asString(result.bundle);
        return bundle ? [bundle, result] : null;
      })
      .filter((entry): entry is [string, BundleExecutionResult] => Boolean(entry))
  );
  const economy = byBundle.get("economy") ?? null;
  const medical = byBundle.get("medical") ?? null;
  const economySummary = economy ? resolveBundleBestSummary(economy) : null;
  const medicalSummary = medical ? resolveBundleBestSummary(medical) : null;
  const economyTriplet = resolveTriplet(economySummary);
  const medicalTriplet = resolveTriplet(medicalSummary);
  const sharedBestTriplet =
    economyTriplet &&
    medicalTriplet &&
    economyTriplet.controlnet_preset === medicalTriplet.controlnet_preset &&
    economyTriplet.impact_preset === medicalTriplet.impact_preset &&
    economyTriplet.qc_preset === medicalTriplet.qc_preset;
  const differingAxes =
    economyTriplet && medicalTriplet
      ? ([
          economyTriplet.controlnet_preset !== medicalTriplet.controlnet_preset ? "controlnet" : null,
          economyTriplet.impact_preset !== medicalTriplet.impact_preset ? "impact" : null,
          economyTriplet.qc_preset !== medicalTriplet.qc_preset ? "qc" : null
        ].filter((value): value is "controlnet" | "impact" | "qc" => Boolean(value)))
      : [];
  const economyScore = asNumber(economySummary?.score);
  const medicalScore = asNumber(medicalSummary?.score);
  const scoreGap =
    typeof economyScore === "number" && typeof medicalScore === "number"
      ? Number(Math.abs(economyScore - medicalScore).toFixed(2))
      : null;
  const divergenceLevel =
    !economyTriplet || !medicalTriplet
      ? "insufficient"
      : sharedBestTriplet
        ? "none"
        : differingAxes.length === 1 && differingAxes[0] === "impact"
          ? "minor"
          : differingAxes.length === 1
            ? "moderate"
            : differingAxes.length === 2
              ? "major"
              : "critical";
  return {
    economy_best: economySummary,
    medical_best: medicalSummary,
    shared_best_triplet: Boolean(sharedBestTriplet),
    divergence_level: divergenceLevel,
    differing_axes: differingAxes,
    score_gap: scoreGap,
    economy_score: economyScore,
    medical_score: medicalScore,
    economy_triplet: economyTriplet,
    medical_triplet: medicalTriplet,
    recommendation:
      sharedBestTriplet && economyTriplet
        ? `shared best triplet ${economyTriplet.controlnet_preset}/${economyTriplet.impact_preset}/${economyTriplet.qc_preset}`
        : economyTriplet && medicalTriplet
          ? `channel divergence(${divergenceLevel}) economy=${economyTriplet.controlnet_preset}/${economyTriplet.impact_preset}/${economyTriplet.qc_preset} medical=${medicalTriplet.controlnet_preset}/${medicalTriplet.impact_preset}/${medicalTriplet.qc_preset}`
          : "insufficient completed bundle results"
  };
}

function buildMarkdown(input: {
  benchmarkKind: BenchmarkKind;
  dryRun: boolean;
  results: BundleExecutionResult[];
  crossChannelComparison: Record<string, unknown>;
}): string {
  const lines = [
    "# Multi-Channel Sidecar Benchmark",
    "",
    `- Benchmark Kind: \`${input.benchmarkKind}\``,
    `- Dry Run: \`${input.dryRun}\``,
    "",
    "## Cross-Channel",
    "",
    `- Shared Best Triplet: \`${String(input.crossChannelComparison.shared_best_triplet ?? false)}\``,
    `- Divergence Level: \`${String(input.crossChannelComparison.divergence_level ?? "insufficient")}\``,
    `- Differing Axes: \`${Array.isArray(input.crossChannelComparison.differing_axes) ? input.crossChannelComparison.differing_axes.join(",") || "none" : "none"}\``,
    `- Score Gap: \`${String(input.crossChannelComparison.score_gap ?? "n/a")}\``,
    `- Recommendation: \`${String(input.crossChannelComparison.recommendation ?? "n/a")}\``,
    "",
    "## Bundles",
    ""
  ];
  for (const result of input.results) {
    lines.push(`### ${String(result.bundle)}`);
    lines.push("");
    lines.push(`- Status: \`${String(result.status)}\``);
    lines.push(`- Fixture: \`${String(result.fixture_path)}\``);
    lines.push(`- Character Pack: \`${String(result.character_pack_id)}\``);
    if (typeof result.matrix_path === "string") {
      lines.push(`- Matrix: \`${result.matrix_path}\``);
    }
    if (typeof result.summary === "object" && result.summary !== null) {
      lines.push(`- Summary: \`${JSON.stringify(result.summary)}\``);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const benchmarkKind = resolveBenchmarkKind();
  const dryRun = hasFlag("dry-run");
  const validateAfterRun = shouldValidate();
  const requireReady = shouldRequireReady();
  const materializeRollout = shouldMaterializeRollout();
  const bundleTimeoutMs = resolveBundleTimeoutMs();
  const outRoot = resolveLocalPath(
    resolveArgValue("out-dir") ?? path.join(repoRoot, "out", "multi_channel_benchmarks", "video_i2v")
  );
  ensureDir(outRoot);

  const bundlePlans = (["economy", "medical"] as const).map((bundle) =>
    buildBundlePlan({
      repoRoot,
      outRoot,
      benchmarkKind,
      bundle
    })
  );

  const results: BundleExecutionResult[] = [];
  const pnpmExecutable = resolvePnpmExecutable();
  for (const plan of bundlePlans) {
    if (dryRun) {
      results.push({
        bundle: plan.bundle,
        status: "planned",
        fixture_path: plan.fixturePath,
        out_dir: plan.outDir,
        character_pack_id: plan.characterPackId,
        command_args: plan.commandArgs
      });
      continue;
    }

    if (fs.existsSync(plan.outDir)) {
      fs.rmSync(plan.outDir, { recursive: true, force: true });
    }
    ensureDir(plan.outDir);

    const run = spawnSync(pnpmExecutable, plan.commandArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      windowsHide: true,
      ...(bundleTimeoutMs ? { timeout: bundleTimeoutMs } : {}),
      env: {
        ...process.env
      }
    });
    const spawnErrorCode =
      run.error && typeof run.error === "object" && "code" in run.error && typeof run.error.code === "string"
        ? run.error.code
        : null;
    const timedOut = Boolean(
      run.error &&
        ((typeof spawnErrorCode === "string" && spawnErrorCode.toUpperCase() === "ETIMEDOUT") ||
          run.error.message.toLowerCase().includes("timed out") ||
          run.error.message.toLowerCase().includes("etimedout"))
    );
    const matrixPath = path.join(
      plan.outDir,
      benchmarkKind === "backends" ? "benchmark_matrix.json" : "preset_benchmark_matrix.json"
    );
    const matrix = readJson(matrixPath) as Record<string, unknown> | null;
    results.push({
      bundle: plan.bundle,
      status: timedOut ? "timed_out" : run.status === 0 ? "completed" : "failed",
      exit_code: run.status,
      timeout_ms: bundleTimeoutMs,
      fixture_path: plan.fixturePath,
      out_dir: plan.outDir,
      character_pack_id: plan.characterPackId,
      matrix_path: fs.existsSync(matrixPath) ? matrixPath : null,
      summary:
        benchmarkKind === "backends"
          ? ((matrix?.recommendation_summary as Record<string, unknown> | undefined) ??
            (matrix?.summary as Record<string, unknown> | undefined) ??
            null)
          : ((matrix?.recommendation_summary as Record<string, unknown> | undefined) ?? null),
      rows: Array.isArray(matrix?.rows) ? matrix.rows : [],
      spawn_error: run.error ? run.error.message : null,
      stdout_tail: (run.stdout || "").split(/\r?\n/).slice(-20).join("\n"),
      stderr_tail: (run.stderr || "").split(/\r?\n/).slice(-20).join("\n")
    });
  }

  const summaryPath = path.join(outRoot, "multi_channel_benchmark_summary.json");
  const validationPath = path.join(outRoot, "multi_channel_benchmark_validation.json");
  const alertPath = path.join(outRoot, "multi_channel_benchmark_alert.json");
  const alertMarkdownPath = path.join(outRoot, "multi_channel_benchmark_alert.md");
  const crossChannelComparison = buildCrossChannelComparison(results);
  const allBundlesCompleted = results.length > 0 && results.every((result) => result.status === "completed");
  const flattenedRows = results.flatMap((result) => (Array.isArray(result.rows) ? result.rows : []));
  const summaryPayload: Record<string, unknown> = {
    schema_version: "1.1",
    generated_at: new Date().toISOString(),
    benchmark_kind: benchmarkKind,
    dry_run: dryRun,
    cross_channel_comparison: crossChannelComparison,
    rows: flattenedRows,
    bundles: results
  };
  writeJson(summaryPath, summaryPayload);
  fs.writeFileSync(
    path.join(outRoot, "multi_channel_benchmark_summary.md"),
    buildMarkdown({
      benchmarkKind,
      dryRun,
      results,
      crossChannelComparison
    }),
    "utf8"
  );
  console.log(
    `MULTI-CHANNEL BENCHMARK SUMMARY: divergence=${String(crossChannelComparison.divergence_level ?? "insufficient")} axes=${
      Array.isArray(crossChannelComparison.differing_axes) && crossChannelComparison.differing_axes.length > 0
        ? crossChannelComparison.differing_axes.join(",")
        : "none"
    } score_gap=${String(crossChannelComparison.score_gap ?? "n/a")} recommendation=${String(
      crossChannelComparison.recommendation ?? "n/a"
    )}`
  );

  let validationReady = false;
  if (!dryRun && validateAfterRun) {
    const validateArgs = [
      "-C",
      path.join(repoRoot, "apps", "worker"),
      "exec",
      "tsx",
      "src/validateSidecarMultiChannelBenchmarks.ts",
      `--summary=${summaryPath}`,
      `--out=${validationPath}`,
      `--alert-out=${alertPath}`,
      `--alert-md-out=${alertMarkdownPath}`,
      ...(requireReady ? ["--require-ready"] : [])
    ];
    const validateRun = spawnSync(resolvePnpmExecutable(), validateArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      windowsHide: true,
      env: {
        ...process.env
      }
    });
    if (validateRun.stdout) {
      process.stdout.write(validateRun.stdout);
    }
    if (validateRun.stderr) {
      process.stderr.write(validateRun.stderr);
    }
    if (validateRun.status !== 0) {
      throw new Error(
        `multi-channel validation failed: ${((validateRun.stderr || "").trim() || (validateRun.stdout || "").trim() || `exit code ${validateRun.status ?? "unknown"}`)}`
      );
    }
    const validationReport = readJson(validationPath) as Record<string, unknown> | null;
    validationReady = validationReport?.ready === true;
    summaryPayload.validation = validationReport;
    summaryPayload.ready = validationReady;
    summaryPayload.alert_path = alertPath;
    summaryPayload.alert_markdown_path = alertMarkdownPath;
    writeJson(summaryPath, summaryPayload);
  }

  if (!dryRun && benchmarkKind === "presets" && materializeRollout) {
    if (!allBundlesCompleted) {
      console.log("MULTI-CHANNEL ROLLOUT MATERIALIZE: skipped because one or more bundles did not complete.");
    } else if (validateAfterRun && !validationReady) {
      console.log("MULTI-CHANNEL ROLLOUT MATERIALIZE: skipped because validation is not ready.");
    } else {
      const materializeArgs = [
        "-C",
        path.join(repoRoot, "apps", "worker"),
        "exec",
        "tsx",
        "src/materializeSidecarMultiChannelRollout.ts",
        `--summary=${summaryPath}`,
        `--out=${path.join(outRoot, "runtime_sidecar_multichannel_rollout.json")}`,
        `--env-out=${path.join(outRoot, "runtime_sidecar_multichannel_rollout.env")}`
      ];
      const materializeRun = spawnSync(resolvePnpmExecutable(), materializeArgs, {
        cwd: repoRoot,
        encoding: "utf8",
        shell: process.platform === "win32",
        windowsHide: true,
        env: {
          ...process.env
        }
      });
      if (materializeRun.stdout) {
        process.stdout.write(materializeRun.stdout);
      }
      if (materializeRun.stderr) {
        process.stderr.write(materializeRun.stderr);
      }
      if (materializeRun.status !== 0) {
        throw new Error(
          `multi-channel rollout materialization failed: ${((materializeRun.stderr || "").trim() || (materializeRun.stdout || "").trim() || `exit code ${materializeRun.status ?? "unknown"}`)}`
        );
      }
    }
  }

  if (!dryRun && results.some((result) => result.status !== "completed")) {
    throw new Error("One or more multi-channel benchmark bundles failed.");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
