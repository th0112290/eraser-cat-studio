import { buildRigRepairHandoffLinks } from "./uiRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function extractHref(html: string, label: string): string {
  const match = html.match(new RegExp(`<a href="([^"]+)">${label}</a>`));
  if (!match) {
    throw new Error(`missing ${label} link`);
  }
  return match[1].replaceAll("&amp;", "&");
}

const benchmarkHref = "/ui/benchmarks?q=cat&view=threeQuarter";
const repairHtml = buildRigRepairHandoffLinks({
  currentHref: benchmarkHref,
  characterPackId: "pack-cat-alpha",
  fixturePath: "out/fixtures/cat-alpha.json",
  repairable: true,
  recreateRecommended: false
});

const charactersHref = new URL(extractHref(repairHtml, "Characters"), "http://localhost");
assert(charactersHref.pathname === "/ui/characters", "expected Characters handoff path");
assert(charactersHref.searchParams.get("characterPackId") === "pack-cat-alpha", "expected character pack id in Characters handoff");
assert(charactersHref.searchParams.get("returnTo") === benchmarkHref, "expected benchmark returnTo in Characters handoff");
assert(charactersHref.searchParams.get("focus") === "pack-review-current", "expected pack review focus");
assert(charactersHref.searchParams.get("currentObject") === "pack:pack-cat-alpha", "expected pack currentObject");

const generatorHref = new URL(extractHref(repairHtml, "Generator Repair"), "http://localhost");
assert(generatorHref.pathname === "/ui/character-generator", "expected Character Generator handoff path");
assert(generatorHref.searchParams.get("characterPackId") === "pack-cat-alpha", "expected pack id in generator handoff");
assert(generatorHref.searchParams.get("packId") === "pack-cat-alpha", "expected packId mirror in generator handoff");
assert(generatorHref.searchParams.get("returnTo") === benchmarkHref, "expected benchmark returnTo in generator handoff");
assert(generatorHref.searchParams.get("focus") === "cg-manual-overrides", "expected manual override focus");
assert(generatorHref.searchParams.get("currentObject") === "pack:pack-cat-alpha", "expected pack currentObject in generator handoff");
assert(repairHtml.includes("Copy fixture"), "expected fixture copy action");

const recreateHtml = buildRigRepairHandoffLinks({
  currentHref: benchmarkHref,
  characterPackId: "pack-cat-beta",
  repairable: false,
  recreateRecommended: true
});
const recreateHref = new URL(extractHref(recreateHtml, "Generator Recreate"), "http://localhost");
assert(recreateHref.searchParams.get("focus") === "recreate-pack", "expected recreate focus for recreate-only handoff");

console.log("[ui-routes-benchmark-character-handoff-smoke] PASS");
