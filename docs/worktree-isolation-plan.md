# Worktree Isolation Plan

## Goal
Keep high-churn render/output work separated from API stability changes.

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

## Safety Rules
- Never run render smoke in API-resilience worktree.
- Keep `out/` artifacts out of PR-A/PR-B by default.
- Run `git status --short` before each commit to avoid cross-contamination.
