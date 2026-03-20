import { summarizeArtifactFreshnessForRows } from "./uiRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const unknownOnly = summarizeArtifactFreshnessForRows([{ generatedAt: "-" }]);
assert(unknownOnly.unknownCount === 1, "expected unknown freshness rows to be counted");
assert(unknownOnly.staleCount === 0, "unexpected stale count for unknown-only freshness");
assert(unknownOnly.agingCount === 0, "unexpected aging count for unknown-only freshness");
assert(unknownOnly.newestDetail === "no artifact timestamp", "unexpected newest detail for unknown-only freshness");

const mixed = summarizeArtifactFreshnessForRows([
  { generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  { generatedAt: new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString() },
  { generatedAt: "-" }
]);
assert(mixed.unknownCount === 1, "expected mixed freshness summary to preserve unknown rows");
assert(mixed.agingCount === 1, "expected mixed freshness summary to count aging rows");
assert(mixed.staleCount === 0, "unexpected stale count for mixed freshness summary");
assert(mixed.newestDetail.startsWith("latest "), "expected newest detail to point at latest timestamp");

console.log("[ui-routes-freshness-smoke] PASS");
