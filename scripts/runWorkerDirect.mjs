import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const workerRoot = path.join(repoRoot, "apps", "worker");
const requireFromWorker = createRequire(path.join(workerRoot, "package.json"));
const dotenv = requireFromWorker("dotenv");
const envPath = path.join(repoRoot, ".env");
const assetMode = process.argv.includes("--asset");
const targetScript = assetMode
  ? path.join(workerRoot, "src", "assetWorker.ts")
  : path.join(workerRoot, "src", "dev.ts");
const tsxCli = path.join(path.dirname(requireFromWorker.resolve("tsx/package.json")), "dist", "cli.mjs");

dotenv.config({
  path: envPath,
  override: false
});

const child = spawn(
  process.execPath,
  [tsxCli, targetScript],
  {
    cwd: workerRoot,
    env: process.env,
    stdio: "inherit"
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
