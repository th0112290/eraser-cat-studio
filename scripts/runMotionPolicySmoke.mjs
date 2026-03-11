import { spawnSync } from "node:child_process";

const STEPS = [
  {
    label: "story shots smoke",
    command: "pnpm",
    args: ["-C", "packages/story", "run", "shots:smoke"]
  },
  {
    label: "render visual-plan smoke",
    command: "pnpm",
    args: ["-C", "packages/render-orchestrator", "run", "render:smoke:visual-plan"]
  },
  {
    label: "video motion preset benchmark",
    command: "pnpm",
    args: ["-C", "apps/video", "run", "benchmark:motion-presets"]
  },
  {
    label: "worker motion preset validation",
    command: "pnpm",
    args: ["-C", "apps/worker", "run", "validate:motion-preset-benchmark", "--", "--require-ready"]
  },
  {
    label: "video qc smoke",
    command: "pnpm",
    args: ["-C", "apps/video", "run", "qc:smoke"]
  }
];

for (const step of STEPS) {
  console.log(`[motion-policy] ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    throw result.error;
  }
}

console.log("[motion-policy] completed");
