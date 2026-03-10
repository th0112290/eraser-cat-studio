# GPU Runner Ops

## Scope Split
- `ecs-sidecar-rollout` owns GPU benchmark freeze, benchmark execution, and long-running ComfyUI usage.
- `ecs-api-ops` owns the operator-facing control surface: `/ui/rollouts`, `/ui/benchmarks`, `/ui/profiles`, `/ui/characters`, smoke coverage, and runbooks.
- Do not rerun sidecar benchmark jobs, Comfy generation, or character-generation freeze work from `ecs-api-ops`.

## While The GPU Runner Is Busy
1. Use `/ui/rollouts` to check the current verdict (`ready`, `blocked`, `below_min_score`, `divergence`) and open the raw artifact when needed.
2. Use `/ui/benchmarks` to inspect backend score deltas, regression bundles, and candidate compare drilldowns.
3. Use `/ui/profiles` to verify which `studio/channel/mascot` profile bundle the runtime evidence resolved to.
4. Use `/ui/characters` to inspect generated pack lineage, repair tasks, and current rollback/compare state without touching the GPU owner workflow.

## Safe Operator Actions
- Update SSR UI panels, smoke scripts, CI diagnostics, and runbooks in `ecs-api-ops`.
- Read artifact JSON and generated media under `out/` to explain status to operators.
- Capture HTML snapshots with `pnpm smoke:ui:capture` while the API is running.

## Actions To Avoid
- Restarting or freezing a benchmark from the wrong worktree.
- Launching a second sidecar benchmark while `ecs-sidecar-rollout` already owns the GPU.
- Editing story/render core or character-generation core from this worktree.

## If GPU Occupancy Does Not Drop
1. Confirm whether a rollout script and ComfyUI are still alive before blaming the UI layer.
2. Stop the rollout owner first, then stop the managed ComfyUI process unless that run intentionally used `--keep-comfy-running`.
3. After GPU load falls, refresh `/ui/rollouts` and `/ui/benchmarks` to confirm the last written artifacts are stable.
