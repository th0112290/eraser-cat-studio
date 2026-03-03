# Local Dev Launcher (Windows)

## One command

```powershell
pnpm dev
```

What it does:
- checks Docker daemon with `docker version`
- runs `docker compose -f docker/docker-compose.yml up -d`
- waits for ports: `5432` (Postgres), `6379` (Redis), `9000` (MinIO optional)
- runs Prisma migrate: `pnpm db:migrate`
- starts API + Worker dev servers
- prints local URLs and opens `/hitl` on Windows (can disable with `DEV_OPEN_BROWSER=false`)

## One click (Windows)

Double-click:

```text
scripts\dev.cmd
```

It runs `pnpm dev` from repo root and keeps the terminal open after exit.

## Stop

1. Press `Ctrl+C` in the `pnpm dev` terminal
2. Bring containers down:

```powershell
pnpm dev:down
```

## URLs

- `http://localhost:3000/health`
- `http://localhost:3000/hitl`
- `http://localhost:3000/artifacts/`

## Troubleshooting

### Docker daemon not reachable

```powershell
docker version
```

If this fails:
- Start Docker Desktop
- Wait until engine is fully running
- Retry `pnpm dev`

### Port check

```powershell
Test-NetConnection 127.0.0.1 -Port 5432
Test-NetConnection 127.0.0.1 -Port 6379
Test-NetConnection 127.0.0.1 -Port 9000
```

### If API or worker exits

- check logs in the same terminal
- verify env values in repo root `.env`
- rerun:

```powershell
pnpm dev
```