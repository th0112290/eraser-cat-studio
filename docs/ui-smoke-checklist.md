# UI Smoke Checklist

## Ticket Verification Commands
- Typecheck
  - `pnpm -C apps/api exec tsc -p tsconfig.json --noEmit`
  - `pnpm -C apps/worker exec tsc -p tsconfig.json --noEmit`
  - `pnpm -C apps/video exec tsc -p tsconfig.json --noEmit`
- UI fallback smoke helper: `pnpm -C apps/api run smoke:ui:fallback`
- UI route smoke (DB down): `pnpm smoke:ui:down`
- UI route smoke (DB up): `pnpm smoke:ui:up`

## Preconditions
- API server is running: `pnpm -C apps/api run dev`
- DB up mode requires infra up: `pnpm docker:up` then `pnpm db:migrate`

## Expected Results Matrix
| Route | DB Down | DB Up |
|---|---|---|
| `/ui/assets` | `503`, contains `database_unavailable` and `data-error-code="database_unavailable"` | `200`, contains `asset-upload-form` |
| `/ui/studio` | `503`, contains `database_unavailable` | `200`, contains `통합 스튜디오` |
| `/ui/character-generator` | `503`, contains `database_unavailable` | `200`, contains `character-generator` |

## Quick Troubleshooting
- Docker daemon down: run `pnpm smoke:docker` and follow fix hints.
- DB still down in up-mode smoke: check `pnpm db:status` and retry migrations.
- API not reachable: verify `http://127.0.0.1:3000/health` first.
