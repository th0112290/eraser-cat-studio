import fs from "node:fs";

type JsonRecord = Record<string, unknown>;

export const RIG_SIGNAL_KEYS = ["head_pose", "eye_drift", "mouth_readability", "landmark_consistency"] as const;
export type RigSignalKey = (typeof RIG_SIGNAL_KEYS)[number];
export type RigAnchorViewKey = "front" | "threeQuarter" | "profile";

export type RigSignalCell = {
  score: number | null;
  status: string | null;
  reasons: string[];
  source: string | null;
  sourceDetail: string | null;
};

export type RigReviewState = {
  signals: Record<RigSignalKey, RigSignalCell>;
  anchorConfidence: number | null;
  anchorByView: Partial<Record<RigAnchorViewKey, number>>;
  lowConfidenceAnchorIds: string[];
  missingAnchorIds: string[];
  reviewOnly: boolean;
  lowAnchorConfidence: boolean;
  recreateRecommended: boolean;
  repairable: boolean | null;
  rigBlocked: boolean;
  rigReasonCodes: string[];
  rigReasonFamilies: string[];
  fallbackReasonCodes: string[];
  issueCodes: string[];
  evidenceSources: string[];
  speciesId: string | null;
  selectedView: string | null;
  requiredManualSlots: string[];
  repairSourceCandidateIds: string[];
  repairLineageSummary: string[];
  directiveFamilySummary: string[];
  anchorOverridePresent: boolean | null;
  cropOverridePresent: boolean | null;
  suggestedAction: string | null;
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

function readBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
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

function readJsonFileSafe(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function readStringAtPath(root: unknown, keys: string[]): string | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return str(current);
}

function readStringArrayAtPath(root: unknown, keys: string[]): string[] {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return [];
    current = current[key];
  }
  return Array.isArray(current)
    ? current.map((item) => str(item)).filter((item): item is string => Boolean(item))
    : [];
}

function readNumberAtPath(root: unknown, keys: string[]): number | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return num(current);
}

function readBooleanAtPath(root: unknown, keys: string[]): boolean | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return readBooleanOrNull(current);
}

function readRecordAtPath(root: unknown, keys: string[]): JsonRecord | null {
  let current: unknown = root;
  for (const key of keys) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return isRecord(current) ? current : null;
}

function firstStringAtPaths(root: unknown, keyPaths: string[][]): string | null {
  for (const keyPath of keyPaths) {
    const value = readStringAtPath(root, keyPath);
    if (value) {
      return value;
    }
  }
  return null;
}

function firstNumberAtPaths(root: unknown, keyPaths: string[][]): number | null {
  for (const keyPath of keyPaths) {
    const value = readNumberAtPath(root, keyPath);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function firstBooleanAtPaths(root: unknown, keyPaths: string[][]): boolean | null {
  for (const keyPath of keyPaths) {
    const value = readBooleanAtPath(root, keyPath);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function firstRecordAtPaths(root: unknown, keyPaths: string[][]): JsonRecord | null {
  for (const keyPath of keyPaths) {
    const value = readRecordAtPath(root, keyPath);
    if (value) {
      return value;
    }
  }
  return null;
}

function flattenStringArraysAtPaths(root: unknown, keyPaths: string[][]): string[] {
  return uniqueStrings(keyPaths.flatMap((keyPath) => readStringArrayAtPath(root, keyPath)));
}

function averageNumbers(values: number[]): number | null {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function createEmptyRigSignalCell(): RigSignalCell {
  return {
    score: null,
    status: null,
    reasons: [],
    source: null,
    sourceDetail: null
  };
}

export function createEmptyRigReviewState(): RigReviewState {
  return {
    signals: Object.fromEntries(RIG_SIGNAL_KEYS.map((signal) => [signal, createEmptyRigSignalCell()])) as Record<RigSignalKey, RigSignalCell>,
    anchorConfidence: null,
    anchorByView: {},
    lowConfidenceAnchorIds: [],
    missingAnchorIds: [],
    reviewOnly: false,
    lowAnchorConfidence: false,
    recreateRecommended: false,
    repairable: null,
    rigBlocked: false,
    rigReasonCodes: [],
    rigReasonFamilies: [],
    fallbackReasonCodes: [],
    issueCodes: [],
    evidenceSources: [],
    speciesId: null,
    selectedView: null,
    requiredManualSlots: [],
    repairSourceCandidateIds: [],
    repairLineageSummary: [],
    directiveFamilySummary: [],
    anchorOverridePresent: null,
    cropOverridePresent: null,
    suggestedAction: null
  };
}

export function mergeRigReviewStates(...states: RigReviewState[]): RigReviewState {
  const merged = createEmptyRigReviewState();
  for (const state of states) {
    for (const signal of RIG_SIGNAL_KEYS) {
      const target = merged.signals[signal];
      const source = state.signals[signal];
      if (target.score === null && source.score !== null) {
        target.score = source.score;
      }
      if (target.status === null && source.status !== null) {
        target.status = source.status;
      }
      if (target.source === null && source.source !== null) {
        target.source = source.source;
      }
      if (target.sourceDetail === null && source.sourceDetail !== null) {
        target.sourceDetail = source.sourceDetail;
      }
      target.reasons = uniqueStrings([...target.reasons, ...source.reasons]);
    }
    if (merged.anchorConfidence === null && state.anchorConfidence !== null) {
      merged.anchorConfidence = state.anchorConfidence;
    }
    for (const view of ["front", "threeQuarter", "profile"] as const) {
      if (merged.anchorByView[view] === undefined && state.anchorByView[view] !== undefined) {
        merged.anchorByView[view] = state.anchorByView[view];
      }
    }
    merged.lowConfidenceAnchorIds = uniqueStrings([...merged.lowConfidenceAnchorIds, ...state.lowConfidenceAnchorIds]);
    merged.missingAnchorIds = uniqueStrings([...merged.missingAnchorIds, ...state.missingAnchorIds]);
    merged.reviewOnly = merged.reviewOnly || state.reviewOnly;
    merged.recreateRecommended = merged.recreateRecommended || state.recreateRecommended;
    if (merged.repairable === null && state.repairable !== null) {
      merged.repairable = state.repairable;
    } else if (state.repairable === true) {
      merged.repairable = true;
    }
    merged.rigBlocked = merged.rigBlocked || state.rigBlocked;
    merged.rigReasonCodes = uniqueStrings([...merged.rigReasonCodes, ...state.rigReasonCodes]);
    merged.rigReasonFamilies = uniqueStrings([...merged.rigReasonFamilies, ...state.rigReasonFamilies]);
    merged.fallbackReasonCodes = uniqueStrings([...merged.fallbackReasonCodes, ...state.fallbackReasonCodes]);
    merged.issueCodes = uniqueStrings([...merged.issueCodes, ...state.issueCodes]);
    merged.evidenceSources = uniqueStrings([...merged.evidenceSources, ...state.evidenceSources]);
    if (merged.speciesId === null && state.speciesId) {
      merged.speciesId = state.speciesId;
    }
    if (merged.selectedView === null && state.selectedView) {
      merged.selectedView = state.selectedView;
    }
    merged.requiredManualSlots = uniqueStrings([...merged.requiredManualSlots, ...state.requiredManualSlots]);
    merged.repairSourceCandidateIds = uniqueStrings([...merged.repairSourceCandidateIds, ...state.repairSourceCandidateIds]);
    merged.repairLineageSummary = uniqueStrings([...merged.repairLineageSummary, ...state.repairLineageSummary]);
    merged.directiveFamilySummary = uniqueStrings([...merged.directiveFamilySummary, ...state.directiveFamilySummary]);
    if (merged.anchorOverridePresent === null && state.anchorOverridePresent !== null) {
      merged.anchorOverridePresent = state.anchorOverridePresent;
    } else if (state.anchorOverridePresent === true) {
      merged.anchorOverridePresent = true;
    }
    if (merged.cropOverridePresent === null && state.cropOverridePresent !== null) {
      merged.cropOverridePresent = state.cropOverridePresent;
    } else if (state.cropOverridePresent === true) {
      merged.cropOverridePresent = true;
    }
    if (merged.suggestedAction === null && state.suggestedAction) {
      merged.suggestedAction = state.suggestedAction;
    }
  }

  const signalFailures = RIG_SIGNAL_KEYS.filter((signal) => merged.signals[signal].status === "fail");
  const signalWarnings = RIG_SIGNAL_KEYS.filter((signal) => merged.signals[signal].status === "warn");
  const derivedFallbackCodes = uniqueStrings(
    RIG_SIGNAL_KEYS.flatMap((signal) => {
      const cell = merged.signals[signal];
      const values: string[] = [...cell.reasons];
      if (cell.sourceDetail) {
        values.push(cell.sourceDetail);
      }
      if (cell.source && cell.source !== "provider" && cell.source !== "local_vlm") {
        values.push(cell.source);
      }
      return values;
    })
  );
  merged.lowAnchorConfidence =
    merged.lowAnchorConfidence ||
    (merged.anchorConfidence !== null && merged.anchorConfidence < 0.55) ||
    merged.lowConfidenceAnchorIds.length > 0;
  merged.fallbackReasonCodes = uniqueStrings([...merged.fallbackReasonCodes, ...derivedFallbackCodes]);
  merged.rigReasonCodes = uniqueStrings([
    ...merged.rigReasonCodes,
    ...(merged.repairable === true ? ["repairable"] : []),
    ...(merged.reviewOnly ? ["review_only"] : []),
    ...(merged.lowAnchorConfidence ? ["low_anchor_confidence"] : []),
    ...(merged.lowConfidenceAnchorIds.length > 0 ? ["anchor_low_confidence"] : []),
    ...(merged.missingAnchorIds.length > 0 ? ["anchor_missing"] : []),
    ...signalFailures.map((signal) => `${signal}_below_threshold`),
    ...signalWarnings.map((signal) => `${signal}_near_threshold`)
  ]);
  merged.recreateRecommended =
    merged.recreateRecommended ||
    merged.suggestedAction === "recreate" ||
    merged.fallbackReasonCodes.some((code) => code.toLowerCase().includes("recreate")) ||
    (merged.reviewOnly && (merged.lowAnchorConfidence || signalFailures.length >= 2));
  if (merged.repairable === null) {
    merged.repairable =
      !merged.recreateRecommended &&
      (
        merged.reviewOnly ||
        merged.requiredManualSlots.length > 0 ||
        merged.repairSourceCandidateIds.length > 0 ||
        merged.repairLineageSummary.length > 0 ||
        merged.directiveFamilySummary.length > 0
      );
  } else if (merged.recreateRecommended) {
    merged.repairable = false;
  }
  merged.rigBlocked =
    merged.rigBlocked ||
    signalFailures.length > 0 ||
    merged.issueCodes.some((code) => code.includes("overall_below_threshold")) ||
    (merged.reviewOnly && merged.lowAnchorConfidence);
  if (!merged.suggestedAction && merged.recreateRecommended) {
    merged.suggestedAction = "recreate";
  }
  if (merged.suggestedAction) {
    merged.rigReasonCodes = uniqueStrings([...merged.rigReasonCodes, `suggested_action:${merged.suggestedAction}`]);
  }
  return merged;
}

function resolveRigCandidateScope(doc: JsonRecord, candidateId: string | null): JsonRecord | null {
  const candidates = recordList(doc.candidates);
  if (candidates.length === 0) {
    return null;
  }
  if (candidateId) {
    return candidates.find((candidate) => str(candidate.candidate_id) === candidateId) ?? null;
  }
  const selectedCandidateId = str(doc.selected_candidate_id);
  return (
    candidates.find((candidate) => candidate.selected === true) ??
    (selectedCandidateId ? candidates.find((candidate) => str(candidate.candidate_id) === selectedCandidateId) ?? null : null) ??
    candidates[0] ??
    null
  );
}

function resolveSidecarScorecardSource(
  doc: JsonRecord,
  candidateId: string | null
): { scorecard: JsonRecord; issues: JsonRecord[]; policy: JsonRecord | null; selectedCandidateId: string | null } | null {
  const runs = recordList(doc.runs);
  const finalRun = runs[runs.length - 1] ?? null;
  if (finalRun) {
    const selectedCandidateId = str(finalRun.selected_candidate_id) ?? str(doc.selected_candidate_id);
    const scorecards = recordList(finalRun.scorecards);
    const scorecardEntry =
      (candidateId ? scorecards.find((entry) => str(entry.candidate_id) === candidateId) ?? null : null) ??
      (selectedCandidateId ? scorecards.find((entry) => str(entry.candidate_id) === selectedCandidateId) ?? null : null) ??
      scorecards[0] ??
      null;
    const scorecard = isRecord(scorecardEntry?.scorecard) ? scorecardEntry.scorecard : null;
    if (scorecard) {
      return {
        scorecard,
        issues: recordList(finalRun.issues),
        policy: isRecord(doc.policy) ? doc.policy : null,
        selectedCandidateId
      };
    }
  }
  const scorecard = isRecord(doc.scorecard) ? doc.scorecard : null;
  return scorecard
    ? {
        scorecard,
        issues: recordList(doc.issues),
        policy: isRecord(doc.policy) ? doc.policy : null,
        selectedCandidateId: str(doc.selected_candidate_id)
      }
    : null;
}

function readRigSignalCell(scope: unknown, signal: RigSignalKey): RigSignalCell {
  return {
    score: firstNumberAtPaths(scope, [[`${signal}_score`], ["signals", signal, "score"]]),
    status: firstStringAtPaths(scope, [[`${signal}_status`], ["signals", signal, "status"]]),
    reasons: uniqueStrings(flattenStringArraysAtPaths(scope, [[`${signal}_reasons`], ["signals", signal, "reasons"]])),
    source: firstStringAtPaths(scope, [[`${signal}_source`], ["signals", signal, "evidence", "source"]]),
    sourceDetail: firstStringAtPaths(scope, [[`${signal}_source_detail`], ["signals", signal, "evidence", "source_detail"]])
  };
}

export function extractRigReviewState(doc: unknown, candidateId: string | null = null): RigReviewState {
  if (!isRecord(doc)) {
    return createEmptyRigReviewState();
  }

  const state = createEmptyRigReviewState();
  const candidateScope = resolveRigCandidateScope(doc, candidateId);
  const scopes = candidateScope ? [candidateScope, doc] : [doc];
  for (const scope of scopes) {
    for (const signal of RIG_SIGNAL_KEYS) {
      const cell = readRigSignalCell(scope, signal);
      if (state.signals[signal].score === null && cell.score !== null) {
        state.signals[signal].score = cell.score;
      }
      if (state.signals[signal].status === null && cell.status !== null) {
        state.signals[signal].status = cell.status;
      }
      state.signals[signal].reasons = uniqueStrings([...state.signals[signal].reasons, ...cell.reasons]);
      if (state.signals[signal].source === null && cell.source !== null) {
        state.signals[signal].source = cell.source;
      }
      if (state.signals[signal].sourceDetail === null && cell.sourceDetail !== null) {
        state.signals[signal].sourceDetail = cell.sourceDetail;
      }
      if (cell.source) {
        state.evidenceSources = uniqueStrings([...state.evidenceSources, cell.source]);
      }
    }

    const summaryRecord =
      (isRecord(scope) && (num(scope.overall) !== null || isRecord(scope.by_view) || isRecord(scope.byView)) ? scope : null) ??
      firstRecordAtPaths(scope, [
        ["anchor_confidence_summary"],
        ["anchorConfidenceSummary"],
        ["proposal", "auto_proposal", "anchor_confidence_summary"],
        ["proposal", "auto_proposal", "anchorConfidenceSummary"],
        ["reference_bundle", "anchor_confidence_summary"],
        ["reference_bundle", "anchorConfidenceSummary"]
      ]);
    if (summaryRecord) {
      const overall =
        num(summaryRecord.overall) ??
        averageNumbers(
          ["front", "threeQuarter", "profile"]
            .map((view) => num(isRecord(summaryRecord.by_view) ? summaryRecord.by_view[view] : undefined))
            .filter((value): value is number => value !== null)
        );
      if (state.anchorConfidence === null && overall !== null) {
        state.anchorConfidence = overall;
      }
      const byViewRecord = isRecord(summaryRecord.by_view) ? summaryRecord.by_view : isRecord(summaryRecord.byView) ? summaryRecord.byView : {};
      for (const view of ["front", "threeQuarter", "profile"] as const) {
        const viewValue = num(byViewRecord[view]);
        if (state.anchorByView[view] === undefined && viewValue !== null) {
          state.anchorByView[view] = viewValue;
        }
      }
    }

    state.lowConfidenceAnchorIds = uniqueStrings([
      ...state.lowConfidenceAnchorIds,
      ...flattenStringArraysAtPaths(scope, [
        ["anchor_review", "low_confidence_anchor_ids"],
        ["anchorReview", "lowConfidenceAnchorIds"],
        ["proposal", "auto_proposal", "anchor_review", "low_confidence_anchor_ids"],
        ["proposal", "auto_proposal", "anchorReview", "lowConfidenceAnchorIds"]
      ])
    ]);
    state.missingAnchorIds = uniqueStrings([
      ...state.missingAnchorIds,
      ...flattenStringArraysAtPaths(scope, [
        ["anchor_review", "missing_anchor_ids"],
        ["anchorReview", "missingAnchorIds"],
        ["proposal", "auto_proposal", "anchor_review", "missing_anchor_ids"],
        ["proposal", "auto_proposal", "anchorReview", "missingAnchorIds"]
      ])
    ]);
    state.reviewOnly =
      state.reviewOnly ||
      firstBooleanAtPaths(scope, [
        ["review_only"],
        ["reviewOnly"],
        ["proposal", "auto_proposal", "review_only"],
        ["proposal", "auto_proposal", "reviewOnly"]
      ]) === true;
    state.recreateRecommended =
      state.recreateRecommended ||
      firstBooleanAtPaths(scope, [
        ["recreate_recommended"],
        ["recreateRecommended"],
        ["proposal", "auto_proposal", "recreate_recommended"],
        ["proposal", "auto_proposal", "recreateRecommended"]
      ]) === true;
    if (state.repairable === null) {
      state.repairable = firstBooleanAtPaths(scope, [["repairable"], ["proposal", "auto_proposal", "repairable"]]);
    }
    if (state.speciesId === null) {
      state.speciesId = firstStringAtPaths(scope, [
        ["species_id"],
        ["speciesId"],
        ["reference_bundle", "species_id"],
        ["reference_bundle", "speciesId"],
        ["proposal", "auto_proposal", "species_id"],
        ["proposal", "auto_proposal", "speciesId"]
      ]);
    }
    if (state.selectedView === null) {
      state.selectedView = firstStringAtPaths(scope, [
        ["selected_view"],
        ["selectedView"],
        ["requested_reference_view"],
        ["requestedReferenceView"],
        ["reference_view"],
        ["referenceView"],
        ["proposal", "auto_proposal", "selected_view"],
        ["proposal", "auto_proposal", "selectedView"],
        ["proposal", "auto_proposal", "requested_reference_view"],
        ["proposal", "auto_proposal", "requestedReferenceView"]
      ]);
    }
    state.requiredManualSlots = uniqueStrings([
      ...state.requiredManualSlots,
      ...flattenStringArraysAtPaths(scope, [
        ["required_manual_slots"],
        ["requiredManualSlots"],
        ["proposal", "auto_proposal", "required_manual_slots"],
        ["proposal", "auto_proposal", "requiredManualSlots"]
      ])
    ]);
    state.repairSourceCandidateIds = uniqueStrings([
      ...state.repairSourceCandidateIds,
      ...flattenStringArraysAtPaths(scope, [
        ["repair_source_candidate_ids"],
        ["repairSourceCandidateIds"],
        ["repair_from_candidate_ids"],
        ["repairFromCandidateIds"],
        ["proposal", "auto_proposal", "repair_source_candidate_ids"],
        ["proposal", "auto_proposal", "repairSourceCandidateIds"],
        ["proposal", "auto_proposal", "repair_from_candidate_ids"],
        ["proposal", "auto_proposal", "repairFromCandidateIds"]
      ])
    ]);
    state.repairLineageSummary = uniqueStrings([
      ...state.repairLineageSummary,
      ...flattenStringArraysAtPaths(scope, [
        ["repair_lineage_summary"],
        ["repairLineageSummary"],
        ["proposal", "auto_proposal", "repair_lineage_summary"],
        ["proposal", "auto_proposal", "repairLineageSummary"]
      ])
    ]);
    state.directiveFamilySummary = uniqueStrings([
      ...state.directiveFamilySummary,
      ...flattenStringArraysAtPaths(scope, [
        ["directive_family_summary"],
        ["directiveFamilySummary"],
        ["proposal", "auto_proposal", "directive_family_summary"],
        ["proposal", "auto_proposal", "directiveFamilySummary"]
      ])
    ]);
    state.rigReasonFamilies = uniqueStrings([
      ...state.rigReasonFamilies,
      ...flattenStringArraysAtPaths(scope, [
        ["rig_reason_families"],
        ["rigReasonFamilies"],
        ["proposal", "auto_proposal", "rig_reason_families"],
        ["proposal", "auto_proposal", "rigReasonFamilies"]
      ])
    ]);
    if (state.anchorOverridePresent === null) {
      state.anchorOverridePresent = firstBooleanAtPaths(scope, [
        ["anchor_override_present"],
        ["anchorOverridePresent"],
        ["proposal", "auto_proposal", "anchor_override_present"],
        ["proposal", "auto_proposal", "anchorOverridePresent"]
      ]);
    } else if (
      firstBooleanAtPaths(scope, [
        ["anchor_override_present"],
        ["anchorOverridePresent"],
        ["proposal", "auto_proposal", "anchor_override_present"],
        ["proposal", "auto_proposal", "anchorOverridePresent"]
      ]) === true
    ) {
      state.anchorOverridePresent = true;
    }
    if (state.cropOverridePresent === null) {
      state.cropOverridePresent = firstBooleanAtPaths(scope, [
        ["crop_override_present"],
        ["cropOverridePresent"],
        ["crop_boxes_override_present"],
        ["cropBoxesOverridePresent"],
        ["proposal", "auto_proposal", "crop_override_present"],
        ["proposal", "auto_proposal", "cropOverridePresent"],
        ["proposal", "auto_proposal", "crop_boxes_override_present"],
        ["proposal", "auto_proposal", "cropBoxesOverridePresent"]
      ]);
    } else if (
      firstBooleanAtPaths(scope, [
        ["crop_override_present"],
        ["cropOverridePresent"],
        ["crop_boxes_override_present"],
        ["cropBoxesOverridePresent"],
        ["proposal", "auto_proposal", "crop_override_present"],
        ["proposal", "auto_proposal", "cropOverridePresent"],
        ["proposal", "auto_proposal", "crop_boxes_override_present"],
        ["proposal", "auto_proposal", "cropBoxesOverridePresent"]
      ]) === true
    ) {
      state.cropOverridePresent = true;
    }
    state.rigReasonCodes = uniqueStrings([
      ...state.rigReasonCodes,
      ...flattenStringArraysAtPaths(scope, [
        ["reason_codes"],
        ["reasonCodes"],
        ["rig_reason_codes"],
        ["rigReasonCodes"],
        ["details", "reason_codes"],
        ["details", "reasonCodes"]
      ])
    ]);
    state.fallbackReasonCodes = uniqueStrings([
      ...state.fallbackReasonCodes,
      ...flattenStringArraysAtPaths(scope, [
        ["fallback_reason_codes"],
        ["fallbackReasonCodes"],
        ["fallback_steps_applied"],
        ["details", "fallback_reason_codes"],
        ["details", "fallbackReasonCodes"]
      ]),
      ...(firstStringAtPaths(scope, [["fallback_reason"], ["fallbackReason"]]) ? [firstStringAtPaths(scope, [["fallback_reason"], ["fallbackReason"]])!] : [])
    ]);
    const suggestedAction = firstStringAtPaths(scope, [
      ["suggested_action"],
      ["suggestedAction"],
      ["proposal", "auto_proposal", "suggested_action"],
      ["proposal", "auto_proposal", "suggestedAction"]
    ]);
    if (state.suggestedAction === null && suggestedAction) {
      state.suggestedAction = suggestedAction;
    }
  }

  if (state.rigReasonFamilies.length === 0) {
    state.rigReasonFamilies = uniqueStrings(
      [...state.rigReasonCodes, ...state.fallbackReasonCodes].map((value) => {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return null;
        if (normalized.includes("anchor")) return "anchor";
        if (normalized.includes("mouth")) return "mouth";
        if (normalized.includes("eye")) return "eye";
        if (normalized.includes("head")) return "head_pose";
        if (normalized.includes("repair")) return "repair";
        if (normalized.includes("manual")) return "manual_slots";
        if (normalized.includes("recreate")) return "recreate";
        if (normalized.includes("override")) return "override";
        if (normalized.includes("review")) return "review";
        return normalized.split(/[:_]/)[0] ?? null;
      })
    );
  }

  const scorecardSource = resolveSidecarScorecardSource(doc, candidateId);
  if (scorecardSource) {
    for (const signal of RIG_SIGNAL_KEYS) {
      const standardized = readRecordAtPath(scorecardSource.scorecard, ["signals", signal]);
      if (!standardized) {
        continue;
      }
      const evidence = isRecord(standardized.evidence) ? standardized.evidence : {};
      state.signals[signal].score = num(standardized.score) ?? state.signals[signal].score;
      state.signals[signal].status = str(standardized.status) ?? state.signals[signal].status;
      state.signals[signal].reasons = uniqueStrings([
        ...state.signals[signal].reasons,
        ...readStringArrayAtPath(standardized, ["reasons"])
      ]);
      state.signals[signal].source = str(evidence.source) ?? state.signals[signal].source;
      state.signals[signal].sourceDetail = str(evidence.source_detail) ?? state.signals[signal].sourceDetail;
      if (state.signals[signal].source) {
        state.evidenceSources = uniqueStrings([...state.evidenceSources, state.signals[signal].source]);
      }
      const evidenceState = extractRigReviewState(evidence);
      const mergedEvidence = mergeRigReviewStates(state, evidenceState);
      state.anchorConfidence = mergedEvidence.anchorConfidence;
      state.anchorByView = mergedEvidence.anchorByView;
      state.lowConfidenceAnchorIds = mergedEvidence.lowConfidenceAnchorIds;
      state.missingAnchorIds = mergedEvidence.missingAnchorIds;
      state.reviewOnly = mergedEvidence.reviewOnly;
      state.recreateRecommended = mergedEvidence.recreateRecommended;
      state.repairable = mergedEvidence.repairable;
      state.rigReasonCodes = mergedEvidence.rigReasonCodes;
      state.rigReasonFamilies = mergedEvidence.rigReasonFamilies;
      state.fallbackReasonCodes = mergedEvidence.fallbackReasonCodes;
      state.issueCodes = mergedEvidence.issueCodes;
      state.evidenceSources = mergedEvidence.evidenceSources;
      state.speciesId = mergedEvidence.speciesId;
      state.selectedView = mergedEvidence.selectedView;
      state.requiredManualSlots = mergedEvidence.requiredManualSlots;
      state.repairSourceCandidateIds = mergedEvidence.repairSourceCandidateIds;
      state.repairLineageSummary = mergedEvidence.repairLineageSummary;
      state.directiveFamilySummary = mergedEvidence.directiveFamilySummary;
      state.anchorOverridePresent = mergedEvidence.anchorOverridePresent;
      state.cropOverridePresent = mergedEvidence.cropOverridePresent;
      state.suggestedAction = state.suggestedAction ?? mergedEvidence.suggestedAction;
    }

    const issueScopes =
      candidateId && scorecardSource.selectedCandidateId && candidateId !== scorecardSource.selectedCandidateId
        ? []
        : scorecardSource.issues;
    state.issueCodes = uniqueStrings([
      ...state.issueCodes,
      ...issueScopes.map((issue) => str(issue.code)).filter((value): value is string => Boolean(value))
    ]);
    state.rigReasonCodes = uniqueStrings([
      ...state.rigReasonCodes,
      ...issueScopes
        .map((issue) => str(issue.code))
        .filter((value): value is string => Boolean(value))
        .filter((value) => value.startsWith("selected_") || value === "selected_overall_below_threshold")
    ]);
    state.fallbackReasonCodes = uniqueStrings([
      ...state.fallbackReasonCodes,
      ...(scorecardSource.policy && str(scorecardSource.policy.escalation_reason)
        ? [str(scorecardSource.policy.escalation_reason)!]
        : []),
      ...issueScopes
        .map((issue) => firstStringAtPaths(issue, [["details", "reason"], ["details", "source_detail"]]))
        .filter((value): value is string => Boolean(value))
    ]);
  }

  return mergeRigReviewStates(state);
}

const rigReviewStateCache = new Map<string, RigReviewState>();

export function readRigReviewStateFromArtifactPath(filePath: string | null, candidateId: string | null = null): RigReviewState {
  if (!filePath) {
    return createEmptyRigReviewState();
  }
  const cacheKey = `${filePath}#${candidateId ?? "*"}`;
  const cached = rigReviewStateCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const state = extractRigReviewState(readJsonFileSafe(filePath), candidateId);
  rigReviewStateCache.set(cacheKey, state);
  return state;
}
