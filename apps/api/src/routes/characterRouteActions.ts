type JsonRecord = Record<string, unknown>;

export type CharacterOverrideKind = "anchors" | "cropBoxes";
export type CharacterProposalApplyMode = CharacterOverrideKind | "all";

export type CharacterProposalApplyRequest = {
  generateJobId: string;
  applyMode: CharacterProposalApplyMode;
  rebuild: boolean;
};

export type CharacterRebuildSelectedRequest = {
  generateJobId: string;
};

export type CharacterGenerationSelection = {
  front: string;
  threeQuarter: string;
  profile: string;
};

export type CreationNavState = {
  returnTo?: string;
  currentObject?: string;
  focus?: string;
  assetId?: string;
  referenceAssetId?: string;
  jobId?: string;
  characterPackId?: string;
  packId?: string;
  episodeId?: string;
};

type ActionHttpError = Error & { statusCode: number; details?: unknown };

function createActionHttpError(statusCode: number, message: string, details?: unknown): ActionHttpError {
  const error = new Error(message) as ActionHttpError;
  error.statusCode = statusCode;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
}

function requireBodyObject(body: unknown): JsonRecord {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw createActionHttpError(400, "request body must be an object");
  }
  return body as JsonRecord;
}

function optionalString(obj: JsonRecord, field: string): string | undefined {
  const value = obj[field];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildUiHref(
  pathname: string,
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text.length === 0) {
      continue;
    }
    search.set(key, text);
  }
  const query = search.toString();
  return query.length > 0 ? `${pathname}?${query}` : pathname;
}

export function hrefWithCreationNav(
  pathname: string,
  params: Record<string, string | number | boolean | undefined | null>,
  nav: CreationNavState
): string {
  return buildUiHref(pathname, {
    ...params,
    ...(nav.returnTo ? { returnTo: nav.returnTo } : {}),
    ...(nav.currentObject ? { currentObject: nav.currentObject } : {}),
    ...(nav.focus ? { focus: nav.focus } : {})
  });
}

export function readCreationNavState(root: JsonRecord): CreationNavState {
  return {
    returnTo: optionalString(root, "returnTo"),
    currentObject: optionalString(root, "currentObject"),
    focus: optionalString(root, "focus"),
    assetId: optionalString(root, "assetId"),
    referenceAssetId: optionalString(root, "referenceAssetId"),
    jobId: optionalString(root, "jobId"),
    characterPackId: optionalString(root, "characterPackId"),
    packId: optionalString(root, "packId"),
    episodeId: optionalString(root, "episodeId")
  };
}

export function renderCreationNavHiddenFields(nav: CreationNavState): string {
  return [
    ["returnTo", nav.returnTo],
    ["currentObject", nav.currentObject],
    ["focus", nav.focus],
    ["assetId", nav.assetId],
    ["referenceAssetId", nav.referenceAssetId]
  ]
    .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
    .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}"/>`)
    .join("");
}

export function requestUiHref(request: { raw?: { url?: string } }): string {
  return typeof request.raw?.url === "string" && request.raw.url.trim().length > 0 ? request.raw.url : "/";
}

export function buildCharacterProposalApplyUiHref(input: {
  pathname?: string;
  generateJobId: string;
  rebuiltGenerateJobId?: string | null;
  appliedKinds: CharacterOverrideKind[];
  creationNav: CreationNavState;
}): string {
  const pathname = input.pathname ?? "/ui/character-generator";
  const appliedKindsLabel = input.appliedKinds.join(" + ");
  if (input.rebuiltGenerateJobId) {
    return hrefWithCreationNav(
      pathname,
      {
        jobId: input.rebuiltGenerateJobId,
        message: `Applied proposal ${appliedKindsLabel} and queued current-selection rebuild.`
      },
      {
        ...input.creationNav,
        currentObject: `run:${input.rebuiltGenerateJobId}`,
        focus: "cg-apply-proposal"
      }
    );
  }
  return hrefWithCreationNav(
    pathname,
    {
      jobId: input.generateJobId,
      message: `Applied proposal ${appliedKindsLabel} to override files. Rebuild current selection when you want fresh pack evidence.`
    },
    {
      ...input.creationNav,
      currentObject: input.creationNav.currentObject ?? `run:${input.generateJobId}`,
      focus: "cg-apply-proposal"
    }
  );
}

export function buildCharacterRebuildSelectedUiHref(input: {
  pathname?: string;
  rebuiltGenerateJobId: string;
  creationNav: CreationNavState;
}): string {
  return hrefWithCreationNav(
    input.pathname ?? "/ui/character-generator",
    {
      jobId: input.rebuiltGenerateJobId,
      message: "Current selection rebuild queued. The same selected candidates will rebuild the Character Pack with your latest override files."
    },
    {
      ...input.creationNav,
      currentObject: `run:${input.rebuiltGenerateJobId}`,
      focus: "cg-manual-overrides"
    }
  );
}

export function buildCharacterProposalApplyApiResponse(input: {
  applyMode: CharacterProposalApplyMode;
  appliedKinds: CharacterOverrideKind[];
  characterPackId: string;
  anchorsOverridePath: string | null;
  cropBoxesOverridePath: string | null;
  rebuilt: {
    sessionId: string;
    episodeId: string;
    generateJobId: string;
    buildJobId: string;
    previewJobId: string;
    bullmqJobId: string;
    manifestPath: string;
    selection: CharacterGenerationSelection;
  } | null;
}): {
  data: {
    applyMode: CharacterProposalApplyMode;
    appliedKinds: CharacterOverrideKind[];
    characterPackId: string;
    anchorsOverridePath: string | null;
    cropBoxesOverridePath: string | null;
    rebuilt: {
      sessionId: string;
      episodeId: string;
      generateJobId: string;
      buildJobId: string;
      previewJobId: string;
      bullmqJobId: string;
      manifestPath: string;
      selection: CharacterGenerationSelection;
    } | null;
  };
} {
  return {
    data: {
      applyMode: input.applyMode,
      appliedKinds: input.appliedKinds,
      characterPackId: input.characterPackId,
      anchorsOverridePath: input.anchorsOverridePath,
      cropBoxesOverridePath: input.cropBoxesOverridePath,
      rebuilt: input.rebuilt
    }
  };
}

export function buildCharacterRebuildSelectedApiResponse(input: {
  created: {
    sessionId: string;
    episodeId: string;
    generateJobId: string;
    buildJobId: string;
    previewJobId: string;
    bullmqJobId: string;
    manifestPath: string;
    selection: CharacterGenerationSelection;
  };
}): {
  data: {
    sessionId: string;
    episodeId: string;
    generateJobId: string;
    buildJobId: string;
    previewJobId: string;
    bullmqJobId: string;
    manifestPath: string;
    selection: CharacterGenerationSelection;
  };
} {
  return {
    data: input.created
  };
}

export function parseCharacterProposalApplyRequest(body: unknown): CharacterProposalApplyRequest {
  const payload = requireBodyObject(body);
  const generateJobId = optionalString(payload, "generateJobId");
  const applyModeRaw = optionalString(payload, "applyMode") ?? "all";
  const rebuild = payload.rebuild === true || optionalString(payload, "afterApply") === "rebuild";
  if (!generateJobId) {
    throw createActionHttpError(400, "generateJobId is required");
  }
  if (applyModeRaw !== "all" && applyModeRaw !== "anchors" && applyModeRaw !== "cropBoxes") {
    throw createActionHttpError(400, "applyMode must be all, anchors, or cropBoxes");
  }
  return {
    generateJobId,
    applyMode: applyModeRaw,
    rebuild
  };
}

export function parseCharacterRebuildSelectedRequest(body: unknown): CharacterRebuildSelectedRequest {
  const payload = requireBodyObject(body);
  const generateJobId = optionalString(payload, "generateJobId");
  if (!generateJobId) {
    throw createActionHttpError(400, "generateJobId is required");
  }
  return {
    generateJobId
  };
}
