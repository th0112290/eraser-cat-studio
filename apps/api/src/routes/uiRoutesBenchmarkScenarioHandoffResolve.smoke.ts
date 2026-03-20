import { resolveBenchmarkScenarioHandoffState } from "./uiRoutes";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const docFallback = resolveBenchmarkScenarioHandoffState(
  {
    character_pack_id: "pack-root-alpha",
    fixture_path: "C:/fixtures/root-alpha.json"
  },
  {
    backend: "wan",
    renderer: "comfyui-wan-i2v"
  }
);
assert(docFallback.characterPackId === "pack-root-alpha", "expected root-level character pack fallback");
assert(docFallback.fixturePath?.includes("root-alpha.json") === true, "expected root-level fixture fallback");

const rawOverride = resolveBenchmarkScenarioHandoffState(
  {
    character_pack_id: "pack-root-alpha",
    fixture_path: "C:/fixtures/root-alpha.json"
  },
  {
    character_pack_id: "pack-row-beta",
    fixture_path: "C:/fixtures/row-beta.json"
  }
);
assert(rawOverride.characterPackId === "pack-row-beta", "expected row-level character pack to override root fallback");
assert(rawOverride.fixturePath?.includes("row-beta.json") === true, "expected row-level fixture to override root fallback");

const missing = resolveBenchmarkScenarioHandoffState({}, {});
assert(missing.characterPackId === null, "expected missing character pack to stay null");
assert(missing.fixturePath === null, "expected missing fixture path to stay null");

console.log("[ui-routes-benchmark-scenario-handoff-resolve-smoke] PASS");
