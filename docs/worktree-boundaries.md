# Repo Worktree Boundaries

## Current Baseline Layout
- main working tree: `C:\Users\th011\eraser-cat-studio` on `main`
- API/UI ops: `C:\Users\th011\ecs-api-ops` on `api-ui-ops`
- story/render: `C:\Users\th011\ecs-story-render` on `story-render-pipeline`
- character generation: `C:\Users\th011\ecs-character-gen` on `character-generation-pipeline`
- sidecar rollout: `C:\Users\th011\ecs-sidecar-rollout` on `sidecar-rollout-lab`

All four side worktrees were created from commit `6cc4e9f`.

## Quick Start
```powershell
cd C:\Users\th011\ecs-api-ops
git status --short --branch

cd C:\Users\th011\ecs-story-render
git status --short --branch

cd C:\Users\th011\ecs-character-gen
git status --short --branch

cd C:\Users\th011\ecs-sidecar-rollout
git status --short --branch
```

## Topology
- `apps/api` is the user-facing and job-enqueue surface. It owns UI pages and character-generator routes, and it pulls in `@ec/image-gen`, `@ec/shared`, `@ec/publish`, and `@ec/analytics`.
- `apps/worker` is the actual pipeline hub. It drives beats, shots, render orchestration, audio, publish, sidecar rollout, and character asset jobs.
- `apps/video` is the Remotion render target. It is relatively isolated at the package level, but render-prop changes couple it back to `@ec/render-orchestrator`, `@ec/story`, and `@ec/profiles`.
- `packages/story`, `packages/render-orchestrator`, and `packages/profiles` form one render-contract cluster: story -> shots -> deterministic sequences -> Remotion props.
- `packages/image-gen` plus `workflows/comfy/**` and `refs/**` form a separate character-generation cluster.
- `packages/shared`, `packages/schemas`, and `packages/db` are repo-wide contracts. Changes here ripple into API, worker, and pipeline tests.

## Change-Together Clusters
### 1. Character generation
- Typical files:
  - `apps/api/src/routes/characterRoutes.ts`
  - `apps/api/src/routes/ui/pages/characterGeneratorPage.ts`
  - `apps/worker/src/characterGeneration.ts`
  - `packages/image-gen/src/generatedCharacterPipeline.ts`
  - `packages/image-gen/src/comfyuiProvider.ts`
  - `workflows/comfy/**`
  - `scripts/smokeCharacter.mjs`
- Keep these together because the API route, worker job, workflow templates, acceptance/QC, and smoke flow move as one feature.

### 2. Story/render contract
- Typical files:
  - `packages/story/src/compileShots.ts`
  - `packages/render-orchestrator/src/orchestrateRender.ts`
  - `packages/render-orchestrator/src/types.ts`
  - `apps/video/src/compositions/ShotEpisodeComposition.tsx`
  - `apps/video/src/Root.tsx`
  - `packages/profiles/src/motionProfiles.ts`
  - `packages/profiles/src/resolveProfiles.ts`
  - `apps/worker/src/index.ts`
- Keep these together because the worker builds beats/shots, the orchestrator turns them into render props, and the video app consumes the same contract.

### 3. Sidecar video rollout and backend benchmarking
- Typical files:
  - `apps/worker/src/benchmarkSidecarBackends.ts`
  - `apps/worker/src/benchmarkSidecarPresets.ts`
  - `apps/worker/src/sidecarPresetRollout.ts`
  - `apps/worker/src/validateSidecarPresetRollout.ts`
  - `packages/render-orchestrator/src/generatedSidecar.ts`
  - `packages/render-orchestrator/src/visualQc.ts`
  - `packages/profiles/src/index.ts`
  - `scripts/runVideoI2vPresetRollout.mjs`
  - `scripts/runVideoI2vMultiChannelRollout.mjs`
- Keep these together because rollout logic depends on worker execution, orchestrator sidecar plans, QC, and profile-driven preset metadata.

### 4. API/UI ops and smoke
- Typical files:
  - `apps/api/src/index.ts`
  - `apps/api/src/routes/uiRoutes.ts`
  - `apps/api/src/routes/ui/pages/*.ts`
  - `scripts/smokeUiRoutes.mjs`
  - `scripts/smokeUiVisualContract.mjs`
  - `.github/workflows/api-ui-resilience-smoke.yml`
  - `docs/ui-smoke-checklist.md`
- This cluster is safe to isolate when the change is operational, UI-contract, or resilience-oriented and does not alter pipeline contracts.

### 5. Shared contracts and infrastructure
- Typical files:
  - `packages/shared/src/queueContracts.ts`
  - `packages/shared/src/schemaValidator.ts`
  - `apps/worker/src/queue.ts`
  - `packages/schemas/*.schema.json`
  - `packages/db/prisma/schema.prisma`
  - `package.json`
  - `pnpm-lock.yaml`
  - `docker/docker-compose.yml`
- Do not split these changes across multiple worktrees. They change the contract surface for the whole repo.

## Practical Rules
- Use a dedicated feature worktree if you touch `packages/shared`, `packages/schemas`, `packages/db`, `package.json`, or `pnpm-lock.yaml`.
- Use a dedicated character-generation worktree if you touch `packages/image-gen`, `workflows/comfy`, or character-generator API routes.
- Use a story/render worktree if you touch `packages/story`, `packages/render-orchestrator`, `apps/video`, or `packages/profiles`.
- Use a sidecar-rollout worktree if the change is benchmark, preset rollout, multi-channel rollout, or Comfy video backend behavior.
- Use an API/UI ops worktree only for UI pages, smoke scripts, docs, and CI changes that do not alter worker/render contracts.
- `packages/audio` usually belongs with worker pipeline work, not with a pure video-composition worktree.
- `packages/script` is isolated enough for standalone script-template work, but if the output shape feeds story generation it should stay with the story/render worktree.

## Recommended Baseline Worktrees
- `ecs-api-ops`
  - Scope: `apps/api`, UI routes/pages, smoke scripts, docs, CI
- `ecs-story-render`
  - Scope: `apps/video`, `packages/story`, `packages/render-orchestrator`, `packages/profiles`
- `ecs-character-gen`
  - Scope: `packages/image-gen`, `apps/api` character-generator routes, `apps/worker/src/characterGeneration.ts`, `workflows/comfy`, `refs`, character smoke scripts
- `ecs-sidecar-rollout`
  - Scope: worker sidecar benchmarking/rollout, sidecar QC, rollout scripts, Comfy video preflight/bootstrap
- `ecs-infra-contracts`
  - Create only when needed for queue/schema/db/root-manifest changes

## Current Repo-Specific Advice
- The existing split in `docs/worktree-isolation-plan.md` is still valid for API resilience work.
- For general feature delivery in this repo, `API/UI/docs` as a permanent split is too narrow. The stronger boundaries are:
  - character generation
  - story/render contract
  - sidecar rollout
  - API/UI ops
  - shared contracts/infrastructure

## GPU Ownership Model
- `ecs-sidecar-rollout` is the only worktree that should own long Comfy-backed jobs.
- Use `ecs-sidecar-rollout` for:
  - `pnpm rollout:video-i2v-preset`
  - `pnpm rollout:video-i2v-multichannel`
  - `pnpm smoke:video-broll`
  - full image/video generation runs that can hold the GPU for hours
- Use `ecs-story-render` while those jobs are running for:
  - `apps/video`
  - `packages/story`
  - `packages/render-orchestrator`
  - `packages/profiles`
- Use `ecs-character-gen` while those jobs are running for:
  - prompt/workflow/template changes
  - `packages/image-gen`
  - `apps/worker/src/characterGeneration.ts`
  - `refs` and `workflows/comfy`
- Use `ecs-api-ops` for API/UI/docs/smoke/CI work that should not wait for GPU availability.
- Treat `main` as an integration lane, not a long-running benchmark lane.

## Daily Operating Rule
- One active long GPU job at a time.
- The active job lives in `ecs-sidecar-rollout`.
- Other worktrees stay focused on edit/review/test tasks that do not need to hold Comfy.
- If you need to touch `package.json`, `pnpm-lock.yaml`, `packages/shared`, `packages/schemas`, or `packages/db`, stop and move that change into a dedicated infra/contracts pass.

## Practical Command Flow
```powershell
cd C:\Users\th011\ecs-sidecar-rollout
pnpm worktree:status
pnpm rollout:video-i2v-multichannel -- --character-pack-id=<packId>

cd C:\Users\th011\ecs-story-render
git status --short --branch

cd C:\Users\th011\ecs-character-gen
git status --short --branch

cd C:\Users\th011\ecs-api-ops
git status --short --branch
```

The point is not to make generation faster. The point is to keep coding in parallel while the GPU runner stays busy in its own worktree.
