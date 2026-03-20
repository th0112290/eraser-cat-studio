import { buildBenchmarkRefreshActions, buildBenchmarkRefreshPlaybooksSection } from "./uiRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const stale = buildBenchmarkRefreshActions({
  staleSourceCount: 2,
  agingSourceCount: 1,
  packIds: ["pack-alpha", "pack-beta"]
});
assert(stale.length === 4, "expected four benchmark refresh actions");
assert(stale.every((entry) => entry.tone === "bad"), "expected stale refresh actions to use bad tone");
assert(stale.some((entry) => entry.command === "pnpm benchmark:motion-presets"), "missing motion preset refresh command");
assert(
  stale.some((entry) => entry.command === "pnpm rollout:video-i2v-preset -- --character-pack-id=pack-alpha"),
  "missing inferred preset rollout command"
);
assert(
  stale.some(
    (entry) =>
      entry.command ===
      "pnpm rollout:video-i2v-multichannel -- --economy-character-pack-id=pack-alpha --medical-character-pack-id=pack-beta"
  ),
  "missing multichannel rollout refresh command"
);

const agingOnly = buildBenchmarkRefreshActions({
  staleSourceCount: 0,
  agingSourceCount: 1,
  packIds: ["pack-solo"]
});
assert(agingOnly.every((entry) => entry.tone === "warn"), "expected aging refresh actions to use warn tone");
assert(
  agingOnly.some(
    (entry) =>
      entry.command === "pnpm rollout:video-i2v-multichannel -- --economy-character-pack-id=pack-solo --medical-character-pack-id=pack-solo"
  ),
  "expected solo pack to fill both multichannel placeholders"
);

const fresh = buildBenchmarkRefreshActions({
  staleSourceCount: 0,
  agingSourceCount: 0
});
assert(fresh.every((entry) => entry.tone === "muted"), "expected fresh refresh actions to use muted tone");

const section = buildBenchmarkRefreshPlaybooksSection({
  staleSourceCount: 2,
  agingSourceCount: 1,
  benchmarkRepairHref: "/ui/benchmarks/repair-acceptance",
  benchmarkRolloutsHref: "/ui/rollouts",
  actions: stale
});
assert(section.includes('id="benchmark-refresh-playbooks"'), "expected refresh playbooks anchor id");
assert(section.includes("Refresh Playbooks"), "expected refresh playbooks heading");
assert(section.includes("Acceptance"), "expected acceptance link");
assert(section.includes("Rollouts"), "expected rollouts link");
assert(section.includes("Copy command"), "expected copy-command affordance");
assert(
  section.includes("pnpm rollout:video-i2v-multichannel -- --economy-character-pack-id=pack-alpha --medical-character-pack-id=pack-beta"),
  "expected rendered section to preserve inferred multichannel command"
);

console.log("[ui-routes-benchmark-refresh-smoke] PASS");
