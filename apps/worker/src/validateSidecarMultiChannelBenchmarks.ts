import { bootstrapEnv } from "./bootstrapEnv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateMultiChannelBenchmarks } from "./sidecarMultiChannelBenchmarkValidation";

bootstrapEnv();

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

type CrossChannelAlertArtifact = {
  schema_version: "1.0";
  generated_at: string;
  summary_path: string;
  validation_report_path: string | null;
  benchmark_kind: string;
  ready: boolean;
  severity: string;
  status: string;
  divergence_level: string;
  differing_axes: string[];
  score_gap: number | null;
  recommendation: string;
  issues: string[];
  message: string;
};

function buildCrossChannelAlertArtifact(input: {
  summaryPath: string;
  validationReportPath: string | null;
  report: Awaited<ReturnType<typeof validateMultiChannelBenchmarks>>;
}): CrossChannelAlertArtifact {
  const crossChannel = input.report.cross_channel;
  const differingAxes = crossChannel.differing_axes.length > 0 ? crossChannel.differing_axes : [];
  const message =
    crossChannel.status === "shared"
      ? `shared triplet ready: ${crossChannel.recommendation}`
      : crossChannel.status === "insufficient"
        ? `cross-channel data insufficient: ${crossChannel.recommendation}`
        : `cross-channel divergence severity=${crossChannel.severity} level=${crossChannel.divergence_level} axes=${
            differingAxes.join(",") || "none"
          } score_gap=${crossChannel.score_gap ?? "n/a"} recommendation=${crossChannel.recommendation}`;
  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    summary_path: input.summaryPath,
    validation_report_path: input.validationReportPath,
    benchmark_kind: input.report.benchmark_kind,
    ready: input.report.ready,
    severity: crossChannel.severity,
    status: crossChannel.status,
    divergence_level: crossChannel.divergence_level,
    differing_axes: differingAxes,
    score_gap: crossChannel.score_gap,
    recommendation: crossChannel.recommendation,
    issues: [...crossChannel.issues],
    message
  };
}

function buildCrossChannelAlertMarkdown(alert: CrossChannelAlertArtifact): string {
  return [
    "# Multi-Channel Divergence Alert",
    "",
    `- Ready: \`${alert.ready}\``,
    `- Severity: \`${alert.severity}\``,
    `- Status: \`${alert.status}\``,
    `- Divergence Level: \`${alert.divergence_level}\``,
    `- Differing Axes: \`${alert.differing_axes.join(",") || "none"}\``,
    `- Score Gap: \`${alert.score_gap ?? "n/a"}\``,
    `- Recommendation: \`${alert.recommendation}\``,
    `- Message: \`${alert.message}\``,
    `- Issues: \`${alert.issues.join("|") || "none"}\``,
    `- Summary Path: \`${alert.summary_path}\``,
    `- Validation Report Path: \`${alert.validation_report_path ?? "n/a"}\``,
    ""
  ].join("\n");
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const summaryPath = resolveLocalPath(
    repoRoot,
    resolveArgValue("summary") ??
      path.join("out", "multi_channel_benchmarks", "video_i2v", "multi_channel_benchmark_summary.json")
  );
  const outPath = resolveArgValue("out") ? resolveLocalPath(repoRoot, resolveArgValue("out") as string) : null;
  const alertOutPath = resolveArgValue("alert-out")
    ? resolveLocalPath(repoRoot, resolveArgValue("alert-out") as string)
    : outPath
      ? path.join(path.dirname(outPath), "multi_channel_benchmark_alert.json")
      : null;
  const alertMarkdownPath = resolveArgValue("alert-md-out")
    ? resolveLocalPath(repoRoot, resolveArgValue("alert-md-out") as string)
    : alertOutPath
      ? path.join(path.dirname(alertOutPath), "multi_channel_benchmark_alert.md")
      : null;
  const requireReady =
    hasFlag("require-ready") || parseTruthy(process.env.BENCHMARK_MULTICHANNEL_REQUIRE_READY);

  const report = validateMultiChannelBenchmarks({
    summaryPath
  });
  const alert = buildCrossChannelAlertArtifact({
    summaryPath,
    validationReportPath: outPath,
    report
  });

  if (outPath) {
    writeJson(outPath, report);
  }
  if (alertOutPath) {
    writeJson(alertOutPath, alert);
  }
  if (alertMarkdownPath) {
    ensureDir(path.dirname(alertMarkdownPath));
    fs.writeFileSync(alertMarkdownPath, buildCrossChannelAlertMarkdown(alert), "utf8");
  }

  console.log(`MULTI-CHANNEL BENCHMARK VALIDATION: ${report.ready ? "ready" : "not_ready"}`);
  console.log(`MULTI-CHANNEL BENCHMARK KIND: ${report.benchmark_kind}`);
  console.log(`MULTI-CHANNEL BUNDLE COUNT: ${report.bundle_count}`);
  console.log(
    `MULTI-CHANNEL CROSS-CHANNEL: status=${report.cross_channel.status} severity=${report.cross_channel.severity} recommendation=${report.cross_channel.recommendation}`
  );
  console.log(`MULTI-CHANNEL ALERT: ${alert.message}`);
  if (outPath) {
    console.log(`MULTI-CHANNEL BENCHMARK REPORT: ${outPath}`);
  }
  if (alertOutPath) {
    console.log(`MULTI-CHANNEL ALERT REPORT: ${alertOutPath}`);
  }
  if (alertMarkdownPath) {
    console.log(`MULTI-CHANNEL ALERT MARKDOWN: ${alertMarkdownPath}`);
  }
  if (requireReady && !report.ready) {
    const firstFailingBundle = report.bundles.find((bundle) => !bundle.ready);
    if (!firstFailingBundle && !report.cross_channel.ready) {
      throw new Error(`multi-channel benchmark not ready: ${alert.message} issues=${report.cross_channel.issues.join("|") || "unknown"}`);
    }
    throw new Error(
      `multi-channel benchmark not ready: bundle=${firstFailingBundle?.bundle ?? "unknown"} issues=${
        firstFailingBundle?.issues.join("|") ?? "unknown"
      }`
    );
  }
}

main().catch((error) => {
  console.error(`validateSidecarMultiChannelBenchmarks FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
