export function initializeGenerationReviewState(input: any) {
  const repairEmbargoedCandidateIdsByView: Record<string, Set<string>> = {};
  const repairEmbargoedFallbackViews = new Set<string>();

  const isRepairEmbargoedSelection = (view: any, candidate: any) => {
    if (repairEmbargoedCandidateIdsByView[view]?.has(candidate.candidate.id)) {
      return true;
    }
    return repairEmbargoedFallbackViews.has(view);
  };

  const summarizeBestScores = (views: any[]) => {
    const bestByView = input.groupBestByView(input.scored);
    return Object.fromEntries(
      views.map((view) => [
        view,
        bestByView[view]
          ? {
              score: Number(bestByView[view].score.toFixed(4)),
              warnings: bestByView[view].warnings.length,
              rejections: bestByView[view].rejections.length
            }
          : null
      ])
    );
  };

  const recordSideViewAcceptanceGateStage = (stageInput: any) => {
    const stageBestCandidateSummaryByView = input.summarizeStageBestCandidateByView({
      views: stageInput.views,
      bestByView: stageInput.selectedByView,
      acceptedScoreThreshold: input.acceptedScoreThreshold,
      targetStyle: input.targetStyle,
      speciesId: input.speciesId
    });
    const stageObservedDefectFamiliesByView = input.summarizeObservedDefectFamiliesByView({
      views: stageInput.views,
      bestByView: stageInput.selectedByView
    });
    const stageExitSummary = input.summarizeStageExitByView(stageBestCandidateSummaryByView);
    const runtimeVariantTags = input.dedupeStrings(
      Object.values(stageInput.gateDecisionsByView)
        .flatMap((summary: any) => (summary.chosenStage ? [`chosen:${summary.chosenStage}`] : []))
        .filter((entry: string) => entry.length > 0)
    );
    input.workflowStageRuns.push({
      stage: "side_view_acceptance_gate",
      templateVersion: "synthetic_side_view_acceptance_gate_v1",
      ...(stageInput.origin ? { origin: stageInput.origin } : {}),
      ...(stageInput.passLabel ? { passLabel: stageInput.passLabel } : {}),
      ...(Array.isArray(stageInput.reasonCodes) && stageInput.reasonCodes.length > 0
        ? { reasonCodes: stageInput.reasonCodes }
        : {}),
      ...(Array.isArray(stageInput.triggerViews) && stageInput.triggerViews.length > 0
        ? { triggerViews: stageInput.triggerViews }
        : {}),
      ...(typeof stageInput.seedOffset === "number" ? { seedOffset: stageInput.seedOffset } : {}),
      views: stageInput.views,
      candidateCount: 3,
      acceptedScoreThreshold: Number(input.acceptedScoreThreshold.toFixed(4)),
      roundsAttempted: 1,
      ...(stageObservedDefectFamiliesByView ? { observedDefectFamiliesByView: stageObservedDefectFamiliesByView } : {}),
      ...stageExitSummary,
      ...(runtimeVariantTags.length > 0 ? { runtimeVariantTags } : {}),
      ...(stageBestCandidateSummaryByView ? { bestCandidateSummaryByView: stageBestCandidateSummaryByView } : {}),
      ...(Object.keys(stageInput.gateDecisionsByView).length > 0
        ? { gateDecisionsByView: stageInput.gateDecisionsByView }
        : {})
    });
  };

  const applyRepairEmbargoDecisions = (views: any[], repairTriageByView: Record<string, any>) => {
    for (const view of input.dedupeCharacterViews(views)) {
      const triage = repairTriageByView[view];
      if (!triage) continue;
      if (triage.decision === "reject_view") {
        const sourceCandidateId =
          typeof triage.sourceCandidateId === "string" && triage.sourceCandidateId.trim().length > 0
            ? triage.sourceCandidateId.trim()
            : undefined;
        if (sourceCandidateId) {
          const existing = repairEmbargoedCandidateIdsByView[view] ?? new Set();
          existing.add(sourceCandidateId);
          repairEmbargoedCandidateIdsByView[view] = existing;
          repairEmbargoedFallbackViews.delete(view);
        } else {
          repairEmbargoedFallbackViews.add(view);
        }
      } else {
        repairEmbargoedFallbackViews.delete(view);
      }
    }
  };

  const recordRepairTriageGateStage = (stageInput: any) => {
    const stageBestCandidateSummaryByView = input.summarizeStageBestCandidateByView({
      views: stageInput.views,
      bestByView: stageInput.selectedByView,
      acceptedScoreThreshold: input.acceptedScoreThreshold,
      targetStyle: input.targetStyle,
      speciesId: input.speciesId
    });
    const stageObservedDefectFamiliesByView = input.summarizeObservedDefectFamiliesByView({
      views: stageInput.views,
      bestByView: stageInput.selectedByView
    });
    const stageExitSummary = input.summarizeStageExitByView(stageBestCandidateSummaryByView);
    const runtimeVariantTags = input.dedupeStrings(
      Object.values(stageInput.repairTriageByView)
        .map((summary: any) => `triage:${summary.decision}`)
        .filter((entry: string) => entry.length > 0)
    );
    input.workflowStageRuns.push({
      stage: "repair_triage_gate",
      templateVersion: "synthetic_repair_triage_gate_v1",
      ...(stageInput.origin ? { origin: stageInput.origin } : {}),
      ...(stageInput.passLabel ? { passLabel: stageInput.passLabel } : {}),
      ...(Array.isArray(stageInput.reasonCodes) && stageInput.reasonCodes.length > 0
        ? { reasonCodes: stageInput.reasonCodes }
        : {}),
      ...(Array.isArray(stageInput.triggerViews) && stageInput.triggerViews.length > 0
        ? { triggerViews: stageInput.triggerViews }
        : {}),
      ...(typeof stageInput.seedOffset === "number" ? { seedOffset: stageInput.seedOffset } : {}),
      views: stageInput.views,
      candidateCount: 1,
      acceptedScoreThreshold: Number(input.acceptedScoreThreshold.toFixed(4)),
      roundsAttempted: 1,
      ...(stageObservedDefectFamiliesByView ? { observedDefectFamiliesByView: stageObservedDefectFamiliesByView } : {}),
      ...stageExitSummary,
      ...(runtimeVariantTags.length > 0 ? { runtimeVariantTags } : {}),
      ...(stageBestCandidateSummaryByView ? { bestCandidateSummaryByView: stageBestCandidateSummaryByView } : {}),
      ...(Object.keys(stageInput.repairTriageByView).length > 0
        ? { repairTriageByView: stageInput.repairTriageByView }
        : {})
    });
  };

  const recordPostRepairAcceptanceGateStage = (stageInput: any) => {
    const stageBestCandidateSummaryByView = input.summarizeStageBestCandidateSummaryByView
      ? input.summarizeStageBestCandidateSummaryByView({
          views: stageInput.views,
          bestByView: stageInput.selectedByView,
          acceptedScoreThreshold: input.acceptedScoreThreshold,
          targetStyle: input.targetStyle,
          speciesId: input.speciesId
        })
      : input.summarizeStageBestCandidateByView({
          views: stageInput.views,
          bestByView: stageInput.selectedByView,
          acceptedScoreThreshold: input.acceptedScoreThreshold,
          targetStyle: input.targetStyle,
          speciesId: input.speciesId
        });
    const stageObservedDefectFamiliesByView = input.summarizeObservedDefectFamiliesByView({
      views: stageInput.views,
      bestByView: stageInput.selectedByView
    });
    const stageExitSummary = input.summarizeStageExitByView(stageBestCandidateSummaryByView);
    const runtimeVariantTags = input.dedupeStrings(
      Object.values(stageInput.repairAcceptanceByView)
        .flatMap((summary: any) =>
          summary.chosenStage
            ? [`chosen:${summary.chosenStage}`, `repair_accept:${summary.decision}`]
            : [`repair_accept:${summary.decision}`]
        )
        .filter((entry: string) => entry.length > 0)
    );
    input.workflowStageRuns.push({
      stage: "post_repair_acceptance_gate",
      templateVersion: "synthetic_post_repair_acceptance_gate_v1",
      ...(stageInput.origin ? { origin: stageInput.origin } : {}),
      ...(stageInput.passLabel ? { passLabel: stageInput.passLabel } : {}),
      ...(Array.isArray(stageInput.reasonCodes) && stageInput.reasonCodes.length > 0
        ? { reasonCodes: stageInput.reasonCodes }
        : {}),
      ...(Array.isArray(stageInput.triggerViews) && stageInput.triggerViews.length > 0
        ? { triggerViews: stageInput.triggerViews }
        : {}),
      ...(typeof stageInput.seedOffset === "number" ? { seedOffset: stageInput.seedOffset } : {}),
      views: stageInput.views,
      candidateCount: 1,
      acceptedScoreThreshold: Number(
        (
          typeof stageInput.acceptedScoreThresholdOverride === "number"
            ? stageInput.acceptedScoreThresholdOverride
            : input.acceptedScoreThreshold
        ).toFixed(4)
      ),
      roundsAttempted: 1,
      ...(stageObservedDefectFamiliesByView ? { observedDefectFamiliesByView: stageObservedDefectFamiliesByView } : {}),
      ...stageExitSummary,
      ...(runtimeVariantTags.length > 0 ? { runtimeVariantTags } : {}),
      ...(stageBestCandidateSummaryByView ? { bestCandidateSummaryByView: stageBestCandidateSummaryByView } : {}),
      ...(Object.keys(stageInput.repairAcceptanceByView).length > 0
        ? { repairAcceptanceByView: stageInput.repairAcceptanceByView }
        : {})
    });
  };

  return {
    isRepairEmbargoedSelection,
    summarizeBestScores,
    recordSideViewAcceptanceGateStage,
    applyRepairEmbargoDecisions,
    recordRepairTriageGateStage,
    recordPostRepairAcceptanceGateStage
  };
}
