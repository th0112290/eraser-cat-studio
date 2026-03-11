import type { FinishProfileId, ResolvedProfiles } from "@ec/profiles";
import type { RenderableShot } from "./types";

export type ShotFinishProfile = {
  id: FinishProfileId;
  grainOpacity: number;
  scanlineOpacity: number;
  vignetteOpacity: number;
  tintOpacity: number;
  bloomOpacity: number;
  sharpenOpacity: number;
  toneOverlayOpacity: number;
  toneOverlayColor: string;
  textureMatchOpacity: number;
  paletteContinuityOpacity: number;
  linePreserveOpacity: number;
  renderPathCompensation: "deterministic" | "sidecar_wan" | "sidecar_hunyuan";
  episodeFinishProfileId?: string;
};

type ShotFinishProfileInput = {
  shot: RenderableShot;
  profiles?: ResolvedProfiles;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function withAdjustments(
  base: ShotFinishProfile,
  input: Partial<Omit<ShotFinishProfile, "id">>
): ShotFinishProfile {
  return {
    ...base,
    grainOpacity: clamp(input.grainOpacity ?? base.grainOpacity, 0, 1),
    scanlineOpacity: clamp(input.scanlineOpacity ?? base.scanlineOpacity, 0, 1),
    vignetteOpacity: clamp(input.vignetteOpacity ?? base.vignetteOpacity, 0, 1),
    tintOpacity: clamp(input.tintOpacity ?? base.tintOpacity, 0, 1),
    bloomOpacity: clamp(input.bloomOpacity ?? base.bloomOpacity, 0, 1),
    sharpenOpacity: clamp(input.sharpenOpacity ?? base.sharpenOpacity, 0, 1),
    toneOverlayOpacity: clamp(input.toneOverlayOpacity ?? base.toneOverlayOpacity, 0, 1),
    toneOverlayColor: input.toneOverlayColor ?? base.toneOverlayColor,
    textureMatchOpacity: clamp(input.textureMatchOpacity ?? base.textureMatchOpacity, 0, 1),
    paletteContinuityOpacity: clamp(input.paletteContinuityOpacity ?? base.paletteContinuityOpacity, 0, 1),
    linePreserveOpacity: clamp(input.linePreserveOpacity ?? base.linePreserveOpacity, 0, 1),
    renderPathCompensation: input.renderPathCompensation ?? base.renderPathCompensation,
    episodeFinishProfileId: input.episodeFinishProfileId ?? base.episodeFinishProfileId
  };
}

function baseStudioProfile(id: FinishProfileId, color: string): ShotFinishProfile {
  return {
    id,
    grainOpacity: 0.045,
    scanlineOpacity: 0.05,
    vignetteOpacity: 0.18,
    tintOpacity: 0.03,
    bloomOpacity: 0.06,
    sharpenOpacity: 0.08,
    toneOverlayOpacity: 0.04,
    toneOverlayColor: color,
    textureMatchOpacity: 0.12,
    paletteContinuityOpacity: 0.1,
    linePreserveOpacity: 0.08,
    renderPathCompensation: "deterministic"
  };
}

export function resolveShotFinishProfile(input: ShotFinishProfileInput): ShotFinishProfile {
  const channel = input.profiles?.channel.domain ?? "economy";
  const hasPrimaryDataVisual =
    Boolean(input.shot.chart) ||
    input.shot.shot_grammar.insert_need.includes("chart") ||
    Boolean(
      input.shot.visual_objects?.some(
        (object) => object.kind === "bar_chart" || object.kind === "line_chart" || object.kind === "table"
      )
    );
  const channelBase =
    channel === "medical"
      ? baseStudioProfile("medical_soft_clarity_v1", "rgba(137, 225, 210, 1)")
      : baseStudioProfile("economy_clean_analytic_v1", "rgba(243, 199, 99, 1)");

  if (input.shot.render_mode === "generative_i2v" || input.shot.render_mode === "generative_s2v") {
    return withAdjustments(
      {
        ...channelBase,
        id: "sidecar_match_hunyuan_v1"
      },
      {
        grainOpacity: 0.07,
        scanlineOpacity: 0.03,
        vignetteOpacity: 0.24,
        tintOpacity: 0.04,
        bloomOpacity: 0.1,
        sharpenOpacity: 0.11,
        toneOverlayOpacity: 0.08,
        textureMatchOpacity: 0.24,
        paletteContinuityOpacity: 0.22,
        linePreserveOpacity: 0.17,
        renderPathCompensation: "sidecar_hunyuan"
      }
    );
  }

  if (input.shot.render_mode === "generative_broll") {
    return withAdjustments(
      {
        ...channelBase,
        id: "sidecar_match_wan_v1"
      },
      {
        grainOpacity: 0.08,
        scanlineOpacity: 0.04,
        vignetteOpacity: 0.26,
        tintOpacity: 0.05,
        bloomOpacity: 0.08,
        sharpenOpacity: 0.1,
        toneOverlayOpacity: 0.07,
        textureMatchOpacity: 0.28,
        paletteContinuityOpacity: 0.24,
        linePreserveOpacity: 0.16,
        renderPathCompensation: "sidecar_wan"
      }
    );
  }

  if (input.shot.shot_type === "reaction") {
    return withAdjustments(channelBase, {
      bloomOpacity: 0.08,
      vignetteOpacity: 0.24,
      textureMatchOpacity: 0.14,
      paletteContinuityOpacity: 0.12
    });
  }

  if (hasPrimaryDataVisual) {
    return withAdjustments(channelBase, {
      grainOpacity: 0.035,
      scanlineOpacity: 0.02,
      vignetteOpacity: 0.14,
      sharpenOpacity: 0.12,
      toneOverlayOpacity: channel === "medical" ? 0.03 : 0.05,
      textureMatchOpacity: 0.1,
      paletteContinuityOpacity: 0.08,
      linePreserveOpacity: 0.12
    });
  }

  return channelBase;
}
