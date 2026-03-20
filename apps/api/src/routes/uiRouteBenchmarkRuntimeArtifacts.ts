type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function recordList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((row): row is JsonRecord => isRecord(row)) : [];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function isShotsDocLike(value: unknown): value is JsonRecord & { shots: unknown[] } {
  return isRecord(value) && Array.isArray(value.shots);
}

function readRuntimeShotId(shot: unknown): string | null {
  if (!isRecord(shot)) {
    return null;
  }
  return str(shot.shot_id) ?? str(shot.shotId) ?? str(shot.id);
}

function readRuntimeShotCharacterPackId(shot: unknown): string | null {
  if (!isRecord(shot)) {
    return null;
  }
  const character = isRecord(shot.character) ? shot.character : {};
  return str(character.pack_id) ?? str(character.packId);
}

type NormalizeArtifactPath = (candidatePath: unknown) => string | null;

type RuntimeFixtureBundleLike = {
  smokeDoc: JsonRecord;
  renderLogDoc: unknown | null;
  runtimePath: string | null;
};

export function collectRuntimePackIdsFromShotsDoc(runtimeDoc: unknown): string[] {
  if (!isShotsDocLike(runtimeDoc)) {
    return [];
  }
  return uniqueStrings(recordList(runtimeDoc.shots).map((shot) => readRuntimeShotCharacterPackId(shot)));
}

export function resolveRuntimeShotCharacterPackId(runtimeDoc: unknown, shotId: string): string | null {
  if (!isShotsDocLike(runtimeDoc)) {
    return null;
  }
  const matchingPackIds = uniqueStrings(
    recordList(runtimeDoc.shots)
      .filter((shot) => readRuntimeShotId(shot) === shotId)
      .map((shot) => readRuntimeShotCharacterPackId(shot))
  );
  if (matchingPackIds.length === 1) {
    return matchingPackIds[0] ?? null;
  }
  if (matchingPackIds.length > 1) {
    return null;
  }
  const bundlePackIds = collectRuntimePackIdsFromShotsDoc(runtimeDoc);
  return bundlePackIds.length === 1 ? bundlePackIds[0] ?? null : null;
}

export function collectBundleFixturePath(
  bundle: RuntimeFixtureBundleLike,
  normalizeArtifactPath: NormalizeArtifactPath
): string | null {
  return (
    normalizeArtifactPath(bundle.smokeDoc.fixture_path) ??
    normalizeArtifactPath(isRecord(bundle.renderLogDoc) ? bundle.renderLogDoc.shots_path : undefined) ??
    bundle.runtimePath
  );
}
