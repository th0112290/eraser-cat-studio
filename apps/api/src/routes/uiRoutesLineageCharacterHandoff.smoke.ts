import { buildRigRepairHandoffLinks, resolveSinglePackId } from "./uiRoutes";

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

assert(resolveSinglePackId(["pack-lineage-alpha"]) === "pack-lineage-alpha", "expected single-pack lineage to resolve");
assert(resolveSinglePackId(["pack-a", "pack-b"]) === null, "expected multi-pack lineage to stay ambiguous");

const lineageHref = "/ui/benchmarks/dataset-lineage?pack=pack-lineage-alpha";
const singlePackHtml = buildRigRepairHandoffLinks({
  currentHref: lineageHref,
  characterPackId: resolveSinglePackId(["pack-lineage-alpha"]),
  fixturePath: "out/fixtures/lineage-alpha.json",
  repairable: true,
  recreateRecommended: false
});

const charactersHref = new URL(extractHref(singlePackHtml, "Characters"), "http://localhost");
assert(charactersHref.pathname === "/ui/characters", "expected Characters path");
assert(charactersHref.searchParams.get("characterPackId") === "pack-lineage-alpha", "expected lineage character pack id");
assert(charactersHref.searchParams.get("returnTo") === lineageHref, "expected lineage returnTo");

const multiPackHtml = buildRigRepairHandoffLinks({
  currentHref: lineageHref,
  characterPackId: resolveSinglePackId(["pack-a", "pack-b"]),
  fixturePath: "out/fixtures/lineage-multi.json",
  repairable: true,
  recreateRecommended: false
});
assert(!multiPackHtml.includes(">Characters</a>"), "multi-pack lineage must not guess a Characters link");
assert(!multiPackHtml.includes(">Generator Repair</a>"), "multi-pack lineage must not guess a Generator link");
assert(multiPackHtml.includes("Copy fixture"), "multi-pack lineage should still expose fixture copy");

console.log("[ui-routes-lineage-character-handoff-smoke] PASS");
