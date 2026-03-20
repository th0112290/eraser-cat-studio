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

const routeHref = "/ui/benchmarks/route-reasons?reason=character_focused_dialogue&repairable=1";
const html = buildRigRepairHandoffLinks({
  currentHref: routeHref,
  characterPackId: "pack-route-alpha",
  fixturePath: "out/fixtures/route-alpha.json",
  repairable: true,
  recreateRecommended: false
});

const charactersHref = new URL(extractHref(html, "Characters"), "http://localhost");
assert(charactersHref.pathname === "/ui/characters", "expected Characters path");
assert(charactersHref.searchParams.get("characterPackId") === "pack-route-alpha", "expected route character pack id");
assert(charactersHref.searchParams.get("returnTo") === routeHref, "expected route returnTo");
assert(charactersHref.searchParams.get("focus") === "pack-review-current", "expected pack review focus");

const generatorHref = new URL(extractHref(html, "Generator Repair"), "http://localhost");
assert(generatorHref.pathname === "/ui/character-generator", "expected Character Generator path");
assert(generatorHref.searchParams.get("currentObject") === "pack:pack-route-alpha", "expected route currentObject");
assert(generatorHref.searchParams.get("focus") === "cg-manual-overrides", "expected manual override focus");
assert(html.includes("Copy fixture"), "expected fixture copy for route handoff");

console.log("[ui-routes-route-character-handoff-smoke] PASS");
