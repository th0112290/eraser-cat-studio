import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MAX_ATTEMPTS = Number.parseInt(process.env.DB_MIGRATE_DEPLOY_MAX_ATTEMPTS ?? "20", 10);
const RETRY_DELAY_MS = Number.parseInt(process.env.DB_MIGRATE_DEPLOY_RETRY_DELAY_MS ?? "2000", 10);
const MAX_GENERATE_ATTEMPTS = Number.parseInt(process.env.DB_PRISMA_GENERATE_MAX_ATTEMPTS ?? "5", 10);
const GENERATE_RETRY_DELAY_MS = Number.parseInt(process.env.DB_PRISMA_GENERATE_RETRY_DELAY_MS ?? "1000", 10);

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

function isPrismaEngineRenameLockError(output) {
  return output.includes("EPERM: operation not permitted, rename") && output.includes("query-engine-windows.exe");
}

function resolveRepoRoot() {
  return path.resolve(process.cwd(), "../..");
}

function hasExistingPrismaClientArtifacts() {
  const pnpmRoot = path.join(resolveRepoRoot(), "node_modules", ".pnpm");
  if (!fs.existsSync(pnpmRoot)) {
    return false;
  }
  const prismaClientDirs = fs
    .readdirSync(pnpmRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"))
    .map((entry) => path.join(pnpmRoot, entry.name, "node_modules", ".prisma", "client"));
  return prismaClientDirs.some((clientDir) => {
    if (!fs.existsSync(clientDir)) {
      return false;
    }
    return (
      fs.existsSync(path.join(clientDir, "index.js")) &&
      fs.existsSync(path.join(clientDir, "default.js")) &&
      fs.existsSync(path.join(clientDir, "query-engine-windows.exe"))
    );
  });
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
  for (let attempt = 1; attempt <= MAX_GENERATE_ATTEMPTS; attempt += 1) {
    const generate = run("pnpm", ["exec", "dotenv", "-e", "../../.env", "-o", "--", "prisma", "generate"]);
    printOutput(generate.stdout);
    if (generate.status === 0) {
      return;
    }
    const combined = `${generate.stdout}\n${generate.stderr}`;
    const existingArtifacts = hasExistingPrismaClientArtifacts();
    if (isPrismaEngineRenameLockError(combined) && existingArtifacts) {
      printOutput(generate.stderr);
      process.stdout.write(
        "[db:migrate] prisma generate hit a Windows query-engine rename lock, but an existing Prisma client artifact is present. continuing with the existing client.\n"
      );
      return;
    }
    if (attempt < MAX_GENERATE_ATTEMPTS && isPrismaEngineRenameLockError(combined)) {
      printOutput(generate.stderr);
      process.stdout.write(
        `[db:migrate] prisma generate hit a Windows query-engine rename lock (attempt ${attempt}/${MAX_GENERATE_ATTEMPTS}). retrying in ${GENERATE_RETRY_DELAY_MS}ms...\n`
      );
      await sleep(GENERATE_RETRY_DELAY_MS);
      continue;
    }
    printOutput(generate.stderr);
    process.exit(generate.status);
  }
}

await main();
