# Branch Protection: Smoke Checks

## Goal
- Require smoke checks to pass before merge into `main`.
- Keep required checks aligned with current workflows.

## Required Workflows
1. API UI resilience smoke
- Workflow file: `.github/workflows/api-ui-resilience-smoke.yml`
- Workflow name: `API UI Resilience Smoke`
- Job id: `api-ui-resilience`
- Typical check label in branch protection:
  - `API UI Resilience Smoke / api-ui-resilience`

2. Character strict smoke
- Workflow file: `.github/workflows/character-strict-smoke.yml`
- Workflow name: `Character Strict Smoke`
- Job id: `smoke-character-strict`
- Typical check label in branch protection:
  - `Character Strict Smoke / smoke-character-strict`

3. E2E manifest selftest
- Workflow file: `.github/workflows/e2e-manifest-selftest.yml`
- Workflow name: `E2E Manifest Selftest`
- Job id: `manifest-selftest`
- Typical check label in branch protection:
  - `E2E Manifest Selftest / manifest-selftest`

## Setup (GitHub UI)
1. Go to `Settings -> Branches`.
2. Create or edit the rule for `main`.
3. Enable `Require a pull request before merging`.
4. Enable `Require status checks to pass before merging`.
5. Add all required checks:
- `API UI Resilience Smoke / api-ui-resilience`
- `Character Strict Smoke / smoke-character-strict`
- `E2E Manifest Selftest / manifest-selftest`
6. Save changes.

## Capture Exact Check Names From PR
Use this when check labels differ by repo settings.

1. Set env vars (or use `gh` auto-detect):
- `GITHUB_TOKEN` (repo read permission)
- `GITHUB_REPOSITORY` (example: `owner/repo`)
- `PR_NUMBER` (example: `123`)
2. Run:
- `pnpm ci:checks:capture -- --json --save --web`
- Strict fail mode (exit 1 when any required check is missing):
  - `pnpm ci:checks:verify -- --json --save --web`
3. Open `out/pr-checks.json` and check `checkNames`.
4. Check `requiredCheckCoverage`:
- `matched: true` for both required targets.
- If any target is missing, run the workflow once on PR and re-run capture.
5. Register exact labels for:
- api ui resilience smoke
- character strict smoke
- e2e manifest selftest

## Verification
1. Open a PR that touches:
- `scripts/smokeCharacter.mjs` (strict smoke)
- `scripts/smokeE2E.mjs` (manifest selftest)
2. Confirm all three workflows run.
3. Confirm merge is blocked when any required check fails.
4. Confirm merge becomes available when all required checks pass.

## Troubleshooting
- Check not listed in branch protection:
  - Ensure that workflow/job has run at least once on PR.
- Auto-detect failed in `ci:checks:capture`:
  - Run `gh auth login`, then retry on a PR branch.
- Flaky smoke failure:
  - Inspect Actions logs/artifacts for API and worker errors first.
