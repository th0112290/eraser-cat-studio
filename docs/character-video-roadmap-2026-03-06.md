# Character + Video Roadmap (2026-03-06)

## Current Status

- mascot family generation is running on real ComfyUI
- species path is wired for `cat`, `dog`, `wolf`
- front-first generation is active
- front master pool is active with `frontMasterCandidateCount = 6`
- queue smoke passed again for `cat`, `dog`, `wolf`
- shot planner and render pipeline already carry `shot_type` and `render_mode`
- sidecar plan manifests already exist for future generative video shots
- side starters are now wired for `cat`, `dog`, `wolf`
- starter-driven side views now bypass human OpenPose guides
- sidecar renderer now emits request-pack artifacts for `generative_broll`
- sidecar renderer now has a real `comfyui-wan-i2v` executor path with video preflight/download scaffolding
- generated Wan sidecar MP4 files are now copied into `apps/video/public/sidecar_videos/...`
- Remotion now consumes `sidecarVideoSrc` for `generative_broll` shots
- worker queue smoke now proves `ComfyUI Wan -> sidecar mp4 -> Remotion timeline` end to end
- channel-aware motion tuning is done for the current economy / medical split
- motion preset benchmark + threshold hardening now run across `profiles -> story -> render-orchestrator -> video`

## Motion Policy Checks

Commands:
- `pnpm benchmark:motion-presets`
- `pnpm validate:motion-preset-benchmark`
- `pnpm smoke:motion-policy`

Artifacts:
- `out/motion_preset_benchmark.json`
- `out/motion_preset_benchmark.validation_report.json`

What is covered:
- benchmarked motion preset lists live in `packages/profiles`
- `packages/story` hardens emitted motion presets to benchmarked combinations
- `packages/render-orchestrator` QC rejects unbenchmarked motion preset/profile pairs
- `apps/video` clamps timing / translate / scale behavior to benchmark thresholds
- `apps/worker` validates benchmark artifact freshness and completeness at startup

## Real Benchmark Freeze (2026-03-10)

- full Comfy-backed `economy` / `medical` preset matrices now exist under `out/multi_channel_benchmarks/video_i2v`
- multichannel rollout artifact can be materialized, but current validation is still blocked by benchmark policy
- economy best is `pose_depth_balance_v1 / broadcast_cleanup_v1 / broadcast_balanced_v1` at `82.34` with verdict `acceptable`
- medical best is `profile_lineart_depth_v1 / soft_clarity_cleanup_v1 / broadcast_balanced_v1` at `81.42` with verdict `acceptable`
- current multichannel comparison is `major` divergence on `controlnet + impact`
- runtime rollout policy is now bundle-aware: `economy` preflight uses `84 + recommended`, `medical` uses `80 + recommended|acceptable`
- current rollout preflight still fails with `below_min_score` because economy does not clear its own min score `84`
- convergence shortlist generation now exists, so the next tuning loop can benchmark a shared scenario-file before rerunning the full multichannel matrix
- next work is not executor wiring; it is benchmark policy tuning for economy score lift and medical triplet convergence

## Remaining Stages

### Stage 1. Dog Front Aesthetic Tuning

Status:
- done

Goal:
- raise `dog front` from "usable but weak" to stable mascot quality

Main files:
- [characterGeneration.ts](/C:/Users/th011/eraser-cat-studio/apps/worker/src/characterGeneration.ts)
- [prompt.ts](/C:/Users/th011/eraser-cat-studio/packages/image-gen/src/prompt.ts)
- [species.ts](/C:/Users/th011/eraser-cat-studio/packages/image-gen/src/species.ts)

Tasks:
- add dog-front-specific scoring and penalties
- tighten front facial symmetry and muzzle shape rules
- reduce false positives from line-art mascot outputs

Exit criteria:
- `dog front` best score consistently clears `0.56`
- no mock fallback
- full smoke still passes

### Stage 2. Species Threshold Lock

Status:
- functionally done for `cat` usable v1
- still worth tightening explicit empirical thresholds in manifests

Goal:
- stop treating `cat`, `dog`, `wolf` as if they have the same acceptance policy

Main files:
- [characterGeneration.ts](/C:/Users/th011/eraser-cat-studio/apps/worker/src/characterGeneration.ts)
- [prompt.ts](/C:/Users/th011/eraser-cat-studio/packages/image-gen/src/prompt.ts)

Tasks:
- define per-species accepted score
- define per-species auto-retry policy
- define per-species warning tolerance

Exit criteria:
- thresholds are explicit in code
- thresholds are written into manifest/provider metadata

### Stage 3. Character QC + Observability Finish

Status:
- mostly done on QC side
- progress visibility can still improve

Goal:
- make failures explainable and production-friendly

Main files:
- [characterGeneration.ts](/C:/Users/th011/eraser-cat-studio/apps/worker/src/characterGeneration.ts)
- [characterRoutes.ts](/C:/Users/th011/eraser-cat-studio/apps/api/src/routes/characterRoutes.ts)
- [smokeCharacter.mjs](/C:/Users/th011/eraser-cat-studio/scripts/smokeCharacter.mjs)

Tasks:
- finalize paw/front-face failure codes
- expose threshold/fallback/front-master details in UI and logs
- improve generate progress visibility during long Comfy runs

Exit criteria:
- generation runs show where time is being spent
- rejected outputs explain why they failed

### Stage 4. Mascot Family Regression Pass

Status:
- done for latest real smoke baseline

Goal:
- prove `cat`, `dog`, `wolf` all survive the same production flow

Main files:
- [smokeMascotFamily.mjs](/C:/Users/th011/eraser-cat-studio/scripts/smokeMascotFamily.mjs)
- [package.json](/C:/Users/th011/eraser-cat-studio/package.json)

Tasks:
- rerun full smoke for all species
- record expected score floor and failure conditions
- freeze a usable v1 baseline

Exit criteria:
- all three species pass full smoke on real ComfyUI
- baseline scores and warnings are documented

### Stage 5. Gen Broll Executor

Goal:
- move `generative_broll` from "planned" to "actually rendered"

Status:
- done

Main files:
- [index.ts](/C:/Users/th011/eraser-cat-studio/apps/worker/src/index.ts)
- [orchestrateRender.ts](/C:/Users/th011/eraser-cat-studio/packages/render-orchestrator/src/orchestrateRender.ts)
- [types.ts](/C:/Users/th011/eraser-cat-studio/packages/render-orchestrator/src/types.ts)

Tasks:
- done: emit per-shot request json + prompt artifacts from worker sidecar renderer
- done: pass `fps / width / height / attempt / maxAttempts` into sidecar renderer
- done: connect worker sidecar renderer to actual Wan model calls
- done: return `publicVideoSrc` metadata for timeline consumption

Exit criteria:
- at least one `generative_broll` shot renders a real artifact

### Stage 6. Fallback + Cache + Routing

Goal:
- make video model use operationally safe

Status:
- mostly done

Main files:
- [orchestrateRender.ts](/C:/Users/th011/eraser-cat-studio/packages/render-orchestrator/src/orchestrateRender.ts)
- [compileShots.ts](/C:/Users/th011/eraser-cat-studio/packages/story/src/compileShots.ts)
- [index.ts](/C:/Users/th011/eraser-cat-studio/apps/worker/src/index.ts)

Tasks:
- add cache key policy for generated shots
- add deterministic fallback on sidecar failure
- lock `render_mode` policy by shot type

Exit criteria:
- generative failure no longer breaks preview/final render

### Stage 7. Timeline Insertion + First Video Model Integration

Goal:
- actually use generated b-roll inside the timeline

Status:
- done for first local Wan integration

Main files:
- [ShotEpisodeComposition.tsx](/C:/Users/th011/eraser-cat-studio/apps/video/src/compositions/ShotEpisodeComposition.tsx)
- [Root.tsx](/C:/Users/th011/eraser-cat-studio/apps/video/src/Root.tsx)
- [orchestrateRender.ts](/C:/Users/th011/eraser-cat-studio/packages/render-orchestrator/src/orchestrateRender.ts)

Tasks:
- done: `sequence.renderMode === "generative_broll"` uses external shot assets
- done: deterministic layers remain as fallback
- done: first fixed executor is `comfyui-wan-i2v`

Recommended first target:
- `Wan 2.2 TI2V-5B` or equivalent short b-roll model

Exit criteria:
- one preview render contains real generated b-roll in the final timeline

## Effort Estimate

- Stage 1 to 4: character usable v1 finish
- Stage 5 to 7: first video-model integration

Rough grouping:
- character usable v1: 3 to 4 focused work blocks
- first video-model integration: 3 focused work blocks

## Recommended Execution Order

1. Stage 1
2. Stage 2
3. Stage 3
4. Stage 4
5. Stage 5
6. Stage 6
7. Stage 7

## Practical Interpretation

- character system is in late-stage tuning, not early-stage wiring
- first video-model integration is complete
- the next real bottleneck is runtime rollout policy for motion quality and character-aware reference selection, not executor wiring
