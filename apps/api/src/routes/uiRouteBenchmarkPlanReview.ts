type JsonRecord = Record<string, unknown>;

type RolloutArtifactSource = {
  label: string;
  outRoot: string;
};

export type SidecarPlanReviewEntry = {
  providerSummary: string;
  policySummary: string;
  attemptSummary: string;
  selectedCandidateId: string;
  requestPath: string | null;
  candidateJudgePath: string | null;
  actualJudgePath: string | null;
  visualJudgePath: string | null;
  preflightPath: string | null;
  resultPath: string | null;
};

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

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function compact(parts: Array<string | null | undefined>, separator = " | "): string {
  return parts
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
    .join(separator);
}

function summarizeValues(values: Array<string | null | undefined>, limit = 3): string {
  const normalized = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  if (normalized.length === 0) {
    return "-";
  }
  const preview = normalized.slice(0, limit).join(", ");
  return normalized.length > limit ? `${preview} (+${normalized.length - limit})` : preview;
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

function formatNumber(value: unknown, digits = 2): string {
  const parsed = num(value);
  if (parsed === null) return "-";
  return parsed.toFixed(digits).replace(/\.?0+$/, "");
}

function recordList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((row): row is JsonRecord => isRecord(row)) : [];
}

function safePlanArtifactPath(
  source: RolloutArtifactSource,
  artifact: unknown,
  safeJsonArtifactPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null,
  safeRolloutTextPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null,
  safeRolloutVideoPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null
): string | null {
  if (!isRecord(artifact)) return null;
  const candidatePath = artifact.path;
  const kind = (str(artifact.kind) ?? "").toLowerCase();
  const ext = (str(candidatePath) ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (kind === "video" || ext === "mp4" || ext === "webm") {
    return safeRolloutVideoPath(source, candidatePath);
  }
  if (kind === "plan" || ext === "txt") {
    return safeRolloutTextPath(source, candidatePath);
  }
  return safeJsonArtifactPath(source, candidatePath) ?? safeRolloutTextPath(source, candidatePath);
}

function pickPlanArtifactPath(
  source: RolloutArtifactSource,
  plan: JsonRecord,
  fragments: string[],
  safeJsonArtifactPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null,
  safeRolloutTextPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null,
  safeRolloutVideoPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null
): string | null {
  const normalized = fragments.map((value) => value.toLowerCase());
  for (const artifact of recordList(plan.artifacts)) {
    const label = (str(artifact.label) ?? "").toLowerCase();
    if (!normalized.some((fragment) => label.includes(fragment))) {
      continue;
    }
    const resolvedPath = safePlanArtifactPath(
      source,
      artifact,
      safeJsonArtifactPath,
      safeRolloutTextPath,
      safeRolloutVideoPath
    );
    if (resolvedPath) {
      return resolvedPath;
    }
  }
  return null;
}

export function buildSidecarPlanReviewMap(input: {
  source: RolloutArtifactSource;
  sidecarPlan: unknown;
  safeJsonArtifactPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null;
  safeRolloutTextPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null;
  safeRolloutVideoPath: (source: RolloutArtifactSource, candidatePath: unknown) => string | null;
}): Map<string, SidecarPlanReviewEntry> {
  const reviewByShot = new Map<string, SidecarPlanReviewEntry>();
  if (!isRecord(input.sidecarPlan)) {
    return reviewByShot;
  }

  for (const plan of recordList(input.sidecarPlan.plans)) {
    const shotId = str(plan.shotId);
    if (!shotId) continue;
    const metadata = isRecord(plan.metadata) ? plan.metadata : {};
    const policyTags = uniqueStrings((Array.isArray(metadata.policyTags) ? metadata.policyTags : []).map((value) => str(value)));
    const attempt = num(metadata.attempt);
    const maxAttempts = num(metadata.maxAttempts);
    reviewByShot.set(shotId, {
      providerSummary:
        compact(
          [
            str(metadata.actualBackendCapability) ?? str(metadata.backendCapability) ?? str(metadata.requestedBackend),
            str(metadata.actualRenderer) ?? str(plan.renderer) ?? str(metadata.requestedRenderer)
          ],
          " / "
        ) || "-",
      policySummary:
        compact(
          [
            str(metadata.controlnetPreset),
            str(metadata.impactPreset),
            str(metadata.qcPreset),
            policyTags.length > 0 ? `tags ${summarizeValues(policyTags, 3)}` : null
          ],
          " | "
        ) || "-",
      attemptSummary:
        attempt === null
          ? "-"
          : maxAttempts !== null
            ? `${formatNumber(attempt, 0)}/${formatNumber(maxAttempts, 0)}`
            : formatNumber(attempt, 0),
      selectedCandidateId:
        str(metadata.premiumActualSelectedCandidateId) ??
        str(metadata.premiumSelectedCandidateId) ??
        str(isRecord(plan.judge) ? plan.judge.candidateId : undefined) ??
        "-",
      requestPath: pickPlanArtifactPath(
        input.source,
        plan,
        ["request"],
        input.safeJsonArtifactPath,
        input.safeRolloutTextPath,
        input.safeRolloutVideoPath
      ),
      candidateJudgePath:
        input.safeJsonArtifactPath(input.source, metadata.premiumCandidateJudgePath) ??
        pickPlanArtifactPath(
          input.source,
          plan,
          ["candidate-judge"],
          input.safeJsonArtifactPath,
          input.safeRolloutTextPath,
          input.safeRolloutVideoPath
        ),
      actualJudgePath:
        input.safeJsonArtifactPath(input.source, metadata.premiumActualJudgePath) ??
        pickPlanArtifactPath(
          input.source,
          plan,
          ["actual-judge"],
          input.safeJsonArtifactPath,
          input.safeRolloutTextPath,
          input.safeRolloutVideoPath
        ),
      visualJudgePath:
        input.safeJsonArtifactPath(input.source, metadata.premiumActualVisualSignalReportPath) ??
        pickPlanArtifactPath(
          input.source,
          plan,
          ["visual-judge"],
          input.safeJsonArtifactPath,
          input.safeRolloutTextPath,
          input.safeRolloutVideoPath
        ),
      preflightPath: pickPlanArtifactPath(
        input.source,
        plan,
        ["preflight"],
        input.safeJsonArtifactPath,
        input.safeRolloutTextPath,
        input.safeRolloutVideoPath
      ),
      resultPath: pickPlanArtifactPath(
        input.source,
        plan,
        ["result"],
        input.safeJsonArtifactPath,
        input.safeRolloutTextPath,
        input.safeRolloutVideoPath
      )
    });
  }

  return reviewByShot;
}
