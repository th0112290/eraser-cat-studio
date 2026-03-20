import path from "node:path";
import type { CharacterView } from "@ec/image-gen";

export type SelectionSource = "auto" | "hitl";

export type ManifestSelectedByView = Partial<Record<CharacterView, { candidateId: string }>>;

type SelectedCandidateLike = {
  candidate?: {
    id?: string | null;
  } | null;
};

type MascotContinuityPolicy = {
  maxSessionAgeHours: number;
  minScore: number;
  maxRejections: number;
  requirePicked: boolean;
  requireScore: boolean;
  candidateTake: number;
  preferredSessionTake: number;
  fallbackSessionTake: number;
  requestOverride: boolean | null;
};

export type ManifestContinuity = {
  enabled: boolean;
  attempted: boolean;
  applied: boolean;
  reason: string;
  attemptedSourceSessionId?: string;
  cutoffUpdatedAt?: string;
  queuedSessionCount?: number;
  uniqueQueuedSessionCount?: number;
  duplicateSessionCount?: number;
  searchedSessionCount?: number;
  searchedSessionIdsPreview?: string[];
  preferredPoolCount?: number;
  fallbackPoolCount?: number;
  sourcePool?: "preferred" | "fallback";
  candidatePicked?: boolean;
  candidateScore?: number | null;
  candidateRejectionCount?: number | null;
  candidateUpdatedAt?: string | null;
  policy?: MascotContinuityPolicy;
};

type ManifestScoreThresholdInput = {
  selectionHints?: {
    minAcceptedScore?: number;
  } | null;
  qualityProfile?: {
    targetStyle?: string | null;
    qualityTier?: string | null;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveDefaultRepoRoot(): string {
  return path.resolve(process.cwd(), "..", "..");
}

export function manifestBasePath(jobDbId: string, manifestPath: string | undefined, repoRoot?: string): string {
  if (manifestPath && manifestPath.trim().length > 0) {
    return path.resolve(manifestPath);
  }

  return path.join(repoRoot ?? resolveDefaultRepoRoot(), "out", "characters", "generations", jobDbId, "generation_manifest.json");
}

export function buildManifestSelectedByView(
  selectedByView: Partial<Record<CharacterView, SelectedCandidateLike | undefined>>
): ManifestSelectedByView {
  const manifestSelectedByView: ManifestSelectedByView = {};
  for (const [view, candidate] of Object.entries(selectedByView) as Array<[CharacterView, SelectedCandidateLike | undefined]>) {
    const candidateId = candidate?.candidate?.id?.trim();
    if (candidateId) {
      manifestSelectedByView[view] = { candidateId };
    }
  }
  return manifestSelectedByView;
}

export function resolveManifestReadPath(
  jobDbId: string,
  paths: {
    manifestPath?: string;
    sourceManifestPath?: string;
  },
  repoRoot?: string
): string {
  if (typeof paths.sourceManifestPath === "string" && paths.sourceManifestPath.trim().length > 0) {
    return path.resolve(paths.sourceManifestPath);
  }

  return manifestBasePath(jobDbId, paths.manifestPath, repoRoot);
}

export function resolveHitlSelectionManifestReadPath(
  jobDbId: string,
  paths: {
    manifestPath?: string;
    sourceManifestPath?: string;
  },
  repoRoot?: string
): string {
  return resolveManifestReadPath(jobDbId, paths, repoRoot);
}

export function shouldRetainSelectedByViewOnSelectionBlock(source: SelectionSource): boolean {
  return source === "hitl";
}

export function shouldContinueBlockedSelectionBuild(source: SelectionSource): boolean {
  return source === "hitl";
}

export function parseManifestContinuity(value: unknown): ManifestContinuity | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const enabled = typeof value.enabled === "boolean" ? value.enabled : undefined;
  const attempted = typeof value.attempted === "boolean" ? value.attempted : undefined;
  const applied = typeof value.applied === "boolean" ? value.applied : undefined;
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (enabled === undefined || attempted === undefined || applied === undefined || reason.length === 0) {
    return undefined;
  }
  const asOptionalNumber = (input: unknown): number | undefined =>
    typeof input === "number" && Number.isFinite(input) ? input : undefined;
  const asOptionalNullableNumber = (input: unknown): number | null | undefined =>
    input === null ? null : typeof input === "number" && Number.isFinite(input) ? input : undefined;
  const asOptionalNullableString = (input: unknown): string | null | undefined =>
    input === null ? null : typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
  const asOptionalString = (input: unknown): string | undefined =>
    typeof input === "string" && input.trim().length > 0 ? input.trim() : undefined;
  const asOptionalStringArray = (input: unknown): string[] | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }
    const out = input
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
    return out.length > 0 ? out : undefined;
  };

  const policyRaw = isRecord(value.policy) ? value.policy : undefined;
  const parsedPolicy =
    policyRaw &&
    typeof policyRaw.maxSessionAgeHours === "number" &&
    Number.isFinite(policyRaw.maxSessionAgeHours) &&
    typeof policyRaw.minScore === "number" &&
    Number.isFinite(policyRaw.minScore) &&
    typeof policyRaw.maxRejections === "number" &&
    Number.isFinite(policyRaw.maxRejections) &&
    typeof policyRaw.requirePicked === "boolean" &&
    typeof policyRaw.requireScore === "boolean" &&
    typeof policyRaw.candidateTake === "number" &&
    Number.isFinite(policyRaw.candidateTake) &&
    typeof policyRaw.preferredSessionTake === "number" &&
    Number.isFinite(policyRaw.preferredSessionTake) &&
    typeof policyRaw.fallbackSessionTake === "number" &&
    Number.isFinite(policyRaw.fallbackSessionTake)
      ? {
          maxSessionAgeHours: policyRaw.maxSessionAgeHours,
          minScore: policyRaw.minScore,
          maxRejections: policyRaw.maxRejections,
          requirePicked: policyRaw.requirePicked,
          requireScore: policyRaw.requireScore,
          candidateTake: policyRaw.candidateTake,
          preferredSessionTake: policyRaw.preferredSessionTake,
          fallbackSessionTake: policyRaw.fallbackSessionTake,
          requestOverride:
            typeof policyRaw.requestOverride === "boolean" || policyRaw.requestOverride === null
              ? policyRaw.requestOverride
              : null
        }
      : undefined;

  return {
    enabled,
    attempted,
    applied,
    reason,
    ...(asOptionalString(value.attemptedSourceSessionId)
      ? { attemptedSourceSessionId: asOptionalString(value.attemptedSourceSessionId) }
      : {}),
    ...(asOptionalString(value.cutoffUpdatedAt) ? { cutoffUpdatedAt: asOptionalString(value.cutoffUpdatedAt) } : {}),
    ...(asOptionalNumber(value.queuedSessionCount) !== undefined
      ? { queuedSessionCount: asOptionalNumber(value.queuedSessionCount) }
      : {}),
    ...(asOptionalNumber(value.uniqueQueuedSessionCount) !== undefined
      ? { uniqueQueuedSessionCount: asOptionalNumber(value.uniqueQueuedSessionCount) }
      : {}),
    ...(asOptionalNumber(value.duplicateSessionCount) !== undefined
      ? { duplicateSessionCount: asOptionalNumber(value.duplicateSessionCount) }
      : {}),
    ...(asOptionalNumber(value.searchedSessionCount) !== undefined
      ? { searchedSessionCount: asOptionalNumber(value.searchedSessionCount) }
      : {}),
    ...(asOptionalStringArray(value.searchedSessionIdsPreview)
      ? { searchedSessionIdsPreview: asOptionalStringArray(value.searchedSessionIdsPreview) }
      : {}),
    ...(asOptionalNumber(value.preferredPoolCount) !== undefined
      ? { preferredPoolCount: asOptionalNumber(value.preferredPoolCount) }
      : {}),
    ...(asOptionalNumber(value.fallbackPoolCount) !== undefined
      ? { fallbackPoolCount: asOptionalNumber(value.fallbackPoolCount) }
      : {}),
    ...(value.sourcePool === "preferred" || value.sourcePool === "fallback" ? { sourcePool: value.sourcePool } : {}),
    ...(typeof value.candidatePicked === "boolean" ? { candidatePicked: value.candidatePicked } : {}),
    ...(asOptionalNullableNumber(value.candidateScore) !== undefined
      ? { candidateScore: asOptionalNullableNumber(value.candidateScore) }
      : {}),
    ...(asOptionalNullableNumber(value.candidateRejectionCount) !== undefined
      ? { candidateRejectionCount: asOptionalNullableNumber(value.candidateRejectionCount) }
      : {}),
    ...(asOptionalNullableString(value.candidateUpdatedAt) !== undefined
      ? { candidateUpdatedAt: asOptionalNullableString(value.candidateUpdatedAt) }
      : {}),
    ...(parsedPolicy ? { policy: parsedPolicy } : {})
  };
}

export function formatContinuityDescriptor(
  continuity: ManifestContinuity | undefined,
  options?: {
    includeQueueStats?: boolean;
  }
): string | null {
  if (!continuity?.reason) {
    return null;
  }
  const parts = [`Continuity=${continuity.reason}`];
  if (continuity.attemptedSourceSessionId) {
    parts.push(`source=${continuity.attemptedSourceSessionId}`);
  }
  if (continuity.sourcePool) {
    parts.push(`pool=${continuity.sourcePool}`);
  }
  if (options?.includeQueueStats) {
    const queueStats = formatContinuityQueueStats(continuity);
    if (queueStats) {
      parts.push(queueStats);
    }
  }
  return parts.join(" ");
}

export function formatContinuitySentence(continuity: ManifestContinuity | undefined): string {
  const descriptor = formatContinuityDescriptor(continuity);
  if (!descriptor) {
    return "";
  }
  return ` ${descriptor}.`;
}

export function formatContinuityQueueStats(continuity: ManifestContinuity | undefined): string | null {
  if (!continuity?.attempted) {
    return null;
  }
  const queued = continuity.queuedSessionCount;
  const unique = continuity.uniqueQueuedSessionCount;
  const duplicates = continuity.duplicateSessionCount;
  const searched = continuity.searchedSessionCount;
  if (
    typeof queued !== "number" ||
    !Number.isFinite(queued) ||
    typeof unique !== "number" ||
    !Number.isFinite(unique) ||
    typeof duplicates !== "number" ||
    !Number.isFinite(duplicates)
  ) {
    return null;
  }
  const parts = [`queue=${queued}`, `unique=${unique}`, `dup=${duplicates}`];
  if (typeof searched === "number" && Number.isFinite(searched)) {
    parts.push(`searched=${searched}`);
  }
  return parts.join(" ");
}

export function toFlatContinuityFields(continuity: ManifestContinuity | undefined): {
  continuitySummary: ManifestContinuity | null;
  continuityDescriptor: string | null;
  continuityDescriptorWithQueue: string | null;
  continuityReason: string | null;
  continuityApplied: boolean | null;
  continuityAttempted: boolean | null;
  continuitySourceSessionId: string | null;
  continuitySourcePool: "preferred" | "fallback" | null;
  continuityQueuedSessionCount: number | null;
  continuityUniqueQueuedSessionCount: number | null;
  continuityDuplicateSessionCount: number | null;
  continuitySearchedSessionCount: number | null;
  continuityQueueStats: string | null;
} {
  const descriptor = formatContinuityDescriptor(continuity);
  const descriptorWithQueue = formatContinuityDescriptor(continuity, { includeQueueStats: true });
  const queueStats = formatContinuityQueueStats(continuity);
  return {
    continuitySummary: continuity ?? null,
    continuityDescriptor: descriptor,
    continuityDescriptorWithQueue: descriptorWithQueue,
    continuityReason: continuity?.reason ?? null,
    continuityApplied: continuity?.applied ?? null,
    continuityAttempted: continuity?.attempted ?? null,
    continuitySourceSessionId: continuity?.attemptedSourceSessionId ?? null,
    continuitySourcePool: continuity?.sourcePool ?? null,
    continuityQueuedSessionCount: continuity?.queuedSessionCount ?? null,
    continuityUniqueQueuedSessionCount: continuity?.uniqueQueuedSessionCount ?? null,
    continuityDuplicateSessionCount: continuity?.duplicateSessionCount ?? null,
    continuitySearchedSessionCount: continuity?.searchedSessionCount ?? null,
    continuityQueueStats: queueStats
  };
}

export function resolveManifestAcceptedScoreThreshold(
  manifest: ManifestScoreThresholdInput,
  isMascotTargetStyle: (targetStyle: string | undefined) => boolean
): number {
  if (typeof manifest.selectionHints?.minAcceptedScore === "number") {
    return manifest.selectionHints.minAcceptedScore;
  }
  if (isMascotTargetStyle(manifest.qualityProfile?.targetStyle ?? undefined)) {
    return 0.58;
  }
  return manifest.qualityProfile?.qualityTier === "production" ? 0.74 : 0.67;
}
