# Video B-Roll Wan Setup

This project now supports `generative_broll` shots through a local ComfyUI `Wan 2.2 TI2V 5B` sidecar executor.

## Current Local State

- local `.env` is set to `VIDEO_BROLL_RENDERER=comfyui-wan-i2v`
- required Wan model files are installed
- generated b-roll MP4 files are copied into `apps/video/public/sidecar_videos/...`
- Remotion uses those MP4 files when `sequence.renderMode === "generative_broll"`
- if sidecar rendering fails, the timeline falls back to deterministic rendering
- runtime now prefers `out/characters/<characterPackId>/assets/front.png` as the b-roll reference image
- the global `VIDEO_BROLL_REFERENCE_IMAGE` is now only a fallback

## Required Commands

```powershell
pnpm comfy:preflight:video
pnpm comfy:download:video-broll
pnpm smoke:video-broll
pnpm rollout:video-i2v-preset -- --character-pack-id=<approved-or-accepted-generated-pack-id>
pnpm rollout:video-i2v-multichannel -- --economy-character-pack-id=<economy-pack-id> --medical-character-pack-id=<medical-pack-id>
pnpm -C apps/worker run benchmark:video-i2v-multichannel -- --economy-character-pack-id=<economy-pack-id> --medical-character-pack-id=<medical-pack-id> --validate --require-ready --materialize-rollout
pnpm plan:video-i2v-preset-convergence
pnpm benchmark:motion-presets
pnpm validate:motion-preset-benchmark -- --require-ready
pnpm report:shot-render-modes -- --shots=scripts/fixtures/video_broll_smoke_shots.json
```

The rollout command now chains:

1. `pnpm smoke:docker`
2. `pnpm docker:up`
3. `pnpm db:migrate`
4. `pnpm benchmark:motion-presets`
5. `pnpm validate:motion-preset-benchmark -- --require-ready`
6. `pnpm comfy:preflight:video`
7. `pnpm -C apps/worker run benchmark:video-i2v-presets -- --promote-rollout ...`
8. `pnpm -C apps/worker run preflight:video-i2v-preset-rollout -- --require-ready`

If the pack id is an accepted generated pack that is present on disk but not yet registered in Postgres, the smoke/benchmark path now auto-registers it before preflight.

## Required Model Files

- `C:\models\diffusion_models\wan2.2_ti2v_5B_fp16.safetensors`
- `C:\models\text_encoders\umt5_xxl_fp8_e4m3fn_scaled.safetensors`
- `C:\models\vae\wan2.2_vae.safetensors`

Optional:

- `C:\models\clip_vision\clip_vision_h.safetensors`
- enable with `VIDEO_BROLL_WAN_USE_CLIP_VISION=true`

## Active Env Keys

```text
VIDEO_BROLL_RENDERER=comfyui-wan-i2v
VIDEO_BROLL_MODEL=wan2.2_ti2v_5B_fp16.safetensors
VIDEO_BROLL_WAN_MODEL=wan2.2_ti2v_5B_fp16.safetensors
VIDEO_BROLL_WAN_TEXT_ENCODER=umt5_xxl_fp8_e4m3fn_scaled.safetensors
VIDEO_BROLL_WAN_VAE=wan2.2_vae.safetensors
VIDEO_BROLL_WAN_SHIFT=5.0
VIDEO_BROLL_WAN_STEPS=24
VIDEO_BROLL_WAN_CFG=1.3
VIDEO_BROLL_WAN_SAMPLER=euler
VIDEO_BROLL_WAN_SCHEDULER=simple
VIDEO_BROLL_WAN_WIDTH=704
VIDEO_BROLL_WAN_HEIGHT=704
VIDEO_BROLL_WAN_FPS=16
VIDEO_BROLL_WAN_MAX_FRAMES=49
VIDEO_BROLL_REFERENCE_IMAGE=C:\Users\th011\eraser-cat-studio\refs\cat_quality_input\01_main_style\<your-main-style-image>.png
SMOKE_VIDEO_BROLL_CHARACTER_PACK_ID=<approved-or-accepted-generated-pack-id>
VIDEO_SIDECAR_PRESET_ROLLOUT_ENABLED=true
VIDEO_SIDECAR_PRESET_ROLLOUT_FILE_PATH=out\preset_benchmarks\video_i2v\runtime_sidecar_preset_rollout.json
VIDEO_SIDECAR_PRESET_MULTICHANNEL_ROLLOUT_FILE_PATH=out\multi_channel_benchmarks\video_i2v\runtime_sidecar_multichannel_rollout.json
VIDEO_SIDECAR_PRESET_ROLLOUT_TARGET=overall
VIDEO_SIDECAR_PRESET_ROLLOUT_MIN_SCORE=85
VIDEO_SIDECAR_PRESET_ROLLOUT_ALLOWED_VERDICTS=recommended
VIDEO_SIDECAR_PRESET_MULTICHANNEL_ECONOMY_MIN_SCORE=84
VIDEO_SIDECAR_PRESET_MULTICHANNEL_ECONOMY_ALLOWED_VERDICTS=recommended
VIDEO_SIDECAR_PRESET_MULTICHANNEL_MEDICAL_MIN_SCORE=80
VIDEO_SIDECAR_PRESET_MULTICHANNEL_MEDICAL_ALLOWED_VERDICTS=recommended,acceptable
VIDEO_SIDECAR_PRESET_ROLLOUT_MAX_AGE_HOURS=168
VIDEO_SIDECAR_PRESET_ROLLOUT_PRESERVE_CONTROLNET=true
VIDEO_SIDECAR_PRESET_ROLLOUT_REQUIRE_READY=true
VIDEO_MOTION_PRESET_BENCHMARK_ENABLED=true
VIDEO_MOTION_PRESET_BENCHMARK_FILE_PATH=out\motion_preset_benchmark.json
VIDEO_MOTION_PRESET_BENCHMARK_MAX_AGE_HOURS=168
VIDEO_MOTION_PRESET_BENCHMARK_REQUIRE_READY=true
```

## Smoke Coverage

`pnpm smoke:video-broll` validates this path:

1. enqueue a real worker render job
2. render one `generative_broll` shot through ComfyUI Wan
3. copy the sidecar MP4 into `apps/video/public/sidecar_videos/...`
4. render the final Remotion timeline
5. write:
   - `out/video_broll_smoke/render_episode.mp4`
   - `out/video_broll_smoke/shot_sidecar_plan.json`
   - `out/video_broll_smoke/smoke_report.json`
   - `out/video_broll_smoke/shot_render_mode_report.json`

## Shot Policy Report

Use this to inspect which shots are eligible for `generative_broll` under the current policy:

```powershell
pnpm report:shot-render-modes -- --shots=out/shots.json
```

The report writes `<shots-file>.render_mode_report.json` next to the input file and summarizes:

- stored `render_mode`
- current policy recommendation
- blockers such as `shot_type:talk`, `has_chart`, `duration_frames>72`, `camera_preset:whip_pan`

## Current Limitation

- runtime now resolves b-roll references from the approved character pack and can choose `front`, `threeQuarter`, or `profile`
- view choice is still rule-based, so the next step is better cue-driven selection and b-roll prompt tuning per shot family
- multi-channel rollout guardrails are now bundle-aware at runtime: `economy` uses `84 + recommended`, `medical` uses `80 + recommended|acceptable`
- current multichannel rollout is still blocked because `economy` stays below its own min score and the best triplet still diverges across channels
- use `pnpm plan:video-i2v-preset-convergence` to generate a shared shortlist before the next GPU rerun; it writes a `scenario-file` that both bundles can benchmark without rerunning the full matrix
- the existing benchmark/rollout wrappers now accept `--scenario-file=<path>`, so the generated shortlist can be passed straight into the next multichannel rerun
