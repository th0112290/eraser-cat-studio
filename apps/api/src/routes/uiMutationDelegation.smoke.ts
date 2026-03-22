import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function repoFile(...segments: string[]): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, ...segments);
}

function readFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function extractRouteBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `route marker not found: ${marker}`);
  const nextApp = source.indexOf("\n  app.", start + marker.length);
  return source.slice(start, nextApp === -1 ? undefined : nextApp);
}

function expectIncludes(block: string, needle: string, label: string): void {
  assert.ok(block.includes(needle), `[${label}] expected "${needle}" in route block`);
}

function expectExcludes(block: string, needle: string, label: string): void {
  assert.ok(!block.includes(needle), `[${label}] did not expect "${needle}" in route block`);
}

const uiRoutesSource = readFile(repoFile("uiRoutes.ts"));
const apiRoutesSource = readFile(repoFile("apiRoutes.ts"));
const agentServiceSource = readFile(repoFile("../services/agentService.ts"));

const uiExpectations = [
  {
    marker: 'app.post("/ui/actions/generate-preview"',
    include: "createEpisodeWithInitialJob(",
    label: "ui generate preview"
  },
  {
    marker: 'app.post("/ui/actions/generate-full"',
    include: "createEpisodeWithInitialJob(",
    label: "ui generate full"
  },
  {
    marker: 'app.post("/ui/episodes"',
    include: "createEpisodeWithInitialJob(",
    label: "ui episode create"
  },
  {
    marker: 'app.post("/api/episodes/:id/run-profile"',
    include: "runEpisodeProfile(",
    label: "ui api run-profile"
  },
  {
    marker: 'app.post("/ui/episodes/:id/run-profile"',
    include: "runEpisodeProfile(",
    label: "ui run-profile"
  },
  {
    marker: 'app.post("/ui/episodes/:id/style-preview"',
    include: "enqueueEpisodeJob(",
    label: "ui style preview"
  },
  {
    marker: 'app.post("/ui/episodes/:id/enqueue"',
    include: "enqueueEpisodeJob(",
    label: "ui enqueue"
  },
  {
    marker: 'app.post("/ui/jobs/:id/retry"',
    include: "retryEpisodeJob(",
    label: "ui job retry"
  },
  {
    marker: 'app.post("/ui/hitl/rerender"',
    include: "createHitlRerenderJob(",
    label: "ui hitl rerender"
  }
] as const;

for (const entry of uiExpectations) {
  const block = extractRouteBlock(uiRoutesSource, entry.marker);
  expectIncludes(block, entry.include, entry.label);
  expectExcludes(block, 'injectJson(app, "POST"', entry.label);
}

const apiHitlBlock = extractRouteBlock(apiRoutesSource, 'app.post("/api/hitl/rerender"');
expectIncludes(apiHitlBlock, "createHitlRerenderJob(", "api hitl rerender");
expectExcludes(apiHitlBlock, "app.inject(", "api hitl rerender");

const agentHitlBlock = extractRouteBlock(agentServiceSource, 'app.post("/hitl/rerender"');
expectIncludes(agentHitlBlock, "createHitlRerenderJob(", "agent hitl rerender");
expectExcludes(agentHitlBlock, "enqueueWithIdempotency(", "agent hitl rerender");

console.log("[ui-mutation-delegation-smoke] PASS");
