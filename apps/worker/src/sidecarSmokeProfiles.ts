import {
  resolveProfiles,
  type ChannelProfileId,
  type MascotProfileId,
  type ProfileSelection,
  type ResolvedProfiles,
  type StudioProfileId
} from "@ec/profiles";

export type SmokeProfileBundleName = "economy" | "medical";

export type SmokeProfileSelection = {
  bundleName: SmokeProfileBundleName;
  selection: ProfileSelection;
  resolvedProfiles: ResolvedProfiles;
};

const PROFILE_BUNDLES: Record<SmokeProfileBundleName, ProfileSelection> = {
  economy: {
    studio_profile_id: "studio_default",
    channel_profile_id: "economy_channel",
    mascot_profile_id: "eraser_cat"
  },
  medical: {
    studio_profile_id: "studio_default",
    channel_profile_id: "medical_channel",
    mascot_profile_id: "med_dog"
  }
};

function parseBundleName(value: string | null | undefined): SmokeProfileBundleName | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "economy" || normalized === "medical" ? normalized : null;
}

export function resolveSmokeProfileSelection(input: {
  resolveArgValue: (name: string) => string | null;
  env?: NodeJS.ProcessEnv;
}): SmokeProfileSelection {
  const env = input.env ?? process.env;
  const explicitBundle =
    parseBundleName(input.resolveArgValue("profile-bundle")) ??
    parseBundleName(env.SMOKE_PROFILE_BUNDLE) ??
    null;
  const studioProfileId =
    (input.resolveArgValue("studio-profile") ?? env.SMOKE_STUDIO_PROFILE_ID?.trim() ?? null) as StudioProfileId | null;
  const channelProfileId =
    (input.resolveArgValue("channel-profile") ?? env.SMOKE_CHANNEL_PROFILE_ID?.trim() ?? null) as ChannelProfileId | null;
  const mascotProfileId =
    (input.resolveArgValue("mascot-profile") ?? env.SMOKE_MASCOT_PROFILE_ID?.trim() ?? null) as MascotProfileId | null;

  const fallbackBundle =
    channelProfileId === "medical_channel" || mascotProfileId === "med_dog"
      ? "medical"
      : explicitBundle ?? "economy";
  const baseSelection = PROFILE_BUNDLES[fallbackBundle];
  const selection: ProfileSelection = {
    studio_profile_id: studioProfileId ?? baseSelection.studio_profile_id,
    channel_profile_id: channelProfileId ?? baseSelection.channel_profile_id,
    mascot_profile_id: mascotProfileId ?? baseSelection.mascot_profile_id
  };
  const resolvedProfiles = resolveProfiles(selection);
  const bundleName = resolvedProfiles.channel.domain === "medical" ? "medical" : "economy";
  return {
    bundleName,
    selection: resolvedProfiles.selection,
    resolvedProfiles
  };
}

export function toSmokeProfileArgs(selection: SmokeProfileSelection): string[] {
  return [
    `--profile-bundle=${selection.bundleName}`,
    `--studio-profile=${selection.selection.studio_profile_id}`,
    `--channel-profile=${selection.selection.channel_profile_id}`,
    `--mascot-profile=${selection.selection.mascot_profile_id}`
  ];
}
