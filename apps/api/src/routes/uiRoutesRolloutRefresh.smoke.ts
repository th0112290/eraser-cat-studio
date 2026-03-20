import { buildRolloutRefreshPlaybooksSection } from "./uiRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const section = buildRolloutRefreshPlaybooksSection({
  staleSourceCount: 1,
  agingSourceCount: 1,
  benchmarkRepairHref: "/ui/benchmarks/repair-acceptance",
  currentRolloutsHref: "/ui/rollouts"
});

assert(section.includes('id="benchmark-refresh-playbooks"'), "expected rollout refresh anchor id");
assert(section.includes("Refresh Playbooks"), "expected rollout refresh heading");
assert(section.includes('href="/ui/benchmarks/repair-acceptance"'), "expected acceptance handoff link");
assert(section.includes('href="/ui/rollouts"'), "expected rollout return link");
assert(section.includes("pnpm smoke:motion-policy"), "expected motion policy smoke command");
assert(
  section.includes("pnpm rollout:video-i2v-multichannel -- --economy-character-pack-id=&lt;packId&gt; --medical-character-pack-id=&lt;packId&gt;"),
  "expected rollout refresh section to preserve multichannel placeholders"
);
assert(
  section.includes("already runs motion benchmark and require-ready validation"),
  "expected rollout refresh hints to mention built-in validation"
);

console.log("[ui-routes-rollout-refresh-smoke] PASS");
