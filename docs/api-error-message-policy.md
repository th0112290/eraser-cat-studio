# API Error Message Policy

## Scope
- `apps/api`

## Rules
1. JSON error payloads are machine-friendly and include stable keys.
2. UI pages can be localized, but payload fragments inside fallback cards keep machine keys.
3. Infrastructure outage responses use HTTP `503`.
4. Every error response includes `requestId` for correlation.

## Standard 503 Payload Keys
- `error`
- `error_code`
- `dependency`
- `hint`
- `requestId`

## Current Mappings
- Redis unavailable
  - `error=Redis unavailable`
  - `error_code=redis_unavailable`
  - `dependency=redis`
  - `hint=Start Redis and retry.`
- Database unavailable
  - `error=Database unavailable`
  - `error_code=database_unavailable`
  - `dependency=postgresql`
  - `hint=Start PostgreSQL and retry.`

## Example Payloads
```json
{
  "error": "Redis unavailable",
  "error_code": "redis_unavailable",
  "dependency": "redis",
  "hint": "Start Redis and retry.",
  "requestId": "req_123"
}
```

```json
{
  "error": "Database unavailable",
  "error_code": "database_unavailable",
  "dependency": "postgresql",
  "hint": "Start PostgreSQL and retry.",
  "requestId": "req_456"
}
```

```json
{
  "error": "Not Found",
  "message": "Route GET /unknown not found",
  "requestId": "req_789"
}
```

```json
{
  "error": "Resource not found",
  "requestId": "req_abc"
}
```

```json
{
  "error": "Unique constraint violated",
  "requestId": "req_def"
}
```
