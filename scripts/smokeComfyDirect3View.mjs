import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["-C", "apps/worker", "run", "smoke:comfy-3view-direct"],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env
  }
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
