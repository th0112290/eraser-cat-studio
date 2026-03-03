# Docker Troubleshooting (Windows + PowerShell)

If `pnpm docker:up` fails with an error like:

`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified`

it means Docker Desktop daemon is not running.

## 1) Start Docker Desktop

1. Open Docker Desktop from Start menu.
2. Wait until the status shows Docker is running.
3. If prompted, finish WSL integration setup.

## 2) Verify Docker daemon

Run:

```powershell
docker version
```

Expected:

- Client and Server sections are both printed.
- No daemon connection error.

You can also run the project preflight:

```powershell
pnpm smoke:docker
```

## 3) Start project infra

Run:

```powershell
pnpm docker:up
```

This starts Postgres, Redis, and MinIO using:

`docker/docker-compose.yml`

## 4) Continue app startup

After Docker is healthy:

```powershell
pnpm db:migrate
pnpm -C apps/api run dev
pnpm -C apps/worker run dev
```
