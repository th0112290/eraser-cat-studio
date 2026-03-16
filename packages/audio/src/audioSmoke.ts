import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LocalMockMusicLibrary } from "./mockMusicLibrary";
import { MockTTSProvider } from "./mockProvider";
import { runAudioPipeline } from "./pipeline";
import type { BeatCue, ShotCue } from "./types";

function resolvePaths() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");
  const fixtureDir = path.resolve(__dirname, "../fixtures");
  const outDir = path.join(repoRoot, "out", "audio-smoke");
  return {
    pronunciationPath: path.join(fixtureDir, "pronunciation.json"),
    outDir,
    assetDir: path.join(outDir, "assets")
  };
}

function sizeOf(filePath: string): number {
  return fs.statSync(filePath).size;
}

async function run(): Promise<void> {
  const paths = resolvePaths();
  const beats: BeatCue[] = [
    { id: "beat_001", startSec: 0, tags: ["hook", "emphasis:high"] },
    { id: "beat_002", startSec: 5, tags: ["development"] },
    { id: "beat_003", startSec: 10, tags: ["transition", "emphasis:high"] }
  ];
  const shots: ShotCue[] = [
    {
      id: "shot_001",
      startSec: 0,
      durationSec: 5,
      tags: ["energy:high"],
      text: "Open with the central claim and one practical context."
    },
    {
      id: "shot_002",
      startSec: 5,
      durationSec: 5,
      tags: ["chart"],
      text: "Move into evidence with clear language and short lines."
    }
  ];

  const scriptText = [
    "Open with the central claim and one practical context.",
    "Move into evidence with clear language and short lines.",
    "Close with a payoff and one concrete next action."
  ].join(" ");

  const pipelineDeps = {
    ttsProvider: new MockTTSProvider(paths.outDir),
    musicLibrary: new LocalMockMusicLibrary(paths.assetDir)
  };

  const first = await runAudioPipeline(pipelineDeps, {
    scriptText,
    voice: "mock-voice-smoke",
    speed: 1,
    beats,
    shots,
    pronunciationDictionaryPath: paths.pronunciationPath,
    outDir: paths.outDir
  });

  assert.ok(fs.existsSync(first.narrationPath));
  assert.ok(fs.existsSync(first.mixPath));
  assert.ok(fs.existsSync(first.licenseLogPath));
  assert.ok(fs.existsSync(first.alignmentPath));
  assert.equal(first.alignmentSourceKind, "heuristic");
  assert.equal(first.alignmentFallbackUsed, false);

  const firstNarrationSize = sizeOf(first.narrationPath);
  const firstMixSize = sizeOf(first.mixPath);
  assert.ok(firstNarrationSize > 44);
  assert.ok(firstMixSize > 44);

  const second = await runAudioPipeline(pipelineDeps, {
    scriptText,
    voice: "mock-voice-smoke",
    speed: 1,
    beats,
    shots,
    pronunciationDictionaryPath: paths.pronunciationPath,
    outDir: paths.outDir
  });

  assert.equal(firstNarrationSize, sizeOf(second.narrationPath));
  assert.equal(firstMixSize, sizeOf(second.mixPath));

  const licenseLog = JSON.parse(fs.readFileSync(second.licenseLogPath, "utf8")) as {
    entries: Array<{ assetType: string }>;
  };
  assert.ok(Array.isArray(licenseLog.entries));
  assert.ok(licenseLog.entries.length >= 2);

  const alignment = JSON.parse(fs.readFileSync(second.alignmentPath, "utf8")) as {
    shots?: Array<{ shotId?: string; visemeCues?: unknown[] }>;
  };
  assert.ok(Array.isArray(alignment.shots));
  assert.ok((alignment.shots?.[0]?.visemeCues?.length ?? 0) > 0);

  console.log("[audio] smoke passed");
}

void run();
