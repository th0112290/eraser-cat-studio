// @ts-nocheck

export async function runGenerationCompletionRuntime(input: any) {
  const {
    completePostScoreGeneration,
    referenceSourceManifestPath,
    generation,
    isRecord,
    parseManifestCandidate,
    selectionOutcome,
    acceptedScoreThreshold,
    autoRerouteDiagnostics,
    workflowStageRuns,
    promptBundle,
    mascotReferenceBankDiagnostics,
    mascotReferenceBankReviewPlan,
    mascotReferenceBankReviewChecklist,
    providerRunMeta,
    providerName,
    requestedProvider,
    providerWarning,
    clampedWarnings,
    providerWorkflowHash,
    providerGeneratedAt,
    ultraWorkflowEnabled,
    workflowTemplateVersion,
    episodeId,
    sessionId,
    characterPackId,
    continuityReferenceSessionId,
    starterReferencePath,
    starterReferencePathsByView,
    referenceAnalysis,
    continuitySnapshot,
    scored,
    requestedViews,
    writeGenerationProgress,
    summarizeBestScores,
    assessAutoSelectionRisk,
    assessQualityEmbargo,
    buildPackDefectSummary,
    assessFinalQualityFirewall,
    summarizeSelectionCandidateSummaryByView,
    resolveSelectionWorstRuntimeBucket,
    withManifestHashes,
    handleHitlRequiredSelection,
    getCharacterGenerationSessionDelegate,
    prisma,
    manifestPath,
    jobDbId,
    buildJobDbId,
    previewJobDbId,
    limits,
    budget,
    toPrismaJson,
    helpers,
    persistSelectedCandidates,
    episodeChannelId,
    character,
    maxAttempts,
    retryBackoffMs
  } = input;

  await completePostScoreGeneration({
    referenceSourceManifestPath,
    viewToGenerate: generation.viewToGenerate,
    isRecord,
    parseManifestCandidate,
    selectionOutcome: {
      selectedByView: selectionOutcome.selectedByView,
      missingGeneratedViews: selectionOutcome.missingGeneratedViews,
      lowQualityGeneratedViews: selectionOutcome.lowQualityGeneratedViews,
      packCoherence: selectionOutcome.packCoherence,
      rigStability: selectionOutcome.rigStability,
      coherenceIssues: selectionOutcome.coherenceIssues
    },
    acceptedScoreThreshold,
    autoRerouteDiagnostics,
    workflowStageRuns,
    promptBundle,
    mascotReferenceBankDiagnostics,
    mascotReferenceBankReviewPlan,
    mascotReferenceBankReviewChecklist,
    providerRunMeta,
    providerName,
    requestedProvider,
    providerWarning,
    clampedWarnings,
    providerWorkflowHash,
    providerGeneratedAt,
    generation,
    ultraWorkflowEnabled,
    workflowTemplateVersion,
    episodeId,
    sessionId,
    characterPackId,
    continuityReferenceSessionId,
    starterReferencePath,
    starterReferencePathsByView,
    referenceAnalysis,
    continuitySnapshot,
    scored,
    requestedViews,
    writeGenerationProgress,
    summarizeBestScores,
    resolveSelectionRisk: (flowInput: any) =>
      assessAutoSelectionRisk({
        selectedByView: flowInput.selectedByView,
        packCoherence: flowInput.packCoherence,
        rigStability: flowInput.rigStability,
        targetStyle: flowInput.targetStyle,
        acceptedScoreThreshold: flowInput.acceptedScoreThreshold,
        autoReroute: flowInput.autoReroute,
        speciesId: flowInput.speciesId
      }),
    resolveQualityEmbargo: (flowInput: any) =>
      assessQualityEmbargo({
        selectedByView: flowInput.selectedByView,
        rigStability: flowInput.rigStability,
        targetStyle: flowInput.targetStyle,
        acceptedScoreThreshold: flowInput.acceptedScoreThreshold,
        autoReroute: flowInput.autoReroute,
        speciesId: flowInput.speciesId
      }),
    buildPackDefectSummary: (flowInput: any) =>
      buildPackDefectSummary({
        selectedByView: flowInput.selectedByView,
        workflowStages: flowInput.workflowStages,
        speciesId: flowInput.speciesId
      }),
    resolveFinalQualityFirewall: (flowInput: any) =>
      assessFinalQualityFirewall({
        selectedByView: flowInput.selectedByView,
        targetStyle: flowInput.targetStyle,
        acceptedScoreThreshold: flowInput.acceptedScoreThreshold,
        autoReroute: flowInput.autoReroute,
        packCoherence: flowInput.packCoherence,
        rigStability: flowInput.rigStability,
        selectionRisk: flowInput.selectionRisk,
        qualityEmbargo: flowInput.qualityEmbargo,
        packDefectSummary: flowInput.packDefectSummary,
        speciesId: flowInput.speciesId
      }),
    summarizeSelectionCandidateSummaryByView: (flowInput: any) =>
      summarizeSelectionCandidateSummaryByView({
        selectedByView: flowInput.selectedByView,
        targetStyle: flowInput.targetStyle,
        acceptedScoreThreshold: flowInput.acceptedScoreThreshold
      }),
    resolveSelectionWorstRuntimeBucket: (flowInput: any) =>
      resolveSelectionWorstRuntimeBucket({
        selectedByView: flowInput.selectedByView,
        targetStyle: flowInput.targetStyle
      }),
    withManifestHashes: (manifestToHash: any) => withManifestHashes(manifestToHash),
    handleHitlSelection: async ({
      manifest,
      missingGeneratedViews,
      lowQualityGeneratedViews,
      coherenceIssues,
      packCoherence,
      initialRigStability,
      initialSelectionRisk,
      initialQualityEmbargo,
      initialFinalQualityFirewall
    }: any) => {
      const sessionDelegate = getCharacterGenerationSessionDelegate(prisma);
      await handleHitlRequiredSelection({
        manifest,
        manifestPath,
        providerName,
        providerWarning,
        scoredCandidateCount: scored.length,
        acceptedScoreThreshold,
        missingGeneratedViews,
        lowQualityGeneratedViews,
        coherenceIssues,
        packCoherence,
        rigStability: initialRigStability,
        selectionRisk: initialSelectionRisk,
        qualityEmbargo: initialQualityEmbargo,
        finalQualityFirewall: initialFinalQualityFirewall,
        autoReroute: autoRerouteDiagnostics,
        viewToGenerate: generation.viewToGenerate,
        mode: generation.mode,
        promptPresetId: promptBundle.presetId,
        sessionId,
        episodeId,
        jobDbId,
        buildJobDbId,
        previewJobDbId,
        limits: {
          maxCandidatesPerView: limits.maxCandidatesPerView,
          maxTotalImages: limits.maxTotalImages,
          maxRetries: limits.maxRetries
        },
        budget,
        writeGenerationProgress,
        createAgentSuggestion: async (entry: any) => {
          await prisma.agentSuggestion.create({
            data: {
              episodeId,
              jobId: jobDbId,
              type: "HITL_REVIEW",
              status: "PENDING",
              title: entry.title,
              summary: entry.summary,
              payload: toPrismaJson(entry.payload)
            }
          });
        },
        setJobStatus: helpers.setJobStatus,
        logJob: helpers.logJob,
        updateSessionReady: sessionDelegate
          ? async (statusMessage: string) => {
              await sessionDelegate.update({
                where: { id: sessionId },
                data: {
                  status: "READY",
                  statusMessage
                }
              });
            }
          : undefined
      });
    },
    persistAutoSelection: async ({ manifest, selectedByView }: any) => {
      await persistSelectedCandidates({
        prisma,
        sessionId,
        episodeId,
        episodeChannelId,
        jobDbId,
        character,
        selectedByView: {
          front: selectedByView.front,
          threeQuarter: selectedByView.threeQuarter,
          profile: selectedByView.profile
        },
        manifest,
        manifestPath,
        maxAttempts,
        retryBackoffMs,
        helpers,
        source: "auto",
        providerName,
        workflowHash: providerWorkflowHash
      });
    }
  });
}
