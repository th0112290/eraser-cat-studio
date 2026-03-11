# Worktree Isolation Plan

## Goal
Keep high-churn render/output work separated from API stability changes.

## Current Layout
- main working tree: `C:\Users\th011\eraser-cat-studio` on `main`
- API resilience: `C:\Users\th011\ecs-api-resilience` on `api-resilience-core`
- UI smoke and CI: `C:\Users\th011\ecs-ui-smoke` on `api-ui-smoke-and-ci`
- docs and runbooks: `C:\Users\th011\ecs-docs` on `docs-and-runbooks`

All three side worktrees were created from commit `6cc4e9f`. The dirty changes in the main working tree stay only in `C:\Users\th011\eraser-cat-studio`.

## Branch/PR Split
1. PR-A `api-resilience-core`
- scope: `apps/api/src/index.ts`, `apps/api/src/routes/ui/*`, `apps/api/src/routes/apiRoutes.ts`, `apps/api/src/routes/characterRoutes.ts`
- focus: 503 contract, requestId, fallback consistency

2. PR-B `api-ui-smoke-and-ci`
- scope: `scripts/smokeUiRoutes.mjs`, `.github/workflows/api-ui-resilience-smoke.yml`, `package.json`
- focus: deterministic smoke in CI

3. PR-C `docs-and-runbooks`
- scope: `docs/ui-smoke-checklist.md`, `docs/api-error-message-policy.md`, `docs/release-notes-api-ui.md`
- focus: operator onboarding and incident response

## Worktree Commands
```powershell
git worktree add ..\ecs-api-resilience -b api-resilience-core
git worktree add ..\ecs-ui-smoke -b api-ui-smoke-and-ci
git worktree add ..\ecs-docs -b docs-and-runbooks
```

## Immediate Use
```powershell
cd C:\Users\th011\ecs-api-resilience
git status --short --branch

cd C:\Users\th011\ecs-ui-smoke
git status --short --branch

cd C:\Users\th011\ecs-docs
git status --short --branch
```

## Safety Rules
- Never run render smoke in API-resilience worktree.
- Keep `out/` artifacts out of PR-A/PR-B by default.
- Run `git status --short` before each commit to avoid cross-contamination.
