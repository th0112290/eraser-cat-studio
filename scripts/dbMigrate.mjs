import { spawnSync } from "node:child_process";

const DEFAULT_DATABASE_URL = "postgresql://app:app@127.0.0.1:5432/eraser?schema=public";
const isCi = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
  console.warn("[db:migrate] DATABASE_URL is not set. Using default local postgres URL.");
}

const run = (args) => {
  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(`[db:migrate] Failed to run pnpm: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(["-C", "packages/db", isCi ? "migrate:deploy" : "migrate:dev"]);
run(["-C", "packages/db", "generate"]);
