# API Error Message Policy

## Scope
- `apps/api`

## Rules
1. API JSON error payloads use English error text.
2. UI route pages use Korean user-facing guidance.
3. Infrastructure outages return `503` with a machine-friendly code.

## Standard 503 Payload Keys
- `error`
- `error_code`
- `dependency`
- `hint`

## Current Mappings
- Redis unavailable:
  - `error_code=redis_unavailable`
  - `dependency=redis`
- Database unavailable:
  - `error_code=database_unavailable`
  - `dependency=postgresql`
