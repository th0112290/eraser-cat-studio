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

const repairHref = "/ui/benchmarks/repair-acceptance?repairable=1&q=ep-cat";
const handoffHtml = buildRigRepairHandoffLinks({
  currentHref: repairHref,
  characterPackId: "pack-wolf-alpha",
  fixturePath: "out/fixtures/wolf-alpha.json",
  repairable: true,
  recreateRecommended: false
});

const charactersHref = new URL(extractHref(handoffHtml, "Characters"), "http://localhost");
assert(charactersHref.pathname === "/ui/characters", "expected Characters route");
assert(charactersHref.searchParams.get("characterPackId") === "pack-wolf-alpha", "expected character pack id");
assert(charactersHref.searchParams.get("returnTo") === repairHref, "expected repair returnTo");
assert(charactersHref.searchParams.get("focus") === "pack-review-current", "expected pack review focus");

const generatorHref = new URL(extractHref(handoffHtml, "Generator Repair"), "http://localhost");
assert(generatorHref.pathname === "/ui/character-generator", "expected generator route");
assert(generatorHref.searchParams.get("focus") === "cg-manual-overrides", "expected repair focus");

const fixtureOnlyHtml = buildRigRepairHandoffLinks({
  currentHref: repairHref,
  fixturePath: "out/fixtures/orphan.json",
  repairable: true,
  recreateRecommended: false
});
assert(!fixtureOnlyHtml.includes(">Characters</a>"), "fixture-only handoff must not guess a Characters link");
assert(!fixtureOnlyHtml.includes(">Generator Repair</a>"), "fixture-only handoff must not guess a Generator link");
assert(fixtureOnlyHtml.includes("Copy fixture"), "fixture-only handoff should still expose fixture copy");

console.log("[ui-routes-repair-character-handoff-smoke] PASS");
