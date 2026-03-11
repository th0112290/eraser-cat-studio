import { defaultStudioProfile } from "./defaultStudioProfile";
import { economyChannelProfile } from "./channels/economyChannelProfile";
import { medicalChannelProfile } from "./channels/medicalChannelProfile";
import { eraserCatMascotProfile } from "./mascots/eraserCatMascotProfile";
import { medDogMascotProfile } from "./mascots/medDogMascotProfile";
import type {
  ChannelProfile,
  ChannelProfileId,
  MascotProfile,
  MascotProfileId,
  ProfileSelection,
  ResolvedProfiles,
  StudioProfile,
  StudioProfileId
} from "./types";

export const DEFAULT_STUDIO_PROFILE_ID: StudioProfileId = "studio_default";
export const DEFAULT_CHANNEL_PROFILE_ID: ChannelProfileId = "economy_channel";
export const DEFAULT_MASCOT_PROFILE_ID: MascotProfileId = "eraser_cat";

const STUDIO_PROFILES: Record<StudioProfileId, StudioProfile> = {
  studio_default: defaultStudioProfile
};

const CHANNEL_PROFILES: Record<ChannelProfileId, ChannelProfile> = {
  economy_channel: economyChannelProfile,
  medical_channel: medicalChannelProfile
};

const MASCOT_PROFILES: Record<MascotProfileId, MascotProfile> = {
  eraser_cat: eraserCatMascotProfile,
  med_dog: medDogMascotProfile
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeProfileSelection(selection?: Partial<ProfileSelection>): ProfileSelection {
  const studioId = asString(selection?.studio_profile_id);
  const channelId = asString(selection?.channel_profile_id);
  const mascotId = asString(selection?.mascot_profile_id);

  return {
    studio_profile_id:
      studioId && studioId in STUDIO_PROFILES
        ? (studioId as StudioProfileId)
        : DEFAULT_STUDIO_PROFILE_ID,
    channel_profile_id:
      channelId && channelId in CHANNEL_PROFILES
        ? (channelId as ChannelProfileId)
        : DEFAULT_CHANNEL_PROFILE_ID,
    mascot_profile_id:
      mascotId && mascotId in MASCOT_PROFILES
        ? (mascotId as MascotProfileId)
        : DEFAULT_MASCOT_PROFILE_ID
  };
}

export function coerceProfileSelection(value: unknown): Partial<ProfileSelection> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const studio_profile_id = asString(value.studio_profile_id);
  const channel_profile_id = asString(value.channel_profile_id);
  const mascot_profile_id = asString(value.mascot_profile_id);

  const candidate: Partial<ProfileSelection> = {};
  if (studio_profile_id) {
    candidate.studio_profile_id = studio_profile_id as StudioProfileId;
  }
  if (channel_profile_id) {
    candidate.channel_profile_id = channel_profile_id as ChannelProfileId;
  }
  if (mascot_profile_id) {
    candidate.mascot_profile_id = mascot_profile_id as MascotProfileId;
  }
  return Object.keys(candidate).length > 0 ? candidate : undefined;
}

export function resolveProfiles(selection?: Partial<ProfileSelection>): ResolvedProfiles {
  const normalized = normalizeProfileSelection(selection);
  const mascot = MASCOT_PROFILES[normalized.mascot_profile_id];
  return {
    selection: normalized,
    studio: STUDIO_PROFILES[normalized.studio_profile_id],
    channel: CHANNEL_PROFILES[normalized.channel_profile_id],
    mascot,
    mascot_morph: mascot.morph,
    mascot_acting: mascot.acting,
    mascot_brand: mascot.brand
  };
}
