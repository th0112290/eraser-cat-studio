import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LocalMockMusicLibrary } from "./mockMusicLibrary";
import { MockTTSProvider } from "./mockProvider";
import { loadFixtureJson, runAudioPipeline } from "./pipeline";
import type { BeatCue, ShotCue } from "./types";

function resolvePaths() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");
  const fixtureDir = path.resolve(__dirname, "../fixtures");
  const outDir = path.join(repoRoot, "out", "audio");

  return {
    scriptPath: path.join(fixtureDir, "demo-script.txt"),
    beatsPath: path.join(fixtureDir, "demo-beats.json"),
    shotsPath: path.join(fixtureDir, "demo-shots.json"),
    pronunciationPath: path.join(fixtureDir, "pronunciation.json"),
    outDir,
    assetDir: path.join(outDir, "assets")
  };
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

async function main(): Promise<void> {
  const paths = resolvePaths();
  const scriptText = readText(paths.scriptPath);
  const beats = loadFixtureJson<BeatCue[]>(paths.beatsPath);
  const shots = loadFixtureJson<ShotCue[]>(paths.shotsPath);

  const ttsProvider = new MockTTSProvider(paths.outDir);
  const musicLibrary = new LocalMockMusicLibrary(paths.assetDir);

  const result = await runAudioPipeline(
    {
      ttsProvider,
      musicLibrary
    },
    {
      scriptText,
      voice: "mock-voice-a",
      speed: 1,
      beats,
      shots,
      pronunciationDictionaryPath: paths.pronunciationPath,
      outDir: paths.outDir
    }
  );

  console.log(`audio:demo narration=${result.narrationPath}`);
  console.log(`audio:demo mix=${result.mixPath}`);
  console.log(`audio:demo alignment=${result.alignmentPath}`);
  console.log(`audio:demo license_log=${result.licenseLogPath}`);
  console.log(`audio:demo sfx_events=${result.placementPlan.sfxEvents.length}`);
}

void main();
