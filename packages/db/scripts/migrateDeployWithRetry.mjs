import { spawnSync } from "node:child_process";

const MAX_ATTEMPTS = Number.parseInt(process.env.DB_MIGRATE_DEPLOY_MAX_ATTEMPTS ?? "20", 10);
const RETRY_DELAY_MS = Number.parseInt(process.env.DB_MIGRATE_DEPLOY_RETRY_DELAY_MS ?? "2000", 10);

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDbNotReadyError(output) {
  return output.includes("P1001") || output.includes("Can't reach database server");
}

function printOutput(output) {
  if (!output) return;
  process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
}

async function migrateDeployWithRetry() {
  const migrateArgs = ["exec", "dotenv", "-e", "../../.env", "-o", "--", "prisma", "migrate", "deploy"];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = run("pnpm", migrateArgs);
    const combined = `${result.stdout}\n${result.stderr}`;

    if (result.status === 0) {
      printOutput(result.stdout);
      return;
    }

    const retryable = isDbNotReadyError(combined);
    if (!retryable || attempt === MAX_ATTEMPTS) {
      printOutput(result.stdout);
      printOutput(result.stderr);
      process.exit(result.status);
    }

    process.stdout.write(
      `[db:migrate] database not ready yet (attempt ${attempt}/${MAX_ATTEMPTS}). retrying in ${RETRY_DELAY_MS}ms...\n`
    );
    await sleep(RETRY_DELAY_MS);
  }
}

async function main() {
  await migrateDeployWithRetry();
  const generate = run("pnpm", ["exec", "dotenv", "-e", "../../.env", "-o", "--", "prisma", "generate"]);
  printOutput(generate.stdout);
  if (generate.status !== 0) {
    printOutput(generate.stderr);
    process.exit(generate.status);
  }
}

await main();
