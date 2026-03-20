import { buildBenchmarkRefreshActions } from "./uiRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const stale = buildBenchmarkRefreshActions({
  staleSourceCount: 2,
  agingSourceCount: 1
});
assert(stale.length === 4, "expected four benchmark refresh actions");
assert(stale.every((entry) => entry.tone === "bad"), "expected stale refresh actions to use bad tone");
assert(stale.some((entry) => entry.command === "pnpm benchmark:motion-presets"), "missing motion preset refresh command");
assert(
  stale.some(
    (entry) =>
      entry.command ===
      "pnpm rollout:video-i2v-multichannel -- --economy-character-pack-id=<packId> --medical-character-pack-id=<packId>"
  ),
  "missing multichannel rollout refresh command"
);

const agingOnly = buildBenchmarkRefreshActions({
  staleSourceCount: 0,
  agingSourceCount: 1
});
assert(agingOnly.every((entry) => entry.tone === "warn"), "expected aging refresh actions to use warn tone");

const fresh = buildBenchmarkRefreshActions({
  staleSourceCount: 0,
  agingSourceCount: 0
});
assert(fresh.every((entry) => entry.tone === "muted"), "expected fresh refresh actions to use muted tone");

console.log("[ui-routes-benchmark-refresh-smoke] PASS");
