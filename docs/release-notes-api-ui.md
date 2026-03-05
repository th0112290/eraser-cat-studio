# Release Notes (API/UI Routes)

## Included Commits
- `6e93c8d` chore(api-ui): unify korean UI copy for asset and character generator routes
- `9fbb379` fix(api-ui): return 503 fallback pages when database is unavailable

## Highlights
- Korean-first UI labels for `/ui/assets` and `/ui/character-generator`
- DB outage no longer crashes these pages with 500; now returns explicit 503 fallback UI
- Redis/DB outage responses include structured hints (`error_code`, `dependency`, `hint`)

## Operational Note
- For complete UI smoke (200 path), start dependencies first:
  - `pnpm docker:up`
