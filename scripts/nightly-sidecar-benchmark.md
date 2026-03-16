# Sidecar Benchmark Nightly

## Entrypoints

- Nightly wrapper:
  `node scripts/runSidecarBenchmarkNightly.mjs`
- Ad hoc video benchmark:
  `node scripts/runSidecarBenchmarkNightly.mjs --video=out/render_episode.mp4 --reference-video=out/render_episode.mp4`
- Windows Scheduled Task wrapper:
  `powershell -ExecutionPolicy Bypass -File scripts/runSidecarBenchmarkScheduledTask.ps1`
- Scheduled Task registration helper:
  `powershell -ExecutionPolicy Bypass -File scripts/registerSidecarBenchmarkScheduledTask.ps1 -DryRun`
- Worker resident wrapper:
  `powershell -ExecutionPolicy Bypass -File scripts/runWorkerScheduledTask.ps1`
- Worker resident task registration helper:
  `powershell -ExecutionPolicy Bypass -File scripts/registerWorkerScheduledTask.ps1 -TaskName EcsWorkerResident`

Default nightly behavior:

- if no `--episode-id`, `--video`, or `--image` is provided, the wrapper prefers `out/render_episode.mp4`, then `out/preview.mp4`, then the newest top-level `out/*.mp4`
- default run mode is a 5-second canary clip cut from the chosen video
- pass `--full-run` or `-FullRun` to benchmark the full video instead of the canary clip

## Worker CLI

- Direct worker entrypoint:
  `pnpm -C apps/worker exec tsx src/benchmarkSidecarBackends.ts --preset=nightly_quality --episode-id=<episodeId> --render-stage=nightly`
- Preset catalog export:
  `pnpm -C apps/worker exec tsx src/benchmarkSidecarPresets.ts --out=out/sidecar_benchmark/preset_catalog.json`
- Scheduled Task registration helper:
  `powershell -ExecutionPolicy Bypass -File scripts/registerSidecarBenchmarkScheduledTask.ps1 -TaskName EcsSidecarBenchmarkNightly -DailyAt 02:30`

## Worker Resident Task

- Registered task name:
  `EcsWorkerResident`
- Current registration mode:
  `AtStartup` + `AtLogOn`
- Current logon mode:
  `Interactive/Background`
- Resident worker log:
  `out/worker/worker-scheduled-task.log`
- Manual trigger:
  `schtasks /Run /TN EcsWorkerResident`
- Query status:
  `schtasks /Query /TN EcsWorkerResident /V /FO LIST`

Current-account constraint:

- `scripts/registerWorkerScheduledTask.ps1` defaults to `AtLogOn` so it can be registered without elevation.
- If you want startup + background mode from an elevated shell, use:
  `powershell -ExecutionPolicy Bypass -File scripts/registerWorkerScheduledTask.ps1 -TaskName EcsWorkerResident -IncludeStartup -RunWithoutLogon -Force`
- Windows Service registration via `sc.exe` still requires a separate elevated service setup and was not used here.

## Presets

- `preview_fast`
  - poster extraction + image IQA only
- `final_quality`
  - video upscale + image upscale + VMAF/CAMBI/image IQA
- `nightly_quality`
  - frame interpolation + video upscale + image upscale + VMAF/CAMBI/image IQA

## Generated Artifacts

Within the selected output directory:

- `sidecar_benchmark_manifest.json`
  - full stage trace, tooling probe, objective metric summary, final output pointers
- `sidecar_benchmark_summary.json`
  - compact nightly summary with metric scores and stage status
- `nightly_sidecar_benchmark.env`
  - exported env lines for downstream automation
- `sidecar_benchmark_preset_catalog.json`
  - materialized preset catalog used for the run
- `artifacts/*.mp4`
  - frame interpolation and video upscale outputs when ffmpeg is available
- `artifacts/*.png` / `artifacts/*.jpg`
  - extracted poster frame and image upscale outputs
- `artifacts/objective_metrics_libvmaf.json`
  - combined VMAF/CAMBI log when ffmpeg `libvmaf` is available
- `artifacts/image_iqa_report.json`
  - heuristic image IQA report for the benchmark image
- `scheduled-task.log`
  - only when launched through `runSidecarBenchmarkScheduledTask.ps1`
- `nightly_input_clip.mp4`
  - only when nightly wrapper uses canary clip mode

## Publish Behavior

- Worker `RENDER_FINAL` post-processing writes artifacts to:
  `out/<episodeId>/sidecar_benchmark/render_final/`
- `PACKAGE_OUTPUTS` prefers the sidecar post-processed final video when
  `sidecar_benchmark_manifest.json.final_outputs.video_path` exists.
- If sidecar post-processing fails or is unavailable, publish falls back to the original `final.mp4` / `preview.mp4`.

## Environment Toggles

- `SIDECAR_BENCHMARK_ENABLED`
  - enable post-processing for final render stages, default `true`
- `SIDECAR_BENCHMARK_ENABLE_PREVIEW`
  - enable preview-stage benchmark, default `false`
- `SIDECAR_BENCHMARK_PRESET`
  - force a single preset for all render stages
- `SIDECAR_BENCHMARK_PRESET_FINAL`
  - override final-stage preset, default `final_quality`
- `SIDECAR_BENCHMARK_PRESET_PREVIEW`
  - override preview-stage preset, default `preview_fast`
- `SIDECAR_BENCHMARK_STRICT`
  - fail the render job if sidecar post-processing errors
- `SIDECAR_FFMPEG_PATH`
  - override ffmpeg executable path; if unset, worker tries PATH and Windows winget FFmpeg installs
- `SIDECAR_FFPROBE_PATH`
  - override ffprobe executable path; if unset, worker tries PATH and Windows winget FFmpeg installs
- `SIDECAR_FRAME_INTERPOLATION_TARGET_FPS`
  - override interpolation fps
- `SIDECAR_VIDEO_UPSCALE_FACTOR`
  - override video upscale factor
- `SIDECAR_IMAGE_UPSCALE_FACTOR`
  - override image upscale factor
- `SIDECAR_BENCHMARK_NIGHTLY_CLIP_SECONDS`
  - override nightly canary clip duration used by `runSidecarBenchmarkNightly.mjs`
- `SIDECAR_ENABLE_VMAF`
  - enable or disable VMAF collection
- `SIDECAR_ENABLE_CAMBI`
  - enable or disable CAMBI collection
- `SIDECAR_ENABLE_IMAGE_IQA`
  - enable or disable image IQA collection
