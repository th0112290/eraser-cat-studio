import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const homeDir = os.homedir();

const WORKTREES = [
  {
    name: "main",
    role: "integration / staging only",
    owner: "do not use for long GPU runs",
    path: repoRoot
  },
  {
    name: "ecs-sidecar-rollout",
    role: "GPU runner for Comfy / long video-image generation",
    owner: "exclusive owner of long GPU jobs",
    path: path.join(homeDir, "ecs-sidecar-rollout")
  },
  {
    name: "ecs-story-render",
    role: "story/render contract editing while GPU jobs run elsewhere",
    owner: "safe non-GPU edit worktree",
    path: path.join(homeDir, "ecs-story-render")
  },
  {
    name: "ecs-character-gen",
    role: "character generation logic / prompt / workflow editing",
    owner: "edit here, submit real generation from gpu-runner when needed",
    path: path.join(homeDir, "ecs-character-gen")
  },
  {
    name: "ecs-api-ops",
    role: "API/UI/docs/smoke/CI",
    owner: "safe non-GPU edit worktree",
    path: path.join(homeDir, "ecs-api-ops")
  }
];

function readGitStatus(worktreePath) {
  try {
    const output = execFileSync("git", ["-C", worktreePath, "status", "--short", "--branch"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }).trimEnd();
    const lines = output.split(/\r?\n/);
    const branchLine = lines[0] ?? "";
    const dirtyCount = Math.max(0, lines.length - 1);
    return {
      ok: true,
      branchLine,
      dirtyCount
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      branchLine: "",
      dirtyCount: 0
    };
  }
}

console.log("Worktree Roles");
console.log("");

for (const worktree of WORKTREES) {
  const exists = fs.existsSync(worktree.path);
  console.log(`- ${worktree.name}`);
  console.log(`  path: ${worktree.path}`);
  console.log(`  role: ${worktree.role}`);
  console.log(`  rule: ${worktree.owner}`);
  if (!exists) {
    console.log("  status: missing");
    console.log("");
    continue;
  }
  const status = readGitStatus(worktree.path);
  if (!status.ok) {
    console.log(`  status: unreadable (${status.error})`);
    console.log("");
    continue;
  }
  console.log(`  git: ${status.branchLine.replace(/^##\s*/, "")}`);
  console.log(`  dirty: ${status.dirtyCount}`);
  console.log("");
}

console.log("Recommended Flow");
console.log("");
console.log("- Run long Comfy / benchmark / rollout jobs only in ecs-sidecar-rollout.");
console.log("- While the GPU job is running, edit story/render in ecs-story-render.");
console.log("- Edit prompt/workflow/character logic in ecs-character-gen, then replay real generation from ecs-sidecar-rollout.");
console.log("- Keep API/UI/docs changes in ecs-api-ops.");
