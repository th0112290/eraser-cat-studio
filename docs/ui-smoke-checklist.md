# UI Smoke Checklist

## Ticket Verification Commands
- Typecheck
  - `pnpm -C apps/api exec tsc -p tsconfig.json --noEmit`
  - `pnpm -C apps/worker exec tsc -p tsconfig.json --noEmit`
  - `pnpm -C apps/video exec tsc -p tsconfig.json --noEmit`
- UI fallback smoke helper: `pnpm -C apps/api run smoke:ui:fallback`
- UI route smoke (DB down): `pnpm smoke:ui:down`
- UI route smoke (DB up): `pnpm smoke:ui:up`
- UI visual contract smoke: `pnpm smoke:ui:visual`
- UI snapshot capture: `pnpm smoke:ui:capture`

## Preconditions
- API server is running: `pnpm -C apps/api run dev`
- DB up mode requires infra up: `pnpm docker:up` then `pnpm db:migrate`
- Snapshot capture reads the same live server as the smoke suite and writes artifacts to `out/ui_smoke_snapshots/<label>/`

## Expected Results Matrix
| Route | DB Down | DB Up |
|---|---|---|
| `/ui/rollouts` | `200`, contains `Rollouts` | `200`, contains `Rollouts` |
| `/ui/benchmarks` | `200`, contains `Benchmarks` | `200`, contains `Benchmarks` |
| `/ui/profiles` | `200`, contains `Profile Browser` | `200`, contains `Profile Browser` |
| `/ui/assets` | `503`, contains `database_unavailable` and `data-error-code="database_unavailable"` | `200`, contains `asset-upload-form` |
| `/ui/studio` | `503`, contains `database_unavailable` | `200`, contains `통합 스튜디오` |
| `/ui/character-generator` | `503`, contains `database_unavailable` | `200`, contains `character-generator` |

## Snapshot Coverage
- Core console pages: `/ui`, `/ui/assets`, `/ui/studio`, `/ui/character-generator`, `/ui/characters`, `/ui/episodes`, `/ui/jobs`, `/ui/hitl`, `/ui/publish`, `/ui/health`, `/ui/artifacts`
- Ops pages: `/ui/rollouts`, `/ui/benchmarks`, `/ui/profiles`
- Focused profile views: `/ui/profiles?q=economy_channel`, `/ui/profiles?q=medical_channel`
- When available, the capture script also records the first discovered episode detail, job detail, and sidecar candidate compare page

## CI Artifacts
- `api-ui-resilience-smoke.yml` uploads `out/ui_smoke_snapshots/db-up/**` and `out/ui_smoke_snapshots/db-down/**`
- Use `manifest.json` in each snapshot folder to see status, response headers, and saved file names before opening raw HTML

## Quick Troubleshooting
- Docker daemon down: run `pnpm smoke:docker` and follow fix hints.
- DB still down in up-mode smoke: check `pnpm db:status` and retry migrations.
- API not reachable: verify `http://127.0.0.1:3000/health` first.
- Rollout or benchmark pages look empty: confirm the relevant `out/` artifacts exist before treating it as a UI regression.
- Snapshot capture shows fetch failures: inspect `api.log` and the per-label `manifest.json` first.
