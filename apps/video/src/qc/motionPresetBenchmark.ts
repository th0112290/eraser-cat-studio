import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_MOTION_PROFILE_IDS, resolveMotionProfile } from "@ec/profiles";
import type { ChannelVisualMotionProfileId } from "@ec/profiles";
import {
  resolveVisualMotionBenchmarkConfig,
  resolveVisualMotionState,
  type VisualMotionAnimationPolicy
} from "../compositions/visualMotion";

type BenchmarkRecord = {
  motionProfileId: ChannelVisualMotionProfileId;
  motionPreset: string;
  passed: boolean;
  failures: string[];
  config: ReturnType<typeof resolveVisualMotionBenchmarkConfig>;
  observed: {
    minPanelOpacity: number;
    maxPanelScale: number;
    maxTranslateX: number;
    maxTranslateY: number;
  };
};

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../..");
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function animationPolicyForPreset(motionPreset: string): VisualMotionAnimationPolicy {
  return motionPreset === "metric_pop" || motionPreset === "panel_hold" || motionPreset === "risk_sweep"
    ? "emphasis_pulse"
    : "presenter_guided";
}

function runBenchmarkRecord(
  motionProfileId: ChannelVisualMotionProfileId,
  motionPreset: ReturnType<typeof resolveMotionProfile>["benchmarked_motion_presets"][number]
): BenchmarkRecord {
  const config = resolveVisualMotionBenchmarkConfig({
    motionPreset,
    motionProfileId
  });
  const animationPolicy = animationPolicyForPreset(motionPreset);
  const sampleLength = Math.max(72, config.introFrames + config.detailFrames + 24);
  const emphasisAtFrame = Math.min(24, sampleLength - 1);
  let minPanelOpacity = Number.POSITIVE_INFINITY;
  let maxPanelScale = Number.NEGATIVE_INFINITY;
  let maxTranslateX = 0;
  let maxTranslateY = 0;

  for (let frame = 0; frame < sampleLength; frame += 1) {
    const state = resolveVisualMotionState({
      motionPreset,
      motionProfileId,
      animationPolicy,
      localFrame: frame,
      fps: 30,
      emphasisAtFrame
    });
    minPanelOpacity = Math.min(minPanelOpacity, state.panelOpacity);
    maxPanelScale = Math.max(maxPanelScale, state.panelScale);
    maxTranslateX = Math.max(maxTranslateX, Math.abs(state.panelTranslateX));
    maxTranslateY = Math.max(maxTranslateY, Math.abs(state.panelTranslateY));
  }

  const failures: string[] = [];
  if (config.introFrames < config.thresholds.min_intro_frames || config.introFrames > config.thresholds.max_intro_frames) {
    failures.push(`intro_frames=${config.introFrames}`);
  }
  if (
    config.detailFrames < config.thresholds.min_detail_frames ||
    config.detailFrames > config.thresholds.max_detail_frames
  ) {
    failures.push(`detail_frames=${config.detailFrames}`);
  }
  if (
    config.itemStaggerFrames < config.thresholds.min_item_stagger_frames ||
    config.itemStaggerFrames > config.thresholds.max_item_stagger_frames
  ) {
    failures.push(`item_stagger_frames=${config.itemStaggerFrames}`);
  }
  if (
    config.itemRevealFrames < config.thresholds.min_item_reveal_frames ||
    config.itemRevealFrames > config.thresholds.max_item_reveal_frames
  ) {
    failures.push(`item_reveal_frames=${config.itemRevealFrames}`);
  }
  if (minPanelOpacity < config.thresholds.min_panel_opacity) {
    failures.push(`min_panel_opacity=${minPanelOpacity.toFixed(4)}`);
  }
  if (maxPanelScale > config.thresholds.max_panel_scale) {
    failures.push(`max_panel_scale=${maxPanelScale.toFixed(4)}`);
  }
  if (maxTranslateX > config.thresholds.max_translate_px || maxTranslateY > config.thresholds.max_translate_px) {
    failures.push(`translate_xy=${maxTranslateX.toFixed(2)}/${maxTranslateY.toFixed(2)}`);
  }

  return {
    motionProfileId,
    motionPreset,
    passed: failures.length === 0,
    failures,
    config,
    observed: {
      minPanelOpacity,
      maxPanelScale,
      maxTranslateX,
      maxTranslateY
    }
  };
}

function main() {
  const repoRoot = resolveRepoRoot();
  const outputPath = path.join(repoRoot, "out", "motion_preset_benchmark.json");
  const motionProfileIds: ChannelVisualMotionProfileId[] = [...ALL_MOTION_PROFILE_IDS];
  const records = motionProfileIds.flatMap((motionProfileId) =>
    resolveMotionProfile(motionProfileId).benchmarked_motion_presets.map((motionPreset) =>
      runBenchmarkRecord(motionProfileId, motionPreset)
    )
  );
  const failed = records.filter((record) => !record.passed);
  const summary = {
    generated_at: new Date().toISOString(),
    record_count: records.length,
    failed_count: failed.length,
    profiles: motionProfileIds,
    records
  };

  writeJson(outputPath, summary);
  console.log(`motionPresetBenchmark output=${outputPath}`);
  console.log(`motionPresetBenchmark records=${records.length} failed=${failed.length}`);
  if (failed.length > 0) {
    throw new Error(
      `motion preset benchmark failed: ${failed
        .map((record) => `${record.motionProfileId}/${record.motionPreset}:${record.failures.join("|")}`)
        .join(", ")}`
    );
  }
}

main();
