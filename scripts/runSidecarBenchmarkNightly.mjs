#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function resolveArgValue(name) {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (!entry) {
    return null;
  }
  const value = entry.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function resolveLocalPath(inputPath) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(repoRoot, inputPath);
}

function resolvePnpmExecutable() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function resolvePositiveNumber(value, fallback) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveWingetExecutable(executableName) {
  if (process.platform !== "win32") {
    return null;
  }
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (!localAppData) {
    return null;
  }
  const packagesRoot = path.join(localAppData, "Microsoft", "WinGet", "Packages");
  if (!fs.existsSync(packagesRoot)) {
    return null;
  }
  const packageDirs = fs
    .readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /ffmpeg/i.test(entry.name))
    .map((entry) => path.join(packagesRoot, entry.name));
  for (const packageDir of packageDirs) {
    const candidateDirs = fs
      .readdirSync(packageDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(packageDir, entry.name, "bin", executableName));
    for (const candidate of candidateDirs) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function resolveFfmpegCommand() {
  return (
    process.env.SIDECAR_FFMPEG_PATH?.trim() ||
    resolveWingetExecutable("ffmpeg.exe") ||
    "ffmpeg"
  );
}

function probeFfmpegAvailable(ffmpegCommand) {
  const result = spawnSync(ffmpegCommand, ["-version"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true
  });
  return !result.error && result.status === 0;
}

function resolveDefaultVideoPath() {
  const fixedCandidates = [
    path.join(repoRoot, "out", "render_episode.mp4"),
    path.join(repoRoot, "out", "preview.mp4")
  ];
  for (const candidate of fixedCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  const outRoot = path.join(repoRoot, "out");
  if (!fs.existsSync(outRoot)) {
    return null;
  }
  const fileCandidates = fs
    .readdirSync(outRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".mp4"))
    .map((entry) => path.join(outRoot, entry.name))
    .map((candidate) => ({
      path: candidate,
      mtimeMs: fs.statSync(candidate).mtimeMs
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return fileCandidates[0]?.path ?? null;
}

function prepareClipInput({ videoPath, outDir, clipSeconds, ffmpegCommand }) {
  if (!videoPath || clipSeconds <= 0) {
    return {
      benchmarkVideoPath: videoPath,
      benchmarkReferenceVideoPath: videoPath,
      clipPath: null,
      clipApplied: false
    };
  }
  if (!probeFfmpegAvailable(ffmpegCommand)) {
    return {
      benchmarkVideoPath: videoPath,
      benchmarkReferenceVideoPath: videoPath,
      clipPath: null,
      clipApplied: false
    };
  }
  fs.mkdirSync(outDir, { recursive: true });
  const clipPath = path.join(outDir, "nightly_input_clip.mp4");
  const result = spawnSync(
    ffmpegCommand,
    [
      "-y",
      "-ss",
      "0",
      "-t",
      String(clipSeconds),
      "-i",
      videoPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      clipPath
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      windowsHide: true
    }
  );
  if (result.error || result.status !== 0 || !fs.existsSync(clipPath)) {
    return {
      benchmarkVideoPath: videoPath,
      benchmarkReferenceVideoPath: videoPath,
      clipPath: null,
      clipApplied: false
    };
  }
  return {
    benchmarkVideoPath: clipPath,
    benchmarkReferenceVideoPath: clipPath,
    clipPath,
    clipApplied: true
  };
}

function timestampForPath(date = new Date()) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function printHelp() {
  console.log(`Usage:
  node scripts/runSidecarBenchmarkNightly.mjs [--episode-id=<id> | --video=<path>] [--image=<path>] [--reference-video=<path>] [--reference-image=<path>] [--preset=<id>] [--render-stage=<name>] [--out-dir=<path>] [--clip-seconds=<n> | --full-run] [--print-json]

Default:
  preset=nightly_quality
  render-stage=nightly
  video=out/render_episode.mp4 (fallback to latest top-level out/*.mp4)
  clip-seconds=5
  out-dir=out/nightly/sidecar-benchmark/<timestamp>
`);
}

async function main() {
  if (hasFlag("help")) {
    printHelp();
    return;
  }

  const outDir = resolveLocalPath(
    resolveArgValue("out-dir") ??
      path.join("out", "nightly", "sidecar-benchmark", timestampForPath())
  );
  const presetId = resolveArgValue("preset") ?? "nightly_quality";
  const renderStage = resolveArgValue("render-stage") ?? "nightly";
  const fullRun = hasFlag("full-run");
  const clipSeconds = fullRun
    ? 0
    : resolvePositiveNumber(
        resolveArgValue("clip-seconds") ?? process.env.SIDECAR_BENCHMARK_NIGHTLY_CLIP_SECONDS,
        5
      );
  const explicitVideo = resolveArgValue("video");
  const explicitReferenceVideo = resolveArgValue("reference-video");
  const imagePath = resolveArgValue("image");
  const referenceImagePath = resolveArgValue("reference-image");
  const resolvedVideoPath = explicitVideo
    ? resolveLocalPath(explicitVideo)
    : imagePath
      ? null
      : resolveDefaultVideoPath();
  const resolvedReferenceVideoPath = explicitReferenceVideo
    ? resolveLocalPath(explicitReferenceVideo)
    : resolvedVideoPath;
  const clipInput =
    resolvedVideoPath && !imagePath
      ? prepareClipInput({
          videoPath: resolvedVideoPath,
          outDir,
          clipSeconds,
          ffmpegCommand: resolveFfmpegCommand()
        })
      : {
          benchmarkVideoPath: resolvedVideoPath,
          benchmarkReferenceVideoPath: resolvedReferenceVideoPath,
          clipPath: null,
          clipApplied: false
        };
  const benchmarkVideoPath = clipInput.benchmarkVideoPath;
  const benchmarkReferenceVideoPath =
    explicitReferenceVideo && resolvedReferenceVideoPath
      ? resolvedReferenceVideoPath
      : clipInput.benchmarkReferenceVideoPath;
  if (!resolveArgValue("episode-id") && !benchmarkVideoPath && !imagePath) {
    throw new Error(
      "No input media found. Pass --video/--image/--episode-id or keep out/render_episode.mp4 available."
    );
  }
  const workerArgs = [
    "-C",
    path.join(repoRoot, "apps", "worker"),
    "exec",
    "tsx",
    "src/benchmarkSidecarBackends.ts",
    `--preset=${presetId}`,
    `--render-stage=${renderStage}`,
    `--out-dir=${outDir}`
  ];

  for (const [name, value] of [
    ["episode-id", resolveArgValue("episode-id")],
    ["video", benchmarkVideoPath],
    ["image", imagePath],
    ["reference-video", benchmarkReferenceVideoPath],
    ["reference-image", referenceImagePath]
  ]) {
    if (value) {
      workerArgs.push(
        name === "episode-id" ? `--${name}=${value}` : `--${name}=${resolveLocalPath(value)}`
      );
    }
  }

  if (hasFlag("print-json")) {
    workerArgs.push("--print-json");
  }

  const result = spawnSync(resolvePnpmExecutable(), workerArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    env: process.env
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`runSidecarBenchmarkNightly failed with exit=${result.status ?? "unknown"}`);
  }

  if (clipInput.clipApplied) {
    console.log(`NIGHTLY SIDECAR BENCHMARK CLIP: ${clipInput.clipPath}`);
  }
  console.log(`NIGHTLY SIDECAR BENCHMARK OUT: ${outDir}`);
}

main().catch((error) => {
  console.error(
    `runSidecarBenchmarkNightly FAIL: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
