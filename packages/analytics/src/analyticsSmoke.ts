import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeDropoffs, buildRepurposePlan, buildRetentionCurve } from "./index";
import { saveDropoffAnalysis, saveRepurposePlan, saveRetentionCurve } from "./storage";
import type { RetentionPoint, ShotTiming } from "./types";

function resolveOutputRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../../out/analytics");
}

async function main() {
  const episodeId = "episode_analytics_smoke";

  const points: RetentionPoint[] = [
    { timeSec: 0, retentionPct: 100 },
    { timeSec: 15, retentionPct: 95 },
    { timeSec: 30, retentionPct: 87 },
    { timeSec: 45, retentionPct: 80 },
    { timeSec: 60, retentionPct: 79 },
    { timeSec: 90, retentionPct: 70 },
    { timeSec: 120, retentionPct: 66 },
    { timeSec: 150, retentionPct: 52 },
    { timeSec: 180, retentionPct: 51 }
  ];

  const shotTimings: ShotTiming[] = [
    { shotId: "shot_1", startSec: 0, endSec: 30, beatIds: ["b1"] },
    { shotId: "shot_2", startSec: 30, endSec: 60, beatIds: ["b2"] },
    { shotId: "shot_3", startSec: 60, endSec: 90, beatIds: ["b3"] },
    { shotId: "shot_4", startSec: 90, endSec: 120, beatIds: ["b4"] },
    { shotId: "shot_5", startSec: 120, endSec: 150, beatIds: ["b5"] },
    { shotId: "shot_6", startSec: 150, endSec: 180, beatIds: ["b6"] }
  ];

  const curve = buildRetentionCurve({
    episodeId,
    points,
    source: "smoke"
  });

  const analysis = analyzeDropoffs(curve, shotTimings, {
    minDropPct: 6,
    mergeGapSec: 6
  });

  const plan = buildRepurposePlan({
    episodeId,
    topic: "Analytics smoke topic",
    analysis
  });

  const outputRoot = resolveOutputRoot();

  const retentionPath = saveRetentionCurve(outputRoot, curve);
  const dropoffPath = saveDropoffAnalysis(outputRoot, analysis);
  const repurposePath = saveRepurposePlan(outputRoot, plan);

  console.log(`analytics:retention ${retentionPath}`);
  console.log(`analytics:dropoffs ${dropoffPath}`);
  console.log(`analytics:repurpose ${repurposePath}`);
  console.log(`analytics:segments ${analysis.segments.length}`);
  console.log(`analytics:shorts ${plan.shorts.length}`);
  console.log(`analytics:translation_tasks ${plan.translationTasks.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
