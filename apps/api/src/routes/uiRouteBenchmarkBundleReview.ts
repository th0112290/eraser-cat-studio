type JsonRecord = Record<string, unknown>;

export type ReviewIssueEntry = {
  code: string;
  severity: string;
  message: string;
  shotId: string | null;
  stage: string | null;
  detailsSummary: string | null;
};

export type BundleReviewState = {
  finalPassed: boolean | null;
  finalStage: string | null;
  fallbackSteps: string[];
  qcArtifactPath: string | null;
  renderLogPath: string | null;
  issuesByShot: Map<string, ReviewIssueEntry[]>;
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

function formatNumber(value: unknown, digits = 2): string {
  const parsed = num(value);
  if (parsed === null) return "-";
  return parsed.toFixed(digits).replace(/\.?0+$/, "");
}

function compact(parts: Array<string | null | undefined>, separator = " | "): string {
  return parts
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0)
    .join(separator);
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

function recordList(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter((row): row is JsonRecord => isRecord(row)) : [];
}

function readBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function rolloutDetailItems(value: unknown, limit = 10): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => {
        if (typeof entry === "string") return [entry];
        if (isRecord(entry)) {
          const check = str(entry.check);
          const severity = str(entry.severity);
          const message = str(entry.message) ?? str(entry.reason) ?? str(entry.issue);
          return [compact([severity, check, message], " / ")];
        }
        return [];
      })
      .filter((entry) => entry.length > 0)
      .slice(0, limit);
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .flatMap(([key, entry]) => {
        if (typeof entry === "string") return [`${key}: ${entry}`];
        if (typeof entry === "number" && Number.isFinite(entry)) return [`${key}: ${formatNumber(entry, 3)}`];
        if (typeof entry === "boolean") return [`${key}: ${entry ? "true" : "false"}`];
        return [];
      })
      .slice(0, limit);
  }
  return [];
}

function collectReviewIssuesByShot(report: unknown): Map<string, ReviewIssueEntry[]> {
  const issuesByShot = new Map<string, ReviewIssueEntry[]>();
  const pushIssue = (raw: unknown, stage: string | null): void => {
    if (!isRecord(raw)) return;
    const shotId = str(raw.shotId) ?? str(raw.shot_id) ?? "*";
    const entry: ReviewIssueEntry = {
      code: str(raw.code) ?? str(raw.check) ?? str(raw.rule) ?? str(raw.name) ?? "issue",
      severity: str(raw.severity) ?? "INFO",
      message: str(raw.message) ?? str(raw.reason) ?? str(raw.details) ?? "-",
      shotId: shotId === "*" ? null : shotId,
      stage,
      detailsSummary: rolloutDetailItems(raw.details, 2)[0] ?? null
    };
    const bucket = issuesByShot.get(shotId) ?? [];
    const duplicate = bucket.some(
      (item) =>
        item.code === entry.code &&
        item.severity === entry.severity &&
        item.message === entry.message &&
        item.stage === entry.stage
    );
    if (!duplicate) {
      bucket.push(entry);
      issuesByShot.set(shotId, bucket);
    }
  };

  if (!isRecord(report)) {
    return issuesByShot;
  }

  for (const issue of recordList(report.issues)) {
    pushIssue(issue, null);
  }
  for (const run of recordList(report.runs)) {
    const stage = str(run.stage);
    for (const issue of recordList(run.issues)) {
      pushIssue(issue, stage);
    }
  }
  return issuesByShot;
}

export function reviewIssuesForShot(issuesByShot: Map<string, ReviewIssueEntry[]>, shotId: string): ReviewIssueEntry[] {
  return [...(issuesByShot.get(shotId) ?? []), ...(issuesByShot.get("*") ?? [])];
}

export function summarizeReviewIssues(entries: ReviewIssueEntry[], limit = 2): string {
  if (entries.length === 0) return "-";
  const summary = entries
    .slice(0, limit)
    .map((entry) => compact([entry.severity, entry.code, entry.message], " / "))
    .join("; ");
  return entries.length > limit ? `${summary} (+${entries.length - limit})` : summary;
}

export function collectBundleReviewState(input: {
  qcDoc: unknown;
  renderLogDoc: unknown;
  qcArtifactPath: string | null;
  renderLogPath: string | null;
}): BundleReviewState {
  const qcDoc = isRecord(input.qcDoc) ? input.qcDoc : {};
  const renderLogDoc = isRecord(input.renderLogDoc) ? input.renderLogDoc : {};
  const regressionSummary = isRecord(renderLogDoc.episode_regression_summary) ? renderLogDoc.episode_regression_summary : {};
  return {
    finalPassed:
      readBooleanOrNull(qcDoc.final_passed) ??
      readBooleanOrNull(regressionSummary.final_passed) ??
      readBooleanOrNull(renderLogDoc.qc_passed),
    finalStage: str(qcDoc.final_stage) ?? str(renderLogDoc.final_stage) ?? null,
    fallbackSteps: uniqueStrings([
      ...(Array.isArray(qcDoc.fallback_steps_applied) ? qcDoc.fallback_steps_applied : []).map((value) => str(value)),
      ...(Array.isArray(renderLogDoc.fallback_steps_applied) ? renderLogDoc.fallback_steps_applied : []).map((value) => str(value))
    ]),
    qcArtifactPath: input.qcArtifactPath,
    renderLogPath: input.renderLogPath,
    issuesByShot: collectReviewIssuesByShot(input.qcDoc)
  };
}
