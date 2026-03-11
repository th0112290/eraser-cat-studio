import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  DeterministicFinishProfile,
  DeterministicProfileBundle,
  DeterministicProfileResolution,
  DeterministicProfileResolverInput
} from "./types";

export type ProfileSeamInput = DeterministicProfileResolverInput;

export type ProfilesPackageBundleSeed = Omit<DeterministicProfileBundle, "resolverId" | "resolverSource">;

export type ProfilesPackageResolutionSeed = {
  resolverId?: string;
  profileBundle: ProfilesPackageBundleSeed;
  finishProfile?: Partial<DeterministicFinishProfile>;
};

type UnknownResolverModule = Record<string, unknown>;
type MaybePromise<T> = T | Promise<T>;
const PROFILE_RESOLVER_CANDIDATE_PATHS = [
  "packages/profiles/src/profileResolver.ts",
  "packages/profiles/src/renderProfileResolver.ts",
  "packages/profiles/src/deterministicProfileResolver.ts",
  "packages/profiles/src/index.ts"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDeterministicProfileResolution(value: unknown): value is DeterministicProfileResolution {
  return (
    isRecord(value) &&
    isRecord(value.profileBundle) &&
    typeof value.profileBundle.resolverId === "string" &&
    typeof value.profileBundle.resolverSource === "string" &&
    isRecord(value.finishProfile)
  );
}

function isProfilesPackageResolutionSeed(value: unknown): value is ProfilesPackageResolutionSeed {
  return (
    isRecord(value) &&
    isRecord(value.profileBundle) &&
    typeof value.profileBundle.studioProfileId === "string" &&
    typeof value.profileBundle.channelProfileId === "string" &&
    typeof value.profileBundle.mascotProfileId === "string"
  );
}

function toImportSpecifier(modulePath: string): string {
  return path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath;
}

export function discoverDeterministicProfileResolverModule(workspaceRoot: string): string | undefined {
  return listDeterministicProfileResolverModuleCandidates(workspaceRoot).find((candidatePath) => fs.existsSync(candidatePath));
}

export function listDeterministicProfileResolverModuleCandidates(workspaceRoot: string): string[] {
  return PROFILE_RESOLVER_CANDIDATE_PATHS.map((relativePath) => path.resolve(workspaceRoot, relativePath));
}

export function describeDeterministicProfileResolverDiscoveryFailure(workspaceRoot: string): string {
  const checked = listDeterministicProfileResolverModuleCandidates(workspaceRoot);
  return `Failed to auto-discover deterministic profile resolver module under ${workspaceRoot}. Checked: ${checked.join(", ")}`;
}

function isResolverFunction(
  value: unknown
): value is (input: DeterministicProfileResolverInput) => DeterministicProfileResolution {
  return typeof value === "function" && value.length >= 1;
}

function isFactoryFunction(value: unknown): value is () => MaybePromise<unknown> {
  return typeof value === "function" && value.length === 0;
}

function pickFactoryCandidate(moduleRecord: UnknownResolverModule): unknown {
  return (
    moduleRecord.createDeterministicProfileResolver ??
    moduleRecord.createProfilesPackageResolver ??
    moduleRecord.createProfileResolver
  );
}

function pickPackageResolutionCandidate(moduleRecord: UnknownResolverModule): unknown {
  return (
    moduleRecord.resolveProfilesPackageResolution ??
    moduleRecord.resolveDeterministicProfileResolution ??
    moduleRecord.resolveProfileResolution
  );
}

function toResolverFromPackageResolutionFunction(
  packageResolutionFn: (input: DeterministicProfileResolverInput) => unknown,
  modulePath: string
): (input: DeterministicProfileResolverInput) => DeterministicProfileResolution {
  return (input: DeterministicProfileResolverInput) => {
    const resolution = packageResolutionFn(input);
    if (isDeterministicProfileResolution(resolution)) {
      return resolution;
    }
    if (isProfilesPackageResolutionSeed(resolution)) {
      return adaptProfilesPackageResolution(input, resolution);
    }
    throw new Error(`Unsupported profile resolver module contract: ${modulePath}`);
  };
}

function toNormalizedResolver(
  resolver: (input: DeterministicProfileResolverInput) => unknown,
  modulePath: string
): (input: DeterministicProfileResolverInput) => DeterministicProfileResolution {
  return (input: DeterministicProfileResolverInput) => {
    const resolution = resolver(input);
    if (isDeterministicProfileResolution(resolution)) {
      return resolution;
    }
    if (isProfilesPackageResolutionSeed(resolution)) {
      return adaptProfilesPackageResolution(input, resolution);
    }
    throw new Error(`Unsupported profile resolver module contract: ${modulePath}`);
  };
}

async function toDeterministicProfileResolver(
  candidate: unknown,
  modulePath: string
): Promise<(input: DeterministicProfileResolverInput) => DeterministicProfileResolution> {
  if (isResolverFunction(candidate)) {
    return toNormalizedResolver(candidate, modulePath);
  }

  if (isFactoryFunction(candidate)) {
    const built = await candidate();
    if (isResolverFunction(built)) {
      return toNormalizedResolver(built, modulePath);
    }
    if (isRecord(built)) {
      return toDeterministicProfileResolver(built, modulePath);
    }
    throw new Error(`Unsupported profile resolver factory contract: ${modulePath}`);
  }

  if (isRecord(candidate)) {
    if (isResolverFunction(candidate.profileResolver)) {
      return toNormalizedResolver(candidate.profileResolver, modulePath);
    }

    const nestedFactory = pickFactoryCandidate(candidate);
    if (nestedFactory) {
      return toDeterministicProfileResolver(nestedFactory, modulePath);
    }

    const packageResolutionFn = pickPackageResolutionCandidate(candidate);
    if (typeof packageResolutionFn === "function") {
      return toResolverFromPackageResolutionFunction(
        packageResolutionFn as (input: DeterministicProfileResolverInput) => unknown,
        modulePath
      );
    }
  }

  throw new Error(`No supported profile resolver export found in module: ${modulePath}`);
}

export function resolveDeterministicProfileBundle(input: ProfileSeamInput): DeterministicProfileBundle {
  const domain = input.channelDomain ?? "generic";
  const mascotId = input.mascotId ?? "unknown";
  const layoutBias =
    input.hasChart || input.primaryVisualKind === "comparison_board" || input.primaryVisualKind === "kpi_card"
      ? "data_dense"
      : input.primaryVisualKind === "labeled_diagram" ||
          input.primaryVisualKind === "summary_card" ||
          input.primaryVisualKind === "checklist_card" ||
          input.insertNeed !== "none"
        ? "guided_soft"
        : "balanced";
  const actingBias =
    domain === "medical"
      ? "warm_guide"
      : domain === "economy"
        ? "analytic_presenter"
        : mascotId === "med_dog"
          ? "warm_guide"
          : "neutral_presenter";
  const pointerBias =
    input.hasChart || input.primaryVisualKind === "comparison_board" || input.primaryVisualKind === "kpi_card"
      ? "chart_precise"
      : input.primaryVisualKind === "labeled_diagram" || input.insertNeed !== "none"
        ? "guided_callout"
        : "soft_visual";
  const finishBias = domain === "economy" ? "economy_crisp" : domain === "medical" ? "medical_soft" : "studio_balanced";

  return {
    resolverId: "local_profile_seam_v1",
    resolverSource: "local_seam",
    studioProfileId: "studio_mascot_explainer_v1",
    channelProfileId:
      domain === "economy" ? "economy_channel_v1" : domain === "medical" ? "medical_channel_v1" : "generic_channel_v1",
    mascotProfileId:
      mascotId === "eraser_cat"
        ? "eraser_cat_presenter_v1"
        : mascotId === "med_dog"
          ? "med_dog_guide_v1"
          : "unknown_mascot_v1",
    layoutBias,
    actingBias,
    pointerBias,
    finishBias
  };
}

export function resolveDeterministicFinishProfile(input: ProfileSeamInput & {
  profileBundle: DeterministicProfileBundle;
}): DeterministicFinishProfile {
  const mascotId = input.mascotId ?? "unknown";
  const chartLike =
    input.hasChart || input.primaryVisualKind === "bar_chart" || input.primaryVisualKind === "line_chart";
  const textureMatch =
    chartLike ? "deterministic_clean" : input.insertNeed !== "none" ? "sidecar_matched" : "balanced_soft";

  const base: DeterministicFinishProfile =
    input.profileBundle.finishBias === "economy_crisp"
      ? {
          tone: "economy_crisp",
          textureMatch,
          brightness: 1.01,
          contrast: 1.08,
          saturation: 1.04,
          lineSharpenStrength: 0.24,
          bloomOpacity: 0.05,
          grainOpacity: 0.045,
          vignetteOpacity: 0.18,
          tintOpacity: 0.05,
          tintGradient:
            "linear-gradient(160deg, rgba(0, 204, 255, 0.36), rgba(255, 194, 92, 0.28) 58%, rgba(255, 247, 214, 0.22))"
        }
      : input.profileBundle.finishBias === "medical_soft"
        ? {
            tone: "medical_soft",
            textureMatch,
            brightness: 1.03,
            contrast: 1.02,
            saturation: 0.97,
            lineSharpenStrength: 0.16,
            bloomOpacity: 0.08,
            grainOpacity: 0.03,
            vignetteOpacity: 0.12,
            tintOpacity: 0.035,
            tintGradient:
              "linear-gradient(160deg, rgba(110, 224, 255, 0.28), rgba(198, 255, 242, 0.24) 54%, rgba(255, 255, 255, 0.16))"
          }
        : {
            tone: "studio_balanced",
            textureMatch,
            brightness: 1.02,
            contrast: 1.04,
            saturation: 1,
            lineSharpenStrength: 0.2,
            bloomOpacity: 0.06,
            grainOpacity: 0.04,
            vignetteOpacity: 0.15,
            tintOpacity: 0.04,
            tintGradient:
              "linear-gradient(155deg, rgba(82, 189, 255, 0.28), rgba(255, 175, 120, 0.22) 62%, rgba(255, 244, 214, 0.18))"
          };

  if (mascotId === "eraser_cat") {
    base.saturation += 0.02;
    base.tintOpacity += 0.01;
  } else if (mascotId === "med_dog") {
    base.saturation -= 0.02;
    base.bloomOpacity += 0.01;
    base.tintOpacity += 0.005;
  }

  if (textureMatch === "deterministic_clean") {
    base.lineSharpenStrength += 0.04;
    base.grainOpacity = Math.max(0.018, base.grainOpacity - 0.012);
    base.bloomOpacity = Math.max(0.03, base.bloomOpacity - 0.015);
  } else if (textureMatch === "sidecar_matched") {
    base.lineSharpenStrength = Math.max(0.08, base.lineSharpenStrength - 0.04);
    base.grainOpacity += 0.016;
    base.bloomOpacity += 0.02;
    base.vignetteOpacity += 0.02;
  }

  if (input.primaryVisualKind === "comparison_board" || input.primaryVisualKind === "kpi_card") {
    base.contrast += 0.03;
    base.lineSharpenStrength += 0.03;
    base.tintOpacity += 0.006;
  } else if (input.primaryVisualKind === "process_flow" || input.primaryVisualKind === "timeline") {
    base.brightness += 0.02;
    base.vignetteOpacity = Math.max(0.08, base.vignetteOpacity - 0.03);
    base.tintOpacity += 0.008;
  } else if (input.primaryVisualKind === "labeled_diagram") {
    base.bloomOpacity += 0.03;
    base.lineSharpenStrength = Math.max(0.08, base.lineSharpenStrength - 0.03);
    base.saturation = Math.max(0.9, base.saturation - 0.03);
  } else if (
    input.primaryVisualKind === "summary_card" ||
    input.primaryVisualKind === "checklist_card" ||
    input.primaryVisualKind === "table"
  ) {
    base.contrast = Math.max(0.96, base.contrast - 0.02);
    base.grainOpacity += 0.008;
    base.vignetteOpacity = Math.max(0.08, base.vignetteOpacity - 0.02);
  }

  return base;
}

export function resolveDeterministicProfileSeam(input: ProfileSeamInput): DeterministicProfileResolution {
  const profileBundle = resolveDeterministicProfileBundle(input);
  const finishProfile = resolveDeterministicFinishProfile({
    ...input,
    profileBundle
  });
  return {
    profileBundle,
    finishProfile
  };
}

export function adaptProfilesPackageResolution(
  input: ProfileSeamInput,
  resolution: ProfilesPackageResolutionSeed
): DeterministicProfileResolution {
  const profileBundle: DeterministicProfileBundle = {
    ...resolution.profileBundle,
    resolverId: resolution.resolverId ?? "profiles_package_adapter_v1",
    resolverSource: "profiles_package"
  };
  const baseFinishProfile = resolveDeterministicFinishProfile({
    ...input,
    profileBundle
  });

  return {
    profileBundle,
    finishProfile: resolution.finishProfile
      ? {
          ...baseFinishProfile,
          ...resolution.finishProfile,
          tone: resolution.finishProfile.tone ?? baseFinishProfile.tone,
          textureMatch: resolution.finishProfile.textureMatch ?? baseFinishProfile.textureMatch,
          tintGradient: resolution.finishProfile.tintGradient ?? baseFinishProfile.tintGradient
        }
      : baseFinishProfile
  };
}

export async function loadDeterministicProfileResolverModule(modulePath: string) {
  const imported = (await import(toImportSpecifier(modulePath))) as UnknownResolverModule;

  if (isResolverFunction(imported.profileResolver)) {
    return toNormalizedResolver(imported.profileResolver, modulePath);
  }

  const factoryCandidate = pickFactoryCandidate(imported);
  if (factoryCandidate) {
    return toDeterministicProfileResolver(factoryCandidate, modulePath);
  }

  const packageResolutionCandidate = pickPackageResolutionCandidate(imported);
  if (typeof packageResolutionCandidate === "function") {
    return toResolverFromPackageResolutionFunction(
      packageResolutionCandidate as (input: DeterministicProfileResolverInput) => unknown,
      modulePath
    );
  }

  const defaultExport = imported.default;
  return toDeterministicProfileResolver(defaultExport ?? imported, modulePath);
}
