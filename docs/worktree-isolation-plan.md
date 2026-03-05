# Worktree Isolation Plan

## Problem
- Repository currently has many unrelated modified/untracked files.
- Small API route changes are easy to mix into unrelated commits.

## Plan
1. Keep route-only changes in dedicated commits.
2. Stage by explicit paths only (no global `git add .`).
3. Run minimal verification before commit:
   - `pnpm -C apps/api exec tsc -p tsconfig.json --noEmit`
4. Run cross-app guard check before handoff:
   - `pnpm -C apps/worker exec tsc -p tsconfig.json --noEmit`
   - `pnpm -C apps/video exec tsc -p tsconfig.json --noEmit`
5. Use smoke scripts for runtime validation:
   - `node scripts/smokeUiRoutes.mjs`

## Recommended Commit Boundaries
- UI copy changes
- Outage/fallback behavior changes
- Docs and smoke script additions
