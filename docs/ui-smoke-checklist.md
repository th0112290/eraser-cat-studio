# UI Smoke Checklist

## Preconditions
- API server is running (`pnpm -C apps/api run dev`)
- For full-data mode: PostgreSQL and Redis are up (`pnpm docker:up`)

## Pages
1. `/ui/assets`
2. `/ui/studio`
3. `/ui/character-generator`

## DB Down Mode Expected
- All pages return `503`
- Page includes `database_unavailable`
- Page includes recovery hint (`pnpm docker:up`)

## DB Up Mode Expected
- All pages return `200`
- `/ui/assets` shows localized labels (`선택된 에셋`, `정규화 1024`)
- `/ui/studio` shows `자동 새로고침`
- `/ui/character-generator` shows localized flow labels and status polling text

## Command
- DB down smoke: `node scripts/smokeUiRoutes.mjs`
- DB up smoke: `set SMOKE_DB_MODE=up && node scripts/smokeUiRoutes.mjs`
