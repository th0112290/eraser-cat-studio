# Release Notes: API/UI Resilience Pack

## Summary
This pack hardens API/UI behavior when Postgres/Redis/MinIO are unavailable and adds reproducible smoke checks.

## Included
- Shared DB outage fallback renderer with machine marker: `data-error-code="database_unavailable"`
- UI fallback pages include structured payload fragment (`error_code`, `dependency`, `hint`, `requestId`)
- Global API error payloads now include `requestId`
- `/404` responses now include `requestId`
- New root scripts
  - `pnpm smoke:ui`
  - `pnpm smoke:ui:down`
  - `pnpm smoke:ui:up`
  - `pnpm db:status`
- Updated UI smoke script with request-id/header checks
- CI workflow for API/UI resilience smoke
- Docs expanded for runbook + payload examples

## Operational Impact
- Easier production triage via `requestId`
- Better fallback determinism under dependency outage
- CI catches regressions in DB-down and DB-up UI routes
