import fs from "node:fs";
import path from "node:path";

const GENERATIVE_BROLL_MAX_FRAMES = 72;
const GENERATIVE_BROLL_ALLOWED_CAMERA_PRESETS = new Set(["static", "slow_push"]);

function parseArgs(argv) {
  const parsed = {};
  for (const entry of argv) {
    if (!entry.startsWith("--")) {
      continue;
    }
    const eq = entry.indexOf("=");
    if (eq === -1) {
      parsed[entry.slice(2)] = "true";
      continue;
    }
    parsed[entry.slice(2, eq)] = entry.slice(eq + 1);
  }
  return parsed;
}

function resolveInputPath(args) {
  const requested = typeof args.shots === "string" ? args.shots.trim() : "";
  if (requested.length > 0) {
    return path.resolve(requested);
  }
  return path.resolve("out", "shots.json");
}

function resolveOutputPath(inputPath, args) {
  const requested = typeof args.out === "string" ? args.out.trim() : "";
  if (requested.length > 0) {
    return path.resolve(requested);
  }
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.render_mode_report.json`);
}

function increment(counter, key) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function mapToSortedObject(counter) {
  return Object.fromEntries([...counter.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])));
}

function classifyShot(shot) {
  const shotId = typeof shot.shot_id === "string" ? shot.shot_id : "unknown";
  const shotType = typeof shot.shot_type === "string" ? shot.shot_type : null;
  const renderMode = typeof shot.render_mode === "string" ? shot.render_mode : null;
  const durationFrames =
    typeof shot.duration_frames === "number" && Number.isFinite(shot.duration_frames) ? shot.duration_frames : null;
  const cameraPreset = typeof shot?.camera?.preset === "string" ? shot.camera.preset : null;
  const hasChart = Boolean(shot.chart);
  const blockers = [];

  if (!shotType) {
    blockers.push("missing_shot_type");
  } else if (shotType !== "broll") {
    blockers.push(`shot_type:${shotType}`);
  }

  if (hasChart) {
    blockers.push("has_chart");
  }

  if (durationFrames == null) {
    blockers.push("missing_duration_frames");
  } else if (durationFrames > GENERATIVE_BROLL_MAX_FRAMES) {
    blockers.push(`duration_frames>${GENERATIVE_BROLL_MAX_FRAMES}`);
  }

  if (!cameraPreset) {
    blockers.push("missing_camera_preset");
  } else if (!GENERATIVE_BROLL_ALLOWED_CAMERA_PRESETS.has(cameraPreset)) {
    blockers.push(`camera_preset:${cameraPreset}`);
  }

  const recommendedRenderMode = blockers.length === 0 ? "generative_broll" : "deterministic";
  const eligibilityNote = blockers.length === 0 ? "eligible_for_generative_broll" : "blocked_from_generative_broll";
  const legacyShot = shotType == null || renderMode == null;

  return {
    shotId,
    shotType,
    storedRenderMode: renderMode,
    recommendedRenderMode,
    durationFrames,
    cameraPreset,
    hasChart,
    legacyShot,
    blockers,
    eligibilityNote,
    changeRequired: renderMode != null ? renderMode !== recommendedRenderMode : false,
    narration:
      typeof shot.narration === "string" && shot.narration.trim().length > 0 ? shot.narration.trim() : null
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = resolveInputPath(args);
  const outputPath = resolveOutputPath(inputPath, args);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Missing shots file: ${inputPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  if (!payload || !Array.isArray(payload.shots)) {
    throw new Error(`Invalid shots document: ${inputPath}`);
  }

  const analyses = payload.shots.map((shot) => classifyShot(shot));
  const byShotType = new Map();
  const byStoredRenderMode = new Map();
  const byRecommendedRenderMode = new Map();
  const blockerCounts = new Map();
  let legacyShots = 0;
  let mismatchedShots = 0;
  let recommendedGenerativeShots = 0;
  let storedGenerativeShots = 0;

  for (const analysis of analyses) {
    increment(byShotType, analysis.shotType ?? "missing");
    increment(byStoredRenderMode, analysis.storedRenderMode ?? "missing");
    increment(byRecommendedRenderMode, analysis.recommendedRenderMode);
    if (analysis.legacyShot) {
      legacyShots += 1;
    }
    if (analysis.changeRequired) {
      mismatchedShots += 1;
    }
    if (analysis.recommendedRenderMode === "generative_broll") {
      recommendedGenerativeShots += 1;
    }
    if (analysis.storedRenderMode === "generative_broll") {
      storedGenerativeShots += 1;
    }
    for (const blocker of analysis.blockers) {
      increment(blockerCounts, blocker);
    }
  }

  const report = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    input_path: inputPath,
    episode_id: typeof payload?.episode?.episode_id === "string" ? payload.episode.episode_id : null,
    policy: {
      generative_broll_max_frames: GENERATIVE_BROLL_MAX_FRAMES,
      allowed_camera_presets: [...GENERATIVE_BROLL_ALLOWED_CAMERA_PRESETS]
    },
    summary: {
      total_shots: analyses.length,
      stored_generative_broll_shots: storedGenerativeShots,
      recommended_generative_broll_shots: recommendedGenerativeShots,
      mismatched_stored_vs_recommended: mismatchedShots,
      legacy_shots_missing_policy_fields: legacyShots
    },
    breakdown: {
      by_shot_type: mapToSortedObject(byShotType),
      by_stored_render_mode: mapToSortedObject(byStoredRenderMode),
      by_recommended_render_mode: mapToSortedObject(byRecommendedRenderMode),
      blocker_counts: mapToSortedObject(blockerCounts)
    },
    eligible_shots: analyses
      .filter((analysis) => analysis.recommendedRenderMode === "generative_broll")
      .map((analysis) => ({
        shot_id: analysis.shotId,
        shot_type: analysis.shotType,
        duration_frames: analysis.durationFrames,
        camera_preset: analysis.cameraPreset,
        stored_render_mode: analysis.storedRenderMode
      })),
    mismatched_shots: analyses
      .filter((analysis) => analysis.changeRequired)
      .map((analysis) => ({
        shot_id: analysis.shotId,
        stored_render_mode: analysis.storedRenderMode,
        recommended_render_mode: analysis.recommendedRenderMode,
        blockers: analysis.blockers
      })),
    shots: analyses.map((analysis) => ({
      shot_id: analysis.shotId,
      shot_type: analysis.shotType,
      stored_render_mode: analysis.storedRenderMode,
      recommended_render_mode: analysis.recommendedRenderMode,
      duration_frames: analysis.durationFrames,
      camera_preset: analysis.cameraPreset,
      has_chart: analysis.hasChart,
      legacy_shot: analysis.legacyShot,
      change_required: analysis.changeRequired,
      blockers: analysis.blockers,
      eligibility_note: analysis.eligibilityNote,
      narration: analysis.narration
    }))
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `[report:shot-render-modes] shots=${report.summary.total_shots} storedGenerative=${report.summary.stored_generative_broll_shots} recommendedGenerative=${report.summary.recommended_generative_broll_shots} mismatched=${report.summary.mismatched_stored_vs_recommended} legacy=${report.summary.legacy_shots_missing_policy_fields}`
  );
  console.log(
    `[report:shot-render-modes] byShotType=${JSON.stringify(report.breakdown.by_shot_type)} byRecommended=${JSON.stringify(report.breakdown.by_recommended_render_mode)}`
  );
  console.log(
    `[report:shot-render-modes] blockers=${JSON.stringify(report.breakdown.blocker_counts)}`
  );
  console.log(`[report:shot-render-modes] wrote ${outputPath}`);
}

main();
