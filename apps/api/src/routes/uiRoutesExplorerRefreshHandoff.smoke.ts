import { buildCompactRefreshPlaybookHandoff } from "./uiRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const placeholderHandoff = buildCompactRefreshPlaybookHandoff({
  staleSourceCount: 1,
  agingSourceCount: 0,
  unknownCount: 0,
  benchmarkRepairHref: "/ui/benchmarks/repair-acceptance",
  benchmarkRolloutsHref: "/ui/rollouts"
});

assert(placeholderHandoff.includes("Refresh handoff"), "expected refresh handoff label");
assert(placeholderHandoff.includes('id="benchmark-refresh-playbooks"'), "expected playbook anchor");
assert(placeholderHandoff.includes('href="/ui/benchmarks/repair-acceptance"'), "expected acceptance handoff link");
assert(placeholderHandoff.includes('href="/ui/rollouts"'), "expected rollout handoff link");
assert(placeholderHandoff.includes("pnpm smoke:motion-policy"), "expected motion policy command");
assert(
  placeholderHandoff.includes("&lt;packId&gt;"),
  "expected placeholder handoff to keep pack placeholders escaped"
);

const inferredHandoff = buildCompactRefreshPlaybookHandoff({
  staleSourceCount: 0,
  agingSourceCount: 1,
  unknownCount: 0,
  benchmarkRepairHref: "/ui/benchmarks/repair-acceptance",
  benchmarkRolloutsHref: "/ui/rollouts",
  packIds: ["pack-alpha", "pack-beta"]
});

assert(
  inferredHandoff.includes("pnpm rollout:video-i2v-preset -- --character-pack-id=pack-alpha"),
  "expected inferred preset rollout command"
);
assert(
  inferredHandoff.includes("pnpm rollout:video-i2v-multichannel -- --economy-character-pack-id=pack-alpha --medical-character-pack-id=pack-beta"),
  "expected inferred multichannel rollout command"
);
assert(
  inferredHandoff.includes("already runs motion benchmark and require-ready validation"),
  "expected built-in validation hint"
);

console.log("[ui-routes-explorer-refresh-handoff-smoke] PASS");
