type JsonRecord = Record<string, unknown>;

function str(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type NormalizeArtifactPath = (candidatePath: unknown) => string | null;

export function resolveBenchmarkScenarioHandoffStateWithNormalizer(
  doc: JsonRecord,
  rawScenario: JsonRecord,
  normalizeArtifactPath: NormalizeArtifactPath
): {
  characterPackId: string | null;
  fixturePath: string | null;
} {
  return {
    characterPackId:
      str(rawScenario.character_pack_id) ??
      str(rawScenario.characterPackId) ??
      str(rawScenario.requested_character_pack_id) ??
      str(rawScenario.requestedCharacterPackId) ??
      str(doc.character_pack_id) ??
      str(doc.characterPackId) ??
      str(doc.requested_character_pack_id) ??
      str(doc.requestedCharacterPackId),
    fixturePath:
      normalizeArtifactPath(rawScenario.fixture_path) ??
      normalizeArtifactPath(rawScenario.fixturePath) ??
      normalizeArtifactPath(rawScenario.runtime_fixture_path) ??
      normalizeArtifactPath(rawScenario.runtimeFixturePath) ??
      normalizeArtifactPath(rawScenario.input_path) ??
      normalizeArtifactPath(rawScenario.inputPath) ??
      normalizeArtifactPath(doc.fixture_path) ??
      normalizeArtifactPath(doc.fixturePath) ??
      normalizeArtifactPath(doc.runtime_fixture_path) ??
      normalizeArtifactPath(doc.runtimeFixturePath) ??
      normalizeArtifactPath(doc.input_path) ??
      normalizeArtifactPath(doc.inputPath)
  };
}
