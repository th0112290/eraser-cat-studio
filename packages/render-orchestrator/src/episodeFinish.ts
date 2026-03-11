import type { ResolvedProfiles } from "@ec/profiles";
import type { DeterministicSequence, EpisodeFinishProfile } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function summarizeNumericValues(values: number[]): { min: number | null; max: number | null; avg: number | null } {
  if (values.length === 0) {
    return {
      min: null,
      max: null,
      avg: null
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    avg: round(total / values.length)
  };
}

function resolveRenderPathCompensation(sequence: DeterministicSequence): "deterministic" | "sidecar_wan" | "sidecar_hunyuan" {
  if (sequence.renderMode === "generative_broll") {
    return "sidecar_wan";
  }
  if (sequence.renderMode === "generative_i2v" || sequence.renderMode === "generative_s2v") {
    return "sidecar_hunyuan";
  }
  return sequence.finishProfile?.renderPathCompensation ?? "deterministic";
}

export function resolveEpisodeFinishProfile(input: {
  profiles?: ResolvedProfiles;
  sequences: DeterministicSequence[];
}): EpisodeFinishProfile {
  const channel = input.profiles?.channel.domain ?? "economy";
  const sidecarCount = input.sequences.filter((sequence) => resolveRenderPathCompensation(sequence) !== "deterministic").length;
  const totalCount = Math.max(1, input.sequences.length);
  const sidecarRatio = sidecarCount / totalCount;

  const base =
    channel === "medical"
      ? {
          id: "medical_episode_finish_consistency_v1",
          targetToneOverlayColor: "rgba(137, 225, 210, 1)",
          targetGrainOpacity: 0.05,
          targetScanlineOpacity: 0.028,
          targetVignetteOpacity: 0.18,
          targetTintOpacity: 0.04,
          targetBloomOpacity: 0.075,
          targetSharpenOpacity: 0.1,
          targetToneOverlayOpacity: 0.05,
          textureMatchOpacity: 0.18,
          paletteContinuityOpacity: 0.16,
          linePreserveOpacity: 0.13
        }
      : {
          id: "economy_episode_finish_consistency_v1",
          targetToneOverlayColor: "rgba(243, 199, 99, 1)",
          targetGrainOpacity: 0.048,
          targetScanlineOpacity: 0.026,
          targetVignetteOpacity: 0.17,
          targetTintOpacity: 0.035,
          targetBloomOpacity: 0.07,
          targetSharpenOpacity: 0.11,
          targetToneOverlayOpacity: 0.055,
          textureMatchOpacity: 0.17,
          paletteContinuityOpacity: 0.15,
          linePreserveOpacity: 0.14
        };

  return {
    id: base.id,
    targetToneOverlayColor: base.targetToneOverlayColor,
    targetGrainOpacity: round(clamp(base.targetGrainOpacity + sidecarRatio * 0.014, 0, 1)),
    targetScanlineOpacity: round(clamp(base.targetScanlineOpacity + sidecarRatio * 0.008, 0, 1)),
    targetVignetteOpacity: round(clamp(base.targetVignetteOpacity + sidecarRatio * 0.03, 0, 1)),
    targetTintOpacity: round(clamp(base.targetTintOpacity + sidecarRatio * 0.01, 0, 1)),
    targetBloomOpacity: round(clamp(base.targetBloomOpacity + sidecarRatio * 0.018, 0, 1)),
    targetSharpenOpacity: round(clamp(base.targetSharpenOpacity - sidecarRatio * 0.01, 0, 1)),
    targetToneOverlayOpacity: round(clamp(base.targetToneOverlayOpacity + sidecarRatio * 0.02, 0, 1)),
    textureMatchOpacity: round(clamp(base.textureMatchOpacity + sidecarRatio * 0.12, 0, 1)),
    paletteContinuityOpacity: round(clamp(base.paletteContinuityOpacity + sidecarRatio * 0.1, 0, 1)),
    linePreserveOpacity: round(clamp(base.linePreserveOpacity + sidecarRatio * 0.07, 0, 1))
  };
}

export function applyEpisodeFinishConsistency(
  sequences: DeterministicSequence[],
  episodeFinishProfile: EpisodeFinishProfile
): DeterministicSequence[] {
  return sequences.map((sequence) => {
    const finishProfile = sequence.finishProfile;
    if (!finishProfile) {
      return sequence;
    }

    const renderPathCompensation = resolveRenderPathCompensation(sequence);
    const consistencyMix =
      renderPathCompensation === "sidecar_wan"
        ? 0.72
        : renderPathCompensation === "sidecar_hunyuan"
          ? 0.66
          : 0.28;

    return {
      ...sequence,
      finishProfile: {
        ...finishProfile,
        grainOpacity: round(lerp(finishProfile.grainOpacity, episodeFinishProfile.targetGrainOpacity, consistencyMix)),
        scanlineOpacity: round(
          lerp(finishProfile.scanlineOpacity, episodeFinishProfile.targetScanlineOpacity, consistencyMix)
        ),
        vignetteOpacity: round(lerp(finishProfile.vignetteOpacity, episodeFinishProfile.targetVignetteOpacity, consistencyMix)),
        tintOpacity: round(lerp(finishProfile.tintOpacity, episodeFinishProfile.targetTintOpacity, consistencyMix)),
        bloomOpacity: round(lerp(finishProfile.bloomOpacity, episodeFinishProfile.targetBloomOpacity, consistencyMix)),
        sharpenOpacity: round(lerp(finishProfile.sharpenOpacity, episodeFinishProfile.targetSharpenOpacity, consistencyMix)),
        toneOverlayOpacity: round(
          lerp(finishProfile.toneOverlayOpacity, episodeFinishProfile.targetToneOverlayOpacity, consistencyMix)
        ),
        toneOverlayColor: episodeFinishProfile.targetToneOverlayColor,
        textureMatchOpacity: round(
          clamp(
            lerp(
              finishProfile.textureMatchOpacity,
              episodeFinishProfile.textureMatchOpacity,
              renderPathCompensation === "deterministic" ? 0.34 : 0.84
            ),
            0,
            1
          )
        ),
        paletteContinuityOpacity: round(
          clamp(
            lerp(
              finishProfile.paletteContinuityOpacity,
              episodeFinishProfile.paletteContinuityOpacity,
              renderPathCompensation === "deterministic" ? 0.3 : 0.8
            ),
            0,
            1
          )
        ),
        linePreserveOpacity: round(
          clamp(
            lerp(
              finishProfile.linePreserveOpacity,
              episodeFinishProfile.linePreserveOpacity,
              renderPathCompensation === "deterministic" ? 0.42 : 0.76
            ),
            0,
            1
          )
        ),
        renderPathCompensation,
        episodeFinishProfileId: episodeFinishProfile.id
      }
    };
  });
}

export function buildFinishConsistencySummary(
  sequences: DeterministicSequence[],
  episodeFinishProfile: EpisodeFinishProfile | undefined
) {
  const profileId = episodeFinishProfile?.id ?? null;
  const pathCounts: Record<string, number> = {};
  const textureMatchValues: number[] = [];
  const paletteContinuityValues: number[] = [];
  const linePreserveValues: number[] = [];

  for (const sequence of sequences) {
    const finishProfile = sequence.finishProfile;
    if (!finishProfile) {
      continue;
    }
    const path = finishProfile.renderPathCompensation;
    pathCounts[path] = (pathCounts[path] ?? 0) + 1;
    textureMatchValues.push(finishProfile.textureMatchOpacity);
    paletteContinuityValues.push(finishProfile.paletteContinuityOpacity);
    linePreserveValues.push(finishProfile.linePreserveOpacity);
  }

  return {
    episode_finish_profile_id: profileId,
    render_path_counts: pathCounts,
    texture_match_opacity: summarizeNumericValues(textureMatchValues),
    palette_continuity_opacity: summarizeNumericValues(paletteContinuityValues),
    line_preserve_opacity: summarizeNumericValues(linePreserveValues)
  };
}
