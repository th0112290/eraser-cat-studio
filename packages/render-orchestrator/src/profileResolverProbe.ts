import fs from "node:fs";
import path from "node:path";
import type { DeterministicProfileResolverInput } from "./types";
import {
  describeDeterministicProfileResolverDiscoveryFailure,
  discoverDeterministicProfileResolverModule,
  listDeterministicProfileResolverModuleCandidates,
  loadDeterministicProfileResolverModule
} from "./profileSeam";

type ProbeScenario = {
  id: string;
  input: DeterministicProfileResolverInput;
};

function readFlagValue(flagName: string): string | undefined {
  const exactMatch = process.argv.find((arg) => arg.startsWith(`${flagName}=`));
  if (exactMatch) {
    return exactMatch.slice(flagName.length + 1);
  }
  const index = process.argv.indexOf(flagName);
  if (index >= 0 && typeof process.argv[index + 1] === "string") {
    return process.argv[index + 1];
  }
  return undefined;
}

function resolveJsonOutPath(explicitPath: string | undefined): string {
  if (explicitPath) {
    return path.resolve(process.cwd(), explicitPath);
  }
  return path.resolve(process.cwd(), "../../out/profile_resolver_probe.json");
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildScenarios(): ProbeScenario[] {
  return [
    {
      id: "economy_comparison",
      input: {
        channelDomain: "economy",
        mascotId: "eraser_cat",
        hasChart: true,
        primaryVisualKind: "comparison_board",
        insertNeed: "none"
      }
    },
    {
      id: "medical_diagram",
      input: {
        channelDomain: "medical",
        mascotId: "med_dog",
        hasChart: false,
        primaryVisualKind: "labeled_diagram",
        insertNeed: "diagram_support"
      }
    },
    {
      id: "generic_summary",
      input: {
        channelDomain: "generic",
        mascotId: "eraser_cat",
        hasChart: false,
        primaryVisualKind: "summary_card",
        insertNeed: "none"
      }
    }
  ];
}

async function main() {
  const moduleArg = readFlagValue("--profile-resolver-module") ?? process.env.RENDER_PROFILE_RESOLVER_MODULE;
  const autoDiscover = process.argv.includes("--auto-discover") || process.env.RENDER_PROFILE_RESOLVER_AUTO === "1";
  const workspaceRootArg = readFlagValue("--workspace-root");
  const expectedSource = readFlagValue("--expect-source");
  const jsonOutPath = resolveJsonOutPath(readFlagValue("--json-out"));
  const workspaceRoot = workspaceRootArg ? path.resolve(process.cwd(), workspaceRootArg) : path.resolve(process.cwd(), "../..");
  const checkedCandidates = listDeterministicProfileResolverModuleCandidates(workspaceRoot);
  const modulePath =
    moduleArg && moduleArg !== "auto"
      ? path.resolve(process.cwd(), moduleArg)
      : autoDiscover || moduleArg === "auto"
        ? discoverDeterministicProfileResolverModule(workspaceRoot)
        : undefined;
  if (!modulePath) {
    if (autoDiscover || moduleArg === "auto") {
      throw new Error(describeDeterministicProfileResolverDiscoveryFailure(workspaceRoot));
    }
    throw new Error("Missing profile resolver module path. Use --profile-resolver-module, --auto-discover, or RENDER_PROFILE_RESOLVER_MODULE.");
  }
  const scenarios = buildScenarios();
  const resolver = await loadDeterministicProfileResolverModule(modulePath);

  const results = scenarios.map((scenario) => {
    const resolution = resolver(scenario.input);
    return {
      scenarioId: scenario.id,
      input: scenario.input,
      resolverId: resolution.profileBundle.resolverId,
      resolverSource: resolution.profileBundle.resolverSource,
      studioProfileId: resolution.profileBundle.studioProfileId,
      channelProfileId: resolution.profileBundle.channelProfileId,
      mascotProfileId: resolution.profileBundle.mascotProfileId,
      layoutBias: resolution.profileBundle.layoutBias,
      actingBias: resolution.profileBundle.actingBias,
      pointerBias: resolution.profileBundle.pointerBias,
      finishBias: resolution.profileBundle.finishBias,
      finishTone: resolution.finishProfile.tone,
      textureMatch: resolution.finishProfile.textureMatch
    };
  });

  if (expectedSource && results.some((result) => result.resolverSource !== expectedSource)) {
    throw new Error(
      `Profile resolver source mismatch. Expected ${expectedSource}, got ${results.map((result) => result.resolverSource).join(", ")}`
    );
  }

  const report = {
    modulePath,
    expectedSource: expectedSource ?? null,
    checkedCandidates,
    scenarioCount: results.length,
    resolverSources: Array.from(new Set(results.map((result) => result.resolverSource))),
    resolverIds: Array.from(new Set(results.map((result) => result.resolverId))),
    results
  };

  writeJson(jsonOutPath, report);

  console.log(`probe:module ${modulePath}`);
  console.log(`probe:workspaceRoot ${workspaceRoot}`);
  console.log(`probe:checkedCandidates ${checkedCandidates.length}`);
  console.log(`probe:resolverSources ${report.resolverSources.join(",")}`);
  console.log(`probe:resolverIds ${report.resolverIds.join(",")}`);
  console.log(`probe:scenarioCount ${report.scenarioCount}`);
  console.log(`probe:json ${jsonOutPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
