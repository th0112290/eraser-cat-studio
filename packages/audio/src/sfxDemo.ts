import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAutoSfxPlacements } from "./sfx/autoPlace";
import { makeBeep, makeClick, makePop, makeWhoosh } from "./sfx/procedural";
import { resolveProceduralSfxSpec } from "./sfx/select";
import { normalizeFloatSamples, overlaySamples, writeMonoWav } from "./wav";
import type { BeatCue, ShotCue } from "./types";

const SAMPLE_RATE = 44100;

function resolveRepoRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildDemoCues(): { beats: BeatCue[]; shots: ShotCue[] } {
  const beats: BeatCue[] = [
    { id: "beat_001", startSec: 0.0, tags: ["hook", "emphasis:high"] },
    { id: "beat_002", startSec: 1.8, tags: ["development"] },
    { id: "beat_003", startSec: 3.4, tags: ["warning", "emphasis:high"] },
    { id: "beat_004", startSec: 5.0, tags: ["payoff"] }
  ];

  const shots: ShotCue[] = [
    { id: "shot_001", startSec: 0, durationSec: 2.2, tags: ["transition", "chart"] },
    { id: "shot_002", startSec: 2.2, durationSec: 2.2, tags: ["highlight", "countup"] },
    { id: "shot_003", startSec: 4.4, durationSec: 1.8, tags: ["transition", "warning"] }
  ];

  return { beats, shots };
}

function generateSfxSamples(events: ReturnType<typeof buildAutoSfxPlacements>) {
  const last = events.reduce((max, event) => Math.max(max, event.timeSec), 0);
  const totalDurationSec = Math.max(4, last + 1.2);
  const out = new Float32Array(Math.ceil(totalDurationSec * SAMPLE_RATE));
  const licenseEntries: Array<{ id: string; path: string; usedAtSec: number[]; license: { licenseId: string; attribution: string; source: string; usage: string } }> = [];

  const usageMap = new Map<string, number[]>();

  for (const event of events) {
    const spec = resolveProceduralSfxSpec(event);
    const wav =
      spec.kind === "whoosh"
        ? makeWhoosh(spec.durationMs)
        : spec.kind === "pop"
          ? makePop(spec.durationMs)
          : spec.kind === "click"
            ? makeClick(spec.durationMs)
            : makeBeep(spec.beepFreqHz ?? 780, spec.durationMs);

    const id = `procedural_${spec.kind}_${Math.round(spec.durationMs)}ms${
      spec.beepFreqHz ? `_f${Math.round(spec.beepFreqHz)}` : ""
    }`;

    const usedAt = usageMap.get(id) ?? [];
    usedAt.push(event.timeSec);
    usageMap.set(id, usedAt);

    const start = Math.floor(event.timeSec * SAMPLE_RATE);
    overlaySamples(out, wav.samples, start, spec.gain);
  }

  for (const [id, usedAtSec] of usageMap.entries()) {
    licenseEntries.push({
      id,
      path: `procedural://sfx/${id}.wav`,
      usedAtSec,
      license: {
        licenseId: "PROCEDURAL-GENERATED",
        attribution: "procedurally generated",
        source: "local://procedural-sfx",
        usage: "procedurally generated assets for local render and tests"
      }
    });
  }

  return {
    samples: normalizeFloatSamples(out, 0.9),
    licenseEntries
  };
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot();
  const outDir = path.join(repoRoot, "out");
  ensureDir(outDir);

  const { beats, shots } = buildDemoCues();
  const events = buildAutoSfxPlacements(beats, shots);
  const rendered = generateSfxSamples(events);

  const wavPath = path.join(outDir, "sfx-demo.wav");
  writeMonoWav(wavPath, {
    sampleRate: SAMPLE_RATE,
    samples: rendered.samples
  });

  const licensePath = path.join(outDir, "sfx-demo-license_log.json");
  fs.writeFileSync(
    licensePath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "procedurally generated",
        entries: rendered.licenseEntries
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(`sfx:demo mix=${wavPath}`);
  console.log(`sfx:demo license_log=${licensePath}`);
  console.log(`sfx:demo events=${events.length}`);
}

void main();
