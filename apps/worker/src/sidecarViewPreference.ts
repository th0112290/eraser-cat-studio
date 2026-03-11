export type SidecarViewName = "front" | "threeQuarter" | "profile";

type SidecarViewTrackPoint = {
  f?: number;
  view?: SidecarViewName;
};

type SidecarShotLike = {
  character?: {
    tracks?: {
      view_track?: SidecarViewTrackPoint[];
      viewTrack?: SidecarViewTrackPoint[];
    };
    view_track?: SidecarViewTrackPoint[];
    viewTrack?: SidecarViewTrackPoint[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSidecarViewName(value: unknown): value is SidecarViewName {
  return value === "front" || value === "threeQuarter" || value === "profile";
}

export function normalizeShotViewTrack(value: unknown): Array<{ f: number; view: SidecarViewName }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!isRecord(entry) || !isSidecarViewName(entry.view)) {
        return null;
      }
      const frame = typeof entry.f === "number" && Number.isFinite(entry.f) ? entry.f : 0;
      return {
        f: frame,
        view: entry.view
      };
    })
    .filter((entry): entry is { f: number; view: SidecarViewName } => entry !== null)
    .sort((left, right) => left.f - right.f);
}

export function resolveRequestedReferenceView(input: {
  shot: SidecarShotLike;
  renderMode: string;
  availableViewNames: SidecarViewName[];
}): {
  view: SidecarViewName | null;
  source: "view_track" | "render_mode_default" | "none";
} {
  const characterValue = input.shot.character as unknown;
  const characterRecord = isRecord(characterValue) ? characterValue : null;
  const tracksValue = characterRecord?.["tracks"];
  const tracksRecord = isRecord(tracksValue) ? tracksValue : null;
  const explicitTrack =
    [
      tracksRecord?.["view_track"],
      tracksRecord?.["viewTrack"],
      characterRecord?.["view_track"],
      characterRecord?.["viewTrack"]
    ]
      .map((candidate) => normalizeShotViewTrack(candidate))
      .find((candidate) => candidate.length > 0) ?? [];
  const explicitView = explicitTrack.find((entry) => input.availableViewNames.includes(entry.view))?.view ?? null;
  if (explicitView) {
    return {
      view: explicitView,
      source: "view_track"
    };
  }

  if (input.renderMode === "generative_i2v" && input.availableViewNames.includes("front")) {
    return {
      view: "front",
      source: "render_mode_default"
    };
  }

  if (input.renderMode === "generative_s2v") {
    if (input.availableViewNames.includes("profile")) {
      return {
        view: "profile",
        source: "render_mode_default"
      };
    }
    if (input.availableViewNames.includes("threeQuarter")) {
      return {
        view: "threeQuarter",
        source: "render_mode_default"
      };
    }
  }

  return {
    view: null,
    source: "none"
  };
}
