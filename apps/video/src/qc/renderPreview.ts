import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { barDemoData } from "../templates/fixtures/barDemoData";
import { situationSceneLayout, type SituationSceneLayout } from "../templates/SituationScene";
import { runPreviewQc, type PreviewQcInput, type PreviewQcResult } from "./qc";

type PreviewProfile = {
  compositionId: string;
  config: PreviewQcInput;
};

type QcReport = {
  schema_version: "1.0";
  generated_at: string;
  requested_composition: string;
  rendered_composition: string;
  fallback_applied: boolean;
  actions: string[];
  checks: PreviewQcResult["checks"];
  issues: PreviewQcResult["issues"];
  output_mp4: string;
};

const simpleSceneLayout: SituationSceneLayout = {
  chart: {
    x: 1110,
    y: 166,
    width: 690,
    height: 486
  }
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function renderPreviewVideo(compositionId: string, outputFile: string): void {
  const remotionCli = path.resolve(process.cwd(), "node_modules/@remotion/cli/remotion-cli.js");
  const args = [
    remotionCli,
    "render",
    "src/index.ts",
    compositionId,
    outputFile,
    "--overwrite",
    "--frames=0-179"
  ];

  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    cwd: process.cwd()
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Preview render failed (exit=${result.status ?? 1})`);
  }
}

function buildPrimaryProfile(): PreviewProfile {
  return {
    compositionId: "SITUATION-SCENE-DEMO",
    config: {
      layout: situationSceneLayout,
      chartData: barDemoData,
      chartSafeArea: {
        top: 24,
        right: 28,
        bottom: 26,
        left: 32
      },
      pointerBarIndex: 2,
      caption: {
        text: "Segment C is the highest. Focus here.",
        containerWidth: 680,
        fontSize: 30,
        foreground: "#f7fbff",
        background: "#0b121e"
      },
      chartLabelColor: "#BFC8DE",
      chartBackgroundColor: "#0e1727"
    }
  };
}

function buildFallbackProfile(): PreviewProfile {
  return {
    compositionId: "SITUATION-SCENE-DEMO-FALLBACK",
    config: {
      layout: simpleSceneLayout,
      chartData: barDemoData.slice(0, 3),
      chartSafeArea: {
        top: 18,
        right: 18,
        bottom: 18,
        left: 20
      },
      pointerBarIndex: 2,
      chartLabelColor: "#D7E1F7",
      chartBackgroundColor: "#111a2a"
    }
  };
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const forceFallback = process.argv.includes("--force-fallback");
  const repoRoot = path.resolve(process.cwd(), "../..");
  const outDir = path.join(repoRoot, "out");
  const previewMp4 = path.join(outDir, "preview.mp4");
  const qcReportPath = path.join(outDir, "qc_report.json");

  const primary = buildPrimaryProfile();
  const primaryResult = runPreviewQc(primary.config);

  let selected = primary;
  let finalQc = primaryResult;
  const actions: string[] = [];

  if (forceFallback || !primaryResult.passed) {
    selected = buildFallbackProfile();
    finalQc = runPreviewQc(selected.config);
    actions.push("switch_to_simpler_layout");
    actions.push("hide_non_critical_overlays");
    actions.push("reduce_elements_count");
  }

  if (!dryRun) {
    ensureDir(outDir);
    renderPreviewVideo(selected.compositionId, previewMp4);
  }

  const report: QcReport = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    requested_composition: primary.compositionId,
    rendered_composition: selected.compositionId,
    fallback_applied: selected.compositionId !== primary.compositionId,
    actions,
    checks: finalQc.checks,
    issues: finalQc.issues,
    output_mp4: previewMp4
  };

  writeJson(qcReportPath, report);

  console.log(`qc:report ${qcReportPath}`);
  console.log(`preview:composition ${selected.compositionId}`);
  console.log(`preview:fallback ${report.fallback_applied ? "yes" : "no"}`);
  console.log(`preview:output ${previewMp4}`);

  if (!finalQc.passed) {
    throw new Error("QC failed after fallback. See qc_report.json.");
  }
}

main();
