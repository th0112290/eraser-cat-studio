import { bootstrapEnv } from "./bootstrapEnv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectRuntimeSidecarPresetRollout,
  type SidecarPresetRolloutInspection
} from "./sidecarPresetRollout";
import type { SidecarControlNetPresetId, SidecarImpactPresetId, SidecarQcPresetId } from "@ec/profiles";

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

function resolveLocalPath(repoRoot: string, inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function asControlnetPreset(value: string | null): SidecarControlNetPresetId {
  return value === "pose_canny_balance_v1" || value === "profile_lineart_depth_v1"
    ? value
    : "pose_depth_balance_v1";
}

function asImpactPreset(value: string | null): SidecarImpactPresetId {
  return value === "identity_repair_detail_v1" ||
    value === "soft_clarity_cleanup_v1" ||
    value === "soft_clarity_repair_v1"
    ? value
    : "broadcast_cleanup_v1";
}

function asQcPreset(value: string | null): SidecarQcPresetId {
  return value === "broadcast_identity_strict_v1" ? value : "broadcast_balanced_v1";
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildInspectionReport(inspection: SidecarPresetRolloutInspection, input: {
  controlnetPreset: SidecarControlNetPresetId;
  impactPreset: SidecarImpactPresetId;
  qcPreset: SidecarQcPresetId;
  renderMode: string;
  shotType: string;
  cameraPreset: string;
}) {
  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    input,
    rollout_enabled: inspection.enabled,
    status: inspection.status,
    reason: inspection.reason,
    requested_target: inspection.requestedTarget,
    resolved_target: inspection.resolvedTarget,
    rollout_source_path: inspection.rolloutSourcePath,
    rollout_source_kind: inspection.rolloutSourceKind,
    artifact_age_hours: inspection.artifactAgeHours,
    min_score: inspection.minScore,
    max_age_hours: inspection.maxAgeHours,
    allowed_verdicts: inspection.allowedVerdicts,
    preserve_controlnet: inspection.preserveControlnet,
    must_preserve_controlnet: inspection.mustPreserveControlnet,
    current_presets: inspection.currentPresets,
    candidate: inspection.candidate,
    next_presets: inspection.nextPresets,
    applied_resolution: inspection.resolution
  };
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const controlnetPreset = asControlnetPreset(resolveArgValue("controlnet-preset"));
  const impactPreset = asImpactPreset(resolveArgValue("impact-preset"));
  const qcPreset = asQcPreset(resolveArgValue("qc-preset"));
  const renderMode = resolveArgValue("render-mode") ?? "generative_broll";
  const shotType = resolveArgValue("shot-type") ?? "broll";
  const cameraPreset = resolveArgValue("camera-preset") ?? "medium";
  const outPath = resolveArgValue("out") ? resolveLocalPath(repoRoot, resolveArgValue("out") as string) : null;

  const inspection = inspectRuntimeSidecarPresetRollout({
    repoRoot,
    controlnetPreset,
    impactPreset,
    qcPreset,
    renderMode,
    shotType,
    cameraPreset,
    policyTags: []
  });
  const report = buildInspectionReport(inspection, {
    controlnetPreset,
    impactPreset,
    qcPreset,
    renderMode,
    shotType,
    cameraPreset
  });

  if (outPath) {
    writeJson(outPath, report);
  }

  console.log(`SIDECAR ROLLOUT STATUS: ${inspection.status}`);
  console.log(`SIDECAR ROLLOUT REASON: ${inspection.reason}`);
  if (inspection.rolloutSourcePath) {
    console.log(`SIDECAR ROLLOUT SOURCE: ${inspection.rolloutSourcePath}`);
  }
  if (outPath) {
    console.log(`SIDECAR ROLLOUT REPORT: ${outPath}`);
  }
}

main().catch((error) => {
  console.error(`inspectSidecarPresetRollout FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
