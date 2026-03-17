import {
  SIDECAR_SIGNAL_KEYS,
  buildSidecarScorecard,
  compareSidecarScorecards,
  countJudgeIssues,
  createJudgeCheck,
  createJudgeIssue,
  deriveSidecarFallbackSignal,
  resolveAdaptiveBestOfPolicy,
  type AdaptiveBestOfPolicyAudit,
  type AdaptiveBestOfPolicyConfig,
  type AdaptiveBestOfPolicyOverrides,
  type SidecarChannelDomain,
  type SidecarJudgeArtifact,
  type SidecarJudgeCandidateInput,
  type SidecarJudgeIssue,
  type SidecarJudgeRun,
  type SidecarJudgeRunCandidate,
  type SidecarJudgeSignalHint,
  type SidecarScorecard,
  type SidecarSignalKey
} from "./generatedSidecar";
import type { SidecarJudgeProvider, SidecarJudgeProviderResult } from "./localVlmJudgeProvider";

export type PremiumSidecarVisualJudgeInput = {
  shotId: string;
  candidates: SidecarJudgeCandidateInput[];
  provider: SidecarJudgeProvider;
  channelDomain?: SidecarChannelDomain;
  policyOverrides?: AdaptiveBestOfPolicyOverrides;
};

type CandidateEvaluation = {
  candidate: SidecarJudgeCandidateInput;
  providerResult: SidecarJudgeProviderResult;
  scorecard: SidecarScorecard;
};

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function resolveSignalHint(
  candidate: SidecarJudgeCandidateInput,
  providerResult: SidecarJudgeProviderResult,
  signal: SidecarSignalKey
): SidecarJudgeSignalHint {
  const providerSignal = providerResult.signals[signal];
  const candidateHint = candidate.signalHints?.[signal];
  const fallback = deriveSidecarFallbackSignal(candidate, signal, "judge");
  const providerEvidence = isRecord(providerSignal?.evidence) ? providerSignal.evidence : {};
  const candidateEvidence = isRecord(candidateHint?.evidence) ? candidateHint.evidence : {};
  const fallbackEvidence = isRecord(fallback.evidence) ? fallback.evidence : {};
  const primarySource =
    typeof providerSignal?.score === "number"
      ? providerEvidence.source ?? "provider"
      : typeof candidateHint?.score === "number"
        ? candidateEvidence.source ?? "candidate_hint"
        : fallbackEvidence.source ?? "heuristic";

  return {
    score: providerSignal?.score ?? candidateHint?.score ?? fallback.score ?? 0,
    confidence:
      providerSignal?.confidence ?? candidateHint?.confidence ?? providerResult.confidence ?? fallback.confidence ?? 0.5,
    reasons: uniqueStrings([...(providerSignal?.reasons ?? []), ...(candidateHint?.reasons ?? []), ...(fallback.reasons ?? [])]),
    evidence: {
      ...fallbackEvidence,
      ...candidateEvidence,
      ...providerEvidence,
      candidate_id: candidate.candidateId,
      source: primarySource
    }
  };
}

function sortEvaluations(evaluations: CandidateEvaluation[]): CandidateEvaluation[] {
  return [...evaluations].sort((left, right) => {
    const scoreComparison = compareSidecarScorecards(left.scorecard, right.scorecard);
    if (scoreComparison !== 0) {
      return scoreComparison;
    }
    return left.candidate.candidateId.localeCompare(right.candidate.candidateId);
  });
}

function selectionMargin(evaluations: CandidateEvaluation[]): number | null {
  const ranked = sortEvaluations(evaluations);
  if (ranked.length < 2) {
    return null;
  }
  return round(ranked[0]!.scorecard.overall_score - ranked[1]!.scorecard.overall_score);
}

function evaluateEscalationNeed(evaluations: CandidateEvaluation[], policy: AdaptiveBestOfPolicyConfig): string | null {
  if (evaluations.length < policy.initial_candidate_count) {
    return null;
  }

  const ranked = sortEvaluations(evaluations);
  const selected = ranked[0];
  if (!selected) {
    return "selected_candidate_missing";
  }
  if (!selected.scorecard.accepted) {
    return "selected_candidate_rejected";
  }
  if (selected.scorecard.overall_score < policy.escalation_overall_threshold) {
    return "selected_candidate_borderline";
  }
  if (selected.scorecard.confidence < policy.escalation_confidence_threshold) {
    return "judge_confidence_low";
  }

  const nearThresholdSignal = SIDECAR_SIGNAL_KEYS.find(
    (signal) =>
      selected.scorecard.signals[signal].score <
      selected.scorecard.signals[signal].threshold + policy.escalation_signal_buffer
  );
  if (nearThresholdSignal) {
    return `${nearThresholdSignal}_near_threshold`;
  }

  const margin = selectionMargin(ranked);
  if (margin !== null && margin < policy.escalation_margin_threshold) {
    return "selection_margin_low";
  }

  return null;
}

function buildRunIssues(input: {
  stage: string;
  shotId: string;
  evaluations: CandidateEvaluation[];
  policy: AdaptiveBestOfPolicyConfig;
  escalationReason: string | null;
}): SidecarJudgeIssue[] {
  const ranked = sortEvaluations(input.evaluations);
  const selected = ranked[0];
  const issues: SidecarJudgeIssue[] = [];

  if (input.escalationReason) {
    issues.push(
      createJudgeIssue("adaptive_best_of_3_triggered", "WARN", "Adaptive policy escalated candidate evaluation to best-of-3.", input.shotId, {
        reason: input.escalationReason
      })
    );
  }

  if (!selected) {
    issues.push(createJudgeIssue("selected_candidate_missing", "ERROR", "No sidecar candidate was evaluated.", input.shotId));
    return issues;
  }

  if (selected.scorecard.overall_score < input.policy.overall_pass_threshold) {
    issues.push(
      createJudgeIssue("selected_overall_below_threshold", "ERROR", "Selected candidate overall score is below the policy threshold.", input.shotId, {
        candidate_id: selected.candidate.candidateId,
        overall_score: selected.scorecard.overall_score,
        threshold: input.policy.overall_pass_threshold
      })
    );
  }

  for (const signal of SIDECAR_SIGNAL_KEYS) {
    const standardized = selected.scorecard.signals[signal];
    if (standardized.status === "fail") {
      issues.push(
      createJudgeIssue(`selected_${signal}_below_threshold`, "ERROR", `Selected candidate ${signal} score is below the policy threshold.`, input.shotId, {
          candidate_id: selected.candidate.candidateId,
          signal,
          score: standardized.score,
          threshold: standardized.threshold,
          confidence: standardized.confidence,
          source: standardized.evidence.source ?? null,
          anchor_confidence_summary: standardized.evidence.anchor_confidence_summary ?? null
        })
      );
      continue;
    }
    if (standardized.status === "warn") {
      issues.push(
        createJudgeIssue(`selected_${signal}_near_threshold`, "WARN", `Selected candidate ${signal} score is near the policy threshold.`, input.shotId, {
          candidate_id: selected.candidate.candidateId,
          signal,
          score: standardized.score,
          threshold: standardized.threshold,
          confidence: standardized.confidence,
          source: standardized.evidence.source ?? null,
          anchor_confidence_summary: standardized.evidence.anchor_confidence_summary ?? null
        })
      );
    }
  }

  const margin = selectionMargin(ranked);
  if (margin !== null && margin < input.policy.escalation_margin_threshold) {
    issues.push(
      createJudgeIssue("selection_margin_low", "WARN", "Top sidecar candidates are too close to be a clean winner.", input.shotId, {
        margin,
        threshold: input.policy.escalation_margin_threshold,
        ranked_candidate_ids: ranked.map((entry) => entry.candidate.candidateId)
      })
    );
  }

  if (selected.providerResult.confidence < input.policy.escalation_confidence_threshold) {
    issues.push(
      createJudgeIssue("judge_confidence_low", "WARN", "Provider confidence for the selected candidate is below the adaptive threshold.", input.shotId, {
        candidate_id: selected.candidate.candidateId,
        confidence: selected.providerResult.confidence,
        threshold: input.policy.escalation_confidence_threshold
      })
    );
  }

  return issues;
}

function buildRun(input: {
  stage: string;
  shotId: string;
  evaluations: CandidateEvaluation[];
  policy: AdaptiveBestOfPolicyConfig;
  escalationReason: string | null;
}): SidecarJudgeRun {
  const ranked = sortEvaluations(input.evaluations);
  const selected = ranked[0] ?? null;
  const issues = buildRunIssues(input);
  const counts = countJudgeIssues(issues);
  const margin = selectionMargin(ranked);
  const coveragePassed = input.evaluations.every((evaluation) =>
    SIDECAR_SIGNAL_KEYS.every((signal) => typeof evaluation.scorecard.signals[signal].score === "number")
  );

  return {
    stage: input.stage,
    checks: [
      createJudgeCheck(
        "provider_signal_coverage",
        coveragePassed,
        "ERROR",
        coveragePassed ? "All candidates have standardized sidecar signal scores." : "Missing signal scores."
      ),
      createJudgeCheck(
        "selected_candidate_thresholds",
        Boolean(selected?.scorecard.accepted),
        "ERROR",
        selected ? `selected=${selected.candidate.candidateId} overall=${selected.scorecard.overall_score.toFixed(2)}` : "No selected candidate."
      ),
      createJudgeCheck(
        "selection_margin",
        margin === null || margin >= input.policy.escalation_margin_threshold,
        "WARN",
        margin === null ? "Only one candidate was evaluated." : `margin=${margin.toFixed(2)}`
      )
    ],
    issues,
    passed: counts.errorCount === 0 && Boolean(selected?.scorecard.accepted),
    errorCount: counts.errorCount,
    warnCount: counts.warnCount,
    evaluated_candidate_ids: input.evaluations.map((evaluation) => evaluation.candidate.candidateId),
    ranked_candidate_ids: ranked.map((evaluation) => evaluation.candidate.candidateId),
    selected_candidate_id: selected?.candidate.candidateId ?? null,
    scorecards: ranked.map(
      (evaluation): SidecarJudgeRunCandidate => ({
        candidate_id: evaluation.candidate.candidateId,
        provider_summary: evaluation.providerResult.summary,
        provider_confidence: evaluation.providerResult.confidence,
        accepted: evaluation.scorecard.accepted,
        scorecard: evaluation.scorecard,
        raw_response: evaluation.providerResult.raw_response
      })
    ),
    policy_snapshot: input.policy
  };
}

async function evaluateCandidates(
  provider: SidecarJudgeProvider,
  candidates: SidecarJudgeCandidateInput[],
  policy: AdaptiveBestOfPolicyConfig
): Promise<CandidateEvaluation[]> {
  const evaluations: CandidateEvaluation[] = [];
  for (const candidate of candidates) {
    const providerResult = await provider.evaluateCandidate(candidate);
    const scorecard = buildSidecarScorecard({
      policy,
      signals: Object.fromEntries(
        SIDECAR_SIGNAL_KEYS.map((signal) => [signal, resolveSignalHint(candidate, providerResult, signal)])
      ) as Record<SidecarSignalKey, SidecarJudgeSignalHint>
    });
    evaluations.push({
      candidate,
      providerResult,
      scorecard
    });
  }
  return evaluations;
}

function buildPolicyAudit(input: {
  policy: AdaptiveBestOfPolicyConfig;
  candidates: SidecarJudgeCandidateInput[];
  initialCandidates: SidecarJudgeCandidateInput[];
  selectedCandidateId: string | null;
  escalationReason: string | null;
}): AdaptiveBestOfPolicyAudit {
  return {
    ...input.policy,
    attempted_candidate_ids: input.candidates.map((candidate) => candidate.candidateId),
    initial_candidate_ids: input.initialCandidates.map((candidate) => candidate.candidateId),
    escalated_to_best_of_3: input.escalationReason !== null,
    escalation_reason: input.escalationReason,
    selected_candidate_id: input.selectedCandidateId
  };
}

export async function runPremiumSidecarVisualJudge(
  input: PremiumSidecarVisualJudgeInput
): Promise<SidecarJudgeArtifact> {
  if (input.candidates.length === 0) {
    throw new Error("runPremiumSidecarVisualJudge requires at least one candidate.");
  }

  const channelDomain = input.channelDomain ?? "default";
  const policy = resolveAdaptiveBestOfPolicy(channelDomain, input.policyOverrides);
  const initialCandidates = input.candidates.slice(0, Math.min(policy.initial_candidate_count, input.candidates.length));
  const initialEvaluations = await evaluateCandidates(input.provider, initialCandidates, policy);
  const escalationReason =
    input.candidates.length > policy.initial_candidate_count
      ? evaluateEscalationNeed(initialEvaluations, policy)
      : null;

  const runs: SidecarJudgeRun[] = [];
  runs.push(
    buildRun({
      stage: "best_of_2",
      shotId: input.shotId,
      evaluations: initialEvaluations,
      policy,
      escalationReason
    })
  );

  let finalEvaluations = initialEvaluations;
  if (escalationReason !== null) {
    const escalatedCandidates = input.candidates.slice(0, Math.min(policy.max_candidate_count, input.candidates.length));
    finalEvaluations = await evaluateCandidates(input.provider, escalatedCandidates.slice(initialCandidates.length), policy).then(
      (tail) => [...initialEvaluations, ...tail]
    );
    runs.push(
      buildRun({
        stage: "best_of_3",
        shotId: input.shotId,
        evaluations: finalEvaluations,
        policy,
        escalationReason
      })
    );
  }

  const finalRun = runs[runs.length - 1]!;
  const finalRanked = sortEvaluations(finalEvaluations);
  const selectedCandidateId = finalRanked[0]?.candidate.candidateId ?? null;

  return {
    schema_version: "1.0",
    artifact_kind: "sidecar_visual_judge",
    generated_at: new Date().toISOString(),
    final_passed: finalRun.passed,
    final_stage: finalRun.stage,
    fallback_steps_applied: escalationReason ? ["adaptive_best_of_3"] : [],
    selected_candidate_id: selectedCandidateId,
    attempt_count: finalEvaluations.length,
    provider: input.provider.descriptor,
    policy: buildPolicyAudit({
      policy,
      candidates: finalEvaluations.map((evaluation) => evaluation.candidate),
      initialCandidates,
      selectedCandidateId,
      escalationReason
    }),
    runs
  };
}
